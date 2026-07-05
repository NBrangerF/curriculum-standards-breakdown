#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { gradeLabel } from './config.js'
import {
  TARGET_GRADE_BANDS,
  countInto,
  countRows,
  loadH4GRecords,
  markdownCell,
  normalizeText,
  readJson,
  recordsByGroup,
  stable,
  subjectFiles,
  writeJson,
  writeText
} from './h4g_supplemental_pipeline_utils.js'

const CONTRACT_VERSION = 'H4G_STANDARD_REWRITE_CONTRACT_v1'
const DEFAULT_SOURCE_DATA_ROOT = 'public/data'
const DEFAULT_DATA_CANDIDATE_ROOT = 'generated/h4g_standard_rewrite/data_candidate'
const DEFAULT_CANDIDATES = 'generated/h4g_standard_rewrite/standard_rewrite_candidates.json'
const DEFAULT_EVIDENCE = 'generated/h4g_supplemental_evidence/evidence_items.json'
const DEFAULT_OUT = 'generated/h4g_standard_rewrite/standard_rewrite_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/h4g_standard_rewrite/standard_rewrite_audit.md'

const TARGET_GRADE_META = {
  H4G7: { grade_level: 7, grade_range: '7', grade: gradeLabel(7) },
  H4G8: { grade_level: 8, grade_range: '8', grade: gradeLabel(8) },
  H4G9: { grade_level: 9, grade_range: '9', grade: gradeLabel(9) }
}

const REQUIRED_RECORD_FIELDS = [
  'standard',
  'source_standard_original',
  'source_standard_scope',
  'standard_text_role',
  'standard_variant_type',
  'grade_adaptation_method',
  'grade_adaptation_rationale',
  'grade_adaptation_confidence',
  'grade_adaptation_support_methods',
  'grade_specific_focus',
  'h4g_rewrite_contract_version',
  'standard_rewrite_candidate_id',
  'standard_rewrite_group_status',
  'standard_rewrite_record_origin',
  'supplemental_evidence_ids',
  'review_status',
  'writes_public_data',
  'public_write_candidate'
]

