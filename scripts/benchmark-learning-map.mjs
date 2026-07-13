import { performance } from 'node:perf_hooks'
import { layoutLearningDag } from '../src/features/learning-map/layoutLearningDag.js'

const makePoints = (prefix, count) => Array.from({ length: count }, (_, index) => ({
    id: `kp:${prefix}-${String(index + 1).padStart(2, '0')}`,
    label: `${prefix} ${index + 1}`
}))

const context = {
    focus: { id: 'kp:focus', label: '当前知识点' },
    topology: {
        prerequisiteLayers: [makePoints('pre-near', 20), makePoints('pre-far', 20)],
        unlockLayers: [makePoints('unlock-near', 19)],
        edges: [
            ...Array.from({ length: 20 }, (_, index) => ({
                id: `pre:far-to-near-${index}`,
                source: `kp:pre-far-${String(index + 1).padStart(2, '0')}`,
                target: `kp:pre-near-${String(index + 1).padStart(2, '0')}`
            })),
            ...Array.from({ length: 20 }, (_, index) => ({
                id: `pre:near-to-focus-${index}`,
                source: `kp:pre-near-${String(index + 1).padStart(2, '0')}`,
                target: 'kp:focus'
            })),
            ...Array.from({ length: 19 }, (_, index) => ({
                id: `pre:focus-to-unlock-${index}`,
                source: 'kp:focus',
                target: `kp:unlock-near-${String(index + 1).padStart(2, '0')}`
            }))
        ]
    }
}

const durations = []
for (let iteration = 0; iteration < 50; iteration += 1) {
    const startedAt = performance.now()
    const result = layoutLearningDag(context)
    durations.push(performance.now() - startedAt)
    if (result.nodes.length !== 60) throw new Error(`Expected 60 nodes, received ${result.nodes.length}`)
}

durations.sort((left, right) => left - right)
const p95 = durations[Math.ceil(durations.length * 0.95) - 1]
const budgetMs = 100
console.log(`Learning Map local-DAG layout p95: ${p95.toFixed(2)}ms (budget: ${budgetMs}ms)`)
if (p95 > budgetMs) process.exitCode = 1
