# 🏛️ 十五大师智慧人格知识库

## 项目概述

本项目为Michael的私董会圆桌会议创建15位大师的深度知识库，用于构建"智慧人格表示引擎"(Wisdom Person Representation Engine)。

每位大师的资料包含：
- **表达萃取**：如何模仿该人物的声音、语调、表达方式
- **生平背景**：完整的人生故事和形成性经历
- **核心哲学**：价值观、世界观、人生观的系统梳理
- **方法论**：他们分析问题、解决问题的独特方式
- **名言集锦**：30+条经过验证的经典语录
- **案例研究**：真实问题及他们如何解决

---

## 十五大师完整名单

### 东方智慧 (4位)

| # | 大师 | 核心领域 | 文档大小 |
|---|------|---------|---------|
| 01 | **Bruce Lee** (李小龙) | 截拳道、Be Water | 24K |
| 02 | **Laozi** (老子) | 道法自然、无为而无不为 | 57K |
| 03 | **Huineng** (六祖慧能) | 直指人心、顿悟 | 18K |
| 04 | **Wang Yangming** (王阳明) | 知行合一、致良知 | 15K |

### 系统与哲学 (3位)

| # | 大师 | 核心领域 | 文档大小 |
|---|------|---------|---------|
| 05 | **Qian Xuesen** (钱学森) | 系统科学、开放复杂巨系统 | 7.6K |
| 06 | **Otto Scharmer** | Theory U、涌现 | 6.3K |
| 07 | **Albert Einstein** | 思想实验、相对论思维 | 2.0K |

### 现代创新与创业 (8位)

| # | 大师 | 核心领域 | 文档大小 |
|---|------|---------|---------|
| 08 | **Steve Jobs** | 产品愿景、专注 | 1.6K |
| 09 | **Kevin Kelly** | 技术必然性、长期思考 | 2.0K |
| 10 | **Paul Graham** | 创业、做不scale的事 | 7.1K |
| 11 | **Jeff Bezos** | Day 1、客户痴迷 | 1.2K |
| 12 | **Elon Musk** | 第一性原理、10x思考 | 1.7K |
| 13 | **Naval Ravikant** | 杠杆、特定知识 | 1.4K |
| 14 | **Charlie Munger** | 多元思维模型、逆向思考 | 1.4K |
| 15 | **a16z** | 软件吞噬世界、长期主义 | 1.5K |

**总计**: ~148KB 内容，~4300行文字

---

## 文档结构

每个`profile.md`包含以下标准章节：

1. **Persona Essence (表达萃取)**
   - 声音和语调特征
   - 关键短语和表达方式
   - 典型回应结构
   - 角色扮演指南

2. **Biography & Background**
   - 完整生平时间线
   - 形成性经历
   - 关键转折点
   - 历史背景

3. **Core Philosophy**
   - 核心哲学框架
   - 价值观体系
   - 世界观和人生观
   - 思想演变

4. **Problem-Solving Methodology**
   - 问题分析框架
   - 决策过程
   - 真实案例研究
   - 方法论总结

5. **Famous Quotes**
   - 30+条经典语录
   - 中英文对照（如适用）
   - 出处和背景

6. **Key Publications/Works**
   - 重要著作
   - 核心文章
   - 演讲和访谈

7. **Sources**
   - 参考文献
   - 传记资料
   - 学术论文

---

## 使用方法

### 1. 构建AI Agent

这些文档可用于训练或提示AI Agent，使其能够：
- 模仿特定大师的说话方式
- 从该大师的视角分析问题
- 提供符合其哲学框架的建议
- 参与模拟圆桌会议

### 2. 圆桌会议模拟

在模拟私董会时，使用对应文档来：
- 初始化15个不同的大师Agent
- 确保每个Agent保持独特的哲学框架
- 生成真实冲突而非虚假共识
- 提供Harvest Round中的深度评价

### 3. 个人学习和决策

作为个人决策支持系统：
- 查询特定大师的观点
- 比较不同大师的视角
- 获得多角度建议
- 学习不同的问题解决方法

---

## 圆桌会议架构

这些大师资料支持以下7层圆桌会议架构：

```
Layer 0: Pre-Session Config (假设翻译 + 主持人)
Layer 1: Problem Definition (NGT沉默生成 + 澄清问题)
Layer 2: Position Staking (Delphi立场陈述)
Layer 3: Conflict Extraction (识别冲突维度)
Layer 4: Structured Debate (逐冲突深度探讨)
Layer 5: Synthesis + Bayesian Update
Layer 5.5: Harvest Round (Part A/B/C/D)
Layer 6: 复盘 Capture
```

---

## 文件位置

```
experiments/fifteen-masters-profiles/
├── README.md (本文件)
├── INDEX.md (大师速查索引)
├── 01-bruce-lee/profile.md
├── 02-laozi/profile.md
├── 03-huineng/profile.md
├── 04-wang-yangming/profile.md
├── 05-qian-xuesen/profile.md
├── 06-otto-scharmer/profile.md
├── 07-albert-einstein/profile.md
├── 08-steve-jobs/profile.md
├── 09-kevin-kelly/profile.md
├── 10-paul-graham/profile.md
├── 11-jeff-bezos/profile.md
├── 12-elon-musk/profile.md
├── 13-naval-ravikant/profile.md
├── 14-charlie-munger/profile.md
└── 15-a16z/profile.md
```

---

## 数据来源

所有内容基于：
- 学术传记和历史记录
- 原始著作和文献
- 经过验证的演讲和访谈
- 权威研究资料

**注意**：东方智慧大师（老子、慧能、王阳明）的资料特别参考了学术翻译和原文，确保哲学准确性。

---

## 扩展计划

未来可以添加：
- 更详细的案例研究数据库
- 大师之间的对话记录
- 特定主题的对比分析
- 视频和音频资料链接
- 互动式查询系统

---

## 结语

> "你不是在建立教育系统，你是在养育一个人类。"
> — Otto Scharmer

这15位大师代表东西方智慧的精华，他们的思维方式将帮助Michael在复杂决策中获得深度洞察。

---

*创建时间: 2026年4月9日*  
*创建者: Kimi Code*  
*用途: 智慧人格表示引擎*