function parseArgs(argv) {
  const args = {
    candidates: DEFAULT_CANDIDATES,
    dataCandidateRoot: DEFAULT_DATA_CANDIDATE_ROOT,
    evidence: DEFAULT_EVIDENCE,
    out: DEFAULT_OUT,
    sourceDataRoot: DEFAULT_SOURCE_DATA_ROOT,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidates') args.candidates = argv[++i]
    else if (item === '--data-candidate-root') args.dataCandidateRoot = argv[++i]
    else if (item === '--evidence') args.evidence = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--source-data-root') args.sourceDataRoot = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/audit_h4g_standard_rewrite_candidates.js --strict

Audits the generated H4G standard rewrite staging candidate against
docs/H4G_STANDARD_REWRITE_CONTRACT.md. The audit is read-only and expects the
candidate to stay under generated/.`)
}

function allRecords(dataRoot, errors) {
  const records = []
  for (const file of subjectFiles(dataRoot)) {
    const subjectSlug = basename(file, '.json')
    const payload = readJson(file)
    for (const record of payload.standards || []) {
      records.push({
        ...record,
        subject: record.subject || payload.subject || subjectSlug,
        subject_slug: record.subject_slug || subjectSlug
      })
    }
  }
  if (!records.length) errors.push(`No standards found under ${join(dataRoot, 'by_subject')}`)
  return records
}

function evidenceIdSet(evidencePayload) {
  return new Set((evidencePayload.evidence_items || []).map(item => item.evidence_id))
}

function buildMarkdown(audit) {
  return `# H4G Standard Rewrite Independent Audit

Generated at: ${audit.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${audit.valid} |
| source H4G records | ${audit.summary.source_h4g_records} |
| expected progression groups | ${audit.summary.expected_progression_groups} |
| expected staging H4G records | ${audit.summary.expected_staging_h4g_records} |
| staging H4G records | ${audit.summary.staging_h4g_records} |
| candidate records | ${audit.summary.candidate_records} |
| expected generated missing records | ${audit.summary.expected_generated_missing_records} |
| generated missing records | ${audit.summary.generated_missing_records} |
| errors | ${audit.errors.length} |
| warnings | ${audit.warnings.length} |
| writes_public_data | ${audit.writes_public_data} |

## Subjects

| Subject | H4G Staging Records |
| --- | ---: |
${countRows(audit.summary.by_subject)}

## Grade Bands

| Grade Band | Count |
| --- | ---: |
${countRows(audit.summary.by_grade_band)}

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

## Record Origins

| Origin | Count |
| --- | ---: |
${countRows(audit.summary.by_record_origin)}

## Errors

${audit.errors.length ? audit.errors.slice(0, 200).map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}

## Warnings

${audit.warnings.length ? audit.warnings.slice(0, 200).map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}
`
}

function auditRecord(record, errors, evidenceIds, stagingRecordIds) {
  const code = record.code || '(missing code)'

  for (const field of REQUIRED_RECORD_FIELDS) {
    const value = record[field]
    if (value === undefined || value === null || value === '') errors.push(`${code} missing ${field}`)
  }

  if (record.h4g_rewrite_contract_version !== CONTRACT_VERSION) {
    errors.push(`${code} h4g_rewrite_contract_version must be ${CONTRACT_VERSION}`)
  }
  if (record.standard_text_role !== 'grade_adapted_display_standard') {
    errors.push(`${code} standard_text_role must be grade_adapted_display_standard`)
  }
  if (record.writes_public_data !== false) errors.push(`${code} writes_public_data must be false`)
  if (record.public_write_candidate !== false) errors.push(`${code} public_write_candidate must be false before user review`)

  const meta = TARGET_GRADE_META[record.grade_band]
  if (!meta) errors.push(`${code} has unexpected grade_band ${record.grade_band}`)
  else {
    if (Number(record.grade_level) !== meta.grade_level) errors.push(`${code} grade_level must be ${meta.grade_level}`)
    if (String(record.grade_range) !== meta.grade_range) errors.push(`${code} grade_range must be ${meta.grade_range}`)
    if (String(record.grade) !== meta.grade) errors.push(`${code} grade must be ${meta.grade}`)
  }

  if (normalizeText(record.standard) === normalizeText(record.source_standard_original)) {
    errors.push(`${code} standard must differ from source_standard_original`)
  }
  if (!normalizeText(record.grade_specific_focus).includes('候选')) {
    errors.push(`${code} grade_specific_focus must mark the text as candidate review material`)
  }

  const confidence = Number(record.grade_adaptation_confidence)
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    errors.push(`${code} grade_adaptation_confidence must be a number between 0 and 1`)
  }
  if (!Array.isArray(record.grade_adaptation_support_methods) || !record.grade_adaptation_support_methods.length) {
    errors.push(`${code} grade_adaptation_support_methods must be a non-empty array`)
  }
  if (!Array.isArray(record.supplemental_evidence_ids) || !record.supplemental_evidence_ids.length) {
    errors.push(`${code} supplemental_evidence_ids must be a non-empty array`)
  } else {
    for (const evidenceId of record.supplemental_evidence_ids) {
      if (!evidenceIds.has(evidenceId)) errors.push(`${code} references missing supplemental evidence id ${evidenceId}`)
    }
  }
  if (stagingRecordIds.has(record.standard_rewrite_candidate_id)) {
    errors.push(`duplicate standard_rewrite_candidate_id in staging records: ${record.standard_rewrite_candidate_id}`)
  }
  stagingRecordIds.add(record.standard_rewrite_candidate_id)
}

function audit(args) {
  const errors = []
  const warnings = []
  const sourceRecords = loadH4GRecords(args.sourceDataRoot, errors)
  const sourceGroups = recordsByGroup(sourceRecords)
  const expectedGroups = new Set(sourceGroups.keys())
  const expectedStagingH4GRecords = expectedGroups.size * TARGET_GRADE_BANDS.length
  const expectedGeneratedMissingRecords = expectedStagingH4GRecords - sourceRecords.length

  if (!existsSync(args.candidates)) errors.push(`Missing candidates payload: ${args.candidates}`)
  if (!existsSync(args.evidence)) errors.push(`Missing evidence payload: ${args.evidence}`)
  if (!existsSync(join(args.dataCandidateRoot, 'by_subject'))) errors.push(`Missing candidate by_subject root: ${join(args.dataCandidateRoot, 'by_subject')}`)

  const candidatesPayload = existsSync(args.candidates) ? readJson(args.candidates) : {}
  const evidencePayload = existsSync(args.evidence) ? readJson(args.evidence) : {}
  const rewriteCandidates = Array.isArray(candidatesPayload.rewrite_candidates) ? candidatesPayload.rewrite_candidates : []
  const evidenceIds = evidenceIdSet(evidencePayload)
  const allStagingRecords = allRecords(args.dataCandidateRoot, errors)
  const stagingRecords = allStagingRecords.filter(record => TARGET_GRADE_BANDS.includes(record.grade_band))
  const stagingGroups = recordsByGroup(stagingRecords)

  if (!Array.isArray(candidatesPayload.rewrite_candidates)) errors.push('standard rewrite candidates payload must contain rewrite_candidates[]')
  if (candidatesPayload.writes_public_data !== false) errors.push('standard rewrite candidates payload writes_public_data must be false')
  if (candidatesPayload.contract_version !== CONTRACT_VERSION) errors.push(`standard rewrite candidates payload contract_version must be ${CONTRACT_VERSION}`)

  const allCodes = new Set()
  for (const record of allStagingRecords) {
    if (!record.code) errors.push('staging record missing code')
    else if (allCodes.has(record.code)) errors.push(`duplicate code in staging data root: ${record.code}`)
    else allCodes.add(record.code)
  }

  const bySubject = {}
  const byGradeBand = {}
  const byVariant = {}
  const byMethod = {}
  const byStatus = {}
  const byOrigin = {}
  const stagingRecordIds = new Set()
  let generatedMissingRecords = 0

  for (const record of stagingRecords) {
    countInto(bySubject, record.subject_slug)
    countInto(byGradeBand, record.grade_band)
    countInto(byVariant, record.standard_variant_type)
    countInto(byMethod, record.grade_adaptation_method)
    countInto(byStatus, record.review_status)
    countInto(byOrigin, record.standard_rewrite_record_origin)
    if (record.candidate_added_record === true) generatedMissingRecords += 1
    auditRecord(record, errors, evidenceIds, stagingRecordIds)
  }

  const payloadCandidateIds = new Set()
  for (const candidate of rewriteCandidates) {
    if (payloadCandidateIds.has(candidate.standard_rewrite_candidate_id)) {
      errors.push(`duplicate standard_rewrite_candidate_id in candidates payload: ${candidate.standard_rewrite_candidate_id}`)
    }
    payloadCandidateIds.add(candidate.standard_rewrite_candidate_id)
    if (candidate.writes_public_data !== false) errors.push(`${candidate.standard_rewrite_candidate_id} writes_public_data must be false`)
    if (!stagingRecordIds.has(candidate.standard_rewrite_candidate_id)) {
      errors.push(`${candidate.standard_rewrite_candidate_id} is missing from staging data root`)
    }
  }

  if (rewriteCandidates.length !== stagingRecords.length) {
    errors.push(`rewrite_candidates length ${rewriteCandidates.length} must equal staging H4G records ${stagingRecords.length}`)
  }
  if (stagingRecords.length !== expectedStagingH4GRecords) {
    errors.push(`staging H4G records ${stagingRecords.length} must equal expected ${expectedStagingH4GRecords}`)
  }
  if (generatedMissingRecords !== expectedGeneratedMissingRecords) {
    errors.push(`generated missing records ${generatedMissingRecords} must equal expected ${expectedGeneratedMissingRecords}`)
  }

  for (const groupId of expectedGroups) {
    if (!stagingGroups.has(groupId)) {
      errors.push(`${groupId} missing from staging data root`)
      continue
    }
    const records = stagingGroups.get(groupId)
    const counts = {}
    for (const record of records) countInto(counts, record.grade_band)
    for (const band of TARGET_GRADE_BANDS) {
      if (counts[band] !== 1) errors.push(`${groupId} must have exactly one ${band} staging record`)
    }
    if (records.length !== TARGET_GRADE_BANDS.length) {
      errors.push(`${groupId} must have exactly ${TARGET_GRADE_BANDS.length} H4G staging records`)
    }
    const rewrittenStandards = new Set(records.map(record => normalizeText(record.standard)))
    if (rewrittenStandards.size !== records.length) {
      errors.push(`${groupId} must have distinct rewritten standards across H4G7/H4G8/H4G9`)
    }
    const emptySources = records.filter(record => !normalizeText(record.source_standard_original))
    if (emptySources.length) errors.push(`${groupId} has records with empty source_standard_original`)
  }

  for (const groupId of stagingGroups.keys()) {
    if (!expectedGroups.has(groupId)) errors.push(`${groupId} is not present in source H4G groups`)
  }

  const result = {
    changes_official_standard_text: true,
    contract_version: CONTRACT_VERSION,
    data_candidate_root: args.dataCandidateRoot,
    errors,
    generated_at: new Date().toISOString(),
    purpose: 'h4g_standard_rewrite_independent_audit',
    source_data_root: args.sourceDataRoot,
    summary: {
      by_grade_adaptation_method: byMethod,
      by_grade_band: byGradeBand,
      by_record_origin: byOrigin,
      by_review_status: byStatus,
      by_standard_variant_type: byVariant,
      by_subject: bySubject,
      candidate_records: rewriteCandidates.length,
      expected_generated_missing_records: expectedGeneratedMissingRecords,
      expected_progression_groups: expectedGroups.size,
      expected_staging_h4g_records: expectedStagingH4GRecords,
      generated_missing_records: generatedMissingRecords,
      source_h4g_records: sourceRecords.length,
      staging_h4g_records: stagingRecords.length,
      staging_progression_groups: stagingGroups.size
    },
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }

  return result
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
  expected_generated_missing_records: result.summary.expected_generated_missing_records,
  generated_missing_records: result.summary.generated_missing_records,
  staging_h4g_records: result.summary.staging_h4g_records,
  staging_progression_groups: result.summary.staging_progression_groups,
  valid: result.valid,
  warnings: result.warnings.length
}), null, 2))

if (args.strict && !result.valid) {
  console.error(result.errors.join('\n'))
  process.exit(1)
}
