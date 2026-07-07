#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  readJson,
  TARGET_GRADE_SET,
  writeJson
} from './h4g_supplemental_pipeline_utils.js'

const DEFAULT_AUDIT = 'generated/h4g_source_aligned_standard_rewrite_v2/source_aligned_standard_rewrite_v2_audit.json'
const DEFAULT_CANDIDATE_ROOT = 'generated/h4g_source_aligned_standard_rewrite_v2/data_candidate'
const DEFAULT_PUBLIC_ROOT = 'public/data'
const DEFAULT_RECEIPT = 'generated/h4g_source_aligned_standard_rewrite_v2/source_aligned_standard_rewrite_v2_publication_receipt.json'
const CONTRACT_VERSION = 'H4G_SOURCE_ALIGNED_STANDARD_REWRITE_V2_CONTRACT_v0.1'
const PUBLISHED_STATUS = 'v2_published_to_public_preview'
const PUBLISHED_REVIEW_STATUS = 'source_aligned_standard_rewrite_v2_published'
const PRIMARY_PUBLISHED_STATUS = 'primary_stage_public_standard_published'

const GRADE_META = {
  H1: { grade_level: null, grade_range: '1-2', source_grade_band: 'H1', source_grade_range: '1-2', stage_band: 'H1' },
  H2: { grade_level: null, grade_range: '3-4', source_grade_band: 'H2', source_grade_range: '3-4', stage_band: 'H2' },
  H3: { grade_level: null, grade_range: '5-6', source_grade_band: 'H3', source_grade_range: '5-6', stage_band: 'H3' },
  H4G7: { grade_level: 7, grade_range: '7', source_grade_band: 'H4', source_grade_range: '7-9', stage_band: 'H4' },
  H4G8: { grade_level: 8, grade_range: '8', source_grade_band: 'H4', source_grade_range: '7-9', stage_band: 'H4' },
  H4G9: { grade_level: 9, grade_range: '9', source_grade_band: 'H4', source_grade_range: '7-9', stage_band: 'H4' }
}

