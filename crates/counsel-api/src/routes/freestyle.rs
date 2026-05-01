//! F1 (2026-04-26) — Mode C "Freestyle 一键模式".
//!
//! Third path after Step 4 opinions, alongside Fast Mode and Full Debate.
//! Skips dimension extraction + multi-round debate. Single endpoint runs
//! 4 sub-stages in ONE SSE stream:
//!
//!   1. Facilitator extracts consensus + tension (~300 chars) → `04alt-consensus.md`
//!      streamed as FacilitatorChunk events.
//!   2. JoinSet over all active personas — each emits a ≤50 字 action sentence,
//!      streamed as PersonaChunk; persisted to `06alt-actions.md` (one section per
//!      persona).
//!   3. Pre-mortem (existing `run_premortem`) — streamed as PremortemChunk.
//!   4. Summary (existing `run_summary`) — note that run_summary detects the
//!      "辩论已跳过" marker we write to `05-debate.md` and falls back to
//!      Step 4 opinions as source. Streamed as FacilitatorChunk.
//!
//! The case-owner sees the entire flow in one streaming session and lands
//! on the harvest screen with `06-summary.md` + `07-harvest.md` (todos)
//! ready to collect. Tradeoff vs Full Debate: loses dimensional structure,
//! but pre-mortem + multi-persona action votes catch most blind spots
//! cheaply. A/B in real usage tells us if structure was worth its cost.

use axum::{
    extract::{Path, State},
    http::{header::CONTENT_TYPE, HeaderMap},
    response::{sse::Event, IntoResponse},
    Json,
};
use counsel_core::agents::{Agent, PersonaAgent, SecretaryAgent};
use counsel_core::{CounselService, SSEEvent, SseSink};
use counsel_model::{ChatMessage, ChatOptions};
use futures::StreamExt;
use serde::Deserialize;
use tokio::sync::mpsc;
use tokio::task::JoinSet;
use tokio_stream::wrappers::ReceiverStream;

use crate::routes::steps::PriorState;
use crate::ApiState;

#[derive(Debug, Deserialize)]
pub struct FreestyleRequest {
    #[serde(default)]
    pub prior_state: Option<PriorState>,
}

