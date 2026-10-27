#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_COVERAGE_AUDIT = 'generated/textbook_evidence/h4g_unit_evidence_candidate_coverage_audit.json'
const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_group_ready_candidate.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_group_ready_candidate.md'
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']
const OFFICIAL_STANDARD_FIELDS = [
  'domain',
  'subdomain',
  'standard',
  'context',
  'practice',
  'teaching_tip',
  'assessment_evidence_type'
]
const CURRENT_STATUS_FIELDS = [
  'grade_assignment_type',
  'progression_basis',
  'review_status',
  'standard_variant_type',
  'evidence_granularity',
  'requires_unit_level_evidence',
  'progression_delta'
]

function parseArgs(argv) {
  const args = {
    coverageAudit: DEFAULT_COVERAGE_AUDIT,
    dataRoot: DEFAULT_DATA_ROOT,
    out: DEFAULT_OUT,
    progressionGroups: [],
    requireCandidates: false,
    strict: false,
    subjects: [],
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--coverage-audit') args.coverageAudit = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subjects') args.subjects = splitArg(argv[++i])
    else if (item === '--progression-groups') args.progressionGroups = splitArg(argv[++i])
    else if (item === '--strict') args.strict = true
    else if (item === '--require-candidates') args.requireCandidates = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_unit_evidence_group_ready_candidate.js \\
  --strict --require-candidates

Builds a review-only H4G unit-evidence candidate pack for progression groups
whose coverage audit already shows every H4G7/H4G8/H4G9 record is ready or
already public at unit level. The output never writes public/data, never
changes official standard text, and keeps proposed records pending review.`)
}

function splitArg(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

function hashText(value, length = 14) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
}

function sorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== '').map(String))]
    .sort((a, b) => a.localeCompare(b))
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function markdownCell(value) {
  return normalizeText(value).replace(/\|/g, '\\|')
}

function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

function hasPositivePageStart(unit) {
  const page = Number(unit?.page_start)
  return Number.isInteger(page) && page > 0
}

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function loadStandardsByCode(dataRoot, errors) {
  const byCode = new Map()
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) {
    errors.push(`Missing data root by_subject: ${dir}`)
    return byCode
  }
  for (const file of subjectFiles(dataRoot)) {
    const subjectSlug = basename(file, '.json')
    const payload = readJson(file)
    for (const record of payload.standards || []) {
      if (!record.code) continue
      byCode.set(record.code, {
        ...record,
        subject_slug: record.subject_slug || subjectSlug,
        subject: record.subject || payload.subject || subjectSlug
      })
    }
  }
  return byCode
}

function validateCoverageAudit(coverage, errors) {
  if (coverage.valid !== true) errors.push('coverage audit valid must be true')
  if (coverage.purpose !== 'h4g_unit_evidence_candidate_coverage_audit') errors.push('coverage audit purpose mismatch')
  if (coverage.writes_public_data !== false) errors.push('coverage audit writes_public_data must be false')
  if (coverage.changes_official_standard_text !== false) errors.push('coverage audit changes_official_standard_text must be false')
  if (coverage.direct_matcher_use !== false) errors.push('coverage audit direct_matcher_use must be false')
  if (coverage.publication_ready !== false) errors.push('coverage audit publication_ready must be false')
}

function candidateFilePolicyErrors(payload, path) {
  const errors = []
  if (payload.valid === false) errors.push(`${path} is marked valid=false`)
  if (payload.policy?.writes_public_data !== false) errors.push(`${path} policy.writes_public_data must be false`)
  if (payload.policy?.official_standard_text_changed !== false) errors.push(`${path} policy.official_standard_text_changed must be false`)
  return errors
}

function loadSourceUnits(paths, errors, warnings) {
  const byStandardSourceUnit = new Map()
  const byStandardUnit = new Map()
  const sources = []
  for (const path of paths) {
    if (!existsSync(path)) {
      warnings.push(`Missing source candidate file: ${path}`)
      continue
    }
    const payload = readJson(path)
    errors.push(...candidateFilePolicyErrors(payload, path))
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
    sources.push({
      candidates: candidates.length,
      generated_at: payload.generated_at || '',
      path,
      unit_evidence_objects: candidates.reduce((sum, candidate) => sum + (candidate.unit_evidence || []).length, 0),
      valid: payload.valid !== false
    })
    for (const candidate of candidates) {
      for (const unit of candidate.unit_evidence || []) {
        if (!candidate.standard_code || !unit.unit_evidence_id) continue
        const sourceKey = `${candidate.standard_code}|${path}|${unit.unit_evidence_id}`
        const fallbackKey = `${candidate.standard_code}|${unit.unit_evidence_id}`
        const indexed = { candidate, path, unit }
        byStandardSourceUnit.set(sourceKey, indexed)
        if (!byStandardUnit.has(fallbackKey)) byStandardUnit.set(fallbackKey, indexed)
      }
    }
  }
  return { byStandardSourceUnit, byStandardUnit, sources }
}

function officialFields(record) {
  return Object.fromEntries(OFFICIAL_STANDARD_FIELDS.map(field => [field, record[field] ?? '']))
}

function currentRecordStatus(record) {
  return {
    ...Object.fromEntries(CURRENT_STATUS_FIELDS.map(field => [field, record[field] ?? ''])),
    textbook_unit_evidence_ids: record.textbook_unit_evidence_ids || []
  }
}

function unitFromIndexes(row, cleanUnit, sourceUnits, warnings) {
  const sourceKey = `${row.code}|${cleanUnit.source_file}|${cleanUnit.unit_evidence_id}`
  const fallbackKey = `${row.code}|${cleanUnit.unit_evidence_id}`
  const indexed = sourceUnits.byStandardSourceUnit.get(sourceKey) || sourceUnits.byStandardUnit.get(fallbackKey)
  if (!indexed) {
    warnings.push(`${row.code}/${cleanUnit.unit_evidence_id} not found in source candidate files; using coverage unit summary`)
    return { ...cleanUnit }
  }
  return { ...indexed.unit }
}

function dedupeUnits(row, sourceUnits, warnings) {
  const byId = new Map()
  for (const cleanUnit of row.clean_units || []) {
    const unit = unitFromIndexes(row, cleanUnit, sourceUnits, warnings)
    if (!unit.unit_evidence_id) {
      warnings.push(`${row.code} has clean unit without unit_evidence_id`)
      continue
    }
    if (byId.has(unit.unit_evidence_id)) continue
    byId.set(unit.unit_evidence_id, unit)
  }
  return [...byId.values()].sort((a, b) => {
    const edition = String(a.edition || '').localeCompare(String(b.edition || ''))
    if (edition !== 0) return edition
    const page = (Number(a.page_start) || Number.MAX_SAFE_INTEGER) - (Number(b.page_start) || Number.MAX_SAFE_INTEGER)
    if (page !== 0) return page
    return String(a.unit_title || '').localeCompare(String(b.unit_title || ''))
  })
}

function topKeywords(units, limit = 6) {
  const counts = new Map()
  for (const unit of units) {
    for (const keyword of unit.matched_keywords || []) {
      const text = normalizeText(keyword)
      if (text.length < 2) continue
      counts.set(text, (counts.get(text) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([keyword]) => keyword)
}

function topUnitLabels(units, limit = 4) {
  return units
    .slice()
    .sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.unit_title || '').localeCompare(String(b.unit_title || '')))
    .slice(0, limit)
    .map(unit => `${unit.edition || '未知版本'}《${unit.unit_title || '未命名单元'}》`)
}

function proposedFocus(record, units) {
  const editions = sorted(units.map(unit => unit.edition))
  const labels = topUnitLabels(units).join('、')
  const keywords = topKeywords(units)
  const keywordText = keywords.length ? `，重点关注“${keywords.join('”、“')}”等概念、方法或现象` : ''
  return `候选：${record.grade || record.grade_band}学习重点：围绕“${record.subdomain || record.domain || '本标准'}”，同年级${editions.length}个教材版本证据集中在${labels}等单元${keywordText}。课标原文保持不变。`
}

function proposedProgressionDelta(units) {
  const editions = sorted(units.map(unit => unit.edition)).join('、')
  const labels = topUnitLabels(units, 8).join('；')
  return `unit_evidence_candidate:group_ready:${editions}:${labels}`
}

function buildCandidate(row, record, units) {
  const unitIds = units.map(unit => unit.unit_evidence_id)
  const editions = sorted(units.map(unit => unit.edition))
  return {
    candidate_id: `h4g_unit_group_ready_${hashText(`${row.code}|${unitIds.join('|')}`)}`,
    coverage_status: row.coverage_status,
    current_record_status: currentRecordStatus(record),
    domain: record.domain || '',
    grade: record.grade || '',
    grade_band: record.grade_band || row.grade_band || '',
    grade_level: record.grade_level || null,
    official_standard_fields: officialFields(record),
    progression_group_id: record.progression_group_id || row.progression_group_id || '',
    proposed_update: {
      evidence_granularity: 'textbook_unit_level',
      grade_assignment_type: 'shared_requirement_textbook_unit_supported',
      grade_specific_focus: proposedFocus(record, units),
      progression_basis: 'shared_standard_textbook_unit_sequence',
      progression_confidence: Number(Math.min(0.78, 0.6 + editions.length * 0.06).toFixed(3)),
      progression_delta: proposedProgressionDelta(units),
      requires_unit_level_evidence: false,
      review_status: 'unit_evidence_candidate_needs_review',
      textbook_unit_evidence_ids: unitIds
    },
    safety: {
      eligible_gate: 'coverage_audit_candidate_group_ready_for_decision + clean multi-edition same-grade unit evidence',
      official_standard_text_changed: false,
      requires_manual_review: true,
      writes_public_data: false
    },
    source_candidate_files: row.source_files || [],
    source_candidate_ids: row.candidate_ids || [],
    source_coverage_status: row.coverage_status,
    source_standard_scope: record.source_standard_scope || 'stage_shared_7_9',
    standard_code: row.code,
    standard_text_role: record.standard_text_role || 'source_standard_original',
    subdomain: record.subdomain || '',
    subject_slug: record.subject_slug || row.subject_slug || '',
    unit_evidence: units
  }
}

function selectedGroups(coverage, args) {
  const subjects = new Set(args.subjects)
  const groups = new Set(args.progressionGroups)
  return (coverage.progression_group_coverage || [])
    .filter(row => row.coverage_status === 'candidate_group_ready_for_decision')
    .filter(row => !subjects.size || subjects.has(row.subject_slug))
    .filter(row => !groups.size || groups.has(row.progression_group_id))
    .sort((a, b) => rowSortKey(a).localeCompare(rowSortKey(b)))
}

function rowSortKey(row) {
  return `${row.subject_slug || ''}|${row.progression_group_id || ''}`
}

function summarize(candidates, selected, skippedPublic) {
  const summary = {
    by_grade_band: {},
    by_progression_group: {},
    by_subject: {},
    candidate_groups: selected.length,
    candidates: candidates.length,
    group_ready_standard_count: selected.reduce((sum, group) => sum + (group.standard_codes || []).length, 0),
    multi_edition_candidates: 0,
    skipped_already_public_unit_level_standards: skippedPublic.length,
    unit_evidence_objects: 0
  }
  for (const candidate of candidates) {
    countInto(summary.by_subject, candidate.subject_slug)
    countInto(summary.by_grade_band, candidate.grade_band)
    countInto(summary.by_progression_group, candidate.progression_group_id)
    summary.unit_evidence_objects += candidate.unit_evidence.length
    if (sorted(candidate.unit_evidence.map(unit => unit.edition)).length >= 2) summary.multi_edition_candidates += 1
  }
  return summary
}

function buildPayload(args) {
  const errors = []
  const warnings = []
  if (!existsSync(args.coverageAudit)) errors.push(`Missing coverage audit: ${args.coverageAudit}`)
  const coverage = existsSync(args.coverageAudit) ? readJson(args.coverageAudit) : {}
  if (!errors.length) validateCoverageAudit(coverage, errors)
  const standardsByCode = loadStandardsByCode(args.dataRoot, errors)
  const sourceUnits = loadSourceUnits(coverage.candidate_files || [], errors, warnings)
  const selected = errors.length ? [] : selectedGroups(coverage, args)
  const standardCoverageByCode = new Map((coverage.standard_coverage || []).map(row => [row.code, row]))
  const candidates = []
  const skippedAlreadyPublic = []

  for (const group of selected) {
    for (const code of group.standard_codes || []) {
      const row = standardCoverageByCode.get(code)
      const record = standardsByCode.get(code)
      if (!row) {
        errors.push(`${group.progression_group_id}/${code} missing standard coverage row`)
        continue
      }
      if (!record) {
        errors.push(`${group.progression_group_id}/${code} missing public data record`)
        continue
      }
      if (row.public_has_unit_evidence || row.coverage_status === 'already_public_unit_level') {
        skippedAlreadyPublic.push(code)
        continue
      }
      if (row.coverage_status !== 'candidate_ready_multi_edition_review') {
        errors.push(`${code} is in ready group but standard status is ${row.coverage_status}`)
        continue
      }
      const units = dedupeUnits(row, sourceUnits, warnings)
      if (!units.length) {
        errors.push(`${code} has no source units after dedupe`)
        continue
      }
      if (sorted(units.map(unit => unit.edition)).length < 2) {
        errors.push(`${code} has fewer than two editions after source-unit dedupe`)
      }
      for (const unit of units) {
        if (!hasPositivePageStart(unit)) errors.push(`${code}/${unit.unit_evidence_id || 'missing'} missing positive page_start`)
        if (unit.page_range_status === 'toc_page_nonmonotonic') {
          errors.push(`${code}/${unit.unit_evidence_id || 'missing'} uses nonmonotonic TOC page evidence`)
        }
      }
      candidates.push(buildCandidate(row, record, units))
    }
  }

  candidates.sort((a, b) => String(a.standard_code || '').localeCompare(String(b.standard_code || '')))
  if (args.requireCandidates && !candidates.length) errors.push('requireCandidates is set but no group-ready candidates were produced')
  const summary = summarize(candidates, selected, skippedAlreadyPublic)
  return {
    candidates,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: {
      audit_source_must_be_valid: true,
      changes_official_standard_text: false,
      direct_matcher_use: false,
      group_ready_candidate_only: true,
      official_standard_text_changed: false,
      publication_ready: false,
      requires_later_manual_review_or_publication_gate: true,
      requires_page_start: true,
      writes_public_data: false
    },
    publication_ready: false,
    purpose: 'h4g_unit_evidence_group_ready_candidate',
    selected_progression_groups: selected,
    skipped_already_public_unit_level_standards: skippedAlreadyPublic,
    source_candidate_files: sourceUnits.sources,
    source_coverage_audit: args.coverageAudit,
    summary,
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }
}

function markdownSummary(payload) {
  const groupRows = payload.selected_progression_groups
    .map(row => `| ${markdownCell(row.subject_slug)} | ${markdownCell(row.progression_group_id)} | ${(row.standard_codes || []).length} | ${markdownCell((row.candidate_ready_grade_bands || []).join(', '))} | ${markdownCell((row.candidate_clean_editions || []).join('；'))} |`)
    .join('\n') || '| - | - | 0 | - | - |'
  const candidateRows = payload.candidates
    .map(row => `| ${markdownCell(row.standard_code)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.progression_group_id)} | ${sorted(row.unit_evidence.map(unit => unit.edition)).length} | ${row.unit_evidence.length} | ${markdownCell(row.proposed_update.grade_specific_focus)} |`)
    .join('\n') || '| - | - | - | 0 | 0 | - |'
  return `# H4G Unit Evidence Group-Ready Candidate

