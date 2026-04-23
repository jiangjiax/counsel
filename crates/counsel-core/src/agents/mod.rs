//! Agent implementations - Persona, Facilitator, Secretary

pub mod persona;
pub mod facilitator;
pub mod secretary;

pub use facilitator::*;
pub use secretary::*;

use async_trait::async_trait;
use counsel_model::{ChatMessage, ChatOptions, ModelProvider};
use std::sync::Arc;
use thiserror::Error;

use crate::{SSEEvent, SseSink};

#[derive(Debug, Error)]
pub enum AgentError {
    #[error("Model error: {0}")]
    Model(#[from] counsel_model::ModelError),
    #[error("Channel error: {0}")]
    Channel(String),
    #[error("Agent error: {0}")]
    Generic(String),
}

pub type AgentResult<T> = Result<T, AgentError>;

/// Buffer size for SSE chunks (in chars) - larger buffer to avoid splitting words
pub const BUFFER_THRESHOLD: usize = 500;

/// Base agent trait
#[async_trait]
pub trait Agent: Send + Sync {
    fn name(&self) -> &str;
    async fn run(&self, messages: &[ChatMessage], options: ChatOptions) -> AgentResult<String>;
    async fn run_streaming(
        &self,
        messages: &[ChatMessage],
        options: ChatOptions,
        sender: SseSink,
    ) -> AgentResult<()>;

    /// Stream response via SSE AND accumulate the full text — single API call.
    /// Replaces the old pattern of `run_streaming()` + `run()` (two calls).
    async fn run_streaming_collect(
        &self,
        messages: &[ChatMessage],
        options: ChatOptions,
        sender: SseSink,
    ) -> AgentResult<String>;
}

/// Persona agent - one of the 12 advisors
#[derive(Clone)]
pub struct PersonaAgent {
    pub id: String,
    pub name: String,
    pub title: String,
    pub description: String,
    pub model: Arc<dyn ModelProvider>,
}

impl PersonaAgent {
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        title: impl Into<String>,
        description: impl Into<String>,
        model: Arc<dyn ModelProvider>,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            title: title.into(),
            description: description.into(),
            model,
        }
    }
}

#[async_trait]
impl Agent for PersonaAgent {
    fn name(&self) -> &str {
        &self.name
    }

    async fn run(&self, messages: &[ChatMessage], options: ChatOptions) -> AgentResult<String> {
        let response = self.model.chat(messages, options).await?;
        if response.content.trim().is_empty() {
            return Err(AgentError::Generic("Model returned empty response".to_string()));
        }
        Ok(response.content)
    }

    async fn run_streaming(
        &self,
        messages: &[ChatMessage],
        options: ChatOptions,
        sender: SseSink,
    ) -> AgentResult<()> {
        let stream = self.model.chat_stream(messages, options).await?;
        futures::pin_mut!(stream);
        let name = self.name.clone();

        // Send persona start
        sender.send(SSEEvent::PersonaStart { name: name.clone() }).await
            .map_err(|e| AgentError::Channel(e.to_string()))?;

        let mut buffer = String::new();
        let mut has_content = false;

        while let Some(chunk_result) = futures::StreamExt::next(&mut stream).await {
            match chunk_result {
                Ok(chunk) => {
                    has_content = true;
                    buffer.push_str(&chunk);

                    if buffer.len() >= BUFFER_THRESHOLD {
                        let break_point = buffer
                            .char_indices()
                            .rev()
                            .find(|(_, c)| *c == '.' || *c == '!' || *c == '?' || *c == '\n')
                            .map(|(i, _)| i + 1)
                            .unwrap_or_else(|| {
                                // Safe fallback: find valid char boundary (avoid splitting multi-byte chars)
                                let mut bp = BUFFER_THRESHOLD.min(buffer.len());
                                while bp > 0 && !buffer.is_char_boundary(bp) { bp -= 1; }
                                bp
                            });

                        let to_send = buffer[..break_point].to_string();
                        let remainder = buffer[break_point..].to_string();
                        buffer.clear();
                        buffer.push_str(&remainder);

                        sender.send(SSEEvent::PersonaChunk {
                            name: name.clone(),
                            chunk: to_send,
                        }).await.map_err(|e| AgentError::Channel(e.to_string()))?;
                    }
                }
                Err(e) => {
                    // If we already streamed content, log and break instead of failing
                    if has_content {
                        tracing::warn!("Stream error for {} after streaming content, continuing: {}", name, e);
                        break;
                    }
                    sender.send(SSEEvent::Error { message: e.to_string() }).await.ok();
                    sender.send(SSEEvent::PersonaDone { name }).await.ok();
                    return Err(AgentError::Model(e));
                }
            }
        }

        // Flush remaining buffer
        if !buffer.is_empty() {
            sender.send(SSEEvent::PersonaChunk {
                name: name.clone(),
                chunk: buffer,
            }).await.map_err(|e| AgentError::Channel(e.to_string()))?;
        }

        sender.send(SSEEvent::PersonaDone { name }).await
            .map_err(|e| AgentError::Channel(e.to_string()))?;

        Ok(())
    }

