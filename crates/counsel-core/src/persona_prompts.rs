//! Public export stub for legacy private persona prompts.
//!
//! The source repository contains historical prompt experiments here. They are
//! intentionally excluded from the public export; runtime personas are loaded
//! from reviewed `skills/{slug}/` directories instead.

pub fn get_persona_prompt(_persona_id: &str) -> Option<String> {
    None
}

pub fn get_persona_name(_persona_id: &str) -> Option<String> {
    None
}
