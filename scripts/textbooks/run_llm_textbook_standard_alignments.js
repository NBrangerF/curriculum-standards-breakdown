#!/usr/bin/env node

/**
 * LLM-first textbook -> curriculum-standard semantic alignment pipeline.
 *
 * Local code is allowed to select same-subject/same-grade scope candidates and
 * collect page evidence. It is deliberately forbidden from deciding semantic
 * matches: every decision, relation type and rationale comes from validated
 * Responses API Structured Outputs. Canonical data is never mutated here.
 */

import { createHash } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  LLM_ALIGNMENT_INSTRUCTIONS,
  LLM_ALIGNMENT_PROMPT_VERSION,
  LLM_ALIGNMENT_SCHEMA_VERSION,
  alignmentInputHash,
  makeAlignmentResponseInput,
  normalizeAlignmentText,
  stableAlignmentId,
  stableCanonicalJson,
  stableDecisionId,
  validateAlignmentModelOutput
} from './llm_textbook_standard_alignment_contract.js'
import {
  requestAlignmentAdjudication,
  resolveAlignmentLlmConfig
} from './llm_textbook_standard_alignment_provider.js'
import { locateEvidenceQuoteBbox } from './textbook_alignment_quote_bbox.js'

const ROOT = resolve(import.meta.dirname, '../..')
const CATALOG_PATH = join(ROOT, 'public/data/textbooks/index.json')
const STRUCTURE_ROOT = join(ROOT, 'data/textbooks/derived/by-edition')
const STANDARD_ROOT = join(ROOT, 'public/data/by_subject')
const INTERNAL_STANDARD_ROOT = join(ROOT, 'data/internal/by_subject')
const CAPABILITY_ROOT = join(ROOT, 'public/data/capability_graph/by_code')
const DEFAULT_LIBRARY_ROOT = process.env.TEXTBOOK_LIBRARY_ROOT || '/Volumes/X9 Pro/kebiao-library'
const DEFAULT_OUTPUT_ROOT = join(ROOT, 'output/textbook-standard-llm')

const TEXTBOOK_TO_STANDARD_SUBJECT = {
  chinese: 'chinese',
  math: 'math',
  english: 'english',
  science: 'science',
  physics: 'science',
  chemistry: 'science',
  biology: 'science',
  geography: 'science',
  morality_law: 'morality_law',
  history: 'morality_law',
  pe: 'pe',
  art: 'arts',
  music: 'arts',
  arts: 'arts',
  labor: 'labor',
  it: 'it',
  information_technology: 'it'
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function sha256(value) {
  return createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex')
}

function stableId(prefix, ...parts) {
  return `${prefix}_${sha256(parts.map(value => String(value ?? '')).join('\u001f')).slice(0, 20)}`
}

function atomicWriteJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporary, path)
}

