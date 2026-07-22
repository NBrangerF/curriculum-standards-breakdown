#!/usr/bin/env node

/**
 * Materialize validated LLM decisions into canonical textbook structures.
 * Preview is the default; only explicit --apply writes and rebuilds projections.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  ALIGNMENT_RELATION_TYPES,
  LLM_ALIGNMENT_PROMPT_VERSION,
  LLM_ALIGNMENT_PROVIDERS,
  LLM_ALIGNMENT_SCHEMA_VERSION,
  alignmentInputHash,
  normalizeAlignmentText,
  stableAlignmentId,
  stableCanonicalJson,
  stableDecisionId,
  validateAlignmentModelOutput
} from './llm_textbook_standard_alignment_contract.js'
import { materializeAlignmentRecords } from './run_llm_textbook_standard_alignments.js'

const ROOT = resolve(import.meta.dirname, '../..')
const STRUCTURE_ROOT = join(ROOT, 'data/textbooks/derived/by-edition')
const STANDARD_ROOT = join(ROOT, 'public/data/by_subject')
const CAPABILITY_ROOT = join(ROOT, 'public/data/capability_graph/by_code')
const CATALOG_PATH = join(ROOT, 'public/data/textbooks/index.json')
const RECEIPT_ROOT = join(ROOT, 'output/textbook-standard-llm/apply-receipts')
const REPORT_ROOT = join(ROOT, 'output/textbook-standard-llm/apply-reports')
const APPLY_LOCK_PATH = join(ROOT, 'output/textbook-standard-llm/.apply.lock')

const TEXTBOOK_TO_STANDARD_SUBJECT = {
  chinese: 'chinese', math: 'math', english: 'english', science: 'science', physics: 'science',
  chemistry: 'science', biology: 'science', geography: 'science', morality_law: 'morality_law',
  history: 'morality_law', pe: 'pe', art: 'arts', music: 'arts', arts: 'arts', labor: 'labor',
  it: 'it', information_technology: 'it'
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function fileSha256(path) {
  return sha256(readFileSync(path))
}

function jsonHash(value) {
  return sha256(stableCanonicalJson(value))
}

function isSameOrDescendant(parent, candidate) {
  const child = relative(parent, candidate)
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child))
}

function canonicalizePath(path) {
  let cursor = resolve(path)
  const suffix = []
  while (!existsSync(cursor)) {
    const parent = dirname(cursor)
    if (parent === cursor) break
    suffix.unshift(basename(cursor))
    cursor = parent
  }
  const canonicalAncestor = realpathSync(cursor)
  return resolve(canonicalAncestor, ...suffix)
}

function pathsOverlap(left, right) {
  return isSameOrDescendant(left, right) || isSameOrDescendant(right, left)
}

function gradeBand(grade) {
  const value = Number(grade)
  if (value <= 2) return 'H1'
  if (value <= 4) return 'H2'
  if (value <= 6) return 'H3'
  return `H4G${value}`
}

function readJsonLines(path) {
  if (!existsSync(path)) throw new Error(`File not found: ${path}`)
  return readFileSync(path, 'utf8').split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line)
    } catch {
      throw new Error(`Invalid JSONL at ${path}:${index + 1}`)
    }
  })
}

function atomicWriteJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporary, path)
}

function parseArgs(argv) {
  const args = {
    manifest: null,
    decisions: null,
    alignments: null,
    report: null,
    editions: [],
    apply: false,
    rebuild: true,
    receipt: null,
    manifestPayload: null,
    decisionsExplicit: false,
    alignmentsExplicit: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--manifest') args.manifest = resolve(argv[++index])
    else if (value === '--decisions') {
      args.decisions = resolve(argv[++index])
      args.decisionsExplicit = true
    } else if (value === '--alignments') {
      args.alignments = resolve(argv[++index])
      args.alignmentsExplicit = true
    }
    else if (value === '--report') args.report = resolve(argv[++index])
    else if (value === '--receipt') args.receipt = resolve(argv[++index])
    else if (value === '--edition' || value === '--edition-id') args.editions.push(...String(argv[++index]).split(',').filter(Boolean))
    else if (value === '--apply') args.apply = true
    else if (value === '--no-rebuild') args.rebuild = false
    else throw new Error(`Unknown argument: ${value}`)
  }
  if (args.manifest) {
    const manifest = readJson(args.manifest)
    const manifestRoot = dirname(args.manifest)
    const resolveManifestPath = value => value && resolve(manifestRoot, value)
    args.manifestPayload = manifest
    args.decisions ||= resolveManifestPath(manifest.decisions_path)
    args.alignments ||= resolveManifestPath(manifest.alignments_path)
  }
  if (!args.decisions || !args.alignments) throw new Error('Provide --manifest or both --decisions and --alignments.')
  args.decisions = resolve(args.decisions)
  args.alignments = resolve(args.alignments)
  args.editions = [...new Set(args.editions)].sort()
  if (args.apply && !args.manifest) throw new Error('--apply requires --manifest so artifacts and source state can be authenticated.')
  return args
}

function isLegacyApproved(alignment) {
  return alignment.review_status === 'approved'
}

function assertObjectProvenance(provenance, label) {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    throw new Error(`${label} lacks structured LLM provenance.`)
  }
  if (!LLM_ALIGNMENT_PROVIDERS.includes(provenance.provider) || !provenance.model
    || provenance.prompt_version !== LLM_ALIGNMENT_PROMPT_VERSION
    || provenance.schema_version !== LLM_ALIGNMENT_SCHEMA_VERSION
    || !/^[a-f0-9]{64}$/u.test(String(provenance.input_hash || ''))) {
    throw new Error(`${label} has invalid LLM provenance.`)
  }
}

function sameProvenance(left, right) {
  return stableCanonicalJson(left) === stableCanonicalJson(right)
}

function loadStandardsByCode() {
  const standards = new Map()
  for (const file of readdirSync(STANDARD_ROOT).filter(name => name.endsWith('.json')).sort()) {
    const subject = basename(file, '.json')
    for (const row of readJson(join(STANDARD_ROOT, file)).standards || []) {
      const capabilityPath = join(CAPABILITY_ROOT, `${row.code}.json`)
      const learningComponents = existsSync(capabilityPath)
        ? (readJson(capabilityPath).learning_components || []).map(component => ({
            component_id: component.component_id,
            label: normalizeAlignmentText(component.label || component.source_statement || component.description)
          })).filter(component => component.component_id && component.label)
        : []
      standards.set(row.code, { ...row, subject_slug: row.subject_slug || subject, learning_components: learningComponents })
    }
  }
  return standards
}

function loadCatalogByEdition() {
  return new Map((readJson(CATALOG_PATH).items || []).map(row => [row.edition_id, row]))
}

function validateCurrentRequestScope(records, standardsByCode, catalogByEdition) {
  for (const record of records) {
    for (const item of record.request_items || []) {
      const catalog = catalogByEdition.get(item.textbook?.edition_id)
      if (!catalog || catalog.subject_slug !== item.textbook.subject_slug || Number(catalog.grade) !== Number(item.textbook.grade)
        || catalog.evidence_id !== item.textbook.evidence_id) {
        throw new Error(`Checkpoint textbook scope is stale: ${item.item_id}`)
      }
      for (const candidate of item.candidates || []) {
        const current = standardsByCode.get(candidate.standard_code)
        const currentText = normalizeAlignmentText(current?.standard || current?.official_text)
        if (!current || current.subject_slug !== candidate.subject_slug || current.grade_band !== candidate.grade_band
          || currentText !== candidate.standard_text
          || stableCanonicalJson(current.learning_components) !== stableCanonicalJson(candidate.learning_components)) {
          throw new Error(`Checkpoint curriculum-standard scope is stale: ${item.item_id}:${candidate.standard_code}`)
        }
      }
    }
  }
}

function validateBbox(bbox, label) {
  if (bbox == null) return
  if (!bbox || typeof bbox !== 'object' || Array.isArray(bbox)) throw new Error(`${label} bbox must be an object or null.`)
  for (const key of ['x', 'y', 'width', 'height']) {
    if (!Number.isFinite(bbox[key])) throw new Error(`${label} bbox.${key} must be finite.`)
  }
  if (bbox.x < 0 || bbox.y < 0 || bbox.width < 0 || bbox.height < 0 || !String(bbox.unit || '').trim()) {
    throw new Error(`${label} bbox has invalid coordinates or coordinate unit.`)
  }
  if (bbox.page_width !== undefined && (!Number.isFinite(bbox.page_width) || bbox.page_width <= 0 || bbox.x + bbox.width > bbox.page_width)) {
    throw new Error(`${label} bbox exceeds page_width.`)
  }
  if (bbox.page_height !== undefined && (!Number.isFinite(bbox.page_height) || bbox.page_height <= 0 || bbox.y + bbox.height > bbox.page_height)) {
    throw new Error(`${label} bbox exceeds page_height.`)
  }
}

export function validateApplicationArtifacts({ manifest, manifestPath, decisionsPath, alignmentsPath }) {
  if (!manifest || !manifestPath) throw new Error('A manifest is required for artifact validation.')
  if (manifest.prompt_version !== LLM_ALIGNMENT_PROMPT_VERSION || manifest.schema_version !== LLM_ALIGNMENT_SCHEMA_VERSION) {
    throw new Error('Manifest prompt/schema version does not match the current apply contract.')
  }
  if (!Number.isInteger(manifest.request_batches) || manifest.request_batches < 1) {
    throw new Error('Refusing an empty alignment manifest.')
  }
  const selection = manifest.selection
  const worksetIsComplete = manifest.workset_complete === true
    && Number.isInteger(manifest.work_items)
    && manifest.work_items > 0
    && Number.isInteger(manifest.work_items_before_limit)
    && manifest.work_items === manifest.work_items_before_limit
    && manifest.work_items_omitted === 0
    && selection?.complete === true
    && selection.limited_by_max_items === false
    && selection.selected_items === manifest.work_items
    && selection.available_items === manifest.work_items_before_limit
    && selection.omitted_items === 0
  if (!worksetIsComplete) {
    throw new Error('Refusing a truncated or legacy alignment manifest. Re-run the complete workset with the current pipeline.')
  }
  if (manifest.complete !== true || manifest.successful_batches !== manifest.request_batches
    || (manifest.incomplete_input_hashes || []).length) {
    throw new Error('Refusing a partial alignment manifest. Re-run until every request batch succeeds.')
  }
  const checkpointPath = resolve(dirname(manifestPath), manifest.checkpoint_path || '')
  for (const path of [checkpointPath, decisionsPath, alignmentsPath]) {
    if (!existsSync(path)) throw new Error(`Manifest artifact is missing: ${path}`)
  }
  const expectedDigests = manifest.artifact_digests || {}
  const actualDigests = {
    checkpoint_sha256: fileSha256(checkpointPath),
    decisions_sha256: fileSha256(decisionsPath),
    alignments_sha256: fileSha256(alignmentsPath)
  }
  for (const [field, actual] of Object.entries(actualDigests)) {
    if (!/^[a-f0-9]{64}$/u.test(String(expectedDigests[field] || '')) || expectedDigests[field] !== actual) {
      throw new Error(`Manifest artifact digest mismatch: ${field}`)
    }
  }

  const expectedHashes = new Set(manifest.current_input_hashes || [])
  if (expectedHashes.size !== manifest.request_batches) throw new Error('Manifest current_input_hashes is incomplete or duplicated.')
  const validRecords = new Map()
  for (const record of readJsonLines(checkpointPath)) {
    if (!expectedHashes.has(record.input_hash) || record.status !== 'ok') continue
    assertObjectProvenance(record.provenance, `checkpoint ${record.input_hash}`)
    if (record.provenance.provider !== manifest.provider || record.provenance.model !== manifest.model) {
      throw new Error(`Checkpoint provider/model disagrees with manifest: ${record.input_hash}`)
    }
    const recomputedHash = alignmentInputHash({
      provider: record.provenance.provider,
      model: record.provenance.model,
      items: record.request_items
    })
    if (recomputedHash !== record.input_hash || record.provenance.input_hash !== record.input_hash) {
      throw new Error(`Checkpoint input hash mismatch: ${record.input_hash}`)
    }
    const validation = validateAlignmentModelOutput(record.model_output, record.request_items)
    if (!validation.ok) throw new Error(`Checkpoint semantic output is no longer valid: ${record.input_hash}`)
    if (validRecords.has(record.input_hash)) throw new Error(`Duplicate successful checkpoint record: ${record.input_hash}`)
    validRecords.set(record.input_hash, record)
  }
  if (validRecords.size !== expectedHashes.size) throw new Error('Checkpoint does not contain exactly one validated record per current request batch.')

  const regenerated = materializeAlignmentRecords([...validRecords.values()], expectedHashes)
  const decisions = readJsonLines(decisionsPath)
  const alignments = readJsonLines(alignmentsPath)
  if (stableCanonicalJson(decisions) !== stableCanonicalJson(regenerated.decisions)) {
    throw new Error('Decisions artifact does not materialize from the authenticated checkpoint records.')
  }
  if (stableCanonicalJson(alignments) !== stableCanonicalJson(regenerated.alignments)) {
    throw new Error('Alignments artifact does not materialize from the authenticated checkpoint records.')
  }
  return { decisions, acceptedAlignments: alignments, checkpointPath, records: [...validRecords.values()], digests: actualDigests }
}

function validateDecision(row) {
  if (!row.decision_id || !row.edition_id || !row.standard_code) throw new Error('Decision is missing stable identity fields.')
  if (!['accept', 'reject', 'abstain'].includes(row.decision)) throw new Error(`Invalid decision ${row.decision_id}`)
  if (row.source_mode === 'adjudicate_existing' && !row.prior_alignment_id) {
    throw new Error(`Existing adjudication lacks prior_alignment_id: ${row.decision_id}`)
  }
  assertObjectProvenance(row.provenance, `Decision ${row.decision_id}`)
  if (row.decision_id !== stableDecisionId(row.provenance.input_hash, row.item_id, row.candidate_id)) {
    throw new Error(`Decision stable ID mismatch: ${row.decision_id}`)
  }
}

function validateAlignment(row) {
  if (!row.decision_id || !row.alignment_id || !row.edition_id || !row.standard_code || row.semantic_decision !== 'accept') {
    throw new Error(`Invalid accepted alignment: ${row.alignment_id || 'unknown'}`)
  }
  if (!ALIGNMENT_RELATION_TYPES.includes(row.relation_type)) throw new Error(`Invalid relation_type: ${row.alignment_id}`)
  if (!['L2', 'L3'].includes(row.evidence_level)) throw new Error(`Invalid evidence_level: ${row.alignment_id}`)
  if (!row.evidence_quote || !row.evidence_excerpt?.includes(row.evidence_quote)) {
    throw new Error(`Alignment quote is not verbatim: ${row.alignment_id}`)
  }
  if (!row.evidence_span_ids?.length || !row.node_id || !Number.isInteger(row.pdf_page)) {
    throw new Error(`Alignment lacks page evidence identity: ${row.alignment_id}`)
  }
  if (row.confidence !== undefined || row.score !== undefined) {
    throw new Error(`Uncalibrated score field is forbidden: ${row.alignment_id}`)
  }
  assertObjectProvenance(row.provenance, `Alignment ${row.alignment_id}`)
  const expectedId = stableAlignmentId(row.edition_id, row.logical_item_id, row.standard_code, row.evidence_span_ids[0], LLM_ALIGNMENT_PROMPT_VERSION)
  if (row.alignment_id !== expectedId) throw new Error(`Alignment stable ID mismatch: ${row.alignment_id}`)
  if (row.unit_assignment_status === 'unassigned_page_only' && row.evidence_level !== 'L3') {
    throw new Error(`Unassigned page-only alignment must be L3: ${row.alignment_id}`)
  }
}

function canonicalGeneratedSpan(row, editionId) {
  const span = row.generated_evidence_span
  if (!span) return null
  return {
    edition_id: editionId,
    span_id: span.evidence_span_id,
    evidence_span_id: span.evidence_span_id,
    node_id: span.node_id,
    pdf_page: span.pdf_page,
    printed_page: span.printed_page ?? null,
    excerpt: span.excerpt,
    text: span.excerpt,
    excerpt_hash: span.excerpt_hash,
    text_hash: span.excerpt_hash,
    bbox: span.bbox || null,
    evidence_role: span.evidence_role || 'textbook_page_excerpt',
    role: span.evidence_role || 'textbook_page_excerpt',
    source: span.source || 'external_textbook_sidecar',
    extraction_method: span.extraction_method || null,
    parser_version: 'llm-sidecar-evidence-v1'
  }
}

function canonicalGeneratedNode(row) {
  const node = row.generated_content_node
  if (!node) return null
  return {
    node_id: node.node_id,
    parent_id: node.parent_id ?? null,
    unit_id: node.unit_id ?? null,
    level: Number.isInteger(node.level) ? node.level : 0,
    kind: node.kind || 'page_excerpt',
    title: node.title,
    pdf_page: node.pdf_page,
    end_pdf_page: node.end_pdf_page ?? node.pdf_page,
    printed_page: node.printed_page ?? null,
    end_printed_page: node.end_printed_page ?? node.printed_page ?? null,
    text_excerpt: node.text_excerpt,
    evidence_span_ids: node.evidence_span_ids || [],
    source: node.source || 'external_textbook_sidecar',
    extraction_method: node.extraction_method || null,
    source_fidelity: 'verbatim_sidecar',
    review_status: 'machine_checked'
  }
}

function canonicalAlignment(row) {
  const {
    generated_evidence_span: _generatedEvidenceSpan,
    generated_content_node: _generatedContentNode,
    semantic_decision: _semanticDecision,
    ...alignment
  } = row
  return {
    ...alignment,
    semantic_decision: 'accept',
    alignment_method: 'llm_semantic_adjudication',
    algorithm_version: row.provenance.prompt_version || LLM_ALIGNMENT_PROMPT_VERSION,
    matched_keywords: undefined,
    matched_fields: ['llm_semantic_adjudication'],
    modifier_conflicts: [],
    review_status: 'machine_checked',
    publication_status: 'published'
  }
}

function isPublishedUnit(unit) {
  return unit?.review_status === 'approved'
    || (unit?.review_status === 'machine_checked' && unit?.publication_status === 'published' && unit?.source === 'body_inferred_unit')
}

function semanticAlignmentKey(row) {
  return [row.unit_id || row.node_id || '', row.standard_code, row.relation_type].join('\u001f')
}

function assertGeneratedEntityCompatible(existing, generated, label) {
  if (!existing) return
  for (const [key, value] of Object.entries(generated)) {
    if (stableCanonicalJson(existing[key] ?? null) !== stableCanonicalJson(value ?? null)) {
      throw new Error(`${label} collides with canonical data at field ${key}.`)
    }
  }
}

export function planAlignmentApplication({
  structuresByEdition,
  decisions,
  acceptedAlignments,
  editionFilter = [],
  standardsByCode = null,
  catalogByEdition = null
}) {
  for (const row of decisions) validateDecision(row)
  for (const row of acceptedAlignments) validateAlignment(row)
  const selected = new Set(editionFilter)
  const decisionsByEdition = new Map()
  const acceptedByEdition = new Map()
  for (const row of decisions) {
    if (selected.size && !selected.has(row.edition_id)) continue
    if (!decisionsByEdition.has(row.edition_id)) decisionsByEdition.set(row.edition_id, [])
    decisionsByEdition.get(row.edition_id).push(row)
  }
  for (const row of acceptedAlignments) {
    if (selected.size && !selected.has(row.edition_id)) continue
    if (!acceptedByEdition.has(row.edition_id)) acceptedByEdition.set(row.edition_id, [])
    acceptedByEdition.get(row.edition_id).push(row)
  }

  const editions = [...new Set([...decisionsByEdition.keys(), ...acceptedByEdition.keys()])].sort()
  const updates = new Map()
  const summary = {
    editions: 0,
    decisions: 0,
    accepted: 0,
    rejected: 0,
    abstained: 0,
    removed_machine_alignments: 0,
    added_llm_alignments: 0,
    added_content_nodes: 0,
    added_evidence_spans: 0,
    preserved_legacy_approved: 0,
    missing_prior_alignments: 0,
    page_only_alignments: 0
  }
  const details = []

  for (const editionId of editions) {
    const original = structuresByEdition.get(editionId)
    if (!original) throw new Error(`Derived edition not found: ${editionId}`)
    if (original.edition_id && original.edition_id !== editionId) throw new Error(`Derived edition identity mismatch: ${editionId}`)
    const structure = structuredClone(original)
    const catalog = catalogByEdition?.get(editionId) || null
    if (catalogByEdition && !catalog) throw new Error(`Textbook catalog entry not found: ${editionId}`)
    const pageCount = Number(catalog?.page_count || structure.extraction?.page_count || 0)
    const editionDecisions = decisionsByEdition.get(editionId) || []
    const accepted = acceptedByEdition.get(editionId) || []
    const decisionsById = new Map()
    const priorDecisionIds = new Map()
    for (const decision of editionDecisions) {
      if (decisionsById.has(decision.decision_id)) throw new Error(`Duplicate decision_id: ${decision.decision_id}`)
      decisionsById.set(decision.decision_id, decision)
      if (decision.source_mode === 'adjudicate_existing') {
        if (priorDecisionIds.has(decision.prior_alignment_id)) {
          throw new Error(`Duplicate adjudication for prior alignment: ${decision.prior_alignment_id}`)
        }
        priorDecisionIds.set(decision.prior_alignment_id, decision.decision_id)
      }
    }
    const acceptedDecisionIds = new Set()
    const acceptedAlignmentIds = new Set()
    for (const alignment of accepted) {
      const decision = decisionsById.get(alignment.decision_id)
      if (!decision || decision.decision !== 'accept') {
        throw new Error(`Accepted alignment has no matching accept decision: ${alignment.alignment_id}`)
      }
      if (decision.edition_id !== alignment.edition_id || decision.standard_code !== alignment.standard_code) {
        throw new Error(`Accepted alignment identity disagrees with decision: ${alignment.alignment_id}`)
      }
      for (const field of ['source_mode', 'prior_alignment_id', 'unit_id', 'candidate_id', 'logical_item_id']) {
        if ((decision[field] ?? null) !== (alignment[field] ?? null)) {
          throw new Error(`Accepted alignment disagrees with decision field ${field}: ${alignment.alignment_id}`)
        }
      }
      if (!sameProvenance(decision.provenance, alignment.provenance)) {
        throw new Error(`Accepted alignment provenance disagrees with decision: ${alignment.alignment_id}`)
      }
      if (acceptedDecisionIds.has(alignment.decision_id)) throw new Error(`Duplicate accepted decision: ${alignment.decision_id}`)
      acceptedDecisionIds.add(alignment.decision_id)
      if (acceptedAlignmentIds.has(alignment.alignment_id)) throw new Error(`Duplicate accepted alignment_id: ${alignment.alignment_id}`)
      acceptedAlignmentIds.add(alignment.alignment_id)
    }
    for (const decision of editionDecisions) {
      if (decision.decision === 'accept' && !acceptedDecisionIds.has(decision.decision_id)) {
        throw new Error(`Accept decision has no materialized alignment: ${decision.decision_id}`)
      }
    }
    const byAlignmentId = new Map()
    for (const row of structure.alignments || []) {
      if (!row.alignment_id || byAlignmentId.has(row.alignment_id)) throw new Error(`Duplicate canonical alignment_id: ${row.alignment_id || 'missing'}`)
      byAlignmentId.set(row.alignment_id, row)
    }
    const protectedPriorIds = new Set()
    const removePriorIds = new Set()
    const editionDetail = {
      edition_id: editionId,
      decisions: editionDecisions.length,
      accepted: 0,
      rejected: 0,
      abstained: 0,
      removed: [],
      removed_records: [],
      preserved_approved: [],
      missing_prior: [],
      added: []
    }

    for (const decision of editionDecisions) {
      summary.decisions += 1
      if (decision.decision === 'accept') summary.accepted += 1
      if (decision.decision === 'reject') summary.rejected += 1
      if (decision.decision === 'abstain') summary.abstained += 1
      editionDetail[decision.decision === 'accept' ? 'accepted' : decision.decision === 'reject' ? 'rejected' : 'abstained'] += 1
      if (decision.source_mode !== 'adjudicate_existing') continue
      const prior = byAlignmentId.get(decision.prior_alignment_id)
      if (!prior) {
        throw new Error(`Stale adjudication references missing prior alignment: ${decision.prior_alignment_id}`)
      }
      if ((prior.edition_id && prior.edition_id !== editionId) || prior.standard_code !== decision.standard_code) {
        throw new Error(`Adjudication prior identity mismatch: ${decision.prior_alignment_id}`)
      }
      if (isLegacyApproved(prior)) {
        protectedPriorIds.add(prior.alignment_id)
        summary.preserved_legacy_approved += 1
        editionDetail.preserved_approved.push(prior.alignment_id)
      } else {
        // accept supersedes the heuristic relation; reject removes it; abstain
        // leaves no publishable semantic claim. All three remove old machine data.
        removePriorIds.add(prior.alignment_id)
        editionDetail.removed.push(prior.alignment_id)
        editionDetail.removed_records.push(structuredClone(prior))
      }
    }
    structure.alignments = (structure.alignments || []).filter(row => !removePriorIds.has(row.alignment_id))
    summary.removed_machine_alignments += removePriorIds.size

    const nodes = new Map((structure.content_nodes || []).map(row => [row.node_id, row]))
    const spans = new Map((structure.evidence_spans || []).map(row => [row.evidence_span_id || row.span_id, row]))
    if (nodes.size !== (structure.content_nodes || []).length) throw new Error(`Duplicate canonical content node ID in ${editionId}`)
    if (spans.size !== (structure.evidence_spans || []).length) throw new Error(`Duplicate canonical evidence span ID in ${editionId}`)
    const alignments = new Map(structure.alignments.map(row => [row.alignment_id, row]))
    const semanticKeys = new Set(structure.alignments.map(semanticAlignmentKey))
    for (const row of accepted) {
      if (row.prior_alignment_id && protectedPriorIds.has(row.prior_alignment_id)) continue
      const node = canonicalGeneratedNode(row)
      const span = canonicalGeneratedSpan(row, editionId)
      const standard = standardsByCode?.get(row.standard_code) || null
      if (standardsByCode && !standard) throw new Error(`Unknown current standard: ${row.standard_code}`)
      if (standard && (row.subject_slug !== standard.subject_slug || row.grade_band !== standard.grade_band)) {
        throw new Error(`Alignment standard subject/grade mismatch: ${row.alignment_id}`)
      }
      if (catalog) {
        const expectedSubject = TEXTBOOK_TO_STANDARD_SUBJECT[catalog.subject_slug] || catalog.subject_slug
        if (row.subject_slug !== expectedSubject || row.grade_band !== gradeBand(catalog.grade)) {
          throw new Error(`Alignment crosses textbook subject/grade scope: ${row.alignment_id}`)
        }
      }
      if (!Number.isInteger(row.pdf_page) || row.pdf_page < 1 || (pageCount && row.pdf_page > pageCount)) {
        throw new Error(`Alignment has out-of-range PDF page: ${row.alignment_id}`)
      }
      const unit = (structure.toc || []).find(candidate => candidate.entry_id === row.unit_id)
      if (row.unit_assignment_status === 'unassigned_page_only') {
        if (!String(row.unit_id || '').startsWith('tpu_') || !String(row.unit_title || '').startsWith('未分配单元 · PDF ')
          || !node || node.unit_id !== null || node.parent_id !== null) {
          throw new Error(`Invalid no-TOC page-only identity: ${row.alignment_id}`)
        }
      } else {
        if (!unit || !isPublishedUnit(unit)) throw new Error(`Alignment references an unpublished or missing unit: ${row.alignment_id}`)
        const unitStart = Number(unit.pdf_page)
        const unitEnd = Math.max(unitStart, Number(unit.end_pdf_page) || unitStart)
        if (!Number.isInteger(unitStart) || row.pdf_page < unitStart || row.pdf_page > unitEnd) {
          throw new Error(`Alignment page is outside its unit range: ${row.alignment_id}`)
        }
        if (node && (node.unit_id !== row.unit_id || node.parent_id !== row.unit_id)) {
          throw new Error(`Generated node does not belong to its assigned unit: ${row.alignment_id}`)
        }
      }

      const resolvedNode = node || nodes.get(row.node_id)
      const requestedSpanId = row.evidence_span_ids[0]
      const resolvedSpan = span || spans.get(requestedSpanId)
      if (!resolvedNode || resolvedNode.node_id !== row.node_id || !resolvedSpan) {
        throw new Error(`Alignment references a missing canonical node/span: ${row.alignment_id}`)
      }
      if (row.evidence_span_ids.length !== 1 || (resolvedSpan.evidence_span_id || resolvedSpan.span_id) !== requestedSpanId
        || resolvedSpan.node_id !== row.node_id || resolvedSpan.pdf_page !== row.pdf_page) {
        throw new Error(`Alignment node/span/page identity mismatch: ${row.alignment_id}`)
      }
      if (resolvedNode.pdf_page !== row.pdf_page || (resolvedNode.end_pdf_page ?? resolvedNode.pdf_page) < row.pdf_page) {
        throw new Error(`Alignment page is outside its node range: ${row.alignment_id}`)
      }
      const excerpt = String(resolvedSpan.excerpt ?? resolvedSpan.text ?? '')
      const excerptHash = resolvedSpan.excerpt_hash ?? resolvedSpan.text_hash
      if (excerpt !== row.evidence_excerpt || sha256(excerpt) !== excerptHash
        || row.evidence_excerpt_hash !== excerptHash || !excerpt.includes(row.evidence_quote)) {
        throw new Error(`Alignment quote/excerpt/hash does not match canonical evidence: ${row.alignment_id}`)
      }
      validateBbox(resolvedSpan.bbox, `Alignment ${row.alignment_id}`)
      if (node) {
        assertGeneratedEntityCompatible(nodes.get(node.node_id), node, `Generated node ${node.node_id}`)
        if (!nodes.has(node.node_id)) {
          nodes.set(node.node_id, node)
          summary.added_content_nodes += 1
        }
      }
      if (span) {
        assertGeneratedEntityCompatible(spans.get(span.evidence_span_id), span, `Generated span ${span.evidence_span_id}`)
        if (!spans.has(span.evidence_span_id)) {
          spans.set(span.evidence_span_id, span)
          summary.added_evidence_spans += 1
        }
      }
      const alignment = canonicalAlignment(row)
      if (alignments.has(alignment.alignment_id)) {
        throw new Error(`Accepted alignment ID collides with canonical alignment: ${alignment.alignment_id}`)
      }
      const semanticKey = semanticAlignmentKey(alignment)
      if (semanticKeys.has(semanticKey)) throw new Error(`Duplicate logical alignment: ${alignment.edition_id}:${alignment.unit_id}:${alignment.standard_code}:${alignment.relation_type}`)
      semanticKeys.add(semanticKey)
      alignments.set(alignment.alignment_id, alignment)
      summary.added_llm_alignments += 1
      if (alignment.unit_assignment_status === 'unassigned_page_only') summary.page_only_alignments += 1
      editionDetail.added.push(alignment.alignment_id)
    }
    structure.content_nodes = [...nodes.values()].sort((a, b) => Number(a.pdf_page || 0) - Number(b.pdf_page || 0) || a.node_id.localeCompare(b.node_id))
    structure.evidence_spans = [...spans.values()].sort((a, b) => Number(a.pdf_page || 0) - Number(b.pdf_page || 0) || String(a.evidence_span_id || a.span_id).localeCompare(String(b.evidence_span_id || b.span_id)))
    structure.alignments = [...alignments.values()].sort((a, b) => String(a.unit_id || '').localeCompare(String(b.unit_id || '')) || Number(a.pdf_page || 0) - Number(b.pdf_page || 0) || a.standard_code.localeCompare(b.standard_code) || a.alignment_id.localeCompare(b.alignment_id))
    const appliedRows = [...editionDecisions, ...accepted]
    const providers = [...new Set(appliedRows.map(row => row.provenance.provider))].sort()
    structure.llm_semantic_alignment = {
      provider: providers.length === 1 ? providers[0] : 'mixed',
      providers,
      prompt_versions: [...new Set(accepted.map(row => row.provenance.prompt_version))].sort(),
      input_hashes: [...new Set(appliedRows.map(row => row.provenance.input_hash))].sort(),
      applied_decision_count: editionDecisions.length,
      published_accept_count: accepted.filter(row => !(row.prior_alignment_id && protectedPriorIds.has(row.prior_alignment_id))).length,
      page_only_alignment_count: accepted.filter(row => row.unit_assignment_status === 'unassigned_page_only').length,
      policy: 'automatic_no_human_gate'
    }
    updates.set(editionId, structure)
    details.push(editionDetail)
  }
  summary.editions = updates.size
  return { updates, report: { summary, details } }
}

function runProjectionRebuild() {
  const commands = [
    ['scripts/textbooks/build_full_textbook_standard_alignments.js'],
    ['scripts/textbooks/audit_full_textbook_standard_alignments.js', '--strict'],
    ['scripts/textbooks/build_textbook_public_data.js'],
    ['scripts/capability-graph/build_standard_capability_graph.mjs', '--apply'],
    ['scripts/capability-graph/audit_standard_capability_graph.mjs'],
    ['scripts/capability-graph/build_standard_capability_graph.mjs', '--check'],
    ['scripts/build-public-data.mjs', '--source', 'data/internal', '--output', 'public/data'],
    ['scripts/textbooks/build_textbook_public_data.js'],
    ['scripts/textbooks/audit_textbook_public_data.js'],
    ['scripts/validate-public-data.mjs', '--data-root', 'public/data']
  ]
  for (const command of commands) execFileSync(process.execPath, command, { cwd: ROOT, stdio: 'inherit' })
}

export function loadApplicationInputs(args) {
  const authenticated = args.manifestPayload
    ? validateApplicationArtifacts({
        manifest: args.manifestPayload,
        manifestPath: args.manifest,
        decisionsPath: args.decisions,
        alignmentsPath: args.alignments
      })
    : { decisions: readJsonLines(args.decisions), acceptedAlignments: readJsonLines(args.alignments) }
  const { decisions, acceptedAlignments } = authenticated
  const editionIds = [...new Set([...decisions, ...acceptedAlignments].map(row => row.edition_id))]
    .filter(id => !args.editions.length || args.editions.includes(id))
    .sort()
  const structuresByEdition = new Map(editionIds.map(editionId => {
    const path = join(STRUCTURE_ROOT, `${editionId}.json`)
    if (!existsSync(path)) throw new Error(`Derived edition not found: ${path}`)
    return [editionId, readJson(path)]
  }))
  for (const [editionId, structure] of structuresByEdition) {
    const expected = args.manifestPayload?.source_structure_hashes?.[editionId]
    if (args.manifestPayload && (!expected || expected !== jsonHash(structure))) {
      throw new Error(`Canonical source changed after adjudication: ${editionId}`)
    }
  }
  return { decisions, acceptedAlignments, structuresByEdition, authenticated }
}

function refreshManifestBackedArgs(args, readManifest = readJson) {
  if (!args.manifest) return { ...args }
  const manifestPayload = readManifest(args.manifest)
  const manifestRoot = dirname(args.manifest)
  return {
    ...args,
    manifestPayload,
    decisions: args.decisionsExplicit
      ? args.decisions
      : resolve(manifestRoot, manifestPayload.decisions_path || ''),
    alignments: args.alignmentsExplicit
      ? args.alignments
      : resolve(manifestRoot, manifestPayload.alignments_path || '')
  }
}

/**
 * Re-read every mutable apply input and build the write plan from that state.
 * The apply path calls this only after acquiring APPLY_LOCK_PATH; keeping the
 * reload and plan in one function makes it difficult to accidentally reuse a
 * pre-lock canonical/approved snapshot in a future refactor.
 */
