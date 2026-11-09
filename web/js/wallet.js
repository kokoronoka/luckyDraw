/* Customer wallet (wallet.html?t=TOKEN) — public, token-based, no login. */
(function () {
  'use strict';
  const { $, esc } = App;
  const content = $('#content');
  const params = new URLSearchParams(window.location.search);
  const token = params.get('t') || '';
  const localPreview = params.get('preview') === 'golden'
    && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

  const state = {
    wallet: null,
    offsetMs: 0,      // server clock - client clock
    alloc: {},        // { [roundId]: { [catId]: n } }
    openRounds: [],   // round ids open at last render (to detect deadline passing)
    view: 'tickets',  // tickets | vouchers
    focusRound: null,
    trackFinale: false,
    remind: false,
    nextDrawAt: 0,
    finaleAt: 0,
    gePhase: 'sealed',
    geVoucher: null,
    celebrate: null,  // envelope id just claimed
    suspendGolden: false,
    picking: false,
    homeTimer: null,
  };

  try { state.remind = localStorage.getItem('zv-remind:' + token) === '1'; } catch (_) { /* private mode */ }
  const rankMark = (rank) => `<span class="rank-mark" aria-hidden="true">${String(rank).padStart(2, '0')}</span>`;
  const BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';
  const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WEEK_ZH = ['日', '一', '二', '三', '四', '五', '六'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const drawAt = (dateStr) => (dateStr ? new Date(String(dateStr).slice(0, 10) + 'T20:00:00+08:00').getTime() : 0);
  const serverNow = () => Date.now() + state.offsetMs;
  const isOpen = (r) => serverNow() <= new Date(r.allocation_deadline).getTime();

  function showError(msg) {
    content.innerHTML = `<section class="card w-error">
      <div class="big-icon" aria-hidden="true">⚠</div>
      <p>${esc(App.localize(msg))}</p>
      <p class="small">请向您的销售顾问索取正确的链接。<br><span class="en">Please ask your sales consultant for the correct link.</span></p>
    </section>`;
  }

  try {
    if (!localPreview) App.client({ staff: false });
  } catch (e) {
    showError(e.message);
    return;
  }
  if (!token && !localPreview) {
    showError('链接无效 / Invalid link');
    return;
  }

  function setWallet(w) {
    state.offsetMs = new Date(w.server_now).getTime() - Date.now();
    // keep in-progress stepper values only where the balance is unchanged
    const prev = state.wallet && !state.wallet.consent_required ? state.wallet.rounds : [];
    Object.keys(state.alloc).forEach((id) => {
      const before = prev.find((r) => r.id === Number(id));
      const after = (w.rounds || []).find((r) => r.id === Number(id));
      if (!before || !after || before.unallocated !== after.unallocated) delete state.alloc[id];
    });
    state.wallet = w;
    if (w.consent_required) {
      closeGolden();
      renderConsent();
      return;
    }
    renderWallet();
    if (state.suspendGolden) return;
    if (state.celebrate) {
      const id = state.celebrate;
      state.celebrate = null;
      const v = (w.vouchers || []).find((x) => Number(x.golden_envelope_id) === Number(id)) || null;
      openGolden('won', v);
      return;
    }
    if (unskipped().length) openGolden('sealed');
    else closeGolden();
  }

  async function load() {
    try {
      setWallet(await App.rpc('get_wallet', { p_token: token }));
    } catch (e) {
      showError(e.message);
    }
  }

  // ------------------------------------------------------------- consent ----
  function renderConsent() {
    content.innerHTML = `<section class="card consent">
      <h2>个人资料保护声明 <span class="en">Personal Data Notice (PDPA)</span></h2>
      <div class="consent-text">
        <p>为了进行本次「健康一起 WIN」幸运抽奖，ZÉLL-V 会收集及使用您的姓名、电话号码及电邮（如有提供），用于：发放及记录抽奖券、进行抽奖、联络中奖者，以及公布得奖名单（姓名和电话号码会部分隐藏）。</p>
        <p>您的个人资料只用于本活动，并依照马来西亚《2010年个人资料保护法令》处理。如需查阅或更正资料，请联系您的销售顾问。</p>
        <p class="en-block">To run the "健康一起 WIN" Lucky Draw, ZÉLL-V collects and uses your name, phone number and email (if provided) to issue and record your tickets, conduct the draws, contact winners and announce results (names and phone numbers are partially masked).</p>
        <p class="en-block">Your data is used only for this event and handled under Malaysia's Personal Data Protection Act 2010. To access or correct your data, please contact your sales consultant.</p>
      </div>
      <label class="consent-check">
        <input type="checkbox" id="consent-cb">
        <span>我已阅读并同意以上声明。<br><span class="en">I have read and agree to the notice above.</span></span>
      </label>
      <p id="consent-error" class="form-error" role="alert" hidden></p>
      <button type="button" class="btn btn-gold btn-block" id="consent-btn" disabled>继续 <span class="en">Continue</span></button>
    </section>`;
    const cb = $('#consent-cb');
    const btn = $('#consent-btn');
    cb.addEventListener('change', () => { btn.disabled = !cb.checked; });
    btn.addEventListener('click', () => App.busy(btn, async () => {
      try {
        setWallet(await App.rpc('accept_pdpa', { p_token: token }));
        window.scrollTo({ top: 0 });
      } catch (e) {
        $('#consent-error').textContent = e.message;
        $('#consent-error').hidden = false;
      }
    }));
  }

  // -------------------------------------------------------------- wallet ----
  const ICONS = {
    stack: '<svg viewBox="0 0 24 24"><path d="M4 9l8-4 8 4-8 4z"/><path d="M4 13l8 4 8-4"/><path d="M4 17l8 4 8-4"/></svg>',
    box: '<svg viewBox="0 0 24 24"><path d="M3 8l9-4 9 4v8l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v8"/></svg>',
    friend: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.8-3 3-4.6 5.5-4.6s4.7 1.6 5.5 4.6"/><path d="M18 8v6M15 11h6"/></svg>',
  };

  function sectionHead(zh, en) {
    return `<div class="sh"><div class="rule"></div><div class="eb"><span class="zh">${zh}</span><span class="en">${en}</span></div><div class="rule"></div></div>`;
  }

  function weekdayOf(dateStr) {
    const d = new Date(String(dateStr).slice(0, 10) + 'T12:00:00+08:00');
    const en = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Kuala_Lumpur' }).format(d);
    const idx = WEEK_EN.indexOf(en);
    return { en, zh: '周' + (WEEK_ZH[idx] || '') };
  }

  function longDate(dateStr) {
    const [y, m, day] = String(dateStr).slice(0, 10).split('-').map(Number);
    return { zh: `${y}年${m}月${day}日`, en: `${day} ${MONTHS_LONG[m - 1]} ${y}` };
  }

  function upcomingDraw(rounds, grand) {
    const now = serverNow();
    const items = [];
    rounds.forEach((r) => {
      const at = drawAt(r.draw_date);
      if (at) items.push({ kind: 'round', id: r.id, at, round: r });
    });
    const fat = drawAt(grand && grand.draw_date);
    if (fat) items.push({ kind: 'finale', at: fat });
    items.sort((a, b) => a.at - b.at);
    return items.find((x) => x.at > now) || items[items.length - 1] || null;
  }

  function ordBadge(rank) {
    const n = Number(rank);
    const suf = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
    return `<span class="g">${n}<sup class="en">${suf}</sup></span>`;
  }

  function chooseRound(rounds) {
    if (state.focusRound != null && rounds.some((r) => r.id === state.focusRound)) return state.focusRound;
    const openLeft = rounds.find((r) => isOpen(r) && r.tickets_total > 0 && r.unallocated > 0);
    if (openLeft) return openLeft.id;
    const today = App.todayMYT();
    const current = rounds.find((r) => today >= r.purchase_start && today <= r.purchase_end);
    if (current) return current.id;
    const withTickets = rounds.find((r) => r.tickets_total > 0);
    return (withTickets || rounds[0] || {}).id;
  }

  function renderWallet() {
    const w = state.wallet;
    const rounds = w.rounds || [];

    state.openRounds = rounds.filter(isOpen).map((r) => r.id);
    state.focusRound = chooseRound(rounds);
    const round = rounds.find((r) => r.id === state.focusRound) || null;
    const myWins = (state.view === 'tickets' && round)
      ? (round.categories || [])
        .filter((c) => (c.winners || []).some((x) => x.is_me))
        .map((c) => `${esc(round.code)} ${esc(c.name_zh)} <span class="en">${esc(c.name_en)}</span>`)
      : [];

    const vouchers = w.vouchers || [];
    const ready = vouchers.filter((v) => v.status === 'issued').length;
    const waiting = pendingAll();
    const total = w.grand.tickets_total || 0;

    content.innerHTML = `
      ${ticketBlock(w, total)}
      <div class="hint" id="hint"><span class="zh">拖动黄金券，轻轻倾斜看看</span><span class="en">Drag the ticket to tilt it</span></div>
      ${nextDrawBlock(rounds, w.grand)}
      <div class="tabs" role="tablist">
        <button type="button" role="tab" data-view="tickets" aria-selected="${state.view === 'tickets'}"><span class="zh">黄金券</span><span class="en">Tickets</span></button>
        <button type="button" role="tab" data-view="vouchers" aria-selected="${state.view === 'vouchers'}"><span class="zh">优惠券</span><span class="en">Vouchers</span>${ready ? `<i>${ready}</i>` : ''}</button>
      </div>
      ${waiting.length ? `<section class="card ge-banner">
        <div class="row1">
          <div>
            <h2 class="h2"><span class="zh">黄金信封</span><span class="en">Golden Envelope</span></h2>
            <p class="banner-sub"><span class="zh">您有 ${waiting.length} 份黄金信封。</span><span class="en">You have ${waiting.length} Golden Envelope${waiting.length === 1 ? '' : 's'}.</span></p>
          </div>
          <button type="button" class="banner-go" data-open-envelopes><span class="zh">开启</span><span class="en">Open</span></button>
        </div>
      </section>` : ''}
      ${myWins.length ? `<section class="card win-banner" role="status">
        <div class="eb" style="margin-top:0"><span class="zh">恭喜</span><span class="en">Congratulations</span></div>
        <h2 class="h2" style="margin-top:8px"><span class="zh">您中奖了</span><span class="en">You won</span></h2>
        <ul class="winners" style="list-style:none;margin:10px 0 0;padding:0">${myWins.map((x) => `<li>${x}</li>`).join('')}</ul>
        <p class="banner-sub"><span class="zh">礼券已放入「优惠券」，到店时交给销售顾问兑现。</span><span class="en">Your voucher is under Vouchers. Hand it to a consultant in store.</span></p>
      </section>` : ''}
      ${state.view === 'vouchers' ? vouchersPanel(vouchers) : (round ? roundCard(round) : '')}
      ${grandCard(w.grand)}
      ${earnCard(w)}
    `;
    const share = content.querySelector('[data-copy-share]');
    if (share) {
      share.dataset.share = App.lang() === 'en'
        ? `${w.customer.name} · ${w.customer.phone_masked}`
        : `${w.customer.name} · ${w.customer.phone_masked}`;
    }
    tick();
    placePip();
    const ticket = document.getElementById('ticket');
    if (ticket) tiltTicket(ticket);
  }

  let trackFrom = null;

  function placePip() {
    const pip = content.querySelector('.track .pip');
    if (!pip) return;
    const n = Number(pip.dataset.n);
    const i = Number(pip.dataset.i);
    const x = (idx) => `calc((${idx} + 0.5) / ${n} * 100% - 5.5px)`;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const toFinale = i === n - 1;
    if (trackFrom == null || trackFrom === i || reduce) {
      pip.style.transition = 'none';
      pip.classList.toggle('sf', toFinale);
      pip.style.left = x(i);
      pip.getBoundingClientRect();
      pip.style.transition = '';
    } else {
      pip.classList.toggle('sf', trackFrom === n - 1);
      pip.style.transition = 'none';
      pip.style.left = x(trackFrom);
      pip.getBoundingClientRect();
      pip.style.transition = '';
      pip.classList.toggle('sf', toFinale);
      pip.style.left = x(i);
    }
    trackFrom = i;
  }

  function ticketBlock(w, total) {
    return `<div class="tscene"><div class="ticket" id="ticket" aria-label="${esc(w.customer.name)}, ${total}">
      <div class="shadow"></div><div class="edge"></div><div class="edge edge2"></div><div class="face"></div>
      <div class="glare"></div><div class="sheen"></div>
      <div class="l">
        <div class="tk-eb"><span class="zh">你好</span><span class="en">Hello</span></div>
        <div class="tk-name">${esc(w.customer.name)}</div>
        <div class="tk-ph">${esc(w.customer.phone_masked)}</div>
      </div>
      <div class="r">
        <div class="tk-n">${total}</div>
        <div class="tk-l"><span class="zh">黄金券<br>总数</span><span class="en">Total<br>tickets</span></div>
      </div>
    </div></div>`;
  }

  function nextDrawBlock(rounds, grand) {
    const next = upcomingDraw(rounds, grand);
    state.nextDrawAt = next ? next.at : 0;
    state.finaleAt = drawAt(grand && grand.draw_date);
    const finale = App.fmtDate(grand.draw_date);
    const cols = rounds.length + 1;
    const sel = state.trackFinale ? rounds.length : Math.max(0, rounds.findIndex((r) => r.id === state.focusRound));
    const steps = rounds.map((r) => {
      const d = App.fmtDate(r.draw_date);
      const on = !state.trackFinale && r.id === state.focusRound;
      return `<button type="button" class="st ${on ? 'on' : ''}" data-focus="${r.id}">
        <div class="dot"></div>
        <b><span class="zh">${esc(r.name_zh)}</span><span class="en">${esc(r.name_en)}</span></b>
        <small><span class="zh">${esc(d.zh)}</span><span class="en">${esc(d.en)}</span></small>
      </button>`;
    }).join('');
    const finOn = state.trackFinale;
    const track = `<div class="track"><i class="pip${finOn ? ' sf' : ''}" data-i="${sel}" data-n="${cols}" aria-hidden="true"></i><div class="track-row" style="grid-template-columns:repeat(${cols},1fr)">${steps}<button type="button" class="st sf ${finOn ? 'on' : ''}" data-finale>
      <div class="dot"></div>
      <b><span class="zh">总决赛</span><span class="en">Finale</span></b>
      <small><span class="zh">${esc(finale.zh)}</span><span class="en">${esc(finale.en)}</span></small>
    </button></div></div>`;
    if (!next) return track;
    const src = next.kind === 'finale' ? grand : next.round;
    const when = App.fmtDate(src.draw_date);
    const wd = weekdayOf(src.draw_date);
    const titleZh = next.kind === 'finale' ? '下一轮抽奖 · 总决赛' : `下一轮抽奖 · ${esc(next.round.name_zh)}`;
    const titleEn = next.kind === 'finale' ? 'Next draw · Finale' : `Next draw · ${esc(next.round.name_en)}`;
    return `${sectionHead(titleZh, titleEn)}
      <div class="clock">
        <div class="u"><b data-cd="0">00</b><small><span class="zh">天</span><span class="en">Days</span></small></div>
        <div class="u"><b data-cd="1">00</b><small><span class="zh">小时</span><span class="en">Hours</span></small></div>
        <div class="u"><b data-cd="2">00</b><small><span class="zh">分钟</span><span class="en">Mins</span></small></div>
        <div class="u"><b data-cd="3">00</b><small><span class="zh">秒</span><span class="en">Secs</span></small></div>
      </div>
      <div class="when">
        <div class="when-copy">
          <b><span class="zh">${esc(when.zh)}（${wd.zh}）晚上8点</span><span class="en">${wd.en}, ${esc(when.en)} · 8:00 pm</span></b>
          <span class="live"><i></i><span class="zh">Facebook 直播</span><span class="en">Live on Facebook</span></span>
        </div>
        <button type="button" class="ghost ${state.remind ? 'on' : ''}" data-remind>${BELL}<span class="zh">${state.remind ? '已设提醒' : '提醒我'}</span><span class="en">${state.remind ? 'Reminder set' : 'Remind me'}</span></button>
      </div>
      ${track}`;
  }

  function sourceBreakdown(bs) {
    return ['purchase', 'topup', 'repeat_bonus', 'referral']
      .filter((k) => bs[k] > 0)
      .map((k) => {
        const l = App.SOURCE_LABEL[k];
        const bonus = k === 'repeat_bonus' || k === 'referral';
        return `<li class="${bonus ? 'bonus' : ''}"><span>${l.zh} <span class="en">${l.en}</span></span><b>${bonus ? '+' : ''}${bs[k]}</b></li>`;
      }).join('');
  }

  function winnersBlock(cats) {
    const withW = (cats || []).filter((c) => (c.winners || []).length);
    if (!withW.length) return '';
    return `<div class="winners">
      <h4><span class="zh">得奖名单</span><span class="en">Winners</span></h4>
      ${withW.map((c) => `<div>
        <b><span class="zh">${esc(c.name_zh)}</span><span class="en">${esc(c.name_en)}</span></b>
        <ul>${c.winners.map((x) => `<li class="${x.is_me ? 'me' : ''}">${esc(x.name)} <span class="muted">${esc(x.phone)}</span>${x.is_me ? ' <b><span class="zh">← 您</span><span class="en">← You</span></b>' : ''}</li>`).join('')}</ul>
      </div>`).join('')}
    </div>`;
  }

  function prizeRows(cats, mode) {
    return [...cats].sort((a, b) => a.rank - b.rank).map((c) => {
      const slots = c.winner_slots === 1
        ? '<span class="zh">1 名</span><span class="en">1 winner</span>'
        : `<span class="zh">${c.winner_slots} 名</span><span class="en">${c.winner_slots} winners</span>`;
      const detail = c.prize_desc ? esc(c.prize_desc) : slots;
      const control = mode === 'step'
        ? `<div class="step">
            <button type="button" data-act="dec" data-cat="${c.id}" aria-label="−">−</button>
            <b data-val="${c.id}">0</b>
            <button type="button" data-act="inc" data-cat="${c.id}" aria-label="+">+</button>
          </div>`
        : `<b class="held">${c.my_tickets}</b>`;
      return `<div class="pr">
        <div class="pz">${ordBadge(c.rank)}</div>
        <div class="pn"><b><span class="zh">${esc(c.name_zh)}</span><span class="en">${esc(c.name_en)}</span></b><small>${detail}</small></div>
        ${control}
      </div>`;
    }).join('');
  }

  function roundCard(r) {
    const open = isOpen(r);
    const start = App.fmtDate(r.purchase_start);
    const end = App.fmtDate(r.purchase_end);
    const dl = App.fmtDeadline(r.allocation_deadline);
    const today = App.todayMYT();
    const upcoming = today < r.purchase_start && r.tickets_total === 0;
    const drawn = (r.categories || []).some((c) => (c.winners || []).length);
    let status;
    if (drawn) status = '<div class="pill-status drawn"><i></i><span class="zh">已开奖</span><span class="en">Drawn</span></div>';
    else if (upcoming) status = '<div class="pill-status soon"><i></i><span class="zh">未开始</span><span class="en">Soon</span></div>';
    else if (open) status = '<div class="open"><i></i><span class="zh">进行中</span><span class="en">Open</span></div>';
    else status = '<div class="pill-status closed"><i></i><span class="zh">已截止</span><span class="en">Closed</span></div>';

    const chips = `<div class="kv">
      <div><span><span class="zh">购买期</span><span class="en">Purchase period</span></span><b><span class="zh">${esc(start.zh)} – ${esc(end.zh)}</span><span class="en">${esc(start.en)} – ${esc(end.en)}</span></b></div>
      <div class="dl"><span><span class="zh">黄金券分配截止</span><span class="en">Allocate tickets by</span></span><b><span class="zh">${esc(dl.zh)}</span><span class="en">${esc(dl.en)}</span></b></div>
    </div>`;

    let body = '';
    if (r.tickets_total === 0) {
      body = `<p class="quiet">${upcoming
        ? '<span class="zh">本轮尚未开始。</span><span class="en">This round has not started yet.</span>'
        : '<span class="zh">本轮没有黄金券。</span><span class="en">No tickets in this round.</span>'}</p>`;
    } else if (open && r.unallocated > 0) {
      body = allocForm(r);
    } else if (!open && r.unallocated > 0) {
      body = `<div class="prog"><div class="t"><span><span class="zh">已分配黄金券</span><span class="en">Tickets allocated</span></span><b>${r.allocated_total} / ${r.tickets_total}</b></div><div class="bar"><i style="width:${Math.round(r.allocated_total / r.tickets_total * 100)}%"></i></div></div>
        <div class="alloc">${prizeRows(r.categories, 'held')}</div>
        <p class="note-miss"><span class="zh">${r.unallocated} 张黄金券未在截止前分配，未能参加本轮抽奖，但仍会计入总决赛。</span><span class="en">${r.unallocated} ticket${r.unallocated === 1 ? '' : 's'} missed this round’s draw. They still count for the Grand Finale.</span></p>`;
    } else {
      body = `<div class="prog"><div class="t"><span><span class="zh">已分配黄金券</span><span class="en">Tickets allocated</span></span><b>${r.allocated_total} / ${r.tickets_total}</b></div><div class="bar"><i style="width:100%"></i></div></div>
        <div class="alloc">${prizeRows(r.categories, 'held')}</div>
        <div class="note done"><i>✓</i><span><span class="zh">黄金券已全部分配，祝你好运。</span><span class="en">All tickets allocated. Good luck.</span></span></div>`;
    }

    return `<section class="card" id="round-${r.id}">
      <div class="row1"><h2 class="h2"><span class="zh">${esc(r.name_zh)}</span><span class="en">${esc(r.name_en)}</span></h2>${status}</div>
      ${chips}
      ${body}
      ${winnersBlock(r.categories)}
    </section>`;
  }

  function allocForm(r) {
    const a = (state.alloc[r.id] = state.alloc[r.id] || {});
    r.categories.forEach((c) => { if (!(c.id in a)) a[c.id] = 0; });
    return `<div class="alloc-form" data-round="${r.id}">
      <div class="prog">
        <div class="t"><span><span class="zh">已分配黄金券</span><span class="en">Tickets allocated</span></span><b class="alloc-count">0 / ${r.unallocated}</b></div>
        <div class="bar"><i class="bar-fill"></i></div>
      </div>
      <div class="alloc">${prizeRows(r.categories, 'step')}</div>
      <div class="note"><i>${r.unallocated}</i><span class="alloc-note"><span class="zh">还有 ${r.unallocated} 张黄金券未分配。</span><span class="en">${r.unallocated} ticket${r.unallocated === 1 ? '' : 's'} still to allocate.</span></span></div>
      <p class="form-error alloc-error" role="alert" hidden></p>
      <button type="button" class="mt-submit" data-act="submit" disabled><span class="zh">提交分配</span><span class="en">Submit allocation</span></button>
    </div>`;
  }

  function grandCard(g) {
    const when = g.draw_date ? longDate(g.draw_date) : { zh: '', en: '' };
    const prizes = g.category && g.category.prize_desc
      ? [g.category.prize_desc]
      : null;
    const prize = (zh, en) => `<span><span class="zh">${zh}</span><span class="en">${en}</span></span>`;
    const chips = prizes
      ? prizes.map((x) => `<span>${esc(x)}</span>`).join('')
      : prize('瑞士双人游', 'Swiss trip for 2') + prize('细胞焕活疗程', 'Cellular Rejuvenation') + prize('一整年产品', '1 year of products');
    return `<section class="fin" id="finale">
      <div class="im" aria-hidden="true"></div>
      <div class="eb"><span class="zh">压轴大奖</span><span class="en">The finale</span></div>
      <h2 class="h2"><span class="zh">总决赛</span><span class="en">Grand Finale</span></h2>
      <div class="worth"><div class="eb"><span class="zh">总决赛大奖价值</span><span class="en">Grand Prize worth</span></div><b class="g">RM 100,000</b></div>
      <div class="gp">${chips}</div>
      <div class="rule"></div>
      <div class="stats">
        <div><b>${g.tickets_total}</b><small><span class="zh">参加的黄金券</span><span class="en">Tickets entered</span></small></div>
        <div><b id="cdf">–</b><small><span class="zh">剩余天数</span><span class="en">Days to go</span></small></div>
      </div>
      <p><span class="zh">每一轮的黄金券都会自动参加总决赛。</span><span class="en">All your tickets from every round enter automatically.</span></p>
      <div class="date"><span class="zh">抽奖 · ${esc(when.zh)}</span><span class="en">Draw · ${esc(when.en)}</span></div>
      ${g.winners && g.winners.length ? `<div class="winners"><h4><span class="zh">得奖者</span><span class="en">Winner</span></h4><ul>${g.winners.map((x) => `<li class="${x.is_me ? 'me' : ''}">${esc(x.name)} <span class="muted">${esc(x.phone)}</span>${x.is_me ? ' <b><span class="zh">← 您</span><span class="en">← You</span></b>' : ''}</li>`).join('')}</ul></div>` : ''}
    </section>`;
  }

  function earnCard(w) {
    const order = w.customer && Number.isFinite(Number(w.customer.biggest_order)) ? Number(w.customer.biggest_order) : null;
    const boxes = order == null ? 0 : order;
    const pct = Math.min(100, (boxes / 18) * 100);
    const next = boxes < 12 ? [12 - boxes, 2] : boxes < 18 ? [18 - boxes, 3] : null;
    const phone = esc(w.customer.phone_masked || '');
    const nudge = order == null ? '' : `<div class="nudge"><span class="zh">你的最大单笔订单：<b>${boxes} 盒</b>。${next ? `单笔再买 <b>${next[0]} 盒</b>，即享 <b>${next[1]} 倍黄金券</b>。` : '你已获得最高倍数：3 倍。'}</span><span class="en">Your biggest order: <b>${boxes} boxes</b>. ${next ? `Add <b>${next[0]} more boxes</b> to one order to unlock <b>${next[1]}× tickets</b>.` : 'You have unlocked the top multiplier, 3×.'}</span></div>`;
    return `${sectionHead('赚取更多', 'Earn more')}
    <section class="earn">
      <div class="earnh">
        <h2 class="h2"><span class="zh">如何获得更多黄金券</span><span class="en">How to earn more tickets</span></h2>
        <p class="sub"><span class="zh">每多一盒，本轮和总决赛的机会就更多。</span><span class="en">Every extra box adds to your chances in this round and the Grand Finale.</span></p>
      </div>
      <div class="ways">
        <div class="way"><div class="wi">${ICONS.stack}</div><div class="wt">
          <b><span><span class="zh">单笔多买，倍数加成</span><span class="en">Buy more in one order</span></span><em><span class="zh">最高 3 倍</span><span class="en">up to 3×</span></em></b>
          <small><span class="zh">单笔订单满 12 盒享 2 倍黄金券，满 18 盒享 3 倍。</span><span class="en">12 or more boxes in one order earn 2× tickets. 18 or more earn 3×.</span></small>
          <div class="ladder">
            <div class="rail"><i style="width:${pct}%"></i></div>
            <div class="mk reached" style="left:0%"><span></span><small><b>1×</b></small></div>
            <div class="mk ${boxes >= 12 ? 'reached' : ''}" style="left:${(12 / 18) * 100}%"><span></span><small><b>2×</b> · 12</small></div>
            <div class="mk ${boxes >= 18 ? 'reached' : ''}" style="left:100%"><span></span><small><b>3×</b> · 18</small></div>
          </div>
          ${nudge}
        </div></div>
        <div class="way"><div class="wi">${ICONS.box}</div><div class="wt">
          <b><span><span class="zh">每一盒都算</span><span class="en">Every box counts</span></span><em><span class="zh">每盒 +1</span><span class="en">+1 per box</span></em></b>
          <small><span class="zh">每多买一盒，就多 1 张黄金券。</span><span class="en">Each new box you buy adds one more Golden Ticket.</span></small>
        </div></div>
        <div class="way"><div class="wi">${ICONS.friend}</div><div class="wt">
          <b><span><span class="zh">推荐好友</span><span class="en">Refer a friend</span></span><em><span class="zh">额外奖励</span><span class="en">bonus</span></em></b>
          <small><span class="zh">好友下单时向顾问报上你的名字。</span><span class="en">Ask a friend to give your name when they order.</span></small>
          <div class="code"><output id="share-code">${phone}</output><button type="button" class="ghost" data-copy-share><span class="copy-label"><span class="zh">复制</span><span class="en">Copy</span></span></button></div>
          <div class="tbc"><span class="zh">双方各得 5 张黄金券。</span><span class="en">You each receive 5 tickets.</span></div>
        </div></div>
      </div>
    </section>`;
  }

  // ---------------------------------------------------------- allocation ----
  function roundById(id) {
    return state.wallet.rounds.find((r) => r.id === id);
  }

  function updateAllocUI(roundId) {
    const form = content.querySelector(`.alloc-form[data-round="${roundId}"]`);
    if (!form) return;
    const r = roundById(roundId);
    const a = state.alloc[roundId];
    const used = Object.values(a).reduce((s, n) => s + n, 0);
    const total = r.unallocated;
    Object.entries(a).forEach(([cat, n]) => {
      const out = form.querySelector(`[data-val="${cat}"]`);
      if (out) out.textContent = n;
      const dec = form.querySelector(`[data-act="dec"][data-cat="${cat}"]`);
      if (dec) dec.disabled = n <= 0;
    });
    form.querySelectorAll('[data-act="inc"]').forEach((b) => { b.disabled = used >= total; });
    const fill = form.querySelector('.bar-fill');
    if (fill) fill.style.width = `${total ? Math.min(100, (used / total) * 100) : 0}%`;
    const count = form.querySelector('.alloc-count');
    if (count) count.textContent = `${used} / ${total}`;
    const note = form.querySelector('.note');
    if (note) {
      const left = total - used;
      note.classList.toggle('done', used >= total);
      note.innerHTML = used < total
        ? `<i>${left}</i><span class="alloc-note"><span class="zh">还有 ${left} 张黄金券未分配。</span><span class="en">${left} ticket${left === 1 ? '' : 's'} still to allocate.</span></span>`
        : `<i>✓</i><span class="alloc-note"><span class="zh">黄金券已全部分配，祝你好运。</span><span class="en">All tickets allocated. Good luck.</span></span>`;
    }
    const submit = form.querySelector('[data-act="submit"]');
    if (submit) submit.disabled = used !== total;
  }

  content.addEventListener('click', async (ev) => {
    const remind = ev.target.closest('[data-remind]');
    if (remind) {
      state.remind = !state.remind;
      try { localStorage.setItem('zv-remind:' + token, state.remind ? '1' : '0'); } catch (_) { /* private mode */ }
      renderWallet();
      return;
    }
    const tab = ev.target.closest('[data-view]');
    if (tab) {
      state.view = tab.dataset.view;
      renderWallet();
      return;
    }
    const focus = ev.target.closest('[data-focus]');
    if (focus) {
      state.trackFinale = false;
      state.focusRound = Number(focus.dataset.focus);
      state.view = 'tickets';
      renderWallet();
      return;
    }
    if (ev.target.closest('[data-finale]')) {
      state.trackFinale = true;
      renderWallet();
      document.getElementById('finale')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const copyBtn = ev.target.closest('[data-copy-share]');
    if (copyBtn) {
      const text = copyBtn.dataset.share || '';
      const label = copyBtn.querySelector('.copy-label');
      const done = '<span class="zh">已复制</span><span class="en">Copied</span>';
      const idle = '<span class="zh">复制</span><span class="en">Copy</span>';
      const mark = () => { if (label) label.innerHTML = done; setTimeout(() => { if (label) label.innerHTML = idle; }, 1600); };
      if (navigator.clipboard && text) navigator.clipboard.writeText(text).then(mark).catch(mark);
      else mark();
      return;
    }
    if (ev.target.closest('[data-open-envelopes]')) {
      clearSkip();
      openGolden('sealed');
      return;
    }
    const redeem = ev.target.closest('[data-redeem]');
    if (redeem) {
      const v = (state.wallet.vouchers || []).find((x) => String(x.id) === redeem.dataset.redeem);
      if (v) askRedeem(v);
      return;
    }
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const form = btn.closest('.alloc-form');
    if (!form) return;
    const roundId = Number(form.dataset.round);
    const r = roundById(roundId);
    const a = state.alloc[roundId];
    const used = Object.values(a).reduce((s, n) => s + n, 0);
    const cat = btn.dataset.cat;

    if (btn.dataset.act === 'inc' && used < r.unallocated) a[cat] += 1;
    else if (btn.dataset.act === 'dec' && a[cat] > 0) a[cat] -= 1;
    else if (btn.dataset.act === 'all') {
      Object.keys(a).forEach((k) => { a[k] = 0; });
      a[cat] = r.unallocated;
    } else if (btn.dataset.act === 'submit') {
      return submitAlloc(r, form, btn);
    }
    updateAllocUI(roundId);
  });

  function confirmDialog(r) {
    const a = state.alloc[r.id];
    const rows = r.categories
      .filter((c) => a[c.id] > 0)
      .map((c) => `<li><span>${rankMark(c.rank)} ${esc(c.name_zh)} <span class="en">${esc(c.name_en)}</span></span><b>${a[c.id]}</b></li>`)
      .join('');
    $('#confirm-body').innerHTML = `<p><b>${esc(r.code)} ${esc(r.name_zh)}</b> <span class="en">${esc(r.name_en)}</span></p><ul class="alloc-list">${rows}</ul>`;
    const dlg = $('#confirm-dialog');
    if (typeof dlg.showModal !== 'function') {
      return Promise.resolve(window.confirm('提交后不可更改，确认提交？\nSubmitted allocations are final. Submit?'));
    }
    return new Promise((resolve) => {
      dlg.returnValue = '';
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
      dlg.showModal();
    });
  }

  async function submitAlloc(r, form, btn) {
    const errEl = form.querySelector('.alloc-error');
    errEl.hidden = true;
    if (!(await confirmDialog(r))) return;
    const payload = {};
    Object.entries(state.alloc[r.id]).forEach(([k, n]) => { if (n > 0) payload[k] = n; });
    await App.busy(btn, async () => {
      try {
        const w = await App.rpc('submit_allocation', { p_token: token, p_round_id: r.id, p_alloc: payload });
        delete state.alloc[r.id];
        setWallet(w);
        App.say('已提交，祝您好运！', 'Submitted — good luck!', 'ok');
        const card = document.getElementById(`round-${r.id}`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        errEl.textContent = e.message;
        errEl.hidden = false;
      }
    }, '提交中… <span class="en">Submitting…</span>');
  }

  // ----------------------------------------------------------- countdown ----
  function paintClock() {
    const left = Math.max(0, (state.nextDrawAt || 0) - serverNow()) / 1000;
    const parts = [
      Math.floor(left / 86400),
      Math.floor((left % 86400) / 3600),
      Math.floor((left % 3600) / 60),
      Math.floor(left % 60),
    ];
    content.querySelectorAll('[data-cd]').forEach((el) => {
      const text = String(parts[+el.dataset.cd] || 0).padStart(2, '0');
      if (el.textContent !== text) el.textContent = text;
    });
    const days = document.getElementById('cdf');
    if (days && state.finaleAt) {
      days.textContent = String(Math.ceil(Math.max(0, state.finaleAt - serverNow()) / 86400000));
    }
  }

  function fmtLeft(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400);
    const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return d > 0 ? `${d}天 <span class="en">d</span> ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
  }

  function tick() {
    if (!state.wallet || state.wallet.consent_required) return;
    // a round just closed → re-render so its form disappears
    const nowOpen = state.wallet.rounds.filter(isOpen).map((r) => r.id);
    if (nowOpen.length !== state.openRounds.length) {
      renderWallet();
      return;
    }
    paintClock();
    // first render of each form
    content.querySelectorAll('.alloc-form').forEach((form) => {
      if (!form.dataset.init) { form.dataset.init = '1'; updateAllocUI(Number(form.dataset.round)); }
    });
  }
  setInterval(tick, 1000);

  // refresh when the customer comes back to the tab (e.g. after new tickets)
  document.addEventListener('visibilitychange', () => {
    if (localPreview || !App.sb) return;
    if (document.visibilityState === 'visible' && state.wallet && !state.wallet.consent_required) {
      const hasPending = Object.values(state.alloc).some((a) => Object.values(a).some((n) => n > 0));
      if (!hasPending) load();
    }
  });

  // ----------------------------------------------------- golden envelope ----
  const goldenEl = () => $('#golden');
  function skipKey() { return 'ge-skip:' + token; }
  function skippedSet() {
    try { return new Set(JSON.parse(sessionStorage.getItem(skipKey()) || '[]').map(String)); }
    catch (_) { return new Set(); }
  }
  function rememberSkip(ids) {
    const s = skippedSet();
    ids.forEach((id) => s.add(String(id)));
    try { sessionStorage.setItem(skipKey(), JSON.stringify([...s])); } catch (_) {}
  }
  function clearSkip() {
    try { sessionStorage.removeItem(skipKey()); } catch (_) {}
  }
  function pendingAll() {
    return (state.wallet && state.wallet.golden && state.wallet.golden.pending) || [];
  }
  function unskipped() {
    const s = skippedSet();
    return pendingAll().filter((e) => !s.has(String(e.id)));
  }
  let geMountGen = 0;
  const envScriptLoads = {};
  function loadScript(src) {
    if (envScriptLoads[src]) return envScriptLoads[src];
    const pending = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('无法加载黄金信封 / Could not load the Golden Envelope'));
      document.head.appendChild(s);
    });
    envScriptLoads[src] = pending;
    pending.catch(() => { delete envScriptLoads[src]; });
    return pending;
  }
  async function loadEnvelopeLibs() {
    await loadScript('envelope/vendor/three.min.js');
    await Promise.all([
      loadScript('envelope/zell-envelope-images.js'),
      loadScript('envelope/zell-envelope-models.js'),
    ]);
    await loadScript('envelope/zell-envelope.js?v=1');
  }
  const GIFT_ID = { SERUM: 'serum', CREAM: 'cream', BEVITE: 'bevite', BEJOJOBA: 'jojoba', VIT_D: 'vitd', SHEEP: 'sheep' };
  function giftIdForVoucher(v) {
    if (!v) return null;
    if (v.prize_code && GIFT_ID[v.prize_code]) return GIFT_ID[v.prize_code];
    const list = prizes();
    const p = list.find((x) => x.name_zh === v.title_zh && x.name_en === v.title_en)
      || list.find((x) => x.name_en === v.title_en);
    return p ? (GIFT_ID[p.code] || null) : null;
  }

  function closeGolden() {
    geMountGen += 1;
    if (state.envMount) {
      try { state.envMount.destroy(); } catch (_) { /* already gone */ }
      state.envMount = null;
    }
    const el = goldenEl();
    if (!el) return;
    el.hidden = true;
    el.innerHTML = '';
    el.classList.remove('is-stage', 'is-open');
    document.body.classList.remove('is-golden');
    state.gePhase = 'sealed';
  }
  function langSwitch() {
    const on = App.lang();
    return `<div class="lang-switch" role="group">
      <button type="button" class="lang-btn ${on === 'zh' ? 'is-on' : ''}" data-set-lang="zh" aria-pressed="${on === 'zh'}">中文</button>
      <button type="button" class="lang-btn ${on === 'en' ? 'is-on' : ''}" data-set-lang="en" aria-pressed="${on === 'en'}">EN</button>
    </div>`;
  }
  function prizes() {
    return (state.wallet && state.wallet.golden && state.wallet.golden.prizes) || [];
  }

  function openGolden(phase, voucher) {
    const pending = unskipped();
    const el = goldenEl();
    if (!el || !state.wallet) return;
    state.geVoucher = voucher || null;
    if (phase === 'won') {
      if (!voucher) { closeGolden(); return; }
      returnToWallet();
      return;
    }
    if (!pending.length) { closeGolden(); return; }
    mountEnvelope(pending[0]);
  }

  async function mountEnvelope(env) {
    const el = goldenEl();
    const gen = ++geMountGen;
    state.gePhase = 'draw';
    el.hidden = false;
    el.classList.add('is-stage');
    document.body.classList.add('is-golden');
    el.innerHTML = `<div class="ge-mount" id="ge-mount"></div>
      <div class="ge-tools">
        ${langSwitch()}
        <button type="button" class="ge-later" data-ge="later"><span class="zh">稍后再说</span><span class="en">Not now</span></button>
      </div>`;
    try {
      await loadEnvelopeLibs();
      if (gen !== geMountGen || el.hidden) return;
      const mount = document.getElementById('ge-mount');
      if (!mount || !window.ZellEnvelopeMount) throw new Error('无法加载黄金信封 / Could not load the Golden Envelope');
      state.envMount = window.ZellEnvelopeMount(mount, {
        lang: App.lang() === 'en' ? 'en' : 'zh',
        sound: true,
        quality: 'high',
        assets: {
          logoEn: 'envelope/assets/logo-en.png',
          logoZh: 'envelope/assets/logo-zh.png',
          sealLogo: 'envelope/assets/seal-logo.png',
        },
        pick: () => pickGift(env),
        onStart() {
          state.gePhase = 'drawing';
          const later = el.querySelector('.ge-later');
          if (later) later.hidden = true;
        },
        onError(err) {
          state.gePhase = 'draw';
          const later = el.querySelector('.ge-later');
          if (later) later.hidden = false;
          App.toast(App.localize(err && err.message ? err.message : '无法开启 / Could not open'), 'error');
        },
        onDone() {
          state.view = 'vouchers';
          returnToWallet();
        },
      });
    } catch (e) {
      if (gen !== geMountGen) return;
      closeGolden();
      App.toast(App.localize(e.message), 'error');
    }
  }

  async function pickGift(env) {
    const v = await drawEnvelope(env);
    if (!v) throw new Error('找不到礼券 / Voucher not found');
    state.geVoucher = v;
    const id = giftIdForVoucher(v);
    if (!id) throw new Error('找不到礼品 / Gift not found');
    return id;
  }

  function wonScreen(v) {
    return `<div class="golden-top"><img class="brand-word" src="assets/logos/zellv-wordmark-charcoal.webp" alt="ZÉLL-V">${langSwitch()}</div>
      <div class="golden-body">
        <p class="ge-kicker">恭喜获得 <span class="en">You received</span></p>
        <h2 class="ge-hello">${esc(App.pick(v.title_zh, v.title_en))}</h2>
        <p class="ge-lead">${esc(App.pick(v.detail_zh, v.detail_en))}</p>
        ${voucherCard(v, false)}
        <p class="small ge-note">正在返回主页… <span class="en">Returning to your page…</span></p>
      </div>`;
  }

  function voucherCard(v, withButton) {
    const kind = v.kind === 'lucky_draw'
      ? '<span class="pill">幸运抽奖 <span class="en">Lucky Draw</span></span>'
      : '<span class="pill pill-new">黄金信封 <span class="en">Golden Envelope</span></span>';
    const status = v.status === 'redeemed'
      ? `<span class="pill pill-ok">已兑现 <span class="en">Redeemed</span></span>`
      : v.status === 'voided'
        ? `<span class="pill pill-warn">已作废 <span class="en">Voided</span></span>`
        : `<span class="pill">可兑现 <span class="en">Ready</span></span>`;
    const when = v.status === 'redeemed' && v.redeemed_at
      ? `<p class="small muted">${esc(App.fmtDateTime(v.redeemed_at))}</p>` : '';
    return `<article class="v-card ${v.status === 'redeemed' ? 'is-redeemed' : ''}">
      <div class="v-main">
        <div class="v-pills">${kind}${status}</div>
        <h3><span class="zh">${esc(v.title_zh)}</span><span class="en">${esc(v.title_en)}</span></h3>
        ${v.detail_zh || v.detail_en ? `<p class="v-detail"><span class="zh">${esc(v.detail_zh)}</span><span class="en">${esc(v.detail_en)}</span></p>` : ''}
        ${when}
        ${withButton && v.status === 'issued' ? `<button type="button" class="btn btn-primary btn-block" data-redeem="${v.id}"><span class="zh">兑现</span><span class="en">Redeem</span></button>` : ''}
      </div>
      <div class="v-stub"><p class="v-code">${esc(v.code)}</p></div>
    </article>`;
  }

  function vouchersPanel(list) {
    if (!list.length) {
      return `<section class="card vouch">
        <h2 class="h2 g"><span class="zh">优惠券</span><span class="en">Vouchers</span></h2>
        <p class="sub"><span class="zh">还没有礼券。黄金信封和幸运抽奖的奖品都会出现在这里。</span><span class="en">Golden Envelope gifts and lucky-draw wins show up here.</span></p>
      </section>`;
    }
    return `<div class="v-list">${list.map((v) => voucherCard(v, true)).join('')}</div>`;
  }

  function askDialog(id) {
    const dlg = $(id);
    if (!dlg || typeof dlg.showModal !== 'function') return Promise.resolve(window.confirm('Continue?'));
    return new Promise((resolve) => {
      dlg.returnValue = '';
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
      dlg.showModal();
    });
  }

  async function askRedeem(v) {
    $('#redeem-body').innerHTML = `<p class="v-code center">${esc(v.code)}</p><p class="center"><b>${esc(App.pick(v.title_zh, v.title_en))}</b></p>`;
    if (!(await askDialog('#redeem-dialog'))) return;
    try {
      state.suspendGolden = true;
      setWallet(await App.rpc('redeem_voucher', { p_token: token, p_voucher_id: v.id }));
      state.view = 'vouchers';
      closeGolden();
      renderWallet();
      App.say('已兑现', 'Redeemed', 'ok');
    } catch (e) {
      App.toast(App.localize(e.message), 'error');
    } finally {
      state.suspendGolden = false;
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function voucherForEnvelope(w, envelopeId) {
    return (w.vouchers || []).find((x) => Number(x.golden_envelope_id) === Number(envelopeId)) || null;
  }

  function returnToWallet() {
    clearTimeout(state.homeTimer);
    state.geVoucher = null;
    state.gePhase = 'sealed';
    closeGolden();
    if (state.wallet && !state.wallet.consent_required) renderWallet();
  }

  async function drawEnvelope(env) {
    if (localPreview) {
      const list = prizes();
      const p = list[Math.floor(Math.random() * list.length)];
      const v = {
        id: 'preview-' + env.id,
        kind: 'golden_envelope',
        code: 'GE-PREVIEW',
        title_zh: p.name_zh,
        title_en: p.name_en,
        detail_zh: p.offer_zh,
        detail_en: p.offer_en,
        status: 'issued',
        golden_envelope_id: env.id,
      };
      state.wallet.golden.pending = pendingAll().filter((e) => e.id !== env.id);
      state.wallet.vouchers = [v, ...(state.wallet.vouchers || [])];
      state.suspendGolden = true;
      renderWallet();
      state.suspendGolden = false;
      return v;
    }
    state.suspendGolden = true;
    try {
      const w = await App.rpc('open_golden_envelope', { p_token: token, p_envelope_id: env.id });
      setWallet(w);
      return voucherForEnvelope(w, env.id);
    } finally {
      state.suspendGolden = false;
    }
  }

  goldenEl().addEventListener('click', (ev) => {
    const ge = ev.target.closest('[data-ge]');
    if (!ge || ge.dataset.ge !== 'later' || state.gePhase === 'drawing') return;
    clearTimeout(state.homeTimer);
    rememberSkip(unskipped().map((e) => e.id));
    closeGolden();
    renderWallet();
  });

  const MAXY = 24;
  const MAXX = 16;
  function tiltTicket(el) {
    let down = false;
    let sx = 0;
    let sy = 0;
    let raf = 0;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const set = (rx, ry) => {
      el.style.setProperty('--rx', rx + 'deg');
      el.style.setProperty('--ry', ry + 'deg');
      el.style.setProperty('--gx', (50 + ry / MAXY * 45) + '%');
      el.style.setProperty('--gy', (40 - rx / MAXX * 40) + '%');
      el.style.setProperty('--sx', (-60 + (ry / MAXY + 1) * 80) + '%');
    };
    const soft = (v, m) => m * Math.tanh(v / m);
    el.addEventListener('pointerdown', (e) => {
      down = true;
      sx = e.clientX;
      sy = e.clientY;
      el.setPointerCapture(e.pointerId);
      el.classList.remove('spring');
      el.classList.add('drag');
      cancelAnimationFrame(raf);
      const hint = document.getElementById('hint');
      if (hint) hint.style.opacity = '0';
    });
    el.addEventListener('pointermove', (e) => {
      if (!down) return;
      set(soft(-(e.clientY - sy) * 0.28, MAXX), soft((e.clientX - sx) * 0.32, MAXY));
    });
    const up = () => {
      if (!down) return;
      down = false;
      el.classList.remove('drag');
      el.classList.add('spring');
      set(0, 0);
      setTimeout(() => { el.classList.remove('spring'); float(); }, 900);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    function float() {
      if (reduce) return;
      const t0 = performance.now();
      const frame = (t) => {
        if (down || !el.isConnected) return;
        const s = (t - t0) / 1000;
        set(Math.sin(s * 0.9) * 2.2, Math.sin(s * 0.6) * 4);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }
    float();
  }

  document.addEventListener('zv-lang', () => {
    if (!state.wallet) return;
    if (state.wallet.consent_required) renderConsent();
    else if (state.envMount) state.envMount.setLang(App.lang() === 'en' ? 'en' : 'zh');
    if (!state.wallet.consent_required) renderWallet();
  });

  function previewWallet() {
    const prizes = [
      ['SERUM', '精华液', 'Serum', '只需 RM68', 'Only RM68'],
      ['CREAM', '面霜', 'Cream', '只需 RM68', 'Only RM68'],
      ['BEVITE', 'Bevite', 'Bevite', '只需 RM68', 'Only RM68'],
      ['BEJOJOBA', 'Bejojoba', 'Bejojoba', '只需 RM68', 'Only RM68'],
      ['SHEEP', 'ZÉLL-V Sheep', 'ZÉLL-V Sheep', '免费', 'Free'],
      ['VIT_D', '维他命 D', 'Vitamin D', '免费', 'Free'],
    ].map(([code, name_zh, name_en, offer_zh, offer_en]) => ({ code, name_zh, name_en, offer_zh, offer_en }));
    setWallet({
      consent_required: false,
      server_now: new Date().toISOString(),
      customer: { name: '陈大文', phone_masked: '012-***-6789' },
      vouchers: [],
      golden: {
        min_tickets: 4,
        pending: [{ id: 1, paid_boxes: 6, lifetime_tickets: 6, invoice_no: 'INV-1008', invoice_date: '2026-11-12', round_code: 'R1' }],
        prizes,
      },
      rounds: [],
      grand: { tickets_total: 6, winners: [], category: null, draw_date: '2027-01-08' },
    });
  }

  if (localPreview) previewWallet();
  else load();
})();
