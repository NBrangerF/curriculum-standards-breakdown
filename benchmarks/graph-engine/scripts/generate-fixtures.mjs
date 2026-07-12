import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCurriculumGraphModel } from '../../../src/graph/adapters/curriculumGraphAdapter.js'
import { sampleGraphModel } from '../../../src/graph/sampleGraphModel.js'
import { expandGraphLoadFixture } from '../../../scripts/lib/expand-graph-load-fixture.mjs'

const benchmarkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(benchmarkRoot, '../..')
const dataDirectory = resolve(repositoryRoot, 'public/data/by_subject')
const outputDirectory = resolve(benchmarkRoot, 'public/fixtures')
const files = (await readdir(dataDirectory)).filter(file => file.endsWith('.json')).sort()
const standards = []

for (const filename of files) {
    const raw = JSON.parse(await readFile(resolve(dataDirectory, filename), 'utf8'))
    standards.push(...(raw.standards || []))
}

const hashNumber = value => {
    const digest = createHash('sha256').update(value).digest()
    return digest.readUInt32BE(0)
}

const typeLane = {
    subject: 0,
    domain: 360,
    standard: 720,
    skill: 1080
}

const addBenchmarkPosition = (node, index) => ({
    ...node,
    meta: {
        ...node.meta,
        benchmarkPosition: {
            x: (typeLane[node.type] ?? 720) + (hashNumber(`${node.id}:x`) % 240),
            y: (hashNumber(`${node.id}:y`) % 1800) + (index % 7) * 4
        }
    }
})

const graph = buildCurriculumGraphModel(standards)
const sizes = [200, 500, 1000, 5000]
const manifest = {
    generatedAt: new Date().toISOString(),
    method: 'deterministic_entity_type_seeded_bfs_with_type_lanes_and_approved_topology_clones_for_stress_only',
    source: { nodes: graph.nodes.length, edges: graph.edges.length },
    fixtures: []
}

await mkdir(outputDirectory, { recursive: true })

for (const requestedNodeCount of sizes) {
    const sample = requestedNodeCount > graph.nodes.length
        ? expandGraphLoadFixture(graph, requestedNodeCount)
        : sampleGraphModel(graph, requestedNodeCount)
    const positioned = {
        ...sample,
        nodes: sample.nodes.map(addBenchmarkPosition)
    }
    const serialized = JSON.stringify(positioned)
    const filename = `sample-${requestedNodeCount}.json`
    await writeFile(resolve(outputDirectory, filename), serialized)
    manifest.fixtures.push({
        requestedNodeCount,
        actualNodeCount: positioned.nodes.length,
        edgeCount: positioned.edges.length,
        syntheticCloneNodeCount: positioned.nodes.filter(node => node.meta.syntheticLoadTestClone).length,
        filename,
        bytes: Buffer.byteLength(serialized),
        sha256: createHash('sha256').update(serialized).digest('hex')
    })
}

await writeFile(resolve(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify(manifest, null, 2))
