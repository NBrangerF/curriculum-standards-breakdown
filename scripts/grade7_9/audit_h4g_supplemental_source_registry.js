#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_REGISTRY = 'generated/h4g_supplemental_sources/source_registry.json'
const DEFAULT_AUTHORITY_MAP = 'generated/h4g_supplemental_sources/source_authority_map.json'
const DEFAULT_SUBJECT_INDEX = 'generated/h4g_supplemental_sources/source_index_by_subject.json'
const DEFAULT_OUT = 'generated/h4g_supplemental_sources/source_registry_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/h4g_supplemental_sources/source_registry_audit.md'

const SUBJECTS = {
  arts: '艺术',
  chinese: '语文',
  english: '英语',
  it: '信息科技',
  labor: '劳动',
  math: '数学',
  morality_law: '道德与法治',
  pe: '体育',
  science: '科学'
}
const REQUIRED_SOURCE_FIELDS = [
  'source_id',
  'title',
  'source_type',
  'source_tier',
  'authority_level',
  'authority_score',
  'subject_coverage',
  'allowed_use',
  'disallowed_use',
  'license_status',
  'url'
]
const ALLOWED_TIERS = new Set(['P0', 'P1', 'P2', 'P3'])

function parseArgs(argv) {
  const args = {
    authorityMap: DEFAULT_AUTHORITY_MAP,
    out: DEFAULT_OUT,
    registry: DEFAULT_REGISTRY,
    requireUrlValidation: false,
    strict: false,
    subjectIndex: DEFAULT_SUBJECT_INDEX,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--authority-map') args.authorityMap = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--registry') args.registry = argv[++i]
    else if (item === '--subject-index') args.subjectIndex = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--require-url-validation') args.requireUrlValidation = true
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/audit_h4g_supplemental_source_registry.js \\
  --strict --require-url-validation

Audits the Gate 0 H4G supplemental source registry. This audit verifies source
metadata, authority maps, subject indexes, and no-public-write constraints.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function sorted(values) {
  return [...new Set((values || []).filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b))
}

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

function groupedEntry(sourceIds) {
  const ids = sorted(sourceIds)
  return {
    count: ids.length,
    source_ids: ids
  }
}

function groupedMap(groups) {
  return Object.fromEntries(
    Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, sourceIds]) => [key, groupedEntry(sourceIds)])
  )
}

function sameJson(left, right) {
  return JSON.stringify(stable(left || {})) === JSON.stringify(stable(right || {}))
}

function expectedAuthorityMap(registry) {
  const byAuthorityLevel = {}
  const bySourceType = {}
  const bySourceTier = {}
  const byAllowedUse = {}
  const byDisallowedUse = {}
  for (const item of registry) {
    push(byAuthorityLevel, item.authority_level, item.source_id)
    push(bySourceType, item.source_type, item.source_id)
    push(bySourceTier, item.source_tier, item.source_id)
    for (const allowed of item.allowed_use || []) push(byAllowedUse, allowed, item.source_id)
    for (const disallowed of item.disallowed_use || []) push(byDisallowedUse, disallowed, item.source_id)
  }
  return {
    by_allowed_use: groupedMap(byAllowedUse),
    by_authority_level: groupedMap(byAuthorityLevel),
    by_disallowed_use: groupedMap(byDisallowedUse),
    by_source_tier: groupedMap(bySourceTier),
    by_source_type: groupedMap(bySourceType)
  }
}

function expectedSubjectIndex(registry) {
  const subjects = {}
  for (const [subjectSlug, subjectName] of Object.entries(SUBJECTS)) {
    const subjectSources = registry.filter(item => (item.subject_coverage || []).includes(subjectSlug))
    const byAuthorityLevel = {}
    const bySourceTier = {}
    const bySourceType = {}
    const byAllowedUse = {}
    for (const item of subjectSources) {
      push(byAuthorityLevel, item.authority_level, item.source_id)
      push(bySourceTier, item.source_tier, item.source_id)
      push(bySourceType, item.source_type, item.source_id)
      for (const allowed of item.allowed_use || []) push(byAllowedUse, allowed, item.source_id)
    }
    const p0p1 = subjectSources.filter(item => ['P0', 'P1'].includes(item.source_tier)).map(item => item.source_id)
    subjects[subjectSlug] = {
      by_allowed_use: groupedMap(byAllowedUse),
      by_authority_level: groupedMap(byAuthorityLevel),
      by_source_tier: groupedMap(bySourceTier),
      by_source_type: groupedMap(bySourceType),
      coverage_gaps: p0p1.length ? [] : ['missing_p0_p1_source'],
      p0_p1_source_ids: sorted(p0p1),
      source_ids: sorted(subjectSources.map(item => item.source_id)),
      subject: subjectName,
      subject_slug: subjectSlug,
      total_sources: subjectSources.length
    }
  }
  return subjects
}

function push(target, key, value) {
  const normalized = key || 'missing'
  if (!target[normalized]) target[normalized] = []
  target[normalized].push(value)
}

