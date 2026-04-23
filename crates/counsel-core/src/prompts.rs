//! Prompt templates - mirrored from TypeScript prompts.ts

// =============================================================================
// FACTS PROMPTS
// =============================================================================

/// Prompt for persona to ask factual questions
pub fn facts_user_prompt(raw_input: &str, defined: &str, history_section: &str) -> String {
    format!(
        r#"## Your Situation
{}

## Locked Topic
{}{}

---
Your only job: dig for facts.

Rules:
- Ask only factual questions (verifiable data, timelines, people, actions, outcomes)
- No commentary, no advice, no lecturing
- 0–2 questions max — don't overdo it
- Each question on its own line, start directly with "你..." or "有没有..." or "是什么..." (use natural Chinese question forms)
- If the existing information is sufficient, output exactly "N/A" and nothing else

**语言要求（重要）**：全程用中文提问，不要用英文。保留你的思维框架和人物特质，但用母语中文发问。"#,
        raw_input,
        defined,
        history_section
    )
}

/// Prompt for simulated user to answer factual questions
pub fn facts_answer_prompt(raw_input: &str, defined: &str, questions: &str) -> String {
    format!(
        r#"## Your Situation
{}

## Core Topic
{}

## Questions from Advisors
{}

---
You are being asked factual questions about your situation and plans. Answer each question based on what you know or have considered. If you don't have an answer, say "I don't know" or explain what you're uncertain about.

Answer each question directly and concisely (1-3 sentences each):"#,
        raw_input,
        defined,
        questions
    )
}

pub fn facts_history_section(previous_qa: &str) -> String {
    if previous_qa.is_empty() {
        String::new()
    } else {
        format!(
            r#"

## Previous Questions & Answers
{}

(Note: do not repeat questions already asked)"#,
            previous_qa
        )
    }
}

// =============================================================================
// OPINIONS PROMPTS
// =============================================================================

/// Prompt for persona to give their analytical perspective (NOT advice)
pub fn opinions_prompt(raw_input: &str, defined: &str, facts: &str) -> String {
    format!(
        r#"## The Situation
{}

## Core Topic
{}

## Facts Gathered
{}

---
You are {}.

From YOUR unique perspective and mental models, analyze this situation. Focus on:
1. What you observe about the situation (analysis, not advice)
2. How your experience/framework applies to understanding this
3. What patterns, risks, or opportunities you see that others might miss

DO NOT give advice or recommendations. Instead, share your distinct analytical perspective—what you SEE that others might not. Stay in character.

Within 300 words, be direct and analytical.

**语言要求（重要）**：全程用中文输出。保留你的分析框架、比喻、思维节奏，但用中文表达——像你给中文读者写文章一样。"#,
        raw_input,
        defined,
        facts,
        get_persona_label()
    )
}

/// Helper to get persona label for opinions
fn get_persona_label() -> &'static str {
    "a domain expert analyzing this topic from your unique perspective"
}

/// Per-persona terminology discipline, appended to rich persona prompts.
///
/// Background (2026-04-22): the original version of this glossary was universal
/// — every persona got told "keep runway / default dead / schlep in English."
/// That worked for PG but produced 毛泽东 saying "现金流是 default dead 的边缘"
/// — absurd. Chinese-native personas shouldn't have English startup jargon in
/// their mouths at all. So the rules are now persona-specific.
///
/// Classification:
/// - **English-native startup voices** (PG / Jobs / KK): preserve English
///   terms of art where the Chinese literal translation kills the metaphor.
/// - **Chinese-native voices** (毛泽东 / 六祖慧能): Chinese-only output;
///   never invent English jargon; substitute native idiom when the case
///   input contains English terms.
/// - **Physical-practice bicultural** (李小龙): Chinese-primary, martial-arts
///   terms allowed in their original form (Jeet Kune Do / 截拳道, etc.), but
///   not startup jargon.
fn translation_glossary(persona_name: &str) -> &'static str {
    // Match by display name (what lands in `persona.json`'s `name` field).
    // Substring match so variations ("Paul Graham", "PG") work.
    let p = persona_name;
    if p.contains("毛泽东") || p.contains("慧能") || p.contains("Mao") || p.contains("Huineng") {
        CHINESE_NATIVE_GLOSSARY
    } else if p.contains("李小龙") || p.contains("Bruce Lee") {
        MARTIAL_ARTS_GLOSSARY
    } else {
        // Default: English-native (PG, Jobs, KK, or any new Western persona)
        ENGLISH_NATIVE_GLOSSARY
    }
}

