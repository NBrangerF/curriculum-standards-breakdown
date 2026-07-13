import type {
    KnowledgeGraphDataset,
    KnowledgeGraphIndex,
    KnowledgePoint,
    LearningContext,
    LearningContextOptions,
    PrerequisiteEdge,
    PrerequisiteNecessity,
    TaxonomyEdge,
    TaxonomyNode,
    TopologicalLayers
} from './types.js'

type LearningNode = KnowledgePoint | TaxonomyNode

const approved = <T extends { reviewStatus: string }>(item: T) => item.reviewStatus === 'approved'
const pointOrder = (left: KnowledgePoint, right: KnowledgePoint) => left.label.localeCompare(right.label, 'zh-CN') || left.id.localeCompare(right.id)
const edgeOrder = (left: { order?: number, id: string }, right: { order?: number, id: string }) => (left.order || 0) - (right.order || 0) || left.id.localeCompare(right.id)

const addToIndex = <T>(index: Map<string, T[]>, key: string, value: T) => {
    const values = index.get(key) || []
    values.push(value)
    index.set(key, values)
}

const sortIndex = <T>(index: Map<string, T[]>, compare: (left: T, right: T) => number) => {
    for (const values of index.values()) values.sort(compare)
}

export function createKnowledgeGraphIndex(dataset: KnowledgeGraphDataset): KnowledgeGraphIndex {
    const knowledgePoints = dataset.knowledgePoints.filter(approved)
    const taxonomyNodes = dataset.taxonomyNodes.filter(approved)
    const prerequisites = dataset.prerequisites.filter(approved)
    const taxonomyEdges = dataset.taxonomyEdges.filter(approved)
    const evidence = dataset.evidence

    const incomingPrerequisitesByPoint = new Map<string, PrerequisiteEdge[]>()
    const outgoingPrerequisitesByPoint = new Map<string, PrerequisiteEdge[]>()
    const taxonomyParentsByNode = new Map<string, TaxonomyEdge[]>()
    const taxonomyChildrenByNode = new Map<string, TaxonomyEdge[]>()

    for (const edge of prerequisites) {
        addToIndex(incomingPrerequisitesByPoint, edge.target, edge)
        addToIndex(outgoingPrerequisitesByPoint, edge.source, edge)
    }
    for (const edge of taxonomyEdges) {
        addToIndex(taxonomyParentsByNode, edge.target, edge)
        addToIndex(taxonomyChildrenByNode, edge.source, edge)
    }
    sortIndex(incomingPrerequisitesByPoint, (left, right) => left.id.localeCompare(right.id))
    sortIndex(outgoingPrerequisitesByPoint, (left, right) => left.id.localeCompare(right.id))
    sortIndex(taxonomyParentsByNode, edgeOrder)
    sortIndex(taxonomyChildrenByNode, edgeOrder)

    return {
        knowledgePointsById: new Map(knowledgePoints.map(point => [point.id, point])),
        taxonomyNodesById: new Map(taxonomyNodes.map(node => [node.id, node])),
        evidenceById: new Map(evidence.map(item => [item.id, item])),
        prerequisitesById: new Map(prerequisites.map(edge => [edge.id, edge])),
        taxonomyEdgesById: new Map(taxonomyEdges.map(edge => [edge.id, edge])),
        incomingPrerequisitesByPoint,
        outgoingPrerequisitesByPoint,
        taxonomyParentsByNode,
        taxonomyChildrenByNode
    }
}

const pointFor = (index: KnowledgeGraphIndex, id: string) => index.knowledgePointsById.get(id)
const nodeFor = (index: KnowledgeGraphIndex, id: string): LearningNode | undefined => pointFor(index, id) || index.taxonomyNodesById.get(id)

