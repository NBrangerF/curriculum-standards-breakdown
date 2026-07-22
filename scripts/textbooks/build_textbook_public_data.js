import { existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  ensureDir,
  readJson,
  readJsonLines,
  sha256Text,
  writeJson
} from './library_common.js'
import {
  projectRelatedResourcesForTextbook,
  projectRelatedResourcesForUnit
} from './textbook_resource_pipeline.js'
import {
  readableSupportResourceIds,
  redactSupportResourceCatalogForPublic
} from './support_resource_readability.js'

const PROJECT_ROOT = resolve(import.meta.dirname, '../..')
const CURRENT_PATH = join(PROJECT_ROOT, 'data/textbooks/library-state/CURRENT.json')
const DERIVED_ROOT = join(PROJECT_ROOT, 'data/textbooks/derived/by-edition')
const SUPPORT_RESOURCE_PATH = join(PROJECT_ROOT, 'data/textbooks/catalog/support_resource_catalog.json')
const OUTPUT_ROOT = join(PROJECT_ROOT, 'public/data/textbooks')

function titleFor(asset) {
  const grade = `${asset.grade}年级`
  return `${asset.subject}${grade}${asset.volume}`
}

function stageLabel(stage) {
  return stage === 'primary' ? '小学' : '初中'
}

function normalizedRevisionStatus(asset) {
  if (asset.current_confirmed || asset.revision_status === 'current_2022_revision') return 'current_confirmed'
  if (asset.revision_status === 'candidate_2026_autumn_new_revision') return 'current_likely'
  if (String(asset.revision_status || '').includes('future')) return 'future_candidate'
  return 'revision_unknown'
}

function revisionLabel(status) {
  return {
    current_confirmed: '当前版本已核实',
    current_likely: '当前版本候选',
    revision_unknown: '版次待核实',
    future_candidate: '未来版本候选'
  }[status]
}

function countValues(items, valueKey, labelFor) {
  const counts = new Map()
  for (const item of items) counts.set(item[valueKey], (counts.get(item[valueKey]) || 0) + 1)
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: labelFor(value), count }))
    .sort((a, b) => typeof a.value === 'number' ? a.value - b.value : String(a.label).localeCompare(String(b.label), 'zh-CN'))
}

function loadStructure(editionId) {
  const path = join(DERIVED_ROOT, `${editionId}.json`)
  if (!existsSync(path)) return null
  return readJson(path)
}

function relationId(left, right, relationship) {
  return `rel_${sha256Text(`${left}:${right}:${relationship}`).slice(0, 16)}`
}

function legacyRelatedResources(asset, allAssets) {
  if (asset.resource_type !== 'student_textbook') return []
  const related = []
  for (const candidate of allAssets) {
    if (candidate.edition_id === asset.edition_id || candidate.grade !== asset.grade || candidate.volume !== asset.volume) continue
    const atlasMatch = candidate.resource_type === 'student_companion'
      && candidate.subject_slug === 'geography_atlas'
      && asset.subject_slug === 'geography'
    const subjectMatch = candidate.subject_slug === asset.subject_slug
    const teacherMatch = candidate.resource_type === 'teacher_guide' && subjectMatch
    const supplementMatch = candidate.resource_type === 'supplementary_material' && subjectMatch
    if (!atlasMatch && !teacherMatch && !supplementMatch) continue
    const relationship = teacherMatch ? 'teacher_guide_for' : atlasMatch ? 'companion_to' : 'supplement_to'
    related.push({
      relation_id: relationId(asset.edition_id, candidate.edition_id, relationship),
      resource_edition_id: candidate.edition_id,
      resource_type: candidate.resource_type,
      title: titleFor(candidate),
      relationship,
      confidence: atlasMatch || teacherMatch ? 0.98 : 0.85,
      review_status: atlasMatch || teacherMatch ? 'approved' : 'candidate'
    })
  }
  return related
}

