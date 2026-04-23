/**
 * Roundtable Facilitation Engine v9
 * 7层流程控制核心引擎
 * 
 * 架构文档: roundtable-facilitation-architecture.md
 * 流程文档: roundtable-flow-diagram.md
 */

// ============================================================================
// MOCK DATA - 12位幕僚配置
// ============================================================================

const MOCK_PERSONAS = [
  {
    id: 'steve_jobs',
    name: 'Steve Jobs',
    archetype: '产品偏执者',
    philosophy: '用户不会知道自己想要什么，直到你展示给他们',
    redTeam: false,
    style: '犀利、追求极致、拷问本质'
  },
  {
    id: 'laozi',
    name: '老子',
    archetype: '无为智者',
    philosophy: '反者道之动，弱者道之用',
    redTeam: false,
    style: '顺势而为、不争之争、见微知著'
  },
  {
    id: 'mao_zedong',
    name: '毛泽东',
    archetype: '战略家',
    philosophy: '战略上藐视敌人，战术上重视敌人',
    redTeam: true,
    style: '斗争哲学、统一战线、集中优势'
  },
  {
    id: 'bruce_lee',
    name: 'Bruce Lee',
    archetype: '行动哲学家',
    philosophy: 'Be water, my friend',
    redTeam: false,
    style: '实用主义、自我表达、打破形式'
  },
  {
    id: 'naval',
    name: 'Naval Ravikant',
    archetype: '理性投资者',
    philosophy: '玩长期游戏，与长期的人合作',
    redTeam: false,
    style: '杠杆、复利、第一性原理'
  },
  {
    id: 'ray_dalio',
    name: 'Ray Dalio',
    archetype: '系统化思维者',
    philosophy: '极度透明 + 极度真实 = 有意义的工作和关系',
    redTeam: false,
    style: '原则驱动、痛苦+反思=进步、系统化'
  },
  {
    id: 'charlie_munger',
    name: 'Charlie Munger',
    archetype: '多元思维模型',
    philosophy: '如果我知道我会死在哪里，我就永远不去那里',
    redTeam: true,
    style: '逆向思维、心理偏见、跨学科'
  },
  {
    id: 'yuval_harari',
    name: 'Yuval Harari',
    archetype: '历史观察者',
    philosophy: '人类靠故事组织大规模合作',
    redTeam: false,
    style: '宏观叙事、叙事陷阱、长期趋势'
  },
  {
    id: 'paul_graham',
    name: 'Paul Graham',
    archetype: '创业导师',
    philosophy: '做那些不能规模化的事',
    redTeam: false,
    style: '黑客精神、做自己喜欢的事、快速迭代'
  },
  {
    id: 'simon_sinek',
    name: 'Simon Sinek',
    archetype: '使命驱动者',
    philosophy: '从为什么开始',
    redTeam: false,
    style: '黄金圈、激励vs操控、无限游戏'
  },
  {
    id: 'derek_sivers',
    name: 'Derek Sivers',
    archetype: '反主流思考者',
    philosophy: 'Hell yeah or no',
    redTeam: false,
    style: '极简主义、专注、反共识'
  },
  {
    id: 'nassim_taleb',
    name: 'Nassim Taleb',
    archetype: '反脆弱大师',
    philosophy: '风会熄灭蜡烛，却能使火堆越烧越旺',
    redTeam: true,
    style: '反脆弱、黑天鹅、Skin in the game'
  }
];

// ============================================================================
// STATE MACHINE - 阶段状态机定义
// ============================================================================

const PhaseMachine = {
  states: ['p0_config', 'p1_problem', 'p2_staking', 'p3_conflict', 'p4_debate', 'p5_synthesis', 'completed'],
  
  transitions: {
    p0_config: { next: 'p1_problem', prev: null },
    p1_problem: { next: 'p2_staking', prev: 'p0_config' },
    p2_staking: { next: 'p3_conflict', prev: 'p1_problem' },
    p3_conflict: { next: 'p4_debate', prev: 'p2_staking' },
    p4_debate: { next: 'p5_synthesis', prev: 'p3_conflict' },
    p5_synthesis: { next: 'completed', prev: 'p4_debate' },
    completed: { next: null, prev: 'p5_synthesis' }
  },
  
  getNext(phase) {
    return this.transitions[phase]?.next || null;
  },
  
  getPrev(phase) {
    return this.transitions[phase]?.prev || null;
  },
  
  isValidTransition(from, to) {
    return this.transitions[from]?.next === to || this.transitions[from]?.prev === to;
  }
};

// ============================================================================
// HYPOTHESIS TRANSLATOR - Phase 0: 困惑 → 可验证假设
// ============================================================================

class HypothesisTranslator {
  constructor() {
    this.patterns = {
      // 困惑模式识别
      decision: /(?:纠结|犹豫|不知道|该|选择|选|还是|或者)/i,
      problem: /(?:问题|困难|麻烦|卡住了|瓶颈)/i,
      anxiety: /(?:担心|害怕|焦虑|恐惧|不安)/i,
      goal: /(?:想|想要|希望|目标|达成|实现)/i
    };
  }

  /**
   * 将用户困惑翻译为可验证假设
   * @param {string} userInput - 用户的原始困惑描述
   * @returns {Object} - 翻译结果
   */
  translate(userInput) {
    console.log('\n[HypothesisTranslator] 分析用户输入...');
    
    // 分析输入类型
    const analysis = this._analyzeInput(userInput);
    
    // 生成可验证假设
    const hypothesis = this._generateHypothesis(userInput, analysis);
    
    // 识别用户的恐惧/担忧
    const fears = this._extractFears(userInput);
    
    // 判断是否需要广泛哲学探讨模式
    const needsExploration = this._needsExplorationMode(userInput, analysis);
    
    const result = {
      originalInput: userInput,
      translatedHypothesis: hypothesis,
      hypothesisType: analysis.primaryType,
      underlyingFears: fears,
      needsExploration: needsExploration,
      guidingConstraints: {
        originalConfusion: userInput,
        translatedHypothesis: hypothesis.statement,
        biggestFear: fears[0] || null,
        testable: hypothesis.testable
      }
    };
    
    console.log('[HypothesisTranslator] 翻译完成:', {
      hypothesis: hypothesis.statement.substring(0, 100) + '...',
      type: analysis.primaryType,
      needsExploration
    });
    
    return result;
  }

  _analyzeInput(input) {
    const scores = {
      decision: (input.match(/(?:纠结|犹豫|选择|选|还是|或者|vs|versus)/gi) || []).length,
      problem: (input.match(/(?:问题|困难|麻烦|卡住|瓶颈|bug|issue)/gi) || []).length,
      anxiety: (input.match(/(?:担心|害怕|焦虑|恐惧|不安|怕)/gi) || []).length,
      goal: (input.match(/(?:想|想要|希望|目标|达成|实现|成为)/gi) || []).length
    };
    
    const primaryType = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    return { scores, primaryType };
  }

  _generateHypothesis(input, analysis) {
    const templates = {
      decision: '我在测试：选择{optionA}而非{optionB}是否能更好地实现{goal}',
      problem: '我在测试：{problem}的根本原因是否是{assumption}',
      anxiety: '我在测试：我担心的{ fear }是否真的会发生，以及能否被预防',
      goal: '我在测试：通过{approach}能否在{timeframe}内达成{goal}'
    };
    
    // 简化的假设生成逻辑
    let statement = input;
    
    // 尝试提取关键要素并重构
    if (analysis.primaryType === 'decision') {
      const options = this._extractOptions(input);
      statement = `我在测试：在当前情境下，${options.join(' vs ')} 哪个选择更能实现我的核心目标`;
    } else if (analysis.primaryType === 'anxiety') {
      statement = `我在测试：我担心的最坏情况是否真的会发生，以及我是否有能力应对`;
    }
    
    return {
      statement,
      testable: !analysis.primaryType.includes('exploration'),
      primaryType: analysis.primaryType
    };
  }

  _extractOptions(input) {
    // 简单的选项提取逻辑
    const separators = /(?:还是|或者|vs|versus|vs\.|，|,|、)/i;
    const parts = input.split(separators).map(s => s.trim()).filter(s => s.length > 0);
    return parts.slice(0, 2); // 最多取两个选项
  }

  _extractFears(input) {
    const fearPatterns = [
      /(?:担心|害怕|恐惧)(?:的是|的是|的是|的是)?(.{5,30}?)(?:，|。|；|！|$)/,
      /怕(.{5,30}?)(?:会|导致|让|使)/,
      /(?:万一|如果)(.{5,30}?)(?:怎么办|发生了)/
    ];
    
    const fears = [];
    for (const pattern of fearPatterns) {
      const match = input.match(pattern);
      if (match) {
        fears.push(match[1].trim());
      }
    }
    
    return fears.length > 0 ? fears : ['未知恐惧 - 需要进一步探索'];
  }

  _needsExplorationMode(input, analysis) {
    // 如果输入过于模糊或开放式，建议哲学探讨模式
    const isVague = input.length < 20;
    const isOpenEnded = /(?:人生|意义|价值|方向|未来)/.test(input);
    const lowClarity = analysis.scores.decision + analysis.scores.problem < 2;
    
    return isVague || (isOpenEnded && lowClarity);
  }
}

