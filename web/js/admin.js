/* Admin page (admin.html): stats, customers + voids, rounds/prizes/settings,
   staff roles, CSV export. */
(function () {
  'use strict';
  const { $, $$, esc } = App;
  const fmtNum = (n) => Number(n || 0).toLocaleString('en-MY');
  const RANK_ICON = { 1: '👑', 2: '🥈', 3: '🥉', 4: '🎁' };

  const state = { profile: null, customers: null, selected: null, loaded: {} };

  let sb;
  try { sb = App.client({ staff: true }); } catch (e) { document.body.textContent = e.message; return; }

  (async function boot() {
    const auth = await App.requireStaff({ admin: true });
    if (!auth) return;
    state.profile = auth.profile;
    $('#who').innerHTML = `${esc(auth.profile.full_name || auth.profile.email)} <span class="role-chip role-${auth.profile.role}">${auth.profile.role === 'admin' ? '管理员 Admin' : '销售 Sales'}</span>`;
    if (auth.denied) { $('#denied').hidden = false; $('#topnav').innerHTML = ''; return; }
    $('#topnav').innerHTML = App.adminNav('admin');
    $('#app').hidden = false;
    showTab('stats');
  })();
  $('#logout-btn').addEventListener('click', () => sb.auth.signOut());

  // ---------------------------------------------------------------- tabs ----
  const loaders = { stats: loadStats, customers: loadCustomers, setup: loadSetup, staff: loadStaff, export: () => {} };
  function showTab(name) {
    $$('.tabs .tab').forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    if (!state.loaded[name]) { state.loaded[name] = true; loaders[name](); }
  }
  $$('.tabs .tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  const fail = (el, e) => { el.innerHTML = `<p class="form-error">${esc(e.message || e)}</p>`; };

  // =============================================================== STATS ====
  async function loadStats() {
    const body = $('#stats-body');
    try {
      const s = await App.rpc('admin_stats');
      $('#stats-time').textContent = '更新于 Updated ' + App.fmtDateTime(s.generated_at);
      body.innerHTML = renderStats(s);
    } catch (e) { fail(body, e); }
  }
  $('#stats-refresh').addEventListener('click', loadStats);

  function renderStats(s) {
    const t = s.totals;
    const src = t.by_source || {};
    const totals = `<div class="stats-row stats-6">
      <div class="stat"><b>${fmtNum(t.customers)}</b><span>顾客 <span class="en">Customers</span></span></div>
      <div class="stat"><b>${fmtNum(t.tickets)}</b><span>抽奖券 <span class="en">Tickets</span></span></div>
      <div class="stat"><b>${fmtNum(t.invoices)}</b><span>发票 <span class="en">Invoices</span></span></div>
      <div class="stat"><b>${fmtNum(t.opened)}</b><span>已打开链接 <span class="en">Opened link</span></span></div>
      <div class="stat"><b>${fmtNum(t.consented)}</b><span>已同意 PDPA <span class="en">Consented</span></span></div>
      <div class="stat"><b>${fmtNum(t.voided_grants)}</b><span>已作废 <span class="en">Voided grants</span></span></div>
    </div>
    <p class="small muted src-line">${['purchase', 'topup', 'repeat_bonus', 'referral'].map((k) =>
      `${App.SOURCE_LABEL[k].zh} <span class="en">${App.SOURCE_LABEL[k].en}</span> <b>${fmtNum(src[k] || 0)}</b>`).join(' · ')}</p>`;

    const rounds = s.rounds.map((r) => {
      const unalloc = r.granted - r.allocated;
      const dl = App.fmtDeadline(r.allocation_deadline);
      return `<div class="card round-stat">
        <div class="rs-head">
          <h3><span class="round-chip">${esc(r.code)}</span> ${esc(r.name_zh)} <span class="en">${esc(r.name_en)}</span></h3>
          <span class="pill ${r.is_open ? 'pill-ok' : ''}">${r.is_open ? '分配中 Open' : '已截止 Closed'} · ${esc(dl.en)}</span>
        </div>
        <div class="rs-nums">
          <span>顾客 <span class="en">Customers</span> <b>${fmtNum(r.customers)}</b></span>
          <span>抽奖券 <span class="en">Tickets</span> <b>${fmtNum(r.granted)}</b></span>
          <span>已分配 <span class="en">Allocated</span> <b>${fmtNum(r.allocated)}</b></span>
          <span>未分配 <span class="en">Unallocated</span> <b class="${unalloc ? 'warn' : ''}">${fmtNum(unalloc)}</b></span>
        </div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>奖项 <span class="en">Prize</span></th><th class="num">参与者 <span class="en">Entrants</span></th><th class="num">抽奖券 <span class="en">Tickets</span></th><th class="num">可抽 <span class="en">Eligible</span></th><th class="num">已抽/名额 <span class="en">Drawn</span></th><th></th></tr></thead>
          <tbody>${r.categories.map((c) => `<tr>
            <td>${RANK_ICON[c.rank]} ${esc(c.name_zh)} <span class="en">${esc(c.name_en)}</span>${c.prize_desc ? `<div class="small muted">${esc(c.prize_desc)}</div>` : ''}</td>
            <td class="num">${fmtNum(c.participants)}</td>
            <td class="num">${fmtNum(c.tickets)}</td>
            <td class="num">${fmtNum(c.eligible)}</td>
            <td class="num">${c.filled} / ${c.winner_slots}</td>
            <td><a class="btn btn-ghost btn-xs" href="draw.html#c=${c.id}">抽奖 <span class="en">Draw</span> →</a></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`;
    }).join('');

    const g = s.grand;
    const grand = g ? `<div class="card round-stat grand-stat">
      <div class="rs-head"><h3>👑 ${esc(g.name_zh)} <span class="en">${esc(g.name_en)}</span></h3>
        <a class="btn btn-ghost btn-xs" href="draw.html#c=${g.id}">抽奖 <span class="en">Draw</span> →</a></div>
      <div class="rs-nums">
        <span>参与者 <span class="en">Entrants</span> <b>${fmtNum(g.participants)}</b></span>
        <span>抽奖券 <span class="en">Tickets</span> <b>${fmtNum(g.tickets)}</b></span>
        <span>可抽 <span class="en">Eligible</span> <b>${fmtNum(g.eligible)}</b></span>
        <span>已抽/名额 <span class="en">Drawn</span> <b>${g.filled} / ${g.winner_slots}</b></span>
      </div>
      ${g.prize_desc ? `<p class="small muted">${esc(g.prize_desc)}</p>` : ''}
    </div>` : '';
    return totals + rounds + grand;
  }

  // =========================================================== CUSTOMERS ====
  async function loadCustomers() {
    const list = $('#c-list');
    list.innerHTML = '<p class="muted">加载中… Loading…</p>';
    try {
      state.customers = await App.rpc('my_customers');
      renderCustomerList();
    } catch (e) { fail(list, e); }
  }
  $('#c-refresh').addEventListener('click', loadCustomers);
  $('#c-search').addEventListener('input', renderCustomerList);

  function pendingVoucherLine(c) {
    const list = (c.vouchers || []).filter((v) => v.status === 'issued');
    if (!list.length) return '';
    return `<small class="c-vouchers">待兑现 <span class="en">Pending</span> ${list.map((v) => `<span class="zh">${esc(v.title_zh)}</span><span class="en">${esc(v.title_en)}</span>`).join(' · ')}</small>`;
  }

  function renderCustomerList() {
    const all = state.customers || [];
    const q = $('#c-search').value.trim().toLowerCase();
    const qd = q.replace(/\D/g, '');
    const rows = all.filter((c) => !q || c.name.toLowerCase().includes(q)
      || (qd && (c.phone.includes(qd) || ('0' + c.phone.slice(2)).includes(qd))));
    const shown = rows.slice(0, 100);
    $('#c-list').innerHTML = shown.length
      ? `<p class="small muted">${rows.length} 位顾客 <span class="en">customers</span>${rows.length > shown.length ? '（显示前 100 位 / first 100 shown）' : ''}</p>` +
        shown.map((c) => `<button type="button" class="c-row ${state.selected === c.id ? 'active' : ''}" data-id="${c.id}">
          <span><b>${esc(c.name)}</b><small>${esc(App.formatPhone(c.phone))}</small>${pendingVoucherLine(c)}</span>
          <span class="c-total">${fmtNum(c.total_tickets)}</span>
        </button>`).join('')
      : '<p class="muted center empty">没有符合的顾客 <span class="en">No matching customers</span></p>';
  }

  $('#c-list').addEventListener('click', (ev) => {
    const b = ev.target.closest('.c-row');
    if (!b) return;
    state.selected = b.dataset.id;
    renderCustomerList();
    loadDetail(b.dataset.id);
  });

  async function loadDetail(id) {
    const el = $('#c-detail');
    el.innerHTML = '<p class="muted">加载中… Loading…</p>';
    try { renderDetail(await App.rpc('admin_customer_detail', { p_customer_id: id })); } catch (e) { fail(el, e); }
  }

  function renderDetail(d) {
    const c = d.customer;
    const link = App.walletUrl(c.wallet_token);
    const voided = (x) => (x.voided_at ? `<span class="pill pill-warn" title="${esc(x.void_reason || '')}">已作废 Voided</span>` : '');
    $('#c-detail').innerHTML = `
      <div class="card">
        <div class="cust-head">
          <div><h3 class="cust-name">${esc(c.name)}</h3>
            <div class="small muted">${esc(App.formatPhone(c.phone))}${c.email ? ' · ' + esc(c.email) : ''}</div>
            <div class="small muted">建立 <span class="en">Created</span> ${esc(App.fmtDateTime(c.created_at))}${c.created_by ? ' · ' + esc(c.created_by) : ''}${c.referred_by ? ` · 推荐人 <span class="en">Referred by</span> ${esc(c.referred_by.name)}` : ''}</div>
          </div>
        </div>
        <p class="small">${c.first_opened_at ? `<span class="pill pill-ok">已打开 Opened ×${c.open_count}</span> 最近 <span class="en">last</span> ${esc(App.fmtDateTime(c.last_opened_at))}` : '<span class="pill pill-warn">未打开 Not opened</span>'}
          ${c.pdpa_consent_at ? ' <span class="pill pill-ok">PDPA ✓</span>' : ''}</p>
        <div class="copy-row"><input type="text" readonly value="${esc(link)}" aria-label="钱包链接 Wallet link"><button type="button" class="btn btn-ghost btn-sm" data-copy="${esc(link)}">复制 <span class="en">Copy</span></button></div>

        <h4 class="sub-h">各轮 <span class="en">By round</span></h4>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>轮 <span class="en">Round</span></th><th class="num">抽奖券 <span class="en">Tickets</span></th><th>分配 <span class="en">Allocation (effective)</span></th></tr></thead>
          <tbody>${d.rounds.map((r) => `<tr><td>${esc(r.code)}</td><td class="num">${r.granted}</td>
            <td>${r.allocations.length ? r.allocations.map((a) => `${esc(a.name_zh)} ${a.effective}${a.effective !== a.allocated ? ` <s class="muted">${a.allocated}</s>` : ''}`).join(' · ') : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody>
        </table></div>

        ${d.wins.length ? `<h4 class="sub-h">🏆 得奖 <span class="en">Wins</span></h4><ul class="plain">${d.wins.map((w) =>
          `<li>${esc(w.round_code || '总决赛')} ${esc(w.name_zh)} <span class="en">${esc(w.name_en)}</span> · ${w.status === 'won' ? '<span class="pill pill-ok">得奖 <span class="en">Won</span></span>' : `<span class="pill pill-warn">放弃 <span class="en">Forfeited</span></span> ${esc(w.forfeit_reason || '')}`}</li>`).join('')}</ul>` : ''}

        ${(d.vouchers || []).length ? `<h4 class="sub-h">礼券 <span class="en">Vouchers</span></h4>
          <div class="table-wrap"><table class="data"><thead><tr><th>编号 <span class="en">Code</span></th><th>礼品 <span class="en">Gift</span></th><th>状态 <span class="en">Status</span></th></tr></thead>
          <tbody>${d.vouchers.map((v) => `<tr class="${v.status === 'voided' ? 'is-voided' : ''}">
            <td class="v-code">${esc(v.code)}</td>
            <td><span class="zh">${esc(v.title_zh)}</span><span class="en">${esc(v.title_en)}</span>${v.detail_zh ? `<div class="small muted"><span class="zh">${esc(v.detail_zh)}</span><span class="en">${esc(v.detail_en || v.detail_zh)}</span></div>` : ''}</td>
            <td>${v.status === 'redeemed' ? '<span class="pill pill-ok">已兑现 <span class="en">Redeemed</span></span>' : v.status === 'voided' ? '<span class="pill pill-warn">已作废 <span class="en">Voided</span></span>' : '<span class="pill">可兑现 <span class="en">Ready</span></span>'}</td>
          </tr>`).join('')}</tbody></table></div>` : ''}

        <h4 class="sub-h">发票 <span class="en">Invoices</span></h4>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>发票 <span class="en">Invoice</span></th><th>日期 <span class="en">Date</span></th><th>轮</th><th>来源</th><th>配套 <span class="en">Package</span></th><th class="num">张</th><th>销售 <span class="en">Sales</span></th><th></th></tr></thead>
          <tbody>${d.invoices.map((i) => `<tr class="${i.voided_at ? 'is-voided' : ''}">
            <td>${esc(i.invoice_no)}</td><td>${esc(i.invoice_date)}</td><td>${esc(i.round_code)}</td>
            <td>${esc(App.SOURCE_LABEL[i.source].zh)}</td>
            <td class="small">${esc(i.package || '—')}${i.package ? ` × ${i.quantity}` : ''}${i.paid_boxes ? `<div class="muted">${i.paid_boxes} 付费盒 paid boxes</div>` : ''}</td>
            <td class="num">${i.tickets}</td><td class="small">${esc(i.sales || '—')}</td>
            <td>${i.voided_at ? voided(i) : `<button type="button" class="btn btn-ghost btn-xs danger" data-void-invoice="${i.id}" data-label="${esc(i.invoice_no)}">作废发票 <span class="en">Void</span></button>`}</td>
          </tr>`).join('') || '<tr><td colspan="8" class="muted">—</td></tr>'}</tbody>
        </table></div>

        <h4 class="sub-h">抽奖券记录 <span class="en">Ticket grants</span></h4>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>#</th><th>轮</th><th>来源 <span class="en">Source</span></th><th class="num">张</th><th>发票 / 备注</th><th></th></tr></thead>
          <tbody>${d.grants.map((g) => `<tr class="${g.voided_at ? 'is-voided' : ''}">
            <td class="small muted">${g.id}</td><td>${esc(g.round_code)}</td>
            <td>${esc(App.SOURCE_LABEL[g.source].zh)} <span class="en">${esc(App.SOURCE_LABEL[g.source].en)}</span></td>
            <td class="num">${g.tickets}</td>
            <td class="small">${esc(g.invoice_no || '')}${g.related_name ? ' · ' + esc(g.related_name) : ''}${g.voided_at ? `<div class="muted">作废原因 Reason: ${esc(g.void_reason)}</div>` : ''}</td>
            <td>${g.voided_at ? voided(g) : (g.source === 'repeat_bonus' || g.source === 'referral')
              ? `<button type="button" class="btn btn-ghost btn-xs danger" data-void-grant="${g.id}">作废 <span class="en">Void</span></button>` : ''}</td>
          </tr>`).join('') || '<tr><td colspan="6" class="muted">—</td></tr>'}</tbody>
        </table></div>
      </div>`;
  }

  $('#c-detail').addEventListener('click', async (ev) => {
    const copy = ev.target.closest('[data-copy]');
    if (copy) {
      const ok = await App.copy(copy.dataset.copy);
      return App.say(ok ? '已复制链接' : '复制失败', ok ? 'Link copied' : 'Could not copy', ok ? 'ok' : 'error');
    }
    const vi = ev.target.closest('[data-void-invoice]');
    const vg = ev.target.closest('[data-void-grant]');
    if (!vi && !vg) return;
    const reason = await App.askReason(vi
      ? `作废发票 ${esc(vi.dataset.label)}？此发票的所有抽奖券（含奖励）都会作废。<br><span class="en">Void invoice ${esc(vi.dataset.label)}? All its tickets (incl. bonuses) will be voided.</span>`
      : `作废这笔奖励抽奖券？<br><span class="en">Void this bonus grant?</span>`);
    if (!reason) return;
    try {
      const d = vi
        ? await App.rpc('void_invoice', { p_invoice_id: Number(vi.dataset.voidInvoice), p_reason: reason })
        : await App.rpc('void_grant', { p_grant_id: Number(vg.dataset.voidGrant), p_reason: reason });
      renderDetail(d);
      App.say('已作废', 'Voided', 'ok');
      state.loaded.stats = false;
      loadCustomers();
    } catch (e) { App.toast(e.message, 'error'); }
  });

  // =============================================================== SETUP ====
  async function loadSetup() {
    const [{ data: rounds, error: e1 }, { data: cats, error: e2 }, { data: settings, error: e3 }] = await Promise.all([
      sb.from('rounds').select('*').order('id'),
      sb.from('prize_categories').select('*').order('rank'),
      sb.from('app_settings').select('*').maybeSingle(),
    ]);
    if (e1 || e2 || e3) return App.toast(App.errorText(e1 || e2 || e3), 'error');

    $('#rounds-table').innerHTML = `<thead><tr><th>轮</th><th>购买开始 <span class="en">Purchase start</span></th><th>购买结束 <span class="en">Purchase end</span></th><th>分配截止 <span class="en">Allocation deadline</span></th><th>开奖 <span class="en">Draw date</span></th><th></th></tr></thead>
      <tbody>${rounds.map((r) => `<tr data-round="${r.id}">
        <td><span class="round-chip">${esc(r.code)}</span></td>
        <td><input type="date" name="purchase_start" value="${esc(r.purchase_start)}"></td>
        <td><input type="date" name="purchase_end" value="${esc(r.purchase_end)}"></td>
        <td><input type="datetime-local" step="1" name="allocation_deadline" value="${esc(App.isoToMytLocal(r.allocation_deadline))}"></td>
        <td><input type="date" name="draw_date" value="${esc(r.draw_date)}"></td>
        <td><button type="button" class="btn btn-primary btn-xs" data-save-round="${r.id}">保存 <span class="en">Save</span></button></td>
      </tr>`).join('')}</tbody>`;

    const roundCode = Object.fromEntries(rounds.map((r) => [r.id, r.code]));
    const sorted = cats.slice().sort((a, b) => (a.round_id ?? 999) - (b.round_id ?? 999) || a.rank - b.rank);
    $('#prizes-table').innerHTML = `<thead><tr><th>轮</th><th>奖项</th><th>中文名</th><th>English name</th><th>奖品说明 <span class="en">Prize description</span></th><th class="num">名额 <span class="en">Slots</span></th><th></th></tr></thead>
      <tbody>${sorted.map((c) => `<tr data-cat="${c.id}">
        <td>${c.is_grand ? '👑' : `<span class="round-chip">${esc(roundCode[c.round_id])}</span>`}</td>
        <td>${RANK_ICON[c.rank]}</td>
        <td><input type="text" name="name_zh" value="${esc(c.name_zh)}" maxlength="40"></td>
        <td><input type="text" name="name_en" value="${esc(c.name_en)}" maxlength="40"></td>
        <td><input type="text" name="prize_desc" value="${esc(c.prize_desc || '')}" maxlength="120" placeholder="e.g. Dyson V12"></td>
        <td><input type="number" name="winner_slots" value="${c.winner_slots}" min="0" max="999" class="num-input"></td>
        <td><button type="button" class="btn btn-primary btn-xs" data-save-cat="${c.id}">保存 <span class="en">Save</span></button></td>
      </tr>`).join('')}</tbody>`;

    const s = settings || {};
    const bool = (k, zh, en, warn) => `<label class="check setting"><input type="checkbox" name="${k}" ${s[k] ? 'checked' : ''}>
      <span>${zh} <span class="en">${en}</span>${warn ? `<br><small class="muted">${warn}</small>` : ''}</span></label>`;
    const num = (k, zh, en) => `<label class="field setting-num"><span class="label">${zh} <span class="en">${en}</span></span><input type="number" name="${k}" value="${s[k]}" min="0" max="1000"></label>`;
    $('#settings-form').innerHTML = `
      <div class="grid-3">
        ${num('repeat_bonus_tickets', '回购奖励张数（每轮一次）', 'Repeat bonus (once per round)')}
        ${num('referral_bonus_tickets', '推荐奖励张数', 'Referral bonus tickets')}
      </div>
      ${bool('repeat_bonus_on_topup', '加购也算回购（可获得回购奖励）', 'A top up in a later round also earns the repeat bonus')}
      ${bool('block_future_invoice_dates', '禁止未来的发票日期', 'Block future invoice dates', '活动期间必须开启 · Keep ON during the event')}
      ${bool('enforce_draw_schedule', '只能在分配截止后抽奖', 'Draws only after the allocation deadline', '只在彩排时关闭 · Turn OFF only for a rehearsal')}
      <button type="submit" class="btn btn-primary">保存设置 <span class="en">Save settings</span></button>`;
  }

  async function saveRow(table, id, values, btn) {
    await App.busy(btn, async () => {
      const { data, error } = await sb.from(table).update(values).eq('id', id).select();
      if (error) return App.toast(App.errorText(error), 'error');
      if (!data || !data.length) return App.say('未保存（没有权限）', 'Not saved (no permission)', 'error');
      App.say('已保存', 'Saved', 'ok');
      state.loaded.stats = false;
    });
  }

  $('[data-panel="setup"]').addEventListener('click', (ev) => {
    const r = ev.target.closest('[data-save-round]');
    const c = ev.target.closest('[data-save-cat]');
    if (r) {
      const tr = r.closest('tr');
      const v = (n) => tr.querySelector(`[name="${n}"]`).value;
      saveRow('rounds', Number(r.dataset.saveRound), {
        purchase_start: v('purchase_start'), purchase_end: v('purchase_end'),
        allocation_deadline: App.mytLocalToIso(v('allocation_deadline')), draw_date: v('draw_date'),
      }, r);
    } else if (c) {
      const tr = c.closest('tr');
      const v = (n) => tr.querySelector(`[name="${n}"]`).value;
      const slots = parseInt(v('winner_slots'), 10);
      if (!Number.isInteger(slots) || slots < 0) return App.say('名额无效', 'Invalid number of slots', 'error');
      saveRow('prize_categories', Number(c.dataset.saveCat), {
        name_zh: v('name_zh').trim(), name_en: v('name_en').trim(), prize_desc: v('prize_desc').trim() || null, winner_slots: slots,
      }, c);
    }
  });

  $('#settings-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const values = { updated_at: new Date().toISOString() };
    ['repeat_bonus_on_topup', 'block_future_invoice_dates', 'enforce_draw_schedule']
      .forEach((k) => { values[k] = f.elements[k].checked; });
    ['repeat_bonus_tickets', 'referral_bonus_tickets']
      .forEach((k) => { values[k] = parseInt(f.elements[k].value, 10); });
    if (!values.block_future_invoice_dates && !window.confirm('确定关闭「禁止未来发票日期」？只应在测试时关闭。\nTurn OFF the future-date guard? Only do this for testing.')) return;
    if (!values.enforce_draw_schedule && !window.confirm('确定允许在截止前抽奖？只应在彩排时关闭。\nAllow draws before the deadline? Only for a rehearsal.')) return;
    await saveRow('app_settings', true, values, f.querySelector('[type="submit"]'));
  });

  // =============================================================== STAFF ====
  async function loadStaff() {
    const { data, error } = await sb.from('profiles').select('*').order('created_at');
    if (error) return App.toast(App.errorText(error), 'error');
    $('#staff-table').innerHTML = `<thead><tr><th>电邮 <span class="en">Email</span></th><th>姓名 <span class="en">Name</span></th><th>角色 <span class="en">Role</span></th><th>启用 <span class="en">Active</span></th><th></th></tr></thead>
      <tbody>${data.map((p) => `<tr data-id="${p.id}">
        <td>${esc(p.email)}${p.id === state.profile.id ? ' <span class="pill">您 You</span>' : ''}</td>
        <td><input type="text" name="full_name" value="${esc(p.full_name || '')}" maxlength="60"></td>
        <td><select name="role"><option value="sales" ${p.role === 'sales' ? 'selected' : ''}>销售 Sales</option><option value="admin" ${p.role === 'admin' ? 'selected' : ''}>管理员 Admin</option></select></td>
        <td><input type="checkbox" name="active" ${p.active ? 'checked' : ''} aria-label="启用 Active"></td>
        <td><button type="button" class="btn btn-primary btn-xs" data-save-staff="${p.id}">保存 <span class="en">Save</span></button></td>
      </tr>`).join('')}</tbody>`;
  }
  $('#staff-table').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-save-staff]');
    if (!b) return;
    const tr = b.closest('tr');
    const values = {
      full_name: tr.querySelector('[name="full_name"]').value.trim() || null,
      role: tr.querySelector('[name="role"]').value,
      active: tr.querySelector('[name="active"]').checked,
    };
    if (b.dataset.saveStaff === state.profile.id && (values.role !== 'admin' || !values.active)
        && !window.confirm('您将移除自己的管理员权限，确定？\nYou are removing your own admin access. Continue?')) return;
    saveRow('profiles', b.dataset.saveStaff, values, b);
  });

  // ============================================================== EXPORT ====
  // jsonb does not keep key order, so columns are listed explicitly
  const WINNER_COLS = ['winner_id', 'round', 'prize', 'prize_desc', 'status', 'customer_name', 'phone', 'email',
    'tickets_in_draw', 'pool_size', 'pool_tickets', 'random_value', 'drawn_at_myt', 'drawn_by', 'forfeit_reason', 'forfeited_at_myt'];
  const GRANT_COLS = ['grant_id', 'created_at_myt', 'round', 'source', 'tickets', 'calculation', 'customer_name', 'phone',
    'invoice_no', 'invoice_date', 'package', 'quantity', 'paid_boxes', 'related_customer', 'salesperson', 'voided', 'void_reason'];
  $('[data-panel="export"]').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-export]');
    if (!b) return;
    const stamp = App.todayMYT();
    await App.busy(b, async () => {
      try {
        if (b.dataset.export === 'winners') {
          const rows = await App.rpc('admin_export_winners');
          if (!rows.length) return App.say('还没有得奖者', 'No winners yet');
          App.download(`zellv-winners-${stamp}.csv`, App.toCSV(rows, WINNER_COLS));
        } else if (b.dataset.export === 'grants') {
          const rows = await App.rpc('admin_export_grants');
          App.download(`zellv-ticket-grants-${stamp}.csv`, App.toCSV(rows, GRANT_COLS));
        } else {
          const cs = await App.rpc('my_customers');
          const rows = cs.map((c) => {
            const o = { name: c.name, phone: c.phone, email: c.email || '', total_tickets: c.total_tickets };
            c.rounds.forEach((r) => { o[`${r.code}_tickets`] = r.granted; o[`${r.code}_allocated`] = r.allocated; });
            o.pdpa_consent = c.pdpa_consent_at ? 'yes' : 'no';
            o.opened_link = c.first_opened_at ? 'yes' : 'no';
            o.wallet_link = App.walletUrl(c.wallet_token);
            return o;
          });
          App.download(`zellv-customers-${stamp}.csv`, App.toCSV(rows));
        }
        App.say('已下载', 'Downloaded', 'ok');
      } catch (e) { App.toast(e.message, 'error'); }
    });
  });
})();
