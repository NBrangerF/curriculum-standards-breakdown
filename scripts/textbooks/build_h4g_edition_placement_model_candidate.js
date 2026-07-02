#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_progression_review_worklist.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_edition_placement_model_candidate.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_edition_placement_model_candidate.md'

function parseArgs(argv) {
  const args = {
    worklist: DEFAULT_WORKLIST,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireCandidates: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-candidates') args.requireCandidates = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_edition_placement_model_candidate.js \\
  --worklist generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_progression_review_worklist.json \\
  --strict --require-candidates

Builds a read-only candidate layer for H4G edition placement model decisions.
The output summarizes topics that appear in different grades across textbook
editions and never writes public data or textbook_unit_evidence_ids.`)
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

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

function gradeNumber(gradeBand) {
  const match = String(gradeBand || '').match(/H4G(\d+)/)
  return match ? Number(match[1]) : null
}

function relationFromGrades(sourceGrade, placementGrade) {
  const source = gradeNumber(sourceGrade)
  const placement = gradeNumber(placementGrade)
  if (!source || !placement) return 'unknown'
  if (placement === source) return 'same_grade'
  if (placement > source) return 'later_grade'
  return 'earlier_grade'
}

function placementRows(placementByEditionGrade) {
  const rows = []
  for (const [edition, grades] of Object.entries(placementByEditionGrade || {})) {
    for (const [gradeBand, detail] of Object.entries(grades || {})) {
      rows.push({
        edition,
        grade_band: gradeBand,
        unit_count: detail.unit_count || 0,
        source_standard_codes: detail.source_standard_codes || [],
        unit_titles: detail.unit_titles || []
      })
    }
  }
  return rows.sort((a, b) => {
    const edition = a.edition.localeCompare(b.edition)
    if (edition) return edition
    return a.grade_band.localeCompare(b.grade_band)
  })
}

function coverageForStandards(affectedStandards) {
  return (affectedStandards || []).map(standard => {
    const missing = new Set(standard.missing_same_grade_editions || [])
    const cross = new Set(standard.missing_editions_with_cross_grade_topic || [])
    const covered = [...missing].filter(edition => cross.has(edition))
    const uncovered = [...missing].filter(edition => !cross.has(edition))
    return {
      standard_code: standard.standard_code,
      grade_band: standard.grade_band,
      subdomain: standard.subdomain || '',
      current_same_grade_editions: standard.current_same_grade_editions || [],
      missing_same_grade_editions: [...missing].sort((a, b) => a.localeCompare(b)),
      editions_with_cross_grade_topic: [...cross].sort((a, b) => a.localeCompare(b)),
      cross_grade_covered_missing_editions: covered.sort((a, b) => a.localeCompare(b)),
      missing_editions_without_cross_grade_topic: uncovered.sort((a, b) => a.localeCompare(b)),
      missing_edition_count: missing.size,
      cross_grade_covered_count: covered.length,
      cross_grade_coverage_complete: missing.size > 0 && uncovered.length === 0
    }
  })
}

function placementRelations(affectedStandards, rows) {
  const byCode = new Map((affectedStandards || []).map(standard => [standard.standard_code, standard.grade_band]))
  const relations = []
  for (const row of rows) {
    for (const code of row.source_standard_codes || []) {
      const sourceGrade = byCode.get(code)
      if (!sourceGrade) continue
      relations.push({
        standard_code: code,
        source_grade_band: sourceGrade,
        edition: row.edition,
        unit_grade_band: row.grade_band,
        grade_relation: relationFromGrades(sourceGrade, row.grade_band),
        unit_count: row.unit_count,
        unit_titles: row.unit_titles
      })
    }
  }
  return relations.sort((a, b) => {
    const standard = a.standard_code.localeCompare(b.standard_code)
    if (standard) return standard
    const edition = a.edition.localeCompare(b.edition)
    if (edition) return edition
    return a.unit_grade_band.localeCompare(b.unit_grade_band)
  })
}

function gradeSpread(rows) {
  const grades = sorted(rows.map(row => row.grade_band))
  const editions = sorted(rows.map(row => row.edition))
  const byGrade = {}
  const byEdition = {}
  for (const row of rows) {
    countInto(byGrade, row.grade_band, row.unit_count)
    byEdition[row.edition] ||= []
    byEdition[row.edition].push(row.grade_band)
  }
  return {
    placement_grade_bands: grades,
    placement_grade_band_count: grades.length,
    editions,
    edition_count: editions.length,
    by_grade_band_unit_count: byGrade,
    by_edition_grade_bands: Object.fromEntries(Object.entries(byEdition)
      .map(([edition, gradeBands]) => [edition, sorted(gradeBands)])
      .sort(([a], [b]) => a.localeCompare(b)))
  }
}

function classifyCandidate(coverage, spread) {
  const affected = coverage.length
  const completeCoverage = coverage.filter(row => row.cross_grade_coverage_complete).length
  const uncoveredStandards = coverage.filter(row => row.missing_editions_without_cross_grade_topic.length)
  const hasMultiGradePlacement = spread.placement_grade_band_count > 1
  let decision = 'edition_variable_sequence_review'
  let recommendation = 'Add a progression-group level edition placement note after review; do not write cross-grade units as same-grade evidence.'
  let confidence = 'medium'

  if (hasMultiGradePlacement && affected > 0 && completeCoverage === affected) {
    decision = 'candidate_for_edition_placement_note'
    recommendation = 'Review as an edition-variable topic sequence. Keep standard records shared, and represent the cross-version grade placement at progression-group level.'
    confidence = 'high'
  } else if (hasMultiGradePlacement && uncoveredStandards.length) {
    decision = 'partial_edition_placement_evidence_needs_more_review'
    recommendation = 'Keep blocked and inspect the uncovered missing editions before defining a progression-group placement note.'
    confidence = 'medium'
  }

  return {
    decision,
    confidence,
    recommendation,
    has_multi_grade_placement: hasMultiGradePlacement,
    affected_standards: affected,
    standards_with_complete_cross_grade_coverage: completeCoverage,
    standards_with_uncovered_missing_editions: uncoveredStandards.map(row => row.standard_code)
  }
}

function buildCandidate(item) {
  const placement = placementRows(item.evidence_snapshot?.placement_by_edition_grade || {})
  const coverage = coverageForStandards(item.affected_standards || [])
  const spread = gradeSpread(placement)
  const model = classifyCandidate(coverage, spread)
  const relations = placementRelations(item.affected_standards || [], placement)
  return {
    candidate_id: `h4g_edition_model_${hashText(item.progression_group_id)}`,
    candidate_type: 'edition_placement_model_candidate',
    evidence_granularity: 'progression_group_edition_placement_diagnostic',
    source_work_item_id: item.work_item_id,
    progression_group_id: item.progression_group_id,
    subject_slug: item.subject_slug || 'math',
    topic_subdomains: item.topic_subdomains || [],
    standard_codes: item.standard_codes || [],
    affected_standards: coverage,
    placement_model: model,
    placement_summary: spread,
    placement_relations: relations,
    placement_by_edition_grade: item.evidence_snapshot?.placement_by_edition_grade || {},
    required_review: {
      decision_owner: 'curriculum_progression_review',
      question: '是否把该主题记录为 progression-group 级版本投放差异，而不是写入同年级 standard 证据？',
      recommended_publication_surface: 'progression_group_edition_placement_note',
      disallowed_publication_surface: 'same_grade_textbook_unit_evidence_ids'
    },
    safety: {
      writes_public_data: false,
      writes_textbook_unit_evidence_ids: false,
      official_standard_text_changed: false,
      cross_grade_evidence_is_diagnostic_only: true,
      requires_manual_review: true
    }
  }
}

function validateCandidates(payload) {
  const errors = []
  for (const candidate of payload.candidates) {
    if (candidate.safety?.writes_public_data !== false) errors.push(`${candidate.candidate_id} safety.writes_public_data must be false`)
    if (candidate.safety?.writes_textbook_unit_evidence_ids !== false) {
      errors.push(`${candidate.candidate_id} safety.writes_textbook_unit_evidence_ids must be false`)
    }
    if (candidate.safety?.cross_grade_evidence_is_diagnostic_only !== true) {
      errors.push(`${candidate.candidate_id} must mark cross-grade evidence as diagnostic only`)
    }
    if (!candidate.placement_model?.has_multi_grade_placement) {
      errors.push(`${candidate.candidate_id} has no multi-grade placement evidence`)
    }
    if (!candidate.placement_relations.length) {
      errors.push(`${candidate.candidate_id} has no standard-to-placement-grade relations`)
    }
    if (candidate.placement_model?.decision === 'candidate_for_edition_placement_note' &&
      candidate.placement_model.standards_with_uncovered_missing_editions.length) {
      errors.push(`${candidate.candidate_id} cannot be note-ready with uncovered missing editions`)
    }
  }
  return errors
}

function buildPayload(args) {
  const errors = []
  if (!existsSync(args.worklist)) errors.push(`Missing progression review worklist: ${args.worklist}`)
  const worklist = errors.length ? { work_items: [] } : readJson(args.worklist)
  if (worklist.valid === false) errors.push('Progression review worklist is marked valid=false')
  if (worklist.policy?.writes_public_data !== false) errors.push('Worklist policy.writes_public_data must be false')
  if (worklist.policy?.writes_textbook_unit_evidence_ids !== false) {
    errors.push('Worklist policy.writes_textbook_unit_evidence_ids must be false')
  }

  const candidates = (worklist.work_items || [])
    .filter(item => item.work_item_type === 'edition_placement_model_review')
    .map(buildCandidate)
    .sort((a, b) => a.progression_group_id.localeCompare(b.progression_group_id))

  if (args.requireCandidates && !candidates.length) errors.push('requireCandidates is set but no candidates were produced')

  const summary = {
    candidates: candidates.length,
    affected_standards: 0,
    candidate_for_edition_placement_note: 0,
    partial_edition_placement_evidence_needs_more_review: 0,
    cross_grade_diagnostic_relations: 0,
    by_model_decision: {},
    by_confidence: {},
    by_grade_spread_count: {},
    by_topic: {}
  }

  for (const candidate of candidates) {
    const decision = candidate.placement_model.decision
    countInto(summary.by_model_decision, decision)
    countInto(summary.by_confidence, candidate.placement_model.confidence)
    countInto(summary.by_grade_spread_count, String(candidate.placement_summary.placement_grade_band_count))
    for (const topic of candidate.topic_subdomains) countInto(summary.by_topic, topic)
    summary.affected_standards += candidate.affected_standards.length
    summary.cross_grade_diagnostic_relations += candidate.placement_relations
      .filter(row => row.grade_relation !== 'same_grade').length
    if (decision === 'candidate_for_edition_placement_note') summary.candidate_for_edition_placement_note += 1
    if (decision === 'partial_edition_placement_evidence_needs_more_review') {
      summary.partial_edition_placement_evidence_needs_more_review += 1
    }
  }

  const payload = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    source_worklist: args.worklist,
    policy: {
      writes_public_data: false,
      writes_textbook_unit_evidence_ids: false,
      official_standard_text_changed: false,
      cross_grade_evidence_is_diagnostic_only: true,
      publication_candidate: false,
      purpose: 'pre_publication_edition_placement_model_candidate'
    },
    summary,
    candidates,
    errors
  }
  payload.errors.push(...validateCandidates(payload))
  payload.valid = payload.errors.length === 0
  return payload
}

function candidateRow(candidate) {
  const topics = candidate.topic_subdomains.join('；') || '-'
  const grades = candidate.placement_summary.placement_grade_bands.join('；') || '-'
  const uncovered = candidate.placement_model.standards_with_uncovered_missing_editions.join('；') || '-'
  return `| ${candidate.progression_group_id} | ${markdownCell(topics)} | ${candidate.placement_model.decision} | ${candidate.placement_model.confidence} | ${grades} | ${candidate.affected_standards.length} | ${uncovered} |`
}

function relationRows(candidate) {
  return candidate.placement_relations
    .map(row => `| ${candidate.progression_group_id} | ${row.standard_code} | ${row.source_grade_band} | ${markdownCell(row.edition)} | ${row.unit_grade_band} | ${row.grade_relation} | ${row.unit_count} | ${markdownCell((row.unit_titles || []).slice(0, 4).join('；') || '-')} |`)
    .join('\n')
}

function markdownSummary(payload) {
  const candidateRows = payload.candidates.map(candidateRow).join('\n') || '| - | - | - | - | - | 0 | - |'
  const relations = payload.candidates.map(relationRows).filter(Boolean).join('\n') || '| - | - | - | - | - | - | 0 | - |'

  return `# H4G Edition Placement Model Candidate

生成时间：${payload.generated_at}

source worklist：\`${payload.source_worklist}\`

## Summary

| 指标 | 数量 |
| --- | ---: |
| candidates | ${payload.summary.candidates} |
| affected standards | ${payload.summary.affected_standards} |
| candidate for edition placement note | ${payload.summary.candidate_for_edition_placement_note} |
| partial evidence needs more review | ${payload.summary.partial_edition_placement_evidence_needs_more_review} |
| cross-grade diagnostic relations | ${payload.summary.cross_grade_diagnostic_relations} |

## Model Decisions

| decision | count |
| --- | ---: |
${countRows(payload.summary.by_model_decision)}

## Candidates

| progression group | topic | model decision | confidence | placement grades | affected standards | uncovered standards |
| --- | --- | --- | --- | --- | ---: | --- |
${candidateRows}

## Placement Relations

| progression group | standard | source grade | edition | unit grade | relation | units | unit examples |
| --- | --- | --- | --- | --- | --- | ---: | --- |
${relations}

## Boundary

- This file is a progression-group level model candidate, not a data write.
- Cross-grade textbook units explain edition placement differences only.
- Do not write cross-grade units to same-grade \`textbook_unit_evidence_ids\`.
- \`candidate_for_edition_placement_note\` still requires curriculum review before any public-facing note is added.
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
