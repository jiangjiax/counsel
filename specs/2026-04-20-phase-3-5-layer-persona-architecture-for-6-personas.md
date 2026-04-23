# Explorer Spec: Phase 3 — 5-Layer Persona Architecture

## Problem

The counsel-rust project has **3 disconnected persona systems** that waste code and create confusion:

1. `personas.rs` (280 lines, 12 structured personas) — **unused** by the flow
2. `persona_prompts.rs` (1989 lines, 22 rich ~25KB prompts) — **actively used** but monolithic
3. `agents/mod.rs::default_personas()` (12 tuples) — **the actual entry point**

The current 12 personas are generic tech figures. The product needs 6 deep wisdom personas (毛泽东、PG、Jobs、Bruce Lee、Kevin Kelly、慧能) with a 5-layer knowledge architecture that enables situation-matching, not just flat prompts.

## User / Operator Outcome

After this phase:
- 6 wisdom personas loaded from files (not hardcoded)
- Each persona carries structured knowledge: worldview → philosophy → values → methodology → decisions
- Situation cards with pressure fingerprints enable contextual wisdom matching
- Voice texture prevents persona blur and third-person escape
- `skills/` directory is the single source of truth for all persona data

## Constraints

- **Product**: Voice Mode only (no Framework Mode). Must not regress Phase 2 features.
- **Technical**: Zero new crate dependencies — parse everything with serde_json + string splitting. Keep persona_prompts.rs as fallback until all 6 personas have full KB.
- **Time**: Infrastructure + 2 seed personas (Mao, PG) + 4 stubs. Full content is out of scope.

## Existing Context

### Relevant files
- `crates/counsel-core/src/agents/mod.rs:226-241` — `default_personas()`, the main entry point (12 tuples)
- `crates/counsel-core/src/persona_prompts.rs` — `get_persona_prompt()` (line 1941), `get_persona_name()` (line 1974)
- `crates/counsel-core/src/personas.rs` — `Persona` struct + `all_personas()` (unused)
- `crates/counsel-core/src/prompts.rs` — `rich_persona_opinion_prompt()` (109), `rich_persona_debate_prompt()` (153), `rich_persona_facts_prompt()` (605), `harvest_eval_prompt()` (362), `persona_intro_prompt()` (538)
- `crates/counsel-core/src/steps/mod.rs` — 8 call sites of `default_personas()` + `get_persona_prompt()`
- `crates/counsel-api/src/routes/steps.rs` — `get_personas()` API endpoint

### Existing behavior
Steps 3-8 iterate `default_personas()`, look up `get_persona_prompt(id)` for rich prompts, fall back to basic description. Each persona gets independent LLM calls (no blur risk from architecture).

### Known risks
- Changing persona set from 12→6 will change session outputs
- Persona content quality depends on KB depth (seed content may be thin)
- File I/O at startup adds latency (mitigated by caching)

## Proposed Approach

### A. Data Structures (new file: `crates/counsel-core/src/wisdom.rs`)

```rust
/// The 6 v1 wisdom personas
pub struct PersonaRegistry {
    personas: Vec<WisdomPersona>,
}

/// A single wisdom persona with 5-layer knowledge
pub struct WisdomPersona {
    pub slug: String,           // "mao-zedong"
    pub name: String,           // "毛泽东"
    pub title: String,          // "Revolutionary Strategist"
    // 5 layers
    pub worldview: String,      // Layer 1
    pub philosophy: String,     // Layer 2
    pub values: String,         // Layer 3
    pub methodology: String,    // Layer 4 (full text)
    pub situations: Vec<SituationCard>,  // Layer 5
    // Voice
    pub voice: VoiceTexture,
    // Fallback
    pub legacy_prompt: Option<String>,  // From persona_prompts.rs if available
}

pub struct SituationCard {
    pub id: String,             // "mao-001"
    pub title: String,          // "井冈山根据地建立"
    pub situation: String,
    pub contradiction: String,
    pub reasoning: String,
    pub conclusion: String,
    pub abstract_form: String,  // RAG matching target
    pub pressure: PressureFingerprint,
}

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
    pub cost_asymmetry: String, // "symmetric" | "upside" | "downside"
}

pub struct VoiceTexture {
    pub first_person_markers: Vec<String>,
    pub metaphor_domains: Vec<String>,
    pub sentence_patterns: Vec<String>,
    pub forbidden_patterns: Vec<String>,
}
```

### B. File Directory Schema

