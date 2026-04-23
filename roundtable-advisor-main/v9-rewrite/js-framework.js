/**
 * Roundtable Advisor v9 - JavaScript Framework
 * 逻辑层核心：状态管理、事件总线、模式系统、UI控制器、Session管理器
 * 
 * @module RoundtableAdvisor
 * @version 9.0.0
 * @author Logic Layer Agent
 */

// ============================================
// 1. 事件总线 (Event Bus)
// ============================================

/**
 * 发布订阅模式的事件总线
 * 用于组件间解耦通信
 * @class EventBus
 */
class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.events = new Map();
    /** @type {Map<string, any>} */
    this.onceEvents = new Map();
  }

  /**
   * 订阅事件
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消订阅函数
   */
  on(event, callback) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event).add(callback);
    
    // 返回取消订阅函数
    return () => this.off(event, callback);
  }

  /**
   * 一次性订阅事件
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  once(event, callback) {
    const wrapper = (data) => {
      callback(data);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  /**
   * 取消订阅事件
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  off(event, callback) {
    if (this.events.has(event)) {
      this.events.get(event).delete(callback);
    }
  }

  /**
   * 发布事件
   * @param {string} event - 事件名称
   * @param {*} data - 传递数据
   */
  emit(event, data) {
    if (this.events.has(event)) {
      this.events.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[EventBus] Error in event "${event}":`, error);
        }
      });
    }
  }

  /**
   * 清除所有订阅
   */
  clear() {
    this.events.clear();
  }

  /**
   * 获取当前订阅数量
   * @returns {number}
   */
  getSubscriberCount() {
    let count = 0;
    this.events.forEach(subscribers => count += subscribers.size);
    return count;
  }
}

// ============================================
// 2. 状态管理 (State Management)
// ============================================

/**
 * 全局应用状态管理器
 * 实现单向数据流，支持持久化和状态追踪
 * @class StateManager
 */
class StateManager {
  constructor() {
    // 状态定义
    this.state = {
      // 全局模式: lobby | step | profile | speech | wiki | status
      mode: 'lobby',
      
      // Session生命周期状态
      session: {
        id: null,
        status: 'idle', // 'idle' | 'config' | 'running' | 'completed'
        phase: 0, // 0-6: 0=Pre-Session, 1=Problem, 2=Position, 3=Conflict, 4=Debate, 5=Synthesis, 6=Summary
        step: null, // 当前子步骤标识
        startTime: null,
        endTime: null,
      },
      
      // 用户选择
      selections: {
        project: null, // 当前选中的project ID
        round: null, // 当前选中的round ID
        persona: null, // 当前查看/交互的幕僚ID
        conflict: null, // 当前冲突维度ID
      },
      
      // 运行时数据
      data: {
        personas: [], // 12位幕僚数据
        rounds: [], // 当前project的所有round
        conflicts: [], // 提取的冲突维度
        speeches: [], // 本轮发言数据
        wiki: '', // 会议纪要内容
        synthesis: null, // 综合决策结果
      },
      
      // UI状态
      ui: {
        layout: 'ring', // 'ring' | 'table'
        panelOpen: true,
        dimTrackerVisible: false,
        activeTab: 'main',
        notifications: [],
      }
    };

    // 事件总线实例
    this.eventBus = new EventBus();
    
    // 历史状态栈（支持撤销/重做）
    this.history = [];
    this.historyIndex = -1;
    this.maxHistorySize = 50;
    
    // 持久化配置
    this.storageKey = 'roundtable_advisor_v9_state';
    this.autoSave = true;
    
    // 初始化
    this._init();
  }

  /**
   * 初始化：从localStorage恢复状态
   * @private
   */
  _init() {
    const saved = localStorage.getItem(this.storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.state = this._mergeDeep(this.state, parsed);
        console.log('[StateManager] State restored from storage');
      } catch (e) {
        console.warn('[StateManager] Failed to restore state:', e);
      }
    }
  }

  /**
   * 深合并对象
   * @private
   * @param {object} target - 目标对象
   * @param {object} source - 源对象
   * @returns {object}
   */
  _mergeDeep(target, source) {
    const output = Object.assign({}, target);
    if (this._isObject(target) && this._isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this._isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this._mergeDeep(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }

  /**
   * 检查是否为对象
   * @private
   * @param {*} item
   * @returns {boolean}
   */
  _isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * 保存历史记录
   * @private
   */
  _saveHistory() {
    // 移除当前索引之后的历史
    this.history = this.history.slice(0, this.historyIndex + 1);
    
    // 添加新状态
    this.history.push(JSON.parse(JSON.stringify(this.state)));
    
    // 限制历史大小
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  /**
   * 持久化到localStorage
   * @private
   */
  _persist() {
    if (this.autoSave) {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    }
  }

  /**
   * 获取完整状态或指定路径的状态
   * @param {string} [path] - 状态路径，如 'session.phase'
   * @returns {*}
   */
  get(path = null) {
    if (!path) return JSON.parse(JSON.stringify(this.state));
    
    const keys = path.split('.');
    let result = this.state;
    for (const key of keys) {
      if (result === null || result === undefined) return undefined;
      result = result[key];
    }
    return result;
  }

  /**
   * 设置状态值
   * @param {string} path - 状态路径，如 'session.phase'
   * @param {*} value - 新值
   * @param {object} [options] - 选项
   * @param {boolean} [options.silent=false] - 是否静默更新（不触发事件）
   * @param {boolean} [options.skipHistory=false] - 是否跳过历史记录
   */
  set(path, value, options = {}) {
    const { silent = false, skipHistory = false } = options;
    
    // 保存历史
    if (!skipHistory) {
      this._saveHistory();
    }
    
    // 设置值
    const keys = path.split('.');
    let target = this.state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in target)) {
        target[keys[i]] = {};
      }
      target = target[keys[i]];
    }
    
    const oldValue = target[keys[keys.length - 1]];
    target[keys[keys.length - 1]] = value;
    
    // 持久化
    this._persist();
    
    // 触发事件
    if (!silent) {
      this.eventBus.emit('state:change', { path, value, oldValue });
      this.eventBus.emit(`state:change:${path}`, { value, oldValue });
    }
  }

  /**
   * 批量更新状态
   * @param {object} updates - 更新对象，键为路径，值为新值
   * @param {object} [options] - 选项
   */
  batch(updates, options = {}) {
    this._saveHistory();
    
    Object.entries(updates).forEach(([path, value]) => {
      this.set(path, value, { ...options, skipHistory: true });
    });
    
    this.eventBus.emit('state:batch', updates);
  }

  /**
   * 撤销上一步操作
   * @returns {boolean}
   */
  undo() {
    if (this.historyIndex <= 0) return false;
    
    this.historyIndex--;
    this.state = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
    this._persist();
    this.eventBus.emit('state:undo', this.state);
    return true;
  }

  /**
   * 重做下一步操作
   * @returns {boolean}
   */
  redo() {
    if (this.historyIndex >= this.history.length - 1) return false;
    
    this.historyIndex++;
    this.state = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
    this._persist();
    this.eventBus.emit('state:redo', this.state);
    return true;
  }

  /**
   * 重置状态到初始值
   * @param {string} [path] - 可选：仅重置指定路径
   */
  reset(path = null) {
    this._saveHistory();
    
    if (!path) {
      // 完全重置
      this.state = new StateManager().state;
    } else {
      // 重置特定路径（简化为设为null或空值）
      this.set(path, null);
    }
    
    this._persist();
    this.eventBus.emit('state:reset', path);
  }

  /**
   * 导出状态为JSON
   * @returns {string}
   */
  export() {
    return JSON.stringify(this.state, null, 2);
  }

  /**
   * 导入状态
   * @param {string} json - JSON字符串
   */
  import(json) {
    this._saveHistory();
    try {
      const parsed = JSON.parse(json);
      this.state = this._mergeDeep(this.state, parsed);
      this._persist();
      this.eventBus.emit('state:import', this.state);
    } catch (e) {
      console.error('[StateManager] Import failed:', e);
    }
  }

  /**
   * 订阅状态变化
   * @param {string} path - 状态路径
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消订阅函数
   */
  subscribe(path, callback) {
    return this.eventBus.on(`state:change:${path}`, callback);
  }

  /**
   * 清除持久化数据
   */
  clearStorage() {
    localStorage.removeItem(this.storageKey);
    this.history = [];
    this.historyIndex = -1;
  }
}

// ============================================
// 3. 模式系统 (Mode System)
// ============================================

/**
 * 模式系统：管理5种核心模式的切换
 * - lobby: 大厅/入口
 * - step: Facilitation流程步骤
 * - profile: 幕僚档案视图
 * - speech: 发言/对话视图
 * - wiki: 会议纪要视图
 * - status: 状态/统计视图
 * @class ModeSystem
 */
class ModeSystem {
  /**
   * @param {StateManager} stateManager - 状态管理器实例
   */
  constructor(stateManager) {
    this.state = stateManager;
    
    // 模式配置
    this.modeConfig = {
      lobby: {
        name: '大厅',
        description: '项目选择和Session入口',
        allowBack: false,
        sidebar: false,
      },
      step: {
        name: '流程',
        description: 'Facilitation主流程',
        allowBack: true,
        sidebar: true,
      },
      profile: {
        name: '档案',
        description: '幕僚详情查看',
        allowBack: true,
        sidebar: false,
      },
      speech: {
        name: '发言',
        description: '幕僚对话视图',
        allowBack: true,
        sidebar: true,
      },
      wiki: {
        name: '纪要',
        description: '会议纪要查看',
        allowBack: true,
        sidebar: true,
      },
      status: {
        name: '状态',
        description: 'Session状态统计',
        allowBack: true,
        sidebar: true,
      },
    };
    
    // 模式栈（支持返回）
    this.modeStack = [];
    this.maxStackSize = 10;
  }

  /**
   * 获取当前模式
   * @returns {string}
   */
  get currentMode() {
    return this.state.get('mode');
  }

  /**
   * 获取当前模式配置
   * @returns {object}
   */
  get currentConfig() {
    return this.modeConfig[this.currentMode];
  }

  /**
   * 切换模式
   * @param {string} mode - 目标模式
   * @param {object} [context] - 切换上下文数据
   * @param {boolean} [context.pushToStack=true] - 是否压入返回栈
   * @param {*} [context.data] - 附加数据
   * @returns {boolean}
   */
  toggleMode(mode, context = {}) {
    const { pushToStack = true, data = null } = context;
    
    // 验证模式
    if (!this.modeConfig[mode]) {
      console.error(`[ModeSystem] Unknown mode: ${mode}`);
      return false;
    }
    
    const previousMode = this.currentMode;
    
    // 相同模式不处理
    if (previousMode === mode) return true;
    
    // 压入返回栈
    if (pushToStack) {
      this.modeStack.push({
        mode: previousMode,
        timestamp: Date.now(),
      });
      // 限制栈大小
      if (this.modeStack.length > this.maxStackSize) {
        this.modeStack.shift();
      }
    }
    
    // 更新状态
    this.state.set('mode', mode);
    
    // 触发事件
    this.state.eventBus.emit('mode:change', {
      from: previousMode,
      to: mode,
      data,
      canGoBack: this.canGoBack(),
    });
    
    console.log(`[ModeSystem] Mode changed: ${previousMode} -> ${mode}`);
    return true;
  }

  /**
   * 返回上一个模式
   * @returns {boolean}
   */
  goBack() {
    if (!this.canGoBack()) return false;
    
    const previous = this.modeStack.pop();
    const currentMode = this.currentMode;
    
    // 直接设置模式，不再压栈
    this.state.set('mode', previous.mode);
    
    this.state.eventBus.emit('mode:back', {
      from: currentMode,
      to: previous.mode,
      canGoBack: this.canGoBack(),
    });
    
    return true;
  }

  /**
   * 返回step模式（主流程）
   * @returns {boolean}
   */
  backToStep() {
    if (this.currentMode === 'step') return true;
    
    // 清空模式栈
    this.modeStack = [];
    
    this.state.set('mode', 'step');
    this.state.eventBus.emit('mode:change', {
      from: this.currentMode,
      to: 'step',
      data: { force: true },
      canGoBack: false,
    });
    
    return true;
  }

  /**
   * 检查是否可以返回
   * @returns {boolean}
   */
  canGoBack() {
    return this.modeStack.length > 0;
  }

  /**
   * 获取模式栈
   * @returns {Array<{mode: string, timestamp: number}>}
   */
  getStack() {
    return [...this.modeStack];
  }

  /**
   * 清空模式栈
   */
  clearStack() {
    this.modeStack = [];
  }
}

// ============================================
// 4. Session管理器 (Session Manager)
// ============================================

/**
 * Session管理器：管理完整的Facilitation生命周期
 * 7层流程：Pre-Session → Problem → Position → Conflict → Debate → Synthesis → Summary
 * @class SessionManager
 */
class SessionManager {
  /**
   * @param {StateManager} stateManager - 状态管理器实例
   */
  constructor(stateManager) {
    this.state = stateManager;
    
    // 阶段定义
    this.phases = [
      { id: 0, name: 'Pre-Session', key: 'pre', description: 'Session准备' },
      { id: 1, name: 'Problem', key: 'problem', description: '问题分析' },
      { id: 2, name: 'Position', key: 'position', description: '立场阐述' },
      { id: 3, name: 'Conflict', key: 'conflict', description: '冲突识别' },
      { id: 4, name: 'Debate', key: 'debate', description: '深度辩论' },
      { id: 5, name: 'Synthesis', key: 'synthesis', description: '综合决策' },
      { id: 6, name: 'Summary', key: 'summary', description: '会议纪要' },
    ];
    
    // 各阶段步骤配置
    this.phaseSteps = {
      0: ['select_project', 'select_round', 'config_personas', 'confirm'],
      1: ['introduce_problem', 'clarify_question', 'confirm_problem'],
      2: ['initialize_positions', 'collect_positions', 'analyze_positions'],
      3: ['identify_conflicts', 'map_tensions', 'select_focus'],
      4: ['round_1', 'round_2', 'round_3', 'round_4'],
      5: ['review_insights', 'build_synthesis', 'final_decision'],
      6: ['generate_wiki', 'review_wiki', 'export_wiki'],
    };
    
    // 自动保存计时器
    this.autoSaveInterval = null;
  }

  /**
   * 获取当前阶段信息
   * @returns {object}
   */
  get currentPhase() {
    const phaseId = this.state.get('session.phase');
    return this.phases.find(p => p.id === phaseId);
  }

  /**
   * 获取当前步骤
   * @returns {string|null}
   */
  get currentStep() {
    return this.state.get('session.step');
  }

  /**
   * 获取Session状态
   * @returns {string}
   */
  get sessionStatus() {
    return this.state.get('session.status');
  }

  /**
   * 开始新Session
   * @param {object} config - Session配置
   * @param {string} config.projectId - 项目ID
   * @param {string} [config.roundId] - Round ID（可选，新建时会创建）
   * @param {Array<string>} [config.personaIds] - 启用的幕僚ID列表
   * @returns {object} Session信息
   */
  startSession(config) {
    const { projectId, roundId = null, personaIds = [] } = config;
    
    // 生成Session ID
    const sessionId = this._generateSessionId();
    
    // 初始化Session状态
    this.state.batch({
      'session.id': sessionId,
      'session.status': 'running',
      'session.phase': 0,
      'session.step': this.phaseSteps[0][0],
      'session.startTime': Date.now(),
      'session.endTime': null,
      'selections.project': projectId,
      'selections.round': roundId,
      'mode': 'step',
    }, { silent: true });
    
    // 如果提供了personaIds，设置选择的幕僚
    if (personaIds.length > 0) {
      // 这里应该过滤data.personas
      this.state.set('selections.personas', personaIds, { silent: true });
    }
    
    // 启动自动保存
    this._startAutoSave();
    
    // 触发事件
    this.state.eventBus.emit('session:start', {
      sessionId,
      projectId,
      roundId,
      phase: 0,
      step: this.phaseSteps[0][0],
    });
    
    console.log(`[SessionManager] Session started: ${sessionId}`);
    
    return {
      id: sessionId,
      projectId,
      roundId,
      phase: 0,
      step: this.phaseSteps[0][0],
    };
  }

  /**
   * 结束Session
   * @param {object} [options] - 选项
   * @param {boolean} [options.save=true] - 是否保存结果
   * @param {string} [options.reason] - 结束原因
   * @returns {object} Session总结
   */
  endSession(options = {}) {
    const { save = true, reason = 'completed' } = options;
    
    if (this.sessionStatus === 'idle') {
      console.warn('[SessionManager] No active session to end');
      return null;
    }
    
    const sessionId = this.state.get('session.id');
    const endTime = Date.now();
    const startTime = this.state.get('session.startTime');
    
    // 停止自动保存
    this._stopAutoSave();
    
    // 更新状态
    this.state.batch({
      'session.status': 'completed',
      'session.endTime': endTime,
      'session.phase': 6, // Summary阶段
      'mode': 'lobby',
    }, { silent: true });
    
    // 生成总结
    const summary = {
      sessionId,
      duration: endTime - startTime,
      finalPhase: this.state.get('session.phase'),
      projectId: this.state.get('selections.project'),
      roundId: this.state.get('selections.round'),
      wiki: this.state.get('data.wiki'),
      synthesis: this.state.get('data.synthesis'),
      reason,
    };
    
    // 保存到历史
    if (save) {
      this._saveToHistory(summary);
    }
    
    // 触发事件
    this.state.eventBus.emit('session:end', summary);
    
    console.log(`[SessionManager] Session ended: ${sessionId}, reason: ${reason}`);
    
    return summary;
  }

  /**
   * 推进到下一阶段
   * @returns {boolean}
   */
  advancePhase() {
    const currentPhase = this.state.get('session.phase');
    const nextPhase = currentPhase + 1;
    
    if (nextPhase >= this.phases.length) {
      console.warn('[SessionManager] Already at final phase');
      return false;
    }
    
    const nextStep = this.phaseSteps[nextPhase][0];
    
    this.state.batch({
      'session.phase': nextPhase,
      'session.step': nextStep,
    });
    
    this.state.eventBus.emit('phase:advance', {
      from: currentPhase,
      to: nextPhase,
      step: nextStep,
      phaseName: this.phases[nextPhase].name,
    });
    
    console.log(`[SessionManager] Phase advanced: ${currentPhase} -> ${nextPhase}`);
    return true;
  }

  /**
   * 推进到下一步骤
   * @returns {boolean}
   */
  advanceStep() {
    const currentPhase = this.state.get('session.phase');
    const currentStep = this.state.get('session.step');
    const steps = this.phaseSteps[currentPhase];
    
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex === -1 || currentIndex >= steps.length - 1) {
      // 当前阶段步骤完成，尝试推进阶段
      return this.advancePhase();
    }
    
    const nextStep = steps[currentIndex + 1];
    this.state.set('session.step', nextStep);
    
    this.state.eventBus.emit('step:advance', {
      phase: currentPhase,
      from: currentStep,
      to: nextStep,
      stepIndex: currentIndex + 1,
      totalSteps: steps.length,
    });
    
    return true;
  }

  /**
   * 跳转到指定阶段
   * @param {number} phaseId - 阶段ID (0-6)
   * @param {string} [step] - 可选：指定步骤
   * @returns {boolean}
   */
  jumpToPhase(phaseId, step = null) {
    if (phaseId < 0 || phaseId >= this.phases.length) {
      console.error(`[SessionManager] Invalid phase ID: ${phaseId}`);
      return false;
    }
    
    const targetStep = step || this.phaseSteps[phaseId][0];
    const currentPhase = this.state.get('session.phase');
    
    this.state.batch({
      'session.phase': phaseId,
      'session.step': targetStep,
    });
    
    this.state.eventBus.emit('phase:jump', {
      from: currentPhase,
      to: phaseId,
      step: targetStep,
    });
    
    return true;
  }

  /**
   * 暂停Session
   */
  pauseSession() {
    if (this.sessionStatus !== 'running') return false;
    
    this.state.set('session.status', 'paused');
    this._stopAutoSave();
    
    this.state.eventBus.emit('session:pause', {
      sessionId: this.state.get('session.id'),
      timestamp: Date.now(),
    });
    
    return true;
  }

  /**
   * 恢复Session
   */
  resumeSession() {
    if (this.sessionStatus !== 'paused') return false;
    
    this.state.set('session.status', 'running');
    this._startAutoSave();
    
    this.state.eventBus.emit('session:resume', {
      sessionId: this.state.get('session.id'),
      timestamp: Date.now(),
    });
    
    return true;
  }

  /**
   * 保存进度
   * @returns {object} 保存的快照
   */
  saveProgress() {
    const snapshot = {
      sessionId: this.state.get('session.id'),
      timestamp: Date.now(),
      state: this.state.get(),
    };
    
    // 保存到localStorage
    const key = `roundtable_snapshot_${snapshot.sessionId}`;
    localStorage.setItem(key, JSON.stringify(snapshot));
    
    // 同时保存到快照列表
    const snapshots = this._getSnapshotsList();
    snapshots.push({
      sessionId: snapshot.sessionId,
      timestamp: snapshot.timestamp,
      phase: this.state.get('session.phase'),
    });
    localStorage.setItem('roundtable_snapshots', JSON.stringify(snapshots.slice(-20))); // 保留最近20个
    
    this.state.eventBus.emit('session:save', snapshot);
    
    return snapshot;
  }

  /**
   * 加载Session快照
   * @param {string} sessionId - Session ID
   * @returns {boolean}
   */
  loadSnapshot(sessionId) {
    const key = `roundtable_snapshot_${sessionId}`;
    const saved = localStorage.getItem(key);
    
    if (!saved) {
      console.warn(`[SessionManager] Snapshot not found: ${sessionId}`);
      return false;
    }
    
    try {
      const snapshot = JSON.parse(saved);
      this.state.import(JSON.stringify(snapshot.state));
      
      this.state.eventBus.emit('session:load', snapshot);
      return true;
    } catch (e) {
      console.error('[SessionManager] Failed to load snapshot:', e);
      return false;
    }
  }

  /**
   * 获取所有可用快照
   * @returns {Array<object>}
   */
  getAvailableSnapshots() {
    return this._getSnapshotsList().sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 生成Session ID
   * @private
   * @returns {string}
   */
  _generateSessionId() {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 启动自动保存
   * @private
   */
  _startAutoSave() {
    if (this.autoSaveInterval) return;
    
    this.autoSaveInterval = setInterval(() => {
      this.saveProgress();
      console.log('[SessionManager] Auto-saved progress');
    }, 30000); // 30秒自动保存
  }

  /**
   * 停止自动保存
   * @private
   */
  _stopAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  /**
   * 保存到历史记录
   * @private
   */
  _saveToHistory(summary) {
    const history = JSON.parse(localStorage.getItem('roundtable_history') || '[]');
    history.push(summary);
    localStorage.setItem('roundtable_history', JSON.stringify(history.slice(-50)));
  }

  /**
   * 获取快照列表
   * @private
   */
  _getSnapshotsList() {
    return JSON.parse(localStorage.getItem('roundtable_snapshots') || '[]');
  }
}

// ============================================
// 5. UI控制器 (UI Controller)
// ============================================

/**
 * UI控制器：处理用户交互和UI状态管理
 * @class UIController
 */
class UIController {
  /**
   * @param {StateManager} stateManager - 状态管理器实例
   * @param {ModeSystem} modeSystem - 模式系统实例
   */
  constructor(stateManager, modeSystem) {
    this.state = stateManager;
    this.mode = modeSystem;
    
    // 交互状态
    this.interactionState = {
      isDragging: false,
      dragTarget: null,
      lastClickTime: 0,
      doubleClickThreshold: 300,
    };
    
    // 回调注册表
    this.callbacks = new Map();
    
    // 初始化事件监听
    this._initEventListeners();
  }

  /**
   * 初始化全局事件监听
   * @private
   */
  _initEventListeners() {
    // 监听状态变化
    this.state.eventBus.on('mode:change', (data) => {
      this._onModeChange(data);
    });
    
    this.state.eventBus.on('phase:advance', (data) => {
      this._onPhaseChange(data);
    });
  }

  /**
   * 选择Project
   * @param {string} projectId - 项目ID
   * @param {object} [projectData] - 项目数据
   */
  selectProject(projectId, projectData = null) {
    const previousProject = this.state.get('selections.project');
    
    this.state.batch({
      'selections.project': projectId,
      'selections.round': null, // 重置round选择
    });
    
    // 如果提供了项目数据，更新data.rounds
    if (projectData && projectData.rounds) {
      this.state.set('data.rounds', projectData.rounds);
    }
    
    this.state.eventBus.emit('project:select', {
      projectId,
      previousProject,
    });
  }

  /**
   * 选择Round
   * @param {string} roundId - Round ID
   * @param {object} [roundData] - Round数据
   */
  selectRound(roundId, roundData = null) {
    this.state.set('selections.round', roundId);
    
    if (roundData) {
      this.state.batch({
        'data.personas': roundData.personas || [],
        'data.speeches': roundData.speeches || [],
        'data.wiki': roundData.wiki || '',
      });
    }
    
    this.state.eventBus.emit('round:select', { roundId });
  }

  /**
   * 选择幕僚
   * @param {string} personaId - 幕僚ID
   * @param {object} [options] - 选项
   * @param {boolean} [options.openProfile=true] - 是否打开档案视图
   */
  selectPersona(personaId, options = {}) {
    const { openProfile = true } = options;
    
    this.state.set('selections.persona', personaId);
    
    if (openProfile) {
      this.mode.toggleMode('profile', { data: { personaId } });
    }
    
    this.state.eventBus.emit('persona:select', { personaId });
  }

  /**
   * 选择冲突维度
   * @param {string} conflictId - 冲突维度ID
   */
  selectConflict(conflictId) {
    this.state.set('selections.conflict', conflictId);
    this.state.eventBus.emit('conflict:select', { conflictId });
  }

  /**
   * 切换布局
   * @param {'ring' | 'table'} layout - 布局类型
   */
  toggleLayout(layout) {
    if (!['ring', 'table'].includes(layout)) {
      console.error(`[UIController] Invalid layout: ${layout}`);
      return;
    }
    
    const previousLayout = this.state.get('ui.layout');
    this.state.set('ui.layout', layout);
    
    this.state.eventBus.emit('layout:change', {
      from: previousLayout,
      to: layout,
    });
  }

  /**
   * 切换侧边面板
   * @param {boolean} [forceState] - 强制设置状态，不传则切换
   * @returns {boolean} 新的面板状态
   */
  togglePanel(forceState = null) {
    const current = this.state.get('ui.panelOpen');
    const newState = forceState !== null ? forceState : !current;
    
    this.state.set('ui.panelOpen', newState);
    
    this.state.eventBus.emit('panel:toggle', {
      isOpen: newState,
      previous: current,
    });
    
    return newState;
  }

  /**
   * 显示/隐藏维度追踪器
   * @param {boolean} [visible] - 是否可见，不传则切换
   * @returns {boolean}
   */
  toggleDimTracker(visible = null) {
    const current = this.state.get('ui.dimTrackerVisible');
    const newState = visible !== null ? visible : !current;
    
    this.state.set('ui.dimTrackerVisible', newState);
    
    this.state.eventBus.emit('dimtracker:toggle', {
      visible: newState,
    });
    
    return newState;
  }

  /**
   * 打开wiki视图
   * @param {string} [section] - 可选：跳转到特定章节
   */
  openWiki(section = null) {
    this.mode.toggleMode('wiki', { data: { section } });
  }

  /**
   * 打开status视图
   */
  openStatus() {
    this.mode.toggleMode('status');
  }

  /**
   * 开始发言交互
   * @param {string} personaId - 幕僚ID
   * @param {object} [context] - 发言上下文
   */
  startSpeech(personaId, context = {}) {
    this.state.set('selections.persona', personaId);
    this.mode.toggleMode('speech', { data: { personaId, context } });
  }

  /**
   * 完成发言
   * @param {object} speechData - 发言数据
   * @param {string} speechData.personaId - 幕僚ID
   * @param {string} speechData.content - 发言内容
   * @param {string} speechData.type - 发言类型
   */
  completeSpeech(speechData) {
    const speeches = this.state.get('data.speeches');
    const newSpeech = {
      ...speechData,
      id: `speech_${Date.now()}`,
      timestamp: Date.now(),
    };
    
    this.state.set('data.speeches', [...speeches, newSpeech]);
    
    this.state.eventBus.emit('speech:complete', newSpeech);
    
    // 返回step模式
    this.mode.backToStep();
  }

  /**
   * 添加通知
   * @param {object} notification - 通知对象
   * @param {string} notification.type - 类型: 'info' | 'success' | 'warning' | 'error'
   * @param {string} notification.message - 消息内容
   * @param {number} [notification.duration=3000] - 显示时长(ms)
   */
  addNotification(notification) {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const notif = {
      id,
      type: notification.type || 'info',
      message: notification.message,
      duration: notification.duration || 3000,
      timestamp: Date.now(),
    };
    
    const notifications = this.state.get('ui.notifications');
    this.state.set('ui.notifications', [...notifications, notif]);
    
    // 自动移除
    setTimeout(() => {
      this.removeNotification(id);
    }, notif.duration);
    
    return id;
  }

  /**
   * 移除通知
   * @param {string} id - 通知ID
   */
  removeNotification(id) {
    const notifications = this.state.get('ui.notifications');
    this.state.set('ui.notifications', notifications.filter(n => n.id !== id));
  }

  /**
   * 注册UI回调
   * @param {string} action - 动作名称
   * @param {Function} callback - 回调函数
   */
  registerCallback(action, callback) {
    this.callbacks.set(action, callback);
  }

  /**
   * 执行UI回调
   * @param {string} action - 动作名称
   * @param {*} data - 传递数据
   * @returns {*}
   */
  executeCallback(action, data = null) {
    const callback = this.callbacks.get(action);
    if (callback) {
      return callback(data);
    }
    console.warn(`[UIController] No callback registered for: ${action}`);
    return null;
  }

  /**
   * 处理模式变化
   * @private
   */
  _onModeChange(data) {
    console.log(`[UIController] Mode changed to ${data.to}`);
    // 可以在这里添加通用的UI调整逻辑
  }

  /**
   * 处理阶段变化
   * @private
   */
  _onPhaseChange(data) {
    this.addNotification({
      type: 'info',
      message: `进入${data.phaseName}阶段`,
      duration: 2000,
    });
  }
}

// ============================================
// 6. 数据服务 (Data Service)
// ============================================

/**
 * 数据服务：处理数据加载、转换和Mock数据
 * @class DataService
 */
class DataService {
  constructor(stateManager) {
    this.state = stateManager;
    
    // Mock数据仓库
    this.mockData = {
      projects: [],
      personas: [],
      conflicts: [],
    };
  }

  /**
   * 生成Mock项目数据
   * @param {number} count - 项目数量
   * @returns {Array<object>}
   */
  generateMockProjects(count = 3) {
    const projects = [];
    for (let i = 0; i < count; i++) {
      projects.push({
        id: `proj_${i + 1}`,
        name: `项目 ${String.fromCharCode(65 + i)}`,
        description: `这是第 ${i + 1} 个示例项目的描述`,
        status: i === 0 ? 'active' : 'archived',
        createdAt: Date.now() - (i * 86400000),
        rounds: this.generateMockRounds(2 + i),
      });
    }
    this.mockData.projects = projects;
    return projects;
  }

  /**
   * 生成Mock Round数据
   * @param {number} count - Round数量
   * @returns {Array<object>}
   */
  generateMockRounds(count = 3) {
    const rounds = [];
    for (let i = 0; i < count; i++) {
      rounds.push({
        id: `round_${i + 1}`,
        name: `Round ${i + 1}`,
        topic: `讨论主题 ${i + 1}`,
        status: i === count - 1 ? 'active' : 'completed',
        personas: this.generateMockPersonas(12),
        speeches: [],
        wiki: '',
      });
    }
    return rounds;
  }

  /**
   * 生成Mock幕僚数据
   * @param {number} count - 幕僚数量
   * @returns {Array<object>}
   */
  generateMockPersonas(count = 12) {
    const roles = [
      { name: '战略家', style: 'analytical', color: '#4A90D9' },
      { name: '执行者', style: 'pragmatic', color: '#E74C3C' },
      { name: '创新者', style: 'creative', color: '#9B59B6' },
      { name: '协调者', style: 'diplomatic', color: '#27AE60' },
      { name: '观察者', style: 'observant', color: '#F39C12' },
      { name: '挑战者', style: 'critical', color: '#E67E22' },
      { name: '支持者', style: 'supportive', color: '#1ABC9C' },
      { name: '完美主义者', style: 'precise', color: '#3498DB' },
      { name: '探险家', style: 'adventurous', color: '#E91E63' },
      { name: '守护者', style: 'protective', color: '#795548' },
      { name: '思想家', style: 'philosophical', color: '#607D8B' },
      { name: '沟通者', style: 'communicative', color: '#00BCD4' },
    ];
    
    const personas = [];
    for (let i = 0; i < count; i++) {
      const role = roles[i % roles.length];
      personas.push({
        id: `persona_${i + 1}`,
        name: `${role.name}-${i + 1}`,
        role: role.name,
        style: role.style,
        color: role.color,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`,
        position: { x: 0, y: 0 }, // 圆环布局位置
        profile: {
          background: `这是${role.name}的背景介绍...`,
          expertise: ['领域A', '领域B', '领域C'],
          values: ['价值A', '价值B'],
        },
        stance: {
          current: null,
          history: [],
        },
      });
    }
    this.mockData.personas = personas;
    return personas;
  }

  /**
   * 生成Mock冲突维度
   * @param {number} count - 冲突维度数量
   * @returns {Array<object>}
   */
  generateMockConflicts(count = 4) {
    const dimensions = [
      { name: '短期 vs 长期', description: '短期利益与长期发展的权衡' },
      { name: '风险 vs 收益', description: '风险承受能力与预期收益的平衡' },
      { name: '个体 vs 整体', description: '个体需求与整体利益的协调' },
      { name: '传统 vs 创新', description: '传统方法与创新思维的选择' },
      { name: '效率 vs 公平', description: '效率优先与公平考虑的取舍' },
    ];
    
    const conflicts = [];
    for (let i = 0; i < count && i < dimensions.length; i++) {
      conflicts.push({
        id: `conflict_${i + 1}`,
        ...dimensions[i],
        tension: Math.random() * 100,
        positions: [],
      });
    }
    this.mockData.conflicts = conflicts;
    return conflicts;
  }

  /**
   * 加载项目列表
   * @returns {Promise<Array<object>>}
   */
  async loadProjects() {
    // 模拟API调用
    await this._simulateDelay(300);
    
    if (this.mockData.projects.length === 0) {
      this.generateMockProjects();
    }
    
    return this.mockData.projects;
  }

  /**
   * 加载项目详情
   * @param {string} projectId - 项目ID
   * @returns {Promise<object>}
   */
  async loadProject(projectId) {
    await this._simulateDelay(200);
    
    const project = this.mockData.projects.find(p => p.id === projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    
    return project;
  }

  /**
   * 加载幕僚详情
   * @param {string} personaId - 幕僚ID
   * @returns {Promise<object>}
   */
  async loadPersona(personaId) {
    await this._simulateDelay(150);
    
    const persona = this.mockData.personas.find(p => p.id === personaId);
    if (!persona) {
      throw new Error(`Persona not found: ${personaId}`);
    }
    
    return persona;
  }

  /**
   * 生成会议纪要
   * @param {object} sessionData - Session数据
   * @returns {string} Markdown格式的纪要
   */
  generateWiki(sessionData) {
    const { speeches, conflicts, synthesis } = sessionData;
    
    let wiki = `# Roundtable 会议纪要\n\n`;
    wiki += `生成时间: ${new Date().toLocaleString()}\n\n`;
    
    // 问题概述
    wiki += `## 1. 问题概述\n\n`;
    wiki += `本次讨论聚焦于...\n\n`;
    
    // 立场总结
    wiki += `## 2. 各方立场\n\n`;
    if (speeches && speeches.length > 0) {
      speeches.forEach(speech => {
        wiki += `### ${speech.personaName || '未知'}\n`;
        wiki += `${speech.content}\n\n`;
      });
    }
    
    // 冲突分析
    wiki += `## 3. 核心冲突\n\n`;
    if (conflicts && conflicts.length > 0) {
      conflicts.forEach(conflict => {
        wiki += `- **${conflict.name}**: ${conflict.description}\n`;
      });
    }
    wiki += `\n`;
    
    // 综合决策
    wiki += `## 4. 综合决策\n\n`;
    wiki += synthesis ? synthesis.summary : '待定\n';
    wiki += `\n`;
    
    // 行动项
    wiki += `## 5. 行动项\n\n`;
    wiki += `- [ ] 行动项1\n`;
    wiki += `- [ ] 行动项2\n`;
    
    return wiki;
  }

  /**
   * 模拟延迟
   * @private
   */
  _simulateDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================
// 7. 主应用类 (Application)
// ============================================

/**
 * Roundtable Advisor 主应用类
 * 整合所有模块，提供统一的API
 * @class RoundtableApp
 */
class RoundtableApp {
  constructor() {
    // 核心模块
    this.state = new StateManager();
    this.mode = new ModeSystem(this.state);
    this.session = new SessionManager(this.state);
    this.ui = new UIController(this.state, this.mode);
    this.data = new DataService(this.state);
    
    // 初始化状态
    this.isInitialized = false;
  }

  /**
   * 初始化应用
   * @returns {Promise<RoundtableApp>}
   */
  async init() {
    if (this.isInitialized) return this;
    
    console.log('[RoundtableApp] Initializing...');
    
    // 加载初始数据
    try {
      const projects = await this.data.loadProjects();
      this.state.set('data.personas', this.data.generateMockPersonas(), { silent: true });
      this.state.set('data.conflicts', this.data.generateMockConflicts(), { silent: true });
      
      console.log('[RoundtableApp] Loaded', projects.length, 'projects');
    } catch (error) {
      console.error('[RoundtableApp] Failed to load initial data:', error);
    }
    
    this.isInitialized = true;
    this.state.eventBus.emit('app:ready', { timestamp: Date.now() });
    
    console.log('[RoundtableApp] Initialized successfully');
    return this;
  }

  /**
   * 启动新Session
   * @param {object} config - Session配置
   */
  startNewSession(config) {
    if (!config.projectId) {
      throw new Error('projectId is required');
    }
    
    return this.session.startSession(config);
  }

  /**
   * 进入lobby模式
   */
  enterLobby() {
    this.mode.toggleMode('lobby');
    this.session.endSession({ save: true });
  }

  /**
   * 获取当前状态摘要
   * @returns {object}
   */
  getStatus() {
    return {
      mode: this.state.get('mode'),
      session: this.session.sessionStatus,
      phase: this.session.currentPhase,
      step: this.session.currentStep,
      canGoBack: this.mode.canGoBack(),
    };
  }

  /**
   * 全局事件监听
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消订阅函数
   */
  on(event, callback) {
    return this.state.eventBus.on(event, callback);
  }

  /**
   * 销毁应用
   */
  destroy() {
    this.session.endSession({ save: true });
    this.state.eventBus.clear();
    this.isInitialized = false;
    console.log('[RoundtableApp] Destroyed');
  }
}

// ============================================
// 8. 导出和初始化
// ============================================

// ES Module 导出
export {
  EventBus,
  StateManager,
  ModeSystem,
  SessionManager,
  UIController,
  DataService,
  RoundtableApp,
};

// 全局对象（用于浏览器环境）
if (typeof window !== 'undefined') {
  window.RoundtableAdvisor = {
    EventBus,
    StateManager,
    ModeSystem,
    SessionManager,
    UIController,
    DataService,
    RoundtableApp,
  };
  
  // 自动创建全局app实例（可选）
  window.roundtableApp = null;
  
  /**
   * 快速启动函数
   * @returns {Promise<RoundtableApp>}
   */
  window.initRoundtable = async () => {
    window.roundtableApp = new RoundtableApp();
    await window.roundtableApp.init();
    return window.roundtableApp;
  };
}

// ============================================
// 9. 使用示例和测试
// ============================================

/**
 * 完整使用示例
 */
async function exampleUsage() {
  // 创建应用实例
  const app = new RoundtableApp();
  await app.init();
  
  // 1. 监听事件
  app.on('mode:change', (data) => {
    console.log('Mode changed:', data.from, '->', data.to);
  });
  
  app.on('persona:select', (data) => {
    console.log('Selected persona:', data.personaId);
  });
  
  app.on('phase:advance', (data) => {
    console.log('Advanced to phase:', data.phaseName);
  });
  
  // 2. 选择项目并启动Session
  app.ui.selectProject('proj_1');
  
  const session = app.startNewSession({
    projectId: 'proj_1',
    roundId: 'round_1',
    personaIds: ['persona_1', 'persona_2', 'persona_3'],
  });
  
  console.log('Session started:', session);
  
  // 3. 推进流程
  app.session.advanceStep(); // 进入下一步
  app.session.advancePhase(); // 进入下一阶段
  
  // 4. 选择幕僚并打开档案
  app.ui.selectPersona('persona_1');
  
  // 5. 返回step模式
  app.mode.backToStep();
  
  // 6. 切换布局
  app.ui.toggleLayout('table');
  
  // 7. 打开wiki
  app.ui.openWiki();
  
  // 8. 生成并保存纪要
  const wiki = app.data.generateWiki({
    speeches: app.state.get('data.speeches'),
    conflicts: app.state.get('data.conflicts'),
    synthesis: app.state.get('data.synthesis'),
  });
  app.state.set('data.wiki', wiki);
  
  // 9. 结束Session
  const summary = app.session.endSession();
  console.log('Session summary:', summary);
  
  return app;
}

// 如果在Node环境运行示例
if (typeof window === 'undefined') {
  // Mock localStorage for Node environment
  global.localStorage = {
    data: new Map(),
    getItem(key) { return this.data.get(key) || null; },
    setItem(key, value) { this.data.set(key, value); },
    removeItem(key) { this.data.delete(key); },
  };
  
  // 运行示例
  exampleUsage().catch(console.error);
}

// 默认导出
export default RoundtableApp;