export function prepareCurrentApplicationPlan(args, dependencies = {}) {
  const currentArgs = refreshManifestBackedArgs(args, dependencies.readManifest || readJson)
  const inputs = (dependencies.loadInputs || loadApplicationInputs)(currentArgs)
  const standardsByCode = (dependencies.loadStandards || loadStandardsByCode)()
  const catalogByEdition = (dependencies.loadCatalog || loadCatalogByEdition)()
  if (currentArgs.manifestPayload) {
    (dependencies.validateScope || validateCurrentRequestScope)(inputs.authenticated.records, standardsByCode, catalogByEdition)
  }
  const result = (dependencies.plan || planAlignmentApplication)({
    ...inputs,
    editionFilter: currentArgs.editions,
    standardsByCode,
    catalogByEdition
  })
  const report = {
    mode: currentArgs.apply ? 'apply' : 'preview',
    decisions_path: currentArgs.decisions,
    alignments_path: currentArgs.alignments,
    rebuild_requested: currentArgs.rebuild,
    ...result.report
  }
  return { args: currentArgs, inputs, standardsByCode, catalogByEdition, result, report }
}

const MUTATION_ROOTS = [
  ['textbook-derived', join(ROOT, 'data/textbooks/derived')],
  ['public-data', join(ROOT, 'public/data')],
  ['internal-capability-graph', join(ROOT, 'data/internal/capability_graph')]
]

