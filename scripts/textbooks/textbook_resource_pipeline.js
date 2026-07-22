import { createHash } from 'node:crypto'
import { isAbsolute } from 'node:path'

export const SUPPORT_RESOURCE_TYPES = Object.freeze([
  'teacher_guide',
  'teaching_reference',
  'textbook_explanation',
  'workbook',
  'answer_key',
  'student_companion'
])

const SUPPORT_RESOURCE_TYPE_SET = new Set(SUPPORT_RESOURCE_TYPES)
const VOLUMES = new Set(['上册', '下册', '全一册'])
const STAGES = new Set(['primary', 'junior'])

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

function clean(value) {
  return String(value ?? '').trim()
}

function nullableString(value) {
  const normalized = clean(value)
  return normalized || null
}

function isAbsoluteLocalReference(value) {
  const reference = clean(value)
  return Boolean(reference) && (
    isAbsolute(reference)
    || /^[A-Za-z]:[\\/]/.test(reference)
    || /^\\\\/.test(reference)
    || /^~[\\/]/.test(reference)
    || /^\.\.(?:[\\/]|$)/.test(reference)
    || /^file:\/\//i.test(reference)
  )
}

function portableReference(value) {
  const reference = nullableString(value)
  return reference && !isAbsoluteLocalReference(reference) ? reference : null
}

function normalizeToken(value) {
  return clean(value)
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s·・—_()（）【】\[\]《》“”"'：:，,。.!！?？、/\\-]+/g, '')
}

function normalizeEdition(value) {
  return normalizeToken(value)
    .replace(/^配套/, '')
    .replace(/(?:出版社)?版$/, '')
    .replace(/统编/, '人教')
}

function normalizedSubject(resourceType, subjectSlug) {
  if (resourceType === 'student_companion' && subjectSlug === 'geography_atlas') return 'geography'
  return subjectSlug
}

function stableId(prefix, ...parts) {
  return `${prefix}_${hash(parts.map(part => clean(part)).join('\u001f')).slice(0, prefix === 'ed' ? 20 : 24)}`
}

