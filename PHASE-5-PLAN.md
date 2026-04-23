# Phase 5 · Persona 内容扩充 — Implementation Plan

## 1. Premise & Non-Goals

**What just shipped (Phase 3.4 / 3.5 / 3.6):** `FingerprintExtractor` produces a 13-number + 1-label (`cost_asymmetry`) pressure vector from the user's session context; `top_matching_cards` does cosine match over every persona's `situations/*.md`; `WisdomPersona::build_system_prompt` injects top-3 matched cards into each persona's system prompt at every Step 3/4/6/8 call site. **The pipe is alive.** Every new situation card written today immediately flows into the next session's prompts — no code change required.

**What this Phase is:** writing creative/domain content (theory + voice + situation cards) that the existing pipe consumes. 72 total cards across 6 personas + ~400 lines per `theory.md`.

**What this Phase is NOT:**
- NOT a Rust refactor. Do not touch `crates/counsel-core/src/wisdom.rs`, `fingerprint.rs`, prompt assemblers, or any `steps/mod.rs` call site.
- NOT a struct extension. Do not add fields to `SituationCard` or `PressureFingerprint`. If a card format ambiguity surfaces mid-writing, STOP and open a discussion.
- NOT a `cargo check` loop. Content quality is the bottleneck, not the compiler. Human review between drafts is the gating step.
- NOT a batch job. Do not "write all 72 cards in one go." The whole point of plan-before-execute is a stopping point for human review after each persona's first few cards.

## 2. Format Contract (Locked — derived from `wisdom.rs` parser)

### 2.1 `theory.md` — five `##` sections

```markdown
# {Persona Name} — 智慧人格知识架构

## 世界观 (Worldview)            # ~80-100 lines
## 人生观 (Life Philosophy)      # ~80-100 lines
## 价值观 (Values)                # ~80-100 lines
## 方法论 (Methodology)           # ~100-120 lines
## 情境卡片索引 (Situations Reference)   # TOC ~20-40 lines, not parsed
```

Parser accepts either 中 or EN heading; also `思考方式` as Methodology alias.

### 2.2 `voice.md` — four list sections

```markdown
## First-Person Markers
## Metaphor Domains
## Sentence Patterns
## Forbidden Patterns
```

Comma / 、 separated single-line OR `- bullet` list — both accepted.

### 2.3 `situations/NNN-slug.md` — LOAD-BEARING format

```markdown
# {Situation Title}

## Situation
## Contradiction
## Reasoning        (numbered 1. 2. 3.)
## Conclusion
## Abstract Form    ← RAG payload; strip era/domain/names
## Pressure
time: {0-10}
resource: {0-10}
survival: {0-10}
competition: {0-10}
social: {0-10}
uncertainty: {0-10}
identity: {0-10}
emotional: {0-10}
moral: {0-10}
face: {0-10}
isolation: {0-10}
irreversibility: {0-10}
info_completeness: {0-10}
cost_asymmetry: {symmetric | upside | upside_high | downside | downside_high | extreme}
```

Parser gotchas:
- Unknown Pressure keys silently dropped.
- Parse failures on u8 fields → 0 (typos poison similarity).
- `cost_asymmetry` only 4 categories map to nonzero vector components.
- Heading aliases accepted: `情境|Situation`, `矛盾|Contradiction`, `推理|Reasoning`, `结论|Conclusion`, `抽象形式|Abstract Form|可迁移模式`, `压力指纹|Pressure`.

**Reference cards that pass parser:**
- `skills/paul-graham/situations/001-yc-make-something.md`
- `skills/paul-graham/situations/002-default-alive.md`
- `skills/mao-zedong/situations/001-jinggang-mountains.md`

## 3. Staging Strategy: Pilot → Review → Commit

### Stage 0 — Format Lock
- Reread three reference cards above.
- Human confirms format contract before Stage 1.

### Stage 1 — Pilot: Paul Graham (4 new cards + theory deepen)

**Why PG first:**
1. WE-PG-001 GOLDEN 24/25 — strongest seed in whole index
2. PG already has 2 cards + 77-line theory (smallest delta)
3. Roadmap is "PG-based" — if his voice doesn't land, nothing else will
4. English-primary persona validates `全程中文` directive under rich theory