function emptySupportResourceCatalog() {
  return {
    schema_version: 1,
    generated_at: '1970-01-01T00:00:00.000Z',
    resources: [],
    pairings: [],
    unit_mappings: [],
    unit_mapping_gaps: [],
    indexes: { by_textbook: {}, by_resource: {}, by_textbook_unit: {}, by_resource_section: {} }
  }
}

function loadSupportResourceCatalog() {
  return existsSync(SUPPORT_RESOURCE_PATH) ? readJson(SUPPORT_RESOURCE_PATH) : emptySupportResourceCatalog()
}

function relatedResources(asset, allAssets, supportCatalog, readableResourceIds) {
  if (asset.resource_type !== 'student_textbook') return []
  const pairingsByRelation = new Map((supportCatalog.pairings || []).map(pairing => [pairing.relation_id, pairing]))
  const projected = projectRelatedResourcesForTextbook(supportCatalog, asset.edition_id)
    .map(resource => {
      const resourceId = pairingsByRelation.get(resource.relation_id)?.resource_id || null
      return {
        ...resource,
        resource_id: resourceId,
        resource_reading_available: Boolean(resourceId && readableResourceIds.has(resourceId))
      }
    })
  const byEdition = new Map(projected.map(resource => [resource.resource_edition_id, resource]))
  // Keep backwards compatibility for a legacy asset that has not yet been
  // represented in the support-resource catalog. Catalog rows win on overlap.
  for (const resource of legacyRelatedResources(asset, allAssets)) {
    if (!byEdition.has(resource.resource_edition_id)) {
      byEdition.set(resource.resource_edition_id, {
        ...resource,
        resource_id: null,
        resource_reading_available: false
      })
    }
  }
  return [...byEdition.values()].sort((left, right) => left.relation_id.localeCompare(right.relation_id))
}

function normalizeEvidenceLevel(value) {
  const match = String(value || '').match(/^L([1-5])(?:_|$)/)
  return match ? `L${match[1]}` : undefined
}

function normalizeEvidenceLevelDetail(value, legacyValue) {
  const allowed = new Set(['L1_scope', 'L2_topic', 'L3_page_evidence', 'L4_teacher_guide', 'L5_official_crosswalk'])
  if (allowed.has(value)) return value
  return {
    L1_scope: 'L1_scope',
    L2_topic: 'L2_topic',
    L3_textbook_body: 'L3_page_evidence',
    L3_page_evidence: 'L3_page_evidence',
    L4_teacher_guide: 'L4_teacher_guide',
    L5_official_crosswalk: 'L5_official_crosswalk'
  }[legacyValue]
}

function normalizeContentNodes(structure, toc, pageCount) {
  const rawNodes = Array.isArray(structure?.content_nodes) ? structure.content_nodes : []
  const normalized = rawNodes.map(node => ({
    node_id: node.node_id || node.content_node_id,
    parent_id: node.parent_id ?? null,
    unit_id: node.unit_id ?? node.toc_entry_id ?? null,
    toc_entry_id: node.toc_entry_id || undefined,
    level: Number.isInteger(node.level) ? node.level : 0,
    kind: node.kind || 'other',
    title: node.title,
    pdf_page: node.pdf_page,
    end_pdf_page: node.end_pdf_page ?? node.pdf_page,
    printed_page: node.printed_page ?? null,
    end_printed_page: node.end_printed_page ?? null,
    text_excerpt: typeof node.text_excerpt === 'string' ? node.text_excerpt.slice(0, 280) : undefined,
    evidence_span_ids: Array.isArray(node.evidence_span_ids) ? [...new Set(node.evidence_span_ids)] : [],
    source: node.source || undefined,
    extraction_method: typeof node.extraction_method === 'string' ? node.extraction_method : node.extraction_method === null ? null : undefined,
    source_fidelity: node.source_fidelity || undefined,
    // A missing score is intentional for LLM-created page evidence. Do not
    // manufacture a zero that could be mistaken for calibrated confidence.
    confidence: Number.isFinite(node.confidence) ? node.confidence : undefined,
    review_status: node.review_status || 'machine_checked'
  })).filter(node =>
    typeof node.node_id === 'string'
    && node.node_id.length > 0
    && typeof node.title === 'string'
    && node.title.length > 0
    && Number.isInteger(node.pdf_page)
    && node.pdf_page >= 1
    && node.pdf_page <= pageCount
    && Number.isInteger(node.end_pdf_page)
    && node.end_pdf_page >= node.pdf_page
    && node.end_pdf_page <= pageCount
  )
  if (normalized.length) return normalized

  // Backwards-compatible projection: an old TOC is also a valid, coarser
  // content tree. This lets the new context API work before a book receives
  // lesson/exercise extraction.
  const locatable = toc.filter(entry => entry.pdf_page !== null)
  return locatable.map((entry, index) => {
    const nextBoundary = locatable.slice(index + 1).find(candidate =>
      candidate.pdf_page > entry.pdf_page && candidate.level <= entry.level
    )
    return {
      node_id: entry.entry_id,
      parent_id: entry.parent_id,
      unit_id: entry.entry_id,
      toc_entry_id: entry.entry_id,
      level: entry.level,
      kind: entry.kind,
      title: entry.title,
      pdf_page: entry.pdf_page,
      end_pdf_page: entry.end_pdf_page && entry.end_pdf_page >= entry.pdf_page
        ? entry.end_pdf_page
        : nextBoundary
          ? nextBoundary.pdf_page - 1
          : pageCount,
      printed_page: entry.printed_page,
      end_printed_page: null,
      evidence_span_ids: [],
      source: `toc:${entry.source}`,
      confidence: entry.confidence,
      review_status: entry.review_status === 'approved' ? 'approved' : 'machine_checked'
    }
  })
}

