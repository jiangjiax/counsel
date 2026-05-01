//! 5-Layer Wisdom Persona Architecture
//!
//! Replaces the 3 disconnected persona systems with a unified registry
//! loaded from files under `skills/{slug}/`.

use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tracing::warn;

use crate::CoreError;

// ---------------------------------------------------------------------------
// Data Structures
// ---------------------------------------------------------------------------

/// A single wisdom persona with 5-layer knowledge architecture.
#[derive(Debug, Clone)]
pub struct WisdomPersona {
    pub slug: String,
    pub name: String,
    pub title: String,
    // 5 layers
    pub worldview: String,
    pub philosophy: String,
    pub values: String,
    pub methodology: String,
    pub situations: Vec<SituationCard>,
    // Voice
    pub voice: VoiceTexture,
    // Cadence bucket (terse/balanced/discursive) parsed from voice.md
    pub cadence: Cadence,
    // ----- Weaving layer (P13, additive 2026-04-27) -----
    // Per benchmark/PERSONA-WEAVING-ARCHITECTURE.md §3 + REALITY-CHECK gate. All fields
    // are Option<String>: empty for personas that haven't yet been woven (16/17 today).
    // When None, the prompt assembler falls through to the existing five-layer path
    // unchanged. When Some, the assembler can selectively pull phase-appropriate
    // material (see build_five_layer_prompt logic).
    pub lifeline_md: Option<String>,
    pub helping_signature_md: Option<String>,
    pub consistency_audit_md: Option<String>,
    pub lifeline_phases: Vec<LifelinePhase>,
    // Fallback: legacy ~25KB prompt from persona_prompts.rs
    pub legacy_prompt: Option<String>,
}

/// A single phase parsed from `lifeline.md`. Lightweight — full prose lives in
/// `lifeline_md`. This struct holds just the metadata needed for phase detection
/// from a case-of client's question (temporal anchor matching).
#[derive(Debug, Clone)]
pub struct LifelinePhase {
    pub phase_id: String,
    pub display_name: String,
    /// Inclusive start year of the phase, parsed from a `YYYY–YYYY` or
    /// `YYYY-YYYY` range in the lifeline.md heading. None when the heading
    /// doesn't carry a numeric range (e.g. "ongoing").
    pub start_year: Option<i32>,
    pub end_year: Option<i32>,
    /// Inclusive age range, e.g. "ages 5–18". None if not present.
    pub start_age: Option<i32>,
    pub end_age: Option<i32>,
}

/// A historical decision card with transferable pattern.
#[derive(Debug, Clone)]
pub struct SituationCard {
    pub id: String,
    pub title: String,
    pub situation: String,
    pub contradiction: String,
    pub reasoning: String,
    pub conclusion: String,
    pub abstract_form: String,
    pub pressure: PressureFingerprint,
}

/// 18-dimensional pressure vector (6 external + 5 internal + 3 structural).
#[derive(Debug, Clone, Default)]
pub struct PressureFingerprint {
    // External pressures (6)
    pub time: u8,
    pub resource: u8,
    pub survival: u8,
    pub competition: u8,
    pub social: u8,
    pub uncertainty: u8,
    // Internal tensions (5)
    pub identity: u8,
    pub emotional: u8,
    pub moral: u8,
    pub face: u8,
    pub isolation: u8,
    // Decision structure (3)
    pub irreversibility: u8,
    pub info_completeness: u8,
    pub cost_asymmetry: String,
}

/// Voice texture prevents persona blur and third-person escape.
#[derive(Debug, Clone, Default)]
pub struct VoiceTexture {
    pub first_person_markers: Vec<String>,
    pub metaphor_domains: Vec<String>,
    pub sentence_patterns: Vec<String>,
    pub forbidden_patterns: Vec<String>,
}

/// 2026-04-25 — Cadence bucket parsed from voice.md (`## Cadence · {bucket}`).
/// Drives per-step max_tokens caps so terse personas (Mao, PG, Jobs, Musk,
/// 倪海厦) stay short and discursive ones (金庸, 刘震云, 唐绮阳) get room
/// to develop a narrative arc.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cadence {
    Terse,
    Balanced,
    Discursive,
    /// No `## Cadence` section found — caller should use step's default cap.
    Unset,
}

impl Default for Cadence {
    fn default() -> Self {
        Cadence::Unset
    }
}

impl Cadence {
    /// Suggested max_tokens for Step 3 fact-finding question (run_facts).
    ///
    /// Step 3 prompt itself caps to 2-5 sentences regardless of cadence —
    /// terse personas keep things tight, discursive get a bit more room
    /// for their 1-句 anchor at end. All values lower than Step 4.
    pub fn max_tokens_step3(self) -> u32 {
        match self {
            Cadence::Terse => 200,
            Cadence::Balanced => 250,
            Cadence::Discursive => 300,
            Cadence::Unset => 250,
        }
    }
    /// Suggested max_tokens for Step 4 (opinions).
    ///
    /// 2026-04-26 v7: prompt char cap reduced 800→500 (Michael "我不喜欢长输出
    /// — prompt 限字数 + token cap 配套缩"). Token caps now align: 500 chars
    /// ≈ 280 tokens, give ~1.4-1.8x headroom for graceful-stop. Tighter than
    /// v6 across the board.
    pub fn max_tokens_step4(self) -> u32 {
        // 2026-04-26 v8: prompt char cap 500 → 300 hard, with explicit "禁止
        // 废话/分支/自我介绍" instructions. Token caps tightened to match —
        // ~200-280 char target → ~150 tokens; cap = ~250 tokens with margin.
        match self {
            Cadence::Terse => 230,       // target 150-230 chars
            Cadence::Balanced => 280,    // target 200-280 chars
            Cadence::Discursive => 360,  // target 260-340 chars
            Cadence::Unset => 280,
        }
    }
    /// Suggested max_tokens for Step 6 round-1 debate. 2026-04-26 v7: tightened
    /// in proportion to step 4 reduction.
    pub fn max_tokens_step6(self) -> u32 {
        match self {
            Cadence::Terse => 130,       // was 200, target ~80 chars
            Cadence::Balanced => 280,    // was 450, target ~180 chars
            Cadence::Discursive => 500,  // was 800, target ~300 chars
            Cadence::Unset => 350,       // was 700
        }
    }
    /// Suggested max_tokens for Step 6 round-2 中立方 reactions.
    pub fn max_tokens_step6_r2(self) -> u32 {
        match self {
            Cadence::Terse => 150,       // was 220
            Cadence::Balanced => 320,    // was 500
            Cadence::Discursive => 550,  // was 850
            Cadence::Unset => 400,       // was 800
        }
    }
    /// Suggested max_tokens for Step 8 (harvest_eval).
    pub fn max_tokens_step8(self) -> u32 {
        match self {
            Cadence::Terse => 130,       // was 200
            Cadence::Balanced => 250,    // was 400
            Cadence::Discursive => 450,  // was 700
            Cadence::Unset => 300,       // was 450
        }
    }
    /// Suggested max_tokens for the Step 3 sequential refine endpoint
    /// (POST /api/refine-question). Outputs a JSON wrapper around a single
    /// refined question or skip — tighter than Step 3 itself.
    pub fn max_tokens_refine(self) -> u32 {
        match self {
            Cadence::Terse => 150,
            Cadence::Balanced => 200,
            Cadence::Discursive => 250,
            Cadence::Unset => 200,
        }
    }
}

