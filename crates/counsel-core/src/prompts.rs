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

**输出长度（铁律，不可违反）**：
- **硬上限 300 个汉字**。这不是上限是目标 —— 你应该力求 200-280 字之间。
- **不准说废话**。禁止：开场寒暄、回顾问题、感性铺垫、举多个例子、总结收尾段。
- **不准列分支**：禁止「一方面...另一方面」「首先...其次...最后」这种 3-bullet 结构。**只给一个最锋利的判断**。
- **不准引用自己**：禁止「我作为 X」「以我的经验」开头 —— 直接说观点。
- 一句完整中文句子结尾。临近 270 字时立刻收尾，剩下的不写。
- 案主只想看**你最锐的那一刀**。多一个字都是噪音。

**语言要求**：全程中文。保留你的视角和比喻，但**不给冗长的论证**。"#,
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

**锚点纪律（与 Step 3 一致）**：
- 引用自己的历史 / 经历 anchor 必须 **load-bearing**——直接照亮你正在分析的当前议题
- 找不到能照亮当前议题的 anchor 就**直接抽象分析**——硬塞故事比不写更糟
- **严禁用故事开头铺垫**（"我当年..." / "我先讲一件事..." 作为 opener）
- 如果用 anchor，1 句即可（具体年份/地名/人物 + 一句关联），**不要长篇展开**

**输出长度（铁律，不可违反）**：
- **硬上限 300 个汉字**。目标 200-280 字。多一个字都是噪音。
- **禁止**：开场寒暄、回顾问题、感性铺垫、多例堆砌、总结收尾段。
- **禁止 3-bullet 分支**：不要「一方面...另一方面」「首先...其次...最后」。只给一个最锋利的判断。
- **禁止自我介绍**：不要「我作为 X」「以我的经验」开头 —— 直接说观点。
- 一句完整中文句子结尾。临近 270 字立刻收尾。
- 案主只想看**你最锐的那一刀**。

**语言要求**：全程中文。不夹英文段落（专有名词除外）。
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

**锚点纪律（与 Step 3 一致）**：
- 引用自己的历史 / 经历 anchor 必须 **load-bearing**——直接照亮你这一立场的逻辑
- 找不到能照亮的 anchor 就**直接论证**——硬塞故事比不写更糟
- **严禁用故事开头铺垫**——立场必须先出，故事最多在最后 1 句作支撑
- 如果用 anchor，1 句即可（具体年份/地名/人物 + 一句关联），不要长篇展开

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

**锚点纪律（与 Step 3 一致）**：
- 引用自己的历史 / 经历 anchor 必须 **load-bearing**——直接照亮你这一立场的逻辑
- 找不到能照亮的 anchor 就**直接论证**——硬塞故事比不写更糟
- **严禁用故事开头铺垫**——立场必须先出，故事最多在最后 1 句作支撑
- 如果用 anchor，1 句即可（具体年份/地名/人物 + 一句关联），不要长篇展开

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
**结论先行 + bullet-first（2026-04-25 改版）**：废话压缩到底，让案主 30 秒读完。

格式要求（严格遵守）：

**结论：** 一句话整合，≤40 字，必须可执行或可决策。

## 共识
- 至多 3 条，每条 ≤30 字。直接陈述，不说理由。

## 分歧
- 至多 3 条，每条 ≤30 字。格式：「{{阵营A}} vs {{阵营B}}：{{分歧点}}」

## 张力
- 至多 2 条，每条 ≤30 字。指出无解的取舍。

## 下一步
- 至多 3 条，每条 ≤30 字，动词开头。

**硬性约束**：
- **不要**写完整段落、铺垫、过渡句（结论卡部分）
- **不要**重复辩论原话——只提炼
- 结论卡部分（结论 + 4 sections）总字数控制在 **350 字以内**
- 如有事前演练警示，并入「张力」或「下一步」一条 bullet，不另起 section
- 全程用中文，术语统一（幕僚 / 案主）

---

**Mode B · 详细分析（可选展开层）**：

在结论卡之后，**必须**单独追加一个 `## 详细分析` section（≤400 字），用散文写：

- 把 4 个 bullet section 中**最不显眼、但最关键**的关联点串起来
- 指出案主可能漏看的「为什么这几条 bullet 一起出现」的隐含信号
- 用主持人的视角说一段「如果我是你，我下一周会先盯哪个 bullet 跑」
- 不要重复 bullet 的内容，要给 bullet **没说出来的语义**

**重要**：这一段会被前端默认折叠（`<details>` 形式），案主点击展开才看。所以可以多说一点深度，但仍然要简明扼要——是「为想看的人提供深度」，不是「为长度堆字数」。"#,
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

输出结构（铁律：紧凑，不堆砌）：

