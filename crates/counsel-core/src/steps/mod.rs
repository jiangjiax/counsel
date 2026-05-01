//! 8-Step Flow Implementation

use std::collections::HashMap;
use std::time::Instant;
use tokio::sync::mpsc;
use tokio::task::JoinSet;

use counsel_model::{ChatMessage, ChatOptions, estimate_tokens_static, estimate_messages_tokens};
use crate::{CounselService, Dimension, HarvestResult, SSEEvent, SseSink, SessionMetrics, StepMetrics, strip_think_tags};
use crate::agents::{Agent, FacilitatorAgent, PersonaAgent, SecretaryAgent};
use crate::prompts::*;
use crate::CoreResult;
use counsel_storage::CoreFact;

/// Parse the secretary's `[entity | relation | fact | yyyy-mm-dd]` lines,
/// tolerating decorative wrappers (``` blocks, leading bullets, surrounding
/// commentary). Returns the at-most-3 facts the prompt was instructed to
/// produce — anything beyond that is discarded as overshoot.
pub fn parse_core_facts(text: &str) -> Vec<CoreFact> {
    let mut out = Vec::new();
    for raw in text.lines() {
        let line = raw.trim();
        // Skip code-fence and decorative bullets.
        if line.starts_with("```") || line.is_empty() { continue; }
        // Strip a leading list marker if present.
        let stripped = line
            .strip_prefix("- ").or_else(|| line.strip_prefix("* "))
            .or_else(|| line.strip_prefix("• "))
            .unwrap_or(line);
        if let Some(f) = CoreFact::parse(stripped) {
            out.push(f);
            if out.len() == 3 { break; }
        }
    }
    out
}

/// Prepend the client's in-session reactions (Phase 2.13 "User Resonance Signals")
/// to a step prompt, with three-tier weighting (Michael 2026-04-22 晚):
/// - tier-1: 📝 (user typed a note — highest-signal, note text verbatim)
/// - tier-2: ❗ (critical)
/// - tier-3: ⭐ (important)
/// Downstream Step 5/7/8 call this to keep advisor/synthesizer calls aware of
/// what the client flagged. Anchor HTML comments are stripped before injection.
pub fn prepend_user_reactions(reactions_md: &str, prompt: String) -> String {
    let body = reactions_md.trim();
    if body.is_empty() {
        return prompt;
    }

    // Parse entries and bucket by reaction type
    let mut tier1 = Vec::new(); // 📝 notes
    let mut tier2 = Vec::new(); // ❗
    let mut tier3 = Vec::new(); // ⭐
    let mut current: Option<(String, String, String, String, String)> = None; // (step, persona, reaction, snippet, note)

    let flush = |current: &mut Option<(String, String, String, String, String)>,
                 tier1: &mut Vec<String>,
                 tier2: &mut Vec<String>,
                 tier3: &mut Vec<String>| {
        if let Some((step, persona, reaction, snippet, note)) = current.take() {
            let snippet_line = if snippet.is_empty() {
                String::new()
            } else {
                format!("\n> {}", snippet)
            };
            let note_line = if note.is_empty() {
                String::new()
            } else {
                format!("\n  案主笔记（verbatim）: {}", note)
            };
            let line = format!(
                "- [Step {} · {}]{}{}",
                step, persona, snippet_line, note_line
            );
            if reaction.contains('📝') || !note.is_empty() {
                tier1.push(line);
            } else if reaction.contains('❗') {
                tier2.push(line);
            } else {
                tier3.push(line);
            }
        }
    };

    for line in body.lines() {
        if let Some(header) = line.strip_prefix("## ") {
            flush(&mut current, &mut tier1, &mut tier2, &mut tier3);
            // Header format: "{timestamp} — Step {n} — {persona} — {reaction}"
            let parts: Vec<&str> = header.split(" — ").collect();
            if parts.len() >= 4 {
                let step = parts[1].trim_start_matches("Step ").trim().to_string();
                let persona = parts[2].trim().to_string();
                let reaction = parts[3].trim().to_string();
                current = Some((step, persona, reaction, String::new(), String::new()));
            }
        } else if let Some(rest) = line.strip_prefix("**Snippet**: ") {
            if let Some(ref mut c) = current {
                c.3 = rest.trim().to_string();
            }
        } else if let Some(rest) = line.strip_prefix("**Note**: ") {
            if let Some(ref mut c) = current {
                c.4 = rest.trim().to_string();
            }
        }
        // Anchor comment lines (<!-- anchor: ... -->) are ignored
    }
    flush(&mut current, &mut tier1, &mut tier2, &mut tier3);

    let mut sections = String::new();
    if !tier1.is_empty() {
        sections.push_str("### Tier-1 · 📝 带文字笔记（案主主动打字，最高权重信号）\n\n");
        sections.push_str(&tier1.join("\n\n"));
        sections.push_str("\n\n");
    }
    if !tier2.is_empty() {
        sections.push_str("### Tier-2 · ❗ 标记为关键\n\n");
        sections.push_str(&tier2.join("\n"));
        sections.push_str("\n\n");
    }
    if !tier3.is_empty() {
        sections.push_str("### Tier-3 · ⭐ 标记为重要\n\n");
        sections.push_str(&tier3.join("\n"));
        sections.push_str("\n\n");
    }
    if sections.is_empty() {
        // Fallback: body had content but didn't parse into tiers — pass through raw
        sections = format!("{}\n", body);
    }

    format!(
        "## 案主共振信号（案主在前面步骤中亲自标记的重点）\n\n*按权重分级：带文字笔记 > 关键标记 > 重要标记。带笔记的 verbatim 引用，代表案主实际在想什么。*\n\n{}请在生成下面内容时，优先照顾这些标记——特别是带文字笔记的，那是案主自己打字留下的反应，比任何通用分析都更能反映「这次对话真正撬动了什么」。\n\n---\n\n{}",
        sections, prompt
    )
}

/// Save step metrics to session storage
async fn save_metrics(
    storage: &counsel_storage::Storage,
    project_id: &str,
    session_id: &str,
    step_metrics: StepMetrics,
) -> CoreResult<()> {
    let metrics_path = storage.session_file(project_id, session_id, "metrics.json");

    // Load existing metrics or create new
    let mut metrics: SessionMetrics = if metrics_path.exists() {
        let content = tokio::fs::read_to_string(&metrics_path).await?;
        match serde_json::from_str(&content) {
            Ok(m) => m,
            Err(e) => {
                tracing::warn!("Failed to parse metrics.json, starting fresh: {}", e);
                SessionMetrics::new()
            }
        }
    } else {
        SessionMetrics::new()
    };

    metrics.add_step(step_metrics);

    // Save JSON
    tokio::fs::write(&metrics_path, serde_json::to_string_pretty(&metrics)?).await?;

    // Also write markdown report
    let md_path = storage.session_file(project_id, session_id, "09-metrics.md");
    tokio::fs::write(&md_path, metrics.to_markdown()).await?;

    Ok(())
}

impl CounselService {
    /// Phase 7.1 — return the advisors active for this session. If the session
    /// has a `99-personas.json` pick file, filter the full registry by those
    /// slugs (preserving the case-owner's order). Otherwise fall back to the
    /// full registry (legacy sessions + sessions that accepted defaults).
    pub async fn active_personas(
        &self,
        project_id: &str,
        session_id: &str,
    ) -> Vec<&crate::wisdom::WisdomPersona> {
        let slugs = self.storage.read_selected_personas(project_id, session_id).await;
        if slugs.is_empty() {
            self.registry.all().iter().collect()
        } else {
            self.registry.filtered(&slugs)
        }
    }

    /// How many personas are effectively active for this session (after
    /// applying the per-session filter). Used by the Step 5/6 single-persona
    /// short-circuit so the check honors the case-owner's actual roster.
    pub async fn active_personas_len(&self, project_id: &str, session_id: &str) -> usize {
        self.active_personas(project_id, session_id).await.len()
    }

