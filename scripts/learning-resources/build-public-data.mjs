#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { sha256 } from './lib/canonical.mjs'

function readRows(path) {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8').split(/\r?\n/gu).filter(Boolean).map(line => JSON.parse(line))
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
}

function writeJson(path, value) {
  mkdirSync(resolve(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function localized(text, variant) {
  return {
    locale: 'zh-Hans-CN',
    text,
    text_hash: sha256(text),
    qa_status: 'passed',
    variant_version_id: variant.variant_version_id
  }
}

export function buildLearningResourcePublicData({
  dataRoot = 'data/learning-resources',
  outputRoot = 'public/data/learning-resources'
} = {}) {
  const currentPath = resolve(dataRoot, 'library-state/CURRENT.json')
  const output = resolve(outputRoot)
  rmSync(output, { recursive: true, force: true })
  mkdirSync(join(output, 'catalog'), { recursive: true })
  mkdirSync(join(output, 'by-resource'), { recursive: true })
  mkdirSync(join(output, 'by-standard'), { recursive: true })
  if (!existsSync(currentPath)) {
    writeJson(join(output, 'catalog/index.json'), { schema_version: '1.0.0', generation_id: 'empty', resources: [] })
    return { generation_id: 'empty', resources: 0, alignments: 0 }
  }
  const current = JSON.parse(readFileSync(currentPath, 'utf8'))
  if (!current.generation_id || current.generation_id === 'empty') {
    writeJson(join(output, 'catalog/index.json'), { schema_version: '1.0.0', generation_id: 'empty', resources: [] })
    writeJson(join(output, 'coverage.json'), { generation_id: 'empty', resources: 0, alignments: 0, by_source: {} })
    return { generation_id: 'empty', resources: 0, alignments: 0 }
  }
  const generation = resolve(dataRoot, 'library-state/generations', current.generation_id)
  const manifestText = readFileSync(join(generation, 'manifest.json'), 'utf8')
  if (sha256(manifestText) !== current.manifest_hash) throw new Error('CURRENT manifest hash mismatch')
  const manifest = JSON.parse(manifestText)
  if (manifest.state !== 'eligible') throw new Error(`CURRENT generation is not eligible: ${manifest.state}`)

  const resources = new Map(readRows(join(generation, 'resources.lock.jsonl')).map(row => [row.resource_id, row]))
  const fragments = new Map(readRows(join(generation, 'fragments.lock.jsonl')).map(row => [row.fragment_id, row]))
  const rights = new Map(readRows(join(generation, 'rights.lock.jsonl')).map(row => [row.rights_profile_id, row]))
  const variants = readRows(join(generation, 'localized-variants.lock.jsonl'))
  const publicResources = []
  const canonicalResourceIds = new Set()
  for (const variant of variants) {
    if (variant.qa_status !== 'passed' || variant.target_locale !== 'zh-Hans-CN') continue
    const fragment = fragments.get(variant.fragment_id)
    const resource = fragment && resources.get(fragment.resource_id)
    const right = resource && rights.get(resource.rights_profile_id)
    if (!fragment || !resource || !right) continue
    if (resource.visual_dependency === 'required' || fragment.visual_dependency === 'required') continue
    if (!['publish_translation', 'publish_translation_share_alike'].includes(right.public_decision)) continue
    const projection = {
      resource_id: resource.resource_id,
      resource_version_id: resource.resource_version_id,
      fragment_id: fragment.fragment_id,
      variant_id: variant.variant_id,
      variant_version_id: variant.variant_version_id,
      source_id: resource.source_id,
      resource_type: resource.resource_type,
      pedagogical_roles: resource.pedagogical_roles,
      mapped_subject_slugs: resource.mapped_subject_slugs,
      mapped_china_stage: resource.mapped_china_stage,
      mapped_china_grade_scope: resource.mapped_china_grade_scope,
      estimated_minutes: resource.estimated_minutes,
      title: localized(variant.title_zh, variant),
      description: localized(variant.description_zh || '', variant),
      blocks: variant.target_blocks.map(block => ({
        target_block_id: block.target_block_id,
        type: block.type,
        text: localized(block.canonical_plain_text, variant),
        ...(block.items ? { items: block.items } : {}),
        ...(block.rows ? { rows: block.rows } : {})
      })),
      provenance: {
        canonical_url: resource.canonical_url,
        source_title: resource.title_source,
        source_revision: resource.source_revision,
        attribution_text: right.attribution_text,
        license_id: right.license_id,
        license_url: right.license_url,
        adaptation_notice: variant.adaptation_notice
      },
      visual_dependency: fragment.visual_dependency,
      generation_id: current.generation_id
    }
    publicResources.push(projection)
    writeJson(join(output, 'by-resource', `${resource.resource_id}.${fragment.fragment_id}.json`), projection)
    if (!canonicalResourceIds.has(resource.resource_id)) {
      writeJson(join(output, 'by-resource', `${resource.resource_id}.json`), projection)
      canonicalResourceIds.add(resource.resource_id)
    }
  }

  const alignments = readRows(join(generation, 'alignments.lock.jsonl'))
    .filter(row => ['eligible', 'published'].includes(row.publication_status))
    .map(row => ({
      alignment_id: row.alignment_id,
      alignment_version_id: row.alignment_version_id,
      standard_code: row.standard_code,
      learning_component_ids: row.learning_component_ids,
      resource_id: row.resource_id,
      fragment_id: row.fragment_id,
      relation_type: row.relation_type,
      pedagogical_role: row.pedagogical_role,
      evidence_quote_zh: row.evidence_quote_zh,
      rationale_zh: row.rationale_zh,
      target_block_ids: row.target_block_ids,
      variant_version_id: row.variant_version_id
    }))
  const publicByFragment = new Map(publicResources.map(row => [row.fragment_id, row]))
  const byStandard = new Map()
  const byResource = new Map()
  for (const alignment of alignments) {
    if (!publicByFragment.has(alignment.fragment_id)) continue
    const standardRows = byStandard.get(alignment.standard_code) || []
    standardRows.push(alignment)
    byStandard.set(alignment.standard_code, standardRows)
    const resourceRows = byResource.get(alignment.resource_id) || []
    resourceRows.push(alignment)
    byResource.set(alignment.resource_id, resourceRows)
  }
  for (const [standardCode, rows] of byStandard) {
    const resourceIds = new Set(rows.map(row => row.resource_id))
    writeJson(join(output, 'by-standard', `${standardCode}.json`), {
      schema_version: '1.0.0',
      generation_id: current.generation_id,
      standard_code: standardCode,
      alignments: rows,
      resources: publicResources.filter(resource => resourceIds.has(resource.resource_id))
    })
  }
  for (const [resourceId, rows] of byResource) {
    writeJson(join(output, 'by-resource', `${resourceId}.alignments.json`), {
      schema_version: '1.0.0',
      generation_id: current.generation_id,
      resource_id: resourceId,
      alignments: rows
    })
  }
  const bySource = {}
  for (const resource of publicResources) bySource[resource.source_id] = (bySource[resource.source_id] || 0) + 1
  writeJson(join(output, 'catalog/index.json'), {
    schema_version: '1.0.0',
    generation_id: current.generation_id,
    resources: publicResources
  })
  writeJson(join(output, 'coverage.json'), {
    schema_version: '1.0.0',
    generation_id: current.generation_id,
    resources: publicResources.length,
    unique_resources: new Set(publicResources.map(row => row.resource_id)).size,
    alignments: alignments.length,
    standards: byStandard.size,
    by_source: bySource
  })
  writeJson(join(output, 'manifest.json'), {
    schema_version: '1.0.0',
    generation_id: current.generation_id,
    resources: publicResources.length,
    alignments: alignments.length,
    body_mode: 'inline-development'
  })
  return { generation_id: current.generation_id, resources: publicResources.length, alignments: alignments.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = buildLearningResourcePublicData()
  console.log(JSON.stringify(result, null, 2))
}
