#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_CANDIDATE_ROOT = 'generated/textbook_evidence/h4g_runs'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_candidate_coverage_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_candidate_coverage_audit.md'
const CANDIDATE_FILE_NAMES = new Set([
  'h4g_unit_evidence_candidate.json',
  'h4g_unit_evidence_candidate_ready_only.json'
])
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']

function parseArgs(argv) {
  const args = {
    candidates: [],
    candidateRoot: DEFAULT_CANDIDATE_ROOT,
    dataRoot: DEFAULT_DATA_ROOT,
    discoverCandidates: true,
    minEditionsPerProgressionGroup: 2,
    minEditionsPerStandard: 2,
    out: DEFAULT_OUT,
    requireCandidates: false,
    strict: false,
    subjects: [],
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate') args.candidates = splitArg(argv[++i])
    else if (item === '--candidate-root') args.candidateRoot = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--no-discover-candidates') args.discoverCandidates = false
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subjects') args.subjects = splitArg(argv[++i])
    else if (item === '--min-editions-per-standard') args.minEditionsPerStandard = positiveInteger(argv[++i], args.minEditionsPerStandard)
    else if (item === '--min-editions-per-progression-group') args.minEditionsPerProgressionGroup = positiveInteger(argv[++i], args.minEditionsPerProgressionGroup)
    else if (item === '--strict') args.strict = true
    else if (item === '--require-candidates') args.requireCandidates = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_unit_evidence_candidate_coverage.js \\
  --subjects math,science \\
  --strict --require-candidates

Audits discovered H4G unit-evidence candidate packs against current public H4G
standards. This is a read-only coverage gate: it does not write public/data,
change official standard text, approve candidates, or enable publication use.`)
}

function splitArg(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
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

function sorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== '').map(String))]
    .sort((a, b) => a.localeCompare(b))
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null && value !== ''
}

function hasPositivePageStart(unit) {
  const page = Number(unit?.page_start)
  return Number.isInteger(page) && page > 0
}

function hasPublicUnitEvidence(record) {
  return record.evidence_granularity === 'textbook_unit_level' ||
    (Array.isArray(record.textbook_unit_evidence_ids) && record.textbook_unit_evidence_ids.length > 0)
}

function needsUnitEvidence(record) {
  return record.requires_unit_level_evidence === true ||
    record.standard_variant_type === 'same_source_shared' ||
    String(record.review_status || '').includes('needs_grade_differentiation')
}

function isCleanUnit(unit) {
  return unit?.unit_candidate_type === 'toc_unit_or_chapter' &&
    unit?.evidence_granularity === 'textbook_unit_or_chapter_candidate' &&
    hasPositivePageStart(unit) &&
    unit.page_range_status !== 'toc_page_nonmonotonic'
}

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function loadTargetStandards(args, errors) {
  const selected = new Set(args.subjects)
  const byCode = new Map()
  const byGroup = new Map()
  const subjectStats = {}

  const dir = join(args.dataRoot, 'by_subject')
  if (!existsSync(dir)) {
    errors.push(`Missing data root by_subject: ${dir}`)
    return { byCode, byGroup, subjectStats }
  }

  for (const file of subjectFiles(args.dataRoot)) {
    const subjectSlug = basename(file, '.json')
    if (selected.size && !selected.has(subjectSlug)) continue
    const payload = readJson(file)
    subjectStats[subjectSlug] = {
      h4g_records: 0,
      public_unit_level_records: 0,
      records_needing_unit_evidence: 0,
      subject: payload.subject || subjectSlug,
      subject_slug: subjectSlug
    }
    for (const record of payload.standards || []) {
      if (!TARGET_GRADE_BANDS.includes(record.grade_band)) continue
      const publicHasUnit = hasPublicUnitEvidence(record)
      const needsUnit = needsUnitEvidence(record)
      subjectStats[subjectSlug].h4g_records += 1
      if (publicHasUnit) subjectStats[subjectSlug].public_unit_level_records += 1
      if (needsUnit) subjectStats[subjectSlug].records_needing_unit_evidence += 1
      const normalized = {
        ...record,
        public_has_unit_evidence: publicHasUnit,
        needs_unit_evidence: needsUnit,
        subject_slug: record.subject_slug || subjectSlug
      }
      if (record.code) byCode.set(record.code, normalized)
      const groupId = record.progression_group_id || record.code
      if (!byGroup.has(groupId)) {
        byGroup.set(groupId, {
          progression_group_id: groupId,
          records: [],
          subject_slug: normalized.subject_slug
        })
      }
      byGroup.get(groupId).records.push(normalized)
    }
  }

  return { byCode, byGroup, subjectStats }
}

function discoverCandidateFiles(root) {
  const out = []
  function walk(dir) {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile() && CANDIDATE_FILE_NAMES.has(entry.name)) out.push(path)
    }
  }
  walk(root)
  return sorted(out)
}

function candidatePaths(args) {
  return sorted([
    ...(args.candidates || []),
    ...(args.discoverCandidates ? discoverCandidateFiles(args.candidateRoot) : [])
  ])
}

function blankCoverage(standard) {
  return {
    all_unit_count: 0,
    candidate_ids: new Set(),
    clean_editions: new Set(),
    clean_textbook_evidence_ids: new Set(),
    clean_unit_count: 0,
    clean_units: [],
    eligible_alignments: {},
    page_range_statuses: {},
    source_files: new Set(),
    standard,
    unit_quality_failures: 0
  }
}

function addCandidateCoverage(path, candidate, unit, coverage) {
  coverage.all_unit_count += 1
  if (candidate.candidate_id) coverage.candidate_ids.add(candidate.candidate_id)
  coverage.source_files.add(path)
  countInto(coverage.page_range_statuses, unit.page_range_status || 'missing')
  countInto(coverage.eligible_alignments, unit.eligible_alignment || 'missing')
  if (!isCleanUnit(unit)) {
    coverage.unit_quality_failures += 1
    return
  }
  coverage.clean_unit_count += 1
  if (unit.edition) coverage.clean_editions.add(unit.edition)
  if (unit.textbook_evidence_id) coverage.clean_textbook_evidence_ids.add(unit.textbook_evidence_id)
  if (coverage.clean_units.length < 8) {
    coverage.clean_units.push({
      edition: unit.edition || '',
      eligible_alignment: unit.eligible_alignment || '',
      page_range: unit.page_range || '',
      page_range_status: unit.page_range_status || '',
      page_start: unit.page_start || '',
      source_file: path,
      textbook_evidence_id: unit.textbook_evidence_id || '',
      unit_evidence_id: unit.unit_evidence_id || '',
      unit_title: unit.unit_title || ''
    })
  }
}

function loadCandidateCoverage(paths, standards, errors, warnings) {
  const byCode = new Map([...standards.byCode.entries()].map(([code, standard]) => [code, blankCoverage(standard)]))
  const missingCandidateFiles = []
  let candidateFilesRead = 0
  let sourceCandidates = 0

  for (const path of paths) {
    if (!existsSync(path)) {
      missingCandidateFiles.push(path)
      continue
    }
    const payload = readJson(path)
    candidateFilesRead += 1
    if (payload.valid === false) errors.push(`${path} is marked valid=false`)
    if (payload.policy && payload.policy.writes_public_data !== false) errors.push(`${path} policy.writes_public_data must be false`)
    if (payload.policy && payload.policy.official_standard_text_changed !== false) {
      errors.push(`${path} policy.official_standard_text_changed must be false`)
    }
    for (const candidate of payload.candidates || []) {
      sourceCandidates += 1
      const coverage = byCode.get(candidate.standard_code)
      if (!coverage) continue
      for (const unit of candidate.unit_evidence || []) addCandidateCoverage(path, candidate, unit, coverage)
    }
  }

  for (const path of missingCandidateFiles) warnings.push(`Missing candidate file: ${path}`)
  return { byCode, candidateFilesRead, missingCandidateFiles, sourceCandidates }
}

function statusForStandard(row, minEditionsPerStandard) {
  if (row.public_has_unit_evidence) return 'already_public_unit_level'
  if (row.all_unit_count === 0) return 'missing_candidate_unit_evidence'
  if (row.clean_unit_count === 0) return 'candidate_page_or_quality_gap'
  if (row.clean_edition_count >= minEditionsPerStandard) return 'candidate_ready_multi_edition_review'
  return 'candidate_single_edition_review_needed'
}

function buildStandardRows(coverageByCode, args) {
  const rows = []
  for (const coverage of coverageByCode.values()) {
    const record = coverage.standard
    if (!record.needs_unit_evidence) continue
    const cleanEditions = sorted([...coverage.clean_editions])
    const row = {
      all_unit_count: coverage.all_unit_count,
      candidate_ids: sorted([...coverage.candidate_ids]),
      clean_edition_count: cleanEditions.length,
      clean_editions: cleanEditions,
      clean_textbook_evidence_ids: sorted([...coverage.clean_textbook_evidence_ids]),
      clean_unit_count: coverage.clean_unit_count,
      clean_units: coverage.clean_units,
      code: record.code || '',
      grade_band: record.grade_band || '',
      page_range_statuses: coverage.page_range_statuses,
      progression_group_id: record.progression_group_id || '',
      public_has_unit_evidence: record.public_has_unit_evidence,
      source_files: sorted([...coverage.source_files]),
      subject_slug: record.subject_slug || '',
      unit_quality_failures: coverage.unit_quality_failures
    }
    row.coverage_status = statusForStandard(row, args.minEditionsPerStandard)
    rows.push(row)
  }
  return rows.sort((a, b) => a.subject_slug.localeCompare(b.subject_slug) ||
    a.progression_group_id.localeCompare(b.progression_group_id) ||
    a.grade_band.localeCompare(b.grade_band) ||
    a.code.localeCompare(b.code))
}

function buildGroupRows(standardRows, standards, args) {
  const byCode = new Map(standardRows.map(row => [row.code, row]))
  const rows = []
  for (const group of standards.byGroup.values()) {
    const targetRecords = group.records.filter(record => record.needs_unit_evidence)
    if (!targetRecords.length) continue
    const standardRowsForGroup = targetRecords.map(record => byCode.get(record.code)).filter(Boolean)
    const publicUnitCodes = standardRowsForGroup.filter(row => row.public_has_unit_evidence).map(row => row.code)
    const candidateReadyRows = standardRowsForGroup.filter(row => row.coverage_status === 'candidate_ready_multi_edition_review')
    const candidateAnyRows = standardRowsForGroup.filter(row => row.clean_unit_count > 0)
    const publicGradeBands = sorted(targetRecords.map(record => record.grade_band))
    const readyGradeBands = sorted([
      ...standardRowsForGroup.filter(row => row.public_has_unit_evidence).map(row => row.grade_band),
      ...candidateReadyRows.map(row => row.grade_band)
    ])
    const candidateGradeBands = sorted(candidateAnyRows.map(row => row.grade_band))
    const missingReadyGradeBands = publicGradeBands.filter(grade => !readyGradeBands.includes(grade))
    const cleanEditions = sorted(candidateAnyRows.flatMap(row => row.clean_editions))
    const status = publicUnitCodes.length === targetRecords.length
      ? 'already_public_unit_level_group'
      : !missingReadyGradeBands.length && cleanEditions.length >= args.minEditionsPerProgressionGroup
        ? 'candidate_group_ready_for_decision'
        : candidateGradeBands.length === 0
          ? 'missing_candidate_unit_evidence_group'
          : missingReadyGradeBands.length
            ? 'candidate_group_missing_ready_grade_bands'
            : 'candidate_group_below_min_editions'
    rows.push({
      candidate_clean_editions: cleanEditions,
      candidate_grade_bands: candidateGradeBands,
      candidate_ready_grade_bands: readyGradeBands,
      coverage_status: status,
      missing_ready_grade_bands: missingReadyGradeBands,
      progression_group_id: group.progression_group_id,
      public_grade_bands: publicGradeBands,
      public_unit_level_codes: sorted(publicUnitCodes),
      standard_codes: sorted(targetRecords.map(record => record.code)),
      subject_slug: group.subject_slug,
      target_record_count: targetRecords.length
    })
  }
  return rows.sort((a, b) => a.subject_slug.localeCompare(b.subject_slug) ||
    a.coverage_status.localeCompare(b.coverage_status) ||
    a.progression_group_id.localeCompare(b.progression_group_id))
}

function summarize(args, standards, candidateCoverage, standardRows, groupRows) {
  const nonPublicRows = standardRows.filter(row => !row.public_has_unit_evidence)
  const summary = {
    by_group_status: {},
    by_standard_status: {},
    by_subject: {},
    candidate_files_read: candidateCoverage.candidateFilesRead,
    candidate_source_rows_read: candidateCoverage.sourceCandidates,
    candidate_standard_rows_with_clean_units: standardRows.filter(row => row.clean_unit_count > 0).length,
    candidate_standard_rows_with_multi_edition_clean_units: standardRows.filter(row => row.clean_edition_count >= args.minEditionsPerStandard).length,
    generated_standard_rows: standardRows.length,
    group_rows: groupRows.length,
    missing_candidate_files: candidateCoverage.missingCandidateFiles.length,
    non_public_candidate_standard_rows_with_clean_units: nonPublicRows.filter(row => row.clean_unit_count > 0).length,
    non_public_candidate_standard_rows_with_multi_edition_clean_units: nonPublicRows.filter(row => row.clean_edition_count >= args.minEditionsPerStandard).length,
    non_public_standard_rows: nonPublicRows.length,
    progression_groups_ready_for_decision: groupRows.filter(row => row.coverage_status === 'candidate_group_ready_for_decision').length,
    public_unit_level_standard_rows: standardRows.filter(row => row.public_has_unit_evidence).length,
    subjects: Object.keys(standards.subjectStats).length
  }
  for (const row of standardRows) {
    countInto(summary.by_standard_status, row.coverage_status)
    summary.by_subject[row.subject_slug] ||= {
      already_public_unit_level: 0,
      candidate_page_or_quality_gap: 0,
      candidate_ready_multi_edition_review: 0,
      candidate_single_edition_review_needed: 0,
      h4g_records: standards.subjectStats[row.subject_slug]?.h4g_records || 0,
      missing_candidate_unit_evidence: 0,
      public_unit_level_records: standards.subjectStats[row.subject_slug]?.public_unit_level_records || 0,
      records_needing_unit_evidence: standards.subjectStats[row.subject_slug]?.records_needing_unit_evidence || 0
    }
    summary.by_subject[row.subject_slug][row.coverage_status] += 1
  }
  for (const row of groupRows) countInto(summary.by_group_status, row.coverage_status)
  return summary
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

function tableRows(rows, limit = 80) {
  return rows.slice(0, limit).map(row => (
    `| ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band || row.public_grade_bands?.join('+'))} | ${markdownCell(row.code || row.progression_group_id)} | ${markdownCell(row.coverage_status)} | ${row.clean_edition_count ?? row.candidate_clean_editions?.length ?? 0} | ${row.clean_unit_count ?? row.target_record_count ?? 0} |`
  )).join('\n') || '| - | - | - | - | 0 | 0 |'
}

function markdownSummary(payload) {
  const blockerRows = payload.standard_coverage
    .filter(row => !['already_public_unit_level', 'candidate_ready_multi_edition_review'].includes(row.coverage_status))
  return `# H4G Unit Evidence Candidate Coverage Audit

