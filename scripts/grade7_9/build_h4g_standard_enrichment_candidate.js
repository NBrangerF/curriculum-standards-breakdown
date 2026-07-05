#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
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
  subjectFiles,
  writeJson,
  writeText
} from './h4g_supplemental_pipeline_utils.js'

const DEFAULT_INPUT_ROOT = 'generated/h4g_standard_rewrite/data_candidate'
const DEFAULT_EVIDENCE = 'generated/h4g_supplemental_evidence/evidence_items.json'
const DEFAULT_OUT = 'generated/h4g_standard_enrichment/standard_enrichment_candidates.json'
const DEFAULT_BY_SUBJECT_DIR = 'generated/h4g_standard_enrichment/by_subject'
const DEFAULT_DATA_CANDIDATE_ROOT = 'generated/h4g_standard_enrichment/data_candidate'
const DEFAULT_AUDIT_OUT = 'generated/h4g_standard_enrichment/standard_enrichment_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/h4g_standard_enrichment/standard_enrichment_review.md'
const DEFAULT_FREEZE_OUT = 'generated/h4g_standard_enrichment/standard_enrichment.freeze.json'

const ENRICHMENT_VERSION = 'H4G_STANDARD_ENRICHMENT_v1'
const REWRITE_CONTRACT_VERSION = 'H4G_STANDARD_REWRITE_CONTRACT_v1'

const GRADE_INFO = {
  H4G7: {
    grade_label: '七年级',
    focus: '识别、理解、描述、单步骤应用、熟悉情境',
    quality_terms: ['熟悉', '基本', '识别', '描述', '简单', '支架']
  },
  H4G8: {
    grade_label: '八年级',
    focus: '比较、整合、解释、推断、多步骤应用、关系化理解',
    quality_terms: ['比较', '整合', '解释', '多步', '关系', '结构', '较复杂', '协作', '设计', '调整', '分析', '完整']
  },
  H4G9: {
    grade_label: '九年级',
    focus: '迁移、评价、论证、综合探究、真实情境问题解决',
    quality_terms: ['综合', '迁移', '评价', '论证', '优化', '真实']
  }
}

