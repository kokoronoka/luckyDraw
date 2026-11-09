-- =============================================================================
-- ZÉLL-V Lucky Draw — 009 Golden Envelope is once per customer
-- Run after 008. Safe to re-run.
--
-- A customer receives one Golden Envelope when their lifetime earned tickets
-- reach 4. That is the sum of every non-voided grant (purchase, top-up,
-- repeat, referral), including tickets already allocated. It is not the
-- tickets on one invoice, and not the tickets still sitting unallocated.
-- Two purchases of 2 tickets qualify. A later purchase does not award another.
-- A pending envelope is cancelled if voids drop the lifetime total below 4,
-- and a later purchase can award it again. Once the customer has opened it,
-- it is never awarded again.
-- =============================================================================

alter table public.golden_envelopes drop constraint if exists golden_envelopes_paid_boxes_check;
alter table public.golden_envelopes add constraint golden_envelopes_paid_boxes_check check (paid_boxes >= 0);
alter table public.golden_envelopes drop constraint if exists golden_envelopes_invoice_id_key;

alter table public.golden_envelopes add column if not exists lifetime_tickets int;
update public.golden_envelopes ge
   set lifetime_tickets = (
     select coalesce(sum(g.tickets), 0)::int
     from public.ticket_grants g
     where g.customer_id = ge.customer_id and g.voided_at is null
   )
 where lifetime_tickets is null;
alter table public.golden_envelopes alter column lifetime_tickets set not null;
alter table public.golden_envelopes alter column lifetime_tickets set default 0;

-- One live envelope per customer. Extra pending copies from the old
-- per-invoice rule are cancelled. A claimed envelope is kept.
with ranked as (
  select ge.id,
         row_number() over (
           partition by ge.customer_id
           order by case when ge.status = 'claimed' then 0 else 1 end, ge.created_at, ge.id
         ) as rn
  from public.golden_envelopes ge
  where ge.status in ('pending', 'claimed')
)
update public.golden_envelopes ge
   set status = 'cancelled', cancelled_at = coalesce(ge.cancelled_at, now())
  from ranked r
 where ge.id = r.id
   and r.rn > 1
   and ge.status = 'pending';

create unique index if not exists golden_envelopes_one_pending
  on public.golden_envelopes (customer_id)
  where status = 'pending';

-- -----------------------------------------------------------------------------
-- Award when lifetime earned tickets first reach 4. No second live envelope.
-- -----------------------------------------------------------------------------
create or replace function public._award_golden_envelope(p_customer uuid, p_invoice bigint)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_life int;
  v_invoice bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('ge:' || p_customer::text, 0));

  if exists (
    select 1 from public.golden_envelopes
    where customer_id = p_customer and status in ('pending', 'claimed')
  ) then
    return false;
  end if;

  select coalesce(sum(tickets), 0)::int into v_life
  from public.ticket_grants
  where customer_id = p_customer and voided_at is null;
  if v_life < 4 then
    return false;
  end if;

  v_invoice := p_invoice;
  if v_invoice is null or not exists (select 1 from public.invoices i where i.id = v_invoice) then
    select g.invoice_id into v_invoice
    from public.ticket_grants g
    where g.customer_id = p_customer and g.voided_at is null and g.invoice_id is not null
    order by g.created_at, g.id
    limit 1;
  end if;
  if v_invoice is null then
    return false;
  end if;

  insert into public.golden_envelopes (customer_id, invoice_id, paid_boxes, lifetime_tickets)
  select p_customer, i.id, coalesce(i.paid_boxes, 0), v_life
  from public.invoices i
  where i.id = v_invoice;
  return true;
exception when unique_violation then
  return false;
end;
$$;

create or replace function public._envelope_on_grant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_life int;
begin
  if tg_op = 'INSERT' then
    if new.voided_at is null and new.tickets > 0 then
      perform public._award_golden_envelope(new.customer_id, new.invoice_id);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.voided_at is not null and old.voided_at is null then
    select coalesce(sum(tickets), 0)::int into v_life
    from public.ticket_grants
    where customer_id = new.customer_id and voided_at is null;
    if v_life < 4 then
      update public.golden_envelopes
         set status = 'cancelled', cancelled_at = now()
       where customer_id = new.customer_id and status = 'pending';
      update public.vouchers v
         set status = 'voided', voided_at = now(),
             void_reason = 'Lifetime tickets fell below 4'
       from public.golden_envelopes ge
       where v.golden_envelope_id = ge.id
         and ge.customer_id = new.customer_id
         and ge.status = 'claimed'
         and v.status = 'issued';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists golden_envelope_on_grant on public.ticket_grants;
create trigger golden_envelope_on_grant
  after insert or update of voided_at on public.ticket_grants
  for each row execute function public._envelope_on_grant();