    async fn run_streaming_collect(
        &self,
        messages: &[ChatMessage],
        options: ChatOptions,
        sender: SseSink,
    ) -> AgentResult<String> {
        let stream = self.model.chat_stream(messages, options).await?;
        futures::pin_mut!(stream);
        let name = self.name.clone();

        sender.send(SSEEvent::PersonaStart { name: name.clone() }).await
            .map_err(|e| AgentError::Channel(e.to_string()))?;

        let mut full_text = String::new();
        let mut buffer = String::new();
        let mut stream_error: Option<counsel_model::ModelError> = None;

        while let Some(chunk_result) = futures::StreamExt::next(&mut stream).await {
            match chunk_result {
                Ok(chunk) => {
                    full_text.push_str(&chunk);
                    buffer.push_str(&chunk);

                    if buffer.len() >= BUFFER_THRESHOLD {
                        let break_point = buffer
                            .char_indices()
                            .rev()
                            .find(|(_, c)| *c == '.' || *c == '!' || *c == '?' || *c == '\n')
                            .map(|(i, _)| i + 1)
                            .unwrap_or_else(|| {
                                // Safe fallback: find valid char boundary (avoid splitting multi-byte chars)
                                let mut bp = BUFFER_THRESHOLD.min(buffer.len());
                                while bp > 0 && !buffer.is_char_boundary(bp) { bp -= 1; }
                                bp
                            });

                        let to_send = buffer[..break_point].to_string();
                        let remainder = buffer[break_point..].to_string();
                        buffer.clear();
                        buffer.push_str(&remainder);

                        sender.send(SSEEvent::PersonaChunk {
                            name: name.clone(),
                            chunk: to_send,
                        }).await.map_err(|e| AgentError::Channel(e.to_string()))?;
                    }
                }
                Err(e) => {
                    // If we already collected partial content, save it instead of failing.
                    // This handles cases where the API cuts the stream (e.g. content filter).
                    if !full_text.trim().is_empty() {
                        tracing::warn!("Stream error for {} after collecting {} chars, using partial content: {}", name, full_text.len(), e);
                        stream_error = Some(e);
                        break;
                    }
                    sender.send(SSEEvent::Error { message: e.to_string() }).await.ok();
                    sender.send(SSEEvent::PersonaDone { name }).await.ok();
                    return Err(AgentError::Model(e));
                }
            }
        }

        // Flush remaining buffer
        if !buffer.is_empty() {
            sender.send(SSEEvent::PersonaChunk {
                name: name.clone(),
                chunk: buffer,
            }).await.map_err(|e| AgentError::Channel(e.to_string()))?;
        }

        // Always send PersonaDone so the frontend stops showing the blinking cursor
        sender.send(SSEEvent::PersonaDone { name }).await
            .map_err(|e| AgentError::Channel(e.to_string()))?;

        if full_text.trim().is_empty() {
            return Err(AgentError::Generic("Model returned empty response".to_string()));
        }

        if stream_error.is_some() {
            tracing::warn!("Returning partial content ({} chars) due to stream error", full_text.len());
        }

        Ok(full_text)
    }
}

/// Default 12 personas (from TypeScript skills folder)
pub fn default_personas() -> Vec<(&'static str, &'static str, &'static str, &'static str)> {
    vec![
        ("andrej-karpathy", "Andrej Karpathy", "AI Researcher", "You are Andrej Karpathy, AI researcher and educator. You think in first principles about AI and believe if you can't build it from scratch, you don't understand it."),
        ("elon-musk", "Elon Musk", "CEO of SpaceX/Tesla/xAI", "You are Elon Musk. You think in first principles, embrace vertical integration, and believe in 10x thinking."),
        ("feynman", "Richard Feynman", "Nobel Physicist", "You are Richard Feynman, Nobel-winning physicist. You explain things simply and bang on drums when you find BS."),
        ("ilya-sutskever", "Ilya Sutskever", "AI Researcher", "You are Ilya Sutskever, co-founder of SSI. You believe compression is understanding and think about AI safety as inseparable from capabilities."),
        ("mrbeast", "MrBeast", "YouTube Creator", "You are MrBeast. You obsess over CTR × AVD, stair-stepping content, and extreme reinvestment for maximum growth."),
        ("munger", "Charlie Munger", "Berkshire Hathaway VP", "You are Charlie Munger. You pull from many mental models, think about Lollapalooza effects, and focus on inversion."),
        ("naval", "Naval Ravikant", "AngelList Co-founder", "You are Naval. You think about wealth creation through leverage, specific knowledge, and desire management."),
        ("paul-graham", "Paul Graham", "YC Co-founder", "You are Paul Graham. You believe writing is thinking, makers need large uninterrupted blocks, and superlinear returns exist."),
        ("steve-jobs", "Steve Jobs", "Apple Co-founder", "You are Steve Jobs. You believe focus means saying no, technology should be beautiful, and the intersection of tech and liberal arts produces magic."),
        ("taleb", "Nassim Taleb", "Author/Trader", "You are Nassim Taleb. You think about antifragility, skin in the game, and via negativa - subtraction, not addition."),
        ("trump", "Donald Trump", "45th US President", "You are Donald Trump. You believe everything is a deal, unpredictability is power, and perception creates reality."),
        ("zhang-yiming", "Zhang Yiming", "ByteDance/TikTok Founder", "You are Zhang Yiming. You think in algorithms, believe context beats control, and focus on information distribution efficiency."),
    ]
}
