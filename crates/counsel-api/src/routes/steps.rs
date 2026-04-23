//! Step execution routes with SSE streaming

use axum::{
    extract::{Path, State},
    http::{header::CONTENT_TYPE, HeaderMap},
    response::{IntoResponse, sse::Event},
    Json,
};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::sync::{mpsc, oneshot};
use tokio_stream::wrappers::ReceiverStream;

use crate::{ApiResult, ApiState};
use counsel_core::{CounselService, SseSink, SSEEvent};

#[derive(Debug, Serialize, Deserialize)]
pub struct RunStepRequest {
    pub input: Option<String>,
    pub selected_dimensions: Option<Vec<usize>>,  // For Step 6: which dimensions to debate (max 3)
    pub auto_simulate: Option<bool>,  // When true, auto-generate typical user responses
    pub force_refresh: Option<bool>,  // When true, re-execute even if cached output exists
    pub provider: Option<String>,  // Model provider to use
    pub model: Option<String>,  // Model name
    pub api_key: Option<String>,  // API key for the provider
    pub group_id: Option<String>,  // MiniMax group ID (Chinese API only)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StepResult {
    pub success: bool,
    pub data: Option<serde_json::Value>,
}

pub async fn run_step(
    State(state): State<ApiState>,
    Path((project_id, session_id, step)): Path<(String, String, u8)>,
    Json(req): Json<RunStepRequest>,
) -> impl IntoResponse {
    // Create channel for SSE events as strings
    let (tx, rx) = mpsc::channel::<String>(100);
    let sse_sender: SseSink = tx.into();

    let project_id_clone = project_id.clone();
    let session_id_clone = session_id.clone();
    let req_input = req.input.clone();
    let auto_simulate = req.auto_simulate.unwrap_or(false);
    let force_refresh = req.force_refresh.unwrap_or(false);
    let state_clone = state.clone();

    // Spawn the step execution
    tokio::spawn(async move {
        let sender = sse_sender.clone();

        // Get model with read lock
        let model = state_clone.model.read().unwrap().clone();
        let service = CounselService::new(model, state_clone.storage.clone(), state_clone.registry.clone());

        /// Check if a cached session file exists and is non-empty
        async fn has_cached_file(storage: &counsel_storage::Storage, pid: &str, sid: &str, file: &str, force: bool) -> bool {
            if force { return false; }
            match storage.read_session_file(pid, sid, file).await {
                Ok(content) if !content.is_empty() => true,
                _ => false,
            }
        }

        let result: Result<(), crate::ApiError> = match step {
            1 => {
                // Step 1 is just raw input - update session step to 1
                state_clone.storage.update_session_step(&project_id_clone, &session_id_clone, 1).await
                    .map_err(|e| crate::ApiError::Storage(e))?;
                Ok(())
            }
            2 => {
                // Step 2 caching handled by DefineState machine
                service.run_define(&project_id_clone, &session_id_clone, req_input, auto_simulate, sender.clone()).await
                    .map_err(|e| crate::ApiError::Core(e))?;
                Ok(())
            }
            3 => {
                // Check if user is submitting answers (user mode phase 2)
                if let Some(ref answers) = req_input {
                    if !answers.is_empty() {
                        service.save_facts_answers(&project_id_clone, &session_id_clone, answers, sender.clone()).await
                            .map_err(|e| crate::ApiError::Core(e))?;
                        return Ok(());
                    }
                }

                if has_cached_file(&state_clone.storage, &project_id_clone, &session_id_clone, "02-facts-answers.md", force_refresh).await {
                    sender.send(SSEEvent::step_start(3)).await.ok();
                    sender.send(SSEEvent::step_done_with_data(3, serde_json::json!({"cached": true}))).await.ok();
                } else {
                    service.run_facts(&project_id_clone, &session_id_clone, auto_simulate, sender.clone()).await
                        .map_err(|e| crate::ApiError::Core(e))?;
                }
                Ok(())
            }
            4 => {
                // Check if opinions directory has files (cache check)
                let has_cached = if !force_refresh {
                    state_clone.storage.list_opinions(&project_id_clone, &session_id_clone).await
                        .map(|o| !o.is_empty()).unwrap_or(false)
                } else {
                    false
                };
                if has_cached {
                    sender.send(SSEEvent::step_start(4)).await.ok();
                    sender.send(SSEEvent::step_done_with_data(4, serde_json::json!({"cached": true}))).await.ok();
                } else {
                    service.run_opinions(&project_id_clone, &session_id_clone, sender.clone()).await
                        .map_err(|e| crate::ApiError::Core(e))?;
                }
                Ok(())
            }
            5 => {
                // Single-persona pilot mode: skip dimension split + debate entirely.
                // With only one voice there's no pro/con to dissect. Write a
                // marker file so Step 7 summary can fall back to opinions.
                if service.registry.len() <= 1 {
                    let marker = "# 单一视角场景 — 维度拆分已跳过\n\n*当前只有一位幕僚在场，不存在正反分野，已跳过 Step 5 维度拆分。直接进入 Step 7 归纳。*\n";
                    state_clone.storage.write_session_file(&project_id_clone, &session_id_clone, "04-dimensions.md", marker).await.ok();
                    sender.send(SSEEvent::step_start(5)).await.ok();
                    sender.send(SSEEvent::step_done_with_data(5, serde_json::json!({
                        "skipped": true,
                        "reason": "single_persona",
                        "message": "单一视角场景，无需拆分维度。"
                    }))).await.ok();
                } else if has_cached_file(&state_clone.storage, &project_id_clone, &session_id_clone, "04-dimensions.md", force_refresh).await {
                    sender.send(SSEEvent::step_start(5)).await.ok();
                    sender.send(SSEEvent::step_done_with_data(5, serde_json::json!({"cached": true}))).await.ok();
                } else {
                    service.run_dimensions(&project_id_clone, &session_id_clone, sender.clone()).await
                        .map_err(|e| crate::ApiError::Core(e))?;
                }
                Ok(())
            }
            6 => {
                // Single-persona pilot mode: skip debate, write a marker file.
                // `run_summary` detects the marker and falls back to opinions.
                if service.registry.len() <= 1 {
                    let marker = "# 辩论已跳过\n\n*单一视角场景，无正反辩论。Step 7 归纳会直接采用 Step 4 的 opinion 作为素材。*\n";
                    state_clone.storage.write_session_file(&project_id_clone, &session_id_clone, "05-debate.md", marker).await.ok();
                    sender.send(SSEEvent::step_start(6)).await.ok();
                    sender.send(SSEEvent::step_done_with_data(6, serde_json::json!({
                        "skipped": true,
                        "reason": "single_persona",
                        "message": "单一视角场景，无需辩论。"
                    }))).await.ok();
                } else if has_cached_file(&state_clone.storage, &project_id_clone, &session_id_clone, "05-debate.md", force_refresh).await {
                    sender.send(SSEEvent::step_start(6)).await.ok();
                    sender.send(SSEEvent::step_done_with_data(6, serde_json::json!({"cached": true}))).await.ok();
                } else {
                    // Send step_start once for the whole debate
                    sender.send(SSEEvent::step_start(6)).await.ok();

                    // Run debate on selected dimensions (1-3, default 2)
                    let selected = req.selected_dimensions.as_ref();

                    let indices: Vec<usize> = match selected {
                        Some(indices) if !indices.is_empty() => {
                            indices.iter().take(3).cloned().collect()
                        },
                        _ => vec![0, 1],  // Default 2 dimensions
                    };

                    // Read dimensions from file
                    let dimensions = state_clone.storage.read_session_file(&project_id_clone, &session_id_clone, "04-dimensions.md").await
                        .map_err(|e| crate::ApiError::Storage(e))?;
                    let dims = counsel_core::steps::parse_dimensions(&dimensions);

                    // Save selected dimensions to session
                    let selection_json = serde_json::json!({
                        "selected_indices": indices,
                        "total_available": dims.len(),
                    });
                    state_clone.storage.write_session_file(
                        &project_id_clone, &session_id_clone,
                        "04-selected-dimensions.json",
                        &serde_json::to_string_pretty(&selection_json).unwrap_or_default(),
                    ).await.ok();

                    let total = indices.iter().filter(|i| **i < dims.len()).count();
                    let mut emitted_idx = 0_usize;
                    for idx in &indices {
                        if *idx < dims.len() {
                            sender.send(counsel_core::SSEEvent::DimensionStart {
                                index: emitted_idx,
                                total,
                                name: dims[*idx].name.clone(),
                            }).await.ok();
                            service.run_debate(&project_id_clone, &session_id_clone, &dims[*idx], sender.clone()).await
                                .map_err(|e| crate::ApiError::Core(e))?;
                            sender.send(counsel_core::SSEEvent::DimensionDone { index: emitted_idx }).await.ok();
                            emitted_idx += 1;
                        }
                    }

                    // Send step_done once after all dimensions are debated
                    sender.send(SSEEvent::step_done_with_data(6, serde_json::json!({
                        "dimensions_debated": indices.len()
                    }))).await.ok();

                    // Phase 4.4 optimization (2026-04-22): background Pre-Mortem
                    // pre-run. While the user reads debate + synthesis, fire
                    // run_premortem on a detached task. Register a oneshot
                    // Receiver in state.prefetches BEFORE spawning, so Step 7
                    // handler can await the exact DeepSeek-API-finished signal
                    // (not mtime polling). The task sends `()` on completion
                    // whether Ok or Err — summary just needs the signal.
                    let (done_tx, done_rx) = oneshot::channel::<()>();
                    let prefetch_key = format!("{}:premortem", session_id_clone);
                    state_clone.prefetches.lock().unwrap().insert(prefetch_key.clone(), done_rx);

                    let service_bg = service.clone();
                    let pid_bg = project_id_clone.clone();
                    let sid_bg = session_id_clone.clone();
                    tokio::spawn(async move {
                        tracing::info!("background premortem started for session {}", sid_bg);
                        let sink = counsel_core::SseSink::discarded();
                        match service_bg.run_premortem(&pid_bg, &sid_bg, sink).await {
                            Ok(_) => tracing::info!("background premortem finished for session {}", sid_bg),
                            Err(e) => tracing::warn!("background premortem failed for session {}: {}", sid_bg, e),
                        }
                        let _ = done_tx.send(());  // signal completion (success or failure)
                    });
                }
                Ok(())
            }
            7 => {
                if has_cached_file(&state_clone.storage, &project_id_clone, &session_id_clone, "06-summary.md", force_refresh).await {
                    sender.send(SSEEvent::step_start(7)).await.ok();
                    sender.send(SSEEvent::step_done_with_data(7, serde_json::json!({"cached": true}))).await.ok();
                } else {
                    // Phase 4.4 Step 6.5 flow — event-driven coordination
                    // (Michael 2026-04-22: "看到 premortem.md 这一轮的api 输出结束了，
                    // 就马上跑 summary"):
                    //
                    // Look up the oneshot receiver registered by Step 6's background
                    // pre-run. If present, await it — this is the exact "API call
                    // returned" signal, no polling lag.
                    //
                    // Three cases:
                    // A. Receiver present → background task running → await signal,
                    //    then use the completed premortem.md.
                    // B. Receiver absent, premortem.md exists → previous run already
                    //    completed (cleanly done or server restarted) → use as-is.
                    // C. premortem.md doesn't exist → no pre-run happened → run inline.
                    let prefetch_key = format!("{}:premortem", session_id_clone);
                    let rx_opt = {
                        let mut map = state_clone.prefetches.lock().unwrap();
                        map.remove(&prefetch_key)
                    };

                    if let Some(rx) = rx_opt {
                        // Case A: Wait for API completion signal. Timeout 30s
                        // (Michael 2026-04-22: after capping premortem to
                        // max_tokens=1600 / 800 Chinese chars, it fits within 30s).
                        tracing::info!("awaiting background premortem completion signal (session {})", session_id_clone);
                        match tokio::time::timeout(Duration::from_secs(30), rx).await {
                            Ok(_) => tracing::info!("background premortem done, starting summary (session {})", session_id_clone),
                            Err(_) => tracing::warn!("background premortem signal timeout after 30s — proceeding with whatever's on disk (session {})", session_id_clone),
                        }
                    } else if has_cached_file(&state_clone.storage, &project_id_clone, &session_id_clone, "premortem.md", force_refresh).await {
                        // Case B: file exists from a previously-completed run (or server restart)
                        tracing::info!("premortem.md present without pending task — using as-is (session {})", session_id_clone);
                    } else {
                        // Case C: inline run_premortem, stream to user
                        if let Err(e) = service.run_premortem(&project_id_clone, &session_id_clone, sender.clone()).await {
                            tracing::warn!("inline premortem failed (continuing to summary): {}", e);
                        }
                    }
                    service.run_summary(&project_id_clone, &session_id_clone, sender.clone()).await
                        .map_err(|e| crate::ApiError::Core(e))?;
                }
                Ok(())
            }
            8 => {
                if has_cached_file(&state_clone.storage, &project_id_clone, &session_id_clone, "07-harvest.md", force_refresh).await {
                    sender.send(SSEEvent::step_start(8)).await.ok();
                    sender.send(SSEEvent::step_done_with_data(8, serde_json::json!({"cached": true}))).await.ok();
                } else {
                    service.run_harvest(&project_id_clone, &session_id_clone, sender.clone()).await
                        .map_err(|e| crate::ApiError::Core(e))?;
                }
                Ok(())
            }
            _ => Err(crate::ApiError::BadRequest(format!("Invalid step: {}", step))),
        };

        // Update session step for steps 2-8 after successful completion
        if result.is_ok() && step > 1 {
            if let Err(e) = state_clone.storage.update_session_step(&project_id_clone, &session_id_clone, step).await {
                tracing::warn!("Failed to update session step to {}: {}", step, e);
            }
        }

        if let Err(ref e) = result {
            let _ = sender.send(SSEEvent::error(e.to_string())).await;
        }
        result
    });

    // Create SSE stream with proper headers
    let stream = ReceiverStream::new(rx)
        .map(|data| Ok::<_, std::convert::Infallible>(Event::default().data(data)));

    let sse = axum::response::sse::Sse::new(stream)
        .keep_alive(axum::response::sse::KeepAlive::default());

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, "text/event-stream".parse().unwrap());

    (headers, sse)
}

