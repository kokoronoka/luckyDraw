# ZÉLL-V《健康一起 WIN》Lucky Draw

Event rules and the working agreement live in [CLAUDE.md](CLAUDE.md). This file covers setup.

## 1. Database (Supabase SQL editor)

Paste and run these files **in this order**:

| # | File | What it does |
|---|------|--------------|
| 1 | `supabase/migrations/001_schema.sql` | Tables, constraints, auth→profile trigger |
| 2 | `supabase/migrations/002_functions.sql` | Helpers, `issue_tickets`, `lookup_customer`, `my_customers`, wallet RPCs |
| 3 | `supabase/migrations/003_rls.sql` | RLS policies + locks down table/function privileges |
| 4 | `supabase/seed.sql` | Rounds, prize categories (placeholder slots), settings, 5 **fake** test customers |
| 5 | `supabase/migrations/004_draw_admin.sql` | (M2) Draw engine, forfeit, voids, admin stats/exports. Adds only; safe on live data |
| 6 | `supabase/migrations/005_win_rules.sql` | Winning rules from the campaign T&C (see below). Safe on live data |
| 7 | `supabase/migrations/006_packages.sql` | Package-based tickets (T&C sections 3 and 5). On an existing database, run `reset_all_data.sql` first |
| 8 | `supabase/migrations/007_golden_envelope.sql` | Golden Envelope (one per invoice with 4+ paid boxes) and redeemable vouchers for envelope gifts and lucky-draw wins. Safe on live data |
| 9 | `supabase/migrations/008_envelope_random.sql` | Opening an envelope draws one gift at random. Safe on live data. Run even if 007 was already applied |
| 10 | `supabase/migrations/009_envelope_lifetime.sql` | One Golden Envelope per customer, when lifetime earned tickets reach 4. Run even if 007 was already applied |
| 11 | `supabase/migrations/010_draw_stage.sql` | Projector data for the Golden Ticket drum: one row per allocated ticket. The server still draws the winner |

For a **fresh** database, run `seed.sql` after 006, then 007, 008, and 009.

### Golden Envelope and vouchers
- One envelope per customer, the first time their **lifetime earned tickets** reach 4. That total is every non-voided grant (purchase, top-up, repeat, referral), including tickets they have already allocated. It is not the size of one invoice, and not the tickets still left unallocated. Two purchases of 2 tickets qualify. A later purchase does not award a second envelope. Opening it is once only.
- On the wallet link, a customer with an unopened envelope is greeted by the Golden Envelope page. Opening it **draws** one gift at random (equal chance): Serum, Cream, Bevite or Bejojoba at RM68, or a free ZÉLL-V Sheep or Vitamin D. The draw issues a voucher, then the page returns to the wallet.
- Each lucky-draw win also issues a voucher. Forfeiting a prize voids the voucher if it has not been redeemed. If a void drops lifetime tickets below 4, a pending envelope is cancelled and an unredeemed envelope voucher is voided. An envelope the customer has already opened is not awarded again.
- The wallet has a vouchers area. Redeem asks the customer to hand the phone to a salesperson, then a Proceed button marks it redeemed.

### Ticket rules (campaign T&C sections 3 + 5, from 6 Nov 2026)
Salespeople pick a **package**. The server works out the tickets; nobody types a ticket count.
- **Purchase:** the package's tickets × quantity. Packages: 1 box = 1, PP2/PP3 Buy 2 Free 1 = 1, Buy 4 Free 1 = 4, Buy 6 Free 2 = 6, Buy 12 Free 5 = 24, Buy 18 Free 7 = 54, Trio = 50, RM5k voucher = 0, RM10k = 10, RM20k = 20, Cellular Therapy 8 = 25, Cellular Therapy 16/24 = 52.
- **Top Up (oral supplements):** counts **paid** boxes only, added up per customer across the whole campaign. New boxes earn ×1, or ×2 once the running total reaches 12, or ×3 at 18 or more. For example, 6 → 12 boxes = +12, and 12 → 24 = +36.
- **Top Up (voucher / Cellular Therapy upgrade):** gives only the difference in tickets, e.g. RM10k → RM20k = +10.
- **Repeat purchase:** +3 **once per customer per later round**, when that round has a purchase that earns tickets and an earlier round also had one.
- **Referral:** +5 to both customers. The new customer's purchase must earn tickets, and the referrer must already have such a purchase.

