/**
 * 8步 SSE 路由处理器
 * POST /api/projects/:projectId/sessions/:sessionId/steps/:step
 */

import type { IncomingMessage, ServerResponse } from "http";
import { readBody, err, json } from "../utils/http.js";
import { sseHeaders, sendSSE } from "../utils/sse.js";
import {
  readStepFile,
  writeStepFile,
  writeOpinionFile,
  readAllOpinions,
  updateSessionStep,
  appendUserWiki,
} from "../session/manager.js";
import { chatWithFacilitator, deleteFacilitatorAgent } from "../agents/facilitator.js";
import { runPersona, runAllPersonas, runSelectedPersonas } from "../agents/persona-agent.js";
import { runSecretary } from "../agents/secretary.js";
import { PERSONAS } from "../personas/index.js";
import {
  factsUserPrompt, factsHistorySection,
  opinionsPrompt, dimensionsPrompt,
  debatePersonaPrompt, debateFacilitatorPrompt,
  summaryPrompt, harvestEvalPrompt, harvestTodoPrompt,
} from "../prompts.js";

export async function handleStep(
  req: IncomingMessage,
  res: ServerResponse,
  projectId: string,
  sessionId: string,
  step: string
) {
  if (req.method !== "POST") return err(res, 405, "Method Not Allowed");

  sseHeaders(res);
  sendSSE(res, { type: "step_start", step: stepNum(step) });

  try {
    switch (step) {
      case "define":    return await stepDefine(req, res, projectId, sessionId);
      case "facts":     return await stepFacts(req, res, projectId, sessionId);
      case "opinions":  return await stepOpinions(req, res, projectId, sessionId);
      case "dimensions":return await stepDimensions(req, res, projectId, sessionId);
      case "debate":    return await stepDebate(req, res, projectId, sessionId);
      case "complete":  return await stepComplete(req, res, projectId, sessionId);
      case "summary":   return await stepSummary(req, res, projectId, sessionId);
      case "harvest":   return await stepHarvest(req, res, projectId, sessionId);
      default: err(res, 404, `Unknown step: ${step}`);
    }
  } catch (e: any) {
    console.error('[step error]', e);
    sendSSE(res, { type: "error", message: e.message });
    res.end();
  }
}

// ─── Step 2: Facilitator 对话 ──────────────────────────────────────────────────
async function stepDefine(
  req: IncomingMessage, res: ServerResponse,
  projectId: string, sessionId: string
) {
  const body = await readBody(req);
  const { message, lock, conversation } = JSON.parse(body);

  const sessionKey = `${projectId}/${sessionId}`;

  if (lock) {
    // 用户点"锁定" — 写文件并结束
    const lockedContent = message || "（议题已锁定）";
    // 若有完整对话则存对话，否则只存主持人结论
    const fileContent = conversation || lockedContent;
    await writeStepFile(projectId, sessionId, "01-defined.md", fileContent);
    await updateSessionStep(projectId, sessionId, 1, "done");
    deleteFacilitatorAgent(sessionKey);
    sendSSE(res, { type: "step_done", step: 2 });
    res.end();
    return;
  }

  if (!message?.trim()) {
    // 首次进入：用原始输入启动 Facilitator
    const rawInput = await readStepFile(projectId, sessionId, "00-raw-input.md");
    if (!rawInput) {
      sendSSE(res, { type: "error", message: "No input found" });
      res.end();
      return;
    }
    const reply = await chatWithFacilitator(sessionKey, rawInput, res);
    sendSSE(res, { type: "step_done", step: 2 });
    res.end();
    return;
  }

  await chatWithFacilitator(sessionKey, message, res);
  sendSSE(res, { type: "step_done", step: 2 });
  res.end();
}

