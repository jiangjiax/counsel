//! /api/auth/* — register, login, me.

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::auth::{hash_password, make_token, verify_password, AuthUser};
use crate::ApiState;

#[derive(Debug, Deserialize)]
pub struct AuthBody {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthOk {
    pub user_id: String,
    pub username: String,
    pub token: String,
}

const USERNAME_MIN: usize = 3;
const USERNAME_MAX: usize = 128;
const PASSWORD_MIN: usize = 6;
const PASSWORD_MAX: usize = 128;

fn validate_body(body: &AuthBody) -> Result<(), (StatusCode, &'static str)> {
    let u = body.username.trim();
    if u.len() < USERNAME_MIN || u.len() > USERNAME_MAX {
        return Err((StatusCode::BAD_REQUEST, "用户名长度 3-128"));
    }
    // Allow usernames + emails: a-z A-Z 0-9 . _ - @ +
    if !u
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.' | '@' | '+'))
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "用户名只能是字母、数字、下划线、短横线、点、@、+",
        ));
    }
    let p = &body.password;
    if p.chars().count() < PASSWORD_MIN || p.chars().count() > PASSWORD_MAX {
        return Err((StatusCode::BAD_REQUEST, "密码长度 6-128"));
    }
    Ok(())
}

pub async fn register(
    State(state): State<ApiState>,
    Json(body): Json<AuthBody>,
) -> impl IntoResponse {
    if let Err((code, msg)) = validate_body(&body) {
        return (code, Json(json!({ "error": msg }))).into_response();
    }
    let username = body.username.trim().to_string();

    let existing: Option<(String,)> =
        sqlx::query_as("SELECT id FROM users WHERE username = ?")
            .bind(&username)
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None);
    if existing.is_some() {
        return (
            StatusCode::CONFLICT,
            Json(json!({ "error": "username taken" })),
        )
            .into_response();
    }

    let id = Uuid::new_v4().to_string();
    let hash = match hash_password(&body.password) {
        Ok(h) => h,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "hash failed" })),
            )
                .into_response()
        }
    };

    let insert = sqlx::query("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(&username)
        .bind(&hash)
        .execute(&state.db)
        .await;
    if insert.is_err() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "insert failed" })),
        )
            .into_response();
    }

    let token = match make_token(&id, state.jwt_secret.as_str()) {
        Ok(t) => t,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "token failed" })),
            )
                .into_response()
        }
    };

    (
        StatusCode::OK,
        Json(AuthOk {
            user_id: id,
            username,
            token,
        }),
    )
        .into_response()
}

pub async fn login(
    State(state): State<ApiState>,
    Json(body): Json<AuthBody>,
) -> impl IntoResponse {
    let username = body.username.trim().to_string();

    let row: Option<(String, String)> =
        sqlx::query_as("SELECT id, password_hash FROM users WHERE username = ?")
            .bind(&username)
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None);

    let (id, hash) = match row {
        Some(r) => r,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "invalid credentials" })),
            )
                .into_response()
        }
    };

    if !verify_password(&body.password, &hash) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "invalid credentials" })),
        )
            .into_response();
    }

    let token = match make_token(&id, state.jwt_secret.as_str()) {
        Ok(t) => t,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "token failed" })),
            )
                .into_response()
        }
    };

    (
        StatusCode::OK,
        Json(AuthOk {
            user_id: id,
            username,
            token,
        }),
    )
        .into_response()
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordBody {
    pub old_password: String,
    pub new_password: String,
}

/// POST /api/auth/change-password — verifies the old password, replaces the
/// hash with one for the new password. Other tokens issued before the change
/// remain valid until they expire (90-day TTL); we don't bump a version
/// counter since password change is rare and the existing token belongs to
/// the same user. If a stricter policy is needed later, add a `pwd_rev`
/// column and bake it into JWT claims.
pub async fn change_password(
    State(state): State<ApiState>,
    AuthUser(user_id): AuthUser,
    Json(body): Json<ChangePasswordBody>,
) -> impl IntoResponse {
    let new = body.new_password.as_str();
    let new_chars = new.chars().count();
    if new_chars < PASSWORD_MIN || new_chars > PASSWORD_MAX {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "新密码长度必须在 6-128 之间" })),
        )
            .into_response();
    }
    if body.old_password == body.new_password {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "新密码不能和旧密码相同" })),
        )
            .into_response();
    }

    let row: Option<(String,)> =
        sqlx::query_as("SELECT password_hash FROM users WHERE id = ?")
            .bind(&user_id)
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None);
    let current_hash = match row {
        Some((h,)) => h,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "用户不存在" })),
            )
                .into_response()
        }
    };
    if !verify_password(&body.old_password, &current_hash) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "旧密码不正确" })),
        )
            .into_response();
    }

    let new_hash = match hash_password(new) {
        Ok(h) => h,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "hash failed" })),
            )
                .into_response()
        }
    };

    let res = sqlx::query("UPDATE users SET password_hash = ? WHERE id = ?")
        .bind(&new_hash)
        .bind(&user_id)
        .execute(&state.db)
        .await;
    match res {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "ok": true, "msg": "密码已更新" })),
        )
            .into_response(),
        Err(e) => {
            tracing::warn!("change_password update failed for {}: {}", user_id, e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "保存失败" })),
            )
                .into_response()
        }
    }
}

pub async fn me(
    State(state): State<ApiState>,
    AuthUser(user_id): AuthUser,
) -> impl IntoResponse {
    let row: Option<(String,)> = sqlx::query_as("SELECT username FROM users WHERE id = ?")
        .bind(&user_id)
        .fetch_optional(&state.db)
        .await
        .unwrap_or(None);
    match row {
        Some((username,)) => (
            StatusCode::OK,
            Json(json!({ "user_id": user_id, "username": username })),
        )
            .into_response(),
        None => (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "user missing" })),
        )
            .into_response(),
    }
}
