# 圆桌群智 Facilitation Architecture Research
## How to Maximize Collective Intelligence from Multi-Persona AI Advisors

**Created:** 2026-04-09  
**Based on:** 私董会, YPO Forum, Liberating Structures, Delphi, Six Hats, Pre-Mortem, Scenario Planning, AgentVerse AI research

---

## 核心架构：7层系统

```
Layer 0: Pre-Session Config    → Persona selection + Hypothesis formation
Layer 1: Problem Definition    → NGT silent generation + 私董会 clarifying questions
Layer 2: Position Staking      → Delphi Round 1 (independent) → Round 2 (updated)
Layer 3: Structured Debate     → Structured Controversy + Pre-Mortem + Scenario stress-test
Layer 4: Groan Zone            → Explicit naming of productive tension
Layer 5: Synthesis             → Two-layer output + Bayesian update
Layer 6: 复盘 Capture          → Crystallize insight, feed flywheel
Layer 7: Defense Mechanisms    → TRIZ unstuck, impasse elevation, false hypothesis flag
```

---

## Layer 0: Pre-Session Configuration

**Hypothesis Translator Agent（新增角色）:**
用户不一定会写假设——他们只会说困惑。Hypothesis Translator Agent的职责：
- 倾听用户陈述的困惑
- 将困惑转化为可验证的假设（"我在测试的是：X是否成立"）
- 或者：识别此次适合广泛哲学探讨模式（不强制hypothesis testing）
- 输出给Facilitator作为session的guiding constraint

**Persona selection（修正：默认全员12人）:**
- 默认召集全部12位幕僚——多元视角是核心价值，不应随意削减
- 仅在以下情况减少人数：话题明显简单 / 案主明确指定只要某几位
- Assign 2-3 as permanent Red Team for this session
- 原则：复杂问题宁多勿少

**Hypothesis formation（用户通过Translator完成）:**
Facilitator持有以下约束贯穿全session：
- 用户的困惑原文
- Translator转化后的假设（若有）
- 用户最大的恐惧/担忧

These become the Facilitator Agent's guiding constraints throughout.

---

## Layer 1: Problem Definition (Diamond 1, Diverge)

**时长: ~15% of session**

**Step A — NGT Silent Generation:** Each persona simultaneously generates (without seeing others):
1. What they think the real problem is (may differ from stated problem)
2. What critical information is missing
3. What assumption in user's framing they most disagree with

**Step B — 私董会 Clarifying Questions:** Personas ask only questions, no positions yet. No advice. Only "帮助我们理解" questions.

**Facilitator Agent synthesizes:** "Here is what you actually seem to be deciding: [reframed problem]." User confirms or corrects.

**Key insight:** Most advisory failures come from solving the wrong problem. This phase exists to prevent that.

---

## Layer 2: Position Staking (Diamond 1, Converge)

**时长: ~15% of session**

**Delphi Round 1:** Each persona states initial position independently (no cross-reading).

**Facilitator Agent maps fault lines:** Not just "agreed vs disagreed" — identifies the underlying *assumptions* that differ between positions. This is the highest-value synthesis in the session.

**Delphi Round 2:** Each persona revises their position given what they now know others think. This produces genuine updating, not parallel monologues.

**White Hat moment (Six Hats):** Before Round 2, one pass where ALL personas state only facts/evidence — no recommendations. Maps the shared factual landscape first.

---

## Layer 3: Conflict Extraction — KEY STEP (Diamond 2, Diverge开始)

**新增：冲突提炼层（在结构化辩论之前）**

Facilitator读取Phase 2所有幕僚的独立观点后：
- 识别3-6个不同维度的冲突（观点真正不调和之处）
- 每个冲突是一个独立的探讨维度，例如：
    - 时间优先级的根本分歧
    - 是否信任外部资源的分歧
    - 短期生存 vs 长期愿景的权衡
- 不是把冲突"分配给小组"——而是每个冲突都由**全体（或大多数）幕僚共同参与**

---

## Layer 4: Structured Debate (Diamond 2, Diverge继续)

**时长: ~35% of session**

