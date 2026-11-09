-- =============================================================================
-- ZÉLL-V Lucky Draw — 004 draw + admin (M2)
-- Run after 001–003 (+ seed). Safe on a live database: adds columns and
-- functions only; no data is changed or deleted.
--
-- Draw rules implemented here (see CLAUDE.md):
--   * weighted random by ticket count, secure random (pgcrypto) on the server
--   * a customer wins each prize tier (rank) at most once in the whole event
--     ** SUPERSEDED by 005_win_rules.sql: winners may win any tier again in a
--        later round; only the same prize category can't be won twice **
--   * different tiers are allowed (same round or later), incl. Grand Prize
--   * forfeit → slot reopens; the forfeited customer is excluded from that
--     category for good (they may still win the same tier in another round)
--   * every draw is logged (who, when, pool size, total tickets, random value,
--     pool hash so the result can be re-verified)
-- Confirmed defaults:
--   * round draws open after that round's allocation deadline; the Grand draw
--     opens after the last deadline AND once the last round's prizes are done
--     (switch off with app_settings.enforce_draw_schedule for dry runs)
--   * voided tickets come out of the unallocated balance first, then out of
--     allocations starting from 4th prize ("effective allocations")
--   * winners show on customer wallets immediately
-- =============================================================================

alter table public.app_settings
  add column if not exists enforce_draw_schedule boolean not null default true;

