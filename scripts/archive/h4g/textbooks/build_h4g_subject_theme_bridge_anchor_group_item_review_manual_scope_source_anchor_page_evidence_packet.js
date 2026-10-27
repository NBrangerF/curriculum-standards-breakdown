#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_DECISIONS = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json'
const DEFAULT_FALLBACK_UNIT_INDEX = 'generated/textbook_evidence/h4g_after_p2_page_recovery_unit_index.json'
const DEFAULT_PDF_CACHE_DIR = 'generated/textbook_evidence/pdf_cache'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_page_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_page_evidence_packet_anchor_domain_rejected_english_pe.md'

function parseArgs(argv) {
  const args = {
    decisions: DEFAULT_DECISIONS,
    excerptChars: 1200,
    fallbackUnitIndex: DEFAULT_FALLBACK_UNIT_INDEX,
    maxPagesPerItem: 3,
    out: DEFAULT_OUT,
    pdfCacheDir: DEFAULT_PDF_CACHE_DIR,
    python: process.env.PYTHON || 'python3',
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--decisions') args.decisions = argv[++i]
    else if (item === '--fallback-unit-index') args.fallbackUnitIndex = argv[++i]
    else if (item === '--pdf-cache-dir') args.pdfCacheDir = argv[++i]
    else if (item === '--python') args.python = argv[++i]
    else if (item === '--max-pages-per-item') args.maxPagesPerItem = Number(argv[++i]) || args.maxPagesPerItem
    else if (item === '--excerpt-chars') args.excerptChars = Number(argv[++i]) || args.excerptChars
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_page_evidence_packet.js \\
  --decisions generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_decisions_template_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a read-only page evidence packet for manual-scope source-anchor review
decisions. It extracts short text excerpts from locally cached PDF pages using
Python pypdf. The packet is reviewer evidence only; it does not approve source
anchors, write public/data, change official standard text, or enable matcher or
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

function hashText(value, length = 14) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
}

function sorted(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== '').map(String))]
    .sort((a, b) => a.localeCompare(b))
}

