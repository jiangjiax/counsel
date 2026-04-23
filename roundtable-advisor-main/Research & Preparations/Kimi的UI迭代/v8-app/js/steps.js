/**
 * Roundtable Advisor - Steps Logic
 * 8-step workflow core logic
 */

// ============================================
// Global State
// ============================================
let curStep = 1;
let s3Idx = 0;
let s3Answers = [];
let s4Streaming = false;
let s4ExpandedCard = null;

// S3 提问配置
const s3Questions = [
  { advisor: '数据官', icon: '📊', q: '过去6个月，最让你意外的数据是什么？' },
  { advisor: '增长官', icon: '📈', q: '如果只能做一件事来撬动增长，你会选什么？' },
  { advisor: '风控官', icon: '🛡️', q: '你最担心被忽视的潜在风险是什么？' }
];

// S4 独立思考数据
const s4Data = [
  { name: '数据官', icon: '📊', speech: '从数据看，用户留存率在第三周出现明显下滑...' },
  { name: '增长官', icon: '📈', speech: '如果聚焦单一渠道，我建议all in短视频...' },
  { name: '风控官', icon: '🛡️', speech: '合规风险方面，新政策的解读需要特别注意...' },
  { name: '战略官', icon: '🎯', speech: '长期竞争力上，技术壁垒比规模更重要...' },
  { name: '执行长', icon: '⚡', speech: '落地角度，我建议分三个阶段推进...' },
  { name: '政委', icon: '💬', speech: '团队士气目前稳定，但需关注核心成员状态...' }
];

// S5 维度数据
const s5Dimensions = [
  { name: '用户维度', color: '#3b82f6', icon: '👤' },
  { name: '产品维度', color: '#10b981', icon: '📦' },
  { name: '市场维度', color: '#f59e0b', icon: '🌍' },
  { name: '竞争维度', color: '#ef4444', icon: '⚔️' },
  { name: '资源维度', color: '#8b5cf6', icon: '💎' },
  { name: '风险维度', color: '#6b7280', icon: '⚠️' }
];

// ============================================
// 1. Core Navigation
// ============================================