    /// Step 2: Define - "一步锁定" (one-shot lock)
    ///
    /// State machine:
    /// - Call 1 (user_input=None): LLM reads raw input, produces understanding directly.
    ///   If auto_simulate: locks immediately. Otherwise: returns draft for user confirmation.
    /// - Call 2 (user_input=Some("对"/confirm)): Locks the draft.
    /// - Call 2 (user_input=Some(correction)): Re-understands with correction (attempt 2).
    /// - Call 3 (any, attempt >= 2): Force-locks current draft.
    pub async fn run_define(
        &self,
        project_id: &str,
        session_id: &str,
        user_input: Option<String>,
        auto_simulate: bool,
        sender: SseSink,
    ) -> CoreResult<String> {
        use crate::DefineState;

        let start_time = Instant::now();
        sender.send(SSEEvent::step_start(2)).await.map_err(|e| crate::CoreError::Channel(e.to_string()))?;

        let raw_input = self.storage.read_session_file(project_id, session_id, "00-raw-input.md").await?;
        // B3 — tiered context replaces the legacy full user-wiki + extracted
        // last-session blobs. `core` is the always-loaded identity facts
        // (≤1.5KB) and `index` is the one-line-per-session hook list. Total
        // typically ~10KB even after 100 sessions, vs unbounded growth before.
        let user_ctx = self.storage.read_user_context().await.unwrap_or_default();
        // Phase 2.8 — belief-system.md: structured project-level prior (latest
        // Bayesian posterior). Fed into facilitator prompts alongside the tier.
        let prior_beliefs = self.storage.read_belief_system(project_id).await.unwrap_or_default();
        // Phase 2.3 — execution-journal.md: what the client actually did between
        // sessions ("did the committed TODOs happen?"). Higher-truth signal than
        // user-wiki entries which capture intentions.
        let execution_journal = self.storage.read_execution_journal().await.unwrap_or_default();

        // Diagnostic: log context sizes so we can catch runaway context swamping
        // in production logs without re-instrumenting. See 2026-04-22 context bug.
        // Field names kept compatible with `incidents::snapshot_ctx_sizes`'s
        // labels: raw_input / user_wiki (= core) / last_session (= index) /
        // prior_beliefs / execution_journal.
        tracing::info!(
            target: "counsel_core::run_define",
            raw_input_chars = raw_input.len(),
            core_chars = user_ctx.core.len(),
            index_chars = user_ctx.index.len(),
            prior_beliefs_chars = prior_beliefs.len(),
            execution_journal_chars = execution_journal.len(),
            total_chars = raw_input.len() + user_ctx.core.len() + user_ctx.index.len() + prior_beliefs.len() + execution_journal.len(),
            "run_define context sizes (pre-cap, tiered)"
        );

        // Load existing state
        let state_path = self.storage.session_file(project_id, session_id, "01-define-state.json");
        let current_state: DefineState = if state_path.exists() {
            let content = tokio::fs::read_to_string(&state_path).await?;
            serde_json::from_str(&content).unwrap_or(DefineState::Init)
        } else {
            DefineState::Init
        };

        // If already locked, return existing result
        if current_state == DefineState::Locked {
            let defined = self.storage.read_session_file(project_id, session_id, "01-defined.md").await?;
            sender.send(SSEEvent::step_done(2)).await.map_err(|e| crate::CoreError::Channel(e.to_string()))?;
            return Ok(defined);
        }

        let facilitator = FacilitatorAgent::new(self.model.clone());
        let options = ChatOptions::default().temperature(0.7);

        let (final_response, new_state) = match (&current_state, &user_input) {
            // === INIT STATE: First call, no user input → produce understanding ===
            (DefineState::Init, None) => {
                let messages = vec![
                    ChatMessage::system("你是私董会的主持人，帮助案主锁定核心问题。"),
                    ChatMessage::user(facilitator_define_prompt_tiered(&raw_input, &user_ctx, &prior_beliefs, &execution_journal)),
                ];

                let draft = facilitator.run_streaming_collect(
                    &messages,
                    options,
                    sender.clone().into(),
                ).await.map_err(|e| crate::CoreError::Agent(e.to_string()))?;

                if auto_simulate {
                    // Auto-simulate: lock immediately, no confirmation needed
                    (draft.clone(), DefineState::Locked)
                } else {
                    (draft.clone(), DefineState::Confirming { attempt: 1, draft })
                }
            }

            // === CONFIRMING STATE: User confirms ("对", "ok", "确认", etc.) → lock ===
            (DefineState::Confirming { draft, .. }, Some(input))
                if is_confirmation(input) =>
            {
                (draft.clone(), DefineState::Locked)
            }

            // === CONFIRMING STATE attempt 1: User provides correction → re-understand ===
            (DefineState::Confirming { attempt: 1, draft }, Some(correction)) => {
                let messages = vec![
                    ChatMessage::system("你是私董会的主持人，帮助案主锁定核心问题。"),
                    ChatMessage::user(facilitator_correction_prompt_tiered(&raw_input, draft, correction, &user_ctx, &prior_beliefs, &execution_journal)),
                ];

                let new_draft = facilitator.run_streaming_collect(
                    &messages,
                    options,
                    sender.clone().into(),
                ).await.map_err(|e| crate::CoreError::Agent(e.to_string()))?;

                if auto_simulate {
                    (new_draft.clone(), DefineState::Locked)
                } else {
                    (new_draft.clone(), DefineState::Confirming { attempt: 2, draft: new_draft })
                }
            }

            // === CONFIRMING STATE attempt >= 2: Force-lock regardless of input ===
            (DefineState::Confirming { draft, attempt }, _) if *attempt >= 2 => {
                (draft.clone(), DefineState::Locked)
            }

            // === INIT with user_input: treat as if it's the raw input context ===
            (DefineState::Init, Some(_input)) => {
                let messages = vec![
                    ChatMessage::system("你是私董会的主持人，帮助案主锁定核心问题。"),
                    ChatMessage::user(facilitator_define_prompt_tiered(&raw_input, &user_ctx, &prior_beliefs, &execution_journal)),
                ];

                let draft = facilitator.run_streaming_collect(
                    &messages,
                    options,
                    sender.clone().into(),
                ).await.map_err(|e| crate::CoreError::Agent(e.to_string()))?;

                if auto_simulate {
                    (draft.clone(), DefineState::Locked)
                } else {
                    (draft.clone(), DefineState::Confirming { attempt: 1, draft })
                }
            }

            // Fallback: shouldn't happen, but handle gracefully
            _ => {
                return Err(crate::CoreError::Step("Invalid DefineState transition".to_string()));
            }
        };

        // Estimate tokens
        let prompt_tokens = estimate_tokens_static(&raw_input);
        let completion_tokens = estimate_tokens_static(&final_response);
        let duration_ms = start_time.elapsed().as_millis() as u64;

        // Save state
        let state_json = serde_json::to_string_pretty(&new_state)?;
        tokio::fs::create_dir_all(state_path.parent().unwrap()).await?;
        tokio::fs::write(&state_path, &state_json).await?;

        // If locked, save as 01-defined.md
        if new_state == DefineState::Locked {
            self.storage.write_session_file(project_id, session_id, "01-defined.md", &strip_think_tags(&final_response)).await?;
        }

        // Track metrics
        let metrics = StepMetrics {
            step: 2,
            step_name: "Define".to_string(),
            duration_ms,
            prompt_tokens,
            completion_tokens,
            total_tokens: prompt_tokens + completion_tokens,
        };
        save_metrics(&self.storage, project_id, session_id, metrics).await.ok();

        sender.send(SSEEvent::step_done(2)).await.map_err(|e| crate::CoreError::Channel(e.to_string()))?;

        Ok(final_response)
    }

    /// Step 3: Facts - Each persona independently asks questions from their own worldview.
    /// No cross-contamination: personas do NOT see each other's questions.
    ///
    /// Two modes:
    /// - `auto_simulate=true`: Generate questions AND auto-answer them (demo/fast mode)
    /// - `auto_simulate=false`: Generate questions only. User answers separately via `run_facts_answers`.
    pub async fn run_facts(
        &self,
        project_id: &str,
        session_id: &str,
        auto_simulate: bool,
        sender: SseSink,
    ) -> CoreResult<()> {
        let start_time = Instant::now();
        sender.send(SSEEvent::step_start(3)).await.map_err(|e| crate::CoreError::Channel(e.to_string()))?;

        let raw_input = self.storage.read_session_file(project_id, session_id, "00-raw-input.md").await?;
        let defined = self.storage.read_session_file(project_id, session_id, "01-defined.md").await?;
        let previous_qa = self.storage.read_session_file(project_id, session_id, "02-facts-answers.md").await
            .unwrap_or_default();

        // Phase 3.4: extract runtime pressure fingerprint from case text so persona
        // system prompts surface the top-3 situation cards most similar to this case.
        let fp = crate::fingerprint::extract(&format!("{}\n{}", raw_input, defined));

        // 2026-04-24: parallel fan-out with per-advisor angle assignment +
        // streaming. Replaces the prior sequential loop that ran each advisor
        // in series and returned the full question as a single chunk. With
        // angles assigned the case-owner sees N distinct takes instead of
        // duplicates; with streaming each bubble types out live so the
        // "哗哗哗全出来" feel stays intact.
        let active = self.active_personas(project_id, session_id).await;
        let advisor_count = active.len();

        let mut join_set = JoinSet::new();
        let (tx, mut rx) = mpsc::channel::<(String, String, String, String, usize)>(100); // (slug, name, title, question_text, token_count)

        for (idx, wp) in active.iter().enumerate() {
            let slug = wp.slug.clone();
            let name = wp.name.clone();
            let title = wp.title.clone();
            let desc = wp.short_description();
            let base_prompt = wp.build_system_prompt(&raw_input, Some(&fp));
            let cadence_cap = wp.cadence.max_tokens_step3();
            let angle = angle_for_slot(idx).to_string();
            let raw_input_c = raw_input.clone();
            let defined_c = defined.clone();
            let previous_qa_c = previous_qa.clone();
            let tx = tx.clone();
            let sender_c = sender.clone();
            let model = self.model.clone();
            let _ = advisor_count; // kept in case future rounds need total

            join_set.spawn(async move {
                let system_prompt = rich_persona_facts_prompt(
                    &base_prompt, &raw_input_c, &defined_c, &angle, &previous_qa_c,
                );
                // 2026-04-25 — user_prompt rewritten. The previous version
                // explicitly mandated "先 anchor 再抛二选一", which directly
                // contradicted the new Step 3 system prompt. The user message
                // wins by default in instruction-following, so the system
                // prompt fix had no effect. Now both messages agree.
                let user_prompt = format!(
                    "**你是 {}**（不是其他幕僚——不要把别人的故事或角度安到自己头上）。你负责的角度是「{}」。\n\n\
                     从这个角度出发，向案主提出 **1-2 个开放式的事实问题**。\n\
                     - 第一句必须是问题本身，不能是 \"我当年...\" 之类的故事开头\n\
                     - 不要二选一（包括 \"X 还是 Y\"、\"哪个更重\"、\"(A) 还是 (B)\"、\"是 X 推你 还是 Y 推你\" 这些伪装形式都禁止）\n\
                     - 不要主观感受 / 哲学题（\"你怕什么？\" / \"你真正想成为谁？\" 都是错的）\n\
                     - 历史锚点只能放最后 1 句，且必须直接照亮你刚问的那条事实；无关就完全不写\n\
                     - 总长 2-5 句中文",
                    name, angle
                );
                let messages = vec![
                    ChatMessage::system(&system_prompt),
                    ChatMessage::user(user_prompt),
                ];
                let prompt_tokens = estimate_messages_tokens(&messages);

                let persona = PersonaAgent::new(&slug, &name, &title, &desc, model);
                // Stream + collect so the bubble types live.
                // Temperature lowered 0.75 → 0.5 — fact questions don't need
                // creativity, and lower temp reduces persona-identity drift.
                let result = persona.run_streaming_collect(
                    &messages,
                    ChatOptions::default().max_tokens(cadence_cap).temperature(0.5),
                    sender_c.into(),
                ).await.map_err(|e| crate::agents::AgentError::Generic(e.to_string()))?;
                let completion_tokens = estimate_tokens_static(&result);
                tx.send((slug, name, title, result, prompt_tokens + completion_tokens)).await
                    .map_err(|e| crate::agents::AgentError::Channel(e.to_string()))?;
                Ok::<(), crate::agents::AgentError>(())
            });
        }
        drop(tx);

        // Build slug → angle map so we can persist the angle next to each
        // question (refine endpoint needs it to keep the persona on its lane).
        let mut angle_by_slug: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();
        for (idx, wp) in active.iter().enumerate() {
            angle_by_slug.insert(wp.slug.clone(), angle_for_slot(idx).to_string());
        }

        let mut total_tokens = 0;
        let mut all_qa = previous_qa.clone();
        let mut questions_json: Vec<serde_json::Value> = Vec::new();
        let mut collected: Vec<(String, String, String)> = Vec::new(); // (slug, name, text)

        while let Some((slug, name, _title, question_text, tokens)) = rx.recv().await {
            total_tokens += tokens;
            let trimmed = question_text.trim();
            if trimmed.to_uppercase() == "N/A" || trimmed.is_empty() {
                continue;
            }
            collected.push((slug.clone(), name.clone(), trimmed.to_string()));

            if auto_simulate {
                // Auto-answer mode: LLM simulates user response
                let answer_prompt = format!(
                    r#"As the client, answer this question from {} about your situation:

Question: {}

Context:
- Raw input: {}
- Defined topic: {}

Provide a clear, direct answer in 2-3 sentences."#,
                    name, trimmed, raw_input, defined
                );

                let facilitator = FacilitatorAgent::new(self.model.clone());
                let answer_messages = vec![
                    ChatMessage::system("You are a client answering questions about your situation."),
                    ChatMessage::user(&answer_prompt),
                ];

                let user_answer = facilitator.run(&answer_messages, ChatOptions::default().max_tokens(400)).await
                    .map_err(|e| crate::CoreError::Agent(e.to_string()))?;

                all_qa.push_str(&format!("\n\n## {} Questions\n{}\n\n## Client's Answer\n{}\n", name, trimmed, user_answer.trim()));
            } else {
                questions_json.push(serde_json::json!({
                    "persona": name,
                    "slug": slug,
                    "question": trimmed,
                    "angle": angle_by_slug.get(&slug).cloned().unwrap_or_default(),
                }));
            }
        }
        while join_set.join_next().await.is_some() {}

        // 2026-04-25 — earlier post-generation LLM dedup pass added 30-60s of
        // silent wait between "questions appear" and step_done; user thought
        // the UI was dead. Reverted in favor of stronger prompt-side angle
        // discipline (see rich_persona_facts_prompt's angle_for_slot + 12-angle
        // pool). Some thematic overlap remains acceptable; speed over polish.

        let duration_ms = start_time.elapsed().as_millis() as u64;

        if auto_simulate {
            // Save combined Q&A
            self.storage.write_session_file(project_id, session_id, "02-facts-answers.md", &all_qa).await?;
        } else {
            // Save questions for user to answer later
            let questions_str = serde_json::to_string_pretty(&questions_json)?;
            self.storage.write_session_file(project_id, session_id, "02-facts-questions.json", &questions_str).await?;
        }

        let metrics = StepMetrics {
            step: 3,
            step_name: "Facts".to_string(),
            duration_ms,
            prompt_tokens: total_tokens / 2,
            completion_tokens: total_tokens / 2,
            total_tokens,
        };
        save_metrics(&self.storage, project_id, session_id, metrics).await.ok();

        sender.send(SSEEvent::step_done_with_data(3, serde_json::json!({
            "auto_simulate": auto_simulate,
            "questions": questions_json.len()
        }))).await.map_err(|e| crate::CoreError::Channel(e.to_string()))?;

        Ok(())
    }

