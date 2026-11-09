-- =============================================================================
-- ZÉLL-V Lucky Draw — 007 Golden Envelope + redeemable vouchers
-- Run after 006. Safe on a live database (adds tables, triggers, RPCs).
--
-- Golden Envelope: one per invoice with 4 or more PAID boxes on that invoice
-- (invoices.paid_boxes already stores package boxes × quantity). Not 4
-- transactions, and not a running total across invoices. Top-ups count when
-- the boxes on that top-up invoice are 4+. Voucher / Cellular Therapy
-- invoices have 0 boxes, so they do not qualify.
--
-- The customer opens the envelope on their wallet link. The server draws one gift.
-- The choice issues a voucher. A lucky-draw win also issues a voucher.
-- Redeem is a second step on the wallet (staff confirm on the customer's phone).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Catalogue of gifts inside the envelope
-- -----------------------------------------------------------------------------
create table if not exists public.envelope_prizes (
  code     text primary key,
  name_zh  text not null,
  name_en  text not null,
  offer_zh text not null,
  offer_en text not null,
  sort     int  not null,
  active   boolean not null default true
);

insert into public.envelope_prizes (code, name_zh, name_en, offer_zh, offer_en, sort) values
  ('SERUM',    '精华液',         'Serum',         '只需 RM68', 'Only RM68', 10),
  ('CREAM',    '面霜',           'Cream',         '只需 RM68', 'Only RM68', 20),
  ('BEVITE',   'Bevite',         'Bevite',        '只需 RM68', 'Only RM68', 30),
  ('BEJOJOBA', 'Bejojoba',       'Bejojoba',      '只需 RM68', 'Only RM68', 40),
  ('SHEEP',    'ZÉLL-V Sheep',   'ZÉLL-V Sheep',  '免费',      'Free',      50),
  ('VIT_D',    '维他命 D',       'Vitamin D',     '免费',      'Free',      60)
on conflict (code) do update set
  name_zh = excluded.name_zh, name_en = excluded.name_en,
  offer_zh = excluded.offer_zh, offer_en = excluded.offer_en,
  sort = excluded.sort;

-- -----------------------------------------------------------------------------
-- One envelope per qualifying invoice. Pending until the customer opens it.
-- -----------------------------------------------------------------------------
create table if not exists public.golden_envelopes (
  id           bigint generated always as identity primary key,
  customer_id  uuid not null references public.customers(id),
  invoice_id   bigint not null unique references public.invoices(id),
  paid_boxes   int  not null check (paid_boxes >= 4),
  status       text not null default 'pending' check (status in ('pending', 'claimed', 'cancelled')),
  prize_code   text references public.envelope_prizes(code),
  opened_at    timestamptz,
  claimed_at   timestamptz,
  cancelled_at timestamptz,
  created_at   timestamptz not null default now(),
  check (status <> 'claimed' or prize_code is not null)
);
create index if not exists golden_envelopes_customer_idx on public.golden_envelopes (customer_id);

-- -----------------------------------------------------------------------------
-- Vouchers the customer shows a salesperson. Never deleted.
-- -----------------------------------------------------------------------------
create table if not exists public.vouchers (
  id                 bigint generated always as identity primary key,
  customer_id        uuid not null references public.customers(id),
  kind               text not null check (kind in ('golden_envelope', 'lucky_draw')),
  code               text not null unique,
  title_zh           text not null,
  title_en           text not null,
  detail_zh          text not null default '',
  detail_en          text not null default '',
  prize_code         text,
  golden_envelope_id bigint unique references public.golden_envelopes(id),
  winner_id          bigint unique references public.winners(id),
  status             text not null default 'issued' check (status in ('issued', 'redeemed', 'voided')),
  issued_at          timestamptz not null default now(),
  redeemed_at        timestamptz,
  voided_at          timestamptz,
  void_reason        text,
  check (
    (kind = 'golden_envelope' and golden_envelope_id is not null and winner_id is null)
    or (kind = 'lucky_draw' and winner_id is not null and golden_envelope_id is null)
  )
);
create index if not exists vouchers_customer_idx on public.vouchers (customer_id);

alter table public.envelope_prizes  enable row level security;
alter table public.golden_envelopes enable row level security;
alter table public.vouchers         enable row level security;
revoke all on public.envelope_prizes  from public, anon, authenticated;
revoke all on public.golden_envelopes from public, anon, authenticated;
revoke all on public.vouchers         from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public._new_voucher_code(p_prefix text)
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_i int;
  v_try int := 0;
begin
  loop
    v_try := v_try + 1;
    v_code := p_prefix || '-';
    for v_i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % length(alphabet)), 1);
    end loop;
    exit when not exists (select 1 from public.vouchers where code = v_code);
    if v_try > 20 then
      raise exception '无法生成礼券编号 / Could not generate a voucher code';
    end if;
  end loop;
  return v_code;