function normalizeEvidenceSpans(structure, nodeIds, pageCount) {
  if (!Array.isArray(structure?.evidence_spans)) return []
  return structure.evidence_spans.map(span => {
    const rawBox = span.bbox && typeof span.bbox === 'object' ? span.bbox : null
    const bbox = rawBox && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(rawBox[key]))
      ? {
          x: rawBox.x,
          y: rawBox.y,
          width: rawBox.width,
          height: rawBox.height,
          unit: rawBox.unit || undefined,
          page_width: Number.isFinite(rawBox.page_width) ? rawBox.page_width : undefined,
          page_height: Number.isFinite(rawBox.page_height) ? rawBox.page_height : undefined
        }
      : undefined
    return {
      evidence_span_id: span.evidence_span_id || span.span_id,
      node_id: span.node_id,
      pdf_page: span.pdf_page,
      printed_page: span.printed_page ?? null,
      title: span.title || undefined,
      excerpt: span.excerpt ?? span.text,
      excerpt_hash: span.excerpt_hash ?? span.text_hash,
      bbox,
      evidence_role: span.evidence_role || span.role || undefined,
      source: span.source || undefined,
      parser_version: span.parser_version || undefined
    }
  }).filter(span =>
    typeof span.evidence_span_id === 'string'
    && span.evidence_span_id.length > 0
    && nodeIds.has(span.node_id)
    && Number.isInteger(span.pdf_page)
    && span.pdf_page >= 1
    && span.pdf_page <= pageCount
    && typeof span.excerpt === 'string'
    && span.excerpt.length > 0
    && typeof span.excerpt_hash === 'string'
    && span.excerpt_hash.length > 0
  )
}