function uniqueStrings(values) {
  const seen = new Set()
  const out = []
  for (const value of values || []) {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
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

function validateDecisions(decisions, args, errors) {
  if (decisions.valid !== true) errors.push('decisions valid must be true')
  if (decisions.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_review_decisions_template') {
    errors.push('decisions purpose mismatch')
  }
  validatePolicy('decisions', decisions, errors)
  if (!Array.isArray(decisions.manual_scope_source_anchor_review_decisions)) {
    errors.push('decisions manual_scope_source_anchor_review_decisions must be an array')
  }
  if (args.requireItems && !(decisions.manual_scope_source_anchor_review_decisions || []).length) {
    errors.push('requireItems is set but decisions has no rows')
  }
}

function packetPolicy() {
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    page_evidence_packet_is_not_review_decision: true,
    publication_ready: false,
    requires_later_manual_source_anchor_decision: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    writes_public_data: false
  }
}

function loadUnitIndex(path, cache, errors) {
  if (!path) return { rows: new Map(), source: '' }
  if (cache.has(path)) return cache.get(path)
  if (!existsSync(path)) {
    errors.push(`Missing unit index: ${path}`)
    const empty = { rows: new Map(), source: path }
    cache.set(path, empty)
    return empty
  }
  const payload = readJson(path)
  const rows = new Map((payload.unit_candidates || []).map(row => [row.unit_evidence_id, row]))
  const result = { rows, source: path }
  cache.set(path, result)
  return result
}

function unitIndexRowFor(decision, args, cache, errors) {
  const paths = uniqueStrings([
    decision.unit_context?.source_unit_index || '',
    args.fallbackUnitIndex
  ])
  for (const path of paths) {
    const index = loadUnitIndex(path, cache, errors)
    const row = index.rows.get(decision.unit_evidence_id)
    if (row) return { row, source_unit_index: path }
  }
  return { row: null, source_unit_index: paths[0] || '' }
}

function parsePageRange(value) {
  const text = String(value || '').trim()
  const range = text.match(/^(\d+)\s*-\s*(\d+)$/)
  if (range) {
    const start = Number(range[1])
    const end = Number(range[2])
    if (Number.isInteger(start) && Number.isInteger(end) && end >= start) return { start, end, count: end - start + 1 }
  }
  const single = text.match(/^(\d+)$/)
  if (single) {
    const start = Number(single[1])
    return { start, end: start, count: 1 }
  }
  return { start: null, end: null, count: 1 }
}

function selectPages(decision, unitRow, args) {
  const overridePage = unitRow?.page_start_override?.evidence?.pdf_page
  const bodyPdfPage = unitRow?.body_pdf_page
  const pdfPageHint = unitRow?.pdf_page_hint
  const pdfStart = Number(overridePage || bodyPdfPage || pdfPageHint || 0)
  const pageRange = parsePageRange(decision.page_range || unitRow?.page_range)
  const count = Math.max(1, Math.min(args.maxPagesPerItem, pageRange.count || 1))
  const pages = Number.isInteger(pdfStart) && pdfStart > 0
    ? Array.from({ length: count }, (_, index) => pdfStart + index)
    : []
  const printedStart = Number(pageRange.start || unitRow?.page_start || decision.unit_context?.page_start || 0)
  const pageHintSource = overridePage
    ? 'page_start_override_body_pdf_page'
    : bodyPdfPage
      ? 'unit_index_body_pdf_page'
      : pdfPageHint
        ? 'unit_index_pdf_page_hint'
        : 'missing_pdf_page_hint'
  return {
    page_hint_source: pageHintSource,
    page_range: pageRange,
    pages: pages.map((pdfPage, index) => ({
      pdf_page: pdfPage,
      printed_page_estimate: printedStart ? printedStart + index : null
    }))
  }
}

function extractPdfPages(python, pdfPath, pages, excerptChars) {
  if (!pages.length) return { ok: true, pages: [] }
  const code = `
import json, sys
from pypdf import PdfReader
pdf_path = sys.argv[1]
pages = [int(x) for x in sys.argv[2].split(',') if x]
excerpt_chars = int(sys.argv[3])
reader = PdfReader(pdf_path)
out = []
for page in pages:
    if page < 1 or page > len(reader.pages):
        out.append({"pdf_page": page, "status": "page_out_of_range", "text_chars": 0, "text_excerpt": ""})
        continue
    try:
        text = reader.pages[page - 1].extract_text() or ""
        normalized = " ".join(text.split())
        out.append({
            "pdf_page": page,
            "status": "text_extracted" if normalized else "empty_text",
            "text_chars": len(normalized),
            "text_excerpt": normalized[:excerpt_chars]
        })
    except Exception as exc:
        out.append({"pdf_page": page, "status": "extract_failed", "text_chars": 0, "text_excerpt": "", "error": str(exc)})
print(json.dumps({"ok": True, "total_pages": len(reader.pages), "pages": out}, ensure_ascii=False))
`
  try {
    return JSON.parse(execFileSync(python, ['-c', code, pdfPath, pages.join(','), String(excerptChars)], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 24
    }))
  } catch (error) {
    return {
      error: String(error?.stderr || error?.message || error),
      ok: false,
      pages: pages.map(page => ({ pdf_page: page, status: 'extract_failed', text_chars: 0, text_excerpt: '' }))
    }
  }
}

function packetItemId(decision) {
  return `h4g_anchor_group_manual_scope_source_anchor_page_evidence_${hashText(decision.decision_id)}`
}

function rowStatus(row) {
  if (!row.unit_index_found) return 'missing_unit_index'
  if (!row.pdf_cache_found) return 'missing_pdf_cache'
  if (!row.pdf_pages.length) return 'missing_pdf_page_hint'
  if (row.page_text_excerpts.some(page => page.status === 'extract_failed')) return 'extract_failed'
  if (row.page_text_excerpts.some(page => page.status === 'text_extracted' && page.text_chars > 0)) return 'text_extracted'
  return 'empty_text'
}