function relationshipFor(resourceType) {
  return {
    teacher_guide: 'teacher_guide_for',
    teaching_reference: 'teaching_reference_for',
    textbook_explanation: 'explains',
    workbook: 'workbook_for',
    answer_key: 'answer_key_for',
    student_companion: 'companion_to'
  }[resourceType]
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function resourceIdentity(input) {
  const bibliography = input.bibliography || {}
  return [
    input.resource_type,
    bibliography.stage,
    bibliography.subject_slug,
    bibliography.grade,
    bibliography.volume,
    bibliography.publisher,
    bibliography.edition_name,
    bibliography.revision_year,
    bibliography.isbn,
    bibliography.title
  ]
}

function normalizeBibliography(raw) {
  const bibliography = {
    title: clean(raw.title),
    stage: clean(raw.stage),
    subject: clean(raw.subject),
    subject_slug: clean(raw.subject_slug),
    grade: Number(raw.grade),
    volume: clean(raw.volume),
    publisher: nullableString(raw.publisher),
    edition_name: clean(raw.edition_name),
    edition_statement: nullableString(raw.edition_statement),
    revision_year: raw.revision_year == null ? null : Number(raw.revision_year),
    isbn: nullableString(raw.isbn)
  }
  assert(bibliography.title, 'resource bibliography requires title')
  assert(STAGES.has(bibliography.stage), `unsupported resource stage: ${bibliography.stage}`)
  assert(bibliography.subject && bibliography.subject_slug, 'resource bibliography requires subject and subject_slug')
  assert(Number.isInteger(bibliography.grade) && bibliography.grade >= 1 && bibliography.grade <= 9, 'resource grade must be 1..9')
  assert(VOLUMES.has(bibliography.volume), `unsupported resource volume: ${bibliography.volume}`)
  assert(bibliography.edition_name, 'resource bibliography requires edition_name')
  if (bibliography.revision_year !== null) {
    assert(Number.isInteger(bibliography.revision_year) && bibliography.revision_year >= 1900 && bibliography.revision_year <= 2200, 'invalid revision_year')
  }
  return bibliography
}

function normalizeTargetHint(raw, resourceType, bibliography) {
  return {
    edition_id: nullableString(raw?.edition_id) || undefined,
    subject_slug: clean(raw?.subject_slug) || normalizedSubject(resourceType, bibliography.subject_slug),
    grade: raw?.grade == null ? bibliography.grade : Number(raw.grade),
    volume: clean(raw?.volume) || bibliography.volume,
    publisher: raw?.publisher === undefined ? undefined : nullableString(raw.publisher),
    edition_name: raw?.edition_name === undefined ? undefined : nullableString(raw.edition_name),
    revision_year: raw?.revision_year === undefined || raw?.revision_year === null ? raw?.revision_year : Number(raw.revision_year)
  }
}

function normalizeAsset(raw, seed) {
  const availability = clean(raw?.availability) || (raw?.sha256 ? 'available' : 'manifest_only')
  assert(['available', 'manifest_only', 'missing'].includes(availability), `unsupported asset availability: ${availability}`)
  const sha256 = nullableString(raw?.sha256)?.toLowerCase() || null
  if (sha256) assert(/^[a-f0-9]{64}$/.test(sha256), 'resource asset sha256 must contain 64 lowercase hex characters')
  const sourcePath = nullableString(raw?.source_path)
  const objectPath = nullableString(raw?.object_path) || (sha256 ? `objects/sha256/${sha256.slice(0, 2)}/${sha256}.pdf` : null)
  const assetSeed = sha256 || raw?.source_locator || sourcePath || objectPath || `${seed}:manifest-only`
  const asset = {
    asset_id: clean(raw?.asset_id) || (sha256 ? `asset_${sha256.slice(0, 24)}` : stableId('asset', assetSeed)),
    availability,
    media_type: 'application/pdf',
    sha256,
    bytes: raw?.bytes == null ? null : Number(raw.bytes),
    pages: raw?.pages == null ? null : Number(raw.pages),
    source_path: sourcePath,
    object_path: objectPath,
    local_path: nullableString(raw?.local_path),
    r2_bucket: nullableString(raw?.r2_bucket),
    r2_key: nullableString(raw?.r2_key) || objectPath
  }
  if (availability === 'available') {
    assert(asset.sha256 && asset.object_path, 'available resource asset requires sha256 and object_path')
    assert(Number.isInteger(asset.bytes) && asset.bytes > 0, 'available resource asset requires positive bytes')
    assert(Number.isInteger(asset.pages) && asset.pages > 0, 'available resource asset requires positive pages')
  }
  return asset
}

function normalizeSections(rawSections, resourceId) {
  const pending = (Array.isArray(rawSections) ? rawSections : []).map((raw, index) => {
    const sourceKey = nullableString(raw.source_key) || `section-${index + 1}`
    const start = raw.pdf_page_start == null ? null : Number(raw.pdf_page_start)
    const end = raw.pdf_page_end == null ? start : Number(raw.pdf_page_end)
    assert(start === null || Number.isInteger(start) && start > 0, `invalid resource section start page: ${sourceKey}`)
    assert(end === null || Number.isInteger(end) && end > 0, `invalid resource section end page: ${sourceKey}`)
    assert(start === null || end === null || end >= start, `resource section end page precedes start page: ${sourceKey}`)
    return {
      section_id: clean(raw.section_id) || stableId('trs', resourceId, sourceKey, raw.title, start, end),
      source_key: sourceKey,
      parent_ref: nullableString(raw.parent_ref) || nullableString(raw.parent_id),
      level: Number.isInteger(raw.level) && raw.level >= 1 ? raw.level : 1,
      kind: clean(raw.kind) || 'section',
      title: clean(raw.title),
      printed_page_start: nullableString(raw.printed_page_start),
      printed_page_end: nullableString(raw.printed_page_end),
      pdf_page_start: start,
      pdf_page_end: end
    }
  })
  const allowedKinds = new Set(['part', 'unit', 'chapter', 'lesson', 'section', 'appendix', 'other'])
  const byRef = new Map(pending.flatMap(section => [[section.source_key, section], [section.section_id, section]]))
  return pending.map(section => {
    assert(section.title, `resource section ${section.source_key} requires title`)
    assert(allowedKinds.has(section.kind), `unsupported resource section kind: ${section.kind}`)
    const parent = section.parent_ref ? byRef.get(section.parent_ref) : null
    assert(!section.parent_ref || parent, `unknown resource section parent: ${section.parent_ref}`)
    return {
      section_id: section.section_id,
      source_key: section.source_key,
      parent_id: parent?.section_id || null,
      level: section.level,
      kind: section.kind,
      title: section.title,
      printed_page_start: section.printed_page_start,
      printed_page_end: section.printed_page_end,
      pdf_page_start: section.pdf_page_start,
      pdf_page_end: section.pdf_page_end
    }
  })
}

function normalizePageMap(rawPageMap) {
  return (Array.isArray(rawPageMap) ? rawPageMap : []).map(entry => ({
    pdf_page: Number(entry.pdf_page),
    printed_page: nullableString(entry.printed_page),
    label: clean(entry.label) || clean(entry.printed_page) || `PDF ${entry.pdf_page}`
  })).filter(entry => Number.isInteger(entry.pdf_page) && entry.pdf_page > 0)
}

function assertResourcePageBounds(resource) {
  if (resource.asset?.availability !== 'available') return
  const pageCount = resource.asset.pages
  for (const section of resource.sections || []) {
    for (const [label, page] of [
      ['start', section.pdf_page_start],
      ['end', section.pdf_page_end]
    ]) {
      assert(
        page === null || page <= pageCount,
        `resource section ${label} page exceeds available asset.pages: ${section.section_id} (${page} > ${pageCount})`
      )
    }
  }
  for (const entry of resource.page_map || []) {
    assert(
      entry.pdf_page <= pageCount,
      `resource page_map page exceeds available asset.pages: ${entry.pdf_page} > ${pageCount}`
    )
  }
}

/** Normalize a resource manifest row and derive stable resource, edition, asset and section IDs. */
export function normalizeResourceInput(input, options = {}) {
  assert(input && typeof input === 'object', 'resource manifest row must be an object')
  const resourceType = clean(input.resource_type)
  assert(SUPPORT_RESOURCE_TYPE_SET.has(resourceType), `unsupported support resource type: ${resourceType}`)
  const bibliography = normalizeBibliography(input.bibliography || input)
  const identity = resourceIdentity({ resource_type: resourceType, bibliography })
  const resourceId = clean(input.resource_id) || stableId('res', ...identity)
  const editionId = clean(input.edition_id) || stableId('ed', ...identity)
  const workId = clean(input.work_id) || stableId('work', resourceType, bibliography.title, bibliography.subject_slug, bibliography.grade, bibliography.volume)
  const targetRows = Array.isArray(input.targets) ? input.targets : input.target ? [input.target] : []
  const targetHints = (targetRows.length ? targetRows : [{}]).map(row => normalizeTargetHint(row, resourceType, bibliography))
  const sections = normalizeSections(input.structure?.toc || input.sections, resourceId)
  const sectionByRef = new Map(sections.flatMap(section => [[section.section_id, section], ...(section.source_key ? [[section.source_key, section]] : [])]))
  const declaredUnitMappings = (Array.isArray(input.unit_mappings) ? input.unit_mappings : []).map(raw => {
    const section = sectionByRef.get(raw.resource_section_id || raw.resource_section_ref)
    return {
      target_edition_id: nullableString(raw.target_edition_id),
      target_unit_id: nullableString(raw.target_unit_id),
      resource_section_id: section?.section_id || nullableString(raw.resource_section_id) || nullableString(raw.resource_section_ref),
      confidence: Number.isFinite(raw.confidence) ? Number(raw.confidence) : 0.99
    }
  })
  const resource = {
    resource_id: resourceId,
    edition_id: editionId,
    work_id: workId,
    resource_type: resourceType,
    bibliography,
    target_hints: targetHints,
    asset: normalizeAsset(input.asset, resourceId),
    sections,
    page_map: normalizePageMap(input.structure?.page_map || input.page_map),
    provenance: {
      source_kind: clean(input.provenance?.source_kind) || options.sourceKind || 'resource_manifest',
      source_ref: nullableString(input.provenance?.source_ref) || nullableString(options.sourceRef),
      generated_from: nullableString(input.provenance?.generated_from) || nullableString(options.generatedFrom)
    }
  }
  assertResourcePageBounds(resource)
  return {
    resource,
    declared_unit_mappings: declaredUnitMappings
  }
}

/**
 * Merge resource-manifest layers by their normalized stable resource ID.
 * Later layers intentionally replace earlier rows with the same ID. This is
 * used for both registry upserts and explicit build-time manifest overlays.
 */
export function mergeResourceManifestInputs(...layers) {
  const byResourceId = new Map()
  for (const layer of layers) {
    for (const input of Array.isArray(layer) ? layer : []) {
      const resourceId = normalizeResourceInput(input).resource.resource_id
      byResourceId.set(resourceId, input)
    }
  }
  return [...byResourceId.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, input]) => input)
}

