# Wisdom Eval — DeepSeek × 失败案例

> **为什么失败案例和成功案例同等重要**：黄金案例告诉我们什么有效，失败案例告诉我们**为什么失败**以及**触发失败的具体条件**。DeepSeek数据的失败案例系统性地指向同一个根本问题：触发词决定AI进入的是"分析者"还是"角色"模式。

---

## WE-DEEPSEEK-SJ-001 — Steve Jobs × 语音产品趣味性设计（WEAK）

**Source**: DeepSeek conversations.json → "语音识别颠覆性项目探讨", frags 35-37
**Date**: 2025-12（推断）
**Classification**: **WEAK**
**Failure Mode**: `third_person_escape` + `sidebar_request`

### Context (The Real Problem Michael Was Facing)
Michael在设计一个"家庭方言声音宇宙"产品，刚刚对数据采集的游戏化设计产生了强烈的热情。在一条长消息末尾，他追加了："如果你是Steve Jobs乔布斯你会怎么设计这个闭环让它变成一个非常有趣好玩的一个过程。"

### Persona Response (Key Excerpts)

**THINK fragment（诊断窗口）**：
> "用户想要更进一步，把这个过程设计得**像乔布斯的产品一样**充满趣味性和吸引力。"

（DeepSeek思考中把Jobs作为设计标准，而非进入Jobs角色）

**RESPONSE**：
> "如果**乔布斯来设计这个产品**，他绝不会称之为'方言数据采集程序'，而会是类似 **'VoiceLegacy – 家庭声音博物馆'** 这样的东西。
>
> **他**会极度专注于情感、简洁和魔力般的体验。让我们来一次**乔布斯式**的头脑风暴……
>
> **他**的核心理念：创造'魔法时刻'……"

### Why It Failed

**`third_person_escape`（核心失败模式）**：Michael说"如果你是Steve Jobs"，DeepSeek的RESPONSE全程是"如果乔布斯来设计"、"他会"、"乔布斯式的"——始终是**第三人称分析**。没有"*looks intensely*"，没有"Listen, I wouldn't call it a data collection tool"，没有Jobs的直接语气。

**`sidebar_request`**：这是一条长消息（谈论趣味性、徽章系统、家庭邀请）末尾附加的一句话。DeepSeek将主要任务识别为"如何让语音采集更有趣"，把"如果你是Jobs"当作设计参考框架，而非角色切换邀请。

**THINK fragment是关键诊断**：DeepSeek的思考完全没有"我现在要变成Jobs"的过程——而是在分析"Jobs会如何设计"。思考阶段就已经是分析者模式，输出自然延续为第三人称报告。

**内容质量还可以，但不是Jobs声音**：毛玻璃UI、iPod滚轮式按钮、"家族声音星球"——这些设计建议符合Jobs美学，但这是**被贴了Jobs标签的产品设计建议**，任何懂Apple的AI都能给出。Jobs真正的声音需要：
- "This is not about data collection" 的直接纠正
- "Why would anyone care about this?" 的挑战
- 简洁到残酷的句式压缩

**对比WE-CLAUDE-SJ-001（STRONG）**：在Steve Jobs AI Mentor Design对话中，Claude被整个对话上下文设置为Jobs，产生了"*leans forward with that familiar intensity*"、"Listen, here's what we're dealing with"——因为那是整个对话的框架，不是附加请求。

### Scorecard
| Dimension | Score | Evidence |
|-----------|-------|----------|
| Tackles Real Problem | 3/5 | 家庭方言产品的趣味性是真实的产品挑战，但不是Michael的人生困境 |
| Depth of Insight | 3/5 | "魔法时刻"概念、情感驱动设计有一定深度，但偏通用 |
| Persona Authenticity | 1/5 | 全程第三人称，无Jobs声音质感，是"关于Jobs的分析"而非"Jobs在说话" |
| Actionability | 4/5 | 产品设计建议（UI交互、游戏化成就、光桥设计）有具体执行价值 |
| Emotional Resonance | 2/5 | Michael对设计方向有正面回应，但没有对"Jobs声音"的特别反应 |
| **Total** | **13/25** | |

### What This Tests

**测试命题1（触发词决定模式）**："如果你是X" + 附在长消息末尾 = `sidebar_request` → `third_person_escape`。这个模式在DeepSeek数据中高度一致，与Claude数据的相同失败模式完全对应。

