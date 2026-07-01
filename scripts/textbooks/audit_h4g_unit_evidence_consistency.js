#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_CANDIDATE = 'generated/textbook_evidence/h4g_unit_evidence_candidate.json'
const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_consistency_audit.json'
const TARGET_GRADE_BANDS = new Set(['H4G7', 'H4G8', 'H4G9'])

function parseArgs(argv) {
  const args = {
    candidate: DEFAULT_CANDIDATE,
    dataRoot: DEFAULT_DATA_ROOT,
    out: DEFAULT_OUT,
    strict: false,
    requireCandidates: false,
    requirePageStart: false,
    failOnNonmonotonicPages: false,
    requireCompleteProgressionGroups: false,
    minEditionsPerStandard: 1,
    minEditionsPerProgressionGroup: 1
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate') args.candidate = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-candidates') args.requireCandidates = true
    else if (item === '--require-page-start') args.requirePageStart = true
    else if (item === '--fail-on-nonmonotonic-pages') args.failOnNonmonotonicPages = true
    else if (item === '--require-complete-progression-groups') args.requireCompleteProgressionGroups = true
    else if (item === '--min-editions-per-standard') args.minEditionsPerStandard = positiveInteger(argv[++i], args.minEditionsPerStandard)
    else if (item === '--min-editions-per-progression-group') args.minEditionsPerProgressionGroup = positiveInteger(argv[++i], args.minEditionsPerProgressionGroup)
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_unit_evidence_consistency.js \\
  --candidate generated/textbook_evidence/h4g_unit_evidence_candidate.json \\
  --data-root public/data \\
  --strict --require-candidates

Audits whether an H4G unit-evidence candidate pack has enough review evidence
for grade-by-grade differentiation. This script is read-only. By default it
reports cross-version, progression-group, and page-status gaps as warnings.
Use --min-editions-per-standard 2, --min-editions-per-progression-group 2,
--require-complete-progression-groups, --require-page-start, or
--fail-on-nonmonotonic-pages to turn those publication requirements into
blocking errors.`)
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null && value !== ''
}

function sorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== ''))]
    .map(String)
    .sort((a, b) => a.localeCompare(b))
}

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function loadStandards(dataRoot) {
  const byCode = new Map()
  const byProgressionGroup = new Map()
  for (const file of subjectFiles(dataRoot)) {
    const payload = readJson(file)
    for (const record of payload.standards || []) {
      if (record.code) byCode.set(record.code, record)
      if (record.progression_group_id) {
        if (!byProgressionGroup.has(record.progression_group_id)) byProgressionGroup.set(record.progression_group_id, [])
        byProgressionGroup.get(record.progression_group_id).push(record)
      }
    }
  }
  return { byCode, byProgressionGroup }
}

function unitEditions(candidate) {
  return sorted((candidate.unit_evidence || []).map(unit => unit.edition || 'missing'))
}

function unitTextbooks(candidate) {
  return sorted((candidate.unit_evidence || []).map(unit => unit.textbook_evidence_id || 'missing'))
}

function unitVolumes(candidate) {
  return sorted((candidate.unit_evidence || []).map(unit => unit.volume || 'missing'))
}

function unitPageStatuses(candidate) {
  return sorted((candidate.unit_evidence || []).map(unit => unit.page_range_status || 'missing'))
}

function auditCandidate(candidate, context) {
  const { args, standards, errors, warnings, summary, progressionGroups } = context
  const prefix = candidate.standard_code || candidate.candidate_id || '(missing candidate id)'
  const units = Array.isArray(candidate.unit_evidence) ? candidate.unit_evidence : []
  const record = standards.byCode.get(candidate.standard_code)
  const progressionGroupId = candidate.progression_group_id || record?.progression_group_id || ''
  const editions = unitEditions(candidate)
  const textbookIds = unitTextbooks(candidate)
  const volumes = unitVolumes(candidate)
  const pageStatuses = unitPageStatuses(candidate)
  const pageStartCount = units.filter(unit => hasValue(unit.page_start)).length
  const nonmonotonicUnits = units.filter(unit => unit.page_range_status === 'toc_page_nonmonotonic')

  countInto(summary.by_subject, candidate.subject_slug || record?.subject_slug)
  countInto(summary.by_grade_band, candidate.grade_band || record?.grade_band)
  for (const edition of editions) countInto(summary.by_edition, edition)
  for (const status of pageStatuses) countInto(summary.by_page_range_status, status)

  if (!record) errors.push(`${prefix} references a standard missing from data root`)
  if (!TARGET_GRADE_BANDS.has(candidate.grade_band)) {
    errors.push(`${prefix} has non-target grade_band: ${candidate.grade_band || 'missing'}`)
  }
  if (!units.length) errors.push(`${prefix} has no unit_evidence`)

  if (editions.length === 1) {
    warnings.push(`${prefix} currently has one textbook edition; cross-version consistency is not proven`)
  }
  if (editions.length < args.minEditionsPerStandard) {
    const message = `${prefix} has ${editions.length} edition(s), below minEditionsPerStandard=${args.minEditionsPerStandard}`
    if (args.minEditionsPerStandard > 1) errors.push(message)
    summary.standards_below_min_editions += 1
  }
  if (editions.length === 1) summary.single_edition_standards += 1
  else if (editions.length > 1) summary.multi_edition_standards += 1

  if (pageStartCount < units.length) {
    const message = `${prefix} has ${units.length - pageStartCount} unit evidence object(s) missing page_start`
    if (args.requirePageStart) errors.push(message)
    else warnings.push(message)
    summary.unit_evidence_missing_page_start += units.length - pageStartCount
  }
  if (nonmonotonicUnits.length) {
    const titles = nonmonotonicUnits.map(unit => `${unit.unit_title || unit.unit_evidence_id || 'unknown'}:${unit.page_range || 'missing'}`).join('; ')
    const message = `${prefix} has nonmonotonic TOC page evidence requiring manual confirmation: ${titles}`
    if (args.failOnNonmonotonicPages) errors.push(message)
    else warnings.push(message)
    summary.nonmonotonic_page_records += nonmonotonicUnits.length
  }

  const detail = {
    candidate_id: candidate.candidate_id || '',
    standard_code: candidate.standard_code || '',
    subject_slug: candidate.subject_slug || record?.subject_slug || '',
    grade_band: candidate.grade_band || record?.grade_band || '',
    progression_group_id: progressionGroupId,
    editions,
    textbook_evidence_ids: textbookIds,
    volumes,
    unit_evidence_count: units.length,
    page_start_count: pageStartCount,
    page_range_statuses: pageStatuses,
    cross_version_consistency: editions.length > 1 ? 'multi_edition_candidate' : 'single_edition_not_proven',
    page_evidence_status: nonmonotonicUnits.length
      ? 'has_nonmonotonic_page_evidence'
      : pageStartCount === units.length
        ? 'page_start_present'
        : 'missing_page_start'
  }
  summary.candidate_details.push(detail)

  if (progressionGroupId) {
    if (!progressionGroups.has(progressionGroupId)) {
      const publicRows = standards.byProgressionGroup.get(progressionGroupId) || []
      progressionGroups.set(progressionGroupId, {
        progression_group_id: progressionGroupId,
        subject_slug: candidate.subject_slug || record?.subject_slug || '',
        public_grade_bands: sorted(publicRows.map(row => row.grade_band).filter(grade => TARGET_GRADE_BANDS.has(grade))),
        candidate_grade_bands: new Set(),
        standard_codes: new Set(),
        editions: new Set(),
        textbook_evidence_ids: new Set(),
        page_range_statuses: new Set(),
        unit_evidence_count: 0
      })
    }
    const group = progressionGroups.get(progressionGroupId)
    if (candidate.grade_band) group.candidate_grade_bands.add(candidate.grade_band)
    if (candidate.standard_code) group.standard_codes.add(candidate.standard_code)
    editions.forEach(edition => group.editions.add(edition))
    textbookIds.forEach(id => group.textbook_evidence_ids.add(id))
    pageStatuses.forEach(status => group.page_range_statuses.add(status))
    group.unit_evidence_count += units.length
  }
}

function finalizeProgressionGroups(args, groups, errors, warnings, summary) {
  const details = []
  for (const group of [...groups.values()].sort((a, b) => a.progression_group_id.localeCompare(b.progression_group_id))) {
    const candidateGradeBands = sorted([...group.candidate_grade_bands])
    const editions = sorted([...group.editions])
    const pageStatuses = sorted([...group.page_range_statuses])
    const missingCandidateBands = group.public_grade_bands.filter(grade => !candidateGradeBands.includes(grade))
    const detail = {
      progression_group_id: group.progression_group_id,
      subject_slug: group.subject_slug,
      public_grade_bands: group.public_grade_bands,
      candidate_grade_bands: candidateGradeBands,
      missing_candidate_grade_bands: missingCandidateBands,
      standard_codes: sorted([...group.standard_codes]),
      editions,
      textbook_evidence_ids: sorted([...group.textbook_evidence_ids]),
      page_range_statuses: pageStatuses,
      unit_evidence_count: group.unit_evidence_count,
      progression_group_status: missingCandidateBands.length
        ? 'partial_candidate_group'
        : 'complete_candidate_group',
      cross_version_consistency: editions.length > 1 ? 'multi_edition_candidate' : 'single_edition_not_proven'
    }
    details.push(detail)
    if (!missingCandidateBands.length && group.public_grade_bands.length === 3) summary.complete_progression_group_candidates += 1
    else summary.partial_progression_group_candidates += 1
    if (editions.length === 1) {
      warnings.push(`${group.progression_group_id} currently has one textbook edition; cross-version consistency is not proven`)
    }
    if (editions.length < args.minEditionsPerProgressionGroup) {
      const message = `${group.progression_group_id} has ${editions.length} edition(s), below minEditionsPerProgressionGroup=${args.minEditionsPerProgressionGroup}`
      if (args.minEditionsPerProgressionGroup > 1) errors.push(message)
      summary.progression_groups_below_min_editions += 1
    }
    if (args.requireCompleteProgressionGroups && missingCandidateBands.length) {
      errors.push(`${group.progression_group_id} missing candidate grade band(s): ${missingCandidateBands.join(', ')}`)
    }
  }
  return details
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const warnings = []
  if (!existsSync(args.candidate)) errors.push(`Missing candidate file: ${args.candidate}`)
  if (!existsSync(join(args.dataRoot, 'by_subject'))) errors.push(`Missing data root by_subject: ${args.dataRoot}`)

  const payload = errors.length ? { candidates: [] } : readJson(args.candidate)
  const standards = errors.length ? { byCode: new Map(), byProgressionGroup: new Map() } : loadStandards(args.dataRoot)
  if (payload.valid === false) errors.push('Candidate payload is marked valid=false')
  if (!Array.isArray(payload.candidates)) errors.push('Candidate payload missing candidates array')

  const summary = {
    candidates: (payload.candidates || []).length,
    unit_evidence_objects: 0,
    single_edition_standards: 0,
    multi_edition_standards: 0,
    standards_below_min_editions: 0,
    progression_groups: 0,
    complete_progression_group_candidates: 0,
    partial_progression_group_candidates: 0,
    progression_groups_below_min_editions: 0,
    unit_evidence_missing_page_start: 0,
    nonmonotonic_page_records: 0,
    by_subject: {},
    by_grade_band: {},
    by_edition: {},
    by_page_range_status: {},
    candidate_details: []
  }

  const progressionGroups = new Map()
  for (const candidate of payload.candidates || []) {
    summary.unit_evidence_objects += Array.isArray(candidate.unit_evidence) ? candidate.unit_evidence.length : 0
    auditCandidate(candidate, { args, standards, errors, warnings, summary, progressionGroups })
  }
  if (!summary.candidates) {
    warnings.push('Candidate file contains no candidates')
    if (args.requireCandidates) errors.push('requireCandidates is set but candidate file contains no candidates')
  }
  const progressionGroupDetails = finalizeProgressionGroups(args, progressionGroups, errors, warnings, summary)
  summary.progression_groups = progressionGroupDetails.length
  const hasCandidateEvidence = summary.candidates > 0 && summary.unit_evidence_objects > 0

  const result = {
    valid: errors.length === 0,
    publication_readiness: {
      has_candidate_evidence: hasCandidateEvidence,
      page_start_gate_ready: hasCandidateEvidence && summary.unit_evidence_missing_page_start === 0,
      page_range_gate_ready: hasCandidateEvidence && summary.nonmonotonic_page_records === 0,
      cross_version_consistency_proven: hasCandidateEvidence && summary.single_edition_standards === 0 && summary.progression_groups_below_min_editions === 0,
      complete_progression_groups: hasCandidateEvidence && summary.partial_progression_group_candidates === 0,
      recommended_publication_gate: [
        '--require-candidates',
        '--require-page-start',
        '--fail-on-nonmonotonic-pages',
        '--min-editions-per-standard 2',
        '--min-editions-per-progression-group 2',
        '--require-complete-progression-groups'
      ].join(' ')
    },
    candidate: args.candidate,
    data_root: args.dataRoot,
    requirements: {
      require_candidates: args.requireCandidates,
      require_page_start: args.requirePageStart,
      fail_on_nonmonotonic_pages: args.failOnNonmonotonicPages,
      require_complete_progression_groups: args.requireCompleteProgressionGroups,
      min_editions_per_standard: args.minEditionsPerStandard,
      min_editions_per_progression_group: args.minEditionsPerProgressionGroup
    },
    summary,
    progression_groups: progressionGroupDetails,
    errors,
    warnings
  }

  if (args.out) writeJson(args.out, result)
  console.log(JSON.stringify(result, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
