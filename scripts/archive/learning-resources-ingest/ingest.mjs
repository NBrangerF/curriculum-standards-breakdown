#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { createConnector } from './connectors/index.mjs'
import { canonicalJson, sha256, stableId, writeJsonLine } from './lib/canonical.mjs'

function args(argv) {
  const values = {
    source: 'all',
    limit: 30,
    output: 'data/learning-resources/library-state/generations',
    strict: false,
    oakFixture: ''
  }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--source') values.source = argv[++index]
    else if (value === '--limit') values.limit = Math.max(1, Number(argv[++index]))
    else if (value === '--output') values.output = argv[++index]
    else if (value === '--oak-fixture') values.oakFixture = argv[++index]
    else if (value === '--strict') values.strict = true
    else if (value === '--help') {
      console.log('Usage: node scripts/learning-resources/ingest.mjs [--source all|id,id] [--limit N] [--oak-fixture path] [--output dir] [--strict]')
      process.exit(0)
    }
  }
  if (!Number.isFinite(values.limit)) throw new Error('--limit must be a positive number')
  return values
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function localizationJob(item, fragment) {
  return {
    schema_version: '1.0.0',
    producer: 'kebiao-learning-resource-ingest',
    producer_version: '1.0.0',
    min_consumer_version: '1.0.0',
    resource_id: item.resource.resource_id,
    resource_version_id: item.resource.resource_version_id,
    fragment_id: fragment.fragment_id,
    source_id: item.resource.source_id,
    source_language: item.resource.source_language,
    target_locale: 'zh-Hans-CN',
    title_source: item.resource.title_source,
    source_text_hash: fragment.source_text_hash,
    source_blocks: fragment.blocks.map(block => ({
      source_block_id: block.source_block_id,
      type: block.type,
      text: block.text,
      source_hash: block.source_hash
    })),
    rights_profile_id: item.rights.rights_profile_id,
    output_license_id: item.rights.license_id,
    output_license_url: item.rights.license_url,
    attribution_text: item.rights.attribution_text
  }
}

function identityVariant(item, fragment) {
  const variantId = stableId('lrz', fragment.fragment_id, 'zh-Hans-CN')
  const targetBlocks = fragment.blocks.map(block => ({
    target_block_id: stableId('lrtb', variantId, block.source_block_id),
    source_block_ids: [block.source_block_id],
    mapping_mode: 'one_to_one',
    target_block_hash: sha256(block.text),
    type: block.type,
    canonical_plain_text: block.text,
    ...(block.items ? { items: block.items } : {}),
    ...(block.rows ? { rows: block.rows } : {})
  }))
  const targetTextHash = sha256(targetBlocks.map(block => block.canonical_plain_text).join('\n\n'))
  const producerPayload = {
    source_text_hash: fragment.source_text_hash,
    target_blocks: targetBlocks.map(block => [block.target_block_id, block.target_block_hash]),
    pipeline_version: 'identity-zh-hans-v1'
  }
  return {
    schema_version: '1.0.0',
    variant_id: variantId,
    variant_version_id: stableId('lrzv', variantId, producerPayload),
    fragment_id: fragment.fragment_id,
    source_text_hash: fragment.source_text_hash,
    target_locale: 'zh-Hans-CN',
    title_zh: item.resource.title_source,
    description_zh: '',
    target_blocks: targetBlocks,
    target_text_hash: targetTextHash,
    translation_method: 'source_zh_hans',
    model_version: 'none',
    prompt_version: 'identity-zh-hans-v1',
    glossary_version: 'none',
    translation_memory_version: 'none',
    opencc_config: 'tw2sp',
    rights_decision_id: item.rights.rights_profile_id,
    output_license_id: item.rights.license_id,
    output_license_url: item.rights.license_url,
    adaptation_notice: `原文为简体中文；由 kebiao 完成结构化整理。${item.rights.attribution_text}`,
    attribution_snapshot_hash: sha256(item.rights.attribution_text),
    qa_status: 'passed',
    qa_findings: []
  }
}