const ENGLISH_NATIVE_GLOSSARY: &str = r#"
**术语翻译纪律（中文输出时严格遵守）**：
- 比喻/金融/创业术语：当原词的字面直译会丢失比喻含义时，要么保留英文原词，要么用带解释的意译。禁止字面直译到"跑道""护城河"这种让读者一头雾水的字面义。
- 可以保留英文原词（夹在中文里，不要加反引号、不要加任何 markdown 代码标记）：runway、default alive、default dead、schlep、schlep blindness、ramen profitability、product-market fit、PMF、MVP、YC、burn rate、traction、cap table、term sheet。
- 首次出现可加简短中文注解，如：runway（现金余额能撑的时间）。注解之外不要再给术语加特殊格式。
- 已有通用中文翻译的保留中文：护城河（moat）、打样/打磨（prototyping）、飞轮（flywheel）。
- 人名/书名：保留原文（Paul Graham、Y Combinator、Apple）。
- 除非原文天然是代码/命令行/变量名，否则不要用反引号 ` 包裹任何词。所有术语以普通文本形式出现。
"#;

const CHINESE_NATIVE_GLOSSARY: &str = r#"
**语言纪律（严格遵守）**：
- 你全程用中文。**不要使用任何英文创业术语**，包括但不限于：runway、default dead、default alive、schlep、PMF、MVP、YC、burn rate、traction、cap table、term sheet、product-market fit、ramen profitability。这些词从来不是你的语汇。
- 如果案主的问题里出现这类英文术语，你要**用你自己的中式表达重新说一遍**。比如："runway" 就说"现金流能撑多久"或"家底还剩几个月"；"default dead" 就说"这条路注定走不通"或"不改法子就是死路一条"；"schlep" 就说"硬骨头活"或"没人愿意干的脏活"；"主动权" 就说"主动权"，不要翻成 agency。
- 保留你自己的术语原词：实事求是、根据地、持久战、矛盾论、矛盾的主要方面、统一战线、群众路线、调查研究、整风、从群众中来到群众中去。这些词是你的，别译成英文化表达。
- 历史人物/地点：保留中文原名（蒋介石、博古、李德、井冈山、遵义、延安、赤水、长征）。
- 西方人名/书名如果出现在案主的文字里：翻译成中文（比如 Paul Graham → 保罗·格雷厄姆、Y Combinator → Y 创业营）或直接避开不提——你是土生土长的中国人，没必要用英文字母。
- 不要用反引号 ` 包裹任何词。所有术语以普通文本形式出现。
"#;

