# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Rust rewrite of "Counsel AI / 私董会" — a multi-persona advisory system where 6 AI "board directors" (毛泽东 / Paul Graham / Steve Jobs / 李小龙 / Kevin Kelly / 六祖慧能) help a user think through a decision via a fixed 8-step flow. Backend is Axum + SSE streaming; frontend is a vanilla-JS SPA in `public/`. All session data persists to the local filesystem.

UI is Chinese-only for v1 (bilingual locale toggle deferred to v2, see roadmap §3.6). All LLM prompts have been unified to output Chinese as of 2026-04-22. Default provider is DeepSeek.

**Terminology convention (fixed 2026-04-22)**: "幕僚" (advisors), "案主" (client/subject). Do NOT use "顾问"/"用户"/"客户" in user-visible prompts or UI — the roadmap item 4.7 will make this user-configurable later.

## Commands

```bash
# Run server (port 3000, static UI at /) — picks provider, checks for API key
./start.sh deepseek        # or: kimi | minimax | openai | dmx | laozhang | ollama

# Build / typecheck
cargo check --workspace --all-targets
cargo build --release

# Tests (workspace)
cargo test --workspace
cargo test --workspace <filter>            # filter by test name
cargo test -p counsel-core                 # single crate
cargo test -p counsel-core --test full_flow_test   # single integration file

# Live integration test against DeepSeek (needs DEEPSEEK_API_KEY)
node test_deepseek_full.js
node test_full_flow.js

# Frontend sanity (no bundler — plain JS + marked.js CDN)
node -e "new Function(require('fs').readFileSync('public/app.js','utf8'))"

# Env vars read by crates/counsel-api/src/main.rs
MODEL_PROVIDER=deepseek|kimi|minimax|openai|dmx|laozhang|ollama  # default ollama
STORAGE_ROOT=./sessions                                           # default ./sessions
HOST=127.0.0.1
<PROVIDER>_API_KEY=sk-...
```

## Crate layout (workspace)

```
crates/
  counsel-api/       Axum server, SSE routes, binary target `counsel-api`
  counsel-core/      8-step state machine, agents, prompts, persona registry
  counsel-model/     ModelProvider trait + 7 provider impls (deepseek/kimi/minimax/openai/dmx/laozhang/ollama)
  counsel-storage/   Filesystem persistence (projects, sessions, files, user-wiki, belief-system, execution-journal)
  counsel-test-utils MockModelProvider fixtures for tests
public/              Vanilla-JS SPA: index.html + app.js + style.css (served by ServeDir)
skills/              Six v1 persona directories, loaded at startup by PersonaRegistry::load
                       {mao-zedong,paul-graham,steve-jobs,bruce-lee,kevin-kelly,huineng}/
                       {persona.json, theory.md, voice.md, situations/}
sessions/            Per-project session data (local filesystem storage root)
user-wiki.md         USER-level wiki at repo root (sibling of sessions/)
execution-journal.md USER-level follow-up journal (sibling of user-wiki.md)
```

## Three storage levels (understand this before touching storage)

**User level** (shared across ALL projects; `Storage` methods take NO `project_id`):
- `./user-wiki.md` — continuously accumulated identity dossier. `run_harvest` appends a per-session block on Step 8 completion.
- `./execution-journal.md` — Phase 2.3 follow-up responses. Each entry: case-of client's reply to a past commitment.

**Project level** (`sessions/{pid}/...`):
- `belief-system.md` — Phase 2.8. Project's latest Bayesian posterior; overwritten on each Step 8. Session N+1's facilitator reads this as structured prior.
- `meta.json` — project metadata.

**Session level** (`sessions/{pid}/session-{sid}/...`):
- Files listed below in the 8-step table.
- `user-reactions.md` — Phase 2.13 highlight events.
- `premortem.md` — Phase 4.4 Step 6.5 output.
- `07-client-notes.md` — case-of client self-reflection (written before Step 8 auto-runs).

## Big-picture architecture

### The 8-step flow and its file naming

The product-facing "Step N" does NOT match the file prefix. Step N produces file `(N-1)XX-*.md`:

| UI Step | Function              | Output file(s)                             |
|---------|-----------------------|--------------------------------------------|
| 1 Input | (HTTP create session) | `00-raw-input.md`                          |
| 2 Lock  | `run_define`          | `01-defined.md` + `01-define-state.json`   |
| 3 Facts | `run_facts`           | `02-facts-answers.md` + `02-facts-questions.json` |
| 4 Opinions | `run_opinions`     | `03-opinions/{PersonaName}.md` (one per persona) |
| 5 Dimensions | `run_dimensions` | `04-dimensions.md` + `04-selected-dimensions.json` |
| 6 Debate | `run_debate`         | `05-debate.md` (appended per dimension)    |
| 6.5 Pre-Mortem | `run_premortem` | `premortem.md` (progressive writes every ~400 chars) |
| 7 Summary | `run_summary`       | `06-summary.md`                            |
| 8 Harvest | `run_harvest`       | `07-harvest.md` + `07-bayesian.md` + `07-persona-evals.md` |

