#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_action_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_TRIAGE_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_triage_candidate_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_STANDARDS_ROOT = 'public/data/by_subject'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_split_review_batch_anchor_domain_rejected_english_pe.md'

const SPLIT_REVIEW_DECISION = 'split_or_refine_group_scope'
const SPLIT_WORK_PATH = 'split_scope_before_item_review'

const REVIEW_FOCUS_BY_ACTION = {
  english_communication_topic_requires_speech_function_anchor: 'Confirm the exact speech function or discourse task shown by each unit before any standard-scoped bridge decision.',
  english_culture_theme_requires_cultural_objective_review: 'Confirm the unit supports the target cultural objective, not only a broad cultural place or situation topic.',
  english_learning_strategy_requires_standard_anchor: 'Confirm the unit explicitly teaches or practices the target learning strategy or language-knowledge requirement.',
  pe_activity_skill_requires_movement_standard_anchor: 'Confirm the unit evidence shows the target movement skill, fitness behavior, or sportsmanship standard.',
  pe_health_theory_requires_health_behavior_review: 'Confirm the unit evidence shows the target health behavior or load-management requirement, not only a generic health topic.'
}

function parseArgs(argv) {
  const args = {
    anchorBatch: DEFAULT_ANCHOR_BATCH,
    maxRank: Number.POSITIVE_INFINITY,
    minRank: 1,
    out: DEFAULT_OUT,
    requireCandidates: false,
    standardsRoot: DEFAULT_STANDARDS_ROOT,
    strict: false,
    subjects: null,
    summaryOut: DEFAULT_SUMMARY_OUT,
    triageDecisions: DEFAULT_TRIAGE_DECISIONS,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--triage-decisions') args.triageDecisions = argv[++i]
    else if (item === '--anchor-batch') args.anchorBatch = argv[++i]
    else if (item === '--standards-root') args.standardsRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subjects') args.subjects = parseList(argv[++i])
    else if (item === '--min-rank') args.minRank = Number(argv[++i])
    else if (item === '--max-rank') args.maxRank = Number(argv[++i])
    else if (item === '--strict') args.strict = true
    else if (item === '--require-candidates') args.requireCandidates = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_split_review_batch.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_action_worklist_anchor_domain_rejected_english_pe.json \\
  --triage-decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_triage_candidate_anchor_domain_rejected_english_pe.json \\
  --anchor-batch generated/textbook_evidence/h4g_theme_bridge_anchor_review_batch_anchor_domain_rejected_english_pe.json \\
  --strict --require-candidates

Builds a read-only item-level split review batch for anchor groups that were
routed to split/refine. The output uses standard+grade+action+anchor slices as
the review grain. It does not approve bridges, write public/data, change
official standard text, or enable matcher/publication use.`)
}

function parseList(value) {
  const rows = String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  if (!rows.length || rows.includes('all')) return null
  return rows
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

function truncate(value, max = 84) {
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

function basePolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    item_level_decision_gate_required: true,
    matcher_ready: false,
    publication_ready: false,
    read_only_split_review_batch: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    source_decision_must_be_edited_separately: true,
    split_review_is_not_approval: true,
    writes_public_data: false
  }
}

function validateArgs(args, errors) {
  if (!Number.isInteger(args.minRank) || args.minRank < 1) errors.push('--min-rank must be an integer >= 1')
  if (args.maxRank !== Number.POSITIVE_INFINITY && (!Number.isInteger(args.maxRank) || args.maxRank < 1)) {
    errors.push('--max-rank must be an integer >= 1')
  }
  if (args.minRank > args.maxRank) errors.push('--min-rank must be <= --max-rank')
}

function validateTopLevel(worklist, triage, anchorBatch, errors) {
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_action_worklist') {
    errors.push('worklist purpose must be h4g_subject_theme_bridge_anchor_group_action_worklist')
  }
  if (worklist.review_only !== true) errors.push('worklist review_only must be true')
  if (worklist.writes_public_data !== false) errors.push('worklist writes_public_data must be false')
  if (worklist.changes_official_standard_text !== false) errors.push('worklist changes_official_standard_text must be false')
  if (worklist.direct_matcher_use !== false) errors.push('worklist direct_matcher_use must be false')
  if (worklist.matcher_ready !== false) errors.push('worklist matcher_ready must be false')
  if (worklist.publication_ready !== false) errors.push('worklist publication_ready must be false')

  if (triage.valid !== true) errors.push('triage decisions valid must be true')
  if (triage.candidate_purpose !== 'h4g_subject_theme_bridge_anchor_group_triage_decisions_candidate') {
    errors.push('triage decisions candidate_purpose must be h4g_subject_theme_bridge_anchor_group_triage_decisions_candidate')
  }
  if (triage.group_review_complete !== true) errors.push('triage decisions group_review_complete must be true')
  if (triage.writes_public_data !== false) errors.push('triage decisions writes_public_data must be false')
  if (triage.changes_official_standard_text !== false) errors.push('triage decisions changes_official_standard_text must be false')
  if (triage.direct_matcher_use !== false) errors.push('triage decisions direct_matcher_use must be false')
  if (triage.matcher_ready !== false) errors.push('triage decisions matcher_ready must be false')
  if (triage.publication_ready !== false) errors.push('triage decisions publication_ready must be false')

  if (anchorBatch.valid !== true) errors.push('anchor batch valid must be true')
  if (anchorBatch.purpose !== 'h4g_subject_theme_bridge_anchor_review_batch') {
    errors.push('anchor batch purpose must be h4g_subject_theme_bridge_anchor_review_batch')
  }
  if (anchorBatch.writes_public_data !== false) errors.push('anchor batch writes_public_data must be false')
  if (anchorBatch.changes_official_standard_text !== false) errors.push('anchor batch changes_official_standard_text must be false')
  if (anchorBatch.direct_matcher_use !== false) errors.push('anchor batch direct_matcher_use must be false')
  if (anchorBatch.matcher_ready !== false) errors.push('anchor batch matcher_ready must be false')
  if (anchorBatch.publication_ready !== false) errors.push('anchor batch publication_ready must be false')
  if (anchorBatch.policy?.anchor_review_batch_only !== true) errors.push('anchor batch policy.anchor_review_batch_only must be true')
}

function mapBy(rows, key, errors, label) {
  const map = new Map()
  for (const row of rows || []) {
    const id = row[key]
    if (!id) {
      errors.push(`${label} row missing ${key}`)
      continue
    }
    if (map.has(id)) errors.push(`${label} duplicate ${key}: ${id}`)
    map.set(id, row)
  }
  return map
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
  const out = new Map()
  for (const subjectSlug of sorted(subjectSlugs)) {
    for (const standard of loadStandardsForSubject(root, subjectSlug, errors)) {
      const code = standard.code || standard.id
      if (code) out.set(code, standard)
    }
  }
  return out
}

function selectedWorkItems(worklist, args) {
  const subjectSet = args.subjects ? new Set(args.subjects) : null
  return (worklist.action_work_items || [])
    .filter(item => item.work_path === SPLIT_WORK_PATH)
    .filter(item => item.recommended_reviewer_decision === SPLIT_REVIEW_DECISION)
    .filter(item => Number(item.priority_rank || 0) >= args.minRank)
    .filter(item => Number(item.priority_rank || 0) <= args.maxRank)
    .filter(item => !subjectSet || subjectSet.has(item.subject_slug || ''))
}

function standardContext(standard, candidate, subjectSlug) {
  return {
    assessment_evidence_type: standard?.assessment_evidence_type || '',
    code: standard?.code || candidate.standard_code || '',
    context: standard?.context || '',
    domain: standard?.domain || candidate.item_summary?.standard_domains?.[0] || '',
    grade: standard?.grade || '',
    grade_band: standard?.grade_band || candidate.grade_band || '',
    grade_level: standard?.grade_level ?? null,
    id: standard?.id || standard?.code || candidate.standard_code || '',
    legacy_code: standard?.legacy_code || '',
    practice: standard?.practice || '',
    progression_delta: standard?.progression_delta || '',
    progression_group_id: standard?.progression_group_id || '',
    progression_role: standard?.progression_role || '',
    review_status: standard?.review_status || '',
    source_grade_range: standard?.source_grade_range || '',
    source_standard_scope: standard?.source_standard_scope || '',
    stage_band: standard?.stage_band || '',
    standard: standard?.standard || '',
    subdomain: standard?.subdomain || '',
    subject: standard?.subject || '',
    subject_slug: standard?.subject_slug || subjectSlug || '',
    teaching_tip: standard?.teaching_tip || ''
  }
}

function sourceItemSummary(item) {
  return {
    action_family: item.action_family || '',
    anchor_requirement: item.anchor_requirement || {},
    anchor_review_item_id: item.anchor_review_item_id || '',
    anchor_type: item.anchor_requirement?.anchor_type || '',
    bridge_context: item.bridge_context || {},
    decision_owner: item.decision_owner || '',
    evidence_profile: item.evidence_profile || {},
    grade_band: item.grade_band || '',
    progression_group_id: item.progression_group_id || '',
    remediation_item_id: item.remediation_item_id || '',
    source_decision_id: item.source_decision_id || '',
    source_review_id: item.source_review_id || '',
    source_work_item_id: item.source_work_item_id || '',
    standard_context: item.standard_context || {},
    subject_slug: item.subject_slug || '',
    unit_context: item.unit_context || {}
  }
}

function reviewQuestions(candidate, sourceItems) {
  const questions = []
  questions.push(candidate.review_instruction || 'Review this bounded slice before item-level source review.')
  questions.push(REVIEW_FOCUS_BY_ACTION[candidate.action_family] || 'Confirm the source evidence is specific enough for this bounded slice.')
  for (const item of sourceItems) {
    for (const question of item.anchor_requirement?.review_questions || []) questions.push(question)
  }
  return sorted(questions)
}

function reviewDecisionTemplate(candidate, sourceItems) {
  return {
    allowed_review_outcomes: [
      'accept_bounded_slice_for_item_level_source_review',
      'split_slice_further',
      'needs_source_anchor_evidence',
      'reject_slice_as_overbroad'
    ],
    requested_direct_matcher_use: false,
    requested_eligible_for_h4g_differentiation: false,
    requested_official_text_change: false,
    requested_public_write: false,
    required_confirmations: {
      anchor_type_matches_target_domain: false,
      group_scope_is_bounded: false,
      item_level_decision_still_required: true,
      no_public_write_requested: true,
      official_standard_text_preserved: true,
      same_grade_scope_checked: false,
      same_subject_scope_checked: false,
      source_items_reviewed: false
    },
    review_questions: reviewQuestions(candidate, sourceItems),
    reviewer_note_template: 'Record whether this bounded standard+grade+anchor slice is narrow enough for later item-level source review. Do not mark bridge approval here.'
  }
}

function validateCandidate(candidate, workItem, sourceItems, errors) {
  const prefix = candidate.candidate_id || `${workItem.progression_group_id}:${candidate.standard_code}`
  const expectedIds = sorted(candidate.item_summary?.anchor_review_item_ids || [])
  const actualIds = sorted(sourceItems.map(item => item.anchor_review_item_id))
  if (!candidate.candidate_id) errors.push(`${prefix} missing candidate_id`)
  if (!candidate.standard_code) errors.push(`${prefix} missing standard_code`)
  if (!candidate.grade_band) errors.push(`${prefix} missing grade_band`)
  if (!candidate.action_family) errors.push(`${prefix} missing action_family`)
  if (!candidate.anchor_type) errors.push(`${prefix} missing anchor_type`)
  if (!expectedIds.length) errors.push(`${prefix} has no anchor_review_item_ids`)
  if (expectedIds.join('|') !== actualIds.join('|')) errors.push(`${prefix} source item ids do not match candidate summary`)
  if (candidate.item_summary?.page_ready_items !== candidate.item_summary?.item_count) {
    errors.push(`${prefix} must be fully page-ready before split review`)
  }
  for (const item of sourceItems) {
    if (item.progression_group_id !== workItem.progression_group_id) errors.push(`${prefix} source item group mismatch: ${item.anchor_review_item_id}`)
    if (item.standard_context?.standard_code !== candidate.standard_code) errors.push(`${prefix} source item standard mismatch: ${item.anchor_review_item_id}`)
    if (item.grade_band !== candidate.grade_band) errors.push(`${prefix} source item grade mismatch: ${item.anchor_review_item_id}`)
    if (item.action_family !== candidate.action_family) errors.push(`${prefix} source item action family mismatch: ${item.anchor_review_item_id}`)
    if (item.anchor_requirement?.anchor_type !== candidate.anchor_type) errors.push(`${prefix} source item anchor type mismatch: ${item.anchor_review_item_id}`)
  }
}

function buildSplitReviewItem(workItem, candidate, indexes, errors) {
  const sourceItems = (candidate.item_summary?.anchor_review_item_ids || [])
    .map(id => indexes.anchorItemById.get(id))
    .filter(Boolean)
  validateCandidate(candidate, workItem, sourceItems, errors)
  const triageDecision = indexes.triageByGroup.get(workItem.progression_group_id)
  const publicStandard = indexes.standardsByCode.get(candidate.standard_code)
  const prefix = candidate.candidate_id || `${workItem.progression_group_id}:${candidate.standard_code}`
  if (!triageDecision) errors.push(`${prefix} missing triage decision`)
  else if (triageDecision.reviewer_decision !== SPLIT_REVIEW_DECISION) {
    errors.push(`${prefix} triage decision must be ${SPLIT_REVIEW_DECISION}`)
  }
  if (!publicStandard) errors.push(`${prefix} standard_code not found in public data: ${candidate.standard_code}`)

  return {
    action_family: candidate.action_family || '',
    anchor_action_work_id: workItem.anchor_action_work_id || '',
    anchor_type: candidate.anchor_type || '',
    candidate_summary: candidate.item_summary || {},
    grade_band: candidate.grade_band || '',
    priority_rank: workItem.priority_rank,
    priority_tier: workItem.priority_tier || '',
    progression_group_id: workItem.progression_group_id || '',
    publication_policy: basePolicy(),
    review_decision_template: reviewDecisionTemplate(candidate, sourceItems),
    review_focus: REVIEW_FOCUS_BY_ACTION[candidate.action_family] || 'Confirm source evidence is specific to this bounded slice.',
    review_grain: 'standard_code+grade_band+action_family+anchor_type',
    source_anchor_review_items: sourceItems.map(sourceItemSummary),
    source_triage_decision_id: triageDecision?.decision_id || '',
    split_candidate_id: candidate.candidate_id || '',
    split_candidate_index: candidate.candidate_index || null,
    split_review_item_id: `h4g_anchor_group_split_review_${hashText(`${workItem.anchor_action_work_id}|${candidate.candidate_id}`)}`,
    standard_code: candidate.standard_code || '',
    standard_context: standardContext(publicStandard, candidate, workItem.subject_slug),
    subject_slug: workItem.subject_slug || '',
    work_path: workItem.work_path || ''
  }
}

function buildItems(worklist, args, indexes, errors) {
  const items = []
  for (const workItem of selectedWorkItems(worklist, args)) {
    if (!Array.isArray(workItem.split_candidates) || !workItem.split_candidates.length) {
      errors.push(`${workItem.progression_group_id} split work item has no split_candidates`)
      continue
    }
    for (const candidate of workItem.split_candidates) {
      items.push(buildSplitReviewItem(workItem, candidate, indexes, errors))
    }
  }
  return items.sort((a, b) => Number(a.priority_rank || 0) - Number(b.priority_rank || 0) ||
    a.progression_group_id.localeCompare(b.progression_group_id) ||
    a.grade_band.localeCompare(b.grade_band) ||
    a.standard_code.localeCompare(b.standard_code) ||
    a.split_candidate_id.localeCompare(b.split_candidate_id))
}

function summarize(items) {
  const summary = {
    anchor_review_rows: 0,
    by_action_family: {},
    by_anchor_type: {},
    by_grade_band: {},
    by_priority_tier: {},
    by_review_grain: {},
    by_subject: {},
    progression_groups: sorted(items.map(item => item.progression_group_id)).length,
    public_standards: sorted(items.map(item => item.standard_code)).length,
    split_review_items: items.length
  }
  for (const item of items) {
    summary.anchor_review_rows += item.source_anchor_review_items.length
    countInto(summary.by_action_family, item.action_family)
    countInto(summary.by_anchor_type, item.anchor_type)
    countInto(summary.by_grade_band, item.grade_band)
    countInto(summary.by_priority_tier, item.priority_tier)
    countInto(summary.by_review_grain, item.review_grain)
    countInto(summary.by_subject, item.subject_slug)
  }
  return summary
}

function previewRows(items) {
  return items.slice(0, 80).map(item => (
    `| ${item.priority_rank} | ${markdownCell(item.priority_tier)} | ${markdownCell(item.subject_slug)} | ${markdownCell(item.grade_band)} | ${markdownCell(item.standard_code)} | ${markdownCell(item.action_family)} | ${item.source_anchor_review_items.length} | ${truncate(item.source_anchor_review_items.map(row => row.unit_context?.unit_title).join('；'))} |`
  )).join('\n') || '| - | - | - | - | - | - | 0 | - |'
}

function markdownSummary(payload) {
  return `# H4G Anchor Group Split Review Batch

Generated at: ${payload.generated_at}

This is a read-only split review batch for the 43 anchor groups that were routed
to \`split_or_refine_group_scope\`. The review grain is
\`standard_code + grade_band + action_family + anchor_type\`, so H4G7, H4G8 and
H4G9 are reviewed as separate bounded slices before any item-level source
decision. It does not approve bridges, write \`public/data\`, change official
standard text, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| split review items | ${payload.summary.split_review_items} |
| progression groups | ${payload.summary.progression_groups} |
| public standards | ${payload.summary.public_standards} |
| anchor review rows | ${payload.summary.anchor_review_rows} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Grade Bands

| grade band | slices |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Subjects

| subject | slices |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Action Families

| action family | slices |
| --- | ---: |
${countRows(payload.summary.by_action_family)}

## Preview

| rank | tier | subject | grade | standard | action family | source rows | units |
| ---: | --- | --- | --- | --- | --- | ---: | --- |
${previewRows(payload.split_review_items)}

## Guardrails

- Split review is not a bridge approval.
- Source decisions must still be edited separately and audited before registry or matcher use.
- Public data, official standard text, matcher readiness and publication readiness remain disabled.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  validateArgs(args, errors)
  for (const [label, path] of [
    ['worklist', args.worklist],
    ['triage decisions', args.triageDecisions],
    ['anchor batch', args.anchorBatch]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const worklist = errors.length ? { action_work_items: [] } : readJson(args.worklist)
  const triage = errors.length ? { group_review_decisions: [] } : readJson(args.triageDecisions)
  const anchorBatch = errors.length ? { anchor_review_items: [] } : readJson(args.anchorBatch)
  if (!errors.length) validateTopLevel(worklist, triage, anchorBatch, errors)

  const selected = selectedWorkItems(worklist, args)
  const subjectSlugs = sorted(selected.map(item => item.subject_slug))
  const indexes = {
    anchorItemById: mapBy(anchorBatch.anchor_review_items || [], 'anchor_review_item_id', errors, 'anchor batch'),
    standardsByCode: buildStandardIndex(args.standardsRoot, subjectSlugs, errors),
    triageByGroup: mapBy(triage.group_review_decisions || [], 'progression_group_id', errors, 'triage decisions')
  }
  const items = buildItems(worklist, args, indexes, errors)
  if (args.requireCandidates && !items.length) errors.push('requireCandidates is set but no split review items were generated')

  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: basePolicy(),
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_split_review_batch',
    review_only: true,
    selection: {
      max_rank: args.maxRank === Number.POSITIVE_INFINITY ? 'all' : args.maxRank,
      min_rank: args.minRank,
      reviewer_decision: SPLIT_REVIEW_DECISION,
      subjects: args.subjects || ['all'],
      work_path: SPLIT_WORK_PATH
    },
    source_anchor_batch: args.anchorBatch,
    source_action_worklist: args.worklist,
    source_triage_decisions: args.triageDecisions,
    split_review_items: items,
    summary: summarize(items),
    valid: errors.length === 0,
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
