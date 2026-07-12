import {
    createGraphModel,
    GRAPH_ENTITY_TYPES,
    GRAPH_RELATION_TYPES
} from '../graphModel.js'

const GRADE_ORDER = new Map([
    ['H1', 1],
    ['H2', 2],
    ['H3', 3],
    ['H4G7', 4],
    ['H4G8', 5],
    ['H4G9', 6]
])

const encodeIdPart = value => encodeURIComponent(String(value || '').trim().toLowerCase())
const subjectNodeId = slug => `subject:${encodeIdPart(slug)}`
const domainNodeId = (slug, domain) => `domain:${encodeIdPart(slug)}:${encodeIdPart(domain)}`
const standardNodeId = code => `standard:${encodeIdPart(code)}`
const skillNodeId = code => `skill:${encodeIdPart(code)}`

export function buildExplicitProgressionEdges(standards) {
    const groups = new Map()
    const edgeById = new Map()
    const diagnostics = {
        records: 0,
        groups: 0,
        acceptedExplicitEdges: 0,
        selfHintsRejected: 0,
        backwardHintsRejected: 0,
        missingOrAmbiguousTargets: 0,
        groupsWithCompleteConsecutiveChain: 0
    }

    for (const standard of standards) {
        if (!standard.progression_group_id) continue
        diagnostics.records += 1
        const group = groups.get(standard.progression_group_id) || []
        group.push(standard)
        groups.set(standard.progression_group_id, group)
    }

    diagnostics.groups = groups.size

    for (const [groupId, group] of groups) {
        const byBand = new Map()
        const groupEdgeIds = new Set()

        for (const standard of group) {
            const bandRecords = byBand.get(standard.grade_band) || []
            bandRecords.push(standard)
            byBand.set(standard.grade_band, bandRecords)
        }

        const registerHint = (source, targetBand, field, direction) => {
            if (!targetBand) return
            if (targetBand === source.grade_band) {
                diagnostics.selfHintsRejected += 1
                return
            }

            const targets = byBand.get(targetBand) || []
            if (targets.length !== 1) {
                diagnostics.missingOrAmbiguousTargets += 1
                return
            }

            const target = targets[0]
            const from = direction === 'previous' ? target : source
            const to = direction === 'previous' ? source : target
            const fromOrder = GRADE_ORDER.get(from.grade_band)
            const toOrder = GRADE_ORDER.get(to.grade_band)

            if (!fromOrder || !toOrder || fromOrder >= toOrder) {
                diagnostics.backwardHintsRejected += 1
                return
            }

            const id = `progression:${encodeIdPart(groupId)}:${encodeIdPart(from.code)}:${encodeIdPart(to.code)}`
            const existing = edgeById.get(id)
            const fields = new Set(existing?.provenance?.fields || [])
            fields.add(field)

            edgeById.set(id, {
                id,
                source: standardNodeId(from.code),
                target: standardNodeId(to.code),
                type: GRAPH_RELATION_TYPES.PROGRESSION,
                directed: true,
                label: '学段进阶',
                provenance: {
                    source: 'standard_record',
                    field: [...fields].sort().join('+'),
                    fields: [...fields].sort(),
                    progressionGroupId: groupId
                },
                meta: {
                    fromGradeBand: from.grade_band,
                    toGradeBand: to.grade_band,
                    basis: source.progression_basis || '',
                    confidence: source.progression_confidence ?? null
                }
            })
            groupEdgeIds.add(id)
        }

        for (const standard of group) {
            registerHint(standard, standard.progression_previous_grade_band, 'progression_previous_grade_band', 'previous')
            registerHint(standard, standard.progression_next_grade_band, 'progression_next_grade_band', 'next')
        }

        const orderedBands = [...byBand.keys()]
            .filter(band => GRADE_ORDER.has(band))
            .sort((a, b) => GRADE_ORDER.get(a) - GRADE_ORDER.get(b))
        const expectedEdges = Math.max(orderedBands.length - 1, 0)
        if (expectedEdges > 0 && groupEdgeIds.size >= expectedEdges) {
            diagnostics.groupsWithCompleteConsecutiveChain += 1
        }
    }

    diagnostics.acceptedExplicitEdges = edgeById.size
    return { edges: [...edgeById.values()], diagnostics }
}

