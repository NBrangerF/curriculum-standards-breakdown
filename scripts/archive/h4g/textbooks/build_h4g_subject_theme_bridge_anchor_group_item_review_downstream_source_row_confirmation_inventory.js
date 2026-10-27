#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_ACTION_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_inventory_anchor_domain_rejected_english_pe.md'

function parseArgs(argv) {
  const args = {
    actionDecisions: DEFAULT_ACTION_DECISIONS,
    batch: DEFAULT_BATCH,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--batch') args.batch = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_inventory.js \\
  --batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_batch_anchor_domain_rejected_english_pe.json \\
  --action-decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a read-only inventory for source-row confirmation rows. It profiles why
these rows are close to confirmation while preserving the manual reviewer gate.
It does not edit decisions, approve bridges, write public/data, or enable
matcher/publication use.`)
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

function truncate(value, max = 90) {
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

function validateInputs(batch, actionDecisions, args, errors) {
  if (batch.valid !== true) errors.push('source-row confirmation batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_batch') {
    errors.push('source-row confirmation batch purpose mismatch')
  }
  if (batch.worklist_only !== true) errors.push('source-row confirmation batch worklist_only must be true')
  validatePolicy('source-row confirmation batch', batch, errors)
  if (!Array.isArray(batch.source_row_confirmation_items)) {
    errors.push('source-row confirmation batch source_row_confirmation_items must be an array')
  }
  if (actionDecisions.valid !== true) errors.push('action decisions valid must be true')
  if (actionDecisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_action_decisions_template') {
    errors.push('action decisions purpose mismatch')
  }
  validatePolicy('action decisions', actionDecisions, errors)
  if (!Array.isArray(actionDecisions.downstream_action_decisions)) {
    errors.push('action decisions downstream_action_decisions must be an array')
  }
  if (args.requireItems && !(batch.source_row_confirmation_items || []).length) {
    errors.push('requireItems is set but source-row confirmation batch has no items')
  }
}

function riskSet(item) {
  return new Set((item.risk_signals || []).map(String))
}

function confirmationProfile(item) {
  const risks = riskSet(item)
  const sharedTopics = [...risks].filter(value => value.startsWith('shared_topic:')).sort()
  const templateConfirmations = item.confirmation_decision_template?.required_confirmations || {}
  const profile = {
    bridge_score: Number(item.bridge_context?.bridge_score || 0),
    has_low_bridge_score: risks.has('low_bridge_score'),
    has_no_broad_fanout_risk_flag: risks.has('no broad/fan-out risk flags in current batch'),
    is_same_standard_grade_anchor_slice: risks.has('same standard+grade+anchor slice'),
    is_single_source_row: risks.has('single source row') && Number(item.source_anchor_review_rows || 0) === 1,
    manual_confirmation_fields_open: Object.entries(templateConfirmations)
      .filter(([key, value]) => value === false && [
        'same_grade_scope_checked',
        'same_subject_scope_checked',
        'source_anchor_matches_target_standard',
        'source_item_reviewed'
      ].includes(key))
      .map(([key]) => key)
      .sort(),
    page_ready: item.bridge_context?.page_ready === true,
    shared_topic_count: sharedTopics.length,
    shared_topics: sharedTopics
  }
  profile.confirmation_strength_score = [
    profile.is_single_source_row,
    profile.is_same_standard_grade_anchor_slice,
    profile.has_no_broad_fanout_risk_flag,
    profile.page_ready
  ].filter(Boolean).length
  profile.residual_risk_score = [
    profile.has_low_bridge_score,
    profile.shared_topic_count > 0,
    profile.manual_confirmation_fields_open.length > 0
  ].filter(Boolean).length
  return profile
}

function confirmationBucket(profile) {
  if (profile.confirmation_strength_score >= 4 && profile.residual_risk_score <= 2) return 'single_source_confirmation_ready_for_manual_review'
  if (profile.confirmation_strength_score >= 3) return 'single_source_confirmation_needs_manual_scope_check'
  return 'source_row_confirmation_not_ready'
}

function recommendedDisposition(profile) {
  if (profile.manual_confirmation_fields_open.length) return 'manual_confirmation_required_before_decision_candidate'
  if (profile.has_low_bridge_score) return 'low_score_requires_exact_anchor_note'
  return 'ready_for_later_candidate_after_reviewer_note'
}

function inventoryPolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_action_decision_must_be_edited_separately: true,
    eligible_for_h4g_differentiation: false,
    inventory_is_not_reviewer_decision: true,
    matcher_ready: false,
    publication_ready: false,
    requires_manual_source_row_confirmation: true,
    requires_later_item_level_source_review: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function buildInventoryRows(batch, actionDecisions, errors) {
  const actionBySourceItem = mapBy(actionDecisions.downstream_action_decisions || [], 'source_downstream_action_item_id', errors, 'action decisions')
  const rows = []
  const seen = new Set()
  for (const item of batch.source_row_confirmation_items || []) {
    const action = actionBySourceItem.get(item.source_row_confirmation_item_id)
    const profile = confirmationProfile(item)
    const sourceStandard = item.standard_context || {}
    const id = `h4g_anchor_group_downstream_source_row_confirmation_inventory_${hashText(item.source_row_confirmation_item_id)}`
    if (seen.has(id)) errors.push(`duplicate inventory_item_id: ${id}`)
    seen.add(id)
    if (!action) errors.push(`${item.source_row_confirmation_item_id} missing action decision source item`)
    rows.push({
      anchor_requirement_summary: item.anchor_requirement?.approval_gate || '',
      anchor_type: item.anchor_type || '',
      bridge_score: profile.bridge_score,
      confirmation_bucket: confirmationBucket(profile),
      confirmation_profile: profile,
      decision_type: 'anchor_group_downstream_source_row_confirmation_inventory_item',
      downstream_action_decision_id: action?.decision_id || '',
      downstream_action_decision_status: action?.decision_status || '',
      downstream_action_reviewer_decision: action?.reviewer_decision || '',
      grade_band: item.grade_band || '',
      inventory_item_id: id,
      inventory_policy: inventoryPolicy(),
      item_review_surface: item.item_review_surface || '',
      page_range: item.bridge_context?.page_range || '',
      page_range_status: item.bridge_context?.page_range_status || '',
      page_ready: item.bridge_context?.page_ready === true,
      parent_decision_id: item.parent_decision_id || '',
      parent_downstream_decision_id: item.downstream_decision_id || '',
      priority_rank: item.priority_rank,
      priority_tier: item.priority_tier || '',
      progression_group_id: item.progression_group_id || '',
      recommended_disposition: recommendedDisposition(profile),
      recommended_reviewer_decision: item.recommended_reviewer_decision || '',
      required_confirmations_to_close: item.required_confirmations_to_close || [],
      review_grain: item.review_grain || '',
      review_questions: item.review_questions || [],
      risk_signals: item.risk_signals || [],
      source_anchor_review_item_ids: item.source_anchor_review_item_ids || [],
      source_batch: item.source_batch || '',
      source_batch_item_id: item.source_batch_item_id || '',
      source_key: item.source_key || '',
      source_row_confirmation_item_id: item.source_row_confirmation_item_id || '',
      source_standard_context: {
        domain: sourceStandard.domain || '',
        legacy_code: sourceStandard.legacy_code || '',
        practice: sourceStandard.practice || '',
        progression_role: sourceStandard.progression_role || '',
        standard: sourceStandard.standard || '',
        subdomain: sourceStandard.subdomain || ''
      },
      standard_code: item.standard_code || '',
      subject_slug: item.subject_slug || '',
      target_standard_code: item.target_standard_code || '',
      topic_tags: {
        shared_topic_tags: sorted(item.bridge_context?.shared_topic_tags || []),
        standard_topic_tags: sorted(item.bridge_context?.standard_topic_tags || []),
        unit_topic_tags: sorted(item.bridge_context?.unit_topic_tags || [])
      },
      unit_context: item.unit_context || {},
      unit_evidence_id: item.unit_context?.unit_evidence_id || '',
      unit_title: item.unit_context?.unit_title || '',
      writes_public_data: false
    })
  }
  return rows
}

function summarize(rows) {
  const summary = {
    by_anchor_type: {},
    by_confirmation_bucket: {},
    by_grade_band: {},
    by_page_range_status: {},
    by_priority_tier: {},
    by_recommended_disposition: {},
    by_subject: {},
    inventory_items: rows.length,
    low_bridge_score_rows: 0,
    manual_confirmation_required_rows: rows.length,
    page_ready_rows: 0,
    single_source_confirmation_ready_rows: 0,
    source_row_confirmation_items: rows.length,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    if (row.confirmation_profile?.has_low_bridge_score) summary.low_bridge_score_rows += 1
    if (row.page_ready) summary.page_ready_rows += 1
    if (row.confirmation_bucket === 'single_source_confirmation_ready_for_manual_review') {
      summary.single_source_confirmation_ready_rows += 1
    }
    countInto(summary.by_anchor_type, row.anchor_type)
    countInto(summary.by_confirmation_bucket, row.confirmation_bucket)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_page_range_status, row.page_range_status)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommended_disposition, row.recommended_disposition)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function previewRows(rows) {
  return rows.map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.anchor_type)} | ${markdownCell(row.confirmation_bucket)} | ${markdownCell(row.standard_code)} | ${truncate(row.unit_title)} |`
  )).join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Downstream Source Row Confirmation Inventory

