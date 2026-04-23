/**
 * Counsel AI — Web UI
 * Single-page app for the 8-step advisory session flow.
 * Design language: persona identity colors, avatar glow, advisor bar.
 */

const API = "";
let PID = null; // project ID
let SID = null; // session ID

// ─── Phase 6 · UI 圆桌 · feature flags ──────────────────────────────────────
// UI_MODE: 'linear' (default, existing UI) | 'roundtable' (Phase 6 shell)
// LAYOUT:  'A' (⬤ Ring flat) | 'B' (⬡ Table 42° isometric) — only meaningful in roundtable mode
const UI_MODE = (new URLSearchParams(location.search).get('ui')) || localStorage.getItem('counsel:ui-mode') || 'linear';
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
};

// Called once at page load to wire roundtable mode body class, toggle label,
// and mount the shell DOM + persona seats if in roundtable mode.
function initRoundtableUI() {
  const btn = document.getElementById('ui-mode-btn');
  const ltg = document.getElementById('layout-toggle-group');
  if (UI_MODE === 'roundtable') {
    document.body.classList.add('rt-mode');
    if (btn) btn.textContent = '📜 列表';
    if (ltg) ltg.style.display = 'flex';
    const rt = document.getElementById('roundtable');
    if (rt) rt.hidden = false;
    // Build seat nodes + apply current layout
    buildRingNodes();
    buildTableNodes();
    window.setLayout(LAYOUT);
    // Move step containers into #rt-stage (preserve their IDs + event listeners)
    mountRoundtableSteps();
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

// PERSONAS (object map) in display order around the table.
// Array order determines the angle: index 0 = 12 o'clock, increasing clockwise.
const PERSONA_ORDER = [
  { id:'mao',      name:'毛泽东',      emoji:'⚔️' },
  { id:'pg',       name:'Paul Graham', emoji:'🧪' },
  { id:'jobs',     name:'Steve Jobs',  emoji:'💼' },
  { id:'brucelee', name:'李小龙',      emoji:'🥋' },
  { id:'kk',       name:'Kevin Kelly', emoji:'🔮' },
  { id:'huineng',  name:'六祖慧能',    emoji:'🪷' },
];

// Render 6 persona seats on a circle (Layout A · flat ring).
function buildRingNodes() {
  const rw = document.getElementById('rw');
  if (!rw) return;
  rw.querySelectorAll('.rn').forEach(n => n.remove());
  const r = 210, cx = 270, cy = 270;
  PERSONA_ORDER.forEach((p, i) => {
    const rad = i * (360 / PERSONA_ORDER.length) * Math.PI / 180;
    const x = cx + r * Math.sin(rad);
    const y = cy - r * Math.cos(rad);
    const div = document.createElement('div');
    div.className = 'rn waiting';
    div.id = 'rn-' + p.id;
    div.dataset.p = p.id;
    div.dataset.slug = p.id;
    div.dataset.name = p.name;
    div.style.left = x + 'px';
    div.style.top = y + 'px';
    // huineng has no grid slot — use emoji; others use portrait-grid
    const avContent = p.id === 'huineng' ? p.emoji : '';
    const avClass = p.id === 'huineng' ? 'rn-av' : `rn-av av-grid p-${p.id}`;
    div.innerHTML = `<div class="${avClass}">${avContent}</div><div class="rn-label">${p.name}</div>`;
    rw.appendChild(div);
  });
}

// Render 6 persona seats on an ellipse perimeter (Layout B · 42° table).
// Seats stay upright while the tabletop is rotateX(42deg).
function buildTableNodes() {
  const tw = document.getElementById('tw');
  if (!tw) return;
  tw.querySelectorAll('.seat-adv').forEach(n => n.remove());
  const EW = 560, EH = 420, ECX = EW/2, ECY = EH/2;
  const a = 258, b = 148; // semi-major, semi-minor axes
  PERSONA_ORDER.forEach((p, i) => {
    const rad = i * (360 / PERSONA_ORDER.length) * Math.PI / 180;
    const x = ECX + a * Math.sin(rad);
    const y = ECY - b * Math.cos(rad);
    const div = document.createElement('div');
    div.className = 'seat seat-adv waiting';
    div.id = 'seat-' + p.id;
    div.dataset.p = p.id;
    div.dataset.slug = p.id;
    div.dataset.name = p.name;
    div.style.left = x + 'px';
    div.style.top = y + 'px';
    const avContent = p.id === 'huineng' ? p.emoji : '';
    const avClass = p.id === 'huineng' ? 'seat-av' : `seat-av av-grid p-${p.id}`;
    div.innerHTML = `<div class="${avClass}">${avContent}</div><div class="seat-label">${p.name}</div>`;
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

// Set host seat state. Host appears in both layouts (#rh and #th-host).
function setHostState(state) {
  const rh = document.getElementById('rh');
  const th = document.getElementById('th-host');
  [rh, th].forEach(el => {
    if (!el) return;
    el.classList.remove('dim', 'lit', 'speaking');
    if (state) el.classList.add(state);
  });
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
}

// Update the locked problem text on the 42° table center.
function setTableTopic(text) {
  const el = document.getElementById('tbl-topic-t');
  if (el) el.textContent = text || '—';
}

// Close speech panel (called from back button or bubble-toggle click).
window.closeSpeechPanel = function() {
  const vs = document.getElementById('view-speech');
  if (vs) vs.classList.remove('open');
  document.querySelectorAll('.rn-bubble.active').forEach(b => b.classList.remove('active'));
};

// Map SSE persona name → slug using the existing PERSONAS object.
function personaNameToSlug(name) {
  const p = PERSONAS[name];
  return p ? p.slug : null;
}

// Per-persona accumulated speech text (Step 4 + facilitator). Keyed by slug
// for personas and 'facilitator' for the host.
const rtStreamBuffers = new Map();

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
function rtShowBubble(slug, name, text, opts) {
  if (!document.body.classList.contains('rt-mode')) return;
  const seat = getSeatEl(slug);
  if (!seat) return;
  let bubble = seat.querySelector('.rn-bubble');
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.className = 'rn-bubble';
    bubble.dataset.slug = slug;
    rtApplyPersonaVars(bubble, slug);
    bubble.innerHTML = `<div class="rn-bubble-tag">${rtEsc(name)}</div><div class="rn-bubble-text cur"></div>`;
    seat.appendChild(bubble);
  }
  const txtEl = bubble.querySelector('.rn-bubble-text');
  if (txtEl) txtEl.textContent = rtTruncate(text, 40);
  if (opts && opts.streaming === false) {
    if (txtEl) txtEl.classList.remove('cur');
    if (!bubble.querySelector('.rn-bubble-hint')) {
      const hint = document.createElement('div');
      hint.className = 'rn-bubble-hint';
      hint.textContent = '点击查看完整发言 ↗';
      bubble.appendChild(hint);
    }
    bubble.onclick = (e) => {
      e.stopPropagation();
      const wasActive = bubble.classList.contains('active');
      document.querySelectorAll('.rn-bubble.active').forEach(b => b.classList.remove('active'));
      if (wasActive) {
        window.closeSpeechPanel();
      } else {
        bubble.classList.add('active');
        window.openSpeechPanel(slug, name, rtStreamBuffers.get(slug) || text);
      }
    };
  }
}

// Host bubble for Steps 2/3 facilitator streaming.
function rtShowHostBubble(text, opts) {
  if (!document.body.classList.contains('rt-mode')) return;
  const ring = document.getElementById('ring-scene');
  const tbl  = document.getElementById('table-scene');
  const host = (tbl && tbl.classList.contains('on')) ? document.getElementById('th-host')
             : (ring && ring.classList.contains('on')) ? document.getElementById('rh')
             : null;
  if (!host) return;
  let bubble = host.querySelector('.rn-bubble');
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.className = 'rn-bubble';
    bubble.dataset.slug = 'facilitator';
    bubble.innerHTML = `<div class="rn-bubble-tag">主持人</div><div class="rn-bubble-text cur"></div>`;
    host.appendChild(bubble);
  }
  const txtEl = bubble.querySelector('.rn-bubble-text');
  if (txtEl) txtEl.textContent = rtTruncate(text, 48);
  if (opts && opts.streaming === false) {
    if (txtEl) txtEl.classList.remove('cur');
    if (!bubble.querySelector('.rn-bubble-hint')) {
      const hint = document.createElement('div');
      hint.className = 'rn-bubble-hint';
      hint.textContent = '完成';
      bubble.appendChild(hint);
    }
  }
}

function rtClearHostBubble() {
  document.querySelectorAll('#rh .rn-bubble, #th-host .rn-bubble').forEach(b => b.remove());
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
  if (meta) meta.textContent = slug === 'facilitator' ? '主持人 · 发言' : 'STEP 4 · 幕僚发言';
  if (body) {
    body.innerHTML = md(fullText || '');
    // Preserve data-markable on the body so future 6.4 can re-anchor highlights
    body.setAttribute('data-markable', '');
    body.setAttribute('data-step', '4');
    body.setAttribute('data-persona', name || '');
  }
  vs.classList.add('open');
};

// ESC key closes the speech panel.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.closeSpeechPanel();
});

// ─── Utilities ──────────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
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
  try {
    await fetch(`${API}/api/projects/${PID}/sessions/${SID}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error('reaction save failed', e);
  }
}

function md(text) {
  if (typeof marked !== "undefined") {
    return marked.parse(String(text));
  }
  return "<p>" + esc(text) + "</p>";
}

// Load a session file from the API (returns raw text, empty string on error)
async function loadFile(filename) {
  try {
    const res = await fetch(`${API}/api/projects/${PID}/sessions/${SID}/files/${filename}`);
    if (!res.ok) return "";
    const text = await res.text();
    if (text.startsWith('{"error"')) return "";
    return text;
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
  const TOTAL_TIMEOUT = 5 * 60 * 1000;  // 5 minutes max per SSE stream
  const IDLE_WARN = 20 * 1000;           // 20s with no data → show "still waiting"
  const IDLE_TIMEOUT = 90 * 1000;        // 90s with no data → abort as stalled

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
      if (handlers._onIdle) handlers._onIdle();
    }, IDLE_WARN);
    idleAbortTimer = setTimeout(() => {
      controller.abort();
    }, IDLE_TIMEOUT);
  }

  function cleanupTimers() {
    clearTimeout(totalTimer);
    if (idleWarnTimer) clearTimeout(idleWarnTimer);
    if (idleAbortTimer) clearTimeout(idleAbortTimer);
  }

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

        try {
          const evt = JSON.parse(data);
          const fn = handlers[evt.type];
          if (fn) fn(evt);
        } catch {
          const m = data.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              const evt = JSON.parse(m[0]);
              const fn = handlers[evt.type];
              if (fn) fn(evt);
            } catch {}
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
}

// ─── Step / Progress Management ─────────────────────────────────────────────

let currentStep = 1;
const stepStarted = {};

function showStep(n) {
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
    if (!PID) {
      const proj = await fetch(`${API}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: input.slice(0, 40) }),
      }).then(r => r.json());
      PID = proj.id;
    }

    const session = await fetch(`${API}/api/projects/${PID}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_input: input }),
    }).then(r => r.json());
    SID = session.id;

    history.replaceState({}, "", `?projectId=${PID}&sessionId=${SID}`);

    await fetch(stepUrl(1), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

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

// Restore saved mode on load
(function restoreMode() {
  const saved = localStorage.getItem("counsel-mode");
  const toggle = document.getElementById("mode-toggle");
  const label = document.getElementById("mode-label");
  if (saved === "user" && toggle) {
    toggle.checked = true;
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
      }
    },
    step_done(e) {
      if (e.data && e.data.cached) cached = true;
      if (e.data) autoSimData = e.data;
      clearAllChips();
    },
  });
  } catch (e) {
    clearAllChips();
    content.innerHTML += `<div class="error-msg">${esc(e.message)}</div>`;
  }

  // ── User mode: show answer form ──
  if (!simulate && autoSimData && autoSimData.auto_simulate === false) {
    // Load the saved questions JSON
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
      return; // Don't show proceed button yet
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

// Submit user answers for Step 3 (user mode)
window.submitFactsAnswers = async function() {
  const btn = document.getElementById("s3-submit-answers");
  if (btn) { btn.textContent = "提交中…"; btn.disabled = true; }

  // Collect answers from textareas
  const answers = [];
  let i = 0;
  while (true) {
    const ta = document.getElementById("qa-a-" + i);
    if (!ta) break;
    answers.push(ta.value.trim() || "（未回答）");
    i++;
  }

  const content = document.getElementById("s3-content");

  try {
    await streamSSE(stepUrl(3), { input: JSON.stringify(answers) }, {
      step_start() {},
      step_done() {},
    });

    // Now load the saved Q&A file and show results
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
          content.innerHTML += `<div class="ocard" style="border-color:rgba(255,255,255,.15);background:rgba(255,255,255,.04)"><div class="ocard-n" style="color:rgba(255,255,255,.3)">你的回答</div><div class="ocard-t">${esc(body)}</div></div>`;
        } else {
          const p = matchPersona(title);
          const dp = p ? ` data-p="${p.slug}"` : '';
          const av = p ? `<div class="p-av" data-p="${p.slug}">${p.initial}</div>` : '';
          content.innerHTML += `<div class="ocard"${dp}><div class="ocard-h">${av}<div class="ocard-n">${esc(title)}</div></div><div class="ocard-t">${esc(body)}</div></div>`;
        }
      }
    }

    content.innerHTML += `<button class="btn btn-w btn-full" onclick="showStep(4)">事实已收集，进入幕僚发言 →</button>`;
  } catch (e) {
    if (btn) { btn.textContent = "提交回答 →"; btn.disabled = false; }
    content.innerHTML += `<div class="error-msg">${esc(e.message)}</div>`;
  }
};

// ─── Step 4: Persona Opinions ───────────────────────────────────────────────

async function runS4() {
  if (stepStarted[4]) return;
  stepStarted[4] = true;

  const container = document.getElementById("s4-cards");
  container.innerHTML = '<div class="loading-text">幕僚正在思考…</div>';

  const cards = {};
  let cached = false;
  const isRT = document.body.classList.contains('rt-mode');
  if (isRT) rtClearPersonaBubbles();

  try {
  await streamSSE(stepUrl(4), {}, {
    _onIdle() {
      const loading = container.querySelector(".loading-text");
      if (loading) loading.textContent = "AI正在深度思考，请稍候…";
    },
    step_start() { container.innerHTML = ""; },
    persona_start(e) {
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
      if (e.data && e.data.cached) cached = true;
      clearAllChips();
      container.innerHTML += `<button class="btn btn-w btn-full" onclick="showStep(5)">全部完成，进入拆维度 →</button>`;
    },
  });
  } catch (e) {
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
  content.innerHTML = '<div class="loading-text">主持人正在提炼冲突维度…</div>';
  cardsEl.innerHTML = "";
  btn.style.display = "none";

  let skipped = false;
  let skipMessage = "";

  try {
    await streamSSE(stepUrl(5), {}, {
      _onIdle() { content.innerHTML = '<div class="loading-text">AI正在深度思考，请稍候…</div>'; },
      step_start() {},
      step_done(e) {
        if (e.data && e.data.skipped) {
          skipped = true;
          skipMessage = e.data.message || "本步骤已跳过。";
        }
      },
    });
  } catch (e) {
    content.innerHTML = `<div class="error-msg">${esc(e.message)}</div>`;
    btn.style.display = "block";
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
  if (stepStarted[6]) return;
  stepStarted[6] = true;

  const content = document.getElementById("s6-content");
  content.innerHTML = '<div class="loading-text">幕僚辩论中…</div>';

  const selectedIndices = Array.from(document.querySelectorAll("#s5-cards .dcard.sel"))
    .map(el => parseInt(el.dataset.idx))
    .filter(n => !isNaN(n));

  // Per-dimension state — keyed by dimIdx
  let currentDim = -1;
  const dimCards = {}; // dimIdx -> { personaName -> dom id }
  const dimSummaryIds = {}; // dimIdx -> s6-summary-{idx}
  let cached = false;

  const dimContainerId = (i) => `s6-dim-${i}`;
  const personaCardId = (dimIdx, name) => `s6-d${dimIdx}-${slugify(name)}`;
  const summaryCardId = (dimIdx) => `s6-sum-${dimIdx}`;

  try {
  await streamSSE(stepUrl(6), { selected_dimensions: selectedIndices.length ? selectedIndices : [0, 1] }, {
    _onIdle() {
      const loading = content.querySelector(".loading-text");
      if (loading) loading.textContent = "AI正在深度思考，请稍候…";
    },
    step_start() { content.innerHTML = ""; },
    dimension_start(e) {
      currentDim = e.index;
      dimCards[currentDim] = {};
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
    },
    persona_chunk(e) {
      const id = dimCards[currentDim] && dimCards[currentDim][e.name];
      if (!id) return;
      const t = document.getElementById(`${id}-t`);
      if (t) t.textContent += e.chunk;
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
    },
    facilitator_done() {
      const sumId = dimSummaryIds[currentDim];
      if (!sumId) return;
      const t = document.getElementById(`${sumId}-t`);
      if (t) {
        const plain = t.textContent || "";
        t.innerHTML = '<div class="md-body">' + md(plain) + '</div>';
        t.classList.remove("cur");
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

  // ── 1. Load whatever is already in premortem.md (background pre-run may have
  //    written 0%, 30%, 100% by now) and show it immediately if any content.
  const initialPremortem = await loadFile("premortem.md");
  if (initialPremortem && initialPremortem.trim()) {
    preCard.style.display = "";
    preBody.innerHTML = md(initialPremortem);
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
      },
      premortem_chunk(e) {
        premortemText += e.chunk;
        preBody.innerHTML = md(premortemText);
        preBody.classList.add('cur');
      },
      premortem_done() {
        if (premortemText) preBody.innerHTML = md(premortemText);
        preBody.classList.remove('cur');
        applyAllSavedMarks(preBody);
      },
      step_start() { sumBody.innerHTML = ""; },
      facilitator_chunk(e) {
        summaryText += e.chunk;
        sumBody.innerHTML = md(summaryText);
        sumBody.classList.add('cur');
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
    sumBody.innerHTML = md(summaryText);
    sumBody.classList.remove('cur');
    applyAllSavedMarks(sumBody);
  } else if (cached) {
    const file = await loadFile("06-summary.md");
    if (file) {
      sumBody.innerHTML = md(file);
      applyAllSavedMarks(sumBody);
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

  content.innerHTML = renderReflectionPanel(PID, SID, existingClientNotes, alreadyDone)
    + '<div id="s8-results"></div>';

  const resultsEl = document.getElementById("s8-results");

  if (alreadyDone) {
    // Session already completed — render cached results under the reflection panel
    renderS8Results(resultsEl, existingEvals, existingHarvest, existingBayesian);
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
    const res = await fetch(`${API}/api/projects/${PID}/sessions/${SID}/client-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`保存失败 (HTTP ${res.status})`);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '让幕僚根据我的反思做评估 →';
    resultsEl.innerHTML = `<div class="error-msg">${esc(e.message)}</div>`;
    return;
  }

  btn.textContent = '反思已提交 ✓（幕僚评估中…）';
  resultsEl.innerHTML = '<div class="loading-text">幕僚正在基于你的反思给出评价…（这一步需要较长时间）</div>';

  try {
    await streamSSE(stepUrl(8), { force_refresh: true }, {
      _onIdle() {
        const l = resultsEl.querySelector('.loading-text');
        if (l) l.textContent = 'AI正在深度思考，请稍候…';
      },
      step_start() {
        resultsEl.innerHTML = '<div class="loading-text">幕僚正在评价并提取行动建议…</div>';
      },
      step_done() {},
    });
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

function renderS8Results(el, evalsFile, harvestFile, bayesianFile) {
  el.innerHTML = '';
  // After all content injected, reapply saved marks (scheduled at end)
  queueMicrotask(() => applyAllSavedMarks(el));
  if (evalsFile) {
    el.innerHTML += `<div class="scard"><div class="st">幕僚观察（看过你的反思后）</div><div class="sb md-body" data-markable data-step="8" data-persona="evals">${md(evalsFile)}</div></div>`;
  }
  if (harvestFile) {
    el.innerHTML += renderHarvest(harvestFile, PID, SID);
  }
  if (bayesianFile) {
    el.innerHTML += `<div class="scard"><div class="st">贝叶斯信念更新（综合你 + 幕僚双方）</div><div class="sb md-body" data-markable data-step="8" data-persona="bayesian">${md(bayesianFile)}</div></div>`;
  }
  if (!harvestFile && !bayesianFile && !evalsFile) {
    el.innerHTML = '<div class="error-msg">未能获取结果</div>';
  }
  el.innerHTML += `<div class="done-banner">✓ 本次私董会圆满结束</div>`;
}

// Parse 07-harvest.md into sections and render interactive UI.
// Note: client's own reflection is no longer rendered here — it lives in the separate
// renderReflectionPanel() at the TOP of Step 8 (2026-04-22 product reorder).
function renderHarvest(text, pid, sid) {
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
  const todoSec = findSection('to-do') || findSection('todo') || findSection('行动');
  const insightsSec = findSection('insight') || findSection('洞察');

  let html = '';

  // ── Action to-do list (interactive) ──
  if (todoSec) {
    const todoLines = todoSec.body.split('\n').filter(l => /^\s*-\s*\[[ xX]\]/.test(l));
    if (todoLines.length > 0) {
      html += '<div class="scard"><div class="st">✅ 行动清单</div><div class="todo-list">';
      todoLines.forEach((line, idx) => {
        const m = line.match(/^\s*-\s*\[([ xX])\]\s*(.+)$/);
        if (!m) return;
        const wasChecked = m[1].toLowerCase() === 'x';
        const itemText = m[2];
        const storageKey = `counsel:todo:${pid}:${sid}:${idx}`;
        const savedState = localStorage.getItem(storageKey);
        const isChecked = savedState !== null ? (savedState === '1') : wasChecked;
        const rendered = md(itemText).replace(/^<p>/,'').replace(/<\/p>\s*$/,'').trim();
        html += `<label class="todo-item${isChecked ? ' done' : ''}" data-k="${storageKey}">`
          + `<input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleTodo(this)">`
          + `<span class="todo-text">${rendered}</span>`
          + `</label>`;
      });
      html += '</div></div>';
    }
  }

  // ── Key insights from debate ──
  if (insightsSec && insightsSec.body) {
    html += `<div class="scard"><div class="st">💡 辩论洞察</div><div class="sb md-body" data-markable data-step="8" data-persona="insights">${md(insightsSec.body)}</div></div>`;
  }

  return html;
}

window.toggleTodo = async function(el) {
  const item = el.closest('.todo-item');
  const key = item.getAttribute('data-k');
  localStorage.setItem(key, el.checked ? '1' : '0');
  item.classList.toggle('done', el.checked);

  // Phase 2026-04-22: clicking a todo IS the commitment signal. POST to
  // /todos/commit so the backend appends a commit event to user-wiki.md
  // (only clicked items flow into the wiki, not the full LLM-generated list).
  const textEl = item.querySelector('.todo-text');
  const text = textEl ? textEl.textContent.trim() : '';
  if (!text || !PID || !SID) return;
  try {
    await fetch(`${API}/api/projects/${PID}/sessions/${SID}/todos/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, checked: el.checked }),
    });
  } catch (e) {
    console.error('todo commit failed', e);
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

window.openSettings = function() {
  document.getElementById("settings-modal").classList.add("open");
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

  try {
    const projects = await fetch(`${API}/api/projects`).then(r => r.json());
    if (!projects.length) {
      list.innerHTML = '<div class="loading-text">暂无会话记录</div>';
      return;
    }

    // Collect all sessions across all projects into a flat list, then sort by
    // created_at descending (newest first) per Michael's request (2026-04-22).
    const allItems = [];
    for (const proj of projects) {
      const sessions = await fetch(`${API}/api/projects/${proj.id}/sessions`).then(r => r.json());
      for (const s of sessions) allItems.push({ proj, session: s });
    }
    allItems.sort((a, b) => {
      const tb = new Date(b.session.created_at || 0).getTime();
      const ta = new Date(a.session.created_at || 0).getTime();
      return tb - ta;
    });

    if (!allItems.length) {
      list.innerHTML = '<div class="loading-text">暂无会话记录</div>';
      return;
    }

    let html = "";
    for (const { proj, session: s } of allItems) {
      const isCurrent = s.id === SID;
      const preview = String(s.raw_input || "").slice(0, 120);
      const date = s.created_at ? new Date(s.created_at).toLocaleString("zh-CN", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }) : "";
      const stepLabel = s.current_step >= 8 ? "已完成" : `步骤 ${s.current_step}/8`;
      const doneClass = s.current_step >= 8 ? " done" : "";
      const currentTag = isCurrent ? ' <span style="color:rgba(255,255,255,.5);font-size:10px">· 当前</span>' : '';

      html += `<div class="hcard" onclick="loadSession('${proj.id}','${s.id}')">`;
      html += `<div class="hcard-q">${esc(preview)}</div>`;
      html += `<div class="hcard-meta"><span class="hcard-step${doneClass}">${stepLabel}</span><span>${date}${currentTag}</span></div>`;
      html += `<div class="hcard-btns">`;
      html += `<button class="btn btn-g" style="font-size:10px;padding:3px 8px" onclick="event.stopPropagation();window.open('?projectId=${proj.id}&sessionId=${s.id}','_blank')">新标签页打开</button>`;
      if (!isCurrent) {
        html += `<button class="btn btn-g" style="font-size:10px;padding:3px 8px" onclick="event.stopPropagation();loadSession('${proj.id}','${s.id}')">切换到此会话</button>`;
      }
      html += `</div></div>`;
    }

    list.innerHTML = html;
  } catch (e) {
    list.innerHTML = `<div class="error-msg">${esc(e.message)}</div>`;
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

// "+ 新一轮追踪" — user clicked the button on an existing project card in the
// Problem Library. We set PID (so submitInput skips /projects POST), clear
// SID, show Step 1 with a banner that makes it clear which project the new
// session belongs to.
window.startNewSessionInProject = function(pid, projectName) {
  PID = pid;
  SID = null;
  const ta = document.getElementById("s1-input");
  if (ta) { ta.value = ""; ta.focus(); }
  showProjectBanner(projectName);
  showStep(1);
  // Scroll to top so user sees the banner + input
  window.scrollTo({ top: 0, behavior: "smooth" });
};

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

window.openUserWiki = async function() {
  document.getElementById("wiki-modal").classList.add("open");
  const panel = document.getElementById("wiki-content");
  panel.innerHTML = '<div class="loading-text">加载画像…</div>';
  try {
    const res = await fetch("/api/user-wiki");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text || !text.trim()) {
      panel.innerHTML = '<div style="opacity:.6;font-size:13px;line-height:1.7">暂无画像内容。每次完成一次私董会（第 8 步），你的贝叶斯信念更新和行动清单会追加到这里，跨项目持续累积。</div>';
    } else {
      panel.innerHTML = md(text);
    }
  } catch (e) {
    panel.innerHTML = `<div class="error-msg">加载失败：${esc(e.message)}</div>`;
  }
};

window.closeUserWiki = function() {
  document.getElementById("wiki-modal").classList.remove("open");
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
    const projects = await fetch("/api/projects").then(r => r.json());
    if (!projects.length) {
      box.innerHTML =
        '<div class="problem-library-head"><div>' +
          '<div class="problem-library-title">📚 你的问题库</div>' +
          '<div class="problem-library-sub">每个问题可以跨多次 session 持续深入</div>' +
        '</div></div>' +
        '<div class="problem-library-empty">还没有问题——在上方写下你的第一个困境开始。</div>';
      return;
    }

    // Fetch sessions for all projects in parallel
    const withSessions = await Promise.all(projects.map(async p => {
      try {
        const sessions = await fetch(`/api/projects/${p.id}/sessions`).then(r => r.json());
        return { project: p, sessions: Array.isArray(sessions) ? sessions : [] };
      } catch {
        return { project: p, sessions: [] };
      }
    }));
    // Filter out projects with zero sessions (should be rare)
    const active = withSessions.filter(x => x.sessions.length > 0);
    // Sort projects by most-recent session date
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

// Lazy-load session summary on project expand — pulls 01-defined.md (locked
// topic) or falls back to raw_input. One fetch per session, parallel.
window.togglePlProject = async function(pi) {
  const card = document.getElementById(`pl-proj-${pi}`);
  if (!card) return;
  const wasOpen = card.classList.contains('open');
  card.classList.toggle('open');
  if (wasOpen) return;  // collapsing, no work
  // Expanding — populate summaries if not yet loaded
  const summaryEls = card.querySelectorAll('.pl-session-summary.loading');
  await Promise.all(Array.from(summaryEls).map(async el => {
    const pid = el.dataset.pid;
    const sid = el.dataset.sid;
    const raw = el.dataset.raw || '';
    try {
      const res = await fetch(`/api/projects/${pid}/sessions/${sid}/files/01-defined.md`);
      if (res.ok) {
        const txt = await res.text();
        if (txt && !txt.startsWith('{"error"') && txt.trim()) {
          el.textContent = txt.trim();
          el.classList.remove('loading');
          return;
        }
      }
    } catch {}
    // Fallback to raw_input
    el.textContent = raw || '(无内容)';
    el.classList.remove('loading');
  }));
};

// ─── Follow-Ups (Phase 2.3 — 后续追踪小助理) ────────────────────────────────

async function refreshFollowUpBadge() {
  try {
    const res = await fetch('/api/follow-ups');
    if (!res.ok) return;
    const items = await res.json();
    const badge = document.getElementById('followup-badge');
    if (!badge) return;
    if (items.length > 0) {
      badge.textContent = items.length;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  } catch (e) {
    // silent — endpoint might not exist pre-restart
  }
}

window.openFollowUps = async function() {
  document.getElementById('followup-modal').classList.add('open');
  const list = document.getElementById('followup-list');
  list.innerHTML = '<div class="loading-text">加载过期承诺…</div>';
  try {
    const res = await fetch('/api/follow-ups');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const items = await res.json();
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
    const res = await fetch('/api/follow-ups/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ todo, committed_at, session_id, status, reply }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
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

(function init() {
  const params = new URLSearchParams(location.search);
  PID = params.get("projectId");
  SID = params.get("sessionId");

  // Phase 6 · roundtable UI mode wiring — apply body class, label the toggle,
  // show/hide layout toggle group, and mount the shell if in roundtable mode.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRoundtableUI);
  } else {
    initRoundtableUI();
  }

  // Phase 2.13 phrase-level highlight toolbar — init once at page load.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPhraseToolbar);
  } else {
    initPhraseToolbar();
  }

  // Phase 2.3 follow-up badge — show overdue-commit count on topbar.
  refreshFollowUpBadge();
  // Problem library on Step 1 home view (skipped automatically when resuming)
  loadProblemLibrary();

  if (PID && SID) {
    resumeSession();
  } else {
    showStep(1);
  }
})();

async function resumeSession() {
  try {
    const session = await fetch(`${API}/api/projects/${PID}/sessions/${SID}`).then(r => r.json());
    const completedStep = session.current_step || 0;

    // Load cached content for all completed steps so user can browse history
    await loadCompletedSteps(completedStep);

    // Show the next step to work on (or the last completed step if session is done)
    if (completedStep >= 8) {
      showStep(8);
    } else {
      showStep(completedStep + 1);
    }
  } catch {
    showStep(2);
  }
}

async function loadCompletedSteps(upToStep) {
  // Step 1: Restore the original raw input so user can see their starting question
  if (upToStep >= 1) {
    stepStarted[1] = true;
    const raw = await loadFile("00-raw-input.md");
    if (raw) {
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
    stepStarted[2] = true;
    const defined = await loadFile("01-defined.md");
    if (defined) {
      const chat = document.getElementById("s2-chat");
      if (chat) chat.innerHTML = `<div class="cmsg"><div class="host-av">🎙</div><div class="cbub f"><div class="md-body">${md(defined)}</div></div></div>`;
      const lockArea = document.getElementById("s2-lock-area");
      if (lockArea) { lockArea.style.display = "block"; lockArea.innerHTML = `<button class="btn btn-w btn-full" onclick="showStep(3)">已锁定 → 查看事实</button>`; }
    }
  }

  // Step 3: Load facts
  if (upToStep >= 3) {
    stepStarted[3] = true;
    const qa = await loadFile("02-facts-answers.md");
    const content = document.getElementById("s3-content");
    if (qa && content) {
      content.innerHTML = '<div class="md-body">' + md(qa) + '</div>';
      content.innerHTML += `<button class="btn btn-w btn-full" onclick="showStep(4)">查看幕僚发言 →</button>`;
    }
  }

  // Step 4: Load opinions
  if (upToStep >= 4) {
    stepStarted[4] = true;
    const container = document.getElementById("s4-cards");
    if (container) {
      let html = "";
      for (const [name, data] of Object.entries(PERSONAS)) {
        const filename = name.replace(/ /g, "-") + ".md";
        const opinion = await loadFile(`03-opinions/${filename}`);
        if (opinion) {
          html += `<div class="ocard" data-p="${data.slug}">`
            + `<div class="ocard-h">${pavatar(name)}<div class="ocard-n">${esc(name)}</div></div>`
            + `<div class="ocard-t" data-markable data-step="4" data-persona="${esc(name)}">${esc(opinion)}</div>`
            + `</div>`;
        }
      }
      if (html) {
        container.innerHTML = html + `<button class="btn btn-w btn-full" onclick="showStep(5)">查看维度 →</button>`;
      }
    }
  }

  // Step 5: Load dimensions
  if (upToStep >= 5) {
    stepStarted[5] = true;
    const dimText = await loadFile("04-dimensions.md");
    if (dimText) {
      dimensions = parseDimensions(dimText);
      const content = document.getElementById("s5-content");
      const cardsEl = document.getElementById("s5-cards");
      const btn = document.getElementById("s5-btn");
      if (content) content.innerHTML = '<div class="md-body">' + md(dimText) + '</div>';
      if (cardsEl) cardsEl.innerHTML = "";
      if (btn) { btn.style.display = "block"; btn.textContent = "查看辩论 →"; }
    }
  }

  // Step 6: Load debate
  if (upToStep >= 6) {
    stepStarted[6] = true;
    const debate = await loadFile("05-debate.md");
    const content = document.getElementById("s6-content");
    if (debate && content) {
      content.innerHTML = renderDebateFromFile(debate);
      content.innerHTML += `<button class="btn btn-w btn-full" onclick="showStep(7)">查看汇总 →</button>`;
    }
  }

  // Step 7: Load summary + pre-mortem (Phase 4.4)
  if (upToStep >= 7) {
    stepStarted[7] = true;
    const summary = await loadFile("06-summary.md");
    const premortem = await loadFile("premortem.md");
    const content = document.getElementById("s7-content");
    if ((summary || premortem) && content) {
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
          + `<div class="sb md-body" id="s7-summary-body" data-markable data-step="7" data-persona="secretary">${md(summary)}</div>`
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
    }
  }

  // Step 8: Load harvest with reflection panel at top
  if (upToStep >= 8) {
    stepStarted[8] = true;
    const content = document.getElementById("s8-content");
    if (content) {
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