-- -----------------------------------------------------------------------------
-- Effective allocations for a round: allocations capped by non-voided grants.
-- Excess (only possible after a void) is removed from 4th, then 3rd, then 2nd.
-- -----------------------------------------------------------------------------
create or replace function public._effective_allocations(p_round_id int)
returns table (customer_id uuid, prize_category_id int, prize_rank smallint, allocated int, effective int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with a as (
    select al.customer_id, al.prize_category_id, pc.rank as prize_rank, sum(al.tickets)::int as allocated
    from public.allocations al
    join public.prize_categories pc on pc.id = al.prize_category_id
    where al.round_id = p_round_id
    group by al.customer_id, al.prize_category_id, pc.rank
  ),
  g as (
    select tg.customer_id, sum(tg.tickets)::int as granted
    from public.ticket_grants tg
    where tg.round_id = p_round_id and tg.voided_at is null
    group by tg.customer_id
  ),
  c as (
    select a.*, coalesce(g.granted, 0) as granted,
           coalesce(sum(a.allocated) over (partition by a.customer_id order by a.prize_rank
                                           rows between unbounded preceding and 1 preceding), 0) as before
    from a left join g on g.customer_id = a.customer_id
  )
  select c.customer_id, c.prize_category_id, c.prize_rank, c.allocated,
         greatest(0, least(c.allocated, c.granted - c.before))::int
  from c
$$;

-- -----------------------------------------------------------------------------
-- Draw pool for a category: (customer, weight) after all exclusion rules.
-- -----------------------------------------------------------------------------
create or replace function public._draw_pool(p_category_id int)
returns table (customer_id uuid, weight bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  cat public.prize_categories;
begin
  select * into cat from public.prize_categories where id = p_category_id;
  if not found then
    return;
  end if;

  return query
  with base as (
    select ea.customer_id, ea.effective::bigint as weight
    from public._effective_allocations(cat.round_id) ea
    where not cat.is_grand and ea.prize_category_id = cat.id
    union all
    select tg.customer_id, sum(tg.tickets)::bigint
    from public.ticket_grants tg
    where cat.is_grand and tg.voided_at is null
    group by tg.customer_id
  )
  select b.customer_id, b.weight
  from base b
  where b.weight > 0
    -- already won this tier anywhere in the event
    and not exists (select 1 from public.winners w
                    where w.customer_id = b.customer_id and w.rank = cat.rank and w.status = 'won')
    -- forfeited this exact category
    and not exists (select 1 from public.winners w
                    where w.customer_id = b.customer_id and w.prize_category_id = cat.id and w.status = 'forfeited');
end;
$$;

-- -----------------------------------------------------------------------------
-- Secure random integer in [0, p_n), unbiased (rejection sampling).
-- -----------------------------------------------------------------------------
create or replace function public._secure_random_below(p_n bigint)
returns bigint
language plpgsql
volatile
set search_path = public, extensions, pg_temp
as $$
declare
  m   constant bigint := 9223372036854775807;   -- 2^63 - 1
  lim bigint;
  v   bigint;
begin
  if p_n is null or p_n <= 0 then
    raise exception 'p_n must be positive';
  end if;
  -- accept v in [0, lim] where (lim + 1) is a multiple of p_n
  lim := m - ((m % p_n) + 1) % p_n;
  loop
    v := ('x' || encode(extensions.gen_random_bytes(8), 'hex'))::bit(64)::bigint & m;
    exit when v <= lim;
  end loop;
  return v % p_n;
end;
$$;

-- Index (1-based) of the entry hit by random value p_r over cumulative weights.
create or replace function public._pick_weighted(p_weights bigint[], p_r bigint)
returns int
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  i   int;
  acc bigint := 0;
begin
  for i in 1 .. coalesce(array_length(p_weights, 1), 0) loop
    acc := acc + p_weights[i];
    if p_r < acc then
      return i;
    end if;
  end loop;
  raise exception 'random value % out of range (total %)', p_r, acc;
end;
$$;

-- -----------------------------------------------------------------------------
-- Is the category drawable right now? NULL = yes, otherwise the reason.
-- -----------------------------------------------------------------------------
create or replace function public._draw_blocked_reason(p_category_id int)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s      public.app_settings;
  cat    public.prize_categories;
  rd     public.rounds;
  v_last public.rounds;
  r      record;
begin
  select * into s from public.app_settings where id;
  if found and not s.enforce_draw_schedule then
    return null;
  end if;

  select * into cat from public.prize_categories where id = p_category_id;

  if not cat.is_grand then
    select * into rd from public.rounds where id = cat.round_id;
    if now() <= rd.allocation_deadline then
      return format('%s 分配截止（%s）后才能抽奖 / %s can be drawn after its allocation deadline (%s)',
                    rd.code, public.fmt_myt(rd.allocation_deadline), rd.code, public.fmt_myt(rd.allocation_deadline));
    end if;
    return null;
  end if;

  select * into v_last from public.rounds order by allocation_deadline desc, id desc limit 1;
  if now() <= v_last.allocation_deadline then
    return format('所有轮次分配截止（%s）后才能抽总决赛 / The Grand draw opens after the last allocation deadline (%s)',
                  public.fmt_myt(v_last.allocation_deadline), public.fmt_myt(v_last.allocation_deadline));
  end if;
  for r in
    select pc.id, pc.winner_slots, pc.name_zh, pc.name_en
    from public.prize_categories pc
    where pc.round_id = v_last.id
    order by pc.rank
  loop
    if (select count(*) from public.winners w where w.prize_category_id = r.id and w.status = 'won') < r.winner_slots
       and exists (select 1 from public._draw_pool(r.id)) then
      return format('请先完成 %s %s 的抽奖 / Finish the %s %s draw first', v_last.code, r.name_zh, v_last.code, r.name_en);
    end if;
  end loop;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- draw_status: everything draw.html needs for one category (admin only).
-- -----------------------------------------------------------------------------
create or replace function public.draw_status(p_category_id int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cat       public.prize_categories;
  rd        public.rounds;
  v_n       int;
  v_t       bigint;
  v_filled  int;
  v_pending int;
begin
  if not public.is_admin() then
    raise exception '只限管理员 / Admins only' using errcode = '42501';
  end if;
  select * into cat from public.prize_categories where id = p_category_id;
  if not found then
    raise exception '奖项无效 / Invalid prize category';
  end if;
  select * into rd from public.rounds where id = cat.round_id;

  select count(*)::int, coalesce(sum(weight), 0)::bigint into v_n, v_t from public._draw_pool(cat.id);
  select count(*)::int into v_filled from public.winners where prize_category_id = cat.id and status = 'won';
  select count(*)::int into v_pending
  from public.winners w
  where w.prize_category_id = cat.id and w.status = 'forfeited'
    and not exists (select 1 from public.draws d where d.replaces_winner_id = w.id);

  return jsonb_build_object(
    'category', jsonb_build_object(
      'id', cat.id, 'rank', cat.rank, 'is_grand', cat.is_grand,
      'name_zh', cat.name_zh, 'name_en', cat.name_en, 'prize_desc', cat.prize_desc,
      'winner_slots', cat.winner_slots,
      'round', case when rd.id is null then null else jsonb_build_object(
        'id', rd.id, 'code', rd.code, 'name_zh', rd.name_zh, 'name_en', rd.name_en,
        'allocation_deadline', rd.allocation_deadline, 'draw_date', rd.draw_date) end
    ),
    'filled', v_filled,
    'pending_redraws', v_pending,
    'pool', jsonb_build_object('count', v_n, 'tickets', v_t),
    'blocked_reason', public._draw_blocked_reason(cat.id),
    'winners', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', w.id, 'status', w.status,
               'name', c.name, 'name_masked', public.mask_name(c.name),
               'phone', c.phone, 'phone_masked', public.mask_phone(c.phone),
               'tickets', w.tickets_in_pool, 'drawn_at', w.created_at,
               'forfeited_at', w.forfeited_at, 'forfeit_reason', w.forfeit_reason
             ) order by w.id), '[]'::jsonb)
      from public.winners w join public.customers c on c.id = w.customer_id
      where w.prize_category_id = cat.id
    ),
    'sample', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'name', c.name, 'name_masked', public.mask_name(c.name),
               'phone', c.phone, 'phone_masked', public.mask_phone(c.phone))), '[]'::jsonb)
      from (select p.customer_id from public._draw_pool(cat.id) p order by random() limit 60) s
      join public.customers c on c.id = s.customer_id
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- draw_winner: draws ONE winner for a category (admin only).
-- -----------------------------------------------------------------------------
create or replace function public.draw_winner(p_category_id int)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  cat      public.prize_categories;
  v_block  text;
  v_filled int;
  v_ids    uuid[];
  v_w      bigint[];
  v_total  bigint;
  v_n      int;
  v_r      bigint;
  v_idx    int;
  v_before bigint;
  v_hash   text;
  v_repl   bigint;
  v_draw   bigint;
  v_win    bigint;
  c        public.customers;
