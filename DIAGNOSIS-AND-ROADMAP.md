# Counsel Rust — 全面诊断与重构路线图

**撰写**: Claude Opus 4.6 × Michael 协作探索
**日期**: 2026-04-17
**状态**: 诊断完成，待执行

---

## 第一部分：项目本质——我们到底在做什么

### 1.1 核心洞察

这不是一个聊天机器人，不是一个 AI wrapper，也不是一个"让 AI 扮演名人"的玩具。

**参谋 · Counsel AI 是一套认知基础设施**，它解决的是人类决策的一个根本限制：

> 没有人能在压力下同时维持 12 个不同的哲学框架来思考同一个问题。

每个决策者（创业者、高管、父母）都携带着不可消除的不确定性。他们有盲区，缺乏多元的声音，无法在工作记忆中同时运行 12 套思维框架。

**参谋系统化了人类无法持续做到的事情**：强制独立思考（NGT）、实现真正的辩论（Delphi）、防止乐观偏差（Pre-Mortem）、并构建随每次 session 改进的信念系统（贝叶斯飞轮）。

### 1.2 九个深层洞察（来自 Michael 的原始思考）

1. **顾问即路径囚徒** — 每个顾问都被自己的人生道路所困。多样性来自正交的人生路径，而非智商。
2. **亲密悖论** — 最了解你的人无法给你尖锐反馈（爱会过滤）。AI 填补了这个空白。
3. **并行知识持有** — 智慧本身容易获取（书是免费的）。难的是**同时激活** 12 套框架。
4. **未知的未知** — 你无法提出自己不知道要问的问题。系统强迫你遭遇自己的框架永远不会生成的视角。
5. **领导力认知衰退** — CEO 决策随时间变差，不是因为变笨了，而是认知多样性输入减少了。
6. **决策时间倒置** — 压力下人类决策更快（杏仁核劫持），但不可逆决策值得更多时间。
7. **信念系统复利** — 答案有保质期，但更好的信念更新机制没有。
8. **东西方认识论** — 西方框架处理可分析的问题，东方框架处理不可言说的整体判断。真正的决策两者都需要。
9. **生成性框架，而非最终答案** — 系统不是为了给你正确决策，而是确保你的决策质量通过每次迭代系统性地提高。

### 1.3 最核心的机制：贝叶斯迭代飞轮

这是整个系统的灵魂，但在当前实现中**完全缺失**。

```
Session 1: 混乱的困惑 → 8步流程 → 贝叶斯更新 → To-Do 清单
    ↓
用户在真实世界执行 To-Do
    ↓
Session 2（数周/数月后）: "实际发生了什么 vs 预期？"
    ↓
Facilitator 自动导入先前上下文
    ↓
新一轮私董会（更好的问题，因为系统了解更多）
    ↓
信念系统逐渐更准确
    ↓
下一个假设播种下一次 session
```

**复盘日志**：
- 结晶的洞察：[产生综合的特定交流]
- 信念更新：从 [先验 X] 到 [后验 Y]
- 下一个假设：[下次 session 中要测试的 Z]
- 情感标记：破防时刻、抗拒模式

---

## 第二部分：现状诊断——Rust 重构做了什么、坏了什么

### 2.1 项目结构

```
counsel-rust/
├── Cargo.toml                 # 工作空间：4 个 crate
├── config.toml                # 服务器 & 模型配置
├── crates/
│   ├── counsel-core/          # 业务逻辑：8步流程、Agent、Persona、Prompt
│   ├── counsel-api/           # HTTP/SSE 服务器层（Axum）
│   ├── counsel-model/         # LLM Provider 抽象层
│   └── counsel-storage/       # 文件系统存储层
├── sessions/                  # 实际数据（52个项目，100+个session）
└── docs/                      # 文档和测试报告
```

**代码量**：33 个 Rust 文件，~7,178 行代码
**编译状态**：零错误，零警告 ✅

### 2.2 已完成的工作

MiniMax 团队已经做了以下有价值的工作：

| 完成项 | 评价 |
|--------|------|
| Cargo workspace 4-crate 架构 | 结构清晰，模块化合理 |
| ModelProvider trait 设计 | 优秀的抽象，支持 7 个 Provider |
| SSE 流式推送基础设施 | 正确使用 Axum + tokio-stream |
| 12 persona 并行执行（JoinSet） | Tokio 并发模式正确 |
| 文件系统存储层 | 简洁可用 |
| DeepSeek / MiniMax 流式解析 | 工作正常 |
| 6 个 bug 修复 | 字节切片 panic、空响应、max_tokens 等 |
| SKILL.md → persona_prompts.rs 移植 | 12 个人格的深度 prompt 已转入 Rust |

