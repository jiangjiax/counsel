/**
 * 参谋 · Roundtable v8
 * 主入口文件
 */

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
let mainCurStep = 's1';
let curLayout = 'A';
let panelMode = 'step'; // 'step' | 'profile' | 'wiki' | 'status'
let panelData = null;

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // 初始化星环节点位置
  initRingPositions();
  
  // 初始化S4卡片网格
  initS4Grid();
  
  console.log('参谋 v8 已加载');
});

// ═══════════════════════════════════════════════════════════
// LAYOUT
// ═══════════════════════════════════════════════════════════
function setLayout(layout) {
  curLayout = layout;
  document.getElementById('ring-scene').style.display = layout === 'A' ? 'flex' : 'none';
  document.getElementById('table-scene').style.display = layout === 'B' ? 'flex' : 'none';
  document.getElementById('lt-A').classList.toggle('on', layout === 'A');
  document.getElementById('lt-B').classList.toggle('on', layout === 'B');
  
  // S3浮动卡片需要重新渲染
  if (mainCurStep === 's3') {
    renderS3Step();
  }
}

function initRingPositions() {
  for (let i = 0; i < 12; i++) {
    const el = document.getElementById('rn-' + i);
    if (el) {
      el.style.left = RING_POS[i].x + 'px';
      el.style.top = RING_POS[i].y + 'px';
    }
  }
}

// ═══════════════════════════════════════════════════════════
// MODE SYSTEM (Toggle)
// ═══════════════════════════════════════════════════════════
function toggleMode(mode, data) {
  // 如果点击相同模式+数据，则关闭（toggle行为）
  if (panelMode === mode && panelData === data) {
    backToStep();
    return;
  }
  
  panelMode = mode;
  panelData = data;
  
  // 隐藏所有视图
  document.getElementById('view-step').style.display = 'none';
  document.getElementById('view-profile').style.display = 'none';
  document.getElementById('view-wiki').style.display = 'none';
  document.getElementById('view-status').style.display = 'none';
  
  // 显示选中视图
  document.getElementById('view-' + mode).style.display = 'block';
  
  // 更新标签
  updateModeBar(mode);
  
  // 填充内容
  if (mode === 'profile') populateProfile(data);
}

function backToStep() {
  panelMode = 'step';
  panelData = null;
  document.getElementById('view-profile').style.display = 'none';
  document.getElementById('view-wiki').style.display = 'none';
  document.getElementById('view-status').style.display = 'none';
  document.getElementById('view-step').style.display = 'block';
  updateModeBar('step');
}

function updateModeBar(mode) {
  const el = document.getElementById('mode-label');
  const map = {
    'wiki': '📝 记录',
    'status': '⚖️ 局势'
  };
  
  if (map[mode]) {
    el.textContent = map[mode];
    return;
  }
  
  if (mode === 'step') {
    const idx = STEPS.findIndex(s => s.id === mainCurStep);
    el.textContent = '第' + (idx + 1) + '步：' + STEPS[idx].label;
    return;
  }
  
  if (mode === 'profile') {
    const p = PROFILES[panelData];
    el.textContent = p ? p.av + ' ' + p.name + ' · 档案' : '档案';
    return;
  }
}

function populateProfile(id) {
  const p = PROFILES[id];
  if (!p) return;
  
  document.getElementById('vp-av').textContent = p.av;
  document.getElementById('vp-name').textContent = p.name;
  document.getElementById('vp-role').textContent = p.role;
  
  let html = '';
  html += `<div class="prof-sec">身份背景</div><div class="prof-txt">${p.bg}</div>`;
  if (p.philosophy) html += `<div class="prof-sec">哲学体系</div><div class="prof-txt">${p.philosophy}</div>`;
  if (p.method) html += `<div class="prof-sec">方法论</div><div class="prof-txt">${p.method}</div>`;
  if (p.values) {
    const pills = p.values.split('·').map(v => `<span class="prof-pill">${v.trim()}</span>`).join('');
    html += `<div class="prof-sec">核心价值观</div><div>${pills}</div>`;
  }
  html += `<div class="prof-sec">标志性信念</div><div class="prof-q">${p.quote}</div>`;
  html += `<div class="prof-sec">本场已说</div><div class="prof-said">${p.said}</div>`;
  if (p.tags && p.tags.length) {
    html += `<div class="prof-sec">你可以问他</div><div>${p.tags.map(t => `<span class="prof-tag">${t}</span>`).join('')}</div>`;
  }
  
  document.getElementById('vp-body').innerHTML = html;
}

