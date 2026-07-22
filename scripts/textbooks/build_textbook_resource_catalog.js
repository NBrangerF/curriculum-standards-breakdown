#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs, readJson, readJsonLines, writeJson } from './library_common.js'
import {
  auditTextbookResourceCatalog,
  buildTextbookResourceCatalog,
  resourceInputFromAsset
} from './textbook_resource_pipeline.js'

const PROJECT_ROOT = resolve(import.meta.dirname, '../..')

function resolveProjectPath(value) {
  return resolve(PROJECT_ROOT, value)
}

function readManifest(path) {
  const source = readFileSync(path, 'utf8')
  if (path.endsWith('.jsonl')) return source.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
  const payload = JSON.parse(source)
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.resources)) return payload.resources
  throw new Error(`Resource manifest must be an array or contain resources[]: ${path}`)
}

function loadStructures(root) {
  if (!existsSync(root)) return {}
  return Object.fromEntries(readdirSync(root)
    .filter(name => /^ed_[a-z0-9]+\.json$/i.test(name))
    .map(name => {
      const structure = readJson(join(root, name))
      return [structure.edition_id, structure]
    }))
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const assetPath = resolveProjectPath(args.assets || 'generated/textbook_library/asset_manifest.jsonl')
  const catalogPath = resolveProjectPath(args.catalog || 'data/textbooks/catalog/expected_editions.jsonl')
  const structureRoot = resolveProjectPath(args.structures || 'data/textbooks/derived/by-edition')
  const outputPath = resolveProjectPath(args.out || 'data/textbooks/catalog/support_resource_catalog.json')
  const assets = readJsonLines(assetPath)
  const catalogRows = readJsonLines(catalogPath)
  const catalogByEdition = new Map(catalogRows.map(row => [row.edition_id, row]))
  const structures = loadStructures(structureRoot)
  const targets = assets
    .filter(asset => asset.resource_type === 'student_textbook')
    .map(asset => ({ ...catalogByEdition.get(asset.edition_id), ...asset }))

  const includeCompanions = args.includeCurrentCompanions !== 'false'
  const resources = includeCompanions
    ? assets
        .filter(asset => asset.resource_type === 'student_companion')
        .map(asset => resourceInputFromAsset(asset, catalogByEdition.get(asset.edition_id), structures[asset.edition_id]))
    : []
  const manifestPaths = cleanList(args.manifest)
  for (const manifestPath of manifestPaths) resources.push(...readManifest(resolveProjectPath(manifestPath)))

  const result = buildTextbookResourceCatalog({
    resources,
    targets,
    structures,
    generatedAt: args.generatedAt || new Date().toISOString()
  })
  const audit = auditTextbookResourceCatalog(result)
  if (!audit.valid) {
    console.error(JSON.stringify(audit, null, 2))
    process.exit(1)
  }
  writeJson(outputPath, result)
  console.log(JSON.stringify({ output: outputPath, ...audit.summary, warnings: audit.warnings.length }, null, 2))
}

function cleanList(value) {
  if (!value) return []
  return String(value).split(',').map(item => item.trim()).filter(Boolean)
}

main()