begin
  if not public.is_admin() then
    raise exception '只有管理员可以抽奖 / Only admins can run draws' using errcode = '42501';
  end if;

  -- serialise draws: per category (slots) and per tier (one win per tier)
  select * into cat from public.prize_categories where id = p_category_id for update;
  if not found then
    raise exception '奖项无效 / Invalid prize category';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ld_draw_rank:' || cat.rank, 0));

  v_block := public._draw_blocked_reason(cat.id);
  if v_block is not null then
    raise exception '%', v_block;
  end if;

  select count(*)::int into v_filled from public.winners where prize_category_id = cat.id and status = 'won';
  if v_filled >= cat.winner_slots then
    raise exception '名额已满（% 位）/ All % winner slots are filled', cat.winner_slots, cat.winner_slots;
  end if;

  select array_agg(p.customer_id order by p.customer_id),
         array_agg(p.weight order by p.customer_id),
         sum(p.weight), count(*)::int,
         encode(extensions.digest(string_agg(p.customer_id::text || ':' || p.weight, ',' order by p.customer_id), 'sha256'), 'hex')
    into v_ids, v_w, v_total, v_n, v_hash
  from public._draw_pool(cat.id) p;

  if coalesce(v_total, 0) = 0 then
    raise exception '没有符合资格的参与者 / No eligible entrants left for this prize';
  end if;

  v_r   := public._secure_random_below(v_total);
  v_idx := public._pick_weighted(v_w, v_r);
  select coalesce(sum(x), 0) into v_before from unnest(v_w[1:v_idx - 1]) x;

  select w.id into v_repl
  from public.winners w
  where w.prize_category_id = cat.id and w.status = 'forfeited'
    and not exists (select 1 from public.draws d where d.replaces_winner_id = w.id)
  order by w.id
  limit 1;

  insert into public.draws (prize_category_id, run_by, pool_size, total_tickets, random_value,
                            winner_customer_id, replaces_winner_id, details)
  values (cat.id, auth.uid(), v_n, v_total, v_r, v_ids[v_idx], v_repl,
          jsonb_build_object(
            'method', 'pool ordered by customer_id; winner = first entry whose cumulative weight > random_value',
            'pool_sha256', v_hash,
            'winner_range', jsonb_build_array(v_before, v_before + v_w[v_idx]),
            'slot', v_filled + 1))
  returning id into v_draw;

  insert into public.winners (prize_category_id, rank, customer_id, draw_id, tickets_in_pool)
  values (cat.id, cat.rank, v_ids[v_idx], v_draw, v_w[v_idx])
  returning id into v_win;

  select * into c from public.customers where id = v_ids[v_idx];

  return jsonb_build_object(
    'draw_id', v_draw,
    'winner', jsonb_build_object(
      'id', v_win, 'tickets', v_w[v_idx],
      'name', c.name, 'name_masked', public.mask_name(c.name),
      'phone', c.phone, 'phone_masked', public.mask_phone(c.phone)),
    'pool_size', v_n,
    'total_tickets', v_total,
    'random_value', v_r,
    'slot', v_filled + 1,
    'winner_slots', cat.winner_slots,
    'is_redraw', v_repl is not null
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- mark_forfeited: frees the slot; that customer can't win this category again.
-- -----------------------------------------------------------------------------
create or replace function public.mark_forfeited(p_winner_id bigint, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  w public.winners;
begin
  if not public.is_admin() then
    raise exception '只限管理员 / Admins only' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '请填写放弃原因 / A reason is required';
  end if;
  select * into w from public.winners where id = p_winner_id for update;
  if not found then
    raise exception '找不到得奖记录 / Winner not found';
  end if;
  if w.status <> 'won' then
    raise exception '此得奖者已被标记为放弃 / This winner is already forfeited';
  end if;
  update public.winners
     set status = 'forfeited', forfeited_at = now(), forfeited_by = auth.uid(), forfeit_reason = btrim(p_reason)
   where id = w.id;
  return public.draw_status(w.prize_category_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: void grants / invoices (never deleted; audit trail kept)
-- -----------------------------------------------------------------------------
create or replace function public.void_grant(p_grant_id bigint, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  g public.ticket_grants;
begin
  if not public.is_admin() then
    raise exception '只限管理员 / Admins only' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '请填写作废原因 / A reason is required';
  end if;
  select * into g from public.ticket_grants where id = p_grant_id for update;
  if not found then
    raise exception '找不到记录 / Grant not found';
  end if;
  if g.voided_at is not null then
    raise exception '此记录已作废 / This grant is already voided';
  end if;
  if g.source in ('purchase', 'topup') then
    raise exception '购买/加购券请作废整张发票 / To cancel purchase or top-up tickets, void the whole invoice';
  end if;
  update public.ticket_grants
     set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where id = g.id;
  return public.admin_customer_detail(g.customer_id);
end;
$$;

create or replace function public.void_invoice(p_invoice_id bigint, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  i public.invoices;
begin
  if not public.is_admin() then
    raise exception '只限管理员 / Admins only' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '请填写作废原因 / A reason is required';
  end if;
  select * into i from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception '找不到发票 / Invoice not found';
  end if;
  if i.voided_at is not null then
    raise exception '此发票已作废 / This invoice is already voided';
  end if;
  update public.invoices
     set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where id = i.id;
  -- purchase/top-up, its repeat bonus, and both referral bonuses
  update public.ticket_grants
     set voided_at = now(), voided_by = auth.uid(), void_reason = 'Invoice voided: ' || btrim(p_reason)
   where invoice_id = i.id and voided_at is null;
  return public.admin_customer_detail(i.customer_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: customer detail
-- -----------------------------------------------------------------------------
create or replace function public.admin_customer_detail(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c public.customers;
begin
  if not public.is_admin() then
    raise exception '只限管理员 / Admins only' using errcode = '42501';
  end if;
  select * into c from public.customers where id = p_customer_id;
  if not found then
    raise exception '找不到顾客 / Customer not found';
  end if;

  return jsonb_build_object(
    'customer', jsonb_build_object(
      'id', c.id, 'name', c.name, 'phone', c.phone, 'email', c.email, 'wallet_token', c.wallet_token,
      'created_at', c.created_at, 'created_by', (select email from public.profiles where id = c.created_by),
      'referred_by', (select jsonb_build_object('name', r.name, 'phone', r.phone) from public.customers r where r.id = c.referred_by),
      'pdpa_consent_at', c.pdpa_consent_at, 'first_opened_at', c.first_opened_at,
      'last_opened_at', c.last_opened_at, 'open_count', c.open_count),
    'invoices', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', i.id, 'invoice_no', i.invoice_no, 'invoice_date', i.invoice_date,
               'round_code', rd.code, 'source', i.source, 'tickets', i.tickets,
               'sales', p.email, 'created_at', i.created_at,
               'voided_at', i.voided_at, 'void_reason', i.void_reason
             ) order by i.invoice_date, i.id), '[]'::jsonb)
      from public.invoices i
      join public.rounds rd on rd.id = i.round_id
      left join public.profiles p on p.id = i.sales_id
      where i.customer_id = c.id
    ),
    'grants', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', g.id, 'round_code', rd.code, 'source', g.source, 'tickets', g.tickets,
               'invoice_no', i.invoice_no, 'related_name', rc.name, 'note', g.note,
               'sales', p.email, 'created_at', g.created_at,
               'voided_at', g.voided_at, 'void_reason', g.void_reason
             ) order by g.round_id, g.id), '[]'::jsonb)
      from public.ticket_grants g
      join public.rounds rd on rd.id = g.round_id
      left join public.invoices i on i.id = g.invoice_id
      left join public.customers rc on rc.id = g.related_customer_id
      left join public.profiles p on p.id = g.sales_id
      where g.customer_id = c.id
    ),
    'rounds', (
      select jsonb_agg(jsonb_build_object(
               'code', r.code,
               'granted', (select coalesce(sum(tickets), 0) from public.ticket_grants
                           where customer_id = c.id and round_id = r.id and voided_at is null),
               'allocations', (select coalesce(jsonb_agg(jsonb_build_object(
                                 'name_zh', pc.name_zh, 'name_en', pc.name_en,
                                 'allocated', ea.allocated, 'effective', ea.effective) order by ea.prize_rank), '[]'::jsonb)
                               from public._effective_allocations(r.id) ea
                               join public.prize_categories pc on pc.id = ea.prize_category_id
                               where ea.customer_id = c.id)
             ) order by r.id)
      from public.rounds r
    ),
    'wins', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', w.id, 'round_code', rd.code, 'name_zh', pc.name_zh, 'name_en', pc.name_en,
               'status', w.status, 'drawn_at', w.created_at, 'forfeit_reason', w.forfeit_reason
             ) order by w.id), '[]'::jsonb)
      from public.winners w
      join public.prize_categories pc on pc.id = w.prize_category_id
      left join public.rounds rd on rd.id = pc.round_id
      where w.customer_id = c.id
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: stats by round and category
-- -----------------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r        record;
  pcat     record;
  v_rounds jsonb := '[]'::jsonb;
  v_cats   jsonb;
  v_grand  jsonb;
  v_n      int;
  v_t      bigint;