### 逐冲突深度探讨（修正后的核心机制）

对每个冲突维度，全体幕僚参与：
- 幕僚在该冲突上**自然分化**为正方/反方/调和者（不事先指派）
- 调和者通过更深层的思考找到balance，而非简单折中
- 每个冲突都充分挖掘，不草草带过
- Red Team全程监控所有冲突中的新兴共识，随时挑战

### Round A — Structured Controversy (反转，嵌入每个冲突)
在某个冲突探讨中，若立场过于一致：
Assign 2-3 personas their OPPOSITE position to surface strongest counterarguments.
Purpose: Forces strongest counterarguments. Surfaces assumptions that normal persona alignment would never expose.

### Round B — Pre-Mortem (预溯)
All personas assume: "It is 12 months later. The user's current preferred option has completely failed."
Each generates the failure story from their philosophical framework:
- Mao: political-competitive failure mode
- Bruce Lee: internal execution failure mode  
- Laozi: resistance-against-nature failure mode

This is **the most reliably high-value step** in any advisory session. Legitimizes dissent. Removes optimism bias.

### Round C — Scenario Stress-Test
Facilitator Agent builds a 2×2 from user's top two uncertainties.
Each persona: "In Scenario A, I recommend X. In Scenario B, I recommend Y."
User sees which recommendations are robust across futures vs. scenario-dependent.

### 案主主动提问选项（新增）
案主可在任意冲突探讨结束后插入新问题，交给全体幕僚处理。
- 这是案主的主动选项，不强制
- 可多轮：案主提问 → 幕僚回应 → 案主追问
- 这使菱形2不只是"解决预设冲突"，也是案主主动探索的空间

**Red Team throughout:** 2-3 designated personas challenge emerging consensus. Tagged in output. They are protected roles — not punished for finding vulnerabilities.

---

## Layer 4: The Groan Zone (Transition)

**时长: ~5-10% of session**

Facilitator Agent explicitly names the state:
> "We have N competing recommendations and M unresolved conflicts. Here is what the debate has NOT resolved."

Then offers ONE structured convergence question:
> "Which remaining conflict is most critical to resolve before taking action?"

This naming of productive tension is itself valuable. Don't rush through it. The depth lives here.

**If stuck (circular repetition):** TRIZ move — Facilitator Agent asks all personas simultaneously: "What must we STOP assuming for this conversation to move forward?"

**If genuine impasse between two personas:** Elevate to meta-level — "These two frameworks are incommensurable on this point. The user must choose which framework applies to their specific context." Make the choice visible rather than falsely resolving it.

---

## Layer 5: Synthesis + Bayesian Update

**时长: ~20% of session**

### Two-Layer Output (user UX)

**Surface (default view):**
- 3-5 action recommendations
- Consensus map: what all personas agreed on
- Key disagreements flagged with the underlying reason
- Bayesian update (see below)

**Deep dive (click in):**
- Each persona's full reasoning + logic
- 1-on-1 private session available with any persona
- Return to group debate with new questions

### Bayesian Update (Explicit)

Facilitator Agent states:
```
Your prior belief:    [X — stated at session start]
Evidence supporting X: [list from debate]
Evidence challenging X: [list from debate]
Suggested posterior:   [revised belief, with confidence level]

Hypothesis [Y] was: CONFIRMED / PARTIALLY CONFIRMED / DISCONFIRMED / INCONCLUSIVE
Key reason: [1-2 sentences]
```

User retains epistemic agency — the system shows HOW to update, not WHAT to believe.

---

## Layer 5.5: Harvest Round — 收获轮（新增，在Synthesis之后、归档之前）

**时长: ~10% of session**

### 心理准备（Psychological Frame）
Facilitator声明，在收获轮开始前：
> "接下来你会听到真实的、锐利的评价。这不是攻击，是因为我们真的花时间思考了你。真正有价值的东西都是sharp的——不要假模假式。请以开放的心接收。"

This framing is Radical Candor in practice: Care personally → Challenge directly.

### Part A — 幕僚自我收获
每位幕僚：
- 我今天的收获是什么？
- 我从其他幕僚那里学到了什么？

