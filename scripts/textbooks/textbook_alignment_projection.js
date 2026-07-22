function asArray(value) {
  return Array.isArray(value) ? value : []
}

function unique(values) {
  return [...new Set(values.filter(value => value !== null && value !== undefined && value !== ''))]
}

function finiteMaximum(values) {
  const usable = values.map(Number).filter(Number.isFinite)
  return usable.length ? Math.max(...usable) : undefined
}

function alignmentContainerId(alignment) {
  return alignment.unit_id || alignment.node_id || alignment.content_node_id || ''
}

function projectionKey(alignment) {
  return [alignmentContainerId(alignment), alignment.standard_code || '', alignment.relation_type || ''].join('\u001f')
}

function componentRowsForIds(rows, ids) {
  const requested = new Set(ids)
  return asArray(rows).filter(component => requested.has(component?.component_id))
}

function evidenceIndex(evidenceSpans) {
  return new Map(asArray(evidenceSpans).map(span => [span.evidence_span_id || span.span_id, span]))
}

/**
 * Return one lossless display claim per canonical evidence span. Canonical
 * alignments remain claim-level; this projection is the only place where
 * semantically identical relationships are gathered for presentation.
 */
export function textbookAlignmentEvidenceClaims(alignment, evidenceSpans = []) {
  const spansById = evidenceSpans instanceof Map ? evidenceSpans : evidenceIndex(evidenceSpans)
  const supportingEvidence = asArray(alignment?.supporting_evidence)
  const spanIds = unique([
    ...asArray(alignment?.evidence_span_ids),
    ...supportingEvidence.map(claim => claim?.evidence_span_id)
  ])
  const materializeClaim = (evidenceSpanId, support = null) => {
    const span = evidenceSpanId ? spansById.get(evidenceSpanId) : null
    const componentIds = unique(Array.isArray(support?.learning_component_ids)
      ? support.learning_component_ids
      : asArray(alignment?.learning_component_ids))
    const componentRows = Array.isArray(support?.learning_components)
      ? support.learning_components
      : componentRowsForIds(alignment?.learning_components, componentIds)
    return {
      alignment_id: support?.alignment_id || alignment?.alignment_id || null,
      node_id: support?.node_id || span?.node_id || alignment?.node_id || alignment?.content_node_id || null,
      evidence_span_id: evidenceSpanId,
      pdf_page: support?.pdf_page ?? span?.pdf_page ?? alignment?.pdf_page ?? null,
      printed_page: support?.printed_page ?? span?.printed_page ?? alignment?.printed_page ?? null,
      evidence_quote: support?.evidence_quote ?? alignment?.evidence_quote ?? null,
      evidence_excerpt: support?.evidence_excerpt ?? span?.excerpt ?? span?.text ?? alignment?.evidence_excerpt ?? null,
      evidence_excerpt_hash: support?.evidence_excerpt_hash ?? span?.excerpt_hash ?? span?.text_hash ?? alignment?.evidence_excerpt_hash ?? null,
      bbox: support?.bbox ?? span?.bbox ?? null,
      evidence_role: support?.evidence_role ?? span?.evidence_role ?? span?.role ?? alignment?.evidence_role ?? null,
      learning_component_ids: componentIds,
      learning_components: componentRows,
      rationale: support?.rationale ?? alignment?.rationale ?? '',
      confidence: Number.isFinite(support?.confidence) ? support.confidence : alignment?.confidence,
      score: Number.isFinite(support?.score) ? support.score : alignment?.score
    }
  }

  // A projected relationship can contain several canonical claims, including
  // approved unit-level claims that intentionally have no evidence-span ID.
  // Preserve those rows one-for-one when the projection is consumed again
  // (for example while building the standard-to-textbook reverse index).
  if (supportingEvidence.length) {
    const representedSpanIds = new Set(supportingEvidence
      .map(claim => claim?.evidence_span_id)
      .filter(Boolean))
    return [
      ...supportingEvidence.map(claim => ({
        ...materializeClaim(claim?.evidence_span_id || null, claim),
        // Explicit nulls are meaningful for a spanless/page-unassigned claim;
        // never replace them with the aggregate card's primary locator.
        ...claim
      })),
      ...spanIds
        .filter(evidenceSpanId => !representedSpanIds.has(evidenceSpanId))
        .map(evidenceSpanId => materializeClaim(evidenceSpanId))
    ]
  }

  const ids = spanIds.length ? spanIds : [null]
  return ids.map(evidenceSpanId => materializeClaim(evidenceSpanId))
}

function mergeComponentRows(alignments, claims, componentIds) {
  const byId = new Map()
  for (const alignment of alignments) {
    for (const component of asArray(alignment.learning_components)) {
      if (component?.component_id && !byId.has(component.component_id)) byId.set(component.component_id, component)
    }
  }
  for (const claim of claims) {
    for (const component of asArray(claim.learning_components)) {
      if (component?.component_id && !byId.has(component.component_id)) byId.set(component.component_id, component)
    }
  }
  return componentIds.map(id => byId.get(id)).filter(Boolean)
}

function alignmentSort(left, right) {
  const approved = Number(right.review_status === 'approved') - Number(left.review_status === 'approved')
  return approved
    || Number(left.pdf_page ?? Number.MAX_SAFE_INTEGER) - Number(right.pdf_page ?? Number.MAX_SAFE_INTEGER)
    || String(left.alignment_id || '').localeCompare(String(right.alignment_id || ''))
}

/**
 * Coalesce claim-level canonical rows into one public relationship card while
 * retaining every claim, component subset, locator and bbox.
 */
