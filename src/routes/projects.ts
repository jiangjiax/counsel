/**
 * GET  /api/projects        — 列出所有项目
 * POST /api/projects        — 创建新项目 { name }
 * PATCH /api/projects/:id   — 更新项目名 { name }
 */

import type { IncomingMessage, ServerResponse } from "http";
import { listProjects, createProject, updateProjectName } from "../session/manager.js";
import { readBody, json, err } from "../utils/http.js";

export async function handleProjects(req: IncomingMessage, res: ServerResponse, projectId?: string) {
  if (req.method === "GET") {
    const projects = await listProjects();
    return json(res, projects);
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const { name } = JSON.parse(body);
    if (!name?.trim()) return err(res, 400, "name is required");
    const project = await createProject(name.trim());
    return json(res, project, 201);
  }

  if (req.method === "PATCH" && projectId) {
    const body = await readBody(req);
    const { name } = JSON.parse(body);
    if (!name?.trim()) return err(res, 400, "name is required");
    await updateProjectName(projectId, name.trim());
    return json(res, { ok: true });
  }

  err(res, 405, "Method Not Allowed");
}
