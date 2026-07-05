#!/usr/bin/env node
import {
  TARGET_GRADE_BANDS,
  countInto,
  countRows,
  loadH4GRecords,
  loadRegistry,
  markdownCell,
  readJson,
  recordsByGroup,
  stable,
  summarizeGroup,
  writeJson,
  writeText
} from './h4g_supplemental_pipeline_utils.js'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_REGISTRY = 'generated/h4g_supplemental_sources/source_registry.json'
const DEFAULT_EVIDENCE = 'generated/h4g_supplemental_evidence/evidence_items.json'
const DEFAULT_TASK_SIGNALS = 'generated/h4g_supplemental_evidence/task_signal_items.json'
const DEFAULT_OUT = 'generated/h4g_supplemental_evidence/evidence_extraction_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/h4g_supplemental_evidence/evidence_extraction_audit.md'

function parseArgs(argv) {
  const args = {
    dataRoot: DEFAULT_DATA_ROOT,
    evidence: DEFAULT_EVIDENCE,
    out: DEFAULT_OUT,
    registry: DEFAULT_REGISTRY,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    taskSignals: DEFAULT_TASK_SIGNALS
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--evidence') args.evidence = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--registry') args.registry = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--task-signals') args.taskSignals = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/audit_h4g_supplemental_evidence.js --strict

Audits Gate 1 evidence_items and task_signal_items for source lineage, group
coverage, task-signal references, and no-public-write constraints.`)
}

function buildMarkdown(audit) {
  return `# Gate 1 Evidence Extraction Audit

Generated at: ${audit.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${audit.valid} |
| H4G records | ${audit.summary.h4g_records} |
| H4G progression groups | ${audit.summary.h4g_progression_groups} |
| evidence items | ${audit.summary.evidence_items} |
| task signal items | ${audit.summary.task_signal_items} |
| groups with evidence | ${audit.summary.groups_with_evidence} |
| groups missing P0 evidence | ${audit.summary.groups_missing_p0_evidence} |
| groups missing G8 anchor | ${audit.summary.groups_missing_g8_anchor} |
| groups missing G9 cap | ${audit.summary.groups_missing_g9_cap} |
| errors | ${audit.errors.length} |
| warnings | ${audit.warnings.length} |
| writes_public_data | ${audit.writes_public_data} |

## Grade Signal Hints

| Signal | Count |
| --- | ---: |
${countRows(audit.summary.by_grade_signal_hint)}

## Signal Families

| Family | Count |
| --- | ---: |
${countRows(audit.summary.by_signal_family)}

## Subjects

| Subject | Evidence Items |
| --- | ---: |
${countRows(audit.summary.by_subject)}

## Errors

${audit.errors.length ? audit.errors.map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}

## Warnings

${audit.warnings.length ? audit.warnings.slice(0, 100).map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  const warnings = []
  const evidencePayload = readJson(args.evidence)
  const taskSignalPayload = readJson(args.taskSignals)
  const { registry } = loadRegistry(args.registry, errors)
  const sourceIds = new Set(registry.map(source => source.source_id))
  const sourceById = new Map(registry.map(source => [source.source_id, source]))
  const records = loadH4GRecords(args.dataRoot, errors)
  const groups = recordsByGroup(records)
  const summarizedGroups = new Map([...groups.entries()].map(([groupId, rows]) => [groupId, summarizeGroup(rows)]))
  const evidenceItems = Array.isArray(evidencePayload.evidence_items) ? evidencePayload.evidence_items : []
  const taskSignalItems = Array.isArray(taskSignalPayload.task_signal_items) ? taskSignalPayload.task_signal_items : []

  if (!Array.isArray(evidencePayload.evidence_items)) errors.push('evidence_items payload must contain evidence_items[]')
  if (!Array.isArray(taskSignalPayload.task_signal_items)) errors.push('task_signal_items payload must contain task_signal_items[]')
  if (evidencePayload.writes_public_data !== false) errors.push('evidence payload writes_public_data must be false')
  if (taskSignalPayload.writes_public_data !== false) errors.push('task_signal payload writes_public_data must be false')
  if (evidencePayload.direct_grade_assignment !== false) errors.push('evidence payload direct_grade_assignment must be false')
  if (taskSignalPayload.direct_grade_assignment !== false) errors.push('task signal payload direct_grade_assignment must be false')

  const bySubject = {}
  const byGradeSignal = {}
  const bySignalFamily = {}
  const byGroup = new Map()
  const evidenceIds = new Set()

  for (const item of evidenceItems) {
    if (evidenceIds.has(item.evidence_id)) errors.push(`duplicate evidence_id: ${item.evidence_id}`)
    evidenceIds.add(item.evidence_id)
    countInto(bySubject, item.subject_slug)
    countInto(byGradeSignal, item.grade_signal_hint)
    if (!sourceIds.has(item.source_id)) errors.push(`${item.evidence_id} references unknown source_id: ${item.source_id}`)
    if (!summarizedGroups.has(item.progression_group_id)) errors.push(`${item.evidence_id} references unknown progression_group_id: ${item.progression_group_id}`)
    const source = sourceById.get(item.source_id)
    if (source && !source.subject_coverage?.includes(item.subject_slug)) {
      errors.push(`${item.evidence_id} subject ${item.subject_slug} not covered by source ${item.source_id}`)
    }
    if (item.writes_public_data !== false) errors.push(`${item.evidence_id} writes_public_data must be false`)
    if (item.changes_official_standard_text !== false) errors.push(`${item.evidence_id} changes_official_standard_text must be false`)
    if (item.direct_grade_assignment !== false) errors.push(`${item.evidence_id} direct_grade_assignment must be false`)
    if (item.direct_matcher_use !== false) errors.push(`${item.evidence_id} direct_matcher_use must be false`)
    if (item.public_write_ready !== false) errors.push(`${item.evidence_id} public_write_ready must be false`)
    if (!Array.isArray(item.allowed_use_scope) || !item.allowed_use_scope.length) errors.push(`${item.evidence_id} missing allowed_use_scope`)
    if (!Array.isArray(item.disallowed_use_enforced) || !item.disallowed_use_enforced.includes('direct_grade_assignment')) {
      errors.push(`${item.evidence_id} must enforce direct_grade_assignment disallowed_use`)
    }
    if (!byGroup.has(item.progression_group_id)) byGroup.set(item.progression_group_id, [])
    byGroup.get(item.progression_group_id).push(item)
  }

  const taskSignalIds = new Set()
  for (const signal of taskSignalItems) {
    if (taskSignalIds.has(signal.signal_id)) errors.push(`duplicate signal_id: ${signal.signal_id}`)
    taskSignalIds.add(signal.signal_id)
    countInto(bySignalFamily, signal.signal_family)
    if (!evidenceIds.has(signal.evidence_id)) errors.push(`${signal.signal_id} references missing evidence_id: ${signal.evidence_id}`)
    if (signal.writes_public_data !== false) errors.push(`${signal.signal_id} writes_public_data must be false`)
    if (signal.direct_grade_assignment !== false) errors.push(`${signal.signal_id} direct_grade_assignment must be false`)
    if (signal.public_write_ready !== false) errors.push(`${signal.signal_id} public_write_ready must be false`)
  }

  let groupsMissingP0 = 0
  let groupsMissingG8 = 0
  let groupsMissingG9 = 0
  for (const [groupId, group] of summarizedGroups) {
    const items = byGroup.get(groupId) || []
    if (!items.length) errors.push(`${groupId} missing evidence items`)
    const hasP0 = items.some(item => item.signal_value?.source_tier === 'P0')
    const hasG8 = items.some(item => item.grade_signal_hint === 'G8_anchor')
    const hasG9 = items.some(item => item.grade_signal_hint === 'G9_cap')
    if (!hasP0) {
      groupsMissingP0 += 1
      errors.push(`${groupId} missing P0 evidence`)
    }
    if (!hasG8) {
      groupsMissingG8 += 1
      warnings.push(`${groupId} missing G8 anchor evidence`)
    }
    if (!hasG9) {
      groupsMissingG9 += 1
      warnings.push(`${groupId} missing G9 cap evidence`)
    }
    if (group.subject_slug && items.some(item => item.subject_slug !== group.subject_slug)) {
      errors.push(`${groupId} contains evidence from a different subject`)
    }
  }

  const auditResult = {
    changes_official_standard_text: false,
    direct_grade_assignment: false,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    gate: 'GATE_1_EVIDENCE_EXTRACTION',
    purpose: 'h4g_supplemental_evidence_audit',
    summary: {
      by_grade_signal_hint: byGradeSignal,
      by_signal_family: bySignalFamily,
      by_subject: bySubject,
      evidence_items: evidenceItems.length,
      groups_missing_g8_anchor: groupsMissingG8,
      groups_missing_g9_cap: groupsMissingG9,
      groups_missing_p0_evidence: groupsMissingP0,
      groups_with_evidence: byGroup.size,
      h4g_progression_groups: summarizedGroups.size,
      h4g_records: records.length,
      target_grade_bands: TARGET_GRADE_BANDS,
      task_signal_items: taskSignalItems.length
    },
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }
  return auditResult
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const result = audit(args)
writeJson(args.out, result)
if (args.summaryOut) writeText(args.summaryOut, buildMarkdown(result))
console.log(JSON.stringify(stable({
  evidence_items: result.summary.evidence_items,
  gate: result.gate,
  groups_with_evidence: result.summary.groups_with_evidence,
  task_signal_items: result.summary.task_signal_items,
  valid: result.valid,
  warnings: result.warnings.length
}), null, 2))

if (args.strict && !result.valid) {
  console.error(result.errors.join('\n'))
  process.exit(1)
}
