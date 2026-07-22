import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isReadableSupportResource,
  readableSupportResourceIds,
  redactSupportResourceCatalogForPublic
} from '../scripts/textbooks/support_resource_readability.js'

const SHA = 'a'.repeat(64)

function resource(asset = {}) {
  return {
    resource_id: 'res_fixture',
    edition_id: 'ed_fixture_resource',
    asset: {
      asset_id: 'asset_fixture',
      availability: 'available',
      media_type: 'application/pdf',
      sha256: SHA,
      bytes: 1024,
      pages: 8,
      object_path: `objects/sha256/aa/${SHA}.pdf`,
      ...asset
    }
  }
}

test('support resource readability requires a complete content-addressed PDF asset', () => {
  assert.equal(isReadableSupportResource(resource()), true)
  assert.equal(isReadableSupportResource(resource({ r2_bucket: 'kebiao-textbooks', r2_key: `objects/sha256/aa/${SHA}.pdf` })), true)
  assert.equal(isReadableSupportResource(resource({ availability: 'manifest_only' })), false)
  assert.equal(isReadableSupportResource(resource({ pages: null })), false)
  assert.equal(isReadableSupportResource(resource({ object_path: 'teacher-guides/arbitrary.pdf' })), false)
  assert.equal(isReadableSupportResource(resource({ r2_key: 'teacher-guides/arbitrary.pdf' })), false)
  assert.equal(isReadableSupportResource(resource({ r2_bucket: 'another-bucket', r2_key: `objects/sha256/aa/${SHA}.pdf` })), false)
  assert.equal(isReadableSupportResource(
    resource({ r2_bucket: 'private-configured-bucket', r2_key: `objects/sha256/aa/${SHA}.pdf` }),
    { r2Bucket: 'private-configured-bucket' }
  ), true)
  assert.equal(isReadableSupportResource(resource({ sha256: 'not-a-hash' })), false)
})

test('readability is keyed by support resource identity rather than a shared edition id', () => {
  const readable = resource()
  const metadataOnly = {
    ...resource({ availability: 'manifest_only' }),
    resource_id: 'res_metadataonly'
  }
  assert.deepEqual([...readableSupportResourceIds({ resources: [readable, metadataOnly] })], ['res_fixture'])
})

test('public resource projection removes hashes, storage paths and provenance locators', () => {
  const privateResource = {
    ...resource({
      source_path: '/Volumes/X9 Pro/private.pdf',
      local_path: '/Volumes/X9 Pro/library/private.pdf',
      r2_bucket: 'private-bucket',
      r2_key: `objects/sha256/aa/${SHA}.pdf`
    }),
    provenance: {
      source_kind: 'manual_import',
      source_ref: '/private/manifest.json',
      generated_from: `objects/sha256/aa/${SHA}.pdf`
    }
  }
  const catalog = { schema_version: 1, resources: [privateResource] }
  const projected = redactSupportResourceCatalogForPublic(catalog)
  assert.equal(projected.resources[0].asset.sha256, null)
  assert.equal(projected.resources[0].asset.object_path, null)
  assert.equal(projected.resources[0].asset.r2_key, null)
  assert.equal(projected.resources[0].asset.r2_bucket, null)
  assert.equal(projected.resources[0].asset.source_path, null)
  assert.equal(projected.resources[0].asset.local_path, null)
  assert.equal(projected.resources[0].provenance.source_ref, null)
  assert.equal(projected.resources[0].provenance.generated_from, null)
  assert.equal(privateResource.asset.sha256, SHA, 'projection must not mutate the private catalog')
  assert.doesNotMatch(JSON.stringify(projected), /X9 Pro|private-bucket|objects\/sha256|\/private\/manifest|a{64}/)
})