function atomicWriteJsonLines(path, rows) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}`
  writeFileSync(temporary, rows.length ? `${rows.map(row => JSON.stringify(row)).join('\n')}\n` : '')
  renameSync(temporary, path)
}

function readJsonLines(path) {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8').split(/\r?\n/u).filter(Boolean).flatMap((line, index) => {
    try {
      return [JSON.parse(line)]
    } catch {
      throw new Error(`Invalid JSONL at ${path}:${index + 1}`)
    }
  })
}

function numberArg(value, label, { integer = false, minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed)) || parsed < minimum || parsed > maximum) {
    throw new Error(`Invalid ${label}: ${value}`)
  }
  return parsed
}

function pushCsv(target, value) {
  target.push(...String(value || '').split(',').map(item => item.trim()).filter(Boolean))
}

export function parseAlignmentArgs(argv) {
  const args = {
    all: false,
    editionIds: [],
    subjects: [],
    mode: 'both',
    provider: null,
    dryRun: false,
    resume: true,
    libraryRoot: resolve(DEFAULT_LIBRARY_ROOT),
    outputPath: null,
    cacheRoot: join(DEFAULT_OUTPUT_ROOT, 'cache'),
    batchSize: 1,
    candidatesPerItem: 80,
    sidecarPagesPerItem: 2,
    evidenceSpansPerPage: 8,
    maxItems: 0,
    concurrency: 2,
    maxOutputTokens: 10_000,
    maxRequests: 30,
    maxInputTokens: 160_000,
    maxOutputTokensTotal: 60_000,
    maxUsd: 5,
    inputUsdPerMillion: 10,
    outputUsdPerMillion: 40,
    validationRetries: 2
  }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--all') args.all = true
    else if (value === '--edition' || value === '--edition-id') pushCsv(args.editionIds, argv[++index])
    else if (value === '--subject') pushCsv(args.subjects, argv[++index])
    else if (value === '--mode') args.mode = argv[++index]
    else if (value === '--provider') args.provider = String(argv[++index] || '').trim()
    else if (value === '--dry-run') args.dryRun = true
    else if (value === '--no-resume') args.resume = false
    else if (value === '--library-root') args.libraryRoot = resolve(argv[++index])
    else if (value === '--output') args.outputPath = resolve(argv[++index])
    else if (value === '--cache-root') args.cacheRoot = resolve(argv[++index])
    else if (value === '--batch-size') args.batchSize = numberArg(argv[++index], 'batch-size', { integer: true, minimum: 1, maximum: 12 })
    else if (value === '--candidates-per-item') args.candidatesPerItem = numberArg(argv[++index], 'candidates-per-item', { integer: true, minimum: 1, maximum: 80 })
    else if (value === '--sidecar-pages-per-item') args.sidecarPagesPerItem = numberArg(argv[++index], 'sidecar-pages-per-item', { integer: true, minimum: 1, maximum: 8 })
    else if (value === '--evidence-spans-per-page') args.evidenceSpansPerPage = numberArg(argv[++index], 'evidence-spans-per-page', { integer: true, minimum: 1, maximum: 24 })
    else if (value === '--max-items') args.maxItems = numberArg(argv[++index], 'max-items', { integer: true, minimum: 0 })
    else if (value === '--concurrency') args.concurrency = numberArg(argv[++index], 'concurrency', { integer: true, minimum: 1, maximum: 8 })
    else if (value === '--max-output-tokens') args.maxOutputTokens = numberArg(argv[++index], 'max-output-tokens', { integer: true, minimum: 256, maximum: 12_000 })
    else if (value === '--max-requests') args.maxRequests = numberArg(argv[++index], 'max-requests', { integer: true, minimum: 1 })
    else if (value === '--max-input-tokens') args.maxInputTokens = numberArg(argv[++index], 'max-input-tokens', { integer: true, minimum: 1 })
    else if (value === '--max-total-output-tokens') args.maxOutputTokensTotal = numberArg(argv[++index], 'max-total-output-tokens', { integer: true, minimum: 1 })
    else if (value === '--max-usd') args.maxUsd = numberArg(argv[++index], 'max-usd', { minimum: 0.01 })
    else if (value === '--input-usd-per-million') args.inputUsdPerMillion = numberArg(argv[++index], 'input-usd-per-million', { minimum: 0 })
    else if (value === '--output-usd-per-million') args.outputUsdPerMillion = numberArg(argv[++index], 'output-usd-per-million', { minimum: 0 })
    else if (value === '--validation-retries') args.validationRetries = numberArg(argv[++index], 'validation-retries', { integer: true, minimum: 0, maximum: 3 })
    else throw new Error(`Unknown argument: ${value}`)
  }
  if (!['adjudicate', 'discover', 'both'].includes(args.mode)) throw new Error(`Invalid mode: ${args.mode}`)
  if (args.provider && !['responses', 'openai_responses', 'codex_cli'].includes(args.provider)) {
    throw new Error(`Invalid provider: ${args.provider}. Use openai_responses or codex_cli.`)
  }
  args.editionIds = [...new Set(args.editionIds)].sort()
  args.subjects = [...new Set(args.subjects)].sort()
  if (!args.all && !args.editionIds.length && !args.subjects.length) {
    throw new Error('Refusing an unscoped run. Use --edition, --subject, or the explicit --all flag.')
  }
  return args
}

export function gradeBand(grade) {
  const value = Number(grade)
  if (value <= 2) return 'H1'
  if (value <= 4) return 'H2'
  if (value <= 6) return 'H3'
  return `H4G${value}`
}

function mappedStandardSubject(subjectSlug) {
  return TEXTBOOK_TO_STANDARD_SUBJECT[subjectSlug] || subjectSlug
}

export function loadStandardIndex() {
  const internalByCode = new Map()
  if (existsSync(INTERNAL_STANDARD_ROOT)) {
    for (const file of readdirSync(INTERNAL_STANDARD_ROOT).filter(name => name.endsWith('.json')).sort()) {
      const payload = readJson(join(INTERNAL_STANDARD_ROOT, file))
      for (const row of payload.standards || []) {
        internalByCode.set(row.code, {
          context: row.context,
          grade: row.grade,
          grade_level: row.grade_level,
          grade_range: row.grade_range,
          grade_specific_focus: row.grade_specific_focus,
          art_discipline_tag: row.art_discipline_tag,
          art_discipline: row.art_discipline,
          discipline: row.discipline,
          display_subcategory: row.display_subcategory,
          subdomain: row.subdomain,
          source_anchor_subcategory: row.source_anchor_subcategory
        })
      }
    }
  }
  const standards = new Map()
  for (const file of readdirSync(STANDARD_ROOT).filter(name => name.endsWith('.json')).sort()) {
    const payload = readJson(join(STANDARD_ROOT, file))
    const fileSubject = basename(file, '.json')
    for (const row of payload.standards || []) {
      const internalApplicability = Object.fromEntries(Object.entries(internalByCode.get(row.code) || {}).filter(([, value]) => (
        value != null && (typeof value !== 'string' || value.trim())
      )))
      standards.set(row.code, {
        ...row,
        ...internalApplicability,
        subject_slug: row.subject_slug || fileSubject
      })
    }
  }
  return standards
}

const learningComponentCache = new Map()

function loadLearningComponents(code) {
  if (learningComponentCache.has(code)) return learningComponentCache.get(code)
  const path = join(CAPABILITY_ROOT, `${code}.json`)
  if (!existsSync(path)) {
    learningComponentCache.set(code, [])
    return []
  }
  const components = (readJson(path).learning_components || []).map(component => ({
    component_id: component.component_id,
    label: normalizeAlignmentText(component.label || component.source_statement || component.description)
  })).filter(component => component.component_id && component.label)
  learningComponentCache.set(code, components)
  return components
}

export function alignmentCandidateFromStandard(itemId, standard, candidateKey = standard.code) {
  return {
    candidate_id: stableId('llmc', itemId, standard.code, candidateKey),
    standard_code: standard.code,
    subject_slug: standard.subject_slug,
    grade_band: standard.grade_band,
    standard_title: normalizeAlignmentText(standard.standard_title),
    standard_text: normalizeAlignmentText(standard.standard || standard.official_text),
    official_text: normalizeAlignmentText(standard.official_text),
    domain: normalizeAlignmentText(standard.domain || standard.subdomain || standard.display_subcategory),
    subdomain: normalizeAlignmentText(standard.subdomain),
    display_subcategory: normalizeAlignmentText(standard.display_subcategory),
    context: normalizeAlignmentText(standard.context),
    grade: normalizeAlignmentText(standard.grade),
    grade_level: Number(standard.grade_level) || null,
    grade_range: normalizeAlignmentText(standard.grade_range),
    grade_specific_focus: normalizeAlignmentText(standard.grade_specific_focus),
    art_discipline_tag: normalizeAlignmentText(standard.art_discipline_tag),
    discipline: normalizeAlignmentText(standard.discipline || standard.art_discipline),
    source_anchor_subcategory: normalizeAlignmentText(standard.source_anchor_subcategory),
    learning_components: loadLearningComponents(standard.code)
  }
}

function catalogSelected(row, args) {
  if (args.editionIds.length && !args.editionIds.includes(row.edition_id)) return false
  if (!args.subjects.length) return true
  return args.subjects.includes(row.subject_slug) || args.subjects.includes(mappedStandardSubject(row.subject_slug))
}

function normalizedEvidence(span, fallback = {}) {
  const evidenceSpanId = span.evidence_span_id || span.span_id
  const excerpt = String(span.excerpt || span.text || '').trim()
  if (!evidenceSpanId || !excerpt) return null
  return {
    evidence_span_id: evidenceSpanId,
    node_id: span.node_id || fallback.node_id || null,
    node_kind: fallback.node_kind || span.evidence_role || span.role || 'page_excerpt',
    node_title: fallback.node_title || span.title || excerpt.slice(0, 100),
    pdf_page: Number(span.pdf_page) || null,
    printed_page: span.printed_page == null ? null : String(span.printed_page),
    excerpt,
    excerpt_hash: span.excerpt_hash || span.text_hash || sha256(excerpt),
    bbox: span.bbox || null,
    evidence_role: span.evidence_role || span.role || 'textbook_page_excerpt',
    source: span.source || fallback.source || 'derived_evidence_span',
    extraction_method: span.extraction_method || null,
    generated_by_pipeline: Boolean(span.generated_by_pipeline)
  }
}

function unitRangeForPdfPage(unitRanges, pdfPage) {
  const page = Number(pdfPage)
  if (!Number.isInteger(page) || page < 1) return null
  return unitRanges.filter(unit => page >= unit.start && page <= unit.end)
    .sort((left, right) => (
      (left.end - left.start) - (right.end - right.start)
      || right.start - left.start
      || left.entry_id.localeCompare(right.entry_id)
    ))[0] || null
}

function adjudicationUnitForEvidence(catalog, structure, unitRanges, evidence) {
  const primaryEvidence = evidence.find(span => Number.isInteger(Number(span.pdf_page)) && Number(span.pdf_page) > 0)
  if (!primaryEvidence) return null
  const primaryPage = Number(primaryEvidence.pdf_page)
  const unit = unitRangeForPdfPage(unitRanges, primaryPage)
  if (unit) {
    return {
      unit: {
        unit_id: unit.entry_id,
        title: unit.title || '',
        pdf_page_start: unit.start,
        pdf_page_end: unit.end,
        assignment_status: 'assigned_toc_unit'
      },
      evidence: evidence.filter(span => unitRangeForPdfPage(unitRanges, span.pdf_page)?.entry_id === unit.entry_id)
    }
  }
  const unitId = stableId(
    'tpu',
    catalog.edition_id,
    primaryPage,
    primaryPage,
    structure.content_alignment?.source_asset_sha256 || ''
  )
  return {
    unit: {
      unit_id: unitId,
      title: `未分配单元 · PDF ${primaryPage}`,
      pdf_page_start: primaryPage,
      pdf_page_end: primaryPage,
      assignment_status: 'unassigned_page_only'
    },
    // A page-only identity deliberately represents one exact page. Keeping
    // evidence from another unassigned page would let the model accept a quote
    // whose materialized page does not match the item's declared page window.
    evidence: evidence.filter(span => Number(span.pdf_page) === primaryPage && !unitRangeForPdfPage(unitRanges, span.pdf_page))
  }
}

function existingEvidenceScopeKey(catalog, resolvedUnit, evidence) {
  const pages = evidence.map(span => Number(span.pdf_page)).filter(Number.isInteger).sort((a, b) => a - b)
  const firstPage = pages[0] || 0
  const lastPage = pages.at(-1) || firstPage
  const evidenceFingerprint = evidence.map(span => ({
    // Legacy v1.2 materialized one synthetic quote node per accepted
    // standard, so node identity is not a reliable task boundary. The page,
    // verbatim excerpt hash and extraction provenance are. Omitting node_id
    // lets competing standards for the same textbook task reach the model in
    // one item, while a different excerpt on the same page remains separate.
    pdf_page: Number(span.pdf_page) || null,
    excerpt_hash: span.excerpt_hash || sha256(span.excerpt || ''),
    source: span.source || null,
    extraction_method: span.extraction_method || null
  })).sort((left, right) => stableCanonicalJson(left).localeCompare(stableCanonicalJson(right)))
  return stableId(
    'llmi_existing_scope',
    catalog.edition_id,
    resolvedUnit.unit_id,
    resolvedUnit.assignment_status,
    firstPage,
    lastPage,
    sha256(stableCanonicalJson(evidenceFingerprint))
  )
}

export function buildExistingAdjudicationItems(catalog, structure, standardsByCode) {
  const spansById = new Map((structure.evidence_spans || []).map(span => [span.evidence_span_id || span.span_id, span]))
  const nodesById = new Map((structure.content_nodes || []).map(node => [node.node_id, node]))
  const unitRanges = publishedUnitRanges(structure)
  const groups = new Map()
  const skipped = []
  for (const alignment of (structure.alignments || []).slice().sort((left, right) => (
    String(left.alignment_id || '').localeCompare(String(right.alignment_id || ''))
  ))) {
    const standard = standardsByCode.get(alignment.standard_code)
    if (!standard) {
      skipped.push({ alignment_id: alignment.alignment_id, reason: 'standard_not_found' })
      continue
    }
    const node = nodesById.get(alignment.node_id)
    let evidence = (alignment.evidence_span_ids || []).map(id => spansById.get(id)).filter(Boolean)
      .map(span => normalizedEvidence(span, { node_id: node?.node_id, node_kind: node?.kind, node_title: node?.title }))
      .filter(Boolean)
    if (!evidence.length && alignment.evidence_excerpt) {
      const excerpt = String(alignment.evidence_excerpt).trim()
      evidence = [normalizedEvidence({
        evidence_span_id: stableId('tes_llm_fallback', alignment.alignment_id, excerpt),
        node_id: alignment.node_id || null,
        pdf_page: alignment.pdf_page,
        printed_page: alignment.printed_page,
        excerpt,
        excerpt_hash: alignment.evidence_excerpt_hash || sha256(excerpt),
        evidence_role: alignment.evidence_role || 'legacy_alignment_excerpt',
        source: 'existing_alignment_fallback',
        generated_by_pipeline: true
      }, { node_kind: alignment.content_node_kind, node_title: alignment.content_node_title })].filter(Boolean)
    }
    if (!evidence.length) {
      skipped.push({ alignment_id: alignment.alignment_id, reason: 'no_verbatim_evidence' })
      continue
    }
    // A canonical alignment is one evidence claim. Older pipeline versions
    // coalesced several page claims into one row; split those rows here so a
    // single model quote never has to stand in for several pages or component
    // subsets. Exact current evidence identity, rather than a stale historical
    // logical_item_id, is the grouping authority. This still lets different
    // standards for the same textbook task compete in one multi-candidate item.
    let claimCount = 0
    for (const span of evidence) {
      const claimResolved = adjudicationUnitForEvidence(catalog, structure, unitRanges, [span])
      if (!claimResolved?.evidence.length) continue
      claimCount += 1
      const claimEvidence = claimResolved.evidence
      const baseGroupKey = existingEvidenceScopeKey(catalog, claimResolved.unit, claimEvidence)
      // The authenticated provider contract allows a standard only once per
      // item. Duplicate legacy rows for the same standard/evidence therefore
      // get their own deterministic lane: no prior is dropped, while the
      // ordinary lane remains a multi-standard comparison scope.
      let groupKey = baseGroupKey
      if (groups.get(groupKey)?.candidates.some(candidate => candidate.standard_code === standard.code)) {
        groupKey = stableId('llmi_existing_duplicate_standard', baseGroupKey, alignment.alignment_id, span.evidence_span_id)
      }
      const logicalItemId = `existing-scope:${groupKey}`
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          item_id: logicalItemId,
          logical_item_id: logicalItemId,
          source_mode: 'adjudicate_existing',
          prior_alignment_id: null,
          textbook: {
            edition_id: catalog.edition_id,
            evidence_id: catalog.evidence_id,
            title: catalog.title,
            subject: catalog.subject,
            subject_slug: catalog.subject_slug,
            grade: catalog.grade,
            volume: catalog.volume
          },
          unit: claimResolved.unit,
          evidence: [],
          candidates: []
        })
      }
      const group = groups.get(groupKey)
      const evidenceIds = new Set(group.evidence.map(item => item.evidence_span_id))
      for (const claimSpan of claimEvidence) {
        if (!evidenceIds.has(claimSpan.evidence_span_id)) {
          group.evidence.push(claimSpan)
          evidenceIds.add(claimSpan.evidence_span_id)
        }
      }
      const candidate = {
        ...alignmentCandidateFromStandard(group.item_id, standard, alignment.alignment_id),
        prior_alignment_id: alignment.alignment_id
      }
      if (!group.candidates.some(item => item.candidate_id === candidate.candidate_id)) group.candidates.push(candidate)
    }
    if (!claimCount) skipped.push({ alignment_id: alignment.alignment_id, reason: 'no_page_grounded_evidence' })
  }
  const items = [...groups.values()]
    .map(item => ({
      ...item,
      evidence: item.evidence.slice().sort((left, right) => (
        Number(left.pdf_page) - Number(right.pdf_page)
        || left.evidence_span_id.localeCompare(right.evidence_span_id)
      )),
      candidates: item.candidates.slice().sort((left, right) => (
        left.standard_code.localeCompare(right.standard_code)
        || left.prior_alignment_id.localeCompare(right.prior_alignment_id)
      ))
    }))
    .sort((left, right) => left.item_id.localeCompare(right.item_id))
  return { items, skipped }
}

function unionBbox(boxes) {
  const usable = boxes.filter(box => box && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(Number(box[key])))
    && Number(box.width) >= 0 && Number(box.height) >= 0 && String(box.unit || '').trim())
  if (!usable.length) return null
  if (usable.length !== boxes.filter(Boolean).length) return null
  const units = new Set(usable.map(box => String(box.unit).trim()))
  if (units.size !== 1) return null
  const dimensions = new Set(usable.map(box => `${Number(box.page_width) || ''}:${Number(box.page_height) || ''}`))
  if (dimensions.size !== 1) return null
  if (usable.some(box => Number(box.x) < 0 || Number(box.y) < 0)) return null
  const pageWidth = Number(usable[0].page_width)
  const pageHeight = Number(usable[0].page_height)
  if ((pageWidth > 0 && usable.some(box => Number(box.x) + Number(box.width) > pageWidth))
    || (pageHeight > 0 && usable.some(box => Number(box.y) + Number(box.height) > pageHeight))) return null
  const x = Math.min(...usable.map(box => Number(box.x)))
  const y = Math.min(...usable.map(box => Number(box.y)))
  const right = Math.max(...usable.map(box => Number(box.x) + Number(box.width || 0)))
  const bottom = Math.max(...usable.map(box => Number(box.y) + Number(box.height || 0)))
  const first = usable[0]
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
    unit: String(first.unit).trim(),
    ...(Number(first.page_width) > 0 ? { page_width: Number(first.page_width) } : {}),
    ...(Number(first.page_height) > 0 ? { page_height: Number(first.page_height) } : {})
  }
}

export function chunkPageLines(catalog, structure, page, spansPerPage) {
  const rawLines = Array.isArray(page.lines) && page.lines.length
    ? page.lines.map(line => ({ text: String(line.text || '').trim(), bbox: line.bbox || null })).filter(line => line.text)
    : [{ text: String(page.text || '').trim(), bbox: null }].filter(line => line.text)
  const groups = []
  let active = []
  let characters = 0
  for (const line of rawLines) {
    if (active.length && characters + line.text.length > 420) {
      groups.push(active)
      active = []
      characters = 0
    }
    active.push(line)
    characters += line.text.length + 1
  }
  if (active.length) groups.push(active)
  // Every deterministic text group is retained. Sampling dense pages made
  // omitted groups impossible to recover or audit and silently broke page
  // coverage. `spansPerPage` remains an accepted compatibility argument but
  // is no longer a lossy cap.
  void spansPerPage
  return groups.map((lines, index) => {
    const excerpt = lines.map(line => line.text).join('\n').trim()
    const sourceHash = sha256(stableCanonicalJson({
      asset_sha256: structure.content_alignment?.source_asset_sha256 || '',
      pdf_page: page.pdf_page,
      index,
      excerpt
    }))
    const nodeId = stableId('tcn_llm', catalog.edition_id, page.pdf_page, index, sourceHash)
    const evidence = normalizedEvidence({
      evidence_span_id: stableId('tes_llm', catalog.edition_id, page.pdf_page, index, sourceHash),
      node_id: nodeId,
      pdf_page: page.pdf_page,
      printed_page: page.printed_page,
      excerpt,
      excerpt_hash: sha256(excerpt),
      bbox: unionBbox(lines.map(line => line.bbox)),
      evidence_role: 'textbook_page_excerpt',
      source: 'external_textbook_sidecar',
      extraction_method: page.extraction_method || page.extraction_status || 'unknown',
      generated_by_pipeline: true
    }, {
      node_id: nodeId,
      node_kind: 'page_excerpt',
      node_title: excerpt.slice(0, 100),
      source: 'external_textbook_sidecar'
    })
    return evidence ? {
      ...evidence,
      // Retained in authenticated checkpoint input for deterministic bbox
      // rematerialization, but stripped from the provider prompt below.
      source_lines: lines.map(line => ({ text: line.text, bbox: line.bbox }))
    } : null
  }).filter(Boolean)
}

export function loadEditionSidecarPages(structure, libraryRoot) {
  const relativePath = structure.content_alignment?.sidecar_path
  if (!relativePath) return { pages: [], status: 'sidecar_not_declared', path: null }
  const root = resolve(libraryRoot)
  const path = resolve(root, relativePath)
  const lexicalRelative = relative(root, path)
  if (lexicalRelative === '..' || lexicalRelative.startsWith(`..${sep}`) || isAbsolute(lexicalRelative)) {
    return { pages: [], status: 'sidecar_path_outside_library', path: null }
  }
  if (!existsSync(path)) return { pages: [], status: 'sidecar_missing', path }
  const canonicalRoot = realpathSync(root)
  const canonicalPath = realpathSync(path)
  const canonicalRelative = relative(canonicalRoot, canonicalPath)
  if (canonicalRelative === '..' || canonicalRelative.startsWith(`..${sep}`) || isAbsolute(canonicalRelative)) {
    return { pages: [], status: 'sidecar_path_outside_library', path: null }
  }
  return { pages: readJsonLines(canonicalPath), status: 'loaded', path: canonicalPath, sha256: sha256(readFileSync(canonicalPath)) }
}

function normalizedSidecarPageBody(page) {
  const pageText = normalizeAlignmentText(page?.text)
  if (pageText) return pageText
  return normalizeAlignmentText((Array.isArray(page?.lines) ? page.lines : [])
    .map(line => line?.text)
    .filter(Boolean)
    .join('\n'))
}

/**
 * Collapse byte-equivalent normalized page bodies before discovery. PDFs in
 * the source collection can contain repeated physical pages; asking the model
 * to adjudicate each copy independently creates contradictory relationships.
 * Empty pages are retained because they contain no body to compare and will be
 * discarded later when no evidence span can be formed.
 */
export function deduplicateSidecarPages(pages) {
  const ordered = (Array.isArray(pages) ? pages : []).map((page, sourceIndex) => ({ page, sourceIndex }))
    .sort((left, right) => {
      const leftPage = Number(left.page?.pdf_page)
      const rightPage = Number(right.page?.pdf_page)
      const leftOrder = Number.isFinite(leftPage) && leftPage > 0 ? leftPage : Number.MAX_SAFE_INTEGER
      const rightOrder = Number.isFinite(rightPage) && rightPage > 0 ? rightPage : Number.MAX_SAFE_INTEGER
      return leftOrder - rightOrder || left.sourceIndex - right.sourceIndex
    })
  const firstByBodyHash = new Map()
  const sourcePageNumberCounts = new Map()
  const uniquePages = []
  const duplicatePages = []
  for (const { page } of ordered) {
    const pdfPage = Number(page?.pdf_page)
    if (Number.isInteger(pdfPage) && pdfPage > 0) {
      sourcePageNumberCounts.set(pdfPage, (sourcePageNumberCounts.get(pdfPage) || 0) + 1)
    }
    const body = normalizedSidecarPageBody(page)
    if (!body) {
      uniquePages.push(page)
      continue
    }
    const bodyHash = sha256(body)
    const first = firstByBodyHash.get(bodyHash)
    if (first && first.body === body) {
      duplicatePages.push({
        pdf_page: Number(page.pdf_page) || null,
        duplicate_of_pdf_page: Number(first.page.pdf_page) || null,
        body_hash: bodyHash
      })
      continue
    }
    firstByBodyHash.set(bodyHash, { body, page })
    uniquePages.push(page)
  }
  return {
    pages: uniquePages,
    duplicate_pages: duplicatePages,
    duplicate_pdf_page_numbers: [...sourcePageNumberCounts]
      .filter(([, count]) => count > 1)
      .map(([pdfPage]) => pdfPage)
      .sort((a, b) => a - b),
    raw_page_count: ordered.length,
    unique_page_count: uniquePages.length,
    duplicate_page_count: duplicatePages.length
  }
}

function publishedUnitRanges(structure) {
  return (structure.toc || []).filter(unit => Number(unit.pdf_page) > 0 && (
    unit.review_status === 'approved'
      || (unit.review_status === 'machine_checked' && unit.publication_status === 'published' && unit.source === 'body_inferred_unit')
  )).map(unit => ({
    ...unit,
    start: Number(unit.pdf_page),
    end: Math.max(Number(unit.pdf_page), Number(unit.end_pdf_page) || Number(unit.pdf_page))
  })).sort((a, b) => a.start - b.start || a.end - b.end || a.entry_id.localeCompare(b.entry_id))
}

function chunks(values, size) {
  const result = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

function contiguousPageWindows(pages, size) {
  const windows = []
  let run = []
  for (const page of pages) {
    if (run.length && Number(page.pdf_page) !== Number(run.at(-1).pdf_page) + 1) {
      windows.push(...chunks(run, size))
      run = []
    }
    run.push(page)
  }
  if (run.length) windows.push(...chunks(run, size))
  return windows
}

function standardsInScope(catalog, standardsByCode) {
  const subject = mappedStandardSubject(catalog.subject_slug)
  const band = gradeBand(catalog.grade)
  const requiredArtDiscipline = catalog.subject_slug === 'music'
    ? '音乐'
    : catalog.subject_slug === 'art' ? '美术' : null
  return [...standardsByCode.values()].filter(standard => {
    if (standard.subject_slug !== subject || standard.grade_band !== band) return false
    if (!requiredArtDiscipline) return true
    const explicitTag = normalizeAlignmentText(standard.art_discipline_tag)
    if (explicitTag) return explicitTag === requiredArtDiscipline
    return normalizeAlignmentText(standard.display_subcategory) === normalizeAlignmentText(`学习任务：${requiredArtDiscipline}`)
  })
    .sort((a, b) => a.code.localeCompare(b.code))
}

/**
 * Discover gaps from all standards in the edition's curriculum scope. Sidecar
 * page lines are converted into auditable candidate spans without semantic
 * filtering; the LLM alone chooses whether any span supports a candidate.
 */
export function buildDiscoveryItems(catalog, structure, standardsByCode, args) {
  const scope = standardsInScope(catalog, standardsByCode)
  const sidecar = loadEditionSidecarPages(structure, args.libraryRoot)
  const invalidNonemptySourceRows = sidecar.pages.flatMap((page, sourceIndex) => {
    if (!normalizedSidecarPageBody(page)) return []
    const pdfPage = Number(page?.pdf_page)
    if (Number.isInteger(pdfPage) && pdfPage > 0) return []
    return [{
      source_row: sourceIndex + 1,
      pdf_page: page?.pdf_page == null ? null : String(page.pdf_page)
    }]
  })
  const sidecarDeduplication = deduplicateSidecarPages(sidecar.pages)
  const pagesByNumber = new Map(sidecarDeduplication.pages.map(page => [Number(page.pdf_page), page]))
  const duplicatePageNumbers = new Set(sidecarDeduplication.duplicate_pages
    .map(page => page.pdf_page)
    .filter(page => Number.isInteger(page) && page > 0))
  const spansById = new Map((structure.evidence_spans || []).map(span => [span.evidence_span_id || span.span_id, span]))
  const nodesByUnit = new Map()
  for (const node of structure.content_nodes || []) {
    if (!node.unit_id) continue
    if (!nodesByUnit.has(node.unit_id)) nodesByUnit.set(node.unit_id, [])
    nodesByUnit.get(node.unit_id).push(node)
  }

  const logicalItems = []
  const unitRanges = publishedUnitRanges(structure)
  const usableSidecarPages = sidecarDeduplication.pages.filter(page => (
    Number(page.pdf_page) > 0 && normalizedSidecarPageBody(page)
  ))
  let discoveryRanges
  if (usableSidecarPages.length) {
    const pagesByUnit = new Map()
    const unassignedPages = []
    for (const page of usableSidecarPages) {
      const pdfPage = Number(page.pdf_page)
      const matchingUnits = unitRanges.filter(unit => pdfPage >= unit.start && pdfPage <= unit.end)
        .sort((left, right) => (
          (left.end - left.start) - (right.end - right.start)
          || right.start - left.start
          || left.entry_id.localeCompare(right.entry_id)
        ))
      const unit = matchingUnits[0]
      if (!unit) {
        unassignedPages.push(page)
        continue
      }
      if (!pagesByUnit.has(unit.entry_id)) pagesByUnit.set(unit.entry_id, [])
      pagesByUnit.get(unit.entry_id).push(page)
    }
    const assignedRanges = unitRanges.flatMap(unit => pagesByUnit.has(unit.entry_id)
      ? [{ ...unit, assignment_status: 'assigned_toc_unit', page_rows: pagesByUnit.get(unit.entry_id) }]
      : [])
    const unassignedRanges = contiguousPageWindows(unassignedPages, args.sidecarPagesPerItem).map(window => {
      const start = Number(window[0].pdf_page)
      const end = Number(window.at(-1).pdf_page)
      const entryId = stableId('tpu', catalog.edition_id, start, end, structure.content_alignment?.source_asset_sha256 || '')
      return {
        entry_id: entryId,
        title: `未分配单元 · PDF ${start}${end === start ? '' : `–${end}`}`,
        start,
        end,
        assignment_status: 'unassigned_page_only',
        page_rows: window
      }
    })
    discoveryRanges = [...assignedRanges, ...unassignedRanges]
      .sort((left, right) => left.start - right.start || left.end - right.end || left.entry_id.localeCompare(right.entry_id))
  } else {
    // Preserve the derived-evidence fallback when no usable sidecar body exists.
    discoveryRanges = unitRanges.map(unit => ({ ...unit, assignment_status: 'assigned_toc_unit' }))
  }
  for (const unit of discoveryRanges) {
    const pageRows = Array.isArray(unit.page_rows) ? unit.page_rows : []
    if (!Array.isArray(unit.page_rows)) {
      for (let page = unit.start; page <= unit.end; page += 1) {
        if (pagesByNumber.has(page)) pageRows.push(pagesByNumber.get(page))
      }
    }
    const pageWindows = contiguousPageWindows(pageRows, args.sidecarPagesPerItem)
    if (pageWindows.length) {
      for (let windowIndex = 0; windowIndex < pageWindows.length; windowIndex += 1) {
        const evidence = pageWindows[windowIndex].flatMap(page => chunkPageLines(
          catalog,
          structure,
          page,
          args.evidenceSpansPerPage
        ))
        if (!evidence.length) continue
        logicalItems.push({
          logical_item_id: `discover:${catalog.edition_id}:${unit.entry_id}:pages-${pageWindows[windowIndex][0].pdf_page}-${pageWindows[windowIndex].at(-1).pdf_page}`,
          source_mode: 'discover_scope_sidecar',
          textbook: {
            edition_id: catalog.edition_id,
            evidence_id: catalog.evidence_id,
            title: catalog.title,
            subject: catalog.subject,
            subject_slug: catalog.subject_slug,
            grade: catalog.grade,
            volume: catalog.volume
          },
          unit: {
            unit_id: unit.entry_id,
            title: unit.title,
            pdf_page_start: pageWindows[windowIndex][0].pdf_page,
            pdf_page_end: pageWindows[windowIndex].at(-1).pdf_page,
            assignment_status: unit.assignment_status
          },
          evidence,
          standards: scope
        })
      }
      continue
    }

    // When sidecar assignment was explicit, an empty range must not fall back
    // to a derived copy of a page that content deduplication intentionally removed.
    if (Array.isArray(unit.page_rows)) continue

    const derivedEvidence = (nodesByUnit.get(unit.entry_id) || []).flatMap(node => (
      (node.evidence_span_ids || []).map(id => spansById.get(id)).filter(Boolean).map(span => normalizedEvidence(span, {
        node_id: node.node_id,
        node_kind: node.kind,
        node_title: node.title
      })).filter(span => span && !duplicatePageNumbers.has(Number(span.pdf_page)))
    ))
    if (!derivedEvidence.length) continue
    logicalItems.push({
      logical_item_id: `discover:${catalog.edition_id}:${unit.entry_id}:derived`,
      source_mode: 'discover_scope_derived',
      textbook: {
        edition_id: catalog.edition_id,
        evidence_id: catalog.evidence_id,
        title: catalog.title,
        subject: catalog.subject,
        subject_slug: catalog.subject_slug,
        grade: catalog.grade,
        volume: catalog.volume
      },
      unit: {
        unit_id: unit.entry_id,
        title: unit.title,
        pdf_page_start: unit.start,
        pdf_page_end: unit.end,
        assignment_status: unit.assignment_status
      },
      evidence: derivedEvidence.slice(0, args.sidecarPagesPerItem * args.evidenceSpansPerPage),
      standards: scope
    })
  }

  const items = []
  for (const logical of logicalItems) {
    if (!logical.standards.length) continue
    if (logical.standards.length > args.candidatesPerItem) {
      throw new Error(`Candidate scope for ${logical.logical_item_id} has ${logical.standards.length} standards; raise --candidates-per-item so the complete scope fits one item.`)
    }
    const itemId = `${logical.logical_item_id}:c01`
    items.push({
      item_id: itemId,
      logical_item_id: logical.logical_item_id,
      source_mode: logical.source_mode,
      textbook: logical.textbook,
      unit: logical.unit,
      evidence: logical.evidence,
      candidates: logical.standards.map(standard => alignmentCandidateFromStandard(itemId, standard))
    })
  }
  const expectedPages = [...new Set(usableSidecarPages.map(page => Number(page.pdf_page)))]
    .sort((a, b) => a - b)
  const coverageCounts = new Map()
  for (const item of items) {
    for (const page of new Set(item.evidence.map(span => Number(span.pdf_page)).filter(Number.isInteger))) {
      coverageCounts.set(page, (coverageCounts.get(page) || 0) + 1)
    }
  }
  const expectedPageSet = new Set(expectedPages)
  const coveredPages = [...coverageCounts.keys()].sort((a, b) => a - b)
  const missingPages = expectedPages.filter(page => !coverageCounts.has(page))
  const extraPages = coveredPages.filter(page => !expectedPageSet.has(page))
  const duplicateItemPages = coveredPages.filter(page => coverageCounts.get(page) !== 1)
  const pageCoverage = {
    complete: sidecar.status === 'loaded'
      && expectedPages.length > 0
      && invalidNonemptySourceRows.length === 0
      && sidecarDeduplication.duplicate_pdf_page_numbers.length === 0
      && missingPages.length === 0
      && extraPages.length === 0
      && duplicateItemPages.length === 0,
    expected_nonempty_pdf_pages: expectedPages,
    covered_pdf_pages: coveredPages,
    missing_pdf_pages: missingPages,
    extra_pdf_pages: extraPages,
    duplicate_item_pdf_pages: duplicateItemPages,
    duplicate_source_pdf_pages: sidecarDeduplication.duplicate_pdf_page_numbers,
    invalid_nonempty_source_rows: invalidNonemptySourceRows
  }
  // The manifest hashes must use the same canonical order as checkpoint
  // batches. Discovery ranges are assembled in pedagogical/page order, while
  // checkpoints are sorted by item_id; hashing the former made otherwise
  // valid manifests impossible to apply for editions whose stable IDs do not
  // happen to sort in page order.
  const orderedItems = items.slice().sort((left, right) => left.item_id.localeCompare(right.item_id))
  const evidenceWorkset = orderedItems.map(({ candidates: _candidates, ...item }) => item)
  const candidateScope = orderedItems.map(item => ({
    item_id: item.item_id,
    textbook_edition_id: item.textbook.edition_id,
    candidates: item.candidates
  }))
  return {
    items: orderedItems,
    sidecar_status: sidecar.status,
    sidecar_sha256: sidecar.sha256 || null,
    sidecar_page_count: sidecarDeduplication.raw_page_count,
    sidecar_raw_page_count: sidecarDeduplication.raw_page_count,
    sidecar_unique_page_count: sidecarDeduplication.unique_page_count,
    sidecar_duplicate_page_count: sidecarDeduplication.duplicate_page_count,
    sidecar_discovery_page_count: usableSidecarPages.length,
    sidecar_nonempty_pdf_pages: expectedPages,
    sidecar_nonempty_page_set_hash: sha256(stableCanonicalJson(expectedPages)),
    sidecar_duplicate_page_map: sidecarDeduplication.duplicate_pages,
    sidecar_dedup_map_hash: sha256(stableCanonicalJson(sidecarDeduplication.duplicate_pages)),
    sidecar_invalid_nonempty_source_rows: invalidNonemptySourceRows,
    page_coverage: pageCoverage,
    evidence_workset_hash: sha256(stableCanonicalJson(evidenceWorkset)),
    candidate_scope_hash: sha256(stableCanonicalJson(candidateScope)),
    scope_standard_count: scope.length
  }
}

export function buildAlignmentWork({ catalogs, structuresByEdition, standardsByCode, args }) {
  const items = []
  const skipped = []
  const editions = []
  for (const catalog of catalogs) {
    const structure = structuresByEdition.get(catalog.edition_id)
    const editionSummary = {
      edition_id: catalog.edition_id,
      status: 'pending',
      adjudication_items: 0,
      discovery_items: 0,
      replace_machine_alignment_count: 0
    }
    if (!structure) {
      skipped.push({ edition_id: catalog.edition_id, reason: 'structure_not_found' })
      editionSummary.status = 'structure_not_found'
      editions.push(editionSummary)
      continue
    }
    if (args.mode === 'adjudicate') {
      const existing = buildExistingAdjudicationItems(catalog, structure, standardsByCode)
      items.push(...existing.items)
      skipped.push(...existing.skipped.map(row => ({ edition_id: catalog.edition_id, ...row })))
      editionSummary.adjudication_items = existing.items.length
    }
    if (args.mode === 'discover' || args.mode === 'both') {
      const discovery = buildDiscoveryItems(catalog, structure, standardsByCode, args)
      items.push(...discovery.items)
      if (args.mode === 'both') {
        editionSummary.replace_machine_alignment_count = (structure.alignments || []).filter(alignment => alignment.review_status !== 'approved').length
      }
      editionSummary.discovery_items = discovery.items.length
      editionSummary.page_only_discovery_items = discovery.items.filter(item => item.unit.assignment_status === 'unassigned_page_only').length
      editionSummary.sidecar_status = discovery.sidecar_status
      editionSummary.sidecar_page_count = discovery.sidecar_page_count
      editionSummary.sidecar_raw_page_count = discovery.sidecar_raw_page_count
      editionSummary.sidecar_unique_page_count = discovery.sidecar_unique_page_count
      editionSummary.sidecar_duplicate_page_count = discovery.sidecar_duplicate_page_count
      editionSummary.sidecar_discovery_page_count = discovery.sidecar_discovery_page_count
      editionSummary.sidecar_sha256 = discovery.sidecar_sha256
      editionSummary.sidecar_nonempty_pdf_pages = discovery.sidecar_nonempty_pdf_pages
      editionSummary.sidecar_nonempty_page_set_hash = discovery.sidecar_nonempty_page_set_hash
      editionSummary.sidecar_duplicate_page_map = discovery.sidecar_duplicate_page_map
      editionSummary.sidecar_dedup_map_hash = discovery.sidecar_dedup_map_hash
      editionSummary.sidecar_invalid_nonempty_source_rows = discovery.sidecar_invalid_nonempty_source_rows
      editionSummary.page_coverage = discovery.page_coverage
      editionSummary.evidence_workset_hash = discovery.evidence_workset_hash
      editionSummary.candidate_scope_hash = discovery.candidate_scope_hash
      editionSummary.scope_standard_count = discovery.scope_standard_count
    }
    const editionSkipped = skipped.filter(row => row.edition_id === catalog.edition_id)
    const discoveryRequired = args.mode === 'discover' || args.mode === 'both'
    editionSummary.status = editionSkipped.length
      ? 'skipped_inputs'
      : discoveryRequired && (editionSummary.sidecar_status !== 'loaded' || editionSummary.page_coverage?.complete !== true)
        ? 'incomplete_discovery_coverage'
        : (editionSummary.adjudication_items + editionSummary.discovery_items > 0) ? 'ready' : 'empty_workset'
    editions.push(editionSummary)
  }
  const sorted = items.sort((a, b) => a.textbook.edition_id.localeCompare(b.textbook.edition_id) || a.item_id.localeCompare(b.item_id))
  return {
    items: args.maxItems > 0 ? sorted.slice(0, args.maxItems) : sorted,
    totalBeforeLimit: sorted.length,
    skipped,
    editions
  }
}

export function makeRequestBatches(items, batchSize) {
  return chunks(items, batchSize).map(requestItems => ({ requestItems }))
}

/**
 * Sidecar line boxes are integrity-bound checkpoint input used to rematerialize
 * quote-level bboxes. They are not semantic evidence for the model and would
 * needlessly inflate prompt tokens, so provider payloads omit only this field.
 */
export function requestItemsForProvider(items) {
  return items.map(item => ({
    ...item,
    evidence: (item.evidence || []).map(span => {
      const providerSpan = { ...span }
      delete providerSpan.source_lines
      return providerSpan
    })
  }))
}

export function alignmentWorksetSummary(work, maxItems = 0) {
  const selected = work.items.length
  const available = work.totalBeforeLimit
  const omitted = Math.max(0, available - selected)
  return {
    complete: selected > 0
      && selected === available
      && (work.skipped || []).length === 0
      && (work.editions || []).length > 0
      && (work.editions || []).every(edition => edition.status === 'ready'),
    limited_by_max_items: omitted > 0,
    max_items: maxItems,
    selected_items: selected,
    available_items: available,
    omitted_items: omitted
  }
}

export function alignmentRunIsComplete({ work, incompleteInputHashes, successfulBatches, requestBatches }) {
  return work.items.length > 0
    && work.items.length === work.totalBeforeLimit
    && (work.skipped || []).length === 0
    && (work.editions || []).length > 0
    && (work.editions || []).every(edition => edition.status === 'ready')
    && incompleteInputHashes.length === 0
    && successfulBatches === requestBatches
}

export function estimateInputTokens(input) {
  // Conservative for Chinese (roughly one token per three UTF-8 bytes) and
  // intentionally an overestimate for most English text.
  return Math.ceil(Buffer.byteLength(`${LLM_ALIGNMENT_INSTRUCTIONS}\n${input}`, 'utf8') / 3)
}

export class AlignmentBudget {
  constructor(options) {
    this.limits = {
      requests: options.maxRequests,
      input_tokens: options.maxInputTokens,
      output_tokens: options.maxOutputTokensTotal,
      usd: options.maxUsd
    }
    this.rates = {
      input_usd_per_million: options.inputUsdPerMillion,
      output_usd_per_million: options.outputUsdPerMillion
    }
    this.used = { requests: 0, input_tokens: 0, output_tokens: 0, usd: 0 }
    this.reserved = { requests: 0, input_tokens: 0, output_tokens: 0, usd: 0 }
  }

  cost(inputTokens, outputTokens) {
    return inputTokens * this.rates.input_usd_per_million / 1_000_000
      + outputTokens * this.rates.output_usd_per_million / 1_000_000
  }

  reserve(inputTokens, outputTokens, requestSlots = 1) {
    const reservation = {
      requests: requestSlots,
      input_tokens: inputTokens * requestSlots,
      output_tokens: outputTokens * requestSlots,
      usd: this.cost(inputTokens, outputTokens) * requestSlots
    }
    for (const key of Object.keys(reservation)) {
      if (this.used[key] + this.reserved[key] + reservation[key] > this.limits[key]) return null
    }
    for (const key of Object.keys(reservation)) this.reserved[key] += reservation[key]
    return reservation
  }

  settle(reservation, usage, attempts = 1) {
    for (const key of Object.keys(reservation)) this.reserved[key] -= reservation[key]
    const reservedInputPerAttempt = Math.round(reservation.input_tokens / reservation.requests)
    const reservedOutputPerAttempt = Math.round(reservation.output_tokens / reservation.requests)
    // Only the last provider attempt exposes usage. Conservatively account for
    // earlier attempts at the reserved ceiling so retries cannot escape caps.
    const actualInput = usage?.input_tokens == null
      ? reservedInputPerAttempt * attempts
      : usage.input_tokens + reservedInputPerAttempt * Math.max(0, attempts - 1)
    const actualOutput = usage?.output_tokens == null
      ? reservedOutputPerAttempt * attempts
      : usage.output_tokens + reservedOutputPerAttempt * Math.max(0, attempts - 1)
    this.used.requests += attempts
    this.used.input_tokens += actualInput
    this.used.output_tokens += actualOutput
    this.used.usd += this.cost(actualInput, actualOutput)
  }

  snapshot() {
    return {
      limits: this.limits,
      accounting_rates: this.rates,
      used: {
        ...this.used,
        usd: Number(this.used.usd.toFixed(6))
      },
      reserved: {
        ...this.reserved,
        usd: Number(this.reserved.usd.toFixed(6))
      }
    }
  }
}

function cachePath(cacheRoot, inputHash) {
  return join(cacheRoot, inputHash.slice(0, 2), `${inputHash}.json`)
}

function readValidatedCache(path, requestItems, expected) {
  if (!existsSync(path)) return null
  try {
    const record = readJson(path)
    if (record.status !== 'ok' || record.input_hash !== expected.inputHash) return null
    if (stableCanonicalJson(record.request_items) !== stableCanonicalJson(requestItems)) return null
    if (record.provenance?.provider !== expected.provider || record.provenance?.model !== expected.model
      || record.provenance?.prompt_version !== LLM_ALIGNMENT_PROMPT_VERSION
      || record.provenance?.schema_version !== LLM_ALIGNMENT_SCHEMA_VERSION
      || record.provenance?.input_hash !== expected.inputHash) return null
    const validation = validateAlignmentModelOutput(record.model_output, requestItems)
    return validation.ok ? record : null
  } catch {
    return null
  }
}

export function addAlignmentValidationFeedback(input, errors) {
  const payload = JSON.parse(input)
  return JSON.stringify({
    ...payload,
    validation_feedback: {
      instruction: '上一份输出未通过语义契约。请重新返回完整替代结果，不要修补或省略候选决定。accept 时只能从下方白名单复制 evidence_span_id 与 learning_component_id，evidence_quote 必须从对应 evidence excerpt 原样连续复制；如果无法做到，必须 reject 或 abstain，绝不能猜测标识或改写引文。',
      errors: [...new Set((errors || []).map(error => String(error)).filter(Boolean))],
      allowed_identifiers: (payload.items || []).map(item => ({
        item_id: item.item_id,
        evidence_span_ids: (item.evidence || []).map(row => row.evidence_span_id),
        candidates: (item.candidates || []).map(candidate => ({
          candidate_id: candidate.candidate_id,
          standard_code: candidate.standard_code,
          learning_component_ids: (candidate.learning_components || []).map(component => component.component_id)
        }))
      }))
    }
  })
}

async function adjudicateBatch(batch, context) {
  const input = makeAlignmentResponseInput(requestItemsForProvider(batch.requestItems))
  const inputHash = alignmentInputHash({ provider: context.config.provider, model: context.config.model, items: batch.requestItems })
  const cached = readValidatedCache(cachePath(context.args.cacheRoot, inputHash), batch.requestItems, {
    inputHash,
    provider: context.config.provider,
    model: context.config.model
  })
  if (cached) return { ...cached, cache_hit: true }

  let latestErrors = []
  for (let validationAttempt = 0; validationAttempt <= context.args.validationRetries; validationAttempt += 1) {
    const attemptInput = validationAttempt === 0 ? input : addAlignmentValidationFeedback(input, latestErrors)
    const estimatedInputTokens = estimateInputTokens(attemptInput)
    const worstCaseAttempts = context.config.maxRetries + 1
    const reservation = context.budget.reserve(estimatedInputTokens, context.args.maxOutputTokens, worstCaseAttempts)
    if (!reservation) {
      return {
        record_type: 'batch_result',
        status: 'budget_exhausted',
        input_hash: inputHash,
        request_items: batch.requestItems,
        estimated_input_tokens: estimatedInputTokens,
        validation_errors: latestErrors
      }
    }
    const result = await requestAlignmentAdjudication(attemptInput, {
      config: context.config,
      maxOutputTokens: context.args.maxOutputTokens
    })
    context.budget.settle(reservation, result.usage, result.attempts || 1)
    if (!result.ok) {
      return {
        record_type: 'batch_result',
        status: result.status,
        input_hash: inputHash,
        request_items: batch.requestItems,
        estimated_input_tokens: estimatedInputTokens,
        provider_attempts: result.attempts || 0,
        latency_ms: result.latency_ms || null
      }
    }
    const validation = validateAlignmentModelOutput(result.output, batch.requestItems)
    if (!validation.ok) {
      latestErrors = validation.errors
      if (validationAttempt < context.args.validationRetries) continue
      return {
        record_type: 'batch_result',
        status: 'invalid_semantic_output',
        input_hash: inputHash,
        request_items: batch.requestItems,
        response_id: result.response_id,
        model: result.model,
        usage: result.usage,
        provider_attempts: result.attempts,
        validation_errors: validation.errors
      }
    }
    const record = {
      record_type: 'batch_result',
      status: 'ok',
      input_hash: inputHash,
      request_items: batch.requestItems,
      model_output: validation.value,
      provenance: {
        provider: result.provider || context.config.provider,
        model: result.model,
        prompt_version: LLM_ALIGNMENT_PROMPT_VERSION,
        schema_version: LLM_ALIGNMENT_SCHEMA_VERSION,
        input_hash: inputHash,
        response_id: result.response_id,
        generated_at: new Date().toISOString(),
        usage: result.usage,
        provider_attempts: result.attempts,
        validation_attempts: validationAttempt + 1,
        latency_ms: result.latency_ms
      }
    }
    atomicWriteJson(cachePath(context.args.cacheRoot, inputHash), record)
    return record
  }
  throw new Error('unreachable validation retry state')
}

export async function runPool(batches, concurrency, worker) {
  const results = new Array(batches.length)
  let cursor = 0
  let stopStatus = null
  let started = 0
  async function next() {
    while (!stopStatus && cursor < batches.length) {
      const index = cursor
      cursor += 1
      started += 1
      const result = await worker(batches[index], index)
      results[index] = result
      if (result?.status === 'codex_cli_auth_error') stopStatus = result.status
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, () => next()))
  const unstarted = Math.max(0, batches.length - started)
  return {
    results: results.filter(result => result !== undefined),
    circuit_opened: stopStatus !== null,
    stop_status: stopStatus,
    started_batches: started,
    unstarted_batches: unstarted
  }
}

function checkpointSuccesses(path, batches, config) {
  const records = readJsonLines(path)
  const requestByHash = new Map(batches.map(batch => {
    const hash = alignmentInputHash({ provider: config.provider, model: config.model, items: batch.requestItems })
    return [hash, batch.requestItems]
  }))
  const validRecords = []
  const successfulHashes = new Set()
  for (const record of records) {
    const requestItems = requestByHash.get(record.input_hash)
    if (!requestItems || record.status !== 'ok') continue
    const expectedHash = alignmentInputHash({ provider: config.provider, model: config.model, items: requestItems })
    const valid = record.input_hash === expectedHash
      && record.provenance?.provider === config.provider
      && record.provenance?.model === config.model
      && record.provenance?.prompt_version === LLM_ALIGNMENT_PROMPT_VERSION
      && record.provenance?.schema_version === LLM_ALIGNMENT_SCHEMA_VERSION
      && record.provenance?.input_hash === expectedHash
      && stableCanonicalJson(record.request_items) === stableCanonicalJson(requestItems)
      && validateAlignmentModelOutput(record.model_output, requestItems).ok
    if (!valid || successfulHashes.has(record.input_hash)) continue
    validRecords.push(record)
    successfulHashes.add(record.input_hash)
  }
  return {
    records,
    validRecords,
    successfulHashes
  }
}

function materializedGeneratedEvidenceSpan(span, evidenceQuote, { forceGenerated = false } = {}) {
  if (!span || (!span.generated_by_pipeline && !forceGenerated)) return null
  // Existing canonical spans normally do not retain the authenticated sidecar
  // lines used to locate one exact quote. In that case a broad, inherited bbox
  // could point at text outside the accepted quote, so fail closed to page-level
  // evidence instead of copying it into the rematerialized span.
  const preciseBbox = Array.isArray(span.source_lines) && span.source_lines.length
    ? locateEvidenceQuoteBbox({
        evidenceExcerpt: span.excerpt,
        evidenceQuote,
        lines: span.source_lines
      })
    : null
  // One sidecar excerpt can support several standards with different verbatim
  // quotes. A quote-specific identity keeps their precise bboxes independent;
  // reusing the broad source span ID would make two valid accepts collide at
  // apply time whenever their quote boxes differ.
  const quoteIdentity = normalizeAlignmentText(evidenceQuote)
  const materializedSpan = {
    ...span,
    evidence_span_id: stableId('tes_llm_quote', span.evidence_span_id, quoteIdentity),
    node_id: stableId('tcn_llm_quote', span.node_id, span.evidence_span_id, quoteIdentity),
    bbox: preciseBbox
  }
  delete materializedSpan.source_lines
  return materializedSpan
}

export function materializeAlignmentRecords(checkpointRecords, currentHashes) {
  const decisions = []
  const alignments = []
  for (const record of checkpointRecords) {
    if (record.status !== 'ok' || !currentHashes.has(record.input_hash)) continue
    const requestById = new Map(record.request_items.map(item => [item.item_id, item]))
    for (const outputItem of record.model_output.items) {
      const inputItem = requestById.get(outputItem.item_id)
      if (!inputItem) continue
      const candidates = new Map(inputItem.candidates.map(candidate => [candidate.candidate_id, candidate]))
      const evidence = new Map(inputItem.evidence.map(span => [span.evidence_span_id, span]))
      for (const modelDecision of outputItem.decisions) {
        const candidate = candidates.get(modelDecision.candidate_id)
        if (!candidate) continue
        const decisionId = stableDecisionId(record.input_hash, inputItem.item_id, modelDecision.candidate_id)
        const row = {
          decision_id: decisionId,
          edition_id: inputItem.textbook.edition_id,
          item_id: inputItem.item_id,
          logical_item_id: inputItem.logical_item_id,
          source_mode: inputItem.source_mode,
          prior_alignment_id: candidate.prior_alignment_id || inputItem.prior_alignment_id || null,
          unit_id: inputItem.unit.unit_id,
          unit_title: inputItem.unit.title,
          unit_assignment_status: inputItem.unit.assignment_status || 'assigned_toc_unit',
          candidate_id: modelDecision.candidate_id,
          standard_code: modelDecision.standard_code,
          decision: modelDecision.decision,
          relation_type: modelDecision.relation_type,
          evidence_level: modelDecision.evidence_level,
          evidence_span_id: modelDecision.evidence_span_id,
          evidence_quote: modelDecision.evidence_quote,
          learning_component_ids: modelDecision.learning_component_ids,
          rationale: modelDecision.rationale,
          overall_decision: outputItem.overall_decision,
          overall_rationale: outputItem.overall_rationale,
          provenance: record.provenance
        }
        decisions.push(row)
        if (modelDecision.decision !== 'accept') continue
        const span = evidence.get(modelDecision.evidence_span_id)
        const componentIds = new Set(modelDecision.learning_component_ids)
        const components = candidate.learning_components.filter(component => componentIds.has(component.component_id))
        const forcePageOnlyRematerialization = inputItem.source_mode === 'adjudicate_existing'
          && inputItem.unit.assignment_status === 'unassigned_page_only'
        const generatedEvidenceSpan = materializedGeneratedEvidenceSpan(span, modelDecision.evidence_quote, {
          forceGenerated: forcePageOnlyRematerialization
        })
        const materializedEvidenceSpanId = generatedEvidenceSpan?.evidence_span_id || span.evidence_span_id
        const materializedNodeId = generatedEvidenceSpan?.node_id || span.node_id
        alignments.push({
          decision_id: decisionId,
          alignment_id: stableAlignmentId(
            inputItem.textbook.edition_id,
            inputItem.logical_item_id,
            candidate.standard_code,
            materializedEvidenceSpanId,
            LLM_ALIGNMENT_PROMPT_VERSION
          ),
          edition_id: inputItem.textbook.edition_id,
          unit_id: inputItem.unit.unit_id,
          unit_title: inputItem.unit.title,
          unit_assignment_status: inputItem.unit.assignment_status || 'assigned_toc_unit',
          source_mode: inputItem.source_mode,
          logical_item_id: inputItem.logical_item_id,
          prior_alignment_id: candidate.prior_alignment_id || inputItem.prior_alignment_id || null,
          candidate_id: modelDecision.candidate_id,
          node_id: materializedNodeId,
          content_node_kind: span.node_kind,
          content_node_title: span.node_title,
          standard_code: candidate.standard_code,
          standard_text: candidate.standard_text,
          subject_slug: candidate.subject_slug,
          grade_band: candidate.grade_band,
          relation_type: modelDecision.relation_type,
          evidence_level: modelDecision.evidence_level,
          evidence_level_detail: modelDecision.evidence_level === 'L3' ? 'L3_page_evidence' : 'L2_topic',
          evidence_span_ids: [materializedEvidenceSpanId],
          evidence_excerpt: span.excerpt,
          evidence_excerpt_hash: span.excerpt_hash,
          evidence_quote: modelDecision.evidence_quote,
          learning_component_ids: modelDecision.learning_component_ids,
          learning_components: components,
          rationale: modelDecision.rationale,
          semantic_decision: 'accept',
          alignment_method: 'llm_semantic_adjudication',
          algorithm_version: LLM_ALIGNMENT_PROMPT_VERSION,
          provenance: record.provenance,
          evidence_role: mappedStandardSubject(inputItem.textbook.subject_slug) === inputItem.textbook.subject_slug
            ? 'direct_textbook'
            : 'discipline_textbook',
          evidence_id: inputItem.textbook.evidence_id || null,
          review_status: 'machine_checked',
          publication_status: 'published',
          pdf_page: span.pdf_page,
          end_pdf_page: span.pdf_page,
          printed_page: span.printed_page,
          generated_evidence_span: generatedEvidenceSpan,
          generated_content_node: (span.generated_by_pipeline || forcePageOnlyRematerialization) ? {
            node_id: materializedNodeId,
            parent_id: inputItem.unit.assignment_status === 'unassigned_page_only' ? null : inputItem.unit.unit_id,
            unit_id: inputItem.unit.assignment_status === 'unassigned_page_only' ? null : inputItem.unit.unit_id,
            level: inputItem.unit.assignment_status === 'unassigned_page_only' ? 0 : 1,
            kind: span.node_kind,
            title: modelDecision.evidence_quote.slice(0, 100),
            pdf_page: span.pdf_page,
            end_pdf_page: span.pdf_page,
            printed_page: span.printed_page,
            end_printed_page: span.printed_page,
            text_excerpt: span.excerpt.slice(0, 280),
            evidence_span_ids: [materializedEvidenceSpanId],
            source: span.source,
            extraction_method: span.extraction_method,
            review_status: 'machine_checked'
          } : null
        })
      }
    }
  }
  const unique = rows => [...new Map(rows.map(row => [row.decision_id || row.alignment_id, row])).values()]
  return {
    decisions: unique(decisions).sort((a, b) => a.edition_id.localeCompare(b.edition_id) || a.item_id.localeCompare(b.item_id) || a.standard_code.localeCompare(b.standard_code)),
    alignments: unique(alignments).sort((a, b) => a.edition_id.localeCompare(b.edition_id) || String(a.unit_id).localeCompare(String(b.unit_id)) || Number(a.pdf_page) - Number(b.pdf_page) || a.standard_code.localeCompare(b.standard_code))
  }
}

function outputBase(args, config, catalogs) {
  if (args.outputPath) return args.outputPath.replace(/\.jsonl$/u, '')
  const scopeHash = sha256(stableCanonicalJson({
    editions: catalogs.map(row => row.edition_id),
    mode: args.mode,
    prompt: LLM_ALIGNMENT_PROMPT_VERSION,
    provider: config.provider,
    model: config.model,
    candidatesPerItem: args.candidatesPerItem,
    pagesPerItem: args.sidecarPagesPerItem
  })).slice(0, 16)
  return join(DEFAULT_OUTPUT_ROOT, `alignment-${scopeHash}`)
}

function planSummary({ args, config, catalogs, work, batches }) {
  const candidatePairs = work.items.reduce((sum, item) => sum + item.candidates.length, 0)
  const estimatedInput = batches.reduce((sum, batch) => sum + estimateInputTokens(makeAlignmentResponseInput(requestItemsForProvider(batch.requestItems))), 0)
  const workset = alignmentWorksetSummary(work, args.maxItems)
  const discoveryPageCounts = work.editions.reduce((counts, edition) => ({
    raw: counts.raw + Number(edition.sidecar_raw_page_count || 0),
    unique: counts.unique + Number(edition.sidecar_unique_page_count || 0),
    duplicate: counts.duplicate + Number(edition.sidecar_duplicate_page_count || 0)
  }), { raw: 0, unique: 0, duplicate: 0 })
  return {
    dry_run: args.dryRun,
    provider: config.provider,
    model: config.model,
    prompt_version: LLM_ALIGNMENT_PROMPT_VERSION,
    schema_version: LLM_ALIGNMENT_SCHEMA_VERSION,
    mode: args.mode,
    textbooks: catalogs.length,
    selected_edition_ids: catalogs.map(row => row.edition_id),
    replace_machine_alignments: args.mode === 'both' ? catalogs.map(row => row.edition_id) : [],
    discovery_config: {
      library_root: args.libraryRoot,
      sidecar_pages_per_item: args.sidecarPagesPerItem,
      evidence_spans_per_page_compatibility: args.evidenceSpansPerPage,
      candidates_per_item: args.candidatesPerItem,
      batch_size: args.batchSize
    },
    work_items: work.items.length,
    work_items_before_limit: work.totalBeforeLimit,
    workset_complete: workset.complete,
    work_items_omitted: workset.omitted_items,
    selection: workset,
    candidate_pairs: candidatePairs,
    request_batches: batches.length,
    estimated_input_tokens_without_retries: estimatedInput,
    maximum_output_tokens_without_retries: batches.length * args.maxOutputTokens,
    concurrency: args.concurrency,
    budget: {
      max_requests: args.maxRequests,
      max_input_tokens: args.maxInputTokens,
      max_output_tokens: args.maxOutputTokensTotal,
      max_usd: args.maxUsd,
      accounting_rates_are_operator_configurable_safety_rates: true
    },
    discovery_page_counts: discoveryPageCounts,
    editions: work.editions,
    skipped_count: work.skipped.length,
    fatal_skipped_count: work.skipped.length,
    workset_hash: sha256(stableCanonicalJson(work.items))
  }
}

export async function runAlignmentPipeline(args, dependencies = {}) {
  const sourceEnv = dependencies.env || process.env
  const config = dependencies.config || resolveAlignmentLlmConfig(args.provider
    ? { ...sourceEnv, KEBIAO_ALIGNMENT_LLM_PROVIDER: args.provider }
    : sourceEnv)
  const catalog = readJson(CATALOG_PATH).items || []
  const catalogs = catalog.filter(row => row.resource_type === 'student_textbook' && catalogSelected(row, args))
    .sort((a, b) => a.edition_id.localeCompare(b.edition_id))
  if (!catalogs.length) throw new Error('No textbooks matched the requested --edition/--subject filters.')

  const standardsByCode = loadStandardIndex()
  const structuresByEdition = new Map(catalogs.flatMap(row => {
    const path = join(STRUCTURE_ROOT, `${row.edition_id}.json`)
    return existsSync(path) ? [[row.edition_id, readJson(path)]] : []
  }))
  const work = buildAlignmentWork({ catalogs, structuresByEdition, standardsByCode, args })
  const batches = makeRequestBatches(work.items, args.batchSize)
  const plan = planSummary({ args, config, catalogs, work, batches })
  if (args.dryRun) return { plan, output: null }
  if (!config.enabled) {
    throw new Error(config.provider === 'codex_cli'
      ? 'codex_cli is unavailable: install/sign in to Codex CLI or choose openai_responses.'
      : 'LLM is disabled: provide KEBIAO_LLM_API_KEY (or KEBIAO_ALIGNMENT_LLM_API_KEY), or explicitly use --provider codex_cli.')
  }
  if (!config.valid) throw new Error(config.provider === 'codex_cli' ? 'codex_cli configuration is invalid.' : 'LLM base URL must be a valid HTTPS URL.')

  const base = outputBase(args, config, catalogs)
  const checkpointPath = `${base}.checkpoint.jsonl`
  const decisionsPath = `${base}.decisions.jsonl`
  const alignmentsPath = `${base}.alignments.jsonl`
  const manifestPath = `${base}.manifest.json`
  mkdirSync(dirname(checkpointPath), { recursive: true })
  const checkpoint = args.resume
    ? checkpointSuccesses(checkpointPath, batches, config)
    : { records: [], validRecords: [], successfulHashes: new Set() }
  if (!args.resume && existsSync(checkpointPath)) atomicWriteJsonLines(checkpointPath, [])
  if (!existsSync(checkpointPath)) atomicWriteJsonLines(checkpointPath, [])
  const budget = new AlignmentBudget(args)
  const currentHashes = new Set()
  const pending = []
  for (const batch of batches) {
    const hash = alignmentInputHash({ provider: config.provider, model: config.model, items: batch.requestItems })
    currentHashes.add(hash)
    if (!checkpoint.successfulHashes.has(hash)) pending.push(batch)
  }

  const pool = await runPool(pending, args.concurrency, async batch => {
    const record = await adjudicateBatch(batch, { args, budget, config })
    appendFileSync(checkpointPath, `${JSON.stringify(record)}\n`)
    return record
  })
  const newRecords = pool.results
  const currentRecords = [...checkpoint.validRecords, ...newRecords.filter(record => record.status === 'ok')]
  const allCurrentAttempts = [...checkpoint.validRecords, ...newRecords]
  // Compact the checkpoint to the current request set. This prevents stale or
  // invalid historical rows from becoming part of an authenticated manifest.
  atomicWriteJsonLines(checkpointPath, allCurrentAttempts)
  const materialized = materializeAlignmentRecords(currentRecords, currentHashes)
  atomicWriteJsonLines(decisionsPath, materialized.decisions)
  atomicWriteJsonLines(alignmentsPath, materialized.alignments)
  const statusCounts = Object.fromEntries([...new Set(allCurrentAttempts.map(record => record.status))].sort().map(status => [
    status,
    allCurrentAttempts.filter(record => record.status === status).length
  ]))
  const successfulHashes = new Set(currentRecords.map(record => record.input_hash))
  const incompleteInputHashes = [...currentHashes].filter(hash => !successfulHashes.has(hash)).sort()
  const artifactDigests = {
    checkpoint_sha256: sha256(readFileSync(checkpointPath)),
    decisions_sha256: sha256(readFileSync(decisionsPath)),
    alignments_sha256: sha256(readFileSync(alignmentsPath))
  }
  const complete = alignmentRunIsComplete({
    work,
    incompleteInputHashes,
    successfulBatches: successfulHashes.size,
    requestBatches: batches.length
  })
  const terminalError = pool.stop_status
    ? {
        status: pool.stop_status,
        circuit_opened: true,
        unstarted_batches: pool.unstarted_batches
      }
    : null
  const manifest = {
    ...plan,
    dry_run: false,
    completed_at: new Date().toISOString(),
    checkpoint_path: checkpointPath,
    decisions_path: decisionsPath,
    alignments_path: alignmentsPath,
    current_input_hashes: [...currentHashes].sort(),
    source_structure_hashes: Object.fromEntries([...structuresByEdition].map(([editionId, structure]) => [editionId, sha256(stableCanonicalJson(structure))])),
    artifact_digests: artifactDigests,
    complete,
    run_status: complete ? 'complete' : terminalError ? 'error' : 'incomplete',
    terminal_error: terminalError,
    successful_batches: successfulHashes.size,
    incomplete_input_hashes: incompleteInputHashes,
    resumed_batches: checkpoint.validRecords.length,
    attempted_new_batches: newRecords.length,
    unstarted_new_batches: pool.unstarted_batches,
    status_counts: statusCounts,
    decisions: materialized.decisions.length,
    accepted_alignments: materialized.alignments.length,
    abstained: materialized.decisions.filter(row => row.decision === 'abstain').length,
    rejected: materialized.decisions.filter(row => row.decision === 'reject').length,
    budget: budget.snapshot(),
    skipped: work.skipped
  }
  atomicWriteJson(manifestPath, manifest)
  return { plan, output: manifest }
}

export function alignmentPipelineExitCode(result) {
  return result?.output && result.output.complete !== true ? 1 : 0
}

async function main() {
  const args = parseAlignmentArgs(process.argv.slice(2))
  const result = await runAlignmentPipeline(args)
  process.stdout.write(`${JSON.stringify(result.output || result.plan, null, 2)}\n`)
  process.exitCode = alignmentPipelineExitCode(result)
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
