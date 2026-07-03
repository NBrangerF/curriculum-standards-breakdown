#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_worklist.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_decisions_template.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_worklist_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_worklist_audit.md'
const REVIEW_PATHS = new Set([
  'source_review_ready',
  'page_recovery_then_source_review'
])

function parseArgs(argv) {
  const args = {
    worklist: DEFAULT_WORKLIST,
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireItems: false,
    requirePriorityOne: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--require-priority-one') args.requirePriorityOne = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_review_worklist.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_review_worklist_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \\
  --strict --require-items

Audits a read-only H4G subject theme bridge source-review worklist. It checks
coverage against the decisions file, policy boundaries, priority shape, and
review path validity.`)
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

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

function auditTopLevel(worklist, decisions, errors) {
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_source_review_worklist') {
    errors.push('worklist purpose must be h4g_subject_theme_bridge_source_review_worklist')
  }
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_review_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_review_decisions_template')
  }
  if (worklist.publication_candidate !== false) errors.push('worklist publication_candidate must be false')
  if (worklist.matcher_ready !== false) errors.push('worklist matcher_ready must be false')
  if (worklist.writes_public_data !== false) errors.push('worklist writes_public_data must be false')
  if (worklist.changes_official_standard_text !== false) errors.push('worklist changes_official_standard_text must be false')
  if (worklist.eligible_for_h4g_differentiation !== false) errors.push('worklist eligible_for_h4g_differentiation must be false')
  if (worklist.direct_matcher_use !== false) errors.push('worklist direct_matcher_use must be false')
  const policy = worklist.policy || {}
  if (policy.read_only_worklist !== true) errors.push('policy.read_only_worklist must be true')
  if (policy.writes_public_data !== false) errors.push('policy.writes_public_data must be false')
  if (policy.changes_official_standard_text !== false) errors.push('policy.changes_official_standard_text must be false')
  if (policy.eligible_for_h4g_differentiation !== false) errors.push('policy.eligible_for_h4g_differentiation must be false')
  if (policy.direct_matcher_use !== false) errors.push('policy.direct_matcher_use must be false')
  if (policy.requires_later_matcher_gate !== true) errors.push('policy.requires_later_matcher_gate must be true')
  if (policy.requires_later_publication_gate !== true) errors.push('policy.requires_later_publication_gate must be true')
}

function auditItemPolicy(item, prefix, errors) {
  const policy = item.publication_policy || {}
  if (policy.writes_public_data !== false) errors.push(`${prefix} publication_policy.writes_public_data must be false`)
  if (policy.changes_official_standard_text !== false) errors.push(`${prefix} publication_policy.changes_official_standard_text must be false`)
  if (policy.eligible_for_h4g_differentiation !== false) errors.push(`${prefix} publication_policy.eligible_for_h4g_differentiation must be false`)
  if (policy.direct_matcher_use !== false) errors.push(`${prefix} publication_policy.direct_matcher_use must be false`)
  if (policy.requires_later_matcher_gate !== true) errors.push(`${prefix} publication_policy.requires_later_matcher_gate must be true`)
  if (policy.requires_later_publication_gate !== true) errors.push(`${prefix} publication_policy.requires_later_publication_gate must be true`)
}

function decisionById(decisions) {
  return new Map((decisions.bridge_review_decisions || []).map(row => [row.decision_id, row]))
}

function auditWorkItems(workItems, decisions, args, errors, warnings, stats) {
  const decisionsById = decisionById(decisions)
  const seenDecisionIds = new Set()
  const seenWorkIds = new Set()
  for (const item of workItems || []) {
    const prefix = item.work_item_id || item.source_decision_id || '(missing work item)'
    if (!item.work_item_id) errors.push(`${prefix} missing work_item_id`)
    if (!item.source_decision_id) errors.push(`${prefix} missing source_decision_id`)
    if (item.work_item_id && seenWorkIds.has(item.work_item_id)) errors.push(`${prefix} duplicate work_item_id`)
    else if (item.work_item_id) seenWorkIds.add(item.work_item_id)
    if (item.source_decision_id && seenDecisionIds.has(item.source_decision_id)) {
      errors.push(`${prefix} duplicate source_decision_id`)
    } else if (item.source_decision_id) {
      seenDecisionIds.add(item.source_decision_id)
    }
    if (!REVIEW_PATHS.has(item.review_path)) errors.push(`${prefix} invalid review_path ${item.review_path || 'missing'}`)
    if (!Number.isInteger(item.priority_tier) || item.priority_tier < 1 || item.priority_tier > 4) {
      errors.push(`${prefix} priority_tier must be integer 1-4`)
    }
    if (typeof item.priority_score !== 'number') errors.push(`${prefix} priority_score must be numeric`)
    if (!Array.isArray(item.risk_flags)) errors.push(`${prefix} risk_flags must be an array`)
    if (!Array.isArray(item.shared_topic_tags) || !item.shared_topic_tags.length) errors.push(`${prefix} shared_topic_tags must be non-empty`)
    auditItemPolicy(item, prefix, errors)

    const decision = decisionsById.get(item.source_decision_id)
    if (!decision) {
      errors.push(`${prefix} source_decision_id not found in decisions file`)
    } else {
      for (const field of [
        'source_review_id',
        'subject_slug',
        'grade_band',
        'standard_code',
        'progression_group_id',
        'unit_evidence_id'
      ]) {
        if (String(item[field] || '') !== String(decision[field] || '')) {
          errors.push(`${prefix} ${field} must match source decision`)
        }
      }
      if (item.page_ready !== (decision.page_ready === true)) errors.push(`${prefix} page_ready must match source decision`)
      if (item.page_ready && item.review_path !== 'source_review_ready') errors.push(`${prefix} page-ready item must use source_review_ready`)
      if (!item.page_ready && item.review_path !== 'page_recovery_then_source_review') {
        errors.push(`${prefix} page-missing item must use page_recovery_then_source_review`)
      }
    }

    countInto(stats.by_review_path, item.review_path)
    countInto(stats.by_priority_tier, `P${item.priority_tier}`)
    countInto(stats.by_subject, item.subject_slug)
    countInto(stats.by_grade_band, item.grade_band)
    if (item.priority_tier === 1) stats.priority_1_items += 1
    if (item.review_path === 'source_review_ready') stats.source_review_ready_items += 1
    if (item.review_path === 'page_recovery_then_source_review') stats.page_recovery_items += 1
  }

  for (const decisionId of decisionsById.keys()) {
    if (!seenDecisionIds.has(decisionId)) errors.push(`${decisionId} missing from worklist`)
  }
  if (args.requireItems && !(workItems || []).length) errors.push('requireItems is set but worklist has no work_items')
  if (args.requirePriorityOne && stats.priority_1_items === 0) errors.push('requirePriorityOne is set but no P1 work items were found')
  if (stats.page_recovery_items > 0) warnings.push(`${stats.page_recovery_items} work item(s) require page recovery before publication gates`)
}

function markdownSummary(result) {
  return `# H4G Subject Theme Bridge Review Worklist Audit

Generated at: ${result.generated_at}

## Decision

| Field | Value |
| --- | ---: |
| valid | ${result.valid} |
| require items | ${result.require_items} |
| require priority one | ${result.require_priority_one} |
| work items | ${result.summary.work_items} |
| P1 items | ${result.summary.priority_1_items} |
| source-review ready items | ${result.summary.source_review_ready_items} |
| page-recovery items | ${result.summary.page_recovery_items} |

## Review Path

| Path | Count |
| --- | ---: |
${countRows(result.summary.by_review_path)}

## Priority

| Priority | Count |
| --- | ---: |
${countRows(result.summary.by_priority_tier)}

## Errors

${result.errors.length ? result.errors.map(error => `- ${error}`).join('\n') : '- none'}

## Warnings

${result.warnings.length ? result.warnings.map(warning => `- ${warning}`).join('\n') : '- none'}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const startupErrors = []
  for (const [label, path] of [
    ['worklist', args.worklist],
    ['decisions', args.decisions]
  ]) {
    if (!existsSync(path)) startupErrors.push(`Missing ${label}: ${path}`)
  }
  if (startupErrors.length) {
    const result = { valid: false, errors: startupErrors, warnings: [] }
    console.log(JSON.stringify(result, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const worklist = readJson(args.worklist)
  const decisions = readJson(args.decisions)
  const errors = []
  const warnings = []
  const stats = {
    by_grade_band: {},
    by_priority_tier: {},
    by_review_path: {},
    by_subject: {},
    page_recovery_items: 0,
    priority_1_items: 0,
    source_review_ready_items: 0
  }

  auditTopLevel(worklist, decisions, errors)
  auditWorkItems(worklist.work_items || [], decisions, args, errors, warnings, stats)

  const result = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    worklist: args.worklist,
    decisions: args.decisions,
    require_items: args.requireItems,
    require_priority_one: args.requirePriorityOne,
    matcher_ready: false,
    publication_ready: false,
    summary: {
      ...stats,
      work_items: (worklist.work_items || []).length
    },
    errors,
    warnings
  }

  writeJson(args.out, result)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(result))
  console.log(JSON.stringify(stable(result), null, 2))
  if (args.strict && !result.valid) process.exit(1)
}

main()
