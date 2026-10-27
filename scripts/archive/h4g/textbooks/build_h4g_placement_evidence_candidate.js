#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_MATRIX = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_topic_placement_matrix.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_placement_evidence_candidate.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_placement_evidence_candidate.md'

function parseArgs(argv) {
  const args = {
    matrix: DEFAULT_MATRIX,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireCandidates: false,
    maxUnitsPerStandard: 8
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--matrix') args.matrix = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--max-units-per-standard') args.maxUnitsPerStandard = positiveInteger(argv[++i], args.maxUnitsPerStandard)
    else if (item === '--strict') args.strict = true
    else if (item === '--require-candidates') args.requireCandidates = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_placement_evidence_candidate.js \\
  --matrix generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_topic_placement_matrix.json \\
  --strict --require-candidates

Builds a reviewable edition-placement evidence candidate pack from an H4G topic
placement matrix. This output is diagnostic and pre-publication only: cross-
grade textbook units explain edition placement differences but are not same-
grade standard evidence.`)
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
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

function cleanUnit(unit, sourceStandard) {
  return {
    source_standard_code: sourceStandard.standard_code,
    source_standard_grade_band: sourceStandard.grade_band,
    unit_evidence_id: unit.unit_evidence_id,
    textbook_evidence_id: unit.textbook_evidence_id,
    unit_title: unit.unit_title,
    edition: unit.edition,
    volume: unit.volume,
    unit_grade_band: unit.unit_grade_band,
    grade_relation: unit.grade_relation,
    page_start: unit.page_start ?? null,
    page_range: unit.page_range || '',
    page_range_status: unit.page_range_status || '',
    confidence: unit.confidence || '',
    matched_terms: unit.matched_terms || []
  }
}

function unitKey(unit) {
  return [
    unit.source_standard_code,
    unit.unit_evidence_id,
    unit.edition,
    unit.unit_grade_band,
    unit.grade_relation
  ].join('|')
}

function unitSort(a, b) {
  const standard = String(a.source_standard_code || '').localeCompare(String(b.source_standard_code || ''))
  if (standard) return standard
  const edition = String(a.edition || '').localeCompare(String(b.edition || ''))
  if (edition) return edition
  const grade = String(a.unit_grade_band || '').localeCompare(String(b.unit_grade_band || ''))
  if (grade) return grade
  const page = (Number(a.page_start) || Number.MAX_SAFE_INTEGER) - (Number(b.page_start) || Number.MAX_SAFE_INTEGER)
  if (page) return page
  return String(a.unit_title || '').localeCompare(String(b.unit_title || ''))
}

function dedupeUnits(units) {
  const byKey = new Map()
  for (const unit of units) {
    const key = unitKey(unit)
    if (!byKey.has(key)) byKey.set(key, unit)
  }
  return [...byKey.values()].sort(unitSort)
}

function selectUnits(units, maxRows) {
  return units
    .slice()
    .sort(unitSort)
    .slice(0, maxRows)
}

function placementByEdition(units) {
  const out = {}
  for (const unit of units || []) {
    const edition = unit.edition || 'missing'
    const grade = unit.unit_grade_band || 'missing'
    out[edition] ||= {}
    out[edition][grade] ||= {
      unit_count: 0,
      source_standard_codes: new Set(),
      unit_titles: new Set()
    }
    out[edition][grade].unit_count += 1
    out[edition][grade].source_standard_codes.add(unit.source_standard_code)
    out[edition][grade].unit_titles.add(unit.unit_title)
  }
  return Object.fromEntries(Object.entries(out)
    .map(([edition, grades]) => [
      edition,
      Object.fromEntries(Object.entries(grades)
        .map(([grade, row]) => [
          grade,
          {
            unit_count: row.unit_count,
            source_standard_codes: sorted([...row.source_standard_codes]),
            unit_titles: sorted([...row.unit_titles]).slice(0, 12)
          }
        ])
        .sort(([a], [b]) => a.localeCompare(b)))
    ])
    .sort(([a], [b]) => a.localeCompare(b)))
}

function buildCandidate(groupRows, args) {
  const reviewRows = groupRows.filter(row => row.action_hint === 'review_cross_grade_placement')
  if (!reviewRows.length) return null
  const groupId = groupRows[0]?.progression_group_id || ''
  const sameGradeUnits = []
  const crossGradeUnits = []
  for (const row of reviewRows) {
    const missingEditions = new Set(row.missing_edition_cross_grade_hits || [])
    sameGradeUnits.push(...selectUnits(row.same_grade_matches || [], args.maxUnitsPerStandard).map(unit => cleanUnit(unit, row)))
    const relevantCrossGrade = (row.cross_grade_matches || [])
      .filter(unit => missingEditions.has(unit.edition))
    crossGradeUnits.push(...selectUnits(relevantCrossGrade, args.maxUnitsPerStandard).map(unit => cleanUnit(unit, row)))
  }
  const same = dedupeUnits(sameGradeUnits)
  const cross = dedupeUnits(crossGradeUnits)
  if (!cross.length) return null

  const reviewStandards = reviewRows.map(row => ({
    standard_code: row.standard_code,
    grade_band: row.grade_band,
    subdomain: row.subdomain,
    placement_status: row.placement_status,
    current_same_grade_editions: row.reverse_gap_status?.current_editions || [],
    missing_same_grade_editions: row.reverse_gap_status?.missing_editions || [],
    missing_editions_with_cross_grade_topic: row.missing_edition_cross_grade_hits || [],
    same_grade_match_count: (row.same_grade_matches || []).length,
    cross_grade_match_count: (row.cross_grade_matches || []).length
  }))

  return {
    candidate_id: `h4g_place_${hashText(`${groupId}|${reviewStandards.map(row => row.standard_code).join('|')}`)}`,
    progression_group_id: groupId,
    subject_slug: groupRows[0]?.subject_slug || '',
    grade_bands: sorted(groupRows.map(row => row.grade_band)),
    standard_codes: groupRows.map(row => row.standard_code),
    topic_subdomains: sorted(groupRows.map(row => row.subdomain)),
    candidate_type: 'edition_topic_placement_candidate',
    evidence_granularity: 'textbook_topic_placement_diagnostic',
    review_status: 'placement_evidence_candidate_needs_review',
    review_standards: reviewStandards,
    placement_evidence: {
      same_grade_units: same,
      cross_grade_units: cross,
      placement_by_edition_grade: placementByEdition([...same, ...cross])
    },
    interpretation: {
      same_grade_unit_evidence_changed: false,
      cross_grade_units_are_same_grade_evidence: false,
      cross_grade_units_explain_edition_placement: true,
      recommended_gate_decision: 'review_edition_placement_before_publication_gate',
      note: 'Use this candidate to decide how the progression model should represent textbook editions that teach the same topic in different grades.'
    },
    safety: {
      writes_public_data: false,
      writes_textbook_unit_evidence_ids: false,
      official_standard_text_changed: false,
      requires_manual_review: true,
      cross_grade_evidence_is_diagnostic_only: true
    }
  }
}

function groupRowsByProgression(rows) {
  const groups = new Map()
  for (const row of rows || []) {
    if (!row.progression_group_id) continue
    if (!groups.has(row.progression_group_id)) groups.set(row.progression_group_id, [])
    groups.get(row.progression_group_id).push(row)
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}

function buildPayload(args) {
  const errors = []
  if (!existsSync(args.matrix)) errors.push(`Missing topic placement matrix: ${args.matrix}`)
  const matrix = errors.length ? { standard_placements: [] } : readJson(args.matrix)
  const candidates = []
  const summary = {
    placement_matrix_standards: matrix.summary?.standards_evaluated || 0,
    placement_matrix_reverse_gap_standards: matrix.summary?.standards_in_reverse_gap_report || 0,
    candidate_progression_groups: 0,
    review_standards: 0,
    same_grade_unit_evidence: 0,
    cross_grade_unit_evidence: 0,
    by_grade_band: {},
    by_progression_group_status: {}
  }

  for (const [, rows] of groupRowsByProgression(matrix.standard_placements || [])) {
    const candidate = buildCandidate(rows, args)
    if (!candidate) continue
    candidates.push(candidate)
    summary.review_standards += candidate.review_standards.length
    summary.same_grade_unit_evidence += candidate.placement_evidence.same_grade_units.length
    summary.cross_grade_unit_evidence += candidate.placement_evidence.cross_grade_units.length
    for (const grade of candidate.grade_bands) countInto(summary.by_grade_band, grade)
    countInto(summary.by_progression_group_status, candidate.review_status)
  }
  summary.candidate_progression_groups = candidates.length
  if (args.requireCandidates && !candidates.length) errors.push('requireCandidates is set but no placement candidates were produced')

  return {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    matrix: args.matrix,
    policy: {
      writes_public_data: false,
      candidate_type: 'edition_topic_placement_candidate',
      evidence_granularity: 'textbook_topic_placement_diagnostic',
      same_grade_unit_evidence_changed: false,
      cross_grade_units_are_diagnostic_only: true,
      max_units_per_standard: args.maxUnitsPerStandard
    },
    summary,
    candidates,
    errors
  }
}

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function unitLabel(unit) {
  const page = unit.page_range ? ` p.${unit.page_range}` : ''
  return `${unit.edition || '未知版本'} ${unit.unit_grade_band || '-'}《${unit.unit_title || '-'}》${page}`
}

function markdownSummary(payload) {
  const candidateRows = payload.candidates
    .map(candidate => {
      const standards = candidate.review_standards.map(row => `${row.standard_code}(${row.grade_band})`).join('；')
      const cross = candidate.placement_evidence.cross_grade_units.slice(0, 6).map(unitLabel).join('；')
      return `| ${candidate.progression_group_id} | ${markdownCell(candidate.topic_subdomains.join('；'))} | ${markdownCell(standards)} | ${candidate.placement_evidence.same_grade_units.length} | ${candidate.placement_evidence.cross_grade_units.length} | ${markdownCell(cross)} |`
    })
    .join('\n') || '| - | - | - | 0 | 0 | - |'
  const details = payload.candidates
    .map(candidate => {
      const standards = candidate.review_standards
        .map(row => `| ${row.standard_code} | ${row.grade_band} | ${markdownCell(row.subdomain)} | ${markdownCell(row.current_same_grade_editions.join('；'))} | ${markdownCell(row.missing_same_grade_editions.join('；'))} | ${markdownCell(row.missing_editions_with_cross_grade_topic.join('；'))} |`)
        .join('\n') || '| - | - | - | - | - | - |'
      const crossUnits = candidate.placement_evidence.cross_grade_units
        .map(unit => `| ${unit.source_standard_code} | ${markdownCell(unit.edition)} | ${unit.source_standard_grade_band} | ${unit.unit_grade_band} | ${markdownCell(unit.unit_title)} | ${markdownCell(unit.page_range || '-')} |`)
        .join('\n') || '| - | - | - | - | - | - |'
      return `### ${candidate.progression_group_id}

| standard | grade | subdomain | current same-grade editions | missing same-grade editions | missing editions with cross-grade topic |
| --- | --- | --- | --- | --- | --- |
${standards}

| source standard | edition | standard grade | unit grade | cross-grade unit | page |
| --- | --- | --- | --- | --- | --- |
${crossUnits}
`
    })
    .join('\n')

  return `# H4G Placement Evidence Candidate

生成时间：${payload.generated_at}

topic placement matrix：\`${payload.matrix}\`

## Summary

| 指标 | 数量 |
| --- | ---: |
| candidate progression groups | ${payload.summary.candidate_progression_groups} |
| review standards | ${payload.summary.review_standards} |
| same-grade unit evidence objects | ${payload.summary.same_grade_unit_evidence} |
| cross-grade unit evidence objects | ${payload.summary.cross_grade_unit_evidence} |

## Candidates

| progression group | topic | review standards | same-grade units | cross-grade units | cross-grade examples |
| --- | --- | --- | ---: | ---: | --- |
${candidateRows}

## Details

${details}

## Boundary

- This candidate pack is diagnostic and does not write \`public/data\`.
- Cross-grade units explain textbook edition placement differences.
- Cross-grade units must not be applied to \`textbook_unit_evidence_ids\` for same-grade standards.
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
    errors: payload.errors.length
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
