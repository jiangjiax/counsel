/**
 * 所有 AI 调用的 prompt 集中维护
 */

// ─── Step 3: 挖事实 ────────────────────────────────────────────────────────────

export function factsUserPrompt(
  rawInput: string,
  defined: string,
  historySection: string
): string {
  return `## 案主困惑\n${rawInput}\n\n## 已锁定议题\n${defined}${historySection}\n\n---\n你只做一件事：挖事实。\n\n规则：\n- 只问事实性问题（可核实的数据、时间、人物、行动、结果）\n- 不评论、不给建议、不教育案主\n- 0-2个问题足矣，不要贪多\n- 每个问题单独一行，直接以"你..."或"是否..."开头\n- 如果已有信息足够支撑讨论，直接输出"没问题"，不要提问`;
}

export function factsHistorySection(previousQA: string): string {
  return previousQA
    ? `\n\n## 之前幕僚的提问与案主的回答\n${previousQA}\n\n（注意：不要重复已经问过的问题）`
    : "";
}

// ─── Step 4: 独立发言 ──────────────────────────────────────────────────────────

export function opinionsPrompt(
  rawInput: string,
  defined: string,
  answers: string
): string {
  return `## 案主困惑\n${rawInput}\n\n## 核心议题\n${defined}\n\n## 案主补充信息\n${answers}\n\n---\n请你从自己的独特视角出发，给出最核心的判断和建议。150字以内，直接给出最重要的1-2个洞见，不要客套。`;
}

// ─── Step 5: 提炼冲突维度 ──────────────────────────────────────────────────────

export function dimensionsPrompt(opinionsText: string): string {
  return `以下是12位幕僚对案主议题的独立意见：\n\n${opinionsText}\n\n---\n请从这些意见中识别3-6个真正不调和的冲突维度。\n\n**什么是真正的冲突**：不是语气差异，而是幕僚们在某个核心判断上存在实质分歧——例如时间优先级的根本分歧、是否信任外部资源的分歧、短期生存 vs 长期愿景的权衡、风险承受度的差异等。即使大方向一致，也可能在"如何做""权衡什么""优先什么"上存在真实分歧，这些都算冲突维度。\n\n**输出格式**（每个维度）：\n## 维度名\n冲突核心：（一句话描述这个维度上的根本分歧是什么）\n争议焦点：（各方的核心观点各是什么）\n\n要求：\n- 必须输出3-6个维度，不能更少\n- 每个维度是全体幕僚共同探讨的议题，不要把幕僚分配到正反方小组\n- 维度之间不能重叠\n- 只输出维度列表，不要其他说明`;
}

// ─── Step 6: 辩论 ──────────────────────────────────────────────────────────────

export function debatePersonaPrompt(
  defined: string,
  answers: string,
  dim: string
): string {
  return `## 案主议题\n${defined}\n\n## 案主信息\n${answers}\n\n## 当前辩论维度\n${dim}\n\n---\n请就"${dim}"这个维度，给出你的立场（正方/反方/中间）和核心论点。100字以内，直接说立场和理由。`;
}

export function debateFacilitatorPrompt(dim: string, allPositions: string): string {
  return `以下是幕僚就"${dim}"维度的辩论发言：\n\n${allPositions}\n\n---\n请提炼这个维度的核心冲突：\n**核心矛盾**：（一句话）\n**正方核心论点**：（一句话）\n**反方核心论点**：（一句话）`;
}

// ─── Step 7: 汇总 ──────────────────────────────────────────────────────────────

export function summaryPrompt(
  rawInput: string,
  defined: string,
  answers: string,
  debate: string
): string {
  return `## 原始困惑\n${rawInput}\n\n## 核心议题\n${defined}\n\n## 案主补充\n${answers}\n\n## 辩论记录\n${debate}\n\n---\n请生成完整的汇总报告（Step 7 格式）。`;
}

// ─── Step 8: 摘果子 ────────────────────────────────────────────────────────────

export function harvestEvalPrompt(rawInput: string, summary: string): string {
  return `## 案主困惑\n${rawInput}\n\n## 本次讨论总结\n${summary}\n\n---\n请你对案主做一个直接的评价：\n1. 优点（1-2点）\n2. 盲区或风险（1-2点）\n3. 给他/她的一句话建议\n\n100字以内，直接说。`;
}

export function harvestTodoPrompt(evalsText: string, summary: string): string {
  return `## 幕僚对案主的评价\n${evalsText}\n\n## 讨论总结\n${summary}\n\n---\n请提炼出本次讨论的关键 To-Do 清单（从案主视角，3-8条，具体可执行），以及 1-2 条最值得记住的洞见。格式：\n\n## To-Do\n- [具体行动1]\n- [具体行动2]\n...\n\n## 核心洞见\n- 洞见1\n- 洞见2`;
}