All `run_*` methods live in `crates/counsel-core/src/steps/mod.rs`. Route handler at `crates/counsel-api/src/routes/steps.rs`. Step 7 route handler orchestrates pre-mortem → summary (pre-mortem may come from background pre-run — see below).

### SSE streaming — "double-wrapping" gotcha

Backend `SSEEvent::to_sse_data()` already formats as `data: {json}\n\n`. Axum's `Event::data()` then wraps it AGAIN, so the wire format is `data: data: {json}\n\n`. The frontend `streamSSE()` in `public/app.js` strips BOTH prefixes before `JSON.parse()`. **Do not "fix" this by removing one layer** — both sides depend on it.

Event variants in `crates/counsel-core/src/lib.rs` `SSEEvent`:
- `StepStart`, `StepDone { data }`, `Error`
- `PersonaStart/Chunk/Done { name }`
- `FacilitatorChunk/Done`
- `DimensionStart { index, total, name } / DimensionDone { index }` — Step 6 multi-dim
- `PremortemStart / PremortemChunk { chunk } / PremortemDone` — Step 6.5

Frontend dispatches via `handlers[evt.type]` (snake_case).

### Pre-Mortem (Phase 4.4) — two-mode streaming

`run_premortem` internally uses a forwarder task: `run_streaming_collect` writes `FacilitatorChunk` frames to an internal channel; a spawned task parses each chunk, rewraps as `PremortemChunk`, forwards to the real sender, and progressively flushes `premortem.md` (every ~400 chars).

Two call sites:
- **Live (Step 7 handler)**: sender is user's SSE sink, chunks shown live as Pre-Mortem card.
- **Background (Step 6 handler end)**: `tokio::spawn` + `SseSink::discarded()` — chunks go to nowhere but `premortem.md` still gets progressive writes. Step 6 handler also registers a `oneshot::Sender` in `ApiState.prefetches` map; Step 7 handler awaits the completion signal (timeout 30s) via the receiver.

`ApiState.prefetches: Arc<Mutex<HashMap<String, oneshot::Receiver<()>>>>` is keyed by `"{session_id}:premortem"`. Remove-and-await on Step 7; entry may be absent if background pre-run completed before Step 7 clicked (file already stable) or no pre-run was fired.

Prompt caps to ~800 Chinese chars, `max_tokens=1600`. Earlier attempts at longer outputs caused UI truncation.

### Session continuity — 4-layer context (Phases 2.8 + 4.3 + 2.3)

Step 2's `facilitator_define_prompt` and `facilitator_correction_prompt` accept four prior-context parameters, injected in order of freshness/truth:

