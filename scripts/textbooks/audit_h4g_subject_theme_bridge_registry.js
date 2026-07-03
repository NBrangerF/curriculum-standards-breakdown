#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_REGISTRY = 'generated/textbook_evidence/h4g_subject_theme_bridge_registry.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_decisions_template.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_registry_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_registry_audit.md'
const APPROVED_DECISIONS = new Set([
  'approve_standard_scoped_subject_theme_bridge',
  'approve_progression_group_subject_theme_bridge'
])

function parseArgs(argv) {
  const args = {
    registry: DEFAULT_REGISTRY,
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireApproved: false,
    requirePageReady: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--registry') args.registry = argv[++i]
    else if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-approved') args.requireApproved = true
    else if (item === '--require-page-ready') args.requirePageReady = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_registry.js \\
  --registry generated/textbook_evidence/h4g_theme_bridge_registry_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \\
  --strict

Audits a reviewed subject-theme bridge registry before matcher use. It verifies
that every bridge comes from an approved source-review decision and that the
registry remains a generated, pre-publication artifact.`)
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

function decisionsById(decisions) {
  return new Map((decisions.bridge_review_decisions || []).map(row => [row.decision_id, row]))
}

function auditTopLevel(registry, decisions, errors) {
  if (registry.valid !== true) errors.push('registry valid must be true')
  if (registry.purpose !== 'h4g_reviewed_subject_theme_bridge_registry') {
    errors.push('registry purpose must be h4g_reviewed_subject_theme_bridge_registry')
  }
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (registry.writes_public_data !== false) errors.push('registry writes_public_data must be false')
  if (registry.changes_official_standard_text !== false) errors.push('registry changes_official_standard_text must be false')
  if (registry.publication_ready !== false) errors.push('registry publication_ready must be false')
  if (registry.eligible_alignment !== 'reviewed_subject_theme_bridge') errors.push('registry eligible_alignment must be reviewed_subject_theme_bridge')
  const policy = registry.policy || {}
  if (policy.approved_bridge_registry_only !== true) errors.push('policy.approved_bridge_registry_only must be true')
  if (policy.writes_public_data !== false) errors.push('policy.writes_public_data must be false')
  if (policy.changes_official_standard_text !== false) errors.push('policy.changes_official_standard_text must be false')
  if (policy.requires_later_matcher_gate !== true) errors.push('policy.requires_later_matcher_gate must be true')
  if (policy.requires_later_publication_gate !== true) errors.push('policy.requires_later_publication_gate must be true')
}

function auditBridge(bridge, decision, args, errors, stats) {
  const prefix = bridge.bridge_id || bridge.source_decision_id || '(missing bridge)'
  if (!bridge.bridge_id) errors.push(`${prefix} missing bridge_id`)
  if (!bridge.source_decision_id) errors.push(`${prefix} missing source_decision_id`)
  if (!APPROVED_DECISIONS.has(bridge.reviewer_decision)) errors.push(`${prefix} reviewer_decision is not approved`)
  if (!decision) {
    errors.push(`${prefix} source_decision_id not found in decisions`)
    return
  }
  if (!APPROVED_DECISIONS.has(decision.reviewer_decision)) {
    errors.push(`${prefix} source decision is not approved`)
  }
  const expectedScope = decision.reviewer_decision === 'approve_progression_group_subject_theme_bridge'
    ? 'progression_group'
    : 'standard_code'
  if (bridge.scope_type !== expectedScope) errors.push(`${prefix} scope_type must be ${expectedScope}`)
  for (const field of [
    'subject_slug',
    'grade_band',
    'unit_grade_band',
    'standard_code',
    'progression_group_id',
    'unit_evidence_id',
    'textbook_evidence_id'
  ]) {
    if (String(bridge[field] || '') !== String(decision[field] || '')) {
      errors.push(`${prefix} ${field} must match source decision`)
    }
  }
  if (bridge.grade_band !== bridge.unit_grade_band) errors.push(`${prefix} grade_band must equal unit_grade_band`)
  if (!Array.isArray(bridge.shared_topic_tags) || !bridge.shared_topic_tags.length) errors.push(`${prefix} shared_topic_tags must be non-empty`)
  if (typeof bridge.matcher_score !== 'number' || bridge.matcher_score < 0.55 || bridge.matcher_score > 1) {
    errors.push(`${prefix} matcher_score must be numeric and >= 0.55`)
  }
  if (bridge.eligible_alignment !== 'reviewed_subject_theme_bridge') errors.push(`${prefix} eligible_alignment must be reviewed_subject_theme_bridge`)
  if (args.requirePageReady && bridge.page_ready !== true) errors.push(`${prefix} page_ready must be true`)
  const policy = bridge.publication_policy || {}
  if (policy.writes_public_data !== false) errors.push(`${prefix} publication_policy.writes_public_data must be false`)
  if (policy.changes_official_standard_text !== false) errors.push(`${prefix} publication_policy.changes_official_standard_text must be false`)
  if (policy.requires_later_matcher_gate !== true) errors.push(`${prefix} publication_policy.requires_later_matcher_gate must be true`)
  if (policy.requires_later_publication_gate !== true) errors.push(`${prefix} publication_policy.requires_later_publication_gate must be true`)
  countInto(stats.by_subject, bridge.subject_slug)
  countInto(stats.by_grade_band, bridge.grade_band)
  countInto(stats.by_scope_type, bridge.scope_type)
  if (bridge.page_ready) stats.page_ready_bridges += 1
  else stats.page_missing_bridges += 1
}

function markdownSummary(result) {
  return `# H4G Subject Theme Bridge Registry Audit

Generated at: ${result.generated_at}

| Field | Value |
| --- | ---: |
| valid | ${result.valid} |
| approved bridges | ${result.summary.approved_bridges} |
| page-ready bridges | ${result.summary.page_ready_bridges} |
| page-missing bridges | ${result.summary.page_missing_bridges} |
| require approved | ${result.require_approved} |
| require page ready | ${result.require_page_ready} |

## Scope

| Scope | Count |
| --- | ---: |
${countRows(result.summary.by_scope_type)}

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
    ['registry', args.registry],
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

  const registry = readJson(args.registry)
  const decisions = readJson(args.decisions)
  const errors = []
  const warnings = []
  const stats = {
    approved_bridges: 0,
    page_ready_bridges: 0,
    page_missing_bridges: 0,
    by_subject: {},
    by_grade_band: {},
    by_scope_type: {}
  }
  auditTopLevel(registry, decisions, errors)
  const byDecision = decisionsById(decisions)
  const seen = new Set()
  for (const bridge of registry.bridges || []) {
    if (seen.has(bridge.bridge_id)) errors.push(`${bridge.bridge_id} duplicate bridge_id`)
    else if (bridge.bridge_id) seen.add(bridge.bridge_id)
    stats.approved_bridges += 1
    auditBridge(bridge, byDecision.get(bridge.source_decision_id), args, errors, stats)
  }
  if (args.requireApproved && !stats.approved_bridges) errors.push('requireApproved is set but registry has no bridges')
  if (stats.page_missing_bridges) warnings.push(`${stats.page_missing_bridges} approved bridge(s) still need page recovery before publication gates`)

  const result = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    registry: args.registry,
    decisions: args.decisions,
    require_approved: args.requireApproved,
    require_page_ready: args.requirePageReady,
    matcher_ready: errors.length === 0,
    publication_ready: false,
    summary: stats,
    errors,
    warnings
  }
  writeJson(args.out, result)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(result))
  console.log(JSON.stringify(stable(result), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
