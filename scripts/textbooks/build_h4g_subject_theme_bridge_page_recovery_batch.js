#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_worklist.json'
const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_decisions_template.json'
const DEFAULT_STANDARDS_ROOT = 'public/data/by_subject'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_page_recovery_batch.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_page_recovery_batch.md'
const PAGE_RECOVERY_PATH = 'page_recovery_then_source_review'

function parseArgs(argv) {
  const args = {
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
    if (item === '--worklist') args.worklist = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_page_recovery_batch.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_review_worklist_english_pe.json \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \\
  --out generated/textbook_evidence/h4g_theme_bridge_page_recovery_batch_h4g8_english_pe.json \\
  --strict --require-items --grade-bands H4G8

Builds a read-only page-recovery batch for H4G subject-theme bridge work items.
The batch groups page-missing bridge candidates by unit so reviewers can recover
printed page starts from TOC/body OCR before source review and publication gates.`)
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

function hashText(value, length = 14) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
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

function basePolicy() {
  return {
    writes_public_data: false,
    changes_official_standard_text: false,
    eligible_for_h4g_differentiation: false,
    direct_matcher_use: false,
    requires_later_source_review_gate: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true
  }
}

function validateInputs(worklist, decisions, args, errors) {
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_source_review_worklist') {
    errors.push('worklist purpose must be h4g_subject_theme_bridge_source_review_worklist')
  }
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

function decisionById(decisions) {
  return new Map((decisions.bridge_review_decisions || []).map(row => [row.decision_id, row]))
}

function recoveryTier(workItemCount) {
  if (workItemCount >= 20) return 1
  if (workItemCount >= 10) return 2
  if (workItemCount >= 3) return 3
  return 4
}

function groupKey(item) {
  return item.unit_evidence_id || `${item.textbook_evidence_id}:${item.unit_title}`
}

function groupWorkItems(workItems) {
  const groups = new Map()
  for (const item of workItems) {
    const key = groupKey(item)
    if (!groups.has(key)) {
      groups.set(key, {
        unit_evidence_id: item.unit_evidence_id || '',
        textbook_evidence_id: item.textbook_evidence_id || '',
        unit_title: item.unit_title || '',
        unit_level: item.unit_level || '',
        subject_slug: item.subject_slug || '',
        grade_band: item.grade_band || '',
        edition: item.edition || '',
        volume: item.volume || '',
        work_items: []
      })
    }
    groups.get(key).work_items.push(item)
  }
  return [...groups.values()]
}

function compactStandard(row, standard) {
  return {
    standard_code: row.standard_code || '',
    progression_group_id: row.progression_group_id || '',
    domain: row.domain || standard?.domain || '',
    subdomain: row.subdomain || standard?.subdomain || '',
    standard: standard?.standard || '',
    context: standard?.context || '',
    practice: standard?.practice || '',
    teaching_tip: standard?.teaching_tip || '',
    assessment_evidence_type: standard?.assessment_evidence_type || '',
    shared_topic_tags: row.shared_topic_tags || [],
    risk_flags: row.risk_flags || [],
    source_work_item_id: row.work_item_id || '',
    source_decision_id: row.source_decision_id || '',
    source_review_id: row.source_review_id || ''
  }
}

function recoveryItem(group, byDecision, standardsByCode) {
  const standards = []
  const decisions = []
  const topicTags = new Set()
  const riskFlags = new Set()
  const progressionGroups = new Set()
  for (const item of group.work_items) {
    const decision = byDecision.get(item.source_decision_id)
    if (decision) decisions.push(decision)
    for (const tag of item.shared_topic_tags || []) topicTags.add(tag)
    for (const flag of item.risk_flags || []) riskFlags.add(flag)
    if (item.progression_group_id) progressionGroups.add(item.progression_group_id)
    standards.push(compactStandard(item, standardsByCode.get(item.standard_code)))
  }
  const workItemCount = group.work_items.length
  const tier = recoveryTier(workItemCount)
  return {
    recovery_item_id: `h4g_theme_bridge_page_recovery_${hashText(`${group.unit_evidence_id}:${group.textbook_evidence_id}:${group.unit_title}`)}`,
    recovery_priority_tier: tier,
    recovery_priority_score: workItemCount * 10 + sorted(topicTags).length + sorted(progressionGroups).length,
    recovery_path: 'recover_printed_page_start_before_source_review',
    required_next_step: 'recover_or_confirm_printed_page_start_from_toc_or_body_ocr',
    unit_context: {
      subject_slug: group.subject_slug,
      grade_band: group.grade_band,
      edition: group.edition,
      volume: group.volume,
      textbook_evidence_id: group.textbook_evidence_id,
      unit_evidence_id: group.unit_evidence_id,
      unit_title: group.unit_title,
      unit_level: group.unit_level,
      current_page_start: null,
      current_page_end: null,
      current_page_range: '',
      current_page_range_status: 'missing',
      page_ready_current: false
    },
    impact: {
      linked_work_item_count: workItemCount,
      linked_decision_count: decisions.length,
      linked_standard_count: sorted(group.work_items.map(item => item.standard_code)).length,
      linked_progression_group_count: sorted([...progressionGroups]).length,
      shared_topic_tags: sorted([...topicTags]),
      risk_flags: sorted([...riskFlags])
    },
    linked_standards: standards
      .sort((a, b) => a.standard_code.localeCompare(b.standard_code) || a.source_work_item_id.localeCompare(b.source_work_item_id)),
    page_start_override_template: {
      textbook_evidence_id: group.textbook_evidence_id,
      unit_title: group.unit_title,
      match_titles: [],
      page_start: null,
      review_status: 'pending_page_recovery',
      source: 'toc_or_body_ocr_review_required',
      note: '',
      evidence: {
        pdf_page: null,
        ocr_excerpt: '',
        printed_page_evidence: ''
      }
    },
    publication_policy: {
      ...basePolicy(),
      read_only_page_recovery_batch: true,
      page_recovery_is_not_source_review_approval: true,
      recovered_page_requires_page_start_override_review: true
    }
  }
}

function summarize(items) {
  const summary = {
    recovery_items: items.length,
    linked_work_items: items.reduce((sum, item) => sum + item.impact.linked_work_item_count, 0),
    linked_decisions: items.reduce((sum, item) => sum + item.impact.linked_decision_count, 0),
    linked_standards: items.reduce((sum, item) => sum + item.impact.linked_standard_count, 0),
    by_subject: {},
    by_grade_band: {},
    by_textbook_evidence_id: {},
    by_recovery_priority_tier: {},
    by_shared_topic_tag: {},
    by_risk_flag: {}
  }
  for (const item of items) {
    countInto(summary.by_subject, item.unit_context.subject_slug)
    countInto(summary.by_grade_band, item.unit_context.grade_band)
    countInto(summary.by_textbook_evidence_id, item.unit_context.textbook_evidence_id)
    countInto(summary.by_recovery_priority_tier, `R${item.recovery_priority_tier}`)
    for (const tag of item.impact.shared_topic_tags || []) countInto(summary.by_shared_topic_tag, tag)
    for (const flag of item.impact.risk_flags || []) countInto(summary.by_risk_flag, flag)
  }
  return stable(summary)
}

function itemRows(items) {
  return items.slice(0, 80)
    .map(item => {
      const unit = item.unit_context
      const impact = item.impact
      return `| R${item.recovery_priority_tier} | ${markdownCell(unit.subject_slug)} | ${markdownCell(unit.grade_band)} | ${markdownCell(unit.edition)} | ${markdownCell(unit.volume)} | ${markdownCell(unit.unit_title)} | ${impact.linked_work_item_count} | ${impact.linked_standard_count} | ${markdownCell(impact.shared_topic_tags.join(', '))} |`
    })
    .join('\n') || '| - | - | - | - | - | - | 0 | 0 | - |'
}

function markdownSummary(payload) {
  return `# H4G Subject Theme Bridge Page Recovery Batch

Generated at: ${payload.generated_at}

This is a read-only page-recovery batch. It groups page-missing subject-theme
bridge work items by textbook unit so reviewers can recover printed page starts
before source review, matcher use, or publication gates.

## Selection

| Field | Value |
| --- | --- |
| valid | ${payload.valid} |
| grade bands | ${payload.selection.grade_bands.join(', ') || 'all'} |
| subjects | ${payload.selection.subjects.join(', ') || 'all'} |
| recovery items | ${payload.summary.recovery_items} |
| linked work items | ${payload.summary.linked_work_items} |
| linked decisions | ${payload.summary.linked_decisions} |

## Grade

| Grade | Items |
| --- | ---: |
${countRows(payload.summary.by_grade_band)}

## Subject

| Subject | Items |
| --- | ---: |
${countRows(payload.summary.by_subject)}

## Topic Tags

| Topic Tag | Units |
| --- | ---: |
${countRows(payload.summary.by_shared_topic_tag)}

## Recovery Items

| Priority | Subject | Grade | Edition | Volume | Unit | Work Items | Standards | Topic Tags |
| --- | --- | --- | --- | --- | --- | ---: | ---: | --- |
${itemRows(payload.recovery_items)}

## Use

- Recover printed page starts from TOC OCR or body OCR/page footers.
- Record reviewed evidence in \`scripts/textbooks/textbook_unit_page_start_overrides.json\`.
- Rerun unit index, subject-theme review packet, decisions/worklist, and source review batch after page recovery.
- This batch does not approve a subject-theme bridge and does not write \`public/data\`.
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
  if (args.requireItems && !selected.length) errors.push('requireItems is set but no page-recovery work items matched the selection')
  const standardsByCode = buildStandardIndex(args.standardsRoot, selected.map(item => item.subject_slug), errors)
  const byDecision = decisionById(decisions)
  const recoveryItems = groupWorkItems(selected)
    .map(group => recoveryItem(group, byDecision, standardsByCode))
    .sort((a, b) => a.recovery_priority_tier - b.recovery_priority_tier ||
      b.recovery_priority_score - a.recovery_priority_score ||
      a.unit_context.subject_slug.localeCompare(b.unit_context.subject_slug) ||
      a.unit_context.unit_title.localeCompare(b.unit_context.unit_title))

  const payload = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    schema_version: 1,
    purpose: 'h4g_subject_theme_bridge_page_recovery_batch',
    source_worklist: args.worklist,
    source_decisions: args.decisions,
    standards_root: args.standardsRoot,
    selection: {
      review_path: PAGE_RECOVERY_PATH,
      grade_bands: args.gradeBands,
      subjects: args.subjects,
      selected_work_items: selected.length,
      selected_recovery_units: recoveryItems.length
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
      read_only_page_recovery_batch: true,
      page_recovery_is_not_source_review_approval: true,
      recovered_page_requires_page_start_override_review: true
    },
    summary: summarize(recoveryItems),
    recovery_items: recoveryItems,
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