/**
 * Convert an imported row into the portable, rebuildable representation kept
 * in the versioned registry. Source PDFs remain addressable by content hash;
 * workstation and external-volume paths are deliberately discarded.
 */
export function resourceInputForRegistry(input, normalizedResource, options = {}) {
  const resource = normalizedResource || normalizeResourceInput(input).resource
  const provenance = input.provenance || {}
  const objectPath = portableReference(resource.asset.object_path)
  const portableSourceRef = portableReference(provenance.source_ref)
    || portableReference(options.sourceRef)
  const generatedFrom = portableReference(provenance.generated_from)
    || objectPath
    || null
  const targets = resource.target_hints.map(target => Object.fromEntries(Object.entries({
    edition_id: target.edition_id,
    subject_slug: target.subject_slug,
    grade: target.grade,
    volume: target.volume,
    publisher: target.publisher,
    edition_name: target.edition_name,
    revision_year: target.revision_year
  }).filter(([, value]) => value !== undefined)))
  const sections = resource.sections.map(section => ({
    section_id: section.section_id,
    source_key: section.source_key,
    parent_ref: section.parent_id,
    level: section.level,
    kind: section.kind,
    title: section.title,
    printed_page_start: section.printed_page_start,
    printed_page_end: section.printed_page_end,
    pdf_page_start: section.pdf_page_start,
    pdf_page_end: section.pdf_page_end
  }))
  const declaredMappings = normalizeResourceInput(input).declared_unit_mappings
  return {
    resource_id: resource.resource_id,
    edition_id: resource.edition_id,
    work_id: resource.work_id,
    resource_type: resource.resource_type,
    bibliography: { ...resource.bibliography },
    targets,
    asset: {
      asset_id: resource.asset.asset_id,
      availability: resource.asset.availability,
      source_locator: portableReference(input.asset?.source_locator),
      source_path: null,
      sha256: resource.asset.sha256,
      bytes: resource.asset.bytes,
      pages: resource.asset.pages,
      object_path: objectPath,
      local_path: null,
      r2_bucket: resource.asset.r2_bucket,
      r2_key: portableReference(resource.asset.r2_key) || objectPath
    },
    structure: {
      toc: sections,
      page_map: resource.page_map.map(entry => ({ ...entry }))
    },
    unit_mappings: declaredMappings.map(mapping => ({
      target_edition_id: mapping.target_edition_id,
      target_unit_id: mapping.target_unit_id,
      resource_section_ref: mapping.resource_section_id,
      confidence: mapping.confidence
    })),
    provenance: {
      source_kind: clean(provenance.source_kind) || resource.provenance.source_kind || 'resource_import',
      source_ref: portableSourceRef,
      generated_from: generatedFrom
    }
  }
}

