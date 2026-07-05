#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  TARGET_GRADE_BANDS,
  countInto,
  countRows,
  markdownCell,
  normalizeText,
  readJson,
  recordsByGroup,
  stable,
  subjectFiles,
  writeJson,
  writeText
} from './h4g_supplemental_pipeline_utils.js'

const ENRICHMENT_VERSION = 'H4G_STANDARD_ENRICHMENT_v1'
const REWRITE_CONTRACT_VERSION = 'H4G_STANDARD_REWRITE_CONTRACT_v1'
const DEFAULT_DATA_CANDIDATE_ROOT = 'generated/h4g_standard_enrichment/data_candidate'
const DEFAULT_CANDIDATES = 'generated/h4g_standard_enrichment/standard_enrichment_candidates.json'
const DEFAULT_EVIDENCE = 'generated/h4g_supplemental_evidence/evidence_items.json'
const DEFAULT_OUT = 'generated/h4g_standard_enrichment/standard_enrichment_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/h4g_standard_enrichment/standard_enrichment_audit.md'

const REQUIRED_FIELDS = [
  'standard',
  'source_standard_original',
  'previous_standard_rewrite',
  'standard_text_role',
  'standard_enrichment_candidate_id',
  'standard_enrichment_contract_version',
  'standard_enrichment_method',
  'standard_enrichment_rationale',
  'standard_enrichment_source',
  'standard_enrichment_status',
  'standard_quality_flags',
  'supplemental_evidence_ids',
  'review_status'
]

const GRADE_MARKERS = {
  H4G7: ['熟悉', '基本', '识别', '描述', '简单', '支架'],
  H4G8: ['比较', '整合', '解释', '多步', '关系', '结构', '较复杂', '协作', '设计', '调整', '分析', '完整'],
  H4G9: ['综合', '迁移', '评价', '论证', '优化', '真实']
}

