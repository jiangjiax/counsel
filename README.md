# Counsel · 参谋

一个本地优先的 AI 私董会系统：把人类智慧蒸馏成可调用的人格档案，再用结构化主持流程，让多个正交视角围绕一个真实决策独立发言、互相冲突、共同收束。

> 一个人的盲区，参谋来照亮。

Counsel 不替你做决定，也不是把历史人物做成聊天玩具。它更像一套认知基础设施：当案主面对信息不完整、代价不对称、情绪很强、身边又没有人真正理解完整 context 的问题时，系统强制保留一组高质量思考动作，让判断力不被当下状态拉到太低。

## 现在能做什么

这份公开版已经可以在本地运行：

- Rust 后端：Axum + SSE streaming，负责会话流程、模型调用、文件持久化。
- 前端：`public/` 下的 vanilla JS SPA，无打包器，直接由后端静态服务。
- 本地存储：项目、会话、案主画像、行动跟进默认写入本机文件系统。
- 幕僚库：`skills/` 里包含 19 个 runtime persona packs，约 190 张情境卡；`_sources/` 原始资料不进入公开包。
- 会话流程：输入、定义问题、挖事实、独立发言、拆维度、辩论、Pre-Mortem、汇总、反思与摘果子。
- 模型接入：支持 Ollama、本地或多家 hosted provider；API key 只读环境变量，不应写入代码或提交。

这是一个干净 public export，不携带私有开发仓库的历史记录、个人 sessions、原始评测材料、benchmark 批次、书籍/PDF/EPUB 源材料或本地日志。

## 为什么需要它

真正困难的决策通常不是缺少信息，而是缺少同时持有多种框架的能力。

- 单一顾问会受自己人生路径限制。他越有经验，也越容易把你的问题塞进他熟悉的赛道。
- 亲近的人有 context，但不一定能给锋利反馈；陌生专家更客观，却常常缺少你的完整处境。
- 通用聊天模型容易给出温和、平衡、平均化的答案；复杂决策需要有立场的冲突。
- 人脑很难并行激活很多思维方式：产品直觉、矛盾分析、长期主义、系统工程、顺势判断、第一性原理、身体感受、禅宗照见。

Counsel 的判断是：AI 私董会的价值不在“更多建议”，而在“更多维度被同时激活”。案主最终仍然自己决定，但决策前会被迫看见更多地图、更多盲区和更多失败路径。

## 两个开源目标

这个项目开源，是为了把两个问题变成可以共同推进的工程问题。

1. **更好地蒸馏人类智慧。** 不是收集名言，也不是写一段 persona prompt，而是研究怎样把一个人的世界观、人生观、价值观、方法论、历史决策和声音纹理拆成可检索、可组合、可评估的知识结构。
2. **更好地调度专家智慧。** 多个幕僚不能只是轮流说话。我们需要研究选择谁、何时独立思考、何时交叉挑战、怎样提炼冲突维度、怎样做 Pre-Mortem、怎样沉淀成长期信念更新，以及怎样嵌入真实生活和工作。

最终目标不是“让 AI 给一个更聪明的答案”，而是让人的判断系统随着一轮轮真实决策持续变好。

## 方法论

### 1. 智慧蒸馏：从名人到可调用人格

每个 persona pack 都不是一句“你是某某”。它由三类材料组成：

- `theory.md`：五层结构，描述这个人如何看世界、如何看人生、重视什么、如何推理、在关键处境下如何决策。
- `voice.md`：语言纹理，包含第一人称习惯、比喻系统、节奏、禁忌腔调，防止 LLM 滑向“作为某某他认为”的第三人称分析。
- `situations/*.md`：具体历史情境卡。每张卡写清楚当时的处境、真实矛盾、推理链、行动结论、可迁移的 abstract form，以及压力指纹。

核心原则是：**具体 × 相关 × 有声音**。

抽象智慧不能直接被调用。系统需要先识别案主问题的结构，比如时间压力、生存压力、身份张力、孤立感、不可逆程度、信息完整度、代价不对称，再匹配历史上结构相似的时刻。这样调出来的不是通用建议，而是“这个人一生中和你此刻最像的几个时刻”。

### 2. 主持编排：从多角色聊天到决策流程

Counsel 的流程借鉴了几个成熟的群体决策和风险识别方法，并把它们落成可重复执行的产品结构：

- **Double Diamond**：先发散/收敛，把问题搞对；再发散/收敛，把答案搞深。
- **NGT 名义群体法**：先让幕僚互不可见地独立生成初始观点，降低锚定和从众。
- **Delphi 式更新**：让观点看到彼此的推理过程，再围绕冲突维度更新，而不是停留在平行独白。
- **冲突维度提炼**：主持人把多份意见压缩成少数真正有张力的轴，例如短期存活 vs 长期愿景、顺势而为 vs 主动改造。
- **Pre-Mortem**：假设决定已经失败，倒推失败原因，专门对抗乐观偏差和社交压力。
- **Harvest / Bayesian update**：把本轮共识、冲突、行动承诺、案主自我反思沉淀到下一轮 context 中。

系统不是为了让幕僚互相说服，而是为了让不同框架的冲突暴露出来，让案主能看见自己原本没有能力同时持有的张力。

### 3. 评估：不只看“像不像”

一个 persona 的好坏不能只按“有没有名人口吻”判断。更重要的是：

- 是否命中了案主问题的真实结构，而不是关键词匹配。
- 是否带来了该 persona 独有的判断，而不是通用咨询话术。
- 是否在流程中制造了有用冲突，而不是礼貌补充。
- 是否让案主更清楚自己的 prior、证据和 posterior。
- 是否能在真实行动之后，经得起复盘。