    /// Step 3b: Save user-provided answers to facts questions (user mode only).
    /// Called after run_facts(auto_simulate=false) when user submits their answers.
    pub async fn save_facts_answers(
        &self,
        project_id: &str,
        session_id: &str,
        user_answers: &str,
        sender: SseSink,
    ) -> CoreResult<()> {
        sender.send(SSEEvent::step_start(3)).await.map_err(|e| crate::CoreError::Channel(e.to_string()))?;

        // Load saved questions
        let questions_str = self.storage.read_session_file(project_id, session_id, "02-facts-questions.json").await?;
        let questions: Vec<serde_json::Value> = serde_json::from_str(&questions_str)?;

        // Parse user answers — expect JSON array or plain text (one answer per line)
        let answers: Vec<String> = if user_answers.trim_start().starts_with('[') {
            serde_json::from_str(user_answers).unwrap_or_else(|_| vec![user_answers.to_string()])
        } else {
            // Plain text: split by double newline or use as single answer for all
            let parts: Vec<String> = user_answers.split("\n\n").map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
            if parts.len() >= questions.len() {
                parts
            } else {
                // Not enough answers — use the same answer for all
                vec![user_answers.to_string(); questions.len()]
            }
        };

        // Build Q&A file
        let mut all_qa = String::new();
        for (i, q) in questions.iter().enumerate() {
            let persona = q["persona"].as_str().unwrap_or("Unknown");
            let question = q["question"].as_str().unwrap_or("");
            let answer = answers.get(i).map(|s| s.as_str()).unwrap_or("（未回答）");
            all_qa.push_str(&format!("\n\n## {} Questions\n{}\n\n## Client's Answer\n{}\n", persona, question, answer));
        }

        self.storage.write_session_file(project_id, session_id, "02-facts-answers.md", &all_qa).await?;

        sender.send(SSEEvent::step_done(3)).await.map_err(|e| crate::CoreError::Channel(e.to_string()))?;
        Ok(())
    }

    /// Step 4: Opinions - 12 personas generate opinions in parallel (CORE step)
    pub async fn run_opinions(
        &self,
        project_id: &str,
        session_id: &str,
        sender: SseSink,
    ) -> CoreResult<HashMap<String, String>> {
        let start_time = Instant::now();
        sender.send(SSEEvent::step_start(4)).await.map_err(|e| crate::CoreError::Channel(e.to_string()))?;

        let raw_input = self.storage.read_session_file(project_id, session_id, "00-raw-input.md").await?;
        let defined = self.storage.read_session_file(project_id, session_id, "01-defined.md").await?;
        let facts = self.storage.read_session_file(project_id, session_id, "02-facts-answers.md").await?;

        // Phase 3.4: extract fingerprint from full case context (raw + defined + facts)
        // for situation-card retrieval in each persona's system prompt.
        let fp = crate::fingerprint::extract(&format!("{}\n{}\n{}", raw_input, defined, facts));

        // Create opinions directory
        let opinions_dir = self.storage.session_dir(project_id, session_id).join("03-opinions");
        tokio::fs::create_dir_all(&opinions_dir).await?;

        let mut join_set = JoinSet::new();
        let (tx, mut rx) = mpsc::channel::<(String, String, usize)>(100);

        let active = self.active_personas(project_id, session_id).await;
        for wp in active {
            let slug = wp.slug.clone();
            let name = wp.name.clone();
            let title = wp.title.clone();
            let desc = wp.short_description();
            let base_prompt = wp.build_system_prompt(&raw_input, Some(&fp));
            let cadence_cap = wp.cadence.max_tokens_step4();
            let raw_input = raw_input.clone();
            let defined = defined.clone();
            let facts = facts.clone();
            let tx = tx.clone();
            let sender = sender.clone();
            let model = self.model.clone();

            join_set.spawn(async move {
                let persona = PersonaAgent::new(&slug, &name, &title, &desc, model);

                let system_prompt = rich_persona_opinion_prompt(&base_prompt, &raw_input, &defined, &facts);
                let opinion_prompt = opinions_prompt(&raw_input, &defined, &facts);

                let messages = vec![
                    ChatMessage::system(&system_prompt),
                    ChatMessage::user(crate::ensure_chinese_response(&opinion_prompt)),
                ];

                let prompt_tokens = estimate_messages_tokens(&messages);

                // Stream + collect in single API call.
                // max_tokens driven by persona cadence (terse=300, balanced=800,
                // discursive=1500; legacy=1200 fallback).
                // 2026-04-25 — surface errors instead of silently dropping the
                // task. Previous bug: 4-of-12 personas dropped per session because
                // run_streaming_collect errored (timeout / HTTP) but the join_set
                // task ?-propagated and we never recorded which persona failed
                // or why. Now: log to stderr + write a placeholder file so case-
                // owner sees "{name} 调用失败：{err}" instead of an empty seat.
                let result = match persona.run_streaming_collect(
                    &messages,
                    ChatOptions::default().max_tokens(cadence_cap).temperature(0.8),
                    sender.into(),
                ).await {
                    Ok(text) => text,
                    Err(e) => {
                        eprintln!("[run_opinions] persona '{}' failed: {}", name, e);
                        let placeholder = format!(
                            "_（{} 此次未能返回意见——LLM 调用失败：{}。可在 Settings 切换模型或重试。）_",
                            name, e
                        );
                        // Send placeholder anyway so the orchestrator records the
                        // attempt and writes a non-empty file the UI can render.
                        let _ = tx.send((name.to_string(), placeholder, prompt_tokens)).await;
                        return Ok::<(), crate::agents::AgentError>(());
                    }
                };
                let completion_tokens = estimate_tokens_static(&result);
                tx.send((name.to_string(), result, prompt_tokens + completion_tokens)).await
                    .map_err(|e| crate::agents::AgentError::Channel(e.to_string()))?;
                Ok::<(), crate::agents::AgentError>(())
            });
        }

        // Collect all results from channel first (tasks send to channel as they complete)
        drop(tx);

        let mut results = HashMap::new();
        let mut total_tokens = 0;
        while let Some((name, opinion, tokens)) = rx.recv().await {
            total_tokens += tokens;
            // Save individual opinion file
            let filename = format!("{}.md", name.replace(' ', "-"));
            let path = opinions_dir.join(&filename);
            tokio::fs::write(&path, &opinion).await?;

            results.insert(name, opinion);
        }

        // Wait for ALL tasks to complete (cleanup)
        while join_set.join_next().await.is_some() {}

        let duration_ms = start_time.elapsed().as_millis() as u64;

        // Track metrics
        let metrics = StepMetrics {
            step: 4,
            step_name: "Opinions".to_string(),
            duration_ms,
            prompt_tokens: total_tokens / 2,
            completion_tokens: total_tokens / 2,
            total_tokens,
        };
        save_metrics(&self.storage, project_id, session_id, metrics).await.ok();

        sender.send(SSEEvent::step_done_with_data(4, serde_json::json!({ "count": results.len() }))).await.map_err(|e| crate::CoreError::Channel(e.to_string()))?;

        Ok(results)
    }