### Part B — 幕僚评价案主（⭐ 产品最独特的价值点）
每位幕僚：
- 案主今天的表现如何？
- 我对他有了什么新认知？
- 我在他身上看到了什么？（优点 / 盲点 / 未被看见的东西）

真刀真枪，不要你侬我侬。

**为什么这是最独特的价值：**
案主第一次同时从12个哲学视角被评价——Steve Jobs看他的产品执行力，毛泽东看他的战略判断，老子看他是否在逆势而为，Bruce Lee看他的内心稳定性。没有任何其他产品能做到这一点。

### Part C — 案主自我收获
案主：
- 我今天最重要的收获是什么？
- 我听到了什么让我意外的？

### Part D — Facilitator收尾
- 提炼集体收获
- 确认案主的收获感
- 标注本次session的"最珍贵时刻"

---

## Layer 6: 复盘 Capture (Flywheel Feed) — 跨Session飞轮

**重要修正：飞轮是跨Session的，不是Session内的**

Session内的复盘（Harvest Round）是即时沉淀。
真正的飞轮发生在Session之外：

```
Session结束 → To-Do清单
      ↓
用户在现实中执行To-Do
      ↓
用户回来复盘（预期 vs 实际发生了什么？）
      ↓
一键导入上次Context，已知信息自动跳过
      ↓
新一轮私董会（幕僚提问更精准，效率倍增）
      ↓（无限循环）
```

Facilitator Agent surfaces 1-2 "precious moments" from the debate:
- Specific exchange where genuine synthesis emerged
- Specific conflict that revealed a deeper truth
- The moment the user's hypothesis was most sharply challenged

**Capture format:**
```
Insight crystallized: [specific exchange between two personas]
Why it matters:       [connection to user's stated hypothesis]
Belief updated:       from [X] to [Y]
Next hypothesis:      [Z — what to test in the next session]
```

Stored to longitudinal 复盘 log. This is what becomes the product moat over time.

---

## Layer 7: Defense / Recovery Mechanisms

| Situation | Response |
|-----------|----------|
| Debate goes circular | TRIZ: "What must we stop assuming?" |
| Two personas in true impasse | Elevate: "User must choose which framework applies" |
| User's hypothesis proven false | Flag explicitly: name the prior, name the evidence, propose updated belief. Do NOT soften. |
| Group converging too fast (false consensus) | Red Team injection: designated personas challenge the emerging consensus |
| User input insufficient | Facilitator requests clarifying information before proceeding |

---

## The Flywheel (Full Loop)

```
User brings hypothesis (prior belief)
        ↓
Layer 0: Hypothesis formed + personas selected
        ↓
Layer 1: Problem reframed (often the most valuable step)
        ↓
Layer 2: Diverse positions staked independently
        ↓
Layer 3: Structured debate (controversy, pre-mortem, scenarios)
        ↓
Layer 4: Productive tension named and focused
        ↓
Layer 5: Bayesian update computed
        ↓
Layer 6: 复盘 captured → crystallized insight stored
        ↓
Next session: Updated belief becomes new prior → new hypothesis formed
        ↓ (repeat)
```

**This is not a one-session advisory product.  
It is a belief operating system — the user's thinking gets progressively more accurate over time.**

---

## Key Design Decisions

1. **Facilitator Agent = completely separate from all 12 personas.** Never a content participant. Always a process custodian. (YPO Blue Hat rule + AgentVerse coordinator pattern)

2. **Secretary Agent = dedicated记录/归档/checklist角色.** 独立于Facilitator，负责：记录全部内容、归档Session、维护各幕僚的double-check checklist（他们有没有真正回应锁定的问题）、To-Do导出。

3. **NGT沉默生成必须先于跨角色交互（ROI最高的结构决定）**

   原理：人（包括AI）天生会"锚定"第一个听到的观点（anchoring bias）。如果老子先表达观点，Steve Jobs的回应会变成"在回应老子"，而不是他自己独立的判断。强制所有幕僚**同时、互不可见地生成初始观点**，才能保证12个起点是真正多元的，而不是被第一个发言人污染过的。成本几乎为零，但保证了后续辩论原材料的真实多样性。

