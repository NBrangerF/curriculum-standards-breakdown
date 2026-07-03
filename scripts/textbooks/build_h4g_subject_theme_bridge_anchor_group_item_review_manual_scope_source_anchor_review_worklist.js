#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_INVENTORY = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_worklist_anchor_domain_rejected_english_pe.md'

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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_worklist.js \\
  --inventory generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a read-only reviewer worklist from manual-scope source-anchor inventory
rows. It turns risk buckets into exact-anchor review tasks. It does not edit
decisions, approve bridges, write public/data, or enable matcher/publication
use.`)
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
  if (inventory.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_inventory') {
    errors.push('inventory purpose mismatch')
  }
  if (inventory.evidence_inventory_only !== true) errors.push('inventory evidence_inventory_only must be true')
  validatePolicy('inventory', inventory, errors)
  if (!Array.isArray(inventory.inventory_items)) errors.push('inventory inventory_items must be an array')
  if (args.requireItems && !(inventory.inventory_items || []).length) {
    errors.push('requireItems is set but inventory has no rows')
  }
}

function laneFor(row) {
  if (row.primary_review_bucket === 'generic_or_broad_title_exact_anchor_review') {
    return 'generic_title_exact_activity_review_lane'
  }
  if (row.primary_review_bucket === 'unit_or_title_fanout_exact_anchor_review') {
    return 'unit_fanout_target_specific_review_lane'
  }
  if (row.primary_review_bucket === 'source_target_identical_text_grade_specific_review') {
    return 'shared_standard_text_grade_specific_review_lane'
  }
  if (row.primary_review_bucket === 'non_unit_level_grain_review') return 'non_unit_grain_review_lane'
  if (row.primary_review_bucket === 'toc_start_only_page_boundary_review') return 'page_boundary_review_lane'
  return 'manual_exact_anchor_review_lane'
}

function laneOrder(lane) {
  return {
    generic_title_exact_activity_review_lane: 10,
    unit_fanout_target_specific_review_lane: 20,
    shared_standard_text_grade_specific_review_lane: 30,
    non_unit_grain_review_lane: 40,
    page_boundary_review_lane: 50,
    manual_exact_anchor_review_lane: 60
  }[lane] || 90
}

function reviewChecklist(row) {
  const profile = row.risk_profile || {}
  return uniqueStrings([
    'Record the exact learner activity, task, or page-bounded evidence visible in the unit.',
    'Confirm the evidence matches the target standard code and target grade, not only the shared H4G progression text.',
    'Confirm the evidence is same-grade and same-subject.',
    'Reject or defer if the unit title alone is the only evidence.',
    profile.has_generic_or_broad_title ? 'Because the unit title is broad or generic, cite the exact activity inside the unit rather than the title.' : '',
    profile.has_reused_unit_across_target_standards ? 'Because this unit fans out across target standards, explain why the evidence is specific to this target standard.' : '',
    profile.has_source_target_standard_text_identical ? 'Because source and target standard text are identical, identify the grade-specific anchor that distinguishes this H4G target.' : '',
    profile.has_non_unit_level_grain ? 'Because the source grain is not a normal unit, confirm the reviewed source section is bounded enough.' : '',
    profile.has_page_start_only_boundary ? 'Because the page range is start-only, confirm the page boundary before accepting evidence.' : ''
  ])
}

function allowedReviewerOutcomes() {
  return [
    'source_anchor_evidence_found_for_missing_grade',
    'source_anchor_evidence_not_found',
    'needs_textbook_unit_indexing'
  ]
}

function worklistPolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    item_review_decision_must_be_edited_separately: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_item_level_source_review: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    reviewer_worklist_is_not_decision: true,
    writes_public_data: false
  }
}

function workItemId(row) {
  return `h4g_anchor_group_manual_scope_source_anchor_review_${hashText(row.inventory_item_id)}`
}

function buildRows(inventory) {
  return (inventory.inventory_items || []).map(row => {
    const lane = laneFor(row)
    return {
      allowed_reviewer_outcomes: allowedReviewerOutcomes(),
      anchor_type: row.anchor_type || '',
      evidence_url: row.unit_context?.evidence_url || '',
      grade_band: row.grade_band || '',
      inventory_item_id: row.inventory_item_id || '',
      item_review_decision_id: row.item_review_decision_id || '',
      lane_order: laneOrder(lane),
      manual_review_required: true,
      manual_scope_source_anchor_evidence_item_id: row.manual_scope_source_anchor_evidence_item_id || '',
      page_range: row.page_range || '',
      page_range_status: row.page_range_status || '',
      parent_downstream_decision_id: row.parent_downstream_decision_id || '',
      priority_rank: row.priority_rank,
      priority_tier: row.priority_tier || '',
      recommended_disposition: row.recommended_disposition || '',
      repository_path: row.unit_context?.repository_path || '',
      review_checklist: reviewChecklist(row),
      review_lane: lane,
      review_questions: uniqueStrings([
        `Does ${row.unit_title || 'this unit'} show exact source-anchor evidence for ${row.target_standard_code || ''}?`,
        'What exact activity, task, wording, or content proves the target standard?',
        'Why is this evidence specific to the target grade and target standard rather than only the shared H4G text?',
        'Should this item be marked evidence found, evidence not found, or still needing unit indexing?'
      ]),
      risk_profile: row.risk_profile || {},
      risk_signals: row.risk_signals || [],
      source_item_standard_code: row.source_item_standard_code || '',
      source_key: row.source_key || '',
      source_standard_summary: row.source_standard_summary || {},
      subject_slug: row.subject_slug || '',
      target_grade_band: row.target_grade_band || row.grade_band || '',
      target_standard_code: row.target_standard_code || '',
      target_standard_summary: row.target_standard_summary || {},
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
    String(a.target_standard_code || '').localeCompare(String(b.target_standard_code || '')) ||
    String(a.unit_evidence_id || '').localeCompare(String(b.unit_evidence_id || '')))
}

function summarize(rows) {
  const summary = {
    by_grade_band: {},
    by_priority_tier: {},
    by_recommended_disposition: {},
    by_review_lane: {},
    by_subject: {},
    by_target_standard_code: {},
    generic_title_review_rows: 0,
    high_risk_rows: 0,
    manual_review_required_rows: 0,
    source_anchor_review_work_items: rows.length,
    unique_item_review_decisions: sorted(rows.map(row => row.item_review_decision_id)).length,
    unique_inventory_items: sorted(rows.map(row => row.inventory_item_id)).length,
    unique_target_standard_codes: sorted(rows.map(row => row.target_standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length,
    unit_fanout_review_rows: 0
  }
  for (const row of rows) {
    if (row.manual_review_required) summary.manual_review_required_rows += 1
    if (row.review_lane === 'generic_title_exact_activity_review_lane') summary.generic_title_review_rows += 1
    if (row.review_lane === 'unit_fanout_target_specific_review_lane') summary.unit_fanout_review_rows += 1
    if (Number(row.risk_profile?.risk_score || 0) >= 4) summary.high_risk_rows += 1
    countInto(summary.by_grade_band, row.target_grade_band || row.grade_band)
    countInto(summary.by_priority_tier, row.priority_tier)
    countInto(summary.by_recommended_disposition, row.recommended_disposition)
    countInto(summary.by_review_lane, row.review_lane)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_standard_code, row.target_standard_code)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.lane_order} | ${row.priority_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.target_grade_band)} | ${markdownCell(row.target_standard_code)} | ${markdownCell(row.review_lane)} | ${markdownCell(row.unit_evidence_id)} | ${truncate(row.unit_title)} |`
  )).join('\n') || '| - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Manual Scope Source-Anchor Review Worklist

