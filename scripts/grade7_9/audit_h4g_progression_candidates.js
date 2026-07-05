#!/usr/bin/env node
import {
  countInto,
  countRows,
  loadH4GRecords,
  markdownCell,
  readJson,
  recordsByGroup,
  stable,
  writeJson,
  writeText
} from './h4g_supplemental_pipeline_utils.js'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_CANDIDATES = 'generated/h4g_progression_candidates/progression_candidates.json'
const DEFAULT_PUBLIC_WRITE = 'generated/h4g_progression_candidates/public_write_candidates.json'
const DEFAULT_OUT = 'generated/h4g_progression_candidates/progression_candidates_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/h4g_progression_candidates/progression_candidates_audit.md'

function parseArgs(argv) {
  const args = {
    candidates: DEFAULT_CANDIDATES,
    dataRoot: DEFAULT_DATA_ROOT,
    out: DEFAULT_OUT,
    publicWrite: DEFAULT_PUBLIC_WRITE,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidates') args.candidates = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--public-write') args.publicWrite = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/audit_h4g_progression_candidates.js --strict

Audits Gate 3 progression candidates and public-write review gate. Candidates
must remain review-only draft outputs until human Gate 3 review is complete.`)
}

function buildMarkdown(audit) {
  return `# Gate 3 Progression Candidates Audit

Generated at: ${audit.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${audit.valid} |
| expected groups | ${audit.summary.expected_groups} |
| progression candidates | ${audit.summary.progression_candidates} |
| public write candidates | ${audit.summary.public_write_candidates} |
| errors | ${audit.errors.length} |
| warnings | ${audit.warnings.length} |
| writes_public_data | ${audit.writes_public_data} |

## Inference Status

| Status | Count |
| --- | ---: |
${countRows(audit.summary.by_inference_status)}

## Recommended Next Action

| Action | Count |
| --- | ---: |
${countRows(audit.summary.by_recommended_next_action)}

## Public Write Blockers

| Blocker | Count |
| --- | ---: |
${countRows(audit.summary.by_blocker)}

## Subjects

| Subject | Candidates |
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
  const records = loadH4GRecords(args.dataRoot, errors)
  const expectedGroups = new Set([...recordsByGroup(records).keys()])
  const candidatesPayload = readJson(args.candidates)
  const publicWritePayload = readJson(args.publicWrite)
  const candidates = Array.isArray(candidatesPayload.progression_candidates) ? candidatesPayload.progression_candidates : []
  const publicWriteItems = Array.isArray(publicWritePayload.items) ? publicWritePayload.items : []

  if (!Array.isArray(candidatesPayload.progression_candidates)) errors.push('progression candidates payload must contain progression_candidates[]')
  if (!Array.isArray(publicWritePayload.items)) errors.push('public_write_candidates payload must contain items[]')
  for (const payload of [candidatesPayload, publicWritePayload]) {
    if (payload.writes_public_data !== false) errors.push(`${payload.purpose || 'payload'} writes_public_data must be false`)
    if (payload.direct_grade_assignment !== false) errors.push(`${payload.purpose || 'payload'} direct_grade_assignment must be false`)
    if (payload.direct_matcher_use !== false) errors.push(`${payload.purpose || 'payload'} direct_matcher_use must be false`)
  }

  const bySubject = {}
  const byStatus = {}
  const byAction = {}
  const byBlocker = {}
  const seen = new Set()
  for (const candidate of candidates) {
    if (seen.has(candidate.progression_group_id)) errors.push(`duplicate candidate for ${candidate.progression_group_id}`)
    seen.add(candidate.progression_group_id)
    if (!expectedGroups.has(candidate.progression_group_id)) errors.push(`${candidate.candidate_id} has unexpected progression_group_id ${candidate.progression_group_id}`)
    countInto(bySubject, candidate.subject_slug)
    countInto(byStatus, candidate.inference_status)
    countInto(byAction, candidate.recommended_next_action)
    for (const blocker of candidate.public_write_gate?.blockers || []) countInto(byBlocker, blocker)
    if (candidate.writes_public_data !== false) errors.push(`${candidate.candidate_id} writes_public_data must be false`)
    if (candidate.direct_grade_assignment !== false) errors.push(`${candidate.candidate_id} direct_grade_assignment must be false`)
    if (candidate.direct_matcher_use !== false) errors.push(`${candidate.candidate_id} direct_matcher_use must be false`)
    if (candidate.public_write_candidate !== false) errors.push(`${candidate.candidate_id} public_write_candidate must be false`)
    if (candidate.public_write_gate?.eligible !== false) errors.push(`${candidate.candidate_id} public_write_gate.eligible must be false`)
    if (candidate.descriptor_status !== 'draft_axis_only_not_public_ready') {
      errors.push(`${candidate.candidate_id} descriptor_status must be draft_axis_only_not_public_ready`)
    }
    if (!candidate.public_write_gate?.blockers?.includes('public_write_requires_manual_gate3_review')) {
      errors.push(`${candidate.candidate_id} missing public_write_requires_manual_gate3_review blocker`)
    }
    if (!candidate.review_status?.includes('needs_human_gate3_review')) {
      errors.push(`${candidate.candidate_id} review_status must require human Gate 3 review`)
    }
  }

  for (const groupId of expectedGroups) {
    if (!seen.has(groupId)) errors.push(`${groupId} missing progression candidate`)
  }
  if (publicWriteItems.length) {
    errors.push('public_write_candidates.items must remain empty before human Gate 3 review')
  }
  if (publicWritePayload.rejected_candidate_count !== candidates.length) {
    warnings.push('public_write rejected_candidate_count does not match candidate count')
  }

  return {
    changes_official_standard_text: false,
    direct_grade_assignment: false,
    direct_matcher_use: false,
    errors,
    generated_at: new Date().toISOString(),
    gate: 'GATE_3_PROGRESSION_INFERENCE',
    purpose: 'h4g_progression_candidates_audit',
    summary: {
      by_blocker: byBlocker,
      by_inference_status: byStatus,
      by_recommended_next_action: byAction,
      by_subject: bySubject,
      expected_groups: expectedGroups.size,
      progression_candidates: candidates.length,
      public_write_candidates: publicWriteItems.length
    },
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }
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
  gate: result.gate,
  progression_candidates: result.summary.progression_candidates,
  public_write_candidates: result.summary.public_write_candidates,
  valid: result.valid,
  warnings: result.warnings.length
}), null, 2))

if (args.strict && !result.valid) {
  console.error(result.errors.join('\n'))
  process.exit(1)
}
