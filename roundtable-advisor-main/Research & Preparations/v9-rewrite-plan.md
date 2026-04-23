# 参谋 v9 重写计划

## 目标
基于原始设计文档（UI-DESIGN-DOC、facilitation-architecture、flow-diagram），从零开始重写，完全实现：
1. 纯黑白极简视觉（V7风格）
2. 7层 facilitation 架构
3. 5种模式系统（step/profile/speech/wiki/status/lobby）
4. 清晰的API接口预留（便于后端对接）

## 技术选型
- **格式**: 单HTML文件（便于部署和迭代）
- **CSS**: 嵌入式，纯黑白配色
- **JS**: 模块化组织（单文件内）
- **API**: 单独 `api-client.js` 文件

## Agent 分工

### 1️⃣ 架构师Agent (Orchestrator)
负责：
- 与Owner直接对话
- 拆解任务
- 审核对齐
- 最终组装

### 2️⃣ UI设计Agent
输入：
- V7 app-mockup-v7.html（视觉参考）
- UI-DESIGN-DOC.md（设计原则）

输出：
```
css/
├── design-system.css    # 变量、颜色、字体
├── layout.css           # 左右分栏布局
├── ring-layout.css      # 星环布局
├── table-layout.css     # 圆桌布局
├── right-panel.css      # 右面板模式系统
├── components.css       # 按钮、卡片、气泡等
└── animations.css       # 呼吸、涟漪等动画
```

### 3️⃣ 逻辑层Agent
输入：
- 整体架构设计
- API接口定义

输出：
```
js/
├── state.js             # 全局状态管理
├── event-bus.js         # 事件系统
├── mode-system.js       # 5种模式切换
├── ui-controller.js     # UI交互控制
└── session-manager.js   # Session生命周期
```

### 4️⃣ 数据层Agent
输入：
- roundtable-facilitation-architecture.md

输出：
```
js/data/
├── personas.js          # 12位幕僚完整档案
├── phases.js            # 7层流程定义
└── templates.js         # 提示词模板
```

### 5️⃣ 流程控制Agent（核心）
输入：
- roundtable-flow-diagram.md（严格按照此文档）
- facilitation-architecture.md

输出：
```
js/facilitation/
├── phase-0-config.js        # Pre-Session
├── phase-1-problem.js       # 问题界定
├── phase-2-position.js      # 独立建仓
├── phase-3-conflict.js      # 冲突提炼 ⭐
├── phase-4-debate.js        # 逐冲突深度探讨
├── phase-5-synthesis.js     # 综合与收获
└── facilitator.js           # Facilitator主控
```

### 6️⃣ API接口Agent
输入：
- 前端需求
- 后端协作要求

输出：
```
api-client.js              # 与后端通信
└── types.ts (optional)    # 类型定义（如用TS）
```

## 开发流程

### Phase 1: 基础架构（1轮）
1. UI设计Agent → CSS框架
2. 逻辑层Agent → 基础状态、事件系统
3. 架构师审核 → 确保CSS类名和JS状态对齐

### Phase 2: 数据与流程（2-3轮）
1. 数据层Agent → 12位幕僚、7层定义
2. 流程控制Agent → Phase 0-2（核心流程）
3. 架构师审核 → 数据结构和流程对齐

### Phase 3: 核心功能（2-3轮）
1. 流程控制Agent → Phase 3-5（冲突、辩论、综合）
2. UI设计Agent → 右面板5种模式
3. 逻辑层Agent → 模式切换、交互
4. 架构师审核 → 功能完整性

### Phase 4: API与打磨（1-2轮）
1. API接口Agent → 接口层
2. 所有Agent → bug修复、细节打磨
3. 架构师最终组装 → v9.html

## 对齐检查点

每轮迭代必须检查：

```javascript
// 1. 数据契约检查
const StateSchema = {
  mode: 'step' | 'profile' | 'speech' | 'wiki' | 'status' | 'lobby',
  phase: 0 | 1 | 2 | 3 | 4 | 5,
  session: { ... },
  selectedPersona: string | null,
  // ...
}

// 2. CSS类名规范
// 布局: .layout-ring, .layout-table
// 模式: .mode-step, .mode-profile
// 状态: .speaking, .active, .dim, .done

// 3. 事件命名
// 'persona:click', 'mode:change', 'phase:advance'
// 'facilitator:synthesize', 'conflict:extracted'
```

## 最终交付

```
v9/
├── 参谋-v9.html          # 完整前端（单文件）
├── api-client.js         # 后端接口层
├── README-v9.md          # 使用说明
└── CHANGELOG-v9.md       # 变更日志
```

## 时间预估
- Phase 1: 1轮
- Phase 2: 2-3轮  
- Phase 3: 2-3轮
- Phase 4: 1-2轮

总计：6-9轮迭代

## 你的决策点

1. **是否确认此方案？**
2. **是否需要我先作为架构师Agent开始Phase 1？**
3. **是否有特定的优先级？**（如先只做Phase 0-2的可运行原型）
