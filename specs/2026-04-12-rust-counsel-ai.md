# Counsel Rust - Architecture Specification

## 1. 架构设计 (Architecture Design)

### 1.1 模块划分 (Module Structure)

```
counsel-rust/
├── Cargo.toml (workspace)
├── crates/
│   ├── counsel-core/          # 核心业务逻辑，8步流程状态机
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── steps/         # 8步流程实现
│   │       │   ├── mod.rs
│   │       │   ├── define.rs
│   │       │   ├── facts.rs
│   │       │   ├── opinions.rs
│   │       │   ├── dimensions.rs
│   │       │   ├── debate.rs
│   │       │   ├── summary.rs
│   │       │   └── harvest.rs
│   │       ├── agents/        # Agent trait和实现
│   │       │   ├── mod.rs
│   │       │   ├── facilitator.rs
│   │       │   ├── secretary.rs
│   │       │   └── persona.rs
│   │       ├── state.rs       # Session状态管理
│   │       └── prompts.rs     # Prompt模板
│   │
│   ├── counsel-api/            # HTTP API层
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── routes/
│   │       │   ├── mod.rs
│   │       │   ├── projects.rs
│   │       │   ├── sessions.rs
│   │       │   └── steps.rs
│   │       ├── middleware/
│   │       │   └── cors.rs
│   │       └── error.rs
│   │
│   ├── counsel-model/          # 模型Provider trait和实现
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── traits.rs      # ModelProvider trait定义
│   │       ├── openai.rs      # OpenAI-compatible实现
│   │       ├── ollama.rs      # Ollama实现
│   │       ├── minimax.rs     # MiniMax实现
│   │       ├── kimi.rs        # Kimi实现
│   │       └── deepseek.rs    # DeepSeek实现
│   │
│   └── counsel-storage/        # 文件系统存储
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── projects.rs
│           ├── sessions.rs
│           └── files.rs
```

### 1.2 核心Trait定义 (Core Trait Definitions)

```rust
// counsel-model/src/traits.rs

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// 聊天消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: MessageRole,
    pub content: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    System,
    User,
    Assistant,
}

/// 模型Provider接口 - 所有模型实现必须实现此trait
#[async_trait]
pub trait ModelProvider: Send + Sync {
    /// 返回Provider名称
    fn name(&self) -> &str;

    /// 流式聊天完成
    async fn chat_stream(
        &self,
        messages: &[ChatMessage],
        options: ChatOptions,
    ) -> ModelResult<StreamingResponse>;

    /// 非流式聊天完成
    async fn chat(
        &self,
        messages: &[ChatMessage],
        options: ChatOptions,
    ) -> ModelResult<ChatResponse>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatOptions {
    pub model: Option<String>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub system_prompt: Option<String>,
}

impl Default for ChatOptions {
    fn default() -> Self {
        Self {
            model: None,
            max_tokens: Some(2048),
            temperature: Some(0.7),
            system_prompt: None,
        }
    }
}

pub type StreamingResponse = Pin<Box<dyn Stream<Item = ModelResult<String>> + Send>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub content: String,
    pub usage: Option<Usage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

pub type ModelResult<T> = Result<T, ModelError>;

#[derive(Debug, thiserror::Error)]
pub enum ModelError {
    #[error("API error: {0}")]
    Api(String),
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("Parse error: {0}")]
    Parse(#[from] serde_json::Error),
    #[error("Stream error: {0}")]
    Stream(String),
}
```

### 1.3 Agent Trait定义

```rust
// counsel-core/src/agents/mod.rs

use async_trait::async_trait;
use crate::steps::SSEEvent;
use tokio::sync::mpsc;

#[async_trait]
pub trait Agent: Send + Sync {
    fn name(&self) -> &str;
    async fn run(&self, prompt: &str, sender: mpsc::Sender<SSEEvent>) -> AgentResult<String>;
    async fn run_streaming(&self, prompt: &str, sender: mpsc::Sender<SSEEvent>) -> AgentResult<()>;
}

pub type AgentResult<T> = Result<T, AgentError>;

#[derive(Debug, thiserror::Error)]
pub enum AgentError {
    #[error("Model error: {0}")]
    Model(#[from] crate::model::ModelError),
    #[error("Channel error: {0}")]
    Channel(#[from] tokio::sync::mpsc::error::SendError<SSEEvent>),
    #[error("Agent error: {0}")]
    Generic(String),
}
```

