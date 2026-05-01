//! Project storage

use super::{Storage, StorageResult};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMeta {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Project {
    pub fn new(name: impl Into<String>, description: Option<String>) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.into(),
            description,
            created_at: now,
            updated_at: now,
        }
    }
}

impl Storage {
    pub async fn list_projects(&self) -> StorageResult<Vec<ProjectMeta>> {
        let mut projects = Vec::new();
        let mut entries = tokio::fs::read_dir(&self.root).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.is_dir() {
                let meta_path = path.join("meta.json");
                if meta_path.exists() {
                    let content = tokio::fs::read_to_string(&meta_path).await?;
                    let meta: ProjectMeta = serde_json::from_str(&content)?;
                    projects.push(meta);
                }
            }
        }
        Ok(projects)
    }

    pub async fn create_project(&self, name: impl Into<String>, description: Option<String>) -> StorageResult<Project> {
        let project = Project::new(name, description);
        let dir = self.project_dir(&project.id);
        tokio::fs::create_dir_all(&dir).await?;
        let meta = ProjectMeta {
            id: project.id.clone(),
            name: project.name.clone(),
            description: project.description.clone(),
            created_at: project.created_at.to_rfc3339(),
            updated_at: project.updated_at.to_rfc3339(),
        };
        let meta_path = dir.join("meta.json");
        tokio::fs::write(&meta_path, serde_json::to_string_pretty(&meta)?).await?;
        Ok(project)
    }

    pub async fn get_project(&self, project_id: &str) -> StorageResult<ProjectMeta> {
        let meta_path = self.project_dir(project_id).join("meta.json");
        let content = tokio::fs::read_to_string(&meta_path).await?;
        let meta: ProjectMeta = serde_json::from_str(&content)?;
        Ok(meta)
    }

    pub async fn update_project(&self, project_id: &str, name: String, description: Option<String>) -> StorageResult<ProjectMeta> {
        let dir = self.project_dir(project_id);
        let meta_path = dir.join("meta.json");
        let content = tokio::fs::read_to_string(&meta_path).await?;
        let mut meta: ProjectMeta = serde_json::from_str(&content)?;
        meta.name = name;
        meta.description = description;
        meta.updated_at = Utc::now().to_rfc3339();
        tokio::fs::write(&meta_path, serde_json::to_string_pretty(&meta)?).await?;
        Ok(meta)
    }
}