### 2.3 致命问题

#### 问题 1：三套人格互相矛盾

代码中存在**三个完全不同的 12 人名单**：

| 位置 | 人格列表 | 使用场景 |
|------|---------|---------|
| `agents/mod.rs` → `default_personas()` | Karpathy, Musk, Feynman, Ilya, MrBeast, Munger, Naval, PG, Jobs, Taleb, Trump, 张一鸣 | Steps 3, 4, 5, 6 |
| `personas.rs` → `all_personas()` | Jobs, Buffett, Eleanor Roosevelt, Churchill, RBG, Musk, Shell, 孔子, The Queen, Thucydides, 孙子, Jane Addams | Step 8 (Harvest) |
| `routes/steps.rs` → `get_personas()` | 又是第三套硬编码 JSON | API 返回给前端 |

**后果**：Step 4 里 Karpathy、Naval、Taleb 给的意见，到 Step 8 却由 Warren Buffett、孔子、The Queen 来做评价。**整个流程的人格一致性被打碎了。**

#### 问题 2：每步双倍 API 调用

```rust
// Step 4, 6, 7 中的反模式：
persona.run_streaming(&messages, ..., sender).await?;  // 调用1：只推 SSE
let result = persona.run(&messages, ...).await?;        // 调用2：保存到文件
```

- 流式结果被完全丢弃，只用于前端展示
- 保存的内容来自**另一次独立调用**，和用户在前端看到的**不一致**
- API 成本直接翻倍：12 persona × 2 次 = 24 次调用/步骤
- 原版 TypeScript 的做法是流式累积后直接保存，一次调用搞定

#### 问题 3：Step 4 IO Error 的根因链

不是目录不存在（代码有 `create_dir_all`）。真正的链条：

1. 12 个并行任务中，`run_streaming()` 失败 → 错误被 `eprintln!` 吞掉
2. `run()` 被调用，可能也失败
3. 整个 spawned task 错误 → `tx` 被 drop
4. 主线程 `rx.recv()` 收不到这个 persona 的结果
5. 对应的 opinion 文件没有被写入
6. Step 5 调用 `list_opinions()` → 空/部分文件 → cascade failure

#### 问题 4：中文 byte-slice panic（未修复的实例）

```rust
// steps/mod.rs:766 — categorize_position 函数
let sample = if upper.len() > 300 { &upper[..300] } else { &upper[..] };
```

`&upper[..300]` 是字节切片。中文内容会 panic。这和 `prompts.rs` 里修过的 bug 一模一样，但这里没修。

#### 问题 5：Step 6 辩论 silently 吞错误

```rust
// routes/steps.rs:101
let _ = service.run_debate(&project_id_clone, &session_id_clone, &dims[idx], sender.clone()).await;
```

`let _ =` 把整个辩论的错误吞掉了。

### 2.4 架构缺陷

#### 缺陷 1：Step 2 丢失了状态机

原版 TypeScript 有完整的状态机：`INIT → QUESTIONING → CONFIRMING → LOCKED → DONE`，支持多轮对话和意图解析。

Rust 版只有 `for round in 0..3` + 关键词匹配（"distilled", "Understood"）。这不是多轮对话，是硬编码循环。

#### 缺陷 2：Step 3 不该自动化

原版：前端驱动，persona 提问 → **真正的用户回答** → 下一个 persona 提问。
Rust 版：所有回答都由 LLM 生成。用户的真实情况没有被采集。

#### 缺陷 3：辩论过度工程

原版：每维度 → 12人并行给立场 → Secretary 综合。
Rust 版：Round1 → 自动分类 pro/con/middle → Middle 再回应 → Round2 → Secretary 综合。API 调用量翻 3 倍。

#### 缺陷 4：缺失的核心功能