function resourceForCatalog(resource) {
  return {
    ...resource,
    asset: {
      ...resource.asset,
      source_path: null,
      object_path: portableReference(resource.asset.object_path),
      local_path: null,
      r2_key: portableReference(resource.asset.r2_key)
    },
    provenance: {
      ...resource.provenance,
      source_ref: portableReference(resource.provenance?.source_ref),
      generated_from: portableReference(resource.provenance?.generated_from)
    }
  }
}

/** Convert an existing content-addressed asset-registry row into a resource manifest row. */
export function resourceInputFromAsset(asset, catalogRow = null, structure = null) {
  assert(asset?.resource_type && asset.resource_type !== 'student_textbook', 'asset row must describe a support resource')
  const bibliography = {
    title: clean(catalogRow?.title) || `${asset.subject}${asset.grade}年级${asset.volume}`,
    stage: asset.stage,
    subject: asset.subject,
    subject_slug: catalogRow?.subject_slug || asset.subject_slug,
    grade: asset.grade,
    volume: asset.volume,
    publisher: catalogRow?.publisher || null,
    edition_name: asset.edition_name,
    edition_statement: catalogRow?.edition_statement || null,
    revision_year: catalogRow?.revision_year || null,
    isbn: catalogRow?.isbn || null
  }
  const targetSubject = normalizedSubject(asset.resource_type, asset.subject_slug)
  return {
    resource_id: stableId('res', ...resourceIdentity({ resource_type: asset.resource_type, bibliography })),
    edition_id: asset.edition_id,
    work_id: asset.work_id,
    resource_type: asset.resource_type,
    bibliography,
    targets: [{
      subject_slug: targetSubject,
      grade: asset.grade,
      volume: asset.volume,
      edition_name: asset.edition_name
    }],
    asset: {
      asset_id: asset.asset_id,
      availability: 'available',
      sha256: asset.sha256,
      bytes: asset.bytes,
      pages: asset.pages,
      object_path: asset.object_path,
      local_path: asset.local_path || null,
      r2_bucket: asset.r2_bucket || null,
      r2_key: asset.r2_key || asset.object_path
    },
    structure: {
      toc: (structure?.toc || []).map(entry => ({
        section_id: entry.entry_id,
        source_key: entry.entry_id,
        parent_id: entry.parent_id,
        level: entry.level,
        kind: entry.kind,
        title: entry.title,
        printed_page_start: entry.printed_page,
        printed_page_end: null,
        pdf_page_start: entry.pdf_page,
        pdf_page_end: entry.end_pdf_page
      })),
      page_map: structure?.page_map || []
    },
    provenance: {
      source_kind: 'asset_registry',
      source_ref: asset.evidence_id || null,
      generated_from: asset.object_path
    }
  }
}

function targetProjection(target, structure) {
  return {
    edition_id: target.edition_id,
    resource_type: target.resource_type,
    stage: target.stage,
    subject: target.subject,
    subject_slug: target.subject_slug,
    grade: Number(target.grade),
    volume: target.volume,
    publisher: target.publisher || null,
    edition_name: target.edition_name || '',
    revision_year: target.revision_year || null,
    toc: Array.isArray(structure?.toc) ? structure.toc : []
  }
}

function compareTarget(resource, hint, target) {
  const matching = []
  const mismatching = []
  const checks = [
    ['stage', resource.bibliography.stage, target.stage],
    ['subject_slug', hint.subject_slug, target.subject_slug],
    ['grade', hint.grade, target.grade],
    ['volume', hint.volume, target.volume]
  ]
  for (const [field, expected, actual] of checks) (expected === actual ? matching : mismatching).push(field)
  if (hint.publisher) {
    const matched = normalizeToken(hint.publisher) === normalizeToken(target.publisher)
    ;(matched ? matching : mismatching).push('publisher')
  }
  const editionHint = hint.edition_name || resource.bibliography.edition_name
  if (editionHint) {
    const left = normalizeEdition(editionHint)
    const right = normalizeEdition(target.edition_name)
    const matched = Boolean(left && right && (left === right || left.includes(right) || right.includes(left)))
    ;(matched ? matching : mismatching).push('edition_name')
  }
  if (hint.revision_year) {
    const matched = Number(hint.revision_year) === Number(target.revision_year)
    ;(matched ? matching : mismatching).push('revision_year')
  }
  return { matching, mismatching }
}

function unmatchedReason(resource, hint, targets) {
  if (!hint.subject_slug || !hint.grade || !hint.volume) return 'insufficient_bibliography'
  if (!targets.some(target => target.subject_slug === hint.subject_slug)) return 'subject_mismatch'
  if (!targets.some(target => target.subject_slug === hint.subject_slug && target.grade === hint.grade)) return 'grade_mismatch'
  if (!targets.some(target => target.subject_slug === hint.subject_slug && target.grade === hint.grade && target.volume === hint.volume)) return 'volume_mismatch'
  if (hint.publisher) return 'publisher_mismatch'
  if (hint.revision_year) return 'revision_mismatch'
  return 'target_not_found'
}

