//! F2 (2026-04-26) — Per-bubble follow-up chat.
//!
//! After a persona finishes speaking (Step 4+), the case-owner can expand
//! that persona's bubble and ask a short follow-up question. This route
//! takes the persona slug + the question, runs the persona agent in voice
//! against the prior opinion, streams the answer back as PersonaChunk SSE
//! events, and (in tempdir mode) returns the updated `03-opinions/{Name}.md`
//! via the existing `step_files` mechanism so the client lands the new
//! `### 用户追问` block in IndexedDB.
//!
//! The opinion file gets a `### 用户追问 ({ts})\n{question}\n\n### 回应\n{answer}`
//! block appended. Downstream Step 5/6/7/8 prompts already read these files
//! via `prepend_user_reactions` flow — no additional injection wiring needed.
//!
//! Soft cap: ≤2 follow-ups per persona per session. Frontend enforces UI;
//! backend doesn't enforce since it's harmless to allow more if frontend bug.

use axum::{
    extract::{Path, State},
    http::{header::CONTENT_TYPE, HeaderMap},
    response::{sse::Event, IntoResponse},
    Json,
};
use counsel_core::agents::{Agent, PersonaAgent};
use counsel_core::{SSEEvent, SseSink};
use counsel_model::{ChatMessage, ChatOptions};
use futures::StreamExt;
use serde::Deserialize;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

use crate::routes::steps::PriorState;
use crate::ApiState;

#[derive(Debug, Deserialize)]
pub struct FollowUpRequest {
    pub question: String,
    #[serde(default)]
    pub prior_state: Option<PriorState>,
}

pub async fn submit_follow_up(
    State(state): State<ApiState>,
    Path((project_id, session_id, slug)): Path<(String, String, String)>,
    Json(req): Json<FollowUpRequest>,
) -> impl IntoResponse {
    let (tx, rx) = mpsc::channel::<String>(100);
    let sender: SseSink = tx.into();

    let project_id_clone = project_id.clone();
    let session_id_clone = session_id.clone();
    let state_clone = state.clone();
    let prior_state = req.prior_state.clone();
    let question = req.question.trim().to_string();

    tokio::spawn(async move {
        let s = sender.clone();

        if question.chars().count() < 2 {
            let _ = s
                .send(SSEEvent::error("追问内容太短".to_string()))
                .await;
            return;
        }

        // Phase C · tempdir per request. The persona's prior opinion file
        // must be in prior_state.files keyed as "03-opinions/{Name}.md".
        let legacy_storage = state_clone.storage.clone();
        let (storage, _temp_guard): (
            counsel_storage::Storage,
            Option<std::sync::Arc<tempfile::TempDir>>,
        ) = match &prior_state {
            Some(ps) => {
                let temp = match tempfile::Builder::new().prefix("counsel-fu-").tempdir() {
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

        // Resolve persona by slug from registry
        let persona = match state_clone
            .registry
            .all()
            .iter()
            .find(|p| p.slug == slug)
            .cloned()
        {
            Some(p) => p,
            None => {
                let _ = s
                    .send(SSEEvent::error(format!("unknown persona: {}", slug)))
                    .await;
                return;
            }
        };

        // Read prior opinion (filename mirrors how run_opinions writes it:
        // `{name with spaces → dashes}.md`)
        let opinion_filename = format!(
            "03-opinions/{}.md",
            persona.name.replace(' ', "-")
        );
        let prior_opinion = storage
            .read_session_file(&project_id_clone, &session_id_clone, &opinion_filename)
            .await
            .unwrap_or_default();
        if prior_opinion.trim().is_empty() {
            let _ = s
                .send(SSEEvent::error(format!(
                    "{} 还没在本轮发言，无法追问",
                    persona.name
                )))
                .await;
            return;
        }

        let raw_input = storage
            .read_session_file(&project_id_clone, &session_id_clone, "00-raw-input.md")
            .await
            .unwrap_or_default();
        let defined = storage
            .read_session_file(&project_id_clone, &session_id_clone, "01-defined.md")
            .await
            .unwrap_or_default();

        let rich_prompt = persona.build_system_prompt(&raw_input, None);
        let user_prompt = counsel_core::prompts::persona_follow_up_prompt(
            &rich_prompt,
            &raw_input,
            &defined,
            &prior_opinion,
            &question,
        );

        let messages = vec![
            ChatMessage::system(format!(
                "你是 {}，案主在听完你 Step 4 的发言后，对你提出一个追问。请用你的 voice 简短回应（≤80 个汉字），不要换框架，不要给建议清单，直接回应这一个具体问题。",
                persona.name
            )),
            ChatMessage::user(user_prompt),
        ];

        let model = state_clone.model.read().unwrap().clone();
        let agent = PersonaAgent::new(
            &persona.slug,
            &persona.name,
            &persona.title,
            &persona.short_description(),
            model,
        );

        // Stream the response (PersonaStart / PersonaChunk / PersonaDone events)
        let answer = match agent
            .run_streaming_collect(
                &messages,
                ChatOptions::default()
                    .temperature(0.6)
                    .max_tokens(200), // ~80 Chinese chars + buffer
                s.clone(),
            )
            .await
        {
            Ok(text) => text,
            Err(e) => {
                let _ = s
                    .send(SSEEvent::error(format!("追问回复失败: {}", e)))
                    .await;
                return;
            }
        };

        // Append to opinion file
        let ts = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
        let appended = format!(
            "{}\n\n### 用户追问 ({})\n{}\n\n### 回应\n{}\n",
            prior_opinion.trim_end(),
            ts,
            question,
            counsel_core::strip_think_tags(&answer).trim()
        );
        if let Err(e) = storage
            .write_session_file(&project_id_clone, &session_id_clone, &opinion_filename, &appended)
            .await
        {
            tracing::warn!("follow-up: failed to persist opinion file: {}", e);
        }

        // In tempdir mode, emit step_files so client lands updated file in IDB
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
            // Reuse step 4 as the "step" marker since this updates 03-opinions/*
            let _ = s.send(SSEEvent::step_files(4, payload)).await;
        }

        // Emit a synthetic step_done so the frontend's streamSSE awaiter can resolve
        let _ = s
            .send(SSEEvent::step_done_with_data(
                4,
                serde_json::json!({"follow_up": true, "persona": slug}),
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