-- The old invoice trigger awarded one envelope per 4-box invoice.
create or replace function public._sync_envelope_for_invoice()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return new;
end;
$$;

-- Customers who already earned 4 tickets across more than one invoice.
do $$
declare
  r record;
begin
  for r in select id from public.customers loop
    perform public._award_golden_envelope(r.id, null);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Wallet copy of the envelope includes the lifetime total.
-- -----------------------------------------------------------------------------
create or replace function public._golden_state(p_customer uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'min_tickets', 4,
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ge.id,
               'paid_boxes', ge.paid_boxes,
               'lifetime_tickets', ge.lifetime_tickets,
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

-- -----------------------------------------------------------------------------
-- Issue preview: say whether this invoice awards the envelope.
-- The grant trigger has already inserted it inside this transaction.
-- A dry run rolls the insert back and keeps the flag.
-- -----------------------------------------------------------------------------
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
    v_res := v_res || jsonb_build_object(
      'golden_envelope', exists (
        select 1 from public.golden_envelopes ge
        where ge.customer_id = (v_res #>> '{customer,id}')::uuid
          and ge.status = 'pending'
          and ge.created_at >= transaction_timestamp()
      ),
      'referrer_golden_envelope', case
        when v_res #>> '{referrer,id}' is null then false
        else exists (
          select 1 from public.golden_envelopes ge
          where ge.customer_id = (v_res #>> '{referrer,id}')::uuid
            and ge.status = 'pending'
            and ge.created_at >= transaction_timestamp()
        )
      end,
      'lifetime_tickets', (
        select coalesce(sum(g.tickets), 0)::int
        from public.ticket_grants g
        where g.customer_id = (v_res #>> '{customer,id}')::uuid
          and g.voided_at is null
      )
    );
    if p_dry_run then
      raise exception 'dry run rollback' using errcode = 'LDDRY';
    end if;
  exception when sqlstate 'LDDRY' then
    v_res := v_res #- '{invoice_id}' #- '{customer,id}' #- '{customer,wallet_token}';
  end;
  return v_res || jsonb_build_object('dry_run', coalesce(p_dry_run, false));
end;
$$;

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
    return jsonb_build_object('valid', true, 'exists', false, 'phone', v_phone,
                              'lifetime_tickets', 0, 'has_golden_envelope', false);
  end if;
  return jsonb_build_object(
    'valid', true, 'exists', true,
    'phone', c.phone, 'name', c.name, 'email', c.email,
    'has_tickets', exists (select 1 from public.ticket_grants g where g.customer_id = c.id and g.voided_at is null),
    'lifetime_tickets', (
      select coalesce(sum(g.tickets), 0)::int from public.ticket_grants g
      where g.customer_id = c.id and g.voided_at is null
    ),
    'has_golden_envelope', exists (
      select 1 from public.golden_envelopes ge
      where ge.customer_id = c.id and ge.status in ('pending', 'claimed')
    ),
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

-- Staff customer list includes vouchers that are still waiting to be redeemed.
do $$
begin
  if to_regprocedure('public.my_customers_core()') is null then
    alter function public.my_customers() rename to my_customers_core;
  end if;
end $$;

create or replace function public.my_customers()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_out jsonb := '[]'::jsonb;
  item jsonb;
  v_vouchers jsonb;
begin
  if not public.is_staff() then
    raise exception '没有权限 / Not authorised' using errcode = '42501';
  end if;
  for item in select value from jsonb_array_elements(public.my_customers_core()) loop
    select coalesce(jsonb_agg(e.value order by e.value ->> 'issued_at' desc), '[]'::jsonb)
      into v_vouchers
    from jsonb_array_elements(public._voucher_list((item ->> 'id')::uuid, false)) as e
    where e.value ->> 'status' = 'issued';
    v_out := v_out || jsonb_build_array(
      item || jsonb_build_object('vouchers', coalesce(v_vouchers, '[]'::jsonb))
    );
  end loop;
  return v_out;
end;
$$;

revoke execute on function public._award_golden_envelope(uuid, bigint) from public, anon, authenticated;
revoke execute on function public._envelope_on_grant()                 from public, anon, authenticated;
revoke execute on function public._golden_state(uuid)                  from public, anon, authenticated;
revoke execute on function public.my_customers_core()                  from public, anon, authenticated;
revoke execute on function public.my_customers()                       from public, anon, authenticated;
revoke execute on function public.issue_tickets(text, text, text, text, date, text, int, text, boolean) from public, anon, authenticated;
revoke execute on function public.lookup_customer(text)                from public, anon, authenticated;

grant execute on function public.my_customers() to authenticated;
grant execute on function public.issue_tickets(text, text, text, text, date, text, int, text, boolean) to authenticated;
grant execute on function public.lookup_customer(text) to authenticated;