## 失败的表象
一句话：一年后看，失败具体长什么样？（≤30 字）

## 2 条最可能的失败路径
1. **[路径名]**：1-2 句，具体到事件触发 + 怎么发酵。
2. **[路径名]**：1-2 句。

## 辩论遗漏的盲区
2 条，每条一句话即可。

## 早期预警信号
3 条 bullet，每条 ≤15 字。

**铁律（不可违反）**：
- **整个输出 ≤ 500 个汉字**。这不是建议是硬约束。
- 失败路径只给 2 条（不是 3 条），盲区 2 条（不是 3 条）。够锐就行，不堆砌。
- **禁止开场寒暄**（"好，让我..." / "现在我作为..."）—— 直接进入小节内容。
- **禁止泛泛**（"市场可能变化" "竞争加剧"）—— 必须具体到事件 + 动作。
- 全程中文。点到为止比穷举更有力。"#,
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

从你的视角给出直接评价 + actionable 建议。**结论先行**：

格式（严格遵守）：

**[你的名字]的评价：** 第一句话就是你给案主的最终判断（≤30 字，可断言或可警告）。

然后用 **3 个 bullet** 展开：
- **洞察**：你看到的核心命题或隐患（≤30 字）
- **观察**：案主哪里看准、哪里误判（特别对照"案主自己的反思"，≤30 字）
- **建议行动**：「[动词][宾语]」+ 一句话 why（≤40 字）。**必须以动词开头**（做/写/见/停/砍/找/约/测/学/砍掉/搁置 等），给案主一个具体可执行的下一步。**严禁**："深思 X" / "考虑 X" / "反思 X" 这种 reflection-only 词——你是幕僚，不是观察员；你的工作是告诉案主**该干什么**，不是再多想想。

**锚点纪律（与 Step 3 一致）**：
- 引用自己的历史 / 经历 anchor 必须 **load-bearing**——直接照亮你正在评价的内容
- 找不到能照亮的 anchor 就**直接评价**——硬塞故事比不写更糟
- **严禁用故事开头铺垫**——结论必须先出，故事最多 1 句作支撑
- 如果用 anchor，1 句即可，不要长篇展开

总字数 **≤150 字**，直接、保持你的人物性格。

**语言要求（重要）**：全程用中文输出。保留你的思维框架、专业视角、语言节奏，但用中文表达——像你给中文读者亲自写评语一样。
{}"##,
        raw_input, summary, client_section, rich_prompt, translation_glossary(persona_name)
    )
}

/// Harvest todo prompt — aggregate advisors' explicit "建议行动" bullets into a
/// final to-do list with attribution. **No more LLM-inferred todos.**
///
/// Phase 4 (2026-04-26): Each advisor's harvest_eval output now contains an
/// explicit "建议行动" bullet (动词 + 宾语 + why). This prompt extracts those
/// recommendations and aggregates them — same advice from multiple advisors
/// merges into one todo with attribution showing all recommenders.
pub fn harvest_todo_prompt(evals_text: &str, summary: &str) -> String {
    format!(
        r#"## 幕僚对案主的评价 + 建议行动
{}

## 会议汇总（参考用）
{}

---
你是私董会秘书。**你的工作不是发明 todo——是把每位幕僚已经 explicit 给出的「建议行动」聚合成可执行清单**。

## 任务

1. 从上面每位幕僚的评价里提取「**建议行动**」那一行（已经是「动词 + 宾语 + why」格式）
2. 同义合并：多位幕僚说类似的（例如三个人都说"先做 5 个付费访谈"），合并成一条 todo，attribution 列出所有推荐者
3. 不同建议保留为独立 todo
4. **不要发明任何不在幕僚建议里的 todo**——你是聚合，不是创作

## 输出格式（严格遵守）

## 行动清单（站在案主的视角）
- [ ] **[动词][宾语]** — [why ≤30 字]（[毛 · PG]）
- [ ] **[动词][宾语]** — [why ≤30 字]（[钱学森]）
...（5-8 条，按重要性排序）

## 辩论洞察
- 洞察 1（≤30 字）
- 洞察 2（≤30 字）
...

**要求**：
- 全程用中文输出
- 每条 todo 必须以 `- [ ]` 开头（前端渲染复选框）
- attribution 用括号在末尾标明来自哪位幕僚（多位用 ` · ` 分隔，例：(毛 · PG · 钱学森)）
- 如果某位幕僚的建议格式不规范、或没给出明确动词，**主动跳过它**而不是强行汇总——保留质量比保留数量重要"#,
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
你是贝叶斯分析师。**结论先行 + bullet-only（2026-04-25 改版）**：让案主 20 秒读完信念变化。

格式要求（严格遵守）：

**信念变化：** 一句话总结案主最关键的信念翻转，≤35 字。

## 先验 → 后验
- 至多 3 条，格式：「{{先验信念}} → {{后验信念}}」，每条 ≤30 字
- 跳过没有真正变化的信念，不要凑数

## 关键证据
- 至多 3 条，每条 ≤25 字。指明这条证据来自哪位幕僚或案主反思

## 置信度
- 1 条概括：「整体方向 {{提升/下降/转向}} N 档」≤25 字

## 下一假设
- 1 条，≤30 字，案主下次应主动验证的核心假设

**硬性约束**：
- **不要**任何段落式说理或重复引用
- 总字数 **≤200 字**
- 全程用中文"#,
        raw_input, summary, harvest, client_section
    )
}

