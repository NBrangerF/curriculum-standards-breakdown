#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  TARGET_GRADE_BANDS,
  countInto,
  hashJson,
  normalizeText,
  readJson,
  recordsByGroup,
  subjectFiles,
  writeJson,
  writeText
} from './h4g_supplemental_pipeline_utils.js'
import {
  SOURCE_ANCHOR_METHOD_VERSION,
  SOURCE_ANCHOR_REMAP_CONTRACT_VERSION,
  SUBJECT_CONTRACTS,
  SUBJECT_ORDER
} from './h4g_source_anchor_remap_contract.js'

const DEFAULT_BASE_ROOT = 'public/data'
const DEFAULT_CANDIDATE_ROOT = 'generated/h4g_source_anchor_remap_candidate/data_candidate'
const DEFAULT_OUT = 'generated/h4g_source_anchor_remap_candidate/source_anchor_remap_candidate_deep_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/h4g_source_anchor_remap_candidate/source_anchor_remap_candidate_deep_audit.md'

function parseArgs(argv) {
  const args = {
    baseRoot: DEFAULT_BASE_ROOT,
    candidateRoot: DEFAULT_CANDIDATE_ROOT,
    out: DEFAULT_OUT,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    subject: 'all'
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--base-root') args.baseRoot = argv[++i]
    else if (item === '--candidate-root') args.candidateRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subject') args.subject = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
npm run grade7_9:audit-h4g-source-anchor-remap-candidate -- --strict

Audits an H4G source-anchor remap candidate against the current public data
baseline. It does not modify data.`)
}

function selectedSubjects(subjectArg) {
  if (subjectArg === 'all') return SUBJECT_ORDER
  return subjectArg.split(',').map(item => item.trim()).filter(Boolean)
}

function isH4G(record) {
  return TARGET_GRADE_BANDS.includes(record.grade_band)
}

function loadSubjectPayloads(root, errors, label) {
  const payloads = new Map()
  if (!existsSync(root)) {
    errors.push(`Missing ${label} root: ${root}`)
    return payloads
  }
  for (const file of subjectFiles(root)) {
    payloads.set(basename(file, '.json'), readJson(file))
  }
  return payloads
}

function recordByCode(payload) {
  return new Map((payload?.standards || []).map(record => [record.code, record]))
}

function canonicalCategories(subjectSlug) {
  return new Set(SUBJECT_CONTRACTS[subjectSlug]?.categories || [])
}

function requiredTags(subjectSlug) {
  return SUBJECT_CONTRACTS[subjectSlug]?.required_tags || []
}

function auditSubject(subjectSlug, basePayload, candidatePayload) {
  const errors = []
  const warnings = []
  const byCategory = {}
  const byPriority = {}
  const baseByCode = recordByCode(basePayload)
  const candidateRows = candidatePayload?.standards || []
  const candidateH4G = candidateRows.filter(isH4G)
  const categories = canonicalCategories(subjectSlug)
  const required = requiredTags(subjectSlug)
  let changedNonH4G = 0
  let remapped = 0
  let distinctTriplets = 0
  let identicalTriplets = 0

  for (const candidate of candidateRows) {
    const base = baseByCode.get(candidate.code)
    if (!base) {
      errors.push(`${candidate.code} missing from base payload`)
      continue
    }
    if (!isH4G(candidate) && hashJson(candidate) !== hashJson(base)) changedNonH4G += 1
  }

  for (const record of candidateH4G) {
    remapped += record.source_anchor_correction_contract_version === SOURCE_ANCHOR_REMAP_CONTRACT_VERSION ? 1 : 0
    countInto(byCategory, record.source_anchor_category || record.domain)
    countInto(byPriority, record.source_anchor_review_priority)

    if (!record.source_anchor_id) errors.push(`${record.code} missing source_anchor_id`)
    if (!record.source_section_type) errors.push(`${record.code} missing source_section_type`)
    if (!record.source_standard_original) errors.push(`${record.code} missing source_standard_original`)
    if (!record.previous_source_standard_original) errors.push(`${record.code} missing previous_source_standard_original`)
    if (!record.supporting_source_standard_original) errors.push(`${record.code} missing supporting_source_standard_original`)
    if (record.source_anchor_method_contract_version !== SOURCE_ANCHOR_METHOD_VERSION) errors.push(`${record.code} method contract mismatch`)
    if (record.source_anchor_correction_contract_version !== SOURCE_ANCHOR_REMAP_CONTRACT_VERSION) errors.push(`${record.code} correction contract mismatch`)
    if (!categories.has(record.source_anchor_category)) errors.push(`${record.code} invalid source_anchor_category: ${record.source_anchor_category}`)
    if (record.domain !== record.source_anchor_category) errors.push(`${record.code} domain must equal source_anchor_category after remap`)
    for (const tag of required) {
      if (!normalizeText(record[tag]) && !normalizeText(record.source_anchor_tags?.[tag])) errors.push(`${record.code} missing required tag: ${tag}`)
    }
  }

  if (changedNonH4G) errors.push(`${subjectSlug} changed ${changedNonH4G} non-H4G records`)

  const groups = recordsByGroup(candidateH4G)
  for (const [groupId, rows] of groups) {
    const bands = new Set(rows.map(row => row.grade_band))
    if (rows.length !== 3 || TARGET_GRADE_BANDS.some(band => !bands.has(band))) {
      errors.push(`${groupId} is not a complete H4G triplet`)
      continue
    }
    const anchors = new Set(rows.map(row => row.source_anchor_id))
    if (anchors.size !== 1) errors.push(`${groupId} has inconsistent source_anchor_id across G7/G8/G9`)
    const standards = new Set(rows.map(row => normalizeText(row.standard)))
    if (standards.size === 3) distinctTriplets += 1
    else {
      identicalTriplets += 1
      errors.push(`${groupId} does not have distinct G7/G8/G9 standard text`)
    }
  }

  return {
    errors,
    subject_slug: subjectSlug,
    summary: {
      by_category: byCategory,
      by_priority: byPriority,
      changed_non_h4g_records: changedNonH4G,
      distinct_triplets: distinctTriplets,
      h4g_records: candidateH4G.length,
      identical_triplets: identicalTriplets,
      progression_groups: groups.size,
      remapped_records: remapped
    },
    valid: errors.length === 0,
    warnings
  }
}

function markdown(result) {
  return `# H4G Source Anchor Remap Candidate Audit

Generated at: ${result.generated_at}

| Metric | Value |
| --- | ---: |
| valid | ${result.valid} |
| subjects | ${result.summary.subjects} |
| H4G records | ${result.summary.h4g_records} |
| remapped records | ${result.summary.remapped_records} |
| progression groups | ${result.summary.progression_groups} |
| distinct triplets | ${result.summary.distinct_triplets} |
| changed non-H4G records | ${result.summary.changed_non_h4g_records} |
| errors | ${result.errors.length} |
| warnings | ${result.warnings.length} |

## Subject Summary

| Subject | H4G | Remapped | Groups | Distinct Triplets | Non-H4G Changes | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${result.subjects.map(item => `| ${item.subject_slug} | ${item.summary.h4g_records} | ${item.summary.remapped_records} | ${item.summary.progression_groups} | ${item.summary.distinct_triplets} | ${item.summary.changed_non_h4g_records} | ${item.errors.length} |`).join('\n')}

## Errors

${result.errors.length ? result.errors.slice(0, 120).map(item => `- ${item}`).join('\n') : '- none'}

## Warnings

${result.warnings.length ? result.warnings.map(item => `- ${item}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  const warnings = []
  const basePayloads = loadSubjectPayloads(args.baseRoot, errors, 'base')
  const candidatePayloads = loadSubjectPayloads(args.candidateRoot, errors, 'candidate')
  const subjects = []
  const selected = selectedSubjects(args.subject)
  const totals = {
    changed_non_h4g_records: 0,
    distinct_triplets: 0,
    h4g_records: 0,
    progression_groups: 0,
    remapped_records: 0,
    subjects: 0
  }

  for (const subjectSlug of selected) {
    const basePayload = basePayloads.get(subjectSlug)
    const candidatePayload = candidatePayloads.get(subjectSlug)
    if (!basePayload) {
      errors.push(`Missing base subject: ${subjectSlug}`)
      continue
    }
    if (!candidatePayload) {
      errors.push(`Missing candidate subject: ${subjectSlug}`)
      continue
    }
    const subject = auditSubject(subjectSlug, basePayload, candidatePayload)
    subjects.push(subject)
    errors.push(...subject.errors)
    warnings.push(...subject.warnings)
    totals.changed_non_h4g_records += subject.summary.changed_non_h4g_records
    totals.distinct_triplets += subject.summary.distinct_triplets
    totals.h4g_records += subject.summary.h4g_records
    totals.progression_groups += subject.summary.progression_groups
    totals.remapped_records += subject.summary.remapped_records
  }
  totals.subjects = subjects.length

  const result = {
    contract_version: SOURCE_ANCHOR_REMAP_CONTRACT_VERSION,
    errors,
    generated_at: new Date().toISOString(),
    method_version: SOURCE_ANCHOR_METHOD_VERSION,
    subjects,
    summary: totals,
    valid: errors.length === 0,
    warnings
  }

  writeJson(args.out, result)
  writeText(args.summaryOut, markdown(result))
  return result
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const result = audit(args)
console.log(JSON.stringify({
  changed_non_h4g_records: result.summary.changed_non_h4g_records,
  distinct_triplets: result.summary.distinct_triplets,
  h4g_records: result.summary.h4g_records,
  progression_groups: result.summary.progression_groups,
  remapped_records: result.summary.remapped_records,
  subjects: result.summary.subjects,
  valid: result.valid,
  warnings: result.warnings.length
}, null, 2))

if (!result.valid && args.strict) process.exitCode = 1
