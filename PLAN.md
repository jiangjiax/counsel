# Counsel AI — Implementation Plan
**日期：** 2026-04-09  
**基于：** PRODUCT-SPEC-v2.md  
**SDK：** @codeany/open-agent-sdk（open-agent-sdk-typescript，路径 ../open-agent-sdk-typescript/src/index.js）

---

## 目标

构建"参谋 · Counsel AI"—— 一个 AI 私董会 Web 应用。用户输入困惑，12个AI幕僚（乔布斯/老子/马斯克等）并行独立发言、辩论、汇总，帮助用户解决决策难题。

---

## 技术栈

- **后端：** Node.js + TypeScript，原生 HTTP server（参考 SDK web example）
- **Agent SDK：** @codeany/open-agent-sdk v0.2.0（npm 包，项目开源）
- **前端：** 原生 HTML/CSS/JS，SSE 流式渲染，无框架
- **存储：** 本地文件系统（markdown + JSON），路径 `sessions/[project-name]/session-[N]/`
- **并行：** Step 4 用 Promise.all() 并行调用12个 sub-agent，SSE 实时推送

---

## 文件结构目标

```
counsel-ai/
  src/
    server.ts              # 主 HTTP 服务器（参考 SDK web/server.ts）
    agents/
      facilitator.ts       # Facilitator Agent — 问题定义 + 辩论主持
      persona-agent.ts     # 通用幕僚 Agent 工厂
      secretary.ts         # Secretary Agent — 汇总 + to-do 提取
    personas/
      index.ts             # 12幕僚定义（系统提示词）
    session/
      manager.ts           # Session CRUD（读写文件系统）
      types.ts             # Session 类型定义
    routes/
      projects.ts          # GET/POST /api/projects
      sessions.ts          # GET/POST /api/sessions
      steps.ts             # POST /api/steps/* — 各步骤触发
  public/
    index.html             # 主页（项目列表）
    session.html           # Session 页（8步进度条 + 主内容区）
    styles.css
    app.js                 # 前端 JS
  sessions/                # 用户数据（gitignore）
  personas/
    12-personas.md         # 幕僚人设
  package.json
  tsconfig.json
```

---

## 8步实现计划

### Step 0：首页（项目列表）
- `GET /` — 返回 index.html
- `GET /api/projects` — 读取 sessions/ 目录，返回项目列表（名称、最近session时间、进度）
- `POST /api/projects` — 创建新项目（创建 sessions/[name]/ 目录）
- UI：项目卡片列表，「+ 新项目」按钮

### Step 1：输入困惑
- `POST /api/projects/:id/sessions` — 创建新 session，写 `00-raw-input.md`
- UI：大文本框

### Step 2：定义问题（Facilitator 对话）
- `POST /api/sessions/:id/steps/define/message` — SSE，Facilitator 提问/回答流
- Agent：`createAgent({ systemPrompt: facilitatorPrompt, maxTurns: 20 })`
- 锁定后写 `01-defined.md`，包含锁定问题 + 推荐幕僚阵容
- UI：对话气泡界面，「锁定」按钮

### Step 3：挖事实（并行问题生成）
- `POST /api/sessions/:id/steps/facts` — SSE，12个幕僚并行生成问题
- 实现：`Promise.all(12个 query())` + SSE 推送每张卡片完成
- 写 `02-facts/questions.md`
- `POST /api/sessions/:id/steps/facts/answers` — 提交案主回答，写 `02-facts/answers.md`
- UI：12个问题卡片 + 统一回答文本框

### Step 4：独立发言（核心 demo 时刻）
- `POST /api/sessions/:id/steps/opinions` — SSE
- 实现：`Promise.all(12个 createAgent().query())` 并行，各自独立 context
- 每个幕僚 context = `[原始困惑] + [锁定问题] + [事实回答] + [该幕僚 persona prompt]`
- 实时 SSE 推送：`{ type: 'persona_chunk', name: '乔布斯', chunk: '...' }`
- 写 `03-opinions/persona-[name].md`
- UI：12张卡片同时 streaming，折叠/展开

### Step 5：拆维度
- `POST /api/sessions/:id/steps/dimensions` — SSE
- Facilitator 读取12份意见，提炼3-6个冲突维度
- 写 `04-dimensions.md`
- UI：维度卡片（正方/反方阵营），多选最多3个

