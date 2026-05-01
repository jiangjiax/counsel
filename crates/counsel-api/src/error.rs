//! API Error types

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Bad request: {0}")]
    BadRequest(String),
    #[error("Internal error: {0}")]
    Internal(String),
    #[error("Storage error: {0}")]
    Storage(#[from] counsel_storage::StorageError),
    #[error("Core error: {0}")]
    Core(#[from] counsel_core::CoreError),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        use counsel_storage::StorageError;
        let (status, message) = match &self {
            ApiError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            ApiError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            ApiError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.clone()),
            // Map StorageError::NotFound to 404, everything else stays 500.
            // Previously this was blanket-500, which turned missing-file file reads
            // into red devtools errors during normal "check if cached file exists"
            // flows (see 2026-04-22 Step 7/8 pre-check 500 bug).
            ApiError::Storage(e) => match e {
                StorageError::NotFound(_) => (StatusCode::NOT_FOUND, e.to_string()),
                _ => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
            },
            ApiError::Core(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        };

        let body = Json(json!({
            "error": message
        }));

        (status, body).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
