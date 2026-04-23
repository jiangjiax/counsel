# Counsel Rust — PG-Based Priority Roadmap

**撰写**: Claude Opus 4.6 × Michael
**日期**: 2026-04-18
**基础**: 采纳 Paul Graham 框架（"让 Michael 每周至少用一次"），结合 Steve Jobs 洞察
**Persona 调整**: 6 人（毛泽东、PG、Jobs、Bruce Lee、Kevin Kelly、慧能）

---

## 第一部分：两套方案对比分析

### 1.1 方案概览

| 维度 | Cursor 方案 (Opus 4.7) | Claude Code 方案 (Opus 4.6) |
|------|----------------------|---------------------------|
| 文档名 | `counsel_rust_decent_overhaul_8281b0e3.plan.md` | `DIAGNOSIS-AND-ROADMAP.md` |
| 总条目 | 109 项（分 Phase A-M + Tier 2） | 4 个阶段 + TODO 列表 |
| 篇幅 | ~1400 行，极度详尽 | ~770 行，聚焦核心 |
| 方法论 | 自底向上，工程主导，每个 Phase 可独立测试 | 自顶向下，产品洞察先行，诊断→处方 |
| 诊断深度 | 代码级（精确到行号、函数名） | 架构级 + 产品级（代码问题 + 哲学定位） |

### 1.2 Cursor 方案的优势

**1. 工程精度远超我们的方案**

Cursor 的方案精确到了每一行有问题的代码。例如：
- `routes/steps.rs#L101` 的 `let _ = service.run_debate(...)`
- `files.rs#L21` 的 `path.parent().unwrap()`
- `steps/mod.rs:766` 的 byte-slice panic

我们的方案说"修复 Step 6 `let _ =` 错误吞没"——Cursor 的方案说"D.4 Kill list: 以下 5 个精确位置"。执行者拿到 Cursor 方案可以直接动手，拿到我们的方案还需要先做一轮代码审计。

**2. 测试先行的工程文化**

Cursor 方案的 Phase A 就是建 MockModelProvider 和 integration test——在修任何 bug 之前先建安全网。我们的方案直接从"阶段 1：止血"开始修代码，没有提测试基础设施。这是一个重要的工程实践差距。

**3. SSE 解析器的系统性设计**

Cursor 提出了 `LineDecoder` / `NdjsonDecoder` 作为跨 Provider 的统一基础设施（Phase B.2），而我们只笼统说"修复流式"。这反映了对 SSE split-packet 问题的深度理解——TCP 包拆分导致 JSON 行被截断，这是当前 80 个空文件的根因之一。

**4. 过渡策略更务实**

Cursor 方案设计了清晰的过渡路径：
- G.2（从文件加载 SKILL.md）→ H.2（替换为 TheoryLoader）→ H.5（PersonaPromptAssembler）
- 每一步都是上一步的自然升级，而不是推倒重来

我们的方案虽然描述了 `get_system_prompt()` 的三级降级逻辑，但没有 Cursor 那样清晰的"中间态"设计。

**5. Session 存储路径的前瞻设计**

Cursor 方案在设计 session 存储路径时，已经考虑了未来的 branching（`trunk/` + `branches/{branch-id}/`），做了向前兼容。我们的方案没有这个维度。

**6. 109 项完整 Backlog 无遗漏**

Cursor 方案把所有想到的功能——包括 Chief of Staff、结论优先模式、分支会话 DAG、时间线导航——全部记录在 Tier 2 中。这确保了"不做"和"忘了"是不同的。

### 1.3 我们方案的优势

**1. 产品定位更深刻**

我们的方案第一部分花了整整一节定义"参谋到底是什么"——九个深层洞察、认知基础设施的定位。Cursor 方案直接进入工程修复，没有这层产品哲学。

这不是虚的。产品定位决定了你在面对 scope 决策时的判断框架。当你问"要不要做 Framework Mode？"时，如果你的定位是"认知基础设施"，答案和定位是"AI advisor simulator"完全不同。

**2. WE-INDEX 分析更系统**

我们的方案把 WE-INDEX 的分析放在了诊断的核心位置（第三部分），而不是附录。成功公式（个人化深度 > 哲学深度）、六种失败模式的防御策略、平台对比表——都是直接指导设计决策的。

Cursor 方案在 §2.6 也有 WE-INDEX 分析，但更多是"引用数据支持决策"，而不是"从数据推导设计"。

**3. 贝叶斯飞轮描述更直观**

我们用了一个简洁的流程图（Session 1 → 执行 → Session 2 → ...）和具体的 markdown 输出格式。Cursor 用了 Mermaid 图 + 四个 Phase M 子任务。两者信息量相当，但我们的更容易让非工程师理解。

**4. 人格选择有明确数据支撑**

我们直接列出了"第一批 4 个人格"并给出了选择理由（WE-INDEX 评测数据），Cursor 方案虽然也提到了数据，但在 H.6 里把全部 21 个人格都列进了 PersonaRegistry，显得没有聚焦。

**5. 执行路线更简洁**

四个阶段、每阶段 6-8 个任务，一目了然。Cursor 的 Phase A-M + K + Tier 2 虽然更完整，但执行者面对 109 项时容易迷失。

### 1.4 两套方案的盲区

| 盲区 | Cursor 方案 | 我们的方案 |
|------|-----------|----------|
| 测试基础设施 | 有（Phase A） | **缺失** |
| SSE 解析器设计 | 有（B.2 LineDecoder） | **缺失** |
| HTTP 超时/连接池 | 有（B.4） | **缺失** |
| 产品哲学定位 | **缺失** | 有（第一部分） |
| 过渡期兼容 | 有（G.2 → H.2） | 有但不够细 |
| 安全加固（CORS/Path Traversal） | 有（Phase E） | **缺失** |
| Branching 前瞻 | 有（§2.7.3） | **缺失** |
| 八步流程重新设计的细节 | 有但散在各 Phase | 有且集中（第四部分） |

### 1.5 结论

**Cursor 方案在工程执行层面显著优于我们的方案。** 它的代码级精度、测试先行思维、过渡策略设计、和完整 backlog 管理都是我们应该采纳的。

**我们的方案在产品洞察层面更深。** 九个深层洞察、WE-INDEX 系统分析、和简洁的执行节奏是 Cursor 方案缺少的。

**最优策略：融合两者。** 用我们的产品洞察做"为什么"，用 Cursor 的工程设计做"怎么做"，用 PG 的框架做"先做什么"。

---

## 第二部分：Steve Jobs vs Paul Graham 建议存档

### 2.1 核心分歧表

| 维度 | Jobs | PG | 我们的选择 |
|------|------|-----|----------|
| 幕僚数量 | 1（毛泽东） | 3（毛、PG、Jobs） | **6**（毛、PG、Jobs、Bruce Lee、Kevin Kelly、慧能） |
| Hypothesis Translator | 不做 | 立刻做，简化版 | **做，简化版**（PG 对） |
| 后续追踪 M.2 | 第 9 位 | 第 5 位 | **第 5 位**（PG 对——飞轮启动条件） |
| 衡量标准 | "5 人破防" | "Michael 每周用 1 次" | **PG 的标准优先**，Jobs 标准作为阶段 2 目标 |
| 魔法时刻 UI | 黑屏大字 10 秒 | 一句话，无图表 | **一句话先行**，验证后加 UI |
| Round 2 | 塞进 Round 1 | Round 1 先做，验证后加 | **Round 1 先做，Round 2 条件触发**（有分歧→深挖；无分歧→跳过） |
| 优化目标 | Demo-ability（能上 HN 头条） | Retention（Michael 自己用一年） | **先 Retention，后 Demo-ability** |

### 2.2 两人都同意的（我们也同意）

- 多 Provider 选择是噪音 → 选一个最好的
- 分支会话、事实检查、结论优先模式都太早
- Wisdom Eval Bank CI 现在不做
- 贝叶斯时刻是产品高潮
- 109 项里 90 项应该暂停

### 2.3 我们的独立判断

**6 个 Persona 而非 1 个或 3 个的理由：**

- Jobs 说 1 个——太少。私董会的核心价值是"张力"。一个人再牛也只是单声道。
- PG 说 3 个——最小张力单元，逻辑成立。
- 我们说 6 个——因为我们要覆盖东西方认识论的张力。毛/PG/Jobs 全是"行动者"框架。加入慧能（照见/无为）、Kevin Kelly（涌现/长期主义）、Bruce Lee（截拳道/直觉），才有"分析 vs 直觉"、"行动 vs 观照"、"西方 vs 东方"的正交维度。
- 实施策略：6 个都做 theory.md + voice.md，但情境卡片可以有所侧重（毛和 PG 各 16 张，其余 4 人各 8 张先行）。

**Hypothesis Translator 做简化版：**

PG 说得对——拒绝不合适的输入比接受所有输入有用 10 倍。用户问"Bruce Lee 的 5 步积极思维是什么"不应该触发 12 人辩论。但不需要 Cursor 方案那么复杂的四分类 + JSON 输出。简化为：
1. 是信息查询？→ 短路，直接回答
2. 太模糊？→ 反问 2-3 个澄清问题
3. 可以做？→ 走完整流程