Generated at: ${payload.generated_at}

This review-only candidate pack materializes standards from progression groups
whose coverage audit says all H4G7/H4G8/H4G9 grade bands are ready for decision
or already public at unit level. It does not write public/data, change official
standard text, approve publication, or enable matcher use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| candidate groups | ${payload.summary.candidate_groups} |
| candidates | ${payload.summary.candidates} |
| skipped already-public standards | ${payload.summary.skipped_already_public_unit_level_standards} |
| unit evidence objects | ${payload.summary.unit_evidence_objects} |
| multi-edition candidates | ${payload.summary.multi_edition_candidates} |

## By Subject

| subject | candidates |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Selected Groups

| subject | progression group | standards | ready grades | clean editions |
| --- | --- | ---: | --- | --- |
${groupRows}

## Candidates

| standard | grade | progression group | editions | units | candidate focus |
| --- | --- | --- | ---: | ---: | --- |
${candidateRows}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}

## Warnings

${payload.warnings.length ? payload.warnings.slice(0, 80).map(warning => `- ${markdownCell(warning)}`).join('\n') : '- none'}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const payload = buildPayload(args)
  if (args.out) writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable({
    errors: payload.errors,
    generated_at: payload.generated_at,
    out: args.out,
    purpose: payload.purpose,
    summary: payload.summary,
    summary_out: args.summaryOut,
    valid: payload.valid,
    warnings: payload.warnings.slice(0, 20),
    writes_public_data: payload.writes_public_data
  }), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
