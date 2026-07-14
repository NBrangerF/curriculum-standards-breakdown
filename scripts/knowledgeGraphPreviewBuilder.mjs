import { createHash } from 'node:crypto'

export const PUBLIC_PREVIEW_RELATIONSHIP_SEMANTICS = 'curriculum_progression_candidate_not_verified_prerequisite'

const stableHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const compactId = value => stableHash(String(value)).slice(0, 12)
const pointId = (subjectSlug, code) => `kp:${subjectSlug}:${String(code).toLowerCase()}`
const taxonomyId = subjectSlug => `${subjectSlug}-public-preview`

export function splitRelationCodes(value) {
    const values = Array.isArray(value) ? value.flat(Infinity) : [value]
    return [...new Set(values
        .flatMap(item => String(item || '').split(/[\n|]/u))
        .map(item => item.trim())
        .filter(Boolean))]
}

const createTaxonomyNode = (subjectSlug, id, label, order) => ({
    id,
    type: 'taxonomy_node',
    label,
    taxonomyId: taxonomyId(subjectSlug),
    subjectSlug,
    order,
    reviewStatus: 'approved'
})

const createTaxonomyEdge = (subjectSlug, source, target, order) => ({
    id: `tax:${subjectSlug}:${compactId(`${source}->${target}`)}`,
    source,
    target,
    type: 'taxonomy_parent',
    taxonomyId: taxonomyId(subjectSlug),
    directed: true,
    order,
    reviewStatus: 'approved'
})