Generated at: ${payload.generated_at}

This read-only audit summarizes discovered H4G unit-evidence candidate packs
against current public H4G standards. It does not write public/data, change
official standard text, approve unit evidence, or enable publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| candidate files read | ${payload.summary.candidate_files_read} |
| candidate source rows read | ${payload.summary.candidate_source_rows_read} |
| standard rows needing unit evidence | ${payload.summary.generated_standard_rows} |
| standards with clean candidate units | ${payload.summary.candidate_standard_rows_with_clean_units} |
| standards with multi-edition clean units | ${payload.summary.candidate_standard_rows_with_multi_edition_clean_units} |
| non-public standards with clean candidate units | ${payload.summary.non_public_candidate_standard_rows_with_clean_units} |
| non-public standards with multi-edition clean units | ${payload.summary.non_public_candidate_standard_rows_with_multi_edition_clean_units} |
| progression groups ready for decision | ${payload.summary.progression_groups_ready_for_decision} |
| publication ready | ${payload.publication_ready} |

## Standard Status

| status | rows |
| --- | ---: |
${countRows(payload.summary.by_standard_status)}

## Group Status

| status | rows |
| --- | ---: |
${countRows(payload.summary.by_group_status)}

## First Blockers

| subject | grade | code/group | status | editions | units |
| --- | --- | --- | --- | ---: | ---: |
${tableRows(blockerRows)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}

