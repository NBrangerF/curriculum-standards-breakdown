import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
    buildGlobalPreviewData,
    splitRelationCodes
} from './knowledgeGraphPreviewBuilder.mjs'
import { validateKnowledgeGraph } from './knowledgeGraphValidation.mjs'

assert.deepEqual(splitRelationCodes(['A|B', 'B\nC', '', null, ['D', 'A']]), ['A', 'B', 'C', 'D'])

const fixture = buildGlobalPreviewData([{
    subject: '测试学科',
    subjectSlug: 'test',
    sourceFile: 'by_subject/test.json',
    records: [
        { code: 'T-A', subject: '测试学科', subject_slug: 'test', domain: '领域', subdomain: '子领域', grade_band: 'H1', grade_range: '1', standard_title: 'A' },
        { code: 'T-B', subject: '测试学科', subject_slug: 'test', domain: '领域', subdomain: '子领域', grade_band: 'H1', grade_range: '1', standard_title: 'B', previous_code: 'T-A|MISSING\nT-A' },
        { code: 'T-C', subject: '测试学科', subject_slug: 'test', domain: '领域', subdomain: '子领域', grade_band: 'H1', grade_range: '1', standard_title: 'C', next_code: ['T-D', 'MISSING-2'] },
        { code: 'T-D', subject: '测试学科', subject_slug: 'test', domain: '领域', subdomain: '子领域', grade_band: 'H1', grade_range: '1', standard_title: 'D', previous_code: 'T-C' }
    ]
}])

assert.equal(fixture.subjects.length, 1)
assert.deepEqual(fixture.counts, {
    knowledgePoints: 4,
    candidateRelationships: 2,
    taxonomyNodes: 4,
    taxonomyEdges: 7,
    unresolvedReferences: 2,
    crossSubjectReferences: 0
})
assert.deepEqual(fixture.subjects[0].quality.unresolvedReferences.map(item => item.relatedCode), ['MISSING', 'MISSING-2'])
assert.deepEqual(fixture.subjects[0].dataset.prerequisites.map(edge => [edge.source, edge.target]), [
    ['kp:test:t-a', 'kp:test:t-b'],
    ['kp:test:t-c', 'kp:test:t-d']
])
assert.ok(fixture.subjects[0].dataset.prerequisites.every(edge => edge.reviewStatus === 'candidate' && edge.necessity === 'undetermined'))
assert.equal(validateKnowledgeGraph(fixture.subjects[0].dataset).valid, true)

const publicRoot = resolve('public/data')
const manifest = JSON.parse(await readFile(resolve(publicRoot, 'manifest.json'), 'utf8'))
const subjectEntries = await Promise.all(manifest.subjects.map(async subject => {
    const payload = JSON.parse(await readFile(resolve(publicRoot, subject.file), 'utf8'))
    return {
        subject: subject.subject,
        subjectSlug: subject.subject_slug,
        sourceFile: subject.file,
        records: payload.standards || payload
    }
}))
const globalPreview = buildGlobalPreviewData(subjectEntries)

assert.equal(globalPreview.subjects.length, 9)
assert.equal(globalPreview.counts.knowledgePoints, 2025)
assert.equal(globalPreview.counts.candidateRelationships, 1719)
assert.equal(globalPreview.counts.unresolvedReferences, 0)
assert.equal(globalPreview.counts.crossSubjectReferences, 0)
assert.ok(globalPreview.subjects.every(subject => subject.quality.unresolvedReferences.length === 0))

const candidateEdges = globalPreview.subjects.flatMap(subject => subject.dataset.prerequisites)
assert.equal(candidateEdges.filter(edge => edge.relationType === 'curriculum_sequence_candidate').length, 1175)
assert.equal(candidateEdges.filter(edge => edge.relationType === 'grade_band_bridge_candidate').length, 544)
assert.ok(candidateEdges.every(edge => (
    Number.isFinite(edge.confidenceScore)
    && edge.confidenceScore >= 0
    && edge.confidenceScore <= 1
    && Boolean(edge.method)
    && ['extracted', 'rule_generated'].includes(edge.provenance)
)))

const allStandardCodes = globalPreview.subjects.flatMap(subject => subject.dataset.knowledgePoints.flatMap(point => point.standardCodes))
assert.equal(new Set(allStandardCodes).size, 2025)
for (const subject of globalPreview.subjects) {
    const validation = validateKnowledgeGraph(subject.dataset)
    assert.equal(validation.valid, true, `${subject.subjectSlug}: ${validation.errors.join('; ')}`)
    assert.equal(subject.manifestEntry.files.knowledgePoints, `nodes_by_subject/${subject.subjectSlug}.json`)
    assert.equal(subject.manifestEntry.files.taxonomy, `taxonomy_by_subject/${subject.subjectSlug}.json`)
}

console.log(JSON.stringify({ status: 'passed', version: globalPreview.version, counts: globalPreview.counts }, null, 2))
