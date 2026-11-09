/* Local-only stand-in for Supabase. Used when the mock admin is logged in,
   or when a wallet link token starts with "local-". Never used on a deployed host. */
(function () {
  'use strict';
  if (!window.App) return;

  const DB_KEY = 'zv-local-db';
  const PRIZES = [
    ['SERUM', '精华液', 'Serum', '只需 RM68', 'Only RM68'],
    ['CREAM', '面霜', 'Cream', '只需 RM68', 'Only RM68'],
    ['BEVITE', 'Bevite', 'Bevite', '只需 RM68', 'Only RM68'],
    ['BEJOJOBA', 'Bejojoba', 'Bejojoba', '只需 RM68', 'Only RM68'],
    ['SHEEP', 'ZÉLL-V Sheep', 'ZÉLL-V Sheep', '免费', 'Free'],
    ['VIT_D', '维他命 D', 'Vitamin D', '免费', 'Free'],
  ].map(([code, name_zh, name_en, offer_zh, offer_en], i) => ({
    code, name_zh, name_en, offer_zh, offer_en, sort: i, active: true,
  }));

  function seed() {
    const rounds = [
      { id: 1, code: 'R1', name_zh: '第一轮', name_en: 'Round 1', purchase_start: '2026-11-01', purchase_end: '2026-11-23', allocation_deadline: '2026-11-24T15:59:00.000Z', draw_date: '2026-11-25' },
      { id: 2, code: 'R2', name_zh: '第二轮', name_en: 'Round 2', purchase_start: '2026-11-24', purchase_end: '2026-12-07', allocation_deadline: '2026-12-08T15:59:00.000Z', draw_date: '2026-12-09' },
      { id: 3, code: 'R3', name_zh: '第三轮', name_en: 'Round 3', purchase_start: '2026-12-08', purchase_end: '2026-12-21', allocation_deadline: '2026-12-22T15:59:00.000Z', draw_date: '2026-12-23' },
      { id: 4, code: 'R4', name_zh: '第四轮', name_en: 'Round 4', purchase_start: '2026-12-22', purchase_end: '2026-12-31', allocation_deadline: '2027-01-07T15:59:00.000Z', draw_date: '2027-01-08' },
    ];
    const prize = (id, roundId, rank, slots, zh, en) => ({
      id, round_id: roundId, is_grand: false, rank, winner_slots: slots,
      name_zh: zh, name_en: en, prize_desc: '',
    });
    const cats = [];
    rounds.forEach((r) => {
      cats.push(prize(r.id * 10 + 2, r.id, 2, 1, '二奖', '2nd prize'));
      cats.push(prize(r.id * 10 + 3, r.id, 3, 2, '三奖', '3rd prize'));
      cats.push(prize(r.id * 10 + 4, r.id, 4, 5, '四奖', '4th prize'));
    });
    cats.push({ id: 99, round_id: null, is_grand: true, rank: 1, winner_slots: 1, name_zh: '总决赛', name_en: 'Grand Finale', prize_desc: '' });

    const packages = [
      ['ORAL_1', 'oral', 'boxes', '任何一盒 ZÉLL-V 口服保健品', 'Any 1 box ZÉLL-V oral supplement', 1, 1, 10],
      ['ORAL_B4F1', 'oral', 'boxes', '买4送1', 'Buy 4 Free 1', 4, 4, 20],
      ['ORAL_B6F2', 'oral', 'boxes', '买6送2', 'Buy 6 Free 2', 6, 6, 30],
      ['ORAL_B12F5', 'oral', 'boxes', '买12送5', 'Buy 12 Free 5', 12, 24, 40],
      ['ORAL_B18F7', 'oral', 'boxes', '买18送7', 'Buy 18 Free 7', 18, 54, 50],
      ['PP_B2F1', 'pp', 'fixed', 'PP2 / PP3 买2送1', 'PP2 / PP3 Buy 2 Free 1', 2, 1, 60],
      ['TRIO', 'trio', 'fixed', '三重配套 (12+12+12)', 'Trio Package (12+12+12)', 36, 50, 70],
      ['VOUCHER_5K', 'voucher', 'level', 'RM5,000 产品礼券', 'RM5,000 Product Voucher', 0, 0, 80],
      ['VOUCHER_10K', 'voucher', 'level', 'RM10,000 产品礼券', 'RM10,000 Product Voucher', 0, 10, 90],
      ['VOUCHER_20K', 'voucher', 'level', 'RM20,000 产品礼券', 'RM20,000 Product Voucher', 0, 20, 100],
      ['CT_8', 'cellular', 'level', '细胞疗程 8', 'Cellular Therapy 8', 0, 25, 110],
      ['CT_16_24', 'cellular', 'level', '细胞疗程 16 / 24', 'Cellular Therapy 16 / 24', 0, 52, 120],
    ].map(([code, category, kind, name_zh, name_en, paid_boxes, tickets, sort]) => ({
      code, category, kind, name_zh, name_en, paid_boxes, tickets, sort, active: true,
    }));

    return {
      seq: 100,
      settings: {
        id: true, repeat_bonus_tickets: 3, referral_bonus_tickets: 5,
        repeat_bonus_on_topup: false, block_future_invoice_dates: true, enforce_draw_schedule: false,
      },
      profiles: [{
        id: 'local-admin', email: 'admin@local.test', full_name: '本地管理员',
        role: 'admin', active: true, created_at: '2026-11-01T02:00:00.000Z',
      }],
      rounds, cats, packages,
      customers: [{
        id: 1, name: '陈大文', phone: '60123456789', email: 'chan@example.com',
        wallet_token: 'local-1', created_at: '2026-11-06T02:00:00.000Z', created_by: '本地管理员',
        pdpa_consent_at: '2026-11-06T03:00:00.000Z', first_opened_at: null, last_opened_at: null, open_count: 0,
        referred_by: null, allocations: { 1: { 14: 3, 13: 2, 12: 1 } },
      }],
      invoices: [{
        id: 1, customer_id: 1, invoice_no: 'INV-1008', invoice_date: '2026-11-06', round_id: 1,
        source: 'purchase', package_code: 'ORAL_B6F2', quantity: 1, paid_boxes: 6, tickets: 6,
        sales: '本地管理员', voided_at: null, void_reason: null,
      }],
      grants: [{
        id: 1, customer_id: 1, invoice_id: 1, round_id: 1, source: 'purchase', tickets: 6,
        invoice_no: 'INV-1008', related_name: null, voided_at: null, void_reason: null,
      }],
      envelopes: [{ id: 1, customer_id: 1, invoice_id: 1, paid_boxes: 6, lifetime_tickets: 6, status: 'pending', prize_code: null }],
      vouchers: [],
      winners: [],
    };
  }

  function load() {
    let db;
    let fresh = false;
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) db = JSON.parse(raw);
      else { db = seed(); fresh = true; }
    } catch (_) { db = seed(); fresh = true; }
    if (fresh || reconcile(db)) save(db);
    return db;
  }
  function save(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  const nextId = (db) => ++db.seq;

  const same = (a, b) => a === b || (a != null && b != null && String(a) === String(b));
  const roundById = (db, id) => db.rounds.find((r) => same(r.id, id));
  const catById = (db, id) => db.cats.find((c) => same(c.id, id));
  const customerById = (db, id) => db.customers.find((c) => same(c.id, id));
  const customerByToken = (db, token) => db.customers.find((c) => c.wallet_token === token);
  const customerByPhone = (db, phone) => db.customers.find((c) => c.phone === phone);
  const pkgByCode = (db, code) => db.packages.find((p) => p.code === code);
  const live = (rows) => rows.filter((r) => !r.voided_at);
  const maskName = (name) => (name ? name.slice(0, 1) + '**' : '');
  function maskPhone(phone) {
    const local = phone && phone.startsWith('60') ? '0' + phone.slice(2) : (phone || '');
    if (local.length < 7) return local;
    return local.slice(0, 3) + '-***-' + local.slice(-4);
  }

  function roundFor(db, dateStr) {
    return db.rounds.find((r) => dateStr >= r.purchase_start && dateStr <= r.purchase_end) || null;
  }

  function paidBoxes(db, customerId, category) {
    return live(db.invoices).filter((i) => same(i.customer_id, customerId) && pkgByCode(db, i.package_code) && pkgByCode(db, i.package_code).category === category)
      .reduce((s, i) => s + (i.paid_boxes || 0), 0);
  }
  function levelTickets(db, customerId, category) {
    const rows = live(db.invoices).filter((i) => same(i.customer_id, customerId) && pkgByCode(db, i.package_code) && pkgByCode(db, i.package_code).category === category && pkgByCode(db, i.package_code).kind === 'level');
    if (!rows.length) return null;
    return Math.max(...rows.map((i) => pkgByCode(db, i.package_code).tickets));
  }

  function lifetimeTickets(db, customerId) {
    return live(db.grants).filter((g) => same(g.customer_id, customerId)).reduce((s, g) => s + Number(g.tickets || 0), 0);
  }
  function hasEnvelope(db, customerId) {
    return (db.envelopes || []).some((e) => same(e.customer_id, customerId) && (e.status === 'pending' || e.status === 'claimed'));
  }
  function awardEnvelope(db, customerId, invoiceId) {
    if (customerId == null || hasEnvelope(db, customerId)) return false;
    const life = lifetimeTickets(db, customerId);
    if (life < 4) return false;
    const inv = (invoiceId != null && db.invoices.find((i) => same(i.id, invoiceId)))
      || live(db.invoices).filter((i) => same(i.customer_id, customerId)).slice(-1)[0];
    if (!inv) return false;
    db.envelopes.push({
      id: nextId(db), customer_id: customerId, invoice_id: inv.id,
      paid_boxes: inv.paid_boxes || 0, lifetime_tickets: life,
      status: 'pending', prize_code: null,
    });
    return true;
  }
  function dropEnvelopeIfUnearned(db, customerId) {
    if (lifetimeTickets(db, customerId) >= 4) return;
    (db.envelopes || []).forEach((e) => {
      if (same(e.customer_id, customerId) && e.status === 'pending') e.status = 'cancelled';
    });
    (db.vouchers || []).forEach((v) => {
      if (!same(v.customer_id, customerId) || v.kind !== 'golden_envelope' || v.status !== 'issued') return;
      const env = db.envelopes.find((e) => same(e.id, v.golden_envelope_id));
      if (env && env.status === 'claimed') {
        v.status = 'voided';
        v.void_reason = 'Lifetime tickets fell below 4';
      }
    });
  }
  function reconcile(db) {
    db.envelopes = db.envelopes || [];
    db.vouchers = db.vouchers || [];
    let changed = false;
    const groups = {};
    db.envelopes.forEach((e) => {
      if (e.status !== 'pending' && e.status !== 'claimed') return;
      const key = String(e.customer_id);
      (groups[key] = groups[key] || []).push(e);
    });
    Object.values(groups).forEach((list) => {
      list.sort((a, b) => (a.status === 'claimed' ? 0 : 1) - (b.status === 'claimed' ? 0 : 1) || Number(a.id) - Number(b.id));
      list.slice(1).forEach((e) => {
        if (e.status === 'pending') { e.status = 'cancelled'; changed = true; }
      });
    });
    (db.customers || []).forEach((c) => {
      if (awardEnvelope(db, c.id, null)) changed = true;
    });
    return changed;
  }

  function entrants() {
    return [
      ['陈大文', '60123456789'],
      ['林美玲', '60111111111'],
      ['黄志明', '60122222222'],
      ['林小芳', '60133333333'],
      ['Ahmad Rizal', '60144444444'],
      ['Siti Aminah', '60155555555'],
    ].map(([name, phone], i) => ({
      id: 'pool-' + (i + 1), name, name_masked: maskName(name), phone, phone_masked: maskPhone(phone), tickets: 4 + i,
    }));
  }

  function poolRows(db, cat) {
    return db.customers.map((customer) => {
      const weight = cat.is_grand
        ? lifetimeTickets(db, customer.id)
        : Number(((customer.allocations || {})[cat.round_id] || (customer.allocations || {})[String(cat.round_id)] || {})[cat.id]
          || ((customer.allocations || {})[cat.round_id] || (customer.allocations || {})[String(cat.round_id)] || {})[String(cat.id)] || 0);
      if (weight <= 0) return null;
      const wonRank = db.winners.some((w) => same(w.customer_id, customer.id) && w.rank === cat.rank && w.status === 'won');
      const forfeited = db.winners.some((w) => same(w.customer_id, customer.id) && same(w.prize_category_id, cat.id) && w.status === 'forfeited');
      if (wonRank || forfeited) return null;
      return { customer, weight };
    }).filter(Boolean);
  }
  function drawBlocked(db, cat, round) {
    if (!db.settings.enforce_draw_schedule) return null;
    const gate = cat.is_grand ? '2027-01-07T15:59:00.000Z' : (round && round.allocation_deadline);
    if (gate && Date.now() < new Date(gate).getTime()) return '未到开奖时间 / The draw is not open yet';
    return null;
  }
  function prizeVoucher(db, winner, cat) {
    const round = cat.round_id ? roundById(db, cat.round_id) : null;
    const title_zh = !round || cat.is_grand ? cat.name_zh : `${round.code} · ${cat.name_zh}`;
    const title_en = !round || cat.is_grand ? cat.name_en : `${round.code} · ${cat.name_en}`;
    db.vouchers.unshift({
      id: nextId(db), customer_id: winner.customer_id, kind: 'lucky_draw',
      code: 'LD-LOCAL' + winner.id, title_zh, title_en,
      detail_zh: cat.prize_desc || '', detail_en: cat.prize_desc || '',
      status: 'issued', winner_id: winner.id, golden_envelope_id: null,
    });
  }
  function stagePayload(db, cat) {
    const round = cat.round_id ? roundById(db, cat.round_id) : null;
    const rows = poolRows(db, cat);
    const entries = [];
    rows.forEach(({ customer, weight }) => {
      const n = maskName(customer.name);
      const p = maskPhone(customer.phone);
      for (let i = 1; i <= weight; i++) {
        entries.push({ t: `T${customer.id}-${cat.id}-${i}`, n, p, c: String(customer.id) });
      }
    });
    const won = db.winners.filter((w) => same(w.prize_category_id, cat.id) && w.status === 'won');
    const revealed = won.map((w) => {
      const c = customerById(db, w.customer_id);
      return {
        t: 'W' + w.id, n: c ? maskName(c.name) : '***', p: c ? maskPhone(c.phone) : '****',
        c: String(w.customer_id), prize: String(cat.id), at: w.created_at || '', winner_id: w.id,
      };
    });
    const tickets = rows.reduce((s, r) => s + r.weight, 0);
    return {
      draw: {
        id: String(cat.id),
        title: cat.is_grand || !round
          ? { en: 'Grand Finale', zh: '总决赛' }
          : { en: round.name_en, zh: round.name_zh },
        date: cat.is_grand || !round ? '2027-01-08' : round.draw_date,
        note: {
          en: cat.name_en + (cat.prize_desc ? ' · ' + cat.prize_desc : ''),
          zh: cat.name_zh + (cat.prize_desc ? ' · ' + cat.prize_desc : ''),
        },
        grand: !!cat.is_grand,
      },
      prizes: [{
        id: String(cat.id), rank: cat.rank,
        short: { en: cat.name_en, zh: cat.name_zh },
        name: {
          en: cat.prize_desc || cat.name_en,
          zh: cat.prize_desc || cat.name_zh,
        },
        count: cat.winner_slots,
      }],
      entries,
      revealed,
      admin_winners: db.winners.filter((w) => same(w.prize_category_id, cat.id)).map((w) => {
        const c = customerById(db, w.customer_id);
        return { id: w.id, status: w.status, name: c ? c.name : '', phone_masked: c ? maskPhone(c.phone) : '', forfeit_reason: w.forfeit_reason || '' };
      }),
      filled: won.length,
      pool: { count: rows.length, tickets },
      blocked_reason: drawBlocked(db, cat, round),
    };
  }

  function drawStatus(db, catId) {
    const cat = catById(db, catId);
    if (!cat) return { error: { message: '找不到奖项 / Prize not found' } };
    const round = cat.round_id ? roundById(db, cat.round_id) : null;
    const winners = db.winners.filter((w) => same(w.prize_category_id, cat.id)).map((w) => {
      const c = customerById(db, w.customer_id);
      return { ...w, name: c ? c.name : '', name_masked: c ? maskName(c.name) : '', phone: c ? c.phone : '', phone_masked: c ? maskPhone(c.phone) : '' };
    });
    const filled = winners.filter((w) => w.status === 'won').length;
    const forfeited = winners.filter((w) => w.status === 'forfeited').length;
    const rows = poolRows(db, cat);
    return {
      data: {
        category: { ...cat, round: round ? { code: round.code, name_zh: round.name_zh, name_en: round.name_en, draw_date: round.draw_date } : null },
        filled, pending_redraws: forfeited && filled < cat.winner_slots ? forfeited : 0,
        blocked_reason: drawBlocked(db, cat, round),
        pool: { count: rows.length, tickets: rows.reduce((s, r) => s + r.weight, 0) },
        winners,
        sample: rows.map(({ customer, weight }) => ({ name: customer.name, name_masked: maskName(customer.name), phone: customer.phone, phone_masked: maskPhone(customer.phone), tickets: weight })),
      },
    };
  }

  function walletOf(db, customer) {
    customer.open_count = (customer.open_count || 0) + 1;
    customer.last_opened_at = new Date().toISOString();
    if (!customer.first_opened_at) customer.first_opened_at = customer.last_opened_at;
    if (!customer.pdpa_consent_at) {
      return {
        consent_required: true, server_now: new Date().toISOString(),
        customer: { name: customer.name, phone_masked: maskPhone(customer.phone) },
      };
    }
    const grants = live(db.grants).filter((g) => same(g.customer_id, customer.id));
    const wonBy = (catId) => (db.winners || []).filter((w) => same(w.prize_category_id, catId) && w.status === 'won').map((w) => ({
      name: maskName(w.name), phone: maskPhone(w.phone), is_me: same(w.customer_id, customer.id),
    }));
    const rounds = db.rounds.map((r) => {
      const mine = grants.filter((g) => same(g.round_id, r.id));
      const by = { purchase: 0, topup: 0, repeat_bonus: 0, referral: 0 };
      mine.forEach((g) => { by[g.source] = (by[g.source] || 0) + g.tickets; });
      const tickets = mine.reduce((s, g) => s + g.tickets, 0);
      const alloc = (customer.allocations && (customer.allocations[r.id] || customer.allocations[String(r.id)])) || {};
      const allocated = Object.values(alloc).reduce((s, n) => s + n, 0);
      const cats = db.cats.filter((c) => same(c.round_id, r.id)).map((c) => ({
        ...c, my_tickets: alloc[c.id] || alloc[String(c.id)] || 0, winners: wonBy(c.id),
      }));
      return {
        ...r, tickets_total: tickets, allocated_total: allocated, unallocated: Math.max(0, tickets - allocated),
        by_source: by, categories: cats,
      };
    });
    const biggest = live(db.invoices).filter((i) => same(i.customer_id, customer.id) && i.source === 'purchase')
      .reduce((m, i) => Math.max(m, i.paid_boxes || 0), 0);
    const pending = db.envelopes.filter((e) => same(e.customer_id, customer.id) && e.status === 'pending').map((e) => {
      const inv = db.invoices.find((i) => same(i.id, e.invoice_id));
      const round = inv && roundById(db, inv.round_id);
      return {
        id: e.id, paid_boxes: e.paid_boxes, lifetime_tickets: e.lifetime_tickets || lifetimeTickets(db, customer.id),
        invoice_no: inv ? inv.invoice_no : '', invoice_date: inv ? inv.invoice_date : '', round_code: round ? round.code : '',
      };
    });
    const vouchers = db.vouchers.filter((v) => same(v.customer_id, customer.id) && v.status !== 'voided');
    const total = grants.reduce((s, g) => s + g.tickets, 0);
    return {
      consent_required: false, server_now: new Date().toISOString(),
      customer: { name: customer.name, phone_masked: maskPhone(customer.phone), biggest_order: biggest },
      vouchers, rounds,
      golden: { min_tickets: 4, pending, prizes: PRIZES },
      grand: {
        tickets_total: total, winners: wonBy(99),
        draw_date: (db.rounds[db.rounds.length - 1] || {}).draw_date || '2027-01-08',
        category: catById(db, 99),
      },
    };
  }

  function customerSummary(db, c) {
    const grants = live(db.grants).filter((g) => same(g.customer_id, c.id));
    const rounds = db.rounds.map((r) => {
      const mine = grants.filter((g) => same(g.round_id, r.id));
      const granted = mine.reduce((s, g) => s + g.tickets, 0);
      const alloc = (c.allocations && c.allocations[r.id]) || {};
      const allocated = Object.values(alloc).reduce((s, n) => s + n, 0);
      return {
        code: r.code, id: r.id, granted, allocated, unallocated: Math.max(0, granted - allocated),
        is_open: Date.now() <= new Date(r.allocation_deadline).getTime(),
      };
    });
    return {
      id: c.id, name: c.name, phone: c.phone, email: c.email || '',
      wallet_token: c.wallet_token, total_tickets: grants.reduce((s, g) => s + g.tickets, 0),
      first_opened_at: c.first_opened_at, last_opened_at: c.last_opened_at, rounds,
      vouchers: (db.vouchers || []).filter((v) => same(v.customer_id, c.id) && v.status === 'issued').map((v) => ({
        id: v.id, code: v.code, kind: v.kind, title_zh: v.title_zh, title_en: v.title_en,
        detail_zh: v.detail_zh || '', detail_en: v.detail_en || '', status: v.status,
      })),
    };
  }

  function customerDetail(db, id) {
    const c = customerById(db, id);
    if (!c) return { error: { message: '找不到顾客 / Customer not found' } };
    const grants = db.grants.filter((g) => same(g.customer_id, c.id));
    const liveGrants = grants.filter((g) => !g.voided_at);
    const rounds = db.rounds.map((r) => {
      const mine = liveGrants.filter((g) => same(g.round_id, r.id));
      const alloc = (c.allocations && c.allocations[r.id]) || {};
      const allocations = Object.entries(alloc).filter(([, n]) => n > 0).map(([catId, n]) => {
        const cat = catById(db, catId);
        return { name_zh: cat ? cat.name_zh : catId, effective: n, allocated: n };
      });
      return { code: r.code, granted: mine.reduce((s, g) => s + g.tickets, 0), allocations };
    }).filter((r) => r.granted || r.allocations.length);
    const wins = db.winners.filter((w) => w.phone === c.phone).map((w) => {
      const cat = catById(db, w.prize_category_id);
      const round = cat && cat.round_id ? roundById(db, cat.round_id) : null;
      return { round_code: round ? round.code : '', name_zh: cat ? cat.name_zh : '', name_en: cat ? cat.name_en : '', status: w.status, forfeit_reason: w.forfeit_reason || '' };
    });
    return {
      data: {
        customer: c, rounds, wins,
        vouchers: db.vouchers.filter((v) => same(v.customer_id, c.id)),
        invoices: db.invoices.filter((i) => same(i.customer_id, c.id)).map((i) => {
          const pkg = pkgByCode(db, i.package_code);
          const round = roundById(db, i.round_id);
          return { ...i, round_code: round ? round.code : '', package: pkg ? pkg.name_zh : i.package_code };
        }),
        grants: grants.map((g) => ({ ...g, round_code: (roundById(db, g.round_id) || {}).code || '' })),
      },
    };
  }

  function adminStats(db) {
    const grants = live(db.grants);
    const by = { purchase: 0, topup: 0, repeat_bonus: 0, referral: 0 };
    grants.forEach((g) => { by[g.source] = (by[g.source] || 0) + g.tickets; });
    const pool = entrants();
    const catStat = (c) => {
      const won = db.winners.filter((w) => same(w.prize_category_id, c.id) && w.status === 'won').length;
      return { ...c, participants: pool.length, tickets: pool.reduce((s, p) => s + p.tickets, 0), eligible: pool.length, filled: won };
    };
    return {
      generated_at: new Date().toISOString(),
      totals: {
        customers: db.customers.length,
        tickets: grants.reduce((s, g) => s + g.tickets, 0),
        invoices: live(db.invoices).length,
        opened: db.customers.filter((c) => c.first_opened_at).length,
        consented: db.customers.filter((c) => c.pdpa_consent_at).length,
        voided_grants: db.grants.filter((g) => g.voided_at).length,
        by_source: by,
      },
      rounds: db.rounds.map((r) => ({
        ...r,
        is_open: Date.now() <= new Date(r.allocation_deadline).getTime(),
        customers: new Set(grants.filter((g) => same(g.round_id, r.id)).map((g) => g.customer_id)).size,
        granted: grants.filter((g) => same(g.round_id, r.id)).reduce((s, g) => s + g.tickets, 0),
        allocated: 0,
        categories: db.cats.filter((c) => same(c.round_id, r.id)).map(catStat),
      })),
      grand: catStat(catById(db, 99)),
    };
  }

  function issue(db, args) {
    const phone = args.p_phone;
    const pkg = pkgByCode(db, args.p_package);
    const round = roundFor(db, args.p_invoice_date);
    if (!pkg) return { error: { message: '请选择有效的配套 / Choose a valid package' } };
    if (!round) return { error: { message: '不在任何一轮的购买期内 / Not within any round' } };
    if (Date.now() > new Date(round.allocation_deadline).getTime()) {
      return { error: { message: '该轮已截止 / That round is closed' } };
    }
    if (db.settings.block_future_invoice_dates && args.p_invoice_date > App.todayMYT()) {
      return { error: { message: '发票日期不能是未来 / Invoice date cannot be in the future' } };
    }
    const qty = Number(args.p_qty) || 1;
    let existing = customerByPhone(db, phone);
    const isNew = !existing;
    let tickets = 0;
    let paid = 0;
    let calc = '';
    if (args.p_source === 'purchase') {
      tickets = pkg.tickets * qty;
      paid = pkg.paid_boxes * qty;
      calc = `${pkg.tickets} × ${qty}`;
    } else if (pkg.kind === 'boxes') {
      const before = existing ? paidBoxes(db, existing.id, pkg.category) : 0;
      if (!before) return { error: { message: '此顾客还没有付费盒数可加购，请选择「购买」/ No earlier paid boxes to top up. Use Purchase instead' } };
      const after = before + qty;
      const mult = after >= 18 ? 3 : after >= 12 ? 2 : 1;
      tickets = qty * mult;
      paid = qty;
      calc = `${qty} × ${mult}`;
    } else if (pkg.kind === 'level') {
      const prev = existing ? levelTickets(db, existing.id, pkg.category) : null;
      if (prev == null) return { error: { message: '此顾客没有可升级的配套，请选择「购买」/ Nothing to upgrade. Use Purchase instead' } };
      if (pkg.tickets <= prev) return { error: { message: '必须升级到更高配套 / Must be a higher package' } };
      tickets = pkg.tickets - prev;
      calc = `${pkg.tickets} − ${prev}`;
    } else {
      tickets = pkg.tickets * qty;
      paid = pkg.paid_boxes * qty;
      calc = `${pkg.tickets} × ${qty}`;
    }
    if (db.invoices.some((i) => i.invoice_no === args.p_invoice_no && !i.voided_at)) {
      return { error: { message: '发票号码已存在 / Invoice number already exists' } };
    }

    const grants = [{
      source: args.p_source, recipient: 'customer', customer_name: args.p_name,
      tickets, round_code: round.code, invoice_no: args.p_invoice_no,
    }];
    let referrer = null;
    if (isNew && args.p_source === 'purchase' && args.p_referrer_phone) {
      const refPhone = App.normalizePhone(args.p_referrer_phone);
      const ref = customerByPhone(db, refPhone);
      if (!ref || !live(db.grants).some((g) => same(g.customer_id, ref.id))) {
        return { error: { message: '找不到此现有顾客 / No existing customer with this phone' } };
      }
      const bonus = db.settings.referral_bonus_tickets;
      grants.push({ source: 'referral', recipient: 'referrer', customer_name: ref.name, tickets: bonus, round_code: round.code, invoice_no: args.p_invoice_no });
      grants.push({ source: 'referral', recipient: 'customer', customer_name: args.p_name, tickets: bonus, round_code: round.code, invoice_no: args.p_invoice_no });
      referrer = ref;
      tickets += bonus;
    }

    const priorLife = existing ? lifetimeTickets(db, existing.id) : 0;
    const addLife = grants.filter((g) => g.recipient === 'customer').reduce((s, g) => s + g.tickets, 0);
    const golden = !(existing && hasEnvelope(db, existing.id)) && priorLife + addLife >= 4;
    const refAdd = referrer ? grants.filter((g) => g.recipient === 'referrer').reduce((s, g) => s + g.tickets, 0) : 0;
    const referrerGolden = !!(referrer && !hasEnvelope(db, referrer.id) && lifetimeTickets(db, referrer.id) + refAdd >= 4);
    const result = {
      round, package: { ...pkg, quantity: qty }, calc, invoice_tickets: pkg.tickets * qty,
      grants, customer_new_tickets: tickets,
      golden_envelope: golden, referrer_golden_envelope: referrerGolden,
      lifetime_tickets: priorLife + addLife,
      customer: { name: args.p_name, phone, is_new: isNew, wallet_token: existing ? existing.wallet_token : null },
      referrer: referrer ? { name: referrer.name, phone: referrer.phone, wallet_token: referrer.wallet_token } : null,
    };
    if (args.p_dry_run) return { data: result };

    if (!existing) {
      existing = {
        id: nextId(db), name: args.p_name, phone, email: args.p_email || '',
        wallet_token: 'local-' + db.seq, created_at: new Date().toISOString(), created_by: '本地管理员',
        pdpa_consent_at: null, first_opened_at: null, last_opened_at: null, open_count: 0,
        referred_by: referrer ? { name: referrer.name } : null, allocations: {},
      };
      db.customers.push(existing);
      result.customer.wallet_token = existing.wallet_token;
    } else if (args.p_name) existing.name = args.p_name;
    const invoice = {
      id: nextId(db), customer_id: existing.id, invoice_no: args.p_invoice_no, invoice_date: args.p_invoice_date,
      round_id: round.id, source: args.p_source, package_code: pkg.code, quantity: qty, paid_boxes: paid,
      tickets, sales: '本地管理员', voided_at: null, void_reason: null,
    };
    db.invoices.push(invoice);
    grants.forEach((g) => {
      const who = g.recipient === 'referrer' ? referrer : existing;
      db.grants.push({
        id: nextId(db), customer_id: who.id, invoice_id: invoice.id, round_id: round.id,
        source: g.source, tickets: g.tickets, invoice_no: args.p_invoice_no, related_name: null,
        voided_at: null, void_reason: null,
      });
    });
    awardEnvelope(db, existing.id, invoice.id);
    if (referrer) awardEnvelope(db, referrer.id, invoice.id);
    save(db);
    return { data: result };
  }

  function rpc(db, name, args) {
    args = args || {};
    if (name === 'admin_stats') return { data: adminStats(db) };
    if (name === 'my_customers') return { data: db.customers.map((c) => customerSummary(db, c)) };
    if (name === 'admin_customer_detail') return customerDetail(db, args.p_customer_id);
    if (name === 'lookup_customer') {
      const c = customerByPhone(db, args.p_phone);
      if (!c) return { data: { exists: false, phone: args.p_phone, has_tickets: false, lifetime_tickets: 0, has_golden_envelope: false } };
      const has = live(db.grants).some((g) => same(g.customer_id, c.id));
      const purchaseRounds = [...new Set(live(db.invoices).filter((i) => same(i.customer_id, c.id) && i.source === 'purchase').map((i) => (roundById(db, i.round_id) || {}).code || ''))]
        .map((code) => code.replace(/^R/, '')).filter(Boolean);
      const paid = {};
      const levels = {};
      db.packages.forEach((p) => {
        if (p.kind === 'boxes') paid[p.category] = paidBoxes(db, c.id, p.category);
        if (p.kind === 'level') {
          const lv = levelTickets(db, c.id, p.category);
          if (lv != null) levels[p.category] = lv;
        }
      });
      return { data: { exists: true, phone: c.phone, name: c.name, email: c.email || '', has_tickets: has, purchase_rounds: purchaseRounds, paid_boxes: paid, levels, lifetime_tickets: lifetimeTickets(db, c.id), has_golden_envelope: hasEnvelope(db, c.id) } };
    }
    if (name === 'issue_tickets') return issue(db, args);
    if (name === 'draw_status') return drawStatus(db, args.p_category_id);
    if (name === 'draw_stage') {
      const cat = catById(db, args.p_category_id);
      if (!cat) return { error: { message: '找不到奖项 / Prize not found' } };
      return { data: stagePayload(db, cat) };
    }
    if (name === 'draw_winner') {
      const cat = catById(db, args.p_category_id);
      if (!cat) return { error: { message: '找不到奖项 / Prize not found' } };
      const round = cat.round_id ? roundById(db, cat.round_id) : null;
      const blocked = drawBlocked(db, cat, round);
      if (blocked) return { error: { message: blocked } };
      const filled = db.winners.filter((w) => same(w.prize_category_id, cat.id) && w.status === 'won').length;
      if (filled >= cat.winner_slots) return { error: { message: '名额已满 / All slots are filled' } };
      const rows = poolRows(db, cat);
      const total = rows.reduce((s, r) => s + r.weight, 0);
      if (!total) return { error: { message: '没有符合资格的参与者 / No eligible entrants left for this prize' } };
      let roll = Math.floor(Math.random() * total);
      let chosen = rows[rows.length - 1];
      for (const row of rows) {
        if (roll < row.weight) { chosen = row; break; }
        roll -= row.weight;
      }
      const winner = {
        id: nextId(db), customer_id: chosen.customer.id, prize_category_id: cat.id, rank: cat.rank,
        status: 'won', forfeit_reason: null, tickets_in_pool: chosen.weight, phone: chosen.customer.phone,
        name: chosen.customer.name, created_at: new Date().toISOString(),
      };
      db.winners.push(winner);
      prizeVoucher(db, winner, cat);
      save(db);
      return { data: {
        winner: {
          id: winner.id, tickets: chosen.weight, name: chosen.customer.name, name_masked: maskName(chosen.customer.name),
          phone: chosen.customer.phone, phone_masked: maskPhone(chosen.customer.phone),
        },
        total_tickets: total, pool_size: rows.length, slot: filled + 1, winner_slots: cat.winner_slots,
        is_redraw: db.winners.some((w) => same(w.prize_category_id, cat.id) && w.status === 'forfeited'),
      } };
    }
    if (name === 'mark_forfeited') {
      const w = db.winners.find((x) => same(x.id, args.p_winner_id));
      if (!w) return { error: { message: '找不到得奖者 / Winner not found' } };
      w.status = 'forfeited';
      w.forfeit_reason = args.p_reason || '';
      db.vouchers.forEach((v) => {
        if (same(v.winner_id, w.id) && v.status === 'issued') {
          v.status = 'voided';
          v.void_reason = 'Prize forfeited';
        }
      });
      save(db);
      return drawStatus(db, w.prize_category_id);
    }
    if (name === 'void_invoice') {
      const inv = db.invoices.find((i) => same(i.id, args.p_invoice_id));
      if (!inv) return { error: { message: '找不到发票 / Invoice not found' } };
      inv.voided_at = new Date().toISOString();
      inv.void_reason = args.p_reason || '';
      const touched = new Set([String(inv.customer_id)]);
      db.grants.forEach((g) => {
        if (same(g.invoice_id, inv.id) && !g.voided_at) {
          g.voided_at = inv.voided_at;
          g.void_reason = inv.void_reason;
          touched.add(String(g.customer_id));
        }
      });
      touched.forEach((id) => dropEnvelopeIfUnearned(db, id));
      save(db);
      return customerDetail(db, inv.customer_id);
    }
    if (name === 'void_grant') {
      const g = db.grants.find((x) => same(x.id, args.p_grant_id));
      if (!g) return { error: { message: '找不到记录 / Grant not found' } };
      g.voided_at = new Date().toISOString();
      g.void_reason = args.p_reason || '';
      dropEnvelopeIfUnearned(db, g.customer_id);
      save(db);
      return customerDetail(db, g.customer_id);
    }
    if (name === 'admin_export_winners') {
      return { data: db.winners.map((w) => {
        const cat = catById(db, w.prize_category_id);
        const round = cat && cat.round_id ? roundById(db, cat.round_id) : null;
        return { winner_id: w.id, round: round ? round.code : 'Grand', prize: cat ? cat.name_zh : '', prize_desc: cat ? cat.prize_desc : '', status: w.status, customer_name: w.name, phone: w.phone, email: '', tickets_in_draw: w.tickets, pool_size: '', pool_tickets: '', random_value: '', drawn_at_myt: '', drawn_by: 'local', forfeit_reason: w.forfeit_reason || '', forfeited_at_myt: '' };
      }) };
    }
    if (name === 'admin_export_grants') {
      return { data: db.grants.map((g) => {
        const c = customerById(db, g.customer_id);
        const inv = db.invoices.find((i) => same(i.id, g.invoice_id));
        return { grant_id: g.id, created_at_myt: '', round: (roundById(db, g.round_id) || {}).code || '', source: g.source, tickets: g.tickets, calculation: '', customer_name: c ? c.name : '', phone: c ? c.phone : '', invoice_no: g.invoice_no || '', invoice_date: inv ? inv.invoice_date : '', package: inv ? inv.package_code : '', quantity: inv ? inv.quantity : '', paid_boxes: inv ? inv.paid_boxes : '', related_customer: g.related_name || '', salesperson: '本地管理员', voided: g.voided_at ? 'yes' : '', void_reason: g.void_reason || '' };
      }) };
    }
    if (name === 'get_wallet' || name === 'accept_pdpa' || name === 'submit_allocation' || name === 'open_golden_envelope' || name === 'redeem_voucher') {
      const c = customerByToken(db, args.p_token);
      if (!c) return { error: { message: '链接无效 / Invalid link' } };
      if (name === 'accept_pdpa') c.pdpa_consent_at = new Date().toISOString();
      if (name === 'submit_allocation') {
        const alloc = args.p_alloc || {};
        const sum = Object.values(alloc).reduce((s, n) => s + Number(n), 0);
        const granted = live(db.grants).filter((g) => same(g.customer_id, c.id) && same(g.round_id, args.p_round_id)).reduce((s, g) => s + g.tickets, 0);
        if (sum !== granted) return { error: { message: '分配数量不正确 / Allocation does not match your tickets' } };
        c.allocations = c.allocations || {};
        c.allocations[args.p_round_id] = alloc;
      }
      if (name === 'open_golden_envelope') {
        const env = db.envelopes.find((e) => same(e.id, args.p_envelope_id) && same(e.customer_id, c.id) && e.status === 'pending');
        if (!env) return { error: { message: '这份黄金信封不能开启 / This Golden Envelope is not available' } };
        if (!c.pdpa_consent_at) return { error: { message: '请先同意个人资料保护声明 / Please accept the PDPA notice first' } };
        const prize = PRIZES[Math.floor(Math.random() * PRIZES.length)];
        env.status = 'claimed';
        env.prize_code = prize.code;
        db.vouchers.unshift({
          id: nextId(db), customer_id: c.id, kind: 'golden_envelope', code: 'GE-LOCAL' + env.id,
          title_zh: prize.name_zh, title_en: prize.name_en, detail_zh: prize.offer_zh, detail_en: prize.offer_en,
          status: 'issued', golden_envelope_id: env.id,
        });
      }
      if (name === 'redeem_voucher') {
        const v = db.vouchers.find((x) => same(x.id, args.p_voucher_id) && same(x.customer_id, c.id));
        if (!v || v.status !== 'issued') return { error: { message: '这份礼券不能兑现 / This voucher cannot be redeemed' } };
        v.status = 'redeemed';
      }
      const payload = walletOf(db, c);
      save(db);
      return { data: payload };
    }
    return { error: { message: '本地测试未支持此操作 / Not available in the local test' } };
  }

  function tableRows(db, table) {
    if (table === 'prize_categories') return db.cats;
    if (table === 'app_settings') return [db.settings];
    return db[table] || [];
  }
  function query(table) {
    const q = { filters: [], order: null, op: 'select', values: null };
    const exec = () => {
      const db = load();
      let list = tableRows(db, table).filter((row) => q.filters.every(([col, val]) => same(row[col], val)));
      if (q.op === 'update') {
        list.forEach((row) => Object.assign(row, q.values));
        save(db);
        return Promise.resolve({ data: list.map((row) => ({ ...row })), error: null });
      }
      if (q.order) list = list.slice().sort((a, b) => (a[q.order] > b[q.order] ? 1 : a[q.order] < b[q.order] ? -1 : 0));
      if (q.single) return Promise.resolve({ data: list[0] ? { ...list[0] } : null, error: null });
      return Promise.resolve({ data: list.map((row) => ({ ...row })), error: null });
    };
    const api = {
      select() { return api; },
      update(values) { q.op = 'update'; q.values = values; return api; },
      eq(col, val) { q.filters.push([col, val]); return api; },
      order(col) { q.order = col; return api; },
      maybeSingle() { q.single = true; return exec(); },
      then(resolve, reject) { return exec().then(resolve, reject); },
    };
    return api;
  }

  const listeners = [];
  App.localClient = function () {
    return {
      from(table) { return query(table); },
      rpc(name, args) { return Promise.resolve(rpc(load(), name, args)); },
      auth: {
        getSession() {
          return Promise.resolve({ data: { session: { user: { id: 'local-admin' } } } });
        },
        signInWithPassword() {
          return Promise.resolve({ data: { user: { id: 'local-admin' } }, error: null });
        },
        signOut() {
          try { sessionStorage.removeItem('zv-local-admin'); } catch (_) { /* ignore */ }
          listeners.splice(0).forEach((fn) => fn('SIGNED_OUT'));
          return Promise.resolve({});
        },
        onAuthStateChange(fn) { listeners.push(fn); },
      },
    };
  };
})();