function normalizeAlignment(alignment) {
  const nodeId = alignment.node_id || alignment.content_node_id
  const learningComponents = Array.isArray(alignment.learning_components)
    ? alignment.learning_components
        .filter(component => component && typeof component.component_id === 'string' && typeof component.label === 'string')
        .map(component => ({ component_id: component.component_id, label: component.label }))
    : []
  return {
    alignment_id: alignment.alignment_id,
    edition_id: alignment.edition_id || undefined,
    unit_id: typeof alignment.unit_id === 'string' && alignment.unit_id.length ? alignment.unit_id : undefined,
    node_id: nodeId || undefined,
    unit_title: typeof alignment.unit_title === 'string' && alignment.unit_title.length ? alignment.unit_title : undefined,
    standard_code: alignment.standard_code,
    standard_text: alignment.standard_text || '',
    subject_slug: alignment.subject_slug,
    grade_band: alignment.grade_band || '',
    relation_type: alignment.relation_type,
    learning_component_ids: Array.isArray(alignment.learning_component_ids)
      ? [...new Set(alignment.learning_component_ids)]
      : learningComponents.map(component => component.component_id),
    learning_components: learningComponents,
    evidence_level: normalizeEvidenceLevel(alignment.evidence_level),
    evidence_level_detail: normalizeEvidenceLevelDetail(alignment.evidence_level_detail, alignment.evidence_level),
    evidence_granularity: alignment.evidence_granularity
      || (String(alignment.evidence_level || '').includes('_') ? String(alignment.evidence_level).split('_').slice(1).join('_') : undefined),
    evidence_span_ids: Array.isArray(alignment.evidence_span_ids) ? [...new Set(alignment.evidence_span_ids)] : [],
    evidence_role: alignment.evidence_role || undefined,
    confidence: Number.isFinite(alignment.confidence) ? alignment.confidence : undefined,
    score: Number.isFinite(alignment.score) ? alignment.score : undefined,
    matched_keywords: Array.isArray(alignment.matched_keywords) ? alignment.matched_keywords : undefined,
    matched_fields: Array.isArray(alignment.matched_fields) ? alignment.matched_fields : undefined,
    modifier_conflicts: Array.isArray(alignment.modifier_conflicts) ? alignment.modifier_conflicts : undefined,
    longest_match_length: alignment.longest_match_length,
    alignment_method: alignment.alignment_method || undefined,
    algorithm_version: alignment.algorithm_version || undefined,
    provenance: alignment.provenance || undefined,
    rationale: alignment.rationale || '',
    review_status: alignment.review_status,
    publication_status: alignment.publication_status || undefined,
    evidence_id: alignment.evidence_id ?? null,
    pdf_page: alignment.pdf_page ?? null,
    end_pdf_page: alignment.end_pdf_page ?? null,
    printed_page: alignment.printed_page ?? null,
    semantic_decision: alignment.semantic_decision === 'accept' ? 'accept' : undefined,
    unit_assignment_status: alignment.unit_assignment_status || undefined,
    source_mode: alignment.source_mode || undefined,
    logical_item_id: alignment.logical_item_id || undefined,
    prior_alignment_id: alignment.prior_alignment_id ?? undefined,
    content_node_kind: alignment.content_node_kind || undefined,
    content_node_title: alignment.content_node_title || undefined,
    evidence_excerpt: alignment.evidence_excerpt || undefined,
    evidence_excerpt_hash: alignment.evidence_excerpt_hash || undefined,
    evidence_quote: alignment.evidence_quote || undefined
  }
}

