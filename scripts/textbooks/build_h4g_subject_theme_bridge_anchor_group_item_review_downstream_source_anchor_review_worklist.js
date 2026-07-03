#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_worklist_anchor_domain_rejected_english_pe.md'

function parseArgs(argv) {
  const args = {
    inventory: DEFAULT_INVENTORY,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--inventory') args.inventory = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_worklist.js \\
  --inventory generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a read-only reviewer worklist from downstream source-anchor evidence
inventory rows. It turns source-anchor risk buckets into exact-anchor review
tasks. It does not edit decisions, approve bridges, write public/data, or
enable matcher/publication use.`)
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

function validateInventory(inventory, args, errors) {
  if (inventory.valid !== true) errors.push('inventory valid must be true')
  if (inventory.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_evidence_inventory') {
    errors.push('inventory purpose mismatch')
  }
  if (inventory.evidence_inventory_only !== true) errors.push('inventory evidence_inventory_only must be true')
  if (inventory.source_downstream_source_anchor_evidence_batch && !String(inventory.source_downstream_source_anchor_evidence_batch).includes('downstream_source_anchor_evidence_batch')) {
    errors.push('inventory source_downstream_source_anchor_evidence_batch must point at downstream source-anchor evidence batch')
  }
  validatePolicy('inventory', inventory, errors)
  if (!Array.isArray(inventory.inventory_items)) errors.push('inventory inventory_items must be an array')
  if (args.requireItems && !(inventory.inventory_items || []).length) {
    errors.push('requireItems is set but inventory has no rows')
  }
}

function laneFor(row) {
  if (row.primary_review_bucket === 'multi_source_or_multi_unit_scope_review') {
    return 'source_anchor_unit_or_source_scope_review_lane'
  }
  if (row.primary_review_bucket === 'generic_or_deny_term_anchor_review') {
    return 'source_anchor_generic_or_deny_term_review_lane'
  }
  if (row.primary_review_bucket === 'unit_or_standard_fanout_review') return 'source_anchor_fanout_review_lane'
  if (row.primary_review_bucket === 'low_score_exact_anchor_review') return 'source_anchor_low_score_exact_review_lane'
  if (row.primary_review_bucket === 'single_topic_exact_anchor_review') return 'source_anchor_single_topic_exact_review_lane'
  return 'source_anchor_manual_exact_review_lane'
}

function laneOrder(lane) {
  return {
    source_anchor_unit_or_source_scope_review_lane: 10,
    source_anchor_generic_or_deny_term_review_lane: 20,
    source_anchor_fanout_review_lane: 30,
    source_anchor_low_score_exact_review_lane: 40,
    source_anchor_single_topic_exact_review_lane: 50,
    source_anchor_manual_exact_review_lane: 60
  }[lane] || 90
}

function allowedReviewerOutcomes() {
  return [
    'source_anchor_evidence_found_for_missing_grade',
    'source_anchor_evidence_not_found',
    'source_anchor_scope_not_closed_requires_split',
    'needs_textbook_unit_indexing'
  ]
}

function worklistPolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_action_decision_must_be_edited_separately: true,
    eligible_for_h4g_differentiation: false,
    item_level_decision_must_be_edited_separately: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_item_level_source_review: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    reviewer_worklist_is_not_decision: true,
    writes_public_data: false
  }
}

function reviewChecklist(row) {
  const profile = row.risk_profile || {}
  return uniqueStrings([
    'Review one inventory row at the stated standard+grade+source-batch grain.',
    'Record the exact unit, activity, task, behavior, or page-bounded evidence visible in the source.',
    'Confirm the evidence is same-grade and same-subject before any item-level decision.',
    'Confirm the evidence matches the target anchor type and standard code, not only a shared topic or broad unit title.',
    'Defer or split the item if one review row still mixes multiple source rows, unit evidence ids, or standards.',
    profile.has_multiple_source_rows ? 'Because multiple source rows remain, identify which single source row carries the evidence.' : '',
    profile.has_multiple_unit_evidence_ids ? 'Because multiple unit evidence ids remain, identify which unit evidence id carries the evidence.' : '',
    profile.has_generic_title_deny_term ? 'Because the title contains generic/deny terms, cite exact activity evidence rather than the title.' : '',
    profile.broad_topic_tag_count > 0 ? 'Because broad topic tags are present, reject topic-only support unless exact anchor evidence is visible.' : '',
    profile.has_unit_fanout_risk ? 'Because the unit fans out across standards, explain why this evidence is specific to this standard.' : '',
    profile.has_standard_fanout_risk ? 'Because the standard fans out across units, identify why this unit is the right anchor.' : '',
    profile.has_low_bridge_score ? 'Because bridge score is low, require explicit evidence before any downstream decision.' : ''
  ])
}

function reviewQuestions(row) {
  return uniqueStrings([
    ...(row.review_questions || []),
    `Does ${row.unit_title || 'this unit'} show exact source-anchor evidence for ${row.target_standard_code || row.standard_code || ''}?`,
    'Which exact page-bounded evidence supports or rejects this standard+grade source anchor?',
    'Is this evidence specific enough to distinguish H4G7/H4G8/H4G9, or does it remain shared H4G source text?',
    'Should this item be marked evidence found, evidence not found, scope-not-closed, or still needing unit indexing?'
  ])
}

function workItemId(row) {
  return `h4g_anchor_group_downstream_source_anchor_review_${hashText(row.inventory_item_id)}`
}

function buildRows(inventory) {
  return (inventory.inventory_items || []).map(row => {
    const lane = laneFor(row)
    return {
      allowed_reviewer_outcomes: allowedReviewerOutcomes(),
      anchor_requirement_summary: row.anchor_requirement_summary || '',
      anchor_type: row.anchor_type || '',
      downstream_action_decision_id: row.downstream_action_decision_id || '',
      grade_band: row.grade_band || '',
      inventory_item_id: row.inventory_item_id || '',
      item_review_surface: row.item_review_surface || '',
      lane_order: laneOrder(lane),
      manual_review_required: true,
      page_range: row.page_range || '',
      page_range_status: row.page_range_status || '',
      parent_decision_id: row.parent_decision_id || '',
      parent_downstream_decision_id: row.parent_downstream_decision_id || '',
      primary_review_bucket: row.primary_review_bucket || '',
      priority_rank: row.priority_rank,
      priority_tier: row.priority_tier || '',
      progression_group_id: row.progression_group_id || '',
      recommended_disposition: row.recommended_disposition || '',
      required_confirmations_to_close: row.required_confirmations_to_close || [],
      review_checklist: reviewChecklist(row),
      review_grain: row.review_grain || '',
      review_lane: lane,
      review_questions: reviewQuestions(row),
      risk_profile: row.risk_profile || {},
      risk_signals: row.risk_signals || [],
      source_anchor_evidence_item_id: row.source_anchor_evidence_item_id || '',
      source_anchor_review_item_ids: row.source_anchor_review_item_ids || [],
      source_batch: row.source_batch || '',
      source_batch_item_id: row.source_batch_item_id || '',
      source_key: row.source_key || '',
      source_standard_context: row.source_standard_context || {},
      standard_code: row.standard_code || '',
      subject_slug: row.subject_slug || '',
      target_standard_code: row.target_standard_code || row.standard_code || '',
      topic_tags: row.topic_tags || [],
      unit_context: row.unit_context || {},
      unit_evidence_id: row.unit_evidence_id || '',
      unit_title: row.unit_title || '',
      work_item_id: workItemId(row),
      worklist_policy: worklistPolicy(),
      worklist_only: true,
      writes_public_data: false
    }
  }).sort((a, b) => Number(a.lane_order || 0) - Number(b.lane_order || 0) ||
    Number(a.priority_rank || 0) - Number(b.priority_rank || 0) ||
    String(a.subject_slug || '').localeCompare(String(b.subject_slug || '')) ||
    String(a.standard_code || '').localeCompare(String(b.standard_code || '')) ||
    String(a.unit_evidence_id || '').localeCompare(String(b.unit_evidence_id || '')))
}

function summarize(rows) {
  const summary = {
    by_anchor_type: {},
    by_grade_band: {},
    by_primary_review_bucket: {},
    by_priority_tier: {},
    by_recommended_disposition: {},
    by_review_lane: {},
    by_source_batch: {},
    by_subject: {},
    by_target_standard_code: {},
    fanout_review_rows: 0,
    generic_or_deny_term_review_rows: 0,
    high_risk_rows: 0,
    manual_review_required_rows: 0,
    source_anchor_review_work_items: rows.length,
    unit_or_source_scope_review_rows: 0,
    unique_downstream_action_decisions: sorted(rows.map(row => row.downstream_action_decision_id)).length,
    unique_inventory_items: sorted(rows.map(row => row.inventory_item_id)).length,
    unique_parent_downstream_decisions: sorted(rows.map(row => row.parent_downstream_decision_id)).length,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    if (row.manual_review_required) summary.manual_review_required_rows += 1
    if (row.review_lane === 'source_anchor_unit_or_source_scope_review_lane') summary.unit_or_source_scope_review_rows += 1
    if (row.review_lane === 'source_anchor_generic_or_deny_term_review_lane') summary.generic_or_deny_term_review_rows += 1
    if (row.review_lane === 'source_anchor_fanout_review_lane') summary.fanout_review_rows += 1
    if (row.manual_review_required) summary.high_risk_rows += 1
    countInto(summary.by_anchor_type, row.anchor_type)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_primary_review_bucket, row.primary_review_bucket)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommended_disposition, row.recommended_disposition)
    countInto(summary.by_review_lane, row.review_lane)
    countInto(summary.by_source_batch, row.source_batch)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_standard_code, row.target_standard_code || row.standard_code)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.lane_order} | ${row.priority_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.review_lane)} | ${markdownCell(row.primary_review_bucket)} | ${truncate(row.unit_title)} |`
  )).join('\n') || '| - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Downstream Source-Anchor Review Worklist

