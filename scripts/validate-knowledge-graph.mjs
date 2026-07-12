import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validateKnowledgeGraph } from './knowledgeGraphValidation.mjs'

const fixtureDirectory = resolve('tests/fixtures/learning-map')
const loadFixture = async name => JSON.parse(await readFile(resolve(fixtureDirectory, name), 'utf8'))

const validFixtures = ['chain.json', 'diamond.json', 'multi-parent.json', 'empty-reviewed.json', 'empty-unreviewed.json']
for (const name of validFixtures) {
    const result = validateKnowledgeGraph(await loadFixture(name))
    assert.equal(result.valid, true, `${name}: ${result.errors.join('; ')}`)
}

const diamond = validateKnowledgeGraph(await loadFixture('diamond.json'))
assert.equal(diamond.valid, true)
assert.deepEqual(diamond.index.incomingByPoint.get('kp:d'), ['pre:b:d', 'pre:c:d'])
assert.deepEqual(diamond.index.outgoingByPoint.get('kp:a'), ['pre:a:b', 'pre:a:c'])

const multiParent = validateKnowledgeGraph(await loadFixture('multi-parent.json'))
assert.equal(multiParent.valid, true)
assert.deepEqual(multiParent.index.taxonomyParentsByPoint.get('kp:shared'), ['topic:math:geometry', 'topic:math:measurement'])

const cycle = validateKnowledgeGraph(await loadFixture('cycle.json'))
assert.equal(cycle.valid, false)
assert.match(cycle.errors.join('\n'), /prerequisite cycle: kp:a -> kp:b -> kp:c -> kp:a/)

console.log(JSON.stringify({
    status: 'passed',
    fixtures: validFixtures,
    cycleRejected: true
}, null, 2))