// ─── Step 3: 挖事实（逐一问答模式）──────────────────────────────────────────
async function stepFacts(
  req: IncomingMessage, res: ServerResponse,
  projectId: string, sessionId: string
) {
  const body = await readBody(req);
  const parsed = JSON.parse(body || "{}");

  // POST with answers — 写答案文件，结束本步
  if (parsed.answers !== undefined) {
    await writeStepFile(projectId, sessionId, "02-facts-answers.md", parsed.answers);
    await updateSessionStep(projectId, sessionId, 2, "done");
    sendSSE(res, { type: "step_done", step: 3 });
    res.end();
    return;
  }

  // 生成单个幕僚的问题（逐一模式）
  // parsed.personaIndex: 当前要问的幕僚索引（0-based）
  // parsed.previousQA: 之前的问答历史字符串
  const personaIndex: number = parsed.personaIndex ?? 0;
  const previousQA: string = parsed.previousQA ?? "";

  const rawInput = await readStepFile(projectId, sessionId, "00-raw-input.md") ?? "";
  const defined = await readStepFile(projectId, sessionId, "01-defined.md") ?? "";

  const persona = PERSONAS[personaIndex];
  if (!persona) {
    sendSSE(res, { type: "step_done", step: 3 });
    res.end();
    return;
  }

  const historySection = factsHistorySection(previousQA);

  const prompt = factsUserPrompt(rawInput, defined, historySection);

  await runPersona(persona.id, prompt, res);

  sendSSE(res, { type: "step_done", step: 3 });
  res.end();
}

// ─── Step 4: 独立发言（12幕僚并行）──────────────────────────────────────────
async function stepOpinions(
  req: IncomingMessage, res: ServerResponse,
  projectId: string, sessionId: string
) {
  // 缓存：已生成则直接返回
  const cached = await readAllOpinions(projectId, sessionId);
  if (Object.keys(cached).length > 0) {
    for (const [name, text] of Object.entries(cached)) {
      sendSSE(res, { type: "persona_start", name });
      sendSSE(res, { type: "persona_chunk", name, chunk: text });
      sendSSE(res, { type: "persona_done", name });
    }
    sendSSE(res, { type: "step_done", step: 4 });
    res.end();
    return;
  }

  const rawInput = await readStepFile(projectId, sessionId, "00-raw-input.md") ?? "";
  const defined = await readStepFile(projectId, sessionId, "01-defined.md") ?? "";
  const answers = await readStepFile(projectId, sessionId, "02-facts-answers.md") ?? "（案主未提供事实信息）";

  const prompt = opinionsPrompt(rawInput, defined, answers);

  const results = await runAllPersonas(prompt, res);

  // 写每个幕僚的意见文件
  for (const [personaId, text] of Object.entries(results)) {
    const persona = PERSONAS.find(p => p.id === personaId);
    if (persona) await writeOpinionFile(projectId, sessionId, persona.name, text);
  }

  await updateSessionStep(projectId, sessionId, 3, "done");
  sendSSE(res, { type: "step_done", step: 4 });
  res.end();
}

// ─── Step 5: 拆维度 ────────────────────────────────────────────────────────────
async function stepDimensions(
  _req: IncomingMessage, res: ServerResponse,
  projectId: string, sessionId: string
) {
  // 缓存：已生成则直接返回
  const cached = await readStepFile(projectId, sessionId, "04-dimensions.md");
  if (cached) {
    sendSSE(res, { type: "facilitator_chunk", chunk: cached });
    sendSSE(res, { type: "facilitator_done" });
    sendSSE(res, { type: "step_done", step: 5 });
    res.end();
    return;
  }

  console.log("test1")

  const opinions = await readAllOpinions(projectId, sessionId);
  console.log('[dimensions] opinions keys:', Object.keys(opinions));
  const opinionsText = Object.entries(opinions)
    .map(([name, text]) => `### ${name}\n${text}`)
    .join("\n\n");
  console.log('[dimensions] opinionsText length:', opinionsText.length);

  const prompt = dimensionsPrompt(opinionsText);

  const text = await runSecretary(prompt, res);
  await writeStepFile(projectId, sessionId, "04-dimensions.md", text);
  await updateSessionStep(projectId, sessionId, 4, "done");
  sendSSE(res, { type: "step_done", step: 5 });
  res.end();
}

