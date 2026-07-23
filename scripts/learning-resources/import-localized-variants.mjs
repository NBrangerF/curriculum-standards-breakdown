#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { canonicalJson, sha256, writeJsonLine } from './lib/canonical.mjs'

function parseArgs(argv) {
  const values = {
    generation: '',
    variants: '',
    output: 'data/learning-resources/library-state/generations'
  }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--generation') values.generation = resolve(argv[++index])
    else if (argv[index] === '--variants') values.variants = resolve(argv[++index])
    else if (argv[index] === '--output') values.output = resolve(argv[++index])
  }
  if (!values.generation || !values.variants) throw new Error('--generation and --variants are required')
  return values
}

async function rows(path) {
  return (await readFile(path, 'utf8')).split(/\r?\n/gu).filter(Boolean).map(line => JSON.parse(line))
}

const args = parseArgs(process.argv.slice(2))
const sourceManifest = JSON.parse(await readFile(join(args.generation, 'manifest.json'), 'utf8'))
const startedAt = new Date().toISOString()
const generationId = `lrg_${startedAt.replace(/[-:.TZ]/gu, '').slice(0, 14)}_${sha256({
  parent: sourceManifest.generation_id,
  variants: sha256(await readFile(args.variants, 'utf8'))
}).slice(0, 8)}`
const generation = join(args.output, generationId)
await mkdir(generation, { recursive: true })
await cp(args.generation, generation, { recursive: true })

const jobs = new Map((await rows(join(generation, 'localization-batch.jsonl'))).map(row => [row.fragment_id, row]))
const existing = new Map((await rows(join(generation, 'localized-variants.lock.jsonl'))).map(row => [row.variant_id, row]))
const imported = await rows(args.variants)
const errors = []
const skipped = []
for (const variant of imported) {
  const job = jobs.get(variant.fragment_id)
  if (!job) {
    errors.push(`variant ${variant.variant_id} has no current localization job`)
    continue
  }
  if (job.source_blocks.some(block => /二进制抽取.+才生成正文片段/u.test(block.text))) {
    skipped.push({ variant_id: variant.variant_id, reason: 'metadata_only_placeholder' })
    continue
  }
  if (variant.qa_status !== 'passed') {
    skipped.push({
      variant_id: variant.variant_id,
      reason: `qa_status_${variant.qa_status || 'missing'}`
    })
    continue
  }
  if (
    variant.schema_version !== '1.0.0'
    || variant.target_locale !== 'zh-Hans-CN'
    || variant.source_text_hash !== job.source_text_hash
    || variant.output_license_id !== job.output_license_id
  ) {
    errors.push(`variant ${variant.variant_id} failed schema/hash/license/QA checks`)
    continue
  }
  const sourceIds = new Set(job.source_blocks.map(block => block.source_block_id))
  const mappedIds = new Set(variant.target_blocks.flatMap(block => block.source_block_ids))
  if (sourceIds.size !== mappedIds.size || [...sourceIds].some(id => !mappedIds.has(id))) {
    errors.push(`variant ${variant.variant_id} does not cover every source block`)
    continue
  }
  existing.set(variant.variant_id, variant)
  jobs.delete(variant.fragment_id)
}
if (errors.length) throw new Error(errors.slice(0, 20).join('\n'))
const variantsText = [...existing.values()].map(writeJsonLine).join('')
const jobsText = [...jobs.values()].map(writeJsonLine).join('')
await writeFile(join(generation, 'localized-variants.lock.jsonl'), variantsText)
await writeFile(join(generation, 'localization-batch.jsonl'), jobsText)
const manifestPath = join(generation, 'manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
manifest.generation_id = generationId
manifest.state = 'built'
manifest.derived_from = sourceManifest.generation_id
manifest.started_at = startedAt
manifest.completed_at = new Date().toISOString()
manifest.localization_imported_at = new Date().toISOString()
manifest.files['localized-variants.lock.jsonl'] = {
  rows: existing.size,
  bytes: Buffer.byteLength(variantsText),
  sha256: sha256(variantsText)
}
manifest.files['localization-batch.jsonl'] = {
  rows: jobs.size,
  bytes: Buffer.byteLength(jobsText),
  sha256: sha256(jobsText)
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
const manifestText = await readFile(manifestPath, 'utf8')
await writeFile(join(generation, 'COMMIT.json'), `${canonicalJson({
  schema_version: '1.0.0',
  generation_id: generationId,
  manifest_sha256: sha256(manifestText),
  committed_at: new Date().toISOString()
})}\n`)
console.log(JSON.stringify({
  generation_id: generationId,
  generation_dir: generation,
  imported: imported.length,
  skipped,
  total_variants: existing.size,
  pending_jobs: jobs.size
}, null, 2))
