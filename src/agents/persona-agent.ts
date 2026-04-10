/**
 * Persona Agent 工厂
 * 用途：Step 3（挖事实）、Step 4（独立发言）、Step 6（辩论发言）、Step 8（摘果子评价）
 *
 * 每个幕僚每次调用都是独立无状态的新 Agent 实例。
 */

import { createAgent } from "@codeany/open-agent-sdk";
import type { ServerResponse } from "http";
import { PERSONAS, loadSkillPrompt } from "../personas/index.js";
import { sendSSE } from "../utils/sse.js";
import { getModel } from "../utils/model.js";

// ─── 单个幕僚发言（流式）─────────────────────────────────────────────────────

export async function runPersona(
  personaId: string,
  prompt: string,
  res: ServerResponse
): Promise<string> {
  const persona = PERSONAS.find((p) => p.id === personaId);
  if (!persona) throw new Error(`Unknown persona: ${personaId}`);

  const skillPrompt = await loadSkillPrompt(persona);
  const agent = createAgent({
    model: getModel(),
    maxTurns: 3,
    allowedTools: [],
  });

  sendSSE(res, { type: "persona_start", name: persona.name });

  let fullText = "";

  for await (const event of agent.query(`${skillPrompt}\n\n---\n\n${prompt}`)) {
    const e = event as any;
    if (e.type === "assistant") {
      const text = e.message?.content
        ?.filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("") ?? "";
      if (text) {
        fullText += text;
        sendSSE(res, { type: "persona_chunk", name: persona.name, chunk: text });
      }
    }
  }

  sendSSE(res, { type: "persona_done", name: persona.name });
  return fullText;
}

// ─── 12 个幕僚并行发言（Promise.all）─────────────────────────────────────────

export async function runAllPersonas(
  prompt: string,
  res: ServerResponse
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  await Promise.all(
    PERSONAS.map(async (persona) => {
      const text = await runPersona(persona.id, prompt, res);
      results[persona.id] = text;
    })
  );

  return results;
}

// ─── 指定幕僚子集并行（辩论/摘果子用）───────────────────────────────────────

export async function runSelectedPersonas(
  personaIds: string[],
  prompt: string,
  res: ServerResponse
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  await Promise.all(
    personaIds.map(async (id) => {
      const text = await runPersona(id, prompt, res);
      results[id] = text;
    })
  );

  return results;
}
