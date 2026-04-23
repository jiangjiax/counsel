// ============================================
// Roundtable Advisor - 数据定义
// ============================================

// 12位幕僚数据
const MASTERS = [
  {
    id: 'brucelee',
    av: '🥋',
    name: '李小龙',
    role: '实践哲人',
    bg: '截拳道创始人，功夫巨星',
    philosophy: '如水般适应，保持空杯心态',
    method: '在实战中检验真理，不拘泥于形式',
    values: ['实用主义', '自我表达', '持续精进'],
    quote: '我不害怕练过一万种腿法的人，我害怕把一种腿法练一万次的人。',
    said: false,
    tags: ['执行力', '适应变化', '专注核心']
  },
  {
    id: 'mao',
    av: '📚',
    name: '毛泽东',
    role: '战略家',
    bg: '中国革命战略家，《矛盾论》《实践论》作者',
    philosophy: '实事求是，群众路线，独立自主',
    method: '调查研究→群众路线→试点验证',
    values: ['群众路线', '独立自主', '实事求是'],
    quote: '没有调查，就没有发言权。',
    said: false,
    tags: ['战略定力', '矛盾分析', '群众路线']
  },
  {
    id: 'laozi',
    av: '☯️',
    name: '老子',
    role: '道家智者',
    bg: '《道德经》作者，道家思想创始人',
    philosophy: '道法自然，无为而无不为',
    method: '反者道之动，弱者道之用',
    values: ['顺应自然', '简朴克制', '以柔克刚'],
    quote: '知人者智，自知者明。胜人者有力，自胜者强。',
    said: false,
    tags: ['顺势而为', '长期主义', '内在平静']
  },
  {
    id: 'huineng',
    av: '🧘',
    name: '六祖慧能',
    role: '禅宗六祖',
    bg: '禅宗南宗创始人，主张顿悟',
    philosophy: '明心见性，直指人心',
    method: '不立文字，教外别传，直指人心',
    values: ['顿悟本性', '平常心', '破除执着'],
    quote: '菩提本无树，明镜亦非台。本来无一物，何处惹尘埃。',
    said: false,
    tags: ['内心平静', '本质洞察', '放下执念']
  },
  {
    id: 'qianxuesen',
    av: '🚀',
    name: '钱学森',
    role: '系统科学家',
    bg: '中国航天之父，系统科学奠基人',
    philosophy: '系统工程思维，复杂系统管理',
    method: '整体优化，分解协调，反馈迭代',
    values: ['系统思维', '科学严谨', '家国情怀'],
    quote: '正确的结果，是从大量错误中得出来的。',
    said: false,
    tags: ['系统分析', '跨学科', '严谨验证']
  },
  {
    id: 'einstein',
    av: '🌟',
    name: '爱因斯坦',
    role: '理论物理学家',
    bg: '相对论创立者，现代物理学奠基人',
    philosophy: '想象力比知识更重要',
    method: '思想实验→数学建模→实验验证',
    values: ['好奇心', '独立思考', '简单优雅'],
    quote: '如果你不能简单地解释它，说明你还不够了解它。',
    said: false,
    tags: ['第一性原理', '好奇心', '简单之美']
  },
  {
    id: 'jobs',
    av: '🍎',
    name: '史蒂夫·乔布斯',
    role: '产品大师',
    bg: '苹果公司联合创始人，产品设计与体验先驱',
    philosophy: 'Stay Hungry, Stay Foolish',
    method: '人文+科技的交汇点，极致用户体验',
    values: ['极简主义', '完美主义', '颠覆创新'],
    quote: '保持饥饿，保持愚蠢。',
    said: false,
    tags: ['产品直觉', '用户中心', '整合创新']
  },
  {
    id: 'kk',
    av: '📡',
    name: 'Kevin Kelly',
    role: '科技预言家',
    bg: '《连线》杂志创始主编，《失控》《必然》作者',
    philosophy: '理解技术演化规律，拥抱不确定性',
    method: '长期趋势观察，技术与社会交叉分析',
    values: ['技术乐观', '长期视角', '开放协作'],
    quote: '未来已经到来，只是分布不均。',
    said: false,
    tags: ['技术趋势', '长期视角', '网络效应']
  },
  {
    id: 'pg',
    av: '💻',
    name: 'Paul Graham',
    role: '创业导师',
    bg: 'Y Combinator联合创始人，Lisp程序员',
    philosophy: '做人们想要的东西，解决真实问题',
    method: '快速原型→用户反馈→迭代优化',
    values: ['黑客精神', '快速成长', '独立思考'],
    quote: '做不可扩展的事，然后扩展它。',
    said: false,
    tags: ['快速验证', 'PMF', '技术驱动']
  },
  {
    id: 'bezos',
    av: '📦',
    name: '杰夫·贝佐斯',
    role: '长期主义者',
    bg: '亚马逊创始人，Day 1文化缔造者',
    philosophy: '长期主义，客户至上，Day 1心态',
    method: '逆向工作法→客户体验→规模化',
    values: ['长期主义', '客户痴迷', '决策质量'],
    quote: '你的利润就是我的机会。',
    said: false,
    tags: ['长期主义', '客户至上', '决策框架']
  },
  {
    id: 'musk',
    av: '🔥',
    name: '埃隆·马斯克',
    role: '第一性原理践行者',
    bg: '特斯拉、SpaceX、Neuralink创始人',
    philosophy: '第一性原理思维，大胆创新',
    method: '物理思维→质疑假设→十倍改进',
    values: ['第一性原理', '极度求真', '冒险精神'],
    quote: '第一性原理：把事物拆解到最基本的真理，然后从零开始构建。',
    said: false,
    tags: ['第一性原理', '十倍思维', '风险承受']
  },
  {
    id: 'a16z',
    av: '🏛️',
    name: 'a16z',
    role: '硅谷智库',
    bg: 'Andreessen Horowitz，顶级风投机构',
    philosophy: '软件正在吞噬世界',
    method: '网络效应→平台思维→生态构建',
    values: ['技术信仰', '网络效应', '颠覆传统'],
    quote: '软件正在吞噬世界，而我们将加速这一过程。',
    said: false,
    tags: ['网络效应', '平台战略', '生态思维']
  }
];

