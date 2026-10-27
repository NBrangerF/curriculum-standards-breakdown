#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_anchor_domain_rejected_english_pe.md'
const TARGET_GRADE_BANDS = ['H4G7', 'H4G8', 'H4G9']

function parseArgs(argv) {
  const args = {
    batch: DEFAULT_BATCH,
    dataRoot: DEFAULT_DATA_ROOT,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--batch') args.batch = argv[++i]
    else if (item === '--data-root') args.dataRoot = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--strict') args.strict = true
    else if (item === '--require-items') args.requireItems = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/audit_h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory.js \\
  --batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch_anchor_domain_rejected_english_pe.json \\
  --data-root public/data \\
  --strict --require-items

Audits target-standard gap rows against the current public H4G inventory. This
is inventory evidence only: it does not close editable decisions, approve
bridges, write public/data, change official standard text, or enable matcher or
publication use.`)
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

function sorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== '').map(String))]
    .sort((a, b) => a.localeCompare(b))
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function markdownCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function truncate(value, max = 120) {
  const text = markdownCell(value)
  if (text.length <= max) return text
  return `${text.slice(0, max - 3)}...`
}

function countRows(rows) {
  return Object.entries(rows || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `| ${markdownCell(key)} | ${value} |`)
    .join('\n') || '| - | 0 |'
}

function validatePolicy(label, payload, errors) {
  for (const key of [
    'writes_public_data',
    'changes_official_standard_text',
    'direct_matcher_use',
    'eligible_for_h4g_differentiation',
    'matcher_ready',
    'publication_ready'
  ]) {
    if (payload[key] !== false) errors.push(`${label} ${key} must be false`)
  }
}

function subjectFiles(dataRoot) {
  const dir = join(dataRoot, 'by_subject')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(dir, file))
}

function loadPublicRecords(dataRoot, errors) {
  const bySubject = {}
  const byCode = {}
  if (!existsSync(join(dataRoot, 'by_subject'))) {
    errors.push(`Missing data root by_subject: ${dataRoot}`)
    return { byCode, bySubject }
  }
  for (const file of subjectFiles(dataRoot)) {
    const subjectSlug = basename(file, '.json')
    const payload = readJson(file)
    bySubject[subjectSlug] = payload.standards || []
    for (const record of payload.standards || []) {
      if (!record.code) errors.push(`${subjectSlug} public record missing code`)
      if (record.code && byCode[record.code]) errors.push(`duplicate public standard code: ${record.code}`)
      if (record.code) byCode[record.code] = record
    }
  }
  return { byCode, bySubject }
}

function expectedTargetCode(sourceCode, missingGradeBand) {
  return String(sourceCode || '').replace(/-H4G[789]-/, `-${missingGradeBand}-`)
}

function compactRecord(record) {
  if (!record) return null
  return {
    code: record.code || '',
    domain: record.domain || '',
    grade_band: record.grade_band || '',
    legacy_code: record.legacy_code || '',
    progression_group_id: record.progression_group_id || '',
    review_status: record.review_status || '',
    source_standard_scope: record.source_standard_scope || '',
    standard_variant_type: record.standard_variant_type || '',
    subdomain: record.subdomain || ''
  }
}

function sameGroupRecords(records, groupId) {
  return (records || [])
    .filter(record => record.progression_group_id === groupId)
    .filter(record => TARGET_GRADE_BANDS.includes(record.grade_band))
    .sort((a, b) => `${a.grade_band}|${a.code}`.localeCompare(`${b.grade_band}|${b.code}`))
}

function sameLegacyTargetRecords(records, sourceRecord, missingGradeBand) {
  if (!sourceRecord?.legacy_code) return []
  return (records || [])
    .filter(record => record.grade_band === missingGradeBand)
    .filter(record => record.legacy_code === sourceRecord.legacy_code)
    .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')))
}

function nearbyTargetGradeRecords(records, sourceRecord, missingGradeBand) {
  return (records || [])
    .filter(record => record.grade_band === missingGradeBand)
    .filter(record => record.domain === sourceRecord?.domain)
    .filter(record => record.subdomain === sourceRecord?.subdomain || record.legacy_code === sourceRecord?.legacy_code)
    .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')))
}

function inventoryStatus({ exactTargetRecord, sameGroupAtTargetGrade, sameLegacyTarget }) {
  if (exactTargetRecord) return 'target_code_exists'
  if (sameGroupAtTargetGrade.length) return 'target_grade_exists_in_same_progression_group'
  if (sameLegacyTarget.length) return 'target_grade_same_legacy_code_exists_elsewhere'
  return 'confirmed_absent_in_public_inventory'
}

function validateBatch(batch, args, errors) {
  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch') {
    errors.push('batch purpose must be h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_resolution_batch')
  }
  if (batch.worklist_only !== true) errors.push('batch worklist_only must be true')
  validatePolicy('batch', batch, errors)
  if (!Array.isArray(batch.target_standard_gap_resolution_items)) {
    errors.push('batch target_standard_gap_resolution_items must be an array')
  }
  if (args.requireItems && !(batch.target_standard_gap_resolution_items || []).length) {
    errors.push('requireItems is set but batch has no target_standard_gap_resolution_items')
  }
}

function auditItem(item, publicData, errors) {
  const subjectRecords = publicData.bySubject[item.subject_slug] || []
  const sourceRecord = publicData.byCode[item.source_standard_code || item.standard_code]
  const expectedCode = expectedTargetCode(item.source_standard_code || item.standard_code, item.missing_grade_band || item.grade_band)
  const exactTargetRecord = publicData.byCode[expectedCode]
  const groupRecords = sameGroupRecords(subjectRecords, item.progression_group_id)
  const sameGroupAtTargetGrade = groupRecords.filter(record => record.grade_band === (item.missing_grade_band || item.grade_band))
  const sameLegacyTarget = sameLegacyTargetRecords(subjectRecords, sourceRecord, item.missing_grade_band || item.grade_band)
  const nearbyTargetGrade = nearbyTargetGradeRecords(subjectRecords, sourceRecord, item.missing_grade_band || item.grade_band)
  const status = inventoryStatus({ exactTargetRecord, sameGroupAtTargetGrade, sameLegacyTarget })
  const sourceCode = item.source_standard_code || item.standard_code || ''
  const prefix = item.target_standard_gap_resolution_item_id || sourceCode || '(missing target gap inventory item)'

  if (!sourceRecord) errors.push(`${prefix} source standard ${sourceCode} not found in public data`)
  if (sourceRecord && sourceRecord.progression_group_id !== item.progression_group_id) {
    errors.push(`${prefix} source standard progression_group_id must match batch item`)
  }
  if (sourceRecord && !(item.existing_grade_bands || []).includes(sourceRecord.grade_band)) {
    errors.push(`${prefix} source standard grade_band must be one of existing_grade_bands`)
  }
  if (!item.missing_grade_band && !item.grade_band) errors.push(`${prefix} missing target grade band`)
  if (item.target_standard_code) errors.push(`${prefix} target_standard_code should be empty for inventory gap rows before redirect`)

  return {
    auto_close_allowed: false,
    batch_item_id: item.target_standard_gap_resolution_item_id || '',
    exact_target_code: expectedCode,
    exact_target_code_exists: Boolean(exactTargetRecord),
    exact_target_record: compactRecord(exactTargetRecord),
    existing_grade_bands_in_batch: item.existing_grade_bands || [],
    inventory_evidence_only: true,
    inventory_status: status,
    manual_confirmation_required: true,
    missing_grade_band: item.missing_grade_band || item.grade_band || '',
    nearby_target_grade_records: nearbyTargetGrade.map(compactRecord),
    priority_rank: item.priority_rank,
    priority_tier: item.priority_tier || '',
    progression_group_id: item.progression_group_id || '',
    public_same_group_grade_bands: sorted(groupRecords.map(record => record.grade_band)),
    public_same_group_records: groupRecords.map(compactRecord),
    recommended_reviewer_decision: status === 'confirmed_absent_in_public_inventory'
      ? 'target_standard_gap_confirmed'
      : 'target_standard_exists_elsewhere',
    source_record: compactRecord(sourceRecord),
    source_standard_code: sourceCode,
    subject_slug: item.subject_slug || '',
    target_grade_same_legacy_code_records: sameLegacyTarget.map(compactRecord),
    target_grade_same_legacy_code_records_count: sameLegacyTarget.length,
    target_grade_same_progression_group_records: sameGroupAtTargetGrade.map(compactRecord),
    target_grade_same_progression_group_records_count: sameGroupAtTargetGrade.length,
    writes_public_data: false
  }
}

function buildItems(batch, publicData, errors) {
  return (batch.target_standard_gap_resolution_items || [])
    .map(item => auditItem(item, publicData, errors))
    .sort((a, b) => {
      const priority = Number(a.priority_rank || 9999) - Number(b.priority_rank || 9999)
      if (priority) return priority
      return `${a.subject_slug}|${a.progression_group_id}|${a.missing_grade_band}|${a.source_standard_code}`
        .localeCompare(`${b.subject_slug}|${b.progression_group_id}|${b.missing_grade_band}|${b.source_standard_code}`)
    })
}

function summarize(items) {
  const summary = {
    auto_close_allowed_items: 0,
    by_inventory_status: {},
    by_missing_grade_band: {},
    by_recommendation: {},
    by_source_standard_code: {},
    by_subject: {},
    confirmed_absent_items: 0,
    exact_target_code_exists_items: 0,
    inventory_items: items.length,
    manual_confirmation_required_items: 0,
    target_exists_elsewhere_items: 0
  }
  for (const item of items) {
    if (item.auto_close_allowed) summary.auto_close_allowed_items += 1
    if (item.manual_confirmation_required) summary.manual_confirmation_required_items += 1
    if (item.exact_target_code_exists) summary.exact_target_code_exists_items += 1
    if (item.inventory_status === 'confirmed_absent_in_public_inventory') summary.confirmed_absent_items += 1
    else summary.target_exists_elsewhere_items += 1
    countInto(summary.by_inventory_status, item.inventory_status)
    countInto(summary.by_missing_grade_band, item.missing_grade_band)
    countInto(summary.by_recommendation, item.recommended_reviewer_decision)
    countInto(summary.by_source_standard_code, item.source_standard_code)
    countInto(summary.by_subject, item.subject_slug)
  }
  return summary
}

function itemRows(items) {
  return items.map(item => (
    `| ${item.priority_rank} | ${markdownCell(item.subject_slug)} | ${markdownCell(item.missing_grade_band)} | ${markdownCell(item.source_standard_code)} | ${markdownCell(item.exact_target_code)} | ${item.exact_target_code_exists} | ${markdownCell(item.inventory_status)} | ${markdownCell(item.public_same_group_grade_bands.join(','))} | ${item.target_grade_same_legacy_code_records_count} |`
  )).join('\n') || '| - | - | - | - | - | false | - | - | 0 |'
}

function recordRows(items) {
  return items.map(item => (
    `| ${markdownCell(item.source_standard_code)} | ${markdownCell(item.source_record?.grade_band)} | ${markdownCell(item.source_record?.progression_group_id)} | ${markdownCell(item.source_record?.legacy_code)} | ${truncate(item.source_record?.subdomain)} |`
  )).join('\n') || '| - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Target Standard Gap Inventory Audit

Generated at: ${payload.generated_at}

This audit checks target-standard gap rows against the current public H4G
inventory. It provides inventory evidence only; it does not close editable
decisions, approve bridges, write \`public/data\`, change official standard text,
or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| inventory items | ${payload.summary.inventory_items} |
| confirmed absent items | ${payload.summary.confirmed_absent_items} |
| exact target code exists items | ${payload.summary.exact_target_code_exists_items} |
| target exists elsewhere items | ${payload.summary.target_exists_elsewhere_items} |
| manual confirmation required items | ${payload.summary.manual_confirmation_required_items} |
| auto-close allowed items | ${payload.summary.auto_close_allowed_items} |

## Inventory Status

| status | rows |
| --- | ---: |
${countRows(payload.summary.by_inventory_status)}

## Items

| rank | subject | missing grade | source standard | expected target code | target exists | status | same-group grades | same-legacy target records |
| ---: | --- | --- | --- | --- | ---: | --- | --- | ---: |
${itemRows(payload.inventory_items)}

## Source Records

| source standard | grade | progression group | legacy code | subdomain |
| --- | --- | --- | --- | --- |
${recordRows(payload.inventory_items)}

## Guardrails

- This is inventory evidence, not a reviewer decision.
- Every row still requires manual confirmation in the editable downstream action decision template.
- Matcher and publication gates remain separate later steps.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function audit(args) {
  const errors = []
  if (!existsSync(args.batch)) errors.push(`Missing batch: ${args.batch}`)
  const batch = existsSync(args.batch) ? readJson(args.batch) : { target_standard_gap_resolution_items: [] }
  if (!errors.length) validateBatch(batch, args, errors)
  const publicData = loadPublicRecords(args.dataRoot, errors)
  const items = buildItems(batch, publicData, errors)
  const summary = summarize(items)
  if (args.requireItems && !items.length) errors.push('requireItems is set but no inventory items were generated')
  return {
    batch: args.batch,
    changes_official_standard_text: false,
    data_root: args.dataRoot,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    inventory_evidence_only: true,
    inventory_items: items,
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_target_standard_gap_inventory_audit',
    require_items: args.requireItems,
    summary,
    valid: errors.length === 0,
    writes_public_data: false
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const payload = audit(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