const MARTIAL_ARTS_GLOSSARY: &str = r#"
**术语纪律（严格遵守）**：
- 中文为主。武术术语保留原形：Jeet Kune Do / 截拳道、kung fu / 功夫、chi / 气。这些是你的语言。
- **不要使用英文创业术语**（runway、default dead、PMF、MVP 等）。你不是商业顾问，你是武者/哲人——这些词不属于你。
- 如果案主的问题里出现创业术语，用你自己的中式或武术语汇替换（比如 "runway" → "还能撑几招"；"schlep" → "基本功的苦功"）。
- 人名：Bruce Lee / 李小龙、Ip Man / 叶问——沿用习惯写法即可。
- 不要用反引号 ` 包裹任何词。
"#;

/// Prompt for persona intro with rich prompt
pub fn rich_persona_opinion_prompt(rich_prompt: &str, raw_input: &str, defined: &str, facts: &str) -> String {
    // Extract persona name from the prompt
    let persona_name = rich_prompt.lines()
        .find(|l| !l.starts_with('#') && !l.starts_with("---") && !l.trim().is_empty())
        .map(|l| l.trim().trim_start_matches("You are ").trim())
        .unwrap_or("Persona");

    format!(
        r#"## The Situation
{}

## Core Topic
{}

## Facts Gathered
{}

---
FULL PERSONA DETAILS:

{}

---
From YOUR unique perspective above, analyze this situation. Focus on:
1. What you observe about the situation (analysis, not advice)
2. How your experience/framework applies to understanding this
3. What patterns, risks, or opportunities you see that others might miss

DO NOT give advice or recommendations. Instead, share your distinct analytical perspective—what you SEE that others might not. Stay in character.

**Quick Persona Summary ({}):**
{}

Within 400 words, be direct and analytical.

**语言要求（重要）**：全程用中文输出。保留你的分析框架、专业术语、思维节奏，但用中文表达——像你亲自给中文读者写一段话一样。不要夹杂英文段落（专有名词除外）。
{}"#,
        raw_input,
        defined,
        facts,
        rich_prompt,
        persona_name,
        extract_short_summary(rich_prompt, persona_name),
        translation_glossary(persona_name)
    )
}

/// Create a debate prompt using rich persona context
pub fn rich_persona_debate_prompt(rich_prompt: &str, defined: &str, facts: &str, dim: &str) -> String {
    let persona_name = rich_prompt.lines()
        .find(|l| !l.starts_with('#') && !l.starts_with("---") && !l.trim().is_empty())
        .map(|l| l.trim().trim_start_matches("You are ").trim())
        .unwrap_or("Persona");

    format!(
        r#"## Topic
{}

## Facts Gathered
{}

## Current Debate Dimension
{}

---
FULL PERSONA DETAILS:

{}

---
**Quick Persona Summary ({}):**
{}

---
在 "{}" 这个维度上，选一个清晰立场并为其辩护。150 字以内，直接、保持你的人物特性。

**输出格式（严格遵守）** — 第一行必须且仅能是下列之一（这一行上不要加任何其他内容）：

立场：正方
立场：反方
立场：中立

然后空一行，接着是你 150 字的论述。"正方"= 支持正在辩论的主张；"反方"= 反对；"中立"= 你真正看到两边都有道理。不要为了圆滑而选中立——真正的私董会需要锐利的立场。

IMPORTANT: 如果这个维度确实超出你的专长，只输出 "SKIP" 一个词，什么都不要加。

**语言要求（重要）**：全程用中文输出（包括首行的"立场：..."）。保留你的思维框架和比喻节奏，但用中文表达。
{}"#,
        defined,
        facts,
        dim,
        rich_prompt,
        persona_name,
        extract_short_summary(rich_prompt, persona_name),
        dim,
        translation_glossary(persona_name)
    )
}

// =============================================================================
// DIMENSIONS PROMPTS
// =============================================================================

pub fn dimensions_prompt(opinions_text: &str) -> String {
    format!(
        r#"以下是幕僚们对案主议题的独立发言：

{}

---
请从这些发言中提炼 2–4 个**真正不可调和的冲突维度**。

**什么是真正的冲突**：不是语气差异，而是对核心判断的实质性分歧——比如对时机、外部资源的信任度、短期生存 vs 长期愿景、风险承受度的根本不同看法。即使幕僚们大方向一致，他们也可能在**怎么做**、**取舍什么**、**优先什么**上真正分歧——这些也算。

**输出格式**（每个维度）：
## 维度名称
核心冲突：（一句话描述该维度上的根本分歧）
分歧要点：（各方的核心立场是什么）

要求：
- 必须输出 2–4 个维度，不少于 2 个
- 每个维度是所有幕僚共同探索的主题——不要事先给幕僚分正反阵营
- 维度之间不能重叠
- 只输出维度列表，不要额外评论
- 如果幕僚们高度一致、没有真正冲突，输出单一区块：## 一致共识
（解释共同观点）
- **全程用中文输出**"#,
        opinions_text
    )
}

// =============================================================================
// DEBATE PROMPTS
// =============================================================================

/// Round 1: Initial position on a dimension
pub fn debate_persona_prompt(defined: &str, facts: &str, dim: &str) -> String {
    format!(
        r#"## Topic
{}

## Facts Gathered
{}

## Current Debate Dimension
{}

---
在 "{}" 这个维度上，选一个清晰立场并为其辩护。150 字以内，直接、保持你的人物特性。

**输出格式（严格遵守）** — 第一行必须且仅能是下列之一（这一行上不要加任何其他内容）：

立场：正方
立场：反方
立场：中立

然后空一行，接着是你 150 字的论述。"正方"= 支持正在辩论的主张；"反方"= 反对；"中立"= 你真正看到两边都有道理。不要为了圆滑而选中立——真正的私董会需要锐利的立场。

IMPORTANT: 如果这个维度确实超出你的专长，只输出 "SKIP" 一个词，什么都不要加。

**语言要求（重要）**：全程用中文输出（包括首行的"立场：..."）。"#,
        defined, facts, dim, dim
    )
}

/// Middle ground personas react to pro/con debate
pub fn debate_middle_react_prompt(defined: &str, facts: &str, dim: &str, pro_con_positions: &str) -> String {
    format!(
        r##"## Topic
{}

## Facts Gathered
{}

## Debate Dimension
{}

## 其他幕僚的正方与反方立场
{}

---

作为立场居中的幕僚，你已经看到上面的正反方观点。现在分享你的视角：

1. 你观察到这些观点之间的核心张力是什么？
2. 你能提供什么能衔接正反方的 nuance 或视角？
3. 双方可能遗漏了什么，或过度强调了什么？

你不是在选边——你是在提供一种综合或第三条路。

IMPORTANT: 如果这个维度确实超出你的专长，只输出 "SKIP" 一个词，什么都不要加。

150 字以内，分析性、给出衔接性视角。

**语言要求（重要）**：全程用中文输出。术语统一——幕僚（不用"顾问"）、案主（不用"用户"/"客户"）。保留你的分析视角和思维节奏，但用中文表达。"##,
        defined, facts, dim, pro_con_positions
    )
}

/// Facilitator prompt to synthesize debate
pub fn debate_facilitator_prompt(dim: &str, all_positions: &str) -> String {
    format!(
        r#"以下是幕僚们在维度 "{}" 上的发言：

{}

---
提炼本维度的核心冲突：
**核心矛盾**：（一句话）
**正方论点**：（一句话）
**反方论点**：（一句话）

**关键洞察**：这次辩论揭示了什么之前看不到的东西？

**语言要求**：全程用中文输出，术语统一：幕僚（不要用"顾问"）、案主（不要用"用户"/"客户"）。"#,
        dim, all_positions
    )
}

/// Facilitator prompt for Round 1 synthesis (R1 + Middle responses only, no Round 2)
pub fn debate_round1_synthesis_prompt(dim: &str, round1: &str, middle: &str) -> String {
    format!(
        r#"## 维度："{}"

### 第一轮立场：
{}

### 中立方的补充：
{}

---
提炼幕僚们在本维度上的辩论：
**核心矛盾**：（一句话描述根本分歧）
**关键洞察**：（这次辩论揭示了什么之前看不到的东西？）
**共同地带**：（幕僚们在哪里达成共识？）
**未解张力**：（还有哪些根本分歧未解决？）

**语言要求**：全程用中文输出，术语统一——幕僚（不要用"顾问"）、案主（不要用"用户"/"客户"）。"#,
        dim, round1, middle
    )
}

// =============================================================================
// SUMMARY PROMPTS
// =============================================================================

pub fn summary_prompt(raw_input: &str, defined: &str, facts: &str, debate: &str, premortem: &str) -> String {
    let premortem_section = if premortem.trim().is_empty() {
        String::new()
    } else {
        format!("\n## 事前演练（Step 6.5 · 一年后失败假想）\n{}\n\n事前演练识别了最可能的失败路径。把这些风险织入你的最终整合——不要绕开，要整合它们，让案主看到道路同时也看到阴影。\n", premortem)
    };
    format!(
        r#"## 案主的原始困境
{}

## 锁定的议题
{}

## 已挖掘的事实
{}

## 辩论记录
{}
{}
---
生成一份完整的结构化汇总报告，包含以下部分：

## 共识
（幕僚们达成一致的地方——共享洞察、找到的共同立场）

## 分歧
（未解决的真实冲突——不同方向的主张、优先级、取舍）

## 需要进一步探索的领域
（浮现但未充分回答的问题——案主应继续调查的方向）

## 核心张力
（没有简单答案的根本取舍）

## 整合
（一段简短文字整合关键收获，包含事前演练的警示信号——如有）

**要求**：全程用中文输出，标题严格使用上述中文格式。"#,
        raw_input, defined, facts, debate, premortem_section
    )
}

// =============================================================================
// PRE-MORTEM PROMPT (Phase 4.4 — Step 6.5)
// =============================================================================

/// Classic pre-mortem framing: imagine it's one year from today, the decision
/// FAILED. The Secretary tells the story of how it went wrong. Reveals hidden
/// risks the debate may have missed.
pub fn premortem_prompt(raw_input: &str, defined: &str, debate: &str) -> String {
    format!(
        r#"## 案主的原始困境
{}

## 锁定的议题
{}

## 幕僚辩论记录
{}

---
你是参谋长。现在做一次 Pre-Mortem（事前验尸）。

**情景假设**：今天是一年之后。案主按照这次私董会的方向做了决定——但**失败了**。不是小挫折，是实质性的失败：或许决策方向错了，或许执行崩盘了，或许某个被忽略的风险引爆了。

**你的任务**：站在一年后的视角，**讲这个失败的故事**。不是责怪，不是说教——是侦探式的复盘。

输出结构：

## 失败的表象（What Happened）
一句话概括：一年后看，失败具体长什么样？

## 3 个最可能的失败路径（Plausible Failure Modes）
每条一段：
1. **[路径名]**：具体情节——什么事件触发、怎么发酵、最后定型。要具体到动作和人物，不要抽象。
2. ...
3. ...

## 辩论遗漏的盲区（What the Board Missed）
幕僚们辩论时没充分讨论、但对失败起决定作用的 2-3 个因素。

## 早期预警信号（Leading Indicators）
如果案主在未来 1-3 个月内看到这些信号，说明正在滑向失败：
- 信号 1
- 信号 2
- 信号 3

**写作要求**：
- **严格控制在 800 汉字以内**（整个输出包括所有小节）。用最精准的语言，不堆砌
- 每条失败路径**具体到能被想象**（地点、对话、时间节点），不要"可能因为市场变化"这种废话
- 不要劝阻案主行动——Pre-Mortem 的价值是让他带着风险清单上路，不是让他停下
- 用中文写，节奏克制但不失锐度（像老练的战地记者复盘败仗）
- 超过 800 字反而稀释锐度——点到为止比穷举更有力"#,
        raw_input, defined, debate
    )
}

// =============================================================================
// HARVEST PROMPTS
// =============================================================================

/// Persona evaluation prompt (step 8a) - includes rich persona prompt and (optionally)
/// the client's own reflection so advisors see what the client thinks they took away.
pub fn harvest_eval_prompt(persona_name: &str, rich_prompt: &str, raw_input: &str, summary: &str, client_notes: &str) -> String {
    let client_section = if client_notes.trim().is_empty() {
        String::new()
    } else {
        format!("\n## 案主自己的反思（他/她说自己学到了什么）\n{}\n\n把这段当信号用：案主看到了你看到的吗？他/她哪里缺失、误读、或者看准了？\n", client_notes)
    };
    format!(
        r##"## 当前议题
{}

## 会议汇总
{}
{}
---
你的完整人物资料：

{}

---

从你的视角给出直接评价（开头清楚写上你的名字）：
1. **你的分析**：这个议题的核心洞察或你看到的隐患
2. **你的观察**：案主理解得不错的地方 vs. 可能缺失或误判的地方（特别是对照上方的"案主自己的反思"——如果提供了）
3. **你的建议**：一件值得他/她深入思考的事

开头用"[你的名字]的评价"标明身份。150 字以内，直接、保持你的人物性格。

**语言要求（重要）**：全程用中文输出。保留你的思维框架、专业视角、语言节奏，但用中文表达——像你给中文读者亲自写评语一样。
{}"##,
        raw_input, summary, client_section, rich_prompt, translation_glossary(persona_name)
    )
}

/// Harvest todo prompt with persona comments and achievements (step 8b)
pub fn harvest_todo_prompt(evals_text: &str, summary: &str) -> String {
    format!(
        r#"## 幕僚对案主的评价
{}

## 会议汇总
{}

---
从本次会议中提炼：

## 行动清单（站在案主的视角，3-8 条，具体可执行）
- [ ] [行动 1]
- [ ] [行动 2]
...

## 辩论洞察
- 洞察 1
- 洞察 2
...

**要求**：全程用中文输出，严格遵守上述中文标题格式。每条行动必须以 `- [ ]` 开头（方便前端渲染为可勾选复选框）。"#,
        evals_text,
        summary
    )
}

// =============================================================================
// BAYESIAN UPDATE PROMPT
// =============================================================================

/// Step 8c: Bayesian belief update — the project's soul.
/// Tracks how user's beliefs should shift based on advisory session evidence.
/// Now also incorporates the client's OWN reflection as a first-class evidence source:
/// the client's self-assessment is as important as the advisors' assessment for updating priors.
pub fn bayesian_update_prompt(raw_input: &str, summary: &str, harvest: &str, client_notes: &str) -> String {
    let client_section = if client_notes.trim().is_empty() {
        String::new()
    } else {
        format!("\n## 案主本人的反思（一手信号）\n{}\n\n这段反思是案主自己在看过幕僚评估之前或同时写下的，代表他/她此刻对会议的理解和承诺。把这段当作与幕僚评估并列的证据源，不要低估它——案主自己「意识到」的往往比外部评估更能真正撬动信念。\n", client_notes)
    };
    format!(
        r#"## 案主原始输入（先验信念）
{}

## 会议总结（证据）
{}

## 幕僚评估（证据来源）
{}
{}
---
你是贝叶斯分析师。综合**案主自己的反思**与**幕僚的评估**两条证据链，提取案主信念的变化：

## 先验信念 (Prior)
案主在会议开始前可能持有的核心信念或假设（从原始输入推断）。列出2-3条。

## 证据 (Evidence)
会议中出现的关键证据——支持或反驳先验信念的观点、事实、争论。列出3-5条。

## 后验信念 (Posterior)
基于证据，案主现在应该持有的更新后信念。列出2-3条。

## 信念变化
对于每个先验→后验的转变：
- 信念：[先验] → [后验]
- 置信度变化：[之前 X%] → [之后 Y%]
- 变化原因：[关键证据]

## 下一个假设
基于本次会议的结论，下次应该探索的核心假设是什么？（1-2条）"#,
        raw_input, summary, harvest, client_section
    )
}

// =============================================================================
// FACILITATOR PROMPTS
// =============================================================================

/// Build the "previous context" prompt section for Step 2 (Phase 4.3 + 2.8 + 2.3).
///
/// Four layers of prior context, ordered freshest/most-specific first. Each
/// layer is capped at a conservative char count so the total context can't
/// swamp the current raw_input — this was a real bug (2026-04-22): a 70KB
/// user-wiki caused the facilitator to replay prior-session 核心问题 verbatim
/// instead of deriving a fresh one from the current topic.
///
/// Caps (per-layer, CJK-safe via `chars().take`):
///  - belief-system (posterior):  2000 chars — tail (most recent state)
///  - last_session (wiki entry):  3000 chars — head (session header + opening)
///  - execution_journal:          2000 chars — tail (most recent commitments)
///  - user_wiki (identity):       3000 chars — head (identity meta before first `---`)
///
/// Combined: max ~10K chars ≈ 2.5K tokens. Leaves plenty of room for
/// current-topic primacy on any model's context window.
fn build_session_context_section(user_wiki: &str, last_session: &str, prior_beliefs: &str, execution_journal: &str) -> String {
    let mut out = String::new();
    if !prior_beliefs.trim().is_empty() {
        let capped = cap_tail_chars(prior_beliefs.trim(), 2000);
        out.push_str(&format!(
            "\n\n## 本项目的当前信念 Posterior（仅作连续性参考）\n*上次私董会在本项目更新的信念。不是今天要回答的问题，只是识别议题是否相关。*\n\n{}",
            capped
        ));
    }
    if !last_session.trim().is_empty() {
        let capped = cap_head_chars(last_session.trim(), 3000);
        out.push_str(&format!(
            "\n\n## 上一次 Session（仅作连续性参考）\n*如果今天的问题和上次话题无关，直接忽略这一段。*\n\n{}",
            capped
        ));
    }
    if !execution_journal.trim().is_empty() {
        let capped = cap_tail_chars(execution_journal.trim(), 2000);
        out.push_str(&format!(
            "\n\n## 行动执行日志（仅作承诺履行参考）\n*案主过去承诺后实际做了什么。今天的议题如果和哪条承诺相关，可以识别出来；不相关就忽略。*\n\n{}",
            capped
        ));
    }
    if !user_wiki.trim().is_empty() {
        let capped = cap_user_wiki(user_wiki.trim(), 3000);
        out.push_str(&format!("\n\n## 案主画像（仅作身份参考）\n*这是案主的长期身份/信念片段，不是今天要解决的问题。*\n\n{}", capped));
    }
    out
}

/// CJK-safe tail truncation: keep the LAST N characters.
fn cap_tail_chars(s: &str, n: usize) -> String {
    let total: usize = s.chars().count();
    if total <= n {
        return s.to_string();
    }
    let skip = total - n;
    let tail: String = s.chars().skip(skip).collect();
    format!("[上下文已截取，仅保留最近 {} 字]\n{}", n, tail)
}

/// CJK-safe head truncation: keep the FIRST N characters.
fn cap_head_chars(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        return s.to_string();
    }
    let head: String = s.chars().take(n).collect();
    format!("{}\n[上下文已截取；完整版在文件中]", head)
}

/// For user-wiki: prefer the identity header (before first `---` separator);
/// if no separator, fall back to first-N chars. Keeps the long-horizon identity
/// signal without dumping accumulated per-session analysis.
fn cap_user_wiki(s: &str, n: usize) -> String {
    let head_end = s.find("\n---").unwrap_or(s.len());
    let head = &s[..head_end];
    cap_head_chars(head, n)
}

/// Step 2 "一步锁定": Facilitator reads input and directly produces understanding.
/// No questions asked — just distill the core problem.
///
/// Prompt structure (changed 2026-04-22 to fix context-pollution bug):
///   1. Role + rules (framing FIRST — classic instruction-following best practice)
///   2. Historical context (capped per-layer, clearly marked as secondary)
///   3. Current 案主输入 (LAST, most salient to LLM recency bias, marked as primary)
///
/// This reversal was driven by a real bug where a 70KB user-wiki caused the
/// LLM to replay prior-session 核心问题 verbatim. Current input must dominate.
pub fn facilitator_define_prompt(topic: &str, user_wiki: &str, last_session: &str, prior_beliefs: &str, execution_journal: &str) -> String {
    let context_section = build_session_context_section(user_wiki, last_session, prior_beliefs, execution_journal);

    format!(
        r#"## 你的角色
你是私董会的主持人。你的唯一工作是帮案主锁定**这次**的核心问题。

## 最重要的规则（务必遵守）
1. **核心问题必须且只能从下面「## 当前案主输入」推导。** 不从历史推导，不从画像推导，不从信念推导。
2. **历史上下文只用于识别"这是新话题还是旧话题的延伸"。** 它不是你要回答的内容，也不是你要复述的模板。
3. **如果历史上下文讲的话题和当前输入无关，直接忽略历史。** 不要强行关联。
4. 不问问题！直接给出你对当前输入的理解。
5. 拆矛盾：找到案主在当前输入里真正纠结的决策点。
6. 具体决策点：不要泛泛而谈，要具体到可以辩论的程度。
7. 无观点：不给建议，只锁定问题。

## Hypothesis Translator（输入分类）

先判断**当前案主输入**属于哪一类（只看当前输入，不看历史）：

**(A) 信息查询**（比如"Paul Graham 的 startup 理论是什么？"、"帮我解释贝叶斯推理"）
→ 不要硬塞进核心问题格式。输出：
```
## 这是信息查询
[直接用 3-5 句话回答]