---

## 第三部分：PG-Based 分阶段优先级

### 衡量标准（PG 框架）

> **12 周后，Michael 每周至少用 Counsel 一次，且至少一次用完后主动记下新的 to-do。**

### 阶段 0：基础设施（Week 1）

**目标**: 建安全网，让后续修复有保障

| # | 任务 | 来源 | 说明 |
|---|------|------|------|
| 0.1 | 建 `counsel-test-utils` crate + MockModelProvider | Cursor A | 可脚本化返回流式 chunk、HTTP 错误、split-packet |
| 0.2 | 建 `integration.rs` 基础场景 | Cursor A | happy-path 8 步 + 单 persona 报错 + SSE 事件顺序 |

**为什么 PG 方案里没有但我们要做**: PG 跳过了测试基础设施，但 Cursor 方案的 "test first" 哲学是对的。不需要完美的测试套件，但需要一个基本的安全网，否则后续修 bug 是盲改。1-2 天的投入，换来后续所有修改的信心。

---

### 阶段 1：止血 — 让系统跑通（Weeks 1-3）

**目标**: 消除 80 个空文件、metrics 说谎、双倍 API 费用

| # | 任务 | 来源 | 优先级 | 说明 |
|---|------|------|--------|------|
| 1.1 | 消除双倍 API 调用（`run_streaming_collect`） | Cursor B.1 / 我们 1.2 | P0 | **单一最大改进**。流式累积后直接保存，一次调用搞定。Cursor 设计的 `Agent::run_streaming_collect(messages, opts, sink) -> Result<(String, Option<Usage>)>` 是正确方案。 |
| 1.2 | 共享 SSE 行缓冲解析器（`LineDecoder`） | Cursor B.2 | ✅ | `crates/counsel-model/src/sse.rs` — byte-wise buffer 跨 TCP 包重组行，修复 CJK 切字节丢内容 bug。7 个 provider 全部迁移（6 个 SSE + Ollama NDJSON）。9 个单元测试（含 mid-UTF-8-byte split、CRLF、多行单块等）。|
| 1.3 | 每个 Provider 在流式前检查 HTTP 状态 | Cursor B.3 | P0 | 401/500 不再静默变成空流 |
| 1.4 | `StreamingResponse` → `StreamEvent{Delta\|Usage\|Done}` | Cursor B.5 | P0 | Metrics 不再说谎 |
| 1.5 | 静默错误吞没全部转为 `Err` | Cursor B.6 / 我们 1.5 | P0 | `if let Ok(chunk)` → `match`；`let _ = run_debate` → propagate |
| 1.6 | 统一人格系统为一套 | 我们 1.1 | P0 | 三套 12 人名单统一为一套。先用 TypeScript 版 SKILL.md 内容。 |
| 1.7 | 修复中文 byte-slice panic | Cursor C / 我们 1.4 | P0 | `char_indices()` 替代字节切片 |
| 1.8 | 共享 HTTP Client（超时 + 连接池） | Cursor B.4 | P1 | 防止无限 hang |
| 1.9 | 调整所有 max_tokens 到合理值 | 我们 1.6 | P1 | 参照我们方案第四部分的字数设计表 |

**阶段 1 完成标志**:
- 跑一次完整 8 步，12 个 opinion 文件全部非空
- `09-metrics.md` 中 `prompt_tokens ≠ completion_tokens`
- 无 panic

---

### 阶段 2：核心重构 — 让系统做对的事（Weeks 3-6）

**目标**: 恢复关键设计意图，建立飞轮基础

| # | 任务 | 来源 | 优先级 | 说明 |
|---|------|------|--------|------|
| 2.1 | **Step 2 "一步锁定"重设计** | Michael 产品决策 | P0 | 状态机管流程 + LLM 管内容。Facilitator 读用户输入后**直接输出理解**："你的核心问题是 X。你可能也在想：Y、Z。对吗？"用户确认→锁定→马上进 Step 3。最多 2 次来回。砍掉的是"LLM 模拟用户自问自答"，保留的是"LLM 提炼核心问题"。详见下方 §3.1。 |
| 2.2 | **User Wiki 升级为用户级（跨项目）+ Step 3 挖事实作为身份脊柱** | Michael 产品决策 2026-04-22 修订 | P0 | 路径：`./user-wiki.md`（repo 根部，与 `sessions/` 同级）。**一个用户一份 wiki**，跨所有项目累积。每个 session 开始时读取，Step 8 结束时 append。跨项目、跨 session 累积是产品变好的唯一机制。——原 spec 为项目级（`sessions/{project}/user-wiki.md`），2026-04-22 Michael 修订：一个人就是一个人，不该按项目割裂。**2026-04-22 追加**：每次 session wiki append 必须包含 Step 3 "挖事实"的案主回答全文——这是身份层 context-density 最高的原始素材（多位测试用户反馈"挖事实这步眼前一亮"）。Wiki entry 字段：Raw Input + Defined Topic + **Step 3 Facts（身份脊柱）** + Client's Reflection + Bayesian + To-Do + Reactions。 |
| 2.3 | **后续追踪小助理** (M.2) ✅ 2026-04-22 已实现 | Cursor M.2 / Michael | P0 | PG 放在第 5 位的理由："飞轮真的转起来的齿轮"。扫 `user-wiki.md` 的 `## 行动承诺日志` section（案主勾选 to-do 时写入），对 7 天前且未跟进的承诺显示在 topbar `📅 跟进` 徽标数字。案主点击打开 modal，按条选状态（✅做到 / 🔄进行中 / ⏭跳过 / 🔁重新定义）+ 写回应，POST `/api/follow-ups/respond` 后追加到 `./execution-journal.md`（用户级，与 user-wiki.md 并列）。下一次 session 的 Step 2 `facilitator_define_prompt` 读 execution-journal 作为"承诺到执行的真相"——比 wiki 里的承诺更高真值信号。无需后台调度：用户下次打开页面时主动检测，on-demand 模式。 |
| 2.4 | **Hypothesis Translator 简化版** ✅ 2026-04-22 已实现（内联版） | Cursor J.7 简化 / Michael | P0 | 三分类短路：信息查询→直接答；太模糊→反问；可做→全流程。**实装方式**：不做独立 pre-step，直接把三分类分支写进 `facilitator_define_prompt` 的指令里。LLM 自己判断，输出对应格式。不做 Cursor 那么复杂的四分类 + JSON + 自动模式选择。 |
| 2.5 | Step 5 维度选择（用户选 1-3）+ 卡片可展开 | Cursor J.4 / 我们 2.2 / Michael 2026-04-22 | P0 | 不再硬编码前 3。前端 + 后端都校验。**新**（2026-04-22）：维度卡片必须支持完整内容展开（点击"展开全文"），不能只显示截断的 3 行预览——用户需要看全 Core Conflict + Points of Contention 才能做 informed selection。 |
| 2.6 | Step 6 辩论 Round 1（三方自然定位）+ 多维度分区 UI | Cursor J.5 R1 / Michael 2026-04-22 | P0 | 每维度，所有 persona 自主定位 pro/con/middle。**强制 Prompt 首行 `Position: for/against/middle`**（2026-04-22 修订，防止所有人归类 middle 的退化）；categorize_position 支持中英双语关键词。**新**（2026-04-22）：选择多维度（1-3）时，前端必须为每个维度独立渲染 section（含"维度 N / 总数"badge + 标题 + active/done 状态），发送 `DimensionStart/DimensionDone` SSE 事件——避免 persona 卡片在多维度间串台导致"卡死"假象。 |
| 2.7 | Step 8 重排：客户反思前置 + 贝叶斯吸收双视角 | Michael 产品决策 2026-04-22 | P0 | **重要重排**（2026-04-22）：Step 8 进入顺序改为 **(1) 用户先写自己的反思（3 个槽：学到什么/做哪些不同/下一步）→ 提交到后端保存 `07-client-notes.md` → (2) 幕僚评价（prompt 中 includes 用户反思）→ (3) 贝叶斯迭代（综合用户 + 幕僚双视角）**。原流程让用户在幕僚评价之后才填反思，结果用户的"共振信号"没进入贝叶斯 prompt，迭代质量大打折扣。新流程让贝叶斯成为真正的双证据链合成（用户自述 vs 外部评估）。一句话版本：`你之前信念：X（60%）。现在：Y（35%）。原因：Z。` 详见下方 §3.3。 |
| 2.8 | 项目级 `belief-system.md` ✅ 2026-04-22 已实现（用 .md 非 .json） | Cursor M.1 / Michael | P0 | `sessions/{pid}/belief-system.md` 保存最新 Bayesian posterior；`run_harvest` 每次覆盖；Step 2 的 `facilitator_define_prompt` 作为 prior_beliefs 参数注入（4 层上下文之一，最优先）。用 markdown 而非 JSON：LLM 直接读不需要反序列化，人类也可读可手改。 |
| 2.9 | 上下文压缩（非截取）✅ 2026-04-22 已实现 | Cursor J.10 / 我们 2.5 | P1 | `run_summary` 里：debate 超过 `DEBATE_COMPRESS_THRESHOLD = 8000` 汉字时调用 Secretary 压缩到 ~2000 字（保留立场/冲突/未解张力），失败回退原文。硬截取彻底移除。 |
| 2.10 | 步骤缓存（已完成步骤跳过）✅ 已实现 | 我们 2.6 | P1 | `has_cached_file()` short-circuit 逻辑在所有 step 的 route handler 里 |
| 2.11 | 输出清洗（去模型思维过程）✅ 2026-04-22 已实现 | 我们 2.7 | P1 | `strip_think_tags()` util + 5 个单测。Applied 在所有 `write_session_file` 调用点（7 个位置：01-defined / 04-dimensions / 05-debate / 06-summary / 07-harvest / 07-bayesian / premortem）。 |
| 2.12 | 从文件加载 persona prompts（删 persona_prompts.rs）✅ 启动时加载已实现 | Cursor G.2 | P1 | `PersonaRegistry::load("./skills")` 启动时读 6 persona 目录（persona.json + theory.md + voice.md + situations/）。persona_prompts.rs 1990 行文件仍在但未用于 v1 流程——下次清理可删。 |
| 2.13 | **实时共振信号（User Resonance Signals）— 短语/段落级高亮** ✅ 2026-04-22 已实现 | Michael 产品决策 2026-04-22（二次修订 2026-04-22 晚） | P0 | **从 P1 升级为 P0**（2026-04-22 初版）；**卡片级完全替换为短语/段落级**（2026-04-22 二次修订）。覆盖 Step 4-8 所有非案主输出。用户划选任意文本片段 → 浮动工具条 ⭐❗📝。存 `user-reactions.md`（锚定：snippet + 40 字符 prefix + 40 字符 suffix）。Prompt 按类型三级加权（📝 tier-1 > ❗ tier-2 > ⭐ tier-3）。详见 §3.2 + §3.2.1。 |
| 2.14 | **主页 Problem Library + 项目延续入口** ✅ 2026-04-22 晚实现（roadmap 外补录）| Michael 2026-04-22 晚 | P1 | 主页 Step 1 下方展示所有 project，每个可展开显示 sessions + 锁定议题摘要。每个 project 头部"+ 新一轮"按钮：点击后 PID 已 set、SID 清空，进 Step 1 + 显示紫色 banner「延续问题 XXX」，submit 时直接在该 project 下创建新 session。topbar 加「🏠 首页」+ 品牌 logo 可点跳首页。|

