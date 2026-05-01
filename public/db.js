/**
 * Counsel AI — Local database (Phase B · IndexedDB)
 *
 * Stores session snapshots locally so the server doesn't have to (Phase C
 * will drop server-side persistence entirely). All writes are namespaced by
 * user_id from CounselAuth so switching account gives a clean library.
 *
 * Stores:
 *   projects           keyPath: id
 *   sessions           keyPath: id   indexes: project_id, user_id, updated_at
 *   user_wiki          keyPath: user_id   (singleton per user)
 *   execution_journal  keyPath: user_id   (singleton per user)
 *
 * Public API (window.CounselDB):
 *   open() / close()
 *   put(store, value)  get(store, key)  getAll(store)  del(store, key)
 *   saveSession(session)  loadSession(id)  listSessionsForUser(user_id)
 *   mirrorSession(pid, sid)   — pulls all known server files to IDB
 *   mirrorUserFiles()          — wiki + execution journal
 *   exportAll()                — full dump as JSON
 *   importAll(json)            — restore from dump
 */
(function () {
  const DB_NAME = 'counsel-db';
  // v2 (2026-05-01) — adds `user_data` store for B3 tier files (core.md +
  // log/INDEX.md + log/{sid}.md). Existing user_wiki store stays as-is so
  // legacy reads keep working until the user has accumulated tier data via
  // a fresh harvest.
  const DB_VERSION = 2;

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains('projects')) {
          const s = db.createObjectStore('projects', { keyPath: 'id' });
          s.createIndex('user_id', 'user_id');
          s.createIndex('updated_at', 'updated_at');
        }
        if (!db.objectStoreNames.contains('sessions')) {
          const s = db.createObjectStore('sessions', { keyPath: 'id' });
          s.createIndex('project_id', 'project_id');
          s.createIndex('user_id', 'user_id');
          s.createIndex('updated_at', 'updated_at');
        }
        if (!db.objectStoreNames.contains('user_wiki')) {
          db.createObjectStore('user_wiki', { keyPath: 'user_id' });
        }
        if (!db.objectStoreNames.contains('execution_journal')) {
          db.createObjectStore('execution_journal', { keyPath: 'user_id' });
        }
        // v2 — B3 user-data tier. Single record per user; the body holds
        // `core` (markdown ≤1.5KB), `log_index` (one-line-per-session hooks),
        // and `log_sessions` (object map: sid → markdown body).
        if (!db.objectStoreNames.contains('user_data')) {
          db.createObjectStore('user_data', { keyPath: 'user_id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function run(store, mode, fn) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(store, mode);
          const os = tx.objectStore(store);
          let result;
          const r = fn(os);
          if (r && typeof r.onsuccess !== 'undefined') {
            r.onsuccess = () => {
              result = r.result;
            };
            r.onerror = () => reject(r.error);
          }
          tx.oncomplete = () => resolve(result);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        })
    );
  }

  const put = (store, value) => run(store, 'readwrite', (os) => os.put(value));
  const get = (store, key) => run(store, 'readonly', (os) => os.get(key));
  const getAll = (store) => run(store, 'readonly', (os) => os.getAll());
  const del = (store, key) => run(store, 'readwrite', (os) => os.delete(key));

  function currentUserId() {
    try {
      const u = JSON.parse(localStorage.getItem('counsel:user') || 'null');
      return u ? u.user_id : null;
    } catch (_) {
      return null;
    }
  }

  async function saveSession(session) {
    if (!session.user_id) session.user_id = currentUserId();
    session.updated_at = new Date().toISOString();
    try {
      return await put('sessions', session);
    } catch (e) {
      // 2026-04-26 — surface IDB failures (iOS Safari quota / Private mode /
      // ITP eviction in flight). Silent failures here are why "history empty"
      // bugs are hard to diagnose — log so DevTools shows what went wrong.
      console.error('[CounselDB] saveSession failed', { id: session.id, user_id: session.user_id, err: e });
      throw e;
    }
  }

  async function loadSession(id) {
    return get('sessions', id);
  }

  async function listSessionsForUser(userId) {
    const uid = userId || currentUserId();
    const all = await getAll('sessions');
    return all.filter((s) => s.user_id === uid).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  }

  async function saveProject(project) {
    if (!project.user_id) project.user_id = currentUserId();
    project.updated_at = new Date().toISOString();
    try {
      return await put('projects', project);
    } catch (e) {
      console.error('[CounselDB] saveProject failed', { id: project.id, user_id: project.user_id, err: e });
      throw e;
    }
  }

  async function listProjectsForUser(userId) {
    const uid = userId || currentUserId();
    const all = await getAll('projects');
    return all.filter((p) => p.user_id === uid).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  }

  // ─── Mirror: pull server files for a given session into local storage ───
  // Files produced by the 8-step flow. GET /files/*filename returns 404 if
  // absent (normal during partial sessions); we just skip.
  const FLAT_FILES = [
    '00-raw-input.md',
    '01-defined.md',
    '01-define-state.json',
    '02-facts-answers.md',
    '02-facts-questions.json',
    '04-dimensions.md',
    '04-selected-dimensions.json',
    '05-debate.md',
    '06-summary.md',
    'premortem.md',
    '07-harvest.md',
    '07-bayesian.md',
    '07-persona-evals.md',
    '07-client-notes.md',
    'user-reactions.md',
    'metrics.json',
  ];

  async function fetchTextOrNull(url) {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      return await r.text();
    } catch (_) {
      return null;
    }
  }

  async function fetchJsonOrNull(url) {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      return await r.json();
    } catch (_) {
      return null;
    }
  }

  async function mirrorSession(pid, sid) {
    if (!pid || !sid) return null;

    // 2026-04-26 v2 · MERGE semantics — never destroy IDB-saved data.
    //
    // Phase D server is stateless: it writes nothing persistent (unless
    // COUNSEL_DEV_MIRROR is set). When a case-owner re-opens an old session
    // URL, server returns 404 for every file. Prior version of this function
    // built a fresh `snapshot = { files: {} }`, fetched everything (all 404),
    // then `saveSession(snapshot)` PUT-overwrote the IDB record — wiping the
    // step_files history that saveStepFiles had carefully accumulated during
    // the original run. Result: review showed empty content for every step
    // and runS4 saw no selected personas (defaulted to all 17).
    //
    // Fix: load the existing IDB session as the base. Only ADD keys that
    // come back 200. Preserve personas / current_step / in_progress / etc.
    const existing = (await get('sessions', sid)) || null;
    const snapshot = {
      id: sid,
      project_id: pid,
      user_id: (existing && existing.user_id) || currentUserId(),
      files: Object.assign({}, (existing && existing.files) || {}),
      personas: (existing && existing.personas) || null,
      current_step: (existing && existing.current_step) || 0,
      raw_input: (existing && existing.raw_input) || undefined,
      created_at: (existing && existing.created_at) || new Date().toISOString(),
      mirrored_at: new Date().toISOString(),
    };
    if (existing && existing.in_progress) snapshot.in_progress = existing.in_progress;
    if (existing && existing.meta) snapshot.meta = existing.meta;

    // 1. Meta (project + session basics) — only enrich if server returns
    const sessMeta = await fetchJsonOrNull(`/api/projects/${pid}/sessions/${sid}`);
    if (sessMeta) snapshot.meta = sessMeta;

    // 2. Flat files — ONLY write keys returning 200; never clear existing keys
    const base = `/api/projects/${pid}/sessions/${sid}/files/`;
    await Promise.all(
      FLAT_FILES.map(async (f) => {
        const txt = await fetchTextOrNull(base + f);
        if (txt !== null) snapshot.files[f] = txt;
      })
    );

    // 3. Per-persona opinions — try server, but only update if it returns content
    const pickRes = await fetchJsonOrNull(`/api/projects/${pid}/sessions/${sid}/personas`);
    const picks = (pickRes && pickRes.selected) || [];
    if (picks.length > 0) snapshot.personas = picks;

    const slugList = picks.length > 0 ? picks : (snapshot.personas || []);
    await Promise.all(
      slugList.map(async (slug) => {
        const key = '03-opinions/' + slug + '.md';
        if (snapshot.files[key]) return; // already in IDB
        const txt = await fetchTextOrNull(base + key);
        if (txt !== null) snapshot.files[key] = txt;
      })
    );

    // Also try common display-name filenames (legacy server writes use names)
    const FALLBACK_OPINION_NAMES = [
      '毛泽东.md',
      'Paul-Graham.md',
      'Steve-Jobs.md',
      '李小龙.md',
      'Kevin-Kelly.md',
      '六祖慧能.md',
      'Elon-Musk.md',
      '张一鸣.md',
      '雷军.md',
      '马云.md',
      '沈南鹏.md',
      '张磊.md',
      '金庸.md',
      '刘震云.md',
      '倪海厦.md',
      '唐绮阳.md',
      '钱学森.md',
    ];
    await Promise.all(
      FALLBACK_OPINION_NAMES.map(async (n) => {
        const key = '03-opinions/' + n;
        if (snapshot.files[key]) return;
        const txt = await fetchTextOrNull(base + encodeURIComponent(key).replace(/%2F/g, '/'));
        if (txt !== null) snapshot.files[key] = txt;
      })
    );

    await saveSession(snapshot);

    // Keep a lightweight project record so listProjectsForUser works
    if (sessMeta && sessMeta.project_id) {
      const existing = await get('projects', pid);
      if (!existing) {
        await saveProject({
          id: pid,
          name: sessMeta.project_name || sessMeta.raw_input || pid,
          created_at: sessMeta.created_at || new Date().toISOString(),
        });
      }
    } else if (!(await get('projects', pid))) {
      await saveProject({ id: pid, name: pid, created_at: new Date().toISOString() });
    }

    return snapshot;
  }

  async function mirrorUserFiles() {
    const uid = currentUserId();
    if (!uid) return;
    const wiki = await fetchTextOrNull('/api/user-wiki');
    if (wiki !== null) await put('user_wiki', { user_id: uid, content: wiki, updated_at: new Date().toISOString() });
    // execution-journal — no direct GET endpoint today; skip until Phase C exposes one.
  }

  // ─── Export / import ───────────────────────────────────────────────
  async function exportAll() {
    const uid = currentUserId();
    const dump = {
      schema: 1,
      exported_at: new Date().toISOString(),
      user_id: uid,
      projects: [],
      sessions: [],
      user_wiki: null,
      execution_journal: null,
    };
    const allP = await getAll('projects');
    dump.projects = allP.filter((p) => !uid || p.user_id === uid);
    const allS = await getAll('sessions');
    dump.sessions = allS.filter((s) => !uid || s.user_id === uid);
    dump.user_wiki = uid ? await get('user_wiki', uid) : null;
    dump.execution_journal = uid ? await get('execution_journal', uid) : null;
    return dump;
  }

  async function importAll(dump) {
    if (!dump || dump.schema !== 1) throw new Error('不支持的备份格式');
    const uid = currentUserId();
    // If export belongs to a different user_id, rewrite to current so the
    // data shows up in this account's view.
    for (const p of dump.projects || []) {
      p.user_id = uid;
      await put('projects', p);
    }
    for (const s of dump.sessions || []) {
      s.user_id = uid;
      await put('sessions', s);
    }
    if (dump.user_wiki) {
      dump.user_wiki.user_id = uid;
      await put('user_wiki', dump.user_wiki);
    }
    if (dump.execution_journal) {
      dump.execution_journal.user_id = uid;
      await put('execution_journal', dump.execution_journal);
    }
    return {
      projects: (dump.projects || []).length,
      sessions: (dump.sessions || []).length,
    };
  }

  // ─── Phase C · stateless-server bridge ─────────────────────────────────
  // buildPriorState assembles the payload the server needs to run a step
  // with zero persistent state of its own.
  async function buildPriorState(pid, sid) {
    const uid = currentUserId();
    const session = sid ? await get('sessions', sid) : null;
    const project = pid ? await get('projects', pid) : null;
    const wikiRec = uid ? await get('user_wiki', uid) : null;
    const journalRec = uid ? await get('execution_journal', uid) : null;
    const tierRec = uid ? await get('user_data', uid) : null;
    const files = {};
    if (session && session.files) Object.assign(files, session.files);
    // B3 — log_sessions stays empty for v1 (the facilitator only reads the
    // INDEX hooks; per-session detail reading is a future RAG feature). The
    // server's hydrate path tolerates any subset.
    return {
      files,
      personas: session && session.personas ? session.personas : null,
      user_wiki: wikiRec ? wikiRec.content : null,
      execution_journal: journalRec ? journalRec.content : null,
      belief_system: project && project.belief_system ? project.belief_system : null,
      user_core: tierRec ? tierRec.core || null : null,
      log_index: tierRec ? tierRec.log_index || null : null,
      log_sessions: {},
    };
  }

  // bumpSessionStep advances `current_step` to at least `step` (monotonic).
  // Called on each step_done so `resumeSession()` can jump to the right place.
  async function bumpSessionStep(sid, step) {
    if (!sid || typeof step !== 'number') return;
    const session = (await get('sessions', sid)) || null;
    if (!session) return; // race: submitInput's saveSession hasn't landed yet
    const current = session.current_step || 0;
    if (step > current) {
      session.current_step = step;
      session.updated_at = new Date().toISOString();
      await put('sessions', session);
    }
  }

  // F6b (2026-04-26) — interruption-safety flag. Set BEFORE a step's SSE
  // stream begins; cleared on step_done. If the browser closes mid-flight,
  // the flag remains set and resumeSession() can detect it and prompt the
  // user to either re-run that step or read whatever partial content
  // landed in IDB.
  async function markStepInProgress(sid, step) {
    if (!sid || typeof step !== 'number') return;
    const session = (await get('sessions', sid)) || null;
    if (!session) return;
    session.in_progress = { step, started_at: new Date().toISOString() };
    session.updated_at = new Date().toISOString();
    await put('sessions', session);
  }

  async function clearStepInProgress(sid) {
    if (!sid) return;
    const session = (await get('sessions', sid)) || null;
    if (!session || !session.in_progress) return;
    delete session.in_progress;
    session.updated_at = new Date().toISOString();
    await put('sessions', session);
  }

  // backfillTierFromLegacy splits the legacy `user_wiki` markdown into the
  // `user_data` tier — purely client-side, no LLM call. Used when a v1 user
  // first opens the new portrait UI: gives them populated `log_sessions` +
  // `log_index` immediately. The `core` field is left empty here; the user
  // can opt into Secretary extraction via the explicit "整理画像" button
  // (which calls /api/user-wiki/backfill).
  //
  // Returns `{ migrated: <count>, hooks: <count> }`. Idempotent — if
  // user_data already has log_sessions content, it returns 0 and writes nothing.
  async function backfillTierFromLegacy() {
    const uid = currentUserId();
    if (!uid) return { migrated: 0, hooks: 0 };

    const tier = await get('user_data', uid);
    if (tier && tier.log_sessions && Object.keys(tier.log_sessions).length > 0) {
      return { migrated: 0, hooks: 0 }; // already migrated
    }

    const legacy = await get('user_wiki', uid);
    if (!legacy || !legacy.content || !legacy.content.trim()) {
      return { migrated: 0, hooks: 0 };
    }

    const blocks = legacy.content.split('\n---\n')
      .map(b => b.trim())
      .filter(b => b.length > 0 && b.startsWith('## 项目'));

    const log_sessions = {};
    const indexRows = [];
    for (const block of blocks) {
      const firstLine = block.split('\n', 1)[0] || '';
      // Match "## 项目 {pid} · 会话 {sid} ({date})"
      const m = firstLine.match(/##\s*项目\s+(\S+)\s*·\s*会话\s+(\S+)\s*\(([^)]+)\)/);
      if (!m) continue;
      const [, pid, sid, date] = m;
      log_sessions[sid] = block;

      // Extract hook: first non-empty non-heading line after "### 锁定议题"
      let hook = '';
      const lines = block.split('\n');
      let foundLockedTopic = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (foundLockedTopic && trimmed && !trimmed.startsWith('#')) {
          hook = trimmed;
          break;
        }
        if (trimmed.startsWith('### 锁定议题')) {
          foundLockedTopic = true;
        }
      }
      // Cap at 80 chars (CJK-safe via Array.from for codepoints)
      const hookCapped = Array.from(hook).slice(0, 80).join('');

      indexRows.push({
        date,
        pid,
        sid,
        hook: hookCapped || '(无 hook)',
        sortKey: date || '0000-00-00',
      });
    }

    indexRows.sort((a, b) => b.sortKey.localeCompare(a.sortKey));

    let log_index = '# 案主经历索引（Log Index）\n\n';
    log_index += '*每行 ≤80 字，hook = 那次 session 的核心议题。点击文件名读详情。*\n\n';
    for (const row of indexRows) {
      const label = row.date && row.pid ? `${row.date} · ${row.pid}` : (row.date || row.pid);
      log_index += `- [${label}](${row.sid}.md) — ${row.hook}\n`;
    }

    const now = new Date().toISOString();
    const rec = {
      user_id: uid,
      core: tier ? tier.core || '' : '', // preserve any existing core
      log_index,
      log_sessions,
      updated_at: now,
      backfilled_from_legacy_at: now,
    };
    await put('user_data', rec);

    return { migrated: Object.keys(log_sessions).length, hooks: indexRows.length };
  }

  // saveStepFiles takes the `{ session_files, user_files }` payload the server
  // emits in the StepFiles SSE event and merges it into IndexedDB.
  async function saveStepFiles(pid, sid, payload) {
    if (!payload) return;
    const uid = currentUserId();
    const now = new Date().toISOString();

    if (payload.session_files && Object.keys(payload.session_files).length > 0) {
      let session = await get('sessions', sid);
      if (!session) {
        session = { id: sid, project_id: pid, user_id: uid, files: {} };
      }
      session.files = session.files || {};
      Object.assign(session.files, payload.session_files);
      session.updated_at = now;
      await put('sessions', session);
    }

    if (payload.user_files && uid) {
      const uf = payload.user_files;
      if (uf['user-wiki.md']) {
        await put('user_wiki', { user_id: uid, content: uf['user-wiki.md'], updated_at: now });
      }
      if (uf['execution-journal.md']) {
        await put('execution_journal', { user_id: uid, content: uf['execution-journal.md'], updated_at: now });
      }
      if (uf['belief-system.md'] && pid) {
        let proj = await get('projects', pid);
        if (!proj) proj = { id: pid, user_id: uid, created_at: now };
        proj.belief_system = uf['belief-system.md'];
        proj.updated_at = now;
        await put('projects', proj);
      }
      // B3 tier — keys arrive namespaced as `user-data/...`. Merge into a
      // single user_data record so the portrait UI can read it as one object.
      const tierKeys = Object.keys(uf).filter((k) => k.startsWith('user-data/'));
      if (tierKeys.length > 0) {
        let rec = (await get('user_data', uid)) || {
          user_id: uid,
          core: '',
          log_index: '',
          log_sessions: {},
        };
        rec.log_sessions = rec.log_sessions || {};
        for (const k of tierKeys) {
          if (k === 'user-data/core.md') {
            rec.core = uf[k];
          } else if (k === 'user-data/log/INDEX.md') {
            rec.log_index = uf[k];
          } else if (k.startsWith('user-data/log/') && k.endsWith('.md')) {
            const sidKey = k.slice('user-data/log/'.length, -'.md'.length);
            if (sidKey) rec.log_sessions[sidKey] = uf[k];
          }
        }
        rec.updated_at = now;
        await put('user_data', rec);
      }
    }
  }

  window.CounselDB = {
    openDb,
    put,
    get,
    getAll,
    del,
    saveSession,
    loadSession,
    listSessionsForUser,
    saveProject,
    listProjectsForUser,
    mirrorSession,
    mirrorUserFiles,
    exportAll,
    importAll,
    buildPriorState,
    saveStepFiles,
    backfillTierFromLegacy,
    bumpSessionStep,
    markStepInProgress,
    clearStepInProgress,
  };
})();
