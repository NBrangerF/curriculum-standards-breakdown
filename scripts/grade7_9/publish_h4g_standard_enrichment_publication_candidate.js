#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import {
  TARGET_GRADE_BANDS,
  countInto,
  countRows,
  markdownCell,
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
const DEFAULT_PUBLICATION_AUDIT = 'generated/h4g_standard_enrichment_publication/publication_audit.json'
const DEFAULT_REVIEW_SURFACE = 'generated/h4g_standard_enrichment_publication/publication_review_surface.json'
const DEFAULT_SUMMARY_OUT = 'generated/h4g_standard_enrichment_publication/publication_release_summary.json'
const DEFAULT_SUMMARY_MD = 'generated/h4g_standard_enrichment_publication/publication_release_summary.md'
const DEFAULT_BACKUP_DIR = 'generated/h4g_standard_enrichment_publication/backups'
const RELEASE_STATUS = 'published_full_batch_user_approved'

function parseArgs(argv) {
  const args = {
    backupDir: DEFAULT_BACKUP_DIR,
    candidateRoot: DEFAULT_CANDIDATE_ROOT,
    confirm: false,
    publicDataRoot: DEFAULT_PUBLIC_DATA_ROOT,
    publicationAudit: DEFAULT_PUBLICATION_AUDIT,
    reviewSurface: DEFAULT_REVIEW_SURFACE,
    strict: false,
    summaryMd: DEFAULT_SUMMARY_MD,
    summaryOut: DEFAULT_SUMMARY_OUT,
    write: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--backup-dir') args.backupDir = argv[++i]
    else if (item === '--candidate-root') args.candidateRoot = argv[++i]
    else if (item === '--confirm-h4g-standard-enrichment-publication') args.confirm = true
    else if (item === '--public-data-root') args.publicDataRoot = argv[++i]
    else if (item === '--publication-audit') args.publicationAudit = argv[++i]
    else if (item === '--review-surface') args.reviewSurface = argv[++i]
    else if (item === '--summary-md') args.summaryMd = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--write') args.write = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
npm run grade7_9:publish-h4g-standard-enrichment-publication-candidate -- \\
  --write --confirm-h4g-standard-enrichment-publication --strict

Publishes the full H4G standard enrichment publication candidate into
public/data. A dry run is performed unless --write and the explicit confirm
flag are both present.`)
}

function isH4G(record) {
  return TARGET_GRADE_BANDS.includes(record.grade_band)
}

function releaseReviewStatus(record) {
  if (record.review_status === 'standard_enrichment_partial_source_bridge_needs_review') {
    return 'standard_enrichment_partial_source_bridge_published_full_batch'
  }
  return 'standard_enrichment_published_full_batch'
}

function releaseRecord(record, publishedAt) {
  if (!isH4G(record)) return record
  return {
    ...record,
    pre_publication_review_status: record.review_status,
    public_write_candidate: true,
    review_status: releaseReviewStatus(record),
    standard_enrichment_publication_contract_version: CONTRACT_VERSION,
    standard_enrichment_publication_published_at: publishedAt,
    standard_enrichment_publication_status: RELEASE_STATUS,
    writes_public_data: true
  }
}

function countBy(rows, getKey) {
  const out = {}
  for (const row of rows) countInto(out, getKey(row))
  return out
}

function gradeKey(record) {
  const grade = String(record.grade || '').trim()
  if (grade) return grade
  const band = String(record.grade_band || '').trim()
  const range = String(record.grade_range || '').trim()
  return band && range ? `${band}:${range}` : (band || range || 'missing')
}

function refreshPayload(payload, standards, publishedAt) {
  payload.generated_at = publishedAt
  payload.record_count = standards.length
  payload.standards = standards
  payload.columns = [...new Set(standards.flatMap(record => Object.keys(record)))].sort((a, b) => a.localeCompare(b))
  payload.data_scope = 'h4g_standard_enrichment_full_batch_publication'
  payload.h4g_standard_enrichment_publication_contract_version = CONTRACT_VERSION
  payload.h4g_standard_enrichment_publication_published_at = publishedAt
  payload.h4g_standard_enrichment_publication_status = RELEASE_STATUS
  payload.publication_candidate = false
  payload.writes_public_data = true
  payload.indexes = {
    ...(payload.indexes || {}),
    domains: countBy(standards, row => row.domain),
    evidence_granularities: countBy(standards, row => row.evidence_granularity),
    grade_assignment_types: countBy(standards, row => row.grade_assignment_type),
    grade_bands: countBy(standards, row => row.grade_band),
    grades: countBy(standards, gradeKey),
    progression_basis: countBy(standards, row => row.progression_basis),
    review_statuses: countBy(standards, row => row.review_status),
    standard_variant_types: countBy(standards, row => row.standard_variant_type),
    ts_primary: countBy(standards, row => (row.ts_primary || [])[0])
  }
}

function readCandidatePayloads(root, errors) {
  const payloads = new Map()
  if (!existsSync(root)) {
    errors.push(`Missing candidate root: ${root}`)
    return payloads
  }
  for (const file of subjectFiles(root)) {
    payloads.set(basename(file, '.json'), readJson(file))
  }
  if (!payloads.size) errors.push(`Candidate root has no subject payloads: ${root}`)
  return payloads
}

function validatePreconditions(args, errors) {
  if (!existsSync(args.publicDataRoot)) errors.push(`Missing public data root: ${args.publicDataRoot}`)
  if (!existsSync(args.candidateRoot)) errors.push(`Missing candidate root: ${args.candidateRoot}`)
  if (!existsSync(args.publicationAudit)) errors.push(`Missing publication audit: ${args.publicationAudit}`)
  if (!existsSync(args.reviewSurface)) errors.push(`Missing review surface: ${args.reviewSurface}`)
  if (resolve(args.publicDataRoot) === resolve(args.candidateRoot)) errors.push('candidate root cannot equal public data root')
  if (args.write && !args.confirm) errors.push('--write requires --confirm-h4g-standard-enrichment-publication')

  if (existsSync(args.publicationAudit)) {
    const audit = readJson(args.publicationAudit)
    if (audit.valid !== true) errors.push('publication candidate audit must be valid before publish')
    if (audit.writes_public_data !== false) errors.push('publication candidate audit must be pre-publication writes_public_data=false')
    if (audit.summary?.candidate_h4g_records !== 1170) errors.push('publication candidate audit must report 1170 H4G records')
    if (audit.summary?.non_h4g_changed_records !== 0) errors.push('publication candidate audit must report non_h4g_changed_records=0')
    if (audit.summary?.progression_groups !== 390) errors.push('publication candidate audit must report 390 progression groups')
  }

  if (existsSync(args.reviewSurface)) {
    const surface = readJson(args.reviewSurface)
    if (surface.valid !== true) errors.push('review surface must be valid before publish')
    if (surface.writes_public_data !== false) errors.push('review surface must be pre-publication writes_public_data=false')
    if (surface.summary?.candidate_h4g_records !== 1170) errors.push('review surface must report 1170 H4G records')
  }
}

function backupPath(args, publishedAt) {
  return `${args.backupDir}/public_data_before_h4g_standard_enrichment_${publishedAt.replace(/[:.]/g, '-')}`
}

function buildMarkdown(summary) {
  return `# H4G Standard Enrichment Publication Release Summary

Generated at: ${summary.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${summary.valid} |
| mode | ${summary.mode} |
| write requested | ${summary.write_requested} |
| public data root | ${markdownCell(summary.public_data_root)} |
| candidate root | ${markdownCell(summary.candidate_root)} |
| backup root | ${markdownCell(summary.backup_root || 'not created')} |
| published H4G records | ${summary.totals.published_h4g_records} |
| progression groups | ${summary.totals.progression_groups} |
| total candidate records | ${summary.totals.total_candidate_records} |
| changed subject files | ${summary.totals.changed_subject_files} |
| errors | ${summary.errors.length} |
| warnings | ${summary.warnings.length} |

## Subject Counts

| Subject | Records | H4G Records |
| --- | ---: | ---: |
${summary.subjects.map(row => `| ${markdownCell(row.subject_slug)} | ${row.records} | ${row.h4g_records} |`).join('\n')}

## Review Status

| Status | Count |
| --- | ---: |
${countRows(summary.totals.by_review_status)}

## Errors

${summary.errors.length ? summary.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}

## Warnings

${summary.warnings.length ? summary.warnings.map(warning => `- ${markdownCell(warning)}`).join('\n') : '- none'}
`
}

function publish(args) {
  const errors = []
  const warnings = []
  const publishedAt = new Date().toISOString()
  validatePreconditions(args, errors)
  const payloads = readCandidatePayloads(args.candidateRoot, errors)
  const subjects = []
  const byReviewStatus = {}
  let h4gRecords = []
  let totalRecords = 0

  for (const [subjectSlug, payload] of payloads) {
    const nextStandards = (payload.standards || []).map(record => releaseRecord(record, publishedAt))
    const nextPayload = { ...payload, standards: nextStandards }
    refreshPayload(nextPayload, nextStandards, publishedAt)
    payloads.set(subjectSlug, nextPayload)
    const h4g = nextStandards.filter(isH4G)
    h4gRecords = h4gRecords.concat(h4g)
    totalRecords += nextStandards.length
    for (const record of h4g) countInto(byReviewStatus, record.review_status)
    subjects.push({
      h4g_records: h4g.length,
      records: nextStandards.length,
      subject_slug: subjectSlug
    })
  }

  const groups = recordsByGroup(h4gRecords)
  if (h4gRecords.length !== 1170) errors.push(`published H4G records must be 1170, found ${h4gRecords.length}`)
  if (groups.size !== 390) errors.push(`published progression groups must be 390, found ${groups.size}`)

  const backupRoot = args.write && errors.length === 0 ? backupPath(args, publishedAt) : ''
  if (args.write && errors.length === 0) {
    mkdirSync(dirname(backupRoot), { recursive: true })
    cpSync(args.publicDataRoot, backupRoot, { recursive: true })
    cpSync(args.candidateRoot, args.publicDataRoot, { recursive: true })
    for (const [subjectSlug, payload] of payloads) {
      writeJson(`${args.publicDataRoot}/by_subject/${subjectSlug}.json`, payload)
    }
  }

  if (!args.write) warnings.push('dry run only: pass --write --confirm-h4g-standard-enrichment-publication to publish')

  return {
    backup_root: backupRoot,
    candidate_root: args.candidateRoot,
    errors,
    generated_at: publishedAt,
    mode: args.write ? 'write_public_data' : 'dry_run',
    public_data_root: args.publicDataRoot,
    purpose: 'h4g_standard_enrichment_publication_release',
    subjects,
    totals: {
      by_review_status: byReviewStatus,
      changed_subject_files: subjects.length,
      progression_groups: groups.size,
      published_h4g_records: h4gRecords.length,
      total_candidate_records: totalRecords
    },
    valid: errors.length === 0,
    warnings,
    write_requested: args.write,
    writes_public_data: Boolean(args.write && errors.length === 0)
  }
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const summary = publish(args)
writeJson(args.summaryOut, summary)
if (args.summaryMd) writeText(args.summaryMd, buildMarkdown(summary))

console.log(JSON.stringify(stable({
  backup_root: summary.backup_root,
  mode: summary.mode,
  progression_groups: summary.totals.progression_groups,
  published_h4g_records: summary.totals.published_h4g_records,
  total_candidate_records: summary.totals.total_candidate_records,
  valid: summary.valid,
  warnings: summary.warnings.length,
  writes_public_data: summary.writes_public_data
}), null, 2))

if (args.strict && !summary.valid) {
  console.error(summary.errors.join('\n'))
  process.exit(1)
}
