-- =============================================================================
-- ZÉLL-V Lucky Draw — 006 qualifying packages + T&C ticket rules (6 Nov 2026)
-- Run after 005. Run supabase/reset_all_data.sql FIRST if old test data exists.
--
-- Salespeople no longer type a ticket count. They pick a package; the server
-- computes tickets (campaign T&C sections 3 + 5):
--   * Purchase        : package tickets × quantity (official table)
--   * Product Top Up  : oral supplements, PAID boxes only, cumulative per
--                       customer. New boxes earn ×1, ×2 once the cumulative
--                       total reaches 12, ×3 at 18+. (6 → 12 = +12, 12 → 24 = +36)
--   * Voucher / Cellular Therapy upgrade : only the difference in entitlement
--                       (RM10,000 = 10 → RM20,000 = 20 ⇒ +10)
--   * Repeat Purchase : +3 once per customer per later round with an eligible
--                       purchase (needs an eligible purchase in an earlier round)
--   * Referral        : +5 / +5; the new customer's purchase must earn tickets
--                       and the referrer must already have such a purchase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Package catalogue
-- -----------------------------------------------------------------------------
create table if not exists public.packages (
  code       text primary key,
  category   text not null check (category in ('oral', 'pp', 'trio', 'voucher', 'cellular')),
  kind       text not null check (kind in ('boxes', 'fixed', 'level')),
  name_zh    text not null,
  name_en    text not null,
  paid_boxes int  not null default 0 check (paid_boxes >= 0),
  tickets    int  not null check (tickets >= 0),
  sort       int  not null default 0,
  active     boolean not null default true
);

insert into public.packages (code, category, kind, name_zh, name_en, paid_boxes, tickets, sort) values
  ('ORAL_1',      'oral',     'boxes', '任何一盒 ZÉLL-V 口服保健品', 'Any 1 box ZÉLL-V oral supplement', 1, 1, 10),
  ('ORAL_B4F1',   'oral',     'boxes', '买4送1',                     'Buy 4 Free 1',                    4, 4, 20),
  ('ORAL_B6F2',   'oral',     'boxes', '买6送2',                     'Buy 6 Free 2',                    6, 6, 30),
  ('ORAL_B12F5',  'oral',     'boxes', '买12送5',                    'Buy 12 Free 5',                  12, 24, 40),
  ('ORAL_B18F7',  'oral',     'boxes', '买18送7',                    'Buy 18 Free 7',                  18, 54, 50),
  ('PP_B2F1',     'pp',       'fixed', 'PP2 / PP3 买2送1',           'PP2 / PP3 Buy 2 Free 1',          2, 1, 60),
  ('TRIO',        'trio',     'fixed', '三重配套 (12+12+12)',        'Trio Package (12+12+12)',        36, 50, 70),
  ('VOUCHER_5K',  'voucher',  'level', 'RM5,000 产品礼券',           'RM5,000 Product Voucher',         0, 0, 80),
  ('VOUCHER_10K', 'voucher',  'level', 'RM10,000 产品礼券',          'RM10,000 Product Voucher',        0, 10, 90),
  ('VOUCHER_20K', 'voucher',  'level', 'RM20,000 产品礼券',          'RM20,000 Product Voucher',        0, 20, 100),
  ('CT_8',        'cellular', 'level', '细胞疗程 8',                  'Cellular Therapy 8',              0, 25, 110),
  ('CT_16_24',    'cellular', 'level', '细胞疗程 16 / 24',            'Cellular Therapy 16 / 24',        0, 52, 120)
on conflict (code) do nothing;