export function buildCurriculumGraphModel(standards, { includeProgression = true, skills = [] } = {}) {
    const nodeById = new Map()
    const edgeById = new Map()
    const skillByCode = new Map(skills.map(skill => [skill.code, skill]))

    const addNode = node => {
        if (!nodeById.has(node.id)) nodeById.set(node.id, node)
    }
    const addEdge = edge => {
        if (!edgeById.has(edge.id)) edgeById.set(edge.id, edge)
    }

    for (const standard of standards) {
        if (!standard?.code || !standard.subject_slug || !standard.domain) continue

        const subjectId = subjectNodeId(standard.subject_slug)
        const domainId = domainNodeId(standard.subject_slug, standard.domain)
        const standardId = standardNodeId(standard.code)

        addNode({
            id: subjectId,
            type: GRAPH_ENTITY_TYPES.SUBJECT,
            label: standard.subject,
            meta: { slug: standard.subject_slug },
            provenance: { source: 'standard_record', field: 'subject_slug' }
        })
        addNode({
            id: domainId,
            type: GRAPH_ENTITY_TYPES.DOMAIN,
            label: standard.domain,
            meta: { subjectSlug: standard.subject_slug },
            provenance: { source: 'standard_record', field: 'domain' }
        })
        addNode({
            id: standardId,
            type: GRAPH_ENTITY_TYPES.STANDARD,
            label: standard.standard_title || standard.standard,
            meta: {
                code: standard.code,
                subjectSlug: standard.subject_slug,
                domain: standard.domain,
                gradeBand: standard.grade_band,
                gradeRange: standard.grade_range,
                summary: standard.standard
            },
            provenance: { source: 'standard_record', field: 'code' }
        })

        addEdge({
            id: `contains:${subjectId}:${domainId}`,
            source: subjectId,
            target: domainId,
            type: GRAPH_RELATION_TYPES.CONTAINS,
            directed: true,
            label: '包含领域',
            provenance: { source: 'standard_record', field: 'subject_slug+domain' }
        })
        addEdge({
            id: `contains:${domainId}:${standardId}`,
            source: domainId,
            target: standardId,
            type: GRAPH_RELATION_TYPES.CONTAINS,
            directed: true,
            label: '包含标准',
            provenance: { source: 'standard_record', field: 'domain+code' }
        })

        const primarySkills = new Set((standard.ts_primary || []).map(code => code.split('.')[0]).filter(Boolean))
        const skillCodes = new Set([
            ...primarySkills,
            ...(standard.ts_secondary || []).map(code => code.split('.')[0]).filter(Boolean)
        ])

        for (const skillCode of skillCodes) {
            const skillId = skillNodeId(skillCode)
            const field = primarySkills.has(skillCode) ? 'ts_primary' : 'ts_secondary'
            const skill = skillByCode.get(skillCode)
            addNode({
                id: skillId,
                type: GRAPH_ENTITY_TYPES.SKILL,
                label: skill?.name_cn || skillCode,
                meta: {
                    code: skillCode,
                    summary: skill?.tagline_cn || skill?.definition_cn || ''
                },
                provenance: skill
                    ? { source: 'skills_meta', field: 'name_cn' }
                    : { source: 'standard_record', field }
            })
            addEdge({
                id: `skill_alignment:${standardId}:${skillId}`,
                source: standardId,
                target: skillId,
                type: GRAPH_RELATION_TYPES.SKILL_ALIGNMENT,
                directed: false,
                label: '关联能力',
                provenance: { source: 'standard_record', field }
            })
        }
    }

    const progression = includeProgression
        ? buildExplicitProgressionEdges(standards)
        : { edges: [], diagnostics: null }
    progression.edges.forEach(addEdge)

    return createGraphModel({
        id: 'kebiao-curriculum-graph',
        nodes: [...nodeById.values()],
        edges: [...edgeById.values()],
        meta: {
            scope: 'all_curriculum_standards',
            progressionDiagnostics: progression.diagnostics,
            inferredPrerequisiteCount: 0
        }
    })
}
