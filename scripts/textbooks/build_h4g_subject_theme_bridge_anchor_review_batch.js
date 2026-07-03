#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_remediation_packet_language_use_pe_quality_rejected_english_pe.json'
const DEFAULT_MATRIX = 'generated/textbook_evidence/h4g_theme_bridge_progression_matrix_language_use_pe_quality_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_language_use_pe_quality_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_language_use_pe_quality_rejected_english_pe.md'

const ANCHOR_RULES = {
  english_communication_topic_requires_speech_function_anchor: {
    acceptable_anchor_examples: [
      'speech function such as request, advice, greeting, self-introduction, preference, or feeling expression',
      'discourse task tied to the target skill standard',
      'source activity showing the exact communicative function, not only a broad topic'
    ],
    anchor_type: 'english_speech_function_or_discourse_anchor',
    approval_gate: 'Approve only as a standard-scoped bridge when the unit source explicitly supports the target speech function or discourse skill.',
    decision_owner: 'english_curriculum_source_review',
    keep_needs_revision_if: 'Keep needs_revision when the source shows a broad topic but not the target speech function or exact standard.',
    reject_if: 'Reject when the unit only shares a daily-life, school-life, feeling, greeting, or sports-health topic with the standard.',
    review_questions: [
      'What exact speech function or discourse task does the unit ask learners to perform?',
      'Does that function match the target standard code, not just the progression group theme?',
      'Is the evidence same-grade, page-ready, and bounded to this unit?'
    ]
  },
  english_culture_theme_requires_cultural_objective_review: {
    acceptable_anchor_examples: [
      'specific cultural object, practice, place, comparison, or intercultural judgement task',
      'source activity requiring learners to identify, compare, explain, or evaluate cultural information',
      'standard wording that names the same cultural objective'
    ],
    anchor_type: 'english_cultural_objective_anchor',
    approval_gate: 'Approve only when the unit source supports the cultural objective required by the target standard.',
    decision_owner: 'english_curriculum_source_review',
    keep_needs_revision_if: 'Keep needs_revision when the source is cultural in theme but does not show the target cultural objective.',
    reject_if: 'Reject when the only evidence is a broad culture/place keyword or module title.',
    review_questions: [
      'What cultural object, practice, place, or comparison task is visible in the source?',
      'Does the task prove the target cultural-awareness standard rather than a generic culture topic?',
      'Can the anchor be scoped to the same grade and unit page range?'
    ]
  },
  english_learning_strategy_requires_standard_anchor: {
    acceptable_anchor_examples: [
      'learning strategy task such as planning, monitoring, reflecting, using resources, or revising',
      'language knowledge focus explicitly tied to the target standard',
      'source activity that names the learning method or language-learning behavior'
    ],
    anchor_type: 'english_learning_strategy_or_language_knowledge_anchor',
    approval_gate: 'Approve only when the source explicitly supports the learning-strategy or language-knowledge standard.',
    decision_owner: 'english_curriculum_source_review',
    keep_needs_revision_if: 'Keep needs_revision when the unit is about learning English generally but does not evidence the target strategy.',
    reject_if: 'Reject when the evidence is only a title such as learning English, school life, or language learning.',
    review_questions: [
      'What learner strategy, method, or language-knowledge focus appears in the source?',
      'Does it map to the target standard code rather than only to a broad language-learning tag?',
      'Is the bridge bounded to reviewed source text and same-grade evidence?'
    ]
  },
  pe_activity_skill_requires_movement_standard_anchor: {
    acceptable_anchor_examples: [
      'specific movement skill, technique, tactic, or practice task',
      'fitness or sportsmanship objective explicitly tied to the activity',
      'source section showing the activity supports the target PE domain'
    ],
    anchor_type: 'pe_movement_skill_fitness_or_sportsmanship_anchor',
    approval_gate: 'Approve only when the activity source proves the target movement skill, fitness, or sportsmanship standard.',
    decision_owner: 'pe_curriculum_source_review',
    keep_needs_revision_if: 'Keep needs_revision when the activity belongs to PE but the target domain or skill is not explicit.',
    reject_if: 'Reject when the bridge relies only on an activity name such as football, basketball, volleyball, gymnastics, or track and field.',
    review_questions: [
      'Which movement skill, technique, tactic, fitness objective, or sportsmanship behavior is visible?',
      'Does the source support the target standard domain, not only the same sport category?',
      'Is there same-grade page-ready evidence for the unit section?'
    ]
  },
  pe_health_theory_requires_health_behavior_review: {
    acceptable_anchor_examples: [
      'health behavior, safety behavior, load monitoring, or self-management objective',
      'source section requiring learners to apply health or load-management knowledge',
      'standard wording that matches the health behavior rather than a generic health title'
    ],
    anchor_type: 'pe_health_behavior_or_load_management_anchor',
    approval_gate: 'Approve only when the source proves the target health behavior, safety, or load-management standard.',
    decision_owner: 'pe_curriculum_source_review',
    keep_needs_revision_if: 'Keep needs_revision when the section is health/theory related but does not evidence the target behavior.',
    reject_if: 'Reject when the bridge relies only on health, theory, PE, or exercise-load keywords.',
    review_questions: [
      'What health behavior, safety behavior, or load-management action is required by the source?',
      'Does the anchor support the target standard code rather than a generic health-theory topic?',
      'Is the evidence page-ready and bounded to the same grade/unit?'
    ]
  }
}

