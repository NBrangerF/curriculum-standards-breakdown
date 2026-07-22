#!/usr/bin/env node

/**
 * Audit the automatic textbook-content → curriculum-standard data product.
 *
 * This audit deliberately has no human review or publication gate. It checks
 * that automatically generated relationships are already safe to expose:
 * complete, internally referential, page-backed where claimed, and reversible
 * between edition records and the canonical alignment index.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { nowIso, readJson, readJsonLines, writeJson } from './library_common.js'

const ROOT = resolve(import.meta.dirname, '../..')
const DEFAULT_STRUCTURE_ROOT = join(ROOT, 'data/textbooks/derived/by-edition')
const DEFAULT_INDEX = join(ROOT, 'data/textbooks/derived/textbook_standard_alignment_index.json')
const DEFAULT_REPORT = join(ROOT, 'data/textbooks/derived/content_alignment_report.json')
const DEFAULT_OUT = join(ROOT, 'data/textbooks/derived/content_alignment_audit.json')
const EXPECTED_TEXTBOOKS = 141
const BODY_INFERRED_UNIT_SOURCE = 'body_inferred_unit'

const FRONT_MATTER_PATTERN = /(?:\bISBN\b|\bCIP\b|版权所有|出版发行|责任编辑|责任校对|封面设计|版式设计|印刷(?:厂|时间|日期|单位|次数)|第\s*\d+\s*次印刷|定价\s*[:：]|邮政编码|邮编\s*[:：]|联系电话|质量问题|联系调换|著作权|图书在版编目|未经许可|不得翻印)/iu
const TOC_HEADING_PATTERN = /^\s*(?:目\s*录|contents?)\s*$/iu
const TOC_LEADER_PATTERN = /(?:\.{4,}|…{3,}|·{4,}|—{5,})\s*[A-Z]?\d{1,3}\s*$/iu
const MACHINE_PROVENANCE = new Set(['machine_generated', 'automatic', 'automated'])
const SPECIFIC_RELATION_TYPES = new Set(['supports', 'practices', 'assesses', 'teaches', 'mentions', 'contextualizes'])

function parseArgs(argv) {
  const args = {
    structureRoot: DEFAULT_STRUCTURE_ROOT,
    index: DEFAULT_INDEX,
    report: DEFAULT_REPORT,
    out: DEFAULT_OUT,
    expectedTextbooks: EXPECTED_TEXTBOOKS,
    strict: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--structure-root') args.structureRoot = resolve(argv[++index])
    else if (value === '--index') args.index = resolve(argv[++index])
    else if (value === '--report') args.report = resolve(argv[++index])
    else if (value === '--out') args.out = resolve(argv[++index])
    else if (value === '--expected-textbooks') args.expectedTextbooks = Number(argv[++index])
    else if (value === '--strict') args.strict = true
    else if (value === '--help' || value === '-h') args.help = true
    else throw new Error(`Unknown argument: ${value}`)
  }
  return args
}

function usage() {
  return `Usage:
  node scripts/textbooks/audit_textbook_content_alignments.js [--strict]

Options:
  --structure-root PATH       Derived by-edition directory
  --index PATH                Canonical textbook-standard alignment index
  --report PATH               Latest extraction/alignment run report
  --out PATH                  Audit JSON output
  --expected-textbooks COUNT  Expected current student-textbook count (default 141)
  --strict                    Exit non-zero when any audit error is found`
}

function integer(value) {
  return Number.isInteger(value) ? value : null
}

function pageStart(row) {
  return integer(row?.pdf_page) ?? integer(row?.pdf_page_start)
}

function pageEnd(row) {
  return integer(row?.end_pdf_page) ?? integer(row?.pdf_page_end) ?? pageStart(row)
}

function spanId(span) {
  return span?.evidence_span_id || span?.span_id || null
}

function evidenceText(span) {
  return String(span?.excerpt || span?.text || '')
}

function isBodyInferredUnit(unit) {
  return unit?.source === BODY_INFERRED_UNIT_SOURCE
}

function isPublishedUnit(unit) {
  return unit?.review_status === 'approved'
    || (isBodyInferredUnit(unit)
      && unit?.review_status === 'machine_checked'
      && unit?.publication_status === 'published')
}

function isMachineAlignment(alignment) {
  return MACHINE_PROVENANCE.has(alignment?.provenance)
    || alignment?.review_status === 'machine_checked'
    || alignment?.alignment_method === 'component_evidence_hybrid'
}

function isSpecificAlignment(alignment) {
  return SPECIFIC_RELATION_TYPES.has(alignment?.relation_type)
}

function isTocOrFrontMatterText(value) {
  const lines = String(value || '').split(/\r?\n/u).map(line => line.trim()).filter(Boolean)
  if (FRONT_MATTER_PATTERN.test(value)) return true
  if (lines.some(line => TOC_HEADING_PATTERN.test(line))) return true
  return lines.some(line => TOC_LEADER_PATTERN.test(line))
}

function alignmentFingerprint(alignment) {
  return JSON.stringify({
    alignment_id: alignment.alignment_id,
    edition_id: alignment.edition_id,
    unit_id: alignment.unit_id ?? null,
    node_id: alignment.node_id ?? null,
    standard_code: alignment.standard_code,
    relation_type: alignment.relation_type,
    evidence_level: alignment.evidence_level ?? null,
    evidence_span_ids: [...(alignment.evidence_span_ids || [])].sort(),
    pdf_page: alignment.pdf_page ?? null,
    end_pdf_page: alignment.end_pdf_page ?? null,
    review_status: alignment.review_status ?? null,
    publication_status: alignment.publication_status ?? null
  })
}

function increment(record, key, amount = 1) {
  record[key] = (record[key] || 0) + amount
}

function sortedRecord(record) {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)))
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  const errors = []
  const warnings = []
  const addError = (code, message, context = {}) => errors.push({ code, message, ...context })
  const addWarning = (code, message, context = {}) => warnings.push({ code, message, ...context })

  const currentPath = join(ROOT, 'data/textbooks/library-state/CURRENT.json')
  if (!existsSync(currentPath)) addError('missing_current', 'CURRENT textbook library pointer is missing')
  const current = existsSync(currentPath) ? readJson(currentPath) : {}
  const registryPath = current.generation_id
    ? join(ROOT, `data/textbooks/library-state/generations/${current.generation_id}/asset_registry.lock.jsonl`)
    : null
  if (!registryPath || !existsSync(registryPath)) addError('missing_registry', 'Current asset registry is missing', { path: registryPath })

  const registry = registryPath && existsSync(registryPath) ? readJsonLines(registryPath) : []
  const textbooks = registry.filter(row => row.resource_type === 'student_textbook')
  const textbookByEdition = new Map()
  for (const textbook of textbooks) {
    if (textbookByEdition.has(textbook.edition_id)) {
      addError('duplicate_registry_edition', 'Student textbook edition appears more than once in the current registry', { edition_id: textbook.edition_id })
    }
    textbookByEdition.set(textbook.edition_id, textbook)
  }
  if (textbooks.length !== args.expectedTextbooks) {
    addError('registry_count_mismatch', `Current registry has ${textbooks.length} student textbooks; expected ${args.expectedTextbooks}`)
  }

  if (!existsSync(args.structureRoot)) addError('missing_structure_root', 'Derived by-edition directory is missing', { path: args.structureRoot })
  const structureFiles = existsSync(args.structureRoot)
    ? readdirSync(args.structureRoot).filter(file => file.endsWith('.json')).sort()
    : []
  const allStructures = new Map()
  for (const file of structureFiles) {
    const path = join(args.structureRoot, file)
    let structure
    try {
      structure = readJson(path)
    } catch (error) {
      addError('invalid_structure_json', 'Could not parse derived edition record', { file, detail: error.message })
      continue
    }
    if (!structure.edition_id) {
      addError('missing_structure_edition', 'Derived edition record has no edition_id', { file })
      continue
    }
    if (basename(file, '.json') !== structure.edition_id) {
      addError('structure_filename_mismatch', 'Derived edition filename does not match edition_id', { file, edition_id: structure.edition_id })
    }
    if (allStructures.has(structure.edition_id)) {
      addError('duplicate_structure_edition', 'Multiple derived records use the same edition_id', { edition_id: structure.edition_id })
    }
    allStructures.set(structure.edition_id, structure)
  }

  if (!existsSync(args.index)) addError('missing_canonical_index', 'Canonical textbook-standard alignment index is missing', { path: args.index })
  const canonicalIndex = existsSync(args.index) ? readJson(args.index) : {}
  if (canonicalIndex.source_generation_id && current.generation_id
    && canonicalIndex.source_generation_id !== current.generation_id) {
    addError('index_generation_mismatch', 'Canonical index was not built from CURRENT textbook generation', {
      expected: current.generation_id,
      actual: canonicalIndex.source_generation_id
    })
  }

  const runReport = existsSync(args.report) ? readJson(args.report) : null
  if (!runReport) addWarning('missing_run_report', 'Latest content alignment run report is missing', { path: args.report })
  if (runReport) {
    if (runReport.source_generation_id !== current.generation_id) {
      addError('report_generation_mismatch', 'Content alignment run report was not built from CURRENT textbook generation', {
        expected: current.generation_id,
        actual: runReport.source_generation_id
      })
    }
    const failures = runReport.failures || []
    if (runReport.failure_count !== failures.length) {
      addError('report_failure_count_mismatch', 'Run report failure_count does not match failures array length')
    }
    if (runReport.selected_count !== (runReport.completed_count || 0) + failures.length) {
      addError('report_completion_count_mismatch', 'Run report selected_count is not completed_count + failure_count')
    }
    for (const failure of failures) {
      addError('content_alignment_run_failure', 'Content alignment generation reported a failed edition', {
        edition_id: failure.edition_id,
        detail: failure.error
      })
    }
    if (runReport.selected_count !== textbooks.length) {
      addWarning('partial_latest_run', 'Latest run report covers only part of the library; canonical coverage is audited from all edition records', {
        selected_count: runReport.selected_count,
        current_textbooks: textbooks.length
      })
    }
  }

  const standardCodes = new Set()
  const standardRoot = join(ROOT, 'public/data/by_subject')
  if (existsSync(standardRoot)) {
    for (const file of readdirSync(standardRoot).filter(name => name.endsWith('.json'))) {
      const payload = readJson(join(standardRoot, file))
      for (const standard of payload.standards || []) if (standard.code) standardCodes.add(standard.code)
    }
  } else addWarning('missing_standard_data', 'Public standard data is unavailable; standard_code existence was not audited')

  const globalNodeIds = new Map()
  const globalSpanIds = new Map()
  const globalAlignmentIds = new Map()
  const editionAlignments = new Map()
  const bySubject = {}
  const evidenceLevels = {}
  const evidenceRoles = {}
  const relationTypes = {}
  const nodeKinds = {}
  const parserVersions = {}
  const algorithmVersions = {}
  const coverage = {
    registry_textbooks: textbooks.length,
    structure_records: 0,
    content_processed: 0,
    with_content_nodes: 0,
    with_evidence_spans: 0,
    with_alignments: 0,
    with_l3_page_evidence: 0,
    scope_only: 0,
    unlocated_toc_entries: 0,
    normalized_toc_ranges: 0,
    missing_structures: 0,
    generation_failures: runReport?.failure_count || 0
  }
  let totalNodes = 0
  let totalSpans = 0
  let totalAlignments = 0
  let l3Alignments = 0
  let machineAlignments = 0
  let publishedAlignments = 0

  for (const textbook of textbooks.sort((left, right) => left.edition_id.localeCompare(right.edition_id))) {
    const editionId = textbook.edition_id
    const subject = textbook.subject_slug || 'unknown'
    const subjectStats = bySubject[subject] ||= {
      textbooks: 0,
      processed: 0,
      with_nodes: 0,
      with_spans: 0,
      with_alignments: 0,
      with_l3: 0,
      scope_only: 0,
      content_nodes: 0,
      evidence_spans: 0,
      alignments: 0,
      l2_alignments: 0,
      l3_alignments: 0,
      failures: 0
    }
    subjectStats.textbooks += 1
    const structure = allStructures.get(editionId)
    if (!structure) {
      coverage.missing_structures += 1
      subjectStats.failures += 1
      addError('missing_edition_structure', 'Current student textbook has no derived edition record', { edition_id: editionId, subject_slug: subject })
      continue
    }
    coverage.structure_records += 1
    if (structure.evidence_id && structure.evidence_id !== textbook.evidence_id) {
      addError('structure_evidence_mismatch', 'Derived edition evidence_id differs from current registry', { edition_id: editionId })
    }
    const contentMetadata = structure.content_alignment
    if (!contentMetadata) {
      subjectStats.failures += 1
      addError('content_alignment_not_processed', 'Current textbook has no automatic content-alignment metadata', { edition_id: editionId, subject_slug: subject })
    } else {
      coverage.content_processed += 1
      subjectStats.processed += 1
      increment(parserVersions, contentMetadata.parser_version || 'unknown')
      increment(algorithmVersions, contentMetadata.algorithm_version || 'unknown')
      if (contentMetadata.source_asset_sha256 !== textbook.sha256) {
        addError('content_source_asset_mismatch', 'Content alignment metadata references a stale or different PDF asset', { edition_id: editionId })
      }
      if (contentMetadata.review_policy !== 'automatic_no_human_gate') {
        addError('invalid_review_policy', 'Content alignment must use the automatic no-human-gate policy', { edition_id: editionId, actual: contentMetadata.review_policy })
      }
    }

    const pageCount = integer(textbook.pages)
    if (!pageCount || pageCount < 1) addError('invalid_registry_page_count', 'Registry textbook has an invalid PDF page count', { edition_id: editionId, pages: textbook.pages })
    const toc = structure.toc || []
    const tocById = new Map()
    const publishedUnits = new Map()
    for (const unit of toc) {
      if (!unit.entry_id) {
        addError('missing_unit_id', 'TOC/unit entry has no entry_id', { edition_id: editionId })
        continue
      }
      if (tocById.has(unit.entry_id)) addError('duplicate_unit_id', 'TOC/unit entry_id is duplicated within an edition', { edition_id: editionId, unit_id: unit.entry_id })
      tocById.set(unit.entry_id, unit)
      const start = pageStart(unit)
      const end = pageEnd(unit)
      if (!start) {
        coverage.unlocated_toc_entries += 1
        if (isBodyInferredUnit(unit)) addError('unlocated_body_inferred_unit', 'body_inferred_unit must have a positive PDF page', { edition_id: editionId, unit_id: unit.entry_id })
      } else if (!end || start < 1 || end < start || (pageCount && end > pageCount)) {
        if (isBodyInferredUnit(unit)) addError('invalid_body_inferred_unit_range', 'body_inferred_unit has an invalid PDF page range', { edition_id: editionId, unit_id: unit.entry_id, pdf_page: start, end_pdf_page: end, page_count: pageCount })
        else coverage.normalized_toc_ranges += 1
      }
      if (isBodyInferredUnit(unit)
        && (unit.review_status !== 'machine_checked' || unit.publication_status !== 'published')) {
        addError('unpublished_body_inferred_unit', 'body_inferred_unit must be machine_checked and published', { edition_id: editionId, unit_id: unit.entry_id })
      }
      if (isPublishedUnit(unit)) publishedUnits.set(unit.entry_id, unit)
    }
    for (const unit of toc) {
      if (unit.parent_id && !tocById.has(unit.parent_id)) {
        addError('missing_unit_parent', 'TOC/unit entry references a missing parent', { edition_id: editionId, unit_id: unit.entry_id, parent_id: unit.parent_id })
      }
    }

    const nodes = structure.content_nodes || []
    const spans = structure.evidence_spans || []
    const alignments = structure.alignments || []
    editionAlignments.set(editionId, alignments)
    totalNodes += nodes.length
    totalSpans += spans.length
    totalAlignments += alignments.length
    subjectStats.content_nodes += nodes.length
    subjectStats.evidence_spans += spans.length
    subjectStats.alignments += alignments.length
    if (nodes.length) { coverage.with_content_nodes += 1; subjectStats.with_nodes += 1 }
    if (spans.length) { coverage.with_evidence_spans += 1; subjectStats.with_spans += 1 }
    if (alignments.length) { coverage.with_alignments += 1; subjectStats.with_alignments += 1 }
    else { coverage.scope_only += 1; subjectStats.scope_only += 1 }

    if (contentMetadata) {
      const expectedCounts = {
        content_node_count: nodes.length,
        evidence_span_count: spans.length,
        alignment_count: alignments.length
      }
      for (const [field, actual] of Object.entries(expectedCounts)) {
        if (contentMetadata[field] !== actual) {
          addError('content_metadata_count_mismatch', 'Content alignment metadata count does not match the edition arrays', { edition_id: editionId, field, expected: actual, actual: contentMetadata[field] })
        }
      }
    }

    const nodesById = new Map()
    for (const node of nodes) {
      if (!node.node_id) {
        addError('missing_node_id', 'Content node has no node_id', { edition_id: editionId })
        continue
      }
      if (nodesById.has(node.node_id)) addError('duplicate_node_id_in_edition', 'Content node ID is duplicated within an edition', { edition_id: editionId, node_id: node.node_id })
      if (globalNodeIds.has(node.node_id)) addError('duplicate_node_id_global', 'Content node ID is duplicated across editions', { edition_id: editionId, other_edition_id: globalNodeIds.get(node.node_id), node_id: node.node_id })
      nodesById.set(node.node_id, node)
      globalNodeIds.set(node.node_id, editionId)
      increment(nodeKinds, node.kind || 'unknown')
      const start = pageStart(node)
      const end = pageEnd(node)
      if (!start || !end || start < 1 || end < start || (pageCount && end > pageCount)) {
        addError('invalid_node_page_range', 'Content node has an invalid PDF page range', { edition_id: editionId, node_id: node.node_id, pdf_page: start, end_pdf_page: end, page_count: pageCount })
      }
      if (node.unit_id && !publishedUnits.has(node.unit_id)) {
        addError('invalid_node_unit', 'Content node does not reference an approved or published body-inferred unit', { edition_id: editionId, node_id: node.node_id, unit_id: node.unit_id })
      }
      if (node.unit_id && publishedUnits.has(node.unit_id)) {
        const unit = publishedUnits.get(node.unit_id)
        const unitStart = pageStart(unit)
        const unitEnd = unitStart ? Math.max(unitStart, pageEnd(unit) || unitStart) : null
        if (!unitStart) {
          addError('node_uses_unlocated_unit', 'Content node references a TOC/unit entry with no locatable PDF page', { edition_id: editionId, node_id: node.node_id, unit_id: node.unit_id, pdf_page: start })
        } else if (start && (start < unitStart || start > unitEnd)) {
          addError('node_outside_unit', 'Content node starts outside its unit page range', { edition_id: editionId, node_id: node.node_id, unit_id: node.unit_id, pdf_page: start })
        }
      }
    }
    for (const node of nodes) {
      if (node.parent_id && !nodesById.has(node.parent_id) && !tocById.has(node.parent_id)) {
        addError('missing_node_parent', 'Content node references a missing parent node/unit', { edition_id: editionId, node_id: node.node_id, parent_id: node.parent_id })
      }
    }

    const spansById = new Map()
    for (const span of spans) {
      const id = spanId(span)
      if (!id) {
        addError('missing_span_id', 'Evidence span has neither evidence_span_id nor span_id', { edition_id: editionId })
        continue
      }
      if (spansById.has(id)) addError('duplicate_span_id_in_edition', 'Evidence span ID is duplicated within an edition', { edition_id: editionId, evidence_span_id: id })
      if (globalSpanIds.has(id)) addError('duplicate_span_id_global', 'Evidence span ID is duplicated across editions', { edition_id: editionId, other_edition_id: globalSpanIds.get(id), evidence_span_id: id })
      spansById.set(id, span)
      globalSpanIds.set(id, editionId)
      increment(evidenceRoles, span.evidence_role || span.role || 'unknown')
      if (span.edition_id && span.edition_id !== editionId) addError('span_edition_mismatch', 'Evidence span carries the wrong edition_id', { edition_id: editionId, evidence_span_id: id, actual: span.edition_id })
      if (span.asset_sha256 && span.asset_sha256 !== textbook.sha256) addError('span_asset_mismatch', 'Evidence span carries the wrong asset SHA-256', { edition_id: editionId, evidence_span_id: id })
      const page = pageStart(span)
      if (!page || page < 1 || (pageCount && page > pageCount)) {
        addError('invalid_span_page', 'Evidence span has an invalid PDF page', { edition_id: editionId, evidence_span_id: id, pdf_page: page, page_count: pageCount })
      }
      const node = nodesById.get(span.node_id)
      if (!node) addError('missing_span_node', 'Evidence span references a missing content node', { edition_id: editionId, evidence_span_id: id, node_id: span.node_id })
      else if (page && (page < pageStart(node) || page > pageEnd(node))) {
        addError('span_outside_node', 'Evidence span page is outside its content node range', { edition_id: editionId, evidence_span_id: id, node_id: span.node_id, pdf_page: page })
      }
      const text = evidenceText(span)
      if (isTocOrFrontMatterText(text)) {
        addError('non_instructional_evidence_span', 'Evidence span contains front-matter or TOC text', { edition_id: editionId, evidence_span_id: id, node_id: span.node_id, excerpt: text.slice(0, 180) })
      }
    }

    let editionHasL3 = false
    for (const alignment of alignments) {
      const alignmentId = alignment.alignment_id
      if (!alignmentId) {
        addError('missing_alignment_id', 'Textbook-standard alignment has no alignment_id', { edition_id: editionId })
        continue
      }
      if (globalAlignmentIds.has(alignmentId)) addError('duplicate_alignment_id_global', 'Alignment ID is duplicated across editions', { edition_id: editionId, other_edition_id: globalAlignmentIds.get(alignmentId), alignment_id: alignmentId })
      globalAlignmentIds.set(alignmentId, editionId)
      if (alignment.edition_id !== editionId) addError('alignment_edition_mismatch', 'Alignment carries the wrong edition_id', { edition_id: editionId, alignment_id: alignmentId, actual: alignment.edition_id })
      if (standardCodes.size && !standardCodes.has(alignment.standard_code)) addError('unknown_standard_code', 'Alignment references an unknown curriculum standard', { edition_id: editionId, alignment_id: alignmentId, standard_code: alignment.standard_code })
      if (!isSpecificAlignment(alignment)) addError('invalid_specific_relation_type', 'Specific alignment uses a scope or unknown relation type', { edition_id: editionId, alignment_id: alignmentId, relation_type: alignment.relation_type })
      increment(relationTypes, alignment.relation_type || 'unknown')
      increment(evidenceLevels, alignment.evidence_level || (alignment.review_status === 'approved' ? 'legacy_approved' : 'unclassified'))
      if (alignment.evidence_level === 'L2') subjectStats.l2_alignments += 1
      if (alignment.evidence_level === 'L3') { subjectStats.l3_alignments += 1; l3Alignments += 1; editionHasL3 = true }
      if (alignment.publication_status === 'published') publishedAlignments += 1
      const machine = isMachineAlignment(alignment)
      if (machine) {
        machineAlignments += 1
        if (alignment.review_status !== 'machine_checked' || alignment.publication_status !== 'published') {
          addError('machine_alignment_not_published', 'Machine alignment must be machine_checked and published without a manual gate', { edition_id: editionId, alignment_id: alignmentId })
        }
      }
      const unit = publishedUnits.get(alignment.unit_id)
      if (!unit) addError('invalid_alignment_unit', 'Alignment does not reference an approved or published body-inferred unit', { edition_id: editionId, alignment_id: alignmentId, unit_id: alignment.unit_id })
      else if (!pageStart(unit)) addError('alignment_uses_unlocated_unit', 'Alignment references a TOC/unit entry with no locatable PDF page', { edition_id: editionId, alignment_id: alignmentId, unit_id: alignment.unit_id })
      const node = alignment.node_id ? nodesById.get(alignment.node_id) : null
      if (alignment.node_id && !node) addError('missing_alignment_node', 'Alignment references a missing content node', { edition_id: editionId, alignment_id: alignmentId, node_id: alignment.node_id })
      if (node && node.unit_id !== alignment.unit_id) addError('alignment_node_unit_mismatch', 'Alignment and its content node reference different units', { edition_id: editionId, alignment_id: alignmentId, node_id: node.node_id })
      const page = pageStart(alignment)
      const end = pageEnd(alignment)
      if (page && (page < 1 || end < page || (pageCount && end > pageCount))) addError('invalid_alignment_page_range', 'Alignment has an invalid PDF page range', { edition_id: editionId, alignment_id: alignmentId, pdf_page: page, end_pdf_page: end, page_count: pageCount })
      if (machine && !page) addError('machine_alignment_missing_page', 'Machine alignment must be locatable to a PDF page', { edition_id: editionId, alignment_id: alignmentId })
      const unitStart = unit ? pageStart(unit) : null
      const unitEnd = unitStart ? Math.max(unitStart, pageEnd(unit) || unitStart) : null
      if (unit && page && unitStart && (page < unitStart || page > unitEnd)) addError('alignment_outside_unit', 'Alignment page is outside its unit page range', { edition_id: editionId, alignment_id: alignmentId, unit_id: alignment.unit_id, pdf_page: page })
      if (node && page && (page < pageStart(node) || page > pageEnd(node))) addError('alignment_outside_node', 'Alignment page is outside its content node page range', { edition_id: editionId, alignment_id: alignmentId, node_id: node.node_id, pdf_page: page })

      const referencedSpans = []
      for (const id of alignment.evidence_span_ids || []) {
        const span = spansById.get(id)
        if (!span) addError('missing_alignment_span', 'Alignment references a missing evidence span', { edition_id: editionId, alignment_id: alignmentId, evidence_span_id: id })
        else referencedSpans.push(span)
      }
      if (alignment.evidence_level === 'L3') {
        if (!alignment.node_id || !node) addError('l3_missing_node', 'L3 page evidence must reference a content node', { edition_id: editionId, alignment_id: alignmentId })
        if (!page) addError('l3_missing_page', 'L3 page evidence must include a PDF page', { edition_id: editionId, alignment_id: alignmentId })
        if (!referencedSpans.length) addError('l3_missing_span', 'L3 page evidence must reference at least one evidence span', { edition_id: editionId, alignment_id: alignmentId })
        for (const span of referencedSpans) {
          if (pageStart(span) !== page) addError('l3_span_page_mismatch', 'L3 evidence span must be on the alignment PDF page', { edition_id: editionId, alignment_id: alignmentId, evidence_span_id: spanId(span), alignment_page: page, span_page: pageStart(span) })
        }
      }
      if (alignment.evidence_level === 'L3' && node?.source === 'verified_toc') {
        addError('l3_uses_toc_node', 'L3 page evidence cannot be inferred from a verified TOC node', { edition_id: editionId, alignment_id: alignmentId, node_id: node.node_id })
      }
      if (isTocOrFrontMatterText(alignment.evidence_excerpt || '') && alignment.evidence_level === 'L3') {
        addError('non_instructional_l3_excerpt', 'L3 alignment excerpt contains front-matter or TOC text', { edition_id: editionId, alignment_id: alignmentId, excerpt: String(alignment.evidence_excerpt).slice(0, 180) })
      }
    }
    if (editionHasL3) { coverage.with_l3_page_evidence += 1; subjectStats.with_l3 += 1 }
  }

  for (const failure of runReport?.failures || []) {
    const textbook = textbookByEdition.get(failure.edition_id)
    if (textbook) {
      const stats = bySubject[textbook.subject_slug || 'unknown']
      if (stats) stats.failures += 1
    }
  }

  if (Object.keys(parserVersions).length > 1) addError('mixed_parser_versions', 'Current textbook content graph mixes parser versions; the latest pipeline has not covered all editions', { versions: sortedRecord(parserVersions) })
  if (Object.keys(algorithmVersions).length > 1) addError('mixed_algorithm_versions', 'Current textbook alignments mix algorithm versions; the latest pipeline has not covered all editions', { versions: sortedRecord(algorithmVersions) })

  const canonicalMatches = canonicalIndex.matches || []
  const canonicalById = new Map()
  for (const match of canonicalMatches) {
    if (!match.alignment_id) {
      addError('canonical_match_missing_id', 'Canonical index contains a match without alignment_id')
      continue
    }
    if (canonicalById.has(match.alignment_id)) addError('duplicate_canonical_alignment_id', 'Canonical index contains a duplicate alignment_id', { alignment_id: match.alignment_id })
    canonicalById.set(match.alignment_id, match)
  }
  for (const [editionId, alignments] of editionAlignments) {
    for (const alignment of alignments) {
      const canonical = canonicalById.get(alignment.alignment_id)
      if (!canonical) {
        addError('forward_alignment_missing_from_index', 'Edition alignment is missing from canonical reverse index', { edition_id: editionId, alignment_id: alignment.alignment_id, standard_code: alignment.standard_code })
      } else if (alignmentFingerprint(alignment) !== alignmentFingerprint(canonical)) {
        addError('forward_reverse_alignment_mismatch', 'Edition and canonical-index copies of an alignment differ', { edition_id: editionId, alignment_id: alignment.alignment_id })
      }
    }
  }
  for (const match of canonicalMatches) {
    const editionRows = editionAlignments.get(match.edition_id) || []
    const forward = editionRows.find(row => row.alignment_id === match.alignment_id)
    if (!forward) addError('reverse_alignment_missing_from_edition', 'Canonical reverse-index match is missing from its edition record', { edition_id: match.edition_id, alignment_id: match.alignment_id, standard_code: match.standard_code })
  }

  const publishedByEdition = {}
  const matchesByStandard = {}
  const matchesByUnit = {}
  for (const match of canonicalMatches) {
    increment(matchesByStandard, match.standard_code)
    increment(matchesByUnit, `${match.edition_id}:${match.unit_id}:${match.subject_slug || ''}`)
    if (match.publication_status === 'published') increment(publishedByEdition, match.edition_id)
  }
  for (const disposition of canonicalIndex.textbook_dispositions || []) {
    const actual = publishedByEdition[disposition.edition_id] || 0
    if (disposition.published_specific_match_count !== actual) addError('textbook_forward_count_mismatch', 'Textbook disposition published match count differs from canonical matches', { edition_id: disposition.edition_id, expected: actual, actual: disposition.published_specific_match_count })
  }
  for (const disposition of canonicalIndex.unit_dispositions || []) {
    const actual = matchesByUnit[`${disposition.edition_id}:${disposition.unit_id}:${disposition.standard_subject_slug || ''}`] || 0
    if (disposition.match_count !== actual) addError('unit_forward_count_mismatch', 'Unit disposition match count differs from canonical matches', { edition_id: disposition.edition_id, unit_id: disposition.unit_id, expected: actual, actual: disposition.match_count })
  }
  for (const disposition of canonicalIndex.standard_dispositions || []) {
    const actual = matchesByStandard[disposition.standard_code] || 0
    if (disposition.specific_match_count !== actual) addError('standard_reverse_count_mismatch', 'Standard reverse disposition count differs from canonical matches', { standard_code: disposition.standard_code, expected: actual, actual: disposition.specific_match_count })
  }
  const computedSummary = {
    textbooks: textbooks.length,
    specific_matches: canonicalMatches.length,
    published_specific_matches: canonicalMatches.filter(row => row.publication_status === 'published').length,
    approved_matches: canonicalMatches.filter(row => row.review_status === 'approved').length,
    machine_checked_matches: canonicalMatches.filter(row => row.review_status === 'machine_checked').length,
    candidate_matches: canonicalMatches.filter(row => row.publication_status !== 'published').length,
    scope_relations: (canonicalIndex.scope_relations || []).length,
    legacy_approved_relations: (canonicalIndex.legacy_approved_alignment_ids || []).length
  }
  for (const [field, expected] of Object.entries(computedSummary)) {
    if (canonicalIndex.summary?.[field] !== expected) addError('canonical_summary_mismatch', 'Canonical index summary differs from computed data', { field, expected, actual: canonicalIndex.summary?.[field] })
  }

  const legacyIds = canonicalIndex.legacy_approved_alignment_ids || []
  const legacyIdSet = new Set(legacyIds)
  if (legacyIdSet.size !== legacyIds.length) addError('duplicate_legacy_approved_id', 'legacy_approved_alignment_ids contains duplicates')
  for (const id of legacyIds) {
    const canonical = canonicalById.get(id)
    if (!canonical) addError('legacy_approved_missing_from_index', 'Legacy approved alignment was not preserved in the canonical index', { alignment_id: id })
    else if (canonical.review_status !== 'approved' || canonical.publication_status !== 'published') addError('legacy_approved_status_changed', 'Legacy approved alignment lost its approved/published status', { alignment_id: id, review_status: canonical.review_status, publication_status: canonical.publication_status })
    const editionRows = canonical ? editionAlignments.get(canonical.edition_id) || [] : []
    if (canonical && !editionRows.some(row => row.alignment_id === id && row.review_status === 'approved')) addError('legacy_approved_missing_from_edition', 'Legacy approved alignment was not preserved in its edition record', { edition_id: canonical.edition_id, alignment_id: id })
  }
  for (const match of canonicalMatches.filter(row => row.review_status === 'approved')) {
    if (!legacyIdSet.has(match.alignment_id)) addError('approved_alignment_not_declared_legacy', 'Approved alignment is absent from legacy_approved_alignment_ids', { edition_id: match.edition_id, alignment_id: match.alignment_id })
  }

  if (coverage.unlocated_toc_entries) {
    addWarning('unlocated_toc_entries', 'TOC metadata may remain unlocated, but these entries must not enter the content graph', {
      count: coverage.unlocated_toc_entries
    })
  }
  if (coverage.normalized_toc_ranges) {
    addWarning('normalized_toc_ranges', 'Legacy TOC metadata has ranges that require clamping when projected into the content graph', {
      count: coverage.normalized_toc_ranges
    })
  }

  const result = {
    schema_version: 1,
    generated_at: nowIso(),
    valid: errors.length === 0,
    source_generation_id: current.generation_id || null,
    inputs: {
      registry: registryPath,
      structure_root: args.structureRoot,
      canonical_index: args.index,
      latest_run_report: existsSync(args.report) ? args.report : null,
      latest_run_selected_count: runReport?.selected_count ?? null
    },
    summary: {
      expected_textbooks: args.expectedTextbooks,
      current_textbooks: textbooks.length,
      support_resource_structures: [...allStructures.keys()].filter(editionId => !textbookByEdition.has(editionId)).length,
      content_nodes: totalNodes,
      evidence_spans: totalSpans,
      edition_alignments: totalAlignments,
      canonical_alignments: canonicalMatches.length,
      l3_page_alignments: l3Alignments,
      machine_alignments: machineAlignments,
      published_alignments: publishedAlignments,
      legacy_approved_alignments: legacyIds.length,
      errors: errors.length,
      warnings: warnings.length
    },
    coverage,
    by_subject: Object.fromEntries(Object.entries(bySubject).sort(([left], [right]) => left.localeCompare(right))),
    by_evidence_level: sortedRecord(evidenceLevels),
    by_evidence_role: sortedRecord(evidenceRoles),
    by_relation_type: sortedRecord(relationTypes),
    by_node_kind: sortedRecord(nodeKinds),
    versions: {
      parser: sortedRecord(parserVersions),
      alignment_algorithm: sortedRecord(algorithmVersions)
    },
    forward_reverse: {
      edition_alignment_count: totalAlignments,
      canonical_alignment_count: canonicalMatches.length,
      forward_only_count: errors.filter(error => error.code === 'forward_alignment_missing_from_index').length,
      reverse_only_count: errors.filter(error => error.code === 'reverse_alignment_missing_from_edition').length,
      mismatched_count: errors.filter(error => error.code === 'forward_reverse_alignment_mismatch').length,
      standard_reverse_keys: Object.keys(matchesByStandard).length
    },
    latest_run: runReport ? {
      selected_count: runReport.selected_count,
      completed_count: runReport.completed_count,
      failure_count: runReport.failure_count,
      failures: runReport.failures || []
    } : null,
    errors,
    warnings
  }
  writeJson(args.out, result)
  console.log(JSON.stringify(result, null, 2))
  if (args.strict && errors.length) process.exitCode = 1
}

main()