// 从MASTERS生成PROFILES，加上主持人
const PROFILES = {
  host: {
    id: 'host',
    av: '🎯',
    name: '主持人',
    role: '圆桌召集人',
    philosophy: '激发集体智慧，引导深度对话',
    quote: '让我们一起，从不同维度审视这个问题。'
  }
};

// 添加所有幕僚到PROFILES
MASTERS.forEach(m => {
  PROFILES[m.id] = {
    id: m.id,
    av: m.av,
    name: m.name,
    role: m.role,
    philosophy: m.philosophy,
    quote: m.quote
  };
});

// S4独立思考阶段发言数据
const S4_SPEECHES = [
  {
    id: 'brucelee',
    av: '🥋',
    name: '李小龙',
    short: '像水一样适应形势，保持空杯心态',
    full: `
      <p><strong>李小龙：</strong>你的问题让我想起截拳道的核心——<span class="highlight">如水般适应</span>。</p>
      <p>不要纠结于"应该怎么做"，而要问"什么方法在这个情境下最有效"。</p>
      <p>你的优势在哪里？把核心能力练到极致，其他的交给合作。</p>
    `
  },
  {
    id: 'mao',
    av: '📚',
    name: '毛泽东',
    short: '主要矛盾是什么？抓住主要矛盾才能破局',
    full: `
      <p><strong>毛泽东：</strong>首先要做<span class="highlight">调查研究</span>，没有调查就没有发言权。</p>
      <p>然后找出<span class="highlight">主要矛盾</span>——当前最制约你的因素是什么？是资金？能力？还是时机？</p>
      <p>抓住主要矛盾，次要矛盾会迎刃而解。</p>
    `
  },
  {
    id: 'laozi',
    av: '☯️',
    name: '老子',
    short: '反者道之动，有时候后退是更大的前进',
    full: `
      <p><strong>老子：</strong><span class="highlight">反者道之动</span>——事物发展到极端就会转向反面。</p>
      <p>急于求成反而容易失败。有时候<span class="highlight">以退为进</span>，蓄势待发，是更明智的选择。</p>
      <p>顺应自然规律，不要逆势而为。</p>
    `
  },
  {
    id: 'huineng',
    av: '🧘',
    name: '六祖慧能',
    short: '放下执念，答案就在你心中',
    full: `
      <p><strong>六祖慧能：</strong><span class="highlight">明心见性</span>，答案其实在你心里。</p>
      <p>你被什么执念困住了？是恐惧失败？还是贪恋安稳？</p>
      <p>放下这些执着，内心自然会告诉你正确的方向。</p>
    `
  },
  {
    id: 'qianxuesen',
    av: '🚀',
    name: '钱学森',
    short: '用系统思维拆解，找到最优解',
    full: `
      <p><strong>钱学森：</strong>这是一个<span class="highlight">复杂系统问题</span>，需要用系统思维分析。</p>
      <p>把大问题拆解成子系统：市场环境、个人能力、资源约束、时间节点。</p>
      <p>找出各子系统的关联和瓶颈，整体优化才能找到最优解。</p>
    `
  },
  {
    id: 'einstein',
    av: '🌟',
    name: '爱因斯坦',
    short: '重新定义问题，跳出框架思考',
    full: `
      <p><strong>爱因斯坦：</strong>如果你用制造问题时的思维来解决问题，那是不可能的。</p>
      <p><span class="highlight">重新定义问题</span>——你的真实目标是什么？有没有其他路径可以达到？</p>
      <p>想象力比知识更重要，不要被现有框架限制。</p>
    `
  },
  {
    id: 'jobs',
    av: '🍎',
    name: '史蒂夫·乔布斯',
    short: '找到人文与技术的交汇点',
    full: `
      <p><strong>乔布斯：</strong>成功的关键是找到<span class="highlight">人文与技术的交汇点</span>。</p>
      <p>你的决策不仅要理性分析，更要符合内心真正的渴望。</p>
      <p>Stay Hungry, Stay Foolish. 保持初心，勇敢前行。</p>
    `
  },
  {
    id: 'kk',
    av: '📡',
    name: 'Kevin Kelly',
    short: '看10年后的趋势，现在该怎么做？',
    full: `
      <p><strong>Kevin Kelly：</strong>把视野拉长到<span class="highlight">10年后</span>，这个领域会发生什么变化？</p>
      <p>技术发展往往呈指数级增长，现在的劣势可能是未来的优势。</p>
      <p>拥抱不确定性，在变化中寻找机会。</p>
    `
  },
  {
    id: 'pg',
    av: '💻',
    name: 'Paul Graham',
    short: '做不可扩展的事，先解决眼前问题',
    full: `
      <p><strong>Paul Graham：</strong>创业早期要做<span class="highlight">不可扩展的事</span>——亲力亲为服务每一个用户。</p>
      <p>先验证核心价值，再考虑规模化。完美规划不如快速试错。</p>
      <p>人们真正想要什么？去和他们聊聊。</p>
    `
  },
  {
    id: 'bezos',
    av: '📦',
    name: '杰夫·贝佐斯',
    short: '遗憾最小化框架：80岁时会后悔吗？',
    full: `
      <p><strong>贝佐斯：</strong>我用<span class="highlight">遗憾最小化框架</span>做重大决策。</p>
      <p>想象自己80岁时回望今天，哪个选择会让你更少遗憾？</p>
      <p>大多数后悔的不是做过什么，而是没做什么。</p>
    `
  },
  {
    id: 'musk',
    av: '🔥',
    name: '埃隆·马斯克',
    short: '用第一性原理拆解到本质',
    full: `
      <p><strong>马斯克：</strong>用<span class="highlight">第一性原理</span>思考——把问题拆解到最基本的真理。</p>
      <p>质疑每一个假设：这件事为什么是现在这样？有没有更好的方式？</p>
      <p>物理告诉我们什么是可能的，其他都是心理限制。</p>
    `
  },
  {
    id: 'a16z',
    av: '🏛️',
    name: 'a16z',
    short: '思考网络效应和平台机会',
    full: `
      <p><strong>a16z：</strong>思考这个决策能否产生<span class="highlight">网络效应</span>。</p>
      <p>是做一个线性的生意，还是能构建一个平台？</p>
      <p>软件正在吞噬世界，你的决策要顺势而为。</p>
    `
  }
];

