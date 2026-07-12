import { createGraphModel } from './graphModel.js'

export function sampleGraphModel(model, requestedNodeCount) {
    const targetCount = Math.min(Math.max(requestedNodeCount, 1), model.nodes.length)
    const nodeById = new Map(model.nodes.map(node => [node.id, node]))
    const neighbors = new Map(model.nodes.map(node => [node.id, new Set()]))

    for (const edge of model.edges) {
        neighbors.get(edge.source)?.add(edge.target)
        neighbors.get(edge.target)?.add(edge.source)
    }

    const degreeSortedNodes = [...model.nodes]
        .sort((a, b) => {
            const degreeDelta = (neighbors.get(b.id)?.size || 0) - (neighbors.get(a.id)?.size || 0)
            return degreeDelta || a.id.localeCompare(b.id)
        })
    const entityTypes = ['subject', 'domain', 'skill', 'standard']
    const typeSeeds = entityTypes
        .map(type => degreeSortedNodes.find(node => node.type === type)?.id)
        .filter(Boolean)
    const seedOrder = [
        ...typeSeeds,
        ...degreeSortedNodes.map(node => node.id).filter(id => !typeSeeds.includes(id))
    ]

    const selectedIds = new Set()
    const queuedIds = new Set()
    const queue = []

    const enqueue = id => {
        if (!selectedIds.has(id) && !queuedIds.has(id)) {
            queue.push(id)
            queuedIds.add(id)
        }
    }

    typeSeeds.forEach(enqueue)

    while (queue.length > 0 && selectedIds.size < targetCount) {
        const id = queue.shift()
        queuedIds.delete(id)
        if (selectedIds.has(id)) continue
        selectedIds.add(id)

        const orderedNeighbors = [...(neighbors.get(id) || [])].sort()
        orderedNeighbors.forEach(enqueue)
    }

    for (const seedId of seedOrder) {
        if (selectedIds.size >= targetCount) break
        enqueue(seedId)

        while (queue.length > 0 && selectedIds.size < targetCount) {
            const id = queue.shift()
            queuedIds.delete(id)
            if (selectedIds.has(id)) continue
            selectedIds.add(id)

            const orderedNeighbors = [...(neighbors.get(id) || [])].sort()
            orderedNeighbors.forEach(enqueue)
        }
    }

    const nodes = [...selectedIds].map(id => nodeById.get(id))
    const edges = model.edges.filter(edge => selectedIds.has(edge.source) && selectedIds.has(edge.target))

    return createGraphModel({
        id: `${model.id}:sample:${targetCount}`,
        nodes,
        edges,
        meta: {
            ...model.meta,
            sample: {
                method: 'deterministic_entity_type_seeded_bfs',
                requestedNodeCount,
                actualNodeCount: nodes.length,
                sourceNodeCount: model.nodes.length
            }
        }
    })
}