function pairResource(resource, targets) {
  const attempts = []
  for (const hint of resource.target_hints) {
    const pool = hint.edition_id ? targets.filter(target => target.edition_id === hint.edition_id) : targets
    for (const target of pool) {
      const comparison = compareTarget(resource, hint, target)
      if (!comparison.mismatching.some(field => ['stage', 'subject_slug', 'grade', 'volume'].includes(field))) {
        const optionalMismatch = comparison.mismatching.filter(field => ['publisher', 'edition_name', 'revision_year'].includes(field))
        if (!optionalMismatch.length || resource.resource_type === 'student_companion' && optionalMismatch.every(field => field === 'publisher')) {
          const score = comparison.matching.length + (hint.edition_id ? 10 : 0)
          attempts.push({ hint, target, comparison, score })
        }
      }
    }
  }
  attempts.sort((left, right) => right.score - left.score || left.target.edition_id.localeCompare(right.target.edition_id))
  const best = attempts[0]
  const tied = best ? attempts.filter(item => item.score === best.score) : []
  if (best && tied.length === 1) {
    const reason = best.hint.edition_id
      ? 'explicit_target'
      : resource.resource_type === 'student_companion'
        ? 'compatible_companion_edition'
        : 'exact_bibliographic_match'
    return {
      relation_id: stableId('trr', resource.resource_id, best.target.edition_id, reason),
      resource_id: resource.resource_id,
      resource_edition_id: resource.edition_id,
      target_edition_id: best.target.edition_id,
      relationship: relationshipFor(resource.resource_type),
      status: 'matched',
      reason,
      confidence: best.hint.edition_id ? 0.99 : resource.resource_type === 'student_companion' ? 0.98 : 0.95,
      matching_fields: [...new Set(best.comparison.matching)].sort(),
      mismatching_fields: [...new Set(best.comparison.mismatching)].sort()
    }
  }
  const hint = resource.target_hints[0]
  const reason = tied.length > 1 ? 'ambiguous_target' : unmatchedReason(resource, hint, targets)
  return {
    relation_id: stableId('trr', resource.resource_id, 'unmatched', reason),
    resource_id: resource.resource_id,
    resource_edition_id: resource.edition_id,
    target_edition_id: null,
    relationship: relationshipFor(resource.resource_type),
    status: tied.length > 1 ? 'ambiguous' : 'unmatched',
    reason,
    confidence: 0,
    matching_fields: [],
    mismatching_fields: [reason.replace(/_mismatch$/, '')]
  }
}

function mappingFor(relation, resource, section, target, unit, method, confidence) {
  return {
    mapping_id: stableId('trm', relation.relation_id, section.section_id, unit.entry_id),
    relation_id: relation.relation_id,
    resource_id: resource.resource_id,
    resource_section_id: section.section_id,
    target_edition_id: target.edition_id,
    target_unit_id: unit.entry_id,
    resource_pdf_page_start: section.pdf_page_start,
    resource_pdf_page_end: section.pdf_page_end,
    target_pdf_page_start: unit.pdf_page ?? null,
    target_pdf_page_end: unit.end_pdf_page ?? null,
    method,
    confidence
  }
}

function mappingGap(relation, resource, target, unit, reason, detail) {
  return {
    gap_id: stableId('trg', relation.relation_id, unit?.entry_id || 'book', reason),
    relation_id: relation.relation_id,
    resource_id: resource.resource_id,
    target_edition_id: target.edition_id,
    target_unit_id: unit?.entry_id || null,
    reason,
    detail
  }
}

function buildUnitLinks(normalized, relation, target) {
  if (relation.status !== 'matched') return { mappings: [], gaps: [] }
  const resource = normalized.resource
  const targetUnits = target.toc.filter(entry => entry?.entry_id && entry?.title)
  if (!targetUnits.length) {
    return { mappings: [], gaps: [mappingGap(relation, resource, target, null, 'target_structure_unavailable', '目标教材没有可用目录结构。')] }
  }
  if (!resource.sections.length) {
    return {
      mappings: [],
      gaps: targetUnits.map(unit => mappingGap(relation, resource, target, unit, 'resource_structure_unavailable', '配套资源尚未提取目录或章节页段。'))
    }
  }

  const sections = new Map(resource.sections.map(section => [section.section_id, section]))
  const units = new Map(targetUnits.map(unit => [unit.entry_id, unit]))
  const mappings = []
  const gaps = []
  const mappedUnits = new Set()
  const mappedSections = new Set()

  for (const declared of normalized.declared_unit_mappings) {
    const section = sections.get(declared.resource_section_id)
    const unit = units.get(declared.target_unit_id)
    if (!section || !unit) {
      gaps.push(mappingGap(relation, resource, target, unit || null, 'no_compatible_section', `显式映射引用不存在：resource_section=${declared.resource_section_id || 'null'}, target_unit=${declared.target_unit_id || 'null'}。`))
      continue
    }
    mappings.push(mappingFor(relation, resource, section, target, unit, 'explicit_manifest', declared.confidence))
    mappedUnits.add(unit.entry_id)
    mappedSections.add(section.section_id)
  }

  for (const unit of targetUnits) {
    if (mappedUnits.has(unit.entry_id)) continue
    const title = normalizeToken(unit.title)
    const candidates = resource.sections.filter(section => !mappedSections.has(section.section_id) && normalizeToken(section.title) === title)
    if (candidates.length === 1) {
      mappings.push(mappingFor(relation, resource, candidates[0], target, unit, 'exact_normalized_title', 0.96))
      mappedUnits.add(unit.entry_id)
      mappedSections.add(candidates[0].section_id)
    } else if (candidates.length > 1) {
      gaps.push(mappingGap(relation, resource, target, unit, 'ambiguous_section', `资源中有 ${candidates.length} 个同名章节。`))
    } else {
      gaps.push(mappingGap(relation, resource, target, unit, 'no_compatible_section', '未找到与目标教材单元标题一致的资源章节。'))
    }
  }
  return { mappings, gaps }
}