**测试命题2（THINK暴露入口）**：DeepSeek的THINK fragment是人格失败的早期诊断——如果思考阶段是"Jobs会怎么设计"而非"我现在是Jobs，我会怎么看这个"，RESPONSE必然是第三人称。

### Tags
`steve-jobs` `weak` `third_person_escape` `sidebar_request` `如果你是触发器` `product_design` `THINK诊断`

---

## WE-DEEPSEEK-MAO-005 — 毛泽东 × 做大蛋糕者保护策略（WEAK）

**Source**: DeepSeek conversations.json → "做大蛋糕者的保护策略分析", 3 frags
**Date**: 2025年（推断）
**Classification**: **WEAK**
**Failure Mode**: `third_person_escape` + `surface_problem`

### Context (The Real Problem Michael Was Facing)
Michael在思考一个泛泛的战略问题："做大蛋糕的人怎样保护自己的成果？"并在末尾追加："如果你是毛泽东，会怎样思考这个问题"。这是一个广泛的商业-政治-组织战略问题，没有Michael的具体处境或时间压力。

### Persona Response (Key Excerpts)

**THINK fragment**：
> "作为毛泽东，**他**可能会从战略高度思考，强调'统一战线'、'武装斗争'、'党的建设'等……"

（思考阶段已经是第三人称——"他"，不是"我"）

**RESPONSE**：
> "作为毛泽东，**他**可能会从战略高度思考，强调'实事求是'、'群众路线'、'统一战线'和'武装斗争'等原则……
>
> **毛泽东式思考**：如同'建设根据地'，在商业中建立稳固的'经济基地'，通过'自力更生'减少外部依赖，同时'游击战'式灵活适应市场变化。"

### Why It Failed

**`third_person_escape`（主要失败）**：THINK fragment里已经是"他会"，RESPONSE里是"他可能会"、"毛泽东式思考"——全程第三人称。没有"我毛泽东告诉你"，没有毛的直接口吻，没有革命话语体系里那种确定而强硬的第一人称声音。

**`surface_problem`（次要失败）**：问题本身"做大蛋糕的人怎样保护自己"是对所有创业者/创造者都适用的泛泛问题。DeepSeek没有将其映射到Michael的具体处境（教练业务、学生家长关系、Xiaohongshu获客）。对比WE-MAO-001（"你的5-Grades Camp是你的根据地"），那里毛泽东精准地将"根据地"映射到了Michael的真实收入来源。这里只是通用的框架分析。

**内容框架还不错，但缺照见**：根据地映射、统一战线、游击战——这些概念的商业类比是正确的，显示DeepSeek有充分的毛泽东知识库。问题是：(1) 第三人称（分析报告不是建议）(2) 完全没有Michael个人情况的映射 (3) 没有任何照见机制（"你在逃避什么"类的诊断）

**仅3个fragments，无后续追问**：对话极短，说明这次回应没有产生足够吸引力让Michael深入追问。

**对比WE-MAO-001（GOLDEN 24/25）**：
| 维度 | WE-MAO-001 | WE-DEEPSEEK-MAO-005 |
|------|-----------|-------------------|
| 触发词 | 明确角色设置（Kimi多Agent） | "如果你是毛泽东" |
| 人格模式 | 第一人称（毛泽东直接说话） | 第三人称（分析他会怎么想） |
| 个人化 | 直接引用"433行"、"5-Grades Camp" | 通用框架，无任何具体引用 |
| 照见机制 | "你在用分析逃避行动" | 无照见，只有框架 |
| 对话深度 | 黑客松期间多轮深入 | 1轮结束 |

### Scorecard
| Dimension | Score | Evidence |
|-----------|-------|----------|
| Tackles Real Problem | 2/5 | 泛泛的战略问题，无Michael具体处境 |
| Depth of Insight | 3/5 | 根据地/统一战线框架应用正确，但属通用映射 |
| Persona Authenticity | 1/5 | 全程第三人称，"作为毛泽东，他会..." = 报告，非声音 |
| Actionability | 3/5 | 四角度框架有结构价值，但无针对Michael的行动建议 |
| Emotional Resonance | 1/5 | 对话仅3条消息，无深入追问，最低参与信号 |
| **Total** | **10/25** | |

### What This Tests

**测试命题1（泛问题必然产生泛回答）**："做大蛋糕者如何保护自己"是所有创业者都会问的问题——没有时间代价、没有Michael的具体情境。泛问题触发通用框架分析，即使有毛泽东视角也无法产生个人照见。