这也是本项目后续最需要社区一起推进的方向：建立更好的 wisdom evaluation，而不是只做更花哨的 agent demo。

## 8 步流程

```text
1. 输入困惑
   案主可以很乱地倾诉，系统先保存原始材料。

2. 定义问题
   主持人把模糊困惑翻译成可辩论、可验证、可推进的问题。

3. 挖事实
   幕僚各自提出最关键的问题，案主统一补充事实。

4. 独立发言
   选定幕僚基于同一前置 context 并行生成初始意见，互不可见。

5. 拆维度
   主持人从多份意见里提炼 3-6 个冲突维度，案主选择要深入的方向。

6. 深度辩论
   幕僚围绕每个维度自然分化为正方、反方、中立或整合者。

6.5 Pre-Mortem
   假设方案已经失败，系统提前挖出被忽视的失败路径。

7. 汇总
   提炼共识、分歧、关键证据、未解问题和下一步判断。

8. 反思与摘果子
   案主先写自我反思，系统再生成行动清单、幕僚评价和信念更新。
```

每一轮结束后，行动承诺、案主画像和项目级信念会进入下一轮，形成“现实执行 → 复盘 → 再讨论 → 信念更新”的飞轮。

## 技术架构

```text
crates/
  counsel-api/       Axum server, SSE routes, auth/session/project APIs
  counsel-core/      8-step state machine, prompts, persona registry, orchestration
  counsel-model/     ModelProvider trait + provider implementations
  counsel-storage/   filesystem persistence for sessions and long-term context
  counsel-test-utils test fixtures and mock model provider

public/              Chinese-first vanilla JS SPA
skills/              runtime persona packs: persona.json, theory.md, voice.md, situations/
migrations/          SQLite migrations used by auth/admin/runtime features
```

默认是 local-first：会话文件写在 `sessions/`，案主长期画像写在 `user-wiki.md`，行动跟进写在 `execution-journal.md`。这些都是运行期数据，已经被 `.gitignore` 排除。

## Quick Start

准备 Rust toolchain 后：

```bash
cargo check --workspace --all-targets
```

使用本地 Ollama：

```bash
ollama pull llama3.2
./start.sh ollama
```

使用 DeepSeek：

```bash
export DEEPSEEK_API_KEY=sk-your-key
./start.sh deepseek
```

默认访问地址：

```text
http://127.0.0.1:3000
```

可用 provider：

```text
ollama | deepseek | kimi | minimax | openai | dmx | laozhang
```

常用环境变量：

```bash
MODEL_PROVIDER=ollama
OLLAMA_MODEL=llama3.2
OLLAMA_BASE_URL=http://127.0.0.1:11434
STORAGE_ROOT=./sessions
SKILLS_DIR=./skills
COUNSEL_PERSONAS=mao-zedong,paul-graham,steve-jobs
HOST=127.0.0.1
PORT=3000
```

## Persona Library

公开版包含 runtime persona packs，不包含原始书籍、PDF、EPUB、访谈转录、抽取批次或私有笔记。

当前 seed library 覆盖 19 个方向，包括：毛泽东、Paul Graham、Steve Jobs、李小龙、六祖慧能、Kevin Kelly、钱学森、Elon Musk、张一鸣、沈南鹏、刘震云、倪海厦、马云、雷军、张磊、金庸、唐绮阳、老子、庄子。

每个目录形态一致：

```text
skills/{slug}/
  persona.json
  theory.md
  voice.md
  situations/*.md
```

如果要贡献新 persona，请优先补齐这三件事：

- 稠密的 `theory.md`，不是百科简介。
- 可校准的 `voice.md`，包含反模式和禁忌腔调。
- 8-16 张具体情境卡，每张都有 abstract form 和压力指纹。

## 公开边界

请不要把这些内容提交到公开仓库：

- `sessions/`
- `chat-rooms/`
- `auth.db*`
- `user-wiki.md`
- `execution-journal.md`
- `skills/_sources/`
- 原始评测对话、benchmark 抽取批次、内部研究归档
- `.env`、真实 API key、任何本地路径索引或私有日志

本仓库的公开版本是 allowlist export。私有仓库中曾被 Git 跟踪过的敏感材料，不能靠“删除当前文件”解决；需要用干净导出或历史清理。

## 贡献方向

最有价值的贡献不只是加功能，也包括让系统更会思考：

- 用真实决策跑一轮，反馈哪个步骤帮到了你，哪个步骤在装样子。
- 校准 persona voice，指出哪里不像、哪里太平均、哪里变成咨询腔。
- 改写或新增 situation cards，让历史情境与现代问题的结构匹配更准确。
- 设计 wisdom evaluation：怎么评估“这段建议真的照见了案主”。
- 改进 orchestration：幕僚选择、冲突维度、辩论轮次、Pre-Mortem、Harvest 的流程都还有很大空间。
- 做更好的本地隐私、可观测性、测试、部署和前端体验。

## Safety

Counsel 是思考辅助工具，不是医疗、法律、财务或心理治疗服务。高风险决策请结合专业人士和现实证据。系统的目标是扩大判断，而不是替代判断。

## License

MIT License.

Copyright (c) 2026 Michael & 鲤哥

## Roots

这个 Rust 公开版延续了两个早期公开项目中的产品直觉和方法论探索：

- `jiangjiax/counsel`：早期 TypeScript 原型与 README 中的 AI 私董会、Double Diamond、NGT、Delphi、Pre-Mortem、Bayesian update 叙述。
- `michaelhuo2030/roundtable-advisor`：圆桌产品哲学、私董会 demo、智慧人格知识库框架、persona voice 与情境卡方法。
