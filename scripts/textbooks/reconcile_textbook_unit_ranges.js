#!/usr/bin/env node

/**
 * Reconcile top-level textbook unit ranges against verbatim page headings.
 *
 * This pipeline is deliberately narrow. It only accepts an exact unit title
 * or an allow-listed auxiliary-section title within the first few sidecar
 * lines of a page. Body mentions, inferred topics and fuzzy title matches are
 * not boundary evidence.
 */

import { createHash } from 'node:crypto'
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '../..')
const DEFAULT_STRUCTURE_ROOT = join(ROOT, 'data/textbooks/derived/by-edition')
const DEFAULT_LIBRARY_ROOT = process.env.TEXTBOOK_LIBRARY_ROOT || '/Volumes/X9 Pro/kebiao-library'
export const DEFAULT_UNIT_RANGE_RECOVERY_CATALOG = join(ROOT, 'data/textbooks/catalog/unit_range_recoveries.json')
const TOP_LINE_LIMIT = 4

export const UNIT_RANGE_RECONCILER_VERSION = 'sidecar-top-heading-unit-range-v2'
export const AUTHENTICATED_TOC_RECOVERY_VERSION = 'authenticated-toc-offset-recovery-v1'
export const AUTOMATIC_REVIEW_POLICY = 'automatic_no_human_gate'

export const DEFAULT_AUXILIARY_SECTION_TITLES = Object.freeze([
  'Additional Material',
  'Notes on the Text',
  'Tapescripts',
  'Tape Scripts',
  'Audio Scripts',
  'Vocabulary Index',
  'Words and Expressions in Each Unit',
  'Irregular Verbs'
])

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function readJsonLines(path) {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line)
      } catch (error) {
        throw new Error(`Invalid JSONL at ${path}:${index + 1}: ${error.message}`)
      }
    })
}

function writeJsonAtomic(path, value) {
  const temporary = `${path}.tmp-${process.pid}`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporary, path)
}

export function loadUnitRangeRecoveryCatalog(path = DEFAULT_UNIT_RANGE_RECOVERY_CATALOG) {
  if (!existsSync(path)) return { schema_version: 1, items: [] }
  const payload = readJson(path)
  if (payload.schema_version !== 1 || !Array.isArray(payload.items)) {
    throw new Error(`Invalid unit range recovery catalog: ${path}`)
  }
  const seenEditions = new Set()
  for (const item of payload.items) {
    if (!/^ed_[a-f0-9]+$/u.test(String(item.edition_id || ''))) throw new Error('Recovery item has an invalid edition_id')
    if (seenEditions.has(item.edition_id)) throw new Error(`Duplicate recovery edition: ${item.edition_id}`)
    seenEditions.add(item.edition_id)
    if (!/^[a-f0-9]{64}$/u.test(String(item.source_asset_sha256 || ''))) {
      throw new Error(`Recovery item ${item.edition_id} has an invalid source_asset_sha256`)
    }
    if (item.sidecar_sha256 != null && !/^[a-f0-9]{64}$/u.test(String(item.sidecar_sha256))) {
      throw new Error(`Recovery item ${item.edition_id} has an invalid sidecar_sha256`)
    }
    if (!Array.isArray(item.units) || item.units.length < 2) throw new Error(`Recovery item ${item.edition_id} needs at least two units`)
    const ordinals = item.units.map(unit => Number(unit.ordinal))
    const starts = item.units.map(unit => positivePage(unit.pdf_page_start))
    if (new Set(ordinals).size !== ordinals.length || ordinals.some((ordinal, index) => ordinal !== index + 1)) {
      throw new Error(`Recovery item ${item.edition_id} must use consecutive unique ordinals starting at 1`)
    }
    if (starts.some(page => !page) || starts.some((page, index) => index > 0 && page <= starts[index - 1])) {
      throw new Error(`Recovery item ${item.edition_id} must use strictly increasing positive PDF starts`)
    }
    for (let index = 0; index < item.units.length; index += 1) {
      const unit = item.units[index]
      if (!String(unit.title || '').trim()) throw new Error(`Recovery item ${item.edition_id} has an empty unit title`)
      const end = positivePage(unit.pdf_page_end)
      if (!end || end < starts[index]) throw new Error(`Recovery item ${item.edition_id} has an invalid unit end`)
      if (index + 1 < starts.length && end !== starts[index + 1] - 1) {
        throw new Error(`Recovery item ${item.edition_id} must use contiguous unit ranges`)
      }
      if (!positivePage(unit.evidence_pdf_page)) throw new Error(`Recovery item ${item.edition_id} lacks a TOC evidence page`)
    }
  }
  return payload
}

