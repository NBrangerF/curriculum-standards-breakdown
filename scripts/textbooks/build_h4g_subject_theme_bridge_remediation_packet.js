#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_review_decisions_full_page_recovered_codex_reviewed_english_pe.json'
const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_review_worklist_full_page_recovered_codex_reviewed_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_remediation_packet_full_page_recovered_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_remediation_packet_full_page_recovered_english_pe.md'

const ACTION_FAMILIES = new Set([
  'english_language_use_requires_function_anchor',
  'english_learning_strategy_requires_standard_anchor',
  'english_culture_theme_requires_cultural_objective_review',
  'english_communication_topic_requires_speech_function_anchor',
  'english_topic_requires_curriculum_review',
  'pe_health_theory_requires_health_behavior_review',
  'pe_activity_skill_requires_movement_standard_anchor',
  'pe_quality_or_performance_requires_curriculum_progression_review',
  'pe_topic_requires_curriculum_review'
])

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    worklist: DEFAULT_WORKLIST,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireItems: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--worklist') args.worklist = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_remediation_packet.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_full_page_recovered_codex_reviewed_english_pe.json \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_review_worklist_full_page_recovered_codex_reviewed_english_pe.json \\
  --strict --require-items

Builds a read-only remediation packet for H4G subject-theme bridge decisions
whose source review result is needs_revision. It does not approve bridges,
write public/data, change official standard text, or enable matcher use.`)
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

function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

function decisionById(decisions) {
  return new Map((decisions.bridge_review_decisions || []).map(row => [row.decision_id, row]))
}

function workByDecisionId(worklist) {
  return new Map((worklist.work_items || []).map(row => [row.source_decision_id, row]))
}

function hasAny(values, options) {
  const set = new Set(values || [])
  return options.some(option => set.has(option))
}

function includesAny(text, patterns) {
  return patterns.some(pattern => pattern.test(text))
}

function actionPriority(row, workItem) {
  const riskFlags = workItem?.risk_flags || []
  if (workItem?.priority_tier === 1) return 'high'
  if (riskFlags.includes('quality_or_performance_standard_needs_curriculum_review')) return 'high'
  if (riskFlags.includes('low_bridge_score')) return 'medium'
  return 'medium'
}

function classify(row, workItem) {
  const tags = row.shared_topic_tags || []
  const unit = row.unit_title || ''
  const subject = row.subject_slug || ''
  const riskFlags = workItem?.risk_flags || []
  if (subject === 'english') {
    if (/language in use/i.test(unit)) {
      return {
        action_family: 'english_language_use_requires_function_anchor',
        decision_owner: 'english_curriculum_source_review',
        recommended_next_step: 'Review concrete language-function activities or task evidence; do not use Language in use as a standalone bridge.'
      }
    }
    if (hasAny(tags, ['language_learning'])) {
      return {
        action_family: 'english_learning_strategy_requires_standard_anchor',
        decision_owner: 'english_curriculum_source_review',
        recommended_next_step: 'Map the unit to an exact learning-strategy or language-knowledge standard only if source text supports the specific standard.'
      }
    }
    if (hasAny(tags, ['culture_places'])) {
      return {
        action_family: 'english_culture_theme_requires_cultural_objective_review',
        decision_owner: 'english_curriculum_source_review',
        recommended_next_step: 'Confirm the cultural object, comparison task, and target standard; broad culture/place topics remain blocked.'
      }
    }
    if (hasAny(tags, ['school_life', 'feelings_communication', 'greetings_identity', 'daily_life', 'sports_health'])) {
      return {
        action_family: 'english_communication_topic_requires_speech_function_anchor',
        decision_owner: 'english_curriculum_source_review',
        recommended_next_step: 'Anchor the everyday communication topic to a speech function, discourse type, or exact standard before approval.'
      }
    }
    return {
      action_family: 'english_topic_requires_curriculum_review',
      decision_owner: 'english_curriculum_source_review',
      recommended_next_step: 'Keep blocked until a narrower English topic or standard-level source review is available.'
    }
  }
  if (subject === 'pe') {
    if (riskFlags.includes('quality_or_performance_standard_needs_curriculum_review')) {
      return {
        action_family: 'pe_quality_or_performance_requires_curriculum_progression_review',
        decision_owner: 'pe_curriculum_progression_review',
        recommended_next_step: 'Keep as curriculum progression review; quality/performance standards need non-unit or rubric evidence before any bridge approval.'
      }
    }
    if (hasAny(tags, ['health_theory', 'fitness_training_load', 'sports_health']) ||
      includesAny(unit, [/体育与健康理论知识/, /运动负荷/, /健康/, /理论知识/])) {
      return {
        action_family: 'pe_health_theory_requires_health_behavior_review',
        decision_owner: 'pe_curriculum_source_review',
        recommended_next_step: 'Confirm the health-behavior or load-management standard; broad health/theory titles do not prove a movement-skill bridge.'
      }
    }
    if (hasAny(tags, ['ball_games', 'football', 'basketball', 'volleyball', 'table_tennis', 'gymnastics', 'martial_arts_traditional', 'swimming_water_sports', 'track_and_field']) ||
      includesAny(unit, [/足球/, /篮球/, /排球/, /乒乓球/, /体操/, /武术/, /游泳/, /田径/])) {
      return {
        action_family: 'pe_activity_skill_requires_movement_standard_anchor',
        decision_owner: 'pe_curriculum_source_review',
        recommended_next_step: 'Anchor the activity to an exact movement-skill, fitness, or sportsmanship standard; activity name alone is insufficient.'
      }
    }
    return {
      action_family: 'pe_topic_requires_curriculum_review',
      decision_owner: 'pe_curriculum_source_review',
      recommended_next_step: 'Keep blocked until a narrower PE taxonomy or standard-level source review is available.'
    }
  }
  return {
    action_family: 'english_topic_requires_curriculum_review',
    decision_owner: 'curriculum_source_review',
    recommended_next_step: 'Keep blocked until a subject-specific remediation rule is defined.'
  }
}

function reasonCodes(row, workItem, action) {
  const codes = []
  for (const flag of workItem?.risk_flags || []) codes.push(flag)
  for (const tag of row.shared_topic_tags || []) codes.push(`shared_topic:${tag}`)
  codes.push(`action_family:${action.action_family}`)
  if (row.bridge_score < 14) codes.push('bridge_score_below_strong_review_threshold')
  return sorted(codes)
}

function remediationItem(row, workItem) {
  const action = classify(row, workItem)
  return {
    action: {
      ...action,
      action_priority: actionPriority(row, workItem),
      changes_official_standard_text: false,
      direct_matcher_use: false,
      eligible_for_h4g_differentiation: false,
      requires_later_matcher_gate: true,
      requires_later_publication_gate: true,
      writes_public_data: false
    },
    bridge_context: {
      bridge_score: row.bridge_score,
      page_range: row.page_range || '',
      page_range_status: row.page_range_status || '',
      page_ready: row.page_ready === true,
      page_start: row.page_start ?? null,
      shared_topic_tags: row.shared_topic_tags || [],
      standard_topic_tags: row.standard_topic_tags || [],
      unit_topic_tags: row.unit_topic_tags || []
    },
    evidence_profile: {
      fanout: workItem?.fanout || {},
      reason_codes: reasonCodes(row, workItem, action),
      risk_flags: workItem?.risk_flags || [],
      review_path: workItem?.review_path || '',
      source_review_decision: row.reviewer_decision
    },
    grade_band: row.grade_band || '',
    progression_group_id: row.progression_group_id || '',
    remediation_item_id: `h4g_subject_theme_bridge_remediation_${hashText(row.decision_id)}`,
    source_decision_id: row.decision_id || '',
    source_review_id: row.source_review_id || '',
    source_work_item_id: workItem?.work_item_id || '',
    standard_context: {
      domain: row.domain || '',
      standard_code: row.standard_code || '',
      subdomain: row.subdomain || '',
      subject_slug: row.subject_slug || ''
    },
    unit_context: {
      edition: row.edition || '',
      textbook_evidence_id: row.textbook_evidence_id || '',
      unit_evidence_id: row.unit_evidence_id || '',
      unit_level: row.unit_level || '',
      unit_title: row.unit_title || '',
      volume: row.volume || ''
    }
  }
}

function validateInputs(decisions, worklist, args, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_review_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_review_decisions_template')
  }
  if (decisions.writes_public_data !== false) errors.push('decisions writes_public_data must be false')
  if (decisions.changes_official_standard_text !== false) errors.push('decisions changes_official_standard_text must be false')
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_source_review_worklist') {
    errors.push('worklist purpose must be h4g_subject_theme_bridge_source_review_worklist')
  }
  if (worklist.writes_public_data !== false) errors.push('worklist writes_public_data must be false')
  if (worklist.changes_official_standard_text !== false) errors.push('worklist changes_official_standard_text must be false')
  if (args.requireItems && !(decisions.bridge_review_decisions || []).some(row => row.reviewer_decision === 'needs_revision')) {
    errors.push('requireItems is set but decisions has no needs_revision rows')
  }
}

function buildSummary(items) {
  const summary = {
    affected_progression_groups: sorted(items.map(item => item.progression_group_id)).length,
    affected_standards: sorted(items.map(item => item.standard_context.standard_code)).length,
    by_action_family: {},
    by_action_priority: {},
    by_decision_owner: {},
    by_grade_band: {},
    by_risk_flag: {},
    by_shared_topic_tag: {},
    by_subject: {},
    remediation_items: items.length
  }
  for (const item of items) {
    countInto(summary.by_action_family, item.action.action_family)
    countInto(summary.by_action_priority, item.action.action_priority)
    countInto(summary.by_decision_owner, item.action.decision_owner)
    countInto(summary.by_grade_band, item.grade_band)
    countInto(summary.by_subject, item.standard_context.subject_slug)
    for (const tag of item.bridge_context.shared_topic_tags) countInto(summary.by_shared_topic_tag, tag)
    for (const flag of item.evidence_profile.risk_flags) countInto(summary.by_risk_flag, flag)
  }
  return stable(summary)
}

function validatePayload(payload, errors) {
  const seen = new Set()
  for (const item of payload.remediation_items || []) {
    const prefix = item.remediation_item_id || '(missing remediation item)'
    if (!item.remediation_item_id) errors.push(`${prefix} missing remediation_item_id`)
    if (seen.has(item.source_decision_id)) errors.push(`${prefix} duplicate source_decision_id ${item.source_decision_id}`)
    seen.add(item.source_decision_id)
    if (!ACTION_FAMILIES.has(item.action?.action_family)) errors.push(`${prefix} invalid action_family ${item.action?.action_family}`)
    if (item.evidence_profile?.source_review_decision !== 'needs_revision') errors.push(`${prefix} source_review_decision must be needs_revision`)
    if (item.bridge_context?.page_ready !== true) errors.push(`${prefix} page_ready must be true`)
    if (item.action?.writes_public_data !== false) errors.push(`${prefix} must not write public data`)
    if (item.action?.changes_official_standard_text !== false) errors.push(`${prefix} must not change official standard text`)
    if (item.action?.direct_matcher_use !== false) errors.push(`${prefix} must not request direct matcher use`)
    if (item.action?.eligible_for_h4g_differentiation !== false) errors.push(`${prefix} must not be eligible for H4G differentiation`)
  }
}

function itemRows(items) {
  return items.slice(0, 80).map(item => {
    const tags = item.bridge_context.shared_topic_tags.join(', ')
    return `| ${markdownCell(item.action.action_family)} | ${markdownCell(item.action.action_priority)} | ${markdownCell(item.standard_context.subject_slug)} | ${markdownCell(item.grade_band)} | ${markdownCell(item.standard_context.standard_code)} | ${markdownCell(item.unit_context.unit_title)} | ${markdownCell(tags)} | ${markdownCell(item.action.recommended_next_step)} |`
  }).join('\n') || '| - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Subject Theme Bridge Remediation Packet

Generated at: ${payload.generated_at}

This is a read-only action packet for subject-theme bridge decisions marked
\`needs_revision\`. It does not approve new bridges, write \`public/data\`,
change official standard text, or enable direct matcher use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| remediation items | ${payload.summary.remediation_items} |
| affected standards | ${payload.summary.affected_standards} |
| affected progression groups | ${payload.summary.affected_progression_groups} |
| publication ready | ${payload.publication_ready} |
| matcher ready | ${payload.matcher_ready} |

## Action Families

| action family | items |
| --- | ---: |
${countRows(payload.summary.by_action_family)}

## Subjects

| subject | items |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Shared Topics

| topic | items |
| --- | ---: |
${countRows(payload.summary.by_shared_topic_tag)}

## Sample Items

| Action | Priority | Subject | Grade | Standard | Unit | Tags | Next step |
| --- | --- | --- | --- | --- | --- | --- | --- |
${itemRows(payload.remediation_items)}

## Boundary

- Approved and rejected decisions are intentionally excluded.
- Every item must come from a page-ready \`needs_revision\` decision.
- Same-grade publication remains blocked until a later source review, matcher, candidate, consistency, and publication gate.
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
  if (!existsSync(args.worklist)) errors.push(`Missing worklist file: ${args.worklist}`)
  if (errors.length) {
    console.log(JSON.stringify({ valid: false, errors }, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const decisions = readJson(args.decisions)
  const worklist = readJson(args.worklist)
  validateInputs(decisions, worklist, args, errors)
  const byDecision = workByDecisionId(worklist)
  const items = (decisions.bridge_review_decisions || [])
    .filter(row => row.reviewer_decision === 'needs_revision')
    .map(row => remediationItem(row, byDecision.get(row.decision_id)))
  const payload = {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: {
      approved_decisions_excluded: true,
      changes_official_standard_text: false,
      direct_matcher_use: false,
      needs_revision_only: true,
      read_only_remediation_packet: true,
      writes_public_data: false
    },
    publication_candidate: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_remediation_packet',
    remediation_items: items,
    source_decisions: args.decisions,
    source_worklist: args.worklist,
    summary: buildSummary(items),
    valid: errors.length === 0,
    writes_public_data: false
  }
  validatePayload(payload, errors)
  payload.valid = errors.length === 0
  payload.errors = errors
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable({
    errors,
    out: args.out,
    summary: payload.summary,
    summary_out: args.summaryOut,
    valid: payload.valid
  }), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