function show(stepId) {
  curStep = stepId;
  
  // 隐藏所有步骤
  document.querySelectorAll('.step-section').forEach(el => {
    el.classList.remove('active');
  });
  
  // 显示当前步骤
  const currentSection = document.getElementById(`step${stepId}`);
  if (currentSection) {
    currentSection.classList.add('active');
  }
  
  // 更新步骤条
  buildStrip();
  
  // 更新导航按钮状态
  updateNavButtons();
  
  // 调用步骤特定的初始化函数
  initStep(stepId);
  
  // 滚动到顶部
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function prevStep() {
  if (curStep > 1) {
    show(curStep - 1);
  }
}

function nextStep() {
  if (curStep < 8) {
    show(curStep + 1);
  }
}

function updateNavButtons() {
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const finishBtn = document.getElementById('finishBtn');
  
  if (prevBtn) {
    prevBtn.disabled = curStep === 1;
    prevBtn.style.opacity = curStep === 1 ? '0.5' : '1';
  }
  
  if (nextBtn) {
    nextBtn.style.display = curStep === 8 ? 'none' : 'inline-flex';
  }
  
  if (finishBtn) {
    finishBtn.style.display = curStep === 8 ? 'inline-flex' : 'none';
  }
}

// ============================================
// 2. Step Strip Builder
// ============================================

function buildStrip() {
  const strip = document.getElementById('stepStrip');
  if (!strip) return;
  
  const steps = [
    { id: 1, label: '议题设定' },
    { id: 2, label: '幕僚召唤' },
    { id: 3, label: '挖事实' },
    { id: 4, label: '独立思考' },
    { id: 5, label: '拆维度' },
    { id: 6, label: '找共识' },
    { id: 7, label: '行动清单' },
    { id: 8, label: '会议纪要' }
  ];
  
  strip.innerHTML = steps.map(step => {
    const isActive = step.id === curStep;
    const isCompleted = step.id < curStep;
    const isPending = step.id > curStep;
    
    let className = 'step-item';
    if (isActive) className += ' active';
    if (isCompleted) className += ' completed';
    if (isPending) className += ' pending';
    
    return `
      <div class="${className}" onclick="show(${step.id})">
        <div class="step-number">${isCompleted ? '✓' : step.id}</div>
        <div class="step-label">${step.label}</div>
      </div>
    `;
  }).join('');
}

// ============================================
// 3. Step-specific Initializers
// ============================================

function initStep(stepId) {
  switch (stepId) {
    case 3:
      initS3Step();
      break;
    case 4:
      initS4Step();
      break;
    case 5:
      initS5Step();
      break;
    case 6:
      initS6Step();
      break;
    case 7:
      initS7Step();
      break;
  }
}

// ============================================
// 4. S3 挖事实逻辑
// ============================================

function initS3Step() {
  s3Idx = 0;
  s3Answers = [];
  renderS3Step();
}

function renderS3Step() {
  const container = document.getElementById('s3Container');
  if (!container) return;
  
  if (s3Idx >= s3Questions.length) {
    // 所有问题回答完毕，自动进入下一步
    setTimeout(() => nextStep(), 500);
    return;
  }
  
  const q = s3Questions[s3Idx];
  
  container.innerHTML = `
    <div class="advisor-question">
      <div class="advisor-avatar">${q.icon}</div>
      <div class="question-bubble">
        <div class="question-text">${q.q}</div>
        <div class="question-meta">由 ${q.advisor} 提问</div>
      </div>
    </div>
    <div class="answer-section">
      <textarea id="s3Answer" class="answer-input" 
        placeholder="请输入你的回答..."></textarea>
      <div class="answer-actions">
        <button class="btn-skip" onclick="s3Next(true)">跳过</button>
        <button class="btn-submit" onclick="s3Next(false)">提交回答</button>
      </div>
    </div>
  `;
  
  // 渲染浮动卡片
  renderS3FloatCard(q);
}

function renderS3FloatCard(question) {
  const floatCard = document.getElementById('s3FloatCard');
  if (!floatCard) return;
  
  floatCard.innerHTML = `
    <div class="float-card-header">
      <span class="float-card-icon">${question.icon}</span>
      <span class="float-card-name">${question.advisor}</span>
    </div>
    <div class="float-card-question">${question.q}</div>
    <div class="float-card-progress">
      <span class="progress-current">${s3Idx + 1}</span>
      <span class="progress-total">/ ${s3Questions.length}</span>
    </div>
  `;
  
  floatCard.classList.add('show');
}

function s3Next(skip) {
  const answerInput = document.getElementById('s3Answer');
  const answer = skip ? '' : (answerInput ? answerInput.value.trim() : '');
  
  if (!skip && !answer) {
    // 提示用户输入
    if (answerInput) {
      answerInput.classList.add('error');
      setTimeout(() => answerInput.classList.remove('error'), 1000);
    }
    return;
  }
  
  // 保存答案
  s3Answers.push({
    question: s3Questions[s3Idx],
    answer: answer,
    skipped: skip
  });
  
  // 显示提交反馈
  if (!skip) {
    showToast('回答已记录');
  }
  
  // 进入下一题
  s3Idx++;
  renderS3Step();
}

// ============================================
// 5. S4 独立思考逻辑
// ============================================

function initS4Step() {
  initS4Grid();
  s4ExpandedCard = null;
  
  // 延迟启动流式效果
  setTimeout(() => {
    startS4Streaming();
  }, 500);
}

function initS4Grid() {
  const grid = document.getElementById('s4Grid');
  if (!grid) return;
  
  grid.innerHTML = s4Data.map((item, idx) => `
    <div class="s4-card" id="s4-card-${idx}" data-idx="${idx}">
      <div class="s4-card-header">
        <span class="s4-card-icon">${item.icon}</span>
        <span class="s4-card-name">${item.name}</span>
        <span class="s4-card-status" id="s4-status-${idx}">等待中...</span>
      </div>
      <div class="s4-card-content" id="s4-content-${idx}">
        <div class="typing-cursor">▋</div>
      </div>
    </div>
  `).join('');
}

function startS4Streaming() {
  if (s4Streaming) return;
  s4Streaming = true;
  
  let idx = 0;
  
  function streamNext() {
    if (idx >= s4Data.length) {
      s4Streaming = false;
      return;
    }
    
    streamS4Card(idx, () => {
      idx++;
      setTimeout(streamNext, 200);
    });
  }
  
  streamNext();
}

function streamS4Card(idx, callback) {
  const card = document.getElementById(`s4-card-${idx}`);
  const content = document.getElementById(`s4-content-${idx}`);
  const status = document.getElementById(`s4-status-${idx}`);
  
  if (!card || !content) {
    if (callback) callback();
    return;
  }
  
  card.classList.add('streaming');
  if (status) status.textContent = '思考中...';
  
  const text = s4Data[idx].speech;
  let charIdx = 0;
  
  function typeChar() {
    if (charIdx < text.length) {
      content.innerHTML = text.substring(0, charIdx + 1) + '<span class="typing-cursor">▋</span>';
      charIdx++;
      setTimeout(typeChar, 30 + Math.random() * 20);
    } else {
      // 打字完成
      content.innerHTML = text;
      card.classList.remove('streaming');
      card.classList.add('completed');
      if (status) status.textContent = '已完成';
      
      // 在场景中创建泡泡
      createSceneBubble(idx, text.substring(0, 50) + '...');
      
      if (callback) callback();
    }
  }
  
  typeChar();
}

function createSceneBubble(idx, speech) {
  const scene = document.getElementById('s4Scene');
  if (!scene) return;
  
  const item = s4Data[idx];
  const bubble = document.createElement('div');
  bubble.className = 'scene-bubble';
  bubble.id = `scene-bubble-${idx}`;
  bubble.innerHTML = `
    <span class="bubble-icon">${item.icon}</span>
    <span class="bubble-text">${speech}</span>
  `;
  
  // 随机位置
  const top = 10 + Math.random() * 60;
  const left = 5 + Math.random() * 40;
  bubble.style.top = `${top}%`;
  bubble.style.left = `${left}%`;
  
  bubble.onclick = () => toggleS4Speech(idx);
  
  scene.appendChild(bubble);
  
  // 淡入动画
  setTimeout(() => bubble.classList.add('show'), 10);
}

function toggleS4Speech(idx) {
  const card = document.getElementById(`s4-card-${idx}`);
  const content = document.getElementById(`s4-content-${idx}`);
  
  if (!card || !content) return;
  
  // 折叠之前的卡片
  if (s4ExpandedCard !== null && s4ExpandedCard !== idx) {
    const prevCard = document.getElementById(`s4-card-${s4ExpandedCard}`);
    if (prevCard) prevCard.classList.remove('expanded');
  }
  
  // 切换当前卡片
  const isExpanded = card.classList.contains('expanded');
  
  if (isExpanded) {
    card.classList.remove('expanded');
    s4ExpandedCard = null;
  } else {
    card.classList.add('expanded');
    s4ExpandedCard = idx;
    
    // 显示完整发言
    content.innerHTML = `
      <div class="full-speech">${s4Data[idx].speech}</div>
      <div class="speech-meta">
        <span>发言者: ${s4Data[idx].name}</span>
        <span>时间: ${new Date().toLocaleTimeString()}</span>
      </div>
    `;
  }
}

// ============================================
// 6. S5 拆维度逻辑
// ============================================

function initS5Step() {
  // 重置面板
  const panel = document.getElementById('s5Panel');
  const tracker = document.getElementById('s5Tracker');
  const scene = document.getElementById('s5Scene');
  
  if (panel) panel.innerHTML = '';
  if (tracker) {
    tracker.innerHTML = s5Dimensions.map((d, i) => `
      <div class="dim-item" id="dim-track-${i}">
        <span class="dim-dot" style="background: ${d.color}"></span>
        <span class="dim-name">${d.name}</span>
      </div>
    `).join('');
  }
  if (scene) scene.innerHTML = '';
  
  // 启动动画
  setTimeout(() => {
    startS5Animation();
  }, 500);
}

function startS5Animation() {
  const scene = document.getElementById('s5Scene');
  const panel = document.getElementById('s5Panel');
  
  if (!scene || !panel) return;
  
  let idx = 0;
  
  function animateNext() {
    if (idx >= s5Dimensions.length) return;
    
    const dim = s5Dimensions[idx];
    
    // 1. 从中央生成泡泡
    const bubble = document.createElement('div');
    bubble.className = 's5-bubble';
    bubble.innerHTML = `<span>${dim.icon}</span>`;
    bubble.style.background = dim.color;
    bubble.style.left = '50%';
    bubble.style.top = '50%';
    bubble.style.transform = 'translate(-50%, -50%) scale(0)';
    scene.appendChild(bubble);
    
    // 泡泡放大
    setTimeout(() => {
      bubble.style.transform = 'translate(-50%, -50%) scale(1)';
    }, 50);
    
    // 2. 泡泡飞向右侧
    setTimeout(() => {
      const targetX = window.innerWidth - 300;
      bubble.style.left = `${targetX}px`;
      bubble.style.top = `${100 + idx * 80}px`;
    }, 500);
    
    // 3. 面板卡片滑入
    setTimeout(() => {
      const card = document.createElement('div');
      card.className = 's5-dim-card';
      card.innerHTML = `
        <div class="dim-card-header" style="border-color: ${dim.color}">
          <span class="dim-card-icon">${dim.icon}</span>
          <span class="dim-card-name">${dim.name}</span>
        </div>
        <div class="dim-card-content">
          <div class="dim-aspect">• 关键要素分析中...</div>
          <div class="dim-aspect">• 影响因素识别中...</div>
        </div>
      `;
      panel.appendChild(card);
      
      // 卡片滑入动画
      setTimeout(() => card.classList.add('show'), 50);
      
      // 4. 维度追踪器点亮
      const trackerItem = document.getElementById(`dim-track-${idx}`);
      if (trackerItem) trackerItem.classList.add('active');
      
      // 移除泡泡（已到达目标）
      bubble.remove();
      
      // 下一个维度
      idx++;
      setTimeout(animateNext, 300);
    }, 1200);
  }
  
  animateNext();
}

// ============================================
// 7. S6 找共识逻辑 (placeholder)
// ============================================

function initS6Step() {
  // S6 初始化逻辑
  const container = document.getElementById('s6Container');
  if (container) {
    container.innerHTML = `
      <div class="consensus-loading">
        <div class="loading-spinner"></div>
        <p>正在分析各方观点，寻找共识...</p>
      </div>
    `;
    
    // 模拟分析完成
    setTimeout(() => {
      container.innerHTML = `
        <div class="consensus-result">
          <h3>🎯 核心共识</h3>
          <div class="consensus-items">
            <div class="consensus-item">
              <span class="consensus-check">✓</span>
              <span>用户增长是当前首要优先级</span>
            </div>
            <div class="consensus-item">
              <span class="consensus-check">✓</span>
              <span>需要加强数据驱动决策能力</span>
            </div>
            <div class="consensus-item">
              <span class="consensus-check">✓</span>
              <span>风险管控不容忽视</span>
            </div>
          </div>
        </div>
      `;
    }, 2000);
  }
}

// ============================================
// 8. S7 行动清单逻辑 (placeholder)
// ============================================

function initS7Step() {
  const container = document.getElementById('s7Container');
  if (container) {
    container.innerHTML = `
      <div class="action-list">
        <div class="action-item" onclick="ck(this)">
          <span class="p-checkbox" onclick="togglePCheck(this); event.stopPropagation();">
            <span class="check-mark">✓</span>
          </span>
          <span class="action-text">制定Q4用户增长计划</span>
          <span class="action-owner">负责人: 增长官</span>
        </div>
        <div class="action-item" onclick="ck(this)">
          <span class="p-checkbox" onclick="togglePCheck(this); event.stopPropagation();">
            <span class="check-mark">✓</span>
          </span>
          <span class="action-text">建立周度数据分析机制</span>
          <span class="action-owner">负责人: 数据官</span>
        </div>
        <div class="action-item" onclick="ck(this)">
          <span class="p-checkbox" onclick="togglePCheck(this); event.stopPropagation();">
            <span class="check-mark">✓</span>
          </span>
          <span class="action-text">完成合规风险评估</span>
          <span class="action-owner">负责人: 风控官</span>
        </div>
      </div>
    `;
  }
}

// ============================================
// 9. 完成逻辑
// ============================================

function finishSession() {
  showToast('圆桌会议已完成！正在生成会议纪要...');
  
  // 模拟生成会议纪要
  setTimeout(() => {
    // 返回首页
    show(1);
    showToast('会议纪要已保存');
  }, 1500);
}

// ============================================
// 10. 工具函数
// ============================================

function togglePCheck(el) {
  el.classList.toggle('checked');
}

function ck(el) {
  // 行动项勾选 - 点击整行切换
  const checkbox = el.querySelector('.p-checkbox');
  if (checkbox) {
    checkbox.classList.toggle('checked');
  }
  el.classList.toggle('completed');
}

function showToast(message, duration = 2000) {
  // 创建或获取toast元素
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  
  toast.textContent = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// ============================================
// 11. Initialize on Load
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // 初始化步骤条
  buildStrip();
  
  // 显示第一步
  show(1);
});
