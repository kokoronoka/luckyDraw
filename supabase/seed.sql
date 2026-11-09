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