    /// Step 5: Dimensions - Secretary extracts conflict dimensions
    pub async fn run_dimensions(
        &self,
        project_id: &str,
        session_id: &str,
        sender: SseSink,
    ) -> CoreResult<Vec<Dimension>> {
        let start_time = Instant::now();
        sender.send(SSEEvent::step_start(5)).await.map_err(|e| crate::CoreError::Channel(e.to_string()))?;

        // Gather all opinions
        let opinions = self.storage.list_opinions(project_id, session_id).await?;
        let opinions_text = opinions
            .into_iter()
            .map(|(name, content)| format!("## {}\n{}", name, content))
            .collect::<Vec<_>>()
            .join("\n\n");

        let prompt = prepend_user_reactions(
            &self.storage.read_session_file(project_id, session_id, "user-reactions.md").await.unwrap_or_default(),
            dimensions_prompt(&opinions_text),
        );

        let secretary = SecretaryAgent::new(self.model.clone());
        let messages = vec![
            ChatMessage::system("You are a skilled analyst extracting key conflict dimensions."),
            ChatMessage::user(prompt),
        ];

        let prompt_tokens = estimate_messages_tokens(&messages);
        // 2026-04-25 — Step 5 dimensions: stream via FacilitatorChunk so the
        // case-owner sees the secretary's analysis flowing in real time
        // instead of staring at a 5-15s spinner. Frontend runS5
        // (facilitator_chunk handler) already accumulates these.
        let response = secretary.run_streaming_collect(
            &messages,
            ChatOptions::default().max_tokens(600),
            sender.clone().into(),
        ).await
            .map_err(|e| crate::CoreError::Agent(e.to_string()))?;
        let completion_tokens = estimate_tokens_static(&response);
        let duration_ms = start_time.elapsed().as_millis() as u64;

        // Parse dimensions from response
        let dimensions = parse_dimensions(&response);
        tracing::info!(
            "run_dimensions: response_chars={} response_head={:?} parsed_dims={} duration_ms={}",
            response.chars().count(),
            response.chars().take(120).collect::<String>(),
            dimensions.len(),
            duration_ms,
        );

        // Save
        self.storage.write_session_file(project_id, session_id, "04-dimensions.md", &strip_think_tags(&response)).await?;

        // Track metrics
        let metrics = StepMetrics {
            step: 5,
            step_name: "Dimensions".to_string(),
            duration_ms,
            prompt_tokens,
            completion_tokens,
            total_tokens: prompt_tokens + completion_tokens,
        };
        save_metrics(&self.storage, project_id, session_id, metrics).await.ok();

        sender.send(SSEEvent::step_done_with_data(5, serde_json::json!({ "dimensions": dimensions.len() }))).await.map_err(|e| crate::CoreError::Channel(e.to_string()))?;

        Ok(dimensions)
    }

    /// Step 6: Debate - Debate on each dimension with two rounds
    /// NOTE: step_start(6) and step_done(6) are sent by the route handler, not here.
    /// This method handles one dimension at a time; the route handler loops over dimensions.
    pub async fn run_debate(
        &self,
        project_id: &str,
        session_id: &str,
        dimension: &Dimension,
        sender: SseSink,
    ) -> CoreResult<String> {
        let start_time = Instant::now();

        let defined = self.storage.read_session_file(project_id, session_id, "01-defined.md").await?;
        let facts = self.storage.read_session_file(project_id, session_id, "02-facts-answers.md").await?;

        // Phase 3.4: fingerprint scoped to this dimension, so each dim's RAG picks
        // situation cards relevant to that angle.
        let fp = crate::fingerprint::extract(&format!("{}\n{}\n{}", defined, facts, dimension.name));

        // ========== ROUND 1: Initial positions (all personas speak in parallel) ==========
        let mut join_set = JoinSet::new();
        let (tx, mut rx) = mpsc::channel::<(String, String, String)>(100); // (name, position, category)

        let active_round1 = self.active_personas(project_id, session_id).await;
        for wp in active_round1 {
            let slug = wp.slug.clone();
            let name = wp.name.clone();
            let title = wp.title.clone();
            let desc = wp.short_description();
            let base_prompt = wp.build_system_prompt(&defined, Some(&fp));
            let cadence_cap = wp.cadence.max_tokens_step6();
            let defined = defined.clone();
            let facts = facts.clone();
            let dim_name = dimension.name.clone();
            let tx = tx.clone();
            let sender = sender.clone();
            let model = self.model.clone();

            join_set.spawn(async move {
                let persona = PersonaAgent::new(&slug, &name, &title, &desc, model);
                let prompt = debate_persona_prompt(&defined, &facts, &dim_name);
                let system_prompt = rich_persona_debate_prompt(&base_prompt, &defined, &facts, &dim_name);

                let messages = vec![
                    ChatMessage::system(&system_prompt),
                    ChatMessage::user(crate::ensure_chinese_response(&prompt)),
                ];

                // Stream + collect. max_tokens driven by cadence (terse=250,
                // balanced=600, discursive=1100; legacy=1200 fallback).
                // 2026-04-25 — same surface-on-failure pattern as run_opinions
                // and run_harvest. Was silently dropping personas whose Round 1
                // call errored (HTTP 5xx, timeout, rate-limit) — debate would
                // proceed with N-1 voices and no log.
                let result = match persona.run_streaming_collect(
                    &messages,
                    ChatOptions::default().max_tokens(cadence_cap),
                    sender.into(),
                ).await {
                    Ok(text) => text,
                    Err(e) => {
                        eprintln!("[run_debate r1] persona '{}' failed: {}", name, e);
                        let placeholder = format!(
                            "_（{} 此次未能加入辩论——LLM 调用失败：{}。）_",
                            name, e
                        );
                        let _ = tx.send((name.to_string(), placeholder, "skip".to_string())).await;
                        return Ok::<(), crate::agents::AgentError>(());
                    }
                };

                // Categorize based on response content
                let category = Self::categorize_position(&result);
                tx.send((name.to_string(), result, category)).await
                    .map_err(|e| crate::agents::AgentError::Channel(e.to_string()))?;
                Ok::<(), crate::agents::AgentError>(())
            });
        }

        drop(tx);

        // Collect Round 1 positions and categorize
        let mut round1_results: Vec<(String, String)> = Vec::new();
        let mut pro_con_results: Vec<(String, String)> = Vec::new();
        let mut middle_results: Vec<(String, String)> = Vec::new();

        while let Some((name, position, category)) = rx.recv().await {
            let trimmed = position.trim().to_uppercase();
            if trimmed != "SKIP" && !trimmed.is_empty() {
                round1_results.push((name.clone(), position.clone()));
                match category.as_str() {
                    "pro" | "con" => pro_con_results.push((name, position)),
                    _ => middle_results.push((name, position)),
                }
            }
        }

        while join_set.join_next().await.is_some() {}

        // Format Round 1 positions (pro/con first, then middle)
        let mut all_round1_positions = String::new();
        for (name, position) in &pro_con_results {
            all_round1_positions.push_str(&format!("## {}\n{}\n\n", name, position));
        }
        for (name, position) in &middle_results {
            all_round1_positions.push_str(&format!("## {} (Middle)\n{}\n\n", name, position));
        }

        // ========== MIDDLE RESPONSE: Middle personas react to pro/con debate ==========
        let mut all_middle_responses = String::new();

        if !middle_results.is_empty() && !pro_con_results.is_empty() {
            // Format pro/con positions for middle to react to
            let pro_con_text: String = pro_con_results.iter()
                .map(|(n, p)| format!("## {}\n{}\n\n", n, p))
                .collect();

            let mut join_set = JoinSet::new();
            let (tx, mut rx) = mpsc::channel::<(String, String)>(100);

            let active_middle = self.active_personas(project_id, session_id).await;
            for wp in active_middle {
                // Only middle personas respond here
                let is_middle = middle_results.iter().any(|(n, _)| n == &wp.name);
                if !is_middle {
                    continue;
                }

                let slug = wp.slug.clone();
                let name = wp.name.clone();
                let title = wp.title.clone();
                let desc = wp.short_description();
                let base_prompt = wp.build_system_prompt(&defined, Some(&fp));
                let cadence_cap = wp.cadence.max_tokens_step6_r2();
                let defined = defined.clone();
                let facts = facts.clone();
                let dim_name = dimension.name.clone();
                let pro_con_text = pro_con_text.clone();
                let tx = tx.clone();
                let sender = sender.clone();
                let model = self.model.clone();

                join_set.spawn(async move {
                    let persona = PersonaAgent::new(&slug, &name, &title, &desc, model);
                    let prompt = debate_middle_react_prompt(&defined, &facts, &dim_name, &pro_con_text);

                    let messages = vec![
                        ChatMessage::system(&base_prompt),
                        ChatMessage::user(crate::ensure_chinese_response(&prompt)),
                    ];

                    // Stream + collect. max_tokens driven by cadence
                    // (terse=150, balanced=350, discursive=600; legacy=700).
                    // 2026-04-25 — same Err-surface pattern as r1 above.
                    let result = match persona.run_streaming_collect(
                        &messages,
                        ChatOptions::default().max_tokens(cadence_cap),
                        sender.into(),
                    ).await {
                        Ok(text) => text,
                        Err(e) => {
                            eprintln!("[run_debate middle] persona '{}' failed: {}", name, e);
                            let placeholder = format!(
                                "_（{} 此次中立方回应未能返回——LLM 调用失败：{}。）_",
                                name, e
                            );
                            let _ = tx.send((name.to_string(), placeholder)).await;
                            return Ok::<(), crate::agents::AgentError>(());
                        }
                    };

                    tx.send((name.to_string(), result)).await
                        .map_err(|e| crate::agents::AgentError::Channel(e.to_string()))?;
                    Ok::<(), crate::agents::AgentError>(())
                });
            }

            drop(tx);

            // Collect middle responses
            let mut middle_response_results: Vec<(String, String)> = Vec::new();
            while let Some((name, position)) = rx.recv().await {
                middle_response_results.push((name, position));
            }

            while join_set.join_next().await.is_some() {}

            // Format middle responses
            for (name, position) in &middle_response_results {
                all_middle_responses.push_str(&format!("## {} (Middle Response)\n{}\n\n", name, position));
            }
        }

        // 2026-04-25 — Per Michael: 辩论环节主持人就不要做总结了，都留着 Step 7 做.
        // The per-dim secretary synthesis ("核心矛盾/关键洞察/共同地带/未解张力") was
        // adding a long facilitator block at the end of every dim debate. Now
        // skipped entirely — Step 7's secretary reads the full debate transcript
        // and produces ONE bullet-first 结论卡 covering all dims. Less repetition,
        // less wait time, less host noise.
        let synthesis = String::new();

        // Append to debate record (no "### 整合" section now that synthesis is gone)
        let debate_file = self.storage.session_file(project_id, session_id, "05-debate.md");
        let existing = if debate_file.exists() {
            tokio::fs::read_to_string(&debate_file).await?
        } else {
            String::new()
        };
        // Wrapper format in Chinese. "### 中立方回应" section is omitted when
        // empty (previously showed a blank header — noise to the user).
        let middle_section = if all_middle_responses.trim().is_empty() {
            String::new()
        } else {
            format!("\n\n### 中立方回应\n{}", all_middle_responses)
        };
        let updated = format!(
            "{}\n\n## {}\n\n### 第一轮立场\n{}{}\n\n---",
            existing,
            dimension.name,
            all_round1_positions,
            middle_section,
        );
        self.storage.write_session_file(project_id, session_id, "05-debate.md", &strip_think_tags(&updated)).await?;

        // Track metrics for this dimension's debate
        let duration_ms = start_time.elapsed().as_millis() as u64;
        let total_tokens = estimate_tokens_static(&all_round1_positions)
            + estimate_tokens_static(&all_middle_responses);
        let metrics = StepMetrics {
            step: 6,
            step_name: format!("Debate: {}", dimension.name),
            duration_ms,
            prompt_tokens: total_tokens / 2,
            completion_tokens: total_tokens / 2,
            total_tokens,
        };
        save_metrics(&self.storage, project_id, session_id, metrics).await.ok();

        Ok(synthesis)
    }

