/* Staff login (index.html) */
(function () {
  'use strict';
  const { $ } = App;
  const errEl = $('#login-error');
  const showErr = (m) => { errEl.textContent = m; errEl.hidden = !m; };

  if (App.localAdminOn()) {
    window.location.replace('admin.html');
    return;
  }

  if (App.isLocalHost()) {
    const note = document.createElement('p');
    note.className = 'muted small center';
    note.innerHTML = '<span class="zh">本地测试，不连接数据库。</span> <span class="en">Local test, no database.</span><br>'
      + '<b>admin@local.test</b><br><span class="zh">密码</span> <span class="en">Password</span> <b>local123</b>';
    $('#login-form').insertAdjacentElement('beforebegin', note);
    $('#email').value = 'admin@local.test';
    $('#password').value = 'local123';
  }

  let sb = null;
  try {
    sb = App.client({ staff: true });
  } catch (e) {
    if (!App.isLocalHost()) {
      showErr(e.message);
      $('#login-btn').disabled = true;
      return;
    }
  }

  /** Returns the active profile, or signs out and throws. */
  async function loadProfile(userId) {
    const { data, error } = await sb.from('profiles').select('role, active').eq('id', userId).maybeSingle();
    if (error) throw new Error(App.errorText(error));
    if (!data || !data.active) {
      await sb.auth.signOut();
      throw new Error('此账号未启用，请联系管理员 / This account is not active. Please contact an admin.');
    }
    return data;
  }

  function goHome(profile) {
    window.location.replace(profile && profile.role === 'admin' ? 'admin.html' : 'sales.html');
  }

  // On this computer the local admin is the account to try. A saved
  // practice-database session would otherwise skip the login form.
  if (sb && !App.isLocalHost()) {
    sb.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        try { goHome(await loadProfile(data.session.user.id)); } catch (e) { showErr(e.message); }
      }
    });
  }

  $('#login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    showErr('');
    const email = $('#email').value.trim();
    const password = $('#password').value;
    if (!email || !password) return showErr('请输入电邮和密码 / Enter your email and password');

    await App.busy($('#login-btn'), async () => {
      if (App.isLocalHost() && email.toLowerCase() === 'admin@local.test' && password === 'local123') {
        sessionStorage.setItem('zv-local-admin', '1');
        goHome({ role: 'admin' });
        return;
      }
      if (!sb) return showErr('缺少 js/config.js 设置 / Missing js/config.js (copy config.example.js)');
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        showErr(/invalid/i.test(error.message)
          ? '电邮或密码错误 / Wrong email or password'
          : App.errorText(error));
        return;
      }
      try { goHome(await loadProfile(data.user.id)); } catch (e) { showErr(e.message); }
    }, '登录中… <span class="en">Logging in…</span>');
  });
})();
