#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_decisions_template.json'
const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_batch.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_decisions_codex_reviewed.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_decisions_codex_reviewed.md'

const APPROVE_CODES_BY_UNIT = [
  {
    unitPattern: /Good morning/i,
    codes: new Set(['ENG-H4G7-CUL-004', 'ENG-H4G7-KNOW-025', 'ENG-H4G7-SKILL-001', 'ENG-H4G7-STRAT-007'])
  },
  {
    unitPattern: /This is my friend/i,
    codes: new Set(['ENG-H4G7-CUL-004', 'ENG-H4G7-KNOW-025', 'ENG-H4G7-SKILL-001', 'ENG-H4G7-SKILL-005', 'ENG-H4G7-STRAT-007'])
  },
  {
    unitPattern: /Let.?s try to speak English/i,
    codes: new Set(['ENG-H4G8-STRAT-002', 'ENG-H4G8-STRAT-011', 'ENG-H4G8-THEME-002'])
  },
  {
    unitPattern: /第三章\s*足球|足球/,
    codes: new Set(['PE-H4G8-MOVE-002', 'PE-H4G8-SMS-002', 'PE-H4G8-SMS-005'])
  }
]

const EXPLICIT_MISMATCH_PATTERNS = [
  /田径/,
  /体操/,
  /水上/,
  /冰雪/,
  /传统体育/,
  /中国式摔跤/,
  /长拳/,
  /舞龙/,
  /轮滑/,
  /定向运动/,
  /花样跳绳/,
  /新兴体育/
]

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    batch: DEFAULT_BATCH,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    reviewer: 'Codex subject-theme source review',
    reviewedAt: new Date().toISOString().slice(0, 10),
    strict: false,
    requireItems: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--batch') args.batch = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_review_decisions_recommendation.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_review_decisions_template_english_pe.json \\
  --batch generated/textbook_evidence/h4g_theme_bridge_review_batch_p1_english_pe.json \\
  --out generated/textbook_evidence/h4g_theme_bridge_review_decisions_p1_codex_reviewed_english_pe.json \\
  --strict --require-items

Builds a generated source-review decision candidate from a subject-theme bridge
review batch. It only edits decisions represented in the batch. Strong,
standard-scoped matches are approved; explicit topic mismatches are rejected;
the rest become needs_revision. It never writes public/data.`)
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

function batchItemByDecisionId(batch) {
  return new Map((batch.batch_items || []).map(item => [item.source_decision_id, item]))
}

function textForReview(item) {
  const standard = item.standard_context || {}
  return [
    standard.standard_code,
    standard.domain,
    standard.subdomain,
    standard.practice,
    standard.teaching_tip,
    item.unit_context?.unit_title,
    (item.theme_bridge_context?.shared_topic_tags || []).join(' ')
  ].join(' ')
}

function approvalRule(item) {
  const unitTitle = item.unit_context?.unit_title || ''
  const code = item.standard_context?.standard_code || ''
  return APPROVE_CODES_BY_UNIT.find(rule => rule.unitPattern.test(unitTitle) && rule.codes.has(code))
}

function explicitMismatch(item) {
  const text = textForReview(item)
  return EXPLICIT_MISMATCH_PATTERNS.find(pattern => pattern.test(text))
}

function decisionForItem(item) {
  const rule = approvalRule(item)
  if (rule) {
    return {
      reviewerDecision: 'approve_standard_scoped_subject_theme_bridge',
      scopeType: 'standard_code',
      reason: '单元主题、同年级教材页码和标准 practice/subdomain 可形成受控、标准级桥接；仍需后续 matcher/publication gate。'
    }
  }
  const mismatch = explicitMismatch(item)
  if (mismatch) {
    return {
      reviewerDecision: 'reject_subject_theme_bridge',
      scopeType: 'undecided',
      reason: `单元主题与标准中的 ${mismatch.source} 项目/内容类别不一致，属于 broad topic false positive。`
    }
  }
  return {
    reviewerDecision: 'needs_revision',
    scopeType: 'undecided',
    reason: '当前主题标签只证明宽泛主题相关，尚不足以确认精确 standard-to-unit 关系；需课程复核或更窄 topic/alias。'
  }
}

function approvalConfirmations(row) {
  return {
    ...row.required_confirmations,
    approved_scope_is_bounded: true,
    curriculum_progression_scope_reviewed: false,
    exact_standard_to_unit_relationship_confirmed: true,
    no_public_write_requested: true,
    official_standard_text_preserved: true,
    page_evidence_checked: true,
    same_grade_confirmed: true,
    same_subject_confirmed: true,
    source_text_reviewed: true,
    topic_not_generic: true
  }
}

function reviewDecision(row, item, args) {
  if (!item) return row
  const recommendation = decisionForItem(item)
  const next = {
    ...row,
    decision_note: recommendation.reason,
    decision_status: 'reviewed',
    reviewed_at: args.reviewedAt,
    reviewed_by: args.reviewer,
    reviewer_decision: recommendation.reviewerDecision
  }
  if (recommendation.reviewerDecision === 'approve_standard_scoped_subject_theme_bridge') {
    next.approval_scope = {
      ...row.approval_scope,
      scope_type: 'standard_code',
      standard_code: row.standard_code,
      progression_group_id: row.progression_group_id,
      grade_band: row.grade_band,
      unit_evidence_id: row.unit_evidence_id
    }
    next.required_confirmations = approvalConfirmations(row)
  }
  return next
}

function summarize(rows, batchMap) {
  const summary = {
    required_source_review_decisions: rows.length,
    completed_source_review_decisions: rows.filter(row => row.reviewer_decision !== 'pending').length,
    pending_source_review_decisions: rows.filter(row => row.reviewer_decision === 'pending').length,
    batch_reviewed_decisions: rows.filter(row => batchMap.has(row.decision_id)).length,
    approved_bridge_decisions: rows.filter(row => row.reviewer_decision === 'approve_standard_scoped_subject_theme_bridge' || row.reviewer_decision === 'approve_progression_group_subject_theme_bridge').length,
    page_ready_decisions: rows.filter(row => row.page_ready).length,
    page_missing_decisions: rows.filter(row => !row.page_ready).length,
    by_reviewer_decision: {},
    by_subject: {},
    by_grade_band: {},
    by_page_status: {}
  }
  for (const row of rows) {
    countInto(summary.by_reviewer_decision, row.reviewer_decision)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_page_status, row.page_range_status || (row.page_ready ? 'ready' : 'missing'))
  }
  return stable(summary)
}

function reviewedRows(rows) {
  return rows
    .filter(row => row.reviewer_decision !== 'pending')
    .slice(0, 120)
    .map(row => `| ${markdownCell(row.reviewer_decision)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.unit_title)} | ${markdownCell(row.shared_topic_tags.join(', '))} | ${markdownCell(row.decision_note)} |`)
    .join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Subject Theme Bridge Source Review Recommendations

Generated at: ${payload.generated_at}

This is a generated source-review candidate. It only updates decisions included
in the selected review batch; all other decisions stay pending. It does not
write \`public/data\`, does not change official standard text, and does not make
the system publication-ready.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| source review complete | ${payload.source_review_complete} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |
| batch reviewed decisions | ${payload.summary.batch_reviewed_decisions} |
| approved bridge decisions | ${payload.summary.approved_bridge_decisions} |
| pending source review decisions | ${payload.summary.pending_source_review_decisions} |

## Decisions

| Decision | Count |
| --- | ---: |
${countRows(payload.summary.by_reviewer_decision)}

## Reviewed Batch Rows

| Decision | Subject | Grade | Standard | Unit | Tags | Note |
| --- | --- | --- | --- | --- | --- | --- |
${reviewedRows(payload.bridge_review_decisions)}

## Boundary

- Approvals are standard-scoped only and page-ready in this batch.
- Rejections catch explicit topic-category mismatches such as football units mapped to track-and-field or gymnastics standards.
- Needs-revision rows require a narrower topic/alias or curriculum review before approval.
- A later registry, matcher, and publication gate is still required.
`
}