const SUBJECT_TEMPLATES = {
  chinese: {
    H4G7: (topic, focus) => `在单篇文本、整本书片段或熟悉语文活动中，围绕“${topic}”梳理${focus}，能提取关键信息、说清基本理解，并完成简短阅读记录或表达。`,
    H4G8: (topic, focus) => `在多文本、专题阅读或结构化表达任务中，围绕“${topic}”整合${focus}，能比较材料、解释依据，并形成有层次的交流或写作成果。`,
    H4G9: (topic, focus) => `在综合阅读、真实议题或开放表达任务中，围绕“${topic}”评价${focus}，能迁移阅读与表达方法，形成有观点、有证据的阐释或作品。`
  },
  math: {
    H4G7: (topic, focus) => `在熟悉数学或生活情境中，围绕“${topic}”理解${focus}，能完成表示、计算、作图或简单应用，并说明基本过程。`,
    H4G8: (topic, focus) => `在含有多个条件或关系的数学情境中，围绕“${topic}”联结${focus}，能选择方法进行多步推理、计算或建模，并解释关键关系。`,
    H4G9: (topic, focus) => `在综合或真实问题情境中，围绕“${topic}”迁移运用${focus}，能建构模型、论证方法、评价结果并反思改进。`
  },
  english: {
    H4G7: (topic, focus) => `在熟悉主题、简短语篇或基础交际任务中，围绕“${topic}”理解${focus}，能获取主要信息并进行句段表达。`,
    H4G8: (topic, focus) => `在较长语篇、多信息任务或互动交流中，围绕“${topic}”整合${focus}，能推断意图、比较观点并组织连贯表达。`,
    H4G9: (topic, focus) => `在多语篇、真实交际或跨文化情境中，围绕“${topic}”评价${focus}，能调适策略、论证理解并完成综合表达。`
  },
  science: {
    H4G7: (topic, focus) => `在可观察现象和基础实验任务中，围绕“${topic}”识别${focus}，能记录证据、作出基本解释并完成单变量探究。`,
    H4G8: (topic, focus) => `在多因素现象和连续探究任务中，围绕“${topic}”分析${focus}，能解释关系、建立初步模型并形成证据说明。`,
    H4G9: (topic, focus) => `在综合科学或真实问题情境中，围绕“${topic}”迁移${focus}，能设计方案、评价证据和模型，并提出优化解释。`
  },
  morality_law: {
    H4G7: (topic, focus) => `在个人成长、校园生活或熟悉社会情境中，围绕“${topic}”识别${focus}，能说清基本规则、价值或事实，并作出简单判断。`,
    H4G8: (topic, focus) => `在家庭、校园和社会案例中，围绕“${topic}”分析${focus}，能解释关系、权利义务或价值冲突，并提出有条理的建议。`,
    H4G9: (topic, focus) => `在公共议题、法治案例或国家社会情境中，围绕“${topic}”综合运用${focus}，能论证判断、形成行动方案并反思责任。`
  },
  it: {
    H4G7: (topic, focus) => `在熟悉数字工具、数据或简单问题中，围绕“${topic}”识别${focus}，能完成基础操作、表达或单步骤设计。`,
    H4G8: (topic, focus) => `在较完整的信息活动或项目中，围绕“${topic}”整合${focus}，能分解问题、组织数据、设计流程并调试改进。`,
    H4G9: (topic, focus) => `在真实数字化问题或智能系统情境中，围绕“${topic}”综合运用${focus}，能评价优化方案，并说明安全、伦理或社会责任。`
  },
  arts: {
    H4G7: (topic, focus) => `在熟悉作品、材料、动作或技法中，围绕“${topic}”感知${focus}，能描述艺术要素并完成有支架的表现、欣赏或创意实践。`,
    H4G8: (topic, focus) => `在多样作品、主题或表现任务中，围绕“${topic}”比较${focus}，能整合艺术语言和材料技法，完成较完整的创作、表演或分析。`,
    H4G9: (topic, focus) => `在综合艺术任务和文化情境中，围绕“${topic}”评价${focus}，能阐释意义、迁移技法并优化有观点的创作、展示或评论。`
  },
  pe: {
    H4G7: (topic, focus) => `在基础练习、规则学习或健康情境中，围绕“${topic}”掌握${focus}，能按规范完成练习、说明安全要求并进行简单应用。`,
    H4G8: (topic, focus) => `在组合技能、合作竞赛或健康管理任务中，围绕“${topic}”整合${focus}，能调整方法、分析表现并完成较复杂练习或计划。`,
    H4G9: (topic, focus) => `在专项运动、真实比赛或自主管理情境中，围绕“${topic}”综合运用${focus}，能评价表现、优化方案并体现责任与合作。`
  },
  labor: {
    H4G7: (topic, focus) => `在家庭、学校或熟悉劳动任务中，围绕“${topic}”理解${focus}，能按规范安全操作并完成单项或低复杂度劳动实践。`,
    H4G8: (topic, focus) => `在综合劳动任务或协作项目中，围绕“${topic}”整合${focus}，能设计流程、分工协作、解决过程问题并形成完整成果。`,
    H4G9: (topic, focus) => `在真实需求、服务或创新项目中，围绕“${topic}”统筹${focus}，能优化方案、评价质量并形成可展示、可改进的劳动成果。`
  }
}

