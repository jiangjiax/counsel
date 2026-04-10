/**
 * API Bridge — 覆盖 session.html 的静态 mock，接入真实后端
 */

const API_BASE = "";
const urlParams = new URLSearchParams(location.search);
let PROJECT_ID = urlParams.get("projectId");
let SESSION_ID = urlParams.get("sessionId");

// ─── SSE 流工具 ────────────────────────────────────────────────────────────────
function streamSSE(url, body, handlers) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n\n");
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          const fn = handlers[evt.type];
          if (fn) fn(evt);
        } catch {}
      }
    }
  });
}

// ─── 覆盖 enterSession()：从 home 进入时先创建 project+session ────────────────
window.enterSession = async function () {
  document.getElementById("home").style.display = "none";

  // 如果 URL 已有 session，直接进 s1
  if (SESSION_ID) { show("s1"); return; }

  // 否则先展示 s1 让用户输入
  show("s1");
};

// ─── S1：提交输入 ──────────────────────────────────────────────────────────────
window.submitInput = async function () {
  const ta = document.querySelector("#s1 .ginput");
  const input = ta ? ta.value.trim() : "";
  if (!input) { alert("请输入你的困境"); return; }

  const btn = document.querySelector("#s1 .btn-w");
  if (btn) { btn.textContent = "提交中…"; btn.disabled = true; }

  try {
    // 创建 project
    if (!PROJECT_ID) {
      const proj = await fetch(`${API_BASE}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: input.slice(0, 40) }),
      }).then(r => r.json());
      PROJECT_ID = proj.id;
    }

    // 创建 session
    const session = await fetch(`${API_BASE}/api/projects/${PROJECT_ID}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    }).then(r => r.json());
    SESSION_ID = session.id;

    // 更新 URL（不刷新页面）
    history.replaceState({}, "", `?projectId=${PROJECT_ID}&sessionId=${SESSION_ID}`);

    show("s2");
  } catch (e) {
    alert("创建失败：" + e.message);
    if (btn) { btn.textContent = "提交 →"; btn.disabled = false; }
  }
};

// ─── S2：Facilitator 对话 ─────────────────────────────────────────────────────
let s2Started = false;

async function startFacilitator() {
  if (!PROJECT_ID || !SESSION_ID) return;
  if (s2Started) return;
  s2Started = true;

  // 清空 mock 内容，换成真实聊天框
  const s2el = document.getElementById("s2");
  if (!s2el) return;

  // 保留 header，清空 mock 对话
  const header = s2el.querySelector(".sh");
  s2el.innerHTML = "";
  if (header) s2el.appendChild(header);

  // 聊天区
  const chatBox = document.createElement("div");
  chatBox.id = "s2-chat";
  chatBox.style.cssText = "flex:1;overflow-y:auto;margin-bottom:8px;max-height:320px";
  s2el.appendChild(chatBox);

  // 输入区
  const inputRow = document.createElement("div");
  inputRow.style.cssText = "display:flex;gap:6px;margin-top:8px";
  inputRow.innerHTML = `
    <input class="ginput ginput-sm" id="s2-input" placeholder="回复主持人..." style="flex:1">
    <button class="btn btn-w" onclick="sendFacilitatorMsg()">发送</button>
  `;
  s2el.appendChild(inputRow);

  // 锁定按钮区（初始隐藏）
  const lockArea = document.createElement("div");
  lockArea.id = "s2-lock-area";
  lockArea.style.cssText = "margin-top:8px;display:none";
  s2el.appendChild(lockArea);

  // 触发首次 facilitator 调用（空消息 = 用原始输入启动）
  await callFacilitator("");
}

