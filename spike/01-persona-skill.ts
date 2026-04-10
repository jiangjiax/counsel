/**
 * Spike 1: Persona Skill（修正版）
 * 验证：直接读项目 .claude/skills/ 里的 SKILL.md，作为 prompt 传给 agent
 *
 * 运行：npx tsx spike/01-persona-skill.ts
 */

import { createAgent } from "@codeany/open-agent-sdk";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../skills");

async function loadSkill(skillName: string): Promise<string> {
  const path = join(SKILLS_DIR, skillName, "SKILL.md");
  return readFile(path, "utf-8");
}

const question = "要不要辞职去全职创业？";
console.log("=== Spike 1: Persona Skill（读 SKILL.md）===\n");

for (const skillName of ["steve-jobs-perspective", "paul-graham-perspective"]) {
  console.log(`--- ${skillName} ---`);

  const skillPrompt = await loadSkill(skillName);

  const agent = createAgent({
    model: "claude-sonnet-4-6",
    maxTurns: 3,
    allowedTools: [],
  });

  for await (const event of agent.query(`${skillPrompt}\n\n---\n\n${question}`)) {
    const msg = event as any;
    if (msg.type === "assistant") {
      for (const block of msg.message?.content || []) {
        if (block.type === "text") process.stdout.write(block.text);
      }
    }
  }
  console.log("\n");

  await agent.close();
}

console.log("✅ Spike 1 完成");
