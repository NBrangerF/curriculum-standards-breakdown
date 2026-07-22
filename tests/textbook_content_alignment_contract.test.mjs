import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isUnassignedPageOnlyAlignment,
  synchronizeContentAlignmentMetadata,
  unassignedPageOnlyAlignmentErrors
} from '../scripts/textbooks/textbook_content_alignment_contract.js'

test('content metadata counts follow the canonical arrays after an LLM overlay', () => {
  const structure = {
    content_alignment: { content_node_count: 1, evidence_span_count: 1, alignment_count: 1 },
    content_nodes: [{ node_id: 'n1' }, { node_id: 'n2' }],
    evidence_spans: [{ evidence_span_id: 's1' }],
    alignments: [{ alignment_id: 'a1' }, { alignment_id: 'a2' }, { alignment_id: 'a3' }]
  }
  assert.equal(synchronizeContentAlignmentMetadata(structure), structure)
  assert.deepEqual(structure.content_alignment, {
    content_node_count: 2,
    evidence_span_count: 1,
    alignment_count: 3
  })
})

test('page-only contract keeps L3 evidence locatable without inventing a TOC unit', () => {
  const alignment = {
    alignment_id: 'a1',
    node_id: 'n1',
    unit_id: 'tpu_page_10',
    unit_title: '未分配单元 · PDF 10',
    unit_assignment_status: 'unassigned_page_only',
    evidence_level: 'L3'
  }
  const node = { node_id: 'n1', unit_id: null, parent_id: null, pdf_page: 10 }
  assert.equal(isUnassignedPageOnlyAlignment(alignment), true)
  assert.deepEqual(unassignedPageOnlyAlignmentErrors(alignment, node), [])

  assert.ok(unassignedPageOnlyAlignmentErrors({ ...alignment, evidence_level: 'L2' }, node).length)
  assert.ok(unassignedPageOnlyAlignmentErrors(alignment, { ...node, unit_id: 'real_unit' }).length)
})