async function callFacilitator(message) {
  const chatBox = document.getElementById("s2-chat");
  if (!chatBox) return;

  if (message) {
    const userBub = document.createElement("div");
    userBub.className = "cmsg u";
    userBub.innerHTML = `<div class="cav" style="background:rgba(255,255,255,.06)">我</div><div class="cbub u">${escHtml(message)}</div>`;
    chatBox.appendChild(userBub);
  }

  const aiBub = document.createElement("div");
  aiBub.className = "cmsg";
  aiBub.innerHTML = `<div class="cav">🎙️</div><div class="cbub f" id="s2-ai-bub-${Date.now()}"><span style="color:rgba(255,255,255,.3)">思考中…</span></div>`;
  chatBox.appendChild(aiBub);
  chatBox.scrollTop = chatBox.scrollHeight;

  const bubId = aiBub.querySelector("[id^='s2-ai-bub-']").id;
  let fullText = "";

  await streamSSE(
    `${API_BASE}/api/projects/${PROJECT_ID}/sessions/${SESSION_ID}/steps/define`,
    { message, lock: false },
    {
      facilitator_chunk: (e) => {
        fullText += e.chunk;
        const bub = document.getElementById(bubId);
        if (bub) bub.textContent = fullText;
        chatBox.scrollTop = chatBox.scrollHeight;
      },
    }
  );

  // 检测锁定信号
  if (fullText.includes("【议题锁定】")) {
    showLockButton(fullText);
  }
}

window.sendFacilitatorMsg = async function () {
  const input = document.getElementById("s2-input");
  const msg = input ? input.value.trim() : "";
  if (!msg) return;
  if (input) input.value = "";
  await callFacilitator(msg);
};

function showLockButton(content) {
  const area = document.getElementById("s2-lock-area");
  if (!area) return;
  area.style.display = "block";
  area.innerHTML = `
    <div style="font-size:10px;color:rgba(255,255,255,.4);margin-bottom:6px;padding:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:6px">${escHtml(content)}</div>
    <button class="btn btn-w" style="width:100%" onclick="lockAndProceed('${escAttr(content)}')">锁定议题，开始挖事实 →</button>
  `;
}

window.lockAndProceed = async function (content) {
  if (!PROJECT_ID || !SESSION_ID) return;
  await fetch(
    `${API_BASE}/api/projects/${PROJECT_ID}/sessions/${SESSION_ID}/steps/define`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lock: true, message: content }),
    }
  );
  show("s3");
};

// ─── S3：幕僚提问 ──────────────────────────────────────────────────────────────
let s3Questions = []; // [{personaName, emoji, question}]
let s3Idx = 0;
let s3Answers = {}; // personaName → answer text
let s3Started = false;

async function startFacts() {
  if (!PROJECT_ID || !SESSION_ID) return;
  if (s3Started) return;
  s3Started = true;

  const s3el = document.getElementById("s3");
  if (!s3el) return;

  const header = s3el.querySelector(".sh");
  s3el.innerHTML = "";
  if (header) s3el.appendChild(header);

  const loadingDiv = document.createElement("div");
  loadingDiv.id = "s3-loading";
  loadingDiv.style.cssText = "font-size:11px;color:rgba(255,255,255,.3);padding:12px 0";
  loadingDiv.textContent = "幕僚正在思考问题…";
  s3el.appendChild(loadingDiv);

  // 收集所有幕僚的问题
  const questions = {};

  await streamSSE(
    `${API_BASE}/api/projects/${PROJECT_ID}/sessions/${SESSION_ID}/steps/facts`,
    {},
    {
      persona_start: (e) => {
        questions[e.name] = { name: e.name, text: "" };
      },
      persona_chunk: (e) => {
        if (questions[e.name]) questions[e.name].text += e.chunk;
      },
      persona_done: () => {},
      step_done: () => {},
    }
  );

  // 把问题整理成队列（每个幕僚取第一行非空文本作为问题）
  s3Questions = Object.values(questions)
    .map(q => ({
      name: q.name,
      question: q.text.split("\n").find(l => l.trim()) || q.text.trim(),
    }))
    .filter(q => q.question);

  s3Idx = 0;
  s3Answers = {};

  // 移除 loading，渲染第一题
  loadingDiv.remove();
  renderS3Question(s3el);
}

