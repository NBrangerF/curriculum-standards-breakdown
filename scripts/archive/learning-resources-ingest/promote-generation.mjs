#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { sha256 } from './lib/canonical.mjs'

const generationIndex = process.argv.indexOf('--generation')
if (generationIndex < 0 || !process.argv[generationIndex + 1]) throw new Error('--generation is required')
const generation = resolve(process.argv[generationIndex + 1])
const dryRun = process.argv.includes('--dry-run')
const manifestText = await readFile(join(generation, 'manifest.json'), 'utf8')
const manifest = JSON.parse(manifestText)
if (manifest.state !== 'eligible' || manifest.audit_status !== 'eligible') {
  throw new Error(`Generation ${manifest.generation_id || basename(generation)} is not eligible`)
}
const currentPath = resolve('data/learning-resources/library-state/CURRENT.json')
const next = {
  schema_version: '1.0.0',
  generation_id: manifest.generation_id,
  state: 'current',
  deployment_rights_mode: manifest.deployment_rights_mode,
  manifest_hash: sha256(manifestText),
  updated_at: new Date().toISOString()
}
console.log(JSON.stringify({ dry_run: dryRun, current_path: currentPath, next }, null, 2))
if (!dryRun) await writeFile(currentPath, `${JSON.stringify(next, null, 2)}\n`)
