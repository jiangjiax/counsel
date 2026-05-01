//! Session routes — minimal surface (Phase D)
//!
//! Most session CRUD routes moved to IndexedDB (Phase C).
//! Only suggest_personas remains — fully stateless, reads body-only.
//!
//! All other storage-backed session routes deleted (Phase D cleanup).

use axum::{extract::State, Json};

use crate::{ApiResult, ApiState};

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct SuggestPersonasResponse {
    pub recommended: Vec<String>,
    pub reasoning: String,
}

/// Phase 7.1 — the facilitator LLM reads the case-owner's raw Step-1 input
/// and recommends 3-6 advisors from the admin-allowed registry. The client
/// uses this to pre-fill the picker modal; the case-owner still confirms.
///
/// Phase D · fully stateless. raw_input comes in the request body (client
/// reads it from IndexedDB). No file I/O on the server side.
#[derive(Debug, serde::Deserialize)]
pub struct SuggestPersonasRequest {
    pub raw_input: String,
}

pub async fn suggest_personas(
    State(state): State<ApiState>,
    Json(req): Json<SuggestPersonasRequest>,
) -> ApiResult<Json<SuggestPersonasResponse>> {
    use counsel_core::agents::{Agent, FacilitatorAgent};
    use counsel_model::{ChatMessage, ChatOptions};

    let raw_input = req.raw_input;
    if raw_input.trim().chars().count() < 10 {
        return Err(crate::ApiError::BadRequest(
            "问题太短，主持人没法判断该请哪些幕僚，再写几句".into(),
        ));
    }

    let available: Vec<(String, String, String)> = state
        .registry
        .all()
        .iter()
        .map(|p| (p.slug.clone(), p.name.clone(), p.title.clone()))
        .collect();
    if available.is_empty() {
        return Err(crate::ApiError::Internal("persona registry is empty".into()));
    }

    let prompt = counsel_core::prompts::persona_suggestion_prompt(&raw_input, &available);
    let messages = vec![
        ChatMessage::system("你是私董会的主持人。严格按 JSON 输出，不要额外解释。"),
        ChatMessage::user(prompt),
    ];

    let model = state.model.read().unwrap().clone();
    let facilitator = FacilitatorAgent::new(model);
    let raw = facilitator
        .run(&messages, ChatOptions::default().temperature(0.5).max_tokens(500))
        .await
        .map_err(|e| crate::ApiError::Internal(format!("facilitator failed: {}", e)))?;

    let parsed = parse_suggestion_json(&raw, &available)
        .ok_or_else(|| crate::ApiError::Internal(format!(
            "主持人返回的格式解析失败，你可以手动选。原始输出：{}",
            raw.chars().take(200).collect::<String>()
        )))?;

    Ok(Json(parsed))
}

/// Parse the facilitator's raw output into a validated SuggestPersonasResponse.
/// Handles:
///   - bare JSON object
///   - JSON wrapped in ```json ... ``` fences
///   - any leading/trailing prose (extracts the first {...} block)
/// Drops slugs that aren't in `available`. Returns None if we can't recover
/// at least 1 valid slug.
fn parse_suggestion_json(
    raw: &str,
    available: &[(String, String, String)],
) -> Option<SuggestPersonasResponse> {
    let cleaned = counsel_core::strip_think_tags(raw);
    let body = extract_json_object(&cleaned)?;

    #[derive(serde::Deserialize)]
    struct Raw {
        #[serde(default)]
        recommended_slugs: Vec<String>,
        #[serde(default)]
        reasoning: String,
    }
    let parsed: Raw = serde_json::from_str(&body).ok()?;

    let allowed: std::collections::HashSet<&str> =
        available.iter().map(|(s, _, _)| s.as_str()).collect();
    let recommended: Vec<String> = parsed
        .recommended_slugs
        .into_iter()
        .filter(|s| allowed.contains(s.as_str()))
        .take(6)
        .collect();
    if recommended.is_empty() {
        return None;
    }
    Some(SuggestPersonasResponse {
        recommended,
        reasoning: parsed.reasoning.trim().to_string(),
    })
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
mod suggestion_tests {
    use super::*;

    fn avail() -> Vec<(String, String, String)> {
        vec![
            ("mao-zedong".into(), "毛泽东".into(), "Revolutionary".into()),
            ("paul-graham".into(), "Paul Graham".into(), "YC Founder".into()),
            ("steve-jobs".into(), "Steve Jobs".into(), "Apple".into()),
        ]
    }

    #[test]
    fn parses_bare_json() {
        let raw = r#"{"recommended_slugs": ["mao-zedong", "paul-graham"], "reasoning": "yes"}"#;
        let out = parse_suggestion_json(raw, &avail()).unwrap();
        assert_eq!(out.recommended, vec!["mao-zedong", "paul-graham"]);
        assert_eq!(out.reasoning, "yes");
    }

    #[test]
    fn parses_fenced_json() {
        let raw = "```json\n{\"recommended_slugs\": [\"steve-jobs\"], \"reasoning\": \"rt\"}\n```";
        let out = parse_suggestion_json(raw, &avail()).unwrap();
        assert_eq!(out.recommended, vec!["steve-jobs"]);
    }

    #[test]
    fn drops_unknown_slugs() {
        let raw = r#"{"recommended_slugs": ["mao-zedong", "bogus-slug"], "reasoning": "x"}"#;
        let out = parse_suggestion_json(raw, &avail()).unwrap();
        assert_eq!(out.recommended, vec!["mao-zedong"]);
    }

    #[test]
    fn returns_none_when_no_valid_slugs() {
        let raw = r#"{"recommended_slugs": ["bogus"], "reasoning": "x"}"#;
        assert!(parse_suggestion_json(raw, &avail()).is_none());
    }

    #[test]
    fn caps_at_six() {
        let raw = r#"{"recommended_slugs": ["mao-zedong", "paul-graham", "steve-jobs", "mao-zedong", "paul-graham", "steve-jobs", "mao-zedong"], "reasoning": "x"}"#;
        let out = parse_suggestion_json(raw, &avail()).unwrap();
        assert_eq!(out.recommended.len(), 6);
    }
}