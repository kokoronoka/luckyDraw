-- =============================================================================
-- ZÉLL-V Lucky Draw — automated draw-rule checks
--
-- SAFE TO RUN ON THE LIVE DATABASE: everything runs inside one sub-transaction
-- that is rolled back at the end, so no test round, customer, draw or setting
-- change survives. Paste the whole file into the Supabase SQL editor and Run.
-- Result: one row per check (ok = true/false). The last row is the summary.
--
-- Uses private test rounds 90/91 (dates in 2030) so real customers never enter
-- round pools. Grand-prize checks use the real grand pool (read-only checks).
-- Requires migrations 001–006.
-- =============================================================================

create or replace function pg_temp.ld_draw_rules_tests()
returns table (ok boolean, check_name text, detail text)
language plpgsql
as $fn$
declare
  res      jsonb := '[]'::jsonb;
  v_admin  uuid := gen_random_uuid();
  v_sales  uuid := gen_random_uuid();
  ca uuid; cb uuid; cc uuid;                 -- test customers A, B, C
  ta text; tb text; tc text;                 -- their wallet tokens
  k90_2 int; k90_3 int; k90_4 int; k91_2 int; k91_3 int; k91_4 int; kg int;
  v jsonb; v2 jsonb; n int; t bigint; x bigint; y bigint; msg text;
  w_id bigint; w_cust uuid; other uuid;
  counts int[] := array[0, 0, 0, 0];
  weights bigint[] := array[1, 2, 3, 4];
  chi numeric := 0; i int; seen int[] := '{}';
  d record;
