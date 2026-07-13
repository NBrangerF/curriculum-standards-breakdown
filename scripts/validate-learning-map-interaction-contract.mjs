import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { LearningMapController } from '../src/features/learning-map/LearningMapController.js'
import { getInspectorSelection } from '../src/graph/knowledge/knowledgeGraphBridge.js'

const fixture = JSON.parse(await readFile(resolve('tests/fixtures/learning-map/diamond.json'), 'utf8'))
const controller = new LearningMapController({ dataset: fixture, selectedNodeId: 'kp:d' })

let snapshot = controller.getSnapshot()
assert.equal(snapshot.selectedNodeId, 'kp:d')
assert.deepEqual(snapshot.context.prerequisites.required.map(point => point.id), ['kp:b'])
assert.deepEqual(snapshot.context.prerequisites.recommended.map(point => point.id), ['kp:c'])
assert.equal(snapshot.context.coverage.incoming, 'reviewed')

const relationshipInspector = getInspectorSelection(controller.index, 'pre:b:d')
assert.equal(relationshipInspector?.kind, 'relationship')
assert.equal(relationshipInspector?.source.label, 'B')
assert.equal(relationshipInspector?.target.label, 'D')
assert.equal(relationshipInspector?.edge.rationale, 'B before D')
assert.deepEqual(relationshipInspector?.evidence.map(item => item.id), ['ev:b-d'])
assert.equal(controller.selectRelationship('pre:b:d'), true)
snapshot = controller.getSnapshot()
assert.equal(snapshot.inspectorSelection?.kind, 'relationship')
assert.equal(snapshot.inspectorSelection?.edge.id, 'pre:b:d')
assert.equal(controller.selectRelationship('pre:a:b'), false)

assert.equal(controller.selectNode('kp:b'), true)
snapshot = controller.getSnapshot()
assert.deepEqual(snapshot.context.prerequisites.required.map(point => point.id), ['kp:a'])
assert.deepEqual(snapshot.context.unlocks.required.map(point => point.id), ['kp:d'])
assert.equal(snapshot.context.unlocks.recommended.length, 0)

assert.equal(controller.selectNode('kp:a'), true)
snapshot = controller.getSnapshot()
assert.deepEqual(snapshot.context.unlocks.required.map(point => point.id), ['kp:b', 'kp:c'])
assert.equal(snapshot.context.unlocks.recommended.length, 0)

controller.setDepths({ prerequisiteDepth: 2, unlockDepth: 2 })
snapshot = controller.getSnapshot()
assert.equal(snapshot.options.prerequisiteDepth, 2)
assert.equal(snapshot.options.unlockDepth, 2)

assert.deepEqual(controller.search('B').map(result => result.point.id), ['kp:b'])
assert.deepEqual(controller.getTaxonomyColumns().map(column => column.items.map(item => item.id)), [['topic:math'], ['kp:a', 'kp:b', 'kp:c', 'kp:d']])

assert.equal(controller.selectRelationship('pre:a:b'), true)
snapshot = controller.getSnapshot()
assert.equal(snapshot.selectedRelationship?.id, 'pre:a:b')
assert.match(snapshot.announcement, /A/)

const multiParentFixture = JSON.parse(await readFile(resolve('tests/fixtures/learning-map/multi-parent.json'), 'utf8'))
const multiParentController = new LearningMapController({ dataset: multiParentFixture, selectedNodeId: 'kp:shared' })
const initialMultiParent = multiParentController.getSnapshot()
const alternatePath = initialMultiParent.context.taxonomy.alternativePaths[0].map(item => item.id)
assert.equal(multiParentController.switchContextPath(alternatePath), true)
assert.deepEqual(multiParentController.getSnapshot().context.taxonomy.activePath.map(item => item.id), alternatePath)
assert.deepEqual(multiParentController.getTaxonomyColumns(alternatePath).map(column => column.items.map(item => item.id)), [['topic:math:geometry', 'topic:math:measurement'], ['kp:shared']])

const siblingsFixture = JSON.parse(await readFile(resolve('tests/fixtures/learning-map/siblings.json'), 'utf8'))
const siblingsController = new LearningMapController({
    dataset: siblingsFixture,
    selectedNodeId: 'kp:triangle',
    options: { contextPath: ['topic:math', 'topic:math:plane-figures', 'kp:triangle'] }
})
assert.deepEqual(siblingsController.getTaxonomyColumns().map(column => column.items.map(item => item.id)), [
    ['topic:math'],
    ['topic:math:plane-figures'],
    ['kp:rectangle', 'kp:triangle']
])
assert.equal(siblingsController.selectNode('kp:rectangle', {
    contextPath: ['topic:math', 'topic:math:plane-figures', 'kp:rectangle']
}), true)
assert.deepEqual(siblingsController.getSnapshot().context.taxonomy.activePath.map(item => item.id), [
    'topic:math',
    'topic:math:plane-figures',
    'kp:rectangle'
])

const highDegreeFixture = JSON.parse(await readFile(resolve('tests/fixtures/learning-map/high-degree.json'), 'utf8'))
const highDegreeController = new LearningMapController({ dataset: highDegreeFixture, selectedNodeId: 'kp:high-degree-focus' })
const highDegreeTopology = highDegreeController.getSnapshot().topology
assert.equal(highDegreeTopology.visibleNodeCount, 40)
assert.equal(highDegreeTopology.hiddenNodeCount, 2)

console.log(JSON.stringify({
    status: 'passed',
    selectedNodeId: snapshot.selectedNodeId,
    announcement: snapshot.announcement
}, null, 2))