To change a package's ticket count: `update packages set tickets = … where code = '…';`

### Winning rules (campaign T&C, decided 5 Nov 2026)
- A round's tickets are only in that round's draws. They never carry forward to the next round.
- A customer **can** win different prizes in the same round (e.g. 2nd and 4th in R1).
- A customer **can** win again in a later round, in any tier (e.g. 3rd in R1, then 3rd again in R2).
- A customer **cannot** take two slots of the same prize (e.g. two of R1's 4th prizes), and cannot win the Grand Prize twice.
- Round winners stay eligible for the Grand Prize. Every non-voided ticket from all rounds counts for it.
- A forfeited customer is excluded from the redraw of that prize.

**Draw-rule tests:** paste `tests/draw_rules.sql` into the SQL editor and run it. You get one row per check plus a summary. Everything runs inside a transaction that is rolled back, so it's safe on the live database. It uses private test rounds dated 2030.

Before go-live, run `supabase/reset_test_data.sql` once. It deletes only the fake customers (phones `6010000000x`).

## 2. Supabase dashboard settings

- **Authentication → Sign In / Providers → Email:** turn **off** "Allow new users to sign up". Staff accounts are created by an admin under **Authentication → Users → Add user**.
- Every new user gets a `profiles` row with role `sales`. To make someone an admin:
  ```sql
  update public.profiles set role = 'admin' where email = 'boss@example.com';
  ```
- To deactivate a staff member: `update public.profiles set active = false where email = '…';`
- Add the site URL under **Authentication → URL Configuration**.

## 3. Frontend (static, no build)

1. Copy `web/js/config.example.js` to `web/js/config.js`. Fill in the project URL and the **anon/publishable** key. Never use the service-role key.
2. Optionally set `WALLET_BASE_URL` to the public `wallet.html` URL used in WhatsApp links.
3. Upload the contents of `web/` to the SiteGround subdomain.

Pages:
- `index.html` — staff login
- `sales.html` — issue tickets and see your customers
- `wallet.html?t=TOKEN` — customer wallet (public; access is by token). Opens the Golden Envelope when one is waiting, then tickets and vouchers. A 中文 / EN control switches the whole site.
- `admin.html` — stats, customers and voids, rounds/prizes/settings, staff roles, CSV export (admin only)
- `draw.html` — projector (admin only). The Golden Ticket drum plays the draw. Tickets in the drum are the ones allocated to the selected prize. **Draw** asks the server to pick the winner, then the drum reveals that ticket. A win still issues the lucky-draw voucher. **Space** = draw, **F** = fullscreen. Forfeit is on the bar above the drum.

## 4. Configurable business rules (`app_settings`)

| Column | Default | Meaning |
|---|---|---|
| `repeat_bonus_tickets` | 3 | Repeat-purchase bonus per qualifying invoice |
| `referral_bonus_tickets` | 5 | Given to both the referrer and the new customer |
| `repeat_bonus_on_topup` | **false** | Does a top-up in a later round also earn the repeat bonus? |
| ~~`repeat_bonus_same_round`~~, ~~`max_tickets_per_invoice`~~ | — | No longer used since 006 (repeat is once per later round; tickets come from packages) |
| `block_future_invoice_dates` | true | Rejects invoice dates later than today (MYT). Turn off only for testing. |
| `enforce_draw_schedule` | true | Round draws open only after that round's allocation deadline. The Grand draw opens only after the last deadline and once R4's prizes are drawn. Turn off only for a rehearsal. |

All of these can also be edited in **admin.html → 轮次与奖项 Rounds & prizes**.

Edit a value with, for example, `update public.app_settings set repeat_bonus_same_round = true;`.

Round dates and prize slot counts can be changed in the `rounds` and `prize_categories` tables.