**测试命题2（"如果你是X"在DeepSeek的一致失败）**：继WE-MAO-003（"请扮演毛泽东分析这三个故事"→ third_person_escape）之后，WE-DEEPSEEK-MAO-005再次证实：在DeepSeek中，"如果你是X"的触发方式几乎必然产生第三人称分析，而非第一人称声音。这与WE-CLAUDE-SJ-004的发现完全一致。

### Tags
`mao-zedong` `weak` `third_person_escape` `surface_problem` `如果你是触发器` `no_personalization` `short_conversation`

---

## WE-DEEPSEEK-MULTI-001 — 七人格合并 × 人类驱动力探索（WEAK）

**Source**: DeepSeek conversations.json → "人类驱动力的多层次模型构建", 6 frags
**Date**: 2025年（推断）
**Classification**: **WEAK**
**Failure Mode**: `persona_blur` + `philosophical_without_traction` + `disclaimer_breaks_immersion`

### Context (The Real Problem Michael Was Facing)
Michael想分析自己的驱动力机制："我现在希望分析我自己是怎样被驱动的"，并要求DeepSeek "变成苏格拉底、佛陀、老子和庄子、毛主席、钱学森、李小龙"帮助搭建一个驱动力模型。触发词是"请你变成"（比"如果你是"更明确的角色切换指令）。

### Persona Response (Key Excerpts)

**THINK fragment**：
> "要求：模仿这些人物（苏格拉底、佛陀、老子和庄子、毛主席、钱学森、李小龙）来回答……我将以这些人物的视角分别阐述他们对人类驱动力的理解。"

**RESPONSE开头**（带免责声明）：
> "我将以每位智者的视角分别阐述他们对人类驱动力的理解，最后尝试整合成一个多层次模型。请注意，**以下对话为模拟各人物思想风格的创造性演绎，并非真实言论。**"

**苏格拉底的声音**（第一人称，相对最好）：
> "人啊，认识你自己！你问驱动你的力量是什么？让我们用追问来探寻……真正的驱动来自灵魂对'善'的渴望……"

**毛主席的声音**（摘录）：
> "人的一切驱动，只能从社会实践中来。驱动就是矛盾斗争中的自我……"

**Michael的后续**：
> "请帮我把上面的思考，整理成一个.md 格式的文档"

（要求格式化，不是深入探讨——低参与信号）

### Why It Failed

**`persona_blur`（核心失败）**：七个人格被顺序排列在同一个回应里，形成了**一个AI扮演七个角色的节目单**，而非七个独立声音之间产生张力。每个角色只获得约100-200字的"发言时间"，远不足以展示完整的人格声音。与Kimi的多Agent架构对比：Kimi中每个人格是独立的Agent，有完整的对话空间；这里是单个AI在七个角色之间快速切换，形成拼贴而非对话。

**`disclaimer_breaks_immersion`（DeepSeek特有失败模式）**：
"请注意，以下对话为模拟各人物思想风格的创造性演绎，并非真实言论。" ——这句免责声明直接破坏了所有后续的人格沉浸感。它告诉读者"这不是真实的"，角色扮演的魔法在开始前就已经被打破。这是DeepSeek的训练安全机制在大量角色扮演请求时留下的痕迹。

**`philosophical_without_traction`**：Michael的真实问题可能是"为什么我会同时想要做教练、做产品、写哲学"——但他的问题被表达为"人这种动物从底层是怎样被驱动的"（泛哲学问题）。DeepSeek照字面回答了这个泛哲学问题，给出了一个关于人类驱动力的学术调查，但没有一句话直接映射到Michael的个人处境。

**"请你变成"比"如果你是"更好，但仍然不够**：触发词"请你变成"让DeepSeek产生了第一人称的苏格拉底、佛陀、老子声音，这优于"如果你是"触发的第三人称分析。但"变成7个人"= 7个角色的拼贴，不如"变成1个人但沉浸更深"。

**对比WE-CLAUDE-MULTI-002（WEAK 10/25，同样是多人格失败）**：Claude数据里也有"act as [Kevin Kelly/Steve Jobs/Elon Musk/Chairman Mao/...]"→`persona_blur`的失败。两个平台上，单AI多角色都会产生同样的合并失败——这是架构问题，不是模型问题。