function buildSubjectPreviewData(entry, globalCodeOwners, version) {
    const { subject, subjectSlug, sourceFile } = entry
    const records = [...entry.records].sort((left, right) => left.code.localeCompare(right.code, 'zh-Hans-CN'))
    const localCodes = new Set(records.map(record => record.code))
    const knowledgePoints = records.map(record => ({
        id: pointId(subjectSlug, record.code),
        type: 'knowledge_point',
        label: record.standard_title || record.standard || record.code,
        summary: record.standard || '',
        subjectSlug,
        domain: record.domain || '未分类领域',
        gradeBands: record.grade_band ? [record.grade_band] : [],
        standardCodes: [record.code],
        dependencyCoverage: { incoming: 'not_reviewed', outgoing: 'not_reviewed' },
        reviewStatus: 'candidate',
        provenance: {
            source: `public/data/${sourceFile}`,
            sourceField: 'curriculum_standard_record',
            publicationStatus: 'public_preview'
        }
    }))

    const taxonomyNodes = []
    const taxonomyEdges = []
    const taxonomyNodeIds = new Set()
    const ensureTaxonomyNode = (id, label, order) => {
        if (taxonomyNodeIds.has(id)) return
        taxonomyNodes.push(createTaxonomyNode(subjectSlug, id, label, order))
        taxonomyNodeIds.add(id)
    }
    const subjectId = `topic:${subjectSlug}`
    ensureTaxonomyNode(subjectId, subject, 1)
    const domainOrder = new Map()
    const subdomainOrder = new Map()
    const gradeOrder = new Map()

    for (const [index, record] of records.entries()) {
        const domain = record.domain || '未分类领域'
        if (!domainOrder.has(domain)) domainOrder.set(domain, domainOrder.size + 1)
        const domainId = `${subjectId}:domain:${compactId(domain)}`
        if (!taxonomyNodeIds.has(domainId)) {
            ensureTaxonomyNode(domainId, domain, domainOrder.get(domain))
            taxonomyEdges.push(createTaxonomyEdge(subjectSlug, subjectId, domainId, domainOrder.get(domain)))
        }

        const subdomain = record.subdomain || record.display_subcategory || '未分项'
        const subdomainKey = `${domain}\u001f${subdomain}`
        if (!subdomainOrder.has(subdomainKey)) subdomainOrder.set(subdomainKey, subdomainOrder.size + 1)
        const subdomainId = `${domainId}:subdomain:${compactId(subdomainKey)}`
        if (!taxonomyNodeIds.has(subdomainId)) {
            ensureTaxonomyNode(subdomainId, subdomain, subdomainOrder.get(subdomainKey))
            taxonomyEdges.push(createTaxonomyEdge(subjectSlug, domainId, subdomainId, subdomainOrder.get(subdomainKey)))
        }

        const gradeLabel = record.grade_range ? `${record.grade_range}年级` : (record.grade_band || '未标注学段')
        const gradeKey = `${subdomainKey}\u001f${record.grade_band || ''}\u001f${gradeLabel}`
        if (!gradeOrder.has(gradeKey)) gradeOrder.set(gradeKey, gradeOrder.size + 1)
        const gradeId = `${subdomainId}:grade:${compactId(gradeKey)}`
        if (!taxonomyNodeIds.has(gradeId)) {
            ensureTaxonomyNode(gradeId, gradeLabel, gradeOrder.get(gradeKey))
            taxonomyEdges.push(createTaxonomyEdge(subjectSlug, subdomainId, gradeId, gradeOrder.get(gradeKey)))
        }
        taxonomyEdges.push(createTaxonomyEdge(subjectSlug, gradeId, pointId(subjectSlug, record.code), index + 1))
    }

    const unresolvedReferences = []
    const crossSubjectReferences = []
    const relationshipCandidates = new Map()
    const addRelationship = ({ sourceCode, targetCode, recordCode, field, relatedCode, relation }) => {
        const owner = globalCodeOwners.get(relatedCode)
        if (!owner) {
            unresolvedReferences.push({ subjectSlug, recordCode, field, relatedCode })
            return
        }
        if (owner !== subjectSlug || !localCodes.has(sourceCode) || !localCodes.has(targetCode)) {
            crossSubjectReferences.push({ subjectSlug, recordCode, field, relatedCode, relatedSubjectSlug: owner })
            return
        }
        if (sourceCode === targetCode) return
        const relationType = relation?.relation_type || 'curriculum_sequence_candidate'
        const key = `${relationType}:${sourceCode}->${targetCode}`
        const candidate = relationshipCandidates.get(key) || { sourceCode, targetCode, relationType, sources: [], relation }
        candidate.sources.push({ recordCode, field, relatedCode, evidence: relation?.evidence || [] })
        relationshipCandidates.set(key, candidate)
    }

    for (const record of records) {
        if (Array.isArray(record.relations)) {
            for (const relation of record.relations.filter(item => item.direction === 'next' && item.source_code === record.code)) {
                addRelationship({
                    sourceCode: relation.source_code,
                    targetCode: relation.target_code,
                    recordCode: record.code,
                    field: relation.relation_type,
                    relatedCode: relation.target_code,
                    relation
                })
            }
        } else {
            for (const relatedCode of splitRelationCodes(record.previous_code)) {
                addRelationship({ sourceCode: relatedCode, targetCode: record.code, recordCode: record.code, field: 'previous_code', relatedCode })
            }
            for (const relatedCode of splitRelationCodes(record.next_code)) {
                addRelationship({ sourceCode: record.code, targetCode: relatedCode, recordCode: record.code, field: 'next_code', relatedCode })
            }
        }
    }

    const evidence = []
    const prerequisites = [...relationshipCandidates.values()]
        .sort((left, right) => `${left.sourceCode}->${left.targetCode}`.localeCompare(`${right.sourceCode}->${right.targetCode}`))
        .map(candidate => {
            const source = pointId(subjectSlug, candidate.sourceCode)
            const target = pointId(subjectSlug, candidate.targetCode)
            const relationToken = candidate.relationType === 'grade_band_bridge_candidate' ? 'bridge' : 'sequence'
            const id = `pre:${subjectSlug}:${relationToken}:${candidate.sourceCode.toLowerCase()}:${candidate.targetCode.toLowerCase()}`
            const evidenceId = `ev:${subjectSlug}:${relationToken}:${candidate.sourceCode.toLowerCase()}:${candidate.targetCode.toLowerCase()}`
            const sourceFields = [...new Set(candidate.sources.map(sourceItem => `${sourceItem.recordCode}.${sourceItem.field}`))]
            const confidenceScore = Number(candidate.relation?.confidence ?? 0.5)
            const confidence = confidenceScore >= 0.8 ? 'high' : confidenceScore >= 0.6 ? 'medium' : 'low'
            const isBridge = candidate.relationType === 'grade_band_bridge_candidate'
            evidence.push({
                id: evidenceId,
                sourceType: isBridge ? 'grade_band_bridge_candidate' : 'curriculum_progression_candidate',
                sourceId: `${relationToken}-candidate:${candidate.sourceCode}->${candidate.targetCode}`,
                locator: sourceFields.join(' | '),
                statement: isBridge
                    ? `规则生成 ${candidate.sourceCode} → ${candidate.targetCode} 的跨学段桥接候选；它未经过课程专家审核。`
                    : `课程标准索引字段形成 ${candidate.sourceCode} → ${candidate.targetCode} 的顺序候选线索；它不代表课程专家确认的认知先修关系。`
            })
            return {
                id,
                source,
                target,
                type: 'prerequisite',
                directed: true,
                necessity: 'undetermined',
                rationale: isBridge
                    ? '基于同学科、同领域、文本与技能重合度生成的跨学段桥接候选；不得作为确定先修关系。'
                    : '课程标准索引中的前后条目字段表明两项内容存在顺序关联；其认知先修方向和必要程度仍待课程专家验证。',
                evidenceRefs: [evidenceId],
                confidence,
                confidenceScore,
                relationType: candidate.relationType,
                method: candidate.relation?.method || 'legacy_sequence_fields',
                provenance: candidate.relation?.provenance || 'extracted',
                reviewStatus: 'candidate',
                version
            }
        })

    const dataset = {
        publicationStatus: 'public_preview',
        knowledgePoints,
        taxonomyNodes,
        prerequisites,
        taxonomyEdges,
        evidence
    }
    const quality = { unresolvedReferences, crossSubjectReferences }
    const manifestEntry = {
        subject,
        subjectSlug,
        sourceFile,
        files: {
            knowledgePoints: `nodes_by_subject/${subjectSlug}.json`,
            taxonomy: `taxonomy_by_subject/${subjectSlug}.json`,
            prerequisites: `prerequisite_edges_by_subject/${subjectSlug}.json`,
            evidence: `evidence_by_subject/${subjectSlug}.json`
        },
        counts: {
            knowledgePoints: knowledgePoints.length,
            candidateRelationships: prerequisites.length,
            taxonomyNodes: taxonomyNodes.length,
            taxonomyEdges: taxonomyEdges.length
        },
        quality: {
            unresolvedReferences: unresolvedReferences.length,
            crossSubjectReferences: crossSubjectReferences.length
        }
    }
    return { subject, subjectSlug, sourceFile, dataset, quality, manifestEntry }
}