alter table public.packages enable row level security;
revoke all on public.packages from anon, authenticated;
grant select on public.packages to authenticated;
grant update (name_zh, name_en, tickets, active, sort) on public.packages to authenticated;
drop policy if exists packages_select on public.packages;
create policy packages_select on public.packages for select to authenticated using (public.is_staff());
drop policy if exists packages_update on public.packages;
create policy packages_update on public.packages for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- Invoices remember the package, quantity and paid boxes (for top-ups)
-- -----------------------------------------------------------------------------
alter table public.invoices add column if not exists package_code text references public.packages(code);
alter table public.invoices add column if not exists quantity     int not null default 1 check (quantity >= 1);
alter table public.invoices add column if not exists paid_boxes   int not null default 0 check (paid_boxes >= 0);
alter table public.invoices add column if not exists category     text;
-- an RM5,000 voucher is recorded (needed for a later upgrade) but earns 0 tickets
alter table public.invoices drop constraint if exists invoices_tickets_check;
alter table public.invoices add constraint invoices_tickets_check check (tickets >= 0);

-- Repeat bonus: once per customer per round
create unique index if not exists ticket_grants_one_repeat_per_round
  on public.ticket_grants (customer_id, round_id) where source = 'repeat_bonus' and voided_at is null;

-- -----------------------------------------------------------------------------
-- Repeat-purchase reconciliation (replaces 002 version, same signature)
-- -----------------------------------------------------------------------------
create or replace function public._reconcile_repeat_bonuses(p_customer uuid, p_sales uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s      public.app_settings;
  v_srcs text[];
  r      record;
  v_gid  bigint;
  v_out  jsonb := '[]'::jsonb;
begin
  select * into s from public.app_settings where id;
  if not found or s.repeat_bonus_tickets <= 0 then
    return v_out;
  end if;
  v_srcs := case when s.repeat_bonus_on_topup then array['purchase', 'topup'] else array['purchase'] end;

  for r in
    select rd.id as round_id, rd.code as round_code, anchor.id as invoice_id, anchor.invoice_no
    from public.rounds rd
    cross join lateral (
      select i.id, i.invoice_no
      from public.invoices i
      where i.customer_id = p_customer and i.round_id = rd.id and i.voided_at is null
        and i.tickets > 0 and i.source = any (v_srcs)
      order by i.invoice_date, i.id
      limit 1
    ) anchor
    where now() <= rd.allocation_deadline
      and not exists (select 1 from public.ticket_grants g
                      where g.customer_id = p_customer and g.round_id = rd.id
                        and g.source = 'repeat_bonus' and g.voided_at is null)
      and exists (select 1 from public.invoices j
                  where j.customer_id = p_customer and j.round_id < rd.id and j.voided_at is null
                    and j.tickets > 0 and j.source = any (v_srcs))
    order by rd.id
  loop
    insert into public.ticket_grants (customer_id, round_id, source, tickets, invoice_id, sales_id, note)
    values (p_customer, r.round_id, 'repeat_bonus', s.repeat_bonus_tickets, r.invoice_id, p_sales,
            'Repeat purchase bonus ' || r.round_code)
    returning id into v_gid;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'grant_id', v_gid, 'source', 'repeat_bonus', 'tickets', s.repeat_bonus_tickets,
      'round_id', r.round_id, 'round_code', r.round_code,
      'invoice_id', r.invoice_id, 'invoice_no', r.invoice_no));
  end loop;
  return v_out;
end;
$$;

-- -----------------------------------------------------------------------------
-- Core issuing (new signature: package + quantity instead of a ticket count)
--   p_source 'purchase': p_qty = number of packages
--   p_source 'topup'   : oral → p_qty = number of extra PAID boxes (ORAL_1);
--                        voucher / cellular → p_package = upgraded package, p_qty = 1
-- -----------------------------------------------------------------------------
drop function if exists public.issue_tickets(text, text, text, text, date, text, int, text, boolean);
drop function if exists public._issue_tickets_core(text, text, text, text, date, text, int, text, uuid);

