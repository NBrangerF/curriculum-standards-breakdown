export function normalizeCompareSelection(nodeIds = [], model, maxItems = 4) {
    const validNodeIds = new Set(model.nodes.map(node => node.id))
    const result = []
    for (const nodeId of nodeIds) {
        if (!validNodeIds.has(nodeId) || result.includes(nodeId)) continue
        result.push(nodeId)
        if (result.length === maxItems) break
    }
    return result
}

function createTraversalIndex(model, relationTypes) {
    const allowed = new Set(relationTypes)
    const adjacency = new Map(model.nodes.map(node => [node.id, []]))

    for (const edge of model.edges) {
        if (!allowed.has(edge.type)) continue
        adjacency.get(edge.source)?.push({
            nodeId: edge.target,
            edge,
            traversal: edge.directed ? 'forward' : 'undirected'
        })
        adjacency.get(edge.target)?.push({
            nodeId: edge.source,
            edge,
            traversal: edge.directed ? 'reverse' : 'undirected'
        })
    }

    for (const steps of adjacency.values()) {
        steps.sort((left, right) => (
            left.edge.type.localeCompare(right.edge.type) ||
            left.nodeId.localeCompare(right.nodeId) ||
            left.edge.id.localeCompare(right.edge.id)
        ))
    }

    return adjacency
}

export function findShortestPath(model, {
    sourceId,
    targetId,
    relationTypes,
    maxDepth = 10
} = {}) {
    if (!sourceId || !targetId || sourceId === targetId) return null
    const nodeById = new Map(model.nodes.map(node => [node.id, node]))
    if (!nodeById.has(sourceId) || !nodeById.has(targetId)) return null

    const adjacency = createTraversalIndex(model, relationTypes)
    const visited = new Set([sourceId])
    const queue = [{ nodeId: sourceId, nodes: [sourceId], steps: [] }]

    while (queue.length) {
        const current = queue.shift()
        if (current.steps.length >= maxDepth) continue

        for (const candidate of adjacency.get(current.nodeId) || []) {
            if (visited.has(candidate.nodeId)) continue
            const nodes = [...current.nodes, candidate.nodeId]
            const steps = [...current.steps, {
                edge: candidate.edge,
                traversal: candidate.traversal,
                from: current.nodeId,
                to: candidate.nodeId
            }]

            if (candidate.nodeId === targetId) {
                return {
                    sourceId,
                    targetId,
                    nodes: nodes.map(nodeId => nodeById.get(nodeId)),
                    steps,
                    relationTypes: [...new Set(steps.map(step => step.edge.type))]
                }
            }

            visited.add(candidate.nodeId)
            queue.push({ nodeId: candidate.nodeId, nodes, steps })
        }
    }

    return null
}

export function buildCompareSummary(model, nodeIds, relationTypes) {
    const normalizedNodeIds = normalizeCompareSelection(nodeIds, model)
    const nodeById = new Map(model.nodes.map(node => [node.id, node]))
    const allowed = new Set(relationTypes)
    const relationsByNodeId = new Map(normalizedNodeIds.map(nodeId => [nodeId, []]))

    for (const edge of model.edges) {
        if (!allowed.has(edge.type)) continue
        if (relationsByNodeId.has(edge.source)) relationsByNodeId.get(edge.source).push(edge)
        if (relationsByNodeId.has(edge.target)) relationsByNodeId.get(edge.target).push(edge)
    }

    const items = normalizedNodeIds.map(nodeId => {
        const node = nodeById.get(nodeId)
        const edges = relationsByNodeId.get(nodeId)
        return {
            node,
            directRelationCount: edges.length,
            relationTypes: [...new Set(edges.map(edge => edge.type))].sort(),
            provenanceFields: [...new Set(edges.map(edge => edge.provenance?.field).filter(Boolean))].sort()
        }
    })

    const commonRelationTypes = items.length
        ? items[0].relationTypes.filter(type => items.every(item => item.relationTypes.includes(type)))
        : []

    return {
        nodeIds: normalizedNodeIds,
        items,
        commonRelationTypes,
        differingRelationTypes: [...new Set(items.flatMap(item => item.relationTypes))]
            .filter(type => !commonRelationTypes.includes(type))
            .sort()
    }
}