function buildRows(decisions, args, errors) {
  const unitIndexCache = new Map()
  const pagePlans = []
  const pdfPages = new Map()
  for (const decision of decisions.manual_scope_source_anchor_review_decisions || []) {
    const { row: unitRow, source_unit_index: sourceUnitIndex } = unitIndexRowFor(decision, args, unitIndexCache, errors)
    const selection = selectPages(decision, unitRow, args)
    const textbookEvidenceId = decision.unit_context?.textbook_evidence_id || unitRow?.textbook_evidence_id || ''
    const pdfPath = textbookEvidenceId ? join(args.pdfCacheDir, `${textbookEvidenceId}.pdf`) : ''
    const plan = { decision, pdfPath, selection, sourceUnitIndex, unitRow, textbookEvidenceId }
    pagePlans.push(plan)
    if (pdfPath && existsSync(pdfPath)) {
      if (!pdfPages.has(pdfPath)) pdfPages.set(pdfPath, new Set())
      for (const page of selection.pages) pdfPages.get(pdfPath).add(page.pdf_page)
    }
  }

  const extractedByPdf = new Map()
  for (const [pdfPath, pages] of pdfPages.entries()) {
    const sortedPages = [...pages].sort((a, b) => a - b)
    const extracted = extractPdfPages(args.python, pdfPath, sortedPages, args.excerptChars)
    extractedByPdf.set(pdfPath, new Map((extracted.pages || []).map(page => [page.pdf_page, page])))
  }

  return pagePlans.map(plan => {
    const pdfMap = extractedByPdf.get(plan.pdfPath) || new Map()
    const excerpts = plan.selection.pages.map(page => ({
      ...page,
      ...(pdfMap.get(page.pdf_page) || { status: 'missing_extraction', text_chars: 0, text_excerpt: '' })
    }))
    const row = {
      changes_official_standard_text: false,
      decision_status: plan.decision.decision_status || '',
      direct_matcher_use: false,
      eligible_for_h4g_differentiation: false,
      evidence_packet_item_id: packetItemId(plan.decision),
      evidence_packet_only: true,
      extraction_tool: 'python:pypdf',
      grade_band: plan.decision.target_grade_band || plan.decision.grade_band || '',
      inventory_item_id: plan.decision.inventory_item_id || '',
      item_review_decision_id: plan.decision.item_review_decision_id || '',
      manual_review_required: true,
      manual_scope_source_anchor_evidence_item_id: plan.decision.manual_scope_source_anchor_evidence_item_id || '',
      matcher_ready: false,
      page_evidence_policy: packetPolicy(),
      page_hint_source: plan.selection.page_hint_source,
      page_range: plan.decision.page_range || '',
      page_range_status: plan.decision.page_range_status || '',
      page_text_excerpts: excerpts,
      pdf_cache_found: Boolean(plan.pdfPath && existsSync(plan.pdfPath)),
      pdf_cache_path: plan.pdfPath || '',
      pdf_pages: plan.selection.pages.map(page => page.pdf_page),
      publication_ready: false,
      repository_path: plan.decision.repository_path || '',
      review_lane: plan.decision.review_lane || '',
      reviewer_decision: plan.decision.reviewer_decision || '',
      reviewer_warning: 'Page text is reviewer evidence only. It is not an approval and may still be TOC-derived or page-start-only evidence.',
      source_manual_scope_source_anchor_review_decision_id: plan.decision.decision_id || '',
      source_manual_scope_source_anchor_review_work_item_id: plan.decision.source_manual_scope_source_anchor_review_work_item_id || '',
      source_unit_index: plan.sourceUnitIndex,
      subject_slug: plan.decision.subject_slug || '',
      target_standard_code: plan.decision.target_standard_code || '',
      textbook_evidence_id: plan.textbookEvidenceId,
      unit_evidence_id: plan.decision.unit_evidence_id || '',
      unit_index_found: Boolean(plan.unitRow),
      unit_index_page_start_override: plan.unitRow?.page_start_override || null,
      unit_title: plan.decision.unit_title || '',
      writes_public_data: false
    }
    row.page_evidence_status = rowStatus(row)
    row.ready_for_manual_review = row.page_evidence_status === 'text_extracted'
    return row
  }).sort((a, b) => String(a.subject_slug).localeCompare(String(b.subject_slug)) ||
    String(a.target_standard_code).localeCompare(String(b.target_standard_code)) ||
    String(a.unit_evidence_id).localeCompare(String(b.unit_evidence_id)) ||
    String(a.source_manual_scope_source_anchor_review_decision_id).localeCompare(String(b.source_manual_scope_source_anchor_review_decision_id)))
}

