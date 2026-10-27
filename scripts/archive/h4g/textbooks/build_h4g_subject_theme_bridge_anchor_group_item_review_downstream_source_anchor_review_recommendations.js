#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations_anchor_domain_rejected_english_pe.md'

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds conservative recommendation-only routes for pending source-anchor review
decisions. It does not edit the decisions template, approve anchors, write
public/data, change official standard text, or enable matcher/publication use.`)
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

function truncate(value, max = 96) {
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

function validateTopLevel(decisions, args, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template') {
    errors.push('decisions purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template')
  }
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_decisions_template')
  }
  if (decisions.decision_template_only !== true) errors.push('decisions decision_template_only must be true')
  if (decisions.editable_manual_review_template !== true) errors.push('decisions editable_manual_review_template must be true')
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'direct_matcher_use',
    'eligible_for_h4g_differentiation',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (decisions[key] !== false) errors.push(`decisions ${key} must be false`)
  }
  if (args.requireItems && !(decisions.downstream_source_anchor_review_decisions || []).length) {
    errors.push('requireItems is set but decisions has no downstream_source_anchor_review_decisions')
  }
}

function isScopeNotClosed(row) {
  return row.review_lane === 'source_anchor_unit_or_source_scope_review_lane' ||
    row.recommended_disposition === 'scope_not_closed_requires_unit_or_source_row_confirmation'
}

function recommendedReviewerDecision(row) {
  return isScopeNotClosed(row)
    ? 'source_anchor_scope_not_closed_requires_split'
    : 'pending'
}

function recommendationConfidence(row) {
  return isScopeNotClosed(row) ? 'high' : 'manual_review_required'
}

function recommendedNextGate(row) {
  return isScopeNotClosed(row)
    ? 'record_scope_not_closed_review_decision_then_rebuild_downstream_action_candidate'
    : 'manual_exact_anchor_review_decision_required'
}

function reviewerNote(row) {
  if (isScopeNotClosed(row)) {
    return 'Current source inventory keeps multiple source rows or unit scopes inside one bounded slice; recommend marking the source-anchor review as scope-not-closed before any grade-specific approval.'
  }
  if (row.review_lane === 'source_anchor_generic_or_deny_term_review_lane') {
    return 'Page text exists, but generic topic or deny-term risk still requires exact activity/page evidence before approving the missing-grade anchor.'
  }
  if (row.review_lane === 'source_anchor_fanout_review_lane') {
    return 'Page text exists, but fan-out risk means this source may overmatch several standards; keep pending until exact anchor evidence distinguishes the target grade.'
  }
  return 'Manual exact-anchor review remains required.'
}

function recommendationReasons(row) {
  return uniqueStrings([
    `review_lane:${row.review_lane || 'missing'}`,
    `recommended_disposition:${row.recommended_disposition || 'missing'}`,
    `primary_review_bucket:${row.primary_review_bucket || 'missing'}`,
    `page_evidence_status:${row.page_evidence_status || 'missing'}`,
    `page_hint_source:${row.page_hint_source || 'missing'}`,
    row.has_full_h4g_triplet_context ? 'full_h4g_triplet_context' : '',
    row.sibling_h4g_grade_count ? `sibling_h4g_grade_count:${row.sibling_h4g_grade_count}` : '',
    row.grade_band ? `grade:${row.grade_band}` : '',
    row.target_standard_code ? `target_standard:${row.target_standard_code}` : '',
    ...(row.risk_signals || []).slice(0, 8)
  ])
}

function compactPageEvidence(context) {
  if (!context || typeof context !== 'object') return null
  return {
    evidence_packet_item_id: context.evidence_packet_item_id || '',
    page_evidence_status: context.page_evidence_status || '',
    page_hint_confidence: context.page_hint_confidence || '',
    page_hint_requires_review: context.page_hint_requires_review === true,
    page_hint_source: context.page_hint_source || '',
    page_range: context.page_range || '',
    page_range_status: context.page_range_status || '',
    page_text_excerpt_previews: (context.page_text_excerpts || []).slice(0, 2).map(excerpt => ({
      pdf_page: excerpt.pdf_page,
      printed_page_estimate: excerpt.printed_page_estimate,
      status: excerpt.status || '',
      text_chars: excerpt.text_chars || 0,
      text_excerpt_preview: truncate(excerpt.text_excerpt || '', 220)
    })),
    pdf_pages: context.pdf_pages || [],
    ready_for_manual_review: context.ready_for_manual_review === true,
    unit_index_found: context.unit_index_found === true,
    unit_index_page_start_override: context.unit_index_page_start_override || null
  }
}

function sourceAnchorRecommendation(row, errors) {
  const recommendation = recommendedReviewerDecision(row)
  const id = row.decision_id || ''
  if (!(row.allowed_decisions || []).includes(recommendation)) {
    errors.push(`${id} recommended_reviewer_decision ${recommendation} must be allowed by the source-anchor review decision`)
  }
  return {
    allowed_decisions: row.allowed_decisions || [],
    decision_id: id,
    decision_status: row.decision_status || '',
    decision_type: row.decision_type || '',
    downstream_action_decision_id: row.downstream_action_decision_id || '',
    exact_anchor_auto_approval: false,
    grade_band: row.grade_band || '',
    has_full_h4g_triplet_context: row.has_full_h4g_triplet_context === true,
    inventory_item_id: row.inventory_item_id || '',
    item_review_surface: row.item_review_surface || '',
    page_evidence_context: compactPageEvidence(row.page_evidence_context),
    page_evidence_packet_item_id: row.page_evidence_packet_item_id || '',
    page_evidence_status: row.page_evidence_status || '',
    page_hint_source: row.page_hint_source || '',
    primary_review_bucket: row.primary_review_bucket || '',
    progression_group_id: row.progression_group_id || '',
    recommendation_confidence: recommendationConfidence(row),
    recommendation_is_official_decision: false,
    recommendation_only: true,
    recommendation_reasons: recommendationReasons(row),
    recommendation_requires_manual_confirmation: true,
    recommended_disposition: row.recommended_disposition || '',
    recommended_next_gate: recommendedNextGate(row),
    recommended_reviewer_decision: recommendation,
    review_grain: row.review_grain || '',
    review_lane: row.review_lane || '',
    reviewer_note: reviewerNote(row),
    risk_profile: row.risk_profile || {},
    risk_signals: row.risk_signals || [],
    same_progression_group_grade_bands: row.same_progression_group_grade_bands || [],
    sibling_h4g_grade_count: row.sibling_h4g_grade_count || 0,
    source_anchor_evidence_item_id: row.source_anchor_evidence_item_id || '',
    source_anchor_review_item_ids: row.source_anchor_review_item_ids || [],
    source_anchor_review_recommendation_id: id.replace('_decision_', '_recommendation_') || '',
    source_batch: row.source_batch || '',
    source_batch_item_id: row.source_batch_item_id || '',
    source_downstream_source_anchor_review_work_item_id: row.source_downstream_source_anchor_review_work_item_id || '',
    source_key: row.source_key || '',
    source_standard_context: row.source_standard_context || {},
    standard_code: row.standard_code || '',
    subject_slug: row.subject_slug || '',
    target_standard_code: row.target_standard_code || '',
    textbook_evidence_id: row.textbook_evidence_id || '',
    unit_context: row.unit_context || {},
    unit_evidence_id: row.unit_evidence_id || '',
    unit_title: row.unit_title || ''
  }
}

function buildRows(decisions, errors) {
  const rows = []
  const seen = new Set()
  for (const row of decisions.downstream_source_anchor_review_decisions || []) {
    const id = row.decision_id || ''
    if (!id) errors.push('downstream source-anchor review decision row missing decision_id')
    if (seen.has(id)) errors.push(`duplicate downstream source-anchor review decision_id: ${id}`)
    seen.add(id)
    if (row.reviewer_decision !== 'pending') {
      errors.push(`${id} must still have reviewer_decision=pending before recommendation-only routing`)
    }
    if (row.decision_status !== 'pending') {
      errors.push(`${id} must still have decision_status=pending before recommendation-only routing`)
    }
    rows.push(sourceAnchorRecommendation(row, errors))
  }
  return rows
}

function summarize(rows) {
  const summary = {
    by_grade_band: {},
    by_page_evidence_status: {},
    by_page_hint_source: {},
    by_primary_review_bucket: {},
    by_recommendation: {},
    by_recommendation_confidence: {},
    by_recommended_disposition: {},
    by_review_lane: {},
    by_subject: {},
    downstream_source_anchor_review_recommendations: rows.length,
    exact_anchor_auto_approval_recommendations: 0,
    full_h4g_triplet_context_rows: 0,
    pending_recommendations: 0,
    scope_not_closed_recommendations: 0,
    text_extracted_rows: 0,
    unique_page_evidence_items: sorted(rows.map(row => row.page_evidence_packet_item_id)).length,
    unique_review_work_items: sorted(rows.map(row => row.source_downstream_source_anchor_review_work_item_id)).length,
    unique_source_anchor_review_decisions: sorted(rows.map(row => row.decision_id)).length,
    unique_standard_codes: sorted(rows.map(row => row.target_standard_code || row.standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    if (row.has_full_h4g_triplet_context) summary.full_h4g_triplet_context_rows += 1
    if (row.page_evidence_status === 'text_extracted') summary.text_extracted_rows += 1
    if (row.recommended_reviewer_decision === 'pending') summary.pending_recommendations += 1
    if (row.recommended_reviewer_decision === 'source_anchor_scope_not_closed_requires_split') {
      summary.scope_not_closed_recommendations += 1
    }
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_page_evidence_status, row.page_evidence_status)
    countInto(summary.by_page_hint_source, row.page_hint_source)
    countInto(summary.by_primary_review_bucket, row.primary_review_bucket)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision)
    countInto(summary.by_recommendation_confidence, row.recommendation_confidence)
    countInto(summary.by_recommended_disposition, row.recommended_disposition)
    countInto(summary.by_review_lane, row.review_lane)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${markdownCell(row.grade_band)} | ${markdownCell(row.review_lane)} | ${markdownCell(row.primary_review_bucket)} | ${markdownCell(row.target_standard_code)} | ${markdownCell(row.unit_title)} | ${markdownCell(row.recommended_reviewer_decision)} | ${markdownCell(row.recommendation_confidence)} | ${truncate((row.recommendation_reasons || []).join('; '))} |`
  )).join('\n') || '| - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Downstream Source-Anchor Review Recommendations

