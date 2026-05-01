//! Ollama model provider

use std::time::Duration;
use futures::{FutureExt, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::traits::{BoxFuture, ChatMessage, ChatOptions, MessageRole, ModelError, ModelProvider, ModelResult, StreamingResponse};

pub struct OllamaProvider {
    name: String,
    client: Client,
    base_url: String,
    model: String,
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatRequestMessage>,
    stream: bool,
    options: ChatOptions2,
}

#[derive(Serialize)]
struct ChatRequestMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct ChatOptions2 {
    temperature: Option<f32>,
    num_predict: Option<u32>,
}

#[derive(Deserialize, Debug)]
struct StreamChunk {
    message: Option<Message>,
    #[allow(dead_code)]
    done: Option<bool>,
}

#[derive(Deserialize, Debug)]
struct Message {
    content: Option<String>,
}

impl OllamaProvider {
    pub fn new(model: impl Into<String>) -> Self {
        Self {
            name: "ollama".into(),
            client: Client::builder()
                .connect_timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| Client::new()),
            base_url: "http://127.0.0.1:11434".into(),
            model: model.into(),
        }
    }

    pub fn base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = url.into();
        self
    }
}

impl ModelProvider for OllamaProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn chat_stream(
        &self,
        messages: &[ChatMessage],
        options: ChatOptions,
    ) -> BoxFuture<'_, ModelResult<StreamingResponse>> {
        let client = self.client.clone();
        let base_url = self.base_url.clone();
        let model_name = options.model.clone().unwrap_or_else(|| self.model.clone());

        let msgs: Vec<ChatRequestMessage> = messages
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
            .collect();

        let request = ChatRequest {
            model: model_name,
            messages: msgs,
            stream: true,
            options: ChatOptions2 {
                temperature: options.temperature,
                num_predict: options.max_tokens,
            },
        };

        async move {
            let response = client
                .post(format!("{}/api/chat", base_url))
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
                            let items = parse_ndjson_lines(&lines);
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
                                .map(|line| parse_ndjson_lines(&[line]))
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

fn parse_ndjson_lines(lines: &[String]) -> Vec<ModelResult<String>> {
    let mut out = Vec::new();
    for line in lines {
        if line.trim().is_empty() {
            continue;
        }
        let Ok(chunk) = serde_json::from_str::<StreamChunk>(line) else { continue };
        if let Some(msg) = chunk.message {
            if let Some(content) = msg.content {
                if !content.is_empty() {
                    out.push(Ok(content));
                }
            }
        }
        // done == true is informational; rely on stream close for termination.
    }
    out
}
