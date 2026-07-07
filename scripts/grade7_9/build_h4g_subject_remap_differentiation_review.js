#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  TARGET_GRADE_BANDS,
  countInto,
  countRows,
  markdownCell,
  normalizeText,
  recordsByGroup,
  shortHash,
  subjectFiles,
  writeJson,
  writeText
} from './h4g_supplemental_pipeline_utils.js'
import { SUBJECTS } from './config.js'

const CONTRACT_VERSION = 'H4G_SOURCE_ANCHOR_METHOD_LOCK_AND_REMAP_v0.1'
const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_EVIDENCE_ITEMS = 'generated/h4g_supplemental_evidence/evidence_items.json'
const DEFAULT_TASK_SIGNALS = 'generated/h4g_supplemental_evidence/task_signal_items.json'
const DEFAULT_PROGRESSIONS = 'generated/h4g_progression_candidates/progression_candidates.json'
const DEFAULT_OUT_DIR = 'generated/h4g_subject_remap_differentiation'
const GRADE_ORDER = new Map(TARGET_GRADE_BANDS.map((band, index) => [band, index]))
const ART_DISCIPLINES = ['音乐', '美术', '舞蹈', '戏剧（含戏曲）', '影视（含数字媒体艺术）']

const SUBJECT_ORDER = [
  'chinese',
  'arts',
  'english',
  'it',
  'math',
  'science',
  'pe',
  'labor',
  'morality_law'
]

const SUBJECT_METHODS = {
  chinese: {
    source_section_type: '学业质量描述',
    primary_source_rule: '学业质量描述',
    categories: ['表达与交流', '梳理与探究', '识字与写字', '阅读与鉴赏'],
    category_map: {
      '识字与写字': '识字与写字',
      '语言文字积累与梳理': '识字与写字',
      '阅读与鉴赏': '阅读与鉴赏',
      '文学阅读与创意表达': '阅读与鉴赏',
      '实用性阅读与交流': '阅读与鉴赏',
      '思辨性阅读与表达': '阅读与鉴赏',
      '整本书阅读': '阅读与鉴赏',
      '表达与交流': '表达与交流',
      '梳理与探究': '梳理与探究',
      '跨学科学习': '梳理与探究',
      '学业质量': '梳理与探究'
    }
  },
  arts: {
    source_section_type: '学业质量描述',
    primary_source_rule: '学业质量描述',
    categories: ['审美感知', '艺术表现', '创意实践', '文化理解'],
    required_tags: ['art_discipline_tag']
  },
  english: {
    source_section_type: '学段目标',
    primary_source_rule: '学段目标',
    categories: ['文化意识', '语言能力', '学习能力', '思维品质']
  },
  it: {
    source_section_type: '学段目标',
    primary_source_rule: '学段目标',
    categories: ['信息意识', '计算思维', '数字化学习与创新', '信息社会责任']
  },
  math: {
    source_section_type: '课程内容-学业要求',
    primary_source_rule: '课程内容中的学业要求',
    supporting_source_rule: '课程内容中的内容要求',
    categories: ['数与代数', '图形与几何', '统计与概率', '综合与实践']
  },
  science: {
    source_section_type: '课程内容-内容要求',
    primary_source_rule: '课程内容中每个核心概念的内容要求',
    categories: ['态度责任', '探究实践', '科学观念', '科学思维'],
    required_tags: ['core_concept_tag']
  },
  pe: {
    source_section_type: '课程内容-学业要求',
    primary_source_rule: '课程内容中的学业要求',
    supporting_source_rule: '课程内容中的内容要求',
    categories: ['体能', '健康教育', '专项运动技能', '跨学科主题学习', '体育品德', '运动能力'],
    required_tags: ['content_module_tag']
  },
  labor: {
    source_section_type: '课程内容-任务群内容要求与素养表现',
    primary_source_rule: '课程内容中各任务群的内容要求和素养表现',
    categories: ['日常生活劳动', '生产劳动', '服务性劳动', '公益劳动与志愿服务'],
    required_tags: ['task_group_tag']
  },
  morality_law: {
    source_section_type: '课程内容',
    primary_source_rule: '课程内容',
    categories: ['生命安全与健康教育', '法治教育', '中华优秀传统文化教育', '革命传统教育', '国情教育'],
    required_tags: ['learning_theme_tag']
  }
}

