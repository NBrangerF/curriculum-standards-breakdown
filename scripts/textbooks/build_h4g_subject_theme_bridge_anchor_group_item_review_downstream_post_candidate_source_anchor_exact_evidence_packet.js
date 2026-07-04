#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_REMAINING_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ANCHOR_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_SOURCE_ANCHOR_RECOMMENDATIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_evidence_packet_anchor_domain_rejected_english_pe.md'

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    remainingWorklist: DEFAULT_REMAINING_WORKLIST,
    requireItems: false,
    sourceAnchorDecisions: DEFAULT_SOURCE_ANCHOR_DECISIONS,
    sourceAnchorRecommendations: DEFAULT_SOURCE_ANCHOR_RECOMMENDATIONS,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--remaining-worklist') args.remainingWorklist = argv[++i]
    else if (item === '--source-anchor-decisions') args.sourceAnchorDecisions = argv[++i]
    else if (item === '--source-anchor-recommendations') args.sourceAnchorRecommendations = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_evidence_packet.js \\
  --strict --require-items

Builds a read-only exact-anchor evidence packet for the source-anchor rows that
remain after combined closure candidates are filtered out. It does not edit
decisions, approve anchors, write public/data, or enable matcher/publication.`)
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

function truncate(value, max = 160) {
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

function validateTopLevel(remainingWorklist, decisions, recommendations, args, errors) {
  if (remainingWorklist.valid !== true) errors.push('remaining worklist valid must be true')
  if (remainingWorklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist') {
    errors.push('remaining worklist purpose mismatch')
  }
  if (remainingWorklist.worklist_only !== true) errors.push('remaining worklist worklist_only must be true')
  if (remainingWorklist.remaining_worklist_only !== true) errors.push('remaining worklist remaining_worklist_only must be true')
  if (!Array.isArray(remainingWorklist.post_candidate_remaining_work_items)) {
    errors.push('remaining worklist post_candidate_remaining_work_items must be an array')
  }
  validatePolicy('remaining worklist', remainingWorklist, errors)

  if (decisions.valid !== true) errors.push('source-anchor decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template') {
    errors.push('source-anchor decisions purpose mismatch')
  }
  if (decisions.decision_template_only !== true) errors.push('source-anchor decisions decision_template_only must be true')
  if (decisions.editable_manual_review_template !== true) errors.push('source-anchor decisions editable_manual_review_template must be true')
  if (!Array.isArray(decisions.downstream_source_anchor_review_decisions)) {
    errors.push('source-anchor decisions downstream_source_anchor_review_decisions must be an array')
  }
  validatePolicy('source-anchor decisions', decisions, errors)

  if (recommendations.valid !== true) errors.push('source-anchor recommendations valid must be true')
  if (recommendations.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations') {
    errors.push('source-anchor recommendations purpose mismatch')
  }
  if (recommendations.recommendation_only !== true) errors.push('source-anchor recommendations recommendation_only must be true')
  if (recommendations.source_downstream_source_anchor_review_decisions !== args.sourceAnchorDecisions) {
    errors.push('source-anchor recommendations source_downstream_source_anchor_review_decisions must match arg')
  }
  if (!Array.isArray(recommendations.downstream_source_anchor_review_recommendations)) {
    errors.push('source-anchor recommendations downstream_source_anchor_review_recommendations must be an array')
  }
  validatePolicy('source-anchor recommendations', recommendations, errors)
}

function packetPolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_action_decision_must_be_edited_separately: true,
    exact_evidence_packet_is_not_reviewer_decision: true,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    publication_ready: false,
    requires_exact_anchor_manual_review: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function compactPageEvidence(context) {
  const excerpts = (context?.page_text_excerpts || []).slice(0, 2).map(excerpt => ({
    pdf_page: excerpt.pdf_page,
    printed_page_estimate: excerpt.printed_page_estimate,
    status: excerpt.status || '',
    text_chars: excerpt.text_chars || 0,
    text_excerpt_preview: truncate(excerpt.text_excerpt || '', 360)
  }))
  return {
    evidence_packet_item_id: context?.evidence_packet_item_id || '',
    page_evidence_status: context?.page_evidence_status || '',
    page_hint_confidence: context?.page_hint_confidence || '',
    page_hint_requires_review: context?.page_hint_requires_review === true,
    page_hint_source: context?.page_hint_source || '',
    page_range: context?.page_range || '',
    page_range_status: context?.page_range_status || '',
    page_text_excerpt_previews: excerpts,
    pdf_pages: context?.pdf_pages || [],
    ready_for_manual_review: context?.ready_for_manual_review === true,
    unit_index_found: context?.unit_index_found === true,
    unit_index_page_start_override: context?.unit_index_page_start_override || null
  }
}

function siblingPreviews(row) {
  return (row.sibling_work_items || []).slice(0, 5).map(item => ({
    grade_band: item.grade_band || '',
    page_range: item.page_range || '',
    primary_review_bucket: item.primary_review_bucket || '',
    review_lane: item.review_lane || '',
    source_batch: item.source_batch || '',
    standard_code: item.standard_code || '',
    unit_evidence_id: item.unit_evidence_id || '',
    unit_title: item.unit_title || '',
    work_item_id: item.work_item_id || ''
  }))
}

function buildItem(remaining, decision, recommendation, index) {
  return {
    anchor_requirement_summary: decision.anchor_requirement_summary || '',
    downstream_action_decision_id: remaining.action_decision_id || '',
    exact_activity_or_task: decision.exact_activity_or_task || '',
    exact_anchor_auto_approval: recommendation.exact_anchor_auto_approval === true,
    exact_anchor_evidence_packet_id: `h4g_anchor_group_post_candidate_source_anchor_exact_evidence_${hashText(remaining.action_decision_id)}`,
    exact_evidence_note: decision.exact_evidence_note || '',
    exact_evidence_quote: decision.exact_evidence_quote || '',
    exact_page_reference: decision.exact_page_reference || '',
    grade_band: remaining.grade_band || '',
    has_full_h4g_triplet_context: decision.has_full_h4g_triplet_context === true,
    inventory_bucket: remaining.inventory_bucket || '',
    inventory_item_id: remaining.inventory_item_id || '',
    manual_confirmation_lane: remaining.manual_confirmation_lane || '',
    page_evidence_context: compactPageEvidence(decision.page_evidence_context),
    page_evidence_packet_item_id: decision.page_evidence_packet_item_id || '',
    page_evidence_status: decision.page_evidence_status || '',
    page_hint_source: decision.page_hint_source || '',
    post_candidate_remaining_reason: remaining.post_candidate_remaining_reason || '',
    progression_group_id: remaining.progression_group_id || '',
    recommended_next_gate_after_candidate_filter: remaining.recommended_next_gate_after_candidate_filter || '',
    recommended_reviewer_decision: recommendation.recommended_reviewer_decision || '',
    recommendation_confidence: recommendation.recommendation_confidence || '',
    recommendation_requires_manual_confirmation: recommendation.recommendation_requires_manual_confirmation === true,
    remaining_worklist_rank: remaining.remaining_worklist_rank,
    review_decision_id: decision.decision_id || '',
    review_decision_status: decision.decision_status || '',
    review_grain: decision.review_grain || '',
    review_lane: decision.review_lane || '',
    reviewer_decision: decision.reviewer_decision || '',
    risk_profile: decision.risk_profile || {},
    risk_signals: decision.risk_signals || [],
    same_progression_group_grade_bands: decision.same_progression_group_grade_bands || [],
    sibling_h4g_grade_count: decision.sibling_h4g_grade_count || 0,
    sibling_work_item_previews: siblingPreviews(decision),
    source_anchor_evidence_item_id: decision.source_anchor_evidence_item_id || '',
    source_anchor_review_item_ids: decision.source_anchor_review_item_ids || [],
    source_anchor_review_recommendation_id: recommendation.source_anchor_review_recommendation_id || '',
    source_batch: remaining.source_batch || decision.source_batch || '',
    source_batch_item_id: remaining.source_batch_item_id || decision.source_batch_item_id || '',
    source_downstream_action_batch: remaining.source_downstream_action_batch || '',
    source_downstream_source_anchor_review_work_item_id: decision.source_downstream_source_anchor_review_work_item_id || '',
    source_key: remaining.source_key || '',
    source_standard_context: decision.source_standard_context || {},
    standard_code: remaining.standard_code || '',
    subject_slug: remaining.subject_slug || '',
    target_standard_code: remaining.target_standard_code || decision.target_standard_code || '',
    textbook_evidence_id: decision.textbook_evidence_id || '',
    unit_context: decision.unit_context || {},
    unit_evidence_id: remaining.unit_evidence_id || decision.unit_evidence_id || '',
    unit_title: remaining.unit_title || decision.unit_title || '',
    worklist_rank: index + 1
  }
}

function buildRows(remainingWorklist, decisions, recommendations, errors) {
  const decisionsByAction = mapBy(decisions.downstream_source_anchor_review_decisions || [], 'downstream_action_decision_id', errors, 'source-anchor decisions')
  const recommendationsByAction = mapBy(recommendations.downstream_source_anchor_review_recommendations || [], 'downstream_action_decision_id', errors, 'source-anchor recommendations')
  const sourceAnchorRows = (remainingWorklist.post_candidate_remaining_work_items || [])
    .filter(row => row.source_downstream_action_batch === 'source_anchor_evidence')
  const rows = []
  for (const remaining of sourceAnchorRows) {
    const decision = decisionsByAction.get(remaining.action_decision_id)
    const recommendation = recommendationsByAction.get(remaining.action_decision_id)
    if (!decision) errors.push(`${remaining.action_decision_id} missing source-anchor review decision`)
    if (!recommendation) errors.push(`${remaining.action_decision_id} missing source-anchor review recommendation`)
    if (!decision || !recommendation) continue
    rows.push(buildItem(remaining, decision, recommendation, rows.length))
  }
  return rows
}

function summarize(rows, remainingWorklist) {
  const summary = {
    by_grade_band: {},
    by_inventory_bucket: {},
    by_manual_confirmation_lane: {},
    by_page_evidence_status: {},
    by_page_hint_source: {},
    by_post_candidate_remaining_reason: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_review_lane: {},
    by_subject: {},
    exact_anchor_auto_approval_items: 0,
    full_h4g_triplet_context_items: 0,
    manual_confirmation_source_anchor_items: Number(remainingWorklist.summary?.source_anchor_exact_review_items || 0),
    pending_review_decisions: 0,
    ready_for_manual_review_items: 0,
    source_anchor_exact_evidence_items: rows.length,
    text_extracted_items: 0,
    unique_action_decisions: sorted(rows.map(row => row.downstream_action_decision_id)).length,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_review_decisions: sorted(rows.map(row => row.review_decision_id)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    if (row.exact_anchor_auto_approval) summary.exact_anchor_auto_approval_items += 1
    if (row.has_full_h4g_triplet_context) summary.full_h4g_triplet_context_items += 1
    if (row.review_decision_status === 'pending' && row.reviewer_decision === 'pending') summary.pending_review_decisions += 1
    if (row.page_evidence_context?.ready_for_manual_review) summary.ready_for_manual_review_items += 1
    if (row.page_evidence_status === 'text_extracted') summary.text_extracted_items += 1
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_inventory_bucket, row.inventory_bucket)
    countInto(summary.by_manual_confirmation_lane, row.manual_confirmation_lane)
    countInto(summary.by_page_evidence_status, row.page_evidence_status)
    countInto(summary.by_page_hint_source, row.page_hint_source)
    countInto(summary.by_post_candidate_remaining_reason, row.post_candidate_remaining_reason)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision)
    countInto(summary.by_recommendation_confidence, row.recommendation_confidence)
    countInto(summary.by_review_lane, row.review_lane)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 30).map(row => (
    `| ${row.worklist_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.manual_confirmation_lane)} | ${markdownCell(row.page_hint_source)} | ${markdownCell(row.standard_code)} | ${truncate(row.unit_title, 70)} |`
  )).join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Post-Candidate Source-Anchor Exact Evidence Packet

Generated at: ${payload.generated_at}

This read-only packet narrows the post-candidate remaining worklist to the
source-anchor exact review rows and attaches existing page evidence and sibling
H4G context. It is not a reviewer decision, not a bridge approval, and not a
publication gate.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| source-anchor exact evidence items | ${payload.summary.source_anchor_exact_evidence_items} |
| manual confirmation source-anchor items | ${payload.summary.manual_confirmation_source_anchor_items} |
| pending review decisions | ${payload.summary.pending_review_decisions} |
| text-extracted items | ${payload.summary.text_extracted_items} |
| ready for manual review items | ${payload.summary.ready_for_manual_review_items} |
| exact-anchor auto approvals | ${payload.summary.exact_anchor_auto_approval_items} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Remaining Lanes

| lane | rows |
| --- | ---: |
${countRows(payload.summary.by_manual_confirmation_lane)}

## Page Hint Sources

| page hint source | rows |
| --- | ---: |
${countRows(payload.summary.by_page_hint_source)}

## Grades

| grade | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Preview

| rank | subject | grade | lane | page hint source | standard | unit |
| ---: | --- | --- | --- | --- | --- | --- |
${previewRows(payload.source_anchor_exact_evidence_items)}

## Guardrails

- Packet rows are not reviewer decisions.
- Every row still requires exact-anchor manual review.
- Downstream action, matcher, and publication gates remain separate.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of Object.entries({
    remainingWorklist: args.remainingWorklist,
    sourceAnchorDecisions: args.sourceAnchorDecisions,
    sourceAnchorRecommendations: args.sourceAnchorRecommendations
  })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const remainingWorklist = existsSync(args.remainingWorklist) ? readJson(args.remainingWorklist) : { post_candidate_remaining_work_items: [] }
  const decisions = existsSync(args.sourceAnchorDecisions) ? readJson(args.sourceAnchorDecisions) : { downstream_source_anchor_review_decisions: [] }
  const recommendations = existsSync(args.sourceAnchorRecommendations) ? readJson(args.sourceAnchorRecommendations) : { downstream_source_anchor_review_recommendations: [] }
  if (!errors.length) validateTopLevel(remainingWorklist, decisions, recommendations, args, errors)
  const rows = buildRows(remainingWorklist, decisions, recommendations, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no source-anchor exact evidence rows were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    exact_evidence_packet_only: true,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    packet_policy: packetPolicy(),
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_evidence_packet',
    review_only: true,
    source_anchor_exact_evidence_items: rows,
    source_post_candidate_remaining_worklist: args.remainingWorklist,
    source_source_anchor_review_decisions: args.sourceAnchorDecisions,
    source_source_anchor_review_recommendations: args.sourceAnchorRecommendations,
    summary: summarize(rows, remainingWorklist),
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
  const payload = buildPayload(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
