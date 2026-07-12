import assert from 'node:assert/strict'
import { mergeLearningMapStateIntoURL, parseLearningMapStateFromURL } from '../src/data/query.js'
import { clearLearningMapFlag, persistLearningMapFlag, resolveLearningMapFlag } from '../src/config/learningMapFlags.js'

const storage = new Map()
globalThis.window = {
    localStorage: {
        getItem: key => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key)
    }
}

const merged = mergeLearningMapStateIntoURL(new URLSearchParams('utm_source=shared&future=1'), {
    view: 'learning-map',
    selectedNode: 'kp:math:geometry:spatial-concept',
    taxonomy: 'cn-curriculum-2022',
    contextPath: ['topic:math', 'topic:math:geometry', 'kp:math:geometry:spatial-concept'],
    prerequisiteDepth: 2,
    unlockDepth: 1,
    necessity: ['required', 'recommended']
})

assert.equal(merged.get('utm_source'), 'shared')
assert.equal(merged.get('future'), '1')
assert.deepEqual(parseLearningMapStateFromURL(merged), {
    view: 'learning-map',
    selectedNode: 'kp:math:geometry:spatial-concept',
    taxonomy: 'cn-curriculum-2022',
    contextPath: ['topic:math', 'topic:math:geometry', 'kp:math:geometry:spatial-concept'],
    prerequisiteDepth: 2,
    unlockDepth: 1,
    necessity: ['required', 'recommended']
})

persistLearningMapFlag('standard', false)
assert.deepEqual(resolveLearningMapFlag('standard', ''), { enabled: false, source: 'localStorage' })
assert.deepEqual(resolveLearningMapFlag('standard', '?learning-map=1'), { enabled: true, source: 'query' })
clearLearningMapFlag('standard')

console.log('Learning Map rollout contract passed')