/// Minimal JSON metadata for a persona directory.
#[derive(Debug, Deserialize, Serialize)]
struct PersonaMeta {
    name: String,
    title: String,
}

// ---------------------------------------------------------------------------
// PersonaRegistry
// ---------------------------------------------------------------------------

/// Registry of all loaded wisdom personas.
#[derive(Debug, Clone)]
pub struct PersonaRegistry {
    personas: Vec<WisdomPersona>,
}

impl PersonaRegistry {
    /// Create a registry from a pre-built list (for testing or in-memory use).
    pub fn from_personas(personas: Vec<WisdomPersona>) -> Self {
        Self { personas }
    }

    /// Create a minimal test registry with N stub personas.
    pub fn test_registry(n: usize) -> Self {
        let names = [
            ("test-persona-1", "Test Persona 1", "Advisor 1"),
            ("test-persona-2", "Test Persona 2", "Advisor 2"),
            ("test-persona-3", "Test Persona 3", "Advisor 3"),
            ("test-persona-4", "Test Persona 4", "Advisor 4"),
            ("test-persona-5", "Test Persona 5", "Advisor 5"),
            ("test-persona-6", "Test Persona 6", "Advisor 6"),
        ];
        let personas = names.iter().take(n).map(|(slug, name, title)| {
            WisdomPersona {
                slug: slug.to_string(),
                name: name.to_string(),
                title: title.to_string(),
                worldview: String::new(),
                philosophy: String::new(),
                values: String::new(),
                methodology: String::new(),
                situations: Vec::new(),
                voice: VoiceTexture::default(),
                cadence: Cadence::Unset,
                lifeline_md: None,
                helping_signature_md: None,
                consistency_audit_md: None,
                lifeline_phases: Vec::new(),
                legacy_prompt: Some(format!("You are {}. You are a {}", name, title)),
            }
        }).collect();
        Self { personas }
    }

    /// Load all personas from subdirectories of `skills_dir`.
    ///
    /// Directories prefixed with `_` are skipped (reserved for non-persona
    /// content like `_sources/`). Honors the `COUNSEL_PERSONAS` env var: when
    /// set to a comma-separated list of slugs, only those personas are loaded
    /// (useful for single-persona pilot testing during Phase 5 content work).
    pub fn load(skills_dir: &Path) -> Result<Self, CoreError> {
        let mut personas = Vec::new();

        if !skills_dir.exists() {
            warn!("Skills directory does not exist: {}", skills_dir.display());
            return Ok(Self { personas });
        }

        let filter: Option<Vec<String>> = std::env::var("COUNSEL_PERSONAS")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.split(',').map(|p| p.trim().to_string()).filter(|p| !p.is_empty()).collect());

        let mut entries: Vec<PathBuf> = std::fs::read_dir(skills_dir)?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| !n.starts_with('_'))
                    .unwrap_or(false)
            })
            .collect();
        entries.sort();

        for dir in entries {
            if let Some(ref allow) = filter {
                let slug = dir.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if !allow.iter().any(|s| s == slug) {
                    continue;
                }
            }
            match load_persona(&dir) {
                Ok(persona) => personas.push(persona),
                Err(e) => warn!("Failed to load persona from {}: {}", dir.display(), e),
            }
        }

        if let Some(ref allow) = filter {
            tracing::info!("PersonaRegistry loaded {} persona(s) filtered by COUNSEL_PERSONAS={}", personas.len(), allow.join(","));
        }

        Ok(Self { personas })
    }

    /// Get all personas.
    pub fn all(&self) -> &[WisdomPersona] {
        &self.personas
    }

    /// Get persona by slug.
    pub fn get(&self, slug: &str) -> Option<&WisdomPersona> {
        let slug = normalize_persona_slug(slug);
        self.personas.iter().find(|p| p.slug == slug)
    }

    /// Phase 7.1 — return only the personas whose slugs appear in `slugs`,
    /// preserving the order given by the caller (so seat ordering in the
    /// frontend reflects the case-owner's pick order). Unknown slugs are
    /// silently dropped. Empty input returns an empty Vec — callers that want
    /// fall-back-to-all should check `slugs.is_empty()` before calling.
    pub fn filtered(&self, slugs: &[String]) -> Vec<&WisdomPersona> {
        slugs
            .iter()
            .filter_map(|s| {
                let normalized = normalize_persona_slug(s);
                self.personas.iter().find(|p| p.slug == normalized)
            })
            .collect()
    }

    /// Get personas as tuples for backward compatibility with step code.
    pub fn as_tuples(&self) -> Vec<(String, String, String, String)> {
        self.personas
            .iter()
            .map(|p| {
                (
                    p.slug.clone(),
                    p.name.clone(),
                    p.title.clone(),
                    p.short_description(),
                )
            })
            .collect()
    }

    /// Number of loaded personas.
    pub fn len(&self) -> usize {
        self.personas.len()
    }

    /// Whether the registry is empty.
    pub fn is_empty(&self) -> bool {
        self.personas.is_empty()
    }
}

fn normalize_persona_slug(slug: &str) -> &str {
    match slug {
        // Legacy frontend aliases stored in localStorage / IndexedDB before
        // Phase 7.1 switched server-facing persona IDs to kebab-case.
        "mao" => "mao-zedong",
        "pg" => "paul-graham",
        "jobs" => "steve-jobs",
        "brucelee" => "bruce-lee",
        "kk" => "kevin-kelly",
        other => other,
    }
}

// ---------------------------------------------------------------------------
// WisdomPersona — prompt assembly
// ---------------------------------------------------------------------------

