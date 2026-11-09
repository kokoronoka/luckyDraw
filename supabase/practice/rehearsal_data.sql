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
