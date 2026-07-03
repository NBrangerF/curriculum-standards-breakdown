#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/grade7_9_h4g_product_readiness_worklist.json'
const DEFAULT_PRODUCT_READINESS = 'generated/grade7_9_h4g_product_readiness.json'
const DEFAULT_OUT = 'generated/grade7_9_h4g_product_readiness_worklist_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/grade7_9_h4g_product_readiness_worklist_audit.md'
const ALLOWED_ROUTES = new Set([
  'build_unit_chapter_evidence_from_file_level_sources',
  'collect_anchor_group_source_anchor_evidence_before_item_review',
  'collect_missing_target_grade_anchors_before_decision_review',
  'complete_anchor_group_decisions_before_item_review',
  'expand_existing_unit_evidence_pipeline',
  'manual_source_anchor_specificity_decision_review',
  'product_ready_no_action',
  'repair_or_confirm_single_partial_grade_assignment',
  'repair_partial_progression_group_or_standard_context_before_anchor_review',
  'split_anchor_group_scope_before_item_review',
  'source_coverage_or_low_confidence_evidence_gap'
])

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    productReadiness: DEFAULT_PRODUCT_READINESS,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--out') args.out = argv[++i]
    else if (item === '--product-readiness') args.productReadiness = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/audit_h4g_product_readiness_worklist.js \\
  --strict --require-items

Audits the read-only H4G product readiness remediation worklist against its
summary and the product readiness audit.`)
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

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function pct(numerator, denominator) {
  if (!denominator) return 0
  return Number((numerator / denominator).toFixed(4))
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

function sameJson(left, right) {
  return JSON.stringify(stable(left || {})) === JSON.stringify(stable(right || {}))
}

function validateTopLevel(worklist, productReadiness, errors) {
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if ((worklist.errors || []).length) errors.push('worklist errors must be empty')
  if (worklist.purpose !== 'h4g_product_readiness_worklist') errors.push('worklist purpose mismatch')
  if (worklist.product_readiness_worklist_only !== true) errors.push('worklist product_readiness_worklist_only must be true')
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'direct_matcher_use',
    'eligible_for_h4g_differentiation',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (worklist[key] !== false) errors.push(`worklist ${key} must be false`)
  }
  if (productReadiness.valid !== true) errors.push('product readiness valid must be true')
  if (productReadiness.purpose !== 'h4g_product_readiness_audit') errors.push('product readiness purpose mismatch')
}

function summarize(workItems, errors) {
  const summary = {
    by_group_blocker: {},
    by_recommended_route: {},
    by_subject: {},
    product_ready_groups: 0,
    total_work_items: workItems.length,
    work_items_requiring_action: 0
  }
  const ids = new Set()
  const groups = new Set()
  for (const item of workItems) {
    if (!item.h4g_product_readiness_work_item_id) errors.push('work item missing id')
    if (!item.progression_group_id) errors.push(`${item.h4g_product_readiness_work_item_id || 'work item'} missing progression_group_id`)
    if (!ALLOWED_ROUTES.has(item.recommended_route)) {
      errors.push(`${item.progression_group_id || item.h4g_product_readiness_work_item_id} has unknown route: ${item.recommended_route}`)
    }
    if (ids.has(item.h4g_product_readiness_work_item_id)) errors.push(`duplicate work item id: ${item.h4g_product_readiness_work_item_id}`)
    if (groups.has(item.progression_group_id)) errors.push(`duplicate progression_group_id: ${item.progression_group_id}`)
    ids.add(item.h4g_product_readiness_work_item_id)
    groups.add(item.progression_group_id)
    if (item.writes_public_data !== false) errors.push(`${item.progression_group_id} writes_public_data must be false`)
    if (item.changes_official_standard_text !== false) errors.push(`${item.progression_group_id} changes_official_standard_text must be false`)
    if (item.direct_matcher_use !== false) errors.push(`${item.progression_group_id} direct_matcher_use must be false`)
    countInto(summary.by_recommended_route, item.recommended_route)
    countInto(summary.by_subject, item.subject_slug)
    for (const blocker of item.group_blockers || []) countInto(summary.by_group_blocker, blocker)
    if (item.product_ready_group) summary.product_ready_groups += 1
    else summary.work_items_requiring_action += 1
  }
  summary.action_required_rate = pct(summary.work_items_requiring_action, summary.total_work_items)
  return summary
}

function markdownSummary(payload) {
  return `# H4G Product Readiness Worklist Audit

Generated at: ${payload.generated_at}

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| audited work items | ${payload.summary.audited_work_items} |
| product readiness groups | ${payload.summary.product_readiness_progression_groups} |
| work items requiring action | ${payload.summary.work_items_requiring_action} |
| product-ready groups | ${payload.summary.product_ready_groups} |

## Routes

| route | groups |
| --- | ---: |
${countRows(payload.summary.by_recommended_route)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const worklist = readJson(args.worklist)
  const productReadiness = readJson(args.productReadiness)
  validateTopLevel(worklist, productReadiness, errors)
  const workItems = Array.isArray(worklist.work_items) ? worklist.work_items : []
  if (!Array.isArray(worklist.work_items)) errors.push('worklist.work_items must be an array')
  if (args.requireItems && !workItems.length) errors.push('requireItems is set but no work items were found')
  const expectedSummary = summarize(workItems, errors)

  if (!sameJson(worklist.summary?.by_recommended_route, expectedSummary.by_recommended_route)) {
    errors.push('summary.by_recommended_route mismatch')
  }
  if (!sameJson(worklist.summary?.by_group_blocker, expectedSummary.by_group_blocker)) {
    errors.push('summary.by_group_blocker mismatch')
  }
  if (!sameJson(worklist.summary?.by_subject, expectedSummary.by_subject)) {
    errors.push('summary.by_subject mismatch')
  }
  for (const key of ['product_ready_groups', 'total_work_items', 'work_items_requiring_action']) {
    if (Number(worklist.summary?.[key] || 0) !== Number(expectedSummary[key] || 0)) {
      errors.push(`summary.${key} mismatch`)
    }
  }

  const productGroups = Number(productReadiness.summary?.progression_groups || 0)
  if (workItems.length !== productGroups) {
    errors.push(`work item count ${workItems.length} does not match product readiness progression_groups ${productGroups}`)
  }
  if (Number(worklist.summary?.product_ready_groups || 0) !== Number(productReadiness.summary?.product_ready_groups || 0)) {
    errors.push('worklist product_ready_groups does not match product readiness')
  }

  const payload = {
    errors,
    generated_at: new Date().toISOString(),
    source_product_readiness: args.productReadiness,
    source_worklist: args.worklist,
    summary: {
      ...expectedSummary,
      audited_work_items: workItems.length,
      product_readiness_progression_groups: productGroups
    },
    valid: errors.length === 0,
    writes_public_data: false
  }
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(payload, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
