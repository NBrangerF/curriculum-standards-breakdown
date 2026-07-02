#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE_DIR = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean'
const DEFAULT_DECISIONS = `${BASE_DIR}/h4g_publication_review_decisions_template.json`
const DEFAULT_CONTRACT = `${BASE_DIR}/h4g_publication_contract_candidate.json`
const DEFAULT_SOURCE_DATA_ROOT = `${BASE_DIR}/data_candidate_publication_contract`
const DEFAULT_OUT_DATA_ROOT = `${BASE_DIR}/data_candidate_review_decisions`
const DEFAULT_PUBLIC_DATA_ROOT = 'public/data'
const TARGET_GRADE_BANDS = new Set(['H4G7', 'H4G8', 'H4G9'])
const OFFICIAL_TEXT_FIELDS = ['domain', 'subdomain', 'standard', 'context', 'practice', 'teaching_tip', 'assessment_evidence_type']
const SAME_GRADE_APPROVE = 'approve_same_grade_unit_evidence'
const SAME_GRADE_REJECT = 'reject_same_grade_unit_evidence'
const SAME_GRADE_REVISION = 'needs_revision'
const NOTE_APPROVE = 'approve_progression_group_note'
const NOTE_REJECT = 'reject_progression_group_note'
const BLOCKED_KEEP = 'keep_blocked'
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..')

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    contract: DEFAULT_CONTRACT,
    sourceDataRoot: DEFAULT_SOURCE_DATA_ROOT,
    outDataRoot: DEFAULT_OUT_DATA_ROOT,
    clean: true,
    strict: false,
    requireComplete: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--contract') args.contract = argv[++i]
    else if (item === '--source-data-root') args.sourceDataRoot = argv[++i]
    else if (item === '--out-data-root') args.outDataRoot = argv[++i]
    else if (item === '--no-clean') args.clean = false
    else if (item === '--strict') args.strict = true
    else if (item === '--require-complete') args.requireComplete = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/apply_h4g_publication_review_decisions_candidate.js \\
  --decisions generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_review_decisions_template.json \\
  --source-data-root generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/data_candidate_publication_contract \\
  --out-data-root generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/data_candidate_review_decisions \\
  --strict

Applies filled H4G publication review decisions to an isolated generated data
root. It never writes public/data. Pending decisions are copied through without
data changes; approved same-grade decisions can mark standard records as
unit_evidence_approved in the candidate root.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function officialSnapshot(record) {
  return Object.fromEntries(OFFICIAL_TEXT_FIELDS.map(field => [field, record[field] ?? '']))
}

function officialMutationErrors(before, after, code) {
  const errors = []
  for (const field of OFFICIAL_TEXT_FIELDS) {
    if (normalizeText(before[field]) !== normalizeText(after[field])) {
      errors.push(`${code} mutated official field ${field}`)
    }
  }
  return errors
}

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function loadSubjectPayloads(dataRoot) {
  const byCode = new Map()
  const bySubject = new Map()
  for (const file of subjectFiles(dataRoot)) {
    const subjectSlug = basename(file, '.json')
    const payload = readJson(file)
    bySubject.set(subjectSlug, { file, payload })
    for (const record of payload.standards || []) {
      if (record.code) byCode.set(record.code, { record, subjectSlug })
    }
  }
  return { byCode, bySubject }
}

function writeSubjectPayloads(bySubject) {
  for (const { file, payload } of bySubject.values()) {
    writeJson(file, payload)
  }
}

function guardRoots(args, errors) {
  const decisionsFile = resolve(ROOT, args.decisions)
  const contractFile = resolve(ROOT, args.contract)
  const sourceDataRoot = resolve(ROOT, args.sourceDataRoot)
  const outDataRoot = resolve(ROOT, args.outDataRoot)
  const publicDataRoot = resolve(ROOT, DEFAULT_PUBLIC_DATA_ROOT)
  if (!existsSync(decisionsFile)) errors.push(`Missing decisions file: ${decisionsFile}`)
  if (!existsSync(contractFile)) errors.push(`Missing contract file: ${contractFile}`)
  if (!existsSync(sourceDataRoot)) errors.push(`Missing source data root: ${sourceDataRoot}`)
  if (sourceDataRoot === outDataRoot) errors.push('Output data root must be different from source data root.')
  if (outDataRoot === publicDataRoot) errors.push('Output data root cannot be public/data; use a generated candidate root.')
  return { decisionsFile, contractFile, sourceDataRoot, outDataRoot }
}

function contractAllowedFields(contract) {
  const standardSurface = (contract.contract?.surfaces || [])
    .find(surface => surface.surface_id === 'standard_same_grade_unit_evidence')
  return new Set(standardSurface?.allowed_fields || [])
}

