# Persona Enrichment Cookbook

A practical guide for turning a stub persona directory into a full 5-layer wisdom persona that actually sounds like the person. Written from the concrete lessons of the Paul Graham and 毛泽东 pilots (2026-04-22).

Companion to `PHASE-5-PLAN.md` (which has the strategic plan). This is the **operational playbook** — the how, not the what.

---

## 0. The Big Picture

### What's already built (don't rebuild)

The mechanical layer is **live**:
- `crates/counsel-core/src/fingerprint.rs` — extracts a 13-axis + 1-label pressure vector from any case text
- `crates/counsel-core/src/wisdom.rs` — `top_matching_cards` does cosine match over situation cards
- `build_system_prompt` injects top-3 matched cards + theory + voice into every persona's system prompt
- Parser reads five `##` sections from `theory.md`, four list sections from `voice.md`, seven sections + Pressure block from each `situations/*.md`

**Therefore: every card you write, every theory edit, every voice pattern you add, flows into the next session's prompts with zero code change.** You are authoring content that an existing pipe will consume.

### What goes wrong without this cookbook

From the Mao pilot:
- Cards sound like **MBA case study about the person** instead of **the person teaching you**
- Abstract form sections become consulting bullet points
- Voice.md is generic — the LLM drifts into third-person ("作为毛泽东他认为...")
- Pressure values become "plausible-looking numbers" rather than calibrated signals, poisoning RAG
- All 16 cards get written before the first one is tested in a live session

All preventable. This cookbook shows how.

---

## 1. Format Contract (Don't Fight the Parser)

Sections and headings the parser recognizes. Deviating from these silently drops content to empty strings. **Verify against `crates/counsel-core/src/wisdom.rs` if unsure** — never modify the parser to match your format.

### 1.1 `theory.md` — five sections

```markdown
# {Persona Name} — {Any Subtitle}

## 世界观 (Worldview)            # or: Worldview
## 人生观 (Life Philosophy)      # or: Life Philosophy
## 价值观 (Values)                # or: Values
## 方法论 (Methodology)           # or: Methodology | 思考方式
## 情境卡片索引 (Situations Reference)   # NOT parsed, but recommended for human navigation
```

Parser matches by substring — both Chinese and English headings accepted. Order doesn't matter for the parser (but convention is above).

Target prose volume per section: **~60–120 lines of real prose** (not short-wrapped lines; full paragraphs). Each section should read as a coherent essay, not a bullet list.

### 1.2 `voice.md` — four list sections

```markdown
## First-Person Markers
## Metaphor Domains
## Sentence Patterns
## Forbidden Patterns
```

Each section accepts either comma-separated single line OR `- bullet` list. Keep style consistent within one persona. See §5 for what actually goes in each.

### 1.3 `situations/NNN-slug.md` — seven sections + Pressure

**This is load-bearing. Any deviation breaks RAG.**

