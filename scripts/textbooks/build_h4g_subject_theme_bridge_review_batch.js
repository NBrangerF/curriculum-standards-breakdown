#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_worklist.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_decisions_template.json'
const DEFAULT_STANDARDS_ROOT = 'public/data/by_subject'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_batch.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_batch.md'

function parseArgs(argv) {
  const args = {
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
    if (item === '--worklist') args.worklist = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_review_batch.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_review_worklist_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \\
  --out generated/textbook_evidence/h4g_theme_bridge_review_batch_p1_english_pe.json \\
  --strict --require-items --max-priority 1 --review-path source_review_ready

Builds a read-only source-review batch from the H4G subject theme bridge
worklist. The batch enriches selected work items with official standard context
so reviewers can decide bridge scope, but it never approves bridges, writes
public/data, changes official standard text, or enables matcher use.`)
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

function truncate(value, max = 72) {
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
    writes_public_data: false,
    changes_official_standard_text: false,
    eligible_for_h4g_differentiation: false,
    direct_matcher_use: false,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true
  }
}

function decisionById(decisions) {
  return new Map((decisions.bridge_review_decisions || []).map(row => [row.decision_id, row]))
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

function matchingTextbookEvidence(standard, item) {
  const rows = Array.isArray(standard?.textbook_evidence) ? standard.textbook_evidence : []
  return rows.find(row => row.evidence_id === item.textbook_evidence_id) || null
}

function validateInputs(worklist, decisions, args, errors) {
  if (!Number.isInteger(args.maxPriority) || args.maxPriority < 1 || args.maxPriority > 4) {
    errors.push('--max-priority must be an integer from 1 to 4')
  }
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_source_review_worklist') {
    errors.push('worklist purpose must be h4g_subject_theme_bridge_source_review_worklist')
  }
  if (worklist.publication_candidate !== false) errors.push('worklist publication_candidate must be false')
  if (worklist.matcher_ready !== false) errors.push('worklist matcher_ready must be false')
  if (worklist.writes_public_data !== false) errors.push('worklist writes_public_data must be false')
  if (worklist.changes_official_standard_text !== false) errors.push('worklist changes_official_standard_text must be false')
  if (worklist.direct_matcher_use !== false) errors.push('worklist direct_matcher_use must be false')
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_review_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_review_decisions_template')
  }
  if (decisions.writes_public_data !== false) errors.push('decisions writes_public_data must be false')
  if (decisions.changes_official_standard_text !== false) errors.push('decisions changes_official_standard_text must be false')
  if (decisions.direct_matcher_use !== false) errors.push('decisions direct_matcher_use must be false')
  if (args.requireItems && !(worklist.work_items || []).length) {
    errors.push('requireItems is set but worklist has no work_items')
  }
}

function selectedWorkItems(workItems, args) {
  return (workItems || [])
    .filter(item => Number(item.priority_tier || 0) <= args.maxPriority)
    .filter(item => args.reviewPath === 'all' || item.review_path === args.reviewPath)
}

function standardContext(standard, item) {
  return {
    standard_code: standard?.code || item.standard_code || '',
    id: standard?.id || standard?.code || item.standard_code || '',
    legacy_code: standard?.legacy_code || '',
    subject: standard?.subject || '',
    subject_slug: standard?.subject_slug || item.subject_slug || '',
    grade: standard?.grade || '',
    grade_band: standard?.grade_band || item.grade_band || '',
    grade_level: standard?.grade_level ?? null,
    stage_band: standard?.stage_band || '',
    source_grade_range: standard?.source_grade_range || '',
    source_standard_scope: standard?.source_standard_scope || '',
    domain: standard?.domain || item.domain || '',
    subdomain: standard?.subdomain || item.subdomain || '',
    standard: standard?.standard || '',
    context: standard?.context || '',
    practice: standard?.practice || '',
    teaching_tip: standard?.teaching_tip || '',
    assessment_evidence_type: standard?.assessment_evidence_type || '',
    grade_specific_focus: standard?.grade_specific_focus || '',
    review_status: standard?.review_status || '',
    evidence_granularity: standard?.evidence_granularity || '',
    requires_unit_level_evidence: standard?.requires_unit_level_evidence === true,
    progression_group_id: standard?.progression_group_id || item.progression_group_id || '',
    progression_role: standard?.progression_role || '',
    progression_delta: standard?.progression_delta || '',
    progression_review_note: standard?.progression_review_note || '',
    progression_distinctiveness: standard?.progression_distinctiveness || ''
  }
}

function unitContext(item, standard) {
  const evidence = matchingTextbookEvidence(standard, item)
  return {
    unit_evidence_id: item.unit_evidence_id || '',
    textbook_evidence_id: item.textbook_evidence_id || '',
    unit_title: item.unit_title || '',
    unit_level: item.unit_level || '',
    edition: item.edition || '',
    volume: item.volume || '',
    page_start: item.page_start ?? null,
    page_end: item.page_end ?? null,
    page_range: item.page_range || '',
    page_range_status: item.page_range_status || '',
    page_ready: item.page_ready === true,
    textbook_file: evidence ? {
      evidence_id: evidence.evidence_id || '',
      evidence_url: evidence.evidence_url || '',
      file_name: evidence.file_name || '',
      grade_label: evidence.grade_label || '',
      textbook_subject: evidence.textbook_subject || '',
      evidence_role: evidence.evidence_role || ''
    } : null
  }
}

function reviewDecisionTemplate(decision) {
  return {
    source_decision_id: decision?.decision_id || '',
    current_reviewer_decision: decision?.reviewer_decision || '',
    current_decision_status: decision?.decision_status || '',
    allowed_decisions: decision?.allowed_decisions || [],
    approval_scope: decision?.approval_scope || {},
    required_confirmations: decision?.required_confirmations || {},
    review_questions: decision?.review_questions || [],
    requested_public_write: decision?.requested_public_write === true,
    requested_official_text_change: decision?.requested_official_text_change === true,
    requested_direct_matcher_use: decision?.requested_direct_matcher_use === true,
    requested_eligible_for_h4g_differentiation: decision?.requested_eligible_for_h4g_differentiation === true
  }
}

function buildBatchItem(item, decision, standard) {
  return {
    batch_item_id: `h4g_theme_bridge_review_batch_${hashText(item.work_item_id || item.source_decision_id)}`,
    source_work_item_id: item.work_item_id || '',
    source_decision_id: item.source_decision_id || '',
    source_review_id: item.source_review_id || '',
    priority_tier: item.priority_tier,
    priority_score: item.priority_score,
    review_path: item.review_path || '',
    required_next_step: item.required_next_step || '',
    recommended_approval_scope: item.recommended_approval_scope || '',
    risk_flags: item.risk_flags || [],
    standard_context: standardContext(standard, item),
    unit_context: unitContext(item, standard),
    theme_bridge_context: {
      bridge_score: item.bridge_score || 0,
      standard_topic_tags: decision?.standard_topic_tags || [],
      unit_topic_tags: decision?.unit_topic_tags || [],
      shared_topic_tags: item.shared_topic_tags || [],
      shared_topic_labels: item.shared_topic_labels || {},
      fanout: item.fanout || {}
    },
    review_decision_template: reviewDecisionTemplate(decision),
    publication_policy: {
      ...basePolicy(),
      read_only_review_batch: true,
      source_decision_must_be_edited_separately: true,
      batch_priority_is_not_approval: true,
      page_missing_requires_recovery_before_publication: item.page_ready !== true
    }
  }
}

function summarize(items) {
  const summary = {
    batch_items: items.length,
    source_review_ready_items: 0,
    page_recovery_items: 0,
    page_ready_items: 0,
    page_missing_items: 0,
    by_subject: {},
    by_grade_band: {},
    by_priority_tier: {},
    by_review_path: {},
    by_required_next_step: {},
    by_risk_flag: {},
    by_shared_topic_tag: {},
    by_current_reviewer_decision: {}
  }
  for (const item of items) {
    const standard = item.standard_context || {}
    const unit = item.unit_context || {}
    const bridge = item.theme_bridge_context || {}
    const decision = item.review_decision_template || {}
    countInto(summary.by_subject, standard.subject_slug)
    countInto(summary.by_grade_band, standard.grade_band)
    countInto(summary.by_priority_tier, `P${item.priority_tier}`)
    countInto(summary.by_review_path, item.review_path)
    countInto(summary.by_required_next_step, item.required_next_step)
    countInto(summary.by_current_reviewer_decision, decision.current_reviewer_decision)
    for (const flag of item.risk_flags || []) countInto(summary.by_risk_flag, flag)
    for (const tag of bridge.shared_topic_tags || []) countInto(summary.by_shared_topic_tag, tag)
    if (item.review_path === 'source_review_ready') summary.source_review_ready_items += 1
    if (item.review_path === 'page_recovery_then_source_review') summary.page_recovery_items += 1
    if (unit.page_ready) summary.page_ready_items += 1
    else summary.page_missing_items += 1
  }
  return stable(summary)
}

function previewRows(items) {
  return items.slice(0, 80)
    .map(item => {
      const standard = item.standard_context || {}
      const unit = item.unit_context || {}
      const bridge = item.theme_bridge_context || {}
      return `| P${item.priority_tier} | ${markdownCell(standard.subject_slug)} | ${markdownCell(standard.grade_band)} | ${markdownCell(standard.standard_code)} | ${markdownCell(unit.unit_title)} | ${markdownCell(bridge.shared_topic_tags.join(', '))} | ${markdownCell(unit.page_range || unit.page_range_status)} | ${truncate(standard.standard)} |`
    })
    .join('\n') || '| - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Subject Theme Bridge Source Review Batch

Generated at: ${payload.generated_at}

This is a read-only source-review batch selected from the subject-theme bridge
worklist. It enriches each selected bridge with official standard context, but
does not approve bridges, write \`public/data\`, change official standard text,
or enable matcher use.

## Selection

| Field | Value |
| --- | --- |
| valid | ${payload.valid} |
| max priority | P${payload.selection.max_priority} |
| review path | ${payload.selection.review_path} |
| batch items | ${payload.summary.batch_items} |
| source-review ready items | ${payload.summary.source_review_ready_items} |
| page-recovery items | ${payload.summary.page_recovery_items} |

## Grade

| Grade | Items |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Subject

| Subject | Items |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Risk Flags

| Risk Flag | Items |
| --- | ---: |
${countRows(payload.summary.by_risk_flag)}

## Review Preview

| Priority | Subject | Grade | Standard | Unit | Shared Tags | Page | Standard Text |
| --- | --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.batch_items)}

## Use

- Review the official standard text, practice, teaching tip, unit title, page evidence, and shared tags together.
- Edit the source decisions file only after source review; this batch is not an approval surface.
- Keep approvals scoped to standard code unless the progression group has been reviewed as a bounded same-grade bridge.
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  for (const [label, path] of [
    ['worklist', args.worklist],
    ['decisions', args.decisions],
    ['standards root', args.standardsRoot]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  if (errors.length) {
    console.log(JSON.stringify({ valid: false, errors }, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const worklist = readJson(args.worklist)
  const decisions = readJson(args.decisions)
  validateInputs(worklist, decisions, args, errors)
  const selected = selectedWorkItems(worklist.work_items || [], args)
  if (args.requireItems && !selected.length) errors.push('requireItems is set but no work items matched the selection')
  const subjectSlugs = selected.map(item => item.subject_slug)
  const standardsByCode = buildStandardIndex(args.standardsRoot, subjectSlugs, errors)
  const byDecision = decisionById(decisions)
  const batchItems = []
  for (const item of selected) {
    const decision = byDecision.get(item.source_decision_id)
    if (!decision) errors.push(`${item.work_item_id || item.source_decision_id} source_decision_id not found`)
    const standard = standardsByCode.get(item.standard_code)
    if (!standard) errors.push(`${item.work_item_id || item.source_decision_id} standard_code not found in public data: ${item.standard_code}`)
    batchItems.push(buildBatchItem(item, decision, standard))
  }

  const payload = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    schema_version: 1,
    purpose: 'h4g_subject_theme_bridge_source_review_batch',
    source_worklist: args.worklist,
    source_decisions: args.decisions,
    standards_root: args.standardsRoot,
    selection: {
      max_priority: args.maxPriority,
      review_path: args.reviewPath,
      selected_work_items: batchItems.length
    },
    publication_candidate: false,
    matcher_ready: false,
    source_review_complete: false,
    writes_public_data: false,
    changes_official_standard_text: false,
    eligible_for_h4g_differentiation: false,
    direct_matcher_use: false,
    policy: {
      ...basePolicy(),
      read_only_review_batch: true,
      source_decision_must_be_edited_separately: true,
      batch_priority_is_not_approval: true
    },
    summary: summarize(batchItems),
    batch_items: batchItems,
    errors
  }

  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable({
    valid: payload.valid,
    wrote: args.out,
    summary_out: args.summaryOut || null,
    selection: payload.selection,
    summary: payload.summary,
    errors
  }), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
