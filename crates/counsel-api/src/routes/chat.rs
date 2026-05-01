//! Admin-only WeChat-style group chat (test page, 2026-04-27).
//!
//! Lightweight free-form chat alternative to the heavy 8-step flow. Each room
//! has preset personas; user messages trigger all selected personas to reply
//! (or a single persona if @-mentioned). Persisted to disk under
//! `chat-rooms/{room_id}/{meta.json,messages.jsonl}` — sibling of `sessions/`.
//!
//! Auth: all routes are gated by `require_auth` + `require_admin`. The page
//! itself (`public/chat-test.html`) is a known URL with no topbar entry —
//! discoverable only by Michael / admin allowlist.

use axum::{
    extract::{Path, State},
    http::{header::CONTENT_TYPE, HeaderMap, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse,
    },
    Json,
};
use counsel_core::agents::{Agent, PersonaAgent};
use counsel_core::wisdom::WisdomPersona;
use counsel_core::{SSEEvent, SseSink};
use counsel_model::{ChatMessage, ChatOptions};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;
use tokio::sync::mpsc;
use tokio::time::{timeout, Duration};
use tokio_stream::wrappers::ReceiverStream;

use crate::auth::AuthUser;
use crate::{ApiError, ApiResult, ApiState};

const CHAT_ROOMS_DIR: &str = "chat-rooms";
const OPENING_TIMEOUT_SECS: u64 = 5;