**Deliverables:**
- Expand `skills/paul-graham/theory.md` 77 → ~400 lines
- Add cards 003-006:
  - `003-cathedral-without-prayers` — seed WE-PG-001
  - `004-schlep-blindness`
  - `005-ramen-profitability`
  - `006-do-things-that-dont-scale`

Stop at 6 cards (target 16) to get review signal before committing to remaining 10.

### Stage 2 — Pilot Review Gate (CRITICAL)

1. `./start.sh deepseek`
2. Submit realistic problem with PG-shaped pressure (startup/product decision)
3. Inspect `sessions/{pid}/{sid}/03-opinions/Paul-Graham.md`
4. Verify:
   - Quotes specific situation details (not generic "your startup")
   - Uses PG voice patterns (reversal "Most people X. Actually Y.")
   - Reasoning draws from new cards' Abstract Form
   - No third_person_escape ("As PG he thinks...")
5. Optional: tracing::debug log of top-3 matched card IDs per persona

**Gate:** If output meets WE-PG-001 bar → Stage 3. Else iterate on PG first.

Reviewer = Michael. Taste judgment, not unit test.

### Stage 3 — Remaining 5 Personas (priority order)

| Order | Persona | Cards | WE-INDEX seeds | theory state | Rationale |
|-------|---------|-------|----------------|--------------|-----------|
| 3a | **毛泽东** | 16 | WE-MAO-001/002 STRONG + 3 existing | 55 lines, ok | Most WE data |
| 3b | **Bruce Lee** | 12 | WE-BL-001/002/004 | empty situations/ | 2nd GOLDEN |
| 3c | **六祖慧能** | 8 | WE-HUINENG-001 GOLDEN | 15 lines (thin) | 1 GOLDEN; small target |
| 3d | **Steve Jobs** | 12 | WE-SJ-001 WEAK + Isaacson canon | empty | No GOLDEN — higher risk |
| 3e | **Kevin Kelly** | 8 | none in WE-INDEX | empty | Pull from books/essays |

After each persona's first 3-4 cards → same review gate as Stage 2.

### Stage 4 — Integration Smoke Test

After all 6 personas fully loaded:
1. Server restart — no "Failed to load persona" warnings
2. Three distinct test sessions:
   - Survival-pressure problem → should match Mao 井冈山 + PG default-alive
   - Identity-pressure problem → Huineng + Bruce Lee
   - Long-horizon ambiguity → KK + Jobs
3. Verify 6 personas respond in-voice with different reasoning

## 4. Per-Persona Content Map

### 4.1 Paul Graham (Stage 1 — 16 cards total)

**theory.md ~400 lines:**
- 世界观 ~80 lines: superlinear returns + schlep blindness + conventional wisdom mostly wrong
- 人生观 ~80 lines: writing-is-thinking + do-what-unpaid + keep-identity-small
- 价值观 ~80 lines: honesty > politeness + making > talking + ramen > optics
- 方法论 ~120 lines: talk-to-users/build/repeat + default-alive-dead math + the schlep test
- 情境索引 ~30 lines

**16 cards (2 existing + 14 new):**
1. ✅ 001-yc-make-something
2. ✅ 002-default-alive
3. 003-cathedral-without-prayers (WE-PG-001 seed)
4. 004-schlep-blindness
5. 005-ramen-profitability
6. 006-do-things-that-dont-scale
7. 007-focus-means-saying-no
8. 008-founder-market-fit
9. 009-keep-your-identity-small
10. 010-the-bus-ticket-theory
11. 011-how-to-disagree
12. 012-the-refragmentation
13. 013-hackers-and-painters
14. 014-superlinear-returns
15. 015-the-right-kind-of-stubborn
16. 016-early-work

### 4.2 Mao Zedong (Stage 3a — 16 cards, 3 existing + 13 new)

**theory.md expand to ~400 lines:** 矛盾论/实践论/持久战 as worldview; 为人民服务; 实事求是/群众路线; 矛盾分析法/农村包围城市/统一战线/持久战/运动战/调查研究 as methodology.

**13 new cards:**
- 004-genkendi-mapping (WE-MAO-001 根据地 seed)
- 005-zunyi-conference (mid-course correction)
- 006-protracted-war (持久战)
- 007-on-contradiction (矛盾论 as operating system)
- 008-on-practice (实践论)
- 009-yenan-rectification (内部整风)
- 010-united-front-with-chiang
- 011-three-rules-eight-points (codifying culture via rules)
- 012-hundred-flowers (open-feedback experiment)
- 013-surround-cities-from-countryside
- 014-mobile-warfare (敌进我退)
- 015-mass-line (从群众中来)
- 016-learn-from-failure (秋收起义 as data)

