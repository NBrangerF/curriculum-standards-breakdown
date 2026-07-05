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
const DEFAULT_PUBLIC_DATA_ROOT = 'public/data'
const DEFAULT_CANDIDATE_ROOT = 'generated/h4g_standard_enrichment_publication/data_candidate'
const DEFAULT_RELEASE_SUMMARY = 'generated/h4g_standard_enrichment_publication/publication_release_summary.json'
const DEFAULT_OUT = 'generated/h4g_standard_enrichment_publication/publication_release_audit.json'
const DEFAULT_SUMMARY_MD = 'generated/h4g_standard_enrichment_publication/publication_release_audit.md'
const RELEASE_STATUS = 'published_full_batch_user_approved'
const PUBLISH_METADATA_FIELDS = new Set([
  'pre_publication_review_status',
  'public_write_candidate',
  'review_status',
  'standard_enrichment_publication_contract_version',
  'standard_enrichment_publication_published_at',
  'standard_enrichment_publication_status',
  'writes_public_data'
])

function parseArgs(argv) {
  const args = {
    candidateRoot: DEFAULT_CANDIDATE_ROOT,
    out: DEFAULT_OUT,
    publicDataRoot: DEFAULT_PUBLIC_DATA_ROOT,
    releaseSummary: DEFAULT_RELEASE_SUMMARY,
    strict: false,
    summaryMd: DEFAULT_SUMMARY_MD
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate-root') args.candidateRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--public-data-root') args.publicDataRoot = argv[++i]
    else if (item === '--release-summary') args.releaseSummary = argv[++i]
    else if (item === '--summary-md') args.summaryMd = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
npm run grade7_9:audit-h4g-standard-enrichment-publication-release -- --strict

Audits that public/data now contains the full H4G standard enrichment
publication release, while preserving candidate content and marking H4G records
as published.`)
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

function comparableH4GRecord(record) {
  const out = {}
  for (const [key, value] of Object.entries(record)) {
    if (!PUBLISH_METADATA_FIELDS.has(key)) out[key] = value
  }
  return out
}

function expectedReleaseStatus(record) {
  if (record.review_status === 'standard_enrichment_partial_source_bridge_needs_review') {
    return 'standard_enrichment_partial_source_bridge_published_full_batch'
  }
  return 'standard_enrichment_published_full_batch'
}

function buildMarkdown(audit) {
  return `# H4G Standard Enrichment Publication Release Audit

Generated at: ${audit.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${audit.valid} |
| public records | ${audit.summary.public_records} |
| public H4G records | ${audit.summary.public_h4g_records} |
| candidate H4G records | ${audit.summary.candidate_h4g_records} |
| progression groups | ${audit.summary.progression_groups} |
| candidate content mismatches | ${audit.summary.h4g_candidate_content_mismatches} |
| non-H4G mismatches | ${audit.summary.non_h4g_mismatches} |
| published status errors | ${audit.summary.published_status_errors} |
| errors | ${audit.errors.length} |
| warnings | ${audit.warnings.length} |

## Review Status

| Status | Count |
| --- | ---: |
${countRows(audit.summary.by_review_status)}

## Subjects

| Subject | Records | H4G Records |
| --- | ---: | ---: |
${audit.subjects.map(row => `| ${markdownCell(row.subject_slug)} | ${row.records} | ${row.h4g_records} |`).join('\n')}

## Errors

${audit.errors.length ? audit.errors.slice(0, 200).map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}

## Warnings

${audit.warnings.length ? audit.warnings.slice(0, 200).map(warning => `- ${markdownCell(warning)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  const warnings = []
  const publicPayloads = loadPayloads(args.publicDataRoot, errors, 'public')
  const candidatePayloads = loadPayloads(args.candidateRoot, errors, 'candidate')
  const releaseSummary = existsSync(args.releaseSummary) ? readJson(args.releaseSummary) : null
  if (!releaseSummary) errors.push(`Missing release summary: ${args.releaseSummary}`)
  else {
    if (releaseSummary.valid !== true) errors.push('release summary must be valid')
    if (releaseSummary.mode !== 'write_public_data') errors.push('release summary mode must be write_public_data')
    if (releaseSummary.writes_public_data !== true) errors.push('release summary writes_public_data must be true')
    if (releaseSummary.totals?.published_h4g_records !== 1170) errors.push('release summary must report 1170 published H4G records')
  }

  const publicRows = allRecords(publicPayloads)
  const candidateRows = allRecords(candidatePayloads)
  const publicByCode = byCode(publicRows)
  const candidateByCode = byCode(candidateRows)
  const publicH4G = publicRows.filter(isH4G)
  const candidateH4G = candidateRows.filter(isH4G)
  const groups = recordsByGroup(publicH4G)
  const byReviewStatus = {}
  const subjects = []
  let h4gCandidateContentMismatches = 0
  let nonH4GMismatches = 0
  let publishedStatusErrors = 0

  for (const [subjectSlug, payload] of publicPayloads) {
    const rows = payload.standards || []
    const h4g = rows.filter(isH4G)
    subjects.push({
      h4g_records: h4g.length,
      records: rows.length,
      subject_slug: subjectSlug
    })
    if (payload.publication_candidate !== false) errors.push(`${subjectSlug} payload publication_candidate must be false`)
    if (payload.writes_public_data !== true) errors.push(`${subjectSlug} payload writes_public_data must be true`)
    if (payload.data_scope !== 'h4g_standard_enrichment_full_batch_publication') errors.push(`${subjectSlug} payload data_scope must be h4g_standard_enrichment_full_batch_publication`)
  }

  for (const record of publicH4G) {
    countInto(byReviewStatus, record.review_status)
    const candidate = candidateByCode.get(record.code)
    if (!candidate) {
      errors.push(`${record.code} public H4G record not found in candidate root`)
      h4gCandidateContentMismatches += 1
      continue
    }
    if (stableString(comparableH4GRecord(record)) !== stableString(comparableH4GRecord(candidate))) {
      errors.push(`${record.code} public H4G content differs from candidate beyond publication metadata`)
      h4gCandidateContentMismatches += 1
    }
    if (record.pre_publication_review_status !== candidate.review_status) {
      errors.push(`${record.code} pre_publication_review_status does not preserve candidate review_status`)
      publishedStatusErrors += 1
    }
    if (record.review_status !== expectedReleaseStatus(candidate)) {
      errors.push(`${record.code} unexpected published review_status: ${record.review_status}`)
      publishedStatusErrors += 1
    }
    if (record.standard_enrichment_publication_contract_version !== CONTRACT_VERSION) {
      errors.push(`${record.code} missing release contract version`)
      publishedStatusErrors += 1
    }
    if (record.standard_enrichment_publication_status !== RELEASE_STATUS) {
      errors.push(`${record.code} missing release status`)
      publishedStatusErrors += 1
    }
    if (record.public_write_candidate !== true || record.writes_public_data !== true) {
      errors.push(`${record.code} publication flags must be true after release`)
      publishedStatusErrors += 1
    }
    if (normalizeText(record.standard) !== normalizeText(candidate.standard)) {
      errors.push(`${record.code} published standard differs from candidate standard`)
      h4gCandidateContentMismatches += 1
    }
  }

  for (const record of candidateH4G) {
    if (!publicByCode.has(record.code)) errors.push(`${record.code} candidate H4G record missing from public data`)
  }

  for (const record of candidateRows.filter(record => !isH4G(record))) {
    const publicRecord = publicByCode.get(record.code)
    if (!publicRecord) {
      errors.push(`${record.code} candidate non-H4G record missing from public data`)
      nonH4GMismatches += 1
    } else if (stableString(record) !== stableString(publicRecord)) {
      errors.push(`${record.code} non-H4G record changed during release`)
      nonH4GMismatches += 1
    }
  }

  if (publicRows.length !== 2022) errors.push(`public records must be 2022 after release, found ${publicRows.length}`)
  if (publicH4G.length !== 1170) errors.push(`public H4G records must be 1170 after release, found ${publicH4G.length}`)
  if (candidateH4G.length !== 1170) errors.push(`candidate H4G records must be 1170, found ${candidateH4G.length}`)
  if (groups.size !== 390) errors.push(`public progression groups must be 390 after release, found ${groups.size}`)
  for (const [groupId, rows] of groups) {
    const counts = {}
    for (const row of rows) countInto(counts, row.grade_band)
    for (const band of TARGET_GRADE_BANDS) {
      if (counts[band] !== 1) errors.push(`${groupId} must have exactly one ${band} record`)
    }
    const standards = new Set(rows.map(row => normalizeText(row.standard)))
    if (standards.size !== rows.length) errors.push(`${groupId} standards must differ across grade siblings`)
  }

  return {
    errors,
    generated_at: new Date().toISOString(),
    public_data_root: args.publicDataRoot,
    purpose: 'h4g_standard_enrichment_publication_release_audit',
    subjects,
    summary: {
      by_review_status: byReviewStatus,
      candidate_h4g_records: candidateH4G.length,
      h4g_candidate_content_mismatches: h4gCandidateContentMismatches,
      non_h4g_mismatches: nonH4GMismatches,
      progression_groups: groups.size,
      public_h4g_records: publicH4G.length,
      public_records: publicRows.length,
      published_status_errors: publishedStatusErrors
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
  h4g_candidate_content_mismatches: result.summary.h4g_candidate_content_mismatches,
  non_h4g_mismatches: result.summary.non_h4g_mismatches,
  progression_groups: result.summary.progression_groups,
  public_h4g_records: result.summary.public_h4g_records,
  public_records: result.summary.public_records,
  published_status_errors: result.summary.published_status_errors,
  valid: result.valid,
  warnings: result.warnings.length
}), null, 2))

if (args.strict && !result.valid) {
  console.error(result.errors.join('\n'))
  process.exit(1)
}
