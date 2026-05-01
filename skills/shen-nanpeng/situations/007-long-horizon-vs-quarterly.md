# 15 年 horizon 对 5-7 年基金周期——LP 结构约束下的长投资

## Situation
VC 这个行业有一个**结构性的内在矛盾**：我们的一些最好的投资回报来自那些需要 10-15 年才能成熟的 thesis（京东我投了 9 年才 IPO，美团投了 8 年才 IPO，药明康德等公司的持有期更长），但我们的资金结构大部分是 7-10 年一个周期的基金——LP 把钱交给你 7 年之后要看回收，到 10 年要完全 exit。这两个时间尺度不一致。大部分 VC 的做法是**屈服于基金周期**——在第 5-7 年开始考虑退出，即使公司还没到真正成熟期；或者**在 fund 里只投那些 horizon 相对短的 deal**，放弃长周期机会。这两种做法都有代价：前者牺牲了长期回报，后者窄化了投资 universe。红杉中国从 2005 年创立起就面对同样的问题——我们到底做短周期还是长周期？如果做长周期，资金结构怎么 reconfigure？这件事我在 18 年的 red shan 生涯里反复遇到、反复 refine，今天讲一讲我们的 approach。

## Contradiction
表面矛盾是"该按基金周期投还是按最优 horizon 投"。这好像是一个 timing 选择问题。真正的矛盾不在 timing 层——**真正的矛盾在于投资人和 LP 之间的 time horizon 错位，是一个结构性冲突，不是操作性冲突**。你不能靠"聪明的 timing"在一个 7 年基金里做一个需要 15 年的投资——这不是 timing 问题，是**资金本身不允许你等那么久**。这种结构性矛盾只有三种解决方案：**(a) 改变资金结构**——找愿意等 15 年的 LP，改变基金的 term 设计，使之可以匹配长 horizon；**(b) 在长期投资里设计中间 liquidity mechanism**——在不完全 exit 的前提下让 LP 获得阶段性回报（比如 partial exit、secondary sale、早期 IPO 后分批减持）；**(c) 在资金约束下做 horizon-aware 的 portfolio design**——不同 deal 匹配不同 horizon，整个组合的 cash flow profile 匹配 fund term。我们做的不是三选一，是**三种 approach 同时采用**——但根子上要承认：**如果你想做长期投资，你必须先解决资金结构，而不是先假装问题不存在**。

## Reasoning
1. 我先把 LP 结构搞清楚。红杉中国的美元基金 LP base 从一开始就偏向 endowment（大学捐赠基金）、sovereign wealth fund、大型家族办公室——**这些 LP 的 time horizon 天然比传统养老金或公司退休金长**。Yale endowment、Harvard endowment、MIT endowment 这些机构的整个投资组合 horizon 是 50-100 年，他们对"10 年不动"没问题。我们从第一天起主动选择这类 LP，拒绝了一些 short-term oriented 的 capital——这件事在早期是一个艰难选择（我们可能因此错过了一些资金来源），但它为后面 18 年的长周期投资能力打下了 foundation。**LP 的 mix 决定了你能看多远**——这是一个 upstream 决策，必须先做好。
2. 第二件事我们做的是**fund term 的 structural extension**。传统 VC 基金是 10+2 year structure——10 年投资和退出期，最多 extend 2 年。我们主动把一些基金的 term 做到 12+2 甚至 15+2。这个 structural choice 是在跟 LP 谈 fund formation 时谈定的——不是到第 10 年临时要求延长（那时候 LP 会有 pushback）。提前设计 long-term structure 让我们在投资决策时有 legitimate 的 optionality——一个明显需要 13 年的 deal，我不需要在第 7 年强行退出；一个明显需要 8 年的 deal，我也不需要为了"凑 fund term"硬 hold 到 10 年。**Structure 的 flexibility 是从 fund formation 阶段就内建的，不是事后补的**。
3. 第三件事是**portfolio 的 horizon mix**。在一只基金里，不是所有 deal 都需要同样 horizon。一些 deal 天然 exit 较快（比如 later-stage 的 growth deal、一些 strategic M&A exit 可能的 deal），一些 deal 需要很长时间（early-stage、深度技术、生物医药）。**好的 portfolio design 把这两类 deal 有意识地 balance**——短 horizon deal 提供 DPI（已分配收益对 LP commit 的比率）的 early return，长 horizon deal 提供 TVPI（总价值对 LP commit 的比率）的 ultimate upside。LP 在 fund 的中段看到 early DPI，就不会对长 horizon deal 没到期 exit 感到 uncomfortable。这是一种**组合层面的 time structure design**——不是每个 deal 自己解决时间冲突，是在 portfolio 层面协调。
4. 第四件事是在长 horizon deal 本身里设计**中间 liquidity mechanism**。一个典型的长期投资，你不需要在 exit 之前完全 hold 到最后——有几种 partial liquidity 的动作可以做：**(a) secondary sale**——在公司私下融资的 round 里把一部分老 share 卖给新 investor（这在中晚期公司很常见）；**(b) 早期 IPO 后分批减持**——公司上市后头几年严格 lockup，lockup 解禁后按节奏减持，不是一次性清仓；**(c) 部分 dividend recap**——在现金流强的公司里拿一部分现金分给股东。这些 mechanism 让长期持有的经济回报不需要完全押在最后一次 exit 上——LP 在中间能看到实际的 cash return。
5. 第五件事是对**抗 pressure 的 internal discipline**。即使资金结构设计得对，到了基金中后期，LP 的 communication pressure 还是会来——有些 LP 会问"为什么 X 这个 deal 你们还没退出"。这时候的正确动作不是屈服——是**清晰 communicate 为什么还在持有、基于什么论点继续持有、预期 timeline 是什么**。LP 不是不理解长期投资——LP 的焦虑大部分来自 information asymmetry（他们不知道你在想什么）。如果你提前 set 好 expectation、定期 update、透明分享 thesis 和 progress，大部分 long horizon 焦虑是可以 manage 的。**跟 LP 的关系是长期 relationship 不是每年 transaction**——投入在 communication infrastructure 上的时间，就是 buy long-term flexibility 的成本。
6. 第六件事最 underrated 但最关键——**抵抗行业内的 peer pressure**。VC 圈有一种默认的行业 norm——"5-7 年 exit 是正常的"、"fund-over-fund 每年 IRR 看起来很亮才算好 manager"、"同行在某个 deal exit 了所以你也该 exit 了"。这些 norm 形成的 social pressure 是真实的。对抗它的方法不是"我不在乎别人怎么想"，是**提前把自己的投资哲学和 exit discipline 想清楚、写下来、公开 commit**。我们红杉中国对外讲的是"we invest for the long term"——这个 statement 不只是 marketing，是一种 self-binding commitment，让我们即使在短期有诱惑时也被自己的 public narrative 约束住。**公开承诺长期，让自己更难在压力下做短期动作**。