// ─── Data shapes ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomMeta {
    pub room_id: String,
    pub created_by: String,
    pub created_at: String,
    pub title: String,
    pub persona_slugs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatTurn {
    pub ts: String,
    /// "facilitator" | "user" | "persona"
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub slug: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub name: Option<String>,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct RoomSummary {
    pub room_id: String,
    pub title: String,
    pub created_at: String,
    pub created_by: String,
    pub persona_slugs: Vec<String>,
    pub turn_count: usize,
    pub last_preview: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RoomDetail {
    pub room: RoomMeta,
    pub turns: Vec<ChatTurn>,
}

#[derive(Debug, Serialize)]
pub struct PersonaInfo {
    pub slug: String,
    pub name: String,
    pub title: String,
}

// ─── Filesystem helpers ─────────────────────────────────────────────────────
//
// Path scheme (per-user isolation, 2026-04-27 v2):
//   chat-rooms/by-user/{user_id}/{room_id}/{meta.json,messages.jsonl}
//
// Ownership is enforced by path: every handler derives `user_id` from the JWT
// `AuthUser` extension, never from the request body or URL. There is no way
// for user A to reach user B's room directory because the path is scoped by
// the authenticated user_id.

fn user_rooms_root(user_id: &str) -> std::path::PathBuf {
    std::path::PathBuf::from(CHAT_ROOMS_DIR)
        .join("by-user")
        .join(user_id)
}

fn room_dir(user_id: &str, room_id: &str) -> std::path::PathBuf {
    user_rooms_root(user_id).join(room_id)
}

fn validate_room_id(room_id: &str) -> bool {
    !room_id.is_empty()
        && room_id.len() < 64
        && room_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// User IDs are UUIDs from the auth schema. Defense-in-depth: never let an
/// unexpected character into a directory name (no ../, no NUL, no spaces).
fn validate_user_id(user_id: &str) -> bool {
    !user_id.is_empty()
        && user_id.len() < 80
        && user_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn now_iso() -> String {
    chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string()
}

fn fallback_opening(names_joined: &str) -> String {
    format!("欢迎，今天群里有 {}。最近在想什么？", names_joined)
}

async fn read_meta(user_id: &str, room_id: &str) -> Option<RoomMeta> {
    let p = room_dir(user_id, room_id).join("meta.json");
    let s = tokio::fs::read_to_string(&p).await.ok()?;
    serde_json::from_str(&s).ok()
}

async fn read_turns(user_id: &str, room_id: &str) -> Vec<ChatTurn> {
    let p = room_dir(user_id, room_id).join("messages.jsonl");
    let s = match tokio::fs::read_to_string(&p).await {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    s.lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str::<ChatTurn>(l).ok())
        .collect()
}

async fn append_turn(user_id: &str, room_id: &str, turn: &ChatTurn) -> std::io::Result<()> {
    let dir = room_dir(user_id, room_id);
    tokio::fs::create_dir_all(&dir).await?;
    let p = dir.join("messages.jsonl");
    let mut f = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&p)
        .await?;
    let line = format!(
        "{}\n",
        serde_json::to_string(turn)
            .unwrap_or_else(|_| String::from(r#"{"role":"error","content":""}"#))
    );
    f.write_all(line.as_bytes()).await?;
    Ok(())
}

async fn lookup_username(state: &ApiState, user_id: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT username FROM users WHERE id = ?")
        .bind(user_id)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
}

// ─── GET /api/chat/personas ─────────────────────────────────────────────────

pub async fn list_personas(State(state): State<ApiState>) -> ApiResult<Json<Vec<PersonaInfo>>> {
    let out: Vec<PersonaInfo> = state
        .registry
        .all()
        .iter()
        .map(|p| PersonaInfo {
            slug: p.slug.clone(),
            name: p.name.clone(),
            title: p.title.clone(),
        })
        .collect();
    Ok(Json(out))
}

// ─── POST /api/chat/rooms — create + facilitator opening ────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateRoomRequest {
    #[serde(default)]
    pub title: String,
    pub persona_slugs: Vec<String>,
}

pub async fn create_room(
    State(state): State<ApiState>,
    AuthUser(user_id): AuthUser,
    Json(req): Json<CreateRoomRequest>,
) -> ApiResult<Json<RoomDetail>> {
    if !validate_user_id(&user_id) {
        return Err(ApiError::BadRequest("invalid user id".into()));
    }
    if req.persona_slugs.is_empty() {
        return Err(ApiError::BadRequest("至少选一个幕僚".into()));
    }
    let valid: Vec<&WisdomPersona> = state.registry.filtered(&req.persona_slugs);
    if valid.is_empty() {
        return Err(ApiError::BadRequest("没有合法的幕僚 slug".into()));
    }
    let normalized_slugs: Vec<String> = valid.iter().map(|p| p.slug.clone()).collect();
    let names: Vec<String> = valid.iter().map(|p| p.name.clone()).collect();

    let room_id = uuid::Uuid::new_v4().to_string();
    let username = lookup_username(&state, &user_id)
        .await
        .unwrap_or_else(|| user_id.clone());
    let title = if req.title.trim().is_empty() {
        "新群聊".to_string()
    } else {
        req.title.trim().chars().take(60).collect::<String>()
    };

    let meta = RoomMeta {
        room_id: room_id.clone(),
        created_by: username,
        created_at: now_iso(),
        title: title.clone(),
        persona_slugs: normalized_slugs,
    };

    // Persist metadata under the user's isolated path.
    let dir = room_dir(&user_id, &room_id);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| ApiError::Internal(format!("create dir failed: {}", e)))?;
    let meta_str = serde_json::to_string_pretty(&meta)
        .map_err(|e| ApiError::Internal(format!("meta serialize failed: {}", e)))?;
    tokio::fs::write(dir.join("meta.json"), meta_str)
        .await
        .map_err(|e| ApiError::Internal(format!("write meta failed: {}", e)))?;

    // Generate facilitator opening (non-streaming, ~1-2 sentences). This must
    // never block room creation: if the model/provider is slow, use a local
    // opening so the user can start chatting immediately.
    let names_joined = names.join("、");
    let opening_user_prompt = format!(
        "案主刚拉好这个群，群里有：{}。请你用 1-2 句话亲切开场，问案主\"最近在想什么\"或\"最近遇到什么困惑\"。要自然、像微信里的朋友说话，不要太正式，不要列条目。",
        names_joined
    );
    let messages = vec![
        ChatMessage::system("你是私董会的主持人。术语：幕僚/案主，全程中文。"),
        ChatMessage::user(opening_user_prompt),
    ];
    let model = state.model.read().unwrap().clone();
    let opening_result = timeout(
        Duration::from_secs(OPENING_TIMEOUT_SECS),
        model.chat(
            &messages,
            ChatOptions::default().temperature(0.7).max_tokens(120),
        ),
    )
    .await;
    let opening = match opening_result {
        Ok(Ok(resp)) => counsel_core::strip_think_tags(&resp.content),
        Ok(Err(e)) => {
            tracing::warn!("chat room opening failed: {}", e);
            fallback_opening(&names_joined)
        }
        Err(_) => {
            tracing::warn!(
                "chat room opening timed out after {}s; using fallback",
                OPENING_TIMEOUT_SECS
            );
            fallback_opening(&names_joined)
        }
    };
    let opening_clean = if opening.trim().is_empty() {
        fallback_opening(&names_joined)
    } else {
        opening
    };

    let opening_turn = ChatTurn {
        ts: now_iso(),
        role: "facilitator".into(),
        slug: None,
        name: Some("主持人".into()),
        content: opening_clean,
    };
    append_turn(&user_id, &room_id, &opening_turn)
        .await
        .map_err(|e| ApiError::Internal(format!("append failed: {}", e)))?;

    Ok(Json(RoomDetail {
        room: meta,
        turns: vec![opening_turn],
    }))
}

// ─── GET /api/chat/rooms — list current user's rooms ────────────────────────

pub async fn list_rooms(
    State(_state): State<ApiState>,
    AuthUser(user_id): AuthUser,
) -> ApiResult<Json<Vec<RoomSummary>>> {
    if !validate_user_id(&user_id) {
        return Err(ApiError::BadRequest("invalid user id".into()));
    }
    let root = user_rooms_root(&user_id);
    if !root.exists() {
        return Ok(Json(vec![]));
    }
    let mut rd = tokio::fs::read_dir(&root)
        .await
        .map_err(|e| ApiError::Internal(format!("read_dir failed: {}", e)))?;
    let mut summaries: Vec<RoomSummary> = Vec::new();
    while let Some(entry) = rd
        .next_entry()
        .await
        .map_err(|e| ApiError::Internal(format!("next_entry failed: {}", e)))?
    {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let dirname = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if !validate_room_id(&dirname) {
            continue;
        }
        if let Some(meta) = read_meta(&user_id, &dirname).await {
            let turns = read_turns(&user_id, &dirname).await;
            let last_preview = turns.last().map(|t| {
                let speaker = t.name.as_deref().unwrap_or(match t.role.as_str() {
                    "user" => "案主",
                    "facilitator" => "主持人",
                    _ => "",
                });
                let snippet: String = t.content.chars().take(40).collect();
                format!("{}: {}", speaker, snippet)
            });
            summaries.push(RoomSummary {
                room_id: meta.room_id.clone(),
                title: meta.title,
                created_at: meta.created_at,
                created_by: meta.created_by,
                persona_slugs: meta.persona_slugs,
                turn_count: turns.len(),
                last_preview,
            });
        }
    }
    summaries.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(Json(summaries))
}

// ─── GET /api/chat/rooms/:id — full room (only for owner) ───────────────────

pub async fn get_room(
    State(_state): State<ApiState>,
    AuthUser(user_id): AuthUser,
    Path(room_id): Path<String>,
) -> ApiResult<Json<RoomDetail>> {
    if !validate_user_id(&user_id) {
        return Err(ApiError::BadRequest("invalid user id".into()));
    }
    if !validate_room_id(&room_id) {
        return Err(ApiError::BadRequest("invalid room id".into()));
    }
    // Path-based ownership: meta.json only exists under THIS user's dir, so
    // a missing file IS the same as "not yours / not found" — we return the
    // same 404 either way. Don't leak existence to other users.
    let meta = read_meta(&user_id, &room_id)
        .await
        .ok_or_else(|| ApiError::NotFound("room not found".into()))?;
    let turns = read_turns(&user_id, &room_id).await;
    Ok(Json(RoomDetail { room: meta, turns }))
}

// ─── DELETE /api/chat/rooms/:id (only for owner) ────────────────────────────

pub async fn delete_room(
    State(_state): State<ApiState>,
    AuthUser(user_id): AuthUser,
    Path(room_id): Path<String>,
) -> ApiResult<StatusCode> {
    if !validate_user_id(&user_id) {
        return Err(ApiError::BadRequest("invalid user id".into()));
    }
    if !validate_room_id(&room_id) {
        return Err(ApiError::BadRequest("invalid room id".into()));
    }
    let dir = room_dir(&user_id, &room_id);
    if dir.exists() {
        tokio::fs::remove_dir_all(&dir)
            .await
            .map_err(|e| ApiError::Internal(format!("remove failed: {}", e)))?;
    }
    Ok(StatusCode::NO_CONTENT)
}

// ─── POST /api/chat/rooms/:id/messages — send + SSE stream replies ──────────

#[derive(Debug, Deserialize)]
pub struct SendMessageRequest {
    pub content: String,
}

/// Single-shot SSE reply that just emits an Error event then closes — used
/// when the message endpoint validates and rejects up-front.
fn sse_error_response(msg: String) -> axum::response::Response {
    let (tx, rx) = mpsc::channel::<String>(4);
    let _ = tx.try_send(SSEEvent::error(msg).to_sse_data());
    drop(tx);
    let stream = ReceiverStream::new(rx)
        .map(|d| Ok::<_, std::convert::Infallible>(Event::default().data(d)));
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, "text/event-stream".parse().unwrap());
    (
        headers,
        Sse::new(stream).keep_alive(KeepAlive::default()),
    )
        .into_response()
}

/// Decide which personas should respond to a given user message. If the user
/// prefixed with `@<name>` or `@<slug>` matching one of the room's personas,
/// only that persona replies. Otherwise all room personas reply sequentially.
fn pick_responders(content: &str, room_personas: &[WisdomPersona]) -> Vec<WisdomPersona> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with('@') {
        return room_personas.to_vec();
    }
    for p in room_personas {
        let by_name = format!("@{}", p.name);
        let by_slug = format!("@{}", p.slug);
        if trimmed.starts_with(&by_name) || trimmed.starts_with(&by_slug) {
            return vec![p.clone()];
        }
    }
    // Unknown @ → fall back to all (don't silently drop the message)
    room_personas.to_vec()
}

pub async fn send_message(
    State(state): State<ApiState>,
    AuthUser(user_id): AuthUser,
    Path(room_id): Path<String>,
    Json(req): Json<SendMessageRequest>,
) -> axum::response::Response {
    if !validate_user_id(&user_id) {
        return sse_error_response("invalid user id".into());
    }
    if !validate_room_id(&room_id) {
        return sse_error_response("invalid room id".into());
    }
    let meta = match read_meta(&user_id, &room_id).await {
        Some(m) => m,
        None => return sse_error_response("room not found".into()),
    };
    let user_content = req.content.trim().to_string();
    if user_content.is_empty() {
        return sse_error_response("empty message".into());
    }

    let room_personas: Vec<WisdomPersona> = state
        .registry
        .filtered(&meta.persona_slugs)
        .into_iter()
        .cloned()
        .collect();
    if room_personas.is_empty() {
        return sse_error_response("room has no valid personas".into());
    }
    let responders = pick_responders(&user_content, &room_personas);

    // Persist user turn before streaming so reload mid-stream still sees it.
    let user_turn = ChatTurn {
        ts: now_iso(),
        role: "user".into(),
        slug: None,
        name: None,
        content: user_content.clone(),
    };
    if let Err(e) = append_turn(&user_id, &room_id, &user_turn).await {
        return sse_error_response(format!("persist user turn failed: {}", e));
    }

    let (tx, rx) = mpsc::channel::<String>(200);
    let sender: SseSink = tx.into();
    let model = state.model.read().unwrap().clone();
    let room_id_clone = room_id.clone();
    let user_id_clone = user_id.clone();
    let meta_clone = meta.clone();

    tokio::spawn(async move {
        let s = sender.clone();
        let history = read_turns(&user_id_clone, &room_id_clone).await;

        for persona in &responders {
            let messages = build_chat_messages(persona, &room_personas, &meta_clone, &history);

            let agent = PersonaAgent::new(
                &persona.slug,
                &persona.name,
                &persona.title,
                persona.short_description(),
                model.clone(),
            );
            match agent
                .run_streaming_collect(
                    &messages,
                    ChatOptions::default().temperature(0.7).max_tokens(280),
                    s.clone(),
                )
                .await
            {
                Ok(text) => {
                    let cleaned = counsel_core::strip_think_tags(&text);
                    let turn = ChatTurn {
                        ts: now_iso(),
                        role: "persona".into(),
                        slug: Some(persona.slug.clone()),
                        name: Some(persona.name.clone()),
                        content: cleaned,
                    };
                    if let Err(e) = append_turn(&user_id_clone, &room_id_clone, &turn).await {
                        let _ = s
                            .send(SSEEvent::error(format!("persist {} failed: {}", persona.name, e)))
                            .await;
                    }
                }
                Err(e) => {
                    let _ = s
                        .send(SSEEvent::error(format!("{} 出错: {}", persona.name, e)))
                        .await;
                }
            }
        }
    });

    let stream = ReceiverStream::new(rx)
        .map(|d| Ok::<_, std::convert::Infallible>(Event::default().data(d)));
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, "text/event-stream".parse().unwrap());
    (
        headers,
        Sse::new(stream).keep_alive(KeepAlive::default()),
    )
        .into_response()
}