function renderS3Question(container) {
  // 清除当前题目区域
  const existing = document.getElementById("s3-q-area");
  if (existing) existing.remove();

  if (s3Idx >= s3Questions.length) {
    // 全部回答完，提交答案
    submitFactAnswers(container);
    return;
  }

  const q = s3Questions[s3Idx];
  const prog = container.querySelector(".ssub");
  if (prog) prog.textContent = `正在提问 · ${s3Idx + 1} / ${s3Questions.length}`;

  const area = document.createElement("div");
  area.id = "s3-q-area";
  area.innerHTML = `
    <div class="s3-q-block">
      <div class="s3-adv-row">
        <div class="s3-adv-info">
          <div class="s3-adv-name">${escHtml(q.name)}</div>
          <div class="s3-adv-badge">正在提问</div>
        </div>
      </div>
      <div class="s3-question">${escHtml(q.question)}</div>
      <textarea class="ginput" id="s3-ans-input" rows="3" placeholder="你的回答..."></textarea>
      <div class="s3-btns">
        <button class="btn btn-g" onclick="s3SkipQ()">跳过</button>
        <button class="btn btn-w" onclick="s3SubmitQ()">提交回答 →</button>
      </div>
    </div>
  `;
  container.appendChild(area);
}

window.s3SubmitQ = function () {
  const input = document.getElementById("s3-ans-input");
  const text = input ? input.value.trim() : "";
  const q = s3Questions[s3Idx];
  if (q) s3Answers[q.name] = text || "（已提交）";
  s3Idx++;
  renderS3Question(document.getElementById("s3"));
};

window.s3SkipQ = function () {
  s3Idx++;
  renderS3Question(document.getElementById("s3"));
};

async function submitFactAnswers(container) {
  const answersText = Object.entries(s3Answers)
    .map(([name, ans]) => `### ${name}\n${ans}`)
    .join("\n\n");

  const doneDiv = document.createElement("div");
  doneDiv.style.cssText = "font-size:11px;color:rgba(255,255,255,.4);padding:8px 0";
  doneDiv.textContent = "提交中…";
  container.appendChild(doneDiv);

  await streamSSE(
    `${API_BASE}/api/projects/${PROJECT_ID}/sessions/${SESSION_ID}/steps/facts`,
    { answers: answersText },
    { step_done: () => {} }
  );

  doneDiv.remove();

  const btn = document.createElement("button");
  btn.className = "btn btn-w";
  btn.style.cssText = "width:100%;margin-top:8px";
  btn.textContent = "事实已收集，进入幕僚发言 →";
  btn.onclick = () => show("s4");
  container.appendChild(btn);
}

// ─── S4：12幕僚并行发言 ───────────────────────────────────────────────────────
let s4Started = false;

async function startOpinions() {
  if (!PROJECT_ID || !SESSION_ID) return;
  if (s4Started) return;
  s4Started = true;

  const s4el = document.getElementById("s4");
  if (!s4el) return;

  const header = s4el.querySelector(".sh");
  s4el.innerHTML = "";
  if (header) s4el.appendChild(header);

  const listEl = document.createElement("div");
  listEl.id = "s4-olist";
  s4el.appendChild(listEl);

  const cards = {};

  await streamSSE(
    `${API_BASE}/api/projects/${PROJECT_ID}/sessions/${SESSION_ID}/steps/opinions`,
    {},
    {
      persona_start: (e) => {
        const div = document.createElement("div");
        div.className = "ocard on";
        div.id = `ocard-${e.name}`;
        div.innerHTML = `
          <div class="ocard-n" id="ocard-n-${escAttr(e.name)}">${escHtml(e.name)} · 发言中</div>
          <div class="ocard-t cur" id="ocard-t-${escAttr(e.name)}"></div>
        `;
        listEl.appendChild(div);
        cards[e.name] = {
          n: document.getElementById(`ocard-n-${e.name}`),
          t: document.getElementById(`ocard-t-${e.name}`),
        };
      },
      persona_chunk: (e) => {
        if (cards[e.name]) cards[e.name].t.textContent += e.chunk;
      },
      persona_done: (e) => {
        if (cards[e.name]) {
          cards[e.name].n.textContent = `${e.name} · 完成 ↗`;
          document.getElementById(`ocard-${e.name}`)?.classList.remove("on");
        }
      },
      step_done: () => {
        const btn = document.createElement("button");
        btn.className = "btn btn-w";
        btn.style.cssText = "width:100%;margin-top:12px";
        btn.textContent = "全部完成，进入拆维度 →";
        btn.onclick = () => show("s5");
        listEl.appendChild(btn);
      },
    }
  );
}