function parseArgs(argv) {
  const args = {
    candidates: DEFAULT_CANDIDATES,
    dataCandidateRoot: DEFAULT_DATA_CANDIDATE_ROOT,
    evidence: DEFAULT_EVIDENCE,
    out: DEFAULT_OUT,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidates') args.candidates = argv[++i]
    else if (item === '--data-candidate-root') args.dataCandidateRoot = argv[++i]
    else if (item === '--evidence') args.evidence = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/audit_h4g_standard_enrichment_candidate.js --strict

Independently audits the full-batch H4G standard enrichment candidate. The audit
is read-only and expects all candidate data to remain under generated/.`)
}

function loadRecords(dataRoot, errors) {
  const records = []
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) {
    errors.push(`Missing by_subject directory: ${dir}`)
    return records
  }
  for (const file of subjectFiles(dataRoot)) {
    const payload = readJson(file)
    for (const record of payload.standards || []) records.push(record)
  }
  return records
}

function evidenceIdSet(path, errors) {
  if (!existsSync(path)) {
    errors.push(`Missing evidence payload: ${path}`)
    return new Set()
  }
  const payload = readJson(path)
  return new Set((payload.evidence_items || []).map(item => item.evidence_id))
}

function buildMarkdown(audit) {
  return `# H4G Standard Enrichment Independent Audit

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

${audit.errors.length ? audit.errors.slice(0, 200).map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}

## Warnings

${audit.warnings.length ? audit.warnings.slice(0, 200).map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}
`
}

function checkRecord(record, errors, warnings, evidenceIds, seenIds) {
  const code = record.code || '(missing code)'
  for (const field of REQUIRED_FIELDS) {
    const value = record[field]
    if (value === undefined || value === null || value === '') errors.push(`${code} missing ${field}`)
  }
  if (record.h4g_rewrite_contract_version !== REWRITE_CONTRACT_VERSION) errors.push(`${code} wrong rewrite contract version`)
  if (record.standard_enrichment_contract_version !== ENRICHMENT_VERSION) errors.push(`${code} wrong enrichment contract version`)
  if (record.standard_text_role !== 'grade_adapted_display_standard') errors.push(`${code} standard_text_role must be grade_adapted_display_standard`)
  if (record.writes_public_data !== false) errors.push(`${code} writes_public_data must be false`)
  if (record.public_write_candidate !== false) errors.push(`${code} public_write_candidate must be false`)
  if (seenIds.has(record.standard_enrichment_candidate_id)) errors.push(`duplicate standard_enrichment_candidate_id: ${record.standard_enrichment_candidate_id}`)
  seenIds.add(record.standard_enrichment_candidate_id)

  const standard = normalizeText(record.standard)
  if (standard === normalizeText(record.source_standard_original)) errors.push(`${code} standard equals source_standard_original`)
  if (standard === normalizeText(record.previous_standard_rewrite)) errors.push(`${code} standard equals previous_standard_rewrite`)
  if (standard.includes('能结合“') || standard.includes('核心要求')) errors.push(`${code} still contains old rewrite template trace`)
  if (standard.includes('候选')) errors.push(`${code} standard must not contain 候选`)
  if (standard.length < 45) errors.push(`${code} standard too short: ${standard.length}`)
  if (standard.length > 170) errors.push(`${code} standard too long: ${standard.length}`)
  const markers = GRADE_MARKERS[record.grade_band] || []
  if (!markers.some(marker => standard.includes(marker))) errors.push(`${code} missing grade progression marker`)

  if (!Array.isArray(record.supplemental_evidence_ids) || !record.supplemental_evidence_ids.length) {
    errors.push(`${code} supplemental_evidence_ids must be non-empty`)
  } else {
    for (const id of record.supplemental_evidence_ids) {
      if (!evidenceIds.has(id)) errors.push(`${code} references missing supplemental evidence id ${id}`)
    }
  }

  if (!Array.isArray(record.standard_quality_flags)) errors.push(`${code} standard_quality_flags must be an array`)
  else if (record.standard_quality_flags.length) warnings.push(`${code} quality flags: ${record.standard_quality_flags.join(', ')}`)
}

function audit(args) {
  const errors = []
  const warnings = []
  const evidenceIds = evidenceIdSet(args.evidence, errors)
  const allRecords = loadRecords(args.dataCandidateRoot, errors)
  const h4gRecords = allRecords.filter(record => TARGET_GRADE_BANDS.includes(record.grade_band))
  const groups = recordsByGroup(h4gRecords)
  const candidatesPayload = existsSync(args.candidates) ? readJson(args.candidates) : {}
  const candidates = Array.isArray(candidatesPayload.standard_enrichment_candidates) ? candidatesPayload.standard_enrichment_candidates : []

  if (!existsSync(args.candidates)) errors.push(`Missing candidates payload: ${args.candidates}`)
  if (candidatesPayload.contract_version !== ENRICHMENT_VERSION) errors.push(`candidate payload contract_version must be ${ENRICHMENT_VERSION}`)
  if (candidatesPayload.writes_public_data !== false) errors.push('candidate payload writes_public_data must be false')
  if (!Array.isArray(candidatesPayload.standard_enrichment_candidates)) errors.push('candidate payload must contain standard_enrichment_candidates[]')

  const bySubject = {}
  const byGradeBand = {}
  const byMethod = {}
  const byStatus = {}
  const byFlag = {}
  const seenIds = new Set()

  for (const record of h4gRecords) {
    countInto(bySubject, record.subject_slug)
    countInto(byGradeBand, record.grade_band)
    countInto(byMethod, record.standard_enrichment_method)
    countInto(byStatus, record.review_status)
    for (const flag of record.standard_quality_flags || []) countInto(byFlag, flag)
    checkRecord(record, errors, warnings, evidenceIds, seenIds)
  }

  const payloadIds = new Set()
  for (const candidate of candidates) {
    if (payloadIds.has(candidate.standard_enrichment_candidate_id)) errors.push(`duplicate candidate payload id: ${candidate.standard_enrichment_candidate_id}`)
    payloadIds.add(candidate.standard_enrichment_candidate_id)
    if (!seenIds.has(candidate.standard_enrichment_candidate_id)) errors.push(`${candidate.standard_enrichment_candidate_id} missing from data candidate root`)
    if (candidate.writes_public_data !== false) errors.push(`${candidate.standard_enrichment_candidate_id} writes_public_data must be false`)
  }

  if (h4gRecords.length !== 1170) errors.push(`expected 1170 H4G records, found ${h4gRecords.length}`)
  if (groups.size !== 390) errors.push(`expected 390 progression groups, found ${groups.size}`)
  if (candidates.length !== h4gRecords.length) errors.push(`candidate count ${candidates.length} must equal H4G records ${h4gRecords.length}`)

  for (const [groupId, rows] of groups) {
    const gradeCounts = {}
    for (const row of rows) countInto(gradeCounts, row.grade_band)
    for (const band of TARGET_GRADE_BANDS) {
      if (gradeCounts[band] !== 1) errors.push(`${groupId} must have exactly one ${band} record`)
    }
    const standards = new Set(rows.map(row => normalizeText(row.standard)))
    if (standards.size !== rows.length) errors.push(`${groupId} standards must differ across grade siblings`)
  }

  return {
    changes_official_standard_text: true,
    contract_version: ENRICHMENT_VERSION,
    data_candidate_root: args.dataCandidateRoot,
    errors,
    generated_at: new Date().toISOString(),
    purpose: 'h4g_standard_enrichment_independent_audit',
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

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const result = audit(args)
writeJson(args.out, result)
if (args.summaryOut) writeText(args.summaryOut, buildMarkdown(result))

console.log(JSON.stringify(stable({
  candidate_records: result.summary.candidate_records,
  h4g_records: result.summary.h4g_records,
  progression_groups: result.summary.progression_groups,
  quality_flagged_records: result.summary.quality_flagged_records,
  valid: result.valid,
  warnings: result.warnings.length
}), null, 2))

if (args.strict && !result.valid) {
  console.error(result.errors.join('\n'))
  process.exit(1)
}
