#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  TARGET_GRADE_BANDS,
  markdownCell,
  normalizeText,
  recordsByGroup,
  shortHash,
  subjectFiles,
  writeJson,
  writeText,
  readJson
} from './h4g_supplemental_pipeline_utils.js'
import { SUBJECTS } from './config.js'

const CONTRACT_VERSION = 'H4G_SOURCE_ALIGNED_STANDARD_REWRITE_V2_CONTRACT_v0.1'
const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUT_DIR = 'generated/h4g_source_aligned_standard_rewrite_v2'

const GENERIC_NAME_TOKENS = [
  '第三学段',
  '第四学段',
  '学段目标',
  '学业质量',
  '第三学段质量',
  '第四学段质量',
  '内容结构',
  '综合学业要求',
  '水平四内容结构',
  '跨学科主题学习',
  '劳动观念',
  '劳动精神',
  '劳动能力',
  '劳动习惯',
  '劳动品质',
  '核心理念',
  '科学观念',
  '科学思维',
  '探究实践',
  '态度责任',
  '科学探究表现',
  '科学观念综合表现',
  '态度责任表现',
  '物质生命地球与工程观念'
]

const FORBIDDEN_TEMPLATE_TOKENS = [
  '围绕“',
  '关键要求',
  '候选',
  '本次补强',
  '原始标准',
  '可预览',
  '可观察',
  '可评价',
  '能结合“',
  '核心要求',
  '能综合运用',
  '至少3件富有创意',
  '创作至少3件富有创意'
]

const FORBIDDEN_FLUENCY_TOKENS = [
  '能并',
  '综合运用能',
  '能第三学段',
  '能第四学段',
  '能写作有',
  '能写作时',
  '能时能',
  '时能时能',
  '能不同',
  '功，能',
  '，能量',
  '，能源',
  '能在学习与生活中累计认识3500个左右常用汉字',
  '能综合运用在'
]

const GRADE_PROFILES = {
  H4G7: {
    label: '七年级',
    demand: '识别、理解、描述、单步骤应用、熟悉情境',
    leadMode: 'entry'
  },
  H4G8: {
    label: '八年级',
    demand: '比较、整合、解释、推断、多步骤应用、关系化理解',
    leadMode: 'analysis'
  },
  H4G9: {
    label: '九年级',
    demand: '迁移、评价、论证、综合探究、真实情境问题解决',
    leadMode: 'transfer'
  }
}

const SOURCE_CUE_WEIGHTS = {
  H4G7: ['理解', '了解', '知道', '识别', '描述', '基本', '简单', '熟悉', '掌握', '感受', '体验'],
  H4G8: ['比较', '分析', '解释', '整合', '应用', '运用', '组织', '设计', '调查', '合作', '多步骤', '关系'],
  H4G9: ['评价', '论证', '迁移', '优化', '反思', '判断', '独立', '真实', '责任', '创新', '改进', '阐释']
}

const TASK_SPECIFIC_TOKENS = [
  '脚本', '拍摄', '剪辑', '合唱', '声部', '指挥', '识谱', '节奏', '旋律', '和弦', '乐器', '舞蹈', '戏剧', '影视',
  '媒介', '新闻', '议论', '观点', '证据', '古诗文', '检字', '书法', '写作', '实验', '调研', '报告', '模型',
  '算法', '数据', '物联网', '人工智能', '网络', '安全', '法治', '规则', '比赛', '体能', '健康', '劳动', '服务',
  '公益', '生产', '统计', '方程', '函数', '几何', '概率', '核心概念'
]

