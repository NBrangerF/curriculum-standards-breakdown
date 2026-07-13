import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_DATA_ROOT = 'public/data'
const DEFAULT_OUTPUT_ROOT = 'generated/knowledge_graph_candidates'
const DOMAIN = '图形与几何'

const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const stable = value => JSON.stringify(value, null, 2) + '\n'
const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`
const safeId = value => String(value).toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-').replaceAll(/^-|-$/gu, '')

function parseArgs(argv) {
    const args = { dataRoot: DEFAULT_DATA_ROOT, outputRoot: DEFAULT_OUTPUT_ROOT }
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--data-root') args.dataRoot = argv[++index]
        if (argv[index] === '--output-root') args.outputRoot = argv[++index]
    }
    return args
}

async function readJson(path) {
    return JSON.parse(await readFile(path, 'utf8'))
}

async function writeJson(path, value) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, stable(value))
}

export function buildReviewCandidates(mathPayload) {
    const standards = (mathPayload.standards || []).filter(record => record.domain === DOMAIN)
        .sort((left, right) => left.code.localeCompare(right.code, 'zh-Hans-CN'))
    const nodes = standards.map(record => ({
        candidateId: `candidate-node:${record.code}`,
        candidateType: 'knowledge_point',
        suggestedName: record.standard_title || record.standard,
        relatedStandardCodes: [record.code],
        sourceLocation: `${record.subject} / ${record.domain} / ${record.subdomain || '未分项'} / ${record.code}`,
        suggestedTaxonomyPath: ['topic:math', 'topic:math:geometry'],
        decision: 'pending_curriculum_review',
        rationale: '由课程标准条目生成的候选知识点；名称、粒度与学习范围需要课程专家审核。',
        evidence: `课程标准：${record.code}`,
        reviewerRole: '',
        reviewDate: ''
    }))
    const candidateByCode = new Map(nodes.map(node => [node.relatedStandardCodes[0], node]))
    const edgeByPair = new Map()
    for (const record of standards) {
        for (const [direction, relatedCode] of [['previous_code', record.previous_code], ['next_code', record.next_code]]) {
            if (!relatedCode || !candidateByCode.has(relatedCode)) continue
            const sourceCode = direction === 'previous_code' ? relatedCode : record.code
            const targetCode = direction === 'previous_code' ? record.code : relatedCode
            const key = `${sourceCode}->${targetCode}`
            if (edgeByPair.has(key)) continue
            edgeByPair.set(key, {
                candidateId: `candidate-edge:${safeId(sourceCode)}-to-${safeId(targetCode)}`,
                candidateType: 'prerequisite_edge',
                sourceCandidateId: candidateByCode.get(sourceCode).candidateId,
                targetCandidateId: candidateByCode.get(targetCode).candidateId,
                suggestedName: `${sourceCode} → ${targetCode}`,
                relatedStandardCodes: [sourceCode, targetCode],
                sourceLocation: `${sourceCode} ${direction} → ${targetCode}`,
                suggestedTaxonomyPath: ['topic:math', 'topic:math:geometry'],
                decision: 'pending_curriculum_review',
                rationale: '标准记录中的前后条目字段只提供审核线索，不构成先修结论。',
                evidence: `课程标准索引字段：${direction}`,
                reviewerRole: '',
                reviewDate: ''
            })
        }
    }
    return { nodes, edges: [...edgeByPair.values()].sort((left, right) => left.candidateId.localeCompare(right.candidateId)) }
}

export function reviewCsv(candidates) {
    const header = ['candidate_id', 'candidate_type', 'suggested_name', 'related_standards', 'source_locator', 'suggested_taxonomy_path', 'incoming_candidate', 'outgoing_candidate', 'decision', 'rationale', 'evidence', 'reviewer_role', 'review_date']
    const rows = [...candidates.nodes, ...candidates.edges].map(item => [
        item.candidateId,
        item.candidateType,
        item.suggestedName,
        item.relatedStandardCodes.join(' | '),
        item.sourceLocation,
        item.suggestedTaxonomyPath.join(' / '),
        item.sourceCandidateId || '',
        item.targetCandidateId || '',
        item.decision,
        item.rationale,
        item.evidence,
        item.reviewerRole,
        item.reviewDate
    ].map(csvCell).join(','))
    return `${header.join(',')}\n${rows.join('\n')}\n`
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const args = parseArgs(process.argv.slice(2))
    const dataRoot = resolve(args.dataRoot)
    const outputRoot = resolve(args.outputRoot)
    const math = await readJson(resolve(dataRoot, 'by_subject/math.json'))
    const candidates = buildReviewCandidates(math)
    const packetHash = sha256({ nodes: candidates.nodes, edges: candidates.edges })

    await writeJson(resolve(outputRoot, 'math_geometry_nodes.json'), {
        generatedAt: new Date().toISOString(), scope: 'math_geometry_candidate_only', packetSha256: packetHash, nodes: candidates.nodes
    })
    await writeJson(resolve(outputRoot, 'math_geometry_edges.json'), {
        generatedAt: new Date().toISOString(), scope: 'math_geometry_candidate_only', packetSha256: packetHash, edges: candidates.edges
    })
    await mkdir(outputRoot, { recursive: true })
    await writeFile(resolve(outputRoot, 'math_geometry_review_packet.csv'), reviewCsv(candidates))

    console.log(JSON.stringify({
        status: 'candidate_packet_written',
        outputRoot,
        packetSha256: packetHash,
        nodes: candidates.nodes.length,
        edgeCandidates: candidates.edges.length,
        approvedEdges: 0,
        writesPublicData: false
    }, null, 2))
}
