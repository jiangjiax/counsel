/**
 * Spike 2: 12 幕僚并行
 * 验证：Promise.all 并行调用所有 skill，记录各自完成时间 vs 总耗时
 *
 * 运行：npx tsx spike/02-parallel.ts
 */

import { createAgent } from "@codeany/open-agent-sdk";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../.claude/skills");

async function loadSkill(skillName: string): Promise<string> {
  return readFile(join(SKILLS_DIR, skillName, "SKILL.md"), "utf-8");
}

// 用项目里现有的 12 个 skill
const PERSONAS = [
  { name: "乔布斯",      skill: "steve-jobs-perspective" },
  { name: "PG",          skill: "paul-graham-perspective" },
  { name: "马斯克",      skill: "elon-musk-perspective" },
  { name: "Naval",       skill: "naval-perspective" },
  { name: "芒格",        skill: "munger-perspective" },
  { name: "费曼",        skill: "feynman-perspective" },
  { name: "塔勒布",      skill: "taleb-perspective" },
  { name: "张一鸣",      skill: "zhang-yiming-perspective" },
  { name: "卡帕西",      skill: "andrej-karpathy-perspective" },
  { name: "苏茨克维",    skill: "ilya-sutskever-perspective" },
  { name: "MrBeast",    skill: "mrbeast-perspective" },
  { name: "Trump",      skill: "trump-perspective" },
];

const question = "要不要辞职去全职创业？请用100字以内给出你最核心的1个判断。";

console.log("=== Spike 2: 12 幕僚并行 ===");
console.log(`问题：${question}\n`);

const startTotal = Date.now();

const results = await Promise.all(
  PERSONAS.map(async (persona) => {
    const t0 = Date.now();
    const skillPrompt = await loadSkill(persona.skill);

    const agent = createAgent({
      model: "claude-sonnet-4-6",
      maxTurns: 3,
      allowedTools: [],
    });

    let text = "";
    for await (const event of agent.query(`${skillPrompt}\n\n---\n\n${question}`)) {
      const msg = event as any;
      if (msg.type === "assistant") {
        for (const block of msg.message?.content || []) {
          if (block.type === "text") text += block.text;
        }
      }
    }

    await agent.close();
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    return { name: persona.name, text: text.trim(), elapsed };
  })
);

const totalElapsed = ((Date.now() - startTotal) / 1000).toFixed(1);
const sumElapsed = results.reduce((s, r) => s + parseFloat(r.elapsed), 0).toFixed(1);

for (const r of results) {
  console.log(`--- ${r.name} (${r.elapsed}s) ---`);
  console.log(r.text.slice(0, 120) + (r.text.length > 120 ? "..." : ""));
  console.log();
}

console.log(`并行总耗时: ${totalElapsed}s`);
console.log(`串行估计:   ${sumElapsed}s`);
console.log(`加速比:     ${(parseFloat(sumElapsed) / parseFloat(totalElapsed)).toFixed(1)}x`);
console.log("\n✅ Spike 2 完成");
