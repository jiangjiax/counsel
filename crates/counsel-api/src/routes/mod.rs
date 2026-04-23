//! API Routes

pub mod projects;
pub mod sessions;
pub mod steps;

pub use projects::*;
pub use sessions::*;
pub use steps::*;

use axum::{
    routing::{get, post, patch, put},
    Router,
};
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

use crate::ApiState;

pub fn create_router(state: ApiState) -> Router {
    let cors = CorsLayer::permissive();

    Router::new()
        .route("/api/personas", get(get_personas))
        .route("/api/settings", get(get_settings).post(post_settings))
        .route("/api/model-settings", put(update_model_settings))
        .route("/api/projects", get(list_projects).post(create_project))
        .route("/api/projects/:projectId", patch(update_project))
        .route("/api/projects/:projectId/sessions", get(list_sessions).post(create_session))
        .route("/api/projects/:projectId/sessions/:sid", get(get_session))
        .route("/api/projects/:projectId/sessions/:sid/files/*filename", get(get_session_file))
        .route("/api/projects/:projectId/sessions/:sid/client-notes", post(save_client_notes))
        .route("/api/projects/:projectId/sessions/:sid/reactions", post(save_reaction))
        .route("/api/projects/:projectId/sessions/:sid/todos/commit", post(commit_todo))
        .route("/api/projects/:projectId/sessions/:sid/conversation", get(get_conversation))
        .route("/api/user-wiki", get(get_user_wiki))
        .route("/api/follow-ups", get(list_follow_ups))
        .route("/api/follow-ups/respond", post(respond_follow_up))
        .route("/api/projects/:projectId/sessions/:sid/steps/:step", post(run_step))
        .route("/api/projects/:projectId/sessions/:sid/steps/complete", post(complete_session))
        .with_state(state)
        .fallback_service(ServeDir::new("public"))
        .layer(cors)
}
