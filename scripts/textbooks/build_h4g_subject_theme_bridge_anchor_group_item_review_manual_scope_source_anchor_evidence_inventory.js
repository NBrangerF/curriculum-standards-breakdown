#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_BATCH = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.json'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_inventory_anchor_domain_rejected_english_pe.md'

function parseArgs(argv) {
  const args = {
    batch: DEFAULT_BATCH,
    out: DEFAULT_OUT,
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--batch') args.batch = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_inventory.js \\
  --batch generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_batch_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a read-only inventory for manual-scope source-anchor evidence review
rows. It profiles title, page-boundary, source-target text, and unit fanout
risk only; it does not edit decisions, approve bridges, write public/data, or
enable matcher/publication use.`)
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

function hashText(value, length = 14) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
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

function truncate(value, max = 96) {
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

function validateBatch(batch, args, errors) {
  if (batch.valid !== true) errors.push('batch valid must be true')
  if (batch.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_batch') {
    errors.push('batch purpose mismatch')
  }
  if (batch.worklist_only !== true) errors.push('batch worklist_only must be true')
  if (batch.selection?.page_ready_only !== true) errors.push('batch selection.page_ready_only must be true')
  validatePolicy('batch', batch, errors)
  if (!Array.isArray(batch.manual_scope_source_anchor_evidence_items)) {
    errors.push('batch manual_scope_source_anchor_evidence_items must be an array')
  }
  if (args.requireItems && !(batch.manual_scope_source_anchor_evidence_items || []).length) {
    errors.push('requireItems is set but batch has no manual_scope_source_anchor_evidence_items')
  }
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function titleRiskTerms(title) {
  const normalized = normalizeText(title)
  const terms = []
  if (!normalized) terms.push('missing_unit_title')
  if (/language in use/i.test(title || '')) terms.push('generic_language_in_use_title')
  if (/理论知识/.test(title || '')) terms.push('broad_theory_knowledge_title')
  if (/足球\s*$/.test(title || '')) terms.push('broad_sport_chapter_title')
  if (/^unit\s+\d+\s*$/i.test(normalized)) terms.push('unit_number_only_title')
  return sorted(terms)
}

function buildFanoutMaps(rows) {
  const unitRows = new Map()
  const titleRows = new Map()
  for (const row of rows) {
    const unitKey = row.unit_evidence_id || ''
    const titleKey = normalizeText(row.unit_title)
    if (unitKey) {
      if (!unitRows.has(unitKey)) unitRows.set(unitKey, [])
      unitRows.get(unitKey).push(row)
    }
    if (titleKey) {
      if (!titleRows.has(titleKey)) titleRows.set(titleKey, [])
      titleRows.get(titleKey).push(row)
    }
  }
  return { titleRows, unitRows }
}

function riskProfile(row, context) {
  const unitRows = context.unitRows.get(row.unit_evidence_id || '') || []
  const titleRows = context.titleRows.get(normalizeText(row.unit_title)) || []
  const sourceStandard = normalizeText(row.source_standard_context?.standard)
  const targetStandard = normalizeText(row.target_standard_context?.standard)
  const terms = titleRiskTerms(row.unit_title || '')
  const unitTargetCodes = sorted(unitRows.map(item => item.target_standard_code))
  const unitItemDecisionIds = sorted(unitRows.map(item => item.item_review_decision_id))
  const titleTargetCodes = sorted(titleRows.map(item => item.target_standard_code))
  const profile = {
    generic_title_terms: terms,
    has_generic_or_broad_title: terms.length > 0,
    has_non_unit_level_grain: !['unit'].includes(row.unit_context?.unit_level || ''),
    has_page_start_only_boundary: row.page_range_status === 'toc_page_start_only',
    has_reused_unit_across_item_decisions: unitItemDecisionIds.length > 1,
    has_reused_unit_across_target_standards: unitTargetCodes.length > 1,
    has_reused_title_across_target_standards: titleTargetCodes.length > 1,
    has_source_target_standard_text_identical: Boolean(sourceStandard && targetStandard && sourceStandard === targetStandard),
    source_target_progression_pair: `${row.source_standard_context?.progression_role || 'missing'}->${row.target_standard_context?.progression_role || 'missing'}`,
    target_source_scope: row.target_standard_context?.source_standard_scope || '',
    title_candidate_rows: titleRows.length,
    title_target_standard_count: titleTargetCodes.length,
    unit_candidate_rows: unitRows.length,
    unit_item_decision_count: unitItemDecisionIds.length,
    unit_level: row.unit_context?.unit_level || '',
    unit_target_standard_count: unitTargetCodes.length
  }
  profile.risk_score = [
    profile.has_generic_or_broad_title,
    profile.has_non_unit_level_grain,
    profile.has_page_start_only_boundary,
    profile.has_reused_unit_across_item_decisions,
    profile.has_reused_unit_across_target_standards,
    profile.has_reused_title_across_target_standards,
    profile.has_source_target_standard_text_identical,
    profile.target_source_scope === 'stage_shared_7_9'
  ].filter(Boolean).length + terms.length
  return profile
}

function riskSignals(profile) {
  const signals = []
  for (const term of profile.generic_title_terms || []) signals.push(`generic_title:${term}`)
  if (profile.has_non_unit_level_grain) signals.push(`non_unit_level:${profile.unit_level || 'missing'}`)
  if (profile.has_page_start_only_boundary) signals.push('page_boundary_start_only')
  if (profile.has_reused_unit_across_item_decisions) signals.push(`unit_reused_across_item_decisions:${profile.unit_item_decision_count}`)
  if (profile.has_reused_unit_across_target_standards) signals.push(`unit_reused_across_target_standards:${profile.unit_target_standard_count}`)
  if (profile.has_reused_title_across_target_standards) signals.push(`title_reused_across_target_standards:${profile.title_target_standard_count}`)
  if (profile.has_source_target_standard_text_identical) signals.push('source_target_standard_text_identical')
  if (profile.target_source_scope === 'stage_shared_7_9') signals.push('target_standard_scope_stage_shared_7_9')
  return sorted(signals)
}

function primaryReviewBucket(profile) {
  if (profile.has_generic_or_broad_title) return 'generic_or_broad_title_exact_anchor_review'
  if (profile.has_reused_unit_across_target_standards || profile.has_reused_title_across_target_standards) {
    return 'unit_or_title_fanout_exact_anchor_review'
  }
  if (profile.has_source_target_standard_text_identical) return 'source_target_identical_text_grade_specific_review'
  if (profile.has_non_unit_level_grain) return 'non_unit_level_grain_review'
  if (profile.has_page_start_only_boundary) return 'toc_start_only_page_boundary_review'
  return 'manual_exact_anchor_review_required'
}

function recommendedDisposition(profile) {
  if (profile.has_generic_or_broad_title) return 'title_too_generic_requires_exact_activity_evidence'
  if (profile.has_reused_unit_across_target_standards || profile.has_reused_title_across_target_standards) {
    return 'unit_fanout_requires_target_specific_evidence'
  }
  if (profile.has_source_target_standard_text_identical) return 'shared_standard_text_requires_grade_specific_anchor'
  if (profile.has_non_unit_level_grain) return 'non_unit_level_requires_source_grain_confirmation'
  if (profile.has_page_start_only_boundary) return 'page_boundary_requires_reviewer_confirmation'
  return 'exact_anchor_evidence_not_yet_verified'
}

function inventoryPolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    inventory_is_not_reviewer_decision: true,
    manual_scope_source_anchor_inventory_only: true,
    matcher_ready: false,
    publication_ready: false,
    requires_later_item_level_source_review: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    requires_manual_source_anchor_review: true,
    source_anchor_evidence_row_must_be_reviewed_separately: true,
    writes_public_data: false
  }
}

function buildRows(batch) {
  const sourceRows = batch.manual_scope_source_anchor_evidence_items || []
  const context = buildFanoutMaps(sourceRows)
  return sourceRows.map(row => {
    const profile = riskProfile(row, context)
    return {
      anchor_type: row.anchor_type || '',
      decision_type: 'anchor_group_manual_scope_source_anchor_evidence_inventory_item',
      grade_band: row.grade_band || '',
      inventory_item_id: `h4g_anchor_group_manual_scope_source_anchor_inventory_${hashText(row.manual_scope_source_anchor_evidence_item_id)}`,
      inventory_policy: inventoryPolicy(),
      item_review_decision_id: row.item_review_decision_id || '',
      item_review_surface: row.item_review_surface || '',
      manual_scope_indexing_item_id: row.manual_scope_indexing_item_id || '',
      manual_scope_source_anchor_evidence_item_id: row.manual_scope_source_anchor_evidence_item_id || '',
      page_range: row.page_range || '',
      page_range_status: row.page_range_status || '',
      page_ready: row.page_ready === true,
      parent_downstream_decision_id: row.parent_downstream_decision_id || '',
      primary_review_bucket: primaryReviewBucket(profile),
      priority_rank: row.priority_rank,
      priority_tier: row.priority_tier || '',
      progression_group_id: row.progression_group_id || '',
      recommended_disposition: recommendedDisposition(profile),
      review_grain: row.review_grain || '',
      risk_profile: profile,
      risk_signals: riskSignals(profile),
      source_item_standard_code: row.source_item_standard_code || '',
      source_key: row.source_key || '',
      source_standard_summary: {
        code: row.source_standard_context?.code || '',
        domain: row.source_standard_context?.domain || '',
        grade_band: row.source_standard_context?.grade_band || '',
        practice: row.source_standard_context?.practice || '',
        progression_role: row.source_standard_context?.progression_role || '',
        standard: row.source_standard_context?.standard || '',
        subdomain: row.source_standard_context?.subdomain || ''
      },
      standard_code: row.standard_code || '',
      subject_slug: row.subject_slug || '',
      target_grade_band: row.target_grade_band || '',
      target_standard_code: row.target_standard_code || '',
      target_standard_summary: {
        code: row.target_standard_context?.code || '',
        domain: row.target_standard_context?.domain || '',
        grade_band: row.target_standard_context?.grade_band || '',
        practice: row.target_standard_context?.practice || '',
        progression_role: row.target_standard_context?.progression_role || '',
        source_standard_scope: row.target_standard_context?.source_standard_scope || '',
        standard: row.target_standard_context?.standard || '',
        subdomain: row.target_standard_context?.subdomain || ''
      },
      unit_context: row.unit_context || {},
      unit_evidence_id: row.unit_evidence_id || '',
      unit_level: row.unit_context?.unit_level || '',
      unit_title: row.unit_title || '',
      writes_public_data: false
    }
  })
}

function summarize(rows) {
  const summary = {
    by_grade_band: {},
    by_page_range_status: {},
    by_primary_review_bucket: {},
    by_recommended_disposition: {},
    by_subject: {},
    by_target_standard_code: {},
    by_unit_level: {},
    generic_or_broad_title_rows: 0,
    high_risk_rows: 0,
    inventory_items: rows.length,
    manual_review_required_rows: rows.length,
    non_unit_level_rows: 0,
    page_start_only_rows: 0,
    reused_unit_across_target_rows: 0,
    source_anchor_evidence_items: rows.length,
    source_target_identical_text_rows: 0,
    unique_item_review_decisions: sorted(rows.map(row => row.item_review_decision_id)).length,
    unique_parent_downstream_decisions: sorted(rows.map(row => row.parent_downstream_decision_id)).length,
    unique_source_keys: sorted(rows.map(row => row.source_key)).length,
    unique_target_standard_codes: sorted(rows.map(row => row.target_standard_code)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    const profile = row.risk_profile || {}
    if (profile.has_generic_or_broad_title) summary.generic_or_broad_title_rows += 1
    if (profile.has_non_unit_level_grain) summary.non_unit_level_rows += 1
    if (profile.has_page_start_only_boundary) summary.page_start_only_rows += 1
    if (profile.has_reused_unit_across_target_standards) summary.reused_unit_across_target_rows += 1
    if (profile.has_source_target_standard_text_identical) summary.source_target_identical_text_rows += 1
    if (Number(profile.risk_score || 0) >= 4) summary.high_risk_rows += 1
    countInto(summary.by_grade_band, row.target_grade_band || row.grade_band)
    countInto(summary.by_page_range_status, row.page_range_status)
    countInto(summary.by_primary_review_bucket, row.primary_review_bucket)
    countInto(summary.by_recommended_disposition, row.recommended_disposition)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_standard_code, row.target_standard_code)
    countInto(summary.by_unit_level, row.unit_level)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${row.priority_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.target_grade_band)} | ${markdownCell(row.target_standard_code)} | ${markdownCell(row.primary_review_bucket)} | ${markdownCell(row.unit_evidence_id)} | ${truncate(row.unit_title)} |`
  )).join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Manual Scope Source-Anchor Evidence Inventory

