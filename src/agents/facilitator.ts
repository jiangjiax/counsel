/**
 * Facilitator Agent
 * 用途：Step 2（问题定义）、Step 5（拆维度）、Step 6（辩论主持）、Step 7（汇总主持）
 *
 * 每次"对话轮次"（Step 2）复用同一个 Agent 实例保持上下文；
 * 其余 Step 每次创建新实例做单轮调用。
 */

import { createAgent } from "@codeany/open-agent-sdk";
import type { Agent } from "@codeany/open-agent-sdk";
import type { ServerResponse } from "http";
import { sendSSE } from "../utils/sse.js";
import { getModel } from "../utils/model.js";

// ─── 系统提示词 ────────────────────────────────────────────────────────────────

const FACILITATOR_SYSTEM_PROMPT = `你是「参谋·私董会」的主持人（Facilitator）。

你的风格：简洁、犀利、不废话。每次只做一件事。

## Step 2：问题定义
- 目标：通过 2-4 轮提问，把模糊困惑转化为清晰可辩论的核心议题
- 规则：每次只问一个问题，优先挖"决策节点 > 核心张力 > 真实诉求"
- 不提建议，不表达立场，只澄清和聚焦
- 当你认为议题已足够清晰，输出「【议题锁定】」并总结出 1-3 个核心议题

## Step 5：拆维度
- 读取12份幕僚意见，提炼 3-6 个核心冲突维度
- 每个维度格式：**维度名**：正方观点 vs 反方观点
- 最后列出建议辩论的前3个维度

## Step 6：辩论主持
- 对每个维度，综合各幕僚发言，提炼"核心冲突点"
- 输出格式：核心矛盾 | 正方核心论点 | 反方核心论点

## Step 7：汇总
- 综合全程信息，生成结构化总结
- 格式：情境 → 核心张力 → 各方立场 → 关键洞见 → 建议行动

用中文回复，简洁直接。`;

// ─── 多轮对话（Step 2 专用）────────────────────────────────────────────────────

// 每个 session 对应一个 Facilitator Agent 实例（保持对话上下文）
const facilitatorSessions = new Map<string, Agent>();

export function getFacilitatorAgent(sessionKey: string): Agent {
  let agent = facilitatorSessions.get(sessionKey);
  if (!agent) {
    agent = createAgent({
      model: getModel(),
      systemPrompt: FACILITATOR_SYSTEM_PROMPT,
      maxTurns: 20,
      allowedTools: [],
    });
    facilitatorSessions.set(sessionKey, agent);
  }
  return agent;
}

export function deleteFacilitatorAgent(sessionKey: string) {
  facilitatorSessions.delete(sessionKey);
}

// ─── 单轮调用（Step 5/6/7 专用）──────────────────────────────────────────────

export async function runFacilitator(
  prompt: string,
  res: ServerResponse
): Promise<string> {
  const agent = createAgent({
    model: "claude-sonnet-4-6",
    systemPrompt: FACILITATOR_SYSTEM_PROMPT,
    maxTurns: 3,
    allowedTools: [],
  });

  let fullText = "";

  for await (const event of agent.query(prompt)) {
    const e = event as any;
    console.log('[facilitator] event type:', e.type, e.subtype ?? '');
    if (e.type === 'result') console.log('[facilitator] result detail:', JSON.stringify(e));
    if (e.type === 'system' && e.subtype === 'status') console.log('[facilitator] status:', e.message);
    if (e.type === "assistant") {
      const text = e.message?.content
        ?.filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("") ?? "";
      if (text) {
        fullText += text;
        sendSSE(res, { type: "facilitator_chunk", chunk: text });
      }
    }
  }

  sendSSE(res, { type: "facilitator_done" });
  return fullText;
}

// ─── Step 2 流式对话 ──────────────────────────────────────────────────────────

export async function chatWithFacilitator(
  sessionKey: string,
  userMessage: string,
  res: ServerResponse
): Promise<string> {
  const agent = getFacilitatorAgent(sessionKey);
  let fullText = "";

  for await (const event of agent.query(userMessage)) {
    const e = event as any;
    if (e.type === "assistant") {
      const text = e.message?.content
        ?.filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("") ?? "";
      if (text) {
        fullText += text;
        sendSSE(res, { type: "facilitator_chunk", chunk: text });
      }
    }
  }

  sendSSE(res, { type: "facilitator_done" });
  return fullText;
}
