export async function loadEngine(engine) {
    if (engine === 'sigma') return import('./sigma.js')
    if (engine === 'g6') return import('./g6.js')
    if (engine === 'cytoscape') return import('./cytoscape.js')
    if (engine === 'xyflow') return import('./xyflow.jsx')
    throw new Error(`Unknown engine: ${engine}`)
}