## Warnings

${payload.warnings.length ? payload.warnings.slice(0, 60).map(warning => `- ${markdownCell(warning)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  const warnings = []
  const standards = loadTargetStandards(args, errors)
  const paths = candidatePaths(args)
  const candidateCoverage = loadCandidateCoverage(paths, standards, errors, warnings)
  const standardRows = buildStandardRows(candidateCoverage.byCode, args)
  const groupRows = buildGroupRows(standardRows, standards, args)
  if (args.requireCandidates && !candidateCoverage.candidateFilesRead) errors.push('requireCandidates is set but no candidate files were read')
  if (args.requireCandidates && !standardRows.some(row => row.clean_unit_count > 0)) {
    errors.push('requireCandidates is set but no clean candidate unit evidence was found')
  }
  return {
    changes_official_standard_text: false,
    candidate_files: paths,
    candidate_root: args.candidateRoot,
    data_root: args.dataRoot,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: {
      audit_only: true,
      changes_official_standard_text: false,
      direct_matcher_use: false,
      eligible_for_h4g_differentiation: false,
      min_editions_per_progression_group: args.minEditionsPerProgressionGroup,
      min_editions_per_standard: args.minEditionsPerStandard,
      publication_ready: false,
      requires_later_candidate_application_gate: true,
      requires_later_manual_review_or_publication_gate: true,
      writes_public_data: false
    },
    progression_group_coverage: groupRows,
    publication_ready: false,
    purpose: 'h4g_unit_evidence_candidate_coverage_audit',
    standard_coverage: standardRows,
    subjects: sorted(Object.keys(standards.subjectStats)),
    summary: summarize(args, standards, candidateCoverage, standardRows, groupRows),
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }
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
    changes_official_standard_text: payload.changes_official_standard_text,
    direct_matcher_use: payload.direct_matcher_use,
    eligible_for_h4g_differentiation: payload.eligible_for_h4g_differentiation,
    errors: payload.errors,
    generated_at: payload.generated_at,
    matcher_ready: payload.matcher_ready,
    out: args.out,
    publication_ready: payload.publication_ready,
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