function validatePolicies(decisions, contract, errors) {
  if (decisions.valid === false) errors.push('decisions template is marked valid=false')
  if (decisions.data_scope !== 'h4g_publication_review_decisions_template') {
    errors.push('decisions data_scope must be h4g_publication_review_decisions_template')
  }
  if (decisions.publication_candidate !== false) errors.push('decisions publication_candidate must be false')
  if (decisions.publication_ready !== false) errors.push('decisions publication_ready must be false')
  if (decisions.writes_public_data !== false) errors.push('decisions writes_public_data must be false')
  if (decisions.official_standard_text_changed !== false) errors.push('decisions official_standard_text_changed must be false')
  if (contract.valid !== true) errors.push('contract candidate valid must be true')
  if (contract.policy?.writes_public_data !== false) errors.push('contract policy.writes_public_data must be false')
}

function validReviewDate(value) {
  return /^\d{4}-\d{2}-\d{2}/.test(String(value || ''))
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null && value !== ''
}

function requireFilledDecision(row, prefix, errors) {
  if (!hasValue(row.reviewed_by)) errors.push(`${prefix} reviewed_by is required after a non-pending decision`)
  if (!validReviewDate(row.reviewed_at)) errors.push(`${prefix} reviewed_at must start with YYYY-MM-DD after a non-pending decision`)
  if (!hasValue(row.decision_note)) errors.push(`${prefix} decision_note is required after a non-pending decision`)
}

function requireConfirmations(row, prefix, required, errors) {
  const confirmations = row.required_confirmations || {}
  for (const field of required) {
    if (confirmations[field] !== true) errors.push(`${prefix} required_confirmations.${field} must be true`)
  }
}

function boundedDecisionNote(row) {
  const reviewer = normalizeText(row.reviewed_by)
  const date = normalizeText(row.reviewed_at)
  const note = normalizeText(row.decision_note)
  const parts = []
  if (date || reviewer) parts.push(`复核记录：${date || '未填日期'}${reviewer ? `，${reviewer}` : ''}`)
  if (note) parts.push(`复核说明：${note}`)
  return parts.join('；')
}

function standardUpdateForDecision(row, record) {
  const note = boundedDecisionNote(row)
  if (row.reviewer_decision === SAME_GRADE_APPROVE) {
    return {
      grade_assignment_rationale: `${record.grade_assignment_rationale || '该记录保留 7-9 共同课标文本；同年级单元/章节证据已进入候选数据根。'}${note ? ` ${note}` : ''}`,
      h4g_unit_candidate_requires_manual_review: false,
      progression_review_note: `同年级单元/章节证据已获人工复核批准；课标原文保持不变。${note ? ` ${note}` : ''}`,
      requires_unit_level_evidence: false,
      review_status: 'unit_evidence_approved'
    }
  }
  if (row.reviewer_decision === SAME_GRADE_REJECT) {
    return {
      grade_assignment_rationale: `${record.grade_assignment_rationale || '该记录保留 7-9 共同课标文本。'}${note ? ` ${note}` : ''}`,
      h4g_unit_candidate_requires_manual_review: false,
      progression_review_note: `同年级单元/章节证据未获批准，不能作为本年级分化依据。${note ? ` ${note}` : ''}`,
      requires_unit_level_evidence: true,
      review_status: 'unit_evidence_rejected'
    }
  }
  if (row.reviewer_decision === SAME_GRADE_REVISION) {
    return {
      grade_assignment_rationale: `${record.grade_assignment_rationale || '该记录保留 7-9 共同课标文本。'}${note ? ` ${note}` : ''}`,
      h4g_unit_candidate_requires_manual_review: true,
      progression_review_note: `同年级单元/章节证据需要修订后再复核。${note ? ` ${note}` : ''}`,
      requires_unit_level_evidence: true,
      review_status: 'unit_evidence_needs_revision'
    }
  }
  return null
}

function applyAllowedUpdate(record, update, allowedFields) {
  const next = { ...record }
  for (const [field, value] of Object.entries(update || {})) {
    if (allowedFields.has(field)) next[field] = value
  }
  return next
}

function auditSameGradeDecision(row, errors) {
  const prefix = row.standard_code || row.decision_id || '(missing same-grade decision)'
  if (row.requested_public_write !== false) errors.push(`${prefix} requested_public_write must be false`)
  if (row.requested_official_text_change !== false) errors.push(`${prefix} requested_official_text_change must be false`)
  if (row.requested_standard_variant_type_change !== 'none') errors.push(`${prefix} must not request standard_variant_type changes`)
  if (row.reviewer_decision !== 'pending') requireFilledDecision(row, prefix, errors)
  if (row.reviewer_decision === SAME_GRADE_APPROVE) {
    requireConfirmations(row, prefix, [
      'no_public_write_requested',
      'official_standard_text_preserved',
      'page_evidence_checked',
      'same_grade_unit_evidence_confirmed'
    ], errors)
  }
}

