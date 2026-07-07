#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  TARGET_GRADE_BANDS,
  countInto,
  hashJson,
  markdownCell,
  normalizeText,
  recordsByGroup,
  readJson,
  subjectFiles,
  writeJson,
  writeText
} from './h4g_supplemental_pipeline_utils.js'

const CONTRACT_VERSION = 'H4G_SOURCE_ALIGNED_STANDARD_REWRITE_CONTRACT_v0.1'
const DEFAULT_BASE_ROOT = 'public/data'
const DEFAULT_CANDIDATE_ROOT = 'generated/h4g_source_aligned_standard_rewrite/data_candidate'
const DEFAULT_CANDIDATES = 'generated/h4g_source_aligned_standard_rewrite/source_aligned_standard_rewrite_candidates.json'
const DEFAULT_OUT = 'generated/h4g_source_aligned_standard_rewrite/source_aligned_standard_rewrite_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/h4g_source_aligned_standard_rewrite/source_aligned_standard_rewrite_audit.md'

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
  '核心要求'
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
  '，能源'
]

const REQUIRED_FIELDS = [
  'standard',
  'grade_specific_focus',
  'source_standard_original',
  'supporting_source_standard_original',
  'previous_source_standard_original',
  'previous_template_standard',
  'previous_template_grade_specific_focus',
  'source_aligned_rewrite_contract_version',
  'source_aligned_rewrite_candidate_id',
  'source_aligned_rewrite_method',
  'source_aligned_rewrite_status',
  'source_aligned_rewrite_rationale',
  'source_aligned_source_overlap',
  'source_aligned_forbidden_template_hits'
]

