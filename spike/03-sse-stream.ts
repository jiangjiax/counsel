/**
 * Spike 3: SSE 流式输出
 * 验证：HTTP server + SSE，12 个 agent 并行，chunk 实时推送给前端
 *
 * 运行：npx tsx spike/03-sse-stream.ts
 * 测试：curl -N http://localhost:3001/stream
 */

import { createServer } from "http";
import { createAgent } from "@codeany/open-agent-sdk";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../skills");
const PORT = 3001;

async function loadSkill(name: string) {
  return readFile(join(SKILLS_DIR, name, "SKILL.md"), "utf-8");
}

const PERSONAS = [
  { name: "乔布斯", skill: "steve-jobs-perspective" },
  { name: "PG",     skill: "paul-graham-perspective" },
  { name: "马斯克", skill: "elon-musk-perspective" },
  { name: "Naval",  skill: "naval-perspective" },
];

// SSE 事件格式（与正式产品保持一致）
type SSEEvent =
  | { type: "step_start" }
  | { type: "persona_start"; name: string }
  | { type: "persona_chunk"; name: string; chunk: string }
  | { type: "persona_done"; name: string }
  | { type: "step_done" }
  | { type: "error"; message: string };

function sendEvent(res: import("http").ServerResponse, event: SSEEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

const server = createServer(async (req, res) => {
  if (req.url !== "/stream") {
    res.writeHead(404);
    res.end();
    return;
  }

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const question = "要不要辞职去全职创业？100字以内，给出最核心的1个判断。";

  sendEvent(res, { type: "step_start" });

  try {
    await Promise.all(
      PERSONAS.map(async (persona) => {
        const skillPrompt = await loadSkill(persona.skill);
        const agent = createAgent({
          model: "claude-sonnet-4-6",
          maxTurns: 3,
          allowedTools: [],
        });

        sendEvent(res, { type: "persona_start", name: persona.name });

        for await (const event of agent.query(`${skillPrompt}\n\n---\n\n${question}`)) {
          const msg = event as any;
          if (msg.type === "assistant") {
            for (const block of msg.message?.content || []) {
              if (block.type === "text" && block.text) {
                sendEvent(res, { type: "persona_chunk", name: persona.name, chunk: block.text });
              }
            }
          }
        }

        sendEvent(res, { type: "persona_done", name: persona.name });
        await agent.close();
      })
    );

    sendEvent(res, { type: "step_done" });
  } catch (err: any) {
    sendEvent(res, { type: "error", message: err.message });
  }

  res.end();
});

server.listen(PORT, () => {
  console.log(`SSE server running at http://localhost:${PORT}/stream`);
  console.log(`Test: curl -N http://localhost:${PORT}/stream`);
});