// ============================================================================
// SECRETARY AGENT - 记录、归档、Checklist
// ============================================================================

class Secretary {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.records = [];
    this.checklists = new Map(); // personaId -> checklist
    this.todos = [];
    this.wiki = new Map(); // 结构化知识库
    this.preciousMoments = []; // 珍贵时刻记录
  }

  /**
   * 记录发言
   */
  record(speech) {
    const record = {
      id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      phase: speech.phase,
      speaker: speech.speaker, // personaId or 'facilitator' or 'user'
      type: speech.type, // 'statement', 'question', 'response', 'synthesis'
      content: speech.content,
      metadata: speech.metadata || {}
    };
    
    this.records.push(record);
    console.log(`[Secretary] 记录: ${speech.speaker} @ ${speech.phase}`);
    return record;
  }

  /**
   * 批量记录
   */
  recordBatch(speeches) {
    return speeches.map(s => this.record(s));
  }

  /**
   * 初始化幕僚checklist
   */
  initChecklist(personaId, lockedProblem) {
    this.checklists.set(personaId, {
      personaId,
      lockedProblem,
      items: [
        { id: 'chk_realProblem', text: '是否回应了真实问题？', checked: false },
        { id: 'chk_noAdvice', text: 'Phase 1是否只提问未建议？', checked: false },
        { id: 'chk_independent', text: '初始观点是否独立生成？', checked: false },
        { id: 'chk_updated', text: 'Delphi Round 2是否更新立场？', checked: false },
        { id: 'chk_conflict', text: '是否在冲突探讨中明确表态？', checked: false }
      ]
    });
  }

  /**
   * 更新checklist
   */
  checkItem(personaId, itemId) {
    const checklist = this.checklists.get(personaId);
    if (checklist) {
      const item = checklist.items.find(i => i.id === itemId);
      if (item) {
        item.checked = true;
        item.checkedAt = new Date().toISOString();
      }
    }
  }

  /**
   * 生成摘要
   */
  summarize(options = {}) {
    const { phase, speaker, limit = 10 } = options;
    
    let filtered = this.records;
    if (phase) filtered = filtered.filter(r => r.phase === phase);
    if (speaker) filtered = filtered.filter(r => r.speaker === speaker);
    
    // 按时间排序，取最近N条
    const recent = filtered.slice(-limit);
    
    return {
      totalRecords: this.records.length,
      summary: recent.map(r => ({
        speaker: r.speaker,
        phase: r.phase,
        content: r.content.substring(0, 100) + (r.content.length > 100 ? '...' : '')
      })),
      checklistStatus: this._getChecklistStatus(),
      todoCount: this.todos.length
    };
  }

  /**
   * 添加To-Do
   */
  addTodo(todo) {
    const item = {
      id: `todo_${Date.now()}`,
      text: todo.text,
      assignee: todo.assignee || 'user',
      priority: todo.priority || 'medium',
      createdAt: new Date().toISOString(),
      completed: false
    };
    this.todos.push(item);
    return item;
  }

  /**
   * 记录珍贵时刻
   */
  recordPreciousMoment(moment) {
    const record = {
      id: `pm_${Date.now()}`,
      type: moment.type, // 'synthesis', 'conflict_revelation', 'hypothesis_challenged'
      description: moment.description,
      participants: moment.participants,
      timestamp: new Date().toISOString()
    };
    this.preciousMoments.push(record);
    console.log(`[Secretary] 珍贵时刻记录: ${moment.type}`);
    return record;
  }

  /**
   * 生成Wiki知识库
   */
  generateWiki() {
    const wiki = {
      sessionId: this.sessionId,
      createdAt: new Date().toISOString(),
      problemDefinition: this._extractProblemDefinition(),
      positions: this._extractPositions(),
      conflicts: this._extractConflicts(),
      resolutions: this._extractResolutions(),
      harvestRound: this._extractHarvestRound(),
      todos: this.todos,
      preciousMoments: this.preciousMoments
    };
    
    this.wiki.set('main', wiki);
    return wiki;
  }

  // 私有辅助方法
  _getChecklistStatus() {
    const status = {};
    for (const [personaId, checklist] of this.checklists) {
      const total = checklist.items.length;
      const checked = checklist.items.filter(i => i.checked).length;
      status[personaId] = { total, checked, percentage: Math.round((checked / total) * 100) };
    }
    return status;
  }

  _extractProblemDefinition() {
    const problemRecords = this.records.filter(r => 
      r.phase === 'p1_problem' && r.type === 'synthesis'
    );
    return problemRecords[problemRecords.length - 1]?.content || null;
  }

  _extractPositions() {
    return this.records
      .filter(r => r.phase === 'p2_staking' && r.type === 'statement')
      .map(r => ({
        persona: r.speaker,
        position: r.content,
        round: r.metadata?.round || 1
      }));
  }

  _extractConflicts() {
    return this.records
      .filter(r => r.phase === 'p3_conflict' && r.type === 'synthesis')
      .map(r => ({
        conflictId: r.metadata?.conflictId,
        description: r.content
      }));
  }

  _extractResolutions() {
    return this.records
      .filter(r => r.phase === 'p4_debate' && r.type === 'synthesis')
      .map(r => ({
        conflictId: r.metadata?.conflictId,
        resolution: r.content
      }));
  }

  _extractHarvestRound() {
    return this.records
      .filter(r => r.phase === 'p5_synthesis' && r.metadata?.harvestPart)
      .reduce((acc, r) => {
        const part = r.metadata.harvestPart;
        if (!acc[part]) acc[part] = [];
        acc[part].push({
          speaker: r.speaker,
          content: r.content
        });
        return acc;
      }, {});
  }

  /**
   * 导出完整档案
   */
  exportArchive() {
    return {
      sessionId: this.sessionId,
      exportTime: new Date().toISOString(),
      fullRecords: this.records,
      wiki: this.wiki.get('main'),
      checklistSummary: this._getChecklistStatus(),
      statistics: {
        totalSpeeches: this.records.length,
        byPhase: this._countByPhase(),
        byPersona: this._countByPersona()
      }
    };
  }

  _countByPhase() {
    return this.records.reduce((acc, r) => {
      acc[r.phase] = (acc[r.phase] || 0) + 1;
      return acc;
    }, {});
  }

  _countByPersona() {
    return this.records.reduce((acc, r) => {
      if (r.speaker !== 'facilitator' && r.speaker !== 'user') {
        acc[r.speaker] = (acc[r.speaker] || 0) + 1;
      }
      return acc;
    }, {});
  }
}

// ============================================================================
// FACILITATOR - 主控制器
// ============================================================================

class Facilitator {
  constructor(sessionConfig = {}) {
    this.sessionId = sessionConfig.sessionId || `session_${Date.now()}`;
    this.config = sessionConfig;
    this.state = {
      currentPhase: 'p0_config',
      lockedProblem: null,
      selectedPersonas: [],
      redTeam: [],
      conflicts: [],
      currentConflictIndex: 0,
      sessionStartTime: null,
      estimatedDuration: null,
      bayesianState: {
        prior: null,
        evidence: [],
        posterior: null
      }
    };
    
    this.translator = new HypothesisTranslator();
    this.secretary = new Secretary(this.sessionId);
    
    // 绑定方法
    this.runPhase = this.runPhase.bind(this);
    this.advance = this.advance.bind(this);
    this.back = this.back.bind(this);
  }

  // ========================================================================
  // PHASE 0: Pre-Session Configuration
  // ========================================================================
  
  /**
   * Phase 0: 会前配置
   * 1. 接收用户困惑
   * 2. Hypothesis Translator → 可验证假设
   * 3. 选择幕僚（默认12人，指定Red Team）
   * 4. 时间预估
   */
  async phase0_config(userInput) {
    console.log('\n' + '='.repeat(60));
    console.log('PHASE 0: Pre-Session Configuration');
    console.log('='.repeat(60));
    
    // 1. Hypothesis Translation
    const translation = this.translator.translate(userInput);
    
    // 2. 选择幕僚
    const { personas, redTeam } = this._selectPersonas(translation.needsExploration);
    
    // 3. 初始化Secretary Checklist
    personas.forEach(p => {
      this.secretary.initChecklist(p.id, translation.translatedHypothesis.statement);
    });
    
    // 4. 时间预估
    const estimatedDuration = this._estimateDuration(translation);
    
    // 更新状态
    this.state.selectedPersonas = personas;
    this.state.redTeam = redTeam;
    this.state.sessionStartTime = new Date().toISOString();
    this.state.estimatedDuration = estimatedDuration;
    this.state.bayesianState.prior = translation.translatedHypothesis;
    
    // 记录配置
    this.secretary.record({
      phase: 'p0_config',
      speaker: 'user',
      type: 'statement',
      content: userInput,
      metadata: { phase: 'initial_input' }
    });
    
    this.secretary.record({
      phase: 'p0_config',
      speaker: 'facilitator',
      type: 'synthesis',
      content: `翻译后的假设: ${translation.translatedHypothesis.statement}`,
      metadata: { 
        translation,
        selectedPersonas: personas.map(p => p.id),
        redTeam: redTeam.map(p => p.id),
        estimatedDuration
      }
    });
    
    console.log('\n[Phase 0完成]');
    console.log('- 假设:', translation.translatedHypothesis.statement.substring(0, 80) + '...');
    console.log('- 幕僚:', personas.map(p => p.name).join(', '));
    console.log('- Red Team:', redTeam.map(p => p.name).join(', '));
    console.log('- 预估时长:', estimatedDuration, '分钟');
    
    return {
      translation,
      personas: personas.map(p => ({ id: p.id, name: p.name, archetype: p.archetype })),
      redTeam: redTeam.map(p => ({ id: p.id, name: p.name })),
      estimatedDuration
    };
  }

