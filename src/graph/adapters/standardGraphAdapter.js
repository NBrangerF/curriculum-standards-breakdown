import {
    createGraphModel,
    GRAPH_ENTITY_TYPES,
    GRAPH_RELATION_TYPES
} from '../graphModel.js'

const encodeIdPart = value => encodeURIComponent(String(value || '').trim().toLowerCase())

export function buildStandardGraphModel(standard, { skills = [] } = {}) {
    if (!standard?.code) return null

    const subjectId = `subject:${encodeIdPart(standard.subject_slug)}`
    const domainId = `domain:${encodeIdPart(standard.subject_slug)}:${encodeIdPart(standard.domain)}`
    const standardId = `standard:${encodeIdPart(standard.code)}`
    const skillCodes = [...new Set([
        ...(standard.ts_primary || []),
        ...(standard.ts_secondary || [])
    ].map(code => code.split('.')[0]).filter(Boolean))]
    const skillByCode = new Map(skills.map(skill => [skill.code, skill]))

    const nodes = [
        {
            id: subjectId,
            type: GRAPH_ENTITY_TYPES.SUBJECT,
            label: standard.subject,
            meta: { slug: standard.subject_slug },
            provenance: { source: 'standard_record', field: 'subject_slug' }
        },
        {
            id: domainId,
            type: GRAPH_ENTITY_TYPES.DOMAIN,
            label: standard.domain,
            meta: { subjectSlug: standard.subject_slug },
            provenance: { source: 'standard_record', field: 'domain' }
        },
        {
            id: standardId,
            type: GRAPH_ENTITY_TYPES.STANDARD,
            label: standard.standard_title || standard.standard,
            meta: {
                code: standard.code,
                gradeBand: standard.grade_band,
                gradeRange: standard.grade_range,
                summary: standard.standard
            },
            provenance: { source: 'standard_record', field: 'code' }
        },
        ...skillCodes.map(skillCode => {
            const skill = skillByCode.get(skillCode)
            return {
                id: `skill:${encodeIdPart(skillCode)}`,
                type: GRAPH_ENTITY_TYPES.SKILL,
                label: skill?.name_cn || skillCode,
                meta: {
                    code: skillCode,
                    summary: skill?.tagline_cn || skill?.definition_cn || ''
                },
                provenance: skill
                    ? { source: 'skills_meta', field: 'name_cn' }
                    : { source: 'standard_record', field: 'ts_primary|ts_secondary' }
            }
        })
    ]

    const edges = [
        {
            id: `contains:${subjectId}:${domainId}`,
            source: subjectId,
            target: domainId,
            type: GRAPH_RELATION_TYPES.CONTAINS,
            directed: true,
            label: '包含领域',
            provenance: { source: 'standard_record', field: 'subject_slug+domain' }
        },
        {
            id: `contains:${domainId}:${standardId}`,
            source: domainId,
            target: standardId,
            type: GRAPH_RELATION_TYPES.CONTAINS,
            directed: true,
            label: '包含标准',
            provenance: { source: 'standard_record', field: 'domain+code' }
        },
        ...skillCodes.map(skillCode => ({
            id: `skill_alignment:${standardId}:${encodeIdPart(skillCode)}`,
            source: standardId,
            target: `skill:${encodeIdPart(skillCode)}`,
            type: GRAPH_RELATION_TYPES.SKILL_ALIGNMENT,
            directed: false,
            label: '关联能力',
            provenance: {
                source: 'standard_record',
                field: (standard.ts_primary || []).some(code => code.startsWith(skillCode))
                    ? 'ts_primary'
                    : 'ts_secondary'
            }
        }))
    ]

    return createGraphModel({
        id: `standard-neighborhood:${standard.code}`,
        nodes,
        edges,
        meta: {
            focusNodeId: standardId,
            scope: 'standard_neighborhood',
            inferredPrerequisiteCount: 0
        }
    })
}
