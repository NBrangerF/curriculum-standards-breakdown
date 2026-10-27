#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_EXACT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_AFTER_POST_CONFIRMATION_CLOSURE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_after_post_confirmation_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_packet_anchor_domain_rejected_english_pe.md'

function parseArgs(argv) {
  const args = {
    afterPostConfirmationClosure: DEFAULT_AFTER_POST_CONFIRMATION_CLOSURE,
    exactPacket: DEFAULT_EXACT_PACKET,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--exact-packet') args.exactPacket = argv[++i]
    else if (item === '--after-post-confirmation-closure') args.afterPostConfirmationClosure = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_packet.js \\
  --strict --require-items

Builds a read-only grouped review packet for the 52 source-anchor exact rows
left after post-confirmation closure candidates. The packet groups rows by
subject, grade, unit, and exact-anchor risk lane so manual review can inspect a
unit surface once before deciding individual standard anchors. It does not edit
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

function validateExactPacket(packet, args, errors) {
  if (packet.valid !== true) errors.push('exact evidence packet valid must be true')
  if ((packet.errors || []).length) errors.push('exact evidence packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_evidence_packet') {
    errors.push('exact evidence packet purpose mismatch')
  }
  if (packet.exact_evidence_packet_only !== true) errors.push('exact evidence packet exact_evidence_packet_only must be true')
  if (packet.review_only !== true) errors.push('exact evidence packet review_only must be true')
  if (!Array.isArray(packet.source_anchor_exact_evidence_items)) {
    errors.push('exact evidence packet source_anchor_exact_evidence_items must be an array')
  }
  validatePolicy('exact evidence packet', packet, errors)
  if (args.requireItems && !(packet.source_anchor_exact_evidence_items || []).length) {
    errors.push('requireItems is set but exact evidence packet has no rows')
  }
}

function validateAfterPostConfirmationClosure(payload, args, errors) {
  if (payload.valid !== true) errors.push('after post-confirmation closure valid must be true')
  if ((payload.errors || []).length) errors.push('after post-confirmation closure errors must be empty')
  if (payload.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_readiness') {
    errors.push('after post-confirmation closure purpose mismatch')
  }
  if (payload.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_after_post_confirmation') {
    errors.push('after post-confirmation closure candidate_purpose mismatch')
  }
  if (payload.review_only !== true) errors.push('after post-confirmation closure review_only must be true')
  if (!Array.isArray(payload.closure_readiness_items)) {
    errors.push('after post-confirmation closure closure_readiness_items must be an array')
  }
  validatePolicy('after post-confirmation closure', payload, errors)
}

function groupPacketPolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    exact_group_packet_is_not_reviewer_decision: true,
    grouped_review_required_before_exact_anchor_decision_candidate: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function exactItemId(row) {
  return row.exact_anchor_evidence_packet_id || row.downstream_action_decision_id || row.source_key || ''
}

function groupKey(row) {
  return [
    row.subject_slug || '',
    row.grade_band || '',
    row.unit_evidence_id || '',
    row.inventory_bucket || '',
    row.manual_confirmation_lane || ''
  ].join('|')
}

function groupRoute(rows) {
  const buckets = sorted(rows.map(row => row.inventory_bucket))
  const standards = sorted(rows.map(row => row.standard_code))
  if (buckets.includes('unit_or_standard_fanout_review')) return 'unit_or_standard_fanout_exact_anchor_group_review'
  if (standards.length >= 10) return 'single_unit_many_standard_generic_anchor_review'
  return 'single_unit_generic_or_deny_term_exact_anchor_review'
}

function reviewPriority(rows) {
  const maxRisk = Math.max(...rows.map(row => Number(row.risk_profile?.risk_score || 0)))
  const standardCount = sorted(rows.map(row => row.standard_code)).length
  if (standardCount >= 20 || maxRisk >= 5) return 'P1'
  if (standardCount >= 5 || maxRisk >= 4) return 'P2'
  return 'P3'
}

function pageEvidenceSummary(rows) {
  const contexts = rows.map(row => row.page_evidence_context || {})
  const previews = []
  const seen = new Set()
  for (const context of contexts) {
    for (const preview of context.page_text_excerpt_previews || []) {
      const key = `${preview.pdf_page || ''}|${preview.text_excerpt_preview || ''}`
      if (seen.has(key)) continue
      seen.add(key)
      previews.push(preview)
    }
  }
  return {
    page_evidence_statuses: sorted(rows.map(row => row.page_evidence_status)),
    page_hint_sources: sorted(rows.map(row => row.page_hint_source)),
    page_ranges: sorted(contexts.map(context => context.page_range)),
    page_text_excerpt_previews: previews.slice(0, 6),
    pdf_pages: sorted(contexts.flatMap(context => context.pdf_pages || [])).map(value => Number(value)).filter(value => Number.isFinite(value)).sort((a, b) => a - b),
    ready_for_manual_review_items: rows.filter(row => row.page_evidence_context?.ready_for_manual_review === true).length
  }
}

function standardReviewRow(row) {
  return {
    anchor_requirement_summary: row.anchor_requirement_summary || '',
    downstream_action_decision_id: row.downstream_action_decision_id || '',
    exact_anchor_evidence_packet_id: exactItemId(row),
    grade_band: row.grade_band || '',
    inventory_bucket: row.inventory_bucket || '',
    page_evidence_packet_item_id: row.page_evidence_packet_item_id || '',
    page_evidence_status: row.page_evidence_status || '',
    page_hint_source: row.page_hint_source || '',
    progression_group_id: row.progression_group_id || '',
    recommended_reviewer_decision: row.recommended_reviewer_decision || '',
    review_decision_id: row.review_decision_id || '',
    review_decision_status: row.review_decision_status || '',
    review_lane: row.review_lane || '',
    risk_profile: row.risk_profile || {},
    risk_signals: row.risk_signals || [],
    source_anchor_review_recommendation_id: row.source_anchor_review_recommendation_id || '',
    source_key: row.source_key || '',
    source_standard_context: row.source_standard_context || {},
    standard_code: row.standard_code || '',
    subject_slug: row.subject_slug || '',
    target_standard_code: row.target_standard_code || '',
    unit_evidence_id: row.unit_evidence_id || '',
    unit_title: row.unit_title || ''
  }
}

function reviewPrompts(route) {
  const base = [
    'Read the grouped page excerpts once, then decide each standard anchor separately.',
    'Do not approve a standard only because the unit title shares a broad topic.',
    'Record the exact activity, task, language behavior, movement skill, health behavior, or cultural evidence visible in the page text.'
  ]
  if (route === 'unit_or_standard_fanout_exact_anchor_group_review') {
    base.push('Check whether this single unit is being fanned out to several standards without distinct evidence for each one.')
  } else if (route === 'single_unit_many_standard_generic_anchor_review') {
    base.push('This unit maps to many standards; reject anchors that only match a generic unit theme or lesson title.')
  } else {
    base.push('Check whether the generic/deny-term risk is resolved by body text rather than by title similarity.')
  }
  return base
}

function buildGroup(rows) {
  const first = rows[0] || {}
  const route = groupRoute(rows)
  const standardRows = rows
    .slice()
    .sort((a, b) => String(a.standard_code || '').localeCompare(String(b.standard_code || '')))
    .map(standardReviewRow)
  const riskScores = rows.map(row => Number(row.risk_profile?.risk_score || 0)).filter(Number.isFinite)
  const bridgeScores = rows.map(row => Number(row.risk_profile?.bridge_score || 0)).filter(Number.isFinite)
  return {
    exact_anchor_group_review_item_id: `h4g_anchor_group_post_candidate_source_anchor_exact_group_review_${hashText(groupKey(first))}`,
    grade_band: first.grade_band || '',
    group_key: groupKey(first),
    group_review_prompts: reviewPrompts(route),
    group_review_route: route,
    inventory_buckets: sorted(rows.map(row => row.inventory_bucket)),
    manual_confirmation_lanes: sorted(rows.map(row => row.manual_confirmation_lane)),
    max_bridge_score: bridgeScores.length ? Math.max(...bridgeScores) : 0,
    max_risk_score: riskScores.length ? Math.max(...riskScores) : 0,
    page_evidence_summary: pageEvidenceSummary(rows),
    priority_tier: reviewPriority(rows),
    progression_group_ids: sorted(rows.map(row => row.progression_group_id)),
    review_only: true,
    source_anchor_exact_evidence_item_ids: sorted(rows.map(exactItemId)),
    source_anchor_exact_evidence_items: rows.length,
    standard_codes: sorted(rows.map(row => row.standard_code)),
    standard_review_rows: standardRows,
    subject_slug: first.subject_slug || '',
    textbook_evidence_id: first.textbook_evidence_id || '',
    unit_context: first.unit_context || {},
    unit_evidence_id: first.unit_evidence_id || '',
    unit_title: first.unit_title || '',
    writes_public_data: false
  }
}

function summarize(groups, exactItems, pendingClosureRows) {
  const summary = {
    by_grade_band: {},
    by_group_review_route: {},
    by_inventory_bucket: {},
    by_priority_tier: {},
    by_subject: {},
    exact_anchor_auto_approval_items: exactItems.filter(row => row.exact_anchor_auto_approval === true).length,
    expected_source_anchor_exact_evidence_items: exactItems.length,
    expected_pending_closure_items: pendingClosureRows.length,
    group_review_items: groups.length,
    groups_with_full_h4g_triplet_context: groups.filter(group => group.standard_review_rows.some(row => {
      const source = exactItems.find(item => exactItemId(item) === row.exact_anchor_evidence_packet_id)
      return source?.has_full_h4g_triplet_context === true
    })).length,
    groups_with_multiple_standards: groups.filter(group => group.standard_codes.length > 1).length,
    max_rows_per_group: Math.max(0, ...groups.map(group => group.source_anchor_exact_evidence_items)),
    pending_closure_source_anchor_items: pendingClosureRows.length,
    ready_for_manual_review_items: exactItems.filter(row => row.page_evidence_context?.ready_for_manual_review === true).length,
    source_anchor_exact_evidence_items: exactItems.length,
    text_extracted_items: exactItems.filter(row => row.page_evidence_status === 'text_extracted').length,
    unique_action_decisions: sorted(exactItems.map(row => row.downstream_action_decision_id)).length,
    unique_progression_groups: sorted(exactItems.map(row => row.progression_group_id)).length,
    unique_standard_codes: sorted(exactItems.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(exactItems.map(row => row.unit_evidence_id)).length
  }
  for (const group of groups) {
    countInto(summary.by_grade_band, group.grade_band)
    countInto(summary.by_group_review_route, group.group_review_route)
    countInto(summary.by_priority_tier, group.priority_tier)
    countInto(summary.by_subject, group.subject_slug)
    for (const bucket of group.inventory_buckets) countInto(summary.by_inventory_bucket, bucket)
  }
  return summary
}

function pendingClosureRows(afterPostConfirmationClosure) {
  return (afterPostConfirmationClosure.closure_readiness_items || [])
    .filter(row => row.downstream_action_closure_candidate !== true && row.source_downstream_action_batch === 'source_anchor_evidence')
}

function validateCoverage(exactItems, pendingRows, errors) {
  const exactIds = sorted(exactItems.map(row => row.downstream_action_decision_id))
  const pendingIds = sorted(pendingRows.map(row => row.decision_id))
  if (exactIds.length !== pendingIds.length) {
    errors.push(`exact evidence action ids must match pending closure source-anchor ids: ${exactIds.length} vs ${pendingIds.length}`)
  }
  const pendingSet = new Set(pendingIds)
  const exactSet = new Set(exactIds)
  for (const id of exactIds) {
    if (!pendingSet.has(id)) errors.push(`${id} exact evidence action id missing pending closure row`)
  }
  for (const id of pendingIds) {
    if (!exactSet.has(id)) errors.push(`${id} pending closure row missing exact evidence item`)
  }
}

function markdownSummary(payload) {
  return `# H4G Post-Candidate Source-Anchor Exact Group Review Packet

Generated at: ${payload.generated_at}

This read-only packet groups the remaining source-anchor exact rows by unit and
risk lane. It is an evidence-review surface, not a reviewer decision, matcher
approval, publication approval, or public data change.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| group review items | ${payload.summary.group_review_items} |
| source-anchor exact evidence items | ${payload.summary.source_anchor_exact_evidence_items} |
| pending closure source-anchor items | ${payload.summary.pending_closure_source_anchor_items} |
| text extracted items | ${payload.summary.text_extracted_items} |
| ready for manual review items | ${payload.summary.ready_for_manual_review_items} |
| max rows per group | ${payload.summary.max_rows_per_group} |
| exact anchor auto-approval items | ${payload.summary.exact_anchor_auto_approval_items} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Group Routes

| route | groups |
| --- | ---: |
${countRows(payload.summary.by_group_review_route)}

## Groups

| priority | route | subject | grade | rows | unit |
| --- | --- | --- | --- | ---: | --- |
${payload.exact_anchor_group_review_items.map(group => `| ${markdownCell(group.priority_tier)} | ${markdownCell(group.group_review_route)} | ${markdownCell(group.subject_slug)} | ${markdownCell(group.grade_band)} | ${group.source_anchor_exact_evidence_items} | ${truncate(group.unit_title, 90)} |`).join('\n') || '| - | - | - | - | 0 | - |'}

## Guardrails

- Grouping does not change any source decision.
- Every exact evidence row remains individually reviewable inside its group.
- All public-data, matcher, and publication flags remain false.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of Object.entries({
    afterPostConfirmationClosure: args.afterPostConfirmationClosure,
    exactPacket: args.exactPacket
  })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const exactPacket = existsSync(args.exactPacket) ? readJson(args.exactPacket) : { source_anchor_exact_evidence_items: [] }
  const afterPostConfirmationClosure = existsSync(args.afterPostConfirmationClosure) ? readJson(args.afterPostConfirmationClosure) : { closure_readiness_items: [] }
  if (!errors.length) {
    validateExactPacket(exactPacket, args, errors)
    validateAfterPostConfirmationClosure(afterPostConfirmationClosure, args, errors)
  }

  const exactItems = exactPacket.source_anchor_exact_evidence_items || []
  const pendingRows = pendingClosureRows(afterPostConfirmationClosure)
  validateCoverage(exactItems, pendingRows, errors)

  const grouped = new Map()
  for (const row of exactItems) {
    if (row.page_evidence_status !== 'text_extracted') errors.push(`${exactItemId(row)} page_evidence_status must be text_extracted`)
    if (row.page_evidence_context?.ready_for_manual_review !== true) errors.push(`${exactItemId(row)} must be ready for manual review`)
    if (row.recommended_reviewer_decision !== 'pending') errors.push(`${exactItemId(row)} recommended reviewer decision must remain pending`)
    if (row.exact_anchor_auto_approval === true) errors.push(`${exactItemId(row)} must not auto-approve exact anchor`)
    const key = groupKey(row)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(row)
  }
  const groups = [...grouped.values()]
    .map(buildGroup)
    .sort((a, b) => {
      const priority = a.priority_tier.localeCompare(b.priority_tier)
      if (priority) return priority
      return b.source_anchor_exact_evidence_items - a.source_anchor_exact_evidence_items
    })

  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    exact_anchor_group_review_packet_only: true,
    exact_anchor_group_review_items: groups,
    generated_at: new Date().toISOString(),
    group_packet_policy: groupPacketPolicy(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_packet',
    review_only: true,
    source_action_closure_candidates_after_post_confirmation: args.afterPostConfirmationClosure,
    source_post_candidate_source_anchor_exact_evidence_packet: args.exactPacket,
    summary: summarize(groups, exactItems, pendingRows),
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
  console.log(JSON.stringify({
    out: args.out,
    summary: payload.summary,
    valid: payload.valid
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
