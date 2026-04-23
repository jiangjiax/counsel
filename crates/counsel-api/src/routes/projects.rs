//! Project routes

use axum::{extract::{Path, State}, Json};
use serde::{Deserialize, Serialize};

use crate::{ApiResult, ApiState};

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateProjectRequest {
    pub name: Option<String>,
    pub description: Option<String>,
}

pub async fn list_projects(State(state): State<ApiState>) -> ApiResult<Json<Vec<counsel_storage::ProjectMeta>>> {
    let projects = state.storage.list_projects().await?;
    Ok(Json(projects))
}

pub async fn create_project(
    State(state): State<ApiState>,
    Json(req): Json<CreateProjectRequest>,
) -> ApiResult<Json<counsel_storage::Project>> {
    let project = state.storage.create_project(&req.name, req.description).await?;
    Ok(Json(project))
}

pub async fn update_project(
    State(state): State<ApiState>,
    Path(project_id): Path<String>,
    Json(req): Json<UpdateProjectRequest>,
) -> ApiResult<Json<counsel_storage::ProjectMeta>> {
    let name = req.name.unwrap_or_else(|| "Untitled".to_string());
    let project = state.storage.update_project(&project_id, name, req.description).await?;
    Ok(Json(project))
}

pub async fn get_user_wiki(
    State(state): State<ApiState>,
) -> ApiResult<String> {
    let wiki = state.storage.read_user_wiki().await?;
    Ok(wiki)
}
