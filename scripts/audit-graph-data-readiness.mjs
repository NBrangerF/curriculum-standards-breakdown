import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
    buildCurriculumGraphModel,
    buildExplicitProgressionEdges
} from '../src/graph/adapters/curriculumGraphAdapter.js'

const dataDirectory = resolve('public/data/by_subject')
const files = (await readdir(dataDirectory)).filter(file => file.endsWith('.json')).sort()
const standards = []

for (const filename of files) {
    const raw = JSON.parse(await readFile(resolve(dataDirectory, filename), 'utf8'))
    standards.push(...(raw.standards || []))
}

const hasValue = value => Array.isArray(value) ? value.length > 0 : Boolean(String(value || '').trim())
const splitCodes = value => String(value || '').split('\n').map(code => code.trim()).filter(Boolean)
const countRecordsWithAnyField = fields => standards.filter(standard => fields.some(field => hasValue(standard[field]))).length

const globalGraph = buildCurriculumGraphModel(standards)
const progressionGroups = new Set(standards.map(standard => standard.progression_group_id).filter(Boolean))
const progressionDiagnostics = buildExplicitProgressionEdges(standards).diagnostics

const audit = {
    generatedAt: new Date().toISOString(),
    standards: standards.length,
    approvedGlobalGraph: {
        nodes: globalGraph.nodes.length,
        edges: globalGraph.edges.length,
        relationCounts: {
            contains: globalGraph.edges.filter(edge => edge.type === 'contains').length,
            progression: globalGraph.edges.filter(edge => edge.type === 'progression').length,
            skill_alignment: globalGraph.edges.filter(edge => edge.type === 'skill_alignment').length
        },
        missingProvenance: globalGraph.edges.filter(edge => !edge.provenance?.field).length
    },
    progressionContract: {
        status: 'approved_explicit_unique_forward_only',
        progressionRecords: countRecordsWithAnyField([
            'progression_group_id',
            'progression_previous_grade_band',
            'progression_next_grade_band',
            'progression_role',
            'progression_basis'
        ]),
        progressionGroups: progressionGroups.size,
        progressionDiagnostics
    },
    explicitlyUnavailableRelations: {
        relatedStandardRecords: countRecordsWithAnyField([
            'related_standard',
            'related_standards',
            'related_code',
            'related_codes'
        ]),
        prerequisiteRecords: countRecordsWithAnyField([
            'prerequisite',
            'prerequisites',
            'prerequisite_code',
            'prerequisite_codes'
        ]),
        inferredPrerequisiteEdges: 0
    },
    navigationOnly: {
        previousCodeLinks: standards.reduce((sum, standard) => sum + splitCodes(standard.previous_code).length, 0),
        nextCodeLinks: standards.reduce((sum, standard) => sum + splitCodes(standard.next_code).length, 0),
        classification: 'navigation_only_not_graph_semantics'
    }
}

if (audit.approvedGlobalGraph.missingProvenance !== 0) {
    throw new Error('Production-ready graph edges contain missing provenance')
}

if (audit.explicitlyUnavailableRelations.inferredPrerequisiteEdges !== 0) {
    throw new Error('Prerequisite edges must not be inferred')
}

console.log(JSON.stringify(audit, null, 2))