// ─── S5：拆维度 ───────────────────────────────────────────────────────────────
let s5Started = false;

async function startDimensions() {
  if (!PROJECT_ID || !SESSION_ID) return;
  if (s5Started) return;
  s5Started = true;

  const s5el = document.getElementById("s5");
  if (!s5el) return;

  const header = s5el.querySelector(".sh");
  s5el.innerHTML = "";
  if (header) s5el.appendChild(header);

  const loadDiv = document.createElement("div");
  loadDiv.id = "s5-content";
  loadDiv.style.cssText = "font-size:11px;color:rgba(255,255,255,.3);padding:8px 0";
  loadDiv.textContent = "主持人正在提炼冲突维度…";
  s5el.appendChild(loadDiv);

  let fullText = "";

  await streamSSE(
    `${API_BASE}/api/projects/${PROJECT_ID}/sessions/${SESSION_ID}/steps/dimensions`,
    {},
    {
      facilitator_chunk: (e) => {
        fullText += e.chunk;
        loadDiv.textContent = fullText;
      },
      step_done: () => {
        // 渲染维度卡片
        renderDimensions(s5el, fullText);
      },
    }
  );
}

function renderDimensions(container, text) {
  const content = document.getElementById("s5-content");
  if (content) content.remove();

  // 解析维度（格式：**维度名**：正方 vs 反方）
  const dims = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const m = line.match(/\*\*(.+?)\*\*[：:]\s*(.+)/);
    if (m) dims.push({ label: m[1], text: m[2] });
  }

  if (dims.length === 0) {
    // fallback：直接显示文本
    const pre = document.createElement("div");
    pre.style.cssText = "font-size:11px;color:rgba(255,255,255,.5);line-height:1.7;white-space:pre-wrap";
    pre.textContent = text;
    container.appendChild(pre);
  } else {
    dims.forEach((d, i) => {
      const card = document.createElement("div");
      card.className = "dcard" + (i === 0 ? " sel" : "");
      card.innerHTML = `<div class="dicon">${i === 0 ? "✓" : "⚡"}</div><div><div class="dlabel">${escHtml(d.label)}</div><div class="dtext">${escHtml(d.text)}</div></div>`;
      card.onclick = () => {
        card.classList.toggle("sel");
        card.querySelector(".dicon").textContent = card.classList.contains("sel") ? "✓" : "⚡";
      };
      container.appendChild(card);
    });
  }

  const btn = document.createElement("button");
  btn.className = "btn btn-w";
  btn.style.cssText = "width:100%;margin-top:8px";
  btn.textContent = "进入辩论 →";
  btn.onclick = () => show("s6");
  container.appendChild(btn);
}

// ─── S6：辩论 ─────────────────────────────────────────────────────────────────
let s6Started = false;