function addIndex(index, key, value) {
  if (!key) return
  index[key] ||= []
  if (!index[key].includes(value)) index[key].push(value)
}

function sortedIndex(index) {
  return Object.fromEntries(Object.entries(index)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => [key, [...values].sort()]))
}

/** Build book-level and unit-level forward/reverse support-resource indexes. */
export function buildTextbookResourceCatalog({ resources, targets, structures = {}, generatedAt = new Date().toISOString() }) {
  const normalized = resources.map((input, index) => input.resource && input.declared_unit_mappings
    ? input
    : normalizeResourceInput(input, { sourceRef: `resources[${index}]` }))
  normalized.forEach(item => assertResourcePageBounds(item.resource))
  const projectedTargets = targets
    .filter(target => target.resource_type === 'student_textbook')
    .map(target => targetProjection(target, structures[target.edition_id]))
  const pairings = normalized.map(item => pairResource(item.resource, projectedTargets))
  const targetById = new Map(projectedTargets.map(target => [target.edition_id, target]))
  const unitMappings = []
  const unitMappingGaps = []
  for (let index = 0; index < normalized.length; index += 1) {
    const relation = pairings[index]
    for (const declared of normalized[index].declared_unit_mappings) {
      if (declared.target_edition_id && declared.target_edition_id !== relation.target_edition_id) {
        throw new Error(`explicit unit mapping target conflicts with final textbook pairing: resource=${normalized[index].resource.resource_id}, declared=${declared.target_edition_id}, paired=${relation.target_edition_id || 'unmatched'}`)
      }
    }
    const target = relation.target_edition_id ? targetById.get(relation.target_edition_id) : null
    if (!target) continue
    const links = buildUnitLinks(normalized[index], relation, target)
    unitMappings.push(...links.mappings)
    unitMappingGaps.push(...links.gaps)
  }

  const indexes = { by_textbook: {}, by_resource: {}, by_textbook_unit: {}, by_resource_section: {} }
  for (const pairing of pairings) {
    addIndex(indexes.by_resource, pairing.resource_id, pairing.relation_id)
    if (pairing.target_edition_id) addIndex(indexes.by_textbook, pairing.target_edition_id, pairing.relation_id)
  }
  for (const mapping of unitMappings) {
    addIndex(indexes.by_textbook_unit, mapping.target_unit_id, mapping.mapping_id)
    addIndex(indexes.by_resource_section, mapping.resource_section_id, mapping.mapping_id)
  }

  return {
    schema_version: 1,
    generated_at: generatedAt,
    resources: normalized.map(item => resourceForCatalog(item.resource)).sort((left, right) => left.resource_id.localeCompare(right.resource_id)),
    pairings: pairings.sort((left, right) => left.relation_id.localeCompare(right.relation_id)),
    unit_mappings: unitMappings.sort((left, right) => left.mapping_id.localeCompare(right.mapping_id)),
    unit_mapping_gaps: unitMappingGaps.sort((left, right) => left.gap_id.localeCompare(right.gap_id)),
    indexes: {
      by_textbook: sortedIndex(indexes.by_textbook),
      by_resource: sortedIndex(indexes.by_resource),
      by_textbook_unit: sortedIndex(indexes.by_textbook_unit),
      by_resource_section: sortedIndex(indexes.by_resource_section)
    }
  }
}

/**
 * Project the resource graph into the compact shape already consumed by
 * textbook detail pages.  This keeps the catalog as the source of truth while
 * preserving the existing API contract.
 */
