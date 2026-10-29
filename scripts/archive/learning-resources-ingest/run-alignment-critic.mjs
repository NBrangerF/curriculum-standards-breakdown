#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { sha256, writeJsonLine } from './lib/canonical.mjs'

const generation = resolve(process.argv[process.argv.indexOf('--generation') + 1] || '')
const proposalsPath = resolve(process.argv[process.argv.indexOf('--proposals') + 1] || '')
const outputPath = resolve(process.argv[process.argv.indexOf('--output') + 1] || '')
if (!generation || !proposalsPath || !outputPath) throw new Error('--generation, --proposals and --output are required')
const rows = name => readFileSync(join(generation, name), 'utf8').split(/\r?\n/gu).filter(Boolean).map(line => JSON.parse(line))
const fragments = new Map(rows('fragments.lock.jsonl').map(row => [row.fragment_id, row]))
const variants = new Map(rows('localized-variants.lock.jsonl').map(row => [row.variant_version_id, row]))
const proposals = readFileSync(proposalsPath, 'utf8').split(/\r?\n/gu).filter(Boolean).map(line => JSON.parse(line))
const eligible = []
const rejected = []
for (const alignment of proposals) {
  const fragment = fragments.get(alignment.fragment_id)
  const variant = variants.get(alignment.variant_version_id)
  const block = variant?.target_blocks.find(item => alignment.target_block_ids.includes(item.target_block_id))
  const valid = Boolean(
    fragment
    && variant
    && variant.qa_status === 'passed'
    && fragment.source_text_hash === alignment.source_text_hash
    && variant.target_text_hash === alignment.target_text_hash
    && block?.canonical_plain_text.includes(alignment.evidence_quote_zh)
    && alignment.learning_component_ids.length
  )
  if (!valid) {
    rejected.push({ alignment_id: alignment.alignment_id, reason: 'hash_quote_or_component_invariant_failed' })
    continue
  }
  eligible.push({
    ...alignment,
    critic_version: 'alignment-invariant-critic-v1.0.0',
    input_hash: sha256({ alignment, fragment_hash: fragment.source_text_hash, variant_hash: variant.target_text_hash }),
    publication_status: 'eligible'
  })
}
writeFileSync(outputPath, eligible.map(writeJsonLine).join(''))
writeFileSync(`${outputPath}.report.json`, `${JSON.stringify({
  schema_version: '1.0.0',
  critic_version: 'alignment-invariant-critic-v1.0.0',
  proposed: proposals.length,
  eligible: eligible.length,
  rejected
}, null, 2)}\n`)
console.log(JSON.stringify({ proposed: proposals.length, eligible: eligible.length, rejected: rejected.length, output: outputPath }, null, 2))