| 功能 | 原版 TypeScript | Rust 版 | 原始愿景 (roundtable-advisor) |
|------|----------------|---------|------------------------------|
| 贝叶斯迭代 | 无 | 无 | **核心灵魂** |
| Pre-Mortem | 无 | 无 | 必须 |
| Red Team | 无 | 无 | 必须 |
| 假设翻译器 | 无 | 无 | V2 |
| 语言切换 (en/zh) | 有 | 无 | 有 |
| User Wiki 累积 | 有 | 有代码但未集成 | **核心** |
| 清洗模型输出 | 有 | 无 | 有 |
| API 重试 | 有（3次） | 无 | 有 |
| 步骤缓存 | 有 | 仅 Step 2 部分 | 有 |
| 前端驱动 facts 迭代 | 有 | 无 | 有 |
| 用户选维度 (1-3) | 无 | 硬编码前 3 | **必须** |
| Facilitator 不发表内容 | 约束弱 | 无约束 | 严格 |
| Secretary 一致性检查 | 无 | 无 | 有 |
| 跨 session 飞轮 | 无 | 无 | **核心** |

---

## 第三部分：Persona 知识架构——从 prompt 到智慧引擎

### 3.1 当前状态

当前 Rust 代码有两种 persona 数据表示：

**表示 A — `persona_prompts.rs`（~25KB/人格）**
从 TypeScript 的 SKILL.md 文件直接转入。包含角色扮演规则、心智模型、决策启发式、表达 DNA。**质量高但是扁平的字符串。**

**表示 B — `personas.rs`（结构化 Persona struct）**
有 `name`, `title`, `role`, `values`, `communication_style`, `decision_framework`, `expertise`, `blind_spots`, `common_mistakes` 字段。**结构化但浅。而且是完全不同的 12 个人。**

两者没有统一，没有整合。

### 3.2 WE-INDEX 的发现：什么让 persona 成功

基于 24 个真实案例（DeepSeek 15 + Claude 9）的评估：

**成功公式**：
> 人格质量 = 模型底层能力 × 上下文信息质量 × 架构设计 × 会话关系深度

**GOLDEN 案例的共性**（6 例，平均 23.5/25 分）：

| 特征 | 证据 |
|------|------|
| **个人化深度 > 哲学深度** | 所有 GOLDEN 案例都直接引用了用户的具体情境："433行架构"、"5-Grades Camp"、"两岁的女儿" |
| **问题重构 > 问题回答** | 不回答"选 A 还是 B"，而是揭示"你在用分析逃避行动" |
| **照见机制 > 建议机制** | 让用户看到"不想承认但已经知道的事情" |
| **声音不可替换** | PG 的"残酷真相"、慧能的"轮子/镜子"意象、毛的"磨刀砍柴" |
| **真实赌注** | 有时间压力、有代价、有不可逆性 |

**WEAK 案例的失败模式**（7 例，平均 10.4/25 分）：

| 失败模式 | 频率 | 描述 |
|---------|------|------|
| `third_person_escape` | 4/15 | "如果你是 X" → AI 回答 "作为 X，他可能会..." |
| `surface_problem` | 3/15 | 问题太泛 → 通用建议 |
| `persona_blur` | 2/24 | 多角色合并成一个分析声音 |
| `persona_as_label` | 1/24 | Persona 名变成章节标题，内容仍是通用分析 |
| `intellectual_without_traction` | 1/15 | 分析深但无行动感 |
| `disclaimer_breaks_immersion` | 1/15 | 开头加"以下为模拟" |

**平台对比**：

| 指标 | Kimi 多 Agent | Claude 单 Agent | DeepSeek 单 Agent |
|------|-------------|----------------|-----------------|
| GOLDEN 率 | 100% (5/5) | 11% (1/9) | 0% (0/10) |
| 平均分 | 22.6/25 | 18.6/25 | 15.8/25 |
| 最强点 | 并行张力产生洞见 | 长期关系深度 | 哲学探索 |
| 最弱点 | 无长期关系 | 声音质感弱 | third_person_escape |

**关键结论**：多 Agent 架构（我们的设计）天然有优势。但 persona 知识质量决定了天花板。

### 3.3 五层智慧人格知识架构

来自 Michael 的 `wisdom-persona-kb-framework.md`。这是正确的目标架构。

```
┌─────────────────────────────────────────────────────┐
│  世界观 — 他认为世界从根本上是什么样的？              │  最深
│  人生观 — 他认为活着是为了什么？                     │
│  价值观 — 他认为什么重要、什么不重要？                │
│  方法论 — 他用什么思维动作解决问题？                  │
│  战略决策 — 他在具体极端处境下做了什么？               │  最表层
└─────────────────────────────────────────────────────┘
```

