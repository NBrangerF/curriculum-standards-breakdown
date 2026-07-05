#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { SUBJECTS, getSubjectConfig, gradeLabel, slugifyDomain } from './config.js'
import {
  TARGET_GRADE_BANDS,
  countInto,
  countRows,
  hashJson,
  markdownCell,
  normalizeText,
  readJson,
  recordsByGroup,
  shortHash,
  sorted,
  stable,
  subjectAxis,
  subjectFiles,
  summarizeGroup,
  writeJson,
  writeText
} from './h4g_supplemental_pipeline_utils.js'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_PROGRESSIONS = 'generated/h4g_progression_candidates/progression_candidates.json'
const DEFAULT_EVIDENCE = 'generated/h4g_supplemental_evidence/evidence_items.json'
const DEFAULT_GROUP_MAP = 'generated/h4g_skill_graph/group_to_skill_map.json'
const DEFAULT_OUT = 'generated/h4g_standard_rewrite/standard_rewrite_candidates.json'
const DEFAULT_BY_SUBJECT_DIR = 'generated/h4g_standard_rewrite/by_subject'
const DEFAULT_DATA_CANDIDATE_ROOT = 'generated/h4g_standard_rewrite/data_candidate'
const DEFAULT_AUDIT_OUT = 'generated/h4g_standard_rewrite/standard_rewrite_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/h4g_standard_rewrite/standard_rewrite_review.md'
const DEFAULT_FREEZE_OUT = 'generated/h4g_standard_rewrite/standard_rewrite.freeze.json'

const CONTRACT_VERSION = 'H4G_STANDARD_REWRITE_CONTRACT_v1'
const TARGET_GRADE_INFO = {
  H4G7: {
    band: 'H4G7',
    grade: 7,
    grade_label: '七年级',
    mode: 'entry',
    focus: '识别、理解、描述、单步骤应用、熟悉情境'
  },
  H4G8: {
    band: 'H4G8',
    grade: 8,
    grade_label: '八年级',
    mode: 'middle',
    focus: '比较、整合、解释、推断、多步骤应用、关系化理解'
  },
  H4G9: {
    band: 'H4G9',
    grade: 9,
    grade_label: '九年级',
    mode: 'exit',
    focus: '迁移、评价、论证、综合探究、真实情境问题解决'
  }
}