**阶段 2 完成标志**（2026-04-22 终盘点）:
- ✅ 2.1-2.14 全部落地（除 2.12 persona_prompts.rs 删除延后）
- ✅ Facilitator 4 层上下文（belief / last_session / journal / user-wiki）
- ✅ 承诺→跟进→执行日志 完整飞轮
- ✅ Step 4.3 / 4.4 / 4.7 前置落地

**阶段 2 完成标志（原）**:
- Step 2 最多 2 次来回锁定核心问题（1 次 LLM 调用直接给出理解，用户确认即锁定）
- User Wiki 在项目根部，跨 session 读写正常
- 贝叶斯更新一句话出现在 Step 8 输出中
- belief-system.json 在 Session 2 正确继承 Session 1 的 Posterior
- 后续追踪发出提醒并记录回复
- 用户在 Step 4-8 的 reaction 被捕获并在后续步骤中影响 prompt

**阶段 2 完成后——停下来，问 PG 的问题**:

> **Michael，过去 4 周你用了几次？**
> - < 4 次 → 产品不够好，回去找原因
> - 4-8 次 → 正在变成习惯，继续阶段 3
> - \> 8 次 → 对你这一个用户达到 PMF，可以考虑扩展

---

### §3.1 Step 2 "一步锁定"详细设计（Michael 产品决策 2026-04-18）

**产品洞察**: 用户来 Counsel 是为了跟幕僚聊，不是跟 Facilitator 做问答。Facilitator 对用户是冰冷的——多追问一轮就多劝退一批人。实际测试中，多轮追问让用户厌烦。

**设计原则**: Facilitator 不问问题，**直接给出理解**。让用户感到"你比我自己更清楚我在想什么"，然后马上进入幕僚对话。

**流程**:

```
用户输入（可能是一团混乱的困惑）
    ↓
Facilitator（1次LLM调用）：
  - 读用户输入 + User Wiki（了解这个人的历史）
  - 直接输出：

    ┌─────────────────────────────────────────┐
    │ 你的核心问题：                             │
    │ "[一句话精炼的核心问题]"                    │
    │                                         │
    │ 你可能也在想：                              │
    │ · [附带问题 1]                             │
    │ · [附带问题 2]                             │
    │                                         │
    │ 👉 对，就这个 / 不对，我想聊的其实是___      │
    └─────────────────────────────────────────┘
    ↓
用户确认 → 锁定 → Step 3（幕僚追问细节）
用户纠正 → Facilitator 再理解一次（最多1次）→ 锁定
```

**为什么这样更好**:

| 维度 | 多轮追问（旧） | 一步锁定（新） |
|------|-------------|-------------|
| 用户感受 | 被审问 | 被理解 |
| 来回次数 | 3-6 次 | 1-2 次 |
| LLM 调用 | 3-6 次（含模拟用户） | 1-2 次 |
| 用户流失风险 | 高（追问劝退） | 低（马上进入正题） |
| 问题质量 | 取决于用户回答质量 | Facilitator 主动提炼 |

**"核心问题 + 你可能也在想"的输出格式**:

Facilitator 把用户的混乱拆成主要矛盾和次要矛盾：
- **核心问题**：用户最需要幕僚团讨论的一个决策点
- **附带问题**：用户可能也在想但没说清楚的 1-2 个相关问题

这些附带问题不是追问——是 Facilitator 展示"我理解你的全貌"。用户看到后会觉得：这个系统懂我。

**状态机（流程控制层）**:

```
INIT → 收到用户输入 → UNDERSTANDING（LLM 提炼）→ CONFIRMING → LOCKED → DONE
                                                    ↓ 用户说"不对"
                                              RE-UNDERSTANDING（再1次LLM）→ CONFIRMING
                                                                              ↓
                                                                           LOCKED（强制）
```

最多 2 次 LLM 调用。状态机保证不会无限循环。

**auto_simulate（测试模式）**:

测试时，"用户确认"步骤由模拟用户自动输入"对"。不再让 Facilitator LLM 自问自答。

**Facilitator Prompt 要点**:

```
你是私董会的主持人。你的唯一工作是帮用户锁定核心问题。

规则：
1. 不问问题。直接说"我理解你的核心问题是___"。
2. 如果用户的输入包含多个交织的问题，拆出 1 个核心 + 1-2 个附带。
3. 核心问题必须是一个具体的、可以让幕僚们辩论的决策点。
   不是"关于出海"，而是"面对印尼3个月窗口期，该全力投入还是等更好的机会"。
4. 你绝不发表任何观点。你只负责澄清问题是什么。
5. 如果有 User Wiki，用它来理解这个用户的背景和历史。

输出格式：
核心问题：[一句话]
你可能也在想：
· [附带问题1]
· [附带问题2]
```

---

### §3.2 实时共振信号详细设计（Michael 产品决策 2026-04-22）

**产品洞察**: 私董会的核心价值不只是幕僚的输出，更在于"董事会根据老板的注意力调整讨论深度"。当前系统 Step 4-8 全程单向广播，用户被某句话打动时没有通道表达，最宝贵的"共振信号"丢失了。被理解是 retention 的核心驱动。

**设计原则**: 轻量、非阻塞、实时可用。不改变现有流式体验，只是在它之上叠加一层用户反馈通道。

**MVP 范围**（v1 实现）:

- 前端：每个 persona 消息块（Step 4/6/7 幕僚发言）右上角加三个按钮：⭐（重要）、❗（关键）、📝（加笔记）
- 点击 ⭐/❗ 即时保存，文字反馈点 📝 弹出轻量输入框
- 可选 highlight 某一句（hover → 选中 → 加标记）
- 存储：`sessions/{pid}/{sid}/user-reactions.md`（追加写入 + 时间戳 + persona + snippet + reaction type + optional note）
- Prompt 注入：Step 5/6/7/8 开始前，后端读取 user-reactions.md 的摘要，注入到 system prompt 开头：
  ```
  用户在前面的讨论中标记了这些点（按时间顺序）：
  - [2026-04-22 10:15] 对毛泽东 "建立根据地" 标记 ⭐
  - [2026-04-22 10:18] 对李小龙 "一英寸截击" 加笔记："这个概念我之前没听过但很有感"
  请在本步骤的思考中优先照顾用户关心的方向。
  ```

**数据格式** (`user-reactions.md`):

```markdown
# User Reactions — Session {id}

## 2026-04-22 10:15:23 — Step 4 — 毛泽东
**Reaction**: ⭐ 重要
**Snippet**: "不要在室内解决室内问题，要去建立根据地"
**Note**: (无)

## 2026-04-22 10:18:07 — Step 4 — 李小龙
**Reaction**: 📝
**Snippet**: "一英寸截击"
**Note**: 这个概念我之前没听过但很有感。好奇怎么在实际中练习。
```

