#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import {
  TARGET_GRADE_BANDS,
  countInto,
  markdownCell,
  normalizeText,
  recordsByGroup,
  readJson,
  subjectFiles,
  writeJson,
  writeText
} from './h4g_supplemental_pipeline_utils.js'
import { SUBJECTS } from './config.js'

const PACKET_VERSION = 'H4G_SOURCE_ALIGNED_STANDARD_REVIEW_PACKET_v0.1'
const DEFAULT_BASE_ROOT = 'public/data'
const DEFAULT_CANDIDATE_ROOT = 'generated/h4g_source_aligned_standard_rewrite/data_candidate'
const DEFAULT_AUDIT = 'generated/h4g_source_aligned_standard_rewrite/source_aligned_standard_rewrite_audit.json'
const DEFAULT_OUT = 'generated/h4g_source_aligned_standard_rewrite/source_aligned_standard_review_packet.json'
const DEFAULT_MD_OUT = 'generated/h4g_source_aligned_standard_rewrite/source_aligned_standard_review_packet.md'
const DEFAULT_PUBLIC_OUT = 'public/data/reviews/h4g_source_aligned_standard_review_packet.json'

const TEMPLATE_TOKENS = [
  '围绕“',
  '关键要求',
  '候选',
  '本次补强',
  '原始标准',
  '可预览',
  '可观察',
  '可评价',
  '能结合“',
  '核心要求'
]