**核心创新：情境卡片 + 压力指纹**

每个历史决策拆解为五要素卡片：
```
情境描述   → 1927年，秋收起义失败，兵力极弱，攻城无望
识别的矛盾 → 象征性胜利 vs 生存能力，是假矛盾
推理链     → 打不赢就换战场，而非更努力打同一场仗
结论       → 放弃攻长沙，转向井冈山
抽象形式   → 当资源不足时，收缩到可控阵地优先于扩张
```

压力指纹（14 维度 × 0-10 分）：
- **压力方向**（6维）：时间、资源、生存、竞争、舆论、不确定性
- **内部张力**（5维）：身份、情感、道德、面子、孤独
- **决策结构**（3维）：不可逆程度、信息完整度、代价不对称

**RAG 匹配的是"压力指纹"——这组数字，不只是关键词。**

**照见深度取决于匹配发生在哪层**：
```
战略决策层匹配  →  操作建议（有用）
方法论层匹配    →  思维重构（有价值）
价值观层匹配    →  优先级颠覆（震撼）
人生观层匹配    →  意义重建（破防）
世界观层匹配    →  看世界的方式改变（极少发生，但最深）
```

### 3.4 人格知识架构的实施路径

**Layer 0（数据结构先行）** — 在阶段 1 中完成

在 Rust 中定义完整的五层数据结构：

```rust
pub struct WisdomPersona {
    pub id: &'static str,
    pub name: &'static str,
    pub title: &'static str,
    // 五层知识
    pub worldview: &'static str,
    pub life_philosophy: &'static str,
    pub values: &'static str,
    pub methodology: Vec<ThinkingPattern>,
    pub decisions: Vec<SituationCard>,
    // 表达 DNA
    pub voice: VoiceTexture,
    // 过渡期：现有 SKILL.md 内容
    pub legacy_prompt: Option<String>,
}

pub struct SituationCard {
    pub situation: String,
    pub contradiction: String,
    pub reasoning_chain: String,
    pub conclusion: String,
    pub abstract_form: String,  // RAG 匹配层
    pub pressure: PressureFingerprint,
}

pub struct PressureFingerprint {
    // 压力方向 (0-10)
    pub time: u8, pub resource: u8, pub survival: u8,
    pub competition: u8, pub social: u8, pub uncertainty: u8,
    // 内部张力 (0-10)
    pub identity: u8, pub emotional: u8, pub moral: u8,
    pub face: u8, pub isolation: u8,
    // 决策结构
    pub irreversibility: u8,
    pub info_completeness: u8,
    pub cost_asymmetry: CostAsymmetry,
}

pub struct VoiceTexture {
    pub first_person_markers: Vec<String>,
    pub metaphor_domain: Vec<String>,
    pub sentence_style: String,
    pub forbidden_patterns: Vec<String>,
}
```

**Layer 1（第一批 3-4 个人格深度构建）** — 阶段 3

优先做已有 WE-INDEX 评测数据的人格：
1. **Paul Graham** — WE-PG-001, 24/25 GOLDEN
2. **Bruce Lee / 李小龙** — WE-BL-001, 24/25 GOLDEN
3. **六祖慧能** — WE-HUINENG-001, 23/25 GOLDEN
4. **毛泽东** — 5 个案例，数据最丰富

每人格工时估算：12-18 小时。第一批总计 ~60 小时。

**Layer 2（渐进补齐）** — 后续迭代

补齐剩余人格。按原始愿景的东西方融合阵容：
- 东方：老子、王阳明
- 系统：钱学森、Einstein
- 现代：Jobs、Musk、Naval、Munger（或其他）

**过渡期方案**：五层知识库构建期间，系统不会停摆：

```rust
fn get_system_prompt(persona: &WisdomPersona, context: &str) -> String {
    if !persona.decisions.is_empty() {
        // 有情境卡片 → 用五层框架
        build_wisdom_prompt(persona, context)
    } else if let Some(ref legacy) = persona.legacy_prompt {
        // 有 SKILL.md → 用现有深度 prompt
        legacy.clone()
    } else {
        // 最低配 → 结构化 Persona
        persona.to_basic_prompt(context)
    }
}
```

---

## 第四部分：重构设计——8 步流程应该怎么工作

### 4.1 Step 1: 输入困惑

