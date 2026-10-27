#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_sibling_context_repair_candidates_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_sibling_context_repair_candidates_anchor_domain_rejected_english_pe.md'

const DECISION_NEEDS_PUBLIC_SIBLING_CONTEXT_REPAIR = 'needs_public_sibling_progression_context_repair'

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    recommendations: DEFAULT_RECOMMENDATIONS,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--recommendations') args.recommendations = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_sibling_context_repair_candidates.js \\
  --strict --require-items

Builds a review-only repair candidate list from progression action evidence
recommendations whose next step is public sibling H4G context repair. The
candidate list does not write public/data, change official standard text,
auto-repair records, approve standards, or enable matcher/publication use.`)
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

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function truncate(value, max = 140) {
  const text = markdownCell(value)
  if (text.length <= max) return text
  return `${text.slice(0, max - 3)}...`
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

function validateRecommendations(recommendations, args, errors) {
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
  if (args.requireItems && !(recommendations.progression_action_evidence_recommendations || []).length) {
    errors.push('requireItems is set but progression action evidence recommendations has no rows')
  }
  validatePolicy('progression action evidence recommendations', recommendations, errors)
}

function candidatePolicy() {
  return {
    auto_repair_allowed: false,
    candidate_is_not_publication_approval: true,
    candidate_is_not_reviewer_decision: true,
    candidate_only: true,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    progression_action_sibling_context_repair_candidates_only: true,
    publication_ready: false,
    repair_candidate_only: true,
    requires_later_action_decision_edit: true,
    requires_later_matcher_gate: true,
    requires_later_public_data_repair_gate: true,
    requires_later_publication_gate: true,
    requires_later_split_review_decision_gate: true,
    review_only: true,
    sibling_context_repair_candidates_only: true,
    writes_public_data: false
  }
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

function buildCandidates(recommendations) {
  return (recommendations.progression_action_evidence_recommendations || [])
    .filter(row => row.recommended_reviewer_decision === DECISION_NEEDS_PUBLIC_SIBLING_CONTEXT_REPAIR)
    .map(candidateFromRecommendation)
    .sort((a, b) => Number(a.action_work_item_rank || 0) - Number(b.action_work_item_rank || 0) ||
      String(a.progression_group_id || '').localeCompare(String(b.progression_group_id || '')))
}

function summarize(candidates, recommendations) {
  const allRows = recommendations.progression_action_evidence_recommendations || []
  const repairRows = allRows.filter(row => row.recommended_reviewer_decision === DECISION_NEEDS_PUBLIC_SIBLING_CONTEXT_REPAIR)
  const coveredContrastIds = sorted(candidates.flatMap(row => row.source_progression_contrast_item_ids || []))
  const summary = {
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
    duplicate_candidates: candidates.length - sorted(candidates.map(row => row.source_progression_action_evidence_recommendation_id)).length,
    expected_sibling_context_repair_recommendations: repairRows.length,
    extra_candidates: 0,
    manual_confirmation_required_candidates: 0,
    missing_candidates: 0,
    missing_sibling_grade_band_instances: 0,
    official_decision_candidates: 0,
    public_write_candidates: 0,
    repair_candidates: candidates.length,
    row_mismatch_candidates: 0,
    sibling_context_repair_recommendations: repairRows.length,
    source_progression_action_evidence_recommendations: allRows.length,
    source_progression_contrast_items_covered: coveredContrastIds.length,
    unique_progression_groups: sorted(candidates.map(row => row.progression_group_id)).length,
    unique_standard_codes: sorted(candidates.flatMap(row => row.standard_codes || [])).length,
    unique_unit_evidence_ids: sorted(candidates.flatMap(row => row.unit_evidence_ids || [])).length
  }
  for (const row of candidates) {
    countInto(summary.by_existing_sibling_grade_context, row.existing_sibling_grade_context)
    countInto(summary.by_missing_sibling_grade_bands, sorted(row.missing_sibling_grade_bands || []).join('+') || 'none')
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision)
    countInto(summary.by_recommended_next_gate, row.recommended_next_gate)
    countInto(summary.by_repair_action, row.repair_action)
    countInto(summary.by_repair_candidate_status, row.repair_candidate_status)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_work_queue, row.work_queue)
    summary.missing_sibling_grade_band_instances += (row.missing_sibling_grade_bands || []).length
    if (row.manual_confirmation_required === true) summary.manual_confirmation_required_candidates += 1
    if (row.writes_public_data !== false || row.public_write_candidate !== false) summary.public_write_candidates += 1
    if (row.auto_repair === true || row.auto_repair_allowed === true) summary.auto_repair_candidates += 1
    if (row.recommendation_is_official_decision === true) summary.official_decision_candidates += 1
  }
  return summary
}

function validateCandidates(candidates, args, errors) {
  if (args.requireItems && !candidates.length) {
    errors.push('requireItems is set but sibling context repair candidates has no rows')
  }
  for (const row of candidates) {
    const prefix = row.repair_candidate_id || row.progression_group_id || '(missing repair candidate id)'
    if (row.recommended_reviewer_decision !== DECISION_NEEDS_PUBLIC_SIBLING_CONTEXT_REPAIR) {
      errors.push(`${prefix} recommended_reviewer_decision must be ${DECISION_NEEDS_PUBLIC_SIBLING_CONTEXT_REPAIR}`)
    }
    if (!Array.isArray(row.missing_sibling_grade_bands) || !row.missing_sibling_grade_bands.length) {
      errors.push(`${prefix} missing_sibling_grade_bands must be non-empty`)
    }
    if (row.public_write_candidate !== false || row.writes_public_data !== false) {
      errors.push(`${prefix} must not be a public write candidate`)
    }
    if (row.auto_repair !== false || row.auto_repair_allowed !== false) {
      errors.push(`${prefix} must not auto-repair`)
    }
    validatePolicy(prefix, row, errors)
  }
}

function previewRows(rows) {
  return rows.slice(0, 40).map(row => (
    `| ${row.action_work_item_rank} | ${markdownCell(row.progression_group_id)} | ${markdownCell((row.standard_codes || []).join(', '))} | ${markdownCell(row.existing_sibling_grade_context)} | ${markdownCell((row.missing_sibling_grade_bands || []).join(', '))} | ${truncate((row.unit_titles || []).join('; '), 100)} |`
  )).join('\n') || '| - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Sibling Context Repair Candidates

Generated at: ${payload.generated_at}

Source recommendations: \`${payload.source_progression_action_evidence_recommendations}\`

These rows are review-only repair candidates for progression groups whose
public sibling H4G context is incomplete. They explain why G7/G8/G9 cannot yet
be distinguished for these standards. They do not write \`public/data\`, change
official standard text, auto-repair records, approve standards, or enable
matcher/publication use.

## Status

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| candidate only | ${payload.candidate_only} |
| source recommendations | ${payload.summary.source_progression_action_evidence_recommendations} |
| sibling context repair recommendations | ${payload.summary.sibling_context_repair_recommendations} |
| repair candidates | ${payload.summary.repair_candidates} |
| missing sibling grade band instances | ${payload.summary.missing_sibling_grade_band_instances} |
| manual confirmation required candidates | ${payload.summary.manual_confirmation_required_candidates} |
| public write candidates | ${payload.summary.public_write_candidates} |
| auto repair candidates | ${payload.summary.auto_repair_candidates} |
| missing candidates | ${payload.summary.missing_candidates} |
| extra candidates | ${payload.summary.extra_candidates} |
| row mismatch candidates | ${payload.summary.row_mismatch_candidates} |

## Missing Sibling Bands

| missing sibling bands | candidates |
| --- | ---: |
${countRows(payload.summary.by_missing_sibling_grade_bands)}

## Existing Context

| existing sibling context | candidates |
| --- | ---: |
${countRows(payload.summary.by_existing_sibling_grade_context)}

## Preview

| rank | progression group | standards | existing context | missing context | units |
| ---: | --- | --- | --- | --- | --- |
${previewRows(payload.sibling_context_repair_candidates)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function build(args) {
  const errors = []
  if (!existsSync(args.recommendations)) errors.push(`Missing recommendations: ${args.recommendations}`)
  const recommendations = existsSync(args.recommendations) ? readJson(args.recommendations) : { progression_action_evidence_recommendations: [] }
  if (!errors.length) validateRecommendations(recommendations, args, errors)
  const candidates = buildCandidates(recommendations)
  validateCandidates(candidates, args, errors)
  const summary = summarize(candidates, recommendations)
  if (summary.duplicate_candidates) errors.push(`sibling context repair candidates have duplicate source recommendations: ${summary.duplicate_candidates}`)
  if (summary.public_write_candidates) errors.push(`sibling context repair candidates must not write public data: ${summary.public_write_candidates}`)
  if (summary.auto_repair_candidates) errors.push(`sibling context repair candidates must not auto-repair: ${summary.auto_repair_candidates}`)

  return {
    ...candidatePolicy(),
    action_sibling_context_repair_candidates_only: true,
    candidate_only: true,
    errors,
    generated_at: new Date().toISOString(),
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_sibling_context_repair_candidates',
    source_progression_action_evidence_recommendations: args.recommendations,
    sibling_context_repair_candidates: candidates,
    summary,
    valid: errors.length === 0
  }
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const payload = build(args)
writeJson(args.out, payload)
writeText(args.summaryOut, markdownSummary(payload))

if (args.strict && !payload.valid) {
  console.error(payload.errors.join('\n'))
  process.exit(1)
}
