import { createGraphIndex, getDirectRelations, getVisibleNodeIds } from './graphSelectors.js'

const clampDepth = value => Math.min(3, Math.max(1, Number.isInteger(value) ? value : 1))
const ENTITY_TYPE_LABELS = Object.freeze({
    subject: '学科',
    domain: '领域',
    standard: '标准',
    skill: '能力'
})

export class GraphA11yController {
    constructor({ model, selectedNodeId, relationTypes, focusDepth = 1 } = {}) {
        if (!model?.nodes?.length) throw new Error('GraphA11yController requires a non-empty GraphModel')

        this.index = createGraphIndex(model)
        this.listeners = new Set()
        this.state = {
            selectedNodeId: this.index.nodeById.has(selectedNodeId)
                ? selectedNodeId
                : (model.meta?.focusNodeId || model.nodes[0].id),
            relationTypes: [...new Set(relationTypes ?? model.edges.map(edge => edge.type))],
            focusDepth: clampDepth(focusDepth),
            highlightedNodeIds: [],
            highlightedEdgeIds: [],
            comparedNodeIds: []
        }
    }

    subscribe(listener) {
        this.listeners.add(listener)
        listener(this.getSnapshot())
        return () => this.listeners.delete(listener)
    }

    selectNode(nodeId) {
        if (!this.index.nodeById.has(nodeId) || nodeId === this.state.selectedNodeId) return false
        this.state = { ...this.state, selectedNodeId: nodeId }
        this.#emit()
        return true
    }

    setRelationTypes(relationTypes = []) {
        this.state = { ...this.state, relationTypes: [...new Set(relationTypes)] }
        this.#emit()
    }

    setFocusDepth(focusDepth) {
        this.state = { ...this.state, focusDepth: clampDepth(focusDepth) }
        this.#emit()
    }

    setHighlights({ nodeIds = [], edgeIds = [], comparedNodeIds = [] } = {}) {
        const nextState = {
            ...this.state,
            highlightedNodeIds: [...new Set(nodeIds)].filter(nodeId => this.index.nodeById.has(nodeId)),
            highlightedEdgeIds: [...new Set(edgeIds)],
            comparedNodeIds: [...new Set(comparedNodeIds)].filter(nodeId => this.index.nodeById.has(nodeId))
        }
        const unchanged = (
            nextState.highlightedNodeIds.join('|') === this.state.highlightedNodeIds.join('|') &&
            nextState.highlightedEdgeIds.join('|') === this.state.highlightedEdgeIds.join('|') &&
            nextState.comparedNodeIds.join('|') === this.state.comparedNodeIds.join('|')
        )
        if (unchanged) return
        this.state = nextState
        this.#emit()
    }

    move(command) {
        const relations = this.#relationsForCommand(command)
        if (relations.length === 0) return false

        if (command === 'previous' || command === 'next') {
            const currentIndex = relations.findIndex(item => item.node.id === this.state.selectedNodeId)
            const delta = command === 'next' ? 1 : -1
            const targetIndex = currentIndex === -1
                ? (command === 'next' ? 0 : relations.length - 1)
                : (currentIndex + delta + relations.length) % relations.length
            return this.selectNode(relations[targetIndex].node.id)
        }

        return this.selectNode(relations[0].node.id)
    }

    getSnapshot() {
        const selectedNode = this.index.nodeById.get(this.state.selectedNodeId)
        const relations = getDirectRelations(
            this.index,
            this.state.selectedNodeId,
            this.state.relationTypes
        )
        const relationCounts = relations.reduce((counts, relation) => {
            counts[relation.edge.type] = (counts[relation.edge.type] || 0) + 1
            return counts
        }, {})

        const focusVisibleNodeIds = getVisibleNodeIds(this.index, this.state.selectedNodeId, {
            relationTypes: this.state.relationTypes,
            depth: this.state.focusDepth
        })
        const visibleNodeIds = [...new Set([
            ...focusVisibleNodeIds,
            ...this.state.highlightedNodeIds,
            ...this.state.comparedNodeIds
        ])]

        return {
            ...this.state,
            selectedNode,
            relations,
            relationCounts,
            visibleNodeIds,
            announcement: `${selectedNode.label}，${ENTITY_TYPE_LABELS[selectedNode.type] || selectedNode.type}，${relations.length} 个直接关系`
        }
    }

    #relationsForCommand(command) {
        const selectedRelations = getDirectRelations(
            this.index,
            this.state.selectedNodeId,
            this.state.relationTypes
        )

        if (command === 'parent') {
            return selectedRelations.filter(item => item.direction === 'incoming')
        }
        if (command === 'child') {
            return selectedRelations.filter(item => item.direction === 'outgoing')
        }
        if (command === 'neighbor') return selectedRelations

        const visibleRelations = []
        for (const nodeId of this.getSnapshot().visibleNodeIds) {
            if (nodeId === this.state.selectedNodeId) continue
            visibleRelations.push({ node: this.index.nodeById.get(nodeId) })
        }
        return visibleRelations.sort((a, b) => a.node.label.localeCompare(b.node.label, 'zh-CN'))
    }

    #emit() {
        const snapshot = this.getSnapshot()
        this.listeners.forEach(listener => listener(snapshot))
    }
}
