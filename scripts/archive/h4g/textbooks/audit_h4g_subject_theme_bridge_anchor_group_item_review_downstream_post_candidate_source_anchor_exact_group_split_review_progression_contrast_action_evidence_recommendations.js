#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_recommendations_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_recommendations_anchor_domain_rejected_english_pe_audit.md'

const DECISION_PENDING = 'pending'
const DECISION_CONFIRM_SIBLING_CONTEXT_REPAIRED = 'confirm_sibling_progression_context_repaired_for_later_evidence_review'
const DECISION_NEEDS_PUBLIC_SIBLING_CONTEXT_REPAIR = 'needs_public_sibling_progression_context_repair'
const DECISION_NOT_FULL_TRIPLET = 'mark_progression_group_not_full_h4g_triplet'
const DECISION_CONFIRM_CURRENT_GRADE_EVIDENCE = 'confirm_current_grade_specific_evidence_for_later_split_decision'
const DECISION_NEEDS_MORE_GRADE_EVIDENCE = 'needs_more_grade_specific_source_evidence'
const DECISION_REJECT_CURRENT_GRADE_GENERIC = 'reject_current_grade_anchor_as_shared_or_generic'
const DECISION_CONFIRM_SIBLING_EVIDENCE_COLLECTED = 'confirm_sibling_grade_evidence_collected_for_later_split_decision'
const DECISION_NEEDS_SIBLING_GRADE_EVIDENCE = 'needs_sibling_grade_source_evidence'
const DECISION_REJECT_UNTIL_SIBLING_EVIDENCE = 'reject_progression_action_until_sibling_evidence_exists'
const KNOWN_DECISIONS = new Set([
  DECISION_PENDING,
  DECISION_CONFIRM_SIBLING_CONTEXT_REPAIRED,
  DECISION_NEEDS_PUBLIC_SIBLING_CONTEXT_REPAIR,
  DECISION_NOT_FULL_TRIPLET,
  DECISION_CONFIRM_CURRENT_GRADE_EVIDENCE,
  DECISION_NEEDS_MORE_GRADE_EVIDENCE,
  DECISION_REJECT_CURRENT_GRADE_GENERIC,
  DECISION_CONFIRM_SIBLING_EVIDENCE_COLLECTED,
  DECISION_NEEDS_SIBLING_GRADE_EVIDENCE,
  DECISION_REJECT_UNTIL_SIBLING_EVIDENCE
])

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    packet: DEFAULT_PACKET,
    recommendations: DEFAULT_RECOMMENDATIONS,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--recommendations') args.recommendations = argv[++i]
    else if (item === '--packet') args.packet = argv[++i]
    else if (item === '--decisions') args.decisions = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_recommendations.js \\
  --strict --require-items

