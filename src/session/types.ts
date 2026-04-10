/**
 * Session 类型定义
 * 对应本地文件结构：sessions/[project]/session-N/
 */

export type StepStatus = "pending" | "in_progress" | "done";

export interface Session {
  id: string;           // session-1, session-2, ...
  projectId: string;    // 对应 sessions/ 下的子目录名
  createdAt: string;    // ISO 8601
  currentStep: number;  // 0-8
  steps: StepStatus[];  // 每步状态
}

export interface Project {
  id: string;           // 目录名，URL safe
  name: string;
  createdAt: string;
  sessionCount: number;
  latestSessionId: string | null;
  latestStep: number;
}

// sessions/[projectId]/session-N/ 下的文件
export interface SessionFiles {
  "00-raw-input.md"?: string;
  "01-defined.md"?: string;
  "02-facts-questions.md"?: string;
  "02-facts-answers.md"?: string;
  "03-opinions/"?: Record<string, string>;   // persona-name.md
  "04-dimensions.md"?: string;
  "05-debate.md"?: string;
  "06-summary.md"?: string;
  "07-harvest.md"?: string;
  "user-wiki.md"?: string;
}

// SSE 事件格式（统一）
export type SSEEvent =
  | { type: "step_start"; step: number; data?: unknown }
  | { type: "persona_start"; name: string }
  | { type: "persona_chunk"; name: string; chunk: string }
  | { type: "persona_done"; name: string }
  | { type: "facilitator_chunk"; chunk: string }
  | { type: "facilitator_done" }
  | { type: "step_done"; step: number; data?: unknown }
  | { type: "error"; message: string };
