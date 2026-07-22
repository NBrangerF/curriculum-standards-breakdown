import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.argv[2] || 'public/data/textbooks')
const projectRoot = resolve(import.meta.dirname, '../..')
const derivedRoot = join(projectRoot, 'data/textbooks/derived/by-edition')
const errors = []
const forbiddenKeys = new Set(['object_path', 'repository_path', 'sha256', 'asset_sha256', 'git_object', 'source_commit', 'source_id'])
const absolutePathPattern = /(?:\/Volumes\/|\/Users\/|[A-Za-z]:\\)/
const nonInstructionalEvidencePattern = /(?:印[、，]?装质量|联系调换|出版发行|版权所有|\bISBN\b|(?:图书|本书)定价|定价[:：]\s*[¥￥]?\d)/i
const placeholderEvidencePattern = /^[\s.…·•—_-]+$/u

function inspect(value, path = '$') {
  if (Array.isArray(value)) return value.forEach((item, index) => inspect(item, `${path}[${index}]`))
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && absolutePathPattern.test(value)) errors.push(`${path} contains a local absolute path`)
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) errors.push(`${path}.${key} is private and must not be published`)
    inspect(child, `${path}.${key}`)
  }
}

if (!existsSync(join(root, 'index.json'))) errors.push('index.json is missing')
else {
  const catalog = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'))
  inspect(catalog)
  const ids = catalog.items.map(item => item.edition_id)
  if (new Set(ids).size !== ids.length) errors.push('catalog contains duplicate edition_id values')
  if (catalog.manifest.count !== catalog.items.length) errors.push('manifest count does not match catalog length')
  for (const item of catalog.items) {
    if (!Number.isInteger(item.page_count) || item.page_count < 1) errors.push(`${item.edition_id} has invalid page_count`)
    if (!existsSync(join(root, 'by-edition', `${item.edition_id}.json`))) errors.push(`${item.edition_id} detail is missing`)
  }
}

