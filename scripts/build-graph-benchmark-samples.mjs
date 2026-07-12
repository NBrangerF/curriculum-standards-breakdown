import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buildCurriculumGraphModel } from '../src/graph/adapters/curriculumGraphAdapter.js'
import { sampleGraphModel } from '../src/graph/sampleGraphModel.js'
import { expandGraphLoadFixture } from './lib/expand-graph-load-fixture.mjs'

const dataDirectory = resolve('public/data/by_subject')
const files = (await readdir(dataDirectory)).filter(file => file.endsWith('.json')).sort()
const standards = []

for (const filename of files) {
    const raw = JSON.parse(await readFile(resolve(dataDirectory, filename), 'utf8'))
    standards.push(...(raw.standards || []))
}

const graph = buildCurriculumGraphModel(standards)
const requestedSizes = [200, 500, 1000, 5000]
const samples = requestedSizes.map(requestedNodeCount => {
    const sample = requestedNodeCount > graph.nodes.length
        ? expandGraphLoadFixture(graph, requestedNodeCount)
        : sampleGraphModel(graph, requestedNodeCount)
    const canonical = JSON.stringify(sample)
    return {
        requestedNodeCount,
        actualNodeCount: sample.nodes.length,
        edgeCount: sample.edges.length,
        nodeTypeCounts: Object.fromEntries(
            [...new Set(sample.nodes.map(node => node.type))]
                .sort()
                .map(type => [type, sample.nodes.filter(node => node.type === type).length])
        ),
        relationCounts: Object.fromEntries(
            [...new Set(sample.edges.map(edge => edge.type))]
                .sort()
                .map(type => [type, sample.edges.filter(edge => edge.type === type).length])
        ),
        sha256: createHash('sha256').update(canonical).digest('hex')
    }
})

const report = {
    generatedAt: new Date().toISOString(),
    source: {
        standards: standards.length,
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        relationCounts: Object.fromEntries(
            [...new Set(graph.edges.map(edge => edge.type))]
                .sort()
                .map(type => [type, graph.edges.filter(edge => edge.type === type).length])
        )
    },
    samplingMethod: 'deterministic_entity_type_seeded_bfs',
    samples,
    limitations: graph.nodes.length < 5000
        ? [`The approved production graph contains ${graph.nodes.length} real nodes. The 5000-node renderer stress fixture deterministically clones approved topology and is benchmark-only; it is never exposed as curriculum data.`]
        : []
}

console.log(JSON.stringify(report, null, 2))
