import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { buildReviewCandidates } from './build-knowledge-graph-review-packet.mjs'
import { validateKnowledgeGraph } from './knowledgeGraphValidation.mjs'

const DATA_ROOT = resolve('public/data')
const PUBLIC_ROOT = resolve(DATA_ROOT, 'knowledge_graph')
const DOMAIN = '图形与几何'
const TAXONOMY_ID = 'math-geometry-public-preview'
const stable = value => JSON.stringify(value, null, 2) + '\n'
const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const writeJson = async (path, value) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, stable(value))
}
const pointId = code => `kp:math:${code.toLowerCase()}`
const compactId = value => sha256(String(value)).slice(0, 12)
const taxonomyNode = (id, label, order, reviewStatus = 'approved') => ({
    id,
    type: 'taxonomy_node',
    label,
    taxonomyId: TAXONOMY_ID,
    subjectSlug: 'math',
    order,
    reviewStatus
})
const taxonomyEdge = (id, source, target, order) => ({
    id,
    source,
    target,
    type: 'taxonomy_parent',
    taxonomyId: TAXONOMY_ID,
    directed: true,
    order,
    reviewStatus: 'approved'
})

const mathPayload = JSON.parse(await readFile(resolve(DATA_ROOT, 'by_subject/math.json'), 'utf8'))
const standards = (mathPayload.standards || mathPayload)
    .filter(record => record.domain === DOMAIN)
    .sort((left, right) => left.code.localeCompare(right.code, 'zh-Hans-CN'))
const standardByCode = new Map(standards.map(record => [record.code, record]))
const candidates = buildReviewCandidates(mathPayload)
const candidateById = new Map(candidates.nodes.map(candidate => [candidate.candidateId, candidate]))
const packetSha256 = sha256({ nodes: candidates.nodes, edges: candidates.edges })
const version = `preview-${packetSha256.slice(0, 12)}`

const knowledgePoints = candidates.nodes.map(candidate => {
    const code = candidate.relatedStandardCodes[0]
    const record = standardByCode.get(code)
    return {
        id: pointId(code),
        type: 'knowledge_point',
        label: candidate.suggestedName,
        summary: record?.standard || '',
        subjectSlug: 'math',
        domain: record?.domain || DOMAIN,
        gradeBands: record?.grade_band ? [record.grade_band] : [],
        standardCodes: [code],
        dependencyCoverage: { incoming: 'not_reviewed', outgoing: 'not_reviewed' },
        reviewStatus: 'candidate',
        provenance: {
            source: 'public/data/by_subject/math.json',
            sourceField: 'curriculum_standard_record',
            publicationStatus: 'public_preview'
        }
    }
})

const evidence = []
const prerequisites = candidates.edges.map(candidate => {
    const sourceCode = candidateById.get(candidate.sourceCandidateId)?.relatedStandardCodes?.[0]
    const targetCode = candidateById.get(candidate.targetCandidateId)?.relatedStandardCodes?.[0]
    const source = pointId(sourceCode)
    const target = pointId(targetCode)
    const id = `pre:${source.slice(3)}:${target.slice(3)}`
    const evidenceId = `ev:${id.slice(4)}`
    evidence.push({
        id: evidenceId,
        sourceType: 'curriculum_progression_candidate',
        sourceId: candidate.candidateId,
        locator: candidate.sourceLocation,
        statement: `${candidate.evidence}。该字段仅形成课程顺序候选线索，不代表课程专家确认的认知先修关系。`
    })
    return {
        id,
        source,
        target,
        type: 'prerequisite',
        directed: true,
        necessity: 'undetermined',
        rationale: '课程标准索引中的前后条目字段表明两项内容存在顺序关联；其认知先修方向和必要程度仍待课程专家验证。',
        evidenceRefs: [evidenceId],
        confidence: 'low',
        reviewStatus: 'candidate',
        version
    }
})

const taxonomyNodes = [
    taxonomyNode('topic:math', '数学', 1),
    taxonomyNode('topic:math:geometry', DOMAIN, 1)
]
const taxonomyEdges = [taxonomyEdge('tax:math:geometry', 'topic:math', 'topic:math:geometry', 1)]
const taxonomyNodeIds = new Set(taxonomyNodes.map(node => node.id))
const subdomainOrder = new Map()
const gradeOrderBySubdomain = new Map()