  _selectPersonas(needsExploration) {
    // 默认全员12人
    let selected = [...MOCK_PERSONAS];
    
    // 如果话题简单，可减少人数（简化版逻辑）
    if (this.config.simplify && !needsExploration) {
      selected = selected.slice(0, 8);
    }
    
    // 识别Red Team（2-3人）
    const redTeam = selected.filter(p => p.redTeam).slice(0, 3);
    
    // 如果不足3人，随机指定
    while (redTeam.length < 2) {
      const random = selected[Math.floor(Math.random() * selected.length)];
      if (!redTeam.includes(random)) {
        redTeam.push(random);
      }
    }
    
    return { personas: selected, redTeam };
  }

  _estimateDuration(translation) {
    // 基础时长：60分钟
    let duration = 60;
    
    // 决策类问题增加时长
    if (translation.hypothesisType === 'decision') duration += 20;
    
    // 需要探索模式增加时长
    if (translation.needsExploration) duration += 30;
    
    // Red Team全程参与增加时长
    duration += this.state.redTeam.length * 5;
    
    return Math.min(duration, 120); // 上限120分钟
  }

  // ========================================================================
  // PHASE 1: Problem Definition (~15%)
  // ========================================================================
  
  /**
   * Phase 1: 问题界定（双钻石 菱形1 - 发散）
   * 
   * Step A: NGT静默生成
   * - 12位幕僚同时生成（互不可见）
   * - 每个幕僚生成：real problem, missing info, disagreed assumption
   * 
   * Step B: 私董会澄清问题
   * - 幕僚轮流提问（仅问，不建议，不评判）
   * 
   * Facilitator合成：
   * "Here is what you actually seem to be deciding..."
   * 用户确认或修正 → 锁定真实问题 ✓
   */
  async phase1_problemDefinition() {
    console.log('\n' + '='.repeat(60));
    console.log('PHASE 1: Problem Definition (~15% of session)');
    console.log('='.repeat(60));
    
    // ---- Step A: NGT Silent Generation ----
    console.log('\n--- Step A: NGT Silent Generation ---');
    
    const ngtResponses = await this._mockNGTGeneration();
    
    // 记录NGT响应
    ngtResponses.forEach(response => {
      this.secretary.record({
        phase: 'p1_problem',
        speaker: response.personaId,
        type: 'statement',
        content: `真实问题: ${response.realProblem}\n缺失信息: ${response.missingInfo}\n质疑假设: ${response.disagreedAssumption}`,
        metadata: { step: 'NGT', independent: true }
      });
    });
    
    console.log(`[NGT] ${ngtResponses.length}位幕僚完成静默生成`);
    
    // ---- Step B: 私董会澄清问题 ----
    console.log('\n--- Step B: 私董会 Clarifying Questions ---');
    
    const clarifyingQuestions = await this._mockClarifyingQuestions(ngtResponses);
    
    // 记录澄清问题
    clarifyingQuestions.forEach(q => {
      this.secretary.record({
        phase: 'p1_problem',
        speaker: q.personaId,
        type: 'question',
        content: q.question,
        metadata: { step: 'clarifying', target: 'user' }
      });
    });
    
    console.log(`[Clarifying] ${clarifyingQuestions.length}个澄清问题`);
    
    // ---- Facilitator合成 ----
    console.log('\n--- Facilitator Synthesis ---');
    
    const synthesizedProblem = this._synthesizeProblem(ngtResponses, clarifyingQuestions);
    this.state.lockedProblem = synthesizedProblem;
    
    this.secretary.record({
      phase: 'p1_problem',
      speaker: 'facilitator',
      type: 'synthesis',
      content: synthesizedProblem,
      metadata: { 
        step: 'problem_lock',
        sources: ngtResponses.map(r => r.personaId)
      }
    });
    
    // 更新checklist
    this.state.selectedPersonas.forEach(p => {
      this.secretary.checkItem(p.id, 'chk_realProblem');
      this.secretary.checkItem(p.id, 'chk_noAdvice');
    });
    
    console.log('\n[Phase 1完成] 锁定真实问题:');
    console.log(synthesizedProblem);
    
    return {
      ngtResponses,
      clarifyingQuestions,
      lockedProblem: synthesizedProblem
    };
  }

  async _mockNGTGeneration() {
    // Mock: 12位幕僚的NGT响应
    const mockResponses = [
      {
        personaId: 'steve_jobs',
        realProblem: '用户真正想要的是什么？产品是否符合本质需求？',
        missingInfo: '用户是否有其他未说出的隐性需求',
        disagreedAssumption: '假设用户知道自己想要什么'
      },
      {
        personaId: 'laozi',
        realProblem: '是否在与趋势对抗？时机是否合适？',
        missingInfo: '大势的走向，顺势而为的可能性',
        disagreedAssumption: '假设努力就能改变结果'
      },
      {
        personaId: 'mao_zedong',
        realProblem: '主要矛盾是什么？谁是朋友谁是敌人？',
        missingInfo: '各方力量的真实分布',
        disagreedAssumption: '假设所有参与者利益一致'
      },
      {
        personaId: 'bruce_lee',
        realProblem: '内心真正的恐惧是什么？'
        ,        missingInfo: '案主的真实心理状态',
        disagreedAssumption: '假设这是一个理性决策'
      },
      {
        personaId: 'naval',
        realProblem: '长期复利效应如何？这是否是可扩展的方向？',
        missingInfo: '长期趋势数据，复利计算',
        disagreedAssumption: '假设短期利益等同于长期价值'
      },
      {
        personaId: 'ray_dalio',
        realProblem: '这是原则性问题还是一次性决策？',
        missingInfo: '类似决策的历史数据和结果',
        disagreedAssumption: '假设这次决策是孤立的'
      },
      {
        personaId: 'charlie_munger',
        realProblem: '如果我们倒过来想，什么会导致失败？',
        missingInfo: '失败案例的详细分析',
        disagreedAssumption: '假设成功的路径是唯一的'
      },
      {
        personaId: 'yuval_harari',
        realProblem: '这个故事在更大的历史叙事中意味着什么？',
        missingInfo: '宏观历史相似案例',
        disagreedAssumption: '假设当前情况是独特的'
      },
      {
        personaId: 'paul_graham',
        realProblem: '这是否是可以快速验证的假设？',
        missingInfo: 'MVP验证的可能性',
        disagreedAssumption: '假设需要完备信息才能决策'
      },
      {
        personaId: 'simon_sinek',
        realProblem: 'Why - 为什么要做这件事？',
        missingInfo: '案主的核心动机和价值观',
        disagreedAssumption: '假设目标已经明确'
      },
      {
        personaId: 'derek_sivers',
        realProblem: '如果不做这个决定，最坏的结果是什么？',
        missingInfo: '不行动的代价',
        disagreedAssumption: '假设必须做出选择'
      },
      {
        personaId: 'nassim_taleb',
        realProblem: '这个决策是否具有反脆弱性？',
        missingInfo: '不同情景下的表现',
        disagreedAssumption: '假设未来是可预测的'
      }
    ];
    
    // 模拟异步延迟
    await this._delay(100);
    return mockResponses;
  }

  async _mockClarifyingQuestions(ngtResponses) {
    // Mock: 基于NGT响应生成的澄清问题
    const questions = [
      { personaId: 'steve_jobs', question: '你尝试过什么方案？什么有效什么无效？' },
      { personaId: 'laozi', question: '你觉得时机对你有利还是不利？' },
      { personaId: 'mao_zedong', question: '谁是你最信任的盟友？' },
      { personaId: 'bruce_lee', question: '当你想到这个决定时，身体有什么感觉？' },
      { personaId: 'naval', question: '这个决定3年后还重要吗？' },
      { personaId: 'ray_dalio', question: '类似情况你以前做过什么决定？结果如何？' },
      { personaId: 'charlie_munger', question: '你觉得自己可能被什么认知偏见影响？' },
      { personaId: 'yuval_harari', question: '10年后回看，这个决定会被怎么评价？' }
    ];
    
    await this._delay(100);
    return questions;
  }