Audits the H4G progression action evidence recommendations by recomputing every
recommendation from the source evidence packet and action decisions template.`)
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

function uniqueStrings(values) {
  const seen = new Set()
  const out = []
  for (const value of values || []) {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
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

function validateRecommendationPolicy(label, policy, errors) {
  for (const key of [
    'progression_action_evidence_recommendations_only',
    'recommendation_is_not_publication_approval',
    'recommendation_is_not_reviewer_decision',
    'recommendation_only',
    'requires_later_action_decision_edit',
    'requires_later_matcher_gate',
    'requires_later_publication_gate',
    'requires_later_split_review_decision_gate',
    'review_only'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  validatePolicy(label, policy, errors)
}

function validateTopLevel(recommendations, packet, decisions, args, errors) {
  if (recommendations.valid !== true) errors.push('progression action evidence recommendations valid must be true')
  if ((recommendations.errors || []).length) errors.push('progression action evidence recommendations errors must be empty')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_recommendations') {
    errors.push('progression action evidence recommendations purpose mismatch')
  }
  for (const key of ['action_evidence_recommendations_only', 'progression_action_evidence_recommendations_only', 'recommendation_only', 'review_only']) {
    if (recommendations[key] !== true) errors.push(`progression action evidence recommendations ${key} must be true`)
  }
  if (recommendations.source_progression_action_evidence_packet !== args.packet) {
    errors.push('progression action evidence recommendations source_progression_action_evidence_packet must match arg')
  }
  if (recommendations.source_progression_action_decisions !== args.decisions) {
    errors.push('progression action evidence recommendations source_progression_action_decisions must match arg')
  }
  if (!Array.isArray(recommendations.progression_action_evidence_recommendations)) {
    errors.push('progression action evidence recommendations rows must be an array')
  }
  validatePolicy('progression action evidence recommendations', recommendations, errors)
  validateRecommendationPolicy('progression action evidence recommendations policy', recommendations.policy || {}, errors)

  if (packet.valid !== true) errors.push('progression action evidence packet valid must be true')
  if ((packet.errors || []).length) errors.push('progression action evidence packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_packet') {
    errors.push('progression action evidence packet purpose mismatch')
  }
  if (packet.source_progression_action_decisions !== args.decisions) {
    errors.push('progression action evidence packet source_progression_action_decisions must match arg')
  }
  if (!Array.isArray(packet.progression_action_evidence_items)) {
    errors.push('progression action evidence packet rows must be an array')
  }
  validatePolicy('progression action evidence packet', packet, errors)

  if (decisions.valid !== true) errors.push('progression action decisions valid must be true')
  if ((decisions.errors || []).length) errors.push('progression action decisions errors must be empty')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_decisions_template') {
    errors.push('progression action decisions purpose mismatch')
  }
  if (!Array.isArray(decisions.progression_action_decisions)) {
    errors.push('progression action decisions rows must be an array')
  }
  validatePolicy('progression action decisions', decisions, errors)
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

function recommendationId(evidenceItem, decision) {
  return `h4g_anchor_group_post_candidate_source_anchor_exact_group_split_review_progression_action_evidence_recommendation_${hashText(evidenceItem.evidence_packet_item_id || decision.decision_id)}`
}

function routeDefaultDecision(route) {
  if (route === 'missing_public_sibling_progression_context') return DECISION_NEEDS_PUBLIC_SIBLING_CONTEXT_REPAIR
  if (route === 'identical_official_standard_current_grade_only_source_evidence') return DECISION_NEEDS_MORE_GRADE_EVIDENCE
  if (route === 'identical_official_standard_no_public_unit_evidence_yet') return DECISION_NEEDS_SIBLING_GRADE_EVIDENCE
  return DECISION_PENDING
}

function recommendedReviewerDecision(evidenceItem, decision) {
  const reviewerDecision = decision.reviewer_decision || ''
  if (decision.decision_status === 'reviewed' && reviewerDecision !== DECISION_PENDING && KNOWN_DECISIONS.has(reviewerDecision)) {
    return reviewerDecision
  }
  return routeDefaultDecision(evidenceItem.selected_contrast_route || decision.selected_contrast_route || '')
}

function recommendationOrigin(evidenceItem, decision, recommendation) {
  if (decision.decision_status === 'reviewed' && decision.reviewer_decision === recommendation) return 'reviewed_action_decision'
  if (recommendation === DECISION_PENDING) return 'manual_progression_route_unresolved'
  return 'structural_evidence_route'
}

function recommendationRoute(recommendation) {
  if (recommendation === DECISION_NEEDS_PUBLIC_SIBLING_CONTEXT_REPAIR) return 'repair_public_sibling_progression_context_before_evidence_judgement'
  if (recommendation === DECISION_CONFIRM_SIBLING_CONTEXT_REPAIRED) return 'rerun_progression_evidence_review_after_sibling_context_repair'
  if (recommendation === DECISION_NOT_FULL_TRIPLET) return 'exclude_or_repair_non_full_h4g_triplet_progression_group'
  if (recommendation === DECISION_NEEDS_MORE_GRADE_EVIDENCE) return 'collect_or_record_more_grade_specific_source_evidence'
  if (recommendation === DECISION_CONFIRM_CURRENT_GRADE_EVIDENCE) return 'current_grade_specific_evidence_candidate_for_later_split_decision'
  if (recommendation === DECISION_REJECT_CURRENT_GRADE_GENERIC) return 'reject_current_grade_anchor_as_shared_or_generic'
  if (recommendation === DECISION_NEEDS_SIBLING_GRADE_EVIDENCE) return 'collect_sibling_grade_source_evidence_before_split_decision'
  if (recommendation === DECISION_CONFIRM_SIBLING_EVIDENCE_COLLECTED) return 'sibling_grade_evidence_candidate_for_later_split_decision'
  if (recommendation === DECISION_REJECT_UNTIL_SIBLING_EVIDENCE) return 'reject_progression_action_until_sibling_evidence_exists'
  return 'progression_action_evidence_review_still_pending'
}

function recommendedNextGate(recommendation) {
  if (recommendation === DECISION_NEEDS_PUBLIC_SIBLING_CONTEXT_REPAIR) return 'repair_public_h4g_sibling_progression_context_then_rerun_contrast_packet'
  if (recommendation === DECISION_CONFIRM_SIBLING_CONTEXT_REPAIRED) return 'rerun_progression_contrast_action_evidence_packet_after_context_repair'
  if (recommendation === DECISION_NOT_FULL_TRIPLET) return 'non_full_h4g_triplet_scope_decision_before_split_review'
  if (recommendation === DECISION_NEEDS_MORE_GRADE_EVIDENCE) return 'record_grade_specific_page_activity_task_evidence_then_compare_sibling_grades'
  if (recommendation === DECISION_CONFIRM_CURRENT_GRADE_EVIDENCE) return 'later_split_review_decision_gate_after_manual_confirmation'
  if (recommendation === DECISION_REJECT_CURRENT_GRADE_GENERIC) return 'progression_action_rejection_audit_before_any_data_edit'
  if (recommendation === DECISION_NEEDS_SIBLING_GRADE_EVIDENCE) return 'collect_sibling_grade_source_evidence_then_rerun_progression_evidence_review'
  if (recommendation === DECISION_CONFIRM_SIBLING_EVIDENCE_COLLECTED) return 'later_split_review_decision_gate_after_sibling_evidence_confirmation'
  if (recommendation === DECISION_REJECT_UNTIL_SIBLING_EVIDENCE) return 'progression_action_rejection_audit_before_any_data_edit'
  return 'complete_progression_action_evidence_review_before_routing'
}

function evidenceAssessment(evidenceItem) {
  const route = evidenceItem.selected_contrast_route || ''
  if (route === 'missing_public_sibling_progression_context') return 'needs_public_sibling_progression_context_repair'
  if (route === 'identical_official_standard_current_grade_only_source_evidence') return 'needs_more_grade_specific_source_evidence'
  if (route === 'identical_official_standard_no_public_unit_evidence_yet') return 'needs_sibling_grade_source_evidence'
  return 'manual_progression_evidence_assessment_required'
}

function gradeSpecificitySignal(evidenceItem) {
  const route = evidenceItem.selected_contrast_route || ''
  if (route === 'missing_public_sibling_progression_context') return 'unassessable_until_full_h4g_sibling_context_exists'
  if (route === 'identical_official_standard_current_grade_only_source_evidence') {
    return 'current_grade_text_evidence_present_but_sibling_grade_comparison_required'
  }
  if (route === 'identical_official_standard_no_public_unit_evidence_yet') return 'sibling_grade_source_evidence_missing'
  return 'manual_progression_text_check_required'
}

function siblingComparisonStatus(evidenceItem) {
  if ((evidenceItem.missing_sibling_grade_bands || []).length) return 'missing_public_sibling_context'
  if (evidenceItem.selected_contrast_route === 'identical_official_standard_no_public_unit_evidence_yet') {
    return 'missing_sibling_grade_source_evidence'
  }
  if (evidenceItem.selected_contrast_route === 'identical_official_standard_current_grade_only_source_evidence') {
    return 'official_text_identical_source_evidence_not_yet_compared_across_siblings'
  }
  return 'manual_sibling_comparison_required'
}

function recommendationConfidence(evidenceItem, decision, recommendation) {
  if (decision.decision_status === 'reviewed' && decision.reviewer_decision === recommendation) return 'medium'
  if (recommendation === DECISION_PENDING) return 'low'
  if (evidenceItem.evidence_status === 'text_evidence_ready') return 'high'
  return 'medium'
}

function requiredEvidenceBeforeConfirmation(evidenceItem) {
  const route = evidenceItem.selected_contrast_route || ''
  if (route === 'missing_public_sibling_progression_context') {
    return [
      'Repair or confirm H4G7/H4G8/H4G9 sibling public standard context.',
      'Rerun progression contrast after sibling context exists.',
      'Only then judge whether page/activity/task evidence is grade-specific.'
    ]
  }
  if (route === 'identical_official_standard_current_grade_only_source_evidence') {
    return [
      'Name the exact current-grade page, activity, task, or language behavior from the excerpt.',
      'Compare that evidence against H4G7/H4G8/H4G9 sibling standards because official wording is identical.',
      'Reject or keep pending if the excerpt only proves a shared broad theme.'
    ]
  }
  if (route === 'identical_official_standard_no_public_unit_evidence_yet') {
    return [
      'Collect source evidence from sibling grades before confirming any split.',
      'Record sibling-grade page/activity/task evidence with unit or page anchors.',
      'Rerun this recommendation layer after sibling-grade evidence exists.'
    ]
  }
  return [
    'Record exact source evidence and sibling-grade comparison notes before any split decision.'
  ]
}

function reviewerNote(evidenceItem, recommendation) {
  const route = evidenceItem.selected_contrast_route || ''
  if (recommendation === DECISION_NEEDS_PUBLIC_SIBLING_CONTEXT_REPAIR) {
    return 'Recommendation only: repair missing public sibling H4G context before judging whether this progression group can distinguish G7/G8/G9.'
  }
  if (recommendation === DECISION_NEEDS_MORE_GRADE_EVIDENCE) {
    return 'Recommendation only: current-grade excerpts exist, but identical official wording means the reviewer must record more grade-specific source evidence and sibling comparison before confirming a split.'
  }
  if (recommendation === DECISION_NEEDS_SIBLING_GRADE_EVIDENCE) {
    return 'Recommendation only: do not confirm a grade split until sibling-grade source evidence has been collected and compared.'
  }
  if (route) {
    return `Recommendation only for route ${route}; it is not a reviewer decision, matcher approval, or publication approval.`
  }
  return 'Recommendation only: complete manual progression action evidence review before routing.'
}

function recommendationReasons(evidenceItem, decision, recommendation) {
  return uniqueStrings([
    `recommended_decision:${recommendation}`,
    `recommendation_origin:${recommendationOrigin(evidenceItem, decision, recommendation)}`,
    `selected_contrast_route:${evidenceItem.selected_contrast_route || decision.selected_contrast_route || 'missing'}`,
    `work_queue:${evidenceItem.work_queue || decision.work_queue || 'missing'}`,
    `evidence_status:${evidenceItem.evidence_status || 'missing'}`,
    `sibling_context_status:${evidenceItem.sibling_context_status || 'missing'}`,
    `sibling_grade_context:${evidenceItem.sibling_grade_context || 'missing'}`,
    `source_decision_status:${decision.decision_status || 'missing'}`,
    `source_reviewer_decision:${decision.reviewer_decision || 'missing'}`,
    `official_standard_texts_identical_across_siblings:${evidenceItem.official_standard_texts_identical_across_siblings === true}`,
    `has_full_h4g_triplet_context:${evidenceItem.has_full_h4g_triplet_context === true}`,
    `page_text_excerpt_preview_count:${Number(evidenceItem.page_text_excerpt_preview_count || 0)}`
  ])
}

function excerptExamples(evidenceItem, limit = 6) {
  const out = []
  for (const contrastRow of evidenceItem.source_progression_contrast_items || []) {
    for (const preview of contrastRow.page_text_excerpt_previews || []) {
      const text = typeof preview === 'string' ? preview : (preview.text || preview.excerpt || preview.preview || '')
      if (!text) continue
      out.push({
        grade_band: contrastRow.grade_band || '',
        page_hint_source: contrastRow.page_hint_source || '',
        unit_title: contrastRow.unit_title || '',
        excerpt: String(text).replace(/\s+/g, ' ').trim()
      })
      if (out.length >= limit) return out
    }
  }
  return out
}

function sourceConfirmations(decision) {
  const required = decision.required_confirmations || {}
  return {
    grade_specific_evidence_recorded: required.grade_specific_evidence_recorded === true,
    h4g7_h4g8_h4g9_progression_context_checked: required.h4g7_h4g8_h4g9_progression_context_checked === true,
    progression_group_id_checked: required.progression_group_id_checked === true,
    reviewer_metadata_recorded: required.reviewer_metadata_recorded === true,
    sibling_grade_evidence_compared: required.sibling_grade_evidence_compared === true,
    source_page_or_activity_evidence_recorded: required.source_page_or_activity_evidence_recorded === true
  }
}

function expectedRecommendation(evidenceItem, decision, errors) {
  const evidenceId = evidenceItem.evidence_packet_item_id || ''
  const decisionId = decision?.decision_id || evidenceItem.source_progression_action_decision_id || ''
  const allowedDecisions = decision?.allowed_decisions || []
  let recommendation = recommendedReviewerDecision(evidenceItem, decision || {})
  if (!KNOWN_DECISIONS.has(recommendation)) {
    errors.push(`${evidenceId || decisionId} expected recommended decision is unknown: ${recommendation}`)
    recommendation = DECISION_PENDING
  }
  if (!allowedDecisions.includes(recommendation)) {
    errors.push(`${evidenceId || decisionId} expected recommended_reviewer_decision ${recommendation} must be allowed by source action decision`)
    recommendation = DECISION_PENDING
  }
  return {
    action_evidence_recommendations_only: true,
    action_work_item_rank: Number(evidenceItem.action_work_item_rank || decision?.action_work_item_rank || 0),
    allowed_decisions: allowedDecisions,
    approval_prohibited: true,
    auto_approval: false,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    evidence_assessment: evidenceAssessment(evidenceItem),
    evidence_excerpt_examples: excerptExamples(evidenceItem),
    evidence_status: evidenceItem.evidence_status || '',
    grade_specificity_signal: gradeSpecificitySignal(evidenceItem),
    has_full_h4g_triplet_context: evidenceItem.has_full_h4g_triplet_context === true,
    manual_confirmation_required: true,
    matcher_ready: false,
    missing_sibling_grade_bands: evidenceItem.missing_sibling_grade_bands || [],
    official_standard_texts_identical_across_siblings: evidenceItem.official_standard_texts_identical_across_siblings === true,
    page_text_excerpt_preview_count: Number(evidenceItem.page_text_excerpt_preview_count || 0),
    priority_tier: evidenceItem.priority_tier || '',
    progression_action_evidence_recommendation_id: recommendationId(evidenceItem, decision || {}),
    progression_action_evidence_recommendations_only: true,
    progression_group_id: evidenceItem.progression_group_id || '',
    publication_ready: false,
    recommendation_confidence: recommendationConfidence(evidenceItem, decision || {}, recommendation),
    recommendation_is_official_decision: false,
    recommendation_only: true,
    recommendation_origin: recommendationOrigin(evidenceItem, decision || {}, recommendation),
    recommendation_reasons: recommendationReasons(evidenceItem, decision || {}, recommendation),
    recommendation_requires_manual_confirmation: true,
    recommendation_route: recommendationRoute(recommendation),
    recommended_next_gate: recommendedNextGate(recommendation),
    recommended_reviewer_decision: recommendation,
    required_evidence_before_confirmation: requiredEvidenceBeforeConfirmation(evidenceItem),
    reviewer_note: reviewerNote(evidenceItem, recommendation),
    selected_contrast_route: evidenceItem.selected_contrast_route || '',
    sibling_comparison_status: siblingComparisonStatus(evidenceItem),
    sibling_context_status: evidenceItem.sibling_context_status || '',
    sibling_grade_bands: evidenceItem.sibling_grade_bands || [],
    sibling_grade_context: evidenceItem.sibling_grade_context || '',
    source_decision_status: decision?.decision_status || '',
    source_progression_action_decision_id: decisionId,
    source_progression_action_work_item_id: evidenceItem.source_progression_action_work_item_id || decision?.source_progression_action_work_item_id || '',
    source_progression_contrast_item_count: (evidenceItem.source_progression_contrast_item_ids || []).length,
    source_progression_contrast_item_ids: evidenceItem.source_progression_contrast_item_ids || [],
    source_progression_evidence_packet_item_id: evidenceId,
    source_required_confirmations: sourceConfirmations(decision || {}),
    source_reviewer_decision: decision?.reviewer_decision || '',
    split_review_item_count: Number(evidenceItem.split_review_item_count || 0),
    split_surface_grade_bands_for_progression: evidenceItem.split_surface_grade_bands_for_progression || [],
    standard_codes: evidenceItem.standard_codes || [],
    subject_slug: evidenceItem.subject_slug || '',
    unit_evidence_ids: evidenceItem.unit_evidence_ids || [],
    unit_titles: evidenceItem.unit_titles || [],
    work_queue: evidenceItem.work_queue || '',
    writes_public_data: false
  }
}

function emptyStats(packet, decisions) {
  const packetSummary = packet.summary || {}
  return {
    action_evidence_recommendations: 0,
    auto_approval_items: 0,
    by_evidence_assessment: {},
    by_evidence_status: {},
    by_grade_specificity_signal: {},
    by_priority_tier: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_recommendation_origin: {},
    by_recommendation_route: {},
    by_selected_contrast_route: {},
    by_sibling_comparison_status: {},
    by_sibling_context_status: {},
    by_sibling_grade_context: {},
    by_subject: {},
    by_work_queue: {},
    duplicate_recommendations: 0,
    expected_action_decisions: (decisions.progression_action_decisions || []).length,
    expected_action_evidence_items: (packet.progression_action_evidence_items || []).length,
    extra_recommendations: 0,
    manual_confirmation_required_recommendations: 0,
    missing_recommendations: 0,
    official_decision_recommendations: 0,
    progression_action_evidence_recommendations: 0,
    public_write_items: 0,
    row_mismatch_items: 0,
    source_progression_contrast_items: Number(packetSummary.source_progression_contrast_items || 0),
    source_progression_contrast_items_covered: 0,
    text_evidence_ready_items: Number(packetSummary.text_evidence_ready_items || 0),
    unique_progression_groups: new Set((packet.progression_action_evidence_items || []).map(row => row.progression_group_id).filter(Boolean)).size,
    unique_standard_codes: new Set((packet.progression_action_evidence_items || []).flatMap(row => row.standard_codes || []).filter(Boolean)).size,
    unique_unit_evidence_ids: new Set((packet.progression_action_evidence_items || []).flatMap(row => row.unit_evidence_ids || []).filter(Boolean)).size
  }
}

function auditRecommendation(row, evidenceItem, decision, errors, stats, coveredContrastIds) {
  const prefix = row.progression_action_evidence_recommendation_id || row.source_progression_evidence_packet_item_id || '(missing recommendation id)'
  if (!evidenceItem) {
    errors.push(`${prefix} source evidence item not found`)
    return
  }
  if (!decision) {
    errors.push(`${prefix} source action decision not found`)
    return
  }
  const expected = expectedRecommendation(evidenceItem, decision, errors)
  if (!sameJson(row, expected)) {
    stats.row_mismatch_items += 1
    errors.push(`${prefix} does not match recomputed progression action evidence recommendation`)
  }
  if (row.recommendation_only !== true) errors.push(`${prefix} recommendation_only must be true`)
  if (row.progression_action_evidence_recommendations_only !== true) {
    errors.push(`${prefix} progression_action_evidence_recommendations_only must be true`)
  }
  if (row.recommendation_is_official_decision !== false) errors.push(`${prefix} recommendation_is_official_decision must be false`)
  if (row.recommendation_requires_manual_confirmation !== true || row.manual_confirmation_required !== true) {
    errors.push(`${prefix} recommendation must require manual confirmation`)
  }
  if (!Array.isArray(row.allowed_decisions) || !row.allowed_decisions.includes(row.recommended_reviewer_decision)) {
    errors.push(`${prefix} recommended_reviewer_decision must be allowed by source action decision`)
  }
  if (!KNOWN_DECISIONS.has(row.recommended_reviewer_decision || '')) {
    errors.push(`${prefix} recommended_reviewer_decision is unknown`)
  }
  if (!Array.isArray(row.recommendation_reasons) || !row.recommendation_reasons.length) {
    errors.push(`${prefix} recommendation_reasons must be non-empty`)
  }
  if (!Array.isArray(row.required_evidence_before_confirmation) || !row.required_evidence_before_confirmation.length) {
    errors.push(`${prefix} required_evidence_before_confirmation must be non-empty`)
  }
  if (row.writes_public_data !== false) stats.public_write_items += 1
  if (row.auto_approval === true) stats.auto_approval_items += 1
  if (row.recommendation_is_official_decision !== false) stats.official_decision_recommendations += 1
  if (row.manual_confirmation_required === true && row.recommendation_requires_manual_confirmation === true) {
    stats.manual_confirmation_required_recommendations += 1
  }
  for (const id of row.source_progression_contrast_item_ids || []) coveredContrastIds.add(id)
  stats.action_evidence_recommendations += 1
  stats.progression_action_evidence_recommendations += 1
  countInto(stats.by_evidence_assessment, row.evidence_assessment)
  countInto(stats.by_evidence_status, row.evidence_status)
  countInto(stats.by_grade_specificity_signal, row.grade_specificity_signal)
  countInto(stats.by_priority_tier, row.priority_tier)
  countInto(stats.by_recommendation, row.recommended_reviewer_decision)
  countInto(stats.by_recommendation_confidence, row.recommendation_confidence)
  countInto(stats.by_recommendation_origin, row.recommendation_origin)
  countInto(stats.by_recommendation_route, row.recommendation_route)
  countInto(stats.by_selected_contrast_route, row.selected_contrast_route)
  countInto(stats.by_sibling_comparison_status, row.sibling_comparison_status)
  countInto(stats.by_sibling_context_status, row.sibling_context_status)
  countInto(stats.by_sibling_grade_context, row.sibling_grade_context)
  countInto(stats.by_subject, row.subject_slug)
  countInto(stats.by_work_queue, row.work_queue)
}

function validateSummary(recommendations, stats, errors) {
  const summary = recommendations.summary || {}
  for (const key of [
    'action_evidence_recommendations',
    'auto_approval_items',
    'duplicate_recommendations',
    'expected_action_decisions',
    'expected_action_evidence_items',
    'extra_recommendations',
    'manual_confirmation_required_recommendations',
    'missing_recommendations',
    'official_decision_recommendations',
    'progression_action_evidence_recommendations',
    'public_write_items',
    'row_mismatch_items',
    'source_progression_contrast_items',
    'source_progression_contrast_items_covered',
    'text_evidence_ready_items',
    'unique_progression_groups',
    'unique_standard_codes',
    'unique_unit_evidence_ids'
  ]) {
    if (Number(summary[key] || 0) !== Number(stats[key] || 0)) errors.push(`summary.${key} mismatch`)
  }
  for (const key of [
    'by_evidence_assessment',
    'by_evidence_status',
    'by_grade_specificity_signal',
    'by_priority_tier',
    'by_recommendation',
    'by_recommendation_confidence',
    'by_recommendation_origin',
    'by_recommendation_route',
    'by_selected_contrast_route',
    'by_sibling_comparison_status',
    'by_sibling_context_status',
    'by_sibling_grade_context',
    'by_subject',
    'by_work_queue'
  ]) {
    if (!sameJson(summary[key] || {}, stats[key] || {})) errors.push(`summary.${key} mismatch`)
  }
}

function markdownSummary(payload) {
  return `# H4G Split Review Progression Action Evidence Recommendations Audit

