//! API Routes

pub mod admin;
pub mod auth;
pub mod chat;
pub mod classify;
pub mod events;
pub mod feedback;
pub mod follow_ups;
pub mod freestyle;
pub mod persona_wishes;
pub mod refine;
pub mod sessions;
pub mod steps;
pub mod user_wiki_backfill;

pub use refine::refine_question;
pub use sessions::suggest_personas;
pub use steps::*;

use axum::{
    http::{header, StatusCode},
    middleware,
    response::{IntoResponse, Response},
    routing::{get, post, put},
    Router,
};
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

use crate::auth::require_auth;
use crate::ApiState;

fn no_store_response(content_type: &'static str, body: String) -> Response {
    (
        [
            (
                header::CACHE_CONTROL,
                "no-store, no-cache, must-revalidate, max-age=0",
            ),
            (header::PRAGMA, "no-cache"),
            (header::EXPIRES, "0"),
            (header::CONTENT_TYPE, content_type),
        ],
        body,
    )
        .into_response()
}

async fn serve_index_html() -> Response {
    match tokio::fs::read_to_string("public/index.html").await {
        Ok(body) => no_store_response("text/html; charset=utf-8", body),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn serve_client_version() -> Response {
    match tokio::fs::read_to_string("public/client-version.json").await {
        Ok(body) => no_store_response("application/json; charset=utf-8", body),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

/// Admin dashboard assets — served with `no-store` so admin never fights
/// stale cached JS while we iterate on metrics queries.
async fn serve_admin_html() -> Response {
    match tokio::fs::read_to_string("public/admin.html").await {
        Ok(body) => no_store_response("text/html; charset=utf-8", body),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}
async fn serve_admin_js() -> Response {
    match tokio::fs::read_to_string("public/admin.js").await {
        Ok(body) => no_store_response("application/javascript; charset=utf-8", body),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}
async fn serve_admin_css() -> Response {
    match tokio::fs::read_to_string("public/admin.css").await {
        Ok(body) => no_store_response("text/css; charset=utf-8", body),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

/// Chat page (light freestyle track). Served with `no-store` so we never
/// fight a stale Browser/CDN cache while iterating.
async fn serve_chat_html() -> Response {
    match tokio::fs::read_to_string("public/chat.html").await {
        Ok(body) => no_store_response("text/html; charset=utf-8", body),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}
async fn serve_chat_js() -> Response {
    match tokio::fs::read_to_string("public/chat.js").await {
        Ok(body) => no_store_response("application/javascript; charset=utf-8", body),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}
async fn serve_chat_css() -> Response {
    match tokio::fs::read_to_string("public/chat.css").await {
        Ok(body) => no_store_response("text/css; charset=utf-8", body),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

pub fn create_router(state: ApiState) -> Router {
    let cors = CorsLayer::permissive();

    // Public (no auth): registration, login, static assets (served via fallback).
    let public = Router::new()
        .route("/", get(serve_index_html))
        .route("/index.html", get(serve_index_html))
        .route("/client-version.json", get(serve_client_version))
        // Admin dashboard assets — no-store so iteration doesn't fight cache.
        .route("/admin.html", get(serve_admin_html))
        .route("/admin.js", get(serve_admin_js))
        .route("/admin.css", get(serve_admin_css))
        // Chat (light track) page assets — no-store so iteration doesn't fight cache.
        .route("/chat.html", get(serve_chat_html))
        .route("/chat.js", get(serve_chat_js))
        .route("/chat.css", get(serve_chat_css))
        .route("/api/auth/register", post(auth::register))
        .route("/api/auth/login", post(auth::login));

    // Phase D · router surface is now minimal. Everything else lives in the
    // browser's IndexedDB. Server owns only: auth identity, persona registry
    // metadata, LLM-backed step runs (tempdir per request), and analytics.
    let protected = Router::new()
        .route("/api/auth/me", get(auth::me))
        .route("/api/auth/change-password", post(auth::change_password))
        .route("/api/personas", get(get_personas))
        .route("/api/settings", get(get_settings).post(post_settings))
        .route("/api/model-settings", put(update_model_settings))
        .route("/api/suggest-personas", post(suggest_personas))
        .route("/api/refine-question", post(refine_question))
        .route("/api/classify-question", post(classify::classify_question))
        .route(
            "/api/projects/:projectId/sessions/:sid/steps/:step",
            post(run_step),
        )
        .route(
            "/api/projects/:projectId/sessions/:sid/follow-ups/:slug",
            post(follow_ups::submit_follow_up),
        )
        .route(
            "/api/projects/:projectId/sessions/:sid/freestyle",
            post(freestyle::run_freestyle),
        )
        .route("/api/events", post(events::ingest))
        .route("/api/feedback", post(feedback::submit))
        .route("/api/user-wiki/backfill", post(user_wiki_backfill::backfill))
        .route("/api/feedback/replies", get(feedback::unread_replies))
        .route(
            "/api/feedback/replies/seen",
            post(feedback::mark_replies_seen),
        )
        .route("/api/persona-wishes", post(persona_wishes::submit))
        .route(
            "/api/persona-wishes/notifications",
            get(persona_wishes::unread_for_me),
        )
        .route(
            "/api/persona-wishes/notifications/seen",
            post(persona_wishes::mark_seen),
        )
        // Chat (light track) — per-user isolated; require_auth only.
        // Promoted from admin-only on 2026-04-27 (§3.9 in PRIORITY-ROADMAP-PG-BASED.md).
        .route("/api/chat/personas", get(chat::list_personas))
        .route(
            "/api/chat/rooms",
            get(chat::list_rooms).post(chat::create_room),
        )
        .route(
            "/api/chat/rooms/:id",
            get(chat::get_room).delete(chat::delete_room),
        )
        .route("/api/chat/rooms/:id/messages", post(chat::send_message))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth));

    // Admin endpoints sit behind BOTH require_auth (validates JWT) and
    // require_admin (checks username against COUNSEL_ADMIN_USERNAMES).
    let admin_routes = Router::new()
        .route("/api/admin/whoami", get(admin::whoami))
        .route("/api/admin/overview", get(admin::overview))
        .route("/api/admin/funnel", get(admin::funnel))
        .route("/api/admin/categories", get(admin::categories))
        .route("/api/admin/devices", get(admin::devices))
        .route("/api/admin/geography", get(admin::geography))
        .route("/api/admin/feedback", get(admin::feedback_list))
        .route(
            "/api/admin/feedback/:id/replies",
            post(admin::post_feedback_reply),
        )
        .route("/api/admin/recent", get(admin::recent))
        .route("/api/admin/operator", get(admin::operator_summary))
        .route("/api/admin/users", get(admin::users_list))
        .route("/api/admin/users/:user_id", get(admin::user_detail))
        .route("/api/admin/persona-wishes", get(persona_wishes::admin_list))
        .route(
            "/api/admin/persona-wishes/:id/fulfill",
            post(persona_wishes::admin_fulfill),
        )
        // §3.9 chat-mode dashboards (privacy: aggregates over metadata events only)
        .route("/api/admin/chat/overview", get(admin::chat_overview))
        .route("/api/admin/chat/topics", get(admin::chat_topics))
        .route("/api/admin/chat/personas", get(admin::chat_personas))
        .route("/api/admin/chat/retention", get(admin::chat_retention))
        .route("/api/admin/chat/flow", get(admin::chat_flow))
        .route("/api/admin/incidents", get(admin::incidents_list))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            admin::require_admin,
        ))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth));

    Router::new()
        .merge(public)
        .merge(protected)
        .merge(admin_routes)
        .with_state(state)
        .fallback_service(ServeDir::new("public"))
        .layer(cors)
}
