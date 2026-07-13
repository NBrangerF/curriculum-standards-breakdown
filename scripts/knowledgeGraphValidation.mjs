import Ajv2020 from 'ajv/dist/2020.js'
import { readFileSync } from 'node:fs'

const schemaDirectory = new URL('../public/data/knowledge_graph/schemas/', import.meta.url)
const readSchema = name => JSON.parse(readFileSync(new URL(name, schemaDirectory), 'utf8'))

const ajv = new Ajv2020({ allErrors: true, strict: false })
const validateKnowledgePoint = ajv.compile(readSchema('knowledge-point.schema.json'))
const validateTaxonomyNode = ajv.compile(readSchema('taxonomy-node.schema.json'))
const validatePrerequisite = ajv.compile(readSchema('prerequisite-edge.schema.json'))
const validateTaxonomyEdge = ajv.compile(readSchema('taxonomy-edge.schema.json'))
const validateEvidence = ajv.compile(readSchema('evidence.schema.json'))

const schemaError = (name, validator) => (validator.errors || [])
    .map(error => `${name}${error.instancePath || ''} ${error.message}`)

const sorted = values => [...values].sort((left, right) => String(left).localeCompare(String(right)))

function findCycle(edges) {
    const outgoing = new Map()
    for (const edge of edges) {
        if (!outgoing.has(edge.source)) outgoing.set(edge.source, [])
        outgoing.get(edge.source).push(edge.target)
    }
    for (const targets of outgoing.values()) targets.sort((left, right) => left.localeCompare(right))

    const visited = new Set()
    const visiting = new Set()
    const stack = []

    const visit = node => {
        visited.add(node)
        visiting.add(node)
        stack.push(node)
        for (const target of outgoing.get(node) || []) {
            if (visiting.has(target)) {
                const cycleStart = stack.indexOf(target)
                return [...stack.slice(cycleStart), target]
            }
            if (!visited.has(target)) {
                const cycle = visit(target)
                if (cycle) return cycle
            }
        }
        stack.pop()
        visiting.delete(node)
        return undefined
    }

    for (const node of sorted(outgoing.keys())) {
        if (!visited.has(node)) {
            const cycle = visit(node)
            if (cycle) return cycle
        }
    }
    return undefined
}

function addToIndex(index, key, value) {
    if (!index.has(key)) index.set(key, [])
    index.get(key).push(value)
}

function sortIndexedEdges(index) {
    for (const values of index.values()) values.sort((left, right) => left.id.localeCompare(right.id))
}

