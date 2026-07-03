#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_ACTION_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.md'

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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory.js \\
  --batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.json \\
  --action-decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_action_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a read-only source-anchor evidence inventory for the 168 downstream
source-anchor evidence rows. It profiles risk and review buckets only; it does
not edit decisions, approve bridges, write public/data, or enable matcher or
publication use.`)
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
  if (args.requireItems && !(batch.source_anchor_evidence_items || []).length) {
    errors.push('requireItems is set but source-anchor evidence batch has no items')
  }
}

function riskSet(item) {
  return new Set((item.risk_signals || []).map(String))
}

function riskProfile(item) {
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

function primaryReviewBucket(profile) {
  if (profile.has_generic_title_deny_term || profile.broad_topic_tag_count > 0) return 'generic_or_deny_term_anchor_review'
  if (profile.has_multiple_source_rows || profile.has_multiple_unit_evidence_ids) return 'multi_source_or_multi_unit_scope_review'
  if (profile.has_unit_fanout_risk || profile.has_standard_fanout_risk) return 'unit_or_standard_fanout_review'
  if (profile.has_low_bridge_score) return 'low_score_exact_anchor_review'
  if (profile.has_single_shared_topic_tag) return 'single_topic_exact_anchor_review'
  return 'manual_exact_anchor_review_required'
}

function reviewDisposition(profile) {
  if (profile.has_generic_title_deny_term) return 'likely_overbroad_requires_reviewer_confirmation'
  if (profile.broad_topic_tag_count > 0 || profile.has_single_shared_topic_tag) return 'topic_only_risk_requires_exact_anchor_evidence'
  if (profile.has_multiple_source_rows || profile.has_multiple_unit_evidence_ids) return 'scope_not_closed_requires_unit_or_source_row_confirmation'
  return 'exact_anchor_evidence_not_yet_verified'
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
    requires_manual_source_anchor_review: true,
    requires_later_item_level_source_review: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function buildInventoryRows(batch, actionDecisions, errors) {
  const actionBySourceItemId = mapBy(actionDecisions.downstream_action_decisions || [], 'source_downstream_action_item_id', errors, 'action decisions')
  const rows = []
  const seen = new Set()
  for (const item of batch.source_anchor_evidence_items || []) {
    const action = actionBySourceItemId.get(item.source_anchor_evidence_item_id)
    const profile = riskProfile(item)
    const sourceStandard = item.standard_context || {}
    const id = `h4g_anchor_group_downstream_source_anchor_evidence_inventory_${hashText(item.source_anchor_evidence_item_id)}`
    if (seen.has(id)) errors.push(`duplicate inventory_item_id: ${id}`)
    seen.add(id)
    if (!action) errors.push(`${item.source_anchor_evidence_item_id} missing action decision source item`)
    rows.push({
      anchor_requirement_summary: item.anchor_requirement?.approval_gate || '',
      anchor_type: item.anchor_type || '',
      bridge_score: profile.bridge_score,
      decision_type: 'anchor_group_downstream_source_anchor_evidence_inventory_item',
      downstream_action_decision_id: action?.decision_id || '',
      downstream_action_decision_status: action?.decision_status || '',
      downstream_action_reviewer_decision: action?.reviewer_decision || '',
      grade_band: item.grade_band || '',
      inventory_item_id: id,
      inventory_policy: inventoryPolicy(),
      item_review_surface: item.item_review_surface || '',
      page_range: item.page_range || '',
      page_range_status: item.page_range_status || '',
      page_ready: item.page_ready === true,
      parent_decision_id: item.parent_decision_id || '',
      parent_downstream_decision_id: item.downstream_decision_id || '',
      primary_review_bucket: primaryReviewBucket(profile),
      priority_rank: item.priority_rank,
      priority_tier: item.priority_tier || '',
      progression_group_id: item.progression_group_id || '',
      recommended_disposition: reviewDisposition(profile),
      recommended_reviewer_decision: item.recommended_reviewer_decision || '',
      required_confirmations_to_close: item.required_confirmations_to_close || [],
      review_grain: item.review_grain || '',
      review_questions: uniqueStrings(item.review_questions || []),
      risk_profile: profile,
      risk_signals: item.risk_signals || [],
      source_anchor_evidence_item_id: item.source_anchor_evidence_item_id || '',
      source_anchor_review_item_ids: item.source_anchor_review_item_ids || [],
      source_batch: item.source_batch || '',
      source_batch_item_id: item.source_batch_item_id || '',
      source_key: item.source_key || '',
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
      unit_evidence_id: item.unit_evidence_id || '',
      unit_title: item.unit_title || '',
      writes_public_data: false
    })
  }
  return rows
}

function summarize(rows) {
  const summary = {
    by_anchor_type: {},
    by_grade_band: {},
    by_primary_review_bucket: {},
    by_priority_tier: {},
    by_recommended_disposition: {},
    by_source_batch: {},
    by_subject: {},
    generic_or_deny_term_rows: 0,
    high_risk_rows: 0,
    inventory_items: rows.length,
    low_bridge_score_rows: 0,
    manual_review_required_rows: rows.length,
    source_anchor_evidence_items: rows.length,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    const profile = row.risk_profile || {}
    if (profile.has_low_bridge_score) summary.low_bridge_score_rows += 1
    if (profile.has_generic_title_deny_term || Number(profile.broad_topic_tag_count || 0) > 0) {
      summary.generic_or_deny_term_rows += 1
    }
    if (Number(profile.risk_score || 0) >= 3) summary.high_risk_rows += 1
    countInto(summary.by_anchor_type, row.anchor_type)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_primary_review_bucket, row.primary_review_bucket)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommended_disposition, row.recommended_disposition)
    countInto(summary.by_source_batch, row.source_batch)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.anchor_type)} | ${markdownCell(row.primary_review_bucket)} | ${markdownCell(row.standard_code)} | ${truncate(row.unit_title)} |`
  )).join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Downstream Source-Anchor Evidence Inventory

