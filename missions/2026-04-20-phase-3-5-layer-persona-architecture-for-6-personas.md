# Mission: Phase 3 — 5-Layer Persona Architecture

## Metadata

- Date: 2026-04-20
- Project: counsel-rust-claude-opus
- Task name: Phase 3: 5-layer persona architecture for 6 personas
- Mode: three-role

## Goal

Replace the 3 disconnected persona systems (personas.rs, persona_prompts.rs, agents/mod.rs default_personas) with a unified 5-layer knowledge architecture loaded from files. Switch from 12 generic personas to 6 deep wisdom personas: 毛泽东、PG、Jobs、Bruce Lee、Kevin Kelly、慧能.

## Scope

**Included:**
- Rust data structures for WisdomPersona, SituationCard, PressureFingerprint, VoiceTexture
- File-based persona directory (`skills/{slug}/`)
- Loaders that parse theory.md, voice.md, situations/*.md at startup
- In-memory cosine similarity RAG for situation card matching
- PersonaPromptAssembler (Voice Mode) that builds prompts from 5 layers + matched cards
- Steps 3-8 updated to use PersonaRegistry
- Seed content: 2 full personas (Mao, PG), 4 stubs (Jobs, Bruce Lee, Kevin Kelly, 慧能)
- Integration test with real file loading

**Excluded:**
- Full content for all 6 personas (requires research work beyond code)
- LLM-based fingerprint extraction (hardcode for now; Task 3.4 deferred)
- Framework Mode (Voice Mode only per roadmap)
- WE-INDEX CI automation
- Deleting persona_prompts.rs entirely (keep as fallback until all 6 are complete)

## Deliverable

1. `PersonaRegistry` with file-based loading
2. `skills/` directory with 6 persona subdirs
3. Updated prompt pipeline using 5-layer assembly
4. All existing tests still pass + new KB tests
5. Live smoke test passes with new persona system

## Definition of Done

- [x] `cargo build --workspace` — zero warnings
- [x] `cargo test` — all existing + new tests pass
- [x] 6 persona directories exist in `skills/`
- [x] Steps 3-8 use PersonaRegistry instead of default_personas()
- [x] Prompt includes theory + voice + situation cards when available
- [x] Live smoke test: 8 steps pass with new 6-persona set
- [x] Fallback works: persona without full KB still gets basic prompt

## Constraints

- Time: Single session implementation
- Technical: No new crate dependencies beyond serde_yaml + existing
- Business: Must not regress Phase 2 functionality (Bayesian, Wiki, caching all still work)

## Notes

- The 3 existing persona systems are: personas.rs (12 structured, unused), persona_prompts.rs (22 rich ~25KB each, actively used), agents/mod.rs default_personas() (12 tuples, main entry point)
- Roadmap tasks: 3.1-3.7
- Content creation is the bottleneck (84+ person-hours for 6 full personas), but infra can be built now with seed data
- persona_prompts.rs (1989 lines) kept as fallback — if a persona has no skills/ dir, fall back to get_persona_prompt()
