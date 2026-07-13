import assert from 'node:assert/strict'
import { findApprovedKnowledgePointsByStandard, loadKnowledgeGraph, resolveKnowledgeGraphFileURL } from '../src/data/knowledgeGraphLoader.js'

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

const payloadByURL = new Map([
    ['/learning-map-fixture/manifest.json', { files: { knowledgePoints: 'points.json', taxonomyNodes: 'taxonomy.json', prerequisites: 'prerequisites.json', taxonomyEdges: 'taxonomy-edges.json', evidence: 'evidence.json' } }],
    ['/learning-map-fixture/points.json', { knowledgePoints: [{ id: 'kp:unapproved', reviewStatus: 'candidate' }] }],
    ['/learning-map-fixture/taxonomy.json', { taxonomyNodes: [] }],
    ['/learning-map-fixture/prerequisites.json', { prerequisites: [] }],
    ['/learning-map-fixture/taxonomy-edges.json', { taxonomyEdges: [] }],
    ['/learning-map-fixture/evidence.json', { evidence: [] }]
])
const originalFetch = globalThis.fetch
globalThis.fetch = async url => ({ ok: true, json: async () => payloadByURL.get(url) })
await assert.rejects(
    () => loadKnowledgeGraph({ manifestUrl: '/learning-map-fixture/manifest.json' }),
    /contains non-publishable record: kp:unapproved/
)

payloadByURL.get('/learning-map-fixture/manifest.json').publicationStatus = 'public_preview'
await assert.rejects(
    () => loadKnowledgeGraph({ manifestUrl: '/learning-map-fixture/manifest.json' }),
    /public preview manifest has invalid relationship semantics/
)
payloadByURL.get('/learning-map-fixture/manifest.json').relationshipSemantics = 'curriculum_progression_candidate_not_verified_prerequisite'
const preview = await loadKnowledgeGraph({ manifestUrl: '/learning-map-fixture/manifest.json' })
assert.equal(preview.dataset.publicationStatus, 'public_preview')
assert.equal(preview.dataset.knowledgePoints[0].reviewStatus, 'candidate')
globalThis.fetch = originalFetch

console.log('Knowledge graph loader URL contract passed')
