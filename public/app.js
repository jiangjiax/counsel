/**
 * Counsel AI — Web UI
 * Single-page app for the 8-step advisory session flow.
 * Design language: persona identity colors, avatar glow, advisor bar.
 */

const API = "";
let PID = null; // project ID
let SID = null; // session ID

// 2026-04-27 · client update guard.
// Production deploys can leave phones/desktops holding old CSS/JS from the
// browser cache. The tiny version file is served no-store; when it changes we
// navigate with ?cv=<version>, forcing a fresh HTML request whose asset tags
// carry matching ?v=<version> cache keys.
(function initClientVersionGuard() {
  const VERSION_URL = '/client-version.json';
  const VERSION_KEY = 'counsel:client-version';
  const BOOT_KEY_PREFIX = 'counsel:client-version-boot:';

  function versionedUrl(version) {
    const url = new URL(location.href);
    if (url.searchParams.get('cv') === version) return null;
    url.searchParams.set('cv', version);
    return url.toString();
  }

  function refreshForVersion(version) {
    const target = versionedUrl(version);
    if (!target) return false;
    const bootKey = BOOT_KEY_PREFIX + version;
    try {
      if (sessionStorage.getItem(bootKey) === '1') return false;
      sessionStorage.setItem(bootKey, '1');
    } catch {}
    location.replace(target);
    return true;
  }

  async function checkClientVersion() {
    try {
      const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const latest = String(data.version || '').trim();
      if (!latest) return;

      const seen = localStorage.getItem(VERSION_KEY);
      if (!seen) {
        localStorage.setItem(VERSION_KEY, latest);
        refreshForVersion(latest);
        return;
      }
      if (seen !== latest) {
        localStorage.setItem(VERSION_KEY, latest);
        refreshForVersion(latest);
      }
    } catch (e) {
      if (location.search.includes('debug=1')) console.warn('[version] check failed', e);
    }
  }

  window.CounselClientVersion = { check: checkClientVersion };
  checkClientVersion();
  window.addEventListener('focus', checkClientVersion);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkClientVersion();
  });
})();

// 2026-04-27 — slowness diagnostic. Append `?debug=1` to URL on the device
// reporting slow load; reads back to console for triage. Free of cost when
// the flag is absent.
if (typeof location !== 'undefined' && location.search.includes('debug=1')) {
  window.addEventListener('load', () => {
    setTimeout(() => {
      try {
        const t = performance.timing;
        const nav = performance.getEntriesByType('navigation')[0];
        const ms = (a, b) => Math.max(0, a - b);
        console.log('[perf] DNS    ', ms(t.domainLookupEnd, t.domainLookupStart), 'ms');
        console.log('[perf] TCP    ', ms(t.connectEnd, t.connectStart), 'ms');
        console.log('[perf] TLS    ', t.secureConnectionStart ? ms(t.connectEnd, t.secureConnectionStart) : 0, 'ms');
        console.log('[perf] TTFB   ', ms(t.responseStart, t.requestStart), 'ms');
        console.log('[perf] HTML   ', ms(t.responseEnd, t.responseStart), 'ms');
        console.log('[perf] DOM    ', ms(t.domComplete, t.domLoading), 'ms');
        console.log('[perf] JS+IDB ', ms(t.domContentLoadedEventEnd, t.responseEnd), 'ms');
        console.log('[perf] Total  ', ms(t.loadEventEnd, t.navigationStart), 'ms');
        if (nav && nav.transferSize !== undefined) {
          console.log('[perf] HTML transferSize', nav.transferSize, 'bytes');
        }
        const slowResources = performance.getEntriesByType('resource')
          .filter(r => r.duration > 500)
          .sort((a, b) => b.duration - a.duration)
          .slice(0, 5);
        if (slowResources.length) {
          console.log('[perf] slowest resources:');
          slowResources.forEach(r => console.log(`  ${Math.round(r.duration)}ms  ${r.name.split('/').pop()}`));
        }
      } catch (e) { console.warn('[perf] not supported', e); }
    }, 200);
  });
}

// ─── Phase 6 · UI 圆桌 · feature flags ──────────────────────────────────────
// UI_MODE: 'linear' (existing UI) | 'roundtable' (Phase 6 shell)
// LAYOUT:  'A' (⬤ Ring flat) | 'B' (⬡ Table 42° isometric) — only meaningful in roundtable mode
// 2026-04-26 — was: width≥900 ? 'roundtable' : 'linear'. Mobile defaulting to
// linear meant body.rt-mode was never added on first mobile visit, so all the
// portrait-mobile rt-mode CSS (small ring, colored dot seats, etc.) didn't
// apply — case-owner saw blank scene until they tapped 🎭 圆桌 toggle. Default
// to 'roundtable' everywhere; ?ui=linear and localStorage still allow opt-in.
const UI_MODE = (new URLSearchParams(location.search).get('ui'))
  || localStorage.getItem('counsel:ui-mode')
  || 'roundtable';
let LAYOUT = (new URLSearchParams(location.search).get('layout')) || localStorage.getItem('counsel:layout') || 'B';

window.toggleUIMode = function() {
  const next = UI_MODE === 'roundtable' ? 'linear' : 'roundtable';
  localStorage.setItem('counsel:ui-mode', next);
  location.reload();
};

window.setLayout = function(layout) {
  LAYOUT = layout;
  localStorage.setItem('counsel:layout', layout);
  const ring = document.getElementById('ring-scene');
  const tbl  = document.getElementById('table-scene');
  const btnA = document.getElementById('lt-A');
  const btnB = document.getElementById('lt-B');
  if (btnA) btnA.classList.toggle('on', layout === 'A');
  if (btnB) btnB.classList.toggle('on', layout === 'B');
  if (layout === 'A') {
    if (ring) ring.classList.add('on');
    if (tbl)  tbl.classList.remove('on');
  } else {
    if (ring) ring.classList.remove('on');
    if (tbl)  tbl.classList.add('on');
  }
  // C2: bubbles attach to whichever layout is .on; re-mount for the newly-visible
  // layout so Ring↔Table mid-session preserves scene content.
  if (typeof rehydrateSceneForStep === 'function' && typeof currentStep !== 'undefined') {
    rehydrateSceneForStep(currentStep);
  }
};

// Called once at page load to wire roundtable mode body class, toggle label,
// and mount the shell DOM + persona seats if in roundtable mode.
async function initRoundtableUI() {
  const btn = document.getElementById('ui-mode-btn');
  const ltg = document.getElementById('layout-toggle-group');
  if (UI_MODE === 'roundtable') {
    document.body.classList.add('rt-mode');
    if (btn) btn.textContent = '📜 列表';
    if (ltg) ltg.style.display = 'flex';
    const rt = document.getElementById('roundtable');
    if (rt) rt.hidden = false;
    // C1: if URL brought us here with ?ui=, persist so subsequent navigations keep roundtable.
    if (new URLSearchParams(location.search).get('ui')) {
      localStorage.setItem('counsel:ui-mode', 'roundtable');
    }
    // Fetch active persona list BEFORE building seats so custom personas get real seats.
    await loadActivePersonas();
    // Build seat nodes + apply current layout
    buildRingNodes();
    buildTableNodes();
    window.setLayout(LAYOUT);
    // Move step containers into #rt-stage (preserve their IDs + event listeners)
    mountRoundtableSteps();
    // C3: event delegation so any .ocard (Step 3 question card, Step 4 opinion
    // card — live or rehydrated) opens the same speech panel as a bubble click.
    const sidePane = document.querySelector('.rt-side-pane');
    if (sidePane) {
      sidePane.addEventListener('click', (e) => {
        const card = e.target.closest('#s3-content > .ocard, #s4-cards > .ocard');
        if (card && !e.target.closest('.qa-a, button, input, textarea')) {
          window.openSpeechPanelFromCard(card);
        }
      });
    }
    // Wire progress strip navigation (click on done/now step to jump to it)
    document.querySelectorAll('.rt-pnode').forEach(node => {
      node.addEventListener('click', () => {
        const step = parseInt(node.dataset.step);
        if (stepStarted[step] || node.classList.contains('done') || node.classList.contains('now')) {
          document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
          const el = document.getElementById('s' + step);
          if (el) el.classList.add('active');
          document.querySelectorAll('.rt-pnode').forEach(n => n.classList.remove('now'));
          node.classList.add('now');
          // Rehydrate scene bubbles for the step the user jumped to.
          if (typeof currentStep !== 'undefined') currentStep = step;
          rehydrateSceneForStep(step);
        }
      });
    });
  } else {
    document.body.classList.remove('rt-mode');
    if (btn) btn.textContent = '🎭 圆桌';
    if (ltg) ltg.style.display = 'none';
  }
}

// Move the existing #s1..#s8 step containers into #rt-stage. Content-generation
// logic (textareas, facilitator chat, card rendering) is untouched — only the
// visual frame changes. When roundtable mode is off, this is a no-op.
function mountRoundtableSteps() {
  const stage = document.getElementById('rt-stage');
  if (!stage) return;
  for (let n = 1; n <= 8; n++) {
    const el = document.getElementById('s' + n);
    if (el && el.parentElement !== stage) stage.appendChild(el);
  }
}

// Seats rendered around the table. Populated by loadActivePersonas() from
// GET /api/personas so scene seats match whatever COUNSEL_PERSONAS filter the
// server runs under. Array order = display order clockwise from 12 o'clock.
// Defaults to the seed roster if the fetch fails (offline / old server).
let activePersonas = [
  { id:'mao',      slug:'mao',      name:'毛泽东',      color:'#FF3B3B', initial:'毛' },
  { id:'pg',       slug:'pg',       name:'Paul Graham', color:'#FF8C42', initial:'PG' },
  { id:'jobs',     slug:'jobs',     name:'Steve Jobs',  color:'#B0B0FF', initial:'SJ' },
  { id:'brucelee', slug:'brucelee', name:'李小龙',      color:'#FFE066', initial:'龙' },
  { id:'kk',       slug:'kk',       name:'Kevin Kelly', color:'#4ECDC4', initial:'KK' },
  { id:'huineng',  slug:'huineng',  name:'六祖慧能',    color:'#B39DDB', initial:'🪷' },
  { id:'laozi',    slug:'laozi',    name:'老子',        color:'#69D99A', initial:'道' },
  { id:'zhuangzi', slug:'zhuangzi', name:'庄子',        color:'#D7B46A', initial:'庄' },
];
// Alias kept so legacy callsites (if any) don't break.
const PERSONA_ORDER = activePersonas;

// Server uses kebab-case slugs (mao-zedong); client codepaths use short
// aliases (mao) that match `.av-grid.p-{slug}` CSS + existing PERSONAS keys.
// Normalize here so seats/bubbles/styles all agree.
const SLUG_ALIASES = {
  'mao-zedong':  'mao',
  'paul-graham': 'pg',
  'steve-jobs':  'jobs',
  'bruce-lee':   'brucelee',
  'kevin-kelly': 'kk',
};
function canonicalSlug(s) { return SLUG_ALIASES[s] || s; }

// 12-entry palette for personas without canonical colors. Stable hash so
// 钱学森 always gets the same color across sessions.
const CUSTOM_PALETTE = [
  '#6EC1E4', '#C8A165', '#9B8AC4', '#E07A5F', '#81B29A', '#F2CC8F',
  '#3D5A80', '#EE6C4D', '#98C1D9', '#E0FBFC', '#CC5A71', '#7BB662',
];
function hashColor(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return CUSTOM_PALETTE[Math.abs(h) % CUSTOM_PALETTE.length];
}
function hashInitial(name) {
  const s = String(name || '').trim();
  if (!s) return '?';
  // CJK char → single char; ASCII → up to 2 chars.
  return /[\u4E00-\u9FFF]/.test(s[0]) ? s[0] : s.slice(0, 2).toUpperCase();
}

// Fetch the server's active persona list and merge into activePersonas +
// PERSONAS map. Called once during init and again after the picker confirms
// so seats re-render with the case-owner's roster. Synthesizes color/initial
// for any persona the server returns without those fields.
//
// Phase 7.1: after the fetch we also apply the per-session filter
// (99-personas.json → GET /…/personas) OR the localStorage default, so the
// scene only renders the advisors the case-owner actually picked.
async function loadActivePersonas() {
  try {
    const res = await fetch('/api/personas');
    if (!res.ok) return;
    const full = await res.json();
    if (!Array.isArray(full) || full.length === 0) return;

    // Update the PERSONAS map with the admin-allowed roster (so lookups by
    // display name work across the app, even for personas not currently
    // selected by the case-owner).
    full.forEach(p => {
      const slug = canonicalSlug(p.slug || p.id);
      const known = PERSONAS[p.name];
      PERSONAS[p.name] = {
        slug,
        color: p.color || (known && known.color) || hashColor(slug),
        initial: p.initial || (known && known.initial) || hashInitial(p.name),
        label: p.name,
        short: (known && known.short) || p.name,
      };
    });

    // Decide the filter for the scene (Phase 7.1):
    //   1. Per-session picks (GET /sessions/:sid/personas) — authoritative for
    //      any session once it's been configured.
    //   2. localStorage default — ONLY for fresh pages (no PID/SID yet). We do
    //      NOT apply localStorage to resumed sessions: a pre-7.1 session that
    //      has no picks file should show the full admin roster, not
    //      retroactively inherit whatever the user picked later.
    //   3. No filter → show all admin-allowed personas.
    let filterSlugs = [];
    if (PID && SID && window.CounselDB) {
      // Phase D · session.personas lives in IDB
      try {
        const session = await window.CounselDB.loadSession(SID);
        if (session && Array.isArray(session.personas) && session.personas.length) {
          filterSlugs = session.personas;
        }
      } catch { /* fall through to full roster */ }
    } else {
      try {
        const saved = JSON.parse(localStorage.getItem(PP_STORAGE_KEY) || '[]');
        if (Array.isArray(saved) && saved.length) filterSlugs = saved;
      } catch {}
    }

    const filtered = filterSlugs.length
      ? filterSlugs
          .map(s => full.find(p => {
            const serverSlug = p.slug || p.id;
            return serverSlug === s || canonicalSlug(serverSlug) === canonicalSlug(s);
          }))
          .filter(Boolean)
      : full;

    const next = filtered.map(p => {
      const slug = canonicalSlug(p.slug || p.id);
      const known = PERSONAS[p.name];
      return {
        id: slug,
        slug,
        name: p.name,
        color: p.color || (known && known.color) || hashColor(slug),
        initial: p.initial || (known && known.initial) || hashInitial(p.name),
      };
    });

    // Mutate activePersonas in place so the PERSONA_ORDER alias keeps pointing at it.
    activePersonas.length = 0;
    next.forEach(p => activePersonas.push(p));
  } catch { /* keep defaults */ }
}

// Slugs that have a cell in portrait-grid.png (see style.css:478-486).
// Anything else falls back to initial-letter in colored circle.
const GRID_SLUGS = new Set(['mao', 'pg', 'jobs', 'kk', 'brucelee']);

// Build the avatar inner HTML for a persona. Three paths:
//   1. Grid-mapped → empty div, CSS fills with portrait crop
//   2. Huineng → 🪷 emoji (legacy decision, no grid slot by design)
//   3. Anything else → initial letter over persona color (Phase 7 custom personas)
//
// 2026-04-26 — every avatar div now also carries `--p-color` so mobile portrait
// CSS can render the seat as a solid colored dot (hides the portrait, paints
// the dot with persona color). Desktop ignores the variable.
function buildAvMarkup(p, baseClass) {
  const colorStyle = p.color ? `--p-color:${p.color}` : '';
  if (GRID_SLUGS.has(p.slug)) {
    return `<div class="${baseClass} av-grid p-${p.slug}" style="${colorStyle}"></div>`;
  }
  if (p.slug === 'huineng') {
    return `<div class="${baseClass}" style="${colorStyle || '--p-color:#B39DDB'}">🪷</div>`;
  }
  // Fallback: initial letter in persona color.
  return `<div class="${baseClass} av-initial" style="color:${p.color};border-color:${p.color};${colorStyle}">${p.initial || hashInitial(p.name)}</div>`;
}

// Render persona seats on a circle (Layout A · flat ring). Iterates
// activePersonas so seat count matches whatever the server filtered to.
//
// 2026-04-26 — switched from absolute pixel coords (cx=270, cy=270, r=210
// in a 540×540 ring) to percentage coords. Pixel coords broke when CSS
// resized .ring-wrap on mobile (540→140) — seats stayed at ~270px and
// fell outside the smaller container, getting clipped by overflow:hidden
// → invisible. Percentages track parent size automatically.
//
// Math: center is (50%, 50%); radius is 39% of parent (210/540 ≈ 0.388).
// Seat 0 (12 o'clock): (50%, 11%) — desktop ≈ (270, 59.4) which matches
// the old (270, 60) within 1px, so no visible change on desktop.
function buildRingNodes() {
  const rw = document.getElementById('rw');
  if (!rw) return;
  rw.querySelectorAll('.rn').forEach(n => n.remove());
  activePersonas.forEach((p, i) => {
    const rad = i * (360 / activePersonas.length) * Math.PI / 180;
    const xPct = 50 + 39 * Math.sin(rad);
    const yPct = 50 - 39 * Math.cos(rad);
    const div = document.createElement('div');
    div.className = 'rn waiting';
    div.id = 'rn-' + p.slug;
    div.dataset.p = p.slug;
    div.dataset.slug = p.slug;
    div.dataset.name = p.name;
    div.style.left = xPct + '%';
    div.style.top = yPct + '%';
    div.innerHTML = buildAvMarkup(p, 'rn-av') + `<div class="rn-label">${p.name}</div>`;
    rw.appendChild(div);
  });
}

// Render persona seats on an ellipse perimeter (Layout B · 42° table).
// Seats stay upright while the tabletop is rotateX(42deg).
function buildTableNodes() {
  const tw = document.getElementById('tw');
  if (!tw) return;
  tw.querySelectorAll('.seat-adv').forEach(n => n.remove());
  const EW = 560, EH = 420, ECX = EW/2, ECY = EH/2;
  const a = 258, b = 148; // semi-major, semi-minor axes
  activePersonas.forEach((p, i) => {
    const rad = i * (360 / activePersonas.length) * Math.PI / 180;
    const x = ECX + a * Math.sin(rad);
    const y = ECY - b * Math.cos(rad);
    const div = document.createElement('div');
    div.className = 'seat seat-adv waiting';
    div.id = 'seat-' + p.slug;
    div.dataset.p = p.slug;
    div.dataset.slug = p.slug;
    div.dataset.name = p.name;
    div.style.left = x + 'px';
    div.style.top = y + 'px';
    div.innerHTML = buildAvMarkup(p, 'seat-av') + `<div class="seat-label">${p.name}</div>`;
    tw.appendChild(div);
  });
}

// Return the active seat element for a persona slug (works for both layouts).
function getSeatEl(slug) {
  if (!slug) return null;
  const ring = document.getElementById('ring-scene');
  const tbl  = document.getElementById('table-scene');
  if (tbl && tbl.classList.contains('on')) {
    return document.querySelector(`#tw .seat[data-slug="${slug}"]`);
  }
  if (ring && ring.classList.contains('on')) {
    return document.querySelector(`#rw .rn[data-slug="${slug}"]`);
  }
  return null;
}

// Return both layouts' seat elements for a slug (used to apply state to both
// so when user toggles layouts mid-session the state persists visually).
function getAllSeatElsForSlug(slug) {
  const out = [];
  const rn  = document.querySelector(`#rw .rn[data-slug="${slug}"]`);
  const seat = document.querySelector(`#tw .seat[data-slug="${slug}"]`);
  if (rn) out.push(rn);
  if (seat) out.push(seat);
  return out;
}

// Set seat state (waiting | dim | lit | speaking | done). Applies to both layouts.
function setSeatState(slug, state) {
  getAllSeatElsForSlug(slug).forEach(el => {
    el.classList.remove('waiting', 'dim', 'lit', 'speaking', 'done');
    if (state) el.classList.add(state);
  });
}

/// Apply Step 6 debate-camp class (camp-pro | camp-con | camp-neutral) to a
/// persona's seats. Pass null to clear. Used by runS6 to color seats by which
/// side they took on the current dimension (Michael 2026-04-25).
function setSeatCamp(slug, camp) {
  getAllSeatElsForSlug(slug).forEach(el => {
    el.classList.remove('camp-pro', 'camp-con', 'camp-neutral');
    if (camp) el.classList.add('camp-' + camp);
  });
}

/// Strip camp classes from all advisor seats. Called at each dimension_start
/// so the prior dim's coloring doesn't bleed into the next debate.
function clearAllSeatCamps() {
  document.querySelectorAll('#rw .rn, #tw .seat').forEach(el => {
    el.classList.remove('camp-pro', 'camp-con', 'camp-neutral');
  });
  hideCampRegionLabels();
}

/// Wave 3 (2026-04-25) — once the camps for the current debate dim are mostly
/// decided, animate seats so the ring rearranges into three visual factions:
/// 正方 on the left arc, 反方 on the right arc, 中立 at the bottom. Host stays
/// at the top. Threshold: reseat when ≥60% of active advisors have declared
/// a camp (so we don't shuffle on every chunk, but also don't wait until the
/// last advisor finishes). Restore default positions on Step 6 exit /
/// dimension change (handled by buildRingNodes / buildTableNodes via
/// rehydrateSceneForStep clearing camps).
let _reseatLastDim = -1;
function tryReseatByCamp(dimIdx) {
  if (!document.body.classList.contains('rt-mode')) return;
  if (!Array.isArray(activePersonas) || activePersonas.length === 0) return;
  // Build a map slug → camp
  const campMap = {};
  document.querySelectorAll('#rw .rn').forEach(el => {
    const slug = el.dataset.slug;
    if (el.classList.contains('camp-pro')) campMap[slug] = 'pro';
    else if (el.classList.contains('camp-con')) campMap[slug] = 'con';
    else if (el.classList.contains('camp-neutral')) campMap[slug] = 'neutral';
  });
  const campedCount = Object.keys(campMap).length;
  // C2 (2026-04-25) — threshold lowered 0.6 → 0.4. With 12 personas,
  // the first 5 finishing now trigger reseat (was waiting for 8). The
  // animation needs to complete BEFORE the user has read all 12 chunks
  // for the camp pattern to register; earlier is better.
  if (campedCount / activePersonas.length < 0.4) return;
  if (_reseatLastDim === dimIdx) return;  // already reseated this dim
  _reseatLastDim = dimIdx;
  reseatRingByCamp(campMap);
  reseatTableByCamp(campMap);
  showCampRegionLabels();
}

/// C2 (2026-04-25) — show three faded text labels around the ring that
/// anchor the camp arcs visually: 正方 left, 反方 right, 中立 bottom.
/// Without these, the reseat looks like a random shuffle to a first-time
/// viewer. With them, the arc geometry becomes legible at a glance.
function showCampRegionLabels() {
  const scene = document.querySelector('.rt-scene-pane');
  if (!scene) return;
  if (document.getElementById('rt-camp-regions')) return;  // already shown
  const wrap = document.createElement('div');
  wrap.id = 'rt-camp-regions';
  wrap.innerHTML =
    '<div class="rt-camp-region rt-camp-pro">正方</div>' +
    '<div class="rt-camp-region rt-camp-con">反方</div>' +
    '<div class="rt-camp-region rt-camp-neu">中立</div>';
  scene.appendChild(wrap);
}

function hideCampRegionLabels() {
  const el = document.getElementById('rt-camp-regions');
  if (el) el.remove();
}

/// Compute new (x,y) for ring layout given a camp grouping. Pro arc on the
/// left (angles 215°-305°), con arc on the right (angles 55°-145°), neutral
/// strip at the bottom (160°-200°). Unassigned tucked into a small top
/// reserve so they don't clutter the camp arcs.
function reseatRingByCamp(campMap) {
  const rw = document.getElementById('rw');
  if (!rw) return;
  // 2026-04-26 — switched to percentage coords (matches buildRingNodes fix
  // in a471c87). Was: r=210, cx=270, cy=270 in 540 coord space — broke on
  // mobile 140px ring during Step 6 debate (seats reseated to ~270px,
  // outside the 140px ring, clipped by overflow:hidden → invisible).
  const groups = { pro: [], con: [], neu: [], unassigned: [] };
  activePersonas.forEach(p => {
    const c = campMap[p.slug];
    if (c === 'pro') groups.pro.push(p);
    else if (c === 'con') groups.con.push(p);
    else if (c === 'neutral') groups.neu.push(p);
    else groups.unassigned.push(p);
  });
  const place = (group, startDeg, endDeg) => {
    if (group.length === 0) return;
    group.forEach((p, i) => {
      const t = group.length === 1 ? 0.5 : i / (group.length - 1);
      const deg = startDeg + (endDeg - startDeg) * t;
      const rad = deg * Math.PI / 180;
      const xPct = 50 + 39 * Math.sin(rad);
      const yPct = 50 - 39 * Math.cos(rad);
      const seat = rw.querySelector(`.rn[data-slug="${p.slug}"]`);
      if (seat) {
        seat.style.transition = 'left .7s cubic-bezier(.4,0,.2,1), top .7s cubic-bezier(.4,0,.2,1)';
        seat.style.left = xPct + '%';
        seat.style.top = yPct + '%';
      }
    });
  };
  // Pro: left arc, sweep from 215° (south-west) up through 270° (west) to 305° (north-west)
  place(groups.pro, 215, 305);
  // Con: right arc, mirror sweep
  place(groups.con, 55, 145);
  // Neutral: tight band at the bottom (160°-200°)
  place(groups.neu, 160, 200);
  // Unassigned: small reserve at the top, just below host (340°-20°)
  place(groups.unassigned, 340, 380);  // 380 = 20° + 360
}

function reseatTableByCamp(campMap) {
  const tw = document.getElementById('tw');
  if (!tw) return;
  const EW = 560, EH = 420, ECX = EW/2, ECY = EH/2;
  const a = 258, b = 148;
  const groups = { pro: [], con: [], neu: [], unassigned: [] };
  activePersonas.forEach(p => {
    const c = campMap[p.slug];
    if (c === 'pro') groups.pro.push(p);
    else if (c === 'con') groups.con.push(p);
    else if (c === 'neutral') groups.neu.push(p);
    else groups.unassigned.push(p);
  });
  const place = (group, startDeg, endDeg) => {
    if (group.length === 0) return;
    group.forEach((p, i) => {
      const t = group.length === 1 ? 0.5 : i / (group.length - 1);
      const deg = startDeg + (endDeg - startDeg) * t;
      const rad = deg * Math.PI / 180;
      const x = ECX + a * Math.sin(rad);
      const y = ECY - b * Math.cos(rad);
      const seat = tw.querySelector(`.seat[data-slug="${p.slug}"]`);
      if (seat) {
        seat.style.transition = 'left .7s cubic-bezier(.4,0,.2,1), top .7s cubic-bezier(.4,0,.2,1)';
        seat.style.left = x + 'px';
        seat.style.top = y + 'px';
      }
    });
  };
  place(groups.pro, 215, 305);
  place(groups.con, 55, 145);
  place(groups.neu, 160, 200);
  place(groups.unassigned, 340, 380);
}

/// Reset reseat state — call when leaving Step 6 so the next visit reseats
/// fresh. Restores even-angle default positions without rebuilding DOM
/// (which would lose seat state classes).
///
/// 2026-04-26 — ring portion now uses percent coords (matches buildRingNodes
/// + reseatRingByCamp). Table portion still uses px because .tbl-wrap stays
/// at desktop coord space; mobile portrait hides .tbl-wrap entirely.
function rtRestoreSeatPositions() {
  _reseatLastDim = -1;
  const tblA = 258, tblB = 148, tblCX = 280, tblCY = 210;
  const n = (activePersonas || []).length || 0;
  if (n === 0) return;
  activePersonas.forEach((p, i) => {
    const rad = i * (360 / n) * Math.PI / 180;
    const rxPct = 50 + 39 * Math.sin(rad);
    const ryPct = 50 - 39 * Math.cos(rad);
    const tx = tblCX + tblA * Math.sin(rad);
    const ty = tblCY - tblB * Math.cos(rad);
    const rn = document.querySelector(`#rw .rn[data-slug="${p.slug}"]`);
    if (rn) {
      rn.style.transition = 'left .7s cubic-bezier(.4,0,.2,1), top .7s cubic-bezier(.4,0,.2,1)';
      rn.style.left = rxPct + '%';
      rn.style.top = ryPct + '%';
    }
    const seat = document.querySelector(`#tw .seat[data-slug="${p.slug}"]`);
    if (seat) {
      seat.style.transition = 'left .7s cubic-bezier(.4,0,.2,1), top .7s cubic-bezier(.4,0,.2,1)';
      seat.style.left = tx + 'px';
      seat.style.top = ty + 'px';
    }
  });
}

/// Detect "立场：正方/反方/中立" (or "Position: Pro/Con/Neutral") from the
/// FIRST few lines of an advisor's debate response. Returns a camp short
/// string or null when not yet declared.
function detectDebateCamp(text) {
  if (!text) return null;
  const firstChunk = text.slice(0, 200);
  if (/立场[：:]\s*正方|Position\s*[:：]\s*Pro\b/i.test(firstChunk)) return 'pro';
  if (/立场[：:]\s*反方|Position\s*[:：]\s*Con\b/i.test(firstChunk)) return 'con';
  if (/立场[：:]\s*中立|Position\s*[:：]\s*Neutral\b/i.test(firstChunk)) return 'neutral';
  return null;
}

/// Step 6 dim tracker — small chip strip at the upper-right of the scene
/// pane that lists all dimensions being debated. Click any chip to scroll
/// the sidebar to that dimension's body. Mirrors `.dim-section` state with
/// .now / .done / .upcoming so the user knows where we are at a glance.
function rtRenderDimTracker(total, currentIdx, names) {
  if (!document.body.classList.contains('rt-mode')) return;
  const pane = document.querySelector('.rt-scene-pane');
  if (!pane) return;
  let tracker = document.getElementById('rt-dim-tracker');
  if (!tracker) {
    tracker = document.createElement('div');
    tracker.id = 'rt-dim-tracker';
    tracker.className = 'rt-dim-tracker';
    pane.appendChild(tracker);
  }
  // Build chips. `names` is a sparse array indexed by dim — fill missing with
  // placeholder so the strip always shows total count.
  const chips = [];
  for (let i = 0; i < total; i++) {
    const label = (names && names[i]) ? names[i] : `维度 ${i + 1}`;
    const state = i < currentIdx ? 'done' : i === currentIdx ? 'now' : 'upcoming';
    chips.push(
      `<button type="button" class="rt-dim-chip ${state}" data-idx="${i}" title="${esc(label)}">` +
        `<span class="rt-dim-chip-n">${i + 1}</span>` +
        `<span class="rt-dim-chip-l">${esc(rtTruncate(label, 14))}</span>` +
      `</button>`
    );
  }
  tracker.innerHTML = `<div class="rt-dim-tracker-label">辩论维度</div><div class="rt-dim-tracker-row">${chips.join('')}</div>`;
  tracker.querySelectorAll('.rt-dim-chip').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx);
      const target = document.getElementById(`s6-dim-${idx}`);
      if (target) target.scrollIntoView({behavior: 'smooth', block: 'start'});
      tracker.querySelectorAll('.rt-dim-chip').forEach(c => c.classList.remove('focus'));
      btn.classList.add('focus');
    };
  });
}

function rtClearDimTracker() {
  const t = document.getElementById('rt-dim-tracker');
  if (t) t.remove();
}

/// ─── Spotlight bubble (Wave 2 · 2026-04-25) ────────────────────────────
/// Center of the scene shows ONE advisor's full speech in a large readable
/// bubble. Ring seats stay as context. ←/→ arrows + keyboard cycle through
/// advisors who have spoken. Click any seat → that becomes the spotlight.
/// Used in Steps 4 and 6 where bubbles are read-only browsing.

let _spotlightState = null; // { entries: [{slug,name,text}], cursor: number }

function rtSpotlightBuild() {
  if (!document.body.classList.contains('rt-mode')) return null;
  const pane = document.querySelector('.rt-scene-pane');
  if (!pane) return null;
  let sp = document.getElementById('rt-spotlight');
  if (sp) return sp;
  sp = document.createElement('div');
  sp.id = 'rt-spotlight';
  sp.className = 'rt-spotlight';
  sp.innerHTML =
    `<button type="button" class="rt-sp-close" aria-label="关闭">×</button>` +
    `<div class="rt-spotlight-tag"></div>` +
    `<div class="rt-spotlight-body md-body"></div>` +
    `<div class="rt-spotlight-nav">` +
      `<button type="button" class="rt-sp-arrow rt-sp-prev" aria-label="上一位">←</button>` +
      `<span class="rt-sp-pos">— / —</span>` +
      `<button type="button" class="rt-sp-arrow rt-sp-next" aria-label="下一位">→</button>` +
    `</div>`;
  pane.appendChild(sp);
  sp.querySelector('.rt-sp-prev').onclick = (e) => { e.stopPropagation(); rtSpotlightCycle(-1); };
  sp.querySelector('.rt-sp-next').onclick = (e) => { e.stopPropagation(); rtSpotlightCycle(1); };
  sp.querySelector('.rt-sp-close').onclick = (e) => { e.stopPropagation(); rtSpotlightClear(); };
  return sp;
}

function rtSpotlightClear() {
  const sp = document.getElementById('rt-spotlight');
  if (sp) sp.remove();
  _spotlightState = null;
}

/// Insert / update a single advisor's entry in the spotlight rotation. If the
/// spotlight isn't yet shown, this becomes the current focus. Otherwise it
/// updates that advisor's text in-place; the user's current cursor stays put.
function rtSpotlightUpsert(slug, name, text, opts) {
  if (!document.body.classList.contains('rt-mode')) return;
  if (!slug) return;
  const sp = rtSpotlightBuild();
  if (!sp) return;
  if (!_spotlightState) _spotlightState = { entries: [], cursor: 0 };
  const entries = _spotlightState.entries;
  let idx = entries.findIndex(e => e.slug === slug);
  const camp = opts && opts.camp;
  if (idx < 0) {
    entries.push({ slug, name, text: text || '', camp: camp || null });
    idx = entries.length - 1;
    // Auto-focus newly arrived advisor only if we haven't manually navigated
    // (cursor is at the previous last item).
    if (entries.length === 1 || _spotlightState.cursor === entries.length - 2) {
      _spotlightState.cursor = idx;
    }
  } else {
    entries[idx].text = text || entries[idx].text;
    entries[idx].name = name || entries[idx].name;
    if (camp) entries[idx].camp = camp;
  }
  rtSpotlightRender();
}

function rtSpotlightRender() {
  const sp = document.getElementById('rt-spotlight');
  if (!sp || !_spotlightState) return;
  const { entries, cursor } = _spotlightState;
  if (entries.length === 0) { sp.style.display = 'none'; return; }
  sp.style.display = '';
  const cur = entries[cursor] || entries[0];
  const tag = sp.querySelector('.rt-spotlight-tag');
  const body = sp.querySelector('.rt-spotlight-body');
  const pos = sp.querySelector('.rt-sp-pos');
  rtApplyPersonaVars(sp, cur.slug);
  sp.classList.remove('camp-pro', 'camp-con', 'camp-neutral');
  if (cur.camp) sp.classList.add('camp-' + cur.camp);
  const campLabel = cur.camp === 'pro' ? '正方' : cur.camp === 'con' ? '反方' : cur.camp === 'neutral' ? '中立' : '';
  if (tag) tag.innerHTML = `<span class="rt-sp-name">${rtEsc(cur.name)}</span>${campLabel ? `<span class="rt-sp-camp">${campLabel}</span>` : ''}`;
  if (body) body.innerHTML = md(cur.text || '…');
  if (pos) pos.textContent = `${cursor + 1} / ${entries.length}`;
  // Prev/next disabled state
  const prev = sp.querySelector('.rt-sp-prev');
  const next = sp.querySelector('.rt-sp-next');
  if (prev) prev.disabled = entries.length <= 1;
  if (next) next.disabled = entries.length <= 1;
  // Highlight the focused seat avatar
  document.querySelectorAll('#rw .rn, #tw .seat').forEach(el => el.classList.remove('spotlit'));
  document.querySelectorAll(`#rw .rn[data-slug="${cur.slug}"], #tw .seat[data-slug="${cur.slug}"]`).forEach(el => el.classList.add('spotlit'));
}

function rtSpotlightCycle(direction) {
  if (!_spotlightState || _spotlightState.entries.length === 0) return;
  const n = _spotlightState.entries.length;
  _spotlightState.cursor = (_spotlightState.cursor + direction + n) % n;
  rtSpotlightRender();
}

function rtSpotlightFocusSlug(slug) {
  if (!_spotlightState) return;
  const idx = _spotlightState.entries.findIndex(e => e.slug === slug);
  if (idx >= 0) {
    _spotlightState.cursor = idx;
    rtSpotlightRender();
  }
}

// Keyboard ←/→ to cycle (only when a spotlight is showing AND no input is focused)
document.addEventListener('keydown', (e) => {
  if (!_spotlightState || !document.getElementById('rt-spotlight')) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); rtSpotlightCycle(-1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); rtSpotlightCycle(1); }
});

// C3 (2026-04-25) — touch swipe on spotlight (Phase 6.7 mobile portrait
// single-spotlight mode). Threshold 50px so accidental scrolls don't trigger.
(function() {
  let touchStartX = null;
  let touchStartY = null;
  document.addEventListener('touchstart', (e) => {
    if (!_spotlightState || !document.getElementById('rt-spotlight')) return;
    if (!e.target.closest('#rt-spotlight')) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    touchStartX = null; touchStartY = null;
    // Horizontal-dominant gesture only, ignore mostly-vertical scrolls
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) rtSpotlightCycle(1);   // swipe left = next
      else rtSpotlightCycle(-1);          // swipe right = prev
    }
  }, { passive: true });
})();

// Set host seat state. Host now lives in the top-left corner (#rt-host-corner)
// since 2026-04-26 — central position is occupied by the breathing pivot. Old
// IDs #rh and #th-host kept as fallbacks for any layout that still uses them.
function setHostState(state) {
  const corner = document.getElementById('rt-host-corner');
  const rh = document.getElementById('rh');
  const th = document.getElementById('th-host');
  [corner, rh, th].forEach(el => {
    if (!el) return;
    el.classList.remove('dim', 'lit', 'speaking');
    if (state) el.classList.add(state);
  });
}

// 2026-04-26 · Breathing Circle MVP — central pivot text + Step 7 pulse
function setRtPivotText(s) {
  const txt = (s || '').trim().slice(0, 16);
  document.querySelectorAll('.rt-pivot-text').forEach(el => {
    el.textContent = txt || '—';
  });
  document.querySelectorAll('.rt-pivot').forEach(p => {
    p.classList.toggle('has-topic', !!txt);
  });
}

