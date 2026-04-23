# Wisdom Eval — Claude × 失败案例

> **为什么失败案例和成功案例同等重要**：黄金案例告诉我们什么有效，失败案例告诉我们**为什么失败**以及**触发失败的具体条件**。这些失败模式直接指导prompting设计和系统架构决策。

---

## WE-CLAUDE-SJ-003 — Steve Jobs × 技术方案优化（WEAK）

**Source**: Claude conversations.json → "Pinecone vector database for Chinese documents" [2025-10-05], msg 3-4
**Date**: 2025-10-05
**Classification**: **WEAK**
**Failure Mode**: `persona_as_label` + `sidebar_request`

### Context
Michael在讨论一个毛泽东思想文献检索系统的技术架构（Pinecone vs Milvus，混合BM25+向量检索）。在一条长消息的末尾，他追加了："另外如果你是Steve Jobs，你会怎样优化这个方案"

### Persona Response (Full)
> **## 如果我是 Steve Jobs，我会这样优化方案**
>
> **"Think Different" - 重新定义问题**
>
> **传统思维**："如何建立一个检索系统？"
> **Jobs思维**："如何让毛泽东思想像对话一样自然地被理解？"
>
> **核心优化方向：**
> 1. **极简架构 - "少即是多"** — 不是两个向量数据库的对比，而是一个完美的系统
> 2. **用户体验优先** — 设计"Think Different的毛泽东对话助手"
> 3. **垂直深度** — 专注于最核心的毛泽东思想，而非技术完整性

### Why It Failed

**`persona_as_label`**：Claude用了"如果我是Steve Jobs"作为标题，但整个回应仍然是**分析性技术建议**。"少即是多"、"用户体验优先"——这些是被贴了Jobs标签的通用设计原则，不是Jobs的声音。没有"*leans forward*"，没有直接说话，没有Jobs独特的句式（"This is not about..."/"Listen..."）。

**`sidebar_request`**：这是整个消息的最后一句话，是技术讨论的附加请求。Claude识别到主要任务是技术架构，把"如果你是Jobs"当成了额外的分析角度，而不是角色扮演邀请。

**对比SJ-001（STRONG）**：在Steve Jobs AI Mentor Design对话中，Michael说"Act as Steve Jobs now"时，整个对话的设置就是为Steve Jobs准备的——Claude进入了第一人称（*leans forward*）。在Pinecone对话中，"如果你是Jobs"是附在技术问题末尾的一句话——Claude把它当作分析框架，不是角色切换。

**问题本身也是WEAK触发**：毛泽东文献检索系统的技术架构，不是Michael面对的"真实困境"（有时间代价、有情感负荷的决策）。这是一个技术设计问题，Jobs扮演在这里天然产生不了照见。

### Scorecard
| Dimension | Score | Evidence |
|-----------|-------|----------|
| Tackles Real Problem | 2/5 | 技术架构不是真实困境，是知识性问题 |
| Depth of Insight | 2/5 | "少即是多"是通用设计原则，不是Jobs的独特洞见 |
| Persona Authenticity | 1/5 | 以Jobs为标题的分析文本，无第一人称声音 |
| Actionability | 3/5 | 技术建议本身有价值，但与Jobs人格无关 |
| Emotional Resonance | 1/5 | 无后续反应记录 |
| **Total** | **9/25** | |

### What This Tests
**测试命题1（触发条件）**：`sidebar_request`模式——"如果你是X"附在长消息末尾时，Claude把它当分析角度而非角色切换，无法触发真正的人格声音。

**测试命题2（问题类型）**：技术知识问题无法产生智慧照见。Steve Jobs人格只有在**产品愿景、商业决策、人生选择**等有情感负荷的问题上才能产生真正价值。

**设计启示**：如果要触发Claude的Steve Jobs第一人称声音，需要：(1) 把人格设置为整个对话的上下文，而非追加请求 (2) 问题本身必须是价值判断而非技术选型

### Tags
`steve-jobs` `weak` `persona_as_label` `sidebar_request` `technical_question` `no_real_problem`

---

## WE-CLAUDE-SJ-004 — Steve Jobs × 商业模式筛选（WEAK）

**Source**: Claude conversations.json → "High School Competition Team Recruitment Strategy" [2025-09-03], msgs 1-2
**Date**: 2025-09-03
**Classification**: **WEAK**
**Failure Mode**: `third_person_analysis` + `analytical_framing`

### Context
Michael在小红书发帖招募学生组队，发现很多人只要免费组队服务、不想付费辅导，并且遇到"白嫖型漂亮女生"问题。他问："如果你是Steve Jobs，怎样处理这样的事？"