begin
  if not public.is_admin() then
    raise exception '只限管理员 / Admins only' using errcode = '42501';
  end if;

  for r in select * from public.rounds order by id loop
    v_cats := '[]'::jsonb;
    for pcat in select * from public.prize_categories where round_id = r.id order by rank loop
      select count(*)::int, coalesce(sum(dp.weight), 0) into v_n, v_t from public._draw_pool(pcat.id) dp;
      v_cats := v_cats || jsonb_build_array(jsonb_build_object(
        'id', pcat.id, 'rank', pcat.rank, 'name_zh', pcat.name_zh, 'name_en', pcat.name_en,
        'prize_desc', pcat.prize_desc, 'winner_slots', pcat.winner_slots,
        'filled', (select count(*) from public.winners w where w.prize_category_id = pcat.id and w.status = 'won'),
        'participants', (select count(*) from public._effective_allocations(r.id) ea
                         where ea.prize_category_id = pcat.id and ea.effective > 0),
        'tickets', (select coalesce(sum(ea.effective), 0) from public._effective_allocations(r.id) ea
                    where ea.prize_category_id = pcat.id),
        'eligible', v_n,
        'eligible_tickets', v_t
      ));
    end loop;

    v_rounds := v_rounds || jsonb_build_array(jsonb_build_object(
      'id', r.id, 'code', r.code, 'name_zh', r.name_zh, 'name_en', r.name_en,
      'allocation_deadline', r.allocation_deadline, 'draw_date', r.draw_date,
      'is_open', now() <= r.allocation_deadline,
      'customers', (select count(distinct customer_id) from public.ticket_grants
                    where round_id = r.id and voided_at is null),
      'granted', (select coalesce(sum(tickets), 0) from public.ticket_grants
                  where round_id = r.id and voided_at is null),
      'allocated', (select coalesce(sum(effective), 0) from public._effective_allocations(r.id)),
      'categories', v_cats
    ));
  end loop;

  select jsonb_build_object(
           'id', pc.id, 'name_zh', pc.name_zh, 'name_en', pc.name_en, 'prize_desc', pc.prize_desc,
           'winner_slots', pc.winner_slots,
           'filled', (select count(*) from public.winners w where w.prize_category_id = pc.id and w.status = 'won'),
           'participants', (select count(distinct customer_id) from public.ticket_grants where voided_at is null),
           'tickets', (select coalesce(sum(tickets), 0) from public.ticket_grants where voided_at is null),
           'eligible', (select count(*) from public._draw_pool(pc.id)))
    into v_grand
  from public.prize_categories pc where pc.is_grand;

  return jsonb_build_object(
    'generated_at', now(),
    'totals', jsonb_build_object(
      'customers', (select count(*) from public.customers),
      'tickets', (select coalesce(sum(tickets), 0) from public.ticket_grants where voided_at is null),
      'invoices', (select count(*) from public.invoices where voided_at is null),
      'voided_grants', (select count(*) from public.ticket_grants where voided_at is not null),
      'opened', (select count(*) from public.customers where first_opened_at is not null),
      'consented', (select count(*) from public.customers where pdpa_consent_at is not null),
      'by_source', (select coalesce(jsonb_object_agg(source, t), '{}'::jsonb)
                    from (select source, sum(tickets) as t from public.ticket_grants
                          where voided_at is null group by source) x)
    ),
    'rounds', v_rounds,
    'grand', v_grand
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: CSV exports (returned as one jsonb array to avoid row limits)
-- -----------------------------------------------------------------------------
create or replace function public.admin_export_winners()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception '只限管理员 / Admins only' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'winner_id', w.id,
             'round', coalesce(rd.code, 'GRAND'),
             'prize', pc.name_zh || ' ' || pc.name_en,
             'prize_desc', pc.prize_desc,
             'status', w.status,
             'customer_name', c.name,
             'phone', c.phone,
             'email', c.email,
             'tickets_in_draw', w.tickets_in_pool,
             'pool_size', d.pool_size,
             'pool_tickets', d.total_tickets,
             'random_value', d.random_value,
             'drawn_at_myt', to_char(w.created_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD HH24:MI:SS'),
             'drawn_by', p.email,
             'forfeit_reason', w.forfeit_reason,
             'forfeited_at_myt', to_char(w.forfeited_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD HH24:MI:SS')
           ) order by pc.round_id nulls last, pc.rank, w.id), '[]'::jsonb)
    from public.winners w
    join public.prize_categories pc on pc.id = w.prize_category_id
    left join public.rounds rd on rd.id = pc.round_id
    join public.customers c on c.id = w.customer_id
    join public.draws d on d.id = w.draw_id
    left join public.profiles p on p.id = d.run_by
  );
