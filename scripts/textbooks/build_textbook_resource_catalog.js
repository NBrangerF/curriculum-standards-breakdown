#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs, readJson, readJsonLines, resolveCurrentAssetRegistry, writeJson } from './library_common.js'
import {
  auditTextbookResourceCatalog,
  buildTextbookResourceCatalog,
  mergeResourceManifestInputs,
  resourceInputFromAsset
} from './textbook_resource_pipeline.js'

const PROJECT_ROOT = resolve(import.meta.dirname, '../..')
const DEFAULT_REGISTRY = 'data/textbooks/catalog/support_resource_registry.json'

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
  const assetPath = resolveCurrentAssetRegistry({
    projectRoot: PROJECT_ROOT,
    assets: args.assets,
    current: args.current
  })
  const catalogPath = resolveProjectPath(args.catalog || 'data/textbooks/catalog/expected_editions.jsonl')
  const structureRoot = resolveProjectPath(args.structures || 'data/textbooks/derived/by-edition')
  const outputPath = resolveProjectPath(args.out || 'data/textbooks/catalog/support_resource_catalog.json')
  const assets = readJsonLines(assetPath)
  if (!assets.length) throw new Error(`Textbook asset registry is empty: ${assetPath}`)
  const catalogRows = readJsonLines(catalogPath)
  const catalogByEdition = new Map(catalogRows.map(row => [row.edition_id, row]))
  const structures = loadStructures(structureRoot)
  const targets = assets
    .filter(asset => asset.resource_type === 'student_textbook')
    .map(asset => ({ ...catalogByEdition.get(asset.edition_id), ...asset }))

  const includeCompanions = args.includeCurrentCompanions !== 'false'
  const companionResources = includeCompanions
    ? assets
        .filter(asset => asset.resource_type === 'student_companion')
        .map(asset => resourceInputFromAsset(asset, catalogByEdition.get(asset.edition_id), structures[asset.edition_id]))
    : []
  const manifestMode = args.manifestMode || 'merge'
  if (!['merge', 'replace'].includes(manifestMode)) throw new Error('--manifest-mode must be merge or replace')
  const manifestPaths = cleanList(args.manifest)
  if (manifestMode === 'replace' && !manifestPaths.length) throw new Error('--manifest-mode replace requires --manifest')

  const registryPath = resolveProjectPath(args.registry || DEFAULT_REGISTRY)
  const registeredResources = manifestMode === 'replace'
    ? []
    : readRequiredManifest(registryPath, args.registry ? '--registry' : 'default registry')
  const explicitResources = manifestPaths.map(manifestPath => readManifest(resolveProjectPath(manifestPath)))
  const resources = mergeResourceManifestInputs(
    companionResources,
    registeredResources,
    ...explicitResources
  )

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
  console.log(JSON.stringify({
    output: outputPath,
    asset_registry: assetPath,
    registry: manifestMode === 'replace' ? null : registryPath,
    manifest_mode: manifestMode,
    explicit_manifests: manifestPaths.length,
    ...audit.summary,
    warnings: audit.warnings.length
  }, null, 2))
}

function readRequiredManifest(path, label) {
  if (!existsSync(path)) throw new Error(`Resource ${label} is missing: ${path}`)
  return readManifest(path)
}

function cleanList(value) {
  if (!value) return []
  return String(value).split(',').map(item => item.trim()).filter(Boolean)
}

main()
