import { Graph } from '@antv/g6'
import { afterPaint, NODE_COLORS } from '../benchmarkUtils.js'

export async function mountEngine(container, model) {
    const data = {
        nodes: model.nodes.map(node => ({
            id: node.id,
            data: { type: node.type, label: node.meta.code || node.label },
            style: {
                x: node.meta.benchmarkPosition.x,
                y: node.meta.benchmarkPosition.y,
                size: node.type === 'subject' ? 18 : node.type === 'domain' ? 13 : 8,
                fill: NODE_COLORS[node.type],
                stroke: 'transparent',
                label: false
            }
        })),
        edges: model.edges.map(edge => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            data: { type: edge.type },
            style: {
                stroke: edge.type === 'progression' ? '#69789a' : '#344055',
                lineWidth: edge.type === 'progression' ? 1.2 : 0.7,
                opacity: 0.55,
                endArrow: edge.directed
            }
        }))
    }

    const graph = new Graph({
        container,
        data,
        autoFit: 'view',
        animation: false,
        behaviors: ['drag-canvas', 'zoom-canvas'],
        node: { style: { label: false } }
    })

    await graph.render()
    await afterPaint()

    return {
        async select(id) {
            await graph.setElementState(id, ['selected'], false)
            await afterPaint()
        },
        panZoom(index, count) {
            const phase = (index / count) * Math.PI * 2
            graph.zoomTo(1 + Math.sin(phase) * 0.08, false)
        },
        destroy() {
            graph.destroy()
        }
    }
}
