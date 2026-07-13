import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { validateKnowledgeGraph } from './knowledgeGraphValidation.mjs'

const REVIEW_ROOT = 'docs/data/reviews/knowledge_graph'
const CANDIDATE_ROOT = 'generated/knowledge_graph_candidates'
const PUBLIC_ROOT = 'public/data/knowledge_graph'
const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const stable = value => JSON.stringify(value, null, 2) + '\n'
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, stable(value)) }
const exists = async path => stat(path).then(() => true).catch(() => false)
const codeFromCandidate = id => id.replace(/^candidate-node:/u, '')
const pointId = code => `kp:math:${code.toLowerCase()}`
const allowedNodeDecisions = new Set(['approve_node', 'merge_node', 'rename_node', 'reject_node'])
const allowedEdgeDecisions = new Set(['approve_required', 'approve_recommended', 'reject', 'dispute'])

function fail(message) { throw new Error(`Knowledge Graph build blocked: ${message}`) }

async function verifiedInputs() {
    const paths = {
        nodes: resolve(CANDIDATE_ROOT, 'math_geometry_nodes.json'),
        edges: resolve(CANDIDATE_ROOT, 'math_geometry_edges.json'),
        decisions: resolve(REVIEW_ROOT, 'math_geometry_review_decisions.json'),
        signoff: resolve(REVIEW_ROOT, 'math_geometry_signoff.md')
    }
    for (const [label, path] of Object.entries(paths)) if (!await exists(path)) fail(`missing ${label}: ${path}`)
    const nodesPayload = await readJson(paths.nodes)
    const edgesPayload = await readJson(paths.edges)
    const decisionsText = await readFile(paths.decisions, 'utf8')
    const decisions = JSON.parse(decisionsText)
    const signoff = await readFile(paths.signoff, 'utf8')
    const packetHash = sha256({ nodes: nodesPayload.nodes || [], edges: edgesPayload.edges || [] })
    const decisionHash = sha256(decisionsText)
    if (nodesPayload.packetSha256 !== packetHash || edgesPayload.packetSha256 !== packetHash) fail('candidate packet hash does not match candidate files')
    if (decisions.candidatePacketSha256 !== packetHash) fail('decision file does not reference the current candidate packet hash')
    for (const required of ['Reviewer role:', 'Review scope:', 'Decision file SHA-256:', 'Date:', 'Golden anchors:']) {
        if (!signoff.includes(required)) fail(`signoff is missing “${required}”`)
    }
    if (!signoff.includes(`Decision file SHA-256: ${decisionHash}`)) fail('signoff decision hash does not match the decision file')
    if (!decisions.reviewerRole || decisions.reviewerRole.includes('REPLACE_')) fail('decision file has no real reviewer role')
    if (!signoff.includes(`Reviewer role: ${decisions.reviewerRole}`)) fail('signoff reviewer role does not match the decision file')
    return { nodes: nodesPayload.nodes || [], edges: edgesPayload.edges || [], decisions, decisionHash, packetHash }
}