    /// Categorize a persona's debate position based on their response.
    /// Primary: parse required "Position: for/against/middle" header (case-insensitive).
    /// Fallback: English + Chinese keyword counts with strict margin.
    pub fn categorize_position(response: &str) -> String {
        // Primary: look for structured "立场：X" / "Position: X" on an early line.
        // Supports both Chinese and English prefixes + half/full-width colons —
        // Chinese is the default now (debate prompt asks for 中文立场), but older
        // sessions may still emit English.
        for line in response.lines().take(5) {
            let t = line.trim().to_lowercase();
            let rest_opt = t.strip_prefix("position:")
                .or_else(|| t.strip_prefix("position："))
                .or_else(|| t.strip_prefix("立场:"))
                .or_else(|| t.strip_prefix("立场："));
            let Some(rest) = rest_opt else {
                continue;
            };
            let rest = rest.trim();
            if rest.starts_with("for") || rest.starts_with("support") || rest.starts_with("pro")
                || rest.starts_with("正方") || rest.starts_with("支持") || rest.starts_with("赞成")
            {
                return "pro".to_string();
            }
            if rest.starts_with("against") || rest.starts_with("oppose") || rest.starts_with("con")
                || rest.starts_with("反方") || rest.starts_with("反对")
            {
                return "con".to_string();
            }
            if rest.starts_with("middle") || rest.starts_with("neutral")
                || rest.starts_with("中立") || rest.starts_with("中间")
            {
                return "middle".to_string();
            }
        }

        // Fallback: bilingual keyword counts on the first ~300 chars
        let upper = response.to_uppercase();
        let sample: String = upper.chars().take(300).collect();
        let raw_sample: String = response.chars().take(300).collect();

        // Explicit inline stance phrases
        if sample.contains("I'M FOR") || sample.contains("I SUPPORT") || sample.contains("MY STANCE IS FOR")
            || raw_sample.contains("我支持") || raw_sample.contains("我赞成") || raw_sample.contains("我的立场是正方")
        {
            return "pro".to_string();
        }
        if sample.contains("I'M AGAINST") || sample.contains("I OPPOSE") || sample.contains("MY STANCE IS AGAINST")
            || raw_sample.contains("我反对") || raw_sample.contains("我的立场是反方") || raw_sample.contains("我的立场是 AGAINST") || raw_sample.contains("立场是against")
        {
            return "con".to_string();
        }
        if sample.contains("I'M IN THE MIDDLE") || sample.contains("BOTH SIDES")
            || raw_sample.contains("我中立") || raw_sample.contains("我的立场是中立")
        {
            return "middle".to_string();
        }

        // Keyword tally — English + Chinese
        let pro_count = sample.matches("SUPPORT").count()
            + sample.matches("AGREE").count()
            + raw_sample.matches("支持").count()
            + raw_sample.matches("赞成").count()
            + raw_sample.matches("正方").count();
        let con_count = sample.matches("AGAINST").count()
            + sample.matches("OPPOSE").count()
            + sample.matches("DISAGREE").count()
            + raw_sample.matches("反对").count()
            + raw_sample.matches("反方").count();

        if pro_count > con_count {
            "pro".to_string()
        } else if con_count > pro_count {
            "con".to_string()
        } else {
            "middle".to_string()
        }
    }

    /// Step 7: Summary - Secretary summarizes with agreements/disagreements/areas to explore
    /// Step 6.5 Pre-Mortem (Phase 4.4 + 2026-04-22 streaming upgrade). Two callers:
    ///
    /// - **Live (Step 7 handler)**: `sender` is the user's real SSE sink. Each chunk
    ///   arrives as `PremortemChunk` in real time.
    /// - **Background (Step 6 handler end)**: `sender = SseSink::discarded()`. Chunks
    ///   go nowhere, but `premortem.md` is written progressively (every ~400 chars)
    ///   as a side effect, so when the user clicks Step 7 the file already has
    ///   whatever has been generated so far.
    ///
    /// Implementation: `run_streaming_collect` writes internal SSE frames to a
    /// private channel; a forwarder task parses each chunk, rewraps it as
    /// `PremortemChunk`, forwards to the user sender, and progressively saves
    /// the accumulated text to `premortem.md`.
    pub async fn run_premortem(
        &self,
        project_id: &str,
        session_id: &str,
        sender: SseSink,
    ) -> CoreResult<String> {
        let start_time = Instant::now();
        sender.send(SSEEvent::PremortemStart).await.ok();

        let raw_input = self.storage.read_session_file(project_id, session_id, "00-raw-input.md").await?;
        let defined = self.storage.read_session_file(project_id, session_id, "01-defined.md").await?;
        let debate = self.storage.read_session_file(project_id, session_id, "05-debate.md").await.unwrap_or_default();

        let prompt = prepend_user_reactions(
            &self.storage.read_session_file(project_id, session_id, "user-reactions.md").await.unwrap_or_default(),
            premortem_prompt(&raw_input, &defined, &debate),
        );

        let secretary = SecretaryAgent::new(self.model.clone());
        let messages = vec![
            ChatMessage::system("你是参谋长（Chief of Staff），站在决策失败一年后的视角做 Pre-Mortem 复盘。"),
            ChatMessage::user(prompt),
        ];
        let prompt_tokens = estimate_messages_tokens(&messages);

        // Internal channel — run_streaming_collect writes FacilitatorChunk SSE frames here;
        // the forwarder task below parses them, rewraps as PremortemChunk for the user
        // sender, and progressively writes premortem.md as text accumulates.
        let (tx, mut rx) = mpsc::channel::<String>(100);
        let inner_sink: SseSink = tx.into();

        let storage_fwd = self.storage.clone();
        let pid_fwd = project_id.to_string();
        let sid_fwd = session_id.to_string();
        let sender_fwd = sender.clone();
        let fwd_task = tokio::spawn(async move {
            let mut accumulated = String::new();
            let mut last_flush_len = 0_usize;
            while let Some(raw) = rx.recv().await {
                // raw is "data: {\"type\":\"facilitator_chunk\",\"chunk\":\"…\"}\n\n"
                let body = raw.trim().trim_start_matches("data: ").trim();
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
                    if let Some(chunk) = v.get("chunk").and_then(|c| c.as_str()) {
                        accumulated.push_str(chunk);
                        let _ = sender_fwd.send(SSEEvent::PremortemChunk { chunk: chunk.to_string() }).await;
                        // Progressive save: flush every ~400 chars of new content
                        if accumulated.len().saturating_sub(last_flush_len) >= 400 {
                            let _ = storage_fwd.write_session_file(&pid_fwd, &sid_fwd, "premortem.md", &accumulated).await;
                            last_flush_len = accumulated.len();
                        }
                    }
                }
            }
        });

        // max_tokens=800 (was 1600; halved 2026-04-25 per Michael "简明扼要").
        // Prompt soft-caps at 800 汉字; tightening the hard cap to ~800 tokens
        // (≈ 1000 Chinese chars worst case) keeps a ~25% buffer over the soft
        // cap, preventing cut-off but encouraging the model to actually stop.
        // 2026-04-26 v3 · max_tokens 800 → 500 to align with the 500-char
        // hard cap added to premortem_prompt the same day. Premortem was
        // running 600+ chars in tests (e2e showed 636); this aligns with
        // the opinions/cadence tightening Michael asked for ("废话太多").
        let response = secretary.run_streaming_collect(
            &messages,
            ChatOptions::default().max_tokens(500),
            inner_sink,
        ).await.map_err(|e| crate::CoreError::Agent(e.to_string()))?;
        // inner_sink dropped by run_streaming_collect → channel closes → fwd_task exits
        let _ = fwd_task.await;

