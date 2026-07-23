#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { sha256, stableId, writeJsonLine } from './lib/canonical.mjs'

const args = { generation: '', output: '', candidates: 8, perSource: 4, source: '', unalignedOnly: false }
for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index] === '--generation') args.generation = resolve(process.argv[++index])
  else if (process.argv[index] === '--output') args.output = resolve(process.argv[++index])
  else if (process.argv[index] === '--candidates') args.candidates = Math.max(2, Number(process.argv[++index]))
  else if (process.argv[index] === '--per-source') args.perSource = Math.max(1, Number(process.argv[++index]))
  else if (process.argv[index] === '--source') args.source = String(process.argv[++index] || '').trim()
  else if (process.argv[index] === '--unaligned-only') args.unalignedOnly = true
}
if (!args.generation || !args.output) throw new Error('--generation and --output are required')

function rows(name) {
  const path = join(args.generation, name)
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8').split(/\r?\n/gu).filter(Boolean).map(line => JSON.parse(line))
}

function terms(value) {
  const text = String(value || '').normalize('NFKC').toLocaleLowerCase('zh-CN')
  const latin = text.match(/[a-z][a-z0-9_-]{2,}/gu) || []
  const chinese = (text.match(/[\p{Script=Han}]{2,}/gu) || []).flatMap(run => {
    const values = []
    for (let index = 0; index < run.length - 1; index += 1) values.push(run.slice(index, index + 2))
    return values
  })
  return new Set([...latin, ...chinese])
}

function overlap(left, right) {
  let count = 0
  for (const term of left) if (right.has(term)) count += 1
  return count
}

const subjectAlias = {
  'information-technology': 'it',
  arts: 'arts',
  chinese: 'chinese',
  english: 'english',
  math: 'math',
  science: 'science'
}
const standards = []
for (const file of readdirSync('public/data/by_subject').filter(name => name.endsWith('.json')).sort()) {
  const subject = basename(file, '.json')
  const payload = JSON.parse(readFileSync(join('public/data/by_subject', file), 'utf8'))
  for (const standard of payload.standards || []) {
    const graphPath = join('public/data/capability_graph/by_code', `${standard.code}.json`)
    const graph = existsSync(graphPath) ? JSON.parse(readFileSync(graphPath, 'utf8')) : {}
    const components = (graph.learning_components || []).map(component => ({
      component_id: component.component_id,
      label: component.label || component.description || component.source_statement
    })).filter(component => component.component_id && component.label)
    standards.push({
      standard_code: standard.code,
      subject_slug: standard.subject_slug || subject,
      grade_band: standard.grade_band,
      grade_level: Number(standard.grade_level) || null,
      standard_title: standard.standard_title,
      standard_text: standard.standard,
      domain: standard.domain,
      subdomain: standard.subdomain,
      source_standard_hash: graph.source_standard_hash || sha256(standard.standard),
      capability_graph_schema_version: graph.capability_graph_schema_version || '1.0.0',
      capability_graph_method: graph.capability_graph_method || 'unknown',
      learning_components: components,
      search_terms: terms([
        standard.standard_title,
        standard.standard,
        standard.domain,
        standard.subdomain,
        ...components.map(component => component.label)
      ].join(' '))
    })
  }
}

const resources = new Map(rows('resources.lock.jsonl').map(row => [row.resource_id, row]))
const fragments = new Map(rows('fragments.lock.jsonl').map(row => [row.fragment_id, row]))
const alignedFragments = new Set(rows('alignments.lock.jsonl').map(row => row.fragment_id))
const variants = rows('localized-variants.lock.jsonl').filter(row => row.qa_status === 'passed' && row.target_locale === 'zh-Hans-CN')
const sourceCounts = new Map()
const workset = []
for (const variant of variants) {
  const fragment = fragments.get(variant.fragment_id)
  const resource = fragment && resources.get(fragment.resource_id)
  if (!fragment || !resource || fragment.visual_dependency === 'required') continue
  if (args.unalignedOnly && alignedFragments.has(fragment.fragment_id)) continue
  if (args.source && resource.source_id !== args.source) continue
  const used = sourceCounts.get(resource.source_id) || 0
  if (used >= args.perSource) continue
  sourceCounts.set(resource.source_id, used + 1)
  const resourceSubjects = new Set(resource.mapped_subject_slugs.map(value => subjectAlias[value] || value))
  const resourceTerms = terms([
    variant.title_zh,
    ...variant.target_blocks.map(block => block.canonical_plain_text)
  ].join(' '))
  const candidates = standards
    .filter(standard => resourceSubjects.has(standard.subject_slug))
    .map(standard => ({
      ...standard,
      score: overlap(resourceTerms, standard.search_terms)
        + (resource.mapped_china_grade_scope.includes(standard.grade_level) ? 4 : 0)
    }))
    .sort((left, right) => right.score - left.score || left.standard_code.localeCompare(right.standard_code))
    .slice(0, args.candidates)
    .map(({ search_terms: ignored, score: recall_score, ...standard }) => ({ ...standard, recall_score }))
  workset.push({
    schema_version: '1.0.0',
    item_id: stableId('lraw', resource.resource_id, fragment.fragment_id, variant.variant_version_id),
    resource: {
      resource_id: resource.resource_id,
      fragment_id: fragment.fragment_id,
      source_id: resource.source_id,
      title_zh: variant.title_zh,
      resource_type: resource.resource_type,
      pedagogical_roles: resource.pedagogical_roles,
      mapped_subject_slugs: resource.mapped_subject_slugs,
      mapped_china_grade_scope: resource.mapped_china_grade_scope,
      source_text_hash: fragment.source_text_hash,
      target_text_hash: variant.target_text_hash,
      variant_version_id: variant.variant_version_id,
      blocks: variant.target_blocks.map(block => ({
        target_block_id: block.target_block_id,
        source_block_ids: block.source_block_ids,
        text: block.canonical_plain_text
      }))
    },
    candidates
  })
}
writeFileSync(args.output, workset.map(writeJsonLine).join(''))
console.log(JSON.stringify({
  items: workset.length,
  by_source: Object.fromEntries(sourceCounts),
  candidates_per_item: args.candidates,
  output: args.output
}, null, 2))