const details = new Map()
if (existsSync(join(root, 'by-edition'))) {
  for (const file of readdirSync(join(root, 'by-edition')).filter(name => name.endsWith('.json'))) {
    const detail = JSON.parse(readFileSync(join(root, 'by-edition', file), 'utf8'))
    inspect(detail, `by-edition/${file}`)
    details.set(detail.edition_id, detail)

    const nodeIds = new Set()
    const tocIds = new Set((detail.toc || []).map(entry => entry.entry_id))
    for (const node of detail.content_nodes || []) {
      if (nodeIds.has(node.node_id)) errors.push(`${detail.edition_id} contains duplicate content node ${node.node_id}`)
      nodeIds.add(node.node_id)
      if (!Number.isInteger(node.pdf_page) || !Number.isInteger(node.end_pdf_page)
        || node.pdf_page < 1 || node.end_pdf_page < node.pdf_page || node.end_pdf_page > detail.page_count) {
        errors.push(`${detail.edition_id} content node ${node.node_id} has an invalid page range`)
      }
      if (node.unit_id && !tocIds.has(node.unit_id)) {
        errors.push(`${detail.edition_id} content node ${node.node_id} references missing unit ${node.unit_id}`)
      }
    }
    for (const node of detail.content_nodes || []) {
      if (node.parent_id && !nodeIds.has(node.parent_id) && !tocIds.has(node.parent_id)) {
        errors.push(`${detail.edition_id} content node ${node.node_id} references missing parent ${node.parent_id}`)
      }
    }

    const spanIds = new Set()
    for (const span of detail.evidence_spans || []) {
      if (spanIds.has(span.evidence_span_id)) errors.push(`${detail.edition_id} contains duplicate evidence span ${span.evidence_span_id}`)
      spanIds.add(span.evidence_span_id)
      if (!nodeIds.has(span.node_id)) errors.push(`${detail.edition_id} evidence span ${span.evidence_span_id} references missing node ${span.node_id}`)
      if (!Number.isInteger(span.pdf_page) || span.pdf_page < 1 || span.pdf_page > detail.page_count) {
        errors.push(`${detail.edition_id} evidence span ${span.evidence_span_id} has an invalid PDF page`)
      }
      if (['objective', 'activity', 'exercise'].includes(span.evidence_role)
        && nonInstructionalEvidencePattern.test(span.excerpt)) {
        errors.push(`${detail.edition_id} evidence span ${span.evidence_span_id} classifies front-matter or TOC text as ${span.evidence_role}`)
      }
      if (['objective', 'activity', 'exercise'].includes(span.evidence_role)
        && placeholderEvidencePattern.test(span.excerpt)) {
        errors.push(`${detail.edition_id} evidence span ${span.evidence_span_id} contains only placeholder punctuation`)
      }
    }

    const alignmentIds = new Set()
    for (const alignment of detail.alignments || []) {
      if (alignmentIds.has(alignment.alignment_id)) errors.push(`${detail.edition_id} contains duplicate alignment ${alignment.alignment_id}`)
      alignmentIds.add(alignment.alignment_id)
      if (alignment.node_id && !nodeIds.has(alignment.node_id)) {
        errors.push(`${detail.edition_id} alignment ${alignment.alignment_id} references missing node ${alignment.node_id}`)
      }
      for (const spanId of alignment.evidence_span_ids || []) {
        if (!spanIds.has(spanId)) errors.push(`${detail.edition_id} alignment ${alignment.alignment_id} references missing evidence span ${spanId}`)
      }
      if (['curriculum_scope', 'adjacent_curriculum_scope'].includes(alignment.relation_type)) {
        errors.push(`${detail.edition_id} alignment ${alignment.alignment_id} illegally mixes curriculum scope into specific evidence`)
      }
      if (alignment.provenance === 'machine_generated'
        && (alignment.review_status !== 'machine_checked' || alignment.publication_status !== 'published')) {
        errors.push(`${detail.edition_id} automatic alignment ${alignment.alignment_id} must be machine_checked and published`)
      }
    }

    const derivedPath = join(derivedRoot, file)
    if (!existsSync(derivedPath)) errors.push(`${detail.edition_id} derived source is missing`)
    else {
      const derived = JSON.parse(readFileSync(derivedPath, 'utf8'))
      const expected = (derived.alignments || []).filter(alignment =>
        ['approved', 'machine_checked'].includes(alignment.review_status)
        && alignment.publication_status !== 'review_queue'
      )
      const expectedById = new Map(expected.map(alignment => [alignment.alignment_id, alignment]))
      if (expectedById.size !== alignmentIds.size) {
        errors.push(`${detail.edition_id} public alignment count ${alignmentIds.size} does not match derived ${expectedById.size}`)
      }
      for (const alignment of detail.alignments || []) {
        const source = expectedById.get(alignment.alignment_id)
        if (!source) {
          errors.push(`${detail.edition_id} public alignment ${alignment.alignment_id} is absent from derived source`)
          continue
        }
        for (const field of ['standard_code', 'unit_id', 'node_id', 'pdf_page']) {
          if ((alignment[field] ?? null) !== (source[field] ?? null)) {
            errors.push(`${detail.edition_id} alignment ${alignment.alignment_id} differs from derived field ${field}`)
          }
        }
        const publicSpans = [...(alignment.evidence_span_ids || [])].sort().join(',')
        const sourceSpans = [...(source.evidence_span_ids || [])].sort().join(',')
        if (publicSpans !== sourceSpans) errors.push(`${detail.edition_id} alignment ${alignment.alignment_id} differs from derived evidence spans`)
      }
    }
  }
}