        // Final write ensures premortem.md matches the full response even if the
        // forwarder missed the tail (e.g., last flush was < 400 chars before end).
        self.storage.write_session_file(project_id, session_id, "premortem.md", &strip_think_tags(&response)).await?;

        let completion_tokens = estimate_tokens_static(&response);
        let duration_ms = start_time.elapsed().as_millis() as u64;

        let metrics = StepMetrics {
            step: 7,
            step_name: "Premortem".to_string(),
            duration_ms,
            prompt_tokens,
            completion_tokens,
            total_tokens: prompt_tokens + completion_tokens,
        };
        save_metrics(&self.storage, project_id, session_id, metrics).await.ok();

        sender.send(SSEEvent::PremortemDone).await.ok();
        Ok(response)
    }

    pub async fn run_summary(
        &self,
        project_id: &str,
        session_id: &str,
        sender: SseSink,
    ) -> CoreResult<String> {
        let start_time = Instant::now();
        sender.send(SSEEvent::step_start(7)).await.map_err(|e| crate::CoreError::Channel(e.to_string()))?;

        let raw_input = self.storage.read_session_file(project_id, session_id, "00-raw-input.md").await?;
        let defined = self.storage.read_session_file(project_id, session_id, "01-defined.md").await?;
        let facts = self.storage.read_session_file(project_id, session_id, "02-facts-answers.md").await?;
        // Debate may be a "skipped" marker when only one persona is active. In
        // that case, fall back to the raw opinion files (Step 4 output) so the
        // summary has real content to synthesize from.
        let debate_raw = self.storage.read_session_file(project_id, session_id, "05-debate.md").await.unwrap_or_default();
        let debate = if debate_raw.trim().is_empty() || debate_raw.contains("辩论已跳过") {
            let opinions = self.storage.list_opinions(project_id, session_id).await.unwrap_or_default();
            if opinions.is_empty() {
                debate_raw
            } else {
                tracing::info!("run_summary: debate skipped/empty, using {} opinion(s) as source", opinions.len());
                let joined: String = opinions.into_iter()
                    .map(|(name, content)| format!("## {}\n{}", name, content))
                    .collect::<Vec<_>>()
                    .join("\n\n");
                format!("# 单一视角 / 意见一致场景 — 直接采用 Step 4 的 opinion\n\n{}", joined)
            }
        } else {
            debate_raw
        };
        // 2026-04-26 — premortem is now run in parallel with summary (Step 7
        // route uses tokio::join!), so when run_summary fires, premortem.md is
        // mid-write and reading it would race. Just pass empty — summary_prompt's
        // premortem_section is conditional and gracefully omits when empty.
        let premortem = String::new();

        let secretary = SecretaryAgent::new(self.model.clone());

        // Phase 2.9 — context compression (replaces deleted `MAX_DEBATE_CHARS=8000`
        // hard truncation). If debate exceeds threshold, let Secretary compress it
        // to ~2000 chars preserving positions + tensions, rather than truncating.
        const DEBATE_COMPRESS_THRESHOLD: usize = 8000;  // Chinese chars
        let debate_chars = debate.chars().count();
        let debate_for_summary: String = if debate_chars > DEBATE_COMPRESS_THRESHOLD {
            tracing::info!("debate is {} chars (> {}), compressing before summary", debate_chars, DEBATE_COMPRESS_THRESHOLD);
            let compress_prompt = format!(
                r#"以下是一次多维度辩论的完整记录。请压缩到约 2000 字以内（中文字符），严格保留：
- 每位幕僚的核心立场（正方/反方/中立）
- 每个维度的关键冲突点与共同地带
- 未解决的张力和遗留问题
- 任何 Pre-Mortem 或事前警示（如有）

压缩风格：连贯文本、不要无意义堆砌、保留幕僚原话的锐度片段。全程用中文。

---

{}"#,
                debate
            );
            let compress_msgs = vec![
                ChatMessage::system("你是擅长压缩冗长讨论的分析师，保留灵魂，舍弃重复。"),
                ChatMessage::user(compress_prompt),
            ];
            match secretary.run(&compress_msgs, ChatOptions::default().max_tokens(2500)).await {
                Ok(compressed) => {
                    let new_len = compressed.chars().count();
                    tracing::info!("debate compressed: {} → {} chars", debate_chars, new_len);
                    strip_think_tags(&compressed)
                }
                Err(e) => {
                    tracing::warn!("debate compression failed, using full text: {}", e);
                    debate.clone()
                }
            }
        } else {
            debate.clone()
        };

        let prompt = prepend_user_reactions(
            &self.storage.read_session_file(project_id, session_id, "user-reactions.md").await.unwrap_or_default(),
            summary_prompt(&raw_input, &defined, &facts, &debate_for_summary, &premortem),
        );

        let messages = vec![
            ChatMessage::system("你是一位擅长生成结构化汇总的分析师。"),
            ChatMessage::user(prompt),
        ];

        let prompt_tokens = estimate_messages_tokens(&messages);

        // Stream + collect.
        // 2026-04-25 — Step 7 summary: bullet-first 结论卡 (≤350字) + Mode B
        // 详细分析 section (≤400字), max_tokens raised to 1200 to fit both.
        // Frontend wraps "## 详细分析" + after in collapsible <details>.
        let response = secretary.run_streaming_collect(
            &messages,
            ChatOptions::default().max_tokens(1200),
            sender.clone().into(),
        ).await.map_err(|e| crate::CoreError::Agent(e.to_string()))?;
        let completion_tokens = estimate_tokens_static(&response);
        let duration_ms = start_time.elapsed().as_millis() as u64;

        // Save
        self.storage.write_session_file(project_id, session_id, "06-summary.md", &strip_think_tags(&response)).await?;

        // Track metrics
        let metrics = StepMetrics {
            step: 7,
            step_name: "Summary".to_string(),
            duration_ms,
            prompt_tokens,
            completion_tokens,
            total_tokens: prompt_tokens + completion_tokens,
        };
        save_metrics(&self.storage, project_id, session_id, metrics).await.ok();

        sender.send(SSEEvent::step_done(7)).await.map_err(|e| crate::CoreError::Channel(e.to_string()))?;

        Ok(response)
    }

    /// Step 8: Harvest - Personas evaluate and extract todos with comments and achievements
    pub async fn run_harvest(
        &self,
        project_id: &str,
        session_id: &str,
        sender: SseSink,
    ) -> CoreResult<HarvestResult> {
        let start_time = Instant::now();
        sender.send(SSEEvent::step_start(8)).await.map_err(|e| crate::CoreError::Channel(e.to_string()))?;

        let raw_input = self.storage.read_session_file(project_id, session_id, "00-raw-input.md").await?;
        // Fall back gracefully: prefer summary, then debate, then opinions
        let summary = match self.storage.read_session_file(project_id, session_id, "06-summary.md").await {
            Ok(s) if !s.is_empty() => s,
            _ => {
                tracing::warn!("06-summary.md missing, falling back to debate/opinions for harvest");
                let debate = self.storage.read_session_file(project_id, session_id, "05-debate.md").await.unwrap_or_default();
                if !debate.is_empty() {
                    debate
                } else {
                    // Last resort: use opinions
                    let opinions = self.storage.list_opinions(project_id, session_id).await.unwrap_or_default();
                    opinions.into_iter().map(|(n, c)| format!("## {}\n{}", n, c)).collect::<Vec<_>>().join("\n\n")
                }
            }
        };

        // Read the client's self-reflection (07-client-notes.md) — written BEFORE run_harvest
        // by the frontend via POST /client-notes. If absent/empty, persona evaluations and
        // the Bayesian update both fall back to the legacy no-client-notes behavior.
        let client_notes = self.storage.read_session_file(project_id, session_id, "07-client-notes.md").await.unwrap_or_default();
        // Read user-reactions.md (Phase 2.13) so Step 8 advisor+bayesian prompts see what resonated.
        let user_reactions = self.storage.read_session_file(project_id, session_id, "user-reactions.md").await.unwrap_or_default();

        // Phase 3.4: fingerprint from full case + client's own reflections for
        // harvest-time persona-evaluation RAG.
        let fp = crate::fingerprint::extract(&format!("{}\n{}\n{}", raw_input, summary, client_notes));

        // Step 8a: Personas evaluate — uses canonical persona list (same as Steps 3-7)
        //
        // Each eval is non-streaming (`.run()`) because we need the full response
        // for aggregation; but we DO emit PersonaStart/PersonaDone before+after each
        // eval so the UI can show per-persona progress chips during the 30-60s wait.
        // Without these events, Step 8 appeared frozen for ~2 minutes (bug 2026-04-22).
        let mut join_set = JoinSet::new();
        let (tx, mut rx) = mpsc::channel::<(String, String, usize)>(100);

        let active_harvest = self.active_personas(project_id, session_id).await;
        for wp in active_harvest {
            let slug = wp.slug.clone();
            let name = wp.name.clone();
            let title = wp.title.clone();
            let desc = wp.short_description();
            let system_prompt = wp.build_system_prompt(&raw_input, Some(&fp));
            let cadence_cap = wp.cadence.max_tokens_step8();
            let raw_input = raw_input.clone();
            let summary = summary.clone();
            let client_notes = client_notes.clone();
            let reactions = user_reactions.clone();
            let tx = tx.clone();
            let sender_task = sender.clone();
            let model = self.model.clone();

            join_set.spawn(async move {
                // Progress signal: persona is being evaluated. Frontend lights the chip.
                sender_task.send(SSEEvent::persona_start(name.clone())).await.ok();

                let agent = PersonaAgent::new(&slug, &name, &title, &desc, model);
                let prompt = prepend_user_reactions(
                    &reactions,
                    harvest_eval_prompt(&name, &system_prompt, &raw_input, &summary, &client_notes),
                );

                let messages = vec![
                    ChatMessage::system(&system_prompt),
                    ChatMessage::user(crate::ensure_chinese_response(&prompt)),
                ];

                let prompt_tokens = estimate_messages_tokens(&messages);
                // 2026-04-25 — Step 8a evals: switched from agent.run (silent
                // 30-90s wait) to agent.run_streaming_collect so PersonaChunk
                // SSE frames flow per-persona in parallel. Frontend Step 8
                // handler aggregates per-name into 12 live cards. Same
                // surface-on-failure pattern as run_opinions; cadence cap
                // unchanged (terse=250, balanced=500, discursive=900).
                let result = match agent.run_streaming_collect(
                    &messages,
                    ChatOptions::default().max_tokens(cadence_cap),
                    sender_task.clone().into(),
                ).await {
                    Ok(text) => text,
                    Err(e) => {
                        eprintln!("[run_harvest] persona '{}' eval failed: {}", name, e);
                        sender_task.send(SSEEvent::persona_done(name.clone())).await.ok();
                        let placeholder = format!(
                            "_（{} 此次评价未能返回——LLM 调用失败：{}。可在 Settings 切换模型或重试。）_",
                            name, e
                        );
                        let _ = tx.send((name.to_string(), placeholder, prompt_tokens)).await;
                        return Ok::<(), crate::agents::AgentError>(());
                    }
                };
                let completion_tokens = estimate_tokens_static(&result);

                // Progress signal: eval complete.
                sender_task.send(SSEEvent::persona_done(name.clone())).await.ok();

                tx.send((name.to_string(), result, prompt_tokens + completion_tokens)).await
                    .map_err(|e| crate::agents::AgentError::Channel(e.to_string()))?;
                Ok::<(), crate::agents::AgentError>(())
            });
        }

        drop(tx);

        let mut evaluations = HashMap::new();
        let mut harvest_persona_tokens = 0;
        while let Some((name, eval, tokens)) = rx.recv().await {
            harvest_persona_tokens += tokens;
            evaluations.insert(name, eval);
        }

        while join_set.join_next().await.is_some() {}

        // Step 8b + 8c: harvest_todo and bayesian both consume evals_text from
        // 8a. Neither depends on the other → run in parallel via tokio::join!
        // (Michael 2026-04-25: "汇总和幕僚的评价、todo 这些，同时并行跑").
        // Saves ~5-10s on Pro, ~3-5s on Flash.
        let evals_text = evaluations
            .values()
            .map(|e| e.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");

        sender.send(SSEEvent::FacilitatorChunk {
            chunk: "\n\n⏳ 行动清单 + 贝叶斯信念更新并行提炼中…\n\n".to_string()
        }).await.ok();

        // Build both prompts up front so we can fire both calls concurrently.
        let todo_prompt = harvest_todo_prompt(&evals_text, &summary);
        let todo_messages = vec![
            ChatMessage::system("You are a skilled analyst extracting actionable insights."),
            ChatMessage::user(todo_prompt),
        ];
        let todo_prompt_tokens = estimate_messages_tokens(&todo_messages);

        let bayesian_prompt = prepend_user_reactions(
            &user_reactions,
            bayesian_update_prompt(&raw_input, &summary, &evals_text, &client_notes),
        );
        let bayesian_messages = vec![
            ChatMessage::system("你是贝叶斯分析师，追踪案主信念在咨询会议中的变化。"),
            ChatMessage::user(bayesian_prompt),
        ];
        let bayesian_prompt_tokens = estimate_messages_tokens(&bayesian_messages);

        // Two independent secretary instances so each can hold its own model arc.
        let secretary_todo = SecretaryAgent::new(self.model.clone());
        let secretary_bayes = SecretaryAgent::new(self.model.clone());

        // 2026-04-25 — 摘果子 streaming + parallel:
        //   - 8b harvest_todo: stays NON-streaming (no chunks), still parallel.
        //     Streams would interleave with 8c FacilitatorChunk on same SSE wire.
        //   - 8c bayesian: STREAMS via FacilitatorChunk so case-owner watches
        //     the belief-delta synthesis flow in real time. Frontend appends
        //     into the bayesian card live.
        // Caps: todo 1000→500, bayesian 1000→400.
        let bayes_sender = sender.clone();
        let (todo_result, bayesian_result) = tokio::join!(
            secretary_todo.run(&todo_messages, ChatOptions::default().max_tokens(500)),
            secretary_bayes.run_streaming_collect(
                &bayesian_messages,
                ChatOptions::default().max_tokens(400),
                bayes_sender.into(),
            ),
        );

        let todo_response = todo_result
            .map_err(|e| crate::CoreError::Agent(format!("harvest_todo failed: {}", e)))?;
        let todo_completion_tokens = estimate_tokens_static(&todo_response);

        let bayesian_response = bayesian_result
            .map_err(|e| crate::CoreError::Agent(format!("bayesian failed: {}", e)))?;
        let bayesian_completion_tokens = estimate_tokens_static(&bayesian_response);

        sender.send(SSEEvent::FacilitatorChunk {
            chunk: "✓ 并行提炼完成。\n\n".to_string()
        }).await.ok();

        let duration_ms = start_time.elapsed().as_millis() as u64;
        let total_tokens = harvest_persona_tokens + todo_prompt_tokens + todo_completion_tokens
            + bayesian_prompt_tokens + bayesian_completion_tokens;

        // Parse todos and insights
        let (todos, insights) = parse_todos_insights(&todo_response);

        let result = HarvestResult {
            evaluations,
            todos,
            insights,
            bayesian_update: Some(bayesian_response.clone()),
        };

        // Save harvest
        self.storage.write_session_file(project_id, session_id, "07-harvest.md", &strip_think_tags(&todo_response)).await?;

        // Save Bayesian update as separate file
        self.storage.write_session_file(project_id, session_id, "07-bayesian.md", &strip_think_tags(&bayesian_response)).await?;

        // Phase 2.8 belief-system.md: overwrite project-level latest posterior.
        // Session N+1's facilitator reads this as structured prior (cleaner
        // than wading through user-wiki.md's full history).
        let belief_system_content = format!(
            "# 信念体系（最新 Posterior）\n\n*本项目最近一次私董会更新的贝叶斯信念。Session {} 于 {} 产出。新 session 开始时作为 Prior 注入 Step 2 主持人 prompt。*\n\n---\n\n{}\n",
            session_id,
            chrono::Local::now().format("%Y-%m-%d"),
            strip_think_tags(&bayesian_response),
        );
        if let Err(e) = self.storage.write_belief_system(project_id, &belief_system_content).await {
            tracing::warn!("failed to write belief-system.md (non-fatal): {}", e);
        }

        // Save per-persona evaluations of the client (for UI rendering)
        let evals_markdown = {
            let mut s = String::from("# 幕僚对案主的观察与评价\n\n");
            let mut names: Vec<String> = result.evaluations.keys().cloned().collect();
            names.sort();
            for name in &names {
                if let Some(eval) = result.evaluations.get(name) {
                    s.push_str(&format!("## {}\n\n{}\n\n---\n\n", name, eval));
                }
            }
            s
        };
        self.storage.write_session_file(project_id, session_id, "07-persona-evals.md", &evals_markdown).await?;

        // Append to User Wiki (cross-project, cross-session memory) —
        // records the full picture including the HIGH-SIGNAL Step 3 fact-gathering answers
        // (Michael 2026-04-22: "挖事实这步特别眼前一亮……信息是极其高度 context-based，像一张网
        // 深深嵌套在用户的潜意识里"). Step 3 facts are the spine of the future identity layer;
        // record now, frame later (§3.4).
        let existing_wiki = self.storage.read_user_wiki().await.unwrap_or_default();
        let date = chrono::Local::now().format("%Y-%m-%d").to_string();
        let facts_answers = self.storage.read_session_file(project_id, session_id, "02-facts-answers.md").await.unwrap_or_default();
        let defined = self.storage.read_session_file(project_id, session_id, "01-defined.md").await.unwrap_or_default();
        let raw_input_full = self.storage.read_session_file(project_id, session_id, "00-raw-input.md").await.unwrap_or_default();
        let client_notes_section = if client_notes.trim().is_empty() {
            "_(本次未填写)_".to_string()
        } else {
            client_notes.trim().to_string()
        };
        let reactions_section = if user_reactions.trim().is_empty() {
            "_(本次未标记)_".to_string()
        } else {
            user_reactions.trim().to_string()
        };
        let facts_section = if facts_answers.trim().is_empty() {
            "_(本次无挖事实记录)_".to_string()
        } else {
            facts_answers.trim().to_string()
        };
        // Note on 行动清单: we intentionally do NOT dump result.todos into the
        // wiki entry. Michael 2026-04-22: "案主点击以后，是不是应该进入和更新
        // user wiki 啊，而不是一股脑的放到里面". LLM-generated todos are advice,
        // not commitments. Only what the client actually clicks in the UI flows
        // into `## 行动承诺日志` section (via POST /todos/commit). The full list
        // stays in 07-harvest.md as reference.
        let wiki_entry = format!(
            "\n\n---\n## 项目 {} · 会话 {} ({})\n\n### 原始困境\n{}\n\n### 锁定议题\n{}\n\n### 挖事实 — 案主的回答（身份层最高信号）\n> 此段是案主在具体问题情境下的自然反应，上下文密度最高，是个人画像的身份层脊柱素材。\n\n{}\n\n### 案主自己的反思\n{}\n\n### 贝叶斯信念更新\n{}\n\n### 幕僚建议的行动清单\n_完整清单见 07-harvest.md。只有案主在 UI 上勾选（承诺）的条目会进入本 wiki 顶部的「行动承诺日志」，代表真实行动意图。_\n\n### 实时共振信号\n{}\n",
            project_id, session_id, date,
            raw_input_full.trim(),
            defined.trim(),
            facts_section,
            client_notes_section,
            bayesian_response,
            reactions_section,
        );
        let updated_wiki = if existing_wiki.is_empty() {
            format!("# 案主画像（User Wiki）\n\n*持续累积的案主画像：身份、认知迭代、决策模式、跨项目信念演化。*\n{}", wiki_entry)
        } else {
            format!("{}{}", existing_wiki, wiki_entry)
        };
        self.storage.write_user_wiki(&updated_wiki).await?;

        // ─── B2 · User-wiki tier writes (in addition to the legacy file) ─────
        //
        // Three writes happen here, all best-effort (non-fatal on failure):
        //   1. log/{sid}.md  — the same wiki_entry, single-file form
        //   2. core.md       — distilled identity-layer facts (≤3 per session,
        //                       merged with FIFO eviction at CORE_BUDGET bytes)
        //   3. log/INDEX.md  — rebuilt from disk so the facilitator's
        //                       always-loaded context can show one-line hooks
        //                       per past session instead of the full wiki.
        //
        // Why best-effort: Step 8 has just produced a successful harvest;
        // failing the whole step because the secretary extraction couldn't
        // parse a fact would be worse than carrying on with a thinner core.
        if let Err(e) = self.storage.write_log_session(session_id, wiki_entry.trim()).await {
            tracing::warn!("write log/{}.md failed (non-fatal): {}", session_id, e);
        }

        let extracted = {
            let prompt = secretary_extract_core_facts_prompt(wiki_entry.trim(), &date);
            let messages = vec![
                ChatMessage::system("你是私董会的秘书，专精事实结构化。严格遵守输出格式。"),
                ChatMessage::user(prompt),
            ];
            // Non-streaming, low temperature — this is structured extraction,
            // not generation. Uses ~150 tokens out, runs ~1-2s on DeepSeek.
            let secretary = SecretaryAgent::new(self.model.clone());
            match secretary.run(&messages, ChatOptions::default().temperature(0.2).max_tokens(400)).await {
                Ok(text) => parse_core_facts(&text),
                Err(e) => {
                    tracing::warn!("secretary core-fact extraction failed (non-fatal): {}", e);
                    Vec::new()
                }
            }
        };
        if !extracted.is_empty() {
            if let Err(e) = self.storage.upsert_core_facts(&extracted).await {
                tracing::warn!("upsert_core_facts failed (non-fatal): {}", e);
            }
        }
        if let Err(e) = self.storage.rebuild_log_index().await {
            tracing::warn!("rebuild_log_index failed (non-fatal): {}", e);
        }

        // Track metrics
        let metrics = StepMetrics {
            step: 8,
            step_name: "Harvest".to_string(),
            duration_ms,
            prompt_tokens: (todo_prompt_tokens + harvest_persona_tokens / 12),
            completion_tokens: (todo_completion_tokens + harvest_persona_tokens / 12),
            total_tokens,
        };
        save_metrics(&self.storage, project_id, session_id, metrics).await.ok();

        sender.send(SSEEvent::step_done_with_data(8, serde_json::json!({
            "todos": result.todos.lines().count(),
            "insights": result.insights.lines().count()
        }))).await.map_err(|e| crate::CoreError::Channel(e.to_string()))?;

        Ok(result)
    }
}

