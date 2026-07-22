#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

const ROOT = resolve(import.meta.dirname, '../..')
const DEFAULT_INDEX = join(ROOT, 'data/textbooks/derived/textbook_standard_alignment_index.json')
const DEFAULT_OUT = join(ROOT, 'data/textbooks/derived/textbook_standard_alignment_audit.json')
const INVALID_OCR_TOC_TITLE = /(?:ISBN|CIP|邮编|印张|印刷|出版|定价|责任编辑|号院|号楼|月第|版\s*[”"“]?\s*20\d{2}年)/i

function isPublishedUnit(row) {
  return row.review_status === 'approved'
    || (row.review_status === 'machine_checked'
      && row.publication_status === 'published'
      && row.source === 'body_inferred_unit')
}

function isLlmSemanticAlignment(row) {
  return row.alignment_method === 'llm_semantic_adjudication'
}

function isValidLlmPageOnlyAlignment(row) {
  const evidenceLevel = String(row.evidence_level_detail || row.evidence_level || '')
  return isLlmSemanticAlignment(row)
    && row.unit_assignment_status === 'unassigned_page_only'
    && /^L3(?:_|$)/.test(evidenceLevel)
    && String(row.unit_id || '').startsWith('tpu_')
    && String(row.unit_title || '').startsWith('未分配单元 · PDF ')
    && Number.isInteger(row.pdf_page)
    && Boolean(row.node_id || row.content_node_id)
    && Array.isArray(row.evidence_span_ids)
    && row.evidence_span_ids.length > 0
}

function parseArgs(argv) {
  const args = { index: DEFAULT_INDEX, out: DEFAULT_OUT, strict: false }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--index') args.index = resolve(argv[++i])
    else if (argv[i] === '--out') args.out = resolve(argv[++i])
    else if (argv[i] === '--strict') args.strict = true
  }
  return args
}
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')) }
function writeJson(path, value) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`) }

function main() {
  const args = parseArgs(process.argv.slice(2))
  const errors = []
  const warnings = []
  if (!existsSync(args.index)) errors.push(`missing alignment index: ${args.index}`)
  const payload = errors.length ? {} : readJson(args.index)
  const current = readJson(join(ROOT, 'data/textbooks/library-state/CURRENT.json'))
  const registry = readFileSync(join(ROOT, `data/textbooks/library-state/generations/${current.generation_id}/asset_registry.lock.jsonl`), 'utf8')
    .split(/\r?\n/).filter(Boolean).map(JSON.parse)
  const textbooks = registry.filter(row => row.resource_type === 'student_textbook')
  const standardMap = new Map()
  for (const file of readdirSync(join(ROOT, 'public/data/by_subject')).filter(name => name.endsWith('.json'))) {
    for (const standard of readJson(join(ROOT, 'public/data/by_subject', file)).standards || []) {
      standardMap.set(standard.code, { ...standard, subject_slug: standard.subject_slug || basename(file, '.json') })
    }
  }
  const textbookMap = new Map(textbooks.map(row => [row.edition_id, row]))
  const structureFiles = readdirSync(join(ROOT, 'data/textbooks/derived/by-edition')).filter(file => file.endsWith('.json'))
  const structures = new Map(structureFiles.map(file => {
    const structure = readJson(join(ROOT, 'data/textbooks/derived/by-edition', file))
    return [structure.edition_id, structure]
  }))
  const unitsByEdition = new Map([...structures].map(([editionId, structure]) => [
    editionId,
    new Set((structure.toc || []).filter(isPublishedUnit).map(row => row.entry_id))
  ]))
  for (const textbook of textbooks) {
    const structure = structures.get(textbook.edition_id)
    if (!structure) {
      errors.push(`textbook structure missing: ${textbook.edition_id}`)
      continue
    }
    for (const entry of structure.toc || []) {
      if (entry.source !== 'ocr_toc' || entry.review_status !== 'approved') continue
      const hanCount = (entry.title.match(/[\u3400-\u9fff]/g) || []).length
      if (INVALID_OCR_TOC_TITLE.test(entry.title)) errors.push(`OCR TOC contains colophon text: ${textbook.edition_id}:${entry.entry_id}`)
      if (textbook.subject_slug !== 'english' && hanCount < 2) errors.push(`OCR TOC contains low-information title: ${textbook.edition_id}:${entry.entry_id}`)
    }
  }
  const textbookDispositions = payload.textbook_dispositions || []
  const unitDispositions = payload.unit_dispositions || []
  const standardDispositions = payload.standard_dispositions || []
  const matches = payload.matches || []
  if (payload.source_generation_id !== current.generation_id) errors.push('alignment index generation does not match CURRENT')
  if (textbookDispositions.length !== textbooks.length) errors.push(`textbook dispositions ${textbookDispositions.length} != student textbooks ${textbooks.length}`)
  if (standardDispositions.length !== standardMap.size) errors.push(`standard dispositions ${standardDispositions.length} != standards ${standardMap.size}`)
  if (new Set(textbookDispositions.map(row => row.edition_id)).size !== textbookDispositions.length) errors.push('duplicate textbook dispositions')
  if (new Set(standardDispositions.map(row => row.standard_code)).size !== standardDispositions.length) errors.push('duplicate standard dispositions')
  for (const row of textbookDispositions) {
    if (!textbookMap.has(row.edition_id)) errors.push(`unknown textbook disposition: ${row.edition_id}`)
    if (!row.status) errors.push(`textbook disposition missing status: ${row.edition_id}`)
    if (row.status === 'no_standard_subject_mapping' || row.scope_standard_count <= 0) errors.push(`textbook has no standard scope: ${row.edition_id}`)
    if (!Array.isArray(row.standard_subject_mappings) || !row.standard_subject_mappings.length) errors.push(`textbook mapping provenance missing: ${row.edition_id}`)
    if (['scope_only_no_toc', 'page_aligned_no_toc'].includes(row.status) && !row.structure_status_reason) {
      errors.push(`textbook without TOC has no structure reason: ${row.edition_id}`)
    }
  }
  for (const row of standardDispositions) {
    if (!standardMap.has(row.standard_code)) errors.push(`unknown standard disposition: ${row.standard_code}`)
    if (!row.status || row.status === 'not_evaluated') errors.push(`standard not evaluated: ${row.standard_code}`)
    if (row.status === 'gap_no_textbook_scope' && !row.gap_reason) errors.push(`standard gap has no reason: ${row.standard_code}`)
  }
  const unitKeys = new Set()
  for (const row of unitDispositions) {
    const key = `${row.edition_id}:${row.unit_id}:${row.standard_subject_slug}`
    if (unitKeys.has(key)) errors.push(`duplicate unit disposition: ${key}`)
    unitKeys.add(key)
    if (!row.status) errors.push(`unit disposition missing status: ${key}`)
    if (!unitsByEdition.get(row.edition_id)?.has(row.unit_id)) errors.push(`unit disposition references unknown approved TOC entry: ${key}`)
  }
  const expectedUnitDispositions = textbookDispositions.reduce((sum, row) => sum + row.processed_unit_scope_count, 0)
  if (unitDispositions.length !== expectedUnitDispositions) errors.push(`unit dispositions ${unitDispositions.length} != expected processed scopes ${expectedUnitDispositions}`)
  const matchIds = new Set()
  for (const match of matches) {
    if (matchIds.has(match.alignment_id)) errors.push(`duplicate match id: ${match.alignment_id}`)
    matchIds.add(match.alignment_id)
    const standard = standardMap.get(match.standard_code)
    const textbook = textbookMap.get(match.edition_id)
    if (!standard) errors.push(`${match.alignment_id} references unknown standard`)
    if (!textbook) errors.push(`${match.alignment_id} references unknown textbook`)
    const pageOnly = match.unit_assignment_status === 'unassigned_page_only'
    const validPageOnly = isValidLlmPageOnlyAlignment(match)
    if (pageOnly && !validPageOnly) errors.push(`${match.alignment_id} has invalid synthetic page-only unit evidence`)
    if (!unitsByEdition.get(match.edition_id)?.has(match.unit_id) && !validPageOnly) {
      errors.push(`${match.alignment_id} references unknown approved TOC entry`)
    }
    if (standard && standard.subject_slug !== match.subject_slug) errors.push(`${match.alignment_id} crosses standard subject`)
    if (standard && standard.grade_band !== match.grade_band) errors.push(`${match.alignment_id} crosses grade band`)
    if (!isLlmSemanticAlignment(match) && (!Array.isArray(match.matched_keywords) || !match.matched_keywords.length)) {
      errors.push(`${match.alignment_id} has no matched keywords`)
    }
    if (!Array.isArray(match.matched_fields) || !match.matched_fields.length) errors.push(`${match.alignment_id} has no matched fields`)
    if (isLlmSemanticAlignment(match) && (match.confidence !== undefined || match.score !== undefined)) {
      errors.push(`${match.alignment_id} publishes an uncalibrated LLM score`)
    }
    if (match.publication_status === 'published' && !['approved', 'machine_checked'].includes(match.review_status)) errors.push(`${match.alignment_id} published with invalid review status`)
    if (match.review_status === 'machine_checked' && match.modifier_conflicts?.length) errors.push(`${match.alignment_id} published despite numeric concept conflict`)
    if (match.evidence_role === 'adjacent_discipline_textbook' && match.relation_type === 'supports') errors.push(`${match.alignment_id} adjacent discipline cannot claim direct support`)
  }
  const scopeKeys = new Set()
  for (const scope of payload.scope_relations || []) {
    const key = `${scope.scope_id}:${scope.standard_code}`
    if (scopeKeys.has(key)) errors.push(`duplicate scope relation: ${key}`)
    scopeKeys.add(key)
    const standard = standardMap.get(scope.standard_code)
    const textbook = textbookMap.get(scope.edition_id)
    if (!standard) errors.push(`${key} references unknown standard`)
    if (!textbook) errors.push(`${key} references unknown textbook`)
    if (standard && standard.subject_slug !== scope.standard_subject_slug) errors.push(`${key} crosses standard subject`)
    if (standard && standard.grade_band !== scope.grade_band) errors.push(`${key} crosses grade band`)
    if (!['curriculum_scope', 'adjacent_curriculum_scope'].includes(scope.relation_type)) errors.push(`${key} has invalid scope relation type`)
    if (scope.evidence_role === 'adjacent_discipline_textbook' && scope.relation_type !== 'adjacent_curriculum_scope') errors.push(`${key} adjacent scope is overstated`)
  }
  const scopesByStandard = new Map()
  for (const scope of payload.scope_relations || []) scopesByStandard.set(scope.standard_code, (scopesByStandard.get(scope.standard_code) || 0) + 1)
  for (const row of standardDispositions) {
    const scopeCount = scopesByStandard.get(row.standard_code) || 0
    if (row.textbook_scope_count > scopeCount) errors.push(`standard scope count inconsistent: ${row.standard_code}`)
    if (row.status === 'gap_no_textbook_scope' && scopeCount) errors.push(`standard marked gap despite scope: ${row.standard_code}`)
    if (row.status !== 'gap_no_textbook_scope' && !scopeCount) errors.push(`standard marked covered without scope: ${row.standard_code}`)
  }
  for (const id of payload.legacy_approved_alignment_ids || []) {
    const inMatch = matches.some(row => row.alignment_id === id && row.review_status === 'approved')
    const inStructure = [...structures.values()].some(structure =>
      (structure.alignments || []).some(row => row.alignment_id === id && row.review_status === 'approved')
    )
    if (!inMatch && !inStructure) errors.push(`legacy approved relation lost: ${id}`)
  }
  const noToc = textbookDispositions.filter(row => ['scope_only_no_toc', 'page_aligned_no_toc'].includes(row.status))
  const pageAlignedNoToc = noToc.filter(row => row.status === 'page_aligned_no_toc')
  const scopeOnlyNoToc = noToc.filter(row => row.status === 'scope_only_no_toc')
  if (scopeOnlyNoToc.length) warnings.push(`${scopeOnlyNoToc.length} textbook(s) have curriculum scope but no approved TOC after extraction`)
  if (pageAlignedNoToc.length) warnings.push(`${pageAlignedNoToc.length} textbook(s) use explicit synthetic page-only L3 evidence because no approved TOC is available`)
  const standardGaps = standardDispositions.filter(row => row.status === 'gap_no_textbook_scope')
  if (standardGaps.length) warnings.push(`${standardGaps.length} standard(s) have no textbook subject in the current library`)
  const result = {
    valid: errors.length === 0,
    index: args.index,
    summary: {
      textbooks: textbooks.length,
      textbook_dispositions: textbookDispositions.length,
      unit_dispositions: unitDispositions.length,
      standards: standardMap.size,
      standard_dispositions: standardDispositions.length,
      matches: matches.length,
      published_matches: matches.filter(row => row.publication_status === 'published').length,
      textbooks_without_toc: noToc.length,
      standards_without_textbook_scope: standardGaps.length
    },
    errors,
    warnings
  }
  writeJson(args.out, result)
  console.log(JSON.stringify(result, null, 2))
  if (args.strict && errors.length) process.exit(1)
}

main()
