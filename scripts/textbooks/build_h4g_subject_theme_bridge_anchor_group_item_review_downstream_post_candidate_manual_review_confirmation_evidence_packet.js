#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_CONFIRMATION_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_BOUNDED_SOURCE_PACKET = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_bounded_source_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_MANUAL_CONFIRMATION_WORKLIST = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist_anchor_domain_rejected_english_pe.json'
const DEFAULT_UNIT_INDEXES = [
  'generated/textbook_evidence/h4g_after_p2_page_recovery_unit_index.json',
  'generated/textbook_evidence/h4g_theme_bridge_r1_page_override_unit_index.json',
  'generated/textbook_evidence/h4g_theme_bridge_remaining_page_override_unit_index.json',
  'generated/textbook_evidence/textbook_unit_index.json'
]
const DEFAULT_PDF_CACHE_DIR = 'generated/textbook_evidence/pdf_cache'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_evidence_packet_anchor_domain_rejected_english_pe.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_evidence_packet_anchor_domain_rejected_english_pe.md'
const TARGET_GRADE_BANDS = new Set(['H4G7', 'H4G8', 'H4G9'])

function parseArgs(argv) {
  const args = {
    boundedSourcePacket: DEFAULT_BOUNDED_SOURCE_PACKET,
    confirmationWorklist: DEFAULT_CONFIRMATION_WORKLIST,
    excerptChars: 1200,
    manualConfirmationWorklist: DEFAULT_MANUAL_CONFIRMATION_WORKLIST,
    maxPagesPerItem: 3,
    out: DEFAULT_OUT,
    pdfCacheDir: DEFAULT_PDF_CACHE_DIR,
    python: process.env.PYTHON || 'python3',
    requireItems: false,
    strict: false,
    summaryOut: DEFAULT_SUMMARY_OUT,
    unitIndexes: [...DEFAULT_UNIT_INDEXES]
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--confirmation-worklist') args.confirmationWorklist = argv[++i]
    else if (item === '--bounded-source-packet') args.boundedSourcePacket = argv[++i]
    else if (item === '--manual-confirmation-worklist') args.manualConfirmationWorklist = argv[++i]
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
node scripts/textbooks/build_h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_evidence_packet.js \\
  --strict --require-items

Builds a read-only page-text evidence packet for the focused post-candidate
manual confirmation worklist. It extracts local PDF page text, adds H4G sibling
context, and keeps all matcher/publication gates disabled.`)
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

function mapBy(rows, key, errors, label) {
  const out = new Map()
  for (const row of rows || []) {
    const id = row[key] || ''
    if (!id) {
      errors.push(`${label} row missing ${key}`)
      continue
    }
    if (out.has(id)) errors.push(`${label} duplicate ${key}: ${id}`)
    out.set(id, row)
  }
  return out
}

function validateInputs(confirmationWorklist, boundedSourcePacket, manualConfirmationWorklist, args, errors) {
  if (confirmationWorklist.valid !== true) errors.push('confirmation worklist valid must be true')
  if ((confirmationWorklist.errors || []).length) errors.push('confirmation worklist errors must be empty')
  if (confirmationWorklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_worklist') {
    errors.push('confirmation worklist purpose mismatch')
  }
  if (confirmationWorklist.confirmation_worklist_only !== true) errors.push('confirmation worklist confirmation_worklist_only must be true')
  if (!Array.isArray(confirmationWorklist.confirmation_work_items)) {
    errors.push('confirmation worklist confirmation_work_items must be an array')
  }
  validatePolicy('confirmation worklist', confirmationWorklist, errors)

  if (boundedSourcePacket.valid !== true) errors.push('bounded-source packet valid must be true')
  if ((boundedSourcePacket.errors || []).length) errors.push('bounded-source packet errors must be empty')
  if (boundedSourcePacket.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_bounded_source_evidence_packet') {
    errors.push('bounded-source packet purpose mismatch')
  }
  if (boundedSourcePacket.bounded_source_evidence_packet_only !== true) {
    errors.push('bounded-source packet bounded_source_evidence_packet_only must be true')
  }
  if (!Array.isArray(boundedSourcePacket.bounded_source_evidence_items)) {
    errors.push('bounded-source packet bounded_source_evidence_items must be an array')
  }
  validatePolicy('bounded-source packet', boundedSourcePacket, errors)

  if (manualConfirmationWorklist.valid !== true) errors.push('manual confirmation worklist valid must be true')
  if ((manualConfirmationWorklist.errors || []).length) errors.push('manual confirmation worklist errors must be empty')
  if (manualConfirmationWorklist.purpose !== 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_manual_confirmation_worklist') {
    errors.push('manual confirmation worklist purpose mismatch')
  }
  if (!Array.isArray(manualConfirmationWorklist.manual_confirmation_work_items)) {
    errors.push('manual confirmation worklist manual_confirmation_work_items must be an array')
  }
  validatePolicy('manual confirmation worklist', manualConfirmationWorklist, errors)

  if (boundedSourcePacket.source_post_candidate_remaining_worklist && boundedSourcePacket.source_post_candidate_remaining_worklist !== 'generated/textbook_evidence/h4g_theme_bridge_anchor_group_item_review_downstream_post_candidate_remaining_worklist_anchor_domain_rejected_english_pe.json') {
    errors.push('bounded-source packet source_post_candidate_remaining_worklist unexpected')
  }
  if (args.requireItems && !(confirmationWorklist.confirmation_work_items || []).length) {
    errors.push('requireItems is set but confirmation worklist has no rows')
  }
}

function packetPolicy() {
  return {
    changes_official_standard_text: false,
    confirmation_evidence_packet_is_not_reviewer_decision: true,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    matcher_ready: false,
    publication_ready: false,
    requires_bounded_source_confirmation: true,
    requires_later_h4g_grade_distinctiveness_check: true,
    requires_later_manual_decision_edit: true,
    requires_later_matcher_gate: true,
    requires_later_publication_gate: true,
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

function excerptForPage(extracted, page) {
  const source = new Map((extracted?.pages || []).map(item => [item.pdf_page, item])).get(page.pdf_page)
  if (!source) return { ...page, status: 'missing_extraction', text_chars: 0, text_excerpt: '' }
  const { search_text: _searchText, ...publicFields } = source
  return { ...page, ...publicFields }
}

function rowStatus(row) {
  if (!row.pdf_cache_found) return 'missing_pdf_cache'
  if (!row.pdf_pages.length) return 'missing_pdf_page_hint'
  if (row.page_text_excerpts.some(page => page.status === 'extract_failed')) return 'extract_failed'
  if (row.page_text_excerpts.some(page => page.status === 'text_extracted' && Number(page.text_chars || 0) > 0)) return 'text_extracted'
  return 'empty_text'
}

function compactSibling(row) {
  return {
    grade_band: row.grade_band || '',
    inventory_bucket: row.inventory_bucket || '',
    manual_confirmation_lane: row.manual_confirmation_lane || '',
    recommended_reviewer_decision: row.recommended_reviewer_decision || '',
    source_downstream_action_batch: row.source_downstream_action_batch || '',
    source_key: row.source_key || '',
    standard_code: row.standard_code || '',
    target_grade_band: row.target_grade_band || row.grade_band || '',
    target_standard_code: row.target_standard_code || row.standard_code || '',
    unit_evidence_id: row.unit_evidence_id || '',
    unit_title: row.unit_title || '',
    worklist_rank: row.worklist_rank || 0
  }
}

function rowsByProgression(rows) {
  const out = new Map()
  for (const row of rows || []) {
    if (!row.progression_group_id) continue
    if (!out.has(row.progression_group_id)) out.set(row.progression_group_id, [])
    out.get(row.progression_group_id).push(row)
  }
  return out
}

function siblingContext(row, byProgression) {
  const rows = byProgression.get(row.progression_group_id) || []
  const siblings = rows.map(compactSibling).sort((a, b) =>
    String(a.grade_band).localeCompare(String(b.grade_band)) ||
    String(a.standard_code).localeCompare(String(b.standard_code)) ||
    String(a.unit_evidence_id).localeCompare(String(b.unit_evidence_id)) ||
    Number(a.worklist_rank || 0) - Number(b.worklist_rank || 0))
  const gradeBands = sorted(siblings.map(item => item.grade_band).filter(grade => TARGET_GRADE_BANDS.has(grade)))
  return {
    has_full_h4g_triplet_context: ['H4G7', 'H4G8', 'H4G9'].every(grade => gradeBands.includes(grade)),
    same_progression_group_grade_bands: gradeBands,
    same_progression_group_standard_codes: sorted(siblings.map(item => item.standard_code)),
    sibling_h4g_grade_count: gradeBands.length,
    sibling_work_items: siblings
  }
}

function packetItemId(row) {
  return `h4g_anchor_group_post_candidate_manual_review_confirmation_evidence_${hashText(row.confirmation_work_item_id || row.decision_id)}`
}

function pageRangeFrom(workItem, boundedItem) {
  return workItem.source_context?.page_range || boundedItem.page_range || ''
}

function pageRangeStatusFrom(workItem, boundedItem) {
  return workItem.source_context?.page_range_status || boundedItem.page_range_status || workItem.page_status || ''
}

function combineContext(workItem, boundedItem) {
  return {
    ...boundedItem,
    ...workItem,
    page_range: pageRangeFrom(workItem, boundedItem),
    page_range_status: pageRangeStatusFrom(workItem, boundedItem),
    target_standard_code: workItem.target_standard_code || boundedItem.target_standard_code || workItem.standard_code || boundedItem.standard_code || '',
    unit_context: workItem.unit_context || boundedItem.unit_context || {},
    unit_title: workItem.unit_title || boundedItem.unit_title || ''
  }
}

function buildRows(confirmationWorklist, boundedSourcePacket, manualConfirmationWorklist, args, errors) {
  const { byUnit, loaded } = loadUnitIndexes(args.unitIndexes, errors)
  const workItems = confirmationWorklist.confirmation_work_items || []
  const boundedByAction = mapBy(boundedSourcePacket.bounded_source_evidence_items || [], 'downstream_action_decision_id', errors, 'bounded-source packet')
  const byProgression = rowsByProgression(manualConfirmationWorklist.manual_confirmation_work_items || [])

  const joined = workItems.map(workItem => {
    const boundedItem = boundedByAction.get(workItem.downstream_action_decision_id)
    if (!boundedItem) errors.push(`${workItem.downstream_action_decision_id} missing bounded-source packet item`)
    return { boundedItem, workItem }
  }).filter(item => item.boundedItem)

  const textbookIds = sorted(joined.map(({ boundedItem, workItem }) =>
    workItem.unit_context?.textbook_evidence_id ||
    boundedItem.unit_context?.textbook_evidence_id ||
    ''
  ))
  const extractedByTextbook = new Map()
  for (const textbookEvidenceId of textbookIds) {
    const pdfPath = join(args.pdfCacheDir, `${textbookEvidenceId}.pdf`)
    if (!existsSync(pdfPath)) {
      extractedByTextbook.set(textbookEvidenceId, { ok: false, pages: [], total_pages: 0, error: 'missing_pdf_cache' })
      continue
    }
    extractedByTextbook.set(textbookEvidenceId, extractPdfAllPages(args.python, pdfPath, args.excerptChars))
  }

  const rows = joined.map(({ boundedItem, workItem }, index) => {
    const combined = combineContext(workItem, boundedItem)
    const unitRow = byUnit.get(combined.unit_evidence_id)
    const textbookEvidenceId = combined.unit_context?.textbook_evidence_id || unitRow?.textbook_evidence_id || ''
    const pdfPath = textbookEvidenceId ? join(args.pdfCacheDir, `${textbookEvidenceId}.pdf`) : ''
    const extracted = extractedByTextbook.get(textbookEvidenceId)
    const selection = selectPages(combined, unitRow, extracted, args)
    const excerpts = selection.pages.map(page => excerptForPage(extracted, page))
    const sibling = siblingContext(workItem, byProgression)
    const row = {
      anchor_requirement_summary: boundedItem.anchor_requirement_summary || '',
      bounded_source_evidence_packet_id: boundedItem.bounded_source_evidence_packet_id || workItem.evidence_packet_item_id || '',
      bridge_score: Number(boundedItem.bridge_score || 0),
      changes_official_standard_text: false,
      confirmation_evidence_packet_item_id: packetItemId(workItem),
      confirmation_evidence_packet_only: true,
      confirmation_work_item_id: workItem.confirmation_work_item_id || '',
      decision_id: workItem.decision_id || '',
      direct_matcher_use: false,
      downstream_action_decision_id: workItem.downstream_action_decision_id || '',
      eligible_for_h4g_differentiation: false,
      evidence_lane: workItem.evidence_lane || boundedItem.evidence_lane || '',
      evidence_packet_source: workItem.evidence_packet_source || '',
      evidence_profile: boundedItem.evidence_profile || {},
      extraction_tool: 'python:pypdf',
      grade_band: workItem.grade_band || '',
      has_full_h4g_triplet_context: sibling.has_full_h4g_triplet_context,
      inventory_bucket: workItem.inventory_bucket || boundedItem.inventory_bucket || '',
      inventory_item_id: boundedItem.inventory_item_id || '',
      manual_confirmation_lane: workItem.manual_confirmation_lane || boundedItem.manual_confirmation_lane || '',
      manual_confirmation_required: true,
      manual_review_packet_item_id: workItem.manual_review_packet_item_id || '',
      matcher_ready: false,
      missing_required_confirmations: workItem.missing_required_confirmations || [],
      page_evidence_policy: packetPolicy(),
      page_hint_confidence: selection.page_hint_confidence,
      page_hint_requires_review: selection.page_hint_requires_review,
      page_hint_source: selection.page_hint_source,
      page_range: combined.page_range,
      page_range_status: combined.page_range_status,
      page_text_excerpts: excerpts,
      pdf_cache_found: Boolean(pdfPath && existsSync(pdfPath)),
      pdf_cache_path: pdfPath,
      pdf_pages: selection.pages.map(page => page.pdf_page),
      post_candidate_manual_review_recommendation_id: workItem.post_candidate_manual_review_recommendation_id || '',
      progression_group_id: workItem.progression_group_id || '',
      publication_ready: false,
      recommendation_confidence: workItem.recommendation_confidence || boundedItem.recommendation_confidence || '',
      recommendation_route: workItem.recommendation_route || '',
      recommended_reviewer_decision_to_consider: workItem.recommended_reviewer_decision_to_consider || '',
      required_confirmations_to_close: boundedItem.required_confirmations_to_close || [],
      review_only: true,
      review_questions: workItem.review_questions || boundedItem.review_questions || [],
      review_work_item_is_not_decision: workItem.review_work_item_is_not_decision === true,
      reviewer_action: workItem.reviewer_action || '',
      risk_signals: boundedItem.risk_signals || [],
      same_progression_group_grade_bands: sibling.same_progression_group_grade_bands,
      same_progression_group_standard_codes: sibling.same_progression_group_standard_codes,
      sibling_h4g_grade_count: sibling.sibling_h4g_grade_count,
      sibling_work_items: sibling.sibling_work_items,
      source_context: workItem.source_context || {},
      source_downstream_action_batch: workItem.source_downstream_action_batch || '',
      source_downstream_action_item_id: workItem.source_downstream_action_item_id || '',
      source_key: workItem.source_key || '',
      source_standard_context: workItem.source_standard_context || boundedItem.source_standard_context || {},
      source_unit_index: unitRow?.source_unit_index || '',
      standard_code: workItem.standard_code || '',
      subject_slug: workItem.subject_slug || '',
      target_grade_band: workItem.target_grade_band || workItem.grade_band || '',
      target_standard_code: combined.target_standard_code,
      textbook_evidence_id: textbookEvidenceId,
      title_search: selection.title_search,
      topic_tags: boundedItem.topic_tags || {},
      unit_context: combined.unit_context || {},
      unit_evidence_id: combined.unit_evidence_id || '',
      unit_index_found: Boolean(unitRow),
      unit_index_page_start_override: unitRow?.page_start_override || null,
      unit_title: combined.unit_title || '',
      worklist_rank: workItem.worklist_rank || index + 1,
      writes_public_data: false
    }
    row.page_evidence_status = rowStatus(row)
    row.ready_for_manual_review = row.page_evidence_status === 'text_extracted'
    return row
  }).sort((a, b) => Number(a.worklist_rank || 0) - Number(b.worklist_rank || 0) ||
    String(a.subject_slug).localeCompare(String(b.subject_slug)) ||
    String(a.standard_code).localeCompare(String(b.standard_code)) ||
    String(a.unit_evidence_id).localeCompare(String(b.unit_evidence_id)))

  return { loadedUnitIndexes: loaded, rows }
}

function summarize(rows, confirmationWorklist) {
  const summary = {
    by_evidence_lane: {},
    by_grade_band: {},
    by_manual_confirmation_lane: {},
    by_page_evidence_status: {},
    by_page_hint_confidence: {},
    by_page_hint_source: {},
    by_page_range_status: {},
    by_recommendation: {},
    by_sibling_grade_context: {},
    by_source_downstream_action_batch: {},
    by_subject: {},
    confirmation_evidence_items: rows.length,
    expected_confirmation_evidence_items: Number(confirmationWorklist.summary?.confirmation_work_items || 0),
    full_h4g_triplet_context_items: 0,
    item_level_confirmation_items: 0,
    partial_h4g_context_items: 0,
    ready_for_manual_review_items: 0,
    source_row_confirmation_items: 0,
    text_extracted_items: 0,
    title_search_page_hint_items: 0,
    unit_index_found_items: 0,
    unique_action_decisions: sorted(rows.map(row => row.downstream_action_decision_id)).length,
    unique_progression_groups: sorted(rows.map(row => row.progression_group_id)).length,
    unique_standard_codes: sorted(rows.map(row => row.standard_code)).length,
    unique_textbook_evidence_ids: sorted(rows.map(row => row.textbook_evidence_id)).length,
    unique_unit_evidence_ids: sorted(rows.map(row => row.unit_evidence_id)).length,
    unverified_printed_page_hint_items: 0
  }
  for (const row of rows) {
    if (row.ready_for_manual_review) summary.ready_for_manual_review_items += 1
    if (row.page_evidence_status === 'text_extracted') summary.text_extracted_items += 1
    if (row.page_hint_source === 'pdf_title_text_search') summary.title_search_page_hint_items += 1
    if (row.page_hint_source === 'printed_page_range_as_pdf_page_unverified') summary.unverified_printed_page_hint_items += 1
    if (row.unit_index_found) summary.unit_index_found_items += 1
    if (row.has_full_h4g_triplet_context) summary.full_h4g_triplet_context_items += 1
    else summary.partial_h4g_context_items += 1
    if (row.source_downstream_action_batch === 'source_row_confirmation') summary.source_row_confirmation_items += 1
    if (row.source_downstream_action_batch === 'item_level_source_review') summary.item_level_confirmation_items += 1
    countInto(summary.by_evidence_lane, row.evidence_lane)
    countInto(summary.by_grade_band, row.grade_band)
    countInto(summary.by_manual_confirmation_lane, row.manual_confirmation_lane)
    countInto(summary.by_page_evidence_status, row.page_evidence_status)
    countInto(summary.by_page_hint_confidence, row.page_hint_confidence)
    countInto(summary.by_page_hint_source, row.page_hint_source)
    countInto(summary.by_page_range_status, row.page_range_status)
    countInto(summary.by_recommendation, row.recommended_reviewer_decision_to_consider)
    countInto(summary.by_sibling_grade_context, row.same_progression_group_grade_bands.join('+') || 'missing')
    countInto(summary.by_source_downstream_action_batch, row.source_downstream_action_batch)
    countInto(summary.by_subject, row.subject_slug)
  }
  return summary
}

function previewRows(rows) {
  return rows.map(row => (
    `| ${row.worklist_rank} | ${markdownCell(row.subject_slug)} | ${markdownCell(row.grade_band)} | ${markdownCell(row.source_downstream_action_batch)} | ${markdownCell(row.standard_code)} | ${markdownCell(row.page_evidence_status)} | ${markdownCell(row.page_hint_source)} | ${markdownCell(row.pdf_pages.join(','))} | ${markdownCell(row.same_progression_group_grade_bands.join('+'))} | ${truncate(row.unit_title)} |`
  )).join('\n') || '| - | - | - | - | - | - | - | - | - | - |'
}

function markdownSummary(payload) {
  return `# H4G Post-Candidate Manual Review Confirmation Evidence Packet

Generated at: ${payload.generated_at}

This read-only packet extracts local PDF page text for the focused
post-candidate manual confirmation worklist. It is evidence for later human
decision adoption only; it does not edit decisions, approve bridges, write
\`public/data\`, change official standard text, or enable matcher/publication.

## Status

| Field | Value |
| --- | ---: |
| valid | ${payload.valid} |
| confirmation evidence items | ${payload.summary.confirmation_evidence_items} |
| expected confirmation evidence items | ${payload.summary.expected_confirmation_evidence_items} |
| text extracted items | ${payload.summary.text_extracted_items} |
| ready for manual review items | ${payload.summary.ready_for_manual_review_items} |
| source-row confirmation items | ${payload.summary.source_row_confirmation_items} |
| item-level confirmation items | ${payload.summary.item_level_confirmation_items} |
| full H4G triplet context items | ${payload.summary.full_h4g_triplet_context_items} |
| partial H4G context items | ${payload.summary.partial_h4g_context_items} |
| matcher ready | ${payload.matcher_ready} |
| publication ready | ${payload.publication_ready} |

## Evidence Status

| status | rows |
| --- | ---: |
${countRows(payload.summary.by_page_evidence_status)}

## Sibling Grade Context

| context | rows |
| --- | ---: |
${countRows(payload.summary.by_sibling_grade_context)}

## Preview

| rank | subject | grade | lane | standard | status | page hint source | PDF pages | sibling grades | unit |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${previewRows(payload.confirmation_evidence_items)}

## Guardrails

- Packet rows are not reviewer decisions.
- Every row still requires manual decision-template editing before any later gate.
- H4G grade distinctiveness remains an explicit review confirmation.
- Public data, official standard text, matcher, and publication remain disabled.

## Errors

${payload.errors.length ? payload.errors.map(error => `- ${markdownCell(error)}`).join('\n') : '- none'}
`
}

function buildPayload(args) {
  const errors = []
  for (const [label, path] of Object.entries({
    boundedSourcePacket: args.boundedSourcePacket,
    confirmationWorklist: args.confirmationWorklist,
    manualConfirmationWorklist: args.manualConfirmationWorklist
  })) {
    if (!existsSync(path)) errors.push(`Missing ${label}: ${path}`)
  }
  const confirmationWorklist = existsSync(args.confirmationWorklist) ? readJson(args.confirmationWorklist) : { confirmation_work_items: [] }
  const boundedSourcePacket = existsSync(args.boundedSourcePacket) ? readJson(args.boundedSourcePacket) : { bounded_source_evidence_items: [] }
  const manualConfirmationWorklist = existsSync(args.manualConfirmationWorklist) ? readJson(args.manualConfirmationWorklist) : { manual_confirmation_work_items: [] }
  if (!errors.length) validateInputs(confirmationWorklist, boundedSourcePacket, manualConfirmationWorklist, args, errors)
  const { loadedUnitIndexes, rows } = buildRows(confirmationWorklist, boundedSourcePacket, manualConfirmationWorklist, args, errors)
  if (args.requireItems && !rows.length) errors.push('requireItems is set but no confirmation evidence rows were generated')
  return {
    changes_official_standard_text: false,
    confirmation_evidence_packet_only: true,
    confirmation_evidence_items: rows,
    direct_matcher_use: false,
    eligible_for_h4g_differentiation: false,
    errors,
    generated_at: new Date().toISOString(),
    loaded_unit_indexes: loadedUnitIndexes,
    matcher_ready: false,
    packet_policy: packetPolicy(),
    pdf_cache_dir: args.pdfCacheDir,
    publication_ready: false,
    purpose: 'h4g_subject_theme_bridge_anchor_group_item_review_downstream_post_candidate_manual_review_confirmation_evidence_packet',
    review_only: true,
    source_bounded_source_packet: args.boundedSourcePacket,
    source_confirmation_worklist: args.confirmationWorklist,
    source_manual_confirmation_worklist: args.manualConfirmationWorklist,
    summary: summarize(rows, confirmationWorklist),
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
    confirmation_evidence_packet_only: payload.confirmation_evidence_packet_only,
    direct_matcher_use: payload.direct_matcher_use,
    eligible_for_h4g_differentiation: payload.eligible_for_h4g_differentiation,
    errors: payload.errors,
    generated_at: payload.generated_at,
    matcher_ready: payload.matcher_ready,
    out: args.out,
    publication_ready: payload.publication_ready,
    review_only: payload.review_only,
    summary: payload.summary,
    summary_out: args.summaryOut,
    valid: payload.valid,
    writes_public_data: payload.writes_public_data
  }), null, 2))
  if (args.strict && payload.errors.length) process.exit(1)
}

main()
