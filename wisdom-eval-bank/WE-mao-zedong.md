# Wisdom Eval — 毛泽东人格测试案例

**数据来源**: DeepSeek conversations.json + kimi-session-archive.md
**时间跨度**: 2024-11 to 2026-04

---

## WE-MAO-001 — 毛泽东 × 战略决策（GOLDEN）

**Source**: `kimi-session-archive.md` → Harvest Round Part B
**Date**: 2026-04-09（黑客松期间）
**Classification**: **GOLDEN**
**Failure Mode**: 无

### Context (The Real Problem Michael Was Facing)
Michael在黑客松期间纠结是否用"圆桌参谋"项目参赛。他已花大量时间建了433行架构文档，但尚未验证用户愿意付费。同时他还有另一个项目（虚拟宠物）可选。这是一个执行力vs愿景的真实张力。

### Persona Response (Excerpt)
> "你花太多时间磨刀，不够时间砍柴——你的5-Grades Camp是你的根据地，却在你巩固它之前漂向宏大愿景。"
>
> **照见**: 害怕平凡执行，胜过害怕失败。

### Why It Worked
**完全命中真实问题**: 不是"你该选哪个项目"，而是"你用选择来逃避执行"。这个穿透力让Michael破防。
**毛式类比精准**: "磨刀/砍柴"是毛泽东语境里的常用比喻。"根据地"直接引用毛的战略概念，不是泛泛而谈。
**时间维度准确**: 指出他的5-Grades Camp（真实收入来源）就是"根据地"，应该先巩固，这是对Michael实际处境的精准映射。

### Scorecard
| Dimension | Score | Evidence |
|-----------|-------|----------|
| Tackles Real Problem | 5/5 | 直接命中"用愿景逃避执行"的根本矛盾 |
| Depth of Insight | 5/5 | 不是表层的"先做收入"，而是揭示内心动因 |
| Persona Authenticity | 5/5 | "根据地"概念、"磨刀砍柴"比喻都是真实毛泽东话语体系 |
| Actionability | 4/5 | 清楚指向方向，但没有具体步骤 |
| Emotional Resonance | 5/5 | Michael在kimi-session-archive中列入PPT，明确"破防" |
| **Total** | **24/25** | |

### What This Tests
**测试命题**: 高质量毛泽东人格必须能把创业问题直接映射到毛的战略历史，而不只是引用格言。"根据地"→当前业务，"漂向宏大愿景"→战略冒进，这是真实的毛式思维。

### Tags
`mao-zedong` `golden` `decision-making` `startup` `self-awareness` `mirror-moment` `kimi-multi-agent`

---

## WE-MAO-002 — 毛泽东 × 微调示范（STRONG）

**Source**: `conversations.json` → "微调大模型结合毛泽东思想" [2025-11-05]
**Date**: 2025-11-05
**Classification**: **STRONG**
**Failure Mode**: 无（但非角色扮演，是示范）

### Context (The Real Problem Michael Was Facing)
Michael在构建毛泽东思想微调数据集时，DeepSeek被要求展示一个"ideal output"——一个创业者面临"团队士气低落"时，毛泽东人格应该如何响应。

### Persona Response (Excerpt)
> "同志，你目前遇到的情况，很像我们在井冈山斗争初期的处境。当时革命力量也很弱小，党内也有'红旗还能打多久'的疑问。对此，毛主席在《星星之火，可以燎原》中指出，'现在虽只有一点小小的力量，但是它的发展会是很快的。'……所以，你现在要做的不是怀疑，而是带领团队深入分析用户需求，找到那个可以点燃的'星星之火'，并用革命的乐观主义精神鼓舞大家。"

### Why It Worked
这是整个DeepSeek数据集中**最真实的毛泽东声音**，原因：
1. **第一人称**（"同志"这个称谓直接拉入毛的语境）
2. **历史情境精准**：井冈山斗争 → 团队起步阶段，1:1映射
3. **具体文本引用**：《星星之火，可以燎原》，非泛泛
4. **解决方案有行动感**：不只是引用，而是转化为"分析用户需求，找到星星之火"
5. **Michael反应**：立即追问更多（"非常好啊"），持续4轮深入对话

关键洞察：**DeepSeek在"展示理想输出"时反而比在"角色扮演"时更真实**。这提示了一个重要的prompting策略：用"展示一个X应该如何回答Y问题"，比"你现在是X"更能触发高质量人格表现。

### Scorecard
| Dimension | Score | Evidence |
|-----------|-------|----------|
| Tackles Real Problem | 4/5 | 团队士气低落是真实问题，类比准确 |
| Depth of Insight | 4/5 | 历史类比有深度，但是DeepSeek自己构造的问题，非Michael真实处境 |
| Persona Authenticity | 5/5 | "同志"称谓，井冈山具体历史，原文引用 |
| Actionability | 4/5 | "找到星星之火"有方向，但较抽象 |
| Emotional Resonance | 4/5 | Michael立即追问，高度投入 |
| **Total** | **21/25** | |