Generated at: ${payload.generated_at}

This read-only inventory profiles manual-scope source-anchor evidence review
rows before any reviewer outcome is written. It flags generic title, unit
fanout, page-boundary, and shared-standard-text risks only. It does not edit
item decisions, approve bridges, write \`public/data\`, change official standard
text, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| inventory items | ${payload.summary.inventory_items} |
| manual review required rows | ${payload.summary.manual_review_required_rows} |
| generic or broad title rows | ${payload.summary.generic_or_broad_title_rows} |
| reused unit across target rows | ${payload.summary.reused_unit_across_target_rows} |
| source-target identical text rows | ${payload.summary.source_target_identical_text_rows} |
| page start-only rows | ${payload.summary.page_start_only_rows} |
| high risk rows | ${payload.summary.high_risk_rows} |
| unique target standards | ${payload.summary.unique_target_standard_codes} |
| unique unit evidence ids | ${payload.summary.unique_unit_evidence_ids} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Review Buckets

| bucket | rows |
| --- | ---: |
${countRows(payload.summary.by_primary_review_bucket)}

## Dispositions

| disposition | rows |
| --- | ---: |
${countRows(payload.summary.by_recommended_disposition)}

## Target Standards

| target standard | rows |
| --- | ---: |
${countRows(payload.summary.by_target_standard_code)}

## Preview

| rank | subject | grade | target standard | review bucket | unit evidence | unit title |
| ---: | --- | --- | --- | --- | --- | --- |
${previewRows(payload.inventory_items)}

## Guardrails

- Inventory rows are not reviewer decisions.
- Every row still requires manual source-anchor review before item-level, matcher, or publication gates.
- Public data, official standard text, matcher, and publication remain disabled.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  if (!existsSync(args.batch)) errors.push(`Missing batch: ${args.batch}`)
  const batch = errors.length ? { manual_scope_source_anchor_evidence_items: [] } : readJson(args.batch)
  if (!errors.length) validateBatch(batch, args, errors)
  const rows = buildRows(batch)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no inventory rows were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    evidence_inventory_only: true,
    generated_at: new Date().toISOString(),
    inventory_items: rows,
    inventory_policy: inventoryPolicy(),
    matcher_ready: false,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_evidence_inventory',
    source_manual_scope_source_anchor_evidence_batch: args.batch,
    summary: summarize(rows),
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
  const payload = buildPayload(args)
  writeJson(args.out, payload)
  if (args.summaryOut) writeText(args.summaryOut, markdownSummary(payload))
  console.log(JSON.stringify(stable(payload), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
