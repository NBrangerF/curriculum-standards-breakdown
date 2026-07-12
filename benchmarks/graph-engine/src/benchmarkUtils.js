export const ENGINE_LABELS = {
    sigma: 'Sigma + Graphology',
    g6: 'AntV G6',
    cytoscape: 'Cytoscape.js',
    xyflow: 'XYFlow'
}
export const NODE_COLORS = {
    subject: '#8d9cff',
    domain: '#83a5c7',
    standard: '#dce4f2',
    skill: '#85b59a'
}

export const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))

export async function afterPaint() {
    await nextFrame()
    await nextFrame()
}

export async function measureFrameLoop(update, frameCount = 90) {
    const timestamps = []
    for (let index = 0; index < frameCount; index += 1) {
        await new Promise(resolve => {
            requestAnimationFrame(timestamp => {
                timestamps.push(timestamp)
                update(index, frameCount)
                resolve()
            })
        })
    }

    const deltas = timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index]).sort((a, b) => a - b)
    const medianDelta = deltas[Math.floor(deltas.length / 2)] || 0
    return {
        frameCount,
        medianFrameMs: Number(medianDelta.toFixed(2)),
        medianFps: medianDelta > 0 ? Number((1000 / medianDelta).toFixed(1)) : 0
    }
}
