import {
    buildTopologicalLayers,
    createKnowledgeGraphIndex,
    getLearningContext
} from '../../graph/knowledge/knowledgeGraphBridge.js'

const clampDepth = value => Math.max(1, Math.min(2, Number.isInteger(value) ? value : 1))

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
