#!/usr/bin/env node
import {
  GATE_VERSION,
  TARGET_GRADE_BANDS,
  bloomDokHintForSignal,
  countInto,
  countRows,
  evidenceConfidence,
  hashJson,
  loadH4GRecords,
  loadRegistry,
  markdownCell,
  normalizeGradeSignal,
  readJson,
  recordsByGroup,
  shortHash,
  signalFamilyForAllowedUse,
  sorted,
  sourcesForSubject,
  stable,
  summarizeGroup,
  supportedGradeBandsForSignal,
  writeJson,
  writeText
} from './h4g_supplemental_pipeline_utils.js'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_REGISTRY = 'generated/h4g_supplemental_sources/source_registry.json'
const DEFAULT_SOURCE_FREEZE = 'generated/h4g_supplemental_sources/source_registry.freeze.json'
const DEFAULT_EVIDENCE_OUT = 'generated/h4g_supplemental_evidence/evidence_items.json'
const DEFAULT_TASK_SIGNAL_OUT = 'generated/h4g_supplemental_evidence/task_signal_items.json'
const DEFAULT_AUDIT_OUT = 'generated/h4g_supplemental_evidence/evidence_extraction_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/h4g_supplemental_evidence/evidence_extraction_audit.md'
const DEFAULT_FREEZE_OUT = 'generated/h4g_supplemental_evidence/evidence_items.freeze.json'