async function startDebate() {
  if (!PROJECT_ID || !SESSION_ID) return;
  if (s6Started) return;
  s6Started = true;

  const s6el = document.getElementById("s6");
  if (!s6el) return;

  const header = s6el.querySelector(".sh");
  s6el.innerHTML = "";
  if (header) s6el.appendChild(header);

  // 收集选中的维度
  const selectedDims = Array.from(document.querySelectorAll("#s5 .dcard.sel .dlabel"))
    .map(el => el.textContent);

  const contentDiv = document.createElement("div");
  contentDiv.id = "s6-content";
  contentDiv.style.cssText = "font-size:11px;color:rgba(255,255,255,.3);padding:8px 0";
  contentDiv.textContent = "幕僚辩论中…";
  s6el.appendChild(contentDiv);

  let fullText = "";

  await streamSSE(
    `${API_BASE}/api/projects/${PROJECT_ID}/sessions/${SESSION_ID}/steps/debate`,
    { dimensions: selectedDims },
    {
      persona_start: (e) => {
        const row = document.createElement("div");
        row.className = "dbmsg j";
        row.id = `db-${escAttr(e.name)}`;
        row.innerHTML = `<div class="dbmsg-n">${escHtml(e.name)}</div><div class="dbmsg-t cur" id="dbt-${escAttr(e.name)}"></div>`;
        contentDiv.appendChild(row);
      },
      persona_chunk: (e) => {
        const t = document.getElementById(`dbt-${e.name}`);
        if (t) t.textContent += e.chunk;
      },
      persona_done: (e) => {
        const t = document.getElementById(`dbt-${e.name}`);
        if (t) t.classList.remove("cur");
      },
      facilitator_chunk: (e) => {
        fullText += e.chunk;
        let sumDiv = document.getElementById("s6-summary");
        if (!sumDiv) {
          sumDiv = document.createElement("div");
          sumDiv.id = "s6-summary";
          sumDiv.className = "dbmsg h";
          sumDiv.innerHTML = `<div class="dbmsg-n">🎙️ 主持人提炼</div><div class="dbmsg-t" id="s6-sum-text"></div>`;
          contentDiv.appendChild(sumDiv);
        }
        const t = document.getElementById("s6-sum-text");
        if (t) t.textContent = fullText;
      },
      step_done: () => {
        const btn = document.createElement("button");
        btn.className = "btn btn-w";
        btn.style.cssText = "width:100%;margin-top:12px";
        btn.textContent = "辩论完成，生成汇总 →";
        btn.onclick = () => show("s7");
        contentDiv.appendChild(btn);
      },
    }
  );
}

// ─── S7：汇总 ─────────────────────────────────────────────────────────────────
let s7Started = false;

async function startSummary() {
  if (!PROJECT_ID || !SESSION_ID) return;
  if (s7Started) return;
  s7Started = true;

  const s7el = document.getElementById("s7");
  if (!s7el) return;

  const header = s7el.querySelector(".sh");
  s7el.innerHTML = "";
  if (header) s7el.appendChild(header);

  const contentDiv = document.createElement("div");
  contentDiv.id = "s7-content";
  contentDiv.style.cssText = "font-size:11px;color:rgba(255,255,255,.3);padding:8px 0";
  contentDiv.textContent = "秘书正在整理汇总…";
  s7el.appendChild(contentDiv);

  let fullText = "";

  await streamSSE(
    `${API_BASE}/api/projects/${PROJECT_ID}/sessions/${SESSION_ID}/steps/summary`,
    {},
    {
      facilitator_chunk: (e) => {
        fullText += e.chunk;
        contentDiv.style.color = "rgba(255,255,255,.6)";
        contentDiv.style.whiteSpace = "pre-wrap";
        contentDiv.style.lineHeight = "1.7";
        contentDiv.textContent = fullText;
      },
      step_done: () => {
        const btn = document.createElement("button");
        btn.className = "btn btn-w";
        btn.style.cssText = "width:100%;margin-top:12px";
        btn.textContent = "进入摘果子 →";
        btn.onclick = () => show("s8");
        s7el.appendChild(btn);
      },
    }
  );
}

// ─── S8：摘果子 ───────────────────────────────────────────────────────────────
let s8Started = false;