**为什么存 markdown 而不是 JSON**:

- 可人读、可手改（用户未来可能想直接编辑）
- 和现有 session 文件格式一致（`07-harvest.md`、`07-bayesian.md`、`user-wiki.md`）
- LLM 直接读不需要反序列化

**后端职责**:

- 新增 endpoint `POST /api/projects/:pid/sessions/:sid/reactions` —— 接收 reaction，追加写入
- Step 5/6/7/8 执行前，读取 user-reactions.md 注入 prompt
- 可选：Step 8 harvest 评价时，显式让幕僚评论"你最关心的是 X、Y，这反映了..."

**前端职责**:

- 在 Step 4/6/7 的 persona 消息块 UI 组件加 reaction 工具条
- 调用 POST 端点时做乐观更新（UI 即时反馈，不等后端）
- 当前 session 的 reactions 在侧边栏或步骤顶部摘要展示

**为什么是 P1 而非 P0**（已作废 — 2026-04-22 升 P0）:

- ~~P0 项（2.1-2.8）是飞轮机械结构——没有它们飞轮转不起来~~
- ~~2.13 是飞轮的"体感润滑剂"~~
- **修订 2026-04-22**：测试中 Michael 在 Step 4/5/6/7 都反复表达"想做笔记"——没这通道信号就全部丢失。升 P0。

**与其他 Phase 2 项的依赖**:

- 依赖 2.2 User Wiki（写到同一个 sessions 目录结构下）
- 赋能 2.7 贝叶斯更新（reactions 是哪些 prior 真的在动的证据）
- 赋能 2.8 belief-system.json（跨 session 累积出"用户长期关心什么"）

---

### §3.2.1 短语/段落级升级（2026-04-22 晚修订）

**初版 2.13（已实装）**：卡片级 ⭐/❗/📝 按钮挂在每个幕僚消息卡底部。

**Michael 反馈 2026-04-22 晚**：
> "我是在想，就是比如那一段词、句有感触，就像我在读 pdf 一样，可以 highlight，以及做笔记一样（所有的不是案主自己说的话，其实都能激发案主的思考，甚至 facilitator 都可以激发）"

**升级方案**：**完全替换卡片级为短语/段落级**。

**锚定策略**：snippet + prefix(40) + suffix(40 chars)——markdown-agnostic。`textContent.indexOf(prefix+snippet+suffix)` 定位到容器内位置 → `TreeWalker` 把字符 offset 还原到 DOM 节点 → `range.surroundContents` 包 `<mark class="r-star|r-bang|r-note">`。跨节点时 fallback 拆分多段 wrap。

**Why snippet+context 不用 offset / CSS selector**：Step 6 流式期 textContent 追加、resume 时跑 `md()` 渲染——offset 完全失效；snippet+context 对渲染形态无感，定位鲁棒。

**Markable 区域**（加 `[data-markable][data-step][data-persona]`）：
1. Step 4 `.ocard-t`（幕僚意见）
2. Step 5 `.dcard .dtext`（维度描述——新增，原 2.13 未覆盖）
3. Step 6 `.dbmsg-t` persona + 主持人（`data-persona="facilitator"`）
4. Step 7 `#s7-content`（summary）
5. Step 8 三张 `.scard .sb`（evals / harvest / bayesian）

**浮动工具条**：文档级单一 `mouseup` + `selectionchange` 监听；选区出现在 markable 容器内 → 浮动 `<div id="phrase-toolbar">` 在 `getBoundingClientRect()` 附近；三颗按钮 ⭐/❗/📝。

**流式期**：`.cur` 类表示正在流入；工具条忽略含 `.cur` 的容器（避免 Range 被 textContent 追加破坏）。Step 7 `facilitator_chunk` 每 chunk 都 `innerHTML = md(fullText)` 重绘——流式期禁止 Step 7 标记；流完后 `applyAllSavedMarks(#s7-content)` 从 `user-reactions.md` 重建。

**重放**：`loadCompletedSteps` 尾部 + `runS7` 流完后调 `applyAllSavedMarks()`——按 `(step, persona)` 分组匹配容器，逐条 `applyMark(entry)`。

**卡片级反应全部移除**：`reactionToolbarHtml` 废弃；不保留 ⭐/❗ 卡片入口也不保留 📝 卡片入口。选区够小可以涵盖"几个字"，够大可以涵盖"整段"，语义自然覆盖。

**下游 prompts 加权**（详见 §3.5）：
- 📝（带文字笔记）→ tier-1
- ❗（关键）→ tier-2
- ⭐（重要）→ tier-3
- 笔记 `note` 原文 verbatim 引入 prompt，不压缩

---

### §3.3 Step 8 重排详细设计（Michael 产品决策 2026-04-22）

**产品洞察**: 原 Step 8 流程——幕僚评价 → to-do → 贝叶斯迭代 → 最后让用户填"我的收获"——把用户的自我反思放在了整个价值链的最末端。这意味着用户的**自述信号**（"我真正学到了什么"）从未进入贝叶斯 prompt，也没进入幕僚评价 prompt。贝叶斯迭代因此是**单侧迭代**——只有外部专家视角，没有当事人视角。

**Michael 原话（2026-04-22）**：
> "我感觉是不是把这一部分放到幕僚们对我的评价之前……这一轮贝叶斯迭代就不仅仅是幕僚们的观点进来了，然后这个案主他自己的观察也放进来了，这里头就会有一个迭代在里面。会更强悍，这个迭代。"

**新流程**：

```
用户进入 Step 8
    ↓
[1] 反思面板（3 个槽位，置顶）
  · 我学到了什么 / 意识到了什么
  · 我将做哪些不同
  · 我的下一步
    ↓
用户点击"让幕僚根据我的反思做评估 →"
    ↓
POST /client-notes → 保存 07-client-notes.md
    ↓
POST /steps/8 （force_refresh=true）
    ↓
[2] 幕僚并发评价（6 persona） — prompt 中 include 用户反思作为 "## Client's Own Reflection"
    ↓ 写入 07-persona-evals.md
[3] Secretary 提取 to-do 清单（写入 07-harvest.md）
    ↓
[4] Secretary 生成贝叶斯迭代 — prompt 中同时 include 用户反思 + 幕僚评估
    ↓ 写入 07-bayesian.md
[5] append 到用户级 user-wiki.md
    ↓
UI 展示：幕僚观察 → 行动清单 → 贝叶斯信念更新
```

**为什么更强悍**:

| 维度 | 旧流程（单侧） | 新流程（双证据链） |
|------|-------------|-------------|
| 贝叶斯输入 | 仅幕僚评价 + 会议总结 | 用户反思 + 幕僚评价 + 会议总结 |
| 幕僚评价盲点 | 不知道用户"自己以为学到了什么" | 可以对比自述与外部观察，指出偏差 |
| 用户体验 | "填写框在最后，幕僚们都走了我才写" | "我先写——幕僚围绕我的理解做判断" |
| 对齐 PG retention | 弱（用户只是读最终 harvest） | 强（用户必须主动投入才能解锁 harvest） |

**提示工程要点**:

`bayesian_update_prompt` 新的第 4 段 `## 案主本人的反思（一手信号）`——明确告诉 Secretary：
> "这段反思是用户自己在看过幕僚评估之前或同时写下的，代表他/她此刻对会议的理解和承诺。把这段当作与幕僚评估并列的证据源，不要低估它——案主自己'意识到'的往往比外部评估更能真正撬动信念。"

`harvest_eval_prompt` 新的 `## Client's Own Reflection` 段落——让每位幕僚：
> "Use this as a signal: does the client see what you see? What are they missing, misreading, or getting right?"

**数据模型**:

- `sessions/{pid}/{sid}/07-client-notes.md` — 客户反思，结构：`## 我学到了什么` + `## 我将做哪些不同` + `## 我的下一步`，三段
- 旧 `07-harvest.md` 保持不变（to-do + insights），但 LLM 不再输出 `Client's Achievements` 占位符（由前端反思面板承担）
- 贝叶斯和幕僚评价 prompt 各自新增一个可选段，客户为空时退回无反思模式

**API 新增**:

- `POST /api/projects/:pid/sessions/:sid/client-notes` body `{learned, differently, next}` → 写 `07-client-notes.md`
- `POST /api/projects/:pid/sessions/:sid/steps/8` 保持不变，但内部会读取 `07-client-notes.md`（如存在）

**前端状态机**:

```
Step 8 进入 → 检查 07-harvest.md 是否已存在
├─ 是（已完成过）: 渲染反思面板（prefill from 07-client-notes.md）+ 下方展示已缓存的 evals/harvest/bayesian
│                 允许用户修改反思 → 点击"重新提交" → force_refresh=true 重跑 harvest
└─ 否（首次）: 只渲染反思面板 + 下方蓝色提示框"请先写反思"
               用户提交 → POST /client-notes → POST /steps/8 → 流式渲染
```

---

