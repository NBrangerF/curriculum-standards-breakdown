import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { LearningMapController } from '../src/features/learning-map/LearningMapController.js'

const fixture = JSON.parse(await readFile(resolve('tests/fixtures/learning-map/diamond.json'), 'utf8'))
const controller = new LearningMapController({ dataset: fixture, selectedNodeId: 'kp:d' })

let snapshot = controller.getSnapshot()
assert.equal(snapshot.selectedNodeId, 'kp:d')
assert.deepEqual(snapshot.context.prerequisites.required.map(point => point.id), ['kp:b'])
assert.deepEqual(snapshot.context.prerequisites.recommended.map(point => point.id), ['kp:c'])
assert.equal(snapshot.context.coverage.incoming, 'reviewed')

assert.equal(controller.selectNode('kp:a'), true)
snapshot = controller.getSnapshot()
assert.deepEqual(snapshot.context.unlocks.required.map(point => point.id), ['kp:b', 'kp:c'])
assert.equal(snapshot.context.unlocks.recommended.length, 0)

controller.setDepths({ prerequisiteDepth: 2, unlockDepth: 2 })
snapshot = controller.getSnapshot()
assert.equal(snapshot.options.prerequisiteDepth, 2)
assert.equal(snapshot.options.unlockDepth, 2)

assert.equal(controller.selectRelationship('pre:a:b'), true)
snapshot = controller.getSnapshot()
assert.equal(snapshot.selectedRelationship?.id, 'pre:a:b')
assert.match(snapshot.announcement, /A/)

console.log(JSON.stringify({
    status: 'passed',
    selectedNodeId: snapshot.selectedNodeId,
    announcement: snapshot.announcement
}, null, 2))
