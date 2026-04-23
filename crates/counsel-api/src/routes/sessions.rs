//! Session routes

use axum::{
    extract::{Path, State},
    http::header::CONTENT_TYPE,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{ApiResult, ApiState};

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateSessionRequest {
    pub raw_input: String,
}

pub async fn list_sessions(
    State(state): State<ApiState>,
    Path(project_id): Path<String>,
) -> ApiResult<Json<Vec<counsel_storage::SessionSummary>>> {
    let sessions = state.storage.list_sessions(&project_id).await?;
    Ok(Json(sessions))
}

pub async fn create_session(
    State(state): State<ApiState>,
    Path(project_id): Path<String>,
    Json(req): Json<CreateSessionRequest>,
) -> ApiResult<Json<counsel_storage::Session>> {
    let session = state.storage.create_session(&project_id, req.raw_input).await?;

    // Also save raw input as file
    state.storage.write_session_file(&project_id, &session.id, "00-raw-input.md", &session.raw_input).await?;

    Ok(Json(session))
}

pub async fn get_session(
    State(state): State<ApiState>,
    Path((project_id, session_id)): Path<(String, String)>,
) -> ApiResult<Json<counsel_storage::SessionSummary>> {
    let session = state.storage.get_session(&project_id, &session_id).await?;
    Ok(Json(session))
}

pub async fn get_session_file(
    State(state): State<ApiState>,
    Path((project_id, session_id, filename)): Path<(String, String, String)>,
) -> ApiResult<impl IntoResponse> {
    // Reject path traversal (filename arrives via /files/*filename wildcard route,
    // so it can contain subdirs like "03-opinions/Paul-Graham.md" — but never ..)
    if filename.contains("..") || filename.starts_with('/') {
        return Err(counsel_storage::StorageError::NotFound(filename).into());
    }
    let content = state.storage.read_session_file(&project_id, &session_id, &filename).await?;
    Ok(([(CONTENT_TYPE, "text/markdown")], content).into_response())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClientNotesRequest {
    pub learned: Option<String>,
    pub differently: Option<String>,
    pub next: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReactionRequest {
    pub step: u8,
    pub persona: Option<String>,
    pub reaction: String,  // "⭐" | "❗" | "📝"
    pub snippet: Option<String>,
    pub note: Option<String>,
    /// Phrase-level anchor: ~40 chars of source text immediately before snippet.
    /// Used by the frontend replay walker to disambiguate when a snippet appears
    /// multiple times in a message (Phase 2.13 phrase-level upgrade, 2026-04-22).
    pub prefix: Option<String>,
    /// Phrase-level anchor: ~40 chars immediately after snippet.
    pub suffix: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TodoCommitRequest {
    pub text: String,
    pub checked: bool,
}

/// Append a user's todo commitment (check/uncheck) to user-wiki.md as an
/// event-log entry. Replaces the old "dump-all-LLM-todos" behavior: only
/// what the client actually clicks enters the wiki, treating the click as
/// a genuine commitment signal rather than passive acceptance of every
/// advisor-generated action (Michael 2026-04-22).
pub async fn commit_todo(
    State(state): State<ApiState>,
    Path((_project_id, session_id)): Path<(String, String)>,
    Json(req): Json<TodoCommitRequest>,
) -> ApiResult<Json<serde_json::Value>> {
    let text = req.text.trim();
    if text.is_empty() {
        return Ok(Json(serde_json::json!({ "saved": false, "reason": "empty text" })));
    }
    let existing = state.storage.read_user_wiki().await.unwrap_or_default();
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
    let action = if req.checked { "✅ 承诺" } else { "↩ 取消承诺" };

    // Look for an existing "## 行动承诺日志" section in user-wiki.md. If present,
    // append to it. If not, create it (at the top, before any session entries).
    let header = "## 行动承诺日志（User Committed Todos）";
    let line = format!("- [{}] [{} · Session {}] {} — {}", now, action, session_id, if req.checked { "✅" } else { "↩" }, text);

    let updated = if existing.contains(header) {
        // Append at the section's end by inserting before the next `## ` or `---`
        let idx = existing.find(header).unwrap();
        let after_header = &existing[idx + header.len()..];
        // Find the next section boundary
        let boundary = after_header.find("\n## ").or_else(|| after_header.find("\n---\n"));
        match boundary {
            Some(b) => {
                let insert_at = idx + header.len() + b;
                format!("{}\n{}{}", &existing[..insert_at], line, &existing[insert_at..])
            }
            None => format!("{}\n{}", existing.trim_end(), line),
        }
    } else {
        // Create section; insert near the top (after the intro paragraph)
        let entry_marker = "\n\n---\n## 项目";
        if let Some(idx) = existing.find(entry_marker) {
            format!("{}\n\n{}\n{}\n{}", &existing[..idx], header, line, &existing[idx..])
        } else if existing.trim().is_empty() {
            format!("# 案主画像（User Wiki）\n\n*持续累积的案主画像：身份、认知迭代、决策模式、跨项目信念演化。*\n\n{}\n{}\n", header, line)
        } else {
            format!("{}\n\n{}\n{}\n", existing.trim_end(), header, line)
        }
    };

    state.storage.write_user_wiki(&updated).await?;
    Ok(Json(serde_json::json!({ "saved": true })))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FollowUpItem {
    pub todo: String,
    pub committed_at: String,  // ISO-ish local time "YYYY-MM-DD HH:MM"
    pub session_id: String,
    pub days_ago: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FollowUpResponse {
    pub todo: String,
    pub committed_at: String,
    pub session_id: String,
    pub status: String,  // "done" | "in_progress" | "skipped" | "reframed"
    pub reply: String,
}

/// Phase 2.3 — Follow-up assistant. Returns commitments made more than N days
/// ago that don't yet have a journal entry. Michael can write a reply for each
/// ("did it / still working / skipped / reframed") and the response appends to
/// `execution-journal.md`. Future sessions read the journal so the advisory
/// board sees what actually happened vs what was merely committed.
pub async fn list_follow_ups(
    State(state): State<ApiState>,
) -> ApiResult<Json<Vec<FollowUpItem>>> {
    const DAYS_THRESHOLD: i64 = 7;
    let wiki = state.storage.read_user_wiki().await.unwrap_or_default();
    let journal = state.storage.read_execution_journal().await.unwrap_or_default();
    let now = chrono::Local::now().naive_local();

    let mut items = Vec::new();
    // Parse commit log lines:
    //   - [2026-04-22 15:30] [✅ 承诺 · Session abc] ✅ — todo text
    // Unchecked events (`[↩ 取消承诺]`) are ignored.
    let re_commit = regex_lite("- \\[([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2})\\] \\[✅ 承诺 · Session ([^\\]]+)\\] ✅ — (.+)");
    for line in wiki.lines() {
        if let Some((ts, sid, todo)) = re_commit(line) {
            if let Ok(committed) = chrono::NaiveDateTime::parse_from_str(&ts, "%Y-%m-%d %H:%M") {
                let days_ago = (now - committed).num_days();
                if days_ago < DAYS_THRESHOLD { continue; }
                // Skip if already journaled
                let already = journal.contains(&format!("**承诺**: {}", todo.trim()))
                    && journal.contains(&ts);
                if already { continue; }
                items.push(FollowUpItem {
                    todo: todo.trim().to_string(),
                    committed_at: ts,
                    session_id: sid,
                    days_ago: days_ago.max(0) as u32,
                });
            }
        }
    }
    Ok(Json(items))
}

pub async fn respond_follow_up(
    State(state): State<ApiState>,
    Json(req): Json<FollowUpResponse>,
) -> ApiResult<Json<serde_json::Value>> {
    let status_label = match req.status.as_str() {
        "done" => "✅ 做到了",
        "in_progress" => "🔄 进行中",
        "skipped" => "⏭ 跳过",
        "reframed" => "🔁 重新定义",
        _ => "❓ 其他",
    };
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
    let entry = format!(
        "\n\n---\n\n## {} — 回应 {} 的承诺（Session {}）\n\n**承诺**: {}\n**状态**: {}\n**回应**: {}\n",
        now, req.committed_at, req.session_id, req.todo.trim(), status_label,
        if req.reply.trim().is_empty() { "_(空)_".to_string() } else { req.reply.trim().to_string() },
    );
    state.storage.append_execution_journal(&entry).await?;
    Ok(Json(serde_json::json!({ "saved": true })))
}

/// Tiny regex-lite: parses a line against a pattern with 3 capture groups.
/// Not a real regex engine — just the specific format the follow-up needs.
/// Returns (ts, sid, todo) on match.
fn regex_lite(_pattern: &str) -> impl Fn(&str) -> Option<(String, String, String)> {
    move |line: &str| {
        // Expected: "- [YYYY-MM-DD HH:MM] [✅ 承诺 · Session SID] ✅ — todo"
        let trimmed = line.trim_start();
        let rest = trimmed.strip_prefix("- [")?;
        let (ts, rest) = rest.split_once("] [")?;
        let rest = rest.strip_prefix("✅ 承诺 · Session ")?;
        let (sid, rest) = rest.split_once("] ✅ — ")?;
        Some((ts.to_string(), sid.to_string(), rest.to_string()))
    }
}

/// Append a user reaction to `user-reactions.md` — the real-time "共振信号" channel
/// (Phase 2.13, promoted to P0 on 2026-04-22; phrase-level on 2026-04-22 晚). Downstream
/// Step 5/7/8 read this file and inject it into prompts with tier weighting (📝 > ❗ > ⭐).
pub async fn save_reaction(
    State(state): State<ApiState>,
    Path((project_id, session_id)): Path<(String, String)>,
    Json(req): Json<ReactionRequest>,
) -> ApiResult<Json<serde_json::Value>> {
    let existing = state.storage.read_session_file(&project_id, &session_id, "user-reactions.md").await.unwrap_or_default();
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let persona_label = req.persona.as_deref().unwrap_or("-");
    let mut entry = format!(
        "\n## {} — Step {} — {} — {}\n",
        now, req.step, persona_label, req.reaction
    );
    if let Some(s) = req.snippet.as_ref().filter(|s| !s.trim().is_empty()) {
        entry.push_str(&format!("**Snippet**: {}\n", s.trim()));
    }
    if let Some(n) = req.note.as_ref().filter(|n| !n.trim().is_empty()) {
        entry.push_str(&format!("**Note**: {}\n", n.trim()));
    }
    // Anchors are for replay only; stored as HTML comment so they survive markdown
    // rendering but don't clutter human/LLM reading of the file.
    let has_anchor = req.prefix.as_ref().map(|s| !s.is_empty()).unwrap_or(false)
        || req.suffix.as_ref().map(|s| !s.is_empty()).unwrap_or(false);
    if has_anchor {
        let p = req.prefix.as_deref().unwrap_or("");
        let s = req.suffix.as_deref().unwrap_or("");
        entry.push_str(&format!("<!-- anchor: prefix={:?} suffix={:?} -->\n", p, s));
    }

    let updated = if existing.trim().is_empty() {
        format!("# 案主反应 — 会话 {}\n\n*案主在会议过程中亲自标记的实时共振信号。幕僚和贝叶斯分析师都会读取此文件，对齐案主真正关心的方向。*\n{}", session_id, entry)
    } else {
        format!("{}{}", existing, entry)
    };
    state.storage.write_session_file(&project_id, &session_id, "user-reactions.md", &updated).await?;
    Ok(Json(serde_json::json!({ "saved": true })))
}

/// Save the client's self-reflection before Step 8 runs, so persona evaluations
/// and the Bayesian update both see the client's own voice (2026-04-22 product decision).
pub async fn save_client_notes(
    State(state): State<ApiState>,
    Path((project_id, session_id)): Path<(String, String)>,
    Json(req): Json<ClientNotesRequest>,
) -> ApiResult<Json<serde_json::Value>> {
    let learned = req.learned.unwrap_or_default();
    let differently = req.differently.unwrap_or_default();
    let next = req.next.unwrap_or_default();

    let all_empty = learned.trim().is_empty() && differently.trim().is_empty() && next.trim().is_empty();
    let md = format!(
        "# 案主的自我反思\n\n*由案主在幕僚评价之前（或同时）写下。会进入贝叶斯信念迭代的输入。*\n\n## 我学到了什么 / 意识到了什么\n{}\n\n## 我将做哪些不同\n{}\n\n## 我的下一步\n{}\n",
        if learned.trim().is_empty() { "_(空)_".to_string() } else { learned },
        if differently.trim().is_empty() { "_(空)_".to_string() } else { differently },
        if next.trim().is_empty() { "_(空)_".to_string() } else { next },
    );

    state.storage.write_session_file(&project_id, &session_id, "07-client-notes.md", &md).await?;
    Ok(Json(serde_json::json!({ "saved": true, "empty": all_empty })))
}
