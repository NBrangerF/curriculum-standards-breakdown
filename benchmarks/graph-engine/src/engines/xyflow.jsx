import React from 'react'
import { createRoot } from 'react-dom/client'
import { Background, ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { afterPaint, NODE_COLORS } from '../benchmarkUtils.js'

const toFlowNodes = (model, selectedId) => model.nodes.map(node => ({
    id: node.id,
    position: node.meta.benchmarkPosition,
    data: { label: node.meta.code || node.label },
    selected: node.id === selectedId,
    style: {
        width: node.type === 'standard' ? 18 : 24,
        height: node.type === 'standard' ? 18 : 24,
        minWidth: 0,
        padding: 0,
        border: node.id === selectedId ? '3px solid #4f63ff' : '1px solid #526078',
        borderRadius: 3,
        background: NODE_COLORS[node.type],
        color: 'transparent',
        fontSize: 0
    }
}))

const toFlowEdges = model => model.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    style: {
        stroke: edge.type === 'progression' ? '#69789a' : '#344055',
        strokeWidth: edge.type === 'progression' ? 1.2 : 0.7,
        opacity: 0.55
    }
}))

export async function mountEngine(container, model) {
    const root = createRoot(container)
    const edges = toFlowEdges(model)
    let instance
    let selectedId = null

    const render = () => root.render(
        React.createElement(
            ReactFlow,
            {
                nodes: toFlowNodes(model, selectedId),
                edges,
                fitView: true,
                minZoom: 0.05,
                maxZoom: 4,
                nodesDraggable: false,
                nodesConnectable: false,
                elementsSelectable: true,
                onInit: value => { instance = value },
                proOptions: { hideAttribution: true }
            },
            React.createElement(Background, { color: '#263044', gap: 28, size: 1 })
        )
    )

    render()
    for (let attempt = 0; attempt < 20 && !instance; attempt += 1) await afterPaint()
    await afterPaint()

    return {
        async select(id) {
            selectedId = id
            render()
            await afterPaint()
        },
        panZoom(index, count) {
            const phase = (index / count) * Math.PI * 2
            instance?.setViewport({ x: Math.sin(phase) * 18, y: Math.cos(phase) * 12, zoom: 1 + Math.sin(phase) * 0.08 }, { duration: 0 })
        },
        destroy() {
            root.unmount()
        }
    }
}
