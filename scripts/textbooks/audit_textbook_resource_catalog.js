#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs, readJson, readJsonLines, resolveCurrentAssetRegistry, writeJson } from './library_common.js'
import { DEFAULT_SUPPORT_RESOURCE_BUCKET, auditTextbookResourceCatalog } from './textbook_resource_pipeline.js'

const PROJECT_ROOT = resolve(import.meta.dirname, '../..')
const atRoot = value => resolve(PROJECT_ROOT, value)

function main() {
  const args = parseArgs(process.argv.slice(2))
  const catalogPath = atRoot(args.catalog || 'data/textbooks/catalog/support_resource_catalog.json')
  const assetPath = resolveCurrentAssetRegistry({
    projectRoot: PROJECT_ROOT,
    assets: args.assets,
    current: args.current
  })
  const structureRoot = atRoot(args.structures || 'data/textbooks/derived/by-edition')
  const r2Bucket = String(args.r2Bucket || process.env.TEXTBOOK_ASSET_BUCKET || DEFAULT_SUPPORT_RESOURCE_BUCKET).trim()
  if (!r2Bucket) throw new Error('configured R2 bucket must not be empty')
  const catalog = readJson(catalogPath)
  const audit = auditTextbookResourceCatalog(catalog, { r2Bucket })
  const errors = [...audit.errors]
  const assets = existsSync(assetPath) ? readJsonLines(assetPath) : []
  const assetEditions = new Set(assets.filter(asset => asset.resource_type === 'student_textbook').map(asset => asset.edition_id))

  for (const pairing of catalog.pairings || []) {
    if (pairing.target_edition_id && !assetEditions.has(pairing.target_edition_id)) {
      errors.push(`pairing target is not a current student textbook asset: ${pairing.relation_id}`)
    }
  }
  for (const mapping of catalog.unit_mappings || []) {
    const structurePath = join(structureRoot, `${mapping.target_edition_id}.json`)
    if (!existsSync(structurePath)) {
      errors.push(`mapping target structure is missing: ${mapping.mapping_id}`)
      continue
    }
    const structure = readJson(structurePath)
    if (!(structure.toc || []).some(unit => unit.entry_id === mapping.target_unit_id)) {
      errors.push(`mapping target unit is missing: ${mapping.mapping_id}`)
    }
  }

  const report = {
    ...audit,
    valid: errors.length === 0,
    errors,
    checked_at: new Date().toISOString(),
    catalog_path: catalogPath,
    asset_path: assetPath,
    structure_root: structureRoot
  }
  if (args.out) writeJson(atRoot(args.out), report)
  console.log(JSON.stringify(report, null, 2))
  if (!report.valid) process.exit(1)
}

main()
