/**
 * 测试「定义问题」step（stepDefine）的核心逻辑
 * 运行：npx tsx test-define.ts
 */

import { createAgent } from "@codeany/open-agent-sdk";

const FACILITATOR_SYSTEM_PROMPT = `你是「参谋·私董会」的主持人（Facilitator）。

你的风格：简洁、犀利、不废话。每次只做一件事。

## Step 2：问题定义
- 目标：通过 2-4 轮提问，把模糊困惑转化为清晰可辩论的核心议题
- 规则：每次只问一个问题，优先挖"决策节点 > 核心张力 > 真实诉求"
- 不提建议，不表达立场，只澄清和聚焦
- 当你认为议题已足够清晰，输出「【议题锁定】」并总结出 1-3 个核心议题

用中文回复，简洁直接。`;

const RAW_INPUT = `我是一个创业公司 CEO，团队有 15 人，融了天使轮。
最近发现几个核心员工在私下讨论要不要一起出去创业，
我不知道该不该主动找他们谈，还是假装不知道继续观察。`;

console.log("=== 测试：定义问题（stepDefine）===\n");
console.log("[input]", RAW_INPUT);
console.log("\n--- Facilitator 输出开始 ---\n");

const agent = createAgent({
  model: "claude-sonnet-4-6",
  systemPrompt: FACILITATOR_SYSTEM_PROMPT,
  maxTurns: 3,
  allowedTools: [],
});

let fullText = "";

for await (const event of agent.query(RAW_INPUT)) {
  const e = event as any;
  console.log("[event]", e.type, e.subtype ?? "");
  if (e.type === "assistant") {
    const text = e.message?.content
      ?.filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("") ?? "";
    if (text) {
      fullText += text;
      process.stdout.write(text);
    }
  }
}

console.log("\n--- Facilitator 输出结束 ---\n");
console.log("[done] 输出长度:", fullText.length);

if (!fullText) {
  console.error("[ERROR] Facilitator 返回空内容");
  process.exit(1);
}