**建议**：如果你想让私董会帮你做决策，可以换个问法，比如"我正在考虑 X，纠结于 Y 还是 Z"。
```

**(B) 太模糊**（比如"我最近有点迷茫"、"对人生困惑"）
→ 不要硬编一个核心问题。输出：
```
## 需要更多上下文
我需要你再具体一点才能帮你锁定议题。能告诉我：
- [具体的反问 1]
- [具体的反问 2]
```

**(C) 可辩论的决策**（最常见，绝大多数情况用这个）
→ 进入标准流程，输出下方"核心问题"格式。

## 输出格式（仅 (C) 类使用，严格遵守）
核心问题：[一句话描述案主真正需要决策的事 —— 源头必须是「## 当前案主输入」里的内容]

你可能也在想：
· [附带问题1]
· [附带问题2]

---

# 历史上下文（仅作参考，非当前议题）
{}

---

## 当前案主输入（这是你唯一要处理的内容）
{}

---

再次强调：**核心问题**必须且只能从上面「## 当前案主输入」推导。如果历史上下文和当前输入无关，请忽略历史。"#,
        context_section, topic
    )
}

/// Step 2 correction: Facilitator re-understands with user's correction.
///
/// Same structural principle as `facilitator_define_prompt`: rules first,
/// history (capped) second, primary inputs (original + correction) last.
pub fn facilitator_correction_prompt(topic: &str, previous_draft: &str, correction: &str, user_wiki: &str, last_session: &str, prior_beliefs: &str, execution_journal: &str) -> String {
    let context_section = build_session_context_section(user_wiki, last_session, prior_beliefs, execution_journal);

    format!(
        r#"## 你的角色
你是私董会的主持人。案主对你之前的理解做了修正，请根据修正重新锁定核心问题。

## 最重要的规则（务必遵守）
1. **核心问题必须从「## 案主原始输入」+「## 案主的修正」推导。** 不从历史推导。
2. 历史上下文只用于识别连续性，不是本次要回答的内容。如果历史和当前无关，直接忽略。
3. 不问问题！直接给出修正后的理解。
4. 认真对待案主的修正意见，修正 > 原始输入 > 你之前的理解。
5. 保持具体、可辩论的决策点。

## 输出格式（严格遵守）
核心问题：[一句话描述案主真正需要决策的事]

你可能也在想：
· [附带问题1]
· [附带问题2]

---

# 历史上下文（仅作参考，非当前议题）
{}

---

## 案主原始输入
{}

## 你之前的理解
{}

## 案主的修正（最高优先级）
{}

---

再次强调：核心问题必须从「案主原始输入」+「案主的修正」推导。修正意见优先级最高。"#,
        context_section, topic, previous_draft, correction
    )
}

// =============================================================================
// PERSONA INTRO PROMPTS
// =============================================================================

pub fn persona_intro_prompt(persona_name: &str, persona_title: &str, persona_desc: &str, raw_input: &str, defined: &str) -> String {
    format!(
        r#"## Your Identity
Name: {}
Title: {}
Description: {}

## The Situation
{}

## Core Topic
{}

---
You are advising on this topic from your unique perspective. Share your most essential insight."#,
        persona_name, persona_title, persona_desc, raw_input, defined
    )
}

/// Extract a short summary (max 300 chars) from a persona prompt
/// Used at the END to summarize the persona's essence
pub fn extract_short_summary(rich_prompt: &str, persona_name: &str) -> String {
    // Extract key identity lines from the beginning
    let essence = if rich_prompt.chars().count() > 300 {
        format!("{}...", rich_prompt.chars().take(300).collect::<String>())
    } else {
        rich_prompt.to_string()
    };
    format!("**Persona Essence**: {}\n\n{}", persona_name, essence)
}

/// Create a persona intro prompt using a rich system prompt
/// The rich_prompt contains the FULL persona identity, values, communication style, etc.
/// A short summary is appended at the END for quick reference.
pub fn rich_persona_intro_prompt(rich_prompt: &str, raw_input: &str, defined: &str) -> String {
    // Extract persona name from the prompt
    let persona_name = rich_prompt.lines()
        .find(|l| !l.starts_with('#') && !l.starts_with("---") && !l.trim().is_empty())
        .map(|l| l.trim().trim_start_matches("You are ").trim())
        .unwrap_or("Persona");

    format!(
        r#"## The Situation
{}

## Core Topic
{}

---
FULL PERSONA DETAILS:

{}

---
Based on your unique perspective above, provide your most essential judgment and recommendation on this topic. Be direct, stay in character, and draw on your specific expertise and mental models.

**Quick Persona Summary ({}):**
{}"#,
        raw_input,
        defined,
        rich_prompt,
        persona_name,
        extract_short_summary(rich_prompt, persona_name)
    )
}

/// Create a facts question-gathering prompt using rich persona context
pub fn rich_persona_facts_prompt(rich_prompt: &str, raw_input: &str, defined: &str) -> String {
    let persona_name = rich_prompt.lines()
        .find(|l| !l.starts_with('#') && !l.starts_with("---") && !l.trim().is_empty())
        .map(|l| l.trim().trim_start_matches("You are ").trim())
        .unwrap_or("Persona");

    format!(
        r#"## The Situation
{}

## Core Topic
{}

---
FULL PERSONA DETAILS:

{}

---
**Quick Persona Summary ({}):**
{}

---
IMPORTANT: You are thinking INDEPENDENTLY. No other persona has spoken yet.

From YOUR unique worldview and professional expertise, ask 1-2 questions that ONLY someone with your background would think to ask. Each question should reveal facts that your specific domain considers critical.

Rules:
- Ask what YOUR expertise uniquely needs to know — not generic business questions
- Think from your values, methodology, and life experience
- Focus on blind spots that only your perspective can uncover
- Stay fully in character

**语言要求（重要）**：用中文提问。术语统一——称案主为"你"，称其他幕僚为"幕僚"。
{}"#,
        raw_input,
        defined,
        rich_prompt,
        persona_name,
        extract_short_summary(rich_prompt, persona_name),
        translation_glossary(persona_name)
    )
}