function protectedApplyPaths(args, inputs, extras = []) {
  return [
    args.manifest,
    args.decisions,
    args.alignments,
    inputs.authenticated?.checkpointPath,
    CATALOG_PATH,
    STANDARD_ROOT,
    CAPABILITY_ROOT,
    STRUCTURE_ROOT,
    APPLY_LOCK_PATH,
    ...MUTATION_ROOTS.map(([, path]) => path),
    ...extras
  ].filter(Boolean)
}

export function createRecoverySnapshot(runId, mutationRoots = MUTATION_ROOTS, receiptRoot = RECEIPT_ROOT) {
  const backupRoot = join(receiptRoot, `${runId}.backup`)
  mkdirSync(backupRoot, { recursive: true })
  const roots = []
  for (const [name, source] of mutationRoots) {
    const destination = join(backupRoot, name)
    const existed = existsSync(source)
    if (existed) cpSync(source, destination, { recursive: true, preserveTimestamps: true })
    roots.push({ name, source, destination, existed })
  }
  return { backupRoot, roots }
}

export function restoreRecoverySnapshot(snapshot) {
  const failures = []
  for (const root of snapshot.roots) {
    try {
      rmSync(root.source, { recursive: true, force: true })
      if (root.existed) cpSync(root.destination, root.source, { recursive: true, preserveTimestamps: true })
    } catch (error) {
      failures.push(new Error(`Failed to restore ${root.name}: ${error.message}`, { cause: error }))
    }
  }
  if (failures.length) throw new AggregateError(failures, 'One or more apply mutation roots could not be restored.')
}