**当前状态**：基本可用。用户提交原始问题，保存为 `00-raw-input.md`。

**需要增加**：
- 加载该项目的 User Wiki（如有），作为上下文传入后续步骤
- 加载上一次 session 的贝叶斯更新记录（如有），作为 Prior

### 4.2 Step 2: 定义问题（Facilitator 对话）

**当前状态**：有基本的单轮/自动模拟，但丢失了状态机。

**目标设计**：
- Facilitator 严格只管流程，**绝不发表内容观点**
- 支持前端驱动的多轮对话（真实用户输入）
- 保留 `auto_simulate` 作为测试模式
- 输出："锁定的核心问题" + "提取的先验信念"（为 Step 8 贝叶斯更新准备）

### 4.3 Step 3: 挖事实

**当前状态**：全自动模拟用户回答，失去了事实采集的价值。

**目标设计**：
- 12 个 persona 并行生成 0-2 个事实性问题
- 前端展示所有问题，用户统一回答
- 保留 `auto_simulate` 作为测试模式
- 输出：`02-facts-answers.md`

### 4.4 Step 4: 独立发言（NGT 核心机制）

**当前状态**：并行生成可用，但双倍 API 调用。

**目标设计**：
- 12 persona 并行生成独立观点（NGT：互相不可见）
- **单次 API 调用**：流式结果累积后直接保存
- 每人 400-600 字（`max_tokens: 1200`）
- 输出：`03-opinions/{persona-name}.md`

### 4.5 Step 5: 拆维度

**当前状态**：Secretary 提取冲突维度，基本可用。

**目标设计**：
- Secretary 分析 12 人观点，提取 3-6 个冲突维度
- **每个维度包含**：名称、核心冲突、正方论点、反方论点
- **API 返回维度列表给前端，用户必须选择 1-3 个**
- 自动测试时默认选 2 个
- 输出：`04-dimensions.md` + 维度选择 JSON

### 4.6 Step 6: 结构化辩论（重新设计）

**当前状态**：过度工程的三轮 + 自动分类。

**目标设计 — 两轮深度辩论**：

**Round 1 — 立场陈述**
- 对每个选中的维度，12 persona 并行给出立场
- 系统自动分类为正方 / 反方 / 中间派（自然涌现，不是手动分配）
- 每人输出：核心立场（1句）+ 分析依据
- 每人 400-600 字（`max_tokens: 1200`）

**Round 2 — 深层发掘**
- 每个 persona 看到**所有人的 Round 1 回答**
- **不是为了辩论，而是发掘更深层有价值的东西**
- Prompt 引导：
  - "看了其他人的回答后，你发现了什么更深层的模式或洞察？"
  - "有什么被所有人忽略的底层假设？"
  - "从你的哲学框架来看，这个冲突的本质是什么？"
- 每人 300-500 字（`max_tokens: 1000`）

**Secretary 综合**
- 对每个维度，综合两轮辩论
- 输出：核心张力 + 各方最深刻的洞察 + 未解决的深层问题
- 500-800 字/维度（`max_tokens: 1600`）

**API 调用量**：2 个维度 × (12+12+1) = 50 次（对比当前的 3 轮 × 12 × 3 = 108 次）

### 4.7 Step 7: 汇总

**当前状态**：Secretary 生成总结，基本可用但截断了辩论内容。

**目标设计**：
- Secretary 综合所有信息：定义的问题、事实、12 人观点、辩论精华
- **不截断，智能压缩**：
  - 100 万 token 模型：全量传入
  - 25 万 token 模型：让 Secretary 先做摘要，再综合
- 1000-1500 字（`max_tokens: 3000`）
- 输出：`06-summary.md`

### 4.8 Step 8: 摘果子 + 贝叶斯更新（最重要的步骤）

**当前状态**：有 persona 评价和 todo 提取，但缺少贝叶斯更新。

**目标设计 — 四个环节**：

**Part A — Persona 自我收获**
- 3-5 个 persona 评价：
  - "这次 session 我学到了什么？"
  - "其他幕僚教会了我什么？"
- 200-300 字/人（`max_tokens: 600`）

**Part B — Persona 评价案主（真刀真枪，不说假话）**
- 同样 3-5 个 persona：
  - "你今天表现如何？"
  - "你有什么盲区？"
  - "你有什么未被开发的潜力？"
- 200-300 字/人