pub async fn complete_session(
    State(state): State<ApiState>,
    Path((project_id, session_id)): Path<(String, String)>,
) -> ApiResult<Json<StepResult>> {
    state.storage.update_session_step(&project_id, &session_id, 8).await?;
    Ok(Json(StepResult { success: true, data: None }))
}

// Settings handlers
pub async fn get_settings() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "language": "en"
    }))
}

pub async fn post_settings(Json(req): Json<serde_json::Value>) -> Json<serde_json::Value> {
    Json(req)
}

// Model settings update handler - allows hot-reload of model provider
use std::sync::Arc;
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

#[derive(Debug, serde::Deserialize)]
pub struct ModelSettingsRequest {
    pub provider: String,
    pub api_key: Option<String>,
    pub custom_url: Option<String>,
    pub model: String,
    pub group_id: Option<String>,  // MiniMax group ID (Chinese API only)
}

pub async fn update_model_settings(
    State(state): State<ApiState>,
    Json(req): Json<ModelSettingsRequest>,
) -> ApiResult<Json<serde_json::Value>> {
    tracing::info!("Updating model settings to provider: {}", req.provider);

    let new_model: Arc<dyn ModelProvider> = match req.provider.as_str() {
        "deepseek" => {
            let api_key = req.api_key.clone().unwrap_or_default();
            Arc::new(DeepSeekProvider::new(&req.model, api_key))
        }
        "kimi" => {
            let api_key = req.api_key.clone().unwrap_or_default();
            Arc::new(KimiProvider::new(&req.model, api_key))
        }
        "minimax" => {
            let api_key = req.api_key.clone().unwrap_or_default();
            let group_id = req.group_id.clone().unwrap_or_default();
            Arc::new(MiniMaxProvider::new(&req.model, api_key, group_id))
        }
        "openai" => {
            let api_key = req.api_key.clone().unwrap_or_default();
            Arc::new(OpenAiProvider::new(&req.model, api_key))
        }
        "dmx" => {
            let api_key = req.api_key.clone().unwrap_or_default();
            Arc::new(DmxProvider::new(&req.model, api_key, ""))
        }
        "laozhang" => {
            let api_key = req.api_key.clone().unwrap_or_default();
            Arc::new(LaozhangProvider::new(&req.model, api_key))
        }
        "ollama" => {
            let base_url = req.custom_url.clone()
                .unwrap_or_else(|| "http://127.0.0.1:11434".to_string());
            Arc::new(OllamaProvider::new(&req.model).base_url(&base_url))
        }
        _ => {
            return Err(crate::ApiError::BadRequest(format!("Unknown provider: {}", req.provider)));
        }
    };

    state.update_model(new_model);

    Ok(Json(serde_json::json!({
        "success": true,
        "provider": req.provider,
        "model": req.model
    })))
}