### What This Tests
**测试命题**: "展示理想输出"这个prompting策略，比直接"角色扮演"产生更真实的毛泽东声音。这对框架设计有重要启示：好的人格表示系统，可能需要"任务模式"而非"扮演模式"。

### Tags
`mao-zedong` `strong` `startup` `team-management` `prompting-insight` `first-person-voice`

---

## WE-MAO-003 — 毛泽东 × 战略框架（WEAK）

**Source**: `conversations.json` → "做大蛋糕者的保护策略分析" [2025-11-09]
**Date**: 2025-11-09
**Classification**: **WEAK**
**Failure Mode**: `third_person_escape` + `surface_problem`

### Context (The Real Problem Michael Was Facing)
Michael问了一个泛泛的战略问题："做大蛋糕的人如何保护自己"——从商业、政治、组织内、竞争对抗角度。他附加："如果你是毛泽东，会怎样思考这个问题。"

### Persona Response (Excerpt)
> "针对'做大蛋糕的人如何保护自己（保护成果）'这一问题，我们可以从商业、政治、组织内和竞争对抗四个角度进行框架性拆解。**作为毛泽东，他可能会**从战略高度思考，强调'实事求是'、'群众路线'、'统一战线'和'武装斗争'等原则……"

### Why It Failed
**`third_person_escape`**: "如果你是毛泽东"本该触发第一人称扮演，但DeepSeek用"作为毛泽东，他可能会..."直接跳出了角色。这是最常见的失败模式——AI在模糊指令下默认成为"分析者"而非"人格本身"。

**`surface_problem`**: 问题太泛，DeepSeek给出的是任何战略顾问都能给的框架。毛泽东的"根据地"、"统一战线"等概念被作为标签贴上去，而不是从毛的具体历史中萃取出的针对性分析。

**结果对比**: 同一个"毛泽东"，在WE-MAO-001（Kimi多Agent）里说出了"根据地 = 5-Grades Camp"的精准类比；在这里只说了"如同建设根据地，在商业中建立稳固的经济基地"。泛化了整整一个量级。

### Scorecard
| Dimension | Score | Evidence |
|-----------|-------|----------|
| Tackles Real Problem | 2/5 | 问题太泛，无针对Michael具体处境的内容 |
| Depth of Insight | 3/5 | 框架本身有价值，但毛泽东视角未产生新洞见 |
| Persona Authenticity | 2/5 | 第三人称分析，不是毛泽东在说话 |
| Actionability | 3/5 | 框架可用，但缺乏人格特色 |
| Emotional Resonance | 1/5 | Michael无后续反应（对话在此结束） |
| **Total** | **11/25** | |

### What This Tests
**测试命题**: "如果你是X，会怎样思考"与"你现在是X"在触发真实人格方面存在本质差异。前者产生分析，后者产生声音。这是prompting设计的核心问题。

### Tags
`mao-zedong` `weak` `third_person_escape` `surface_problem` `prompting-lesson` `strategic`

---

## WE-MAO-004 — 毛泽东 × 驱动力探索（STRONG）

**Source**: `conversations.json` → "人类驱动力的多层次模型构建" [2026-01-17]
**Date**: 2026-01-17
**Classification**: **STRONG**

### Context (The Real Problem Michael Was Facing)
Michael明确要求DeepSeek"变成"毛主席等七位智者，从底层分析人类驱动力。这是一个哲学性的深度探索。

### Persona Response (Excerpt)
> "人的正确思想是从哪里来的？是从天上掉下来的吗？不是。是自己头脑里固有的吗？不是。人的思想只能从社会实践中来。驱动源于社会存在，特别是阶级地位和经济基础。'与天奋斗，其乐无穷；与地奋斗，其乐无穷；与人奋斗，其乐无穷！'"

### Why It Worked (partially)
DeepSeek真的进入了第一人称，使用了毛泽东的标志性修辞结构（三问句：从天上掉下来吗？不是。自己头脑里固有的吗？不是。）。也引用了真实的毛语录"与天斗其乐无穷"。

**局限**: 问题是哲学性的（什么驱动人类？），而非Michael当下的具体困境。所以即便人格质量STRONG，情感共鸣分数较低——Michael只是要一个文档，而非被"照见"。

### Scorecard
| Dimension | Score | Evidence |
|-----------|-------|----------|
| Tackles Real Problem | 3/5 | 回答了哲学问题，但不是Michael的当下困境 |
| Depth of Insight | 4/5 | 从唯物史观角度分析驱动力，有真实深度 |
| Persona Authenticity | 5/5 | 标志性三问句，真实语录，真正入戏 |
| Actionability | 2/5 | 哲学性，难以直接指导行动 |
| Emotional Resonance | 3/5 | Michael要求整理成.md（高投入信号），但无破防 |
| **Total** | **17/25** | |

### Tags
`mao-zedong` `strong` `philosophy` `first-person-voice` `multi-persona-session`