function parseArgs(argv) {
  const args = {
    dataRoot: DEFAULT_DATA_ROOT,
    evidenceItems: DEFAULT_EVIDENCE_ITEMS,
    maxExamplesPerSubject: 10,
    outDir: DEFAULT_OUT_DIR,
    progressions: DEFAULT_PROGRESSIONS,
    strict: false,
    subject: 'all',
    taskSignals: DEFAULT_TASK_SIGNALS
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--evidence-items') args.evidenceItems = argv[++i]
    else if (item === '--max-examples-per-subject') args.maxExamplesPerSubject = Number(argv[++i])
    else if (item === '--out-dir') args.outDir = argv[++i]
    else if (item === '--progressions') args.progressions = argv[++i]
    else if (item === '--subject') args.subject = argv[++i]
    else if (item === '--task-signals') args.taskSignals = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
npm run grade7_9:h4g-subject-remap-differentiation-review -- --strict

Builds all-subject dry-run review packets for the H4G source-anchor method lock
and G7/G8/G9 differentiation task. It writes only under generated/ and never
modifies public/data.`)
}

function isH4G(record) {
  return TARGET_GRADE_BANDS.includes(record.grade_band)
}

function h4gRows(payload, subjectSlug) {
  return (payload.standards || [])
    .filter(isH4G)
    .map(record => ({
      ...record,
      subject_slug: record.subject_slug || subjectSlug,
      subject: record.subject || payload.subject || SUBJECTS[subjectSlug]?.subject || subjectSlug
    }))
}

function loadPublicPayloads(dataRoot, errors) {
  const payloads = new Map()
  if (!existsSync(dataRoot)) {
    errors.push(`Missing data root: ${dataRoot}`)
    return payloads
  }
  for (const file of subjectFiles(dataRoot)) {
    payloads.set(basename(file, '.json'), JSON.parse(readFileSync(file, 'utf8')))
  }
  return payloads
}

function curatedPath(subjectSlug) {
  return `generated/grade7_9_${subjectSlug}_curated/mapped/${subjectSlug}.json`
}

function loadCuratedRows(subjectSlug) {
  const path = curatedPath(subjectSlug)
  if (!existsSync(path)) return []
  const payload = JSON.parse(readFileSync(path, 'utf8'))
  return Array.isArray(payload) ? payload : payload.standards || []
}

function selectedSubjects(subjectArg) {
  if (subjectArg === 'all') return SUBJECT_ORDER
  return subjectArg.split(',').map(item => item.trim()).filter(Boolean)
}

function sourceSectionMatches(subjectSlug, record) {
  const context = normalizeText(record.context)
  const domain = normalizeText(record.domain)
  if (subjectSlug === 'chinese') return domain === '学业质量' || context.includes('学业质量描述')
  if (subjectSlug === 'arts') return domain === '学业质量' || context.includes('学业质量描述')
  if (subjectSlug === 'english') return ['语言能力', '文化意识', '思维品质', '学习能力'].includes(domain) && context.includes('学段目标')
  if (subjectSlug === 'it') return context.includes('目标') && !context.includes('模块') && !context.includes('学业质量')
  if (subjectSlug === 'math') return context.includes('学业要求') && ['数与代数', '图形与几何', '统计与概率', '综合与实践'].includes(domain)
  if (subjectSlug === 'science') return context.includes('核心概念') && context.includes('内容要求')
  if (subjectSlug === 'pe') return context.includes('学业要求') || context.includes('学业质量合格标准')
  if (subjectSlug === 'labor') return context.includes('任务群') || domain === '劳动素养要求'
  if (subjectSlug === 'morality_law') return context.includes('内容要求') && SUBJECT_METHODS.morality_law.categories.includes(domain)
  return false
}

function inferCategory(subjectSlug, value) {
  const method = SUBJECT_METHODS[subjectSlug]
  const topicText = [
    value.source_anchor_category,
    value.source_anchor_subcategory,
    value.domain,
    value.subdomain,
    value.context
  ].map(normalizeText).join(' ')
  const text = [
    value.source_anchor_category,
    value.source_anchor_subcategory,
    value.domain,
    value.subdomain,
    value.context,
    value.standard,
    value.source_standard_original,
    value.grade_specific_focus
  ].map(normalizeText).join(' ')

  if (method.category_map?.[value.domain]) return method.category_map[value.domain]
  for (const category of method.categories) {
    if (value.domain === category || value.source_anchor_category === category) return category
  }
  if (!['arts', 'science'].includes(subjectSlug)) {
    for (const category of method.categories) {
      if (text.includes(category)) return category
    }
  }

  if (subjectSlug === 'arts') {
    const artTopicText = [
      value.source_anchor_category,
      value.source_anchor_subcategory,
      value.subdomain,
      value.domain,
      value.context
    ].map(normalizeText).join(' ')
    if (/(^|\s)(审美|欣赏|赏析|感知|感受|听辨|观察|品味|评述|观赏|辨析)[：:\s]/u.test(artTopicText)) return '审美感知'
    if (/(^|\s)(表现|演唱|演奏|表演|呈现|技法|动作|拍摄|演出|造型|塑造)[：:\s]/u.test(artTopicText)) return '艺术表现'
    if (/(^|\s)(创造|创作|创意|编创|设计|改编|构思|制作|综合探索|文创|微电影)[：:\s]/u.test(artTopicText)) return '创意实践'
    if (/(^|\s)(文化|传统|民族|世界|历史|非遗|遗产|革命)[：:\s]/u.test(artTopicText)) return '文化理解'
    if (/文化|传统|民族|世界|历史|非遗|遗产|革命|地区/u.test(artTopicText)) return '文化理解'
    if (/创意|创作|编创|设计|改编|创造|构思|制作|综合探索|文创|微电影/u.test(artTopicText)) return '创意实践'
    if (/表现|演唱|演奏|表演|呈现|技法|动作|拍摄|演出|造型|塑造/u.test(artTopicText)) return '艺术表现'
    if (/审美|欣赏|赏析|感知|感受|听辨|观察|品味|评述|观赏|辨析|风格/u.test(artTopicText)) return '审美感知'
    if (/文化|传统|民族|世界|历史|非遗|遗产|革命|地区/u.test(text)) return '文化理解'
    if (/创意|创作|编创|设计|改编|创造|构思|制作|综合探索|文创|微电影/u.test(text)) return '创意实践'
    if (/表现|演唱|演奏|表演|呈现|技法|动作|拍摄|演出|造型|塑造/u.test(text)) return '艺术表现'
    if (/审美|欣赏|赏析|感知|感受|听辨|观察|品味|评述|观赏|辨析|风格/u.test(text)) return '审美感知'
    return '艺术表现'
  }
  if (subjectSlug === 'english') {
    if (/文化|跨文化|中华文化|多样性/u.test(text)) return '文化意识'
    if (/策略|自主|合作|学习计划|反思/u.test(text)) return '学习能力'
    if (/推断|归纳|判断|批判|创新|辨析/u.test(text)) return '思维品质'
    return '语言能力'
  }
  if (subjectSlug === 'it') {
    if (/责任|安全|伦理|隐私|社会/u.test(text)) return '信息社会责任'
    if (/算法|编程|模型|人工智能|计算|控制/u.test(text)) return '计算思维'
    if (/作品|创新|项目|数字化学习|协作|设计/u.test(text)) return '数字化学习与创新'
    return '信息意识'
  }
  if (subjectSlug === 'science') {
    if (/科学探究|探究实践|工程设计|技术、工程|工程需要|设计方案|物化|技术与工程/u.test(topicText)) return '探究实践'
    if (/科学思维|模型|推理|论证|预测|归纳|演绎|抽象/u.test(topicText)) return '科学思维'
    if (/态度责任|科学态度|社会责任|生命安全|机体健康|人类活动与环境|自然资源|自然灾害|环境的影响|可持续|生态保护/u.test(topicText)) return '态度责任'
    return '科学观念'
  }
  if (subjectSlug === 'pe') {
    if (/体育品德|规则|合作|责任|公平|精神/u.test(text)) return '体育品德'
    if (/健康|心理|营养|安全|疾病|青春/u.test(text)) return '健康教育'
    if (/体能|耐力|力量|速度|柔韧|灵敏/u.test(text)) return '体能'
    if (/跨学科|主题学习/u.test(text)) return '跨学科主题学习'
    if (/运动能力/u.test(text)) return '运动能力'
    return '专项运动技能'
  }
  if (subjectSlug === 'labor') {
    if (/公益|志愿/u.test(text)) return '公益劳动与志愿服务'
    if (/服务|现代服务/u.test(text)) return '服务性劳动'
    if (/农业|工业|生产|工艺|新技术/u.test(text)) return '生产劳动'
    return '日常生活劳动'
  }
  if (subjectSlug === 'morality_law') {
    if (/法治|法律|宪法|违法|犯罪|权利|义务/u.test(text)) return '法治教育'
    if (/革命|英雄|党史|红色/u.test(text)) return '革命传统教育'
    if (/传统文化|中华优秀|文化/u.test(text)) return '中华优秀传统文化教育'
    if (/国家|国情|社会|共同体|社会主义|发展|安全/u.test(text)) return '国情教育'
    return '生命安全与健康教育'
  }
  return method.categories[0]
}

function sourceAnchorCategories(subjectSlug, record) {
  if (subjectSlug === 'arts' && record.domain === '学业质量') {
    return SUBJECT_METHODS.arts.categories
  }
  if (subjectSlug === 'science' && sourceSectionMatches(subjectSlug, record)) {
    return SUBJECT_METHODS.science.categories
  }
  return [inferCategory(subjectSlug, record)]
}

function inferTags(subjectSlug, record, category) {
  const text = [record.context, record.domain, record.subdomain, record.standard].map(normalizeText).join(' ')
  const tags = {}
  if (subjectSlug === 'arts') {
    const topicText = [record.subdomain, record.domain, record.context].map(normalizeText).join(' ')
    tags.art_discipline_tag = ART_DISCIPLINES.find(item => topicText.includes(item)) || ART_DISCIPLINES.find(item => text.includes(item)) || record.domain
    if (record.domain === '学业质量') tags.source_anchor_dimension_basis = 'academic_quality_anchor_reused_across_arts_dimensions'
  }
  if (subjectSlug === 'science') {
    const coreMatch = text.match(/核心概念\s*([0-9一二三四五六七八九十]+)(?:\s*学习内容\s*([0-9.]+))?/u)
    tags.core_concept_tag = coreMatch ? `核心概念${coreMatch[1]}${coreMatch[2] ? `-${coreMatch[2]}` : ''}` : record.domain
    tags.content_module_tag = tags.core_concept_tag
    if (sourceSectionMatches(subjectSlug, record)) tags.source_anchor_dimension_basis = 'core_concept_content_anchor_reused_across_science_literacy_dimensions'
  }
  if (subjectSlug === 'pe') {
    const moduleMatch = text.match(/^(.*?)(?:达到水平四|的学业质量|，|。)/u)
    tags.content_module_tag = normalizeText(moduleMatch?.[1]) || category || record.domain
  }
  if (subjectSlug === 'labor') {
    const taskMatch = text.match(/任务群\s*([0-9一二三四五六七八九十]+)[：:]\s*([^。；，,]+)/u)
    tags.task_group_tag = taskMatch ? `任务群${taskMatch[1]}：${taskMatch[2]}` : normalizeText(record.subdomain || record.domain)
  }
  if (subjectSlug === 'morality_law') {
    tags.learning_theme_tag = category
  }
  return tags
}

function buildSourceAnchorRegistry(subjectSlug, curatedRows) {
  const method = SUBJECT_METHODS[subjectSlug]
  const anchors = []
  const seen = new Set()
  for (const record of curatedRows.filter(record => sourceSectionMatches(subjectSlug, record))) {
    for (const category of sourceAnchorCategories(subjectSlug, record)) {
      const tags = inferTags(subjectSlug, record, category)
      const sourceText = normalizeText(record.standard)
      if (!sourceText) continue
      const key = `${category}\n${record.subdomain}\n${sourceText}`
      if (seen.has(key)) continue
      seen.add(key)
      const anchor = {
        anchor_id: `${subjectSlug}-source-anchor-${shortHash(key, 12)}`,
        category,
        source_record_code: record.code,
        source_section_type: method.source_section_type,
        source_standard_original: sourceText,
        subcategory: record.subdomain || category,
        subject: SUBJECTS[subjectSlug]?.subject || subjectSlug,
        subject_slug: subjectSlug,
        tags
      }
      anchors.push(anchor)
    }
  }
  return anchors.sort((a, b) => a.category.localeCompare(b.category) || a.subcategory.localeCompare(b.subcategory))
}

function grams(text) {
  const cleaned = normalizeText(text).replace(/[^\p{Script=Han}A-Za-z0-9]+/gu, '')
  const out = new Set()
  for (let i = 0; i < cleaned.length - 1; i += 1) out.add(cleaned.slice(i, i + 2))
  return out
}

function overlapScore(left, right) {
  const a = grams(left)
  const b = grams(right)
  if (!a.size || !b.size) return 0
  let hits = 0
  for (const item of a) {
    if (b.has(item)) hits += 1
  }
  return Number((hits / Math.min(a.size, b.size)).toFixed(4))
}

function similarity(left, right) {
  const a = grams(left)
  const b = grams(right)
  if (!a.size && !b.size) return 1
  const union = new Set([...a, ...b])
  let hits = 0
  for (const item of a) {
    if (b.has(item)) hits += 1
  }
  return Number((hits / union.size).toFixed(4))
}

function groupText(rows) {
  return rows.map(row => [row.domain, row.subdomain, row.standard, row.source_standard_original].map(normalizeText).join(' ')).join(' ')
}

function groupArtDiscipline(rows) {
  const text = groupText(rows)
  return ART_DISCIPLINES.find(item => rows.some(row => row.domain === item)) ||
    ART_DISCIPLINES.find(item => text.includes(item)) ||
    ''
}

function scienceTopicKey(value) {
  const text = normalizeText(value)
  const match = text.match(/(?:^|[^\d])(\d+\.\d+)(?:[^\d]|$)/u)
  return match?.[1] || ''
}

function constrainedAnchorPool(subjectSlug, rows, anchors) {
  if (subjectSlug === 'arts') {
    const discipline = groupArtDiscipline(rows)
    const matched = discipline ? anchors.filter(anchor => anchor.tags?.art_discipline_tag === discipline) : []
    if (matched.length) return matched
  }
  if (subjectSlug === 'science') {
    const key = scienceTopicKey(rows.map(row => row.subdomain).join(' '))
    const matched = key ? anchors.filter(anchor => scienceTopicKey(anchor.subcategory) === key) : []
    if (matched.length) return matched
  }
  return anchors
}

function selectAnchor(subjectSlug, rows, anchors) {
  const category = inferCategory(subjectSlug, rows[0] || {})
  const candidates = anchors.filter(anchor => anchor.category === category)
  const pool = constrainedAnchorPool(subjectSlug, rows, candidates.length ? candidates : anchors)
  if (!pool.length) return { anchor: null, category, confidence: 0, score: 0, second_score: 0 }
  const text = groupText(rows)
  const ranked = pool.map(anchor => ({
    anchor,
    score: overlapScore(text, `${anchor.category} ${anchor.subcategory} ${anchor.source_standard_original}`)
  })).sort((a, b) => b.score - a.score || a.anchor.anchor_id.localeCompare(b.anchor.anchor_id))
  const best = ranked[0]
  const second = ranked[1]
  const margin = best && second ? Math.max(0, best.score - second.score) : best.score
  const confidence = Number(Math.max(0.4, Math.min(0.92, 0.52 + best.score * 0.44 + margin * 0.12)).toFixed(2))
  return {
    anchor: best.anchor,
    category,
    confidence,
    score: best.score,
    second_score: second?.score || 0
  }
}

function loadEvidenceItems(path) {
  if (!existsSync(path)) return []
  const payload = JSON.parse(readFileSync(path, 'utf8'))
  return payload.evidence_items || []
}

function loadTaskSignals(path) {
  if (!existsSync(path)) return []
  const payload = JSON.parse(readFileSync(path, 'utf8'))
  return payload.task_signal_items || []
}

function loadProgressions(path) {
  if (!existsSync(path)) return []
  const payload = JSON.parse(readFileSync(path, 'utf8'))
  return payload.progression_candidates || []
}

function buildEvidenceIndexes(evidenceItems, taskSignals, progressions) {
  const evidenceByGroup = new Map()
  const evidenceById = new Map()
  for (const item of evidenceItems) {
    evidenceById.set(item.evidence_id, item)
    if (!item.progression_group_id) continue
    if (!evidenceByGroup.has(item.progression_group_id)) evidenceByGroup.set(item.progression_group_id, [])
    evidenceByGroup.get(item.progression_group_id).push(item)
  }
  const signalsByGroup = new Map()
  for (const item of taskSignals) {
    if (!item.progression_group_id) continue
    if (!signalsByGroup.has(item.progression_group_id)) signalsByGroup.set(item.progression_group_id, [])
    signalsByGroup.get(item.progression_group_id).push(item)
  }
  const progressionsByGroup = new Map(progressions.map(item => [item.progression_group_id, item]))
  return { evidenceByGroup, evidenceById, progressionsByGroup, signalsByGroup }
}

function rowGradeEvidence(row, evidenceById) {
  const ids = [
    ...(Array.isArray(row.supplemental_evidence_ids) ? row.supplemental_evidence_ids : []),
    ...(Array.isArray(row.textbook_evidence_ids) ? row.textbook_evidence_ids : []),
    ...(Array.isArray(row.textbook_unit_evidence_ids) ? row.textbook_unit_evidence_ids : [])
  ]
  const fromIds = ids.map(id => evidenceById.get(id)).filter(Boolean)
  const textbookEvidenceCount = (Array.isArray(row.textbook_evidence) ? row.textbook_evidence.length : 0) +
    (Array.isArray(row.textbook_unit_evidence_ids) ? row.textbook_unit_evidence_ids.length : 0) +
    (Array.isArray(row.textbook_evidence_ids) ? row.textbook_evidence_ids.length : 0)
  return {
    evidence_ids: ids,
    evidence_items_found: fromIds.length,
    evidence_granularity: row.evidence_granularity || 'unknown',
    grade_adaptation_method: row.grade_adaptation_method || 'unknown',
    textbook_evidence_count: textbookEvidenceCount
  }
}

function summarizeGradeEvidence(groupId, rows, indexes) {
  const evidence = indexes.evidenceByGroup.get(groupId) || []
  const signals = indexes.signalsByGroup.get(groupId) || []
  const byGradeSignal = {}
  const bySignalFamily = {}
  const bySourceType = {}
  const byAllowedUse = {}
  const rowEvidence = {}

  for (const item of evidence) {
    countInto(byGradeSignal, item.grade_signal_hint)
    countInto(bySourceType, item.source_type)
  }
  for (const item of signals) {
    countInto(bySignalFamily, item.signal_family)
    countInto(byAllowedUse, item.allowed_use)
  }
  for (const row of rows) {
    rowEvidence[row.grade_band] = rowGradeEvidence(row, indexes.evidenceById)
  }

  const hasTextbookEvidence = Object.values(rowEvidence).some(item => item.textbook_evidence_count > 0 || item.evidence_granularity === 'textbook_unit_level')
  const hasG8Anchor = (byGradeSignal.G8_anchor || 0) > 0 || signals.some(item => item.grade_signal_hint === 'G8_anchor')
  const hasG9Cap = (byGradeSignal.G9_cap || 0) > 0 || signals.some(item => item.grade_signal_hint === 'G9_cap')

  return {
    by_allowed_use: byAllowedUse,
    by_grade_signal: byGradeSignal,
    by_signal_family: bySignalFamily,
    by_source_type: bySourceType,
    evidence_count: evidence.length,
    has_g8_anchor: hasG8Anchor,
    has_g9_cap: hasG9Cap,
    has_textbook_evidence: hasTextbookEvidence,
    row_evidence: rowEvidence,
    signal_count: signals.length
  }
}

function progressionSimilarity(rows) {
  const byBand = Object.fromEntries(rows.map(row => [row.grade_band, row]))
  const pairs = [
    ['H4G7', 'H4G8'],
    ['H4G8', 'H4G9'],
    ['H4G7', 'H4G9']
  ]
  const scores = {}
  for (const [a, b] of pairs) {
    scores[`${a}_${b}`] = byBand[a] && byBand[b] ? similarity(byBand[a].standard, byBand[b].standard) : 1
  }
  return scores
}

function differentiationStatus(rows, evidenceSummary) {
  const standards = new Set(rows.map(row => normalizeText(row.standard)).filter(Boolean))
  const focuses = new Set(rows.map(row => normalizeText(row.grade_specific_focus)).filter(Boolean))
  const sims = progressionSimilarity(rows)
  const maxSimilarity = Math.max(...Object.values(sims))
  const hasDistinctStandards = standards.size === rows.length
  const hasDistinctFocus = focuses.size === rows.length
  const evidenceSignals = [
    evidenceSummary.has_textbook_evidence,
    evidenceSummary.has_g8_anchor,
    evidenceSummary.has_g9_cap,
    evidenceSummary.evidence_count >= 3,
    evidenceSummary.signal_count >= 3
  ].filter(Boolean).length

  let status = 'review_ready_with_evidence'
  const risks = []
  if (!hasDistinctStandards) risks.push('standard_text_not_distinct')
  if (!hasDistinctFocus) risks.push('grade_specific_focus_not_distinct')
  if (maxSimilarity >= 0.92) risks.push('high_standard_similarity')
  if (!evidenceSummary.has_textbook_evidence) risks.push('missing_textbook_grade_evidence')
  if (!evidenceSummary.has_g8_anchor) risks.push('missing_g8_anchor_signal')
  if (!evidenceSummary.has_g9_cap) risks.push('missing_g9_cap_signal')
  if (evidenceSignals < 2) risks.push('thin_grade_differentiation_evidence')

  if (risks.includes('standard_text_not_distinct') || evidenceSignals < 1) status = 'blocked_or_needs_rebuild'
  else if (risks.length >= 3) status = 'needs_human_review'

  return {
    evidence_signal_score: evidenceSignals,
    has_distinct_focus: hasDistinctFocus,
    has_distinct_standards: hasDistinctStandards,
    max_standard_similarity: maxSimilarity,
    pairwise_standard_similarity: sims,
    risk_reasons: risks,
    status
  }
}

function riskPriority(sourceSelection, diff) {
  if (!sourceSelection.anchor || diff.status === 'blocked_or_needs_rebuild') return 'P0'
  if (sourceSelection.confidence < 0.62 || diff.status === 'needs_human_review') return 'P1'
  if (diff.risk_reasons.length) return 'P2'
  return 'P3'
}

function sortedRows(rows) {
  return [...rows].sort((a, b) => (GRADE_ORDER.get(a.grade_band) ?? 99) - (GRADE_ORDER.get(b.grade_band) ?? 99))
}

function clip(value, max = 110) {
  const text = normalizeText(value)
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

function buildGroupReview(subjectSlug, groupId, rows, anchors, indexes) {
  const ordered = sortedRows(rows)
  const sourceSelection = selectAnchor(subjectSlug, ordered, anchors)
  const evidenceSummary = summarizeGradeEvidence(groupId, ordered, indexes)
  const diff = differentiationStatus(ordered, evidenceSummary)
  const priority = riskPriority(sourceSelection, diff)
  const tags = sourceSelection.anchor?.tags || {}

  return {
    anchor: sourceSelection.anchor ? {
      anchor_id: sourceSelection.anchor.anchor_id,
      category: sourceSelection.anchor.category,
      confidence: sourceSelection.confidence,
      match_score: sourceSelection.score,
      second_match_score: sourceSelection.second_score,
      source_section_type: sourceSelection.anchor.source_section_type,
      source_standard_original: sourceSelection.anchor.source_standard_original,
      subcategory: sourceSelection.anchor.subcategory,
      tags
    } : null,
    codes: ordered.map(row => row.code),
    differentiation: diff,
    evidence: evidenceSummary,
    grade_rows: ordered.map(row => ({
      code: row.code,
      evidence: rowGradeEvidence(row, indexes.evidenceById),
      grade_band: row.grade_band,
      grade_specific_focus: row.grade_specific_focus,
      source_standard_original: row.source_standard_original,
      standard: row.standard
    })),
    priority,
    progression_group_id: groupId,
    source_anchor_category: sourceSelection.category,
    subject: SUBJECTS[subjectSlug]?.subject || subjectSlug,
    subject_slug: subjectSlug,
    subdomain: ordered[0]?.subdomain,
    topic: ordered[0]?.subdomain || ordered[0]?.domain
  }
}

function validateRequiredTags(subjectSlug, anchors) {
  const method = SUBJECT_METHODS[subjectSlug]
  const missing = []
  for (const tag of method.required_tags || []) {
    for (const anchor of anchors) {
      if (!normalizeText(anchor.tags?.[tag])) missing.push(`${anchor.anchor_id}:${tag}`)
    }
  }
  return missing
}

function buildSubjectReview(subjectSlug, payload, curatedRows, indexes) {
  const method = SUBJECT_METHODS[subjectSlug]
  const rows = h4gRows(payload, subjectSlug)
  const groups = recordsByGroup(rows)
  const anchors = buildSourceAnchorRegistry(subjectSlug, curatedRows)
  const groupReviews = []
  const byPriority = {}
  const byCategory = {}
  const errors = []
  const warnings = []

  if (!anchors.length) errors.push(`${subjectSlug} has no source anchors under contract rule`)
  const missingTags = validateRequiredTags(subjectSlug, anchors)
  if (missingTags.length) warnings.push(`${subjectSlug} source anchors missing required tags: ${missingTags.slice(0, 20).join(', ')}`)

  for (const [groupId, groupRows] of groups) {
    const review = buildGroupReview(subjectSlug, groupId, groupRows, anchors, indexes)
    groupReviews.push(review)
    countInto(byPriority, review.priority)
    countInto(byCategory, review.source_anchor_category)
  }

  groupReviews.sort((a, b) => a.priority.localeCompare(b.priority) || a.progression_group_id.localeCompare(b.progression_group_id))

  return {
    anchors,
    errors,
    group_reviews: groupReviews,
    method,
    subject: SUBJECTS[subjectSlug]?.subject || subjectSlug,
    subject_slug: subjectSlug,
    summary: {
      by_category: byCategory,
      by_priority: byPriority,
      h4g_records: rows.length,
      progression_groups: groups.size,
      source_anchor_count: anchors.length
    },
    warnings
  }
}

function subjectMarkdown(subjectReview, maxExamples) {
  const examples = subjectReview.group_reviews.filter(item => item.priority !== 'P3').slice(0, maxExamples)
  return `# H4G Remap + Differentiation Review - ${subjectReview.subject}

| Metric | Value |
| --- | ---: |
| H4G records | ${subjectReview.summary.h4g_records} |
| progression groups | ${subjectReview.summary.progression_groups} |
| source anchors | ${subjectReview.summary.source_anchor_count} |
| P0 | ${subjectReview.summary.by_priority.P0 || 0} |
| P1 | ${subjectReview.summary.by_priority.P1 || 0} |
| P2 | ${subjectReview.summary.by_priority.P2 || 0} |
| P3 | ${subjectReview.summary.by_priority.P3 || 0} |

## Extraction Method

- primary source: ${markdownCell(subjectReview.method.primary_source_rule)}
- source section type: ${markdownCell(subjectReview.method.source_section_type)}
- categories: ${subjectReview.method.categories.map(markdownCell).join(', ')}

## Category Coverage

| Category | Groups |
| --- | ---: |
${countRows(subjectReview.summary.by_category)}

## Review Examples

${examples.length ? examples.map(groupMarkdown).join('\n') : '- no P0/P1/P2 examples'}

## Warnings

${subjectReview.warnings.length ? subjectReview.warnings.map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}

## Errors

${subjectReview.errors.length ? subjectReview.errors.map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}
`
}

function groupMarkdown(item) {
  return `### ${item.priority} ${item.progression_group_id}

- topic: ${markdownCell(item.topic)}
- source anchor: ${item.anchor ? `${markdownCell(item.anchor.category)} / ${markdownCell(item.anchor.subcategory)} (${item.anchor.confidence})` : 'missing'}
- differentiation status: ${markdownCell(item.differentiation.status)}
- risks: ${item.differentiation.risk_reasons.length ? item.differentiation.risk_reasons.map(markdownCell).join(', ') : 'none'}
- evidence: textbook=${item.evidence.has_textbook_evidence}, G8=${item.evidence.has_g8_anchor}, G9=${item.evidence.has_g9_cap}, evidence_count=${item.evidence.evidence_count}, signals=${item.evidence.signal_count}

| Grade | Code | Standard |
| --- | --- | --- |
${item.grade_rows.map(row => `| ${row.grade_band} | ${markdownCell(row.code)} | ${markdownCell(clip(row.standard, 150))} |`).join('\n')}
`
}

function overallMarkdown(result) {
  return `# H4G Source Anchor Method Lock + Differentiation Review

Generated at: ${result.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${result.valid} |
| subjects | ${result.summary.subjects} |
| H4G records | ${result.summary.h4g_records} |
| progression groups | ${result.summary.progression_groups} |
| source anchors | ${result.summary.source_anchors} |
| P0 groups | ${result.summary.by_priority.P0 || 0} |
| P1 groups | ${result.summary.by_priority.P1 || 0} |
| P2 groups | ${result.summary.by_priority.P2 || 0} |
| P3 groups | ${result.summary.by_priority.P3 || 0} |
| public writes | ${result.writes_public_data} |

## Subject Summary

| Subject | H4G Records | Groups | Anchors | P0 | P1 | P2 | P3 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${result.subjects.map(subject => `| ${markdownCell(subject.subject)} | ${subject.summary.h4g_records} | ${subject.summary.progression_groups} | ${subject.summary.source_anchor_count} | ${subject.summary.by_priority.P0 || 0} | ${subject.summary.by_priority.P1 || 0} | ${subject.summary.by_priority.P2 || 0} | ${subject.summary.by_priority.P3 || 0} |`).join('\n')}

## Interpretation

P0/P1 do not mean the current standards are unusable. They mean the next human
review should focus there because source-anchor confidence or grade
differentiation evidence is thin. The target remains clear G7/G8/G9 product
standards, using the corrected source anchor plus textbook/exam/teaching
evidence as the differentiation layer.

## Errors

${result.errors.length ? result.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}

## Warnings

${result.warnings.length ? result.warnings.map(warning => `- ${markdownCell(warning)}`).join('\n') : '- none'}
`
}

function build(args) {
  const errors = []
  const warnings = []
  const payloads = loadPublicPayloads(args.dataRoot, errors)
  const evidenceItems = loadEvidenceItems(args.evidenceItems)
  const taskSignals = loadTaskSignals(args.taskSignals)
  const progressions = loadProgressions(args.progressions)
  const indexes = buildEvidenceIndexes(evidenceItems, taskSignals, progressions)
  const subjects = []
  const sourceAnchors = []
  const matrix = []
  const byPriority = {}
  let h4gRecords = 0
  let progressionGroups = 0

  for (const subjectSlug of selectedSubjects(args.subject)) {
    const payload = payloads.get(subjectSlug)
    if (!payload) {
      errors.push(`Missing public payload for subject: ${subjectSlug}`)
      continue
    }
    const subjectReview = buildSubjectReview(subjectSlug, payload, loadCuratedRows(subjectSlug), indexes)
    subjects.push(subjectReview)
    sourceAnchors.push(...subjectReview.anchors)
    matrix.push(...subjectReview.group_reviews)
    h4gRecords += subjectReview.summary.h4g_records
    progressionGroups += subjectReview.summary.progression_groups
    for (const [priority, count] of Object.entries(subjectReview.summary.by_priority)) countInto(byPriority, priority, count)
    errors.push(...subjectReview.errors)
    warnings.push(...subjectReview.warnings)
  }

  const result = {
    contract_version: CONTRACT_VERSION,
    errors,
    generated_at: new Date().toISOString(),
    source_anchor_registry: sourceAnchors,
    subjects,
    summary: {
      by_priority: byPriority,
      h4g_records: h4gRecords,
      progression_groups: progressionGroups,
      source_anchors: sourceAnchors.length,
      subjects: subjects.length
    },
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }

  mkdirSync(args.outDir, { recursive: true })
  mkdirSync(join(args.outDir, 'by_subject'), { recursive: true })
  writeJson(join(args.outDir, 'source_anchor_registry.json'), {
    contract_version: CONTRACT_VERSION,
    generated_at: result.generated_at,
    source_anchor_registry: sourceAnchors,
    writes_public_data: false
  })
  writeJson(join(args.outDir, 'differentiation_review_matrix.json'), {
    contract_version: CONTRACT_VERSION,
    generated_at: result.generated_at,
    group_reviews: matrix,
    writes_public_data: false
  })
  writeJson(join(args.outDir, 'subject_summaries.json'), {
    contract_version: CONTRACT_VERSION,
    generated_at: result.generated_at,
    subjects: subjects.map(subject => ({
      errors: subject.errors,
      subject: subject.subject,
      subject_slug: subject.subject_slug,
      summary: subject.summary,
      warnings: subject.warnings
    })),
    writes_public_data: false
  })
  writeJson(join(args.outDir, 'audit.json'), {
    contract_version: CONTRACT_VERSION,
    errors,
    generated_at: result.generated_at,
    summary: result.summary,
    valid: result.valid,
    warnings,
    writes_public_data: false
  })
  writeText(join(args.outDir, 'overall_review.md'), overallMarkdown(result))
  for (const subject of subjects) {
    writeJson(join(args.outDir, 'by_subject', `${subject.subject_slug}.json`), subject)
    writeText(join(args.outDir, 'by_subject', `${subject.subject_slug}_review.md`), subjectMarkdown(subject, args.maxExamplesPerSubject))
  }
  return result
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    return
  }
  const result = build(args)
  console.log(JSON.stringify({
    h4g_records: result.summary.h4g_records,
    progression_groups: result.summary.progression_groups,
    source_anchors: result.summary.source_anchors,
    subjects: result.summary.subjects,
    valid: result.valid,
    warnings: result.warnings.length,
    writes_public_data: result.writes_public_data
  }, null, 2))
  if (!result.valid && args.strict) process.exitCode = 1
}

main()