/**
 * Resolve an apply output to one direct JSON child of its dedicated root.
 * Both the root and any existing target are realpath-canonicalized so parent
 * symlinks and target symlinks cannot escape the root or alias protected data.
 */
function resolveSafeJsonOutputPath(requestedPath, {
  runId,
  outputRoot,
  trustedRoot = null,
  protectedPaths = [],
  label
} = {}) {
  const lexicalRoot = resolve(outputRoot)
  const canonicalTrustedRoot = trustedRoot ? canonicalizePath(trustedRoot) : null
  const prospectiveCanonicalRoot = canonicalizePath(lexicalRoot)
  if (canonicalTrustedRoot && !isSameOrDescendant(canonicalTrustedRoot, prospectiveCanonicalRoot)) {
    throw new Error(`${label} root escapes the trusted project root.`)
  }
  mkdirSync(lexicalRoot, { recursive: true })
  const canonicalRoot = realpathSync(lexicalRoot)
  if (canonicalTrustedRoot && !isSameOrDescendant(canonicalTrustedRoot, canonicalRoot)) {
    throw new Error(`${label} root resolves outside the trusted project root.`)
  }

  const lexicalTarget = resolve(requestedPath || join(lexicalRoot, `${runId}.json`))
  if (dirname(lexicalTarget) !== lexicalRoot || extname(lexicalTarget) !== '.json') {
    throw new Error(`${label} path must be a direct .json child of the dedicated ${label.toLowerCase()} root.`)
  }
  const canonicalTarget = canonicalizePath(lexicalTarget)
  if (dirname(canonicalTarget) !== canonicalRoot || !isSameOrDescendant(canonicalRoot, canonicalTarget)) {
    throw new Error(`${label} path resolves outside the dedicated ${label.toLowerCase()} root.`)
  }
  for (const protectedPath of protectedPaths.filter(Boolean)) {
    if (pathsOverlap(canonicalTarget, canonicalizePath(protectedPath))) {
      throw new Error(`${label} path overlaps protected apply data: ${protectedPath}`)
    }
  }
  return canonicalTarget
}