impl WisdomPersona {
    /// Build the full system prompt for this persona.
    ///
    /// Priority: 5-layer prompt (if layers have content) → legacy prompt → basic description.
    /// If `user_fingerprint` is provided and situation cards exist, includes top-3 matching cards.
    pub fn build_system_prompt(
        &self,
        user_situation: &str,
        user_fingerprint: Option<&PressureFingerprint>,
    ) -> String {
        // Check if we have meaningful layer content (more than stub)
        let has_layers = self.worldview.len() > 50
            || self.philosophy.len() > 50
            || self.values.len() > 50;

        if has_layers {
            self.build_five_layer_prompt(user_situation, user_fingerprint)
        } else if let Some(ref legacy) = self.legacy_prompt {
            legacy.clone()
        } else {
            format!("You are {}. {}.", self.name, self.title)
        }
    }

    fn build_five_layer_prompt(
        &self,
        user_situation: &str,
        user_fingerprint: Option<&PressureFingerprint>,
    ) -> String {
        let mut prompt = format!("你是{}。以下是你的核心认知：\n\n", self.name);

        if !self.worldview.is_empty() {
            prompt.push_str("## 世界观\n");
            prompt.push_str(&self.worldview);
            prompt.push_str("\n\n");
        }
        if !self.philosophy.is_empty() {
            prompt.push_str("## 人生观\n");
            prompt.push_str(&self.philosophy);
            prompt.push_str("\n\n");
        }
        if !self.values.is_empty() {
            prompt.push_str("## 价值观\n");
            prompt.push_str(&self.values);
            prompt.push_str("\n\n");
        }
        if !self.methodology.is_empty() {
            prompt.push_str("## 思考方式\n");
            prompt.push_str(&self.methodology);
            prompt.push_str("\n\n");
        }

        // ----- Weaving layer (additive, P13) -----
        // Lifeline / helping signature / consistency audit are appended only when
        // the persona has them on disk. This keeps non-woven personas (16/17 today)
        // emitting exactly the same prompt as before this change.
        if let Some(ref lifeline) = self.lifeline_md {
            // If we can pin the user's question to a specific phase via a year
            // anchor in `user_situation`, lead with that phase's prose only;
            // otherwise include the full lifeline so the LLM can self-orient.
            let phase = detect_phase_from_text(&self.lifeline_phases, user_situation);
            prompt.push_str("## 人生轨迹 / Lifeline\n");
            if let Some(p) = phase {
                prompt.push_str(&format!(
                    "（案主提到的时间锚点匹配 **{}**；优先用这个 phase 的框架回答）\n\n",
                    p.display_name
                ));
                if let Some(section) = extract_phase_section(lifeline, &p.display_name) {
                    prompt.push_str(&section);
                    prompt.push_str("\n\n");
                } else {
                    prompt.push_str(lifeline);
                    prompt.push_str("\n\n");
                }
            } else {
                prompt.push_str(lifeline);
                prompt.push_str("\n\n");
            }
        }

        if let Some(ref helping) = self.helping_signature_md {
            // Helping signature documents how the persona advises *others* —
            // distinct from how they make their own decisions. case-of inquiries
            // are advisory by default, so always include when present.
            prompt.push_str("## 助人风格 / How I help others\n");
            prompt.push_str(helping);
            prompt.push_str("\n\n");
        }

        if let Some(ref audit) = self.consistency_audit_md {
            prompt.push_str("## 言行一致性 / Consistency Audit\n");
            prompt.push_str(audit);
            prompt.push_str("\n\n");
        }

        // Situation cards — match top-3 by fingerprint if available
        if !self.situations.is_empty() {
            let matched = match user_fingerprint {
                Some(fp) => top_matching_cards(&self.situations, fp, 3),
                None => self.situations.iter().take(3).collect(),
            };

            if !matched.is_empty() {
                prompt.push_str("## 类似情境（你曾面对过的）\n");
                for card in &matched {
                    prompt.push_str(&format!("### {}\n", card.title));
                    prompt.push_str(&format!("**情境**: {}\n", card.situation));
                    prompt.push_str(&format!("**核心矛盾**: {}\n", card.contradiction));
                    prompt.push_str(&format!("**推理**: {}\n", card.reasoning));
                    prompt.push_str(&format!("**结论**: {}\n", card.conclusion));
                    prompt.push_str(&format!("**可迁移模式**: {}\n\n", card.abstract_form));
                }
            }
        }

        // Voice texture
        if !self.voice.is_empty() {
            prompt.push_str("## 说话方式\n");
            if !self.voice.first_person_markers.is_empty() {
                prompt.push_str(&format!(
                    "- 用第一人称（{}）\n",
                    self.voice.first_person_markers.join("、")
                ));
            }
            if !self.voice.metaphor_domains.is_empty() {
                prompt.push_str(&format!(
                    "- 比喻领域：{}\n",
                    self.voice.metaphor_domains.join("、")
                ));
            }
            if !self.voice.sentence_patterns.is_empty() {
                prompt.push_str(&format!(
                    "- 句式：{}\n",
                    self.voice.sentence_patterns.join("；")
                ));
            }
            if !self.voice.forbidden_patterns.is_empty() {
                prompt.push_str(&format!(
                    "- 禁止：{}\n",
                    self.voice.forbidden_patterns.join("；")
                ));
            }
            prompt.push('\n');
        }

        // Hard response constraints (added 2026-04-26 from benchmark v3-final findings).
        // Without these, English-bias personas (PG/Jobs/Musk/Bruce-Lee) tend to reply
        // in English even when 案主 asks in Chinese — Stage 4 benchmark showed
        // ~50% English compliance pre-fix vs ~95% post-fix.
        prompt.push_str("## 回应硬约束（不能违反）\n");
        prompt.push_str("1. **语言匹配**：必须使用案主提问的语言。中文问 → 100% 中文回应；英文问 → 英文回应。即使你 persona 是英文母语人物（如 PG / Jobs / Musk / Bruce Lee），也必须用中文表达所有思考和决策。英文 voice signature 可作为 quote 嵌入但需中文翻译。\n");
        prompt.push_str("2. **第一人称**：永远用「我」/「我当年」开口；不能说「作为 X 他认为」「Musk would say」等第三人称自称。\n");
        prompt.push_str("3. **具体而非抽象**：至少 2-3 个具体历史锚（年份/地名/人名）。「我在 1955 年回国那会儿……」远比「从长期看……」有力。\n");
        prompt.push('\n');

        prompt
    }

    /// Short description for API listing and fallback.
    pub fn short_description(&self) -> String {
        if !self.worldview.is_empty() {
            // First sentence of worldview
            let first = self.worldview.split('.').next().unwrap_or(&self.worldview);
            if first.len() > 10 {
                return format!("You are {}. {}.", self.name, first.trim());
            }
        }
        format!("You are {}. {}.", self.name, self.title)
    }
}