create or replace function public._issue_tickets_core(
  p_phone          text,
  p_name           text,
  p_email          text,
  p_invoice_no     text,
  p_invoice_date   date,
  p_source         text,
  p_package        text,
  p_qty            int,
  p_referrer_phone text,
  p_sales          uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s            public.app_settings;
  v_phone      text := public.normalize_phone(p_phone);
  v_ref_phone  text := public.normalize_phone(nullif(btrim(coalesce(p_referrer_phone, '')), ''));
  v_name       text := nullif(btrim(coalesce(p_name, '')), '');
  v_email      text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_inv_no     text := nullif(btrim(coalesce(p_invoice_no, '')), '');
  rd           public.rounds;
  pk           public.packages;
  c            public.customers;
  ref          public.customers;
  v_is_new     boolean;
  v_has_grants boolean;
  v_tickets    int;
  v_paid       int := 0;
  v_before     int;
  v_after      int;
  v_mult       int;
  v_prev       int;
  v_calc       text;
  v_invoice_id bigint;
  v_gid        bigint;
  v_grants     jsonb := '[]'::jsonb;
  v_repeat     jsonb;
  v_item       jsonb;
begin
  select * into s from public.app_settings where id;
  if not found then
    raise exception '系统设置缺失 / app_settings row is missing';
  end if;

  -- ---- input validation ----------------------------------------------------
  if not public.is_valid_phone(v_phone) then
    raise exception '顾客电话号码无效 / Invalid customer phone number';
  end if;
  if p_source is null or p_source not in ('purchase', 'topup') then
    raise exception '来源必须是购买或加购 / Source must be purchase or top up';
  end if;
  select * into pk from public.packages where code = p_package and active;
  if not found then
    raise exception '请选择有效的配套 / Choose a valid package';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 100 then
    raise exception '数量必须在 1 到 100 之间 / Quantity must be between 1 and 100';
  end if;
  if v_inv_no is null then
    raise exception '请输入发票号码 / Invoice number is required';
  end if;
  if p_invoice_date is null then
    raise exception '请输入发票日期 / Invoice date is required';
  end if;
  if s.block_future_invoice_dates and p_invoice_date > public.myt_today() then
    raise exception '发票日期不能是未来日期 / Invoice date cannot be in the future';
  end if;

  select * into rd from public.rounds where p_invoice_date between purchase_start and purchase_end;
  if not found then
    raise exception '发票日期 % 不在任何一轮的购买期内 / Invoice date % is not within any round''s purchase window',
      p_invoice_date, p_invoice_date;
  end if;
  if now() > rd.allocation_deadline then
    raise exception '% 已于 % 截止，不能再录入发票 / % closed for entries on %',
      rd.code, public.fmt_myt(rd.allocation_deadline), rd.code, public.fmt_myt(rd.allocation_deadline);
  end if;
  if exists (select 1 from public.invoices where upper(btrim(invoice_no)) = upper(v_inv_no) and voided_at is null) then
    raise exception '发票号码 % 已被使用 / Invoice number % has already been used', v_inv_no, v_inv_no;
  end if;

  -- ---- customer ---------------------------------------------------------------
  perform pg_advisory_xact_lock(hashtextextended('ld_customer:' || v_phone, 0));
  select * into c from public.customers where phone = v_phone for update;
  v_is_new := not found;
  if v_is_new then
    if v_name is null then
      raise exception '新顾客必须填写姓名 / Name is required for a new customer';
    end if;
    insert into public.customers (phone, name, email, created_by)
    values (v_phone, v_name, v_email, p_sales)
    returning * into c;
    v_has_grants := false;
  else
    update public.customers set name = coalesce(v_name, name), email = coalesce(v_email, email)
     where id = c.id returning * into c;
    v_has_grants := exists (select 1 from public.ticket_grants where customer_id = c.id and voided_at is null);
  end if;

  -- ---- ticket entitlement -----------------------------------------------------
  if p_source = 'purchase' then
    v_tickets := pk.tickets * p_qty;
    v_paid    := pk.paid_boxes * p_qty;
    v_calc    := format('%s × %s = %s', pk.name_en, p_qty, v_tickets);
  elsif pk.kind = 'boxes' then
    select coalesce(sum(paid_boxes), 0)::int into v_before
    from public.invoices
    where customer_id = c.id and voided_at is null and category = pk.category;
    if v_before = 0 then
      raise exception '此顾客还没有付费盒数可加购，请选择「购买」/ No earlier paid boxes to top up. Use Purchase instead';
    end if;
    v_paid  := pk.paid_boxes * p_qty;
    v_after := v_before + v_paid;
    v_mult  := case when v_after >= 18 then 3 when v_after >= 12 then 2 else 1 end;
    v_tickets := v_paid * v_mult;
    v_calc  := format('Top up %s → %s paid boxes: %s × %s = %s', v_before, v_after, v_paid, v_mult, v_tickets);
  elsif pk.kind = 'level' then
    if p_qty <> 1 then
      raise exception '升级数量必须是 1 / Upgrade quantity must be 1';
    end if;
    select max(p2.tickets) into v_prev
    from public.invoices i join public.packages p2 on p2.code = i.package_code
    where i.customer_id = c.id and i.voided_at is null and i.category = pk.category;
    if v_prev is null then
      raise exception '此顾客没有可升级的%配套，请选择「购买」/ No earlier % package to upgrade. Use Purchase instead',
        pk.category, pk.category;
    end if;
    if pk.tickets <= v_prev then
      raise exception '升级配套必须高于现有配套 / The upgrade must be to a higher package (current entitlement % tickets)', v_prev;
    end if;
    v_tickets := pk.tickets - v_prev;
    v_calc    := format('Upgrade to %s: %s − %s = %s', pk.name_en, pk.tickets, v_prev, v_tickets);
  else
    raise exception '此配套不能加购，请选择「购买」/ Top up is not available for this package. Use Purchase instead';
  end if;

  -- ---- referral validation ------------------------------------------------------
  if v_ref_phone is not null then
    if not public.is_valid_phone(v_ref_phone) then
      raise exception '推荐人电话号码无效 / Invalid referrer phone number';
    end if;
    if v_ref_phone = v_phone then
      raise exception '不能推荐自己 / Self-referral is not allowed';
    end if;
    if p_source <> 'purchase' then
      raise exception '推荐只适用于购买发票 / Referral only applies to a purchase invoice';
    end if;
    if v_tickets <= 0 then
      raise exception '此配套没有抽奖券，不能作为推荐 / This package earns no tickets, so it cannot count as a referral purchase';
    end if;
    if v_has_grants then
      raise exception '此顾客已有抽奖券，不是新顾客，不能使用推荐 / This customer already has tickets, so is not new and cannot be referred';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('ld_customer:' || v_ref_phone, 0));
    select * into ref from public.customers where phone = v_ref_phone for update;
    if not found or not exists (
      select 1 from public.invoices i where i.customer_id = ref.id and i.voided_at is null and i.tickets > 0
    ) then
      raise exception '推荐人 % 不是已购买的现有顾客 / Referrer % is not an existing customer with a qualifying purchase',
        public.mask_phone(v_ref_phone), public.mask_phone(v_ref_phone);
    end if;
  end if;

  -- ---- invoice + main grant -------------------------------------------------------
  insert into public.invoices (invoice_no, invoice_date, customer_id, round_id, source, tickets,
                               referrer_customer_id, sales_id, package_code, quantity, paid_boxes, category)
  values (v_inv_no, p_invoice_date, c.id, rd.id, p_source, v_tickets,
          ref.id, p_sales, pk.code, p_qty, v_paid, pk.category)
  returning id into v_invoice_id;

  if v_tickets > 0 then
    insert into public.ticket_grants (customer_id, round_id, source, tickets, invoice_id, sales_id, note)
    values (c.id, rd.id, p_source, v_tickets, v_invoice_id, p_sales, v_calc)
    returning id into v_gid;
    v_grants := v_grants || jsonb_build_array(jsonb_build_object(
      'grant_id', v_gid, 'recipient', 'customer', 'customer_name', c.name,
      'source', p_source, 'tickets', v_tickets, 'calc', v_calc,
      'round_id', rd.id, 'round_code', rd.code, 'invoice_no', v_inv_no));
  end if;

  -- ---- repeat purchase bonus ----------------------------------------------------------
  v_repeat := public._reconcile_repeat_bonuses(c.id, p_sales);
  for v_item in select * from jsonb_array_elements(v_repeat) loop
    v_grants := v_grants || jsonb_build_array(v_item || jsonb_build_object(
      'recipient', 'customer', 'customer_name', c.name,
      'retroactive', (v_item ->> 'invoice_id')::bigint <> v_invoice_id));
  end loop;

  -- ---- referral bonus -----------------------------------------------------------------
  if ref.id is not null and s.referral_bonus_tickets > 0 then
    insert into public.ticket_grants (customer_id, round_id, source, tickets, invoice_id, related_customer_id, sales_id, note)
    values (c.id, rd.id, 'referral', s.referral_bonus_tickets, v_invoice_id, ref.id, p_sales, 'Referred by ' || ref.phone)
    returning id into v_gid;
    v_grants := v_grants || jsonb_build_array(jsonb_build_object(
      'grant_id', v_gid, 'recipient', 'customer', 'customer_name', c.name,
      'source', 'referral', 'tickets', s.referral_bonus_tickets, 'round_id', rd.id, 'round_code', rd.code));
    insert into public.ticket_grants (customer_id, round_id, source, tickets, invoice_id, related_customer_id, sales_id, note)
    values (ref.id, rd.id, 'referral', s.referral_bonus_tickets, v_invoice_id, c.id, p_sales, 'Referred ' || c.phone)
    returning id into v_gid;
    v_grants := v_grants || jsonb_build_array(jsonb_build_object(
      'grant_id', v_gid, 'recipient', 'referrer', 'customer_name', ref.name,
      'source', 'referral', 'tickets', s.referral_bonus_tickets, 'round_id', rd.id, 'round_code', rd.code));
    update public.customers set referred_by = ref.id where id = c.id and referred_by is null;
  end if;

  return jsonb_build_object(
    'invoice_id', v_invoice_id,
    'customer', jsonb_build_object('id', c.id, 'phone', c.phone, 'name', c.name, 'email', c.email,
                                   'wallet_token', c.wallet_token, 'is_new', v_is_new),
    'referrer', case when ref.id is null then null else jsonb_build_object(
      'id', ref.id, 'name', ref.name, 'phone', ref.phone, 'wallet_token', ref.wallet_token) end,
    'round', jsonb_build_object('id', rd.id, 'code', rd.code, 'name_zh', rd.name_zh, 'name_en', rd.name_en,
                                'allocation_deadline', rd.allocation_deadline, 'draw_date', rd.draw_date),
    'package', jsonb_build_object('code', pk.code, 'name_zh', pk.name_zh, 'name_en', pk.name_en,
                                  'quantity', p_qty, 'paid_boxes', v_paid),
    'calc', v_calc,
    'invoice_tickets', v_tickets,
    'grants', v_grants,
    'customer_new_tickets', (select coalesce(sum((g ->> 'tickets')::int), 0)
                             from jsonb_array_elements(v_grants) g where g ->> 'recipient' = 'customer')
  );
