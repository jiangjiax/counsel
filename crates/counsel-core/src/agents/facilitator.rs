//! Facilitator agent - guides the define step

use async_trait::async_trait;
use counsel_model::{ChatMessage, ChatOptions, ModelProvider};
use std::sync::Arc;

use super::{Agent, AgentResult, BUFFER_THRESHOLD};
use crate::SseSink;

pub struct FacilitatorAgent {
    pub name: String,
    pub model: Arc<dyn ModelProvider>,
}

impl FacilitatorAgent {
    pub fn new(model: Arc<dyn ModelProvider>) -> Self {
        Self {
            name: "Facilitator".into(),
            model,
        }
    }
}

#[async_trait]
impl Agent for FacilitatorAgent {
    fn name(&self) -> &str {
        &self.name
    }

    async fn run(&self, messages: &[ChatMessage], options: ChatOptions) -> AgentResult<String> {
        let response = self.model.chat(messages, options).await?;
        Ok(response.content)
    }

    async fn run_streaming(
        &self,
        messages: &[ChatMessage],
        options: ChatOptions,
        sender: SseSink,
    ) -> AgentResult<()> {
        use crate::SSEEvent;

        let stream = self.model.chat_stream(messages, options).await?;
        futures::pin_mut!(stream);

        let mut buffer = String::new();

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

                        sender.send(SSEEvent::FacilitatorChunk { chunk: to_send }).await
                            .map_err(|e| super::AgentError::Channel(e.to_string()))?;
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
            sender.send(SSEEvent::FacilitatorChunk { chunk: buffer }).await
                .map_err(|e| super::AgentError::Channel(e.to_string()))?;
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
        use crate::SSEEvent;

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
                    sender.send(SSEEvent::Error { message: e.to_string() }).await.ok();
                    return Err(super::AgentError::Model(e));
                }
            }
        }

        if !buffer.is_empty() {
            sender.send(SSEEvent::FacilitatorChunk { chunk: buffer }).await
                .map_err(|e| super::AgentError::Channel(e.to_string()))?;
        }

        sender.send(SSEEvent::FacilitatorDone).await
            .map_err(|e| super::AgentError::Channel(e.to_string()))?;

        Ok(full_text)
    }
}