async function startHarvest() {
  if (!PROJECT_ID || !SESSION_ID) return;
  if (s8Started) return;
  s8Started = true;

  const s8el = document.getElementById("s8");
  if (!s8el) return;

  const header = s8el.querySelector(".sh");
  s8el.innerHTML = "";
  if (header) s8el.appendChild(header);

  const contentDiv = document.createElement("div");
  contentDiv.id = "s8-content";
  contentDiv.style.cssText = "font-size:11px;color:rgba(255,255,255,.3);padding:8px 0";
  contentDiv.textContent = "幕僚正在评价你…";
  s8el.appendChild(contentDiv);

  let harvestText = "";

  await streamSSE(
    `${API_BASE}/api/projects/${PROJECT_ID}/sessions/${SESSION_ID}/steps/harvest`,
    {},
    {
      persona_start: (e) => {
        const row = document.createElement("div");
        row.className = "scard";
        row.id = `hv-${escAttr(e.name)}`;
        row.innerHTML = `<div class="st">${escHtml(e.name)}</div><div class="sb" id="hvt-${escAttr(e.name)}"></div>`;
        contentDiv.appendChild(row);
      },
      persona_chunk: (e) => {
        const t = document.getElementById(`hvt-${e.name}`);
        if (t) t.textContent += e.chunk;
      },
      facilitator_chunk: (e) => {
        harvestText += e.chunk;
        let sumDiv = document.getElementById("s8-summary");
        if (!sumDiv) {
          sumDiv = document.createElement("div");
          sumDiv.id = "s8-summary";
          sumDiv.style.cssText = "margin-top:12px;font-size:11px;color:rgba(255,255,255,.5);white-space:pre-wrap;line-height:1.7";
          contentDiv.appendChild(sumDiv);
        }
        sumDiv.textContent = harvestText;
      },
      step_done: () => {
        const fin = document.createElement("div");
        fin.style.cssText = "margin-top:16px;text-align:center;font-size:11px;color:rgba(255,255,255,.3)";
        fin.textContent = "✓ 本次私董会圆满结束";
        contentDiv.appendChild(fin);
      },
    }
  );
}

// ─── 覆盖 show()：在步骤切换时触发 API ───────────────────────────────────────
const _origShow = window.show;
window.show = function (stepId) {
  _origShow(stepId);
  switch (stepId) {
    case "s2": startFacilitator(); break;
    case "s3": startFacts(); break;
    case "s4": startOpinions(); break;
    case "s5": startDimensions(); break;
    case "s6": startDebate(); break;
    case "s7": startSummary(); break;
    case "s8": startHarvest(); break;
  }
};

// ─── 初始化（api-bridge.js 在 </body> 前加载，DOM 已就绪）────────────────────
(function init() {
  // 替换 S1 的提交按钮 onclick
  const s1Btn = document.querySelector("#s1 .btn-w");
  if (s1Btn) s1Btn.setAttribute("onclick", "submitInput()");

  if (SESSION_ID) {
    // 已有 session：跳过 home，读取 session 状态后跳到对应步骤
    const home = document.getElementById("home");
    if (home) home.style.display = "none";
    resumeSession();
  } else {
    // 没有 session：跳回首页
    location.href = "/";
  }
})();

async function resumeSession() {
  try {
    const session = await fetch(
      `${API_BASE}/api/projects/${PROJECT_ID}/sessions/${SESSION_ID}`
    ).then(r => r.json());

    // currentStep: 0=原始输入已存 → 进s2; 1=define完成 → 进s3; 以此类推
    const stepMap = { 0: "s2", 1: "s3", 2: "s4", 3: "s5", 4: "s6", 5: "s7", 6: "s8", 7: "s8" };
    const targetStep = stepMap[session.currentStep] || "s2";
    show(targetStep);
  } catch {
    show("s2");
  }
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escAttr(s) {
  return String(s).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_");
}