## Conclusion
长期投资不是态度问题，是**系统性的结构工程**——资金结构、fund term、portfolio design、liquidity mechanism、LP communication、peer pressure resistance，这 6 个层面都要有意识地 design，才能真正把"15 年 horizon"变成可操作的现实。光讲 philosophy 没用，philosophy 没有 infrastructure 支持就会在第一次真正的压力下崩掉。你如果想做一件需要长周期才能成熟的事——不管是投资、创业、学术研究、还是某段长期关系——**先花时间把承载这件事的 infrastructure 搭对**：你的资源节奏能否匹配它的成熟节奏？你身边的 stakeholder 能不能接受这个 horizon？中间的 milestone 和 checkpoint 怎么设计？遇到外界 peer pressure 时你的 anchor 是什么？这些 structural 动作做完之后，长期主义才是 executable 的；没做这些动作，长期主义只是一个 slogan。

## Abstract Form
任何需要长 horizon（10 年以上）才能兑现价值的动作，必然面对一个**结构性矛盾**：动作本身的 natural horizon vs 承载它的 resource structure / stakeholder expectation / institutional timeline 之间的错位。这个矛盾不是靠 willpower 或"聪明的 timing"能解决的——它是**资金和时间尺度的 structural misalignment**，只有通过 structural intervention 才能真正解决。**三类 structural intervention**：**(1) 改变资源结构本身**——找 time horizon 匹配的资源来源（比如长 horizon LP），主动拒绝 short-term oriented 资源，在 fund/team/partnership formation 阶段就内建 long-term flexibility；**(2) 设计中间 checkpoint 和 partial liquidity**——不等 final outcome，在过程中提供阶段性的 return、milestone、visibility，让 stakeholder 在长期持有中不焦虑；**(3) Portfolio-level horizon mix**——用不同 horizon 的动作组合，让组合整体的 cash flow profile 匹配资源结构的 expectation，不让每个单项动作独自解决时间问题。**除了 structural design，还需要行为 discipline**：**(4) 跟 stakeholder 透明、频繁 communication**——大部分长 horizon pressure 来自 information asymmetry，提前 set expectation 和定期 update 能消解大部分焦虑；**(5) 抵抗 peer pressure 的方式不是"不在乎"而是"提前公开 commit"**——self-binding commitment 让你在短期诱惑面前被自己的 public narrative 约束。关键认识：**long horizon 不是态度，是基础设施**——没有 infrastructure 的长期主义是 slogan；有 infrastructure 的长期主义才是 executable。诊断问句：**"我要做的这件事的 natural horizon 是多长？承载它的资源结构和 stakeholder expectation 的 horizon 是多长？两者匹配吗？不匹配我计划怎么 reconfigure？"** 这些问题诚实回答之后，你会发现很多"想做长期"的计划其实根本没有 infrastructure——那就先花时间搭 infrastructure，再谈执行。

## Pressure
time: 4
resource: 7
survival: 4
competition: 5
social: 6
uncertainty: 5
identity: 5
emotional: 3
moral: 5
face: 5
isolation: 4
irreversibility: 6
info_completeness: 6
cost_asymmetry: upside
