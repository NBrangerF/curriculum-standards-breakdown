#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { canonicalJson, sha256, writeJsonLine } from './lib/canonical.mjs'

const FILES = {
  'snapshots.lock.jsonl': 'snapshot_id',
  'rights.lock.jsonl': 'rights_profile_id',
  'resources.lock.jsonl': 'resource_id',
  'fragments.lock.jsonl': 'fragment_id',
  'localized-variants.lock.jsonl': 'variant_id',
  'localization-batch.jsonl': 'fragment_id',
  'alignments.lock.jsonl': 'alignment_id'
}

function parseArgs(argv) {
  const values = { inputs: [], output: 'data/learning-resources/library-state/generations' }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input') values.inputs.push(resolve(argv[++index]))
    else if (argv[index] === '--output') values.output = argv[++index]
  }
  if (values.inputs.length < 1) throw new Error('At least one --input generation directory is required')
  return values
}

async function readJsonLines(path) {
  try {
    return (await readFile(path, 'utf8')).split(/\r?\n/gu).filter(Boolean).map(line => JSON.parse(line))
  } catch {
    return []
  }
}

const args = parseArgs(process.argv.slice(2))
const merged = Object.fromEntries(Object.keys(FILES).map(name => [name, new Map()]))
for (const input of args.inputs) {
  for (const [name, idField] of Object.entries(FILES)) {
    for (const row of await readJsonLines(join(input, name))) merged[name].set(row[idField], row)
  }
}

const completedFragments = new Set([...merged['localized-variants.lock.jsonl'].values()].map(row => row.fragment_id))
for (const fragmentId of completedFragments) merged['localization-batch.jsonl'].delete(fragmentId)

const startedAt = new Date().toISOString()
const generationId = `lrg_${startedAt.replace(/[-:.TZ]/gu, '').slice(0, 14)}_${sha256(args.inputs).slice(0, 8)}`
const generationDir = resolve(args.output, generationId)
await mkdir(generationDir, { recursive: true })
const fileStats = {}
for (const name of Object.keys(FILES)) {
  const rows = [...merged[name].values()]
  const text = rows.map(writeJsonLine).join('')
  await writeFile(join(generationDir, name), text, 'utf8')
  fileStats[name] = { rows: rows.length, bytes: Buffer.byteLength(text), sha256: sha256(text) }
}
const manifest = {
  schema_version: '1.0.0',
  generation_id: generationId,
  state: 'built',
  deployment_rights_mode: 'public_commercial',
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  merged_from: args.inputs,
  files: fileStats
}
const manifestText = `${canonicalJson(manifest)}\n`
await writeFile(join(generationDir, 'manifest.json'), manifestText)
await writeFile(join(generationDir, 'COMMIT.json'), `${canonicalJson({
  schema_version: '1.0.0',
  generation_id: generationId,
  manifest_sha256: sha256(manifestText),
  committed_at: new Date().toISOString()
})}\n`)
console.log(JSON.stringify({ generation_id: generationId, generation_dir: generationDir, files: fileStats }, null, 2))