**Part C — Secretary 提取 To-Do**
- 可执行的下一步行动清单
- 500 字（`max_tokens: 1000`）

**Part D — 贝叶斯更新（核心灵魂）**

```markdown
## 贝叶斯更新记录

### 先验信念（Session 开始时）
[用户在 Step 1/2 表达的核心假设/信念]

### 本次 Session 的证据
**支持先验的证据：**
- [来自辩论中支持原始信念的论点]

**挑战先验的证据：**
- [来自辩论中挑战原始信念的论点]

### 后验信念（Session 结束后）
- 假设 [X]：确认 / 部分确认 / 推翻 / 不确定
- 更新后的认知：[Y，附置信度]

### 下一个待验证的假设
- [Z：从本次 session 中涌现的新问题]
```

**全部输出**：`07-harvest.md`（评价 + To-Do + 贝叶斯更新）

**自动写入 User Wiki**：贝叶斯更新和 To-Do 自动 append 到项目级 `user-wiki.md`

### 4.9 输出字数设计总结

| 步骤 | 角色 | 字数/人 | max_tokens | 理由 |
|------|------|---------|------------|------|
| Step 3 Facts | 12 persona | 50字（1-2个问题） | 200 | 只问事实，不分析 |
| Step 4 Opinions | 12 persona | 400-600字 | 1200 | 核心分析，需要展开 |
| Step 6 Round 1 | 12 persona | 400-600字 | 1200 | 立场+论据需要空间 |
| Step 6 Round 2 | 12 persona | 300-500字 | 1000 | 深层洞察更精炼 |
| Step 6 Synthesis | Secretary | 500-800字/维度 | 1600 | 综合需要充分 |
| Step 7 Summary | Secretary | 1000-1500字 | 3000 | 全局综合 |
| Step 8 评价 | 3-5 persona | 200-300字/人 | 600 | 精准不冗余 |
| Step 8 To-Do | Secretary | 500字 | 1000 | 可执行清单 |
| Step 8 贝叶斯 | Secretary | 300-500字 | 1000 | 结构化记录 |

### 4.10 上下文管理策略

**不截断，只压缩**：

```rust
fn prepare_debate_context(debate: &str, model_context: usize) -> String {
    let tokens = estimate_tokens(debate);
    if model_context >= 1_000_000 || tokens < model_context / 3 {
        // 大窗口模型或内容不大：全量传入
        debate.to_string()
    } else {
        // 小窗口模型：让 Secretary 做一轮摘要
        summarize_debate(debate)  // LLM 压缩，不是字符串截断
    }
}
```

### 4.11 User Wiki 设计

**位置**：`sessions/{project_id}/user-wiki.md`（项目根部，不在任何 session 内）

**内容结构**：
```markdown
# User Wiki — [项目名称]

## 关于这个人
[随 session 累积的用户画像]

## 信念演化日志
### Session 1 (2026-04-10)
- Prior: [X]
- Posterior: [Y]
- 假设状态: 确认/部分确认/推翻

### Session 2 (2026-04-25)
- Prior: [Y]（来自上次的 Posterior）
- Posterior: [Z]
- ...

## To-Do 追踪
- [x] 做了什么 (2026-04-15)
- [ ] 还没做什么

## 成长 Journal
[用户的反思、进展记录]
```

**读写时机**：
- 新 Session 创建时 → 自动读取 wiki，传入 Facilitator
- Step 8 完成时 → 自动 append 贝叶斯更新 + To-Do
- Check-in 端点（未来） → 用户随时记录进展

---

## 第五部分：质量保障——WE-INDEX 集成

### 5.1 评估框架

五维评分体系（每维 0-5 分，满分 25）：

| 维度 | 测什么 | GOLDEN 标准 |
|------|--------|------------|
| 解决真实问题 | 是否针对用户具体处境 | 引用了具体数字/名称/情境 |
| 洞察深度 | 是否揭示了用户不知道的 | 重构了问题而非回答问题 |
| 人格真实性 | 声音是否不可替换 | 换个名字就不成立 |
| 可行动性 | 是否能立即执行 | 有具体下一步 |
| 情感共鸣 | 是否产生行为改变 | 用户深度 follow-up / 分享给家人 |

### 5.2 Benchmark 集成方案

```
counsel-rust/
  eval/
    we-index.md              # 主索引
    cases/                    # 24 个案例的完整记录
    benchmark.rs              # 自动化评估脚本
    golden-criteria.md        # GOLDEN 标准定义
```