const options = args(process.argv.slice(2))
const registryPath = resolve('data/learning-resources/source_registry.json')
const registry = await readJson(registryPath)
const selected = new Set(options.source === 'all' ? [] : options.source.split(',').map(value => value.trim()))
const sources = registry.sources.filter(source => source.enabled && (!selected.size || selected.has(source.source_id)))
if (!sources.length) throw new Error(`No enabled sources match --source ${options.source}`)

const startedAt = new Date().toISOString()
const generationId = `lrg_${startedAt.replace(/[-:.TZ]/gu, '').slice(0, 14)}_${sha256({
  registry: registry.schema_version,
  sources: sources.map(source => source.source_id),
  limit: options.limit
}).slice(0, 8)}`
const generationDir = resolve(options.output, generationId)
await mkdir(generationDir, { recursive: true })

const rows = {
  snapshots: [],
  rights: [],
  resources: [],
  fragments: [],
  variants: [],
  localizationJobs: []
}
const sourceReports = []

for (const source of sources) {
  const connector = createConnector(source, {
    limit: options.limit,
    repoLimit: options.limit,
    strict: options.strict,
    fixture: source.source_id === 'oak' && options.oakFixture ? resolve(options.oakFixture) : ''
  })
  const sourceStarted = Date.now()
  try {
    const run = await connector.run()
    for (const item of run.items) {
      rows.snapshots.push(item.snapshot)
      rows.rights.push(item.rights)
      rows.resources.push(item.resource)
      rows.fragments.push(...item.fragments)
      for (const fragment of item.fragments) {
        if (/^zh(?:-|_)?(?:hans|cn)/iu.test(item.resource.source_language)) {
          rows.variants.push(identityVariant(item, fragment))
        } else {
          rows.localizationJobs.push(localizationJob(item, fragment))
        }
      }
    }
    sourceReports.push({
      source_id: source.source_id,
      status: 'completed',
      revision: run.revision,
      resource_count: run.items.length,
      fragment_count: run.items.reduce((sum, item) => sum + item.fragments.length, 0),
      elapsed_ms: Date.now() - sourceStarted
    })
  } catch (error) {
    sourceReports.push({
      source_id: source.source_id,
      status: 'failed',
      error: String(error?.message || error),
      resource_count: 0,
      fragment_count: 0,
      elapsed_ms: Date.now() - sourceStarted
    })
    if (options.strict) throw error
  }
}

for (const [name, values] of Object.entries({
  'snapshots.lock.jsonl': rows.snapshots,
  'rights.lock.jsonl': rows.rights,
  'resources.lock.jsonl': rows.resources,
  'fragments.lock.jsonl': rows.fragments,
  'localized-variants.lock.jsonl': rows.variants,
  'localization-batch.jsonl': rows.localizationJobs
})) {
  await writeFile(join(generationDir, name), values.map(writeJsonLine).join(''), 'utf8')
}

const manifest = {
  schema_version: '1.0.0',
  generation_id: generationId,
  state: 'built',
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  deployment_rights_mode: 'public_commercial',
  registry_path: registryPath,
  registry_hash: sha256(registry),
  source_reports: sourceReports,
  counts: Object.fromEntries(Object.entries(rows).map(([key, value]) => [key, value.length])),
  files: {}
}
for (const name of [
  'snapshots.lock.jsonl',
  'rights.lock.jsonl',
  'resources.lock.jsonl',
  'fragments.lock.jsonl',
  'localized-variants.lock.jsonl',
  'localization-batch.jsonl'
]) {
  const text = await readFile(join(generationDir, name), 'utf8')
  manifest.files[name] = { sha256: sha256(text), bytes: Buffer.byteLength(text), rows: text ? text.trimEnd().split('\n').length : 0 }
}
const manifestText = `${canonicalJson(manifest)}\n`
await writeFile(join(generationDir, 'manifest.json'), manifestText, 'utf8')
await writeFile(join(generationDir, 'COMMIT.json'), `${canonicalJson({
  schema_version: '1.0.0',
  generation_id: generationId,
  manifest_sha256: sha256(manifestText),
  committed_at: new Date().toISOString()
})}\n`, 'utf8')

console.log(JSON.stringify({
  generation_id: generationId,
  generation_dir: generationDir,
  sources: sourceReports,
  counts: manifest.counts,
  localization_batch: join(generationDir, 'localization-batch.jsonl')
}, null, 2))

