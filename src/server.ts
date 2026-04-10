/**
 * 主 HTTP 服务器
 * 端口：3000（默认）
 *
 * 路由表：
 *   GET  /                                              → index.html
 *   GET  /session.html                                  → session.html (TBD)
 *   GET  /api/personas                                  → 返回12幕僚列表
 *   GET  /api/projects                                  → listProjects
 *   POST /api/projects                                  → createProject
 *   GET  /api/projects/:pid/sessions                    → listSessions
 *   POST /api/projects/:pid/sessions                    → createSession + step0
 *   GET  /api/projects/:pid/sessions/:sid               → readSession
 *   POST /api/projects/:pid/sessions/:sid/steps/:step   → SSE step handler
 */

import 'dotenv/config';

import { createServer } from "http";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import { existsSync } from "fs";

import { handleProjects } from "./routes/projects.js";
import { handleSessions } from "./routes/sessions.js";
import { handleStep, stepComplete } from "./routes/steps.js";
import { PERSONAS } from "./personas/index.js";
import { json, err } from "./utils/http.js";
import { readStepFile } from "./session/manager.js";

const START_PORT = Number(process.env.PORT ?? 3001);
const MAX_PORT_TRIES = 5;
const PUBLIC_DIR = join(process.cwd(), "public");

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function handler(req: import("http").IncomingMessage, res: import("http").ServerResponse) {
  const url = new URL(req.url ?? "/", `http://localhost:${START_PORT}`);
  const path = url.pathname;

  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  try {
    // ── API 路由 ──────────────────────────────────────────────────────────────

    // GET /api/personas
    if (path === "/api/personas" && req.method === "GET") {
      return json(res, PERSONAS.map(p => ({ id: p.id, name: p.name, emoji: p.emoji, tagline: p.tagline })));
    }

    // GET /api/projects/:pid/sessions/:sid/files/:filename
    const fileMatch = path.match(/^\/api\/projects\/([^/]+)\/sessions\/([^/]+)\/files\/([^/]+)$/);
    if (fileMatch && req.method === "GET") {
      const [, projectId, sessionId, filename] = fileMatch;
      const content = await readStepFile(projectId, sessionId, filename);
      if (content === null) return err(res, 404, "File not found");
      return json(res, { content });
    }

    // GET /api/projects/:pid/user-wiki
    const wikiMatch = path.match(/^\/api\/projects\/([^/]+)\/user-wiki$/);
    if (wikiMatch && req.method === "GET") {
      const [, projectId] = wikiMatch;
      const { readUserWiki } = await import("./session/manager.js");
      const content = await readUserWiki(projectId);
      return json(res, { content: content ?? "" });
    }

    // /api/projects or /api/projects/:pid
    if (path === "/api/projects" || path === "/api/projects/") {
      return handleProjects(req, res);
    }
    const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch) {
      return handleProjects(req, res, projectMatch[1]);
    }

    // /api/projects/:pid/sessions[/:sid][/steps/:step]
    const sessionMatch = path.match(
      /^\/api\/projects\/([^/]+)\/sessions(?:\/([^/]+)(?:\/steps\/([^/]+))?)?$/
    );
    if (sessionMatch) {
      const [, projectId, sessionId, step] = sessionMatch;

      // /complete 走普通 JSON，不走 SSE
      if (step === "complete") {
        return stepComplete(req, res, projectId, sessionId);
      }
      if (step) {
        return handleStep(req, res, projectId, sessionId!, step);
      }
      return handleSessions(req, res, projectId, sessionId);
    }

    // ── 静态文件 ──────────────────────────────────────────────────────────────

    // / → index.html（前端入口，暂时用 mockup）
    if (path === "/" || path === "/index.html") {
      return serveFile(res, join(PUBLIC_DIR, "index.html"), "text/html");
    }

    // 其他静态文件
    const filePath = join(PUBLIC_DIR, path.replace(/^\//, ""));
    if (existsSync(filePath)) {
      const ext = extname(filePath);
      return serveFile(res, filePath, MIME[ext] ?? "application/octet-stream");
    }

    err(res, 404, "Not Found");
  } catch (e: any) {
    console.error("[server error]", e);
    err(res, 500, e.message ?? "Internal Server Error");
  }
}

async function serveFile(res: import("http").ServerResponse, filePath: string, contentType: string) {
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    err(res, 404, "File not found");
  }
}

// 端口自动探测：START_PORT → START_PORT+MAX_PORT_TRIES-1
let port = START_PORT;
for (let i = 0; i < MAX_PORT_TRIES; i++) {
  port = START_PORT + i;
  const bound = await new Promise<boolean>(resolve => {
    const s = createServer(handler);
    s.once('error', (e: any) => {
      if (e.code === 'EADDRINUSE') {
        console.log(`⚠  端口 ${port} 被占用，尝试 ${port + 1}…`);
        s.close();
        resolve(false);
      } else {
        console.error(`❌ 服务器错误：${e.message}`);
        process.exit(1);
      }
    });
    s.listen(port, () => resolve(true));
  });
  if (bound) {
    console.log(`\n参谋·Counsel AI 启动成功`);
    console.log(`→ http://localhost:${port}\n`);
    console.log(`API:`);
    console.log(`  GET  /api/personas`);
    console.log(`  GET  /api/projects`);
    console.log(`  POST /api/projects`);
    console.log(`  POST /api/projects/:pid/sessions`);
    console.log(`  POST /api/projects/:pid/sessions/:sid/steps/define`);
    console.log(`  POST /api/projects/:pid/sessions/:sid/steps/facts`);
    console.log(`  POST /api/projects/:pid/sessions/:sid/steps/opinions`);
    console.log(`  POST /api/projects/:pid/sessions/:sid/steps/dimensions`);
    console.log(`  POST /api/projects/:pid/sessions/:sid/steps/debate`);
    console.log(`  POST /api/projects/:pid/sessions/:sid/steps/summary`);
    console.log(`  POST /api/projects/:pid/sessions/:sid/steps/harvest\n`);
    break;
  }
}
