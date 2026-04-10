/**
 * GET  /api/projects/:projectId/sessions        — 列出项目的所有 session
 * POST /api/projects/:projectId/sessions        — 创建新 session（带初始输入）
 * GET  /api/projects/:projectId/sessions/:id    — 获取单个 session 详情
 */

import type { IncomingMessage, ServerResponse } from "http";
import {
  listSessions,
  createSession,
  readSession,
  writeStepFile,
  updateSessionStep,
} from "../session/manager.js";
import { readBody, json, err } from "../utils/http.js";

export async function handleSessions(
  req: IncomingMessage,
  res: ServerResponse,
  projectId: string,
  sessionId?: string
) {
  // GET /api/projects/:projectId/sessions/:id
  if (sessionId && req.method === "GET") {
    const session = await readSession(projectId, sessionId);
    if (!session) return err(res, 404, "Session not found");
    return json(res, session);
  }

  // GET /api/projects/:projectId/sessions
  if (!sessionId && req.method === "GET") {
    const sessions = await listSessions(projectId);
    return json(res, sessions);
  }

  // POST /api/projects/:projectId/sessions — 创建 session 并写入原始输入
  if (!sessionId && req.method === "POST") {
    const body = await readBody(req);
    const { input } = JSON.parse(body);
    if (!input?.trim()) return err(res, 400, "input is required");

    const session = await createSession(projectId);

    // 写入 Step 0 文件
    await writeStepFile(projectId, session.id, "00-raw-input.md", input.trim());
    await updateSessionStep(projectId, session.id, 0, "done");

    return json(res, session, 201);
  }

  err(res, 405, "Method Not Allowed");
}
