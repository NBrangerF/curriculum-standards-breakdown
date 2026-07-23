import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { normalizeCandidate, splitStoryMarkdown } from '../scripts/learning-resources/connectors/base.mjs'
import { OakConnector } from '../scripts/learning-resources/connectors/oak.mjs'

const source = {
  source_id: 'fixture',
  name: 'Fixture',
  connector: 'fixture',
  default_language: 'en',
  default_license_id: 'CC-BY-4.0',
  retention_policy: 'retain_canonical_text'
}

test('normalizer creates deterministic resource and fragment identities', () => {
  const candidate = {
    upstream_id: 'story-1',
    canonical_url: 'https://example.test/story-1',
    title: 'Story one',
    source_language: 'en',
    resource_type: 'story',
    mapped_subject_slugs: ['chinese'],
    pedagogical_roles: ['model'],
    license_id: 'CC-BY-4.0',
    blocks: [{
      source_block_id: 'source-block-1',
      type: 'paragraph',
      text: 'A short story.',
      source_hash: 'f'.repeat(64)
    }]
  }
  const first = normalizeCandidate(candidate, { source, revision: 'abc', retrievedAt: '2026-07-23T00:00:00.000Z' })
  const second = normalizeCandidate(candidate, { source, revision: 'abc', retrievedAt: '2026-07-24T00:00:00.000Z' })
  assert.equal(first.resource.resource_id, second.resource.resource_id)
  assert.equal(first.resource.resource_version_id, second.resource.resource_version_id)
  assert.equal(first.fragments[0].fragment_id, second.fragments[0].fragment_id)
  assert.notEqual(first.snapshot.retrieved_at, second.snapshot.retrieved_at)
})

test('story splitter preserves ordered page fragments', () => {
  const fragments = splitStoryMarkdown('# Title\n\n##\nFirst page.\n\n##\nSecond page.', { locator: 'story.md' })
  assert.equal(fragments.length, 3)
  assert.deepEqual(fragments.map(value => value.order), [0, 1, 2])
  assert.equal(fragments[1].blocks[0].text, 'First page.')
})

test('Oak fixture connector converts lessons without an API key', async () => {
  const fixture = resolve('tests/fixtures/learning-resources/oak-bulk.sample.json')
  const payload = JSON.parse(await readFile('data/learning-resources/source_registry.json', 'utf8'))
  const oak = payload.sources.find(value => value.source_id === 'oak')
  const result = await new OakConnector(oak, { fixture, limit: 10 }).run()
  assert.equal(result.items.length, 2)
  assert.deepEqual(result.items[0].resource.mapped_subject_slugs, ['math'])
  assert.ok(result.items[0].fragments[0].source_text.includes('place value'))
  assert.equal(result.items[1].resource.resource_type, 'lesson')
})

