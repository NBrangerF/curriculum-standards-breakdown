export function createGraphIndex(model) {
    const nodeById = new Map(model.nodes.map(node => [node.id, node]))
    const relationsByNodeId = new Map(model.nodes.map(node => [node.id, []]))

    for (const edge of model.edges) {
        const source = nodeById.get(edge.source)
        const target = nodeById.get(edge.target)
        if (!source || !target) continue

        relationsByNodeId.get(source.id).push({
            edge,
            node: target,
            direction: edge.directed ? 'outgoing' : 'undirected'
        })
        relationsByNodeId.get(target.id).push({
            edge,
            node: source,
            direction: edge.directed ? 'incoming' : 'undirected'
        })
    }

    for (const relations of relationsByNodeId.values()) {
        relations.sort((a, b) => (
            a.edge.type.localeCompare(b.edge.type) ||
            a.node.label.localeCompare(b.node.label, 'zh-CN') ||
            a.node.id.localeCompare(b.node.id)
        ))
    }

    return { model, nodeById, relationsByNodeId }
}

export function getDirectRelations(index, nodeId, relationTypes = null) {
    const allowed = relationTypes === null ? null : new Set(relationTypes)
    return (index.relationsByNodeId.get(nodeId) || [])
        .filter(relation => allowed === null || allowed.has(relation.edge.type))
}

export function getVisibleNodeIds(index, startNodeId, { relationTypes = null, depth = 1 } = {}) {
    if (!index.nodeById.has(startNodeId)) return []

    const visited = new Set([startNodeId])
    let frontier = [startNodeId]

    for (let level = 0; level < depth; level += 1) {
        const next = []
        for (const nodeId of frontier) {
            for (const relation of getDirectRelations(index, nodeId, relationTypes)) {
                if (visited.has(relation.node.id)) continue
                visited.add(relation.node.id)
                next.push(relation.node.id)
            }
        }
        frontier = next
        if (frontier.length === 0) break
    }

    return [...visited]
}