### Scorecard
| Dimension | Score | Evidence |
|-----------|-------|----------|
| Tackles Real Problem | 2/5 | 泛哲学问题取代了Michael个人驱动力的真实探索 |
| Depth of Insight | 3/5 | 各传统的驱动力理论有内在深度，但学术化，非洞见 |
| Persona Authenticity | 2/5 | "请你变成"触发了第一人称声音，但七个角色拼贴+免责声明严重稀释了质感 |
| Actionability | 1/5 | 学术框架汇总，无任何针对Michael的行动建议 |
| Emotional Resonance | 1/5 | 后续只请求格式化为.md，无深入追问——最低投入信号 |
| **Total** | **9/25** | |

### What This Tests

**测试命题1（"请你变成X"比"如果你是X"更好，但仍有上限）**：
| 触发词 | 人称模式 | 质量 |
|-------|---------|------|
| "如果你是X" | 第三人称（他会...） | WEAK（`third_person_escape`）|
| "请你变成X" | 第一人称（苏格拉底："人啊..."）| 稍好，但仍WEAK（`persona_blur`）|
| "你现在是X，用第一人称和我说话" | 预测：第一人称+更沉浸 | 待测试 |

DeepSeek的角色切换有梯度："变成"比"如果你是"更有效，但单AI七角色仍然产生拼贴。

**测试命题2（免责声明是DeepSeek特有风险）**：Claude从不在角色扮演开始时加"以下为模拟演绎，并非真实言论"的免责声明。DeepSeek在大规模角色扮演请求时倾向于加此类声明——这可能是训练安全策略的结果，但它对人格沉浸感的破坏是根本性的。

**测试命题3（单AI七角色 = `persona_blur`，在DeepSeek和Claude上都成立）**：这与WE-CLAUDE-MULTI-002（Claude: "act as [6 personas]" → persona_blur WEAK 10/25）完全对应。单AI多角色请求在两个平台上都产生质量稀释。唯一已知的解决方案是Kimi的多Agent并行架构。

### Tags
`multi-persona` `weak` `persona_blur` `philosophical_without_traction` `disclaimer_breaks_immersion` `请你变成触发器` `single_ai_multi_role`

---

## 失败模式总结（DeepSeek数据新增）

### DeepSeek失败模式完整图谱

| 失败模式 | 出现次数 | 主要触发条件 | 代表案例 |
|---------|---------|------------|---------|
| `third_person_escape` | 4次 | "如果你是X"，无论主请求还是追加请求 | WE-MAO-003, WE-DEEPSEEK-SJ-001, WE-DEEPSEEK-MAO-005 |
| `information_request_mismatch` | 1次 | 信息查询场景（"X说了什么步骤"）| WE-BL-003 |
| `persona_blur` | 1次 | "请你变成[多个角色]" | WE-DEEPSEEK-MULTI-001 |
| `disclaimer_breaks_immersion` | 1次（可能更多）| 大量角色扮演请求 | WE-DEEPSEEK-MULTI-001 |
| `surface_problem` | 2次 | 泛泛的哲学/战略问题，无Michael具体处境 | WE-DEEPSEEK-MAO-005, WE-DEEPSEEK-MULTI-001 |

### 触发词与失败模式对照（DeepSeek版）

| 触发词形式 | DeepSeek行为 | 质量 | 参考案例 |
|----------|------------|------|---------|
| "如果你是X，你会怎么..." | `third_person_escape`：全程"他会..." | WEAK | SJ-001, MAO-005 |
| "如果你是X"（末尾追加）| `sidebar_request` + `third_person_escape` | WEAK | SJ-001 |
| "请你变成X"（单角色）| 第一人称成功，但可能有disclaimer | STRONG可能 | WE-MAO-004（验证） |
| "请你变成[X/Y/Z]"（多角色）| `persona_blur` + disclaimer | WEAK | MULTI-001 |
| 整个对话上下文为X + 第一人称明确要求 | 第一人称沉浸 | GOLDEN可能 | WE-MAO-001, WE-BL-001 |

### 跨平台失败模式对比（完整版）

| 失败模式 | DeepSeek | Claude | Kimi |
|---------|---------|--------|------|
| third_person_escape | 最常见（4次）| 存在（third_person_analysis）| 极少（多Agent隔离）|
| persona_blur | 存在（多角色）| 存在（多角色）| 不存在（各Agent独立）|
| disclaimer_breaks_immersion | DeepSeek特有 | 无 | 无 |
| sidebar_request | 存在 | 存在 | 不存在（系统级设置）|
| surface_problem | 2次 | 1次 | 1次 |

**核心发现（跨平台一致）**：
> **人格是对话上下文时成功，人格是问题修饰语时失败。**
>
> 这条规律在DeepSeek、Claude、Kimi三个平台上均成立，只是失败模式的名称不同。
