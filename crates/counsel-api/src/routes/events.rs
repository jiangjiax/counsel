//! /api/events — batched analytics ingest.
//!
//! Accepts metadata only (step timing, persona picks, stuck detection). Never
//! chat content. Client buffers events and POSTs in batches of up to 50.

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use serde_json::json;

use crate::auth::AuthUser;
use crate::ApiState;

/// Best-effort client IP extraction. Honors `X-Forwarded-For` (set by nginx
/// when the reverse-proxy is in front), then `X-Real-IP`. Returns the FIRST
/// IP in XFF since downstream proxies append, not prepend.
pub(crate) fn client_ip(headers: &HeaderMap) -> Option<String> {
    if let Some(xff) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
        let first = xff.split(',').next().unwrap_or("").trim();
        if !first.is_empty() {
            return Some(first.to_string());
        }
    }
    if let Some(real) = headers.get("x-real-ip").and_then(|v| v.to_str().ok()) {
        return Some(real.to_string());
    }
    None
}

pub(crate) fn user_agent(headers: &HeaderMap) -> Option<String> {
    headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.chars().take(512).collect::<String>())
}

const MAX_BATCH: usize = 50;
const MAX_DATA_BYTES: usize = 4096;

#[derive(Debug, Deserialize)]
pub struct EventIn {
    pub r#type: String,
    pub data: serde_json::Value,
    pub ts: String,
}

#[derive(Debug, Deserialize)]
pub struct EventsBatch {
    pub events: Vec<EventIn>,
}

pub async fn ingest(
    State(state): State<ApiState>,
    AuthUser(user_id): AuthUser,
    headers: HeaderMap,
    Json(body): Json<EventsBatch>,
) -> impl IntoResponse {
    let ip = client_ip(&headers);
    let ua = user_agent(&headers);
    if body.events.is_empty() {
        return (StatusCode::OK, Json(json!({ "accepted": 0 }))).into_response();
    }
    if body.events.len() > MAX_BATCH {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({ "error": "batch too large" })),
        )
            .into_response();
    }

    let mut tx = match state.db.begin().await {
        Ok(t) => t,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "db unavailable" })),
            )
                .into_response()
        }
    };

    let mut accepted = 0usize;
    for ev in body.events {
        if ev.r#type.is_empty() || ev.r#type.len() > 64 {
            continue;
        }
        let data_str = ev.data.to_string();
        if data_str.len() > MAX_DATA_BYTES {
            continue;
        }
        // §3.9 privacy guard — chat_* events are limited to the whitelist
        // declared in routes/chat.rs. Drop (don't 400) on violation: the
        // event is silently dropped so a faulty client doesn't keep retrying.
        if !crate::routes::chat::chat_event_payload_allowed(&ev.r#type, &ev.data) {
            tracing::warn!(
                "chat telemetry rejected (whitelist violation): type={} keys={:?}",
                ev.r#type,
                ev.data.as_object().map(|o| o.keys().cloned().collect::<Vec<_>>()),
            );
            continue;
        }
        let res = sqlx::query(
            "INSERT INTO events (user_id, event_type, event_data, client_ts, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&user_id)
        .bind(&ev.r#type)
        .bind(&data_str)
        .bind(&ev.ts)
        .bind(ip.as_deref())
        .bind(ua.as_deref())
        .execute(&mut *tx)
        .await;
        if res.is_ok() {
            accepted += 1;
        }
    }

    if tx.commit().await.is_err() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "commit failed" })),
        )
            .into_response();
    }

    (StatusCode::OK, Json(json!({ "accepted": accepted }))).into_response()
}