### 阶段 3：五层人格架构 — 6 个 Persona 深度构建（Weeks 6-10）

**前提**: 阶段 2 的 PG 问题给了绿灯

**目标**: 从扁平 SKILL.md prompt 升级到五层智慧人格知识架构

| # | 任务 | 来源 | 优先级 | 说明 |
|---|------|------|--------|------|
| 3.1 | 定义 `WisdomPersona` / `SituationCard` / `PressureFingerprint` 数据结构 | 我们 3.1 / Cursor H.1-H.3 | ✅ | `crates/counsel-core/src/wisdom.rs` |
| 3.2 | Persona 目录 schema | Cursor H.1 | ✅ | `skills/{slug}/{persona.json, theory.md, voice.md, situations/*.md}` |
| 3.3 | TheoryLoader + SituationCardLoader | Cursor H.2 | ✅ | `PersonaRegistry::load()` |
| 3.4 | PressureFingerprint 提取器 | Cursor H.3 / 我们 3.x | ✅ | `crates/counsel-core/src/fingerprint.rs` — 启发式关键词匹配（13 数字轴 + 1 不对称标签），0 extra API call。9 个单元测试。Step 3/4/6/8 五个 call site 已接入。 |
| 3.5 | 内存 RAG（余弦相似度匹配情境卡片） | Cursor H.4 | ✅ | `wisdom::top_matching_cards` + `PressureFingerprint::similarity`，top-3 matched cards 已进入 prompt |
| 3.6 | PersonaPromptAssembler（Voice Mode 优先） | Cursor H.5 | ✅ | `WisdomPersona::build_system_prompt` — 五层 + top-3 情境卡片 + voice 全部组装 |
| 3.7 | 端到端 KB 集成测试 | Cursor H.7 | P1 | dummy persona 验证完整管线（可延后） |

**6 个 Persona 内容构建（并行，不阻塞 Rust 代码）**:

| Persona | theory.md | voice.md | 情境卡片 | 侧重 |
|---------|-----------|----------|---------|------|
| **毛泽东** | ✅ 完整 | ✅ 完整 | **16 张** | 数据最丰富（5 个 WE-INDEX 案例），重点打磨 |
| **Paul Graham** | ✅ 完整 | ✅ 完整 | **16 张** | WE-PG-001 GOLDEN 24/25，核心 persona |
| **Steve Jobs** | ✅ 完整（有 TS SKILL.md） | ✅ 完整 | **12 张** | 有 TS 基础，改造工作量小 |
| **Bruce Lee** | ✅ 完整 | ✅ 完整 | **12 张** | WE-BL-001 GOLDEN 24/25，截拳道哲学 |
| **Kevin Kelly** | ✅ 完整 | ✅ 完整 | **8 张** | 涌现/长期主义，与其他 5 人形成正交 |
| **六祖慧能** | ✅ 完整 | ✅ 完整 | **8 张** | WE-HUINENG-001 GOLDEN 23/25，东方照见 |

每人格 theory.md ≈ 400 行深度。从 WE-INDEX GOLDEN 案例中提取 seed 卡片（Cursor K.2 的策略正确）。

**阶段 3 完成标志**:
- 6 个 persona 的 theory.md + voice.md + 情境卡片全部到位
- Fingerprint 提取器在每个 session 开始时生成 18 维向量
- RAG 匹配返回每 persona 的 top-3 相关情境卡片
- 组装后的 prompt 包含 theory + voice + 情境卡片 + 用户上下文

---

### §3.4 User Wiki 组织框架（Michael 决策 2026-04-22 — 推迟设计）

**当前状态**（2026-04-22）：User Wiki 已经是用户级（`./user-wiki.md`，跨项目单一文件），每次 Step 8 结束 append 一个 session 区块，包含：
- 案主自己的反思（从 `07-client-notes.md`）
- 贝叶斯信念更新（从 `07-bayesian.md`）
- 行动清单（从 `07-harvest.md`）
- 实时共振信号（从 `user-reactions.md`，Phase 2.13 产出）

**Michael 原话（2026-04-22）**：
> "我们先做记录，然后后期到 roadmap 后面一点的时候，再讨论 user wiki 用什么样的框架来更好的整理和搭建。"

**当前策略**：**只管收录，不管结构**——先把"原始资料"完整沉淀下来，等有 3-5 个 session 的真实数据之后，再回头看应该按什么框架（身份层 / 信念演化层 / 行动追踪层 / 模式识别层 / ...）重组。过早的结构化会污染后期的 framework 选择。

**未来 Phase 4.x 或阶段 5 的讨论点**：
- **身份层的脊柱是 Step 3 "挖事实"的回答**（Michael 2026-04-22 产品判断）——案主在具体问题情境下的自然回答，潜意识嵌套性最强、context-density 最高。其他层（信念演化、行动追踪、共振信号）都是基于这个身份脊柱的变化/轨迹。Framework 设计时，**identity layer 优先 anchor 在 Step 3 facts 的纵向累积**（多个 session 的 facts 会暴露 patterns）。
- 身份档案（身份层）vs 决策事件（事件层）vs 信念演化（时间序列层）的分层
- 是否引入 LLM-driven 的 wiki 重组 agent（参考 Tier 2 backlog #73 "User Wiki auto-deepening"）——很可能需要专门的 agent 从 N 个 session 的 Step 3 facts 里提炼出用户的稳定模式
- Session-level wiki 区块 vs cross-session pattern 提取的两层架构
- 是否需要 belief-system.json（结构化） + user-wiki.md（叙事）双轨

**为什么 Step 3 facts 比 Step 8 反思更重要**（Michael 2026-04-22 判断）：
- Step 8 反思 = 结论性、有意识加工（"我以为我学到了什么"）
- Step 3 facts = 原始、潜意识、高 context-density（"具体情境里我实际上如何反应"）
- 前者是自述的投射，后者是真实的轨迹样本

**不做的决策（at least v1）**：
- 不预设 schema 字段
- 不引入 JSON 结构
- 不做 diff / merge / version control

---

### §3.5 笔记下游用途路线图（Michael 决策 2026-04-22 晚）

**本轮（v1 MVP，和短语级高亮一起落地）**：

1. **Prompts 按类型三级加权 + 笔记文字 verbatim 引用**。`prepend_user_reactions` 按 📝（tier-1，用户主动打字，信号最强）/❗（tier-2）/⭐（tier-3）分组输出到 Step 5/7/8a/8c prompts。笔记 `note` 字段原文不压缩引入，让 LLM 直接读到用户的语言。
2. **Middle-react hook（Round 2 就绪）**。`debate_middle_react_prompt` 增加可选参数 `user_reactions_on_pro_con`——当 middle persona 反应 pro/con 时，如果用户已对 pro_con 的 snippet 做过标记，middle 的 prompt 里能看到"用户对 {pro_persona} 的 '{snippet}' 标了 ⭐/❗ 并写了 '{note}'"。这个 hook 现在就挂上，对 4.1 Round 2 条件触发天然 ready，对当前 middle-react 也立即生效。
3. **User Wiki 高亮专栏**。`run_harvest` 的 wiki_entry 里把 reactions_section 从原始 dump 改成结构化"本次金句集"：`1. [⭐ 来自 毛泽东] "..." — 笔记："..."` 格式。跨 session 时这种结构容易被未来的 Wiki 重组 agent（§3.4）消费。

**Phase 4+（roadmap 占位，不现在做）**：

4. **Step 8 反思 autodraft**：打开反思面板时用用户自己的高亮 prefill 占位："看起来你对 X / Y 特别有感触——你从这里学到了什么？"
5. **Persona proxy 深潜对话**：高亮浮层加一个"💬 让 PG 对这句继续聊我"按钮 → 开 mini 子会话（不算正式 session）
6. **跨 session 模式识别**：3+ sessions 后 LLM 扫高亮池——"你在 5 个 session 里都标记了关于'根据地'的话"
7. **Session N+1 prior 种子**：Hypothesis Translator（2.4）读最近 20 条高亮——"用户倾向行动框架，避免抽象系统语"
8. **Persona 权重动态**：连续 3 session 都主要标记某幕僚 → 下 session 给该幕僚更多发言权重

**Tier 2（deferred，见 memory `feature_idea_daily_training_tools.md`）**：

9. **每日训练素材生成**：高亮库 → 每日小练习的 seed（"今天 PG 会对你说什么？"基于你过去高亮他的句式）

---

### §3.6 中英双语策略（Michael 决策 2026-04-22 晚）

**核心原则**：
- **Persona system prompt 永远是人物原生语言**（保 voice——PG 在英文里, 毛在中文里）
- **用户可见输出跟 UI locale 走**（UI=ZH 全中文；UI=EN 全英文）
- **Facilitator / Secretary / Bayesian prompts 跟 locale 走**（需要 EN variants）
- **通用结构性 prompts（debate_persona_prompt 等）保持英文结构**（LLM 解析稳）

**为什么不全面双语化每个 prompt**：prompts 是给 LLM 看的结构，LLM 中英都能解析；全翻译是维护负担且两份易漂移。

