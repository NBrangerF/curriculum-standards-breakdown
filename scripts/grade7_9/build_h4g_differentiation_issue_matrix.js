#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_READINESS = 'generated/grade7_9_h4g_grade_differentiation_readiness.json'
const DEFAULT_DISTINCTIVENESS = 'generated/grade7_9_distinctiveness_audit.json'
const DEFAULT_PRODUCT_READINESS = 'generated/grade7_9_h4g_product_readiness.json'
const DEFAULT_PRODUCT_READINESS_WORKLIST = 'generated/grade7_9_h4g_product_readiness_worklist.json'
const DEFAULT_ANCHOR_GROUP_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_triage_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_PRIORITY_MATRIX = 'generated/textbook_evidence/h4g_theme_bridge_anchor_priority_matrix_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_GROUP_ITEM_REVIEW_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_GROUP_ITEM_REVIEW_DOWNSTREAM_COVERAGE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_coverage_audit_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_ACTION_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_ACTION_COVERAGE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_coverage_audit_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_ACTION_CLOSURE_READINESS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_MANUAL_CONFIRMATION_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_TARGET_GAP_DECISIONS_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_TARGET_GAP_DECISIONS_CANDIDATE_AUDIT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_TARGET_GAP_PARENT_DECISIONS_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_TARGET_GAP_PARENT_DECISIONS_CANDIDATE_AUDIT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_MANUAL_SCOPE_DECISIONS_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_MANUAL_SCOPE_DECISIONS_CANDIDATE_AUDIT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_MANUAL_SCOPE_PARENT_DECISIONS_CANDIDATE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_MANUAL_SCOPE_PARENT_DECISIONS_CANDIDATE_AUDIT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_EVIDENCE_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_EVIDENCE_BATCH_AUDIT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_EVIDENCE_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_EVIDENCE_INVENTORY_AUDIT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_REVIEW_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_REVIEW_WORKLIST_AUDIT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_worklist_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_PAGE_EVIDENCE_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_page_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_PAGE_EVIDENCE_PACKET_AUDIT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_page_evidence_packet_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_REVIEW_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_REVIEW_DECISIONS_AUDIT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_REVIEW_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_REVIEW_RECOMMENDATIONS_AUDIT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_UNIT_CANDIDATE_COVERAGE = 'generated/textbook_evidence/h4g_unit_evidence_candidate_coverage_audit.json'
const DEFAULT_UNIT_CANDIDATE_COVERAGE_WORKLIST = 'generated/textbook_evidence/h4g_unit_evidence_candidate_coverage_worklist.json'
const DEFAULT_UNIT_BLOCKER_MATCH_DIAGNOSTICS = 'generated/textbook_evidence/h4g_unit_evidence_blocker_match_diagnostics.json'
const DEFAULT_UNIT_BLOCKER_ACTION_WORKLIST = 'generated/textbook_evidence/h4g_unit_evidence_blocker_action_worklist.json'
const DEFAULT_UNIT_ANCHOR_POLICY_REVIEW_BATCH = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_batch.json'
const DEFAULT_UNIT_ANCHOR_POLICY_REVIEW_DECISIONS = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_decisions_template.json'
const DEFAULT_UNIT_ANCHOR_POLICY_REVIEW_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_recommendations.json'
const DEFAULT_UNIT_ANCHOR_POLICY_REVIEW_ACTION_WORKLIST = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_action_worklist.json'
const DEFAULT_UNIT_ANCHOR_POLICY_SOURCE_ANCHOR_SPECIFICITY_BATCH = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_batch.json'
const DEFAULT_UNIT_ANCHOR_POLICY_SOURCE_ANCHOR_SPECIFICITY_DECISIONS = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_decisions_template.json'
const DEFAULT_UNIT_ANCHOR_POLICY_SOURCE_ANCHOR_SPECIFICITY_EVIDENCE_PACKET = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_evidence_packet.json'
const DEFAULT_UNIT_ANCHOR_POLICY_SOURCE_ANCHOR_SPECIFICITY_GROUP_TRIAGE = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_source_anchor_specificity_group_triage.json'
const DEFAULT_UNIT_GROUP_READY_CANDIDATE = 'generated/textbook_evidence/h4g_unit_evidence_group_ready_candidate.json'
const DEFAULT_OUT = 'generated/grade7_9_h4g_differentiation_issue_matrix.json'
const DEFAULT_SUMMARY_OUT = 'generated/grade7_9_h4g_differentiation_issue_matrix.md'

const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']

const ROUTE_PRIORITY = {
  complete_anchor_group_decisions_before_item_review: 10,
  complete_anchor_group_item_review_downstream_batches: 11,
  complete_anchor_group_downstream_manual_confirmation: 12,
  expand_existing_unit_evidence_pipeline: 20,
  repair_or_confirm_single_partial_grade_assignment: 30,
  build_unit_chapter_evidence_from_file_level_sources: 40,
  source_coverage_or_low_confidence_evidence_gap: 50,
  ready_for_publication_gate: 90,
  no_h4g_records: 99
}

