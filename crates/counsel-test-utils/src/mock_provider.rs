//! Mock model provider for testing

use counsel_model::{
    ChatMessage, ChatOptions, ChatResponse, ModelError, ModelProvider, ModelResult,
    StreamingResponse, Usage,
};
use futures::FutureExt;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

/// What a mock call should return
#[derive(Debug, Clone)]
pub enum MockResponse {
    /// Successful response streamed in chunks
    Success {
        text: String,
        chunk_size: usize,
        usage: Option<Usage>,
    },
    /// Return an error
    Error(MockErrorKind),
    /// Return an empty stream (no chunks at all)
    EmptyStream,
}

/// Kinds of errors the mock can produce
#[derive(Debug, Clone)]
pub enum MockErrorKind {
    Api(String),
    Stream(String),
    Config(String),
}

impl MockErrorKind {
    fn into_model_error(self) -> ModelError {
        match self {
            MockErrorKind::Api(msg) => ModelError::Api(msg),
            MockErrorKind::Stream(msg) => ModelError::Stream(msg),
            MockErrorKind::Config(msg) => ModelError::Config(msg),
        }
    }
}

/// Record of a single call made to the mock provider
#[derive(Debug, Clone)]
pub struct MockCallRecord {
    pub messages: Vec<ChatMessage>,
    pub options: ChatOptions,
    pub method: CallMethod,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CallMethod {
    Chat,
    ChatStream,
}

/// Internal shared state for the mock
#[derive(Debug)]
pub struct MockState {
    pub queue: VecDeque<MockResponse>,
    pub default_response: Option<MockResponse>,
    pub call_log: Vec<MockCallRecord>,
}

/// A scriptable model provider for tests.
///
/// Stores a queue of responses. Each `chat_stream` or `chat` call pops the
/// front response. When the queue is empty, falls back to `default_response`.
/// All calls are recorded in a log for test assertions.
pub struct MockModelProvider {
    name: String,
    state: Arc<Mutex<MockState>>,
}

impl MockModelProvider {
    pub fn new(
        name: impl Into<String>,
        queue: VecDeque<MockResponse>,
        default_response: Option<MockResponse>,
    ) -> Self {
        Self {
            name: name.into(),
            state: Arc::new(Mutex::new(MockState {
                queue,
                default_response,
                call_log: Vec::new(),
            })),
        }
    }

    /// How many calls have been made (chat + chat_stream combined)
    pub fn call_count(&self) -> usize {
        self.state.lock().unwrap().call_log.len()
    }

    /// Clone the full call log for assertions
    pub fn calls(&self) -> Vec<MockCallRecord> {
        self.state.lock().unwrap().call_log.clone()
    }

    /// How many responses remain in the queue
    pub fn remaining(&self) -> usize {
        self.state.lock().unwrap().queue.len()
    }

    fn pop_response(&self) -> MockResponse {
        let mut state = self.state.lock().unwrap();
        if let Some(resp) = state.queue.pop_front() {
            resp
        } else if let Some(ref default) = state.default_response {
            default.clone()
        } else {
            MockResponse::Error(MockErrorKind::Config(
                "MockModelProvider: queue empty and no default response set".into(),
            ))
        }
    }

    fn record_call(&self, messages: &[ChatMessage], options: &ChatOptions, method: CallMethod) {
        self.state.lock().unwrap().call_log.push(MockCallRecord {
            messages: messages.to_vec(),
            options: options.clone(),
            method,
        });
    }
}

impl ModelProvider for MockModelProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn chat_stream(
        &self,
        messages: &[ChatMessage],
        options: ChatOptions,
    ) -> std::pin::Pin<
        Box<dyn futures::Future<Output = ModelResult<StreamingResponse>> + Send + '_>,
    > {
        self.record_call(messages, &options, CallMethod::ChatStream);
        let response = self.pop_response();

        async move {
            match response {
                MockResponse::Success {
                    text, chunk_size, ..
                } => {
                    let chunks: Vec<String> = text
                        .as_bytes()
                        .chunks(chunk_size.max(1))
                        .map(|c| String::from_utf8_lossy(c).into_owned())
                        .collect();
                    let stream =
                        futures::stream::iter(chunks.into_iter().map(Ok));
                    Ok(Box::pin(stream) as StreamingResponse)
                }
                MockResponse::Error(kind) => Err(kind.into_model_error()),
                MockResponse::EmptyStream => {
                    let stream = futures::stream::empty();
                    Ok(Box::pin(stream) as StreamingResponse)
                }
            }
        }
        .boxed()
    }

    fn chat(
        &self,
        messages: &[ChatMessage],
        options: ChatOptions,
    ) -> std::pin::Pin<Box<dyn futures::Future<Output = ModelResult<ChatResponse>> + Send + '_>>
    {
        self.record_call(messages, &options, CallMethod::Chat);
        let response = self.pop_response();

        async move {
            match response {
                MockResponse::Success { text, usage, .. } => Ok(ChatResponse {
                    content: text,
                    usage,
                }),
                MockResponse::Error(kind) => Err(kind.into_model_error()),
                MockResponse::EmptyStream => Ok(ChatResponse {
                    content: String::new(),
                    usage: None,
                }),
            }
        }
        .boxed()
    }
}

// Safety: state is behind Arc<Mutex>
unsafe impl Send for MockModelProvider {}
unsafe impl Sync for MockModelProvider {}
