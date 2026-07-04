#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_CANDIDATES = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_sibling_context_repair_candidates_anchor_domain_rejected_english_pe.json'
const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_sibling_context_repair_candidates_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_sibling_context_repair_candidates_anchor_domain_rejected_english_pe_audit.md'

const DECISION_NEEDS_PUBLIC_SIBLING_CONTEXT_REPAIR = 'needs_public_sibling_progression_context_repair'

function parseArgs(argv) {
  const args = {
    candidates: DEFAULT_CANDIDATES,
    out: DEFAULT_OUT,
    recommendations: DEFAULT_RECOMMENDATIONS,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidates') args.candidates = argv[++i]
    else if (item === '--recommendations') args.recommendations = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_sibling_context_repair_candidates.js \\
  --strict --require-items

Audits the H4G sibling context repair candidates by recomputing them from the
source progression action evidence recommendations.`)
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

function sameJson(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right))
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

function validatePolicy(label, payload, errors) {
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'direct_matcher_use',
    'eligible_for_h4g_differentiation',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (payload[key] !== false) errors.push(`${label} ${key} must be false`)
  }
}

function validateRecommendations(recommendations, errors) {
  if (recommendations.valid !== true) errors.push('progression action evidence recommendations valid must be true')
  if ((recommendations.errors || []).length) errors.push('progression action evidence recommendations errors must be empty')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_recommendations') {
    errors.push('progression action evidence recommendations purpose mismatch')
  }
  for (const key of ['action_evidence_recommendations_only', 'progression_action_evidence_recommendations_only', 'recommendation_only', 'review_only']) {
    if (recommendations[key] !== true) errors.push(`progression action evidence recommendations ${key} must be true`)
  }
  if (!Array.isArray(recommendations.progression_action_evidence_recommendations)) {
    errors.push('progression action evidence recommendations rows must be an array')
  }
  validatePolicy('progression action evidence recommendations', recommendations, errors)
}

function validateCandidatesTopLevel(candidates, args, errors) {
  if (candidates.valid !== true) errors.push('sibling context repair candidates valid must be true')
  if ((candidates.errors || []).length) errors.push('sibling context repair candidates errors must be empty')
  if (candidates.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_sibling_context_repair_candidates') {
    errors.push('sibling context repair candidates purpose mismatch')
  }
  for (const key of ['action_sibling_context_repair_candidates_only', 'candidate_only', 'progression_action_sibling_context_repair_candidates_only', 'review_only', 'sibling_context_repair_candidates_only']) {
    if (candidates[key] !== true) errors.push(`sibling context repair candidates ${key} must be true`)
  }
  if (candidates.source_progression_action_evidence_recommendations !== args.recommendations) {
    errors.push('sibling context repair candidates source recommendations must match arg')
  }
  if (!Array.isArray(candidates.sibling_context_repair_candidates)) {
    errors.push('sibling context repair candidates rows must be an array')
  }
  validatePolicy('sibling context repair candidates', candidates, errors)
}

function repairCandidateId(recommendation) {
  const seed = recommendation.progression_action_evidence_recommendation_id ||
    recommendation.source_progression_evidence_packet_item_id ||
    recommendation.source_progression_action_decision_id ||
    recommendation.progression_group_id
  return `h4g_anchor_group_post_candidate_source_anchor_exact_group_split_review_progression_action_sibling_context_repair_candidate_${hashText(seed)}`
}

function requiredRepairEvidence(row) {
  const missing = row.missing_sibling_grade_bands || []
  const evidence = [
    'Confirm the existing public H4G sibling progression group and preserve the official standard text.',
    'Locate or restore public sibling progression records for every missing H4G grade band.',
    'Record source path, subject, progression group, standard code, and reviewer metadata before any data edit.',
    'Rerun the progression contrast packet and action evidence recommendation layer after repair.'
  ]
  for (const gradeBand of missing) {
    evidence.push(`Provide public sibling context evidence for ${gradeBand}.`)
  }
  return evidence
}

function repairConfirmations(row) {
  const missing = new Set(row.missing_sibling_grade_bands || [])
  return {
    h4g7_public_sibling_context_found: missing.has('H4G7') ? false : true,
    h4g8_current_context_preserved: row.sibling_grade_context === 'H4G8',
    h4g9_public_sibling_context_found: missing.has('H4G9') ? false : true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    rerun_progression_contrast_after_repair: true,
    reviewer_metadata_recorded: false
  }
}

function candidateFromRecommendation(row) {
  const missing = row.missing_sibling_grade_bands || []
  return {
    action_work_item_rank: Number(row.action_work_item_rank || 0),
    auto_repair: false,
    auto_repair_allowed: false,
    candidate_only: true,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    evidence_assessment: row.evidence_assessment || '',
    evidence_excerpt_examples: row.evidence_excerpt_examples || [],
    existing_sibling_grade_context: row.sibling_grade_context || '',
    has_full_h4g_triplet_context: row.has_full_h4g_triplet_context === true,
    manual_confirmation_required: true,
    matcher_ready: false,
    missing_sibling_grade_bands: missing,
    official_standard_texts_identical_across_siblings: row.official_standard_texts_identical_across_siblings === true,
    priority_tier: row.priority_tier || '',
    progression_action_sibling_context_repair_candidates_only: true,
    progression_group_id: row.progression_group_id || '',
    public_write_candidate: false,
    publication_ready: false,
    recommended_next_gate: row.recommended_next_gate || 'repair_public_h4g_sibling_progression_context_then_rerun_contrast_packet',
    recommended_reviewer_decision: row.recommended_reviewer_decision || '',
    repair_action: 'collect_or_restore_public_sibling_progression_records',
    repair_candidate_id: repairCandidateId(row),
    repair_candidate_status: 'needs_public_sibling_progression_context_repair',
    repair_note: 'Review-only candidate: repair missing public H4G sibling context before judging whether this progression group can distinguish G7/G8/G9.',
    repair_route: 'repair_public_sibling_progression_context_before_evidence_judgement',
    required_repair_confirmations: repairConfirmations(row),
    required_repair_evidence: requiredRepairEvidence(row),
    review_only: true,
    sibling_comparison_status: row.sibling_comparison_status || '',
    sibling_context_repair_candidates_only: true,
    sibling_context_status: row.sibling_context_status || '',
    source_progression_action_decision_id: row.source_progression_action_decision_id || '',
    source_progression_action_evidence_recommendation_id: row.progression_action_evidence_recommendation_id || '',
    source_progression_action_work_item_id: row.source_progression_action_work_item_id || '',
    source_progression_contrast_item_count: Number(row.source_progression_contrast_item_count || (row.source_progression_contrast_item_ids || []).length || 0),
    source_progression_contrast_item_ids: row.source_progression_contrast_item_ids || [],
    source_progression_evidence_packet_item_id: row.source_progression_evidence_packet_item_id || '',
    standard_codes: row.standard_codes || [],
    subject_slug: row.subject_slug || '',
    unit_evidence_ids: row.unit_evidence_ids || [],
    unit_titles: row.unit_titles || [],
    work_queue: row.work_queue || '',
    writes_public_data: false
  }
}

function expectedCandidates(recommendations) {
  return (recommendations.progression_action_evidence_recommendations || [])
    .filter(row => row.recommended_reviewer_decision === DECISION_NEEDS_PUBLIC_SIBLING_CONTEXT_REPAIR)
    .map(candidateFromRecommendation)
    .sort((a, b) => Number(a.action_work_item_rank || 0) - Number(b.action_work_item_rank || 0) ||
      String(a.progression_group_id || '').localeCompare(String(b.progression_group_id || '')))
}

function mapBy(rows, key, errors, label) {
  const out = new Map()
  for (const row of rows || []) {
    const id = row[key] || ''
    if (!id) {
      errors.push(`${label} row missing ${key}`)
      continue
    }
    if (out.has(id)) errors.push(`${label} duplicate ${key}: ${id}`)
    out.set(id, row)
  }
  return out
}

function emptyStats(recommendations) {
  const allRows = recommendations.progression_action_evidence_recommendations || []
  const repairRows = allRows.filter(row => row.recommended_reviewer_decision === DECISION_NEEDS_PUBLIC_SIBLING_CONTEXT_REPAIR)
  return {
    auto_repair_candidates: 0,
    by_existing_sibling_grade_context: {},
    by_missing_sibling_grade_bands: {},
    by_priority_tier: {},
    by_recommendation: {},
    by_recommended_next_gate: {},
    by_repair_action: {},
    by_repair_candidate_status: {},
    by_subject: {},
    by_work_queue: {},
    duplicate_candidates: 0,
    expected_sibling_context_repair_recommendations: repairRows.length,
    extra_candidates: 0,
    manual_confirmation_required_candidates: 0,
    missing_candidates: 0,
    missing_sibling_grade_band_instances: 0,
    official_decision_candidates: 0,
    public_write_candidates: 0,
    repair_candidates: 0,
    row_mismatch_candidates: 0,
    sibling_context_repair_recommendations: repairRows.length,
    source_progression_action_evidence_recommendations: allRows.length,
    source_progression_contrast_items_covered: 0,
    unique_progression_groups: new Set(repairRows.map(row => row.progression_group_id).filter(Boolean)).size,
    unique_standard_codes: new Set(repairRows.flatMap(row => row.standard_codes || []).filter(Boolean)).size,
    unique_unit_evidence_ids: new Set(repairRows.flatMap(row => row.unit_evidence_ids || []).filter(Boolean)).size
  }
}

function auditCandidate(row, expected, errors, stats, coveredContrastIds) {
  const prefix = row.repair_candidate_id || row.source_progression_action_evidence_recommendation_id || '(missing repair candidate id)'
  if (!expected) {
    stats.extra_candidates += 1
    errors.push(`${prefix} source repair recommendation not found`)
    return
  }
  if (!sameJson(row, expected)) {
    stats.row_mismatch_candidates += 1
    errors.push(`${prefix} does not match recomputed sibling context repair candidate`)
  }
  if (row.candidate_only !== true || row.review_only !== true) errors.push(`${prefix} must be candidate-only and review-only`)
  if (row.recommended_reviewer_decision !== DECISION_NEEDS_PUBLIC_SIBLING_CONTEXT_REPAIR) {
    errors.push(`${prefix} recommended_reviewer_decision must be ${DECISION_NEEDS_PUBLIC_SIBLING_CONTEXT_REPAIR}`)
  }
  if (!Array.isArray(row.missing_sibling_grade_bands) || !row.missing_sibling_grade_bands.length) {
    errors.push(`${prefix} missing_sibling_grade_bands must be non-empty`)
  }
  if (!Array.isArray(row.required_repair_evidence) || !row.required_repair_evidence.length) {
    errors.push(`${prefix} required_repair_evidence must be non-empty`)
  }
  if (row.writes_public_data !== false || row.public_write_candidate !== false) stats.public_write_candidates += 1
  if (row.auto_repair === true || row.auto_repair_allowed === true) stats.auto_repair_candidates += 1
  if (row.recommendation_is_official_decision === true) stats.official_decision_candidates += 1
  if (row.manual_confirmation_required === true) stats.manual_confirmation_required_candidates += 1
  for (const id of row.source_progression_contrast_item_ids || []) coveredContrastIds.add(id)
  stats.repair_candidates += 1
  stats.missing_sibling_grade_band_instances += (row.missing_sibling_grade_bands || []).length
  countInto(stats.by_existing_sibling_grade_context, row.existing_sibling_grade_context)
  countInto(stats.by_missing_sibling_grade_bands, sorted(row.missing_sibling_grade_bands || []).join('+') || 'none')
  countInto(stats.by_priority_tier, row.priority_tier)
  countInto(stats.by_recommendation, row.recommended_reviewer_decision)
  countInto(stats.by_recommended_next_gate, row.recommended_next_gate)
  countInto(stats.by_repair_action, row.repair_action)
  countInto(stats.by_repair_candidate_status, row.repair_candidate_status)
  countInto(stats.by_subject, row.subject_slug)
  countInto(stats.by_work_queue, row.work_queue)
  validatePolicy(prefix, row, errors)
}

function validateSummary(candidates, stats, errors) {
  const summary = candidates.summary || {}
  for (const key of [
    'auto_repair_candidates',
    'duplicate_candidates',
    'expected_sibling_context_repair_recommendations',
    'extra_candidates',
    'manual_confirmation_required_candidates',
    'missing_candidates',
    'missing_sibling_grade_band_instances',
    'official_decision_candidates',
    'public_write_candidates',
    'repair_candidates',
    'row_mismatch_candidates',
    'sibling_context_repair_recommendations',
    'source_progression_action_evidence_recommendations',
    'source_progression_contrast_items_covered',
    'unique_progression_groups',
    'unique_standard_codes',
    'unique_unit_evidence_ids'
  ]) {
    if (Number(summary[key] || 0) !== Number(stats[key] || 0)) errors.push(`summary.${key} mismatch`)
  }
  for (const key of [
    'by_existing_sibling_grade_context',
    'by_missing_sibling_grade_bands',
    'by_priority_tier',
    'by_recommendation',
    'by_recommended_next_gate',
    'by_repair_action',
    'by_repair_candidate_status',
    'by_subject',
    'by_work_queue'
  ]) {
    if (!sameJson(summary[key] || {}, stats[key] || {})) errors.push(`summary.${key} mismatch`)
  }
}

function markdownSummary(payload) {
  return `# H4G Sibling Context Repair Candidates Audit

Generated at: ${payload.generated_at}

## Status

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| expected repair recommendations | ${payload.summary.expected_sibling_context_repair_recommendations} |
| repair candidates | ${payload.summary.repair_candidates} |
| missing candidates | ${payload.summary.missing_candidates} |
| extra candidates | ${payload.summary.extra_candidates} |
| row mismatch candidates | ${payload.summary.row_mismatch_candidates} |
| manual confirmation required candidates | ${payload.summary.manual_confirmation_required_candidates} |
| public write candidates | ${payload.summary.public_write_candidates} |
| auto repair candidates | ${payload.summary.auto_repair_candidates} |

## Missing Sibling Bands

| missing sibling bands | candidates |
| --- | ---: |
${countRows(payload.summary.by_missing_sibling_grade_bands)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of Object.entries({
    candidates: args.candidates,
    recommendations: args.recommendations
  })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const candidates = existsSync(args.candidates) ? readJson(args.candidates) : { sibling_context_repair_candidates: [] }
  const recommendations = existsSync(args.recommendations) ? readJson(args.recommendations) : { progression_action_evidence_recommendations: [] }
  if (!errors.length) {
    validateCandidatesTopLevel(candidates, args, errors)
    validateRecommendations(recommendations, errors)
  }

  const expectedRows = expectedCandidates(recommendations)
  const expectedByRecommendation = mapBy(expectedRows, 'source_progression_action_evidence_recommendation_id', errors, 'expected sibling context repair candidate')
  const candidateByRecommendation = mapBy(candidates.sibling_context_repair_candidates || [], 'source_progression_action_evidence_recommendation_id', errors, 'sibling context repair candidate')
  const stats = emptyStats(recommendations)
  stats.duplicate_candidates = (candidates.sibling_context_repair_candidates || []).length -
    sorted((candidates.sibling_context_repair_candidates || []).map(row => row.source_progression_action_evidence_recommendation_id)).length

  const coveredContrastIds = new Set()
  for (const row of candidates.sibling_context_repair_candidates || []) {
    auditCandidate(row, expectedByRecommendation.get(row.source_progression_action_evidence_recommendation_id), errors, stats, coveredContrastIds)
  }
  for (const expected of expectedRows) {
    if (!candidateByRecommendation.has(expected.source_progression_action_evidence_recommendation_id)) {
      stats.missing_candidates += 1
      errors.push(`${expected.source_progression_action_evidence_recommendation_id} missing sibling context repair candidate`)
    }
  }
  stats.source_progression_contrast_items_covered = coveredContrastIds.size

  if (args.requireItems && !expectedRows.length) {
    errors.push('requireItems is set but no expected sibling context repair recommendations exist')
  }
  if (args.requireItems && !(candidates.sibling_context_repair_candidates || []).length) {
    errors.push('requireItems is set but sibling context repair candidates has no rows')
  }
  if (stats.duplicate_candidates) errors.push(`sibling context repair candidates have duplicate source recommendations: ${stats.duplicate_candidates}`)
  if (stats.public_write_candidates) errors.push(`sibling context repair candidates must not write public data: ${stats.public_write_candidates}`)
  if (stats.auto_repair_candidates) errors.push(`sibling context repair candidates must not auto-repair: ${stats.auto_repair_candidates}`)
  if (stats.official_decision_candidates) {
    errors.push(`sibling context repair candidates must not be official decisions: ${stats.official_decision_candidates}`)
  }
  validateSummary(candidates, stats, errors)

  return {
    audit_only: true,
    candidates: args.candidates,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_sibling_context_repair_candidates_audit',
    publication_ready: false,
    recommendations: args.recommendations,
    review_only: true,
    summary: stats,
    valid: errors.length === 0,
    writes_public_data: false
  }
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const payload = audit(args)
writeJson(args.out, payload)
writeText(args.summaryOut, markdownSummary(payload))

if (args.strict && !payload.valid) {
  console.error(payload.errors.join('\n'))
  process.exit(1)
}