// ---------------------------------------------------------------------------
// PressureFingerprint — cosine similarity
// ---------------------------------------------------------------------------

impl PressureFingerprint {
    /// Convert to a 14-element f64 vector (cost_asymmetry mapped: symmetric=0, upside=1, downside=-1).
    pub fn to_vec(&self) -> Vec<f64> {
        let asym = match self.cost_asymmetry.as_str() {
            "upside" | "upside_high" => 1.0,
            "downside" | "downside_high" => -1.0,
            "extreme" => 2.0,
            _ => 0.0,
        };
        vec![
            self.time as f64,
            self.resource as f64,
            self.survival as f64,
            self.competition as f64,
            self.social as f64,
            self.uncertainty as f64,
            self.identity as f64,
            self.emotional as f64,
            self.moral as f64,
            self.face as f64,
            self.isolation as f64,
            self.irreversibility as f64,
            self.info_completeness as f64,
            asym,
        ]
    }

    /// Cosine similarity between two fingerprints (0.0 to 1.0).
    pub fn similarity(&self, other: &PressureFingerprint) -> f64 {
        let a = self.to_vec();
        let b = other.to_vec();
        let dot: f64 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
        let mag_a: f64 = a.iter().map(|x| x * x).sum::<f64>().sqrt();
        let mag_b: f64 = b.iter().map(|x| x * x).sum::<f64>().sqrt();
        if mag_a == 0.0 || mag_b == 0.0 {
            return 0.0;
        }
        (dot / (mag_a * mag_b)).clamp(0.0, 1.0)
    }
}

impl VoiceTexture {
    fn is_empty(&self) -> bool {
        self.first_person_markers.is_empty()
            && self.metaphor_domains.is_empty()
            && self.sentence_patterns.is_empty()
            && self.forbidden_patterns.is_empty()
    }
}

// ---------------------------------------------------------------------------
// File loading
// ---------------------------------------------------------------------------

fn load_persona(dir: &Path) -> Result<WisdomPersona, CoreError> {
    let slug = dir
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| CoreError::Step("Invalid persona directory name".into()))?
        .to_string();

    // Read persona.json
    let meta_path = dir.join("persona.json");
    let meta: PersonaMeta = if meta_path.exists() {
        let data = std::fs::read_to_string(&meta_path)?;
        serde_json::from_str(&data)?
    } else {
        // Derive from slug
        PersonaMeta {
            name: slug.replace('-', " "),
            title: String::new(),
        }
    };

    // Read theory.md → parse 5 layers + (optional) consistency audit section
    let theory_path = dir.join("theory.md");
    let (worldview, philosophy, values, methodology, consistency_audit_inline) = if theory_path.exists() {
        let content = std::fs::read_to_string(&theory_path)?;
        let (wv, ph, val, meth) = parse_theory(&content);
        let audit = parse_consistency_audit_section(&content);
        (wv, ph, val, meth, audit)
    } else {
        (String::new(), String::new(), String::new(), String::new(), None)
    };

    // Standalone consistency-audit.md (P11 script output) wins over the inline
    // section when both exist — script runs latest.
    let consistency_audit_md = read_optional(&dir.join("consistency-audit.md"))
        .or(consistency_audit_inline);

    // Read voice.md → parse voice texture + cadence
    let voice_path = dir.join("voice.md");
    let (voice, cadence) = if voice_path.exists() {
        let content = std::fs::read_to_string(&voice_path)?;
        (parse_voice(&content), parse_cadence(&content))
    } else {
        (VoiceTexture::default(), Cadence::Unset)
    };

    // Read situations/*.md
    let situations_dir = dir.join("situations");
    let situations = if situations_dir.exists() && situations_dir.is_dir() {
        load_situation_cards(&situations_dir)?
    } else {
        Vec::new()
    };

    // Read optional weaving-layer files (P13 additive load)
    let lifeline_md = read_optional(&dir.join("lifeline.md"));
    let helping_signature_md = read_optional(&dir.join("helping_signature.md"));
    let lifeline_phases = lifeline_md
        .as_deref()
        .map(parse_lifeline_phases)
        .unwrap_or_default();

    // Try to get legacy prompt
    let legacy_prompt = crate::persona_prompts::get_persona_prompt(&slug);

    Ok(WisdomPersona {
        slug,
        name: meta.name,
        title: meta.title,
        worldview,
        philosophy,
        values,
        methodology,
        situations,
        voice,
        cadence,
        lifeline_md,
        helping_signature_md,
        consistency_audit_md,
        lifeline_phases,
        legacy_prompt,
    })
}

/// Read a file's contents to a String, returning None if absent or unreadable.
fn read_optional(path: &Path) -> Option<String> {
    if !path.exists() {
        return None;
    }
    match std::fs::read_to_string(path) {
        Ok(s) => Some(s),
        Err(e) => {
            warn!("Failed to read optional file {}: {}", path.display(), e);
            None
        }
    }
}

/// Pull the `## 言行一致性 / Consistency Audit` section out of a theory.md
/// blob. Returns the section body (without the `##` heading) when present, else
/// None. The section may be titled in either Chinese or English; keyword match
/// is case-insensitive on the English half.
fn parse_consistency_audit_section(content: &str) -> Option<String> {
    let sections = split_sections(content);
    let body = find_section(&sections, &[
        "言行一致性",
        "Consistency Audit",
        "consistency audit",
    ]);
    if body.trim().is_empty() {
        None
    } else {
        Some(body)
    }
}

/// Parse `lifeline.md` into a list of `LifelinePhase` records. Looks for `## ...`
/// headings whose line carries a year range (`YYYY–YYYY` or `YYYY-YYYY`) and
/// optionally an age range (`ages X–Y`). Non-conforming `##` headings (intro,
/// "Why this file exists", etc) are skipped. Tolerates en-dash, em-dash, and
/// hyphen-minus.
fn parse_lifeline_phases(content: &str) -> Vec<LifelinePhase> {
    let mut out = Vec::new();
    let lines: Vec<&str> = content.lines().collect();
    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if !trimmed.starts_with("## ") {
            continue;
        }
        // Skip headings that don't carry a numeric year (intros, blockquotes, etc).
        let years = extract_year_range(trimmed);
        if years.is_none() {
            continue;
        }
        let display_name = trimmed.trim_start_matches("## ").trim().to_string();
        let (start_year, end_year) = years.unwrap();
        let ages = extract_age_range(trimmed);
        let phase_id = lookahead_phase_id(&lines, i);
        out.push(LifelinePhase {
            phase_id: phase_id.unwrap_or_else(|| {
                format!("phase-{}-{}", out.len() + 1,
                        slugify(&display_name).chars().take(40).collect::<String>())
            }),
            display_name,
            start_year: Some(start_year),
            end_year,
            start_age: ages.as_ref().and_then(|(s, _)| Some(*s)),
            end_age: ages.as_ref().and_then(|(_, e)| *e),
        });
    }
    out
}

