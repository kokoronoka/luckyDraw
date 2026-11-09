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