export function resolveSafeReceiptPath(requestedPath, options = {}) {
  return resolveSafeJsonOutputPath(requestedPath, {
    ...options,
    outputRoot: options.receiptRoot || RECEIPT_ROOT,
    label: 'Receipt'
  })
}

export function resolveSafeReportPath(requestedPath, options = {}) {
  return resolveSafeJsonOutputPath(requestedPath, {
    ...options,
    outputRoot: options.reportRoot || REPORT_ROOT,
    label: 'Report'
  })
}

export function recoverApplicationFailure({
  error,
  snapshot,
  receipt,
  receiptPath,
  restoreSnapshot = restoreRecoverySnapshot,
  writeReceipt = atomicWriteJson
}) {
  let restoreError = null
  let receiptWriteError = null
  if (snapshot) {
    try {
      restoreSnapshot(snapshot)
    } catch (failure) {
      restoreError = failure
    }
  }
  if (receipt) {
    try {
      writeReceipt(receiptPath, {
        ...receipt,
        status: restoreError ? 'rollback_failed' : 'rolled_back',
        failed_at: new Date().toISOString(),
        error: error.message,
        rollback_error: restoreError?.message || null
      })
    } catch (failure) {
      receiptWriteError = failure
    }
  }
  const recoveryErrors = [restoreError, receiptWriteError].filter(Boolean)
  const recoveryFailed = recoveryErrors.length > 0
  return {
    recoveryFailed,
    error: recoveryFailed
      ? new Error(`${error.message}; recovery failed: ${recoveryErrors.map(failure => failure.message).join('; ')}`, { cause: error })
      : error,
    restoreError,
    receiptWriteError
  }
}