/// Parse dimensions from the model response
pub fn parse_dimensions(response: &str) -> Vec<Dimension> {
    let mut dimensions = Vec::new();
    let mut current_name = String::new();
    let mut current_conflict = String::new();
    let mut current_pro = String::new();
    let mut current_con = String::new();
    let mut in_dimension = false;

    for line in response.lines() {
        let line = line.trim();
        if line.starts_with("## ") && !line.to_lowercase().contains("unanimous") {
            // Save previous dimension if exists
            if in_dimension && !current_name.is_empty() {
                dimensions.push(Dimension {
                    name: current_name.trim().to_string(),
                    core_conflict: current_conflict.trim().to_string(),
                    pro_argument: current_pro.trim().to_string(),
                    con_argument: current_con.trim().to_string(),
                });
            }
            current_name = line.trim_start_matches("## ").to_string();
            current_conflict.clear();
            current_pro.clear();
            current_con.clear();
            in_dimension = true;
        } else if in_dimension {
            let line_lower = line.to_lowercase();
            // 2026-04-26 — recognize Chinese markers from current dimensions_prompt
            // ("## 维度名称\n核心冲突：...\n分歧要点：..."). Without this, dim entries
            // were created with the right name but blank conflict/pro/con, which
            // weakened debate prompts. Both colons (full-width ：and ASCII :) are
            // accepted to be tolerant of model output drift.
            if line.starts_with("核心冲突：") || line.starts_with("核心冲突:") {
                current_conflict = line
                    .trim_start_matches("核心冲突：")
                    .trim_start_matches("核心冲突:")
                    .trim()
                    .to_string();
            } else if line.starts_with("分歧要点：") || line.starts_with("分歧要点:") {
                // Pro/con joined as one block; left for downstream prompts to
                // split. Dimension struct only carries strings.
                current_pro = line
                    .trim_start_matches("分歧要点：")
                    .trim_start_matches("分歧要点:")
                    .trim()
                    .to_string();
            } else if line_lower.starts_with("core conflict:") {
                current_conflict = line.trim_start_matches("Core Conflict:").trim_start_matches("core conflict:").to_string();
            } else if line_lower.starts_with("pro") || line_lower.contains("pro argument") {
                current_pro = line.split(':').nth(1).unwrap_or("").trim().to_string();
            } else if line_lower.starts_with("con") || line_lower.contains("con argument") {
                current_con = line.split(':').nth(1).unwrap_or("").trim().to_string();
            } else if line_lower.starts_with("points of contention:") {
                // Parse "Points of Contention: One side holds that... while the other side argues that..."
                // Or "Points of Contention: One side... The other side..."
                let content = line.trim_start_matches("Points of Contention:").trim_start_matches("points of contention:").trim();

                // Try "while the other side" first
                if let Some(separator_idx) = content.find(" while the other side ") {
                    current_pro = content[..separator_idx].trim().to_string();
                    let con_part = &content[separator_idx..];
                    if let Some(stripped) = con_part.strip_prefix(" while the other side argues that ") {
                        current_con = stripped.trim().to_string();
                    } else if let Some(stripped) = con_part.strip_prefix(" while the other side argues ") {
                        current_con = stripped.trim().to_string();
                    } else if let Some(stripped) = con_part.strip_prefix(" while the other side ") {
                        current_con = stripped.trim().to_string();
                    } else {
                        current_con = con_part.trim().to_string();
                    }
                } else if let Some(separator_idx) = content.find(" The other side ") {
                    // Handle "The other side" (capital T)
                    current_pro = content[..separator_idx].trim().to_string();
                    let con_part = &content[separator_idx..];
                    if let Some(stripped) = con_part.strip_prefix(" The other side argues that ") {
                        current_con = stripped.trim().to_string();
                    } else if let Some(stripped) = con_part.strip_prefix(" The other side sees ") {
                        current_con = stripped.trim().to_string();
                    } else if let Some(stripped) = con_part.strip_prefix(" The other side ") {
                        current_con = stripped.trim().to_string();
                    } else {
                        current_con = con_part.trim().to_string();
                    }
                }
            }
        }
    }

    // Save last dimension
    if in_dimension && !current_name.is_empty() {
        dimensions.push(Dimension {
            name: current_name.trim().to_string(),
            core_conflict: current_conflict.trim().to_string(),
            pro_argument: current_pro.trim().to_string(),
            con_argument: current_con.trim().to_string(),
        });
    }

    // Default if none found
    if dimensions.is_empty() && !response.trim().is_empty() {
        dimensions.push(Dimension {
            name: "General".to_string(),
            core_conflict: response.to_string(),
            pro_argument: "See full response".to_string(),
            con_argument: "See full response".to_string(),
        });
    }

    dimensions
}