function applySameGradeDecisions(decisions, byCode, allowedFields, errors, stats, applied) {
  for (const row of decisions.same_grade_unit_evidence_decisions || []) {
    const decision = row.reviewer_decision || 'missing'
    countInto(stats.by_standard_decision, decision)
    if (decision === 'pending') {
      stats.pending_standard_decisions += 1
      continue
    }

    auditSameGradeDecision(row, errors)
    const item = byCode.get(row.standard_code)
    if (!item) {
      errors.push(`${row.standard_code || '(missing standard_code)'} not found in candidate data root`)
      continue
    }
    const record = item.record
    if (!TARGET_GRADE_BANDS.has(record.grade_band)) errors.push(`${row.standard_code} is not an H4G record`)
    const update = standardUpdateForDecision(row, record)
    if (!update) {
      stats.ignored_standard_decisions += 1
      continue
    }
    const before = officialSnapshot(record)
    const updated = applyAllowedUpdate(record, update, allowedFields)
    const mutationErrors = officialMutationErrors(before, updated, row.standard_code)
    errors.push(...mutationErrors)
    Object.assign(record, updated)
    countInto(stats.by_applied_standard_status, updated.review_status)
    stats.applied_standard_decisions += 1
    applied.standards.push({
      decision_id: row.decision_id,
      reviewer_decision: decision,
      review_status: updated.review_status,
      standard_code: row.standard_code,
      grade_band: record.grade_band,
      subject_slug: record.subject_slug
    })
  }
}

function summarizeNoteAndBlockedDecisions(decisions, errors, stats, applied) {
  for (const row of decisions.progression_group_note_decisions || []) {
    const decision = row.reviewer_decision || 'missing'
    countInto(stats.by_note_decision, decision)
    if (decision === 'pending') {
      stats.pending_note_decisions += 1
      continue
    }
    if (row.requested_public_write !== false) errors.push(`${row.progression_group_id} requested_public_write must be false`)
    if (row.requested_standard_evidence_write !== false) errors.push(`${row.progression_group_id} requested_standard_evidence_write must be false`)
    if (row.requested_official_text_change !== false) errors.push(`${row.progression_group_id} requested_official_text_change must be false`)
    requireFilledDecision(row, row.progression_group_id || row.decision_id || '(missing note decision)', errors)
    if (decision === NOTE_APPROVE) {
      requireConfirmations(row, row.progression_group_id, [
        'cross_grade_evidence_remains_diagnostic',
        'curriculum_progression_rationale_confirmed',
        'no_same_grade_standard_evidence_write',
        'no_standard_text_change_requested'
      ], errors)
    }
    const status = decision === NOTE_APPROVE
      ? 'progression_group_note_approved'
      : decision === NOTE_REJECT
        ? 'progression_group_note_rejected'
        : 'progression_group_note_needs_revision'
    applied.progression_notes.push({
      decision_id: row.decision_id,
      progression_group_id: row.progression_group_id,
      reviewer_decision: decision,
      review_status: status,
      affected_standard_codes: row.affected_standard_codes || []
    })
    stats.reviewed_note_decisions += 1
  }

  for (const row of decisions.blocked_review_decisions || []) {
    const decision = row.reviewer_decision || 'missing'
    countInto(stats.by_blocked_decision, decision)
    if (decision === 'pending') {
      stats.pending_blocked_decisions += 1
      continue
    }
    if (row.requested_public_write !== false) errors.push(`${row.source_review_id} requested_public_write must be false`)
    if (row.requested_standard_evidence_write !== false) errors.push(`${row.source_review_id} requested_standard_evidence_write must be false`)
    if (row.requested_official_text_change !== false) errors.push(`${row.source_review_id} requested_official_text_change must be false`)
    requireFilledDecision(row, row.source_review_id || row.decision_id || '(missing blocked decision)', errors)
    const status = decision === BLOCKED_KEEP ? 'blocked_review_kept_blocked' : 'blocked_review_needs_targeted_remediation'
    applied.blocked_reviews.push({
      decision_id: row.decision_id,
      source_review_id: row.source_review_id,
      reviewer_decision: decision,
      review_status: status,
      affected_standard_codes: row.affected_standard_codes || []
    })
    stats.reviewed_blocked_decisions += 1
  }
}

