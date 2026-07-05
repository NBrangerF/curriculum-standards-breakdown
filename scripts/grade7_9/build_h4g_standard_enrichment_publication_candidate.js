#!/usr/bin/env node
import { cpSync, existsSync, rmSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import {
  TARGET_GRADE_BANDS,
  countInto,
  countRows,
  hashJson,
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
const DEFAULT_ENRICHMENT_AUDIT = 'generated/h4g_standard_enrichment/standard_enrichment_audit.json'
const DEFAULT_OUT_ROOT = 'generated/h4g_standard_enrichment_publication/data_candidate'
const DEFAULT_SUMMARY_OUT = 'generated/h4g_standard_enrichment_publication/publication_apply_summary.json'
const DEFAULT_SUMMARY_MD = 'generated/h4g_standard_enrichment_publication/publication_apply_summary.md'

function parseArgs(argv) {
  const args = {
    clean: false,
    enrichmentAudit: DEFAULT_ENRICHMENT_AUDIT,
    enrichmentRoot: DEFAULT_ENRICHMENT_ROOT,
    outRoot: DEFAULT_OUT_ROOT,
    publicDataRoot: DEFAULT_PUBLIC_DATA_ROOT,
    strict: false,
    summaryMd: DEFAULT_SUMMARY_MD,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--clean') args.clean = true
    else if (item === '--enrichment-audit') args.enrichmentAudit = argv[++i]
    else if (item === '--enrichment-root') args.enrichmentRoot = argv[++i]
    else if (item === '--out-root') args.outRoot = argv[++i]
    else if (item === '--public-data-root') args.publicDataRoot = argv[++i]
    else if (item === '--summary-md') args.summaryMd = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
npm run grade7_9:h4g-standard-enrichment-publication-candidate -- --strict --clean

Builds an isolated dry-run public apply candidate root from public/data and
generated/h4g_standard_enrichment/data_candidate. It never writes public/data.`)
}

function isH4G(record) {
  return TARGET_GRADE_BANDS.includes(record.grade_band)
}

function gradeKey(record) {
  const grade = String(record.grade || '').trim()
  if (grade) return grade
  const band = String(record.grade_band || '').trim()
  const range = String(record.grade_range || '').trim()
  return band && range ? `${band}:${range}` : (band || range || 'missing')
}

function countBy(rows, fn) {
  const out = {}
  for (const row of rows) countInto(out, fn(row))
  return out
}

function refreshPayload(payload, standards, contractVersion) {
  payload.generated_at = new Date().toISOString()
  payload.record_count = standards.length
  payload.standards = standards
  payload.columns = [...new Set(standards.flatMap(record => Object.keys(record)))].sort((a, b) => a.localeCompare(b))
  payload.data_scope = 'h4g_standard_enrichment_publication_candidate'
  payload.h4g_standard_enrichment_publication_contract_version = contractVersion
  payload.publication_candidate = true
  payload.writes_public_data = false
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

function readPayloads(root) {
  const payloads = new Map()
  for (const file of subjectFiles(root)) {
    payloads.set(basename(file, '.json'), readJson(file))
  }
  return payloads
}

function byCode(records) {
  return new Map(records.filter(record => record.code).map(record => [record.code, record]))
}

function sortStandards(records) {
  return [...records].sort((a, b) => {
    const band = String(a.grade_band || '').localeCompare(String(b.grade_band || ''))
    if (band) return band
    return String(a.code || '').localeCompare(String(b.code || ''))
  })
}

function validateInputs(args, errors) {
  if (!existsSync(args.publicDataRoot)) errors.push(`Missing public data root: ${args.publicDataRoot}`)
  if (!existsSync(args.enrichmentRoot)) errors.push(`Missing enrichment root: ${args.enrichmentRoot}`)
  if (!existsSync(args.enrichmentAudit)) errors.push(`Missing enrichment audit: ${args.enrichmentAudit}`)
  if (resolve(args.outRoot) === resolve(args.publicDataRoot)) errors.push('out-root cannot be public data root')
  if (existsSync(args.enrichmentAudit)) {
    const audit = readJson(args.enrichmentAudit)
    if (audit.valid !== true) errors.push('enrichment audit must be valid before publication candidate apply')
    if (audit.writes_public_data !== false) errors.push('enrichment audit writes_public_data must be false')
    if (audit.summary?.h4g_records !== 1170) errors.push('enrichment audit must report 1170 H4G records')
    if (audit.summary?.progression_groups !== 390) errors.push('enrichment audit must report 390 progression groups')
  }
}

function buildMarkdown(summary) {
  return `# H4G Standard Enrichment Publication Apply Summary

Generated at: ${summary.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${summary.valid} |
| public H4G records | ${summary.totals.public_h4g_records} |
| candidate H4G records | ${summary.totals.candidate_h4g_records} |
| existing H4G records replaced | ${summary.totals.existing_h4g_records_replaced} |
| new H4G records added | ${summary.totals.new_h4g_records_added} |
| progression groups | ${summary.totals.progression_groups} |
| errors | ${summary.errors.length} |
| warnings | ${summary.warnings.length} |
| writes public data | ${summary.writes_public_data} |

## Subjects

| Subject | Public H4G | Candidate H4G | Existing Replaced | New Added |
| --- | ---: | ---: | ---: | ---: |
${summary.subjects.map(row => `| ${markdownCell(row.subject_slug)} | ${row.public_h4g_records} | ${row.candidate_h4g_records} | ${row.existing_h4g_records_replaced} | ${row.new_h4g_records_added} |`).join('\n')}

## Errors

${summary.errors.length ? summary.errors.map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}

## Warnings

${summary.warnings.length ? summary.warnings.map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}
`
}

function build(args) {
  const errors = []
  const warnings = []
  validateInputs(args, errors)
  if (errors.length) {
    const failed = {
      contract_version: CONTRACT_VERSION,
      errors,
      generated_at: new Date().toISOString(),
      purpose: 'h4g_standard_enrichment_publication_apply_summary',
      valid: false,
      warnings,
      writes_public_data: false
    }
    writeJson(args.summaryOut, failed)
    if (args.summaryMd) writeText(args.summaryMd, buildMarkdown({ ...failed, totals: {}, subjects: [] }))
    return failed
  }

  if (args.clean && existsSync(args.outRoot)) rmSync(args.outRoot, { recursive: true, force: true })
  cpSync(args.publicDataRoot, args.outRoot, { recursive: true })

  const publicPayloads = readPayloads(args.publicDataRoot)
  const enrichmentPayloads = readPayloads(args.enrichmentRoot)
  const subjects = []
  let publicH4GRecords = 0
  let candidateH4GRecords = 0
  let existingH4GRecordsReplaced = 0
  let newH4GRecordsAdded = 0

  for (const [subjectSlug, publicPayload] of publicPayloads) {
    const enrichmentPayload = enrichmentPayloads.get(subjectSlug)
    if (!enrichmentPayload) {
      errors.push(`${subjectSlug} missing from enrichment root`)
      continue
    }
    const publicRows = publicPayload.standards || []
    const enrichmentRows = enrichmentPayload.standards || []
    const publicH4G = publicRows.filter(isH4G)
    const publicH4GByCode = byCode(publicH4G)
    const enrichmentH4G = enrichmentRows.filter(isH4G)
    const nonH4G = publicRows.filter(record => !isH4G(record))
    const existingReplaced = enrichmentH4G.filter(record => publicH4GByCode.has(record.code)).length
    const newAdded = enrichmentH4G.filter(record => !publicH4GByCode.has(record.code)).length

    for (const record of enrichmentH4G) {
      if (record.standard_enrichment_contract_version !== ENRICHMENT_VERSION) errors.push(`${record.code} missing enrichment contract version`)
      if (record.writes_public_data !== false) errors.push(`${record.code} writes_public_data must be false`)
      if (normalizeText(record.standard) === normalizeText(record.source_standard_original)) errors.push(`${record.code} standard equals source_standard_original`)
    }

    const nextStandards = sortStandards([...nonH4G, ...enrichmentH4G])
    const nextPayload = {
      ...publicPayload,
      standards: nextStandards
    }
    refreshPayload(nextPayload, nextStandards, CONTRACT_VERSION)
    writeJson(`${args.outRoot}/by_subject/${subjectSlug}.json`, nextPayload)

    publicH4GRecords += publicH4G.length
    candidateH4GRecords += enrichmentH4G.length
    existingH4GRecordsReplaced += existingReplaced
    newH4GRecordsAdded += newAdded
    subjects.push({
      candidate_h4g_records: enrichmentH4G.length,
      existing_h4g_records_replaced: existingReplaced,
      new_h4g_records_added: newAdded,
      public_h4g_records: publicH4G.length,
      subject_slug: subjectSlug
    })
  }

  const h4gRecords = [...enrichmentPayloads.values()].flatMap(payload => (payload.standards || []).filter(isH4G))
  const groups = recordsByGroup(h4gRecords)
  const summary = {
    candidate_data_root: args.outRoot,
    contract_version: CONTRACT_VERSION,
    direct_public_write: false,
    errors,
    generated_at: new Date().toISOString(),
    input_enrichment_root: args.enrichmentRoot,
    input_public_data_root: args.publicDataRoot,
    purpose: 'h4g_standard_enrichment_publication_apply_summary',
    requires_user_public_write_decision: true,
    subjects,
    totals: {
      candidate_h4g_records: candidateH4GRecords,
      existing_h4g_records_replaced: existingH4GRecordsReplaced,
      new_h4g_records_added: newH4GRecordsAdded,
      progression_groups: groups.size,
      public_h4g_records: publicH4GRecords,
      total_candidate_records_hash: hashJson(subjects)
    },
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }
  writeJson(args.summaryOut, summary)
  if (args.summaryMd) writeText(args.summaryMd, buildMarkdown(summary))
  return summary
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const summary = build(args)
console.log(JSON.stringify(stable({
  candidate_h4g_records: summary.totals?.candidate_h4g_records,
  existing_h4g_records_replaced: summary.totals?.existing_h4g_records_replaced,
  new_h4g_records_added: summary.totals?.new_h4g_records_added,
  progression_groups: summary.totals?.progression_groups,
  valid: summary.valid,
  warnings: summary.warnings.length,
  writes_public_data: summary.writes_public_data
}), null, 2))

if (args.strict && !summary.valid) {
  console.error(summary.errors.join('\n'))
  process.exit(1)
}
