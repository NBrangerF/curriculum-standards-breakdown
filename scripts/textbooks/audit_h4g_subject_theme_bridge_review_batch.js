#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_batch.json'
const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_worklist.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_decisions_template.json'
const DEFAULT_STANDARDS_ROOT = 'public/data/by_subject'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_batch_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_batch_audit.md'

function parseArgs(argv) {
  const args = {
    batch: DEFAULT_BATCH,
    worklist: DEFAULT_WORKLIST,
    decisions: DEFAULT_DECISIONS,
    standardsRoot: DEFAULT_STANDARDS_ROOT,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    maxPriority: 1,
    reviewPath: 'source_review_ready',
    strict: false,
    requireItems: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--batch') args.batch = argv[++i]
    else if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--standards-root') args.standardsRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--max-priority') args.maxPriority = Number(argv[++i])
    else if (item === '--review-path') args.reviewPath = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_review_batch.js \\
  --batch generated/textbook_evidence/h4g_theme_bridge_review_batch_p1_english_pe.json \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_review_worklist_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \\
  --strict --require-items --max-priority 1 --review-path source_review_ready

Audits a read-only H4G subject theme bridge source-review batch. It verifies the
batch selection, standard context enrichment, source decision/worklist lineage,
and no-public-write/no-matcher-use policy boundary.`)
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

function mapBy(rows, key) {
  return new Map((rows || []).map(row => [row[key], row]))
}

function loadStandardsForSubject(root, subjectSlug, errors) {
  const path = join(root, `${subjectSlug}.json`)
  if (!existsSync(path)) {
    errors.push(`Missing standards file for subject ${subjectSlug}: ${path}`)
    return []
  }
  const payload = readJson(path)
  if (!Array.isArray(payload.standards)) {
    errors.push(`Standards file ${path} must contain standards array`)
    return []
  }
  return payload.standards
}

function buildStandardIndex(root, subjectSlugs, errors) {
  const standardsByCode = new Map()
  for (const subjectSlug of sorted(subjectSlugs)) {
    for (const standard of loadStandardsForSubject(root, subjectSlug, errors)) {
      const code = standard.code || standard.id
      if (code) standardsByCode.set(code, standard)
    }
  }
  return standardsByCode
}

function auditTopLevel(batch, worklist, decisions, args, errors) {
  if (!Number.isInteger(args.maxPriority) || args.maxPriority < 1 || args.maxPriority > 4) {
    errors.push('--max-priority must be an integer from 1 to 4')
  }
  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_source_review_batch') {
    errors.push('batch purpose must be h4g_subject_theme_bridge_source_review_batch')
  }
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_source_review_worklist') {
    errors.push('worklist purpose must be h4g_subject_theme_bridge_source_review_worklist')
  }
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_review_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_review_decisions_template')
  }
  if (batch.publication_candidate !== false) errors.push('batch publication_candidate must be false')
  if (batch.matcher_ready !== false) errors.push('batch matcher_ready must be false')
  if (batch.writes_public_data !== false) errors.push('batch writes_public_data must be false')
  if (batch.changes_official_standard_text !== false) errors.push('batch changes_official_standard_text must be false')
  if (batch.eligible_for_h4g_differentiation !== false) errors.push('batch eligible_for_h4g_differentiation must be false')
  if (batch.direct_matcher_use !== false) errors.push('batch direct_matcher_use must be false')
  const policy = batch.policy || {}
  if (policy.read_only_review_batch !== true) errors.push('policy.read_only_review_batch must be true')
  if (policy.source_decision_must_be_edited_separately !== true) errors.push('policy.source_decision_must_be_edited_separately must be true')
  if (policy.batch_priority_is_not_approval !== true) errors.push('policy.batch_priority_is_not_approval must be true')
  if (policy.writes_public_data !== false) errors.push('policy.writes_public_data must be false')
  if (policy.changes_official_standard_text !== false) errors.push('policy.changes_official_standard_text must be false')
  if (policy.eligible_for_h4g_differentiation !== false) errors.push('policy.eligible_for_h4g_differentiation must be false')
  if (policy.direct_matcher_use !== false) errors.push('policy.direct_matcher_use must be false')
  if (batch.selection?.max_priority !== args.maxPriority) errors.push('batch selection.max_priority must match audit arg')
  if (batch.selection?.review_path !== args.reviewPath) errors.push('batch selection.review_path must match audit arg')
}

function auditItemPolicy(item, prefix, errors) {
  const policy = item.publication_policy || {}
  if (policy.read_only_review_batch !== true) errors.push(`${prefix} publication_policy.read_only_review_batch must be true`)
  if (policy.source_decision_must_be_edited_separately !== true) {
    errors.push(`${prefix} publication_policy.source_decision_must_be_edited_separately must be true`)
  }
  if (policy.batch_priority_is_not_approval !== true) errors.push(`${prefix} publication_policy.batch_priority_is_not_approval must be true`)
  if (policy.writes_public_data !== false) errors.push(`${prefix} publication_policy.writes_public_data must be false`)
  if (policy.changes_official_standard_text !== false) errors.push(`${prefix} publication_policy.changes_official_standard_text must be false`)
  if (policy.eligible_for_h4g_differentiation !== false) errors.push(`${prefix} publication_policy.eligible_for_h4g_differentiation must be false`)
  if (policy.direct_matcher_use !== false) errors.push(`${prefix} publication_policy.direct_matcher_use must be false`)
  if (policy.requires_later_matcher_gate !== true) errors.push(`${prefix} publication_policy.requires_later_matcher_gate must be true`)
  if (policy.requires_later_publication_gate !== true) errors.push(`${prefix} publication_policy.requires_later_publication_gate must be true`)
}

function auditItem(item, indexes, args, errors, warnings, stats) {
  const prefix = item.batch_item_id || item.source_work_item_id || '(missing batch item)'
  if (!item.batch_item_id) errors.push(`${prefix} missing batch_item_id`)
  if (!item.source_work_item_id) errors.push(`${prefix} missing source_work_item_id`)
  if (!item.source_decision_id) errors.push(`${prefix} missing source_decision_id`)
  const standard = item.standard_context || {}
  const unit = item.unit_context || {}
  const bridge = item.theme_bridge_context || {}
  const decisionTemplate = item.review_decision_template || {}
  const workItem = indexes.workById.get(item.source_work_item_id)
  const decision = indexes.decisionById.get(item.source_decision_id)
  const publicStandard = indexes.standardsByCode.get(standard.standard_code)

  if (!workItem) errors.push(`${prefix} source_work_item_id not found in worklist`)
  if (!decision) errors.push(`${prefix} source_decision_id not found in decisions`)
  if (!publicStandard) errors.push(`${prefix} standard_context.standard_code not found in public data`)
  if (item.priority_tier > args.maxPriority) errors.push(`${prefix} priority_tier exceeds max priority P${args.maxPriority}`)
  if (args.reviewPath !== 'all' && item.review_path !== args.reviewPath) errors.push(`${prefix} review_path must be ${args.reviewPath}`)
  if (!standard.standard_code || !standard.standard) errors.push(`${prefix} standard_context must include standard_code and standard`)
  if (!standard.domain || !standard.subdomain) errors.push(`${prefix} standard_context must include domain and subdomain`)
  if (!unit.unit_evidence_id || !unit.textbook_evidence_id || !unit.unit_title) {
    errors.push(`${prefix} unit_context must include unit_evidence_id, textbook_evidence_id, and unit_title`)
  }
  if (!Array.isArray(bridge.shared_topic_tags) || !bridge.shared_topic_tags.length) {
    errors.push(`${prefix} theme_bridge_context.shared_topic_tags must be non-empty`)
  }
  if (!Array.isArray(decisionTemplate.allowed_decisions) || !decisionTemplate.allowed_decisions.includes('reject_subject_theme_bridge')) {
    errors.push(`${prefix} review_decision_template.allowed_decisions must include reject_subject_theme_bridge`)
  }
  if (!decisionTemplate.allowed_decisions?.includes('approve_standard_scoped_subject_theme_bridge')) {
    errors.push(`${prefix} review_decision_template.allowed_decisions must include approve_standard_scoped_subject_theme_bridge`)
  }
  if (!decisionTemplate.required_confirmations || typeof decisionTemplate.required_confirmations !== 'object') {
    errors.push(`${prefix} review_decision_template.required_confirmations must be present`)
  }
  if (decisionTemplate.requested_public_write !== false) errors.push(`${prefix} requested_public_write must be false`)
  if (decisionTemplate.requested_official_text_change !== false) errors.push(`${prefix} requested_official_text_change must be false`)
  if (decisionTemplate.requested_direct_matcher_use !== false) errors.push(`${prefix} requested_direct_matcher_use must be false`)
  auditItemPolicy(item, prefix, errors)

  if (workItem) {
    const matches = [
      ['source_decision_id', item.source_decision_id, workItem.source_decision_id],
      ['source_review_id', item.source_review_id, workItem.source_review_id],
      ['priority_tier', item.priority_tier, workItem.priority_tier],
      ['review_path', item.review_path, workItem.review_path],
      ['standard_code', standard.standard_code, workItem.standard_code],
      ['subject_slug', standard.subject_slug, workItem.subject_slug],
      ['grade_band', standard.grade_band, workItem.grade_band],
      ['progression_group_id', standard.progression_group_id, workItem.progression_group_id],
      ['unit_evidence_id', unit.unit_evidence_id, workItem.unit_evidence_id],
      ['textbook_evidence_id', unit.textbook_evidence_id, workItem.textbook_evidence_id],
      ['unit_title', unit.unit_title, workItem.unit_title]
    ]
    for (const [field, actual, expected] of matches) {
      if (String(actual ?? '') !== String(expected ?? '')) errors.push(`${prefix} ${field} must match source work item`)
    }
  }

  if (decision) {
    for (const [field, actual, expected] of [
      ['source_review_id', item.source_review_id, decision.source_review_id],
      ['standard_code', standard.standard_code, decision.standard_code],
      ['grade_band', standard.grade_band, decision.grade_band],
      ['progression_group_id', standard.progression_group_id, decision.progression_group_id],
      ['unit_evidence_id', unit.unit_evidence_id, decision.unit_evidence_id],
      ['textbook_evidence_id', unit.textbook_evidence_id, decision.textbook_evidence_id]
    ]) {
      if (String(actual ?? '') !== String(expected ?? '')) errors.push(`${prefix} ${field} must match source decision`)
    }
    if (decisionTemplate.source_decision_id !== decision.decision_id) errors.push(`${prefix} review_decision_template.source_decision_id must match decision`)
    if (decisionTemplate.current_reviewer_decision !== decision.reviewer_decision) {
      errors.push(`${prefix} review_decision_template.current_reviewer_decision must match decision`)
    }
  }

  if (publicStandard) {
    for (const [field, actual, expected] of [
      ['standard', standard.standard, publicStandard.standard],
      ['domain', standard.domain, publicStandard.domain],
      ['subdomain', standard.subdomain, publicStandard.subdomain],
      ['grade_band', standard.grade_band, publicStandard.grade_band],
      ['progression_group_id', standard.progression_group_id, publicStandard.progression_group_id]
    ]) {
      if (String(actual ?? '') !== String(expected ?? '')) errors.push(`${prefix} standard_context.${field} must match public data`)
    }
  }

  countInto(stats.by_subject, standard.subject_slug)
  countInto(stats.by_grade_band, standard.grade_band)
  countInto(stats.by_priority_tier, `P${item.priority_tier}`)
  countInto(stats.by_review_path, item.review_path)
  countInto(stats.by_current_reviewer_decision, decisionTemplate.current_reviewer_decision)
  for (const flag of item.risk_flags || []) countInto(stats.by_risk_flag, flag)
  if (unit.page_ready) stats.page_ready_items += 1
  else {
    stats.page_missing_items += 1
    warnings.push(`${prefix} is not page-ready and cannot enter publication gates`)
  }
}

function expectedSelectedCount(worklist, args) {
  return (worklist.work_items || [])
    .filter(item => Number(item.priority_tier || 0) <= args.maxPriority)
    .filter(item => args.reviewPath === 'all' || item.review_path === args.reviewPath)
    .length
}

function markdownSummary(result) {
  return `# H4G Subject Theme Bridge Source Review Batch Audit

Generated at: ${result.generated_at}

## Decision

| Field | Value |
| --- | ---: |
| valid | ${result.valid} |
| require items | ${result.require_items} |
| max priority | P${result.max_priority} |
| review path | ${result.review_path} |
| batch items | ${result.summary.batch_items} |
| expected selected items | ${result.summary.expected_selected_items} |
| page-ready items | ${result.summary.page_ready_items} |
| page-missing items | ${result.summary.page_missing_items} |

## Grade

| Grade | Items |
| --- | ---: |
${countRows(result.summary.by_grade_band)}

## Subject

| Subject | Items |
| --- | ---: |
${countRows(result.summary.by_subject)}

## Risk Flags

| Risk Flag | Items |
| --- | ---: |
${countRows(result.summary.by_risk_flag)}

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
    ['batch', args.batch],
    ['worklist', args.worklist],
    ['decisions', args.decisions],
    ['standards root', args.standardsRoot]
  ]) {
    if (!existsSync(path)) startupErrors.push(`Missing ${label}: ${path}`)
  }
  if (startupErrors.length) {
    const result = { valid: false, errors: startupErrors, warnings: [] }
    console.log(JSON.stringify(result, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const batch = readJson(args.batch)
  const worklist = readJson(args.worklist)
  const decisions = readJson(args.decisions)
  const errors = []
  const warnings = []
  auditTopLevel(batch, worklist, decisions, args, errors)

  const subjectSlugs = (batch.batch_items || []).map(item => item.standard_context?.subject_slug)
  const standardsByCode = buildStandardIndex(args.standardsRoot, subjectSlugs, errors)
  const indexes = {
    workById: mapBy(worklist.work_items || [], 'work_item_id'),
    decisionById: mapBy(decisions.bridge_review_decisions || [], 'decision_id'),
    standardsByCode
  }
  const stats = {
    batch_items: (batch.batch_items || []).length,
    expected_selected_items: expectedSelectedCount(worklist, args),
    page_ready_items: 0,
    page_missing_items: 0,
    by_subject: {},
    by_grade_band: {},
    by_priority_tier: {},
    by_review_path: {},
    by_current_reviewer_decision: {},
    by_risk_flag: {}
  }
  const seenBatchIds = new Set()
  const seenWorkIds = new Set()
  for (const item of batch.batch_items || []) {
    const prefix = item.batch_item_id || item.source_work_item_id || '(missing batch item)'
    if (item.batch_item_id && seenBatchIds.has(item.batch_item_id)) errors.push(`${prefix} duplicate batch_item_id`)
    else if (item.batch_item_id) seenBatchIds.add(item.batch_item_id)
    if (item.source_work_item_id && seenWorkIds.has(item.source_work_item_id)) errors.push(`${prefix} duplicate source_work_item_id`)
    else if (item.source_work_item_id) seenWorkIds.add(item.source_work_item_id)
    auditItem(item, indexes, args, errors, warnings, stats)
  }
  if (args.requireItems && !stats.batch_items) errors.push('requireItems is set but batch has no batch_items')
  if (stats.batch_items !== stats.expected_selected_items) {
    errors.push(`batch item count ${stats.batch_items} must equal selected worklist count ${stats.expected_selected_items}`)
  }

  const result = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    batch: args.batch,
    worklist: args.worklist,
    decisions: args.decisions,
    standards_root: args.standardsRoot,
    require_items: args.requireItems,
    max_priority: args.maxPriority,
    review_path: args.reviewPath,
    matcher_ready: false,
    publication_ready: false,
    summary: stable(stats),
    errors,
    warnings
  }

  writeJson(args.out, result)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(result))
  console.log(JSON.stringify(stable(result), null, 2))
  if (args.strict && !result.valid) process.exit(1)
}

main()
