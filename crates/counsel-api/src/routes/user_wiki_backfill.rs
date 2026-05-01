//! `POST /api/user-wiki/backfill` — Secretary-driven core.md extraction
//! across multiple historical session blocks. Used by the v2 portrait UI
//! "整理画像" button: client sends up to N legacy session bodies, server
//! distils ≤3 identity-layer facts each, dedupes by (entity, relation),
//! enforces CORE_BUDGET, returns the merged `core.md` content.
//!
//! Auth: requires `require_auth`. No DB writes — pure compute over the
//! request payload. Client persists the result into IndexedDB.

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use counsel_core::{
    agents::{Agent, SecretaryAgent},
    prompts::secretary_extract_core_facts_prompt,
    steps::parse_core_facts,
};
use counsel_model::{ChatMessage, ChatOptions};
use counsel_storage::{CoreFact, CORE_BUDGET};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;

use crate::auth::AuthUser;
use crate::ApiState;

/// Cap how many sessions a single backfill request can process.
const MAX_SESSIONS_PER_REQUEST: usize = 10;

#[derive(Debug, Deserialize)]
pub struct BackfillIn {
    /// Map of session_id → markdown body. Client should send the most recent
    /// ≤10 sessions; ordering doesn't matter (we run them in parallel and
    /// dedupe).
    pub log_sessions: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
pub struct BackfillOut {
    /// Final core.md content (under CORE_BUDGET bytes), ready for IDB write.
    pub core: String,
    /// How many distinct facts ended up in core after dedupe + budget eviction.
    pub fact_count: usize,
    /// How many sessions were processed (LLM calls made).
    pub processed_sessions: usize,
    /// How many sessions failed extraction (LLM error / 0 facts returned);
    /// these are skipped but don't fail the whole request.
    pub failed_sessions: usize,
}

pub async fn backfill(
    State(state): State<ApiState>,
    AuthUser(_user_id): AuthUser,
    Json(payload): Json<BackfillIn>,
) -> impl IntoResponse {
    let mut sessions: Vec<(String, String)> = payload
        .log_sessions
        .into_iter()
        .filter(|(_, body)| !body.trim().is_empty())
        .collect();

    if sessions.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "no sessions provided" })),
        )
            .into_response();
    }

    // Sort by session_id descending (most recent first if SIDs are
    // chronological UUIDs — they aren't strictly, but this gives a stable
    // ordering). Cap to MAX_SESSIONS_PER_REQUEST.
    sessions.sort_by(|a, b| b.0.cmp(&a.0));
    sessions.truncate(MAX_SESSIONS_PER_REQUEST);

    let model = state.model.read().unwrap().clone();
    let secretary = SecretaryAgent::new(model);
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();

    let mut processed = 0_usize;
    let mut failed = 0_usize;

    // Sequential extraction. Parallel would be faster but risks rate-limit
    // and blows past free-tier quotas; sessions ≤ 10 so total ≤ ~30s.
    let mut all_facts: Vec<CoreFact> = Vec::new();
    for (sid, body) in &sessions {
        let prompt = secretary_extract_core_facts_prompt(body.trim(), &date);
        let messages = vec![
            ChatMessage::system("你是私董会的秘书，专精事实结构化。严格遵守输出格式。"),
            ChatMessage::user(prompt),
        ];
        match secretary
            .run(
                &messages,
                ChatOptions::default().temperature(0.2).max_tokens(400),
            )
            .await
        {
            Ok(text) => {
                let facts = parse_core_facts(&text);
                if facts.is_empty() {
                    tracing::debug!("backfill session {} returned 0 facts", sid);
                    failed += 1;
                } else {
                    all_facts.extend(facts);
                    processed += 1;
                }
            }
            Err(e) => {
                tracing::warn!("backfill session {} secretary error: {}", sid, e);
                failed += 1;
            }
        }
    }

    // Dedupe by (entity, relation): when two facts share the (entity,
    // relation) tuple, keep the FIRST occurrence (which came from the
    // newer session by virtue of our sort). Then enforce budget.
    let mut seen: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();
    let mut deduped: Vec<CoreFact> = Vec::new();
    for f in all_facts {
        let key = (f.entity.clone(), f.relation.clone());
        if seen.insert(key) {
            deduped.push(f);
        }
    }

    let core = render_core(&deduped);

    Json(BackfillOut {
        core,
        fact_count: deduped.len().min(count_lines_in_core(&deduped)),
        processed_sessions: processed,
        failed_sessions: failed,
    })
    .into_response()
}

fn render_core(facts_in: &[CoreFact]) -> String {
    let header = "# 案主核心事实（Core）\n\n*跨 session 复用、案主身份层级。每行一条 `[实体 | 关系 | 事实 | 日期]`，按最近优先排序。超过预算时最旧的会被挤出。*\n\n";
    let mut facts = facts_in.to_vec();

    // Render and shrink until we fit CORE_BUDGET (oldest = end of vec).
    loop {
        let mut s = String::from(header);
        for f in &facts {
            s.push_str(&f.to_line());
            s.push('\n');
        }
        if s.len() <= CORE_BUDGET || facts.is_empty() {
            return s;
        }
        facts.pop();
    }
}

fn count_lines_in_core(facts: &[CoreFact]) -> usize {
    // Approximate fact count after budget render. We reuse render_core's
    // exact eviction logic to ensure the returned count matches what the
    // client will see.
    let header = "# 案主核心事实（Core）\n\n*跨 session 复用、案主身份层级。每行一条 `[实体 | 关系 | 事实 | 日期]`，按最近优先排序。超过预算时最旧的会被挤出。*\n\n";
    let mut count = facts.len();
    let mut tmp = facts.to_vec();
    loop {
        let mut s = String::from(header);
        for f in &tmp {
            s.push_str(&f.to_line());
            s.push('\n');
        }
        if s.len() <= CORE_BUDGET || tmp.is_empty() {
            return count;
        }
        tmp.pop();
        count -= 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_core_fits_budget_after_eviction() {
        // 50 oversized facts — should evict to fit budget.
        let mut facts = Vec::new();
        for i in 0..50 {
            facts.push(CoreFact {
                entity: format!("entity-{i:02}"),
                relation: format!("relation-{i:02}"),
                fact: format!("padding-padding-padding-padding-padding-padding-{i:02}"),
                date: "2026-04-30".into(),
            });
        }
        let core = render_core(&facts);
        assert!(core.len() <= CORE_BUDGET, "core overshoot: {}", core.len());
        // Header alone must always be present
        assert!(core.contains("# 案主核心事实"));
    }

    #[test]
    fn render_core_keeps_first_facts_under_eviction() {
        // 10 facts, all small enough that all fit
        let facts = (0..3)
            .map(|i| CoreFact {
                entity: format!("e{i}"),
                relation: format!("r{i}"),
                fact: format!("fact{i}"),
                date: "2026-04-30".into(),
            })
            .collect::<Vec<_>>();
        let core = render_core(&facts);
        assert!(core.contains("e0 | r0"));
        assert!(core.contains("e1 | r1"));
        assert!(core.contains("e2 | r2"));
    }
}
