/**
 * Counsel Admin Dashboard — minimal SPA.
 * Reads /api/admin/* with a Bearer token (uses the same auth flow as the
 * main app). If the user isn't an admin, the API returns 403 and we surface
 * a friendly message.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const win = $('adm-window');
  const refreshBtn = $('adm-refresh');
  const errEl = $('adm-error');

  function showError(msg) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }
  function clearError() {
    errEl.style.display = 'none';
  }

  function token() {
    return localStorage.getItem('counsel:token') || '';
  }

  async function api(path, options) {
    const t = token();
    if (!t) {
      showError('未登录。请先回主站登录后再访问 /admin。');
      throw new Error('no token');
    }
    const init = options || {};
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', 'Bearer ' + t);
    const r = await fetch(path, { ...init, headers });
    if (r.status === 401) {
      showError('登录已过期，请重新登录。');
      throw new Error('unauthorized');
    }
    if (r.status === 403) {
      const j = await r.json().catch(() => ({}));
      const hint = j.hint
        ? `\n${j.hint}`
        : '\n（用户名需要在服务器的 COUNSEL_ADMIN_USERNAMES 环境变量里。）';
      showError(`没有管理员权限。${hint}`);
      throw new Error('not admin');
    }
    if (!r.ok) {
      showError(`接口错误 (${r.status})：${path}`);
      throw new Error('http ' + r.status);
    }
    return r.json();
  }

  async function postJson(path, payload) {
    return api(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
  }

  function fmtPct(n) {
    return (n * 100).toFixed(1) + '%';
  }
  function fmtMs(ms) {
    if (ms == null) return '—';
    if (ms < 1000) return ms + ' ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + ' s';
    return (ms / 60000).toFixed(1) + ' min';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
    );
  }
  function fmtExactTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso || '—';
      return d.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour12: false,
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' CST';
    } catch {
      return iso || '—';
    }
  }
  function fmtTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso || '—';
      const now = new Date();
      const diffMs = now - d;
      const diffMin = Math.round(diffMs / 60000);
      if (diffMin < 1) return '刚刚 · ' + fmtExactTime(iso);
      if (diffMin < 60) return diffMin + ' 分钟前 · ' + fmtExactTime(iso);
      const diffHr = Math.round(diffMin / 60);
      if (diffHr < 24) return diffHr + ' 小时前 · ' + fmtExactTime(iso);
      return fmtExactTime(iso);
    } catch {
      return iso || '—';
    }
  }

  async function loadOverview(days) {
    const o = await api('/api/admin/overview?days=' + days);
    $('kpi-users').querySelector('.kpi-v').textContent = o.users_active_window;
    $('kpi-users').querySelector('.kpi-x').textContent = o.users_total;
    $('kpi-sessions').querySelector('.kpi-v').textContent = o.sessions_window;
    $('kpi-sessions').querySelector('.kpi-x').textContent = o.sessions_total;
    $('kpi-completion').querySelector('.kpi-v').textContent = fmtPct(o.completion_rate_window);
    $('kpi-completion').querySelector('.kpi-s').textContent =
      `${o.completed_window} / ${o.sessions_window}（${o.window_days} 天）`;
    $('kpi-feedback').querySelector('.kpi-v').textContent = o.feedback_window;
    $('kpi-feedback').querySelector('.kpi-x').textContent = o.feedback_total;
  }

  const STEP_LABELS = {
    1: '输入',
    2: '锁定',
    3: '挖事实',
    4: '幕僚发言',
    5: '拆维度',
    6: '辩论',
    7: '汇总',
    8: '摘果子',
  };

  async function loadFunnel(days) {
    const rows = await api('/api/admin/funnel?days=' + days);
    const max = Math.max(1, ...rows.map((r) => r.sessions_entered));
    const html = rows
      .map((r) => {
        const pct = (r.sessions_entered / max) * 100;
        const donePct = r.sessions_entered > 0 ? (r.sessions_completed / r.sessions_entered) * 100 : 0;
        return `
        <div class="funnel-bar">
          <div class="funnel-bar-label">第 ${r.step} 步 ${esc(STEP_LABELS[r.step] || '')}</div>
          <div class="funnel-bar-track" title="进入 ${r.sessions_entered} · 完成 ${r.sessions_completed}">
            <div class="funnel-bar-fill" style="width:${pct}%"></div>
            <div class="funnel-bar-fill done" style="width:${(pct * donePct) / 100}%;position:absolute;top:0;left:0"></div>
          </div>
          <div class="funnel-bar-num">进入 ${r.sessions_entered} · 完成 ${r.sessions_completed} · 中位 ${fmtMs(r.median_duration_ms)}</div>
        </div>`;
      })
      .join('');
    $('funnel-chart').innerHTML = html;
  }

  function renderDevicePart(label, mapping, total) {
    const sorted = Object.entries(mapping).sort((a, b) => b[1] - a[1]);
    const rows = sorted
      .map(([k, v]) => {
        const pct = total > 0 ? (v / total) * 100 : 0;
        return `<div class="dev-row">
          <div class="dev-row-l">${esc(k)}</div>
          <div class="dev-row-bar" style="width:${Math.min(160, pct * 1.6)}px"></div>
          <div class="dev-row-n">${v}</div>
        </div>`;
      })
      .join('');
    return `<div class="dev-section"><div class="dev-section-h">${label}</div>${rows || '<div class="dev-row-l" style="color:var(--muted)">—</div>'}</div>`;
  }

  // F5 (2026-04-26) — question-category distribution
  async function loadCategories(days) {
    const target = $('category-chart');
    if (!target) return;
    const rows = await api('/api/admin/categories?days=' + days);
    if (!rows || !rows.length) {
      target.innerHTML = '<div class="dev-row-l" style="color:var(--muted);padding:10px 0">暂无类目数据（需要至少 1 个被分类的 Step 1 提交）</div>';
      return;
    }
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    const max = Math.max(1, ...rows.map((r) => r.count));
    const html = rows.map((r) => {
      const pct = (r.count / max) * 100;
      const sharePct = total > 0 ? Math.round((r.count / total) * 100) : 0;
      return `<div class="funnel-bar">
        <div class="funnel-bar-label">${esc(r.category)}</div>
        <div class="funnel-bar-track">
          <div class="funnel-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="funnel-bar-num">${r.count} · ${sharePct}%</div>
      </div>`;
    }).join('');
    target.innerHTML = html + `<div class="dev-row-l" style="color:var(--muted);font-size:11.5px;margin-top:6px">合计 ${total} 条；窗口 ${days} 天</div>`;
  }

  async function loadDevices(days) {
    const d = await api('/api/admin/devices?days=' + days);
    const html =
      renderDevicePart('浏览器', d.browsers, d.total) +
      renderDevicePart('系统', d.os, d.total) +
      renderDevicePart('设备', d.device_class, d.total) +
      `<div class="dev-section">
        <div class="dev-section-h">微信内置浏览器</div>
        <div class="dev-row"><div class="dev-row-l">微信 webview</div><div class="dev-row-n">${d.wechat_count}</div></div>
      </div>`;
    $('device-summary').innerHTML = html;
  }

  function feedbackContextText(r) {
    const ctx = r.context || {};
    const sid = ctx.session_id ? String(ctx.session_id) : '';
    const pid = ctx.project_id ? String(ctx.project_id) : '';
    const parts = [];
    if (ctx.step != null) parts.push(`step ${ctx.step}`);
    if (sid) parts.push(`sid ${sid.slice(0, 10)}…`);
    if (pid) parts.push(`pid ${pid.slice(0, 10)}…`);
    return parts.length ? parts.join(' · ') : '无上下文';
  }

  function renderFeedbackItem(r, opts) {
    const showUser = !opts || opts.showUser !== false;
    const username = r.username || (r.user_id ? r.user_id.slice(0, 8) + '…' : '未知用户');
    const userHtml = showUser && r.user_id
      ? `<a class="adm-list-item-u" href="#user/${encodeURIComponent(r.user_id)}">${esc(username)}</a>`
      : `<span class="adm-list-item-u">${esc(username)}</span>`;
    const replies = Array.isArray(r.replies) ? r.replies : [];
    const repliesHtml = replies.length
      ? `<div class="fb-replies">${replies.map((reply) => `
          <div class="fb-reply">
            <div class="fb-reply-meta">${esc(reply.admin_username || 'admin')} · ${fmtTime(reply.created_at)} · ${reply.notified_at ? '用户已读' : '待用户看到'}</div>
            <div class="fb-reply-body">${esc(reply.body)}</div>
          </div>
        `).join('')}</div>`
      : '<div class="fb-replies empty">暂无回复</div>';
    return `<div class="adm-list-item feedback-item" data-feedback-id="${esc(r.id)}">
      <div class="adm-list-item-h">
        <span>${userHtml} <span class="fb-id">#${esc(r.id)}</span></span>
        <span class="adm-list-item-t">${fmtTime(r.created_at)}</span>
      </div>
      <div class="adm-list-item-b">${esc(r.body)}</div>
      <div class="adm-list-item-c">${esc(feedbackContextText(r))}</div>
      ${repliesHtml}
      <form class="fb-reply-form" data-feedback-id="${esc(r.id)}">
        <textarea class="fb-reply-text" rows="2" placeholder="回复给用户；用户下次打开会看到通知"></textarea>
        <button type="submit">回复</button>
      </form>
    </div>`;
  }

  function bindFeedbackReplyForms(root, afterSend) {
    root.querySelectorAll('.fb-reply-form').forEach((form) => {
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const id = form.getAttribute('data-feedback-id');
        const text = form.querySelector('.fb-reply-text');
        const btn = form.querySelector('button');
        const body = (text && text.value || '').trim();
        if (!id || !body) return;
        btn.disabled = true;
        btn.textContent = '发送中…';
        try {
          await postJson(`/api/admin/feedback/${encodeURIComponent(id)}/replies`, { body });
          text.value = '';
          if (afterSend) await afterSend();
        } catch (e) {
          alert('回复失败：' + (e.message || e));
        } finally {
          btn.disabled = false;
          btn.textContent = '回复';
        }
      });
    });
  }

  async function loadFeedback() {
    const rows = await api('/api/admin/feedback');
    $('fb-count').textContent = rows.length;
    if (rows.length === 0) {
      $('fb-list').innerHTML = '<div class="adm-list-item" style="color:var(--muted)">暂无反馈</div>';
      return;
    }
    $('fb-list').innerHTML = rows.map((r) => renderFeedbackItem(r, { showUser: true })).join('');
    bindFeedbackReplyForms($('fb-list'), loadFeedback);
  }

  async function loadPersonaWishes() {
    const rows = await api('/api/admin/persona-wishes');
    $('wish-count').textContent = rows.length;
    if (rows.length === 0) {
      $('wish-list').innerHTML = '<div class="adm-list-item" style="color:var(--muted)">暂无许愿</div>';
      return;
    }
    $('wish-list').innerHTML = rows
      .map((r) => {
        const isPending = r.status === 'pending';
        const statusBadge = isPending
          ? '<span style="color:#c9a050">⏳ pending</span>'
          : '<span style="color:#2a8c4a">✓ fulfilled</span>';
        const fulfillBtn = isPending
          ? `<button type="button" class="wish-fulfill-btn" data-wish-id="${r.id}"
              style="padding:4px 10px;font-size:11px;border:1px solid #2a8c4a;background:#fff;color:#2a8c4a;border-radius:4px;cursor:pointer">✓ 已实现</button>`
          : '';
        return `<div class="adm-list-item" data-wish-row="${r.id}">
          <div class="adm-list-item-h">
            <span class="adm-list-item-u">${esc(r.username || (r.user_id || '').slice(0, 8))}</span>
            <span class="adm-list-item-t">${fmtTime(r.created_at)}</span>
          </div>
          <div class="adm-list-item-b" style="display:flex;align-items:center;gap:12px;justify-content:space-between">
            <span><b>${esc(r.persona_name)}</b> · ${statusBadge}</span>
            ${fulfillBtn}
          </div>
        </div>`;
      })
      .join('');
    $('wish-list').querySelectorAll('.wish-fulfill-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-wish-id');
        if (!id) return;
        if (!confirm(`标记许愿 #${id} 为「已实现」？案主下次进站会看到 banner。`)) return;
        btn.disabled = true;
        btn.textContent = '...';
        try {
          const r = await fetch(`/api/admin/persona-wishes/${id}/fulfill`, { method: 'POST' });
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.error || ('HTTP ' + r.status));
          }
          await loadPersonaWishes();
        } catch (e) {
          btn.disabled = false;
          btn.textContent = '✓ 已实现';
          alert('标记失败：' + (e.message || e));
        }
      });
    });
  }

  async function loadGeo(days) {
    const rows = await api('/api/admin/geography?days=' + days);
    if (rows.length === 0) {
      $('geo-list').innerHTML = '<div class="adm-list-item" style="color:var(--muted)">暂无 IP 数据</div>';
      return;
    }
    $('geo-list').innerHTML = rows
      .map((r) => {
        return `<div class="adm-list-item">
          <div class="adm-list-item-h">
            <span class="adm-list-item-u adm-mono">${esc(r.ip)}</span>
            <span class="adm-list-item-t">${r.events} 次 · ${fmtTime(r.last_seen)}</span>
          </div>
          <div class="adm-list-item-c"><a href="https://ipinfo.io/${esc(r.ip)}" target="_blank" rel="noopener" style="color:var(--accent)">在 ipinfo.io 查看 →</a></div>
        </div>`;
      })
      .join('');
  }

  async function loadRecent() {
    const rows = await api('/api/admin/recent');
    if (rows.length === 0) {
      $('recent-events').innerHTML = '<div class="adm-list-item" style="color:var(--muted)">暂无事件</div>';
      return;
    }
    $('recent-events').innerHTML = rows
      .slice(0, 80)
      .map((r) => {
        const dataPreview = JSON.stringify(r.event_data).slice(0, 180);
        return `<div class="adm-list-item">
          <div class="adm-list-item-h">
            <span class="adm-list-item-u">${esc(r.event_type)}</span>
            <span class="adm-list-item-t">${esc(r.username || r.user_id.slice(0, 8))} · ${fmtTime(r.server_ts)}</span>
          </div>
          <div class="adm-list-item-c">${esc(dataPreview)}</div>
        </div>`;
      })
      .join('');
  }

  async function loadOperatorSummary() {
    const target = $('operator-summary');
    if (!target) return;
    const data = await api('/api/admin/operator');
    const totals = data.totals || {};
    const accounts = data.accounts || [];
    const accountRows = accounts.length
      ? accounts.map((u) => `<a class="operator-account" href="#user/${encodeURIComponent(u.user_id)}">
          <span class="operator-name">${esc(u.username)}</span>
          <span>${fmtTime(u.last_seen)}</span>
          <span>会话 ${u.sessions_started} / 完成 ${u.sessions_completed}</span>
          <span>反馈 ${u.feedback_count}</span>
        </a>`).join('')
      : '<div class="adm-list-item" style="color:var(--muted)">未找到 Michael / 1136333527 账号</div>';
    target.innerHTML = `
      <div class="operator-kpis">
        <div><b>${totals.accounts ?? 0}</b><span>账号</span></div>
        <div><b>${totals.sessions_started ?? 0}</b><span>会话</span></div>
        <div><b>${totals.sessions_completed ?? 0}</b><span>完成</span></div>
        <div><b>${fmtMs(totals.total_time_ms || 0)}</b><span>总时长</span></div>
        <div><b>${fmtTime(totals.last_seen)}</b><span>最近活跃</span></div>
      </div>
      <div class="operator-note">${esc(data.note || '')}</div>
      <div class="operator-accounts">${accountRows}</div>
    `;
  }

  async function loadUsers() {
    const rows = await api('/api/admin/users?days=' + (parseInt(win.value, 10) || 30));
    $('users-count').textContent = rows.length;
    if (rows.length === 0) {
      $('users-table').innerHTML = '<div class="adm-list-item" style="color:var(--muted)">暂无用户</div>';
      return;
    }
    const headers = '<div class="users-row users-head">' +
      '<div>用户名</div><div>上次活跃</div><div>会话</div><div>完成</div>' +
      '<div>最远</div><div>总时长</div><div>反馈</div><div>设备</div>' +
      '</div>';
    const body = rows.map(r => {
      const dev = (r.last_browser ? r.last_browser : '—') + (r.is_wechat ? ' · 微信' : '');
      const reachedClass = r.last_step_reached === 8 ? 'users-reached-done' : '';
      return `<a class="users-row" href="#user/${esc(r.user_id)}" data-uid="${esc(r.user_id)}">` +
        `<div class="users-name">${esc(r.username)}${r.is_admin ? ' <span class="users-admin">★</span>' : ''}</div>` +
        `<div>${fmtTime(r.last_seen)}</div>` +
        `<div>${r.sessions_started}</div>` +
        `<div>${r.sessions_completed}</div>` +
        `<div class="${reachedClass}">${r.last_step_reached ?? '—'}</div>` +
        `<div>${fmtMs(r.total_time_ms)}</div>` +
        `<div>${r.feedback_count}</div>` +
        `<div class="users-dev">${esc(dev)}</div>` +
      `</a>`;
    }).join('');
    $('users-table').innerHTML = headers + body;
  }

  // ─── Per-user detail view ─────────────────────────────────────────────
  async function loadUserDetail(uid) {
    const errEl = $('user-error');
    errEl.style.display = 'none';
    let detail;
    try {
      detail = await api('/api/admin/users/' + encodeURIComponent(uid));
    } catch (e) {
      return;
    }
    if (!detail || !detail.user) {
      errEl.textContent = '用户不存在或返回为空';
      errEl.style.display = 'block';
      return;
    }
    const u = detail.user;
    const adminMark = u.is_admin ? ' <span class="users-admin">★ admin</span>' : '';
    $('user-header').innerHTML = `<span class="user-handle">👤 ${esc(u.username)}</span>${adminMark} <span class="user-id-mono">${esc(uid.slice(0, 8))}…</span>`;

    // KPI grid
    const dropDist = detail.drop_step_distribution || {};
    const dropEntries = Object.entries(dropDist).sort((a, b) => b[1] - a[1]);
    const dropTop = dropEntries.length ? `第 ${dropEntries[0][0]} 步（${dropEntries[0][1]} 次）` : '—';
    const kpis = [
      { l: '会话数', v: u.sessions_started, s: '完成 ' + u.sessions_completed },
      { l: '最远到达', v: u.last_step_reached ?? '—', s: '总事件 ' + u.events_total },
      { l: '总时长', v: fmtMs(u.total_time_ms), s: '中位单步 ' + fmtMs(detail.median_step_duration_ms) },
      { l: '反馈条数', v: u.feedback_count, s: 'IP 数 ' + detail.unique_ips },
      { l: '常见 drop', v: dropTop, s: '注册于 ' + new Date(u.created_at).toLocaleDateString('zh-CN') },
      { l: '上次活跃', v: fmtTime(u.last_seen), s: (u.last_browser || '—') + (u.is_wechat ? ' · 微信' : '') + ' / ' + (u.last_os || '—') },
    ];
    $('user-kpis').innerHTML = kpis.map(k =>
      `<div class="kpi"><div class="kpi-l">${esc(k.l)}</div><div class="kpi-v">${esc(String(k.v))}</div><div class="kpi-s">${esc(k.s)}</div></div>`
    ).join('');

    // Events timeline
    const events = detail.events || [];
    $('user-events-count').textContent = events.length;
    if (events.length === 0) {
      $('user-events').innerHTML = '<div class="adm-list-item" style="color:var(--muted)">暂无事件</div>';
    } else {
      $('user-events').innerHTML = events.map(ev => {
        const data = JSON.stringify(ev.event_data).slice(0, 240);
        return `<div class="adm-list-item">
          <div class="adm-list-item-h">
            <span class="adm-list-item-u">${esc(ev.event_type)}</span>
            <span class="adm-list-item-t">${fmtTime(ev.server_ts)}</span>
          </div>
          <div class="adm-list-item-c">${esc(data)}</div>
        </div>`;
      }).join('');
    }

    // Feedback
    const fb = detail.feedback || [];
    $('user-fb-count').textContent = fb.length;
    if (fb.length === 0) {
      $('user-feedback').innerHTML = '<div class="adm-list-item" style="color:var(--muted)">暂无反馈</div>';
    } else {
      $('user-feedback').innerHTML = fb.map(r => renderFeedbackItem(r, { showUser: false })).join('');
      bindFeedbackReplyForms($('user-feedback'), () => loadUserDetail(uid));
    }
  }

  // ─── Hash router ──────────────────────────────────────────────────────
  function showOverview() {
    $('view-overview').style.display = '';
    $('view-user').style.display = 'none';
  }
  function showUser(uid) {
    $('view-overview').style.display = 'none';
    $('view-user').style.display = '';
    loadUserDetail(uid);
  }

  function applyRoute() {
    const h = (location.hash || '').replace(/^#/, '');
    const m = h.match(/^user\/(.+)$/);
    if (m) {
      showUser(decodeURIComponent(m[1]));
    } else {
      showOverview();
    }
  }
  window.addEventListener('hashchange', applyRoute);
  $('user-back').onclick = (e) => { e.preventDefault(); history.pushState({}, '', '#'); applyRoute(); };

  // ─── §3.9 chat-mode dashboards (admin) ────────────────────────────────────
  // Each loader is best-effort; missing element = silently skip so this code
  // also works on older HTML cuts (e.g. before the chat sections were added).
  function _q(id) { return document.getElementById(id); }
  function _kpiCard(label, value, sub) {
    return `<div class="kpi" style="display:inline-block;margin:0 18px 8px 0;min-width:120px">
      <div class="kpi-l">${esc(label)}</div>
      <div class="kpi-v">${esc(String(value))}</div>
      ${sub ? `<div class="kpi-s">${esc(sub)}</div>` : ''}
    </div>`;
  }
  async function loadChatOverview(days) {
    const target = _q('chat-overview'); if (!target) return;
    try {
      const o = await api('/api/admin/chat/overview?days=' + days);
      target.innerHTML =
        _kpiCard('建群数', o.rooms_created, `近 ${o.window_days} 天`) +
        _kpiCard('活跃群（有发言）', o.rooms_active) +
        _kpiCard('用户消息总数', o.messages_total) +
        _kpiCard('幕僚回复数', o.persona_replies_total) +
        _kpiCard('活跃案主数', o.users_active);
    } catch (e) {
      target.innerHTML = `<div class="dev-row-l" style="color:var(--muted)">— 暂无数据</div>`;
    }
  }
  async function loadChatTopics(days) {
    const target = _q('chat-topics-chart'); if (!target) return;
    try {
      const rows = await api('/api/admin/chat/topics?days=' + days);
      if (!rows || !rows.length) {
        target.innerHTML = '<div class="dev-row-l" style="color:var(--muted)">暂无话题分类（需要至少 1 个群聊首条消息触发分类器）</div>';
        return;
      }
      const total = rows.reduce((s, r) => s + r.count, 0);
      const max = Math.max(1, ...rows.map(r => r.count));
      target.innerHTML = rows.map(r => {
        const pct = (r.count / max) * 100;
        const share = total > 0 ? Math.round((r.count / total) * 100) : 0;
        return `<div class="funnel-bar">
          <div class="funnel-bar-label">${esc(r.category)}</div>
          <div class="funnel-bar-track"><div class="funnel-bar-fill" style="width:${pct}%"></div></div>
          <div class="funnel-bar-num">${r.count} · ${share}%</div>
        </div>`;
      }).join('') + `<div class="dev-row-l" style="color:var(--muted);font-size:11.5px;margin-top:6px">合计 ${total} 条；窗口 ${days} 天</div>`;
    } catch {
      target.innerHTML = '<div class="dev-row-l" style="color:var(--muted)">— 加载失败</div>';
    }
  }
  async function loadChatPersonas(days) {
    const target = _q('chat-personas-chart'); if (!target) return;
    try {
      const rows = await api('/api/admin/chat/personas?days=' + days);
      if (!rows || !rows.length) {
        target.innerHTML = '<div class="dev-row-l" style="color:var(--muted)">暂无幕僚使用数据</div>';
        return;
      }
      const max = Math.max(1, ...rows.map(r => r.rooms_with));
      target.innerHTML = rows.map(r => {
        const pct = (r.rooms_with / max) * 100;
        return `<div class="funnel-bar">
          <div class="funnel-bar-label">${esc(r.persona_slug)}</div>
          <div class="funnel-bar-track"><div class="funnel-bar-fill" style="width:${pct}%"></div></div>
          <div class="funnel-bar-num">入群 ${r.rooms_with} · 回复 ${r.replies}</div>
        </div>`;
      }).join('');
    } catch {
      target.innerHTML = '<div class="dev-row-l" style="color:var(--muted)">— 加载失败</div>';
    }
  }
  async function loadChatRetention(days) {
    const target = _q('chat-retention-chart'); if (!target) return;
    try {
      const r = await api('/api/admin/chat/retention?days=' + days);
      const cohort = r.rooms_created || 0;
      const pct = (n) => cohort > 0 ? Math.round((n / cohort) * 100) : 0;
      target.innerHTML =
        _kpiCard('cohort（建群数）', cohort, `近 ${r.cohort_days} 天`) +
        _kpiCard('D1 回访', `${r.returned_d1}（${pct(r.returned_d1)}%）`) +
        _kpiCard('D3 回访', `${r.returned_d3}（${pct(r.returned_d3)}%）`) +
        _kpiCard('D7 回访', `${r.returned_d7}（${pct(r.returned_d7)}%）`);
    } catch {
      target.innerHTML = '<div class="dev-row-l" style="color:var(--muted)">— 加载失败</div>';
    }
  }
  async function loadChatFlow(days) {
    const target = _q('chat-flow-chart'); if (!target) return;
    try {
      const r = await api('/api/admin/chat/flow?days=' + days);
      const fmt = (s) => s < 60 ? `${s}s` : `${(s/60).toFixed(1)}min`;
      target.innerHTML =
        _kpiCard('flow 总数', r.flows_total) +
        _kpiCard('中位时长', fmt(r.median_flow_seconds)) +
        _kpiCard('p95 时长', fmt(r.p95_flow_seconds)) +
        _kpiCard('平均消息数/flow', r.avg_messages_per_flow.toFixed(1));
    } catch {
      target.innerHTML = '<div class="dev-row-l" style="color:var(--muted)">— 加载失败</div>';
    }
  }

  // ─── 事故黑匣子 ─────────────────────────────────────────────────────────
  const KIND_LABEL = {
    empty_response: '空响应',
    stuck_timeout: '服务器侧超时',
    core_error: 'Step 错误',
    stream_error: '流错误',
  };

  async function loadIncidents() {
    const daysSel = $('incidents-days');
    const kindSel = $('incidents-kind');
    const stepSel = $('incidents-step');
    const totalEl = $('incidents-total');
    const sumEl = $('incidents-summary');
    const listEl = $('incidents-list');
    if (!daysSel || !sumEl || !listEl) return;

    const params = new URLSearchParams();
    params.set('days', daysSel.value || '7');
    if (kindSel.value) params.set('kind', kindSel.value);
    if (stepSel.value) params.set('step', stepSel.value);

    let data;
    try {
      data = await api('/api/admin/incidents?' + params.toString());
    } catch {
      return;
    }
    totalEl.textContent = data.summary.total || 0;

    if (!data.records.length) {
      sumEl.innerHTML = '<div class="incidents-empty">这个窗口里没有事故。😌 棒。</div>';
      listEl.innerHTML = '';
      return;
    }

    const kinds = data.summary.by_kind || {};
    const kindBadges = Object.entries(kinds)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `<span class="inc-kind inc-kind-${esc(k)}">${esc(KIND_LABEL[k] || k)} · ${n}</span>`)
      .join('');
    sumEl.innerHTML = `<div class="incidents-bar">${kindBadges}</div>`;

    const rows = data.records.slice(0, 200).map(r => {
      const ctx = r.ctx_sizes || {};
      const ctxHtml = Object.keys(ctx).length === 0
        ? '<span class="inc-muted">无 context 快照</span>'
        : Object.entries(ctx)
            .map(([k, v]) => `<span class="inc-ctx-pill">${esc(k)}=${v.toLocaleString()}</span>`)
            .join(' ');
      return `
        <details class="inc-row">
          <summary>
            <span class="inc-ts">${fmtExactTime(r.ts)}</span>
            <span class="inc-kind inc-kind-${esc(r.kind)}">${esc(KIND_LABEL[r.kind] || r.kind)}</span>
            <span class="inc-step">Step ${r.step}</span>
            <span class="inc-reason">${esc(r.reason || '—')}</span>
          </summary>
          <div class="inc-detail">
            <div><b>session</b>: <code>${esc(r.session_id)}</code> · <b>project</b>: <code>${esc(r.project_id)}</code></div>
            <div><b>耗时</b>: ${fmtMs(r.duration_ms)} · <b>模型</b>: ${esc(r.model || '—')}</div>
            <div><b>Context 字符数</b>: ${ctxHtml}</div>
          </div>
        </details>`;
    }).join('');
    listEl.innerHTML = rows;
  }

  async function refresh() {
    clearError();
    const days = parseInt(win.value, 10) || 7;
    try {
      await loadOverview(days);
      await Promise.all([
        loadFunnel(days),
        loadCategories(days),
        loadDevices(days),
        loadFeedback(),
        loadPersonaWishes(),
        loadGeo(days),
        loadRecent(),
        loadOperatorSummary(),
        loadUsers(),
        // §3.9 chat-mode dashboards (privacy-safe metadata aggregations)
        loadChatOverview(days),
        loadChatTopics(days),
        loadChatPersonas(days),
        loadChatRetention(days),
        loadChatFlow(days),
        loadIncidents(),
      ]);
      // If we're on a user-detail route, also refresh that
      const m = (location.hash || '').match(/^#user\/(.+)$/);
      if (m) loadUserDetail(decodeURIComponent(m[1]));
    } catch (e) {
      // showError already called inside api()
    }
  }

  refreshBtn.onclick = refresh;
  win.onchange = refresh;
  // Wire up the incidents-tab controls (independent of the global window).
  ['incidents-days', 'incidents-kind', 'incidents-step'].forEach(id => {
    const el = $(id);
    if (el) el.onchange = loadIncidents;
  });
  const incRefresh = $('incidents-refresh');
  if (incRefresh) incRefresh.onclick = loadIncidents;

  applyRoute();
  refresh();
})();
