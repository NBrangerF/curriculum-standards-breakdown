import dagre from '@dagrejs/dagre'

const NODE_WIDTH = 208
const NODE_HEIGHT = 96

const pointComparator = (left, right) => left.id.localeCompare(right.id, 'zh-Hans-CN')

const flattenLayers = layers => layers.flatMap(layer => [...layer].sort(pointComparator))

const buildDisplayLayers = context => {
    if (!context?.focus?.id) throw new Error('layoutLearningDag requires a focused knowledge point')

    return [
        ...[...(context.topology?.prerequisiteLayers || [])].reverse(),
        [context.focus],
        ...(context.topology?.unlockLayers || [])
    ].map(layer => [...layer].sort(pointComparator))
}

const buildEdges = (topology, pointIds) => {
    const seen = new Set()
    return (topology.edges || [])
        .filter(edge => pointIds.has(edge.source) && pointIds.has(edge.target))
        .filter(edge => {
            if (seen.has(edge.id)) return false
            seen.add(edge.id)
            return true
        })
        .map(edge => ({ id: edge.id, source: edge.source, target: edge.target, kind: 'prerequisite', relationship: edge }))
        .sort((left, right) => left.id.localeCompare(right.id, 'zh-Hans-CN'))
}

/**
 * Produces deterministic, renderer-neutral positions for the focused local DAG.
 * It intentionally lays out only the already selected learning context; it must
 * never be used to render the entire curriculum graph.
 */
export const layoutLearningDag = context => {
    const layers = buildDisplayLayers(context)
    const points = flattenLayers(layers)
    const edges = buildEdges(context.topology || {}, new Set(points.map(point => point.id)))
    const graph = new dagre.graphlib.Graph({ multigraph: true })

    graph.setGraph({ rankdir: 'LR', align: 'UL', nodesep: 36, ranksep: 88, marginx: 32, marginy: 32 })
    graph.setDefaultEdgeLabel(() => ({}))
    points.forEach(point => graph.setNode(point.id, { width: NODE_WIDTH, height: NODE_HEIGHT }))
    edges.forEach(edge => graph.setEdge(edge.source, edge.target, { id: edge.id }, edge.id))
    dagre.layout(graph)

    const nodes = points.map(point => {
        const positioned = graph.node(point.id)
        return {
            id: point.id,
            type: point.id === context.focus.id ? 'focus' : 'knowledge',
            data: { point, layer: layers.findIndex(items => items.some(item => item.id === point.id)) },
            position: {
                x: Math.round(positioned.x - NODE_WIDTH / 2),
                y: Math.round(positioned.y - NODE_HEIGHT / 2)
            }
        }
    }).sort((left, right) => left.id.localeCompare(right.id, 'zh-Hans-CN'))

    return { nodes, edges }
}
