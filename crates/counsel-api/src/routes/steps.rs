//! Step execution routes with SSE streaming

use axum::{
    extract::{Path, State},
    http::{header::CONTENT_TYPE, HeaderMap},
    response::{IntoResponse, sse::Event},
    Json,
};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

use crate::{ApiResult, ApiState};
use crate::incidents::{record_incident, IncidentRecord};
use counsel_core::{CounselService, SseSink, SSEEvent};
use std::time::{Duration, Instant};

/// Per-step server-side hard timeout. Generous (LLM streams are slow on
/// long debate prompts) but bounded so a hung provider doesn't strand the
/// SSE channel forever. Max value is what gets used as the outer guard;
/// when exceeded, a `stuck_timeout` incident is recorded.
fn step_timeout(step: u8) -> Duration {
    Duration::from_secs(match step {
        2 | 3 | 5 | 7 => 180,
        4 | 6 => 240,
        8 => 300,
        _ => 60,
    })
}

/// Best-effort context-size snapshot for incident logging. Mirrors the
/// fields already logged by `run_define` at counsel-core/src/steps/mod.rs:209
/// so an incident JSON line is enough to diagnose context-bloat without
/// also grepping stderr. Reads from the per-request storage (which may be
/// a tempdir in Phase C mode), so values reflect what the failing step
/// actually saw.
async fn snapshot_ctx_sizes(
    storage: &counsel_storage::Storage,
    project_id: &str,
    session_id: &str,
) -> std::collections::BTreeMap<String, usize> {
    use std::collections::BTreeMap;
    let mut m = BTreeMap::new();
    if let Ok(s) = storage.read_session_file(project_id, session_id, "00-raw-input.md").await {
        m.insert("raw_input".into(), s.len());
    }
    if let Ok(s) = storage.read_user_wiki().await {
        m.insert("user_wiki".into(), s.len());
    }
    if let Ok(s) = storage.read_last_wiki_entry().await {
        m.insert("last_session".into(), s.len());
    }
    if let Ok(s) = storage.read_belief_system(project_id).await {
        m.insert("prior_beliefs".into(), s.len());
    }
    if let Ok(s) = storage.read_execution_journal().await {
        m.insert("execution_journal".into(), s.len());
    }
    m
}

