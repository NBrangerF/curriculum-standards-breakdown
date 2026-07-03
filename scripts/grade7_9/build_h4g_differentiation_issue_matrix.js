#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_READINESS = 'generated/grade7_9_h4g_grade_differentiation_readiness.json'
const DEFAULT_DISTINCTIVENESS = 'generated/grade7_9_distinctiveness_audit.json'
const DEFAULT_ANCHOR_GROUP_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_ANCHOR_PRIORITY_MATRIX = 'generated/textbook_evidence/h4g_theme_bridge_anchor_priority_matrix_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/grade7_9_h4g_differentiation_issue_matrix.json'
const DEFAULT_SUMMARY_OUT = 'generated/grade7_9_h4g_differentiation_issue_matrix.md'

const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']

const ROUTE_PRIORITY = {
  complete_anchor_group_decisions_before_item_review: 10,
  expand_existing_unit_evidence_pipeline: 20,
  repair_or_confirm_single_partial_grade_assignment: 30,
  build_unit_chapter_evidence_from_file_level_sources: 40,
  source_coverage_or_low_confidence_evidence_gap: 50,
  ready_for_publication_gate: 90,
  no_h4g_records: 99
}

function parseArgs(argv) {
  const args = {
    anchorGroupDecisions: DEFAULT_ANCHOR_GROUP_DECISIONS,
    anchorPriorityMatrix: DEFAULT_ANCHOR_PRIORITY_MATRIX,
    distinctiveness: DEFAULT_DISTINCTIVENESS,
    out: DEFAULT_OUT,
    readiness: DEFAULT_READINESS,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--readiness') args.readiness = argv[++i]
    else if (item === '--distinctiveness') args.distinctiveness = argv[++i]
    else if (item === '--anchor-group-decisions') args.anchorGroupDecisions = argv[++i]
    else if (item === '--anchor-priority-matrix') args.anchorPriorityMatrix = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/build_h4g_differentiation_issue_matrix.js \\
  --readiness generated/grade7_9_h4g_grade_differentiation_readiness.json \\
  --distinctiveness generated/grade7_9_distinctiveness_audit.json \\
  --strict

Builds a read-only H4G differentiation issue matrix from the current public
H4G audits plus the English/PE anchor group gate. It does not write public/data,
change official standard text, approve bridges, or enable matcher use.`)
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

function pct(numerator, denominator) {
  if (!denominator) return 0
  return Number((numerator / denominator).toFixed(4))
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

function requireInput(path, label, errors) {
  if (!existsSync(path)) {
    errors.push(`Missing ${label}: ${path}`)
    return null
  }
  return readJson(path)
}

function zeroAnchorSubjectStats(subjectSlug) {
  return {
    by_priority_tier: {},
    by_reviewer_decision: {},
    by_review_strategy: {},
    completed_group_decisions: 0,
    pending_group_decisions: 0,
    priority_groups: 0,
    subject_slug: subjectSlug,
    total_items: 0
  }
}

function anchorSubjectStats(decisions) {
  const stats = {}
  for (const row of decisions?.group_review_decisions || []) {
    const subjectSlug = row.subject_slug || 'missing'
    if (!stats[subjectSlug]) stats[subjectSlug] = zeroAnchorSubjectStats(subjectSlug)
    const subject = stats[subjectSlug]
    subject.priority_groups += 1
    subject.total_items += Number(row.total_items || 0)
    if (row.reviewer_decision === 'pending') subject.pending_group_decisions += 1
    else subject.completed_group_decisions += 1
    countInto(subject.by_priority_tier, row.priority_tier)
    countInto(subject.by_reviewer_decision, row.reviewer_decision)
    countInto(subject.by_review_strategy, row.review_strategy)
  }
  return stats
}

function priorityGroupStats(matrix) {
  const stats = {
    by_priority_tier: {},
    by_review_strategy: {},
    by_subject: {},
    by_subject_items: {},
    priority_groups: 0,
    total_anchor_review_items: 0
  }
  for (const group of matrix?.priority_groups || []) {
    stats.priority_groups += 1
    stats.total_anchor_review_items += Number(group.total_items || 0)
    countInto(stats.by_priority_tier, group.priority_tier)
    countInto(stats.by_review_strategy, group.review_strategy)
    countInto(stats.by_subject, group.subject_slug)
    countInto(stats.by_subject_items, group.subject_slug, Number(group.total_items || 0))
  }
  return stats
}

function validateInputs(readiness, distinctiveness, anchorDecisions, priorityMatrix, errors, warnings) {
  if (readiness?.valid !== true) errors.push('readiness audit must be valid=true')
  if (distinctiveness?.valid !== true) errors.push('distinctiveness audit must be valid=true')
  if (anchorDecisions?.valid !== true) errors.push('anchor group decisions must be valid=true')
  if (priorityMatrix?.valid !== true) errors.push('anchor priority matrix must be valid=true')
  if (anchorDecisions?.writes_public_data !== false) errors.push('anchor group decisions writes_public_data must be false')
  if (anchorDecisions?.changes_official_standard_text !== false) errors.push('anchor group decisions changes_official_standard_text must be false')
  if (anchorDecisions?.direct_matcher_use !== false) errors.push('anchor group decisions direct_matcher_use must be false')
  if (priorityMatrix?.writes_public_data !== false) errors.push('anchor priority matrix writes_public_data must be false')

  const readinessTotals = readiness?.totals || {}
  const distinctTotals = distinctiveness?.totals || {}
  const totalChecks = [
    ['h4g_records vs junior_records', readinessTotals.h4g_records, distinctTotals.junior_records],
    ['progression_groups', readinessTotals.progression_groups, distinctTotals.progression_groups],
    ['complete_triplets', readinessTotals.complete_triplets, distinctTotals.complete_triplets],
    ['exact identical triplets', readinessTotals.exact_core_identical_triplets, distinctTotals.exact_identical_triplets],
    ['unit-level records', readinessTotals.unit_level_evidence_records, distinctTotals.unit_level_evidence_records]
  ]
  for (const [label, left, right] of totalChecks) {
    if (Number(left || 0) !== Number(right || 0)) {
      warnings.push(`${label} differs between readiness and distinctiveness audits: ${left ?? 'missing'} vs ${right ?? 'missing'}`)
    }
  }
}

function rootCausesForSubject(stats, anchorStats) {
  const causes = []
  const evidence = stats.by_evidence_granularity || {}
  const reviewStatus = stats.by_review_status || {}
  if ((stats.exact_core_identical_triplets || 0) > 0) causes.push('complete_h4g_triplets_share_source_standard_text')
  if ((stats.unit_level_evidence_records || 0) < (stats.h4g_records || 0)) causes.push('unit_level_evidence_gap')
  if ((stats.usable_grade_focus_records || 0) < (stats.h4g_records || 0)) causes.push('grade_specific_focus_gap')
  if ((stats.incomplete_groups || 0) > 0) causes.push('incomplete_h4g_grade_assignment_groups')
  if ((evidence.none || 0) > 0 || (reviewStatus.needs_grade_differentiation_low_confidence || 0) > 0) {
    causes.push('low_confidence_or_no_evidence_gap')
  }
  if ((anchorStats?.pending_group_decisions || 0) > 0) causes.push('anchor_group_decision_pending')
  return causes
}

function nextActionForSubject(stats, causes, anchorStats) {
  if (!stats.h4g_records) return 'no_h4g_records'
  if (stats.final_ready_records === stats.h4g_records) return 'ready_for_publication_gate'
  if ((anchorStats?.pending_group_decisions || 0) > 0) return 'complete_anchor_group_decisions_before_item_review'
  if ((stats.unit_level_evidence_records || 0) > 0) return 'expand_existing_unit_evidence_pipeline'
  if (causes.includes('incomplete_h4g_grade_assignment_groups')) return 'repair_or_confirm_single_partial_grade_assignment'
  if (causes.includes('low_confidence_or_no_evidence_gap')) return 'source_coverage_or_low_confidence_evidence_gap'
  return 'build_unit_chapter_evidence_from_file_level_sources'
}

function subjectIssueRows(readiness, anchorBySubject) {
  return Object.values(readiness?.subjects || {})
    .map(stats => {
      const subjectSlug = stats.subject_slug
      const anchorStats = anchorBySubject[subjectSlug] || zeroAnchorSubjectStats(subjectSlug)
      const causes = rootCausesForSubject(stats, anchorStats)
      const nextAction = nextActionForSubject(stats, causes, anchorStats)
      return {
        anchor_group_decisions: anchorStats.priority_groups,
        anchor_items: anchorStats.total_items,
        complete_triplets: stats.complete_triplets || 0,
        exact_core_identical_triplets: stats.exact_core_identical_triplets || 0,
        final_ready_records: stats.final_ready_records || 0,
        final_ready_record_rate: pct(stats.final_ready_records || 0, stats.h4g_records || 0),
        h4g_records: stats.h4g_records || 0,
        incomplete_groups: stats.incomplete_groups || 0,
        missing_grade_focus_records: Math.max(0, (stats.h4g_records || 0) - (stats.usable_grade_focus_records || 0)),
        missing_unit_level_evidence_records: Math.max(0, (stats.h4g_records || 0) - (stats.unit_level_evidence_records || 0)),
        next_action: nextAction,
        next_action_priority: ROUTE_PRIORITY[nextAction] || 80,
        pending_anchor_group_decisions: anchorStats.pending_group_decisions,
        root_causes: causes,
        subject: stats.subject || subjectSlug,
        subject_slug: subjectSlug,
        unit_level_evidence_records: stats.unit_level_evidence_records || 0,
        usable_grade_focus_records: stats.usable_grade_focus_records || 0
      }
    })
    .sort((a, b) => {
      const priority = a.next_action_priority - b.next_action_priority
      if (priority) return priority
      const missing = b.missing_unit_level_evidence_records - a.missing_unit_level_evidence_records
      if (missing) return missing
      return a.subject_slug.localeCompare(b.subject_slug)
    })
}

function summarizeIssues(subjectRows) {
  const summary = {
    by_next_action: {},
    by_root_cause: {},
    h4g_records_requiring_grade_focus: 0,
    h4g_records_requiring_unit_evidence: 0,
    subjects: subjectRows.length,
    subjects_with_anchor_group_gate: 0,
    subjects_with_incomplete_grade_assignment: 0,
    subjects_with_zero_unit_evidence: 0
  }
  for (const row of subjectRows) {
    countInto(summary.by_next_action, row.next_action)
    for (const cause of row.root_causes) countInto(summary.by_root_cause, cause)
    summary.h4g_records_requiring_grade_focus += row.missing_grade_focus_records
    summary.h4g_records_requiring_unit_evidence += row.missing_unit_level_evidence_records
    if (row.pending_anchor_group_decisions > 0) summary.subjects_with_anchor_group_gate += 1
    if (row.incomplete_groups > 0) summary.subjects_with_incomplete_grade_assignment += 1
    if (row.unit_level_evidence_records === 0 && row.h4g_records > 0) summary.subjects_with_zero_unit_evidence += 1
  }
  return summary
}

function executionBatches(subjectRows, anchorStats, priorityStats) {
  const bySlug = Object.fromEntries(subjectRows.map(row => [row.subject_slug, row]))
  const english = bySlug.english || {}
  const pe = bySlug.pe || {}
  const math = bySlug.math || {}
  const science = bySlug.science || {}
  const zeroEvidenceSubjects = subjectRows
    .filter(row => row.h4g_records > 0 && row.unit_level_evidence_records === 0 && row.pending_anchor_group_decisions === 0)
    .map(row => row.subject_slug)
  const partialAssignmentSubjects = subjectRows
    .filter(row => row.incomplete_groups > 0)
    .map(row => row.subject_slug)

  return [
    {
      batch_id: 'english_pe_anchor_group_decision_gate',
      entry_gate: 'npm run textbooks:h4g-theme-bridge-anchor-group-decisions -- --strict --require-groups',
      exit_gate: 'npm run textbooks:audit-h4g-theme-bridge-anchor-group-decisions -- --strict --require-groups --require-complete',
      next_action: 'complete_anchor_group_decisions_before_item_review',
      pending_groups: (anchorStats.english?.pending_group_decisions || 0) + (anchorStats.pe?.pending_group_decisions || 0),
      priority_groups: priorityStats.priority_groups,
      scope: {
        english_records: english.h4g_records || 0,
        pe_records: pe.h4g_records || 0,
        priority_matrix_items: priorityStats.total_anchor_review_items
      },
      writes_public_data: false
    },
    {
      batch_id: 'math_science_unit_evidence_completion',
      entry_gate: 'npm run textbooks:plan-h4g-unit-worklist -- --subjects math,science --discover-candidates --strict --require-work-items',
      exit_gate: 'npm run textbooks:audit-h4g-unit-consistency -- --strict --require-candidates',
      next_action: 'expand_existing_unit_evidence_pipeline',
      scope: {
        math_missing_unit_records: math.missing_unit_level_evidence_records || 0,
        science_missing_unit_records: science.missing_unit_level_evidence_records || 0
      },
      writes_public_data: false
    },
    {
      batch_id: 'single_or_partial_grade_assignment_repair',
      entry_gate: 'npm run grade7_9:audit-h4g-grade-differentiation -- --data-root public/data',
      exit_gate: 'npm run grade7_9:audit-h4g-grade-differentiation -- --data-root <candidate-root>',
      next_action: 'repair_or_confirm_single_partial_grade_assignment',
      scope: {
        affected_subjects: partialAssignmentSubjects,
        incomplete_groups: subjectRows.reduce((sum, row) => sum + row.incomplete_groups, 0)
      },
      writes_public_data: false
    },
    {
      batch_id: 'zero_unit_evidence_source_indexing',
      entry_gate: 'npm run textbooks:plan-h4g-unit-worklist -- --discover-candidates --strict',
      exit_gate: 'npm run textbooks:audit-h4g-unit-candidates -- --strict --require-candidates',
      next_action: 'build_unit_chapter_evidence_from_file_level_sources',
      scope: {
        affected_subjects: zeroEvidenceSubjects
      },
      writes_public_data: false
    }
  ]
}

function subjectMarkdownRows(rows) {
  return rows.map(row => (
    `| ${markdownCell(row.subject_slug)} | ${row.h4g_records} | ${row.exact_core_identical_triplets}/${row.complete_triplets} | ${row.unit_level_evidence_records} | ${row.usable_grade_focus_records} | ${row.final_ready_records} | ${row.pending_anchor_group_decisions} | ${markdownCell(row.next_action)} |`
  )).join('\n') || '| - | 0 | 0/0 | 0 | 0 | 0 | 0 | - |'
}

function batchMarkdownRows(rows) {
  return rows.map(row => (
    `| ${markdownCell(row.batch_id)} | ${markdownCell(row.next_action)} | ${row.writes_public_data} | ${markdownCell(row.exit_gate)} |`
  )).join('\n') || '| - | - | false | - |'
}

function markdownSummary(payload) {
  return `# H4G Differentiation Issue Matrix

Generated at: ${payload.generated_at}

This is a read-only execution matrix for the H4G7/H4G8/H4G9 differentiation
effort. It diagnoses which layer is blocking real grade differentiation. It
does not write \`public/data\`, change official standard text, approve bridges,
or enable matcher use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| h4g records | ${payload.public_readiness_totals.h4g_records} |
| progression groups | ${payload.public_readiness_totals.progression_groups} |
| complete triplets | ${payload.public_readiness_totals.complete_triplets} |
| exact identical triplets | ${payload.public_readiness_totals.exact_core_identical_triplets} |
| unit-level evidence records | ${payload.public_readiness_totals.unit_level_evidence_records} |
| final-ready records | ${payload.public_readiness_totals.final_ready_records} |
| anchor priority groups | ${payload.anchor_priority_stats.priority_groups} |
| anchor review items | ${payload.anchor_priority_stats.total_anchor_review_items} |

## Next Actions

| next action | subjects |
| --- | ---: |
${countRows(payload.issue_summary.by_next_action)}

## Root Causes

| root cause | subjects |
| --- | ---: |
${countRows(payload.issue_summary.by_root_cause)}

## Subject Matrix

| subject | H4G records | identical triplets | unit evidence | usable focus | final ready | pending anchor groups | next action |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${subjectMarkdownRows(payload.subject_issue_matrix)}

## Execution Batches

| batch | next action | writes public data | exit gate |
| --- | --- | ---: | --- |
${batchMarkdownRows(payload.execution_batches)}

## Guardrails

- Keep official source standard fields immutable.
- Treat identical H4G triplets as shared 7-9 source standards until reviewed unit evidence proves a grade-specific focus.
- Complete English/PE anchor group decisions before item-level source review or matcher use.
- Use publication gates only after reviewed unit evidence, same-grade scope, cross-version consistency, and no-public-write dry-run checks pass.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}

## Warnings

${payload.warnings.length ? payload.warnings.map(warning => `- ${markdownCell(warning)}`).join('\n') : '- none'}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const warnings = []
  const readiness = requireInput(args.readiness, 'readiness audit', errors)
  const distinctiveness = requireInput(args.distinctiveness, 'distinctiveness audit', errors)
  const anchorDecisions = requireInput(args.anchorGroupDecisions, 'anchor group decisions', errors)
  const priorityMatrix = requireInput(args.anchorPriorityMatrix, 'anchor priority matrix', errors)

  if (!errors.length) validateInputs(readiness, distinctiveness, anchorDecisions, priorityMatrix, errors, warnings)

  const anchorBySubject = anchorSubjectStats(anchorDecisions)
  const subjectRows = readiness ? subjectIssueRows(readiness, anchorBySubject) : []
  const priorityStats = priorityGroupStats(priorityMatrix)
  const payload = {
    anchor_group_decision_summary: anchorDecisions?.summary || {},
    anchor_group_stats_by_subject: anchorBySubject,
    anchor_priority_stats: priorityStats,
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    execution_batches: executionBatches(subjectRows, anchorBySubject, priorityStats),
    generated_at: new Date().toISOString(),
    issue_summary: summarizeIssues(subjectRows),
    matcher_ready: false,
    publication_ready: false,
    public_readiness_totals: readiness?.totals || {},
    purpose: 'h4g_differentiation_issue_matrix',
    source_inputs: {
      anchor_group_decisions: args.anchorGroupDecisions,
      anchor_priority_matrix: args.anchorPriorityMatrix,
      distinctiveness: args.distinctiveness,
      readiness: args.readiness
    },
    subject_issue_matrix: subjectRows,
    target_grade_bands: TARGET_GRADE_BANDS,
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }

  writeJson(args.out, payload)
  writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(payload, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