function parseArgs(argv) {
  const args = {
    matrix: DEFAULT_MATRIX,
    out: DEFAULT_OUT,
    packet: DEFAULT_PACKET,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--packet') args.packet = argv[++i]
    else if (item === '--matrix') args.matrix = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_review_batch.js \\
  --packet generated/textbook_evidence/h4g_theme_bridge_remediation_packet_language_use_pe_quality_rejected_english_pe.json \\
  --matrix generated/textbook_evidence/h4g_theme_bridge_progression_matrix_language_use_pe_quality_rejected_english_pe.json \\
  --strict --require-items

Builds a read-only source-anchor review batch for remaining H4G English/PE
subject-theme bridge remediation items. It does not approve bridges, write
public/data, change official standard text, or enable matcher use.`)
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

function compactList(values, limit = 6) {
  const items = sorted(values)
  if (items.length <= limit) return items.join('；')
  return `${items.slice(0, limit).join('；')}；...(+${items.length - limit})`
}

function matrixByGroup(matrix) {
  return new Map((matrix.progression_groups || []).map(row => [row.progression_group_id, row]))
}

function validateInputs(packet, matrix, args, errors) {
  if (packet.valid !== true) errors.push('remediation packet valid must be true')
  if (packet.purpose !== 'h4g_subject_theme_bridge_remediation_packet') {
    errors.push('remediation packet purpose must be h4g_subject_theme_bridge_remediation_packet')
  }
  if (!Array.isArray(packet.remediation_items)) errors.push('remediation packet remediation_items must be an array')
  if (packet.writes_public_data !== false) errors.push('remediation packet writes_public_data must be false')
  if (packet.changes_official_standard_text !== false) errors.push('remediation packet changes_official_standard_text must be false')
  if (packet.direct_matcher_use !== false) errors.push('remediation packet direct_matcher_use must be false')
  if (matrix.valid !== true) errors.push('progression matrix valid must be true')
  if (matrix.purpose !== 'h4g_subject_theme_bridge_progression_matrix') {
    errors.push('progression matrix purpose must be h4g_subject_theme_bridge_progression_matrix')
  }
  if (!Array.isArray(matrix.progression_groups)) errors.push('progression matrix progression_groups must be an array')
  if (matrix.writes_public_data !== false) errors.push('progression matrix writes_public_data must be false')
  if (matrix.changes_official_standard_text !== false) errors.push('progression matrix changes_official_standard_text must be false')
  if (matrix.direct_matcher_use !== false) errors.push('progression matrix direct_matcher_use must be false')
  if (args.requireItems && !(packet.remediation_items || []).length) {
    errors.push('requireItems is set but remediation packet has no items')
  }
}

function reviewItem(item, matrixItem) {
  const actionFamily = item.action?.action_family || ''
  const rule = ANCHOR_RULES[actionFamily] || {}
  return {
    action_family: actionFamily,
    action_priority: item.action?.action_priority || '',
    anchor_requirement: {
      acceptable_anchor_examples: rule.acceptable_anchor_examples || [],
      anchor_type: rule.anchor_type || 'unknown_anchor_type',
      approval_gate: rule.approval_gate || '',
      keep_needs_revision_if: rule.keep_needs_revision_if || '',
      reject_if: rule.reject_if || '',
      review_questions: rule.review_questions || []
    },
    anchor_review_item_id: `h4g_subject_theme_bridge_anchor_review_${hashText(item.remediation_item_id || item.source_decision_id)}`,
    bridge_context: {
      bridge_score: item.bridge_context?.bridge_score ?? null,
      page_range: item.bridge_context?.page_range || '',
      page_range_status: item.bridge_context?.page_range_status || '',
      page_ready: item.bridge_context?.page_ready === true,
      page_start: item.bridge_context?.page_start ?? null,
      shared_topic_tags: item.bridge_context?.shared_topic_tags || [],
      standard_topic_tags: item.bridge_context?.standard_topic_tags || [],
      unit_topic_tags: item.bridge_context?.unit_topic_tags || []
    },
    decision_template: {
      acceptable_decisions: [
        'approve_standard_scoped_subject_theme_bridge',
        'reject_subject_theme_bridge',
        'needs_revision'
      ],
      changes_official_standard_text: false,
      direct_matcher_use: false,
      eligible_for_h4g_differentiation: false,
      matcher_ready: false,
      publication_ready: false,
      requires_later_matcher_gate: true,
      requires_later_publication_gate: true,
      writes_public_data: false
    },
    decision_owner: rule.decision_owner || item.action?.decision_owner || '',
    evidence_profile: {
      fanout: item.evidence_profile?.fanout || {},
      reason_codes: item.evidence_profile?.reason_codes || [],
      review_path: item.evidence_profile?.review_path || '',
      risk_flags: item.evidence_profile?.risk_flags || [],
      source_review_decision: item.evidence_profile?.source_review_decision || ''
    },
    grade_band: item.grade_band || '',
    matrix_context: {
      approved_grade_bands: matrixItem?.coverage?.approved_grade_bands || [],
      matrix_item_id: matrixItem?.matrix_item_id || '',
      public_grade_bands: matrixItem?.coverage?.public_grade_bands || [],
      remediation_grade_bands: matrixItem?.coverage?.remediation_grade_bands || [],
      remediation_item_count: matrixItem?.summary?.remediation_item_count || 0,
      resolution_track: matrixItem?.resolution?.track || '',
      unresolved_grade_bands: matrixItem?.coverage?.unresolved_grade_bands || []
    },
    progression_group_id: item.progression_group_id || '',
    remediation_item_id: item.remediation_item_id || '',
    source_decision_id: item.source_decision_id || '',
    source_review_id: item.source_review_id || '',
    source_work_item_id: item.source_work_item_id || '',
    standard_context: {
      domain: item.standard_context?.domain || '',
      standard_code: item.standard_context?.standard_code || '',
      subdomain: item.standard_context?.subdomain || '',
      subject_slug: item.standard_context?.subject_slug || ''
    },
    subject_slug: item.standard_context?.subject_slug || '',
    unit_context: {
      edition: item.unit_context?.edition || '',
      textbook_evidence_id: item.unit_context?.textbook_evidence_id || '',
      unit_evidence_id: item.unit_context?.unit_evidence_id || '',
      unit_level: item.unit_context?.unit_level || '',
      unit_title: item.unit_context?.unit_title || '',
      volume: item.unit_context?.volume || ''
    }
  }
}

function buildSummary(items) {
  const summary = {
    affected_progression_groups: sorted(items.map(item => item.progression_group_id)).length,
    affected_standards: sorted(items.map(item => item.standard_context.standard_code)).length,
    by_action_family: {},
    by_action_priority: {},
    by_anchor_type: {},
    by_decision_owner: {},
    by_grade_band: {},
    by_resolution_track: {},
    by_subject: {},
    high_priority_items: 0,
    page_ready_items: 0,
    review_items: items.length
  }
  for (const item of items) {
    countInto(summary.by_action_family, item.action_family)
    countInto(summary.by_action_priority, item.action_priority)
    countInto(summary.by_anchor_type, item.anchor_requirement.anchor_type)
    countInto(summary.by_decision_owner, item.decision_owner)
    countInto(summary.by_grade_band, item.grade_band)
    countInto(summary.by_resolution_track, item.matrix_context.resolution_track)
    countInto(summary.by_subject, item.subject_slug)
    if (item.action_priority === 'high') summary.high_priority_items += 1
    if (item.bridge_context.page_ready) summary.page_ready_items += 1
  }
  return stable(summary)
}

function validatePayload(payload, packet, matrix, errors) {
  if (payload.publication_ready !== false) errors.push('anchor review batch publication_ready must be false')
  if (payload.publication_candidate !== false) errors.push('anchor review batch publication_candidate must be false')
  if (payload.matcher_ready !== false) errors.push('anchor review batch matcher_ready must be false')
  if (payload.writes_public_data !== false) errors.push('anchor review batch writes_public_data must be false')
  if (payload.changes_official_standard_text !== false) errors.push('anchor review batch changes_official_standard_text must be false')
  if (payload.direct_matcher_use !== false) errors.push('anchor review batch direct_matcher_use must be false')
  if (payload.policy?.read_only !== true) errors.push('anchor review batch policy.read_only must be true')
  const packetIds = sorted((packet.remediation_items || []).map(item => item.remediation_item_id))
  const batchIds = sorted((payload.anchor_review_items || []).map(item => item.remediation_item_id))
  const missing = packetIds.filter(id => !batchIds.includes(id))
  const extra = batchIds.filter(id => !packetIds.includes(id))
  if (missing.length) errors.push(`${missing.length} remediation items missing from anchor review batch`)
  if (extra.length) errors.push(`${extra.length} anchor review items not found in remediation packet`)
  const matrixGroups = new Set((matrix.progression_groups || []).map(item => item.progression_group_id))
  const seen = new Set()
  for (const item of payload.anchor_review_items || []) {
    const prefix = item.anchor_review_item_id || item.remediation_item_id || '(missing anchor item)'
    if (!item.anchor_review_item_id) errors.push(`${prefix} missing anchor_review_item_id`)
    if (!item.remediation_item_id) errors.push(`${prefix} missing remediation_item_id`)
    if (seen.has(item.remediation_item_id)) errors.push(`${prefix} duplicate remediation_item_id`)
    seen.add(item.remediation_item_id)
    if (!item.source_decision_id) errors.push(`${prefix} missing source_decision_id`)
    if (!item.progression_group_id) errors.push(`${prefix} missing progression_group_id`)
    if (!matrixGroups.has(item.progression_group_id)) errors.push(`${prefix} progression_group_id missing from matrix`)
    if (!ANCHOR_RULES[item.action_family]) errors.push(`${prefix} unknown action_family ${item.action_family}`)
    if (!item.anchor_requirement?.anchor_type) errors.push(`${prefix} missing anchor_requirement.anchor_type`)
    if (!item.anchor_requirement?.review_questions?.length) errors.push(`${prefix} missing review questions`)
    if (!item.standard_context?.standard_code) errors.push(`${prefix} missing standard code`)
    if (!item.unit_context?.unit_evidence_id) errors.push(`${prefix} missing unit evidence id`)
    if (item.evidence_profile?.source_review_decision !== 'needs_revision') {
      errors.push(`${prefix} source_review_decision must be needs_revision`)
    }
    if (item.decision_template?.writes_public_data !== false) errors.push(`${prefix} must not write public data`)
    if (item.decision_template?.changes_official_standard_text !== false) {
      errors.push(`${prefix} must not change official standard text`)
    }
    if (item.decision_template?.direct_matcher_use !== false) errors.push(`${prefix} must not request direct matcher use`)
    if (item.decision_template?.eligible_for_h4g_differentiation !== false) {
      errors.push(`${prefix} must not be eligible for h4g differentiation before review`)
    }
  }
}

function itemRows(items) {
  return items.slice(0, 80).map(item => {
    return `| ${markdownCell(item.action_family)} | ${markdownCell(item.anchor_requirement.anchor_type)} | ${markdownCell(item.grade_band)} | ${markdownCell(item.standard_context.standard_code)} | ${markdownCell(item.unit_context.unit_title)} | ${markdownCell(compactList(item.bridge_context.shared_topic_tags))} | ${markdownCell(item.matrix_context.resolution_track)} |`
  }).join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Subject Theme Bridge Anchor Review Batch

Generated at: ${payload.generated_at}

This is a read-only source-anchor review batch for remaining H4G English/PE
subject-theme bridge remediation items. It converts broad topic matches into
subject-specific review questions. It does not approve bridges, write
\`public/data\`, change official standard text, or enable matcher use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| review items | ${payload.summary.review_items} |
| affected standards | ${payload.summary.affected_standards} |
| affected progression groups | ${payload.summary.affected_progression_groups} |
| high priority items | ${payload.summary.high_priority_items} |
| page-ready items | ${payload.summary.page_ready_items} |
| publication ready | ${payload.publication_ready} |
| matcher ready | ${payload.matcher_ready} |

## Action Families

| family | items |
| --- | ---: |
${countRows(payload.summary.by_action_family)}

## Anchor Types

| anchor type | items |
| --- | ---: |
${countRows(payload.summary.by_anchor_type)}

## Resolution Tracks

| track | items |
| --- | ---: |
${countRows(payload.summary.by_resolution_track)}

## Review Items

| Action family | Anchor type | Grade | Standard | Unit | Shared tags | Matrix track |
| --- | --- | --- | --- | --- | --- | --- |
${itemRows(payload.anchor_review_items)}

## Boundary

- Approval is allowed only after source review proves a standard-scoped anchor.
- Broad topic overlap remains insufficient for H4G7/H4G8/H4G9 differentiation.
- This batch is not a publication candidate and cannot be used directly by the matcher.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const errors = []
  for (const [label, path] of [['packet', args.packet], ['matrix', args.matrix]]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  if (errors.length) {
    const result = { errors, valid: false }
    console.log(JSON.stringify(result, null, 2))
    if (args.strict) process.exit(1)
    return
  }
  const packet = readJson(args.packet)
  const matrix = readJson(args.matrix)
  validateInputs(packet, matrix, args, errors)
  const matrixItems = matrixByGroup(matrix)
  const items = (packet.remediation_items || [])
    .map(item => reviewItem(item, matrixItems.get(item.progression_group_id)))
    .sort((a, b) => {
      const priority = (a.action_priority === 'high' ? 0 : 1) - (b.action_priority === 'high' ? 0 : 1)
      if (priority) return priority
      const family = a.action_family.localeCompare(b.action_family)
      if (family) return family
      const grade = a.grade_band.localeCompare(b.grade_band)
      if (grade) return grade
      return a.remediation_item_id.localeCompare(b.remediation_item_id)
    })
  const payload = {
    anchor_review_items: items,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: {
      anchor_review_batch_only: true,
      changes_official_standard_text: false,
      direct_matcher_use: false,
      read_only: true,
      requires_later_matcher_gate: true,
      requires_later_publication_gate: true,
      writes_public_data: false
    },
    publication_candidate: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_review_batch',
    source_progression_matrix: args.matrix,
    source_remediation_packet: args.packet,
    summary: buildSummary(items),
    valid: false,
    writes_public_data: false
  }
  validatePayload(payload, packet, matrix, errors)
  payload.valid = errors.length === 0
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
