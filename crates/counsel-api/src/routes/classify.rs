//! F5 (2026-04-26) — Classify a Step 1 question into one of 10 taxonomy
//! buckets. Frontend fires this fire-and-forget after session create; the
//! returned category is tracked as a `question_categorized` analytics event.
//! No question text is stored — only the bucket label.

use axum::{extract::State, Json};
use counsel_core::agents::{Agent, SecretaryAgent};
use counsel_model::{ChatMessage, ChatOptions};

use crate::{ApiError, ApiResult, ApiState};

const CATEGORIES: &[&str] = &[
    "创业/产品决策",
    "人生转型/方向",
    "关系/婚恋/家庭",
    "组织/管理",
    "存在/身份/意义",
    "商业/谈判/博弈",
    "政治/宏观/公共",
    "学习/认知/方法论",
    "健康/身体/疾病",
    "其他",
];

#[derive(Debug, serde::Deserialize)]
pub struct ClassifyRequest {
    pub question: String,
}

#[derive(Debug, serde::Serialize)]
pub struct ClassifyResponse {
    pub category: String,
}

pub async fn classify_question(
    State(state): State<ApiState>,
    Json(req): Json<ClassifyRequest>,
) -> ApiResult<Json<ClassifyResponse>> {
    let q = req.question.trim();
    if q.chars().count() < 3 {
        return Ok(Json(ClassifyResponse { category: "其他".into() }));
    }
    let truncated: String = q.chars().take(400).collect();

    let prompt = counsel_core::prompts::classify_question_prompt(&truncated);
    let messages = vec![
        ChatMessage::system(
            "你是问题分类器，只返回一个类目名（中文），不要任何其他字符。",
        ),
        ChatMessage::user(prompt),
    ];

    let model = state.model.read().unwrap().clone();
    let secretary = SecretaryAgent::new(model);
    let raw = secretary
        .run(&messages, ChatOptions::default().temperature(0.0).max_tokens(40))
        .await
        .map_err(|e| ApiError::Internal(format!("classify LLM call failed: {}", e)))?;

    let cleaned = counsel_core::strip_think_tags(&raw);
    let category = match_category(&cleaned).unwrap_or_else(|| "其他".to_string());
    Ok(Json(ClassifyResponse { category }))
}

fn match_category(raw: &str) -> Option<String> {
    let s = raw.trim().trim_matches(|c: char| c == '"' || c == '\'' || c == '`' || c == '。' || c == '.');
    for cat in CATEGORIES {
        if s.contains(cat) {
            return Some((*cat).to_string());
        }
    }
    // Loose fallback: keyword-match into a bucket
    let lower = s.to_lowercase();
    if lower.contains("创业") || lower.contains("产品") {
        return Some("创业/产品决策".into());
    }
    if lower.contains("转型") || lower.contains("方向") || lower.contains("人生") {
        return Some("人生转型/方向".into());
    }
    if lower.contains("家庭") || lower.contains("婚") || lower.contains("孩子") || lower.contains("亲") {
        return Some("关系/婚恋/家庭".into());
    }
    if lower.contains("组织") || lower.contains("管理") || lower.contains("团队") {
        return Some("组织/管理".into());
    }
    if lower.contains("意义") || lower.contains("身份") || lower.contains("存在") {
        return Some("存在/身份/意义".into());
    }
    if lower.contains("谈判") || lower.contains("博弈") || lower.contains("商业") {
        return Some("商业/谈判/博弈".into());
    }
    if lower.contains("政治") || lower.contains("公共") || lower.contains("宏观") {
        return Some("政治/宏观/公共".into());
    }
    if lower.contains("学习") || lower.contains("认知") || lower.contains("方法") {
        return Some("学习/认知/方法论".into());
    }
    if lower.contains("健康") || lower.contains("身体") || lower.contains("疾病") {
        return Some("健康/身体/疾病".into());
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_exact_category() {
        assert_eq!(match_category("创业/产品决策").as_deref(), Some("创业/产品决策"));
    }

    #[test]
    fn strips_quotes_and_period() {
        assert_eq!(match_category("\"创业/产品决策\"。").as_deref(), Some("创业/产品决策"));
    }

    #[test]
    fn keyword_fallback() {
        assert_eq!(match_category("孩子教育").as_deref(), Some("关系/婚恋/家庭"));
    }

    #[test]
    fn returns_none_when_no_match() {
        assert!(match_category("xyz random text").is_none());
    }
}
