import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  auditTextbookResourceCatalog,
  buildResourceImportPlan,
  buildTextbookResourceCatalog,
  projectRelatedResourcesForTextbook,
  projectRelatedResourcesForUnit,
  resourceInputFromAsset
} from '../scripts/textbooks/textbook_resource_pipeline.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const readJsonLines = path => readFileSync(path, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)

function fixtures() {
  const assets = readJsonLines(join(ROOT, 'generated/textbook_library/asset_manifest.jsonl'))
  const expected = readJsonLines(join(ROOT, 'data/textbooks/catalog/expected_editions.jsonl'))
  const expectedByEdition = new Map(expected.map(row => [row.edition_id, row]))
  const structureRoot = join(ROOT, 'data/textbooks/derived/by-edition')
  const structures = Object.fromEntries(readdirSync(structureRoot)
    .filter(name => name.endsWith('.json'))
    .map(name => {
      const structure = readJson(join(structureRoot, name))
      return [structure.edition_id, structure]
    }))
  const targets = assets
    .filter(asset => asset.resource_type === 'student_textbook')
    .map(asset => ({ ...expectedByEdition.get(asset.edition_id), ...asset }))
  const atlases = assets
    .filter(asset => asset.resource_type === 'student_companion')
    .map(asset => resourceInputFromAsset(asset, expectedByEdition.get(asset.edition_id), structures[asset.edition_id]))
  const teacherFixture = readJson(join(ROOT, 'tests/fixtures/textbook-resources/teacher-guide-manifest.fixture.json'))
  return { assets, atlases, structures, targets, teacherFixture }
}

test('teacher-guide metadata fixture conforms to the resource manifest schema', () => {
  const schema = readJson(join(ROOT, 'data/textbooks/catalog/resource_manifest.schema.json'))
  const fixture = readJson(join(ROOT, 'tests/fixtures/textbook-resources/teacher-guide-manifest.fixture.json'))
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  const validate = ajv.compile(schema)
  assert.equal(validate(fixture), true, JSON.stringify(validate.errors, null, 2))
  assert.equal(JSON.stringify(fixture).includes('正文内容'), false)
  assert.equal(fixture.resources[0].asset.availability, 'manifest_only')
})

test('pairs all four geography atlases and maps the metadata-only teacher guide to a concrete unit', () => {
  const { atlases, structures, targets, teacherFixture } = fixtures()
  assert.equal(atlases.length, 4)
  const resources = [...atlases, ...teacherFixture.resources]
  const input = { resources, targets, structures, generatedAt: '2026-07-22T00:00:00.000Z' }
  const catalog = buildTextbookResourceCatalog(input)
  const repeated = buildTextbookResourceCatalog(input)
  assert.deepEqual(repeated, catalog, 'stable identifiers and indexes must be deterministic')

  assert.equal(catalog.resources.length, 5)
  assert.equal(catalog.pairings.filter(pairing => pairing.status === 'matched').length, 5)
  assert.deepEqual(
    catalog.pairings
      .filter(pairing => catalog.resources.find(resource => resource.resource_id === pairing.resource_id)?.resource_type === 'student_companion')
      .map(pairing => pairing.target_edition_id)
      .sort(),
    [
      'ed_92369ed68f9321363e22',
      'ed_a7fe299869b84f655a87',
      'ed_b4de49a3e2e59c9c76bf',
      'ed_fc41327ff0651b269c88'
    ].sort()
  )

  const teacher = catalog.resources.find(resource => resource.resource_type === 'teacher_guide')
  assert.ok(teacher)
  assert.match(teacher.resource_id, /^res_[a-f0-9]{24}$/)
  assert.match(teacher.edition_id, /^ed_[a-f0-9]{20}$/)
  assert.match(teacher.asset.asset_id, /^asset_[a-f0-9]{24}$/)
  const teacherMapping = catalog.unit_mappings.find(mapping => mapping.resource_id === teacher.resource_id)
  assert.deepEqual(
    {
      target_edition_id: teacherMapping?.target_edition_id,
      target_unit_id: teacherMapping?.target_unit_id,
      target_pages: [teacherMapping?.target_pdf_page_start, teacherMapping?.target_pdf_page_end],
      resource_pages: [teacherMapping?.resource_pdf_page_start, teacherMapping?.resource_pdf_page_end],
      method: teacherMapping?.method
    },
    {
      target_edition_id: 'ed_9d4028e2ab482520d0aa',
      target_unit_id: 'tcu_4689a5d3ae9ee154',
      target_pages: [6, 19],
      resource_pages: [1, 12],
      method: 'explicit_manifest'
    }
  )

  const bookProjection = projectRelatedResourcesForTextbook(catalog, 'ed_9d4028e2ab482520d0aa')
  assert.deepEqual(bookProjection.map(resource => ({
    resource_edition_id: resource.resource_edition_id,
    resource_type: resource.resource_type,
    relationship: resource.relationship
  })), [{
    resource_edition_id: teacher.edition_id,
    resource_type: 'teacher_guide',
    relationship: 'teacher_guide_for'
  }])

  const unitProjection = projectRelatedResourcesForUnit(
    catalog,
    'ed_9d4028e2ab482520d0aa',
    'tcu_4689a5d3ae9ee154'
  )
  assert.deepEqual(unitProjection.map(resource => ({
    mapping_id: resource.mapping_id,
    resource_section_title: resource.resource_section_title,
    resource_pages: [resource.resource_pdf_page_start, resource.resource_pdf_page_end],
    target_pages: [resource.target_pdf_page_start, resource.target_pdf_page_end]
  })), [{
    mapping_id: teacherMapping.mapping_id,
    resource_section_title: '第一单元教学设计（测试元数据）',
    resource_pages: [1, 12],
    target_pages: [6, 19]
  }])

  const atlasIds = new Set(catalog.resources.filter(resource => resource.resource_type === 'student_companion').map(resource => resource.resource_id))
  assert.ok(catalog.unit_mapping_gaps.some(gap => atlasIds.has(gap.resource_id) && gap.reason === 'resource_structure_unavailable'))
  assert.equal(catalog.unit_mappings.filter(mapping => atlasIds.has(mapping.resource_id)).length, 0)

  const audit = auditTextbookResourceCatalog(catalog)
  assert.equal(audit.valid, true, JSON.stringify(audit.errors, null, 2))
  assert.equal(audit.summary.import_ready_assets, 4)
  assert.equal(audit.summary.manifest_only_assets, 1)
  assert.equal(buildResourceImportPlan(teacher).reason, 'asset_manifest_only')
})

test('audit rejects a broken reverse index', () => {
  const { atlases, structures, targets, teacherFixture } = fixtures()
  const catalog = buildTextbookResourceCatalog({
    resources: [...atlases, ...teacherFixture.resources],
    targets,
    structures,
    generatedAt: '2026-07-22T00:00:00.000Z'
  })
  const broken = structuredClone(catalog)
  const resourceId = broken.resources[0].resource_id
  delete broken.indexes.by_resource[resourceId]
  const audit = auditTextbookResourceCatalog(broken)
  assert.equal(audit.valid, false)
  assert.ok(audit.errors.includes('by_resource reverse index does not match pairings'))
})
