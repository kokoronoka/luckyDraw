-- =============================================================================
-- PRACTICE PROJECT SETUP — GENERATED FILE. Run ONLY in the practice Supabase project.
-- Contents: 001–006 migrations + seed + practice/rehearsal_data.sql
-- =============================================================================

-- >>>>>>>>>> migrations/001_schema.sql
-- =============================================================================
-- ZÉLL-V《健康一起 WIN》Lucky Draw — 001 schema
-- Run order: 001_schema.sql → 002_functions.sql → 003_rls.sql → seed.sql
-- Timezone: all timestamps are timestamptz; business dates are interpreted in
-- Asia/Kuala_Lumpur (UTC+8).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Settings (single row). Open business-rule assumptions live here so they can
-- be flipped without a code change.
-- -----------------------------------------------------------------------------
create table public.app_settings (
  id                         boolean primary key default true check (id),
  repeat_bonus_tickets       int     not null default 3  check (repeat_bonus_tickets >= 0),
  referral_bonus_tickets     int     not null default 5  check (referral_bonus_tickets >= 0),
  max_tickets_per_invoice    int     not null default 100 check (max_tickets_per_invoice >= 1),
  -- Open assumption #1: does a 2nd purchase in the SAME round get the repeat bonus?
  repeat_bonus_same_round    boolean not null default false,
  -- Open assumption #2: do top-up invoices earn (and count towards) the repeat bonus?
  repeat_bonus_on_topup      boolean not null default false,
  -- Safety: reject invoice dates later than today (MYT). Turn off only for testing.
  block_future_invoice_dates boolean not null default true,
  updated_at                 timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Staff profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'sales' check (role in ('sales', 'admin')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Rounds. id = round number (1..4) and is used for "earlier round" comparisons.
-- -----------------------------------------------------------------------------
create table public.rounds (
  id                  int primary key check (id between 1 and 99),
  code                text not null unique,           -- 'R1'
  name_zh             text not null,                  -- '第一轮'
  name_en             text not null,                  -- 'Round 1'
  purchase_start      date not null,
  purchase_end        date not null,
  allocation_deadline timestamptz not null,
  draw_date           date not null,
  check (purchase_end >= purchase_start),
  check (allocation_deadline >= (purchase_end::timestamp at time zone 'Asia/Kuala_Lumpur')),
  -- purchase windows may never overlap, so an invoice date maps to exactly one round
  constraint rounds_no_overlap exclude using gist (
    daterange(purchase_start, purchase_end, '[]') with &&
  )
);

-- -----------------------------------------------------------------------------
-- Prize categories. rank 2/3/4 per round; exactly one Grand Prize (rank 1).
-- -----------------------------------------------------------------------------
create table public.prize_categories (
  id           serial primary key,
  round_id     int references public.rounds(id),
  rank         smallint not null check (rank between 1 and 4),
  is_grand     boolean not null default false,
  name_zh      text not null,
  name_en      text not null,
  prize_desc   text,                                  -- e.g. 'iPhone 17'
  winner_slots int not null default 1 check (winner_slots >= 0),
  check (
    (is_grand and round_id is null and rank = 1)
    or (not is_grand and round_id is not null and rank in (2, 3, 4))
  ),
  unique (round_id, rank),
  unique (id, round_id),   -- target for allocations composite FK
  unique (id, rank)        -- target for winners composite FK
);
create unique index prize_categories_one_grand on public.prize_categories ((true)) where is_grand;

-- -----------------------------------------------------------------------------
-- Customers. Identity = normalised phone (60XXXXXXXXX).
-- -----------------------------------------------------------------------------
create table public.customers (
  id              uuid primary key default gen_random_uuid(),
  phone           text not null unique check (phone ~ '^60[0-9]{8,10}$'),
  name            text not null check (length(btrim(name)) > 0),
  email           text,
  wallet_token    uuid not null unique default gen_random_uuid(),
  created_by      uuid references public.profiles(id),
  referred_by     uuid references public.customers(id),
  pdpa_consent_at timestamptz,
  first_opened_at timestamptz,
  last_opened_at  timestamptz,
  open_count      int not null default 0,
  created_at      timestamptz not null default now(),
  check (referred_by is distinct from id)
);
create index customers_created_by_idx on public.customers (created_by);

-- -----------------------------------------------------------------------------
-- Invoices (one per purchase/top-up entry). Invoice numbers are unique among
-- non-voided invoices (case/space-insensitive).
-- -----------------------------------------------------------------------------
create table public.invoices (
  id                   bigint generated always as identity primary key,
  invoice_no           text not null check (length(btrim(invoice_no)) > 0),
  invoice_date         date not null,
  customer_id          uuid not null references public.customers(id),
  round_id             int  not null references public.rounds(id),
  source               text not null check (source in ('purchase', 'topup')),
  tickets              int  not null check (tickets > 0),
  referrer_customer_id uuid references public.customers(id),
  sales_id             uuid references public.profiles(id),
  voided_at            timestamptz,
  voided_by            uuid references public.profiles(id),
  void_reason          text,
  created_at           timestamptz not null default now(),
  check (referrer_customer_id is distinct from customer_id)
);
create unique index invoices_no_unique on public.invoices (upper(btrim(invoice_no))) where voided_at is null;
create index invoices_customer_idx on public.invoices (customer_id);

-- -----------------------------------------------------------------------------
-- Ticket grants: every ticket source is its own row. Never deleted; voided.
-- -----------------------------------------------------------------------------
create table public.ticket_grants (
  id                  bigint generated always as identity primary key,
  customer_id         uuid not null references public.customers(id),
  round_id            int  not null references public.rounds(id),
  source              text not null check (source in ('purchase', 'topup', 'repeat_bonus', 'referral')),
  tickets             int  not null check (tickets > 0),
  invoice_id          bigint references public.invoices(id),
  related_customer_id uuid references public.customers(id),  -- referral counterpart
  sales_id            uuid references public.profiles(id),
  note                text,
  voided_at           timestamptz,
  voided_by           uuid references public.profiles(id),
  void_reason         text,
  created_at          timestamptz not null default now(),
  check ((voided_at is null) or (void_reason is not null and length(btrim(void_reason)) > 0))
);
create index ticket_grants_customer_round_idx on public.ticket_grants (customer_id, round_id);
create index ticket_grants_invoice_idx on public.ticket_grants (invoice_id);
create index ticket_grants_sales_idx on public.ticket_grants (sales_id);
-- at most one live repeat bonus per invoice
create unique index ticket_grants_one_repeat_per_invoice
  on public.ticket_grants (invoice_id) where source = 'repeat_bonus' and voided_at is null;

-- -----------------------------------------------------------------------------
-- Allocations: append-only. Each wallet submission inserts one row per tier.
-- -----------------------------------------------------------------------------
create table public.allocations (
  id                bigint generated always as identity primary key,
  customer_id       uuid not null references public.customers(id),
  round_id          int  not null references public.rounds(id),
  prize_category_id int  not null,
  tickets           int  not null check (tickets > 0),
  submission_id     uuid not null,
  created_at        timestamptz not null default now(),
  foreign key (prize_category_id, round_id) references public.prize_categories (id, round_id)
);
create index allocations_customer_round_idx on public.allocations (customer_id, round_id);
create index allocations_category_idx on public.allocations (prize_category_id);

-- -----------------------------------------------------------------------------
-- Draw log + winners (populated by the M2 draw RPC; created now so the wallet
-- can show announcements and the rules are enforced at the table level).
-- -----------------------------------------------------------------------------
create table public.draws (
  id                 bigint generated always as identity primary key,
  prize_category_id  int  not null references public.prize_categories(id),
  run_by             uuid not null references public.profiles(id),
  run_at             timestamptz not null default now(),
  pool_size          int    not null,
  total_tickets      bigint not null,
  random_value       bigint not null,     -- the secure random number in [0, total_tickets)
  winner_customer_id uuid references public.customers(id),
  replaces_winner_id bigint,              -- set when this draw is a forfeit redraw
  details            jsonb
);

create table public.winners (
  id                bigint generated always as identity primary key,
  prize_category_id int      not null,
  rank              smallint not null,
  customer_id       uuid     not null references public.customers(id),
  draw_id           bigint   not null references public.draws(id),
  tickets_in_pool   bigint   not null,
  status            text     not null default 'won' check (status in ('won', 'forfeited')),
  forfeited_at      timestamptz,
  forfeited_by      uuid references public.profiles(id),
  forfeit_reason    text,
  created_at        timestamptz not null default now(),
  foreign key (prize_category_id, rank) references public.prize_categories (id, rank)
);
-- A customer can win each prize tier (rank) at most once in the whole event.
create unique index winners_one_per_tier on public.winners (customer_id, rank) where status = 'won';
create index winners_category_idx on public.winners (prize_category_id);

-- -----------------------------------------------------------------------------
-- New auth user → profile row (role 'sales' by default; promote in admin page
-- or SQL). Disable public sign-ups in Supabase Auth settings!
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- >>>>>>>>>> migrations/002_functions.sql
-- =============================================================================
-- ZÉLL-V Lucky Draw — 002 functions (M1)
-- Helpers, issue_tickets (with repeat/referral bonus logic), staff lookups,
-- and the public token-based wallet RPCs.
-- Error messages are bilingual "中文 / English" so the UI can show them as-is.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------

-- Normalise a Malaysian phone number to 60XXXXXXXXX (digits only).
--   '012-345 6789' → '60123456789', '+60 12-345 6789' → '60123456789',
--   '123456789' → '60123456789'. Returns NULL for empty input. Does not validate.
create or replace function public.normalize_phone(p text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  d text;
begin
  if p is null then
    return null;
  end if;
  d := regexp_replace(p, '\D', '', 'g');
  if d = '' then
    return null;
  end if;
  if d like '60%' then
    return d;
  elsif d like '0%' then
    return '6' || d;
  else
    return '60' || d;
  end if;
end;
$$;

create or replace function public.is_valid_phone(p text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p ~ '^60[0-9]{8,10}$', false)
$$;

-- '陈大文' → '陈**', 'Tan Ah Kow' → 'T** A* K**'
create or replace function public.mask_name(p text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  n   text := btrim(coalesce(p, ''));
  w   text;
  res text[] := '{}';
begin
  if n = '' then
    return '';
  end if;
  if n ~ '[⺀-鿿豈-﫿]' then
    return left(n, 1) || repeat('*', least(greatest(char_length(n) - 1, 1), 3));
  end if;
  foreach w in array regexp_split_to_array(n, '\s+') loop
    res := res || (left(w, 1) || repeat('*', least(greatest(char_length(w) - 1, 1), 3)));
  end loop;
  return array_to_string(res, ' ');
end;
$$;

-- '60123455678' → '012-***-5678'
create or replace function public.mask_phone(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when public.is_valid_phone(p) then left('0' || substr(p, 3), 3) || '-***-' || right(p, 4)
    else '***'
  end
$$;

create or replace function public.myt_today()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone 'Asia/Kuala_Lumpur')::date
$$;

create or replace function public.fmt_myt(ts timestamptz)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select to_char(ts at time zone 'Asia/Kuala_Lumpur', 'DD Mon YYYY HH24:MI') || ' (MYT)'
$$;

-- -----------------------------------------------------------------------------
-- Role helpers (used by RLS policies and RPCs)
-- -----------------------------------------------------------------------------
create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_staff_role() is not null
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_staff_role() = 'admin', false)
$$;

-- -----------------------------------------------------------------------------
-- Repeat-bonus reconciliation (internal).
-- An eligible invoice in round N earns +repeat_bonus_tickets when the customer
-- has another eligible, non-voided invoice in an earlier round (< N), or, if
-- repeat_bonus_same_round is on, an earlier invoice in the same round.
-- Running this after every insert also handles invoices entered out of order
-- (e.g. a late R1 invoice entered after an R2 one: the R2 invoice gets its
-- bonus retroactively, while R2 is still open).
-- Returns the grants inserted, as a jsonb array.
-- -----------------------------------------------------------------------------
create or replace function public._reconcile_repeat_bonuses(p_customer uuid, p_sales uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s        public.app_settings;
  v_srcs   text[];
  r        record;
  v_gid    bigint;
  v_out    jsonb := '[]'::jsonb;
begin
  select * into s from public.app_settings where id;
  if not found or s.repeat_bonus_tickets <= 0 then
    return v_out;
  end if;
  v_srcs := case when s.repeat_bonus_on_topup then array['purchase', 'topup'] else array['purchase'] end;

  for r in
    select i.id, i.round_id, i.invoice_no, rd.code as round_code
    from public.invoices i
    join public.rounds rd on rd.id = i.round_id
    where i.customer_id = p_customer
      and i.voided_at is null
      and i.source = any (v_srcs)
      and now() <= rd.allocation_deadline
      and not exists (
        select 1 from public.ticket_grants g
        where g.invoice_id = i.id and g.source = 'repeat_bonus' and g.voided_at is null
      )
      and exists (
        select 1 from public.invoices j
        where j.customer_id = p_customer
          and j.voided_at is null
          and j.id <> i.id
          and j.source = any (v_srcs)
          and (
            j.round_id < i.round_id
            or (s.repeat_bonus_same_round
                and j.round_id = i.round_id
                and (j.invoice_date, j.id) < (i.invoice_date, i.id))
          )
      )
    order by i.round_id, i.invoice_date, i.id
  loop
    insert into public.ticket_grants (customer_id, round_id, source, tickets, invoice_id, sales_id, note)
    values (p_customer, r.round_id, 'repeat_bonus', s.repeat_bonus_tickets, r.id, p_sales,
            'Repeat bonus for invoice ' || r.invoice_no)
    returning id into v_gid;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'grant_id', v_gid,
      'source', 'repeat_bonus',
      'tickets', s.repeat_bonus_tickets,
      'round_id', r.round_id,
      'round_code', r.round_code,
      'invoice_id', r.id,
      'invoice_no', r.invoice_no
    ));
  end loop;

  return v_out;
end;
$$;

-- -----------------------------------------------------------------------------
-- Core ticket issuing (internal; no auth check, see issue_tickets()).
-- -----------------------------------------------------------------------------
create or replace function public._issue_tickets_core(
  p_phone          text,
  p_name           text,
  p_email          text,
  p_invoice_no     text,
  p_invoice_date   date,
  p_source         text,
  p_tickets        int,
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
  c            public.customers;
  ref          public.customers;
  v_is_new     boolean;
  v_has_grants boolean;
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
    raise exception '来源必须是 purchase 或 topup / Source must be purchase or topup';
  end if;
  if p_tickets is null or p_tickets < 1 or p_tickets > s.max_tickets_per_invoice then
    raise exception '抽奖券数量必须在 1 到 % 之间 / Ticket count must be between 1 and %',
      s.max_tickets_per_invoice, s.max_tickets_per_invoice;
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

  -- ---- round from invoice date ----------------------------------------------
  select * into rd from public.rounds
  where p_invoice_date between purchase_start and purchase_end;
  if not found then
    raise exception '发票日期 % 不在任何一轮的购买期内 / Invoice date % is not within any round''s purchase window',
      p_invoice_date, p_invoice_date;
  end if;
  if now() > rd.allocation_deadline then
    raise exception '% 已于 % 截止，不能再录入发票 / % closed for entries on %',
      rd.code, public.fmt_myt(rd.allocation_deadline), rd.code, public.fmt_myt(rd.allocation_deadline);
  end if;

  -- ---- invoice number uniqueness ------------------------------------------
  if exists (
    select 1 from public.invoices
    where upper(btrim(invoice_no)) = upper(v_inv_no) and voided_at is null
  ) then
    raise exception '发票号码 % 已被使用 / Invoice number % has already been used', v_inv_no, v_inv_no;
  end if;

  -- ---- customer (lock by phone to serialise concurrent entries) --------------
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
    update public.customers
       set name  = coalesce(v_name, name),
           email = coalesce(v_email, email)
     where id = c.id
    returning * into c;
    v_has_grants := exists (
      select 1 from public.ticket_grants where customer_id = c.id and voided_at is null
    );
  end if;

  -- ---- referral validation --------------------------------------------------
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
    if v_has_grants then
      raise exception '此顾客已有抽奖券，不是新顾客，不能使用推荐 / This customer already has tickets, so is not new and cannot be referred';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('ld_customer:' || v_ref_phone, 0));
    select * into ref from public.customers where phone = v_ref_phone for update;
    if not found or not exists (
      select 1 from public.ticket_grants where customer_id = ref.id and voided_at is null
    ) then
      raise exception '推荐人 % 不是现有顾客 / Referrer % is not an existing customer',
        public.mask_phone(v_ref_phone), public.mask_phone(v_ref_phone);
    end if;
  end if;

  -- ---- invoice + main grant -----------------------------------------------
  insert into public.invoices (invoice_no, invoice_date, customer_id, round_id, source, tickets,
                               referrer_customer_id, sales_id)
  values (v_inv_no, p_invoice_date, c.id, rd.id, p_source, p_tickets, ref.id, p_sales)
  returning id into v_invoice_id;

  insert into public.ticket_grants (customer_id, round_id, source, tickets, invoice_id, sales_id)
  values (c.id, rd.id, p_source, p_tickets, v_invoice_id, p_sales)
  returning id into v_gid;

  v_grants := v_grants || jsonb_build_array(jsonb_build_object(
    'grant_id', v_gid, 'recipient', 'customer', 'customer_name', c.name,
    'source', p_source, 'tickets', p_tickets,
    'round_id', rd.id, 'round_code', rd.code, 'invoice_no', v_inv_no
  ));

  -- ---- repeat bonus (this invoice + any retroactive ones) -------------------
  v_repeat := public._reconcile_repeat_bonuses(c.id, p_sales);
  for v_item in select * from jsonb_array_elements(v_repeat) loop
    v_grants := v_grants || jsonb_build_array(
      v_item || jsonb_build_object(
        'recipient', 'customer',
        'customer_name', c.name,
        'retroactive', (v_item ->> 'invoice_id')::bigint <> v_invoice_id
      )
    );
  end loop;

  -- ---- referral bonus (+N each, in the new customer's purchase round) -------
  if ref.id is not null and s.referral_bonus_tickets > 0 then
    insert into public.ticket_grants (customer_id, round_id, source, tickets, invoice_id, related_customer_id, sales_id, note)
    values (c.id, rd.id, 'referral', s.referral_bonus_tickets, v_invoice_id, ref.id, p_sales,
            'Referred by ' || ref.phone)
    returning id into v_gid;
    v_grants := v_grants || jsonb_build_array(jsonb_build_object(
      'grant_id', v_gid, 'recipient', 'customer', 'customer_name', c.name,
      'source', 'referral', 'tickets', s.referral_bonus_tickets,
      'round_id', rd.id, 'round_code', rd.code
    ));

    insert into public.ticket_grants (customer_id, round_id, source, tickets, invoice_id, related_customer_id, sales_id, note)
    values (ref.id, rd.id, 'referral', s.referral_bonus_tickets, v_invoice_id, c.id, p_sales,
            'Referred ' || c.phone)
    returning id into v_gid;
    v_grants := v_grants || jsonb_build_array(jsonb_build_object(
      'grant_id', v_gid, 'recipient', 'referrer', 'customer_name', ref.name,
      'source', 'referral', 'tickets', s.referral_bonus_tickets,
      'round_id', rd.id, 'round_code', rd.code
    ));
  end if;

  if ref.id is not null then
    update public.customers set referred_by = ref.id where id = c.id and referred_by is null;
  end if;

  return jsonb_build_object(
    'invoice_id', v_invoice_id,
    'customer', jsonb_build_object(
      'id', c.id, 'phone', c.phone, 'name', c.name, 'email', c.email,
      'wallet_token', c.wallet_token, 'is_new', v_is_new
    ),
    'referrer', case when ref.id is null then null else jsonb_build_object(
      'id', ref.id, 'name', ref.name, 'phone', ref.phone, 'wallet_token', ref.wallet_token
    ) end,
    'round', jsonb_build_object(
      'id', rd.id, 'code', rd.code, 'name_zh', rd.name_zh, 'name_en', rd.name_en,
      'allocation_deadline', rd.allocation_deadline, 'draw_date', rd.draw_date
    ),
    'grants', v_grants,
    'customer_new_tickets', (
      select coalesce(sum((g ->> 'tickets')::int), 0)
      from jsonb_array_elements(v_grants) g where g ->> 'recipient' = 'customer'
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- issue_tickets: the staff-facing RPC. p_dry_run = true runs the exact same
-- logic and then rolls it back, so the preview always matches what is saved.
-- -----------------------------------------------------------------------------
create or replace function public.issue_tickets(
  p_phone          text,
  p_name           text,
  p_email          text,
  p_invoice_no     text,
  p_invoice_date   date,
  p_source         text,
  p_tickets        int,
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
                                        p_source, p_tickets, p_referrer_phone, auth.uid());
    if p_dry_run then
      raise exception 'dry run rollback' using errcode = 'LDDRY';
    end if;
  exception when sqlstate 'LDDRY' then
    -- all writes in this block were rolled back; hide ids that no longer exist
    v_res := v_res #- '{invoice_id}' #- '{customer,id}' #- '{customer,wallet_token}';
  end;

  return v_res || jsonb_build_object('dry_run', coalesce(p_dry_run, false));
end;
$$;

-- -----------------------------------------------------------------------------
-- lookup_customer: autofill for the issue-tickets form.
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
    'valid', true,
    'exists', true,
    'phone', c.phone,
    'name', c.name,
    'email', c.email,
    'has_tickets', exists (select 1 from public.ticket_grants g where g.customer_id = c.id and g.voided_at is null),
    'purchase_rounds', (
      select coalesce(jsonb_agg(distinct i.round_id), '[]'::jsonb)
      from public.invoices i
      where i.customer_id = c.id and i.voided_at is null and i.source = 'purchase'
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- my_customers: per-customer summary for the logged-in salesperson
-- (admins get every customer).
-- -----------------------------------------------------------------------------
create or replace function public.my_customers()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_admin boolean := public.is_admin();
  v_out   jsonb;
begin
  if not public.is_staff() then
    raise exception '没有权限 / Not authorised' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x.j order by x.last_activity desc nulls last), '[]'::jsonb)
  into v_out
  from (
    select
      (select max(g.created_at) from public.ticket_grants g where g.customer_id = c.id) as last_activity,
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'phone', c.phone,
        'email', c.email,
        'wallet_token', c.wallet_token,
        'pdpa_consent_at', c.pdpa_consent_at,
        'first_opened_at', c.first_opened_at,
        'last_opened_at', c.last_opened_at,
        'open_count', c.open_count,
        'created_at', c.created_at,
        'last_activity', (select max(g.created_at) from public.ticket_grants g where g.customer_id = c.id),
        'rounds', (
          select jsonb_agg(jsonb_build_object(
                   'round_id', r.id,
                   'code', r.code,
                   'is_open', now() <= r.allocation_deadline,
                   'granted', gt.total,
                   'allocated', at.total,
                   'unallocated', greatest(gt.total - at.total, 0)
                 ) order by r.id)
          from public.rounds r
          cross join lateral (
            select coalesce(sum(g.tickets), 0)::int as total
            from public.ticket_grants g
            where g.customer_id = c.id and g.round_id = r.id and g.voided_at is null
          ) gt
          cross join lateral (
            select coalesce(sum(a.tickets), 0)::int as total
            from public.allocations a
            where a.customer_id = c.id and a.round_id = r.id
          ) at
        ),
        'total_tickets', (
          select coalesce(sum(g.tickets), 0)::int
          from public.ticket_grants g
          where g.customer_id = c.id and g.voided_at is null
        )
      ) as j
    from public.customers c
    where v_admin
       or c.created_by = v_uid
       or exists (select 1 from public.ticket_grants g where g.customer_id = c.id and g.sales_id = v_uid)
  ) x;

  return v_out;
end;
$$;

-- -----------------------------------------------------------------------------
-- Wallet payload (internal). Only masked data about other customers is exposed.
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
      'allocated_total', a.total,
      'unallocated', greatest(g.total - a.total, 0),
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
      select coalesce(sum(al.tickets), 0)::int as total
      from public.allocations al
      where al.customer_id = c.id and al.round_id = r.id
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
                 select coalesce(sum(al.tickets), 0)::int
                 from public.allocations al
                 where al.customer_id = c.id and al.prize_category_id = pc.id
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

-- Resolve a wallet token (text, so a malformed link gives a friendly error).
create or replace function public._customer_by_token(p_token text, p_lock boolean default false)
returns public.customers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.customers;
begin
  if p_token is null
     or p_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception '链接无效 / Invalid link' using errcode = 'P0002';
  end if;
  if p_lock then
    select * into c from public.customers where wallet_token = p_token::uuid for update;
  else
    select * into c from public.customers where wallet_token = p_token::uuid;
  end if;
  if not found then
    raise exception '链接无效 / Invalid link' using errcode = 'P0002';
  end if;
  return c;
end;
$$;

-- -----------------------------------------------------------------------------
-- Public wallet RPCs (anon)
-- -----------------------------------------------------------------------------
create or replace function public.get_wallet(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.customers;
begin
  c := public._customer_by_token(p_token);

  update public.customers
     set first_opened_at = coalesce(first_opened_at, now()),
         last_opened_at  = now(),
         open_count      = open_count + 1
   where id = c.id;

  if c.pdpa_consent_at is null then
    return jsonb_build_object('consent_required', true, 'server_now', now());
  end if;

  return public._wallet_payload(c.id);
end;
$$;

create or replace function public.accept_pdpa(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.customers;
begin
  c := public._customer_by_token(p_token, true);
  update public.customers
     set pdpa_consent_at = coalesce(pdpa_consent_at, now())
   where id = c.id;
  return public._wallet_payload(c.id);
end;
$$;

-- p_alloc: {"<prize_category_id>": <tickets>, ...} for the round's 2nd/3rd/4th
-- prizes. Must allocate the ENTIRE unallocated balance. Submissions are final.
create or replace function public.submit_allocation(p_token text, p_round_id int, p_alloc jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c         public.customers;
  rd        public.rounds;
  v_granted int;
  v_alloc   int;
  v_balance int;
  v_sum     int := 0;
  v_sub     uuid := gen_random_uuid();
  k         text;
  v         jsonb;
  v_cat     int;
  v_n       numeric;
begin
  c := public._customer_by_token(p_token, true);   -- row lock serialises double-submits

  if c.pdpa_consent_at is null then
    raise exception '请先同意个人资料保护声明 / Please accept the PDPA notice first';
  end if;

  select * into rd from public.rounds where id = p_round_id;
  if not found then
    raise exception '轮次无效 / Invalid round';
  end if;
  if now() > rd.allocation_deadline then
    raise exception '% 的分配已于 % 截止 / Allocation for % closed on %',
      rd.code, public.fmt_myt(rd.allocation_deadline), rd.code, public.fmt_myt(rd.allocation_deadline);
  end if;

  if p_alloc is null or jsonb_typeof(p_alloc) <> 'object' then
    raise exception '分配数据无效 / Invalid allocation data';
  end if;

  select coalesce(sum(tickets), 0) into v_granted
  from public.ticket_grants
  where customer_id = c.id and round_id = rd.id and voided_at is null;

  select coalesce(sum(tickets), 0) into v_alloc
  from public.allocations
  where customer_id = c.id and round_id = rd.id;

  v_balance := v_granted - v_alloc;
  if v_balance <= 0 then
    raise exception '% 没有未分配的抽奖券 / You have no unallocated tickets for %', rd.code, rd.code;
  end if;

  -- validate every entry first
  for k, v in select * from jsonb_each(p_alloc) loop
    if k !~ '^[0-9]{1,9}$' then
      raise exception '奖项无效 / Invalid prize category';
    end if;
    v_cat := k::int;
    if not exists (
      select 1 from public.prize_categories
      where id = v_cat and round_id = rd.id and not is_grand
    ) then
      raise exception '奖项不属于 % / Prize category does not belong to %', rd.code, rd.code;
    end if;
    if jsonb_typeof(v) <> 'number' then
      raise exception '数量无效 / Invalid ticket count';
    end if;
    v_n := (v #>> '{}')::numeric;
    if v_n < 0 or v_n <> trunc(v_n) or v_n > 1000000 then
      raise exception '数量无效 / Invalid ticket count';
    end if;
    v_sum := v_sum + v_n::int;
  end loop;

  if v_sum <> v_balance then
    raise exception '必须一次分配全部 % 张抽奖券（目前 % 张），请刷新页面 / You must allocate all % tickets (got %). Please refresh the page.',
      v_balance, v_sum, v_balance, v_sum;
  end if;

  insert into public.allocations (customer_id, round_id, prize_category_id, tickets, submission_id)
  select c.id, rd.id, e.key::int, (e.value #>> '{}')::numeric::int, v_sub
  from jsonb_each(p_alloc) e
  where (e.value #>> '{}')::numeric > 0;

  return public._wallet_payload(c.id);
end;
$$;

-- >>>>>>>>>> migrations/003_rls.sql
-- =============================================================================
-- ZÉLL-V Lucky Draw — 003 row level security + privileges
-- Principles:
--   * anon can read NO table; it may only call get_wallet / accept_pdpa /
--     submit_allocation (token-based, security definer).
--   * Staff never write customer/ticket tables directly; all writes go through
--     security-definer RPCs. Direct table access is read-only (plus admin
--     edits to configuration tables).
--   * Salespeople see only their own customers; admins see everything.
-- =============================================================================

-- ---- enable RLS everywhere ----------------------------------------------------
alter table public.app_settings     enable row level security;
alter table public.profiles         enable row level security;
alter table public.rounds           enable row level security;
alter table public.prize_categories enable row level security;
alter table public.customers        enable row level security;
alter table public.invoices         enable row level security;
alter table public.ticket_grants    enable row level security;
alter table public.allocations      enable row level security;
alter table public.draws            enable row level security;
alter table public.winners          enable row level security;

-- ---- table privileges ---------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on
  public.app_settings, public.profiles, public.rounds, public.prize_categories,
  public.customers, public.invoices, public.ticket_grants, public.allocations,
  public.draws, public.winners
to authenticated;

-- admin-editable configuration (RLS below restricts these to admins)
grant update on public.app_settings, public.rounds, public.prize_categories to authenticated;
grant insert on public.rounds, public.prize_categories to authenticated;
grant update (role, active, full_name) on public.profiles to authenticated;
grant update (name, email) on public.customers to authenticated;

-- ---- policies -----------------------------------------------------------------
-- app_settings / rounds / prize_categories: any active staff can read, admins edit
create policy app_settings_select on public.app_settings for select to authenticated
  using (public.is_staff());
create policy app_settings_update on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy rounds_select on public.rounds for select to authenticated
  using (public.is_staff());
create policy rounds_insert on public.rounds for insert to authenticated
  with check (public.is_admin());
create policy rounds_update on public.rounds for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy prize_categories_select on public.prize_categories for select to authenticated
  using (public.is_staff());
create policy prize_categories_insert on public.prize_categories for insert to authenticated
  with check (public.is_admin());
create policy prize_categories_update on public.prize_categories for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profiles: everyone reads their own row; admins read/update all
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- customers: admin, the creator, or any salesperson who issued them a grant
create policy customers_select on public.customers for select to authenticated
  using (
    public.is_admin()
    or (public.is_staff() and (
         created_by = (select auth.uid())
         or exists (select 1 from public.ticket_grants g
                    where g.customer_id = customers.id and g.sales_id = (select auth.uid()))
       ))
  );
create policy customers_update on public.customers for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- invoices / grants: admin, or the salesperson who entered them
create policy invoices_select on public.invoices for select to authenticated
  using (public.is_admin() or (public.is_staff() and sales_id = (select auth.uid())));

create policy ticket_grants_select on public.ticket_grants for select to authenticated
  using (public.is_admin() or (public.is_staff() and sales_id = (select auth.uid())));

-- allocations: admin, or a salesperson linked to that customer
create policy allocations_select on public.allocations for select to authenticated
  using (
    public.is_admin()
    or (public.is_staff() and exists (
          select 1 from public.customers c
          where c.id = allocations.customer_id
            and (c.created_by = (select auth.uid())
                 or exists (select 1 from public.ticket_grants g
                            where g.customer_id = c.id and g.sales_id = (select auth.uid())))
       ))
  );

-- draws / winners: staff read (writes only through admin RPCs in M2)
create policy draws_select on public.draws for select to authenticated
  using (public.is_staff());
create policy winners_select on public.winners for select to authenticated
  using (public.is_staff());

-- ---- function privileges ------------------------------------------------------
-- Postgres/Supabase grant EXECUTE to PUBLIC/anon/authenticated by default.
-- Start from zero and grant only the intended entry points.
revoke execute on all functions in schema public from public, anon, authenticated;

-- public wallet (token-based)
grant execute on function public.get_wallet(text)                     to anon, authenticated;
grant execute on function public.accept_pdpa(text)                    to anon, authenticated;
grant execute on function public.submit_allocation(text, int, jsonb)  to anon, authenticated;

-- staff
grant execute on function public.issue_tickets(text, text, text, text, date, text, int, text, boolean) to authenticated;
grant execute on function public.lookup_customer(text)  to authenticated;
grant execute on function public.my_customers()         to authenticated;

-- helpers used inside RLS policies / harmless utilities
grant execute on function public.current_staff_role()   to authenticated;
grant execute on function public.is_staff()             to authenticated;
grant execute on function public.is_admin()             to authenticated;
grant execute on function public.normalize_phone(text)  to authenticated;
grant execute on function public.is_valid_phone(text)   to authenticated;
grant execute on function public.mask_name(text)        to authenticated;
grant execute on function public.mask_phone(text)       to authenticated;

-- >>>>>>>>>> migrations/004_draw_admin.sql
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

-- >>>>>>>>>> migrations/005_win_rules.sql
-- =============================================================================
-- ZÉLL-V Lucky Draw — 005 winning rules (decided 2026-11-05, per campaign T&C)
-- Run after 004. Safe on a live database.
--
--   * A customer may win again in a later round, in ANY tier
--     (removes the old "each tier only once in the whole event" rule)
--   * A customer may win different tiers in the same round (e.g. 2nd and 4th)
--   * Round winners remain eligible for the Grand Prize
--   * A customer can't hold two winner slots of the same prize category
--     (e.g. two of R1's 4th prizes, or the Grand Prize twice)
--   * A forfeited customer is excluded from the redraw of that category
-- =============================================================================

drop index if exists public.winners_one_per_tier;
create unique index if not exists winners_one_per_category
  on public.winners (customer_id, prize_category_id) where status = 'won';

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
    -- already holds a slot of THIS prize category (won or forfeited)
    and not exists (select 1 from public.winners w
                    where w.customer_id = b.customer_id
                      and w.prize_category_id = cat.id
                      and w.status in ('won', 'forfeited'));
end;
$$;

revoke execute on function public._draw_pool(int) from public, anon, authenticated;

-- >>>>>>>>>> migrations/006_packages.sql
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

-- >>>>>>>>>> seed.sql
-- =============================================================================
-- ZÉLL-V Lucky Draw — seed data
-- Safe to re-run: existing rows are left untouched.
-- Section 3 creates FAKE test customers (phones 6010000000x, names start with
-- "测试"/"Test"). Remove them before go-live with supabase/reset_test_data.sql.
-- =============================================================================

-- 1. Settings -------------------------------------------------------------------
insert into public.app_settings (id) values (true)
on conflict (id) do nothing;

-- 2. Rounds + prize categories (slot counts are PLACEHOLDERS — set real ones) ----
insert into public.rounds (id, code, name_zh, name_en, purchase_start, purchase_end, allocation_deadline, draw_date) values
  (1, 'R1', '第一轮', 'Round 1', '2026-11-11', '2026-11-23', '2026-11-24 23:59:59+08', '2026-11-25'),
  (2, 'R2', '第二轮', 'Round 2', '2026-11-24', '2026-12-07', '2026-12-08 23:59:59+08', '2026-12-09'),
  (3, 'R3', '第三轮', 'Round 3', '2026-12-08', '2026-12-21', '2026-12-22 23:59:59+08', '2026-12-23'),
  (4, 'R4', '第四轮', 'Round 4', '2026-12-22', '2026-12-31', '2027-01-07 23:59:59+08', '2027-01-08')
on conflict (id) do nothing;

insert into public.prize_categories (round_id, rank, is_grand, name_zh, name_en, winner_slots)
select r.id, p.rank, false, p.name_zh, p.name_en, p.slots
from public.rounds r
cross join (values
  (2, '二等奖', '2nd Prize', 1),
  (3, '三等奖', '3rd Prize', 2),
  (4, '四等奖', '4th Prize', 5)
) as p(rank, name_zh, name_en, slots)
on conflict (round_id, rank) do nothing;

insert into public.prize_categories (round_id, rank, is_grand, name_zh, name_en, winner_slots)
select null, 1, true, '总决赛大奖', 'Grand Prize', 1
where not exists (select 1 from public.prize_categories where is_grand);

-- 3. FAKE test customers (via the real issuing logic) ---------------------------
-- Invoice dates are in the future relative to setup, so the future-date guard
-- is switched off for the duration of this block and then restored.
do $$
declare
  v_block boolean;
begin
  if exists (select 1 from public.customers where phone like '6010000000%') then
    raise notice 'Test customers already exist, skipping.';
    return;
  end if;

  select block_future_invoice_dates into v_block from public.app_settings where id;
  update public.app_settings set block_future_invoice_dates = false where id;

  -- Requires migration 006 (package-based issuing).
  --                                 phone         name               email               invoice      date          source      package       qty referrer      sales
  perform public._issue_tickets_core('0100000001', '测试陈大文',      'chan@example.com', 'TEST-0001', '2026-11-12', 'purchase', 'ORAL_1',      5, null,         null);
  perform public._issue_tickets_core('0100000002', '测试林美玲',      null,               'TEST-0002', '2026-11-13', 'purchase', 'ORAL_1',      2, '0100000001', null);  -- referral +5/+5
  perform public._issue_tickets_core('0100000003', 'Test Tan Ah Kow', null,               'TEST-0003', '2026-11-14', 'purchase', 'ORAL_B4F1',   1, null,         null);  -- 4 tickets
  perform public._issue_tickets_core('0100000003', null,              null,               'TEST-0004', '2026-11-15', 'topup',    'ORAL_1',      2, null,         null);  -- top up 4 → 6 boxes: +2
  perform public._issue_tickets_core('0100000001', null,              null,               'TEST-0005', '2026-11-26', 'purchase', 'ORAL_1',      3, null,         null);  -- R2: repeat +3
  perform public._issue_tickets_core('0100000004', '测试黄小明',      null,               'TEST-0006', '2026-11-28', 'purchase', 'VOUCHER_10K', 1, null,         null);  -- 10 tickets
  perform public._issue_tickets_core('0100000005', '测试李志强',      null,               'TEST-0007', '2026-11-20', 'purchase', 'ORAL_1',      1, null,         null);
  perform public._issue_tickets_core('0100000005', null,              null,               'TEST-0008', '2026-12-10', 'purchase', 'ORAL_1',      2, null,         null);  -- R3: repeat +3
  perform public._issue_tickets_core('0100000005', null,              null,               'TEST-0009', '2026-12-28', 'purchase', 'ORAL_1',      3, null,         null);  -- R4: repeat +3

  update public.app_settings set block_future_invoice_dates = v_block where id;
end;
$$;

-- Wallet links for the test customers (prefix with your wallet.html URL + "?t=")
select name, phone, wallet_token
from public.customers
where phone like '6010000000%'
order by phone;

-- >>>>>>>>>> practice/rehearsal_data.sql
-- =============================================================================
-- PRACTICE PROJECT ONLY — rehearsal data (included in practice_setup.sql)
-- 80 fake customers with R1 tickets spread across 2nd/3rd/4th prize, rehearsal
-- slot counts, and the draw schedule switched OFF so you can draw today.
-- =============================================================================

-- marker table: practice_reset_draws.sql refuses to run without it
create table if not exists public._practice_env (created_at timestamptz not null default now());
alter table public._practice_env enable row level security;
revoke all on public._practice_env from anon, authenticated;
insert into public._practice_env default values;

do $$
declare
  surnames text[] := array['陈','林','黄','李','王','张','刘','吴','蔡','郑','杨','谢','许','郭','何','罗','梁','叶','曾','邱'];
  given    text[] := array['美玲','志强','伟明','丽华','俊杰','慧敏','建国','淑芬','家豪','秀英','国荣','佩琪','文杰','雅婷','德华','小燕'];
  i int; n int; a2 int; a3 int; a4 int; bal int;
  k2 int; k3 int; k4 int;
  c record;
  v_sub uuid;
begin
  if exists (select 1 from public.customers where phone like '601120%') then
    raise notice 'Rehearsal customers already exist, skipping.';
    return;
  end if;

  update public.app_settings set block_future_invoice_dates = false, enforce_draw_schedule = false;

  for i in 1 .. 80 loop
    n := 1 + floor(random() * 30)::int;
    perform public._issue_tickets_core(
      '0112' || lpad(i::text, 7, '0'),
      surnames[1 + floor(random() * array_length(surnames, 1))::int] || given[1 + floor(random() * array_length(given, 1))::int],
      null, 'PRACTICE-' || i, (date '2026-11-11' + (i % 13)), 'purchase', 'ORAL_1', n, null, null);
  end loop;

  select id into k2 from public.prize_categories where round_id = 1 and rank = 2;
  select id into k3 from public.prize_categories where round_id = 1 and rank = 3;
  select id into k4 from public.prize_categories where round_id = 1 and rank = 4;

  -- allocate every customer's remaining R1 balance at random across the tiers
  for c in
    select g.customer_id,
           sum(g.tickets) - coalesce((select sum(a.tickets) from public.allocations a
                                       where a.customer_id = g.customer_id and a.round_id = 1), 0) as bal
    from public.ticket_grants g
    where g.round_id = 1 and g.voided_at is null
    group by g.customer_id
  loop
    bal := c.bal;
    continue when bal <= 0;
    a2 := floor(random() * (bal + 1))::int;
    a3 := floor(random() * (bal - a2 + 1))::int;
    a4 := bal - a2 - a3;
    v_sub := gen_random_uuid();
    insert into public.allocations (customer_id, round_id, prize_category_id, tickets, submission_id)
    select c.customer_id, 1, x.cat, x.n, v_sub
    from (values (k2, a2), (k3, a3), (k4, a4)) as x(cat, n)
    where x.n > 0;
  end loop;

  update public.customers set pdpa_consent_at = coalesce(pdpa_consent_at, now());

  -- rehearsal slot counts for R1 + sample prize descriptions
  update public.prize_categories set winner_slots = case rank when 2 then 2 when 3 then 5 else 10 end where round_id = 1;
  update public.prize_categories set prize_desc = '瑞士双人游 RM30,000 + Cellular Treatment RM57,600 + NMN PLUS ×3 + Platinum Plus ×4 + PHYTOGREEN ×5（总值 RM104,592）' where is_grand;
  update public.prize_categories set prize_desc = 'Wellness Retreat RM7,500 + Platinum Plus ×3 + PHYTOGREEN ×3（总值 RM13,224）' where rank = 2 and not is_grand;
  update public.prize_categories set prize_desc = 'Health Assessment RM600 + Drip RM600 + Platinum Plus ×2（总值 RM3,576）' where rank = 3 and not is_grand;
  update public.prize_categories set prize_desc = 'Platinum Plus ×1 + Vit D（总值 RM1,338）' where rank = 4 and not is_grand;
end;
$$;

select 'PRACTICE project ready: ' || (select count(*) from public.customers) || ' customers, '
       || (select coalesce(sum(tickets), 0) from public.allocations where round_id = 1) || ' R1 tickets allocated' as status;