end;
$$;

create or replace function public._sync_envelope_for_invoice()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  e public.golden_envelopes;
begin
  if new.voided_at is not null then
    select * into e from public.golden_envelopes where invoice_id = new.id;
    if found and e.status = 'pending' then
      update public.golden_envelopes
         set status = 'cancelled', cancelled_at = now()
       where id = e.id;
    elsif found and e.status = 'claimed' then
      update public.vouchers
         set status = 'voided', voided_at = now(), void_reason = 'Invoice voided'
       where golden_envelope_id = e.id and status = 'issued';
    end if;
    return new;
  end if;

  if coalesce(new.paid_boxes, 0) >= 4 then
    insert into public.golden_envelopes (customer_id, invoice_id, paid_boxes)
    values (new.customer_id, new.id, new.paid_boxes)
    on conflict (invoice_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists golden_envelope_on_invoice on public.invoices;
create trigger golden_envelope_on_invoice
  after insert or update of voided_at, paid_boxes on public.invoices
  for each row execute function public._sync_envelope_for_invoice();

create or replace function public._sync_winner_voucher()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  cat public.prize_categories;
  rd  public.rounds;
  v_title_zh text;
  v_title_en text;
  v_detail text;
begin
  if tg_op = 'INSERT' and new.status = 'won' then
    select * into cat from public.prize_categories where id = new.prize_category_id;
    if not found then
      return new;
    end if;
    select * into rd from public.rounds where id = cat.round_id;
    if cat.is_grand or rd.id is null then
      v_title_zh := cat.name_zh;
      v_title_en := cat.name_en;
    else
      v_title_zh := rd.code || ' · ' || cat.name_zh;
      v_title_en := rd.code || ' · ' || cat.name_en;
    end if;
    v_detail := coalesce(cat.prize_desc, '');
    insert into public.vouchers (
      customer_id, kind, code, title_zh, title_en, detail_zh, detail_en, winner_id
    ) values (
      new.customer_id, 'lucky_draw', public._new_voucher_code('LD'),
      v_title_zh, v_title_en, v_detail, v_detail, new.id
    )
    on conflict (winner_id) do nothing;
  elsif tg_op = 'UPDATE' and old.status = 'won' and new.status = 'forfeited' then
    update public.vouchers
       set status = 'voided', voided_at = now(), void_reason = 'Prize forfeited'
     where winner_id = new.id and status = 'issued';
  end if;
  return new;
end;
$$;

drop trigger if exists vouchers_on_winner on public.winners;
create trigger vouchers_on_winner
  after insert or update of status on public.winners
  for each row execute function public._sync_winner_voucher();

-- Existing qualifying invoices and wins (no-op when already present).
insert into public.golden_envelopes (customer_id, invoice_id, paid_boxes)
select i.customer_id, i.id, i.paid_boxes
from public.invoices i
where i.voided_at is null and i.paid_boxes >= 4
on conflict (invoice_id) do nothing;

insert into public.vouchers (customer_id, kind, code, title_zh, title_en, detail_zh, detail_en, winner_id)
select w.customer_id, 'lucky_draw', public._new_voucher_code('LD'),
       case when pc.is_grand or rd.id is null then pc.name_zh else rd.code || ' · ' || pc.name_zh end,
       case when pc.is_grand or rd.id is null then pc.name_en else rd.code || ' · ' || pc.name_en end,
       coalesce(pc.prize_desc, ''), coalesce(pc.prize_desc, ''), w.id
from public.winners w
join public.prize_categories pc on pc.id = w.prize_category_id
left join public.rounds rd on rd.id = pc.round_id
where w.status = 'won'
  and not exists (select 1 from public.vouchers v where v.winner_id = w.id);

-- -----------------------------------------------------------------------------
-- Wallet extras (appended onto the existing payload)
-- -----------------------------------------------------------------------------
create or replace function public._golden_state(p_customer uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'min_boxes', 4,
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ge.id,
               'paid_boxes', ge.paid_boxes,
               'invoice_no', i.invoice_no,
               'invoice_date', i.invoice_date,
               'round_code', r.code
             ) order by i.invoice_date, ge.id)
      from public.golden_envelopes ge
      join public.invoices i on i.id = ge.invoice_id
      join public.rounds r on r.id = i.round_id
      where ge.customer_id = p_customer and ge.status = 'pending'
    ), '[]'::jsonb),
    'prizes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', ep.code, 'name_zh', ep.name_zh, 'name_en', ep.name_en,
               'offer_zh', ep.offer_zh, 'offer_en', ep.offer_en
             ) order by ep.sort)
      from public.envelope_prizes ep
      where ep.active
    ), '[]'::jsonb)
  );