function normalizeStructure(structure, pageCount) {
  const toc = Array.isArray(structure?.toc) ? structure.toc.map(entry => ({
    entry_id: entry.entry_id,
    parent_id: entry.parent_id ?? null,
    level: entry.level,
    kind: entry.kind,
    title: entry.title,
    printed_page: entry.printed_page ?? null,
    pdf_page: entry.pdf_page ?? null,
    end_pdf_page: entry.end_pdf_page ?? null,
    confidence: entry.confidence,
    review_status: entry.review_status,
    publication_status: entry.publication_status,
    source: entry.source
  })) : []
  const pageMap = Array.isArray(structure?.page_map) ? structure.page_map : []
  const approvedToc = toc.filter(entry => entry.review_status === 'approved')
  const publishedToc = toc.filter(entry =>
    entry.review_status === 'approved'
    || (entry.review_status === 'machine_checked'
      && entry.publication_status === 'published'
      && entry.source === 'body_inferred_unit')
  )
  const approvedPageMap = pageMap.filter(entry => entry.review_status === 'approved')
  const contentNodes = normalizeContentNodes(structure, publishedToc, pageCount)
  const contentNodeIds = new Set(contentNodes.map(node => node.node_id))
  const evidenceSpans = normalizeEvidenceSpans(structure, contentNodeIds, pageCount)
  const alignments = Array.isArray(structure?.alignments) ? structure.alignments.map(normalizeAlignment) : []
  const standardScopes = Array.isArray(structure?.standard_scopes) ? structure.standard_scopes : []
  const approvedAlignments = alignments.filter(entry => entry.review_status === 'approved')
  const publishedAlignments = alignments.filter(entry =>
    ['approved', 'machine_checked'].includes(entry.review_status)
    && entry.publication_status !== 'review_queue'
  )
  const publishedScopes = standardScopes.filter(entry => ['approved', 'machine_checked'].includes(entry.review_status))
  return {
    toc: publishedToc,
    page_map: approvedPageMap,
    content_nodes: contentNodes,
    evidence_spans: evidenceSpans,
    alignments: publishedAlignments,
    standard_scopes: publishedScopes,
    extraction: structure?.extraction || {
      extracted_at: null,
      page_count_checked: 0,
      pages_with_text: 0,
      average_characters_per_page: 0,
      notes: ['尚未生成结构化目录与页码映射。']
    },
    text_quality: structure?.text_quality || 'unknown',
    toc_status: approvedToc.length ? 'approved' : publishedToc.length ? 'machine_checked' : toc.length ? 'candidate' : 'unavailable',
    page_map_status: approvedPageMap.length ? 'approved' : pageMap.length ? 'candidate' : 'unavailable',
    relation_status: approvedAlignments.length ? 'approved' : publishedAlignments.length || publishedScopes.length ? 'machine_checked' : alignments.length ? 'candidate' : 'unavailable',
    toc_entry_count: publishedToc.length,
    unit_count: publishedToc.filter(entry => ['part', 'unit', 'chapter'].includes(entry.kind)).length,
    approved_alignment_count: approvedAlignments.length,
    machine_checked_alignment_count: publishedAlignments.filter(entry => entry.review_status === 'machine_checked').length,
    published_alignment_count: publishedAlignments.length,
    standard_scope_count: publishedScopes.reduce((sum, scope) => sum + (scope.standard_codes || []).length, 0)
  }
}

function addUnique(array, value) {
  if (value && !array.includes(value)) array.push(value)
}

function buildPageContextIndex(detail) {
  const pages = {}
  const ensurePage = pdfPage => {
    const key = String(pdfPage)
    if (!pages[key]) pages[key] = { node_ids: [], alignment_ids: [], evidence_span_ids: [] }
    return pages[key]
  }
  const nodesById = new Map(detail.content_nodes.map(node => [node.node_id, node]))
  const spansById = new Map(detail.evidence_spans.map(span => [span.evidence_span_id, span]))

  for (const node of detail.content_nodes) {
    for (let page = node.pdf_page; page <= node.end_pdf_page; page += 1) {
      addUnique(ensurePage(page).node_ids, node.node_id)
    }
  }
  for (const span of detail.evidence_spans) {
    const page = ensurePage(span.pdf_page)
    addUnique(page.node_ids, span.node_id)
    addUnique(page.evidence_span_ids, span.evidence_span_id)
  }
  for (const alignment of detail.alignments) {
    const target = alignment.node_id
      ? nodesById.get(alignment.node_id)
      : detail.content_nodes.find(node => node.unit_id === alignment.unit_id || node.node_id === alignment.unit_id)
    const alignmentSpans = (alignment.evidence_span_ids || []).map(id => spansById.get(id)).filter(Boolean)
    const pageNumbers = new Set()
    if (target) {
      for (let page = target.pdf_page; page <= target.end_pdf_page; page += 1) pageNumbers.add(page)
    }
    if (Number.isInteger(alignment.pdf_page)) pageNumbers.add(alignment.pdf_page)
    for (const span of alignmentSpans) pageNumbers.add(span.pdf_page)
    for (const pdfPage of pageNumbers) {
      const page = ensurePage(pdfPage)
      if (target) addUnique(page.node_ids, target.node_id)
      addUnique(page.alignment_ids, alignment.alignment_id)
      for (const span of alignmentSpans) addUnique(page.evidence_span_ids, span.evidence_span_id)
    }
  }
  for (const page of Object.values(pages)) {
    page.node_ids.sort()
    page.alignment_ids.sort()
    page.evidence_span_ids.sort()
  }
  return { schema_version: 1, edition_id: detail.edition_id, pages }
}