const reversePath = join(root, 'standards-to-textbooks.json')
if (!existsSync(reversePath)) errors.push('standards-to-textbooks.json is missing')
else {
  const reverse = JSON.parse(readFileSync(reversePath, 'utf8'))
  inspect(reverse, 'standards-to-textbooks.json')
  for (const [standardCode, links] of Object.entries(reverse.items || {})) {
    for (const link of links) {
      const detail = details.get(link.edition_id)
      const alignment = (detail?.alignments || []).find(candidate => candidate.alignment_id === link.alignment_id)
      if (!alignment) errors.push(`reverse link ${standardCode}/${link.alignment_id} has no canonical alignment`)
      else {
        if (alignment.standard_code !== standardCode) errors.push(`reverse link ${link.alignment_id} uses the wrong standard code`)
        for (const field of ['unit_id']) {
          if ((link[field] ?? null) !== (alignment[field] ?? null)) {
            errors.push(`reverse link ${link.alignment_id} differs from canonical field ${field}`)
          }
        }
        if (Number.isInteger(alignment.pdf_page) && link.pdf_page !== alignment.pdf_page) errors.push(`reverse link ${link.alignment_id} differs from canonical field pdf_page`)
        if (alignment.node_id && link.node_id !== alignment.node_id) errors.push(`reverse link ${link.alignment_id} differs from canonical field node_id`)
        const spanIds = alignment.evidence_span_ids || []
        if (spanIds.length) {
          const firstSpan = (detail.evidence_spans || []).find(span => span.evidence_span_id === spanIds[0])
          if (!firstSpan) errors.push(`reverse link ${link.alignment_id} references a missing first evidence span`)
          else if (link.evidence_excerpt !== firstSpan.excerpt || link.evidence_excerpt_hash !== firstSpan.excerpt_hash) {
            errors.push(`reverse link ${link.alignment_id} does not preserve its evidence excerpt`)
          }
        }
      }
    }
  }
  for (const detail of details.values()) {
    for (const alignment of detail.alignments || []) {
      const links = reverse.items?.[alignment.standard_code] || []
      if (!links.some(link => link.edition_id === detail.edition_id && link.alignment_id === alignment.alignment_id)) {
        errors.push(`${detail.edition_id} alignment ${alignment.alignment_id} is missing from reverse index`)
      }
    }
  }
}

const pageContextRoot = join(root, 'page-context/by-edition')
if (!existsSync(pageContextRoot)) errors.push('page-context/by-edition is missing')
else {
  for (const detail of details.values()) {
    const indexPath = join(pageContextRoot, `${detail.edition_id}.json`)
    if (!existsSync(indexPath)) {
      errors.push(`${detail.edition_id} page context index is missing`)
      continue
    }
    const index = JSON.parse(readFileSync(indexPath, 'utf8'))
    inspect(index, `page-context/by-edition/${detail.edition_id}.json`)
    if (index.edition_id !== detail.edition_id) errors.push(`${detail.edition_id} page context index has the wrong edition_id`)
    const nodeIds = new Set((detail.content_nodes || []).map(node => node.node_id))
    const spanIds = new Set((detail.evidence_spans || []).map(span => span.evidence_span_id))
    const alignments = new Map((detail.alignments || []).map(alignment => [alignment.alignment_id, alignment]))
    const indexedAlignmentIds = new Set()
    for (const [pageKey, page] of Object.entries(index.pages || {})) {
      const pdfPage = Number(pageKey)
      if (!Number.isInteger(pdfPage) || pdfPage < 1 || pdfPage > detail.page_count) errors.push(`${detail.edition_id} page context has invalid page ${pageKey}`)
      for (const nodeId of page.node_ids || []) if (!nodeIds.has(nodeId)) errors.push(`${detail.edition_id} page ${pageKey} references missing node ${nodeId}`)
      for (const spanId of page.evidence_span_ids || []) if (!spanIds.has(spanId)) errors.push(`${detail.edition_id} page ${pageKey} references missing span ${spanId}`)
      for (const alignmentId of page.alignment_ids || []) {
        indexedAlignmentIds.add(alignmentId)
        const alignment = alignments.get(alignmentId)
        if (!alignment) errors.push(`${detail.edition_id} page ${pageKey} references missing alignment ${alignmentId}`)
        else if (['curriculum_scope', 'adjacent_curriculum_scope'].includes(alignment.relation_type)) {
          errors.push(`${detail.edition_id} page ${pageKey} contains a curriculum scope relation`)
        }
      }
    }
    for (const alignment of alignments.values()) {
      if (!indexedAlignmentIds.has(alignment.alignment_id)) {
        errors.push(`${detail.edition_id} alignment ${alignment.alignment_id} is absent from page context`)
      }
      const requiredPages = new Set()
      if (Number.isInteger(alignment.pdf_page)) requiredPages.add(alignment.pdf_page)
      for (const spanId of alignment.evidence_span_ids || []) {
        const span = (detail.evidence_spans || []).find(candidate => candidate.evidence_span_id === spanId)
        if (span) requiredPages.add(span.pdf_page)
      }
      for (const pdfPage of requiredPages) {
        if (!(index.pages?.[String(pdfPage)]?.alignment_ids || []).includes(alignment.alignment_id)) {
          errors.push(`${detail.edition_id} alignment ${alignment.alignment_id} is missing from page ${pdfPage} context`)
        }
      }
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(JSON.stringify({ valid: true, root }, null, 2))
}