function buildDataset({ nodes: candidates, edges: edgeCandidates, decisions }) {
    const nodeCandidates = new Map(candidates.map(candidate => [candidate.candidateId, candidate]))
    const nodeDecisions = new Map((decisions.nodeDecisions || []).map(decision => [decision.candidateId, decision]))
    const approvedNodeDecisions = [...nodeDecisions.values()].filter(decision => ['approve_node', 'rename_node'].includes(decision.decision))
    for (const decision of nodeDecisions.values()) {
        if (!allowedNodeDecisions.has(decision.decision)) fail(`invalid node decision: ${decision.decision}`)
        if (!nodeCandidates.has(decision.candidateId)) fail(`node decision has unknown candidate: ${decision.candidateId}`)
    }
    const knowledgePoints = approvedNodeDecisions.map(decision => {
        const candidate = nodeCandidates.get(decision.candidateId)
        const code = codeFromCandidate(candidate.candidateId)
        if (!decision.dependencyCoverage?.incoming || !decision.dependencyCoverage?.outgoing) fail(`${candidate.candidateId} is missing reviewed dependency coverage`)
        return {
            id: pointId(code), type: 'knowledge_point', label: decision.label || candidate.suggestedName,
            subjectSlug: 'math', standardCodes: candidate.relatedStandardCodes,
            dependencyCoverage: decision.dependencyCoverage, reviewStatus: 'approved'
        }
    }).sort((left, right) => left.id.localeCompare(right.id))
    const pointByCandidate = new Map(approvedNodeDecisions.map(decision => [decision.candidateId, pointId(codeFromCandidate(decision.candidateId))]))
    const evidence = []
    const prerequisites = []
    const edgeCandidateById = new Map(edgeCandidates.map(candidate => [candidate.candidateId, candidate]))
    for (const decision of decisions.edgeDecisions || []) {
        if (!allowedEdgeDecisions.has(decision.decision)) fail(`invalid edge decision: ${decision.decision}`)
        const candidate = edgeCandidateById.get(decision.candidateId)
        if (!candidate) fail(`edge decision has unknown candidate: ${decision.candidateId}`)
        if (!['approve_required', 'approve_recommended'].includes(decision.decision)) continue
        const source = pointByCandidate.get(candidate.sourceCandidateId)
        const target = pointByCandidate.get(candidate.targetCandidateId)
        if (!source || !target) fail(`${decision.candidateId} approves an edge whose nodes are not approved`)
        if (!decision.rationale || !decision.evidence || !decision.reviewedAt) fail(`${decision.candidateId} is missing rationale, evidence, or review date`)
        const id = `pre:${source.slice(3)}:${target.slice(3)}`
        const evidenceId = `ev:${id.slice(4)}`
        evidence.push({ id: evidenceId, sourceType: 'curriculum_review', sourceId: decision.candidateId, locator: candidate.sourceLocation, statement: decision.evidence })
        prerequisites.push({
            id, source, target, type: 'prerequisite', directed: true,
            necessity: decision.decision === 'approve_required' ? 'required' : 'recommended',
            rationale: decision.rationale, evidenceRefs: [evidenceId], confidence: decision.confidence || 'medium',
            reviewStatus: 'approved', reviewedByRole: decisions.reviewerRole, reviewedAt: decision.reviewedAt, version: decisions.version || '1.0.0'
        })
    }
    const taxonomyNodes = [
        { id: 'topic:math', type: 'taxonomy_node', label: '数学', taxonomyId: 'math', subjectSlug: 'math', order: 1, reviewStatus: 'approved' },
        { id: 'topic:math:geometry', type: 'taxonomy_node', label: '图形与几何', taxonomyId: 'math', subjectSlug: 'math', order: 1, reviewStatus: 'approved' }
    ]
    const taxonomyEdges = [
        { id: 'tax:math:geometry', source: 'topic:math', target: 'topic:math:geometry', type: 'taxonomy_parent', taxonomyId: 'math', directed: true, order: 1, reviewStatus: 'approved' },
        ...knowledgePoints.map((point, index) => ({ id: `tax:geometry:${point.id.slice(3)}`, source: 'topic:math:geometry', target: point.id, type: 'taxonomy_parent', taxonomyId: 'math', directed: true, order: index + 1, reviewStatus: 'approved' }))
    ]
    return { knowledgePoints, taxonomyNodes, prerequisites, taxonomyEdges, evidence }
}

const inputs = await verifiedInputs()
const dataset = buildDataset(inputs)
const result = validateKnowledgeGraph(dataset)
if (!result.valid) fail(result.errors.join('; '))
const root = resolve(PUBLIC_ROOT)
await writeJson(resolve(root, 'nodes_by_subject/math.json'), { knowledgePoints: dataset.knowledgePoints })
await writeJson(resolve(root, 'taxonomy_nodes.json'), { taxonomyNodes: dataset.taxonomyNodes })
await writeJson(resolve(root, 'prerequisite_edges.json'), { prerequisites: dataset.prerequisites })
await writeJson(resolve(root, 'taxonomy_edges.json'), { taxonomyEdges: dataset.taxonomyEdges })
await writeJson(resolve(root, 'evidence.json'), { evidence: dataset.evidence })
const index = {
    byNode: Object.fromEntries(dataset.knowledgePoints.map(point => [point.id, { incoming: result.index.incomingByPoint.get(point.id) || [], outgoing: result.index.outgoingByPoint.get(point.id) || [] }])),
    byStandard: Object.fromEntries(dataset.knowledgePoints.flatMap(point => point.standardCodes.map(code => [code, point.id]))),
    taxonomyPaths: Object.fromEntries(dataset.knowledgePoints.map(point => [point.id, ['topic:math', 'topic:math:geometry', point.id]])),
    searchTerms: Object.fromEntries(dataset.knowledgePoints.map(point => [point.id, [point.label, ...point.standardCodes]]))
}
await writeJson(resolve(root, 'indexes/by_node.json'), index.byNode)
await writeJson(resolve(root, 'indexes/by_standard.json'), index.byStandard)
await writeJson(resolve(root, 'indexes/taxonomy_paths.json'), index.taxonomyPaths)
await writeJson(resolve(root, 'indexes/search_terms.json'), index.searchTerms)
await writeJson(resolve(root, 'manifest.json'), {
    version: inputs.decisions.version || '1.0.0', dataVersion: inputs.decisions.version || '1.0.0', candidatePacketSha256: inputs.packetHash,
    decisionFileSha256: inputs.decisionHash, files: {
        knowledgePoints: 'nodes_by_subject/math.json', taxonomyNodes: 'taxonomy_nodes.json', prerequisites: 'prerequisite_edges.json', taxonomyEdges: 'taxonomy_edges.json', evidence: 'evidence.json'
    }, counts: { knowledgePoints: dataset.knowledgePoints.length, prerequisites: dataset.prerequisites.length }
})
console.log(JSON.stringify({ status: 'built', knowledgePoints: dataset.knowledgePoints.length, prerequisites: dataset.prerequisites.length }, null, 2))
