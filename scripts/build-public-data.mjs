#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildTrustProjection, projectTrustedRecord } from './lib/trust-metadata.mjs'
import { buildLearningResourcePublicData } from './learning-resources/build-public-data.mjs'

const PUBLIC_STANDARD_FIELDS = [
    'code', 'subject', 'subject_slug', 'domain', 'subdomain', 'display_subcategory', 'standard_title',
    'grade_band', 'grade_range', 'grade', 'grade_level', 'stage_band', 'standard', 'context', 'practice',
    'teaching_tip', 'assessment_evidence_type', 'ts_primary', 'ts_secondary', 'ts_rationale',
    'materials_tools', 'safety_notes', 'previous_code', 'next_code',
    'capability_graph_schema_version', 'capability_graph_method', 'source_standard_hash',
    'prerequisite_review_coverage', 'curriculum_alignment_summary'
]
const CAPABILITY_GRAPH_FIELDS = [
    'capability_graph_schema_version', 'capability_graph_method', 'source_standard_hash',
    'learning_components', 'verified_prerequisites', 'prerequisite_candidates', 'prerequisite_review_coverage',
    'hardest_cases', 'common_difficulties', 'curriculum_alignments', 'curriculum_alignment_summary',
    'forward_connections'
]
const CAPABILITY_ARRAY_FIELDS = new Set([
    'learning_components', 'verified_prerequisites', 'prerequisite_candidates', 'hardest_cases',
    'common_difficulties', 'curriculum_alignments', 'forward_connections'
])
const CAPABILITY_OBJECT_FIELDS = new Set(['prerequisite_review_coverage', 'curriculum_alignment_summary'])
const PUBLIC_TRUST_FIELDS = ['provenance', 'official_text', 'field_provenance', 'relations', 'skill_alignments']
const PUBLIC_ARRAY_FIELDS = new Set(['ts_primary', 'ts_secondary'])
const PUBLIC_OBJECT_FIELDS = new Set(['prerequisite_review_coverage', 'curriculum_alignment_summary'])

function parseArgs(argv) {
    const args = { source: 'data/internal', output: 'public/data' }
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--source') args.source = argv[++index]
        if (argv[index] === '--output') args.output = argv[++index]
    }
    return args
}

function stable(value) {
    if (Array.isArray(value)) return value.map(stable)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
}

