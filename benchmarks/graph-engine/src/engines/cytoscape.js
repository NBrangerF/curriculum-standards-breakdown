import cytoscape from 'cytoscape'
import { afterPaint, NODE_COLORS } from '../benchmarkUtils.js'

export async function mountEngine(container, model) {
    const elements = [
        ...model.nodes.map(node => ({
            data: { id: node.id, label: node.meta.code || node.label, type: node.type },
            position: node.meta.benchmarkPosition
        })),
        ...model.edges.map(edge => ({
            data: { id: edge.id, source: edge.source, target: edge.target, type: edge.type }
        }))
    ]

    const cy = cytoscape({
        container,
        elements,
        layout: { name: 'preset', fit: true, padding: 30 },
        pixelRatio: 1,
        textureOnViewport: true,
        hideEdgesOnViewport: true,
        style: [
            {
                selector: 'node',
                style: {
                    'background-color': element => NODE_COLORS[element.data('type')],
                    width: 8,
                    height: 8,
                    label: '',
                    'border-width': 0
                }
            },
            {
                selector: 'node[type = "subject"]',
                style: { width: 18, height: 18 }
            },
            {
                selector: 'node:selected',
                style: { 'border-width': 3, 'border-color': '#4f63ff' }
            },
            {
                selector: 'edge',
                style: { width: 0.6, 'line-color': '#344055', opacity: 0.5, 'curve-style': 'straight' }
            },
            {
                selector: 'edge[type = "progression"]',
                style: { width: 1, 'line-color': '#69789a', 'target-arrow-shape': 'triangle', 'target-arrow-color': '#69789a' }
            }
        ]
    })

    await new Promise(resolve => cy.ready(resolve))
    await afterPaint()

    return {
        async select(id) {
            cy.elements(':selected').unselect()
            cy.getElementById(id).select()
            await afterPaint()
        },
        panZoom(index, count) {
            const phase = (index / count) * Math.PI * 2
            cy.zoom(1 + Math.sin(phase) * 0.08)
            cy.pan({ x: Math.sin(phase) * 18, y: Math.cos(phase) * 12 })
        },
        destroy() {
            cy.destroy()
        }
    }
}