function triggerRtPivotPulse() {
  document.querySelectorAll('.rt-pivot').forEach(p => {
    p.classList.remove('pulse');
    void p.offsetWidth;            // force reflow so animation re-fires
    p.classList.add('pulse');
    setTimeout(() => p.classList.remove('pulse'), 500);
  });
}

// Parses "## 议题标语\nXXXX" out of 01-defined.md content. Returns '' if absent
// (Step 2 (A)/(B) branches don't emit this section, by design).
function parseTopicTagline(definedText) {
  if (!definedText) return '';
  const m = definedText.match(/##\s*议题标语\s*\n+\s*([^\n]+)/);
  if (!m) return '';
  return m[1].trim()
    .replace(/^[\[\(【「『《]+|[\]\)】」』》]+$/g, '')
    .replace(/[，。！？,.!?]+$/, '')
    .trim();
}

// Called on each showStep() to keep seat state visually consistent with flow
// and to update the sidebar progress strip.
function applyRoundtableStepState(n) {
  if (!document.body.classList.contains('rt-mode')) return;
  // Update sidebar progress strip
  document.querySelectorAll('.rt-pnode').forEach(node => {
    const step = parseInt(node.dataset.step);
    node.classList.remove('done', 'now');
    if (step < n) node.classList.add('done');
    if (step === n) node.classList.add('now');
  });
  // Default all personas to dim
  PERSONA_ORDER.forEach(p => setSeatState(p.id, 'dim'));
  if (n === 1) {
    // Input step: advisors waiting to hear
    PERSONA_ORDER.forEach(p => setSeatState(p.id, 'waiting'));
    setHostState('dim');
    setTableTopic('—');
  } else if (n === 2) {
    // Facilitator solo — host will transition to speaking as it streams
    setHostState('lit');
  } else if (n === 3) {
    // Facts gathering — each persona asks, advisors activate per SSE
    setHostState('dim');
  } else if (n === 4) {
    // Persona opinions — host quiet, advisors dim until they speak
    setHostState('dim');
  } else {
    // Steps 5-8: linear fallback inside sidebar; seats neutral
    setHostState('lit');
  }
  // Rehydrate scene bubbles from saved session files (fire-and-forget; noop in linear mode).
  rehydrateSceneForStep(n);
}

// Populate scene bubbles from persisted session files so the 圆桌 is alive
// when a user resumes or browses a completed step. Mirrors live-stream output:
// host bubble for Step 2+ locked question, persona bubbles for Step 3 questions
// and Step 4 opinions. Steps 5-8 rely on sidebar cards (existing convention).
async function rehydrateSceneForStep(n) {
  if (!document.body.classList.contains('rt-mode')) return;
  if (!PID || !SID) return;
  rtClearHostBubble();
  rtClearPersonaBubbles();
  // Step 6-only chrome (dim tracker + seat camp colors + 3-arc seat layout)
  // shouldn't bleed forward into Step 7+. Clear them here unconditionally;
  // runS6 re-adds when the debate starts.
  if (n !== 6) {
    rtClearDimTracker();
    clearAllSeatCamps();
    rtRestoreSeatPositions();
  }
  // Spotlight is Step 4 + Step 6 only.
  if (n !== 4 && n !== 6) {
    rtSpotlightClear();
  }
  try {
    if (n >= 2) {
      const locked = await loadFile('01-defined.md');
      if (locked && locked.trim()) {
        // Locked 核心问题 lives in the lower-left pill (Michael 2026-04-25) —
        // the big host bubble is reserved for live speech (Step 2 clarify,
        // Step 5 synthesis, Step 7 pre-mortem, Step 8 Bayesian).
        rtShowTopicPill(locked);
      }
    } else {
      rtClearTopicPill();
    }
    // Step 1 + Step 2 review: show the user's raw question + locked statement
    // as the host bubble so rt-mode actually has something to look at when the
    // case-owner clicks back to those steps. Without these, both steps render
    // as empty stage in roundtable mode (Michael 2026-04-25 review).
    if (n === 1) {
      const raw = await loadFile('00-raw-input.md');
      if (raw && raw.trim()) {
        rtShowHostBubble(raw, {streaming: false, tag: '🗣 案主原话', variant: 'summary'});
      }
    }
    if (n === 2) {
      const defined = await loadFile('01-defined.md');
      if (defined && defined.trim()) {
        rtShowHostBubble(defined, {streaming: false, tag: '🔒 锁定问题', variant: 'summary'});
      }
    }
    if (n === 3) {
      const qJson = await loadFile('02-facts-questions.json');
      if (qJson) {
        let qs = [];
        try { qs = JSON.parse(qJson); } catch {}
        qs.forEach(q => {
          const p = pdata(q.persona);
          if (p.slug) rtShowBubble(p.slug, p.short, q.question || '', {streaming: false});
        });
      }
    }
    if (n === 4) {
      // Backend filename convention: spaces → hyphens (see steps/mod.rs:572).
      // "Paul Graham" → "Paul-Graham.md"; Chinese names keep as-is.
      await Promise.all(activePersonas.map(async p => {
        const filename = encodeURIComponent(p.name.replace(/ /g, '-'));
        const text = await loadFile(`03-opinions/${filename}.md`);
        if (text && text.trim()) rtShowBubble(p.slug, p.short || p.name, text, {streaming: false});
      }));
    }
    if (n === 5) {
      const dimMd = await loadFile('04-dimensions.md');
      if (dimMd && dimMd.trim()) rtShowHostBubble(dimMd, {streaming: false, tag: '📐 维度拆解', variant: 'dimensions'});
    }
    if (n === 6) {
      // Rehydrate the LAST dimension's debate — it's the most recent scene and
      // approximates "resume where you left off". Full history stays in sidebar.
      const debateMd = await loadFile('05-debate.md');
      if (debateMd && debateMd.trim()) {
        const lastDim = extractLastDebateDimension(debateMd);
        if (lastDim) {
          (lastDim.advisors || []).forEach(a => {
            if (a.slug) rtShowBubble(a.slug, a.short || a.name, a.body, {streaming: false});
          });
          if (lastDim.synthesis) {
            rtShowHostBubble(lastDim.synthesis, {streaming: false, tag: '📋 主持人提炼', variant: 'summary'});
          }
        }
      }
    }
    if (n === 7) {
      const [premortem, summary] = await Promise.all([
        loadFile('premortem.md'),
        loadFile('06-summary.md'),
      ]);
      // Prefer summary (the later phase); fall back to premortem if that's all
      // the session has.
      if (summary && summary.trim()) {
        rtShowHostBubble(summary, {streaming: false, tag: '📋 秘书汇总', variant: 'summary'});
      } else if (premortem && premortem.trim()) {
        rtShowHostBubble(premortem, {streaming: false, tag: '⚠️ 事前演练', variant: 'premortem'});
      }
    }
    if (n === 8) {
      const [evalsFile, bayesianFile] = await Promise.all([
        loadFile('07-persona-evals.md'),
        loadFile('07-bayesian.md'),
      ]);
      if (evalsFile) {
        const blocks = parseAdvisorEvalBlocks(evalsFile);
        blocks.matched.forEach(b => {
          if (b.slug) rtShowBubble(b.slug, b.short || b.name, b.body, {streaming: false});
        });
      }
      if (bayesianFile && bayesianFile.trim()) {
        rtShowHostBubble(bayesianFile, {streaming: false, tag: '📊 贝叶斯迭代', variant: 'bayesian'});
      }
    }
  } catch { /* best-effort; UI keeps working even if files missing */ }
}

// Pull the last `## {Dimension …}` section out of 05-debate.md, then split its
// body by `## {PersonaName}` into advisor blocks + collect trailing secretary
// synthesis (marked as `### 整合` in run_debate's wrapper). Returns null when
// the file doesn't parse.
function extractLastDebateDimension(text) {
  if (!text) return null;
  const lines = text.split('\n');
  // Find the last top-level dimension header
  const isTopDimHeader = (l) => /^##\s+Dimension\b/i.test(l) || /^##\s+维度\s*\d+/.test(l);
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isTopDimHeader(lines[i])) { start = i; break; }
  }
  if (start < 0) return null;
  const section = lines.slice(start + 1).join('\n');

  // Split section by second-level `## {Name}` headers (advisors + synthesis)
  const parts = section.split(/\n(?=##\s+)/);
  const advisors = [];
  let synthesis = '';
  for (const raw of parts) {
    const m = raw.match(/^##\s+(.+?)\s*\n([\s\S]*)$/);
    if (!m) continue;
    const title = m[1].trim();
    const body  = m[2].trim();
    const data = matchPersona(title);
    if (data) {
      advisors.push({ name: title, slug: data.slug, short: data.short, body });
    } else if (/整合|synthesis|summary|host/i.test(title)) {
      synthesis = body;
    }
  }
  // Fallback: if the wrapper uses `### 整合` inside the section rather than a
  // top-level `## Synthesis` header, grab it as the facilitator synth.
  if (!synthesis) {
    const synMatch = section.match(/###\s*整合\s*\n([\s\S]*?)(?=\n##\s|$)/);
    if (synMatch) synthesis = synMatch[1].trim();
  }
  return { advisors, synthesis };
}

// Update the locked problem text on the 42° table center.
function setTableTopic(text) {
  const el = document.getElementById('tbl-topic-t');
  if (el) el.textContent = text || '—';
}

/// Small fixed-position pill at the lower-left of the scene pane that holds
/// the locked 核心问题 across Steps 3-8. Replaces the big host bubble for the
/// frozen problem statement so the stage stays uncluttered for live speech.
/// Collapsed: shows the distilled 核心问题 line (first explicit marker hit
/// or first paragraph). Expanded: full markdown rendered, scrollable up to
/// 50vh so long defines stay reachable.
function rtShowTopicPill(text) {
  if (!document.body.classList.contains('rt-mode')) return;
  const pane = document.querySelector('.rt-scene-pane');
  if (!pane) return;
  let pill = document.getElementById('rt-topic-pill');
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'rt-topic-pill';
    pill.className = 'rt-topic-pill';
    pill.innerHTML =
      '<div class="rt-topic-pill-label">核心问题</div>' +
      '<div class="rt-topic-pill-summary"></div>' +
      '<div class="rt-topic-pill-full md-body"></div>';
    pill.onclick = (e) => {
      // Don't toggle when clicking inside the rendered markdown (links etc.)
      if (e.target.closest('a')) return;
      pill.classList.toggle('expanded');
    };
    pane.appendChild(pill);
  }
  const summary = pill.querySelector('.rt-topic-pill-summary');
  const full = pill.querySelector('.rt-topic-pill-full');
  pill.dataset.fullText = text || '';
  if (summary) summary.textContent = extractCoreQuestionEssence(text || '');
  if (full) full.innerHTML = md(text || '');
}

/// Pull the most question-like line out of 01-defined.md for the pill summary.
/// Order of attempts: explicit "**核心问题**" / "## 核心问题" markers, then a
/// "Core Question" English variant, then the first non-empty paragraph stripped
/// of markdown decoration. Falls back to a 90-char truncation.
function extractCoreQuestionEssence(text) {
  if (!text) return '';
  const lines = text.split('\n');

  // Marker patterns: emit the line AFTER the marker if same-line is empty.
  const markerRegexes = [
    /^\s*\*\*核心问题\*\*\s*[:：]?\s*(.+)?$/,
    /^\s*##\s+核心问题\s*[:：]?\s*(.+)?$/,
    /^\s*\*\*Core Question\*\*\s*[:：]?\s*(.+)?$/i,
    /^\s*##\s+Core Question\s*[:：]?\s*(.+)?$/i,
  ];
  for (let i = 0; i < lines.length; i++) {
    for (const re of markerRegexes) {
      const m = lines[i].match(re);
      if (m) {
        let inline = (m[1] || '').trim();
        if (inline) return rtTruncate(stripMd(inline), 120);
        // Marker on its own line — take first non-empty subsequent line
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j].trim();
          if (next && !/^[#>*\-]/.test(next)) return rtTruncate(stripMd(next), 120);
        }
      }
    }
  }
  // Fallback: first non-empty paragraph stripped of markdown chrome.
  const para = lines.map(l => l.trim()).find(l => l && !/^[#>]/.test(l));
  return rtTruncate(stripMd(para || ''), 120);
}

function stripMd(s) {
  return String(s || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function rtClearTopicPill() {
  const pill = document.getElementById('rt-topic-pill');
  if (pill) pill.remove();
}

// Open the speech panel directly from a sidebar card. Used for Step 3/4
// .ocard elements so clicking a card matches the bubble-click UX.
window.openSpeechPanelFromCard = function(card) {
  if (!card) return;
  const name = card.dataset.persona
            || (card.querySelector('.ocard-n') ? card.querySelector('.ocard-n').textContent.replace(/·.*$/, '').trim() : '');
  const p = pdata(name);
  const textEl = card.querySelector('.ocard-t') || card.querySelector('.qa-q');
  const fullText = textEl ? (textEl.textContent || '') : '';
  if (p && p.slug) window.openSpeechPanel(p.slug, name, fullText);
};

// Close speech panel (called from back button or bubble-toggle click).
window.closeSpeechPanel = function() {
  const vs = document.getElementById('view-speech');
  if (vs) vs.classList.remove('open');
  document.querySelectorAll('.rn-bubble.active').forEach(b => b.classList.remove('active'));
  rtOpenPanelSlug = null;
};

// Map SSE persona name → slug using the existing PERSONAS object.
function personaNameToSlug(name) {
  const p = PERSONAS[name];
  return p ? p.slug : null;
}

// Per-persona accumulated speech text (Step 4 + facilitator). Keyed by slug
// for personas and 'facilitator' for the host.
const rtStreamBuffers = new Map();

// Slug of the persona whose speech panel is currently open. Used by
// rtShowBubble to push streaming updates into the panel body in real time.
let rtOpenPanelSlug = null;

// Escape HTML for safe injection into bubble text.
function rtEsc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function rtTruncate(s, n) {
  const str = String(s || '');
  return str.length <= n ? str : str.slice(0, n) + '…';
}

// Color-coded var injection for bubble/panel styling.
function rtApplyPersonaVars(el, slug) {
  const p = Object.values(PERSONAS).find(x => x.slug === slug);
  if (p && el) {
    el.style.setProperty('--pc', p.color);
    // glow = hex with 0.5 alpha approximation
    const hex = p.color.replace('#', '');
    const r = parseInt(hex.substr(0,2), 16);
    const g = parseInt(hex.substr(2,2), 16);
    const b = parseInt(hex.substr(4,2), 16);
    el.style.setProperty('--pc-glow', `rgba(${r},${g},${b},.4)`);
  }
}

// Show a persona bubble above the active seat (both layouts supported via
// getSeatEl). If bubble already exists for this slug, update in place.
//
// Click behavior (2026-04-24 redesign): bubble expands IN PLACE to a large
// scrollable pane the size of the facilitator's bubble, preserving the
// advisor's identity color. Clicking again (or outside) collapses it back.
// For Step 3 before answers are submitted, a composer textarea sits inside
// the expanded bubble so the case-owner can reply without losing context.
function rtShowBubble(slug, name, text, opts) {
  if (!document.body.classList.contains('rt-mode')) return;
  const seat = getSeatEl(slug);
  if (!seat) return;
  let bubble = seat.querySelector('.rn-bubble');
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.className = 'rn-bubble';
    bubble.dataset.slug = slug;
    bubble.dataset.personaName = name;
    rtApplyPersonaVars(bubble, slug);
    bubble.innerHTML =
      `<div class="rn-bubble-tag">${rtEsc(name)}</div>` +
      `<div class="rn-bubble-text cur"></div>` +
      `<div class="rn-bubble-hint">点击展开 ↗</div>`;
    // Click = toggle expanded. Close any other expanded bubble first so we
    // only have one open at a time.
    bubble.onclick = (e) => {
      e.stopPropagation();
      if (bubble.classList.contains('expanded')) {
        collapseBubble(bubble);
      } else {
        document.querySelectorAll('.rn-bubble.expanded').forEach(b => {
          if (b !== bubble) collapseBubble(b);
        });
        expandBubble(bubble);
      }
    };
    seat.appendChild(bubble);
  }
  bubble.dataset.fullText = text || '';
  bubble.dataset.personaName = name;
  const txtEl = bubble.querySelector('.rn-bubble-text');
  if (txtEl) txtEl.textContent = text || '';
  // Expanded overlay (portaled to body) tracks the stream in parallel.
  syncExpandedOverlayBody(slug, text || '');
  if (opts && opts.streaming === false) {
    if (txtEl) txtEl.classList.remove('cur');
  }
  // Legacy path: if the right-slide speech panel is open for this slug (via
  // a sidebar card click), keep its body in sync with the live stream.
  if (slug === rtOpenPanelSlug) {
    const body = document.getElementById('vs-body');
    if (body) body.innerHTML = md(text || '');
  }
}

/// Track the currently open overlay so we can update its body while streaming
/// and so clicking another bubble can close it. One overlay at a time.
let _expandedOverlay = null;  // { slug, node, bubble }

/// Step 3 auto-advance chain (user-mode): while set, save/skip in an expanded
/// composer triggers the next advisor's bubble automatically. `null` when no
/// chain is active (normal free-click behaviour).
let _step3AdvanceNext = null;

/// Expand a bubble. The seats use `transform:translate(-50%,-50%)` which
/// creates a containing block — so a `position:fixed` descendant would be
/// anchored to the seat, not the viewport, and right-side seats ended up
/// hiding the expanded pane behind the sidebar (Michael 2026-04-24). Fix:
/// portal the expanded content to `document.body`. The collapsed bubble
/// stays at the seat unchanged; a separate overlay holds the full markdown
/// + close button + Step-3 composer.
function expandBubble(bubble) {
  if (_expandedOverlay) collapseBubble(_expandedOverlay.bubble);

  bubble.classList.add('expanded');
  const slug = bubble.dataset.slug;
  const name = bubble.dataset.personaName || '';
  const fullText = bubble.dataset.fullText || '';
  const curStep = currentActiveStep();

  // T1.2 (2026-04-25): scrim provides modal feel + extra-fat tap target
  // for closing on touch devices. Outside-click is also handled at document
  // level via ensureOutsideClickCollapse, so this is defense-in-depth.
  const scrim = document.createElement('div');
  scrim.className = 'rn-bubble-scrim';
  scrim.onclick = (e) => {
    e.stopPropagation();
    if (_expandedOverlay) collapseBubble(_expandedOverlay.bubble);
  };
  document.body.appendChild(scrim);

  const overlay = document.createElement('div');
  overlay.className = 'rn-bubble-overlay';
  overlay.dataset.slug = slug;
  rtApplyPersonaVars(overlay, slug);
  overlay.innerHTML =
    `<div class="rn-bubble-tag">${rtEsc(name)}</div>` +
    `<button type="button" class="rn-bubble-close" aria-label="关闭">×</button>` +
    `<div class="rn-bubble-body md-body"></div>`;
  document.body.appendChild(overlay);

  const body = overlay.querySelector('.rn-bubble-body');
  body.innerHTML = md(fullText || '');
  body.setAttribute('data-markable', '');
  body.setAttribute('data-step', String(curStep || 4));
  body.setAttribute('data-persona', name);

  overlay.querySelector('.rn-bubble-close').onclick = (e) => {
    e.stopPropagation();
    collapseBubble(bubble);
  };
  overlay.onclick = (e) => e.stopPropagation();

  // Inline composer (Step 3 only, before Step 4 begins)
  const composerNeeded = curStep === 3 && !stepStarted[4] && slug && slug !== 'facilitator';
  wireExpandedComposer(overlay, bubble, slug, composerNeeded);

  // F2 (2026-04-26) · Per-bubble follow-up composer. Available once persona
  // has spoken (Step 4+) and not for facilitator. Lets case-owner deepen
  // a single persona's voice without disrupting the rest of the flow.
  const followUpAllowed =
    curStep >= 4 &&
    slug &&
    slug !== 'facilitator' &&
    !!name;
  console.info('[F2] composer gate', { curStep, slug, name, allowed: followUpAllowed });
  if (followUpAllowed) mountFollowUpComposer(overlay, bubble, slug, name);

  ensureOutsideClickCollapse();

  _expandedOverlay = { slug, node: overlay, bubble, scrim };
}

// F2 (2026-04-26) — count existing 用户追问 blocks in fullText to enforce
// the soft cap (≤2 per persona). The blocks are appended by the backend as
// "### 用户追问 (timestamp)" sections.
function _countFollowUps(text) {
  if (!text) return 0;
  const m = text.match(/^###\s*用户追问\b/gm);
  return m ? m.length : 0;
}

function mountFollowUpComposer(overlay, bubble, slug, name) {
  // 2026-04-26 v2 · Always mount; if the persona is still streaming, keep
  // the input disabled until the bubble loses its `.cur` class. The prior
  // version early-returned on `.cur` and never re-mounted, so opening a
  // bubble during stream meant the composer never appeared.
  const txtEl = bubble.querySelector('.rn-bubble-text');
  const isStreaming = !!(txtEl && txtEl.classList.contains('cur'));

  const fullText = bubble.dataset.fullText || '';
  const used = _countFollowUps(fullText);
  const remaining = Math.max(0, 2 - used);
  const inputDisabled = remaining === 0 || isStreaming;

  const wrap = document.createElement('div');
  wrap.className = 'fu-composer';
  wrap.innerHTML =
    '<div class="fu-label">想问 ' + rtEsc(name) + ' 什么？<span class="fu-counter">还可问 ' + remaining + ' 次</span></div>' +
    '<textarea class="fu-input" rows="2" placeholder="' +
    (isStreaming ? '等 ' + rtEsc(name) + ' 说完再追问…' : remaining > 0 ? '一句话直接追问（≤80字回应）…' : '已用满 2 次追问，下一步会读取已有内容') +
    '"' + (inputDisabled ? ' disabled' : '') + '></textarea>' +
    '<div class="fu-row">' +
    '<button type="button" class="fu-send"' + (inputDisabled ? ' disabled' : '') + '>发送追问 →</button>' +
    '<div class="fu-status"></div>' +
    '</div>';
  overlay.appendChild(wrap);

  // If streaming, poll for `.cur` removal and re-enable input
  if (isStreaming && txtEl) {
    const poll = setInterval(() => {
      if (!document.body.contains(wrap)) { clearInterval(poll); return; }
      if (!txtEl.classList.contains('cur')) {
        const input = wrap.querySelector('.fu-input');
        const send = wrap.querySelector('.fu-send');
        const newRemaining = Math.max(0, 2 - _countFollowUps(bubble.dataset.fullText || ''));
        if (input && newRemaining > 0) {
          input.disabled = false;
          input.placeholder = '一句话直接追问（≤80字回应）…';
        }
        if (send && newRemaining > 0) send.disabled = false;
        clearInterval(poll);
      }
    }, 400);
  }

  const input = wrap.querySelector('.fu-input');
  const sendBtn = wrap.querySelector('.fu-send');
  const status = wrap.querySelector('.fu-status');
  if (!sendBtn || !input) return;

  sendBtn.onclick = async () => {
    const q = (input.value || '').trim();
    if (!q || q.length < 2) {
      status.textContent = '至少 2 个字';
      return;
    }
    input.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '回应中…';
    status.textContent = '';

    // Render a placeholder block in the overlay body so the case-owner sees
    // the new exchange take shape live.
    const overlayBody = overlay.querySelector('.rn-bubble-body');
    const liveBlock = document.createElement('div');
    liveBlock.className = 'fu-live md-body';
    liveBlock.innerHTML =
      '<hr><div class="fu-live-q"><strong>你问：</strong>' + rtEsc(q) + '</div>' +
      '<div class="fu-live-a cur"></div>';
    if (overlayBody) overlayBody.appendChild(liveBlock);
    const liveAns = liveBlock.querySelector('.fu-live-a');

    let answerText = '';
    try {
      const url = API + '/api/projects/' + encodeURIComponent(PID) + '/sessions/' + encodeURIComponent(SID) + '/follow-ups/' + encodeURIComponent(slug);
      await streamSSE(url, { question: q }, {
        persona_chunk(e) {
          if (!e || !e.chunk) return;
          answerText += e.chunk;
          if (liveAns) liveAns.textContent = answerText;
        },
        persona_done() {
          if (liveAns) {
            liveAns.classList.remove('cur');
            liveAns.innerHTML = md(answerText);
          }
        },
        step_done() {},
      });
      // Refresh bubble text from the now-updated opinion file in IDB.
      const opinionFile = '03-opinions/' + name.replace(/ /g, '-') + '.md';
      const updated = await loadFile(opinionFile);
      if (updated) {
        bubble.dataset.fullText = updated;
        if (txtEl) txtEl.textContent = rtTruncate(updated, 40);
      }
      status.textContent = '✓ 已加入幕僚发言';
      // Update remaining counter
      const newUsed = _countFollowUps(updated || '');
      const newRemaining = Math.max(0, 2 - newUsed);
      const counter = wrap.querySelector('.fu-counter');
      if (counter) counter.textContent = '还可问 ' + newRemaining + ' 次';
      if (newRemaining > 0) {
        input.value = '';
        input.disabled = false;
        sendBtn.disabled = false;
        sendBtn.textContent = '发送追问 →';
      } else {
        input.placeholder = '已用满 2 次追问';
        input.disabled = true;
        sendBtn.textContent = '已用满';
      }
    } catch (e) {
      status.textContent = '失败：' + (e && e.message || String(e));
      input.disabled = false;
      sendBtn.disabled = false;
      sendBtn.textContent = '重试 →';
      if (liveAns) liveAns.classList.remove('cur');
    }
  };
}

function collapseBubble(bubble) {
  bubble.classList.remove('expanded');
  const txtEl = bubble.querySelector('.rn-bubble-text');
  if (txtEl) txtEl.textContent = rtTruncate(bubble.dataset.fullText || '', 40);
  if (_expandedOverlay && _expandedOverlay.bubble === bubble) {
    _expandedOverlay.node.remove();
    if (_expandedOverlay.scrim) _expandedOverlay.scrim.remove();
    _expandedOverlay = null;
  }
}

/// Push live-streaming text into the currently expanded overlay if its slug
/// matches. Called from `rtShowBubble` so expanded bubbles keep typing.
function syncExpandedOverlayBody(slug, fullText) {
  if (!_expandedOverlay || _expandedOverlay.slug !== slug) return;
  const body = _expandedOverlay.node.querySelector('.rn-bubble-body');
  if (body) body.innerHTML = md(fullText || '');
}

/// Mount / update / hide the composer inside an expanded bubble overlay. `overlay`
/// is the portal element (where the composer DOM lives); `bubble` is the actual
/// seat bubble (what `collapseBubble` matches against `_expandedOverlay`). Source
/// of truth for the answer remains the sidebar Step 3 textarea (`.qa-card .qa-a`),
/// so bi-directional sync is needed. If `show` is false or no sidebar target
/// exists, the composer is removed.
function wireExpandedComposer(overlay, bubble, slug, show) {
  let box = overlay.querySelector('.rn-bubble-composer');
  const target = show ? document.querySelector(`.qa-card[data-p="${slug}"] .qa-a`) : null;
  if (!target) {
    if (box) box.remove();
    return;
  }
  if (!box) {
    box = document.createElement('div');
    box.className = 'rn-bubble-composer';
    box.innerHTML =
      `<textarea class="rn-composer-txt" rows="3" placeholder="你的回答…"></textarea>` +
      `<div class="rn-composer-actions">` +
        `<button type="button" class="rn-composer-btn rn-composer-save">保存 & 下一条</button>` +
        `<button type="button" class="rn-composer-btn rn-composer-skip">跳过</button>` +
      `</div>`;
    overlay.appendChild(box);
  }
  const ta = box.querySelector('.rn-composer-txt');
  const btnSave = box.querySelector('.rn-composer-save');
  const btnSkip = box.querySelector('.rn-composer-skip');
  ta.value = target.value || '';
  ta.oninput = () => { target.value = ta.value; };
  btnSave.onclick = (e) => {
    e.stopPropagation();
    target.value = ta.value;
    collapseBubble(bubble);
    // If an auto-chain flow is active (Step 3 sequential walkthrough), hand off.
    if (typeof _step3AdvanceNext === 'function') {
      const fn = _step3AdvanceNext;
      setTimeout(fn, 220);  // let collapse animation play
    }
  };
  btnSkip.onclick = (e) => {
    e.stopPropagation();
    // Write sentinel so save_facts_answers captures the skip on submit; the
    // advisor's thread downstream sees "（跳过）" rather than an empty string.
    target.value = '（跳过）';
    ta.value = '（跳过）';
    collapseBubble(bubble);
    if (typeof _step3AdvanceNext === 'function') {
      const fn = _step3AdvanceNext;
      setTimeout(fn, 220);
    }
  };
  // Stop clicks inside the composer from bubbling up to the bubble's onclick
  // (which would toggle collapse).
  box.onclick = (e) => e.stopPropagation();
}

/// Best-effort probe for which Step the user is currently on. Prefers the
/// rt-mode progress strip's `.now` node; falls back to scanning `.step.active`.
function currentActiveStep() {
  const nowNode = document.querySelector('.rt-pnode.now');
  if (nowNode) return parseInt(nowNode.dataset.step);
  const activeLinear = document.querySelector('.step.active');
  if (activeLinear) {
    const m = activeLinear.id && activeLinear.id.match(/^s(\d+)$/);
    if (m) return parseInt(m[1]);
  }
  return 0;
}

/// Install a one-shot document-level listener that collapses the expanded
/// overlay when the user clicks outside. Idempotent — safe to call many times.
let _outsideClickCollapseInstalled = false;
function ensureOutsideClickCollapse() {
  if (_outsideClickCollapseInstalled) return;
  _outsideClickCollapseInstalled = true;
  document.addEventListener('click', (e) => {
    if (!_expandedOverlay) return;
    const t = e.target;
    if (!t) return;
    // Clicks on the overlay itself, or on the collapsed bubble that owns it,
    // should NOT close (that's handled by the toggle onclick).
    if (t.closest('.rn-bubble-overlay')) return;
    if (t.closest('.rn-bubble')) return;
    collapseBubble(_expandedOverlay.bubble);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _expandedOverlay) {
      collapseBubble(_expandedOverlay.bubble);
    }
  });
}

// Host bubble for facilitator / secretary streaming.
// opts.tag overrides the default "🎙 主持人" label — Steps 5/7/8 use this to
// swap in "📐 维度拆解" / "⚠️ 事前演练" / "📋 秘书汇总" / "📊 贝叶斯迭代".
// opts.variant applies a CSS class (e.g. 'premortem') for color theming.
function rtShowHostBubble(text, opts) {
  if (!document.body.classList.contains('rt-mode')) return;
  const ring = document.getElementById('ring-scene');
  const tbl  = document.getElementById('table-scene');
  const host = (tbl && tbl.classList.contains('on')) ? document.getElementById('th-host')
             : (ring && ring.classList.contains('on')) ? document.getElementById('rh')
             : null;
  if (!host) return;
  const tagText = (opts && opts.tag) || '🎙 主持人';
  const variant = (opts && opts.variant) || '';
  let bubble = host.querySelector('.rn-bubble');
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.className = 'rn-bubble host-bubble';
    bubble.dataset.slug = 'facilitator';
    bubble.innerHTML = `<div class="rn-bubble-tag"></div><div class="rn-bubble-text cur"></div>`;
    host.appendChild(bubble);
  }
  const tagEl = bubble.querySelector('.rn-bubble-tag');
  if (tagEl) tagEl.textContent = tagText;
  bubble.classList.remove('v-premortem', 'v-bayesian', 'v-summary', 'v-dimensions');
  if (variant) bubble.classList.add('v-' + variant);
  const txtEl = bubble.querySelector('.rn-bubble-text');
  if (txtEl) txtEl.innerHTML = md(text || '');
  if (opts && opts.streaming === false) {
    if (txtEl) txtEl.classList.remove('cur');
    if (!bubble.querySelector('.rn-bubble-hint')) {
      const hint = document.createElement('div');
      hint.className = 'rn-bubble-hint';
      hint.textContent = '完成';
      bubble.appendChild(hint);
    }
  } else {
    // streaming=true (or unset) — keep the cursor on, remove any stale "完成" hint
    if (txtEl) txtEl.classList.add('cur');
    const hint = bubble.querySelector('.rn-bubble-hint');
    if (hint) hint.remove();
  }
}

function rtClearHostBubble() {
  document.querySelectorAll('#rh .rn-bubble, #th-host .rn-bubble').forEach(b => b.remove());
}

// T2.1 (2026-04-25) — Step 6 focus mode helpers. When advisor X is the
// current speaker, fade others to 22% so the case-owner's eye locks on X
// first. After a speaker finishes, their bubble drops to 62% (still
// readable) until the next speaker starts. dimension_done clears all
// fades so the case-owner can compare bubbles side-by-side at the end
// of each dim.
function rtFocusOnSpeaker(slug) {
  if (!document.body.classList.contains('rt-mode')) return;
  document.querySelectorAll('.rn-bubble').forEach(b => {
    if (b.classList.contains('host-bubble')) return;
    if (b.dataset.slug === slug) {
      b.classList.remove('dimmed', 'completed');
    } else if (!b.classList.contains('completed')) {
      b.classList.add('dimmed');
      b.classList.remove('completed');
    } else {
      // already completed — keep at completed level, don't dim further
      b.classList.remove('dimmed');
    }
  });
}
function rtMarkSpeakerCompleted(slug) {
  if (!document.body.classList.contains('rt-mode')) return;
  const sel = `.rn-bubble[data-slug="${(slug || '').replace(/"/g,'')}"]`;
  document.querySelectorAll(sel).forEach(b => {
    b.classList.remove('dimmed');
    b.classList.add('completed');
  });
}
function rtClearAllFocusFades() {
  document.querySelectorAll('.rn-bubble.dimmed, .rn-bubble.completed').forEach(b => {
    b.classList.remove('dimmed', 'completed');
  });
}

function rtClearPersonaBubbles() {
  document.querySelectorAll('.rn .rn-bubble, .seat-adv .rn-bubble').forEach(b => b.remove());
}

// Open the right-side speech panel with full markdown rendering.
window.openSpeechPanel = function(slug, name, fullText) {
  const vs   = document.getElementById('view-speech');
  const av   = document.getElementById('vs-av');
  const nm   = document.getElementById('vs-name');
  const meta = document.getElementById('vs-meta');
  const body = document.getElementById('vs-body');
  if (!vs) return;
  const p = Object.values(PERSONAS).find(x => x.slug === slug);
  if (av) {
    av.textContent = slug === 'huineng' ? '🪷' : (p && p.initial) || '🎙';
    rtApplyPersonaVars(av, slug);
  }
  if (nm)   nm.textContent   = name || (p && p.label) || '';
  // Best-effort current step probe from the sidebar progress strip.
  const nowNode = document.querySelector('.rt-pnode.now');
  const curStep = nowNode ? parseInt(nowNode.dataset.step) : 0;
  if (meta) {
    meta.textContent = slug === 'facilitator' ? '主持人 · 发言'
                     : curStep === 3 ? 'STEP 3 · 幕僚提问'
                     : 'STEP 4 · 幕僚发言';
  }
  if (body) {
    body.innerHTML = md(fullText || '');
    body.setAttribute('data-markable', '');
    body.setAttribute('data-step', String(curStep || 4));
    body.setAttribute('data-persona', name || '');
  }
  rtWireComposer(slug, curStep);
  vs.classList.add('open');
  rtOpenPanelSlug = slug;
};

// Wire the in-panel composer to the matching sidebar input. Source of truth
// remains the sidebar field; composer is a second entry point so the user
// doesn't have to close the panel to write.
//
// The composer is strictly gated (Michael 2026-04-24): it only shows in the
// narrow window where the case-owner is *expected* to write — Step 2 replies
// to the facilitator, OR Step 3 answers BEFORE they've been submitted. In
// Step 4+ opinions (and any cached/resumed view of Step 3 after submission),
// the composer stays hidden so the panel reads as pure advisor speech.
function rtWireComposer(slug, step) {
  const wrap = document.getElementById('vs-composer');
  const ta   = document.getElementById('vs-composer-txt');
  const btn  = document.getElementById('vs-composer-btn');
  if (!wrap || !ta || !btn) return;
  // Determine the sidebar target this composer mirrors.
  let target = null;
  let submitOnClick = false;
  if (step === 2 && slug === 'facilitator') {
    target = document.getElementById('s2-input');
    submitOnClick = true; // Step 2 sidebar has a single-field 发送 submit
  } else if (step === 3 && slug && slug !== 'facilitator' && !stepStarted[4]) {
    // Step 3 composer only before Step 4 has started. Once opinions begin,
    // the Step 3 Q/A textareas are stale and the panel should be read-only.
    target = document.querySelector(`.qa-card[data-p="${slug}"] .qa-a`);
  }
  if (!target) { wrap.hidden = true; return; }
  wrap.hidden = false;
  ta.value = target.value || '';
  btn.textContent = submitOnClick ? '发送 →' : '保存 & 关闭';
  // Bi-directional sync while panel is open.
  const onInput = () => { target.value = ta.value; };
  ta.oninput = onInput;
  btn.onclick = () => {
    target.value = ta.value;
    if (submitOnClick && typeof window.sendS2 === 'function') {
      window.sendS2();
    }
    window.closeSpeechPanel();
  };
}

// ESC key closes the speech panel.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.closeSpeechPanel();
});

// ─── Utilities ──────────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/// Lightweight toast — appends a fixed-position bar to the top of the viewport
/// and auto-removes it after 3 s.
function showToast(msg, type = 'error') {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed','top:16px','left:50%','transform:translateX(-50%)',
    'z-index:99999','padding:10px 20px','border-radius:8px',
    'font-size:14px','max-width:360px','text-align:center',
    'pointer-events:none','transition:opacity .3s',
    `background:${type === 'error' ? '#c0392b' : '#27ae60'}`,
    'color:#fff'
  ].join(';');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}

function slugify(s) {
  return String(s).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_");
}

// ─── Phrase-level highlight engine (Phase 2.13 — 2026-04-22 升级) ────────────
// Replaces card-level ⭐/❗/📝 toolbar. User selects any text inside a
// [data-markable] container → floating toolbar appears → click ⭐/❗/📝 wraps
// the selection in <mark> and POSTs to /reactions with snippet + prefix/suffix
// anchors. On resume/reload, applyAllSavedMarks() replays all saved marks from
// user-reactions.md. Card-level reactions entirely removed.

const PHRASE_CONTEXT_LEN = 40;

// Kept as stub so any stragglers don't throw (reactionToolbarHtml was called
// inline in card-rendering sites during streaming; those calls are removed).
function reactionToolbarHtml(_step, _personaName) { return ''; }

function findMarkableAncestor(node) {
  let el = node && node.nodeType === 3 ? node.parentElement : node;
  while (el && el !== document.body) {
    if (el.dataset && el.dataset.markable !== undefined) return el;
    el = el.parentElement;
  }
  return null;
}

function markElementFor(reaction) {
  const el = document.createElement('mark');
  const cls = reaction === '⭐' ? 'r-star' : reaction === '❗' ? 'r-bang' : 'r-note';
  el.className = cls;
  return el;
}

// Convert character offsets within container.textContent into a DOM Range.
function rangeFromOffsets(container, start, end) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const range = document.createRange();
  let n, offset = 0, foundStart = false;
  while ((n = walker.nextNode())) {
    const len = n.nodeValue.length;
    if (!foundStart && offset + len >= start) {
      range.setStart(n, start - offset);
      foundStart = true;
    }
    if (foundStart && offset + len >= end) {
      range.setEnd(n, end - offset);
      return range;
    }
    offset += len;
  }
  return null;
}

