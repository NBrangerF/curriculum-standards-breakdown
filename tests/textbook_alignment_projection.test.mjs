import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildTextbookAlignmentPageContextIndex,
  projectTextbookAlignments,
  textbookAlignmentEvidenceClaims
} from '../scripts/textbooks/textbook_alignment_projection.js'

function fixture() {
  const evidenceSpans = [{
    evidence_span_id: 'span_read', node_id: 'lesson_read', pdf_page: 13, printed_page: '8',
    excerpt: '读出这个数。', excerpt_hash: 'read-hash',
    bbox: { x: 10, y: 20, width: 100, height: 20, unit: 'pdf_point', page_width: 500, page_height: 700 }
  }, {
    evidence_span_id: 'span_write', node_id: 'lesson_write', pdf_page: 35, printed_page: '30',
    excerpt: '写出这个数。', excerpt_hash: 'write-hash',
    bbox: { x: 30, y: 40, width: 120, height: 24, unit: 'pdf_point', page_width: 500, page_height: 700 }
  }]
  const common = {
    edition_id: 'ed_math', unit_id: 'unit_numbers', standard_code: 'MA-D2-AL-001',
    standard_text: '认识自然数。', subject_slug: 'math', grade_band: 'H2', relation_type: 'practices',
    evidence_level: 'L3', review_status: 'machine_checked', publication_status: 'published'
  }
  const alignments = [{
    ...common, alignment_id: 'alignment_read', node_id: 'lesson_read', pdf_page: 13, printed_page: '8',
    evidence_span_ids: ['span_read'], evidence_quote: '读出这个数', evidence_excerpt: '读出这个数。',
    learning_component_ids: ['lc_read'], learning_components: [{ component_id: 'lc_read', label: '认读自然数' }],
    rationale: '教材要求认读。', confidence: 0.88
  }, {
    ...common, alignment_id: 'alignment_write', node_id: 'lesson_write', pdf_page: 35, printed_page: '30',
    evidence_span_ids: ['span_write'], evidence_quote: '写出这个数', evidence_excerpt: '写出这个数。',
    learning_component_ids: ['lc_write'], learning_components: [{ component_id: 'lc_write', label: '书写自然数' }],
    rationale: '教材要求书写。', confidence: 0.94
  }]
  return { evidenceSpans, alignments }
}

test('public projection renders one relationship card without losing claim components, locators or bboxes', () => {
  const { evidenceSpans, alignments } = fixture()
  const projected = projectTextbookAlignments(alignments, evidenceSpans)
  assert.equal(projected.length, 1)
  const card = projected[0]
  assert.equal(card.alignment_id, 'alignment_read')
  assert.deepEqual(card.alignment_ids, ['alignment_read', 'alignment_write'])
  assert.deepEqual(card.evidence_span_ids, ['span_read', 'span_write'])
  assert.deepEqual(card.learning_component_ids, ['lc_read', 'lc_write'])
  assert.deepEqual(card.learning_components.map(component => component.label), ['认读自然数', '书写自然数'])
  assert.equal(card.evidence_claim_count, 2)
  assert.deepEqual(card.supporting_evidence.map(claim => ({
    page: claim.pdf_page,
    node: claim.node_id,
    components: claim.learning_component_ids,
    bbox: claim.bbox
  })), [{
    page: 13, node: 'lesson_read', components: ['lc_read'], bbox: evidenceSpans[0].bbox
  }, {
    page: 35, node: 'lesson_write', components: ['lc_write'], bbox: evidenceSpans[1].bbox
  }])

  // Reverse-link projection consumes the same lossless claims.
  assert.deepEqual(
    textbookAlignmentEvidenceClaims(card, evidenceSpans).map(claim => [claim.pdf_page, claim.evidence_span_id, claim.learning_component_ids]),
    [[13, 'span_read', ['lc_read']], [35, 'span_write', ['lc_write']]]
  )
})

test('page context indexes the grouped card on every evidence page but keeps span IDs page-local', () => {
  const { evidenceSpans, alignments } = fixture()
  const [alignment] = projectTextbookAlignments(alignments, evidenceSpans)
  const detail = {
    edition_id: 'ed_math',
    content_nodes: [
      { node_id: 'lesson_read', unit_id: 'unit_numbers', pdf_page: 13, end_pdf_page: 14 },
      { node_id: 'lesson_write', unit_id: 'unit_numbers', pdf_page: 35, end_pdf_page: 36 }
    ],
    evidence_spans: evidenceSpans,
    alignments: [alignment]
  }
  const context = buildTextbookAlignmentPageContextIndex(detail)
  assert.deepEqual(context.pages['13'].alignment_ids, ['alignment_read'])
  assert.deepEqual(context.pages['35'].alignment_ids, ['alignment_read'])
  assert.ok(context.pages['13'].evidence_span_ids.includes('span_read'))
  assert.ok(!context.pages['13'].evidence_span_ids.includes('span_write'))
  assert.ok(context.pages['35'].evidence_span_ids.includes('span_write'))
  assert.ok(!context.pages['35'].evidence_span_ids.includes('span_read'))
})

test('reverse-link projection preserves spanless approved claims and their empty component scope', () => {
  const { evidenceSpans, alignments } = fixture()
  const approvedUnitClaim = {
    ...alignments[0],
    alignment_id: 'alignment_approved_unit',
    node_id: null,
    pdf_page: null,
    printed_page: null,
    evidence_span_ids: [],
    evidence_quote: null,
    evidence_excerpt: null,
    learning_component_ids: [],
    learning_components: [],
    rationale: '人工批准的单元级关系。',
    review_status: 'approved'
  }
  const [card] = projectTextbookAlignments([...alignments, approvedUnitClaim], evidenceSpans)
  const reverseClaims = textbookAlignmentEvidenceClaims(card, evidenceSpans)

  assert.equal(card.alignment_id, 'alignment_approved_unit')
  assert.equal(card.supporting_evidence.length, 3)
  assert.deepEqual(
    reverseClaims.map(claim => [claim.alignment_id, claim.evidence_span_id, claim.pdf_page]),
    card.supporting_evidence.map(claim => [claim.alignment_id, claim.evidence_span_id, claim.pdf_page])
  )
  const preserved = reverseClaims.find(claim => claim.alignment_id === 'alignment_approved_unit')
  assert.equal(preserved.node_id, null)
  assert.equal(preserved.pdf_page, null)
  assert.deepEqual(preserved.learning_component_ids, [])
  assert.deepEqual(preserved.learning_components, [])

  const [projectedAgain] = projectTextbookAlignments([card], evidenceSpans)
  const identity = claim => [claim.alignment_id, claim.evidence_span_id, claim.node_id, claim.pdf_page]
  assert.deepEqual(
    projectedAgain.supporting_evidence.map(identity),
    card.supporting_evidence.map(identity)
  )
})