end;
$$;

create or replace function public.admin_export_grants()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception '只限管理员 / Admins only' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'grant_id', g.id,
             'created_at_myt', to_char(g.created_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD HH24:MI:SS'),
             'round', rd.code,
             'source', g.source,
             'tickets', g.tickets,
             'customer_name', c.name,
             'phone', c.phone,
             'invoice_no', i.invoice_no,
             'invoice_date', i.invoice_date,
             'related_customer', rc.name,
             'salesperson', p.email,
             'voided', g.voided_at is not null,
             'void_reason', g.void_reason
           ) order by g.id), '[]'::jsonb)
    from public.ticket_grants g
    join public.rounds rd on rd.id = g.round_id
    join public.customers c on c.id = g.customer_id
    left join public.invoices i on i.id = g.invoice_id
    left join public.customers rc on rc.id = g.related_customer_id
    left join public.profiles p on p.id = g.sales_id
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Never lose the last active admin (protects the admin page's staff editor)
-- -----------------------------------------------------------------------------
create or replace function public._protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active) then
    if not exists (select 1 from public.profiles
                   where id <> old.id and role = 'admin' and active) then
      raise exception '必须保留至少一位管理员 / At least one active admin is required';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_last_admin on public.profiles;
create trigger protect_last_admin
  before update on public.profiles
  for each row execute function public._protect_last_admin();