  _synthesizeProblem(ngtResponses, questions) {
    // 提取核心主题
    const themes = this._extractThemes(ngtResponses);
    
    return `Here is what you actually seem to be deciding:

你真正的决策是：在${themes.join('、')}这几个维度上，找到适合当下情境的平衡点。

这不仅仅是技术/策略层面的选择，而是关于：
- 你的核心优先级是什么
- 你愿意承担什么风险
- 你希望成为什么样的人

我们需要在后续的探讨中，让这些维度充分展开，然后找到属于你的答案。`;
  }

  _extractThemes(responses) {
    // 简化的主题提取
    const keywordMap = {
      '用户': '用户需求',
      '趋势': '时机选择', 
      '矛盾': '优先级排序',
      '恐惧': '内心真实',
      '复利': '长期价值',
      '原则': '系统构建',
      '失败': '风险管控',
      '故事': '意义构建',
      '验证': '快速迭代',
      'Why': '使命驱动',
      '不做': '机会成本',
      '脆弱': '韧性设计'
    };
    
    const themes = new Set();
    responses.forEach(r => {
      Object.entries(keywordMap).forEach(([keyword, theme]) => {
        if (r.realProblem.includes(keyword)) {
          themes.add(theme);
        }
      });
    });
    
    return Array.from(themes).slice(0, 5);
  }

  // ========================================================================
  // PHASE 2: Position Staking (~15%)
  // ========================================================================
  
  /**
   * Phase 2: 独立建仓（双钻石 菱形1 - 收敛）
   * 
   * Delphi Round 1: 独立观点（互不可读）
   * - Facilitator识别fault lines（底层假设分歧）
   * 
   * White Hat: 仅陈述事实
   * 
   * Delphi Round 2: 基于他人观点更新自己的立场
   * - 产生真正的updating
   */
  async phase2_positionStaking() {
    console.log('\n' + '='.repeat(60));
    console.log('PHASE 2: Position Staking (~15% of session)');
    console.log('='.repeat(60));
    
    // ---- Delphi Round 1: 独立观点 ----
    console.log('\n--- Delphi Round 1: Independent Positions ---');
    
    const round1Positions = await this._mockDelphiRound1();
    
    round1Positions.forEach(pos => {
      this.secretary.record({
        phase: 'p2_staking',
        speaker: pos.personaId,
        type: 'statement',
        content: `立场: ${pos.position}\n理由: ${pos.reasoning}`,
        metadata: { round: 1, independent: true }
      });
    });
    
    console.log(`[Delphi R1] ${round1Positions.length}个独立立场`);
    
    // ---- White Hat: 仅陈述事实 ----
    console.log('\n--- White Hat: Facts Only ---');
    
    const whiteHatFacts = await this._mockWhiteHatFacts();
    
    whiteHatFacts.forEach(fact => {
      this.secretary.record({
        phase: 'p2_staking',
        speaker: fact.personaId,
        type: 'statement',
        content: `[事实] ${fact.fact}`,
        metadata: { round: 'white_hat', factBased: true }
      });
    });
    
    // ---- Facilitator识别Fault Lines ----
    console.log('\n--- Facilitator: Mapping Fault Lines ---');
    
    const faultLines = this.mapFaultLines(round1Positions);
    
    this.secretary.record({
      phase: 'p2_staking',
      speaker: 'facilitator',
      type: 'synthesis',
      content: `识别的底层假设分歧:\n${faultLines.map((fl, i) => 
        `${i + 1}. ${fl.description} (分歧方: ${fl.divergentPersonas.join(', ')})`
      ).join('\n')}`,
      metadata: { faultLines }
    });
    
    console.log(`识别了 ${faultLines.length} 条底层假设分歧`);
    
    // ---- Delphi Round 2: 基于他人观点更新 ----
    console.log('\n--- Delphi Round 2: Position Updating ---');
    
    const round2Positions = await this._mockDelphiRound2(round1Positions, faultLines);
    
    round2Positions.forEach(pos => {
      this.secretary.record({
        phase: 'p2_staking',
        speaker: pos.personaId,
        type: 'statement',
        content: `更新立场: ${pos.position}\n变化: ${pos.change}`,
        metadata: { round: 2, updated: true, changeDegree: pos.changeDegree }
      });
    });
    
    console.log(`[Delphi R2] ${round2Positions.filter(p => p.changeDegree > 0).length}位幕僚更新了立场`);
    
    // 更新checklist
    this.state.selectedPersonas.forEach(p => {
      this.secretary.checkItem(p.id, 'chk_independent');
      this.secretary.checkItem(p.id, 'chk_updated');
    });
    
    return {
      round1Positions,
      whiteHatFacts,
      faultLines,
      round2Positions
    };
  }

  async _mockDelphiRound1() {
    const positions = [
      {
        personaId: 'steve_jobs',
        position: '应该专注打磨核心体验，拒绝妥协',
        reasoning: '伟大的产品来自对细节的极致追求，半吊子的解决方案会伤害品牌'
      },
      {
        personaId: 'laozi',
        position: '顺势而为，不要强行改变什么',
        reasoning: '当下的力量分布已经给出了答案，逆势而为消耗过大'
      },
      {
        personaId: 'mao_zedong',
        position: '集中优势兵力打歼灭战',
        reasoning: '资源有限，必须选择最有利的战场全力突破'
      },
      {
        personaId: 'bruce_lee',
        position: '如其所是地行动，而非如你所愿',
        reasoning: '真实的限制和真实的资源决定真实的选择'
      },
      {
        personaId: 'naval',
        position: '选择那个具有长期复利效应的路径',
        reasoning: '短期痛苦的长期收益 > 短期舒适的长期平庸'
      },
      {
        personaId: 'ray_dalio',
        position: '建立可重复的决策系统',
        reasoning: '单次决策的结果不如建立正确的决策流程重要'
      },
      {
        personaId: 'charlie_munger',
        position: '先想怎么失败，再避开那些坑',
        reasoning: '避免愚蠢比追求聪明更容易实现'
      },
      {
        personaId: 'yuval_harari',
        position: '选择一个可以被讲述的故事',
        reasoning: '人类靠故事协作，没有叙事的选择难以执行'
      },
      {
        personaId: 'paul_graham',
        position: '快速验证核心假设',
        reasoning: '在脑子里想一千遍不如在真实世界里试一遍'
      },
      {
        personaId: 'simon_sinek',
        position: '从为什么开始，而非从怎么做',
        reasoning: '清晰的使命会自然吸引资源和人才'
      },
      {
        personaId: 'derek_sivers',
        position: 'Hell yeah or no',
        reasoning: '不够兴奋的选择不值得投入稀缺的时间资源'
      },
      {
        personaId: 'nassim_taleb',
        position: '构建反脆弱的选择',
        reasoning: '不确定性中受益 > 在确定性中受益'
      }
    ];
    
    await this._delay(150);
    return positions;
  }

  async _mockWhiteHatFacts() {
    const facts = [
      { personaId: 'ray_dalio', fact: '当前可用资源: 时间3个月，预算X，人力2人' },
      { personaId: 'naval', fact: '市场趋势: 过去12个月该领域增长率23%' },
      { personaId: 'charlie_munger', fact: '历史数据: 类似决策的成功率约35%' },
      { personaId: 'yuval_harari', fact: '行业背景: 该技术周期处于成熟期' },
      { personaId: 'paul_graham', fact: '验证结果: 已有3个用户访谈支持方向A' }
    ];
    
    await this._delay(80);
    return facts;
  }

  async _mockDelphiRound2(round1Positions, faultLines) {
    // Mock: 模拟一些幕僚更新立场
    const updates = round1Positions.map(pos => {
      const changeDegree = Math.random() > 0.6 ? Math.random() * 0.5 : 0;
      
      let change = '保持原立场';
      if (changeDegree > 0.3) {
        change = `受${['steve_jobs', 'naval', 'laozi'][Math.floor(Math.random() * 3)]}影响，微调了执行路径`;
      }
      
      return {
        ...pos,
        change,
        changeDegree
      };
    });
    
    await this._delay(150);
    return updates;
  }

