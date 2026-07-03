#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_review_decisions_language_use_pe_quality_rejected_english_pe.json'
const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_language_use_pe_quality_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_review_decisions_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_review_decisions_anchor_domain_rejected_english_pe.md'
const DEFAULT_REJECT_RULES = [
  'pe_movement_anchor_domain_mismatch',
  'pe_health_anchor_domain_mismatch'
]

const REJECT_RULES = {
  pe_movement_anchor_domain_mismatch: {
    anchor_type: 'pe_movement_skill_fitness_or_sportsmanship_anchor',
    action_family: 'pe_activity_skill_requires_movement_standard_anchor',
    domains: new Set(['课程目标', '健康教育', '跨学科主题学习']),
    note: '拒绝 PE activity-to-domain mismatch：运动项目/活动技能章节不能仅凭项目名称证明课程目标、健康教育或跨学科主题学习标准；后续若有明确安全、健康行为或跨学科任务证据，应重新进入标准级 source review。'
  },
  pe_health_anchor_domain_mismatch: {
    anchor_type: 'pe_health_behavior_or_load_management_anchor',
    action_family: 'pe_health_theory_requires_health_behavior_review',
    domains: new Set(['课程目标', '体育品德', '运动能力', '跨学科主题学习']),
    note: '拒绝 PE health-to-domain mismatch：健康理论、运动负荷或自我监测章节不能仅凭宽主题证明课程目标、体育品德、运动能力或跨学科主题学习标准；后续若有明确行为任务或表现证据，应重新进入标准级 source review。'
  }
}

