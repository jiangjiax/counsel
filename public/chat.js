/**
 * Counsel · Chat (WeChat-style freestyle group chat with advisors).
 *
 * The "light" track in the dual-entry product. Pairs with the 8-step
 * deep-decision flow on the main page. Auth via JWT bearer (localStorage
 * 'counsel:token'). All /api/chat/* endpoints require auth (per-user
 * isolated; rooms only visible to their creator).
 *
 * Telemetry: emits 6 metadata-only event types via window.CounselAnalytics.
 * Strict whitelist — never sends message text, titles, or persona replies.
 *
 * No external deps. Inlines a slim SSE consumer (no IndexedDB / step coupling).
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // ─── State ────────────────────────────────────────────────────────────────
  let allPersonas = [];                // [{slug, name, title}]
  let currentRoom = null;              // {room, turns}
  let pickedSlugs = new Set();         // selection state for the create modal
  let isStreaming = false;
  // Per-persona buffers during streaming. Keyed by persona name (the SSE
  // event identifies personas by `name`, not slug).
  let streamBuffers = {};
  // DOM refs to the bubble currently being filled by each persona.
  let streamBubbles = {};
  // Telemetry helpers:
  //   - streamPersonaStartedAt: persona_name → ms timestamp (for latency)
  //   - heartbeatTimer: setInterval handle for chat_session_heartbeat
  //   - topicClassified: room_id set, so we only categorize the first message
  let streamPersonaStartedAt = {};
  let heartbeatTimer = null;
  const topicClassified = new Set();

  // ─── Telemetry (metadata only — never message content) ────────────────────
  // All event types are listed in PRIORITY-ROADMAP-PG-BASED.md §3.9. Field
  // whitelist enforced both here and in the privacy audit test on the server.
  function track(type, data) {
    try {
      if (window.CounselAnalytics && typeof window.CounselAnalytics.track === 'function') {
        window.CounselAnalytics.track(type, data || {});
      }
    } catch { /* never let telemetry break the UI */ }
  }

  // ─── Auth helpers ─────────────────────────────────────────────────────────
  function token() { return localStorage.getItem('counsel:token') || ''; }
  function authHeaders() {
    const t = token();
    return t ? { Authorization: 'Bearer ' + t } : {};
  }
  async function api(path, opts = {}) {
    // Timeout guard — any single API call >15s aborts and surfaces a clear
    // error instead of hanging the UI indefinitely. (Streaming SSE has its
    // own controller in streamChat — this only applies to plain JSON calls.)
    const controller = new AbortController();
    const timeoutMs = opts.timeout || 15000;
    const t = setTimeout(() => controller.abort(), timeoutMs);
    let r;
    try {
      r = await fetch(path, {
        ...opts,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
          ...(opts.headers || {}),
        },
      });
    } catch (e) {
      clearTimeout(t);
      if (e.name === 'AbortError') {
        throw new Error(`请求超时（${timeoutMs / 1000}s）：${path} — 检查网络/扩展/缓存`);
      }
      throw new Error(`网络错误：${path} — ${e.message || e}`);
    }
    clearTimeout(t);
    if (r.status === 401) throw new Error('未登录或登录已过期。请回主站重新登录。');
    if (r.status === 403) {
      const j = await r.json().catch(() => ({}));
      const hint = j.hint ? `\n${j.hint}` : '';
      throw new Error(`没有访问权限。${j.error || '需要 admin 身份'}${hint}`);
    }
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status}: ${txt || path}`);
    }
    if (r.status === 204) return null;
    return r.json();
  }

  // ─── Color helper ─────────────────────────────────────────────────────────
  // Hand-tuned personas keep their existing brand colors; the rest get a
  // deterministic hash-based color so the same slug always renders the same hue.
  const SLUG_COLORS = {
    'mao-zedong': '#FF3B3B',
    'paul-graham': '#FF8C42',
    'steve-jobs': '#B0B0FF',
    'bruce-lee': '#FFE066',
    'kevin-kelly': '#4ECDC4',
    'huineng': '#B39DDB',
    'laozi': '#69D99A',
    'zhuangzi': '#D7B46A',
  };
  const PALETTE = [
    '#FF3B3B', '#FF8C42', '#B0B0FF', '#FFE066', '#4ECDC4', '#B39DDB',
    '#7AB8FF', '#F58CD2', '#9CFF7A', '#FFA07A', '#A0E5FF', '#FFD27A',
    '#D2A0FF', '#7AFFC8', '#FF9CB0', '#C0E07A', '#7AE0FF',
  ];
  function colorForSlug(slug) {
    if (SLUG_COLORS[slug]) return SLUG_COLORS[slug];
    // FNV-ish hash → palette index
    let h = 2166136261;
    for (let i = 0; i < slug.length; i++) {
      h ^= slug.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return PALETTE[h % PALETTE.length];
  }

  // ─── Avatar rendering ─────────────────────────────────────────────────────
  function avatarChar(name) {
    if (!name) return '?';
    // Prefer the first CJK character; fall back to first letter uppercase.
    for (const ch of name) {
      if (/[\u4e00-\u9fa5]/.test(ch)) return ch;
    }
    return name.trim().charAt(0).toUpperCase();
  }
  function renderAvatar(slug, name, extraClass = '') {
    const c = colorForSlug(slug);
    const ch = avatarChar(name);
    return `<span class="ct-av ${extraClass}" style="--c:${c}" title="${escapeHtml(name)}">${escapeHtml(ch)}</span>`;
  }

  // ─── Escaping ─────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function timeAgo(iso) {
    try {
      const d = new Date(iso);
      const diff = Date.now() - d.getTime();
      const m = Math.floor(diff / 60000);
      if (m < 1) return '刚刚';
      if (m < 60) return `${m}分钟前`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}小时前`;
      const dd = Math.floor(h / 24);
      if (dd < 30) return `${dd}天前`;
      return d.toLocaleDateString('zh-CN');
    } catch { return ''; }
  }

  // ─── Toast ────────────────────────────────────────────────────────────────
  let toastTimer = null;
  function toast(msg, ms = 2400) {
    const el = $('ct-toast');
    el.textContent = msg;
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  // ─── View switching ───────────────────────────────────────────────────────
  function showView(which) {
    $('ct-gate').hidden = which !== 'gate';
    $('ct-list').hidden = which !== 'list';
    $('ct-room').hidden = which !== 'room';
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────
  // Self-healing auth: supports `?login=USERNAME:PASSWORD` and `?token=JWT`
  // query params so admin can paste a one-shot URL and skip the form. Strips
  // the params from the URL after consumption so credentials aren't left in
  // history.
  async function consumeAuthQueryParams() {
    const params = new URLSearchParams(location.search);
    const directToken = params.get('token');
    const credPair = params.get('login');
    if (directToken) {
      localStorage.setItem('counsel:token', directToken);
      params.delete('token');
      const newSearch = params.toString();
      history.replaceState({}, '', location.pathname + (newSearch ? '?' + newSearch : ''));
      return;
    }
    if (credPair && credPair.includes(':')) {
      const [u, ...pwParts] = credPair.split(':');
      const p = pwParts.join(':');
      try {
        const r = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p }),
        });
        if (r.ok) {
          const data = await r.json();
          localStorage.setItem('counsel:token', data.token);
          localStorage.setItem('counsel:user', JSON.stringify({
            user_id: data.user_id, username: data.username,
          }));
        } else {
          $('ct-gate-msg').textContent = `?login= 自动登录失败：HTTP ${r.status}`;
        }
      } catch (e) {
        $('ct-gate-msg').textContent = '?login= 网络出错：' + (e.message || e);
      }
      params.delete('login');
      const newSearch = params.toString();
      history.replaceState({}, '', location.pathname + (newSearch ? '?' + newSearch : ''));
    }
  }

  async function boot() {
    await consumeAuthQueryParams();

    if (!token()) {
      $('ct-gate-msg').innerHTML =
        '未登录。请先<a href="/" style="color:var(--accent)">回主站</a>登录后再访问群聊。';
      return;
    }
    $('ct-gate-msg').textContent = '加载中…';
    // Personas list is heavy-ish (~3KB JSON across all 17). Don't block the
    // gate on it — fetch in parallel with the room list. If either hangs, the
    // 15s timeout in api() surfaces a visible error. No more admin whoami
    // gate — chat is open to all logged-in users since 2026-04-27 (§3.9).
    showView('list');
    const [personasResult, _roomResult] = await Promise.allSettled([
      api('/api/chat/personas').then((p) => { allPersonas = p; }),
      refreshRoomList(),
    ]);
    if (personasResult.status === 'rejected') {
      toast('幕僚列表加载失败：' + (personasResult.reason.message || ''));
    }
  }

  // Lazy ensure: any flow that needs the persona list (create-modal,
  // mention popover) calls this first so it works even if the parallel fetch
  // above failed. Cheap retry — single GET on a known-stable endpoint.
  async function ensurePersonas() {
    if (allPersonas && allPersonas.length) return;
    try {
      allPersonas = await api('/api/chat/personas');
    } catch (e) {
      toast('幕僚列表加载失败：' + (e.message || ''));
      throw e;
    }
  }

  // ─── Room list ────────────────────────────────────────────────────────────
  async function refreshRoomList() {
    const container = $('ct-rooms');
    container.innerHTML = '<div style="color:var(--text-faint);padding:20px;text-align:center;font-size:13px">加载中…</div>';
    let rooms;
    try {
      rooms = await api('/api/chat/rooms');
    } catch (e) {
      container.innerHTML = '';
      toast(e.message || '加载失败');
      return;
    }
    container.innerHTML = '';
    if (!rooms.length) {
      $('ct-rooms-empty').hidden = false;
      return;
    }
    $('ct-rooms-empty').hidden = true;

    rooms.forEach((r) => {
      const card = document.createElement('div');
      card.className = 'ct-room-card';
      const avatars = r.persona_slugs.slice(0, 5).map((slug) => {
        const p = allPersonas.find(x => x.slug === slug);
        return renderAvatar(slug, p ? p.name : slug, 'ct-av-sm');
      }).join('');
      const more = r.persona_slugs.length > 5 ? `<span class="ct-room-card-count">+${r.persona_slugs.length - 5}</span>` : '';
      card.innerHTML = `
        <div class="ct-room-card-h">
          <div class="ct-room-card-title">${escapeHtml(r.title)}</div>
          <div class="ct-room-card-time">${escapeHtml(timeAgo(r.created_at))}</div>
        </div>
        ${r.last_preview ? `<div class="ct-room-card-preview">${escapeHtml(r.last_preview)}</div>` : ''}
        <div class="ct-room-card-foot">
          <div class="ct-avatar-row">${avatars}${more}</div>
          <div class="ct-room-card-count">${r.turn_count} 条</div>
        </div>`;
      card.addEventListener('click', () => enterRoom(r.room_id));
      container.appendChild(card);
    });
  }

  // ─── Create-room modal ────────────────────────────────────────────────────
  async function openCreateModal() {
    try { await ensurePersonas(); } catch { return; }
    pickedSlugs = new Set();
    $('ct-new-title').value = '';
    const picker = $('ct-persona-picker');
    picker.innerHTML = '';
    allPersonas.forEach((p) => {
      const item = document.createElement('label');
      item.className = 'ct-persona-pick';
      item.innerHTML = `
        <input type="checkbox" data-slug="${escapeHtml(p.slug)}">
        ${renderAvatar(p.slug, p.name, 'ct-av-sm')}
        <span class="ct-persona-pick-name">${escapeHtml(p.name)}</span>`;
      const cb = item.querySelector('input');
      cb.addEventListener('change', () => {
        if (cb.checked) {
          pickedSlugs.add(p.slug);
          item.classList.add('selected');
        } else {
          pickedSlugs.delete(p.slug);
          item.classList.remove('selected');
        }
      });
      picker.appendChild(item);
    });
    $('ct-modal').hidden = false;
  }
  function closeCreateModal() { $('ct-modal').hidden = true; }

  async function submitCreateRoom() {
    if (pickedSlugs.size === 0) {
      toast('至少选一个幕僚');
      return;
    }
    const title = $('ct-new-title').value.trim();
    const btn = $('ct-modal-create');
    btn.disabled = true;
    btn.textContent = '创建中…（主持人正在写开场）';
    try {
      const detail = await api('/api/chat/rooms', {
        method: 'POST',
        body: JSON.stringify({
          title,
          persona_slugs: Array.from(pickedSlugs),
        }),
      });
      closeCreateModal();
      currentRoom = detail;
      track('chat_room_created', {
        room_id: detail.room.room_id,
        persona_count: detail.room.persona_slugs.length,
        persona_slugs: detail.room.persona_slugs,
        has_title: title.length > 0,
      });
      renderRoomView();
      // Refresh list in the background
      refreshRoomList().catch(() => {});
    } catch (e) {
      toast(e.message || '创建失败');
    } finally {
      btn.disabled = false;
      btn.textContent = '创建';
    }
  }

  // ─── Enter room ───────────────────────────────────────────────────────────
  async function enterRoom(roomId) {
    try {
      const detail = await api('/api/chat/rooms/' + encodeURIComponent(roomId));
      currentRoom = detail;
      // Track resume — only counts if room had prior history (more than just
      // the facilitator opening). days_since_create gives retention curve.
      try {
        const created = new Date(detail.room.created_at).getTime();
        const days = Math.max(0, Math.round((Date.now() - created) / 86400000));
        track('chat_room_resumed', {
          room_id: detail.room.room_id,
          days_since_create: days,
          turn_count: detail.turns.length,
        });
      } catch { /* clock skew is fine */ }
      renderRoomView();
    } catch (e) {
      toast(e.message || '加载群聊失败');
    }
  }

  function renderRoomView() {
    if (!currentRoom) return;
    const { room, turns } = currentRoom;
    $('ct-room-title').textContent = room.title || '群聊';
    const memberRow = $('ct-room-members');
    const members = room.persona_slugs.map((slug) => {
      const p = allPersonas.find(x => x.slug === slug);
      return renderAvatar(slug, p ? p.name : slug, 'ct-av-sm');
    }).join('');
    memberRow.innerHTML = `${members}<span style="margin-left:6px">${room.persona_slugs.length} 位幕僚</span>`;

    const chat = $('ct-chat');
    chat.innerHTML = '';
    streamBuffers = {};
    streamBubbles = {};
    streamPersonaStartedAt = {};
    turns.forEach(t => appendTurnToDom(t));
    showView('room');
    scrollChatToBottom();
    // Focus input on desktop only — mobile virtual keyboard pop is annoying.
    if (window.matchMedia('(min-width: 720px)').matches) {
      setTimeout(() => $('ct-input').focus(), 50);
    }
    // Heartbeat: every 60s while user is on this room. Lets server compute
    // active-session minutes for the心流 (flow continuity) metric without
    // having to keep a connection open.
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (currentRoom && document.visibilityState === 'visible') {
        track('chat_session_heartbeat', { room_id: currentRoom.room.room_id });
      }
    }, 60000);
  }

  function scrollChatToBottom() {
    const chat = $('ct-chat');
    chat.scrollTop = chat.scrollHeight;
  }

  function findPersonaByName(name) {
    return allPersonas.find(p => p.name === name);
  }

  function appendTurnToDom(turn) {
    const chat = $('ct-chat');
    const row = document.createElement('div');
    if (turn.role === 'user') {
      row.className = 'ct-row ct-row-user';
      row.innerHTML = `<div class="ct-bubble">${escapeHtml(turn.content)}</div>`;
    } else if (turn.role === 'facilitator') {
      row.className = 'ct-row ct-row-fac';
      row.innerHTML = `<div class="ct-bubble">${escapeHtml(turn.content)}</div>`;
    } else if (turn.role === 'persona') {
      row.className = 'ct-row ct-row-persona';
      const slug = turn.slug || '';
      const c = colorForSlug(slug);
      row.style.setProperty('--c', c);
      row.dataset.personaSlug = slug;
      row.dataset.personaName = turn.name || '';
      row.innerHTML = `
        ${renderAvatar(slug, turn.name || slug)}
        <div>
          <div class="ct-bubble-name" style="--c:${c}">${escapeHtml(turn.name || '')}</div>
          <div class="ct-bubble" style="--c:${c}">${escapeHtml(turn.content)}</div>
        </div>`;
      attachLongPressMention(row);
    } else {
      return;
    }
    chat.appendChild(row);
  }

  // ─── Long-press → 2-option action menu (WeChat-style) ────────────────────
  // Tap-and-hold a persona bubble for ≥450ms → opens a small menu with two
  // patterns Michael clarified are distinct on 2026-04-27:
  //
  //   1. **@ TA** — pure mention (prepends `@<name> `; no message context)
  //   2. **回复这条** — quote-reply (prepends `回复 @<name>「excerpt」: ` so the
  //      LLM sees which specific message you're responding to)
  //
  // Cancels if the pointer moves (so long-press doesn't fight scrolling).
  // Works for both touch and mouse via pointer events. Haptic feedback when
  // available, brief visual pulse, native context menu suppressed.
  function attachLongPressMention(row) {
    let timer = null;
    let startX = 0, startY = 0;
    let fired = false;
    const HOLD_MS = 450;
    const MOVE_THRESHOLD = 10; // px

    function clear() {
      if (timer) { clearTimeout(timer); timer = null; }
    }
    function fire(triggerEvent) {
      fired = true;
      const name = row.dataset.personaName || '';
      const slug = row.dataset.personaSlug || '';
      if (!name) return;
      // Visual + haptic feedback
      row.classList.add('ct-row-pressed');
      setTimeout(() => row.classList.remove('ct-row-pressed'), 320);
      try { if (navigator.vibrate) navigator.vibrate(35); } catch {}
      showBubbleActionMenu(row, name, slug, triggerEvent);
    }

    row.addEventListener('pointerdown', (e) => {
      // Ignore right-click and pinch
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      fired = false;
      startX = e.clientX; startY = e.clientY;
      clear();
      timer = setTimeout(() => fire(e), HOLD_MS);
    });
    row.addEventListener('pointermove', (e) => {
      if (!timer) return;
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) clear();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => {
      row.addEventListener(ev, () => clear());
    });
    // Suppress the system "select text" / "context menu" on long-press
    // ONLY if the long-press actually fired our handler.
    row.addEventListener('contextmenu', (e) => {
      if (fired) e.preventDefault();
    });
  }

  let _activeBubbleMenu = null;
  function closeBubbleActionMenu() {
    if (_activeBubbleMenu) {
      _activeBubbleMenu.remove();
      _activeBubbleMenu = null;
    }
  }
  function showBubbleActionMenu(row, name, slug, triggerEvent) {
    closeBubbleActionMenu();
    const bubble = row.querySelector('.ct-bubble');
    if (!bubble) return;
    const text = bubble.textContent || '';
    const excerpt = text.length > 24 ? text.slice(0, 24) + '…' : text;

    const menu = document.createElement('div');
    menu.className = 'ct-bubble-menu';
    menu.innerHTML = `
      <button type="button" class="ct-bubble-menu-item" data-action="mention">
        <span class="ct-bubble-menu-ic">@</span>
        <span class="ct-bubble-menu-l">@ ${escapeHtml(name)}</span>
      </button>
      <button type="button" class="ct-bubble-menu-item" data-action="reply">
        <span class="ct-bubble-menu-ic">↩</span>
        <span class="ct-bubble-menu-l">回复这条</span>
      </button>`;
    document.body.appendChild(menu);
    _activeBubbleMenu = menu;

    // Position above the bubble, centered horizontally on it.
    const rect = bubble.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - menuRect.width / 2;
    let top = rect.top - menuRect.height - 8;
    if (top < 8) {
      top = rect.bottom + 8; // not enough room above; flip below
    }
    left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('.ct-bubble-menu-item');
      if (!btn) return;
      const action = btn.dataset.action;
      closeBubbleActionMenu();
      if (action === 'mention') mentionPersona(name);
      else if (action === 'reply') quoteReplyPersona(name, excerpt);
    });
    // Tapping anywhere else closes it.
    setTimeout(() => {
      const off = (ev) => {
        if (!menu.contains(ev.target)) {
          document.removeEventListener('pointerdown', off, true);
          closeBubbleActionMenu();
        }
      };
      document.addEventListener('pointerdown', off, true);
    }, 0);
  }

  function mentionPersona(name) {
    const ta = $('ct-input');
    if (!ta) return;
    const cur = ta.value;
    const prefix = `@${name} `;
    // If input already starts with @ or 回复, replace the existing mention.
    if (cur.startsWith('@') || cur.startsWith('回复 @')) {
      ta.value = prefix + cur.replace(/^(回复\s*)?@\S+(「[^」]*」:?\s*)?\s*/, '');
    } else {
      ta.value = prefix + cur;
    }
    autoResizeTextarea();
    ta.focus();
    try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch {}
    toast(`已 @ ${name}`);
  }

  function quoteReplyPersona(name, excerpt) {
    const ta = $('ct-input');
    if (!ta) return;
    const cur = ta.value;
    const prefix = `回复 @${name}「${excerpt}」: `;
    // Replace any existing mention/quote prefix
    if (cur.startsWith('@') || cur.startsWith('回复 @')) {
      ta.value = prefix + cur.replace(/^(回复\s*)?@\S+(「[^」]*」:?\s*)?\s*/, '');
    } else {
      ta.value = prefix + cur;
    }
    autoResizeTextarea();
    ta.focus();
    try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch {}
    toast(`回复 ${name}`);
  }

  // ─── Send message + slim SSE consumer ─────────────────────────────────────
  async function sendMessage() {
    if (!currentRoom || isStreaming) return;
    const ta = $('ct-input');
    const content = ta.value.trim();
    if (!content) return;

    // Detect @ mention (matches the same logic the server uses in pick_responders).
    let hasMention = false;
    let mentionSlug = null;
    if (content.startsWith('@')) {
      const m = currentRoom.room.persona_slugs
        .map((slug) => ({ slug, name: (allPersonas.find(p => p.slug === slug) || {}).name || slug }))
        .find((p) => content.startsWith('@' + p.name) || content.startsWith('@' + p.slug));
      if (m) { hasMention = true; mentionSlug = m.slug; }
    }

    // Compute msg_index BEFORE pushing — number of prior user turns.
    const priorUserMsgs = currentRoom.turns.filter(t => t.role === 'user').length;

    track('chat_message_sent', {
      room_id: currentRoom.room.room_id,
      msg_index: priorUserMsgs,
      char_count: content.length,
      has_mention: hasMention,
      ...(mentionSlug ? { mention_persona_slug: mentionSlug } : {}),
    });

    // Topic categorization fires once per room, on the first user message.
    // Reuses /api/classify-question (same 10 buckets as Step 1 in 8-step flow).
    // The message text only crosses the wire here — server returns just a
    // bucket label; the label is what we track. No content stored anywhere.
    if (priorUserMsgs === 0 && !topicClassified.has(currentRoom.room.room_id)) {
      const roomId = currentRoom.room.room_id;
      topicClassified.add(roomId);
      classifyTopicAndTrack(roomId, content).catch(() => {
        topicClassified.delete(roomId); // allow retry on real failure
      });
    }

    // Optimistically render the user turn.
    const userTurn = {
      ts: new Date().toISOString(),
      role: 'user',
      content,
    };
    appendTurnToDom(userTurn);
    currentRoom.turns.push(userTurn);
    ta.value = '';
    ta.style.height = '';
    scrollChatToBottom();

    isStreaming = true;
    $('ct-send-btn').disabled = true;
    streamBuffers = {};
    streamBubbles = {};
    streamPersonaStartedAt = {};

    try {
      await streamChat(currentRoom.room.room_id, content);
    } catch (e) {
      toast(e.message || '发送失败');
    } finally {
      isStreaming = false;
      $('ct-send-btn').disabled = false;
    }
  }

  async function classifyTopicAndTrack(roomId, text) {
    try {
      const r = await api('/api/classify-question', {
        method: 'POST',
        body: JSON.stringify({ question: text }),
      });
      if (r && r.category) {
        track('chat_topic_categorized', {
          room_id: roomId,
          category: r.category,
        });
      }
    } catch (e) {
      // Classifier failures are non-fatal; we just don't get a category for
      // this message. Don't toast — user shouldn't see this.
      console.warn('classify failed', e);
    }
  }

  async function streamChat(roomId, content) {
    const TOTAL_TIMEOUT = 8 * 60 * 1000;     // 8 min
    const IDLE_TIMEOUT = 150 * 1000;         // 150s — match main app

    const controller = new AbortController();
    const totalTimer = setTimeout(() => controller.abort(), TOTAL_TIMEOUT);
    let idleTimer = setTimeout(() => controller.abort(), IDLE_TIMEOUT);
    function bumpIdle() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(), IDLE_TIMEOUT);
    }

    let res;
    try {
      res = await fetch('/api/chat/rooms/' + encodeURIComponent(roomId) + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ content }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(totalTimer); clearTimeout(idleTimer);
      if (e.name === 'AbortError') throw new Error('请求超时');
      throw e;
    }
    if (!res.ok) {
      clearTimeout(totalTimer); clearTimeout(idleTimer);
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${txt}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bumpIdle();
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();

        for (const part of parts) {
          if (!part.trim()) continue;
          const lines = part.split('\n');
          let data = '';
          for (const line of lines) {
            if (line.startsWith('data:')) data += line.slice(5).trimStart();
          }
          data = data.trim();
          // Backend wraps SSEEvent::to_sse_data() ("data: {json}\n\n") again
          // via Axum's Event::data() — strip the inner prefix too.
          if (data.startsWith('data:')) data = data.slice(5).trimStart();
          if (!data) continue;
          try {
            const evt = JSON.parse(data);
            handleEvent(evt);
          } catch (err) {
            // Try to recover by extracting the first JSON object.
            const m = data.match(/\{[\s\S]*\}/);
            if (m) {
              try { handleEvent(JSON.parse(m[0])); } catch {}
            }
          }
        }
      }
    } finally {
      clearTimeout(totalTimer);
      clearTimeout(idleTimer);
    }
    finalizeAllStreams();
  }

  function handleEvent(evt) {
    if (!evt || !evt.type) return;
    switch (evt.type) {
      case 'persona_start':
        startPersonaBubble(evt.name);
        break;
      case 'persona_chunk':
        appendPersonaChunk(evt.name, evt.chunk || '');
        break;
      case 'persona_done':
        finalizePersonaBubble(evt.name);
        break;
      case 'error':
        toast(evt.message || '错误');
        break;
      default:
        // facilitator_chunk / facilitator_done unused in chat-test today;
        // ignore unrecognized variants gracefully.
        break;
    }
  }

  function startPersonaBubble(name) {
    const persona = findPersonaByName(name);
    const slug = persona ? persona.slug : '';
    const c = colorForSlug(slug);
    streamBuffers[name] = '';
    streamPersonaStartedAt[name] = Date.now();
    const row = document.createElement('div');
    row.className = 'ct-row ct-row-persona';
    row.style.setProperty('--c', c);
    row.dataset.personaSlug = slug;
    row.dataset.personaName = name;
    row.innerHTML = `
      ${renderAvatar(slug, name)}
      <div>
        <div class="ct-bubble-name" style="--c:${c}">${escapeHtml(name)}</div>
        <div class="ct-bubble ct-typing" style="--c:${c}"></div>
      </div>`;
    const chat = $('ct-chat');
    chat.appendChild(row);
    streamBubbles[name] = row.querySelector('.ct-bubble');
    attachLongPressMention(row);
    scrollChatToBottom();
  }

  function appendPersonaChunk(name, chunk) {
    if (!streamBubbles[name]) startPersonaBubble(name);
    streamBuffers[name] = (streamBuffers[name] || '') + chunk;
    streamBubbles[name].textContent = streamBuffers[name];
    scrollChatToBottom();
  }

  function finalizePersonaBubble(name) {
    const bubble = streamBubbles[name];
    if (!bubble) return;
    bubble.classList.remove('ct-typing');
    const persona = findPersonaByName(name);
    const replyText = streamBuffers[name] || '';
    const startedAt = streamPersonaStartedAt[name];
    const turn = {
      ts: new Date().toISOString(),
      role: 'persona',
      slug: persona ? persona.slug : null,
      name,
      content: replyText,
    };
    currentRoom.turns.push(turn);
    if (currentRoom && persona) {
      track('chat_persona_replied', {
        room_id: currentRoom.room.room_id,
        persona_slug: persona.slug,
        reply_char_count: replyText.length,
        latency_ms: startedAt ? Date.now() - startedAt : null,
      });
    }
    delete streamBubbles[name];
    delete streamBuffers[name];
    delete streamPersonaStartedAt[name];
  }

  function finalizeAllStreams() {
    Object.keys(streamBubbles).forEach(finalizePersonaBubble);
  }

  // ─── Mention popover ──────────────────────────────────────────────────────
  function toggleMentionPop() {
    const pop = $('ct-mention-pop');
    if (!pop.hidden) { pop.hidden = true; return; }
    if (!currentRoom) return;
    pop.innerHTML = '';
    currentRoom.room.persona_slugs.forEach((slug) => {
      const p = allPersonas.find(x => x.slug === slug);
      if (!p) return;
      const item = document.createElement('div');
      item.className = 'ct-mention-item';
      item.innerHTML = `${renderAvatar(slug, p.name, 'ct-av-sm')}<span>@${escapeHtml(p.name)}</span>`;
      item.addEventListener('click', () => {
        const ta = $('ct-input');
        const cur = ta.value;
        const prefix = `@${p.name} `;
        ta.value = cur.startsWith('@') ? prefix + cur.replace(/^@\S+\s*/, '') : prefix + cur;
        ta.focus();
        pop.hidden = true;
      });
      pop.appendChild(item);
    });
    pop.hidden = false;
  }

  // ─── Delete current room ──────────────────────────────────────────────────
  async function deleteCurrentRoom() {
    if (!currentRoom) return;
    if (!confirm(`确定删除"${currentRoom.room.title}"？该操作不可撤销。`)) return;
    try {
      await api('/api/chat/rooms/' + encodeURIComponent(currentRoom.room.room_id), {
        method: 'DELETE',
      });
      currentRoom = null;
      showView('list');
      await refreshRoomList();
    } catch (e) {
      toast(e.message || '删除失败');
    }
  }

  // ─── Wire up ──────────────────────────────────────────────────────────────
  function autoResizeTextarea() {
    const ta = $('ct-input');
    ta.style.height = 'auto';
    ta.style.height = Math.min(120, ta.scrollHeight) + 'px';
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('ct-new-btn').addEventListener('click', openCreateModal);
    $('ct-modal-cancel').addEventListener('click', closeCreateModal);
    $('ct-modal-create').addEventListener('click', submitCreateRoom);
    $('ct-back-list').addEventListener('click', () => {
      showView('list');
      refreshRoomList().catch(() => {});
    });
    $('ct-delete-room').addEventListener('click', deleteCurrentRoom);
    $('ct-send-btn').addEventListener('click', sendMessage);
    $('ct-mention-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMentionPop();
    });
    document.addEventListener('click', (e) => {
      const pop = $('ct-mention-pop');
      if (!pop.hidden && !pop.contains(e.target) && e.target.id !== 'ct-mention-btn') {
        pop.hidden = true;
      }
    });

    const ta = $('ct-input');
    ta.addEventListener('input', autoResizeTextarea);
    ta.addEventListener('keydown', (e) => {
      // Enter sends; Shift+Enter inserts newline; mobile keeps default (newline)
      // because the soft keyboard's enter often is "send" already.
      if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 720px)').matches) {
        e.preventDefault();
        sendMessage();
      }
    });

    boot().catch((e) => {
      $('ct-gate-msg').textContent = '初始化失败：' + (e.message || e);
    });
  });

  // Debug hooks (used by E2E test). Cheap to expose; admin-only page.
  window.__ct = {
    getState: () => ({
      allPersonasLen: allPersonas.length,
      currentRoom: currentRoom ? currentRoom.room.room_id : null,
      isStreaming,
      pickedSlugsCount: pickedSlugs.size,
    }),
    openCreate: openCreateModal,
  };
})();
