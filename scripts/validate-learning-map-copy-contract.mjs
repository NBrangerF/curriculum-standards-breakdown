import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const copyModule = await import('../src/features/learning-map/learningMapCopy.js')
const progressionSource = await readFile('src/features/graph/GraphProgressionPanel.jsx', 'utf8')
const graphModelSource = await readFile('src/graph/graphModel.js', 'utf8')
const curriculumAdapterSource = await readFile('src/graph/adapters/curriculumGraphAdapter.js', 'utf8')

assert.equal(copyModule.LEARNING_MAP_COPY.title, '学习脉络')
assert.equal(copyModule.LEARNING_MAP_COPY.subtitle, '先掌握什么 · 接下来解锁什么')
assert.equal(copyModule.LEARNING_MAP_COPY.unreviewedPrerequisites, '当前尚无经证实的先修关系。')
assert.equal(copyModule.LEARNING_MAP_COPY.unreviewedUnlocks, '当前尚无经证实的后续解锁。')
assert.match(progressionSource, /学段进阶/)
assert.match(graphModelSource, /PROGRESSION:\s*'progression'/)
assert.doesNotMatch(curriculumAdapterSource, /type:\s*['"]knowledge_point['"]/)

console.log('Learning Map copy contract passed')
