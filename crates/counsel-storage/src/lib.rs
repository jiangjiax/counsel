//! Counsel Storage - Filesystem-based storage for projects and sessions

pub mod projects;
pub mod sessions;
pub mod files;

pub use projects::*;
pub use sessions::*;
pub use files::{CoreFact, UserContext, CORE_BUDGET};

use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Not found: {0}")]
    NotFound(String),
}

pub type StorageResult<T> = Result<T, StorageError>;

/// Root storage manager
#[derive(Clone)]
pub struct Storage {
    root: PathBuf,
}

impl Storage {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn root(&self) -> &PathBuf {
        &self.root
    }

    pub fn projects_dir(&self) -> PathBuf {
        self.root.clone()
    }

    pub fn project_dir(&self, project_id: &str) -> PathBuf {
        self.root.join(project_id)
    }

    pub fn session_dir(&self, project_id: &str, session_id: &str) -> PathBuf {
        self.root.join(project_id).join(format!("session-{}", session_id))
    }
}
