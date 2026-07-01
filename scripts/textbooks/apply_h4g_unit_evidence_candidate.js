#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_CANDIDATE = 'generated/textbook_evidence/h4g_unit_evidence_candidate.json'
const DEFAULT_SOURCE_DATA_ROOT = 'public/data'
const DEFAULT_OUT_DATA_ROOT = 'generated/textbook_evidence/h4g_unit_evidence_data_candidate'
const TARGET_GRADE_BANDS = new Set(['H4G7', 'H4G8', 'H4G9'])
const OFFICIAL_TEXT_FIELDS = ['domain', 'subdomain', 'standard', 'context', 'practice', 'teaching_tip', 'assessment_evidence_type']
const PROPOSED_UPDATE_FIELDS = new Set([
  'textbook_unit_evidence_ids',
  'evidence_granularity',
  'grade_assignment_type',
  'progression_basis',
  'progression_confidence',
  'requires_unit_level_evidence',
  'review_status',
  'grade_specific_focus',
  'progression_delta'
])
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..')

function parseArgs(argv) {
  const args = {
    candidate: DEFAULT_CANDIDATE,
    sourceDataRoot: DEFAULT_SOURCE_DATA_ROOT,
    outDataRoot: DEFAULT_OUT_DATA_ROOT,
    clean: true,
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate') args.candidate = argv[++i]
    else if (item === '--source-data-root') args.sourceDataRoot = argv[++i]
    else if (item === '--out-data-root') args.outDataRoot = argv[++i]
    else if (item === '--no-clean') args.clean = false
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/apply_h4g_unit_evidence_candidate.js \\
  --candidate generated/textbook_evidence/h4g_unit_evidence_candidate.json \\
  --source-data-root public/data \\
  --out-data-root generated/textbook_evidence/h4g_unit_evidence_data_candidate

Copies the source data root to a generated candidate data root, then applies
reviewable H4G unit-evidence candidates there. This script never writes to
public/data by default and refuses to use public/data as the output root.`)
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

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))]
}

function mergeById(existing, incoming, idField) {
  const byId = new Map()
  for (const item of existing || []) {
    const id = item?.[idField]
    if (id) byId.set(id, item)
  }
  for (const item of incoming || []) {
    const id = item?.[idField]
    if (id) byId.set(id, item)
  }
  return [...byId.values()].sort((a, b) => String(a[idField] || '').localeCompare(String(b[idField] || '')))
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

function validateCandidate(candidate, errors, warnings) {
  const prefix = candidate.standard_code || candidate.candidate_id || '(missing candidate id)'
  if (!candidate.standard_code) errors.push(`${prefix} missing standard_code`)
  if (!candidate.subject_slug) errors.push(`${prefix} missing subject_slug`)
  if (!TARGET_GRADE_BANDS.has(candidate.grade_band)) errors.push(`${prefix} has non-target grade_band: ${candidate.grade_band || 'missing'}`)
  if (candidate.safety?.writes_public_data) errors.push(`${prefix} candidate declares writes_public_data=true`)
  if (candidate.safety?.official_standard_text_changed) errors.push(`${prefix} candidate declares official_standard_text_changed=true`)
  if (!Array.isArray(candidate.unit_evidence) || !candidate.unit_evidence.length) errors.push(`${prefix} has no unit_evidence`)
  if (!candidate.proposed_update || typeof candidate.proposed_update !== 'object') errors.push(`${prefix} missing proposed_update`)
  for (const field of Object.keys(candidate.proposed_update || {})) {
    if (!PROPOSED_UPDATE_FIELDS.has(field)) warnings.push(`${prefix} proposed_update contains unrecognized field: ${field}`)
  }
}

function applyCandidate(record, candidate, candidateGeneratedAt) {
  const before = officialSnapshot(record)
  const proposed = candidate.proposed_update || {}
  const unitEvidence = candidate.unit_evidence || []
  const proposedUnitIds = unique([
    ...(record.textbook_unit_evidence_ids || []),
    ...(proposed.textbook_unit_evidence_ids || []),
    ...unitEvidence.map(item => item.unit_evidence_id)
  ])
  const textbookEvidenceIds = unique([
    ...(record.textbook_evidence_ids || []),
    ...unitEvidence.map(item => item.textbook_evidence_id)
  ])

  const updated = {
    ...record,
    textbook_evidence_ids: textbookEvidenceIds,
    textbook_unit_evidence_ids: proposedUnitIds,
    textbook_unit_evidence: mergeById(record.textbook_unit_evidence || [], unitEvidence, 'unit_evidence_id'),
    evidence_granularity: proposed.evidence_granularity || 'textbook_unit_level',
    grade_assignment_type: proposed.grade_assignment_type || 'shared_requirement_textbook_unit_supported',
    progression_basis: proposed.progression_basis || 'shared_standard_textbook_unit_sequence',
    progression_confidence: proposed.progression_confidence ?? record.progression_confidence ?? null,
    requires_unit_level_evidence: proposed.requires_unit_level_evidence ?? false,
    review_status: proposed.review_status || 'unit_evidence_candidate_needs_review',
    grade_specific_focus: proposed.grade_specific_focus || record.grade_specific_focus || '',
    progression_delta: proposed.progression_delta || record.progression_delta || '',
    standard_text_role: record.standard_text_role || 'source_standard_original',
    source_standard_scope: record.source_standard_scope || 'stage_shared_7_9',
    standard_variant_type: record.standard_variant_type || 'same_source_shared',
    h4g_unit_candidate_id: candidate.candidate_id,
    h4g_unit_candidate_generated_at: candidateGeneratedAt || null,
    h4g_unit_candidate_requires_manual_review: candidate.safety?.requires_manual_review ?? true,
    progression_review_note: '该记录保留第四学段 7-9 共同课标原文；已加入候选教材单元/章节级证据，仍需人工复核后再决定是否升级为真正的年级化解释。',
    grade_assignment_rationale: '该记录保留 7-9 共同课标文本；候选教材单元/章节证据仅用于复核年级化解释，不代表课标原文已经按年级改写。'
  }

  const errors = officialMutationErrors(before, updated, record.code || candidate.standard_code)
  return { updated, errors, addedUnitEvidence: unitEvidence.length, addedUnitIds: proposedUnitIds.length }
}

function loadRecordsByCode(dataRoot) {
  const byCode = new Map()
  const bySubjectFile = new Map()
  for (const file of subjectFiles(dataRoot)) {
    const subjectSlug = basename(file, '.json')
    const payload = readJson(file)
    for (const record of payload.standards || []) {
      if (record.code) {
        byCode.set(record.code, record)
        bySubjectFile.set(record.code, { file, subjectSlug, payload })
      }
    }
  }
  return { byCode, bySubjectFile }
}

function guardRoots(args, errors) {
  const candidateFile = resolve(ROOT, args.candidate)
  const sourceDataRoot = resolve(ROOT, args.sourceDataRoot)
  const outDataRoot = resolve(ROOT, args.outDataRoot)
  const publicDataRoot = resolve(ROOT, DEFAULT_SOURCE_DATA_ROOT)
  if (!existsSync(sourceDataRoot)) errors.push(`Missing source data root: ${sourceDataRoot}`)
  if (!existsSync(candidateFile)) errors.push(`Missing candidate file: ${candidateFile}`)
  if (sourceDataRoot === outDataRoot) errors.push('Output data root must be different from source data root.')
  if (outDataRoot === publicDataRoot) errors.push('Output data root cannot be public/data; use a generated or /tmp candidate root.')
  return { candidateFile, sourceDataRoot, outDataRoot }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const warnings = []
  const { candidateFile, sourceDataRoot, outDataRoot } = guardRoots(args, errors)
  if (errors.length) {
    console.log(JSON.stringify({ valid: false, errors, warnings }, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const candidatePayload = readJson(candidateFile)
  if (candidatePayload.valid === false) errors.push('Candidate payload is marked valid=false')
  if (!Array.isArray(candidatePayload.candidates)) errors.push('Candidate payload missing candidates array')
  for (const candidate of candidatePayload.candidates || []) validateCandidate(candidate, errors, warnings)
  if (errors.length) {
    console.log(JSON.stringify({ valid: false, errors, warnings }, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  if (args.clean) rmSync(outDataRoot, { recursive: true, force: true })
  cpSync(sourceDataRoot, outDataRoot, { recursive: true, force: true })

  const { byCode, bySubjectFile } = loadRecordsByCode(outDataRoot)
  const changedPayloads = new Map()
  const summary = {
    generated_at: new Date().toISOString(),
    candidate_file: candidateFile,
    candidate_generated_at: candidatePayload.generated_at || null,
    source_data_root: sourceDataRoot,
    out_data_root: outDataRoot,
    writes_public_data: false,
    official_standard_text_changed: false,
    totals: {
      candidates: candidatePayload.candidates.length,
      applied_records: 0,
      missing_records: 0,
      skipped_records: 0,
      unit_evidence_objects_added: 0,
      by_subject: {},
      by_grade_band: {},
      by_review_status: {}
    },
    errors,
    warnings
  }

  for (const candidate of candidatePayload.candidates) {
    const record = byCode.get(candidate.standard_code)
    const location = bySubjectFile.get(candidate.standard_code)
    if (!record || !location) {
      summary.totals.missing_records += 1
      errors.push(`${candidate.standard_code} not found in output data root`)
      continue
    }
    if (record.subject_slug && record.subject_slug !== candidate.subject_slug) {
      warnings.push(`${candidate.standard_code} subject mismatch: record=${record.subject_slug}, candidate=${candidate.subject_slug}`)
    }
    if (record.grade_band !== candidate.grade_band) {
      warnings.push(`${candidate.standard_code} grade_band mismatch: record=${record.grade_band}, candidate=${candidate.grade_band}`)
    }

    const { updated, errors: mutationErrors, addedUnitEvidence } = applyCandidate(record, candidate, candidatePayload.generated_at)
    if (mutationErrors.length) {
      errors.push(...mutationErrors)
      summary.official_standard_text_changed = true
      summary.totals.skipped_records += 1
      continue
    }

    Object.assign(record, updated)
    changedPayloads.set(location.file, location.payload)
    summary.totals.applied_records += 1
    summary.totals.unit_evidence_objects_added += addedUnitEvidence
    countInto(summary.totals.by_subject, candidate.subject_slug)
    countInto(summary.totals.by_grade_band, candidate.grade_band)
    countInto(summary.totals.by_review_status, record.review_status)
  }

  for (const [file, payload] of changedPayloads.entries()) {
    payload.columns = [...new Set((payload.standards || []).flatMap(record => Object.keys(record)))].sort((a, b) => a.localeCompare(b))
    payload.record_count = (payload.standards || []).length
    payload.generated_at = new Date().toISOString()
    payload.data_scope = payload.data_scope || 'h4g_unit_evidence_candidate_data_root'
    writeJson(file, payload)
  }

  summary.valid = errors.length === 0
  summary.next_actions = [
    `node scripts/build-indexes.js --data-root ${outDataRoot}`,
    `node scripts/validate-data-indexes.js --data-root ${outDataRoot}`,
    `npm run grade7_9:audit-h4g-distinctiveness -- --data-root ${outDataRoot} --strict`
  ]
  writeJson(join(outDataRoot, 'h4g_unit_evidence_apply_summary.json'), summary)
  console.log(JSON.stringify(stable(summary), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
