#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_ACTION_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe_audit.md'

function parseArgs(argv) {
  const args = {
    actionDecisions: DEFAULT_ACTION_DECISIONS,
    batch: DEFAULT_BATCH,
    inventory: DEFAULT_INVENTORY,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--inventory') args.inventory = argv[++i]
    else if (item === '--batch') args.batch = argv[++i]
    else if (item === '--action-decisions') args.actionDecisions = argv[++i]
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
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory.js \\
  --inventory generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.json \\
  --batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.json \\
  --action-decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Audits the read-only downstream source-anchor evidence inventory against the
168-row source-anchor evidence batch and downstream action decisions template.`)
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

function validateInputs(inventory, batch, actionDecisions, args, errors) {
  if (inventory.valid !== true) errors.push('inventory valid must be true')
  if ((inventory.errors || []).length) errors.push('inventory errors must be empty')
  if (inventory.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory') {
    errors.push('inventory purpose mismatch')
  }
  if (inventory.evidence_inventory_only !== true) errors.push('inventory evidence_inventory_only must be true')
  if (inventory.source_downstream_source_anchor_evidence_batch !== args.batch) {
    errors.push('inventory source_downstream_source_anchor_evidence_batch must match audit arg')
  }
  if (inventory.source_downstream_action_decisions !== args.actionDecisions) {
    errors.push('inventory source_downstream_action_decisions must match audit arg')
  }
  validatePolicy('inventory', inventory, errors)
  validateInventoryPolicy('inventory inventory_policy', inventory.inventory_policy || {}, errors)
  if (!Array.isArray(inventory.inventory_items)) errors.push('inventory inventory_items must be an array')

  if (batch.valid !== true) errors.push('source-anchor evidence batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch') {
    errors.push('source-anchor evidence batch purpose mismatch')
  }
  if (batch.worklist_only !== true) errors.push('source-anchor evidence batch worklist_only must be true')
  validatePolicy('source-anchor evidence batch', batch, errors)
  if (!Array.isArray(batch.source_anchor_evidence_items)) {
    errors.push('source-anchor evidence batch source_anchor_evidence_items must be an array')
  }

  if (actionDecisions.valid !== true) errors.push('action decisions valid must be true')
  if (actionDecisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('action decisions purpose mismatch')
  }
  validatePolicy('action decisions', actionDecisions, errors)
  if (!Array.isArray(actionDecisions.downstream_action_decisions)) {
    errors.push('action decisions downstream_action_decisions must be an array')
  }
}

function riskSet(item) {
  return new Set((item.risk_signals || []).map(String))
}

function expectedRiskProfile(item) {
  const risks = riskSet(item)
  const denyTerms = [...risks].filter(value => value.startsWith('deny_term_in_unit_title:')).sort()
  const broadTopicTags = [...risks].filter(value => value.startsWith('broad_topic_tag:')).sort()
  const sharedTopics = [...risks].filter(value => value.startsWith('shared_topic:')).sort()
  const profile = {
    bridge_score: Number(item.bridge_context?.bridge_score || 0),
    broad_topic_tag_count: broadTopicTags.length,
    deny_term_count: denyTerms.length,
    deny_terms: denyTerms,
    has_generic_title_deny_term: denyTerms.length > 0,
    has_low_bridge_score: risks.has('low_bridge_score'),
    has_multiple_source_rows: risks.has('multiple source rows remain inside one bounded slice'),
    has_multiple_unit_evidence_ids: risks.has('multiple unit evidence ids require unit-scoped review'),
    has_single_shared_topic_tag: risks.has('single_shared_topic_tag'),
    has_standard_fanout_risk: risks.has('standard_has_many_bridge_candidates'),
    has_unit_fanout_risk: risks.has('unit_overmatches_many_standards'),
    shared_topic_count: sharedTopics.length,
    shared_topics: sharedTopics
  }
  profile.risk_score = [
    profile.has_low_bridge_score,
    profile.has_multiple_source_rows,
    profile.has_multiple_unit_evidence_ids,
    profile.has_unit_fanout_risk,
    profile.has_standard_fanout_risk,
    profile.has_single_shared_topic_tag
  ].filter(Boolean).length + profile.deny_term_count + profile.broad_topic_tag_count
  return profile
}

function expectedBucket(profile) {
  if (profile.has_generic_title_deny_term || profile.broad_topic_tag_count > 0) return 'generic_or_deny_term_anchor_review'
  if (profile.has_multiple_source_rows || profile.has_multiple_unit_evidence_ids) return 'multi_source_or_multi_unit_scope_review'
  if (profile.has_unit_fanout_risk || profile.has_standard_fanout_risk) return 'unit_or_standard_fanout_review'
  if (profile.has_low_bridge_score) return 'low_score_exact_anchor_review'
  if (profile.has_single_shared_topic_tag) return 'single_topic_exact_anchor_review'
  return 'manual_exact_anchor_review_required'
}

function expectedDisposition(profile) {
  if (profile.has_generic_title_deny_term) return 'likely_overbroad_requires_reviewer_confirmation'
  if (profile.broad_topic_tag_count > 0 || profile.has_single_shared_topic_tag) return 'topic_only_risk_requires_exact_anchor_evidence'
  if (profile.has_multiple_source_rows || profile.has_multiple_unit_evidence_ids) return 'scope_not_closed_requires_unit_or_source_row_confirmation'
  return 'exact_anchor_evidence_not_yet_verified'
}

function validateInventoryPolicy(label, policy, errors) {
  for (const key of [
    'downstream_action_decision_must_be_edited_separately',
    'inventory_is_not_reviewer_decision',
    'requires_manual_source_anchor_review',
    'requires_later_item_level_source_review',
    'requires_later_matcher_gate',
    'requires_later_publication_gate'
  ]) {
    if (policy[key] !== true) errors.push(`${label}.${key} must be true`)
  }
  validatePolicy(label, policy, errors)
}

function expectedInventoryId(item) {
  return `h4g_anchor_group_downstream_source_anchor_evidence_inventory_${hashText(item.source_anchor_evidence_item_id)}`
}

function validateRow(item, row, action, errors, stats) {
  const prefix = row.inventory_item_id || item.source_anchor_evidence_item_id || '(missing inventory item)'
  const profile = expectedRiskProfile(item)
  if (row.inventory_item_id !== expectedInventoryId(item)) errors.push(`${prefix} inventory_item_id mismatch`)
  if (row.source_anchor_evidence_item_id !== item.source_anchor_evidence_item_id) {
    errors.push(`${prefix} source_anchor_evidence_item_id mismatch`)
  }
  if (row.downstream_action_decision_id !== action?.decision_id) errors.push(`${prefix} downstream_action_decision_id mismatch`)
  if (row.parent_downstream_decision_id !== item.downstream_decision_id) errors.push(`${prefix} parent_downstream_decision_id mismatch`)
  for (const key of [
    'subject_slug',
    'grade_band',
    'standard_code',
    'anchor_type',
    'source_batch',
    'source_batch_item_id',
    'source_key',
    'unit_evidence_id',
    'unit_title',
    'progression_group_id',
    'priority_tier',
    'item_review_surface',
    'review_grain'
  ]) {
    if (row[key] !== item[key]) errors.push(`${prefix} ${key} mismatch`)
  }
  if (row.page_ready !== (item.page_ready === true)) errors.push(`${prefix} page_ready mismatch`)
  if (row.recommended_reviewer_decision !== item.recommended_reviewer_decision) {
    errors.push(`${prefix} recommended_reviewer_decision mismatch`)
  }
  if (row.downstream_action_reviewer_decision !== 'pending') {
    errors.push(`${prefix} downstream_action_reviewer_decision must remain pending`)
  }
  if (row.downstream_action_decision_status !== 'pending_review') {
    errors.push(`${prefix} downstream_action_decision_status must remain pending_review`)
  }
  if (!sameJson(row.risk_profile || {}, profile)) errors.push(`${prefix} risk_profile mismatch`)
  if (!sameJson(row.risk_signals || [], item.risk_signals || [])) errors.push(`${prefix} risk_signals mismatch`)
  if (row.primary_review_bucket !== expectedBucket(profile)) errors.push(`${prefix} primary_review_bucket mismatch`)
  if (row.recommended_disposition !== expectedDisposition(profile)) errors.push(`${prefix} recommended_disposition mismatch`)
  if (!sameJson(row.topic_tags?.shared_topic_tags || [], sorted(item.bridge_context?.shared_topic_tags || []))) {
    errors.push(`${prefix} shared_topic_tags mismatch`)
  }
  if (!sameJson(row.topic_tags?.standard_topic_tags || [], sorted(item.bridge_context?.standard_topic_tags || []))) {
    errors.push(`${prefix} standard_topic_tags mismatch`)
  }
  if (!sameJson(row.topic_tags?.unit_topic_tags || [], sorted(item.bridge_context?.unit_topic_tags || []))) {
    errors.push(`${prefix} unit_topic_tags mismatch`)
  }
  if (row.writes_public_data !== false) errors.push(`${prefix} writes_public_data must be false`)
  validateInventoryPolicy(`${prefix} inventory_policy`, row.inventory_policy || {}, errors)
  stats.audited_inventory_items += 1
  if (profile.has_low_bridge_score) stats.low_bridge_score_rows += 1
  if (profile.has_generic_title_deny_term || Number(profile.broad_topic_tag_count || 0) > 0) {
    stats.generic_or_deny_term_rows += 1
  }
  if (Number(profile.risk_score || 0) >= 3) stats.high_risk_rows += 1
}

function summarize(rows) {
  const stats = {
    audited_inventory_items: 0,
    by_anchor_type: {},
    by_grade_band: {},
    by_primary_review_bucket: {},
    by_recommended_disposition: {},
    by_source_batch: {},
    by_subject: {},
    expected_inventory_items: 0,
    extra_inventory_items: 0,
    generic_or_deny_term_rows: 0,
    high_risk_rows: 0,
    inventory_items: rows.length,
    low_bridge_score_rows: 0,
    missing_inventory_items: 0
  }
  for (const row of rows) {
    countInto(stats.by_anchor_type, row.anchor_type)
    countInto(stats.by_grade_band, row.grade_band)
    countInto(stats.by_primary_review_bucket, row.primary_review_bucket)
    countInto(stats.by_recommended_disposition, row.recommended_disposition)
    countInto(stats.by_source_batch, row.source_batch)
    countInto(stats.by_subject, row.subject_slug)
  }
  return stats
}

function validateSummary(inventory, stats, errors) {
  const summary = inventory.summary || {}
  const checks = [
    ['inventory_items', stats.inventory_items],
    ['source_anchor_evidence_items', stats.expected_inventory_items],
    ['low_bridge_score_rows', stats.low_bridge_score_rows],
    ['generic_or_deny_term_rows', stats.generic_or_deny_term_rows],
    ['high_risk_rows', stats.high_risk_rows],
    ['manual_review_required_rows', stats.expected_inventory_items]
  ]
  for (const [field, expected] of checks) {
    if (Number(summary[field] || 0) !== Number(expected || 0)) {
      errors.push(`inventory summary.${field} must be ${expected}`)
    }
  }
}

function markdownSummary(payload) {
  return `# H4G Downstream Source-Anchor Evidence Inventory Audit

Generated at: ${payload.generated_at}

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| expected inventory items | ${payload.summary.expected_inventory_items} |
| audited inventory items | ${payload.summary.audited_inventory_items} |
| missing inventory items | ${payload.summary.missing_inventory_items} |
| extra inventory items | ${payload.summary.extra_inventory_items} |
| low bridge score rows | ${payload.summary.low_bridge_score_rows} |
| generic or deny-term rows | ${payload.summary.generic_or_deny_term_rows} |
| high risk rows | ${payload.summary.high_risk_rows} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Review Buckets

| bucket | rows |
| --- | ---: |
${countRows(payload.summary.by_primary_review_bucket)}

## Dispositions

| disposition | rows |
| --- | ---: |
${countRows(payload.summary.by_recommended_disposition)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  for (const [label, path] of [
    ['inventory', args.inventory],
    ['source-anchor evidence batch', args.batch],
    ['action decisions', args.actionDecisions]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const inventory = existsSync(args.inventory) ? readJson(args.inventory) : { inventory_items: [] }
  const batch = existsSync(args.batch) ? readJson(args.batch) : { source_anchor_evidence_items: [] }
  const actionDecisions = existsSync(args.actionDecisions) ? readJson(args.actionDecisions) : { downstream_action_decisions: [] }
  if (!errors.length) validateInputs(inventory, batch, actionDecisions, args, errors)

  const inventoryBySourceItem = mapBy(inventory.inventory_items || [], 'source_anchor_evidence_item_id', errors, 'inventory')
  const batchBySourceItem = mapBy(batch.source_anchor_evidence_items || [], 'source_anchor_evidence_item_id', errors, 'batch')
  const actionBySourceItem = mapBy(actionDecisions.downstream_action_decisions || [], 'source_downstream_action_item_id', errors, 'action decisions')
  const stats = summarize(inventory.inventory_items || [])
  stats.expected_inventory_items = (batch.source_anchor_evidence_items || []).length

  if ((inventory.inventory_items || []).length !== (batch.source_anchor_evidence_items || []).length) {
    errors.push(`inventory rows ${(inventory.inventory_items || []).length} must match source batch rows ${(batch.source_anchor_evidence_items || []).length}`)
  }

  for (const [sourceItemId, item] of batchBySourceItem.entries()) {
    const row = inventoryBySourceItem.get(sourceItemId)
    const action = actionBySourceItem.get(sourceItemId)
    if (!row) {
      stats.missing_inventory_items += 1
      errors.push(`${sourceItemId} missing inventory item`)
      continue
    }
    if (!action) {
      errors.push(`${sourceItemId} missing action decision`)
      continue
    }
    validateRow(item, row, action, errors, stats)
  }

  for (const sourceItemId of inventoryBySourceItem.keys()) {
    if (!batchBySourceItem.has(sourceItemId)) {
      stats.extra_inventory_items += 1
      errors.push(`${sourceItemId} unexpected inventory item`)
    }
  }

  if (args.requireItems && !stats.audited_inventory_items) {
    errors.push('requireItems is set but no inventory rows were audited')
  }
  if (stats.audited_inventory_items !== stats.expected_inventory_items) {
    errors.push(`audited inventory items ${stats.audited_inventory_items} must match expected ${stats.expected_inventory_items}`)
  }
  validateSummary(inventory, stats, errors)

  return {
    action_decisions: args.actionDecisions,
    batch: args.batch,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    inventory: args.inventory,
    matcher_ready: false,
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