/// Build the message array for one persona's reply. The persona sees:
/// - a system prompt = its 5-layer build_system_prompt + group-chat framing
/// - history rendered with each prior turn as a labeled user message,
///   except this persona's own past turns which become assistant messages
///   (so the model treats them as "things I previously said").
fn build_chat_messages(
    persona: &WisdomPersona,
    room_personas: &[WisdomPersona],
    meta: &RoomMeta,
    history: &[ChatTurn],
) -> Vec<ChatMessage> {
    // The user_situation parameter to build_system_prompt is unused for fingerprint=None,
    // so we pass the most recent user turn (or empty) as a stable seed.
    let latest_user_msg = history
        .iter()
        .rev()
        .find(|t| t.role == "user")
        .map(|t| t.content.clone())
        .unwrap_or_default();

    let base = persona.build_system_prompt(&latest_user_msg, None);

    let other_names: Vec<String> = room_personas
        .iter()
        .filter(|p| p.slug != persona.slug)
        .map(|p| p.name.clone())
        .collect();
    let group_label = if other_names.is_empty() {
        "1v1 对话".to_string()
    } else {
        format!("和 {} 一起", other_names.join("、"))
    };

    let group_framing = format!(
        "\n\n## 群聊场景\n你正和案主{}在一个轻量微信群里 freestyle 聊天（标题：{}）。\n\n规则：\n- 用 1-3 句话回应即可，不要写长篇大论\n- 像在微信群里说话那样自然、真诚、有温度\n- 直接对案主说话；如果别的幕僚之前发了言，可以呼应或反驳\n- 可以问回案主一两个问题，让对话流转\n- 全程中文，不要列条目，不要复述案主的问题",
        group_label, meta.title
    );

    let system_prompt = format!("{}{}", base, group_framing);
    let mut messages: Vec<ChatMessage> = vec![ChatMessage::system(system_prompt)];

    for t in history {
        match t.role.as_str() {
            "user" => {
                messages.push(ChatMessage::user(format!("[案主]: {}", t.content)));
            }
            "facilitator" => {
                messages.push(ChatMessage::user(format!("[主持人]: {}", t.content)));
            }
            "persona" => {
                if t.slug.as_deref() == Some(persona.slug.as_str()) {
                    messages.push(ChatMessage::assistant(t.content.clone()));
                } else {
                    let nm = t.name.as_deref().unwrap_or("某幕僚");
                    messages.push(ChatMessage::user(format!("[{}]: {}", nm, t.content)));
                }
            }
            _ => {}
        }
    }

    messages
}

