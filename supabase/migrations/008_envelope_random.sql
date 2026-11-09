-- =============================================================================
-- ZÉLL-V Lucky Draw — 008 Golden Envelope draws a gift at random
-- Run after 007. Safe on a live database.
-- The customer no longer chooses. Opening an envelope draws one active gift
-- with equal probability. choose_envelope_prize still exists but ignores the
-- requested prize and draws the same way.
-- =============================================================================

create or replace function public.open_golden_envelope(p_token text, p_envelope_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  c public.customers;
  e public.golden_envelopes;
  p public.envelope_prizes;
  v_n int;
  v_idx int;
begin
  c := public._customer_by_token(p_token, true);
  if c.pdpa_consent_at is null then
    raise exception '请先同意个人资料保护声明 / Please accept the PDPA notice first';
  end if;

  select * into e from public.golden_envelopes where id = p_envelope_id for update;
  if not found or e.customer_id <> c.id or e.status <> 'pending' then
    raise exception '这份黄金信封不能开启 / This Golden Envelope is not available';
  end if;

  select count(*)::int into v_n from public.envelope_prizes where active;
  if v_n = 0 then
    raise exception '没有可抽取的礼品 / No gifts are available';
  end if;
  v_idx := public._secure_random_below(v_n)::int;

  select * into p
  from public.envelope_prizes
  where active
  order by sort, code
  offset v_idx
  limit 1;

  update public.golden_envelopes
     set status = 'claimed', prize_code = p.code,
         claimed_at = now(), opened_at = coalesce(opened_at, now())
   where id = e.id;

  insert into public.vouchers (
    customer_id, kind, code, title_zh, title_en, detail_zh, detail_en, prize_code, golden_envelope_id
  ) values (
    c.id, 'golden_envelope', public._new_voucher_code('GE'),
    p.name_zh, p.name_en, p.offer_zh, p.offer_en, p.code, e.id
  );

  return public._wallet_payload(c.id);
end;
$$;

create or replace function public.choose_envelope_prize(p_token text, p_envelope_id bigint, p_prize_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.open_golden_envelope(p_token, p_envelope_id);
end;
$$;

revoke execute on function public.open_golden_envelope(text, bigint)        from public, anon, authenticated;
revoke execute on function public.choose_envelope_prize(text, bigint, text) from public, anon, authenticated;
grant execute on function public.open_golden_envelope(text, bigint)        to anon, authenticated;
grant execute on function public.choose_envelope_prize(text, bigint, text) to anon, authenticated;
