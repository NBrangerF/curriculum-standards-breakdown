#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_page_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_page_evidence_packet_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_page_evidence_packet_anchor_domain_rejected_english_pe_audit.md'

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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_page_evidence_packet.js \\
  --packet generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_page_evidence_packet_anchor_domain_rejected_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the manual-scope source-anchor page evidence packet against editable
review decisions. The packet is reviewer evidence only; it is not a source
anchor approval or publication gate.`)
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

function packetPolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    page_evidence_packet_is_not_review_decision: true,
    publication_ready: false,
    requires_later_manual_source_anchor_decision: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function validatePacketPolicy(label, policy, errors) {
  for (const key of [
    'page_evidence_packet_is_not_review_decision',
    'requires_later_manual_source_anchor_decision',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  validatePolicy(label, policy, errors)
}

function validateTopLevel(packet, decisions, args, errors) {
  if (packet.valid !== true) errors.push('packet valid must be true')
  if ((packet.errors || []).length) errors.push('packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_page_evidence_packet') {
    errors.push('packet purpose mismatch')
  }
  if (packet.page_evidence_packet_only !== true) errors.push('packet page_evidence_packet_only must be true')
  if (packet.source_manual_scope_source_anchor_review_decisions !== args.decisions) {
    errors.push('packet source_manual_scope_source_anchor_review_decisions must match audit arg')
  }
  validatePolicy('packet', packet, errors)
  validatePacketPolicy('packet page_evidence_policy', packet.page_evidence_policy || {}, errors)
  if (!Array.isArray(packet.page_evidence_items)) errors.push('packet page_evidence_items must be an array')

  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  validatePolicy('decisions', decisions, errors)
  if (!Array.isArray(decisions.manual_scope_source_anchor_review_decisions)) {
    errors.push('decisions manual_scope_source_anchor_review_decisions must be an array')
  }
}

function packetItemId(decision) {
  return `h4g_anchor_group_manual_scope_source_anchor_page_evidence_${hashText(decision.decision_id)}`
}

function staticFields(decision) {
  return {
    decision_status: decision.decision_status || '',
    grade_band: decision.target_grade_band || decision.grade_band || '',
    inventory_item_id: decision.inventory_item_id || '',
    item_review_decision_id: decision.item_review_decision_id || '',
    manual_review_required: true,
    manual_scope_source_anchor_evidence_item_id: decision.manual_scope_source_anchor_evidence_item_id || '',
    page_range: decision.page_range || '',
    page_range_status: decision.page_range_status || '',
    repository_path: decision.repository_path || '',
    review_lane: decision.review_lane || '',
    reviewer_decision: decision.reviewer_decision || '',
    source_manual_scope_source_anchor_review_decision_id: decision.decision_id || '',
    source_manual_scope_source_anchor_review_work_item_id: decision.source_manual_scope_source_anchor_review_work_item_id || '',
    subject_slug: decision.subject_slug || '',
    target_standard_code: decision.target_standard_code || '',
    textbook_evidence_id: decision.unit_context?.textbook_evidence_id || '',
    unit_evidence_id: decision.unit_evidence_id || '',
    unit_title: decision.unit_title || ''
  }
}

function validateItem(decision, item, errors, stats) {
  const prefix = item.evidence_packet_item_id || decision.decision_id || '(page evidence item)'
  if (item.evidence_packet_item_id !== packetItemId(decision)) errors.push(`${prefix} evidence_packet_item_id mismatch`)
  validatePolicy(prefix, item, errors)
  validatePacketPolicy(`${prefix} page_evidence_policy`, item.page_evidence_policy || {}, errors)
  for (const [key, expected] of Object.entries(staticFields(decision))) {
    if (!sameJson(item[key], expected)) errors.push(`${prefix} ${key} mismatch`)
  }
  if (item.evidence_packet_only !== true) errors.push(`${prefix} evidence_packet_only must be true`)
  if (!Array.isArray(item.pdf_pages)) errors.push(`${prefix} pdf_pages must be an array`)
  if (!Array.isArray(item.page_text_excerpts)) errors.push(`${prefix} page_text_excerpts must be an array`)
  if ((item.pdf_pages || []).length !== (item.page_text_excerpts || []).length) {
    errors.push(`${prefix} pdf_pages length must match page_text_excerpts length`)
  }
  const allowedStatuses = ['text_extracted', 'empty_text', 'extract_failed', 'missing_pdf_cache', 'missing_pdf_page_hint', 'missing_unit_index']
  if (!allowedStatuses.includes(item.page_evidence_status)) errors.push(`${prefix} page_evidence_status invalid`)
  if (item.page_evidence_status === 'text_extracted') {
    if (item.ready_for_manual_review !== true) errors.push(`${prefix} text_extracted must be ready_for_manual_review`)
    if (!(item.page_text_excerpts || []).some(page => page.status === 'text_extracted' && Number(page.text_chars || 0) > 0)) {
      errors.push(`${prefix} text_extracted must include a non-empty page excerpt`)
    }
  } else if (item.ready_for_manual_review !== false) {
    errors.push(`${prefix} non-text_extracted item must not be ready_for_manual_review`)
  }

  stats.audited_page_evidence_items += 1
  if (item.ready_for_manual_review) stats.ready_for_manual_review_rows += 1
  if (item.page_evidence_status === 'text_extracted') stats.text_extracted_rows += 1
}

function summarizeRows(rows) {
  const summary = {
    by_grade_band: {},
    by_page_evidence_status: {},
    by_page_hint_source: {},
    by_page_range_status: {},
    by_review_lane: {},
    by_subject: {},
    by_target_standard_code: {},
    page_evidence_items: rows.length,
    ready_for_manual_review_rows: 0,
    text_extracted_rows: 0,
    unique_review_decisions: sorted(rows.map(row => row.source_manual_scope_source_anchor_review_decision_id)).length,
    unique_textbook_evidence_ids: sorted(rows.map(row => row.textbook_evidence_id)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    if (row.ready_for_manual_review) summary.ready_for_manual_review_rows += 1
    if (row.page_evidence_status === 'text_extracted') summary.text_extracted_rows += 1
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_page_evidence_status, row.page_evidence_status)
    countInto(summary.by_page_hint_source, row.page_hint_source)
    countInto(summary.by_page_range_status, row.page_range_status)
    countInto(summary.by_review_lane, row.review_lane)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_standard_code, row.target_standard_code)
  }
  return summary
}

function markdownSummary(payload) {
  return `# H4G Manual Scope Source-Anchor Page Evidence Packet Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected page evidence items | ${payload.summary.expected_page_evidence_items} |
