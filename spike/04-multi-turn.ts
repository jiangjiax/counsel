/**
 * Spike 4: 多轮对话（Facilitator）
 * 验证：跨 HTTP 请求保持 agent session，SSE 流式推送每轮回复
 *
 * 运行：npx tsx spike/04-multi-turn.ts
 * 测试：
 *   # 开启 session
 *   curl -N "http://localhost:3002/chat?sessionId=s1&msg=我最近很纠结，不知道要不要辞职创业"
 *   # 继续对话
 *   curl -N "http://localhost:3002/chat?sessionId=s1&msg=我现在有一些积蓄，但还没有具体的产品方向"
 *   curl -N "http://localhost:3002/chat?sessionId=s1&msg=我最担心的是失败后无法重新找到工作"
 */

import { createServer } from "http";
import { createAgent } from "@codeany/open-agent-sdk";
import type { Agent } from "@codeany/open-agent-sdk";

const PORT = 3002;

const FACILITATOR_PROMPT = `你是一个AI私董会的主持人（Facilitator）。

你的任务：通过2-4轮提问，帮助用户把模糊的困惑转化为清晰的、可辩论的议题。

规则：
- 每次只问一个问题，不要同时问多个
- 问题要聚焦：优先挖决策节点 > 核心张力 > 真实诉求
- 不提建议，不表达立场，只澄清和聚焦
- 当你认为议题已足够清晰，输出"【议题锁定】"并总结出1-3个核心议题

用中文回复。`;

// 进程内 session 存储：sessionId → Agent
const sessions = new Map<string, Agent>();

const server = createServer(async (req, res) => {
  if (!req.url?.startsWith("/chat")) {
    res.writeHead(404); res.end(); return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const sessionId = url.searchParams.get("sessionId");
  const msg = url.searchParams.get("msg");

  if (!sessionId || !msg) {
    res.writeHead(400); res.end("need sessionId and msg"); return;
  }

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // 复用或新建 agent
  let agent = sessions.get(sessionId);
  if (!agent) {
    console.log(`[${sessionId}] new session`);
    agent = createAgent({
      model: "claude-sonnet-4-6",
      systemPrompt: FACILITATOR_PROMPT,
      maxTurns: 5,
      allowedTools: [],
    });
    sessions.set(sessionId, agent);
  } else {
    console.log(`[${sessionId}] continuing (${agent.getMessages().length} messages so far)`);
  }

  try {
    for await (const event of agent.query(msg)) {
      const e = event as any;
      if (e.type === "assistant") {
        for (const block of e.message?.content || []) {
          if (block.type === "text" && block.text) {
            res.write(`data: ${JSON.stringify({ type: "chunk", chunk: block.text })}\n\n`);
          }
        }
      }
    }
    res.write(`data: ${JSON.stringify({ type: "done", turns: agent.getMessages().length })}\n\n`);
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
  }

  res.end();
});

server.listen(PORT, () => {
  console.log(`Facilitator server at http://localhost:${PORT}`);
  console.log(`\nTest sequence:`);
  console.log(`  curl -N "http://localhost:${PORT}/chat?sessionId=s1&msg=我最近很纠结，不知道要不要辞职创业"`);
  console.log(`  curl -N "http://localhost:${PORT}/chat?sessionId=s1&msg=我现在有一些积蓄，但还没有具体的产品方向"`);
  console.log(`  curl -N "http://localhost:${PORT}/chat?sessionId=s1&msg=我最担心的是失败后无法重新找到工作"`);
});