function parseArgs(argv) {
  const args = {
    auditOut: DEFAULT_AUDIT_OUT,
    dataRoot: DEFAULT_DATA_ROOT,
    evidenceOut: DEFAULT_EVIDENCE_OUT,
    freeze: false,
    freezeOut: DEFAULT_FREEZE_OUT,
    registry: DEFAULT_REGISTRY,
    sourceFreeze: DEFAULT_SOURCE_FREEZE,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    taskSignalOut: DEFAULT_TASK_SIGNAL_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--audit-out') args.auditOut = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--evidence-out') args.evidenceOut = argv[++i]
    else if (item === '--freeze') args.freeze = true
    else if (item === '--freeze-out') args.freezeOut = argv[++i]
    else if (item === '--registry') args.registry = argv[++i]
    else if (item === '--source-freeze') args.sourceFreeze = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--task-signal-out') args.taskSignalOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/build_h4g_supplemental_evidence.js --strict --freeze

Gate 1 evidence extraction. Converts frozen source registry metadata into
review-only task and grade-signal evidence for H4G progression groups. It does
not infer final G7/G8/G9 descriptors, build a skill graph, or write public/data.`)
}

function sourceFreezeStatus(path, warnings) {
  try {
    const payload = readJson(path)
    if (payload.freeze_status !== 'frozen_candidate') {
      warnings.push(`source freeze is not frozen_candidate: ${path}`)
    }
    return {
      freeze_hash: payload.freeze_hash || payload.content_hash || '',
      freeze_scope: payload.freeze_scope || '',
      freeze_status: payload.freeze_status || 'unknown',
      source_freeze_path: path
    }
  } catch {
    warnings.push(`source freeze not found; continuing with registry only: ${path}`)
    return {
      freeze_hash: '',
      freeze_scope: '',
      freeze_status: 'missing',
      source_freeze_path: path
    }
  }
}

function evidenceId(source, groupId, subjectSlug) {
  return `ev-${shortHash([source.source_id, groupId, subjectSlug].join('|'), 16)}`
}

function taskSignalId(evidence, allowedUse) {
  return `sig-${shortHash([evidence.evidence_id, allowedUse].join('|'), 16)}`
}

function buildEvidenceItem(source, groupId, group) {
  const gradeSignalHint = normalizeGradeSignal(source.grade_signal)
  const confidence = evidenceConfidence(source, gradeSignalHint)
  const first = group.first_record || {}
  const item = {
    allowed_use_scope: sorted(source.allowed_use),
    changes_official_standard_text: false,
    confidence,
    confidence_basis: [
      `source_tier:${source.source_tier}`,
      `authority_score:${source.authority_score}`,
      `grade_signal_hint:${gradeSignalHint}`,
      source.subject_coverage?.length === 1 ? 'subject_specific_source' : 'cross_subject_source'
    ],
    direct_grade_assignment: false,
    direct_matcher_use: false,
    disallowed_use_enforced: sorted(source.disallowed_use),
    evidence_id: evidenceId(source, groupId, group.subject_slug),
    extraction_grain: 'progression_group_source',
    extractor_version: GATE_VERSION,
    gate: 'GATE_1_EVIDENCE_EXTRACTION',
    grade_signal_hint: gradeSignalHint,
    group_context: {
      codes: group.codes,
      complete_triplet: group.complete_triplet,
      domain: first.domain || '',
      exact_core_identical: group.exact_core_identical,
      grade_bands: group.grade_bands,
      source_identical: group.source_identical,
      subdomain: first.subdomain || ''
    },
    progression_group_id: groupId,
    public_write_ready: false,
    review_status: 'machine_extracted_needs_review',
    signal_value: {
      authority_body: source.authority_body || '',
      authority_level: source.authority_level || '',
      authority_score: source.authority_score,
      grade_band_signal: source.grade_band_signal || '',
      license_status: source.license_status || '',
      source_tier: source.source_tier,
      source_type: source.source_type,
      url: source.url
    },
    source_id: source.source_id,
    source_title: source.title,
    source_type: source.source_type,
    subject: group.subject,
    subject_slug: group.subject_slug,
    supported_grade_bands: supportedGradeBandsForSignal(gradeSignalHint),
    writes_public_data: false
  }
  return item
}

function buildTaskSignals(evidence, source) {
  return sorted(source.allowed_use).map(allowedUse => {
    const signalFamily = signalFamilyForAllowedUse(allowedUse)
    return {
      ...bloomDokHintForSignal(signalFamily),
      allowed_use: allowedUse,
      confidence: evidence.confidence,
      direct_grade_assignment: false,
      direct_matcher_use: false,
      evidence_id: evidence.evidence_id,
      extraction_grain: evidence.extraction_grain,
      gate: 'GATE_1_EVIDENCE_EXTRACTION',
      grade_signal_hint: evidence.grade_signal_hint,
      progression_group_id: evidence.progression_group_id,
      public_write_ready: false,
      review_status: 'machine_extracted_needs_review',
      signal_family: signalFamily,
      signal_id: taskSignalId(evidence, allowedUse),
      source_id: evidence.source_id,
      subject_slug: evidence.subject_slug,
      supported_grade_bands: evidence.supported_grade_bands,
      writes_public_data: false
    }
  })
}

function buildAudit(payload) {
  const errors = []
  const warnings = [...payload.warnings]
  const bySubject = {}
  const bySignal = {}
  const byTier = {}
  const bySignalFamily = {}
  const groupEvidence = new Map()

  for (const item of payload.evidence_items) {
    countInto(bySubject, item.subject_slug)
    countInto(bySignal, item.grade_signal_hint)
    countInto(byTier, item.signal_value?.source_tier)
    if (item.writes_public_data !== false) errors.push(`${item.evidence_id} writes_public_data must be false`)
    if (item.changes_official_standard_text !== false) errors.push(`${item.evidence_id} changes_official_standard_text must be false`)
    if (item.direct_grade_assignment !== false) errors.push(`${item.evidence_id} direct_grade_assignment must be false`)
    if (item.public_write_ready !== false) errors.push(`${item.evidence_id} public_write_ready must be false`)
    if (!item.progression_group_id) errors.push(`${item.evidence_id} missing progression_group_id`)
    if (!item.source_id) errors.push(`${item.evidence_id} missing source_id`)
    if (!groupEvidence.has(item.progression_group_id)) groupEvidence.set(item.progression_group_id, [])
    groupEvidence.get(item.progression_group_id).push(item)
  }

  for (const signal of payload.task_signal_items) {
    countInto(bySignalFamily, signal.signal_family)
    if (signal.writes_public_data !== false) errors.push(`${signal.signal_id} writes_public_data must be false`)
    if (signal.direct_grade_assignment !== false) errors.push(`${signal.signal_id} direct_grade_assignment must be false`)
    if (!signal.evidence_id) errors.push(`${signal.signal_id} missing evidence_id`)
  }

  for (const [groupId, group] of payload.groups) {
    const items = groupEvidence.get(groupId) || []
    if (!items.length) errors.push(`${groupId} missing evidence items`)
    if (!items.some(item => item.signal_value?.source_tier === 'P0')) errors.push(`${groupId} missing P0 evidence`)
    if (!items.some(item => item.grade_signal_hint === 'G8_anchor')) warnings.push(`${groupId} missing G8 anchor evidence`)
    if (!items.some(item => item.grade_signal_hint === 'G9_cap')) warnings.push(`${groupId} missing G9 cap evidence`)
    if (group.subject_slug && !items.some(item => item.subject_slug === group.subject_slug)) {
      errors.push(`${groupId} evidence subject mismatch`)
    }
  }

  const evidenceIds = new Set()
  for (const item of payload.evidence_items) {
    if (evidenceIds.has(item.evidence_id)) errors.push(`duplicate evidence_id: ${item.evidence_id}`)
    evidenceIds.add(item.evidence_id)
  }
  const taskSignalIds = new Set()
  const evidenceIdSet = new Set(payload.evidence_items.map(item => item.evidence_id))
  for (const item of payload.task_signal_items) {
    if (taskSignalIds.has(item.signal_id)) errors.push(`duplicate signal_id: ${item.signal_id}`)
    taskSignalIds.add(item.signal_id)
    if (!evidenceIdSet.has(item.evidence_id)) errors.push(`${item.signal_id} references missing evidence_id: ${item.evidence_id}`)
  }

  const groupsWithEvidence = [...groupEvidence.keys()].length
  const summary = {
    by_signal_family: bySignalFamily,
    by_grade_signal_hint: bySignal,
    by_source_tier: byTier,
    by_subject: bySubject,
    evidence_items: payload.evidence_items.length,
    groups_with_evidence: groupsWithEvidence,
    h4g_progression_groups: payload.groups.size,
    task_signal_items: payload.task_signal_items.length
  }

  return {
    changes_official_standard_text: false,
    direct_grade_assignment: false,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    gate: 'GATE_1_EVIDENCE_EXTRACTION',
    purpose: 'h4g_supplemental_evidence_audit',
    source_freeze: payload.sourceFreeze,
    summary,
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }
}

function buildMarkdown(audit) {
  return `# Gate 1 Evidence Extraction Audit

Generated at: ${audit.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${audit.valid} |
| evidence items | ${audit.summary.evidence_items} |
| task signal items | ${audit.summary.task_signal_items} |
| H4G progression groups | ${audit.summary.h4g_progression_groups} |
| groups with evidence | ${audit.summary.groups_with_evidence} |
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

## Source Tiers

| Tier | Evidence Items |
| --- | ---: |
${countRows(audit.summary.by_source_tier)}

## Errors

${audit.errors.length ? audit.errors.map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}

## Warnings

${audit.warnings.length ? audit.warnings.slice(0, 100).map(item => `- ${markdownCell(item)}`).join('\n') : '- none'}
`
}

function build(args) {
  const errors = []
  const warnings = []
  const { registry } = loadRegistry(args.registry, errors)
  const sourceFreeze = sourceFreezeStatus(args.sourceFreeze, warnings)
  const records = loadH4GRecords(args.dataRoot, errors)
  const groups = recordsByGroup(records)
  const summarizedGroups = new Map([...groups.entries()].map(([groupId, rows]) => [groupId, summarizeGroup(rows)]))
  const evidenceItems = []
  const taskSignalItems = []

  for (const [groupId, group] of summarizedGroups) {
    const subjectSources = sourcesForSubject(registry, group.subject_slug)
    if (!subjectSources.length) errors.push(`${groupId} has no subject sources for ${group.subject_slug}`)
    for (const source of subjectSources) {
      const evidence = buildEvidenceItem(source, groupId, group)
      evidenceItems.push(evidence)
      taskSignalItems.push(...buildTaskSignals(evidence, source))
    }
  }

  const evidencePayload = {
    changes_official_standard_text: false,
    direct_grade_assignment: false,
    direct_matcher_use: false,
    evidence_items: evidenceItems,
    generated_at: new Date().toISOString(),
    gate: 'GATE_1_EVIDENCE_EXTRACTION',
    purpose: 'h4g_supplemental_evidence_items',
    source_registry_path: args.registry,
    source_freeze: sourceFreeze,
    target_grade_bands: TARGET_GRADE_BANDS,
    writes_public_data: false
  }
  const taskSignalPayload = {
    changes_official_standard_text: false,
    direct_grade_assignment: false,
    direct_matcher_use: false,
    generated_at: evidencePayload.generated_at,
    gate: 'GATE_1_EVIDENCE_EXTRACTION',
    purpose: 'h4g_supplemental_task_signal_items',
    source_registry_path: args.registry,
    task_signal_items: taskSignalItems,
    target_grade_bands: TARGET_GRADE_BANDS,
    writes_public_data: false
  }

  const audit = buildAudit({
    evidence_items: evidenceItems,
    groups: summarizedGroups,
    sourceFreeze,
    task_signal_items: taskSignalItems,
    warnings
  })
  audit.errors.push(...errors)
  audit.valid = audit.errors.length === 0

  writeJson(args.evidenceOut, evidencePayload)
  writeJson(args.taskSignalOut, taskSignalPayload)
  writeJson(args.auditOut, audit)
  if (args.summaryOut) writeText(args.summaryOut, buildMarkdown(audit))
  if (args.freeze) {
    writeJson(args.freezeOut, {
      changes_official_standard_text: false,
      direct_grade_assignment: false,
      direct_matcher_use: false,
      evidence_items_hash: hashJson(evidencePayload.evidence_items),
      freeze_scope: 'gate1_evidence_and_task_signal_items_only',
      freeze_status: audit.valid ? 'frozen_candidate' : 'invalid_not_frozen',
      frozen_at: new Date().toISOString(),
      gate: 'GATE_1_EVIDENCE_EXTRACTION',
      source_freeze: sourceFreeze,
      task_signal_items_hash: hashJson(taskSignalPayload.task_signal_items),
      writes_public_data: false
    })
  }

  return { audit, evidencePayload, taskSignalPayload }
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const { audit } = build(args)
console.log(JSON.stringify(stable({
  evidence_items: audit.summary.evidence_items,
  gate: audit.gate,
  groups_with_evidence: audit.summary.groups_with_evidence,
  task_signal_items: audit.summary.task_signal_items,
  valid: audit.valid,
  warnings: audit.warnings.length
}), null, 2))

if (args.strict && !audit.valid) {
  console.error(audit.errors.join('\n'))
  process.exit(1)
}
