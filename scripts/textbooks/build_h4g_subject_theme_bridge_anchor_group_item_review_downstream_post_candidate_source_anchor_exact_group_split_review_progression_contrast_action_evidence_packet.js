#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_CONTRAST_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_packet_anchor_domain_rejected_english_pe.md'

function parseArgs(argv) {
  const args = {
    contrastPacket: DEFAULT_CONTRAST_PACKET,
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--contrast-packet') args.contrastPacket = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_packet.js \\
  --strict --require-items

Builds a read-only evidence packet for the 30 H4G7/H4G8/H4G9 progression
action decisions. It binds each pending action decision to its source
progression contrast rows, page excerpts, split-surface evidence by grade, and
sibling standard context. It does not edit decisions, approve standards, write
public/data, or enable matcher/publication use.`)
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

function validateContrastPacket(packet, errors) {
  if (packet.valid !== true) errors.push('progression contrast packet valid must be true')
  if ((packet.errors || []).length) errors.push('progression contrast packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_packet') {
    errors.push('progression contrast packet purpose mismatch')
  }
  if (packet.progression_contrast_packet_only !== true) {
    errors.push('progression contrast packet progression_contrast_packet_only must be true')
  }
  if (packet.review_only !== true) errors.push('progression contrast packet review_only must be true')
  if (!Array.isArray(packet.progression_contrast_items)) {
    errors.push('progression contrast packet rows must be an array')
  }
  validatePolicy('progression contrast packet', packet, errors)
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

function packetPolicy() {
  return {
    action_evidence_packet_is_not_reviewer_decision: true,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    evidence_packet_only: true,
    matcher_ready: false,
    progression_action_evidence_packet_only: true,
    publication_ready: false,
    requires_later_action_decision_edit: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function evidencePacketItemId(decision) {
  return `h4g_anchor_group_post_candidate_source_anchor_exact_group_split_review_progression_action_evidence_${hashText(decision.decision_id)}`
}

function evidenceStatus(rows) {
  if (!rows.length) return 'missing_contrast_source'
  const textRows = rows.filter(row => row.page_evidence_status === 'text_extracted')
  const previewRows = rows.filter(row => (row.page_text_excerpt_previews || []).length > 0)
  if (textRows.length === rows.length && previewRows.length > 0) return 'text_evidence_ready'
  if (textRows.length > 0) return 'partial_text_evidence'
  return 'needs_text_evidence'
}

function siblingContextStatus(decision) {
  if ((decision.missing_sibling_grade_bands || []).length) return 'missing_public_sibling_context'
  if (decision.official_standard_texts_identical_across_siblings === true) {
    return 'identical_official_standard_requires_grade_specific_evidence'
  }
  return 'manual_progression_text_check_required'
}

function manualEvidencePrompts(decision) {
  const route = decision.selected_contrast_route || ''
  const common = [
    'Use the page excerpts to name the exact activity, task, language behavior, or evidence surface.',
    'Compare the evidence against H4G7/H4G8/H4G9 sibling standards before editing any decision.',
    'Keep official standard text unchanged; record only evidence and grade-specific focus notes here.',
    'Do not treat this evidence packet as approval for matcher or publication.'
  ]
  if (route === 'missing_public_sibling_progression_context') {
    return [
      'First repair or confirm the missing H4G7/H4G9 sibling public standard context.',
      'Do not judge grade-specific evidence from the H4G8 row alone.',
      ...common
    ]
  }
  if (route === 'identical_official_standard_current_grade_only_source_evidence') {
    return [
      'The official standard text is shared across siblings; prove the current grade difference from the source evidence.',
      'If the page excerpt only shows a broad unit theme, keep the action decision pending or reject the anchor as generic.',
      ...common
    ]
  }
  if (route === 'identical_official_standard_no_public_unit_evidence_yet') {
    return [
      'Collect sibling-grade source evidence before deciding that one grade is differentiated.',
      'Use this packet to identify which sibling evidence is missing, not to accept a single-grade anchor.',
      ...common
    ]
  }
  return common
}

function compactContrastRow(row) {
  return {
    contrast_route: row.contrast_route || '',
    exact_anchor_evidence_packet_id: row.exact_anchor_evidence_packet_id || '',
    grade_band: row.grade_band || '',
    group_review_route: row.group_review_route || '',
    has_full_h4g_triplet_context: row.has_full_h4g_triplet_context === true,
    inherited_risk_profile: row.inherited_risk_profile || {},
    official_standard_texts_identical_across_siblings: row.official_standard_texts_identical_across_siblings === true,
    page_evidence_status: row.page_evidence_status || '',
    page_hint_source: row.page_hint_source || '',
    page_text_excerpt_previews: row.page_text_excerpt_previews || [],
    progression_contrast_item_id: row.progression_contrast_item_id || '',
    review_focus: row.review_focus || '',
    review_questions: row.review_questions || [],
    sibling_public_unit_evidence_grades: row.sibling_public_unit_evidence_grades || [],
    source_split_review_item_id: row.source_split_review_item_id || '',
    source_standard_context: row.source_standard_context || {},
    split_surface_evidence_by_grade: row.split_surface_evidence_by_grade || {},
    split_surface_grade_bands_for_progression: row.split_surface_grade_bands_for_progression || [],
    standard_code: row.standard_code || '',
    subject_slug: row.subject_slug || '',
    target_standard_code: row.target_standard_code || '',
    unit_context: row.unit_context || {},
    unit_evidence_id: row.unit_evidence_id || '',
    unit_title: row.unit_title || '',
    worklist_rank: Number(row.worklist_rank || 0)
  }
}

function buildEvidenceItem(decision, contrastById, errors) {
  const missingContrastItemIds = []
  const contrastRows = []
  for (const id of decision.source_progression_contrast_item_ids || []) {
    const row = contrastById.get(id)
    if (!row) missingContrastItemIds.push(id)
    else contrastRows.push(row)
  }
  contrastRows.sort((a, b) => Number(a.worklist_rank || 0) - Number(b.worklist_rank || 0) ||
    String(a.standard_code || '').localeCompare(String(b.standard_code || '')))
  const status = evidenceStatus(contrastRows)
  const siblingStatus = siblingContextStatus(decision)
  const pagePreviewCount = contrastRows.reduce((sum, row) => sum + (row.page_text_excerpt_previews || []).length, 0)
  if (missingContrastItemIds.length) {
    errors.push(`${decision.decision_id} missing source contrast rows: ${missingContrastItemIds.join(', ')}`)
  }
  return {
    action_decision_evidence_packet_only: true,
    action_work_item_rank: Number(decision.action_work_item_rank || 0),
    approval_prohibited: true,
    changes_official_standard_text: false,
    contrast_routes: decision.contrast_routes || [],
    decision_status: decision.decision_status || '',
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    evidence_packet_item_id: evidencePacketItemId(decision),
    evidence_status: status,
    has_full_h4g_triplet_context: decision.has_full_h4g_triplet_context === true,
    manual_confirmation_required: true,
    manual_evidence_prompts: manualEvidencePrompts(decision),
    matcher_ready: false,
    missing_contrast_item_ids: missingContrastItemIds,
    missing_sibling_grade_bands: decision.missing_sibling_grade_bands || [],
    official_standard_texts_identical_across_siblings: decision.official_standard_texts_identical_across_siblings === true,
    page_text_excerpt_preview_count: pagePreviewCount,
    priority_tier: decision.priority_tier || '',
    progression_group_id: decision.progression_group_id || '',
    publication_ready: false,
    reviewer_action: decision.reviewer_action || '',
    reviewer_decision: decision.reviewer_decision || '',
    selected_contrast_route: decision.selected_contrast_route || '',
    sibling_context_status: siblingStatus,
    sibling_grade_bands: decision.sibling_grade_bands || [],
    sibling_grade_context: decision.sibling_grade_context || '',
    sibling_progression_records: decision.sibling_progression_records || [],
    sibling_public_evidence_by_grade: decision.sibling_public_evidence_by_grade || {},
    source_progression_action_decision_id: decision.decision_id || '',
    source_progression_action_work_item_id: decision.source_progression_action_work_item_id || '',
    source_progression_contrast_item_ids: decision.source_progression_contrast_item_ids || [],
    source_progression_contrast_items: contrastRows.map(compactContrastRow),
    split_review_item_count: Number(decision.split_review_item_count || 0),
    split_review_items: decision.split_review_items || [],
    split_surface_evidence_by_grade: decision.split_surface_evidence_by_grade || {},
    split_surface_grade_bands_for_progression: decision.split_surface_grade_bands_for_progression || [],
    standard_codes: decision.standard_codes || [],
    subject_slug: decision.subject_slug || '',
    unit_evidence_ids: decision.unit_evidence_ids || [],
    unit_titles: decision.unit_titles || [],
    work_queue: decision.work_queue || '',
    writes_public_data: false
  }
}

function summarize(rows, decisionsRows, contrastRows) {
  const coveredContrastIds = sorted(rows.flatMap(row => row.source_progression_contrast_item_ids || []))
  const evidenceDecisionIds = rows.map(row => row.source_progression_action_decision_id).filter(Boolean)
  const missingLinks = rows.reduce((sum, row) => sum + (row.missing_contrast_item_ids || []).length, 0)
  const summary = {
    action_evidence_packet_items: rows.length,
    auto_approval_items: 0,
    by_decision_status: {},
    by_evidence_status: {},
    by_priority_tier: {},
    by_reviewer_decision: {},
    by_selected_contrast_route: {},
    by_sibling_context_status: {},
    by_sibling_grade_context: {},
    by_subject: {},
    by_work_queue: {},
    decisions_with_missing_contrast_links: rows.filter(row => (row.missing_contrast_item_ids || []).length).length,
    duplicate_evidence_items: evidenceDecisionIds.length - sorted(evidenceDecisionIds).length,
    expected_action_decisions: decisionsRows.length,
    extra_evidence_items: 0,
    missing_contrast_item_links: missingLinks,
    missing_evidence_items: 0,
    page_text_excerpt_previews: rows.reduce((sum, row) => sum + Number(row.page_text_excerpt_preview_count || 0), 0),
    progression_action_evidence_items: rows.length,
    public_write_items: 0,
    row_mismatch_items: 0,
    source_progression_contrast_items: contrastRows.length,
    source_progression_contrast_items_covered: coveredContrastIds.length,
    text_evidence_ready_items: 0,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_standard_codes: sorted(rows.flatMap(row => row.standard_codes || [])).length,
    unique_unit_evidence_ids: sorted(rows.flatMap(row => row.unit_evidence_ids || [])).length
  }
  for (const row of rows) {
    countInto(summary.by_decision_status, row.decision_status)
    countInto(summary.by_evidence_status, row.evidence_status)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_selected_contrast_route, row.selected_contrast_route)
    countInto(summary.by_sibling_context_status, row.sibling_context_status)
    countInto(summary.by_sibling_grade_context, row.sibling_grade_context)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_work_queue, row.work_queue)
    if (row.evidence_status === 'text_evidence_ready') summary.text_evidence_ready_items += 1
    if (row.writes_public_data !== false) summary.public_write_items += 1
  }
  return summary
}

function markdownSummary(payload) {
  return `# H4G Split Review Progression Contrast Action Evidence Packet

Generated at: ${payload.generated_at}

This read-only packet binds each progression action decision to its source
contrast rows, page excerpts, split-surface grade evidence, and sibling H4G
standard context. It is evidence for manual review, not a decision or approval.

## Summary

| field | value |
| --- | ---: |
| progression action evidence items | ${payload.summary.progression_action_evidence_items} |
| expected action decisions | ${payload.summary.expected_action_decisions} |
| source progression contrast items | ${payload.summary.source_progression_contrast_items} |
| source progression contrast items covered | ${payload.summary.source_progression_contrast_items_covered} |
| text evidence ready items | ${payload.summary.text_evidence_ready_items} |
| page text excerpt previews | ${payload.summary.page_text_excerpt_previews} |
| missing contrast item links | ${payload.summary.missing_contrast_item_links} |
| decisions with missing contrast links | ${payload.summary.decisions_with_missing_contrast_links} |
| public write items | ${payload.summary.public_write_items} |
| auto approval items | ${payload.summary.auto_approval_items} |

## Work Queues

| work queue | evidence items |
| --- | ---: |
${countRows(payload.summary.by_work_queue)}

## Evidence Status

| evidence status | evidence items |
| --- | ---: |
${countRows(payload.summary.by_evidence_status)}

## Preview

| rank | queue | progression group | evidence status | standards | units |
| ---: | --- | --- | --- | --- | --- |
${payload.progression_action_evidence_items.slice(0, 20).map(row => `| ${row.action_work_item_rank} | ${markdownCell(row.work_queue)} | ${markdownCell(row.progression_group_id)} | ${markdownCell(row.evidence_status)} | ${truncate((row.standard_codes || []).join(', '), 120)} | ${truncate((row.unit_titles || []).join('; '), 140)} |`).join('\n') || '| - | - | - | - | - | - |'}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function build(args) {
  const errors = []
  for (const [label, path] of Object.entries({ decisions: args.decisions, contrastPacket: args.contrastPacket })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { progression_action_decisions: [] }
  const contrastPacket = existsSync(args.contrastPacket) ? readJson(args.contrastPacket) : { progression_contrast_items: [] }
  if (!errors.length) {
    validateDecisions(decisions, args, errors)
    validateContrastPacket(contrastPacket, errors)
  }
  const decisionRows = decisions.progression_action_decisions || []
  const contrastRows = contrastPacket.progression_contrast_items || []
  const contrastById = mapBy(contrastRows, 'progression_contrast_item_id', errors, 'progression contrast item')
  const evidenceItems = decisionRows
    .slice()
    .sort((a, b) => Number(a.action_work_item_rank || 0) - Number(b.action_work_item_rank || 0) ||
      String(a.progression_group_id || '').localeCompare(String(b.progression_group_id || '')))
    .map(row => buildEvidenceItem(row, contrastById, errors))
  const summary = summarize(evidenceItems, decisionRows, contrastRows)
  if (summary.public_write_items) errors.push(`progression action evidence packet has public write items: ${summary.public_write_items}`)
  if (summary.auto_approval_items) errors.push(`progression action evidence packet has auto approval items: ${summary.auto_approval_items}`)
  if (summary.missing_contrast_item_links) errors.push(`progression action evidence packet has missing contrast links: ${summary.missing_contrast_item_links}`)
  if (args.requireItems && !evidenceItems.length) errors.push('requireItems is set but no progression action evidence items were built')

  return {
    action_evidence_packet_only: true,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    evidence_packet_only: true,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: packetPolicy(),
    progression_action_evidence_items: evidenceItems,
    progression_action_evidence_packet_only: true,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_split_review_progression_contrast_action_evidence_packet',
    review_only: true,
    source_progression_action_decisions: args.decisions,
    source_progression_contrast_packet: args.contrastPacket,
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
