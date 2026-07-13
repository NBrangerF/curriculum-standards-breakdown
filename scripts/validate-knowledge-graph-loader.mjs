import assert from 'node:assert/strict'
import { findApprovedKnowledgePointsByStandard, resolveKnowledgeGraphFileURL } from '../src/data/knowledgeGraphLoader.js'

assert.equal(
    resolveKnowledgeGraphFileURL('/data/knowledge_graph/manifest.json', 'nodes_by_subject/math.json'),
    '/data/knowledge_graph/nodes_by_subject/math.json'
)
assert.equal(
    resolveKnowledgeGraphFileURL('/data/knowledge_graph/manifest.json', '/data/knowledge_graph/evidence.json'),
    '/data/knowledge_graph/evidence.json'
)

const points = [
    { id: 'kp:math:geometry:spatial-concept', standardCodes: ['MA-D2-GE-003'], reviewStatus: 'approved' },
    { id: 'kp:math:geometry:candidate', standardCodes: ['MA-D2-GE-003'], reviewStatus: 'candidate' },
    { id: 'kp:math:geometry:other', standardCodes: ['MA-D2-GE-004'], reviewStatus: 'approved' }
]
assert.deepEqual(
    findApprovedKnowledgePointsByStandard(points, 'MA-D2-GE-003').map(point => point.id),
    ['kp:math:geometry:spatial-concept']
)

console.log('Knowledge graph loader URL contract passed')