  /**
   * 映射底层假设分歧 - 核心算法
   * @param {Array} positions - 各幕僚的立场
   * @returns {Array} - 识别的fault lines
   */
  mapFaultLines(positions) {
    console.log('[FaultLineMapper] 分析底层假设分歧...');
    
    // 基于立场内容识别分歧维度
    const faultLines = [];
    
    // 维度1: 时间取向分歧
    const shortTerm = ['mao_zedong', 'paul_graham'];
    const longTerm = ['naval', 'yuval_harari', 'nassim_taleb'];
    
    if (this._hasDivergence(positions, shortTerm, longTerm)) {
      faultLines.push({
        id: 'time_orientation',
        description: '时间取向的根本分歧：短期突破 vs 长期复利',
        divergentPersonas: [...shortTerm, ...longTerm],
        shortTermAdvocates: shortTerm,
        longTermAdvocates: longTerm,
        underlyingAssumption: '当下资源应该优先投入可验证的短期收益，还是可以承受不确定性换取长期回报'
      });
    }
    
    // 维度2: 控制vs顺应分歧
    const controlOriented = ['steve_jobs', 'mao_zedong', 'ray_dalio'];
    const flowOriented = ['laozi', 'bruce_lee', 'derek_sivers'];
    
    if (this._hasDivergence(positions, controlOriented, flowOriented)) {
      faultLines.push({
        id: 'control_vs_flow',
        description: '行动哲学分歧：主动塑造 vs 顺势而为',
        divergentPersonas: [...controlOriented, ...flowOriented],
        controlAdvocates: controlOriented,
        flowAdvocates: flowOriented,
        underlyingAssumption: '环境在多大程度上可以被改变，改变的努力是否值得'
      });
    }
    
    // 维度3: 风险偏好分歧
    const riskSeeking = ['nassim_taleb', 'paul_graham'];
    const riskAverse = ['charlie_munger', 'ray_dalio'];
    
    if (this._hasDivergence(positions, riskSeeking, riskAverse)) {
      faultLines.push({
        id: 'risk_appetite',
        description: '风险偏好分歧：拥抱不确定性 vs 规避风险',
        divergentPersonas: [...riskSeeking, ...riskAverse],
        riskSeekingAdvocates: riskSeeking,
        riskAverseAdvocates: riskAverse,
        underlyingAssumption: '不确定性的收益是否值得其带来的潜在损失'
      });
    }
    
    // 维度4: 完美vs迭代分歧
    const perfectionist = ['steve_jobs', 'simon_sinek'];
    const iterative = ['paul_graham', 'naval'];
    
    if (this._hasDivergence(positions, perfectionist, iterative)) {
      faultLines.push({
        id: 'perfection_vs_iteration',
        description: '执行哲学分歧：完美交付 vs 快速迭代',
        divergentPersonas: [...perfectionist, ...iterative],
        perfectionistAdvocates: perfectionist,
        iterativeAdvocates: iterative,
        underlyingAssumption: '市场是否会等待完美的产品，还是先发优势更重要'
      });
    }
    
    return faultLines;
  }

  _hasDivergence(positions, groupA, groupB) {
    const hasA = positions.some(p => groupA.includes(p.personaId));
    const hasB = positions.some(p => groupB.includes(p.personaId));
    return hasA && hasB;
  }

  // ========================================================================
  // PHASE 3: Conflict Extraction ⭐ KEY STEP
  // ========================================================================
  