**为什么 persona voice 必须原生语**：PG 用中文写 essay 会失掉"Paul Graham 的味道"；毛用英文讲"根据地"会失掉中国革命话语 texture。authenticity 依赖原生语言。

**三件事**：

**C1. 全局 locale 机制**（MVP 骨架）
- `localStorage.getItem('counsel:locale')`，默认 `'zh'`
- Topbar 加小开关 `🌐 中 / EN`
- API 调用带 `X-Locale` header
- 后端 session meta.json 存 locale 字段
- v1：机制搭好，EN 暂时"即将支持"提示；默认 ZH

**C2. Persona 语言指令**（动态注入，单文件不 fork）
- Service 层 assemble persona system prompt 时根据当前 locale append 一段 directive
- 西方人物：`"You speak in English natively. When UI=en: respond in English. When UI=zh: translate your English thinking to fluent Chinese, keep voice recognizable."`
- 东方人物：`"你用中文思考。UI=zh 时用中文；UI=en 时翻译成英文但保留你的句法节奏。"`
- 不创建 `SKILL.md.en` + `SKILL.md.zh`——避免两份漂移

**C3. Facilitator / Bayesian EN variant**（v1 优先这两个）
- `facilitator_define_prompt` / `facilitator_correction_prompt` / `bayesian_update_prompt` 接 `locale` 参数，内部分叉输出 EN/ZH 版
- 其他 prompt（dimensions / summary / harvest）保持英文结构 + `"Respond in {locale}."` 尾部指令即可（LLM 遵从稳定）

**推迟到 v2（有真实英文用户后）**：
- 所有 prompts 完整 EN variant
- UI i18n 字典全量翻译
- skills/*/SKILL.md 加载逻辑（和 2.12 合并做）

**不做**：
- 为每个 persona 创建双文件（SKILL.md.en + SKILL.md.zh）
- 强制所有人物都会双语回答（毛如果用英文还能保留"辩证唯物"节奏吗？交给 persona directive + LLM 自己负责）

---

### 阶段 4：验证与扩展（Weeks 10-12）

**前提**: 阶段 3 的 6 个 persona 已上线

| # | 任务 | 来源 | 优先级 | 说明 |
|---|------|------|--------|------|
| 4.1 | Step 6 Round 2（条件触发，"Deeper, not debate"） | Cursor J.5 R2 + Michael 决策 | P1 | **条件触发**：Round 1 后 Secretary 检查分歧度——pro/con/middle 三方都有人→进 Round 2；高度一致（某方为空）→跳过 Round 2 直接 Summary。避免简单问题浪费 token，复杂问题充分挖掘。 |
| 4.2 | Step 7.5 贝叶斯合成独立步骤 | Cursor M.4 | P1 | 从 Step 8 中独立出来，给予独立的 UI 时刻。"你的世界观更新了。" |
| 4.3 | **Session N+1 自动继承上下文** ✅ 2026-04-22 已实现 | Cursor M.3 / Michael | P1 | `Storage::read_last_wiki_entry()` 解析 `user-wiki.md` 的最近一条 `---` 分隔 session entry，`run_define` 读取并作为独立 "## 上一次 Session 的完整上下文" section 注入 `facilitator_define_prompt` 和 `facilitator_correction_prompt`，置于 `## User Wiki` 全量历史之前。Facilitator 现在能识别话题连续性（"今天是上次议题的延伸吗？"）。belief-system.json 和 execution-journal 暂未实装——前者依赖 2.8，后者依赖 2.3，都在 roadmap 排期中。当前的 user-wiki.md 已经包含每次 session 的反思 / 贝叶斯 / to-do / reactions 全景，信号足够。 |
| 4.4 | **Pre-Mortem（Step 6.5）+ 流式 + 后台预跑** ✅ 2026-04-22 已实现（含流式升级） | Cursor J.1 / Michael | P2 | 新增 `run_premortem` 方法 + `premortem_prompt`：Secretary 站在一年后的视角讲"失败的故事"——3 个最可能的失败路径 + 辩论遗漏的盲区 + 早期预警信号。输出存 `premortem.md`，由 `summary_prompt` 读取并整合到 synthesis。前端 Step 7 UI 拆成两张卡：上方琥珀色 "⚠️ Pre-Mortem" 卡 + 下方 "📋 秘书汇总"。**2026-04-22 晚升级**：(a) 改为流式，用 forwarder task 模式把内部 FacilitatorChunk 转成 PremortemChunk；(b) Step 6 `step_done` 后 `tokio::spawn` 后台预跑 Pre-Mortem，使用 `SseSink::discarded()` 丢弃型 sink；forwarder task 每 ~400 字符 flush 一次 `premortem.md`——用户点 Step 7 时文件已经有部分内容，前端直接读取。Step 7 handler 的 `has_cached_file` 短路逻辑已覆盖这个场景。用户失败率 ≈0，感知延迟大幅降低。 |
| 4.5 | 维度 phase-overlap（Dim N+1 Round1 与 Dim N synthesis 并行）| Michael 2026-04-22 诊断后 | P3 | **深度讨论后再做**。当前 Step 6 循环已经 back-to-back 无延迟，但每个 dimension 末尾的 facilitator synthesis 是 15-30s 串行——可以让 Dim N+1 的 Round1 persona calls 和 Dim N 的 synthesis 并行，节省总时 ~15s × (N-1)。**不做的原因**：(1) `run_debate` 要重构成分阶段可暴露的 pipeline；(2) 前端 dimension 事件解复用要处理乱序（Dim N synthesis 还在流、Dim N+1 persona_start 到达）；(3) DeepSeek 13 路并发 rate-limit 未测。收益 vs 改动面不划算，等 Michael 确实体感到"间隙"再做。 |
| 4.5 | Red Team 角色标记 | Cursor J.8 简化 | P2 | 毛泽东和 Bruce Lee 默认带 Red Team directive |
| 4.6 | Step 3 支持前端驱动 | 我们 2.8 | P2 | 真实案主回答 persona 问题 |
| 4.7 | 称呼自定义（全局变量 + 设置 UI） | Michael 2026-04-22 | P3 | 当前术语硬编码：**幕僚**（不用"顾问"）、**案主**（不用"用户"/"客户"/"the client"）。未来加一个 user-level 全局变量 `terminology: {advisor_label, subject_label}`，设置页面允许案主自行定义（比如有人想叫"参谋"、"主公"；或者"来访者"、"求问者"）。默认保留当前的"幕僚/案主"。实装时：session 创建时快照当前术语到 meta.json；prompt 组装时动态替换。不做的原因：当前 v1 只有一个案主，没有多样性需求，先固定一套。 |

**阶段 4 完成后——再停下来问**:

> **Michael，你用了 8 周，多少次主动打开 Counsel？最有价值的一次是什么？**
>
> 如果答案让你想告诉别人——进入 Phase 2（扩展到 5 个用户）。
> 如果答案是"还行但不够"——回去改。那里藏着产品的真正问题。

---

### 阶段 5：Persona 内容扩充（深度版）

**前提**: Phase 2 机械层全部完成（✅）+ Phase 3 架构（3.4 Fingerprint / 3.5 RAG / 3.6 PromptAssembler）完成后推进。

**目标**: 把 6 个 v1 persona 从当前的 theory.md/voice.md 骨架扩充到五层深度，配合 Phase 3 的 RAG + PromptAssembler 形成真正的"原声"。

**参考资料**:
- 当前仓库：`DEEPENING-PERSONAS.md` + `wisdom-persona-kb-framework.md`
- WE-INDEX.md 里的 GOLDEN 案例（毛 5 个 / PG GOLDEN 24/25 / Bruce Lee 24/25 / 慧能 23/25）作为情境卡的 seed

| # | 任务 | 优先级 | 说明 |
|---|------|--------|------|
| 5.1 | `skills/mao-zedong/` — theory.md 400 行 + voice.md 完整 + **16 张情境卡** | P0 | 数据最丰富；重点打磨"根据地"、"矛盾分析"、"实事求是"、"从群众中来" 四大操作系统 |
| 5.2 | `skills/paul-graham/` — theory.md 400 行 + voice.md + **16 张情境卡** | P0 | WE-PG-001 GOLDEN 24/25 是 seed；essay 节奏、"Do Things That Don't Scale"、"default alive vs dead" |
| 5.3 | `skills/steve-jobs/` — theory.md + voice.md + **12 张情境卡** | P1 | TS 版有基础 SKILL.md，改造工作量小；聚焦"focus means saying no"、产品美学 |
| 5.4 | `skills/bruce-lee/` — theory.md + voice.md + **12 张情境卡** | P1 | WE-BL-001 GOLDEN 24/25；截拳道、"以无法为有法"、水的隐喻 |
| 5.5 | `skills/kevin-kelly/` — theory.md + voice.md + **8 张情境卡** | P1 | 涌现、长期主义、technium；相对 data 少，八张够用 |
| 5.6 | `skills/huineng/` — theory.md + voice.md + **8 张情境卡** | P1 | WE-HUINENG-001 GOLDEN 23/25；顿悟、见性、"本来无一物" |

**情境卡格式**（基于 Cursor H.1 / 我们 3.2）:
```markdown
# {Situation Name}

## 触发条件（Fingerprint match）
- 压力维度: {哪几个 18-dim 轴需要高匹配}
- 情境关键词: {让 RAG 相似度高的词}

## 人物的回应（voice + reasoning）
{当这种情境出现时，这位人物会如何思考、如何说}

## GOLDEN Reference
{WE-INDEX 里的具体 case id，作为 few-shot 样例}
```

**执行顺序**: Phase 3 先做完（FingerprintExtractor + RAG + PromptAssembler 提供消费这些内容的管道），再扩充内容。没有管道，内容扔进 theory.md 也只是 rich_prompt 拼进去，失去分层价值。

**要求做 plan**: Michael 2026-04-22 晚明确——persona 内容扩充前要先 plan（读 WE-INDEX + DEEPENING-PERSONAS，提出每人的 seed case + 目标深度，待确认再动笔）。

---

### §3.7 UI 圆桌沉浸式重构（Phase 6 — 大规模视觉重做）

**前提**: Phase 2 + 3 + 5 完成；现有 UI 作为 MVP 支撑日常使用，但不是终态。

**视觉语言参考**: Michael 的设计沙盒 https://github.com/michaelhuo2030/roundtable-advisor/ — `UI language/` 目录有完整 demo。

**核心视觉隐喻**: **圆桌会议**。当前 UI 是"线性消息列表 + 进度点"——功能够用但没有"私董会"的那种"众位智者围坐"的临场感。目标：
- 中央 `host` 图标（🎙 主持人）
- 周围环形分布 6 个 persona avatar（orbital ring）
- Avatar 有三态：默认 → 激活（彩环） → 发言中（脉动 + ripple 涟漪）

**两套主题（Michael 明确要做）**:
- **深灰主题**（黑色背景 `#0a0a0a`）— 沉浸式、专注、主视觉
- **乳白主题**（`#f4f3ef` 米白）— 柔和、阅读友好，日间或文档模式

**关键交互 Pattern A · 头像冒泡发言**（来自 v6/v7）:
- Persona 说话时，**小气泡从其 avatar 冒出**（尾巴三角指向下方 avatar），而不是从独立聊天框
- 气泡内容是摘要（~40 字）。用户**点击气泡**打开右侧 260px 滑入面板显示完整发言
- 关键样式（demo CSS 已有）:
  ```
  @keyframes bubbleIn { 0%: translateY(8px) scale(.94); 100%: translateY(0) scale(1) }
  .sbub { padding:8px 11px; border-radius:8px; max-width:180px;
          background:rgba(8,8,8,.92); backdrop-filter:blur(8px); }
  .sbub::after { /* 三角尾巴 pointing down to avatar */ }
  ```
- **为什么这样做**：沉浸感——用户感觉"人在桌边说话"，而不是"读群聊记录"

**关键交互 Pattern B · 维度收敛动画**（Step 5 新设计）:
- Step 5 主持人拆解维度时，**每识别一个维度就从中心飞出一个气泡**（`@keyframes dimAppear` 0.3s 缩放出现）
- 气泡停留 1-2 秒让用户看到 → 然后**缩小飞向右上角**（`@keyframes dimFly` 0.5s cubic-bezier(.4,0,1,1)）
- 右上角有一个 `#dim-tracker` 面板，按顺序"接住"每个维度，显示为带颜色圆点的小条
- Step 6 辩论时这个 `#dim-tracker` 变成"当前维度指示器"——正在辩论哪一维高亮