/// Look at the few lines after a `## phase header` for a backtick-quoted
/// `phase-foo-bar` id (matches the bruce-lee/lifeline.md convention where the
/// id appears under the heading). Returns the id without backticks.
fn lookahead_phase_id(lines: &[&str], heading_idx: usize) -> Option<String> {
    let end = (heading_idx + 6).min(lines.len());
    for line in &lines[heading_idx + 1..end] {
        if let Some(start) = line.find('`') {
            let rest = &line[start + 1..];
            if let Some(end_q) = rest.find('`') {
                let candidate = &rest[..end_q];
                if candidate.starts_with("phase-") && candidate.len() <= 80 {
                    return Some(candidate.to_string());
                }
            }
        }
    }
    None
}

/// Extract a (start, Option<end>) year tuple from a heading line that looks
/// like `## ... · 1959–1964 · ages 18–23` or `## ... 1971–present`. Returns
/// None when no 4-digit year is found.
fn extract_year_range(line: &str) -> Option<(i32, Option<i32>)> {
    // Replace en-dash / em-dash / hyphen with a sentinel to simplify regex-free parse.
    let norm: String = line
        .chars()
        .map(|c| if c == '–' || c == '—' { '-' } else { c })
        .collect();
    let bytes = norm.as_bytes();
    let mut years: Vec<i32> = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if (bytes[i] as char).is_ascii_digit() {
            let mut j = i;
            while j < bytes.len() && (bytes[j] as char).is_ascii_digit() {
                j += 1;
            }
            if j - i == 4 {
                if let Ok(y) = norm[i..j].parse::<i32>() {
                    if (1700..=2200).contains(&y) {
                        years.push(y);
                    }
                }
            }
            i = j;
        } else {
            i += 1;
        }
    }
    if years.is_empty() {
        return None;
    }
    let start = years[0];
    let end = years.get(1).copied();
    Some((start, end))
}

/// Extract `ages X–Y` from a heading line.
fn extract_age_range(line: &str) -> Option<(i32, Option<i32>)> {
    let norm: String = line
        .chars()
        .map(|c| if c == '–' || c == '—' { '-' } else { c })
        .collect();
    let lower = norm.to_lowercase();
    let idx = lower.find("age")?;
    let after = &norm[idx..];
    let bytes = after.as_bytes();
    let mut ages: Vec<i32> = Vec::new();
    let mut i = 0;
    while i < bytes.len() && ages.len() < 2 {
        if (bytes[i] as char).is_ascii_digit() {
            let mut j = i;
            while j < bytes.len() && (bytes[j] as char).is_ascii_digit() {
                j += 1;
            }
            if let Ok(a) = after[i..j].parse::<i32>() {
                if (0..=120).contains(&a) {
                    ages.push(a);
                }
            }
            i = j;
        } else {
            i += 1;
        }
    }
    if ages.is_empty() {
        return None;
    }
    Some((ages[0], ages.get(1).copied()))
}

/// Lowercase + ascii-only slug (for fallback phase ids).
fn slugify(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

/// Try to pin a user's question to a single LifelinePhase by scanning the text
/// for year anchors (e.g. "1968", "1965 年") that fall inside a phase's range.
/// Returns the first matching phase, or None if no anchor is found / no phase
/// claims the year. Conservative on purpose — we'd rather show the full
/// lifeline than misroute when ambiguous.
fn detect_phase_from_text<'a>(
    phases: &'a [LifelinePhase],
    text: &str,
) -> Option<&'a LifelinePhase> {
    if phases.is_empty() {
        return None;
    }
    let years = collect_years(text);
    if years.is_empty() {
        return None;
    }
    for y in &years {
        for phase in phases {
            if phase_contains_year(phase, *y) {
                return Some(phase);
            }
        }
    }
    None
}

/// Collect 4-digit years (1700–2200) from arbitrary text.
fn collect_years(text: &str) -> Vec<i32> {
    let bytes = text.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if (bytes[i] as char).is_ascii_digit() {
            let mut j = i;
            while j < bytes.len() && (bytes[j] as char).is_ascii_digit() {
                j += 1;
            }
            if j - i == 4 {
                if let Ok(y) = text[i..j].parse::<i32>() {
                    if (1700..=2200).contains(&y) {
                        out.push(y);
                    }
                }
            }
            i = j.max(i + 1);
        } else {
            i += 1;
        }
    }
    out
}

fn phase_contains_year(phase: &LifelinePhase, year: i32) -> bool {
    match (phase.start_year, phase.end_year) {
        (Some(s), Some(e)) => year >= s && year <= e,
        (Some(s), None) => year >= s, // open-ended ("present")
        _ => false,
    }
}

/// Slice a single `## ... display_name ...` section out of a lifeline.md blob,
/// stopping at the next `## ` heading. Returns None when the heading is not
/// found verbatim (we don't fuzzy-match — caller falls back to full lifeline).
fn extract_phase_section(lifeline_md: &str, display_name: &str) -> Option<String> {
    let target = format!("## {}", display_name);
    let mut lines = lifeline_md.lines();
    let mut buf = String::new();
    let mut in_target = false;
    for line in lines.by_ref() {
        if !in_target {
            if line.trim() == target.trim() {
                in_target = true;
                buf.push_str(line);
                buf.push('\n');
            }
        } else if line.starts_with("## ") {
            break;
        } else {
            buf.push_str(line);
            buf.push('\n');
        }
    }
    if buf.is_empty() {
        None
    } else {
        Some(buf.trim_end().to_string())
    }
}

/// Parse the `## Cadence · {bucket}` heading from voice.md content.
/// Matches `terse` / `balanced` / `discursive` (case-insensitive). Returns
/// Cadence::Unset if no such heading found.
fn parse_cadence(content: &str) -> Cadence {
    for line in content.lines() {
        let l = line.trim();
        if !l.starts_with("##") {
            continue;
        }
        let lower = l.to_lowercase();
        if !lower.contains("cadence") {
            continue;
        }
        if lower.contains("terse") {
            return Cadence::Terse;
        }
        if lower.contains("balanced") {
            return Cadence::Balanced;
        }
        if lower.contains("discursive") {
            return Cadence::Discursive;
        }
    }
    Cadence::Unset
}