4. **Delphi多轮更新把平行独白转化成真正辩论**

   问题：一轮结束后，12个幕僚各说了观点但没有人真正回应别人——只是意见列表，不是辩论。
   
   Delphi机制：Round 1独立生成 → Facilitator汇总所有人的**推理过程**（不只是结论）→ Round 2每个幕僚看到他人完整论证后更新立场。
   
   关键在"推理过程"：只看结论（"毛泽东说先活下来"）可以轻易无视；看到完整论证（"当前现金流X、竞争对手Y正在追赶、历史案例Z表明..."）就必须真正和这个逻辑过招——要么接受，要么找出漏洞。这才是真正的智识交锋。

5. **Pre-Mortem不可跳过（最可靠的反直觉洞察触发器）**

   机制：不问"这个决定有什么风险"，而是**假设决定已经失败了12个月，现在回头找原因**。
   
   为什么更有效：正向风险评估有两个致命问题——（1）乐观偏差：人天生低估未来风险，这是进化硬编码的；（2）社交压力：指出"这会失败"在讨论别人计划时是社交进攻行为，大家潜意识回避。Pre-Mortem同时解决这两个问题：失败已是既成事实，不需要估计概率，也没有社交成本。
   
   数据支撑：Gary Klein的研究显示，Pre-Mortem找出的风险因素比正向评估多约30%的准确风险——而这多出来的部分，恰恰是最反直觉、最容易被忽略、也往往最致命的那些。MVP阶段也不能跳过。

6. **默认12人全员，不轻易削减.** 多元视角是核心价值主张。仅在话题简单或案主明确指定时减少。（修正：旧版"6-8 optimal"是错误的默认值）

7. **冲突提炼 = 最高价值的Facilitator动作.** 不是分配冲突给小组——而是识别3-6个冲突维度，每个维度全体幕僚参与，内部自然分化正/反/调和。

8. **Harvest Round Part B（幕僚评价案主）= 产品最独特的价值点.** 案主从12个哲学视角同时被评价，任何其他产品都无法复制。

9. **飞轮是跨Session的，不是Session内的.** 价值在于：执行 → 回来复盘 → Context累积 → 下一轮更深。Session内的收获轮是即时沉淀，飞轮是长期护城河。

10. **复盘 log = the moat.** Longitudinal belief-update history that no session-based competitor can replicate.

---

## What This Means for Product Architecture

```
Components needed:

1. Hypothesis Translator Agent  → 困惑 → 假设，入口降低门槛
2. Facilitator Agent            → process manager only, never content
3. Secretary Agent              → 记录、归档、checklist、double-check、To-Do导出
4. Persona Agents × 12         → content contributors, diverse frameworks（默认全员）
5. Red Team Agents × 2-3       → 全程挑战共识，轮换担任
6. Conflict Extractor           → Facilitator的核心动作：识别3-6冲突维度
7. Hypothesis Tracker           → prior → evidence → posterior across sessions
8. 复盘 Log（跨Session）        → longitudinal belief update storage = moat
9. Two-Layer Output Engine      → surface synthesis + deep-dive per persona
10. Harvest Round Engine        → Part A/B/C/D的结构化收尾
11. Scenario Builder            → for Tier 1 strategic debates
12. Pre-Mortem Trigger          → automatic, not optional
```

## 两文档分工（如何配合使用）

| 文档 | 定位 | 用于 |
|------|------|------|
| **roundtable-facilitation-architecture.md**（本文档） | "为什么"层 | 理论来源、研究依据、每个设计决定的原理、技术组件清单 |
| **roundtable-flow-diagram.md** | "做什么"层 | 具体交互步骤、操作流程、产品规格、UX蓝图 |

**做产品时**：Flow Diagram是开发者/设计师的执行蓝图；Architecture是PM和技术负责人理解"为什么这样设计"的参考文件。两个都要，缺一不可。

---

## Sources（已核实，含可点击链接）

### AI多智能体研究

