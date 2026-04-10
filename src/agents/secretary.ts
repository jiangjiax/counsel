/**
 * Secretary Agent
 * 用途：Step 7（汇总）、Step 8（摘果子 / to-do 提取）
 *
 * 读取 session 文件内容后生成结构化输出，单轮调用无状态。
 */

import { createAgent } from "@codeany/open-agent-sdk";
import type { ServerResponse } from "http";
import { sendSSE } from "../utils/sse.js";
import { getModel } from "../utils/model.js";

const SECRETARY_SYSTEM_PROMPT = `你是「参谋·私董会」的秘书（Secretary）。

你的任务：把一场高质量的智识讨论，提炼成可执行的行动清单。

风格：精准、简洁、结构清晰。不加废话。

## Step 7：总结
给出结构化汇总：
1. **核心张力**（1句话）
2. **关键洞见**（3-5条，每条1-2句）
3. **争议焦点**（最核心的2-3个分歧）
4. **建议行动**（3-5条，可执行）

## Step 8：摘果子
1. **对案主的评价**（优点 / 盲区各2-3点）
2. **To-Do 清单**（格式：[ ] 具体行动，不超过7条）
3. **User Wiki 更新**（对案主的新认知，1-3条）

用中文，输出直接不废话。`;

export async function runSecretary(
  prompt: string,
  res: ServerResponse
): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const agent = createAgent({
      model: getModel(),
      systemPrompt: SECRETARY_SYSTEM_PROMPT,
      maxTurns: 3,
      allowedTools: [],
    });

    let fullText = "";

    for await (const event of agent.query(prompt)) {
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

    if (fullText) {
      sendSSE(res, { type: "facilitator_done" });
      return fullText;
    }

    console.warn(`[secretary] attempt ${attempt} returned empty, retrying...`);
    if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
  }

  sendSSE(res, { type: "facilitator_done" });
  return "";
}
