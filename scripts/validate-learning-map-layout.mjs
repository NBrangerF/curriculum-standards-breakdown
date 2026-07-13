import assert from 'node:assert/strict'
import { layoutLearningDag } from '../src/features/learning-map/layoutLearningDag.js'

const context = {
    focus: { id: 'kp:d', label: 'D' },
    topology: {
        prerequisiteLayers: [
            [{ id: 'kp:b', label: 'B' }, { id: 'kp:c', label: 'C' }],
            [{ id: 'kp:a', label: 'A' }]
        ],
        unlockLayers: [[{ id: 'kp:e', label: 'E' }]],
        edges: [
            { id: 'pre:a:b', source: 'kp:a', target: 'kp:b' },
            { id: 'pre:a:c', source: 'kp:a', target: 'kp:c' },
            { id: 'pre:b:d', source: 'kp:b', target: 'kp:d' },
            { id: 'pre:c:d', source: 'kp:c', target: 'kp:d' },
            { id: 'pre:d:e', source: 'kp:d', target: 'kp:e' }
        ]
    }
}

const first = layoutLearningDag(context)
const second = layoutLearningDag(context)
const nodeById = new Map(first.nodes.map(node => [node.id, node]))

assert.equal(first.nodes.length, 5)
assert.equal(first.edges.length, 5)
assert.ok(nodeById.get('kp:a').position.x < nodeById.get('kp:b').position.x)
assert.ok(nodeById.get('kp:b').position.x < nodeById.get('kp:d').position.x)
assert.ok(nodeById.get('kp:d').position.x < nodeById.get('kp:e').position.x)
assert.deepEqual(first.nodes, second.nodes)

console.log('Learning Map layout contract passed')