### 4.3 Bruce Lee (Stage 3b — 12 cards)

**theory.md from scratch ~400 lines:** 世界观 = water/形无定势; 人生观 = self-expression not style; 价值观 = functional > tradition; 方法论 = JKD (absorb/reject) + 指月手 + formlessness.

**12 cards:**
1. 001-be-water-my-friend (WE-BL-001 seed)
2. 002-jkd-absorb-useful-reject-useless
3. 003-finger-pointing-at-moon
4. 004-using-no-way-as-way
5. 005-polishing-nunchaku (WE-BL-001 direct)
6. 006-one-kick-practiced-10000-times
7. 007-style-as-cage
8. 008-five-ways-of-attack
9. 009-simplicity-is-ultimate-sophistication
10. 010-honestly-expressing-oneself
11. 011-empty-your-cup
12. 012-the-living-tree

### 4.4 六祖慧能 (Stage 3c — 8 cards)

**theory.md deepen (15 → ~400 lines):** 本来无一物 + 万法不离自性; 迷时师度悟时自度 + 顿悟不渐修; 直指人心不立文字; 照见 + 反问 + 放下 + 无念无相无住.

**8 cards:**
1. 001-twelve-mirror-wheel (WE-HUINENG-001 seed)
2. 002-flag-wind-mind-moving (非风动非幡动)
3. 003-bodhi-no-tree (菩提本无树 vs. 神秀 gradualism)
4. 004-not-thinking-good-not-thinking-evil
5. 005-original-face (本来面目)
6. 006-dharma-as-raft (teaching as instrument)
7. 007-direct-pointing (直指人心)
8. 008-wordless-transmission (不立文字)

### 4.5 Steve Jobs (Stage 3d — 12 cards, higher risk no-GOLDEN)

Seed WE-SJ-001 is WEAK (cautionary — third_person_escape). voice.md must forbid "乔布斯可能会说" constructions aggressively.

**theory.md ~400 lines:** design-is-how-it-works; 2005 Stanford speech; focus = saying no; end-to-end integration; bicycle for mind.

**12 cards:**
1. 001-thousand-nos
2. 002-macintosh-team-pirates
3. 003-apple-return-1997 (350 → 4 quadrants)
4. 004-iphone-ed-colligan-retort
5. 005-ipod-wheel-not-buttons
6. 006-next-pixar-wilderness
7. 007-think-different-taste
8. 008-intersection-tech-liberal-arts
9. 009-stanford-connecting-dots
10. 010-journey-vs-destination
11. 011-calligraphy-class
12. 012-stay-hungry-stay-foolish

### 4.6 Kevin Kelly (Stage 3e — 8 cards)

**theory.md ~400 lines:** technium as 7th kingdom; inevitables; long-termism + optimism as strategy; emergence > control; 1000 true fans.

**8 cards:**
1. 001-thousand-true-fans
2. 002-technium-inevitability
3. 003-start-where-puck-going (12 inevitables)
4. 004-out-of-control-emergence
5. 005-protopia-not-utopia
6. 006-embrace-the-new
7. 007-68-bits-life-advice
8. 008-cool-tools-aggregation

## 5. Writing Discipline

1. **Each card ~20-40 min.** No speed-writing — RAG depends on genuine structural Abstract Form.
2. **Pressure values are calibration.** Reread Jinggang (survival:9 resource:10) before writing new cards. "Should I redesign this UI" is NOT survival:9.
3. **Abstract Form = RAG payload.** Strip era/domain/names. "Consolidate in overlooked niche when resources insufficient" ✓ vs "Mao went to Jinggang because Chiang held cities" ✗.
4. **Reasoning in first person.** Persona's cognitive sequence, not Wikipedia summary.
5. **Voice texture = anti-blur.** voice.md's Forbidden Patterns kills WE-INDEX's #1 failure mode (third_person_escape). Every persona needs 3-4 forbidden patterns in Chinese.
6. **Stage 1 by hand.** After Stage 2 passes, LLM may draft cards, but human must rewrite Abstract Form + set Pressure values for every card.
7. **Cross-persona conflicts are features.** PG "focus=no" vs KK "follow many flows" — don't file off edges; contradictions generate insight in Step 6.

