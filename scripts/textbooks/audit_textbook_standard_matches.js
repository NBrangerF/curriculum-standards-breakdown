#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_MATCHES = 'generated/textbook_evidence/textbook_unit_standard_matches.json'
const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_UNIT_INDEX = 'generated/textbook_evidence/textbook_unit_index.json'
const DEFAULT_OUT = 'generated/textbook_evidence/textbook_unit_standard_matches_audit.json'
const ALLOWED_CANDIDATE_TYPES = new Set(['toc_unit_or_chapter'])
const ALLOWED_CONFIDENCE_BANDS = new Set(['high', 'medium', 'low', 'below_threshold'])
const GENERIC_ONLY_MATCH_TOKENS = new Set([
  '目录', '语文', '英语', '数学', '科学', '化学', '物理', '生物',
  '地理', '历史', '艺术', '音乐', '美术', '体育', '劳动'
])

function parseArgs(argv) {
  const args = {
    matches: DEFAULT_MATCHES,
    dataRoot: DEFAULT_DATA_ROOT,
    unitIndex: DEFAULT_UNIT_INDEX,
    out: DEFAULT_OUT,
    strict: false,
    requireMatches: false,
    requireEligible: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--matches') args.matches = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--unit-index') args.unitIndex = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-matches') args.requireMatches = true
    else if (item === '--require-eligible') args.requireEligible = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_textbook_standard_matches.js \\
  --matches generated/textbook_evidence/textbook_unit_standard_matches.json \\
  --strict

Strict mode fails on schema, reference, score, or evidence-granularity errors.
Use --require-matches or --require-eligible only after real toc candidates are
expected to exist.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function loadStandardCodes(dataRoot) {
  const codes = new Set()
  for (const file of subjectFiles(dataRoot)) {
    const payload = readJson(file)
    for (const standard of payload.standards || []) {
      if (standard.code) codes.add(standard.code)
    }
  }
  return codes
}

function loadUnitMap(unitIndex) {
  if (!existsSync(unitIndex)) return new Map()
  const payload = readJson(unitIndex)
  return new Map((payload.unit_candidates || []).map(unit => [unit.unit_evidence_id, unit]))
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null && value !== ''
}

function expectedBand(score) {
  if (score >= 0.8) return 'high'
  if (score >= 0.55) return 'medium'
  if (score >= 0.3) return 'low'
  return 'below_threshold'
}

function compactText(value) {
  return String(value || '').replace(/\s+/g, '').trim()
}

function isNoiseTitle(value) {
  const title = compactText(value)
  return !title || title === '目录' || title.includes('目录')
}

function isGenericOnlyMatch(match) {
  const keywords = Array.isArray(match.matched_keywords) ? match.matched_keywords.map(String).filter(Boolean) : []
  return keywords.length > 0 && keywords.every(keyword => GENERIC_ONLY_MATCH_TOKENS.has(keyword))
}

function auditMatch(match, standardCodes, unitMap, errors, warnings, stats) {
  countInto(stats.by_subject, match.subject_slug)
  countInto(stats.by_confidence_band, match.confidence_band)
  countInto(stats.by_candidate_type, match.candidate_type)
  if (isNoiseTitle(match.unit_title)) stats.noise_title_matches += 1
  if (match.confidence_band === 'high' && isGenericOnlyMatch(match)) stats.generic_only_high_confidence_matches += 1
  if (match.eligible_for_h4g_differentiation) {
    stats.eligible_matches += 1
    countInto(stats.by_eligible_alignment, match.eligible_alignment || 'missing')
  }

  const required = [
    'match_id',
    'standard_code',
    'subject_slug',
    'grade_band',
    'unit_evidence_id',
    'candidate_type',
    'evidence_granularity',
    'unit_title',
    'score',
    'confidence_band',
    'match_type',
    'matched_keywords',
    'matched_fields',
    'subdomain_alignment',
    'rationale',
    'eligible_for_h4g_differentiation',
    'requires_review'
  ]
  for (const field of required) {
    if (!hasValue(match[field]) && field !== 'eligible_for_h4g_differentiation') {
      errors.push(`${match.match_id || '(missing match_id)'} missing ${field}`)
    }
  }
  if (!standardCodes.has(match.standard_code)) errors.push(`${match.match_id} references missing standard_code: ${match.standard_code}`)
  const unit = unitMap.get(match.unit_evidence_id)
  if (!unit) errors.push(`${match.match_id} references missing unit_evidence_id: ${match.unit_evidence_id}`)
  if (!ALLOWED_CANDIDATE_TYPES.has(match.candidate_type)) {
    errors.push(`${match.match_id} uses ${match.candidate_type}; matches must not rely on file-level volume_seed evidence`)
  }
  if (unit && unit.candidate_type !== match.candidate_type) {
    errors.push(`${match.match_id} candidate_type does not match unit index: ${match.candidate_type} != ${unit.candidate_type}`)
  }
  if (unit && unit.evidence_granularity !== match.evidence_granularity) {
    errors.push(`${match.match_id} evidence_granularity does not match unit index: ${match.evidence_granularity} != ${unit.evidence_granularity}`)
  }
  if (typeof match.score !== 'number' || match.score < 0 || match.score > 1) {
    errors.push(`${match.match_id} score must be 0..1`)
  }
  if (!ALLOWED_CONFIDENCE_BANDS.has(match.confidence_band)) {
    errors.push(`${match.match_id} invalid confidence_band: ${match.confidence_band}`)
  } else if (expectedBand(match.score) !== match.confidence_band) {
    errors.push(`${match.match_id} confidence_band ${match.confidence_band} does not match score ${match.score}`)
  }
  if (!Array.isArray(match.matched_keywords)) errors.push(`${match.match_id} matched_keywords must be an array`)
  if (!Array.isArray(match.matched_fields)) errors.push(`${match.match_id} matched_fields must be an array`)
  if (isNoiseTitle(match.unit_title)) {
    errors.push(`${match.match_id} uses an empty or TOC-only unit_title: ${match.unit_title || 'missing'}`)
  }
  if (match.confidence_band === 'high' && isGenericOnlyMatch(match)) {
    errors.push(`${match.match_id} is high confidence using only generic subject/noise keyword(s): ${(match.matched_keywords || []).join(', ')}`)
  }
  if (match.eligible_for_h4g_differentiation && match.candidate_type !== 'toc_unit_or_chapter') {
    errors.push(`${match.match_id} is eligible without toc_unit_or_chapter evidence`)
  }
  if (
    match.eligible_for_h4g_differentiation &&
    !match.subdomain_alignment?.matched &&
    !match.alias_alignment?.matched &&
    !match.field_alignment?.matched
  ) {
    errors.push(`${match.match_id} is eligible without subdomain anchor, reviewed alias anchor, or strong field alignment`)
  }
  if (match.eligible_for_h4g_differentiation && match.eligible_alignment === 'reviewed_alias_anchor') {
    if (!match.alias_alignment?.matched) {
      errors.push(`${match.match_id} reviewed_alias_anchor alignment missing alias_alignment.matched`)
    }
    if (!Array.isArray(match.alias_alignment.matched_terms) || !match.alias_alignment.matched_terms.length) {
      errors.push(`${match.match_id} reviewed alias alignment missing matched_terms`)
    }
    if (!Array.isArray(match.alias_alignment.reviewed_aliases) || !match.alias_alignment.reviewed_aliases.length) {
      errors.push(`${match.match_id} reviewed alias alignment missing reviewed_aliases`)
    }
  }
  if (match.eligible_for_h4g_differentiation && match.field_alignment?.matched) {
    if (!Array.isArray(match.field_alignment.evidence_fields) || !match.field_alignment.evidence_fields.length) {
      errors.push(`${match.match_id} strong field alignment missing evidence_fields`)
    }
    if (!Array.isArray(match.field_alignment.matched_keywords) || !match.field_alignment.matched_keywords.length) {
      errors.push(`${match.match_id} strong field alignment missing matched_keywords`)
    }
  }
  if (match.eligible_for_h4g_differentiation && match.confidence_band === 'low') {
    warnings.push(`${match.match_id} is eligible with low confidence`)
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
    matches: 0,
    eligible_matches: 0,
    generic_only_high_confidence_matches: 0,
    noise_title_matches: 0,
    unmatched_standards: 0,
    by_subject: {},
    by_confidence_band: {},
    by_candidate_type: {},
    by_eligible_alignment: {}
  }

  if (!existsSync(args.matches)) errors.push(`Missing matches file: ${args.matches}`)
  if (!existsSync(join(args.dataRoot, 'by_subject'))) errors.push(`Missing data root by_subject: ${args.dataRoot}`)
  if (!existsSync(args.unitIndex)) errors.push(`Missing unit index: ${args.unitIndex}`)

  const payload = errors.length ? { matches: [], unmatched_standards: [] } : readJson(args.matches)
  const standardCodes = errors.length ? new Set() : loadStandardCodes(args.dataRoot)
  const unitMap = errors.length ? new Map() : loadUnitMap(args.unitIndex)
  const seen = new Set()

  stats.matches = (payload.matches || []).length
  stats.unmatched_standards = (payload.unmatched_standards || []).length
  for (const match of payload.matches || []) {
    if (seen.has(match.match_id)) errors.push(`duplicate match_id: ${match.match_id}`)
    else seen.add(match.match_id)
    auditMatch(match, standardCodes, unitMap, errors, warnings, stats)
  }

  if (!stats.matches) {
    warnings.push('match file contains no matches; this is expected until toc_unit_or_chapter candidates exist')
    if (args.requireMatches) errors.push('requireMatches is set but match file contains no matches')
  }
  if (!stats.eligible_matches && args.requireEligible) {
    errors.push('requireEligible is set but no eligible matches exist')
  }

  const result = {
    valid: errors.length === 0,
    matches: args.matches,
    data_root: args.dataRoot,
    unit_index: args.unitIndex,
    require_matches: args.requireMatches,
    require_eligible: args.requireEligible,
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
