#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

const DEFAULT_UNIT_INDEX = 'generated/textbook_evidence/textbook_unit_index.json'
const DEFAULT_OUT = 'generated/textbook_evidence/textbook_unit_index_audit.json'
const ALLOWED_CANDIDATE_TYPES = new Set(['toc_unit_or_chapter', 'volume_seed'])
const ALLOWED_GRANULARITIES = new Set(['textbook_unit_or_chapter_candidate', 'textbook_file_grade_level'])

function parseArgs(argv) {
  const args = {
    unitIndex: DEFAULT_UNIT_INDEX,
    out: DEFAULT_OUT,
    strict: false,
    requireRealUnits: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--unit-index') args.unitIndex = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-real-units') args.requireRealUnits = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_textbook_unit_index.js \\
  --unit-index generated/textbook_evidence/textbook_unit_index.json

Strict mode fails on schema/consistency errors. Add --require-real-units when
the pipeline is expected to contain actual toc_unit_or_chapter candidates rather
than only file-level volume_seed placeholders.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null && value !== ''
}

function hanCount(value) {
  return (String(value || '').match(/\p{Script=Han}/gu) || []).length
}

function readableUnitTitle(value) {
  const title = String(value || '').trim()
  if (title.length < 2 || title.length > 80) return false
  if (/[\u0000-\u001F\u007F]/u.test(title)) return false
  if (hanCount(title) < 1 && !/[A-Za-z]{2,}/u.test(title)) return false
  if (/^[\d.\s-]+$/u.test(title)) return false
  return true
}

function auditCandidate(candidate, errors, warnings, stats) {
  countInto(stats.by_candidate_type, candidate.candidate_type)
  countInto(stats.by_subject, candidate.subject_slug)
  countInto(stats.by_granularity, candidate.evidence_granularity)

  const required = [
    'unit_evidence_id',
    'textbook_evidence_id',
    'subject_slug',
    'candidate_type',
    'unit_title',
    'evidence_granularity',
    'confidence',
    'repository_path',
    'evidence_url'
  ]
  for (const field of required) {
    if (!hasValue(candidate[field])) errors.push(`${candidate.unit_evidence_id || '(missing id)'} missing ${field}`)
  }
  if (!ALLOWED_CANDIDATE_TYPES.has(candidate.candidate_type)) {
    errors.push(`${candidate.unit_evidence_id} invalid candidate_type: ${candidate.candidate_type}`)
  }
  if (!ALLOWED_GRANULARITIES.has(candidate.evidence_granularity)) {
    errors.push(`${candidate.unit_evidence_id} invalid evidence_granularity: ${candidate.evidence_granularity}`)
  }
  if (typeof candidate.confidence !== 'number' || candidate.confidence < 0 || candidate.confidence > 1) {
    errors.push(`${candidate.unit_evidence_id} confidence must be 0..1`)
  }
  if (candidate.candidate_type === 'volume_seed' && candidate.evidence_granularity !== 'textbook_file_grade_level') {
    errors.push(`${candidate.unit_evidence_id} volume_seed must remain textbook_file_grade_level`)
  }
  if (candidate.candidate_type === 'toc_unit_or_chapter') {
    stats.real_unit_or_chapter_candidates += 1
    if (candidate.evidence_granularity !== 'textbook_unit_or_chapter_candidate') {
      errors.push(`${candidate.unit_evidence_id} toc_unit_or_chapter must use textbook_unit_or_chapter_candidate granularity`)
    }
    if (!candidate.matched_line) warnings.push(`${candidate.unit_evidence_id} toc candidate has no matched_line`)
    if (!readableUnitTitle(candidate.unit_title)) {
      errors.push(`${candidate.unit_evidence_id} toc candidate has unreadable or numeric-only title: ${JSON.stringify(candidate.unit_title)}`)
    }
    if (candidate.matched_line && /[\u0000-\u001F\u007F]/u.test(candidate.matched_line)) {
      errors.push(`${candidate.unit_evidence_id} toc candidate matched_line contains control characters`)
    }
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
  const stats = {
    textbook_files: 0,
    unit_candidates: 0,
    real_unit_or_chapter_candidates: 0,
    volume_seed_candidates: 0,
    by_subject: {},
    by_candidate_type: {},
    by_granularity: {}
  }
  if (!existsSync(args.unitIndex)) {
    errors.push(`Missing unit index: ${args.unitIndex}`)
  }

  const payload = errors.length ? { textbook_files: [], unit_candidates: [] } : readJson(args.unitIndex)
  const seen = new Set()
  stats.textbook_files = (payload.textbook_files || []).length
  stats.unit_candidates = (payload.unit_candidates || []).length

  for (const candidate of payload.unit_candidates || []) {
    if (seen.has(candidate.unit_evidence_id)) errors.push(`duplicate unit_evidence_id: ${candidate.unit_evidence_id}`)
    else seen.add(candidate.unit_evidence_id)
    if (candidate.candidate_type === 'volume_seed') stats.volume_seed_candidates += 1
    auditCandidate(candidate, errors, warnings, stats)
  }

  if (!stats.unit_candidates) errors.push('unit index has no unit_candidates')
  if (!stats.real_unit_or_chapter_candidates) {
    warnings.push('unit index currently contains no toc_unit_or_chapter candidates; it is only file/volume-level evidence')
    if (args.requireRealUnits) errors.push('requireRealUnits is set but no toc_unit_or_chapter candidates exist')
  }

  const result = {
    valid: errors.length === 0,
    unit_index: args.unitIndex,
    require_real_units: args.requireRealUnits,
    source_commit: payload.source_commit || null,
    summary: stats,
    errors,
    warnings
  }
  if (args.out) {
    mkdirSync(dirname(args.out), { recursive: true })
    writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`)
  }
  console.log(JSON.stringify(result, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