### 1.4 SSE事件格式

```rust
// counsel-core/src/steps.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SSEEvent {
    StepStart { step: u8, data: Option<serde_json::Value> },
    PersonaStart { name: String },
    PersonaChunk { name: String, chunk: String },
    PersonaDone { name: String },
    FacilitatorChunk { chunk: String },
    FacilitatorDone,
    StepDone { step: u8, data: Option<serde_json::Value> },
    Error { message: String },
}
```

## 2. API设计

### 2.1 Endpoints

```
GET  /api/personas                          → 幕僚列表
GET  /api/settings                          → 获取设置
POST /api/settings                          → 设置语言
GET  /api/projects                          → 项目列表
POST /api/projects                          → 创建项目
PATCH /api/projects/:projectId              → 更新项目
GET  /api/projects/:projectId/sessions      → Session列表
POST /api/projects/:projectId/sessions      → 创建Session
GET  /api/projects/:projectId/sessions/:sid → 获取Session
GET  /api/projects/:projectId/sessions/:sid/files/:filename → 读取文件
GET  /api/projects/:projectId/user-wiki     → 用户Wiki
POST /api/projects/:projectId/sessions/:sid/steps/:step     → SSE处理step
POST /api/projects/:projectId/sessions/:sid/steps/complete  → 完成
```

### 2.2 SSE Stream格式

```
Content-Type: text/event-stream
data: {"type":"step_start","step":2}
data: {"type":"persona_start","name":"Steve Jobs"}
data: {"type":"persona_chunk","name":"Steve Jobs","chunk":"..."}
data: {"type":"persona_done","name":"Steve Jobs"}
...
data: {"type":"step_done","step":4}
```

## 3. 并发模型

### 3.1 12个Persona并行

```rust
use tokio::sync::mpsc;
use tokio::task::JoinSet;

pub async fn run_all_personas<'a>(
    personas: &'a [Persona],
    prompt: &'a str,
    sender: mpsc::Sender<SSEEvent>,
) -> HashMap<&'a str, String> {
    let mut join_set = JoinSet::new();
    let (tx, mut rx) = mpsc::channel::<(String, String)>(100);

    for persona in personas {
        let prompt = prompt.to_string();
        let tx = tx.clone();
        let sender = sender.clone();

        join_set.spawn(async move {
            let text = run_persona(persona, &prompt, sender).await?;
            tx.send((persona.id.to_string(), text)).await?;
            Ok::<(), AgentError>(())
        });
    }

    drop(tx);
    let mut results = HashMap::new();
    while let Some((id, text)) = rx.recv().await {
        results.insert(id, text);
    }
    while join_set.join_next().await.is_some() {}
    results
}
```

## 4. 文件结构

```
sessions/
├── [project-id]/
│   ├── meta.json
│   ├── user-wiki.md
│   └── session-[n]/
│       ├── session.json
│       ├── 00-raw-input.md
│       ├── 01-defined.md
│       ├── 02-facts-answers.md
│       ├── 03-opinions/
│       │   ├── Steve Jobs.md
│       │   └── ... (12 files)
│       ├── 04-dimensions.md
│       ├── 05-debate.md
│       ├── 06-summary.md
│       └── 07-harvest.md
```

## 5. 配置

```toml
[server]
host = "0.0.0.0"
port = 3000

[storage]
root = "./sessions"

[model]
default = "ollama"

[model.providers.ollama]
type = "ollama"
base_url = "http://127.0.0.1:11434"
model = "llama3.2"

[model.providers.claude]
type = "openai"
base_url = "https://api.openai.com/v1"
model = "gpt-4"
api_key = "${CLAUDE_API_KEY}"
```

## 6. Cargo依赖

```toml
[workspace]
members = ["crates/*"]

[workspace.dependencies]
tokio = { version = "1", features = ["full"] }
axum = "0.7"
tower-cors = "0.6"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
async-trait = "0.1"
thiserror = "1"
tracing = "0.1"
tracing-subscriber = "0.3"
reqwest = { version = "0.12", features = ["json", "stream"] }
tokio-stream = "0.1"
futures = "0.3"
```
