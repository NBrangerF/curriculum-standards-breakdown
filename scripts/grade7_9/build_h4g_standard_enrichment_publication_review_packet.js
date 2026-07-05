#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import {
  TARGET_GRADE_BANDS,
  countInto,
  countRows,
  markdownCell,
  normalizeText,
  readJson,
  recordsByGroup,
  stable,
  subjectFiles,
  writeJson,
  writeText
} from './h4g_supplemental_pipeline_utils.js'
import { SUBJECTS } from './config.js'

const DEFAULT_PUBLIC_DATA_ROOT = 'public/data'
const DEFAULT_CANDIDATE_ROOT = 'generated/h4g_standard_enrichment_publication/data_candidate'
const DEFAULT_PUBLICATION_AUDIT = 'generated/h4g_standard_enrichment_publication/publication_audit.json'
const DEFAULT_APPLY_SUMMARY = 'generated/h4g_standard_enrichment_publication/publication_apply_summary.json'
const DEFAULT_ENRICHMENT_AUDIT = 'generated/h4g_standard_enrichment/standard_enrichment_audit.json'
const DEFAULT_OUT = 'docs/H4G_STANDARD_ENRICHMENT_PUBLICATION_REVIEW_PACKET.md'
const DEFAULT_JSON_OUT = 'generated/h4g_standard_enrichment_publication/publication_review_surface.json'