**Avatar 技术方案**（来自 `UI language/AVATAR-STYLE-GUIDE.md`）:
- **portrait-grid.png** — 5×5 网格大图，25 人在一张图里
- CSS `background-position` 裁剪，无需切图文件
- 每人固定签名色（v1 六人：毛 #FF3B3B / PG #FF8C42 / Jobs #B0B0FF / 李小龙 #FFE066 / KK #4ECDC4 / 慧能 #B39DDB — 和当前 app.js 已对齐）
- 头像源图是白描/连环画风格（灰度 + CSS `filter: brightness() contrast() grayscale()` 调色）

**影响的现有 app.js 结构**（为 Phase 6 做准备时要重构的）:
- 当前 `.ocard` / `.dbmsg` 是垂直消息卡片——需要整体换成环形 avatar 布局
- `persona_start` / `persona_chunk` 事件驱动气泡冒泡，而不是创建新卡片
- `DimensionStart` / `DimensionDone` 驱动 Step 5 的飞出/收敛动画
- Phase 2.13 的短语级 highlight 在新 UI 下需要重做锚定层（气泡/详情面板都需要 `data-markable`）

**分阶段交付**:
1. **6.1**: 避免破坏性替换——先做"新 UI 视图 A/B 切换按钮"，用户可手动切换到圆桌视图
2. **6.2**: 完善 Pattern A（头像冒泡 + 滑入详情面板），替换 Step 4/6 的 persona 发言渲染
3. **6.3**: 完善 Pattern B（维度收敛动画），Step 5 视觉化
4. **6.4**: 迁移 Phase 2.13 高亮引擎到新 UI（锚定层重写）
5. **6.5**: 两套主题（深灰 / 乳白）toggle
6. **6.6**: 去掉旧 UI 作为默认（保留作为 fallback 直到新 UI 稳定）

**要求做 plan**: Michael 2026-04-22 晚明确——UI 重构 scope 大、风险高、影响所有现存交互路径，必须先 plan 再动工，不能直接改代码。

---

### §3.8 Phase 7 · 个人私董会（Personalization Layer — Michael 2026-04-22 晚决策）

**核心产品洞察**：人物之所以起作用，是因为**案主和这个人物建立了深度的人格连接**——读过他的书、看过他的访谈、在自己最难的时刻反复回味过他说过的话。案主对这个人物有**prior beliefs 和基本的信任**。没有这种预先存在的信任，再精致的 persona prompt 也只是一段陌生的文字。

所以"6 个 v1 persona"只是**工厂默认值**。真正的产品形态是：**每个案主组建属于自己的私董会**——选 3-6 个他/她真正熟悉、信任、愿意让其指引人生的人物。

**Michael 自己的例子**（这就是设计靶向）：他深度学过 **毛泽东、李小龙、钱学森、慧能**——不是随机六选六，而是**这四个人**的思想真的渗透过他的人生。他要私董会就是这四个人加上他后来新认可的。钱学森在我们的默认 6 人里根本没有——但对 Michael 是第一等重要。

### 功能需求

**7.1 Persona Filter**（最基础）
- UI: 在 Step 1 或 Settings 里让案主从可用 persona library（工厂默认的 6+ 张卡）勾选 3-6 个作为"本案主的私董会"
- 后端：`COUNSEL_PERSONAS` env var 已有雏形（filter at load time）；升级为**per-user 设置**（写入 `user-config.json` 或类似）
- 影响范围：PersonaRegistry::load 读取用户配置，只加载勾选的 persona

**7.2 Persona Beliefs Upgrade / Fill-in**（Swiss-knife）
- 案主给某个 persona 加**自己的注释**——"我从这个人身上学到的、与官方版本不同的重点"
- 存储：`~/my-personas/{slug}/user-annotations.md`（用户级）或 `skills/{slug}/user-overlay.md`
- 三种插入层：
  - **Theory overlay**：案主补充 worldview / life philosophy / methodology 的个人注释
  - **Situation card additions**：案主加自己生活中经历过的、对应这个 persona 方法的"个人情境卡"（比如"我用毛的'根据地'思维重新思考了大理 vs 上海"——成为下次 RAG 可以匹配到的卡）
  - **Voice notes**：案主对这个 persona 讲话风格的个人感知（"我记得李小龙在 XX 处说过..."）
- 这些层被 `WisdomPersona::build_system_prompt` 在工厂 prompt 之后追加注入

**7.3 Standalone / Custom Persona**（终极灵活性）
- 案主完全从零建一个 persona（比如钱学森、王阳明、张小龙、自己的导师）
- 最小内容：persona.json + theory.md stub + 1-2 situation cards
- 可选：导入工具——粘贴一段这个人物的经典访谈/书籍文本，系统帮生成第一版 theory 骨架（reuse 的是 Phase 5 cookbook + 一个"新 persona bootstrap" LLM prompt）

**7.4 Persona Library**
- 官方 seed library：6+ 人（当前 v1），逐步扩展到 20-30 人（二战将领 / 商业创始人 / 哲学家 / 艺术家 / 修行人…每个人有 Phase 5 等级的深度）
- 社区贡献 library：案主写的 custom persona 可选地分享到公共池（隐私默认本地）
- 每个 library 条目有预览、作者、更新时间

### 架构影响

当前：`skills/` 目录是工厂固定资产，`PersonaRegistry::load` 启动时全部加载。

Phase 7 之后：
- `skills/` 保留为**工厂 library**（只读、版本化）
- 用户级 `~/.counsel/my-personas/{slug}/` 覆盖/补充/新增
- `PersonaRegistry::load` 先读 `skills/`，再读用户目录，合并（用户目录覆盖同名 slug）
- 新一层 `user-annotations.md` + `user-situations/*.md` 在 build_system_prompt 时追加