// ---------------------------------------------------------------------------
// Markdown section parsing
// ---------------------------------------------------------------------------

/// Parse theory.md into 5 layers by ## section headers.
fn parse_theory(content: &str) -> (String, String, String, String) {
    let sections = split_sections(content);
    let worldview = find_section(&sections, &["世界观", "Worldview"]);
    let philosophy = find_section(&sections, &["人生观", "Life Philosophy"]);
    let values = find_section(&sections, &["价值观", "Values"]);
    let methodology = find_section(&sections, &["方法论", "Methodology", "思考方式"]);
    (worldview, philosophy, values, methodology)
}

/// Parse voice.md into VoiceTexture.
fn parse_voice(content: &str) -> VoiceTexture {
    let sections = split_sections(content);
    VoiceTexture {
        first_person_markers: parse_list_section(&sections, &["First-Person Markers", "第一人称"]),
        metaphor_domains: parse_list_section(&sections, &["Metaphor Domains", "比喻领域"]),
        sentence_patterns: parse_list_section(&sections, &["Sentence Patterns", "句式"]),
        forbidden_patterns: parse_list_section(&sections, &["Forbidden Patterns", "禁止模式"]),
    }
}

/// Parse a single situation card from markdown.
fn parse_situation_card(content: &str, id: &str) -> SituationCard {
    let sections = split_sections(content);

    // Title from first # line
    let title = content
        .lines()
        .find(|l| l.starts_with("# "))
        .map(|l| l.trim_start_matches("# ").trim().to_string())
        .unwrap_or_else(|| id.to_string());

    let situation = find_section(&sections, &["Situation", "情境"]);
    let contradiction = find_section(&sections, &["Contradiction", "矛盾"]);
    let reasoning = find_section(&sections, &["Reasoning", "推理"]);
    let conclusion = find_section(&sections, &["Conclusion", "结论"]);
    let abstract_form = find_section(&sections, &["Abstract Form", "抽象形式", "可迁移模式"]);
    let pressure = parse_pressure_section(&sections);

    SituationCard {
        id: id.to_string(),
        title,
        situation,
        contradiction,
        reasoning,
        conclusion,
        abstract_form,
        pressure,
    }
}

fn load_situation_cards(dir: &Path) -> Result<Vec<SituationCard>, CoreError> {
    let mut cards = Vec::new();
    let mut entries: Vec<PathBuf> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map(|e| e == "md").unwrap_or(false))
        .collect();
    entries.sort();

    for path in entries {
        let id = path
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        let content = std::fs::read_to_string(&path)?;
        cards.push(parse_situation_card(&content, &id));
    }

    Ok(cards)
}

// ---------------------------------------------------------------------------
// Section splitting helpers
// ---------------------------------------------------------------------------

/// Split markdown content by ## headers into (header, body) pairs.
fn split_sections(content: &str) -> Vec<(String, String)> {
    let mut sections = Vec::new();
    let mut current_header = String::new();
    let mut current_body = String::new();

    for line in content.lines() {
        if line.starts_with("## ") {
            if !current_header.is_empty() || !current_body.is_empty() {
                sections.push((current_header.clone(), current_body.trim().to_string()));
            }
            current_header = line.trim_start_matches("## ").trim().to_string();
            current_body.clear();
        } else {
            current_body.push_str(line);
            current_body.push('\n');
        }
    }
    if !current_header.is_empty() || !current_body.is_empty() {
        sections.push((current_header, current_body.trim().to_string()));
    }

    sections
}

/// Find a section whose header contains any of the given keywords.
fn find_section(sections: &[(String, String)], keywords: &[&str]) -> String {
    for (header, body) in sections {
        for kw in keywords {
            if header.contains(kw) {
                return body.clone();
            }
        }
    }
    String::new()
}