function parseArgs(argv) {
  const args = {
    dataRoot: DEFAULT_DATA_ROOT,
    outDir: DEFAULT_OUT_DIR,
    reviewDecisions: '',
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out-dir') args.outDir = argv[++i]
    else if (item === '--review-decisions') args.reviewDecisions = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
npm run grade7_9:h4g-source-aligned-standard-rewrite-v2-candidate -- --review-decisions /path/to/review.json --strict

Builds a full H4G G7/G8/G9 v2 source-aligned rewrite candidate. Writes only
under generated/.`)
}

function copyJsonTree(sourceRoot, targetRoot) {
  mkdirSync(targetRoot, { recursive: true })
  for (const name of readdirSync(sourceRoot)) {
    const source = join(sourceRoot, name)
    const target = join(targetRoot, name)
    const stat = statSync(source)
    if (stat.isDirectory()) copyJsonTree(source, target)
    else if (name.endsWith('.json')) copyFileSync(source, target)
  }
}

function isH4G(record) {
  return TARGET_GRADE_BANDS.includes(record.grade_band)
}

function groupId(record) {
  return record.progression_group_id || record.code
}

function compactText(value) {
  return normalizeText(value).replace(/\s+/g, '')
}

function visibleTopic(record) {
  return normalizeText(record.subdomain || record.source_anchor_subcategory || record.domain || '')
}

function hasGenericName(value) {
  const text = normalizeText(value)
  return GENERIC_NAME_TOKENS.some(token => text.includes(token))
}

function normalizeClause(value) {
  let text = normalizeText(value)
  text = text.replace(/^[第]?[三四]学段结束时[，,]?/u, '')
  text = text.replace(/^学生能够/u, '能')
  text = text.replace(/^学生能/u, '能')
  text = text.replace(/^并能/u, '能')
  text = text.replace(/^并/u, '')
  text = text.replace(/^写作(?!时能)/u, '写作时能')
  text = text.replace(/[。；;，,]+$/u, '')
  text = text.replace(/\s+/g, '')
  text = text.replace(/^(阅读[^，,。；;]{2,24})能(?=区分|描述|说明|运用|比较|完成|获取|表达|判断|解释|设计|提出|识别|说出|列举|分析|理解|知道|掌握|观察|记录|参与|形成)/u, '$1，能')
  text = text.replace(/能并/u, '能')
  text = text.replace(/，+/gu, '，')
  return text
}

function splitClauses(text) {
  const normalized = normalizeText(text)
  if (!normalized) return []
  const coarse = normalized.split(/[。；;]/u)
  const clauses = []
  for (const part of coarse) {
    const subparts = part.length > 48 ? part.split(/[，,]/u) : [part]
    for (const subpart of subparts) {
      const clause = normalizeClause(subpart)
      if (
        clause.length >= 4 &&
        !/^[第]?[三四]学段结束时$/u.test(clause) &&
        !clauses.includes(clause)
      ) clauses.push(clause)
    }
  }
  return clauses
}

function isSimilar(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  const aChars = new Set([...compactText(a)])
  const bChars = new Set([...compactText(b)])
  const overlap = [...aChars].filter(ch => bChars.has(ch)).length
  return overlap / Math.max(1, Math.min(aChars.size, bChars.size)) > 0.82
}

function cueScore(clause, gradeBand) {
  const cues = SOURCE_CUE_WEIGHTS[gradeBand] || []
  let score = 0
  for (const cue of cues) if (clause.includes(cue)) score += 2
  if (gradeBand === 'H4G7' && clause.length <= 26) score += 1
  if (gradeBand === 'H4G8' && clause.length > 16 && clause.length <= 48) score += 1
  if (gradeBand === 'H4G9' && clause.length >= 20) score += 1
  return score
}

function topicScore(clause, topic, record) {
  const text = `${topic}${record.domain || ''}${record.source_anchor_subcategory || ''}${JSON.stringify(record.source_anchor_tags || {})}`
  const topicChars = new Set([...compactText(text)])
  let score = 0
  for (const ch of new Set([...compactText(clause)])) if (topicChars.has(ch)) score += 0.15
  for (const token of TASK_SPECIFIC_TOKENS) if (clause.includes(token) || text.includes(token)) score += clause.includes(token) ? 2 : 0
  if (record.subject_slug === 'pe' && /学业表现|QUAL/u.test(`${topic}${record.code || ''}`)) {
    if (/角色意识|责任意识|安全隐患|运动损伤|紧张情绪|沟通合作|高水平比赛/u.test(clause)) score += 5
  }
  if (record.subject_slug === 'pe' && /完整技术|裁判|SMS/u.test(`${topic}${record.code || ''}`)) {
    if (/完整动作技术|比赛规则|裁判|展示或比赛/u.test(clause)) score += 5
  }
  return score
}

function sourceTopicAlignment(text, topic, record) {
  const clean = value => compactText(cleanTopicCandidate(value))
    .replace(/[的地得和与及或并在中为对能会要以把从是了到于其相关任务问题内容主题学科课程标准目标]/gu, '')
  const topicText = clean(`${topic || ''}${record.domain || ''}${record.source_anchor_subcategory || ''}`)
  const sourceText = clean(text)
  if (!topicText || !sourceText) return 0
  const topicGrams = new Set()
  for (let i = 0; i < topicText.length - 1; i += 1) topicGrams.add(topicText.slice(i, i + 2))
  if (!topicGrams.size) {
    const topicChars = new Set([...topicText])
    let charHits = 0
    for (const ch of topicChars) if (sourceText.includes(ch)) charHits += 1
    return Number((charHits / topicChars.size).toFixed(4))
  }
  let hits = 0
  for (const gram of topicGrams) if (sourceText.includes(gram)) hits += 1
  return Number((hits / topicGrams.size).toFixed(4))
}

function sortedClausesForGrade(clauses, gradeBand, topic, record) {
  return [...clauses].sort((a, b) => {
    const score = (cueScore(b, gradeBand) + topicScore(b, topic, record)) -
      (cueScore(a, gradeBand) + topicScore(a, topic, record))
    if (score) return score
    return clauses.indexOf(a) - clauses.indexOf(b)
  })
}

function filterAwkwardClause(clause) {
  if (!clause) return false
  if (clause.includes('至少3件富有创意')) return false
  if (clause.includes('创作至少3件')) return false
  if (/^第三学段|^第四学段/u.test(clause)) return false
  return true
}

function sourceSpecificity(text) {
  const clauses = splitClauses(text)
  const joined = normalizeText(text)
  const taskHits = TASK_SPECIFIC_TOKENS.filter(token => joined.includes(token)).length
  const genericPenalty = GENERIC_NAME_TOKENS.filter(token => joined.includes(token)).length
  const digitBonus = /\d|一|二|三|四|五/u.test(joined) ? 1 : 0
  return Number((taskHits * 1.8 + clauses.length * 0.4 + digitBonus - genericPenalty * 1.2).toFixed(2))
}

function loadReviewDecisions(path) {
  if (!path || !existsSync(path)) return { decisions: {}, path: '' }
  const payload = readJson(path)
  return { decisions: payload.decisions || {}, path }
}

function decisionFor(record, reviewDecisions) {
  return reviewDecisions[groupId(record)] || null
}

function reviewWantsSupporting(decision) {
  const note = normalizeText(decision?.note)
  return /supporting source|supporting|基于 supporting|请基于 supporting/u.test(note)
}

function materialDifference(a, b) {
  const left = compactText(a)
  const right = compactText(b)
  if (!left || !right) return false
  if (left === right) return false
  if (left.includes(right) || right.includes(left)) return Math.abs(left.length - right.length) > 18
  return true
}

function sourceRole(record, decision) {
  const corrected = normalizeText(record.source_standard_original)
  const supporting = normalizeText(record.supporting_source_standard_original)
  const previous = normalizeText(record.previous_source_standard_original)
  const supportDifferent = materialDifference(corrected, supporting)
  const previousDifferent = materialDifference(corrected, previous)
  const genericName = hasGenericName(visibleTopic(record)) || hasGenericName(record.source_anchor_subcategory)
  const supportSpecificity = sourceSpecificity(supporting)
  const correctedSpecificity = sourceSpecificity(corrected)
  const currentTopic = cleanTopicCandidate(visibleTopic(record))
  const topic = currentTopic && !hasGenericName(currentTopic) ? currentTopic : topicFromText(record, `${supporting}；${corrected}`)
  const supportAlignment = sourceTopicAlignment(supporting, topic, record)
  const correctedAlignment = sourceTopicAlignment(corrected, topic, record)

  if (supporting && supportDifferent && reviewWantsSupporting(decision)) return 'supporting_primary'
  if (supporting && supportDifferent && ['needs_fix', 'rejected'].includes(decision?.status)) return 'supporting_primary'
  if (supporting && supportDifferent && genericName) return 'supporting_primary'
  if (supporting && supportDifferent && supportAlignment >= correctedAlignment + 0.18) return 'supporting_primary'
  if (supporting && supportDifferent && supportSpecificity >= correctedSpecificity + 1.2) return 'supporting_primary'
  if (previous && previousDifferent && !supportDifferent && genericName) return 'previous_primary'
  if (supporting && supportDifferent && ['arts', 'chinese', 'english', 'pe', 'labor'].includes(record.subject_slug)) return 'mixed_primary'
  return 'corrected_primary'
}

function primarySourceText(record, role) {
  if (role === 'supporting_primary') return normalizeText(record.supporting_source_standard_original)
  if (role === 'previous_primary') return normalizeText(record.previous_source_standard_original)
  if (role === 'mixed_primary') return normalizeText(record.supporting_source_standard_original)
  return normalizeText(record.source_standard_original)
}

function supportingCandidateText(record, role) {
  if (role === 'supporting_primary') return normalizeText(record.source_standard_original)
  if (role === 'previous_primary') return `${record.supporting_source_standard_original || ''}；${record.source_standard_original || ''}`
  if (role === 'mixed_primary') return `${record.source_standard_original || ''}；${record.previous_source_standard_original || ''}`
  return `${record.supporting_source_standard_original || ''}；${record.previous_source_standard_original || ''}`
}

function cleanTopicCandidate(value) {
  return normalizeText(value)
    .replace(/第[三四]学段质量/gu, '')
    .replace(/第[三四]学段目标/gu, '')
    .replace(/第[三四]学段/gu, '')
    .replace(/学段目标/gu, '')
    .replace(/学业质量/gu, '')
    .replace(/内容结构/gu, '')
    .replace(/综合学业要求/gu, '')
    .replace(/水平四/gu, '')
    .replace(/^[:：、\s]+|[:：、\s]+$/gu, '')
}

function numberedSourceAnchorTopic(record) {
  const value = cleanTopicCandidate(record.source_anchor_subcategory)
  if (/^\d+(?:\.\d+)?\s+\S/u.test(value)) return value
  return ''
}

function artDiscipline(record) {
  return normalizeText(record.art_discipline_tag || record.source_anchor_tags?.art_discipline_tag || record.source_anchor_subcategory || '')
}

function artsFocusSuffix(record, sourceText) {
  const current = visibleTopic(record)
  const text = `${current} ${record.source_anchor_subcategory || ''} ${sourceText || ''}`
  const discipline = artDiscipline(record)
  const byDiscipline = /音乐/u.test(discipline)
    ? [
        [/节奏|节拍|旋律|情感内涵|音乐要素/u, '要素情感'],
        [/音色|结构|体裁|复调/u, '音色结构'],
        [/民族音乐|民歌|世界民族/u, '民族音乐'],
        [/姊妹艺术|戏曲|曲艺|综合艺术/u, '综合艺术'],
        [/演唱|齐唱|轮唱|合唱|背唱|指挥|识谱/u, '演唱识谱'],
        [/演唱评价|评价反馈/u, '表现评价'],
        [/演奏|器乐|乐器|合奏|课堂乐器/u, '器乐合奏'],
        [/即兴|声势|律动|配乐|伴奏/u, '即兴编创'],
        [/音乐故事|音乐剧|情景剧|音乐游戏/u, '音乐剧创演'],
        [/生活音乐|社会音乐|信息技术|媒介/u, '生活媒介'],
        [/主题构思|作品完善|创作主题/u, '主题创作'],
        [/作品|评述/u, '作品评述']
      ]
    : /美术/u.test(discipline)
      ? [
          [/世界美术|中外美术|美术史|流派/u, '美术史评述'],
          [/造型|写实|夸张|变形|抽象/u, '造型创作'],
          [/环境|社区|学校|公共空间/u, '环境设计'],
          [/传统工艺|非遗|陶艺|文创/u, '传统工艺'],
          [/校园微电影|微电影/u, '校园影像'],
          [/社会贡献|社会责任|政治|文化|经济|科技/u, '社会表达'],
          [/作品|评述/u, '作品评述']
        ]
      : /舞蹈/u.test(discipline)
        ? [
            [/多舞种|舞种|风格舞蹈|风格特征/u, '舞种风格'],
            [/舞段|队列|造型/u, '舞段合作'],
            [/舞蹈小品|即兴舞蹈|小品/u, '小品编排'],
            [/经典作品|欣赏与体验|作品/u, '作品理解']
          ]
        : /戏剧/u.test(discipline)
          ? [
              [/戏剧游戏.*语言|语言与肢体|无实物|肢体/u, '语言肢体'],
              [/合作与审美|团队合作|信念感/u, '合作审美'],
              [/舞台剧目|角色|剧目演出/u, '角色创演'],
              [/脚本|文本|编演故事|小品或短剧/u, '文本创编'],
              [/教育戏剧|戏剧化活动|策划/u, '活动设计'],
              [/观剧|心得|作品|评述/u, '作品评述']
            ]
          : /影视|数字媒体/u.test(discipline)
            ? [
                [/拍摄|运动画面|声音录制/u, '拍摄录音'],
                [/剪辑|合成|组接/u, '剪辑合成'],
                [/数字媒体|互动形式|媒体环境/u, '数字媒介'],
                [/叙事|编导故事|讲述故事/u, '叙事表达'],
                [/历史/u, '历史表达'],
                [/记录生活|现实生活|纪实/u, '生活记录'],
                [/作品|评述/u, '作品评述']
              ]
            : []
  const match = value => {
    for (const [pattern, suffix] of byDiscipline) if (pattern.test(value)) return suffix
    return ''
  }
  return match(current) || match(text)
}

function artsCompetencyTopic(record, sourceText) {
  const text = `${visibleTopic(record)} ${record.domain || ''} ${record.source_anchor_subcategory || ''} ${sourceText || ''}`
  const discipline = artDiscipline(record)
  const domain = normalizeText(record.domain)
  const withSuffix = base => {
    const suffix = artsFocusSuffix(record, sourceText)
    return suffix ? `${base}：${suffix}` : base
  }

  if (/音乐/u.test(discipline)) {
    if (domain === '审美感知') {
      if (/民族|世界|文化|社会|生活|姊妹艺术|戏曲|舞蹈|影视/u.test(text)) return withSuffix('音乐审美感知与文化理解')
      return withSuffix('音乐要素感知与审美判断')
    }
    if (domain === '艺术表现') {
      if (/演唱|合唱|指挥|识谱|声部/u.test(text)) return withSuffix('音乐演唱与合作表现')
      if (/演奏|器乐|乐器|合奏/u.test(text)) return withSuffix('器乐演奏与合奏表现')
      return withSuffix('音乐表现与合作表达')
    }
    if (domain === '创意实践') {
      if (/融合|综合|舞美|综合性艺术/u.test(text)) return withSuffix('综合艺术表演与创意设计')
      return withSuffix('音乐编创记录与作品完善')
    }
    return withSuffix('音乐文化理解与社会联系')
  }

  if (/美术/u.test(discipline)) {
    if (domain === '审美感知') return withSuffix('美术欣赏评述与审美判断')
    if (domain === '艺术表现') return withSuffix('美术造型表现与创意表达')
    if (/设计|社区|环境|非遗|传统|工艺|文创|微电影|综合探索/u.test(text)) return withSuffix('美术设计应用与综合探索')
    return withSuffix(domain === '文化理解' ? '美术文化理解与传承表达' : '美术创意实践与综合探索')
  }

  if (/舞蹈/u.test(discipline)) {
    if (domain === '艺术表现') return withSuffix('舞蹈语汇表现与风格表达')
    if (domain === '创意实践') return withSuffix('舞蹈编创与合作表达')
    return withSuffix('舞蹈审美感知与文化理解')
  }

  if (/戏剧/u.test(discipline)) {
    if (domain === '艺术表现') return withSuffix('戏剧角色表现与合作创演')
    if (domain === '创意实践') {
      if (/教育戏剧|活动|策划/u.test(text)) return withSuffix('戏剧活动设计与跨学科表达')
      return withSuffix('戏剧文本创编与舞台表达')
    }
    return withSuffix('戏剧作品理解与文化表达')
  }

  if (/影视|数字媒体/u.test(discipline)) {
    if (domain === '艺术表现') return withSuffix('影视技术体验与视听表现')
    if (domain === '创意实践') return withSuffix('影视叙事记录与数字创作')
    return withSuffix('影视语言理解与文化表达')
  }

  return withSuffix('艺术核心素养综合表现')
}

function topicFromText(record, sourceText) {
  const text = `${visibleTopic(record)} ${record.source_anchor_subcategory || ''} ${sourceText || ''}`
  if (record.subject_slug === 'arts') {
    return artsCompetencyTopic(record, sourceText)
    if (/合唱|声部|指挥/u.test(text)) return '合唱声部听辨与表现评价'
    if (/演奏|乐器|器乐/u.test(text)) return '器乐演奏编创与评价'
    if (/节奏|旋律|和弦|编创|简谱|五线谱/u.test(text)) return '音乐编创与作品记录'
    if (/情感|音乐要素|体裁|形式|风格/u.test(text)) return '音乐要素听辨与情感理解'
    if (/姊妹艺术|戏曲|舞蹈|影视/u.test(text)) return '姊妹艺术中的音乐作用'
    if (/微电影|镜头|剪辑|影视|短片/u.test(text)) return '影视语言理解与短片创作'
    if (/舞蹈|舞种|舞段|身体语言/u.test(text)) return '舞蹈语汇表现与文化理解'
    if (/戏剧|角色|剧目|舞台|脚本/u.test(text)) return '戏剧情境表演与文本创作'
    if (/非遗|传统工艺|陶艺|文创/u.test(text)) return '传统工艺制作与保护表达'
    if (/社区|环境|设计|调研/u.test(text)) return '社区环境设计与调研展示'
    if (/中外|流派|美术史|作品内容/u.test(text)) return '中外美术作品评述'
    return '艺术作品表现与创意实践'
  }
  if (record.subject_slug === 'chinese') {
    if (/跨媒介|媒介|新闻/u.test(text)) return '跨媒介阅读与成果呈现'
    if (/古诗文|古文|诵读/u.test(text)) return '古诗文诵读与文化理解'
    if (/检字|字典|词典|识字/u.test(text)) return '独立识字与检字方法'
    if (/行楷|书法|书写/u.test(text)) return '硬笔行楷与书法审美'
    if (/观点|议论|证据|说服/u.test(text)) return '观点表达与证据说服'
    if (/写作|改写|表达方式/u.test(text)) return '多文体写作与表达改进'
    if (/整本书|名著|文学/u.test(text)) return '文学阅读与专题探究'
    return '语文材料理解与表达探究'
  }
  if (record.subject_slug === 'english') {
    if (/人与自我/u.test(text)) return '人与自我主题理解与表达'
    if (/人与社会/u.test(text)) return '人与社会主题比较与交流'
    if (/人与自然/u.test(text)) return '人与自然主题探究与表达'
    if (/语篇|文本|新闻|说明/u.test(text)) return '语篇类型理解与信息概括'
    if (/词汇|音标|构词/u.test(text)) return '词汇语音积累与语境运用'
    if (/策略|合作|探究/u.test(text)) return '学习策略运用与合作探究'
    return '英语主题语篇理解与表达'
  }
  if (record.subject_slug === 'it') {
    if (/学习资源|学习质量|学习的新方法|新模式|数字化学习/u.test(text)) return '数字化学习方法与资源利用'
    if (/跨学科主题学习|项目任务|学校|无人机|气象站|未来智能场景/u.test(text)) return '跨学科数字项目设计'
    if (/物联网|物联/u.test(text)) return '物联系统理解与原型设计'
    if (/人工智能|算法/u.test(text)) return '人工智能方法理解与伦理判断'
    if (/数据|编码/u.test(text)) return '数据编码分析与可视化表达'
    if (/网络|互联网|平台/u.test(text)) return '网络平台理解与安全应用'
    return '数字问题分析与创新应用'
  }
  if (record.subject_slug === 'math') {
    if (/函数/u.test(text)) return '函数关系建模与应用'
    if (/方程|不等式|代数/u.test(text)) return '代数关系推理与求解'
    if (/图形|几何|坐标/u.test(text)) return '图形关系推理与表达'
    if (/统计|概率|样本/u.test(text)) return '统计推断与结果交流'
    return '数学问题建模与综合应用'
  }
  if (record.subject_slug === 'science') {
    const numberedTopic = numberedSourceAnchorTopic(record)
    if (numberedTopic) return numberedTopic
    if (/模型|推理|论证|假设|变量|证据|创造性思维/u.test(text)) return '模型建构与证据推理'
    if (/探究问题|研究变量|控制变量|实验|探究方案|探究报告/u.test(text)) return '变量识别与探究设计'
    if (/伦理|道德|环保|生态|责任|珍爱生命|保护环境|可持续/u.test(text)) return '科学态度与社会责任'
    const tag = tagNote(record)
    if (tag) return `${tag}科学概念探究`
    return '科学概念解释与证据探究'
  }
  if (record.subject_slug === 'pe') {
    if (/体能|力量|耐力|柔韧|速度/u.test(text)) return '体能练习计划与运动表现'
    if (/健康|疾病|视力|控烟|禁毒/u.test(text)) return '健康风险识别与管理'
    if (/规则|裁判|比赛/u.test(text)) return '比赛规则运用与责任意识'
    if (/球类|田径|体操|武术|水上|冰雪/u.test(text)) return '专项运动技能与比赛应用'
    return '体育活动实践与健康行为'
  }
  if (record.subject_slug === 'labor') {
    if (/劳动创造人的道理|托起中国梦|社会进步/u.test(text)) return '劳动价值观与中国梦认同'
    if (/劳动创造美好生活|家庭责任|职业意识|公共服务意识|社会责任感/u.test(text)) return '劳动责任意识与生活创造'
    if (/效率意识|质量意识/u.test(text)) return '劳动效率与质量意识'
    if (/持之以恒|诚实守信|责任担当|劳动规范|劳动法规/u.test(text)) return '劳动规范遵守与责任担当'
    if (/社会发展和国家建设|不畏艰辛|锐意进取/u.test(text)) return '辛勤劳动与国家建设意识'
    if (/精益求精|勤俭|奋斗|创新|奉献/u.test(text)) return '精益求精与创新奉献'
    if (/规划生产劳动方案|工具|材料|设备|技能解决问题|组织实施/u.test(text)) return '劳动方案规划与工具运用'
    if (/家务|日常|生活/u.test(text)) return '日常生活劳动与自我管理'
    if (/生产|种植|加工/u.test(text)) return '生产劳动体验与技术实践'
    if (/服务|公益|志愿/u.test(text)) return '服务性劳动与公益参与'
    return '劳动任务实践与责任表现'
  }
  if (record.subject_slug === 'morality_law') {
    if (/仁爱|重民本|守诚信|崇正义|尚和合|求大同|核心理念/u.test(text)) return '中华传统美德与价值理念'
    if (/法治|法律|宪法/u.test(text)) return '法治观念理解与案例判断'
    if (/生命|健康|安全/u.test(text)) return '生命安全与健康责任'
    if (/传统文化|中华/u.test(text)) return '中华文化认同与价值判断'
    if (/国情|祖国|社会主义/u.test(text)) return '国情认知与国家认同'
    return '道德法治主题理解与行动判断'
  }
  return cleanTopicCandidate(visibleTopic(record)) || '综合学习任务'
}

function topicNeedsSourceDerivation(record, topic) {
  const cleaned = cleanTopicCandidate(topic)
  if (!cleaned || cleaned.length < 4 || cleaned.length > 28) return true
  if (hasGenericName(topic) || hasGenericName(cleaned)) return true
  if (record.subject_slug === 'arts') return true
  if (record.subject_slug === 'science' && numberedSourceAnchorTopic(record)) return true
  if (record.subject_slug === 'science' && /科学概念探究$/u.test(cleaned)) return true
  return false
}

function deriveTopic(record, role) {
  const current = cleanTopicCandidate(visibleTopic(record))
  const primary = primarySourceText(record, role)
  const sourceText = `${primary}；${supportingCandidateText(record, role)}；${record.source_standard_original || ''}`
  if (!topicNeedsSourceDerivation(record, current)) return current
  return topicFromText(record, sourceText)
}

function tagNote(record) {
  const tags = [
    record.core_concept_tag,
    record.content_module_tag,
    record.task_group_tag,
    record.learning_theme_tag,
    record.art_discipline_tag,
    record.source_anchor_tags?.core_concept_tag,
    record.source_anchor_tags?.content_module_tag,
    record.source_anchor_tags?.task_group_tag,
    record.source_anchor_tags?.learning_theme_tag,
    record.source_anchor_tags?.art_discipline_tag
  ].filter(Boolean)
  return [...new Set(tags)][0] || ''
}

function normalizePeDomain(record) {
  if (record.subject_slug !== 'pe') return record.domain
  if (record.domain === '体育品德') return '体育品德'
  if (record.domain === '健康教育') return '健康行为'
  return '运动能力'
}

function normalizeStableReferenceRecord(subjectSlug, record) {
  if (subjectSlug !== 'arts') return record
  if (record.grade_band === 'H2') {
    return {
      ...record,
      grade: '第二学段（3-4年级）',
      grade_range: '3-4'
    }
  }
  if (record.grade_band === 'H3') {
    return {
      ...record,
      grade: '第三学段（5-6年级）',
      grade_range: '5-6'
    }
  }
  return record
}

function topicSpecificLead(record, topic, mode) {
  const subject = record.subject_slug
  const text = `${topic}${record.domain || ''}${record.source_anchor_subcategory || ''}`
  const byMode = (entry, analysis, transfer) => ({ entry, analysis, transfer })[mode]

  if (subject === 'chinese') {
    if (/观察生活|真实写作|写作/u.test(text)) {
      return byMode(
        '观察校园、家庭或社会生活并积累写作素材时',
        '围绕生活见闻筛选材料、安排详略并组织表达时',
        '面向真实读者修改、展示或发表作品时'
      )
    }
    if (/跨媒介|新闻|媒介/u.test(text)) {
      return byMode(
        '阅读新闻、图片或短视频材料并记录信息时',
        '比较不同媒介表达效果并组织讨论时',
        '面向真实议题选择媒介完成表达时'
      )
    }
    if (/古诗文|古文|诵读/u.test(text)) {
      return byMode(
        '诵读、摘录并理解古诗文作品时',
        '结合注释、背景和意象分析古诗文作品时',
        '围绕文化内涵阐释、评价或迁移表达阅读理解时'
      )
    }
    if (/书法|行楷|书写/u.test(text)) {
      return byMode(
        '练习规范书写并欣赏书法作品时',
        '比较字形结构、书写速度和审美效果并改进书写时',
        '在真实记录、展示或创作中迁移书写审美要求时'
      )
    }
    if (/名著|整本书|文学/u.test(text)) {
      return byMode(
        '阅读章节、记录人物情节并交流阅读体验时',
        '围绕专题整理证据、分享观点并推进整本书阅读时',
        '综合人物、主题和艺术特色阐释阅读成果时'
      )
    }
  }

  if (subject === 'arts') {
    if (/合唱|声部|音乐/u.test(text)) {
      return byMode(
        '听辨旋律、节奏或声部并参与音乐活动时',
        '排练、调整声部配合并分析音乐表现时',
        '面向展演评价、改进并阐释音乐作品时'
      )
    }
    if (/美术|造型|工艺|设计|创意/u.test(text)) {
      return byMode(
        '观察形态、材料和媒介并尝试完成美术作品时',
        '比较表现方法、调整构思并推进美术创作时',
        '面向展示、社区或文化议题完善作品时'
      )
    }
    if (/舞蹈|戏剧|影视/u.test(text)) {
      return byMode(
        '模仿动作、角色或镜头语言并参与表演活动时',
        '组织情节、动作或画面关系并推进排演任务时',
        '面向展演、拍摄或评价完善艺术成果时'
      )
    }
  }

  if (subject === 'english') {
    return byMode(
      '理解语篇信息并用英语交流时',
      '整合语篇、语境和文化信息讨论问题时',
      '在真实交际或跨文化表达中完成任务时'
    )
  }

  if (subject === 'it') {
    return byMode(
      '观察数字工具、数据过程或系统案例时',
      '分析数据、算法或系统关系并推进数字项目时',
      '面向真实数字化问题设计、测试或评价方案时'
    )
  }

  if (subject === 'science') {
    return byMode(
      '观察现象、记录证据并解释科学概念时',
      '设计探究、比较证据并分析概念关系时',
      '面向真实科学问题建模、论证或迁移认识时'
    )
  }

  if (subject === 'math') {
    return byMode(
      '解决例题、图表或生活情境中的数学问题时',
      '分析条件关系、选择方法并解释解题过程时',
      '在综合建模、推理证明或应用迁移中处理问题时'
    )
  }

  if (subject === 'pe') {
    return byMode(
      '参与练习、记录身体反应并理解运动要求时',
      '在合作练习、比赛执裁或健康管理中分析表现时',
      '面向专项比赛、自主管理或运动改进处理任务时'
    )
  }

  if (subject === 'labor') {
    return byMode(
      '完成家庭、学校或社区中的劳动任务时',
      '在协作项目中规划、实施并反思劳动过程时',
      '面向真实需求改进、服务或创新完成劳动任务时'
    )
  }

  if (subject === 'morality_law') {
    return byMode(
      '联系个人成长、校园生活理解相关议题时',
      '结合家庭、校园和社会案例分析现实问题时',
      '面向公共议题、法治案例或国家社会情境作出判断时'
    )
  }

  return ''
}

function sourceContextFromClauses(record, clauses, topic) {
  const forbidden = cleanTopicCandidate(topic)
  for (const clause of clauses || []) {
    let text = normalizeClause(clause)
    text = text
      .replace(/^(能|能够|会|尝试|尝试运用|整合|迁移运用|理解|了解|掌握|认识|熟悉|自觉|运用|应用|设计|分析|比较|评价|阐释|形成|完成|参与|表现|写作时能|阅读)/u, '')
      .replace(/^(围绕|根据|通过|结合|在|对|从|与|就|用|把)/u, '')
      .replace(/^(相关|所读|所学|不同|简单|基本|主要)/u, '')
      .replace(/[：:”“"「」《》（）()\s]/gu, '')
    const firstSegment = text.split(/[，。；]/u)[0].trim()
    if (firstSegment.length >= 5 && firstSegment.length <= 18 && (!forbidden || !firstSegment.includes(forbidden))) {
      return firstSegment.replace(/[、]/gu, '')
    }
    const listParts = text
      .split(/[，。；]/u)[0]
      .split(/[、]/u)
      .map(part => part.trim())
      .filter(part => part.length >= 2)
    if (listParts.length >= 2) text = listParts.slice(0, 2).join('、')
    else {
      text = text.replace(/[，。；、]/gu, '')
      const linkedParts = text.split(/[和与及]/u).map(part => part.trim()).filter(part => part.length >= 2)
      if (linkedParts.length >= 2) text = linkedParts.slice(0, 2).join('和')
      if (text.length > 22) text = `${text.slice(0, 20)}等`
    }
    if (text.length >= 5 && (!forbidden || !text.includes(forbidden))) return text
  }
  return ''
}

function contextualLead(record, mode, context) {
  if (!context) return ''
  const subject = record.subject_slug
  const byMode = (entry, analysis, transfer) => ({ entry, analysis, transfer })[mode]
  const leadMap = {
    chinese: byMode(
      `阅读、记录或交流${context}相关材料时`,
      `比较材料、整理依据并推进${context}相关任务时`,
      `面向真实表达、专题探究或作品改进处理${context}相关问题时`
    ),
    arts: byMode(
      `听赏、模仿或尝试表现${context}相关作品时`,
      `比较艺术要素、调整表现方法并推进${context}相关任务时`,
      `面向展演、创作完善或文化阐释处理${context}相关任务时`
    ),
    english: byMode(
      `理解${context}相关语篇并用英语交流时`,
      `整合语篇、语境和文化信息讨论${context}相关问题时`,
      `在真实交际或跨文化表达中处理${context}相关任务时`
    ),
    it: byMode(
      `观察${context}相关数字活动或系统案例时`,
      `分析数据、算法或系统关系并推进${context}相关项目时`,
      `面向真实数字化问题设计、测试或评价${context}相关方案时`
    ),
    math: byMode(
      `解决${context}相关数学问题时`,
      `分析条件关系、选择方法并解释${context}相关过程时`,
      `在综合建模、推理证明或应用迁移中处理${context}相关问题时`
    ),
    science: byMode(
      `观察现象、记录证据并解释${context}相关概念时`,
      `设计探究、比较证据并分析${context}相关关系时`,
      `面向真实科学问题建模、论证或迁移${context}相关认识时`
    ),
    pe: byMode(
      `参与${context}相关练习、记录身体反应时`,
      `在合作练习、比赛执裁或健康管理中分析${context}相关表现时`,
      `面向专项比赛、自主管理或运动改进处理${context}相关任务时`
    ),
    labor: byMode(
      `完成${context}相关家庭、学校或社区劳动任务时`,
      `在协作项目中规划、实施并反思${context}相关过程时`,
      `面向真实需求改进、服务或创新完成${context}相关任务时`
    ),
    morality_law: byMode(
      `联系个人成长、校园生活理解${context}相关议题时`,
      `结合家庭、校园和社会案例分析${context}相关问题时`,
      `面向公共议题、法治案例或国家社会情境判断${context}相关问题时`
    )
  }
  return leadMap[subject] || ''
}

function buildLead(record, topic, chosen) {
  const mode = GRADE_PROFILES[record.grade_band]?.leadMode || 'entry'
  const subject = record.subject_slug
  const contextLead = contextualLead(record, mode, sourceContextFromClauses(record, chosen, topic))
  if (contextLead && !metadataLeakHits({ ...record, subdomain: topic }, contextLead).length) return contextLead
  const safeTopic = topic || topicFromText(record, primarySourceText(record, 'corrected_primary'))
  const specificLead = topicSpecificLead(record, safeTopic, mode)
  if (specificLead) return specificLead
  const leadMap = {
    chinese: {
      entry: '阅读、记录或交流语文材料时',
      analysis: '比较材料、整理依据并推进语文任务时',
      transfer: '面向真实表达、专题探究或作品改进处理问题时'
    },
    arts: {
      entry: '听赏、模仿或尝试表现艺术作品时',
      analysis: '比较艺术要素、调整表现方法并推进艺术任务时',
      transfer: '面向展演、创作完善或文化阐释完成任务时'
    },
    english: {
      entry: '理解简短语篇并交流内容时',
      analysis: '整合较长语篇信息并讨论问题时',
      transfer: '在真实交际或跨文化表达中处理任务时'
    },
    it: {
      entry: '观察数字工具、数据活动或系统案例时',
      analysis: '分析系统关系、数据过程并推进项目时',
      transfer: '面向真实数字化问题设计或评价方案时'
    },
    math: {
      entry: '解决数学学习中的基础问题时',
      analysis: '分析条件关系并解释解题方法时',
      transfer: '在真实应用或综合建模中处理问题时'
    },
    science: {
      entry: '观察现象并解释相关概念时',
      analysis: '设计探究、比较证据并分析科学问题时',
      transfer: '面向真实科学问题建模、评价或迁移认识时'
    },
    pe: {
      entry: '进行基础练习、规则学习或健康记录时',
      analysis: '在合作练习、比赛执裁或健康管理中分析表现时',
      transfer: '面向专项比赛、自主管理或运动改进处理任务时'
    },
    labor: {
      entry: '完成家庭、学校或熟悉场景中的劳动任务时',
      analysis: '在协作项目中规划、实施并反思劳动任务时',
      transfer: '面向真实需求、服务场景或创新劳动解决问题时'
    },
    morality_law: {
      entry: '联系个人成长、校园生活理解相关议题时',
      analysis: '结合家庭、校园和社会案例分析现实问题时',
      transfer: '面向公共议题、法治案例或国家社会情境作出判断时'
    }
  }
  return leadMap[subject]?.[mode] || '处理相关学习任务时'
}

function adaptGradeDemand(text, gradeBand) {
  let value = normalizeClause(text)
  if (gradeBand === 'H4G7') {
    value = value.replace(/综合运用/gu, '尝试运用')
    value = value.replace(/独立组织与开展/gu, '在指导下组织与开展')
    value = value.replace(/独立/gu, '在支架下')
    value = value.replace(/评价/gu, '初步判断')
    value = value.replace(/价值判断/gu, '有依据地说明自己的判断')
    value = value.replace(/优化/gu, '改进')
  } else if (gradeBand === 'H4G8') {
    value = value.replace(/综合运用/gu, '整合')
    value = value.replace(/评价/gu, '分析并判断')
  } else if (gradeBand === 'H4G9') {
    value = value.replace(/综合运用/gu, '运用')
    value = value.replace(/^能知道/u, '能阐释')
    value = value.replace(/^知道/u, '阐释')
    value = value.replace(/^能了解/u, '能分析')
    value = value.replace(/^了解/u, '分析')
    value = value.replace(/^能描述/u, '能分析并说明')
    value = value.replace(/^描述/u, '分析并说明')
    value = value.replace(/^能掌握/u, '能运用')
    value = value.replace(/^掌握/u, '运用')
  }
  return value
}

function ensureCapability(text, gradeBand) {
  const value = adaptGradeDemand(text, gradeBand)
  let result = value
  if (/^不同/u.test(value)) {
    result = `能比较${value}`
  } else if (/^(能|能够|会|尝试|了解|理解|掌握|认识|运用|应用|设计|分析|比较|评价|迁移|形成|完成|参与|表现|弘扬|尊重|认同|写作时能|阐释|辨析)/u.test(value)) {
    result = value
  } else if (value.includes('，能')) {
    result = value
  } else {
    result = `能${value}`
  }
  return result
    .replace(/^能并能/u, '能')
    .replace(/^能并/u, '能')
    .replace(/；能并能/gu, '；能')
    .replace(/；能并/gu, '；能')
    .replace(/综合运用能/gu, '能运用')
    .replace(/能综合运用/gu, '能运用')
    .replace(/能迁移运用(每学年|理解|了解|熟悉|体验|知道|关注|阅读|开展|根据|围绕|为|在)/gu, '能$1')
    .replace(/迁移运用在/gu, '在')
    .replace(/整合在/gu, '在')
    .replace(/^能写作时能时能/u, '写作时能')
    .replace(/^能写作时能/u, '写作时能')
    .replace(/时能时能/gu, '时能')
    .replace(/能在学习与生活中累计认识3500个左右常用汉字/gu, '能在学习与生活中累计认识常用汉字3500个左右')
    .replace(/至少\s*3\s*件富有创意的平面、立体和动态美术作品/gu, '有创意的平面、立体或动态作品')
    .replace(/创作至少3件富有创意的平面、立体和动态作品/gu, '创作有创意的平面、立体或动态作品')
}

function cleanGeneratedText(text) {
  return normalizeText(text)
    .replace(/能综合运用/gu, '能运用')
    .replace(/综合运用能/gu, '能运用')
    .replace(/综合运用/gu, '运用')
    .replace(/能迁移运用(每学年|理解|了解|熟悉|体验|知道|关注|阅读|开展|根据|围绕|为|在)/gu, '能$1')
    .replace(/能在学习与生活中累计认识3500个左右常用汉字/gu, '能在学习与生活中累计认识常用汉字3500个左右')
    .replace(/能不同/u, '能比较不同')
    .replace(/至少\s*3\s*件富有创意的平面、立体和动态美术作品/gu, '有创意的平面、立体或动态作品')
    .replace(/创作至少3件富有创意的平面、立体和动态作品/gu, '创作有创意的平面、立体或动态作品')
    .replace(/；。$/u, '。')
    .replace(/能能/gu, '能')
    .replace(/；；/gu, '；')
    .replace(/，+/gu, '，')
}

function chooseClauses(record, role, topic) {
  const primaryText = primarySourceText(record, role)
  const boundaryText = supportingCandidateText(record, role)
  const primary = splitClauses(primaryText).filter(filterAwkwardClause)
  const boundary = splitClauses(boundaryText).filter(filterAwkwardClause)
  const chosen = []

  const rankedPrimary = sortedClausesForGrade(primary, record.grade_band, topic, record)
  const rankedBoundary = sortedClausesForGrade(boundary, record.grade_band, topic, record)
  const primaryLimit = ['supporting_primary', 'mixed_primary'].includes(role) ? 3 : 2

  for (const clause of rankedPrimary) {
    if (!chosen.some(item => isSimilar(item, clause))) chosen.push(clause)
    if (chosen.length >= primaryLimit) break
  }
  for (const clause of rankedBoundary) {
    if (['supporting_primary', 'mixed_primary'].includes(role) && sourceTopicAlignment(clause, topic, record) < 0.12) continue
    if (!chosen.some(item => isSimilar(item, clause))) chosen.push(clause)
    if (chosen.length >= 3) break
  }
  if (!chosen.length && primary.length) chosen.push(primary[0])
  if (!chosen.length) chosen.push(normalizeClause(record.source_standard_original || record.supporting_source_standard_original))
  return {
    boundary,
    chosen,
    primary
  }
}

function gradeOutcomeClause(record) {
  const map = {
    chinese: {
      H4G7: '能用简短记录或口头表达说明基本理解',
      H4G8: '能整合材料并说明观点、方法或表达选择的依据',
      H4G9: '能形成有观点、有证据、有修改意识的阐释或作品'
    },
    arts: {
      H4G7: '能描述艺术要素并完成基础表现或创作',
      H4G8: '能调整表现方法并说明作品意图或效果',
      H4G9: '能评价作品效果并完善展演、创作或文化阐释'
    },
    english: {
      H4G7: '能获取关键信息并完成简短交流',
      H4G8: '能整合语篇信息并说明观点或文化差异',
      H4G9: '能在真实交际中形成连贯表达并反思策略'
    },
    it: {
      H4G7: '能说明数字工具或数据过程的基本做法',
      H4G8: '能分析系统关系并完成有步骤的数字作品',
      H4G9: '能设计、测试并评价数字化解决方案'
    },
    labor: {
      H4G7: '能按规范完成任务并说明工具、材料或安全要求',
      H4G8: '能规划协作流程并反思劳动质量',
      H4G9: '能面向真实需求改进方案并评价劳动价值'
    },
    math: {
      H4G7: '能说明解题步骤和基本依据',
      H4G8: '能比较方法并解释数量、图形或数据关系',
      H4G9: '能建模、推理并检验结论的合理性'
    },
    morality_law: {
      H4G7: '能联系个人和校园生活说明基本判断',
      H4G8: '能结合家庭、学校或社会案例分析问题',
      H4G9: '能依据规则、价值和证据作出判断并提出行动建议'
    },
    pe: {
      H4G7: '能完成基础练习并记录身体反应',
      H4G8: '能分析练习或比赛表现并调整方法',
      H4G9: '能制定改进方案并评价运动、健康或品德表现'
    },
    science: {
      H4G7: '能用观察证据说明基本科学概念',
      H4G8: '能比较证据并解释概念之间的关系',
      H4G9: '能建模、论证并评价探究结论或社会影响'
    }
  }
  return map[record.subject_slug]?.[record.grade_band] || ''
}

function buildStandard(record, role, topic) {
  const { chosen } = chooseClauses(record, role, topic)
  const primary = ensureCapability(chosen[0] || record.source_standard_original, record.grade_band)
  const secondary = chosen[1] ? ensureCapability(chosen[1], record.grade_band) : ''
  const tertiary = chosen[2] ? ensureCapability(chosen[2], record.grade_band) : ''
  const outcome = gradeOutcomeClause(record)

  const parts = [primary]
  if (secondary) parts.push(secondary)
  if (tertiary) parts.push(tertiary)
  if (outcome && !parts.some(part => isSimilar(part, outcome))) parts.push(outcome)
  return cleanGeneratedText(`${parts.join('；')}。`)
}

function evidenceSummary(record) {
  const units = Array.isArray(record.textbook_unit_evidence) ? record.textbook_unit_evidence : []
  const textbooks = Array.isArray(record.textbook_evidence) ? record.textbook_evidence : []
  if (units.length) {
    const titles = units.map(item => item.unit_title || item.chapter_title || item.section_title).filter(Boolean).slice(0, 3)
    return titles.length ? `单元证据：${titles.join('、')}` : `单元证据 ${units.length} 条`
  }
  if (textbooks.length) {
    const volumes = textbooks.map(item => item.grade_label || item.volume || item.file_name).filter(Boolean).slice(0, 2)
    return volumes.length ? `教材文件证据：${volumes.join('、')}` : `教材文件证据 ${textbooks.length} 条`
  }
  return '暂无教材文件证据'
}

function sourceExcerpt(text, max = 42) {
  const clauses = splitClauses(text)
  const value = clauses.find(filterAwkwardClause) || clauses[0] || normalizeText(text)
  const cleaned = cleanGeneratedText(value)
  return cleaned.length > max ? `${cleaned.slice(0, max)}...` : cleaned
}

function buildGradeSpecificFocus(record, role, topic) {
  const profile = GRADE_PROFILES[record.grade_band]
  const primaryLabel = role === 'supporting_primary'
    ? 'supporting source'
    : role === 'previous_primary'
      ? 'previous source'
      : role === 'mixed_primary'
        ? 'supporting + corrected source'
        : 'corrected source'
  const primary = sourceExcerpt(primarySourceText(record, role))
  const boundary = sourceExcerpt(record.source_standard_original, 34)
  return cleanGeneratedText(`${profile.label}聚焦${profile.demand}；以${primaryLabel}「${primary}」确定「${topic}」的具体任务；corrected source 用于限定权威边界「${boundary}」；${evidenceSummary(record)}。`)
}

function forbiddenHits(...texts) {
  const joined = texts.map(text => normalizeText(text)).join('\n')
  return [...FORBIDDEN_TEMPLATE_TOKENS, ...FORBIDDEN_FLUENCY_TOKENS].filter(token => joined.includes(token))
}

function firstLead(standard) {
  return normalizeText(standard).split(/[，。；]/u)[0]
}

function metadataLeakHits(record, standard) {
  const text = normalizeText(standard)
  const names = [...new Set([
    cleanTopicCandidate(record.subdomain),
    cleanTopicCandidate(record.source_anchor_subcategory),
    cleanTopicCandidate(record.domain)
  ].filter(value => value && value.length >= 3 && !hasGenericName(value)))]
  const hits = []
  for (const name of names) {
    if (text.includes(`「${name}」`) || text.includes(`“${name}”`) || text.includes(`《${name}》`)) hits.push(`quoted:${name}`)
  }
  return hits
}

function sourceOverlapScore(source, standard) {
  const clean = text => normalizeText(text).replace(/[，。；、：:“”《》（）()\s]/gu, '')
  const sourceText = clean(source)
  const standardText = clean(standard)
  if (!sourceText || !standardText) return 0
  const grams = new Set()
  for (let i = 0; i < sourceText.length - 1; i += 1) {
    const gram = sourceText.slice(i, i + 2)
    if (!/[的一是在和与中为对等及或并]/u.test(gram)) grams.add(gram)
  }
  if (!grams.size) return 0
  let hits = 0
  for (const gram of grams) if (standardText.includes(gram)) hits += 1
  return Number((hits / grams.size).toFixed(4))
}

function rewriteRecord(record, reviewDecisions) {
  const decision = decisionFor(record, reviewDecisions)
  const role = sourceRole(record, decision)
  const previousStandard = record.standard || ''
  const previousFocus = record.grade_specific_focus || ''
  const previousSubdomain = record.subdomain || ''
  const topic = deriveTopic(record, role)
  const standard = cleanGeneratedText(buildStandard(record, role, topic))
  const gradeSpecificFocus = cleanGeneratedText(buildGradeSpecificFocus(record, role, topic))
  const hits = forbiddenHits(standard, gradeSpecificFocus, topic)
  const metadataHits = metadataLeakHits({ ...record, subdomain: topic }, standard)
  const combinedSource = `${record.source_standard_original || ''}；${record.supporting_source_standard_original || ''}；${record.previous_source_standard_original || ''}`
  const combinedOverlap = sourceOverlapScore(combinedSource, standard)
  const correctedOverlap = sourceOverlapScore(record.source_standard_original, standard)
  const supportingOverlap = sourceOverlapScore(record.supporting_source_standard_original, standard)
  const primaryOverlap = sourceOverlapScore(primarySourceText(record, role), standard)
  const candidateId = `sarw2-${shortHash([record.code, record.source_anchor_id, role, topic, standard].join('|'), 16)}`
  const normalizedDomain = normalizePeDomain(record)

  return {
    ...record,
    domain: normalizedDomain,
    grade_specific_focus: gradeSpecificFocus,
    previous_template_grade_specific_focus: previousFocus,
    previous_template_standard: previousStandard,
    previous_v2_subdomain: previousSubdomain,
    public_write_candidate: false,
    review_status: 'source_aligned_standard_rewrite_v2_candidate_needs_review',
    source_aligned_corrected_source_overlap: correctedOverlap,
    source_aligned_forbidden_template_hits: hits,
    source_aligned_metadata_leak_hits: metadataHits,
    source_aligned_primary_source_overlap: primaryOverlap,
    source_aligned_rewrite_candidate_id: candidateId,
    source_aligned_rewrite_contract_version: CONTRACT_VERSION,
    source_aligned_rewrite_method: 'v2_source_role_recalibrated_supporting_first_rewrite',
    source_aligned_rewrite_rationale: `V2 rewrite selected ${role}; review status ${decision?.status || 'not_reviewed'} treated as systemic signal only. Corrected source is authority boundary, primary source supplies concrete task target.`,
    source_aligned_rewrite_status: hits.length
      ? 'v2_candidate_has_forbidden_hits'
      : metadataHits.length
        ? 'v2_candidate_has_metadata_leak'
      : combinedOverlap < 0.12
        ? 'v2_candidate_low_source_overlap_needs_review'
        : 'v2_candidate_needs_review',
    source_aligned_source_overlap: combinedOverlap,
    source_aligned_supporting_source_overlap: supportingOverlap,
    source_aligned_v2_issue_flags: [
      decision?.status && decision.status !== 'pending' ? `review_${decision.status}` : '',
      reviewWantsSupporting(decision) ? 'review_requested_supporting_source' : '',
      hasGenericName(previousSubdomain) ? 'generic_previous_name' : '',
      hasGenericName(record.source_anchor_subcategory) ? 'generic_source_anchor_subcategory' : '',
      role === 'supporting_primary' ? 'supporting_primary' : ''
    ].filter(Boolean),
    source_aligned_v2_review_decision_note: decision?.note || '',
    source_aligned_v2_source_role: role,
    source_anchor_category: record.subject_slug === 'pe' ? normalizedDomain : record.source_anchor_category,
    standard,
    standard_text_role: 'source_aligned_grade_display_standard_v2',
    subdomain: topic,
    writes_public_data: false
  }
}

function loadPayloads(dataRoot, errors) {
  const payloads = new Map()
  if (!existsSync(dataRoot)) {
    errors.push(`Missing data root: ${dataRoot}`)
    return payloads
  }
  for (const file of subjectFiles(dataRoot)) payloads.set(basename(file, '.json'), readJson(file))
  return payloads
}

function subjectMarkdown(subjectSlug, candidates, summary) {
  const samples = candidates.slice(0, 8)
  return `# H4G Source-Aligned Standard Rewrite V2 Candidate - ${SUBJECTS[subjectSlug]?.subject || subjectSlug}

| Metric | Value |
| --- | ---: |
| records | ${summary.records} |
| groups | ${summary.groups} |
| supporting primary | ${summary.supporting_primary} |
| generic names fixed | ${summary.generic_names_fixed} |
| forbidden hits | ${summary.forbidden_hits} |
| metadata leaks | ${summary.metadata_leaks} |
| low overlap | ${summary.low_overlap} |

## Samples

${samples.map(item => `### ${item.code}

- role: ${item.source_aligned_v2_source_role}
- topic: ${markdownCell(item.subdomain)}
- corrected source: ${markdownCell(item.source_standard_original)}
- supporting source: ${markdownCell(item.supporting_source_standard_original)}
- previous template: ${markdownCell(item.previous_template_standard)}
- new standard: ${markdownCell(item.standard)}
- focus: ${markdownCell(item.grade_specific_focus)}
- overlap: ${item.source_aligned_source_overlap}
`).join('\n')}
`
}

function overallMarkdown(result) {
  return `# H4G Source-Aligned Standard Rewrite V2 Candidate

Generated at: ${result.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${result.valid} |
| H4G records | ${result.summary.h4g_records} |
| progression groups | ${result.summary.progression_groups} |
| supporting primary groups | ${result.summary.supporting_primary_groups} |
| generic names fixed | ${result.summary.generic_names_fixed} |
| forbidden template hits | ${result.summary.forbidden_hits} |
| metadata leaks | ${result.summary.metadata_leaks} |
| low source overlap | ${result.summary.low_overlap} |
| public writes | ${result.writes_public_data} |
| errors | ${result.errors.length} |

## Subject Summary

| Subject | Records | Groups | Supporting Primary | Generic Names Fixed | Forbidden Hits | Metadata Leaks | Low Overlap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${result.subjects.map(item => `| ${item.subject_slug} | ${item.summary.records} | ${item.summary.groups} | ${item.summary.supporting_primary} | ${item.summary.generic_names_fixed} | ${item.summary.forbidden_hits} | ${item.summary.metadata_leaks} | ${item.summary.low_overlap} |`).join('\n')}

## Errors

${result.errors.length ? result.errors.map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}
`
}

function buildIssueMatrix(allCandidates) {
  const byRole = {}
  const byReviewStatus = {}
  const rows = allCandidates.map(record => {
    byRole[record.source_aligned_v2_source_role] = (byRole[record.source_aligned_v2_source_role] || 0) + 1
    const reviewFlag = (record.source_aligned_v2_issue_flags || []).find(flag => flag.startsWith('review_')) || 'not_reviewed'
    byReviewStatus[reviewFlag] = (byReviewStatus[reviewFlag] || 0) + 1
    return {
      code: record.code,
      flags: record.source_aligned_v2_issue_flags || [],
      grade_band: record.grade_band,
      group_id: groupId(record),
      previous_subdomain: record.previous_v2_subdomain,
      source_role: record.source_aligned_v2_source_role,
      standard: record.standard,
      subject_slug: record.subject_slug,
      supporting_overlap: record.source_aligned_supporting_source_overlap,
      metadata_leak_hits: record.source_aligned_metadata_leak_hits || [],
      topic: record.subdomain
    }
  })
  return {
    by_role: byRole,
    by_review_status: byReviewStatus,
    rows,
    summary: {
      generic_name_rows: rows.filter(row => row.flags.includes('generic_previous_name')).length,
      review_requested_supporting_rows: rows.filter(row => row.flags.includes('review_requested_supporting_source')).length,
      rows: rows.length,
      supporting_primary_rows: rows.filter(row => row.source_role === 'supporting_primary').length
    }
  }
}

function build(args) {
  const errors = []
  const payloads = loadPayloads(args.dataRoot, errors)
  const { decisions: reviewDecisions, path: reviewDecisionPath } = loadReviewDecisions(args.reviewDecisions)
  const outRoot = args.outDir
  const dataCandidateRoot = join(outRoot, 'data_candidate')
  const bySubjectOut = join(outRoot, 'by_subject')
  const allCandidates = []
  const subjects = []

  if (!errors.length) copyJsonTree(args.dataRoot, dataCandidateRoot)
  mkdirSync(bySubjectOut, { recursive: true })

  for (const [subjectSlug, payload] of payloads) {
    const h4gRows = (payload.standards || []).filter(isH4G)
    const candidates = h4gRows.map(record => rewriteRecord(record, reviewDecisions))
    const candidateByCode = new Map(candidates.map(record => [record.code, record]))
    const generatedAt = new Date().toISOString()
    const nextPayload = {
      ...payload,
      h4g_source_aligned_rewrite_contract_version: CONTRACT_VERSION,
      h4g_source_aligned_rewrite_generated_at: generatedAt,
      h4g_source_aligned_rewrite_status: 'v2_candidate_needs_audit',
      publication_candidate: true,
      writes_public_data: false,
      standards: (payload.standards || []).map(record => candidateByCode.get(record.code) || normalizeStableReferenceRecord(subjectSlug, record))
    }
    writeJson(join(dataCandidateRoot, 'by_subject', `${subjectSlug}.json`), nextPayload)
    const groups = recordsByGroup(candidates)
    const summary = {
      forbidden_hits: candidates.filter(record => record.source_aligned_forbidden_template_hits.length).length,
      generic_names_fixed: candidates.filter(record => record.previous_v2_subdomain && record.previous_v2_subdomain !== record.subdomain && hasGenericName(record.previous_v2_subdomain)).length,
      groups: groups.size,
      low_overlap: candidates.filter(record => record.source_aligned_source_overlap < 0.12).length,
      metadata_leaks: candidates.filter(record => record.source_aligned_metadata_leak_hits.length).length,
      records: candidates.length,
      supporting_primary: candidates.filter(record => record.source_aligned_v2_source_role === 'supporting_primary').length
    }
    writeJson(join(bySubjectOut, `${subjectSlug}.json`), {
      candidates,
      contract_version: CONTRACT_VERSION,
      generated_at: generatedAt,
      review_decisions_source: reviewDecisionPath,
      summary,
      writes_public_data: false
    })
    writeText(join(bySubjectOut, `${subjectSlug}.md`), subjectMarkdown(subjectSlug, candidates, summary))
    subjects.push({ subject_slug: subjectSlug, subject: SUBJECTS[subjectSlug]?.subject || subjectSlug, summary })
    allCandidates.push(...candidates)
  }

  const groups = recordsByGroup(allCandidates)
  const issueMatrix = buildIssueMatrix(allCandidates)
  const result = {
    contract_version: CONTRACT_VERSION,
    data_candidate_root: dataCandidateRoot,
    errors,
    generated_at: new Date().toISOString(),
    purpose: 'h4g_source_aligned_standard_rewrite_v2_candidate',
    review_decisions_source: reviewDecisionPath,
    subjects,
    summary: {
      forbidden_hits: allCandidates.filter(record => record.source_aligned_forbidden_template_hits.length).length,
      generic_names_fixed: allCandidates.filter(record => record.previous_v2_subdomain && record.previous_v2_subdomain !== record.subdomain && hasGenericName(record.previous_v2_subdomain)).length,
      h4g_records: allCandidates.length,
      low_overlap: allCandidates.filter(record => record.source_aligned_source_overlap < 0.12).length,
      metadata_leaks: allCandidates.filter(record => record.source_aligned_metadata_leak_hits.length).length,
      progression_groups: groups.size,
      supporting_primary_groups: [...groups.values()].filter(rows => rows.some(row => row.source_aligned_v2_source_role === 'supporting_primary')).length
    },
    valid: errors.length === 0,
    writes_public_data: false
  }

  writeJson(join(outRoot, 'source_aligned_standard_rewrite_v2_candidates.json'), {
    contract_version: CONTRACT_VERSION,
    generated_at: result.generated_at,
    review_decisions_source: reviewDecisionPath,
    source_aligned_standard_rewrite_v2_candidates: allCandidates,
    summary: result.summary,
    writes_public_data: false
  })
  writeJson(join(outRoot, 'source_aligned_standard_rewrite_v2_issue_matrix.json'), issueMatrix)
  writeJson(join(outRoot, 'source_aligned_standard_rewrite_v2_candidate_summary.json'), result)
  writeText(join(outRoot, 'source_aligned_standard_rewrite_v2_candidate_summary.md'), overallMarkdown(result))
  return result
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const result = build(args)
console.log(JSON.stringify({
  forbidden_hits: result.summary.forbidden_hits,
  generic_names_fixed: result.summary.generic_names_fixed,
  h4g_records: result.summary.h4g_records,
  low_overlap: result.summary.low_overlap,
  metadata_leaks: result.summary.metadata_leaks,
  progression_groups: result.summary.progression_groups,
  supporting_primary_groups: result.summary.supporting_primary_groups,
  valid: result.valid,
  writes_public_data: result.writes_public_data
}, null, 2))

if (!result.valid && args.strict) process.exitCode = 1