function publicBase(asset, structure, generatedAt) {
  const revisionStatus = normalizedRevisionStatus(asset)
  return {
    edition_id: asset.edition_id,
    work_id: asset.work_id,
    asset_id: asset.asset_id,
    evidence_id: asset.evidence_id,
    title: titleFor(asset),
    short_title: `${asset.subject} ${asset.grade}年级 ${asset.volume}`,
    stage: asset.stage,
    stage_label: stageLabel(asset.stage),
    subject: asset.subject,
    subject_slug: asset.subject_slug,
    grade: asset.grade,
    grade_label: `${asset.grade}年级`,
    volume: asset.volume,
    edition_name: asset.edition_name,
    resource_type: asset.resource_type,
    page_count: asset.pages,
    file_size_bytes: asset.bytes,
    revision_status: revisionStatus,
    revision_label: revisionLabel(revisionStatus),
    bibliographic_verified: Boolean(asset.bibliographic_verified),
    reading_available: Boolean(asset.transfer_verified && asset.pdf_structural_verified),
    text_quality: structure.text_quality,
    toc_status: structure.toc_status,
    page_map_status: structure.page_map_status,
    relation_status: structure.relation_status,
    toc_entry_count: structure.toc_entry_count,
    unit_count: structure.unit_count,
    approved_alignment_count: structure.approved_alignment_count,
    machine_checked_alignment_count: structure.machine_checked_alignment_count,
    published_alignment_count: structure.published_alignment_count,
    standard_scope_count: structure.standard_scope_count,
    related_resource_count: 0,
    generated_at: generatedAt
  }
}