// ─── Privacy: telemetry field whitelist ─────────────────────────────────────
//
// chat_* events MUST only contain metadata (ids, counts, latency). Anything
// else is treated as a content leak and the event is dropped at ingest time.
// This is the second line of defense (after the frontend code review); a
// rogue or compromised client cannot use these event types as an exfil
// channel — the server filters payload fields here.
//
// Spec source of truth: PRIORITY-ROADMAP-PG-BASED.md §3.9 "服务端遥测"
// table. If you change the contract there, change the whitelist here AND
// update the unit tests below in the same commit.

const CHAT_EVENT_WHITELIST: &[(&str, &[&str])] = &[
    (
        "chat_room_created",
        &["room_id", "persona_count", "persona_slugs", "has_title"],
    ),
    (
        "chat_message_sent",
        &[
            "room_id",
            "msg_index",
            "char_count",
            "has_mention",
            "mention_persona_slug",
        ],
    ),
    (
        "chat_persona_replied",
        &["room_id", "persona_slug", "reply_char_count", "latency_ms"],
    ),
    (
        "chat_topic_categorized",
        &["room_id", "category"],
    ),
    (
        "chat_room_resumed",
        &["room_id", "days_since_create", "turn_count"],
    ),
    (
        "chat_session_heartbeat",
        &["room_id"],
    ),
];