export function getPrerequisites(index: KnowledgeGraphIndex, pointId: string, necessity?: PrerequisiteNecessity[]): KnowledgePoint[] {
    const allowed = necessity ? new Set(necessity) : undefined
    return (index.incomingPrerequisitesByPoint.get(pointId) || [])
        .filter(edge => !allowed || allowed.has(edge.necessity))
        .map(edge => pointFor(index, edge.source))
        .filter((point): point is KnowledgePoint => Boolean(point))
        .sort(pointOrder)
}

export function getUnlocks(index: KnowledgeGraphIndex, pointId: string, necessity?: PrerequisiteNecessity[]): KnowledgePoint[] {
    const allowed = necessity ? new Set(necessity) : undefined
    return (index.outgoingPrerequisitesByPoint.get(pointId) || [])
        .filter(edge => !allowed || allowed.has(edge.necessity))
        .map(edge => pointFor(index, edge.target))
        .filter((point): point is KnowledgePoint => Boolean(point))
        .sort(pointOrder)
}

function collectLayers(index: KnowledgeGraphIndex, pointId: string, depth: number, direction: 'incoming' | 'outgoing', necessity?: PrerequisiteNecessity[]) {
    const layers: KnowledgePoint[][] = []
    const visited = new Set([pointId])
    let frontier = [pointId]
    for (let level = 0; level < Math.max(0, depth); level += 1) {
        const next = new Map<string, KnowledgePoint>()
        for (const current of frontier) {
            const candidates = direction === 'incoming'
                ? getPrerequisites(index, current, necessity)
                : getUnlocks(index, current, necessity)
            for (const candidate of candidates) {
                if (!visited.has(candidate.id)) next.set(candidate.id, candidate)
            }
        }
        const nodes = [...next.values()].sort(pointOrder)
        if (!nodes.length) break
        nodes.forEach(node => visited.add(node.id))
        layers.push(nodes)
        frontier = nodes.map(node => node.id)
    }
    return layers
}

function trimLayers(layers: KnowledgePoint[][], limit: number) {
    let remaining = limit
    return layers.map(layer => {
        const visible = layer.slice(0, Math.max(0, remaining))
        remaining -= visible.length
        return visible
    }).filter(layer => layer.length)
}

export function buildTopologicalLayers(index: KnowledgeGraphIndex, pointId: string, options: LearningContextOptions = {}): TopologicalLayers {
    const allPrerequisiteLayers = collectLayers(index, pointId, options.prerequisiteDepth ?? 1, 'incoming', options.necessity)
    const allUnlockLayers = collectLayers(index, pointId, options.unlockDepth ?? 1, 'outgoing', options.necessity)
    // The focus is always visible, so it consumes one slot from the visual budget.
    const maxVisibleNodes = Math.max(1, options.maxVisibleNodes ?? 40)
    const maxRelatedNodes = Math.max(0, maxVisibleNodes - 1)
    const prerequisiteLayers = trimLayers(allPrerequisiteLayers, maxRelatedNodes)
    const prerequisiteCount = prerequisiteLayers.flat(1).length
    const unlockLayers = trimLayers(allUnlockLayers, Math.max(0, maxRelatedNodes - prerequisiteCount))
    const totalRelatedNodeCount = allPrerequisiteLayers.flat(1).length + allUnlockLayers.flat(1).length
    const visibleRelatedNodeCount = prerequisiteCount + unlockLayers.flat(1).length
    const visibleNodeCount = 1 + visibleRelatedNodeCount
    const pointIds = new Set([pointId, ...prerequisiteLayers.flat(1).map(point => point.id), ...unlockLayers.flat(1).map(point => point.id)])
    const allowed = options.necessity ? new Set(options.necessity) : undefined

    return {
        prerequisiteLayers,
        unlockLayers,
        // Preserve only verified edges from the selected local context. Layer
        // adjacency is not evidence of a prerequisite relationship.
        edges: [...index.prerequisitesById.values()]
            .filter(edge => pointIds.has(edge.source) && pointIds.has(edge.target))
            .filter(edge => !allowed || allowed.has(edge.necessity))
            .sort((left, right) => left.id.localeCompare(right.id)),
        visibleNodeCount,
        hiddenNodeCount: Math.max(0, totalRelatedNodeCount - visibleRelatedNodeCount)
    }
}

