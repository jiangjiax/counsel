//! Auth primitives: password hashing, JWT issue/verify, AuthUser extractor.
//!
//! Phase A · introduces per-user identity so the server can rate-limit / bill
//! later. Session data itself stays on the client (IndexedDB); the server only
//! persists `users` rows.

use axum::{
    async_trait,
    extract::{FromRequestParts, Request, State},
    http::{header::AUTHORIZATION, request::Parts, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::ApiState;

const TOKEN_TTL_DAYS: i64 = 90;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
}

pub fn hash_password(plain: &str) -> anyhow::Result<String> {
    Ok(bcrypt::hash(plain, bcrypt::DEFAULT_COST)?)
}

pub fn verify_password(plain: &str, hash: &str) -> bool {
    bcrypt::verify(plain, hash).unwrap_or(false)
}

pub fn make_token(user_id: &str, secret: &str) -> anyhow::Result<String> {
    let exp = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::days(TOKEN_TTL_DAYS))
        .ok_or_else(|| anyhow::anyhow!("exp overflow"))?
        .timestamp() as usize;
    let claims = Claims {
        sub: user_id.to_string(),
        exp,
    };
    Ok(encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?)
}

pub fn verify_token(token: &str, secret: &str) -> anyhow::Result<Claims> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(data.claims)
}

/// Populated by `require_auth` middleware and read via `AuthUser` extractor.
#[derive(Debug, Clone)]
pub struct AuthUser(pub String);

pub struct AuthError;

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "unauthorized" })),
        )
            .into_response()
    }
}

/// Middleware that verifies a Bearer token and stashes `AuthUser` in
/// request extensions. Attach via `.route_layer(from_fn_with_state(state,
/// require_auth))` on any subrouter that must be gated.
pub async fn require_auth(
    State(state): State<ApiState>,
    mut req: Request,
    next: Next,
) -> Response {
    let maybe_token = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.trim().to_string());
    let token = match maybe_token {
        Some(t) if !t.is_empty() => t,
        _ => return AuthError.into_response(),
    };
    match verify_token(&token, state.jwt_secret.as_str()) {
        Ok(claims) => {
            req.extensions_mut().insert(AuthUser(claims.sub));
            next.run(req).await
        }
        Err(_) => AuthError.into_response(),
    }
}

/// Reads the `AuthUser` that `require_auth` inserted. Never used on public
/// routes — missing extension means the middleware wasn't applied (bug), not
/// an auth failure.
#[async_trait]
impl<S: Send + Sync> FromRequestParts<S> for AuthUser {
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        parts.extensions.get::<AuthUser>().cloned().ok_or(AuthError)
    }
}