Generated at: ${payload.generated_at}

This read-only worklist turns manual-scope source-anchor risk inventory rows
into exact-anchor reviewer tasks. It does not edit item decisions, approve
bridges, write \`public/data\`, change official standard text, or enable
matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| work items | ${payload.summary.source_anchor_review_work_items} |
| manual review required rows | ${payload.summary.manual_review_required_rows} |
| generic title review rows | ${payload.summary.generic_title_review_rows} |
| unit fanout review rows | ${payload.summary.unit_fanout_review_rows} |
| high risk rows | ${payload.summary.high_risk_rows} |
| unique target standards | ${payload.summary.unique_target_standard_codes} |
| unique unit evidence ids | ${payload.summary.unique_unit_evidence_ids} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Review Lanes

| lane | rows |
| --- | ---: |
${countRows(payload.summary.by_review_lane)}

## Target Standards

| target standard | rows |
| --- | ---: |
${countRows(payload.summary.by_target_standard_code)}

## Preview

| lane order | rank | subject | grade | target standard | lane | unit evidence | unit title |
| ---: | ---: | --- | --- | --- | --- | --- | --- |
${previewRows(payload.manual_scope_source_anchor_review_work_items)}

## Guardrails

- Worklist rows are not reviewer decisions.
- Reviewer outcomes must be recorded through a later item-review decision gate.
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
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    manual_scope_source_anchor_review_work_items: rows,
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_worklist',
    source_manual_scope_source_anchor_evidence_inventory: args.inventory,
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
