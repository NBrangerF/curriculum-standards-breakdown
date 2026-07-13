import {
    buildTopologicalLayers,
    createKnowledgeGraphIndex,
    getLearningContext
} from '../../graph/knowledge/knowledgeGraphBridge.js'

const clampDepth = value => Math.max(1, Math.min(2, Number.isInteger(value) ? value : 1))
const nodeFor = (index, id) => index.knowledgePointsById.get(id) || index.taxonomyNodesById.get(id)

const descendantCount = (index, id, visited = new Set()) => {
    if (visited.has(id)) return 0
    const nextVisited = new Set(visited).add(id)
    const children = index.taxonomyChildrenByNode.get(id) || []
    return children.reduce((total, edge) => total + 1 + descendantCount(index, edge.target, nextVisited), 0)
}

export class LearningMapController {
    constructor({ dataset, selectedNodeId, options = {} }) {
        this.index = createKnowledgeGraphIndex(dataset)
        this.selectedNodeId = selectedNodeId || this.index.knowledgePointsById.keys().next().value
        if (!this.selectedNodeId || !this.index.knowledgePointsById.has(this.selectedNodeId)) {
            throw new Error('LearningMapController requires an approved knowledge point focus')
        }
        this.options = {
            prerequisiteDepth: clampDepth(options.prerequisiteDepth),
            unlockDepth: clampDepth(options.unlockDepth),
            contextPath: Array.isArray(options.contextPath) ? options.contextPath : [],
            necessity: Array.isArray(options.necessity) ? options.necessity : ['required', 'recommended'],
            maxVisibleNodes: Number.isInteger(options.maxVisibleNodes) ? Math.max(1, options.maxVisibleNodes) : 40
        }
        this.selectedRelationshipId = undefined
        this.listeners = new Set()
    }

    getSnapshot() {
        const context = getLearningContext(this.index, this.selectedNodeId, this.options)
        const selectedRelationship = this.selectedRelationshipId
            ? this.index.prerequisitesById.get(this.selectedRelationshipId)
            : undefined
        const topology = buildTopologicalLayers(this.index, this.selectedNodeId, this.options)
        const announcement = selectedRelationship
            ? `${context.focus.label} 与 ${this.index.knowledgePointsById.get(selectedRelationship.target)?.label || selectedRelationship.target} 的关系已选中。`
            : `${context.focus.label}：${context.prerequisites.total} 个直接前置项，${context.unlocks.total} 个直接解锁项。`

        return {
            selectedNodeId: this.selectedNodeId,
            selectedRelationship,
            context,
            topology,
            options: { ...this.options },
            announcement
        }
    }

    search(query, limit = 8) {
        const normalized = String(query || '').trim().toLocaleLowerCase('zh-Hans-CN')
        if (!normalized) return []
        return [...this.index.knowledgePointsById.values()]
            .filter(point => [point.label, ...point.standardCodes].some(value => value.toLocaleLowerCase('zh-Hans-CN').includes(normalized)))
            .map(point => ({
                point,
                taxonomyPath: this.index.taxonomyParentsByNode.get(point.id) ? this.getTaxonomyPathFor(point.id) : [point],
                relationshipCount: (this.index.incomingPrerequisitesByPoint.get(point.id) || []).length + (this.index.outgoingPrerequisitesByPoint.get(point.id) || []).length
            }))
            .sort((left, right) => left.point.label.localeCompare(right.point.label, 'zh-Hans-CN') || left.point.id.localeCompare(right.point.id))
            .slice(0, Math.max(1, limit))
    }

    getTaxonomyPathFor(pointId) {
        const context = getLearningContext(this.index, pointId)
        return context.taxonomy.activePath
    }

    getTaxonomyColumns(contextPath = this.getSnapshot().context.taxonomy.activePath.map(item => item.id)) {
        const roots = [...this.index.taxonomyNodesById.values()]
            .filter(node => !(this.index.taxonomyParentsByNode.get(node.id) || []).length)
            .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, 'zh-Hans-CN'))
        const columns = [{ id: 'taxonomy-root', items: roots }]
        for (let index = 0; index < contextPath.length; index += 1) {
            const parentId = contextPath[index]
            const children = (this.index.taxonomyChildrenByNode.get(parentId) || [])
                .map(edge => nodeFor(this.index, edge.target))
                .filter(Boolean)
                .sort((left, right) => (left.order || 0) - (right.order || 0) || left.label.localeCompare(right.label, 'zh-Hans-CN'))
            if (children.length) columns.push({ id: `taxonomy-${parentId}`, parentId, items: children })
        }
        return columns.map(column => ({
            ...column,
            items: column.items.map(item => ({ ...item, descendantCount: descendantCount(this.index, item.id) }))
        }))
    }

    subscribe(listener) {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    emit() {
        const snapshot = this.getSnapshot()
        this.listeners.forEach(listener => listener(snapshot))
    }

    selectNode(nodeId, { contextPath } = {}) {
        if (!this.index.knowledgePointsById.has(nodeId)) return false
        this.selectedNodeId = nodeId
        this.selectedRelationshipId = undefined
        if (Array.isArray(contextPath)) this.options.contextPath = contextPath
        this.emit()
        return true
    }

    setDepths({ prerequisiteDepth, unlockDepth }) {
        if (prerequisiteDepth !== undefined) this.options.prerequisiteDepth = clampDepth(prerequisiteDepth)
        if (unlockDepth !== undefined) this.options.unlockDepth = clampDepth(unlockDepth)
        this.emit()
    }

    selectRelationship(edgeId) {
        if (!this.index.prerequisitesById.has(edgeId)) return false
        this.selectedRelationshipId = edgeId
        this.emit()
        return true
    }

    switchContextPath(contextPath) {
        if (!Array.isArray(contextPath) || contextPath.at(-1) !== this.selectedNodeId) return false
        this.options.contextPath = contextPath
        this.emit()
        return true
    }
}