const GRADE_BAND_ORDER = new Map([
    ['H1', 1],
    ['H2', 2],
    ['H3', 3],
    ['H4G7', 4],
    ['H4G8', 5],
    ['H4G9', 6]
])

function progressionCandidateSort(left, right, nodeById, gradeDirection = 1) {
    const leftNode = nodeById.get(left.nodeId)
    const rightNode = nodeById.get(right.nodeId)
    return (
        ((GRADE_BAND_ORDER.get(leftNode?.meta?.gradeBand) || 99) -
        (GRADE_BAND_ORDER.get(rightNode?.meta?.gradeBand) || 99)) * gradeDirection ||
        left.nodeId.localeCompare(right.nodeId) ||
        left.edge.id.localeCompare(right.edge.id)
    )
}

/**
 * Build an evidence-backed grade progression around a selected standard.
 * Only explicit, directed `progression` edges are traversed. When source data
 * branches, the deterministic primary chain is shown and the alternate count
 * remains visible to the inspector instead of inventing a prerequisite order.
 */
export function buildProgressionPath(model, selectedNodeId) {
    const nodeById = new Map(model.nodes.map(node => [node.id, node]))
    const selectedNode = nodeById.get(selectedNodeId)
    if (!selectedNode || selectedNode.type !== 'standard') return null

    const incoming = new Map()
    const outgoing = new Map()
    for (const edge of model.edges) {
        if (edge.type !== 'progression' || !edge.directed) continue
        const next = outgoing.get(edge.source) || []
        next.push({ nodeId: edge.target, edge })
        outgoing.set(edge.source, next)
        const previous = incoming.get(edge.target) || []
        previous.push({ nodeId: edge.source, edge })
        incoming.set(edge.target, previous)
    }
    for (const candidates of incoming.values()) candidates.sort((a, b) => progressionCandidateSort(a, b, nodeById, -1))
    for (const candidates of outgoing.values()) candidates.sort((a, b) => progressionCandidateSort(a, b, nodeById))

    const beforeNodes = []
    const beforeSteps = []
    const visited = new Set([selectedNodeId])
    let cursor = selectedNodeId
    while ((incoming.get(cursor) || []).length) {
        const candidate = incoming.get(cursor)[0]
        if (visited.has(candidate.nodeId)) break
        visited.add(candidate.nodeId)
        beforeNodes.unshift(nodeById.get(candidate.nodeId))
        beforeSteps.unshift(candidate.edge)
        cursor = candidate.nodeId
    }

    const afterNodes = []
    const afterSteps = []
    cursor = selectedNodeId
    while ((outgoing.get(cursor) || []).length) {
        const candidate = outgoing.get(cursor)[0]
        if (visited.has(candidate.nodeId)) break
        visited.add(candidate.nodeId)
        afterNodes.push(nodeById.get(candidate.nodeId))
        afterSteps.push(candidate.edge)
        cursor = candidate.nodeId
    }

    const nodes = [...beforeNodes, selectedNode, ...afterNodes]
    const edges = [...beforeSteps, ...afterSteps]
    if (nodes.length === 1) return null

    const pathEdgeIds = new Set(edges.map(edge => edge.id))
    const alternateEdgeIds = new Set()
    for (const nodeId of visited) {
        for (const candidate of [...(incoming.get(nodeId) || []), ...(outgoing.get(nodeId) || [])]) {
            if (!pathEdgeIds.has(candidate.edge.id)) alternateEdgeIds.add(candidate.edge.id)
        }
    }

    return {
        nodes,
        edges,
        currentIndex: beforeNodes.length,
        before: beforeNodes.at(-1) || null,
        current: selectedNode,
        after: afterNodes[0] || null,
        branchCount: alternateEdgeIds.size,
        provenanceFields: [...new Set(edges.map(edge => edge.provenance?.field).filter(Boolean))].sort()
    }
}