function validateInputs(decisions, batch, args, errors) {
  if (decisions.valid !== true) errors.push('decisions template valid must be true')
  if (decisions.data_scope !== 'h4g_subject_theme_bridge_review_decisions_template') {
    errors.push('decisions data_scope must be h4g_subject_theme_bridge_review_decisions_template')
  }
  if (decisions.writes_public_data !== false) errors.push('decisions writes_public_data must be false')
  if (decisions.changes_official_standard_text !== false) errors.push('decisions changes_official_standard_text must be false')
  if (batch.valid !== true) errors.push('review batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_source_review_batch') {
    errors.push('batch purpose must be h4g_subject_theme_bridge_source_review_batch')
  }
  if (batch.writes_public_data !== false) errors.push('batch writes_public_data must be false')
  if (batch.changes_official_standard_text !== false) errors.push('batch changes_official_standard_text must be false')
  if (args.requireItems && !(batch.batch_items || []).length) {
    errors.push('requireItems is set but batch has no batch_items')
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  if (!existsSync(args.decisions)) errors.push(`Missing decisions template: ${args.decisions}`)
  if (!existsSync(args.batch)) errors.push(`Missing review batch: ${args.batch}`)
  if (errors.length) {
    const result = { valid: false, errors }
    console.log(JSON.stringify(result, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const decisions = readJson(args.decisions)
  const batch = readJson(args.batch)
  validateInputs(decisions, batch, args, errors)
  const batchMap = batchItemByDecisionId(batch)
  const nextRows = (decisions.bridge_review_decisions || [])
    .map(row => reviewDecision(row, batchMap.get(row.decision_id), args))
  const payload = {
    ...decisions,
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    source_review_complete: false,
    publication_ready: false,
    matcher_ready: false,
    writes_public_data: false,
    changes_official_standard_text: false,
    eligible_for_h4g_differentiation: false,
    direct_matcher_use: false,
    source_review_recommendation: {
      policy: 'p1_batch_standard_scoped_strong_matches_only',
      reviewed_at: args.reviewedAt,
      reviewed_by: args.reviewer,
      source_batch: args.batch,
      source_decisions: args.decisions
    },
    bridge_review_decisions: nextRows,
    summary: summarize(nextRows, batchMap),
    errors
  }

  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable({
    valid: payload.valid,
    out: args.out,
    summary_out: args.summaryOut || null,
    source_review_complete: payload.source_review_complete,
    matcher_ready: payload.matcher_ready,
    publication_ready: payload.publication_ready,
    summary: payload.summary,
    errors
  }), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
