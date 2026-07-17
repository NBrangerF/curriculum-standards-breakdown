import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  ensureDir,
  readJson,
  readJsonLines,
  sha256Text,
  writeJson
} from './library_common.js'

const PROJECT_ROOT = resolve(import.meta.dirname, '../..')
const CURRENT_PATH = join(PROJECT_ROOT, 'data/textbooks/library-state/CURRENT.json')
const DERIVED_ROOT = join(PROJECT_ROOT, 'data/textbooks/derived/by-edition')
const OUTPUT_ROOT = join(PROJECT_ROOT, 'public/data/textbooks')

function titleFor(asset) {
  const grade = `${asset.grade}年级`
  return `${asset.subject}${grade}${asset.volume}`
}

function stageLabel(stage) {
  return stage === 'primary' ? '小学' : '初中'
}

function normalizedRevisionStatus(asset) {
  if (asset.current_confirmed || asset.revision_status === 'current_2022_revision') return 'current_confirmed'
  if (asset.revision_status === 'candidate_2026_autumn_new_revision') return 'current_likely'
  if (String(asset.revision_status || '').includes('future')) return 'future_candidate'
  return 'revision_unknown'
}

function revisionLabel(status) {
  return {
    current_confirmed: '当前版本已核实',
    current_likely: '当前版本候选',
    revision_unknown: '版次待核实',
    future_candidate: '未来版本候选'
  }[status]
}

function countValues(items, valueKey, labelFor) {
  const counts = new Map()
  for (const item of items) counts.set(item[valueKey], (counts.get(item[valueKey]) || 0) + 1)
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: labelFor(value), count }))
    .sort((a, b) => typeof a.value === 'number' ? a.value - b.value : String(a.label).localeCompare(String(b.label), 'zh-CN'))
}

function loadStructure(editionId) {
  const path = join(DERIVED_ROOT, `${editionId}.json`)
  if (!existsSync(path)) return null
  return readJson(path)
}

function relationId(left, right, relationship) {
  return `rel_${sha256Text(`${left}:${right}:${relationship}`).slice(0, 16)}`
}

function relatedResources(asset, allAssets) {
  if (asset.resource_type !== 'student_textbook') return []
  const related = []
  for (const candidate of allAssets) {
    if (candidate.edition_id === asset.edition_id || candidate.grade !== asset.grade || candidate.volume !== asset.volume) continue
    const atlasMatch = candidate.resource_type === 'student_companion'
      && candidate.subject_slug === 'geography_atlas'
      && asset.subject_slug === 'geography'
    const subjectMatch = candidate.subject_slug === asset.subject_slug
    const teacherMatch = candidate.resource_type === 'teacher_guide' && subjectMatch
    const supplementMatch = candidate.resource_type === 'supplementary_material' && subjectMatch
    if (!atlasMatch && !teacherMatch && !supplementMatch) continue
    const relationship = teacherMatch ? 'teacher_guide_for' : atlasMatch ? 'companion_to' : 'supplement_to'
    related.push({
      relation_id: relationId(asset.edition_id, candidate.edition_id, relationship),
      resource_edition_id: candidate.edition_id,
      resource_type: candidate.resource_type,
      title: titleFor(candidate),
      relationship,
      confidence: atlasMatch || teacherMatch ? 0.98 : 0.85,
      review_status: atlasMatch || teacherMatch ? 'approved' : 'candidate'
    })
  }
  return related
}

function normalizeStructure(structure, pageCount) {
  const toc = Array.isArray(structure?.toc) ? structure.toc : []
  const pageMap = Array.isArray(structure?.page_map) ? structure.page_map : []
  const alignments = Array.isArray(structure?.alignments) ? structure.alignments : []
  const approvedToc = toc.filter(entry => entry.review_status === 'approved')
  const approvedPageMap = pageMap.filter(entry => entry.review_status === 'approved')
  const approvedAlignments = alignments.filter(entry => entry.review_status === 'approved')
  return {
    toc: approvedToc,
    page_map: approvedPageMap,
    alignments: approvedAlignments,
    extraction: structure?.extraction || {
      extracted_at: null,
      page_count_checked: 0,
      pages_with_text: 0,
      average_characters_per_page: 0,
      notes: ['尚未生成结构化目录与页码映射。']
    },
    text_quality: structure?.text_quality || 'unknown',
    toc_status: approvedToc.length ? 'approved' : toc.length ? 'candidate' : 'unavailable',
    page_map_status: approvedPageMap.length ? 'approved' : pageMap.length ? 'candidate' : 'unavailable',
    relation_status: approvedAlignments.length ? 'approved' : alignments.length ? 'candidate' : 'unavailable',
    toc_entry_count: approvedToc.length,
    unit_count: approvedToc.filter(entry => ['part', 'unit', 'chapter'].includes(entry.kind)).length,
    approved_alignment_count: approvedAlignments.length
  }
}

