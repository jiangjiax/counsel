//! Test utilities for the counsel workspace.
//!
//! Provides a scriptable `MockModelProvider`, a fluent builder, and common
//! test fixtures so every crate in the workspace can write integration tests
//! without hitting real APIs.

pub mod mock_provider;
pub mod builders;
pub mod fixtures;

// Re-exports for convenience
pub use builders::MockProviderBuilder;
pub use fixtures::*;
pub use mock_provider::{
    CallMethod, MockCallRecord, MockErrorKind, MockModelProvider, MockResponse, MockState,
};