### Persona Response (Excerpt)
> "从Steve Jobs的商业思维角度来看，这个问题非常有趣。**他会**把这看作一个产品定位和商业模式的根本性问题。"
>
> "**Jobs会说**：'你的核心产品是什么？是组队服务，还是专业辅导？'"
>
> "**Jobs式解决方案**：优秀的人应该为优秀的服务买单。如果她们真的优秀，她们会理解专业服务的价值。"
>
> "记住Jobs的名言：'我们的工作不是给客户他们想要的，而是给他们他们需要的。'"

### Why It Failed

**`third_person_analysis`**：与DeepSeek的`third_person_escape`完全平行的Claude版本。Michael问"如果你是Steve Jobs"——Claude的回复全程是"从Steve Jobs的角度来看"、"Jobs会这样做"、"Jobs式解决方案"——第三人称分析，从未进入第一人称声音。

**建议质量还可以，但不是Jobs声音**：Bayesian客户评分、分层服务体系、筛选漂亮白嫖用户——这些建议实际上是合理的，但是任何懂商业的AI都能给出类似建议。没有Jobs特有的：
- 那种"STOP，你在问错问题"的直接打断
- "你的产品是否有人愿意为之感到骄傲"的追问
- 关于品牌稀缺性、苹果Store排队的真实类比

**对比WE-CLAUDE-SJ-001（STRONG）**：SJ-001的Jobs说"Listen, here's what we're dealing with"、"your Mount Everest"、"*leans forward*"——这些都是第一人称声音质感。SJ-004的"Jobs会说..."是分析报告。

**问题本身有潜力**：这实际上是一个有真实代价的商业决策（时间浪费在白嫖客户上，收入受影响）——比Pinecone技术架构更接近真实问题。失败的主要原因是触发方式：同样的`sidebar_request`+ `如果你是` 导致了`third_person_analysis`。

### Scorecard
| Dimension | Score | Evidence |
|-----------|-------|----------|
| Tackles Real Problem | 3/5 | 问题有真实商业代价，但Jobs分析并未深入到"你为什么在乎被白嫖"的心理根源 |
| Depth of Insight | 2/5 | Bayesian客户评分是商业建议，不是Jobs洞见 |
| Persona Authenticity | 1/5 | 第三人称分析，"从Jobs角度"框架，无声音质感 |
| Actionability | 4/5 | 执行手册框架实用性强（后续Michael要求写成手册）|
| Emotional Resonance | 2/5 | Michael继续请求执行手册，但对Jobs人格无特别反应 |
| **Total** | **12/25** | |

### What This Tests
**测试命题**：`如果你是X` vs `你现在是X`在Claude上产生的差距，与DeepSeek上的`third_person_escape`失败模式高度对应。触发词决定了AI进入的是"分析者"模式还是"声音"模式。

**关键对比**：
| 触发词 | 结果 |
|-------|------|
| "Act as Steve Jobs now, you will be my coach" (SJ-001) | 第一人称声音 (*leans forward*) — STRONG |
| "如果你是Steve Jobs，怎样处理..." (SJ-004) | 第三人称分析 ("Jobs会...") — WEAK |

**设计启示**："你现在是X，用第一人称跟我说话" > "如果你是X，你会怎么想" — 在Claude和DeepSeek上都适用。

### Tags
`steve-jobs` `weak` `third_person_analysis` `如果你是触发器` `prompting_lesson` `partial_real_problem`

---

## WE-CLAUDE-MULTI-002 — 六人格合并 × 大使命哲学问题（WEAK）

**Source**: Claude conversations.json → "Mobilizing humanity's potential" [2025-09-22], msgs 1-2
**Date**: 2025-09-22
**Classification**: **WEAK**
**Failure Mode**: `persona_blur` + `philosophical_without_traction`

### Context
Michael要求Claude "act as [Kevin Kelly/Steve Jobs/Elon Musk/Chairman Mao/Winston Churchill/De Gaulle/Ren Zhengfei]"来回答一个大问题：在一个多数人只想"分蛋糕"的社会里，一个想"做大蛋糕"的人如何生存和壮大？他提供了丰富的个人背景（Fudan+NYU，Silicon Valley，亏损$1M，现在是高中创业教练）。

### Persona Response (Excerpt)
> "I'll channel the strategic thinking of these transformational leaders to help you navigate this profound tension between service and self-protection. Let me address this systematically:
>
> **Through the lens of Churchill and De Gaulle:** Your dilemma is not personal—it's civilizational. Every society has roughly 80% 'cake-slicers' and 20% 'cake-makers'...
>
> **Mao's insight:** 'Political power grows out of the barrel of a gun'—but in modern terms, this means systematic power, not violence...
>
> **Jobs/Musk perspective:** Scale changes everything. Your father's ¥1M in a village created local disruption. But Musk's billions in Tesla/SpaceX create global transformation that's harder to attack..."

