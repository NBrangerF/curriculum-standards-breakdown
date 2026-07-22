const UNIT_KINDS = new Set(['part', 'module', 'unit', 'chapter'])

function asArray(value) {
    return Array.isArray(value) ? value : []
}

function positiveNumber(value) {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? number : null
}

export function getNodeStart(node) {
    return positiveNumber(node?.pdf_page_start ?? node?.start_pdf_page ?? node?.pdf_page) || 1
}

export function getNodeEnd(node, pageCount = Number.MAX_SAFE_INTEGER) {
    return positiveNumber(node?.pdf_page_end ?? node?.end_pdf_page) || getNodeStart(node) || pageCount
}

function nodeIdentifier(node) {
    return node?.node_id || node?.entry_id || node?.unit_id || ''
}

function normalizeContentNodes(book) {
    const contentNodes = asArray(book?.content_nodes)
    if (contentNodes.length) {
        return contentNodes.map(node => ({
            ...node,
            node_id: nodeIdentifier(node),
            pdf_page_start: getNodeStart(node),
            pdf_page_end: getNodeEnd(node, book?.page_count)
        }))
    }

    const toc = asArray(book?.toc)
    return toc.map((entry, index) => {
        const nextStart = positiveNumber(toc[index + 1]?.pdf_page_start ?? toc[index + 1]?.pdf_page)
        return {
            ...entry,
            node_id: nodeIdentifier(entry),
            pdf_page_start: getNodeStart(entry),
            pdf_page_end: positiveNumber(entry?.end_pdf_page) || (nextStart ? nextStart - 1 : positiveNumber(book?.page_count) || getNodeStart(entry)),
            legacy_toc_node: true
        }
    })
}

function buildDepthMap(nodes) {
    const byId = new Map(nodes.map(node => [node.node_id, node]))
    const depthById = new Map()
    const resolveDepth = (node, seen = new Set()) => {
        if (!node?.node_id) return 0
        if (depthById.has(node.node_id)) return depthById.get(node.node_id)
        if (!node.parent_id || seen.has(node.node_id)) return 0
        const nextSeen = new Set(seen).add(node.node_id)
        const depth = 1 + resolveDepth(byId.get(node.parent_id), nextSeen)
        depthById.set(node.node_id, depth)
        return depth
    }
    nodes.forEach(node => depthById.set(node.node_id, resolveDepth(node)))
    return depthById
}

export function findActiveTextbookNodes(book, pdfPage) {
    const page = positiveNumber(pdfPage) || 1
    const nodes = normalizeContentNodes(book)
    const depths = buildDepthMap(nodes)
    return nodes
        .filter(node => getNodeStart(node) <= page && getNodeEnd(node, book?.page_count) >= page)
        .sort((left, right) => {
            const depthDifference = (depths.get(left.node_id) || 0) - (depths.get(right.node_id) || 0)
            if (depthDifference) return depthDifference
            const leftSpan = getNodeEnd(left, book?.page_count) - getNodeStart(left)
            const rightSpan = getNodeEnd(right, book?.page_count) - getNodeStart(right)
            return rightSpan - leftSpan
        })
}

export function getEvidenceSpansForAlignment(book, alignment) {
    const spanById = new Map(asArray(book?.evidence_spans).map(span => [span.span_id || span.evidence_span_id, span]))
    const inline = asArray(alignment?.evidence_spans)
    const referenced = asArray(alignment?.evidence_span_ids)
        .map(spanId => spanById.get(spanId))
        .filter(Boolean)
    return inline.length ? inline : referenced
}

function alignmentNodeId(alignment) {
    return alignment?.node_id || alignment?.content_node_id || alignment?.unit_id || ''
}

function alignmentPages(book, alignment) {
    const pages = getEvidenceSpansForAlignment(book, alignment)
        .map(span => positiveNumber(span?.pdf_page))
        .filter(Boolean)
    const directPage = positiveNumber(alignment?.pdf_page)
    return [...new Set(directPage ? [directPage, ...pages] : pages)]
}