function writeJson(path, value) {
    writeFileSync(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function snapshotDirectory(root, relativePath = '') {
    const currentRoot = join(root, relativePath)
    if (!existsSync(currentRoot)) return []
    return readdirSync(currentRoot, { withFileTypes: true }).flatMap(entry => {
        const entryPath = join(relativePath, entry.name)
        return entry.isDirectory()
            ? snapshotDirectory(root, entryPath)
            : [{ path: entryPath, contents: readFileSync(join(root, entryPath)) }]
    })
}

function restoreDirectory(root, snapshot) {
    for (const file of snapshot) {
        const destination = join(root, file.path)
        mkdirSync(resolve(destination, '..'), { recursive: true })
        writeFileSync(destination, file.contents)
    }
}

function pickPublic(record, metadata) {
    const publicRecord = Object.fromEntries(PUBLIC_STANDARD_FIELDS.map(field => [
        field,
        record[field] ?? (PUBLIC_ARRAY_FIELDS.has(field) ? [] : PUBLIC_OBJECT_FIELDS.has(field) ? {} : '')
    ]))
    return projectTrustedRecord(publicRecord, metadata)
}

function pickCapabilityGraph(record) {
    return {
        standard_code: record.code,
        ...Object.fromEntries(CAPABILITY_GRAPH_FIELDS.map(field => [
            field,
            record[field] ?? (CAPABILITY_ARRAY_FIELDS.has(field) ? [] : CAPABILITY_OBJECT_FIELDS.has(field) ? {} : '')
        ]))
    }
}

const args = parseArgs(process.argv.slice(2))
const sourceRoot = resolve(args.source)
const outputRoot = resolve(args.output)
const sourceBySubject = join(sourceRoot, 'by_subject')
const knowledgeGraphSnapshot = snapshotDirectory(join(outputRoot, 'knowledge_graph'))
const textbookSnapshot = snapshotDirectory(join(outputRoot, 'textbooks'))

if (!existsSync(sourceBySubject)) throw new Error(`缺少内部数据目录：${sourceBySubject}`)
rmSync(outputRoot, { recursive: true, force: true })
mkdirSync(join(outputRoot, 'by_subject'), { recursive: true })
mkdirSync(join(outputRoot, 'indexes'), { recursive: true })
mkdirSync(join(outputRoot, 'capability_graph', 'by_code'), { recursive: true })
restoreDirectory(join(outputRoot, 'knowledge_graph'), knowledgeGraphSnapshot)
restoreDirectory(join(outputRoot, 'textbooks'), textbookSnapshot)

const manifestSubjects = []
const codeToSubject = {}
const aliasCandidates = new Map()
const skillToSubjects = new Map()
const subjectStats = {}
const publicColumns = new Set([...PUBLIC_STANDARD_FIELDS, ...PUBLIC_TRUST_FIELDS])

const sourceFiles = readdirSync(sourceBySubject).filter(name => name.endsWith('.json')).sort()
const sourcesByFile = new Map(sourceFiles.map(file => [file, JSON.parse(readFileSync(join(sourceBySubject, file), 'utf8'))]))
const sourceRecords = [...sourcesByFile.values()].flatMap(source => source.standards || [])
const trustProjection = buildTrustProjection(sourceRecords)

function addAlias(value, code) {
    const key = String(value || '').trim().toUpperCase()
    if (!key || key === code.toUpperCase()) return
    const codes = aliasCandidates.get(key) || new Set()
    codes.add(code)
    aliasCandidates.set(key, codes)
}

for (const file of sourceFiles) {
    const source = sourcesByFile.get(file)
    const standards = (source.standards || []).map(record => pickPublic(record, trustProjection.metadataByCode.get(record.code)))
    const subjectSlug = source.subject_slug || file.replace(/\.json$/, '')
    const domains = {}
    const gradeBands = {}
    const grades = {}
    const skillCoverage = {}

    for (const record of standards) {
        codeToSubject[record.code] = subjectSlug
        const internalRecord = (source.standards || []).find(item => item.code === record.code)
        addAlias(internalRecord?.id, record.code)
        addAlias(internalRecord?.legacy_code, record.code)
        for (const legacyCode of internalRecord?.legacy_codes || []) addAlias(legacyCode, record.code)
        domains[record.domain] = (domains[record.domain] || 0) + 1
        gradeBands[record.grade_band] = (gradeBands[record.grade_band] || 0) + 1
        grades[record.grade] = (grades[record.grade] || 0) + 1
        for (const skill of [...record.ts_primary, ...record.ts_secondary]) {
            const main = String(skill).split('.')[0]
            skillCoverage[main] = (skillCoverage[main] || 0) + 1
            const subjects = skillToSubjects.get(main) || new Set()
            subjects.add(subjectSlug)
            skillToSubjects.set(main, subjects)
        }
    }

    for (const record of source.standards || []) {
        writeJson(join(outputRoot, 'capability_graph', 'by_code', `${record.code}.json`), pickCapabilityGraph(record))
    }

    writeJson(join(outputRoot, 'by_subject', file), {
        subject: source.subject,
        subject_slug: subjectSlug,
        standards
    })
    manifestSubjects.push({
        subject: source.subject,
        subject_slug: subjectSlug,
        record_count: standards.length,
        file: `by_subject/${file}`,
        domains,
        grade_bands: gradeBands,
        grades
    })
    subjectStats[subjectSlug] = {
        total: standards.length,
        domains: Object.keys(domains).length,
        grade_bands: gradeBands,
        grades,
        skill_coverage: skillCoverage
    }
}

const sourceManifest = JSON.parse(readFileSync(join(sourceRoot, 'manifest.json'), 'utf8'))
writeJson(join(outputRoot, 'manifest.json'), {
    generated_at: new Date().toISOString(),
    data_scope: sourceManifest.data_scope,
    target_policy: sourceManifest.target_policy,
    projection: 'public_v2_capability_graph_sidecar',
    columns: [...publicColumns].sort(),
    capability_graph: {
        projection: 'by_code_sidecar_v1',
        path_template: 'capability_graph/by_code/{code}.json',
        record_count: Object.keys(codeToSubject).length,
        fields: CAPABILITY_GRAPH_FIELDS
    },
    subjects: manifestSubjects
})
writeJson(join(outputRoot, 'indexes', 'code_to_subject.json'), codeToSubject)
writeJson(join(outputRoot, 'indexes', 'code_aliases.json'), Object.fromEntries(
    [...aliasCandidates].map(([alias, codes]) => [alias, [...codes].sort()])
))
writeJson(join(outputRoot, 'indexes', 'skill_to_subjects.json'), Object.fromEntries(
    [...skillToSubjects].sort(([left], [right]) => left.localeCompare(right)).map(([skill, subjects]) => [skill, [...subjects].sort()])
))
writeJson(join(outputRoot, 'indexes', 'subject_stats.json'), subjectStats)
mkdirSync(join(outputRoot, 'quality'), { recursive: true })
writeJson(join(outputRoot, 'quality', 'trust_report.json'), {
    generated_at: new Date().toISOString(),
    ...trustProjection.summary,
    rejected_reference_details: trustProjection.rejectedReferences
})

for (const file of ['subjects_meta.json', 'skills_meta.json', 'glossary.json']) {
    const source = join(sourceRoot, file)
    if (existsSync(source)) cpSync(source, join(outputRoot, file))
}

const dataVersion = JSON.parse(readFileSync(join(sourceRoot, 'data_version.json'), 'utf8'))
dataVersion.source_of_truth = {
    canonical_records: 'data/internal/by_subject/*.json',
    public_projection: 'public/data/by_subject/*.json',
    public_capability_graph: 'public/data/capability_graph/by_code/*.json',
    public_indexes: 'public/data/indexes/*.json'
}
dataVersion.public_projection = 'public_v2_capability_graph_sidecar'
writeJson(join(outputRoot, 'data_version.json'), dataVersion)

const learningResources = buildLearningResourcePublicData({
    dataRoot: join(resolve(args.source, '..'), 'learning-resources'),
    outputRoot: join(outputRoot, 'learning-resources')
})

console.log(JSON.stringify({
    source: sourceRoot,
    output: outputRoot,
    records: Object.keys(codeToSubject).length,
    public_fields: publicColumns.size,
    aliases: aliasCandidates.size,
    trust: trustProjection.summary,
    learning_resources: learningResources
}, null, 2))