```
skills/
├── mao-zedong/
│   ├── persona.json          # {"name":"毛泽东","title":"Revolutionary Strategist"}
│   ├── theory.md             # 5 layers as ## sections
│   ├── voice.md              # Voice texture as ## sections
│   └── situations/
│       ├── 001-jinggang-mountains.md
│       └── 002-long-march-decision.md
├── paul-graham/
│   ├── persona.json
│   ├── theory.md
│   ├── voice.md
│   └── situations/
│       └── 001-yc-essay-thinking.md
├── steve-jobs/     (stub)
├── bruce-lee/      (stub)
├── kevin-kelly/    (stub)
└── huineng/        (stub)
```

**Stub** = persona.json + minimal theory.md (1-2 sentences per layer) + empty voice.md + no situations. Enough to load, falls back to legacy prompts where available.

### C. File Parsing (in `wisdom.rs`)

No YAML dependency. Parse markdown by `## ` section headers:

```
theory.md format:
## 世界观 (Worldview)
content...
## 人生观 (Life Philosophy)
content...
## 价值观 (Values)
content...
## 方法论 (Methodology)
content...
```

```
voice.md format:
## First-Person Markers
我们, 同志, 斗争
## Metaphor Domains
territory, peasant, base area
## Sentence Patterns
Parallel structure: 不是X，而是Y
## Forbidden Patterns
作为X他认为, X可能会说
```

```
situations/*.md format:
# Title
## Situation
...
## Contradiction
...
## Reasoning
...
## Conclusion
...
## Abstract Form
...
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
```

### D. PersonaRegistry (in `wisdom.rs`)

```rust
impl PersonaRegistry {
    /// Load all personas from skills/ directory
    pub fn load(skills_dir: &Path) -> Result<Self, CoreError>

    /// Get all personas (for API listing)
    pub fn all(&self) -> &[WisdomPersona]

    /// Get persona by slug
    pub fn get(&self, slug: &str) -> Option<&WisdomPersona>

    /// Get the 6 personas as (id, name, title, description) tuples
    /// for backward compatibility with existing step code
    pub fn as_tuples(&self) -> Vec<(String, String, String, String)>
}
```

### E. Prompt Assembly (in `wisdom.rs`)

```rust
impl WisdomPersona {
    /// Build the full system prompt for this persona.
    /// If situation cards exist, include top-3 matched cards.
    /// Falls back to legacy_prompt if layers are thin.
    pub fn build_system_prompt(
        &self,
        user_situation: &str,
        user_fingerprint: Option<&PressureFingerprint>,
    ) -> String

    /// Build a short description (for API listing)
    pub fn short_description(&self) -> String
}

impl PressureFingerprint {
    /// Cosine similarity between two fingerprints
    pub fn similarity(&self, other: &PressureFingerprint) -> f64

    /// Convert to 14-element vector for math
    pub fn to_vec(&self) -> Vec<f64>
}
```

**Prompt assembly logic**:
1. If persona has `situations` + user provides fingerprint → assemble 5-layer prompt with top-3 matched cards
2. If persona has `theory` but no situations → assemble layers 1-4 only
3. If persona has `legacy_prompt` → use that (current behavior)
4. Fallback → basic description

**5-layer prompt template**:
```
你是{name}。以下是你的核心认知：

## 世界观
{worldview}

## 人生观
{philosophy}

## 价值观
{values}

## 思考方式
{methodology}

## 类似情境（你曾面对过的）
{top-3 situation cards' abstract forms}

## 说话方式
- 用第一人称（{first_person_markers}）
- 比喻领域：{metaphor_domains}
- 句式：{sentence_patterns}
- 禁止：{forbidden_patterns}
```

### F. Integration Points (Steps 3-8)

**Change**: Replace `default_personas()` + `get_persona_prompt()` with `PersonaRegistry`.

1. `CounselService` gets a `registry: PersonaRegistry` field
2. `run_facts()` (Step 3): iterate `registry.all()`, use `persona.build_system_prompt()`
3. `run_opinions()` (Step 4): iterate `registry.all()`, use `persona.build_system_prompt()`
4. `run_debate()` (Step 6): iterate `registry.all()`, use `persona.build_system_prompt()`
5. `run_harvest()` (Step 8a): iterate `registry.all()`, use `persona.build_system_prompt()`
6. `get_personas()` API: return `registry.all()` serialized

**The prompt helper functions** (`rich_persona_opinion_prompt`, etc.) still exist but receive the assembled prompt string instead of the raw legacy prompt. Their job shrinks to wrapping the persona prompt with step-specific context.

### G. Step-by-Step Loading Flow

