import assert from 'node:assert/strict'
import { resolveKnowledgeGraphFileURL } from '../src/data/knowledgeGraphLoader.js'

assert.equal(
    resolveKnowledgeGraphFileURL('/data/knowledge_graph/manifest.json', 'nodes_by_subject/math.json'),
    '/data/knowledge_graph/nodes_by_subject/math.json'
)
assert.equal(
    resolveKnowledgeGraphFileURL('/data/knowledge_graph/manifest.json', '/data/knowledge_graph/evidence.json'),
    '/data/knowledge_graph/evidence.json'
)

console.log('Knowledge graph loader URL contract passed')