function audit(args) {
  const errors = []
  const warnings = []
  const registryPayload = readJson(args.registry)
  const authorityMap = readJson(args.authorityMap)
  const subjectIndex = readJson(args.subjectIndex)
  const registry = Array.isArray(registryPayload.registry) ? registryPayload.registry : []
  if (!Array.isArray(registryPayload.registry)) errors.push('source_registry.registry must be an array')
  if (registryPayload.writes_public_data !== false) errors.push('source_registry writes_public_data must be false')
  if (registryPayload.changes_official_standard_text !== false) errors.push('source_registry changes_official_standard_text must be false')
  if (registryPayload.direct_matcher_use !== false) errors.push('source_registry direct_matcher_use must be false')
  if (registryPayload.purpose !== 'h4g_supplemental_source_registry') errors.push('source_registry purpose mismatch')

  const sourceIds = new Set()
  const byAuthorityLevel = {}
  const bySourceTier = {}
  const bySourceType = {}
  const bySubject = {}
  const byUrlValidationStatus = {}

  for (const item of registry) {
    for (const field of REQUIRED_SOURCE_FIELDS) {
      if (item[field] === undefined || item[field] === null || item[field] === '') {
        errors.push(`${item.source_id || 'unknown_source'} missing ${field}`)
      }
    }
    if (sourceIds.has(item.source_id)) errors.push(`duplicate source_id: ${item.source_id}`)
    sourceIds.add(item.source_id)
    if (!ALLOWED_TIERS.has(item.source_tier)) errors.push(`${item.source_id} unknown source_tier: ${item.source_tier}`)
    if (Number(item.authority_score) < 0.6) errors.push(`${item.source_id} authority_score below Gate 0 threshold`)
    if (!Array.isArray(item.subject_coverage) || !item.subject_coverage.length) errors.push(`${item.source_id} subject_coverage must be non-empty`)
    if (!Array.isArray(item.allowed_use) || !item.allowed_use.length) errors.push(`${item.source_id} allowed_use must be non-empty`)
    if (!Array.isArray(item.disallowed_use) || !item.disallowed_use.length) errors.push(`${item.source_id} disallowed_use must be non-empty`)
    if (!item.disallowed_use?.includes('direct_grade_assignment')) errors.push(`${item.source_id} missing direct_grade_assignment disallowed_use`)
    if (!item.disallowed_use?.includes('public_standard_text_rewrite')) errors.push(`${item.source_id} missing public_standard_text_rewrite disallowed_use`)
    if (item.writes_public_data !== false) errors.push(`${item.source_id} writes_public_data must be false`)
    if (item.changes_official_standard_text !== false) errors.push(`${item.source_id} changes_official_standard_text must be false`)
    if (item.direct_matcher_use !== false) errors.push(`${item.source_id} direct_matcher_use must be false`)
    if (item.evidence_extraction_allowed_in_gate0 !== false) errors.push(`${item.source_id} evidence_extraction_allowed_in_gate0 must be false`)
    if (args.requireUrlValidation && item.url_validation?.ok !== true) {
      errors.push(`${item.source_id} URL validation is required and failed or missing`)
    }
    if (!args.requireUrlValidation && item.url_validation?.status === 'not_checked') {
      warnings.push(`${item.source_id} URL validation not required for this audit`)
    }
    countInto(byAuthorityLevel, item.authority_level)
    countInto(bySourceTier, item.source_tier)
    countInto(bySourceType, item.source_type)
    countInto(byUrlValidationStatus, item.url_validation?.status || 'missing')
    for (const subject of item.subject_coverage || []) {
      if (!SUBJECTS[subject]) errors.push(`${item.source_id} unknown subject_coverage: ${subject}`)
      else countInto(bySubject, subject)
    }
  }

  const expectedAuthority = expectedAuthorityMap(registry)
  for (const key of ['by_allowed_use', 'by_authority_level', 'by_disallowed_use', 'by_source_tier', 'by_source_type']) {
    if (!sameJson(authorityMap[key], expectedAuthority[key])) errors.push(`source_authority_map.${key} mismatch`)
  }

  const expectedSubjects = expectedSubjectIndex(registry)
  if (!sameJson(subjectIndex.subjects, expectedSubjects)) errors.push('source_index_by_subject.subjects mismatch')
  for (const subjectSlug of Object.keys(SUBJECTS)) {
    const subject = expectedSubjects[subjectSlug]
    if (!subject.p0_p1_source_ids.length) errors.push(`${subjectSlug} missing P0/P1 source coverage`)
  }

  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    purpose: 'h4g_supplemental_source_registry_audit',
    source_inputs: {
      authority_map: args.authorityMap,
      registry: args.registry,
      require_url_validation: args.requireUrlValidation,
      subject_index: args.subjectIndex
    },
    summary: {
      by_authority_level: byAuthorityLevel,
      by_source_tier: bySourceTier,
      by_source_type: bySourceType,
      by_subject: bySubject,
      by_url_validation_status: byUrlValidationStatus,
      official_or_framework_sources: registry.length,
      sources_passing_gate0_authority_threshold: registry.filter(item => item.authority_score >= 0.6).length,
      subjects: Object.keys(SUBJECTS).length
    },
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }
}

function markdownSummary(payload) {
  return `# H4G Supplemental Source Registry Audit

Generated at: ${payload.generated_at}

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| sources | ${payload.summary.official_or_framework_sources} |
| subjects | ${payload.summary.subjects} |
| writes public data | ${payload.writes_public_data} |
| changes official standard text | ${payload.changes_official_standard_text} |
| direct matcher use | ${payload.direct_matcher_use} |

## Source Tiers

| tier | count |
| --- | ---: |
${countRows(payload.summary.by_source_tier)}

## URL Validation

| status | count |
| --- | ---: |
${countRows(payload.summary.by_url_validation_status)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}

## Warnings

${payload.warnings.length ? payload.warnings.map(warning => `- ${markdownCell(warning)}`).join('\n') : '- none'}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const payload = audit(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(payload, null, 2))
  if (args.strict && !payload.valid) process.exit(1)
}

main()