export function validateKnowledgeGraph(dataset) {
    const errors = []
    const knowledgePoints = Array.isArray(dataset?.knowledgePoints) ? dataset.knowledgePoints : []
    const taxonomyNodes = Array.isArray(dataset?.taxonomyNodes) ? dataset.taxonomyNodes : []
    const prerequisites = Array.isArray(dataset?.prerequisites) ? dataset.prerequisites : []
    const taxonomyEdges = Array.isArray(dataset?.taxonomyEdges) ? dataset.taxonomyEdges : []
    const evidence = Array.isArray(dataset?.evidence) ? dataset.evidence : []

    for (const point of knowledgePoints) {
        if (!validateKnowledgePoint(point)) errors.push(...schemaError(`knowledgePoint ${point?.id || '(unknown)'}`, validateKnowledgePoint))
    }
    for (const node of taxonomyNodes) {
        if (!validateTaxonomyNode(node)) errors.push(...schemaError(`taxonomyNode ${node?.id || '(unknown)'}`, validateTaxonomyNode))
    }
    for (const edge of prerequisites) {
        if (!validatePrerequisite(edge)) errors.push(...schemaError(`prerequisite ${edge?.id || '(unknown)'}`, validatePrerequisite))
    }
    for (const edge of taxonomyEdges) {
        if (!validateTaxonomyEdge(edge)) errors.push(...schemaError(`taxonomyEdge ${edge?.id || '(unknown)'}`, validateTaxonomyEdge))
    }
    for (const item of evidence) {
        if (!validateEvidence(item)) errors.push(...schemaError(`evidence ${item?.id || '(unknown)'}`, validateEvidence))
    }

    const nodesById = new Map()
    for (const node of [...knowledgePoints, ...taxonomyNodes]) {
        if (nodesById.has(node.id)) errors.push(`duplicate node id: ${node.id}`)
        nodesById.set(node.id, node)
    }

    const edgeIds = new Set()
    for (const edge of [...prerequisites, ...taxonomyEdges]) {
        if (edgeIds.has(edge.id)) errors.push(`duplicate edge id: ${edge.id}`)
        edgeIds.add(edge.id)
    }

    const evidenceIds = new Set(evidence.map(item => item.id))
    for (const edge of prerequisites) {
        if (edge.source === edge.target) errors.push(`prerequisite self edge: ${edge.id}`)
        if (nodesById.get(edge.source)?.type !== 'knowledge_point') errors.push(`prerequisite ${edge.id} source must be knowledge_point`)
        if (nodesById.get(edge.target)?.type !== 'knowledge_point') errors.push(`prerequisite ${edge.id} target must be knowledge_point`)
        for (const evidenceRef of edge.evidenceRefs || []) {
            if (!evidenceIds.has(evidenceRef)) errors.push(`prerequisite ${edge.id} references missing evidence: ${evidenceRef}`)
        }
    }

    for (const edge of taxonomyEdges) {
        if (edge.source === edge.target) errors.push(`taxonomy self edge: ${edge.id}`)
        if (!nodesById.has(edge.source)) errors.push(`taxonomy ${edge.id} has unknown source: ${edge.source}`)
        if (!nodesById.has(edge.target)) errors.push(`taxonomy ${edge.id} has unknown target: ${edge.target}`)
    }

    const prerequisiteCycle = findCycle(prerequisites)
    if (prerequisiteCycle) errors.push(`prerequisite cycle: ${prerequisiteCycle.join(' -> ')}`)
    const taxonomyCycle = findCycle(taxonomyEdges)
    if (taxonomyCycle) errors.push(`taxonomy cycle: ${taxonomyCycle.join(' -> ')}`)

    const incomingByPoint = new Map()
    const outgoingByPoint = new Map()
    const taxonomyParentsByPoint = new Map()
    const taxonomyChildrenByNode = new Map()
    for (const edge of prerequisites) {
        addToIndex(incomingByPoint, edge.target, edge)
        addToIndex(outgoingByPoint, edge.source, edge)
    }
    for (const edge of taxonomyEdges) {
        addToIndex(taxonomyParentsByPoint, edge.target, edge)
        addToIndex(taxonomyChildrenByNode, edge.source, edge)
    }
    sortIndexedEdges(incomingByPoint)
    sortIndexedEdges(outgoingByPoint)
    sortIndexedEdges(taxonomyParentsByPoint)
    sortIndexedEdges(taxonomyChildrenByNode)

    const index = {
        nodesById,
        evidenceById: new Map(evidence.map(item => [item.id, item])),
        prerequisitesById: new Map(prerequisites.map(edge => [edge.id, edge])),
        taxonomyEdgesById: new Map(taxonomyEdges.map(edge => [edge.id, edge])),
        incomingByPoint: new Map([...incomingByPoint].map(([id, edges]) => [id, edges.map(edge => edge.id)])),
        outgoingByPoint: new Map([...outgoingByPoint].map(([id, edges]) => [id, edges.map(edge => edge.id)])),
        taxonomyParentsByPoint: new Map([...taxonomyParentsByPoint].map(([id, edges]) => [id, edges.map(edge => edge.source)])),
        taxonomyChildrenByNode: new Map([...taxonomyChildrenByNode].map(([id, edges]) => [id, edges.map(edge => edge.target)]))
    }

    return { valid: errors.length === 0, errors, index }
}