function parseArgs(argv) {
  const args = {
    anchorBatch: DEFAULT_BATCH,
    decisions: DEFAULT_DECISIONS,
    out: DEFAULT_OUT,
    rejectAnchorDomainRules: DEFAULT_REJECT_RULES,
    requireItems: false,
    reviewedAt: new Date().toISOString().slice(0, 10),
    reviewer: 'Codex anchor-domain source review',
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--anchor-batch') args.anchorBatch = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--reject-anchor-domain-rules') args.rejectAnchorDomainRules = parseList(argv[++i])
    else if (item === '--reviewer') args.reviewer = argv[++i]
    else if (item === '--reviewed-at') args.reviewedAt = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_decisions_recommendation.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_language_use_pe_quality_rejected_english_pe.json \\
  --anchor-batch generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_language_use_pe_quality_rejected_english_pe.json \\
  --strict --require-items

Builds a generated source-review decision candidate from an anchor review batch.
By default it only rejects audited PE anchor/domain mismatches. It never
approves new bridges, writes public/data, changes official standard text, or
enables direct matcher use.`)
}

function parseList(value) {
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

function anchorByDecisionId(batch) {
  return new Map((batch.anchor_review_items || []).map(item => [item.source_decision_id, item]))
}

function validateInputs(decisions, batch, args, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_review_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_review_decisions_template')
  }
  if (decisions.writes_public_data !== false) errors.push('decisions writes_public_data must be false')
  if (decisions.changes_official_standard_text !== false) errors.push('decisions changes_official_standard_text must be false')
  if (decisions.direct_matcher_use !== false) errors.push('decisions direct_matcher_use must be false')
  if (batch.valid !== true) errors.push('anchor batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_anchor_review_batch') {
    errors.push('anchor batch purpose must be h4g_subject_theme_bridge_anchor_review_batch')
  }
  if (batch.writes_public_data !== false) errors.push('anchor batch writes_public_data must be false')
  if (batch.changes_official_standard_text !== false) errors.push('anchor batch changes_official_standard_text must be false')
  if (batch.direct_matcher_use !== false) errors.push('anchor batch direct_matcher_use must be false')
  for (const ruleId of args.rejectAnchorDomainRules) {
    if (!REJECT_RULES[ruleId]) errors.push(`unknown reject anchor-domain rule: ${ruleId}`)
  }
  if (!args.rejectAnchorDomainRules.length) errors.push('--reject-anchor-domain-rules must not be empty')
}

function hasRiskEvidence(anchor) {
  const flags = anchor.evidence_profile?.risk_flags || []
  return flags.includes('unit_overmatches_many_standards') ||
    flags.includes('single_shared_topic_tag') ||
    flags.includes('low_bridge_score') ||
    flags.some(flag => String(flag).startsWith('deny_term_in_unit_title:'))
}

function matchingRejectRule(row, anchor, ruleIds) {
  if (!anchor) return null
  if (row.reviewer_decision !== 'needs_revision') return null
  if (row.subject_slug !== 'pe' || anchor.subject_slug !== 'pe') return null
  if (row.page_ready !== true || anchor.bridge_context?.page_ready !== true) return null
  if (anchor.evidence_profile?.source_review_decision !== 'needs_revision') return null
  for (const ruleId of ruleIds) {
    const rule = REJECT_RULES[ruleId]
    if (!rule) continue
    if (anchor.action_family !== rule.action_family) continue
    if (anchor.anchor_requirement?.anchor_type !== rule.anchor_type) continue
    if (!rule.domains.has(anchor.standard_context?.domain || row.domain || '')) continue
    if (!hasRiskEvidence(anchor)) continue
    return ruleId
  }
  return null
}

function rejectionNote(ruleId) {
  return REJECT_RULES[ruleId]?.note || `拒绝 ${ruleId}：当前 anchor/domain 证据不足以证明精确 subject-theme bridge。`
}

function applyRecommendation(row, anchor, args, stats) {
  const ruleId = matchingRejectRule(row, anchor, args.rejectAnchorDomainRules)
  if (!ruleId) return row
  countInto(stats.by_rejected_anchor_rule, ruleId)
  countInto(stats.by_rejected_action_family, anchor.action_family)
  countInto(stats.by_rejected_anchor_type, anchor.anchor_requirement.anchor_type)
  countInto(stats.by_rejected_domain, anchor.standard_context.domain)
  countInto(stats.by_rejected_grade_band, row.grade_band)
  countInto(stats.by_rejected_subject, row.subject_slug)
  stats.anchor_rejected_decisions += 1
  stats.changed_decision_ids.push(row.decision_id)
  return {
    ...row,
    decision_note: rejectionNote(ruleId),
    decision_status: 'reviewed',
    reviewed_at: args.reviewedAt,
    reviewed_by: args.reviewer,
    reviewer_decision: 'reject_subject_theme_bridge'
  }
}

function summarize(rows, stats) {
  const summary = {
    anchor_rejected_decisions: stats.anchor_rejected_decisions,
    approved_bridge_decisions: 0,
    by_grade_band: {},
    by_page_status: {},
    by_rejected_action_family: stats.by_rejected_action_family,
    by_rejected_anchor_rule: stats.by_rejected_anchor_rule,
    by_rejected_anchor_type: stats.by_rejected_anchor_type,
    by_rejected_domain: stats.by_rejected_domain,
    by_rejected_grade_band: stats.by_rejected_grade_band,
    by_rejected_subject: stats.by_rejected_subject,
    by_reviewer_decision: {},
    by_subject: {},
    completed_source_review_decisions: 0,
    page_missing_decisions: 0,
    page_ready_decisions: 0,
    pending_source_review_decisions: 0,
    required_source_review_decisions: rows.length
  }
  for (const row of rows) {
    if (row.reviewer_decision === 'approve_standard_scoped_subject_theme_bridge' ||
      row.reviewer_decision === 'approve_progression_group_subject_theme_bridge') {
      summary.approved_bridge_decisions += 1
    }
    if (row.reviewer_decision === 'pending') summary.pending_source_review_decisions += 1
    else summary.completed_source_review_decisions += 1
    if (row.page_ready) summary.page_ready_decisions += 1
    else summary.page_missing_decisions += 1
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_page_status, row.page_range_status || (row.page_ready ? 'ready' : 'missing'))
  }
  return stable(summary)
}

function validateOutput(beforeRows, afterRows, anchorMap, args, stats, errors) {
  if (beforeRows.length !== afterRows.length) errors.push('output decision count changed')
  const beforeById = new Map(beforeRows.map(row => [row.decision_id, row]))
  let changed = 0
  for (const row of afterRows) {
    const before = beforeById.get(row.decision_id)
    if (!before) {
      errors.push(`${row.decision_id || '(missing decision)'} not found in source decisions`)
      continue
    }
    if (before.reviewer_decision !== row.reviewer_decision) {
      changed += 1
      const anchor = anchorMap.get(row.decision_id)
      const ruleId = matchingRejectRule(before, anchor, args.rejectAnchorDomainRules)
      if (!ruleId) errors.push(`${row.decision_id} changed without a safe anchor-domain rule`)
      if (before.reviewer_decision !== 'needs_revision') {
        errors.push(`${row.decision_id} changed from non-needs_revision decision ${before.reviewer_decision}`)
      }
      if (row.reviewer_decision !== 'reject_subject_theme_bridge') {
        errors.push(`${row.decision_id} changed to unsupported decision ${row.reviewer_decision}`)
      }
      if (!anchor) errors.push(`${row.decision_id} changed but has no source anchor review item`)
    }
    if (row.requested_public_write !== false) errors.push(`${row.decision_id} requested_public_write must remain false`)
    if (row.requested_official_text_change !== false) errors.push(`${row.decision_id} requested_official_text_change must remain false`)
    if (row.requested_direct_matcher_use !== false) errors.push(`${row.decision_id} requested_direct_matcher_use must remain false`)
    if (row.requested_eligible_for_h4g_differentiation !== false) {
      errors.push(`${row.decision_id} requested_eligible_for_h4g_differentiation must remain false`)
    }
  }
  if (changed !== stats.anchor_rejected_decisions) {
    errors.push(`changed decision count ${changed} did not match anchor_rejected_decisions ${stats.anchor_rejected_decisions}`)
  }
  if (args.requireItems && stats.anchor_rejected_decisions === 0) {
    errors.push('requireItems is set but no decisions were rejected')
  }
}

function changedRows(rows, stats) {
  const ids = new Set(stats.changed_decision_ids || [])
  return rows.filter(row => ids.has(row.decision_id)).slice(0, 120)
    .map(row => `| ${markdownCell(row.reviewer_decision)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.domain)} | ${markdownCell(row.unit_title)} | ${markdownCell(row.decision_note)} |`)
    .join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Subject Theme Bridge Anchor Decision Recommendations

Generated at: ${payload.generated_at}

This generated decision candidate rejects audited anchor/domain mismatches from
the source-anchor review batch. It does not approve new bridges, write
\`public/data\`, change official standard text, or enable direct matcher use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| source review complete | ${payload.source_review_complete} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |
| anchor rejected decisions | ${payload.summary.anchor_rejected_decisions} |
| approved bridge decisions | ${payload.summary.approved_bridge_decisions} |
| needs revision decisions | ${payload.summary.by_reviewer_decision.needs_revision || 0} |
| rejected decisions | ${payload.summary.by_reviewer_decision.reject_subject_theme_bridge || 0} |

## Rejected Anchor Rules

| rule | decisions |
| --- | ---: |
${countRows(payload.summary.by_rejected_anchor_rule)}

## Rejected Domains

| domain | decisions |
| --- | ---: |
${countRows(payload.summary.by_rejected_domain)}

## Decisions By Status

| decision | count |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## Changed Rows

| Decision | Subject | Grade | Standard | Domain | Unit | Note |
| --- | --- | --- | --- | --- | --- | --- |
${changedRows(payload.bridge_review_decisions, payload.anchor_decision_recommendation.stats)}

## Boundary

- This pass only rejects selected \`needs_revision\` anchor/domain mismatches.
- Existing approvals are preserved but not expanded.
- Later registry, matcher, consistency, and publication gates are still required.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const errors = []
  if (!existsSync(args.decisions)) errors.push(`Missing decisions file: ${args.decisions}`)
  if (!existsSync(args.anchorBatch)) errors.push(`Missing anchor batch: ${args.anchorBatch}`)
  if (errors.length) {
    console.log(JSON.stringify({ errors, valid: false }, null, 2))
    if (args.strict) process.exit(1)
    return
  }
  const decisions = readJson(args.decisions)
  const anchorBatch = readJson(args.anchorBatch)
  validateInputs(decisions, anchorBatch, args, errors)
  const anchorMap = anchorByDecisionId(anchorBatch)
  const stats = {
    anchor_rejected_decisions: 0,
    by_rejected_action_family: {},
    by_rejected_anchor_rule: {},
    by_rejected_anchor_type: {},
    by_rejected_domain: {},
    by_rejected_grade_band: {},
    by_rejected_subject: {},
    changed_decision_ids: []
  }
  const beforeRows = decisions.bridge_review_decisions || []
  const afterRows = beforeRows.map(row => applyRecommendation(row, anchorMap.get(row.decision_id), args, stats))
  validateOutput(beforeRows, afterRows, anchorMap, args, stats, errors)
  const summary = summarize(afterRows, stats)
  const payload = {
    ...decisions,
    anchor_decision_recommendation: {
      policy: 'reject_selected_needs_revision_anchor_domain_mismatches_only',
      rejected_anchor_domain_rules: args.rejectAnchorDomainRules,
      reviewed_at: args.reviewedAt,
      reviewed_by: args.reviewer,
      source_anchor_batch: args.anchorBatch,
      source_decisions: args.decisions,
      stats
    },
    bridge_review_decisions: afterRows,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    publication_ready: false,
    source_review_complete: summary.pending_source_review_decisions === 0,
    summary,
    valid: errors.length === 0,
    writes_public_data: false
  }
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable({
    errors,
    out: args.out,
    source_review_complete: payload.source_review_complete,
    summary: payload.summary,
    summary_out: args.summaryOut,
    valid: payload.valid
  }), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