// ═══════════════════════════════════════════════════════════
// CHARACTER STATES
// ═══════════════════════════════════════════════════════════
const CHAR_STATES = {
  s1: { host: 'dim', all: 'dim' },
  s2: { host: 'speaking', all: 'active' },
  s3: { host: 'active', all: 'dim' },
  s4: { host: 'active', all: 'speaking' },
  s5: { host: 'speaking', all: 'done' },
  s6: { host: 'active', all: 'waiting', pro: [6, 9, 10], con: [8, 4], neutral: [1, 7, 11] },
  s7: { host: 'speaking', all: 'done' },
  s8: { host: 'done', all: 'done' }
};

function updateChars(stepId) {
  const st = CHAR_STATES[stepId] || { all: 'dim', host: 'dim' };
  
  // Update host
  const rh = document.getElementById('rh');
  if (rh) {
    const av = rh.querySelector('.ring-host-av');
    const shadows = {
      'speaking': '0 0 36px rgba(255,255,255,0.5), 0 0 70px rgba(255,255,255,0.2)',
      'active': '0 0 22px rgba(255,255,255,0.14)',
      'dim': '0 0 14px rgba(255,255,255,0.05)'
    };
    const borders = {
      'speaking': 'rgba(255,255,255,0.8)',
      'active': 'rgba(255,255,255,0.4)',
      'dim': 'rgba(255,255,255,0.15)'
    };
    av.style.boxShadow = shadows[st.host] || shadows.dim;
    av.style.borderColor = borders[st.host] || borders.dim;
  }
  
  const th = document.getElementById('th-host');
  if (th) th.className = 'seat seat-host ' + st.host;
  
  // Update 12 advisors
  for (let i = 0; i < 12; i++) {
    let s = st.all || 'dim';
    if (st.pro && st.pro.includes(i)) s = 'pro';
    if (st.con && st.con.includes(i)) s = 'con';
    if (st.neutral && st.neutral.includes(i)) s = 'neutral';
    
    const rn = document.getElementById('rn-' + i);
    if (rn) rn.className = 'rn ' + s;
    
    const tn = document.getElementById('th-' + i);
    if (tn) tn.className = 'seat seat-adv ' + s;
  }
}

// ═══════════════════════════════════════════════════════════
// SESSION INIT
// ═══════════════════════════════════════════════════════════
function initSession(project, round, entryStep) {
  console.log('Initializing session:', { project, round, entryStep });
  
  // 设置当前Project和Round信息
  document.getElementById('table-topic-text').textContent = project.name;
  
  // 根据entryStep进入对应的步骤
  const stepMap = {
    'context': 's1',
    'dialogue': 's3',
    'summary': 's7'
  };
  
  const stepId = stepMap[entryStep] || 's1';
  show(stepId);
}

// ═══════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════
function togglePCheck(el) {
  el.classList.toggle('sel');
  const box = el.querySelector('.pck-box');
  if (box) box.textContent = el.classList.contains('sel') ? '✓' : '';
}

function ck(el) {
  el.classList.toggle('ck');
  const chk = el.querySelector('.achk');
  if (chk) chk.textContent = el.classList.contains('ck') ? '✓' : '';
  
  // Update count
  const total = document.querySelectorAll('#s8 .aitem').length;
  const done = document.querySelectorAll('#s8 .aitem.ck').length;
  const countEl = document.getElementById('ck-count');
  if (countEl) countEl.textContent = done + '/' + total + ' 已选';
}
