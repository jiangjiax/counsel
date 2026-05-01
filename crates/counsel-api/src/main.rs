//! Counsel API Server

use std::sync::Arc;
use counsel_api::{routes::create_router, ApiState};
use counsel_model::{
    deepseek::DeepSeekProvider,
    kimi::KimiProvider,
    minimax::MiniMaxProvider,
    ollama::OllamaProvider,
    openai::OpenAiProvider,
    dmx::DmxProvider,
    laozhang::LaozhangProvider,
    ModelProvider,
};
use counsel_storage::Storage;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::str::FromStr;
use tokio::net::TcpListener;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize logging
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Initialize storage
    let storage = Storage::new(
        std::env::var("STORAGE_ROOT")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|_| std::path::PathBuf::from("./sessions")),
    );

    // One-shot migration: split legacy `user-wiki.md` into per-session
    // `user-data/log/{sid}.md` plus a fresh INDEX.md. Idempotent — the
    // migration drops a `.migrated` stamp file inside `user-data/` and
    // skips on subsequent runs. Failures are logged but never block boot.
    match storage.migrate_user_wiki_to_log().await {
        Ok(0) => {}
        Ok(n) => tracing::info!(
            "user-wiki tier migration: split {} session blocks into user-data/log/",
            n
        ),
        Err(e) => tracing::warn!("user-wiki tier migration failed (non-fatal): {}", e),
    }

    // Initialize model provider based on MODEL_PROVIDER env var
    let model_provider_name = std::env::var("MODEL_PROVIDER")
        .unwrap_or_else(|_| "ollama".into());

    let model: Arc<dyn ModelProvider> = match model_provider_name.as_str() {
        "deepseek" => {
            let api_key = std::env::var("DEEPSEEK_API_KEY")
                .expect("DEEPSEEK_API_KEY must be set for deepseek provider");
            Arc::new(DeepSeekProvider::new(
                std::env::var("DEEPSEEK_MODEL").unwrap_or_else(|_| "deepseek-v4-flash".into()),
                api_key,
            ))
        }
        "kimi" => {
            let api_key = std::env::var("KIMI_API_KEY")
                .expect("KIMI_API_KEY must be set for kimi provider");
            Arc::new(KimiProvider::new(
                std::env::var("KIMI_MODEL").unwrap_or_else(|_| "moonshot-v1-8k".into()),
                api_key,
            ))
        }
        "minimax" => {
            let api_key = std::env::var("MINIMAX_API_KEY")
                .expect("MINIMAX_API_KEY must be set for minimax provider");
            let group_id = std::env::var("MINIMAX_GROUP_ID")
                .expect("MINIMAX_GROUP_ID must be set for minimax provider");
            Arc::new(MiniMaxProvider::new(
                std::env::var("MINIMAX_MODEL").unwrap_or_else(|_| "MiniMax-M2.7".into()),
                api_key,
                group_id,
            ))
        }
        "openai" => {
            let api_key = std::env::var("OPENAI_API_KEY")
                .expect("OPENAI_API_KEY must be set for openai provider");
            Arc::new(OpenAiProvider::new(
                std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-4".into()),
                api_key,
            ))
        }
        "dmx" => {
            let api_key = std::env::var("DMX_API_KEY")
                .expect("DMX_API_KEY must be set for dmx provider");
            let user_id = std::env::var("DMX_USER_ID").unwrap_or_else(|_| "".into());
            Arc::new(DmxProvider::new(
                std::env::var("DMX_MODEL").unwrap_or_else(|_| "gpt-4o".into()),
                api_key,
                user_id,
            ))
        }
        "laozhang" => {
            let api_key = std::env::var("LAOZHANG_API_KEY")
                .expect("LAOZHANG_API_KEY must be set for laozhang provider");
            Arc::new(LaozhangProvider::new(
                std::env::var("LAOZHANG_MODEL").unwrap_or_else(|_| "gpt-4o".into()),
                api_key,
            ))
        }
        _ => {
            // Default to Ollama
            Arc::new(
                OllamaProvider::new(
                    std::env::var("OLLAMA_MODEL").unwrap_or_else(|_| "llama3.2".into()),
                )
                .base_url(
                    std::env::var("OLLAMA_BASE_URL")
                        .unwrap_or_else(|_| "http://127.0.0.1:11434".into()),
                ),
            )
        }
    };

    tracing::info!("Using model provider: {}", model_provider_name);

    // Load persona registry from skills/ directory
    let skills_dir = std::env::var("SKILLS_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::path::PathBuf::from("./skills"));
    let registry = counsel_core::wisdom::PersonaRegistry::load(&skills_dir)
        .expect("Failed to load persona registry");
    tracing::info!("Loaded {} personas from {}", registry.len(), skills_dir.display());

    // Auth DB (SQLite) — holds `users` table only. Session/wiki/journal
    // live in the browser's IndexedDB post Phase B.
    let db_url = std::env::var("COUNSEL_DB_URL")
        .unwrap_or_else(|_| "sqlite://./auth.db".to_string());
    let connect_opts = SqliteConnectOptions::from_str(&db_url)
        .expect("invalid COUNSEL_DB_URL")
        .create_if_missing(true);
    let db = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(connect_opts)
        .await
        .expect("failed to open auth db");
    sqlx::migrate!("../../migrations")
        .run(&db)
        .await
        .expect("failed to run migrations");
    tracing::info!("Auth DB ready at {}", db_url);

    let jwt_secret = std::env::var("COUNSEL_JWT_SECRET").unwrap_or_else(|_| {
        tracing::warn!("COUNSEL_JWT_SECRET not set — using an ephemeral dev secret. All tokens will invalidate on restart.");
        uuid::Uuid::new_v4().to_string()
    });

    let state = ApiState::new(model, storage, registry, db, jwt_secret);

    let app = create_router(state);

    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let ports_env = std::env::var("PORT").unwrap_or_else(|_| "3000,3001,3002,3003,3004,3005,3006,3007,3008,3009".into());

    // Try multiple ports
    let ports: Vec<&str> = ports_env.split(',').collect();
    let mut listener = None;
    for port in &ports {
        let addr = format!("{}:{}", host, port);
        match TcpListener::bind(&addr).await {
            Ok(l) => {
                listener = Some(l);
                tracing::info!("Counsel API server listening on {}", addr);
                break;
            }
            Err(e) => {
                tracing::warn!("Failed to bind to {}: {}", addr, e);
            }
        }
    }

    let listener = listener.expect("No available port found in range");

    axum::serve(listener, app).await?;

    Ok(())
}
