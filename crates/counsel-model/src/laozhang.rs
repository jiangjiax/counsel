//! Laozhang AI model provider - OpenAI-compatible API
//! Base URL: https://api.laozhang.ai/v1

use std::time::Duration;
use futures::{FutureExt, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::traits::{BoxFuture, ChatMessage, ChatOptions, ChatResponse, MessageRole, ModelError, ModelProvider, ModelResult, StreamingResponse};

pub struct LaozhangProvider {
    name: String,
    client: Client,
    base_url: String,
    model: String,
    api_key: String,
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatRequestMessage>,
    stream: bool,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
}

#[derive(Serialize)]
struct ChatRequestMessage {
    role: String,
    content: String,
}

#[derive(Deserialize, Debug)]
struct StreamChunk {
    choices: Option<Vec<StreamChoice>>,
}

#[derive(Deserialize, Debug)]
struct StreamChoice {
    delta: Option<Delta>,
}

#[derive(Deserialize, Debug)]
struct Delta {
    content: Option<String>,
}

#[derive(Deserialize, Debug)]
struct NonStreamResponse {
    choices: Option<Vec<NonStreamChoice>>,
}

#[derive(Deserialize, Debug)]
struct NonStreamChoice {
    message: Option<MessageContent>,
}

#[derive(Deserialize, Debug)]
struct MessageContent {
    content: Option<String>,
}

impl LaozhangProvider {
    pub fn new(model: impl Into<String>, api_key: impl Into<String>) -> Self {
        Self {
            name: "laozhang".into(),
            client: Client::builder()
                .connect_timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| Client::new()),
            base_url: "https://api.laozhang.ai/v1".into(),
            model: model.into(),
            api_key: api_key.into(),
        }
    }

    pub fn with_base_url(mut self, base_url: impl Into<String>) -> Self {
        self.base_url = base_url.into();
        self
    }
}

impl ModelProvider for LaozhangProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn chat(
        &self,
        messages: &[ChatMessage],
        options: ChatOptions,
    ) -> BoxFuture<'_, ModelResult<ChatResponse>> {
        let client = self.client.clone();
        let base_url = self.base_url.clone();
        let api_key = self.api_key.clone();
        let model = options.model.as_deref().unwrap_or(&self.model).to_string();

        let request = ChatRequest {
            model: model.clone(),
            messages: messages
                .iter()
                .map(|m| ChatRequestMessage {
                    role: match m.role {
                        MessageRole::System => "system",
                        MessageRole::User => "user",
                        MessageRole::Assistant => "assistant",
                    }
                    .to_string(),
                    content: m.content.clone(),
                })
                .collect(),
            stream: false,
            max_tokens: options.max_tokens,
            temperature: options.temperature,
        };

        async move {
            let response = client
                .post(format!("{}/chat/completions", base_url))
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .json(&request)
                .send()
                .await?;

            let resp_text = response.text().await?;

            let parsed: NonStreamResponse = serde_json::from_str(&resp_text)
                .map_err(|e| ModelError::Api(format!("Failed to parse response: {}", e)))?;

            let content = parsed
                .choices
                .and_then(|c| c.into_iter().next())
                .and_then(|choice| choice.message)
                .and_then(|msg| msg.content)
                .unwrap_or_default();

            Ok(ChatResponse { content, usage: None })
        }
        .boxed()
    }

    fn chat_stream(
        &self,
        messages: &[ChatMessage],
        options: ChatOptions,
    ) -> BoxFuture<'_, ModelResult<StreamingResponse>> {
        let client = self.client.clone();
        let base_url = self.base_url.clone();
        let api_key = self.api_key.clone();
        let model = options.model.as_deref().unwrap_or(&self.model).to_string();

        let request = ChatRequest {
            model: model.clone(),
            messages: messages
                .iter()
                .map(|m| ChatRequestMessage {
                    role: match m.role {
                        MessageRole::System => "system",
                        MessageRole::User => "user",
                        MessageRole::Assistant => "assistant",
                    }
                    .to_string(),
                    content: m.content.clone(),
                })
                .collect(),
            stream: true,
            max_tokens: options.max_tokens,
            temperature: options.temperature,
        };

        async move {
            let response = client
                .post(format!("{}/chat/completions", base_url))
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .json(&request)
                .send()
                .await?;

            let stream = response.bytes_stream();
            let decoder = crate::sse::LineDecoder::new();

            Ok(Box::pin(futures::stream::unfold((stream, decoder, false), |(mut stream, mut decoder, mut ended)| async move {
                loop {
                    if ended {
                        return None;
                    }
                    match stream.next().await {
                        Some(Ok(bytes)) => {
                            let lines = decoder.feed(&bytes);
                            let items = parse_sse_lines(&lines);
                            if !items.is_empty() {
                                return Some((futures::stream::iter(items), (stream, decoder, ended)));
                            }
                        }
                        Some(Err(e)) => {
                            return Some((
                                futures::stream::iter(vec![Err(ModelError::Network(e))]),
                                (stream, decoder, true),
                            ));
                        }
                        None => {
                            ended = true;
                            let items = decoder.flush()
                                .map(|line| parse_sse_lines(&[line]))
                                .unwrap_or_default();
                            if items.is_empty() {
                                return None;
                            }
                            return Some((futures::stream::iter(items), (stream, decoder, ended)));
                        }
                    }
                }
            }).flatten()) as StreamingResponse)
        }
        .boxed()
    }
}

fn parse_sse_lines(lines: &[String]) -> Vec<ModelResult<String>> {
    let mut out = Vec::new();
    for line in lines {
        let Some(data) = line.strip_prefix("data: ") else { continue };
        if data.trim() == "[DONE]" {
            continue;
        }
        let Ok(chunk) = serde_json::from_str::<StreamChunk>(data) else { continue };
        let Some(choice) = chunk.choices.and_then(|c| c.into_iter().next()) else { continue };
        let Some(delta) = choice.delta else { continue };
        let Some(content) = delta.content else { continue };
        out.push(Ok(content));
    }
    out
}