| audited page evidence items | ${payload.summary.audited_page_evidence_items} |
| missing page evidence items | ${payload.summary.missing_page_evidence_items} |
| extra page evidence items | ${payload.summary.extra_page_evidence_items} |
| text extracted rows | ${payload.summary.text_extracted_rows} |
| ready for manual review rows | ${payload.summary.ready_for_manual_review_rows} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Evidence Status

| status | rows |
| --- | ---: |
${countRows(payload.summary.by_page_evidence_status)}

## Page Hint Sources

| source | rows |
| --- | ---: |
${countRows(payload.summary.by_page_hint_source)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['packet', args.packet],
    ['decisions', args.decisions]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }

  const packet = existsSync(args.packet) ? readJson(args.packet) : { page_evidence_items: [] }
  const decisions = existsSync(args.decisions) ? readJson(args.decisions) : { manual_scope_source_anchor_review_decisions: [] }
  if (!errors.length) validateTopLevel(packet, decisions, args, errors)

  const items = packet.page_evidence_items || []
  const decisionRows = decisions.manual_scope_source_anchor_review_decisions || []
  const itemsByDecision = mapBy(items, 'source_manual_scope_source_anchor_review_decision_id', errors, 'packet')
  const decisionsById = mapBy(decisionRows, 'decision_id', errors, 'decisions')
  const rowSummary = summarizeRows(items)
  if (!sameJson(packet.summary || {}, rowSummary)) errors.push('packet summary does not match page evidence items')

  const stats = {
    ...rowSummary,
    audited_page_evidence_items: 0,
    expected_page_evidence_items: decisionRows.length,
    extra_page_evidence_items: 0,
    missing_page_evidence_items: 0
  }
  stats.ready_for_manual_review_rows = 0
  stats.text_extracted_rows = 0

  if (items.length !== decisionRows.length) {
    errors.push(`packet rows ${items.length} must match decision rows ${decisionRows.length}`)
  }
  for (const [decisionId, decision] of decisionsById.entries()) {
    const item = itemsByDecision.get(decisionId)
    if (!item) {
      stats.missing_page_evidence_items += 1
      errors.push(`${decisionId} missing page evidence item`)
      continue
    }
    validateItem(decision, item, errors, stats)
  }
  for (const decisionId of itemsByDecision.keys()) {
    if (!decisionsById.has(decisionId)) {
      stats.extra_page_evidence_items += 1
      errors.push(`${decisionId} unexpected page evidence item`)
    }
  }
  if (args.requireItems && !stats.audited_page_evidence_items) {
    errors.push('requireItems is set but no page evidence items were audited')
  }

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
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
