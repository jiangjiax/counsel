//! Secretary agent - synthesizes and summarizes

use async_trait::async_trait;
use counsel_model::{ChatMessage, ChatOptions, ModelProvider};
use std::sync::Arc;

use super::{Agent, AgentResult, BUFFER_THRESHOLD};
use crate::SSEEvent;
use crate::SseSink;

pub struct SecretaryAgent {
    pub name: String,
    pub model: Arc<dyn ModelProvider>,
}

impl SecretaryAgent {
    pub fn new(model: Arc<dyn ModelProvider>) -> Self {
        Self {
            name: "Secretary".into(),
            model,
        }
    }
}

#[async_trait]
impl Agent for SecretaryAgent {
    fn name(&self) -> &str {
        &self.name
    }

    async fn run(&self, messages: &[ChatMessage], options: ChatOptions) -> AgentResult<String> {
        let response = self.model.chat(messages, options).await?;
        if response.content.trim().is_empty() {
            return Err(super::AgentError::Generic("Model returned empty response".to_string()));
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

        let mut buffer = String::new();
        let mut total_sent: usize = 0;

        while let Some(chunk_result) = futures::StreamExt::next(&mut stream).await {
            match chunk_result {
                Ok(chunk) => {
                    buffer.push_str(&chunk);

                    // Send if buffer exceeds threshold, but find a natural break point
                    if buffer.len() >= BUFFER_THRESHOLD {
                        // Find the last sentence or paragraph break before threshold
                        let break_point = buffer
                            .char_indices()
                            .rev()
                            .find(|(_, c)| *c == '.' || *c == '!' || *c == '?' || *c == '\n')
                            .map(|(i, _)| i + 1)
                            .unwrap_or_else(|| {
                                let mut bp = BUFFER_THRESHOLD.min(buffer.len());
                                while bp > 0 && !buffer.is_char_boundary(bp) { bp -= 1; }
                                bp
                            });

                        let to_send = buffer[..break_point].to_string();
                        let remainder = buffer[break_point..].to_string();
                        buffer.clear();
                        buffer.push_str(&remainder);

                        if let Err(e) = sender.send(SSEEvent::FacilitatorChunk { chunk: to_send.clone() }).await {
                            return Err(super::AgentError::Channel(e.to_string()));
                        }
                        total_sent += to_send.len();
                    }
                }
                Err(e) => {
                    sender.send(SSEEvent::Error { message: e.to_string() }).await.ok();
                    return Err(super::AgentError::Model(e));
                }
            }
        }

        // Flush remaining buffer
        if !buffer.is_empty() {
            if let Err(e) = sender.send(SSEEvent::FacilitatorChunk { chunk: buffer.clone() }).await {
                return Err(super::AgentError::Channel(e.to_string()));
            }
            total_sent += buffer.len();
        }

        // Error if no content was streamed
        if total_sent == 0 {
            return Err(super::AgentError::Generic("No content streamed from model".to_string()));
        }

        sender.send(SSEEvent::FacilitatorDone).await
            .map_err(|e| super::AgentError::Channel(e.to_string()))?;

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

        let mut full_text = String::new();
        let mut buffer = String::new();

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
                                let mut bp = BUFFER_THRESHOLD.min(buffer.len());
                                while bp > 0 && !buffer.is_char_boundary(bp) { bp -= 1; }
                                bp
                            });

                        let to_send = buffer[..break_point].to_string();
                        let remainder = buffer[break_point..].to_string();
                        buffer.clear();
                        buffer.push_str(&remainder);

                        sender.send(SSEEvent::FacilitatorChunk { chunk: to_send }).await
                            .map_err(|e| super::AgentError::Channel(e.to_string()))?;
                    }
                }
                Err(e) => {
                    // If we already collected partial content, use it instead of failing
                    if !full_text.trim().is_empty() {
                        tracing::warn!("Secretary stream error after collecting {} chars, using partial: {}", full_text.len(), e);
                        break;
                    }
                    sender.send(SSEEvent::Error { message: e.to_string() }).await.ok();
                    return Err(super::AgentError::Model(e));
                }
            }
        }

        if !buffer.is_empty() {
            sender.send(SSEEvent::FacilitatorChunk { chunk: buffer }).await
                .map_err(|e| super::AgentError::Channel(e.to_string()))?;
        }

        if full_text.trim().is_empty() {
            return Err(super::AgentError::Generic("No content streamed from model".to_string()));
        }

        sender.send(SSEEvent::FacilitatorDone).await
            .map_err(|e| super::AgentError::Channel(e.to_string()))?;

        Ok(full_text)
    }
}
