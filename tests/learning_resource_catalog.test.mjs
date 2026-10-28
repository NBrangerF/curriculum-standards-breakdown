import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
    buildCatalog,
    buildCuratedLearningResourceCatalog,
    diffCommittedOutput,
    loadCuratedResources,
    loadStandardIndex
} from '../scripts/learning-resources/build-curated-catalog.mjs'
import {
    LEARNING_RESOURCE_SUBJECTS,
    NONCOMMERCIAL_LICENSES
} from '../packages/curriculum-core/src/learning-resources/schemas.ts'

const CURATED = 'data/learning-resources/curated'
const OUTPUT = 'public/data/learning-resources'
const standards = loadStandardIndex('public/data/by_subject')
const curated = loadCuratedResources(CURATED, standards)

test('every curated entry validates and every standard code resolves to a real standard', () => {
    assert.ok(curated.length >= 60, `expected a real catalog, got ${curated.length}`)
    for (const resource of curated) {
        for (const alignment of resource.standards) assert.ok(standards.has(alignment.code), `${resource.id}: ${alignment.code}`)
    }
})

test('the committed public catalog matches a fresh build', () => {
    const { files } = buildCuratedLearningResourceCatalog({ write: false })
    assert.deepEqual(diffCommittedOutput(files, OUTPUT), [], 'run npm run learning-resources:build and commit the output')
})

test('catalog entries link out instead of carrying full text', () => {
    const catalog = JSON.parse(readFileSync(join(OUTPUT, 'catalog/index.json'), 'utf8'))
    assert.equal(catalog.schema_version, 2)
    for (const resource of catalog.resources) {
        assert.match(resource.url, /^https?:\/\//u)
        assert.equal('blocks' in resource || 'fragment_id' in resource, false, resource.id)
        assert.equal(resource.alignment_count, resource.standards.length)
        assert.deepEqual(resource.standard_codes, resource.standards.map(item => item.code))
        for (const alignment of resource.standards) assert.ok(alignment.standard_title && alignment.rationale_zh, resource.id)
    }
})

test('noncommercial licences are always flagged', () => {
    for (const resource of curated) {
        const noncommercial = NONCOMMERCIAL_LICENSES.includes(resource.license)
        assert.equal(resource.open_level === 'noncommercial', noncommercial, resource.id)
    }
})

test('every subject has resources and no resource is published twice', () => {
    const ids = curated.map(resource => resource.id)
    assert.equal(new Set(ids).size, ids.length)
    for (const subject of LEARNING_RESOURCE_SUBJECTS) {
        assert.ok(curated.some(resource => resource.subjects.includes(subject)), `${subject} has no resources`)
    }
})

test('by-standard files list each aligned resource with its own rationale', () => {
    const { catalog, byStandard } = buildCatalog(curated, standards)
    assert.equal(byStandard.size, catalog.counts.standards)
    for (const resource of catalog.resources) {
        for (const alignment of resource.standards) {
            const entry = byStandard.get(alignment.code).resources.find(item => item.id === resource.id)
            assert.equal(entry.rationale_zh, alignment.rationale_zh)
        }
    }
})

test('the builder rejects unknown standard codes and stage mismatches', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kebiao-curated-'))
    try {
        const [first] = curated
        const broken = {
            subject: first.subjects[0],
            resources: [
                { ...first, standards: [{ code: 'SC-H4G7-SC-999', rationale_zh: '不存在的课标编码应当被拒绝。' }] },
                { ...first, id: `${first.id}-copy`, stages: ['G1-2'] }
            ]
        }
        writeFileSync(join(dir, `${first.subjects[0]}.json`), JSON.stringify(broken))
        assert.throws(() => loadCuratedResources(dir, standards), /SC-H4G7-SC-999 does not exist[\s\S]*not in stages/u)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

