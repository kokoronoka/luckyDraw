/* Salesperson page (sales.html): issue tickets + my customers */
(function () {
  'use strict';
  const { $, $$, esc } = App;

  const state = {
    profile: null,
    rounds: [],
    settings: null,
    lookup: null,          // last lookup_customer() result for the phone field
    autofilled: false,     // name/email were filled from lookup
    pendingArgs: null,     // args used for the shown preview
    customers: null,       // my_customers() cache
    customersStale: true,
    packages: [],          // qualifying package catalogue
  };

  const CATEGORY_LABEL = {
    oral: '口服保健品 Oral supplements',
    pp: 'PP2 / PP3',
    trio: '三重配套 Trio',
    voucher: '产品礼券 Product vouchers',
    cellular: '细胞疗程 Cellular Therapy',
  };

  let sb;
  try {
    sb = App.client({ staff: true });
  } catch (e) {
    document.body.innerHTML = `<p class="container form-error">${esc(e.message)}</p>`;
    return;
  }

  // ---------------------------------------------------------------- boot ----
  (async function boot() {
    const { data } = await sb.auth.getSession();
    if (!data.session) return window.location.replace('index.html');

    const uid = data.session.user.id;
    const [{ data: prof }, { data: rounds, error: rErr }, { data: settings }, { data: packages, error: pErr }] = await Promise.all([
      sb.from('profiles').select('id, email, full_name, role, active').eq('id', uid).maybeSingle(),
      sb.from('rounds').select('*').order('id'),
      sb.from('app_settings').select('*').maybeSingle(),
      sb.from('packages').select('*').order('sort'),
    ]);
    if (pErr) App.toast(App.errorText(pErr), 'error');
    state.packages = (packages || []).filter((p) => p.active);
    if (!prof || !prof.active) {
      await sb.auth.signOut();
      return window.location.replace('index.html');
    }
    if (rErr) App.toast(App.errorText(rErr), 'error');
    state.profile = prof;
    state.rounds = rounds || [];
    state.settings = settings || {};

    $('#who').innerHTML = `${esc(prof.full_name || prof.email)} <span class="role-chip role-${prof.role}">${prof.role === 'admin' ? '管理员 Admin' : '销售 Sales'}</span>`;
    if (prof.role === 'admin') {
      $('#topnav').innerHTML = App.adminNav('sales');
      $('#topnav').hidden = false;
      $('#customers-tab-label').textContent = '所有顾客';
      $('#customers-tab-label-en').textContent = 'All customers';
    }

    const today = App.todayMYT();
    $('#f-date').value = today;
    if (state.settings.block_future_invoice_dates !== false) $('#f-date').max = today;
    updateRoundHint();
    renderPackages();
    updateReferrerVisibility();
  })();

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') window.location.replace('index.html');
  });
  $('#logout-btn').addEventListener('click', () => sb.auth.signOut());

  // ---------------------------------------------------------------- tabs ----
  function showTab(name) {
    ['issue', 'customers'].forEach((t) => {
      const on = t === name;
      $(`#tab-${t}`).hidden = !on;
      const b = $(`#tab-btn-${t}`);
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    if (name === 'customers' && state.customersStale) loadCustomers();
  }
  $('#tab-btn-issue').addEventListener('click', () => showTab('issue'));
  $('#tab-btn-customers').addEventListener('click', () => showTab('customers'));

  // ======================================================== ISSUE TICKETS ====
  const f = {
    phone: $('#f-phone'), name: $('#f-name'), email: $('#f-email'), invoice: $('#f-invoice'),
    date: $('#f-date'), qty: $('#f-qty'), pkg: $('#f-package'), referrer: $('#f-referrer'),
  };
  const source = () => ($('input[name="f-source"]:checked') || {}).value || 'purchase';
  const selectedPkg = () => state.packages.find((p) => p.code === f.pkg.value) || null;

  // ---- package picker ----
  // Purchase: every package. Top Up: extra paid oral boxes, or a voucher /
  // Cellular Therapy upgrade (only the difference in tickets is issued).
  function renderPackages() {
    const src = source();
    const prev = f.pkg.value;
    const list = src === 'purchase'
      ? state.packages
      : state.packages.filter((p) => p.kind === 'level' || p.code === 'ORAL_1');
    const groups = {};
    list.forEach((p) => { (groups[p.category] = groups[p.category] || []).push(p); });
    f.pkg.innerHTML = '<option value="">— 请选择 Choose —</option>' + Object.keys(groups).map((cat) =>
      `<optgroup label="${esc(CATEGORY_LABEL[cat] || cat)}">${groups[cat].map((p) => {
        const label = src === 'topup'
          ? (p.kind === 'level' ? `升级至 Upgrade to ${p.name_zh} · ${p.name_en} (${p.tickets} 张)` : '加购付费盒 Extra paid boxes')
          : `${p.name_zh} · ${p.name_en} — ${p.tickets} 张`;
        return `<option value="${esc(p.code)}">${esc(label)}</option>`;
      }).join('')}</optgroup>`).join('');
    if (list.some((p) => p.code === prev)) f.pkg.value = prev;
    updateQtyField();
  }

  function updateQtyField() {
    const p = selectedPkg();
    const src = source();
    const isUpgrade = src === 'topup' && p && p.kind === 'level';
    $('#qty-field').hidden = isUpgrade;
    if (isUpgrade) f.qty.value = 1;
    $('#qty-label').innerHTML = src === 'topup' && p && p.kind === 'boxes'
      ? '加购付费盒数 <span class="en">Extra PAID boxes (free boxes don\'t count)</span> <i class="req">*</i>'
      : '数量 <span class="en">Quantity</span> <i class="req">*</i>';
    updateEstimate();
  }

  /** Client-side estimate of the ticket rule (the server preview is authoritative). */
  function updateEstimate() {
    const el = $('#ticket-estimate');
    const p = selectedPkg();
    const qty = parseInt(f.qty.value, 10) || 0;
    if (!p || qty < 1) { el.innerHTML = ''; return; }
    const lk = state.lookup && state.lookup.exists ? state.lookup : null;
    let html;
    let incoming = 0;
    if (source() === 'purchase') {
      incoming = p.tickets * qty;
      html = `${esc(p.name_zh)} ${p.tickets} 张 × ${qty} = <b>${incoming}</b> 张 <span class="en">tickets</span>`;
    } else if (p.kind === 'boxes') {
      const before = lk && lk.paid_boxes ? (lk.paid_boxes[p.category] || 0) : 0;
      if (!before) {
        html = '<span class="hint-warn">此顾客没有之前的付费盒数，请选择「购买」<span class="en">No earlier paid boxes — use Purchase</span></span>';
      } else {
        const after = before + qty;
        const mult = after >= 18 ? 3 : after >= 12 ? 2 : 1;
        incoming = qty * mult;
        html = `已付费 ${before} 盒 → ${after} 盒 <span class="en">paid boxes</span>：${qty} × ${mult} = <b>${incoming}</b> 张 <span class="en">tickets</span>
          <div class="small muted">满12盒 ×2，满18盒或以上 ×3 · <span class="en">×2 from 12 boxes, ×3 from 18+</span></div>`;
      }
    } else {
      const prevLevel = lk && lk.levels ? lk.levels[p.category] : undefined;
      if (prevLevel === undefined) {
        html = '<span class="hint-warn">此顾客没有可升级的配套，请选择「购买」<span class="en">Nothing to upgrade — use Purchase</span></span>';
      } else if (p.tickets <= prevLevel) {
        html = `<span class="hint-warn">必须升级到更高配套（目前 ${prevLevel} 张）<span class="en">Must be a higher package (current ${prevLevel})</span></span>`;
      } else {
        incoming = p.tickets - prevLevel;
        html = `升级差额 <span class="en">Upgrade difference</span>：${p.tickets} − ${prevLevel} = <b>${incoming}</b> 张 <span class="en">tickets</span>`;
      }
    }
    const life = lk && lk.lifetime_tickets ? lk.lifetime_tickets : 0;
    const already = lk && lk.has_golden_envelope;
    if (incoming > 0 && !already && life + incoming >= 4) {
      html += '<div class="ge-award-note">黄金信封 <span class="en">Golden Envelope</span> × <b>1</b></div>';
    }
    el.innerHTML = html + '<div class="small muted">以预览为准 · <span class="en">Confirmed in the preview</span></div>';
  }
  f.pkg.addEventListener('change', () => { invalidatePreview(); updateQtyField(); });

  const setHint = (el, html, kind) => {
    el.innerHTML = html || '';
    el.className = 'hint' + (kind ? ' hint-' + kind : '');
  };
  const showFormError = (m) => { $('#issue-error').textContent = m || ''; $('#issue-error').hidden = !m; };

  // ---- phone lookup (debounced) ----
  let lookupTimer, lookupSeq = 0;
  f.phone.addEventListener('input', () => {
    clearTimeout(lookupTimer);
    invalidatePreview();
    lookupTimer = setTimeout(runLookup, 350);
  });
  f.phone.addEventListener('blur', () => { clearTimeout(lookupTimer); runLookup(); });

  async function runLookup() {
    const phone = App.normalizePhone(f.phone.value);
    if (state.lookup && state.lookup.phone === phone) return;
    if (!App.isValidPhone(phone)) {
      clearAutofill();
      state.lookup = null;
      setHint($('#phone-hint'), f.phone.value.trim() ? '号码格式不正确 <span class="en">Invalid phone format</span>' : '', f.phone.value.trim() ? 'warn' : '');
      updateReferrerVisibility();
      return;
    }
    const seq = ++lookupSeq;
    setHint($('#phone-hint'), '查询中… <span class="en">Looking up…</span>');
    try {
      const res = await App.rpc('lookup_customer', { p_phone: phone });
      if (seq !== lookupSeq) return;
      state.lookup = res;
      if (res.exists) {
        f.name.value = res.name || '';
        f.email.value = res.email || '';
        state.autofilled = true;
        const rounds = (res.purchase_rounds || []).map((r) => 'R' + r).join(', ');
        setHint($('#phone-hint'),
          `✓ 现有顾客 <span class="en">Existing customer</span> · ${esc(App.formatPhone(res.phone))}` +
          (rounds ? ` · 已购买 <span class="en">purchased in</span> ${esc(rounds)}` : ''), 'ok');
      } else {
        clearAutofill();
        setHint($('#phone-hint'), `新顾客 <span class="en">New customer</span> · ${esc(App.formatPhone(res.phone))}`, 'info');
      }
    } catch (e) {
      if (seq === lookupSeq) setHint($('#phone-hint'), esc(e.message), 'warn');
    }
    updateReferrerVisibility();
    updateEstimate();
  }

  function clearAutofill() {
    if (state.autofilled) {
      f.name.value = '';
      f.email.value = '';
      state.autofilled = false;
    }
  }

  // Referral only for a NEW customer on a PURCHASE invoice
  function updateReferrerVisibility() {
    const isExisting = state.lookup && state.lookup.exists && state.lookup.has_tickets;
    const show = source() === 'purchase' && !isExisting;
    $('#referrer-field').hidden = !show;
    if (!show) { f.referrer.value = ''; setHint($('#referrer-hint'), ''); }
  }
  $$('input[name="f-source"]').forEach((r) => r.addEventListener('change', () => {
    invalidatePreview(); renderPackages(); updateReferrerVisibility();
  }));

  // ---- referrer lookup ----
  f.referrer.addEventListener('blur', async () => {
    const raw = f.referrer.value.trim();
    if (!raw) return setHint($('#referrer-hint'), '');
    const p = App.normalizePhone(raw);
    if (!App.isValidPhone(p)) return setHint($('#referrer-hint'), '号码格式不正确 <span class="en">Invalid phone format</span>', 'warn');
    if (p === App.normalizePhone(f.phone.value)) return setHint($('#referrer-hint'), '不能推荐自己 <span class="en">Self-referral is not allowed</span>', 'warn');
    try {
      const res = await App.rpc('lookup_customer', { p_phone: p });
      if (res.exists && res.has_tickets) setHint($('#referrer-hint'), `✓ 推荐人 <span class="en">Referrer</span>: ${esc(res.name)}`, 'ok');
      else setHint($('#referrer-hint'), '找不到此现有顾客 <span class="en">No existing customer with this phone</span>', 'warn');
    } catch (e) { setHint($('#referrer-hint'), esc(e.message), 'warn'); }
  });

  // ---- round hint from invoice date ----
  function updateRoundHint() {
    const d = f.date.value;
    const el = $('#round-hint');
    if (!d) return setHint(el, '');
    const r = App.roundForDate(state.rounds, d);
    if (!r) return setHint(el, '不在任何一轮的购买期内 <span class="en">Not within any round</span>', 'warn');
    const dl = App.fmtDeadline(r.allocation_deadline);
    if (new Date() > new Date(r.allocation_deadline)) {
      return setHint(el, `${esc(r.code)} 已截止 <span class="en">closed</span> (${esc(dl.en)})`, 'warn');
    }
    setHint(el, `→ <b>${esc(r.code)}</b> ${esc(r.name_zh)} · 截止 <span class="en">deadline</span> ${esc(dl.en)}`, 'ok');
  }
  f.date.addEventListener('change', () => { invalidatePreview(); updateRoundHint(); });

  // ---- quantity stepper ----
  $$('#issue-form .step').forEach((b) => b.addEventListener('click', () => {
    const v = Math.min(100, Math.max(1, (parseInt(f.qty.value, 10) || 0) + Number(b.dataset.step)));
    f.qty.value = v;
    invalidatePreview();
    updateEstimate();
  }));
  [f.name, f.email, f.invoice, f.qty, f.referrer].forEach((el) => el.addEventListener('input', () => {
    if (el === f.name || el === f.email) state.autofilled = false;
    invalidatePreview();
    if (el === f.qty) updateEstimate();
  }));

  // ---- preview ----
  function collectArgs() {
    const phone = App.normalizePhone(f.phone.value);
    const pkg = selectedPkg();
    const qty = $('#qty-field').hidden ? 1 : Number(f.qty.value);
    if (!App.isValidPhone(phone)) throw new Error('请输入有效电话号码 / Enter a valid phone number');
    if (!f.name.value.trim()) throw new Error('请输入姓名 / Enter the customer name');
    if (!f.invoice.value.trim()) throw new Error('请输入发票号码 / Enter the invoice number');
    if (!f.date.value) throw new Error('请选择发票日期 / Choose the invoice date');
    if (!pkg) throw new Error('请选择配套 / Choose a package');
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) throw new Error('数量必须是 1–100 / Quantity must be 1–100');
    return {
      p_phone: phone,
      p_name: f.name.value.trim(),
      p_email: f.email.value.trim() || null,
      p_invoice_no: f.invoice.value.trim(),
      p_invoice_date: f.date.value,
      p_source: source(),
      p_package: pkg.code,
      p_qty: qty,
      p_referrer_phone: $('#referrer-field').hidden ? null : (f.referrer.value.trim() || null),
    };
  }

  function invalidatePreview() {
    if (!$('#preview').hidden) {
      $('#preview').hidden = true;
      state.pendingArgs = null;
    }
  }

  $('#issue-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    showFormError('');
    let args;
    try { args = collectArgs(); } catch (e) { return showFormError(e.message); }

    await App.busy($('#preview-btn'), async () => {
      try {
        const res = await App.rpc('issue_tickets', { ...args, p_dry_run: true });
        state.pendingArgs = args;
        renderPreview(res, args);
        $('#preview').hidden = false;
        $('#confirm-error').hidden = true;
        $('#preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        showFormError(e.message);
      }
    }, '检查中… <span class="en">Checking…</span>');
  });

  function envelopeRows(res) {
    const rows = [];
    if (res.golden_envelope) {
      rows.push({ who: res.customer.name, extra: '终身仅一次 <span class="en">Once per customer</span>' });
    }
    if (res.referrer_golden_envelope && res.referrer) {
      rows.push({ who: res.referrer.name, extra: '推荐人 · 终身仅一次 <span class="en">Referrer · once per customer</span>' });
    }
    return rows.map((row) => `<tr class="is-envelope">
      <td>黄金信封 <span class="en">Golden Envelope</span><div class="small muted">${row.extra}</div></td>
      <td>${esc(row.who)}</td>
      <td class="num"><b>1</b></td>
      <td></td>
    </tr>`).join('');
  }

  function grantRows(grants) {
    return grants.map((g) => {
      const src = App.SOURCE_LABEL[g.source] || { zh: g.source, en: '' };
      const who = g.recipient === 'referrer'
        ? `推荐人 <span class="en">Referrer</span> · ${esc(g.customer_name)}`
        : esc(g.customer_name);
      const extra = g.retroactive ? `<div class="small muted">补发：发票 ${esc(g.invoice_no)} <span class="en">(retroactive, invoice ${esc(g.invoice_no)})</span></div>` : '';
      const bonus = g.source === 'repeat_bonus' || g.source === 'referral';
      return `<tr class="${bonus ? 'is-bonus' : ''}">
        <td>${esc(src.zh)} <span class="en">${esc(src.en)}</span>${extra}</td>
        <td>${who}</td>
        <td class="num"><b>+${g.tickets}</b></td>
        <td><span class="round-chip">${esc(g.round_code)}</span></td>
      </tr>`;
    }).join('');
  }

  function renderPreview(res, args) {
    const r = res.round;
    const dl = App.fmtDeadline(r.allocation_deadline);
    const draw = App.fmtDate(r.draw_date);
    const src = App.SOURCE_LABEL[args.p_source];
    const invDate = App.fmtDate(args.p_invoice_date);
    const hasBonus = res.grants.some((g) => g.source !== 'purchase' && g.source !== 'topup');
    $('#preview-body').innerHTML = `
      <dl class="kv">
        <dt>顾客 <span class="en">Customer</span></dt>
        <dd>${esc(res.customer.name)} · ${esc(App.formatPhone(res.customer.phone))}
          ${res.customer.is_new ? '<span class="pill pill-new">新顾客 New</span>' : '<span class="pill">现有 Existing</span>'}</dd>
        <dt>发票 <span class="en">Invoice</span></dt>
        <dd>${esc(args.p_invoice_no)} · ${esc(invDate.enY)} · ${esc(src.zh)} <span class="en">${esc(src.en)}</span></dd>
        <dt>配套 <span class="en">Package</span></dt>
        <dd>${args.p_source === 'topup' && res.package.paid_boxes
              ? `加购付费盒 <span class="en">Extra paid boxes</span> × ${res.package.quantity}`
              : `${esc(res.package.name_zh)} <span class="en">${esc(res.package.name_en)}</span> × ${res.package.quantity}`}
          <div class="small muted">${esc(res.calc)}</div>
          ${res.invoice_tickets === 0 ? '<div class="small hint-warn">此配套没有抽奖券（已记录，可用于日后升级）<span class="en">This package earns no tickets (recorded for a future upgrade)</span></div>' : ''}</dd>
        <dt>轮次 <span class="en">Round</span></dt>
        <dd><span class="round-chip">${esc(r.code)}</span> ${esc(r.name_zh)} · 分配截止 <span class="en">deadline</span> ${esc(dl.en)} · 开奖 <span class="en">draw</span> ${esc(draw.en)}</dd>
      </dl>
      <table class="grant-table">
        <thead><tr><th>来源 <span class="en">Source</span></th><th>给 <span class="en">To</span></th><th class="num">张 <span class="en">Tickets</span></th><th>轮 <span class="en">Round</span></th></tr></thead>
        <tbody>${grantRows(res.grants)}${envelopeRows(res)}</tbody>
      </table>
      ${hasBonus ? '' : '<p class="small muted">没有额外奖励 <span class="en">No bonus tickets for this invoice</span></p>'}
      <p class="total-line">顾客共获得 <span class="en">Customer receives</span> <b class="big">${res.customer_new_tickets}</b> 张 <span class="en">tickets</span></p>
      ${res.golden_envelope ? '<p class="total-line ge-award">黄金信封 <span class="en">Golden Envelope</span> <b class="big">1</b></p>' : ''}`;
  }

  $('#edit-btn').addEventListener('click', () => {
    $('#preview').hidden = true;
    state.pendingArgs = null;
    f.phone.focus();
  });

  // ---- confirm ----
  $('#confirm-btn').addEventListener('click', async () => {
    if (!state.pendingArgs) return;
    const errEl = $('#confirm-error');
    errEl.hidden = true;
    await App.busy($('#confirm-btn'), async () => {
      try {
        const res = await App.rpc('issue_tickets', { ...state.pendingArgs, p_dry_run: false });
        showResult(res);
        state.customersStale = true;
      } catch (e) {
        errEl.textContent = e.message;
        errEl.hidden = false;
      }
    }, '发放中… <span class="en">Issuing…</span>');
  });

  function issueMessage(name, n, round, link) {
    const dl = App.fmtDeadline(round.allocation_deadline);
    return `您好 ${name}！🎉
感谢您参与 ZÉLL-V《健康一起 WIN》幸运抽奖。
您已获得 ${n} 张抽奖券（${round.code} ${round.name_zh}）。
请在 ${dl.zh} 前打开以下链接，分配您的抽奖券：
${link}

Hi ${name}! Thank you for joining the ZÉLL-V "健康一起 WIN" Lucky Draw.
You've received ${n} ticket(s) for ${round.name_en}. Please open the link above and allocate your tickets before ${dl.en} (MYT).`;
  }

  function referrerMessage(name, n, round, link) {
    const dl = App.fmtDeadline(round.allocation_deadline);
    return `您好 ${name}！🎁
感谢您推荐朋友参与 ZÉLL-V《健康一起 WIN》幸运抽奖。
您获得 ${n} 张推荐奖励抽奖券（${round.code} ${round.name_zh}）。
请在 ${dl.zh} 前打开以下链接分配：
${link}

Hi ${name}! Thanks for referring a friend to the ZÉLL-V Lucky Draw.
You've received ${n} referral bonus ticket(s) for ${round.name_en}. Open the link above to allocate them before ${dl.en} (MYT).`;
  }

  function showResult(res) {
    const c = res.customer;
    const link = App.walletUrl(c.wallet_token);
    $('#result-summary').innerHTML =
      `${esc(c.name)} · ${esc(App.formatPhone(c.phone))} · <b>+${res.customer_new_tickets}</b> 张 <span class="en">tickets</span> (${esc(res.round.code)})`
      + (res.golden_envelope ? '<div class="ge-award-note">黄金信封 × <b>1</b> <span class="en">Golden Envelope</span></div>' : '');
    $('#result-link').value = link;
    $('#wa-btn').href = App.whatsappUrl(c.phone, issueMessage(c.name, res.customer_new_tickets, res.round, link));

    const refGrant = res.referrer && res.grants.find((g) => g.recipient === 'referrer');
    const refBtn = $('#wa-ref-btn');
    if (refGrant) {
      const refLink = App.walletUrl(res.referrer.wallet_token);
      refBtn.href = App.whatsappUrl(res.referrer.phone, referrerMessage(res.referrer.name, refGrant.tickets, res.round, refLink));
      refBtn.innerHTML = `WhatsApp 通知推荐人 ${esc(res.referrer.name)} <span class="en">Notify referrer</span>`;
      refBtn.hidden = false;
    } else {
      refBtn.hidden = true;
    }

    $('#issue-form').hidden = true;
    $('#preview').hidden = true;
    $('#result').hidden = false;
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('#copy-btn').addEventListener('click', async () => {
    const ok = await App.copy($('#result-link').value);
    App.say(ok ? '已复制链接' : '复制失败', ok ? 'Link copied' : 'Could not copy', ok ? 'ok' : 'error');
  });

  $('#another-btn').addEventListener('click', () => {
    $('#issue-form').reset();
    $('#f-date').value = App.todayMYT();
    f.qty.value = 1;
    state.lookup = null;
    state.autofilled = false;
    state.pendingArgs = null;
    ['#phone-hint', '#referrer-hint'].forEach((s) => setHint($(s), ''));
    updateRoundHint();
    renderPackages();
    updateReferrerVisibility();
    showFormError('');
    $('#result').hidden = true;
    $('#issue-form').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    f.phone.focus();
  });

  // ========================================================= MY CUSTOMERS ====
  async function loadCustomers() {
    const list = $('#cust-list');
    list.innerHTML = '<p class="muted center">加载中… <span class="en">Loading…</span></p>';
    try {
      state.customers = await App.rpc('my_customers');
      state.customersStale = false;
      renderCustomers();
    } catch (e) {
      list.innerHTML = `<p class="form-error">${esc(e.message)}</p>`;
    }
  }
  $('#cust-refresh').addEventListener('click', loadCustomers);
  $('#cust-search').addEventListener('input', renderCustomers);
  $('#cust-filter-unalloc').addEventListener('change', renderCustomers);

  const openUnalloc = (c) => c.rounds.filter((r) => r.is_open).reduce((s, r) => s + r.unallocated, 0);

  function pendingVouchers(c) {
    const list = (c.vouchers || []).filter((v) => v.status === 'issued');
    if (!list.length) return '';
    return `<div class="cust-vouchers">
      <div class="small">待兑现礼券 <span class="en">Pending vouchers</span></div>
      <ul>${list.map((v) => `<li><span><b>${esc(v.code)}</b> <span class="zh">${esc(v.title_zh)}</span><span class="en">${esc(v.title_en)}</span></span><span class="pill">待兑现 <span class="en">Pending</span></span></li>`).join('')}</ul>
    </div>`;
  }

  function reminderMessage(c, link) {
    const u = openUnalloc(c);
    if (u > 0) {
      return `您好 ${c.name}！提醒您：您在 ZÉLL-V《健康一起 WIN》幸运抽奖中还有 ${u} 张抽奖券尚未分配。请在截止前打开以下链接分配：
${link}

Hi ${c.name}! Reminder: you have ${u} unallocated ticket(s) in the ZÉLL-V Lucky Draw. Please open the link above to allocate them before the deadline.`;
    }
    return `您好 ${c.name}！这是您的 ZÉLL-V《健康一起 WIN》幸运抽奖券钱包链接：
${link}

Hi ${c.name}! Here is your ZÉLL-V Lucky Draw ticket wallet link (above).`;
  }

  function renderCustomers() {
    const all = state.customers || [];
    const q = $('#cust-search').value.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    const onlyUnalloc = $('#cust-filter-unalloc').checked;

    // stats (over all, not filtered)
    const totalTickets = all.reduce((s, c) => s + c.total_tickets, 0);
    const notOpened = all.filter((c) => !c.first_opened_at).length;
    const withUnalloc = all.filter((c) => openUnalloc(c) > 0).length;
    $('#cust-stats').innerHTML = `
      <div class="stat"><b>${all.length}</b><span>顾客 <span class="en">Customers</span></span></div>
      <div class="stat"><b>${totalTickets}</b><span>抽奖券 <span class="en">Tickets</span></span></div>
      <div class="stat ${notOpened ? 'stat-warn' : ''}"><b>${notOpened}</b><span>未打开链接 <span class="en">Not opened</span></span></div>
      <div class="stat ${withUnalloc ? 'stat-warn' : ''}"><b>${withUnalloc}</b><span>有未分配 <span class="en">Unallocated</span></span></div>`;

    const rows = all.filter((c) => {
      if (onlyUnalloc && openUnalloc(c) === 0) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (qDigits && (c.phone.includes(qDigits) || ('0' + c.phone.slice(2)).includes(qDigits)));
    });

    if (!rows.length) {
      $('#cust-list').innerHTML = `<p class="muted center empty">${all.length ? '没有符合的顾客 <span class="en">No matching customers</span>' : '还没有顾客 <span class="en">No customers yet</span>'}</p>`;
      return;
    }

    $('#cust-list').innerHTML = rows.map((c) => {
      const link = App.walletUrl(c.wallet_token);
      const opened = c.first_opened_at
        ? `<span class="pill pill-ok">已打开 <span class="en">Opened</span> ${esc(App.fmtDateTime(c.last_opened_at))}</span>`
        : '<span class="pill pill-warn">未打开 <span class="en">Not opened</span></span>';
      const rounds = c.rounds.map((r) => {
        const cls = r.granted === 0 ? 'empty' : r.unallocated > 0 ? (r.is_open ? 'pending' : 'missed') : 'done';
        return `<div class="rcell ${cls}" title="${esc(r.code)}">
          <div class="rcode">${esc(r.code)}</div>
          <div class="rnum">${r.granted}</div>
          <div class="rsub">${r.granted ? `${r.allocated}✓ ${r.unallocated ? `· ${r.unallocated}?` : ''}` : '–'}</div>
        </div>`;
      }).join('');
      return `<article class="cust-card">
        <div class="cust-head">
          <div>
            <div class="cust-name">${esc(c.name)}</div>
            <div class="small muted">${esc(App.formatPhone(c.phone))}${c.email ? ' · ' + esc(c.email) : ''}</div>
          </div>
          <div class="cust-total"><b>${c.total_tickets}</b><span>张 <span class="en">total</span></span></div>
        </div>
        <div class="rgrid">${rounds}</div>
        ${pendingVouchers(c)}
        <div class="cust-foot">
          ${opened}
          <div class="btn-row-sm">
            <button type="button" class="btn btn-ghost btn-sm" data-copy="${esc(link)}">复制链接 <span class="en">Copy link</span></button>
            <a class="btn btn-whatsapp btn-sm" target="_blank" rel="noopener" href="${esc(App.whatsappUrl(c.phone, reminderMessage(c, link)))}">WhatsApp</a>
          </div>
        </div>
      </article>`;
    }).join('') + `<p class="legend small muted">格子：总张数 · 已分配✓ · 未分配? <span class="en">Cells: tickets · allocated✓ · unallocated?</span></p>`;
  }

  $('#cust-list').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-copy]');
    if (!b) return;
    const ok = await App.copy(b.dataset.copy);
    App.say(ok ? '已复制链接' : '复制失败', ok ? 'Link copied' : 'Could not copy', ok ? 'ok' : 'error');
  });
})();