function summarize(rows) {
  const summary = {
    by_grade_band: {},
    by_page_evidence_status: {},
    by_page_hint_source: {},
    by_page_range_status: {},
    by_review_lane: {},
    by_subject: {},
    by_target_standard_code: {},
    page_evidence_items: rows.length,
    ready_for_manual_review_rows: 0,
    text_extracted_rows: 0,
    unique_review_decisions: sorted(rows.map(row => row.source_manual_scope_source_anchor_review_decision_id)).length,
    unique_textbook_evidence_ids: sorted(rows.map(row => row.textbook_evidence_id)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    if (row.ready_for_manual_review) summary.ready_for_manual_review_rows += 1
    if (row.page_evidence_status === 'text_extracted') summary.text_extracted_rows += 1
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_page_evidence_status, row.page_evidence_status)
    countInto(summary.by_page_hint_source, row.page_hint_source)
    countInto(summary.by_page_range_status, row.page_range_status)
    countInto(summary.by_review_lane, row.review_lane)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_standard_code, row.target_standard_code)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.target_standard_code)} | ${markdownCell(row.page_evidence_status)} | ${markdownCell(row.page_hint_source)} | ${markdownCell(row.pdf_pages.join(','))} | ${truncate(row.unit_title)} |`
  )).join('\n') || '| - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Manual Scope Source-Anchor Page Evidence Packet

Generated at: ${payload.generated_at}

This read-only packet extracts short local PDF page text excerpts for manual
source-anchor review decisions. It does not approve source anchors, edit
decisions, write \`public/data\`, change official standard text, or enable
matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| page evidence items | ${payload.summary.page_evidence_items} |
| text extracted rows | ${payload.summary.text_extracted_rows} |
| ready for manual review rows | ${payload.summary.ready_for_manual_review_rows} |
| unique review decisions | ${payload.summary.unique_review_decisions} |
| unique textbook ids | ${payload.summary.unique_textbook_evidence_ids} |
| unique unit ids | ${payload.summary.unique_unit_evidence_ids} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Evidence Status

| status | rows |
| --- | ---: |
${countRows(payload.summary.by_page_evidence_status)}

## Page Hint Sources

| source | rows |
| --- | ---: |
${countRows(payload.summary.by_page_hint_source)}

## Preview

| subject | grade | target standard | status | page hint source | PDF pages | unit title |
| --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.page_evidence_items)}

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  if (!existsSync(args.decisions)) errors.push(`Missing decisions: ${args.decisions}`)
  const decisions = errors.length ? { manual_scope_source_anchor_review_decisions: [] } : readJson(args.decisions)
  if (!errors.length) validateDecisions(decisions, args, errors)
  const rows = buildRows(decisions, args, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no page evidence rows were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    matcher_ready: false,
    page_evidence_items: rows,
    page_evidence_packet_only: true,
    page_evidence_policy: packetPolicy(),
    pdf_cache_dir: args.pdfCacheDir,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_manual_scope_source_anchor_page_evidence_packet',
    source_manual_scope_source_anchor_review_decisions: args.decisions,
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
  console.log(JSON.stringify(stable({
    changes_official_standard_text: payload.changes_official_standard_text,
    direct_matcher_use: payload.direct_matcher_use,
    eligible_for_h4g_differentiation: payload.eligible_for_h4g_differentiation,
    errors: payload.errors,
    generated_at: payload.generated_at,
    matcher_ready: payload.matcher_ready,
    out: args.out,
    page_evidence_packet_only: payload.page_evidence_packet_only,
    publication_ready: payload.publication_ready,
    summary: payload.summary,
    summary_out: args.summaryOut,
    valid: payload.valid,
    writes_public_data: payload.writes_public_data
  }), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