- **LLM多智能体辩论论文（Du et al., 2023）**
  Du, Y., Li, S., Torralba, A., Tenenbaum, J.B., & Mordatch, I. "Improving Factuality and Reasoning in Language Models through Multiagent Debate."
  → https://arxiv.org/abs/2305.14325
  多个LLM实例跨轮次辩论以减少幻觉、提升推理质量；核心发现：价值来自初始观点多样性。

- **AgentVerse多智能体框架（ICLR 2024）**
  Chen, W. et al. "AgentVerse: Facilitating Multi-Agent Collaboration and Exploring Emergent Behaviors."
  → https://arxiv.org/abs/2308.10848
  → https://proceedings.iclr.cc/paper_files/paper/2024/hash/578e65cdee35d00c708d4c64bce32971-Abstract-Conference.html
  动态调整团队构成的多智能体框架；Facilitator与参与者角色分离的学术依据。

### 群体决策与促导框架

- **NGT名义群体法（Nominal Group Technique）**
  AHRQ（美国医疗研究与质量局）官方说明
  → https://digital.ahrq.gov/health-it-tools-and-resources/evaluation-resources/workflow-assessment-health-it-toolkit/all-workflow-tools/nominal-group-technique
  学术综合来源（NGT + Delphi对比）：
  → https://pmc.ncbi.nlm.nih.gov/articles/PMC4909789/
  沉默独立生成先于群体交流的结构化方法；防止锚定效应的核心机制。

- **Delphi方法（RAND Corporation原始文献）**
  Dalkey, N. & Helmer, O. "An Experimental Application of the Delphi Method to the Use of Experts." RAND, 1962.
  → https://www.rand.org/pubs/research_memoranda/RM727z1.html
  → https://www.rand.org/topics/delphi-method.html
  多轮匿名专家意见汇聚法；多轮更新机制使平行独白转化为真正辩论的学术基础。

- **Liberating Structures — Troika Consulting**
  → https://www.liberatingstructures.com/8-troika-consulting/
  "客户"背对小组倾听顾问讨论的三人咨询结构；私董会"转椅机制"的西方平行发现。

- **World Café方法**
  → https://theworldcafe.com/key-concepts-resources/world-cafe-method/
  跨桌轮转对话，思想在多轮中交叉传播；跨轮次Context传递机制的设计依据。

- **六顶帽思维（Six Thinking Hats）— de Bono**
  → https://www.debonogroup.com/services/core-programs/six-thinking-hats/
  Blue Hat（促导帽）= Facilitator永不参与内容的角色定义来源。

- **结构化争议（Structured Controversy）— Johnson & Johnson**
  Johnson, D.W. & Johnson, R.T. (1979). "Conflict in the Classroom: Controversy and Learning." *Review of Educational Research*, 49(1), 51-70.
  DOI: https://doi.org/10.3102/00346543049001051
  实践说明：→ https://thediscussionproject.org/blog/what-is-the-structured-academic-controversy/
  强制论证对立立场的协作学习技术；冲突探讨中"正反方+调和者"机制的理论基础。

- **YPO Forum模式**
  → https://www.ypo.org/profile/ypo-forum/
  约8位CEO的保密同伴群体，严格的非建议协议；Blue Hat角色与Facilitator独立性的人类组织原型。

### 决策理论

- **Pre-Mortem（预溯分析）— Gary Klein**
  Klein, G. (2007). "Performing a Project Premortem." *Harvard Business Review*, September 2007.
  → https://hbr.org/2007/09/performing-a-project-premortem
  假设决定已经失败再倒推原因；消除乐观偏差与社交压力的核心机制，识别风险比正向评估多约30%。

- **情景规划 — Shell方法（Pierre Wack）**
  Wack, P. (1985). "Scenarios: Uncharted Waters Ahead." *Harvard Business Review*, September 1985.
  → https://hbr.org/1985/09/scenarios-uncharted-waters-ahead
  配套文章：→ https://hbr.org/1985/11/scenarios-shooting-the-rapids
  2×2情景矩阵压力测试决策；找到在多个未来中都稳健的策略。