Generated at: ${payload.generated_at}

These are conservative recommendation-only routes for pending source-anchor
review decisions. They do not update the editable decisions template, approve
anchors, write \`public/data\`, change official standard text, or enable
matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| recommendation only | ${payload.recommendation_only} |
| source-anchor review recommendations | ${payload.summary.downstream_source_anchor_review_recommendations} |
| scope-not-closed recommendations | ${payload.summary.scope_not_closed_recommendations} |
| pending exact-anchor recommendations | ${payload.summary.pending_recommendations} |
| exact-anchor auto approvals | ${payload.summary.exact_anchor_auto_approval_recommendations} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Recommendations

| recommendation | rows |
| --- | ---: |
${countRows(payload.summary.by_recommendation)}

## Review Lanes

| review lane | rows |
| --- | ---: |
${countRows(payload.summary.by_review_lane)}

## Preview

| grade | review lane | bucket | standard | unit | recommendation | confidence | reasons |
| --- | --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.downstream_source_anchor_review_recommendations)}

## Guardrails

- Recommendations are not official reviewer decisions.
- Only scope-not-closed rows are routed to a non-pending recommendation.
- Text extraction alone never becomes exact-anchor approval.
- Matcher and publication gates remain separate later steps.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  if (!existsSync(args.decisions)) errors.push(`Missing decisions: ${args.decisions}`)
  const decisions = errors.length ? { downstream_source_anchor_review_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateTopLevel(decisions, args, errors)
  const rows = buildRows(decisions, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no downstream source-anchor review recommendations were generated')
  return {
    changes_official_standard_text: false,
    data_scope: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations',
    direct_matcher_use: false,
    downstream_source_anchor_review_recommendations: rows,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_recommendations',
    recommendation_only: true,
    source_downstream_source_anchor_review_decisions: args.decisions,
    summary: summarize(rows),
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
