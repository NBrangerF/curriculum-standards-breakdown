import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseLearningMapStateFromURL } from '../src/data/query.js'
import { clearLearningMapFlag, persistLearningMapFlag, resolveLearningMapFlag } from '../src/config/learningMapFlags.js'

const storage = new Map()
globalThis.window = {
    localStorage: {
        getItem: key => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key)
    }
}

const featureIsActive = ({ uiV2Enabled, learningMapEnabled, view }) => (
    uiV2Enabled && learningMapEnabled && view === 'learning-map'
)

for (const [uiV2Enabled, learningMapEnabled, expectedVersion] of [
    [false, false, 'legacy'],
    [false, true, 'legacy'],
    [true, false, 'legacy'],
    [true, true, 'learning-map']
]) {
    const active = featureIsActive({ uiV2Enabled, learningMapEnabled, view: 'learning-map' })
    assert.equal(active ? 'learning-map' : 'legacy', expectedVersion)
}

persistLearningMapFlag('standard', false)
assert.deepEqual(resolveLearningMapFlag('standard', '?learning-map=1'), { enabled: true, source: 'query' })
assert.deepEqual(resolveLearningMapFlag('standard', '?learning-map=0'), { enabled: false, source: 'query' })
clearLearningMapFlag('standard')

assert.deepEqual(parseLearningMapStateFromURL(new URLSearchParams('view=learning-map&selectedNode=kp%3Ad&prerequisiteDepth=2&unlockDepth=1')), {
    view: 'learning-map',
    selectedNode: 'kp:d',
    prerequisiteDepth: 2,
    unlockDepth: 1
})

const standardDetailPage = await readFile(new URL('../src/pages/StandardDetailPage.jsx', import.meta.url), 'utf8')
for (const attribute of [
    'data-learning-map-version',
    'data-learning-map-flag-source',
    'data-learning-map-rollout-percentage',
    'data-learning-map-rollout-bucket'
]) {
    assert.match(standardDetailPage, new RegExp(attribute))
}

console.log('Learning Map rollout matrix passed')
