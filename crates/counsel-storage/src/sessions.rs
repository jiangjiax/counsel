//! Session storage

use super::{Storage, StorageResult};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub project_id: String,
    pub raw_input: String,
    pub current_step: u8,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub id: String,
    pub project_id: String,
    pub raw_input: String,
    pub current_step: u8,
    pub created_at: String,
    pub updated_at: String,
}

impl Session {
    pub fn new(project_id: String, raw_input: String) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            project_id,
            raw_input,
            current_step: 0,
            created_at: now,
            updated_at: now,
        }
    }
}

impl Storage {
    pub async fn list_sessions(&self, project_id: &str) -> StorageResult<Vec<SessionSummary>> {
        let mut sessions = Vec::new();
        let project_dir = self.project_dir(project_id);
        let mut entries = tokio::fs::read_dir(&project_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with("session-") && path.is_dir() {
                    let session_path = path.join("session.json");
                    if session_path.exists() {
                        let content = tokio::fs::read_to_string(&session_path).await?;
                        let session: SessionSummary = serde_json::from_str(&content)?;
                        sessions.push(session);
                    }
                }
            }
        }
        sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(sessions)
    }

    pub async fn create_session(&self, project_id: &str, raw_input: String) -> StorageResult<Session> {
        let session = Session::new(project_id.to_string(), raw_input);
        let dir = self.session_dir(project_id, &session.id);
        tokio::fs::create_dir_all(&dir).await?;
        let session_path = dir.join("session.json");
        let summary = SessionSummary {
            id: session.id.clone(),
            project_id: session.project_id.clone(),
            raw_input: session.raw_input.clone(),
            current_step: session.current_step,
            created_at: session.created_at.to_rfc3339(),
            updated_at: session.updated_at.to_rfc3339(),
        };
        tokio::fs::write(&session_path, serde_json::to_string_pretty(&summary)?).await?;
        Ok(session)
    }

    pub async fn get_session(&self, project_id: &str, session_id: &str) -> StorageResult<SessionSummary> {
        let session_path = self.session_dir(project_id, session_id).join("session.json");
        let content = tokio::fs::read_to_string(&session_path).await?;
        let session: SessionSummary = serde_json::from_str(&content)?;
        Ok(session)
    }

    pub async fn update_session_step(&self, project_id: &str, session_id: &str, step: u8) -> StorageResult<SessionSummary> {
        let session_path = self.session_dir(project_id, session_id).join("session.json");
        let content = tokio::fs::read_to_string(&session_path).await?;
        let mut session: SessionSummary = serde_json::from_str(&content)?;
        session.current_step = step;
        session.updated_at = Utc::now().to_rfc3339();
        tokio::fs::write(&session_path, serde_json::to_string_pretty(&session)?).await?;
        Ok(session)
    }
}
