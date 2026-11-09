/* Projector (draw.html). The Golden Ticket drum is the picture.
   draw_stage supplies one entry per allocated ticket. draw_winner picks
   the winner and the existing trigger issues the lucky-draw voucher. */
(function () {
  'use strict';
  const { $, esc } = App;

  const state = {
    rounds: [],
    cats: [],
    catId: null,
    stage: null,
    payload: null,
    spinning: false,
    pendingWinner: null,
  };

  let sb;
  try { sb = App.client({ staff: true }); } catch (e) { document.body.textContent = e.message; return; }

  const RANK_ICON = { 1: '👑', 2: '🥈', 3: '🥉', 4: '🎁' };

  (async function boot() {
    const auth = await App.requireStaff({ admin: true });
    if (!auth) return;
    if (auth.denied) { $('#denied').hidden = false; return; }
    $('#app').hidden = false;
    if (window.ZellDrawMount && document.querySelector('.dtools')) App.refreshI18n(document);

    const [{ data: rounds }, { data: cats }] = await Promise.all([
      sb.from('rounds').select('*').order('id'),
      sb.from('prize_categories').select('*').order('rank'),
    ]);
    state.rounds = rounds || [];
    state.cats = cats || [];

    const fromHash = Number((location.hash.match(/c=(\d+)/) || [])[1]);
    const today = App.todayMYT();
    const nextRound = state.rounds.find((r) => r.draw_date >= today) || state.rounds[0];
    const firstCat = state.cats.find((c) => c.id === fromHash)
      || state.cats.find((c) => nextRound && c.round_id === nextRound.id && c.rank === 4)
      || state.cats[0];
    if (firstCat) await selectCategory(firstCat.id);
    else $('#stage-msg').textContent = App.pick('没有奖项', 'No prizes');
  })();

  function lockMessage(payload) {
    if (!payload) return '';
    if (payload.blocked_reason) return App.localize(payload.blocked_reason);
    const slots = payload.prizes && payload.prizes[0] ? payload.prizes[0].count : 0;
    const filled = payload.filled || 0;
    if ((payload.entries || []).length === 0 && filled < slots) {
      if (filled > 0) return App.pick('没有其他符合资格的顾客', 'No one else can win this prize');
      return App.pick('此奖项没有已分配的抽奖券', 'No allocated tickets for this prize');
    }
    return '';
  }

  function withLock(payload) {
    return Object.assign({}, payload, { locked: lockMessage(payload) });
  }

  async function selectCategory(id) {
    if (state.spinning) return;
    state.catId = id;
    history.replaceState(null, '', '#c=' + id);
    renderChips();
    let payload;
    try {
      payload = await App.rpc('draw_stage', { p_category_id: id });
    } catch (e) {
      const msg = $('#stage-msg');
      if (msg) { msg.hidden = false; msg.textContent = e.message; }
      else App.toast(e.message, 'error');
      return;
    }
    state.payload = payload;
    const data = withLock(payload);
    const msg = $('#stage-msg');
    if (msg) msg.hidden = true;
    if (!state.stage) {
      const host = $('#stage');
      host.querySelector('#stage-msg').hidden = true;
      state.stage = window.ZellDrawMount(host, {
        data,
        lang: App.lang() === 'en' ? 'en' : 'zh',
        mode: 'host',
        demo: false,
        sound: true,
        single: true,
        onePerCustomer: false,
        assets: {
          ticketFace: 'draw/assets/ticket-face.png',
          ticketCard: 'draw/assets/ticket-card.png',
          logoEn: 'draw/assets/logo-en.png',
          logoZh: 'draw/assets/logo-zh.png',
        },
        pick: pickWinner,
        onDrawn: afterDraw,
        onError: onDrawError,
      });
    } else {
      await state.stage.load(data);
    }
    renderForfeit();
  }

  async function pickWinner() {
    state.spinning = true;
    renderChips();
    const res = await App.rpc('draw_winner', { p_category_id: state.catId });
    state.pendingWinner = res.winner;
    return {
      t: 'W' + res.winner.id,
      n: res.winner.name_masked,
      p: res.winner.phone_masked,
      c: 'w' + res.winner.id,
    };
  }

  function afterDraw() {
    const w = state.pendingWinner;
    state.pendingWinner = null;
    state.spinning = false;
    if (w && state.payload) {
      state.payload.filled = (state.payload.filled || 0) + 1;
      state.payload.admin_winners = state.payload.admin_winners || [];
      state.payload.admin_winners.push({
        id: w.id, status: 'won', name: w.name, phone_masked: w.phone_masked, forfeit_reason: '',
      });
    }
    renderChips();
    renderForfeit();
    App.say('礼券已开给得奖者', 'Voucher issued to the winner', 'ok');
  }

  function onDrawError(err) {
    state.spinning = false;
    state.pendingWinner = null;
    renderChips();
    const msg = (err && err.message) || String(err);
    App.toast(msg, 'error');
    if (state.stage && /eligible|符合资格/.test(msg)) state.stage.setLocked(App.localize(msg));
  }

  function renderChips() {
    const cat = state.cats.find((c) => String(c.id) === String(state.catId));
    const activeRound = cat ? (cat.is_grand ? 'grand' : cat.round_id) : null;
    $('#round-chips').innerHTML = state.rounds.map((r) =>
      `<button type="button" class="dchip ${activeRound === r.id ? 'active' : ''}" data-round="${r.id}" ${state.spinning ? 'disabled' : ''}>${esc(r.code)}</button>`
    ).join('') + `<button type="button" class="dchip ${activeRound === 'grand' ? 'active' : ''}" data-round="grand" ${state.spinning ? 'disabled' : ''}>👑 <span class="zh">总决赛</span><span class="en">Grand</span></button>`;

    const list = activeRound === 'grand'
      ? state.cats.filter((c) => c.is_grand)
      : state.cats.filter((c) => c.round_id === activeRound).sort((a, b) => b.rank - a.rank);
    $('#cat-chips').innerHTML = list.map((c) =>
      `<button type="button" class="dchip ${String(c.id) === String(state.catId) ? 'active' : ''}" data-cat="${c.id}" ${state.spinning ? 'disabled' : ''}>${RANK_ICON[c.rank] || ''} <span class="zh">${esc(c.name_zh)}</span><span class="en">${esc(c.name_en)}</span></button>`
    ).join('');
    App.refreshI18n($('#app'));
  }

  $('#round-chips').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-round]');
    if (!b || state.spinning) return;
    const key = b.dataset.round;
    const cat = key === 'grand'
      ? state.cats.find((c) => c.is_grand)
      : state.cats.filter((c) => String(c.round_id) === String(key)).sort((a, z) => bRank(z) - bRank(a))[0];
    if (cat) selectCategory(cat.id);
  });
  const bRank = (c) => c.rank;
  $('#cat-chips').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-cat]');
    if (b && !state.spinning) selectCategory(Number(b.dataset.cat));
  });

  function renderForfeit() {
    const pop = $('#forfeit-pop');
    const won = ((state.payload && state.payload.admin_winners) || []).filter((w) => w.status === 'won');
    if (!won.length) {
      pop.innerHTML = `<p class="small muted">${App.pick('还没有得奖者', 'No winners yet')}</p>`;
      return;
    }
    pop.innerHTML = won.map((w) =>
      `<button type="button" class="dchip" data-forfeit="${w.id}">${esc(w.name)} · ${esc(w.phone_masked || '')}</button>`
    ).join('');
  }

  $('#forfeit-btn').addEventListener('click', () => {
    const pop = $('#forfeit-pop');
    pop.hidden = !pop.hidden;
  });
  $('#forfeit-pop').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-forfeit]');
    if (!b || state.spinning) return;
    const w = (state.payload.admin_winners || []).find((x) => String(x.id) === b.dataset.forfeit);
    if (!w) return;
    $('#forfeit-pop').hidden = true;
    const reason = await App.askReason(
      `标记 ${esc(w.name)} 为放弃？此奖项可以重抽，礼券会作废。<br><span class="en">Mark ${esc(w.name)} as forfeited? The slot can be redrawn and the voucher is voided.</span>`);
    if (!reason) return;
    try {
      await App.rpc('mark_forfeited', { p_winner_id: Number(w.id), p_reason: reason });
      App.say('已标记放弃，可重抽', 'Forfeited — ready to redraw', 'ok');
      await selectCategory(state.catId);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (document.querySelector('dialog[open]')) return;
    if (ev.target.matches('input, textarea, select')) return;
    if ((ev.key === ' ' || ev.key === 'Enter') && state.stage && !state.spinning) {
      ev.preventDefault();
      state.stage.draw();
    }
    if (ev.key === 'f' || ev.key === 'F') toggleFullscreen();
  });

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  }
  $('#fs-btn').addEventListener('click', toggleFullscreen);

  document.addEventListener('zv-lang', () => {
    if (state.stage) state.stage.setLang(App.lang());
    if (state.payload) renderForfeit();
  });
})();
