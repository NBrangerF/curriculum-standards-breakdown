#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { canonicalJson, sha256, writeJsonLine } from './lib/canonical.mjs'

const FILES = [
  'snapshots.lock.jsonl',
  'rights.lock.jsonl',
  'resources.lock.jsonl',
  'fragments.lock.jsonl',
  'localized-variants.lock.jsonl',
  'localization-batch.jsonl',
  'alignments.lock.jsonl'
]

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || '' : ''
}

const generationArg = argument('--generation')
const authoritativeArg = argument('--authoritative')
const sourceId = argument('--source')
if (!generationArg || !authoritativeArg || !sourceId) {
  throw new Error('--generation, --authoritative and --source are required')
}
const generation = resolve(generationArg)
const authoritative = resolve(authoritativeArg)
const outputRoot = resolve(argument('--output') || 'data/learning-resources/library-state/generations')

async function rows(root, name) {
  try {
    return (await readFile(join(root, name), 'utf8'))
      .split(/\r?\n/gu).filter(Boolean).map(line => JSON.parse(line))
  } catch {
    return []
  }
}

const current = Object.fromEntries(await Promise.all(FILES.map(async name => [name, await rows(generation, name)])))
const replacement = Object.fromEntries(await Promise.all(FILES.map(async name => [name, await rows(authoritative, name)])))
const oldSourceResourceIds = new Set(
  current['resources.lock.jsonl'].filter(row => row.source_id === sourceId).map(row => row.resource_id)
)
const authoritativeResources = replacement['resources.lock.jsonl'].filter(row => row.source_id === sourceId)
const authoritativeResourceIds = new Set(authoritativeResources.map(row => row.resource_id))
const authoritativeFragments = replacement['fragments.lock.jsonl']
  .filter(row => authoritativeResourceIds.has(row.resource_id))
const authoritativeFragmentIds = new Set(authoritativeFragments.map(row => row.fragment_id))

const resources = [
  ...current['resources.lock.jsonl'].filter(row => row.source_id !== sourceId),
  ...authoritativeResources
]
const fragments = [
  ...current['fragments.lock.jsonl'].filter(row => !oldSourceResourceIds.has(row.resource_id)),
  ...authoritativeFragments
]
const fragmentIds = new Set(fragments.map(row => row.fragment_id))
const variantById = new Map([
  ...current['localized-variants.lock.jsonl'].filter(row => fragmentIds.has(row.fragment_id)),
  ...replacement['localized-variants.lock.jsonl'].filter(row => authoritativeFragmentIds.has(row.fragment_id))
].map(row => [row.variant_id, row]))
const variants = [...variantById.values()]
const completedFragments = new Set(variants.map(row => row.fragment_id))
const localizationJobs = [
  ...current['localization-batch.jsonl'].filter(row => row.source_id !== sourceId),
  ...replacement['localization-batch.jsonl'].filter(
    row => row.source_id === sourceId
      && authoritativeFragmentIds.has(row.fragment_id)
      && !completedFragments.has(row.fragment_id)
  )
]
const alignments = current['alignments.lock.jsonl'].filter(
  row => fragmentIds.has(row.fragment_id) && resources.some(resource => resource.resource_id === row.resource_id)
)
const rightsProfileIds = new Set(resources.map(row => row.rights_profile_id))
const rights = [
  ...current['rights.lock.jsonl'],
  ...replacement['rights.lock.jsonl']
].filter(row => rightsProfileIds.has(row.rights_profile_id))
const rightsById = new Map(rights.map(row => [row.rights_profile_id, row]))
const snapshots = [
  ...current['snapshots.lock.jsonl'].filter(row => row.source_id !== sourceId),
  ...replacement['snapshots.lock.jsonl'].filter(row => row.source_id === sourceId)
]

const outputRows = {
  'snapshots.lock.jsonl': snapshots,
  'rights.lock.jsonl': [...rightsById.values()],
  'resources.lock.jsonl': resources,
  'fragments.lock.jsonl': fragments,
  'localized-variants.lock.jsonl': variants,
  'localization-batch.jsonl': localizationJobs,
  'alignments.lock.jsonl': alignments
}
const parent = JSON.parse(await readFile(join(generation, 'manifest.json'), 'utf8'))
const authorityManifest = JSON.parse(await readFile(join(authoritative, 'manifest.json'), 'utf8'))
const startedAt = new Date().toISOString()
const generationId = `lrg_${startedAt.replace(/[-:.TZ]/gu, '').slice(0, 14)}_${sha256({
  parent: parent.generation_id,
  authoritative: authorityManifest.generation_id,
  source_id: sourceId
}).slice(0, 8)}`
const output = join(outputRoot, generationId)
await mkdir(output, { recursive: true })
const fileStats = {}
for (const [name, values] of Object.entries(outputRows)) {
  const text = values.map(writeJsonLine).join('')
  await writeFile(join(output, name), text)
  fileStats[name] = { rows: values.length, bytes: Buffer.byteLength(text), sha256: sha256(text) }
}
const manifest = {
  ...parent,
  generation_id: generationId,
  state: 'built',
  derived_from: parent.generation_id,
  source_replacement: {
    source_id: sourceId,
    authoritative_generation_id: authorityManifest.generation_id
  },
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  files: fileStats
}
const manifestText = `${canonicalJson(manifest)}\n`
await writeFile(join(output, 'manifest.json'), manifestText)
await writeFile(join(output, 'COMMIT.json'), `${canonicalJson({
  schema_version: '1.0.0',
  generation_id: generationId,
  manifest_sha256: sha256(manifestText),
  committed_at: new Date().toISOString()
})}\n`)
console.log(JSON.stringify({
  generation_id: generationId,
  generation_dir: output,
  source_id: sourceId,
  removed_resources: oldSourceResourceIds.size,
  authoritative_resources: authoritativeResourceIds.size,
  authoritative_fragments: authoritativeFragmentIds.size,
  files: fileStats
}, null, 2))