  /**
   * Phase 3: 冲突提炼 - 最关键步骤
   * 
   * Facilitator读取Phase 2所有观点
   * 识别3-6个不同维度的冲突（观点真正不调和之处）
   * 每个冲突是一个独立的探讨维度
   * 不是分配冲突给小组——每个冲突由全体幕僚共同参与
   */
  async phase3_conflictExtraction() {
    console.log('\n' + '='.repeat(60));
    console.log('PHASE 3: Conflict Extraction ⭐ KEY STEP');
    console.log('='.repeat(60));
    
    // 获取Phase 2的所有立场记录
    const phase2Records = this.secretary.records.filter(r => r.phase === 'p2_staking');
    const speeches = phase2Records.filter(r => r.type === 'statement');
    
    console.log(`\n[ConflictExtractor] 分析 ${speeches.length} 条发言...`);
    
    // 核心算法：从发言中提取冲突维度
    const conflicts = this.extractConflicts(speeches);
    
    // 验证冲突数量
    if (conflicts.length < 3) {
      console.log('[警告] 识别冲突不足3个，补充默认维度');
      conflicts.push(...this._generateDefaultConflicts(3 - conflicts.length));
    }
    
    // 限制最多6个冲突
    const finalConflicts = conflicts.slice(0, 6);
    
    // 更新状态
    this.state.conflicts = finalConflicts;
    
    // 记录冲突
    finalConflicts.forEach((conflict, index) => {
      this.secretary.record({
        phase: 'p3_conflict',
        speaker: 'facilitator',
        type: 'synthesis',
        content: `冲突${index + 1}: ${conflict.name}\n${conflict.description}\n涉及幕僚: ${conflict.personas.join(', ')}`,
        metadata: { 
          conflictId: conflict.id,
          conflictIndex: index,
          faultLine: conflict.faultLine
        }
      });
    });
    
    console.log('\n[Phase 3完成] 识别的冲突维度:');
    finalConflicts.forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.name}`);
      console.log(`     ${c.description}`);
      console.log(`     涉及: ${c.personas.length}位幕僚`);
    });
    
    return { conflicts: finalConflicts };
  }

  /**
   * 核心算法：从发言中提取冲突维度
   * @param {Array} speeches - 幕僚发言记录
   * @returns {Array} - 冲突维度列表
   */
  extractConflicts(speeches) {
    console.log('[extractConflicts] 运行冲突提取算法...');
    
    // 步骤1: 语义分析 - 提取关键概念和立场
    const concepts = this._extractConcepts(speeches);
    
    // 步骤2: 立场聚类 - 识别不同的立场群组
    const stanceClusters = this._clusterStances(speeches, concepts);
    
    // 步骤3: 冲突识别 - 找到不可调和的立场对
    const rawConflicts = this._identifyConflicts(stanceClusters, speeches);
    
    // 步骤4: 冲突精炼 - 合并相似冲突，确保3-6个维度
    const refinedConflicts = this._refineConflicts(rawConflicts);
    
    return refinedConflicts;
  }

  _extractConcepts(speeches) {
    // 提取发言中的关键概念
    const conceptMap = new Map();
    
    const keywords = [
      '长期', '短期', '快速', '稳健', '完美', '迭代', '控制', '顺应',
      '风险', '安全', '创新', '保守', '专注', '多元', '竞争', '合作',
      '内在', '外在', '理性', '感性', '系统', '直觉'
    ];
    
    speeches.forEach(speech => {
      const content = speech.content || '';
      keywords.forEach(keyword => {
        if (content.includes(keyword)) {
          conceptMap.set(keyword, (conceptMap.get(keyword) || 0) + 1);
        }
      });
    });
    
    // 返回高频概念
    return Array.from(conceptMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([concept]) => concept);
  }

  _clusterStances(speeches, concepts) {
    // 基于概念对发言进行聚类
    const clusters = new Map();
    
    speeches.forEach(speech => {
      if (!speech.speaker || speech.speaker === 'facilitator') return;
      
      const content = speech.content || '';
      
      // 为每个发言者确定主要立场维度
      let primaryDimension = 'balanced';
      
      if (content.includes('长期') && !content.includes('短期')) {
        primaryDimension = 'long_term';
      } else if (content.includes('短期') && !content.includes('长期')) {
        primaryDimension = 'short_term';
      } else if (content.includes('完美') || content.includes('极致')) {
        primaryDimension = 'perfection';
      } else if (content.includes('快速') || content.includes('迭代')) {
        primaryDimension = 'iteration';
      } else if (content.includes('控制') || content.includes('塑造')) {
        primaryDimension = 'control';
      } else if (content.includes('顺应') || content.includes('无为')) {
        primaryDimension = 'flow';
      }
      
      if (!clusters.has(primaryDimension)) {
        clusters.set(primaryDimension, []);
      }
      clusters.get(primaryDimension).push(speech.speaker);
    });
    
    return clusters;
  }

  _identifyConflicts(clusters, speeches) {
    const conflicts = [];
    
    // 定义已知的对立维度
    const oppositionPairs = [
      ['long_term', 'short_term', '时间取向的根本分歧'],
      ['perfection', 'iteration', '执行哲学的根本分歧'],
      ['control', 'flow', '行动哲学的根本分歧'],
      ['risk_seeking', 'risk_averse', '风险偏好的根本分歧']
    ];
    
    // 检查每对对立维度是否有足够的发言者
    oppositionPairs.forEach(([dimA, dimB, description]) => {
      const speakersA = clusters.get(dimA) || [];
      const speakersB = clusters.get(dimB) || [];
      
      if (speakersA.length > 0 && speakersB.length > 0) {
        conflicts.push({
          id: `conflict_${dimA}_${dimB}`,
          name: description,
          dimensionA: dimA,
          dimensionB: dimB,
          personas: [...speakersA, ...speakersB],
          speakersA,
          speakersB,
          intensity: Math.min(speakersA.length, speakersB.length) // 冲突强度
        });
      }
    });
    
    // 如果没有识别到足够冲突，基于fault lines生成
    const faultLines = this.mapFaultLines(
      speeches.filter(s => s.metadata?.round === 1).map(s => ({
        personaId: s.speaker,
        position: s.content
      }))
    );
    
    faultLines.forEach(fl => {
      if (!conflicts.find(c => c.id.includes(fl.id))) {
        conflicts.push({
          id: `conflict_${fl.id}`,
          name: fl.description,
          dimensionA: fl.shortTermAdvocates ? 'short_term' : 'control',
          dimensionB: fl.longTermAdvocates ? 'long_term' : 'flow',
          personas: fl.divergentPersonas,
          faultLine: fl,
          intensity: fl.divergentPersonas.length / 2
        });
      }
    });
    
    return conflicts;
  }

  _refineConflicts(rawConflicts) {
    // 按强度排序，选择最有价值的冲突
    const sorted = rawConflicts.sort((a, b) => b.intensity - a.intensity);
    
    // 确保冲突维度多样化
    const selected = [];
    const usedDimensions = new Set();
    
    for (const conflict of sorted) {
      const dimKey = `${conflict.dimensionA}-${conflict.dimensionB}`;
      
      if (!usedDimensions.has(dimKey)) {
        selected.push({
          id: conflict.id,
          name: conflict.name,
          description: this._generateConflictDescription(conflict),
          personas: conflict.personas,
          faultLine: conflict.faultLine,
          resolved: false,
          synthesis: null
        });
        
        usedDimensions.add(dimKey);
      }
      
      if (selected.length >= 6) break;
    }
    
    return selected;
  }

  _generateConflictDescription(conflict) {
    const descriptions = {
      'time_orientation': '关于应该优先追求即时可见的成果，还是投资长期复利效应的根本分歧',
      'control_vs_flow': '关于应该主动塑造环境达成目标，还是顺应时势减少消耗的根本分歧',
      'risk_appetite': '关于应该拥抱不确定性获取收益，还是优先保护下行风险的根本分歧',
      'perfection_vs_iteration': '关于应该追求完美的首次发布，还是快速试错持续迭代的根本分歧'
    };
    
    const key = conflict.id.replace('conflict_', '');
    return descriptions[key] || conflict.name;
  }

  _generateDefaultConflicts(count) {
    const defaults = [
      {
        id: 'conflict_default_1',
        name: '资源分配的根本分歧',
        description: '有限资源应该集中投入单点突破，还是分散布局多点开花',
        personas: MOCK_PERSONAS.slice(0, 6).map(p => p.id),
        resolved: false,
        synthesis: null
      },
      {
        id: 'conflict_default_2',
        name: '信任建立的根本分歧',
        description: '信任应该通过快速交付建立，还是通过长期稳定表现建立',
        personas: MOCK_PERSONAS.slice(6, 12).map(p => p.id),
        resolved: false,
        synthesis: null
      }
    ];
    
    return defaults.slice(0, count);
  }

  // ========================================================================
  // PHASE 4: Structured Debate (~35%)
  // ========================================================================
  
  /**
   * Phase 4: 逐冲突深度探讨（双钻石 菱形2 - 发散继续）
   * 
   * 对每个冲突维度：
   * - 幕僚自然分化：正方 / 反方 / 调和者
   * - 每个冲突内部充分探讨，不草草了事
   * - Red Team全程监控，挑战新兴共识
   * 
   * 卡点处理：
   * [卡住] → TRIZ："我们必须停止哪个假设？"
   * [进展中] → 继续或进入下一个冲突
   * 
   * 案主主动提问选项：
   * 案主可在任何冲突后提出新问题
   */
  async phase4_structuredDebate(conflictId = null) {
    console.log('\n' + '='.repeat(60));
    console.log('PHASE 4: Structured Debate (~35% of session)');
    console.log('='.repeat(60));
    
    const conflicts = conflictId 
      ? this.state.conflicts.filter(c => c.id === conflictId)
      : this.state.conflicts;
    
    const debateResults = [];
    
    for (let i = 0; i < conflicts.length; i++) {
      const conflict = conflicts[i];
      this.state.currentConflictIndex = i;
      
      console.log(`\n--- 冲突 ${i + 1}/${conflicts.length}: ${conflict.name} ---`);
      
      // 1. 幕僚自然分化
      const factions = this._formFactions(conflict);
      console.log(`  正方(${factions.pro.length}): ${factions.pro.slice(0, 3).join(',')}${factions.pro.length > 3 ? '...' : ''}`);
      console.log(`  反方(${factions.con.length}): ${factions.con.slice(0, 3).join(',')}${factions.con.length > 3 ? '...' : ''}`);
      console.log(`  调和者(${factions.mediator.length}): ${factions.mediator.join(',') || '无'}`);
      
      // 2. 深度探讨
      const debate = await this._conductDebate(conflict, factions);
      
      // 3. Red Team挑战
      const redTeamChallenges = await this._redTeamChallenge(debate);
      
      // 4. 检测是否卡住
      const isStuck = this._detectStuck(debate);
      
      if (isStuck) {
        console.log('  [检测到循环] 应用TRIZ unstuck...');
        const trizResult = await this._applyTRIZ(conflict);
        debate.trizApplied = trizResult;
      }
      
      // 5. 合成冲突结论
      const synthesis = this._synthesizeConflictResolution(conflict, debate, factions);
      conflict.synthesis = synthesis;
      conflict.resolved = true;
      
      // 记录
      this.secretary.record({
        phase: 'p4_debate',
        speaker: 'facilitator',
        type: 'synthesis',
        content: `冲突"${conflict.name}"的结论:\n${synthesis}`,
        metadata: { 
          conflictId: conflict.id,
          factions,
          trizApplied: !!debate.trizApplied
        }
      });
      
      // 更新checklist
      conflict.personas.forEach(pid => {
        this.secretary.checkItem(pid, 'chk_conflict');
      });
      
      debateResults.push({
        conflict,
        factions,
        debate,
        redTeamChallenges,
        synthesis
      });
      
      console.log(`  [完成] 结论: ${synthesis.substring(0, 80)}...`);
    }
    
    // Groan Zone: 命名未解决的核心张力
    console.log('\n--- Groan Zone: Naming Unresolved Tensions ---');
    const unresolvedTensions = this._identifyUnresolvedTensions(debateResults);
    
    this.secretary.record({
      phase: 'p4_debate',
      speaker: 'facilitator',
      type: 'synthesis',
      content: `未解决的核心张力:\n${unresolvedTensions.join('\n')}`,
      metadata: { groanZone: true }
    });
    
    console.log('未解决张力:', unresolvedTensions);
    
    return {
      debateResults,
      unresolvedTensions
    };
  }

  _formFactions(conflict) {
    const personas = conflict.personas;
    const shuffled = [...personas].sort(() => Math.random() - 0.5);
    
    const third = Math.floor(shuffled.length / 3);
    
    return {
      pro: shuffled.slice(0, third),
      con: shuffled.slice(third, third * 2),
      mediator: shuffled.slice(third * 2)
    };
  }

  async _conductDebate(conflict, factions) {
    // Mock debate content
    const exchanges = [];
    
    // 模拟3轮辩论
    for (let round = 1; round <= 3; round++) {
      // 正方发言
      const proSpeaker = factions.pro[round - 1] || factions.pro[0];
      if (proSpeaker) {
        exchanges.push({
          round,
          speaker: proSpeaker,
          stance: 'pro',
          content: `[${round}] 支持${conflict.name.split('：')[0]}的立场陈述`
        });
      }
      
      // 反方发言
      const conSpeaker = factions.con[round - 1] || factions.con[0];
      if (conSpeaker) {
        exchanges.push({
          round,
          speaker: conSpeaker,
          stance: 'con',
          content: `[${round}] 反对/质疑的立场陈述`
        });
      }
      
      // 调和者发言（如果有）
      const mediator = factions.mediator[round - 1];
      if (mediator) {
        exchanges.push({
          round,
          speaker: mediator,
          stance: 'mediator',
          content: `[${round}] 寻求更深层的balance`
        });
      }
    }
    
    await this._delay(200);
    
    return { exchanges, totalRounds: 3 };
  }

  async _redTeamChallenge(debate) {
    const challenges = [];
    
    for (const red of this.state.redTeam) {
      challenges.push({
        challenger: red.id,
        target: 'emerging_consensus',
        challenge: `${red.name}挑战：这个新兴共识是否忽略了...？`
      });
    }
    
    return challenges;
  }

  _detectStuck(debate) {
    // 检测循环：简单模拟
    const contents = debate.exchanges.map(e => e.content);
    const uniqueContents = new Set(contents);
    return uniqueContents.size < contents.length * 0.7; // 70%重复认为卡住
  }

  async _applyTRIZ(conflict) {
    console.log('  [TRIZ] 提问：我们必须停止哪个假设？');
    
    const assumptions = [
      '假设资源是有限的',
      '假设必须在A和B之间选择',
      '假设现在必须做出决定',
      '假设所有参与者利益冲突'
    ];
    
    return {
      question: 'What must we STOP assuming for this conversation to move forward?',
      assumptionsToStop: assumptions.slice(0, 2),
      breakthrough: '如果我们不再假设...，会发生什么？'
    };
  }

  _synthesizeConflictResolution(conflict, debate, factions) {
    return `经过${debate.totalRounds}轮深度探讨，关于"${conflict.name}"：

正方言之有物的核心论证：[...]
反方言之有物的核心论证：[...]
调和者发现的深层结构：[...]

当前状态：这个张力没有被"解决"，而是被充分展开。案主需要在[具体维度]上做出情境化的选择。

建议下一步：在做出选择前，先验证[具体假设]。`;
  }

  _identifyUnresolvedTensions(debateResults) {
    return debateResults.map((dr, i) => 
      `${i + 1}. ${dr.conflict.name} - 需要在情境中具体权衡`
    );
  }

  // ========================================================================
  // PHASE 5: Synthesis (~20%)
  // ========================================================================
  
  /**
   * Phase 5: 综合与收获（收敛 ~20%）
   * 
   * [双层输出]
   * 表层：共识摘要、各冲突结论、未解决张力、立场分布
   * 深层：完整推理逻辑、可转入1对1私聊
   * 
   * [贝叶斯更新]
   * Prior → Evidence → Posterior
   * 假设状态：已验证 / 证伪 / 待定
   * 
   * [收获轮 Harvest Round]
   * Part A: 幕僚自我收获
   * Part B: 幕僚评价案主 ⭐（极珍贵）
   * Part C: 案主自我收获
   * Part D: Facilitator收尾
   */
  async phase5_synthesis() {
    console.log('\n' + '='.repeat(60));
    console.log('PHASE 5: Synthesis + Harvest Round (~20% of session)');
    console.log('='.repeat(60));
    
    // ---- 心理准备 Psychological Frame ----
    console.log('\n--- Psychological Frame ---');
    console.log(`
[Facilitator声明]
"接下来你会听到真实的、锐利的评价。
这不是攻击，是因为我们真的花时间思考了你。
真正有价值的东西都是sharp的——不要假模假式。
请以开放的心接收。"
    `);
    
    // ---- 双层输出 ----
    console.log('\n--- Two-Layer Output ---');
    
    const surfaceOutput = this._generateSurfaceOutput();
    const deepOutput = this._generateDeepOutput();
    
    console.log('[表层输出]');
    console.log('- 共识摘要:', surfaceOutput.consensusSummary.substring(0, 100) + '...');
    console.log('- 未解决张力:', surfaceOutput.unresolvedTensions.length, '个');
    
    // ---- 贝叶斯更新 ----
    console.log('\n--- Bayesian Update ---');
    
    const bayesianUpdate = this._computeBayesianUpdate();
    this.state.bayesianState.posterior = bayesianUpdate.posterior;
    
    console.log('Prior:', bayesianUpdate.prior.statement.substring(0, 50) + '...');
    console.log('Evidence:', bayesianUpdate.evidence.length, '条');
    console.log('Posterior:', bayesianUpdate.posterior.statement.substring(0, 50) + '...');
    console.log('假设状态:', bayesianUpdate.hypothesisStatus);
    
    // ---- 收获轮 Harvest Round ----
    console.log('\n--- Harvest Round ---');
    
    // Part A: 幕僚自我收获
    console.log('\n[Part A: 幕僚自我收获]');
    const selfHarvest = await this._harvestSelfReflection();
    selfHarvest.forEach(h => {
      this.secretary.record({
        phase: 'p5_synthesis',
        speaker: h.personaId,
        type: 'statement',
        content: `收获: ${h.harvest}\n从他人学到: ${h.learned}`,
        metadata: { harvestPart: 'A' }
      });
      console.log(`  ${h.personaId}: ${h.harvest.substring(0, 50)}...`);
    });
    
    // Part B: 幕僚评价案主 ⭐ 最珍贵
    console.log('\n[Part B: 幕僚评价案主 ⭐ 极珍贵]');
    const evaluations = await this._harvestUserEvaluation();
    evaluations.forEach(e => {
      this.secretary.record({
        phase: 'p5_synthesis',
        speaker: e.personaId,
        type: 'statement',
        content: `案主表现: ${e.performance}\n新认知: ${e.insight}\n看到的东西: ${e.saw}`,
        metadata: { harvestPart: 'B', target: 'user' }
      });
      console.log(`  ${e.personaId}: ${e.insight.substring(0, 50)}...`);
    });
    
    // Part C: 案主自我收获
    console.log('\n[Part C: 案主自我收获]');
    const userHarvest = await this._harvestUserReflection();
    this.secretary.record({
      phase: 'p5_synthesis',
      speaker: 'user',
      type: 'statement',
      content: `最重要收获: ${userHarvest.main}\n意外听到: ${userHarvest.surprise}`,
      metadata: { harvestPart: 'C' }
    });
    console.log('  案主:', userHarvest.main);
    
    // Part D: Facilitator收尾
    console.log('\n[Part D: Facilitator收尾]');
    const closing = this._generateClosing(evaluations, userHarvest);
    this.secretary.record({
      phase: 'p5_synthesis',
      speaker: 'facilitator',
      type: 'synthesis',
      content: closing.summary,
      metadata: { harvestPart: 'D', preciousMoment: closing.preciousMoment }
    });
    
    // 记录珍贵时刻
    this.secretary.recordPreciousMoment({
      type: closing.preciousMoment.type,
      description: closing.preciousMoment.description,
      participants: closing.preciousMoment.participants
    });
    
    console.log('  珍贵时刻:', closing.preciousMoment.description);
    
    // 生成Wiki
    const wiki = this.secretary.generateWiki();
    
    return {
      surfaceOutput,
      deepOutput,
      bayesianUpdate,
      harvest: {
        selfHarvest,
        evaluations,
        userHarvest,
        closing
      },
      wiki
    };
  }

  _generateSurfaceOutput() {
    const conflictConclusions = this.state.conflicts.map(c => ({
      name: c.name,
      synthesis: c.synthesis?.substring(0, 200) + '...'
    }));
    
    return {
      consensusSummary: '表层共识：需要更深入地理解问题，在不同维度上做出权衡',
      conflictConclusions,
      unresolvedTensions: this.state.conflicts.map(c => c.name),
      stanceDistribution: this._calculateStanceDistribution(),
      bayesianSummary: this._generateBayesianSummary()
    };
  }

  _generateDeepOutput() {
    return {
      fullReasoning: this.secretary.records
        .filter(r => r.phase === 'p2_staking' || r.phase === 'p4_debate')
        .map(r => ({
          speaker: r.speaker,
          phase: r.phase,
          content: r.content
        })),
      personaAvailability: this.state.selectedPersonas.map(p => ({
        id: p.id,
        name: p.name,
        availableFor1on1: true
      }))
    };
  }

  _calculateStanceDistribution() {
    // 统计各幕僚在各冲突中的立场分布
    return this.state.selectedPersonas.map(p => ({
      persona: p.id,
      primaryStance: ['pro', 'con', 'mediator'][Math.floor(Math.random() * 3)]
    }));
  }

  _generateBayesianSummary() {
    return {
      prior: this.state.bayesianState.prior?.statement.substring(0, 100) + '...',
      evidenceCount: this.state.bayesianState.evidence.length,
      updateDirection: '需要更多信息'
    };
  }

  _computeBayesianUpdate() {
    const prior = this.state.bayesianState.prior;
    
    // 从辩论记录中提取证据
    const evidence = this.state.conflicts.map(c => ({
      source: `conflict_${c.id}`,
      supports: Math.random() > 0.5,
      strength: Math.random(),
      description: `来自"${c.name}"的讨论`
    }));
    
    this.state.bayesianState.evidence = evidence;
    
    // 计算后验
    const supportCount = evidence.filter(e => e.supports).length;
    const totalEvidence = evidence.length;
    const confidence = supportCount / totalEvidence;
    
    let hypothesisStatus;
    let posteriorStatement;
    
    if (confidence > 0.7) {
      hypothesisStatus = 'PARTIALLY_CONFIRMED';
      posteriorStatement = prior.statement + '\n[更新] 部分证据支持，但存在重要张力需要解决';
    } else if (confidence < 0.3) {
      hypothesisStatus = 'DISCONFIRMED';
      posteriorStatement = '[修正] 原始假设需要重新表述，核心假设可能不成立';
    } else {
      hypothesisStatus = 'INCONCLUSIVE';
      posteriorStatement = prior.statement + '\n[待定] 证据相互矛盾，需要收集更多信息或重新定义假设';
    }
    
    return {
      prior,
      evidence,
      posterior: {
        statement: posteriorStatement,
        confidence,
        status: hypothesisStatus
      },
      hypothesisStatus
    };
  }

  async _harvestSelfReflection() {
    return this.state.selectedPersonas.slice(0, 6).map(p => ({
      personaId: p.id,
      harvest: `从今天的讨论中，我重新理解了${p.philosophy.substring(0, 20)}在复杂情境中的应用`,
      learned: `从${this.state.selectedPersonas.filter(x => x.id !== p.id)[0].name}那里学到了新的视角`
    }));
  }

  async _harvestUserEvaluation() {
    // ⭐ 这是产品最独特的价值：12个哲学视角同时评价案主
    return this.state.selectedPersonas.map(p => {
      const perspectives = {
        'steve_jobs': { saw: '对产品细节的敏感度，但也看到了对"不完美"的恐惧', insight: '你有品味，但需要学会与"足够好"共处' },
        'laozi': { saw: '努力改变环境的执着', insight: '顺势而为不是放弃，是更大的智慧' },
        'mao_zedong': { saw: '斗争的勇气，但可能忽略了统一战线', insight: '分清主要矛盾，但不要树敌过多' },
        'bruce_lee': { saw: '内心有真实的热情，但被外界标准绑架', insight: 'Be water不是口号，是放下自我形象的勇气' },
        'naval': { saw: '追求长期价值的眼光，但执行力待验证', insight: '杠杆来自积累，但积累需要开始' },
        'ray_dalio': { saw: '有自我反思的意识，但缺乏系统化', insight: '把痛苦写下来，变成原则' },
        'charlie_munger': { saw: '聪明，但聪明人最容易被自己骗', insight: '逆向思维：先想怎么失败' },
        'yuval_harari': { saw: '在个人叙事中寻求意义', insight: '你的故事是什么？它经得起历史检验吗？' },
        'paul_graham': { saw: '想做大事，但可能在做准备上花了太多时间', insight: '先推出一个丑陋的版本' },
        'simon_sinek': { saw: '关注"怎么做"多于"为什么"', insight: '回到原点：你真正相信什么？' },
        'derek_sivers': { saw: '说"是"太多，"Hell Yeah"太少', insight: '减法的力量' },
        'nassim_taleb': { saw: '想要控制结果，而非构建反脆弱性', insight: '风会熄灭蜡烛，却能使火堆越烧越旺' }
      };
      
      const ev = perspectives[p.id] || { saw: '独特的视角', insight: '需要更多信息' };
      
      return {
        personaId: p.id,
        performance: `认真倾听，积极参与，有真实的困惑`,
        insight: ev.insight,
        saw: ev.saw
      };
    });
  }

  async _harvestUserReflection() {
    return {
      main: '我最大的收获是：问题本身比我想象的更复杂，但我也有比想象中更多的选择空间',
      surprise: '最让我意外的是：不同哲学框架看同一个问题，得出的建议可以如此不同又有道理'
    };
  }

  _generateClosing(evaluations, userHarvest) {
    // 找出最具洞见的评价
    const mostInsightful = evaluations.reduce((best, current) => 
      current.insight.length > best.insight.length ? current : best
    );
    
    return {
      summary: `本次Session共探讨了${this.state.conflicts.length}个核心冲突维度，收集了${evaluations.length}个哲学视角的评价。`,
      preciousMoment: {
        type: 'insight_crystallization',
        description: `${mostInsightful.personaId}对案主的评价："${mostInsightful.insight}"`,
        participants: [mostInsightful.personaId, 'user']
      }
    };
  }

  // ========================================================================
  // LAYER 7: Defense Mechanisms（贯穿全程）
  // ========================================================================
  
  /**
   * Layer 7: 防御机制
   * 处理各种卡点和异常情况
   */
  handleDefenseMechanisms(situation, context) {
    console.log(`[DefenseMechanism] 处理: ${situation}`);
    
    switch (situation) {
      case 'circular_debate':
        return this._applyTRIZUnstuck(context);
        
      case 'true_impasse':
        return this._elevateImpasse(context);
        
      case 'false_hypothesis':
        return this._flagFalseHypothesis(context);
        
      case 'false_consensus':
        return this._injectRedTeamChallenge(context);
        
      case 'insufficient_input':
        return this._requestClarification(context);
        
      default:
        return { handled: false, reason: 'Unknown situation' };
    }
  }

  _applyTRIZUnstuck(context) {
    return {
      handled: true,
      method: 'TRIZ',
      action: 'ask_all_personas',
      question: 'What must we STOP assuming for this conversation to move forward?',
      expectedOutcome: 'Breakthrough by challenging hidden assumptions'
    };
  }

  _elevateImpasse(context) {
    return {
      handled: true,
      method: 'Impasse_Elevation',
      action: 'make_framework_choice_visible',
      message: `These two frameworks are incommensurable on this point. 
                The user must choose which framework applies to their specific context.`,
      frameworks: context.conflictingFrameworks || []
    };
  }

  _flagFalseHypothesis(context) {
    const update = this.bayesianUpdate(
      context.prior,
      context.evidence
    );
    
    return {
      handled: true,
      method: 'False_Hypothesis_Flag',
      action: 'explicitly_name_and_update',
      prior: context.prior,
      evidence: context.evidence,
      posterior: update.posterior,
      softened: false // Do NOT soften
    };
  }

  _injectRedTeamChallenge(context) {
    const redTeam = this.state.redTeam;
    
    return {
      handled: true,
      method: 'Red_Team_Injection',
      action: 'designated_challenge',
      challengers: redTeam.map(r => r.id),
      challenge: 'Challenge the emerging consensus: What vulnerabilities are we ignoring?'
    };
  }

  _requestClarification(context) {
    return {
      handled: true,
      method: 'Clarification_Request',
      action: 'pause_and_request',
      questions: context.neededInfo || ['Please provide more context about your situation']
    };
  }

  bayesianUpdate(prior, evidence) {
    return this._computeBayesianUpdate.call({ state: { bayesianState: { prior, evidence } } });
  }

  // ========================================================================
  // FLOW CONTROL: 流程控制
  // ========================================================================
  
  /**
   * 运行指定Phase
   */
  async runPhase(phaseId, ...args) {
    console.log(`\n[Facilitator] 运行 Phase: ${phaseId}`);
    
    switch (phaseId) {
      case 'p0_config':
        return await this.phase0_config(args[0]);
      case 'p1_problem':
        return await this.phase1_problemDefinition();
      case 'p2_staking':
        return await this.phase2_positionStaking();
      case 'p3_conflict':
        return await this.phase3_conflictExtraction();
      case 'p4_debate':
        return await this.phase4_structuredDebate(args[0]);
      case 'p5_synthesis':
        return await this.phase5_synthesis();
      default:
        throw new Error(`Unknown phase: ${phaseId}`);
    }
  }

  /**
   * 前进到下一Phase
   */
  async advance() {
    const nextPhase = PhaseMachine.getNext(this.state.currentPhase);
    
    if (!nextPhase) {
      console.log('[Facilitator] 已经是最后一个Phase');
      return { success: false, reason: 'Already at final phase' };
    }
    
    console.log(`[Facilitator] 前进: ${this.state.currentPhase} → ${nextPhase}`);
    this.state.currentPhase = nextPhase;
    
    return { success: true, newPhase: nextPhase };
  }

  /**
   * 后退到上一Phase
   */
  async back() {
    const prevPhase = PhaseMachine.getPrev(this.state.currentPhase);
    
    if (!prevPhase) {
      console.log('[Facilitator] 已经是第一个Phase');
      return { success: false, reason: 'Already at first phase' };
    }
    
    console.log(`[Facilitator] 后退: ${this.state.currentPhase} → ${prevPhase}`);
    this.state.currentPhase = prevPhase;
    
    return { success: true, newPhase: prevPhase };
  }

  /**
   * 运行完整Session
   */
  async runFullSession(userInput) {
    console.log('\n' + '#'.repeat(60));
    console.log('# FACILITATION SESSION START');
    console.log('#'.repeat(60));
    
    // Phase 0
    await this.runPhase('p0_config', userInput);
    await this.advance();
    
    // Phase 1
    await this.runPhase('p1_problem');
    await this.advance();
    
    // Phase 2
    await this.runPhase('p2_staking');
    await this.advance();
    
    // Phase 3
    await this.runPhase('p3_conflict');
    await this.advance();
    
    // Phase 4
    await this.runPhase('p4_debate');
    await this.advance();
    
    // Phase 5
    const synthesis = await this.runPhase('p5_synthesis');
    await this.advance();
    
    // 导出档案
    const archive = this.secretary.exportArchive();
    
    console.log('\n' + '#'.repeat(60));
    console.log('# FACILITATION SESSION COMPLETE');
    console.log('#'.repeat(60));
    console.log(`总记录数: ${archive.statistics.totalSpeeches}`);
    console.log(`按Phase分布:`, archive.statistics.byPhase);
    console.log(`To-Do数量: ${archive.wiki.todos.length}`);
    console.log(`珍贵时刻: ${archive.wiki.preciousMoments.length}`);
    
    return {
      sessionId: this.sessionId,
      synthesis,
      archive
    };
  }

  // 工具方法
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 获取当前状态
  getState() {
    return { ...this.state };
  }

  // 获取记录
  getRecords() {
    return this.secretary.records;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  Facilitator,
  HypothesisTranslator,
  Secretary,
  PhaseMachine,
  MOCK_PERSONAS
};

// ============================================================================
// DEMO / TEST
// ============================================================================

async function runDemo() {
  console.log('\n' + '='.repeat(60));
  console.log('FACILITATION ENGINE DEMO');
  console.log('='.repeat(60));
  
  // 创建Facilitator实例
  const facilitator = new Facilitator({
    sessionId: `demo_${Date.now()}`,
    simplify: false
  });
  
  // 用户输入
  const userInput = `我很纠结要不要辞职创业。
目前在一家大公司做中层管理，收入稳定但觉得没有成长空间。
有一个创业想法，是关于AI赋能教育的，但担心失败后的经济压力。
不知道该选择稳定还是追求梦想。`;
  
  // 运行完整Session
  const result = await facilitator.runFullSession(userInput);
  
  // 打印最终Wiki
  console.log('\n' + '='.repeat(60));
  console.log('FINAL WIKI SUMMARY');
  console.log('='.repeat(60));
  console.log(JSON.stringify(result.archive.wiki, null, 2));
  
  return result;
}

// 如果直接运行此文件
if (require.main === module) {
  runDemo().catch(console.error);
}