export function projectRelatedResourcesForTextbook(catalog, editionId) {
  const resources = new Map((catalog.resources || []).map(resource => [resource.resource_id, resource]))
  return (catalog.pairings || [])
    .filter(pairing => pairing.status === 'matched' && pairing.target_edition_id === editionId)
    .map(pairing => {
      const resource = resources.get(pairing.resource_id)
      if (!resource) return null
      return {
        relation_id: pairing.relation_id,
        resource_edition_id: resource.edition_id,
        resource_type: resource.resource_type,
        title: resource.bibliography.title,
        relationship: pairing.relationship,
        confidence: pairing.confidence,
        review_status: 'machine_checked'
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.relation_id.localeCompare(right.relation_id))
}

/**
 * Project concrete resource section/page mappings into a textbook unit API row.
 * Reader availability comes from the verified public asset registry rather than
 * the support-resource manifest, which may intentionally contain metadata-only
 * resources that do not have a public detail or reader route yet.
 */
export function projectRelatedResourcesForUnit(catalog, editionId, unitId, { readableEditionIds = new Set() } = {}) {
  const pairings = new Map((catalog.pairings || []).map(pairing => [pairing.relation_id, pairing]))
  const resources = new Map((catalog.resources || []).map(resource => [resource.resource_id, resource]))
  return (catalog.unit_mappings || [])
    .filter(mapping => mapping.target_edition_id === editionId && mapping.target_unit_id === unitId)
    .map(mapping => {
      const pairing = pairings.get(mapping.relation_id)
      const resource = resources.get(mapping.resource_id)
      const section = resource?.sections.find(candidate => candidate.section_id === mapping.resource_section_id)
      if (!pairing || pairing.status !== 'matched' || !resource || !section) return null
      return {
        relation_id: pairing.relation_id,
        resource_edition_id: resource.edition_id,
        resource_type: resource.resource_type,
        title: resource.bibliography.title,
        relationship: pairing.relationship,
        confidence: Math.min(pairing.confidence, mapping.confidence),
        review_status: 'machine_checked',
        mapping_id: mapping.mapping_id,
        resource_id: resource.resource_id,
        resource_section_id: section.section_id,
        resource_section_title: section.title,
        resource_reading_available: readableEditionIds.has(resource.edition_id),
        resource_pdf_page_start: mapping.resource_pdf_page_start,
        resource_pdf_page_end: mapping.resource_pdf_page_end,
        target_pdf_page_start: mapping.target_pdf_page_start,
        target_pdf_page_end: mapping.target_pdf_page_end
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.mapping_id.localeCompare(right.mapping_id))
}

export function buildResourceImportPlan(resource, { libraryRoot = null, r2Bucket = 'kebiao-textbooks' } = {}) {
  const asset = resource.asset
  if (asset.availability !== 'available' || !asset.sha256 || !asset.object_path) {
    return {
      resource_id: resource.resource_id,
      asset_id: asset.asset_id,
      status: 'blocked',
      reason: asset.availability === 'manifest_only' ? 'asset_manifest_only' : 'asset_unavailable',
      local: null,
      r2: null
    }
  }
  return {
    resource_id: resource.resource_id,
    asset_id: asset.asset_id,
    status: 'ready',
    reason: null,
    local: {
      source_path: asset.source_path,
      destination_path: libraryRoot ? `${String(libraryRoot).replace(/\/$/, '')}/${asset.object_path}` : asset.object_path,
      sha256: asset.sha256,
      bytes: asset.bytes
    },
    r2: {
      bucket: asset.r2_bucket || r2Bucket,
      key: asset.r2_key || asset.object_path,
      content_type: 'application/pdf',
      sha256: asset.sha256,
      bytes: asset.bytes
    }
  }
}

function indexValues(index) {
  return Object.values(index).flat().sort()
}

/** Audit references, stable identifiers, page ranges and forward/reverse index parity. */
export function auditTextbookResourceCatalog(catalog) {
  const errors = []
  const warnings = []
  const resources = new Map()
  const pairings = new Map()
  const mappings = new Map()

  for (const resource of catalog.resources || []) {
    if (resources.has(resource.resource_id)) errors.push(`duplicate resource_id: ${resource.resource_id}`)
    resources.set(resource.resource_id, resource)
    if (!/^res_[a-f0-9]{24}$/.test(resource.resource_id)) errors.push(`invalid stable resource_id: ${resource.resource_id}`)
    if (!/^ed_[a-z0-9]+$/i.test(resource.edition_id)) errors.push(`invalid resource edition_id: ${resource.edition_id}`)
    if (!/^asset_[a-z0-9]+$/i.test(resource.asset?.asset_id || '')) errors.push(`invalid resource asset_id: ${resource.asset?.asset_id}`)
    const sectionIds = new Set()
    for (const section of resource.sections || []) {
      if (sectionIds.has(section.section_id)) errors.push(`duplicate resource section_id: ${section.section_id}`)
      sectionIds.add(section.section_id)
      if (section.parent_id && !resource.sections.some(candidate => candidate.section_id === section.parent_id)) errors.push(`missing section parent: ${section.section_id} -> ${section.parent_id}`)
      if (section.pdf_page_start !== null && section.pdf_page_end !== null && section.pdf_page_end < section.pdf_page_start) errors.push(`invalid section page range: ${section.section_id}`)
      if (resource.asset?.availability === 'available' && section.pdf_page_start !== null && section.pdf_page_start > resource.asset.pages) errors.push(`section start page exceeds asset pages: ${section.section_id}`)
      if (resource.asset?.availability === 'available' && section.pdf_page_end !== null && section.pdf_page_end > resource.asset.pages) errors.push(`section end page exceeds asset pages: ${section.section_id}`)
    }
    if (resource.asset?.availability === 'available') {
      const expected = `objects/sha256/${resource.asset.sha256?.slice(0, 2)}/${resource.asset.sha256}.pdf`
      if (resource.asset.object_path !== expected) errors.push(`non-content-addressed object_path: ${resource.resource_id}`)
      for (const entry of resource.page_map || []) {
        if (entry.pdf_page > resource.asset.pages) errors.push(`page map exceeds asset pages: ${resource.resource_id}:${entry.pdf_page}`)
      }
    }
    if (resource.asset?.source_path || resource.asset?.local_path) errors.push(`catalog exposes a local asset path: ${resource.resource_id}`)
    if (isAbsoluteLocalReference(resource.asset?.object_path) || isAbsoluteLocalReference(resource.asset?.r2_key)) {
      errors.push(`catalog exposes an absolute object path: ${resource.resource_id}`)
    }
    if (isAbsoluteLocalReference(resource.provenance?.source_ref) || isAbsoluteLocalReference(resource.provenance?.generated_from)) {
      errors.push(`catalog exposes an absolute provenance path: ${resource.resource_id}`)
    }
  }

  for (const pairing of catalog.pairings || []) {
    if (pairings.has(pairing.relation_id)) errors.push(`duplicate relation_id: ${pairing.relation_id}`)
    pairings.set(pairing.relation_id, pairing)
    if (!resources.has(pairing.resource_id)) errors.push(`pairing references missing resource: ${pairing.relation_id}`)
    if (pairing.status === 'matched' && !pairing.target_edition_id) errors.push(`matched pairing has no target: ${pairing.relation_id}`)
    if (pairing.status !== 'matched' && pairing.target_edition_id) errors.push(`unmatched pairing selected a target: ${pairing.relation_id}`)
    if (pairing.status !== 'matched') warnings.push(`unmatched resource ${pairing.resource_id}: ${pairing.reason}`)
  }

  for (const mapping of catalog.unit_mappings || []) {
    if (mappings.has(mapping.mapping_id)) errors.push(`duplicate mapping_id: ${mapping.mapping_id}`)
    mappings.set(mapping.mapping_id, mapping)
    const pairing = pairings.get(mapping.relation_id)
    const resource = resources.get(mapping.resource_id)
    if (!pairing || pairing.status !== 'matched') errors.push(`unit mapping references non-matched relation: ${mapping.mapping_id}`)
    if (pairing?.target_edition_id !== mapping.target_edition_id) errors.push(`unit mapping target differs from relation: ${mapping.mapping_id}`)
    if (!resource?.sections.some(section => section.section_id === mapping.resource_section_id)) errors.push(`unit mapping references missing section: ${mapping.mapping_id}`)
    if (mapping.resource_pdf_page_start !== null && mapping.resource_pdf_page_end !== null && mapping.resource_pdf_page_end < mapping.resource_pdf_page_start) errors.push(`invalid mapping resource page range: ${mapping.mapping_id}`)
    if (resource?.asset?.availability === 'available' && mapping.resource_pdf_page_start !== null && mapping.resource_pdf_page_start > resource.asset.pages) errors.push(`mapping resource start page exceeds asset pages: ${mapping.mapping_id}`)
    if (resource?.asset?.availability === 'available' && mapping.resource_pdf_page_end !== null && mapping.resource_pdf_page_end > resource.asset.pages) errors.push(`mapping resource end page exceeds asset pages: ${mapping.mapping_id}`)
    if (mapping.target_pdf_page_start !== null && mapping.target_pdf_page_end !== null && mapping.target_pdf_page_end < mapping.target_pdf_page_start) errors.push(`invalid mapping target page range: ${mapping.mapping_id}`)
  }

  const expectedByTextbook = (catalog.pairings || []).filter(pairing => pairing.target_edition_id).map(pairing => pairing.relation_id).sort()
  const expectedByResource = (catalog.pairings || []).map(pairing => pairing.relation_id).sort()
  const expectedByUnit = (catalog.unit_mappings || []).map(mapping => mapping.mapping_id).sort()
  const actualByTextbook = indexValues(catalog.indexes?.by_textbook || {})
  const actualByResource = indexValues(catalog.indexes?.by_resource || {})
  const actualByUnit = indexValues(catalog.indexes?.by_textbook_unit || {})
  const actualBySection = indexValues(catalog.indexes?.by_resource_section || {})
  if (JSON.stringify(expectedByTextbook) !== JSON.stringify(actualByTextbook)) errors.push('by_textbook reverse index does not match pairings')
  if (JSON.stringify(expectedByResource) !== JSON.stringify(actualByResource)) errors.push('by_resource reverse index does not match pairings')
  if (JSON.stringify(expectedByUnit) !== JSON.stringify(actualByUnit)) errors.push('by_textbook_unit reverse index does not match unit mappings')
  if (JSON.stringify(expectedByUnit) !== JSON.stringify(actualBySection)) errors.push('by_resource_section reverse index does not match unit mappings')

  return {
    valid: errors.length === 0,
    summary: {
      resources: resources.size,
      matched_resources: [...pairings.values()].filter(pairing => pairing.status === 'matched').length,
      unmatched_resources: [...pairings.values()].filter(pairing => pairing.status !== 'matched').length,
      unit_mappings: mappings.size,
      unit_mapping_gaps: (catalog.unit_mapping_gaps || []).length,
      import_ready_assets: [...resources.values()].filter(resource => resource.asset.availability === 'available').length,
      manifest_only_assets: [...resources.values()].filter(resource => resource.asset.availability === 'manifest_only').length
    },
    errors,
    warnings
  }
}