// 8个步骤定义
const STEPS = [
  { id: 0, key: 'input', name: '输入', desc: '输入你的决策困境' },
  { id: 1, key: 'clarify', name: '定问题', desc: '澄清核心问题' },
  { id: 2, key: 'facts', name: '挖事实', desc: '挖掘关键事实' },
  { id: 3, key: 'independent', name: '独立思考', desc: '幕僚独立思考' },
  { id: 4, key: 'dimensions', name: '拆维度', desc: '拆解分析维度' },
  { id: 5, key: 'debate', name: '辩论', desc: '多轮观点交锋' },
  { id: 6, key: 'summary', name: '汇总', desc: '总结核心共识' },
  { id: 7, key: 'harvest', name: '摘果子', desc: '形成行动方案' }
];

// 各步骤进度百分比
const PCTS = {
  input: 0,
  clarify: 15,
  facts: 30,
  independent: 45,
  dimensions: 60,
  debate: 75,
  summary: 90,
  harvest: 100
};

// 环形位置坐标（r=210, cx=270, cy=270）
const RING_POS = [
  { x: 270, y: 60 },    // 0° - 顶部
  { x: 375, y: 95 },    // 30°
  { x: 445, y: 165 },   // 60°
  { x: 480, y: 270 },   // 90° - 右侧
  { x: 445, y: 375 },   // 120°
  { x: 375, y: 445 },   // 150°
  { x: 270, y: 480 },   // 180° - 底部
  { x: 165, y: 445 },   // 210°
  { x: 95, y: 375 },    // 240°
  { x: 60, y: 270 },    // 270° - 左侧
  { x: 95, y: 165 },    // 300°
  { x: 165, y: 95 }     // 330°
];

