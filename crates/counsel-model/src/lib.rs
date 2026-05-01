//! Counsel Model Provider - Multi-model support for OpenAI, Ollama, MiniMax, Kimi, DeepSeek, DMX, Laozhang

pub mod traits;
pub mod sse;
pub mod openai;
pub mod ollama;
pub mod minimax;
pub mod kimi;
pub mod deepseek;
pub mod dmx;
pub mod laozhang;

// Re-export commonly used types
pub use traits::{ChatMessage, ChatOptions, ChatResponse, ModelError, ModelProvider, ModelResult, StreamingResponse, Usage, estimate_tokens_static, estimate_messages_tokens};
