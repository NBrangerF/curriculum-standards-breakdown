import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { SUBJECTS } from './config.js'

export const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']
export const TARGET_GRADE_SET = new Set(TARGET_GRADE_BANDS)
export const GATE_VERSION = 'h4g_g7_g8_g9_supplemental_pipeline_v0.1'
export const CORE_TEXT_FIELDS = ['domain', 'subdomain', 'standard', 'context', 'practice', 'teaching_tip', 'assessment_evidence_type']
export const SOURCE_TEXT_FIELDS = ['domain', 'subdomain', 'standard']

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

export function writeJson(path, value) {
  writeText(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

export function shortHash(value, length = 14) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, length)
}

export function hashJson(value) {
  return shortHash(JSON.stringify(stable(value)), 20)
}

export function sorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== '').map(String))]
    .sort((a, b) => a.localeCompare(b))
}

export function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export function signature(record, fields) {
  return fields.map(field => normalizeText(record[field])).join('\n---\n')
}

export function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

export function pct(numerator, denominator) {
  if (!denominator) return 0
  return Number((numerator / denominator).toFixed(4))
}

export function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

export function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

export function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

export function loadH4GRecords(dataRoot, errors = []) {
  const bySubjectDir = join(dataRoot, 'by_subject')
  if (!existsSync(bySubjectDir)) {
    errors.push(`Missing public data by_subject directory: ${bySubjectDir}`)
    return []
  }

  const records = []
  for (const file of subjectFiles(dataRoot)) {
    const subjectSlug = basename(file, '.json')
    const payload = readJson(file)
    for (const record of payload.standards || []) {
      if (!TARGET_GRADE_SET.has(record.grade_band)) continue
      records.push({
        ...record,
        subject_slug: record.subject_slug || subjectSlug,
        subject: record.subject || payload.subject || SUBJECTS[subjectSlug]?.subject || subjectSlug
      })
    }
  }
  records.sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')))
  return records
}

export function groupKey(record) {
  return record.progression_group_id || [
    record.subject_slug,
    normalizeText(record.domain),
    normalizeText(record.subdomain),
    normalizeText(record.standard)
  ].join('|')
}

export function recordsByGroup(records) {
  const groups = new Map()
  for (const record of records) {
    const key = groupKey(record)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(record)
  }
  return groups
}

export function hasUnitLevelEvidence(record) {
  const evidence = [
    ...(Array.isArray(record.textbook_unit_evidence) ? record.textbook_unit_evidence : []),
    ...(Array.isArray(record.textbook_evidence) ? record.textbook_evidence : [])
  ]
  const hasUnitEvidenceIds = Array.isArray(record.textbook_unit_evidence_ids) && record.textbook_unit_evidence_ids.length > 0
  return evidence.some(item => (
    item.unit_evidence_id ||
    item.unit_title ||
    item.chapter_title ||
    item.section_title ||
    item.page_range ||
    item.page_start ||
    item.matched_keywords?.length
  )) || (record.evidence_granularity === 'textbook_unit_level' && hasUnitEvidenceIds)
}

export function evidenceGranularity(record) {
  if (hasUnitLevelEvidence(record)) return 'textbook_unit_level'
  if (!Array.isArray(record.textbook_evidence_ids) || record.textbook_evidence_ids.length === 0) return 'none'
  return 'textbook_file_grade_level'
}

export function summarizeGroup(records) {
  const byBand = Object.fromEntries(TARGET_GRADE_BANDS.map(band => [band, records.filter(record => record.grade_band === band)]))
  const presentGradeBands = TARGET_GRADE_BANDS.filter(band => byBand[band].length)
  const missingGradeBands = TARGET_GRADE_BANDS.filter(band => !byBand[band].length)
  const duplicateGradeBands = TARGET_GRADE_BANDS.filter(band => byBand[band].length > 1)
  const coreSignatures = new Set(records.map(record => signature(record, CORE_TEXT_FIELDS)))
  const sourceSignatures = new Set(records.map(record => signature(record, SOURCE_TEXT_FIELDS)))
  const completeTriplet = missingGradeBands.length === 0 && duplicateGradeBands.length === 0
  const first = records[0] || {}

  return {
    codes: sorted(records.map(record => record.code)),
    complete_triplet: completeTriplet,
    duplicate_grade_bands: duplicateGradeBands,
    exact_core_identical: completeTriplet && coreSignatures.size === 1,
    first_record: first,
    grade_bands: presentGradeBands,
    missing_grade_bands: missingGradeBands,
    progression_group_id: groupKey(first),
    record_count: records.length,
    records,
    source_identical: completeTriplet && sourceSignatures.size === 1,
    subject: first.subject || SUBJECTS[first.subject_slug]?.subject || first.subject_slug,
    subject_slug: first.subject_slug,
    unit_level_evidence_records: records.filter(hasUnitLevelEvidence).length
  }
}

export function loadRegistry(path, errors = []) {
  const payload = readJson(path)
  const registry = Array.isArray(payload.registry) ? payload.registry : []
  if (!Array.isArray(payload.registry)) errors.push(`${path} must contain registry[]`)
  return { payload, registry }
}

export function sourcesForSubject(registry, subjectSlug) {
  return registry
    .filter(source => Array.isArray(source.subject_coverage) && source.subject_coverage.includes(subjectSlug))
    .sort((a, b) => {
      const tierCompare = String(a.source_tier || '').localeCompare(String(b.source_tier || ''))
      if (tierCompare) return tierCompare
      return String(a.source_id || '').localeCompare(String(b.source_id || ''))
    })
}