$$;

create or replace function public._voucher_list(p_customer uuid, p_include_voided boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id,
           'kind', v.kind,
           'code', v.code,
           'title_zh', v.title_zh,
           'title_en', v.title_en,
           'detail_zh', v.detail_zh,
           'detail_en', v.detail_en,
           'status', v.status,
           'issued_at', v.issued_at,
           'redeemed_at', v.redeemed_at,
           'golden_envelope_id', v.golden_envelope_id,
           'round_code', rd.code
         ) order by v.issued_at desc, v.id desc), '[]'::jsonb)
  from public.vouchers v
  left join public.winners w on w.id = v.winner_id
  left join public.prize_categories pc on pc.id = w.prize_category_id
  left join public.rounds rd on rd.id = pc.round_id
  where v.customer_id = p_customer
    and (p_include_voided or v.status <> 'voided');
$$;

-- Keep the draw/ticket payload, and attach envelopes + vouchers.
do $$
begin
  if to_regprocedure('public._wallet_payload_core(uuid)') is null then
    alter function public._wallet_payload(uuid) rename to _wallet_payload_core;
  end if;
end $$;

create or replace function public._wallet_payload(p_customer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return public._wallet_payload_core(p_customer) || jsonb_build_object(
    'golden', public._golden_state(p_customer),
    'vouchers', public._voucher_list(p_customer, false)
  );
end;
$$;

do $$
begin
  if to_regprocedure('public.admin_customer_detail_core(uuid)') is null then
    alter function public.admin_customer_detail(uuid) rename to admin_customer_detail_core;
  end if;
end $$;

create or replace function public.admin_customer_detail(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return public.admin_customer_detail_core(p_customer_id) || jsonb_build_object(
    'vouchers', public._voucher_list(p_customer_id, true)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Customer actions (wallet token, same trust model as get_wallet)
-- -----------------------------------------------------------------------------
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

-- Kept so an older page cannot choose a gift. The code is ignored; the server draws.
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

create or replace function public.redeem_voucher(p_token text, p_voucher_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.customers;
  v public.vouchers;
begin
  c := public._customer_by_token(p_token, true);
  if c.pdpa_consent_at is null then
    raise exception '请先同意个人资料保护声明 / Please accept the PDPA notice first';
  end if;

  select * into v from public.vouchers where id = p_voucher_id for update;
  if not found or v.customer_id <> c.id then
    raise exception '找不到礼券 / Voucher not found';
  end if;
  if v.status = 'redeemed' then
    raise exception '此礼券已兑现 / This voucher is already redeemed';
  end if;
  if v.status <> 'issued' then
    raise exception '此礼券不能兑现 / This voucher cannot be redeemed';
  end if;

  update public.vouchers
     set status = 'redeemed', redeemed_at = now()
   where id = v.id;

  return public._wallet_payload(c.id);
end;
$$;

revoke execute on function public._new_voucher_code(text)                         from public, anon, authenticated;
revoke execute on function public._sync_envelope_for_invoice()                    from public, anon, authenticated;
revoke execute on function public._sync_winner_voucher()                          from public, anon, authenticated;
revoke execute on function public._golden_state(uuid)                             from public, anon, authenticated;
revoke execute on function public._voucher_list(uuid, boolean)                    from public, anon, authenticated;
revoke execute on function public._wallet_payload_core(uuid)                      from public, anon, authenticated;
revoke execute on function public._wallet_payload(uuid)                           from public, anon, authenticated;
revoke execute on function public.admin_customer_detail_core(uuid)                from public, anon, authenticated;
revoke execute on function public.admin_customer_detail(uuid)                     from public, anon, authenticated;
revoke execute on function public.open_golden_envelope(text, bigint)              from public, anon, authenticated;
revoke execute on function public.choose_envelope_prize(text, bigint, text)       from public, anon, authenticated;
revoke execute on function public.redeem_voucher(text, bigint)                    from public, anon, authenticated;

grant execute on function public.admin_customer_detail(uuid)               to authenticated;
grant execute on function public.open_golden_envelope(text, bigint)        to anon, authenticated;
grant execute on function public.choose_envelope_prize(text, bigint, text) to anon, authenticated;
grant execute on function public.redeem_voucher(text, bigint)              to anon, authenticated;
