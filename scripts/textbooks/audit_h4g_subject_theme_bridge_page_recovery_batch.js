#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_subject_theme_bridge_page_recovery_batch.json'
const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_worklist.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_decisions_template.json'
const DEFAULT_STANDARDS_ROOT = 'public/data/by_subject'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_page_recovery_batch_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_page_recovery_batch_audit.md'
const PAGE_RECOVERY_PATH = 'page_recovery_then_source_review'

function parseArgs(argv) {
  const args = {
    batch: DEFAULT_BATCH,
    worklist: DEFAULT_WORKLIST,
    decisions: DEFAULT_DECISIONS,
    standardsRoot: DEFAULT_STANDARDS_ROOT,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    gradeBands: [],
    subjects: [],
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
    else if (item === '--grade-bands') args.gradeBands = splitArg(argv[++i])
    else if (item === '--subjects') args.subjects = splitArg(argv[++i])
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_page_recovery_batch.js \\
  --batch generated/textbook_evidence/h4g_theme_bridge_page_recovery_batch_h4g8_english_pe.json \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_review_worklist_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \\
  --strict --require-items --grade-bands H4G8

Audits a read-only H4G subject-theme bridge page-recovery batch. It verifies
that every linked work item is page-missing, the selection matches the worklist,
standard context comes from public data, and the batch does not approve bridges.`)
}

function splitArg(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
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
  const rows = Array.isArray(values) ? values : Array.from(values || [])
  return [...new Set(rows.filter(value => value !== undefined && value !== null && value !== '').map(String))]
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

function selectedWorkItems(workItems, args) {
  const gradeBands = new Set(args.gradeBands)
  const subjects = new Set(args.subjects)
  return (workItems || [])
    .filter(item => item.review_path === PAGE_RECOVERY_PATH)
    .filter(item => !gradeBands.size || gradeBands.has(item.grade_band))
    .filter(item => !subjects.size || subjects.has(item.subject_slug))
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
  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_page_recovery_batch') {
    errors.push('batch purpose must be h4g_subject_theme_bridge_page_recovery_batch')
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
  if (batch.source_review_complete !== false) errors.push('batch source_review_complete must be false')
  if (batch.writes_public_data !== false) errors.push('batch writes_public_data must be false')
  if (batch.changes_official_standard_text !== false) errors.push('batch changes_official_standard_text must be false')
  if (batch.eligible_for_h4g_differentiation !== false) errors.push('batch eligible_for_h4g_differentiation must be false')
  if (batch.direct_matcher_use !== false) errors.push('batch direct_matcher_use must be false')
  const policy = batch.policy || {}
  if (policy.read_only_page_recovery_batch !== true) errors.push('policy.read_only_page_recovery_batch must be true')
  if (policy.page_recovery_is_not_source_review_approval !== true) errors.push('policy.page_recovery_is_not_source_review_approval must be true')
  if (policy.recovered_page_requires_page_start_override_review !== true) {
    errors.push('policy.recovered_page_requires_page_start_override_review must be true')
  }
  if (policy.writes_public_data !== false) errors.push('policy.writes_public_data must be false')
  if (policy.changes_official_standard_text !== false) errors.push('policy.changes_official_standard_text must be false')
  if (policy.eligible_for_h4g_differentiation !== false) errors.push('policy.eligible_for_h4g_differentiation must be false')
  if (policy.direct_matcher_use !== false) errors.push('policy.direct_matcher_use must be false')
  if (String((batch.selection?.grade_bands || []).join(',')) !== String(args.gradeBands.join(','))) {
    errors.push('batch selection.grade_bands must match audit arg')
  }
  if (String((batch.selection?.subjects || []).join(',')) !== String(args.subjects.join(','))) {
    errors.push('batch selection.subjects must match audit arg')
  }
}

function auditItemPolicy(item, prefix, errors) {
  const policy = item.publication_policy || {}
  if (policy.read_only_page_recovery_batch !== true) errors.push(`${prefix} publication_policy.read_only_page_recovery_batch must be true`)
  if (policy.page_recovery_is_not_source_review_approval !== true) {
    errors.push(`${prefix} publication_policy.page_recovery_is_not_source_review_approval must be true`)
  }
  if (policy.recovered_page_requires_page_start_override_review !== true) {
    errors.push(`${prefix} publication_policy.recovered_page_requires_page_start_override_review must be true`)
  }
  if (policy.writes_public_data !== false) errors.push(`${prefix} publication_policy.writes_public_data must be false`)
  if (policy.changes_official_standard_text !== false) errors.push(`${prefix} publication_policy.changes_official_standard_text must be false`)
  if (policy.eligible_for_h4g_differentiation !== false) errors.push(`${prefix} publication_policy.eligible_for_h4g_differentiation must be false`)
  if (policy.direct_matcher_use !== false) errors.push(`${prefix} publication_policy.direct_matcher_use must be false`)
  if (policy.requires_later_source_review_gate !== true) errors.push(`${prefix} publication_policy.requires_later_source_review_gate must be true`)
  if (policy.requires_later_matcher_gate !== true) errors.push(`${prefix} publication_policy.requires_later_matcher_gate must be true`)
  if (policy.requires_later_publication_gate !== true) errors.push(`${prefix} publication_policy.requires_later_publication_gate must be true`)
}

function auditRecoveryItem(item, indexes, errors, stats) {
  const prefix = item.recovery_item_id || item.unit_context?.unit_evidence_id || '(missing recovery item)'
  const unit = item.unit_context || {}
  const impact = item.impact || {}
  const template = item.page_start_override_template || {}
  if (!item.recovery_item_id) errors.push(`${prefix} missing recovery_item_id`)
  if (!Number.isInteger(item.recovery_priority_tier) || item.recovery_priority_tier < 1 || item.recovery_priority_tier > 4) {
    errors.push(`${prefix} recovery_priority_tier must be integer 1-4`)
  }
  if (item.recovery_path !== 'recover_printed_page_start_before_source_review') {
    errors.push(`${prefix} recovery_path must be recover_printed_page_start_before_source_review`)
  }
  if (!unit.unit_evidence_id || !unit.textbook_evidence_id || !unit.unit_title) {
    errors.push(`${prefix} unit_context must include unit_evidence_id, textbook_evidence_id, and unit_title`)
  }
  if (unit.page_ready_current !== false) errors.push(`${prefix} unit_context.page_ready_current must be false`)
  if (unit.current_page_start !== null) errors.push(`${prefix} unit_context.current_page_start must be null`)
  if (template.textbook_evidence_id !== unit.textbook_evidence_id) errors.push(`${prefix} override template textbook_evidence_id must match unit`)
  if (template.unit_title !== unit.unit_title) errors.push(`${prefix} override template unit_title must match unit`)
  if (template.page_start !== null) errors.push(`${prefix} override template page_start must remain null`)
  if (template.review_status !== 'pending_page_recovery') errors.push(`${prefix} override template review_status must be pending_page_recovery`)
  auditItemPolicy(item, prefix, errors)

  const linkedStandards = item.linked_standards || []
  if (!linkedStandards.length) errors.push(`${prefix} linked_standards must be non-empty`)
  const seenWorkIds = new Set()
  const seenDecisionIds = new Set()
  for (const standard of linkedStandards) {
    if (!standard.source_work_item_id) errors.push(`${prefix} linked standard missing source_work_item_id`)
    if (!standard.source_decision_id) errors.push(`${prefix} linked standard missing source_decision_id`)
    if (standard.source_work_item_id) seenWorkIds.add(standard.source_work_item_id)
    if (standard.source_decision_id) seenDecisionIds.add(standard.source_decision_id)
    const workItem = indexes.workById.get(standard.source_work_item_id)
    const decision = indexes.decisionById.get(standard.source_decision_id)
    const publicStandard = indexes.standardsByCode.get(standard.standard_code)
    if (!workItem) errors.push(`${prefix} source work item not found: ${standard.source_work_item_id}`)
    if (!decision) errors.push(`${prefix} source decision not found: ${standard.source_decision_id}`)
    if (!publicStandard) errors.push(`${prefix} public standard not found: ${standard.standard_code}`)
    if (workItem) {
      if (workItem.review_path !== PAGE_RECOVERY_PATH) errors.push(`${prefix} source work item must be page recovery`)
      if (workItem.page_ready !== false) errors.push(`${prefix} source work item page_ready must be false`)
      for (const [field, actual, expected] of [
        ['unit_evidence_id', unit.unit_evidence_id, workItem.unit_evidence_id],
        ['textbook_evidence_id', unit.textbook_evidence_id, workItem.textbook_evidence_id],
        ['unit_title', unit.unit_title, workItem.unit_title],
        ['subject_slug', unit.subject_slug, workItem.subject_slug],
        ['grade_band', unit.grade_band, workItem.grade_band],
        ['standard_code', standard.standard_code, workItem.standard_code]
      ]) {
        if (String(actual ?? '') !== String(expected ?? '')) errors.push(`${prefix} ${field} must match source work item`)
      }
    }
    if (decision) {
      if (decision.page_ready !== false) errors.push(`${prefix} source decision page_ready must be false`)
      for (const [field, actual, expected] of [
        ['source_review_id', standard.source_review_id, decision.source_review_id],
        ['standard_code', standard.standard_code, decision.standard_code],
        ['unit_evidence_id', unit.unit_evidence_id, decision.unit_evidence_id],
        ['textbook_evidence_id', unit.textbook_evidence_id, decision.textbook_evidence_id],
        ['grade_band', unit.grade_band, decision.grade_band]
      ]) {
        if (String(actual ?? '') !== String(expected ?? '')) errors.push(`${prefix} ${field} must match source decision`)
      }
    }
    if (publicStandard) {
      for (const [field, actual, expected] of [
        ['standard', standard.standard, publicStandard.standard],
        ['domain', standard.domain, publicStandard.domain],
        ['subdomain', standard.subdomain, publicStandard.subdomain],
        ['progression_group_id', standard.progression_group_id, publicStandard.progression_group_id]
      ]) {
        if (String(actual ?? '') !== String(expected ?? '')) errors.push(`${prefix} standard.${field} must match public data`)
      }
    }
  }
  if (impact.linked_work_item_count !== seenWorkIds.size) errors.push(`${prefix} impact.linked_work_item_count must match linked standards`)
  if (impact.linked_decision_count !== seenDecisionIds.size) errors.push(`${prefix} impact.linked_decision_count must match linked decisions`)
  if (impact.linked_standard_count !== sorted(linkedStandards.map(row => row.standard_code)).length) {
    errors.push(`${prefix} impact.linked_standard_count must match unique standard codes`)
  }

  stats.recovery_items += 1
  stats.linked_work_items += seenWorkIds.size
  stats.linked_decisions += seenDecisionIds.size
  countInto(stats.by_subject, unit.subject_slug)
  countInto(stats.by_grade_band, unit.grade_band)
  countInto(stats.by_textbook_evidence_id, unit.textbook_evidence_id)
  countInto(stats.by_recovery_priority_tier, `R${item.recovery_priority_tier}`)
}

function expectedSelected(worklist, args) {
  const rows = selectedWorkItems(worklist.work_items || [], args)
  return {
    work_items: rows.length,
    recovery_items: sorted(rows.map(row => row.unit_evidence_id || `${row.textbook_evidence_id}:${row.unit_title}`)).length
  }
}

function markdownSummary(result) {
  return `# H4G Subject Theme Bridge Page Recovery Batch Audit

Generated at: ${result.generated_at}

## Decision

| Field | Value |
| --- | ---: |
| valid | ${result.valid} |
| require items | ${result.require_items} |
| selected work items | ${result.summary.selected_work_items} |
| expected work items | ${result.summary.expected_work_items} |
| recovery items | ${result.summary.recovery_items} |
| expected recovery items | ${result.summary.expected_recovery_items} |
| linked decisions | ${result.summary.linked_decisions} |

## Grade

| Grade | Items |
| --- | ---: |
${countRows(result.summary.by_grade_band)}

## Subject

| Subject | Items |
| --- | ---: |
${countRows(result.summary.by_subject)}

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

  const subjectSlugs = (batch.recovery_items || []).map(item => item.unit_context?.subject_slug)
  const indexes = {
    workById: mapBy(worklist.work_items || [], 'work_item_id'),
    decisionById: mapBy(decisions.bridge_review_decisions || [], 'decision_id'),
    standardsByCode: buildStandardIndex(args.standardsRoot, subjectSlugs, errors)
  }
  const expected = expectedSelected(worklist, args)
  const stats = {
    recovery_items: 0,
    selected_work_items: batch.selection?.selected_work_items || 0,
    expected_work_items: expected.work_items,
    expected_recovery_items: expected.recovery_items,
    linked_work_items: 0,
    linked_decisions: 0,
    by_subject: {},
    by_grade_band: {},
    by_textbook_evidence_id: {},
    by_recovery_priority_tier: {}
  }
  const seenRecoveryIds = new Set()
  const seenUnitIds = new Set()
  for (const item of batch.recovery_items || []) {
    const prefix = item.recovery_item_id || item.unit_context?.unit_evidence_id || '(missing recovery item)'
    if (item.recovery_item_id && seenRecoveryIds.has(item.recovery_item_id)) errors.push(`${prefix} duplicate recovery_item_id`)
    else if (item.recovery_item_id) seenRecoveryIds.add(item.recovery_item_id)
    const unitId = item.unit_context?.unit_evidence_id
    if (unitId && seenUnitIds.has(unitId)) errors.push(`${prefix} duplicate unit_evidence_id`)
    else if (unitId) seenUnitIds.add(unitId)
    auditRecoveryItem(item, indexes, errors, stats)
  }
  if (args.requireItems && !stats.recovery_items) errors.push('requireItems is set but batch has no recovery_items')
  if (stats.selected_work_items !== expected.work_items) {
    errors.push(`selection selected_work_items ${stats.selected_work_items} must equal expected ${expected.work_items}`)
  }
  if (stats.recovery_items !== expected.recovery_items) {
    errors.push(`recovery_items ${stats.recovery_items} must equal expected ${expected.recovery_items}`)
  }
  if (stats.linked_work_items !== expected.work_items) {
    errors.push(`linked_work_items ${stats.linked_work_items} must equal expected ${expected.work_items}`)
  }

  const result = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    batch: args.batch,
    worklist: args.worklist,
    decisions: args.decisions,
    standards_root: args.standardsRoot,
    grade_bands: args.gradeBands,
    subjects: args.subjects,
    require_items: args.requireItems,
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