function parseArgs(argv) {
  const args = {
    applySummary: DEFAULT_APPLY_SUMMARY,
    candidateRoot: DEFAULT_CANDIDATE_ROOT,
    enrichmentAudit: DEFAULT_ENRICHMENT_AUDIT,
    jsonOut: DEFAULT_JSON_OUT,
    maxRiskExamples: 12,
    maxSubjectExamples: 1,
    out: DEFAULT_OUT,
    publicDataRoot: DEFAULT_PUBLIC_DATA_ROOT,
    publicationAudit: DEFAULT_PUBLICATION_AUDIT,
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--apply-summary') args.applySummary = argv[++i]
    else if (item === '--candidate-root') args.candidateRoot = argv[++i]
    else if (item === '--enrichment-audit') args.enrichmentAudit = argv[++i]
    else if (item === '--json-out') args.jsonOut = argv[++i]
    else if (item === '--max-risk-examples') args.maxRiskExamples = Number(argv[++i])
    else if (item === '--max-subject-examples') args.maxSubjectExamples = Number(argv[++i])
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--public-data-root') args.publicDataRoot = argv[++i]
    else if (item === '--publication-audit') args.publicationAudit = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
npm run grade7_9:h4g-standard-enrichment-publication-review-packet -- --strict

Builds a human-readable review packet and machine-readable review surface for
the H4G standard enrichment publication dry-run candidate. It never writes
public/data.`)
}

function isH4G(record) {
  return TARGET_GRADE_BANDS.includes(record.grade_band)
}

function loadPayloads(root, errors, label) {
  const payloads = new Map()
  if (!existsSync(root)) {
    errors.push(`Missing ${label} root: ${root}`)
    return payloads
  }
  for (const file of subjectFiles(root)) {
    payloads.set(basename(file, '.json'), readJson(file))
  }
  if (!payloads.size) errors.push(`${label} root has no by_subject payloads: ${root}`)
  return payloads
}

function allRecords(payloads) {
  return [...payloads.values()].flatMap(payload => payload.standards || [])
}

function byCode(records) {
  return new Map(records.filter(record => record.code).map(record => [record.code, record]))
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b))
}

function countBy(records, field) {
  const out = {}
  for (const record of records) countInto(out, record[field])
  return out
}

function clip(value, max = 96) {
  const text = normalizeText(value)
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}...`
}

function gradeOrder(record) {
  const index = TARGET_GRADE_BANDS.indexOf(record.grade_band)
  return index === -1 ? 99 : index
}

function sortRecords(records) {
  return [...records].sort((a, b) => {
    const grade = gradeOrder(a) - gradeOrder(b)
    if (grade) return grade
    return String(a.code || '').localeCompare(String(b.code || ''))
  })
}

function subjectName(subjectSlug) {
  return SUBJECTS[subjectSlug]?.subject || subjectSlug
}

function recordReviewRow(record, publicCodeSet) {
  return {
    code: record.code,
    domain: record.domain,
    grade_band: record.grade_band,
    grade_label: record.grade || record.grade_range || record.grade_band,
    is_new_public_record: !publicCodeSet.has(record.code),
    previous_standard_rewrite: record.previous_standard_rewrite,
    review_status: record.review_status,
    source_standard_original: record.source_standard_original,
    standard: record.standard,
    standard_enrichment_method: record.standard_enrichment_method,
    standard_rewrite_record_origin: record.standard_rewrite_record_origin,
    standard_variant_type: record.standard_variant_type,
    subdomain: record.subdomain,
    supplemental_evidence_ids: record.supplemental_evidence_ids || []
  }
}

function riskReasonsForGroup(rows, publicCodeSet) {
  const reasons = []
  if (rows.some(record => !publicCodeSet.has(record.code) || record.standard_rewrite_record_origin === 'generated_missing_h4g_sibling')) {
    reasons.push('generated_missing_h4g_sibling')
  }
  if (rows.some(record => record.review_status === 'standard_enrichment_partial_source_bridge_needs_review' || record.standard_variant_type === 'grade_adapted_from_partial_source_range')) {
    reasons.push('partial_source_range_bridge')
  }
  const sourceStandards = new Set(rows.map(record => normalizeText(record.source_standard_original)).filter(Boolean))
  if (rows.length === 3 && sourceStandards.size === 1) {
    reasons.push('compressed_source_original_triplet')
  }
  const minConfidence = Math.min(...rows.map(record => Number(record.grade_adaptation_confidence || 1)))
  if (Number.isFinite(minConfidence) && minConfidence < 0.65) {
    reasons.push('low_grade_adaptation_confidence')
  }
  if (rows.some(record => record.requires_unit_level_evidence === true)) {
    reasons.push('requires_unit_level_evidence_followup')
  }
  return reasons
}

function priorityForReasons(reasons) {
  if (reasons.includes('generated_missing_h4g_sibling') || reasons.includes('partial_source_range_bridge')) return 'P0'
  if (reasons.includes('compressed_source_original_triplet') || reasons.includes('low_grade_adaptation_confidence')) return 'P1'
  return 'P2'
}

function buildReviewItems(candidateRows, publicCodeSet) {
  const groups = recordsByGroup(candidateRows)
  const items = []
  for (const [groupId, rows] of groups) {
    const sortedRows = sortRecords(rows)
    const first = sortedRows[0] || {}
    const reasons = riskReasonsForGroup(sortedRows, publicCodeSet)
    items.push({
      codes: sortedRows.map(record => record.code),
      domain: first.domain,
      grade_bands: sortedRows.map(record => record.grade_band),
      priority: priorityForReasons(reasons),
      progression_group_id: groupId,
      records: sortedRows.map(record => recordReviewRow(record, publicCodeSet)),
      risk_reasons: reasons,
      source_standard_originals: unique(sortedRows.map(record => record.source_standard_original)),
      subject: first.subject || subjectName(first.subject_slug),
      subject_slug: first.subject_slug,
      subdomain: first.subdomain
    })
  }
  return items.sort((a, b) => {
    const priority = a.priority.localeCompare(b.priority)
    if (priority) return priority
    const subject = String(a.subject_slug || '').localeCompare(String(b.subject_slug || ''))
    if (subject) return subject
    return String(a.progression_group_id || '').localeCompare(String(b.progression_group_id || ''))
  })
}

function validateInputs(args, errors) {
  const required = [
    ['candidate root', args.candidateRoot],
    ['publication audit', args.publicationAudit],
    ['apply summary', args.applySummary],
    ['enrichment audit', args.enrichmentAudit],
    ['public data root', args.publicDataRoot]
  ]
  for (const [label, path] of required) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  if (existsSync(args.publicationAudit)) {
    const audit = readJson(args.publicationAudit)
    if (audit.valid !== true) errors.push('publication audit must be valid before review packet generation')
    if (audit.writes_public_data !== false) errors.push('publication audit writes_public_data must be false')
    if (audit.summary?.non_h4g_changed_records !== 0) errors.push('publication audit must report non_h4g_changed_records=0')
  }
  if (existsSync(args.applySummary)) {
    const summary = readJson(args.applySummary)
    if (summary.valid !== true) errors.push('publication apply summary must be valid before review packet generation')
    if (summary.writes_public_data !== false) errors.push('publication apply summary writes_public_data must be false')
  }
  if (existsSync(args.enrichmentAudit)) {
    const audit = readJson(args.enrichmentAudit)
    if (audit.valid !== true) errors.push('enrichment audit must be valid before review packet generation')
    if (audit.summary?.quality_flagged_records !== 0) errors.push('enrichment audit must report quality_flagged_records=0')
  }
}

function buildSubjectSummary(candidateRows, publicRows, reviewItems) {
  const publicH4GBySubject = new Map()
  for (const record of publicRows.filter(isH4G)) {
    const key = record.subject_slug || 'missing'
    if (!publicH4GBySubject.has(key)) publicH4GBySubject.set(key, [])
    publicH4GBySubject.get(key).push(record)
  }
  const candidateBySubject = new Map()
  for (const record of candidateRows) {
    const key = record.subject_slug || 'missing'
    if (!candidateBySubject.has(key)) candidateBySubject.set(key, [])
    candidateBySubject.get(key).push(record)
  }
  const itemsBySubject = new Map()
  for (const item of reviewItems) {
    const key = item.subject_slug || 'missing'
    if (!itemsBySubject.has(key)) itemsBySubject.set(key, [])
    itemsBySubject.get(key).push(item)
  }

  const subjects = unique([...candidateBySubject.keys(), ...publicH4GBySubject.keys()])
  return subjects.map(subjectSlug => {
    const rows = candidateBySubject.get(subjectSlug) || []
    const publicRowsForSubject = publicH4GBySubject.get(subjectSlug) || []
    const items = itemsBySubject.get(subjectSlug) || []
    const publicCodes = new Set(publicRowsForSubject.map(record => record.code))
    const byGradeBand = {}
    for (const record of rows) countInto(byGradeBand, record.grade_band)
    return {
      candidate_h4g_records: rows.length,
      generated_missing_records: rows.filter(record => !publicCodes.has(record.code) || record.standard_rewrite_record_origin === 'generated_missing_h4g_sibling').length,
      groups: items.length,
      h4g7_records: byGradeBand.H4G7 || 0,
      h4g8_records: byGradeBand.H4G8 || 0,
      h4g9_records: byGradeBand.H4G9 || 0,
      p0_groups: items.filter(item => item.priority === 'P0').length,
      p1_groups: items.filter(item => item.priority === 'P1').length,
      p2_groups: items.filter(item => item.priority === 'P2').length,
      partial_source_bridge_records: rows.filter(record => record.review_status === 'standard_enrichment_partial_source_bridge_needs_review').length,
      public_h4g_records: publicRowsForSubject.length,
      regular_review_records: rows.filter(record => record.review_status === 'standard_enrichment_candidate_needs_review').length,
      subject: subjectName(subjectSlug),
      subject_slug: subjectSlug
    }
  })
}

function queueSummary(reviewItems) {
  const rows = [
    [
      'P0 generated missing sibling',
      item => item.risk_reasons.includes('generated_missing_h4g_sibling'),
      record => record.is_new_public_record || record.standard_rewrite_record_origin === 'generated_missing_h4g_sibling'
    ],
    [
      'P0 partial source range bridge',
      item => item.risk_reasons.includes('partial_source_range_bridge'),
      record => record.review_status === 'standard_enrichment_partial_source_bridge_needs_review'
    ],
    [
      'P1 compressed source-original triplet',
      item => item.risk_reasons.includes('compressed_source_original_triplet') && item.priority !== 'P0',
      () => true
    ],
    [
      'P1 low confidence',
      item => item.risk_reasons.includes('low_grade_adaptation_confidence') && item.priority !== 'P0',
      () => true
    ],
    [
      'P2 regular candidate',
      item => item.priority === 'P2',
      () => true
    ]
  ]
  return rows.map(([queue, groupPredicate, recordPredicate]) => {
    const items = reviewItems.filter(groupPredicate)
    return {
      groups: items.length,
      queue,
      records: items.reduce((sum, item) => sum + item.records.filter(recordPredicate).length, 0),
      subjects: unique(items.map(item => item.subject_slug))
    }
  })
}

function sampleItems(items, count) {
  return items.slice(0, Math.max(0, count))
}

function subjectExamples(reviewItems, maxSubjectExamples) {
  const out = []
  const bySubject = new Map()
  for (const item of reviewItems) {
    if (!bySubject.has(item.subject_slug)) bySubject.set(item.subject_slug, [])
    bySubject.get(item.subject_slug).push(item)
  }
  for (const subjectSlug of [...bySubject.keys()].sort((a, b) => a.localeCompare(b))) {
    const items = bySubject.get(subjectSlug)
    const ranked = [...items].sort((a, b) => a.priority.localeCompare(b.priority) || String(a.progression_group_id).localeCompare(String(b.progression_group_id)))
    out.push(...ranked.slice(0, maxSubjectExamples))
  }
  return out
}

function buildMarkdown(surface) {
  const subjectRows = surface.subject_summary.map(row => (
    `| ${markdownCell(row.subject)} | ${row.candidate_h4g_records} | ${row.public_h4g_records} | ${row.generated_missing_records} | ${row.partial_source_bridge_records} | ${row.groups} | ${row.p0_groups} | ${row.p1_groups} | ${row.p2_groups} |`
  )).join('\n')

  const queueRows = surface.risk_queue_summary.map(row => (
    `| ${markdownCell(row.queue)} | ${row.records} | ${row.groups} | ${markdownCell(row.subjects.join(', '))} |`
  )).join('\n')

  const statusRows = [
    ['publication audit valid', surface.gates.publication_audit_valid],
    ['publication apply valid', surface.gates.publication_apply_valid],
    ['enrichment audit valid', surface.gates.enrichment_audit_valid],
    ['candidate H4G records', surface.summary.candidate_h4g_records],
    ['progression groups', surface.summary.progression_groups],
    ['non-H4G changed records', surface.summary.non_h4g_changed_records],
    ['writes public data', surface.writes_public_data]
  ].map(([key, value]) => `| ${markdownCell(key)} | ${markdownCell(value)} |`).join('\n')

  return `# H4G Standard Enrichment Publication Review Packet

Generated at: ${surface.generated_at}

Status: review packet only. This packet does not write \`public/data\`.

## 0. Decision Framing

The publication dry-run candidate is structurally valid, but it should not be treated as automatically approved production data. The next decision is whether to publish all 1170 H4G records, publish a lower-risk subset, or revise candidate wording before any production write gate.

Recommended review order:

1. Review P0 generated sibling and partial source range bridge records first.
2. Spot-check P1 compressed source-original triplets across all subjects.
3. Decide one publication strategy: full release, risk-based release, or candidate revision.
4. Keep \`public/data\` unchanged until a separate production write gate is explicitly approved.

## 1. Gate Status

| Check | Value |
| --- | --- |
${statusRows}

## 2. Snapshot

| Metric | Value |
| --- | ---: |
| public H4G records | ${surface.summary.public_h4g_records} |
| candidate H4G records | ${surface.summary.candidate_h4g_records} |
| existing public H4G records replaced | ${surface.summary.existing_h4g_records_replaced} |
| new H4G sibling records added | ${surface.summary.new_h4g_records_added} |
| progression groups | ${surface.summary.progression_groups} |
| H4G7 / H4G8 / H4G9 records | ${surface.summary.h4g7_records} / ${surface.summary.h4g8_records} / ${surface.summary.h4g9_records} |
| publication candidate errors | ${surface.errors.length} |
| publication candidate warnings | ${surface.warnings.length} |

## 3. Risk Queue Summary

Risk queues can overlap. For example, the same Arts group can be both generated-sibling and partial-source-range.

| Queue | Records | Groups | Subjects |
| --- | ---: | ---: | --- |
${queueRows}

## 4. Subject Summary

| Subject | Candidate H4G | Public H4G | New Siblings | Partial Bridge Records | Groups | P0 Groups | P1 Groups | P2 Groups |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${subjectRows}

## 5. Review Status Distribution

| Status | Count |
| --- | ---: |
${countRows(surface.summary.by_review_status)}

## 6. Standard Enrichment Method Distribution

| Method | Count |
| --- | ---: |
${countRows(surface.summary.by_standard_enrichment_method)}

## 7. P0 Generated Sibling Examples

${renderExampleGroups(surface.examples.generated_missing_sibling)}

## 8. P0 Partial Source Range Bridge Examples

${renderExampleGroups(surface.examples.partial_source_range_bridge)}

## 9. Subject Triplet Samples

${renderExampleGroups(surface.examples.subject_triplets)}

## 10. Review Checklist

- Confirm whether the 89 generated missing H4G sibling records should enter the product data surface.
- Confirm whether Arts partial source range bridge records can safely represent H4G7/H4G8/H4G9 preview standards.
- For P1 compressed source-original triplets, check that the three grade standards differ by task complexity, evidence type, output expectation, or context depth rather than only wording.
- Confirm every reviewed candidate preserves \`source_standard_original\`, \`previous_standard_rewrite\`, \`supplemental_evidence_ids\`, and enrichment lineage.
- Choose publication strategy only after this review: full release, risk-based release, or revise candidate.

## 11. Machine-Readable Surface

Full review queues are available at:

\`${surface.outputs.review_surface_json}\`
`
}

function renderExampleGroups(items) {
  if (!items.length) return '- none'
  return items.map(item => {
    const rows = item.records.map(record => (
      `| ${markdownCell(record.grade_band)} | ${markdownCell(record.code)} | ${markdownCell(clip(record.standard, 140))} |`
    )).join('\n')
    const source = item.source_standard_originals.length === 1
      ? clip(item.source_standard_originals[0], 180)
      : `${item.source_standard_originals.length} source originals`
    return `### ${markdownCell(item.subject)} / ${markdownCell(item.domain)} / ${markdownCell(item.subdomain)}

- progression group: \`${item.progression_group_id}\`
- priority: \`${item.priority}\`
- risk reasons: ${item.risk_reasons.map(reason => `\`${reason}\``).join(', ')}
- source original: ${markdownCell(source)}

| Grade | Code | Candidate Standard |
| --- | --- | --- |
${rows}`
  }).join('\n\n')
}

function build(args) {
  const errors = []
  const warnings = []
  validateInputs(args, errors)

  const publicPayloads = loadPayloads(args.publicDataRoot, errors, 'public')
  const candidatePayloads = loadPayloads(args.candidateRoot, errors, 'candidate')
  const publicRows = allRecords(publicPayloads)
  const candidateRows = allRecords(candidatePayloads).filter(isH4G)
  const publicCodeSet = new Set(publicRows.map(record => record.code))
  const publicH4G = publicRows.filter(isH4G)
  const reviewItems = buildReviewItems(candidateRows, publicCodeSet)
  const publicationAudit = existsSync(args.publicationAudit) ? readJson(args.publicationAudit) : {}
  const applySummary = existsSync(args.applySummary) ? readJson(args.applySummary) : {}
  const enrichmentAudit = existsSync(args.enrichmentAudit) ? readJson(args.enrichmentAudit) : {}
  const byGrade = countBy(candidateRows, 'grade_band')
  const byReviewStatus = countBy(candidateRows, 'review_status')
  const byMethod = countBy(candidateRows, 'standard_enrichment_method')
  const publicH4GCodeSet = new Set(publicH4G.map(record => record.code))
  const generatedMissingItems = reviewItems.filter(item => item.risk_reasons.includes('generated_missing_h4g_sibling'))
  const partialBridgeItems = reviewItems.filter(item => item.risk_reasons.includes('partial_source_range_bridge'))
  const itemsByPriority = {}
  for (const item of reviewItems) countInto(itemsByPriority, item.priority)

  const surface = {
    errors,
    examples: {
      generated_missing_sibling: sampleItems(generatedMissingItems, args.maxRiskExamples),
      partial_source_range_bridge: sampleItems(partialBridgeItems, args.maxRiskExamples),
      subject_triplets: subjectExamples(reviewItems, args.maxSubjectExamples)
    },
    gates: {
      enrichment_audit_valid: enrichmentAudit.valid === true,
      publication_apply_valid: applySummary.valid === true,
      publication_audit_valid: publicationAudit.valid === true
    },
    generated_at: new Date().toISOString(),
    inputs: {
      apply_summary: args.applySummary,
      candidate_root: args.candidateRoot,
      enrichment_audit: args.enrichmentAudit,
      public_data_root: args.publicDataRoot,
      publication_audit: args.publicationAudit
    },
    outputs: {
      review_packet_md: args.out,
      review_surface_json: args.jsonOut
    },
    purpose: 'h4g_standard_enrichment_publication_review_packet',
    review_items: reviewItems,
    risk_queue_summary: queueSummary(reviewItems),
    subject_summary: buildSubjectSummary(candidateRows, publicRows, reviewItems),
    summary: {
      by_priority_group_count: itemsByPriority,
      by_review_status: byReviewStatus,
      by_standard_enrichment_method: byMethod,
      candidate_h4g_records: candidateRows.length,
      existing_h4g_records_replaced: candidateRows.filter(record => publicH4GCodeSet.has(record.code)).length,
      h4g7_records: byGrade.H4G7 || 0,
      h4g8_records: byGrade.H4G8 || 0,
      h4g9_records: byGrade.H4G9 || 0,
      new_h4g_records_added: candidateRows.filter(record => !publicH4GCodeSet.has(record.code)).length,
      non_h4g_changed_records: publicationAudit.summary?.non_h4g_changed_records ?? null,
      progression_groups: recordsByGroup(candidateRows).size,
      public_h4g_records: publicH4G.length
    },
    valid: errors.length === 0,
    warnings,
    writes_public_data: false
  }
  return surface
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  usage()
  process.exit(0)
}

const surface = build(args)
writeJson(args.jsonOut, surface)
writeText(args.out, buildMarkdown(surface))

console.log(JSON.stringify(stable({
  candidate_h4g_records: surface.summary.candidate_h4g_records,
  generated_missing_sibling_groups: surface.risk_queue_summary.find(row => row.queue === 'P0 generated missing sibling')?.groups || 0,
  new_h4g_records_added: surface.summary.new_h4g_records_added,
  p0_groups: surface.summary.by_priority_group_count.P0 || 0,
  p1_groups: surface.summary.by_priority_group_count.P1 || 0,
  p2_groups: surface.summary.by_priority_group_count.P2 || 0,
  partial_source_bridge_groups: surface.risk_queue_summary.find(row => row.queue === 'P0 partial source range bridge')?.groups || 0,
  review_packet: args.out,
  review_surface: args.jsonOut,
  valid: surface.valid,
  warnings: surface.warnings.length,
  writes_public_data: surface.writes_public_data
}), null, 2))

if (args.strict && !surface.valid) {
  console.error(surface.errors.join('\n'))
  process.exit(1)
}