begin
  begin
    -- =================================================================== setup
    insert into auth.users (id, email) values
      (v_admin, 'ld-test-admin@example.invalid'), (v_sales, 'ld-test-sales@example.invalid');
    insert into public.profiles (id, email) values (v_admin, 'ld-test-admin@example.invalid'), (v_sales, 'ld-test-sales@example.invalid')
      on conflict (id) do nothing;
    update public.profiles set role = 'admin', active = true where id = v_admin;
    update public.profiles set role = 'sales', active = true where id = v_sales;

    update public.app_settings
       set block_future_invoice_dates = false, enforce_draw_schedule = false,
           repeat_bonus_same_round = false, repeat_bonus_on_topup = false,
           repeat_bonus_tickets = 3, referral_bonus_tickets = 5, max_tickets_per_invoice = 100;

    insert into public.rounds (id, code, name_zh, name_en, purchase_start, purchase_end, allocation_deadline, draw_date) values
      (90, 'T90', '测试轮A', 'Test A', '2030-01-01', '2030-01-10', '2030-01-11 23:59:59+08', '2030-01-12'),
      (91, 'T91', '测试轮B', 'Test B', '2030-01-12', '2030-01-20', '2030-01-21 23:59:59+08', '2030-01-22');
    insert into public.prize_categories (round_id, rank, name_zh, name_en, winner_slots) values
      (90, 2, '二等奖', '2nd', 1), (90, 3, '三等奖', '3rd', 1), (90, 4, '四等奖', '4th', 1),
      (91, 2, '二等奖', '2nd', 1), (91, 3, '三等奖', '3rd', 1), (91, 4, '四等奖', '4th', 1);
    select id into k90_2 from public.prize_categories where round_id = 90 and rank = 2;
    select id into k90_3 from public.prize_categories where round_id = 90 and rank = 3;
    select id into k90_4 from public.prize_categories where round_id = 90 and rank = 4;
    select id into k91_2 from public.prize_categories where round_id = 91 and rank = 2;
    select id into k91_3 from public.prize_categories where round_id = 91 and rank = 3;
    select id into k91_4 from public.prize_categories where round_id = 91 and rank = 4;
    select id into kg from public.prize_categories where is_grand;
    -- room for two test grand draws regardless of real winners
    update public.prize_categories
       set winner_slots = (select count(*) from public.winners w where w.prize_category_id = kg and w.status = 'won') + 2
     where id = kg;

    -- tickets via the real issuing logic (phones 6019000000x are test-only)
    perform public._issue_tickets_core('0190000001', 'LDTEST A', null, 'LDTEST-1', '2030-01-02', 'purchase', 'ORAL_1', 10, null, v_sales);
    perform public._issue_tickets_core('0190000002', 'LDTEST B', null, 'LDTEST-2', '2030-01-03', 'purchase', 'ORAL_1', 4, '0190000001', v_sales);
    perform public._issue_tickets_core('0190000001', null, null, 'LDTEST-3', '2030-01-15', 'purchase', 'ORAL_1', 2, null, v_sales);
    -- C: RM5,000 voucher (0 tickets, not qualifying) then upgrade to RM10,000 (+10, a top up)
    perform public._issue_tickets_core('0190000003', 'LDTEST C', null, 'LDTEST-4', '2030-01-04', 'purchase', 'VOUCHER_5K', 1, null, v_sales);
    perform public._issue_tickets_core('0190000003', null, null, 'LDTEST-4B', '2030-01-04', 'topup', 'VOUCHER_10K', 1, null, v_sales);
    perform public._issue_tickets_core('0190000003', null, null, 'LDTEST-5', '2030-01-16', 'purchase', 'ORAL_1', 1, null, v_sales);
    select id, wallet_token::text into ca, ta from public.customers where phone = '60190000001';
    select id, wallet_token::text into cb, tb from public.customers where phone = '60190000002';
    select id, wallet_token::text into cc, tc from public.customers where phone = '60190000003';

    -- ========================================================= bonus checks
    select coalesce(sum(tickets), 0) into x from public.ticket_grants where customer_id = ca and round_id = 90 and source = 'referral' and voided_at is null;
    select coalesce(sum(tickets), 0) into y from public.ticket_grants where customer_id = cb and round_id = 90 and source = 'referral' and voided_at is null;
    res := res || jsonb_build_array(jsonb_build_object('ok', x = 5 and y = 5, 'n', 'referral: +5 to referrer AND +5 to new customer, in the new customer''s round',
             'd', format('referrer %s, referee %s', x, y)));
    res := res || jsonb_build_array(jsonb_build_object('ok', (select referred_by from public.customers where id = cb) = ca,
             'n', 'referral: referee.referred_by = referrer', 'd', ''));

    select count(*), coalesce(sum(tickets), 0) into n, x from public.ticket_grants where customer_id = ca and round_id = 91 and source = 'repeat_bonus';
    res := res || jsonb_build_array(jsonb_build_object('ok', n = 1 and x = 3, 'n', 'repeat: purchase in a later round earns +3',
             'd', format('%s grant(s), %s tickets', n, x)));
    select count(*) into n from public.ticket_grants where customer_id = ca and round_id = 90 and source = 'repeat_bonus';
    res := res || jsonb_build_array(jsonb_build_object('ok', n = 0, 'n', 'repeat: first-round purchase earns no bonus', 'd', format('%s', n)));
    select count(*) into n from public.ticket_grants where customer_id = cc and source = 'repeat_bonus';
    res := res || jsonb_build_array(jsonb_build_object('ok', n = 0, 'n', 'repeat: an earlier 0-ticket voucher or top-up does not qualify (default setting)', 'd', format('%s', n)));

    -- ==================================================== package ticket rules
    select tickets into x from public.invoices where invoice_no = 'LDTEST-4';
    select tickets into y from public.invoices where invoice_no = 'LDTEST-4B';
    res := res || jsonb_build_array(jsonb_build_object('ok', x = 0 and y = 10, 'n', 'voucher: RM5,000 = 0 tickets; upgrade to RM10,000 = difference (+10)',
             'd', format('%s, %s', x, y)));
    -- T&C example: 6 paid boxes = 6; top up 6→12 = +12; top up 12→24 = +36 (total 54)
    perform public._issue_tickets_core('0190000004', 'LDTEST D', null, 'LDTEST-20', '2030-01-02', 'purchase', 'ORAL_B6F2', 1, null, v_sales);
    perform public._issue_tickets_core('0190000004', null, null, 'LDTEST-21', '2030-01-13', 'topup', 'ORAL_1', 6, null, v_sales);
    perform public._issue_tickets_core('0190000004', null, null, 'LDTEST-22', '2030-01-14', 'topup', 'ORAL_1', 12, null, v_sales);
    select string_agg(tickets::text, ',' order by id) into msg from public.invoices where invoice_no in ('LDTEST-20', 'LDTEST-21', 'LDTEST-22');
    res := res || jsonb_build_array(jsonb_build_object('ok', msg = '6,12,36', 'n', 'top up: T&C example 6 → 12 → 24 paid boxes = 6 + 12 + 36', 'd', msg));
    select count(*) into n from public.ticket_grants g join public.customers cu on cu.id = g.customer_id
      where cu.phone = '60190000004' and g.source = 'repeat_bonus';
    res := res || jsonb_build_array(jsonb_build_object('ok', n = 0, 'n', 'repeat: top-ups alone in a later round earn no repeat bonus (default setting)', 'd', format('%s', n)));
    perform public._issue_tickets_core('0190000004', null, null, 'LDTEST-23', '2030-01-15', 'purchase', 'ORAL_1', 1, null, v_sales);
    perform public._issue_tickets_core('0190000004', null, null, 'LDTEST-24', '2030-01-16', 'purchase', 'ORAL_1', 1, null, v_sales);
    select count(*), coalesce(sum(g.tickets), 0) into n, x from public.ticket_grants g join public.customers cu on cu.id = g.customer_id
      where cu.phone = '60190000004' and g.source = 'repeat_bonus';
    res := res || jsonb_build_array(jsonb_build_object('ok', n = 1 and x = 3, 'n', 'repeat: +3 only ONCE per round, even with two purchases in that round',
             'd', format('%s grant(s), %s tickets', n, x)));
    perform public._issue_tickets_core('0190000006', 'LDTEST F', null, 'LDTEST-30', '2030-01-02', 'purchase', 'ORAL_B12F5', 1, null, v_sales);
    perform public._issue_tickets_core('0190000006', null, null, 'LDTEST-31', '2030-01-03', 'purchase', 'TRIO', 1, null, v_sales);
    perform public._issue_tickets_core('0190000006', null, null, 'LDTEST-32', '2030-01-04', 'purchase', 'CT_8', 1, null, v_sales);
    perform public._issue_tickets_core('0190000006', null, null, 'LDTEST-33', '2030-01-05', 'topup', 'CT_16_24', 1, null, v_sales);
    select string_agg(tickets::text, ',' order by id) into msg from public.invoices where invoice_no like 'LDTEST-3_';
    res := res || jsonb_build_array(jsonb_build_object('ok', msg = '24,50,25,27', 'n', 'packages: Buy 12 Free 5 = 24, Trio = 50, Cellular 8 = 25, upgrade 8 → 16/24 = +27', 'd', msg));
    begin
      perform public._issue_tickets_core('0190000007', 'LDTEST G', null, 'LDTEST-40', '2030-01-02', 'topup', 'ORAL_1', 3, null, v_sales);
      msg := 'no error';
    exception when others then msg := sqlerrm; end;
    res := res || jsonb_build_array(jsonb_build_object('ok', msg like '%Use Purchase instead%', 'n', 'top up: impossible without an earlier purchase', 'd', msg));
    begin
      perform public._issue_tickets_core('0190000006', null, null, 'LDTEST-41', '2030-01-06', 'topup', 'CT_8', 1, null, v_sales);
      msg := 'no error';
    exception when others then msg := sqlerrm; end;
    res := res || jsonb_build_array(jsonb_build_object('ok', msg like '%higher package%', 'n', 'upgrade: must be to a higher package', 'd', msg));
    begin
      perform public._issue_tickets_core('0190000008', 'LDTEST H', null, 'LDTEST-42', '2030-01-06', 'purchase', 'VOUCHER_5K', 1, '0190000001', v_sales);
      msg := 'no error';
    exception when others then msg := sqlerrm; end;
    res := res || jsonb_build_array(jsonb_build_object('ok', msg like '%earns no tickets%', 'n', 'referral: a 0-ticket purchase cannot count as a referral', 'd', msg));

    -- referral validation
    begin
      perform public._issue_tickets_core('0190000009', 'LDTEST self', null, 'LDTEST-6', '2030-01-05', 'purchase', 'ORAL_1', 1, '0190000009', v_sales);
      msg := 'no error';
    exception when others then msg := sqlerrm; end;
    res := res || jsonb_build_array(jsonb_build_object('ok', msg like '%Self-referral%', 'n', 'referral: self-referral blocked', 'd', msg));
    begin
      perform public._issue_tickets_core('0190000003', null, null, 'LDTEST-7', '2030-01-05', 'purchase', 'ORAL_1', 1, '0190000001', v_sales);
      msg := 'no error';
    exception when others then msg := sqlerrm; end;
    res := res || jsonb_build_array(jsonb_build_object('ok', msg like '%not new%', 'n', 'referral: existing customer cannot be referred', 'd', msg));
    begin
      perform public._issue_tickets_core('0190000005', 'LDTEST E', null, 'LDTEST-8', '2030-01-05', 'purchase', 'ORAL_1', 1, '0190000099', v_sales);
      msg := 'no error';
    exception when others then msg := sqlerrm; end;
    res := res || jsonb_build_array(jsonb_build_object('ok', msg like '%not an existing customer%', 'n', 'referral: unknown referrer blocked', 'd', msg));

    -- ========================================================= allocations
    update public.customers set pdpa_consent_at = now() where id in (ca, cb, cc);
    -- A: T90 = 10 purchase + 5 referral = 15 → 2nd 5, 3rd 10 ; T91 = 2 + 3 repeat = 5 → 2nd 2, 3rd 3
    perform public.submit_allocation(ta, 90, jsonb_build_object(k90_2::text, 5, k90_3::text, 10));
    perform public.submit_allocation(ta, 91, jsonb_build_object(k91_2::text, 2, k91_3::text, 3));
    -- B: T90 = 4 + 5 = 9 → 2nd 9
    perform public.submit_allocation(tb, 90, jsonb_build_object(k90_2::text, 9));
    -- C: T90 = 10 (voucher upgrade) → 4th 10 ; T91 = 1 → 4th 1
    begin
      perform public.submit_allocation(tc, 90, jsonb_build_object(k91_4::text, 10));
      msg := 'no error';
    exception when others then msg := sqlerrm; end;
    res := res || jsonb_build_array(jsonb_build_object('ok', msg like '%does not belong%', 'n', 'isolation: T90 tickets cannot be put into a T91 prize', 'd', msg));
    perform public.submit_allocation(tc, 90, jsonb_build_object(k90_4::text, 10));
    perform public.submit_allocation(tc, 91, jsonb_build_object(k91_4::text, 1));

    -- ====================================================== round isolation
    select coalesce(sum(weight), 0) into x from public._draw_pool(k91_3) where customer_id = ca;
    res := res || jsonb_build_array(jsonb_build_object('ok', x = 3, 'n', 'isolation: T90 tickets never in the T91 pool (A has 15 in T90, 3 in T91 3rd)',
             'd', format('A weight in T91 3rd pool = %s', x)));
    select count(*) into n from public._draw_pool(k91_2) where customer_id in (cb, cc);
    res := res || jsonb_build_array(jsonb_build_object('ok', n = 0, 'n', 'isolation: customers with no T91 2nd allocation are not in that pool', 'd', format('%s', n)));
    select count(*), coalesce(sum(weight), 0) into n, x from public._draw_pool(k90_2);
    res := res || jsonb_build_array(jsonb_build_object('ok', n = 2 and x = 14, 'n', 'pool: T90 2nd = A(5) + B(9)', 'd', format('%s entrants, %s tickets', n, x)));

    -- ====================================================== grand pool total
    select coalesce(sum(weight), 0) into x from public._draw_pool(kg);
    select coalesce(sum(tickets), 0) into y from public.ticket_grants g where g.voided_at is null
       and not exists (select 1 from public.winners w where w.customer_id = g.customer_id and w.rank = 1 and w.status = 'won')
       and not exists (select 1 from public.winners w where w.customer_id = g.customer_id and w.prize_category_id = kg and w.status = 'forfeited');
    res := res || jsonb_build_array(jsonb_build_object('ok', x = y, 'n', 'grand: pool tickets = sum of all non-voided grants (allocated or not)',
             'd', format('pool %s, grants %s', x, y)));
    select weight into x from public._draw_pool(kg) where customer_id = ca;
    res := res || jsonb_build_array(jsonb_build_object('ok', x = 20, 'n', 'grand: A counts all rounds (15 + 5)', 'd', format('%s', x)));

    -- ====================================================== draw permissions
    perform set_config('request.jwt.claim.sub', v_sales::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_sales)::text, true);
    begin
      perform public.draw_winner(k90_3);
      msg := 'no error';
    exception when others then msg := sqlerrm; end;
    res := res || jsonb_build_array(jsonb_build_object('ok', msg like '%Only admins%', 'n', 'security: salesperson cannot run a draw', 'd', msg));
    begin
      perform public.mark_forfeited(1, 'x');
      msg := 'no error';
    exception when others then msg := sqlerrm; end;
    res := res || jsonb_build_array(jsonb_build_object('ok', msg like '%Admins only%', 'n', 'security: salesperson cannot mark forfeited', 'd', msg));
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, true);

    -- ================================================= schedule enforcement
    update public.app_settings set enforce_draw_schedule = true;
    begin
      perform public.draw_winner(k91_4);
      msg := 'no error';
    exception when others then msg := sqlerrm; end;
    res := res || jsonb_build_array(jsonb_build_object('ok', msg like '%after its allocation deadline%', 'n', 'schedule: no round draw before its allocation deadline', 'd', msg));
    begin
      perform public.draw_winner(kg);
      msg := 'no error';
    exception when others then msg := sqlerrm; end;
    res := res || jsonb_build_array(jsonb_build_object('ok', msg like '%Grand draw opens%', 'n', 'schedule: no Grand draw before the last deadline', 'd', msg));
    update public.app_settings set enforce_draw_schedule = false;

    -- ================================ win rules (campaign T&C, decided 2026-11-05)
    v := public.draw_winner(k90_3);   -- only A is in T90 3rd → A wins
    select customer_id into w_cust from public.winners where id = (v -> 'winner' ->> 'id')::bigint;
    res := res || jsonb_build_array(jsonb_build_object('ok', w_cust = ca, 'n', 'draw: sole entrant wins (T90 3rd → A)', 'd', v ->> 'winner'));
    select count(*) into n from public._draw_pool(k90_2) where customer_id = ca;
    res := res || jsonb_build_array(jsonb_build_object('ok', n = 1, 'n', 'same round: a 3rd-prize winner can still win 2nd prize in the same round', 'd', format('A in T90 2nd pool: %s', n)));
    v := public.draw_winner(k91_3);   -- only A is in T91 3rd → A wins 3rd again
    select customer_id into w_cust from public.winners where id = (v -> 'winner' ->> 'id')::bigint;
    res := res || jsonb_build_array(jsonb_build_object('ok', w_cust = ca, 'n', 'later round: a 3rd-prize winner can win 3rd prize again in a later round', 'd', ''));
    -- same prize twice: give T90 3rd a 2nd slot; A (only entrant) must not take it
    update public.prize_categories set winner_slots = 2 where id = k90_3;
    begin
      perform public.draw_winner(k90_3);
      msg := 'no error';
    exception when others then msg := sqlerrm; end;
    res := res || jsonb_build_array(jsonb_build_object('ok', msg like '%No eligible entrants%', 'n', 'same prize: a winner cannot take two slots of the same prize', 'd', msg));
    begin
      insert into public.draws (prize_category_id, run_by, pool_size, total_tickets, random_value, winner_customer_id)
        values (k90_3, v_admin, 1, 1, 0, ca) returning id into x;
      insert into public.winners (prize_category_id, rank, customer_id, draw_id, tickets_in_pool) values (k90_3, 3, ca, x, 1);
      msg := 'no error';
    exception when unique_violation then msg := 'unique_violation';
    end;
    res := res || jsonb_build_array(jsonb_build_object('ok', msg = 'unique_violation', 'n', 'same prize: database rejects a 2nd win of the same prize', 'd', msg));
    update public.prize_categories set winner_slots = 1 where id = k90_3;
    begin
      perform public.draw_winner(k90_3);
      msg := 'no error';
    exception when others then msg := sqlerrm; end;
    res := res || jsonb_build_array(jsonb_build_object('ok', msg like '%slots are filled%', 'n', 'slots: cannot draw more winners than winner_slots', 'd', msg));

    -- ======================================= cross-tier + grand allowed
    v := public.draw_winner(k91_2);   -- only A → A wins 2nd after winning 3rd
    select customer_id into w_cust from public.winners where id = (v -> 'winner' ->> 'id')::bigint;
    res := res || jsonb_build_array(jsonb_build_object('ok', w_cust = ca, 'n', 'cross-tier: 3rd-prize winner can win 2nd prize in a later round', 'd', ''));
    select count(*) into n from public._draw_pool(kg) where customer_id in (ca, cc);
    res := res || jsonb_build_array(jsonb_build_object('ok', n = 2, 'n', 'grand: round winners stay in the Grand pool', 'd', format('%s of 2', n)));

    -- ============================================ forfeit + redraw
    select id into w_id from public.winners where prize_category_id = k91_2 and status = 'won';
    perform public.mark_forfeited(w_id, 'LDTEST unreachable');
    select count(*) into n from public._draw_pool(k91_2) where customer_id = ca;
    res := res || jsonb_build_array(jsonb_build_object('ok', n = 0, 'n', 'forfeit: forfeited customer excluded from that category''s redraw', 'd', format('%s', n)));
    begin
      perform public.draw_winner(k91_2);
      msg := 'no error';
    exception when others then msg := sqlerrm; end;
    res := res || jsonb_build_array(jsonb_build_object('ok', msg like '%No eligible entrants%', 'n', 'forfeit: redraw with nobody left reports no eligible entrants', 'd', msg));

    v := public.draw_winner(k90_2);   -- A (5) or B (9); A may win rank 2 again (forfeit is not a win)
    select id, customer_id into w_id, w_cust from public.winners where id = (v -> 'winner' ->> 'id')::bigint;
    other := case when w_cust = ca then cb else ca end;
    perform public.mark_forfeited(w_id, 'LDTEST declined');
    v2 := public.draw_winner(k90_2);
    res := res || jsonb_build_array(jsonb_build_object('ok',
             (select customer_id from public.winners where id = (v2 -> 'winner' ->> 'id')::bigint) = other
             and (v2 ->> 'is_redraw')::boolean
             and (select replaces_winner_id from public.draws where id = (v2 ->> 'draw_id')::bigint) = w_id,
             'n', 'forfeit: redraw picks someone else and is linked to the forfeited slot', 'd', ''));

    -- ============================================ grand: no double grand win
    v := public.draw_winner(kg);
    select customer_id into w_cust from public.winners where id = (v -> 'winner' ->> 'id')::bigint;
    select count(*) into n from public._draw_pool(kg) where customer_id = w_cust;
    res := res || jsonb_build_array(jsonb_build_object('ok', n = 0, 'n', 'grand: a Grand Prize winner cannot be drawn again for the Grand Prize', 'd', ''));
    if exists (select 1 from public._draw_pool(kg)) then
      v2 := public.draw_winner(kg);
      res := res || jsonb_build_array(jsonb_build_object('ok',
               (select customer_id from public.winners where id = (v2 -> 'winner' ->> 'id')::bigint) <> w_cust,
               'n', 'grand: second Grand draw picks a different customer', 'd', ''));
    end if;

    -- ============================================ audit log
    select count(*) into n from public.draws d2 join public.prize_categories pc on pc.id = d2.prize_category_id
      where (pc.round_id in (90, 91) or pc.is_grand) and d2.run_by = v_admin;
    select count(*) into x from public.draws d2 join public.prize_categories pc on pc.id = d2.prize_category_id
      where (pc.round_id in (90, 91) or pc.is_grand) and d2.run_by = v_admin
        and d2.pool_size > 0 and d2.total_tickets > 0 and d2.random_value >= 0 and d2.random_value < d2.total_tickets
        and d2.details ? 'pool_sha256' and d2.run_at is not null;
    res := res || jsonb_build_array(jsonb_build_object('ok', n > 0 and n = x, 'n', 'audit: every draw logs who, when, pool size, total tickets, random value, pool hash',
             'd', format('%s draws, %s complete', n, x)));
    -- the logged random value reproduces the logged winner
    n := 0;
    for d in select d2.* from public.draws d2 where d2.run_by = v_admin and d2.prize_category_id in (k90_3) loop
      if (d.details -> 'winner_range' ->> 0)::bigint <= d.random_value and d.random_value < (d.details -> 'winner_range' ->> 1)::bigint then
        n := n + 1;
      end if;
    end loop;
    res := res || jsonb_build_array(jsonb_build_object('ok', n = 1, 'n', 'audit: random value falls inside the winner''s logged ticket range', 'd', ''));

    -- ============================================ voids + effective allocations
    perform public.void_grant((select id from public.ticket_grants where customer_id = ca and round_id = 90 and source = 'referral'), 'LDTEST void');
    select string_agg(prize_rank || ':' || effective, ',' order by prize_rank) into msg
      from public._effective_allocations(90) where customer_id = ca;
    res := res || jsonb_build_array(jsonb_build_object('ok', msg = '2:5,3:5', 'n', 'void: excess removed from lower prize first (A: 2nd 5, 3rd 10→5)', 'd', msg));
    select weight into x from public._draw_pool(kg) where customer_id = ca;
    res := res || jsonb_build_array(jsonb_build_object('ok', coalesce(x, 0) in (15, 0), 'n', 'void: voided tickets leave the Grand pool (A 20 → 15)', 'd', format('%s', x)));
    begin
      perform public.void_grant((select id from public.ticket_grants where customer_id = cc and source = 'topup'), 'x');
      msg := 'no error';
    exception when others then msg := sqlerrm; end;
    res := res || jsonb_build_array(jsonb_build_object('ok', msg like '%void the whole invoice%', 'n', 'void: purchase/top-up grants are voided via their invoice', 'd', msg));
    perform public.void_invoice((select id from public.invoices where invoice_no = 'LDTEST-2'), 'LDTEST cancel');
    select count(*) into n from public.ticket_grants g join public.invoices i on i.id = g.invoice_id
      where i.invoice_no = 'LDTEST-2' and g.voided_at is null;
    res := res || jsonb_build_array(jsonb_build_object('ok', n = 0, 'n', 'void: voiding an invoice voids its purchase and both referral bonuses', 'd', format('%s left', n)));

    -- ============================================ randomness
    for i in 1 .. 2000 loop
      x := public._secure_random_below(7);
      if x < 0 or x >= 7 then seen := seen || -1; exit; end if;
      if not (x::int = any (seen)) then seen := seen || x::int; end if;
    end loop;
    res := res || jsonb_build_array(jsonb_build_object('ok', not (-1 = any (seen)) and array_length(seen, 1) = 7,
             'n', 'random: secure random stays in [0, n) and covers every value', 'd', array_to_string(seen, ',')));

    for i in 1 .. 10000 loop
      n := public._pick_weighted(weights, public._secure_random_below(10));
      counts[n] := counts[n] + 1;
    end loop;
    for i in 1 .. 4 loop
      chi := chi + power(counts[i] - 1000.0 * weights[i], 2) / (1000.0 * weights[i]);
    end loop;
    -- chi-square, 3 degrees of freedom: 16.27 = 0.1% significance
    res := res || jsonb_build_array(jsonb_build_object('ok', chi < 16.27,
             'n', '10,000 draws: win rates proportional to tickets 1:2:3:4 (chi-square < 16.27)',
             'd', format('wins %s (expected 1000,2000,3000,4000), chi² = %s', array_to_string(counts, ','), round(chi, 2))));

    raise exception using errcode = 'LDTST', message = 'rollback test data';
  exception
    when sqlstate 'LDTST' then null;
    when others then
      res := res || jsonb_build_array(jsonb_build_object('ok', false, 'n', 'UNEXPECTED ERROR (all test data rolled back)', 'd', sqlerrm));
  end;

  return query
    select (e ->> 'ok')::boolean, e ->> 'n', e ->> 'd' from jsonb_array_elements(res) e
    union all
    select bool_and((e ->> 'ok')::boolean),
           format('SUMMARY: %s passed, %s failed', count(*) filter (where (e ->> 'ok')::boolean), count(*) filter (where not (e ->> 'ok')::boolean)),
           'all test data rolled back'
    from jsonb_array_elements(res) e;
end;
$fn$;

select * from pg_temp.ld_draw_rules_tests();