## 6. Verification (per Stage)

NOT `cargo check`. Verification is:

```bash
./start.sh deepseek
# No "Failed to load persona" in stderr

# Submit realistic problem in browser, run through Step 4
ls sessions/{pid}/{sid}/03-opinions/
cat sessions/{pid}/{sid}/03-opinions/Paul-Graham.md
```

Per-opinion checklist:
- [ ] First-person markers present (no "作为X他认为")
- [ ] Quotes specific user situation details (WE rule: 个人化 > 哲学)
- [ ] Visibly reasons from a situation card's Abstract Form
- [ ] Reframes surface question (WE rule: 重构 > 回答)
- [ ] No disclaimer_breaks_immersion opener

2+ fails on a persona → iterate before next persona.

## 7. Stopping Gates

| Gate | After | Review question |
|------|-------|-----------------|
| G0 | Format contract locked | "Do the 3 reference cards match this spec?" |
| G1 | PG Stage 1 (4 new cards + theory) | "PG live-session output hit WE-PG-001 bar?" |
| G2 | Each persona's first 3-4 cards | "Voice survives? Any third-person-escape?" |
| G3 | Full 72 cards loaded | "3 test sessions produce genuinely different personas?" |

## 8. Anti-Patterns

- ❌ Add new fields to SituationCard/PressureFingerprint
- ❌ Create theory.md sections beyond the 5 parser knows (silently dropped)
- ❌ Mix `Pressure:` / `压力指纹:` inconsistently within one persona
- ❌ Edit any file under `crates/` — Phase 5 is content-only
- ❌ Commit 16 cards in one PR — per-persona commits minimum; PG gets 2-3
- ❌ Pre-seed all personas with generic stubs (>50 chars triggers 5-layer branch, hides whether content is real)
- ❌ Skip Stage 2 pilot gate

## 9. Time Calibration

- Stage 1 (PG pilot): 4 cards × 30min + theory ~3h ≈ **5h**
- Stage 2 (review): ~1-2h
- Stage 3 (5 personas):
  - Mao 16c ≈ 8h
  - BL 12c ≈ 6h
  - Huineng 8c + theory ≈ 5h
  - Jobs 12c ≈ 7h
  - KK 8c ≈ 4h
  - Total ≈ **30h**
- Stage 4 (smoke test): ~2h

**Total: ~40h creative writing, spread over 2-3 weeks with review gates.**

## 10. Critical Files

- `crates/counsel-core/src/wisdom.rs` — parser contract (READ-ONLY)
- `skills/paul-graham/theory.md` — expand
- `skills/paul-graham/situations/` — add 003-016
- `skills/mao-zedong/situations/` — add 004-016 + theory expand
- `skills/{bruce-lee,huineng,kevin-kelly,steve-jobs}/` — full build
- `WE-INDEX.md` — seed source of truth; reread before each card

## 11. Source Materials (Phase 5 writing reference)

Bulky reference texts copied into `skills/_sources/` (gitignored). See `skills/_sources/README.md` for the full source index.

**Mao** (ready to use):
- `skills/_sources/mao/primary/M1～7卷.txt` — Mao's own 毛选 7 卷 (6 MB) — canonical quote source
- `skills/_sources/mao/biography/毛传.txt` — 525-page biography — situation narrative material
- `skills/_sources/mao/analysis/0.0解析.txt` — 496-page essay-by-essay systematic analysis — feeds theory.md methodology layer
- `skills/_sources/mao/applications/` — 42 contemporary-problem → Mao-solution articles (屠龙术拆解2) — feeds situation card Abstract Form

The sources README has a card-to-source mapping table for Mao's 13 new cards. Before writing each Mao card, consult the specified application article + verify quotes against primary/.

**Huineng** (blocked):
- `skills/_sources/huineng/` — empty; needs 《六祖坛经》source file before stage 3c can start. See `huineng/README.md` for chapter-to-card seed mapping once sourced.

**PG / Jobs / BL / KK**: no collected source corpus; rely on WE-INDEX GOLDEN cases + each persona's canonical essay/interview collection (to be sourced per persona as stages begin).

---

**Ready for review.** Once §2 format contract confirmed and Stage 1 scope (PG pilot, 4 cards + theory) approved, execution may begin. Do not skip Gate G1 before proceeding to Stage 3.