function allTaxonomyPaths(index: KnowledgeGraphIndex, nodeId: string, visited = new Set<string>()): string[][] {
    if (visited.has(nodeId)) return []
    const parents = index.taxonomyParentsByNode.get(nodeId) || []
    if (!parents.length) return [[nodeId]]
    const nextVisited = new Set(visited)
    nextVisited.add(nodeId)
    return parents.flatMap(edge => allTaxonomyPaths(index, edge.source, nextVisited).map(path => [...path, nodeId]))
}

export function resolveTaxonomyPath(index: KnowledgeGraphIndex, pointId: string, preferredPath: string[] = []): string[] {
    const paths = allTaxonomyPaths(index, pointId)
        .filter(path => path.every(id => nodeFor(index, id)))
        .sort((left, right) => left.length - right.length || left.join('\u0000').localeCompare(right.join('\u0000')))
    if (preferredPath.length && paths.some(path => path.join('\u0000') === preferredPath.join('\u0000'))) return preferredPath
    return paths[0] || [pointId]
}

const splitByNecessity = (index: KnowledgeGraphIndex, focusId: string, direction: 'incoming' | 'outgoing', maxVisibleNodes: number, necessity?: PrerequisiteNecessity[]) => {
    const points = direction === 'incoming'
        ? getPrerequisites(index, focusId, necessity)
        : getUnlocks(index, focusId, necessity)
    const visible = points.slice(0, maxVisibleNodes)
    const edgeIndex = direction === 'incoming' ? index.incomingPrerequisitesByPoint : index.outgoingPrerequisitesByPoint
    const edgeForPoint = new Map((edgeIndex.get(focusId) || []).map(edge => [direction === 'incoming' ? edge.source : edge.target, edge]))
    return {
        required: visible.filter(point => edgeForPoint.get(point.id)?.necessity === 'required'),
        recommended: visible.filter(point => edgeForPoint.get(point.id)?.necessity === 'recommended'),
        total: points.length,
        hidden: Math.max(0, points.length - visible.length)
    }
}

export function getLearningContext(index: KnowledgeGraphIndex, pointId: string, options: LearningContextOptions = {}): LearningContext {
    const focus = pointFor(index, pointId)
    if (!focus) throw new Error(`Unknown knowledge point: ${pointId}`)
    const activePathIds = resolveTaxonomyPath(index, pointId, options.contextPath)
    const activePath = activePathIds.map(id => nodeFor(index, id)).filter((node): node is LearningNode => Boolean(node))
    const alternativePaths = allTaxonomyPaths(index, pointId)
        .filter(path => path.join('\u0000') !== activePathIds.join('\u0000'))
        .map(path => path.map(id => nodeFor(index, id)).filter((node): node is LearningNode => Boolean(node)))
    const parentId = activePathIds.at(-2)
    const siblings = parentId
        ? (index.taxonomyChildrenByNode.get(parentId) || [])
            .map(edge => nodeFor(index, edge.target))
            .filter((node): node is LearningNode => node !== undefined && node.id !== pointId)
            .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN') || left.id.localeCompare(right.id))
        : []
    const children = (index.taxonomyChildrenByNode.get(pointId) || [])
        .map(edge => nodeFor(index, edge.target))
        .filter((node): node is LearningNode => Boolean(node))
        .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN') || left.id.localeCompare(right.id))
    const maxVisibleNodes = Math.max(1, options.maxVisibleNodes ?? 40)

    return {
        focus,
        prerequisites: splitByNecessity(index, pointId, 'incoming', maxVisibleNodes, options.necessity),
        unlocks: splitByNecessity(index, pointId, 'outgoing', maxVisibleNodes, options.necessity),
        taxonomy: { activePath, alternativePaths, siblings, children },
        coverage: focus.dependencyCoverage,
        warnings: []
    }
}
