/**
 * Counsel AI — Auth (Phase A)
 *
 * - Wraps window.fetch to auto-attach Bearer token on /api/* calls.
 * - On 401: clears token, shows login overlay.
 * - Exposes login/register/logout for the overlay UI.
 *
 * IndexedDB session data is namespaced by user_id (see db.js in Phase B) so
 * switching account on the same browser gives you a fresh library.
 */
(function () {
  const TOKEN_KEY = 'counsel:token';
  const USER_KEY = 'counsel:user';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }
  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }
  function setAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  // fetch override: inject Authorization on /api/*, handle 401.
  const PUBLIC_PATHS = ['/api/auth/login', '/api/auth/register'];
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const isApi = url.startsWith('/api/') || url.startsWith(location.origin + '/api/');
    const isPublic = PUBLIC_PATHS.some((p) => url.includes(p));
    if (!isApi || isPublic) return originalFetch(input, init);
    init = init || {};
    const headers = new Headers(init.headers || {});
    const token = getToken();
    if (token) headers.set('Authorization', 'Bearer ' + token);
    init.headers = headers;
    const res = await originalFetch(input, init);
    if (res.status === 401) {
      clearAuth();
      showLoginOverlay();
      throw new Error('unauthorized');
    }
    return res;
  };

  async function login(username, password) {
    const r = await originalFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    setAuth(data.token, { user_id: data.user_id, username: data.username });
    return data;
  }
  async function register(username, password) {
    const r = await originalFetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    setAuth(data.token, { user_id: data.user_id, username: data.username });
    return data;
  }
  function logout() {
    clearAuth();
    location.reload();
  }

  // Minimal overlay; styled via style.css .auth-overlay
  function ensureOverlayDOM() {
    if (document.getElementById('auth-overlay')) return;
    const el = document.createElement('div');
    el.id = 'auth-overlay';
    el.className = 'auth-overlay';
    el.innerHTML = `
      <div class="auth-card">
        <h2>私董会</h2>
        <div class="auth-tabs">
          <button type="button" class="auth-tab on" data-mode="login">登录</button>
          <button type="button" class="auth-tab" data-mode="register">注册</button>
        </div>
        <form id="auth-form" class="auth-form">
          <label>用户名 / 邮箱
            <input id="auth-username" type="text" autocomplete="username" minlength="3" maxlength="128" required />
          </label>
          <label>密码
            <input id="auth-password" type="password" autocomplete="current-password" minlength="6" maxlength="128" required />
          </label>
          <div class="auth-error" id="auth-error"></div>
          <button type="submit" class="auth-submit" id="auth-submit">登录</button>
        </form>
        <p class="auth-hint">数据存在你本地浏览器 · 换设备/清缓存会丢 · 记得导出备份</p>
      </div>
    `;
    document.body.appendChild(el);
    let mode = 'login';
    el.querySelectorAll('.auth-tab').forEach((b) => {
      b.addEventListener('click', () => {
        mode = b.dataset.mode;
        el.querySelectorAll('.auth-tab').forEach((x) => x.classList.toggle('on', x === b));
        el.querySelector('#auth-submit').textContent = mode === 'login' ? '登录' : '注册';
        el.querySelector('#auth-error').textContent = '';
      });
    });
    el.querySelector('#auth-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const u = el.querySelector('#auth-username').value.trim();
      const p = el.querySelector('#auth-password').value;
      const errEl = el.querySelector('#auth-error');
      const btn = el.querySelector('#auth-submit');
      errEl.textContent = '';
      btn.disabled = true;
      btn.textContent = '...';
      try {
        if (mode === 'login') await login(u, p);
        else await register(u, p);
        hideLoginOverlay();
        location.reload();
      } catch (e) {
        errEl.textContent = e.message || '失败，请重试';
      } finally {
        btn.disabled = false;
        btn.textContent = mode === 'login' ? '登录' : '注册';
      }
    });
  }

  function showLoginOverlay() {
    ensureOverlayDOM();
    document.getElementById('auth-overlay').style.display = 'flex';
  }
  function hideLoginOverlay() {
    const el = document.getElementById('auth-overlay');
    if (el) el.style.display = 'none';
  }

  async function ensureAuth() {
    const token = getToken();
    if (!token) {
      showLoginOverlay();
      return false;
    }
    try {
      const r = await fetch('/api/auth/me');
      if (!r.ok) throw new Error('bad token');
      checkPersonaWishNotifs();
      checkFeedbackReplyNotifs();
      return true;
    } catch (_) {
      clearAuth();
      showLoginOverlay();
      return false;
    }
  }

  // ─── 幕僚许愿通知 banner（2026-04-27） ─────────────────────────────────
  async function checkPersonaWishNotifs() {
    try {
      const r = await fetch('/api/persona-wishes/notifications');
      if (!r.ok) return;
      const list = await r.json().catch(() => []);
      if (!Array.isArray(list) || list.length === 0) return;
      showWishBanner(list);
    } catch (_) { /* silent — non-blocking */ }
  }

  function showWishBanner(list) {
    if (document.getElementById('wish-notif-banner')) return;
    const names = list.map((w) => w.persona_name).filter(Boolean);
    if (names.length === 0) return;
    const text = names.length === 1
      ? `🎉 你许愿的「<b>${escapeHtml(names[0])}</b>」已加入幕僚团，去选人页面试试`
      : `🎉 你许愿的 ${names.length} 位幕僚（<b>${escapeHtml(names.slice(0, 2).join('、'))}</b>${names.length > 2 ? ' 等' : ''}）已加入，去选人页面试试`;
    const el = document.createElement('div');
    el.id = 'wish-notif-banner';
    el.innerHTML = `
      <div class="wb-text">${text}</div>
      <button type="button" class="wb-ack">我知道了</button>
    `;
    document.body.appendChild(el);
    el.querySelector('.wb-ack').addEventListener('click', async () => {
      el.style.opacity = '0.5';
      try {
        await fetch('/api/persona-wishes/notifications/seen', { method: 'POST' });
      } catch (_) { /* swallow */ }
      el.remove();
    });
  }

  // ─── Feedback reply notification banner（2026-04-28） ───────────────────
  async function checkFeedbackReplyNotifs() {
    try {
      const r = await fetch('/api/feedback/replies');
      if (!r.ok) return;
      const list = await r.json().catch(() => []);
      if (!Array.isArray(list) || list.length === 0) return;
      showFeedbackReplyBanner(list);
    } catch (_) { /* silent — non-blocking */ }
  }

  function showFeedbackReplyBanner(list) {
    if (document.getElementById('feedback-reply-banner')) return;
    const first = list[0];
    if (!first) return;
    const more = list.length > 1 ? `，另有 ${list.length - 1} 条` : '';
    const reply = escapeHtml(String(first.reply_body || '').slice(0, 180));
    const original = escapeHtml(String(first.feedback_body || '').slice(0, 80));
    const el = document.createElement('div');
    el.id = 'feedback-reply-banner';
    el.innerHTML = `
      <div class="frb-text">
        <b>你的反馈有回复${more}</b>
        <span class="frb-original">你说：${original || '—'}</span>
        <span class="frb-reply">${reply}</span>
      </div>
      <button type="button" class="frb-ack">我知道了</button>
    `;
    document.body.appendChild(el);
    el.querySelector('.frb-ack').addEventListener('click', async () => {
      el.style.opacity = '0.5';
      try {
        await fetch('/api/feedback/replies/seen', { method: 'POST' });
      } catch (_) { /* swallow */ }
      el.remove();
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  window.CounselAuth = {
    getToken,
    getUser,
    login,
    register,
    logout,
    ensureAuth,
    showLoginOverlay,
    hideLoginOverlay,
  };
})();