每次修改 persona prompt 或知识库后，用 benchmark 案例验证质量无退化。

### 5.3 防止已知失败模式

在 prompt 设计中内建防御：

| 失败模式 | 防御措施 |
|---------|---------|
| `third_person_escape` | System prompt 强制："用'我'而非'他会认为'"。绝不用"如果你是X"触发 |
| `persona_blur` | 每个 persona 独立 API 调用，绝不合并多角色到一次请求 |
| `surface_problem` | Step 2 Facilitator 必须提取具体情境和数字 |
| `persona_as_label` | Persona 是整个对话的身份，不是附加分析角度 |
| `disclaimer_breaks_immersion` | System prompt 明确授权创意写作 |

---

## 第六部分：执行路线图

### 阶段 1：止血（让系统能跑通 8 步）

**预估工时**：8-12 小时

| # | 任务 | 优先级 | 影响范围 |
|---|------|--------|---------|
| 1.1 | 统一人格系统为一套 12 人（用 TypeScript 版 + SKILL.md） | P0 | 所有步骤 |
| 1.2 | 消除双倍 API 调用：流式累积后直接保存 | P0 | Steps 4, 6, 7 |
| 1.3 | 修复 Step 4 错误传播：并行任务错误收集 | P0 | Step 4 |
| 1.4 | 修复中文 byte-slice panic（categorize_position 等） | P0 | Step 6 |
| 1.5 | 修复 Step 6 `let _ =` 错误吞没 | P0 | Step 6 |
| 1.6 | 调整所有 max_tokens 到合理值 | P1 | 所有步骤 |

### 阶段 2：重构核心流程

**预估工时**：12-16 小时

| # | 任务 | 优先级 | 影响范围 |
|---|------|--------|---------|
| 2.1 | 重做 Step 6 辩论：两轮设计（Round1 立场 + Round2 深挖） | P0 | Step 6 |
| 2.2 | Step 5 维度选择：用户选 1-3 个，默认 2 个 | P0 | Steps 5, 6 |
| 2.3 | Step 8 贝叶斯更新环节 | P0 | Step 8 |
| 2.4 | User Wiki 集成（项目根部，跨 session 读写） | P0 | Steps 1, 8 |
| 2.5 | 上下文压缩（而非截取） | P1 | Step 7 |
| 2.6 | 步骤缓存（已完成步骤跳过） | P1 | 所有步骤 |
| 2.7 | 输出清洗（去模型思维过程） | P1 | 所有步骤 |
| 2.8 | Step 3 支持前端驱动（保留 auto_simulate） | P2 | Step 3 |

### 阶段 3：五层人格架构

**预估工时**：数据结构 4 小时 + 每人格 12-18 小时

| # | 任务 | 优先级 |
|---|------|--------|
| 3.1 | 定义 WisdomPersona / SituationCard / PressureFingerprint 数据结构 | P1 |
| 3.2 | 第一批人格深度构建（PG, Bruce Lee, 慧能, 毛泽东） | P2 |
| 3.3 | WE-INDEX benchmark 集成 | P2 |
| 3.4 | 渐进替换 SKILL.md → 五层知识 | P3 |

### 阶段 4：未来功能 TODO（记录但不立即执行）

#### 核心机制
- [ ] Pre-Mortem（Gary Klein 方法）：假设选定方案在 12 个月后失败了，从你的框架来看发生了什么
- [ ] Red Team（2-3 个 persona 担任保护性异见角色）
- [ ] 假设翻译器（将混乱输入转为可测试假设）
- [ ] 跨 session 飞轮自动化（Facilitator 自动 review 上次 To-Do）
- [ ] Check-in 端点（用户记录进展，自动写入 wiki）
- [ ] 小助理追踪（1-2 周后主动提醒用户反思）

#### UI 增强
- [ ] 圆桌上的对话气泡（persona 头像上弹出，可上下滑动）
- [ ] 点击气泡 → 右侧面板展开详细内容，再点收回
- [ ] 输入框在圆桌区域内（也可在右侧面板输入）
- [ ] 黑/白双色主题（配色文档待导入）
- [ ] 每个 persona 的手绘插画图替换当前 icon
- [ ] 用户可自选 persona 数量和人选（不强制 12 个）
- [ ] 进度条：用户始终知道在 8 步中的哪一步