Generated at: ${payload.generated_at}

This read-only inventory profiles the 168 downstream source-anchor evidence
rows before any reviewer outcome is written. It summarizes exact-anchor review
risk only; it does not edit decisions, approve bridges, write \`public/data\`,
change official standard text, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| inventory items | ${payload.summary.inventory_items} |
| manual review required rows | ${payload.summary.manual_review_required_rows} |
| low bridge score rows | ${payload.summary.low_bridge_score_rows} |
| generic or deny-term rows | ${payload.summary.generic_or_deny_term_rows} |
| high risk rows | ${payload.summary.high_risk_rows} |
| unique progression groups | ${payload.summary.unique_progression_groups} |
| unique standard codes | ${payload.summary.unique_standard_codes} |
| unique unit evidence ids | ${payload.summary.unique_unit_evidence_ids} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Review Buckets

| bucket | rows |
| --- | ---: |
${countRows(payload.summary.by_primary_review_bucket)}

## Recommended Dispositions

| disposition | rows |
| --- | ---: |
${countRows(payload.summary.by_recommended_disposition)}

## Grade Bands

| grade band | rows |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Preview

| rank | subject | grade | anchor type | review bucket | standard | unit title |
| ---: | --- | --- | --- | --- | --- | --- |
${previewRows(payload.inventory_items)}

## Guardrails

- Inventory rows are not reviewer decisions.
- Every row still requires manual source-anchor review before any item-level source review gate.
- Matcher and publication gates remain disabled.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of [
    ['source-anchor evidence batch', args.batch],
    ['action decisions', args.actionDecisions]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const batch = errors.length ? { source_anchor_evidence_items: [] } : readJson(args.batch)
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
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory',
    source_downstream_action_decisions: args.actionDecisions,
    source_downstream_source_anchor_evidence_batch: args.batch,
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