function publicBase(asset, structure, generatedAt) {
  const revisionStatus = normalizedRevisionStatus(asset)
  return {
    edition_id: asset.edition_id,
    work_id: asset.work_id,
    asset_id: asset.asset_id,
    evidence_id: asset.evidence_id,
    title: titleFor(asset),
    short_title: `${asset.subject} ${asset.grade}年级 ${asset.volume}`,
    stage: asset.stage,
    stage_label: stageLabel(asset.stage),
    subject: asset.subject,
    subject_slug: asset.subject_slug,
    grade: asset.grade,
    grade_label: `${asset.grade}年级`,
    volume: asset.volume,
    edition_name: asset.edition_name,
    resource_type: asset.resource_type,
    page_count: asset.pages,
    file_size_bytes: asset.bytes,
    revision_status: revisionStatus,
    revision_label: revisionLabel(revisionStatus),
    bibliographic_verified: Boolean(asset.bibliographic_verified),
    reading_available: Boolean(asset.transfer_verified && asset.pdf_structural_verified),
    text_quality: structure.text_quality,
    toc_status: structure.toc_status,
    page_map_status: structure.page_map_status,
    relation_status: structure.relation_status,
    toc_entry_count: structure.toc_entry_count,
    unit_count: structure.unit_count,
    approved_alignment_count: structure.approved_alignment_count,
    related_resource_count: 0,
    generated_at: generatedAt
  }
}

function main() {
  const current = readJson(CURRENT_PATH)
  const registryPath = join(
    PROJECT_ROOT,
    `data/textbooks/library-state/generations/${current.generation_id}/asset_registry.lock.jsonl`
  )
  const assets = readJsonLines(registryPath)
  const generatedAt = current.updated_at

  if (!assets.length) throw new Error(`Textbook registry is empty: ${registryPath}`)
  if (existsSync(OUTPUT_ROOT)) rmSync(OUTPUT_ROOT, { recursive: true })
  ensureDir(join(OUTPUT_ROOT, 'by-edition'))

  const catalogItems = []
  const units = []
  const standardsToTextbooks = {}
  for (const asset of assets) {
    const structure = normalizeStructure(loadStructure(asset.edition_id), asset.pages)
    const resources = relatedResources(asset, assets)
    const base = publicBase(asset, structure, generatedAt)
    base.related_resource_count = resources.length
    const detail = {
      ...base,
      toc: structure.toc,
      page_map: structure.page_map,
      alignments: structure.alignments,
      related_resources: resources,
      extraction: structure.extraction
    }
    writeJson(join(OUTPUT_ROOT, 'by-edition', `${asset.edition_id}.json`), detail)
    for (const entry of detail.toc) {
      const unitAlignments = detail.alignments.filter(item => item.unit_id === entry.entry_id)
      const unit = {
        ...entry,
        edition_id: asset.edition_id,
        textbook_title: base.title,
        subject: base.subject,
        subject_slug: base.subject_slug,
        grade: base.grade,
        volume: base.volume,
        alignments: unitAlignments,
        related_resources: resources
      }
      units.push(unit)
      for (const alignment of unitAlignments) {
        const reverse = {
          alignment_id: alignment.alignment_id,
          edition_id: asset.edition_id,
          textbook_title: base.title,
          unit_id: entry.entry_id,
          unit_title: entry.title,
          pdf_page: entry.pdf_page,
          printed_page: entry.printed_page,
          confidence: alignment.confidence,
          rationale: alignment.rationale
        }
        if (!standardsToTextbooks[alignment.standard_code]) standardsToTextbooks[alignment.standard_code] = []
        standardsToTextbooks[alignment.standard_code].push(reverse)
      }
    }
    if (asset.resource_type === 'student_textbook') catalogItems.push(base)
  }

  catalogItems.sort((a, b) =>
    a.stage.localeCompare(b.stage)
    || a.subject.localeCompare(b.subject, 'zh-CN')
    || a.grade - b.grade
    || a.volume.localeCompare(b.volume, 'zh-CN')
  )

  const manifest = {
    schema_version: 1,
    generated_at: generatedAt,
    source_generation_id: current.generation_id,
    count: catalogItems.length,
    filters: {
      stages: countValues(catalogItems, 'stage', stageLabel),
      subjects: countValues(catalogItems, 'subject_slug', value => catalogItems.find(item => item.subject_slug === value)?.subject || value),
      grades: countValues(catalogItems, 'grade', value => `${value}年级`),
      volumes: countValues(catalogItems, 'volume', value => value)
    }
  }
  writeJson(join(OUTPUT_ROOT, 'index.json'), { manifest, items: catalogItems })
  writeJson(join(OUTPUT_ROOT, 'manifest.json'), manifest)
  writeJson(join(OUTPUT_ROOT, 'units.json'), { generated_at: generatedAt, items: units })
  writeJson(join(OUTPUT_ROOT, 'standards-to-textbooks.json'), { generated_at: generatedAt, items: standardsToTextbooks })
  console.log(JSON.stringify({ output_root: OUTPUT_ROOT, catalog_count: catalogItems.length, detail_count: assets.length, generated_at: generatedAt }, null, 2))
}

main()
