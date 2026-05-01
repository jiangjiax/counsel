//! /api/feedback — receives one user-submitted feedback note per click of the
//! floating feedback button. Body is free-text (max 4 KB); context is a small
//! JSON blob describing where the user was when they clicked (current step,
//! session id, project id, page URL). IP + User-Agent come from headers.
//!
//! Auth required. Rate-limited only by per-user fairness — anonymous abuse
//! isn't possible since the user must be logged in.

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::auth::AuthUser;
use crate::routes::events::{client_ip, user_agent};
use crate::ApiState;

const MAX_BODY_BYTES: usize = 4096;
const MAX_CONTEXT_BYTES: usize = 2048;

#[derive(Debug, Deserialize)]
pub struct FeedbackIn {
    pub body: String,
    pub context: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct FeedbackReplyNotification {
    pub id: i64,
    pub feedback_id: i64,
    pub feedback_body: String,
    pub reply_body: String,
    pub created_at: String,
}

pub async fn submit(
    State(state): State<ApiState>,
    AuthUser(user_id): AuthUser,
    headers: HeaderMap,
    Json(payload): Json<FeedbackIn>,
) -> impl IntoResponse {
    let body = payload.body.trim();
    if body.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "feedback body is empty" })),
        )
            .into_response();
    }
    if body.len() > MAX_BODY_BYTES {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({ "error": "feedback too long (max 4KB)" })),
        )
            .into_response();
    }
    let context_str = payload
        .context
        .map(|v| v.to_string())
        .filter(|s| s.len() <= MAX_CONTEXT_BYTES);

    let ip = client_ip(&headers);
    let ua = user_agent(&headers);

    let res = sqlx::query(
        "INSERT INTO feedback (user_id, body, context, ip, user_agent) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&user_id)
    .bind(body)
    .bind(context_str.as_deref())
    .bind(ip.as_deref())
    .bind(ua.as_deref())
    .execute(&state.db)
    .await;

    match res {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "ok": true, "msg": "已收到，谢谢" })),
        )
            .into_response(),
        Err(e) => {
            tracing::warn!("feedback insert failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "save failed" })),
            )
                .into_response()
        }
    }
}

pub async fn unread_replies(
    State(state): State<ApiState>,
    AuthUser(user_id): AuthUser,
) -> impl IntoResponse {
    let rows: Vec<(i64, i64, String, String, String)> = sqlx::query_as(
        "SELECT r.id, r.feedback_id, f.body, r.body, r.created_at \
         FROM feedback_replies r \
         JOIN feedback f ON f.id = r.feedback_id \
         WHERE r.user_id = ? AND r.notified_at IS NULL \
         ORDER BY r.id DESC LIMIT 20",
    )
    .bind(&user_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let out: Vec<FeedbackReplyNotification> = rows
        .into_iter()
        .map(
            |(id, feedback_id, feedback_body, reply_body, created_at)| FeedbackReplyNotification {
                id,
                feedback_id,
                feedback_body,
                reply_body,
                created_at,
            },
        )
        .collect();
    Json(out)
}

pub async fn mark_replies_seen(
    State(state): State<ApiState>,
    AuthUser(user_id): AuthUser,
) -> impl IntoResponse {
    let res = sqlx::query(
        "UPDATE feedback_replies \
         SET notified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE user_id = ? AND notified_at IS NULL",
    )
    .bind(&user_id)
    .execute(&state.db)
    .await;

    match res {
        Ok(done) => Json(json!({ "ok": true, "updated": done.rows_affected() })).into_response(),
        Err(e) => {
            tracing::warn!("feedback replies mark seen failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "save failed" })),
            )
                .into_response()
        }
    }
}