// Personas handler — reads from the PersonaRegistry
pub async fn get_personas(
    State(state): State<ApiState>,
) -> Json<Vec<serde_json::Value>> {
    let personas: Vec<serde_json::Value> = state.registry.all()
        .iter()
        .map(|p| {
            serde_json::json!({"id": &p.slug, "name": &p.name, "title": &p.title})
        })
        .collect();
    Json(personas)
}

// Conversation handler - returns session metrics and conversation info
pub async fn get_conversation(
    State(state): State<ApiState>,
    Path((project_id, session_id)): Path<(String, String)>,
) -> ApiResult<Json<serde_json::Value>> {
    // Try to read metrics
    let metrics: Option<counsel_core::SessionMetrics> = match state.storage.read_session_file(&project_id, &session_id, "metrics.json").await {
        Ok(content) => serde_json::from_str(&content).ok(),
        Err(_) => None,
    };

    // Try to read conversation (if exists)
    let conversation: Option<String> = match state.storage.read_session_file(&project_id, &session_id, "10-conversation.md").await {
        Ok(content) => Some(content),
        Err(_) => None,
    };

    Ok(Json(serde_json::json!({
        "project_id": project_id,
        "session_id": session_id,
        "metrics": metrics,
        "conversation": conversation,
    })))
}