export function findAuthenticatedUnitRangeRecovery(catalog, editionId, sourceAssetSha256) {
  const item = (catalog?.items || []).find(candidate => candidate.edition_id === editionId)
  if (!item) return null
  if (item.source_asset_sha256 !== sourceAssetSha256) {
    throw new Error(`Authenticated unit recovery source hash mismatch for ${editionId}`)
  }
  return item
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u2000-\u200f\u2028-\u202f\u2060\ufeff]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleUpperCase('en-US')
}

function positivePage(value) {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : null
}

function comparableRange(node) {
  return {
    start: positivePage(node.pdf_page_start) || positivePage(node.pdf_page),
    end: positivePage(node.pdf_page_end) || positivePage(node.end_pdf_page) || positivePage(node.pdf_page)
  }
}

function topLines(page, limit = TOP_LINE_LIMIT) {
  return (page.lines || [])
    .slice(0, limit)
    .map((line, lineIndex) => ({
      line_index: lineIndex,
      verbatim_title: String(line.text || '').trim(),
      normalized_title: normalizeTitle(line.text),
      bbox: line.bbox || null
    }))
    .filter(line => line.normalized_title)
}

function headingEvidence(page, line, evidenceType) {
  return {
    evidence_type: evidenceType,
    pdf_page: page.pdf_page,
    verbatim_title: line.verbatim_title,
    line_index: line.line_index,
    bbox: line.bbox,
    extraction_method: page.extraction_method || null
  }
}

function firstExactHeading(pages, normalizedTitle, minimumPage, maximumPage, topLineLimit) {
  for (const page of pages) {
    if (page.pdf_page < minimumPage || page.pdf_page > maximumPage) continue
    const line = topLines(page, topLineLimit).find(candidate => candidate.normalized_title === normalizedTitle)
    if (line) return headingEvidence(page, line, 'unit_heading')
  }
  return null
}

function firstAuxiliaryHeading(pages, minimumPage, auxiliaryTitles, topLineLimit) {
  const allowed = new Set(auxiliaryTitles.map(normalizeTitle))
  for (const page of pages) {
    if (page.pdf_page <= minimumPage) continue
    const line = topLines(page, topLineLimit).find(candidate => allowed.has(candidate.normalized_title))
    if (line) return headingEvidence(page, line, 'auxiliary_section_heading')
  }
  return null
}

function printedPageLookup(structure) {
  return new Map((structure.page_map || [])
    .map(row => [positivePage(row.pdf_page), row.printed_page ?? null])
    .filter(([page]) => page))
}

function isTopLevelUnit(entry) {
  return entry?.kind === 'unit'
    && Number(entry.level || 1) === 1
    && !entry.parent_id
    && positivePage(entry.pdf_page)
}

