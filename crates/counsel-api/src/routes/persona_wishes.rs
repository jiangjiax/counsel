//! /api/persona-wishes — 案主对幕僚的许愿（v1 17 人列表外的请求）。
//!
//! Auth required for all endpoints. Five handlers:
//!   POST  /api/persona-wishes                          — 提交许愿
//!   GET   /api/persona-wishes/notifications            — 拉本人未读通知
//!   POST  /api/persona-wishes/notifications/seen       — 标记全部已读
//!   GET   /api/admin/persona-wishes                    — 管理员看许愿池
//!   POST  /api/admin/persona-wishes/:id/fulfill        — 管理员标记已实现
//!
//! 单表 persona_wishes，notified_at 字段双工：null 表示「fulfilled 但案主还没看过」。

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, HashSet};

use crate::auth::AuthUser;
use crate::ApiState;

const MAX_NAME_CHARS: usize = 30;

#[derive(Debug, Deserialize)]
pub struct WishIn {
    pub persona_name: String,
}

pub async fn submit(
    State(state): State<ApiState>,
    AuthUser(user_id): AuthUser,
    Json(payload): Json<WishIn>,
) -> impl IntoResponse {
    let name = payload.persona_name.trim();
    if name.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "许愿不能为空" })),
        )
            .into_response();
    }
    let char_count = name.chars().count();
    if char_count > MAX_NAME_CHARS {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "幕僚名字 ≤ 30 字" })),
        )
            .into_response();
    }

    // Idempotent (Michael 2026-04-27): if this user has already wished this
    // exact persona name and it's still pending, treat the second submit as
    // a friendly no-op rather than an error / duplicate row. Keeps the
    // wish-pool clean and gives the case-owner reassurance ("we heard you").
    // Re-allow re-wishing only after admin has fulfilled the previous wish
    // (so re-asking after fulfillment is meaningful — "still want this person").
    let existing: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM persona_wishes \
         WHERE user_id = ? AND persona_name = ? AND status = 'pending' \
         LIMIT 1",
    )
    .bind(&user_id)
    .bind(name)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    if existing.is_some() {
        return (
            StatusCode::OK,
            Json(json!({
                "ok": true,
                "msg": "你之前已经许过这个愿啦，主持人记着呢 🙏",
                "deduplicated": true,
            })),
        )
            .into_response();
    }

    let res = sqlx::query("INSERT INTO persona_wishes (user_id, persona_name) VALUES (?, ?)")
        .bind(&user_id)
        .bind(name)
        .execute(&state.db)
        .await;

    match res {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "ok": true, "msg": "已收到，谢谢你的许愿 🙏" })),
        )
            .into_response(),
        Err(e) => {
            tracing::warn!("persona_wishes insert failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("save failed: {}", e) })),
            )
                .into_response()
        }
    }
}

#[derive(Debug, Serialize)]
pub struct UnreadWish {
    pub id: i64,
    pub persona_name: String,
    pub fulfilled_at: Option<String>,
}

pub async fn unread_for_me(
    State(state): State<ApiState>,
    AuthUser(user_id): AuthUser,
) -> impl IntoResponse {
    let rows: Vec<(i64, String, Option<String>)> = sqlx::query_as(
        "SELECT id, persona_name, fulfilled_at FROM persona_wishes \
         WHERE user_id = ? AND status = 'fulfilled' AND notified_at IS NULL \
         ORDER BY id DESC",
    )
    .bind(&user_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let out: Vec<UnreadWish> = rows
        .into_iter()
        .map(|(id, persona_name, fulfilled_at)| UnreadWish {
            id,
            persona_name,
            fulfilled_at,
        })
        .collect();
    Json(out).into_response()
}

pub async fn mark_seen(
    State(state): State<ApiState>,
    AuthUser(user_id): AuthUser,
) -> impl IntoResponse {
    let res = sqlx::query(
        "UPDATE persona_wishes SET notified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE user_id = ? AND status = 'fulfilled' AND notified_at IS NULL",
    )
    .bind(&user_id)
    .execute(&state.db)
    .await;

    match res {
        Ok(r) => (
            StatusCode::OK,
            Json(json!({ "ok": true, "marked": r.rows_affected() })),
        )
            .into_response(),
        Err(e) => {
            tracing::warn!("persona_wishes mark_seen failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "update failed" })),
            )
                .into_response()
        }
    }
}

#[derive(Debug, Serialize)]
pub struct AdminWishRow {
    pub id: i64,
    pub user_id: String,
    pub username: Option<String>,
    pub persona_name: String,
    pub status: String,
    pub created_at: String,
    pub fulfilled_at: Option<String>,
    pub notified_at: Option<String>,
}

pub async fn admin_list(State(state): State<ApiState>) -> impl IntoResponse {
    let rows: Vec<(i64, String, String, String, String, Option<String>, Option<String>)> =
        sqlx::query_as(
            "SELECT id, user_id, persona_name, status, created_at, fulfilled_at, notified_at \
             FROM persona_wishes ORDER BY id DESC LIMIT 500",
        )
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

    let user_ids: HashSet<&str> = rows.iter().map(|r| r.1.as_str()).collect();
    let mut id_to_name: HashMap<String, String> = HashMap::new();
    for uid in user_ids {
        if let Ok(Some(n)) = sqlx::query_scalar::<_, String>("SELECT username FROM users WHERE id = ?")
            .bind(uid)
            .fetch_optional(&state.db)
            .await
        {
            id_to_name.insert(uid.to_string(), n);
        }
    }

    let out: Vec<AdminWishRow> = rows
        .into_iter()
        .map(
            |(id, user_id, persona_name, status, created_at, fulfilled_at, notified_at)| {
                AdminWishRow {
                    id,
                    username: id_to_name.get(&user_id).cloned(),
                    user_id,
                    persona_name,
                    status,
                    created_at,
                    fulfilled_at,
                    notified_at,
                }
            },
        )
        .collect();
    Json(out).into_response()
}

pub async fn admin_fulfill(
    State(state): State<ApiState>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let res = sqlx::query(
        "UPDATE persona_wishes \
         SET status = 'fulfilled', fulfilled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
             notified_at = NULL \
         WHERE id = ? AND status = 'pending'",
    )
    .bind(id)
    .execute(&state.db)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "wish not found or already fulfilled" })),
        )
            .into_response(),
        Ok(_) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => {
            tracing::warn!("persona_wishes fulfill failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "update failed" })),
            )
                .into_response()
        }
    }
}
