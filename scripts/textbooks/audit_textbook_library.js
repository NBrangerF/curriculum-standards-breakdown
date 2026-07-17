#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs, readJson, readJsonLines, writeJson } from './library_common.js'
import { doctorLibrary } from './library_storage.js'
import { sha256FileChunked, verifyPdf } from './verify_textbook_asset.js'

const args = parseArgs(process.argv.slice(2))
const doctor = doctorLibrary({ libraryRoot: args.libraryRoot, envFile: args.envFile })
const currentPath = args.current || 'data/textbooks/library-state/CURRENT.json'
const errors = []
if (!existsSync(currentPath)) errors.push('CURRENT.json missing')
let rows = []
let coverage = null
let generationId = null
if (!errors.length) {
  const current = readJson(currentPath)
  generationId = current.generation_id
  const trackedDir = join(args.stateRoot || 'data/textbooks/library-state/generations', generationId)
  const x9Dir = join(doctor.root, 'state/generations', generationId)
  const commit = readJson(join(trackedDir, 'COMMIT.json'))
  const trackedRegistry = join(trackedDir, 'asset_registry.lock.jsonl')
  const x9Registry = join(x9Dir, 'asset_manifest.jsonl')
  const trackedCoverage = join(trackedDir, 'coverage.snapshot.json')
  if (!existsSync(x9Registry)) errors.push('X9 generation manifest missing')
  else if (sha256FileChunked(x9Registry) !== commit.registry_sha256) errors.push('X9 registry hash mismatch')
  if (!existsSync(trackedRegistry) || sha256FileChunked(trackedRegistry) !== commit.registry_sha256) errors.push('tracked registry hash mismatch')
  if (!existsSync(trackedCoverage) || sha256FileChunked(trackedCoverage) !== commit.coverage_sha256) errors.push('coverage hash mismatch')
  if (!errors.length) {
    rows = readJsonLines(trackedRegistry)
    coverage = readJson(trackedCoverage)
    for (const row of rows) {
      const objectPath = join(doctor.root, row.object_path)
      if (!existsSync(objectPath)) { errors.push(`missing object ${row.sha256}`); continue }
      const verification = verifyPdf(objectPath, { expectedGitObject: row.git_object })
      if (!verification.valid) errors.push(`invalid object ${row.sha256}: ${verification.errors.join(',')}`)
      if (verification.sha256 !== row.sha256) errors.push(`sha256 mismatch ${row.sha256}`)
    }
  }
}
const report = { valid: errors.length === 0, generation_id: generationId, asset_count: rows.length, coverage, errors, writer_lease_present: existsSync(doctor.writer_lease_path) }
writeJson(args.out || 'generated/textbook_library/library_audit.json', report)
console.log(JSON.stringify(report, null, 2))
if (!report.valid || args.strict && errors.length) process.exit(1)