function parseArgs(argv) {
  const args = {
    anchorGroupDecisions: DEFAULT_ANCHOR_GROUP_DECISIONS,
    anchorGroupDownstreamActionClosureReadiness: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_ACTION_CLOSURE_READINESS,
    anchorGroupDownstreamActionCoverage: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_ACTION_COVERAGE,
    anchorGroupDownstreamActionWorklist: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_ACTION_WORKLIST,
    anchorGroupDownstreamManualConfirmationWorklist: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_MANUAL_CONFIRMATION_WORKLIST,
    anchorGroupDownstreamManualScopeDecisionsCandidate: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_MANUAL_SCOPE_DECISIONS_CANDIDATE,
    anchorGroupDownstreamManualScopeDecisionsCandidateAudit: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_MANUAL_SCOPE_DECISIONS_CANDIDATE_AUDIT,
    anchorGroupDownstreamManualScopeParentDecisionsCandidate: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_MANUAL_SCOPE_PARENT_DECISIONS_CANDIDATE,
    anchorGroupDownstreamManualScopeParentDecisionsCandidateAudit: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_MANUAL_SCOPE_PARENT_DECISIONS_CANDIDATE_AUDIT,
    anchorGroupDownstreamSourceAnchorEvidenceBatch: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_EVIDENCE_BATCH,
    anchorGroupDownstreamSourceAnchorEvidenceBatchAudit: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_EVIDENCE_BATCH_AUDIT,
    anchorGroupDownstreamSourceAnchorEvidenceInventory: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_EVIDENCE_INVENTORY,
    anchorGroupDownstreamSourceAnchorEvidenceInventoryAudit: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_EVIDENCE_INVENTORY_AUDIT,
    anchorGroupDownstreamSourceAnchorReviewWorklist: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_REVIEW_WORKLIST,
    anchorGroupDownstreamSourceAnchorReviewWorklistAudit: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_REVIEW_WORKLIST_AUDIT,
    anchorGroupDownstreamSourceAnchorPageEvidencePacket: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_PAGE_EVIDENCE_PACKET,
    anchorGroupDownstreamSourceAnchorPageEvidencePacketAudit: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_PAGE_EVIDENCE_PACKET_AUDIT,
    anchorGroupDownstreamSourceAnchorReviewDecisions: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_REVIEW_DECISIONS,
    anchorGroupDownstreamSourceAnchorReviewDecisionsAudit: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_REVIEW_DECISIONS_AUDIT,
    anchorGroupDownstreamSourceAnchorReviewRecommendations: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_REVIEW_RECOMMENDATIONS,
    anchorGroupDownstreamSourceAnchorReviewRecommendationsAudit: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_SOURCE_ANCHOR_REVIEW_RECOMMENDATIONS_AUDIT,
    anchorGroupDownstreamTargetGapDecisionsCandidate: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_TARGET_GAP_DECISIONS_CANDIDATE,
    anchorGroupDownstreamTargetGapDecisionsCandidateAudit: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_TARGET_GAP_DECISIONS_CANDIDATE_AUDIT,
    anchorGroupDownstreamTargetGapParentDecisionsCandidate: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_TARGET_GAP_PARENT_DECISIONS_CANDIDATE,
    anchorGroupDownstreamTargetGapParentDecisionsCandidateAudit: DEFAULT_ANCHOR_GROUP_DOWNSTREAM_TARGET_GAP_PARENT_DECISIONS_CANDIDATE_AUDIT,
    anchorGroupItemReviewDownstreamCoverage: DEFAULT_ANCHOR_GROUP_ITEM_REVIEW_DOWNSTREAM_COVERAGE,
    anchorGroupItemReviewWorklist: DEFAULT_ANCHOR_GROUP_ITEM_REVIEW_WORKLIST,
    anchorPriorityMatrix: DEFAULT_ANCHOR_PRIORITY_MATRIX,
    distinctiveness: DEFAULT_DISTINCTIVENESS,
    out: DEFAULT_OUT,
    productReadiness: DEFAULT_PRODUCT_READINESS,
    productReadinessWorklist: DEFAULT_PRODUCT_READINESS_WORKLIST,
    readiness: DEFAULT_READINESS,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    unitAnchorPolicyReviewDecisions: DEFAULT_UNIT_ANCHOR_POLICY_REVIEW_DECISIONS,
    unitAnchorPolicyReviewBatch: DEFAULT_UNIT_ANCHOR_POLICY_REVIEW_BATCH,
    unitAnchorPolicyReviewRecommendations: DEFAULT_UNIT_ANCHOR_POLICY_REVIEW_RECOMMENDATIONS,
    unitAnchorPolicyReviewActionWorklist: DEFAULT_UNIT_ANCHOR_POLICY_REVIEW_ACTION_WORKLIST,
    unitAnchorPolicySourceAnchorSpecificityBatch: DEFAULT_UNIT_ANCHOR_POLICY_SOURCE_ANCHOR_SPECIFICITY_BATCH,
    unitAnchorPolicySourceAnchorSpecificityDecisions: DEFAULT_UNIT_ANCHOR_POLICY_SOURCE_ANCHOR_SPECIFICITY_DECISIONS,
    unitAnchorPolicySourceAnchorSpecificityEvidencePacket: DEFAULT_UNIT_ANCHOR_POLICY_SOURCE_ANCHOR_SPECIFICITY_EVIDENCE_PACKET,
    unitAnchorPolicySourceAnchorSpecificityGroupTriage: DEFAULT_UNIT_ANCHOR_POLICY_SOURCE_ANCHOR_SPECIFICITY_GROUP_TRIAGE,
    unitBlockerActionWorklist: DEFAULT_UNIT_BLOCKER_ACTION_WORKLIST,
    unitBlockerMatchDiagnostics: DEFAULT_UNIT_BLOCKER_MATCH_DIAGNOSTICS,
    unitCandidateCoverage: DEFAULT_UNIT_CANDIDATE_COVERAGE,
    unitCandidateCoverageWorklist: DEFAULT_UNIT_CANDIDATE_COVERAGE_WORKLIST,
    unitGroupReadyCandidate: DEFAULT_UNIT_GROUP_READY_CANDIDATE
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--readiness') args.readiness = argv[++i]
    else if (item === '--distinctiveness') args.distinctiveness = argv[++i]
    else if (item === '--product-readiness') args.productReadiness = argv[++i]
    else if (item === '--product-readiness-worklist') args.productReadinessWorklist = argv[++i]
    else if (item === '--anchor-group-decisions') args.anchorGroupDecisions = argv[++i]
    else if (item === '--anchor-group-downstream-action-closure-readiness') args.anchorGroupDownstreamActionClosureReadiness = argv[++i]
    else if (item === '--anchor-group-downstream-action-coverage') args.anchorGroupDownstreamActionCoverage = argv[++i]
    else if (item === '--anchor-group-downstream-action-worklist') args.anchorGroupDownstreamActionWorklist = argv[++i]
    else if (item === '--anchor-group-downstream-manual-confirmation-worklist') args.anchorGroupDownstreamManualConfirmationWorklist = argv[++i]
    else if (item === '--anchor-group-downstream-target-gap-decisions-candidate') args.anchorGroupDownstreamTargetGapDecisionsCandidate = argv[++i]
    else if (item === '--anchor-group-downstream-target-gap-decisions-candidate-audit') args.anchorGroupDownstreamTargetGapDecisionsCandidateAudit = argv[++i]
    else if (item === '--anchor-group-downstream-target-gap-parent-decisions-candidate') args.anchorGroupDownstreamTargetGapParentDecisionsCandidate = argv[++i]
    else if (item === '--anchor-group-downstream-target-gap-parent-decisions-candidate-audit') args.anchorGroupDownstreamTargetGapParentDecisionsCandidateAudit = argv[++i]
    else if (item === '--anchor-group-downstream-manual-scope-decisions-candidate') args.anchorGroupDownstreamManualScopeDecisionsCandidate = argv[++i]
    else if (item === '--anchor-group-downstream-manual-scope-decisions-candidate-audit') args.anchorGroupDownstreamManualScopeDecisionsCandidateAudit = argv[++i]
    else if (item === '--anchor-group-downstream-manual-scope-parent-decisions-candidate') args.anchorGroupDownstreamManualScopeParentDecisionsCandidate = argv[++i]
    else if (item === '--anchor-group-downstream-manual-scope-parent-decisions-candidate-audit') args.anchorGroupDownstreamManualScopeParentDecisionsCandidateAudit = argv[++i]
    else if (item === '--anchor-group-downstream-source-anchor-evidence-batch') args.anchorGroupDownstreamSourceAnchorEvidenceBatch = argv[++i]
    else if (item === '--anchor-group-downstream-source-anchor-evidence-batch-audit') args.anchorGroupDownstreamSourceAnchorEvidenceBatchAudit = argv[++i]
    else if (item === '--anchor-group-downstream-source-anchor-evidence-inventory') args.anchorGroupDownstreamSourceAnchorEvidenceInventory = argv[++i]
    else if (item === '--anchor-group-downstream-source-anchor-evidence-inventory-audit') args.anchorGroupDownstreamSourceAnchorEvidenceInventoryAudit = argv[++i]
    else if (item === '--anchor-group-downstream-source-anchor-review-worklist') args.anchorGroupDownstreamSourceAnchorReviewWorklist = argv[++i]
    else if (item === '--anchor-group-downstream-source-anchor-review-worklist-audit') args.anchorGroupDownstreamSourceAnchorReviewWorklistAudit = argv[++i]
    else if (item === '--anchor-group-downstream-source-anchor-page-evidence-packet') args.anchorGroupDownstreamSourceAnchorPageEvidencePacket = argv[++i]
    else if (item === '--anchor-group-downstream-source-anchor-page-evidence-packet-audit') args.anchorGroupDownstreamSourceAnchorPageEvidencePacketAudit = argv[++i]
    else if (item === '--anchor-group-downstream-source-anchor-review-decisions') args.anchorGroupDownstreamSourceAnchorReviewDecisions = argv[++i]
    else if (item === '--anchor-group-downstream-source-anchor-review-decisions-audit') args.anchorGroupDownstreamSourceAnchorReviewDecisionsAudit = argv[++i]
    else if (item === '--anchor-group-downstream-source-anchor-review-recommendations') args.anchorGroupDownstreamSourceAnchorReviewRecommendations = argv[++i]
    else if (item === '--anchor-group-downstream-source-anchor-review-recommendations-audit') args.anchorGroupDownstreamSourceAnchorReviewRecommendationsAudit = argv[++i]
    else if (item === '--anchor-group-item-review-downstream-coverage') args.anchorGroupItemReviewDownstreamCoverage = argv[++i]
    else if (item === '--anchor-group-item-review-worklist') args.anchorGroupItemReviewWorklist = argv[++i]
    else if (item === '--anchor-priority-matrix') args.anchorPriorityMatrix = argv[++i]
    else if (item === '--unit-candidate-coverage') args.unitCandidateCoverage = argv[++i]
    else if (item === '--unit-candidate-coverage-worklist') args.unitCandidateCoverageWorklist = argv[++i]
    else if (item === '--unit-blocker-match-diagnostics') args.unitBlockerMatchDiagnostics = argv[++i]
    else if (item === '--unit-blocker-action-worklist') args.unitBlockerActionWorklist = argv[++i]
    else if (item === '--unit-anchor-policy-review-batch') args.unitAnchorPolicyReviewBatch = argv[++i]
    else if (item === '--unit-anchor-policy-review-decisions') args.unitAnchorPolicyReviewDecisions = argv[++i]
    else if (item === '--unit-anchor-policy-review-recommendations') args.unitAnchorPolicyReviewRecommendations = argv[++i]
    else if (item === '--unit-anchor-policy-review-action-worklist') args.unitAnchorPolicyReviewActionWorklist = argv[++i]
    else if (item === '--unit-anchor-policy-source-anchor-specificity-batch') args.unitAnchorPolicySourceAnchorSpecificityBatch = argv[++i]
    else if (item === '--unit-anchor-policy-source-anchor-specificity-decisions') args.unitAnchorPolicySourceAnchorSpecificityDecisions = argv[++i]
    else if (item === '--unit-anchor-policy-source-anchor-specificity-evidence-packet') args.unitAnchorPolicySourceAnchorSpecificityEvidencePacket = argv[++i]
    else if (item === '--unit-anchor-policy-source-anchor-specificity-group-triage') args.unitAnchorPolicySourceAnchorSpecificityGroupTriage = argv[++i]
    else if (item === '--unit-group-ready-candidate') args.unitGroupReadyCandidate = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/build_h4g_differentiation_issue_matrix.js \\
  --readiness generated/grade7_9_h4g_grade_differentiation_readiness.json \\
  --distinctiveness generated/grade7_9_distinctiveness_audit.json \\
  --strict

Builds a read-only H4G differentiation issue matrix from the current public
H4G audits plus the English/PE anchor group gate. It does not write public/data,
change official standard text, approve bridges, or enable matcher use.`)
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

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function pct(numerator, denominator) {
  if (!denominator) return 0
  return Number((numerator / denominator).toFixed(4))
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

function requireInput(path, label, errors) {
  if (!existsSync(path)) {
    errors.push(`Missing ${label}: ${path}`)
    return null
  }
  return readJson(path)
}

function optionalInput(path, label, warnings) {
  if (!path || !existsSync(path)) {
    warnings.push(`Optional ${label} not found: ${path}`)
    return null
  }
  return readJson(path)
}

function validateReadOnlyCandidate(label, artifact, errors, expected) {
  if (!artifact) return
  if (artifact.valid !== true) errors.push(`${label} must be valid=true`)
  if (expected.purpose && artifact.purpose !== expected.purpose) errors.push(`${label} purpose mismatch`)
  if (expected.candidatePurpose && artifact.candidate_purpose !== expected.candidatePurpose) {
    errors.push(`${label} candidate_purpose mismatch`)
  }
  if (artifact.review_only !== true) errors.push(`${label} review_only must be true`)
  if (artifact.writes_public_data !== false) errors.push(`${label} writes_public_data must be false`)
  if (artifact.changes_official_standard_text !== false) {
    errors.push(`${label} changes_official_standard_text must be false`)
  }
  if (artifact.direct_matcher_use !== false) errors.push(`${label} direct_matcher_use must be false`)
  if (artifact.matcher_ready !== false) errors.push(`${label} matcher_ready must be false`)
  if (artifact.publication_ready !== false) errors.push(`${label} publication_ready must be false`)
  if (Array.isArray(artifact.errors) && artifact.errors.length) errors.push(`${label} errors must be empty`)
}

function validateReadOnlyAudit(label, artifact, errors) {
  if (!artifact) return
  if (artifact.valid !== true) errors.push(`${label} must be valid=true`)
  if (artifact.writes_public_data !== false) errors.push(`${label} writes_public_data must be false`)
  if (artifact.changes_official_standard_text !== false) {
    errors.push(`${label} changes_official_standard_text must be false`)
  }
  if (artifact.direct_matcher_use !== false) errors.push(`${label} direct_matcher_use must be false`)
  if (artifact.matcher_ready !== false) errors.push(`${label} matcher_ready must be false`)
  if (artifact.publication_ready !== false) errors.push(`${label} publication_ready must be false`)
  if (Array.isArray(artifact.errors) && artifact.errors.length) errors.push(`${label} errors must be empty`)
}

function validateReadOnlyArtifact(label, artifact, errors, expected) {
  if (!artifact) return
  if (artifact.valid !== true) errors.push(`${label} must be valid=true`)
  if (expected.purpose && artifact.purpose !== expected.purpose) errors.push(`${label} purpose mismatch`)
  for (const flag of expected.trueFlags || []) {
    if (artifact[flag] !== true) errors.push(`${label} ${flag} must be true`)
  }
  if (artifact.writes_public_data !== false) errors.push(`${label} writes_public_data must be false`)
  if (artifact.changes_official_standard_text !== false) {
    errors.push(`${label} changes_official_standard_text must be false`)
  }
  if (artifact.direct_matcher_use !== false) errors.push(`${label} direct_matcher_use must be false`)
  if (artifact.matcher_ready !== false) errors.push(`${label} matcher_ready must be false`)
  if (artifact.publication_ready !== false) errors.push(`${label} publication_ready must be false`)
  if (Array.isArray(artifact.errors) && artifact.errors.length) errors.push(`${label} errors must be empty`)
}

function zeroAnchorSubjectStats(subjectSlug) {
  return {
    by_priority_tier: {},
    by_reviewer_decision: {},
    by_review_strategy: {},
    completed_group_decisions: 0,
    pending_group_decisions: 0,
    priority_groups: 0,
    subject_slug: subjectSlug,
    total_items: 0
  }
}

function anchorSubjectStats(decisions) {
  const stats = {}
  for (const row of decisions?.group_review_decisions || []) {
    const subjectSlug = row.subject_slug || 'missing'
    if (!stats[subjectSlug]) stats[subjectSlug] = zeroAnchorSubjectStats(subjectSlug)
    const subject = stats[subjectSlug]
    subject.priority_groups += 1
    subject.total_items += Number(row.total_items || 0)
    if (row.reviewer_decision === 'pending') subject.pending_group_decisions += 1
    else subject.completed_group_decisions += 1
    countInto(subject.by_priority_tier, row.priority_tier)
    countInto(subject.by_reviewer_decision, row.reviewer_decision)
    countInto(subject.by_review_strategy, row.review_strategy)
  }
  return stats
}

function priorityGroupStats(matrix) {
  const stats = {
    by_priority_tier: {},
    by_review_strategy: {},
    by_subject: {},
    by_subject_items: {},
    priority_groups: 0,
    total_anchor_review_items: 0
  }
  for (const group of matrix?.priority_groups || []) {
    stats.priority_groups += 1
    stats.total_anchor_review_items += Number(group.total_items || 0)
    countInto(stats.by_priority_tier, group.priority_tier)
    countInto(stats.by_review_strategy, group.review_strategy)
    countInto(stats.by_subject, group.subject_slug)
    countInto(stats.by_subject_items, group.subject_slug, Number(group.total_items || 0))
  }
  return stats
}

function zeroAnchorItemReviewSubjectStats(subjectSlug) {
  return {
    by_recommendation: {},
    by_work_queue: {},
    item_review_action_work_items: 0,
    source_anchor_review_rows: 0,
    subject_slug: subjectSlug,
    suggested_child_slices: 0,
    target_missing_grade_standards: 0
  }
}

function anchorItemReviewSubjectStats(worklist) {
  const stats = {}
  for (const row of worklist?.item_review_action_work_items || []) {
    const subjectSlug = row.subject_slug || 'missing'
    if (!stats[subjectSlug]) stats[subjectSlug] = zeroAnchorItemReviewSubjectStats(subjectSlug)
    const subject = stats[subjectSlug]
    subject.item_review_action_work_items += 1
    subject.source_anchor_review_rows += Number(row.source_anchor_review_rows || 0)
    subject.suggested_child_slices += (row.suggested_child_slices || []).length
    subject.target_missing_grade_standards += (row.target_missing_grade_standards || []).length
    countInto(subject.by_recommendation, row.recommended_reviewer_decision)
    countInto(subject.by_work_queue, row.work_queue)
  }
  return stats
}

function zeroDownstreamManualSubjectStats(subjectSlug) {
  return {
    by_closure_readiness: {},
    by_manual_confirmation_lane: {},
    manual_confirmation_items: 0,
    subject_slug: subjectSlug,
    unique_standard_codes: 0
  }
}

function downstreamManualSubjectStats(worklist) {
  const stats = {}
  const standardsBySubject = {}
  for (const row of worklist?.manual_confirmation_work_items || []) {
    const subjectSlug = row.subject_slug || 'missing'
    if (!stats[subjectSlug]) stats[subjectSlug] = zeroDownstreamManualSubjectStats(subjectSlug)
    if (!standardsBySubject[subjectSlug]) standardsBySubject[subjectSlug] = new Set()
    const subject = stats[subjectSlug]
    subject.manual_confirmation_items += 1
    if (row.standard_code) standardsBySubject[subjectSlug].add(row.standard_code)
    countInto(subject.by_closure_readiness, row.closure_readiness)
    countInto(subject.by_manual_confirmation_lane, row.manual_confirmation_lane)
  }
  for (const [subjectSlug, values] of Object.entries(standardsBySubject)) {
    stats[subjectSlug].unique_standard_codes = values.size
  }
  return stats
}

function validateInputs(readiness, distinctiveness, productReadiness, productReadinessWorklist, anchorDecisions, priorityMatrix, anchorItemReviewWorklist, anchorItemReviewDownstreamCoverage, anchorDownstreamActionWorklist, anchorDownstreamActionCoverage, anchorDownstreamActionClosureReadiness, anchorDownstreamManualConfirmationWorklist, anchorDownstreamTargetGapDecisionsCandidate, anchorDownstreamTargetGapDecisionsCandidateAudit, anchorDownstreamTargetGapParentDecisionsCandidate, anchorDownstreamTargetGapParentDecisionsCandidateAudit, anchorDownstreamManualScopeDecisionsCandidate, anchorDownstreamManualScopeDecisionsCandidateAudit, anchorDownstreamManualScopeParentDecisionsCandidate, anchorDownstreamManualScopeParentDecisionsCandidateAudit, anchorDownstreamSourceAnchorEvidenceBatch, anchorDownstreamSourceAnchorEvidenceBatchAudit, anchorDownstreamSourceAnchorEvidenceInventory, anchorDownstreamSourceAnchorEvidenceInventoryAudit, anchorDownstreamSourceAnchorReviewWorklist, anchorDownstreamSourceAnchorReviewWorklistAudit, anchorDownstreamSourceAnchorPageEvidencePacket, anchorDownstreamSourceAnchorPageEvidencePacketAudit, anchorDownstreamSourceAnchorReviewDecisions, anchorDownstreamSourceAnchorReviewDecisionsAudit, anchorDownstreamSourceAnchorReviewRecommendations, anchorDownstreamSourceAnchorReviewRecommendationsAudit, unitCandidateCoverage, unitCandidateCoverageWorklist, unitBlockerMatchDiagnostics, unitBlockerActionWorklist, unitAnchorPolicyReviewBatch, unitAnchorPolicyReviewDecisions, unitAnchorPolicyReviewRecommendations, unitAnchorPolicyReviewActionWorklist, unitAnchorPolicySourceAnchorSpecificityBatch, unitAnchorPolicySourceAnchorSpecificityDecisions, unitAnchorPolicySourceAnchorSpecificityEvidencePacket, unitAnchorPolicySourceAnchorSpecificityGroupTriage, unitGroupReadyCandidate, errors, warnings) {
  if (readiness?.valid !== true) errors.push('readiness audit must be valid=true')
  if (distinctiveness?.valid !== true) errors.push('distinctiveness audit must be valid=true')
  if (productReadiness) {
    if (productReadiness.valid !== true) errors.push('product readiness audit must be valid=true')
    if (productReadiness.purpose !== 'h4g_product_readiness_audit') {
      errors.push('product readiness audit purpose mismatch')
    }
    if (productReadiness.writes_public_data !== false) errors.push('product readiness audit writes_public_data must be false')
    if (productReadiness.changes_official_standard_text !== false) {
      errors.push('product readiness audit changes_official_standard_text must be false')
    }
    if (productReadiness.direct_matcher_use !== false) errors.push('product readiness audit direct_matcher_use must be false')
  }
  if (productReadinessWorklist) {
    if (productReadinessWorklist.valid !== true) errors.push('product readiness worklist must be valid=true')
    if (productReadinessWorklist.purpose !== 'h4g_product_readiness_worklist') {
      errors.push('product readiness worklist purpose mismatch')
    }
    if (productReadinessWorklist.product_readiness_worklist_only !== true) {
      errors.push('product readiness worklist product_readiness_worklist_only must be true')
    }
    if (productReadinessWorklist.writes_public_data !== false) errors.push('product readiness worklist writes_public_data must be false')
    if (productReadinessWorklist.changes_official_standard_text !== false) {
      errors.push('product readiness worklist changes_official_standard_text must be false')
    }
    if (productReadinessWorklist.direct_matcher_use !== false) errors.push('product readiness worklist direct_matcher_use must be false')
  }
  if (anchorDecisions?.valid !== true) errors.push('anchor group decisions must be valid=true')
  if (priorityMatrix?.valid !== true) errors.push('anchor priority matrix must be valid=true')
  if (anchorDecisions?.writes_public_data !== false) errors.push('anchor group decisions writes_public_data must be false')
  if (anchorDecisions?.changes_official_standard_text !== false) errors.push('anchor group decisions changes_official_standard_text must be false')
  if (anchorDecisions?.direct_matcher_use !== false) errors.push('anchor group decisions direct_matcher_use must be false')
  if (priorityMatrix?.writes_public_data !== false) errors.push('anchor priority matrix writes_public_data must be false')
  if (anchorItemReviewWorklist) {
    if (anchorItemReviewWorklist.valid !== true) errors.push('anchor group item review worklist must be valid=true')
    if (anchorItemReviewWorklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_action_worklist') {
      errors.push('anchor group item review worklist purpose mismatch')
    }
    if (anchorItemReviewWorklist.worklist_only !== true) errors.push('anchor group item review worklist worklist_only must be true')
    if (anchorItemReviewWorklist.writes_public_data !== false) errors.push('anchor group item review worklist writes_public_data must be false')
    if (anchorItemReviewWorklist.changes_official_standard_text !== false) {
      errors.push('anchor group item review worklist changes_official_standard_text must be false')
    }
    if (anchorItemReviewWorklist.direct_matcher_use !== false) errors.push('anchor group item review worklist direct_matcher_use must be false')
    if (anchorItemReviewWorklist.matcher_ready !== false) errors.push('anchor group item review worklist matcher_ready must be false')
    if (anchorItemReviewWorklist.publication_ready !== false) errors.push('anchor group item review worklist publication_ready must be false')
  }
  if (anchorItemReviewDownstreamCoverage) {
    if (anchorItemReviewDownstreamCoverage.valid !== true) errors.push('anchor group item review downstream coverage must be valid=true')
    if (anchorItemReviewDownstreamCoverage.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_coverage_audit') {
      errors.push('anchor group item review downstream coverage purpose mismatch')
    }
    if (anchorItemReviewDownstreamCoverage.worklist_only !== true) {
      errors.push('anchor group item review downstream coverage worklist_only must be true')
    }
    if (anchorItemReviewDownstreamCoverage.writes_public_data !== false) {
      errors.push('anchor group item review downstream coverage writes_public_data must be false')
    }
    if (anchorItemReviewDownstreamCoverage.changes_official_standard_text !== false) {
      errors.push('anchor group item review downstream coverage changes_official_standard_text must be false')
    }
    if (anchorItemReviewDownstreamCoverage.direct_matcher_use !== false) {
      errors.push('anchor group item review downstream coverage direct_matcher_use must be false')
    }
    if (anchorItemReviewDownstreamCoverage.matcher_ready !== false) errors.push('anchor group item review downstream coverage matcher_ready must be false')
    if (anchorItemReviewDownstreamCoverage.publication_ready !== false) {
      errors.push('anchor group item review downstream coverage publication_ready must be false')
    }
    if (anchorItemReviewWorklist &&
        Number(anchorItemReviewDownstreamCoverage.summary?.expected_parent_work_items || 0) !== Number(anchorItemReviewWorklist.summary?.item_review_action_work_items || 0)) {
      warnings.push(`anchor item review downstream expected_parent_work_items differs from worklist item_review_action_work_items: ${anchorItemReviewDownstreamCoverage.summary?.expected_parent_work_items ?? 'missing'} vs ${anchorItemReviewWorklist.summary?.item_review_action_work_items ?? 'missing'}`)
    }
  }
  if (anchorDownstreamActionWorklist) {
    if (anchorDownstreamActionWorklist.valid !== true) errors.push('anchor downstream action worklist must be valid=true')
    if (anchorDownstreamActionWorklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_worklist') {
      errors.push('anchor downstream action worklist purpose mismatch')
    }
    if (anchorDownstreamActionWorklist.worklist_only !== true) errors.push('anchor downstream action worklist worklist_only must be true')
    if (anchorDownstreamActionWorklist.writes_public_data !== false) errors.push('anchor downstream action worklist writes_public_data must be false')
    if (anchorDownstreamActionWorklist.changes_official_standard_text !== false) {
      errors.push('anchor downstream action worklist changes_official_standard_text must be false')
    }
    if (anchorDownstreamActionWorklist.direct_matcher_use !== false) errors.push('anchor downstream action worklist direct_matcher_use must be false')
    if (anchorDownstreamActionWorklist.matcher_ready !== false) errors.push('anchor downstream action worklist matcher_ready must be false')
    if (anchorDownstreamActionWorklist.publication_ready !== false) errors.push('anchor downstream action worklist publication_ready must be false')
  }
  if (anchorDownstreamActionCoverage) {
    if (anchorDownstreamActionCoverage.valid !== true) errors.push('anchor downstream action coverage must be valid=true')
    if (anchorDownstreamActionCoverage.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_coverage_audit') {
      errors.push('anchor downstream action coverage purpose mismatch')
    }
    if (anchorDownstreamActionCoverage.worklist_only !== true) errors.push('anchor downstream action coverage worklist_only must be true')
    if (anchorDownstreamActionCoverage.writes_public_data !== false) errors.push('anchor downstream action coverage writes_public_data must be false')
    if (anchorDownstreamActionCoverage.changes_official_standard_text !== false) {
      errors.push('anchor downstream action coverage changes_official_standard_text must be false')
    }
    if (anchorDownstreamActionCoverage.direct_matcher_use !== false) errors.push('anchor downstream action coverage direct_matcher_use must be false')
    if (anchorDownstreamActionCoverage.matcher_ready !== false) errors.push('anchor downstream action coverage matcher_ready must be false')
    if (anchorDownstreamActionCoverage.publication_ready !== false) errors.push('anchor downstream action coverage publication_ready must be false')
    if (anchorDownstreamActionWorklist &&
        Number(anchorDownstreamActionCoverage.summary?.expected_parent_work_items || 0) !== Number(anchorDownstreamActionWorklist.summary?.downstream_action_work_items || 0)) {
      warnings.push(`anchor downstream action coverage expected_parent_work_items differs from worklist downstream_action_work_items: ${anchorDownstreamActionCoverage.summary?.expected_parent_work_items ?? 'missing'} vs ${anchorDownstreamActionWorklist.summary?.downstream_action_work_items ?? 'missing'}`)
    }
  }
  if (anchorDownstreamActionClosureReadiness) {
    if (anchorDownstreamActionClosureReadiness.valid !== true) errors.push('anchor downstream action closure readiness must be valid=true')
    if (anchorDownstreamActionClosureReadiness.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness') {
      errors.push('anchor downstream action closure readiness purpose mismatch')
    }
    if (anchorDownstreamActionClosureReadiness.writes_public_data !== false) errors.push('anchor downstream action closure readiness writes_public_data must be false')
    if (anchorDownstreamActionClosureReadiness.changes_official_standard_text !== false) {
      errors.push('anchor downstream action closure readiness changes_official_standard_text must be false')
    }
    if (anchorDownstreamActionClosureReadiness.direct_matcher_use !== false) {
      errors.push('anchor downstream action closure readiness direct_matcher_use must be false')
    }
    if (anchorDownstreamActionClosureReadiness.matcher_ready !== false) errors.push('anchor downstream action closure readiness matcher_ready must be false')
    if (anchorDownstreamActionClosureReadiness.publication_ready !== false) {
      errors.push('anchor downstream action closure readiness publication_ready must be false')
    }
  }
  if (anchorDownstreamManualConfirmationWorklist) {
    if (anchorDownstreamManualConfirmationWorklist.valid !== true) {
      errors.push('anchor downstream manual confirmation worklist must be valid=true')
    }
    if (anchorDownstreamManualConfirmationWorklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist') {
      errors.push('anchor downstream manual confirmation worklist purpose mismatch')
    }
    if (anchorDownstreamManualConfirmationWorklist.worklist_only !== true) {
      errors.push('anchor downstream manual confirmation worklist worklist_only must be true')
    }
    if (anchorDownstreamManualConfirmationWorklist.writes_public_data !== false) {
      errors.push('anchor downstream manual confirmation worklist writes_public_data must be false')
    }
    if (anchorDownstreamManualConfirmationWorklist.changes_official_standard_text !== false) {
      errors.push('anchor downstream manual confirmation worklist changes_official_standard_text must be false')
    }
    if (anchorDownstreamManualConfirmationWorklist.direct_matcher_use !== false) {
      errors.push('anchor downstream manual confirmation worklist direct_matcher_use must be false')
    }
    if (anchorDownstreamManualConfirmationWorklist.matcher_ready !== false) {
      errors.push('anchor downstream manual confirmation worklist matcher_ready must be false')
    }
    if (anchorDownstreamManualConfirmationWorklist.publication_ready !== false) {
      errors.push('anchor downstream manual confirmation worklist publication_ready must be false')
    }
    if (anchorDownstreamActionClosureReadiness &&
        Number(anchorDownstreamManualConfirmationWorklist.summary?.manual_confirmation_items || 0) !== Number(anchorDownstreamActionClosureReadiness.summary?.manual_confirmation_required_items || 0)) {
      warnings.push(`manual confirmation worklist items differ from closure manual_confirmation_required_items: ${anchorDownstreamManualConfirmationWorklist.summary?.manual_confirmation_items ?? 'missing'} vs ${anchorDownstreamActionClosureReadiness.summary?.manual_confirmation_required_items ?? 'missing'}`)
    }
  }
  validateReadOnlyCandidate('anchor downstream target-gap decisions candidate', anchorDownstreamTargetGapDecisionsCandidate, errors, {
    candidatePurpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_decisions_candidate',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template'
  })
  validateReadOnlyAudit('anchor downstream target-gap decisions candidate audit', anchorDownstreamTargetGapDecisionsCandidateAudit, errors)
  validateReadOnlyCandidate('anchor downstream target-gap parent decisions candidate', anchorDownstreamTargetGapParentDecisionsCandidate, errors, {
    candidatePurpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_gap_inventory_parent_decisions_candidate',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template'
  })
  validateReadOnlyAudit('anchor downstream target-gap parent decisions candidate audit', anchorDownstreamTargetGapParentDecisionsCandidateAudit, errors)
  validateReadOnlyCandidate('anchor downstream manual-scope decisions candidate', anchorDownstreamManualScopeDecisionsCandidate, errors, {
    candidatePurpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_decisions_candidate',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template'
  })
  validateReadOnlyAudit('anchor downstream manual-scope decisions candidate audit', anchorDownstreamManualScopeDecisionsCandidateAudit, errors)
  validateReadOnlyCandidate('anchor downstream manual-scope parent decisions candidate', anchorDownstreamManualScopeParentDecisionsCandidate, errors, {
    candidatePurpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_scope_indexing_parent_decisions_candidate',
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_decisions_template'
  })
  validateReadOnlyAudit('anchor downstream manual-scope parent decisions candidate audit', anchorDownstreamManualScopeParentDecisionsCandidateAudit, errors)
  const targetGapActionCandidates = Number(anchorDownstreamTargetGapDecisionsCandidate?.summary?.inventory_candidate_decisions || 0)
  const targetGapActionAuditCandidates = Number(anchorDownstreamTargetGapDecisionsCandidateAudit?.summary?.inventory_candidate_decisions || 0)
  const targetGapParentCandidates = Number(anchorDownstreamTargetGapParentDecisionsCandidate?.summary?.parent_candidate_decisions || 0)
  const targetGapParentAuditCandidates = Number(anchorDownstreamTargetGapParentDecisionsCandidateAudit?.summary?.parent_candidate_decisions || 0)
  const manualScopeActionCandidates = Number(anchorDownstreamManualScopeDecisionsCandidate?.summary?.candidate_decisions || 0)
  const manualScopeActionAuditCandidates = Number(anchorDownstreamManualScopeDecisionsCandidateAudit?.summary?.candidate_decisions || 0)
  const manualScopeParentCandidates = Number(anchorDownstreamManualScopeParentDecisionsCandidate?.summary?.candidate_decisions || 0)
  const manualScopeParentAuditCandidates = Number(anchorDownstreamManualScopeParentDecisionsCandidateAudit?.summary?.candidate_decisions || 0)
  if (anchorDownstreamTargetGapDecisionsCandidate && anchorDownstreamTargetGapDecisionsCandidateAudit && targetGapActionCandidates !== targetGapActionAuditCandidates) {
    errors.push(`target-gap action candidate decisions differ from audit: ${targetGapActionCandidates} vs ${targetGapActionAuditCandidates}`)
  }
  if (anchorDownstreamTargetGapParentDecisionsCandidate && anchorDownstreamTargetGapParentDecisionsCandidateAudit && targetGapParentCandidates !== targetGapParentAuditCandidates) {
    errors.push(`target-gap parent candidate decisions differ from audit: ${targetGapParentCandidates} vs ${targetGapParentAuditCandidates}`)
  }
  if (targetGapActionCandidates && targetGapParentCandidates && targetGapActionCandidates !== targetGapParentCandidates) {
    errors.push(`target-gap action and parent candidate counts differ: ${targetGapActionCandidates} vs ${targetGapParentCandidates}`)
  }
  if (anchorDownstreamManualScopeDecisionsCandidate && anchorDownstreamManualScopeDecisionsCandidateAudit && manualScopeActionCandidates !== manualScopeActionAuditCandidates) {
    errors.push(`manual-scope action candidate decisions differ from audit: ${manualScopeActionCandidates} vs ${manualScopeActionAuditCandidates}`)
  }
  if (anchorDownstreamManualScopeParentDecisionsCandidate && anchorDownstreamManualScopeParentDecisionsCandidateAudit && manualScopeParentCandidates !== manualScopeParentAuditCandidates) {
    errors.push(`manual-scope parent candidate decisions differ from audit: ${manualScopeParentCandidates} vs ${manualScopeParentAuditCandidates}`)
  }
  if (manualScopeActionCandidates && manualScopeParentCandidates && manualScopeActionCandidates !== manualScopeParentCandidates) {
    errors.push(`manual-scope action and parent candidate counts differ: ${manualScopeActionCandidates} vs ${manualScopeParentCandidates}`)
  }
  validateReadOnlyArtifact('anchor downstream source-anchor evidence batch', anchorDownstreamSourceAnchorEvidenceBatch, errors, {
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch',
    trueFlags: ['worklist_only']
  })
  validateReadOnlyAudit('anchor downstream source-anchor evidence batch audit', anchorDownstreamSourceAnchorEvidenceBatchAudit, errors)
  validateReadOnlyArtifact('anchor downstream source-anchor evidence inventory', anchorDownstreamSourceAnchorEvidenceInventory, errors, {
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory',
    trueFlags: ['evidence_inventory_only']
  })
  validateReadOnlyAudit('anchor downstream source-anchor evidence inventory audit', anchorDownstreamSourceAnchorEvidenceInventoryAudit, errors)
  const sourceAnchorBatchItems = Number(anchorDownstreamSourceAnchorEvidenceBatch?.summary?.source_anchor_evidence_items || 0)
  const sourceAnchorBatchAuditItems = Number(anchorDownstreamSourceAnchorEvidenceBatchAudit?.summary?.source_anchor_evidence_items || 0)
  const sourceAnchorInventoryItems = Number(anchorDownstreamSourceAnchorEvidenceInventory?.summary?.inventory_items || 0)
  const sourceAnchorInventoryAuditItems = Number(anchorDownstreamSourceAnchorEvidenceInventoryAudit?.summary?.inventory_items || 0)
  const manualConfirmationSourceAnchorItems = Number(anchorDownstreamManualConfirmationWorklist?.summary?.by_source_downstream_action_batch?.source_anchor_evidence || 0)
  if (anchorDownstreamSourceAnchorEvidenceBatch && anchorDownstreamSourceAnchorEvidenceBatchAudit && sourceAnchorBatchItems !== sourceAnchorBatchAuditItems) {
    errors.push(`source-anchor evidence batch items differ from audit: ${sourceAnchorBatchItems} vs ${sourceAnchorBatchAuditItems}`)
  }
  if (anchorDownstreamSourceAnchorEvidenceInventory && anchorDownstreamSourceAnchorEvidenceInventoryAudit && sourceAnchorInventoryItems !== sourceAnchorInventoryAuditItems) {
    errors.push(`source-anchor evidence inventory items differ from audit: ${sourceAnchorInventoryItems} vs ${sourceAnchorInventoryAuditItems}`)
  }
  if (sourceAnchorBatchItems && sourceAnchorInventoryItems && sourceAnchorBatchItems !== sourceAnchorInventoryItems) {
    errors.push(`source-anchor evidence batch and inventory counts differ: ${sourceAnchorBatchItems} vs ${sourceAnchorInventoryItems}`)
  }
  if (manualConfirmationSourceAnchorItems && sourceAnchorInventoryItems && manualConfirmationSourceAnchorItems !== sourceAnchorInventoryItems) {
    errors.push(`manual confirmation source-anchor items differ from inventory: ${manualConfirmationSourceAnchorItems} vs ${sourceAnchorInventoryItems}`)
  }
  validateReadOnlyArtifact('anchor downstream source-anchor review worklist', anchorDownstreamSourceAnchorReviewWorklist, errors, {
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_worklist',
    trueFlags: ['worklist_only']
  })
  validateReadOnlyAudit('anchor downstream source-anchor review worklist audit', anchorDownstreamSourceAnchorReviewWorklistAudit, errors)
  const sourceAnchorReviewWorkItems = Number(anchorDownstreamSourceAnchorReviewWorklist?.summary?.source_anchor_review_work_items || 0)
  const sourceAnchorReviewAuditItems = Number(anchorDownstreamSourceAnchorReviewWorklistAudit?.summary?.source_anchor_review_work_items || 0)
  const sourceAnchorReviewAuditExpectedItems = Number(anchorDownstreamSourceAnchorReviewWorklistAudit?.summary?.expected_review_work_items || 0)
  if (anchorDownstreamSourceAnchorReviewWorklist && anchorDownstreamSourceAnchorReviewWorklistAudit && sourceAnchorReviewWorkItems !== sourceAnchorReviewAuditItems) {
    errors.push(`source-anchor review worklist items differ from audit: ${sourceAnchorReviewWorkItems} vs ${sourceAnchorReviewAuditItems}`)
  }
  if (sourceAnchorReviewAuditExpectedItems && sourceAnchorReviewWorkItems && sourceAnchorReviewAuditExpectedItems !== sourceAnchorReviewWorkItems) {
    errors.push(`source-anchor review worklist expected items differ from worklist: ${sourceAnchorReviewAuditExpectedItems} vs ${sourceAnchorReviewWorkItems}`)
  }
  if (sourceAnchorInventoryItems && sourceAnchorReviewWorkItems && sourceAnchorInventoryItems !== sourceAnchorReviewWorkItems) {
    errors.push(`source-anchor inventory items differ from review worklist: ${sourceAnchorInventoryItems} vs ${sourceAnchorReviewWorkItems}`)
  }
  validateReadOnlyArtifact('anchor downstream source-anchor page evidence packet', anchorDownstreamSourceAnchorPageEvidencePacket, errors, {
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_page_evidence_packet',
    trueFlags: ['page_evidence_packet_only']
  })
  validateReadOnlyAudit('anchor downstream source-anchor page evidence packet audit', anchorDownstreamSourceAnchorPageEvidencePacketAudit, errors)
  const sourceAnchorPageEvidenceItems = Number(anchorDownstreamSourceAnchorPageEvidencePacket?.summary?.page_evidence_items || 0)
  const sourceAnchorPageEvidenceAuditItems = Number(anchorDownstreamSourceAnchorPageEvidencePacketAudit?.summary?.audited_page_evidence_items || 0)
  const sourceAnchorPageEvidenceAuditExpectedItems = Number(anchorDownstreamSourceAnchorPageEvidencePacketAudit?.summary?.expected_page_evidence_items || 0)
  if (anchorDownstreamSourceAnchorPageEvidencePacket && anchorDownstreamSourceAnchorPageEvidencePacketAudit && sourceAnchorPageEvidenceItems !== sourceAnchorPageEvidenceAuditItems) {
    errors.push(`source-anchor page evidence items differ from audit: ${sourceAnchorPageEvidenceItems} vs ${sourceAnchorPageEvidenceAuditItems}`)
  }
  if (sourceAnchorPageEvidenceAuditExpectedItems && sourceAnchorPageEvidenceItems && sourceAnchorPageEvidenceAuditExpectedItems !== sourceAnchorPageEvidenceItems) {
    errors.push(`source-anchor page evidence expected items differ from packet: ${sourceAnchorPageEvidenceAuditExpectedItems} vs ${sourceAnchorPageEvidenceItems}`)
  }
  if (sourceAnchorReviewWorkItems && sourceAnchorPageEvidenceItems && sourceAnchorReviewWorkItems !== sourceAnchorPageEvidenceItems) {
    errors.push(`source-anchor review worklist items differ from page evidence packet: ${sourceAnchorReviewWorkItems} vs ${sourceAnchorPageEvidenceItems}`)
  }
  validateReadOnlyArtifact('anchor downstream source-anchor review decisions template', anchorDownstreamSourceAnchorReviewDecisions, errors, {
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template',
    trueFlags: ['decision_template_only', 'editable_manual_review_template']
  })
  validateReadOnlyAudit('anchor downstream source-anchor review decisions audit', anchorDownstreamSourceAnchorReviewDecisionsAudit, errors)
  const sourceAnchorReviewDecisionItems = Number(anchorDownstreamSourceAnchorReviewDecisions?.summary?.downstream_source_anchor_review_decisions || 0)
  const sourceAnchorReviewDecisionAuditItems = Number(anchorDownstreamSourceAnchorReviewDecisionsAudit?.summary?.audited_review_decisions || 0)
  const sourceAnchorReviewDecisionAuditExpectedItems = Number(anchorDownstreamSourceAnchorReviewDecisionsAudit?.summary?.expected_review_decisions || 0)
  if (anchorDownstreamSourceAnchorReviewDecisions && anchorDownstreamSourceAnchorReviewDecisionsAudit && sourceAnchorReviewDecisionItems !== sourceAnchorReviewDecisionAuditItems) {
    errors.push(`source-anchor review decisions differ from audit: ${sourceAnchorReviewDecisionItems} vs ${sourceAnchorReviewDecisionAuditItems}`)
  }
  if (sourceAnchorReviewDecisionAuditExpectedItems && sourceAnchorReviewDecisionItems && sourceAnchorReviewDecisionAuditExpectedItems !== sourceAnchorReviewDecisionItems) {
    errors.push(`source-anchor review decisions expected items differ from template: ${sourceAnchorReviewDecisionAuditExpectedItems} vs ${sourceAnchorReviewDecisionItems}`)
  }
  if (sourceAnchorPageEvidenceItems && sourceAnchorReviewDecisionItems && sourceAnchorPageEvidenceItems !== sourceAnchorReviewDecisionItems) {
    errors.push(`source-anchor page evidence items differ from review decisions: ${sourceAnchorPageEvidenceItems} vs ${sourceAnchorReviewDecisionItems}`)
  }
  validateReadOnlyArtifact('anchor downstream source-anchor review recommendations', anchorDownstreamSourceAnchorReviewRecommendations, errors, {
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations',
    trueFlags: ['recommendation_only']
  })
  validateReadOnlyAudit('anchor downstream source-anchor review recommendations audit', anchorDownstreamSourceAnchorReviewRecommendationsAudit, errors)
  const sourceAnchorReviewRecommendationItems = Number(anchorDownstreamSourceAnchorReviewRecommendations?.summary?.downstream_source_anchor_review_recommendations || 0)
  const sourceAnchorReviewRecommendationAuditItems = Number(anchorDownstreamSourceAnchorReviewRecommendationsAudit?.summary?.downstream_source_anchor_review_recommendations || 0)
  const sourceAnchorReviewRecommendationAuditExpectedItems = Number(anchorDownstreamSourceAnchorReviewRecommendationsAudit?.summary?.expected_source_anchor_review_decisions || 0)
  const sourceAnchorReviewRecommendationAuditMissingItems = Number(anchorDownstreamSourceAnchorReviewRecommendationsAudit?.summary?.missing_recommendations || 0)
  const sourceAnchorReviewRecommendationAuditExtraItems = Number(anchorDownstreamSourceAnchorReviewRecommendationsAudit?.summary?.extra_recommendations || 0)
  const sourceAnchorReviewRecommendationAutoApprovals = Number(anchorDownstreamSourceAnchorReviewRecommendations?.summary?.exact_anchor_auto_approval_recommendations || 0)
  if (anchorDownstreamSourceAnchorReviewRecommendations && anchorDownstreamSourceAnchorReviewRecommendationsAudit && sourceAnchorReviewRecommendationItems !== sourceAnchorReviewRecommendationAuditItems) {
    errors.push(`source-anchor review recommendations differ from audit: ${sourceAnchorReviewRecommendationItems} vs ${sourceAnchorReviewRecommendationAuditItems}`)
  }
  if (sourceAnchorReviewRecommendationAuditExpectedItems && sourceAnchorReviewRecommendationItems && sourceAnchorReviewRecommendationAuditExpectedItems !== sourceAnchorReviewRecommendationItems) {
    errors.push(`source-anchor review recommendation expected items differ from recommendations: ${sourceAnchorReviewRecommendationAuditExpectedItems} vs ${sourceAnchorReviewRecommendationItems}`)
  }
  if (sourceAnchorReviewDecisionItems && sourceAnchorReviewRecommendationItems && sourceAnchorReviewDecisionItems !== sourceAnchorReviewRecommendationItems) {
    errors.push(`source-anchor review decisions differ from recommendations: ${sourceAnchorReviewDecisionItems} vs ${sourceAnchorReviewRecommendationItems}`)
  }
  if (sourceAnchorReviewRecommendationAuditMissingItems) {
    errors.push(`source-anchor review recommendations audit has missing recommendations: ${sourceAnchorReviewRecommendationAuditMissingItems}`)
  }
  if (sourceAnchorReviewRecommendationAuditExtraItems) {
    errors.push(`source-anchor review recommendations audit has extra recommendations: ${sourceAnchorReviewRecommendationAuditExtraItems}`)
  }
  if (sourceAnchorReviewRecommendationAutoApprovals) {
    errors.push(`source-anchor review recommendations must not auto-approve exact anchors: ${sourceAnchorReviewRecommendationAutoApprovals}`)
  }
  if (unitCandidateCoverage) {
    if (unitCandidateCoverage.valid !== true) errors.push('unit candidate coverage audit must be valid=true')
    if (unitCandidateCoverage.purpose !== 'h4g_unit_evidence_candidate_coverage_audit') {
      errors.push('unit candidate coverage audit purpose mismatch')
    }
    if (unitCandidateCoverage.writes_public_data !== false) errors.push('unit candidate coverage audit writes_public_data must be false')
    if (unitCandidateCoverage.changes_official_standard_text !== false) {
      errors.push('unit candidate coverage audit changes_official_standard_text must be false')
    }
    if (unitCandidateCoverage.direct_matcher_use !== false) errors.push('unit candidate coverage audit direct_matcher_use must be false')
    if (unitCandidateCoverage.publication_ready !== false) errors.push('unit candidate coverage audit publication_ready must be false')
  }
  if (unitCandidateCoverageWorklist) {
    if (unitCandidateCoverageWorklist.valid !== true) errors.push('unit candidate coverage worklist must be valid=true')
    if (unitCandidateCoverageWorklist.purpose !== 'h4g_unit_evidence_candidate_coverage_worklist') {
      errors.push('unit candidate coverage worklist purpose mismatch')
    }
    if (unitCandidateCoverageWorklist.writes_public_data !== false) errors.push('unit candidate coverage worklist writes_public_data must be false')
    if (unitCandidateCoverageWorklist.changes_official_standard_text !== false) {
      errors.push('unit candidate coverage worklist changes_official_standard_text must be false')
    }
    if (unitCandidateCoverageWorklist.direct_matcher_use !== false) {
      errors.push('unit candidate coverage worklist direct_matcher_use must be false')
    }
    if (unitCandidateCoverageWorklist.publication_ready !== false) errors.push('unit candidate coverage worklist publication_ready must be false')
  }
  if (unitBlockerMatchDiagnostics) {
    if (unitBlockerMatchDiagnostics.valid !== true) errors.push('unit blocker match diagnostics must be valid=true')
    if (unitBlockerMatchDiagnostics.purpose !== 'h4g_unit_evidence_blocker_match_diagnostics') {
      errors.push('unit blocker match diagnostics purpose mismatch')
    }
    if (unitBlockerMatchDiagnostics.writes_public_data !== false) errors.push('unit blocker match diagnostics writes_public_data must be false')
    if (unitBlockerMatchDiagnostics.changes_official_standard_text !== false) {
      errors.push('unit blocker match diagnostics changes_official_standard_text must be false')
    }
    if (unitBlockerMatchDiagnostics.direct_matcher_use !== false) {
      errors.push('unit blocker match diagnostics direct_matcher_use must be false')
    }
    if (unitBlockerMatchDiagnostics.publication_ready !== false) errors.push('unit blocker match diagnostics publication_ready must be false')
    if (unitBlockerMatchDiagnostics.matcher_ready !== false) errors.push('unit blocker match diagnostics matcher_ready must be false')
  }
  if (unitBlockerActionWorklist) {
    if (unitBlockerActionWorklist.valid !== true) errors.push('unit blocker action worklist must be valid=true')
    if (unitBlockerActionWorklist.purpose !== 'h4g_unit_evidence_blocker_action_worklist') {
      errors.push('unit blocker action worklist purpose mismatch')
    }
    if (unitBlockerActionWorklist.worklist_only !== true) errors.push('unit blocker action worklist worklist_only must be true')
    if (unitBlockerActionWorklist.writes_public_data !== false) errors.push('unit blocker action worklist writes_public_data must be false')
    if (unitBlockerActionWorklist.changes_official_standard_text !== false) {
      errors.push('unit blocker action worklist changes_official_standard_text must be false')
    }
    if (unitBlockerActionWorklist.direct_matcher_use !== false) {
      errors.push('unit blocker action worklist direct_matcher_use must be false')
    }
    if (unitBlockerActionWorklist.publication_ready !== false) errors.push('unit blocker action worklist publication_ready must be false')
    if (unitBlockerActionWorklist.matcher_ready !== false) errors.push('unit blocker action worklist matcher_ready must be false')
  }
  if (unitAnchorPolicyReviewBatch) {
    if (unitAnchorPolicyReviewBatch.valid !== true) errors.push('unit anchor policy review batch must be valid=true')
    if (unitAnchorPolicyReviewBatch.purpose !== 'h4g_unit_evidence_anchor_policy_review_batch') {
      errors.push('unit anchor policy review batch purpose mismatch')
    }
    if (unitAnchorPolicyReviewBatch.review_batch_only !== true) errors.push('unit anchor policy review batch review_batch_only must be true')
    if (unitAnchorPolicyReviewBatch.writes_public_data !== false) errors.push('unit anchor policy review batch writes_public_data must be false')
    if (unitAnchorPolicyReviewBatch.changes_official_standard_text !== false) {
      errors.push('unit anchor policy review batch changes_official_standard_text must be false')
    }
    if (unitAnchorPolicyReviewBatch.direct_matcher_use !== false) {
      errors.push('unit anchor policy review batch direct_matcher_use must be false')
    }
    if (unitAnchorPolicyReviewBatch.publication_ready !== false) errors.push('unit anchor policy review batch publication_ready must be false')
    if (unitAnchorPolicyReviewBatch.matcher_ready !== false) errors.push('unit anchor policy review batch matcher_ready must be false')
  }
  if (unitAnchorPolicyReviewDecisions) {
    if (unitAnchorPolicyReviewDecisions.valid !== true) errors.push('unit anchor policy review decisions must be valid=true')
    if (unitAnchorPolicyReviewDecisions.purpose !== 'h4g_unit_evidence_anchor_policy_review_decisions_template') {
      errors.push('unit anchor policy review decisions purpose mismatch')
    }
    if (unitAnchorPolicyReviewDecisions.decision_template_only !== true) {
      errors.push('unit anchor policy review decisions decision_template_only must be true')
    }
    if (unitAnchorPolicyReviewDecisions.writes_public_data !== false) errors.push('unit anchor policy review decisions writes_public_data must be false')
    if (unitAnchorPolicyReviewDecisions.changes_official_standard_text !== false) {
      errors.push('unit anchor policy review decisions changes_official_standard_text must be false')
    }
    if (unitAnchorPolicyReviewDecisions.direct_matcher_use !== false) {
      errors.push('unit anchor policy review decisions direct_matcher_use must be false')
    }
    if (unitAnchorPolicyReviewDecisions.publication_ready !== false) errors.push('unit anchor policy review decisions publication_ready must be false')
    if (unitAnchorPolicyReviewDecisions.matcher_ready !== false) errors.push('unit anchor policy review decisions matcher_ready must be false')
  }
  if (unitAnchorPolicyReviewRecommendations) {
    if (unitAnchorPolicyReviewRecommendations.valid !== true) errors.push('unit anchor policy review recommendations must be valid=true')
    if (unitAnchorPolicyReviewRecommendations.purpose !== 'h4g_unit_evidence_anchor_policy_review_recommendations') {
      errors.push('unit anchor policy review recommendations purpose mismatch')
    }
    if (unitAnchorPolicyReviewRecommendations.recommendation_only !== true) {
      errors.push('unit anchor policy review recommendations recommendation_only must be true')
    }
    if (unitAnchorPolicyReviewRecommendations.review_batch_only !== true) {
      errors.push('unit anchor policy review recommendations review_batch_only must be true')
    }
    if (unitAnchorPolicyReviewRecommendations.writes_public_data !== false) {
      errors.push('unit anchor policy review recommendations writes_public_data must be false')
    }
    if (unitAnchorPolicyReviewRecommendations.changes_official_standard_text !== false) {
      errors.push('unit anchor policy review recommendations changes_official_standard_text must be false')
    }
    if (unitAnchorPolicyReviewRecommendations.direct_matcher_use !== false) {
      errors.push('unit anchor policy review recommendations direct_matcher_use must be false')
    }
    if (unitAnchorPolicyReviewRecommendations.publication_ready !== false) {
      errors.push('unit anchor policy review recommendations publication_ready must be false')
    }
    if (unitAnchorPolicyReviewRecommendations.matcher_ready !== false) {
      errors.push('unit anchor policy review recommendations matcher_ready must be false')
    }
  }
  if (unitAnchorPolicyReviewActionWorklist) {
    if (unitAnchorPolicyReviewActionWorklist.valid !== true) errors.push('unit anchor policy review action worklist must be valid=true')
    if (unitAnchorPolicyReviewActionWorklist.purpose !== 'h4g_unit_evidence_anchor_policy_review_action_worklist') {
      errors.push('unit anchor policy review action worklist purpose mismatch')
    }
    if (unitAnchorPolicyReviewActionWorklist.worklist_only !== true) {
      errors.push('unit anchor policy review action worklist worklist_only must be true')
    }
    if (unitAnchorPolicyReviewActionWorklist.recommendation_only !== true) {
      errors.push('unit anchor policy review action worklist recommendation_only must be true')
    }
    if (unitAnchorPolicyReviewActionWorklist.review_batch_only !== true) {
      errors.push('unit anchor policy review action worklist review_batch_only must be true')
    }
    if (unitAnchorPolicyReviewActionWorklist.writes_public_data !== false) {
      errors.push('unit anchor policy review action worklist writes_public_data must be false')
    }
    if (unitAnchorPolicyReviewActionWorklist.changes_official_standard_text !== false) {
      errors.push('unit anchor policy review action worklist changes_official_standard_text must be false')
    }
    if (unitAnchorPolicyReviewActionWorklist.direct_matcher_use !== false) {
      errors.push('unit anchor policy review action worklist direct_matcher_use must be false')
    }
    if (unitAnchorPolicyReviewActionWorklist.publication_ready !== false) {
      errors.push('unit anchor policy review action worklist publication_ready must be false')
    }
    if (unitAnchorPolicyReviewActionWorklist.matcher_ready !== false) {
      errors.push('unit anchor policy review action worklist matcher_ready must be false')
    }
  }
  if (unitAnchorPolicySourceAnchorSpecificityBatch) {
    if (unitAnchorPolicySourceAnchorSpecificityBatch.valid !== true) {
      errors.push('unit anchor policy source-anchor specificity batch must be valid=true')
    }
    if (unitAnchorPolicySourceAnchorSpecificityBatch.purpose !== 'h4g_unit_evidence_anchor_policy_source_anchor_specificity_batch') {
      errors.push('unit anchor policy source-anchor specificity batch purpose mismatch')
    }
    if (unitAnchorPolicySourceAnchorSpecificityBatch.worklist_only !== true) {
      errors.push('unit anchor policy source-anchor specificity batch worklist_only must be true')
    }
    if (unitAnchorPolicySourceAnchorSpecificityBatch.review_batch_only !== true) {
      errors.push('unit anchor policy source-anchor specificity batch review_batch_only must be true')
    }
    if (unitAnchorPolicySourceAnchorSpecificityBatch.source_anchor_specificity_batch_only !== true) {
      errors.push('unit anchor policy source-anchor specificity batch source_anchor_specificity_batch_only must be true')
    }
    if (unitAnchorPolicySourceAnchorSpecificityBatch.writes_public_data !== false) {
      errors.push('unit anchor policy source-anchor specificity batch writes_public_data must be false')
    }
    if (unitAnchorPolicySourceAnchorSpecificityBatch.changes_official_standard_text !== false) {
      errors.push('unit anchor policy source-anchor specificity batch changes_official_standard_text must be false')
    }
    if (unitAnchorPolicySourceAnchorSpecificityBatch.direct_matcher_use !== false) {
      errors.push('unit anchor policy source-anchor specificity batch direct_matcher_use must be false')
    }
    if (unitAnchorPolicySourceAnchorSpecificityBatch.publication_ready !== false) {
      errors.push('unit anchor policy source-anchor specificity batch publication_ready must be false')
    }
    if (unitAnchorPolicySourceAnchorSpecificityBatch.matcher_ready !== false) {
      errors.push('unit anchor policy source-anchor specificity batch matcher_ready must be false')
    }
  }
  if (unitAnchorPolicySourceAnchorSpecificityDecisions) {
    if (unitAnchorPolicySourceAnchorSpecificityDecisions.valid !== true) {
      errors.push('unit anchor policy source-anchor specificity decisions must be valid=true')
    }
    if (unitAnchorPolicySourceAnchorSpecificityDecisions.purpose !== 'h4g_unit_evidence_anchor_policy_source_anchor_specificity_decisions_template') {
      errors.push('unit anchor policy source-anchor specificity decisions purpose mismatch')
    }
    if (unitAnchorPolicySourceAnchorSpecificityDecisions.decision_template_only !== true) {
      errors.push('unit anchor policy source-anchor specificity decisions decision_template_only must be true')
    }
    if (unitAnchorPolicySourceAnchorSpecificityDecisions.editable_manual_review_template !== true) {
      errors.push('unit anchor policy source-anchor specificity decisions editable_manual_review_template must be true')
    }
    if (unitAnchorPolicySourceAnchorSpecificityDecisions.review_batch_only !== true) {
      errors.push('unit anchor policy source-anchor specificity decisions review_batch_only must be true')
    }
    if (unitAnchorPolicySourceAnchorSpecificityDecisions.source_anchor_specificity_batch_only !== true) {
      errors.push('unit anchor policy source-anchor specificity decisions source_anchor_specificity_batch_only must be true')
    }
    if (unitAnchorPolicySourceAnchorSpecificityDecisions.writes_public_data !== false) {
      errors.push('unit anchor policy source-anchor specificity decisions writes_public_data must be false')
    }
    if (unitAnchorPolicySourceAnchorSpecificityDecisions.changes_official_standard_text !== false) {
      errors.push('unit anchor policy source-anchor specificity decisions changes_official_standard_text must be false')
    }
    if (unitAnchorPolicySourceAnchorSpecificityDecisions.direct_matcher_use !== false) {
      errors.push('unit anchor policy source-anchor specificity decisions direct_matcher_use must be false')
    }
    if (unitAnchorPolicySourceAnchorSpecificityDecisions.publication_ready !== false) {
      errors.push('unit anchor policy source-anchor specificity decisions publication_ready must be false')
    }
    if (unitAnchorPolicySourceAnchorSpecificityDecisions.matcher_ready !== false) {
      errors.push('unit anchor policy source-anchor specificity decisions matcher_ready must be false')
    }
  }
  if (unitAnchorPolicySourceAnchorSpecificityEvidencePacket) {
    if (unitAnchorPolicySourceAnchorSpecificityEvidencePacket.valid !== true) {
      errors.push('unit anchor policy source-anchor specificity evidence packet must be valid=true')
    }
    if (unitAnchorPolicySourceAnchorSpecificityEvidencePacket.purpose !== 'h4g_unit_evidence_anchor_policy_source_anchor_specificity_evidence_packet') {
      errors.push('unit anchor policy source-anchor specificity evidence packet purpose mismatch')
    }
    if (unitAnchorPolicySourceAnchorSpecificityEvidencePacket.evidence_packet_only !== true) {
      errors.push('unit anchor policy source-anchor specificity evidence packet evidence_packet_only must be true')
    }
    if (unitAnchorPolicySourceAnchorSpecificityEvidencePacket.review_batch_only !== true) {
      errors.push('unit anchor policy source-anchor specificity evidence packet review_batch_only must be true')
    }
    if (unitAnchorPolicySourceAnchorSpecificityEvidencePacket.source_anchor_specificity_batch_only !== true) {
      errors.push('unit anchor policy source-anchor specificity evidence packet source_anchor_specificity_batch_only must be true')
    }
    if (unitAnchorPolicySourceAnchorSpecificityEvidencePacket.source_anchor_specificity_evidence_packet_only !== true) {
      errors.push('unit anchor policy source-anchor specificity evidence packet source_anchor_specificity_evidence_packet_only must be true')
    }
    if (unitAnchorPolicySourceAnchorSpecificityEvidencePacket.writes_public_data !== false) {
      errors.push('unit anchor policy source-anchor specificity evidence packet writes_public_data must be false')
    }
    if (unitAnchorPolicySourceAnchorSpecificityEvidencePacket.changes_official_standard_text !== false) {
      errors.push('unit anchor policy source-anchor specificity evidence packet changes_official_standard_text must be false')
    }
    if (unitAnchorPolicySourceAnchorSpecificityEvidencePacket.direct_matcher_use !== false) {
      errors.push('unit anchor policy source-anchor specificity evidence packet direct_matcher_use must be false')
    }
    if (unitAnchorPolicySourceAnchorSpecificityEvidencePacket.publication_ready !== false) {
      errors.push('unit anchor policy source-anchor specificity evidence packet publication_ready must be false')
    }
    if (unitAnchorPolicySourceAnchorSpecificityEvidencePacket.matcher_ready !== false) {
      errors.push('unit anchor policy source-anchor specificity evidence packet matcher_ready must be false')
    }
  }
  if (unitAnchorPolicySourceAnchorSpecificityGroupTriage) {
    if (unitAnchorPolicySourceAnchorSpecificityGroupTriage.valid !== true) {
      errors.push('unit anchor policy source-anchor specificity group triage must be valid=true')
    }
    if (unitAnchorPolicySourceAnchorSpecificityGroupTriage.purpose !== 'h4g_unit_evidence_anchor_policy_source_anchor_specificity_group_triage') {
      errors.push('unit anchor policy source-anchor specificity group triage purpose mismatch')
    }
    if (unitAnchorPolicySourceAnchorSpecificityGroupTriage.review_batch_only !== true) {
      errors.push('unit anchor policy source-anchor specificity group triage review_batch_only must be true')
    }
    if (unitAnchorPolicySourceAnchorSpecificityGroupTriage.source_anchor_specificity_batch_only !== true) {
      errors.push('unit anchor policy source-anchor specificity group triage source_anchor_specificity_batch_only must be true')
    }
    if (unitAnchorPolicySourceAnchorSpecificityGroupTriage.source_anchor_specificity_group_triage_only !== true) {
      errors.push('unit anchor policy source-anchor specificity group triage source_anchor_specificity_group_triage_only must be true')
    }
    if (unitAnchorPolicySourceAnchorSpecificityGroupTriage.writes_public_data !== false) {
      errors.push('unit anchor policy source-anchor specificity group triage writes_public_data must be false')
    }
    if (unitAnchorPolicySourceAnchorSpecificityGroupTriage.changes_official_standard_text !== false) {
      errors.push('unit anchor policy source-anchor specificity group triage changes_official_standard_text must be false')
    }
    if (unitAnchorPolicySourceAnchorSpecificityGroupTriage.direct_matcher_use !== false) {
      errors.push('unit anchor policy source-anchor specificity group triage direct_matcher_use must be false')
    }
    if (unitAnchorPolicySourceAnchorSpecificityGroupTriage.publication_ready !== false) {
      errors.push('unit anchor policy source-anchor specificity group triage publication_ready must be false')
    }
    if (unitAnchorPolicySourceAnchorSpecificityGroupTriage.matcher_ready !== false) {
      errors.push('unit anchor policy source-anchor specificity group triage matcher_ready must be false')
    }
  }
  if (unitGroupReadyCandidate) {
    if (unitGroupReadyCandidate.valid !== true) errors.push('unit group-ready candidate must be valid=true')
    if (unitGroupReadyCandidate.purpose !== 'h4g_unit_evidence_group_ready_candidate') {
      errors.push('unit group-ready candidate purpose mismatch')
    }
    if (unitGroupReadyCandidate.writes_public_data !== false) errors.push('unit group-ready candidate writes_public_data must be false')
    if (unitGroupReadyCandidate.changes_official_standard_text !== false) {
      errors.push('unit group-ready candidate changes_official_standard_text must be false')
    }
    if (unitGroupReadyCandidate.direct_matcher_use !== false) {
      errors.push('unit group-ready candidate direct_matcher_use must be false')
    }
    if (unitGroupReadyCandidate.publication_ready !== false) errors.push('unit group-ready candidate publication_ready must be false')
    if (unitGroupReadyCandidate.matcher_ready !== false) errors.push('unit group-ready candidate matcher_ready must be false')
    if (unitGroupReadyCandidate.policy?.group_ready_candidate_only !== true) {
      errors.push('unit group-ready candidate policy.group_ready_candidate_only must be true')
    }
  }

  const readinessTotals = readiness?.totals || {}
  const distinctTotals = distinctiveness?.totals || {}
  const totalChecks = [
    ['h4g_records vs junior_records', readinessTotals.h4g_records, distinctTotals.junior_records],
    ['progression_groups', readinessTotals.progression_groups, distinctTotals.progression_groups],
    ['complete_triplets', readinessTotals.complete_triplets, distinctTotals.complete_triplets],
    ['exact identical triplets', readinessTotals.exact_core_identical_triplets, distinctTotals.exact_identical_triplets],
    ['unit-level records', readinessTotals.unit_level_evidence_records, distinctTotals.unit_level_evidence_records]
  ]
  for (const [label, left, right] of totalChecks) {
    if (Number(left || 0) !== Number(right || 0)) {
      warnings.push(`${label} differs between readiness and distinctiveness audits: ${left ?? 'missing'} vs ${right ?? 'missing'}`)
    }
  }
  if (productReadiness) {
    const productSummary = productReadiness.summary || {}
    for (const [label, left, right] of [
      ['h4g_records vs product readiness', readinessTotals.h4g_records, productSummary.h4g_records],
      ['progression_groups vs product readiness', readinessTotals.progression_groups, productSummary.progression_groups],
      ['complete_triplets vs product readiness', readinessTotals.complete_triplets, productSummary.complete_triplets]
    ]) {
      if (Number(left || 0) !== Number(right || 0)) {
        warnings.push(`${label} differs: ${left ?? 'missing'} vs ${right ?? 'missing'}`)
      }
    }
    if (productReadinessWorklist) {
      if (Number(productReadinessWorklist.summary?.total_work_items || 0) !== Number(productSummary.progression_groups || 0)) {
        warnings.push(`product readiness worklist total_work_items differs from product readiness progression_groups: ${productReadinessWorklist.summary?.total_work_items ?? 'missing'} vs ${productSummary.progression_groups ?? 'missing'}`)
      }
      if (Number(productReadinessWorklist.summary?.product_ready_groups || 0) !== Number(productSummary.product_ready_groups || 0)) {
        warnings.push(`product readiness worklist product_ready_groups differs from product readiness: ${productReadinessWorklist.summary?.product_ready_groups ?? 'missing'} vs ${productSummary.product_ready_groups ?? 'missing'}`)
      }
    }
  }
}

function rootCausesForSubject(stats, anchorStats, anchorItemReviewStats, downstreamManualStats) {
  const causes = []
  const evidence = stats.by_evidence_granularity || {}
  const reviewStatus = stats.by_review_status || {}
  if ((stats.exact_core_identical_triplets || 0) > 0) causes.push('complete_h4g_triplets_share_source_standard_text')
  if ((stats.unit_level_evidence_records || 0) < (stats.h4g_records || 0)) causes.push('unit_level_evidence_gap')
  if ((stats.usable_grade_focus_records || 0) < (stats.h4g_records || 0)) causes.push('grade_specific_focus_gap')
  if ((stats.incomplete_groups || 0) > 0) causes.push('incomplete_h4g_grade_assignment_groups')
  if ((evidence.none || 0) > 0 || (reviewStatus.needs_grade_differentiation_low_confidence || 0) > 0) {
    causes.push('low_confidence_or_no_evidence_gap')
  }
  if ((anchorStats?.pending_group_decisions || 0) > 0) causes.push('anchor_group_decision_pending')
  if ((anchorItemReviewStats?.item_review_action_work_items || 0) > 0) {
    causes.push('anchor_group_item_review_downstream_queue_open')
  }
  if ((downstreamManualStats?.manual_confirmation_items || 0) > 0) {
    causes.push('anchor_group_downstream_manual_confirmation_queue_open')
  }
  return causes
}

function nextActionForSubject(stats, causes, anchorStats, anchorItemReviewStats, downstreamManualStats) {
  if (!stats.h4g_records) return 'no_h4g_records'
  if (stats.final_ready_records === stats.h4g_records) return 'ready_for_publication_gate'
  if ((anchorStats?.pending_group_decisions || 0) > 0) return 'complete_anchor_group_decisions_before_item_review'
  if ((downstreamManualStats?.manual_confirmation_items || 0) > 0) {
    return 'complete_anchor_group_downstream_manual_confirmation'
  }
  if ((anchorItemReviewStats?.item_review_action_work_items || 0) > 0) {
    return 'complete_anchor_group_item_review_downstream_batches'
  }
  if ((stats.unit_level_evidence_records || 0) > 0) return 'expand_existing_unit_evidence_pipeline'
  if (causes.includes('incomplete_h4g_grade_assignment_groups')) return 'repair_or_confirm_single_partial_grade_assignment'
  if (causes.includes('low_confidence_or_no_evidence_gap')) return 'source_coverage_or_low_confidence_evidence_gap'
  return 'build_unit_chapter_evidence_from_file_level_sources'
}

function subjectIssueRows(readiness, anchorBySubject, anchorItemReviewBySubject, downstreamManualBySubject) {
  return Object.values(readiness?.subjects || {})
    .map(stats => {
      const subjectSlug = stats.subject_slug
      const anchorStats = anchorBySubject[subjectSlug] || zeroAnchorSubjectStats(subjectSlug)
      const anchorItemReviewStats = anchorItemReviewBySubject[subjectSlug] || zeroAnchorItemReviewSubjectStats(subjectSlug)
      const downstreamManualStats = downstreamManualBySubject[subjectSlug] || zeroDownstreamManualSubjectStats(subjectSlug)
      const causes = rootCausesForSubject(stats, anchorStats, anchorItemReviewStats, downstreamManualStats)
      const nextAction = nextActionForSubject(stats, causes, anchorStats, anchorItemReviewStats, downstreamManualStats)
      return {
        anchor_group_decisions: anchorStats.priority_groups,
        anchor_item_review_queues: anchorItemReviewStats.by_work_queue,
        anchor_item_review_work_items: anchorItemReviewStats.item_review_action_work_items,
        anchor_items: anchorStats.total_items,
        complete_triplets: stats.complete_triplets || 0,
        exact_core_identical_triplets: stats.exact_core_identical_triplets || 0,
        final_ready_records: stats.final_ready_records || 0,
        final_ready_record_rate: pct(stats.final_ready_records || 0, stats.h4g_records || 0),
        h4g_records: stats.h4g_records || 0,
        incomplete_groups: stats.incomplete_groups || 0,
        downstream_manual_confirmation_items: downstreamManualStats.manual_confirmation_items,
        downstream_manual_confirmation_lanes: downstreamManualStats.by_manual_confirmation_lane,
        missing_grade_focus_records: Math.max(0, (stats.h4g_records || 0) - (stats.usable_grade_focus_records || 0)),
        missing_unit_level_evidence_records: Math.max(0, (stats.h4g_records || 0) - (stats.unit_level_evidence_records || 0)),
        next_action: nextAction,
        next_action_priority: ROUTE_PRIORITY[nextAction] || 80,
        pending_anchor_group_decisions: anchorStats.pending_group_decisions,
        root_causes: causes,
        subject: stats.subject || subjectSlug,
        subject_slug: subjectSlug,
        unit_level_evidence_records: stats.unit_level_evidence_records || 0,
        usable_grade_focus_records: stats.usable_grade_focus_records || 0
      }
    })
    .sort((a, b) => {
      const priority = a.next_action_priority - b.next_action_priority
      if (priority) return priority
      const missing = b.missing_unit_level_evidence_records - a.missing_unit_level_evidence_records
      if (missing) return missing
      return a.subject_slug.localeCompare(b.subject_slug)
    })
}

function summarizeIssues(subjectRows) {
  const summary = {
    by_next_action: {},
    by_root_cause: {},
    h4g_records_requiring_grade_focus: 0,
    h4g_records_requiring_unit_evidence: 0,
    subjects: subjectRows.length,
    subjects_with_anchor_group_gate: 0,
    subjects_with_anchor_item_review_queue: 0,
    subjects_with_downstream_manual_confirmation_queue: 0,
    subjects_with_incomplete_grade_assignment: 0,
    subjects_with_zero_unit_evidence: 0
  }
  for (const row of subjectRows) {
    countInto(summary.by_next_action, row.next_action)
    for (const cause of row.root_causes) countInto(summary.by_root_cause, cause)
    summary.h4g_records_requiring_grade_focus += row.missing_grade_focus_records
    summary.h4g_records_requiring_unit_evidence += row.missing_unit_level_evidence_records
    if (row.pending_anchor_group_decisions > 0) summary.subjects_with_anchor_group_gate += 1
    if (row.anchor_item_review_work_items > 0) summary.subjects_with_anchor_item_review_queue += 1
    if (row.downstream_manual_confirmation_items > 0) {
      summary.subjects_with_downstream_manual_confirmation_queue += 1
    }
    if (row.incomplete_groups > 0) summary.subjects_with_incomplete_grade_assignment += 1
    if (row.unit_level_evidence_records === 0 && row.h4g_records > 0) summary.subjects_with_zero_unit_evidence += 1
  }
  return summary
}

function addCountMap(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    countInto(target, key, Number(value || 0))
  }
}

function downstreamConfirmationCandidateSummary(anchorDownstreamManualConfirmationWorklist, anchorDownstreamTargetGapDecisionsCandidate, anchorDownstreamTargetGapDecisionsCandidateAudit, anchorDownstreamTargetGapParentDecisionsCandidate, anchorDownstreamTargetGapParentDecisionsCandidateAudit, anchorDownstreamManualScopeDecisionsCandidate, anchorDownstreamManualScopeDecisionsCandidateAudit, anchorDownstreamManualScopeParentDecisionsCandidate, anchorDownstreamManualScopeParentDecisionsCandidateAudit) {
  const targetGapActionCandidates = Number(anchorDownstreamTargetGapDecisionsCandidateAudit?.summary?.inventory_candidate_decisions || anchorDownstreamTargetGapDecisionsCandidate?.summary?.inventory_candidate_decisions || 0)
  const targetGapParentCandidates = Number(anchorDownstreamTargetGapParentDecisionsCandidateAudit?.summary?.parent_candidate_decisions || anchorDownstreamTargetGapParentDecisionsCandidate?.summary?.parent_candidate_decisions || 0)
  const manualScopeActionCandidates = Number(anchorDownstreamManualScopeDecisionsCandidateAudit?.summary?.candidate_decisions || anchorDownstreamManualScopeDecisionsCandidate?.summary?.candidate_decisions || 0)
  const manualScopeParentCandidates = Number(anchorDownstreamManualScopeParentDecisionsCandidateAudit?.summary?.candidate_decisions || anchorDownstreamManualScopeParentDecisionsCandidate?.summary?.candidate_decisions || 0)
  const byTargetGradeBand = {}
  addCountMap(byTargetGradeBand, anchorDownstreamTargetGapDecisionsCandidateAudit?.summary?.by_candidate_target_grade_band)
  addCountMap(byTargetGradeBand, anchorDownstreamManualScopeDecisionsCandidateAudit?.summary?.by_target_grade_band)
  const auditedActionCandidateItems = targetGapActionCandidates + manualScopeActionCandidates
  const manualConfirmationItems = Number(anchorDownstreamManualConfirmationWorklist?.summary?.manual_confirmation_items || 0)
  return {
    audited_action_candidate_items: auditedActionCandidateItems,
    audited_parent_candidate_items: targetGapParentCandidates + manualScopeParentCandidates,
    by_candidate_lane: {
      priority_target_gap_confirmation_lane: targetGapActionCandidates,
      same_grade_unit_scope_confirmation_lane: manualScopeActionCandidates
    },
    by_target_grade_band: byTargetGradeBand,
    manual_confirmation_items_total: manualConfirmationItems,
    manual_scope_action_candidate_decisions: manualScopeActionCandidates,
    manual_scope_expected_candidate_decisions: Number(anchorDownstreamManualScopeDecisionsCandidateAudit?.summary?.expected_candidate_decisions || 0),
    manual_scope_parent_candidate_decisions: manualScopeParentCandidates,
    manual_scope_target_standard_codes: anchorDownstreamManualScopeDecisionsCandidateAudit?.summary?.by_target_standard_code || {},
    remaining_manual_confirmation_items_after_candidate_lanes: Math.max(0, manualConfirmationItems - auditedActionCandidateItems),
    target_gap_action_candidate_decisions: targetGapActionCandidates,
    target_gap_expected_candidate_decisions: Number(anchorDownstreamTargetGapDecisionsCandidateAudit?.summary?.expected_inventory_candidate_decisions || 0),
    target_gap_parent_candidate_decisions: targetGapParentCandidates
  }
}

function downstreamSourceAnchorEvidenceSummary(anchorDownstreamManualConfirmationWorklist, anchorDownstreamSourceAnchorEvidenceBatch, anchorDownstreamSourceAnchorEvidenceBatchAudit, anchorDownstreamSourceAnchorEvidenceInventory, anchorDownstreamSourceAnchorEvidenceInventoryAudit) {
  const inventorySummary = anchorDownstreamSourceAnchorEvidenceInventory?.summary || {}
  const inventoryAuditSummary = anchorDownstreamSourceAnchorEvidenceInventoryAudit?.summary || {}
  const batchSummary = anchorDownstreamSourceAnchorEvidenceBatch?.summary || {}
  const batchAuditSummary = anchorDownstreamSourceAnchorEvidenceBatchAudit?.summary || {}
  const manualConfirmationSourceAnchorItems = Number(anchorDownstreamManualConfirmationWorklist?.summary?.by_source_downstream_action_batch?.source_anchor_evidence || 0)
  return {
    batch_items: Number(batchAuditSummary.source_anchor_evidence_items || batchSummary.source_anchor_evidence_items || 0),
    by_anchor_type: inventorySummary.by_anchor_type || batchSummary.by_anchor_type || {},
    by_grade_band: inventorySummary.by_grade_band || batchSummary.by_grade_band || {},
    by_primary_review_bucket: inventorySummary.by_primary_review_bucket || inventoryAuditSummary.by_primary_review_bucket || {},
    by_recommended_disposition: inventorySummary.by_recommended_disposition || inventoryAuditSummary.by_recommended_disposition || {},
    by_source_batch: inventorySummary.by_source_batch || batchSummary.by_source_batch || {},
    by_subject: inventorySummary.by_subject || batchSummary.by_subject || {},
    generic_or_deny_term_rows: Number(inventoryAuditSummary.generic_or_deny_term_rows || inventorySummary.generic_or_deny_term_rows || 0),
    high_risk_rows: Number(inventoryAuditSummary.high_risk_rows || inventorySummary.high_risk_rows || 0),
    inventory_items: Number(inventoryAuditSummary.inventory_items || inventorySummary.inventory_items || 0),
    manual_confirmation_source_anchor_items: manualConfirmationSourceAnchorItems,
    manual_review_required_rows: Number(inventorySummary.manual_review_required_rows || 0),
    source_anchor_review_rows: Number(batchAuditSummary.source_anchor_review_rows || batchSummary.source_anchor_review_rows || 0),
    unique_progression_groups: Number(inventorySummary.unique_progression_groups || batchSummary.unique_progression_groups || 0),
    unique_standard_codes: Number(inventorySummary.unique_standard_codes || batchSummary.unique_standard_codes || 0),
    unique_unit_evidence_ids: Number(inventorySummary.unique_unit_evidence_ids || batchSummary.unique_unit_evidence_ids || 0)
  }
}

function downstreamSourceAnchorReviewSummary(anchorDownstreamSourceAnchorReviewWorklist, anchorDownstreamSourceAnchorReviewWorklistAudit) {
  const worklistSummary = anchorDownstreamSourceAnchorReviewWorklist?.summary || {}
  const auditSummary = anchorDownstreamSourceAnchorReviewWorklistAudit?.summary || {}
  return {
    audited_review_work_items: Number(auditSummary.audited_review_work_items || 0),
    by_grade_band: worklistSummary.by_grade_band || auditSummary.by_grade_band || {},
    by_primary_review_bucket: worklistSummary.by_primary_review_bucket || auditSummary.by_primary_review_bucket || {},
    by_recommended_disposition: worklistSummary.by_recommended_disposition || auditSummary.by_recommended_disposition || {},
    by_review_lane: worklistSummary.by_review_lane || auditSummary.by_review_lane || {},
    by_source_batch: worklistSummary.by_source_batch || auditSummary.by_source_batch || {},
    expected_review_work_items: Number(auditSummary.expected_review_work_items || 0),
    fanout_review_rows: Number(auditSummary.fanout_review_rows || worklistSummary.fanout_review_rows || 0),
    generic_or_deny_term_review_rows: Number(auditSummary.generic_or_deny_term_review_rows || worklistSummary.generic_or_deny_term_review_rows || 0),
    high_risk_rows: Number(auditSummary.high_risk_rows || worklistSummary.high_risk_rows || 0),
    missing_review_work_items: Number(auditSummary.missing_review_work_items || 0),
    source_anchor_review_work_items: Number(auditSummary.source_anchor_review_work_items || worklistSummary.source_anchor_review_work_items || 0),
    unit_or_source_scope_review_rows: Number(auditSummary.unit_or_source_scope_review_rows || worklistSummary.unit_or_source_scope_review_rows || 0),
    unique_inventory_items: Number(auditSummary.unique_inventory_items || worklistSummary.unique_inventory_items || 0),
    unique_standard_codes: Number(auditSummary.unique_standard_codes || worklistSummary.unique_standard_codes || 0)
  }
}

function downstreamSourceAnchorPageEvidenceSummary(anchorDownstreamSourceAnchorPageEvidencePacket, anchorDownstreamSourceAnchorPageEvidencePacketAudit) {
  const packetSummary = anchorDownstreamSourceAnchorPageEvidencePacket?.summary || {}
  const auditSummary = anchorDownstreamSourceAnchorPageEvidencePacketAudit?.summary || {}
  return {
    audited_page_evidence_items: Number(auditSummary.audited_page_evidence_items || 0),
    by_grade_band: packetSummary.by_grade_band || auditSummary.by_grade_band || {},
    by_page_evidence_status: packetSummary.by_page_evidence_status || auditSummary.by_page_evidence_status || {},
    by_page_hint_confidence: packetSummary.by_page_hint_confidence || auditSummary.by_page_hint_confidence || {},
    by_page_hint_source: packetSummary.by_page_hint_source || auditSummary.by_page_hint_source || {},
    by_primary_review_bucket: packetSummary.by_primary_review_bucket || auditSummary.by_primary_review_bucket || {},
    by_review_lane: packetSummary.by_review_lane || auditSummary.by_review_lane || {},
    by_textbook_evidence_id: packetSummary.by_textbook_evidence_id || auditSummary.by_textbook_evidence_id || {},
    expected_page_evidence_items: Number(auditSummary.expected_page_evidence_items || 0),
    full_h4g_triplet_context_rows: Number(auditSummary.full_h4g_triplet_context_rows || packetSummary.full_h4g_triplet_context_rows || 0),
    missing_page_evidence_items: Number(auditSummary.missing_page_evidence_items || 0),
    page_evidence_items: Number(auditSummary.page_evidence_items || packetSummary.page_evidence_items || 0),
    ready_for_manual_review_rows: Number(auditSummary.ready_for_manual_review_rows || packetSummary.ready_for_manual_review_rows || 0),
    text_extracted_rows: Number(auditSummary.text_extracted_rows || packetSummary.text_extracted_rows || 0),
    title_search_page_hint_rows: Number(auditSummary.title_search_page_hint_rows || packetSummary.title_search_page_hint_rows || 0),
    unit_index_found_rows: Number(auditSummary.unit_index_found_rows || packetSummary.unit_index_found_rows || 0),
    unverified_printed_page_hint_rows: Number(auditSummary.unverified_printed_page_hint_rows || packetSummary.unverified_printed_page_hint_rows || 0),
    unique_progression_groups: Number(auditSummary.unique_progression_groups || packetSummary.unique_progression_groups || 0),
    unique_review_work_items: Number(auditSummary.unique_review_work_items || packetSummary.unique_review_work_items || 0),
    unique_standard_codes: Number(auditSummary.unique_standard_codes || packetSummary.unique_standard_codes || 0),
    unique_textbook_evidence_ids: Number(auditSummary.unique_textbook_evidence_ids || packetSummary.unique_textbook_evidence_ids || 0),
    unique_unit_evidence_ids: Number(auditSummary.unique_unit_evidence_ids || packetSummary.unique_unit_evidence_ids || 0)
  }
}

function downstreamSourceAnchorReviewDecisionsSummary(anchorDownstreamSourceAnchorReviewDecisions, anchorDownstreamSourceAnchorReviewDecisionsAudit) {
  const decisionsSummary = anchorDownstreamSourceAnchorReviewDecisions?.summary || {}
  const auditSummary = anchorDownstreamSourceAnchorReviewDecisionsAudit?.summary || {}
  return {
    audited_review_decisions: Number(auditSummary.audited_review_decisions || 0),
    by_decision_status: decisionsSummary.by_decision_status || auditSummary.by_decision_status || {},
    by_grade_band: decisionsSummary.by_grade_band || auditSummary.by_grade_band || {},
    by_page_evidence_status: decisionsSummary.by_page_evidence_status || auditSummary.by_page_evidence_status || {},
    by_page_hint_source: decisionsSummary.by_page_hint_source || auditSummary.by_page_hint_source || {},
    by_primary_review_bucket: decisionsSummary.by_primary_review_bucket || auditSummary.by_primary_review_bucket || {},
    by_review_lane: decisionsSummary.by_review_lane || auditSummary.by_review_lane || {},
    by_reviewer_decision: decisionsSummary.by_reviewer_decision || auditSummary.by_reviewer_decision || {},
    completed_review_decisions: Number(auditSummary.completed_review_decisions || decisionsSummary.completed_review_decisions || 0),
    downstream_source_anchor_review_decisions: Number(auditSummary.downstream_source_anchor_review_decisions || decisionsSummary.downstream_source_anchor_review_decisions || 0),
    expected_review_decisions: Number(auditSummary.expected_review_decisions || 0),
    full_h4g_triplet_context_rows: Number(auditSummary.full_h4g_triplet_context_rows || decisionsSummary.full_h4g_triplet_context_rows || 0),
    missing_review_decisions: Number(auditSummary.missing_review_decisions || 0),
    pending_review_decisions: Number(auditSummary.pending_review_decisions || decisionsSummary.pending_review_decisions || 0),
    text_extracted_rows: Number(auditSummary.text_extracted_rows || decisionsSummary.text_extracted_rows || 0),
    unique_page_evidence_items: Number(auditSummary.unique_page_evidence_items || decisionsSummary.unique_page_evidence_items || 0),
    unique_progression_groups: Number(auditSummary.unique_progression_groups || decisionsSummary.unique_progression_groups || 0),
    unique_review_work_items: Number(auditSummary.unique_review_work_items || decisionsSummary.unique_review_work_items || 0),
    unique_standard_codes: Number(auditSummary.unique_standard_codes || decisionsSummary.unique_standard_codes || 0),
    unique_unit_evidence_ids: Number(auditSummary.unique_unit_evidence_ids || decisionsSummary.unique_unit_evidence_ids || 0)
  }
}

function downstreamSourceAnchorReviewRecommendationsSummary(anchorDownstreamSourceAnchorReviewRecommendations, anchorDownstreamSourceAnchorReviewRecommendationsAudit) {
  const recommendationsSummary = anchorDownstreamSourceAnchorReviewRecommendations?.summary || {}
  const auditSummary = anchorDownstreamSourceAnchorReviewRecommendationsAudit?.summary || {}
  return {
    audited_review_recommendations: Number(auditSummary.downstream_source_anchor_review_recommendations || 0),
    by_grade_band: recommendationsSummary.by_grade_band || auditSummary.by_grade_band || {},
    by_page_evidence_status: recommendationsSummary.by_page_evidence_status || auditSummary.by_page_evidence_status || {},
    by_page_hint_source: recommendationsSummary.by_page_hint_source || auditSummary.by_page_hint_source || {},
    by_primary_review_bucket: recommendationsSummary.by_primary_review_bucket || auditSummary.by_primary_review_bucket || {},
    by_recommendation: recommendationsSummary.by_recommendation || auditSummary.by_recommendation || {},
    by_recommendation_confidence: recommendationsSummary.by_recommendation_confidence || auditSummary.by_recommendation_confidence || {},
    by_recommended_disposition: recommendationsSummary.by_recommended_disposition || auditSummary.by_recommended_disposition || {},
    by_review_lane: recommendationsSummary.by_review_lane || auditSummary.by_review_lane || {},
    downstream_source_anchor_review_recommendations: Number(auditSummary.downstream_source_anchor_review_recommendations || recommendationsSummary.downstream_source_anchor_review_recommendations || 0),
    exact_anchor_auto_approval_recommendations: Number(auditSummary.exact_anchor_auto_approval_recommendations || recommendationsSummary.exact_anchor_auto_approval_recommendations || 0),
    expected_source_anchor_review_decisions: Number(auditSummary.expected_source_anchor_review_decisions || 0),
    extra_recommendations: Number(auditSummary.extra_recommendations || 0),
    full_h4g_triplet_context_rows: Number(auditSummary.full_h4g_triplet_context_rows || recommendationsSummary.full_h4g_triplet_context_rows || 0),
    missing_recommendations: Number(auditSummary.missing_recommendations || 0),
    pending_recommendations: Number(auditSummary.pending_recommendations || recommendationsSummary.pending_recommendations || 0),
    scope_not_closed_recommendations: Number(auditSummary.scope_not_closed_recommendations || recommendationsSummary.scope_not_closed_recommendations || 0),
    text_extracted_rows: Number(auditSummary.text_extracted_rows || recommendationsSummary.text_extracted_rows || 0),
    unique_page_evidence_items: Number(recommendationsSummary.unique_page_evidence_items || 0),
    unique_review_work_items: Number(recommendationsSummary.unique_review_work_items || 0),
    unique_source_anchor_review_decisions: Number(recommendationsSummary.unique_source_anchor_review_decisions || 0),
    unique_standard_codes: Number(recommendationsSummary.unique_standard_codes || 0)
  }
}

function executionBatches(subjectRows, anchorStats, priorityStats, productReadiness, productReadinessWorklist, anchorItemReviewWorklist, anchorItemReviewDownstreamCoverage, anchorDownstreamActionWorklist, anchorDownstreamActionCoverage, anchorDownstreamActionClosureReadiness, anchorDownstreamManualConfirmationWorklist, downstreamCandidateSummary, downstreamSourceAnchorSummary, downstreamSourceAnchorReviewWorklistSummary, downstreamSourceAnchorPageEvidencePacketSummary, downstreamSourceAnchorReviewDecisionsTemplateSummary, downstreamSourceAnchorReviewRecommendationsSummary, unitCandidateCoverage, unitCandidateCoverageWorklist, unitBlockerMatchDiagnostics, unitBlockerActionWorklist, unitAnchorPolicyReviewBatch, unitAnchorPolicyReviewDecisions, unitAnchorPolicyReviewRecommendations, unitAnchorPolicyReviewActionWorklist, unitAnchorPolicySourceAnchorSpecificityBatch, unitAnchorPolicySourceAnchorSpecificityDecisions, unitAnchorPolicySourceAnchorSpecificityEvidencePacket, unitAnchorPolicySourceAnchorSpecificityGroupTriage, unitGroupReadyCandidate) {
  const bySlug = Object.fromEntries(subjectRows.map(row => [row.subject_slug, row]))
  const english = bySlug.english || {}
  const pe = bySlug.pe || {}
  const math = bySlug.math || {}
  const science = bySlug.science || {}
  const zeroEvidenceSubjects = subjectRows
    .filter(row => row.h4g_records > 0 && row.unit_level_evidence_records === 0 && row.pending_anchor_group_decisions === 0)
    .map(row => row.subject_slug)
  const partialAssignmentSubjects = subjectRows
    .filter(row => row.incomplete_groups > 0)
    .map(row => row.subject_slug)

  return [
    {
      batch_id: 'h4g_product_readiness_gate',
      entry_gate: 'npm run grade7_9:audit-h4g-product-readiness -- --strict',
      product_readiness_worklist_gate: 'npm run grade7_9:audit-h4g-product-readiness-worklist -- --strict --require-items',
      exit_gate: 'npm run grade7_9:audit-h4g-product-readiness -- --strict --require-product-ready',
      next_action: 'prove_h4g_product_display_readiness',
      scope: {
        action_required_groups: productReadinessWorklist?.summary?.work_items_requiring_action || 0,
        remediation_routes: productReadinessWorklist?.summary?.by_recommended_route || {},
        focus_distinct_groups: productReadiness?.summary?.focus_distinct_groups || 0,
        missing_or_placeholder_focus_records: productReadiness?.summary?.missing_or_placeholder_focus_records || 0,
        missing_unit_level_evidence_records: productReadiness?.summary?.missing_unit_level_evidence_records || 0,
        non_distinct_focus_groups: productReadiness?.summary?.non_distinct_focus_groups || 0,
        product_ready_groups: productReadiness?.summary?.product_ready_groups || 0,
        product_ready_records: productReadiness?.summary?.product_ready_records || 0,
        review_not_approved_records: productReadiness?.summary?.review_not_approved_records || 0,
        total_work_items: productReadinessWorklist?.summary?.total_work_items || 0
      },
      writes_public_data: false
    },
    {
      batch_id: 'english_pe_anchor_group_decision_gate',
      entry_gate: 'npm run textbooks:h4g-theme-bridge-anchor-group-decisions -- --strict --require-groups',
      triage_candidate_gate: 'npm run textbooks:h4g-theme-bridge-anchor-group-triage-decisions -- --strict --require-groups',
      item_review_worklist_gate: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-worklist -- --strict --require-items',
      item_review_downstream_coverage_gate: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-coverage -- --strict --require-complete',
      downstream_action_worklist_gate: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-worklist -- --strict --require-items',
      downstream_action_coverage_gate: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-action-coverage -- --strict --require-complete',
      downstream_action_closure_readiness_gate: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-action-closure-readiness -- --strict --require-items',
      downstream_manual_confirmation_worklist_gate: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-manual-confirmation-worklist -- --strict --require-items',
      downstream_target_gap_candidate_gate: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-target-gap-inventory-decisions-candidate -- --strict --require-items',
      downstream_target_gap_parent_candidate_gate: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-target-gap-inventory-parent-decisions-candidate -- --strict --require-items',
      downstream_manual_scope_candidate_gate: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-manual-scope-indexing-decisions-candidate -- --strict --require-items',
      downstream_manual_scope_parent_candidate_gate: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-manual-scope-indexing-parent-decisions-candidate -- --strict --require-items',
      downstream_source_anchor_evidence_batch_gate: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-source-anchor-evidence-batch -- --strict --require-items',
      downstream_source_anchor_evidence_inventory_gate: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-source-anchor-evidence-inventory -- --strict --require-items',
      downstream_source_anchor_review_worklist_gate: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-source-anchor-review-worklist -- --strict --require-items',
      downstream_source_anchor_page_evidence_packet_gate: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-source-anchor-page-evidence-packet -- --strict --require-items',
      downstream_source_anchor_review_decisions_gate: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-source-anchor-review-decisions -- --strict --require-items',
      downstream_source_anchor_review_recommendations_gate: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-item-review-downstream-source-anchor-review-recommendations -- --strict --require-items',
      exit_gate: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-triage-decisions -- --strict --require-groups --require-complete',
      next_action: 'complete_anchor_group_downstream_manual_confirmation',
      pending_groups: (anchorStats.english?.pending_group_decisions || 0) + (anchorStats.pe?.pending_group_decisions || 0),
      priority_groups: priorityStats.priority_groups,
      scope: {
        downstream_action_coverage_rows: anchorDownstreamActionCoverage?.summary?.actual_review_rows || 0,
        downstream_action_work_items: anchorDownstreamActionWorklist?.summary?.downstream_action_work_items || 0,
        downstream_action_queues: anchorDownstreamActionWorklist?.summary?.by_work_queue || {},
        downstream_actual_review_rows: anchorItemReviewDownstreamCoverage?.summary?.actual_review_rows || 0,
        downstream_close_ready_items: anchorDownstreamActionClosureReadiness?.summary?.close_ready_items || 0,
        downstream_covered_parent_work_items: anchorItemReviewDownstreamCoverage?.summary?.covered_parent_work_items || 0,
        downstream_expected_parent_work_items: anchorItemReviewDownstreamCoverage?.summary?.expected_parent_work_items || 0,
        english_records: english.h4g_records || 0,
        item_review_action_work_items: anchorItemReviewWorklist?.summary?.item_review_action_work_items || 0,
        item_review_queues: anchorItemReviewWorklist?.summary?.by_work_queue || {},
        manual_confirmation_candidate_lanes: downstreamCandidateSummary?.by_candidate_lane || {},
        manual_confirmation_candidate_items: downstreamCandidateSummary?.audited_action_candidate_items || 0,
        manual_confirmation_items: anchorDownstreamManualConfirmationWorklist?.summary?.manual_confirmation_items || 0,
        manual_confirmation_lanes: anchorDownstreamManualConfirmationWorklist?.summary?.by_manual_confirmation_lane || {},
        remaining_manual_confirmation_items_after_candidate_lanes: downstreamCandidateSummary?.remaining_manual_confirmation_items_after_candidate_lanes || 0,
        pe_records: pe.h4g_records || 0,
        priority_matrix_items: priorityStats.total_anchor_review_items,
        source_anchor_evidence_buckets: downstreamSourceAnchorSummary?.by_primary_review_bucket || {},
        source_anchor_evidence_high_risk_rows: downstreamSourceAnchorSummary?.high_risk_rows || 0,
        source_anchor_evidence_items: downstreamSourceAnchorSummary?.inventory_items || 0,
        source_anchor_review_work_items: downstreamSourceAnchorReviewWorklistSummary?.source_anchor_review_work_items || 0,
        source_anchor_review_worklist_lanes: downstreamSourceAnchorReviewWorklistSummary?.by_review_lane || {},
        source_anchor_page_evidence_items: downstreamSourceAnchorPageEvidencePacketSummary?.page_evidence_items || 0,
        source_anchor_page_evidence_statuses: downstreamSourceAnchorPageEvidencePacketSummary?.by_page_evidence_status || {},
        source_anchor_page_hint_sources: downstreamSourceAnchorPageEvidencePacketSummary?.by_page_hint_source || {},
        source_anchor_review_decisions: downstreamSourceAnchorReviewDecisionsTemplateSummary?.downstream_source_anchor_review_decisions || 0,
        source_anchor_review_pending_decisions: downstreamSourceAnchorReviewDecisionsTemplateSummary?.pending_review_decisions || 0,
        source_anchor_review_completed_decisions: downstreamSourceAnchorReviewDecisionsTemplateSummary?.completed_review_decisions || 0,
        source_anchor_review_recommendations: downstreamSourceAnchorReviewRecommendationsSummary?.downstream_source_anchor_review_recommendations || 0,
        source_anchor_review_scope_not_closed_recommendations: downstreamSourceAnchorReviewRecommendationsSummary?.scope_not_closed_recommendations || 0,
        source_anchor_review_pending_exact_anchor_recommendations: downstreamSourceAnchorReviewRecommendationsSummary?.pending_recommendations || 0,
        source_anchor_review_exact_anchor_auto_approvals: downstreamSourceAnchorReviewRecommendationsSummary?.exact_anchor_auto_approval_recommendations || 0
      },
      writes_public_data: false
    },
    {
      batch_id: 'math_science_unit_evidence_completion',
      entry_gate: 'npm run textbooks:plan-h4g-unit-worklist -- --subjects math,science --discover-candidates --strict',
      coverage_gate: 'npm run textbooks:audit-h4g-unit-candidate-coverage -- --subjects math,science --strict --require-candidates',
      blocker_diagnostics_gate: 'npm run textbooks:audit-h4g-unit-blocker-match-diagnostics -- --subjects math,science --strict --require-rows',
      action_worklist_gate: 'npm run textbooks:audit-h4g-unit-blocker-action-worklist -- --subjects math,science --strict --require-items',
      anchor_policy_review_gate: 'npm run textbooks:audit-h4g-unit-anchor-policy-review-batch -- --subjects math,science --strict --require-items',
      anchor_policy_decisions_gate: 'npm run textbooks:audit-h4g-unit-anchor-policy-review-decisions -- --strict --require-items',
      anchor_policy_recommendations_gate: 'npm run textbooks:audit-h4g-unit-anchor-policy-review-recommendations -- --strict --require-items',
      anchor_policy_action_worklist_gate: 'npm run textbooks:audit-h4g-unit-anchor-policy-review-action-worklist -- --strict --require-items',
      anchor_policy_source_anchor_specificity_gate: 'npm run textbooks:audit-h4g-unit-anchor-policy-source-anchor-specificity-batch -- --strict --require-items',
      anchor_policy_source_anchor_specificity_decisions_gate: 'npm run textbooks:audit-h4g-unit-anchor-policy-source-anchor-specificity-decisions -- --strict --require-items',
      anchor_policy_source_anchor_specificity_evidence_packet_gate: 'npm run textbooks:audit-h4g-unit-anchor-policy-source-anchor-specificity-evidence-packet -- --strict --require-items',
      anchor_policy_source_anchor_specificity_group_triage_gate: 'npm run textbooks:audit-h4g-unit-anchor-policy-source-anchor-specificity-group-triage -- --strict --require-items',
      group_ready_candidate_gate: 'npm run textbooks:audit-h4g-unit-group-ready-candidate -- --strict --require-candidates',
      remediation_worklist_gate: 'npm run textbooks:h4g-unit-candidate-coverage-worklist -- --strict',
      exit_gate: 'npm run textbooks:audit-h4g-unit-consistency -- --strict --require-candidates',
      next_action: 'expand_existing_unit_evidence_pipeline',
      scope: {
        candidate_files_read: unitCandidateCoverage?.summary?.candidate_files_read || 0,
        group_ready_candidate_groups: unitGroupReadyCandidate?.summary?.candidate_groups || 0,
        group_ready_candidate_records: unitGroupReadyCandidate?.summary?.candidates || 0,
        group_ready_candidate_unit_evidence_objects: unitGroupReadyCandidate?.summary?.unit_evidence_objects || 0,
        group_ready_skipped_already_public_standards: unitGroupReadyCandidate?.summary?.skipped_already_public_unit_level_standards || 0,
        anchor_policy_review_items: unitAnchorPolicyReviewBatch?.summary?.anchor_policy_review_items || 0,
        anchor_policy_review_candidate_matches: unitAnchorPolicyReviewBatch?.summary?.candidate_matches || 0,
        anchor_policy_review_parent_work_items: unitAnchorPolicyReviewBatch?.summary?.parent_action_work_items || 0,
        anchor_policy_pending_decisions: unitAnchorPolicyReviewDecisions?.summary?.pending_decisions || 0,
        anchor_policy_completed_decisions: unitAnchorPolicyReviewDecisions?.summary?.completed_decisions || 0,
        anchor_policy_recommendations: unitAnchorPolicyReviewRecommendations?.summary?.anchor_policy_review_recommendations || 0,
        anchor_policy_manual_rebuild_recommendations: unitAnchorPolicyReviewRecommendations?.summary?.manual_rebuild_recommendations || 0,
        anchor_policy_source_specificity_recommendations: unitAnchorPolicyReviewRecommendations?.summary?.source_anchor_specificity_review_recommendations || 0,
        anchor_policy_noneligible_alignment_only_recommendations: unitAnchorPolicyReviewRecommendations?.summary?.noneligible_alignment_only_recommendations || 0,
        anchor_policy_action_work_items: unitAnchorPolicyReviewActionWorklist?.summary?.action_work_items || 0,
        anchor_policy_candidate_rebuild_work_items: unitAnchorPolicyReviewActionWorklist?.summary?.manual_candidate_rebuild_work_items || 0,
        anchor_policy_source_specificity_work_items: unitAnchorPolicyReviewActionWorklist?.summary?.source_anchor_specificity_work_items || 0,
        anchor_policy_page_gap_work_items: unitAnchorPolicyReviewActionWorklist?.summary?.page_gap_work_items || 0,
        anchor_policy_worklist_queues: unitAnchorPolicyReviewActionWorklist?.summary?.by_work_queue || {},
        anchor_policy_source_anchor_specificity_rows: unitAnchorPolicySourceAnchorSpecificityBatch?.summary?.source_anchor_specificity_review_items || 0,
        anchor_policy_source_anchor_specificity_parent_work_items: unitAnchorPolicySourceAnchorSpecificityBatch?.summary?.parent_work_items || 0,
        anchor_policy_source_anchor_specificity_candidate_matches: unitAnchorPolicySourceAnchorSpecificityBatch?.summary?.unique_candidate_matches || 0,
        anchor_policy_source_anchor_specificity_source_files: unitAnchorPolicySourceAnchorSpecificityBatch?.summary?.source_files || 0,
        anchor_policy_source_anchor_specificity_decisions: unitAnchorPolicySourceAnchorSpecificityDecisions?.summary?.source_anchor_specificity_decisions || 0,
        anchor_policy_source_anchor_specificity_pending_decisions: unitAnchorPolicySourceAnchorSpecificityDecisions?.summary?.pending_decisions || 0,
        anchor_policy_source_anchor_specificity_completed_decisions: unitAnchorPolicySourceAnchorSpecificityDecisions?.summary?.completed_decisions || 0,
        anchor_policy_source_anchor_specificity_evidence_groups: unitAnchorPolicySourceAnchorSpecificityEvidencePacket?.summary?.evidence_packet_items || 0,
        anchor_policy_source_anchor_specificity_evidence_decision_rows: unitAnchorPolicySourceAnchorSpecificityEvidencePacket?.summary?.decision_rows_in_packet || 0,
        anchor_policy_source_anchor_specificity_evidence_standard_context_rows: unitAnchorPolicySourceAnchorSpecificityEvidencePacket?.summary?.standard_context_rows || 0,
        anchor_policy_source_anchor_specificity_triage_groups: unitAnchorPolicySourceAnchorSpecificityGroupTriage?.summary?.group_triage_items || 0,
        anchor_policy_source_anchor_specificity_ready_groups: unitAnchorPolicySourceAnchorSpecificityGroupTriage?.summary?.ready_for_manual_review_groups || 0,
        anchor_policy_source_anchor_specificity_anchor_grade_gap_groups: unitAnchorPolicySourceAnchorSpecificityGroupTriage?.summary?.anchor_grade_gap_groups || 0,
        anchor_policy_source_anchor_specificity_partial_context_gap_groups: unitAnchorPolicySourceAnchorSpecificityGroupTriage?.summary?.partial_or_context_gap_groups || 0,
        blocker_action_work_items: unitBlockerActionWorklist?.summary?.action_work_items || 0,
        blocker_action_worklist_routes: unitBlockerActionWorklist?.summary?.by_primary_diagnostic_route || {},
        blocker_match_diagnostic_rows: unitBlockerMatchDiagnostics?.summary?.blocker_rows || 0,
        blocker_match_diagnostic_routes: unitBlockerMatchDiagnostics?.summary?.by_diagnostic_route || {},
        math_missing_unit_records: math.missing_unit_level_evidence_records || 0,
        non_public_candidate_standard_rows_with_clean_units: unitCandidateCoverage?.summary?.non_public_candidate_standard_rows_with_clean_units || 0,
        non_public_candidate_standard_rows_with_multi_edition_clean_units: unitCandidateCoverage?.summary?.non_public_candidate_standard_rows_with_multi_edition_clean_units || 0,
        remediation_work_items: unitCandidateCoverageWorklist?.summary?.coverage_remediation_work_items || 0,
        progression_groups_ready_for_decision: unitCandidateCoverage?.summary?.progression_groups_ready_for_decision || 0,
        science_missing_unit_records: science.missing_unit_level_evidence_records || 0
      },
      writes_public_data: false
    },
    {
      batch_id: 'single_or_partial_grade_assignment_repair',
      entry_gate: 'npm run grade7_9:audit-h4g-grade-differentiation -- --data-root public/data',
      exit_gate: 'npm run grade7_9:audit-h4g-grade-differentiation -- --data-root <candidate-root>',
      next_action: 'repair_or_confirm_single_partial_grade_assignment',
      scope: {
        affected_subjects: partialAssignmentSubjects,
        incomplete_groups: subjectRows.reduce((sum, row) => sum + row.incomplete_groups, 0)
      },
      writes_public_data: false
    },
    {
      batch_id: 'zero_unit_evidence_source_indexing',
      entry_gate: 'npm run textbooks:plan-h4g-unit-worklist -- --discover-candidates --strict',
      exit_gate: 'npm run textbooks:audit-h4g-unit-candidates -- --strict --require-candidates',
      next_action: 'build_unit_chapter_evidence_from_file_level_sources',
      scope: {
        affected_subjects: zeroEvidenceSubjects
      },
      writes_public_data: false
    }
  ]
}

function subjectMarkdownRows(rows) {
  return rows.map(row => (
    `| ${markdownCell(row.subject_slug)} | ${row.h4g_records} | ${row.exact_core_identical_triplets}/${row.complete_triplets} | ${row.unit_level_evidence_records} | ${row.usable_grade_focus_records} | ${row.final_ready_records} | ${row.pending_anchor_group_decisions} | ${row.anchor_item_review_work_items} | ${row.downstream_manual_confirmation_items} | ${markdownCell(row.next_action)} |`
  )).join('\n') || '| - | 0 | 0/0 | 0 | 0 | 0 | 0 | 0 | 0 | - |'
}

function batchMarkdownRows(rows) {
  return rows.map(row => (
    `| ${markdownCell(row.batch_id)} | ${markdownCell(row.next_action)} | ${row.writes_public_data} | ${markdownCell(row.downstream_manual_confirmation_worklist_gate || row.downstream_action_closure_readiness_gate || row.downstream_action_coverage_gate || row.downstream_action_worklist_gate || row.item_review_downstream_coverage_gate || row.item_review_worklist_gate || row.product_readiness_worklist_gate || row.anchor_policy_source_anchor_specificity_group_triage_gate || row.anchor_policy_source_anchor_specificity_evidence_packet_gate || row.anchor_policy_source_anchor_specificity_decisions_gate || row.group_ready_candidate_gate || row.anchor_policy_source_anchor_specificity_gate || row.anchor_policy_action_worklist_gate || row.anchor_policy_recommendations_gate || row.anchor_policy_decisions_gate || row.anchor_policy_review_gate || row.action_worklist_gate || row.blocker_diagnostics_gate || row.remediation_worklist_gate || row.coverage_gate || row.entry_gate)} | ${markdownCell(row.exit_gate)} |`
  )).join('\n') || '| - | - | false | - | - |'
}

function candidateGateMarkdownRows(rows) {
  const gateSpecs = [
    ['downstream_target_gap_candidate_gate', 'target-gap action candidate'],
    ['downstream_target_gap_parent_candidate_gate', 'target-gap parent candidate'],
    ['downstream_manual_scope_candidate_gate', 'manual-scope action candidate'],
    ['downstream_manual_scope_parent_candidate_gate', 'manual-scope parent candidate'],
    ['downstream_source_anchor_evidence_batch_gate', 'source-anchor evidence batch'],
    ['downstream_source_anchor_evidence_inventory_gate', 'source-anchor evidence inventory'],
    ['downstream_source_anchor_review_worklist_gate', 'source-anchor review worklist'],
    ['downstream_source_anchor_page_evidence_packet_gate', 'source-anchor page evidence packet'],
    ['downstream_source_anchor_review_decisions_gate', 'source-anchor review decisions'],
    ['downstream_source_anchor_review_recommendations_gate', 'source-anchor review recommendations']
  ]
  const lines = []
  for (const row of rows || []) {
    for (const [key, label] of gateSpecs) {
      if (row[key]) lines.push(`| ${markdownCell(row.batch_id)} | ${markdownCell(label)} | ${markdownCell(row[key])} |`)
    }
  }
  return lines.join('\n') || '| - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Differentiation Issue Matrix

Generated at: ${payload.generated_at}

This is a read-only execution matrix for the H4G7/H4G8/H4G9 differentiation
effort. It diagnoses which layer is blocking real grade differentiation. It
does not write \`public/data\`, change official standard text, approve bridges,
or enable matcher use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| h4g records | ${payload.public_readiness_totals.h4g_records} |
| progression groups | ${payload.public_readiness_totals.progression_groups} |
| complete triplets | ${payload.public_readiness_totals.complete_triplets} |
| exact identical triplets | ${payload.public_readiness_totals.exact_core_identical_triplets} |
| unit-level evidence records | ${payload.public_readiness_totals.unit_level_evidence_records} |
| final-ready records | ${payload.public_readiness_totals.final_ready_records} |
| product-ready records | ${payload.product_readiness_summary?.product_ready_records || 0} |
| product-ready groups | ${payload.product_readiness_summary?.product_ready_groups || 0} |
| product focus-distinct groups | ${payload.product_readiness_summary?.focus_distinct_groups || 0} |
| product non-distinct complete groups | ${payload.product_readiness_summary?.non_distinct_focus_groups || 0} |
| product remediation work items | ${payload.product_readiness_worklist_summary?.total_work_items || 0} |
| product remediation action-required groups | ${payload.product_readiness_worklist_summary?.work_items_requiring_action || 0} |
| anchor priority groups | ${payload.anchor_priority_stats.priority_groups} |
| anchor review items | ${payload.anchor_priority_stats.total_anchor_review_items} |
| anchor item-review action work items | ${payload.anchor_group_item_review_worklist_summary?.item_review_action_work_items || 0} |
| anchor item-review downstream review rows | ${payload.anchor_group_item_review_downstream_coverage_summary?.actual_review_rows || 0} |
| anchor downstream action work items | ${payload.anchor_group_downstream_action_worklist_summary?.downstream_action_work_items || 0} |
| anchor downstream manual confirmation items | ${payload.anchor_group_downstream_manual_confirmation_worklist_summary?.manual_confirmation_items || 0} |
| anchor downstream audited confirmation candidate items | ${payload.anchor_group_downstream_confirmation_candidate_summary?.audited_action_candidate_items || 0} |
| anchor downstream remaining manual items after candidate lanes | ${payload.anchor_group_downstream_confirmation_candidate_summary?.remaining_manual_confirmation_items_after_candidate_lanes || 0} |
| anchor downstream source-anchor evidence items | ${payload.anchor_group_downstream_source_anchor_evidence_summary?.inventory_items || 0} |
| anchor downstream source-anchor high-risk rows | ${payload.anchor_group_downstream_source_anchor_evidence_summary?.high_risk_rows || 0} |
| anchor downstream source-anchor review work items | ${payload.anchor_group_downstream_source_anchor_review_worklist_summary?.source_anchor_review_work_items || 0} |
| anchor downstream source-anchor page evidence items | ${payload.anchor_group_downstream_source_anchor_page_evidence_packet_summary?.page_evidence_items || 0} |
| anchor downstream source-anchor pending review decisions | ${payload.anchor_group_downstream_source_anchor_review_decisions_summary?.pending_review_decisions || 0} |
| anchor downstream source-anchor review recommendations | ${payload.anchor_group_downstream_source_anchor_review_recommendations_summary?.downstream_source_anchor_review_recommendations || 0} |
| anchor downstream source-anchor scope-not-closed recommendations | ${payload.anchor_group_downstream_source_anchor_review_recommendations_summary?.scope_not_closed_recommendations || 0} |
| anchor downstream close-ready items | ${payload.anchor_group_downstream_action_closure_readiness_summary?.close_ready_items || 0} |
| unit blocker diagnostic rows | ${payload.unit_blocker_match_diagnostics_summary?.blocker_rows || 0} |
| unit blocker action work items | ${payload.unit_blocker_action_worklist_summary?.action_work_items || 0} |
| unit anchor policy review items | ${payload.unit_anchor_policy_review_batch_summary?.anchor_policy_review_items || 0} |
| unit anchor policy pending decisions | ${payload.unit_anchor_policy_review_decisions_summary?.pending_decisions || 0} |
| unit anchor policy recommendations | ${payload.unit_anchor_policy_review_recommendations_summary?.anchor_policy_review_recommendations || 0} |
| unit anchor policy action work items | ${payload.unit_anchor_policy_review_action_worklist_summary?.action_work_items || 0} |
| unit anchor policy source-anchor specificity rows | ${payload.unit_anchor_policy_source_anchor_specificity_batch_summary?.source_anchor_specificity_review_items || 0} |
| unit anchor policy source-anchor pending decisions | ${payload.unit_anchor_policy_source_anchor_specificity_decisions_summary?.pending_decisions || 0} |
| unit anchor policy source-anchor completed decisions | ${payload.unit_anchor_policy_source_anchor_specificity_decisions_summary?.completed_decisions || 0} |
| unit anchor policy source-anchor evidence groups | ${payload.unit_anchor_policy_source_anchor_specificity_evidence_packet_summary?.evidence_packet_items || 0} |
| unit anchor policy source-anchor ready groups | ${payload.unit_anchor_policy_source_anchor_specificity_group_triage_summary?.ready_for_manual_review_groups || 0} |
| unit anchor policy source-anchor anchor-gap groups | ${payload.unit_anchor_policy_source_anchor_specificity_group_triage_summary?.anchor_grade_gap_groups || 0} |
| unit anchor policy source-anchor partial/context-gap groups | ${payload.unit_anchor_policy_source_anchor_specificity_group_triage_summary?.partial_or_context_gap_groups || 0} |
| unit group-ready candidate records | ${payload.unit_group_ready_candidate_summary?.candidates || 0} |

## Next Actions

| next action | subjects |
| --- | ---: |
${countRows(payload.issue_summary.by_next_action)}

## Root Causes

| root cause | subjects |
| --- | ---: |
${countRows(payload.issue_summary.by_root_cause)}

## Product Readiness Record Gate

| blocker | count |
| --- | ---: |
${countRows(payload.product_readiness_summary?.by_record_blocker || {})}

## Product Readiness Group Gate

| blocker | count |
| --- | ---: |
${countRows(payload.product_readiness_summary?.by_group_blocker || {})}

## Product Readiness Worklist

| route | groups |
| --- | ---: |
${countRows(payload.product_readiness_worklist_summary?.by_recommended_route || {})}

## Anchor Group Item Review Queues

| queue | work items |
| --- | ---: |
${countRows(payload.anchor_group_item_review_worklist_summary?.by_work_queue || {})}

## Anchor Group Item Review Downstream Coverage

| field | value |
| --- | ---: |
| expected parent work items | ${payload.anchor_group_item_review_downstream_coverage_summary?.expected_parent_work_items || 0} |
| covered parent work items | ${payload.anchor_group_item_review_downstream_coverage_summary?.covered_parent_work_items || 0} |
| missing parent work items | ${payload.anchor_group_item_review_downstream_coverage_summary?.missing_parent_work_items || 0} |
| expected review rows | ${payload.anchor_group_item_review_downstream_coverage_summary?.expected_review_rows || 0} |
| actual review rows | ${payload.anchor_group_item_review_downstream_coverage_summary?.actual_review_rows || 0} |

## Anchor Group Downstream Action Queues

| queue | work items |
| --- | ---: |
${countRows(payload.anchor_group_downstream_action_worklist_summary?.by_work_queue || {})}

## Anchor Group Downstream Action Coverage

| field | value |
| --- | ---: |
| expected parent work items | ${payload.anchor_group_downstream_action_coverage_summary?.expected_parent_work_items || 0} |
| covered parent work items | ${payload.anchor_group_downstream_action_coverage_summary?.covered_parent_work_items || 0} |
| missing parent work items | ${payload.anchor_group_downstream_action_coverage_summary?.missing_parent_work_items || 0} |
| expected review rows | ${payload.anchor_group_downstream_action_coverage_summary?.expected_review_rows || 0} |
| actual review rows | ${payload.anchor_group_downstream_action_coverage_summary?.actual_review_rows || 0} |

## Anchor Group Downstream Manual Confirmation

| lane | work items |
| --- | ---: |
${countRows(payload.anchor_group_downstream_manual_confirmation_worklist_summary?.by_manual_confirmation_lane || {})}

| field | value |
| --- | ---: |
| manual confirmation items | ${payload.anchor_group_downstream_manual_confirmation_worklist_summary?.manual_confirmation_items || 0} |
| close-ready items | ${payload.anchor_group_downstream_manual_confirmation_worklist_summary?.close_ready_items || 0} |
| auto-close allowed items | ${payload.anchor_group_downstream_manual_confirmation_worklist_summary?.auto_close_allowed_items || 0} |
| remaining manual evidence review items | ${payload.anchor_group_downstream_action_closure_readiness_summary?.remaining_manual_evidence_review_items || 0} |

## Anchor Group Downstream Confirmation Candidates

| lane | audited candidate items |
| --- | ---: |
${countRows(payload.anchor_group_downstream_confirmation_candidate_summary?.by_candidate_lane || {})}

| field | value |
| --- | ---: |
| target-gap action candidate decisions | ${payload.anchor_group_downstream_confirmation_candidate_summary?.target_gap_action_candidate_decisions || 0} |
| target-gap parent candidate decisions | ${payload.anchor_group_downstream_confirmation_candidate_summary?.target_gap_parent_candidate_decisions || 0} |
| manual-scope action candidate decisions | ${payload.anchor_group_downstream_confirmation_candidate_summary?.manual_scope_action_candidate_decisions || 0} |
| manual-scope parent candidate decisions | ${payload.anchor_group_downstream_confirmation_candidate_summary?.manual_scope_parent_candidate_decisions || 0} |
| audited action candidate items | ${payload.anchor_group_downstream_confirmation_candidate_summary?.audited_action_candidate_items || 0} |
| audited parent candidate items | ${payload.anchor_group_downstream_confirmation_candidate_summary?.audited_parent_candidate_items || 0} |
| remaining manual confirmation items after candidate lanes | ${payload.anchor_group_downstream_confirmation_candidate_summary?.remaining_manual_confirmation_items_after_candidate_lanes || 0} |

| target grade band | audited candidate items |
| --- | ---: |
${countRows(payload.anchor_group_downstream_confirmation_candidate_summary?.by_target_grade_band || {})}

## Anchor Group Downstream Source-Anchor Evidence

| review bucket | work items |
| --- | ---: |
${countRows(payload.anchor_group_downstream_source_anchor_evidence_summary?.by_primary_review_bucket || {})}

| recommended disposition | work items |
| --- | ---: |
${countRows(payload.anchor_group_downstream_source_anchor_evidence_summary?.by_recommended_disposition || {})}

| field | value |
| --- | ---: |
| manual confirmation source-anchor items | ${payload.anchor_group_downstream_source_anchor_evidence_summary?.manual_confirmation_source_anchor_items || 0} |
| inventory items | ${payload.anchor_group_downstream_source_anchor_evidence_summary?.inventory_items || 0} |
| batch items | ${payload.anchor_group_downstream_source_anchor_evidence_summary?.batch_items || 0} |
| source-anchor review rows | ${payload.anchor_group_downstream_source_anchor_evidence_summary?.source_anchor_review_rows || 0} |
| high-risk rows | ${payload.anchor_group_downstream_source_anchor_evidence_summary?.high_risk_rows || 0} |
| generic or deny-term rows | ${payload.anchor_group_downstream_source_anchor_evidence_summary?.generic_or_deny_term_rows || 0} |
| unique progression groups | ${payload.anchor_group_downstream_source_anchor_evidence_summary?.unique_progression_groups || 0} |
| unique standard codes | ${payload.anchor_group_downstream_source_anchor_evidence_summary?.unique_standard_codes || 0} |

| grade band | work items |
| --- | ---: |
${countRows(payload.anchor_group_downstream_source_anchor_evidence_summary?.by_grade_band || {})}

## Anchor Group Downstream Source-Anchor Review Worklist

| review lane | work items |
| --- | ---: |
${countRows(payload.anchor_group_downstream_source_anchor_review_worklist_summary?.by_review_lane || {})}

| field | value |
| --- | ---: |
| source-anchor review work items | ${payload.anchor_group_downstream_source_anchor_review_worklist_summary?.source_anchor_review_work_items || 0} |
| audited review work items | ${payload.anchor_group_downstream_source_anchor_review_worklist_summary?.audited_review_work_items || 0} |
| expected review work items | ${payload.anchor_group_downstream_source_anchor_review_worklist_summary?.expected_review_work_items || 0} |
| missing review work items | ${payload.anchor_group_downstream_source_anchor_review_worklist_summary?.missing_review_work_items || 0} |
| unit/source scope review rows | ${payload.anchor_group_downstream_source_anchor_review_worklist_summary?.unit_or_source_scope_review_rows || 0} |
| generic or deny-term review rows | ${payload.anchor_group_downstream_source_anchor_review_worklist_summary?.generic_or_deny_term_review_rows || 0} |
| fanout review rows | ${payload.anchor_group_downstream_source_anchor_review_worklist_summary?.fanout_review_rows || 0} |
| unique standard codes | ${payload.anchor_group_downstream_source_anchor_review_worklist_summary?.unique_standard_codes || 0} |

## Anchor Group Downstream Source-Anchor Page Evidence Packet

| evidence status | rows |
| --- | ---: |
${countRows(payload.anchor_group_downstream_source_anchor_page_evidence_packet_summary?.by_page_evidence_status || {})}

| page hint source | rows |
| --- | ---: |
${countRows(payload.anchor_group_downstream_source_anchor_page_evidence_packet_summary?.by_page_hint_source || {})}

| field | value |
| --- | ---: |
| page evidence items | ${payload.anchor_group_downstream_source_anchor_page_evidence_packet_summary?.page_evidence_items || 0} |
| audited page evidence items | ${payload.anchor_group_downstream_source_anchor_page_evidence_packet_summary?.audited_page_evidence_items || 0} |
| expected page evidence items | ${payload.anchor_group_downstream_source_anchor_page_evidence_packet_summary?.expected_page_evidence_items || 0} |
| missing page evidence items | ${payload.anchor_group_downstream_source_anchor_page_evidence_packet_summary?.missing_page_evidence_items || 0} |
| text extracted rows | ${payload.anchor_group_downstream_source_anchor_page_evidence_packet_summary?.text_extracted_rows || 0} |
| ready for manual review rows | ${payload.anchor_group_downstream_source_anchor_page_evidence_packet_summary?.ready_for_manual_review_rows || 0} |
| unit index found rows | ${payload.anchor_group_downstream_source_anchor_page_evidence_packet_summary?.unit_index_found_rows || 0} |
| title-search page hint rows | ${payload.anchor_group_downstream_source_anchor_page_evidence_packet_summary?.title_search_page_hint_rows || 0} |
| unverified printed-page hint rows | ${payload.anchor_group_downstream_source_anchor_page_evidence_packet_summary?.unverified_printed_page_hint_rows || 0} |
| full H4G triplet context rows | ${payload.anchor_group_downstream_source_anchor_page_evidence_packet_summary?.full_h4g_triplet_context_rows || 0} |
| unique textbook ids | ${payload.anchor_group_downstream_source_anchor_page_evidence_packet_summary?.unique_textbook_evidence_ids || 0} |

## Anchor Group Downstream Source-Anchor Review Decisions

| reviewer decision | rows |
| --- | ---: |
${countRows(payload.anchor_group_downstream_source_anchor_review_decisions_summary?.by_reviewer_decision || {})}

| field | value |
| --- | ---: |
| review decisions | ${payload.anchor_group_downstream_source_anchor_review_decisions_summary?.downstream_source_anchor_review_decisions || 0} |
| audited review decisions | ${payload.anchor_group_downstream_source_anchor_review_decisions_summary?.audited_review_decisions || 0} |
| expected review decisions | ${payload.anchor_group_downstream_source_anchor_review_decisions_summary?.expected_review_decisions || 0} |
| missing review decisions | ${payload.anchor_group_downstream_source_anchor_review_decisions_summary?.missing_review_decisions || 0} |
| pending review decisions | ${payload.anchor_group_downstream_source_anchor_review_decisions_summary?.pending_review_decisions || 0} |
| completed review decisions | ${payload.anchor_group_downstream_source_anchor_review_decisions_summary?.completed_review_decisions || 0} |
| text extracted rows | ${payload.anchor_group_downstream_source_anchor_review_decisions_summary?.text_extracted_rows || 0} |
| full H4G triplet context rows | ${payload.anchor_group_downstream_source_anchor_review_decisions_summary?.full_h4g_triplet_context_rows || 0} |
| unique page evidence items | ${payload.anchor_group_downstream_source_anchor_review_decisions_summary?.unique_page_evidence_items || 0} |
| unique standard codes | ${payload.anchor_group_downstream_source_anchor_review_decisions_summary?.unique_standard_codes || 0} |

## Anchor Group Downstream Source-Anchor Review Recommendations

| recommendation | rows |
| --- | ---: |
${countRows(payload.anchor_group_downstream_source_anchor_review_recommendations_summary?.by_recommendation || {})}

| field | value |
| --- | ---: |
| review recommendations | ${payload.anchor_group_downstream_source_anchor_review_recommendations_summary?.downstream_source_anchor_review_recommendations || 0} |
| audited review recommendations | ${payload.anchor_group_downstream_source_anchor_review_recommendations_summary?.audited_review_recommendations || 0} |
| expected review decisions | ${payload.anchor_group_downstream_source_anchor_review_recommendations_summary?.expected_source_anchor_review_decisions || 0} |
| missing recommendations | ${payload.anchor_group_downstream_source_anchor_review_recommendations_summary?.missing_recommendations || 0} |
| extra recommendations | ${payload.anchor_group_downstream_source_anchor_review_recommendations_summary?.extra_recommendations || 0} |
| scope-not-closed recommendations | ${payload.anchor_group_downstream_source_anchor_review_recommendations_summary?.scope_not_closed_recommendations || 0} |
| pending exact-anchor recommendations | ${payload.anchor_group_downstream_source_anchor_review_recommendations_summary?.pending_recommendations || 0} |
| exact-anchor auto approvals | ${payload.anchor_group_downstream_source_anchor_review_recommendations_summary?.exact_anchor_auto_approval_recommendations || 0} |
| text extracted rows | ${payload.anchor_group_downstream_source_anchor_review_recommendations_summary?.text_extracted_rows || 0} |
| full H4G triplet context rows | ${payload.anchor_group_downstream_source_anchor_review_recommendations_summary?.full_h4g_triplet_context_rows || 0} |
| unique standard codes | ${payload.anchor_group_downstream_source_anchor_review_recommendations_summary?.unique_standard_codes || 0} |

## Unit Evidence Blocker Routes

| route | rows |
| --- | ---: |
${countRows(payload.unit_blocker_match_diagnostics_summary?.by_diagnostic_route || {})}

## Unit Evidence Action Routes

| route | work items |
| --- | ---: |
${countRows(payload.unit_blocker_action_worklist_summary?.by_primary_diagnostic_route || {})}

## Unit Anchor Policy Review

| field | value |
| --- | ---: |
| review items | ${payload.unit_anchor_policy_review_batch_summary?.anchor_policy_review_items || 0} |
| candidate matches | ${payload.unit_anchor_policy_review_batch_summary?.candidate_matches || 0} |
| parent work items | ${payload.unit_anchor_policy_review_batch_summary?.parent_action_work_items || 0} |
| pending decisions | ${payload.unit_anchor_policy_review_decisions_summary?.pending_decisions || 0} |
| completed decisions | ${payload.unit_anchor_policy_review_decisions_summary?.completed_decisions || 0} |
| recommendations | ${payload.unit_anchor_policy_review_recommendations_summary?.anchor_policy_review_recommendations || 0} |
| manual rebuild recommendations | ${payload.unit_anchor_policy_review_recommendations_summary?.manual_rebuild_recommendations || 0} |
| source anchor specificity recommendations | ${payload.unit_anchor_policy_review_recommendations_summary?.source_anchor_specificity_review_recommendations || 0} |
| noneligible alignment only recommendations | ${payload.unit_anchor_policy_review_recommendations_summary?.noneligible_alignment_only_recommendations || 0} |
| action work items | ${payload.unit_anchor_policy_review_action_worklist_summary?.action_work_items || 0} |
| candidate rebuild work items | ${payload.unit_anchor_policy_review_action_worklist_summary?.manual_candidate_rebuild_work_items || 0} |
| source anchor specificity work items | ${payload.unit_anchor_policy_review_action_worklist_summary?.source_anchor_specificity_work_items || 0} |
| page gap work items | ${payload.unit_anchor_policy_review_action_worklist_summary?.page_gap_work_items || 0} |
| source-anchor specificity rows | ${payload.unit_anchor_policy_source_anchor_specificity_batch_summary?.source_anchor_specificity_review_items || 0} |
| source-anchor parent work items | ${payload.unit_anchor_policy_source_anchor_specificity_batch_summary?.parent_work_items || 0} |
| source-anchor candidate matches | ${payload.unit_anchor_policy_source_anchor_specificity_batch_summary?.unique_candidate_matches || 0} |
| source-anchor source files | ${payload.unit_anchor_policy_source_anchor_specificity_batch_summary?.source_files || 0} |
| source-anchor specificity decisions | ${payload.unit_anchor_policy_source_anchor_specificity_decisions_summary?.source_anchor_specificity_decisions || 0} |
| source-anchor pending decisions | ${payload.unit_anchor_policy_source_anchor_specificity_decisions_summary?.pending_decisions || 0} |
| source-anchor completed decisions | ${payload.unit_anchor_policy_source_anchor_specificity_decisions_summary?.completed_decisions || 0} |
| source-anchor evidence groups | ${payload.unit_anchor_policy_source_anchor_specificity_evidence_packet_summary?.evidence_packet_items || 0} |
| source-anchor evidence decision rows | ${payload.unit_anchor_policy_source_anchor_specificity_evidence_packet_summary?.decision_rows_in_packet || 0} |
| source-anchor standard context rows | ${payload.unit_anchor_policy_source_anchor_specificity_evidence_packet_summary?.standard_context_rows || 0} |
| source-anchor triage groups | ${payload.unit_anchor_policy_source_anchor_specificity_group_triage_summary?.group_triage_items || 0} |
| source-anchor ready groups | ${payload.unit_anchor_policy_source_anchor_specificity_group_triage_summary?.ready_for_manual_review_groups || 0} |
| source-anchor anchor grade gap groups | ${payload.unit_anchor_policy_source_anchor_specificity_group_triage_summary?.anchor_grade_gap_groups || 0} |
| source-anchor partial/context gap groups | ${payload.unit_anchor_policy_source_anchor_specificity_group_triage_summary?.partial_or_context_gap_groups || 0} |

## Unit Anchor Policy Action Queues

| queue | work items |
| --- | ---: |
${countRows(payload.unit_anchor_policy_review_action_worklist_summary?.by_work_queue || {})}

## Unit Anchor Policy Source-Anchor Specificity

| page range status | rows |
| --- | ---: |
${countRows(payload.unit_anchor_policy_source_anchor_specificity_batch_summary?.by_page_range_status || {})}

## Unit Anchor Policy Source-Anchor Decisions

| reviewer outcome | rows |
| --- | ---: |
${countRows(payload.unit_anchor_policy_source_anchor_specificity_decisions_summary?.by_reviewer_outcome || {})}

## Unit Anchor Policy Source-Anchor Evidence Packet

| subject | groups |
| --- | ---: |
${countRows(payload.unit_anchor_policy_source_anchor_specificity_evidence_packet_summary?.by_subject || {})}

## Unit Anchor Policy Source-Anchor Group Triage

| route | groups |
| --- | ---: |
${countRows(payload.unit_anchor_policy_source_anchor_specificity_group_triage_summary?.by_triage_route || {})}

## Unit Group-Ready Candidate

| field | value |
| --- | ---: |
| candidate groups | ${payload.unit_group_ready_candidate_summary?.candidate_groups || 0} |
| candidate records | ${payload.unit_group_ready_candidate_summary?.candidates || 0} |
| skipped already-public standards | ${payload.unit_group_ready_candidate_summary?.skipped_already_public_unit_level_standards || 0} |
| unit evidence objects | ${payload.unit_group_ready_candidate_summary?.unit_evidence_objects || 0} |

## Subject Matrix

| subject | H4G records | identical triplets | unit evidence | usable focus | final ready | pending anchor groups | anchor item work items | manual confirmation items | next action |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${subjectMarkdownRows(payload.subject_issue_matrix)}

## Execution Batches

| batch | next action | writes public data | quality gate | exit gate |
| --- | --- | ---: | --- | --- |
${batchMarkdownRows(payload.execution_batches)}

## Execution Candidate And Evidence Gates

| batch | candidate/evidence gate | command |
| --- | --- | --- |
${candidateGateMarkdownRows(payload.execution_batches)}

## Guardrails

- Keep official source standard fields immutable.
- Treat identical H4G triplets as shared 7-9 source standards until reviewed unit evidence proves a grade-specific focus.
- Use audited English/PE anchor group triage decisions before item-level source review or matcher use.
- Use unit candidate coverage to distinguish already-public evidence, single-edition candidates, and missing candidate gaps before any Math/Science publication attempt.
- Use publication gates only after reviewed unit evidence, same-grade scope, cross-version consistency, and no-public-write dry-run checks pass.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}

## Warnings

${payload.warnings.length ? payload.warnings.map(warning => `- ${markdownCell(warning)}`).join('\n') : '- none'}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const warnings = []
  const readiness = requireInput(args.readiness, 'readiness audit', errors)
  const distinctiveness = requireInput(args.distinctiveness, 'distinctiveness audit', errors)
  const productReadiness = optionalInput(args.productReadiness, 'product readiness audit', warnings)
  const productReadinessWorklist = optionalInput(args.productReadinessWorklist, 'product readiness worklist', warnings)
  const anchorDecisions = requireInput(args.anchorGroupDecisions, 'anchor group decisions', errors)
  const priorityMatrix = requireInput(args.anchorPriorityMatrix, 'anchor priority matrix', errors)
  const anchorItemReviewWorklist = optionalInput(args.anchorGroupItemReviewWorklist, 'anchor group item review worklist', warnings)
  const anchorItemReviewDownstreamCoverage = optionalInput(args.anchorGroupItemReviewDownstreamCoverage, 'anchor group item review downstream coverage', warnings)
  const anchorDownstreamActionWorklist = optionalInput(args.anchorGroupDownstreamActionWorklist, 'anchor downstream action worklist', warnings)
  const anchorDownstreamActionCoverage = optionalInput(args.anchorGroupDownstreamActionCoverage, 'anchor downstream action coverage', warnings)
  const anchorDownstreamActionClosureReadiness = optionalInput(args.anchorGroupDownstreamActionClosureReadiness, 'anchor downstream action closure readiness', warnings)
  const anchorDownstreamManualConfirmationWorklist = optionalInput(args.anchorGroupDownstreamManualConfirmationWorklist, 'anchor downstream manual confirmation worklist', warnings)
  const anchorDownstreamTargetGapDecisionsCandidate = optionalInput(args.anchorGroupDownstreamTargetGapDecisionsCandidate, 'anchor downstream target-gap decisions candidate', warnings)
  const anchorDownstreamTargetGapDecisionsCandidateAudit = optionalInput(args.anchorGroupDownstreamTargetGapDecisionsCandidateAudit, 'anchor downstream target-gap decisions candidate audit', warnings)
  const anchorDownstreamTargetGapParentDecisionsCandidate = optionalInput(args.anchorGroupDownstreamTargetGapParentDecisionsCandidate, 'anchor downstream target-gap parent decisions candidate', warnings)
  const anchorDownstreamTargetGapParentDecisionsCandidateAudit = optionalInput(args.anchorGroupDownstreamTargetGapParentDecisionsCandidateAudit, 'anchor downstream target-gap parent decisions candidate audit', warnings)
  const anchorDownstreamManualScopeDecisionsCandidate = optionalInput(args.anchorGroupDownstreamManualScopeDecisionsCandidate, 'anchor downstream manual-scope decisions candidate', warnings)
  const anchorDownstreamManualScopeDecisionsCandidateAudit = optionalInput(args.anchorGroupDownstreamManualScopeDecisionsCandidateAudit, 'anchor downstream manual-scope decisions candidate audit', warnings)
  const anchorDownstreamManualScopeParentDecisionsCandidate = optionalInput(args.anchorGroupDownstreamManualScopeParentDecisionsCandidate, 'anchor downstream manual-scope parent decisions candidate', warnings)
  const anchorDownstreamManualScopeParentDecisionsCandidateAudit = optionalInput(args.anchorGroupDownstreamManualScopeParentDecisionsCandidateAudit, 'anchor downstream manual-scope parent decisions candidate audit', warnings)
  const anchorDownstreamSourceAnchorEvidenceBatch = optionalInput(args.anchorGroupDownstreamSourceAnchorEvidenceBatch, 'anchor downstream source-anchor evidence batch', warnings)
  const anchorDownstreamSourceAnchorEvidenceBatchAudit = optionalInput(args.anchorGroupDownstreamSourceAnchorEvidenceBatchAudit, 'anchor downstream source-anchor evidence batch audit', warnings)
  const anchorDownstreamSourceAnchorEvidenceInventory = optionalInput(args.anchorGroupDownstreamSourceAnchorEvidenceInventory, 'anchor downstream source-anchor evidence inventory', warnings)
  const anchorDownstreamSourceAnchorEvidenceInventoryAudit = optionalInput(args.anchorGroupDownstreamSourceAnchorEvidenceInventoryAudit, 'anchor downstream source-anchor evidence inventory audit', warnings)
  const anchorDownstreamSourceAnchorReviewWorklist = optionalInput(args.anchorGroupDownstreamSourceAnchorReviewWorklist, 'anchor downstream source-anchor review worklist', warnings)
  const anchorDownstreamSourceAnchorReviewWorklistAudit = optionalInput(args.anchorGroupDownstreamSourceAnchorReviewWorklistAudit, 'anchor downstream source-anchor review worklist audit', warnings)
  const anchorDownstreamSourceAnchorPageEvidencePacket = optionalInput(args.anchorGroupDownstreamSourceAnchorPageEvidencePacket, 'anchor downstream source-anchor page evidence packet', warnings)
  const anchorDownstreamSourceAnchorPageEvidencePacketAudit = optionalInput(args.anchorGroupDownstreamSourceAnchorPageEvidencePacketAudit, 'anchor downstream source-anchor page evidence packet audit', warnings)
  const anchorDownstreamSourceAnchorReviewDecisions = optionalInput(args.anchorGroupDownstreamSourceAnchorReviewDecisions, 'anchor downstream source-anchor review decisions', warnings)
  const anchorDownstreamSourceAnchorReviewDecisionsAudit = optionalInput(args.anchorGroupDownstreamSourceAnchorReviewDecisionsAudit, 'anchor downstream source-anchor review decisions audit', warnings)
  const anchorDownstreamSourceAnchorReviewRecommendations = optionalInput(args.anchorGroupDownstreamSourceAnchorReviewRecommendations, 'anchor downstream source-anchor review recommendations', warnings)
  const anchorDownstreamSourceAnchorReviewRecommendationsAudit = optionalInput(args.anchorGroupDownstreamSourceAnchorReviewRecommendationsAudit, 'anchor downstream source-anchor review recommendations audit', warnings)
  const unitCandidateCoverage = optionalInput(args.unitCandidateCoverage, 'unit candidate coverage audit', warnings)
  const unitCandidateCoverageWorklist = optionalInput(args.unitCandidateCoverageWorklist, 'unit candidate coverage worklist', warnings)
  const unitBlockerMatchDiagnostics = optionalInput(args.unitBlockerMatchDiagnostics, 'unit blocker match diagnostics', warnings)
  const unitBlockerActionWorklist = optionalInput(args.unitBlockerActionWorklist, 'unit blocker action worklist', warnings)
  const unitAnchorPolicyReviewBatch = optionalInput(args.unitAnchorPolicyReviewBatch, 'unit anchor policy review batch', warnings)
  const unitAnchorPolicyReviewDecisions = optionalInput(args.unitAnchorPolicyReviewDecisions, 'unit anchor policy review decisions', warnings)
  const unitAnchorPolicyReviewRecommendations = optionalInput(args.unitAnchorPolicyReviewRecommendations, 'unit anchor policy review recommendations', warnings)
  const unitAnchorPolicyReviewActionWorklist = optionalInput(args.unitAnchorPolicyReviewActionWorklist, 'unit anchor policy review action worklist', warnings)
  const unitAnchorPolicySourceAnchorSpecificityBatch = optionalInput(args.unitAnchorPolicySourceAnchorSpecificityBatch, 'unit anchor policy source-anchor specificity batch', warnings)
  const unitAnchorPolicySourceAnchorSpecificityDecisions = optionalInput(args.unitAnchorPolicySourceAnchorSpecificityDecisions, 'unit anchor policy source-anchor specificity decisions', warnings)
  const unitAnchorPolicySourceAnchorSpecificityEvidencePacket = optionalInput(args.unitAnchorPolicySourceAnchorSpecificityEvidencePacket, 'unit anchor policy source-anchor specificity evidence packet', warnings)
  const unitAnchorPolicySourceAnchorSpecificityGroupTriage = optionalInput(args.unitAnchorPolicySourceAnchorSpecificityGroupTriage, 'unit anchor policy source-anchor specificity group triage', warnings)
  const unitGroupReadyCandidate = optionalInput(args.unitGroupReadyCandidate, 'unit group-ready candidate', warnings)

  if (!errors.length) {
    validateInputs(readiness, distinctiveness, productReadiness, productReadinessWorklist, anchorDecisions, priorityMatrix, anchorItemReviewWorklist, anchorItemReviewDownstreamCoverage, anchorDownstreamActionWorklist, anchorDownstreamActionCoverage, anchorDownstreamActionClosureReadiness, anchorDownstreamManualConfirmationWorklist, anchorDownstreamTargetGapDecisionsCandidate, anchorDownstreamTargetGapDecisionsCandidateAudit, anchorDownstreamTargetGapParentDecisionsCandidate, anchorDownstreamTargetGapParentDecisionsCandidateAudit, anchorDownstreamManualScopeDecisionsCandidate, anchorDownstreamManualScopeDecisionsCandidateAudit, anchorDownstreamManualScopeParentDecisionsCandidate, anchorDownstreamManualScopeParentDecisionsCandidateAudit, anchorDownstreamSourceAnchorEvidenceBatch, anchorDownstreamSourceAnchorEvidenceBatchAudit, anchorDownstreamSourceAnchorEvidenceInventory, anchorDownstreamSourceAnchorEvidenceInventoryAudit, anchorDownstreamSourceAnchorReviewWorklist, anchorDownstreamSourceAnchorReviewWorklistAudit, anchorDownstreamSourceAnchorPageEvidencePacket, anchorDownstreamSourceAnchorPageEvidencePacketAudit, anchorDownstreamSourceAnchorReviewDecisions, anchorDownstreamSourceAnchorReviewDecisionsAudit, anchorDownstreamSourceAnchorReviewRecommendations, anchorDownstreamSourceAnchorReviewRecommendationsAudit, unitCandidateCoverage, unitCandidateCoverageWorklist, unitBlockerMatchDiagnostics, unitBlockerActionWorklist, unitAnchorPolicyReviewBatch, unitAnchorPolicyReviewDecisions, unitAnchorPolicyReviewRecommendations, unitAnchorPolicyReviewActionWorklist, unitAnchorPolicySourceAnchorSpecificityBatch, unitAnchorPolicySourceAnchorSpecificityDecisions, unitAnchorPolicySourceAnchorSpecificityEvidencePacket, unitAnchorPolicySourceAnchorSpecificityGroupTriage, unitGroupReadyCandidate, errors, warnings)
  }

  const anchorBySubject = anchorSubjectStats(anchorDecisions)
  const anchorItemReviewBySubject = anchorItemReviewSubjectStats(anchorItemReviewWorklist)
  const downstreamManualBySubject = downstreamManualSubjectStats(anchorDownstreamManualConfirmationWorklist)
  const subjectRows = readiness ? subjectIssueRows(readiness, anchorBySubject, anchorItemReviewBySubject, downstreamManualBySubject) : []
  const priorityStats = priorityGroupStats(priorityMatrix)
  const downstreamCandidateSummary = downstreamConfirmationCandidateSummary(anchorDownstreamManualConfirmationWorklist, anchorDownstreamTargetGapDecisionsCandidate, anchorDownstreamTargetGapDecisionsCandidateAudit, anchorDownstreamTargetGapParentDecisionsCandidate, anchorDownstreamTargetGapParentDecisionsCandidateAudit, anchorDownstreamManualScopeDecisionsCandidate, anchorDownstreamManualScopeDecisionsCandidateAudit, anchorDownstreamManualScopeParentDecisionsCandidate, anchorDownstreamManualScopeParentDecisionsCandidateAudit)
  const downstreamSourceAnchorSummary = downstreamSourceAnchorEvidenceSummary(anchorDownstreamManualConfirmationWorklist, anchorDownstreamSourceAnchorEvidenceBatch, anchorDownstreamSourceAnchorEvidenceBatchAudit, anchorDownstreamSourceAnchorEvidenceInventory, anchorDownstreamSourceAnchorEvidenceInventoryAudit)
  const downstreamSourceAnchorReviewWorklistSummary = downstreamSourceAnchorReviewSummary(anchorDownstreamSourceAnchorReviewWorklist, anchorDownstreamSourceAnchorReviewWorklistAudit)
  const downstreamSourceAnchorPageEvidencePacketSummary = downstreamSourceAnchorPageEvidenceSummary(anchorDownstreamSourceAnchorPageEvidencePacket, anchorDownstreamSourceAnchorPageEvidencePacketAudit)
  const downstreamSourceAnchorReviewDecisionsTemplateSummary = downstreamSourceAnchorReviewDecisionsSummary(anchorDownstreamSourceAnchorReviewDecisions, anchorDownstreamSourceAnchorReviewDecisionsAudit)
  const downstreamSourceAnchorReviewRecommendationsTemplateSummary = downstreamSourceAnchorReviewRecommendationsSummary(anchorDownstreamSourceAnchorReviewRecommendations, anchorDownstreamSourceAnchorReviewRecommendationsAudit)
  const payload = {
    anchor_group_decision_summary: anchorDecisions?.summary || {},
    anchor_group_stats_by_subject: anchorBySubject,
    anchor_priority_stats: priorityStats,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    execution_batches: executionBatches(subjectRows, anchorBySubject, priorityStats, productReadiness, productReadinessWorklist, anchorItemReviewWorklist, anchorItemReviewDownstreamCoverage, anchorDownstreamActionWorklist, anchorDownstreamActionCoverage, anchorDownstreamActionClosureReadiness, anchorDownstreamManualConfirmationWorklist, downstreamCandidateSummary, downstreamSourceAnchorSummary, downstreamSourceAnchorReviewWorklistSummary, downstreamSourceAnchorPageEvidencePacketSummary, downstreamSourceAnchorReviewDecisionsTemplateSummary, downstreamSourceAnchorReviewRecommendationsTemplateSummary, unitCandidateCoverage, unitCandidateCoverageWorklist, unitBlockerMatchDiagnostics, unitBlockerActionWorklist, unitAnchorPolicyReviewBatch, unitAnchorPolicyReviewDecisions, unitAnchorPolicyReviewRecommendations, unitAnchorPolicyReviewActionWorklist, unitAnchorPolicySourceAnchorSpecificityBatch, unitAnchorPolicySourceAnchorSpecificityDecisions, unitAnchorPolicySourceAnchorSpecificityEvidencePacket, unitAnchorPolicySourceAnchorSpecificityGroupTriage, unitGroupReadyCandidate),
    generated_at: new Date().toISOString(),
    issue_summary: summarizeIssues(subjectRows),
    matcher_ready: false,
    publication_ready: false,
    public_readiness_totals: readiness?.totals || {},
    product_readiness_summary: productReadiness?.summary || null,
    product_readiness_worklist_summary: productReadinessWorklist?.summary || null,
    purpose: 'h4g_differentiation_issue_matrix',
    source_inputs: {
      anchor_group_decisions: args.anchorGroupDecisions,
      anchor_group_downstream_action_closure_readiness: args.anchorGroupDownstreamActionClosureReadiness,
      anchor_group_downstream_action_coverage: args.anchorGroupDownstreamActionCoverage,
      anchor_group_downstream_action_worklist: args.anchorGroupDownstreamActionWorklist,
      anchor_group_downstream_manual_confirmation_worklist: args.anchorGroupDownstreamManualConfirmationWorklist,
      anchor_group_downstream_manual_scope_decisions_candidate: args.anchorGroupDownstreamManualScopeDecisionsCandidate,
      anchor_group_downstream_manual_scope_decisions_candidate_audit: args.anchorGroupDownstreamManualScopeDecisionsCandidateAudit,
      anchor_group_downstream_manual_scope_parent_decisions_candidate: args.anchorGroupDownstreamManualScopeParentDecisionsCandidate,
      anchor_group_downstream_manual_scope_parent_decisions_candidate_audit: args.anchorGroupDownstreamManualScopeParentDecisionsCandidateAudit,
      anchor_group_downstream_source_anchor_evidence_batch: args.anchorGroupDownstreamSourceAnchorEvidenceBatch,
      anchor_group_downstream_source_anchor_evidence_batch_audit: args.anchorGroupDownstreamSourceAnchorEvidenceBatchAudit,
      anchor_group_downstream_source_anchor_evidence_inventory: args.anchorGroupDownstreamSourceAnchorEvidenceInventory,
      anchor_group_downstream_source_anchor_evidence_inventory_audit: args.anchorGroupDownstreamSourceAnchorEvidenceInventoryAudit,
      anchor_group_downstream_source_anchor_review_worklist: args.anchorGroupDownstreamSourceAnchorReviewWorklist,
      anchor_group_downstream_source_anchor_review_worklist_audit: args.anchorGroupDownstreamSourceAnchorReviewWorklistAudit,
      anchor_group_downstream_source_anchor_page_evidence_packet: args.anchorGroupDownstreamSourceAnchorPageEvidencePacket,
      anchor_group_downstream_source_anchor_page_evidence_packet_audit: args.anchorGroupDownstreamSourceAnchorPageEvidencePacketAudit,
      anchor_group_downstream_source_anchor_review_decisions: args.anchorGroupDownstreamSourceAnchorReviewDecisions,
      anchor_group_downstream_source_anchor_review_decisions_audit: args.anchorGroupDownstreamSourceAnchorReviewDecisionsAudit,
      anchor_group_downstream_source_anchor_review_recommendations: args.anchorGroupDownstreamSourceAnchorReviewRecommendations,
      anchor_group_downstream_source_anchor_review_recommendations_audit: args.anchorGroupDownstreamSourceAnchorReviewRecommendationsAudit,
      anchor_group_downstream_target_gap_decisions_candidate: args.anchorGroupDownstreamTargetGapDecisionsCandidate,
      anchor_group_downstream_target_gap_decisions_candidate_audit: args.anchorGroupDownstreamTargetGapDecisionsCandidateAudit,
      anchor_group_downstream_target_gap_parent_decisions_candidate: args.anchorGroupDownstreamTargetGapParentDecisionsCandidate,
      anchor_group_downstream_target_gap_parent_decisions_candidate_audit: args.anchorGroupDownstreamTargetGapParentDecisionsCandidateAudit,
      anchor_group_item_review_downstream_coverage: args.anchorGroupItemReviewDownstreamCoverage,
      anchor_group_item_review_worklist: args.anchorGroupItemReviewWorklist,
      anchor_priority_matrix: args.anchorPriorityMatrix,
      distinctiveness: args.distinctiveness,
      product_readiness: args.productReadiness,
      product_readiness_worklist: args.productReadinessWorklist,
      readiness: args.readiness,
      unit_anchor_policy_review_action_worklist: args.unitAnchorPolicyReviewActionWorklist,
      unit_anchor_policy_review_batch: args.unitAnchorPolicyReviewBatch,
      unit_anchor_policy_review_decisions: args.unitAnchorPolicyReviewDecisions,
      unit_anchor_policy_review_recommendations: args.unitAnchorPolicyReviewRecommendations,
      unit_anchor_policy_source_anchor_specificity_batch: args.unitAnchorPolicySourceAnchorSpecificityBatch,
      unit_anchor_policy_source_anchor_specificity_decisions: args.unitAnchorPolicySourceAnchorSpecificityDecisions,
      unit_anchor_policy_source_anchor_specificity_evidence_packet: args.unitAnchorPolicySourceAnchorSpecificityEvidencePacket,
      unit_anchor_policy_source_anchor_specificity_group_triage: args.unitAnchorPolicySourceAnchorSpecificityGroupTriage,
      unit_blocker_action_worklist: args.unitBlockerActionWorklist,
      unit_blocker_match_diagnostics: args.unitBlockerMatchDiagnostics,
      unit_candidate_coverage: args.unitCandidateCoverage,
      unit_candidate_coverage_worklist: args.unitCandidateCoverageWorklist,
      unit_group_ready_candidate: args.unitGroupReadyCandidate
    },
    subject_issue_matrix: subjectRows,
    target_grade_bands: TARGET_GRADE_BANDS,
    anchor_group_downstream_action_closure_readiness_summary: anchorDownstreamActionClosureReadiness?.summary || null,
    anchor_group_downstream_action_coverage_summary: anchorDownstreamActionCoverage?.summary || null,
    anchor_group_downstream_action_worklist_summary: anchorDownstreamActionWorklist?.summary || null,
    anchor_group_downstream_confirmation_candidate_summary: downstreamCandidateSummary,
    anchor_group_downstream_manual_confirmation_by_subject: downstreamManualBySubject,
    anchor_group_downstream_manual_confirmation_worklist_summary: anchorDownstreamManualConfirmationWorklist?.summary || null,
    anchor_group_downstream_manual_scope_decisions_candidate_audit_summary: anchorDownstreamManualScopeDecisionsCandidateAudit?.summary || null,
    anchor_group_downstream_manual_scope_decisions_candidate_summary: anchorDownstreamManualScopeDecisionsCandidate?.summary || null,
    anchor_group_downstream_manual_scope_parent_decisions_candidate_audit_summary: anchorDownstreamManualScopeParentDecisionsCandidateAudit?.summary || null,
    anchor_group_downstream_manual_scope_parent_decisions_candidate_summary: anchorDownstreamManualScopeParentDecisionsCandidate?.summary || null,
    anchor_group_downstream_source_anchor_evidence_batch_audit_summary: anchorDownstreamSourceAnchorEvidenceBatchAudit?.summary || null,
    anchor_group_downstream_source_anchor_evidence_batch_summary: anchorDownstreamSourceAnchorEvidenceBatch?.summary || null,
    anchor_group_downstream_source_anchor_evidence_inventory_audit_summary: anchorDownstreamSourceAnchorEvidenceInventoryAudit?.summary || null,
    anchor_group_downstream_source_anchor_evidence_inventory_summary: anchorDownstreamSourceAnchorEvidenceInventory?.summary || null,
    anchor_group_downstream_source_anchor_evidence_summary: downstreamSourceAnchorSummary,
    anchor_group_downstream_source_anchor_page_evidence_packet_audit_summary: anchorDownstreamSourceAnchorPageEvidencePacketAudit?.summary || null,
    anchor_group_downstream_source_anchor_page_evidence_packet_summary: downstreamSourceAnchorPageEvidencePacketSummary,
    anchor_group_downstream_source_anchor_review_decisions_audit_summary: anchorDownstreamSourceAnchorReviewDecisionsAudit?.summary || null,
    anchor_group_downstream_source_anchor_review_decisions_summary: downstreamSourceAnchorReviewDecisionsTemplateSummary,
    anchor_group_downstream_source_anchor_review_recommendations_audit_summary: anchorDownstreamSourceAnchorReviewRecommendationsAudit?.summary || null,
    anchor_group_downstream_source_anchor_review_recommendations_summary: downstreamSourceAnchorReviewRecommendationsTemplateSummary,
    anchor_group_downstream_source_anchor_review_worklist_audit_summary: anchorDownstreamSourceAnchorReviewWorklistAudit?.summary || null,
    anchor_group_downstream_source_anchor_review_worklist_summary: downstreamSourceAnchorReviewWorklistSummary,
    anchor_group_downstream_target_gap_decisions_candidate_audit_summary: anchorDownstreamTargetGapDecisionsCandidateAudit?.summary || null,
    anchor_group_downstream_target_gap_decisions_candidate_summary: anchorDownstreamTargetGapDecisionsCandidate?.summary || null,
    anchor_group_downstream_target_gap_parent_decisions_candidate_audit_summary: anchorDownstreamTargetGapParentDecisionsCandidateAudit?.summary || null,
    anchor_group_downstream_target_gap_parent_decisions_candidate_summary: anchorDownstreamTargetGapParentDecisionsCandidate?.summary || null,
    anchor_group_item_review_by_subject: anchorItemReviewBySubject,
    anchor_group_item_review_downstream_coverage_summary: anchorItemReviewDownstreamCoverage?.summary || null,
    anchor_group_item_review_worklist_summary: anchorItemReviewWorklist?.summary || null,
    unit_anchor_policy_review_action_worklist_summary: unitAnchorPolicyReviewActionWorklist?.summary || null,
    unit_anchor_policy_review_batch_summary: unitAnchorPolicyReviewBatch?.summary || null,
    unit_anchor_policy_review_decisions_summary: unitAnchorPolicyReviewDecisions?.summary || null,
    unit_anchor_policy_review_recommendations_summary: unitAnchorPolicyReviewRecommendations?.summary || null,
    unit_anchor_policy_source_anchor_specificity_batch_summary: unitAnchorPolicySourceAnchorSpecificityBatch?.summary || null,
    unit_anchor_policy_source_anchor_specificity_decisions_summary: unitAnchorPolicySourceAnchorSpecificityDecisions?.summary || null,
    unit_anchor_policy_source_anchor_specificity_evidence_packet_summary: unitAnchorPolicySourceAnchorSpecificityEvidencePacket?.summary || null,
    unit_anchor_policy_source_anchor_specificity_group_triage_summary: unitAnchorPolicySourceAnchorSpecificityGroupTriage?.summary || null,
    unit_blocker_action_worklist_summary: unitBlockerActionWorklist?.summary || null,
    unit_candidate_coverage_summary: unitCandidateCoverage?.summary || null,
    unit_candidate_coverage_worklist_summary: unitCandidateCoverageWorklist?.summary || null,
    unit_group_ready_candidate_summary: unitGroupReadyCandidate?.summary || null,
    unit_blocker_match_diagnostics_summary: unitBlockerMatchDiagnostics?.summary || null,
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }

  writeJson(args.out, payload)
  writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(payload, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
