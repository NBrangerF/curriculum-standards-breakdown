#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_UNIT_CANDIDATE = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_candidate.json'
const DEFAULT_DECISION_MATRIX = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_progression_decision_matrix.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_candidate_ready_only.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_candidate_ready_only.md'
const DEFAULT_DECISION = 'same_grade_unit_candidate_ready'

function parseArgs(argv) {
  const args = {
    candidate: DEFAULT_UNIT_CANDIDATE,
    decisionMatrix: DEFAULT_DECISION_MATRIX,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    decision: DEFAULT_DECISION,
    strict: false,
    requireCandidates: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate') args.candidate = argv[++i]
    else if (item === '--decision-matrix') args.decisionMatrix = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--decision') args.decision = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-candidates') args.requireCandidates = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_ready_unit_evidence_candidate.js \\
  --candidate generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_candidate.json \\
  --decision-matrix generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_progression_decision_matrix.json \\
  --strict --require-candidates

Filters an H4G unit-evidence candidate pack to standards whose progression
decision is same_grade_unit_candidate_ready. The output is still a review-only
candidate pack and never writes public data.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function sorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== '').map(String))]
    .sort((a, b) => a.localeCompare(b))
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function hashText(value, length = 14) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
}

function decisionByStandard(decisionMatrix) {
  const out = new Map()
  for (const row of decisionMatrix?.standard_decisions || []) {
    if (row.standard_code) out.set(row.standard_code, row)
  }
  return out
}

function unitEditions(candidate) {
  return sorted((candidate.unit_evidence || []).map(unit => unit.edition))
}

function pageStatuses(candidate) {
  return sorted((candidate.unit_evidence || []).map(unit => unit.page_range_status || 'missing'))
}

function summarizeCandidates(candidates) {
  const summary = {
    candidates: candidates.length,
    unit_evidence_objects: 0,
    standards: 0,
    by_subject: {},
    by_grade_band: {},
    by_edition: {},
    by_page_range_status: {},
    by_eligible_alignment: {},
    multi_edition_standards: 0,
    single_edition_standards: 0,
    page_start_records: 0,
    page_range_records: 0
  }
  for (const candidate of candidates) {
    summary.standards += 1
    countInto(summary.by_subject, candidate.subject_slug)
    countInto(summary.by_grade_band, candidate.grade_band)
    const editions = unitEditions(candidate)
    if (editions.length > 1) summary.multi_edition_standards += 1
    else summary.single_edition_standards += 1
    for (const unit of candidate.unit_evidence || []) {
      summary.unit_evidence_objects += 1
      countInto(summary.by_edition, unit.edition)
      countInto(summary.by_page_range_status, unit.page_range_status || 'missing')
      if (unit.page_start !== undefined && unit.page_start !== null && unit.page_start !== '') summary.page_start_records += 1
      if (unit.page_range) summary.page_range_records += 1
      countInto(summary.by_eligible_alignment, unit.eligible_alignment)
    }
  }
  return summary
}

function candidateWithDecision(candidate, decision) {
  return {
    ...candidate,
    publication_review_decision: {
      decision: decision.decision,
      source: 'h4g_progression_decision_matrix',
      same_grade_edition_count: decision.same_grade_edition_count,
      same_grade_editions: decision.same_grade_editions || [],
      same_grade_page_ready: Boolean(decision.same_grade_page_ready),
      excluded_edition_placement_review: false,
      excluded_unresolved_gap: false
    }
  }
}