function parseArgs(argv) {
  const args = {
    auditOut: DEFAULT_AUDIT_OUT,
    bySubjectDir: DEFAULT_BY_SUBJECT_DIR,
    dataCandidateRoot: DEFAULT_DATA_CANDIDATE_ROOT,
    dataRoot: DEFAULT_DATA_ROOT,
    evidence: DEFAULT_EVIDENCE,
    freeze: false,
    freezeOut: DEFAULT_FREEZE_OUT,
    groupMap: DEFAULT_GROUP_MAP,
    out: DEFAULT_OUT,
    progressions: DEFAULT_PROGRESSIONS,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--audit-out') args.auditOut = argv[++i]
    else if (item === '--by-subject-dir') args.bySubjectDir = argv[++i]
    else if (item === '--data-candidate-root') args.dataCandidateRoot = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--evidence') args.evidence = argv[++i]
    else if (item === '--freeze') args.freeze = true
    else if (item === '--freeze-out') args.freezeOut = argv[++i]
    else if (item === '--group-map') args.groupMap = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--progressions') args.progressions = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/build_h4g_standard_rewrite_candidates.js --strict --freeze

Builds a complete H4G G7/G8/G9 standard rewrite staging candidate. The script
rewrites product-facing standard text, preserves source_standard_original,
fills missing H4G sibling records in the generated candidate root, and writes
only under generated/. It does not modify public/data.`)
}

function readSubjectPayloads(dataRoot) {
  const payloads = new Map()
  for (const file of subjectFiles(dataRoot)) {
    const subjectSlug = basename(file, '.json')
    payloads.set(subjectSlug, readJson(file))
  }
  return payloads
}

function h4gRecordsFromPayloads(payloads) {
  const records = []
  for (const [subjectSlug, payload] of payloads) {
    for (const record of payload.standards || []) {
      if (!TARGET_GRADE_BANDS.includes(record.grade_band)) continue
      records.push({
        ...record,
        subject_slug: record.subject_slug || subjectSlug,
        subject: record.subject || payload.subject || SUBJECTS[subjectSlug]?.subject || subjectSlug
      })
    }
  }
  return records
}

function mapByProgressionId(progressions) {
  return new Map((progressions.progression_candidates || []).map(item => [item.progression_group_id, item]))
}

function mapByGroup(groupMapPayload) {
  return new Map((groupMapPayload.group_to_skill_map || []).map(item => [item.progression_group_id, item]))
}

function evidenceIdSet(evidencePayload) {
  return new Set((evidencePayload.evidence_items || []).map(item => item.evidence_id))
}

function cleanClause(text, max = 86) {
  const normalized = normalizeText(text)
  if (!normalized) return '本学习要求'
  const firstClause = normalized.split(/[。；;.!?？]/u).find(Boolean) || normalized
  if (firstClause.length <= max) return firstClause
  return `${firstClause.slice(0, max)}…`
}

function topic(record) {
  return normalizeText(record.subdomain) || normalizeText(record.domain) || '本主题'
}

function subjectRewriteFrame(subjectSlug, gradeBand) {
  const grade = TARGET_GRADE_INFO[gradeBand]
  const frames = {
    chinese: {
      H4G7: ['在熟悉文本和明确任务支架下', '提取关键信息、描述基本内容或表达初步理解', '形成简短、清楚的阅读或表达成果'],
      H4G8: ['在较复杂文本、话题或活动中', '比较信息、整合依据、解释关系并表达有结构的观点', '完成有层次的阅读、交流或写作任务'],
      H4G9: ['在综合文本、真实议题或开放任务中', '评价观点、论证判断、迁移方法并形成独立解释', '完成较完整的鉴赏、探究或表达作品']
    },
    math: {
      H4G7: ['在熟悉数学或生活情境中', '理解核心概念、基本表示和规则方法', '完成单步骤计算、作图、解释或简单应用'],
      H4G8: ['在包含多个条件或关系的情境中', '比较表示方法、建立数量或图形关系并进行多步推理', '选择合适方法解决较复杂问题'],
      H4G9: ['在综合或真实问题情境中', '迁移概念、建构模型、论证方法并评价结果', '形成完整的问题解决过程和反思']
    },
    english: {
      H4G7: ['在熟悉主题和简短语篇中', '获取主要信息、理解基本意义并进行句段表达', '完成基础交际或语言运用任务'],
      H4G8: ['在较长语篇和多信息任务中', '整合信息、推断意图、比较文化或观点并组织表达', '完成结构化交流、阅读或写作任务'],
      H4G9: ['在多语篇、真实交际或跨文化情境中', '评价观点、调适表达、论证理解并迁移语言策略', '完成综合性沟通或表达任务']
    },
    science: {
      H4G7: ['在可观察现象和基础实验任务中', '识别概念、记录证据并作出基本解释', '完成单变量或单步骤探究活动'],
      H4G8: ['在多因素现象和探究任务中', '分析证据、解释关系、建立初步模型并进行多步骤实验', '形成基于证据的说明'],
      H4G9: ['在综合科学或真实问题情境中', '迁移概念、设计方案、评价证据和模型', '解决较复杂问题并反思优化']
    },
    morality_law: {
      H4G7: ['在个人成长和熟悉生活情境中', '识别规则、价值和基本事实', '作出有依据的态度说明或简单判断'],
      H4G8: ['在校园、家庭、社会案例中', '分析关系、解释权利义务或价值冲突', '提出较有条理的判断与建议'],
      H4G9: ['在公共议题、法治案例或国家社会情境中', '综合运用规范、价值与事实进行论证', '形成行动方案、责任表达或反思评价']
    },
    it: {
      H4G7: ['在熟悉数字工具和简单问题中', '识别数据、算法、系统或安全概念', '完成基础操作、表达或单步骤设计'],
      H4G8: ['在较完整的信息活动或项目中', '分解问题、组织数据、设计流程并调试改进', '完成多步骤数字作品或解决方案'],
      H4G9: ['在真实数字化问题或智能系统情境中', '综合设计、评价优化并关注安全伦理责任', '形成可解释的系统方案或创新作品']
    },
    arts: {
      H4G7: ['在熟悉作品、材料和基本技法中', '感知艺术要素、描述风格特征并进行基础表现', '完成有支架的欣赏、表现或创意实践'],
      H4G8: ['在多样作品、主题或表现任务中', '比较艺术语言、整合材料技法并表达主题意图', '完成较完整的创作、表演或分析'],
      H4G9: ['在综合艺术任务和文化情境中', '评价作品、阐释意义、迁移技法并优化表达', '形成有观点的创作、展示或评论']
    },
    pe: {
      H4G7: ['在基础练习、规则学习和健康情境中', '掌握基本动作、方法和安全要求', '完成规范练习或简单运动应用'],
      H4G8: ['在组合技能、合作竞赛和健康管理任务中', '运用策略、调整方法并分析运动表现', '完成较复杂的练习、比赛或计划'],
      H4G9: ['在专项运动、真实比赛或自主管理情境中', '综合运用技能策略、评价表现并优化方案', '体现责任、合作和长期健康行为']
    },
    labor: {
      H4G7: ['在家庭、学校或熟悉劳动任务中', '理解规范、掌握基本技能并安全操作', '完成单项或低复杂度劳动实践'],
      H4G8: ['在综合劳动任务或协作项目中', '设计流程、分工实施、解决过程问题', '形成较完整的劳动成果与反思'],
      H4G9: ['在真实需求、服务或创新项目中', '统筹资源、优化方案、评价质量并承担责任', '形成可展示、可改进的劳动成果']
    }
  }
  return frames[subjectSlug]?.[gradeBand] || [
    grade.mode === 'entry' ? '在熟悉学习任务中' : grade.mode === 'middle' ? '在较复杂学习任务中' : '在综合真实学习任务中',
    grade.mode === 'entry' ? '识别、理解并描述关键要求' : grade.mode === 'middle' ? '比较、整合并解释关键要求' : '迁移、评价并论证关键要求',
    grade.mode === 'entry' ? '完成单步骤应用' : grade.mode === 'middle' ? '完成多步骤应用' : '完成综合应用和反思'
  ]
}

function rewriteStandard(record, gradeBand, sourceStandard) {
  const [context, action, output] = subjectRewriteFrame(record.subject_slug, gradeBand)
  const theme = topic(record)
  const kernel = cleanClause(sourceStandard)
  return `围绕“${theme}”，${context}，${action}；能结合“${kernel}”的核心要求，${output}。`
}

function gradeSpecificFocus(record, gradeBand, sourceStandard) {
  const grade = TARGET_GRADE_INFO[gradeBand]
  const theme = topic(record)
  const kernel = cleanClause(sourceStandard, 64)
  return `候选：${grade.grade_label}聚焦“${theme}”的${grade.focus}；保留原始要求“${kernel}”的能力主轴，并把学习任务调整到本年级可观察的表现层级。`
}

function variantType(group, record) {
  if (!group.complete_triplet) return 'grade_adapted_from_partial_source_range'
  if (record.standard_variant_type === 'grade_specific_variant') return 'grade_specific_variant'
  return 'grade_adapted_from_shared_source'
}

function adaptationMethod(group, record, progression) {
  if (!group.complete_triplet) return 'source_range_bridge'
  if (record.evidence_granularity === 'textbook_unit_level' || group.unit_level_evidence_records > 0) return 'textbook_sequence_split'
  if (['arts', 'pe', 'labor'].includes(record.subject_slug)) return 'performance_rubric_split'
  if (progression?.evidence_support?.by_grade_signal_hint?.G9_cap && progression?.evidence_support?.by_grade_signal_hint?.G8_anchor) {
    return 'cognitive_complexity_split'
  }
  return 'task_complexity_split'
}

function supportMethods(primary, progression) {
  const methods = [primary]
  if (progression?.evidence_support?.by_grade_signal_hint?.G8_anchor) methods.push('g8_anchor_split')
  if (progression?.evidence_support?.by_grade_signal_hint?.G9_cap) methods.push('assessment_cap_split')
  if (!methods.includes('cognitive_complexity_split')) methods.push('cognitive_complexity_split')
  return sorted(methods)
}

function sourceScope(record, group, gradeBand) {
  if (record.source_standard_scope && record.source_standard_scope !== 'partial_grade_source') return record.source_standard_scope
  if (!group.complete_triplet) {
    if (record.subject_slug === 'arts' && gradeBand === 'H4G7') return 'official_2022_arts_1_7_bridge'
    if (record.subject_slug === 'arts' && ['H4G8', 'H4G9'].includes(gradeBand)) return 'official_2022_arts_8_9_bridge'
    return 'partial_grade_source_bridge'
  }
  return 'official_2022_h4_7_9'
}

function adaptationRationale(record, gradeBand, group, progression, method) {
  const grade = TARGET_GRADE_INFO[gradeBand]
  const theme = topic(record)
  const axis = progression?.axis || subjectAxis(record.subject_slug, record.domain, record.subdomain)
  const groupNote = group.complete_triplet
    ? '原始课标以 H4 共享学段要求呈现，本候选按能力发展连续体拆分。'
    : '原始课标或当前数据为部分年级范围，本候选先进行 source range bridge，再补足 H4G7/H4G8/H4G9 review surface。'
  return `${groupNote}${grade.grade_label}围绕“${theme}”定位为${grade.focus}；改写轴为 ${axis}，主方法为 ${method}，并结合 Gate 1 evidence 与 Gate 3 progression candidate 保留后续人工整体 review。`
}

function adaptationConfidence(record, group, progression) {
  let score = Number(progression?.candidate_confidence || 0.52)
  if (group.complete_triplet) score += 0.08
  else score += 0.03
  if (group.unit_level_evidence_records > 0 || record.evidence_granularity === 'textbook_unit_level') score += 0.04
  if (progression?.evidence_support?.by_grade_signal_hint?.G8_anchor) score += 0.02
  if (progression?.evidence_support?.by_grade_signal_hint?.G9_cap) score += 0.02
  return Number(Math.max(0.45, Math.min(0.78, score)).toFixed(2))
}

function chooseSourceSibling(records, gradeBand) {
  const preference = {
    H4G7: ['H4G8', 'H4G9'],
    H4G8: ['H4G7', 'H4G9'],
    H4G9: ['H4G8', 'H4G7']
  }[gradeBand] || TARGET_GRADE_BANDS
  for (const band of preference) {
    const match = records.find(record => record.grade_band === band)
    if (match) return match
  }
  return records[0]
}

function generatedCode(record, gradeBand, groupId, usedCodes) {
  const config = getSubjectConfig(record.subject_slug)
  const domainCode = slugifyDomain(record.domain || 'GEN', record.subject_slug)
  const seed = shortHash(`${groupId}|${gradeBand}|${record.domain}|${record.subdomain}`, 6).toUpperCase()
  let code = `${config.prefix}-${gradeBand}-${domainCode}-RW-${seed}`
  let suffix = 2
  while (usedCodes.has(code)) {
    code = `${config.prefix}-${gradeBand}-${domainCode}-RW-${seed}-${suffix}`
    suffix += 1
  }
  usedCodes.add(code)
  return code
}

function createMissingRecord(sourceRecord, gradeBand, groupId, usedCodes) {
  const code = generatedCode(sourceRecord, gradeBand, groupId, usedCodes)
  const grade = TARGET_GRADE_INFO[gradeBand]
  return {
    ...sourceRecord,
    candidate_added_record: true,
    code,
    grade: gradeLabel(grade.grade),
    grade_band: gradeBand,
    grade_level: grade.grade,
    grade_range: String(grade.grade),
    id: code,
    previous_code: '',
    next_code: '',
    review_status: 'rewrite_candidate_partial_source_bridge_needs_review',
    standard_rewrite_record_origin: 'generated_missing_h4g_sibling'
  }
}

function rewriteRecord(record, group, progression, mapping, gradeBand, options = {}) {
  const sourceStandard = record.source_standard_original || record.standard || ''
  const method = adaptationMethod(group, record, progression)
  const rewrittenStandard = rewriteStandard(record, gradeBand, sourceStandard)
  const supplementalEvidenceIds = sorted(progression?.evidence_support?.evidence_ids || [])
  const grade = TARGET_GRADE_INFO[gradeBand]
  const rewriteId = `srw-${shortHash([record.code, group.progression_group_id, gradeBand, sourceStandard].join('|'), 16)}`
  return {
    ...record,
    grade: gradeLabel(grade.grade),
    grade_adaptation_confidence: adaptationConfidence(record, group, progression),
    grade_adaptation_method: method,
    grade_adaptation_rationale: adaptationRationale(record, gradeBand, group, progression, method),
    grade_adaptation_support_methods: supportMethods(method, progression),
    grade_band: gradeBand,
    grade_level: grade.grade,
    grade_range: String(grade.grade),
    grade_specific_focus: gradeSpecificFocus(record, gradeBand, sourceStandard),
    h4g_rewrite_contract_version: CONTRACT_VERSION,
    public_write_candidate: false,
    review_status: group.complete_triplet ? 'rewrite_candidate_needs_review' : 'rewrite_candidate_partial_source_bridge_needs_review',
    source_standard_original: sourceStandard,
    source_standard_scope: sourceScope(record, group, gradeBand),
    standard: rewrittenStandard,
    standard_rewrite_candidate_id: rewriteId,
    standard_rewrite_group_status: group.complete_triplet ? 'complete_triplet_rewritten' : 'partial_triplet_bridged_in_staging',
    standard_rewrite_record_origin: options.added ? 'generated_missing_h4g_sibling' : (record.standard_rewrite_record_origin || 'rewritten_existing_public_record'),
    standard_text_role: 'grade_adapted_display_standard',
    standard_variant_type: variantType(group, record),
    supplemental_evidence_ids: supplementalEvidenceIds,
    skill_node_id: mapping?.skill_node_id || progression?.skill_node_id || '',
    writes_public_data: false
  }
}

function nonH4G(record) {
  return !TARGET_GRADE_BANDS.includes(record.grade_band)
}

function stableStandards(records) {
  return [...records].sort((a, b) => {
    const gradeCompare = String(a.grade_band || '').localeCompare(String(b.grade_band || ''))
    if (gradeCompare) return gradeCompare
    return String(a.code || '').localeCompare(String(b.code || ''))
  })
}

function columnsForStandards(standards, existingColumns = []) {
  const columns = new Set(existingColumns)
  for (const record of standards) {
    for (const key of Object.keys(record)) columns.add(key)
  }
  return [...columns].sort((a, b) => a.localeCompare(b))
}

function buildAudit(candidates, subjectPayloads, evidenceIds) {
  const errors = []
  const warnings = []
  const bySubject = {}
  const byVariant = {}
  const byMethod = {}
  const byStatus = {}
  const groups = new Map()
  const codes = new Set()
  const h4gRecords = []

  for (const payload of subjectPayloads.values()) {
    for (const record of payload.standards || []) {
      if (codes.has(record.code)) errors.push(`duplicate code in staging root: ${record.code}`)
      codes.add(record.code)
      if (!TARGET_GRADE_BANDS.includes(record.grade_band)) continue
      h4gRecords.push(record)
      countInto(bySubject, record.subject_slug)
      countInto(byVariant, record.standard_variant_type)
      countInto(byMethod, record.grade_adaptation_method)
      countInto(byStatus, record.review_status)
      if (!groups.has(record.progression_group_id)) groups.set(record.progression_group_id, [])
      groups.get(record.progression_group_id).push(record)
      for (const field of [
        'standard',
        'source_standard_original',
        'source_standard_scope',
        'standard_text_role',
        'standard_variant_type',
        'grade_adaptation_method',
        'grade_adaptation_rationale',
        'grade_adaptation_confidence',
        'supplemental_evidence_ids',
        'review_status'
      ]) {
        if (record[field] === undefined || record[field] === null || record[field] === '') {
          errors.push(`${record.code} missing ${field}`)
        }
      }
      if (record.standard_text_role !== 'grade_adapted_display_standard') errors.push(`${record.code} standard_text_role must be grade_adapted_display_standard`)
      if (record.writes_public_data !== false) errors.push(`${record.code} writes_public_data must be false`)
      if (record.public_write_candidate !== false) errors.push(`${record.code} public_write_candidate must be false before user review`)
      if (normalizeText(record.standard) === normalizeText(record.source_standard_original)) {
        errors.push(`${record.code} rewritten standard must differ from source_standard_original`)
      }
      if (!Array.isArray(record.supplemental_evidence_ids) || !record.supplemental_evidence_ids.length) {
        errors.push(`${record.code} must have supplemental_evidence_ids`)
      } else {
        for (const id of record.supplemental_evidence_ids) {
          if (!evidenceIds.has(id)) errors.push(`${record.code} references missing supplemental evidence id ${id}`)
        }
      }
      if (!Number.isFinite(Number(record.grade_adaptation_confidence))) errors.push(`${record.code} grade_adaptation_confidence must be numeric`)
    }
  }

  for (const [groupId, records] of groups) {
    const gradeBands = records.map(record => record.grade_band)
    const gradeSet = new Set(gradeBands)
    if (records.length !== 3 || TARGET_GRADE_BANDS.some(band => !gradeSet.has(band))) {
      errors.push(`${groupId} must have exactly one record for each H4G7/H4G8/H4G9 in staging root`)
    }
    const standardSet = new Set(records.map(record => normalizeText(record.standard)))
    if (standardSet.size !== records.length) errors.push(`${groupId} must have distinct rewritten standards across grade siblings`)
    const sourceSet = new Set(records.map(record => normalizeText(record.source_standard_original)))
    if (sourceSet.size === 0) errors.push(`${groupId} missing source standards`)
  }

  const candidateIds = new Set()
  for (const candidate of candidates) {
    if (candidateIds.has(candidate.standard_rewrite_candidate_id)) errors.push(`duplicate standard_rewrite_candidate_id: ${candidate.standard_rewrite_candidate_id}`)
    candidateIds.add(candidate.standard_rewrite_candidate_id)
  }

  return {
    changes_official_standard_text: true,
    contract_version: CONTRACT_VERSION,
    errors,
    generated_at: new Date().toISOString(),
    purpose: 'h4g_standard_rewrite_audit',
    summary: {
      by_grade_adaptation_method: byMethod,
      by_review_status: byStatus,
      by_standard_variant_type: byVariant,
      by_subject: bySubject,
      candidate_records: candidates.length,
      h4g_records_in_staging_root: h4gRecords.length,
      progression_groups: groups.size,
      target_h4g_records: groups.size * 3
    },
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }
}

function buildMarkdown(audit) {
  return `# H4G Standard Rewrite Candidate Review

Generated at: ${audit.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${audit.valid} |
| progression groups | ${audit.summary.progression_groups} |
| target H4G records | ${audit.summary.target_h4g_records} |
| H4G records in staging root | ${audit.summary.h4g_records_in_staging_root} |
| candidate records | ${audit.summary.candidate_records} |
| errors | ${audit.errors.length} |
| warnings | ${audit.warnings.length} |
| writes_public_data | ${audit.writes_public_data} |

## Subjects

| Subject | H4G Staging Records |
| --- | ---: |
${countRows(audit.summary.by_subject)}

## Variant Types

| Type | Count |
| --- | ---: |
${countRows(audit.summary.by_standard_variant_type)}

## Adaptation Methods

| Method | Count |
| --- | ---: |
${countRows(audit.summary.by_grade_adaptation_method)}

## Review Status

| Status | Count |
| --- | ---: |
${countRows(audit.summary.by_review_status)}

## Errors

${audit.errors.length ? audit.errors.slice(0, 100).map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}

## Warnings

${audit.warnings.length ? audit.warnings.slice(0, 100).map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}
`
}

function ensureDataRootScaffold(sourceRoot, targetRoot) {
  const payloads = readSubjectPayloads(sourceRoot)
  mkdirSync(targetRoot, { recursive: true })
  const sourceFiles = readdirSync(sourceRoot).filter(file => file.endsWith('.json'))
  for (const file of sourceFiles) {
    if (file === 'manifest.json') continue
    copyFileSync(join(sourceRoot, file), join(targetRoot, file))
  }
  const indexesDir = join(sourceRoot, 'indexes')
  if (existsSync(indexesDir)) {
    mkdirSync(join(targetRoot, 'indexes'), { recursive: true })
    for (const file of readdirSync(indexesDir).filter(item => item.endsWith('.json'))) {
      writeJson(join(targetRoot, 'indexes', file), readJson(join(indexesDir, file)))
    }
  }
  return payloads
}

function build(args) {
  const sourcePayloads = readSubjectPayloads(args.dataRoot)
  ensureDataRootScaffold(args.dataRoot, args.dataCandidateRoot)
  const progressionPayload = readJson(args.progressions)
  const evidencePayload = readJson(args.evidence)
  const groupMapPayload = readJson(args.groupMap)
  const progressions = mapByProgressionId(progressionPayload)
  const mappings = mapByGroup(groupMapPayload)
  const evidenceIds = evidenceIdSet(evidencePayload)
  const h4gRecords = h4gRecordsFromPayloads(sourcePayloads)
  const groups = recordsByGroup(h4gRecords)
  const usedCodes = new Set([...sourcePayloads.values()].flatMap(payload => (payload.standards || []).map(record => record.code)))
  const subjectH4G = new Map()
  const rewriteCandidates = []

  for (const [groupId, rows] of groups) {
    const group = summarizeGroup(rows)
    const progression = progressions.get(groupId)
    const mapping = mappings.get(groupId)
    for (const gradeBand of TARGET_GRADE_BANDS) {
      const existing = rows.find(record => record.grade_band === gradeBand)
      const baseRecord = existing || createMissingRecord(chooseSourceSibling(rows, gradeBand), gradeBand, groupId, usedCodes)
      const rewritten = rewriteRecord(baseRecord, group, progression, mapping, gradeBand, { added: !existing })
      if (!subjectH4G.has(rewritten.subject_slug)) subjectH4G.set(rewritten.subject_slug, [])
      subjectH4G.get(rewritten.subject_slug).push(rewritten)
      rewriteCandidates.push({
        candidate_added_record: Boolean(rewritten.candidate_added_record),
        code: rewritten.code,
        grade_adaptation_confidence: rewritten.grade_adaptation_confidence,
        grade_adaptation_method: rewritten.grade_adaptation_method,
        grade_band: rewritten.grade_band,
        progression_group_id: rewritten.progression_group_id,
        review_status: rewritten.review_status,
        source_standard_scope: rewritten.source_standard_scope,
        standard_rewrite_candidate_id: rewritten.standard_rewrite_candidate_id,
        standard_variant_type: rewritten.standard_variant_type,
        subject_slug: rewritten.subject_slug,
        supplemental_evidence_ids: rewritten.supplemental_evidence_ids,
        writes_public_data: false
      })
    }
  }

  const candidateSubjectPayloads = new Map()
  for (const [subjectSlug, payload] of sourcePayloads) {
    const standards = [
      ...(payload.standards || []).filter(nonH4G),
      ...stableStandards(subjectH4G.get(subjectSlug) || [])
    ]
    const nextPayload = {
      ...payload,
      columns: columnsForStandards(standards, payload.columns || []),
      data_scope: 'h4g_standard_rewrite_staging_candidate',
      generated_at: new Date().toISOString(),
      h4g_standard_rewrite_contract_version: CONTRACT_VERSION,
      record_count: standards.length,
      standards,
      writes_public_data: false
    }
    candidateSubjectPayloads.set(subjectSlug, nextPayload)
    writeJson(join(args.dataCandidateRoot, 'by_subject', `${subjectSlug}.json`), nextPayload)
    writeJson(join(args.bySubjectDir, `${subjectSlug}.json`), {
      contract_version: CONTRACT_VERSION,
      generated_at: nextPayload.generated_at,
      purpose: 'h4g_standard_rewrite_candidates_by_subject',
      rewrite_candidates: stableStandards(subjectH4G.get(subjectSlug) || []),
      subject: payload.subject,
      subject_slug: subjectSlug,
      writes_public_data: false
    })
  }

  const audit = buildAudit(rewriteCandidates, candidateSubjectPayloads, evidenceIds)
  const generatedAt = new Date().toISOString()
  writeJson(args.out, {
    contract_version: CONTRACT_VERSION,
    data_candidate_root: args.dataCandidateRoot,
    generated_at: generatedAt,
    purpose: 'h4g_standard_rewrite_candidates',
    rewrite_candidates: rewriteCandidates,
    source_data_root: args.dataRoot,
    source_evidence_path: args.evidence,
    source_group_map_path: args.groupMap,
    source_progression_candidates_path: args.progressions,
    writes_public_data: false
  })
  writeJson(args.auditOut, audit)
  if (args.summaryOut) writeText(args.summaryOut, buildMarkdown(audit))
  if (args.freeze) {
    writeJson(args.freezeOut, {
      audit_hash: hashJson(audit),
      contract_version: CONTRACT_VERSION,
      data_candidate_root: args.dataCandidateRoot,
      freeze_scope: 'h4g_standard_rewrite_staging_candidate_only',
      freeze_status: audit.valid ? 'frozen_candidate' : 'invalid_not_frozen',
      frozen_at: generatedAt,
      rewrite_candidates_hash: hashJson(rewriteCandidates),
      writes_public_data: false
    })
  }
  return audit
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const audit = build(args)
console.log(JSON.stringify(stable({
  candidate_records: audit.summary.candidate_records,
  h4g_records_in_staging_root: audit.summary.h4g_records_in_staging_root,
  progression_groups: audit.summary.progression_groups,
  target_h4g_records: audit.summary.target_h4g_records,
  valid: audit.valid,
  warnings: audit.warnings.length
}), null, 2))

if (args.strict && !audit.valid) {
  console.error(audit.errors.join('\n'))
  process.exit(1)
}