```
App startup:
  1. Read SKILLS_DIR env (default: "./skills")
  2. PersonaRegistry::load(skills_dir)
     → For each subdirectory in skills/:
       a. Read persona.json → name, title
       b. Read theory.md → split by ## sections → 5 layers
       c. Read voice.md → split by ## sections → VoiceTexture
       d. Read situations/*.md → parse each → Vec<SituationCard>
       e. Try get_persona_prompt(slug) → legacy_prompt fallback
  3. Store registry in CounselService (via Arc)
  4. Pass to routes as shared state

Step execution:
  1. Get personas from registry
  2. For each persona:
     a. Call persona.build_system_prompt(raw_input, None)
        (fingerprint extraction deferred — pass None for now)
     b. Wrap with step-specific context via existing prompt functions
     c. Pass to PersonaAgent.run_streaming_collect()
```

## File / Module Touch List

- [x] **NEW** `crates/counsel-core/src/wisdom.rs` — WisdomPersona, SituationCard, PressureFingerprint, VoiceTexture, PersonaRegistry, prompt assembly, file loading
- [x] **EDIT** `crates/counsel-core/src/lib.rs` — add `pub mod wisdom;`, add `registry` to `CounselService`
- [x] **EDIT** `crates/counsel-core/src/steps/mod.rs` — replace `default_personas()` + `get_persona_prompt()` calls with `self.registry`
- [x] **EDIT** `crates/counsel-core/src/agents/mod.rs` — update `default_personas()` to return 6 (kept for test compat), update doc comment
- [x] **EDIT** `crates/counsel-api/src/routes/steps.rs` — `get_personas()` reads from registry
- [x] **EDIT** `crates/counsel-api/src/main.rs` — load PersonaRegistry at startup, pass to state
- [x] **NEW** `skills/mao-zedong/` — full persona (persona.json + theory.md + voice.md + 3 situation cards)
- [x] **NEW** `skills/paul-graham/` — full persona (persona.json + theory.md + voice.md + 2 situation cards)
- [x] **NEW** `skills/steve-jobs/` — stub
- [x] **NEW** `skills/bruce-lee/` — stub
- [x] **NEW** `skills/kevin-kelly/` — stub
- [x] **NEW** `skills/huineng/` — stub
- [x] **KEEP** `crates/counsel-core/src/persona_prompts.rs` — untouched, used as fallback
- [x] **KEEP** `crates/counsel-core/src/personas.rs` — untouched (unused but harmless)

## Verification Plan

### Automated checks
- `cargo build --workspace` — zero warnings
- `cargo test -p counsel-core` — all 14 existing tests pass + new tests:
  - `test_persona_registry_loads_from_dir` — load skills/, verify 6 personas
  - `test_wisdom_persona_build_prompt_with_situations` — verify prompt includes layers + cards
  - `test_wisdom_persona_build_prompt_fallback` — stub persona falls back to legacy
  - `test_pressure_fingerprint_similarity` — cosine sim correctness
  - `test_situation_card_parsing` — parse markdown → SituationCard
  - `test_voice_texture_parsing` — parse voice.md → VoiceTexture

### Manual checks
- `scripts/live-smoke-test.sh` — 8 steps pass with new 6-persona set
- Inspect session output: persona names should be 毛泽东/PG/Jobs/Bruce Lee/Kevin Kelly/慧能
- Step 8 Bayesian update still works
- User Wiki still reads/writes
- Step caching still works

### Edge cases
- Skills directory missing → graceful error at startup
- Persona subdirectory missing theory.md → use legacy prompt
- Situation file with bad format → skip card, log warning
- Empty situations/ directory → persona works without cards (layers 1-4 only)

## Open Questions

- [x] **YAML vs JSON for metadata?** → JSON (persona.json). No new dependencies.
- [x] **Keep persona_prompts.rs?** → Yes, as fallback. Delete when all 6 personas have full KB.
- [x] **Fingerprint extraction via LLM?** → Deferred. Pass `None` for now, matching still works on layers 1-4.

## Recommendation — Coder Execution Order

1. **Create `wisdom.rs`** — data structures + PersonaRegistry + file parsing + prompt assembly + fingerprint math
2. **Create `skills/` directory** — 2 full personas (Mao, PG) + 4 stubs
3. **Wire `lib.rs`** — add mod, add registry to CounselService
4. **Update `steps/mod.rs`** — replace default_personas() calls with registry iteration
5. **Update `agents/mod.rs`** — shrink default_personas() to 6, kept for test compat
6. **Update API** — main.rs loads registry, routes/steps.rs reads from state
7. **Run tests** — verify all 14 existing + 6 new pass
8. **Live smoke test** — verify 8 steps pass