function main() {
  const current = readJson(CURRENT_PATH)
  const registryPath = join(
    PROJECT_ROOT,
    `data/textbooks/library-state/generations/${current.generation_id}/asset_registry.lock.jsonl`
  )
  const assets = readJsonLines(registryPath)
  const supportCatalog = loadSupportResourceCatalog()
  const generatedAt = current.updated_at
  const readableResourceIds = readableSupportResourceIds(supportCatalog)

  if (!assets.length) throw new Error(`Textbook registry is empty: ${registryPath}`)
  if (existsSync(OUTPUT_ROOT)) rmSync(OUTPUT_ROOT, { recursive: true })
  ensureDir(join(OUTPUT_ROOT, 'by-edition'))
  ensureDir(join(OUTPUT_ROOT, 'page-context/by-edition'))
  ensureDir(join(OUTPUT_ROOT, 'resources'))
  writeJson(join(OUTPUT_ROOT, 'resources/index.json'), redactSupportResourceCatalogForPublic(supportCatalog))

  const catalogItems = []
  const units = []
  const standardsToTextbooks = {}
  const standardScopesToTextbooks = {}
  for (const asset of assets) {
    const structure = normalizeStructure(loadStructure(asset.edition_id), asset.pages)
    const resources = relatedResources(asset, assets, supportCatalog, readableResourceIds)
    const resourceUnitMappings = supportCatalog.unit_mappings.filter(mapping => mapping.target_edition_id === asset.edition_id)
    const resourceUnitMappingGaps = supportCatalog.unit_mapping_gaps.filter(gap => gap.target_edition_id === asset.edition_id)
    const base = publicBase(asset, structure, generatedAt)
    base.related_resource_count = resources.length
    const detail = {
      ...base,
      toc: structure.toc,
      page_map: structure.page_map,
      content_nodes: structure.content_nodes,
      evidence_spans: structure.evidence_spans,
      alignments: structure.alignments,
      standard_scopes: structure.standard_scopes,
      related_resources: resources,
      resource_unit_mappings: resourceUnitMappings,
      resource_unit_mapping_gaps: resourceUnitMappingGaps,
      extraction: structure.extraction
    }
    for (const scope of detail.standard_scopes) {
      for (const standardCode of scope.standard_codes || []) {
        const reverseScope = {
          alignment_id: `${scope.scope_id}:${standardCode}`,
          scope_id: scope.scope_id,
          edition_id: asset.edition_id,
          textbook_title: base.title,
          unit_id: null,
          unit_title: `${scope.grade_band} 教材范围`,
          pdf_page: null,
          printed_page: null,
          confidence: scope.evidence_role === 'adjacent_discipline_textbook' ? 0.6 : 0.78,
          relation_type: scope.relation_type,
          evidence_role: scope.evidence_role,
          review_status: scope.review_status,
          evidence_granularity: 'textbook_grade_band_scope',
          rationale: scope.evidence_role === 'adjacent_discipline_textbook'
            ? `该教材属于 ${scope.grade_band} 相邻学科材料，仅作为课程主题范围线索，不等同于具体单元证据。`
            : `该教材与 ${scope.grade_band} 课标处于同一学科和年级范围；具体单元证据单独列出。`
        }
        if (!standardScopesToTextbooks[standardCode]) standardScopesToTextbooks[standardCode] = []
        standardScopesToTextbooks[standardCode].push(reverseScope)
      }
    }
    writeJson(join(OUTPUT_ROOT, 'by-edition', `${asset.edition_id}.json`), detail)
    writeJson(join(OUTPUT_ROOT, 'page-context/by-edition', `${asset.edition_id}.json`), {
      ...buildPageContextIndex(detail),
      generated_at: generatedAt
    })
    for (const entry of detail.toc) {
      const unitAlignments = detail.alignments.filter(item => item.unit_id === entry.entry_id)
      const unit = {
        ...entry,
        edition_id: asset.edition_id,
        textbook_title: base.title,
        subject: base.subject,
        subject_slug: base.subject_slug,
        grade: base.grade,
        volume: base.volume,
        alignments: unitAlignments,
        related_resources: projectRelatedResourcesForUnit(supportCatalog, asset.edition_id, entry.entry_id)
          .map(resource => ({
            ...resource,
            resource_reading_available: readableResourceIds.has(resource.resource_id)
          }))
      }
      units.push(unit)
    }
    const tocById = new Map(detail.toc.map(entry => [entry.entry_id, entry]))
    const nodesById = new Map(detail.content_nodes.map(node => [node.node_id, node]))
    const spansById = new Map(detail.evidence_spans.map(span => [span.evidence_span_id, span]))
    for (const alignment of detail.alignments) {
      const node = alignment.node_id
        ? nodesById.get(alignment.node_id)
        : detail.content_nodes.find(candidate => candidate.unit_id === alignment.unit_id || candidate.node_id === alignment.unit_id)
      const unit = alignment.unit_id ? tocById.get(alignment.unit_id) : null
      const evidenceSpans = (alignment.evidence_span_ids || []).map(id => spansById.get(id)).filter(Boolean)
      const firstEvidence = evidenceSpans[0] || null
      const reverse = {
        alignment_id: alignment.alignment_id,
        edition_id: asset.edition_id,
        textbook_title: base.title,
        unit_id: alignment.unit_id || node?.unit_id || null,
        unit_title: unit?.title || alignment.unit_title || null,
        node_id: node?.node_id || alignment.node_id || null,
        node_title: node?.title || null,
        node_kind: node?.kind || null,
        pdf_page: alignment.pdf_page ?? firstEvidence?.pdf_page ?? node?.pdf_page ?? unit?.pdf_page ?? null,
        printed_page: alignment.printed_page ?? firstEvidence?.printed_page ?? node?.printed_page ?? unit?.printed_page ?? null,
        confidence: Number.isFinite(alignment.confidence) ? alignment.confidence : undefined,
        rationale: alignment.rationale,
        relation_type: alignment.relation_type,
        learning_component_ids: alignment.learning_component_ids || [],
        learning_components: alignment.learning_components || [],
        evidence_level: alignment.evidence_level || null,
        evidence_level_detail: alignment.evidence_level_detail || null,
        evidence_span_ids: alignment.evidence_span_ids || [],
        evidence_excerpt: alignment.evidence_excerpt || firstEvidence?.excerpt || firstEvidence?.text || null,
        evidence_excerpt_hash: alignment.evidence_excerpt_hash || firstEvidence?.excerpt_hash || firstEvidence?.text_hash || null,
        evidence_quote: alignment.evidence_quote || null,
        evidence_spans: evidenceSpans.map(span => ({
          evidence_span_id: span.evidence_span_id,
          node_id: span.node_id,
          pdf_page: span.pdf_page,
          printed_page: span.printed_page ?? null,
          role: span.role || span.evidence_role || 'content',
          excerpt: span.excerpt || span.text || '',
          excerpt_hash: span.excerpt_hash || span.text_hash || null
        })),
        evidence_role: alignment.evidence_role,
        provenance: alignment.provenance || undefined,
        semantic_decision: alignment.semantic_decision || undefined,
        unit_assignment_status: alignment.unit_assignment_status || undefined,
        source_mode: alignment.source_mode || undefined,
        logical_item_id: alignment.logical_item_id || undefined,
        prior_alignment_id: alignment.prior_alignment_id ?? undefined,
        review_status: alignment.review_status,
        publication_status: alignment.publication_status || 'published',
        alignment_method: alignment.alignment_method || null,
        algorithm_version: alignment.algorithm_version || null,
        evidence_granularity: evidenceSpans.length
          ? 'textbook_page_evidence'
          : node && !String(node.source || '').startsWith('toc:')
            ? 'textbook_content_node'
            : 'textbook_toc_entry',
        matched_keywords: alignment.matched_keywords || [],
        matched_fields: alignment.matched_fields || []
      }
      if (!standardsToTextbooks[alignment.standard_code]) standardsToTextbooks[alignment.standard_code] = []
      standardsToTextbooks[alignment.standard_code].push(reverse)
    }
    if (asset.resource_type === 'student_textbook') catalogItems.push(base)
  }

  for (const links of Object.values(standardsToTextbooks)) {
    links.sort((left, right) => left.edition_id.localeCompare(right.edition_id)
      || (left.pdf_page ?? Number.MAX_SAFE_INTEGER) - (right.pdf_page ?? Number.MAX_SAFE_INTEGER)
      || String(left.node_id || left.unit_id || '').localeCompare(String(right.node_id || right.unit_id || ''))
      || left.alignment_id.localeCompare(right.alignment_id))
  }

  catalogItems.sort((a, b) =>
    a.stage.localeCompare(b.stage)
    || a.subject.localeCompare(b.subject, 'zh-CN')
    || a.grade - b.grade
    || a.volume.localeCompare(b.volume, 'zh-CN')
  )

  const manifest = {
    schema_version: 2,
    generated_at: generatedAt,
    source_generation_id: current.generation_id,
    count: catalogItems.length,
    filters: {
      stages: countValues(catalogItems, 'stage', stageLabel),
      subjects: countValues(catalogItems, 'subject_slug', value => catalogItems.find(item => item.subject_slug === value)?.subject || value),
      grades: countValues(catalogItems, 'grade', value => `${value}年级`),
      volumes: countValues(catalogItems, 'volume', value => value)
    }
  }
  writeJson(join(OUTPUT_ROOT, 'index.json'), { manifest, items: catalogItems })
  writeJson(join(OUTPUT_ROOT, 'manifest.json'), manifest)
  writeJson(join(OUTPUT_ROOT, 'units.json'), { generated_at: generatedAt, items: units })
  writeJson(join(OUTPUT_ROOT, 'standards-to-textbooks.json'), {
    schema_version: 2,
    generated_at: generatedAt,
    items: standardsToTextbooks,
    scopes: standardScopesToTextbooks
  })
  console.log(JSON.stringify({ output_root: OUTPUT_ROOT, catalog_count: catalogItems.length, detail_count: assets.length, generated_at: generatedAt }, null, 2))
}

main()
