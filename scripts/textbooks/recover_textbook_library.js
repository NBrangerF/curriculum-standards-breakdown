#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs, readJson, readJsonLines } from './library_common.js'
import { doctorLibrary } from './library_storage.js'
import { sha256FileChunked } from './verify_textbook_asset.js'

function listDirs(path) {
  if (!existsSync(path)) return []
  return readdirSync(path, { withFileTypes: true }).filter(item => item.isDirectory() && !item.name.startsWith('.')).map(item => item.name).sort()
}

function verifyGeneration(dir, registryName) {
  try {
    const commit = readJson(join(dir, 'COMMIT.json'))
    const registry = join(dir, registryName)
    const coverage = join(dir, 'coverage.snapshot.json')
    return { valid: existsSync(registry) && existsSync(coverage) && sha256FileChunked(registry) === commit.registry_sha256 && sha256FileChunked(coverage) === commit.coverage_sha256, commit }
  } catch (error) { return { valid: false, error: error.message } }
}

function findParts(root) {
  const results = []
  for (const subdir of ['staging/downloads', 'staging/fragments']) {
    const dir = join(root, subdir)
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir).filter(name => !name.startsWith('.') && name.includes('.part'))) results.push(`${subdir}/${name}`)
  }
  return results
}

const args = parseArgs(process.argv.slice(2))
const doctor = doctorLibrary({ libraryRoot: args.libraryRoot, envFile: args.envFile })
const root = doctor.root
const trackedRoot = args.stateRoot || 'data/textbooks/library-state/generations'
const x9Names = new Set(listDirs(join(root, 'state/generations')))
const trackedNames = new Set(listDirs(trackedRoot))
const allNames = [...new Set([...x9Names, ...trackedNames])].sort()
const generations = allNames.map(id => {
  const x9 = x9Names.has(id) ? verifyGeneration(join(root, 'state/generations', id), 'asset_manifest.jsonl') : { valid: false, error: 'missing_x9' }
  const tracked = trackedNames.has(id) ? verifyGeneration(join(trackedRoot, id), 'asset_registry.lock.jsonl') : { valid: false, error: 'missing_tracked' }
  return { generation_id: id, x9, tracked, complete: x9.valid && tracked.valid && x9.commit.generation_id === tracked.commit.generation_id && x9.commit.registry_sha256 === tracked.commit.registry_sha256 && x9.commit.coverage_sha256 === tracked.commit.coverage_sha256 }
})
const currentPath = args.current || 'data/textbooks/library-state/CURRENT.json'
const current = existsSync(currentPath) ? readJson(currentPath) : null
const currentGeneration = current ? generations.find(item => item.generation_id === current.generation_id) : null
const report = {
  valid: !current || Boolean(currentGeneration?.complete),
  current,
  current_complete: current ? Boolean(currentGeneration?.complete) : null,
  complete_generations: generations.filter(item => item.complete).map(item => item.generation_id),
  incomplete_generations: generations.filter(item => !item.complete).map(item => item.generation_id),
  stale_parts: findParts(root),
  writer_lease_present: existsSync(doctor.writer_lease_path),
  generations
}
console.log(JSON.stringify(report, null, 2))
if (args.strict && !report.valid) process.exit(1)
