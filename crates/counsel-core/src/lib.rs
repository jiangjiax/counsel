//! Counsel Core - Business logic for the 8-step advisory flow

pub mod agents;
pub mod state;
pub mod steps;
pub mod prompts;
pub mod personas;
pub mod persona_prompts;
pub mod conversation;
pub mod wisdom;
pub mod fingerprint;

pub use agents::*;
pub use state::*;
// Note: steps module contents are accessed via CounselService methods
pub use prompts::*;

use counsel_model::ModelProvider;
use counsel_storage::Storage;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::mpsc;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("Model error: {0}")]
    Model(#[from] counsel_model::ModelError),
    #[error("Storage error: {0}")]
    Storage(#[from] counsel_storage::StorageError),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Channel error: {0}")]
    Channel(String),
    #[error("Step error: {0}")]
    Step(String),
    #[error("Agent error: {0}")]
    Agent(String),
}

pub type CoreResult<T> = Result<T, CoreError>;

/// If `text` contains ≥5 Chinese characters, prepend a hard Chinese-response instruction.
///
/// Added 2026-04-26 from benchmark v3-final findings:
/// English-bias personas (PG/Jobs/Musk/Bruce-Lee) tend to reply in English even when
/// 案主 asks in Chinese. System prompt rule (`build_system_prompt` in `wisdom.rs`)
/// alone gave only ~50% Chinese compliance for some personas; bulletproof bypass
/// is to inject the directive at the user-message layer too.
///
/// Idempotent — if input already starts with the marker, returns unchanged.
pub fn ensure_chinese_response(text: &str) -> String {
    const MARKER: &str = "【请全程使用中文回答";
    if text.contains(MARKER) {
        return text.to_string();
    }
    let cn_count = text
        .chars()
        .filter(|c| ('\u{4e00}'..='\u{9fa5}').contains(c))
        .count();
    if cn_count >= 5 {
        format!(
            "【请全程使用中文回答下面这个问题，不要混入英文段落或英文 reasoning】\n\n{}",
            text
        )
    } else {
        text.to_string()
    }
}

/// Strip `<think>...</think>` reasoning blocks from LLM output (Phase 2.11).
/// Some models (DeepSeek-R1, Qwen reasoning variants) emit their chain-of-thought
/// inline, which pollutes saved files and downstream prompts. Handles multi-line
/// content and unclosed tags (drops everything after an unclosed `<think>`).
pub fn strip_think_tags(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    loop {
        match rest.find("<think>") {
            None => {
                out.push_str(rest);
                break;
            }
            Some(open_idx) => {
                out.push_str(&rest[..open_idx]);
                let after_open = &rest[open_idx + 7..];
                match after_open.find("</think>") {
                    Some(close_idx) => {
                        rest = &after_open[close_idx + 8..];
                    }
                    None => break,  // unclosed — drop the rest
                }
            }
        }
    }
    out.trim().to_string()
}

#[cfg(test)]
mod strip_tests {
    use super::strip_think_tags;

    #[test]
    fn strips_single_block() {
        assert_eq!(strip_think_tags("<think>reasoning</think>answer"), "answer");
    }

    #[test]
    fn strips_multiline() {
        let input = "Before\n<think>\nmulti\nline\n</think>\nAfter";
        assert_eq!(strip_think_tags(input), "Before\n\nAfter");
    }

    #[test]
    fn handles_no_tags() {
        assert_eq!(strip_think_tags("plain text"), "plain text");
    }

    #[test]
    fn handles_unclosed() {
        assert_eq!(strip_think_tags("visible<think>never ends"), "visible");
    }

    #[test]
    fn handles_multiple_blocks() {
        assert_eq!(strip_think_tags("a<think>x</think>b<think>y</think>c"), "abc");
    }
}

#[cfg(test)]
mod ensure_chinese_tests {
    use super::ensure_chinese_response;

    #[test]
    fn prepends_for_chinese_question() {
        let q = "我作为创业者该怎么决定下一步";
        let out = ensure_chinese_response(q);
        assert!(out.starts_with("【请全程使用中文回答"));
        assert!(out.contains(q));
    }

    #[test]
    fn passthrough_for_english_question() {
        let q = "Should I take this job offer or stay?";
        let out = ensure_chinese_response(q);
        assert_eq!(out, q);
    }

    #[test]
    fn idempotent() {
        let q = "我要不要换工作";
        let once = ensure_chinese_response(q);
        let twice = ensure_chinese_response(&once);
        assert_eq!(once, twice);
    }

    #[test]
    fn ignores_short_chinese() {
        // 4 Chinese chars, below threshold 5
        let q = "Hi 我 hello world test";
        let out = ensure_chinese_response(q);
        assert_eq!(out, q);
    }
}

/// SSE Event types for streaming responses
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SSEEvent {
    StepStart { step: u8, data: Option<serde_json::Value> },
    PersonaStart { name: String },
    PersonaChunk { name: String, chunk: String },
    PersonaDone { name: String },
    FacilitatorChunk { chunk: String },
    FacilitatorDone,
    /// Emitted before each dimension's round-1 debate starts (Step 6 multi-dim flow)
    DimensionStart { index: usize, total: usize, name: String },
    /// Emitted after each dimension's debate (including synthesis) completes
    DimensionDone { index: usize },
    /// Step 6.5 Pre-Mortem (Phase 4.4): Secretary imagines the decision failing
    /// one year out, streamed BEFORE the summary so the user can see both in Step 7.
    PremortemStart,
    PremortemChunk { chunk: String },
    PremortemDone,
    StepDone { step: u8, data: Option<serde_json::Value> },
    /// Phase C · emitted at end of a tempdir-mode step. Carries all files the
    /// step wrote so the browser can persist to IndexedDB (server keeps nothing).
    StepFiles { step: u8, data: serde_json::Value },
    Error { message: String },
}

impl SSEEvent {
    pub fn step_start(step: u8) -> Self {
        Self::StepStart { step, data: None }
    }

    pub fn step_done(step: u8) -> Self {
        Self::StepDone { step, data: None }
    }

    pub fn step_done_with_data(step: u8, data: serde_json::Value) -> Self {
        Self::StepDone { step, data: Some(data) }
    }

    pub fn step_files(step: u8, data: serde_json::Value) -> Self {
        Self::StepFiles { step, data }
    }

    pub fn error(message: String) -> Self {
        Self::Error { message }
    }

    pub fn persona_start(name: String) -> Self {
        Self::PersonaStart { name }
    }

    pub fn persona_chunk(name: String, chunk: String) -> Self {
        Self::PersonaChunk { name, chunk }
    }

    pub fn persona_done(name: String) -> Self {
        Self::PersonaDone { name }
    }

    /// Convert to SSE data format: "data: {...}\n\n"
    pub fn to_sse_data(&self) -> String {
        let json = serde_json::to_string(self).unwrap_or_else(|_| r#"{"type":"error","message":"serialization failed"}"#.to_string());
        format!("data: {}\n\n", json)
    }
}

/// SSE Event sink - converts SSEEvent to string and sends through channel
#[derive(Clone)]
pub struct SseSink {
    tx: mpsc::Sender<String>,
}

impl SseSink {
    pub fn new(tx: mpsc::Sender<String>) -> Self {
        Self { tx }
    }

    pub async fn send(&self, event: SSEEvent) -> Result<(), mpsc::error::SendError<String>> {
        self.tx.send(event.to_sse_data()).await
    }

    /// Create a sink whose output is drained and discarded. Used for detached
    /// background runs where we want the side effects of a streaming call (file
    /// writes, metrics) but no user-facing SSE connection is listening.
    /// A private background task drains the channel so senders never block.
    pub fn discarded() -> Self {
        let (tx, mut rx) = mpsc::channel::<String>(1024);
        tokio::spawn(async move {
            while rx.recv().await.is_some() {}
        });
        Self { tx }
    }
}

impl From<mpsc::Sender<String>> for SseSink {
    fn from(tx: mpsc::Sender<String>) -> Self {
        Self::new(tx)
    }
}

/// Main counsel service
#[derive(Clone)]
pub struct CounselService {
    pub model: Arc<dyn ModelProvider>,
    pub storage: Storage,
    pub registry: Arc<wisdom::PersonaRegistry>,
}

impl CounselService {
    pub fn new(model: Arc<dyn ModelProvider>, storage: Storage, registry: Arc<wisdom::PersonaRegistry>) -> Self {
        Self { model, storage, registry }
    }
}

/// State machine for Step 2 "一步锁定" (one-shot lock)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DefineState {
    /// Initial state — no LLM call yet
    Init,
    /// Facilitator has produced a draft understanding, awaiting user confirmation
    Confirming { attempt: u8, draft: String },
    /// User confirmed — problem is locked
    Locked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dimension {
    pub name: String,
    pub core_conflict: String,
    pub pro_argument: String,
    pub con_argument: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HarvestResult {
    pub evaluations: HashMap<String, String>,
    pub todos: String,
    pub insights: String,
    pub bayesian_update: Option<String>,
}

/// Metrics for a single step
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StepMetrics {
    pub step: u8,
    pub step_name: String,
    pub duration_ms: u64,
    pub prompt_tokens: usize,
    pub completion_tokens: usize,
    pub total_tokens: usize,
}

/// All metrics for a session
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SessionMetrics {
    pub steps: Vec<StepMetrics>,
    pub total_duration_ms: u64,
    pub total_prompt_tokens: usize,
    pub total_completion_tokens: usize,
    pub total_tokens: usize,
}

impl SessionMetrics {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_step(&mut self, metrics: StepMetrics) {
        self.total_duration_ms += metrics.duration_ms;
        self.total_prompt_tokens += metrics.prompt_tokens;
        self.total_completion_tokens += metrics.completion_tokens;
        self.total_tokens += metrics.total_tokens;
        self.steps.push(metrics);
    }

    /// Format metrics as markdown report
    pub fn to_markdown(&self) -> String {
        let mut md = String::from("# Session Metrics\n\n");
        md.push_str(&format!(
            "**Total Time:** {:.1}s | **Total Tokens:** ~{}K\n\n",
            self.total_duration_ms as f64 / 1000.0,
            self.total_tokens / 1000
        ));
        md.push_str("---\n\n");

        for step in &self.steps {
            md.push_str(&format!(
                "## Step {}: {}\n- **Duration:** {}ms ({:.1}s)\n- **Prompt tokens:** ~{}\n- **Completion tokens:** ~{}\n- **Total tokens:** ~{}\n\n",
                step.step,
                step.step_name,
                step.duration_ms,
                step.duration_ms as f64 / 1000.0,
                step.prompt_tokens,
                step.completion_tokens,
                step.total_tokens,
            ));
        }

        md.push_str("---\n\n");
        md.push_str(&format!(
            "**Totals:** {:.1}s | ~{}K tokens\n",
            self.total_duration_ms as f64 / 1000.0,
            self.total_tokens / 1000
        ));

        md
    }
}