Generated at: ${payload.generated_at}

This read-only inventory profiles the 7 source-row confirmation rows that are
closest to a later reviewer outcome. It does not write decisions, approve
bridges, write \`public/data\`, change official standard text, or enable
matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| inventory items | ${payload.summary.inventory_items} |
| manual confirmation required rows | ${payload.summary.manual_confirmation_required_rows} |
| single-source confirmation-ready rows | ${payload.summary.single_source_confirmation_ready_rows} |
| page-ready rows | ${payload.summary.page_ready_rows} |
| low bridge score rows | ${payload.summary.low_bridge_score_rows} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Confirmation Buckets

| bucket | rows |
| --- | ---: |
${countRows(payload.summary.by_confirmation_bucket)}

## Recommended Dispositions

| disposition | rows |
| --- | ---: |
${countRows(payload.summary.by_recommended_disposition)}

## Preview

| rank | subject | grade | anchor type | confirmation bucket | standard | unit title |
| ---: | --- | --- | --- | --- | --- | --- |
${previewRows(payload.inventory_items)}

## Guardrails

- Inventory rows are not reviewer decisions.
- All rows still require manual source-row confirmation before any candidate write.
- Item-level source review, matcher, and publication gates remain separate later steps.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of [
    ['source-row confirmation batch', args.batch],
    ['action decisions', args.actionDecisions]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const batch = errors.length ? { source_row_confirmation_items: [] } : readJson(args.batch)
  const actionDecisions = errors.length ? { downstream_action_decisions: [] } : readJson(args.actionDecisions)
  if (!errors.length) validateInputs(batch, actionDecisions, args, errors)
  const rows = buildInventoryRows(batch, actionDecisions, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no inventory rows were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    evidence_inventory_only: true,
    generated_at: new Date().toISOString(),
    inventory_items: rows,
    inventory_policy: inventoryPolicy(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_row_confirmation_inventory',
    source_downstream_action_decisions: args.actionDecisions,
    source_downstream_source_row_confirmation_batch: args.batch,
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