function parseArgs(argv) {
  const args = {
    audit: DEFAULT_AUDIT,
    baseRoot: DEFAULT_BASE_ROOT,
    candidateRoot: DEFAULT_CANDIDATE_ROOT,
    mdOut: DEFAULT_MD_OUT,
    minOverlap: 0.12,
    out: DEFAULT_OUT,
    publicOut: DEFAULT_PUBLIC_OUT,
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--audit') args.audit = argv[++i]
    else if (item === '--base-root') args.baseRoot = argv[++i]
    else if (item === '--candidate-root') args.candidateRoot = argv[++i]
    else if (item === '--md-out') args.mdOut = argv[++i]
    else if (item === '--min-overlap') args.minOverlap = Number(argv[++i])
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--public-out') args.publicOut = argv[++i]
    else if (item === '--no-public-out') args.publicOut = ''
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
npm run grade7_9:h4g-source-aligned-standard-review-packet -- --strict

Builds a read-only review packet comparing current public H4G standards with the
source-aligned candidate standards. It does not overwrite public standards.`)
}

function isH4G(record) {
  return TARGET_GRADE_BANDS.includes(record.grade_band)
}

function gradeOrder(record) {
  const index = TARGET_GRADE_BANDS.indexOf(record.grade_band)
  return index === -1 ? 99 : index
}

function textHits(...texts) {
  const joined = normalizeText(texts.join('\n'))
  return TEMPLATE_TOKENS.filter(token => joined.includes(token))
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))]
}

function average(values) {
  const numbers = values.filter(value => Number.isFinite(value))
  if (!numbers.length) return null
  return Number((numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(4))
}

function minOrNull(values) {
  const numbers = values.filter(value => Number.isFinite(value))
  if (!numbers.length) return null
  return Number(Math.min(...numbers).toFixed(4))
}

function shortText(value, max = 96) {
  const text = normalizeText(value)
  return text.length > max ? `${text.slice(0, max)}...` : text
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
  return payloads
}

function recordsByCode(payload) {
  return new Map((payload?.standards || []).map(record => [record.code, record]))
}

function subjectLabel(subjectSlug, payload) {
  return payload?.subject || SUBJECTS[subjectSlug]?.subject || subjectSlug
}

function compactEvidenceIds(record, field) {
  const values = Array.isArray(record?.[field]) ? record[field] : []
  return values.slice(0, 12)
}

function compactReviewRecord(base, candidate) {
  const currentTemplateHits = textHits(base.standard, base.grade_specific_focus)
  const candidateTemplateHits = textHits(candidate?.standard, candidate?.grade_specific_focus)
  const overlap = Number(candidate?.source_aligned_source_overlap)

  return {
    candidate_grade_specific_focus: candidate?.grade_specific_focus || '',
    candidate_metadata_leak_hits: candidate?.source_aligned_metadata_leak_hits || [],
    candidate_review_status: candidate?.review_status || '',
    candidate_standard: candidate?.standard || '',
    candidate_template_hits: candidateTemplateHits,
    candidate_topic: candidate?.subdomain || '',
    code: base.code,
    current_grade_specific_focus: base.grade_specific_focus || '',
    current_standard: base.standard || '',
    current_standard_url: `/standards/${base.code}`,
    current_template_hits: currentTemplateHits,
    evidence_granularity: candidate?.evidence_granularity || base.evidence_granularity || '',
    focus_changed: normalizeText(base.grade_specific_focus) !== normalizeText(candidate?.grade_specific_focus),
    grade: base.grade || candidate?.grade || '',
    grade_band: base.grade_band,
    grade_level: base.grade_level || candidate?.grade_level || '',
    id: base.id || base.code,
    legacy_code: base.legacy_code || '',
    public_review_status: base.review_status || '',
    source_aligned_rewrite_candidate_id: candidate?.source_aligned_rewrite_candidate_id || '',
    source_aligned_rewrite_rationale: candidate?.source_aligned_rewrite_rationale || '',
    source_aligned_rewrite_status: candidate?.source_aligned_rewrite_status || 'missing_candidate',
    source_aligned_v2_issue_flags: candidate?.source_aligned_v2_issue_flags || [],
    source_aligned_v2_source_role: candidate?.source_aligned_v2_source_role || '',
    source_aligned_source_overlap: Number.isFinite(overlap) ? Number(overlap.toFixed(4)) : null,
    standard_changed: normalizeText(base.standard) !== normalizeText(candidate?.standard),
    supplemental_evidence_ids: compactEvidenceIds(candidate || base, 'supplemental_evidence_ids'),
    textbook_evidence_ids: compactEvidenceIds(candidate || base, 'textbook_evidence_ids'),
    template_removed: currentTemplateHits.length > 0 && candidateTemplateHits.length === 0
  }
}

function buildGroup(subjectSlug, subject, groupId, baseRows, candidateByCode, errors, args) {
  const rows = [...baseRows].sort((a, b) => gradeOrder(a) - gradeOrder(b))
  const first = rows[0] || {}
  const firstCandidate = candidateByCode.get(first.code) || {}
  const displayTopic = firstCandidate.subdomain || first.subdomain || firstCandidate.domain || first.domain || groupId
  const displayDomain = firstCandidate.domain || first.domain || ''
  const displayCategory = firstCandidate.source_anchor_category || first.source_anchor_category || displayDomain
  const sourceAnchorSubcategory = firstCandidate.source_anchor_subcategory || first.source_anchor_subcategory || ''
  const records = rows.map(base => {
    const candidate = candidateByCode.get(base.code)
    if (!candidate) errors.push(`${base.code} missing from candidate root`)
    return compactReviewRecord(base, candidate)
  })

  const overlaps = records.map(record => Number(record.source_aligned_source_overlap))
  const changedRecords = records.filter(record => record.standard_changed).length
  const templateRemovedRecords = records.filter(record => record.template_removed).length
  const candidateTemplateHitRecords = records.filter(record => record.candidate_template_hits.length).length
  const candidateMetadataLeakRecords = records.filter(record => record.candidate_metadata_leak_hits.length).length
  const currentTemplateHitRecords = records.filter(record => record.current_template_hits.length).length
  const lowOverlapRecords = records.filter(record => Number(record.source_aligned_source_overlap) < args.minOverlap).length
  const candidateStandards = new Set(records.map(record => normalizeText(record.candidate_standard)))
  const currentStandards = new Set(records.map(record => normalizeText(record.current_standard)))

  return {
    candidate_distinct_standard_count: candidateStandards.size,
    candidate_metadata_leak_records: candidateMetadataLeakRecords,
    candidate_template_hit_records: candidateTemplateHitRecords,
    category: displayCategory,
    changed_records: changedRecords,
    codes: records.map(record => record.code),
    current_distinct_standard_count: currentStandards.size,
    current_template_hit_records: currentTemplateHitRecords,
    domain: displayDomain,
    group_id: groupId,
    low_overlap_records: lowOverlapRecords,
    previous_source_standard_original: first.previous_source_standard_original || '',
    priority: first.source_anchor_review_priority || 'P3',
    records,
    risk_reasons: unique(rows.flatMap(row => row.source_anchor_review_risk_reasons || [])),
    source_aligned_source_overlap_avg: average(overlaps),
    source_aligned_source_overlap_min: minOrNull(overlaps),
    source_anchor_id: first.source_anchor_id || '',
    source_anchor_subcategory: sourceAnchorSubcategory,
    source_anchor_tags: firstCandidate.source_anchor_tags || first.source_anchor_tags || {},
    source_section_type: firstCandidate.source_section_type || first.source_section_type || '',
    source_standard_original: firstCandidate.source_standard_original || first.source_standard_original || '',
    subdomain: displayTopic,
    subject,
    subject_slug: subjectSlug,
    supporting_source_standard_original: firstCandidate.supporting_source_standard_original || first.supporting_source_standard_original || '',
    template_removed_records: templateRemovedRecords,
    topic: displayTopic
  }
}

function buildMarkdown(packet) {
  const subjectRows = Object.entries(packet.summary.by_subject || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subjectSlug, item]) => `| ${markdownCell(item.subject || subjectSlug)} | ${item.groups} | ${item.records} | ${item.changed_records} | ${item.template_removed_records} | ${item.current_template_hit_records} | ${item.candidate_template_hit_records} | ${item.candidate_metadata_leak_records} | ${markdownCell(item.min_source_overlap)} |`)
    .join('\n')

  const priorityRows = Object.entries(packet.summary.by_priority || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([priority, count]) => `| ${markdownCell(priority)} | ${count} |`)
    .join('\n')

  const samples = packet.groups.slice(0, 18)
    .map(group => {
      const firstRecord = group.records[0] || {}
      return `| ${markdownCell(group.priority)} | ${markdownCell(group.subject)} | ${markdownCell(group.topic)} | ${markdownCell(firstRecord.code)} | ${markdownCell(shortText(firstRecord.current_standard, 72))} | ${markdownCell(shortText(firstRecord.candidate_standard, 72))} |`
    })
    .join('\n')

  return `# H4G Source-Aligned Standard Review Packet

Generated at: ${packet.generated_at}

## Purpose

This packet compares current public H4G G7/G8/G9 standards with the source-aligned candidate standards. It is read-only and exists for human review before any publication contract.

## Inputs

| Field | Value |
|---|---|
| Public current root | ${markdownCell(packet.inputs.public_current_root)} |
| Candidate root | ${markdownCell(packet.inputs.source_aligned_candidate_root)} |
| Candidate audit | ${markdownCell(packet.inputs.candidate_audit)} |
| UI copy | ${markdownCell(packet.outputs.public_review_asset || 'disabled')} |

## Summary

| Metric | Value |
|---|---:|
| Groups | ${packet.summary.progression_groups} |
| Records | ${packet.summary.h4g_records} |
| Changed records | ${packet.summary.changed_records} |
| Template removed records | ${packet.summary.template_removed_records} |
| Current template-hit records | ${packet.summary.current_template_hit_records} |
| Candidate template-hit records | ${packet.summary.candidate_template_hit_records} |
| Candidate metadata-leak records | ${packet.summary.candidate_metadata_leak_records} |
| Low-overlap records | ${packet.summary.low_overlap_records} |
| Candidate audit valid | ${packet.summary.candidate_audit_valid} |
| Writes public standards | ${packet.summary.writes_public_standards} |

## By Subject

| Subject | Groups | Records | Changed | Template removed | Current template hits | Candidate template hits | Candidate metadata leaks | Min overlap |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${subjectRows || '| - | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |'}

## By Priority

| Priority | Groups |
|---|---:|
${priorityRows || '| - | 0 |'}

## Review Samples

| Priority | Subject | Topic | First code | Current public standard | Source-aligned candidate |
|---|---|---|---|---|---|
${samples || '| - | - | - | - | - | - |'}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    return
  }

  const errors = []
  if (args.publicOut && !args.publicOut.includes('/reviews/')) {
    errors.push(`publicOut must be a review asset path under /reviews/: ${args.publicOut}`)
  }

  const basePayloads = loadPayloads(args.baseRoot, errors, 'public current data')
  const candidatePayloads = loadPayloads(args.candidateRoot, errors, 'source-aligned candidate data')
  const candidateAudit = existsSync(args.audit) ? readJson(args.audit) : null
  if (!candidateAudit) errors.push(`Missing candidate audit: ${args.audit}`)

  const groups = []
  const bySubject = {}
  const byPriority = {}
  const subjectSlugs = [...new Set([...basePayloads.keys(), ...candidatePayloads.keys()])].sort((a, b) => a.localeCompare(b))
  for (const subjectSlug of subjectSlugs) {
    const basePayload = basePayloads.get(subjectSlug)
    const candidatePayload = candidatePayloads.get(subjectSlug)
    if (!basePayload) {
      errors.push(`${subjectSlug} missing from public current root`)
      continue
    }
    if (!candidatePayload) {
      errors.push(`${subjectSlug} missing from candidate root`)
      continue
    }

    const subject = subjectLabel(subjectSlug, basePayload)
    const candidateByCode = recordsByCode(candidatePayload)
    const baseH4G = (basePayload.standards || []).filter(isH4G)
    const baseGroups = recordsByGroup(baseH4G)
    const subjectGroups = []
    for (const [groupId, rows] of baseGroups) {
      const bands = new Set(rows.map(row => row.grade_band))
      if (rows.length !== 3 || TARGET_GRADE_BANDS.some(band => !bands.has(band))) {
        errors.push(`${subjectSlug}/${groupId} current public group is not a complete H4G triplet`)
      }
      const group = buildGroup(subjectSlug, subject, groupId, rows, candidateByCode, errors, args)
      subjectGroups.push(group)
      groups.push(group)
      countInto(byPriority, group.priority)
    }

    bySubject[subjectSlug] = {
      candidate_metadata_leak_records: subjectGroups.reduce((sum, group) => sum + group.candidate_metadata_leak_records, 0),
      candidate_template_hit_records: subjectGroups.reduce((sum, group) => sum + group.candidate_template_hit_records, 0),
      changed_records: subjectGroups.reduce((sum, group) => sum + group.changed_records, 0),
      current_template_hit_records: subjectGroups.reduce((sum, group) => sum + group.current_template_hit_records, 0),
      groups: subjectGroups.length,
      low_overlap_records: subjectGroups.reduce((sum, group) => sum + group.low_overlap_records, 0),
      min_source_overlap: minOrNull(subjectGroups.map(group => Number(group.source_aligned_source_overlap_min))),
      records: subjectGroups.reduce((sum, group) => sum + group.records.length, 0),
      subject,
      template_removed_records: subjectGroups.reduce((sum, group) => sum + group.template_removed_records, 0)
    }
  }

  groups.sort((a, b) => {
    const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 }
    return (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9) ||
      a.subject_slug.localeCompare(b.subject_slug) ||
      a.group_id.localeCompare(b.group_id)
  })

  const summary = {
    by_priority: byPriority,
    by_subject: bySubject,
    candidate_audit_summary: candidateAudit?.summary || {},
    candidate_audit_valid: candidateAudit?.valid === true,
    candidate_metadata_leak_records: groups.reduce((sum, group) => sum + group.candidate_metadata_leak_records, 0),
    candidate_template_hit_records: groups.reduce((sum, group) => sum + group.candidate_template_hit_records, 0),
    changed_records: groups.reduce((sum, group) => sum + group.changed_records, 0),
    current_template_hit_records: groups.reduce((sum, group) => sum + group.current_template_hit_records, 0),
    h4g_records: groups.reduce((sum, group) => sum + group.records.length, 0),
    low_overlap_records: groups.reduce((sum, group) => sum + group.low_overlap_records, 0),
    progression_groups: groups.length,
    template_removed_records: groups.reduce((sum, group) => sum + group.template_removed_records, 0),
    writes_public_standards: false
  }

  const packet = {
    contract_version: PACKET_VERSION,
    errors,
    generated_at: new Date().toISOString(),
    groups,
    inputs: {
      candidate_audit: args.audit,
      public_current_root: args.baseRoot,
      source_aligned_candidate_root: args.candidateRoot
    },
    min_overlap: args.minOverlap,
    outputs: {
      generated_markdown: args.mdOut,
      generated_packet: args.out,
      public_review_asset: args.publicOut || ''
    },
    purpose: 'Compare current public H4G standards against source-aligned candidate standards for human review before publication.',
    subjects: Object.entries(bySubject)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([subjectSlug, item]) => ({
        groups: item.groups,
        records: item.records,
        subject: item.subject,
        subject_slug: subjectSlug
      })),
    summary,
    valid: errors.length === 0 && candidateAudit?.valid === true,
    writes_public_standards: false
  }

  writeJson(args.out, packet)
  writeText(args.mdOut, buildMarkdown(packet))
  if (args.publicOut) writeJson(args.publicOut, packet)

  console.log(JSON.stringify({
    candidate_audit_valid: summary.candidate_audit_valid,
    candidate_metadata_leak_records: summary.candidate_metadata_leak_records,
    candidate_template_hit_records: summary.candidate_template_hit_records,
    changed_records: summary.changed_records,
    current_template_hit_records: summary.current_template_hit_records,
    errors: errors.length,
    h4g_records: summary.h4g_records,
    progression_groups: summary.progression_groups,
    public_review_asset: args.publicOut || null,
    template_removed_records: summary.template_removed_records,
    valid: packet.valid,
    writes_public_standards: packet.writes_public_standards
  }, null, 2))

  if (args.strict && !packet.valid) process.exit(1)
}

main()
