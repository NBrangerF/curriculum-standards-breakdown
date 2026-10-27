#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_unit_evidence_blocker_action_worklist.json'
const DEFAULT_DIAGNOSTICS = 'generated/textbook_evidence/h4g_unit_evidence_blocker_match_diagnostics.json'
const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_batch.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_unit_evidence_anchor_policy_review_batch.md'
const TARGET_ROUTE = 'review_noneligible_medium_high_match_for_anchor_or_policy'
const TARGET_ACTION_TYPE = 'review_anchor_policy_for_noneligible_medium_high_matches'
const TARGET_QUEUE = 'anchor_policy_review_queue'
const TARGET_CONFIDENCE_BANDS = new Set(['high', 'medium'])

function parseArgs(argv) {
  const args = {
    dataRoot: DEFAULT_DATA_ROOT,
    diagnostics: DEFAULT_DIAGNOSTICS,
    maxMatchesPerStandard: 8,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    subjects: [],
    summaryOut: DEFAULT_SUMMARY_OUT,
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--diagnostics') args.diagnostics = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subjects') args.subjects = splitArg(argv[++i])
    else if (item === '--max-matches-per-standard') args.maxMatchesPerStandard = positiveInteger(argv[++i], args.maxMatchesPerStandard)
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_unit_evidence_anchor_policy_review_batch.js \\
  --subjects math,science \\
  --strict --require-items

Builds a read-only review batch for H4G unit-evidence blocker work items whose
primary route is non-eligible medium/high unit matches. It prepares evidence for
manual anchor/policy review without approving candidates, changing official
standard text, writing public/data, or enabling matcher/publication use.`)
}

function splitArg(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
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

function hashText(value, length = 14) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function truncate(value, max = 120) {
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

function policy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    publication_ready: false,
    requires_later_manual_review: true,
    requires_later_candidate_coverage_recheck: true,
    requires_later_consistency_gate: true,
    requires_later_publication_gate: true,
    review_batch_only: true,
    worklist_only: true,
    writes_public_data: false
  }
}

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function loadStandardsByCode(dataRoot, selectedSubjects, errors) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) {
    errors.push(`Missing by_subject data root: ${dir}`)
    return new Map()
  }
  const selected = new Set(selectedSubjects)
  const byCode = new Map()
  for (const file of subjectFiles(dataRoot)) {
    const subjectSlug = basename(file, '.json')
    if (selected.size && !selected.has(subjectSlug)) continue
    const payload = readJson(file)
    for (const standard of payload.standards || []) {
      if (!standard.code) continue
      byCode.set(standard.code, {
        code: standard.code,
        domain: standard.domain || '',
        grade: standard.grade || '',
        grade_band: standard.grade_band || '',
        grade_level: standard.grade_level ?? null,
        grade_range: standard.grade_range || '',
        learning_area: standard.learning_area || '',
        progression_group_id: standard.progression_group_id || '',
        progression_role: standard.progression_role || '',
        review_status: standard.review_status || '',
        source_grade_range: standard.source_grade_range || '',
        source_standard_scope: standard.source_standard_scope || '',
        standard: standard.standard || '',
        standard_variant_type: standard.standard_variant_type || '',
        subject: standard.subject || payload.subject || subjectSlug,
        subject_slug: standard.subject_slug || subjectSlug
      })
    }
  }
  return byCode
}

function validateInputs(worklist, diagnostics, errors) {
  if (worklist.valid !== true) errors.push('worklist must be valid=true')
  if (worklist.purpose !== 'h4g_unit_evidence_blocker_action_worklist') errors.push('worklist purpose mismatch')
  if (worklist.worklist_only !== true) errors.push('worklist worklist_only must be true')
  if (worklist.writes_public_data !== false) errors.push('worklist writes_public_data must be false')
  if (worklist.direct_matcher_use !== false) errors.push('worklist direct_matcher_use must be false')
  if (worklist.publication_ready !== false) errors.push('worklist publication_ready must be false')
  if (diagnostics.valid !== true) errors.push('diagnostics must be valid=true')
  if (diagnostics.purpose !== 'h4g_unit_evidence_blocker_match_diagnostics') errors.push('diagnostics purpose mismatch')
  if (diagnostics.writes_public_data !== false) errors.push('diagnostics writes_public_data must be false')
  if (diagnostics.direct_matcher_use !== false) errors.push('diagnostics direct_matcher_use must be false')
  if (diagnostics.publication_ready !== false) errors.push('diagnostics publication_ready must be false')
}

function diagnosticsByCode(diagnostics) {
  const out = new Map()
  for (const row of diagnostics.blocker_match_diagnostics || []) {
    if (row.code) out.set(row.code, row)
  }
  return out
}

function candidateMatches(row, maxMatches) {
  return (row?.top_matches || [])
    .filter(match => match.eligible_for_h4g_differentiation !== true)
    .filter(match => TARGET_CONFIDENCE_BANDS.has(match.confidence_band))
    .slice(0, maxMatches)
    .map(match => ({
      confidence_band: match.confidence_band || '',
      edition: match.edition || '',
      eligible_alignment: match.eligible_alignment || '',
      eligible_for_h4g_differentiation: false,
      evidence_id: match.evidence_id || '',
      keyword_score: match.keyword_score ?? null,
      match_id: match.match_id || '',
      page_range: match.page_range || '',
      page_start: match.page_start || '',
      source_file: match.source_file || '',
      unit_title: match.unit_title || ''
    }))
}

function standardContext(standard, fallback) {
  return standard || {
    code: fallback.code || '',
    domain: '',
    grade: '',
    grade_band: fallback.grade_band || '',
    grade_level: null,
    grade_range: '',
    learning_area: '',
    progression_group_id: '',
    progression_role: '',
    review_status: '',
    source_grade_range: '',
    source_standard_scope: '',
    standard: '',
    standard_variant_type: '',
    subject: fallback.subject_slug || '',
    subject_slug: fallback.subject_slug || ''
  }
}

function reviewConfirmations() {
  return {
    same_grade_scope_confirmed: false,
    source_anchor_specific_to_standard: false,
    unit_title_scope_not_overbroad: false,
    noneligible_reason_understood: false,
    policy_exception_or_alias_is_justified: false,
    cross_version_consistency_checked: false
  }
}

function buildItems(worklist, diagnostics, standardsByCode, args, warnings) {
  const selectedSubjects = new Set(args.subjects)
  const byCode = diagnosticsByCode(diagnostics)
  const items = []
  for (const workItem of worklist.action_work_items || []) {
    if (workItem.primary_diagnostic_route !== TARGET_ROUTE) continue
    if (workItem.action_type !== TARGET_ACTION_TYPE) continue
    if (selectedSubjects.size && !selectedSubjects.has(workItem.subject_slug)) continue
    for (const standard of workItem.standards || []) {
      if (standard.diagnostic_route !== TARGET_ROUTE) continue
      const diagnostic = byCode.get(standard.code)
      if (!diagnostic) {
        warnings.push(`${standard.code} missing diagnostics row`)
        continue
      }
      const matches = candidateMatches(diagnostic, args.maxMatchesPerStandard)
      if (!matches.length) {
        warnings.push(`${standard.code} has no medium/high non-eligible matches in diagnostics`)
        continue
      }
      const context = standardContext(standardsByCode.get(standard.code), {
        code: standard.code,
        grade_band: standard.grade_band,
        subject_slug: workItem.subject_slug
      })
      items.push({
        action_type: TARGET_ACTION_TYPE,
        anchor_policy_review_item_id: `h4g_unit_anchor_policy_review_${hashText(`${workItem.work_item_id}:${standard.code}`)}`,
        candidate_matches: matches,
        candidate_matches_count: matches.length,
        changes_official_standard_text: false,
        decision_type: 'h4g_unit_anchor_policy_review',
        direct_matcher_use: false,
        eligible_for_h4g_differentiation: false,
        grade_band: standard.grade_band || context.grade_band || '',
        group_grade_bands: workItem.grade_bands || [],
        group_progression_completeness: workItem.progression_completeness || '',
        group_standard_codes: workItem.standard_codes || [],
        matcher_ready: false,
        parent_action_work_item_id: workItem.work_item_id || '',
        policy: policy(),
        primary_diagnostic_route: TARGET_ROUTE,
        priority_score: Number(workItem.priority_score || 0),
        progression_group_id: workItem.progression_group_id || '',
        publication_ready: false,
        reviewer_decision: 'pending',
        reviewer_gate: workItem.reviewer_gate || 'Manual anchor/policy review is required before eligibility changes.',
        required_confirmations: reviewConfirmations(),
        source_diagnostic: {
          clean_edition_count: diagnostic.clean_edition_count || 0,
          clean_editions: diagnostic.clean_editions || [],
          coverage_status: diagnostic.coverage_status || '',
          match_counts: diagnostic.match_counts || {},
          proposed_next_action: diagnostic.proposed_next_action || '',
          public_has_unit_evidence: diagnostic.public_has_unit_evidence === true
        },
        standard_code: standard.code || '',
        standard_context: context,
        subject_slug: workItem.subject_slug || context.subject_slug || '',
        worklist_only: true,
        writes_public_data: false
      })
    }
  }
  return items.sort((a, b) => b.priority_score - a.priority_score ||
    a.subject_slug.localeCompare(b.subject_slug) ||
    a.progression_group_id.localeCompare(b.progression_group_id) ||
    a.grade_band.localeCompare(b.grade_band) ||
    a.standard_code.localeCompare(b.standard_code))
}

function summarize(items) {
  const summary = {
    anchor_policy_review_items: items.length,
    by_confidence_band: {},
    by_grade_band: {},
    by_progression_completeness: {},
    by_subject: {},
    candidate_matches: 0,
    parent_action_work_items: sorted(items.map(item => item.parent_action_work_item_id)).length,
    top_priority_score: items[0]?.priority_score || 0
  }
  for (const item of items) {
    countInto(summary.by_grade_band, item.grade_band)
    countInto(summary.by_progression_completeness, item.group_progression_completeness)
    summary.candidate_matches += item.candidate_matches_count || 0
    summary.by_subject[item.subject_slug] ||= {
      anchor_policy_review_items: 0,
      candidate_matches: 0,
      parent_action_work_items: new Set()
    }
    const subject = summary.by_subject[item.subject_slug]
    subject.anchor_policy_review_items += 1
    subject.candidate_matches += item.candidate_matches_count || 0
    subject.parent_action_work_items.add(item.parent_action_work_item_id)
    for (const match of item.candidate_matches || []) countInto(summary.by_confidence_band, match.confidence_band)
  }
  for (const [subject, stats] of Object.entries(summary.by_subject)) {
    summary.by_subject[subject] = {
      anchor_policy_review_items: stats.anchor_policy_review_items,
      candidate_matches: stats.candidate_matches,
      parent_action_work_items: stats.parent_action_work_items.size
    }
  }
  return summary
}

function tableRows(items, limit = 50) {
  return items.slice(0, limit).map(item => {
    const top = item.candidate_matches[0]
    const topText = top ? `${top.edition} / ${top.unit_title} / ${top.confidence_band}` : '-'
    return `| ${markdownCell(item.anchor_policy_review_item_id)} | ${markdownCell(item.subject_slug)} | ${markdownCell(item.grade_band)} | ${markdownCell(item.standard_code)} | ${item.priority_score} | ${item.candidate_matches_count} | ${truncate(item.standard_context.standard, 64)} | ${truncate(topText, 80)} |`
  }).join('\n') || '| - | - | - | - | 0 | 0 | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Unit Evidence Anchor Policy Review Batch

Generated at: ${payload.generated_at}

This read-only batch prepares medium/high non-eligible unit matches for manual
anchor-policy review. It does not approve evidence, change official standard
text, write public/data, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| review items | ${payload.summary.anchor_policy_review_items} |
| candidate matches | ${payload.summary.candidate_matches} |
| parent action work items | ${payload.summary.parent_action_work_items} |
| top priority score | ${payload.summary.top_priority_score} |

## Subjects

| subject | review items | candidate matches | parent work items |
| --- | ---: | ---: | ---: |
${Object.entries(payload.summary.by_subject || {}).sort(([a], [b]) => a.localeCompare(b)).map(([subject, stats]) => `| ${markdownCell(subject)} | ${stats.anchor_policy_review_items} | ${stats.candidate_matches} | ${stats.parent_action_work_items} |`).join('\n') || '| - | 0 | 0 | 0 |'}

## Confidence Bands

| confidence | matches |
| --- | ---: |
${countRows(payload.summary.by_confidence_band)}

## First Review Items

| item | subject | grade | standard | priority | matches | standard text | top match |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
${tableRows(payload.anchor_policy_review_items)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}

## Warnings

${payload.warnings.length ? payload.warnings.map(warning => `- ${markdownCell(warning)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  const warnings = []
  for (const [label, path] of [
    ['worklist', args.worklist],
    ['diagnostics', args.diagnostics],
    ['data root', args.dataRoot]
  ]) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const worklist = existsSync(args.worklist) ? readJson(args.worklist) : { action_work_items: [] }
  const diagnostics = existsSync(args.diagnostics) ? readJson(args.diagnostics) : { blocker_match_diagnostics: [] }
  if (!errors.length) validateInputs(worklist, diagnostics, errors)
  const standardsByCode = errors.length ? new Map() : loadStandardsByCode(args.dataRoot, args.subjects, errors)
  const items = errors.length ? [] : buildItems(worklist, diagnostics, standardsByCode, args, warnings)
  if (args.requireItems && !items.length) errors.push('requireItems is set but no anchor policy review items were generated')
  return {
    anchor_policy_review_items: items,
    changes_official_standard_text: false,
    data_root: args.dataRoot,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    policy: policy(),
    publication_ready: false,
    purpose: 'h4g_unit_evidence_anchor_policy_review_batch',
    review_batch_only: true,
    selected_subjects: args.subjects,
    source_diagnostics: args.diagnostics,
    source_worklist: args.worklist,
    summary: summarize(items),
    target_action_type: TARGET_ACTION_TYPE,
    target_diagnostic_route: TARGET_ROUTE,
    valid: errors.length === 0,
    warnings,
    worklist_only: true,
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
  if (args.out) writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify({
    errors: payload.errors,
    generated_at: payload.generated_at,
    out: args.out,
    purpose: payload.purpose,
    summary: payload.summary,
    summary_out: args.summaryOut,
    valid: payload.valid,
    warnings: payload.warnings,
    worklist_only: payload.worklist_only,
    writes_public_data: payload.writes_public_data
  }, null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
