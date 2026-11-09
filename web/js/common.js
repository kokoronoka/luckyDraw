/* Shared helpers for all pages. Exposes window.App. */
(function () {
  'use strict';

  const TZ = 'Asia/Kuala_Lumpur';
  const cfg = window.APP_CONFIG || {};
  const App = (window.App = {});

  App.configOk = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);

  // Practice/test environment banner (set ENV_LABEL in config.js). Makes it
  // impossible to mistake the practice project for the live one.
  if (cfg.ENV_LABEL) {
    const addBanner = () => {
      const b = document.createElement('div');
      b.className = 'env-banner';
      b.textContent = cfg.ENV_LABEL;
      document.body.appendChild(b);
    };
    if (document.body) addBanner(); else document.addEventListener('DOMContentLoaded', addBanner);
  }

  App.isLocalHost = function () {
    return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  };
  /** Set by the local login. Never accepted on a deployed host. */
  App.localAdminOn = function () {
    try { return App.isLocalHost() && sessionStorage.getItem('zv-local-admin') === '1'; }
    catch (_) { return false; }
  };
  App.localWalletOn = function () {
    if (!App.isLocalHost()) return false;
    const t = new URLSearchParams(location.search).get('t') || '';
    return t.startsWith('local-');
  };

  /** Create the Supabase client. Wallet uses { staff: false } (no session). */
  App.client = function ({ staff = true } = {}) {
    if ((staff && App.localAdminOn()) || (!staff && App.localWalletOn())) {
      if (typeof App.localClient !== 'function') {
        throw new Error('本地测试脚本未加载 / Local test script is missing');
      }
      App.sb = App.localClient();
      return App.sb;
    }
    if (!App.configOk) {
      throw new Error('缺少 js/config.js 设置 / Missing js/config.js (copy config.example.js)');
    }
    App.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: staff
        ? { persistSession: true, autoRefreshToken: true }
        : { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return App.sb;
  };

  /** Call an RPC; throws Error with a user-friendly (bilingual) message. */
  App.rpc = async function (name, args) {
    const { data, error } = await App.sb.rpc(name, args || {});
    if (error) throw new Error(App.errorText(error));
    return data;
  };

  App.errorText = function (err) {
    const msg = (err && (err.message || err.error_description || String(err))) || '';
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
      return '网络错误，请检查连接后重试 / Network error, please check your connection and retry';
    }
    if (/JWT expired|invalid JWT/i.test(msg)) {
      return '登录已过期，请重新登录 / Session expired, please log in again';
    }
    if (/permission denied|Not authorised/i.test(msg)) {
      return '没有权限 / Not authorised';
    }
    return App.localize(msg || '发生错误 / Something went wrong');
  };

  /** '中文 / English' server text → the active language. */
  App.lang = function () {
    return document.documentElement.dataset.lang === 'en' ? 'en' : 'zh';
  };
  App.localize = function (msg) {
    const s = String(msg || '');
    const i = s.indexOf(' / ');
    if (i < 1) return s;
    const zh = s.slice(0, i).trim();
    const en = s.slice(i + 3).trim();
    if (!zh || !en) return s;
    return App.lang() === 'en' ? en : zh;
  };
  App.pick = function (zh, en) { return App.lang() === 'en' ? en : zh; };
  App.say = function (zh, en, kind) { App.toast(App.pick(zh, en), kind); };
  App.bi = function (zh, en) {
    return `<span class="zh">${App.esc(zh)}</span><span class="en">${App.esc(en)}</span>`;
  };

  // ---------------------------------------------------------------- phone ----
  /** Same rules as SQL normalize_phone(): returns '60XXXXXXXXX' or ''. */
  App.normalizePhone = function (p) {
    const d = String(p || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('60')) return d;
    if (d.startsWith('0')) return '6' + d;
    return '60' + d;
  };
  App.isValidPhone = (p) => /^60\d{8,10}$/.test(p || '');
  /** '60123456789' → '012-345 6789' */
  App.formatPhone = function (p) {
    if (!App.isValidPhone(p)) return p || '';
    const local = '0' + p.slice(2);
    return local.slice(0, 3) + '-' + local.slice(3, local.length - 4) + ' ' + local.slice(-4);
  };

  // ---------------------------------------------------------------- dates ----
  const dtFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const dFmtISO = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /** Today's date in MYT as 'YYYY-MM-DD'. */
  App.todayMYT = () => dFmtISO.format(new Date());
  /** timestamptz → '24 Nov 2026, 23:59' (MYT). */
  App.fmtDateTime = (iso) => (iso ? dtFmt.format(new Date(iso)) : '');
  /** 'YYYY-MM-DD' → { zh: '11月25日', en: '25 Nov' } (no timezone shift). */
  App.fmtDate = function (d) {
    if (!d) return { zh: '', en: '' };
    const [y, m, day] = d.split('-').map(Number);
    return { zh: `${m}月${day}日`, en: `${day} ${MONTHS[m - 1]}`, enY: `${day} ${MONTHS[m - 1]} ${y}` };
  };
  /** timestamptz → { zh: '11月24日 23:59', en: '24 Nov, 23:59' } in MYT. */
  App.fmtDeadline = function (iso) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ, day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(new Date(iso)).map((p) => [p.type, p.value])
    );
    const hm = `${parts.hour}:${parts.minute}`;
    return { zh: `${+parts.month}月${+parts.day}日 ${hm}`, en: `${+parts.day} ${MONTHS[+parts.month - 1]}, ${hm}` };
  };

  /** Find the round whose purchase window contains dateStr. */
  App.roundForDate = (rounds, dateStr) =>
    (rounds || []).find((r) => dateStr >= r.purchase_start && dateStr <= r.purchase_end) || null;

  // ---------------------------------------------------------------- links ----
  App.walletUrl = function (token) {
    const base = cfg.WALLET_BASE_URL || new URL('wallet.html', window.location.href).href.split('?')[0];
    return `${base}?t=${encodeURIComponent(token)}`;
  };
  App.whatsappUrl = (phone, text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

  App.copy = async function (text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      ta.remove();
      return ok;
    }
  };

  // ------------------------------------------------------------------- UI ----
  App.esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  App.$ = (sel, root) => (root || document).querySelector(sel);
  App.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  let toastTimer;
  App.toast = function (msg, kind) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'toast show' + (kind ? ' toast-' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = 'toast'), 2600);
  };

  /** Disable a button and show a busy label while fn runs. */
  App.busy = async function (btn, fn, busyLabel) {
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    if (busyLabel) btn.innerHTML = busyLabel;
    try {
      return await fn();
    } finally {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.innerHTML = label;
    }
  };

  // ---------------------------------------------------------- staff auth ----
  /**
   * Ensure a logged-in, active staff member. Redirects to login otherwise.
   * Returns { profile, denied } — denied is true when admin is required but
   * the user is not an admin.
   */
  App.requireStaff = async function ({ admin = false } = {}) {
    const sb = App.sb;
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      window.location.replace('index.html');
      return null;
    }
    const { data: prof } = await sb.from('profiles')
      .select('id, email, full_name, role, active').eq('id', data.session.user.id).maybeSingle();
    if (!prof || !prof.active) {
      await sb.auth.signOut();
      window.location.replace('index.html');
      return null;
    }
    sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') window.location.replace('index.html');
    });
    return { profile: prof, denied: admin && prof.role !== 'admin' };
  };

  /** Top navigation links for admins (sales / admin / draw). */
  App.adminNav = function (active) {
    const links = [
      ['sales.html', '销售', 'Sales'],
      ['admin.html', '管理', 'Admin'],
      ['draw.html', '抽奖', 'Draw'],
    ];
    return links.map(([href, zh, en]) =>
      `<a href="${href}" class="${href.startsWith(active) ? 'active' : ''}">${zh} <span class="en">${en}</span></a>`).join('');
  };

  // ----------------------------------------------------------------- CSV ----
  /** rows: array of objects; columns: array of keys (defaults to first row's keys). */
  App.toCSV = function (rows, columns) {
    const cols = columns || (rows[0] ? Object.keys(rows[0]) : []);
    const cell = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
  };
  /** Download text as a file (UTF-8 with BOM so Excel shows Chinese correctly). */
  App.download = function (filename, text, type = 'text/csv') {
    const blob = new Blob(['﻿' + text], { type: type + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };

  // ------------------------------------------------------- MYT datetime ----
  /** ISO timestamptz → 'YYYY-MM-DDTHH:mm:ss' in MYT (for datetime-local inputs). */
  App.isoToMytLocal = function (iso) {
    if (!iso) return '';
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
    const hh = p.hour === '24' ? '00' : p.hour;
    return `${p.year}-${p.month}-${p.day}T${hh}:${p.minute}:${p.second}`;
  };
  /** datetime-local value interpreted as MYT → ISO with +08:00. */
  App.mytLocalToIso = function (v) {
    if (!v) return null;
    const withSec = v.length === 16 ? v + ':00' : v;
    return withSec + '+08:00';
  };

  /** Simple reason prompt using a <dialog id="reason-dialog"> on the page. */
  App.askReason = function (title) {
    const dlg = document.getElementById('reason-dialog');
    if (!dlg || typeof dlg.showModal !== 'function') {
      const r = window.prompt(title);
      return Promise.resolve(r && r.trim() ? r.trim() : null);
    }
    dlg.querySelector('.reason-title').innerHTML = title;
    const input = dlg.querySelector('textarea');
    input.value = '';
    return new Promise((resolve) => {
      dlg.addEventListener('close', () => {
        resolve(dlg.returnValue === 'ok' && input.value.trim() ? input.value.trim() : null);
      }, { once: true });
      dlg.returnValue = '';
      dlg.showModal();
      input.focus();
    });
  };

  App.SOURCE_LABEL = {
    purchase: { zh: '购买', en: 'Purchase' },
    topup: { zh: '加购', en: 'Top-up' },
    repeat_bonus: { zh: '回购奖励', en: 'Repeat bonus' },
    referral: { zh: '推荐奖励', en: 'Referral bonus' },
  };

  // ------------------------------------------------------- language toggle ----
  const LANG_KEY = 'zv-lang';
  const CJK = /[\u3400-\u9FFF]/;

  function tagBilingual(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const parents = new Set();
    scope.querySelectorAll('.en').forEach((en) => {
      if (en.parentElement) parents.add(en.parentElement);
    });
    parents.forEach((parent) => {
      if (parent.dataset.bi === '1') return;
      [...parent.childNodes].forEach((n) => {
        if (n.nodeType === 3 && CJK.test(n.textContent)) {
          const s = document.createElement('span');
          s.className = 'zh';
          s.textContent = n.textContent;
          parent.replaceChild(s, n);
        }
      });
      parent.dataset.bi = '1';
    });
  }

  function applyPlaceholders(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const lang = App.lang();
    scope.querySelectorAll('[data-ph-zh]').forEach((el) => {
      el.placeholder = lang === 'en' ? (el.dataset.phEn || '') : (el.dataset.phZh || '');
    });
  }

  function paintLangSwitch() {
    document.querySelectorAll('.lang-btn').forEach((btn) => {
      const on = btn.dataset.setLang === App.lang();
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  App.setLang = function (lang) {
    const next = lang === 'en' ? 'en' : 'zh';
    try { localStorage.setItem(LANG_KEY, next); } catch (_) { /* private mode */ }
    document.documentElement.dataset.lang = next;
    document.documentElement.lang = next === 'en' ? 'en' : 'zh-Hans';
    applyPlaceholders(document);
    paintLangSwitch();
    document.dispatchEvent(new CustomEvent('zv-lang', { detail: next }));
  };

  App.refreshI18n = function (root) {
    tagBilingual(root || document);
    applyPlaceholders(root || document);
    paintLangSwitch();
  };

  function mountLangSwitch() {
    if (document.querySelector('.lang-switch')) return;
    const host = document.querySelector('.topbar-user')
      || document.querySelector('.dtools')
      || document.querySelector('.hero-inner')
      || document.querySelector('.brand-block');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'lang-switch';
    el.setAttribute('role', 'group');
    el.innerHTML = '<button type="button" class="lang-btn" data-set-lang="zh">中文</button>'
      + '<button type="button" class="lang-btn" data-set-lang="en">EN</button>';
    if (host.classList.contains('topbar-user') || host.classList.contains('dtools')) host.prepend(el);
    else host.appendChild(el);
    paintLangSwitch();
  }

  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-set-lang]');
    if (!btn) return;
    ev.preventDefault();
    App.setLang(btn.dataset.setLang);
  });

  function bootLang() {
    App.refreshI18n(document);
    mountLangSwitch();
    let tagging = false;
    const obs = new MutationObserver(() => {
      if (tagging) return;
      tagging = true;
      App.refreshI18n(document);
      tagging = false;
    });
    if (document.body) obs.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootLang);
  else bootLang();
})();
