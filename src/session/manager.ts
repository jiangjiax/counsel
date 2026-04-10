/**
 * Session Manager — 本地文件系统读写
 * 路径约定：sessions/[projectId]/session-[N]/
 */

import { readFile, writeFile, mkdir, readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import type { Project, Session } from "./types.js";

const SESSIONS_ROOT = join(process.cwd(), "sessions");

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

function sessionDir(projectId: string, sessionId: string) {
  return join(SESSIONS_ROOT, projectId, sessionId);
}

function projectDir(projectId: string) {
  return join(SESSIONS_ROOT, projectId);
}

// ─── Project ──────────────────────────────────────────────────────────────────

export async function listProjects(): Promise<Project[]> {
  await ensureDir(SESSIONS_ROOT);
  const entries = await readdir(SESSIONS_ROOT, { withFileTypes: true });
  const projects: Project[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectId = entry.name;
    const sessions = await listSessions(projectId);
    const latest = sessions.at(-1) ?? null;

    const meta = await readProjectMeta(projectId);
    projects.push({
      id: projectId,
      name: meta?.name ?? projectId,
      createdAt: meta?.createdAt ?? new Date().toISOString(),
      sessionCount: sessions.length,
      latestSessionId: latest?.id ?? null,
      latestStep: latest?.currentStep ?? 0,
    });
  }

  return projects.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function updateProjectName(projectId: string, name: string): Promise<void> {
  const dir = projectDir(projectId);
  const metaPath = join(dir, "meta.json");
  const meta = await readProjectMeta(projectId) ?? { createdAt: new Date().toISOString() };
  await writeFile(metaPath, JSON.stringify({ ...meta, name }, null, 2));
}

export async function createProject(name: string): Promise<Project> {
  const projectId = slugify(name);
  const dir = projectDir(projectId);
  await ensureDir(dir);

  const project: Project = {
    id: projectId,
    name,
    createdAt: new Date().toISOString(),
    sessionCount: 0,
    latestSessionId: null,
    latestStep: 0,
  };

  await writeFile(join(dir, "meta.json"), JSON.stringify(project, null, 2));
  return project;
}

async function readProjectMeta(projectId: string): Promise<{ name: string; createdAt: string } | null> {
  const metaPath = join(projectDir(projectId), "meta.json");
  if (!existsSync(metaPath)) return null;
  try {
    const raw = await readFile(metaPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── Session ──────────────────────────────────────────────────────────────────

export async function listSessions(projectId: string): Promise<Session[]> {
  const dir = projectDir(projectId);
  if (!existsSync(dir)) return [];

  const entries = await readdir(dir, { withFileTypes: true });
  const sessions: Session[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("session-")) continue;
    const session = await readSession(projectId, entry.name);
    if (session) sessions.push(session);
  }

  return sessions.sort((a, b) => a.id.localeCompare(b.id));
}

export async function createSession(projectId: string): Promise<Session> {
  const existing = await listSessions(projectId);
  const n = existing.length + 1;
  const sessionId = `session-${n}`;
  const dir = sessionDir(projectId, sessionId);
  await ensureDir(dir);
  await ensureDir(join(dir, "03-opinions"));

  const session: Session = {
    id: sessionId,
    projectId,
    createdAt: new Date().toISOString(),
    currentStep: 0,
    steps: Array(9).fill("pending") as any,
  };

  await writeSessionMeta(projectId, sessionId, session);
  return session;
}

export async function readSession(projectId: string, sessionId: string): Promise<Session | null> {
  const metaPath = join(sessionDir(projectId, sessionId), "session.json");
  if (!existsSync(metaPath)) return null;
  try {
    const raw = await readFile(metaPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function updateSessionStep(
  projectId: string,
  sessionId: string,
  step: number,
  status: "in_progress" | "done"
) {
  const session = await readSession(projectId, sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  session.steps[step] = status;
  if (status === "done" && step >= session.currentStep) {
    session.currentStep = step + 1;
  }

  await writeSessionMeta(projectId, sessionId, session);
  return session;
}

async function writeSessionMeta(projectId: string, sessionId: string, session: Session) {
  const dir = sessionDir(projectId, sessionId);
  await writeFile(join(dir, "session.json"), JSON.stringify(session, null, 2));
}

// ─── 文件读写 ─────────────────────────────────────────────────────────────────

export async function writeStepFile(
  projectId: string,
  sessionId: string,
  filename: string,
  content: string
) {
  const dir = sessionDir(projectId, sessionId);
  await writeFile(join(dir, filename), content, "utf-8");
}

export async function readStepFile(
  projectId: string,
  sessionId: string,
  filename: string
): Promise<string | null> {
  const path = join(sessionDir(projectId, sessionId), filename);
  if (!existsSync(path)) return null;
  return readFile(path, "utf-8");
}

// ─── User Wiki（持久增长）──────────────────────────────────────────────────────

const USER_WIKI_FILENAME = "user-wiki.md";

export async function readUserWiki(projectId: string): Promise<string | null> {
  const path = join(projectDir(projectId), USER_WIKI_FILENAME);
  if (!existsSync(path)) return null;
  return readFile(path, "utf-8");
}

export async function appendUserWiki(projectId: string, sessionId: string, newContent: string): Promise<void> {
  const path = join(projectDir(projectId), USER_WIKI_FILENAME);
  const existing = existsSync(path) ? await readFile(path, "utf-8") : "";

  const timestamp = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  const section = `\n\n─── Session ${sessionId} · ${timestamp} ───\n\n${newContent.trim()}\n`;

  await writeFile(path, existing + section, "utf-8");
}

export async function writeOpinionFile(
  projectId: string,
  sessionId: string,
  personaName: string,
  content: string
) {
  const dir = join(sessionDir(projectId, sessionId), "03-opinions");
  await ensureDir(dir);
  await writeFile(join(dir, `${personaName}.md`), content, "utf-8");
}

export async function readAllOpinions(
  projectId: string,
  sessionId: string
): Promise<Record<string, string>> {
  const dir = join(sessionDir(projectId, sessionId), "03-opinions");
  if (!existsSync(dir)) return {};

  const files = await readdir(dir);
  const opinions: Record<string, string> = {};

  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const name = file.replace(".md", "");
    opinions[name] = await readFile(join(dir, file), "utf-8");
  }

  return opinions;
}

// ─── 工具 ─────────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s\u4e00-\u9fa5]+/g, "-")  // 中文/空格 → -
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || `project-${Date.now()}`;
}
