import fs from 'node:fs'

const fixtureDirectory = new URL('../../fixtures/learning-map/', import.meta.url)

const loadFixture = fixtureName => JSON.parse(fs.readFileSync(
    new URL(`${fixtureName}.json`, fixtureDirectory),
    'utf8'
))

const clone = value => JSON.parse(JSON.stringify(value))

/**
 * Provide a test-only manifest whose request shape matches the production
 * loader. The fixture is never written under public/data/knowledge_graph.
 */
export async function installLearningMapFixtureRoutes(page, {
    fixture = 'diamond',
    standardCode,
    selectedPointId,
    transform
} = {}) {
    const dataset = clone(loadFixture(fixture))
    const pointId = selectedPointId || dataset.knowledgePoints[0]?.id
    if (standardCode && pointId) {
        const point = dataset.knowledgePoints.find(candidate => candidate.id === pointId)
        if (!point) throw new Error(`Learning Map fixture ${fixture} has no point ${pointId}`)
        point.standardCodes = [...new Set([...(point.standardCodes || []), standardCode])]
    }
    transform?.(dataset)

    const payloadByPath = {
        '/data/knowledge_graph/manifest.json': {
            version: `fixture:${fixture}`,
            files: {
                knowledgePoints: 'points.json',
                taxonomyNodes: 'taxonomy.json',
                prerequisites: 'prerequisites.json',
                taxonomyEdges: 'taxonomy-edges.json',
                evidence: 'evidence.json'
            }
        },
        '/data/knowledge_graph/points.json': { knowledgePoints: dataset.knowledgePoints },
        '/data/knowledge_graph/taxonomy.json': { taxonomyNodes: dataset.taxonomyNodes },
        '/data/knowledge_graph/prerequisites.json': { prerequisites: dataset.prerequisites },
        '/data/knowledge_graph/taxonomy-edges.json': { taxonomyEdges: dataset.taxonomyEdges },
        '/data/knowledge_graph/evidence.json': { evidence: dataset.evidence }
    }

    await page.route('**/data/knowledge_graph/**', route => {
        const pathname = new URL(route.request().url()).pathname
        const payload = payloadByPath[pathname]
        if (!payload) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) })
    })

    return dataset
}