// ─── Step 6: 辩论（按维度逐一辩论）──────────────────────────────────────────
async function stepDebate(
  req: IncomingMessage, res: ServerResponse,
  projectId: string, sessionId: string
) {
  const body = await readBody(req);
  const { dimensions = [] } = JSON.parse(body || "{}");

  // 缓存：已生成且无新维度传入则直接返回
  const cached = await readStepFile(projectId, sessionId, "05-debate.md");
  if (cached && dimensions.length === 0) {
    sendSSE(res, { type: "facilitator_chunk", chunk: cached });
    sendSSE(res, { type: "facilitator_done" });
    sendSSE(res, { type: "step_done", step: 6 });
    res.end();
    return;
  }

  // 持久化用户选择的维度
  if (dimensions.length > 0) {
    await writeStepFile(projectId, sessionId, "04-selected-dimensions.md", dimensions.join("\n"));
  }

  const defined = await readStepFile(projectId, sessionId, "01-defined.md") ?? "";
  const answers = await readStepFile(projectId, sessionId, "02-facts-answers.md") ?? "";

  // 若本次未传维度，尝试从文件读取之前的选择
  let effectiveDimensions: string[] = dimensions;
  if (effectiveDimensions.length === 0) {
    const saved = await readStepFile(projectId, sessionId, "04-selected-dimensions.md");
    if (saved?.trim()) {
      effectiveDimensions = saved.trim().split("\n").filter(Boolean);
    }
  }
  if (effectiveDimensions.length === 0) effectiveDimensions = ["核心议题"];

  const allDebateSections: string[] = [];

  // 针对每个维度，让所有幕僚发言，再由主持人提炼
  for (const dim of effectiveDimensions) {
    // 通知前端当前维度开始
    sendSSE(res, { type: "step_start", step: -1, data: { dimension: dim } } as any);

    const prompt = debatePersonaPrompt(defined, answers, dim);

    const results = await runAllPersonas(prompt, res);

    const allPositions = Object.entries(results)
      .map(([id, text]) => {
        const persona = PERSONAS.find(p => p.id === id);
        return `### ${persona?.name ?? id}\n${text}`;
      }).join("\n\n");

    const facilitatorPrompt = debateFacilitatorPrompt(dim, allPositions);
    const dimSummary = await runSecretary(facilitatorPrompt, res);

    allDebateSections.push(`## 维度：${dim}\n\n### 幕僚发言\n\n${allPositions}\n\n### 主持人提炼\n\n${dimSummary}`);
  }

  const debateContent = `# 辩论记录\n\n${allDebateSections.join("\n\n---\n\n")}`;
  await writeStepFile(projectId, sessionId, "05-debate.md", debateContent);
  await updateSessionStep(projectId, sessionId, 5, "done");
  sendSSE(res, { type: "step_done", step: 6 });
  res.end();
}

// ─── Step 7: 汇总 ─────────────────────────────────────────────────────────────
async function stepSummary(
  req: IncomingMessage, res: ServerResponse,
  projectId: string, sessionId: string
) {
  // 缓存：已生成则直接返回
  const cached = await readStepFile(projectId, sessionId, "06-summary.md");
  if (cached) {
    sendSSE(res, { type: "facilitator_chunk", chunk: cached });
    sendSSE(res, { type: "facilitator_done" });
    sendSSE(res, { type: "step_done", step: 7 });
    res.end();
    return;
  }

  const rawInput = await readStepFile(projectId, sessionId, "00-raw-input.md") ?? "";
  const defined = await readStepFile(projectId, sessionId, "01-defined.md") ?? "";
  const answers = await readStepFile(projectId, sessionId, "02-facts-answers.md") ?? "";
  const debate = await readStepFile(projectId, sessionId, "05-debate.md") ?? "";

  const prompt = summaryPrompt(rawInput, defined, answers, debate);

  const secretaryText = await runSecretary(prompt, res);

  await writeStepFile(projectId, sessionId, "06-summary.md", secretaryText);
  await updateSessionStep(projectId, sessionId, 6, "done");
  sendSSE(res, { type: "step_done", step: 7 });
  res.end();
}