/// Parse a section that contains comma-separated or line-separated items.
fn parse_list_section(sections: &[(String, String)], keywords: &[&str]) -> Vec<String> {
    let body = find_section(sections, keywords);
    if body.is_empty() {
        return Vec::new();
    }
    // Try comma-separated first, then line-separated
    let items: Vec<String> = if body.contains(',') || body.contains('、') {
        body.split(|c| c == ',' || c == '、')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    } else {
        body.lines()
            .map(|l| l.trim().trim_start_matches("- ").trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    };
    items
}

/// Parse the Pressure section into a PressureFingerprint.
fn parse_pressure_section(sections: &[(String, String)]) -> PressureFingerprint {
    let body = find_section(sections, &["Pressure", "压力指纹"]);
    if body.is_empty() {
        return PressureFingerprint::default();
    }

    let mut fp = PressureFingerprint::default();
    for line in body.lines() {
        let line = line.trim();
        if let Some((key, val)) = line.split_once(':') {
            let key = key.trim();
            let val = val.trim();
            match key {
                "time" | "time_pressure" => fp.time = val.parse().unwrap_or(0),
                "resource" | "resource_pressure" => fp.resource = val.parse().unwrap_or(0),
                "survival" | "survival_pressure" => fp.survival = val.parse().unwrap_or(0),
                "competition" | "competition_pressure" => {
                    fp.competition = val.parse().unwrap_or(0)
                }
                "social" | "social_pressure" => fp.social = val.parse().unwrap_or(0),
                "uncertainty" => fp.uncertainty = val.parse().unwrap_or(0),
                "identity" | "identity_pressure" => fp.identity = val.parse().unwrap_or(0),
                "emotional" | "emotional_pressure" => fp.emotional = val.parse().unwrap_or(0),
                "moral" | "moral_pressure" => fp.moral = val.parse().unwrap_or(0),
                "face" | "face_pressure" => fp.face = val.parse().unwrap_or(0),
                "isolation" | "isolation_pressure" => fp.isolation = val.parse().unwrap_or(0),
                "irreversibility" => fp.irreversibility = val.parse().unwrap_or(0),
                "info_completeness" => fp.info_completeness = val.parse().unwrap_or(0),
                "cost_asymmetry" => fp.cost_asymmetry = val.to_string(),
                _ => {}
            }
        }
    }
    fp
}

// ---------------------------------------------------------------------------
// RAG: top-N matching situation cards by fingerprint similarity
// ---------------------------------------------------------------------------

fn top_matching_cards<'a>(
    cards: &'a [SituationCard],
    query: &PressureFingerprint,
    n: usize,
) -> Vec<&'a SituationCard> {
    let mut scored: Vec<(&SituationCard, f64)> = cards
        .iter()
        .map(|c| (c, c.pressure.similarity(query)))
        .collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.into_iter().take(n).map(|(c, _)| c).collect()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_parse_theory() {
        let content = r#"# Mao Zedong Theory

## 世界观 (Worldview)
矛盾是事物发展的根本动力。一切事物中都包含矛盾，关键是找到主要矛盾。

## 人生观 (Life Philosophy)
实践出真知。没有调查就没有发言权。

## 价值观 (Values)
为人民服务。群众路线。自力更生。

## 方法论 (Methodology)
矛盾分析法：在复杂局面中找到主要矛盾和矛盾的主要方面。
"#;
        let (wv, ph, val, meth) = parse_theory(content);
        assert!(wv.contains("矛盾是事物发展"));
        assert!(ph.contains("实践出真知"));
        assert!(val.contains("为人民服务"));
        assert!(meth.contains("矛盾分析法"));
    }

    #[test]
    fn test_parse_voice() {
        let content = r#"## First-Person Markers
我们、同志、斗争
## Metaphor Domains
territory、peasant、base area
## Sentence Patterns
Parallel structure: 不是X而是Y
## Forbidden Patterns
作为X他认为；X可能会说
"#;
        let voice = parse_voice(content);
        assert_eq!(voice.first_person_markers, vec!["我们", "同志", "斗争"]);
        assert_eq!(voice.metaphor_domains, vec!["territory", "peasant", "base area"]);
        assert!(!voice.forbidden_patterns.is_empty());
    }

    #[test]
    fn test_parse_situation_card() {
        let content = r#"# 井冈山根据地建立

## Situation
1927年秋收起义失败后，兵力极弱，攻城无望。

## Contradiction
象征性胜利 vs 生存能力。

## Reasoning
打不赢就换战场。

## Conclusion
放弃攻长沙，转向井冈山。

## Abstract Form
When resources are insufficient, consolidate before expanding.

## Pressure
time: 8
resource: 10
survival: 9
competition: 7
social: 7
uncertainty: 8
identity: 9
emotional: 7
moral: 3
face: 8
isolation: 9
irreversibility: 5
info_completeness: 4
cost_asymmetry: extreme
"#;
        let card = parse_situation_card(content, "mao-001");
        assert_eq!(card.title, "井冈山根据地建立");
        assert!(card.situation.contains("秋收起义"));
        assert_eq!(card.pressure.resource, 10);
        assert_eq!(card.pressure.survival, 9);
        assert_eq!(card.pressure.cost_asymmetry, "extreme");
    }

    #[test]
    fn test_pressure_fingerprint_similarity() {
        let a = PressureFingerprint {
            time: 8, resource: 10, survival: 9, competition: 7,
            social: 7, uncertainty: 8, identity: 9, emotional: 7,
            moral: 3, face: 8, isolation: 9, irreversibility: 5,
            info_completeness: 4, cost_asymmetry: "extreme".into(),
        };
        // Very similar fingerprint
        let b = PressureFingerprint {
            time: 7, resource: 9, survival: 8, competition: 6,
            social: 6, uncertainty: 7, identity: 8, emotional: 6,
            moral: 2, face: 7, isolation: 8, irreversibility: 4,
            info_completeness: 3, cost_asymmetry: "extreme".into(),
        };
        // Very different fingerprint
        let c = PressureFingerprint {
            time: 1, resource: 1, survival: 1, competition: 1,
            social: 1, uncertainty: 1, identity: 1, emotional: 1,
            moral: 9, face: 1, isolation: 1, irreversibility: 9,
            info_completeness: 9, cost_asymmetry: "symmetric".into(),
        };

        let sim_ab = a.similarity(&b);
        let sim_ac = a.similarity(&c);
        assert!(sim_ab > 0.95, "Similar fingerprints should have high similarity: {}", sim_ab);
        assert!(sim_ac < sim_ab, "Different fingerprints should have lower similarity");
    }

    #[test]
    fn test_persona_registry_loads_from_dir() {
        let tmp = TempDir::new().unwrap();
        let skills = tmp.path();

        // Create a persona directory
        let mao_dir = skills.join("mao-zedong");
        fs::create_dir_all(mao_dir.join("situations")).unwrap();

        fs::write(
            mao_dir.join("persona.json"),
            r#"{"name": "毛泽东", "title": "Revolutionary Strategist"}"#,
        ).unwrap();

        fs::write(
            mao_dir.join("theory.md"),
            "## 世界观 (Worldview)\n矛盾是事物发展的根本动力。一切事物中都包含矛盾，关键是找到主要矛盾和矛盾的主要方面。\n\n## 人生观 (Life Philosophy)\n实践出真知。\n",
        ).unwrap();

        fs::write(mao_dir.join("voice.md"), "## First-Person Markers\n我们、同志\n").unwrap();

        fs::write(
            mao_dir.join("situations/001-jinggang.md"),
            "# 井冈山\n\n## Situation\ntest\n\n## Abstract Form\nConsolidate first\n\n## Pressure\nresource: 10\n",
        ).unwrap();

        let registry = PersonaRegistry::load(skills).unwrap();
        assert_eq!(registry.len(), 1);

        let mao = registry.get("mao-zedong").unwrap();
        assert_eq!(mao.name, "毛泽东");
        assert!(mao.worldview.contains("矛盾"));
        assert_eq!(mao.voice.first_person_markers, vec!["我们", "同志"]);
        assert_eq!(mao.situations.len(), 1);
        assert_eq!(mao.situations[0].pressure.resource, 10);
    }

    #[test]
    fn test_persona_registry_accepts_legacy_short_slugs() {
        let registry = PersonaRegistry::from_personas(vec![
            WisdomPersona {
                slug: "paul-graham".into(),
                name: "Paul Graham".into(),
                title: "YC".into(),
                worldview: String::new(),
                philosophy: String::new(),
                values: String::new(),
                methodology: String::new(),
                situations: vec![],
                voice: VoiceTexture::default(),
                cadence: Cadence::Unset,
                lifeline_md: None,
                helping_signature_md: None,
                consistency_audit_md: None,
                lifeline_phases: Vec::new(),
                legacy_prompt: None,
            },
            WisdomPersona {
                slug: "mao-zedong".into(),
                name: "毛泽东".into(),
                title: "Strategist".into(),
                worldview: String::new(),
                philosophy: String::new(),
                values: String::new(),
                methodology: String::new(),
                situations: vec![],
                voice: VoiceTexture::default(),
                cadence: Cadence::Unset,
                lifeline_md: None,
                helping_signature_md: None,
                consistency_audit_md: None,
                lifeline_phases: Vec::new(),
                legacy_prompt: None,
            },
        ]);

        assert_eq!(registry.get("pg").unwrap().slug, "paul-graham");
        let picked = registry.filtered(&["pg".to_string(), "mao".to_string()]);
        assert_eq!(picked.iter().map(|p| p.slug.as_str()).collect::<Vec<_>>(), vec!["paul-graham", "mao-zedong"]);
    }

    #[test]
    fn test_build_prompt_with_layers() {
        let persona = WisdomPersona {
            slug: "test".into(),
            name: "Test Persona".into(),
            title: "Test Title".into(),
            worldview: "The world is interconnected and everything is a system that can be understood through feedback loops.".into(),
            philosophy: "Life is about learning.".into(),
            values: "Truth above comfort.".into(),
            methodology: "First principles analysis.".into(),
            situations: vec![],
            voice: VoiceTexture {
                first_person_markers: vec!["I".into(), "we".into()],
                metaphor_domains: vec!["systems".into()],
                sentence_patterns: vec!["Short declarative".into()],
                forbidden_patterns: vec!["As X he thinks".into()],
            },
            cadence: Cadence::Unset,
            lifeline_md: None,
            helping_signature_md: None,
            consistency_audit_md: None,
            lifeline_phases: Vec::new(),
            legacy_prompt: None,
        };

        let prompt = persona.build_system_prompt("test situation", None);
        assert!(prompt.contains("你是Test Persona"));
        assert!(prompt.contains("世界观"));
        assert!(prompt.contains("interconnected"));
        assert!(prompt.contains("说话方式"));
        assert!(prompt.contains("I、we"));
    }

    #[test]
    fn test_parse_lifeline_phases_extracts_year_ranges() {
        let content = r#"# Bruce Lee Lifeline

## Why this file exists
intro stuff (no year, should be skipped)

## Phase 1 · 香港童年 · 1945–1959 · ages 5–18
`phase-hk-childhood`

body...

## Phase 2 · USA student · 1959–1964 · ages 18–23
`phase-usa-student`

body...

## Phase 5 · HK superstar · 1971–1973 · ages 30–32
`phase-hk-superstar`

## Cross-phase observations
not a phase, no year
"#;
        let phases = parse_lifeline_phases(content);
        assert_eq!(phases.len(), 3, "should skip intro and cross-phase headings");
        assert_eq!(phases[0].phase_id, "phase-hk-childhood");
        assert_eq!(phases[0].start_year, Some(1945));
        assert_eq!(phases[0].end_year, Some(1959));
        assert_eq!(phases[0].start_age, Some(5));
        assert_eq!(phases[0].end_age, Some(18));
        assert_eq!(phases[2].phase_id, "phase-hk-superstar");
        assert_eq!(phases[2].start_year, Some(1971));
    }

    #[test]
    fn test_detect_phase_from_text_pins_year() {
        let phases = vec![
            LifelinePhase {
                phase_id: "phase-a".into(),
                display_name: "Phase A · 1959–1964".into(),
                start_year: Some(1959),
                end_year: Some(1964),
                start_age: None,
                end_age: None,
            },
            LifelinePhase {
                phase_id: "phase-b".into(),
                display_name: "Phase B · 1971–1973".into(),
                start_year: Some(1971),
                end_year: Some(1973),
                start_age: None,
                end_age: None,
            },
        ];
        let q = "客户问的是 1972 年那个时期";
        let hit = detect_phase_from_text(&phases, q).unwrap();
        assert_eq!(hit.phase_id, "phase-b");

        // Year not in any phase → None
        let q2 = "asking about 2010";
        assert!(detect_phase_from_text(&phases, q2).is_none());

        // No year mentioned → None
        let q3 = "asking generically about life advice";
        assert!(detect_phase_from_text(&phases, q3).is_none());
    }

    #[test]
    fn test_extract_phase_section_slices_until_next_heading() {
        let lifeline = "## Phase 1 · 1945–1959\nbody of phase 1\nline 2\n\n## Phase 2 · 1959–1964\nbody of phase 2\n";
        let p1 = extract_phase_section(lifeline, "Phase 1 · 1945–1959").unwrap();
        assert!(p1.contains("body of phase 1"));
        assert!(!p1.contains("Phase 2"));
    }

    #[test]
    fn test_parse_consistency_audit_section() {
        let theory = "## 世界观\nfoo\n\n## 言行一致性 / Consistency Audit\nprinciple X: enacted in card 1\nprinciple Y: violated in 1972\n\n## Other\nignored\n";
        let audit = parse_consistency_audit_section(theory).unwrap();
        assert!(audit.contains("principle X"));
        assert!(audit.contains("principle Y"));
        assert!(!audit.contains("foo"));
        assert!(!audit.contains("ignored"));
    }

    #[test]
    fn test_load_persona_picks_up_weaving_files() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("test-persona");
        fs::create_dir_all(dir.join("situations")).unwrap();
        fs::write(dir.join("persona.json"), r#"{"name": "Test", "title": "T"}"#).unwrap();
        fs::write(
            dir.join("theory.md"),
            "## 世界观\nthe world is a system\n\n## 言行一致性 / Consistency Audit\nfine\n",
        ).unwrap();
        fs::write(
            dir.join("lifeline.md"),
            "## Phase 1 · 2000–2010 · ages 20–30\n`phase-one`\n\nbody\n",
        ).unwrap();
        fs::write(dir.join("helping_signature.md"), "## Default first move\nlisten\n").unwrap();

        let persona = load_persona(&dir).unwrap();
        assert!(persona.lifeline_md.is_some());
        assert!(persona.helping_signature_md.is_some());
        assert!(persona.consistency_audit_md.as_deref().unwrap_or("").contains("fine"));
        assert_eq!(persona.lifeline_phases.len(), 1);
        assert_eq!(persona.lifeline_phases[0].phase_id, "phase-one");
    }

    #[test]
    fn test_build_prompt_fallback_to_legacy() {
        let persona = WisdomPersona {
            slug: "test".into(),
            name: "Test".into(),
            title: "Tester".into(),
            worldview: String::new(),
            philosophy: String::new(),
            values: String::new(),
            methodology: String::new(),
            situations: vec![],
            voice: VoiceTexture::default(),
            cadence: Cadence::Unset,
            lifeline_md: None,
            helping_signature_md: None,
            consistency_audit_md: None,
            lifeline_phases: Vec::new(),
            legacy_prompt: Some("You are Test, a legendary tester with deep knowledge.".into()),
        };

        let prompt = persona.build_system_prompt("situation", None);
        assert_eq!(prompt, "You are Test, a legendary tester with deep knowledge.");
    }
}