const MATH_PRIMARY_SUPPLEMENTAL_RECORDS = [
  {
    assessment_evidence_type: '活动记录+问题解决说明+交流表达',
    code: 'MA-D1-PR-001',
    context: '第一学段综合与实践强调从熟悉生活和游戏情境出发，经历观察、操作、记录和交流，感受数学知识之间以及数学与生活之间的联系。',
    discipline: '数学',
    domain: '综合与实践',
    grade: '第一学段（1-2 年级）',
    grade_band: 'H1',
    grade_range: '1-2',
    id: 'MA-D1-PR-001',
    next_code: 'MA-D2-PR-001',
    practice: '可围绕购物、排队、整理物品、校园路线等熟悉情境开展主题活动，让学生用数、图形或简单分类记录发现，并用口头或图示方式说明解决过程。',
    previous_code: '',
    standard: '能在熟悉的生活情境或数学游戏中，经历观察、操作、记录、交流等活动，综合运用数与运算、图形认识和数据分类等知识发现并解决简单问题，感受数学与生活的联系。',
    subdomain: '主题活动与问题解决',
    subject: '数学',
    subject_slug: 'math',
    teaching_tip: '重在让学生经历活动过程，鼓励用实物、图示和简短语言表达想法，不追求复杂建模。',
    ts_confidence: 'medium',
    ts_primary: ['TS2', 'TS4'],
    ts_rationale: '综合与实践强调真实情境中的问题解决、合作探究和数学表达。',
    ts_secondary: ['TS5'],
    ts_tag_source: 'public_stage_field_alignment_supplement'
  },
  {
    assessment_evidence_type: '项目过程记录+数据或图示成果+小组汇报',
    code: 'MA-D2-PR-001',
    context: '第二学段综合与实践强调围绕校园、家庭或社区中的简单真实问题，经历提出问题、收集信息、选择方法、合作解决和表达交流。',
    discipline: '数学',
    domain: '综合与实践',
    grade: '第二学段（3-4 年级）',
    grade_band: 'H2',
    grade_range: '3-4',
    id: 'MA-D2-PR-001',
    next_code: 'MA-D3-PR-001',
    practice: '可围绕班级图书角管理、运动会数据整理、校园空间测量等主题，让学生分工收集信息、整理数据或测量结果，并说明所用数学方法。',
    previous_code: 'MA-D1-PR-001',
    standard: '能围绕校园、家庭或社区中的简单真实问题，经历提出问题、收集信息、选择方法、合作解决和表达交流的过程，综合运用数与运算、图形测量、数据整理等知识解决问题，形成初步应用意识。',
    subdomain: '主题活动与问题解决',
    subject: '数学',
    subject_slug: 'math',
    teaching_tip: '重在把单项知识放入完整活动流程，关注问题提出、方法选择、合作分工和结果说明。',
    ts_confidence: 'medium',
    ts_primary: ['TS2', 'TS4'],
    ts_rationale: '综合与实践强调真实情境中的问题解决、合作探究和数学表达。',
    ts_secondary: ['TS5'],
    ts_tag_source: 'public_stage_field_alignment_supplement'
  },
  {
    assessment_evidence_type: '项目方案+调查实验记录+模型或数据解释+反思汇报',
    code: 'MA-D3-PR-001',
    context: '第三学段综合与实践强调在较复杂真实或跨学科情境中，经历发现和提出问题、设计方案、调查实验、建立模型、解释结果和交流反思。',
    discipline: '数学',
    domain: '综合与实践',
    grade: '第三学段（5-6 年级）',
    grade_band: 'H3',
    grade_range: '5-6',
    id: 'MA-D3-PR-001',
    next_code: '',
    practice: '可围绕节水用水、校园空间优化、出行方案比较、简单经营预算等主题，组织学生建立表格、图示或简单模型，解释结论并反思方案局限。',
    previous_code: 'MA-D2-PR-001',
    standard: '能在较复杂的真实或跨学科情境中，经历发现和提出问题、设计方案、调查实验、建立模型、解释结果和交流反思的过程，综合运用数与代数、图形与几何、统计与概率等知识解决问题，发展模型意识、数据意识和应用意识。',
    subdomain: '项目学习与问题解决',
    subject: '数学',
    subject_slug: 'math',
    teaching_tip: '重在引导学生把方案、数据、模型和结论建立对应关系，能说明假设、依据和改进方向。',
    ts_confidence: 'medium',
    ts_primary: ['TS1', 'TS2'],
    ts_rationale: '综合与实践强调真实情境中的问题解决、模型建构、数据解释和数学表达。',
    ts_secondary: ['TS4', 'TS5'],
    ts_tag_source: 'public_stage_field_alignment_supplement'
  }
]

function parseArgs(argv) {
  const args = {
    audit: DEFAULT_AUDIT,
    candidateRoot: DEFAULT_CANDIDATE_ROOT,
    publicRoot: DEFAULT_PUBLIC_ROOT,
    receipt: DEFAULT_RECEIPT,
    strict: false
  }

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--audit') args.audit = argv[++i]
    else if (item === '--candidate-root') args.candidateRoot = argv[++i]
    else if (item === '--public-root') args.publicRoot = argv[++i]
    else if (item === '--receipt') args.receipt = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }

  return args
}

function usage() {
  console.log(`Usage:
npm run grade7_9:publish-h4g-source-aligned-standard-rewrite-v2-candidate -- --strict

Publishes audited H4G source-aligned v2 standard rewrite candidate files to public/data/by_subject.
The command fails unless the v2 audit file exists and valid=true.`)
}

function jsonFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
}