### Step 6：辩论 Round 1
- `POST /api/sessions/:id/steps/debate` — SSE，接受选中的维度列表
- 每个维度：所有幕僚发言（~100字），分组展示，Facilitator 提炼核心冲突
- 写 `05-debate.md`
- UI：正方/反方/中间派分列

### Step 7：汇总
- `POST /api/sessions/:id/steps/summary` — SSE
- Secretary + Facilitator 联合生成总汇总
- 写 `06-summary.md`
- UI：汇总卡片

### Step 8：摘果子
- `POST /api/sessions/:id/steps/harvest` — SSE
- 3-5个幕僚评价案主（优点/盲区/建议）
- Secretary 提取 to-do checklist
- 写 `07-harvest.md`，更新 `user-wiki.md`
- UI：评价卡片 + to-do 清单 + 案主自我收获输入框

---

## SSE 事件格式（统一）

```typescript
// 服务器推送
type SSEEvent =
  | { type: 'step_start'; step: number }
  | { type: 'persona_start'; name: string }
  | { type: 'persona_chunk'; name: string; chunk: string }
  | { type: 'persona_done'; name: string }
  | { type: 'facilitator_chunk'; chunk: string }
  | { type: 'step_done'; step: number; data?: any }
  | { type: 'error'; message: string }
```

---

## Agent 设计

### Facilitator Agent（Step 2, 5, 6, 7）
- `maxTurns: 20`，无文件系统工具（只需 LLM 推理）
- 系统提示词：主持人角色，中文，简洁直接

### Persona Agent（Step 3, 4, 6, 8）
- 每次调用创建新 Agent 实例（无状态），`maxTurns: 3`
- 使用 SDK skill 系统：`registerSkill` 注册每个 persona，agent 通过 SkillTool 调用（`12-skills.ts` 模式）
- persona 的 `model`、`allowedTools` 等配置全部在 skill 定义里，调用方只传 skill name

### Secretary Agent（Step 7, 8）
- `maxTurns: 5`，读取 session 文件后生成汇总

---

## Demo 模式

- URL 参数 `?demo=true` 启用
- 预设案主 "Michael"，困惑："要不要离职去全职创业？"
- 每步自动填写回答（Fake Michael agent 生成）
- 12幕僚意见限制 100 字

---

## 项目初始化步骤

1. `npm init` → package.json
2. 安装依赖：tsx, typescript, @types/node
3. SDK：`"@codeany/open-agent-sdk": "^0.2.0"`（npm 包，项目开源不用本地路径）
4. 写 tsconfig.json（module: ESNext, target: ES2022）
5. 写 12 幕僚 personas（中文系统提示词）
6. 实现 server.ts（参考 SDK web/server.ts 模式）
7. 按 Step 0→8 顺序实现各路由
8. 写前端 HTML/CSS/JS

---

## MVP 优先级（当天可 demo）

| 优先级 | 内容 |
|--------|------|
| P0 | Step 4 并行发言（核心 demo 价值） |
| P0 | Step 1-2 输入 + Facilitator 对话 |
| P1 | Step 3 挖事实 |
| P1 | Step 5-6 拆维度 + 辩论 |
| P2 | Step 7-8 汇总 + 摘果子 |
| P2 | 进度条 UI + 卡片动画 |
| P3 | Demo 模式 |
| P3 | Session-to-session 上下文继承 |

---

## 关键约束

- 不使用 Claude Code SDK，改用 @codeany/open-agent-sdk
- 本地引用 SDK（`file:../open-agent-sdk-typescript`）
- 环境变量通过 CODEANY_API_KEY + CODEANY_BASE_URL 配置（对应现有代理设置）
- 所有 Agent 调用使用 `claude-sonnet-4-6` 模型
- Step 4 的12个 Agent 必须真正并行（Promise.all），不能串行

---

## 不在 MVP 范围

- 辩论 Round 2
- 幕僚单独汇总（按需触发）
- User Wiki 深度版
- 多人协作
- 语音交互
- 幕僚 Marketplace
<!-- /autoplan restore point: /Users/jiangjiax/.gstack/projects/counsel-ai/-autoplan-restore-20260409-162941.md -->