function parseArgs(argv) {
  const args = {
    auditOut: DEFAULT_AUDIT_OUT,
    bySubjectDir: DEFAULT_BY_SUBJECT_DIR,
    dataCandidateRoot: DEFAULT_DATA_CANDIDATE_ROOT,
    evidence: DEFAULT_EVIDENCE,
    freeze: false,
    freezeOut: DEFAULT_FREEZE_OUT,
    inputRoot: DEFAULT_INPUT_ROOT,
    out: DEFAULT_OUT,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--audit-out') args.auditOut = argv[++i]
    else if (item === '--by-subject-dir') args.bySubjectDir = argv[++i]
    else if (item === '--data-candidate-root') args.dataCandidateRoot = argv[++i]
    else if (item === '--evidence') args.evidence = argv[++i]
    else if (item === '--freeze') args.freeze = true
    else if (item === '--freeze-out') args.freezeOut = argv[++i]
    else if (item === '--input-root') args.inputRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/build_h4g_standard_enrichment_candidate.js --strict --freeze

Builds a full-batch H4G standard enrichment candidate from the prior standard
rewrite staging root. It improves all H4G G7/G8/G9 display standards, preserves
source_standard_original, writes only under generated/, and does not modify
public/data.`)
}

function readSubjectPayloads(dataRoot) {
  const payloads = new Map()
  for (const file of subjectFiles(dataRoot)) {
    const subjectSlug = basename(file, '.json')
    payloads.set(subjectSlug, readJson(file))
  }
  return payloads
}

function ensureScaffold(sourceRoot, targetRoot) {
  mkdirSync(targetRoot, { recursive: true })
  for (const file of readdirSync(sourceRoot).filter(item => item.endsWith('.json'))) {
    if (file === 'manifest.json') continue
    copyFileSync(join(sourceRoot, file), join(targetRoot, file))
  }
  const indexesDir = join(sourceRoot, 'indexes')
  if (existsSync(indexesDir)) {
    mkdirSync(join(targetRoot, 'indexes'), { recursive: true })
    for (const file of readdirSync(indexesDir).filter(item => item.endsWith('.json'))) {
      copyFileSync(join(indexesDir, file), join(targetRoot, 'indexes', file))
    }
  }
}

function isH4G(record) {
  return TARGET_GRADE_BANDS.includes(record.grade_band)
}

function topic(record) {
  return normalizeText(record.subdomain) || normalizeText(record.domain) || '本主题'
}

function trimText(text, max) {
  const normalized = normalizeText(text)
  if (normalized.length <= max) return normalized
  let value = normalized.slice(0, max).replace(/[、，；：:（(《][^、，；：:（(《]*$/u, '')
  if (value.includes('《') && !value.includes('》')) value = value.slice(0, value.lastIndexOf('《'))
  return value || normalized.slice(0, max)
}

function cleanSegment(segment) {
  let value = normalizeText(segment)
  value = value.replace(/《[^》]+》/gu, '')
  value = value.replace(/（[^）]+）/gu, '')
  value = value.replace(/^在[^，,。；;]{2,30}时/u, '')
  value = value.replace(/^和生活需要/u, '学习和生活需要')
  value = value.replace(/^案例分析/u, '')
  for (let i = 0; i < 3; i += 1) {
    value = value.replace(/^能(够)?/u, '')
    value = value.replace(/^并/u, '')
    value = value.replace(/^和生活需要/u, '学习和生活需要')
    value = value.replace(/^(通过|结合|根据|围绕|主动|合理|独立|灵活|初步|进一步|持续|经历|探索|阅读|学习|理解|了解|知道|掌握|认识|运用所学|运用|感受|体会|说明|描述|分析|比较|评价|设计|完成|承担|提升|案例分析)/u, '')
  }
  value = value.replace(/[。；;,.，、]+$/u, '')
  value = value.replace(/^和生活需要/u, '学习和生活需要')
  return normalizeText(value)
}

function contentFocus(sourceText, record) {
  const source = normalizeText(sourceText)
  const pieces = source
    .split(/[。；;，,]/u)
    .map(cleanSegment)
    .filter(item => item.length >= 4)
    .filter(item => !/^(等|相关|基本|核心|要求)$/u.test(item))

  const chosen = []
  for (const item of pieces) {
    const compact = trimText(item, 24)
    if (!compact || chosen.includes(compact)) continue
    chosen.push(compact)
    if (chosen.join('、').length >= 34 || chosen.length >= 2) break
  }

  if (!chosen.length) return `${topic(record)}的核心内容与方法`
  const focus = chosen.join('、')
  if (focus.includes(topic(record)) || topic(record).includes(focus)) return `${focus}的关键要求`
  return `${focus}等关键要求`
}

function fallbackTemplate(record, gradeBand, focus) {
  const grade = GRADE_INFO[gradeBand]
  if (gradeBand === 'H4G7') return `在熟悉学习任务中，围绕“${topic(record)}”理解${focus}，能识别关键信息、描述基本方法并完成简单应用。`
  if (gradeBand === 'H4G8') return `在较复杂学习任务中，围绕“${topic(record)}”整合${focus}，能比较关系、解释依据并完成多步骤应用。`
  return `在综合或真实学习任务中，围绕“${topic(record)}”迁移${focus}，能评价方案、论证判断并完成反思优化。`
}

function enrichedStandard(record) {
  const source = record.source_standard_original || record.standard || ''
  const focus = contentFocus(source, record)
  const template = SUBJECT_TEMPLATES[record.subject_slug]?.[record.grade_band]
  const text = template ? template(topic(record), focus, record) : fallbackTemplate(record, record.grade_band, focus)
  return text.replace(/\s+/g, '')
}

function enrichmentMethod(record) {
  if (record.standard_variant_type === 'grade_adapted_from_partial_source_range') return 'full_batch_source_range_bridge_enrichment'
  if (record.grade_adaptation_method === 'textbook_sequence_split') return 'full_batch_textbook_sequence_enrichment'
  if (record.grade_adaptation_method === 'performance_rubric_split') return 'full_batch_performance_rubric_enrichment'
  if (record.grade_adaptation_method === 'cognitive_complexity_split') return 'full_batch_cognitive_complexity_enrichment'
  return 'full_batch_task_complexity_enrichment'
}

function gradeFocus(record, sourceText) {
  const grade = GRADE_INFO[record.grade_band]
  const focus = contentFocus(sourceText, record)
  return `候选：${grade.grade_label}以“${topic(record)}”为主轴，重点体现${grade.focus}；本次补强把原始标准中的${focus}改写为可预览、可观察、可评价的年级化表现。`
}

function qualityFlags(record, nextStandard) {
  const flags = []
  const text = normalizeText(nextStandard)
  const source = normalizeText(record.source_standard_original)
  const previous = normalizeText(record.standard)
  const gradeTerms = GRADE_INFO[record.grade_band]?.quality_terms || []
  if (text.length < 45) flags.push('standard_too_short')
  if (text.length > 170) flags.push('standard_too_long')
  if (text === source) flags.push('same_as_source_standard_original')
  if (text === previous) flags.push('same_as_previous_rewrite')
  if (text.includes('能结合“') || text.includes('核心要求')) flags.push('old_template_trace')
  if (text.includes('候选')) flags.push('candidate_word_in_standard')
  if (!gradeTerms.some(term => text.includes(term))) flags.push('missing_grade_progression_marker')
  return flags
}

function enrichRecord(record) {
  const source = record.source_standard_original || record.standard || ''
  const previous = record.standard || ''
  const nextStandard = enrichedStandard(record)
  const flags = qualityFlags({ ...record, source_standard_original: source }, nextStandard)
  const method = enrichmentMethod(record)
  const candidateId = `sen-${shortHash([record.code, record.progression_group_id, record.grade_band, nextStandard].join('|'), 16)}`
  return {
    ...record,
    grade_specific_focus: gradeFocus(record, source),
    previous_standard_rewrite: previous,
    public_write_candidate: false,
    review_status: record.standard_variant_type === 'grade_adapted_from_partial_source_range'
      ? 'standard_enrichment_partial_source_bridge_needs_review'
      : 'standard_enrichment_candidate_needs_review',
    source_standard_original: source,
    standard: nextStandard,
    standard_enrichment_candidate_id: candidateId,
    standard_enrichment_contract_version: ENRICHMENT_VERSION,
    standard_enrichment_method: method,
    standard_enrichment_rationale: `${GRADE_INFO[record.grade_band].grade_label}补强基于 ${record.grade_adaptation_method || 'task_complexity_split'} 和学科 progression grammar，将上一轮较模板化的展示文本压缩为直接可预览的年级化 standard，同时保留 source_standard_original、evidence ids 和原 rewrite rationale。`,
    standard_enrichment_status: flags.length
      ? 'full_batch_enriched_with_quality_flags_needs_review'
      : 'full_batch_enriched_needs_review',
    standard_enrichment_source: 'rule_based_subject_progression_grammar',
    standard_quality_flags: flags,
    standard_text_role: 'grade_adapted_display_standard',
    writes_public_data: false
  }
}

function standardsSort(records) {
  return [...records].sort((a, b) => {
    const gradeCompare = String(a.grade_band || '').localeCompare(String(b.grade_band || ''))
    if (gradeCompare) return gradeCompare
    return String(a.code || '').localeCompare(String(b.code || ''))
  })
}

function columnsForStandards(records, baseColumns = []) {
  const columns = new Set(baseColumns)
  for (const record of records) {
    for (const key of Object.keys(record)) columns.add(key)
  }
  return [...columns].sort((a, b) => a.localeCompare(b))
}

function buildAudit(payloads, candidates) {
  const errors = []
  const warnings = []
  const bySubject = {}
  const byGradeBand = {}
  const byMethod = {}
  const byStatus = {}
  const byFlag = {}
  const groups = new Map()
  const ids = new Set()
  const h4gRecords = []

  for (const payload of payloads.values()) {
    for (const record of payload.standards || []) {
      if (!isH4G(record)) continue
      h4gRecords.push(record)
      countInto(bySubject, record.subject_slug)
      countInto(byGradeBand, record.grade_band)
      countInto(byMethod, record.standard_enrichment_method)
      countInto(byStatus, record.review_status)
      for (const flag of record.standard_quality_flags || []) countInto(byFlag, flag)
      if (!groups.has(record.progression_group_id)) groups.set(record.progression_group_id, [])
      groups.get(record.progression_group_id).push(record)

      for (const field of [
        'standard',
        'source_standard_original',
        'previous_standard_rewrite',
        'standard_enrichment_candidate_id',
        'standard_enrichment_contract_version',
        'standard_enrichment_method',
        'standard_enrichment_rationale',
        'standard_quality_flags',
        'supplemental_evidence_ids'
      ]) {
        if (record[field] === undefined || record[field] === null || record[field] === '') errors.push(`${record.code} missing ${field}`)
      }
      if (ids.has(record.standard_enrichment_candidate_id)) errors.push(`duplicate standard_enrichment_candidate_id: ${record.standard_enrichment_candidate_id}`)
      ids.add(record.standard_enrichment_candidate_id)
      if (record.standard_enrichment_contract_version !== ENRICHMENT_VERSION) errors.push(`${record.code} wrong enrichment contract version`)
      if (record.h4g_rewrite_contract_version !== REWRITE_CONTRACT_VERSION) errors.push(`${record.code} wrong rewrite contract version`)
      if (record.writes_public_data !== false) errors.push(`${record.code} writes_public_data must be false`)
      if (record.public_write_candidate !== false) errors.push(`${record.code} public_write_candidate must be false`)
      if (record.standard_text_role !== 'grade_adapted_display_standard') errors.push(`${record.code} standard_text_role must be grade_adapted_display_standard`)
      if (normalizeText(record.standard) === normalizeText(record.source_standard_original)) errors.push(`${record.code} standard equals source_standard_original`)
      if (normalizeText(record.standard) === normalizeText(record.previous_standard_rewrite)) errors.push(`${record.code} standard was not changed from previous rewrite`)
      if (record.standard_quality_flags?.length) warnings.push(`${record.code} quality flags: ${record.standard_quality_flags.join(', ')}`)
      if (!Array.isArray(record.supplemental_evidence_ids) || !record.supplemental_evidence_ids.length) errors.push(`${record.code} must have supplemental_evidence_ids`)
    }
  }

  for (const [groupId, records] of groups) {
    const byBand = new Map()
    for (const record of records) byBand.set(record.grade_band, (byBand.get(record.grade_band) || 0) + 1)
    for (const band of TARGET_GRADE_BANDS) {
      if (byBand.get(band) !== 1) errors.push(`${groupId} must have exactly one ${band} record`)
    }
    if (records.length !== 3) errors.push(`${groupId} must have exactly three H4G records`)
    const standards = new Set(records.map(record => normalizeText(record.standard)))
    if (standards.size !== records.length) errors.push(`${groupId} rewritten standards must be distinct across grades`)
  }

  return {
    changes_official_standard_text: true,
    contract_version: ENRICHMENT_VERSION,
    errors,
    generated_at: new Date().toISOString(),
    purpose: 'h4g_standard_enrichment_candidate_audit',
    summary: {
      by_grade_band: byGradeBand,
      by_review_status: byStatus,
      by_standard_enrichment_method: byMethod,
      by_standard_quality_flag: byFlag,
      by_subject: bySubject,
      candidate_records: candidates.length,
      h4g_records: h4gRecords.length,
      progression_groups: groups.size,
      quality_flagged_records: h4gRecords.filter(record => record.standard_quality_flags?.length).length
    },
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }
}

function buildMarkdown(audit) {
  return `# H4G Standard Enrichment Candidate Review

Generated at: ${audit.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${audit.valid} |
| progression groups | ${audit.summary.progression_groups} |
| H4G records | ${audit.summary.h4g_records} |
| candidate records | ${audit.summary.candidate_records} |
| quality flagged records | ${audit.summary.quality_flagged_records} |
| errors | ${audit.errors.length} |
| warnings | ${audit.warnings.length} |
| writes public data | ${audit.writes_public_data} |

## Subjects

| Subject | H4G Records |
| --- | ---: |
${countRows(audit.summary.by_subject)}

## Grade Bands

| Grade Band | Count |
| --- | ---: |
${countRows(audit.summary.by_grade_band)}

## Enrichment Methods

| Method | Count |
| --- | ---: |
${countRows(audit.summary.by_standard_enrichment_method)}

## Review Status

| Status | Count |
| --- | ---: |
${countRows(audit.summary.by_review_status)}

## Quality Flags

| Flag | Count |
| --- | ---: |
${countRows(audit.summary.by_standard_quality_flag)}

## Errors

${audit.errors.length ? audit.errors.slice(0, 100).map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}

## Warnings

${audit.warnings.length ? audit.warnings.slice(0, 100).map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}
`
}

function build(args) {
  ensureScaffold(args.inputRoot, args.dataCandidateRoot)
  const sourcePayloads = readSubjectPayloads(args.inputRoot)
  const nextPayloads = new Map()
  const candidates = []

  for (const [subjectSlug, payload] of sourcePayloads) {
    const standards = []
    const enriched = []
    for (const record of payload.standards || []) {
      if (!isH4G(record)) {
        standards.push(record)
        continue
      }
      const nextRecord = enrichRecord(record)
      standards.push(nextRecord)
      enriched.push(nextRecord)
      candidates.push({
        code: nextRecord.code,
        grade_band: nextRecord.grade_band,
        progression_group_id: nextRecord.progression_group_id,
        review_status: nextRecord.review_status,
        standard_enrichment_candidate_id: nextRecord.standard_enrichment_candidate_id,
        standard_enrichment_method: nextRecord.standard_enrichment_method,
        standard_quality_flags: nextRecord.standard_quality_flags,
        subject_slug: nextRecord.subject_slug,
        supplemental_evidence_ids: nextRecord.supplemental_evidence_ids,
        writes_public_data: false
      })
    }
    const nextPayload = {
      ...payload,
      columns: columnsForStandards(standards, payload.columns || []),
      data_scope: 'h4g_standard_enrichment_full_batch_candidate',
      generated_at: new Date().toISOString(),
      h4g_standard_enrichment_contract_version: ENRICHMENT_VERSION,
      record_count: standards.length,
      standards: standardsSort(standards),
      writes_public_data: false
    }
    nextPayloads.set(subjectSlug, nextPayload)
    writeJson(join(args.dataCandidateRoot, 'by_subject', `${subjectSlug}.json`), nextPayload)
    writeJson(join(args.bySubjectDir, `${subjectSlug}.json`), {
      contract_version: ENRICHMENT_VERSION,
      generated_at: nextPayload.generated_at,
      purpose: 'h4g_standard_enrichment_candidates_by_subject',
      standard_enrichment_candidates: standardsSort(enriched),
      subject: payload.subject,
      subject_slug: subjectSlug,
      writes_public_data: false
    })
  }

  const audit = buildAudit(nextPayloads, candidates)
  const generatedAt = new Date().toISOString()
  writeJson(args.out, {
    contract_version: ENRICHMENT_VERSION,
    data_candidate_root: args.dataCandidateRoot,
    generated_at: generatedAt,
    input_root: args.inputRoot,
    purpose: 'h4g_standard_enrichment_candidates',
    standard_enrichment_candidates: candidates,
    writes_public_data: false
  })
  writeJson(args.auditOut, audit)
  if (args.summaryOut) writeText(args.summaryOut, buildMarkdown(audit))
  if (args.freeze) {
    writeJson(args.freezeOut, {
      audit_hash: hashJson(audit),
      contract_version: ENRICHMENT_VERSION,
      data_candidate_root: args.dataCandidateRoot,
      freeze_scope: 'h4g_standard_enrichment_full_batch_candidate',
      freeze_status: audit.valid ? 'frozen_candidate' : 'invalid_not_frozen',
      frozen_at: generatedAt,
      standard_enrichment_candidates_hash: hashJson(candidates),
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
  h4g_records: audit.summary.h4g_records,
  progression_groups: audit.summary.progression_groups,
  quality_flagged_records: audit.summary.quality_flagged_records,
  valid: audit.valid,
  warnings: audit.warnings.length
}), null, 2))

if (args.strict && !audit.valid) {
  console.error(audit.errors.join('\n'))
  process.exit(1)
}