-- -----------------------------------------------------------------------------
-- Wallet payload: allocation figures now use effective allocations
-- (replaces the 002 version; output shape unchanged)
-- -----------------------------------------------------------------------------
create or replace function public._wallet_payload(p_customer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c        public.customers;
  v_rounds jsonb;
  v_grand  jsonb;
begin
  select * into c from public.customers where id = p_customer;

  select coalesce(jsonb_agg(t.rj order by t.rid), '[]'::jsonb)
  into v_rounds
  from (
    select r.id as rid, jsonb_build_object(
      'id', r.id,
      'code', r.code,
      'name_zh', r.name_zh,
      'name_en', r.name_en,
      'purchase_start', r.purchase_start,
      'purchase_end', r.purchase_end,
      'allocation_deadline', r.allocation_deadline,
      'draw_date', r.draw_date,
      'is_open', now() <= r.allocation_deadline,
      'tickets_total', g.total,
      'by_source', g.by_source,
      'allocated_total', a.effective,
      'unallocated', greatest(g.total - a.raw, 0),
      'categories', cats.list
    ) as rj
    from public.rounds r
    cross join lateral (
      select coalesce(sum(tg.tickets), 0)::int as total,
             jsonb_build_object(
               'purchase',     coalesce(sum(tg.tickets) filter (where tg.source = 'purchase'), 0),
               'topup',        coalesce(sum(tg.tickets) filter (where tg.source = 'topup'), 0),
               'repeat_bonus', coalesce(sum(tg.tickets) filter (where tg.source = 'repeat_bonus'), 0),
               'referral',     coalesce(sum(tg.tickets) filter (where tg.source = 'referral'), 0)
             ) as by_source
      from public.ticket_grants tg
      where tg.customer_id = c.id and tg.round_id = r.id and tg.voided_at is null
    ) g
    cross join lateral (
      select coalesce(sum(ea.allocated), 0)::int as raw, coalesce(sum(ea.effective), 0)::int as effective
      from public._effective_allocations(r.id) ea
      where ea.customer_id = c.id
    ) a
    cross join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', pc.id,
               'rank', pc.rank,
               'name_zh', pc.name_zh,
               'name_en', pc.name_en,
               'prize_desc', pc.prize_desc,
               'winner_slots', pc.winner_slots,
               'my_tickets', (
                 select coalesce(sum(ea.effective), 0)::int
                 from public._effective_allocations(r.id) ea
                 where ea.customer_id = c.id and ea.prize_category_id = pc.id
               ),
               'winners', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'name', public.mask_name(cu.name),
                          'phone', public.mask_phone(cu.phone),
                          'is_me', w.customer_id = c.id
                        ) order by w.id), '[]'::jsonb)
                 from public.winners w
                 join public.customers cu on cu.id = w.customer_id
                 where w.prize_category_id = pc.id and w.status = 'won'
               )
             ) order by pc.rank), '[]'::jsonb) as list
      from public.prize_categories pc
      where pc.round_id = r.id
    ) cats
  ) t;

  select jsonb_build_object(
    'category', case when pc.id is null then null else jsonb_build_object(
      'id', pc.id, 'rank', pc.rank, 'name_zh', pc.name_zh, 'name_en', pc.name_en,
      'prize_desc', pc.prize_desc, 'winner_slots', pc.winner_slots
    ) end,
    'draw_date', (select max(draw_date) from public.rounds),
    'tickets_total', (
      select coalesce(sum(tg.tickets), 0)::int
      from public.ticket_grants tg
      where tg.customer_id = c.id and tg.voided_at is null
    ),
    'winners', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'name', public.mask_name(cu.name),
               'phone', public.mask_phone(cu.phone),
               'is_me', w.customer_id = c.id
             ) order by w.id), '[]'::jsonb)
      from public.winners w
      join public.customers cu on cu.id = w.customer_id
      where w.prize_category_id = pc.id and w.status = 'won'
    )
  )
  into v_grand
  from (select 1) one
  left join public.prize_categories pc on pc.is_grand;

  return jsonb_build_object(
    'consent_required', false,
    'server_now', now(),
    'customer', jsonb_build_object('name', c.name, 'phone_masked', public.mask_phone(c.phone)),
    'rounds', v_rounds,
    'grand', v_grand
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges: new functions start locked; grant only the admin entry points.
-- (Every admin RPC re-checks is_admin() itself.)
-- -----------------------------------------------------------------------------
revoke execute on function public._effective_allocations(int)        from public, anon, authenticated;
revoke execute on function public._draw_pool(int)                    from public, anon, authenticated;
revoke execute on function public._secure_random_below(bigint)       from public, anon, authenticated;
revoke execute on function public._pick_weighted(bigint[], bigint)   from public, anon, authenticated;
revoke execute on function public._draw_blocked_reason(int)          from public, anon, authenticated;
revoke execute on function public._protect_last_admin()              from public, anon, authenticated;
revoke execute on function public._wallet_payload(uuid)              from public, anon, authenticated;
revoke execute on function public.draw_status(int)                   from public, anon, authenticated;
revoke execute on function public.draw_winner(int)                   from public, anon, authenticated;
revoke execute on function public.mark_forfeited(bigint, text)       from public, anon, authenticated;
revoke execute on function public.void_grant(bigint, text)           from public, anon, authenticated;
revoke execute on function public.void_invoice(bigint, text)         from public, anon, authenticated;
revoke execute on function public.admin_customer_detail(uuid)        from public, anon, authenticated;
revoke execute on function public.admin_stats()                      from public, anon, authenticated;
revoke execute on function public.admin_export_winners()             from public, anon, authenticated;
revoke execute on function public.admin_export_grants()              from public, anon, authenticated;

grant execute on function public.draw_status(int)               to authenticated;
grant execute on function public.draw_winner(int)               to authenticated;
grant execute on function public.mark_forfeited(bigint, text)   to authenticated;
grant execute on function public.void_grant(bigint, text)       to authenticated;
grant execute on function public.void_invoice(bigint, text)     to authenticated;
grant execute on function public.admin_customer_detail(uuid)    to authenticated;
grant execute on function public.admin_stats()                  to authenticated;
grant execute on function public.admin_export_winners()         to authenticated;
grant execute on function public.admin_export_grants()          to authenticated;