export function buildGlobalPreviewData(subjectEntries) {
    const globalCodeOwners = new Map()
    for (const entry of subjectEntries) {
        for (const record of entry.records) {
            if (!record.code) throw new Error(`Knowledge Graph preview record has no code in ${entry.subjectSlug}`)
            if (globalCodeOwners.has(record.code)) throw new Error(`Knowledge Graph preview has duplicate code: ${record.code}`)
            globalCodeOwners.set(record.code, entry.subjectSlug)
        }
    }
    const inputFingerprint = subjectEntries.map(entry => ({
        subject: entry.subject,
        subjectSlug: entry.subjectSlug,
        sourceFile: entry.sourceFile,
        records: entry.records
    }))
    const version = `preview-global-${stableHash(inputFingerprint).slice(0, 12)}`
    const subjects = subjectEntries.map(entry => buildSubjectPreviewData(entry, globalCodeOwners, version))
    const counts = subjects.reduce((summary, subject) => {
        summary.knowledgePoints += subject.dataset.knowledgePoints.length
        summary.candidateRelationships += subject.dataset.prerequisites.length
        summary.taxonomyNodes += subject.dataset.taxonomyNodes.length
        summary.taxonomyEdges += subject.dataset.taxonomyEdges.length
        summary.unresolvedReferences += subject.quality.unresolvedReferences.length
        summary.crossSubjectReferences += subject.quality.crossSubjectReferences.length
        return summary
    }, {
        knowledgePoints: 0,
        candidateRelationships: 0,
        taxonomyNodes: 0,
        taxonomyEdges: 0,
        unresolvedReferences: 0,
        crossSubjectReferences: 0
    })
    return { version, relationshipSemantics: PUBLIC_PREVIEW_RELATIONSHIP_SEMANTICS, subjects, counts }
}