// Split a range spanning multiple text nodes into per-node wrapping.
function wrapRangeAcrossNodes(range, reaction, note) {
  const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      return range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  for (const node of nodes) {
    const nRange = document.createRange();
    const nStart = node === range.startContainer ? range.startOffset : 0;
    const nEnd = node === range.endContainer ? range.endOffset : node.nodeValue.length;
    if (nStart >= nEnd) continue;
    nRange.setStart(node, nStart);
    nRange.setEnd(node, nEnd);
    const mark = markElementFor(reaction);
    if (note) mark.title = note;
    try { nRange.surroundContents(mark); } catch {}
  }
}

function applyMark(container, entry) {
  const { prefix, suffix, snippet, reaction, note } = entry;
  if (!snippet) return false;
  const needle = (prefix || '') + snippet + (suffix || '');
  const full = container.textContent;
  let idx = full.indexOf(needle);
  if (idx < 0) {
    // fallback without context windows
    idx = full.indexOf(snippet);
    if (idx < 0) return false;
    const range = rangeFromOffsets(container, idx, idx + snippet.length);
    if (!range) return false;
    const mark = markElementFor(reaction);
    if (note) mark.title = note;
    try { range.surroundContents(mark); } catch { wrapRangeAcrossNodes(range, reaction, note); }
    return true;
  }
  const start = idx + (prefix || '').length;
  const end = start + snippet.length;
  const range = rangeFromOffsets(container, start, end);
  if (!range) return false;
  const mark = markElementFor(reaction);
  if (note) mark.title = note;
  try { range.surroundContents(mark); } catch { wrapRangeAcrossNodes(range, reaction, note); }
  return true;
}

function parseReactionsMarkdown(mdText) {
  const entries = [];
  let current = null;
  for (const line of String(mdText).split('\n')) {
    const header = line.match(/^## .+? — Step (\d+) — (.+?) — (.+)$/);
    if (header) {
      if (current) entries.push(current);
      current = { step: header[1], persona: header[2].trim(), reaction: header[3].trim(), snippet: '', note: '', prefix: '', suffix: '' };
    } else if (current) {
      const s = line.match(/^\*\*Snippet\*\*:\s*(.+)$/);
      if (s) { current.snippet = s[1].trim(); continue; }
      const n = line.match(/^\*\*Note\*\*:\s*(.+)$/);
      if (n) { current.note = n[1].trim(); continue; }
      const a = line.match(/^<!--\s+anchor:\s+prefix="(.*?)"\s+suffix="(.*?)"\s+-->$/);
      if (a) {
        current.prefix = a[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
        current.suffix = a[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
      }
    }
  }
  if (current) entries.push(current);
  return entries.filter(e => e.snippet);
}

async function applyAllSavedMarks(scope) {
  if (!PID || !SID) return;
  const reactionsMd = await loadFile('user-reactions.md');
  if (!reactionsMd) return;
  const entries = parseReactionsMarkdown(reactionsMd);
  const root = scope || document;
  for (const entry of entries) {
    const q = `[data-markable][data-step="${entry.step}"][data-persona="${(window.CSS && CSS.escape) ? CSS.escape(entry.persona) : entry.persona}"]`;
    const containers = root.querySelectorAll(q);
    for (const c of containers) {
      if (applyMark(c, entry)) break;
    }
  }
}

// ─── Floating toolbar & note editor ─────────────────────────────────────────

let phraseToolbarEl = null;
let phraseNoteEditorEl = null;
let currentSelectionData = null;

function initPhraseToolbar() {
  if (phraseToolbarEl) return;
  phraseToolbarEl = document.createElement('div');
  phraseToolbarEl.id = 'phrase-toolbar';
  phraseToolbarEl.style.display = 'none';
  phraseToolbarEl.innerHTML =
    `<button class="pt-btn" data-r="⭐" title="标记为重要">⭐</button>` +
    `<button class="pt-btn" data-r="❗" title="标记为关键">❗</button>` +
    `<button class="pt-btn" data-r="📝" title="加笔记">📝 笔记</button>`;
  document.body.appendChild(phraseToolbarEl);

  phraseNoteEditorEl = document.createElement('div');
  phraseNoteEditorEl.id = 'phrase-note-editor';
  phraseNoteEditorEl.style.display = 'none';
  phraseNoteEditorEl.innerHTML =
    `<div class="pne-snippet"></div>` +
    `<textarea class="pne-input" placeholder="记下你对这段话的想法、共鸣、疑问…幕僚会看到你的视角"></textarea>` +
    `<div class="pne-btns">` +
      `<button class="btn btn-g" onclick="closePhraseNoteEditor()">取消</button>` +
      `<button class="btn btn-w" onclick="submitPhraseNote()">保存笔记</button>` +
    `</div>`;
  document.body.appendChild(phraseNoteEditorEl);

  phraseToolbarEl.addEventListener('mousedown', (e) => e.preventDefault());
  phraseToolbarEl.querySelectorAll('.pt-btn').forEach(b => {
    b.onclick = (e) => { e.stopPropagation(); handleToolbarClick(b.dataset.r); };
  });

  document.addEventListener('mouseup', () => setTimeout(updateToolbarFromSelection, 10));
  document.addEventListener('selectionchange', () => {
    clearTimeout(window.__selectionTimer);
    window.__selectionTimer = setTimeout(updateToolbarFromSelection, 80);
  });
  document.addEventListener('scroll', hideToolbar, true);
  document.addEventListener('mousedown', (e) => {
    if (phraseNoteEditorEl && phraseNoteEditorEl.style.display !== 'none') {
      if (!phraseNoteEditorEl.contains(e.target)) {
        // Click outside editor — leave it open (user may be re-selecting)
      }
    }
  });
}

function updateToolbarFromSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) { hideToolbar(); return; }
  const text = sel.toString();
  if (!text || text.trim().length < 2) { hideToolbar(); return; }
  const range = sel.getRangeAt(0);
  const ancestor = findMarkableAncestor(range.commonAncestorContainer);
  if (!ancestor) { hideToolbar(); return; }
  if (ancestor.classList.contains('cur') || ancestor.closest('.cur')) { hideToolbar(); return; }
  const containerText = ancestor.textContent;
  const preRange = document.createRange();
  preRange.selectNodeContents(ancestor);
  try { preRange.setEnd(range.startContainer, range.startOffset); } catch { hideToolbar(); return; }
  const startOffset = preRange.toString().length;
  const endOffset = startOffset + text.length;
  const prefix = containerText.slice(Math.max(0, startOffset - PHRASE_CONTEXT_LEN), startOffset);
  const suffix = containerText.slice(endOffset, endOffset + PHRASE_CONTEXT_LEN);
  currentSelectionData = {
    step: parseInt(ancestor.dataset.step),
    persona: ancestor.dataset.persona || '-',
    snippet: text,
    prefix,
    suffix,
    range: range.cloneRange(),
    ancestor,
  };
  let rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    const rects = range.getClientRects();
    if (rects.length > 0) rect = rects[0];
  }
  if (rect) {
    phraseToolbarEl.style.top = (rect.top + window.scrollY - 44) + 'px';
    phraseToolbarEl.style.left = Math.max(12, Math.min(window.innerWidth - 180, rect.left + window.scrollX)) + 'px';
    phraseToolbarEl.style.display = 'flex';
  }
}

function hideToolbar() {
  if (phraseToolbarEl) phraseToolbarEl.style.display = 'none';
}

function applyLiveMark(data, reaction, note) {
  const mark = markElementFor(reaction);
  if (note) mark.title = note;
  try { data.range.surroundContents(mark); }
  catch { wrapRangeAcrossNodes(data.range, reaction, note); }
  const sel = window.getSelection();
  if (sel) sel.removeAllRanges();
}

async function handleToolbarClick(reaction) {
  if (!currentSelectionData) return;
  const data = currentSelectionData;
  hideToolbar();
  if (reaction === '📝') { openPhraseNoteEditor(data); return; }
  applyLiveMark(data, reaction, '');
  await postReaction({
    step: data.step, persona: data.persona, reaction,
    snippet: data.snippet, prefix: data.prefix, suffix: data.suffix,
  });
}

function openPhraseNoteEditor(data) {
  phraseNoteEditorEl.querySelector('.pne-snippet').textContent = '「' + data.snippet + '」';
  const input = phraseNoteEditorEl.querySelector('.pne-input');
  input.value = '';
  phraseNoteEditorEl.__data = data;
  let rect = data.range.getBoundingClientRect();
  const rects = data.range.getClientRects();
  if ((!rect || rect.height === 0) && rects.length) rect = rects[0];
  phraseNoteEditorEl.style.top = ((rect ? rect.bottom : 120) + window.scrollY + 8) + 'px';
  phraseNoteEditorEl.style.left = Math.max(12, Math.min(window.innerWidth - 360, (rect ? rect.left : 20) + window.scrollX)) + 'px';
  phraseNoteEditorEl.style.display = 'block';
  setTimeout(() => input.focus(), 50);
}

window.closePhraseNoteEditor = function() {
  if (phraseNoteEditorEl) phraseNoteEditorEl.style.display = 'none';
};

window.submitPhraseNote = async function() {
  const data = phraseNoteEditorEl && phraseNoteEditorEl.__data;
  if (!data) return;
  const note = phraseNoteEditorEl.querySelector('.pne-input').value.trim();
  phraseNoteEditorEl.style.display = 'none';
  applyLiveMark(data, '📝', note);
  await postReaction({
    step: data.step, persona: data.persona, reaction: '📝',
    snippet: data.snippet, prefix: data.prefix, suffix: data.suffix,
    note: note || null,
  });
};

async function postReaction(payload) {
  if (!PID || !SID) return;
  // Phase C · reactions live purely in IndexedDB. Append a new markdown
  // block to session.files['user-reactions.md'] matching the legacy
  // format `### step N · persona X\n📝 snippet\n— note\n<!-- anchor: ... -->`.
  if (!window.CounselDB) return;
  try {
    const session = (await window.CounselDB.loadSession(SID)) || {
      id: SID,
      project_id: PID,
      files: {},
    };
    session.files = session.files || {};
    const existing = session.files['user-reactions.md'] || '';
    const anchor = `<!-- anchor: prefix="${(payload.prefix || '').replace(/"/g, '&quot;')}" suffix="${(payload.suffix || '').replace(/"/g, '&quot;')}" -->`;
    const noteLine = payload.note ? `\n> ${payload.note}\n` : '\n';
    const entry = `\n### Step ${payload.step} · ${payload.persona || ''}\n${payload.reaction} ${payload.snippet}${noteLine}${anchor}\n`;
    session.files['user-reactions.md'] = existing + entry;
    await window.CounselDB.saveSession(session);
  } catch (e) {
    console.error('reaction save failed (IDB)', e);
  }
}

function md(text) {
  if (typeof marked !== "undefined") {
    return marked.parse(String(text));
  }
  return "<p>" + esc(text) + "</p>";
}

// B1 (2026-04-25) · Mode B 双模式 — 结论卡 + 折叠的"详细分析"。
// summary_prompt 现在产出 [结论 + 4 bullet sections] + "## 详细分析" 散文段。
// 这个 helper 把后半段包进 <details>，默认折叠。当模型没产出 ## 详细分析
// 时，行为退化为普通 md()。
function mdWithDetailedAnalysis(text) {
  if (!text) return '';
  const re = /\n?##\s+详细分析[^\n]*\n/;
  const match = String(text).match(re);
  if (!match) return md(text);
  const idx = text.indexOf(match[0]);
  const head = text.slice(0, idx).trim();
  const tail = text.slice(idx + match[0].length).trim();
  return md(head) +
    '<details class="analysis-details">' +
      '<summary>🔎 展开主持人的详细分析（Mode B）</summary>' +
      '<div class="md-body analysis-body">' + md(tail) + '</div>' +
    '</details>';
}

// Phase D · load a session file from IndexedDB (falls back to empty string).
async function loadFile(filename) {
  try {
    if (!window.CounselDB || !SID) return "";
    const session = await window.CounselDB.loadSession(SID);
    if (!session || !session.files) return "";
    return session.files[filename] || "";
  } catch { return ""; }
}

// ─── Persona Identity System ────────────────────────────────────────────────

const PERSONAS = {
  '毛泽东':     { slug: 'mao',      color: '#FF3B3B', initial: '毛', label: '毛泽东',     short: '毛泽东' },
  'Paul Graham':{ slug: 'pg',       color: '#FF8C42', initial: 'PG', label: 'Paul Graham', short: 'PG' },
  'Steve Jobs': { slug: 'jobs',     color: '#B0B0FF', initial: 'SJ', label: 'Steve Jobs',  short: 'Jobs' },
  '李小龙':     { slug: 'brucelee', color: '#FFE066', initial: '龙', label: '李小龙',     short: '李小龙' },
  'Kevin Kelly':{ slug: 'kk',       color: '#4ECDC4', initial: 'KK', label: 'Kevin Kelly', short: 'KK' },
  '六祖慧能':   { slug: 'huineng',  color: '#B39DDB', initial: '禅', label: '六祖慧能',   short: '慧能' },
  '老子':       { slug: 'laozi',    color: '#69D99A', initial: '道', label: '老子',       short: '老子' },
  '庄子':       { slug: 'zhuangzi', color: '#D7B46A', initial: '庄', label: '庄子',       short: '庄子' },
};

function pdata(name) {
  return PERSONAS[name] || { slug: '', color: 'rgba(255,255,255,.3)', initial: String(name).charAt(0), label: name, short: name };
}

function pavatar(name, cls) {
  const p = pdata(name);
  return `<div class="p-av ${cls||''}" data-p="${p.slug}">${p.initial}</div>`;
}

function matchPersona(text) {
  for (const [name, data] of Object.entries(PERSONAS)) {
    if (text.includes(name) || text.includes(data.short) || text.includes(data.label)) return data;
  }
  return null;
}

function setChipState(slug, state) {
  if (!slug) return;
  const chip = document.getElementById('chip-' + slug);
  if (chip) {
    chip.classList.remove('active', 'speaking');
    if (state) chip.classList.add(state);
  }
}

function clearAllChips() {
  document.querySelectorAll('.advisor-chip').forEach(c => c.classList.remove('active', 'speaking'));
}

// ─── SSE Streaming ──────────────────────────────────────────────────────────
// The Rust backend sends SSE events through Axum's SSE layer.
// SseSink.to_sse_data() adds "data: {json}\n\n", then Axum Event::data() wraps again.
// We handle this double wrapping robustly.

async function streamSSE(url, body, handlers) {
  const TOTAL_TIMEOUT = 10 * 60 * 1000; // 10 min max — Step 6 multi-dim debate can run 6+ min
  const IDLE_WARN = 20 * 1000;           // 20s with no data → show "still waiting"
  // 2026-04-27 — bumped 90s → 150s for China-mobile-no-VPN. Carrier NAT
  // sometimes drops idle keepalive between chunks; LLM first-token can also
  // take 30-60s for cold prompts. 90s was clipping legit slow responses.
  const IDLE_TIMEOUT = 150 * 1000;

  const controller = new AbortController();
  const totalTimer = setTimeout(() => controller.abort(), TOTAL_TIMEOUT);

  // Idle detector: tracks time since last chunk
  let lastChunkTime = Date.now();
  let idleWarnTimer = null;
  let idleAbortTimer = null;

  function resetIdleTimers() {
    lastChunkTime = Date.now();
    if (idleWarnTimer) { clearTimeout(idleWarnTimer); idleWarnTimer = null; }
    if (idleAbortTimer) { clearTimeout(idleAbortTimer); idleAbortTimer = null; }
    idleWarnTimer = setTimeout(() => {
      console.warn(`[streamSSE] ${url.split('/').pop()} idle ${IDLE_WARN/1000}s — network or LLM may be stalled`);
      if (handlers._onIdle) handlers._onIdle();
    }, IDLE_WARN);
    idleAbortTimer = setTimeout(() => {
      console.error(`[streamSSE] ${url.split('/').pop()} idle ${IDLE_TIMEOUT/1000}s — aborting as stalled`);
      controller.abort();
    }, IDLE_TIMEOUT);
  }

  function cleanupTimers() {
    clearTimeout(totalTimer);
    if (idleWarnTimer) clearTimeout(idleWarnTimer);
    if (idleAbortTimer) clearTimeout(idleAbortTimer);
  }

  // Phase C — attach prior_state so the server can run this step against a
  // tempdir (no persistent server state). If PID/SID unknown (Step 1 create
  // flow) we skip; the server falls back to its legacy shared storage.
  let finalBody = body || {};
  const isStepUrl = url.includes('/steps/');
  const isFollowUpUrl = url.includes('/follow-ups/');
  const isFreestyleUrl = url.includes('/freestyle');
  // 2026-04-26 v4 — freestyle endpoint also needs prior_state hydration.
  // Without this, tempdir is empty → list_opinions returns 0 → backend
  // emits "Step 4 opinions not found" even when Step 4 already ran.
  if (window.CounselDB && PID && SID && (isStepUrl || isFollowUpUrl || isFreestyleUrl)) {
    try {
      finalBody = Object.assign({}, finalBody, {
        prior_state: await window.CounselDB.buildPriorState(PID, SID),
      });
    } catch (e) {
      console.warn('buildPriorState failed, falling back to server-side storage', e);
    }
  }

  // F6b (2026-04-26) — mark in-progress for step calls so resumeSession can
  // detect mid-stream interruption (browser closed before step_done fired).
  // Skipped for follow-ups since they don't represent flow progression.
  let _stepNumForMark = null;
  if (window.CounselDB && PID && SID && isStepUrl) {
    const m = url.match(/\/steps\/(\d+)/);
    if (m) {
      _stepNumForMark = parseInt(m[1], 10);
      if (!isNaN(_stepNumForMark)) {
        try { await window.CounselDB.markStepInProgress(SID, _stepNumForMark); } catch {}
      }
    }
  }

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(finalBody),
      signal: controller.signal,
    });
  } catch (e) {
    cleanupTimers();
    if (e.name === "AbortError") throw new Error("请求超时，请检查网络连接后重试");
    throw e;
  }

  if (!res.ok) {
    cleanupTimers();
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  // Phase D fix · non-streaming steps (5, 8) call loadFile() immediately after
  // streamSSE returns. The previous fire-and-forget IDB write let those reads
  // hit before the file landed. Collect the writes here and await them before
  // we resolve.
  const pendingWrites = [];

  resetIdleTimers();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdleTimers();
      buf += decoder.decode(value, { stream: true });

      const parts = buf.split("\n\n");
      buf = parts.pop();

      for (const part of parts) {
        if (!part.trim()) continue;

        const lines = part.split("\n");
        let data = "";
        for (const line of lines) {
          if (line.startsWith("data:")) {
            data += line.slice(5).trimStart();
          }
        }

        data = data.trim();
        if (data.startsWith("data:")) {
          data = data.slice(5).trimStart();
        }

        if (!data) continue;

        const dispatch = (evt) => {
          const fn = handlers[evt.type];
          if (fn) fn(evt);
          if (evt.type === 'step_files' && window.CounselDB && PID && SID) {
            pendingWrites.push(
              window.CounselDB.saveStepFiles(PID, SID, evt.data)
                .catch((e) => console.warn('saveStepFiles failed', e))
            );
          }
          if (evt.type === 'step_done' && window.CounselDB && PID && SID) {
            pendingWrites.push(
              window.CounselDB.bumpSessionStep(SID, evt.step).catch(() => {})
            );
            // F6b — clear in-progress flag the moment the step finishes cleanly
            pendingWrites.push(
              window.CounselDB.clearStepInProgress(SID).catch(() => {})
            );
          }
          // T2.2 (2026-04-25) — bridge step_done to a window-level event so the
          // fast-mode orchestrator (runFastMode) can chain Steps 5→6→7→8 via
          // promises without polling. Only fires for terminal step_done frames.
          if (evt.type === 'step_done') {
            try {
              window.dispatchEvent(new CustomEvent('counsel:step-done', {
                detail: { step: evt.step, data: evt.data || null },
              }));
            } catch {}
          }
        };

        try {
          dispatch(JSON.parse(data));
        } catch {
          const m = data.match(/\{[\s\S]*\}/);
          if (m) {
            try { dispatch(JSON.parse(m[0])); } catch {}
          }
        }
      }
    }
  } catch (e) {
    if (e.name === "AbortError") throw new Error("连接超时，AI回复时间过长，请重试");
    throw e;
  } finally {
    cleanupTimers();
  }

  // Drain IDB writes — guarantees loadFile() in the caller sees the new files.
  if (pendingWrites.length) {
    await Promise.all(pendingWrites);
  }
}

// ─── Step / Progress Management ─────────────────────────────────────────────

let currentStep = 1;
const stepStarted = {};

function showStep(n) {
  // Phase A+ analytics — emit step_completed for the prior step (if any),
  // then step_entered for the new step. Timer keyed by step:session.
  if (window.CounselAnalytics) {
    if (typeof currentStep === 'number' && currentStep !== n) {
      window.CounselAnalytics.endStepTimer(currentStep, SID);
    }
    window.CounselAnalytics.startStepTimer(n, SID);
  }
  currentStep = n;
  document.querySelectorAll(".step").forEach(el => el.classList.remove("active"));
  const el = document.getElementById("s" + n);
  if (el) el.classList.add("active");
  updateProgress(n);
  clearAllChips();
  applyRoundtableStepState(n);
  runStep(n);
}

// Allow clicking progress dots to navigate between completed steps
document.querySelectorAll(".pdot").forEach(dot => {
  dot.style.cursor = "pointer";
  dot.addEventListener("click", () => {
    const step = parseInt(dot.dataset.step);
    if (stepStarted[step] || dot.classList.contains("done") || dot.classList.contains("now")) {
      document.querySelectorAll(".step").forEach(el => el.classList.remove("active"));
      const el = document.getElementById("s" + step);
      if (el) el.classList.add("active");
      // Update current dot highlight without triggering runStep
      document.querySelectorAll(".pdot").forEach(d => d.classList.remove("now"));
      dot.classList.add("now");
    }
  });
});

function updateProgress(n) {
  document.querySelectorAll(".pdot").forEach(dot => {
    const s = parseInt(dot.dataset.step);
    dot.classList.remove("done", "now");
    if (s < n) dot.classList.add("done");
    if (s === n) dot.classList.add("now");
  });
}

function stepUrl(step) {
  return `${API}/api/projects/${PID}/sessions/${SID}/steps/${step}`;
}

// ─── Step 1: Submit Input ───────────────────────────────────────────────────

window.submitInput = async function() {
  const ta = document.getElementById("s1-input");
  const input = ta ? ta.value.trim() : "";
  if (!input) return;

  const btn = document.getElementById("s1-btn");
  if (btn) { btn.textContent = "提交中…"; btn.disabled = true; }

  try {
    // Phase 7.1 — pick up the user-level default advisor set if saved
    let defaultPicks = [];
    try {
      const saved = JSON.parse(localStorage.getItem(PP_STORAGE_KEY) || '[]');
      if (Array.isArray(saved) && saved.length >= 1 && saved.length <= PP_MAX) {
        defaultPicks = saved;
      }
    } catch {}

    // 2026-04-26 — force persona selection. Without this, an empty pick set
    // falls through as `personas: null` → server's active_personas() returns
    // the full registry (19 personas) and the case-owner gets 19 advisors
    // chatting at once. Make picking explicit: surface the picker, abort
    // submit, let user click submit again after confirming picks.
    if (defaultPicks.length === 0) {
      if (btn) { btn.textContent = "提交 →"; btn.disabled = false; }
      alert('请先选择本次想请的幕僚（最多 12 位）。\n\n选好后再点提交。');
      if (typeof openPersonaPicker === 'function') openPersonaPicker();
      return;
    }

    // Phase C — generate IDs client-side and save to IndexedDB. No server
    // roundtrip for project / session creation. Server sees only the
    // step-level `prior_state` payload once we hit streamSSE.
    if (!PID) PID = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));
    if (!SID) SID = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('s-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));

    if (window.CounselDB) {
      const now = new Date().toISOString();
      await window.CounselDB.saveProject({
        id: PID,
        name: input.slice(0, 40),
        created_at: now,
      });
      await window.CounselDB.saveSession({
        id: SID,
        project_id: PID,
        raw_input: input,
        current_step: 1,
        personas: defaultPicks.length ? defaultPicks : null,
        files: { '00-raw-input.md': input },
        created_at: now,
      });
    }

    history.replaceState({}, "", `?projectId=${PID}&sessionId=${SID}`);

    // F5 (2026-04-26) — fire-and-forget category classification. Result is
    // tracked as an analytics event; question text is NOT stored server-side.
    // Failure / timeout: silent (no impact on user flow).
    (async () => {
      try {
        const ctrl = new AbortController();
        const tmo = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(API + '/api/classify-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(window.CounselAuth && window.CounselAuth.headers ? window.CounselAuth.headers() : {}) },
          body: JSON.stringify({ question: input }),
          signal: ctrl.signal,
        });
        clearTimeout(tmo);
        if (!r.ok) return;
        const d = await r.json();
        if (d && d.category && window.CounselAnalytics) {
          window.CounselAnalytics.track('question_categorized', { category: d.category, session_id: SID, project_id: PID });
        }
      } catch {}
    })();

    showStep(2);
  } catch (e) {
    if (btn) { btn.textContent = "提交 →"; btn.disabled = false; }
    showError(document.getElementById("s1"), e.message);
  }
};

// ─── Step 2: Facilitator Define ─────────────────────────────────────────────

async function runS2() {
  if (stepStarted[2]) return;
  stepStarted[2] = true;
  await callFacilitator("");
}

async function callFacilitator(message) {
  const chat = document.getElementById("s2-chat");
  if (!chat) return;

  const lockArea = document.getElementById("s2-lock-area");
  if (lockArea) lockArea.style.display = "none";

  if (message) {
    chat.innerHTML += `<div class="cmsg u"><div class="cav" style="background:rgba(255,255,255,.06)">我</div><div class="cbub u">${esc(message)}</div></div>`;
  }

  const bubId = "s2-bub-" + Date.now();
  chat.innerHTML += `<div class="cmsg"><div class="host-av">🎙</div><div class="cbub f" id="${bubId}"><span style="color:rgba(255,255,255,.3)">思考中…</span></div></div>`;
  chat.scrollTop = chat.scrollHeight;

  let fullText = "";
  let sawDone = false;
  const isRT = document.body.classList.contains('rt-mode');
  if (isRT) {
    setHostState('speaking');
    rtClearHostBubble();
  }

  try {
    await streamSSE(stepUrl(2), { input: message || undefined, auto_simulate: false }, {
      _onIdle() {
        const bub = document.getElementById(bubId);
        if (bub && !fullText) bub.innerHTML = '<span style="color:rgba(255,255,255,.3)">AI正在深度思考，请稍候…</span>';
      },
      facilitator_chunk(e) {
        fullText += e.chunk;
        const bub = document.getElementById(bubId);
        if (bub) bub.innerHTML = '<div class="md-body cur">' + md(fullText) + '</div>';
        chat.scrollTop = chat.scrollHeight;
        if (isRT) rtShowHostBubble(fullText, {streaming: true});
      },
      facilitator_done() {
        sawDone = true;
        const bub = document.getElementById(bubId);
        if (bub) bub.innerHTML = '<div class="md-body">' + md(fullText) + '</div>';
        if (isRT) {
          setHostState('lit');
          rtShowHostBubble(fullText, {streaming: false});
        }
      },
      step_done() {},
    });
  } catch (e) {
    showS2Failure(bubId, e.message || "网络中断");
    return;
  }

  // Silent-failure detection: stream closed but no content arrived, OR no
  // facilitator_done was received. Was a real bug (2026-04-22): token-limit
  // errors emitted via SSE::Error got buried and the user saw a stuck spinner.
  if (!fullText.trim() || !sawDone) {
    showS2Failure(bubId, !fullText.trim()
      ? "AI 没有返回任何内容。可能是上下文过长或模型拒绝。"
      : "流式响应意外中断，内容可能不完整。");
    return;
  }

  const bub = document.getElementById(bubId);
  if (bub) bub.innerHTML = '<div class="md-body">' + md(fullText) + '</div>';

  if (lockArea) {
    lockArea.style.display = "block";
    lockArea.innerHTML = `<button class="btn btn-w btn-full" onclick="lockAndProceed()">确认，开始挖事实 →</button>`;
  }
}

function showS2Failure(bubId, reason) {
  const bub = document.getElementById(bubId);
  const chat = document.getElementById("s2-chat");
  const lockArea = document.getElementById("s2-lock-area");
  if (bub) {
    bub.innerHTML = `<div class="error-msg" style="background:rgba(255,90,90,.15);border:1px solid rgba(255,90,90,.55);color:#ffbcbc;padding:12px 14px;border-radius:8px;line-height:1.6">
      <strong>Step 2 失败：${esc(reason)}</strong><br>
      可以尝试：<br>
      · 点 <button class="btn btn-w" style="margin:4px 2px" onclick="retryS2()">重试</button>
      · 或清空 <code>user-wiki.md</code> 后重启服务器再试<br>
      · 也可查看服务端日志看是否有 <code>run_define context sizes</code> 行
    </div>`;
  }
  if (chat) chat.scrollTop = chat.scrollHeight;
  if (lockArea) lockArea.style.display = "none";
}

window.retryS2 = function() {
  stepStarted[2] = false;
  const chat = document.getElementById("s2-chat");
  if (chat) chat.innerHTML = "";
  runS2();
};

window.sendS2 = async function() {
  const input = document.getElementById("s2-input");
  const msg = input ? input.value.trim() : "";
  if (!msg) return;
  input.value = "";
  await callFacilitator(msg);
};