function uniqueAlignments(items) {
    const seen = new Set()
    return items.filter(item => {
        const key = item.alignment_id || `${item.standard_code}:${alignmentNodeId(item)}:${item.relation_type || ''}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

function isUnitNode(node) {
    return UNIT_KINDS.has(String(node?.kind || '').toLowerCase())
}

function nodePath(nodes, target) {
    if (!target) return []
    const byId = new Map(nodes.map(node => [node.node_id, node]))
    const path = []
    const seen = new Set()
    let current = target
    while (current && !seen.has(current.node_id)) {
        path.unshift(current)
        seen.add(current.node_id)
        current = byId.get(current.parent_id)
    }
    if (!path.some(isUnitNode) && target.unit_id) {
        const unit = byId.get(target.unit_id)
        if (unit) path.unshift(unit)
    }
    return path
}

export function buildTextbookAlignmentContext(book, pdfPage, preferredNodeId = '') {
    const page = positiveNumber(pdfPage) || 1
    const activeNodes = findActiveTextbookNodes(book, page)
    const activeNodeIds = new Set(activeNodes.map(node => node.node_id))
    const activeLeaf = activeNodes.at(-1) || null
    const alignments = asArray(book?.alignments)
    const pageAlignments = uniqueAlignments(alignments.filter(alignment => alignmentPages(book, alignment).includes(page)))
    const pageAlignmentNodeIds = new Set(pageAlignments.map(alignmentNodeId).filter(Boolean))
    const specificNode = activeNodes.find(node => node.node_id === preferredNodeId && !isUnitNode(node))
        || activeNodes.find(node => pageAlignmentNodeIds.has(node.node_id) && !isUnitNode(node))
        || [...activeNodes].reverse().find(node => !isUnitNode(node) && String(node.kind || '').toLowerCase() !== 'page')
        || activeLeaf
    const unitNode = [...activeNodes].reverse().find(isUnitNode)
        || activeNodes.find(node => node.node_id === specificNode?.unit_id)
        || null
    const assigned = new Set(pageAlignments)
    const nodeAlignments = uniqueAlignments(alignments.filter(alignment => {
        if (assigned.has(alignment) || !specificNode) return false
        const nodeId = alignmentNodeId(alignment)
        return nodeId === specificNode.node_id || (activeNodeIds.has(nodeId) && !isUnitNode(activeNodes.find(node => node.node_id === nodeId)))
    }))
    nodeAlignments.forEach(item => assigned.add(item))
    const unitIdentifiers = new Set([unitNode?.node_id, unitNode?.unit_id, specificNode?.unit_id].filter(Boolean))
    const unitAlignments = uniqueAlignments(alignments.filter(alignment => {
        if (assigned.has(alignment) || !unitIdentifiers.size) return false
        const hasSpecificNode = Boolean(alignment.node_id || alignment.content_node_id)
        if (hasSpecificNode) return unitIdentifiers.has(alignmentNodeId(alignment))
        return unitIdentifiers.has(alignmentNodeId(alignment)) || unitIdentifiers.has(alignment.unit_id)
    }))

    const scopes = asArray(book?.standard_scopes).flatMap(scope =>
        asArray(scope.standard_codes).map(standardCode => ({
            ...scope,
            standard_code: standardCode,
            scope_only: true
        }))
    )

    return {
        page,
        activeNodes,
        breadcrumbNodes: nodePath(activeNodes, specificNode),
        activeLeaf,
        specificNode,
        unitNode,
        pageAlignments,
        nodeAlignments,
        unitAlignments,
        scopes,
        hasSpecificAlignments: pageAlignments.length + nodeAlignments.length + unitAlignments.length > 0
    }
}

export function resolveTextbookDeepLinkPage(book, searchParams, fallbackPage = 1) {
    const pageCount = positiveNumber(book?.page_count) || Number.MAX_SAFE_INTEGER
    const clampPage = value => Math.max(1, Math.min(pageCount, positiveNumber(value) || 1))
    const requestedPage = positiveNumber(searchParams?.get?.('page'))
    if (requestedPage) return clampPage(requestedPage)

    const alignmentId = searchParams?.get?.('alignment')
    const alignment = asArray(book?.alignments).find(item => item.alignment_id === alignmentId)
    const alignmentPage = alignment ? alignmentPages(book, alignment)[0] : null
    if (alignmentPage) return clampPage(alignmentPage)

    const nodeId = searchParams?.get?.('node')
    const node = normalizeContentNodes(book).find(item => item.node_id === nodeId)
    return node ? clampPage(getNodeStart(node)) : clampPage(fallbackPage)
}

export function alignmentCoversPage(book, alignmentId, pdfPage) {
    if (!alignmentId) return false
    const alignment = asArray(book?.alignments).find(item => item.alignment_id === alignmentId)
    if (!alignment) return false
    const pages = alignmentPages(book, alignment)
    if (pages.length) return pages.includes(positiveNumber(pdfPage))
    const nodeId = alignmentNodeId(alignment)
    return findActiveTextbookNodes(book, pdfPage).some(node => node.node_id === nodeId)
}