function buildPayload(args) {
  const errors = []
  const warnings = []
  if (!existsSync(args.candidate)) errors.push(`Missing unit candidate: ${args.candidate}`)
  if (!existsSync(args.decisionMatrix)) errors.push(`Missing decision matrix: ${args.decisionMatrix}`)
  const source = errors.length ? { candidates: [] } : readJson(args.candidate)
  const matrix = errors.length ? { standard_decisions: [] } : readJson(args.decisionMatrix)

  if (source.valid === false) errors.push('Source candidate is marked valid=false')
  if (matrix.valid === false) errors.push('Decision matrix is marked valid=false')
  if (source.policy?.writes_public_data !== false) errors.push('Source candidate policy.writes_public_data must be false')
  if (matrix.policy?.writes_public_data !== false) errors.push('Decision matrix policy.writes_public_data must be false')
  if (matrix.policy?.writes_textbook_unit_evidence_ids !== false) {
    errors.push('Decision matrix policy.writes_textbook_unit_evidence_ids must be false')
  }

  const decisionByCode = decisionByStandard(matrix)
  const selected = []
  const excluded = {
    by_decision: {},
    standard_codes: []
  }
  for (const candidate of source.candidates || []) {
    const decision = decisionByCode.get(candidate.standard_code)
    if (!decision) {
      warnings.push(`${candidate.standard_code} missing from decision matrix; excluded`)
      countInto(excluded.by_decision, 'missing_decision')
      excluded.standard_codes.push(candidate.standard_code)
      continue
    }
    if (decision.decision !== args.decision) {
      countInto(excluded.by_decision, decision.decision)
      excluded.standard_codes.push(candidate.standard_code)
      continue
    }
    if ((decision.same_grade_edition_count || 0) < 2) {
      errors.push(`${candidate.standard_code} selected with fewer than two same-grade editions`)
    }
    if (!decision.same_grade_page_ready) {
      errors.push(`${candidate.standard_code} selected without page-ready same-grade evidence`)
    }
    selected.push(candidateWithDecision(candidate, decision))
  }
  selected.sort((a, b) => String(a.standard_code || '').localeCompare(String(b.standard_code || '')))
  excluded.standard_codes = sorted(excluded.standard_codes)

  if (args.requireCandidates && !selected.length) errors.push('requireCandidates is set but no candidates were selected')

  const summary = summarizeCandidates(selected)
  summary.source_candidates = (source.candidates || []).length
  summary.excluded_candidates = (source.candidates || []).length - selected.length
  summary.excluded_by_decision = excluded.by_decision
  summary.decision_filter = args.decision

  return {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    source_candidate: args.candidate,
    decision_matrix: args.decisionMatrix,
    match_source_commit: source.match_source_commit || null,
    match_source_commits: source.match_source_commits || [],
    sources: source.sources || [],
    policy: {
      ...(source.policy || {}),
      ready_only_candidate: true,
      decision_filter: args.decision,
      source_candidate_hash: hashText(JSON.stringify((source.candidates || []).map(candidate => candidate.standard_code))),
      decision_matrix_hash: hashText(JSON.stringify((matrix.standard_decisions || []).map(row => [row.standard_code, row.decision]))),
      writes_public_data: false,
      official_standard_text_changed: false,
      excludes_edition_placement_review: true,
      excludes_unresolved_gap_remediation: true
    },
    summary,
    excluded,
    candidates: selected,
    errors,
    warnings
  }
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

function markdownSummary(payload) {
  const candidateRows = payload.candidates
    .map(candidate => {
      const decision = candidate.publication_review_decision || {}
      return `| ${candidate.standard_code} | ${candidate.grade_band} | ${markdownCell(candidate.subdomain)} | ${decision.same_grade_edition_count || 0} | ${markdownCell((decision.same_grade_editions || []).join('；'))} | ${(candidate.unit_evidence || []).length} |`
    })
    .join('\n') || '| - | - | - | 0 | - | 0 |'

  return `# H4G Ready Unit Evidence Candidate

生成时间：${payload.generated_at}

source candidate：\`${payload.source_candidate}\`

decision matrix：\`${payload.decision_matrix}\`

## Summary

| 指标 | 数量 |
| --- | ---: |
| selected candidates | ${payload.summary.candidates} |
| source candidates | ${payload.summary.source_candidates} |
| excluded candidates | ${payload.summary.excluded_candidates} |
| unit evidence objects | ${payload.summary.unit_evidence_objects} |
| multi-edition standards | ${payload.summary.multi_edition_standards} |
| page start records | ${payload.summary.page_start_records} |

## Excluded By Decision

| decision | count |
| --- | ---: |
${countRows(payload.summary.excluded_by_decision)}

## Candidates

| standard | grade | subdomain | same-grade editions | editions | unit evidence |
| --- | --- | --- | ---: | --- | ---: |
${candidateRows}

## Boundary

- This is a ready-only review candidate derived from \`h4g_progression_decision_matrix\`.
- It excludes \`edition_placement_review\` and \`continue_gap_remediation\` standards.
- It remains a pre-publication candidate and does not write \`public/data\`.
- Applying it to a generated data root is allowed for QA; applying it to \`public/data\` is not part of this step.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const payload = buildPayload(args)
  writeJson(args.out, payload)
  if (args.summaryOut) {
    mkdirSync(dirname(args.summaryOut), { recursive: true })
    writeFileSync(args.summaryOut, markdownSummary(payload))
  }
  console.log(JSON.stringify({
    valid: payload.valid,
    wrote: args.out,
    summary_out: args.summaryOut || null,
    ...payload.summary,
    errors: payload.errors.length,
    warnings: payload.warnings.length
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