Generated at: ${payload.generated_at}

This read-only worklist turns downstream source-anchor evidence inventory rows
into exact-anchor reviewer tasks. It does not edit downstream action decisions,
approve bridges, write \`public/data\`, change official standard text, or
enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| work items | ${payload.summary.source_anchor_review_work_items} |
| manual review required rows | ${payload.summary.manual_review_required_rows} |
| unit/source scope review rows | ${payload.summary.unit_or_source_scope_review_rows} |
| generic or deny-term review rows | ${payload.summary.generic_or_deny_term_review_rows} |
| fanout review rows | ${payload.summary.fanout_review_rows} |
| unique standard codes | ${payload.summary.unique_standard_codes} |
| unique progression groups | ${payload.summary.unique_progression_groups} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Review Lanes

| lane | rows |
| --- | ---: |
${countRows(payload.summary.by_review_lane)}

## Review Buckets

| bucket | rows |
| --- | ---: |
${countRows(payload.summary.by_primary_review_bucket)}

## Preview

| lane order | rank | subject | grade | standard | lane | bucket | unit title |
| ---: | ---: | --- | --- | --- | --- | --- | --- |
${previewRows(payload.downstream_source_anchor_review_work_items)}

## Guardrails

- Worklist rows are not reviewer decisions.
- Downstream action and item-level source review decisions must be edited separately.
- Public data, official standard text, matcher, and publication remain disabled.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  if (!existsSync(args.inventory)) errors.push(`Missing inventory: ${args.inventory}`)
  const inventory = errors.length ? { inventory_items: [] } : readJson(args.inventory)
  if (!errors.length) validateInventory(inventory, args, errors)
  const rows = buildRows(inventory)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no review work items were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    downstream_source_anchor_review_work_items: rows,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_worklist',
    source_downstream_source_anchor_evidence_inventory: args.inventory,
    summary: summarize(rows),
    valid: errors.length === 0,
    worklist_only: true,
    worklist_policy: worklistPolicy(),
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
