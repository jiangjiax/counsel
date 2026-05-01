//! ModelProvider trait definition

use futures::Stream;
use futures::FutureExt;
use serde::{Deserialize, Serialize};
use std::pin::Pin;

/// Streaming response type - yields chunks of strings
pub type StreamingResponse = Pin<Box<dyn Stream<Item = ModelResult<String>> + Send>>;

/// Type alias for boxed futures
pub type BoxFuture<'a, T> = Pin<Box<dyn futures::Future<Output = T> + Send + 'a>>;

/// Chat message sent to model
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

impl ChatMessage {
    pub fn system(content: impl Into<String>) -> Self {
        Self { role: MessageRole::System, content: content.into() }
    }

    pub fn user(content: impl Into<String>) -> Self {
        Self { role: MessageRole::User, content: content.into() }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self { role: MessageRole::Assistant, content: content.into() }
    }
}

/// Options for chat completion
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

impl ChatOptions {
    pub fn model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into());
        self
    }

    pub fn max_tokens(mut self, max: u32) -> Self {
        self.max_tokens = Some(max);
        self
    }

    pub fn temperature(mut self, temp: f32) -> Self {
        self.temperature = Some(temp);
        self
    }
}

/// Chat completion response
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

/// Model Provider trait - all model implementations must implement this
pub trait ModelProvider: Send + Sync {
    /// Return provider name
    fn name(&self) -> &str;

    /// Estimate token count for a text string
    /// Uses heuristic: ~4 chars per token for Chinese, ~4.5 for English
    fn estimate_tokens(&self, text: &str) -> usize {
        estimate_tokens_static(text)
    }

    /// Streaming chat completion
    fn chat_stream(
        &self,
        messages: &[ChatMessage],
        options: ChatOptions,
    ) -> BoxFuture<'_, ModelResult<StreamingResponse>>;

    /// Non-streaming chat completion
    fn chat(
        &self,
        messages: &[ChatMessage],
        options: ChatOptions,
    ) -> BoxFuture<'_, ModelResult<ChatResponse>> {
        let stream = self.chat_stream(messages, options);
        async move {
            let stream = stream.await?;
            let mut content = String::new();
            futures::pin_mut!(stream);
            while let Some(chunk) = futures::StreamExt::next(&mut stream).await {
                content.push_str(&chunk?);
            }
            Ok(ChatResponse { content, usage: None })
        }
        .boxed()
    }
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
    #[error("Config error: {0}")]
    Config(String),
}

/// Estimate token count using heuristics:
/// - Chinese/Asian characters: ~1 token per character (actually 1:1 for CJK)
/// - English/alphabet: ~4.5 chars per token
/// - Mixed content: weighted average
pub fn estimate_tokens_static(text: &str) -> usize {
    if text.is_empty() {
        return 0;
    }

    let mut chinese_chars = 0;
    let mut english_chars = 0;
    let mut other_chars = 0;

    for c in text.chars() {
        if c.is_ascii_whitespace() {
            // Whitespace is shared
            continue;
        } else if is_cjk_char(c) {
            chinese_chars += 1;
        } else if c.is_ascii_alphabetic() {
            english_chars += 1;
        } else {
            other_chars += 1;
        }
    }

    // CJK characters: ~1 token per character
    // English: ~4.5 chars per token
    // Other (punctuation, numbers): ~2 chars per token
    let cjk_tokens = chinese_chars;
    let english_tokens = (english_chars as f64 / 4.5).ceil() as usize;
    let other_tokens = (other_chars as f64 / 2.0).ceil() as usize;

    cjk_tokens + english_tokens + other_tokens
}

/// Check if character is CJK (Chinese, Japanese, Korean)
fn is_cjk_char(c: char) -> bool {
    matches!(c,
        '\u{4E00}'..='\u{9FFF}' |  // CJK Unified Ideographs
        '\u{3400}'..='\u{4DBF}' |  // CJK Unified Ideographs Extension A
        '\u{F900}'..='\u{FAFF}' |  // CJK Compatibility Ideographs
        '\u{3040}'..='\u{309F}' |  // Hiragana
        '\u{30A0}'..='\u{30FF}' |  // Katakana
        '\u{AC00}'..='\u{D7AF}'    // Hangul Syllables
    )
}

/// Estimate tokens for a list of chat messages (prompt tokens)
pub fn estimate_messages_tokens(messages: &[ChatMessage]) -> usize {
    messages.iter().map(|m| {
        // Add overhead for role labels
        let role_overhead = match m.role {
            MessageRole::System => 3,
            MessageRole::User => 1,
            MessageRole::Assistant => 1,
        };
        estimate_tokens_static(&m.content) + role_overhead
    }).sum()
}