// =============================================================================
// SECRETARY · CORE FACT EXTRACTION (B2 — user-wiki tier)
// =============================================================================

/// Distil ≤3 cross-session, identity-level facts from one freshly-completed
/// session block. Output is parsed by `CoreFact::parse` (one fact per line in
/// `[entity | relation | fact | yyyy-mm-dd]` format) and merged into the
/// always-loaded `core.md` with FIFO eviction. Anything that's a one-off
/// detail of THIS session goes into `log/{sid}.md` instead — not here.
pub fn secretary_extract_core_facts_prompt(session_block: &str, today: &str) -> String {
    format!(
        r#"你是私董会的秘书。任务：从下面这次刚结束的 session 中，提炼 **至多 3 条** 跨 session 复用的 **案主身份层事实**。

什么算"身份层事实"：
- 案主长期的目标、价值观、偏好、约束（"想转向产品创始人"、"不接受 996"、"已婚有 1 娃"）
- 案主稳定的认知模式、思维风格（"决策时倾向保留可选性"、"过度优化短期 KPI 是反复出错的模式"）
- 案主的资源、网络、专业背景（"前 X 公司高管"、"有 5 年产品经验"）
- 案主反复出现的信念翻转（"已经 3 次承诺减薪 6 个月，3 次都做到了 → 案主说到做到的概率 ~95%"）

什么 **不算** 身份层事实（不要写）：
- 这次 session 的具体议题（"该不该接 X 的 offer"）—— 那是 log 的内容，不是 core
- 一次性的情绪状态（"今天很焦虑"）
- 临时的策略选择（"决定先 A/B test 一下"）
- 重复 session 总结里已经说过的内容

输出格式（**严格遵守**，每行一条事实）：
```
[实体 | 关系 | 事实 | 日期]
```

示例：
```
[案主 | 长期目标 | 投资人转产品创始人 | 2026-04-30]
[案主 | 决策风格 | 重视保留可选性，宁愿延迟决策 | 2026-04-30]
[案主 | 履诺概率 | 公开承诺后 ≥80% 兑现 | 2026-04-30]
```

硬性约束：
- 输出 **只能有 0 ～ 3 行**，每行严格遵守上面的方括号格式
- 没有任何身份层信号时，输出空字符串（不要硬凑）
- 日期一律填今天：{}
- **不要** 任何前后说明文字、不要 markdown 标题、不要 ``` 代码块包装
- 全程中文

session 内容（仅本次）：
---
{}
---
"#,
        today, session_block
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

## 议题标语
[6-12 个汉字的极简议题标语，不带任何标点和引号。这是圆桌中央 UI 的核心视觉文字，必须凝练成"决策本身"的最短陈述。例如：是否进入新市场 / 重组团队还是换人 / 接受融资还是 bootstrap]

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

## 议题标语
[6-12 个汉字的极简议题标语，不带任何标点和引号。例如：是否进入新市场 / 重组团队还是换人]

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
// FACILITATOR PROMPTS · tiered (B3 — replaces user_wiki + last_session)
// =============================================================================
//
// Same Step 2 prompts as above but accept a UserContext (core + index)
// instead of the full `user_wiki` + extracted `last_session` blob. Tier
// reads keep the always-loaded blob ≤ ~10KB regardless of how many past
// sessions a user has, which is the whole point of the migration.

use counsel_storage::UserContext;

/// Build the tiered "previous context" section. `core` is the user's
/// always-loaded identity facts (≤1.5KB). `index` is the one-line-per-session
/// hook list. Together they replace the legacy `user_wiki` (full file) +
/// `last_session` (extracted block) layers.
///
/// Caps applied:
///   - prior_beliefs: tail 2000 chars
///   - execution_journal: tail 2000 chars
///   - index: head 4000 chars (cheap, hooks are short)
///   - core: head 2000 chars (defensive — should be ≤ CORE_BUDGET = 1500)
fn build_session_context_section_tiered(ctx: &UserContext, prior_beliefs: &str, execution_journal: &str) -> String {
    let mut out = String::new();
    if !prior_beliefs.trim().is_empty() {
        let capped = cap_tail_chars(prior_beliefs.trim(), 2000);
        out.push_str(&format!(
            "\n\n## 本项目的当前信念 Posterior（仅作连续性参考）\n*上次私董会在本项目更新的信念。不是今天要回答的问题，只是识别议题是否相关。*\n\n{}",
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
    if !ctx.core.trim().is_empty() {
        let capped = cap_head_chars(ctx.core.trim(), 2000);
        out.push_str(&format!(
            "\n\n## 案主核心事实（Core，跨 session 复用）\n*这是案主的身份层事实，每行 `[实体 | 关系 | 事实 | 日期]`。识别议题是否触及这些事实，但不要复述。*\n\n{}",
            capped
        ));
    }
    if !ctx.index.trim().is_empty() {
        let capped = cap_head_chars(ctx.index.trim(), 4000);
        out.push_str(&format!(
            "\n\n## 案主历史议题索引（Log Index，按时间倒序）\n*每行一次过往 session 的核心议题。用于判断今天的问题是否是某次旧议题的延伸；不相关则忽略。需要详情才会让你按需读取，目前不展开。*\n\n{}",
            capped
        ));
    }
    out
}

/// Step 2 "一步锁定" — tier-aware variant. Same prompt body as
/// `facilitator_define_prompt`, but reads from a tiered `UserContext`
/// instead of the legacy full user-wiki blob.
pub fn facilitator_define_prompt_tiered(
    topic: &str,
    ctx: &UserContext,
    prior_beliefs: &str,
    execution_journal: &str,
) -> String {
    let context_section = build_session_context_section_tiered(ctx, prior_beliefs, execution_journal);
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

## 议题标语
[6-12 个汉字的极简议题标语，不带任何标点和引号。这是圆桌中央 UI 的核心视觉文字，必须凝练成"决策本身"的最短陈述。例如：是否进入新市场 / 重组团队还是换人 / 接受融资还是 bootstrap]

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

/// Step 2 correction — tier-aware variant of `facilitator_correction_prompt`.
pub fn facilitator_correction_prompt_tiered(
    topic: &str,
    previous_draft: &str,
    correction: &str,
    ctx: &UserContext,
    prior_beliefs: &str,
    execution_journal: &str,
) -> String {
    let context_section = build_session_context_section_tiered(ctx, prior_beliefs, execution_journal);
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

## 议题标语
[6-12 个汉字的极简议题标语，不带任何标点和引号。例如：是否进入新市场 / 重组团队还是换人]

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

/// Pool of distinct breadth-first angles for Step 3 fact-gathering. When N
/// advisors ask in parallel, each gets a different angle from this rotation so
/// questions cover the problem from different sides instead of all drilling
/// the same thing (the "3-4 questions in and I'm bored" failure mode Michael
/// 2026-04-24 described). Ordered so the first 6 hit the highest-value breadth
/// — 时间/资源/利益相关方/身份/代价/经历 — and the remaining 6 fill edges.
pub const FACTS_ANGLE_POOL: &[&str] = &[
    "时间与紧迫性：这件事现在做、延后、还是错过窗口的代价差多少",
    "资源与能力：你手上有什么、需要什么、差距在哪",
    "利益相关方：谁会受影响、支持你、反对你、你欠谁交代",
    "身份与价值观：这件事跟你是谁、想成为谁的关系",
    "代价与可逆性：如果错了，撤回的成本有多大、多快",
    "相似经历：你过去有没有站在类似的岔口，当时怎么选的、结果如何",
    "信息完整性：你还没搞清楚、但决定非知道不可的关键事实是什么",
    "情绪与动力：真正推你前进的、真正拽你后腿的，分别是什么",
    "对手与竞争：市场上别人在做什么、领先/落后你多少",
    "下一步具体动作：假设明天就要走一步，你会走哪一步",
    "假设验证：你这个判断里最关键的假设是什么，怎么最小成本地验证",
    "长周期回看：3 年后你希望这是一个什么样的故事、最怕它变成什么样的故事",
];

/// Pick the angle for the i-th advisor out of `total` advisors. For total ≤ 12
/// each slot gets a unique angle; beyond 12 we wrap around (acceptable
/// duplication at the tail, since ≤12 is the UX cap anyway).
pub fn angle_for_slot(i: usize) -> &'static str {
    FACTS_ANGLE_POOL[i % FACTS_ANGLE_POOL.len()]
}

/// Step 3 per-advisor fact-gathering prompt (rebuilt 2026-04-24).
///
/// Two mechanics replace the old "everyone asks whatever they want" design:
///
///   1. **Angle assignment** — the advisor is told which slice of the problem
///      they own. Removes the "all 5 ask about team risk" dedup failure.
///
///   2. **Story-anchor pattern** — each advisor opens with 1-2 sentences
///      drawn from their own life (specific time/place/stakes), then asks one
///      concrete question with 2 branches. The anchor is a vulnerability
///      primer, not a lecture: "I too stood where you are, now say your
///      version." Without it, the advisor's question reads as quiz-show
///      interrogation and the case-owner clams up.
///
/// `previous_qa` is the accumulated Step 3 history from earlier sessions (if
/// any). If non-empty we tell the advisor NOT to repeat those questions.
pub fn rich_persona_facts_prompt(
    rich_prompt: &str,
    raw_input: &str,
    defined: &str,
    assigned_angle: &str,
    previous_qa: &str,
) -> String {
    let persona_name = rich_prompt.lines()
        .find(|l| !l.starts_with('#') && !l.starts_with("---") && !l.trim().is_empty())
        .map(|l| l.trim().trim_start_matches("You are ").trim())
        .unwrap_or("Persona");

    let history_section = if previous_qa.trim().is_empty() {
        String::new()
    } else {
        format!(
            "\n\n---\n\n## 过往对话（绝对不要重复）\n{}\n",
            previous_qa.chars().take(1500).collect::<String>()
        )
    };

    format!(
        r#"# ⚠️ 任务格式硬规定（最高优先级，本轮不可妥协）

你接下来产出的回答**必须**满足下面三条。这三条优先级高于你的人物档案里的任何 storytelling 倾向：

1. **第一句话是事实问题**——不是 "我当年..."、不是 "我先讲一件事"、不是 "好，..."、不是任何故事/铺垫。点开看到的第一行必须是一个能让案主用具体描述回答的问题。
2. **不出现任何二选一**——包括所有伪装形式："X 还是 Y"、"哪个更重 / 哪个轻"、"(A)... 还是 (B)..."、"是 X 推你 还是 Y 推你"、三选一压缩 ("某口气、某个人、某种不甘心，还是别的")。这些全部禁止。
3. **历史锚点只能在最后 1 句**——而且必须直接照亮你刚问的事实；不照亮就完全不写。绝对禁止用故事开头铺垫。

读完下面的人物档案后，回到这三条做最后一次自检再生成。

---

## 当前案主处境
{}

## 已锁定的议题
{}

---
## 你的完整人物档案
{}

---
**你是谁（速读 {}）：**
{}

---
## 这一轮你要做的事（顺序非常关键）

### 第 1 步：内部分析（不要写在输出里）
认真读案主处境与已锁定议题，从你的角度出发问自己：
- 真正的障碍是什么？
- 要往前推动这个决策，**最缺哪条事实**？
- 不弄清这条事实，分析就走不下去——它是什么？

你的角度（只走这一条，别跑题）：
{}
其他幕僚负责别的角度，你**只**从上面这一条切入。

### 第 2 步：**先写出 1-2 个挖事实的问题**（必须是输出的第一句话）
经过第 1 步的内部分析后，**第一句话就要落到问题上**——案主点开看到的第一行不能是故事，必须是问题。

**好问题的标准**：
- 开放式：让案主用具体描述回答，不是 yes/no、不是 A 还是 B
- 事实性：问资源 / 约束 / 已尝试 / 时间窗 / 关键人物 / 数据 / 现状细节——不是问感受、不是哲学题
- 指向决策：这条信息对推动决策必要，不是可有可无的背景

**示例（好）**：
- "你目前手里具体有哪些资源、关系、时间预算可以投到这件事上？"
- "你已经试过哪些路径？卡在哪个具体环节？"
- "这件事的截止时间是什么？谁在等你的决定？"

**绝对不能问的（包括所有伪装形式）**：
- ❌ 显式二选一："你怕的是 X 还是 Y？" / "是 X，还是 Y？"
- ❌ **隐藏的二选一（同样禁止）**：
  - "X 重要，还是 Y 重要？" / "你哪个更重？哪个轻？"
  - "(A) ... 还是 (B) ..." / "选一个：1) ... 2) ..."
  - "是 X 推你前进，还是 Y 推你前进？"
  - "你想成为推动历史的人，还是在历史里自保的人？"
  - 任何把回答压缩成"非此即彼"的句式——哪怕用了三个选项
- ❌ 主观感受："你怕什么？" / "你担心的是什么？"
- ❌ 哲学题："你真正想成为谁？" / "什么对你最重要？"
- ❌ 引导式："你是不是其实在逃避 X？"
- ❌ "我先问你一个具体的事——欠谁交代？" 之类把问题包装得像问题但其实是修辞

把每个问题在心里默念一遍：**对方能用一段事实描述来回答吗？** 如果回答只能是"A" 或 "B"——重写。

### 第 3 步：可选——一句简短的 why（≤40 字）
如果问题不直观，加一句解释为什么问它。不强制。

### 第 4 步：可选——历史锚点（**只能放在最后**，且严格限 1 句）
**禁止用故事开头**。锚点位置硬规定：放在所有问题（和可选 why）之后，作为收尾的 1 句。
内容要求：必须直接照亮你刚问的那条事实，**无关就完全不写**。
反面示例（禁止）：
- ❌ "我当年在延安，决定出兵朝鲜之前，政治局里吵成一团……" 然后才提问 — 这是开头铺垫，违规
- ❌ "我 1997 年回苹果，砍了 346 个产品……" 作为 opener — 违规
正面示例（允许）：
- ✅ "你已经试过哪些路径？卡在哪个具体环节？——我 1997 年那次砍 346 个产品也是先把试过的列出来才知道砍哪。" — 锚点在问题之后，且照亮问题

---
## 输出格式（硬规定）

**总长 2-5 句中文**。第一人称称自己，"你"称案主。

**严格顺序**：
1. **第 1 句必须是 fact-finding 问题**（不能是故事，不能是描述，不能是"我先问你"之类的过场）
2. （可选）第 2 个 fact-finding 问题
3. （可选）一句 ≤40 字 why
4. （可选）1 句历史锚——**只能在最后**，且只在真正照亮问题时

**自我检查（输出前默念）**：
- 第一句是不是问题？不是→重写
- 任何问题能不能用 "A 或 B" 回答？能→重写
- 有没有"哪个更重 / 哪个轻 / 是 X 还是 Y / (A) 还是 (B) / 选一个" 等伪装二选一？有→重写
- 有没有用故事开头铺垫？有→把故事砍掉或挪到末尾

**绝对禁止**：
- ❌ 第一句不是问题（最常见的违规：以"我当年..."、"我先问你..."、"好，..."、"同志，..."开头铺垫）
- ❌ 任何二选一（包括所有上面列出的伪装形式）
- ❌ 主观感受 / 哲学问题
- ❌ 超过 2 个问题
- ❌ 单个 why 超过 40 字
- ❌ 重复过往对话里已经问过的内容
{}{}

---

# ⚠️ 生成前最后一次默念（这是你看到的最后一段——读完才动手）

1. 第一句是问题吗？不是 → 重写
2. 任何句子能用 "A 或 B" 一个字回答吗？能 → 重写（包括 "哪个更重" 这种伪装）
3. 锚点放在最后了吗？放在开头了 → 把它砍掉或挪到最后
4. 我是不是在讲别人的故事？（比如 倪海厦不是 Steve Jobs，钱学森不是马云）—— 是 → 完全删掉那段，重写

四条 yes 才动笔。"#,
        raw_input,
        defined,
        rich_prompt,
        persona_name,
        extract_short_summary(rich_prompt, persona_name),
        assigned_angle,
        translation_glossary(persona_name),
        history_section,
    )
}

/// 2026-04-25 — Step 3 sequential refinement. Called when the case-owner
/// opens the next persona's bubble after answering ≥1 prior persona. Asks
/// this persona, given what's already been asked-and-answered, to either
/// (a) refine its own question to dig somewhere not yet covered, or
/// (b) skip itself if the original question is now redundant.
///
/// Output is strict JSON: `{"action":"ask","question":"..."}` or
/// `{"action":"skip","reason":"..."}`. Caller (`routes/refine.rs`) parses
/// loosely.
pub fn refine_persona_question_prompt(
    rich_prompt: &str,
    raw_input: &str,
    defined: &str,
    angle: &str,
    persona_name: &str,
    original_question: &str,
    prior_qa_block: &str,
) -> String {
    // Use a compact persona snippet (first 600 chars of voice highlights) to
    // preserve voice fidelity without bloating the refine call.
    let persona_snippet = rich_prompt.chars().take(600).collect::<String>();

    format!(
        r#"# 你是 {}（不是其他幕僚）。这是 Step 3 挖事实环节的"序贯调整"任务。

## 你的人物档案（节选）
{}

---

## 当前案主处境
{}

## 已锁定的议题
{}

## 你负责的角度
{}

## 你原本准备问的问题
{}

## 已经被其他幕僚问过、案主也回答了的（Q + A）
{}

---

## 你要做的事

读完上面已问已答的内容，回答**一个问题**：你原本要问的事实，**还需要问吗**？

**判断标准**：
- 如果案主的回答已经覆盖了你原本要挖的事实——**SKIP**，不要重复浪费案主时间
- 如果只是部分覆盖、还有一条具体的事实没被挖到——可以**ASK**，但**只问那条还没覆盖的**，不要全套重问
- 如果完全没被覆盖——直接 **ASK** 你原本的问题（或微调措辞使其更聚焦）

**特别提醒**：
- 案主已经在快速回答中，**不耐烦**——宁可 SKIP 也不要勉强问
- 不要为了"不重复"而强行换一个不相关的角度——那等于偏离你的角度职责
- 一个挖事实任务整体平均**最多 3-4 个问题就够**，再多用户会跳过

---

## 输出格式（严格 JSON，不要任何 markdown 围栏，不要解释）

如果继续问：
```
{{"action":"ask","question":"<你的中文问题，遵守 Step 3 格式：第一句是事实问题，无二选一，无故事开头，2-5 句>"}}
```

如果跳过：
```
{{"action":"skip","reason":"<10-30 字解释为什么跳过，例如 '前面已问过资源清单' 或 '与慧能的窗口期问题重叠'>"}}
```

只输出一个 JSON 对象，不要额外说明。"#,
        persona_name,
        persona_snippet,
        raw_input.chars().take(800).collect::<String>(),
        defined.chars().take(400).collect::<String>(),
        angle,
        original_question,
        if prior_qa_block.trim().is_empty() {
            "（暂无——你是第一位被打开的幕僚）".to_string()
        } else {
            prior_qa_block.chars().take(2000).collect::<String>()
        },
    )
}

/// 2026-04-25 — single-call dedup pass that runs after run_facts collects
/// every advisor's question in parallel. The facilitator model reads the
/// whole list and rewrites any near-duplicates so each advisor ends up with
/// a distinct angle. We intentionally pass the persona name + assigned angle
/// of every entry so the rewrite preserves voice; the model returns the same
/// JSON shape (one entry per input, in the same order) so callers can swap
/// it in 1:1.
pub fn dedup_facts_questions_prompt(
    raw_input: &str,
    defined: &str,
    questions_json: &str,
) -> String {
    format!(
        r#"## 你的角色
你是私董会主持人，负责让多位幕僚提出的问题彼此**不重复**。

## 案主原话
{}

## 已锁定议题
{}

## 现在的问题列表（由不同幕僚并行写出）
下面是一个 JSON 数组，每条形如 `{{"persona":"…","slug":"…","question":"…"}}`：
```json
{}
```

## 你要做的事
1. 通读所有问题，找出**语义高度相似**的组（关注同一个事实点 / 同一个内心动作 / 同一个时间窗）。
2. 对每个相似组，**保留一条**作为代表，**改写其余的**：换一个幕僚还没碰到的角度（情感、利益相关方、时间线、机会成本、自我认知、决策机制、外部压力、过往证据……），同时**保持原幕僚的发言风格、口吻、用词偏好**——因为这位幕僚的人格档案已经决定了他怎么说话。
3. 不重复就保持原样，不要为了改而改。
4. 输出**严格 JSON 数组**，长度和顺序与输入一致；每条仍是 `{{"persona":"…","slug":"…","question":"…"}}`。
5. 不要写解释、不要加 markdown 包裹、只输出纯 JSON。

## 输出（仅 JSON，不要别的）"#,
        raw_input.chars().take(800).collect::<String>(),
        defined.chars().take(800).collect::<String>(),
        questions_json,
    )
}

/// Phase 7.1 — ask the facilitator LLM to recommend 3-6 advisors from the
/// admin-allowed roster for this specific question. The model returns strict
/// JSON so the client can pre-fill the picker modal. `available` is a list of
/// (slug, name, one-line-tagline) tuples — the model must only pick from this
/// list, and must use the slug string verbatim.
pub fn persona_suggestion_prompt(raw_input: &str, available: &[(String, String, String)]) -> String {
    let roster = available
        .iter()
        .map(|(slug, name, tagline)| {
            let short_tag = tagline.chars().take(80).collect::<String>();
            format!("- slug=`{}` · {} — {}", slug, name, short_tag)
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        r#"## 你的角色
你是私董会的主持人。案主刚把问题写下来（见下方「## 案主问题」）。你的任务是从候选幕僚名单里，挑 3-6 位最能帮上忙的幕僚。

## 规则（务必遵守）
1. 只能从「## 候选幕僚名单」里挑，不允许发明新幕僚。
2. 使用候选名单里给出的 slug 字符串（反引号内的那串），原样返回，不要翻译成中文名。
3. 挑选数量必须在 3 到 6 之间。
4. 挑选时要考虑互补视角（不要全挑同一类型的幕僚），并优先匹配问题本身需要的专长。
5. reasoning 用中文写，两到三句话说明你为什么挑这几位、他们合起来能覆盖什么角度。

## 输出格式（严格 JSON，不要加任何解释文字，不要用 markdown 代码块包裹）
{{
  "recommended_slugs": ["slug-a", "slug-b", "slug-c"],
  "reasoning": "一两句话说明挑选这几位的理由"
}}

## 候选幕僚名单
{}

## 案主问题
{}

再次强调：只输出合法 JSON，不要任何前缀或后缀文字。slug 必须来自候选名单。"#,
        roster, raw_input
    )
}

// =============================================================================
// F1 (2026-04-26) — Mode C "Freestyle": skip dim+debate, consensus → action.
// =============================================================================

/// Mode C Step 1 of 2 — Facilitator extracts consensus + remaining tension
/// from Step 4 opinions in ~300 chars. No dim structure, no debate.
pub fn freestyle_consensus_prompt(opinions_text: &str) -> String {
    format!(
        r#"以下是幕僚们独立的发言：

{}

---

你的任务：在 ≤300 个汉字内，为案主提炼这些发言的「共识」与「真正的分歧/未解张力」。规则：

1. 先 1-2 行点明大家共同看到的（共识）
2. 然后 1-2 行点明真正的张力（分歧不强求每位幕僚的立场，重在"这件事还卡在哪")
3. 不要给建议，不给行动清单
4. 不要列幕僚名字逐一回顾——直接合成一段
5. 不分子小标题，写成 2-3 段连贯的中文

只输出这段提炼，不要任何元注释。"#,
        opinions_text
    )
}

/// Mode C Step 2 of 2 — Each persona gives ONE action sentence (≤50 字)
/// against the consensus block. No analysis, no caveats — just the action.
pub fn freestyle_action_prompt(
    rich_persona_prompt: &str,
    raw_input: &str,
    defined: &str,
    consensus_block: &str,
) -> String {
    format!(
        r#"FULL PERSONA DETAILS:

{}

---

## 案主原始问题
{}

## 锁定的核心议题
{}

## 主持人提炼的共识与张力
{}

---

请你以**自己的 voice** 给出**一句行动建议**。规则：

1. **≤ 50 个汉字**——一句话，硬上限
2. 直接动词开头，告诉案主"做什么"
3. 不解释、不展开、不给若干选项；选一条你最相信的
4. 不要重复主持人的共识——你给的是接下来的下一步
5. 不要 "X 或 Y" 这种二选一句式——你必须押注一个方向
6. 你的 voice 还在——用你独特的视角说，别变成模板

直接输出这一句话，不要任何前缀或元注释。"#,
        rich_persona_prompt, raw_input, defined, consensus_block
    )
}

// =============================================================================
// F2 (2026-04-26) — Per-bubble follow-up: persona answers a single user
// question in voice (≤80 字), referencing only its own prior opinion.
// =============================================================================

pub fn persona_follow_up_prompt(
    rich_persona_prompt: &str,
    raw_input: &str,
    defined: &str,
    prior_opinion: &str,
    user_question: &str,
) -> String {
    format!(
        r#"FULL PERSONA DETAILS:

{}

---

## 案主原始问题
{}

## 锁定的核心议题
{}

## 你（{}）刚刚在 Step 4 给出的发言
{}

---

## 案主追问
{}

---

请你以**自己的 voice** 回应这一个具体追问。规则：

1. 只回应这一个问题，不发散到其他视角
2. **≤ 80 个汉字**，一气呵成，不分段、不列清单
3. 视角与你 Step 4 的发言一致——不要换框架、不要"重新考虑"、不要装中立
4. 不给"建议清单"，给一句你自己的看法
5. 不重复你之前说过的整段话——案主已经看过了；要给增量信息或更深一层的视角

直接输出你的回应文字，不要任何前缀或元注释。"#,
        rich_persona_prompt,
        raw_input,
        defined,
        rich_persona_prompt
            .lines()
            .find(|l| !l.is_empty() && !l.starts_with('#'))
            .unwrap_or("某位幕僚"),
        prior_opinion,
        user_question,
    )
}

// =============================================================================
// F5 (2026-04-26) — Classify a Step 1 question into one of 10 buckets
// =============================================================================

/// Question category classifier. Returns ONE of these labels (Chinese):
///   创业/产品决策 · 人生转型/方向 · 关系/婚恋/家庭 · 组织/管理 ·
///   存在/身份/意义 · 商业/谈判/博弈 · 政治/宏观/公共 · 学习/认知/方法论 ·
///   健康/身体/疾病 · 其他
pub fn classify_question_prompt(question: &str) -> String {
    format!(
        r#"将以下案主问题归入这 10 个类目中最贴切的一个，只输出类目名称（不要解释、不要标点、不要前后缀）：

候选类目：
- 创业/产品决策
- 人生转型/方向
- 关系/婚恋/家庭
- 组织/管理
- 存在/身份/意义
- 商业/谈判/博弈
- 政治/宏观/公共
- 学习/认知/方法论
- 健康/身体/疾病
- 其他

## 案主问题
{}

输出格式：仅一个类目名称，例如：创业/产品决策"#,
        question
    )
}
