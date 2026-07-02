#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_PACKET = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_packet.json'
const DEFAULT_TAXONOMY = 'scripts/textbooks/h4g_subject_theme_taxonomy.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_packet_audit.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_subject_theme_bridge_review_packet_audit.md'
const REVIEW_ONLY_ALLOWED_STATUSES = new Set([
  'needs_source_review',
  'needs_curriculum_review',
  'rejected',
  'keep_blocked'
])

function parseArgs(argv) {
  const args = {
    packet: DEFAULT_PACKET,
    taxonomy: DEFAULT_TAXONOMY,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    strict: false,
    requireCandidates: false,
    requirePageReadyCandidate: false,
    allowApproved: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--packet') args.packet = argv[++i]
    else if (item === '--taxonomy') args.taxonomy = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-candidates') args.requireCandidates = true
    else if (item === '--require-page-ready-candidate') args.requirePageReadyCandidate = true
    else if (item === '--allow-approved') args.allowApproved = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_review_packet.js \\
  --packet generated/textbook_evidence/h4g_subject_theme_bridge_review_packet.json \\
  --strict --require-candidates

Audits a review-only H4G subject theme bridge packet. It blocks public writes,
unreviewed eligible evidence, cross-grade candidates, and unknown topic tags.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function topicTagsBySubject(taxonomy) {
  const out = {}
  for (const [subject, config] of Object.entries(taxonomy.subjects || {})) {
    out[subject] = new Set((config.topic_tags || []).map(row => row.tag).filter(Boolean))
  }
  return out
}

function approvedStatuses(taxonomy) {
  return new Set(taxonomy.review_policy?.approved_statuses || [
    'source_review_approved',
    'curriculum_review_approved'
  ])
}

function validateStatus(item, approved, args, errors) {
  const status = String(item.review_status || '')
  if (!status) {
    errors.push(`${item.review_id || item.standard_code || item.unit_evidence_id || 'item'} is missing review_status`)
    return
  }
  if (!args.allowApproved && approved.has(status)) {
    errors.push(`${item.review_id || item.standard_code || item.unit_evidence_id || 'item'} has approved status in a review-only packet: ${status}`)
  }
  if (!args.allowApproved && !REVIEW_ONLY_ALLOWED_STATUSES.has(status)) {
    errors.push(`${item.review_id || item.standard_code || item.unit_evidence_id || 'item'} has unsupported review-only status: ${status}`)
  }
}

function validateTags(item, fields, tagsBySubject, errors) {
  const subject = item.subject_slug || ''
  const allowed = tagsBySubject[subject] || new Set()
  for (const field of fields) {
    for (const tag of item[field] || []) {
      if (!allowed.has(tag)) {
        errors.push(`${item.review_id || item.standard_code || item.unit_evidence_id || 'item'} uses unknown topic tag for ${subject}: ${tag}`)
      }
    }
  }
}

function auditPacket(packet, taxonomy, args) {
  const errors = []
  const warnings = []
  const tagsBySubject = topicTagsBySubject(taxonomy)
  const approved = approvedStatuses(taxonomy)
  let pageMissingBridgeCandidates = 0
  const pageMissingExamples = []
  const summary = {
    unit_theme_items: packet.unit_theme_items?.length || 0,
    progression_theme_items: packet.progression_theme_items?.length || 0,
    bridge_review_candidates: packet.bridge_review_candidates?.length || 0,
    standards_without_bridge_candidates: packet.standards_without_bridge_candidates?.length || 0,
    page_ready_bridge_candidates: (packet.bridge_review_candidates || []).filter(item => item.page_ready).length,
    by_subject: {},
    by_review_status: {},
    by_page_status: {}
  }

  if (packet.purpose !== 'h4g_subject_theme_bridge_review_packet') errors.push(`Unexpected packet purpose: ${packet.purpose || 'missing'}`)
  if (packet.review_policy?.writes_public_data !== false) errors.push('Packet review_policy.writes_public_data must be false')
  if (packet.review_policy?.changes_official_standard_text !== false) errors.push('Packet review_policy.changes_official_standard_text must be false')
  if (packet.review_policy?.generated_candidates_are_approved !== false) errors.push('Packet must declare generated_candidates_are_approved=false')
  if (packet.review_policy?.eligible_for_h4g_differentiation !== false) errors.push('Packet must declare eligible_for_h4g_differentiation=false')
  if (args.requireCandidates && !summary.bridge_review_candidates) errors.push('requireCandidates is set but packet has no bridge_review_candidates')
  if (args.requirePageReadyCandidate && !summary.page_ready_bridge_candidates) errors.push('requirePageReadyCandidate is set but no bridge candidates have page evidence')

  for (const item of packet.unit_theme_items || []) {
    countInto(summary.by_subject, item.subject_slug)
    countInto(summary.by_review_status, item.review_status)
    countInto(summary.by_page_status, item.page_range_status)
    validateStatus(item, approved, args, errors)
    validateTags(item, ['suggested_topic_tags'], tagsBySubject, errors)
    if (!item.unit_evidence_id) errors.push(`${item.review_id || 'unit item'} is missing unit_evidence_id`)
    if (item.eligible_for_h4g_differentiation !== false) errors.push(`${item.review_id || item.unit_evidence_id} must keep eligible_for_h4g_differentiation=false`)
    if (item.writes_public_data !== false) errors.push(`${item.review_id || item.unit_evidence_id} must keep writes_public_data=false`)
  }

  for (const item of packet.progression_theme_items || []) {
    countInto(summary.by_subject, item.subject_slug)
    countInto(summary.by_review_status, item.review_status)
    validateStatus(item, approved, args, errors)
    validateTags(item, ['suggested_topic_tags'], tagsBySubject, errors)
    if (!item.progression_group_id) errors.push(`${item.review_id || 'progression item'} is missing progression_group_id`)
    if (!Array.isArray(item.standard_codes) || !item.standard_codes.length) warnings.push(`${item.review_id || item.progression_group_id} has no standard_codes`)
    if (item.eligible_for_h4g_differentiation !== false) errors.push(`${item.review_id || item.progression_group_id} must keep eligible_for_h4g_differentiation=false`)
    if (item.writes_public_data !== false) errors.push(`${item.review_id || item.progression_group_id} must keep writes_public_data=false`)
  }

  for (const item of packet.bridge_review_candidates || []) {
    countInto(summary.by_subject, item.subject_slug)
    countInto(summary.by_review_status, item.review_status)
    countInto(summary.by_page_status, item.page_range_status)
    validateStatus(item, approved, args, errors)
    validateTags(item, ['standard_topic_tags', 'unit_topic_tags', 'shared_topic_tags'], tagsBySubject, errors)
    if (!item.standard_code) errors.push(`${item.review_id || 'bridge candidate'} is missing standard_code`)
    if (!item.unit_evidence_id) errors.push(`${item.review_id || item.standard_code || 'bridge candidate'} is missing unit_evidence_id`)
    if (!item.shared_topic_tags?.length) errors.push(`${item.review_id || item.standard_code || item.unit_evidence_id} has no shared_topic_tags`)
    if (item.grade_band !== item.unit_grade_band) errors.push(`${item.review_id || item.standard_code || item.unit_evidence_id} is cross-grade: standard ${item.grade_band}, unit ${item.unit_grade_band}`)
    if (item.eligible_for_h4g_differentiation !== false) errors.push(`${item.review_id || item.standard_code || item.unit_evidence_id} must keep eligible_for_h4g_differentiation=false`)
    if (item.writes_public_data !== false) errors.push(`${item.review_id || item.standard_code || item.unit_evidence_id} must keep writes_public_data=false`)
    if (item.changes_official_standard_text !== false) errors.push(`${item.review_id || item.standard_code || item.unit_evidence_id} must keep changes_official_standard_text=false`)
    if (item.requires_source_review !== true) errors.push(`${item.review_id || item.standard_code || item.unit_evidence_id} must require source review`)
    if (!item.page_ready) {
      pageMissingBridgeCandidates += 1
      if (pageMissingExamples.length < 12) {
        pageMissingExamples.push(item.review_id || item.standard_code || item.unit_evidence_id)
      }
    }
  }

  if (pageMissingBridgeCandidates) {
    warnings.push(`${pageMissingBridgeCandidates} bridge review candidate(s) lack page-ready evidence; examples: ${pageMissingExamples.join(', ')}`)
  }

  summary.by_subject = Object.fromEntries(Object.entries(summary.by_subject).sort(([a], [b]) => a.localeCompare(b)))
  summary.by_review_status = Object.fromEntries(Object.entries(summary.by_review_status).sort(([a], [b]) => a.localeCompare(b)))
  summary.by_page_status = Object.fromEntries(Object.entries(summary.by_page_status).sort(([a], [b]) => a.localeCompare(b)))

  return {
    valid: errors.length === 0,
    summary,
    errors,
    warnings
  }
}

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function countRows(rows) {
  return Object.entries(rows || {})
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

function buildMarkdown(result) {
  const errors = result.errors.length ? result.errors.map(item => `- ${item}`).join('\n') : '- None'
  const warnings = result.warnings.length ? result.warnings.map(item => `- ${item}`).join('\n') : '- None'
  return `# H4G Subject Theme Bridge Packet Audit

Generated at: ${result.generated_at}

| Field | Value |
| --- | ---: |
| valid | ${result.valid} |
| unit theme items | ${result.summary.unit_theme_items} |
| progression theme items | ${result.summary.progression_theme_items} |
| bridge review candidates | ${result.summary.bridge_review_candidates} |
| page-ready bridge candidates | ${result.summary.page_ready_bridge_candidates} |
| errors | ${result.errors.length} |
| warnings | ${result.warnings.length} |

## Review Status

| Status | Count |
| --- | ---: |
${countRows(result.summary.by_review_status)}

## Page Status

| Status | Count |
| --- | ---: |
${countRows(result.summary.by_page_status)}

## Errors

${errors}

## Warnings

${warnings}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const startupErrors = []
  if (!existsSync(args.packet)) startupErrors.push(`Missing packet: ${args.packet}`)
  if (!existsSync(args.taxonomy)) startupErrors.push(`Missing taxonomy: ${args.taxonomy}`)
  const packet = startupErrors.length ? {} : readJson(args.packet)
  const taxonomy = startupErrors.length ? {} : readJson(args.taxonomy)
  const audit = startupErrors.length
    ? { valid: false, summary: {}, errors: startupErrors, warnings: [] }
    : auditPacket(packet, taxonomy, args)
  const result = {
    ...audit,
    generated_at: new Date().toISOString(),
    packet: args.packet,
    taxonomy: args.taxonomy,
    policy: {
      review_only_packet: true,
      allow_approved: args.allowApproved,
      require_candidates: args.requireCandidates,
      require_page_ready_candidate: args.requirePageReadyCandidate
    }
  }

  writeJson(args.out, result)
  if (args.summaryOut) writeText(args.summaryOut, buildMarkdown(result))
  console.log(JSON.stringify(stable(result), null, 2))
  if (args.strict && !result.valid) process.exit(1)
}

main()
