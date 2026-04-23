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
    // Fallback: legacy ~25KB prompt from persona_prompts.rs
    pub legacy_prompt: Option<String>,
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
        self.personas.iter().find(|p| p.slug == slug)
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
        _user_situation: &str,
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

    // Read theory.md → parse 5 layers
    let theory_path = dir.join("theory.md");
    let (worldview, philosophy, values, methodology) = if theory_path.exists() {
        let content = std::fs::read_to_string(&theory_path)?;
        parse_theory(&content)
    } else {
        (String::new(), String::new(), String::new(), String::new())
    };

    // Read voice.md → parse voice texture
    let voice_path = dir.join("voice.md");
    let voice = if voice_path.exists() {
        let content = std::fs::read_to_string(&voice_path)?;
        parse_voice(&content)
    } else {
        VoiceTexture::default()
    };

    // Read situations/*.md
    let situations_dir = dir.join("situations");
    let situations = if situations_dir.exists() && situations_dir.is_dir() {
        load_situation_cards(&situations_dir)?
    } else {
        Vec::new()
    };

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
        legacy_prompt,
    })
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
            legacy_prompt: Some("You are Test, a legendary tester with deep knowledge.".into()),
        };

        let prompt = persona.build_system_prompt("situation", None);
        assert_eq!(prompt, "You are Test, a legendary tester with deep knowledge.");
    }
}