export function projectTextbookAlignments(alignments, evidenceSpans = []) {
  const spansById = evidenceIndex(evidenceSpans)
  const groups = new Map()
  for (const alignment of asArray(alignments)) {
    const key = projectionKey(alignment)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(alignment)
  }
  return [...groups.values()].map(rows => {
    const ordered = rows.slice().sort(alignmentSort)
    const primary = ordered[0]
    const claims = ordered.flatMap(alignment => textbookAlignmentEvidenceClaims(alignment, spansById))
      .sort((left, right) => (
        Number(left.pdf_page ?? Number.MAX_SAFE_INTEGER) - Number(right.pdf_page ?? Number.MAX_SAFE_INTEGER)
        || String(left.evidence_span_id || '').localeCompare(String(right.evidence_span_id || ''))
        || String(left.alignment_id || '').localeCompare(String(right.alignment_id || ''))
      ))
    const learningComponentIds = unique([
      ...ordered.flatMap(alignment => asArray(alignment.learning_component_ids)),
      ...claims.flatMap(claim => asArray(claim.learning_component_ids))
    ])
    const evidenceSpanIds = unique(claims.map(claim => claim.evidence_span_id))
    const firstClaim = claims[0] || null
    const reviewStatus = ordered.some(alignment => alignment.review_status === 'approved')
      ? 'approved'
      : primary.review_status
    return {
      ...primary,
      alignment_ids: unique([
        ...ordered.map(alignment => alignment.alignment_id),
        ...claims.map(claim => claim.alignment_id)
      ]),
      node_ids: unique(claims.map(claim => claim.node_id)),
      evidence_span_ids: evidenceSpanIds,
      learning_component_ids: learningComponentIds,
      learning_components: mergeComponentRows(ordered, claims, learningComponentIds),
      supporting_evidence: claims,
      evidence_claim_count: claims.length,
      node_id: firstClaim?.node_id || primary.node_id,
      pdf_page: firstClaim?.pdf_page ?? primary.pdf_page,
      printed_page: firstClaim?.printed_page ?? primary.printed_page,
      evidence_quote: firstClaim?.evidence_quote ?? primary.evidence_quote,
      evidence_excerpt: firstClaim?.evidence_excerpt ?? primary.evidence_excerpt,
      evidence_excerpt_hash: firstClaim?.evidence_excerpt_hash ?? primary.evidence_excerpt_hash,
      confidence: finiteMaximum(ordered.map(alignment => alignment.confidence)),
      score: finiteMaximum(ordered.map(alignment => alignment.score)),
      review_status: reviewStatus
    }
  }).sort((left, right) => (
    String(alignmentContainerId(left)).localeCompare(String(alignmentContainerId(right)))
    || Number(left.pdf_page ?? Number.MAX_SAFE_INTEGER) - Number(right.pdf_page ?? Number.MAX_SAFE_INTEGER)
    || String(left.standard_code || '').localeCompare(String(right.standard_code || ''))
    || String(left.relation_type || '').localeCompare(String(right.relation_type || ''))
    || String(left.alignment_id || '').localeCompare(String(right.alignment_id || ''))
  ))
}

export function buildTextbookAlignmentPageContextIndex(detail) {
  const pages = {}
  const ensurePage = pdfPage => {
    const key = String(pdfPage)
    if (!pages[key]) pages[key] = { node_ids: [], alignment_ids: [], evidence_span_ids: [] }
    return pages[key]
  }
  const add = (array, value) => {
    if (value && !array.includes(value)) array.push(value)
  }
  const nodesById = new Map(asArray(detail.content_nodes).map(node => [node.node_id, node]))
  const spansById = evidenceIndex(detail.evidence_spans)

  for (const node of asArray(detail.content_nodes)) {
    for (let page = node.pdf_page; page <= node.end_pdf_page; page += 1) add(ensurePage(page).node_ids, node.node_id)
  }
  for (const span of asArray(detail.evidence_spans)) {
    const page = ensurePage(span.pdf_page)
    add(page.node_ids, span.node_id)
    add(page.evidence_span_ids, span.evidence_span_id || span.span_id)
  }
  for (const alignment of asArray(detail.alignments)) {
    const targets = unique([
      ...asArray(alignment.node_ids),
      alignment.node_id,
      alignment.content_node_id
    ]).map(id => nodesById.get(id)).filter(Boolean)
    if (!targets.length && alignment.unit_id) {
      const fallback = asArray(detail.content_nodes).find(node => node.unit_id === alignment.unit_id || node.node_id === alignment.unit_id)
      if (fallback) targets.push(fallback)
    }
    const claims = textbookAlignmentEvidenceClaims(alignment, spansById)
    const pageNumbers = new Set()
    for (const target of targets) {
      for (let page = target.pdf_page; page <= target.end_pdf_page; page += 1) pageNumbers.add(page)
    }
    if (Number.isInteger(alignment.pdf_page)) pageNumbers.add(alignment.pdf_page)
    for (const claim of claims) if (Number.isInteger(claim.pdf_page)) pageNumbers.add(claim.pdf_page)
    for (const pdfPage of pageNumbers) {
      const page = ensurePage(pdfPage)
      for (const target of targets) if (pdfPage >= target.pdf_page && pdfPage <= target.end_pdf_page) add(page.node_ids, target.node_id)
      add(page.alignment_ids, alignment.alignment_id)
      for (const claim of claims) {
        if (claim.pdf_page !== pdfPage) continue
        add(page.node_ids, claim.node_id)
        add(page.evidence_span_ids, claim.evidence_span_id)
      }
    }
  }
  for (const page of Object.values(pages)) {
    page.node_ids.sort()
    page.alignment_ids.sort()
    page.evidence_span_ids.sort()
  }
  return { schema_version: 1, edition_id: detail.edition_id, pages }
}
