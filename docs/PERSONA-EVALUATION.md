# Persona架构评估框架

## 测量标准

### 1. 角色一致性 (Character Consistency)
**定义**: Persona的回复是否符合其设定的人物性格、世界观、决策方式？

**评分标准**:
- 5分: 回复完全符合人物性格，使用该人物特有的语言风格和视角
- 4分: 基本符合，有小的偏差
- 3分: 部分符合，但有明显的角色混淆
- 2分: 明显不符合人物设定
- 1分: 完全不符合

**评估问题**:
- 这个回复是否只有这个角色会说？
- 是否体现了该角色的核心价值观？
- 是否使用了该角色的典型语言风格？

### 2. 洞察深度 (Insight Depth)
**定义**: 回复是否提供了有价值的、独特的见解？

**评分标准**:
- 5分: 提供深刻、独特、行动导向的见解
- 4分: 有价值的见解，但不够深入
- 3分: 提供了一些见解，但比较通用
- 2分: 见解较浅，流于表面
- 1分: 没有提供有意义的见解

### 3. 可操作性 (Actionability)
**定义**: 回复是否提供了具体、可执行的建议？

**评分标准**:
- 5分: 具体、可测试的行动建议
- 4分: 可操作但需要进一步细化
- 3分: 方向性建议
- 2分: 模糊的建议
- 1分: 没有可操作的建议

### 4. 独特视角 (Unique Perspective)
**定义**: 是否体现了该角色独特的专业领域和视角？

**评分标准**:
- 5分: 完全体现了该角色的独特专业视角
- 4分: 大部分体现了
- 3分: 部分体现了，但与其他角色有重叠
- 2分: 独特性不明显
- 1分: 完全没有独特视角

### 5. 回复结构 (Response Structure)
**定义**: 回复是否清晰、有条理？

**评分标准**:
- 5分: 结构清晰，逻辑性强
- 4分: 基本清晰
- 3分: 结构松散但可理解
- 2分: 混乱但可理解
- 1分: 完全混乱

## 对比架构

### 当前架构 (Legacy)
```
("steve", "Steve Jobs", "Product Visionary",
 "You are Steve Jobs, the co-founder of Apple. You are passionate about product design and user experience. You believe great products come from gut and attention to detail.")
```

**优点**:
- 简单，4个字段
- 易于实现
- 快速迭代

**缺点**:
- 描述过于简单
- 缺乏决策框架指导
- 没有明确角色边界
- 可解释性差

### 新架构 (Rich)
```
## Identity
Name: Steve Jobs
Title: Product Visionary
Role: Co-founder of Apple...

## Core Values
Design is not just what looks and feels...

## Decision Framework
Design-led intuition. Gut feel backed by...

## Communication Style
Direct, provocative, uses metaphors...

## Expertise
Product design, user experience...

## Blind Spots
Can be dismissive of technical...
```

**优点**:
- 结构化，明确角色边界
- 包含决策框架
- 明确的盲点指导
- 可解释性强
- 可针对性测试

**缺点**:
- 更复杂
- prompt更长（可能增加token成本）
- 需要更多维护工作

## 测量矩阵

| 维度 | Legacy | Rich | 权重 |
|------|--------|------|------|
| 角色一致性 | ? | ? | 25% |
| 洞察深度 | ? | ? | 25% |
| 可操作性 | ? | ? | 20% |
| 独特视角 | ? | ? | 15% |
| 回复结构 | ? | ? | 15% |

## 测试方案

### A/B测试设计
1. 相同问题，两个架构分别生成回复
2. 盲评：让评审不知道是哪个架构
3. 按上述5个维度评分
4. 计算总分对比

### 测试问题示例
1. "Should I hire a CTO for my startup?"
2. "Should we pivot or persist?"
3. "How should we handle a difficult co-founder?"
4. "What's the best way to scale our team?"

### 样本量
每个架构至少10个不同问题，每个问题2-3个不同角色回复

## 假设验证

### 假设1: Rich架构提升角色一致性
**验证方法**: A/B测试，对比评分
**预期**: Rich架构评分显著高于Legacy

### 假设2: Rich架构增加token消耗
**验证方法**: 记录每次回复的token数
**预期**: Rich架构平均token数增加20-50%

### 假设3: Rich架构回复更可预测
**验证方法**: 多次相同问题，检查回复方差
**预期**: Rich架构方差更小

## 决策标准

如果Rich架构:
- 角色一致性提升≥20%
- 可操作性提升≥15%
- token增加≤50%

则推荐采用Rich架构。

否则，继续使用Legacy架构或混合方案。
