/**
 * Counsel AI — Analytics (Phase A+)
 *
 * Buffered event reporter. Events describe usage METADATA only —
 * step timing, persona picks, stuck detection. Never chat content.
 *
 * API:
 *   track(type, data)                     // enqueue
 *   startStepTimer(step, sessionId)        // call on step_entered
 *   endStepTimer(step, sessionId, extra)   // emits step_completed with duration_ms
 *   markStuck(step, sessionId, idleMs)     // when idle > threshold
 *
 * Flush: every 10s; also on visibilitychange (hidden) + beforeunload via sendBeacon.
 */
(function () {
  const FLUSH_MS = 10000;
  const MAX_BUF = 50;
  const buf = [];
  const timers = new Map(); // key: `${step}:${sessionId}` → startMs

  function nowIso() {
    return new Date().toISOString();
  }

  function track(type, data) {
    if (!type) return;
    buf.push({ type, data: data || {}, ts: nowIso() });
    if (buf.length >= MAX_BUF) flush();
  }

  async function flush() {
    if (buf.length === 0) return;
    const batch = buf.splice(0, buf.length);
    try {
      // Attach the bearer token directly. On the main app (index.html),
      // auth.js wraps window.fetch and injects this automatically; on
      // standalone pages like /chat.html that don't load auth.js, we have
      // to do it ourselves or every event POST 401's silently.
      const headers = { 'Content-Type': 'application/json' };
      try {
        const tok = localStorage.getItem('counsel:token');
        if (tok) headers.Authorization = 'Bearer ' + tok;
      } catch (_) { /* localStorage may be blocked */ }
      const r = await fetch('/api/events', {
        method: 'POST',
        headers,
        body: JSON.stringify({ events: batch }),
      });
      if (!r.ok) {
        // drop on auth failure (token expired); otherwise re-queue for next
        // flush to avoid loss under flaky network
        if (r.status !== 401 && r.status !== 400) buf.unshift(...batch);
      }
    } catch (_) {
      buf.unshift(...batch);
    }
  }

  function flushBeacon() {
    if (buf.length === 0) return;
    try {
      const token = localStorage.getItem('counsel:token');
      if (!token) return;
      const batch = buf.splice(0, buf.length);
      // fetch keepalive survives document unload with headers intact
      fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {
      // ignore
    }
  }

  function startStepTimer(step, sessionId) {
    const key = step + ':' + (sessionId || '');
    timers.set(key, Date.now());
    track('step_entered', { step, session_id: sessionId });
  }

  function endStepTimer(step, sessionId, extra) {
    const key = step + ':' + (sessionId || '');
    const start = timers.get(key);
    timers.delete(key);
    const duration_ms = start ? Date.now() - start : null;
    track('step_completed', Object.assign({ step, session_id: sessionId, duration_ms }, extra || {}));
  }

  function markStuck(step, sessionId, idleMs) {
    track('stuck', { step, session_id: sessionId, idle_ms: idleMs });
  }

  setInterval(flush, FLUSH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushBeacon();
  });
  window.addEventListener('beforeunload', flushBeacon);

  window.CounselAnalytics = { track, flush, startStepTimer, endStepTimer, markStuck };
})();