function unitAtPage(units, page) {
  if (!page) return null
  return units.find(unit => page >= unit.start && page <= unit.end) || null
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function refreshedTocAudit(structure, toc) {
  const reviewCounts = toc.reduce((counts, entry) => {
    const status = String(entry.review_status || '').trim()
    if (status === 'approved') counts.approved += 1
    if (status === 'candidate') counts.candidate += 1
    if (status === 'machine_checked') counts.machineChecked += 1
    if (entry.publication_status === 'published') counts.published += 1
    return counts
  }, { approved: 0, candidate: 0, machineChecked: 0, published: 0 })
  return {
    ...(structure.audit || {}),
    approved_toc_entry_count: reviewCounts.approved,
    candidate_toc_entry_count: reviewCounts.candidate,
    machine_checked_toc_entry_count: reviewCounts.machineChecked,
    published_toc_entry_count: reviewCounts.published
  }
}

function reconcileContentNodes(contentNodes, units, printedPages, options = {}) {
  const originalNodes = contentNodes || []
  const validTocEntryIds = options.validTocEntryIds || null
  const canonicalNodeByUnit = new Map()
  for (const node of originalNodes) {
    if (node.toc_entry_id && units.some(unit => unit.entry.entry_id === node.toc_entry_id)) {
      canonicalNodeByUnit.set(node.toc_entry_id, node.node_id)
    }
  }
  const unitIds = new Set(units.map(unit => unit.entry.entry_id))
  const canonicalNodeIds = new Set(canonicalNodeByUnit.values())
  const nodeById = new Map(originalNodes.map(node => [node.node_id, node]))
  let reassigned = 0
  let detached = 0
  let clamped = 0

  const nodes = originalNodes.map(node => {
    const canonicalUnit = node.toc_entry_id
      ? units.find(unit => unit.entry.entry_id === node.toc_entry_id)
      : null
    if (canonicalUnit) {
      const updated = {
        ...node,
        parent_id: null,
        unit_id: canonicalUnit.entry.entry_id,
        pdf_page: canonicalUnit.start,
        pdf_page_start: canonicalUnit.start,
        end_pdf_page: canonicalUnit.end,
        pdf_page_end: canonicalUnit.end,
        printed_page: printedPages.get(canonicalUnit.start) ?? node.printed_page ?? null,
        end_printed_page: printedPages.get(canonicalUnit.end) ?? node.end_printed_page ?? null
      }
      if (!sameValue(node, updated)) clamped += 1
      return updated
    }

    const range = comparableRange(node)
    const targetUnit = unitAtPage(units, range.start)
    if (!targetUnit) {
      const updated = {
        ...node,
        toc_entry_id: validTocEntryIds && node.toc_entry_id && !validTocEntryIds.has(node.toc_entry_id)
          ? null
          : node.toc_entry_id,
        unit_id: null,
        parent_id: null
      }
      if (node.unit_id !== null || node.parent_id !== null || node.toc_entry_id !== updated.toc_entry_id) detached += 1
      return updated
    }

    const targetUnitId = targetUnit.entry.entry_id
    const rootNodeId = canonicalNodeByUnit.get(targetUnitId) || null
    const previousParent = nodeById.get(node.parent_id)
    const parentIsUnitReference = unitIds.has(node.parent_id) || canonicalNodeIds.has(node.parent_id)
    const parentCrossesBoundary = previousParent && previousParent.unit_id !== targetUnitId
    const parentIsDangling = Boolean(node.parent_id)
      && !previousParent
      && validTocEntryIds
      && !validTocEntryIds.has(node.parent_id)
    const unitChanged = node.unit_id !== targetUnitId
    const nextParentId = !node.parent_id || parentIsUnitReference || parentCrossesBoundary || parentIsDangling || unitChanged
      ? rootNodeId
      : node.parent_id
    const originalEnd = range.end || range.start
    const clampedEnd = Math.max(range.start, Math.min(originalEnd, targetUnit.end))
    const updated = {
      ...node,
      toc_entry_id: validTocEntryIds && node.toc_entry_id && !validTocEntryIds.has(node.toc_entry_id)
        ? null
        : node.toc_entry_id,
      parent_id: nextParentId,
      unit_id: targetUnitId,
      pdf_page_start: range.start,
      pdf_page_end: clampedEnd,
      end_pdf_page: clampedEnd
    }
    if (unitChanged || node.parent_id !== nextParentId) reassigned += 1
    if (originalEnd !== clampedEnd) clamped += 1
    return updated
  })

  return { nodes, reassigned, detached, clamped }
}

function expectedAuthenticatedRanges(structure, recovery, options) {
  return recovery.units.map(unit => {
    const start = positivePage(unit.pdf_page_start)
    const end = positivePage(unit.pdf_page_end)
    const entryId = stableRecoveryUnitId(
      structure.edition_id,
      recovery.source_asset_sha256,
      unit.ordinal,
      unit.title
    )
    const startEvidence = {
      evidence_type: 'authenticated_toc_printed_page_anchor',
      pdf_page: positivePage(unit.evidence_pdf_page),
      printed_page: String(unit.printed_page_start),
      verbatim_title: String(unit.title),
      source_asset_sha256: recovery.source_asset_sha256,
      sidecar_sha256: recovery.sidecar_sha256 || options.sidecarSha256 || null
    }
    return {
      entry: {
        entry_id: entryId,
        parent_id: null,
        level: 1,
        kind: 'unit',
        title: String(unit.title),
        pdf_page: start,
        end_pdf_page: end,
        printed_page: String(unit.printed_page_start),
        end_printed_page: String(unit.printed_page_end),
        confidence: Number(recovery.confidence || 0.99),
        review_status: 'machine_checked',
        publication_status: 'published',
        source: 'body_inferred_unit',
        range_source: AUTHENTICATED_TOC_RECOVERY_VERSION,
        range_review_policy: AUTOMATIC_REVIEW_POLICY,
        range_provenance: {
          algorithm_version: AUTHENTICATED_TOC_RECOVERY_VERSION,
          provenance: 'machine_generated',
          review_policy: AUTOMATIC_REVIEW_POLICY,
          publication_gate: false,
          evidence_basis: 'authenticated_toc_printed_page_constant_offset',
          printed_to_pdf_offset: Number(recovery.printed_to_pdf_offset),
          start_evidence: startEvidence,
          end_evidence: indexEndEvidence(recovery, unit)
        }
      },
      start,
      end,
      startEvidence,
      endEvidence: indexEndEvidence(recovery, unit)
    }
  })
}

function authenticatedRecoveryStateMatches(structure, ranges) {
  const expectedById = new Map(ranges.map(range => [range.entry.entry_id, range]))
  const unitEntries = (structure.toc || []).filter(entry => entry?.kind === 'unit')
  if (unitEntries.length !== ranges.length) return false
  for (const entry of unitEntries) {
    const expected = expectedById.get(entry.entry_id)?.entry
    if (!expected) return false
    const criticalFields = [
      'parent_id', 'level', 'kind', 'title', 'pdf_page', 'end_pdf_page',
      'printed_page', 'end_printed_page', 'review_status', 'publication_status',
      'source', 'range_source', 'range_review_policy', 'range_provenance'
    ]
    if (criticalFields.some(field => !sameValue(entry[field] ?? null, expected[field] ?? null))) return false
  }

  const nodes = structure.content_nodes || []
  const nodeById = new Map(nodes.map(node => [node.node_id, node]))
  const expectedUnitIds = new Set(expectedById.keys())
  const currentTocIds = new Set((structure.toc || []).map(entry => entry.entry_id))
  for (const node of nodes) {
    const range = comparableRange(node)
    if (!range.start || !range.end || range.end < range.start) return false
    const owner = unitAtPage(ranges, range.start)
    if (!owner) {
      if (node.unit_id != null || node.parent_id != null) return false
    } else {
      if (node.unit_id !== owner.entry.entry_id || range.end > owner.end) return false
      const parent = node.parent_id ? nodeById.get(node.parent_id) : null
      if (parent && parent.unit_id !== owner.entry.entry_id) return false
      if (node.parent_id && !parent && !currentTocIds.has(node.parent_id)) return false
    }
    if (node.unit_id != null && !expectedUnitIds.has(node.unit_id)) return false
    if (node.toc_entry_id && !currentTocIds.has(node.toc_entry_id)) return false
    if (expectedUnitIds.has(node.toc_entry_id)) {
      const canonical = expectedById.get(node.toc_entry_id)
      if (node.unit_id !== node.toc_entry_id
        || node.parent_id != null
        || range.start !== canonical.start
        || range.end !== canonical.end) return false
    }
  }
  return true
}

function isPublishedUnitEntry(entry) {
  return entry?.kind === 'unit'
    && (entry.review_status === 'approved' || entry.publication_status === 'published')
}

/**
 * Fail closed before carrying approved relationships across a recovered TOC.
 * An approval is only durable while its unit, node, evidence spans and every
 * referenced page still exist inside the current published unit range.
 */
export function assertApprovedAlignmentReferences({
  structure,
  contentNodes = structure?.content_nodes || [],
  evidenceSpans = structure?.evidence_spans || [],
  alignments = structure?.alignments || []
}) {
  const approved = alignments.filter(alignment => alignment.review_status === 'approved')
  if (!approved.length) return { approved_alignment_count: 0 }

  const units = new Map((structure?.toc || [])
    .filter(isPublishedUnitEntry)
    .map(entry => [entry.entry_id, {
      entry,
      start: positivePage(entry.pdf_page),
      end: positivePage(entry.end_pdf_page) || positivePage(entry.pdf_page)
    }]))
  const nodes = new Map(contentNodes.map(node => [node.node_id, node]))
  const spans = new Map(evidenceSpans.map(span => [span.span_id, span]))

  for (const alignment of approved) {
    const alignmentId = alignment.alignment_id || '(missing alignment_id)'
    const unit = units.get(alignment.unit_id)
    if (!unit || !unit.start || !unit.end) {
      throw new Error(`Approved alignment ${alignmentId} references a missing or unpublished unit: ${alignment.unit_id || '(missing)'}`)
    }
    const node = nodes.get(alignment.node_id)
    if (!node || node.unit_id !== alignment.unit_id) {
      throw new Error(`Approved alignment ${alignmentId} references a missing node or a node owned by another unit: ${alignment.node_id || '(missing)'}`)
    }
    const alignmentStart = positivePage(alignment.pdf_page)
    const alignmentEnd = positivePage(alignment.end_pdf_page) || alignmentStart
    const nodeRange = comparableRange(node)
    if (!alignmentStart || !alignmentEnd
      || alignmentStart < unit.start || alignmentEnd > unit.end || alignmentEnd < alignmentStart
      || !nodeRange.start || !nodeRange.end
      || nodeRange.start < unit.start || nodeRange.end > unit.end || nodeRange.end < nodeRange.start) {
      throw new Error(`Approved alignment ${alignmentId} has a page outside published unit ${alignment.unit_id}`)
    }
    const spanIds = Array.isArray(alignment.evidence_span_ids) ? alignment.evidence_span_ids : []
    if (!spanIds.length) {
      throw new Error(`Approved alignment ${alignmentId} does not reference a current evidence span`)
    }
    for (const spanId of spanIds) {
      const span = spans.get(spanId)
      const spanPage = positivePage(span?.pdf_page)
      if (!span
        || span.node_id !== alignment.node_id
        || !Array.isArray(node.evidence_span_ids)
        || !node.evidence_span_ids.includes(spanId)
        || !spanPage
        || spanPage < unit.start
        || spanPage > unit.end) {
        throw new Error(`Approved alignment ${alignmentId} references a missing or out-of-range evidence span: ${spanId}`)
      }
    }
  }
  return { approved_alignment_count: approved.length }
}

function stableRecoveryUnitId(editionId, sourceAssetSha256, ordinal, title) {
  return `tcu_${createHash('sha256').update([
    AUTHENTICATED_TOC_RECOVERY_VERSION,
    editionId,
    sourceAssetSha256,
    ordinal,
    normalizeTitle(title)
  ].join('\u001f')).digest('hex').slice(0, 16)}`
}

function recoveredTocStructure(structure, recovery, pages, options) {
  const sourceAssetSha256 = options.sourceAssetSha256 || structure.content_alignment?.source_asset_sha256 || null
  if (sourceAssetSha256 !== recovery.source_asset_sha256) {
    throw new Error(`Authenticated unit recovery source hash mismatch for ${structure.edition_id}`)
  }
  if (recovery.sidecar_sha256 && recovery.sidecar_sha256 !== options.sidecarSha256) {
    throw new Error(`Authenticated unit recovery sidecar hash mismatch for ${structure.edition_id}`)
  }
  const recoveryDigest = createHash('sha256').update(JSON.stringify(recovery)).digest('hex')
  const ranges = expectedAuthenticatedRanges(structure, recovery, options)
  const previous = structure.unit_range_reconciliation
  if (previous?.algorithm_version === AUTHENTICATED_TOC_RECOVERY_VERSION
    && previous?.source_asset_sha256 === recovery.source_asset_sha256
    && previous?.sidecar_sha256 === (recovery.sidecar_sha256 || options.sidecarSha256 || null)
    && previous?.recovery_digest === recoveryDigest
    && authenticatedRecoveryStateMatches(structure, ranges)) {
    const toc = structure.toc || []
    return {
      structure: { ...structure, audit: refreshedTocAudit(structure, toc) },
      report: previous
    }
  }
  const printedPages = printedPageLookup(structure)
  const removedIds = new Set((structure.toc || [])
    .filter(entry => entry?.kind === 'unit' && Number(entry.level || 1) === 1 && !entry.parent_id)
    .map(entry => entry.entry_id))
  let expanded = true
  while (expanded) {
    expanded = false
    for (const entry of structure.toc || []) {
      if (entry.parent_id && removedIds.has(entry.parent_id) && !removedIds.has(entry.entry_id)) {
        removedIds.add(entry.entry_id)
        expanded = true
      }
    }
  }
  const retained = (structure.toc || []).filter(entry => !removedIds.has(entry.entry_id))
  const toc = [...retained, ...ranges.map(unit => unit.entry)]
    .sort((left, right) => Number(left.pdf_page || 0) - Number(right.pdf_page || 0) || left.entry_id.localeCompare(right.entry_id))
  const nodeResult = reconcileContentNodes(structure.content_nodes, ranges, printedPages, {
    validTocEntryIds: new Set(toc.map(entry => entry.entry_id))
  })
  const changes = ranges.map(unit => ({
    unit_id: unit.entry.entry_id,
    title: unit.entry.title,
    before: null,
    after: { pdf_page: unit.start, end_pdf_page: unit.end },
    start_evidence: unit.startEvidence,
    end_evidence: unit.endEvidence
  }))
  const provenance = {
    schema_version: 1,
    algorithm_version: AUTHENTICATED_TOC_RECOVERY_VERSION,
    range_reconciler_version: UNIT_RANGE_RECONCILER_VERSION,
    provenance: 'machine_generated',
    review_policy: AUTOMATIC_REVIEW_POLICY,
    publication_gate: false,
    evidence_policy: 'authenticated_toc_printed_page_constant_offset',
    status: 'authenticated_toc_recovered',
    source_asset_sha256: recovery.source_asset_sha256,
    sidecar_sha256: recovery.sidecar_sha256 || options.sidecarSha256 || null,
    recovery_digest: recoveryDigest,
    inspected_page_count: pages.length,
    top_level_unit_count: ranges.length,
    exact_unit_heading_evidence_count: ranges.length,
    auxiliary_boundary_evidence: recovery.auxiliary_boundary || null,
    replaced_top_level_unit_count: removedIds.size,
    changed_unit_range_count: changes.length,
    reassigned_content_node_count: nodeResult.reassigned,
    detached_auxiliary_content_node_count: nodeResult.detached,
    clamped_content_node_range_count: nodeResult.clamped,
    changes
  }
  return {
    structure: {
      ...structure,
      toc,
      content_nodes: nodeResult.nodes,
      audit: refreshedTocAudit(structure, toc),
      unit_range_reconciliation: provenance
    },
    report: provenance
  }
}

function indexEndEvidence(recovery, unit) {
  const next = recovery.units.find(candidate => Number(candidate.ordinal) === Number(unit.ordinal) + 1)
  if (next) {
    return {
      evidence_type: 'next_authenticated_toc_printed_page_anchor',
      pdf_page: positivePage(next.evidence_pdf_page),
      printed_page: String(next.printed_page_start),
      verbatim_title: String(next.title),
      source_asset_sha256: recovery.source_asset_sha256
    }
  }
  return recovery.auxiliary_boundary || {
    evidence_type: 'authenticated_toc_declared_unit_end',
    printed_page: String(unit.printed_page_end),
    pdf_page: positivePage(unit.pdf_page_end)
  }
}

/**
 * Return a reconciled copy of a textbook structure and a deterministic report.
 * No fuzzy matching or semantic inference is performed.
 */
export function reconcileTextbookUnitRanges(structure, sidecarPages, options = {}) {
  const topLineLimit = Number(options.topLineLimit || TOP_LINE_LIMIT)
  if (!Number.isInteger(topLineLimit) || topLineLimit < 1 || topLineLimit > 12) {
    throw new Error('topLineLimit must be an integer between 1 and 12')
  }
  const pages = [...sidecarPages]
    .filter(page => positivePage(page.pdf_page))
    .sort((left, right) => left.pdf_page - right.pdf_page)
  const pageNumbers = pages.map(page => page.pdf_page)
  if (!pages.length || new Set(pageNumbers).size !== pages.length) {
    throw new Error('Sidecar pages must contain unique positive pdf_page values')
  }
  if (options.authenticatedRecovery) {
    return recoveredTocStructure(structure, options.authenticatedRecovery, pages, options)
  }
  const tocUnits = (structure.toc || [])
    .filter(isTopLevelUnit)
    .sort((left, right) => left.pdf_page - right.pdf_page || left.entry_id.localeCompare(right.entry_id))
  if (!tocUnits.length) {
    const provenance = {
      schema_version: 1,
      algorithm_version: UNIT_RANGE_RECONCILER_VERSION,
      provenance: 'machine_generated',
      review_policy: AUTOMATIC_REVIEW_POLICY,
      publication_gate: false,
      evidence_policy: 'sidecar_top_verbatim_titles_and_auxiliary_titles_only',
      status: 'no_top_level_units',
      source_asset_sha256: options.sourceAssetSha256 || structure.content_alignment?.source_asset_sha256 || null,
      sidecar_sha256: options.sidecarSha256 || null,
      inspected_page_count: pages.length,
      changes: []
    }
    return { structure: { ...structure, unit_range_reconciliation: provenance }, report: provenance }
  }

  const lastPage = pages.at(-1).pdf_page
  const detected = tocUnits.map((entry, index) => {
    const previousStart = positivePage(tocUnits[index - 1]?.pdf_page)
    const nextStart = positivePage(tocUnits[index + 1]?.pdf_page)
    const currentStart = positivePage(entry.pdf_page)
    const minimumPage = previousStart ? previousStart + 1 : Math.max(1, currentStart - 2)
    const maximumPage = nextStart ? nextStart - 1 : lastPage
    const startEvidence = firstExactHeading(
      pages,
      normalizeTitle(entry.title),
      minimumPage,
      maximumPage,
      topLineLimit
    )
    return {
      entry,
      start: startEvidence?.pdf_page || currentStart,
      startEvidence
    }
  })

  if (!detected.some(unit => unit.startEvidence)) {
    const provenance = {
      schema_version: 1,
      algorithm_version: UNIT_RANGE_RECONCILER_VERSION,
      provenance: 'machine_generated',
      review_policy: AUTOMATIC_REVIEW_POLICY,
      publication_gate: false,
      evidence_policy: 'sidecar_top_verbatim_titles_and_auxiliary_titles_only',
      status: 'insufficient_boundary_evidence',
      source_asset_sha256: options.sourceAssetSha256 || structure.content_alignment?.source_asset_sha256 || null,
      sidecar_sha256: options.sidecarSha256 || null,
      inspected_page_count: pages.length,
      top_line_limit: topLineLimit,
      top_level_unit_count: detected.length,
      exact_unit_heading_evidence_count: 0,
      changed_unit_range_count: 0,
      reassigned_content_node_count: 0,
      detached_auxiliary_content_node_count: 0,
      clamped_content_node_range_count: 0,
      changes: []
    }
    return {
      structure: { ...structure, unit_range_reconciliation: provenance },
      report: provenance
    }
  }

  const lastUnit = detected.at(-1)
  const auxiliaryEvidence = firstAuxiliaryHeading(
    pages,
    lastUnit.start,
    options.auxiliaryTitles || DEFAULT_AUXILIARY_SECTION_TITLES,
    topLineLimit
  )
  const printedPages = printedPageLookup(structure)
  const changes = []
  const ranges = detected.map((unit, index) => {
    const next = detected[index + 1]
    const originalStart = positivePage(unit.entry.pdf_page)
    const originalEnd = positivePage(unit.entry.end_pdf_page) || originalStart
    const endEvidence = next?.startEvidence
      ? { ...next.startEvidence, evidence_type: 'next_unit_heading' }
      : (!next && auxiliaryEvidence ? auxiliaryEvidence : null)
    let end = next?.startEvidence ? next.start - 1 : originalEnd
    if (!next && auxiliaryEvidence) end = auxiliaryEvidence.pdf_page - 1
    end = Math.max(unit.start, end)
    if (originalStart !== unit.start || originalEnd !== end) {
      changes.push({
        unit_id: unit.entry.entry_id,
        title: unit.entry.title,
        before: { pdf_page: originalStart, end_pdf_page: originalEnd },
        after: { pdf_page: unit.start, end_pdf_page: end },
        start_evidence: unit.startEvidence,
        end_evidence: endEvidence
      })
    }
    return { ...unit, end, endEvidence }
  })

  const tocById = new Map(ranges.map(unit => {
    const rangeProvenance = {
      algorithm_version: UNIT_RANGE_RECONCILER_VERSION,
      provenance: 'machine_generated',
      review_policy: AUTOMATIC_REVIEW_POLICY,
      publication_gate: false,
      evidence_basis: 'sidecar_top_verbatim_title',
      start_evidence: unit.startEvidence,
      end_evidence: unit.endEvidence
    }
    if (!unit.startEvidence && !unit.endEvidence) return [unit.entry.entry_id, unit.entry]
    return [unit.entry.entry_id, {
      ...unit.entry,
      pdf_page: unit.start,
      end_pdf_page: unit.end,
      printed_page: printedPages.get(unit.start) ?? unit.entry.printed_page ?? null,
      end_printed_page: printedPages.get(unit.end) ?? unit.entry.end_printed_page ?? null,
      range_source: UNIT_RANGE_RECONCILER_VERSION,
      range_review_policy: AUTOMATIC_REVIEW_POLICY,
      range_provenance: rangeProvenance
    }]
  }))
  const toc = (structure.toc || []).map(entry => tocById.get(entry.entry_id) || entry)
  const nodeResult = reconcileContentNodes(structure.content_nodes, ranges, printedPages)
  const generatedProvenance = {
    schema_version: 1,
    algorithm_version: UNIT_RANGE_RECONCILER_VERSION,
    provenance: 'machine_generated',
    review_policy: AUTOMATIC_REVIEW_POLICY,
    publication_gate: false,
    evidence_policy: 'sidecar_top_verbatim_titles_and_auxiliary_titles_only',
    status: 'reconciled',
    source_asset_sha256: options.sourceAssetSha256 || structure.content_alignment?.source_asset_sha256 || null,
    sidecar_sha256: options.sidecarSha256 || null,
    inspected_page_count: pages.length,
    top_line_limit: topLineLimit,
    top_level_unit_count: ranges.length,
    exact_unit_heading_evidence_count: ranges.filter(unit => unit.startEvidence).length,
    auxiliary_boundary_evidence: auxiliaryEvidence,
    changed_unit_range_count: changes.length,
    reassigned_content_node_count: nodeResult.reassigned,
    detached_auxiliary_content_node_count: nodeResult.detached,
    clamped_content_node_range_count: nodeResult.clamped,
    changes
  }
  const previousProvenance = structure.unit_range_reconciliation
  const noCurrentMutation = changes.length === 0
    && nodeResult.reassigned === 0
    && nodeResult.detached === 0
    && nodeResult.clamped === 0
  const sameAuthenticatedSource = previousProvenance?.source_asset_sha256 === generatedProvenance.source_asset_sha256
    && previousProvenance?.sidecar_sha256 === generatedProvenance.sidecar_sha256
  const provenance = noCurrentMutation
    && previousProvenance?.algorithm_version === UNIT_RANGE_RECONCILER_VERSION
    && sameAuthenticatedSource
      ? previousProvenance
      : generatedProvenance
  return {
    structure: {
      ...structure,
      toc,
      content_nodes: nodeResult.nodes,
      audit: refreshedTocAudit(structure, toc),
      unit_range_reconciliation: provenance
    },
    report: provenance
  }
}

function parseArgs(argv) {
  const args = {
    editionIds: [],
    all: false,
    apply: false,
    strict: false,
    libraryRoot: DEFAULT_LIBRARY_ROOT,
    structureRoot: DEFAULT_STRUCTURE_ROOT,
    recoveryCatalog: DEFAULT_UNIT_RANGE_RECOVERY_CATALOG,
    topLineLimit: TOP_LINE_LIMIT
  }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--edition' || value === '--edition-id') args.editionIds.push(argv[++index])
    else if (value === '--all') args.all = true
    else if (value === '--apply') args.apply = true
    else if (value === '--strict') args.strict = true
    else if (value === '--library-root') args.libraryRoot = resolve(argv[++index])
    else if (value === '--structure-root') args.structureRoot = resolve(argv[++index])
    else if (value === '--recovery-catalog') args.recoveryCatalog = resolve(argv[++index])
    else if (value === '--no-recovery-catalog') args.recoveryCatalog = null
    else if (value === '--sidecar') args.sidecar = resolve(argv[++index])
    else if (value === '--top-line-limit') args.topLineLimit = Number(argv[++index])
    else if (value === '--help' || value === '-h') args.help = true
    else throw new Error(`Unknown argument: ${value}`)
  }
  if (args.all && args.editionIds.length) throw new Error('--all and --edition are mutually exclusive')
  if (args.sidecar && (args.all || args.editionIds.length !== 1)) {
    throw new Error('--sidecar requires exactly one --edition')
  }
  return args
}

