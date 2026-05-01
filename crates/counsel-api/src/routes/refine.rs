//! Step 3 sequential refinement (2026-04-25)
//!
//! When the case-owner opens persona K's bubble after answering ≥1 prior
//! persona, the frontend calls `POST /api/refine-question` with the prior
//! (Q, A) tuples and persona K's original question. The server runs one
//! LLM call asking K to either refine its question (dig somewhere not
//! covered) or SKIP itself as redundant. Returns strict JSON.

use axum::{extract::State, Json};
use counsel_core::agents::{Agent, PersonaAgent};
use counsel_model::{ChatMessage, ChatOptions};

use crate::{ApiError, ApiResult, ApiState};

#[derive(Debug, serde::Deserialize)]
pub struct PriorQA {
    pub persona: String,
    pub question: String,
    pub answer: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct RefineRequest {
    pub persona_slug: String,
    pub original_question: String,
    pub raw_input: String,
    pub defined: String,
    pub angle: String,
    #[serde(default)]
    pub prior_qa: Vec<PriorQA>,
}

#[derive(Debug, serde::Serialize)]
pub struct RefineResponse {
    /// "ask" or "skip"
    pub action: String,
    /// Present when action == "ask"
    pub question: Option<String>,
    /// Present when action == "skip"
    pub reason: Option<String>,
}

pub async fn refine_question(
    State(state): State<ApiState>,
    Json(req): Json<RefineRequest>,
) -> ApiResult<Json<RefineResponse>> {
    if req.original_question.trim().is_empty() {
        return Err(ApiError::BadRequest("original_question is empty".into()));
    }
    if req.raw_input.trim().chars().count() < 5 {
        return Err(ApiError::BadRequest("raw_input too short".into()));
    }

    let persona = state
        .registry
        .all()
        .iter()
        .find(|p| p.slug == req.persona_slug)
        .cloned()
        .ok_or_else(|| ApiError::BadRequest(format!("unknown persona slug: {}", req.persona_slug)))?;

    let prior_block = format_prior_qa(&req.prior_qa);

    let rich_prompt = persona.build_system_prompt(&req.raw_input, None);

    let prompt = counsel_core::prompts::refine_persona_question_prompt(
        &rich_prompt,
        &req.raw_input,
        &req.defined,
        &req.angle,
        &persona.name,
        &req.original_question,
        &prior_block,
    );

    let messages = vec![
        ChatMessage::system(
            "你是私董会的一位幕僚，正在 Step 3 的序贯调整环节。严格只输出一个 JSON 对象。",
        ),
        ChatMessage::user(prompt),
    ];

    let model = state.model.read().unwrap().clone();
    let agent = PersonaAgent::new(
        &persona.slug,
        &persona.name,
        &persona.title,
        &persona.short_description(),
        model,
    );
    // 2026-04-25 — cadence-driven cap (terse=150, balanced=200, discursive=250).
    let cadence_cap = persona.cadence.max_tokens_refine();
    let raw = agent
        .run(
            &messages,
            ChatOptions::default().temperature(0.4).max_tokens(cadence_cap),
        )
        .await
        .map_err(|e| ApiError::Internal(format!("refine LLM call failed: {}", e)))?;

    Ok(Json(parse_refine_json(&raw)))
}

fn format_prior_qa(items: &[PriorQA]) -> String {
    if items.is_empty() {
        return String::new();
    }
    let mut buf = String::new();
    for (i, item) in items.iter().enumerate() {
        buf.push_str(&format!(
            "### {}. {} 问\nQ: {}\n案主答: {}\n\n",
            i + 1,
            item.persona,
            item.question.trim(),
            if item.answer.trim().is_empty() {
                "（跳过）".to_string()
            } else {
                item.answer.trim().to_string()
            }
        ));
    }
    buf
}

/// Loose JSON parser. Tolerates: ```json fences, leading prose, missing fields.
/// Falls back to "ask" with the raw text as question if all parsing fails —
/// preserves the original behavior of just showing the persona's question.
fn parse_refine_json(raw: &str) -> RefineResponse {
    let cleaned = counsel_core::strip_think_tags(raw);
    let body = extract_json_object(&cleaned);

    if let Some(body) = body {
        #[derive(serde::Deserialize)]
        struct Raw {
            #[serde(default)]
            action: String,
            #[serde(default)]
            question: Option<String>,
            #[serde(default)]
            reason: Option<String>,
        }
        if let Ok(parsed) = serde_json::from_str::<Raw>(&body) {
            let action = parsed.action.to_lowercase();
            if action == "skip" {
                return RefineResponse {
                    action: "skip".into(),
                    question: None,
                    reason: parsed
                        .reason
                        .map(|r| r.trim().to_string())
                        .filter(|r| !r.is_empty())
                        .or_else(|| Some("和已问问题重复".into())),
                };
            }
            if action == "ask" {
                if let Some(q) = parsed.question.map(|q| q.trim().to_string()).filter(|q| !q.is_empty()) {
                    return RefineResponse {
                        action: "ask".into(),
                        question: Some(q),
                        reason: None,
                    };
                }
            }
        }
    }

    // Fallback: couldn't parse JSON cleanly. Default to "ask" with raw text
    // (truncated) so the user still sees something rather than a hard error.
    let fallback_q = cleaned.trim().chars().take(500).collect::<String>();
    RefineResponse {
        action: "ask".into(),
        question: Some(if fallback_q.is_empty() {
            "（无法解析模型输出，跳过）".into()
        } else {
            fallback_q
        }),
        reason: None,
    }
}

fn extract_json_object(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    let stripped = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .and_then(|s| s.rsplit_once("```").map(|(body, _)| body))
        .unwrap_or(trimmed);
    let s = stripped.trim();
    if s.starts_with('{') {
        return Some(s.to_string());
    }
    let start = s.find('{')?;
    let end = s.rfind('}')?;
    if end <= start {
        return None;
    }
    Some(s[start..=end].to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_skip_json() {
        let raw = r#"{"action":"skip","reason":"前面已问过资源清单"}"#;
        let r = parse_refine_json(raw);
        assert_eq!(r.action, "skip");
        assert_eq!(r.reason.as_deref(), Some("前面已问过资源清单"));
    }

    #[test]
    fn parses_ask_json() {
        let raw = r#"{"action":"ask","question":"你的撤回窗口有多宽？"}"#;
        let r = parse_refine_json(raw);
        assert_eq!(r.action, "ask");
        assert_eq!(r.question.as_deref(), Some("你的撤回窗口有多宽？"));
    }

    #[test]
    fn parses_fenced_json() {
        let raw = "```json\n{\"action\":\"skip\",\"reason\":\"重复\"}\n```";
        let r = parse_refine_json(raw);
        assert_eq!(r.action, "skip");
    }

    #[test]
    fn fallback_to_ask_on_garbage() {
        let raw = "this is not json, but here is a question?";
        let r = parse_refine_json(raw);
        assert_eq!(r.action, "ask");
        assert!(r.question.unwrap().contains("question"));
    }

    #[test]
    fn skip_with_empty_reason_gets_default() {
        let raw = r#"{"action":"skip","reason":""}"#;
        let r = parse_refine_json(raw);
        assert_eq!(r.action, "skip");
        assert!(r.reason.unwrap().contains("重复"));
    }
}
