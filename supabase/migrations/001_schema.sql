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