// 三层结构示例数据
const PACKAGES_DATA = {
  '创业决策包': {
    id: 'startup',
    name: '创业决策包',
    icon: '🚀',
    description: '创业相关的决策支持',
    projects: {
      '项目1-产品方向验证': {
        id: 'p1',
        name: '产品方向验证',
        rounds: [
          { id: 'r1', title: '第一轮：用户需求验证', date: '2024-01-15', status: 'completed', progress: 100 },
          { id: 'r2', title: '第二轮：MVP功能取舍', date: '2024-02-01', status: 'completed', progress: 100 },
          { id: 'r3', title: '第三轮：商业模式调整', date: '2024-02-20', status: 'active', progress: 65 }
        ]
      },
      '项目2-合伙人评估': {
        id: 'p2',
        name: '合伙人评估',
        rounds: [
          { id: 'r1', title: '第一轮：能力与互补性', date: '2024-01-20', status: 'completed', progress: 100 },
          { id: 'r2', title: '第二轮：股权分配方案', date: '2024-02-10', status: 'active', progress: 40 }
        ]
      },
      '项目3-要不要全职创业': {
        id: 'p3',
        name: '要不要全职创业',
        rounds: [
          { id: 'r1', title: '第一轮：风险与收益评估', date: '2024-01-25', status: 'completed', progress: 100 },
          { id: 'r2', title: '第二轮：时机选择', date: '2024-02-15', status: 'completed', progress: 100 },
          { id: 'r3', title: '第三轮：备选方案设计', date: '2024-03-01', status: 'active', progress: 20 }
        ]
      }
    }
  },
  '职业发展包': {
    id: 'career',
    name: '职业发展包',
    icon: '💼',
    description: '职业规划和转型决策',
    projects: {
      '项目1-是否接受海外调动': {
        id: 'p1',
        name: '是否接受海外调动',
        rounds: [
          { id: 'r1', title: '第一轮：职业发展影响', date: '2024-01-10', status: 'completed', progress: 100 },
          { id: 'r2', title: '第二轮：家庭与个人考量', date: '2024-01-30', status: 'active', progress: 55 }
        ]
      },
      '项目2-转行AI可行性': {
        id: 'p2',
        name: '转行AI可行性',
        rounds: [
          { id: 'r1', title: '第一轮：技能差距分析', date: '2024-02-05', status: 'completed', progress: 100 },
          { id: 'r2', title: '第二轮：转型路径规划', date: '2024-02-25', status: 'completed', progress: 100 },
          { id: 'r3', title: '第三轮：机会成本评估', date: '2024-03-10', status: 'active', progress: 30 }
        ]
      }
    }
  }
};

// 导出所有数据（如需要模块化使用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MASTERS,
    PROFILES,
    S4_SPEECHES,
    STEPS,
    PCTS,
    RING_POS,
    PACKAGES_DATA
  };
}
