#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
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

const CONTRACT_VERSION = 'H4G_STANDARD_ENRICHMENT_PUBLICATION_CONTRACT_v1'
const ENRICHMENT_VERSION = 'H4G_STANDARD_ENRICHMENT_v1'
const DEFAULT_PUBLIC_DATA_ROOT = 'public/data'
const DEFAULT_ENRICHMENT_ROOT = 'generated/h4g_standard_enrichment/data_candidate'
const DEFAULT_CANDIDATE_ROOT = 'generated/h4g_standard_enrichment_publication/data_candidate'
const DEFAULT_APPLY_SUMMARY = 'generated/h4g_standard_enrichment_publication/publication_apply_summary.json'
const DEFAULT_OUT = 'generated/h4g_standard_enrichment_publication/publication_audit.json'
const DEFAULT_SUMMARY_MD = 'generated/h4g_standard_enrichment_publication/publication_audit.md'

function parseArgs(argv) {
  const args = {
    applySummary: DEFAULT_APPLY_SUMMARY,
    candidateRoot: DEFAULT_CANDIDATE_ROOT,
    enrichmentRoot: DEFAULT_ENRICHMENT_ROOT,
    out: DEFAULT_OUT,
    publicDataRoot: DEFAULT_PUBLIC_DATA_ROOT,
    strict: false,
    summaryMd: DEFAULT_SUMMARY_MD
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--apply-summary') args.applySummary = argv[++i]
    else if (item === '--candidate-root') args.candidateRoot = argv[++i]
    else if (item === '--enrichment-root') args.enrichmentRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--public-data-root') args.publicDataRoot = argv[++i]
    else if (item === '--summary-md') args.summaryMd = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
npm run grade7_9:audit-h4g-standard-enrichment-publication-candidate -- --strict

Independently audits the dry-run H4G standard enrichment publication candidate.
It verifies candidate root shape, H4G replacement/addition coverage, non-H4G
immutability, enrichment lineage, and no-public-write boundaries.`)
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
  if (!payloads.size) errors.push(`${label} root has no by_subject payloads: ${root}`)
  return payloads
}

function allRecords(payloads) {
  return [...payloads.values()].flatMap(payload => payload.standards || [])
}

function byCode(records) {
  return new Map(records.filter(record => record.code).map(record => [record.code, record]))
}

function stableString(value) {
  return JSON.stringify(stable(value))
}

function buildMarkdown(audit) {
  return `# H4G Standard Enrichment Publication Candidate Audit

Generated at: ${audit.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${audit.valid} |
| public H4G records | ${audit.summary.public_h4g_records} |
| candidate H4G records | ${audit.summary.candidate_h4g_records} |
| existing H4G records replaced | ${audit.summary.existing_h4g_records_replaced} |
| new H4G records added | ${audit.summary.new_h4g_records_added} |
| progression groups | ${audit.summary.progression_groups} |
| non-H4G changed records | ${audit.summary.non_h4g_changed_records} |
| errors | ${audit.errors.length} |
| warnings | ${audit.warnings.length} |
| writes public data | ${audit.writes_public_data} |

## Subjects

| Subject | Public H4G | Candidate H4G | Existing Replaced | New Added |
| --- | ---: | ---: | ---: | ---: |
${audit.subjects.map(row => `| ${markdownCell(row.subject_slug)} | ${row.public_h4g_records} | ${row.candidate_h4g_records} | ${row.existing_h4g_records_replaced} | ${row.new_h4g_records_added} |`).join('\n')}

## Review Status

| Status | Count |
| --- | ---: |
${countRows(audit.summary.by_review_status)}

## Errors

${audit.errors.length ? audit.errors.slice(0, 200).map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}

## Warnings

${audit.warnings.length ? audit.warnings.slice(0, 200).map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}
`
}

function checkH4GRecord(record, errors) {
  const code = record.code || '(missing code)'
  for (const field of [
    'standard',
    'source_standard_original',
    'previous_standard_rewrite',
    'standard_text_role',
    'standard_enrichment_contract_version',
    'standard_enrichment_candidate_id',
    'standard_enrichment_method',
    'standard_enrichment_rationale',
    'supplemental_evidence_ids'
  ]) {
    const value = record[field]
    if (value === undefined || value === null || value === '') errors.push(`${code} missing ${field}`)
  }
  if (record.standard_text_role !== 'grade_adapted_display_standard') errors.push(`${code} standard_text_role must be grade_adapted_display_standard`)
  if (record.standard_enrichment_contract_version !== ENRICHMENT_VERSION) errors.push(`${code} wrong enrichment contract version`)
  if (normalizeText(record.standard) === normalizeText(record.source_standard_original)) errors.push(`${code} standard equals source_standard_original`)
  if (normalizeText(record.standard) === normalizeText(record.previous_standard_rewrite)) errors.push(`${code} standard equals previous_standard_rewrite`)
  if (normalizeText(record.standard).includes('能结合“') || normalizeText(record.standard).includes('核心要求')) errors.push(`${code} still contains old rewrite template trace`)
  if (!Array.isArray(record.supplemental_evidence_ids) || !record.supplemental_evidence_ids.length) errors.push(`${code} supplemental_evidence_ids must be non-empty`)
  if (record.writes_public_data !== false) errors.push(`${code} writes_public_data must be false`)
}

function audit(args) {
  const errors = []
  const warnings = []
  const publicPayloads = loadPayloads(args.publicDataRoot, errors, 'public')
  const enrichmentPayloads = loadPayloads(args.enrichmentRoot, errors, 'enrichment')
  const candidatePayloads = loadPayloads(args.candidateRoot, errors, 'candidate')
  const applySummary = existsSync(args.applySummary) ? readJson(args.applySummary) : null
  if (!applySummary) errors.push(`Missing apply summary: ${args.applySummary}`)
  else {
    if (applySummary.valid !== true) errors.push('apply summary must be valid')
    if (applySummary.writes_public_data !== false) errors.push('apply summary writes_public_data must be false')
    if (applySummary.contract_version !== CONTRACT_VERSION) errors.push(`apply summary contract_version must be ${CONTRACT_VERSION}`)
  }

  const publicRows = allRecords(publicPayloads)
  const enrichmentRows = allRecords(enrichmentPayloads)
  const candidateRows = allRecords(candidatePayloads)
  const publicCode = byCode(publicRows)
  const enrichmentCode = byCode(enrichmentRows)
  const candidateCode = byCode(candidateRows)
  const publicH4G = publicRows.filter(isH4G)
  const enrichmentH4G = enrichmentRows.filter(isH4G)
  const candidateH4G = candidateRows.filter(isH4G)
  const publicH4GCode = byCode(publicH4G)
  const enrichmentH4GCode = byCode(enrichmentH4G)
  const candidateH4GCode = byCode(candidateH4G)
  const subjects = []
  const byReviewStatus = {}
  let existingReplaced = 0
  let newAdded = 0
  let nonH4GChanged = 0

  for (const [subjectSlug, publicPayload] of publicPayloads) {
    const enrichmentPayload = enrichmentPayloads.get(subjectSlug)
    const candidatePayload = candidatePayloads.get(subjectSlug)
    if (!enrichmentPayload) errors.push(`${subjectSlug} missing from enrichment root`)
    if (!candidatePayload) errors.push(`${subjectSlug} missing from candidate root`)
    if (!candidatePayload || !enrichmentPayload) continue
    if (candidatePayload.h4g_standard_enrichment_publication_contract_version !== CONTRACT_VERSION) {
      errors.push(`${subjectSlug} candidate payload missing publication contract version`)
    }
    if (candidatePayload.writes_public_data !== false) errors.push(`${subjectSlug} candidate payload writes_public_data must be false`)
    const pubH = (publicPayload.standards || []).filter(isH4G)
    const enrH = (enrichmentPayload.standards || []).filter(isH4G)
    const candH = (candidatePayload.standards || []).filter(isH4G)
    const pubHCode = byCode(pubH)
    const existing = candH.filter(record => pubHCode.has(record.code)).length
    const added = candH.filter(record => !pubHCode.has(record.code)).length
    existingReplaced += existing
    newAdded += added
    subjects.push({
      candidate_h4g_records: candH.length,
      existing_h4g_records_replaced: existing,
      new_h4g_records_added: added,
      public_h4g_records: pubH.length,
      subject_slug: subjectSlug
    })

    const publicNonH4G = (publicPayload.standards || []).filter(record => !isH4G(record))
    const candidateNonH4GCode = byCode((candidatePayload.standards || []).filter(record => !isH4G(record)))
    for (const record of publicNonH4G) {
      const candidate = candidateNonH4GCode.get(record.code)
      if (!candidate) {
        errors.push(`${record.code} non-H4G record missing from candidate`)
        nonH4GChanged += 1
      } else if (stableString(record) !== stableString(candidate)) {
        errors.push(`${record.code} non-H4G record changed in candidate`)
        nonH4GChanged += 1
      }
    }
  }

  for (const record of candidateH4G) {
    countInto(byReviewStatus, record.review_status)
    checkH4GRecord(record, errors)
    const enriched = enrichmentH4GCode.get(record.code)
    if (!enriched) errors.push(`${record.code} candidate H4G record not found in enrichment root`)
    else if (stableString(record) !== stableString(enriched)) errors.push(`${record.code} candidate H4G differs from enrichment root`)
  }

  for (const record of enrichmentH4G) {
    if (!candidateH4GCode.has(record.code)) errors.push(`${record.code} enrichment H4G record missing from publication candidate`)
  }

  for (const record of publicH4G) {
    const candidate = candidateH4GCode.get(record.code)
    if (!candidate) errors.push(`${record.code} existing public H4G record missing from candidate`)
    else if (normalizeText(candidate.standard) === normalizeText(record.standard)) errors.push(`${record.code} candidate standard did not change from public standard`)
  }

  for (const [code, record] of candidateCode) {
    if (!publicCode.has(code) && !enrichmentCode.has(code)) errors.push(`${code} candidate record is neither public nor enrichment sourced`)
    if (!isH4G(record) && !publicCode.has(code)) errors.push(`${code} non-H4G candidate record not present in public data`)
  }

  const groups = recordsByGroup(candidateH4G)
  for (const [groupId, rows] of groups) {
    const counts = {}
    for (const row of rows) countInto(counts, row.grade_band)
    for (const band of TARGET_GRADE_BANDS) {
      if (counts[band] !== 1) errors.push(`${groupId} must have exactly one ${band} record`)
    }
    const standards = new Set(rows.map(row => normalizeText(row.standard)))
    if (standards.size !== rows.length) errors.push(`${groupId} standards must differ across grade siblings`)
  }

  if (candidateH4G.length !== 1170) errors.push(`candidate H4G records must be 1170, found ${candidateH4G.length}`)
  if (groups.size !== 390) errors.push(`candidate progression groups must be 390, found ${groups.size}`)
  if (existingReplaced !== publicH4G.length) errors.push(`existing H4G replaced ${existingReplaced} must equal public H4G ${publicH4G.length}`)
  if (newAdded !== enrichmentH4G.length - publicH4G.length) errors.push(`new H4G added ${newAdded} does not match enrichment-public delta ${enrichmentH4G.length - publicH4G.length}`)

  return {
    candidate_data_root: args.candidateRoot,
    contract_version: CONTRACT_VERSION,
    errors,
    generated_at: new Date().toISOString(),
    purpose: 'h4g_standard_enrichment_publication_candidate_audit',
    requires_user_public_write_decision: true,
    subjects,
    summary: {
      by_review_status: byReviewStatus,
      candidate_h4g_records: candidateH4G.length,
      existing_h4g_records_replaced: existingReplaced,
      new_h4g_records_added: newAdded,
      non_h4g_changed_records: nonH4GChanged,
      progression_groups: groups.size,
      public_h4g_records: publicH4G.length
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
if (args.summaryMd) writeText(args.summaryMd, buildMarkdown(result))

console.log(JSON.stringify(stable({
  candidate_h4g_records: result.summary.candidate_h4g_records,
  existing_h4g_records_replaced: result.summary.existing_h4g_records_replaced,
  new_h4g_records_added: result.summary.new_h4g_records_added,
  non_h4g_changed_records: result.summary.non_h4g_changed_records,
  progression_groups: result.summary.progression_groups,
  valid: result.valid,
  warnings: result.warnings.length,
  writes_public_data: result.writes_public_data
}), null, 2))

if (args.strict && !result.valid) {
  console.error(result.errors.join('\n'))
  process.exit(1)
}