### 为什么 Phase 7 不是 Phase 5.5

Phase 5（persona 内容扩充）是在**给工厂默认 persona 加深度**。Phase 7 是**给案主个人化能力**。两件事正交：
- Phase 5 给出 6 个默认高质量 persona——没有它，library 是空的
- Phase 7 让案主选择、覆盖、添加——没有它，6 个默认永远是 6 个默认

先 Phase 5（内容），再 Phase 6（UI 圆桌），再 Phase 7（个人化）。Phase 7 不能在 Phase 5 没完成前做——库里没货，filter 没意义。

### 优先级 / 排期

- **P2**（Phase 5 完成后立刻做的下一轮最重要事之一；与 Phase 6 UI 重构哪个先做取决于哪个对案主日常使用价值更高）
- 最小 MVP = 7.1 Persona Filter（env var → 用户配置文件一行改动 + Settings UI 一个多选框）——半天工作
- 核心 MVP = 7.1 + 7.2 Theory overlay（最小追加层）——1-2 周
- 完整版 = 7.1 + 7.2 + 7.3 + 7.4——几个月（因为库要持续扩）

### 相关设计决策已做过的

- `COUNSEL_PERSONAS` env var（2026-04-22 PG pilot 时加的）—— Phase 7.1 的前身
- `skills/_sources/` 独立目录（2026-04-22 加的）——已经在为"用户 custom persona source material"做结构准备
- `WisdomPersona::build_system_prompt` 已经是分层组装（theory + voice + top-3 cards）——overlay 注入无需改架构

---

### 明确不做的（至少 v1 不做）

| 功能 | 原因 |
|------|------|
| 多 Provider UI 选择 | 第一版固定用 **DeepSeek**（稳定、中文强、成本合理） |
| 21 个 Persona | 先 6 个做到位 |
| Framework Mode | Voice Mode 先行；Framework ChatGPT 已能做 |
| Fact-check / Deep Research | 幕僚不需要查 Google，需要刺痛你 |
| 结论优先 / 摘要模式 | 一种体验 |
| 分支会话 / 时间线导航 | 不知道用户需不需要 |
| Wisdom Eval Bank CI | 产品形态未定，跑 CI 是给婴儿量 BMI |
| CORS 加固 / Bearer Token | 本地开发阶段无需 |
| 完整 StepEngine 重构（D.1-D.4） | 阶段 1 修要紧的；完整重构等阶段 2 验证后 |

---

## 第四部分：阶段 1 详细执行清单

以下是阶段 1 的逐任务分解，可直接作为 sprint backlog 使用。

### Task 1.1 — 消除双倍 API 调用

**修改文件**: `crates/counsel-core/src/agents/mod.rs` + `steps/mod.rs`

**做什么**:
```
新增 Agent::run_streaming_collect(messages, opts, sink) -> Result<(String, Option<Usage>)>
- 发起一次 Provider 调用
- 每个 delta 同时 fork 到 SSE sink 和本地 String buffer
- 流结束后返回完整文本 + Usage
- 用这个替换所有 run_streaming + run 的成对调用
```

**影响**: Steps 4, 6, 7 中的所有 persona 调用

**验收**: 一次完整 8 步运行，API 调用数减半，12 个 opinion 文件全部非空

### Task 1.2 — 共享 SSE 行缓冲解析器

**新建文件**: `crates/counsel-model/src/sse.rs`

**做什么**:
```
LineDecoder:
- 维护跨 TCP chunk 的行缓冲
- 输出完整的 `data: ...\n` frame
- 处理 `data: [DONE]`

NdjsonDecoder (Ollama 专用):
- 同样的跨 chunk 缓冲，但按 NDJSON 格式解析

所有 Provider (minimax/deepseek/openai/kimi/dmx/laozhang) 改用 LineDecoder
ollama 改用 NdjsonDecoder
```

**验收**: 集成测试中，split-packet 场景不丢数据

### Task 1.3 — Provider HTTP 状态检查

**修改文件**: 每个 Provider 的 `stream()` 方法

**做什么**:
```
响应状态 ≠ 200 时，返回 ModelError::Http { status, body_preview }
不再进入空的流式解析
```

**验收**: Mock 返回 500 时，上层收到明确错误而非空流

### Task 1.4 — StreamEvent 替代 String

**修改文件**: `crates/counsel-model/src/traits.rs` + 所有 Provider

**做什么**:
```rust
pub enum StreamEvent {
    Delta(String),
    Usage(Usage),
    Done,
}
// StreamingResponse: Stream<Item = ModelResult<StreamEvent>>
```

DeepSeek/MiniMax/OpenAI 从最后一个 chunk 中提取 `usage` 字段并 emit `Usage`

**验收**: metrics.json 中 token 数字来自 Provider 实际返回，不再是 `total/2` 估算

### Task 1.5 — 静默错误全部暴露

**修改文件**: 全项目审计

**Kill list** (来自 Cursor D.4):
- `routes/steps.rs#L101`: `let _ = service.run_debate(...)` → propagate
- `routes/steps.rs#L121`: `let _ = update_session_step(...)` → propagate
- `counsel-core/src/lib.rs#L87`: `serde_json::to_string(self).unwrap_or_else(...)` → return Result
- 所有 Provider 中的 `if let Ok(chunk) = serde_json::from_str(...)` → match + Err
- `files.rs#L21`: `path.parent().unwrap()` → return StorageError

**验收**: `grep "let _ =" crates/` 返回零结果（测试代码除外）

### Task 1.6 — 统一人格系统

**修改文件**: `agents/mod.rs`, `personas.rs`, `routes/steps.rs`

**做什么**:
- 选定一套 12 人名单（先用 TS 版 SKILL.md 的）
- `default_personas()`, `all_personas()`, `get_personas()` 统一指向同一个数据源
- 确保 Step 4 用的 persona 和 Step 8 用的是同一批人

**验收**: 所有步骤使用同一套 persona 列表

### Task 1.7 — 修复中文 byte-slice panic

**修改文件**: `steps/mod.rs` 的 `categorize_position` 等函数

**做什么**:
```rust
// 之前: &upper[..300] — 字节切片，中文会 panic
// 之后: 用 char_indices() 找到安全的字符边界
let safe_end = upper.char_indices()
    .take_while(|(i, _)| *i < 300)
    .last()
    .map(|(i, c)| i + c.len_utf8())
    .unwrap_or(upper.len());
let sample = &upper[..safe_end];
```

**验收**: 中文输入不 panic

### Task 1.8 — 共享 HTTP Client

**新建文件**: `crates/counsel-model/src/http.rs`

**做什么**:
```rust
pub fn build_client() -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(300))
        .pool_max_idle_per_host(5)
        .build()
        .expect("Failed to build HTTP client")
}
```

所有 Provider 构造时使用此 client

**验收**: Provider 调用超时后返回错误而非 hang

### Task 1.9 — 调整 max_tokens

**修改文件**: `steps/mod.rs` 或各步骤文件

**参照表** (来自我们方案 4.9):

| 步骤 | 角色 | max_tokens |
|------|------|------------|
| Step 3 | 12 persona | 200 |
| Step 4 | 12 persona | 1200 |
| Step 6 R1 | 12 persona | 1200 |
| Step 7 | Secretary | 3000 |
| Step 8 评价 | 3-5 persona | 600 |
| Step 8 To-Do | Secretary | 1000 |

**验收**: 输出长度合理，不截断也不过长

---

## 第五部分：检查点和决策门

### 检查点 1（阶段 1 完成后，约 Week 3）

- [ ] 跑一次完整 8 步，所有文件非空？
- [ ] Metrics 数字可信？
- [ ] 无 panic？
- **通过 → 进入阶段 2**

### 检查点 2（阶段 2 完成后，约 Week 6）

PG 的核心问题：
- [ ] **过去 4 周 Michael 用了几次？**
- [ ] 至少一次产生了主动记下的 to-do？
- [ ] 后续追踪发出过提醒？用户有回复？
- **4+ 次 → 进入阶段 3**
- **< 4 次 → 停下来诊断为什么**

### 检查点 3（阶段 3 完成后，约 Week 10）

- [ ] 6 个 persona 的五层知识到位？
- [ ] RAG 匹配返回的情境卡片和用户问题相关？
- [ ] Voice Mode 输出质量 ≥ 现有 SKILL.md？
- **通过 → 进入阶段 4**

### 检查点 4（阶段 4 完成后，约 Week 12）

Jobs 的问题：
- [ ] **给 5 个你尊敬的人展示过了吗？**
- [ ] **他们有没有主动发消息说"我想了一晚上"？**
- **有 → 产品成立。准备扩展。**
- **没有 → 回到飞轮。继续打磨。**

---

*此文档是执行计划，不是愿景文档。所有未列入的功能保留在 Cursor 方案的 Tier 2 backlog 中（109 项完整清单见 `counsel_rust_decent_overhaul_8281b0e3.plan.md` §8），不遗漏，但不现在做。*

*最后更新：2026-04-18*