function usage() {
  return `Usage:
  node scripts/textbooks/reconcile_textbook_unit_ranges.js --edition EDITION_ID
  node scripts/textbooks/reconcile_textbook_unit_ranges.js --edition EDITION_ID --apply --strict
  node scripts/textbooks/reconcile_textbook_unit_ranges.js --all --apply

The command previews by default. --apply atomically updates the per-edition
structure. Evidence is limited to exact titles in the first four sidecar lines.`
}

function safeSidecarPath(args, structure) {
  if (args.sidecar) return args.sidecar
  const relativePath = structure.content_alignment?.sidecar_path
  if (!relativePath) throw new Error('Structure is missing content_alignment.sidecar_path')
  const root = resolve(args.libraryRoot)
  const path = resolve(root, relativePath)
  const rel = relative(root, path)
  if (rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith('/') || !existsSync(path)) {
    throw new Error(`Missing or unsafe sidecar path: ${relativePath}`)
  }
  return path
}

function selectedStructurePaths(args) {
  if (args.all) {
    return readdirSync(args.structureRoot)
      .filter(name => /^ed_[a-f0-9]+\.json$/u.test(name))
      .sort()
      .map(name => join(args.structureRoot, name))
  }
  if (!args.editionIds.length) throw new Error('Provide --edition or --all')
  return args.editionIds.map(editionId => join(args.structureRoot, `${editionId}.json`))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  const structurePaths = selectedStructurePaths(args)
  const recoveryCatalog = args.recoveryCatalog
    ? loadUnitRangeRecoveryCatalog(args.recoveryCatalog)
    : { schema_version: 1, items: [] }
  const results = []
  for (const structurePath of structurePaths) {
    if (!existsSync(structurePath)) throw new Error(`Missing structure: ${structurePath}`)
    const structure = readJson(structurePath)
    const sidecarPath = safeSidecarPath(args, structure)
    const sidecarPages = readJsonLines(sidecarPath)
    const sidecarSha256 = sha256File(sidecarPath)
    const sourceAssetSha256 = structure.content_alignment?.source_asset_sha256 || null
    const authenticatedRecovery = findAuthenticatedUnitRangeRecovery(
      recoveryCatalog,
      structure.edition_id,
      sourceAssetSha256
    )
    const result = reconcileTextbookUnitRanges(structure, sidecarPages, {
      topLineLimit: args.topLineLimit,
      sidecarSha256,
      sourceAssetSha256,
      authenticatedRecovery
    })
    if (args.strict && !['reconciled', 'authenticated_toc_recovered'].includes(result.report.status)) {
      throw new Error(`${structure.edition_id}: ${result.report.status}`)
    }
    if (args.apply) writeJsonAtomic(structurePath, result.structure)
    results.push({
      edition_id: structure.edition_id,
      mode: args.apply ? 'applied' : 'preview',
      sidecar_path: sidecarPath,
      ...result.report
    })
  }
  console.log(JSON.stringify({
    schema_version: 1,
    algorithm_version: UNIT_RANGE_RECONCILER_VERSION,
    mode: args.apply ? 'apply' : 'preview',
    completed_count: results.length,
    items: results
  }, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(error.stack || error.message)
    process.exitCode = 1
  })
}
