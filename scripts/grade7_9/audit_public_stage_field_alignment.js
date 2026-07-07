#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  readJson,
  TARGET_GRADE_SET,
  writeJson,
  writeText
} from './h4g_supplemental_pipeline_utils.js'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUT = 'generated/h4g_source_aligned_standard_rewrite_v2/public_stage_field_alignment_audit.json'
const DEFAULT_MD_OUT = 'docs/H1_H3_H4G_PUBLIC_FIELD_ALIGNMENT_REVIEW.md'

const PRIMARY_BANDS = new Set(['H1', 'H2', 'H3'])
const ALL_TARGET_BANDS = new Set(['H1', 'H2', 'H3', 'H4G7', 'H4G8', 'H4G9'])
const REQUIRED_PUBLIC_FIELDS = [
  'code',
  'display_subcategory',
  'domain',
  'grade_band',
  'grade_range',
  'public_record_group',
  'review_status',
  'source_aligned_rewrite_status',
  'source_grade_band',
  'source_grade_range',
  'stage_band',
  'standard',
  'standard_title',
  'subject',
  'subject_slug'
]

function parseArgs(argv) {
  const args = {
    dataRoot: DEFAULT_DATA_ROOT,
    out: DEFAULT_OUT,
    mdOut: DEFAULT_MD_OUT,
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--md-out') args.mdOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/audit_public_stage_field_alignment.js --strict

Audits public-facing field alignment between H1-H3 and H4G standards.`)
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function nonEmpty(record, field) {
  const value = record[field]
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === 'object') return Object.keys(value).length > 0
  return clean(value) !== ''
}

function loadRecords(dataRoot, errors) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) {
    errors.push(`Missing by_subject directory: ${dir}`)
    return []
  }
  const rows = []
  for (const file of readdirSync(dir).filter(item => item.endsWith('.json')).sort((a, b) => a.localeCompare(b))) {
    const payload = readJson(join(dir, file))
    for (const record of payload.standards || []) {
      if (!ALL_TARGET_BANDS.has(record.grade_band)) continue
      rows.push({
        ...record,
        _file: file,
        _subject: payload.subject || record.subject,
        _subject_slug: payload.subject_slug || record.subject_slug || file.replace('.json', '')
      })
    }
  }
  return rows
}

function countBy(rows, fn) {
  const counts = {}
  for (const row of rows) {
    const key = fn(row) || 'missing'
    counts[key] = (counts[key] || 0) + 1
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
}

function bandProfile(rows) {
  const profile = {}
  for (const band of ['H1', 'H2', 'H3', 'H4G7', 'H4G8', 'H4G9']) {
    const bandRows = rows.filter(row => row.grade_band === band)
    if (!bandRows.length) continue
    profile[band] = {
      domains: countBy(bandRows, row => row.domain),
      missing_display_subcategory: bandRows.filter(row => !nonEmpty(row, 'display_subcategory')).length,
      missing_standard_title: bandRows.filter(row => !nonEmpty(row, 'standard_title')).length,
      records: bandRows.length
    }
  }
  return profile
}

function audit(args) {
  const errors = []
  const warnings = []
  const rows = loadRecords(args.dataRoot, errors)
  const primaryRows = rows.filter(row => PRIMARY_BANDS.has(row.grade_band))
  const h4gRows = rows.filter(row => TARGET_GRADE_SET.has(row.grade_band))

  for (const row of rows) {
    for (const field of REQUIRED_PUBLIC_FIELDS) {
      if (!nonEmpty(row, field)) errors.push(`${row.code}: missing required public field ${field}`)
    }
  }

  for (const row of primaryRows) {
    if (row.public_record_group !== 'primary_stage_standard') {
      errors.push(`${row.code}: primary public_record_group expected primary_stage_standard`)
    }
    if (row.source_aligned_rewrite_status !== 'not_applicable_primary_stage') {
      errors.push(`${row.code}: primary source_aligned_rewrite_status expected not_applicable_primary_stage`)
    }
    if (row.review_status !== 'primary_stage_public_standard_published') {
      errors.push(`${row.code}: primary review_status expected primary_stage_public_standard_published`)
    }
  }

  for (const row of h4gRows) {
    if (row.public_record_group !== 'h4g_source_aligned_grade_standard') {
      errors.push(`${row.code}: H4G public_record_group expected h4g_source_aligned_grade_standard`)
    }
    if (row.source_aligned_rewrite_status !== 'v2_published_to_public_preview') {
      errors.push(`${row.code}: H4G source_aligned_rewrite_status expected v2_published_to_public_preview`)
    }
    if (row.review_status !== 'source_aligned_standard_rewrite_v2_published') {
      errors.push(`${row.code}: H4G review_status expected source_aligned_standard_rewrite_v2_published`)
    }
  }

  const bySubject = {}
  for (const subjectSlug of [...new Set(rows.map(row => row.subject_slug || row._subject_slug))].sort((a, b) => a.localeCompare(b))) {
    const subjectRows = rows.filter(row => (row.subject_slug || row._subject_slug) === subjectSlug)
    bySubject[subjectSlug] = bandProfile(subjectRows)

    const primaryDomains = new Set(subjectRows.filter(row => PRIMARY_BANDS.has(row.grade_band)).map(row => row.domain).filter(Boolean))
    const h4gDomains = new Set(subjectRows.filter(row => TARGET_GRADE_SET.has(row.grade_band)).map(row => row.domain).filter(Boolean))
    const outside = [...h4gDomains].filter(domain => !primaryDomains.has(domain))
    if (outside.length) {
      warnings.push(`${subjectSlug}: H4G domains not present in H1-H3 domain set: ${outside.join(', ')}`)
    }
  }

  const enforcedDomainAlignedSubjects = ['morality_law', 'pe']
  for (const subjectSlug of enforcedDomainAlignedSubjects) {
    const subjectRows = rows.filter(row => (row.subject_slug || row._subject_slug) === subjectSlug)
    const primaryDomains = new Set(subjectRows.filter(row => PRIMARY_BANDS.has(row.grade_band)).map(row => row.domain).filter(Boolean))
    const outside = [...new Set(subjectRows.filter(row => TARGET_GRADE_SET.has(row.grade_band)).map(row => row.domain).filter(Boolean))]
      .filter(domain => !primaryDomains.has(domain))
    if (outside.length) errors.push(`${subjectSlug}: enforced H4G domain alignment failed: ${outside.join(', ')}`)
  }

  const summary = {
    h4g_records: h4gRows.length,
    primary_records: primaryRows.length,
    required_public_fields: REQUIRED_PUBLIC_FIELDS,
    total_records: rows.length
  }

  const result = {
    by_subject: bySubject,
    errors,
    generated_at: new Date().toISOString(),
    summary,
    valid: errors.length === 0,
    warnings
  }
  return result
}

function markdown(result) {
  const lines = [
    '# H1-H3 与 H4G Public 字段对齐 Review',
    '',
    `Generated at: ${result.generated_at}`,
    '',
    '## Summary',
    '',
    `- Total records: ${result.summary.total_records}`,
    `- H1-H3 records: ${result.summary.primary_records}`,
    `- H4G records: ${result.summary.h4g_records}`,
    `- Required public fields: ${result.summary.required_public_fields.join(', ')}`,
    `- Valid: ${result.valid}`,
    `- Errors: ${result.errors.length}`,
    `- Warnings: ${result.warnings.length}`,
    '',
    '## Findings',
    '',
    result.errors.length ? result.errors.map(item => `- ERROR: ${item}`).join('\n') : '- No blocking errors.',
    '',
    result.warnings.length ? result.warnings.map(item => `- WARNING: ${item}`).join('\n') : '- No warnings.',
    '',
    '## Subject Profiles',
    ''
  ]

  for (const [subjectSlug, bands] of Object.entries(result.by_subject)) {
    lines.push(`### ${subjectSlug}`, '')
    for (const [band, profile] of Object.entries(bands)) {
      lines.push(`- ${band}: ${profile.records} records; missing display=${profile.missing_display_subcategory}; missing title=${profile.missing_standard_title}; domains=${Object.keys(profile.domains).join(' / ')}`)
    }
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const result = audit(args)
mkdirSync(dirname(args.out), { recursive: true })
writeJson(args.out, result)
if (args.mdOut) {
  mkdirSync(dirname(args.mdOut), { recursive: true })
  writeText(args.mdOut, markdown(result))
}

console.log(JSON.stringify({
  errors: result.errors.length,
  h4g_records: result.summary.h4g_records,
  primary_records: result.summary.primary_records,
  valid: result.valid,
  warnings: result.warnings.length
}, null, 2))

if (!result.valid && args.strict) process.exitCode = 1
