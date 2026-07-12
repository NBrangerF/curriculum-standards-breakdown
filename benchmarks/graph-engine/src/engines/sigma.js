import Graph from 'graphology'
import Sigma from 'sigma'
import { afterPaint, NODE_COLORS } from '../benchmarkUtils.js'

export async function mountEngine(container, model) {
    const graph = new Graph({ type: 'mixed', multi: true, allowSelfLoops: false })

    for (const node of model.nodes) {
        const position = node.meta.benchmarkPosition
        graph.addNode(node.id, {
            x: position.x,
            y: position.y,
            size: node.type === 'subject' ? 8 : node.type === 'domain' ? 6 : 3.5,
            color: NODE_COLORS[node.type],
            label: node.meta.code || node.label
        })
    }

    for (const edge of model.edges) {
        const attributes = {
            color: edge.type === 'progression' ? '#69789a' : '#344055',
            size: edge.type === 'progression' ? 1.2 : 0.7
        }
        if (edge.directed) graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, attributes)
        else graph.addUndirectedEdgeWithKey(edge.id, edge.source, edge.target, attributes)
    }

    const renderer = new Sigma(graph, container, {
        allowInvalidContainer: false,
        labelDensity: 0.08,
        labelRenderedSizeThreshold: 9,
        renderEdgeLabels: false,
        defaultEdgeType: 'line'
    })
    await afterPaint()

    let selectedId = null
    return {
        async select(id) {
            if (selectedId && graph.hasNode(selectedId)) graph.setNodeAttribute(selectedId, 'highlighted', false)
            selectedId = id
            graph.setNodeAttribute(id, 'highlighted', true)
            renderer.refresh()
            await afterPaint()
        },
        panZoom(index, count) {
            const phase = (index / count) * Math.PI * 2
            renderer.getCamera().setState({
                x: 0.5 + Math.sin(phase) * 0.06,
                y: 0.5 + Math.cos(phase) * 0.04,
                ratio: 1 + Math.sin(phase) * 0.08
            })
        },
        destroy() {
            renderer.kill()
            graph.clear()
        }
    }
}
