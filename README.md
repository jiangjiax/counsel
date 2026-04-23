# Counsel Rust — 项目启动文档

## 项目概述

**目标**: 用 Rust 重构 "参谋 · Counsel AI" 后端，打造一个极度优雅（decent）的多智能体 AI 决策辅助系统。

**项目位置**: `/Users/a1-6/Documents/CC/05-ACTIVE-PROJECTS/counsel-rust`
**源码位置**: `/Users/a1-6/Documents/CC/counsel` (现有 TypeScript 版本)

---

## 核心纲领

### 为什么重写

现有系统是用 24 小时黑客松速度赶出来的，存在以下问题：
- 无法流式生成（non-streaming API calls）
- 架构不够优雅，冗余代码多
- 难以支持多模型、多 Provider
- TypeScript 类型系统不够严格，维护成本高

### 目标状态

1. **Rust 后端** — 简洁、类型安全、并发优雅
2. **真正的流式生成** — SSE (Server-Sent Events)，每个 token 实时推送
3. **多模型支持** — 统一接口，插拔式 Provider：
   - OpenAI-compatible (Claude via proxy)
   - Ollama (本地模型)
   - MiniMax
   - Kimi
   - DeepSeek
4. **Agent 能力** — 多个 Agent 并行运行，互相交流分析
5. **本地优先** — 所有数据本地存储，不需要云端
6. **未来野望**：
   - 搜索能力（网络搜索、文档搜索）
   - 调研能力（自动搜集信息）
   - 理解本地文档（RAG）
   - 工具调用（Tool Use）

### 核心原则

- **Decent** — 不要冗余，不要过度工程
- **本地优先** — 不依赖云端服务
- **流式优先** — 所有生成都是流式的
- **可扩展** — 新的模型 Provider 只需实现 trait

---

## 现有架构理解（TypeScript 版本）

### 8 步流程

```
Step 1: 输入困惑 (raw input)
Step 2: 定义问题 (Facilitator 对话)
Step 3: 挖事实 (12 幕僚并行提问)
Step 4: 独立发言 (12 幕僚并行生成观点) ← 核心 Demo 时刻
Step 5: 拆维度 (Facilitator 提炼冲突维度)
Step 6: 深度辩论 (按维度逐一辩论)
Step 7: 汇总 (Secretary 生成总结)
Step 8: 摘果子 (评价 + To-Do)
```

### 技术栈

- **后端**: Node.js + TypeScript
- **Agent SDK**: @codeany/open-agent-sdk
- **存储**: 本地文件系统 (Markdown + JSON)
- **流式**: SSE (Server-Sent Events)
- **并行**: Promise.all() 并行调用 12 个 sub-agent

### 角色设计

- **Facilitator** — 流程管理者，只管流程，不发表内容观点
- **Secretary** — 记录、归档、To-Do 提取
- **Persona Agents** — 12 位幕僚（Jobs, 老子, 马斯克等），各自独立的哲学框架
- **Red Team** — 全程挑战共识的保护角色

---

## Rust 重构设计方向

### 架构目标

```
┌─────────────────────────────────────────────────────────┐
│                      API Layer (Axum)                    │
│  SSE endpoints for each step, REST for CRUD            │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                    Agent Runtime                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ Facilitator │  │  Secretary  │  │ Persona Pool ×12│  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                   Model Providers (Trait)                │
│  ┌──────┐  ┌───────┐  ┌───────┐  ┌──────┐  ┌────────┐  │
│  │Claude│  │Ollama │  │MiniMax│  │ Kimi │  │DeepSeek│  │
│  └──────┘  └───────┘  └───────┘  └──────┘  └────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                    Storage Layer                         │
│  Local filesystem: sessions/[project]/[session]/        │
└─────────────────────────────────────────────────────────┘
```

### 核心模块

1. **counsel-core** — 核心逻辑，8 步流程状态机
2. **counsel-api** — HTTP API 层，Axum + SSE
3. **counsel-agent** — Agent 运行时，并行调度
4. **counsel-model** — 模型 Provider trait 和实现
5. **counsel-storage** — 文件系统存储

### 技术选型

- **Web Framework**: Axum (或 Actix-web)
- **Async Runtime**: Tokio
- **Serialization**: Serde
- **SSE**: tokio-stream + axum
- **File Operations**: tokio::fs

---

## 状态

**初始化** — 待三人团队启动
