#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { canonicalJson, sha256 } from './lib/canonical.mjs'

const generationIndex = process.argv.indexOf('--generation')
if (generationIndex < 0 || !process.argv[generationIndex + 1]) throw new Error('--generation is required')
const generation = resolve(process.argv[generationIndex + 1])
const readRows = async name => {
  try {
    return (await readFile(join(generation, name), 'utf8')).split(/\r?\n/gu).filter(Boolean).map(line => JSON.parse(line))
  } catch {
    return []
  }
}
const [resources, fragments, rights, variants, alignments] = await Promise.all([
  readRows('resources.lock.jsonl'),
  readRows('fragments.lock.jsonl'),
  readRows('rights.lock.jsonl'),
  readRows('localized-variants.lock.jsonl'),
  readRows('alignments.lock.jsonl')
])
const fragmentsById = new Map(fragments.map(row => [row.fragment_id, row]))
const resourcesById = new Map(resources.map(row => [row.resource_id, row]))
const rightsById = new Map(rights.map(row => [row.rights_profile_id, row]))
const errors = []
const publicSourceCounts = new Map()
for (const variant of variants) {
  const fragment = fragmentsById.get(variant.fragment_id)
  const resource = fragment && resourcesById.get(fragment.resource_id)
  const right = resource && rightsById.get(resource.rights_profile_id)
  if (!fragment || !resource || !right) errors.push(`orphan variant ${variant.variant_id}`)
  if (variant.target_locale !== 'zh-Hans-CN' || variant.qa_status !== 'passed') errors.push(`non-public variant ${variant.variant_id}`)
  if (fragment && variant.source_text_hash !== fragment.source_text_hash) errors.push(`stale variant ${variant.variant_id}`)
  if (!['publish_translation', 'publish_translation_share_alike'].includes(right?.public_decision)) {
    errors.push(`blocked rights ${variant.variant_id}`)
  }
  if (resource) {
    publicSourceCounts.set(resource.source_id, (publicSourceCounts.get(resource.source_id) || 0) + 1)
  }
}
for (const alignment of alignments) {
  const fragment = fragmentsById.get(alignment.fragment_id)
  const variant = variants.find(row => row.variant_version_id === alignment.variant_version_id)
  if (!fragment || !variant || !variant.target_blocks.some(block => block.canonical_plain_text.includes(alignment.evidence_quote_zh))) {
    errors.push(`invalid alignment evidence ${alignment.alignment_id}`)
  }
}
const registry = JSON.parse(await readFile(resolve('data/learning-resources/source_registry.json'), 'utf8'))
for (const source of registry.sources.filter(source => source.enabled)) {
  if (!publicSourceCounts.has(source.source_id)) errors.push(`enabled source has no public Simplified Chinese variant: ${source.source_id}`)
}
const report = {
  schema_version: '1.0.0',
  generation_id: JSON.parse(await readFile(join(generation, 'manifest.json'), 'utf8')).generation_id,
  audited_at: new Date().toISOString(),
  status: errors.length ? 'failed' : 'eligible',
  counts: {
    resources: resources.length,
    fragments: fragments.length,
    rights: rights.length,
    variants: variants.length,
    alignments: alignments.length
  },
  public_variants_by_source: Object.fromEntries([...publicSourceCounts].sort(([left], [right]) => left.localeCompare(right))),
  public_ready_resources: new Set(variants.map(row => fragmentsById.get(row.fragment_id)?.resource_id).filter(Boolean)).size,
  errors
}
await writeFile(join(generation, 'audit-report.json'), `${JSON.stringify(report, null, 2)}\n`)
const manifestPath = join(generation, 'manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
manifest.state = errors.length ? 'evaluated' : 'eligible'
manifest.audit_status = report.status
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
await writeFile(manifestPath, manifestText)
await writeFile(join(generation, 'COMMIT.json'), `${canonicalJson({
  schema_version: '1.0.0',
  generation_id: manifest.generation_id,
  manifest_sha256: sha256(manifestText),
  committed_at: new Date().toISOString()
})}\n`)
console.log(JSON.stringify(report, null, 2))
if (errors.length) process.exitCode = 1
