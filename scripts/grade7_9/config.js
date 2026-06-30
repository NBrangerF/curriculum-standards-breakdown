export const GRADE_BAND = 'H3'
export const GRADE_RANGE = '7-9'
export const JUNIOR_GRADES = [7, 8, 9]

export const REQUIRED_STANDARD_FIELDS = [
  'id',
  'code',
  'subject',
  'subject_slug',
  'grade_band',
  'grade_range',
  'grade',
  'domain',
  'subdomain',
  'standard',
  'context',
  'practice',
  'teaching_tip',
  'assessment_evidence_type',
  'ts_primary',
  'ts_secondary',
  'ts_rationale'
]

export const SUBJECTS = {
  chinese: {
    subject: '语文',
    prefix: 'CN',
    domains: {
      '识字与写字': 'LI',
      '阅读与鉴赏': 'READ',
      '表达与交流': 'COMM',
      '梳理与探究': 'INQ',
      '语言文字积累与梳理': 'LI',
      '文学阅读与创意表达': 'READ',
      '实用性阅读与交流': 'COMM',
      '思辨性阅读与表达': 'THINK',
      '整本书阅读': 'BOOK',
      '跨学科学习': 'XDISC',
      '学业质量': 'QUAL'
    }
  },
  math: {
    subject: '数学',
    prefix: 'MA',
    domains: {
      '数与代数': 'ALG',
      '图形与几何': 'GEO',
      '统计与概率': 'STA',
      '综合与实践': 'PRJ',
      '学业质量': 'QUAL'
    }
  },
  english: {
    subject: '英语',
    prefix: 'ENG',
    domains: {
      '语言能力': 'LANG',
      '文化意识': 'CUL',
      '思维品质': 'THINK',
      '学习能力': 'LEARN',
      '主题': 'THEME',
      '语篇': 'DISC',
      '语言知识': 'KNOW',
      '文化知识': 'CULKN',
      '语言技能': 'SKILL',
      '学习策略': 'STRAT',
      '学业质量': 'QUAL'
    }
  },
  science: {
    subject: '科学',
    prefix: 'SC',
    domains: {
      '课程目标': 'GOAL',
      '科学观念': 'SC',
      '科学思维': 'TH',
      '探究实践': 'PR',
      '态度责任': 'AR',
      '物质与能量': 'ME',
      '生命系统': 'LS',
      '地球与宇宙': 'ES',
      '技术与工程': 'TE',
      '物质的结构与性质': 'MAT',
      '物质的变化与化学反应': 'CHG',
      '物质的运动与相互作用': 'MOT',
      '能的转化与能量守恒': 'ENE',
      '生命系统的构成层次': 'LIFE',
      '生物体的稳态与调节': 'HOME',
      '生物与环境的相互关系': 'ECO',
      '生命的延续与进化': 'EVOL',
      '宇宙中的地球': 'SPACE',
      '地球系统': 'ESYS',
      '人类活动与环境': 'ENV',
      '技术、工程与社会': 'TES',
      '工程设计与物化': 'ENG',
      '学业质量': 'QUAL',
      '核心素养': 'LIT'
    }
  },
  morality_law: {
    subject: '道德与法治',
    prefix: 'ML',
    domains: {
      '道德教育': 'MOR',
      '法治教育': 'LAW',
      '国情教育': 'NAT',
      '生命安全与健康教育': 'SAFE',
      '中华优秀传统文化与革命传统教育': 'CUL',
      '中华优秀传统文化教育': 'CUL',
      '革命传统教育': 'REV',
      '学业质量': 'QUAL',
      '我与国家和社会': 'SOC',
      '成长中的我': 'SELF'
    }
  },
  it: {
    subject: '信息科技',
    prefix: 'IT',
    domains: {
      '数据与编码': 'DC',
      '身边的算法': 'ALGO',
      '过程与控制': 'CTRL',
      '信息交流与分享': 'COMM',
      '信息隐私与安全': 'SAFE',
      '在线学习与生活': 'ONLINE',
      '人工智能与智慧社会': 'AI',
      '互联网与物联网': 'IOT',
      '互联网应用与创新': 'NET',
      '物联网实践与探索': 'IOT',
      '互联智能设计': 'ID',
      '信息科技目标': 'GOAL',
      '学业质量': 'QUAL',
      '信息社会责任': 'RESP',
      '数字化学习与创新': 'DLI',
      '计算思维': 'CT'
    }
  },
  arts: {
    subject: '艺术',
    prefix: 'AR',
    domains: {
      '课程目标': 'GOAL',
      '审美感知': 'AA',
      '艺术表现': 'AE',
      '创意实践': 'CP',
      '文化理解': 'CU',
      '音乐': 'MU',
      '美术': 'VA',
      '舞蹈': 'DA',
      '戏剧（含戏曲）': 'DR',
      '影视（含数字媒体艺术）': 'FM',
      '学业质量': 'QUAL'
    }
  },
  pe: {
    subject: '体育',
    prefix: 'PE',
    domains: {
      '课程目标': 'GOAL',
      '运动能力': 'MOVE',
      '健康教育': 'HE',
      '体育品德': 'MO',
      '运动技能': 'SK',
      '体能': 'FIT',
      '基本运动技能': 'BMS',
      '专项运动技能': 'SMS',
      '跨学科主题学习': 'XDISC',
      '学业质量': 'QUAL'
    }
  },
  labor: {
    subject: '劳动',
    prefix: 'LA',
    domains: {
      '日常生活劳动': 'DL',
      '生产劳动': 'PL',
      '服务性劳动': 'SL',
      '公益劳动与志愿服务': 'VL',
      '劳动目标': 'GOAL',
      '劳动素养要求': 'LIT',
      '课程评价': 'EVAL'
    }
  }
}

export const VALID_TS = new Set(['TS1', 'TS2', 'TS3', 'TS4', 'TS5', 'TS6', 'TS7'])

export function getSubjectConfig(subjectSlug) {
  const config = SUBJECTS[subjectSlug]
  if (!config) {
    throw new Error(`Unknown subject_slug: ${subjectSlug}`)
  }
  return config
}

export function gradeLabel(grade) {
  const map = {
    7: '七年级',
    8: '八年级',
    9: '九年级'
  }
  return map[Number(grade)] || `${grade}年级`
}

export function slugifyDomain(domain, subjectSlug) {
  const config = getSubjectConfig(subjectSlug)
  if (config.domains[domain]) return config.domains[domain]
  const compact = String(domain || 'GEN')
    .replace(/[^\p{Script=Han}A-Za-z0-9]+/gu, ' ')
    .trim()
  if (!compact) return 'GEN'
  const ascii = compact.match(/[A-Za-z0-9]+/g)
  if (ascii?.length) return ascii.join('').slice(0, 8).toUpperCase()
  return 'GEN'
}

export function emptyStandard() {
  return {
    id: '',
    code: '',
    subject: '',
    subject_slug: '',
    grade_band: GRADE_BAND,
    grade_range: GRADE_RANGE,
    grade: '',
    domain: '',
    subdomain: '',
    standard: '',
    context: '',
    practice: '',
    teaching_tip: '',
    assessment_evidence_type: '',
    ts_primary: [],
    ts_secondary: [],
    ts_rationale: ''
  }
}