for (const [index, point] of knowledgePoints.entries()) {
    const record = standardByCode.get(point.standardCodes[0])
    const subdomain = record?.subdomain || '未分类'
    if (!subdomainOrder.has(subdomain)) subdomainOrder.set(subdomain, subdomainOrder.size + 1)
    const subdomainId = `topic:math:geometry:subdomain:${compactId(subdomain)}`
    if (!taxonomyNodeIds.has(subdomainId)) {
        taxonomyNodes.push(taxonomyNode(subdomainId, subdomain, subdomainOrder.get(subdomain)))
        taxonomyEdges.push(taxonomyEdge(`tax:geometry:subdomain:${compactId(subdomain)}`, 'topic:math:geometry', subdomainId, subdomainOrder.get(subdomain)))
        taxonomyNodeIds.add(subdomainId)
    }

    const gradeLabel = record?.grade_range ? `${record.grade_range}年级` : (record?.grade_band || '未标注学段')
    const gradeKey = `${subdomain}\u001f${record?.grade_band || gradeLabel}`
    if (!gradeOrderBySubdomain.has(gradeKey)) gradeOrderBySubdomain.set(gradeKey, gradeOrderBySubdomain.size + 1)
    const gradeId = `${subdomainId}:grade:${compactId(gradeKey)}`
    if (!taxonomyNodeIds.has(gradeId)) {
        taxonomyNodes.push(taxonomyNode(gradeId, gradeLabel, gradeOrderBySubdomain.get(gradeKey)))
        taxonomyEdges.push(taxonomyEdge(`tax:subdomain:grade:${compactId(gradeKey)}`, subdomainId, gradeId, gradeOrderBySubdomain.get(gradeKey)))
        taxonomyNodeIds.add(gradeId)
    }
    taxonomyEdges.push(taxonomyEdge(`tax:grade:point:${compactId(point.id)}`, gradeId, point.id, index + 1))
}

const dataset = {
    publicationStatus: 'public_preview',
    knowledgePoints,
    taxonomyNodes,
    prerequisites,
    taxonomyEdges,
    evidence
}
const validation = validateKnowledgeGraph(dataset)
if (!validation.valid) throw new Error(`Knowledge Graph preview build failed: ${validation.errors.join('; ')}`)

await writeJson(resolve(PUBLIC_ROOT, 'nodes_by_subject/math.json'), { knowledgePoints })
await writeJson(resolve(PUBLIC_ROOT, 'taxonomy_nodes.json'), { taxonomyNodes })
await writeJson(resolve(PUBLIC_ROOT, 'prerequisite_edges.json'), { prerequisites })
await writeJson(resolve(PUBLIC_ROOT, 'taxonomy_edges.json'), { taxonomyEdges })
await writeJson(resolve(PUBLIC_ROOT, 'evidence.json'), { evidence })
await writeJson(resolve(PUBLIC_ROOT, 'manifest.json'), {
    version,
    dataVersion: version,
    publicationStatus: 'public_preview',
    relationshipSemantics: 'curriculum_progression_candidate_not_verified_prerequisite',
    source: 'public/data/by_subject/math.json',
    candidatePacketSha256: packetSha256,
    notice: '公开预览：关系来自课程标准前后条目字段，尚未经过课程专家先修审核。',
    files: {
        knowledgePoints: 'nodes_by_subject/math.json',
        taxonomyNodes: 'taxonomy_nodes.json',
        prerequisites: 'prerequisite_edges.json',
        taxonomyEdges: 'taxonomy_edges.json',
        evidence: 'evidence.json'
    },
    counts: {
        knowledgePoints: knowledgePoints.length,
        prerequisites: prerequisites.length,
        taxonomyNodes: taxonomyNodes.length,
        taxonomyEdges: taxonomyEdges.length
    }
})

console.log(JSON.stringify({
    status: 'public_preview_built',
    version,
    packetSha256,
    knowledgePoints: knowledgePoints.length,
    candidateRelationships: prerequisites.length,
    taxonomyNodes: taxonomyNodes.length,
    writesPublicData: true,
    expertSignoffClaimed: false
}, null, 2))
