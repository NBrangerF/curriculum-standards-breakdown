import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  DEFAULT_SUPPORT_RESOURCE_BUCKET,
  auditTextbookResourceCatalog,
  buildResourceImportPlan,
  buildTextbookResourceCatalog,
  mergeResourceManifestInputs,
  normalizeResourceInput,
  projectRelatedResourcesForTextbook,
  projectRelatedResourcesForUnit,
  resourceInputForRegistry,
  resourceInputFromAsset
} from '../scripts/textbooks/textbook_resource_pipeline.js'
import { isReadableSupportResource } from '../scripts/textbooks/support_resource_readability.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const readJsonLines = path => readFileSync(path, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)

function runNode(script, args) {
  const result = spawnSync(process.execPath, [join(ROOT, script), ...args], {
    cwd: ROOT,
    encoding: 'utf8'
  })
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join('\n'))
  return result
}

function runNodeFailure(script, args) {
  const result = spawnSync(process.execPath, [join(ROOT, script), ...args], {
    cwd: ROOT,
    encoding: 'utf8'
  })
  assert.notEqual(result.status, 0, 'command unexpectedly succeeded')
  return result
}

function fixtures() {
  // Keep the unit test focused: the production build reads CURRENT's tracked
  // lock file, while these four rows are the smallest sample for atlas pairing.
  const assets = readJsonLines(join(ROOT, 'tests/fixtures/textbook-resources/atlas-assets.fixture.jsonl'))
  const expected = readJsonLines(join(ROOT, 'data/textbooks/catalog/expected_editions.jsonl'))
  const expectedByEdition = new Map(expected.map(row => [row.edition_id, row]))
  const structureRoot = join(ROOT, 'data/textbooks/derived/by-edition')
  const structures = Object.fromEntries(readdirSync(structureRoot)
    .filter(name => name.endsWith('.json'))
    .map(name => {
      const structure = readJson(join(structureRoot, name))
      return [structure.edition_id, structure]
    }))
  const targets = expected.filter(row => row.resource_type === 'student_textbook')
  const atlases = assets
    .filter(asset => asset.resource_type === 'student_companion')
    .map(asset => resourceInputFromAsset(asset, expectedByEdition.get(asset.edition_id), structures[asset.edition_id]))
  const teacherFixture = readJson(join(ROOT, 'tests/fixtures/textbook-resources/teacher-guide-manifest.fixture.json'))
  return { assets, atlases, structures, targets, teacherFixture }
}