// ─── Step 8: 摘果子 ───────────────────────────────────────────────────────────
async function stepHarvest(
  req: IncomingMessage, res: ServerResponse,
  projectId: string, sessionId: string
) {
  const body = await readBody(req);
  const { personaIds } = JSON.parse(body || "{}");

  // 缓存：已生成且未指定新 personaIds 则直接返回
  const cachedHarvest = await readStepFile(projectId, sessionId, "07-harvest.md");
  if (cachedHarvest && !personaIds?.length) {
    // 解析幕僚评价部分（## 幕僚评价 和 ## 秘书整理 之间）
    const evalsSection = cachedHarvest.match(/## 幕僚评价\n\n([\s\S]*?)(?=\n## 秘书整理|$)/)?.[1] ?? "";
    const evalBlocks = evalsSection.split(/\n(?=### )/);
    for (const block of evalBlocks) {
      const m = block.match(/^### (.+?)\n([\s\S]*)$/);
      if (!m) continue;
      const [, name, text] = m;
      sendSSE(res, { type: "persona_start", name });
      sendSSE(res, { type: "persona_chunk", name, chunk: text.trim() });
      sendSSE(res, { type: "persona_done", name });
    }
    // 秘书整理部分
    const secretarySection = cachedHarvest.match(/## 秘书整理\n\n([\s\S]*)$/)?.[1] ?? "";
    if (secretarySection) {
      sendSSE(res, { type: "facilitator_chunk", chunk: secretarySection.trim() });
      sendSSE(res, { type: "facilitator_done" });
    }
    sendSSE(res, { type: "step_done", step: 8 });
    res.end();
    return;
  }

  const rawInput = await readStepFile(projectId, sessionId, "00-raw-input.md") ?? "";
  const summary = await readStepFile(projectId, sessionId, "06-summary.md") ?? "";

  // 3-5个幕僚评价案主
  const selectedIds: string[] = personaIds?.length > 0
    ? personaIds.slice(0, 5)
    : PERSONAS.slice(0, 4).map(p => p.id);

  const evalPrompt = harvestEvalPrompt(rawInput, summary);

  const evals = await runSelectedPersonas(selectedIds, evalPrompt, res);

  // 构建评价数据（供前端展示）
  const evalsData = selectedIds.map(id => {
    const p = PERSONAS.find(x => x.id === id);
    return { id, name: p?.name ?? id, emoji: p?.emoji ?? "🎙️", text: evals[id] ?? "" };
  });

  const evalsText = evalsData
    .map(e => `### ${e.name}\n${e.text}`)
    .join("\n\n");

  // Secretary 提取 to-do 和 user wiki
  const todoPrompt = harvestTodoPrompt(evalsText, summary);
  const harvestText = await runSecretary(todoPrompt, res);

  const fullHarvest = `# 摘果子\n\n## 幕僚评价\n\n${evalsText}\n\n## 秘书整理\n\n${harvestText}`;
  await writeStepFile(projectId, sessionId, "07-harvest.md", fullHarvest);

  await updateSessionStep(projectId, sessionId, 7, "done");
  sendSSE(res, { type: "step_done", step: 8, data: { evals: evalsData } });
  res.end();
}

// ─── 工具 ──────────────────────────────────────────────────────────────────────
function stepNum(step: string): number {
  const map: Record<string, number> = {
    define: 2, facts: 3, opinions: 4,
    dimensions: 5, debate: 6, summary: 7, harvest: 8, complete: 8,
  };
  return map[step] ?? 0;
}

// ─── Step 8 完成：写 user-wiki ────────────────────────────────────────────────
export async function stepComplete(
  req: IncomingMessage, res: ServerResponse,
  projectId: string, sessionId: string
) {
  const body = await readBody(req);
  const { reflection = "", checkedTodos = [] } = JSON.parse(body || "{}");

  // 读取本次摘果子内容，取出 secretary 整理的 todo 部分
  const harvest = await readStepFile(projectId, sessionId, "07-harvest.md") ?? "";
  const secretarySection = harvest.match(/## 秘书整理\n\n([\s\S]*)$/)?.[1] ?? "";

  // 提取 todo 列表
  const todoLines = secretarySection
    .split("\n")
    .filter(line => line.match(/^[-*]\s+/));
  const todosText = todoLines.join("\n");

  // 拼接写入 wiki 的内容
  const wikiContent = `## 案主心得\n${reflection}\n\n## To-Do 清单\n${todosText}\n\n## 已完成\n${checkedTodos.map((t: string) => `- [x] ${t}`).join("\n")}`;

  await appendUserWiki(projectId, sessionId, wikiContent);

  json(res, { ok: true });
}
