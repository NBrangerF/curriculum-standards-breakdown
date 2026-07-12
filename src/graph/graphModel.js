export const GRAPH_ENTITY_TYPES = Object.freeze({
    SUBJECT: 'subject',
    DOMAIN: 'domain',
    STANDARD: 'standard',
    SKILL: 'skill'
})

export const GRAPH_RELATION_TYPES = Object.freeze({
    CONTAINS: 'contains',
    SKILL_ALIGNMENT: 'skill_alignment',
    PROGRESSION: 'progression'
})

export function createGraphModel({ id, nodes = [], edges = [], meta = {} }) {
    const model = {
        id,
        version: 1,
        nodes,
        edges,
        meta
    }

    const validation = validateGraphModel(model)
    if (!validation.valid) {
        throw new Error(`Invalid GraphModel: ${validation.errors.join('; ')}`)
    }

    return model
}

export function validateGraphModel(model) {
    const errors = []
    const nodeIds = new Set()
    const edgeIds = new Set()

    if (!model?.id) errors.push('model.id is required')
    if (!Array.isArray(model?.nodes)) errors.push('model.nodes must be an array')
    if (!Array.isArray(model?.edges)) errors.push('model.edges must be an array')

    for (const node of model?.nodes || []) {
        if (!node.id) errors.push('node.id is required')
        if (!node.type) errors.push(`node ${node.id || '(unknown)'} requires type`)
        if (!node.label) errors.push(`node ${node.id || '(unknown)'} requires label`)
        if (nodeIds.has(node.id)) errors.push(`duplicate node id ${node.id}`)
        nodeIds.add(node.id)
    }

    for (const edge of model?.edges || []) {
        if (!edge.id) errors.push('edge.id is required')
        if (!edge.type) errors.push(`edge ${edge.id || '(unknown)'} requires type`)
        if (edgeIds.has(edge.id)) errors.push(`duplicate edge id ${edge.id}`)
        if (!nodeIds.has(edge.source)) errors.push(`edge ${edge.id} has unknown source ${edge.source}`)
        if (!nodeIds.has(edge.target)) errors.push(`edge ${edge.id} has unknown target ${edge.target}`)
        if (!edge.provenance?.field) errors.push(`edge ${edge.id} requires provenance.field`)
        edgeIds.add(edge.id)
    }

    return { valid: errors.length === 0, errors }
}