```markdown
# {Situation Title in persona's native language}

## Situation         # 2-5 sentences of the historical moment, concretely
## Contradiction     # surface question vs. real tension, 2-4 sentences
## Reasoning         # numbered 1. 2. 3. — the cognitive sequence
## Conclusion        # 1-2 sentences: the decision made
## Abstract Form     # transferable pattern, strip era/domain/names — THIS is the RAG payload
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

Parser acceptance:
- Numeric fields: `u8`, `unwrap_or(0)` on parse failure — **typos become 0s, which poison similarity scoring**
- `cost_asymmetry`: only 4 categories map to non-zero vector — `symmetric`→0, `upside`/`upside_high`→+1, `downside`/`downside_high`→−1, `extreme`→+2. Anything else → 0.
- Unknown keys silently dropped. Don't invent new Pressure keys.
- Heading aliases accepted: `情境|Situation`, `矛盾|Contradiction`, `推理|Reasoning`, `结论|Conclusion`, `抽象形式|Abstract Form|可迁移模式`, `压力指纹|Pressure`. English keys are the convention here for uniformity.

### 1.4 Verify a card parses

Before committing any card:

```bash
cargo test -p counsel-core wisdom   # parser unit tests
./start.sh deepseek                 # look for "Failed to load persona" in stderr
curl -s http://127.0.0.1:3000/api/personas | jq .   # confirm your persona shows up
```

Missing or mangled cards cause silent field drops, not errors.

---

## 2. The Pilot-Then-Review Pattern

**Never write all cards at once.** Write 3–4, stop, test live, iterate on voice, then write the rest.

### Why

From the Mao pilot (2026-04-22): five cards + full theory were written, then a voice diagnosis surfaced that the cards read like analytical case studies, not Mao speaking. All five + theory + voice.md had to be rewritten. If 13 cards had been written before this diagnosis, we'd have rewritten 13 cards.

### Gates

| Gate | When | Review question |
|------|------|-----------------|
| **G0** | Before writing anything | "Does format contract match the parser? Can I reproduce an existing card's structure?" |
| **G1** | After 3-5 pilot cards + theory | "Does this persona's output in a live session sound like the person?" |
| **G2** | After each subsequent persona's first 3-4 cards | Same question. If voice drifts, iterate before next persona. |
| **G3** | After all cards loaded | "Do three test sessions produce visibly different personas with non-overlapping reasoning?" |

### How to run the gate

```bash
COUNSEL_PERSONAS=<slug> ./start.sh deepseek
```

Submit a realistic problem with pressure signature that should resonate with the persona. Go through Step 3 (their question) and Step 4 (their opinion). Read the opinion file:

```bash
cat sessions/{pid}/{sid}/03-opinions/{Name}.md
```

Voice review checklist (apply each):
- [ ] Uses persona's first-person markers (no "作为X他认为")
- [ ] Quotes specific details from the user's situation (not generic)
- [ ] Visibly reasons from at least one situation card's Abstract Form
- [ ] Reframes the surface question rather than answering it literally
- [ ] No "作为一个…", "从…角度看" or third-person escape
- [ ] Uses specific historical hooks (e.g., Mao: "我当年在井冈山…"; PG: "YC sees thousands of applications…")
- [ ] No literal translation of jargon (runway→跑道 is the canonical failure)

If 2+ items fail, don't proceed. Iterate on voice.md + theory.md + one or two flagship cards first.

---

## 3. Voice Calibration (The Most Underweighted Step)

This section is the single biggest lesson from the Mao pilot. Content that's "factually correct" and "well-structured" still fails if the voice is wrong. Voice is not polish — voice is **the difference between a case study about the person and the person teaching across the table**.

### 3.1 The test

For every passage, ask:

> **"Would the persona say this *to* me, or *about* me?"**

If it reads as *about* the person (third-person historical analysis), it's wrong. It should read as *from* the person, speaking directly.

Concrete before/after (Mao card 005):

```
BEFORE (analytical / McKinsey):
"当一个组织正在犯严重的、但领导层还不承认的路线错误，
并且你想推动转向时，不要把这个转变做成'人对人'的权力斗争..."