test('teacher-guide metadata fixture conforms to the resource manifest schema', () => {
  const schema = readJson(join(ROOT, 'data/textbooks/catalog/resource_manifest.schema.json'))
  const fixture = readJson(join(ROOT, 'tests/fixtures/textbook-resources/teacher-guide-manifest.fixture.json'))
  const registry = readJson(join(ROOT, 'data/textbooks/catalog/support_resource_registry.json'))
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  const validate = ajv.compile(schema)
  assert.equal(validate(fixture), true, JSON.stringify(validate.errors, null, 2))
  assert.equal(validate(registry), true, JSON.stringify(validate.errors, null, 2))
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
    'tcu_4689a5d3ae9ee154',
    { readableEditionIds: new Set() }
  )
  assert.deepEqual(unitProjection.map(resource => ({
    mapping_id: resource.mapping_id,
    resource_section_title: resource.resource_section_title,
    resource_reading_available: resource.resource_reading_available,
    resource_pages: [resource.resource_pdf_page_start, resource.resource_pdf_page_end],
    target_pages: [resource.target_pdf_page_start, resource.target_pdf_page_end]
  })), [{
    mapping_id: teacherMapping.mapping_id,
    resource_section_title: '第一单元教学设计（测试元数据）',
    resource_reading_available: false,
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

test('registry merge is a stable-ID upsert and portable rows discard workstation paths', () => {
  const { teacherFixture } = fixtures()
  const base = structuredClone(teacherFixture.resources[0])
  base.asset.source_path = '/Users/example/private/teacher-guide.pdf'
  base.asset.local_path = '/Volumes/X9 Pro/kebiao-library/private.pdf'
  base.asset.object_path = '/Users/example/private/object.pdf'
  base.asset.r2_key = 'file:///Users/example/private/r2-key.pdf'
  base.provenance.source_ref = 'file:///Users/example/private/import.json'
  base.unexpected_top_level = 'must not survive'
  base.asset.unexpected_nested = 'must not survive'
  const normalized = normalizeResourceInput(base)
  const portable = resourceInputForRegistry(base, normalized.resource, {
    sourceRef: 'data/textbooks/imports/teacher-guide.json'
  })
  assert.equal(portable.resource_id, normalized.resource.resource_id)
  assert.equal(portable.asset.source_path, null)
  assert.equal(portable.asset.local_path, null)
  assert.equal(portable.asset.object_path, null)
  assert.equal(portable.asset.r2_key, null)
  assert.equal(portable.provenance.source_ref, 'data/textbooks/imports/teacher-guide.json')
  assert.equal('unexpected_top_level' in portable, false)
  assert.equal('unexpected_nested' in portable.asset, false)

  const overlay = structuredClone(portable)
  overlay.bibliography.edition_statement = '更新后的书目信息'
  const merged = mergeResourceManifestInputs([portable], [overlay])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].bibliography.edition_statement, '更新后的书目信息')
})

test('catalog build rejects an explicit unit target that conflicts with the final book pairing', () => {
  const { structures, targets, teacherFixture } = fixtures()
  const conflicting = structuredClone(teacherFixture.resources[0])
  conflicting.unit_mappings[0].target_edition_id = 'ed_92369ed68f9321363e22'
  assert.throws(
    () => buildTextbookResourceCatalog({ resources: [conflicting], targets, structures }),
    /explicit unit mapping target conflicts with final textbook pairing/
  )
})

test('teacher-facing resources inherit bibliographic publisher and revision and fail closed on unsafe overrides', () => {
  const { structures, targets, teacherFixture } = fixtures()
  const inherited = structuredClone(teacherFixture.resources[0])
  inherited.bibliography.publisher = '人民教育出版社'
  inherited.bibliography.edition_name = '统编版'
  inherited.target = {
    subject_slug: 'chinese',
    grade: 5,
    volume: '上册'
  }
  const normalized = normalizeResourceInput(inherited)
  assert.equal(normalized.resource.target_hints[0].publisher, '人民教育出版社')
  assert.equal(normalized.resource.target_hints[0].revision_year, 2022)

  const catalog = buildTextbookResourceCatalog({ resources: [inherited], targets, structures })
  assert.equal(catalog.pairings[0].status, 'matched')
  assert.equal(catalog.pairings[0].target_edition_id, 'ed_9d4028e2ab482520d0aa')
  assert.ok(catalog.pairings[0].matching_fields.includes('publisher'))
  assert.ok(catalog.pairings[0].matching_fields.includes('revision_year'))

  const publisherConflict = structuredClone(inherited)
  publisherConflict.target.publisher = '其他出版社'
  assert.throws(
    () => normalizeResourceInput(publisherConflict),
    /conflicting target publisher requires explicit edition_id/
  )

  const revisionConflict = structuredClone(inherited)
  revisionConflict.target.revision_year = 2024
  assert.throws(
    () => normalizeResourceInput(revisionConflict),
    /conflicting target revision_year requires explicit edition_id/
  )

  const ambiguous = structuredClone(inherited)
  ambiguous.unit_mappings = []
  const duplicateTarget = {
    ...targets.find(target => target.edition_id === 'ed_9d4028e2ab482520d0aa'),
    edition_id: 'ed_fixture_same_bibliography'
  }
  const ambiguousCatalog = buildTextbookResourceCatalog({
    resources: [ambiguous],
    targets: [...targets, duplicateTarget],
    structures
  })
  assert.equal(ambiguousCatalog.pairings[0].status, 'ambiguous')
  assert.equal(ambiguousCatalog.pairings[0].target_edition_id, null)
})

test('available resource sections and unit mappings cannot exceed asset.pages', () => {
  const { structures, targets, teacherFixture } = fixtures()
  const outOfBounds = structuredClone(teacherFixture.resources[0])
  const sha256 = 'a'.repeat(64)
  Object.assign(outOfBounds.asset, {
    availability: 'available',
    sha256,
    bytes: 1024,
    pages: 10,
    object_path: `objects/sha256/aa/${sha256}.pdf`,
    r2_key: `objects/sha256/aa/${sha256}.pdf`
  })
  assert.throws(
    () => buildTextbookResourceCatalog({ resources: [outOfBounds], targets, structures }),
    /resource section end page exceeds available asset\.pages/
  )

  outOfBounds.asset.pages = 12
  const catalog = buildTextbookResourceCatalog({ resources: [outOfBounds], targets, structures })
  catalog.unit_mappings[0].resource_pdf_page_end = 13
  const audit = auditTextbookResourceCatalog(catalog)
  assert.equal(audit.valid, false)
  assert.ok(audit.errors.some(error => error.startsWith('mapping resource end page exceeds asset pages:')))

  const pageMapOutOfBounds = structuredClone(outOfBounds)
  pageMapOutOfBounds.asset.pages = 12
  pageMapOutOfBounds.structure.toc[0].pdf_page_end = 12
  pageMapOutOfBounds.structure.page_map.push({ pdf_page: 13, printed_page: '13', label: '13' })
  assert.throws(
    () => buildTextbookResourceCatalog({ resources: [pageMapOutOfBounds], targets, structures }),
    /resource page_map page exceeds available asset\.pages/
  )
})

test('available resource manifest, catalog, readability, and import plan share one storage contract', () => {
  const { structures, targets, teacherFixture } = fixtures()
  const available = structuredClone(teacherFixture.resources[0])
  const sha256 = 'a'.repeat(64)
  const objectPath = `objects/sha256/aa/${sha256}.pdf`
  Object.assign(available.asset, {
    availability: 'available',
    sha256,
    bytes: 4096,
    pages: 12,
    object_path: objectPath,
    r2_bucket: DEFAULT_SUPPORT_RESOURCE_BUCKET,
    r2_key: objectPath
  })
  const catalog = buildTextbookResourceCatalog({ resources: [available], targets, structures })
  assert.equal(auditTextbookResourceCatalog(catalog).valid, true)
  assert.equal(isReadableSupportResource(catalog.resources[0]), true)
  assert.deepEqual(buildResourceImportPlan(catalog.resources[0]).r2, {
    bucket: DEFAULT_SUPPORT_RESOURCE_BUCKET,
    key: objectPath,
    content_type: 'application/pdf',
    sha256,
    bytes: 4096
  })

  const customBucket = structuredClone(available)
  customBucket.asset.r2_bucket = 'another-bucket'
  assert.throws(
    () => normalizeResourceInput(customBucket),
    /r2_bucket must equal configured bucket/
  )

  const customKey = structuredClone(available)
  customKey.asset.r2_key = 'custom/teacher-guide.pdf'
  assert.throws(
    () => normalizeResourceInput(customKey),
    /r2_key must equal its content-addressed object_path/
  )

  const brokenCatalog = structuredClone(catalog)
  brokenCatalog.resources[0].asset.r2_key = 'custom/teacher-guide.pdf'
  const audit = auditTextbookResourceCatalog(brokenCatalog)
  assert.equal(audit.valid, false)
  assert.ok(audit.errors.some(error => error.startsWith('non-content-addressed r2_key:')))
  assert.equal(isReadableSupportResource(brokenCatalog.resources[0]), false)
})

test('resource import validates the strict manifest schema before writing a registry', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'kebiao-resource-schema-'))
  try {
    const invalid = structuredClone(fixtures().teacherFixture)
    invalid.resources[0].unexpected = 'schema must reject this field'
    const importManifest = join(temporaryRoot, 'invalid-import.json')
    const registryPath = join(temporaryRoot, 'registry.json')
    writeFileSync(importManifest, `${JSON.stringify(invalid, null, 2)}\n`)
    const result = runNodeFailure('scripts/textbooks/import_textbook_resources.js', [
      '--manifest', importManifest,
      '--register',
      '--registry', registryPath
    ])
    assert.match(`${result.stdout}\n${result.stderr}`, /does not conform to resource_manifest\.schema\.json/)
    assert.equal(readFileOrNull(registryPath), null)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('resource import rejects custom bucket and key before reading or transferring a source PDF', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'kebiao-resource-storage-contract-'))
  try {
    for (const [field, value, expected] of [
      ['r2_bucket', 'another-bucket', /r2_bucket must equal configured bucket/],
      ['r2_key', 'custom\/teacher-guide.pdf', /r2_key must be content-addressed/]
    ]) {
      const invalid = structuredClone(fixtures().teacherFixture)
      Object.assign(invalid.resources[0].asset, {
        availability: 'available',
        source_path: 'missing.pdf',
        [field]: value
      })
      const importManifest = join(temporaryRoot, `invalid-${field}.json`)
      const registryPath = join(temporaryRoot, `registry-${field}.json`)
      writeFileSync(importManifest, `${JSON.stringify(invalid, null, 2)}\n`)
      const result = runNodeFailure('scripts/textbooks/import_textbook_resources.js', [
        '--manifest', importManifest,
        '--register',
        '--registry', registryPath
      ])
      assert.match(`${result.stdout}\n${result.stderr}`, expected)
      assert.equal(readFileOrNull(registryPath), null)
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('default resource build reads CURRENT tracked registry and fails when that source is absent', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'kebiao-resource-current-'))
  try {
    const outputPath = join(temporaryRoot, 'catalog.json')
    runNode('scripts/textbooks/build_textbook_resource_catalog.js', [
      '--generated-at', '2026-07-22T00:00:00.000Z',
      '--out', outputPath
    ])
    const catalog = readJson(outputPath)
    const current = readJson(join(ROOT, 'data/textbooks/library-state/CURRENT.json'))
    const currentAssets = readJsonLines(join(
      ROOT,
      'data/textbooks/library-state/generations',
      current.generation_id,
      'asset_registry.lock.jsonl'
    ))
    const expectedCompanions = currentAssets.filter(asset => asset.resource_type === 'student_companion').length
    assert.equal(catalog.resources.filter(resource => resource.resource_type === 'student_companion').length, expectedCompanions)

    const missingCurrent = join(temporaryRoot, 'CURRENT.json')
    writeFileSync(missingCurrent, `${JSON.stringify({ schema_version: 1, generation_id: 'gen-does-not-exist' })}\n`)
    const failed = runNodeFailure('scripts/textbooks/build_textbook_resource_catalog.js', [
      '--current', missingCurrent,
      '--out', join(temporaryRoot, 'missing.json')
    ])
    assert.match(`${failed.stdout}\n${failed.stderr}`, /CURRENT textbook asset registry is missing/)

    const emptyAssets = join(temporaryRoot, 'empty-assets.jsonl')
    writeFileSync(emptyAssets, '')
    const emptyFailed = runNodeFailure('scripts/textbooks/build_textbook_resource_catalog.js', [
      '--assets', emptyAssets,
      '--out', join(temporaryRoot, 'empty.json')
    ])
    assert.match(`${emptyFailed.stdout}\n${emptyFailed.stderr}`, /Textbook asset registry is empty/)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('default resource audit validates pairings against the same CURRENT tracked registry as the build', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'kebiao-resource-audit-current-'))
  try {
    const catalogPath = join(temporaryRoot, 'catalog.json')
    runNode('scripts/textbooks/build_textbook_resource_catalog.js', [
      '--generated-at', '2026-07-22T00:00:00.000Z',
      '--out', catalogPath
    ])
    const result = runNode('scripts/textbooks/audit_textbook_resource_catalog.js', [
      '--catalog', catalogPath
    ])
    const report = JSON.parse(result.stdout)
    const current = readJson(join(ROOT, 'data/textbooks/library-state/CURRENT.json'))
    assert.equal(report.valid, true)
    assert.equal(
      report.asset_path,
      join(ROOT, 'data/textbooks/library-state/generations', current.generation_id, 'asset_registry.lock.jsonl')
    )
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('registered import survives a default catalog rebuild with its unit mapping', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'kebiao-resource-registry-'))
  try {
    const fixture = structuredClone(fixtures().teacherFixture)
    fixture.resources[0].asset.source_path = '/Users/example/private/teacher-guide.pdf'
    fixture.resources[0].asset.local_path = '/Volumes/X9 Pro/kebiao-library/private.pdf'
    fixture.resources[0].provenance.source_ref = `file://${temporaryRoot}/private-import.json`
    fixture.resources[0].provenance.generated_from = `${temporaryRoot}/teacher-guide.pdf`
    const importManifest = join(temporaryRoot, 'import.json')
    const registryPath = join(temporaryRoot, 'support-resource-registry.json')
    const targetAssetsPath = join(temporaryRoot, 'target-assets.jsonl')
    const catalogPath = join(temporaryRoot, 'support-resource-catalog.json')
    writeFileSync(importManifest, `${JSON.stringify(fixture, null, 2)}\n`)
    writeFileSync(targetAssetsPath, `${JSON.stringify({
      asset_id: 'asset_fixture_student_textbook',
      edition_id: 'ed_9d4028e2ab482520d0aa',
      work_id: 'work_9d4028e2ab482520',
      resource_type: 'student_textbook',
      stage: 'primary',
      subject: '语文',
      subject_slug: 'chinese',
      grade: 5,
      volume: '上册',
      edition_name: '统编版'
    })}\n`)

    runNode('scripts/textbooks/import_textbook_resources.js', [
      '--manifest', importManifest,
      '--register',
      '--registry', registryPath
    ])
    runNode('scripts/textbooks/import_textbook_resources.js', [
      '--manifest', importManifest,
      '--register',
      '--registry', registryPath
    ])
    const registry = readJson(registryPath)
    const validateRegistry = new Ajv2020({ allErrors: true, strict: true })
      .compile(readJson(join(ROOT, 'data/textbooks/catalog/resource_manifest.schema.json')))
    assert.equal(validateRegistry(registry), true, JSON.stringify(validateRegistry.errors, null, 2))
    assert.equal(registry.resources.length, 1)
    assert.equal(registry.resources[0].asset.source_path, null)
    assert.equal(registry.resources[0].asset.local_path, null)
    assert.equal(JSON.stringify(registry).includes(temporaryRoot), false)
    assert.equal(JSON.stringify(registry).includes('/Volumes/X9 Pro'), false)

    // No --manifest is supplied here: the ordinary build must consume the
    // persistent registry and preserve both the book pairing and unit mapping.
    runNode('scripts/textbooks/build_textbook_resource_catalog.js', [
      '--assets', targetAssetsPath,
      '--catalog', 'data/textbooks/catalog/expected_editions.jsonl',
      '--structures', 'data/textbooks/derived/by-edition',
      '--registry', registryPath,
      '--include-current-companions', 'false',
      '--generated-at', '2026-07-22T00:00:00.000Z',
      '--out', catalogPath
    ])
    const catalog = readJson(catalogPath)
    assert.equal(catalog.resources.length, 1)
    assert.equal(catalog.pairings.length, 1)
    assert.equal(catalog.pairings[0].target_edition_id, 'ed_9d4028e2ab482520d0aa')
    assert.equal(catalog.unit_mappings.length, 1)
    assert.equal(catalog.unit_mappings[0].target_unit_id, 'tcu_4689a5d3ae9ee154')
    assert.equal(catalog.unit_mappings[0].method, 'explicit_manifest')
    assert.equal(JSON.stringify(catalog).includes(temporaryRoot), false)
    assert.equal(auditTextbookResourceCatalog(catalog).valid, true)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

function readFileOrNull(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}
