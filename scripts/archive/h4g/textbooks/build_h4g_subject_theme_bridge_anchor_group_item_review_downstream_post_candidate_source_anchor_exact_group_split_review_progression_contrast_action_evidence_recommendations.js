#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_recommendations_anchor_domain_rejected_english_pe.md'

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
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--packet') args.packet = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_recommendations.js \\
  --strict --require-items

Builds recommendation-only routing from the H4G progression action evidence
packet. The recommendations identify the next evidence or context repair needed
before H4G7/H4G8/H4G9 split decisions can be trusted. They do not edit
decisions, approve standards, write public/data, change official standard text,
or enable matcher/publication use.`)
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

function validatePacket(packet, args, errors) {
  if (packet.valid !== true) errors.push('progression action evidence packet valid must be true')
  if ((packet.errors || []).length) errors.push('progression action evidence packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_packet') {
    errors.push('progression action evidence packet purpose mismatch')
  }
  for (const key of ['action_evidence_packet_only', 'evidence_packet_only', 'progression_action_evidence_packet_only', 'review_only']) {
    if (packet[key] !== true) errors.push(`progression action evidence packet ${key} must be true`)
  }
  if (packet.source_progression_action_decisions !== args.decisions) {
    errors.push('progression action evidence packet source_progression_action_decisions must match arg')
  }
  if (!Array.isArray(packet.progression_action_evidence_items)) {
    errors.push('progression action evidence packet rows must be an array')
  }
  if (args.requireItems && !(packet.progression_action_evidence_items || []).length) {
    errors.push('requireItems is set but progression action evidence packet has no rows')
  }
  validatePolicy('progression action evidence packet', packet, errors)
}

function validateDecisions(decisions, args, errors) {
  if (decisions.valid !== true) errors.push('progression action decisions valid must be true')
  if ((decisions.errors || []).length) errors.push('progression action decisions errors must be empty')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_decisions_template') {
    errors.push('progression action decisions purpose mismatch')
  }
  for (const key of ['action_decisions_template_only', 'decision_template_only', 'editable_manual_review_template', 'progression_action_decision_template_only', 'review_only']) {
    if (decisions[key] !== true) errors.push(`progression action decisions ${key} must be true`)
  }
  if (!Array.isArray(decisions.progression_action_decisions)) {
    errors.push('progression action decisions rows must be an array')
  }
  if (args.requireItems && !(decisions.progression_action_decisions || []).length) {
    errors.push('requireItems is set but progression action decisions has no rows')
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

function recommendationPolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    progression_action_evidence_recommendations_only: true,
    publication_ready: false,
    recommendation_is_not_publication_approval: true,
    recommendation_is_not_reviewer_decision: true,
    recommendation_only: true,
    requires_later_action_decision_edit: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    requires_later_split_review_decision_gate: true,
    review_only: true,
    writes_public_data: false
  }
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

function recommendationFromEvidence(evidenceItem, decision, errors) {
  const evidenceId = evidenceItem.evidence_packet_item_id || ''
  const decisionId = decision?.decision_id || evidenceItem.source_progression_action_decision_id || ''
  const allowedDecisions = decision?.allowed_decisions || []
  let recommendation = recommendedReviewerDecision(evidenceItem, decision || {})
  if (!KNOWN_DECISIONS.has(recommendation)) {
    errors.push(`${evidenceId || decisionId} recommended decision is unknown: ${recommendation}`)
    recommendation = DECISION_PENDING
  }
  if (!allowedDecisions.includes(recommendation)) {
    errors.push(`${evidenceId || decisionId} recommended_reviewer_decision ${recommendation} must be allowed by source action decision`)
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

function buildRows(packet, decisions, errors) {
  const decisionById = mapBy(decisions.progression_action_decisions || [], 'decision_id', errors, 'progression action decision')
  const seen = new Set()
  const rows = []
  for (const item of packet.progression_action_evidence_items || []) {
    const id = item.source_progression_action_decision_id || ''
    if (!id) errors.push(`${item.evidence_packet_item_id || '(missing evidence item id)'} missing source_progression_action_decision_id`)
    if (seen.has(id)) errors.push(`duplicate progression action evidence source decision id: ${id}`)
    seen.add(id)
    const decision = decisionById.get(id)
    if (!decision) {
      errors.push(`${item.evidence_packet_item_id || id} source progression action decision not found: ${id}`)
    }
    rows.push(recommendationFromEvidence(item, decision || {}, errors))
  }
  return rows.sort((a, b) => Number(a.action_work_item_rank || 0) - Number(b.action_work_item_rank || 0) ||
    String(a.progression_group_id || '').localeCompare(String(b.progression_group_id || '')))
}

function summarize(rows, packet, decisions) {
  const coveredContrastIds = sorted(rows.flatMap(row => row.source_progression_contrast_item_ids || []))
  const packetSummary = packet.summary || {}
  const summary = {
    action_evidence_recommendations: rows.length,
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
    duplicate_recommendations: rows.length - sorted(rows.map(row => row.source_progression_action_decision_id)).length,
    expected_action_decisions: (decisions.progression_action_decisions || []).length,
    expected_action_evidence_items: (packet.progression_action_evidence_items || []).length,
    extra_recommendations: 0,
    manual_confirmation_required_recommendations: 0,
    missing_recommendations: 0,
    official_decision_recommendations: 0,
    progression_action_evidence_recommendations: rows.length,
    public_write_items: 0,
    row_mismatch_items: 0,
    source_progression_contrast_items: Number(packetSummary.source_progression_contrast_items || 0),
    source_progression_contrast_items_covered: coveredContrastIds.length,
    text_evidence_ready_items: Number(packetSummary.text_evidence_ready_items || 0),
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_standard_codes: sorted(rows.flatMap(row => row.standard_codes || [])).length,
    unique_unit_evidence_ids: sorted(rows.flatMap(row => row.unit_evidence_ids || [])).length
  }
  for (const row of rows) {
    countInto(summary.by_evidence_assessment, row.evidence_assessment)
    countInto(summary.by_evidence_status, row.evidence_status)
    countInto(summary.by_grade_specificity_signal, row.grade_specificity_signal)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision)
    countInto(summary.by_recommendation_confidence, row.recommendation_confidence)
    countInto(summary.by_recommendation_origin, row.recommendation_origin)
    countInto(summary.by_recommendation_route, row.recommendation_route)
    countInto(summary.by_selected_contrast_route, row.selected_contrast_route)
    countInto(summary.by_sibling_comparison_status, row.sibling_comparison_status)
    countInto(summary.by_sibling_context_status, row.sibling_context_status)
    countInto(summary.by_sibling_grade_context, row.sibling_grade_context)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_work_queue, row.work_queue)
    if (row.manual_confirmation_required === true && row.recommendation_requires_manual_confirmation === true) {
      summary.manual_confirmation_required_recommendations += 1
    }
    if (row.recommendation_is_official_decision !== false) summary.official_decision_recommendations += 1
    if (row.writes_public_data !== false) summary.public_write_items += 1
    if (row.auto_approval === true) summary.auto_approval_items += 1
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 40).map(row => (
    `| ${row.action_work_item_rank} | ${markdownCell(row.work_queue)} | ${markdownCell(row.recommended_reviewer_decision)} | ${markdownCell(row.evidence_assessment)} | ${truncate((row.standard_codes || []).join(', '), 90)} | ${truncate((row.unit_titles || []).join('; '), 110)} |`
  )).join('\n') || '| - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Split Review Progression Action Evidence Recommendations

Generated at: ${payload.generated_at}

Source evidence packet: \`${payload.source_progression_action_evidence_packet}\`

Source action decisions: \`${payload.source_progression_action_decisions}\`

These rows are recommendation-only routing from the progression action evidence
packet. They identify the next evidence/context repair needed before any
H4G7/H4G8/H4G9 split decision can be trusted. They do not edit decisions,
approve standards, write \`public/data\`, change official standard text, or
enable matcher/publication use.

## Status

| field | value |
| --- | ---: |
| valid | ${payload.valid} |
| recommendation only | ${payload.recommendation_only} |
| evidence recommendations | ${payload.summary.progression_action_evidence_recommendations} |
| expected action evidence items | ${payload.summary.expected_action_evidence_items} |
| expected action decisions | ${payload.summary.expected_action_decisions} |
| source progression contrast items | ${payload.summary.source_progression_contrast_items} |
| source progression contrast items covered | ${payload.summary.source_progression_contrast_items_covered} |
| text evidence ready items | ${payload.summary.text_evidence_ready_items} |
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

## Work Queues

| work queue | rows |
| --- | ---: |
${countRows(payload.summary.by_work_queue)}

## Preview

| rank | work queue | recommendation | assessment | standards | units |
| ---: | --- | --- | --- | --- | --- |
${previewRows(payload.progression_action_evidence_recommendations)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function build(args) {
  const errors = []
  for (const [label, path] of Object.entries({ packet: args.packet, decisions: args.decisions })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const packet = existsSync(args.packet) ? readJson(args.packet) : { progression_action_evidence_items: [] }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { progression_action_decisions: [] }
  if (!errors.length) {
    validatePacket(packet, args, errors)
    validateDecisions(decisions, args, errors)
  }
  const rows = buildRows(packet, decisions, errors)
  const summary = summarize(rows, packet, decisions)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no progression action evidence recommendations were built')
  if (summary.duplicate_recommendations) errors.push(`progression action evidence recommendations have duplicate source decisions: ${summary.duplicate_recommendations}`)
  if (summary.public_write_items) errors.push(`progression action evidence recommendations must not write public data: ${summary.public_write_items}`)
  if (summary.auto_approval_items) errors.push(`progression action evidence recommendations must not auto-approve: ${summary.auto_approval_items}`)
  if (summary.official_decision_recommendations) {
    errors.push(`progression action evidence recommendations must not be official decisions: ${summary.official_decision_recommendations}`)
  }
  return {
    action_evidence_recommendations_only: true,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: recommendationPolicy(),
    progression_action_evidence_recommendations: rows,
    progression_action_evidence_recommendations_only: true,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_recommendations',
    recommendation_only: true,
    review_only: true,
    source_progression_action_decisions: args.decisions,
    source_progression_action_evidence_packet: args.packet,
    summary,
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
  const payload = build(args)
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