function parseArgs(argv) {
  const args = {
    baseRoot: DEFAULT_BASE_ROOT,
    candidates: DEFAULT_CANDIDATES,
    candidateRoot: DEFAULT_CANDIDATE_ROOT,
    minOverlap: 0.12,
    out: DEFAULT_OUT,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--base-root') args.baseRoot = argv[++i]
    else if (item === '--candidate-root') args.candidateRoot = argv[++i]
    else if (item === '--candidates') args.candidates = argv[++i]
    else if (item === '--min-overlap') args.minOverlap = Number(argv[++i])
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
npm run grade7_9:audit-h4g-source-aligned-standard-rewrite-candidate -- --strict

Audits the source-aligned H4G standard rewrite candidate. The audit fails on
template phrasing, source mismatch, changed non-H4G records, incomplete groups,
or unsafe lineage.`)
}

function isH4G(record) {
  return TARGET_GRADE_BANDS.includes(record.grade_band)
}

function loadPayloads(root, errors, label) {
  const payloads = new Map()
  if (!existsSync(root)) {
    errors.push(`Missing ${label} root: ${root}`)
    return payloads
  }
  for (const file of subjectFiles(root)) {
    payloads.set(basename(file, '.json'), readJson(file))
  }
  return payloads
}

function forbiddenHits(...texts) {
  const joined = texts.map(text => normalizeText(text)).join('\n')
  return [...FORBIDDEN_TEMPLATE_TOKENS, ...FORBIDDEN_FLUENCY_TOKENS].filter(token => joined.includes(token))
}

function recordByCode(payload) {
  return new Map((payload?.standards || []).map(record => [record.code, record]))
}

function checkRecord(record, base, errors, warnings, args, seenCandidateIds) {
  const code = record.code || '(missing code)'
  for (const field of REQUIRED_FIELDS) {
    const value = record[field]
    if (value === undefined || value === null || value === '') errors.push(`${code} missing ${field}`)
  }

  if (record.source_aligned_rewrite_contract_version !== CONTRACT_VERSION) errors.push(`${code} wrong source aligned contract version`)
  if (record.standard_text_role !== 'source_aligned_grade_display_standard') errors.push(`${code} standard_text_role must be source_aligned_grade_display_standard`)
  if (record.writes_public_data !== false) errors.push(`${code} writes_public_data must be false`)
  if (record.public_write_candidate !== false) errors.push(`${code} public_write_candidate must be false`)
  if (seenCandidateIds.has(record.source_aligned_rewrite_candidate_id)) errors.push(`duplicate source_aligned_rewrite_candidate_id: ${record.source_aligned_rewrite_candidate_id}`)
  seenCandidateIds.add(record.source_aligned_rewrite_candidate_id)

  const standard = normalizeText(record.standard)
  const focus = normalizeText(record.grade_specific_focus)
  const previousStandard = normalizeText(record.previous_template_standard || base?.standard)
  const previousFocus = normalizeText(record.previous_template_grade_specific_focus || base?.grade_specific_focus)
  const hits = forbiddenHits(standard, focus)
  if (hits.length) errors.push(`${code} contains forbidden template token(s): ${hits.join(', ')}`)
  if (Array.isArray(record.source_aligned_forbidden_template_hits) && record.source_aligned_forbidden_template_hits.length) {
    errors.push(`${code} source_aligned_forbidden_template_hits must be empty`)
  }
  if (standard === previousStandard) errors.push(`${code} standard still equals previous template standard`)
  if (focus === previousFocus) errors.push(`${code} grade_specific_focus still equals previous template focus`)
  if (standard === normalizeText(record.source_standard_original)) warnings.push(`${code} standard equals corrected source exactly; check whether grade adaptation is too weak`)
  if (Number(record.source_aligned_source_overlap) < args.minOverlap) {
    errors.push(`${code} source overlap ${record.source_aligned_source_overlap} below ${args.minOverlap}`)
  }
  if (!Array.isArray(record.textbook_evidence_ids)) errors.push(`${code} textbook_evidence_ids must remain an array`)
  if (!Array.isArray(record.supplemental_evidence_ids)) errors.push(`${code} supplemental_evidence_ids must remain an array`)
  if (!record.source_anchor_id) errors.push(`${code} missing source_anchor_id`)
  if (!record.source_anchor_subcategory) errors.push(`${code} missing source_anchor_subcategory`)
}

function auditSubject(subjectSlug, basePayload, candidatePayload, args) {
  const errors = []
  const warnings = []
  const byGradeBand = {}
  const byStatus = {}
  let changedNonH4G = 0
  const baseByCode = recordByCode(basePayload)
  const candidateRows = candidatePayload?.standards || []
  const candidateH4G = candidateRows.filter(isH4G)
  const seenCandidateIds = new Set()

  for (const record of candidateRows) {
    const base = baseByCode.get(record.code)
    if (!base) {
      errors.push(`${record.code} missing from base payload`)
      continue
    }
    if (!isH4G(record) && hashJson(record) !== hashJson(base)) changedNonH4G += 1
  }
  if (changedNonH4G) errors.push(`${subjectSlug} changed ${changedNonH4G} non-H4G records`)

  for (const record of candidateH4G) {
    countInto(byGradeBand, record.grade_band)
    countInto(byStatus, record.source_aligned_rewrite_status)
    checkRecord(record, baseByCode.get(record.code), errors, warnings, args, seenCandidateIds)
  }

  const groups = recordsByGroup(candidateH4G)
  let distinctTriplets = 0
  for (const [groupId, rows] of groups) {
    const bands = new Set(rows.map(row => row.grade_band))
    if (rows.length !== 3 || TARGET_GRADE_BANDS.some(band => !bands.has(band))) {
      errors.push(`${groupId} is not a complete H4G triplet`)
      continue
    }
    const standards = new Set(rows.map(row => normalizeText(row.standard)))
    if (standards.size !== 3) errors.push(`${groupId} standards must differ across G7/G8/G9`)
    else distinctTriplets += 1
  }

  return {
    errors,
    subject_slug: subjectSlug,
    summary: {
      by_grade_band: byGradeBand,
      by_status: byStatus,
      changed_non_h4g_records: changedNonH4G,
      distinct_triplets: distinctTriplets,
      h4g_records: candidateH4G.length,
      low_overlap_records: candidateH4G.filter(record => Number(record.source_aligned_source_overlap) < args.minOverlap).length,
      progression_groups: groups.size,
      template_hit_records: candidateH4G.filter(record => forbiddenHits(record.standard, record.grade_specific_focus).length).length
    },
    valid: errors.length === 0,
    warnings
  }
}

function markdown(result) {
  return `# H4G Source-Aligned Standard Rewrite Audit

Generated at: ${result.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${result.valid} |
| H4G records | ${result.summary.h4g_records} |
| progression groups | ${result.summary.progression_groups} |
| distinct triplets | ${result.summary.distinct_triplets} |
| template-hit records | ${result.summary.template_hit_records} |
| low-overlap records | ${result.summary.low_overlap_records} |
| changed non-H4G records | ${result.summary.changed_non_h4g_records} |
| errors | ${result.errors.length} |
| warnings | ${result.warnings.length} |

## Subject Summary

| Subject | H4G | Groups | Distinct Triplets | Template Hits | Low Overlap | Non-H4G Changes | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${result.subjects.map(item => `| ${item.subject_slug} | ${item.summary.h4g_records} | ${item.summary.progression_groups} | ${item.summary.distinct_triplets} | ${item.summary.template_hit_records} | ${item.summary.low_overlap_records} | ${item.summary.changed_non_h4g_records} | ${item.errors.length} |`).join('\n')}

## Errors

${result.errors.length ? result.errors.slice(0, 200).map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}

## Warnings

${result.warnings.length ? result.warnings.slice(0, 200).map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  const warnings = []
  const basePayloads = loadPayloads(args.baseRoot, errors, 'base')
  const candidatePayloads = loadPayloads(args.candidateRoot, errors, 'candidate')
  const candidatePayload = existsSync(args.candidates) ? readJson(args.candidates) : null
  if (!candidatePayload) errors.push(`Missing candidates payload: ${args.candidates}`)
  else {
    if (candidatePayload.contract_version !== CONTRACT_VERSION) errors.push(`candidate payload contract_version must be ${CONTRACT_VERSION}`)
    if (candidatePayload.writes_public_data !== false) errors.push('candidate payload writes_public_data must be false')
    if (!Array.isArray(candidatePayload.source_aligned_standard_rewrite_candidates)) errors.push('candidate payload missing source_aligned_standard_rewrite_candidates[]')
  }

  const subjects = []
  const totals = {
    changed_non_h4g_records: 0,
    distinct_triplets: 0,
    h4g_records: 0,
    low_overlap_records: 0,
    progression_groups: 0,
    template_hit_records: 0
  }

  const subjectSlugs = [...basePayloads.keys()].sort((a, b) => a.localeCompare(b))
  for (const subjectSlug of subjectSlugs) {
    const basePayload = basePayloads.get(subjectSlug)
    const candidateSubjectPayload = candidatePayloads.get(subjectSlug)
    if (!candidateSubjectPayload) {
      errors.push(`Missing candidate subject: ${subjectSlug}`)
      continue
    }
    const subject = auditSubject(subjectSlug, basePayload, candidateSubjectPayload, args)
    subjects.push(subject)
    errors.push(...subject.errors)
    warnings.push(...subject.warnings)
    totals.changed_non_h4g_records += subject.summary.changed_non_h4g_records
    totals.distinct_triplets += subject.summary.distinct_triplets
    totals.h4g_records += subject.summary.h4g_records
    totals.low_overlap_records += subject.summary.low_overlap_records
    totals.progression_groups += subject.summary.progression_groups
    totals.template_hit_records += subject.summary.template_hit_records
  }

  if (totals.h4g_records !== 1170) errors.push(`expected 1170 H4G records, found ${totals.h4g_records}`)
  if (totals.progression_groups !== 390) errors.push(`expected 390 progression groups, found ${totals.progression_groups}`)
  const candidateCount = candidatePayload?.source_aligned_standard_rewrite_candidates?.length || 0
  if (candidateCount !== totals.h4g_records) errors.push(`candidate payload count ${candidateCount} must equal H4G records ${totals.h4g_records}`)

  const result = {
    contract_version: CONTRACT_VERSION,
    errors,
    generated_at: new Date().toISOString(),
    min_overlap: args.minOverlap,
    purpose: 'h4g_source_aligned_standard_rewrite_audit',
    subjects,
    summary: totals,
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }
  writeJson(args.out, result)
  if (args.summaryOut) writeText(args.summaryOut, markdown(result))
  return result
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const result = audit(args)
console.log(JSON.stringify({
  changed_non_h4g_records: result.summary.changed_non_h4g_records,
  distinct_triplets: result.summary.distinct_triplets,
  h4g_records: result.summary.h4g_records,
  low_overlap_records: result.summary.low_overlap_records,
  progression_groups: result.summary.progression_groups,
  template_hit_records: result.summary.template_hit_records,
  valid: result.valid,
  warnings: result.warnings.length
}, null, 2))

if (!result.valid && args.strict) process.exitCode = 1