function sameList(a, b) {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

function auditGate(audit, errors) {
  if (audit.valid !== true) errors.push('Audit valid must be true')

  const summary = audit.summary || {}
  const expected = {
    changed_non_h4g_records: 0,
    distinct_triplets: 390,
    generic_name_records: 0,
    h4g_records: 1170,
    low_overlap_records: 0,
    mechanical_transfer_records: 0,
    metadata_leak_records: 0,
    progression_groups: 390,
    sibling_replication_findings: 0,
    style_wrapper_records: 0,
    template_hit_records: 0
  }

  for (const [key, value] of Object.entries(expected)) {
    if (summary[key] !== value) {
      errors.push(`Audit summary ${key} expected ${value}, got ${summary[key]}`)
    }
  }
}

function validateCandidateRecord(record, file, errors) {
  if (!TARGET_GRADE_SET.has(record.grade_band)) return false

  if (record.source_aligned_rewrite_contract_version !== CONTRACT_VERSION) {
    errors.push(`${file} ${record.code}: unexpected contract ${record.source_aligned_rewrite_contract_version}`)
  }
  if (Array.isArray(record.source_aligned_forbidden_template_hits) && record.source_aligned_forbidden_template_hits.length) {
    errors.push(`${file} ${record.code}: forbidden template hits remain`)
  }
  if (Array.isArray(record.source_aligned_metadata_leaks) && record.source_aligned_metadata_leaks.length) {
    errors.push(`${file} ${record.code}: metadata leaks remain`)
  }
  if (String(record.standard || '').includes('围绕“')) {
    errors.push(`${file} ${record.code}: old wrapper phrase remains in standard`)
  }

  return true
}

function publicGradeFocus(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text
    .replace(/^候选：/, '')
    .split(/；以supporting source|；corrected source|；教材文件证据|；暂无教材文件证据/u)[0]
    .trim()
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function truncateTitle(value, maxLength = 24) {
  const text = clean(value)
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function standardTitleFromText(record) {
  const text = clean(record.standard)
  if (!text) return clean(record.subdomain || record.domain || record.code)
  const firstClause = clean(text.split(/[。；;]/u)[0] || text)
    .replace(/^(能|能够|会|可以|知道|了解|理解|认识|掌握|描述|说出|辨认|识别|初步|在.+?中，?)/u, '')
  return truncateTitle(firstClause || text)
}

function artDiscipline(record) {
  const fromTag = clean(record.source_anchor_tags?.art_discipline_tag || record.art_discipline_tag || record.discipline)
  if (fromTag) return fromTag
  const fromAnchor = clean(record.source_anchor_subcategory).match(/^(音乐|美术|舞蹈|戏剧|影视)/u)
  return fromAnchor?.[1] || ''
}

function chinesePublicSubcategory(record) {
  const text = [
    record.subdomain,
    record.source_anchor_subcategory,
    record.standard
  ].map(clean).join(' ')

  if (/跨学科|活动设计|研究成果|热点问题/u.test(text)) return '跨学科学习'
  if (/整本书|名著|读书活动|推荐/u.test(text)) return '整本书阅读'
  if (/文学|诗歌|小说|散文|戏剧|审美/u.test(text)) return '文学阅读与创意表达'
  if (/识字|写字|语言文字|语言积累|字词/u.test(text)) return '语言文字积累与梳理'
  if (/议论|思辨|观点|证据|论证|判断/u.test(text)) return '思辨性阅读与表达'
  return '实用性阅读与交流'
}

function taskGroupTag(record) {
  const tag = clean(record.source_anchor_tags?.task_group_tag || record.task_group_tag)
  return tag.startsWith('任务群') ? tag : ''
}

function publicDomain(record) {
  const subject = clean(record.subject_slug)
  const domain = clean(record.domain)
  const tags = record.source_anchor_tags || {}
  const moduleTag = clean(tags.content_module_tag || record.content_module_tag)
  const sourceSubcategory = clean(record.source_anchor_subcategory)
  const subdomain = clean(record.subdomain)

  if (!TARGET_GRADE_SET.has(record.grade_band)) return domain

  if (subject === 'pe') {
    if (domain === '健康行为') return '健康教育'
    if (domain === '运动能力') {
      return /体能/u.test(`${moduleTag} ${sourceSubcategory} ${subdomain}`) ? '体能' : '运动技能'
    }
    return domain
  }

  if (subject === 'morality_law') {
    if (domain === '中华优秀传统文化教育' || domain === '革命传统教育') {
      return '中华优秀传统文化与革命传统教育'
    }
    return domain
  }

  return domain
}

function publicDisplaySubcategory(record) {
  const subject = clean(record.subject_slug)
  const domain = publicDomain(record)
  const sourceSubcategory = clean(record.source_anchor_subcategory)
  const subdomain = clean(record.subdomain)
  const tags = record.source_anchor_tags || {}

  if (!TARGET_GRADE_SET.has(record.grade_band)) return subdomain || domain

  if (subject === 'arts') {
    const discipline = artDiscipline(record)
    return discipline ? `学习任务：${discipline}` : '学习任务'
  }

  if (subject === 'chinese') return chinesePublicSubcategory(record)
  if (subject === 'english') return sourceSubcategory || subdomain || domain
  if (subject === 'it') return domain
  if (subject === 'labor') return taskGroupTag(record) || domain
  if (subject === 'math') return sourceSubcategory || subdomain || domain
  if (subject === 'morality_law') return domain
  if (subject === 'pe') return sourceSubcategory || clean(tags.content_module_tag) || subdomain || domain
  if (subject === 'science') return sourceSubcategory || clean(tags.core_concept_tag) || clean(tags.content_module_tag) || subdomain || domain

  return sourceSubcategory || subdomain || domain
}

function isH4G(record) {
  return TARGET_GRADE_SET.has(record.grade_band)
}

function addCount(target, key) {
  const safeKey = clean(key) || 'missing'
  target[safeKey] = (target[safeKey] || 0) + 1
}

function firstListItem(value) {
  return Array.isArray(value) && value.length ? clean(value[0]) : ''
}

function subjectStandardsWithSupplements(payload) {
  const standards = [...(payload.standards || [])]
  if (payload.subject_slug !== 'math') return standards

  const existingCodes = new Set(standards.map(record => record.code))
  for (const record of MATH_PRIMARY_SUPPLEMENTAL_RECORDS) {
    if (!existingCodes.has(record.code)) {
      standards.push({
        ...record,
        supplemental_alignment_reason: 'H1-H3 math lacked 综合与实践 while the public subject structure and H4G records use the four-domain math model.',
        supplemental_public_alignment_record: true
      })
    }
  }
  return standards
}

function publicPayloadIndexes(standards) {
  const indexes = {
    domains: {},
    evidence_granularities: {},
    grade_assignment_types: {},
    grade_bands: {},
    grades: {},
    progression_basis: {},
    review_statuses: {},
    standard_variant_types: {},
    ts_primary: {}
  }

  for (const record of standards) {
    addCount(indexes.domains, record.domain)
    addCount(indexes.evidence_granularities, record.evidence_granularity)
    addCount(indexes.grade_assignment_types, record.grade_assignment_type)
    addCount(indexes.grade_bands, record.grade_band)
    addCount(indexes.grades, record.grade)
    addCount(indexes.progression_basis, record.progression_basis)
    addCount(indexes.review_statuses, record.review_status)
    addCount(indexes.standard_variant_types, record.standard_variant_type)
    addCount(indexes.ts_primary, firstListItem(record.ts_primary))
  }

  return indexes
}

function commonPublicFields(record) {
  const gradeMeta = GRADE_META[record.grade_band] || {}
  const displaySubcategory = publicDisplaySubcategory(record)
  const originalDomain = clean(record.original_domain || record.original_h4g_domain || record.domain)
  const originalSubdomain = clean(record.original_subdomain || record.subdomain)

  return {
    display_subcategory: displaySubcategory,
    grade_level: record.grade_level ?? gradeMeta.grade_level ?? null,
    grade_range: clean(record.grade_range || gradeMeta.grade_range),
    original_domain: originalDomain,
    original_subdomain: originalSubdomain,
    public_record_group: isH4G(record) ? 'h4g_source_aligned_grade_standard' : 'primary_stage_standard',
    source_grade_band: clean(record.source_grade_band || gradeMeta.source_grade_band || record.grade_band),
    source_grade_range: clean(record.source_grade_range || gradeMeta.source_grade_range || record.grade_range),
    stage_band: clean(record.stage_band || gradeMeta.stage_band || record.grade_band),
    standard_title: isH4G(record)
      ? clean(record.standard_title || record.source_aligned_candidate_topic || record.subdomain)
      : clean(record.standard_title || standardTitleFromText(record)),
    writes_public_data: true
  }
}

function markPrimaryRecord(record) {
  return {
    ...record,
    ...commonPublicFields(record),
    grade_specific_focus: record.grade_specific_focus || '',
    published_from_source_aligned_candidate: false,
    review_status: record.review_status || PRIMARY_PUBLISHED_STATUS,
    source_aligned_rewrite_status: record.source_aligned_rewrite_status || 'not_applicable_primary_stage',
    standard_text_role: record.standard_text_role || 'stage_specific_public_standard',
    standard_variant_type: record.standard_variant_type || 'stage_specific_standard'
  }
}

function markH4GRecord(record, publishedAt) {
  return {
    ...record,
    ...commonPublicFields(record),
    domain: publicDomain(record),
    grade_specific_focus: publicGradeFocus(record.grade_specific_focus),
    original_h4g_domain: record.original_h4g_domain || record.domain || '',
    pre_publication_review_status: record.pre_publication_review_status || record.review_status || '',
    public_write_candidate: false,
    published_from_source_aligned_candidate: true,
    review_status: PUBLISHED_REVIEW_STATUS,
    source_aligned_candidate_grade_specific_focus: record.grade_specific_focus || '',
    source_aligned_rewrite_published_at: publishedAt,
    source_aligned_rewrite_status: PUBLISHED_STATUS,
    standard_text_role: record.standard_text_role || 'grade_specific_source_aligned_standard',
    writes_public_data: true
  }
}

function markPublished(payload, publishedAt, receiptPath) {
  const sourceStandards = subjectStandardsWithSupplements(payload)
  const standards = sourceStandards.map(record => {
    if (!isH4G(record)) return markPrimaryRecord(record)
    return markH4GRecord(record, publishedAt)
  })

  return {
    ...payload,
    h4g_source_aligned_rewrite_publication_receipt: receiptPath,
    h4g_source_aligned_rewrite_published_at: publishedAt,
    h4g_source_aligned_rewrite_status: PUBLISHED_STATUS,
    indexes: publicPayloadIndexes(standards),
    publication_candidate: false,
    record_count: standards.length,
    standards,
    writes_public_data: true
  }
}

function publish(args) {
  const errors = []

  if (!existsSync(args.audit)) errors.push(`Missing audit file: ${args.audit}`)
  if (!existsSync(args.candidateRoot)) errors.push(`Missing candidate root: ${args.candidateRoot}`)
  if (!existsSync(args.publicRoot)) errors.push(`Missing public root: ${args.publicRoot}`)

  const candidateBySubject = join(args.candidateRoot, 'by_subject')
  const publicBySubject = join(args.publicRoot, 'by_subject')
  if (!existsSync(candidateBySubject)) errors.push(`Missing candidate by_subject: ${candidateBySubject}`)
  if (!existsSync(publicBySubject)) errors.push(`Missing public by_subject: ${publicBySubject}`)

  const audit = existsSync(args.audit) ? readJson(args.audit) : null
  if (audit) auditGate(audit, errors)

  const candidateFiles = jsonFiles(candidateBySubject)
  const publicFiles = jsonFiles(publicBySubject)
  if (!sameList(candidateFiles, publicFiles)) {
    errors.push(`Candidate/public subject files differ: candidate=${candidateFiles.join(',')} public=${publicFiles.join(',')}`)
  }

  let h4gRecords = 0
  const candidatePayloads = []
  if (!errors.length) {
    for (const file of candidateFiles) {
      const payload = readJson(join(candidateBySubject, file))
      if (!Array.isArray(payload.standards)) {
        errors.push(`${file}: missing standards[]`)
        continue
      }
      for (const record of payload.standards) {
        if (validateCandidateRecord(record, file, errors)) h4gRecords += 1
      }
      candidatePayloads.push([file, payload])
    }
  }

  if (!errors.length && h4gRecords !== 1170) {
    errors.push(`Expected 1170 H4G records, got ${h4gRecords}`)
  }

  const copied = []
  const publishedAt = new Date().toISOString()
  if (!errors.length) {
    mkdirSync(publicBySubject, { recursive: true })
    for (const [file, payload] of candidatePayloads) {
      writeJson(join(publicBySubject, file), markPublished(payload, publishedAt, args.receipt))
      copied.push(`by_subject/${file}`)
    }
  }

  const receipt = {
    audit_file: args.audit,
    candidate_root: args.candidateRoot,
    copied,
    contract_version: CONTRACT_VERSION,
    errors,
    generated_at: publishedAt,
    h4g_records: h4gRecords,
    public_root: args.publicRoot,
    status: errors.length ? 'blocked' : PUBLISHED_STATUS,
    valid: errors.length === 0,
    writes_public_data: copied.length > 0
  }

  mkdirSync(dirname(args.receipt), { recursive: true })
  writeJson(args.receipt, receipt)
  return receipt
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const result = publish(args)
console.log(JSON.stringify({
  copied_files: result.copied.length,
  h4g_records: result.h4g_records,
  status: result.status,
  valid: result.valid,
  writes_public_data: result.writes_public_data
}, null, 2))

if (!result.valid && args.strict) process.exitCode = 1