function buildSidecar(decisions, applied, source) {
  return {
    data_scope: 'h4g_publication_review_decisions_apply_sidecar',
    generated_at: new Date().toISOString(),
    source_decisions: source.decisions,
    writes_public_data: false,
    official_standard_text_changed: false,
    applied
  }
}

function buildMarkdown(result) {
  const standardRows = result.applied.standards
    .map(row => `| ${markdownCell(row.standard_code)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.reviewer_decision)} | ${markdownCell(row.review_status)} |`)
    .join('\n') || '| - | - | - | - |'
  return `# H4G Publication Review Decisions Apply Summary

Generated at: ${result.generated_at}

| Field | Value |
| --- | --- |
| valid | ${result.valid} |
| writes public data | ${result.writes_public_data} |
| official standard text changed | ${result.official_standard_text_changed} |
| source data root | ${result.source_data_root} |
| out data root | ${result.out_data_root} |
| applied standard decisions | ${result.totals.applied_standard_decisions} |
| pending standard decisions | ${result.totals.pending_standard_decisions} |
| reviewed note decisions | ${result.totals.reviewed_note_decisions} |
| reviewed blocked decisions | ${result.totals.reviewed_blocked_decisions} |

## Applied Standards

| Standard | Grade | Decision | Review status |
| --- | --- | --- | --- |
${standardRows}

## Errors

${result.errors.length ? result.errors.map(error => `- ${error}`).join('\n') : '- none'}

## Warnings

${result.warnings.length ? result.warnings.map(warning => `- ${warning}`).join('\n') : '- none'}

## Interpretation

This is a generated candidate root only. It records filled review decisions
without writing public/data and without changing official standard text.
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
  const paths = guardRoots(args, errors)
  if (errors.length) {
    const result = { valid: false, errors, warnings }
    console.log(JSON.stringify(result, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const decisions = readJson(paths.decisionsFile)
  const contract = readJson(paths.contractFile)
  validatePolicies(decisions, contract, errors)
  if (args.requireComplete && (decisions.summary?.pending_required_decisions || 0) > 0) {
    errors.push(`requireComplete is set but decisions summary reports ${decisions.summary.pending_required_decisions} pending required decisions`)
  }

  if (args.clean) rmSync(paths.outDataRoot, { recursive: true, force: true })
  mkdirSync(dirname(paths.outDataRoot), { recursive: true })
  cpSync(paths.sourceDataRoot, paths.outDataRoot, { recursive: true })

  const { byCode, bySubject } = loadSubjectPayloads(paths.outDataRoot)
  const allowedFields = contractAllowedFields(contract)
  const stats = {
    applied_standard_decisions: 0,
    ignored_standard_decisions: 0,
    pending_standard_decisions: 0,
    pending_note_decisions: 0,
    pending_blocked_decisions: 0,
    reviewed_note_decisions: 0,
    reviewed_blocked_decisions: 0,
    by_standard_decision: {},
    by_note_decision: {},
    by_blocked_decision: {},
    by_applied_standard_status: {}
  }
  const applied = {
    standards: [],
    progression_notes: [],
    blocked_reviews: []
  }

  applySameGradeDecisions(decisions, byCode, allowedFields, errors, stats, applied)
  summarizeNoteAndBlockedDecisions(decisions, errors, stats, applied)
  writeSubjectPayloads(bySubject)

  const sidecar = buildSidecar(decisions, applied, { decisions: args.decisions })
  writeJson(join(paths.outDataRoot, 'h4g_publication_review_decisions_apply_sidecar.json'), sidecar)

  const result = {
    valid: errors.length === 0,
    generated_at: new Date().toISOString(),
    decisions: args.decisions,
    contract_candidate: args.contract,
    source_data_root: args.sourceDataRoot,
    out_data_root: args.outDataRoot,
    writes_public_data: false,
    official_standard_text_changed: false,
    manual_review_complete: stats.pending_standard_decisions === 0 && stats.pending_note_decisions === 0 && errors.length === 0,
    publication_ready: false,
    totals: stats,
    applied,
    next_actions: [
      'Run validate-data-indexes on the output data root.',
      'Run grade7_9:audit-h4g-grade-differentiation on the output data root.',
      'Do not copy this generated root to public/data without a separate migration gate.'
    ],
    errors,
    warnings
  }
  writeJson(join(paths.outDataRoot, 'h4g_publication_review_decisions_apply_summary.json'), result)
  writeFileSync(join(paths.outDataRoot, 'h4g_publication_review_decisions_apply_summary.md'), buildMarkdown(result))
  console.log(JSON.stringify(stable(result), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
