//! Session state management

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Session state - tracks progress through the 8-step flow
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SessionState {
    pub project_id: String,
    pub session_id: String,
    pub raw_input: String,
    pub current_step: u8,
    pub defined: Option<String>,
    pub facts_qa: Option<String>,
    pub opinions: HashMap<String, String>,
    pub dimensions: Vec<super::Dimension>,
    pub selected_dimension_indices: Vec<usize>,  // User-selected dimensions for debate (max 3)
    pub debate_record: HashMap<String, String>,
    pub summary: Option<String>,
    pub harvest: Option<super::HarvestResult>,
}

impl SessionState {
    pub fn new(project_id: String, session_id: String, raw_input: String) -> Self {
        Self {
            project_id,
            session_id,
            raw_input,
            current_step: 0,
            ..Default::default()
        }
    }
}
