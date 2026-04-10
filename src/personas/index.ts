/**
 * 12 幕僚定义
 * 每个 persona 对应 skills/ 目录下的一个 SKILL.md
 */

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../skills");

export interface Persona {
  id: string;         // 用于文件名、API 标识
  name: string;       // 显示名
  emoji: string;
  skillDir: string;   // skills/ 下的目录名
  tagline: string;    // 简短描述
}

export const PERSONAS: Persona[] = [
  { id: "jobs",      name: "乔布斯",    emoji: "💼", skillDir: "steve-jobs-perspective",       tagline: "设计与远见" },
  { id: "pg",        name: "Paul Graham", emoji: "🧪", skillDir: "paul-graham-perspective",    tagline: "创业与真相" },
  { id: "musk",      name: "马斯克",    emoji: "⚡", skillDir: "elon-musk-perspective",         tagline: "第一性原理" },
  { id: "naval",     name: "Naval",     emoji: "🔮", skillDir: "naval-perspective",             tagline: "财富与哲学" },
  { id: "munger",    name: "芒格",      emoji: "🧠", skillDir: "munger-perspective",            tagline: "逆向思维" },
  { id: "feynman",   name: "费曼",      emoji: "🔬", skillDir: "feynman-perspective",           tagline: "第一原理解释" },
  { id: "taleb",     name: "塔勒布",    emoji: "🎲", skillDir: "taleb-perspective",             tagline: "反脆弱" },
  { id: "trump",     name: "特朗普",    emoji: "🏆", skillDir: "trump-perspective",             tagline: "谈判与交易" },
  { id: "karpathy",  name: "Karpathy",  emoji: "🤖", skillDir: "andrej-karpathy-perspective",  tagline: "AI 深度思考" },
  { id: "ilya",      name: "Ilya",      emoji: "🧬", skillDir: "ilya-sutskever-perspective",   tagline: "深度学习直觉" },
  { id: "mrbeast",   name: "MrBeast",   emoji: "🎬", skillDir: "mrbeast-perspective",          tagline: "极致增长" },
  { id: "zhang",     name: "张一鸣",    emoji: "📱", skillDir: "zhang-yiming-perspective",     tagline: "字节系思维" },
];

// 缓存已加载的 skill prompt
const skillCache = new Map<string, string>();

export async function loadSkillPrompt(persona: Persona): Promise<string> {
  if (skillCache.has(persona.id)) {
    return skillCache.get(persona.id)!;
  }

  const prompt = await readFile(
    join(SKILLS_DIR, persona.skillDir, "SKILL.md"),
    "utf-8"
  );

  skillCache.set(persona.id, prompt);
  return prompt;
}

export function getPersonaById(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}
