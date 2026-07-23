#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { canonicalJson, sha256, writeJsonLine } from './lib/canonical.mjs'

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || fallback : fallback
}

const generationArg = argument('--generation')
const alignmentsArg = argument('--alignments')
if (!generationArg || !alignmentsArg) throw new Error('--generation and --alignments are required')
const generation = resolve(generationArg)
const alignmentsPath = resolve(alignmentsArg)
const outputRoot = resolve(argument('--output', 'data/learning-resources/library-state/generations'))
const imported = (await readFile(alignmentsPath, 'utf8')).split(/\r?\n/gu).filter(Boolean).map(line => JSON.parse(line))
const startedAt = new Date().toISOString()
const parent = JSON.parse(await readFile(join(generation, 'manifest.json'), 'utf8'))
const generationId = `lrg_${startedAt.replace(/[-:.TZ]/gu, '').slice(0, 14)}_${sha256({
  parent: parent.generation_id,
  alignments: imported
}).slice(0, 8)}`
const output = join(outputRoot, generationId)
await mkdir(output, { recursive: true })
await cp(generation, output, { recursive: true })
const existing = new Map(
  (await readFile(join(output, 'alignments.lock.jsonl'), 'utf8'))
    .split(/\r?\n/gu).filter(Boolean).map(line => JSON.parse(line))
    .map(row => [row.alignment_id, row])
)
for (const alignment of imported) existing.set(alignment.alignment_id, alignment)
const text = [...existing.values()].map(writeJsonLine).join('')
await writeFile(join(output, 'alignments.lock.jsonl'), text)
const manifest = {
  ...parent,
  generation_id: generationId,
  state: 'built',
  derived_from: parent.generation_id,
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  files: {
    ...parent.files,
    'alignments.lock.jsonl': { rows: existing.size, bytes: Buffer.byteLength(text), sha256: sha256(text) }
  }
}
const manifestText = `${canonicalJson(manifest)}\n`
await writeFile(join(output, 'manifest.json'), manifestText)
await writeFile(join(output, 'COMMIT.json'), `${canonicalJson({
  schema_version: '1.0.0',
  generation_id: generationId,
  manifest_sha256: sha256(manifestText),
  committed_at: new Date().toISOString()
})}\n`)
console.log(JSON.stringify({ generation_id: generationId, generation_dir: output, alignments: existing.size }, null, 2))