/// Parse todos and insights from harvest response
fn parse_todos_insights(response: &str) -> (String, String) {
    let mut in_todos = false;
    let mut in_insights = false;
    let mut todos = String::new();
    let mut insights = String::new();

    for line in response.lines() {
        let line_lower = line.to_lowercase();
        if line_lower.contains("## to-do") || line_lower.contains("## todo") {
            in_todos = true;
            in_insights = false;
        } else if line_lower.contains("## key insights") || line_lower.contains("## insights") {
            in_insights = true;
            in_todos = false;
        } else if in_todos {
            todos.push_str(line);
            todos.push('\n');
        } else if in_insights {
            insights.push_str(line);
            insights.push('\n');
        }
    }

    (todos.trim().to_string(), insights.trim().to_string())
}

/// Check if user input is a confirmation (supports Chinese and English)
fn is_confirmation(input: &str) -> bool {
    let trimmed = input.trim().to_lowercase();
    matches!(
        trimmed.as_str(),
        "对" | "ok" | "好" | "确认" | "是" | "yes" | "y" | "确定"
            | "没问题" | "可以" | "行" | "嗯" | "对的"
    )
}

#[cfg(test)]
mod core_fact_parsing {
    use super::*;

    #[test]
    fn picks_up_clean_lines() {
        let s = "[案主 | 长期目标 | 投资人转产品创始人 | 2026-04-30]\n[案主 | 决策风格 | 重视保留可选性 | 2026-04-30]";
        let v = parse_core_facts(s);
        assert_eq!(v.len(), 2);
        assert_eq!(v[0].relation, "长期目标");
    }

    #[test]
    fn caps_at_three_facts() {
        let s = "[a | r | f | 2026-04-30]\n[b | r | f | 2026-04-30]\n[c | r | f | 2026-04-30]\n[d | r | f | 2026-04-30]";
        let v = parse_core_facts(s);
        assert_eq!(v.len(), 3);
    }

    #[test]
    fn tolerates_code_fence_and_bullets() {
        let s = "```\n- [案主 | 偏好 | 不接受 996 | 2026-04-30]\n* [案主 | 资源 | 前 X 公司高管 | 2026-04-30]\n```";
        let v = parse_core_facts(s);
        assert_eq!(v.len(), 2);
        assert_eq!(v[1].fact, "前 X 公司高管");
    }

    #[test]
    fn empty_when_no_facts() {
        assert!(parse_core_facts("").is_empty());
        assert!(parse_core_facts("没有可提取的身份层事实。").is_empty());
    }
}
