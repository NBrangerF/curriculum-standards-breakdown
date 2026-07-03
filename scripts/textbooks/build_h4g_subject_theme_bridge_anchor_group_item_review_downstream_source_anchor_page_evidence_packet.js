#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_UNIT_INDEXES = [
  'generated/textbook_evidence/h4g_after_p2_page_recovery_unit_index.json',
  'generated/textbook_evidence/h4g_theme_bridge_r1_page_override_unit_index.json',
  'generated/textbook_evidence/h4g_theme_bridge_remaining_page_override_unit_index.json',
  'generated/textbook_evidence/textbook_unit_index.json'
]
const DEFAULT_PDF_CACHE_DIR = 'generated/textbook_evidence/pdf_cache'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_page_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_page_evidence_packet_anchor_domain_rejected_english_pe.md'
const TARGET_GRADE_BANDS = new Set(['H4G7', 'H4G8', 'H4G9'])

function parseArgs(argv) {
  const args = {
    excerptChars: 1200,
    maxPagesPerItem: 3,
    out: DEFAULT_OUT,
    pdfCacheDir: DEFAULT_PDF_CACHE_DIR,
    python: process.env.PYTHON || 'python3',
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    unitIndexes: [...DEFAULT_UNIT_INDEXES],
    worklist: DEFAULT_WORKLIST
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--unit-index') args.unitIndexes.push(argv[++i])
    else if (item === '--unit-indexes') args.unitIndexes = argv[++i].split(',').map(value => value.trim()).filter(Boolean)
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
  args.unitIndexes = [...new Set(args.unitIndexes)]
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_page_evidence_packet.js \\
  --worklist generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_worklist_anchor_domain_rejected_english_pe.json \\
  --strict --require-items

Builds a read-only page evidence packet for downstream source-anchor review
work items. It extracts short local PDF text excerpts and adds sibling
H4G7/H4G8/H4G9 context. The packet is reviewer evidence only; it does not edit
decisions, approve bridges, write public/data, change official standard text,
or enable matcher/publication use.`)
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

function validateWorklist(worklist, args, errors) {
  if (worklist.valid !== true) errors.push('worklist valid must be true')
  if ((worklist.errors || []).length) errors.push('worklist errors must be empty')
  if (worklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_review_worklist') {
    errors.push('worklist purpose mismatch')
  }
  if (worklist.worklist_only !== true) errors.push('worklist worklist_only must be true')
  validatePolicy('worklist', worklist, errors)
  if (!Array.isArray(worklist.downstream_source_anchor_review_work_items)) {
    errors.push('worklist downstream_source_anchor_review_work_items must be an array')
  }
  if (args.requireItems && !(worklist.downstream_source_anchor_review_work_items || []).length) {
    errors.push('requireItems is set but worklist has no rows')
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
    requires_later_downstream_action_decision_edit: true,
    requires_later_item_level_source_review: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
    requires_later_source_anchor_review_decision: true,
    writes_public_data: false
  }
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

function loadUnitIndexes(paths, errors) {
  const byUnit = new Map()
  const loaded = []
  for (const path of paths) {
    if (!existsSync(path)) {
      errors.push(`Missing unit index: ${path}`)
      continue
    }
    const payload = readJson(path)
    const rows = payload.unit_candidates || []
    loaded.push({ path, rows: rows.length })
    for (const row of rows) {
      if (!row.unit_evidence_id || byUnit.has(row.unit_evidence_id)) continue
      byUnit.set(row.unit_evidence_id, { ...row, source_unit_index: path })
    }
  }
  return { byUnit, loaded }
}

function normalizeSearch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleTokens(title) {
  const tokens = normalizeSearch(title).split(/\s+/).filter(Boolean)
  const stop = new Set(['unit', 'module', 'part', 'the', 'and', 'or', 'as', 'to', 'of', 'a', 'an'])
  return tokens.filter(token => !stop.has(token) && (token.length > 2 || /^\d+$/.test(token)))
}

function isTocLikeText(value) {
  const text = String(value || '')
  const normalized = normalizeSearch(text)
  const dottedLeaders = (text.match(/\.{4,}/g) || []).length
  const unitMentions = (normalized.match(/\bunit\b/g) || []).length
  const moduleMentions = (normalized.match(/\bmodule\b/g) || []).length
  const pageListMarkers = (normalized.match(/\bs\d+\b/g) || []).length
  return dottedLeaders >= 3 ||
    pageListMarkers >= 6 ||
    (unitMentions >= 8 && moduleMentions >= 3) ||
    normalized.includes('contents')
}

function extractPdfAllPages(python, pdfPath, excerptChars) {
  const code = `
import json, sys
from pypdf import PdfReader
pdf_path = sys.argv[1]
excerpt_chars = int(sys.argv[2])
reader = PdfReader(pdf_path)
out = []
for index, page in enumerate(reader.pages, start=1):
    try:
        text = page.extract_text() or ""
        normalized = " ".join(text.split())
        out.append({
            "pdf_page": index,
            "status": "text_extracted" if normalized else "empty_text",
            "text_chars": len(normalized),
            "text_excerpt": normalized[:excerpt_chars],
            "search_text": normalized
        })
    except Exception as exc:
        out.append({"pdf_page": index, "status": "extract_failed", "text_chars": 0, "text_excerpt": "", "search_text": "", "error": str(exc)})
print(json.dumps({"ok": True, "total_pages": len(reader.pages), "pages": out}, ensure_ascii=False))
`
  try {
    return JSON.parse(execFileSync(python, ['-c', code, pdfPath, String(excerptChars)], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 96
    }))
  } catch (error) {
    return {
      error: String(error?.stderr || error?.message || error),
      ok: false,
      pages: [],
      total_pages: 0
    }
  }
}

function titleSearchPage(row, extracted) {
  const pages = extracted?.pages || []
  if (!pages.length) return { page: null, score: 0, status: 'no_pdf_text' }
  const title = normalizeSearch(row.unit_title)
  const tokens = titleTokens(row.unit_title)
  if (!title && !tokens.length) return { page: null, score: 0, status: 'missing_title' }
  let best = { page: null, score: 0, status: 'not_found' }
  let bestToc = { page: null, score: 0, status: 'not_found' }
  for (const page of pages) {
    const haystack = normalizeSearch(page.search_text || '')
    if (!haystack) continue
    const exact = title && haystack.includes(title)
    const matchedTokens = tokens.filter(token => haystack.includes(token))
    const score = (exact ? tokens.length + 4 : 0) + matchedTokens.length
    const candidate = {
      is_toc_like: isTocLikeText(page.search_text || ''),
      matched_tokens: matchedTokens,
      page: page.pdf_page,
      score,
      status: exact ? 'exact_title_match' : 'token_title_match'
    }
    if (candidate.is_toc_like) {
      if (score > bestToc.score) bestToc = candidate
      continue
    }
    if (score > best.score) {
      best = {
        matched_tokens: matchedTokens,
        page: page.pdf_page,
        score,
        status: exact ? 'exact_title_match' : 'token_title_match'
      }
    }
  }
  const threshold = tokens.length <= 2 ? tokens.length : Math.min(tokens.length, 4)
  if (best.page && best.score >= threshold) return best
  if (bestToc.page && bestToc.score >= threshold) {
    return {
      ...bestToc,
      page: null,
      toc_candidate_page: bestToc.page,
      status: 'toc_title_match_only_needs_body_page'
    }
  }
  return { page: null, score: best.score, status: 'not_found', matched_tokens: best.matched_tokens || [] }
}

function pageHintFromUnitRow(unitRow) {
  if (!unitRow) return { pdfPage: null, source: 'missing_unit_index' }
  const overridePage = unitRow.page_start_override?.evidence?.pdf_page
  if (Number(overridePage) > 0) return { pdfPage: Number(overridePage), source: 'unit_index_page_start_override_pdf_page' }
  if (Number(unitRow.body_pdf_page) > 0) return { pdfPage: Number(unitRow.body_pdf_page), source: 'unit_index_body_pdf_page' }
  if (Number(unitRow.pdf_page_hint) > 0) return { pdfPage: Number(unitRow.pdf_page_hint), source: 'unit_index_pdf_page_hint' }
  return { pdfPage: null, source: 'unit_index_without_pdf_page_hint' }
}

function selectPages(row, unitRow, extracted, args) {
  const pageRange = parsePageRange(row.page_range || unitRow?.page_range)
  const count = Math.max(1, Math.min(args.maxPagesPerItem, pageRange.count || 1))
  const unitHint = pageHintFromUnitRow(unitRow)
  let basePdfPage = unitHint.pdfPage
  let pageHintSource = unitHint.source
  let titleSearch = null
  if (!basePdfPage) {
    titleSearch = titleSearchPage(row, extracted)
    if (titleSearch.page) {
      basePdfPage = titleSearch.page
      pageHintSource = 'pdf_title_text_search'
    } else if (titleSearch.status === 'toc_title_match_only_needs_body_page') {
      pageHintSource = 'pdf_toc_title_search_needs_body_page_review'
    }
  }
  if (!basePdfPage && pageRange.start && pageHintSource !== 'pdf_toc_title_search_needs_body_page_review') {
    basePdfPage = pageRange.start
    pageHintSource = 'printed_page_range_as_pdf_page_unverified'
  }
  const printedStart = Number(pageRange.start || unitRow?.page_start || row.unit_context?.page_start || 0)
  return {
    page_hint_confidence: ['unit_index_page_start_override_pdf_page', 'unit_index_body_pdf_page', 'unit_index_pdf_page_hint'].includes(pageHintSource)
      ? 'unit_index_backed'
      : pageHintSource === 'pdf_title_text_search'
        ? 'title_search_backed'
        : pageHintSource === 'printed_page_range_as_pdf_page_unverified'
          ? 'low_unverified'
          : 'missing',
    page_hint_requires_review: pageHintSource !== 'unit_index_page_start_override_pdf_page',
    page_hint_source: pageHintSource,
    page_range: pageRange,
    pages: basePdfPage
      ? Array.from({ length: count }, (_, index) => ({
        pdf_page: basePdfPage + index,
        printed_page_estimate: printedStart ? printedStart + index : null
      }))
      : [],
    title_search: titleSearch
  }
}

function packetItemId(row) {
  return `h4g_anchor_group_downstream_source_anchor_page_evidence_${hashText(row.work_item_id)}`
}

function compactSibling(row) {
  return {
    grade_band: row.grade_band || '',
    page_range: row.page_range || '',
    page_range_status: row.page_range_status || '',
    primary_review_bucket: row.primary_review_bucket || '',
    review_lane: row.review_lane || '',
    risk_signals: row.risk_signals || [],
    source_batch: row.source_batch || '',
    standard_code: row.standard_code || '',
    target_standard_code: row.target_standard_code || row.standard_code || '',
    unit_evidence_id: row.unit_evidence_id || '',
    unit_title: row.unit_title || '',
    work_item_id: row.work_item_id || ''
  }
}

function siblingContext(row, rowsByProgression) {
  const rows = rowsByProgression.get(row.progression_group_id) || []
  const siblings = rows.map(compactSibling).sort((a, b) =>
    String(a.grade_band).localeCompare(String(b.grade_band)) ||
    String(a.target_standard_code).localeCompare(String(b.target_standard_code)) ||
    String(a.unit_evidence_id).localeCompare(String(b.unit_evidence_id)) ||
    String(a.work_item_id).localeCompare(String(b.work_item_id)))
  const gradeBands = sorted(siblings.map(item => item.grade_band).filter(grade => TARGET_GRADE_BANDS.has(grade)))
  return {
    has_full_h4g_triplet_context: ['H4G7', 'H4G8', 'H4G9'].every(grade => gradeBands.includes(grade)),
    same_progression_group_grade_bands: gradeBands,
    sibling_h4g_grade_count: gradeBands.length,
    sibling_work_items: siblings
  }
}

function rowStatus(row) {
  if (!row.pdf_cache_found) return 'missing_pdf_cache'
  if (!row.pdf_pages.length) return 'missing_pdf_page_hint'
  if (row.page_text_excerpts.some(page => page.status === 'extract_failed')) return 'extract_failed'
  if (row.page_text_excerpts.some(page => page.status === 'text_extracted' && Number(page.text_chars || 0) > 0)) return 'text_extracted'
  return 'empty_text'
}

function excerptForPage(extracted, page) {
  const source = new Map((extracted?.pages || []).map(item => [item.pdf_page, item])).get(page.pdf_page)
  if (!source) return { ...page, status: 'missing_extraction', text_chars: 0, text_excerpt: '' }
  const { search_text: _searchText, ...publicFields } = source
  return { ...page, ...publicFields }
}

function buildRows(worklist, args, errors) {
  const { byUnit, loaded } = loadUnitIndexes(args.unitIndexes, errors)
  const workItems = worklist.downstream_source_anchor_review_work_items || []
  const rowsByProgression = new Map()
  for (const row of workItems) {
    if (!rowsByProgression.has(row.progression_group_id)) rowsByProgression.set(row.progression_group_id, [])
    rowsByProgression.get(row.progression_group_id).push(row)
  }

  const pdfPaths = sorted(workItems.map(row => row.unit_context?.textbook_evidence_id).filter(Boolean))
    .map(textbookEvidenceId => [textbookEvidenceId, join(args.pdfCacheDir, `${textbookEvidenceId}.pdf`)])
  const extractedByTextbook = new Map()
  for (const [textbookEvidenceId, pdfPath] of pdfPaths) {
    if (!existsSync(pdfPath)) {
      extractedByTextbook.set(textbookEvidenceId, { ok: false, pages: [], total_pages: 0, error: 'missing_pdf_cache' })
      continue
    }
    extractedByTextbook.set(textbookEvidenceId, extractPdfAllPages(args.python, pdfPath, args.excerptChars))
  }

  const rows = workItems.map(workItem => {
    const unitRow = byUnit.get(workItem.unit_evidence_id)
    const textbookEvidenceId = workItem.unit_context?.textbook_evidence_id || unitRow?.textbook_evidence_id || ''
    const pdfPath = textbookEvidenceId ? join(args.pdfCacheDir, `${textbookEvidenceId}.pdf`) : ''
    const extracted = extractedByTextbook.get(textbookEvidenceId)
    const selection = selectPages(workItem, unitRow, extracted, args)
    const excerpts = selection.pages.map(page => excerptForPage(extracted, page))
    const sibling = siblingContext(workItem, rowsByProgression)
    const row = {
      anchor_requirement_summary: workItem.anchor_requirement_summary || '',
      anchor_type: workItem.anchor_type || '',
      changes_official_standard_text: false,
      direct_matcher_use: false,
      downstream_action_decision_id: workItem.downstream_action_decision_id || '',
      eligible_for_h4g_differentiation: false,
      evidence_packet_item_id: packetItemId(workItem),
      evidence_packet_only: true,
      extraction_tool: 'python:pypdf',
      grade_band: workItem.grade_band || '',
      has_full_h4g_triplet_context: sibling.has_full_h4g_triplet_context,
      inventory_item_id: workItem.inventory_item_id || '',
      item_review_surface: workItem.item_review_surface || '',
      manual_review_required: true,
      matcher_ready: false,
      page_evidence_policy: packetPolicy(),
      page_hint_confidence: selection.page_hint_confidence,
      page_hint_requires_review: selection.page_hint_requires_review,
      page_hint_source: selection.page_hint_source,
      page_range: workItem.page_range || '',
      page_range_status: workItem.page_range_status || '',
      page_text_excerpts: excerpts,
      pdf_cache_found: Boolean(pdfPath && existsSync(pdfPath)),
      pdf_cache_path: pdfPath,
      pdf_pages: selection.pages.map(page => page.pdf_page),
      primary_review_bucket: workItem.primary_review_bucket || '',
      progression_group_id: workItem.progression_group_id || '',
      publication_ready: false,
      recommended_disposition: workItem.recommended_disposition || '',
      review_grain: workItem.review_grain || '',
      review_lane: workItem.review_lane || '',
      risk_profile: workItem.risk_profile || {},
      risk_signals: workItem.risk_signals || [],
      same_progression_group_grade_bands: sibling.same_progression_group_grade_bands,
      sibling_h4g_grade_count: sibling.sibling_h4g_grade_count,
      sibling_work_items: sibling.sibling_work_items,
      source_anchor_evidence_item_id: workItem.source_anchor_evidence_item_id || '',
      source_anchor_review_item_ids: workItem.source_anchor_review_item_ids || [],
      source_batch: workItem.source_batch || '',
      source_batch_item_id: workItem.source_batch_item_id || '',
      source_downstream_source_anchor_review_work_item_id: workItem.work_item_id || '',
      source_key: workItem.source_key || '',
      source_standard_context: workItem.source_standard_context || {},
      source_unit_index: unitRow?.source_unit_index || '',
      standard_code: workItem.standard_code || '',
      subject_slug: workItem.subject_slug || '',
      target_standard_code: workItem.target_standard_code || workItem.standard_code || '',
      textbook_evidence_id: textbookEvidenceId,
      title_search: selection.title_search,
      unit_context: workItem.unit_context || {},
      unit_evidence_id: workItem.unit_evidence_id || '',
      unit_index_found: Boolean(unitRow),
      unit_index_page_start_override: unitRow?.page_start_override || null,
      unit_title: workItem.unit_title || '',
      writes_public_data: false
    }
    row.page_evidence_status = rowStatus(row)
    row.ready_for_manual_review = row.page_evidence_status === 'text_extracted'
    return row
  }).sort((a, b) => String(a.review_lane).localeCompare(String(b.review_lane)) ||
    String(a.subject_slug).localeCompare(String(b.subject_slug)) ||
    String(a.grade_band).localeCompare(String(b.grade_band)) ||
    String(a.target_standard_code).localeCompare(String(b.target_standard_code)) ||
    String(a.unit_evidence_id).localeCompare(String(b.unit_evidence_id)) ||
    String(a.source_downstream_source_anchor_review_work_item_id).localeCompare(String(b.source_downstream_source_anchor_review_work_item_id)))
  return { loadedUnitIndexes: loaded, rows }
}

function summarize(rows) {
  const summary = {
    by_grade_band: {},
    by_page_evidence_status: {},
    by_page_hint_confidence: {},
    by_page_hint_source: {},
    by_page_range_status: {},
    by_primary_review_bucket: {},
    by_review_lane: {},
    by_subject: {},
    by_target_standard_code: {},
    by_textbook_evidence_id: {},
    full_h4g_triplet_context_rows: 0,
    page_evidence_items: rows.length,
    ready_for_manual_review_rows: 0,
    text_extracted_rows: 0,
    title_search_page_hint_rows: 0,
    unit_index_found_rows: 0,
    unverified_printed_page_hint_rows: 0,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_review_work_items: sorted(rows.map(row => row.source_downstream_source_anchor_review_work_item_id)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length,
    unique_textbook_evidence_ids: sorted(rows.map(row => row.textbook_evidence_id)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length
  }
  for (const row of rows) {
    if (row.ready_for_manual_review) summary.ready_for_manual_review_rows += 1
    if (row.page_evidence_status === 'text_extracted') summary.text_extracted_rows += 1
    if (row.unit_index_found) summary.unit_index_found_rows += 1
    if (row.page_hint_source === 'pdf_title_text_search') summary.title_search_page_hint_rows += 1
    if (row.page_hint_source === 'printed_page_range_as_pdf_page_unverified') summary.unverified_printed_page_hint_rows += 1
    if (row.has_full_h4g_triplet_context) summary.full_h4g_triplet_context_rows += 1
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_page_evidence_status, row.page_evidence_status)
    countInto(summary.by_page_hint_confidence, row.page_hint_confidence)
    countInto(summary.by_page_hint_source, row.page_hint_source)
    countInto(summary.by_page_range_status, row.page_range_status)
    countInto(summary.by_primary_review_bucket, row.primary_review_bucket)
    countInto(summary.by_review_lane, row.review_lane)
    countInto(summary.by_subject, row.subject_slug)
    countInto(summary.by_target_standard_code, row.target_standard_code)
    countInto(summary.by_textbook_evidence_id, row.textbook_evidence_id)
  }
  return summary
}

function previewRows(rows) {
  return rows.slice(0, 80).map(row => (
    `| ${markdownCell(row.review_lane)} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.target_standard_code)} | ${markdownCell(row.page_evidence_status)} | ${markdownCell(row.page_hint_source)} | ${markdownCell(row.pdf_pages.join(','))} | ${truncate(row.unit_title)} |`
  )).join('\n') || '| - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Downstream Source-Anchor Page Evidence Packet

Generated at: ${payload.generated_at}

This read-only packet extracts local PDF page text for downstream source-anchor
review work items and adds sibling H4G7/H4G8/H4G9 context. It does not approve
source anchors, edit decisions, write \`public/data\`, change official standard
text, or enable matcher/publication use.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| page evidence items | ${payload.summary.page_evidence_items} |
| text extracted rows | ${payload.summary.text_extracted_rows} |
| ready for manual review rows | ${payload.summary.ready_for_manual_review_rows} |
| unit index found rows | ${payload.summary.unit_index_found_rows} |
| title-search page hint rows | ${payload.summary.title_search_page_hint_rows} |
| unverified printed-page hint rows | ${payload.summary.unverified_printed_page_hint_rows} |
| full H4G triplet context rows | ${payload.summary.full_h4g_triplet_context_rows} |
| unique work items | ${payload.summary.unique_review_work_items} |
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

## Review Lanes

| lane | rows |
| --- | ---: |
${countRows(payload.summary.by_review_lane)}

## Preview

| lane | subject | grade | target standard | status | page hint source | PDF pages | unit title |
| --- | --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.page_evidence_items)}

## Guardrails

- Page evidence rows are not reviewer decisions.
- Downstream action and item-level source review decisions must be edited separately.
- Public data, official standard text, matcher, and publication remain disabled.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  if (!existsSync(args.worklist)) errors.push(`Missing worklist: ${args.worklist}`)
  const worklist = errors.length ? { downstream_source_anchor_review_work_items: [] } : readJson(args.worklist)
  if (!errors.length) validateWorklist(worklist, args, errors)
  const { loadedUnitIndexes, rows } = buildRows(worklist, args, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no page evidence rows were generated')
  return {
    changes_official_standard_text: false,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    loaded_unit_indexes: loadedUnitIndexes,
    matcher_ready: false,
    page_evidence_items: rows,
    page_evidence_packet_only: true,
    page_evidence_policy: packetPolicy(),
    pdf_cache_dir: args.pdfCacheDir,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_source_anchor_page_evidence_packet',
    source_downstream_source_anchor_review_worklist: args.worklist,
    summary: summarize(rows),
    unit_indexes: args.unitIndexes,
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
