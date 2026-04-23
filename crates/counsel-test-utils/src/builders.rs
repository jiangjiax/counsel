//! Fluent builder for MockModelProvider

use counsel_model::ModelProvider;
use std::collections::VecDeque;
use std::sync::Arc;

use crate::mock_provider::{MockErrorKind, MockModelProvider, MockResponse};

/// Fluent builder for constructing a MockModelProvider.
pub struct MockProviderBuilder {
    name: String,
    queue: VecDeque<MockResponse>,
    default_response: Option<MockResponse>,
    chunk_size: usize,
}

impl Default for MockProviderBuilder {
    fn default() -> Self {
        Self {
            name: "mock".into(),
            queue: VecDeque::new(),
            default_response: None,
            chunk_size: 20,
        }
    }
}

impl MockProviderBuilder {
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the provider name.
    pub fn name(mut self, name: impl Into<String>) -> Self {
        self.name = name.into();
        self
    }

    /// Set the default chunk size for streaming responses.
    pub fn chunk_size(mut self, size: usize) -> Self {
        self.chunk_size = size;
        self
    }

    /// Queue a successful text response.
    pub fn with_response(mut self, text: impl Into<String>) -> Self {
        self.queue.push_back(MockResponse::Success {
            text: text.into(),
            chunk_size: self.chunk_size,
            usage: None,
        });
        self
    }

    /// Queue N identical successful text responses.
    pub fn with_responses(mut self, text: impl Into<String>, count: usize) -> Self {
        let text = text.into();
        for _ in 0..count {
            self.queue.push_back(MockResponse::Success {
                text: text.clone(),
                chunk_size: self.chunk_size,
                usage: None,
            });
        }
        self
    }

    /// Queue an error response.
    pub fn with_error(mut self, kind: MockErrorKind) -> Self {
        self.queue.push_back(MockResponse::Error(kind));
        self
    }

    /// Queue an empty stream response.
    pub fn with_empty_stream(mut self) -> Self {
        self.queue.push_back(MockResponse::EmptyStream);
        self
    }

    /// Set the fallback response used when the queue is empty.
    pub fn default_response(mut self, text: impl Into<String>) -> Self {
        self.default_response = Some(MockResponse::Success {
            text: text.into(),
            chunk_size: self.chunk_size,
            usage: None,
        });
        self
    }

    /// Build the MockModelProvider.
    pub fn build(self) -> MockModelProvider {
        MockModelProvider::new(self.name, self.queue, self.default_response)
    }

    /// Build and wrap in Arc<dyn ModelProvider>.
    pub fn build_arc(self) -> Arc<dyn ModelProvider> {
        Arc::new(self.build())
    }
}
