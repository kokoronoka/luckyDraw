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