1. `prior_beliefs` — `sessions/{pid}/belief-system.md` (project's latest Bayesian posterior)
2. `last_session` — `Storage::read_last_wiki_entry()` extracts the most recent `---`-separated block from `user-wiki.md`
3. `execution_journal` — `./execution-journal.md` (**highest-truth signal** — what the client actually did, not merely said)
4. `user_wiki` — full `user-wiki.md` content (long-horizon identity context)

`build_session_context_section()` assembles these into a single context block the facilitator reads.

### Follow-up assistant (Phase 2.3)

On-demand model (no scheduled jobs). When user opens the page:
1. Frontend `refreshFollowUpBadge()` hits `GET /api/follow-ups`.
2. Handler parses `user-wiki.md` for `## 行动承诺日志` lines matching `- [YYYY-MM-DD HH:MM] [✅ 承诺 · Session {sid}] ✅ — {todo}` format via `regex_lite` helper.
3. Overdue = timestamp > 7 days AND not already journaled in `execution-journal.md`.
4. Badge shows count. Click → modal with response form per item.
5. `POST /api/follow-ups/respond` appends to `execution-journal.md`.

Commit events come from Step 8 UI: user clicks todo checkbox → `POST /api/projects/:pid/sessions/:sid/todos/commit` → appends to `user-wiki.md` `## 行动承诺日志` section.

### Step 6 multi-dimension debate

Route handler emits `DimensionStart { index, total, name }` before each `run_debate(&dim)` and `DimensionDone { index }` after. Frontend creates one `.dim-section` per dimension, keying persona cards by `(dimIdx, personaName)` to prevent collision when same persona speaks across dimensions.

**Debate position format** (Chinese per 2026-04-22): persona response starts with `立场：正方` / `立场：反方` / `立场：中立` (first line alone). `categorize_position` in `steps/mod.rs` parses both Chinese (`立场：`) and legacy English (`Position:`) prefixes.

**Wrapper format** (in `run_debate`, line ~814): Chinese section headers `### 第一轮立场 / ### 中立方回应 / ### 整合`. The middle section is OMITTED when empty (don't show a blank header).

### Step 8 ordering

Step 8's UI shows the reflection panel BEFORE auto-running `run_harvest`. Flow:
1. User enters Step 8 → reflection panel visible, no streaming.
2. User fills 3 textareas (learned / differently / next) → clicks submit.
3. `POST /api/.../client-notes` writes `07-client-notes.md`.
4. `POST /steps/8` with `force_refresh: true` runs `run_harvest`.
5. `run_harvest` reads `07-client-notes.md` AND `user-reactions.md` and injects both into persona evaluations + Bayesian prompt.

`harvest_eval_prompt` and `bayesian_update_prompt` each take a `client_notes: &str` parameter.

### Todos / wiki commit flow

LLM-generated todos stay in `07-harvest.md` as advisory. Only todos the user CLICKS in the UI flow to the wiki:
1. User clicks checkbox on todo → `toggleTodo(el)` in `app.js`.
2. localStorage stores checked state (key `counsel:todo:{pid}:{sid}:{idx}`).
3. Also POSTs to `/api/.../todos/commit` with `{text, checked}`.
4. Backend appends event line to `user-wiki.md`'s `## 行动承诺日志` section.
5. Follow-up assistant later scans this section.

### User reactions (Phase 2.13) — phrase-level highlights

`sessions/{pid}/{sid}/user-reactions.md` is the real-time resonance channel. Frontend has a PDF-reader-style selection engine in `public/app.js` (`initPhraseToolbar`, `applyMark`, `applyAllSavedMarks`). **Anchoring is snippet + 40-char prefix + 40-char suffix** — stored as HTML comment `<!-- anchor: prefix="..." suffix="..." -->` at the end of each entry. This survives the markdown-vs-textContent rendering mismatch.

`prepend_user_reactions()` in `steps/mod.rs` parses the reactions file, buckets by reaction type, and injects into Step 5/6/7/8 prompts **tier-weighted**: 📝 tier-1 (text note) > ❗ tier-2 > ⭐ tier-3.

Markable containers are tagged `data-markable data-step="N" data-persona="X"`. Streaming content wears `.cur` class; floating toolbar suppresses itself while `.cur` is present. Step 7 uses full re-render per chunk (`innerHTML = md(fullText)`), so saved marks are reapplied after stream completes via `applyAllSavedMarks(container)`.

### Problem Library (main-page UI)

Below the Step 1 input when user is on the fresh home (no `?projectId=...` in URL), an expandable project list shows all past problems. Each project expands to show its sessions with a summary preview (lazily fetched `01-defined.md`). Click a session to resume. Click "+ 新一轮" on a project header to start a new session WITHIN that project (sets `PID` without creating a new project — `submitInput()` has an `if (!PID)` guard that handles this path).

Topbar has `🏠 首页` (go home = start new session), `+ 新问题` (fresh project), `📅 跟进` (follow-up badge), `我的画像`, `历史`, `设置`. The `私 董 会` brand text is also a clickable home link.

### Hypothesis Translator (Phase 2.4 — inline)

Not a separate pre-step. `facilitator_define_prompt` contains a three-class branch:
- **(A) 信息查询**: short-circuit — facilitator answers directly, no 核心问题 format
- **(B) 太模糊**: reflect back clarifying questions
- **(C) 可辩论**: standard 核心问题 output

LLM handles classification inline. No routing change needed.

### Context compression (Phase 2.9)

In `run_summary`: if `05-debate.md` exceeds 8000 Chinese chars, Secretary compresses it to ~2000 chars (preserving positions, tensions, remaining gaps) before feeding to `summary_prompt`. Hard char truncation is forbidden. See the `DEBATE_COMPRESS_THRESHOLD` const.

### Persona registry + skills directory

`crates/counsel-core/src/wisdom.rs` — `PersonaRegistry::load(skills_dir)` reads six persona directories from `./skills/{mao-zedong,paul-graham,steve-jobs,bruce-lee,kevin-kelly,huineng}/`. Each has `persona.json` (metadata), `theory.md` (five layers by `##` headers), `voice.md`, and `situations/*.md`. The legacy `persona_prompts.rs` (1990 lines, 24 personas) is still present but unused in the v1 flow; roadmap 2.12 marks it for deletion after file-loading is proven.

Persona "origin language" is not enforced at persona-prompt level anymore (earlier design). All persona-facing prompts (opinions, debate, harvest_eval) now carry a `**语言要求：全程用中文输出**` directive so Western personas (PG/Jobs/KK) translate their thinking to Chinese output while keeping voice.

### Storage path security

`GET /api/projects/:pid/sessions/:sid/files/*filename` uses a wildcard route (captures nested paths like `03-opinions/Paul-Graham.md`). Handler rejects `..` and leading `/` as path-traversal defense. Keep this pattern if adding new file endpoints.

### `<think>` tag stripping (Phase 2.11)

`strip_think_tags(s)` in `crates/counsel-core/src/lib.rs` removes `<think>...</think>` reasoning blocks from LLM output. Applied at every `write_session_file` call in `run_*` methods. Unit-tested (see `strip_tests` module). Streaming UI may briefly show think content during flight; file + downstream prompts are clean.

## Roadmap + decision docs (read these before non-trivial changes)

- `PRIORITY-ROADMAP-PG-BASED.md` — executable plan. Especially §3.1 Step 2 one-shot lock; §3.2 + §3.2.1 reactions; §3.3 Step 8 reorder; §3.4 User Wiki framework (deferred); §3.5 notes usage roadmap; §3.6 bilingual strategy (v1 Chinese-only).
- `DIAGNOSIS-AND-ROADMAP.md` — product philosophy + WE-INDEX analysis.
- `counsel_rust_decent_overhaul_8281b0e3.plan.md` — 109-item backlog (Tier 2 parking lot).
- `cheatsheet.md` — frequently-updated working notes.

## Conventions and gotchas

- **CJK byte slicing**: never `&str[..N]` on Chinese — use `str::chars().take(N)` or `char_indices()`. The earlier panic at `categorize_position` was exactly this.
- **Chinese string literals with inner `"`**: escape as `\"` OR use Chinese quotes 「」 — raw `"` inside `"..."` breaks the Rust lexer (compile errors hit this twice).
- **`let _ =` / `if let Ok(_)` on core ops = forbidden**. Errors must propagate. This was a real bug class producing silent empty opinion files.
- **Streaming + accumulating**: use `Agent::run_streaming_collect(messages, opts, sink) -> String` to both stream to the SSE sink AND get the full text back in one API call. Never call `run_streaming` followed by a separate `run` — doubles API cost.
- **Terminology**: `幕僚` not `顾问`; `案主` not `用户`/`客户`. All prompts have been unified. If adding a new prompt, add "术语：幕僚/案主，全程中文" to its language directive block.
- **Debate position**: Chinese prefix `立场：` preferred; `Position:` still supported by classifier for backward compat.
- **Do NOT commit** `sessions/` or `user-wiki.md` or `execution-journal.md` (ephemeral user data).

## Future vision (documented but not yet implemented)

Two large-scope items are fully scoped in the roadmap; both require a **plan-before-execute** workflow per Michael 2026-04-22:

- **Phase 5 · Persona content enrichment**: deepen the 6 v1 personas to five-layer depth (theory.md 400 lines each + 8-16 situation cards per persona). Depends on Phase 3 (3.4/3.5/3.6) landing first — no point writing depth content before the RAG+PromptAssembler pipeline that consumes it exists. Reference: roadmap "阶段 5"; current repo's `DEEPENING-PERSONAS.md` + `wisdom-persona-kb-framework.md` + `WE-INDEX.md` (GOLDEN cases as seed material).

- **Phase 6 · UI 圆桌沉浸式重构**: replace the current linear-message-list UI with a round-table visual metaphor (central host + orbital persona avatars, speech bubbles emerging from avatars instead of a separate chat pane, dimension-discovery fly-out + top-right tracker animation). Two themes (dark `#0a0a0a` and light `#f4f3ef`). **Reference implementation**: Michael's design sandbox at https://github.com/michaelhuo2030/roundtable-advisor/ — `UI language/` directory has complete working demos (`interaction-patterns-demo.html` is the canonical reference for both Pattern A bubble-on-avatar and Pattern B dimension-collect animation). Avatar system uses a single `portrait-grid.png` (5×5 grid, CSS-cropped). See roadmap §3.7 for detailed design + per-step rollout plan (6.1 through 6.6).

## Memory system

Long-lived context across CLI sessions lives in auto-memory at `~/.claude/projects/-Users-a1-6-Documents-CC-05-ACTIVE-PROJECTS-counsel-rust-claude-opus/memory/`. Check `MEMORY.md` there for recent arch decisions, active feature ideas, and Michael's design preferences before starting non-trivial work.
