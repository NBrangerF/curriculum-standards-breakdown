import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validateKnowledgeGraph } from './knowledgeGraphValidation.mjs'

const readJson = async path => JSON.parse(await readFile(path, 'utf8'))

async function auditDataset(dataset) {
    const validation = validateKnowledgeGraph(dataset)
    const coverage = dataset.knowledgePoints.reduce((summary, point) => {
        summary.incoming[point.dependencyCoverage.incoming] = (summary.incoming[point.dependencyCoverage.incoming] || 0) + 1
        summary.outgoing[point.dependencyCoverage.outgoing] = (summary.outgoing[point.dependencyCoverage.outgoing] || 0) + 1
        return summary
    }, { incoming: {}, outgoing: {} })
    return { valid: validation.valid, errors: validation.errors, knowledgePoints: dataset.knowledgePoints.length, prerequisites: dataset.prerequisites.length, coverage }
}

if (process.argv.includes('--fixtures')) {
    const names = ['chain.json', 'diamond.json', 'multi-parent.json', 'siblings.json', 'empty-reviewed.json', 'empty-unreviewed.json', 'high-degree.json']
    const audits = await Promise.all(names.map(async name => ({ name, ...(await auditDataset(await readJson(resolve('tests/fixtures/learning-map', name)))) })))
    if (audits.some(audit => !audit.valid)) throw new Error(audits.flatMap(audit => audit.errors).join('; '))
    console.log(JSON.stringify({ status: 'fixtures_audited', audits }, null, 2))
} else {
    const root = resolve('public/data/knowledge_graph')
    const manifest = await readJson(resolve(root, 'manifest.json'))
    if (Array.isArray(manifest.subjects)) {
        const subjects = await Promise.all(manifest.subjects.map(async subject => {
            const files = subject.files || {}
            const [points, taxonomy, prerequisites, evidence] = await Promise.all([
                readJson(resolve(root, files.knowledgePoints)),
                readJson(resolve(root, files.taxonomy)),
                readJson(resolve(root, files.prerequisites)),
                readJson(resolve(root, files.evidence))
            ])
            return {
                subject: subject.subject,
                subjectSlug: subject.subjectSlug,
                ...(await auditDataset({
                    publicationStatus: manifest.publicationStatus,
                    knowledgePoints: points.knowledgePoints || points,
                    taxonomyNodes: taxonomy.taxonomyNodes || [],
                    prerequisites: prerequisites.prerequisites || prerequisites,
                    taxonomyEdges: taxonomy.taxonomyEdges || [],
                    evidence: evidence.evidence || evidence
                }))
            }
        }))
        const valid = subjects.every(subject => subject.valid)
        console.log(JSON.stringify({
            status: valid ? 'global_preview_audited' : 'failed',
            version: manifest.version,
            subjectCount: subjects.length,
            totals: {
                knowledgePoints: subjects.reduce((sum, subject) => sum + subject.knowledgePoints, 0),
                prerequisites: subjects.reduce((sum, subject) => sum + subject.prerequisites, 0)
            },
            subjects
        }, null, 2))
        if (!valid) process.exitCode = 1
    } else {
        const files = manifest.files || {}
        const [points, taxonomyNodes, prerequisites, taxonomyEdges, evidence] = await Promise.all([
            readJson(resolve(root, files.knowledgePoints)), readJson(resolve(root, files.taxonomyNodes)), readJson(resolve(root, files.prerequisites)), readJson(resolve(root, files.taxonomyEdges)), readJson(resolve(root, files.evidence))
        ])
        const audit = await auditDataset({ knowledgePoints: points.knowledgePoints || points, taxonomyNodes: taxonomyNodes.taxonomyNodes || taxonomyNodes, prerequisites: prerequisites.prerequisites || prerequisites, taxonomyEdges: taxonomyEdges.taxonomyEdges || taxonomyEdges, evidence: evidence.evidence || evidence })
        console.log(JSON.stringify({ status: audit.valid ? 'audited' : 'failed', ...audit }, null, 2))
        if (!audit.valid) process.exitCode = 1
    }
}