AFTER (first-person Mao):
"遵义开会的时候，博古和李德还想保住权力。要是我直接说
'你们错了，滚蛋'，全场人都会为他们说话——因为谁也不想看到一场
权力清算。我怎么做的？我说'咱们讨论一下湘江战役为什么失败'。
一讨论，事实摆在那儿，谁对谁错就清楚了。权力的转换就自然发生了，
没人感觉被伤害。这叫迂回。"
```

The content is the same. The voice is completely different. The second one will make the LLM channel the persona; the first will make the LLM write about the persona.

### 3.2 Diagnose voice from source material (highly recommended)

Before writing a persona's cards, **spend 30 minutes extracting their actual voice patterns from primary or biographical source material**. This is the step most people skip.

We ran this for Mao using an Explore subagent on 6 key articles in `skills/_sources/mao/applications/`. The prompt asked for:

1. 8-12 verbatim sentences that sound distinctively the persona (not modern analyst commentary)
2. Tone profile on 5 axes (directness, metaphor density, rhetorical heat, self-reference frequency, moral vs. efficacy)
3. What the current cards are missing, with suggested rewrites
4. Specific additions for voice.md

**The output was directly actionable** — sentence skeletons, metaphor domains, forbidden patterns — and caught drift that would have been invisible from inside the cards.

For future personas, adapt this prompt. See the end of this cookbook for the template.

### 3.3 voice.md: what actually goes in each section

From what we learned writing Mao's voice.md (the effective version, not the stub):

**First-Person Markers** — not just pronouns. Include:
- Pronouns (我, 我们, I, we)
- Historical self-references ("我当年在井冈山的时候")
- Observational authority claims ("我看到", "我看清了")
- Rhetorical uncovering phrases ("问题在哪儿呢", "说到底")
- Pivot-into-teaching phrases ("说到这里", "我告诉你一件事")
- Framing-the-reader phrases ("有个同志问我", "有人不理解")
- Direct Socratic address ("你仔细看", "你要明白")

**Metaphor Domains** — the concrete things the persona reaches for when explaining abstractly. Be specific:
- Mao: 根据地、赤水、过河、石头、土地、脚下、根子、补丁、纸老虎
- PG: startups, essays, painting, Lisp, hacking, cooking, schlep
- **NOT**: "leadership", "strategy", "vision" (abstract nouns are wrong for this section)

**Sentence Patterns** — named, with examples:
- Name the pattern ("反转对仗")
- Show the skeleton ("不是X，而是Y")
- Give a concrete example ("这不是打得不狠，是路线本身错了")

**Forbidden Patterns** — the single most important section. Every persona has failure modes. Organize by category:
1. Third-person escape ("作为X他认为", "X可能会说")
2. Academic / consulting jargon ("战略决策能力的提升", "最佳实践")
3. Hedging language ("可能", "或许", "据说")
4. Wrong attribution of own work ("X 理论指出..." when the persona IS X)
5. Meta-discourse ("我们现在讨论的是", "接下来分析")
6. Wrong "we" (含糊的"人类"、"时代"的 we when persona's "we" is always specific)

Add 4-5 forbidden patterns per category minimum. Every persona has different failure modes — don't copy Mao's forbidden patterns to PG.

### 3.4 Per-persona voice keys

Distinguishing markers to capture per persona (calibrate voice.md to these):

| Persona | Voice signature | Characteristic move |
|---------|----------------|---------------------|
| 毛泽东 | 过来人教诲 + 具体历史引用 + 反问 | "我当年…现在你明白了吧？" |
| Paul Graham | Reversal-with-surprise + plain-spoken intensity | "Most people think X. Actually Y." |
| Steve Jobs | Categorical assertion + obsessive specificity on one detail | "This is the best. Nothing else matters." |
| Bruce Lee | Paradox + physical metaphor + directness | "Be water. The shape is not the water." |
| Kevin Kelly | Long-horizon + systems language + optimism-as-strategy | "In 30 years... the inevitable shape is..." |
| 六祖慧能 | 反问直指 + 去抽象化 + 当下性 | "菩提本无树，明镜亦非台——你问的树在哪里？" |

---

## 4. Writing a Situation Card (Section by Section)

All Chinese examples from Mao card 004. All English examples from PG card 003.

### 4.1 Situation (2-5 sentences)

**Goal**: concretely paint the historical moment. Dates, numbers, names, stakes.

Rules:
- Start with a time/place anchor: "1927 年秋收起义失败…" / "A technical founder has spent three months…"
- Include specific numbers when they exist ("八万六千人打到三万" beats "大量伤亡")
- Named adversaries / conditions / constraints
- 2-5 sentences. Don't explain yet — just establish the scene.

Red flag: if someone could swap in a different decision moment without changing your Situation, it's too abstract.

### 4.2 Contradiction (2-4 sentences, surface vs. real)

**Goal**: distinguish what looks like the problem from what the problem actually is.

Structure:
```
表面问题是 X。
真正的矛盾是 Y。
Y explanation: 2-3 sentences.
```

The gap between X and Y is the card's intellectual content. If your X and Y are close together, it's probably not worth a card.

### 4.3 Reasoning (numbered 1–5, first person)

**Goal**: the cognitive sequence from inside the persona's head.

Rules:
- **First person**. "我看得清楚…" / "I realized…". Not "Mao saw that…"
- Numbered list — each number is one reasoning move
- 4-6 numbers is the sweet spot; more gets bloated
- Mix principle statements with concrete observations from the specific moment
- No "策略上" / "tactically" — be concrete about what you saw, feared, chose

Test: read just Reasoning 1–5. Does it read as the person thinking in real time? Or as an analyst reconstructing after the fact? Must be the former.

### 4.4 Conclusion (1-2 sentences + optional teaching pivot)

**Goal**: what was actually done.

Format:
```
[What happened, in the persona's voice]. 
[Optional: a direct teaching line to the reader — "同志, 你今天也有同样的选择…" / "Founder, here's your version of this."]
```

Keep it tight. This is where the persona lands the landing.

### 4.5 Abstract Form (this is the RAG payload — critical)

**Goal**: the transferable pattern, stripped of era, domain, and proper nouns.

Rules:
- **Must be abstract in content** but **concrete in voice**. The persona is still speaking.
- State the pattern as a general rule ("资源远远不足以正面对抗主流战场时…")
- Include **key signals** — observable conditions when this pattern fires
- Include a **diagnostic question** the reader can ask themselves
- Aim for 150-300 Chinese chars / 60-120 English words

Test: if you grep this text for the proper nouns in Situation, you should get zero hits. "Mao went to Jinggang because Chiang held cities" ✗ / "When resources are insufficient to attack the mainstream market, consolidate in an overlooked niche" ✓

**Why it matters**: this is what `top_matching_cards` effectively indexes against via the Pressure fingerprint. But it's also what the LLM reads as case-law during persona prompt assembly. Abstract Form quality = persona's ability to generalize wisely. Sloppy Abstract Form = the persona gives generic advice.

### 4.6 Pressure (14 keys, calibrated not guessed)

**This is the second most dangerous section after voice.** Mis-calibrated pressure values poison RAG cosine matching silently.

Calibration principles:

1. **Read the 3 existing reference cards first.** Ground yourself. Examples:
   - Jinggang: survival:9, resource:10 (maximum historical pain)
   - YC-make-something: survival:4, face:4 (moderate — most startups are not life-or-death)
   - Cathedral-without-prayers: survival:5, identity:8, face:7 (identity-heavy, not survival-heavy)

2. **Ask "what would an 8-out-of-10 on this axis look like?" before scoring.**
   - time:8 = multiple decisions per week, decisions are irreversible
   - time:3 = annual review cadence
   - survival:9 = organization will literally cease to exist if wrong
   - survival:4 = bad outcome is "we'll try something else"

3. **Most situations are 3-7 on most axes.** 9s and 10s should be rare and earned. If your card has many 9s, either the situation is a rare extreme (四渡赤水, 井冈山) or you're over-dramatizing.

4. **`cost_asymmetry` is a judgment, not a slider.** Pick one of the 6 recognized strings. "extreme" = stake-it-all moment (all-in, 破釜沉舟, 压上全部). "downside_high" = the bad outcome is much worse than the good outcome is good. "symmetric" = default.

5. **Test the calibration via live session.** Once cards are loaded, submit problems with specific pressure profiles and verify the right cards get pulled. If Jinggang card matches every problem, its pressure is too extreme across all axes. If it never matches, its pressure is too concentrated in one axis.

Verify test (optional but valuable):
```rust
// Temporarily add to wisdom.rs or a test:
tracing::debug!("persona={} matched cards: {:?}", name, 
    top_matching_cards(&persona.situations, user_fp, 3)
        .iter().map(|c| &c.id).collect::<Vec<_>>());
```

Revert after checking — this is a local diagnostic, not production code.

---

## 5. Source Material Workflow

Reference texts go in `skills/_sources/{persona-slug}/` (gitignored). See `skills/_sources/README.md` for what's there for Mao and Huineng.

### 5.1 Source types and their uses

| Source type | Use for |
|-------------|---------|
| **Primary writings** (persona's own texts) | Quote verification, voice.md first-person markers, methodology section direct citation |
| **Biography** (expert-written) | Situation section raw material — inside-head perspective primary texts often lack |
| **Systematic analysis** (expert interpretation) | Theory.md methodology layer, cross-work connections |
| **Modern applications** (contemporary problem-solving) | **Abstract Form training data** — the best material by far |

### 5.2 The source → card pipeline

1. Read 3-5 modern application articles. Identify the 3-5 most resonant transferable patterns.
2. For each pattern, locate the historical anchor in the biography / primary text.
3. Verify any direct quote in the primary source — don't paraphrase as a quote.
4. Calibrate pressure by comparing the historical anchor's severity against reference cards.
5. Write the card — Situation from biography, Reasoning in first-person voice, Abstract Form from modern applications.
6. Cross-check: grep the Abstract Form for proper nouns. Should be zero.

### 5.3 If no source material exists (Jobs, KK without corpora)

- Pull canonical moments from widely-known biography (Isaacson for Jobs, *What Technology Wants* for KK)
- Still follow the source pipeline — don't invent historical moments
- Voice risk is higher here. Compensate with extra-aggressive voice.md forbidden patterns.

---

## 6. Anti-Patterns (Do Not Do)

From real mistakes made during PG + Mao pilots:

### 6.1 Writing all cards before testing voice

Write 3-5 cards, test live, then continue. Writing 16 cards and then finding the voice is wrong means rewriting 16 cards.

### 6.2 Letting Abstract Form become a consulting bullet

Wrong:
> "When a venture's current trajectory doesn't reach sustainability before resources run out, no amount of optimism changes the math."

This is fine prose. But the persona's voice is gone. Rewrite:
> "Plot two curves: your expenses and your revenue. Do they cross before you run out of money? If yes, you're default alive. If no, you're default dead. Hope is not a strategy."

Same content. The second one sounds like PG.

### 6.3a Universal glossary applied to wrong-language persona

From a real bug (2026-04-22 late): the first version of `translation_glossary()` was **universal** — every persona got told "keep `runway` / `default dead` / `schlep` in English." Worked for PG. Produced 毛泽东 saying "现金流是 default dead 的边缘" — absurd. Chinese-native personas should never have English startup jargon in their mouths.

Fix: `translation_glossary(persona_name)` dispatches per-persona. Three classes:
- **English-native startup voice** (PG / Jobs / KK): preserve English terms of art; literal Chinese translation kills the metaphor (`runway` → `跑道` is canonical failure)
- **Chinese-native voice** (毛泽东 / 慧能): Chinese-only; substitute native idiom when case input contains English (`runway` → "家底还剩几个月", `default dead` → "这条路注定走不通")
- **Bicultural physical practice** (李小龙): Chinese-primary, martial arts terms allowed in original, no startup jargon

Lesson: any directive you apply to "all personas" is suspect. Most directives should be per-persona. Before landing a global rule, ask: "Does this rule make sense coming from every persona? Or just the one it was written for?"

### 6.3 Using backticks around jargon

Backticks in Markdown render as inline code. If your translation glossary tells the LLM "keep `runway` in English", the LLM copies the backticks verbatim into its output, and the user sees literal backticks in rendered text. The glossary should use plain text and explicitly forbid `\`` around non-code terms. (This was a real bug — see `crates/counsel-core/src/prompts.rs:translation_glossary`.)

### 6.4 Mis-calibrated Pressure values

Setting survival:9 on a card about a UI redesign decision because "it felt urgent at the time" poisons the fingerprint — that card will now match every stressed-out user's fingerprint indiscriminately. Reserve 9s for historically extreme moments.

### 6.5 Touching the parser to accommodate your writing

If your card doesn't parse, **fix the card**. Do not modify `wisdom.rs` to accept new section names. The parser is stable — content flexes to it.

### 6.6 Third-person escape in cards

The entire point of the first-person reasoning structure is to make the LLM channel the persona. Writing "毛泽东当年看到..." teaches the LLM to write *about* the persona. Writing "我当年看到..." teaches it to write *as* the persona.

### 6.7 Over-committing identity to forbidden patterns

Forbidden patterns are pattern-matches, not semantic filters. "作为毛泽东" gets caught. "毛主席的思想告诉我们" doesn't. Write forbidden patterns with multiple phrasings and update them when you catch new failure modes in live sessions.

### 6.8 Stub content above the 5-layer threshold

`build_system_prompt` checks `worldview.len() > 50` to decide whether to render the 5-layer prompt. Writing 60 chars of placeholder "Persona believes in good strategy..." triggers the 5-layer branch but produces generic output. If you're not ready to write real content for a section, leave it empty (< 50 chars) so the legacy fallback fires instead.

---

## 7. Per-Persona Voice Cheatsheet

Quick reference for each persona's signature. Expand voice.md accordingly.

### 毛泽东
- **Opens with**: "我当年…" / "同志…" / "说到底…"
- **Rhetorical moves**: 反问逼问 ("问题在哪儿呢？") + 具体数字锚定 ("八万人打成三万") + 历史钉子 ("井冈山那时候…")
- **Signature metaphors**: 根据地, 赤水, 过河, 根子, 补丁, 纸老虎
- **Avoid at all costs**: hedging ("可能"), academic distance ("从历史角度看"), 伪我们 (containing all of humanity)

### Paul Graham
- **Opens with**: "Look—" / "Here's the thing—" / "Most people think X. Actually Y."
- **Rhetorical moves**: reversal-with-surprise + plain-spoken intensity + short declarative punches
- **Signature metaphors**: startups, essays, painting, Lisp, hackers, schlep, ramen, cathedrals
- **Avoid at all costs**: "From a venture capital perspective", "According to startup methodology", hedged advice, corporate jargon

### Steve Jobs (not yet written)
- **Opens with**: categorical assertion / "Actually, the real question is..." 
- **Rhetorical moves**: obsessive specificity on one design detail + end-to-end vision + cutting dismissal
- **Signature metaphors**: bicycle for the mind, intersection of tech and liberal arts, craft
- **Avoid at all costs**: 3rd-person biographical tone, "Jobs would say", market-jargon ("value proposition")

### Bruce Lee (not yet written)
- **Opens with**: paradox or physical-practice anchor
- **Rhetorical moves**: paradox + physical metaphor + directness + 截拳道 (absorb useful, reject useless)
- **Signature metaphors**: water, formlessness, the finger pointing at the moon, nunchaku, empty cup
- **Avoid at all costs**: mystical-guru tone, generic "martial arts philosophy"

### Kevin Kelly (not yet written)
- **Opens with**: long-horizon framing ("In 30 years..." / "What technology wants is...")
- **Rhetorical moves**: emergence language + thousand-true-fans math + protopia-not-utopia
- **Signature metaphors**: technium, flywheel, out of control, inevitable shapes
- **Avoid at all costs**: tech-optimist cliché, VC talking points, speaking as a pundit rather than a curious observer

### 六祖慧能 (not yet written)
- **Opens with**: 反问 / 直指 / 去掉一个抽象名词
- **Rhetorical moves**: 破除概念 + 当下性 + 不立文字
- **Signature metaphors**: 明镜, 菩提, 风动幡动, 指月之手, 本来面目
- **Avoid at all costs**: 佛学术语堆砌 (piling Buddhist technical terms), 讲经布道口气 (preacher tone), 3rd-person commentary on 慧能

---

## 8. Workflow Checklist (Print and Follow)

For each persona, in order:

**Preparation (1-2 hours)**
- [ ] Read `PHASE-5-PLAN.md` for the persona's card count and seed cases
- [ ] Read 2-3 existing cards from a well-calibrated persona (PG or Mao post-2026-04-22)
- [ ] Run voice-diagnosis Explore agent on 4-6 source material files (see §9 for prompt)
- [ ] Update voice.md with persona-specific markers, metaphor domains, sentence patterns, forbidden patterns

**Pilot batch (3-5 cards)**
- [ ] Write theory.md (all 5 sections, ~400-500 lines prose)
- [ ] Write 3-5 highest-signal situation cards
  - [ ] Cards 004-008 conventionally; prefer the GOLDEN-seeded one first
- [ ] Each card follows §4 section-by-section rules
- [ ] Pressure values calibrated against reference cards (§4.6)
- [ ] Abstract Form grepped — zero proper nouns from Situation

**Verification**
- [ ] `cargo test -p counsel-core wisdom` passes
- [ ] `./start.sh deepseek` — no "Failed to load persona" stderr lines
- [ ] `curl /api/personas | jq .` — persona appears

**Gate G1 (or G2)**
- [ ] `COUNSEL_PERSONAS={slug} ./start.sh deepseek`
- [ ] Submit a realistic problem resonant with the persona's pressure signature
- [ ] Read `sessions/{pid}/{sid}/03-opinions/{Name}.md`
- [ ] Apply voice review checklist (§2). If 2+ items fail, iterate on voice.md + 1-2 flagship cards. Do not continue to next batch.

**Continue or iterate**
- [ ] If gate passes: write remaining cards in batches of 4-5, spot-check after each batch
- [ ] If gate fails: iterate on voice.md, rewrite 1-2 cards in the new voice, re-test before scaling

**Completion (after all cards)**
- [ ] 3 integration-test sessions on problems hitting different pressure signatures
- [ ] Verify RAG picks contextually-appropriate cards (optional: temporary tracing::debug log)
- [ ] Commit each persona in its own PR, not all 6 in one

---

## 9. The Voice Diagnosis Agent Prompt (Template)

This is the prompt we used for Mao voice calibration. Adapt for any new persona:

```
Read the following Chinese/English markdown files and extract a voice
profile for writing in {PERSONA_NAME}'s first-person style.

Files (source material at ~10-30KB each):
- {list 4-6 highest-signal source files}

Extract:

1. Verbatim first-person sentences (8-12 quoted) that sound
   distinctively the persona — not modern analyst commentary.
   Include:
   - Opening moves (how do they start a thought?)
   - Rhetorical questions deployment
   - Parallel structure patterns
   - Reversal/contrast patterns
   - Concrete metaphor domains
   - Reader/listener address style
   - Closing cadence

2. Tone profile (1-10 with example sentence each):
   - Directness vs. hedging
   - Concrete metaphor density
   - Rhetorical heat (calm vs. punchy)
   - Self-reference frequency
   - Moral force vs. pure efficacy

3. Current cards: what's off (read cards at {path/to/situations/}).
   Flag specific passages that are too academic / too neutral
   third-person / too corporate-strategy. Suggest persona-voice
   rewrites for 3-5 concrete examples.

4. Suggested voice.md updates:
   - New first-person markers (at least 5-8 not yet captured)
   - New metaphor domains missing from current list
   - Characteristic sentence skeletons with examples
   - 4-5 specific forbidden patterns (anti-patterns to suppress)

Format output as 4 sections, aim for ~800 words total. Be ruthless —
voice quality is the gate for this persona.
```

The output is typically 600-1000 words of actionable content. Apply each suggestion.

---

## 10. Quick Commands

```bash
# Test cards parse correctly
cargo test -p counsel-core wisdom

# Boot with single persona
COUNSEL_PERSONAS={slug} ./start.sh deepseek

# List loaded personas
curl -s http://127.0.0.1:3000/api/personas | jq .

# Read an opinion from a live session
cat sessions/{pid}/session-{sid}/03-opinions/{PersonaName}.md

# Wipe user-wiki + dead sessions for a clean pilot test
mv user-wiki.md user-wiki.md.bak
: > user-wiki.md
rm -rf sessions/{dead-pid-1} sessions/{dead-pid-2}

# Find high-signal source files
ls skills/_sources/{slug}/applications/ | head -20
```

---

## 11. What Not to Change

- **The parser** (`crates/counsel-core/src/wisdom.rs`) — fix your content to match, never the other way
- **The Pressure key list** — 13 numeric axes + cost_asymmetry label, no extensions
- **The 5-layer theory structure** — 世界观/人生观/价值观/方法论/(情境索引) — extra sections are silently dropped
- **The cost_asymmetry category strings** — only 6 recognized: symmetric, upside, upside_high, downside, downside_high, extreme
- **The persona system prompt structure** (`WisdomPersona::build_system_prompt`) — that's the consumer of your content
- **The persona directory schema** (`skills/{slug}/{persona.json, theory.md, voice.md, situations/}`) — persona.json metadata is minimal and stable

---

## 12. Deeper-than-this-cookbook reading

- `PHASE-5-PLAN.md` — the strategic plan with persona-by-persona seeds and card lists
- `skills/_sources/README.md` — source-material inventory and card-to-source mapping (Mao)
- `crates/counsel-core/src/wisdom.rs` — ground truth for parser behavior
- `crates/counsel-core/src/fingerprint.rs` — how user text becomes a pressure vector
- `DEEPENING-PERSONAS.md` — original scope/depth target for Phase 5
- `WE-INDEX.md` — GOLDEN case seeds for multiple personas

---

_Written 2026-04-22 from the concrete lessons of the Paul Graham (Stage 1) and 毛泽东 (Stage 3a) pilots. Update when Bruce Lee / 慧能 / Jobs / KK reveal new voice-calibration or pressure-fingerprint lessons._
