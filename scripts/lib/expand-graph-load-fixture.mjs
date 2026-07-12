export function expandGraphLoadFixture(graph, targetNodeCount) {
    if (targetNodeCount <= graph.nodes.length) {
        throw new Error('expandGraphLoadFixture is only for targets larger than the approved graph')
    }

    const nodes = []
    const edges = []
    let cloneIndex = 0

    while (nodes.length < targetNodeCount) {
        const remaining = targetNodeCount - nodes.length
        const sourceNodes = graph.nodes.slice(0, Math.min(remaining, graph.nodes.length))
        const selectedIds = new Set(sourceNodes.map(node => node.id))
        const idFor = id => cloneIndex === 0 ? id : `${id}::load-${cloneIndex}`

        nodes.push(...sourceNodes.map(node => ({
            ...node,
            id: idFor(node.id),
            meta: {
                ...node.meta,
                syntheticLoadTestClone: cloneIndex > 0,
                loadTestSourceId: node.id,
                loadTestCloneIndex: cloneIndex
            }
        })))

        edges.push(...graph.edges
            .filter(edge => selectedIds.has(edge.source) && selectedIds.has(edge.target))
            .map(edge => ({
                ...edge,
                id: cloneIndex === 0 ? edge.id : `${edge.id}::load-${cloneIndex}`,
                source: idFor(edge.source),
                target: idFor(edge.target),
                meta: {
                    ...edge.meta,
                    syntheticLoadTestClone: cloneIndex > 0,
                    loadTestSourceId: edge.id,
                    loadTestCloneIndex: cloneIndex
                }
            })))

        cloneIndex += 1
    }

    return {
        ...graph,
        id: `${graph.id}:load-${targetNodeCount}`,
        nodes,
        edges,
        meta: {
            ...graph.meta,
            benchmarkOnly: true,
            benchmarkMethod: 'deterministic-approved-topology-clones',
            approvedSourceNodeCount: graph.nodes.length,
            requestedNodeCount: targetNodeCount,
            syntheticCloneNodeCount: nodes.filter(node => node.meta.syntheticLoadTestClone).length
        }
    }
}
