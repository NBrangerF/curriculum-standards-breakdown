function asArray(value) {
  return Array.isArray(value) ? value : []
}

export function synchronizeContentAlignmentMetadata(structure) {
  if (!structure?.content_alignment || typeof structure.content_alignment !== 'object') return structure
  structure.content_alignment = {
    ...structure.content_alignment,
    content_node_count: asArray(structure.content_nodes).length,
    evidence_span_count: asArray(structure.evidence_spans).length,
    alignment_count: asArray(structure.alignments).length
  }
  return structure
}

export function isUnassignedPageOnlyAlignment(alignment) {
  return alignment?.unit_assignment_status === 'unassigned_page_only'
}

export function unassignedPageOnlyAlignmentErrors(alignment, node) {
  const errors = []
  if (!isUnassignedPageOnlyAlignment(alignment)) {
    errors.push('unit_assignment_status must be unassigned_page_only')
    return errors
  }
  if (!String(alignment?.unit_id || '').startsWith('tpu_')) errors.push('unit_id must use the tpu_ synthetic-page prefix')
  if (!String(alignment?.unit_title || '').startsWith('未分配单元 · PDF ')) errors.push('unit_title must identify an unassigned PDF page window')
  if (alignment?.evidence_level !== 'L3') errors.push('unassigned page-only evidence must be L3')
  if (!node || node.node_id !== alignment?.node_id) errors.push('page-only alignment must reference its canonical content node')
  if (node && (node.unit_id !== null || node.parent_id !== null)) errors.push('page-only content node must remain detached from the published TOC')
  return errors
}