function acquireApplyLock() {
  mkdirSync(dirname(APPLY_LOCK_PATH), { recursive: true })
  try {
    return openSync(APPLY_LOCK_PATH, 'wx', 0o600)
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`Another alignment apply is active or requires recovery: ${APPLY_LOCK_PATH}`)
    throw error
  }
}

function releaseApplyLock(descriptor) {
  if (descriptor !== null) closeSync(descriptor)
  rmSync(APPLY_LOCK_PATH, { force: true })
}

async function main() {
  const parsedArgs = parseArgs(process.argv.slice(2))
  if (!parsedArgs.apply) {
    const { args, inputs, report } = prepareCurrentApplicationPlan(parsedArgs)
    if (args.report) {
      const reportPath = resolveSafeReportPath(args.report, {
        runId: `preview-${new Date().toISOString().replace(/[:.]/gu, '-')}-${process.pid}`,
        trustedRoot: ROOT,
        protectedPaths: protectedApplyPaths(args, inputs)
      })
      atomicWriteJson(reportPath, report)
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return
  }
  const runId = `apply-${new Date().toISOString().replace(/[:.]/gu, '-')}-${process.pid}`
  let receiptPath = null
  let lock = null
  let snapshot = null
  let receipt = null
  let recoveryFailed = false
  try {
    lock = acquireApplyLock()

    // All mutable sources are intentionally re-opened and the complete plan is
    // recomputed only after the exclusive lock exists. In particular this
    // reloads the manifest/artifacts, current canonical structures (including
    // approved relations), standards/capabilities, and textbook catalog.
    const prepared = prepareCurrentApplicationPlan(parsedArgs)
    const { args, inputs, result, report } = prepared
    const prospectiveBackupRoot = join(RECEIPT_ROOT, `${runId}.backup`)
    const baseProtectedPaths = protectedApplyPaths(args, inputs, [prospectiveBackupRoot])
    const reportPath = args.report
      ? resolveSafeReportPath(args.report, {
          runId: `report-${runId}`,
          trustedRoot: ROOT,
          protectedPaths: [...baseProtectedPaths, args.receipt]
        })
      : null
    receiptPath = resolveSafeReceiptPath(args.receipt, {
      runId,
      trustedRoot: ROOT,
      protectedPaths: [...baseProtectedPaths, reportPath]
    })
    if (reportPath) atomicWriteJson(reportPath, report)
    snapshot = createRecoverySnapshot(runId)
    receipt = {
      schema_version: 1,
      run_id: runId,
      status: 'prepared',
      prepared_at: new Date().toISOString(),
      manifest_path: args.manifest,
      manifest_sha256: fileSha256(args.manifest),
      artifact_digests: inputs.authenticated.digests,
      source_structure_hashes: args.manifestPayload.source_structure_hashes,
      editions: [...result.updates.keys()],
      backup_root: snapshot.backupRoot,
      tombstones: result.report.details.flatMap(detail => detail.removed_records.map(record => ({ edition_id: detail.edition_id, record }))),
      report
    }
    atomicWriteJson(receiptPath, receipt)
    for (const [editionId, structure] of result.updates) {
      atomicWriteJson(join(STRUCTURE_ROOT, `${editionId}.json`), structure)
    }
    if (args.rebuild) runProjectionRebuild()
    receipt = {
      ...receipt,
      status: 'committed',
      committed_at: new Date().toISOString(),
      projections_rebuilt: args.rebuild,
      committed_structure_hashes: Object.fromEntries([...result.updates.keys()].map(editionId => [
        editionId,
        jsonHash(readJson(join(STRUCTURE_ROOT, `${editionId}.json`)))
      ]))
    }
    atomicWriteJson(receiptPath, receipt)
    process.stdout.write(`${JSON.stringify({ ...report, projections_rebuilt: args.rebuild, receipt_path: receiptPath }, null, 2)}\n`)
  } catch (error) {
    const recovery = recoverApplicationFailure({ error, snapshot, receipt, receiptPath })
    // Set this before rethrowing so even a rollback-receipt write failure cannot
    // make finally remove the lock. A retained lock is the recovery signal.
    recoveryFailed = recovery.recoveryFailed
    throw recovery.error
  } finally {
    if (lock !== null) {
      if (recoveryFailed) closeSync(lock)
      else releaseApplyLock(lock)
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
