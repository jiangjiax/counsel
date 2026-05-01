//! Counsel API - HTTP API layer with Axum

pub mod auth;
pub mod error;
pub mod incidents;
pub mod routes;

pub use error::*;
pub use routes::*;

use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use counsel_model::ModelProvider;
use counsel_storage::Storage;
use counsel_core::wisdom::PersonaRegistry;
use sqlx::SqlitePool;
use tokio::sync::oneshot;

/// Registry of in-flight background prefetch tasks (Phase 4.4 Step 6.5
/// pre-run). Keyed by "{session_id}:{task_name}" e.g. "abc123:premortem".
/// Step 6 handler inserts a oneshot Receiver when it spawns the background
/// task; Step 7 handler removes and awaits the receiver to know exactly when
/// the DeepSeek API finished (replaces mtime polling with event-driven wait).
pub type PrefetchRegistry = Arc<Mutex<HashMap<String, oneshot::Receiver<()>>>>;

#[derive(Clone)]
pub struct ApiState {
    pub model: Arc<RwLock<Arc<dyn ModelProvider>>>,
    pub storage: Storage,
    pub registry: Arc<PersonaRegistry>,
    pub prefetches: PrefetchRegistry,
    pub db: SqlitePool,
    pub jwt_secret: Arc<String>,
}

impl ApiState {
    pub fn new(
        model: Arc<dyn ModelProvider>,
        storage: Storage,
        registry: PersonaRegistry,
        db: SqlitePool,
        jwt_secret: String,
    ) -> Self {
        Self {
            model: Arc::new(RwLock::new(model)),
            storage,
            registry: Arc::new(registry),
            prefetches: Arc::new(Mutex::new(HashMap::new())),
            db,
            jwt_secret: Arc::new(jwt_secret),
        }
    }

    pub fn update_model(&self, new_model: Arc<dyn ModelProvider>) {
        let mut guard = self.model.write().unwrap();
        *guard = new_model;
    }
}