pub async fn run_freestyle(
    State(state): State<ApiState>,
    Path((project_id, session_id)): Path<(String, String)>,
    Json(req): Json<FreestyleRequest>,
) -> impl IntoResponse {
    let (tx, rx) = mpsc::channel::<String>(200);
    let sender: SseSink = tx.into();

    let project_id_clone = project_id.clone();
    let session_id_clone = session_id.clone();
    let state_clone = state.clone();
    let prior_state = req.prior_state.clone();

    tokio::spawn(async move {
        let s = sender.clone();

        // Tempdir hydration (mirrors /steps/N pattern)
        let legacy_storage = state_clone.storage.clone();
        let (storage, _temp_guard): (
            counsel_storage::Storage,
            Option<std::sync::Arc<tempfile::TempDir>>,
        ) = match &prior_state {
            Some(ps) => {
                let temp = match tempfile::Builder::new().prefix("counsel-fs-").tempdir() {
                    Ok(t) => std::sync::Arc::new(t),
                    Err(e) => {
                        let _ = s
                            .send(SSEEvent::error(format!("tempdir init failed: {}", e)))
                            .await;
                        return;
                    }
                };
                let sessions_root = temp.path().join("sessions");
                let storage = counsel_storage::Storage::new(sessions_root);
                if let Err(e) = crate::routes::steps::hydrate_storage(
                    &storage,
                    &project_id_clone,
                    &session_id_clone,
                    ps,
                )
                .await
                {
                    let _ = s
                        .send(SSEEvent::error(format!("hydrate failed: {}", e)))
                        .await;
                    return;
                }
                (storage, Some(temp))
            }
            None => (legacy_storage, None),
        };

        let model = state_clone.model.read().unwrap().clone();
        let service = CounselService::new(model.clone(), storage.clone(), state_clone.registry.clone());

        // Mark this as a "freestyle" run by writing the skipped-debate marker
        // up-front; run_summary's existing fallback will treat empty/marker
        // 05-debate.md as "no debate" and pull from Step 4 opinions instead.
        let marker = "# 辩论已跳过\n\n*Mode C 直接拿建议路径，跳过维度提取与辩论。Step 7 归纳直接基于 Step 4 + 共识提炼 + 行动建议。*\n";
        let _ = storage
            .write_session_file(&project_id_clone, &session_id_clone, "05-debate.md", marker)
            .await;

        let _ = s.send(SSEEvent::step_start(5)).await;

        // ─────────── Stage 1: Consensus extraction (Secretary, streamed) ──────
        let opinions = match storage
            .list_opinions(&project_id_clone, &session_id_clone)
            .await
        {
            Ok(v) if !v.is_empty() => v,
            Ok(_) => {
                let _ = s.send(SSEEvent::error(
                    "Step 4 opinions not found — run Step 4 before freestyle".to_string(),
                )).await;
                return;
            }
            Err(e) => {
                let _ = s.send(SSEEvent::error(format!("list_opinions failed: {}", e))).await;
                return;
            }
        };
        let opinions_text: String = opinions
            .iter()
            .map(|(name, body)| format!("## {}\n{}", name, body))
            .collect::<Vec<_>>()
            .join("\n\n");

        let consensus_prompt = counsel_core::prompts::freestyle_consensus_prompt(&opinions_text);
        let consensus_msgs = vec![
            ChatMessage::system("你是私董会主持人，在 Mode C 一键路径里，负责把幕僚发言压缩成一段共识 + 张力的提炼。"),
            ChatMessage::user(consensus_prompt),
        ];
        let secretary = SecretaryAgent::new(model.clone());
        let consensus_text = match secretary
            .run_streaming_collect(
                &consensus_msgs,
                ChatOptions::default().temperature(0.5).max_tokens(700),
                s.clone(),
            )
            .await
        {
            Ok(text) => text,
            Err(e) => {
                let _ = s.send(SSEEvent::error(format!("consensus failed: {}", e))).await;
                return;
            }
        };
        let consensus_clean = counsel_core::strip_think_tags(&consensus_text);
        let _ = storage
            .write_session_file(
                &project_id_clone,
                &session_id_clone,
                "04alt-consensus.md",
                &consensus_clean,
            )
            .await;

        // ─────────── Stage 2: Parallel persona actions (≤50字 each) ───────────
        let raw_input = storage
            .read_session_file(&project_id_clone, &session_id_clone, "00-raw-input.md")
            .await
            .unwrap_or_default();
        let defined = storage
            .read_session_file(&project_id_clone, &session_id_clone, "01-defined.md")
            .await
            .unwrap_or_default();
        let active = service.active_personas(&project_id_clone, &session_id_clone).await;

        let mut join_set: JoinSet<Result<(String, String), String>> = JoinSet::new();
        for wp in active {
            let slug = wp.slug.clone();
            let name = wp.name.clone();
            let title = wp.title.clone();
            let desc = wp.short_description();
            let rich = wp.build_system_prompt(&raw_input, None);
            let raw_input_c = raw_input.clone();
            let defined_c = defined.clone();
            let consensus_c = consensus_clean.clone();
            let model_c = model.clone();
            let sender_c = s.clone();

            join_set.spawn(async move {
                let agent = PersonaAgent::new(&slug, &name, &title, &desc, model_c);
                let prompt = counsel_core::prompts::freestyle_action_prompt(
                    &rich,
                    &raw_input_c,
                    &defined_c,
                    &consensus_c,
                );
                let messages = vec![
                    ChatMessage::system(format!(
                        "你是 {}，在 Mode C 一键路径里给案主一句 ≤50 字的行动建议。",
                        name
                    )),
                    ChatMessage::user(prompt),
                ];
                match agent
                    .run_streaming_collect(
                        &messages,
                        ChatOptions::default().temperature(0.6).max_tokens(120),
                        sender_c,
                    )
                    .await
                {
                    Ok(text) => Ok((name, text)),
                    Err(e) => {
                        eprintln!("[freestyle action] persona '{}' failed: {}", name, e);
                        Err(name)
                    }
                }
            });
        }

        let mut action_blocks: Vec<(String, String)> = Vec::new();
        while let Some(r) = join_set.join_next().await {
            match r {
                Ok(Ok((name, text))) => action_blocks.push((name, counsel_core::strip_think_tags(&text))),
                Ok(Err(name)) => action_blocks.push((name.clone(), format!("_（{} 此次未能给出行动建议——LLM 调用失败。）_", name))),
                Err(e) => {
                    tracing::warn!("freestyle JoinSet panic: {}", e);
                }
            }
        }
        let actions_md = action_blocks
            .iter()
            .map(|(name, text)| format!("## {}\n{}", name, text.trim()))
            .collect::<Vec<_>>()
            .join("\n\n");
        let _ = storage
            .write_session_file(
                &project_id_clone,
                &session_id_clone,
                "06alt-actions.md",
                &actions_md,
            )
            .await;

        // ─────────── Stage 3: Pre-mortem (reuse existing run_premortem) ───────
        if let Err(e) = service
            .run_premortem(&project_id_clone, &session_id_clone, s.clone())
            .await
        {
            tracing::warn!("[freestyle] premortem failed (continuing): {}", e);
        }

        // ─────────── Stage 4: Summary (existing run_summary handles marker) ───
        if let Err(e) = service
            .run_summary(&project_id_clone, &session_id_clone, s.clone())
            .await
        {
            let _ = s.send(SSEEvent::error(format!("summary failed: {}", e))).await;
        }

        // ─────────── Stage 5: Auto-harvest (Michael 2026-04-26) ───────────────
        // Mode C is "skip everything heavy" — that should include the
        // reflection panel + manual harvest click. Pre-stub empty client_notes
        // and run_harvest inline so the case-owner lands on Step 8 with todos
        // + bayesian + persona evals already populated.
        let stub_notes = "## 我学到了什么 / 意识到了什么\n\n_(Mode C 跳过)_\n\n## 我将做哪些不同\n\n_(Mode C 跳过)_\n\n## 我的下一步\n\n_(Mode C 跳过)_\n";
        let _ = storage
            .write_session_file(
                &project_id_clone,
                &session_id_clone,
                "07-client-notes.md",
                stub_notes,
            )
            .await;
        if let Err(e) = service
            .run_harvest(&project_id_clone, &session_id_clone, s.clone())
            .await
        {
            tracing::warn!("[freestyle] auto-harvest failed (continuing): {}", e);
        }

        // Emit step_files so client lands new files in IDB (only in tempdir mode)
        if _temp_guard.is_some() {
            let session_files = storage
                .collect_session_files(&project_id_clone, &session_id_clone)
                .await
                .unwrap_or_default();
            let user_files = storage
                .collect_user_files(&project_id_clone)
                .await
                .unwrap_or_default();
            let payload = serde_json::json!({
                "session_files": session_files,
                "user_files": user_files,
            });
            // Use step=7 marker since we just produced 06-summary.md (Step 7's output)
            let _ = s.send(SSEEvent::step_files(7, payload)).await;
        }

        // Synthetic step_done so frontend orchestrator's _waitForStepDone resolves
        let _ = s
            .send(SSEEvent::step_done_with_data(
                7,
                serde_json::json!({"freestyle": true}),
            ))
            .await;
    });

    let stream = ReceiverStream::new(rx)
        .map(|data| Ok::<_, std::convert::Infallible>(Event::default().data(data)));
    let sse = axum::response::sse::Sse::new(stream)
        .keep_alive(axum::response::sse::KeepAlive::default());

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, "text/event-stream".parse().unwrap());
    (headers, sse)
}
