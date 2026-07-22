#!/usr/bin/env node

/**
 * Materialize validated LLM decisions into canonical textbook structures.
 * Preview is the default; only explicit --apply writes and rebuilds projections.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  ALIGNMENT_RELATION_TYPES,
  LLM_ALIGNMENT_PROMPT_VERSION,
  LLM_ALIGNMENT_PROVIDERS
} from './llm_textbook_standard_alignment_contract.js'

const ROOT = resolve(import.meta.dirname, '../..')
const STRUCTURE_ROOT = join(ROOT, 'data/textbooks/derived/by-edition')

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
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
    rebuild: true
  }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--manifest') args.manifest = resolve(argv[++index])
    else if (value === '--decisions') args.decisions = resolve(argv[++index])
    else if (value === '--alignments') args.alignments = resolve(argv[++index])
    else if (value === '--report') args.report = resolve(argv[++index])
    else if (value === '--edition' || value === '--edition-id') args.editions.push(...String(argv[++index]).split(',').filter(Boolean))
    else if (value === '--apply') args.apply = true
    else if (value === '--no-rebuild') args.rebuild = false
    else throw new Error(`Unknown argument: ${value}`)
  }
  if (args.manifest) {
    const manifest = readJson(args.manifest)
    args.decisions ||= manifest.decisions_path
    args.alignments ||= manifest.alignments_path
  }
  if (!args.decisions || !args.alignments) throw new Error('Provide --manifest or both --decisions and --alignments.')
  args.decisions = resolve(args.decisions)
  args.alignments = resolve(args.alignments)
  args.editions = [...new Set(args.editions)].sort()
  return args
}

function isLegacyApproved(alignment) {
  return alignment.review_status === 'approved'
}

function validateDecision(row) {
  if (!row.decision_id || !row.edition_id || !row.standard_code) throw new Error('Decision is missing stable identity fields.')
  if (!['accept', 'reject', 'abstain'].includes(row.decision)) throw new Error(`Invalid decision ${row.decision_id}`)
  if (row.source_mode === 'adjudicate_existing' && !row.prior_alignment_id) {
    throw new Error(`Existing adjudication lacks prior_alignment_id: ${row.decision_id}`)
  }
  if (!LLM_ALIGNMENT_PROVIDERS.includes(row.provenance?.provider) || !row.provenance?.model || !row.provenance?.input_hash) {
    throw new Error(`Decision lacks LLM provenance: ${row.decision_id}`)
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
  if (!LLM_ALIGNMENT_PROVIDERS.includes(row.provenance?.provider) || !row.provenance?.model || !row.provenance?.prompt_version || !row.provenance?.input_hash) {
    throw new Error(`Alignment lacks LLM provenance: ${row.alignment_id}`)
  }
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

export function planAlignmentApplication({ structuresByEdition, decisions, acceptedAlignments, editionFilter = [] }) {
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
    const structure = structuredClone(original)
    const editionDecisions = decisionsByEdition.get(editionId) || []
    const accepted = acceptedByEdition.get(editionId) || []
    const decisionsById = new Map()
    for (const decision of editionDecisions) {
      if (decisionsById.has(decision.decision_id)) throw new Error(`Duplicate decision_id: ${decision.decision_id}`)
      decisionsById.set(decision.decision_id, decision)
    }
    const acceptedDecisionIds = new Set()
    for (const alignment of accepted) {
      const decision = decisionsById.get(alignment.decision_id)
      if (!decision || decision.decision !== 'accept') {
        throw new Error(`Accepted alignment has no matching accept decision: ${alignment.alignment_id}`)
      }
      if (decision.edition_id !== alignment.edition_id || decision.standard_code !== alignment.standard_code) {
        throw new Error(`Accepted alignment identity disagrees with decision: ${alignment.alignment_id}`)
      }
      if (acceptedDecisionIds.has(alignment.decision_id)) throw new Error(`Duplicate accepted decision: ${alignment.decision_id}`)
      acceptedDecisionIds.add(alignment.decision_id)
    }
    for (const decision of editionDecisions) {
      if (decision.decision === 'accept' && !acceptedDecisionIds.has(decision.decision_id)) {
        throw new Error(`Accept decision has no materialized alignment: ${decision.decision_id}`)
      }
    }
    const byAlignmentId = new Map((structure.alignments || []).map(row => [row.alignment_id, row]))
    const protectedPriorIds = new Set()
    const removePriorIds = new Set()
    const editionDetail = {
      edition_id: editionId,
      decisions: editionDecisions.length,
      accepted: 0,
      rejected: 0,
      abstained: 0,
      removed: [],
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
        summary.missing_prior_alignments += 1
        editionDetail.missing_prior.push(decision.prior_alignment_id)
        continue
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
      }
    }
    structure.alignments = (structure.alignments || []).filter(row => !removePriorIds.has(row.alignment_id))
    summary.removed_machine_alignments += removePriorIds.size

    const nodes = new Map((structure.content_nodes || []).map(row => [row.node_id, row]))
    const spans = new Map((structure.evidence_spans || []).map(row => [row.evidence_span_id || row.span_id, row]))
    const alignments = new Map(structure.alignments.map(row => [row.alignment_id, row]))
    for (const row of accepted) {
      if (row.prior_alignment_id && protectedPriorIds.has(row.prior_alignment_id)) continue
      const node = canonicalGeneratedNode(row)
      const span = canonicalGeneratedSpan(row, editionId)
      if (node && !nodes.has(node.node_id)) {
        nodes.set(node.node_id, node)
        summary.added_content_nodes += 1
      }
      if (span && !spans.has(span.evidence_span_id)) {
        spans.set(span.evidence_span_id, span)
        summary.added_evidence_spans += 1
      }
      const alignment = canonicalAlignment(row)
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
  const decisions = readJsonLines(args.decisions)
  const acceptedAlignments = readJsonLines(args.alignments)
  const editionIds = [...new Set([...decisions, ...acceptedAlignments].map(row => row.edition_id))]
    .filter(id => !args.editions.length || args.editions.includes(id))
    .sort()
  const structuresByEdition = new Map(editionIds.map(editionId => {
    const path = join(STRUCTURE_ROOT, `${editionId}.json`)
    if (!existsSync(path)) throw new Error(`Derived edition not found: ${path}`)
    return [editionId, readJson(path)]
  }))
  return { decisions, acceptedAlignments, structuresByEdition }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const inputs = loadApplicationInputs(args)
  const result = planAlignmentApplication({ ...inputs, editionFilter: args.editions })
  const report = {
    mode: args.apply ? 'apply' : 'preview',
    decisions_path: args.decisions,
    alignments_path: args.alignments,
    rebuild_requested: args.rebuild,
    ...result.report
  }
  if (args.report) atomicWriteJson(args.report, report)
  if (!args.apply) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return
  }
  for (const [editionId, structure] of result.updates) {
    atomicWriteJson(join(STRUCTURE_ROOT, `${editionId}.json`), structure)
  }
  if (args.rebuild) runProjectionRebuild()
  process.stdout.write(`${JSON.stringify({ ...report, projections_rebuilt: args.rebuild }, null, 2)}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