export function normalizeGradeSignal(value) {
  const signal = String(value || '').trim()
  if (['G7_baseline', 'G8_anchor', 'G9_cap', 'H4G7-H4G9_shared', 'framework_only', 'unknown'].includes(signal)) {
    return signal
  }
  if (signal.includes('G8')) return 'G8_anchor'
  if (signal.includes('G9')) return 'G9_cap'
  if (signal.includes('framework')) return 'framework_only'
  if (signal.includes('H4')) return 'H4G7-H4G9_shared'
  return 'unknown'
}

export function supportedGradeBandsForSignal(signal) {
  if (signal === 'G8_anchor') return ['H4G8']
  if (signal === 'G9_cap') return ['H4G9']
  if (signal === 'G7_baseline') return ['H4G7']
  if (signal === 'H4G7-H4G9_shared') return TARGET_GRADE_BANDS
  return []
}

export function signalFamilyForAllowedUse(allowedUse) {
  const use = String(allowedUse || '')
  if (use.includes('g8_benchmark') || use.includes('quality_monitoring')) return 'g8_anchor'
  if (use.includes('g9_assessment') || use.includes('exam_') || use.includes('assessment_channel')) return 'g9_assessment_cap'
  if (use.includes('rubric') || use.includes('evaluation')) return 'assessment_rubric'
  if (use.includes('teaching') || use.includes('textbook') || use.includes('digital_resource')) return 'teaching_implementation'
  if (use.includes('academic_quality')) return 'academic_quality'
  if (use.includes('task_complexity') || use.includes('cognitive')) return 'cognitive_demand_scale'
  if (use.includes('legal_basis') || use.includes('standards')) return 'curriculum_standard_anchor'
  return 'source_metadata_signal'
}

export function evidenceConfidence(source, gradeSignal) {
  const tierBase = {
    P0: 0.74,
    P1: 0.64,
    P2: 0.54,
    P3: 0.46
  }[source.source_tier] || 0.45
  const signalBonus = {
    G8_anchor: 0.04,
    G9_cap: 0.03,
    'H4G7-H4G9_shared': 0.02,
    framework_only: 0.01,
    unknown: 0
  }[gradeSignal] || 0
  const subjectSpecificBonus = source.subject_coverage?.length === 1 ? 0.02 : 0
  const authorityBonus = Math.max(0, Math.min(0.06, (Number(source.authority_score) || 0) - 0.82))
  return Number(Math.max(0.4, Math.min(0.88, tierBase + signalBonus + subjectSpecificBonus + authorityBonus)).toFixed(2))
}

export function bloomDokHintForSignal(signalFamily) {
  if (signalFamily === 'curriculum_standard_anchor') return { bloom_hint: ['understand', 'apply'], dok_hint: [1, 2] }
  if (signalFamily === 'academic_quality') return { bloom_hint: ['apply', 'analyze'], dok_hint: [2, 3] }
  if (signalFamily === 'assessment_rubric') return { bloom_hint: ['analyze', 'evaluate'], dok_hint: [2, 3] }
  if (signalFamily === 'g8_anchor') return { bloom_hint: ['apply', 'analyze'], dok_hint: [2, 3] }
  if (signalFamily === 'g9_assessment_cap') return { bloom_hint: ['analyze', 'evaluate'], dok_hint: [3, 4] }
  if (signalFamily === 'teaching_implementation') return { bloom_hint: ['understand', 'apply', 'analyze'], dok_hint: [1, 2, 3] }
  if (signalFamily === 'cognitive_demand_scale') return { bloom_hint: ['apply', 'analyze', 'evaluate'], dok_hint: [2, 3, 4] }
  return { bloom_hint: ['understand'], dok_hint: [1] }
}

export function subjectAxis(subjectSlug, domain, subdomain) {
  const domainText = `${domain || ''} ${subdomain || ''}`
  if (subjectSlug === 'math') return domainText.includes('综合') ? 'modeling_and_problem_solving' : 'concept_reasoning_application'
  if (subjectSlug === 'chinese') return domainText.includes('表达') ? 'expression_argumentation' : 'reading_inquiry_appreciation'
  if (subjectSlug === 'english') return domainText.includes('技能') ? 'language_skill_use' : 'discourse_culture_thinking'
  if (subjectSlug === 'science') return domainText.includes('探究') ? 'inquiry_practice_evidence_reasoning' : 'concept_model_application'
  if (subjectSlug === 'morality_law') return 'value_judgment_case_reasoning_action'
  if (subjectSlug === 'it') return 'computational_thinking_digital_creation_responsibility'
  if (subjectSlug === 'arts') return 'aesthetic_perception_expression_creative_practice'
  if (subjectSlug === 'pe') return 'movement_skill_health_behavior_sports_ethics'
  if (subjectSlug === 'labor') return 'practical_task_planning_execution_reflection'
  return 'general_skill_progression'
}

export function skillNodeIdForRecord(record) {
  const base = [
    record.subject_slug,
    normalizeText(record.domain),
    normalizeText(record.subdomain)
  ].join('|')
  return `jr-skill-${record.subject_slug}-${shortHash(base, 10)}`
}

export function skillNodeLabel(record) {
  return [
    record.subject || SUBJECTS[record.subject_slug]?.subject || record.subject_slug,
    normalizeText(record.domain) || '未分领域',
    normalizeText(record.subdomain) || '未分主题'
  ].join(' / ')
}
