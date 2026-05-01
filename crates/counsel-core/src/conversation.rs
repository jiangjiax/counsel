//! Conversation storage - Store full dialogue for simulation mode

use serde::{Deserialize, Serialize};
use std::time::Instant;

/// A single turn in the conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationTurn {
    pub speaker: String,        // "Facilitator", "User (Auto)", "Steve Jobs", etc.
    pub content: String,
    pub timestamp_ms: u64,     // Time from session start
    pub tokens: Option<usize>,  // Token count if known
}

/// A step's conversation
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StepConversation {
    pub step: u8,
    pub step_name: String,
    pub start_time_ms: u64,
    pub end_time_ms: Option<u64>,
    pub turns: Vec<ConversationTurn>,
}

/// Full conversation log for a session
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ConversationLog {
    pub session_id: String,
    pub project_id: String,
    pub total_time_ms: u64,
    pub total_tokens: usize,
    pub step_conversations: Vec<StepConversation>,
}

impl ConversationLog {
    pub fn new(project_id: String, session_id: String) -> Self {
        Self {
            project_id,
            session_id,
            ..Default::default()
        }
    }

    /// Start a new step conversation
    pub fn start_step(&mut self, step: u8, step_name: String, start_time_ms: u64) {
        self.step_conversations.push(StepConversation {
            step,
            step_name,
            start_time_ms,
            end_time_ms: None,
            turns: Vec::new(),
        });
    }

    /// End the current step conversation
    pub fn end_step(&mut self, end_time_ms: u64) {
        if let Some(step) = self.step_conversations.last_mut() {
            step.end_time_ms = Some(end_time_ms);
        }
    }

    /// Add a turn to the current step
    pub fn add_turn(&mut self, speaker: String, content: String, timestamp_ms: u64, tokens: Option<usize>) {
        if let Some(step) = self.step_conversations.last_mut() {
            step.turns.push(ConversationTurn {
                speaker,
                content,
                timestamp_ms,
                tokens,
            });
        }
    }

    /// Update total stats
    pub fn finalize(&mut self, total_time_ms: u64, total_tokens: usize) {
        self.total_time_ms = total_time_ms;
        self.total_tokens = total_tokens;
    }

    /// Format as markdown
    pub fn to_markdown(&self) -> String {
        let mut md = String::new();

        // Header
        md.push_str("# Conversation Log\n\n");
        md.push_str(&format!(
            "**Total Time:** {:.1}s | **Total Tokens:** ~{}K\n\n",
            self.total_time_ms as f64 / 1000.0,
            self.total_tokens / 1000
        ));
        md.push_str("---\n\n");

        // Each step
        for step_conv in &self.step_conversations {
            let duration = step_conv.end_time_ms
                .map(|e| e - step_conv.start_time_ms)
                .unwrap_or(0);

            md.push_str(&format!(
                "## Step {}: {} ({}ms)\n\n",
                step_conv.step,
                step_conv.step_name,
                duration
            ));

            for turn in &step_conv.turns {
                let tokens_str = turn.tokens
                    .map(|t| format!("[~{} tokens]", t))
                    .unwrap_or_default();

                md.push_str(&format!(
                    "**{}** {}:\n> {}\n\n",
                    turn.speaker,
                    tokens_str,
                    turn.content.lines().collect::<Vec<_>>().join("\n> ")
                ));
            }

            md.push_str("---\n\n");
        }

        md
    }

    /// Save to a JSON string for storage
    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_default()
    }
}

/// Conversation context for generating auto responses
pub struct ConversationContext {
    pub project_id: String,
    pub session_id: String,
    pub step: u8,
    pub step_name: String,
    pub history: Vec<ConversationTurn>,
    pub session_start: Instant,
}

impl ConversationContext {
    pub fn new(project_id: String, session_id: String, step: u8, step_name: String) -> Self {
        Self {
            project_id,
            session_id,
            step,
            step_name,
            history: Vec::new(),
            session_start: Instant::now(),
        }
    }

    pub fn elapsed_ms(&self) -> u64 {
        self.session_start.elapsed().as_millis() as u64
    }

    /// Build a prompt for generating typical user response
    pub fn build_auto_response_prompt(&self, facilitator_question: &str) -> String {
        let mut prompt = String::from("You are simulating a typical user in a coaching session.\n\n");

        if !self.history.is_empty() {
            prompt.push_str("## Conversation History\n\n");
            for turn in &self.history {
                prompt.push_str(&format!("{}: {}\n", turn.speaker, turn.content));
            }
            prompt.push_str("\n");
        }

        prompt.push_str(&format!(
            "## Current Question from Facilitator\n\n{}\n\n",
            facilitator_question
        ));

        prompt.push_str(
            "## Your Task\nGenerate a natural, typical user response that:\n\
             - Answers the question thoughtfully\n\
             - Provides relevant information about their situation\n\
             - Is concise but meaningful (2-4 sentences)\n\
             - Feels authentic, not scripted\n\n\
             Respond ONLY with the user's response, no quotes or labels."
        );

        prompt
    }
}