#### 系统增强
- [ ] 语言切换 (en/zh)
- [ ] API 重试逻辑（失败时自动重试最多 3 次）
- [ ] 真实 API token 计数（从 response usage 获取，替代估算）
- [ ] Facilitator 状态机（恢复 INIT → QUESTIONING → CONFIRMING → LOCKED → DONE）
- [ ] Secretary 一致性检查（检测 persona 是否自相矛盾）
- [ ] 场景压力测试 UI（2×2 可视化）
- [ ] TRIZ 自动触发（检测循环辩论，建议质疑假设）
- [ ] 多人模式（真实用户混合 AI 角色）
- [ ] Persona 市场（用户创建自定义顾问）
- [ ] 语音模式（全语音输入输出）

---

## 第七部分：关键决策待确认

以下决策需要 Michael 确认后才能推进：

### 决策 1：人格列表

当前有三套，需要统一为一套。选项：

**A — 用 TypeScript 版的 12 人**（已有深度 SKILL.md）
Karpathy, Musk, Feynman, Ilya, MrBeast, Munger, Naval, PG, Jobs, Taleb, Trump, 张一鸣

**B — 用原始愿景的东西方融合版**
Bruce Lee, 老子, 慧能, 王阳明, 钱学森, Scharmer, Einstein, Jobs, PG, Musk, Munger, Naval

**C — 混合版**（保留有 SKILL.md 的 + 加入东方代表）
需要确定具体 12 人

**建议**：先用 A（有 SKILL.md，能立即用），在阶段 3 逐步替换为 B 或 C。

### 决策 2：五层人格的第一批

建议：Paul Graham, Bruce Lee, 六祖慧能, 毛泽东（这 4 个有 WE-INDEX 评测数据）。
是否确认？是否有其他想优先做的？

### 决策 3：阶段 1 的执行顺序

建议立即开始阶段 1，先让系统跑通。是否同意？

---

## 附录 A：从原始愿景到实现的对照表

| 原始愿景 (roundtable-advisor) | 当前 Rust 实现 | 本次重构目标 |
|------------------------------|--------------|------------|
| NGT 静默独立生成 | ✅ 有（并行 JoinSet） | 修复双倍 API |
| Delphi 两轮辩论 | ❌ 过度工程三轮 | 重做为两轮 |
| Pre-Mortem | ❌ 缺失 | TODO |
| 贝叶斯迭代 | ❌ 缺失 | **阶段 2 核心** |
| Red Team | ❌ 缺失 | TODO |
| 假设翻译器 | ❌ 缺失 | TODO |
| User Wiki 跨 session | ⚠️ 有代码未集成 | **阶段 2 核心** |
| 东西方哲学融合 | ❌ 全西方人物 | 阶段 3 |
| 五层人格知识 | ❌ 扁平 prompt | 阶段 3 |
| 压力指纹 RAG | ❌ 缺失 | 阶段 3 |
| 用户选维度 1-3 | ❌ 硬编码前 3 | **阶段 2** |
| Facilitator 不发表内容 | ⚠️ 无严格约束 | 阶段 2 |
| Secretary 一致性检查 | ❌ 缺失 | TODO |
| 跨 session 飞轮 | ❌ 缺失 | 阶段 2 |
| 步骤缓存 | ⚠️ 仅 Step 2 部分 | 阶段 2 |
| 模型输出清洗 | ❌ 缺失 | 阶段 2 |

## 附录 B：WE-INDEX 评估银行概览

**数据集**：24 个案例，跨 DeepSeek (15) + Claude (9) 平台
**评分维度**：5 维 × 5 分 = 25 分满分
**分类**：GOLDEN (6, 25%) / STRONG (11, 46%) / WEAK (7, 29%)

**核心发现**：
1. 个人化深度 > 哲学深度
2. 问题重构 > 问题回答
3. 照见机制 > 建议机制
4. 声音不可替换性 = 人格质量指标
5. 多 Agent 架构天然优势（Kimi 100% GOLDEN vs DeepSeek 0%）
6. 人格质量 = 模型能力 × 上下文质量 × 架构设计 × 会话关系深度

**六种失败模式**：third_person_escape, surface_problem, persona_blur, persona_as_label, intellectual_without_traction, disclaimer_breaks_immersion

---

*此文档将随项目推进持续更新。*
*最后更新：2026-04-17*
