#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_EXACT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_AFTER_POST_CONFIRMATION_CLOSURE = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_after_post_confirmation_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_packet_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_packet_anchor_domain_rejected_english_pe_audit.md'

function parseArgs(argv) {
  const args = {
    afterPostConfirmationClosure: DEFAULT_AFTER_POST_CONFIRMATION_CLOSURE,
    exactPacket: DEFAULT_EXACT_PACKET,
    out: DEFAULT_OUT,
    packet: DEFAULT_PACKET,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--packet') args.packet = argv[++i]
    else if (item === '--exact-packet') args.exactPacket = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_packet.js \\
  --strict --require-items

Audits the grouped source-anchor exact review packet. It confirms every exact
evidence row left after post-confirmation closure appears exactly once in a
group, group routes match the source risks, and no public/matcher/publication
flags are enabled.`)
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

function validateTopLevel(packet, exactPacket, afterPostConfirmationClosure, args, errors) {
  if (packet.valid !== true) errors.push('group packet valid must be true')
  if ((packet.errors || []).length) errors.push('group packet errors must be empty')
  if (packet.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_group_review_packet') {
    errors.push('group packet purpose mismatch')
  }
  if (packet.exact_anchor_group_review_packet_only !== true) errors.push('group packet exact_anchor_group_review_packet_only must be true')
  if (packet.review_only !== true) errors.push('group packet review_only must be true')
  if (packet.source_post_candidate_source_anchor_exact_evidence_packet !== args.exactPacket) {
    errors.push('group packet source exact packet must match audit arg')
  }
  if (packet.source_action_closure_candidates_after_post_confirmation !== args.afterPostConfirmationClosure) {
    errors.push('group packet source after-post-confirmation closure must match audit arg')
  }
  if (!Array.isArray(packet.exact_anchor_group_review_items)) {
    errors.push('group packet exact_anchor_group_review_items must be an array')
  }
  validatePolicy('group packet', packet, errors)
  validateGroupPacketPolicy(packet.group_packet_policy || {}, errors)

  if (exactPacket.valid !== true) errors.push('source exact evidence packet valid must be true')
  if (exactPacket.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_source_anchor_exact_evidence_packet') {
    errors.push('source exact evidence packet purpose mismatch')
  }
  if (!Array.isArray(exactPacket.source_anchor_exact_evidence_items)) {
    errors.push('source exact evidence packet rows must be an array')
  }
  validatePolicy('source exact evidence packet', exactPacket, errors)

  if (afterPostConfirmationClosure.valid !== true) errors.push('after post-confirmation closure valid must be true')
  if (afterPostConfirmationClosure.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_closure_candidates_after_post_confirmation') {
    errors.push('after post-confirmation closure candidate_purpose mismatch')
  }
  if (!Array.isArray(afterPostConfirmationClosure.closure_readiness_items)) {
    errors.push('after post-confirmation closure rows must be an array')
  }
  validatePolicy('after post-confirmation closure', afterPostConfirmationClosure, errors)
}

function validateGroupPacketPolicy(policy, errors) {
  for (const key of [
    'exact_group_packet_is_not_reviewer_decision',
    'grouped_review_required_before_exact_anchor_decision_candidate',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`group_packet_policy.${key} must be true`)
  }
  validatePolicy('group_packet_policy', policy, errors)
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

function pendingClosureRows(afterPostConfirmationClosure) {
  return (afterPostConfirmationClosure.closure_readiness_items || [])
    .filter(row => row.downstream_action_closure_candidate !== true && row.source_downstream_action_batch === 'source_anchor_evidence')
}

function mapBy(rows, idFn, errors, label) {
  const out = new Map()
  for (const row of rows || []) {
    const id = idFn(row)
    if (!id) {
      errors.push(`${label} row missing id`)
      continue
    }
    if (out.has(id)) errors.push(`${label} duplicate id: ${id}`)
    out.set(id, row)
  }
  return out
}

function validateSourceCoverage(exactItems, pendingRows, errors) {
  const exactIds = sorted(exactItems.map(row => row.downstream_action_decision_id))
  const pendingIds = sorted(pendingRows.map(row => row.decision_id))
  if (!sameJson(exactIds, pendingIds)) {
    errors.push('source exact action ids must match after-post-confirmation pending source-anchor rows')
  }
}

function emptyStats(exactItems, pendingRows) {
  return {
    by_grade_band: {},
    by_group_review_route: {},
    by_inventory_bucket: {},
    by_priority_tier: {},
    by_subject: {},
    exact_anchor_auto_approval_items: exactItems.filter(row => row.exact_anchor_auto_approval === true).length,
    expected_pending_closure_items: pendingRows.length,
    expected_source_anchor_exact_evidence_items: exactItems.length,
    group_review_items: 0,
    groups_with_full_h4g_triplet_context: 0,
    groups_with_multiple_standards: 0,
    max_rows_per_group: 0,
    missing_exact_evidence_items: 0,
    pending_closure_source_anchor_items: pendingRows.length,
    ready_for_manual_review_items: exactItems.filter(row => row.page_evidence_context?.ready_for_manual_review === true).length,
    source_anchor_exact_evidence_items: exactItems.length,
    text_extracted_items: exactItems.filter(row => row.page_evidence_status === 'text_extracted').length,
    unique_action_decisions: sorted(exactItems.map(row => row.downstream_action_decision_id)).length,
    unique_progression_groups: sorted(exactItems.map(row => row.progression_group_id)).length,
    unique_standard_codes: sorted(exactItems.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(exactItems.map(row => row.unit_evidence_id)).length,
    unexpected_group_rows: 0
  }
}

function validateGroup(group, exactById, seenIds, errors, stats) {
  const prefix = group.exact_anchor_group_review_item_id || group.group_key || '(missing group)'
  if (group.review_only !== true) errors.push(`${prefix} review_only must be true`)
  if (group.writes_public_data !== false) errors.push(`${prefix} writes_public_data must be false`)
  if (!group.group_key) errors.push(`${prefix} missing group_key`)
  if (!Array.isArray(group.standard_review_rows)) errors.push(`${prefix} standard_review_rows must be an array`)
  if (!Array.isArray(group.source_anchor_exact_evidence_item_ids)) {
    errors.push(`${prefix} source_anchor_exact_evidence_item_ids must be an array`)
  }
  const rows = []
  for (const standardRow of group.standard_review_rows || []) {
    const id = standardRow.exact_anchor_evidence_packet_id || ''
    if (!id) {
      errors.push(`${prefix} standard row missing exact evidence id`)
      continue
    }
    const source = exactById.get(id)
    if (!source) {
      stats.unexpected_group_rows += 1
      errors.push(`${prefix} unexpected exact evidence id ${id}`)
      continue
    }
    if (seenIds.has(id)) errors.push(`${id} appears in multiple exact-anchor groups`)
    seenIds.add(id)
    if (groupKey(source) !== group.group_key) errors.push(`${id} group_key mismatch`)
    if (standardRow.downstream_action_decision_id !== source.downstream_action_decision_id) errors.push(`${id} downstream action id mismatch`)
    if (standardRow.review_decision_id !== source.review_decision_id) errors.push(`${id} review decision id mismatch`)
    if (standardRow.standard_code !== source.standard_code) errors.push(`${id} standard_code mismatch`)
    rows.push(source)
  }
  const expectedIds = sorted(rows.map(exactItemId))
  if (!sameJson(group.source_anchor_exact_evidence_item_ids || [], expectedIds)) {
    errors.push(`${prefix} source_anchor_exact_evidence_item_ids mismatch`)
  }
  if (group.source_anchor_exact_evidence_items !== rows.length) {
    errors.push(`${prefix} source_anchor_exact_evidence_items mismatch`)
  }
  const expectedRoute = groupRoute(rows)
  if (group.group_review_route !== expectedRoute) errors.push(`${prefix} group_review_route mismatch`)
  const expectedPriority = reviewPriority(rows)
  if (group.priority_tier !== expectedPriority) errors.push(`${prefix} priority_tier mismatch`)
  if (group.subject_slug !== (rows[0]?.subject_slug || '')) errors.push(`${prefix} subject_slug mismatch`)
  if (group.grade_band !== (rows[0]?.grade_band || '')) errors.push(`${prefix} grade_band mismatch`)
  if (group.unit_evidence_id !== (rows[0]?.unit_evidence_id || '')) errors.push(`${prefix} unit_evidence_id mismatch`)

  stats.group_review_items += 1
  stats.max_rows_per_group = Math.max(stats.max_rows_per_group, rows.length)
  if (sorted(rows.map(row => row.standard_code)).length > 1) stats.groups_with_multiple_standards += 1
  if (rows.some(row => row.has_full_h4g_triplet_context === true)) stats.groups_with_full_h4g_triplet_context += 1
  countInto(stats.by_grade_band, group.grade_band)
  countInto(stats.by_group_review_route, group.group_review_route)
  countInto(stats.by_priority_tier, group.priority_tier)
  countInto(stats.by_subject, group.subject_slug)
  for (const bucket of group.inventory_buckets || []) countInto(stats.by_inventory_bucket, bucket)
}

function markdownSummary(payload) {
  return `# H4G Post-Candidate Source-Anchor Exact Group Review Packet Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| group review items | ${payload.summary.group_review_items} |
| source-anchor exact evidence items | ${payload.summary.source_anchor_exact_evidence_items} |
| pending closure source-anchor items | ${payload.summary.pending_closure_source_anchor_items} |
| missing exact evidence items | ${payload.summary.missing_exact_evidence_items} |
| unexpected group rows | ${payload.summary.unexpected_group_rows} |
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

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of Object.entries({
    afterPostConfirmationClosure: args.afterPostConfirmationClosure,
    exactPacket: args.exactPacket,
    packet: args.packet
  })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const packet = existsSync(args.packet) ? readJson(args.packet) : { exact_anchor_group_review_items: [] }
  const exactPacket = existsSync(args.exactPacket) ? readJson(args.exactPacket) : { source_anchor_exact_evidence_items: [] }
  const afterPostConfirmationClosure = existsSync(args.afterPostConfirmationClosure) ? readJson(args.afterPostConfirmationClosure) : { closure_readiness_items: [] }
  if (!errors.length) {
    validateTopLevel(packet, exactPacket, afterPostConfirmationClosure, args, errors)
  }

  const exactItems = exactPacket.source_anchor_exact_evidence_items || []
  const pendingRows = pendingClosureRows(afterPostConfirmationClosure)
  validateSourceCoverage(exactItems, pendingRows, errors)
  const exactById = mapBy(exactItems, exactItemId, errors, 'source exact evidence')
  const seenIds = new Set()
  const stats = emptyStats(exactItems, pendingRows)
  for (const group of packet.exact_anchor_group_review_items || []) {
    validateGroup(group, exactById, seenIds, errors, stats)
  }
  for (const id of exactById.keys()) {
    if (!seenIds.has(id)) {
      stats.missing_exact_evidence_items += 1
      errors.push(`${id} missing from exact-anchor group review packet`)
    }
  }
  if (args.requireItems && !stats.group_review_items) {
    errors.push('requireItems is set but no exact-anchor group review items were audited')
  }

  const summary = packet.summary || {}
  for (const key of [
    'exact_anchor_auto_approval_items',
    'expected_pending_closure_items',
    'expected_source_anchor_exact_evidence_items',
    'group_review_items',
    'groups_with_full_h4g_triplet_context',
    'groups_with_multiple_standards',
    'max_rows_per_group',
    'pending_closure_source_anchor_items',
    'ready_for_manual_review_items',
    'source_anchor_exact_evidence_items',
    'text_extracted_items',
    'unique_action_decisions',
    'unique_progression_groups',
    'unique_standard_codes',
    'unique_unit_evidence_ids'
  ]) {
    if (summary[key] !== stats[key]) errors.push(`packet summary.${key} mismatch`)
  }
  for (const key of ['by_grade_band', 'by_group_review_route', 'by_inventory_bucket', 'by_priority_tier', 'by_subject']) {
    if (!sameJson(summary[key] || {}, stats[key] || {})) errors.push(`packet summary.${key} mismatch`)
  }
  if (stats.exact_anchor_auto_approval_items) {
    errors.push(`exact anchor auto approval items must be zero: ${stats.exact_anchor_auto_approval_items}`)
  }
  if (stats.text_extracted_items !== stats.source_anchor_exact_evidence_items) {
    errors.push(`all exact evidence items must be text_extracted: ${stats.text_extracted_items} vs ${stats.source_anchor_exact_evidence_items}`)
  }
  if (stats.ready_for_manual_review_items !== stats.source_anchor_exact_evidence_items) {
    errors.push(`all exact evidence items must be ready for manual review: ${stats.ready_for_manual_review_items} vs ${stats.source_anchor_exact_evidence_items}`)
  }

  return {
    after_post_confirmation_closure: args.afterPostConfirmationClosure,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    errors,
    exact_packet: args.exactPacket,
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
  console.log(JSON.stringify({
    out: args.out,
    summary: payload.summary,
    valid: payload.valid
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