end;
$$;

create or replace function public.issue_tickets(
  p_phone          text,
  p_name           text,
  p_email          text,
  p_invoice_no     text,
  p_invoice_date   date,
  p_source         text,
  p_package        text,
  p_qty            int,
  p_referrer_phone text default null,
  p_dry_run        boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_res jsonb;
begin
  if not public.is_staff() then
    raise exception '没有权限 / Not authorised' using errcode = '42501';
  end if;
  begin
    v_res := public._issue_tickets_core(p_phone, p_name, p_email, p_invoice_no, p_invoice_date,
                                        p_source, p_package, p_qty, p_referrer_phone, auth.uid());
    if p_dry_run then
      raise exception 'dry run rollback' using errcode = 'LDDRY';
    end if;
  exception when sqlstate 'LDDRY' then
    v_res := v_res #- '{invoice_id}' #- '{customer,id}' #- '{customer,wallet_token}';
  end;
  return v_res || jsonb_build_object('dry_run', coalesce(p_dry_run, false));
end;
$$;

-- -----------------------------------------------------------------------------
-- lookup_customer: also returns paid boxes / current package levels (top-up hints)
-- -----------------------------------------------------------------------------
create or replace function public.lookup_customer(p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text := public.normalize_phone(p_phone);
  c       public.customers;
begin
  if not public.is_staff() then
    raise exception '没有权限 / Not authorised' using errcode = '42501';
  end if;
  if not public.is_valid_phone(v_phone) then
    return jsonb_build_object('valid', false, 'phone', v_phone);
  end if;
  select * into c from public.customers where phone = v_phone;
  if not found then
    return jsonb_build_object('valid', true, 'exists', false, 'phone', v_phone);
  end if;
  return jsonb_build_object(
    'valid', true, 'exists', true,
    'phone', c.phone, 'name', c.name, 'email', c.email,
    'has_tickets', exists (select 1 from public.ticket_grants g where g.customer_id = c.id and g.voided_at is null),
    'purchase_rounds', (select coalesce(jsonb_agg(distinct i.round_id), '[]'::jsonb)
                        from public.invoices i
                        where i.customer_id = c.id and i.voided_at is null and i.source = 'purchase' and i.tickets > 0),
    'paid_boxes', (select coalesce(jsonb_object_agg(x.category, x.n), '{}'::jsonb)
                   from (select i.category, sum(i.paid_boxes)::int as n from public.invoices i
                         where i.customer_id = c.id and i.voided_at is null and i.category is not null
                         group by i.category) x),
    'levels', (select coalesce(jsonb_object_agg(x.category, x.t), '{}'::jsonb)
               from (select i.category, max(p.tickets) as t from public.invoices i
                     join public.packages p on p.code = i.package_code
                     where i.customer_id = c.id and i.voided_at is null and p.kind = 'level'
                     group by i.category) x)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin views: include package details
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
               'package', coalesce(p.name_zh, ''), 'quantity', i.quantity, 'paid_boxes', i.paid_boxes,
               'sales', pr.email, 'created_at', i.created_at,
               'voided_at', i.voided_at, 'void_reason', i.void_reason
             ) order by i.invoice_date, i.id), '[]'::jsonb)
      from public.invoices i
      join public.rounds rd on rd.id = i.round_id
      left join public.packages p on p.code = i.package_code
      left join public.profiles pr on pr.id = i.sales_id
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
             'calculation', g.note,
             'customer_name', c.name,
             'phone', c.phone,
             'invoice_no', i.invoice_no,
             'invoice_date', i.invoice_date,
             'package', pk.name_en,
             'quantity', i.quantity,
             'paid_boxes', i.paid_boxes,
             'related_customer', rc.name,
             'salesperson', p.email,
             'voided', g.voided_at is not null,
             'void_reason', g.void_reason
           ) order by g.id), '[]'::jsonb)
    from public.ticket_grants g
    join public.rounds rd on rd.id = g.round_id
    join public.customers c on c.id = g.customer_id
    left join public.invoices i on i.id = g.invoice_id
    left join public.packages pk on pk.code = i.package_code
    left join public.customers rc on rc.id = g.related_customer_id
    left join public.profiles p on p.id = g.sales_id
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke execute on function public._reconcile_repeat_bonuses(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._issue_tickets_core(text, text, text, text, date, text, text, int, text, uuid) from public, anon, authenticated;
revoke execute on function public.issue_tickets(text, text, text, text, date, text, text, int, text, boolean) from public, anon, authenticated;
revoke execute on function public.lookup_customer(text)        from public, anon, authenticated;
revoke execute on function public.admin_customer_detail(uuid)  from public, anon, authenticated;
revoke execute on function public.admin_export_grants()        from public, anon, authenticated;

grant execute on function public.issue_tickets(text, text, text, text, date, text, text, int, text, boolean) to authenticated;
grant execute on function public.lookup_customer(text)        to authenticated;
grant execute on function public.admin_customer_detail(uuid)  to authenticated;
grant execute on function public.admin_export_grants()        to authenticated;