/// Returns `true` if `event_type` is not a `chat_*` event (we don't gate
/// non-chat events here — Step events have their own contract). For chat
/// events: returns `true` only when every key in `data` is in the whitelist.
/// Null `data` is allowed.
pub fn chat_event_payload_allowed(event_type: &str, data: &serde_json::Value) -> bool {
    if !event_type.starts_with("chat_") {
        return true;
    }
    let allowed: &[&str] = match CHAT_EVENT_WHITELIST
        .iter()
        .find(|(t, _)| *t == event_type)
    {
        Some((_, fields)) => fields,
        // Unknown chat_* event — be conservative and reject.
        None => return false,
    };
    let obj = match data.as_object() {
        Some(o) => o,
        // Non-object payloads (null/array/scalar) carry no field; allow null only.
        None => return data.is_null(),
    };
    for k in obj.keys() {
        if !allowed.iter().any(|f| f == k) {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod privacy_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn allows_whitelisted_room_created() {
        assert!(chat_event_payload_allowed(
            "chat_room_created",
            &json!({
                "room_id": "abc",
                "persona_count": 3,
                "persona_slugs": ["mao-zedong", "paul-graham"],
                "has_title": true,
            }),
        ));
    }

    #[test]
    fn rejects_message_text_field() {
        // The whole point: never accept anything that looks like content.
        assert!(!chat_event_payload_allowed(
            "chat_message_sent",
            &json!({
                "room_id": "abc",
                "char_count": 42,
                "text": "this is the secret message body",
            }),
        ));
    }

    #[test]
    fn rejects_title_field() {
        assert!(!chat_event_payload_allowed(
            "chat_room_created",
            &json!({"room_id": "abc", "title": "leaky title"}),
        ));
    }

    #[test]
    fn rejects_persona_reply_text() {
        assert!(!chat_event_payload_allowed(
            "chat_persona_replied",
            &json!({"room_id": "abc", "persona_slug": "mao-zedong", "reply": "leaky"}),
        ));
    }

    #[test]
    fn allows_optional_mention_slug() {
        assert!(chat_event_payload_allowed(
            "chat_message_sent",
            &json!({
                "room_id": "abc",
                "msg_index": 0,
                "char_count": 12,
                "has_mention": true,
                "mention_persona_slug": "paul-graham",
            }),
        ));
    }

    #[test]
    fn rejects_unknown_chat_event_type() {
        // If a client invents a new chat_* type, drop it — the contract
        // must come from the roadmap + this whitelist, never from clients.
        assert!(!chat_event_payload_allowed(
            "chat_secret_exfil",
            &json!({"room_id": "abc"}),
        ));
    }

    #[test]
    fn passes_through_non_chat_events() {
        // step_entered / question_categorized / etc. are owned by other
        // contracts; this whitelist only applies to chat_*.
        assert!(chat_event_payload_allowed(
            "step_entered",
            &json!({"step": 1, "session_id": "abc"}),
        ));
    }

    #[test]
    fn null_payload_allowed() {
        assert!(chat_event_payload_allowed(
            "chat_session_heartbeat",
            &serde_json::Value::Null,
        ));
    }
}
