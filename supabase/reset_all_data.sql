-- =============================================================================
-- DESTRUCTIVE — PRE-LAUNCH CLEAN-UP ONLY
-- Deletes ALL customers, invoices, ticket grants, allocations, draws and
-- winners, and restarts their ID counters at 1.
--
-- KEEPS: staff accounts (profiles), rounds, prize categories, settings.
-- ALSO:  switches the two safety settings back ON (future-date guard and
--        draw schedule).
--
-- SAFETY LOCK: refuses to run once the campaign has started (the first round's
-- purchase start, 00:00 MYT). After that, real customer data must never be wiped.
-- =============================================================================
do $$
declare
  v_start timestamptz;
begin
  select (min(purchase_start)::timestamp at time zone 'Asia/Kuala_Lumpur') into v_start from public.rounds;
  if v_start is null or now() >= v_start then
    raise exception 'STOP: the campaign has started (%). Real customer data cannot be wiped with this script. Nothing was deleted.',
      to_char(v_start at time zone 'Asia/Kuala_Lumpur', 'DD Mon YYYY HH24:MI') || ' MYT';
  end if;

  if to_regclass('public.vouchers') is not null then
    truncate table
      public.vouchers,
      public.golden_envelopes,
      public.winners,
      public.draws,
      public.allocations,
      public.ticket_grants,
      public.invoices,
      public.customers
    restart identity;
  else
    truncate table
      public.winners,
      public.draws,
      public.allocations,
      public.ticket_grants,
      public.invoices,
      public.customers
    restart identity;
  end if;

  update public.app_settings
     set block_future_invoice_dates = true,
         enforce_draw_schedule      = true,
         updated_at                 = now()
   where id;
end;
$$;

select
  (select count(*) from public.customers)        as customers,
  (select count(*) from public.invoices)         as invoices,
  (select count(*) from public.ticket_grants)    as ticket_grants,
  (select count(*) from public.allocations)      as allocations,
  (select count(*) from public.winners)          as winners,
  (select count(*) from public.profiles)         as staff_kept,
  (select count(*) from public.rounds)           as rounds_kept,
  (select count(*) from public.prize_categories) as prizes_kept,
  (select block_future_invoice_dates from public.app_settings) as future_date_guard_on;
