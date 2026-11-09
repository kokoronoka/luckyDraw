-- =============================================================================
-- DESTRUCTIVE — removes the FAKE seed customers (phones 6010000000x) and all of
-- their invoices, grants, allocations, draws and winners. Run once before
-- go-live (10 Nov 2026). It never touches real customers.
-- =============================================================================
begin;

create temp table _test_customers on commit drop as
  select id from public.customers where phone like '6010000000%';

do $$
begin
  if to_regclass('public.vouchers') is not null then
    delete from public.vouchers         where customer_id in (select id from _test_customers);
    delete from public.golden_envelopes where customer_id in (select id from _test_customers);
  end if;
end $$;
delete from public.winners       where customer_id in (select id from _test_customers);
delete from public.draws         where winner_customer_id in (select id from _test_customers);
delete from public.allocations   where customer_id in (select id from _test_customers);
delete from public.ticket_grants where customer_id in (select id from _test_customers)
                                    or related_customer_id in (select id from _test_customers);
delete from public.invoices      where customer_id in (select id from _test_customers)
                                    or referrer_customer_id in (select id from _test_customers);
update public.customers set referred_by = null where referred_by in (select id from _test_customers);
delete from public.customers     where id in (select id from _test_customers);

commit;
