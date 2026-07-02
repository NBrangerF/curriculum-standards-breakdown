#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildH4GGradeFocus } from './h4g_grade_focus.js'

const BASE_DIR = 'generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean'
const DEFAULT_CONTRACT = `${BASE_DIR}/h4g_publication_contract_candidate.json`
const DEFAULT_READY_CANDIDATE = `${BASE_DIR}/h4g_unit_evidence_candidate_ready_only.json`
const DEFAULT_SOURCE_DATA_ROOT = 'public/data'
const DEFAULT_OUT_DATA_ROOT = `${BASE_DIR}/data_candidate_publication_contract`
const TARGET_GRADE_BANDS = new Set(['H4G7', 'H4G8', 'H4G9'])
const OFFICIAL_TEXT_FIELDS = ['domain', 'subdomain', 'standard', 'context', 'practice', 'teaching_tip', 'assessment_evidence_type']
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..')

function parseArgs(argv) {
  const args = {
    contract: DEFAULT_CONTRACT,
    readyCandidate: DEFAULT_READY_CANDIDATE,
    sourceDataRoot: DEFAULT_SOURCE_DATA_ROOT,
    outDataRoot: DEFAULT_OUT_DATA_ROOT,
    clean: true,
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--contract') args.contract = argv[++i]
    else if (item === '--ready-candidate') args.readyCandidate = argv[++i]
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
node scripts/textbooks/apply_h4g_publication_contract_candidate.js \\
  --contract generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_publication_contract_candidate.json \\
  --ready-candidate generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/h4g_unit_evidence_candidate_ready_only.json \\
  --out-data-root generated/textbook_evidence/h4g_runs/math_three_edition_alignment_alias_page_clean/data_candidate_publication_contract \\
  --strict

Copies public/data to an isolated generated data root, applies only the
standard-level same-grade unit evidence allowed by the contract candidate, and
writes a candidate h4g_progression_notes.json file. It refuses to write
public/data.`)
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

function sorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== '').map(String))]
    .sort((a, b) => a.localeCompare(b))
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
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

function guardRoots(args, errors) {
  const contractFile = resolve(ROOT, args.contract)
  const readyCandidateFile = resolve(ROOT, args.readyCandidate)
  const sourceDataRoot = resolve(ROOT, args.sourceDataRoot)
  const outDataRoot = resolve(ROOT, args.outDataRoot)
  const publicDataRoot = resolve(ROOT, DEFAULT_SOURCE_DATA_ROOT)
  if (!existsSync(contractFile)) errors.push(`Missing contract file: ${contractFile}`)
  if (!existsSync(readyCandidateFile)) errors.push(`Missing ready candidate file: ${readyCandidateFile}`)
  if (!existsSync(sourceDataRoot)) errors.push(`Missing source data root: ${sourceDataRoot}`)
  if (sourceDataRoot === outDataRoot) errors.push('Output data root must be different from source data root.')
  if (outDataRoot === publicDataRoot) errors.push('Output data root cannot be public/data; use a generated candidate root.')
  return { contractFile, readyCandidateFile, sourceDataRoot, outDataRoot }
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

function readyCandidateByCode(readyPayload) {
  return new Map((readyPayload.candidates || [])
    .filter(candidate => candidate.standard_code)
    .map(candidate => [candidate.standard_code, candidate]))
}

function validateInputs(contractPayload, readyPayload, errors) {
  if (contractPayload.valid === false) errors.push('Contract candidate is marked valid=false')
  if (readyPayload.valid === false) errors.push('Ready candidate is marked valid=false')
  if (contractPayload.policy?.writes_public_data !== false) errors.push('Contract policy.writes_public_data must be false')
  if (contractPayload.policy?.writes_standard_records !== false) errors.push('Contract policy.writes_standard_records must be false')
  if (readyPayload.policy?.writes_public_data !== false) errors.push('Ready candidate policy.writes_public_data must be false')
  const standardSurface = (contractPayload.contract?.surfaces || [])
    .find(surface => surface.surface_id === 'standard_same_grade_unit_evidence')
  if (!standardSurface) errors.push('Contract missing standard_same_grade_unit_evidence surface')
  const noteSurface = (contractPayload.contract?.surfaces || [])
    .find(surface => surface.surface_id === 'progression_group_edition_placement_note')
  if (!noteSurface) errors.push('Contract missing progression_group_edition_placement_note surface')
  return {
    standardAllowedFields: new Set(standardSurface?.allowed_fields || [])
  }
}

function validateReadyCandidate(candidate, draft, errors) {
  const prefix = candidate?.standard_code || draft?.standard_code || '(missing standard)'
  if (!candidate) {
    errors.push(`${prefix} missing ready candidate payload`)
    return
  }
  if (!TARGET_GRADE_BANDS.has(candidate.grade_band)) errors.push(`${prefix} has non-target grade_band ${candidate.grade_band || 'missing'}`)
  if (!candidate.unit_evidence?.length) errors.push(`${prefix} has no unit evidence`)
  if (candidate.safety?.writes_public_data) errors.push(`${prefix} candidate declares writes_public_data=true`)
  if (candidate.safety?.official_standard_text_changed) errors.push(`${prefix} candidate declares official_standard_text_changed=true`)
  if ((draft?.same_grade_edition_count || 0) < 2) errors.push(`${prefix} contract draft has fewer than two editions`)
}

function applyStandardDraft(record, candidate, draft, allowedFields, contractGeneratedAt) {
  const before = officialSnapshot(record)
  const proposed = candidate.proposed_update || {}
  const unitEvidence = candidate.unit_evidence || []
  const gradeSpecificFocus = buildH4GGradeFocus(record, unitEvidence, { approved: false }) ||
    proposed.grade_specific_focus ||
    record.grade_specific_focus ||
    ''
  const unitIds = sorted([
    ...(record.textbook_unit_evidence_ids || []),
    ...(proposed.textbook_unit_evidence_ids || []),
    ...unitEvidence.map(item => item.unit_evidence_id)
  ])
  const textbookEvidenceIds = sorted([
    ...(record.textbook_evidence_ids || []),
    ...unitEvidence.map(item => item.textbook_evidence_id)
  ])
  const requestedUpdate = {
    textbook_evidence_ids: textbookEvidenceIds,
    textbook_unit_evidence_ids: unitIds,
    textbook_unit_evidence: mergeById(record.textbook_unit_evidence || [], unitEvidence, 'unit_evidence_id'),
    evidence_granularity: proposed.evidence_granularity || 'textbook_unit_level',
    grade_assignment_type: proposed.grade_assignment_type || 'shared_requirement_textbook_unit_supported',
    grade_assignment_rationale: '该记录保留 7-9 共同课标文本；本候选数据根按发布契约加入同年级教材单元/章节证据，仍需人工复核后才可写入正式 public 数据。',
    progression_basis: proposed.progression_basis || 'shared_standard_textbook_unit_sequence',
    progression_confidence: proposed.progression_confidence ?? record.progression_confidence ?? null,
    progression_delta: proposed.progression_delta || record.progression_delta || '',
    progression_review_note: '该记录保留第四学段 7-9 共同课标原文；本候选数据根已加入同年级单元证据，仍未自动升级为真正的年级化课标改写。',
    requires_unit_level_evidence: proposed.requires_unit_level_evidence ?? false,
    grade_specific_focus: gradeSpecificFocus,
    review_status: proposed.review_status || 'unit_evidence_candidate_needs_review',
    h4g_unit_candidate_id: candidate.candidate_id || draft.draft_id,
    h4g_unit_candidate_generated_at: contractGeneratedAt || null,
    h4g_unit_candidate_requires_manual_review: true
  }

  const update = {}
  for (const [field, value] of Object.entries(requestedUpdate)) {
    if (allowedFields.has(field)) update[field] = value
  }
  const updated = {
    ...record,
    ...update,
    standard_text_role: record.standard_text_role || 'source_standard_original',
    source_standard_scope: record.source_standard_scope || 'stage_shared_7_9',
    standard_variant_type: record.standard_variant_type || 'same_source_shared'
  }
  return {
    updated,
    errors: officialMutationErrors(before, updated, record.code || candidate.standard_code),
    addedUnitEvidence: unitEvidence.length
  }
}

function noteCollection(noteDrafts, contractPayload, contractFile) {
  return {
    data_scope: 'h4g_progression_notes_candidate',
    generated_at: new Date().toISOString(),
    source_contract_candidate: contractFile,
    source_review_packet: contractPayload.source_review_packet || '',
    publication_candidate: false,
    writes_public_data: false,
    official_standard_text_changed: false,
    notes: noteDrafts.map(note => ({
      note_id: note.note_id,
      progression_group_id: note.progression_group_id,
      subject_slug: note.subject_slug,
      topic_subdomains: note.topic_subdomains || [],
      standard_codes: note.standard_codes || [],
      affected_standard_codes: note.affected_standard_codes || [],
      placement_grade_bands: note.placement_grade_bands || [],
      edition_count: note.edition_count,
      cross_grade_diagnostic_relations: note.cross_grade_diagnostic_relations,
      decision_status: note.decision_status,
      review_status: note.review_status,
      note_summary: note.note_summary,
      evidence_source: note.evidence_source,
      publication_surface: note.publication_surface,
      safety: note.safety || {}
    }))
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  const warnings = []
  const { contractFile, readyCandidateFile, sourceDataRoot, outDataRoot } = guardRoots(args, errors)
  if (errors.length) {
    console.log(JSON.stringify({ valid: false, errors, warnings }, null, 2))
    if (args.strict) process.exit(1)
    return
  }

  const contractPayload = readJson(contractFile)
  const readyPayload = readJson(readyCandidateFile)
  const { standardAllowedFields } = validateInputs(contractPayload, readyPayload, errors)
  const standardDrafts = contractPayload.contract_drafts?.standard_unit_evidence || []
  const noteDrafts = contractPayload.contract_drafts?.progression_group_edition_placement_notes || []
  const blockedDrafts = contractPayload.contract_drafts?.blocked_review_registry || []
  const readyByCode = readyCandidateByCode(readyPayload)
  for (const draft of standardDrafts) validateReadyCandidate(readyByCode.get(draft.standard_code), draft, errors)
  if (!noteDrafts.length) warnings.push('Contract candidate has no progression-group note drafts; notes collection will be empty')
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
    contract_candidate: contractFile,
    ready_candidate: readyCandidateFile,
    source_data_root: sourceDataRoot,
    out_data_root: outDataRoot,
    writes_public_data: false,
    official_standard_text_changed: false,
    totals: {
      standard_contracts: standardDrafts.length,
      notes: noteDrafts.length,
      blocked_registry_contracts: blockedDrafts.length,
      applied_standard_records: 0,
      missing_standard_records: 0,
      unit_evidence_objects_added: 0,
      by_subject: {},
      by_grade_band: {},
      by_review_status: {}
    },
    errors,
    warnings
  }

  for (const draft of standardDrafts) {
    const candidate = readyByCode.get(draft.standard_code)
    const record = byCode.get(draft.standard_code)
    const location = bySubjectFile.get(draft.standard_code)
    if (!candidate || !record || !location) {
      summary.totals.missing_standard_records += 1
      errors.push(`${draft.standard_code} missing candidate or public record`)
      continue
    }
    const result = applyStandardDraft(record, candidate, draft, standardAllowedFields, contractPayload.generated_at)
    if (result.errors.length) {
      errors.push(...result.errors)
      summary.official_standard_text_changed = true
      continue
    }
    Object.assign(record, result.updated)
    changedPayloads.set(location.file, location.payload)
    summary.totals.applied_standard_records += 1
    summary.totals.unit_evidence_objects_added += result.addedUnitEvidence
    countInto(summary.totals.by_subject, candidate.subject_slug)
    countInto(summary.totals.by_grade_band, candidate.grade_band)
    countInto(summary.totals.by_review_status, record.review_status)
  }

  for (const [file, payload] of changedPayloads.entries()) {
    payload.columns = [...new Set((payload.standards || []).flatMap(record => Object.keys(record)))].sort((a, b) => a.localeCompare(b))
    payload.record_count = (payload.standards || []).length
    payload.generated_at = new Date().toISOString()
    payload.data_scope = 'h4g_publication_contract_candidate_data_root'
    writeJson(file, payload)
  }

  writeJson(join(outDataRoot, 'h4g_progression_notes.json'), noteCollection(noteDrafts, contractPayload, contractFile))

  summary.valid = errors.length === 0
  summary.next_actions = [
    `node scripts/build-indexes.js --data-root ${outDataRoot}`,
    `node scripts/validate-data-indexes.js --data-root ${outDataRoot}`,
    `npm run grade7_9:audit-h4g-distinctiveness -- --data-root ${outDataRoot} --strict`,
    `npm run grade7_9:audit-grade-band-policy -- --public-data-root ${outDataRoot} --staging-root generated/grade7_9_all_curated --data-only --strict`
  ]
  writeJson(join(outDataRoot, 'h4g_publication_contract_apply_summary.json'), summary)
  console.log(JSON.stringify(stable(summary), null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