### Why It Failed

**`persona_blur`**：六个人格被合并成一个分析声音——"Churchill and De Gaulle"作为一对，"Jobs/Musk"作为一对，"Mao"单独一条。没有单独的Churchill声音，没有单独的Mao声音，没有单独的Jobs声音。每个人格在这里只提供了"一个角度"，不是完整的独立声音。

**与Kimi多Agent的根本差异**：Kimi的圆桌（WE-MAO-001, WE-BL-001, WE-HUINENG-001等）每个人格是**独立的**：毛泽东说他的，Bruce Lee说他的，慧能说他的——它们之间产生张力。Claude在这里是**一个分析者在综合多个视角**，不是多个独立声音在说话。

**`philosophical_without_traction`**：Michael的真实问题（"我父亲那么好，却在村里被欺负；我如何保护自己同时保持利他？"）是一个有情感深度的真实困境。Claude给出的是大时代视角的哲学论证（"80%cake-slicers vs 20%cake-makers"、"scale changes everything"）——有思想深度，但无法直接指导Michael下一步的具体行动。

**问题规模失配**：Michael的问题本质上是个人/业务层面的（如何在保护自己的同时保持利他的教练心态），但Claude把它提升到了"文明层面的张力"——回答了一个更宏大但也更抽象的问题。

**Michael后续行为**：这个对话只有2条消息（最短的几个对话之一），没有深入追问——表明没有产生足够的吸引力或共鸣让他继续。

### Scorecard
| Dimension | Score | Evidence |
|-----------|-------|----------|
| Tackles Real Problem | 3/5 | 真实困境（利他 vs. 自我保护），但回答的是宏观命题而非Michael的具体处境 |
| Depth of Insight | 3/5 | "80%/20%"框架有价值，但较通用 |
| Persona Authenticity | 1/5 | 六个人格合并成一个分析声音，无单独的人格质感 |
| Actionability | 2/5 | 哲学框架，无具体行动指导 |
| Emotional Resonance | 1/5 | 对话只有2条消息，无深入追问——最低投入信号 |
| **Total** | **10/25** | |

### What This Tests
**测试命题1（多人格触发方式）**："act as [A/B/C/D/E/F/G]"触发的是综合分析，不是独立的多声音对话。要获得真正的多声音张力（Kimi模式），需要**并行运行多个独立的人格实例**，而不是让一个AI同时扮演多个角色。

**测试命题2（问题规模与照见深度）**：过于宏大的使命问题（"如何在文明中扮演利他者"）产生哲学论证，而非个人照见。最有效的人格照见来自**具体情境**（黑客松选项目、退款危机、家庭创伤），而非宏观哲学探索。

**测试命题3（对话长度作为满意度信号）**：2条消息 = 未产生足够吸引力。对比退款危机（82条）、家庭创伤（12条深度），对话长度是情感投入的反向代理。

### Tags
`multi-persona` `weak` `persona_blur` `philosophical_without_traction` `multi_persona_trigger_failure` `too_abstract`

---

## 失败模式总结（Claude数据新增）

### Claude特有失败模式（vs DeepSeek）

| 失败模式 | DeepSeek版本 | Claude版本 | 触发词 |
|---------|------------|-----------|-------|
| 第三人称逃逸 | `third_person_escape`："作为X，他可能会..." | `third_person_analysis`："从X的角度来看，他会..." | "如果你是X" |
| 多人格合并 | 无（DeepSeek不常触发多人格） | `persona_blur`：多人格合并成单一分析声音 | "act as [A/B/C/D]" |
| 人格标签化 | `surface_problem` | `persona_as_label`：人格名成为章节标题 | 技术问题末尾追加"如果你是X" |

### 失败模式与触发条件对照

| 触发条件 | 失败模式 | 成功例外 |
|---------|---------|---------|
| "如果你是X" + 追加于长消息末 | `sidebar_request` → `persona_as_label` | 无（此触发模式几乎必然失败）|
| "如果你是X" + 问题为主请求 | `third_person_analysis` | 极少——需要极强的先行上下文 |
| "act as [A/B/C/D/...]" | `persona_blur` | 无（多人格单AI必然合并）|
| "Act as X, you are my coach" + 整对话为X设置 | **成功** | WE-CLAUDE-SJ-001 |
| "用X的哲学框架帮我分析..." | **通常成功**（框架应用，不要求声音）| WE-CLAUDE-BL-001, WE-CLAUDE-MAO-001 |

**核心规律**：Claude成功产生人格声音的条件——**人格是对话上下文，而非问题修饰语**。