window.lockAndProceed = async function() {
  const lockArea = document.getElementById("s2-lock-area");
  if (lockArea) lockArea.innerHTML = '<div class="loading-text">锁定中…</div>';

  await streamSSE(stepUrl(2), { input: "确认", auto_simulate: true }, {
    step_done() {}
  }).catch(() => {});

  // Phase 6 · update roundtable TOPIC from the locked problem statement
  if (document.body.classList.contains('rt-mode')) {
    const defined = await loadFile('01-defined.md');
    if (defined) {
      // Extract the first non-empty paragraph (strip markdown header markers)
      const firstLine = defined.split('\n').map(s => s.replace(/^#+\s*/, '').trim()).find(s => s);
      if (firstLine) setTableTopic(firstLine.slice(0, 60));
      rtShowTopicPill(defined);
      // 2026-04-26 · breathing-circle pivot: inject 议题标语 (6-12 字)
      setRtPivotText(parseTopicTagline(defined));
    }
    rtClearHostBubble();
  }
  showStep(3);
};

// ─── Mode Toggle (User / Simulate) ──────────────────────────────────────────

function isSimulateMode() {
  const toggle = document.getElementById("mode-toggle");
  if (!toggle) return true;
  // Unchecked = simulate (default), checked = user mode
  return !toggle.checked;
}

window.toggleMode = function() {
  const toggle = document.getElementById("mode-toggle");
  const label = document.getElementById("mode-label");
  if (!toggle || !label) return;
  if (toggle.checked) {
    label.textContent = "用户";
    localStorage.setItem("counsel-mode", "user");
  } else {
    label.textContent = "模拟";
    localStorage.setItem("counsel-mode", "simulate");
  }
};

// Restore saved mode on load; default to 用户 (checked) so unauthenticated
// users run in their own voice rather than the simulate shortcut.
(function restoreMode() {
  const saved = localStorage.getItem("counsel-mode");
  const toggle = document.getElementById("mode-toggle");
  const label = document.getElementById("mode-label");
  if (saved === "simulate") {
    if (toggle) toggle.checked = false;
    if (label) label.textContent = "模拟";
  } else {
    // "user" or null (first visit) → default to 用户 (checked).
    if (toggle) toggle.checked = true;
    if (label) label.textContent = "用户";
  }
})();

// ─── Step 3: Facts Gathering ────────────────────────────────────────────────

async function runS3() {
  if (stepStarted[3]) return;
  stepStarted[3] = true;

  const simulate = isSimulateMode();
  const content = document.getElementById("s3-content");
  content.innerHTML = simulate
    ? '<div class="loading-text">幕僚正在逐一提问，系统自动回答中…</div>'
    : '<div class="loading-text">幕僚正在逐一提问…</div>';

  const questions = {};
  let personaCount = 0;
  let cached = false;
  let autoSimData = null;
  const isRT = document.body.classList.contains('rt-mode');
  if (isRT) rtClearPersonaBubbles();

  // Progressive user-mode flow (Michael 2026-04-25): as each advisor finishes
  // their question, immediately render that advisor's answer-card in the
  // sidebar AND open their bubble in the scene — the user can start typing
  // while the remaining advisors are still drafting. Avoids the "wait for
  // all 17, then go through them serially" friction.
  const progressive = !simulate && isRT;
  const userQList = [];           // {persona, slug, question} in arrival order
  const queue = [];               // indices waiting for auto-chain pop
  let kicked = false;             // first advisor's bubble already opened?
  let chainedCount = 0;           // # of advisors whose bubble has been popped
  let stepDoneSeen = false;       // backend signaled all questions complete

  const tryPopNext = () => {
    if (_expandedOverlay) return;  // user is currently answering — wait
    while (queue.length > 0) {
      const idx = queue.shift();
      const item = userQList[idx];
      if (!item || !item.slug) continue;
      const bubble = document.querySelector(`.rn-bubble[data-slug="${item.slug}"]`);
      if (!bubble) continue;  // seat missing (filtered) — skip
      // Make sure the textarea for this advisor is focused inside the overlay
      expandBubble(bubble);
      chainedCount++;
      setTimeout(() => {
        const ta = _expandedOverlay && _expandedOverlay.node.querySelector('.rn-composer-txt');
        if (ta) ta.focus();
      }, 120);
      return;
    }
    // Queue empty — if all advisors are accounted for, prompt the user with
    // the central confirm card (Michael 2026-04-25 — "到了最后一个窗口后，
    // 跳出来所有问题都回答了，确认是否开始让幕僚说话").
    if (stepDoneSeen && chainedCount >= userQList.length && userQList.length > 0) {
      console.info('[step3-progressive] all advisors chained, summoning confirm card');
      setTimeout(showStep3ConfirmCard, 200);
    }
  };
  // Wire the advance hook so save/skip in any composer triggers the next pop
  if (progressive) _step3AdvanceNext = tryPopNext;

  const renderProgressiveCard = (idx, item) => {
    const p = pdata(item.persona);
    const dp = p ? ` data-p="${p.slug}"` : '';
    let frame = document.getElementById('s3-progressive-frame');
    if (!frame) {
      content.innerHTML = '<div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:10px">幕僚的提问随机弹出，请逐一回答（也可点跳过）：</div><div id="s3-progressive-frame"></div>';
      frame = document.getElementById('s3-progressive-frame');
    }
    const card = document.createElement('div');
    card.className = 'qa-card';
    if (p && p.slug) card.setAttribute('data-p', p.slug);
    card.innerHTML =
      `<div class="ocard-h">${pavatar(item.persona)}<div class="ocard-n">${esc(item.persona)}</div></div>` +
      `<div class="qa-q">${esc(item.question)}</div>` +
      `<textarea class="qa-a" id="qa-a-${idx}" rows="2" placeholder="你的回答…"></textarea>`;
    frame.appendChild(card);
  };

  try {
  await streamSSE(stepUrl(3), { auto_simulate: simulate }, {
    _onIdle() {
      if (personaCount === 0) {
        content.innerHTML = '<div class="loading-text">AI正在深度思考，请稍候…</div>';
      }
    },
    step_start() {
      content.innerHTML = simulate
        ? '<div class="loading-text">幕僚正在逐一提问，系统自动回答中…</div>'
        : '<div class="loading-text">幕僚正在逐一提问…</div>';
    },
    persona_start(e) {
      personaCount++;
      const p = pdata(e.name);
      setChipState(p.slug, 'speaking');
      if (isRT) {
        setSeatState(p.slug, 'speaking');
        rtStreamBuffers.set('s3:' + p.slug, '');
        rtShowBubble(p.slug, p.short, '', {streaming: true});
      }
      const id = "s3-" + slugify(e.name);
      const card = document.createElement("div");
      card.className = "ocard on";
      card.id = id;
      card.setAttribute("data-p", p.slug);
      card.innerHTML = `<div class="ocard-h">${pavatar(e.name,'speaking')}<div class="ocard-n">${esc(e.name)} · 提问中 (${personaCount}/6)</div></div><div class="ocard-t cur" id="${id}-t"></div>`;
      const loading = content.querySelector(".loading-text");
      if (loading) loading.remove();
      content.appendChild(card);
      questions[e.name] = { id, text: "" };
    },
    persona_chunk(e) {
      if (questions[e.name]) {
        questions[e.name].text += e.chunk;
        const t = document.getElementById(questions[e.name].id + "-t");
        if (t) t.textContent = questions[e.name].text;
        if (isRT) {
          const p = pdata(e.name);
          const key = 's3:' + p.slug;
          const buf = (rtStreamBuffers.get(key) || '') + e.chunk;
          rtStreamBuffers.set(key, buf);
          rtShowBubble(p.slug, p.short, buf, {streaming: true});
        }
      }
    },
    persona_done(e) {
      if (questions[e.name]) {
        const p = pdata(e.name);
        setChipState(p.slug, 'active');
        if (isRT) {
          setSeatState(p.slug, 'lit');
          const full = questions[e.name].text;
          rtStreamBuffers.set('s3:' + p.slug, full);
          rtShowBubble(p.slug, p.short, full, {streaming: false});
        }
        const card = document.getElementById(questions[e.name].id);
        if (card) {
          card.classList.remove("on");
          const n = card.querySelector(".ocard-n");
          if (n) n.textContent = esc(e.name) + " · 已提问";
          const av = card.querySelector(".p-av");
          if (av) av.classList.remove("speaking");
          const t = card.querySelector(".ocard-t");
          if (t) t.classList.remove("cur");
        }

        // Progressive user-mode: this advisor is fully drafted. Append a qa-card
        // so the user can answer right now, queue them for the auto-chain, and
        // pop the first bubble immediately — others continue in parallel in the
        // background.
        if (progressive) {
          const fullText = questions[e.name].text || '';
          const idx = userQList.length;
          const item = { persona: e.name, slug: p.slug, question: fullText };
          userQList.push(item);
          renderProgressiveCard(idx, item);
          queue.push(idx);
          if (!kicked) {
            kicked = true;
            console.info('[step3-progressive] kicking first bubble for', e.name);
            // Slight delay so the bubble's "streaming → done" transition paints
            setTimeout(tryPopNext, 200);
          }
        }
      }
    },
    step_done(e) {
      if (e.data && e.data.cached) cached = true;
      if (e.data) autoSimData = e.data;
      stepDoneSeen = true;
      clearAllChips();
      // If progressive flow is active and the last advisor has already been
      // chained AND no overlay is open, bring up the confirm card.
      if (progressive && !_expandedOverlay && chainedCount >= userQList.length && userQList.length > 0) {
        setTimeout(showStep3ConfirmCard, 250);
      }
    },
  });
  } catch (e) {
    clearAllChips();
    content.innerHTML += `<div class="error-msg">${esc(e.message)}</div>`;
  }

  // ── User mode: show answer form ──
  if (!simulate && autoSimData && autoSimData.auto_simulate === false) {
    // Progressive flow already painted qa-cards as each advisor finished — just
    // append the submit button (or summon the central confirm card if all
    // advisors already opened-and-saved).
    if (progressive && userQList.length > 0) {
      const frame = document.getElementById('s3-progressive-frame');
      if (frame && !document.getElementById('s3-submit-answers')) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-w btn-full';
        btn.id = 's3-submit-answers';
        btn.textContent = '提交回答 →';
        btn.onclick = () => submitFactsAnswers();
        frame.parentElement.appendChild(btn);
      }
      // If queue is empty AND all advisors have already had their bubble
      // presented (cursor reached end), summon the central confirm card so the
      // user has a clear "done?" affordance.
      if (queue.length === 0) {
        // Best-effort — only if no overlay is currently open
        if (!_expandedOverlay) {
          setTimeout(showStep3ConfirmCard, 200);
        }
      }
      return;
    }

    // Fallback (linear UI / cached): batch render qa-cards from saved JSON.
    const qFile = await loadFile("02-facts-questions.json");
    let qList = [];
    try { qList = JSON.parse(qFile); } catch {}

    if (qList.length > 0) {
      content.innerHTML = "";
      content.innerHTML += '<div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:10px">请逐一回答幕僚的提问：</div>';

      for (let i = 0; i < qList.length; i++) {
        const q = qList[i];
        const p = pdata(q.persona);
        const dp = p ? ` data-p="${p.slug}"` : '';
        content.innerHTML += `<div class="qa-card"${dp}>`
          + `<div class="ocard-h">${pavatar(q.persona)}<div class="ocard-n">${esc(q.persona)}</div></div>`
          + `<div class="qa-q">${esc(q.question)}</div>`
          + `<textarea class="qa-a" id="qa-a-${i}" rows="2" placeholder="你的回答…"></textarea>`
          + `</div>`;
      }

      content.innerHTML += `<button class="btn btn-w btn-full" id="s3-submit-answers" onclick="submitFactsAnswers()">提交回答 →</button>`;
      // Roundtable mode fallback (no progressive run happened): kick the
      // existing post-hoc auto-chain.
      if (isRT) startStep3AutoAdvance(qList);
      return;
    }
  }

  // ── Simulate mode or cached: show Q&A results ──
  const qaFile = await loadFile("02-facts-answers.md");
  if (qaFile) {
    content.innerHTML = "";
    const sections = qaFile.split(/\n##\s+/).filter(s => s.trim());
    for (const section of sections) {
      const lines = section.trim().split("\n");
      const title = lines[0].replace(/^#+\s*/, "").trim();
      const body = lines.slice(1).join("\n").trim();

      if (title.includes("Question") || title.includes("提问")) {
        const name = title.replace(/\s*Questions?$/i, "").trim();
        const p = matchPersona(name);
        const dp = p ? ` data-p="${p.slug}"` : '';
        const av = p ? `<div class="p-av" data-p="${p.slug}">${p.initial}</div>` : '';
        content.innerHTML += `<div class="ocard"${dp}><div class="ocard-h">${av}<div class="ocard-n">${esc(name)} · 提问</div></div><div class="ocard-t">${esc(body)}</div></div>`;
      } else if (title.includes("Answer") || title.includes("回答")) {
        content.innerHTML += `<div class="ocard" style="border-color:rgba(255,255,255,.15);background:rgba(255,255,255,.04)"><div class="ocard-n" style="color:rgba(255,255,255,.3)">回答</div><div class="ocard-t">${esc(body)}</div></div>`;
      } else {
        const p = matchPersona(title);
        const dp = p ? ` data-p="${p.slug}"` : '';
        const av = p ? `<div class="p-av" data-p="${p.slug}">${p.initial}</div>` : '';
        content.innerHTML += `<div class="ocard"${dp}><div class="ocard-h">${av}<div class="ocard-n">${esc(title)}</div></div><div class="ocard-t">${esc(body)}</div></div>`;
      }
    }
  }

  if (cached && !qaFile) {
    content.innerHTML = '<div class="done-banner">事实已缓存</div>';
  }

  content.innerHTML += `<button class="btn btn-w btn-full" onclick="showStep(4)">事实已收集，进入幕僚发言 →</button>`;
}

/// Sequential walkthrough of Step 3 advisor bubbles. After the qa-cards are
/// rendered in the sidebar (source of truth for answers), we auto-expand one
/// advisor seat at a time in a random order. Save/Skip on the expanded
/// composer triggers the next one; after the last advisor, a central
/// confirmation card is shown so the user explicitly opts in to Step 4.
function startStep3AutoAdvance(qList) {
  if (!document.body.classList.contains('rt-mode')) return;
  if (!Array.isArray(qList) || qList.length === 0) return;

  // Random index order. Fisher-Yates-ish via sort — good enough for a <20
  // item list; real bias doesn't matter here.
  const order = qList.map((_, i) => i).sort(() => Math.random() - 0.5);
  let cursor = 0;
  console.info('[step3-auto] kickoff · order=', order, '· total=', qList.length);

  const findSeatBubble = (slug) => {
    if (!slug) return null;
    // Layout A (ring) and B (table) both use .rn-bubble anchored on the seat.
    return document.querySelector(`.rn-bubble[data-slug="${slug}"]`);
  };

  // Walk sidebar qa-cards in DOM order and collect (persona, question, answer)
  // tuples for cards the user has already filled in. Used to feed the refine
  // endpoint so persona K can decide whether to skip-as-redundant or dig
  // somewhere not yet covered.
  const collectPriorQA = () => {
    const out = [];
    document.querySelectorAll('.qa-card').forEach(card => {
      const slug = card.dataset.p;
      const ans = (card.querySelector('.qa-a') || {}).value || '';
      const q = (card.querySelector('.qa-q') || {}).textContent || '';
      const persona = (card.querySelector('.ocard-n') || {}).textContent || '';
      const trimmed = ans.trim();
      if (trimmed && trimmed !== '（跳过）') {
        out.push({ slug, persona, question: q.trim(), answer: trimmed });
      }
    });
    return out;
  };

  // 2026-04-25 — sequential refinement. Before opening persona K's bubble,
  // ask the server whether persona K should refine its question (given what
  // the case-owner already answered for personas 1..K-1) or skip itself as
  // redundant. Best-effort; if refine fails, fall through to original q.
  const refineOrSkip = async (q) => {
    const prior = collectPriorQA();
    if (prior.length === 0) return { action: 'ask', question: q.question };  // first opens always asks
    try {
      const rawInput = await loadFile('00-raw-input.md');
      const defined = await loadFile('01-defined.md');
      const resp = await fetch(`${API}/api/refine-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona_slug: q.slug || pdata(q.persona).slug,
          original_question: q.question || '',
          raw_input: rawInput || '',
          defined: defined || '',
          angle: q.angle || '',
          prior_qa: prior.map(p => ({
            persona: p.persona,
            question: p.question,
            answer: p.answer,
          })),
        }),
      });
      if (!resp.ok) throw new Error(`refine HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.warn('[step3-refine] failed, falling back to original:', err);
      return { action: 'ask', question: q.question };
    }
  };

  // Try to expand a seat bubble; if not yet attached (rare race when the
  // sidebar finishes before scene paint), retry a few times before giving up.
  // Now async: calls refine-question first to potentially update text or skip.
  const tryExpand = async (q, attempt) => {
    const p = pdata(q.persona);
    const bubble = findSeatBubble(p.slug);
    if (bubble) {
      // Refine pass (skipped on first card; collectPriorQA returns empty).
      const decision = await refineOrSkip(q);
      if (decision && decision.action === 'skip') {
        console.info('[step3-refine] persona', q.persona, 'skipped:', decision.reason);
        // Update the bubble + sidebar card to show skip rationale instead of opening
        const card = document.querySelector(`.qa-card[data-p="${p.slug}"]`);
        if (card) {
          const qEl = card.querySelector('.qa-q');
          const aEl = card.querySelector('.qa-a');
          if (qEl) qEl.textContent = `（自动跳过：${decision.reason || '前面已问过类似'}）`;
          if (aEl) aEl.value = '（跳过）';
        }
        if (bubble) {
          bubble.dataset.fullText = `（自动跳过：${decision.reason || '前面已问过'}）`;
          const txt = bubble.querySelector('.rn-bubble-text');
          if (txt) txt.textContent = `（跳过：${(decision.reason || '已问过').slice(0, 12)}）`;
        }
        return false;  // signal: chain to next persona
      }
      // ASK path: replace question text if refined version differs
      if (decision && decision.action === 'ask' && decision.question
          && decision.question.trim() && decision.question.trim() !== (q.question || '').trim()) {
        const card = document.querySelector(`.qa-card[data-p="${p.slug}"]`);
        if (card) {
          const qEl = card.querySelector('.qa-q');
          if (qEl) qEl.textContent = decision.question.trim();
        }
        if (bubble) {
          bubble.dataset.fullText = decision.question.trim();
          const txt = bubble.querySelector('.rn-bubble-text');
          if (txt) txt.textContent = decision.question.trim().slice(0, 40);
        }
      }
      if (_expandedOverlay) collapseBubble(_expandedOverlay.bubble);
      bubble.scrollIntoView({block: 'center', behavior: 'smooth'});
      expandBubble(bubble);
      setTimeout(() => {
        const ta = _expandedOverlay && _expandedOverlay.node.querySelector('.rn-composer-txt');
        if (ta) ta.focus();
      }, 120);
      return true;
    }
    if (attempt < 3) {
      const delay = [200, 500, 900][attempt] || 900;
      setTimeout(() => { tryExpand(q, attempt + 1); }, delay);
      return true;  // a retry is in flight; don't fall through
    }
    console.warn('[step3-auto] seat bubble not found for slug=', p.slug, '· persona=', q.persona, '— skipping');
    return false;
  };

  const advance = async () => {
    if (cursor >= order.length) {
      _step3AdvanceNext = null;
      console.info('[step3-auto] chain complete — showing confirmation card');
      showStep3ConfirmCard();
      return;
    }
    const q = qList[order[cursor++]];
    const opened = await tryExpand(q, 0);
    if (!opened) {
      // Either bubble missing or refine said skip — chain to next.
      setTimeout(advance, 220);
    }
  };

  _step3AdvanceNext = advance;
  // Kick the first one as soon as the next paint completes — earlier than 350ms
  // covered the qa-card render but still let the seat bubbles paint. rAF + a
  // short backstop catches both cases.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(advance));
  } else {
    setTimeout(advance, 200);
  }
}

/// Central scene-card shown after the auto-chain finishes. Replaces the
/// pulse-submit nudge on the sidebar button — the explicit Yes/Revise choice
/// matches Michael's intent ("正中央给我一个按钮"). Buttons are wired to
/// submitFactsAnswers (advance) or just dismiss (so the user can edit any
/// seat answer they want and re-summon the card via the sidebar button).
function showStep3ConfirmCard() {
  if (!document.body.classList.contains('rt-mode')) return;
  const pane = document.querySelector('.rt-scene-pane');
  if (!pane) return;
  // Reuse the existing card if it's still around; otherwise build fresh
  let backdrop = document.getElementById('rt-confirm-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'rt-confirm-backdrop';
    backdrop.className = 'rt-confirm-backdrop';
    pane.appendChild(backdrop);
  }
  let card = document.getElementById('rt-confirm-card');
  if (!card) {
    card = document.createElement('div');
    card.id = 'rt-confirm-card';
    card.className = 'rt-confirm-card';
    card.innerHTML =
      '<div class="rt-confirm-title">你的回答都好啦 ✓</div>' +
      '<div class="rt-confirm-sub">要不要进入幕僚发言环节？幕僚们会根据你的回答给出他们的视角和洞察。</div>' +
      '<div class="rt-confirm-actions">' +
        '<button type="button" class="rt-confirm-secondary" id="rt-confirm-revise">我再检查一下</button>' +
        '<button type="button" class="rt-confirm-primary" id="rt-confirm-go">进入幕僚发言 →</button>' +
      '</div>';
    pane.appendChild(card);
  }
  backdrop.classList.add('on');
  card.classList.add('on');
  const closeCard = () => {
    backdrop.classList.remove('on');
    card.classList.remove('on');
  };
  const goBtn = card.querySelector('#rt-confirm-go');
  const reviseBtn = card.querySelector('#rt-confirm-revise');
  if (goBtn) goBtn.onclick = () => {
    closeCard();
    if (typeof window.submitFactsAnswers === 'function') window.submitFactsAnswers();
  };
  if (reviseBtn) reviseBtn.onclick = () => {
    closeCard();
    // Lightly nudge the sidebar submit button so the user can re-trigger us.
    const btn = document.getElementById('s3-submit-answers');
    if (btn) {
      btn.classList.add('pulse-submit');
      btn.onclick = (e) => { e.preventDefault(); showStep3ConfirmCard(); };
    }
  };
  // Backdrop click = revise (less destructive than skipping)
  backdrop.onclick = () => { reviseBtn && reviseBtn.click(); };
}

function dismissStep3ConfirmCard() {
  const c = document.getElementById('rt-confirm-card');
  const b = document.getElementById('rt-confirm-backdrop');
  if (c) c.classList.remove('on');
  if (b) b.classList.remove('on');
}

// Submit user answers for Step 3 (user mode).
// 2026-04-26 — was: POST /steps/3 with answers, server reads questions.json
// from tempdir storage and assembles the markdown. Failed in production when
// prior_state.files raced with IDB writes — server hit "No such file or
// directory" reading questions.json and the user was silently stranded at
// Step 4. Now: assemble 02-facts-answers.md client-side from in-memory
// questions + answers, write to IDB, advance. No server roundtrip needed.
window.submitFactsAnswers = async function() {
  const btn = document.getElementById("s3-submit-answers");
  if (btn) { btn.textContent = "提交中…"; btn.disabled = true; }

  const content = document.getElementById("s3-content");

  try {
    const qFile = await loadFile("02-facts-questions.json");
    let qList = [];
    try { qList = JSON.parse(qFile || "[]"); } catch {}
    if (!Array.isArray(qList) || qList.length === 0) {
      throw new Error("找不到本轮问题（02-facts-questions.json 为空）。请刷新页面重试。");
    }

    const answers = [];
    for (let i = 0; i < qList.length; i++) {
      const ta = document.getElementById("qa-a-" + i);
      answers.push(ta && ta.value.trim() ? ta.value.trim() : "（未回答）");
    }

    let allQa = "";
    for (let i = 0; i < qList.length; i++) {
      const persona = qList[i].persona || "Unknown";
      const question = qList[i].question || "";
      const answer = answers[i] || "（未回答）";
      allQa += `\n\n## ${persona} Questions\n${question}\n\n## Client's Answer\n${answer}\n`;
    }

    if (window.CounselDB && PID && SID) {
      await window.CounselDB.saveStepFiles(PID, SID, {
        session_files: { "02-facts-answers.md": allQa },
      });
      await window.CounselDB.bumpSessionStep(SID, 3);
    }

    content.innerHTML = "";
    const sections = allQa.split(/\n##\s+/).filter(s => s.trim());
    for (const section of sections) {
      const lines = section.trim().split("\n");
      const title = lines[0].replace(/^#+\s*/, "").trim();
      const body = lines.slice(1).join("\n").trim();
      if (title.includes("Question") || title.includes("提问")) {
        const name = title.replace(/\s*Questions?$/i, "").trim();
        const p = matchPersona(name);
        const dp = p ? ` data-p="${p.slug}"` : '';
        const av = p ? `<div class="p-av" data-p="${p.slug}">${p.initial}</div>` : '';
        content.innerHTML += `<div class="ocard"${dp}><div class="ocard-h">${av}<div class="ocard-n">${esc(name)} · 提问</div></div><div class="ocard-t">${esc(body)}</div></div>`;
      } else if (title.includes("Answer") || title.includes("回答")) {
        content.innerHTML += `<div class="ocard" style="border-color:rgba(255,255,255,.15);background:rgba(255,255,255,.04)"><div class="ocard-n" style="color:rgba(255,255,255,.3)">你的回答</div><div class="ocard-t">${esc(body)}</div></div>`;
      } else {
        const p = matchPersona(title);
        const dp = p ? ` data-p="${p.slug}"` : '';
        const av = p ? `<div class="p-av" data-p="${p.slug}">${p.initial}</div>` : '';
        content.innerHTML += `<div class="ocard"${dp}><div class="ocard-h">${av}<div class="ocard-n">${esc(title)}</div></div><div class="ocard-t">${esc(body)}</div></div>`;
      }
    }

    await new Promise(r => setTimeout(r, 0));
    showStep(4);
  } catch (e) {
    console.error('[submitFacts] threw', e);
    if (btn) { btn.textContent = "提交回答 →"; btn.disabled = false; }
    content.innerHTML += `<div class="error-msg">${esc(e.message)}</div>`
      + '<button class="btn btn-w" style="margin-top:8px" onclick="submitFactsAnswers()">重试</button>';
  }
};

// ─── Step 4: Persona Opinions ───────────────────────────────────────────────

async function runS4() {
  if (stepStarted[4]) {
    console.info('[runS4] skipped — stepStarted[4] already true (likely resumed session)');
    return;
  }
  stepStarted[4] = true;

  const container = document.getElementById("s4-cards");
  container.innerHTML = '<div class="loading-text">幕僚正在思考…</div>';

  const cards = {};
  let cached = false;
  let t0 = Date.now();
  let sawPersonaStart = false;
  let sawStepDone = false;
  const isRT = document.body.classList.contains('rt-mode');
  if (isRT) {
    rtClearPersonaBubbles();
    rtSpotlightClear();
  }

  console.info('[runS4] POST', stepUrl(4), '· active personas:', (activePersonas || []).length);

  try {
  await streamSSE(stepUrl(4), {}, {
    _onIdle() {
      const loading = container.querySelector(".loading-text");
      const elapsed = Math.round((Date.now() - t0) / 1000);
      if (loading) loading.textContent = `AI正在深度思考，请稍候…（已 ${elapsed}s${sawPersonaStart ? '，已收到部分发言' : '，尚未收到任何发言'}）`;
      console.info('[runS4] idle tick · elapsed=', elapsed, 's · sawPersonaStart=', sawPersonaStart);
    },
    step_start() { container.innerHTML = ""; },
    persona_start(e) {
      sawPersonaStart = true;
      console.info('[runS4] persona_start', e.name, '· t+', Math.round((Date.now()-t0)/1000), 's');
      const p = pdata(e.name);
      setChipState(p.slug, 'speaking');
      if (isRT) {
        setSeatState(p.slug, 'speaking');
        rtStreamBuffers.set(p.slug, '');
        rtShowBubble(p.slug, p.short, '', {streaming: true});
      }
      const id = "s4-" + slugify(e.name);
      container.innerHTML += `<div class="ocard on" id="${id}" data-p="${p.slug}">`
        + `<div class="ocard-h">${pavatar(e.name,'speaking')}<div class="ocard-n" id="${id}-n">${esc(e.name)} · 发言中</div></div>`
        + `<div class="ocard-t cur" id="${id}-t" data-markable data-step="4" data-persona="${esc(e.name)}"></div>`
        + `</div>`;
      cards[e.name] = id;
    },
    persona_chunk(e) {
      const t = document.getElementById(cards[e.name] + "-t");
      if (t) t.textContent += e.chunk;
      if (isRT) {
        const p = pdata(e.name);
        const buf = (rtStreamBuffers.get(p.slug) || '') + e.chunk;
        rtStreamBuffers.set(p.slug, buf);
        rtShowBubble(p.slug, p.short, buf, {streaming: true});
        rtSpotlightUpsert(p.slug, e.name, buf);
      }
    },
    persona_done(e) {
      const p = pdata(e.name);
      setChipState(p.slug, 'active');
      const t = document.getElementById(cards[e.name] + "-t");
      let plain = '';
      if (t) {
        // Render streamed plain text through the markdown pipeline so backticks,
        // lists, bold, etc. display correctly (bug 2026-04-22: textContent
        // accumulated plain text and never got replaced with innerHTML on done).
        plain = t.textContent || "";
        t.innerHTML = '<div class="md-body">' + md(plain) + '</div>';
        t.classList.remove("cur");
      }
      if (isRT) {
        setSeatState(p.slug, 'done');
        rtStreamBuffers.set(p.slug, plain || rtStreamBuffers.get(p.slug) || '');
        rtShowBubble(p.slug, p.short, plain, {streaming: false});
        rtSpotlightUpsert(p.slug, e.name, plain);
      }
      const n = document.getElementById(cards[e.name] + "-n");
      if (n) n.textContent = e.name + " · 完成";
      const card = document.getElementById(cards[e.name]);
      if (card) {
        card.classList.remove("on");
        const av = card.querySelector(".p-av");
        if (av) av.classList.remove("speaking");
      }
    },
    step_done(e) {
      sawStepDone = true;
      console.info('[runS4] step_done · cached=', !!(e.data && e.data.cached), '· total=', Math.round((Date.now()-t0)/1000), 's');
      if (e.data && e.data.cached) cached = true;
      clearAllChips();
      // 2026-04-27 — three distinct节奏 modes (was: fast / manual / freestyle
      // jumbled together; previous "fast" and "manual" were the same actual
      // function, just different entry buttons). Now:
      //   🚀 一键跳过辩论  → runFastMode()   skip Step 6, dual-pane 7+8 (~3 min)
      //   🐢 一键跑完含辩论 → runChainMode()  auto-chain 5→6→7→8 (~12-18 min)
      //   👆 我要逐步走     → showStep(5)    user clicks each step
      // Freestyle (`/freestyle` 4-stage) is deliberately NOT here — it's a
      // pre-Step-1 entry path, not a post-Step-4 节奏 choice.
      container.innerHTML += `
        <div class="fast-mode-card" style="margin-top:18px;padding:16px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.025)">
          <div style="font-size:13.5px;color:rgba(255,255,255,.85);margin-bottom:12px;line-height:1.6">现在你可以选 —— 三种节奏，结果都是案主拿到行动建议：</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-w btn-full" onclick="runFastMode()" style="padding:12px;font-size:13.5px">
              🚀 一键跳过辩论 <span style="opacity:.65;font-weight:400;font-size:12px">（~3 min · 跳过 Step 6 · 直奔汇总+摘果子）</span>
            </button>
            <button class="btn btn-g btn-full" onclick="runChainMode()" style="padding:12px;font-size:13.5px">
              🐢 一键跑完（含完整辩论） <span style="opacity:.65;font-weight:400;font-size:12px">（~12-18 min · 自动跑 5→6→7→8 · 不用点）</span>
            </button>
            <button class="btn btn-full" onclick="showStep(5)" style="padding:12px;font-size:13.5px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.9)">
              👆 我要逐步走 <span style="opacity:.65;font-weight:400;font-size:12px">（每步手动点击 · 充分参与）</span>
            </button>
          </div>
        </div>`;
    },
  });
  } catch (e) {
    console.error('[runS4] streamSSE threw', e, '· sawPersonaStart=', sawPersonaStart, '· sawStepDone=', sawStepDone);
    clearAllChips();
    container.innerHTML += `<div class="error-msg">${esc(e.message)}</div>`;
  }

  if (cached) {
    container.innerHTML = '<div class="done-banner">意见已缓存</div><button class="btn btn-w btn-full" onclick="showStep(5)">进入拆维度 →</button>';
  }
}

// ─── Step 5: Dimensions ─────────────────────────────────────────────────────

let dimensions = [];

async function runS5() {
  if (stepStarted[5]) return;
  stepStarted[5] = true;

  const content = document.getElementById("s5-content");
  const cardsEl = document.getElementById("s5-cards");
  const btn = document.getElementById("s5-btn");
  const isRT = document.body.classList.contains('rt-mode');
  content.innerHTML = '<div class="loading-text">主持人正在提炼冲突维度…</div>';
  cardsEl.innerHTML = "";
  btn.style.display = "none";

  if (isRT) {
    rtClearPersonaBubbles();
    rtClearHostBubble();
  }

  let skipped = false;
  let skipMessage = "";
  let synthText = "";

  // 2026-04-26 — fastMode bypasses cache for fresh runs. Without this, if
  // 04-dimensions.md exists in IDB from a prior run, the backend returns
  // {cached:true} silently and produces no streaming dim cards, then Step 6
  // gets confused.
  const fastMode = !!window._fastModeRunning;
  try {
    await streamSSE(stepUrl(5), fastMode ? { force_refresh: true } : {}, {
      _onIdle() { content.innerHTML = '<div class="loading-text">AI正在深度思考，请稍候…</div>'; },
      step_start() {},
      facilitator_chunk(e) {
        synthText += e.chunk;
        if (isRT) rtShowHostBubble(synthText, {streaming: true, tag: '📐 维度拆解', variant: 'dimensions'});
      },
      facilitator_done() {
        if (isRT && synthText) rtShowHostBubble(synthText, {streaming: false, tag: '📐 维度拆解', variant: 'dimensions'});
      },
      step_done(e) {
        if (e.data && e.data.skipped) {
          skipped = true;
          skipMessage = e.data.message || "本步骤已跳过。";
        }
      },
    });
  } catch (e) {
    // 2026-04-26 — Michael saw "failed to fetch" here; server logs showed
    // no Step 5 invocation, meaning request died before reaching server
    // (likely iOS Safari dropping connection on long sessions). Surface
    // the full diagnostic to console + offer retry / skip in UI.
    console.error('[runS5] streamSSE threw', {
      name: e.name,
      message: e.message,
      stack: e.stack,
      online: navigator.onLine,
      sessionId: SID,
      projectId: PID,
      timestamp: new Date().toISOString(),
    });
    if (window.CounselAnalytics && window.CounselAnalytics.track) {
      window.CounselAnalytics.track('step_error', {
        step: 5,
        error: e.name + ': ' + (e.message || ''),
        online: navigator.onLine,
      });
    }
    content.innerHTML = `<div class="error-msg">拆维度失败：${esc(e.message || '网络异常')}</div>`
      + `<div style="display:flex;gap:8px;margin-top:12px">`
      +   `<button class="btn btn-w" onclick="stepStarted[5]=false;runS5()">重试</button>`
      +   `<button class="btn btn-w" onclick="showStep(6)">跳过 → 进入辩论</button>`
      + `</div>`;
    stepStarted[5] = false;
    if (btn) btn.style.display = "block";
    return;
  }

  if (skipped) {
    content.innerHTML = `<div class="skip-card" style="background:rgba(100,180,255,.08);border:1px solid rgba(100,180,255,.35);padding:14px 16px;border-radius:10px;line-height:1.7;color:rgba(230,240,255,.85)">
      <div style="font-weight:600;margin-bottom:6px">⏭ 维度拆分已跳过</div>
      <div style="font-size:13px;color:rgba(255,255,255,.65)">${esc(skipMessage)}</div>
    </div>`;
    btn.style.display = "block";
    btn.textContent = "直接进入汇总 →";
    btn.onclick = () => showStep(7);
    return;
  }

  const dimText = await loadFile("04-dimensions.md");
  dimensions = parseDimensions(dimText);

  content.innerHTML = "";

  if (dimensions.length === 0 && dimText) {
    content.innerHTML = '<div class="md-body">' + md(dimText) + '</div>';
    btn.style.display = "block";
  } else if (dimensions.length > 0) {
    dimensions.forEach((d, i) => {
      const sel = i < 2 ? " sel" : "";
      const textHtml = md(d.full || d.text || '');
      cardsEl.innerHTML += `<div class="dcard${sel}" data-idx="${i}" onclick="toggleDim(this)">`
        + `<div class="dicon">${sel ? "✓" : "⚡"}</div>`
        + `<div class="dbody">`
        + `<div class="dlabel">${esc(d.label)}</div>`
        + `<div class="dtext md-body" data-markable data-step="5" data-persona="dimension-${i}">${textHtml}</div>`
        + `<button class="dexpand" onclick="toggleDimExpand(event,this.parentElement.parentElement)">展开全文</button>`
        + `</div>`
        + `</div>`;
    });
    content.innerHTML = '<div style="font-size:12px;color:rgba(255,255,255,.55);margin-bottom:12px;line-height:1.6">请选择 1-3 个维度进行辩论，点击"展开全文"查看详细冲突描述：</div>';
    btn.style.display = "block";
  } else {
    content.innerHTML = '<div class="error-msg">未能获取维度数据，请重试</div>';
    btn.style.display = "block";
  }
}

function parseDimensions(text) {
  if (!text) return [];
  const dims = [];

  // Format A: bolded label + colon on a single line
  for (const line of text.split("\n")) {
    const m = line.match(/\*\*(.+?)\*\*[：:]\s*(.+)/);
    if (m) dims.push({ label: m[1], text: m[2], full: m[2] });
  }
  if (dims.length > 0) return dims;

  // Format B: ## heading followed by multi-line body — keep FULL body, no truncation
  const sections = text.split(/\n##\s+/).filter(s => s.trim());
  for (const section of sections) {
    const lines = section.trim().split("\n");
    let label = lines[0].replace(/^#+\s*/, "").replace(/^Dimension\s*\d+[：:.]?\s*/i, "").replace(/^维度\d+[：:]\s*/, "").trim();
    if (!label || label.toLowerCase().includes("unanimous")) continue;
    const body = lines.slice(1).join("\n").trim();
    if (label) dims.push({ label, text: body, full: body });
  }
  if (dims.length > 0) return dims;

  // Format C: numbered list
  for (const line of text.split("\n")) {
    const m = line.match(/^\d+[\.\)]\s*(.+?)[：:]\s*(.+)/);
    if (m) dims.push({ label: m[1].replace(/\*\*/g, ""), text: m[2], full: m[2] });
  }

  return dims;
}

window.toggleDimExpand = function(evt, cardEl) {
  if (evt) evt.stopPropagation();
  cardEl.classList.toggle('expanded');
  const btn = cardEl.querySelector('.dexpand');
  if (btn) btn.textContent = cardEl.classList.contains('expanded') ? '收起' : '展开全文';
};

// Parse saved 05-debate.md into per-dimension sections for replay/history view
function renderDebateFromFile(text) {
  // Split by top-level "## Dimension …" headers (not by "### Round 1", etc.)
  // 05-debate.md format: "## {Dimension Name}\n\n### Round 1 Positions\n## {Persona} (Middle)\n..."
  // We slice from each top-level "## Dimension " header to the next one.
  const sections = [];
  const lines = text.split('\n');
  let current = null;
  const isTopDimHeader = (l) => /^##\s+Dimension\b/i.test(l) || /^##\s+维度\s*\d+/.test(l);
  for (const line of lines) {
    if (isTopDimHeader(line)) {
      if (current) sections.push(current);
      current = { title: line.replace(/^##\s+/, '').trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push(current);

  // Fallback: if no "## Dimension …" headers, just render the whole markdown
  if (sections.length === 0) {
    return `<div class="md-body">${md(text)}</div>`;
  }

  let html = '';
  sections.forEach((s, i) => {
    html += `<div class="dim-section done">`
      + `<div class="dim-header">`
        + `<div class="dim-badge">维度 ${i + 1} / ${sections.length}</div>`
        + `<div class="dim-title">${esc(s.title)}</div>`
      + `</div>`
      + `<div class="dim-body md-body">${md(s.body.join('\n').trim())}</div>`
      + `</div>`;
  });
  return html;
}

window.toggleDim = function(card) {
  const selected = document.querySelectorAll("#s5-cards .dcard.sel").length;
  if (card.classList.contains("sel")) {
    card.classList.remove("sel");
    card.querySelector(".dicon").textContent = "⚡";
  } else if (selected < 3) {
    card.classList.add("sel");
    card.querySelector(".dicon").textContent = "✓";
  }
};

window.submitDimensions = function() {
  showStep(6);
};

// ─── Step 6: Debate ─────────────────────────────────────────────────────────

async function runS6() {
  if (stepStarted[6]) {
    console.info('[runS6] skipped — stepStarted[6] is already true');
    return;
  }
  stepStarted[6] = true;
  console.info('[runS6] starting · selected dim count =',
    document.querySelectorAll('#s5-cards .dcard.sel').length,
    '· fastMode =', !!window._fastModeRunning);

  const content = document.getElementById("s6-content");
  const isRT = document.body.classList.contains('rt-mode');
  content.innerHTML = '<div class="loading-text">幕僚辩论中…</div>';

  if (isRT) {
    rtClearPersonaBubbles();
    rtClearHostBubble();
    rtClearDimTracker();
    rtSpotlightClear();
    clearAllSeatCamps();
  }

  const selectedIndices = Array.from(document.querySelectorAll("#s5-cards .dcard.sel"))
    .map(el => parseInt(el.dataset.idx))
    .filter(n => !isNaN(n));

  // Per-dimension state — keyed by dimIdx
  let currentDim = -1;
  let dimTotal = 0;
  const dimNames = [];
  const dimCards = {}; // dimIdx -> { personaName -> dom id }
  const dimSummaryIds = {}; // dimIdx -> s6-summary-{idx}
  let cached = false;
  // RT bubble buffers per (dim, personaName) + per-dim facilitator synth text
  const rtBuf = {}; // key: `${dim}:${name}` → accumulating advisor text
  // Track which advisors have already had their camp classified for the current
  // dim so we don't reapply the same class on every chunk.
  const campSetThisDim = new Set();
  let rtSynthText = ""; // resets on each dimension_start

  const dimContainerId = (i) => `s6-dim-${i}`;
  const personaCardId = (dimIdx, name) => `s6-d${dimIdx}-${slugify(name)}`;
  const summaryCardId = (dimIdx) => `s6-sum-${dimIdx}`;

  // 2026-04-26 — bypass cache for fastMode same as runS5. Without this, if
  // a stale 05-debate.md exists from a previous run with different selections,
  // backend short-circuits with {cached:true} and the user sees no debate.
  const fastMode = !!window._fastModeRunning;
  const s6Body = { selected_dimensions: selectedIndices.length ? selectedIndices : [0, 1] };
  if (fastMode) s6Body.force_refresh = true;

  try {
  await streamSSE(stepUrl(6), s6Body, {
    _onIdle() {
      const loading = content.querySelector(".loading-text");
      if (loading) loading.textContent = "AI正在深度思考，请稍候…";
    },
    step_start() { content.innerHTML = ""; },
    dimension_start(e) {
      currentDim = e.index;
      dimTotal = e.total || dimTotal || 1;
      dimNames[currentDim] = e.name || `维度 ${currentDim + 1}`;
      dimCards[currentDim] = {};
      campSetThisDim.clear();
      rtSynthText = "";
      // Scene resets to current dim: clear seat bubbles + host + camp colors
      // so the 圆桌 shows ONLY this dim's debate; sidebar keeps full history.
      if (isRT) {
        rtClearPersonaBubbles();
        rtClearHostBubble();
        rtSpotlightClear();
        clearAllSeatCamps();
        rtRenderDimTracker(dimTotal, currentDim, dimNames);
      }
      const isFirst = content.querySelector(".dim-section") === null;
      content.innerHTML += `<div class="dim-section active" id="${dimContainerId(e.index)}">`
        + `<div class="dim-header">`
          + `<div class="dim-badge">维度 ${e.index + 1} / ${e.total}</div>`
          + `<div class="dim-title">${esc(e.name)}</div>`
        + `</div>`
        + `<div class="dim-body" id="${dimContainerId(e.index)}-body"></div>`
        + `</div>`;
      // Scroll new dimension into view (except first)
      if (!isFirst) {
        const el = document.getElementById(dimContainerId(e.index));
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    dimension_done(e) {
      const section = document.getElementById(dimContainerId(e.index));
      if (section) {
        section.classList.remove("active");
        section.classList.add("done");
      }
      if (isRT) {
        rtRenderDimTracker(dimTotal, currentDim, dimNames);
        // T2.1 — dim ended; un-fade all bubbles so the case-owner can compare
        // side-by-side before the next dim's bubbles wipe them.
        rtClearAllFocusFades();
      }
    },
    persona_start(e) {
      if (currentDim < 0) currentDim = 0;
      const p = pdata(e.name);
      setChipState(p.slug, 'speaking');
      const id = personaCardId(currentDim, e.name);
      const body = document.getElementById(`${dimContainerId(currentDim)}-body`) || content;
      body.innerHTML += `<div class="dbmsg" id="${id}" data-p="${p.slug}">`
        + `<div class="dbmsg-h">${pavatar(e.name,'speaking')}<div class="dbmsg-n">${esc(e.name)}</div></div>`
        + `<div class="dbmsg-t cur" id="${id}-t" data-markable data-step="6" data-persona="${esc(e.name)}"></div>`
        + `</div>`;
      dimCards[currentDim][e.name] = id;
      if (isRT && p.slug) {
        rtBuf[`${currentDim}:${e.name}`] = "";
        rtShowBubble(p.slug, p.short || e.name, '', {streaming: true});
        // T2.1 — focus on the current speaker so the scene doesn't feel crowded
        rtFocusOnSpeaker(p.slug);
      }
    },
    persona_chunk(e) {
      const id = dimCards[currentDim] && dimCards[currentDim][e.name];
      if (!id) return;
      const t = document.getElementById(`${id}-t`);
      if (t) t.textContent += e.chunk;
      if (isRT) {
        const key = `${currentDim}:${e.name}`;
        rtBuf[key] = (rtBuf[key] || '') + e.chunk;
        const p = pdata(e.name);
        if (p.slug) {
          rtShowBubble(p.slug, p.short || e.name, rtBuf[key], {streaming: true});
        }
        // Camp detection — once the advisor has declared 立场: 正方/反方/中立
        // (always within their first ~200 chars), apply a colored ring to
        // their seat avatar. One-shot per (dim, persona).
        if (p.slug && !campSetThisDim.has(p.slug)) {
          const camp = detectDebateCamp(rtBuf[key]);
          if (camp) {
            setSeatCamp(p.slug, camp);
            campSetThisDim.add(p.slug);
            // Once we have enough advisors classified, reseat by camp
            // (Wave 3): pro left arc, con right arc, neutral bottom.
            tryReseatByCamp(currentDim);
          }
        }
      }
    },
    persona_done(e) {
      const p = pdata(e.name);
      setChipState(p.slug, 'active');
      const id = dimCards[currentDim] && dimCards[currentDim][e.name];
      if (!id) return;
      const t = document.getElementById(`${id}-t`);
      if (t) {
        // Markdown render on stream end — same fix as Step 4 persona_done.
        const plain = t.textContent || "";
        t.innerHTML = '<div class="md-body">' + md(plain) + '</div>';
        t.classList.remove("cur");
      }
      const card = document.getElementById(id);
      const av = card ? card.querySelector(".p-av") : null;
      if (av) av.classList.remove("speaking");
      if (isRT && p.slug) {
        const key = `${currentDim}:${e.name}`;
        const full = rtBuf[key] || (t ? t.textContent : '');
        rtShowBubble(p.slug, p.short || e.name, full, {streaming: false});
        // T2.1 — speaker just finished; mid-fade until next speaker starts
        rtMarkSpeakerCompleted(p.slug);
        // Final camp check in case 立场 line arrived late.
        if (!campSetThisDim.has(p.slug)) {
          const camp = detectDebateCamp(full);
          if (camp) {
            setSeatCamp(p.slug, camp);
            campSetThisDim.add(p.slug);
            tryReseatByCamp(currentDim);
          }
        }
      }
    },
    facilitator_chunk(e) {
      clearAllChips();
      const sumId = summaryCardId(currentDim);
      let sum = document.getElementById(sumId);
      if (!sum) {
        const body = document.getElementById(`${dimContainerId(currentDim)}-body`) || content;
        body.innerHTML += `<div class="dbmsg h" id="${sumId}">`
          + `<div class="dbmsg-h"><div class="host-av">🎙</div><div class="dbmsg-n" style="color:rgba(255,255,255,.7)">主持人提炼</div></div>`
          + `<div class="dbmsg-t cur" id="${sumId}-t" data-markable data-step="6" data-persona="facilitator"></div>`
          + `</div>`;
        dimSummaryIds[currentDim] = sumId;
      }
      const t = document.getElementById(`${sumId}-t`);
      if (t) t.textContent += e.chunk;
      if (isRT) {
        rtSynthText += e.chunk;
        rtShowHostBubble(rtSynthText, {streaming: true, tag: '📋 主持人提炼', variant: 'summary'});
      }
    },
    facilitator_done() {
      const sumId = dimSummaryIds[currentDim];
      if (sumId) {
        const t = document.getElementById(`${sumId}-t`);
        if (t) {
          const plain = t.textContent || "";
          t.innerHTML = '<div class="md-body">' + md(plain) + '</div>';
          t.classList.remove("cur");
        }
      }
      if (isRT && rtSynthText) {
        rtShowHostBubble(rtSynthText, {streaming: false, tag: '📋 主持人提炼', variant: 'summary'});
      }
    },
    step_done(e) {
      if (e.data && e.data.cached) cached = true;
      clearAllChips();
      if (e.data && e.data.skipped) {
        const msg = e.data.message || "单一视角场景，无正反辩论。";
        content.innerHTML = `<div class="skip-card" style="background:rgba(100,180,255,.08);border:1px solid rgba(100,180,255,.35);padding:14px 16px;border-radius:10px;line-height:1.7;color:rgba(230,240,255,.85);margin-bottom:12px">
          <div style="font-weight:600;margin-bottom:6px">⏭ 辩论已跳过</div>
          <div style="font-size:13px;color:rgba(255,255,255,.65)">${esc(msg)} Step 7 汇总会直接采用 Step 4 的 opinion 作为素材。</div>
        </div>
        <button class="btn btn-w btn-full" onclick="showStep(7)">直接生成汇总 →</button>`;
      } else {
        content.innerHTML += `<button class="btn btn-w btn-full" onclick="showStep(7)">辩论完成，生成汇总 →</button>`;
      }
    },
  });
  } catch (e) {
    clearAllChips();
    content.innerHTML += `<div class="error-msg">${esc(e.message)}</div>`;
    content.innerHTML += `<div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-w" onclick="stepStarted[6]=false;runS6()">重试辩论</button><button class="btn btn-w" onclick="showStep(7)">跳过，进入汇总 →</button></div>`;
  }

  if (cached) {
    content.innerHTML = '<div class="done-banner">辩论已缓存</div><button class="btn btn-w btn-full" onclick="showStep(7)">生成汇总 →</button>';
  }
}

// ─── Step 7: Summary ────────────────────────────────────────────────────────

async function runS7() {
  if (stepStarted[7]) return;
  stepStarted[7] = true;

  const content = document.getElementById("s7-content");
  // Two stacked cards: pre-mortem (Phase 4.4 Step 6.5) + secretary summary
  content.innerHTML =
    `<div class="scard premortem-card" id="s7-premortem-card" style="display:none">` +
      `<div class="st">⚠️ 事前演练 · 一年后失败的复盘</div>` +
      `<div class="sb md-body" id="s7-premortem-body" data-markable data-step="7" data-persona="premortem"></div>` +
    `</div>` +
    `<div class="scard summary-card" id="s7-summary-card">` +
      `<div class="st">📋 秘书汇总</div>` +
      `<div class="sb md-body" id="s7-summary-body" data-markable data-step="7" data-persona="secretary"><div class="loading-text">秘书正在整理汇总…</div></div>` +
    `</div>`;

  const preCard = document.getElementById("s7-premortem-card");
  const preBody = document.getElementById("s7-premortem-body");
  const sumBody = document.getElementById("s7-summary-body");
  const isRT = document.body.classList.contains('rt-mode');
  if (isRT) {
    rtClearPersonaBubbles();
    rtClearHostBubble();
  }
  // Track which phase the host bubble is currently showing so we can swap
  // cleanly when the summary stream begins.
  let hostPhase = null; // 'premortem' | 'summary'

  // ── 1. Load whatever is already in premortem.md (background pre-run may have
  //    written 0%, 30%, 100% by now) and show it immediately if any content.
  const initialPremortem = await loadFile("premortem.md");
  if (initialPremortem && initialPremortem.trim()) {
    preCard.style.display = "";
    preBody.innerHTML = md(initialPremortem);
    if (isRT) {
      rtShowHostBubble(initialPremortem, {streaming: false, tag: '⚠️ 事前演练', variant: 'premortem'});
      hostPhase = 'premortem';
    }
  }

  // ── 2. Poll premortem.md while Step 7 is active — if the background task is
  //    still writing, this progressively fills the card. Stops after 3 stable
  //    checks OR 30s total OR when summary stream completes.
  let pollLastLen = initialPremortem ? initialPremortem.length : 0;
  let pollStableCount = 0;
  let pollActive = true;
  let pollStartTime = Date.now();
  // 40s polling cap — pre-mortem capped at 800 Chinese chars now fits within
  // ~30s backend; frontend gets a small buffer past backend timeout.
  const pollTimer = setInterval(async () => {
    if (!pollActive) return;
    if (Date.now() - pollStartTime > 40000) { pollActive = false; clearInterval(pollTimer); return; }
    const file = await loadFile("premortem.md");
    if (!file) return;
    if (file.length === pollLastLen) {
      pollStableCount++;
      // Require 4 stable checks (6s settle) before stopping — pre-mortem has
      // chunk gaps longer than 1.5s in some API bursts; don't false-exit.
      if (pollStableCount >= 4) { pollActive = false; clearInterval(pollTimer); }
      return;
    }
    pollStableCount = 0;
    pollLastLen = file.length;
    if (preCard.style.display === "none") preCard.style.display = "";
    preBody.innerHTML = md(file);
    // Host bubble mirrors the poll result while we're still in premortem phase.
    if (isRT && hostPhase !== 'summary') {
      rtShowHostBubble(file, {streaming: true, tag: '⚠️ 事前演练', variant: 'premortem'});
      hostPhase = 'premortem';
    }
  }, 1500);

  let premortemText = "";
  let summaryText = "";
  let cached = false;

  try {
    await streamSSE(stepUrl(7), {}, {
      _onIdle() {
        if (!summaryText && !premortemText) sumBody.innerHTML = '<div class="loading-text">AI正在深度思考，请稍候…</div>';
      },
      // Only fires in Scenario A (no pre-run existed — backend runs premortem inline)
      premortem_start() {
        pollActive = false;  // live stream supersedes polling
        clearInterval(pollTimer);
        preCard.style.display = "";
        preBody.innerHTML = '<div class="loading-text">参谋长正在做事前演练（失败复盘）…</div>';
        if (isRT) {
          rtShowHostBubble('', {streaming: true, tag: '⚠️ 事前演练', variant: 'premortem'});
          hostPhase = 'premortem';
        }
      },
      premortem_chunk(e) {
        premortemText += e.chunk;
        preBody.innerHTML = md(premortemText);
        preBody.classList.add('cur');
        if (isRT) {
          rtShowHostBubble(premortemText, {streaming: true, tag: '⚠️ 事前演练', variant: 'premortem'});
          hostPhase = 'premortem';
        }
      },
      premortem_done() {
        if (premortemText) preBody.innerHTML = md(premortemText);
        preBody.classList.remove('cur');
        applyAllSavedMarks(preBody);
        if (isRT && premortemText) {
          rtShowHostBubble(premortemText, {streaming: false, tag: '⚠️ 事前演练', variant: 'premortem'});
        }
      },
      step_start() { sumBody.innerHTML = ""; },
      facilitator_chunk(e) {
        summaryText += e.chunk;
        sumBody.innerHTML = mdWithDetailedAnalysis(summaryText);
        sumBody.classList.add('cur');
        if (isRT) {
          // First summary chunk: wipe premortem from host bubble (it remains in
          // the sidebar .scard) and switch the host to 秘书汇总.
          if (hostPhase !== 'summary') {
            rtClearHostBubble();
            hostPhase = 'summary';
          }
          rtShowHostBubble(summaryText, {streaming: true, tag: '📋 秘书汇总', variant: 'summary'});
        }
      },
      step_done(e) {
        if (e.data && e.data.cached) cached = true;
      },
    });
  } catch (e) {
    sumBody.innerHTML += `<div class="error-msg">${esc(e.message)}</div>`;
    sumBody.innerHTML += `<div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-w" onclick="stepStarted[7]=false;runS7()">重试汇总</button><button class="btn btn-w" onclick="showStep(8)">跳过，进入摘果子 →</button></div>`;
  }

  // Summary stream finished (either flowed through or cached short-circuit).
  // Do one final refresh of premortem — the background pre-run may have finished
  // during the summary stream; guarantee the card reflects the complete file.
  if (summaryText) {
    sumBody.innerHTML = mdWithDetailedAnalysis(summaryText);
    sumBody.classList.remove('cur');
    applyAllSavedMarks(sumBody);
    if (isRT) {
      rtShowHostBubble(summaryText, {streaming: false, tag: '📋 秘书汇总', variant: 'summary'});
      hostPhase = 'summary';
    }
  } else if (cached) {
    const file = await loadFile("06-summary.md");
    if (file) {
      sumBody.innerHTML = mdWithDetailedAnalysis(file);
      applyAllSavedMarks(sumBody);
      if (isRT) {
        if (hostPhase !== 'summary') rtClearHostBubble();
        rtShowHostBubble(file, {streaming: false, tag: '📋 秘书汇总', variant: 'summary'});
        hostPhase = 'summary';
      }
    } else {
      sumBody.innerHTML = '<div class="done-banner">汇总已缓存</div>';
    }
  }
  // Final premortem refresh from disk (supersedes any in-flight stream result)
  const finalPremortem = await loadFile("premortem.md");
  if (finalPremortem && finalPremortem.trim()) {
    if (preCard.style.display === "none") preCard.style.display = "";
    preBody.innerHTML = md(finalPremortem);
    applyAllSavedMarks(preBody);
  } else if (premortemText) {
    preBody.innerHTML = md(premortemText);
    applyAllSavedMarks(preBody);
  }
  // Stop polling now that we're done
  pollActive = false;
  clearInterval(pollTimer);

  const wrapper = document.getElementById("s7");
  if (!wrapper.querySelector(".btn-full")) {
    const btn = document.createElement("button");
    btn.className = "btn btn-w btn-full";
    btn.textContent = "进入摘果子 →";
    btn.onclick = () => showStep(8);
    wrapper.appendChild(btn);
  }
  // 2026-04-26 · breathing-circle: 结论降临的那一瞬，圆跳一下
  triggerRtPivotPulse();
}

// ─── Step 8: Harvest ────────────────────────────────────────────────────────

async function runS8() {
  if (stepStarted[8]) return;
  stepStarted[8] = true;

  const content = document.getElementById("s8-content");

  // Check if harvest already ran for this session
  const existingHarvest = await loadFile("07-harvest.md");
  const existingBayesian = await loadFile("07-bayesian.md");
  const existingEvals = await loadFile("07-persona-evals.md");
  const existingClientNotes = await loadFile("07-client-notes.md");
  const alreadyDone = !!(existingHarvest && existingBayesian);

  // 2026-04-26 · fast/freestyle skip the reflection panel entirely.
  // Detect via either flag (still running) or by inspecting the saved
  // client-notes for the "(Mode C 跳过)" / "(快速模式跳过)" marker.
  const skipMarker = existingClientNotes && (
    existingClientNotes.includes('Mode C 跳过') ||
    existingClientNotes.includes('快速模式跳过')
  );
  const skipReflection = !!(window._fastModeRunning || window._freestyleRunning || skipMarker);

  let html = '';
  if (!skipReflection) {
    html += renderReflectionPanel(PID, SID, existingClientNotes, alreadyDone);
  }
  html += '<div id="s8-results"></div>';
  content.innerHTML = html;

  const resultsEl = document.getElementById("s8-results");

  if (alreadyDone) {
    renderS8Results(resultsEl, existingEvals, existingHarvest, existingBayesian);
  } else if (skipReflection) {
    resultsEl.innerHTML = '<div class="loading-text">幕僚评价 + 贝叶斯迭代 + todos 生成中…</div>';
  } else {
    resultsEl.innerHTML = `<div class="scard" style="background:rgba(176,176,255,.05);border-color:rgba(176,176,255,.3)"><div class="sb" style="color:rgba(255,255,255,.78);line-height:1.8">👆 <strong style="color:#fff">请先在上方写下你自己的反思</strong>，然后点击"让幕僚根据我的反思做评估"。幕僚们会看到你的自我认知后，再给出他们的评价；贝叶斯迭代也会综合你和幕僚两方面的信号。</div></div>`;
  }
}

// Render the 3-slot reflection panel (moved out of renderHarvest; now always shown first)
function renderReflectionPanel(pid, sid, existingMarkdown, alreadySubmitted) {
  const slots = [
    { key: 'learned', label: '我学到了什么 / 意识到了什么', placeholder: '例：我意识到我一直试图用"工程思维"解决一个"生态问题"…' },
    { key: 'differently', label: '我将做哪些不同', placeholder: '例：我不会再启动一个名为"情绪系统重建"的抽象项目，而是把能量投入到…' },
    { key: 'next', label: '我的下一步', placeholder: '例：我的下一步是，在今天下班前，给潜在合作者发一封邮件…' },
  ];

  // Try to parse saved client-notes file into per-slot values
  const saved = parseClientNotes(existingMarkdown);

  let html = '<div class="scard reflection-panel" id="s8-reflection">'
    + '<div class="st">📝 先写下我自己的反思</div>'
    + '<div class="achievement-hint">在幕僚评价之前，先把<strong>你自己从这次私董会带走的东西</strong>写下来。这很重要——你的反思会作为输入，让幕僚的评价和贝叶斯迭代都能看到你的视角。内容也会自动保存到本地。</div>';

  slots.forEach(s => {
    const lsKey = `counsel:achievement:${pid}:${sid}:${s.key}`;
    const initial = saved[s.key] || localStorage.getItem(lsKey) || '';
    html += `<div class="achievement-item">`
      + `<label>${s.label}</label>`
      + `<textarea id="s8-refl-${s.key}" placeholder="${esc(s.placeholder)}" data-k="${lsKey}" oninput="saveAchievement(this)">${esc(initial)}</textarea>`
      + `</div>`;
  });

  const btnLabel = alreadySubmitted ? '重新提交（将重新生成幕僚评价+贝叶斯迭代）' : '让幕僚根据我的反思做评估 →';
  html += `<button class="btn btn-w btn-full" id="s8-submit-btn" onclick="submitReflectionAndHarvest()">${btnLabel}</button>`;
  html += '</div>';

  return html;
}

// Parse the saved 07-client-notes.md back into per-slot strings
function parseClientNotes(text) {
  const out = { learned: '', differently: '', next: '' };
  if (!text) return out;
  const map = [
    ['我学到了什么 / 意识到了什么', 'learned'],
    ['我将做哪些不同', 'differently'],
    ['我的下一步', 'next'],
  ];
  for (const [heading, slot] of map) {
    const re = new RegExp(`##\\s+${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
    const m = text.match(re);
    if (m) {
      let val = m[1].trim();
      if (val === '_(空)_' || val === '_(empty)_') val = '';
      out[slot] = val;
    }
  }
  return out;
}

window.submitReflectionAndHarvest = async function() {
  const btn = document.getElementById('s8-submit-btn');
  const resultsEl = document.getElementById('s8-results');
  if (!btn || !resultsEl) return;

  const payload = {
    learned: (document.getElementById('s8-refl-learned')?.value || '').trim(),
    differently: (document.getElementById('s8-refl-differently')?.value || '').trim(),
    next: (document.getElementById('s8-refl-next')?.value || '').trim(),
  };

  btn.disabled = true;
  btn.textContent = '保存反思中…';

  try {
    // Phase C · write client reflection notes directly to IndexedDB.
    // Matches the server-side markdown shape so Step 8 persona eval +
    // Bayesian update prompts read the same structure from prior_state.
    const md = `## 我学到了什么 / 意识到了什么\n\n${payload.learned || '_(空)_'}\n\n## 我将做哪些不同\n\n${payload.differently || '_(空)_'}\n\n## 我的下一步\n\n${payload.next || '_(空)_'}\n`;
    if (!window.CounselDB) throw new Error('本地存储未就绪');
    const session = (await window.CounselDB.loadSession(SID)) || {
      id: SID,
      project_id: PID,
      files: {},
    };
    session.files = session.files || {};
    session.files['07-client-notes.md'] = md;
    await window.CounselDB.saveSession(session);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '让幕僚根据我的反思做评估 →';
    resultsEl.innerHTML = `<div class="error-msg">${esc(e.message)}</div>`;
    return;
  }

  btn.textContent = '反思已提交 ✓（幕僚评估中…）';
  resultsEl.innerHTML = '<div class="loading-text">幕僚正在基于你的反思给出评价…（streaming）</div>';

  try {
    const handlers = buildStep8StreamHandlers(resultsEl);
    handlers._onIdle = () => {
      const l = resultsEl.querySelector('.loading-text');
      if (l) l.textContent = 'AI正在深度思考，请稍候…';
    };
    await streamSSE(stepUrl(8), { force_refresh: true }, handlers);
  } catch (e) {
    resultsEl.innerHTML = `<div class="error-msg">${esc(e.message)}</div>`
      + `<button class="btn btn-w" style="margin-top:12px" onclick="submitReflectionAndHarvest()">重试</button>`;
    btn.disabled = false;
    btn.textContent = '重新提交';
    return;
  }

  const [evalsFile, harvestFile, bayesianFile] = await Promise.all([
    loadFile("07-persona-evals.md"),
    loadFile("07-harvest.md"),
    loadFile("07-bayesian.md"),
  ]);

  renderS8Results(resultsEl, evalsFile, harvestFile, bayesianFile);
  btn.disabled = false;
  btn.textContent = '重新提交（将重新生成幕僚评价+贝叶斯迭代）';
};

// 2026-04-25 — shared Step 8 streaming SSE handlers. Step 8a per-persona evals
// now arrive via PersonaChunk frames (was 30-90s silent wait); Step 8c bayesian
// streams via FacilitatorChunk (was non-streaming inside tokio::join!). Step 8b
// harvest_todo stays non-streaming and lands when SSE completes — the cached
// renderS8Results call after SSE done re-renders it from the saved file.
function buildStep8StreamHandlers(resultsEl) {
  if (!resultsEl) return {};
  const personaText = {};
  const bayesText = { acc: '' };
  let mounted = false;

  const ensureMounted = () => {
    if (mounted) return;
    mounted = true;
    resultsEl.innerHTML =
      '<div class="scard"><div class="st">幕僚评价 · streaming</div>' +
        '<div class="eval-grid" id="s8-live-grid"></div>' +
      '</div>' +
      '<div class="scard" id="s8-bayes-card"><div class="st">📊 贝叶斯信念迭代</div>' +
        '<div class="sb md-body" id="s8-bayes-live" data-markable data-step="8" data-persona="bayesian">' +
          '<div class="loading-text" style="font-size:12px">等秘书并行提炼…</div>' +
        '</div>' +
      '</div>';
  };

  return {
    step_start() { ensureMounted(); },
    persona_start(e) {
      ensureMounted();
      const name = e && e.name;
      if (!name) return;
      const id = 's8-eval-' + slugify(name);
      if (document.getElementById(id)) return;
      const p = pdata(name);
      const grid = document.getElementById('s8-live-grid');
      if (!grid) return;
      const card = document.createElement('div');
      card.className = 'scard';
      if (p.slug) card.setAttribute('data-p', p.slug);
      card.id = id;
      card.innerHTML =
        `<div class="st">${esc(name)} 的观察</div>` +
        `<div class="sb md-body cur" id="${id}-body" data-markable data-step="8" data-persona="${esc(name)}"></div>`;
      grid.appendChild(card);
      personaText[name] = '';
    },
    persona_chunk(e) {
      const name = e && e.name;
      if (!name) return;
      personaText[name] = (personaText[name] || '') + (e.chunk || '');
      const body = document.getElementById('s8-eval-' + slugify(name) + '-body');
      if (body) body.textContent = personaText[name];
    },
    persona_done(e) {
      const name = e && e.name;
      if (!name) return;
      const body = document.getElementById('s8-eval-' + slugify(name) + '-body');
      if (body) {
        body.innerHTML = md(personaText[name] || body.textContent || '');
        body.classList.remove('cur');
      }
    },
    facilitator_chunk(e) {
      ensureMounted();
      bayesText.acc += (e.chunk || '');
      const live = document.getElementById('s8-bayes-live');
      if (live) {
        live.textContent = bayesText.acc;
        live.classList.add('cur');
      }
    },
    facilitator_done() {
      const live = document.getElementById('s8-bayes-live');
      if (live) {
        live.innerHTML = md(bayesText.acc || '');
        live.classList.remove('cur');
      }
    },
    step_done() {},
  };
}

async function renderS8Results(el, evalsFile, harvestFile, bayesianFile) {
  // 2026-04-26 v2 · Step 8 fold structure (Michael's directive):
  //   ✅ Todos              — EXPANDED (main call to action)
  //   ⚠️ 几年后失败回顾      — EXPANDED (pre-mortem; the second highest-value piece)
  //   ⚡ 幕僚观察            — FOLDED
  //   📊 贝叶斯信念更新      — FOLDED
  //   📋 过程回顾 (insights) — FOLDED
  //
  // 2026-04-26 v3 · String-build refactor. Was 4× `el.innerHTML +=` between
  // awaits → each += re-parses the entire DOM tree → flicker. Now we build
  // one string and assign once at the end. ALL awaited file reads are
  // batched up-front in a single Promise.all so the function has exactly
  // one render phase.

  if (!harvestFile && !bayesianFile && !evalsFile) {
    el.innerHTML = '<div class="error-msg">未能获取结果</div>';
    return;
  }

  // Batch all file reads up-front
  const [premortemFile, consensusFile, actionsFile, summaryFile] = await Promise.all([
    loadFile('premortem.md'),
    loadFile('04alt-consensus.md'),
    loadFile('06alt-actions.md'),
    loadFile('06-summary.md'),
  ]);

  const harvestParts = harvestFile ? renderHarvestParts(harvestFile, PID, SID) : { todos: '', insights: '' };

  // 2026-04-26 — desktop defaults <details> OPEN (more screen real estate);
  // mobile portrait keeps closed-by-default (per Step 8 redesign goal of
  // "action-first, secondary content collapsed on small viewports").
  const isMobilePortrait = window.matchMedia('(max-width:480px) and (orientation:portrait)').matches;
  const detailsOpenAttr = isMobilePortrait ? '' : ' open';

  let html = '';

  // ── Expanded #1: Todos ────────────────────────────────────────────────
  if (harvestParts.todos) {
    html += harvestParts.todos;
  }

  // ── Expanded #2: Pre-mortem ──────────────────────────────────────────
  if (premortemFile && premortemFile.trim()) {
    html += `<div class="scard premortem-card"><div class="st">⚠️ 几年后失败回顾 · Pre-Mortem</div><div class="sb md-body" data-markable data-step="8" data-persona="premortem">${md(premortemFile)}</div></div>`;
  }

  // ── Folded: 幕僚观察 ──────────────────────────────────────────────────
  if (evalsFile) {
    const blocks = parseAdvisorEvalBlocks(evalsFile);
    let inner = '';
    if (blocks.matched.length > 0) {
      if (blocks.preface) {
        inner += `<div class="sb md-body" data-markable data-step="8" data-persona="evals-preface">${md(blocks.preface)}</div>`;
      }
      let evalGridHtml = '<div class="eval-grid">';
      blocks.matched.forEach(b => {
        evalGridHtml += `<div class="scard" data-p="${esc(b.slug)}"><div class="st">${esc(b.name)} 的观察</div><div class="sb md-body" data-markable data-step="8" data-persona="${esc(b.name)}">${md(b.body)}</div></div>`;
      });
      evalGridHtml += '</div>';
      inner += evalGridHtml;
    } else {
      inner += `<div class="sb md-body" data-markable data-step="8" data-persona="evals">${md(evalsFile)}</div>`;
    }
    html += `<details class="s8-fold"${detailsOpenAttr}><summary>⚡ 幕僚观察（看过你的反思后） · 点击展开</summary><div class="s8-fold-body">${inner}</div></details>`;
  }

  // ── Folded: 贝叶斯信念更新 ────────────────────────────────────────────
  if (bayesianFile) {
    html += `<details class="s8-fold"${detailsOpenAttr}><summary>📊 贝叶斯信念更新（综合你 + 幕僚双方） · 点击展开</summary><div class="s8-fold-body"><div class="sb md-body" data-markable data-step="8" data-persona="bayesian">${md(bayesianFile)}</div></div></details>`;
  }

  // ── Folded: 过程回顾 (consensus + actions + summary) ─────────────────
  let processInner = '';
  if (summaryFile) {
    processInner += `<div class="sb md-body" data-markable data-step="8" data-persona="summary"><h4>📋 秘书汇总</h4>${md(summaryFile)}</div>`;
  }
  if (consensusFile) {
    processInner += `<div class="sb md-body" style="margin-top:10px"><h4>🎯 共识与张力（Mode C）</h4>${md(consensusFile)}</div>`;
  }
  if (actionsFile) {
    processInner += `<div class="sb md-body" style="margin-top:10px"><h4>⚡ 全员行动建议（Mode C）</h4>${md(actionsFile)}</div>`;
  }
  if (harvestParts.insights) {
    processInner += `<div style="margin-top:10px">${harvestParts.insights}</div>`;
  }
  if (processInner) {
    html += `<details class="s8-fold"${detailsOpenAttr}><summary>📋 过程回顾 · 点击展开</summary><div class="s8-fold-body">${processInner}</div></details>`;
  }

  html += `<div class="done-banner">✓ 本次私董会圆满结束</div>`;

  // Single innerHTML assignment — no flicker, no mid-await re-parses
  el.innerHTML = html;
  queueMicrotask(() => applyAllSavedMarks(el));

  // Roundtable mode: hydrate seat bubbles with each advisor's eval + host
  // bubble with the Bayesian update. The sidebar remains the archive.
  if (document.body.classList.contains('rt-mode')) {
    rtClearPersonaBubbles();
    rtClearHostBubble();
    if (evalsFile) {
      const blocks = parseAdvisorEvalBlocks(evalsFile);
      blocks.matched.forEach(b => {
        if (b.slug) rtShowBubble(b.slug, b.short || b.name, b.body, {streaming: false});
      });
    }
    if (bayesianFile) {
      rtShowHostBubble(bayesianFile, {streaming: false, tag: '📊 贝叶斯迭代', variant: 'bayesian'});
    }
  }
}

// Split 07-persona-evals.md into per-advisor blocks keyed by `## {name}` headers.
// Unmatched leading text is returned as `preface`. Matched blocks resolve the
// header against the PERSONAS map so unknown names land in preface instead of
// getting a random bubble.
function parseAdvisorEvalBlocks(text) {
  const out = { preface: '', matched: [] };
  if (!text) return out;
  const lines = text.split('\n');
  const buf = { title: null, body: [] };
  const flush = () => {
    const body = buf.body.join('\n').trim();
    if (!body && !buf.title) return;
    if (buf.title) {
      const data = matchPersona(buf.title);
      if (data) {
        out.matched.push({ name: buf.title, slug: data.slug, short: data.short, body });
        return;
      }
      // Unmatched header — prepend it back into preface for readability
      out.preface += (out.preface ? '\n\n' : '') + '## ' + buf.title + '\n' + body;
    } else if (body) {
      out.preface += (out.preface ? '\n\n' : '') + body;
    }
  };
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      flush();
      buf.title = m[1].trim();
      buf.body = [];
    } else {
      buf.body.push(line);
    }
  }
  flush();
  return out;
}

// Parse 07-harvest.md into sections and return separate HTML strings for the
// action to-do list and the insights card. Caller (renderS8Results) places
// them at distinct points in the Step 8 layout — todos at the very top,
// insights between evals and bayesian.
// Note: client's own reflection is no longer rendered here — it lives in the
// separate renderReflectionPanel() at the TOP of Step 8 (2026-04-22 reorder).
function renderHarvestParts(text, pid, sid) {
  const sections = [];
  let currentTitle = null;
  let buffer = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (currentTitle !== null) sections.push({ title: currentTitle, body: buffer.join('\n').trim() });
      currentTitle = m[1];
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  if (currentTitle !== null) sections.push({ title: currentTitle, body: buffer.join('\n').trim() });

  const findSection = (kw) => {
    const low = kw.toLowerCase();
    return sections.find(s => s.title.toLowerCase().includes(low));
  };
  // Loosened (Michael 2026-04-25 — todos disappeared in real session): try
  // every common header variant, then fall through to "any section that
  // contains `- [ ]` checkboxes" so a stray header keyword doesn't hide them.
  let todoSec = findSection('to-do') || findSection('todo') || findSection('行动') || findSection('待办') || findSection('action') || findSection('清单') || findSection('next step');
  if (!todoSec) {
    todoSec = sections.find(s => /^\s*-\s*\[[ xX]\]/m.test(s.body));
  }
  const insightsSec = findSection('insight') || findSection('洞察');

  let todos = '';
  if (todoSec) {
    const todoLines = todoSec.body.split('\n').filter(l => /^\s*-\s*\[[ xX]\]/.test(l));
    if (todoLines.length > 0) {
      todos += '<div class="scard action-card"><div class="st">✅ 我现在该做什么</div><div class="todo-list">';
      todoLines.forEach((line, idx) => {
        const m = line.match(/^\s*-\s*\[([ xX])\]\s*(.+)$/);
        if (!m) return;
        const wasChecked = m[1].toLowerCase() === 'x';
        let itemText = m[2];
        // Phase 4 (2026-04-26) — extract trailing attribution「(毛 · PG)」.
        // harvest_todo_prompt asks LLM to put recommenders in parens at end.
        // Pull them out so the chip sits separate from the action text.
        let attribution = '';
        const attrMatch = itemText.match(/^(.*?)[\s ]*[（(]([^（）()]+)[）)][\s ]*$/);
        if (attrMatch) {
          itemText = attrMatch[1].trim();
          attribution = attrMatch[2].trim();
        }
        const storageKey = `counsel:todo:${pid}:${sid}:${idx}`;
        const savedState = localStorage.getItem(storageKey);
        const isChecked = savedState !== null ? (savedState === '1') : wasChecked;
        const rendered = md(itemText).replace(/^<p>/,'').replace(/<\/p>\s*$/,'').trim();
        const attrChip = attribution
          ? `<span class="todo-from" title="推荐这条 action 的幕僚">${esc(attribution)}</span>`
          : '';
        todos += `<label class="todo-item${isChecked ? ' done' : ''}" data-k="${storageKey}">`
          + `<input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleTodo(this)">`
          + `<span class="todo-text">${rendered}</span>`
          + attrChip
          + `</label>`;
      });
      todos += '</div></div>';
    }
  }

  let insights = '';
  if (insightsSec && insightsSec.body) {
    insights = `<div class="scard"><div class="st">💡 辩论洞察</div><div class="sb md-body" data-markable data-step="8" data-persona="insights">${md(insightsSec.body)}</div></div>`;
  }

  return { todos, insights };
}

window.toggleTodo = async function(el) {
  const item = el.closest('.todo-item');
  const key = item.getAttribute('data-k');
  localStorage.setItem(key, el.checked ? '1' : '0');
  item.classList.toggle('done', el.checked);
  // Wave 4 · task-coin flash on check (Michael 2026-04-25 immersive design):
  // a small gold coin pops next to the todo when the user commits, giving
  // tactile/quest-like feedback. Removed when un-checked.
  let coin = item.querySelector('.todo-coin');
  if (el.checked) {
    if (!coin) {
      coin = document.createElement('span');
      coin.className = 'todo-coin';
      coin.textContent = '🪙';
      item.appendChild(coin);
    } else {
      // Re-trigger the pop animation
      coin.style.animation = 'none';
      void coin.offsetWidth;
      coin.style.animation = '';
    }
  } else if (coin) {
    coin.remove();
  }

  // 2026-04-27 — "落地" ceremony fires before the IDB write so user-facing
  // feedback is independent of backend state. Once per page session; renders
  // a substantive panel below the action-card so the commitment has a
  // visible place to land + previews the 7-day follow-up loop + invites
  // the next iteration. Without this, clicking a todo just toggled a
  // checkbox; case-owner reported "感觉没有一个落地的地方沉淀下来".
  if (el.checked && !window._commitCeremonyShown) {
    window._commitCeremonyShown = true;
    const card = item.closest('.action-card') || item.closest('.scard');
    if (card && !card.parentElement.querySelector('.commit-ceremony')) {
      const cer = document.createElement('div');
      cer.className = 'commit-ceremony';
      cer.innerHTML = '<button class="commit-ceremony-close" onclick="this.parentElement.remove()" aria-label="关闭">×</button>'
        + '<div class="commit-ceremony-title">✓ 这条行动已沉淀到「我的画像」</div>'
        + '<div class="commit-ceremony-body">'
        + '<p>📅 <span class="hl">7 天后</span>，顶栏的「跟进」徽标会提醒你回来复盘。</p>'
        + '<p>到时把<span class="hl">进展</span>、<span class="hl">卡点</span>、和这一周长出的<span class="hl">新见解</span>都带回来 —— 我们用它启动下一轮，你的私董会会接着上次的思考往前推。</p>'
        + '<div class="commit-ceremony-meta">不止是一个 checkbox。这是你和这次决定之间的一个约定。</div>'
        + '</div>';
      card.insertAdjacentElement('afterend', cer);
    }
  }

  // Phase C · clicking a todo IS the commitment signal. Append directly to
  // IndexedDB `user_wiki` under the `## 行动承诺日志` section. The follow-up
  // scanner (📅 跟进 badge) will later read this section from IDB.
  const textEl = item.querySelector('.todo-text');
  const text = textEl ? textEl.textContent.trim() : '';
  if (!text || !PID || !SID || !window.CounselDB) return;
  try {
    const uid = (window.CounselAuth && window.CounselAuth.getUser() || {}).user_id;
    if (!uid) {
      showToast('请先登录以保存行动承诺', 'error');
      return;
    }
    const wikiRec = (await window.CounselDB.get('user_wiki', uid)) || { user_id: uid, content: '' };
    const now = new Date();
    const stamp = now.toISOString().slice(0, 16).replace('T', ' ');
    const marker = el.checked ? '✅' : '⬜';
    const line = `- [${stamp}] [${marker} 承诺 · Session ${SID}] ${marker} — ${text}\n`;
    let content = wikiRec.content || '';
    const header = '## 行动承诺日志';
    if (!content.includes(header)) {
      content += (content.trim() ? '\n\n' : '') + header + '\n\n';
    }
    // Insert under the header
    const parts = content.split(header);
    content = parts[0] + header + '\n' + line + (parts[1] || '');
    wikiRec.content = content;
    wikiRec.updated_at = now.toISOString();
    await window.CounselDB.put('user_wiki', wikiRec);
    console.log('todo commit → IDB user_wiki', { uid, sid: SID, checked: el.checked, text });
    // 2026-04-26 v3 · persistent confirm tag (was 1.6s ephemeral). Michael
    // couldn't see his commits in the 跟进 badge because the badge only fires
    // after 7 days, so the only feedback was a brief flash. Now the tag stays
    // on the row so case-owner has visible proof the todo entered the system.
    let confirm = item.querySelector('.todo-saved-flash');
    if (!confirm) {
      confirm = document.createElement('span');
      confirm.className = 'todo-saved-flash persistent';
      item.appendChild(confirm);
    }
    confirm.textContent = el.checked ? '✓ 7 天后跟进' : '↺ 已撤回';
  } catch (e) {
    console.error('todo commit failed (IDB)', e);
    showToast('保存行动承诺失败，请稍后重试', 'error');
  }
};

window.saveAchievement = function(el) {
  const key = el.getAttribute('data-k');
  const val = el.value;
  if (val && val.trim()) {
    localStorage.setItem(key, val);
  } else {
    localStorage.removeItem(key);
  }
};

// ─── Step Router ────────────────────────────────────────────────────────────

function runStep(n) {
  switch (n) {
    case 2: runS2(); break;
    case 3: runS3(); break;
    case 4: runS4(); break;
    case 5: runS5(); break;
    case 6: runS6(); break;
    case 7: runS7(); break;
    case 8: runS8(); break;
  }
}

// ─── Settings Modal ─────────────────────────────────────────────────────────

// 2026-04-25 — persist model selection across page reloads + server restarts.
// Was: openSettings ignored saved state, set-model always defaulted to the
// HTML value (deepseek-v4-flash). Plus saveSettings only PUT to server, never
// to localStorage. Combined: case-owner picks Pro → restart browser/server →
// back to flash silently. Now: localStorage holds the truth, openSettings
// rehydrates the form, app boot re-pushes to server.
const MODEL_SETTINGS_KEY = 'counsel:model-settings';

function loadSavedModelSettings() {
  try { return JSON.parse(localStorage.getItem(MODEL_SETTINGS_KEY) || 'null'); } catch { return null; }
}

async function pushModelSettingsToServer(saved) {
  if (!saved || !saved.provider || !saved.model) return;
  try {
    await fetch(`${API}/api/model-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: saved.provider,
        model: saved.model,
        api_key: saved.api_key || undefined,
        group_id: saved.group_id || undefined,
      }),
    });
  } catch (e) {
    console.warn('[model-settings] boot push failed:', e);
  }
}

window.openSettings = async function() {
  const u = window.CounselAuth && window.CounselAuth.getUser();
  const lbl = document.getElementById('settings-username');
  if (lbl) lbl.textContent = u ? u.username : '—';
  document.getElementById("settings-modal").classList.add("open");

  // Rehydrate provider + model from localStorage so the dropdown reflects what
  // we're actually using, not the HTML default.
  const saved = loadSavedModelSettings();
  if (saved) {
    const provEl = document.getElementById('set-provider');
    const modelEl = document.getElementById('set-model');
    const presetEl = document.getElementById('set-model-preset');
    if (provEl && saved.provider) provEl.value = saved.provider;
    if (modelEl && saved.model) modelEl.value = saved.model;
    if (presetEl && saved.model) {
      const match = Array.from(presetEl.options).find(o => o.value === saved.model);
      presetEl.value = match ? saved.model : '';
    }
    if (typeof onProviderChange === 'function') onProviderChange();
  }

  // Phase B — refresh local-data counts
  const stats = document.getElementById('settings-backup-stats');
  const msg = document.getElementById('settings-backup-msg');
  if (msg) msg.textContent = '';
  if (stats && window.CounselDB) {
    try {
      const sessions = await window.CounselDB.listSessionsForUser();
      const projects = await window.CounselDB.listProjectsForUser();
      stats.textContent = ' · ' + projects.length + ' 个项目 / ' + sessions.length + ' 个会话';
    } catch (_) {
      stats.textContent = '';
    }
  }
};

window.exportBackup = async function () {
  const msg = document.getElementById('settings-backup-msg');
  try {
    const dump = await window.CounselDB.exportAll();
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.download = 'counsel-backup-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (msg) msg.textContent = '已导出 · ' + (dump.sessions || []).length + ' 个会话';
  } catch (e) {
    if (msg) msg.textContent = '导出失败：' + (e.message || e);
  }
};

window.importBackup = async function (ev) {
  const msg = document.getElementById('settings-backup-msg');
  const file = ev && ev.target && ev.target.files && ev.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const dump = JSON.parse(text);
    const res = await window.CounselDB.importAll(dump);
    if (msg) msg.textContent = '已导入 · ' + res.sessions + ' 个会话，' + res.projects + ' 个项目。刷新页面生效。';
    // reset file input so same file can be re-picked
    ev.target.value = '';
  } catch (e) {
    if (msg) msg.textContent = '导入失败：' + (e.message || e);
  }
};

window.closeSettings = function() {
  document.getElementById("settings-modal").classList.remove("open");
};

window.onProviderChange = function() {
  const p = document.getElementById("set-provider").value;
  const show = p === "minimax";
  document.getElementById("set-groupid").style.display = show ? "" : "none";
  document.getElementById("set-groupid-label").style.display = show ? "" : "none";
};

window.saveSettings = async function() {
  const provider = document.getElementById("set-provider").value;
  const model = document.getElementById("set-model").value;
  const apiKey = document.getElementById("set-apikey").value;
  const groupId = document.getElementById("set-groupid").value;

  try {
    const res = await fetch(`${API}/api/model-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        model,
        api_key: apiKey || undefined,
        group_id: groupId || undefined,
      }),
    });
    if (!res.ok) {
      // Surface the server's actual error message — was being swallowed as
      // generic "HTTP 400" before, hiding e.g. "DEEPSEEK_API_KEY not set".
      let msg = `HTTP ${res.status}`;
      try {
        const body = await res.text();
        if (body) msg += ' — ' + body.slice(0, 200);
      } catch {}
      throw new Error(msg);
    }
    // 2026-04-25 — write to localStorage AFTER server accepted, so the next
    // page-load re-pushes the same settings (server is still per-process state).
    // Note: api_key NOT stored in localStorage to avoid plaintext key on disk;
    // env-var fallback in update_model_settings handles re-push without a key.
    localStorage.setItem(MODEL_SETTINGS_KEY, JSON.stringify({
      provider, model,
      group_id: groupId || undefined,
    }));
    closeSettings();
  } catch (e) {
    alert("保存失败: " + e.message);
  }
};

// ─── History Panel ──────────────────────────────────────────────────────────

window.openHistory = async function() {
  document.getElementById("history-modal").classList.add("open");
  const list = document.getElementById("history-list");
  list.innerHTML = '<div class="loading-text">加载中…</div>';

  // 2026-04-26 — diagnostic chip surfaces login state + raw IDB counts so a
  // "history is empty" report (especially on mobile) is instantly diagnosable
  // without DevTools. iOS Safari ITP can evict IDB after 7 days unused, and
  // saveSession() with `user_id: null` (anonymous) won't appear under a
  // logged-in `currentUserId()` filter.
  const u = (window.CounselAuth && window.CounselAuth.getUser()) || null;
  const allSessions = (window.CounselDB && await window.CounselDB.getAll('sessions').catch(() => [])) || [];
  const myUid = u ? u.user_id : null;
  const mineCount = allSessions.filter(s => s.user_id === myUid).length;
  const orphanCount = allSessions.filter(s => !s.user_id).length;
  const otherCount = allSessions.length - mineCount - orphanCount;
  const diagBits = [];
  diagBits.push(u ? `登录：${esc(u.username || u.user_id)}` : '⚠️ 未登录（数据按 user_id 分组，匿名 session 不会出现在这里）');
  diagBits.push(`IDB 共 ${allSessions.length} 条 session`);
  diagBits.push(`你的：${mineCount}`);
  if (orphanCount > 0) diagBits.push(`匿名（user_id 空）：${orphanCount}`);
  if (otherCount > 0) diagBits.push(`其他账号：${otherCount}`);
  const diagHtml = `<div style="font-size:10px;color:rgba(255,255,255,.5);padding:6px 10px;border:1px solid rgba(255,255,255,.08);border-radius:8px;margin-bottom:10px;line-height:1.6">${diagBits.join(' · ')}</div>`;

  try {
    // Phase D · all session history lives in IndexedDB
    if (!window.CounselDB) throw new Error('本地存储未就绪');
    const sessions = await window.CounselDB.listSessionsForUser();
    if (!sessions.length) {
      list.innerHTML = diagHtml + '<div class="loading-text">暂无会话记录</div>';
      return;
    }

    let html = "";
    for (const s of sessions) {
      const isCurrent = s.id === SID;
      const preview = String(s.raw_input || (s.files && s.files['00-raw-input.md']) || '').slice(0, 120);
      const date = s.created_at ? new Date(s.created_at).toLocaleString("zh-CN", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }) : "";
      const cur = s.current_step || 1;
      const stepLabel = cur >= 8 ? "已完成" : `步骤 ${cur}/8`;
      const doneClass = cur >= 8 ? " done" : "";
      const currentTag = isCurrent ? ' <span style="color:rgba(255,255,255,.5);font-size:10px">· 当前</span>' : '';

      html += `<div class="hcard" onclick="loadSession('${s.project_id}','${s.id}')">`;
      html += `<div class="hcard-q">${esc(preview)}</div>`;
      html += `<div class="hcard-meta"><span class="hcard-step${doneClass}">${stepLabel}</span><span>${date}${currentTag}</span></div>`;
      html += `<div class="hcard-btns">`;
      html += `<button class="btn btn-g" style="font-size:10px;padding:3px 8px" onclick="event.stopPropagation();window.open('?projectId=${s.project_id}&sessionId=${s.id}','_blank')">新标签页打开</button>`;
      if (!isCurrent) {
        html += `<button class="btn btn-g" style="font-size:10px;padding:3px 8px" onclick="event.stopPropagation();loadSession('${s.project_id}','${s.id}')">切换到此会话</button>`;
      }
      html += `</div></div>`;
    }

    list.innerHTML = diagHtml + html;
  } catch (e) {
    list.innerHTML = diagHtml + `<div class="error-msg">${esc(e.message)}</div>`;
  }
};

// "新建" — clear URL params and reload so user starts with a fresh Step 1
window.startNewSession = function() {
  if (window.location.search) {
    window.location.href = window.location.pathname;
  } else {
    // Already on a fresh page — just clear input + show Step 1
    const ta = document.getElementById("s1-input");
    if (ta) ta.value = "";
    PID = null;
    SID = null;
    clearProjectBanner();
    showStep(1);
  }
};

// "🏠 首页" — same as startNewSession, but labeled to emphasize "go home"
// (not "create new problem"). Both functions share behavior; they differ only
// in user intent framing.
window.goHome = function() {
  startNewSession();
};

// "💬 群聊" — light track. Lives at /chat.html as a separate page so it
// doesn't entangle with the 8-step state machine. Token in localStorage is
// shared, so no re-login. Promoted from admin-only on 2026-04-27 (§3.9).
window.enterChatMode = function() {
  location.href = '/chat.html';
};

// "+ 新一轮追踪" — user clicked the button on an existing project card in the
// Problem Library. We set PID (so submitInput skips /projects POST), clear
// SID, show Step 1 with a banner that makes it clear which project the new
// session belongs to.
window.startNewSessionInProject = async function(pid, projectName) {
  PID = pid;
  SID = null;
  showProjectBanner(projectName);
  showStep(1);
  // 2026-04-26 v3 · pre-fill Step 1 textarea with last-session context so
  // case-owner sees the cross-session flywheel from the moment they start
  // a new round. Editable; case-owner can replace entirely if they want.
  const ta = document.getElementById("s1-input");
  if (ta) {
    const prefill = await buildContinuationPrefill(pid);
    ta.value = prefill;
    ta.focus();
    // Place caret at the end (after "这一轮我想：")
    try { ta.setSelectionRange(prefill.length, prefill.length); } catch {}
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// 2026-04-26 v3 · Build a context-prefilled starter for "+ 新一轮". Reads
// the latest session's bayesian + commitments + summary head; emits a
// formatted block ending with "这一轮我想：" so the case-owner just types
// their new question. Returns "" if nothing to prefill (first session of
// the project, somehow).
async function buildContinuationPrefill(pid) {
  if (!window.CounselDB || !pid) return "";
  try {
    const allSessions = await window.CounselDB.getAll('sessions');
    const projectSessions = allSessions
      .filter(s => s.project_id === pid)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    const last = projectSessions[0];
    if (!last || !last.files) return "";

    const defined = (last.files['01-defined.md'] || '').split('\n').slice(0, 4).join('\n').trim();
    const bayesian = last.files['07-bayesian.md'] || '';
    const summary = last.files['06-summary.md'] || '';

    // Pull a percentage out of bayesian (信念变化先行 prompt outputs %)
    const beliefMatch = bayesian.match(/(\d+%[^\n]{0,40})/);
    const belief = beliefMatch ? beliefMatch[1].trim() : '';

    // First non-header line of summary as decision summary
    const summaryFirstLine = summary
      .split('\n')
      .map(l => l.replace(/^#+\s*/, '').replace(/^\s*[\*\-]\s*/, '').trim())
      .find(l => l && l.length >= 6) || '';

    // Commitments for THIS session
    const commitments = await readCommitmentsForSession(last.id);

    const daysAgo = last.created_at
      ? Math.max(1, Math.floor((Date.now() - new Date(last.created_at).getTime()) / 86400000))
      : null;
    const dateLine = daysAgo ? `[上一轮 ${daysAgo} 天前]` : '[上一轮回顾]';

    const lines = [dateLine];
    if (defined) {
      const topicLine = defined.split('\n').find(l => l.trim()) || '';
      if (topicLine) lines.push(`议题：${topicLine.slice(0, 60)}`);
    }
    if (summaryFirstLine) lines.push(`决策概要：${summaryFirstLine.slice(0, 80)}`);
    if (belief) lines.push(`信念：${belief}`);
    if (commitments.length > 0) {
      const commitText = commitments.slice(0, 3).map(c => {
        const status = c.checked ? '✅' : '⬜';
        return `${status} ${c.text.slice(0, 40)}`;
      }).join('；');
      lines.push(`我承诺：${commitText}`);
    }
    lines.push('');
    lines.push('这一轮我想：');
    return lines.join('\n');
  } catch (e) {
    console.warn('buildContinuationPrefill failed', e);
    return "";
  }
}

// 2026-04-26 v3 · Project Timeline View. Lists all sessions of a project
// in chronological order with belief drift + commitment fulfillment so
// the case-owner can SEE the cross-session flywheel (not just the LLM).
window.openProjectTimeline = async function(pid, projectName) {
  const modal = document.getElementById('timeline-modal');
  if (!modal) return;
  modal.classList.add('open');
  const nameEl = document.getElementById('timeline-project-name');
  if (nameEl) nameEl.textContent = projectName || pid;
  const content = document.getElementById('timeline-content');
  if (!content) return;
  content.innerHTML = '<div class="loading-text">加载时间线…</div>';

  try {
    const all = await window.CounselDB.getAll('sessions');
    const sessions = all
      .filter(s => s.project_id === pid)
      .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

    if (sessions.length === 0) {
      content.innerHTML = '<div class="error-msg">这个项目还没有 session</div>';
      return;
    }

    // Extract session-level data
    const cards = [];
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      const files = s.files || {};
      const defined = (files['01-defined.md'] || '').split('\n').map(l => l.replace(/^#+\s*/, '').trim()).find(l => l) || '(议题未锁定)';
      const summary = files['06-summary.md'] || '';
      const summaryFirstLine = summary
        .split('\n')
        .map(l => l.replace(/^#+\s*/, '').replace(/^\s*[\*\-]\s*/, '').trim())
        .find(l => l && l.length >= 6) || '';
      const bayesian = files['07-bayesian.md'] || '';
      const beliefMatch = bayesian.match(/(\d+)%/);
      const belief = beliefMatch ? parseInt(beliefMatch[1], 10) : null;

      const commitments = await readCommitmentsForSession(s.id);
      const dateStr = s.created_at
        ? new Date(s.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
        : '';

      cards.push({
        sid: s.id,
        idx: i + 1,
        date: dateStr,
        defined: defined.slice(0, 60),
        decision: summaryFirstLine.slice(0, 100),
        belief,
        beliefDelta: i > 0 && cards[i - 1] && cards[i - 1].belief !== null && belief !== null
          ? belief - cards[i - 1].belief
          : null,
        commitments,
        currentStep: s.current_step || 0,
      });
    }

    // Render
    let html = '';
    cards.forEach((c, i) => {
      const beliefHtml = c.belief !== null
        ? `<div class="tl-belief">信念：<strong>${c.belief}%</strong>` +
          (c.beliefDelta !== null
            ? ` <span class="tl-delta tl-delta-${c.beliefDelta > 0 ? 'up' : c.beliefDelta < 0 ? 'down' : 'flat'}">` +
              (c.beliefDelta > 0 ? '▲' : c.beliefDelta < 0 ? '▼' : '·') + Math.abs(c.beliefDelta) + '</span>'
            : '') +
          `</div>`
        : '';

      let commitHtml = '';
      if (c.commitments.length > 0) {
        commitHtml = '<div class="tl-commits">承诺：' + c.commitments.slice(0, 4).map(cm => {
          const status = cm.checked ? '✅' : '⬜';
          return `<span class="tl-commit">${status} ${esc(cm.text.slice(0, 24))}${cm.text.length > 24 ? '…' : ''}</span>`;
        }).join('') + '</div>';
      }

      html += `<div class="tl-card" data-step="${c.currentStep}">`
        + `<div class="tl-card-head">`
          + `<span class="tl-card-num">● Session ${c.idx}</span>`
          + `<span class="tl-card-date">${esc(c.date)}</span>`
          + `<button class="tl-card-go" onclick="loadSession('${esc(pid)}','${esc(c.sid)}')">查看 →</button>`
        + `</div>`
        + `<div class="tl-card-topic">${esc(c.defined)}</div>`
        + (c.decision ? `<div class="tl-card-decision">📋 ${esc(c.decision)}${c.decision.length === 100 ? '…' : ''}</div>` : '')
        + beliefHtml
        + commitHtml
        + `</div>`;
      if (i < cards.length - 1) html += `<div class="tl-line"></div>`;
    });

    // Belief evolution sparkline
    const beliefPoints = cards.filter(c => c.belief !== null).map(c => c.belief);
    if (beliefPoints.length >= 2) {
      const w = 280, h = 60, pad = 8;
      const xs = beliefPoints.map((_, i) => pad + (i * (w - 2 * pad) / (beliefPoints.length - 1)));
      const ys = beliefPoints.map(b => h - pad - (b / 100) * (h - 2 * pad));
      const points = beliefPoints.map((_, i) => `${xs[i].toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
      const dots = beliefPoints.map((b, i) =>
        `<circle cx="${xs[i].toFixed(1)}" cy="${ys[i].toFixed(1)}" r="3" fill="#fff"/><text x="${xs[i].toFixed(1)}" y="${(ys[i] - 6).toFixed(1)}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,.6)">${b}%</text>`
      ).join('');
      html += `<div class="tl-curve"><div class="tl-curve-label">信念演化曲线</div>`
        + `<svg width="${w}" height="${h + 14}" viewBox="0 0 ${w} ${h + 14}">`
        + `<polyline points="${points}" fill="none" stroke="rgba(176,176,255,.7)" stroke-width="1.5" stroke-linejoin="round"/>`
        + dots
        + `</svg></div>`;
    }

    html += `<div class="tl-footer"><button class="btn btn-w" onclick="closeProjectTimeline();startNewSessionInProject('${esc(pid)}','${esc(projectName || '')}')">+ 开新一轮 N+1（带上一轮上下文）</button></div>`;

    content.innerHTML = html;
  } catch (e) {
    content.innerHTML = `<div class="error-msg">时间线加载失败：${esc(e.message || String(e))}</div>`;
    console.error('[timeline]', e);
  }
};

window.closeProjectTimeline = function() {
  document.getElementById('timeline-modal').classList.remove('open');
};

// Parse user_wiki for `## 行动承诺日志` lines for a specific session
async function readCommitmentsForSession(sid) {
  try {
    const u = window.CounselAuth && window.CounselAuth.getUser();
    if (!u) return [];
    const wikiRec = await window.CounselDB.get('user_wiki', u.user_id);
    if (!wikiRec || !wikiRec.content) return [];
    const headerIdx = wikiRec.content.indexOf('## 行动承诺日志');
    if (headerIdx === -1) return [];
    const after = wikiRec.content.slice(headerIdx + '## 行动承诺日志'.length);
    const nextHdr = after.search(/\n## /);
    const body = nextHdr === -1 ? after : after.slice(0, nextHdr);

    const out = [];
    const re = /-\s*\[(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2})\]\s*\[(.+?)·\s*Session\s+([^\]]+)\]\s*(.+?)\s*—\s*(.+)/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const sessId = m[3].trim();
      if (sessId !== sid) continue;
      const checked = (m[2].trim().startsWith('✅'));
      const text = m[5].trim();
      out.push({ checked, text, ts: m[1] });
    }
    return out;
  } catch { return []; }
}

function showProjectBanner(projectName) {
  const banner = document.getElementById("s1-project-banner");
  if (!banner) return;
  banner.style.display = "flex";
  banner.innerHTML =
    '<div class="project-banner-text">' +
      '<div class="project-banner-label">🔗 延续问题 · 开一轮新 session</div>' +
      `<div class="project-banner-name">${esc(projectName)}</div>` +
    '</div>' +
    '<button class="project-banner-clear" onclick="clearProjectBanner();startNewSession()">改为全新问题</button>';
}

function clearProjectBanner() {
  const banner = document.getElementById("s1-project-banner");
  if (banner) { banner.style.display = "none"; banner.innerHTML = ""; }
}

window.closeHistory = function() {
  document.getElementById("history-modal").classList.remove("open");
};

// ─── User Wiki Panel ────────────────────────────────────────────────────────

// Parse the secretary's [实体 | 关系 | 事实 | 日期] line format from core.md
// into objects the UI can render as cards. Tolerant: any malformed line is
// dropped silently rather than failing the whole render.
function parseCoreFacts(coreText) {
  if (!coreText) return [];
  const out = [];
  for (const raw of coreText.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('[') || !line.endsWith(']')) continue;
    const inner = line.slice(1, -1);
    const parts = inner.split('|').map(s => s.trim());
    if (parts.length < 3) continue;
    out.push({
      entity: parts[0] || '',
      relation: parts[1] || '',
      fact: parts[2] || '',
      date: parts[3] || '',
    });
  }
  return out;
}

// Parse the log/INDEX.md one-line-per-session format. Each row:
// `- [YYYY-MM-DD · 项目名](sid.md) — hook` (≤80 chars hook).
function parseLogIndex(indexText) {
  if (!indexText) return [];
  const rows = [];
  const re = /^-\s+\[([^\]]+)\]\(([^)]+)\.md\)\s*—\s*(.*)$/;
  for (const raw of indexText.split('\n')) {
    const m = raw.trim().match(re);
    if (!m) continue;
    const label = m[1];
    const sid = m[2];
    const hook = m[3] || '(无 hook)';
    // Split the label "YYYY-MM-DD · 项目" into separate fields when present.
    const labelParts = label.split('·').map(s => s.trim());
    const date = labelParts[0] || '';
    const project = labelParts[1] || '';
    rows.push({ date, project, sid, hook });
  }
  return rows;
}

window.openUserWiki = async function() {
  document.getElementById("wiki-modal").classList.add("open");
  const panel = document.getElementById("wiki-content");
  panel.innerHTML = '<div class="loading-text">加载画像…</div>';
  try {
    if (!window.CounselDB || !window.CounselAuth) {
      panel.innerHTML = '<div class="error-msg">浏览器存储不可用。</div>';
      return;
    }
    const u = window.CounselAuth.getUser();
    if (!u) {
      panel.innerHTML = '<div class="error-msg">未登录。</div>';
      return;
    }
    // D1: lazy backfill from legacy user_wiki on first portrait open.
    // Pure JS split (no LLM) — gives "您思考过什么" content immediately.
    let tierRec = await window.CounselDB.get('user_data', u.user_id);
    const legacyRec = await window.CounselDB.get('user_wiki', u.user_id);
    const tierEmpty = !tierRec || !tierRec.log_sessions || Object.keys(tierRec.log_sessions || {}).length === 0;
    const hasLegacyContent = legacyRec && legacyRec.content && legacyRec.content.trim();
    if (tierEmpty && hasLegacyContent && window.CounselDB.backfillTierFromLegacy) {
      try {
        const result = await window.CounselDB.backfillTierFromLegacy();
        if (result && result.migrated > 0) {
          tierRec = await window.CounselDB.get('user_data', u.user_id);
        }
      } catch (e) {
        console.warn('backfillTierFromLegacy failed (non-fatal)', e);
      }
    }

    const facts = parseCoreFacts(tierRec ? tierRec.core : '');
    const indexRows = parseLogIndex(tierRec ? tierRec.log_index : '');
    const hasTier = facts.length > 0 || indexRows.length > 0;
    const hasLegacy = legacyRec && legacyRec.content && legacyRec.content.trim();

    if (!hasTier && !hasLegacy) {
      panel.innerHTML = `
        <div class="portrait-empty">
          <div class="portrait-empty-icon">👤</div>
          <div class="portrait-empty-title">暂无画像内容</div>
          <div class="portrait-empty-body">
            完成一次私董会（第 8 步收获），你的核心事实和议题轨迹会自动累积到这里，跨项目持续打磨这份画像。
          </div>
          ${portraitFooter()}
        </div>
      `;
      return;
    }

    const userName = u.name || u.username || '案主';
    const sessionCount = indexRows.length;
    const coreEmpty = facts.length === 0;
    const hasIndex = indexRows.length > 0;

    // D3: "整理画像" CTA when index exists but core is empty (typically post-D1 state for legacy users).
    const integrateCta = (coreEmpty && hasIndex)
      ? `<button class="portrait-integrate-btn" onclick="window._portraitRunBackfill(false)">
           ✨ 整理这 ${sessionCount} 次会议，提炼您的核心画像 →
         </button>
         <div class="portrait-integrate-hint">用 AI 从过往议题里抽出您的身份层事实（≤3 条/次会议），跨设备保留。</div>`
      : '';

    // D3: "重新提炼 ↻" icon — always available when there is index content.
    const reExtractIcon = hasIndex
      ? `<button class="portrait-reextract-icon" onclick="window._portraitRunBackfill(true)" title="重新提炼最近 5 次会议的事实">↻</button>`
      : '';

    const factsHtml = coreEmpty
      ? (hasIndex
          ? '<div class="portrait-empty-mini">点击上方按钮整理出您的核心画像。</div>'
          : '<div class="portrait-empty-mini">还没有累积到核心事实——再做几次会议就有了。</div>')
      : facts.map(f => `
          <div class="fact-card">
            <div class="fact-relation">${esc(f.relation)}</div>
            <div class="fact-body">${esc(f.fact)}</div>
            ${f.date ? `<div class="fact-date">${esc(f.date)}</div>` : ''}
          </div>
        `).join('');

    const indexHtmlInitial = indexRows.slice(0, 5).map((row, i) => indexRowHtml(row, i)).join('');
    const hasMore = indexRows.length > 5;
    const indexExtraHtml = hasMore
      ? indexRows.slice(5).map((row, i) => indexRowHtml(row, i + 5)).join('')
      : '';

    const legacyFallback = (!hasTier && hasLegacy)
      ? `<details class="portrait-legacy"><summary>查看旧版完整画像（迁移过渡期）</summary><div class="md-body">${md(legacyRec.content)}</div></details>`
      : '';

    panel.innerHTML = `
      <div class="portrait">
        <div class="portrait-head">
          <div class="portrait-name">${esc(userName)}</div>
          <div class="portrait-meta">已私董 <b>${sessionCount}</b> 次</div>
        </div>

        ${integrateCta}

        <section class="portrait-section">
          <div class="portrait-section-title">您是谁 · 核心事实 ${reExtractIcon}</div>
          <div class="portrait-section-sub">跨 session 复用的身份层信号；最多 ${facts.length || 0} 条，旧的会被新的挤出。</div>
          <div class="fact-grid">${factsHtml}</div>
        </section>

        <section class="portrait-section">
          <div class="portrait-section-title">您思考过什么 · 议题轨迹</div>
          <div class="portrait-section-sub">每行一次过往会议的核心议题，最近优先。点击查看那次会议的详情。</div>
          <div class="index-list" id="portrait-index-initial">${indexHtmlInitial || '<div class="portrait-empty-mini">还没有过往议题。</div>'}</div>
          ${hasMore
            ? `<button class="portrait-more-btn" onclick="window._portraitShowAll()">查看全部 ${indexRows.length} 次 →</button>
               <div class="index-list" id="portrait-index-extra" style="display:none">${indexExtraHtml}</div>`
            : ''}
        </section>

        ${legacyFallback}

        ${portraitFooter()}
      </div>
    `;

    // Stash tierRec so the click-to-expand can pull session bodies from it.
    window._portraitTier = tierRec || null;
  } catch (e) {
    panel.innerHTML = `<div class="error-msg">加载失败：${esc(e.message)}</div>`;
  }
};

function indexRowHtml(row, idx) {
  return `
    <div class="index-row" data-sid="${esc(row.sid)}">
      <div class="index-row-head" onclick="window._portraitToggleRow(${idx})">
        <span class="index-row-meta">${esc(row.date || '?')}${row.project ? ' · ' + esc(row.project) : ''}</span>
        <span class="index-row-hook">${esc(row.hook)}</span>
        <span class="index-row-arrow" id="portrait-arrow-${idx}">▸</span>
      </div>
      <div class="index-row-body" id="portrait-body-${idx}" style="display:none"></div>
    </div>
  `;
}

window._portraitShowAll = function() {
  const extra = document.getElementById('portrait-index-extra');
  if (extra) extra.style.display = 'block';
  const btn = document.querySelector('.portrait-more-btn');
  if (btn) btn.style.display = 'none';
};

window._portraitToggleRow = function(idx) {
  const body = document.getElementById('portrait-body-' + idx);
  const arrow = document.getElementById('portrait-arrow-' + idx);
  if (!body) return;
  if (body.style.display === 'none') {
    if (!body.dataset.loaded) {
      const head = body.previousElementSibling;
      const sid = head && head.parentElement ? head.parentElement.dataset.sid : null;
      const tier = window._portraitTier;
      const content = tier && tier.log_sessions && sid ? tier.log_sessions[sid] : null;
      body.innerHTML = content
        ? `<div class="md-body">${md(content)}</div>`
        : '<div class="portrait-empty-mini">这次会议的详情还没同步到本设备 — 重新打开页面或下次步骤完成时会更新。</div>';
      body.dataset.loaded = '1';
    }
    body.style.display = 'block';
    if (arrow) arrow.textContent = '▾';
  } else {
    body.style.display = 'none';
    if (arrow) arrow.textContent = '▸';
  }
};

// D3: 调用 /api/user-wiki/backfill。recent=true 时只送最近 5 条（"重新提炼"
// 模式）；false 时送全部最多 10 条（"整理"模式）。完成后写回 IDB + re-open.
window._portraitRunBackfill = async function(recentOnly) {
  const u = window.CounselAuth && window.CounselAuth.getUser();
  if (!u) return;
  const tier = await window.CounselDB.get('user_data', u.user_id);
  if (!tier || !tier.log_sessions || Object.keys(tier.log_sessions).length === 0) {
    alert('没有可整理的过往会议');
    return;
  }

  // 选 session：最近 5 / 全部最多 10
  const sids = Object.keys(tier.log_sessions).sort().reverse();
  const limit = recentOnly ? 5 : 10;
  const selected = sids.slice(0, limit);
  const payload = { log_sessions: {} };
  selected.forEach(sid => { payload.log_sessions[sid] = tier.log_sessions[sid]; });

  // UI: progress overlay
  const panel = document.getElementById('wiki-content');
  const overlay = document.createElement('div');
  overlay.className = 'portrait-progress-overlay';
  overlay.innerHTML = `
    <div class="portrait-progress-card">
      <div class="portrait-progress-spinner">⏳</div>
      <div class="portrait-progress-title">${recentOnly ? '重新提炼' : '整理'} ${selected.length} 次会议中…</div>
      <div class="portrait-progress-sub">每次会议约需 2-3 秒，共约 ${selected.length * 3} 秒</div>
    </div>
  `;
  if (panel) panel.appendChild(overlay);

  try {
    const token = localStorage.getItem('counsel:token') || '';
    const r = await fetch('/api/user-wiki/backfill', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      throw new Error(`HTTP ${r.status}`);
    }
    const result = await r.json();

    // 写回 IDB
    const updated = Object.assign({}, tier, {
      core: result.core || '',
      updated_at: new Date().toISOString(),
      core_extracted_at: new Date().toISOString(),
    });
    await window.CounselDB.put('user_data', updated);

    // 显示结果 toast 然后 re-render
    overlay.innerHTML = `
      <div class="portrait-progress-card portrait-progress-done">
        <div class="portrait-progress-spinner">✓</div>
        <div class="portrait-progress-title">已提炼 ${result.fact_count} 条核心事实</div>
        <div class="portrait-progress-sub">从 ${result.processed_sessions} 次会议中抽取${result.failed_sessions ? `（${result.failed_sessions} 次跳过）` : ''}</div>
      </div>
    `;
    setTimeout(() => {
      window.openUserWiki();
    }, 1200);
  } catch (e) {
    overlay.innerHTML = `
      <div class="portrait-progress-card portrait-progress-error">
        <div class="portrait-progress-spinner">⚠</div>
        <div class="portrait-progress-title">整理失败</div>
        <div class="portrait-progress-sub">${esc(e.message || '未知错误')}</div>
        <button onclick="this.closest('.portrait-progress-overlay').remove()" class="btn btn-w" style="margin-top:14px">关闭</button>
      </div>
    `;
  }
};

function portraitFooter() {
  return `
    <div class="portrait-footer">
      <div class="portrait-privacy">
        <strong>隐私承诺：</strong>您的<b>8 步私董会内容、思考记录、画像</b>仅保存在您本设备的浏览器中——服务器在每次请求结束后销毁所有临时文件、不留副本。
        <span class="portrait-privacy-hint">
          服务器仅保留：① 登录信息；② 不含正文的使用埋点；③ 您主动提交的反馈/许愿；④ <b>群聊对话（多人共享场景必需）</b>。
          换设备或清浏览器数据会让本地内容丢失，如需备份可在「设置」里导出 JSON。
        </span>
      </div>
    </div>
  `;
}

window.closeUserWiki = function() {
  document.getElementById("wiki-modal").classList.remove("open");
};

// ─── Persona Picker (Phase 7.1) ─────────────────────────────────────────────
// Lets the case-owner pick ≤12 advisors for this session from whatever set the
// admin allows (GET /api/personas). Picks persist to localStorage as the
// user-level default + per-session `99-personas.json` when confirmed.
//
// Flow:
//   openPersonaPicker()         — mount modal with current picks pre-selected
//   togglePersonaPick(slug)     — flip one persona; enforce 12 cap
//   requestPersonaSuggestion()  — ask facilitator LLM to pre-fill picks
//   confirmPersonaPicker()      — persist picks + rebuild seats
//   closePersonaPicker()        — dismiss without saving
//   clearPersonaPicker()        — uncheck all (still requires confirm to persist)

const PP_STORAGE_KEY = 'counsel:default-personas';
const PP_TEMPLATES_KEY = 'counsel:persona-templates';
const PP_MAX = 12;
const PP_MIN = 1;

// B3 (2026-04-25) · multi-template support. Storage shape:
// counsel:persona-templates = [{ name: string, slugs: string[], created_at: number }]
// Migration: if old counsel:default-personas exists and templates is empty,
// seed one template "默认组" with the legacy picks.
function loadPersonaTemplates() {
  try {
    const raw = JSON.parse(localStorage.getItem(PP_TEMPLATES_KEY) || '[]');
    if (Array.isArray(raw) && raw.length) return raw;
  } catch {}
  // Migrate legacy single-list to a one-template store
  try {
    const legacy = JSON.parse(localStorage.getItem(PP_STORAGE_KEY) || '[]');
    if (Array.isArray(legacy) && legacy.length) {
      const seeded = [{ name: '默认组', slugs: legacy, created_at: Date.now() }];
      localStorage.setItem(PP_TEMPLATES_KEY, JSON.stringify(seeded));
      return seeded;
    }
  } catch {}
  return [];
}

function savePersonaTemplates(templates) {
  try { localStorage.setItem(PP_TEMPLATES_KEY, JSON.stringify(templates)); } catch {}
}

window.applyPersonaTemplate = function(name) {
  const tpl = loadPersonaTemplates().find(t => t.name === name);
  if (!tpl) return;
  personaPickerState.selected = new Set(tpl.slugs);
  renderPersonaPickerGrid();
  updatePersonaPickerCount();
  renderPersonaTemplates();
};

window.deletePersonaTemplate = function(name) {
  if (!confirm(`确认删除模板「${name}」？`)) return;
  const next = loadPersonaTemplates().filter(t => t.name !== name);
  savePersonaTemplates(next);
  renderPersonaTemplates();
};

window.saveCurrentPersonaTemplate = function() {
  const slugs = [...personaPickerState.selected];
  if (slugs.length < PP_MIN) {
    alert('请先选择至少 1 位幕僚再保存');
    return;
  }
  const name = (prompt('给这个模板起个名字（如「Michael 私董会」「产品组」）：', '') || '').trim();
  if (!name) return;
  const templates = loadPersonaTemplates();
  const idx = templates.findIndex(t => t.name === name);
  if (idx >= 0) {
    if (!confirm(`模板「${name}」已存在，覆盖？`)) return;
    templates[idx] = { name, slugs, created_at: Date.now() };
  } else {
    templates.push({ name, slugs, created_at: Date.now() });
  }
  savePersonaTemplates(templates);
  renderPersonaTemplates();
};

function renderPersonaTemplates() {
  const box = document.getElementById('pp-templates');
  if (!box) return;
  const templates = loadPersonaTemplates();
  if (!templates.length) {
    box.innerHTML = '<div class="pp-templates-hint">💡 选好后点「另存为模板」可快速切换不同私董会组合</div>';
    return;
  }
  const currentSlugs = JSON.stringify([...personaPickerState.selected].sort());
  let html = '<div class="pp-templates-label">模板：</div>';
  for (const t of templates) {
    const isActive = JSON.stringify([...t.slugs].sort()) === currentSlugs;
    html += `<button class="pp-template-chip${isActive ? ' active' : ''}" onclick="applyPersonaTemplate(${JSON.stringify(t.name).replace(/"/g,'&quot;')})" title="${esc(t.slugs.length + ' 位幕僚')}">`
      + `<span class="pp-template-name">${esc(t.name)}</span>`
      + `<span class="pp-template-count">${t.slugs.length}</span>`
      + `<span class="pp-template-del" onclick="event.stopPropagation();deletePersonaTemplate(${JSON.stringify(t.name).replace(/"/g,'&quot;')})" title="删除模板">×</span>`
      + `</button>`;
  }
  box.innerHTML = html;
}

let personaPickerState = {
  selected: new Set(),   // current picks inside the modal
  available: [],         // [{slug, name, title, color, initial}]
  loading: false,
};

/// Read the case-owner's current effective picks, without mutating anything.
/// Phase D · session → IndexedDB, default → localStorage.
async function getCurrentPersonaPicks() {
  if (PID && SID && window.CounselDB) {
    try {
      const session = await window.CounselDB.loadSession(SID);
      if (session && Array.isArray(session.personas) && session.personas.length) {
        return session.personas;
      }
    } catch { /* fall through */ }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(PP_STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

/// Refresh the "👥 幕僚组 X / 12" chip on Step 1. Called after picker confirm
/// + on page init + after session create. Shows "默认" when nothing picked yet
/// (signals "I haven't chosen — server defaults will apply").
async function updatePersonaChip() {
  const span = document.getElementById('s1-persona-count');
  if (!span) return;
  const picks = await getCurrentPersonaPicks();
  span.textContent = picks.length > 0 ? `${picks.length} / ${PP_MAX}` : '默认';
}

window.openPersonaPicker = async function() {
  const modal = document.getElementById('persona-picker-modal');
  if (!modal) return;
  modal.classList.add('open');

  // Fetch the admin-allowed roster. If a prior fetch already populated
  // activePersonas, use it as a fast path; otherwise hit the endpoint.
  try {
    const r = await fetch('/api/personas');
    personaPickerState.available = r.ok ? await r.json() : [];
  } catch {
    personaPickerState.available = [];
  }
  if (!personaPickerState.available.length) {
    document.getElementById('pp-grid').innerHTML =
      '<div class="loading-text">无法加载幕僚名单</div>';
    return;
  }

  const current = await getCurrentPersonaPicks();
  personaPickerState.selected = new Set(current);
  document.getElementById('pp-reasoning').style.display = 'none';
  document.getElementById('pp-hint').style.display = 'none';
  renderPersonaTemplates();
  renderPersonaPickerGrid();
  updatePersonaPickerCount();
};

window.closePersonaPicker = function() {
  document.getElementById('persona-picker-modal').classList.remove('open');
};

window.clearPersonaPicker = function() {
  personaPickerState.selected.clear();
  renderPersonaPickerGrid();
  updatePersonaPickerCount();
};

// ─── 许愿幕僚（2026-04-27） ─────────────────────────────────────────────
window.openPersonaWisher = function() {
  const m = document.getElementById('persona-wisher-modal');
  const input = document.getElementById('pw-input');
  const err = document.getElementById('pw-error');
  if (input) input.value = '';
  if (err) { err.textContent = ''; err.style.display = 'none'; }
  if (m) m.classList.add('open');
  setTimeout(() => input && input.focus(), 60);
};

window.closePersonaWisher = function() {
  const m = document.getElementById('persona-wisher-modal');
  if (m) m.classList.remove('open');
};

window.submitPersonaWish = async function() {
  const input = document.getElementById('pw-input');
  const err = document.getElementById('pw-error');
  const btn = document.getElementById('pw-submit');
  const name = (input && input.value || '').trim();
  if (!name) {
    if (err) { err.textContent = '请输入幕僚名字'; err.style.display = 'block'; }
    return;
  }
  if (err) { err.textContent = ''; err.style.display = 'none'; }
  if (btn) { btn.disabled = true; btn.textContent = '提交中…'; }
  try {
    const r = await fetch('/api/persona-wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona_name: name }),
    });
    // Always read body so failures show a precise reason (not just "提交失败").
    const bodyText = await r.text();
    let data = {};
    try { data = JSON.parse(bodyText); } catch (_) { /* keep raw text */ }
    if (!r.ok) {
      const reason = data.error || bodyText.slice(0, 200) || '(empty body)';
      throw new Error(`HTTP ${r.status}: ${reason}`);
    }
    closePersonaWisher();
    if (typeof showToast === 'function') {
      showToast(data.msg || '已收到，谢谢你的许愿 🙏', 'ok');
    } else {
      alert(data.msg || '已收到，谢谢你的许愿 🙏');
    }
  } catch (e) {
    if (err) { err.textContent = e.message || '提交失败'; err.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '许愿'; }
  }
};

function renderPersonaPickerGrid() {
  const grid = document.getElementById('pp-grid');
  if (!grid) return;
  const sel = personaPickerState.selected;
  const disableUnchecked = sel.size >= PP_MAX;

  // Split: selected advisors get a compact chip in the top strip; unselected
  // advisors fill the grid. Selected cards are REMOVED from the grid so the
  // top strip becomes the single source of "who's on the team" at a glance.
  const selectedList = personaPickerState.available.filter(p => sel.has(p.slug || p.id));
  const unselectedList = personaPickerState.available.filter(p => !sel.has(p.slug || p.id));

  // Render (or remove) the selected strip above the grid.
  const parent = grid.parentElement;
  let strip = parent ? parent.querySelector('.pp-selected-strip') : null;
  if (selectedList.length === 0) {
    if (strip) strip.remove();
  } else {
    if (!strip) {
      strip = document.createElement('div');
      strip.className = 'pp-selected-strip';
      if (parent) parent.insertBefore(strip, grid);
    }
    strip.innerHTML = selectedList.map(p => {
      const slug = p.slug || p.id;
      const color = p.color || hashColor(slug);
      const initial = p.initial || hashInitial(p.name);
      const avClass = GRID_SLUGS.has(canonicalSlug(slug))
        ? `pp-chip-av av-grid p-${canonicalSlug(slug)}`
        : 'pp-chip-av av-initial';
      const avStyle = GRID_SLUGS.has(canonicalSlug(slug)) ? '' : `style="color:${color}"`;
      const avContent = GRID_SLUGS.has(canonicalSlug(slug)) ? '' : initial;
      return `<span class="pp-chip" data-slug="${esc(slug)}">`
        + `<span class="${avClass}" ${avStyle}>${esc(avContent)}</span>`
        + `<span class="pp-chip-name">${esc(p.name || slug)}</span>`
        + `<button type="button" class="pp-chip-x" aria-label="移除" onclick="togglePersonaPick('${esc(slug)}')">×</button>`
        + `</span>`;
    }).join('');
  }

  // Render the grid with only UNSELECTED advisors.
  grid.innerHTML = unselectedList.map(p => {
    const slug = p.slug || p.id;
    const isDisabled = disableUnchecked;  // nothing is "selected" in the grid anymore
    const color = p.color || hashColor(slug);
    const initial = p.initial || hashInitial(p.name);
    const avClass = GRID_SLUGS.has(canonicalSlug(slug))
      ? `pp-av av-grid p-${canonicalSlug(slug)}`
      : 'pp-av av-initial';
    const avStyle = GRID_SLUGS.has(canonicalSlug(slug))
      ? ''
      : `style="color:${color}"`;
    const avContent = GRID_SLUGS.has(canonicalSlug(slug)) ? '' : initial;
    return `
      <div class="pp-card ${isDisabled ? 'disabled' : ''}"
           data-slug="${esc(slug)}"
           onclick="togglePersonaPick('${esc(slug)}')">
        <div class="${avClass}" ${avStyle}>${esc(avContent)}</div>
        <div class="pp-meta">
          <div class="pp-name">${esc(p.name || slug)}</div>
          <div class="pp-title">${esc(p.title || '')}</div>
        </div>
      </div>`;
  }).join('');
}

window.togglePersonaPick = function(slug) {
  const sel = personaPickerState.selected;
  if (sel.has(slug)) {
    sel.delete(slug);
  } else {
    if (sel.size >= PP_MAX) return;  // silently cap; card also shows disabled
    sel.add(slug);
  }
  renderPersonaPickerGrid();
  updatePersonaPickerCount();
};

function updatePersonaPickerCount() {
  const n = personaPickerState.selected.size;
  const cntEl = document.getElementById('pp-count');
  const cntWrap = cntEl ? cntEl.parentElement : null;
  if (cntEl) cntEl.textContent = String(n);
  if (cntWrap) cntWrap.classList.toggle('over', n > PP_MAX);
  const confirm = document.getElementById('pp-confirm');
  if (confirm) {
    const valid = n >= PP_MIN && n <= PP_MAX;
    confirm.disabled = !valid;
    confirm.style.opacity = valid ? '1' : '.45';
  }
}

window.requestPersonaSuggestion = async function() {
  const hint = document.getElementById('pp-hint');
  const reasoning = document.getElementById('pp-reasoning');
  const btn = document.getElementById('pp-suggest-btn');

  if (!PID || !SID) {
    hint.textContent = '先提交你的问题（回到首页写几句），主持人才能为你挑幕僚。';
    hint.style.display = '';
    return;
  }

  btn.disabled = true;
  btn.textContent = '主持人思考中…';
  hint.style.display = 'none';

  try {
    // Phase D · stateless. Pull raw_input from IDB, send in body.
    let raw_input = '';
    if (window.CounselDB && SID) {
      const sess = await window.CounselDB.loadSession(SID);
      raw_input = (sess && (sess.raw_input || (sess.files && sess.files['00-raw-input.md']))) || '';
    }
    if (!raw_input) {
      const ta = document.getElementById('s1-input');
      raw_input = ta ? ta.value.trim() : '';
    }
    const r = await fetch('/api/suggest-personas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_input }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      hint.textContent = `主持人没返回有效建议（${err.error || r.status}）。你可以自己挑。`;
      hint.style.display = '';
      return;
    }
    const { recommended, reasoning: why } = await r.json();
    if (Array.isArray(recommended) && recommended.length) {
      personaPickerState.selected = new Set(recommended.slice(0, PP_MAX));
      renderPersonaPickerGrid();
      updatePersonaPickerCount();
    }
    if (why) {
      reasoning.textContent = why;
      reasoning.style.display = '';
    }
  } catch (e) {
    hint.textContent = `请求失败：${e.message}。你可以自己挑。`;
    hint.style.display = '';
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ 让主持人帮我挑';
  }
};

window.confirmPersonaPicker = async function() {
  const picks = [...personaPickerState.selected];
  if (picks.length < PP_MIN || picks.length > PP_MAX) return;

  // B3 (2026-04-25) — keep legacy single-list key for backwards compat with
  // anything that still reads PP_STORAGE_KEY (e.g. server-side checks)
  try { localStorage.setItem(PP_STORAGE_KEY, JSON.stringify(picks)); } catch {}

  if (window.CounselAnalytics) {
    window.CounselAnalytics.track('persona_selected', {
      session_id: SID,
      personas: picks,
      count: picks.length,
    });
  }

  // Phase D · persist per-session picks directly to IndexedDB
  if (PID && SID && window.CounselDB) {
    try {
      const session = (await window.CounselDB.loadSession(SID)) || { id: SID, project_id: PID, files: {} };
      session.personas = picks;
      await window.CounselDB.saveSession(session);
    } catch (e) {
      console.warn('failed to persist personas to IDB:', e);
    }
  }

  // Rebuild seats + chip
  await loadActivePersonas();
  if (document.body.classList.contains('rt-mode')) {
    if (typeof buildRingNodes === 'function') buildRingNodes();
    if (typeof buildTableNodes === 'function') buildTableNodes();
  }
  await updatePersonaChip();
  closePersonaPicker();
};

// ─── F4 · Example Questions Library (2026-04-26) ────────────────────────────
// 9 类目精选题（来自 benchmark stage3，按 decision_urgency 排序 top 3 per category）。
// 折叠 chip 横排，点击 chip 展开题目列表，点击题填入 #s1-input。

async function loadExampleQuestions() {
  const box = document.getElementById("example-questions");
  if (!box) return;
  if (PID && SID) { box.style.display = "none"; return; }
  box.style.display = "block";
  let data;
  try {
    const r = await fetch('/data/example-questions.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('fetch failed');
    data = await r.json();
  } catch (e) {
    box.style.display = "none";
    return;
  }
  const cats = (data && data.categories) || [];
  if (!cats.length) { box.style.display = "none"; return; }
  const html = `
    <div class="eq-head">
      <div class="eq-title">💡 试试这些问题</div>
      <div class="eq-sub">点击类目展开 · 点题目即可填入</div>
    </div>
    <div class="eq-chips">
      ${cats.map((c, i) => `
        <button type="button" class="eq-cat-chip" data-idx="${i}" onclick="toggleExampleCategory(${i})">
          <span class="eq-icon">${c.icon || '·'}</span>
          <span class="eq-name">${esc(c.name)}</span>
        </button>
      `).join('')}
    </div>
    <div id="eq-panel" class="eq-panel" style="display:none"></div>
  `;
  box.innerHTML = html;
  window._exampleQuestionsData = cats;
}

window.toggleExampleCategory = function(idx) {
  const cats = window._exampleQuestionsData || [];
  const cat = cats[idx];
  if (!cat) return;
  const panel = document.getElementById("eq-panel");
  if (!panel) return;
  document.querySelectorAll('.eq-cat-chip').forEach(el => el.classList.remove('active'));
  if (panel.dataset.idx === String(idx) && panel.style.display !== "none") {
    panel.style.display = "none";
    panel.dataset.idx = "";
    return;
  }
  const activeChip = document.querySelector('.eq-cat-chip[data-idx="' + idx + '"]');
  if (activeChip) activeChip.classList.add('active');
  panel.dataset.idx = String(idx);
  panel.style.display = "block";
  panel.innerHTML = (cat.questions || []).map((q, qi) => `
    <div class="eq-question" data-cat="${idx}" data-q="${qi}" onclick="useExampleQuestion(${idx},${qi})">
      ${esc(q)}
    </div>
  `).join('');
};

window.useExampleQuestion = function(catIdx, qIdx) {
  const cats = window._exampleQuestionsData || [];
  const q = cats[catIdx] && cats[catIdx].questions && cats[catIdx].questions[qIdx];
  if (!q) return;
  const ta = document.getElementById("s1-input");
  if (!ta) return;
  ta.value = q;
  ta.focus();
  try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
  ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// ─── Problem Library (主页问题库) ───────────────────────────────────────────
// Lists projects + their sessions below Step 1 input on the home view.
// Each project expands to show its sessions with a short summary. Clicking a
// session resumes that conversation. Only rendered when we're on a fresh page
// (no ?projectId=...&sessionId=...), i.e. the Step 1 landing state.

async function loadProblemLibrary() {
  const box = document.getElementById("problem-library");
  if (!box) return;
  // Only show library when NOT resuming a session
  if (PID && SID) { box.style.display = "none"; return; }
  box.style.display = "block";
  box.innerHTML = '<div class="loading-text" style="padding:14px 0">加载问题库…</div>';

  try {
    // Phase D · problem library reads from IndexedDB
    if (!window.CounselDB) throw new Error('本地存储未就绪');
    const projects = await window.CounselDB.listProjectsForUser();
    const allSessions = await window.CounselDB.listSessionsForUser();
    if (!projects.length || !allSessions.length) {
      box.innerHTML =
        '<div class="problem-library-head"><div>' +
          '<div class="problem-library-title">📚 你的问题库</div>' +
          '<div class="problem-library-sub">每个问题可以跨多次 session 持续深入</div>' +
        '</div></div>' +
        '<div class="problem-library-empty">还没有问题——在上方写下你的第一个困境开始。</div>';
      return;
    }

    // Group sessions by project_id locally
    const byPid = new Map();
    for (const s of allSessions) {
      if (!byPid.has(s.project_id)) byPid.set(s.project_id, []);
      byPid.get(s.project_id).push(s);
    }
    const active = projects
      .map(p => ({ project: p, sessions: byPid.get(p.id) || [] }))
      .filter(x => x.sessions.length > 0);
    active.sort((a, b) => {
      const da = Math.max(...a.sessions.map(s => new Date(s.created_at || 0).getTime()));
      const db = Math.max(...b.sessions.map(s => new Date(s.created_at || 0).getTime()));
      return db - da;
    });

    let html =
      '<div class="problem-library-head"><div>' +
        '<div class="problem-library-title">📚 你的问题库</div>' +
        '<div class="problem-library-sub">每个问题可以跨多次 session 持续深入——点击展开查看过往轨迹</div>' +
      '</div></div>';

    active.forEach((entry, pi) => {
      const p = entry.project;
      const sessions = entry.sessions.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      const lastDate = sessions[0] && sessions[0].created_at ? new Date(sessions[0].created_at).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) : "";
      const projName = p.name || sessions[0]?.raw_input?.slice(0, 40) || "未命名";
      html += `<div class="pl-project" id="pl-proj-${pi}" data-pid="${esc(p.id)}" data-pname="${esc(projName)}">`
        + `<div class="pl-project-head" onclick="togglePlProject(${pi})">`
          + `<div class="pl-chev">▸</div>`
          + `<div class="pl-project-name">${esc(projName)}</div>`
          + `<div class="pl-project-meta">`
            + `<button class="pl-project-timeline" onclick="event.stopPropagation();openProjectTimeline('${esc(p.id)}','${esc(projName)}')" title="跨多轮 session 看一眼信念演化 + 承诺履约">🕒 时间线</button>`
            + `<button class="pl-project-new" onclick="event.stopPropagation();startNewSessionInProject('${esc(p.id)}','${esc(projName)}')" title="在这个问题下开一轮新的追踪私董会">+ 新一轮</button>`
            + `<span class="pl-project-count">${sessions.length} 次</span>`
            + `<span>${esc(lastDate)}</span>`
          + `</div>`
        + `</div>`
        + `<div class="pl-sessions" id="pl-sessions-${pi}">`;
      sessions.forEach((s, si) => {
        const date = s.created_at ? new Date(s.created_at).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
        const stepLabel = s.current_step >= 8 ? "已完成" : `步骤 ${s.current_step}/8`;
        const doneClass = s.current_step >= 8 ? " done" : "";
        html += `<div class="pl-session" onclick="loadSession('${p.id}','${s.id}')" data-sessid="${si}">`
          + `<div class="pl-session-top">`
            + `<span class="pl-session-step${doneClass}">${stepLabel}</span>`
            + `<span class="pl-session-date">${esc(date)}</span>`
          + `</div>`
          + `<div class="pl-session-summary loading" id="pl-summary-${pi}-${si}" data-pid="${esc(p.id)}" data-sid="${esc(s.id)}" data-raw="${esc(s.raw_input || '')}">加载中…</div>`
          + `</div>`;
      });
      html += `</div></div>`;
    });
    box.innerHTML = html;
  } catch (e) {
    box.innerHTML = `<div class="error-msg">问题库加载失败：${esc(e.message)}</div>`;
  }
}

// Phase D · lazy-load session summary from IndexedDB (01-defined.md, fall
// back to raw_input).
window.togglePlProject = async function(pi) {
  const card = document.getElementById(`pl-proj-${pi}`);
  if (!card) return;
  const wasOpen = card.classList.contains('open');
  card.classList.toggle('open');
  if (wasOpen) return;
  const summaryEls = card.querySelectorAll('.pl-session-summary.loading');
  await Promise.all(Array.from(summaryEls).map(async el => {
    const sid = el.dataset.sid;
    const raw = el.dataset.raw || '';
    try {
      const session = window.CounselDB ? await window.CounselDB.loadSession(sid) : null;
      const defined = session && session.files ? session.files['01-defined.md'] : null;
      if (defined && defined.trim()) {
        el.textContent = defined.trim();
        el.classList.remove('loading');
        return;
      }
    } catch {}
    el.textContent = raw || '(无内容)';
    el.classList.remove('loading');
  }));
};

// ─── Follow-Ups (Phase 2.3 — 后续追踪小助理) ────────────────────────────────
// Phase D · scan IndexedDB user_wiki for `## 行动承诺日志` entries older than
// 7 days that haven't yet been journaled. Server is not involved.

async function scanOverdueCommitments() {
  if (!window.CounselDB || !window.CounselAuth) return [];
  const u = window.CounselAuth.getUser();
  if (!u) return [];
  const wikiRec = await window.CounselDB.get('user_wiki', u.user_id);
  const journalRec = await window.CounselDB.get('execution_journal', u.user_id);
  if (!wikiRec || !wikiRec.content) return [];

  const content = wikiRec.content;
  const headerIdx = content.indexOf('## 行动承诺日志');
  if (headerIdx === -1) return [];
  const after = content.slice(headerIdx + '## 行动承诺日志'.length);
  const nextHdr = after.search(/\n## /);
  const body = nextHdr === -1 ? after : after.slice(0, nextHdr);

  const journalBody = journalRec ? (journalRec.content || '') : '';
  const out = [];
  // Matches our IDB writer format: `- [YYYY-MM-DD HH:MM] [✅ 承诺 · Session {sid}] ✅ — {todo}`
  const re = /-\s*\[(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2})\]\s*\[[^\]]+?·\s*Session\s+([^\]]+)\][^—]*?—\s*(.+)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const [_, committed, session_id, todo] = m;
    const ts = Date.parse(committed.replace(' ', 'T') + ':00');
    if (isNaN(ts)) continue;
    const daysAgo = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
    if (daysAgo < 7) continue;
    if (journalBody.includes(todo.trim())) continue;
    out.push({ todo: todo.trim(), committed_at: committed, session_id: session_id.trim(), days_ago: daysAgo });
  }
  return out;
}

async function refreshFollowUpBadge() {
  try {
    const items = await scanOverdueCommitments();
    const badge = document.getElementById('followup-badge');
    if (!badge) return;
    if (items.length > 0) {
      badge.textContent = items.length;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  } catch (e) {
    console.warn('refreshFollowUpBadge failed', e);
  }
}

window.openFollowUps = async function() {
  document.getElementById('followup-modal').classList.add('open');
  const list = document.getElementById('followup-list');
  list.innerHTML = '<div class="loading-text">加载过期承诺…</div>';
  try {
    const items = await scanOverdueCommitments();
    if (items.length === 0) {
      list.innerHTML = '<div class="fu-empty">🎯 当前没有超过 7 天未跟进的承诺。<br>完成 Step 8 勾选行动后，系统会自动在这里提醒你回头检视。</div>';
      return;
    }
    list.innerHTML = items.map((item, i) => `
      <div class="fu-card" id="fu-card-${i}" data-todo="${esc(item.todo)}" data-committed="${esc(item.committed_at)}" data-session="${esc(item.session_id)}">
        <div class="fu-meta">
          <span class="fu-days">${item.days_ago} 天前</span>
          <span>承诺于 ${esc(item.committed_at)}</span>
          <span style="opacity:.4">· Session ${esc(item.session_id.slice(0, 8))}…</span>
        </div>
        <div class="fu-todo">${esc(item.todo)}</div>
        <div class="fu-status-label">状态</div>
        <div class="fu-status-row" id="fu-status-${i}">
          <button class="fu-status-opt" data-v="done" onclick="selectFuStatus(${i}, this)">✅ 做到了</button>
          <button class="fu-status-opt" data-v="in_progress" onclick="selectFuStatus(${i}, this)">🔄 进行中</button>
          <button class="fu-status-opt" data-v="skipped" onclick="selectFuStatus(${i}, this)">⏭ 跳过</button>
          <button class="fu-status-opt" data-v="reframed" onclick="selectFuStatus(${i}, this)">🔁 重新定义</button>
        </div>
        <textarea class="fu-reply" id="fu-reply-${i}" placeholder="发生了什么？具体一点——你做了/没做什么、遇到了什么、学到了什么？"></textarea>
        <button class="btn btn-w fu-submit" onclick="submitFollowUp(${i})">保存到执行日志</button>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = `<div class="error-msg">${esc(e.message)}</div>`;
  }
};

window.closeFollowUps = function() {
  document.getElementById('followup-modal').classList.remove('open');
};

window.selectFuStatus = function(i, btn) {
  const row = document.getElementById('fu-status-' + i);
  row.querySelectorAll('.fu-status-opt').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
};

window.submitFollowUp = async function(i) {
  const card = document.getElementById('fu-card-' + i);
  const statusBtn = document.getElementById('fu-status-' + i).querySelector('.fu-status-opt.sel');
  const reply = document.getElementById('fu-reply-' + i).value.trim();
  if (!statusBtn) { alert('先选一个状态'); return; }
  const status = statusBtn.dataset.v;
  const todo = card.dataset.todo;
  const committed_at = card.dataset.committed;
  const session_id = card.dataset.session;
  try {
    // Phase D · append directly to IndexedDB execution_journal
    if (!window.CounselDB || !window.CounselAuth) throw new Error('存储未就绪');
    const u = window.CounselAuth.getUser();
    if (!u) throw new Error('未登录');
    const rec = (await window.CounselDB.get('execution_journal', u.user_id)) || { user_id: u.user_id, content: '' };
    let content = rec.content || '';
    if (!content.trim()) {
      content = '# 行动执行日志（Execution Journal）\n\n*每次"跟进"时，案主对过去承诺的更新记录。幕僚会在后续 session 读取这里。*\n';
    }
    const now = new Date();
    const stamp = now.toISOString().slice(0, 16).replace('T', ' ');
    const statusLabel = { done: '✅ 做到了', in_progress: '🔄 进行中', skipped: '⏭ 跳过', reframed: '🔁 重新定义' }[status] || status;
    const entry = `\n---\n\n## ${stamp} — Session ${session_id.slice(0, 8)}…\n\n**承诺**（${committed_at}）：${todo}\n\n**状态**：${statusLabel}\n\n${reply ? `**说明**：${reply}\n` : ''}`;
    rec.content = content + entry;
    rec.updated_at = now.toISOString();
    await window.CounselDB.put('execution_journal', rec);

    card.classList.add('submitted');
    const sub = card.querySelector('.fu-submit');
    if (sub) { sub.textContent = '已记录 ✓'; sub.disabled = true; }
    refreshFollowUpBadge();
  } catch (e) {
    alert('保存失败：' + e.message);
  }
};

window.loadSession = function(pid, sid) {
  closeHistory();
  window.location.href = `?projectId=${pid}&sessionId=${sid}`;
};

// ─── Error Display ──────────────────────────────────────────────────────────

function showError(container, msg) {
  if (!container) return;
  const div = document.createElement("div");
  div.className = "error-msg";
  div.textContent = msg;
  container.appendChild(div);
}

// ─── Init ───────────────────────────────────────────────────────────────────

async function bootWithAuth() {
  const ok = await window.CounselAuth.ensureAuth();
  if (!ok) return;
  const u = window.CounselAuth.getUser();
  if (u) window.CounselAnalytics.track('session_boot', { username: u.username });

  const params = new URLSearchParams(location.search);
  PID = params.get("projectId");
  SID = params.get("sessionId");

  initRoundtableUI();
  initPhraseToolbar();
  refreshFollowUpBadge();
  loadExampleQuestions();
  loadProblemLibrary();
  updatePersonaChip();
  initStuckDetector();
  initFeedbackButton();
  initSessionTelemetry();

  // 2026-04-25 — re-push saved model settings on every boot. Server is per-
  // process state (Phase 6.C tempdir); a restart drops the choice. localStorage
  // holds the user's pick across reloads/restarts; this re-asserts it before
  // any /steps/* call lands on a freshly-defaulted server.
  pushModelSettingsToServer(loadSavedModelSettings());

  // Phase B · pull latest user-level files into local IDB on every boot
  if (window.CounselDB) window.CounselDB.mirrorUserFiles().catch(() => {});

  if (PID && SID) {
    resumeSession();
    // Also snapshot the resumed session locally so a later clear of server
    // state (Phase C) doesn't take a user's in-progress work with it.
    if (window.CounselDB) window.CounselDB.mirrorSession(PID, SID).catch(() => {});
  } else {
    showStep(1);
  }
}

// Idle detector: if a user sits on a step for > STUCK_MS without interaction,
// emit a `stuck` event so we can see where people hit walls.
function initStuckDetector() {
  const STUCK_MS = 60000;
  let lastInteract = Date.now();
  let reported = false;
  const reset = () => {
    lastInteract = Date.now();
    reported = false;
  };
  ['click', 'keydown', 'input', 'scroll'].forEach((ev) =>
    window.addEventListener(ev, reset, { passive: true })
  );
  setInterval(() => {
    const idle = Date.now() - lastInteract;
    if (!reported && idle >= STUCK_MS && document.visibilityState === 'visible') {
      reported = true;
      if (window.CounselAnalytics && typeof currentStep === 'number') {
        window.CounselAnalytics.markStuck(currentStep, SID, idle);
      }
    }
  }, 15000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootWithAuth);
} else {
  bootWithAuth();
}

// ─── Phase H · Change-password from Settings (Michael 2026-04-25) ──────────
window.changePassword = async function() {
  const oldEl = document.getElementById('pw-old');
  const newEl = document.getElementById('pw-new');
  const new2El = document.getElementById('pw-new2');
  const msg = document.getElementById('pw-msg');
  const btn = document.getElementById('pw-submit');
  if (!oldEl || !newEl || !new2El) return;
  const oldP = oldEl.value;
  const newP = newEl.value;
  const new2 = new2El.value;
  msg.style.color = 'rgba(255,255,255,.6)';
  if (!oldP || !newP) { msg.textContent = '旧密码和新密码都要填'; return; }
  if (newP !== new2) { msg.textContent = '两次新密码不一致'; return; }
  if (newP.length < 6 || newP.length > 128) { msg.textContent = '新密码长度 6-128 字符'; return; }
  if (oldP === newP) { msg.textContent = '新密码不能和旧密码相同'; return; }
  btn.disabled = true;
  btn.textContent = '更新中…';
  try {
    const token = localStorage.getItem('counsel:token');
    const r = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ old_password: oldP, new_password: newP }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    msg.style.color = '#8fe08f';
    msg.textContent = '✓ 密码已更新';
    oldEl.value = ''; newEl.value = ''; new2El.value = '';
    if (window.CounselAnalytics) window.CounselAnalytics.track('password_changed', {});
  } catch (e) {
    msg.style.color = '#ff8a8a';
    msg.textContent = '失败：' + (e.message || e);
  } finally {
    btn.disabled = false;
    btn.textContent = '更新密码';
  }
};

// ─── Phase H · Floating feedback button (Michael 2026-04-25) ────────────────
// Bottom-right circular button. Click → modal with textarea + checkbox to
// include current step/session context. Submit POSTs /api/feedback. Skipped
// on the auth overlay screen (no logged-in user).
function initFeedbackButton() {
  if (document.getElementById('fb-dock')) return;

  const dock = document.createElement('div');
  dock.id = 'fb-dock';
  dock.className = 'fb-dock';

  const popover = document.createElement('div');
  popover.id = 'fb-popover';
  popover.className = 'fb-popover';
  popover.setAttribute('aria-hidden', 'true');
  popover.innerHTML =
    '<div class="fb-popover-qr">' +
      '<img src="/wechat-wish-group-qr.png" alt="AI 私董会许愿群二维码" onerror="this.closest(\'.fb-popover-qr\').remove()">' +
      '<div class="fb-popover-copy"><b>进群许愿</b><span>你提需求，我按呼声开发。</span></div>' +
    '</div>' +
    '<button type="button" class="fb-popover-feedback" id="fb-open-modal">写反馈</button>';

  const fab = document.createElement('button');
  fab.id = 'fb-fab';
  fab.className = 'fb-fab';
  fab.type = 'button';
  fab.title = '反馈或进群许愿';
  fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML = '💬';
  fab.onclick = toggleFeedbackDock;

  dock.appendChild(popover);
  dock.appendChild(fab);
  document.body.appendChild(dock);

  document.getElementById('fb-open-modal').onclick = () => {
    closeFeedbackDock();
    openFeedbackModal();
  };
  document.addEventListener('click', (e) => {
    const currentDock = document.getElementById('fb-dock');
    if (!currentDock || currentDock.contains(e.target)) return;
    closeFeedbackDock();
  });

  const overlay = document.createElement('div');
  overlay.id = 'fb-modal';
  overlay.className = 'fb-modal';
  overlay.innerHTML =
    '<div class="fb-card" role="dialog" aria-modal="true" aria-labelledby="fb-title">' +
      '<div class="fb-title" id="fb-title">说点什么吧 ✍️</div>' +
      '<div class="fb-sub">遇到问题、有功能想法、或哪里卡了/不顺手——直说。我会读每一条。</div>' +
      '<textarea class="fb-text" id="fb-text" rows="5" placeholder="例如：第 4 步幕僚发言读起来太长，能不能加个折叠按钮？"></textarea>' +
      '<label class="fb-context-row"><input type="checkbox" id="fb-context" checked> 自动附上我现在所在的步骤和 session（帮助你定位问题）</label>' +
      '<div class="fb-error" id="fb-error"></div>' +
      '<div class="fb-actions">' +
        '<button type="button" class="fb-cancel" id="fb-cancel">取消</button>' +
        '<button type="button" class="fb-submit" id="fb-submit">提交</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeFeedbackModal();
  });
  document.getElementById('fb-cancel').onclick = closeFeedbackModal;
  document.getElementById('fb-submit').onclick = submitFeedback;
}

function toggleFeedbackDock() {
  const dock = document.getElementById('fb-dock');
  const popover = document.getElementById('fb-popover');
  const fab = document.getElementById('fb-fab');
  if (!dock || !popover || !fab) return;
  const next = !dock.classList.contains('on');
  dock.classList.toggle('on', next);
  popover.setAttribute('aria-hidden', next ? 'false' : 'true');
  fab.setAttribute('aria-expanded', next ? 'true' : 'false');
}

function closeFeedbackDock() {
  const dock = document.getElementById('fb-dock');
  const popover = document.getElementById('fb-popover');
  const fab = document.getElementById('fb-fab');
  if (dock) dock.classList.remove('on');
  if (popover) popover.setAttribute('aria-hidden', 'true');
  if (fab) fab.setAttribute('aria-expanded', 'false');
}

function openFeedbackModal() {
  const overlay = document.getElementById('fb-modal');
  const text = document.getElementById('fb-text');
  const err = document.getElementById('fb-error');
  if (!overlay) return;
  if (err) err.textContent = '';
  if (text) text.value = '';
  overlay.classList.add('on');
  setTimeout(() => { if (text) text.focus(); }, 100);
}

function closeFeedbackModal() {
  const overlay = document.getElementById('fb-modal');
  if (overlay) overlay.classList.remove('on');
}

async function submitFeedback() {
  const text = document.getElementById('fb-text');
  const includeCtx = document.getElementById('fb-context');
  const err = document.getElementById('fb-error');
  const btn = document.getElementById('fb-submit');
  if (!text) return;
  const body = (text.value || '').trim();
  if (!body) {
    if (err) err.textContent = '写点内容再提交吧';
    return;
  }
  const payload = { body };
  if (includeCtx && includeCtx.checked) {
    payload.context = {
      step: typeof currentStep === 'number' ? currentStep : null,
      session_id: SID || null,
      project_id: PID || null,
      url: location.pathname + location.search,
      ts: new Date().toISOString(),
    };
  }
  if (btn) { btn.disabled = true; btn.textContent = '提交中…'; }
  try {
    const token = localStorage.getItem('counsel:token');
    const r = await fetch('/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? 'Bearer ' + token : '',
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.error || ('HTTP ' + r.status));
    }
    if (window.CounselAnalytics) window.CounselAnalytics.track('feedback_submitted', { len: body.length });
    closeFeedbackModal();
    showToast('反馈已收到，谢谢 ✓', 'success');
  } catch (e) {
    if (err) err.textContent = '提交失败：' + (e.message || e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '提交'; }
  }
}

// ─── Phase H · Session-level telemetry (Michael 2026-04-25) ─────────────────
// Fire `session_init` once at boot with device/browser/screen so admin can
// segment users by surface. On unload, fire `step_dropped` if currentStep < 8
// (helps build the funnel: who fell off and where).
function initSessionTelemetry() {
  if (!window.CounselAnalytics) return;
  const ua = navigator.userAgent || '';
  const isWechat = /MicroMessenger/i.test(ua);
  const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(ua);
  const isTablet = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua);
  const browser = isWechat ? 'wechat'
    : /Edg\//.test(ua) ? 'edge'
    : /Chrome\//.test(ua) ? 'chrome'
    : /Firefox\//.test(ua) ? 'firefox'
    : /Safari\//.test(ua) ? 'safari'
    : 'other';
  const os = /iPhone|iPad|iPod/.test(ua) ? 'ios'
    : /Android/.test(ua) ? 'android'
    : /Mac OS X/.test(ua) ? 'macos'
    : /Windows/.test(ua) ? 'windows'
    : /Linux/.test(ua) ? 'linux'
    : 'other';
  window.CounselAnalytics.track('session_init', {
    browser,
    os,
    is_wechat: isWechat,
    device_class: isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop',
    viewport: window.innerWidth + 'x' + window.innerHeight,
    screen: (screen.width || 0) + 'x' + (screen.height || 0),
    pixel_ratio: window.devicePixelRatio || 1,
    lang: navigator.language || '',
    referrer: document.referrer ? new URL(document.referrer).host : '',
    ui_mode: typeof UI_MODE === 'string' ? UI_MODE : 'unknown',
    ts: new Date().toISOString(),
  });
  window.addEventListener('beforeunload', () => {
    if (typeof currentStep === 'number' && currentStep > 0 && currentStep < 8) {
      window.CounselAnalytics.track('step_dropped', {
        step: currentStep,
        session_id: SID || null,
        project_id: PID || null,
      });
    }
  });
}

async function resumeSession() {
  try {
    // Phase D · resume reads from IndexedDB
    if (!window.CounselDB) {
      showStep(2);
      return;
    }
    const session = await window.CounselDB.loadSession(SID);
    const completedStep = (session && session.current_step) || 0;

    await loadCompletedSteps(completedStep);

    // F6b (2026-04-26) — interruption recovery. If a step was marked
    // in_progress but never reached step_done (browser closed mid-stream),
    // surface a modal so the case-owner can choose: re-run that step, or
    // accept whatever partial content landed in IDB.
    if (session && session.in_progress && session.in_progress.step) {
      const stuckStep = session.in_progress.step;
      // Only prompt if the in-progress step hasn't progressed past since
      if (stuckStep > completedStep) {
        _showInterruptionModal(stuckStep);
        return;
      }
    }

    if (completedStep >= 8) {
      showStep(8);
    } else {
      showStep(completedStep + 1);
      // Resume affordance: surface that we just landed mid-flow so the
      // case-owner doesn't have to wonder why they're not at Step 1.
      if (completedStep > 0) {
        _showResumeToast(`已为你恢复到第 ${completedStep + 1} 步，继续走下去`);
      }
    }
  } catch {
    showStep(2);
  }
}

// F6b · Interruption recovery modal. Shown when a session was loaded with
// `in_progress.step` set but no matching step_done landed before the page
// was closed. Two choices: replay that step from scratch, or just navigate
// into the step area and let the user see whatever partial content exists.
function _showInterruptionModal(stuckStep) {
  let modal = document.getElementById('interruption-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'interruption-modal';
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML =
      '<div class="modal" style="max-width:420px">' +
      '<h3>上次中断在第 ' + stuckStep + ' 步</h3>' +
      '<p style="font-size:13.5px;line-height:1.7;color:rgba(255,255,255,.7);margin:10px 0 16px">看起来你上一次浏览器在第 ' + stuckStep + ' 步流式过程中关闭了。这一步的内容可能不完整。</p>' +
      '<div style="display:flex;gap:10px;flex-direction:column">' +
      '<button class="btn btn-w btn-full" id="im-replay">↻ 重跑第 ' + stuckStep + ' 步</button>' +
      '<button class="settings-btn" id="im-skip" style="padding:9px 14px;font-size:12.5px">读取已生成内容（可能不完整）</button>' +
      '</div></div>';
    document.body.appendChild(modal);
  }
  const onReplay = async () => {
    if (window.CounselDB) {
      try { await window.CounselDB.clearStepInProgress(SID); } catch {}
    }
    if (typeof replayFromStep === 'function') {
      // replayFromStep(N) re-runs Step N+1 onwards from the result of N.
      // To re-run stuckStep itself, we anchor at stuckStep-1.
      await replayFromStep(Math.max(1, stuckStep - 1));
    }
    modal.remove();
  };
  const onSkip = async () => {
    if (window.CounselDB) {
      try { await window.CounselDB.clearStepInProgress(SID); } catch {}
    }
    showStep(stuckStep);
    modal.remove();
  };
  const replayBtn = modal.querySelector('#im-replay');
  const skipBtn = modal.querySelector('#im-skip');
  if (replayBtn) replayBtn.onclick = onReplay;
  if (skipBtn) skipBtn.onclick = onSkip;
}

// Re-fire the current step's run handler. Useful when a step appeared to
// finish but the canonical output file is missing/empty (e.g., LLM returned
// zero-length, network blip). Reachable via F12 console: `retryCurrentStep()`.
window.retryCurrentStep = function() {
  const n = currentStep;
  if (!n || n < 2 || n > 8) {
    console.warn('retryCurrentStep: no retryable step active (step=' + n + ')');
    return;
  }
  stepStarted[n] = false;
  runStep(n);
};

// F6a (2026-04-26) — replay from arbitrary completed step. Allows user opening
// a past session (e.g., completed up to Step 5) to click "↻ 从这里继续" on
// Step 3 and have Steps 4..8 re-run with the existing prior_state. Stateless
// server doesn't need any change — buildPriorState assembles file blobs from
// IDB on each step call. Trick: clear IDB for downstream files first so the
// re-run produces fresh content rather than echoing cached output.
//
// Files to clear by step boundary (step N produces these → cleared when replay
// from step M < N):
const _STEP_OUTPUT_FILES = {
  2: ['01-defined.md', '01-define-state.json'],
  3: ['02-facts-answers.md', '02-facts-questions.json'],
  4: ['__opinions_dir__'],  // sentinel — special-cased to wipe 03-opinions/* below
  5: ['04-dimensions.md', '04-selected-dimensions.json'],
  6: ['05-debate.md', 'premortem.md'],
  7: ['06-summary.md'],
  8: ['07-harvest.md', '07-bayesian.md', '07-persona-evals.md', '07-client-notes.md']
};

async function clearDownstreamFiles(fromStep) {
  if (!window.CounselDB || !SID) return;
  const session = await window.CounselDB.loadSession(SID);
  if (!session || !session.files) return;
  const files = session.files || {};
  const toRemove = [];
  for (let n = fromStep + 1; n <= 8; n++) {
    const list = _STEP_OUTPUT_FILES[n] || [];
    for (const fname of list) {
      if (fname === '__opinions_dir__') {
        // Wipe all 03-opinions/*.md so Step 4 re-runs cleanly
        for (const k of Object.keys(files)) {
          if (k.startsWith('03-opinions/')) toRemove.push(k);
        }
      } else if (Object.prototype.hasOwnProperty.call(files, fname)) {
        toRemove.push(fname);
      }
    }
  }
  if (!toRemove.length) {
    // Even if no files to clear, still re-anchor current_step downward
    if (typeof setRtPivotText === 'function' && fromStep < 2) setRtPivotText('');
    return;
  }
  const updated = { ...files };
  for (const k of toRemove) delete updated[k];
  await window.CounselDB.saveSession({
    ...session,
    files: updated,
    current_step: fromStep,
  });
  // 2026-04-26 · clear breathing-circle pivot if we wiped Step 2 output
  if (typeof setRtPivotText === 'function' && fromStep < 2) setRtPivotText('');
}

window.replayFromStep = async function(stepIdx) {
  if (!stepIdx || stepIdx < 1 || stepIdx > 7) return;
  const next = stepIdx + 1;
  const ok = confirm('从第 ' + stepIdx + ' 步的结果继续，会覆盖第 ' + next + ' 步及之后的现有内容。继续？');
  if (!ok) return;
  try {
    // Clear downstream IDB caches so re-run produces fresh content
    await clearDownstreamFiles(stepIdx);
    // Reset stepStarted flags for downstream steps
    for (let n = next; n <= 8; n++) stepStarted[n] = false;
    // Clear DOM contents of downstream step panels so old visuals don't bleed
    for (let n = next; n <= 8; n++) {
      const panel = document.getElementById('s' + n);
      if (!panel) continue;
      // Reset everything except the step header (.sh)
      [...panel.children].forEach(child => {
        if (!child.classList || !child.classList.contains('sh')) child.remove();
      });
      // Re-inject the empty containers each runStep expects
      if (n === 2) panel.insertAdjacentHTML('beforeend', '<div id="s2-chat"></div><div id="s2-input-area" style="display:flex;gap:6px;margin-top:8px"><input class="ginput" id="s2-input" placeholder="回复主持人（或直接确认）…" style="flex:1" onkeydown="if(event.key===\'Enter\')sendS2()"><button class="btn btn-w" onclick="sendS2()">发送</button></div><div id="s2-lock-area" style="display:none;margin-top:8px"></div>');
      else if (n === 3) panel.insertAdjacentHTML('beforeend', '<div id="s3-content"></div>');
      else if (n === 4) panel.insertAdjacentHTML('beforeend', '<div id="s4-cards"></div>');
      else if (n === 5) panel.insertAdjacentHTML('beforeend', '<div id="s5-content"></div><div id="s5-cards"></div><button class="btn btn-w btn-full" id="s5-btn" style="display:none" onclick="submitDimensions()">进入辩论 →</button>');
      else if (n === 6) panel.insertAdjacentHTML('beforeend', '<div id="s6-content"></div>');
      else if (n === 7) panel.insertAdjacentHTML('beforeend', '<div id="s7-content"></div>');
      else if (n === 8) panel.insertAdjacentHTML('beforeend', '<div id="s8-content"></div>');
      // Reset progress dot to undone
      const dot = document.querySelector('.pdot[data-step="' + n + '"]');
      if (dot) dot.classList.remove('done');
    }
    _showResumeToast('从第 ' + stepIdx + ' 步结果继续 → 重跑第 ' + next + ' 步…');
    showStep(next);
  } catch (e) {
    console.error('replayFromStep failed', e);
    alert('重跑失败：' + (e && e.message || String(e)));
  }
};

function appendReplayButton(stepIdx) {
  if (stepIdx < 2 || stepIdx > 7) return;  // Step 1 = entry; Step 8 = terminal
  const wrapper = document.getElementById('s' + stepIdx);
  if (!wrapper || wrapper.querySelector('.replay-btn-wrap')) return;
  const div = document.createElement('div');
  div.className = 'replay-btn-wrap';
  div.innerHTML = '<button type="button" class="replay-btn" onclick="replayFromStep(' + stepIdx + ')" title="清除第 ' + (stepIdx+1) + ' 步及之后的内容，从这里重新跑">↻ 从这里继续 · 重跑后续</button>';
  wrapper.appendChild(div);
}

function _showResumeToast(text) {
  let t = document.getElementById('resume-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'resume-toast';
    t.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:9000;background:rgba(176,176,255,.95);color:#0a0a0a;padding:9px 16px;border-radius:16px;font-size:12.5px;font-weight:600;box-shadow:0 6px 20px rgba(0,0,0,.4);font-family:inherit;letter-spacing:.3px';
    document.body.appendChild(t);
  }
  t.textContent = text;
  setTimeout(() => { if (t && t.parentNode) t.parentNode.removeChild(t); }, 5000);
}

async function loadCompletedSteps(upToStep) {
  // 2026-04-26 v2 · Only flag a step "started" when its output file actually
  // loaded. Prior version set stepStarted[N]=true unconditionally, which
  // silently blocked runSN from re-firing when the output was missing
  // (e.g. an interrupted Step 6 with no 05-debate.md). Now stepStarted[N]
  // stays false on missing file, so showStep(N) → runSN() can fresh-fire.
  // Step 1: Restore the original raw input so user can see their starting question
  if (upToStep >= 1) {
    const raw = await loadFile("00-raw-input.md");
    if (raw) {
      stepStarted[1] = true;
      const ta = document.getElementById("s1-input");
      if (ta) ta.value = raw;
      const btn = document.getElementById("s1-btn");
      if (btn) {
        btn.textContent = "已提交 · 下方进入会话";
        btn.disabled = true;
        btn.style.cursor = "default";
      }
      // Hint: how to start a new topic
      const s1 = document.getElementById("s1");
      if (s1 && !s1.querySelector(".s1-resumed-hint")) {
        const hint = document.createElement("div");
        hint.className = "s1-resumed-hint";
        hint.style.cssText = "font-size:12px;color:rgba(255,255,255,.5);margin-top:10px;line-height:1.7";
        hint.innerHTML = '这是你当时的原始问题。想开一个新话题？点顶部的 <strong style="color:#fff">新建</strong> 按钮。';
        s1.appendChild(hint);
      }
    }
  }

  // Step 2: Load defined topic
  if (upToStep >= 2) {
    const defined = await loadFile("01-defined.md");
    if (defined) {
      stepStarted[2] = true;
      const chat = document.getElementById("s2-chat");
      if (chat) chat.innerHTML = `<div class="cmsg"><div class="host-av">🎙</div><div class="cbub f"><div class="md-body">${md(defined)}</div></div></div>`;
      const lockArea = document.getElementById("s2-lock-area");
      if (lockArea) { lockArea.style.display = "block"; lockArea.innerHTML = `<button class="btn btn-w btn-full" onclick="showStep(3)">已锁定 → 查看事实</button>`; }
      appendReplayButton(2);
      // 2026-04-26 · breathing-circle pivot text on resume
      setRtPivotText(parseTopicTagline(defined));
    }
  }

  // Step 3: Load facts
  if (upToStep >= 3) {
    const qa = await loadFile("02-facts-answers.md");
    const content = document.getElementById("s3-content");
    if (qa && content) {
      stepStarted[3] = true;
      content.innerHTML = '<div class="md-body">' + md(qa) + '</div>';
      content.innerHTML += `<button class="btn btn-w btn-full" onclick="showStep(4)">查看幕僚发言 →</button>`;
      appendReplayButton(3);
    }
  }

  // Step 4: Load opinions — render with markdown (md, not esc) so review
  // shows the rich rendering, not raw markdown text.
  if (upToStep >= 4) {
    const container = document.getElementById("s4-cards");
    if (container) {
      let html = "";
      for (const [name, data] of Object.entries(PERSONAS)) {
        const filename = name.replace(/ /g, "-") + ".md";
        const opinion = await loadFile(`03-opinions/${filename}`);
        if (opinion) {
          html += `<div class="ocard" data-p="${data.slug}">`
            + `<div class="ocard-h">${pavatar(name)}<div class="ocard-n">${esc(name)}</div></div>`
            + `<div class="ocard-t md-body" data-markable data-step="4" data-persona="${esc(name)}">${md(opinion)}</div>`
            + `</div>`;
        }
      }
      if (html) {
        stepStarted[4] = true;
        container.innerHTML = html + `<button class="btn btn-w btn-full" onclick="showStep(5)">查看维度 →</button>`;
        appendReplayButton(4);
      }
    }
  }

  // Step 5: Load dimensions
  if (upToStep >= 5) {
    const dimText = await loadFile("04-dimensions.md");
    if (dimText) {
      stepStarted[5] = true;
      dimensions = parseDimensions(dimText);
      const content = document.getElementById("s5-content");
      const cardsEl = document.getElementById("s5-cards");
      const btn = document.getElementById("s5-btn");
      if (content) content.innerHTML = '<div class="md-body">' + md(dimText) + '</div>';
      if (cardsEl) cardsEl.innerHTML = "";
      if (btn) { btn.style.display = "block"; btn.textContent = "查看辩论 →"; }
      appendReplayButton(5);
    }
  }

  // Step 6: Load debate. Skip stepStarted=true if 05-debate.md is missing
  // OR is the "辩论已跳过" marker — that way runS6 can fresh-fire when the
  // case-owner navigates to Step 6 to retry, and the modal F6b interruption
  // recovery flow works cleanly.
  if (upToStep >= 6) {
    const debate = await loadFile("05-debate.md");
    const content = document.getElementById("s6-content");
    const debateOk = debate && debate.trim() && !debate.includes('辩论已跳过');
    if (debateOk && content) {
      stepStarted[6] = true;
      content.innerHTML = renderDebateFromFile(debate);
      content.innerHTML += `<button class="btn btn-w btn-full" onclick="showStep(7)">查看汇总 →</button>`;
      appendReplayButton(6);
    } else if (content) {
      console.info('[loadCompletedSteps] 05-debate.md missing or skipped — leaving Step 6 unstarted so runS6 can fire on click');
    }
  }

  // Step 7: Load summary + pre-mortem (Phase 4.4)
  if (upToStep >= 7) {
    const summary = await loadFile("06-summary.md");
    const premortem = await loadFile("premortem.md");
    const content = document.getElementById("s7-content");
    if ((summary || premortem) && content) {
      stepStarted[7] = true;
      let html = "";
      if (premortem) {
        html += `<div class="scard premortem-card" id="s7-premortem-card">`
          + `<div class="st">⚠️ 事前演练 · 一年后失败的复盘</div>`
          + `<div class="sb md-body" id="s7-premortem-body" data-markable data-step="7" data-persona="premortem">${md(premortem)}</div>`
          + `</div>`;
      }
      if (summary) {
        html += `<div class="scard summary-card" id="s7-summary-card">`
          + `<div class="st">📋 秘书汇总</div>`
          + `<div class="sb md-body" id="s7-summary-body" data-markable data-step="7" data-persona="secretary">${mdWithDetailedAnalysis(summary)}</div>`
          + `</div>`;
      }
      content.innerHTML = html;
      const wrapper = document.getElementById("s7");
      if (wrapper && !wrapper.querySelector(".btn-full")) {
        const btnEl = document.createElement("button");
        btnEl.className = "btn btn-w btn-full";
        btnEl.textContent = "查看摘果子 →";
        btnEl.onclick = () => showStep(8);
        wrapper.appendChild(btnEl);
      }
      appendReplayButton(7);
    }
  }

  // Step 8: Load harvest with reflection panel at top
  if (upToStep >= 8) {
    const content = document.getElementById("s8-content");
    if (content) {
      stepStarted[8] = true;
      const [harvestFile, bayesianFile, evalsFile, clientNotes] = await Promise.all([
        loadFile("07-harvest.md"),
        loadFile("07-bayesian.md"),
        loadFile("07-persona-evals.md"),
        loadFile("07-client-notes.md"),
      ]);
      const alreadyDone = !!(harvestFile && bayesianFile);
      content.innerHTML = renderReflectionPanel(PID, SID, clientNotes, alreadyDone)
        + '<div id="s8-results"></div>';
      const resultsEl = document.getElementById("s8-results");
      if (alreadyDone) {
        renderS8Results(resultsEl, evalsFile, harvestFile, bayesianFile);
      } else {
        resultsEl.innerHTML = `<div class="scard" style="background:rgba(176,176,255,.05);border-color:rgba(176,176,255,.3)"><div class="sb" style="color:rgba(255,255,255,.78);line-height:1.8">👆 写下你的反思后点击上方按钮，幕僚会基于你的自述进行评估，贝叶斯迭代也会综合你和幕僚两方面的信号。</div></div>`;
      }
    }
  }

  // Update progress dots for all completed steps
  for (let i = 1; i <= upToStep; i++) {
    const dot = document.querySelector(`.pdot[data-step="${i}"]`);
    if (dot) dot.classList.add("done");
  }

  // Phase 2.13 — after all step content is rendered, replay saved highlights
  try { await applyAllSavedMarks(); } catch (e) { console.error(e); }
}

// ─── F1 (2026-04-26) · Mode C Freestyle Orchestrator ───────────────────────
//
// Server-orchestrated. Single POST to /freestyle returns one SSE stream that
// chains 4 stages: consensus extraction → parallel persona actions → pre-mortem
// → summary. Frontend just routes the existing event types into the right DOM
// targets and lands at Step 7 (and then Step 8) when done.
window.runFreestyleMode = async function() {
  if (window._fastModeRunning || window._freestyleRunning) return;
  window._freestyleRunning = true;

  let banner = document.getElementById('fast-mode-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'fast-mode-banner';
    banner.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:9000;background:#fff;color:#0a0a0a;padding:10px 18px;border-radius:18px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.45);font-family:inherit;letter-spacing:.3px;display:flex;align-items:center;gap:8px';
    document.body.appendChild(banner);
  }
  banner.innerHTML = '🎯 Freestyle · 提取共识中（1/4）';

  // Skip Step 5/6 entirely — jump to Step 7 panel and let the SSE stream
  // populate it. We render an empty 7+8 dual-pane shell first.
  document.body.classList.add('fm-dual');
  showStep(7);
  const s7c = document.getElementById('s7-content');
  const s7 = document.getElementById('s7');
  if (s7c) {
    s7c.innerHTML =
      '<div class="scard freestyle-card" id="s7-freestyle-consensus-card" style="background:rgba(255,140,66,.06);border:1px solid rgba(255,140,66,.32);margin-bottom:12px">' +
      '<div class="st">🎯 共识与张力</div>' +
      '<div class="sb md-body cur" id="s7-freestyle-consensus-body"></div>' +
      '</div>' +
      '<div class="scard" id="s7-freestyle-actions-card" style="margin-bottom:12px;display:none">' +
      '<div class="st">⚡ 幕僚的行动建议</div>' +
      '<div class="sb" id="s7-freestyle-actions-grid" style="display:flex;flex-direction:column;gap:8px"></div>' +
      '</div>' +
      '<div class="scard premortem-card" id="s7-premortem-card" style="display:none">' +
      '<div class="st">⚠️ 事前演练 · 一年后失败的复盘</div>' +
      '<div class="sb md-body" id="s7-premortem-body"></div>' +
      '</div>' +
      '<div class="scard summary-card" id="s7-summary-card" style="display:none;margin-top:12px">' +
      '<div class="st">📋 秘书汇总</div>' +
      '<div class="sb md-body" id="s7-summary-body"></div>' +
      '</div>';
  }

  // Mode C also skips the user's reflection — pre-stub Step 8 with empty
  // client-notes so harvest doesn't error when we navigate after step_done.
  if (window.CounselDB && PID && SID) {
    try {
      const session = (await window.CounselDB.loadSession(SID)) || { id: SID, project_id: PID, files: {} };
      session.files = session.files || {};
      session.files['07-client-notes.md'] = '## 我学到了什么 / 意识到了什么\n\n_(Mode C 跳过)_\n\n## 我将做哪些不同\n\n_(Mode C 跳过)_\n\n## 我的下一步\n\n_(Mode C 跳过)_\n';
      await window.CounselDB.saveSession(session);
    } catch (e) { console.warn('[freestyle] save empty client_notes failed', e); }
  }

  let consensusText = '';
  let summaryText = '';
  let premortemText = '';
  let stage = 'consensus'; // tracks where in the 4-stage pipeline we are

  // 2026-04-26 v2 · 30s no-progress watchdog. If a stage receives no chunks
  // for 30s, surface a warning + retry button so the case-owner doesn't
  // stare at "1/4" forever. resetWatchdog() is called on every chunk type.
  let lastChunkAt = Date.now();
  let watchdogStuckShown = false;
  const watchdogTimer = setInterval(() => {
    if (Date.now() - lastChunkAt > 30000 && !watchdogStuckShown && window._freestyleRunning) {
      watchdogStuckShown = true;
      banner.style.background = '#ff8c42';
      banner.style.color = '#fff';
      banner.innerHTML = '⚠️ 卡住了？(stage=' + stage + ' · 30s 无响应) · <button onclick="window._freestyleRunning=false;document.getElementById(\'fast-mode-banner\').remove();" style="margin-left:8px;background:#fff;color:#0a0a0a;border:none;padding:3px 9px;border-radius:10px;cursor:pointer;font-size:11px">关闭</button>';
    }
  }, 5000);
  const resetWatchdog = () => {
    lastChunkAt = Date.now();
    if (watchdogStuckShown) {
      watchdogStuckShown = false;
      banner.style.background = '#fff';
      banner.style.color = '#0a0a0a';
    }
  };

  try {
    const url = API + '/api/projects/' + encodeURIComponent(PID) + '/sessions/' + encodeURIComponent(SID) + '/freestyle';
    await streamSSE(url, {}, {
      _onIdle() { /* no-op */ },
      step_start() {},
      // 2026-04-26 v2 · surface backend errors. Without this handler the
      // streamSSE dispatch silently dropped error events, leaving the banner
      // stuck on "1/4" while the case-owner thought the system hung.
      error(e) {
        const msg = (e && e.message) || '未知错误';
        clearInterval(watchdogTimer);
        banner.style.background = '#ff6b6b';
        banner.style.color = '#fff';
        banner.innerHTML = '⚠️ Freestyle 失败：' + esc(msg) + ' · <button onclick="window._freestyleRunning=false;document.getElementById(\'fast-mode-banner\').remove();" style="margin-left:8px;background:#fff;color:#0a0a0a;border:none;padding:3px 9px;border-radius:10px;cursor:pointer;font-size:11px">关闭</button>';
        console.error('[freestyle] backend error', e);
        window._freestyleRunning = false;
      },
      facilitator_chunk(e) {
        resetWatchdog();
        const chunk = (e && e.chunk) || '';
        if (!chunk) return;
        if (stage === 'consensus') {
          consensusText += chunk;
          const body = document.getElementById('s7-freestyle-consensus-body');
          if (body) body.innerHTML = md(consensusText);
        } else if (stage === 'summary') {
          summaryText += chunk;
          const body = document.getElementById('s7-summary-body');
          if (body) body.innerHTML = mdWithDetailedAnalysis(summaryText);
        }
      },
      facilitator_done() {
        if (stage === 'consensus') {
          const body = document.getElementById('s7-freestyle-consensus-body');
          if (body) body.classList.remove('cur');
          // Reveal the actions panel; next chunks will be persona_chunk events
          stage = 'actions';
          const card = document.getElementById('s7-freestyle-actions-card');
          if (card) card.style.display = '';
          banner.innerHTML = '🎯 Freestyle · 全员行动建议（2/4）';
        } else if (stage === 'summary') {
          const body = document.getElementById('s7-summary-body');
          if (body) body.classList.remove('cur');
        }
      },
      persona_start(e) {
        // Switch into actions mode if not already (some streams go here without
        // facilitator_done landing first).
        if (stage === 'consensus') {
          stage = 'actions';
          const card = document.getElementById('s7-freestyle-actions-card');
          if (card) card.style.display = '';
          banner.innerHTML = '🎯 Freestyle · 全员行动建议（2/4）';
        }
        const grid = document.getElementById('s7-freestyle-actions-grid');
        if (!grid) return;
        const name = (e && e.name) || '';
        const slug = (pdata(name) || {}).slug || '';
        const id = 's7-fs-action-' + slug.replace(/[^a-z0-9-]/g, '');
        if (document.getElementById(id)) return;
        const row = document.createElement('div');
        row.id = id;
        row.className = 'scard fs-action-row';
        row.dataset.p = slug;
        row.innerHTML =
          '<div class="ocard-h">' + pavatar(name, 'speaking') + '<div class="ocard-n">' + esc(name) + '</div></div>' +
          '<div class="ocard-t cur" id="' + id + '-t"></div>';
        grid.appendChild(row);
      },
      persona_chunk(e) {
        resetWatchdog();
        const name = (e && e.name) || '';
        const slug = (pdata(name) || {}).slug || '';
        const id = 's7-fs-action-' + slug.replace(/[^a-z0-9-]/g, '');
        const t = document.getElementById(id + '-t');
        if (t) t.textContent += (e && e.chunk) || '';
      },
      persona_done(e) {
        resetWatchdog();
        const name = (e && e.name) || '';
        const slug = (pdata(name) || {}).slug || '';
        const id = 's7-fs-action-' + slug.replace(/[^a-z0-9-]/g, '');
        const t = document.getElementById(id + '-t');
        if (t) {
          t.classList.remove('cur');
          t.innerHTML = md(t.textContent || '');
        }
      },
      premortem_start() {
        resetWatchdog();
        stage = 'premortem';
        banner.innerHTML = '🎯 Freestyle · 事前演练（3/4）';
        const card = document.getElementById('s7-premortem-card');
        if (card) card.style.display = '';
      },
      premortem_chunk(e) {
        resetWatchdog();
        premortemText += (e && e.chunk) || '';
        const body = document.getElementById('s7-premortem-body');
        if (body) body.innerHTML = md(premortemText);
      },
      premortem_done() {
        // After premortem, summary follows
        stage = 'summary';
        banner.innerHTML = '🎯 Freestyle · 秘书汇总（4/4）';
        const card = document.getElementById('s7-summary-card');
        if (card) card.style.display = '';
        const body = document.getElementById('s7-summary-body');
        if (body) body.classList.add('cur');
      },
      step_done() {
        clearInterval(watchdogTimer);
        // Navigate to Step 8 after a brief beat so case-owner sees the summary
        setTimeout(() => {
          banner.innerHTML = '✓ 完成 · 进入摘果子';
          showStep(8);
          // Trigger the existing harvest flow — runS8 reads 06-summary.md
          if (typeof runS8 === 'function') runS8();
          setTimeout(() => { banner.remove(); }, 2500);
        }, 800);
      },
    });
  } catch (e) {
    clearInterval(watchdogTimer);
    if (banner) banner.innerHTML = '⚠️ Freestyle 失败：' + (e && e.message || String(e));
    console.error('[freestyle] failed', e);
  } finally {
    clearInterval(watchdogTimer);
    window._freestyleRunning = false;
  }
};

// ─── T2.2 (2026-04-25) · Fast Mode Orchestrator ─────────────────────────────
//
// After Step 4 finishes, the case-owner can click 🚀 一键直奔结论. This chains
// Steps 5 → 6 → 7 → 8 automatically, using the bullet-first prompts shipped
// in T1.3 so the final 摘果子 / 汇总 reads as a 结论卡 (not an essay).
//
// Mechanism: each Step's `step_done` SSE event already dispatches the
// `counsel:step-done` window event (wired in streamSSE dispatch). The
// orchestrator awaits that event per step before advancing.
//
// Step 8 reads client-reflection from `s8-refl-*` textareas. Fast mode skips
// the reflection ask (writes empty values), then triggers harvest directly.
// Case-owner can scroll down through the full debate after the 结论卡 lands.

function _waitForStepDone(targetStep, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('counsel:step-done', handler);
      reject(new Error(`Step ${targetStep} 超时（${Math.round((timeoutMs || 0) / 1000)}s）`));
    }, timeoutMs || 240000);
    const handler = (ev) => {
      if (!ev.detail || ev.detail.step !== targetStep) return;
      clearTimeout(timer);
      window.removeEventListener('counsel:step-done', handler);
      resolve(ev.detail);
    };
    window.addEventListener('counsel:step-done', handler);
  });
}

// Poll IDB for `name` to land non-empty. Used by fast-mode to gate Step 8 on
// Step 7's `06-summary.md` arriving via the streaming `step_files` events, so
// Step 8's tempdir-mode prior_state snapshot includes the freshly-written
// summary instead of falling back to 05-debate.md.
async function _waitForFileInIDB(name, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 90000);
  while (Date.now() < deadline) {
    try {
      const t = await loadFile(name);
      if (t && t.trim()) return t;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`等待 ${name} 超时`);
}

function _renderFastModeBanner(stage) {
  let banner = document.getElementById('fast-mode-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'fast-mode-banner';
    banner.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:9000;background:#fff;color:#0a0a0a;padding:10px 18px;border-radius:18px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.45);font-family:inherit;letter-spacing:.3px;display:flex;align-items:center;gap:8px';
    document.body.appendChild(banner);
  }
  banner.innerHTML = stage;
}

function _clearFastModeBanner() {
  const banner = document.getElementById('fast-mode-banner');
  if (banner) banner.remove();
}

window.runFastMode = async function() {
  if (window._fastModeRunning || window._chainModeRunning) return;
  window._fastModeRunning = true;
  _renderFastModeBanner('🚀 快速模式 · 启动中…');
  try {
    // Stage 1: Step 5 拆维度
    _renderFastModeBanner('🚀 快速模式 · 拆维度中（1/3）');
    showStep(5);
    await _waitForStepDone(5, 120000);
    // step_done fires before runS5's post-stream code finishes rendering dim
    // cards (loadFile + parseDimensions + innerHTML append). Poll for cards.
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      if (document.querySelectorAll('#s5-cards .dcard').length > 0) break;
      await new Promise(r => setTimeout(r, 150));
    }
    // Auto-pick top min(2, dimCount) dim cards. Cap at 2 for fast mode (Michael
    // 2026-04-25), but if Step 5 only produced 1 dimension we run that single
    // one rather than asking the backend for non-existent index 1.
    const dimCards = document.querySelectorAll('#s5-cards .dcard');
    const pickN = Math.min(2, dimCards.length || 1);
    dimCards.forEach((el, i) => {
      if (i < pickN) el.classList.add('sel');
      else el.classList.remove('sel');
    });
    if (dimCards.length === 1) {
      _renderFastModeBanner('🚀 快速模式 · Step 5 只产出 1 维（继续辩论该维度）');
    } else if (dimCards.length === 0) {
      _renderFastModeBanner('⚠️ 快速模式 · Step 5 未产出维度，跳到汇总');
    }
    await new Promise(r => setTimeout(r, 200));

    // Stage 2: Skip Step 6 debate entirely (2026-04-26).
    //
    // Fast mode used to run Step 6 in full (~6 min on the 360s timeout),
    // making total fast-mode time 12-18 min — defeating the "fast" framing.
    // The skip is safe because run_summary (steps/mod.rs:1213-1224) already
    // has a fallback path: when 05-debate.md is the "辩论已跳过" marker
    // (or empty), summary uses Step 4 opinions as raw material instead of
    // a debate transcript. The Bayesian + harvest_todo prompts depend on
    // evals + summary, neither of which strictly requires debate text.
    //
    // We write the marker to IDB so the next /steps/7 call's prior_state
    // includes it (server reads it, takes the fallback branch).
    _renderFastModeBanner('🚀 快速模式 · 跳过辩论，直奔结论');
    if (window.CounselDB && PID && SID) {
      try {
        await window.CounselDB.saveStepFiles(PID, SID, {
          session_files: {
            '05-debate.md': '# 辩论已跳过\n\n*快速模式直奔结论。Step 7 直接基于 Step 4 各幕僚 opinion 做汇总，不展开多轮辩护。*\n',
          },
        });
        await window.CounselDB.bumpSessionStep(SID, 6);
      } catch (e) { console.warn('[fastMode] write debate-skip marker failed', e); }
    }
    // Mark Step 6 as "started" so any later showStep(6) won't re-trigger
    // runS6 — the skip marker is the canonical state.
    stepStarted[6] = true;
    await new Promise(r => setTimeout(r, 100));

    // Stage 3: Step 7 汇总 — pipeline Step 8 to start the moment 06-summary.md
    // lands in IDB so 摘果子 reads the real summary, not the fallback debate
    // transcript. Run_summary writes 06-summary.md at the end of its stream
    // (steps/mod.rs:1292), so Step 8 effectively fires right after Step 7
    // wraps; that's the trade-off for using the correct input.
    //
    // Visual: body.fm-dual makes both #s7 and #s8 visible simultaneously, so
    // the case-owner sees Step 7 streaming and then Step 8 streaming live below.
    _renderFastModeBanner('🚀 快速模式 · 秘书汇总（2/3）');

    // Pre-mount Step 8's placeholder so the moment we flip dual-pane on, the
    // 摘果子 panel is already populated with a status card instead of empty.
    showStep(8);
    const s8c = document.getElementById('s8-content');
    if (s8c) {
      s8c.innerHTML = '<div class="scard" style="background:rgba(176,176,255,.06);border:1px solid rgba(176,176,255,.32)"><div class="sb" style="color:rgba(255,255,255,.86)">🚀 <strong style="color:#fff">快速模式 · 跳过反思</strong> — 等秘书汇总落地后，幕僚直接基于该汇总给评价。</div></div><div id="s8-results"><div class="loading-text">等秘书汇总落地…</div></div>';
    }

    // Skip the reflection form: write empty client_notes to IDB so /steps/8
    // doesn't error on missing 07-client-notes.md.
    if (window.CounselDB && PID && SID) {
      try {
        const session = (await window.CounselDB.loadSession(SID)) || { id: SID, project_id: PID, files: {} };
        session.files = session.files || {};
        session.files['07-client-notes.md'] = '## 我学到了什么 / 意识到了什么\n\n_(快速模式跳过)_\n\n## 我将做哪些不同\n\n_(快速模式跳过)_\n\n## 我的下一步\n\n_(快速模式跳过)_\n';
        await window.CounselDB.saveSession(session);
      } catch (e) { console.warn('[fastMode] save empty client_notes failed', e); }
    }

    // Fire Step 7 first; its SSE writes 06-summary.md to IDB at completion.
    const step7Done = _waitForStepDone(7, 240000);
    showStep(7); // triggers runS7
    document.body.classList.add('fm-dual'); // dual-pane: keep #s8 visible too

    // Wait until 06-summary.md appears in IDB, then fire Step 8 — its
    // prior_state snapshot built inside streamSSE() will include the summary.
    let step8SsePromise = null;
    let step8Done = null;
    (async () => {
      try {
        await _waitForFileInIDB('06-summary.md', 240000);
      } catch (e) {
        console.warn('[fastMode] 06-summary.md never landed; firing Step 8 anyway (fallback to debate transcript)', e);
      }
      _renderFastModeBanner('🚀 快速模式 · 摘果子（3/3）');
      const r8 = document.getElementById('s8-results');
      if (r8) r8.innerHTML = '<div class="loading-text">幕僚评价 + 贝叶斯迭代生成中…</div>';
      step8Done = _waitForStepDone(8, 540000);
      // 2026-04-25 — Step 8 now streams (8a per-persona PersonaChunk + 8c
      // bayesian FacilitatorChunk). Use the shared streaming handlers so
      // case-owner watches advisor cards + bayesian fill in real time
      // instead of staring at a 30-90s spinner.
      const fastHandlers = buildStep8StreamHandlers(r8 || document.getElementById('s8-results'));
      fastHandlers._onIdle = () => {
        const l = document.querySelector('#s8-results .loading-text');
        if (l) l.textContent = '深度思考中…';
      };
      step8SsePromise = streamSSE(stepUrl(8), { force_refresh: true }, fastHandlers).catch(err => {
        console.error('[runFastMode] /steps/8 stream threw:', err);
        _renderFastModeBanner(`⚠️ 摘果子调用失败：${err.message || err}（请手动重试 Step 8）`);
      });
    })();

    // Wait for Step 7 to finish. Then wait for Step 8 to start (which only
    // happens after 06-summary.md lands), then for it to finish.
    await step7Done;
    // step8Done / step8SsePromise are populated inside the IIFE once Step 8
    // is fired. Poll briefly for them to exist (small race window).
    const t1 = Date.now();
    while (!step8Done && Date.now() - t1 < 5000) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (step8Done) await step8Done;
    if (step8SsePromise) await step8SsePromise;

    // Tear down dual-pane and switch focus to Step 8's full results view.
    document.body.classList.remove('fm-dual');
    showStep(8);

    // Re-render Step 8 results from IDB-saved files now that harvest finished.
    const [evalsFile, harvestFile, bayesianFile] = await Promise.all([
      loadFile('07-persona-evals.md'),
      loadFile('07-harvest.md'),
      loadFile('07-bayesian.md'),
    ]);
    const r8 = document.getElementById('s8-results');
    if (r8 && typeof renderS8Results === 'function') {
      renderS8Results(r8, evalsFile, harvestFile, bayesianFile);
    }

    _renderFastModeBanner('✅ 已直奔结论 · 顶部即结论卡，详细辩论在下方');
    setTimeout(_clearFastModeBanner, 8000);
  } catch (e) {
    _renderFastModeBanner(`⚠️ 快速模式中断：${e.message || e}（可手动继续）`);
    setTimeout(_clearFastModeBanner, 6000);
    console.error('[runFastMode]', e);
  } finally {
    window._fastModeRunning = false;
  }
};

// 2026-04-27 — Chain mode: third 节奏 option, sibling to runFastMode.
// Difference from fast: KEEPS Step 6 full debate. Difference from manual:
// no user clicks between steps. Total ~12-18 min vs fast's ~3 min.
window.runChainMode = async function() {
  if (window._fastModeRunning || window._chainModeRunning) return;
  window._chainModeRunning = true;
  _renderFastModeBanner('🐢 自动模式 · 启动（含完整辩论）');
  try {
    // Stage 1 · Step 5 拆维度
    _renderFastModeBanner('🐢 自动模式 · 拆维度（1/4）');
    showStep(5);
    await _waitForStepDone(5, 120000);
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      if (document.querySelectorAll('#s5-cards .dcard').length > 0) break;
      await new Promise(r => setTimeout(r, 150));
    }
    const dimCards = document.querySelectorAll('#s5-cards .dcard');
    const pickN = Math.min(2, dimCards.length || 1);
    dimCards.forEach((el, i) => i < pickN ? el.classList.add('sel') : el.classList.remove('sel'));
    if (dimCards.length === 0) {
      _renderFastModeBanner('⚠️ 自动模式 · Step 5 未产出维度，跳到汇总');
    }
    await new Promise(r => setTimeout(r, 200));

    // Stage 2 · Step 6 完整辩论 — the key difference from runFastMode.
    // runS6 is streaming so we just wait for step_done. Multi-dim ≤2 dims
    // typically takes ~3-6 min; allow 9 min headroom.
    _renderFastModeBanner('🐢 自动模式 · 圆桌辩论中（2/4，~3-6 min）');
    showStep(6);
    await _waitForStepDone(6, 540000);

    // Stage 3 · Step 7 汇总
    _renderFastModeBanner('🐢 自动模式 · 秘书汇总（3/4）');
    showStep(7);
    await _waitForStepDone(7, 240000);

    // Stage 4 · Step 8 摘果子 — chain mode skips reflection like fast does
    // (auto-pacing means no user form to fill; manual mode is where users
    // get the reflection panel).
    _renderFastModeBanner('🐢 自动模式 · 摘果子（4/4）');
    if (window.CounselDB && PID && SID) {
      try {
        const session = (await window.CounselDB.loadSession(SID)) || { id: SID, project_id: PID, files: {} };
        session.files = session.files || {};
        session.files['07-client-notes.md'] = '## 我学到了什么 / 意识到了什么\n\n_(自动模式跳过)_\n\n## 我将做哪些不同\n\n_(自动模式跳过)_\n\n## 我的下一步\n\n_(自动模式跳过)_\n';
        await window.CounselDB.saveSession(session);
      } catch (e) { console.warn('[chainMode] save empty client_notes failed', e); }
    }
    showStep(8);
    await _waitForStepDone(8, 540000);

    _renderFastModeBanner('✅ 已跑完（含辩论）· 顶部即结论卡');
    setTimeout(_clearFastModeBanner, 8000);
  } catch (e) {
    _renderFastModeBanner(`⚠️ 自动模式中断：${e.message || e}（可手动续跑）`);
    setTimeout(_clearFastModeBanner, 6000);
    console.error('[runChainMode]', e);
  } finally {
    window._chainModeRunning = false;
  }
};