Generated at: ${payload.generated_at}

## Status

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| expected action evidence items | ${payload.summary.expected_action_evidence_items} |
| evidence recommendations | ${payload.summary.progression_action_evidence_recommendations} |
| missing recommendations | ${payload.summary.missing_recommendations} |
| extra recommendations | ${payload.summary.extra_recommendations} |
| row mismatch items | ${payload.summary.row_mismatch_items} |
| source progression contrast items | ${payload.summary.source_progression_contrast_items} |
| source progression contrast items covered | ${payload.summary.source_progression_contrast_items_covered} |
| manual confirmation required recommendations | ${payload.summary.manual_confirmation_required_recommendations} |
| official decision recommendations | ${payload.summary.official_decision_recommendations} |
| public write items | ${payload.summary.public_write_items} |
| auto approval items | ${payload.summary.auto_approval_items} |

## Recommendations

| recommendation | rows |
| --- | ---: |
${countRows(payload.summary.by_recommendation)}

## Evidence Assessments

| assessment | rows |
| --- | ---: |
${countRows(payload.summary.by_evidence_assessment)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of Object.entries({
    recommendations: args.recommendations,
    packet: args.packet,
    decisions: args.decisions
  })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const recommendations = existsSync(args.recommendations) ? readJson(args.recommendations) : { progression_action_evidence_recommendations: [] }
  const packet = existsSync(args.packet) ? readJson(args.packet) : { progression_action_evidence_items: [] }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { progression_action_decisions: [] }
  if (!errors.length) validateTopLevel(recommendations, packet, decisions, args, errors)

  const evidenceById = mapBy(packet.progression_action_evidence_items || [], 'evidence_packet_item_id', errors, 'progression action evidence item')
  const decisionById = mapBy(decisions.progression_action_decisions || [], 'decision_id', errors, 'progression action decision')
  const recommendationByEvidenceId = mapBy(recommendations.progression_action_evidence_recommendations || [], 'source_progression_evidence_packet_item_id', errors, 'progression action evidence recommendation')
  const stats = emptyStats(packet, decisions)
  stats.duplicate_recommendations = (recommendations.progression_action_evidence_recommendations || []).length -
    sorted((recommendations.progression_action_evidence_recommendations || []).map(row => row.source_progression_action_decision_id)).length
  const coveredContrastIds = new Set()
  for (const row of recommendations.progression_action_evidence_recommendations || []) {
    const evidenceItem = evidenceById.get(row.source_progression_evidence_packet_item_id)
    const decision = decisionById.get(row.source_progression_action_decision_id)
    auditRecommendation(row, evidenceItem, decision, errors, stats, coveredContrastIds)
  }
  for (const evidenceItem of packet.progression_action_evidence_items || []) {
    if (!recommendationByEvidenceId.has(evidenceItem.evidence_packet_item_id)) {
      stats.missing_recommendations += 1
      errors.push(`${evidenceItem.evidence_packet_item_id} missing progression action evidence recommendation`)
    }
  }
  for (const row of recommendations.progression_action_evidence_recommendations || []) {
    if (!evidenceById.has(row.source_progression_evidence_packet_item_id)) stats.extra_recommendations += 1
  }
  stats.source_progression_contrast_items_covered = coveredContrastIds.size
  if (args.requireItems && !(packet.progression_action_evidence_items || []).length) {
    errors.push('requireItems is set but progression action evidence packet has no rows')
  }
  if (args.requireItems && !(recommendations.progression_action_evidence_recommendations || []).length) {
    errors.push('requireItems is set but progression action evidence recommendations has no rows')
  }
  if (stats.duplicate_recommendations) errors.push(`progression action evidence recommendations have duplicate source decisions: ${stats.duplicate_recommendations}`)
  if (stats.public_write_items) errors.push(`progression action evidence recommendations must not write public data: ${stats.public_write_items}`)
  if (stats.auto_approval_items) errors.push(`progression action evidence recommendations must not auto-approve: ${stats.auto_approval_items}`)
  if (stats.official_decision_recommendations) {
    errors.push(`progression action evidence recommendations must not be official decisions: ${stats.official_decision_recommendations}`)
  }
  validateSummary(recommendations, stats, errors)

  return {
    changes_official_standard_text: false,
    decisions: args.decisions,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    packet: args.packet,
    publication_ready: false,
    recommendations: args.recommendations,
    require_items: args.requireItems,
    summary: stats,
    valid: errors.length === 0,
    writes_public_data: false
  }
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
  console.log(JSON.stringify({
    out: args.out,
    summary: payload.summary,
    valid: payload.valid
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