/// Classify an `ApiError` into one of the incident `kind` strings.
fn incident_kind_for(err: &crate::ApiError) -> &'static str {
    let s = err.to_string();
    if s.contains("Model returned empty response") || s.contains("returned 0 chars") {
        "empty_response"
    } else if s.contains("Channel") || s.contains("stream") {
        "stream_error"
    } else {
        "core_error"
    }
}

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
    /// Phase C — when present, server uses a tempdir for this request and
    /// hydrates it from these payloads. Server writes nothing persistent.
    /// When absent, falls back to the legacy ApiState.storage path.
    pub prior_state: Option<PriorState>,
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct PriorState {
    /// Session-scoped files keyed by filename (e.g. "01-defined.md",
    /// "03-opinions/Paul-Graham.md"). These get written into the tempdir's
    /// session dir before `run_*` executes.
    #[serde(default)]
    pub files: std::collections::HashMap<String, String>,
    /// Selected persona slugs for this session (Phase 7.1).
    #[serde(default)]
    pub personas: Option<Vec<String>>,
    /// User-level wiki (long-horizon identity; single file across all projects).
    #[serde(default)]
    pub user_wiki: Option<String>,
    /// Follow-up execution journal (Phase 2.3).
    #[serde(default)]
    pub execution_journal: Option<String>,
    /// Project-level belief-system.md (Phase 2.8 Bayesian posterior prior).
    #[serde(default)]
    pub belief_system: Option<String>,
    /// B3 — tier-aware: case-of's distilled identity facts.
    /// Maps to `<root>/../user-data/core.md`.
    #[serde(default)]
    pub user_core: Option<String>,
    /// B3 — tier-aware: one-line-per-session hook list.
    /// Maps to `<root>/../user-data/log/INDEX.md`.
    #[serde(default)]
    pub log_index: Option<String>,
    /// B3 — per-session log entries the client wants the server to see for
    /// this request. Keyed by session_id (not necessarily this session). Most
    /// requests will leave this empty since INDEX hooks alone are enough; a
    /// follow-up session that explicitly cites a past session by id can
    /// hydrate just that file on demand.
    #[serde(default)]
    pub log_sessions: std::collections::HashMap<String, String>,
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
    tracing::debug!(
        "run_step step={} sid={} tempdir_mode={}",
        step,
        session_id,
        req.prior_state.is_some()
    );
    // Create channel for SSE events as strings
    let (tx, rx) = mpsc::channel::<String>(100);
    let sse_sender: SseSink = tx.into();

    let project_id_clone = project_id.clone();
    let session_id_clone = session_id.clone();
    let req_input = req.input.clone();
    let auto_simulate = req.auto_simulate.unwrap_or(false);
    let force_refresh = req.force_refresh.unwrap_or(false);
    let state_clone = state.clone();
    let prior_state = req.prior_state.clone();

    // Spawn the step execution
    tokio::spawn(async move {
        let sender = sse_sender.clone();

        // Get model with read lock
        let model = state_clone.model.read().unwrap().clone();

        // Phase C · When prior_state is provided, build an isolated tempdir
        // Storage for this request and hydrate it from the client. Server
        // writes nothing persistent. Tempdir is dropped at the end of this
        // task (held in `_temp_guard` for lifetime). When prior_state is
        // absent, fall back to the legacy shared ApiState.storage.
        let legacy_storage = state_clone.storage.clone();
        let (storage, _temp_guard): (
            counsel_storage::Storage,
            Option<std::sync::Arc<tempfile::TempDir>>,
        ) = match &prior_state {
            Some(ps) => {
                let temp = match tempfile::Builder::new().prefix("counsel-").tempdir() {
                    Ok(t) => std::sync::Arc::new(t),
                    Err(e) => {
                        let _ = sender
                            .send(SSEEvent::error(format!("tempdir init failed: {}", e)))
                            .await;
                        return Err(crate::ApiError::Internal(format!("tempdir: {}", e)));
                    }
                };
                let sessions_root = temp.path().join("sessions");
                let storage = counsel_storage::Storage::new(sessions_root);
                if let Err(e) = hydrate_storage(&storage, &project_id_clone, &session_id_clone, ps).await {
                    let _ = sender
                        .send(SSEEvent::error(format!("hydrate failed: {}", e)))
                        .await;
                    return Err(crate::ApiError::Internal(format!("hydrate: {}", e)));
                }
                (storage, Some(temp))
            }
            None => (legacy_storage, None),
        };
        let model_label = format!("{}", model.name());
        let service = CounselService::new(model, storage.clone(), state_clone.registry.clone());
        let step_started_at = Instant::now();

        /// Check if a cached session file exists and is non-empty
        async fn has_cached_file(storage: &counsel_storage::Storage, pid: &str, sid: &str, file: &str, force: bool) -> bool {
            if force { return false; }
            match storage.read_session_file(pid, sid, file).await {
                Ok(content) if !content.is_empty() => true,
                _ => false,
            }
        }

        // Outer hard timeout. If the entire step body (including streaming)
        // doesn't finish within step_timeout(step), we record a stuck_timeout
        // incident and surface a friendly SSE error. The Elapsed branch only
        // catches truly hung paths — the inner match's own errors flow through
        // the normal Err arm below and get classified by `incident_kind_for`.
        let timed = tokio::time::timeout(step_timeout(step), async {
        let result: Result<(), crate::ApiError> = match step {
            1 => {
                // Step 1 is just raw input. In tempdir mode the server owns no
                // session metadata — client tracks current_step in IndexedDB —
                // so we only update the legacy session.json when using the
                // shared ApiState.storage.
                if _temp_guard.is_none() {
                    storage.update_session_step(&project_id_clone, &session_id_clone, 1).await
                        .map_err(|e| crate::ApiError::Storage(e))?;
                }
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
                        tracing::info!(
                            "step 3: answers received for session {} ({} chars)",
                            session_id_clone,
                            answers.len()
                        );
                        // 2026-04-25: do NOT use `?` here. The async block's
                        // `?` short-circuits past the result-handling block at
                        // the bottom of the spawn — meaning errors never reach
                        // SSEEvent::error. Use match to preserve the result so
                        // the post-handling block can emit the error event.
                        match service
                            .save_facts_answers(
                                &project_id_clone,
                                &session_id_clone,
                                answers,
                                sender.clone(),
                            )
                            .await
                        {
                            Ok(()) => {
                                tracing::info!(
                                    "step 3: answers saved for session {}",
                                    session_id_clone
                                );
                                Ok(())
                            }
                            Err(e) => {
                                tracing::error!(
                                    "step 3 save_facts_answers failed for session {}: {}",
                                    session_id_clone,
                                    e
                                );
                                Err(crate::ApiError::Core(e))
                            }
                        }
                    } else if has_cached_file(&storage, &project_id_clone, &session_id_clone, "02-facts-answers.md", force_refresh).await {
                        sender.send(SSEEvent::step_start(3)).await.ok();
                        sender.send(SSEEvent::step_done_with_data(3, serde_json::json!({"cached": true}))).await.ok();
                        Ok(())
                    } else {
                        match service.run_facts(&project_id_clone, &session_id_clone, auto_simulate, sender.clone()).await {
                            Ok(()) => Ok(()),
                            Err(e) => Err(crate::ApiError::Core(e)),
                        }
                    }
                } else if has_cached_file(&storage, &project_id_clone, &session_id_clone, "02-facts-answers.md", force_refresh).await {
                    sender.send(SSEEvent::step_start(3)).await.ok();
                    sender.send(SSEEvent::step_done_with_data(3, serde_json::json!({"cached": true}))).await.ok();
                    Ok(())
                } else {
                    match service.run_facts(&project_id_clone, &session_id_clone, auto_simulate, sender.clone()).await {
                        Ok(()) => Ok(()),
                        Err(e) => Err(crate::ApiError::Core(e)),
                    }
                }
            }
            4 => {
                // Check if opinions directory has files (cache check)
                let has_cached = if !force_refresh {
                    storage.list_opinions(&project_id_clone, &session_id_clone).await
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
                // Check the effective roster (Phase 7.1): honors per-session
                // picks, not just the admin-allowed registry size.
                if service.active_personas_len(&project_id_clone, &session_id_clone).await <= 1 {
                    let marker = "# 单一视角场景 — 维度拆分已跳过\n\n*当前只有一位幕僚在场，不存在正反分野，已跳过 Step 5 维度拆分。直接进入 Step 7 归纳。*\n";
                    storage.write_session_file(&project_id_clone, &session_id_clone, "04-dimensions.md", marker).await.ok();
                    sender.send(SSEEvent::step_start(5)).await.ok();
                    sender.send(SSEEvent::step_done_with_data(5, serde_json::json!({
                        "skipped": true,
                        "reason": "single_persona",
                        "message": "单一视角场景，无需拆分维度。"
                    }))).await.ok();
                } else if has_cached_file(&storage, &project_id_clone, &session_id_clone, "04-dimensions.md", force_refresh).await {
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
                // Honor per-session picks (Phase 7.1), not just registry size.
                if service.active_personas_len(&project_id_clone, &session_id_clone).await <= 1 {
                    let marker = "# 辩论已跳过\n\n*单一视角场景，无正反辩论。Step 7 归纳会直接采用 Step 4 的 opinion 作为素材。*\n";
                    storage.write_session_file(&project_id_clone, &session_id_clone, "05-debate.md", marker).await.ok();
                    sender.send(SSEEvent::step_start(6)).await.ok();
                    sender.send(SSEEvent::step_done_with_data(6, serde_json::json!({
                        "skipped": true,
                        "reason": "single_persona",
                        "message": "单一视角场景，无需辩论。"
                    }))).await.ok();
                } else if has_cached_file(&storage, &project_id_clone, &session_id_clone, "05-debate.md", force_refresh).await {
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
                    let dimensions = storage.read_session_file(&project_id_clone, &session_id_clone, "04-dimensions.md").await
                        .map_err(|e| crate::ApiError::Storage(e))?;
                    let dims = counsel_core::steps::parse_dimensions(&dimensions);

                    // 2026-04-26 — Defensive: if Step 5's output didn't parse into
                    // any dimensions (LLM produced an unexpected format, or only
                    // produced "## 一致共识"), don't silently emit step_done with
                    // zero debate content. Surface as a soft "skipped" so the
                    // frontend can show a skip card and let Step 7 fall back.
                    let no_dims = dims.is_empty();
                    if no_dims {
                        tracing::warn!(
                            "step 6: parse_dimensions returned 0 dims from {}-byte 04-dimensions.md — skipping debate",
                            dimensions.len()
                        );
                        let marker = "# 辩论已跳过\n\n*维度提取未产出可辩论的冲突点。Step 7 归纳会直接采用 Step 4 的 opinion 作为素材。*\n";
                        storage.write_session_file(&project_id_clone, &session_id_clone, "05-debate.md", marker).await.ok();
                        sender.send(SSEEvent::step_done_with_data(6, serde_json::json!({
                            "skipped": true,
                            "reason": "no_dimensions_parsed",
                            "message": "维度提取未产出可辩论的内容，跳过辩论。"
                        }))).await.ok();
                    }

                    // Save selected dimensions to session
                    let selection_json = serde_json::json!({
                        "selected_indices": indices,
                        "total_available": dims.len(),
                    });
                    storage.write_session_file(
                        &project_id_clone, &session_id_clone,
                        "04-selected-dimensions.json",
                        &serde_json::to_string_pretty(&selection_json).unwrap_or_default(),
                    ).await.ok();

                    if !no_dims {
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
                    }

                    // 2026-04-26 — removed the Phase 4.4 background pre-mortem
                    // pre-run. In tempdir-per-request mode (Phase D), the
                    // spawned task wrote premortem.md to the Step 6 tempdir
                    // which Step 7's request never sees (Step 7 builds a fresh
                    // tempdir from prior_state). The output was orphaned and
                    // never reached the user. Replaced by parallel inline
                    // execution in Step 7 (run_premortem ‖ run_summary via
                    // tokio::join!).
                }
                Ok(())
            }
            7 => {
                if has_cached_file(&storage, &project_id_clone, &session_id_clone, "06-summary.md", force_refresh).await {
                    sender.send(SSEEvent::step_start(7)).await.ok();
                    sender.send(SSEEvent::step_done_with_data(7, serde_json::json!({"cached": true}))).await.ok();
                } else {
                    // 2026-04-26 — Pre-Mortem and Summary run concurrently via
                    // tokio::join!. Both stream to the same SSE sender; the
                    // frontend has independent DOM targets for each
                    // (premortem-card vs summary-card), so interleaved chunks
                    // route to the right card by event type. Total Step 7
                    // duration = max(premortem, summary), not sum.
                    //
                    // run_summary used to read premortem.md to weave it into
                    // the summary prompt; that read now returns empty (parallel
                    // execution race), and summary_prompt's premortem section
                    // gracefully omits when empty. Trade-off: summary loses the
                    // premortem context; both cards reach the user fast.
                    tracing::info!("running premortem + summary in parallel for session {}", session_id_clone);
                    let pre_sender = sender.clone();
                    let sum_sender = sender.clone();
                    let (pre_result, sum_result) = tokio::join!(
                        service.run_premortem(&project_id_clone, &session_id_clone, pre_sender),
                        service.run_summary(&project_id_clone, &session_id_clone, sum_sender),
                    );
                    if let Err(e) = pre_result {
                        tracing::warn!("inline premortem failed (continuing): {}", e);
                    }
                    sum_result.map_err(|e| crate::ApiError::Core(e))?;
                }
                Ok(())
            }
            8 => {
                if has_cached_file(&storage, &project_id_clone, &session_id_clone, "07-harvest.md", force_refresh).await {
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
        result
        }).await;

        let result: Result<(), crate::ApiError> = match timed {
            Ok(inner) => inner,
            Err(_elapsed) => {
                let secs = step_timeout(step).as_secs();
                let msg = format!("step {} 服务器侧超时（>{}s 未完成）", step, secs);
                let _ = sender.send(SSEEvent::error(msg.clone())).await;
                let ctx = snapshot_ctx_sizes(&storage, &project_id_clone, &session_id_clone).await;
                record_incident(
                    IncidentRecord::new(
                        &project_id_clone, &session_id_clone, step,
                        "stuck_timeout", &msg,
                    )
                    .with_duration(step_started_at.elapsed().as_millis() as u64)
                    .with_model(&model_label)
                    .with_ctx_sizes(ctx),
                ).await;
                Err(crate::ApiError::Internal(msg))
            }
        };

        // Update session step for steps 2-8 after successful completion.
        // Skipped in tempdir mode — client owns session.current_step in IDB.
        if result.is_ok() && step > 1 && _temp_guard.is_none() {
            if let Err(e) = storage.update_session_step(&project_id_clone, &session_id_clone, step).await {
                tracing::warn!("Failed to update session step to {}: {}", step, e);
            }
        }

        // Phase C · in tempdir mode, collect everything the step wrote and
        // hand it back to the client via a StepFiles event so it can persist
        // to IndexedDB. Skipped in legacy mode (client still uses Phase B
        // mirror via GET /files/*).
        if _temp_guard.is_some() && result.is_ok() {
            let session_files = storage
                .collect_session_files(&project_id_clone, &session_id_clone)
                .await
                .unwrap_or_default();
            let user_files = storage
                .collect_user_files(&project_id_clone)
                .await
                .unwrap_or_default();
            tracing::info!(
                "step {} tempdir-mode: emitting step_files with {} session files + {} user files",
                step,
                session_files.len(),
                user_files.len()
            );

            // Dev-only mirror: when COUNSEL_DEV_MIRROR is set to a truthy
            // value (anything except empty / "0" / "false"), also write the
            // tempdir-collected files to ./sessions/ on disk so the developer
            // can inspect them. Production server should NOT set this env var.
            // Best-effort: never block or fail the response on mirror errors.
            let mirror_on = std::env::var("COUNSEL_DEV_MIRROR")
                .map(|v| !matches!(v.as_str(), "" | "0" | "false" | "FALSE"))
                .unwrap_or(false);
            if mirror_on {
                if let Err(e) = mirror_to_disk(
                    &project_id_clone,
                    &session_id_clone,
                    &session_files,
                    &user_files,
                )
                .await
                {
                    tracing::warn!("dev-mirror failed (non-fatal): {}", e);
                }
            }

            let payload = serde_json::json!({
                "session_files": session_files,
                "user_files": user_files,
            });
            let send_res = sender.send(SSEEvent::step_files(step, payload)).await;
            if send_res.is_err() {
                tracing::warn!("step_files SSE send failed — client already dropped?");
            }
        } else if result.is_ok() {
            tracing::info!("step {} completed in legacy mode (no tempdir)", step);
        }

        if let Err(ref e) = result {
            // Already recorded for the stuck_timeout path (where we synthesise
            // the Err above). Recording for the empty_response / core_error /
            // stream_error paths happens here, classifying by error message.
            let kind = incident_kind_for(e);
            let already_recorded = kind == "core_error" && e.to_string().contains("服务器侧超时");
            if !already_recorded {
                let ctx = snapshot_ctx_sizes(&storage, &project_id_clone, &session_id_clone).await;
                record_incident(
                    IncidentRecord::new(
                        &project_id_clone, &session_id_clone, step,
                        kind, e.to_string(),
                    )
                    .with_duration(step_started_at.elapsed().as_millis() as u64)
                    .with_model(&model_label)
                    .with_ctx_sizes(ctx),
                ).await;
            }
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

/// Dev-only mirror: write the collected session_files + user_files to a
/// fixed on-disk location (`./sessions/<pid>/session-<sid>/...` for session
/// files, `./<filename>` for user-wiki/execution-journal, and
/// `./sessions/<pid>/<filename>` for project-level user files like
/// belief-system.md). Gated by COUNSEL_DEV_MIRROR env var. Never call from
/// production: it defeats the stateless-server property.
async fn mirror_to_disk(
    project_id: &str,
    session_id: &str,
    session_files: &std::collections::HashMap<String, String>,
    user_files: &std::collections::HashMap<String, String>,
) -> std::io::Result<()> {
    use std::path::PathBuf;
    let mirror_root = PathBuf::from("./sessions");
    let session_root = mirror_root.join(project_id).join(format!("session-{}", session_id));
    let project_root = mirror_root.join(project_id);

    for (rel, content) in session_files {
        // Defense-in-depth: reject `..` and absolute paths in keys.
        if rel.contains("..") || rel.starts_with('/') {
            tracing::warn!("dev-mirror: skipping suspicious key {}", rel);
            continue;
        }
        let dst = session_root.join(rel);
        if let Some(parent) = dst.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(&dst, content).await?;
    }

    for (name, content) in user_files {
        if name.contains("..") || name.starts_with('/') {
            tracing::warn!("dev-mirror: skipping suspicious user key {}", name);
            continue;
        }
        // B3 tier — keys are namespaced "user-data/..." for the new tier
        // files. Mirror them as siblings of `./sessions/` (i.e. under cwd).
        if name == "user-wiki.md" || name == "execution-journal.md" {
            let dst = PathBuf::from(".").join(name);
            tokio::fs::write(&dst, content).await?;
            continue;
        }
        if let Some(rel) = name.strip_prefix("user-data/") {
            // rel may include a sub-dir like "log/foo.md"
            let dst = PathBuf::from("./user-data").join(rel);
            if let Some(parent) = dst.parent() {
                tokio::fs::create_dir_all(parent).await?;
            }
            tokio::fs::write(&dst, content).await?;
            continue;
        }
        if name == "belief-system.md" {
            tokio::fs::create_dir_all(&project_root).await?;
            tokio::fs::write(project_root.join(name), content).await?;
            continue;
        }
        // Legacy slash-bearing key (shouldn't happen but stays defensive).
        if name.contains('/') {
            tracing::warn!("dev-mirror: skipping unexpected slash key {}", name);
            continue;
        }
        tokio::fs::write(mirror_root.join(name), content).await?;
    }

    tracing::info!(
        "dev-mirror: wrote {} session + {} user files to {}",
        session_files.len(),
        user_files.len(),
        session_root.display()
    );
    Ok(())
}

/// Phase C · Populate an empty (tempdir-backed) Storage with the client's
/// prior session/user state before invoking the step's `run_*` method. Writes
/// session files into `<root>/<pid>/session-<sid>/...` and user-level files
/// at `<root>/../user-wiki.md` etc. — matching the paths the existing
/// filesystem-based `Storage` accessors expect.
pub(crate) async fn hydrate_storage(
    storage: &counsel_storage::Storage,
    project_id: &str,
    session_id: &str,
    prior: &PriorState,
) -> Result<(), counsel_storage::StorageError> {
    for (filename, content) in &prior.files {
        storage
            .write_session_file(project_id, session_id, filename, content)
            .await?;
    }
    if let Some(personas) = &prior.personas {
        if !personas.is_empty() {
            storage
                .write_selected_personas(project_id, session_id, personas)
                .await?;
        }
    }
    if let Some(wiki) = &prior.user_wiki {
        storage.write_user_wiki(wiki).await?;
    }
    if let Some(journal) = &prior.execution_journal {
        storage.write_execution_journal(journal).await?;
    }
    if let Some(bs) = &prior.belief_system {
        storage.write_belief_system(project_id, bs).await?;
    }
    // B3 tier — hydrate the new always-loaded blobs. Each is best-effort:
    // when absent, the facilitator just sees an empty core/index, which is
    // exactly what a brand-new client should see.
    if let Some(core) = &prior.user_core {
        storage.write_user_core(core).await?;
    }
    if let Some(idx) = &prior.log_index {
        storage.write_log_index(idx).await?;
    }
    for (sid, body) in &prior.log_sessions {
        // Defensive: skip suspicious sids — `write_log_session` already
        // sanitises but this avoids extra disk churn for obviously bogus keys.
        if sid.contains('/') || sid.contains("..") || sid.is_empty() { continue; }
        storage.write_log_session(sid, body).await?;
    }
    Ok(())
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

/// 2026-04-25 — env-var fallback for the API key. When the case-owner toggles
/// just the model dropdown without retyping their API key, `req.api_key` is
/// empty/None. The previous code stored an empty string, which then sent
/// `Authorization: Bearer ` to the upstream and 401'd every subsequent step.
/// Now: if request key is missing/empty, fall back to the same env var
/// `main.rs` reads at startup, so the swap stays operational.
fn coalesce_key(req_key: &Option<String>, env_var: &str) -> String {
    req_key
        .as_deref()
        .map(str::trim)
        .filter(|k| !k.is_empty())
        .map(str::to_string)
        .or_else(|| std::env::var(env_var).ok().filter(|k| !k.is_empty()))
        .unwrap_or_default()
}

pub async fn update_model_settings(
    State(state): State<ApiState>,
    Json(req): Json<ModelSettingsRequest>,
) -> ApiResult<Json<serde_json::Value>> {
    tracing::info!("Updating model settings to provider: {} model: {}", req.provider, req.model);

    let new_model: Arc<dyn ModelProvider> = match req.provider.as_str() {
        "deepseek" => {
            let api_key = coalesce_key(&req.api_key, "DEEPSEEK_API_KEY");
            if api_key.is_empty() {
                return Err(crate::ApiError::BadRequest(
                    "DEEPSEEK_API_KEY not set in env and no key provided in request".into(),
                ));
            }
            Arc::new(DeepSeekProvider::new(&req.model, api_key))
        }
        "kimi" => {
            let api_key = coalesce_key(&req.api_key, "KIMI_API_KEY");
            if api_key.is_empty() {
                return Err(crate::ApiError::BadRequest("KIMI_API_KEY missing".into()));
            }
            Arc::new(KimiProvider::new(&req.model, api_key))
        }
        "minimax" => {
            let api_key = coalesce_key(&req.api_key, "MINIMAX_API_KEY");
            let group_id = req.group_id.clone()
                .filter(|k| !k.is_empty())
                .or_else(|| std::env::var("MINIMAX_GROUP_ID").ok())
                .unwrap_or_default();
            if api_key.is_empty() {
                return Err(crate::ApiError::BadRequest("MINIMAX_API_KEY missing".into()));
            }
            Arc::new(MiniMaxProvider::new(&req.model, api_key, group_id))
        }
        "openai" => {
            let api_key = coalesce_key(&req.api_key, "OPENAI_API_KEY");
            if api_key.is_empty() {
                return Err(crate::ApiError::BadRequest("OPENAI_API_KEY missing".into()));
            }
            Arc::new(OpenAiProvider::new(&req.model, api_key))
        }
        "dmx" => {
            let api_key = coalesce_key(&req.api_key, "DMX_API_KEY");
            if api_key.is_empty() {
                return Err(crate::ApiError::BadRequest("DMX_API_KEY missing".into()));
            }
            Arc::new(DmxProvider::new(&req.model, api_key, ""))
        }
        "laozhang" => {
            let api_key = coalesce_key(&req.api_key, "LAOZHANG_API_KEY");
            if api_key.is_empty() {
                return Err(crate::ApiError::BadRequest("LAOZHANG_API_KEY missing".into()));
            }
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

// Personas handler — reads from the PersonaRegistry. Returns id/name/title
// plus the client-visible color + initial so the frontend can mount seats for
// arbitrary personas (Phase 7 custom council) without hardcoding a palette.
pub async fn get_personas(
    State(state): State<ApiState>,
) -> Json<Vec<serde_json::Value>> {
    let personas: Vec<serde_json::Value> = state.registry.all()
        .iter()
        .map(|p| {
            let (color, initial) = persona_visual_defaults(&p.slug, &p.name);
            serde_json::json!({
                "id": &p.slug,
                "slug": &p.slug,
                "name": &p.name,
                "title": &p.title,
                "color": color,
                "initial": initial,
            })
        })
        .collect();
    Json(personas)
}

// Canonical visual identity for hand-tuned personas. Anything outside this
// list gets a null -> client synthesizes from slug hash.
fn persona_visual_defaults(slug: &str, name: &str) -> (Option<&'static str>, Option<String>) {
    let color = match slug {
        "mao-zedong" | "mao" => Some("#FF3B3B"),
        "paul-graham" | "pg" => Some("#FF8C42"),
        "steve-jobs" | "jobs" => Some("#B0B0FF"),
        "bruce-lee" | "brucelee" => Some("#FFE066"),
        "kevin-kelly" | "kk" => Some("#4ECDC4"),
        "huineng" => Some("#B39DDB"),
        "laozi" => Some("#69D99A"),
        "zhuangzi" => Some("#D7B46A"),
        _ => None,
    };
    let initial = match slug {
        "mao-zedong" | "mao" => Some("毛".to_string()),
        "paul-graham" | "pg" => Some("PG".to_string()),
        "steve-jobs" | "jobs" => Some("SJ".to_string()),
        "bruce-lee" | "brucelee" => Some("龙".to_string()),
        "kevin-kelly" | "kk" => Some("KK".to_string()),
        "huineng" => Some("禅".to_string()),
        "laozi" => Some("道".to_string()),
        "zhuangzi" => Some("庄".to_string()),
        _ => name.chars().next().map(|c| c.to_string()),
    };
    (color, initial)
}
