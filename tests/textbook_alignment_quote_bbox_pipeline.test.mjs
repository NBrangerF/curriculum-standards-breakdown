import assert from 'node:assert/strict'
import test from 'node:test'

import {
  chunkPageLines,
  materializeAlignmentRecords,
  requestItemsForProvider
} from '../scripts/textbooks/run_llm_textbook_standard_alignments.js'

const bbox = (x, y, width, height) => ({
  x,
  y,
  width,
  height,
  unit: 'pdf_point',
  page_width: 600,
  page_height: 800
})

function alignmentItem(span, suffix = '') {
  return {
    item_id: `item_bbox${suffix}`,
    logical_item_id: `discover:ed_bbox:unit_bbox:pages-10-10${suffix}`,
    source_mode: 'discover_scope_sidecar',
    prior_alignment_id: null,
    textbook: {
      edition_id: 'ed_bbox',
      evidence_id: 'evidence_bbox',
      title: '测试教材',
      subject: '数学',
      subject_slug: 'math',
      grade: 4,
      volume: '上册'
    },
    unit: {
      unit_id: 'unit_bbox',
      title: '测试单元',
      assignment_status: 'assigned_toc_unit'
    },
    evidence: [span],
    candidates: [{
      candidate_id: `candidate_bbox${suffix}`,
      standard_code: 'MA-D2-TEST-001',
      standard_text: '能够完成目标能力任务。',
      subject_slug: 'math',
      grade_band: 'H2',
      learning_components: [{ component_id: 'lc_bbox', label: '完成目标能力任务' }]
    }]
  }
}

function acceptedRecord(item, evidenceQuote, hash = 'hash_bbox') {
  return {
    status: 'ok',
    input_hash: hash,
    request_items: [item],
    provenance: { input_hash: hash, prompt_version: 'test' },
    model_output: {
      items: [{
        item_id: item.item_id,
        overall_decision: 'evaluated',
        overall_rationale: '测试。',
        decisions: [{
          candidate_id: item.candidates[0].candidate_id,
          standard_code: item.candidates[0].standard_code,
          decision: 'accept',
          relation_type: 'practices',
          evidence_level: 'L3',
          evidence_span_id: item.evidence[0].evidence_span_id,
          evidence_quote: evidenceQuote,
          learning_component_ids: ['lc_bbox'],
          rationale: '逐字证据直接呈现目标能力任务。'
        }]
      }]
    }
  }
}

test('sidecar chunk retains authenticated source lines but provider input omits them', () => {
  const spans = chunkPageLines(
    { edition_id: 'ed_bbox' },
    { content_alignment: { source_asset_sha256: 'asset_bbox' } },
    {
      pdf_page: 10,
      printed_page: '5',
      extraction_method: 'pdfjs_text_layer',
      lines: [
        { text: '概念介绍', bbox: bbox(10, 10, 100, 12) },
        { text: '完成目标能力任务', bbox: bbox(20, 60, 80, 12) },
        { text: '拓展练习', bbox: bbox(15, 110, 120, 12) }
      ]
    },
    8
  )
  assert.equal(spans.length, 1)
  assert.equal(spans[0].source_lines.length, 3)
  assert.match(JSON.stringify(spans[0]), /source_lines/u)

  const item = alignmentItem(spans[0])
  const providerItems = requestItemsForProvider([item])
  assert.equal('source_lines' in providerItems[0].evidence[0], false)
  assert.equal(item.evidence[0].source_lines.length, 3)
})

test('materialization replaces the broad excerpt box with the exact quote line box', () => {
  const lineBoxes = [
    bbox(10, 10, 100, 12),
    bbox(20, 60, 80, 12),
    bbox(15, 110, 120, 12)
  ]
  const [span] = chunkPageLines(
    { edition_id: 'ed_bbox' },
    { content_alignment: { source_asset_sha256: 'asset_bbox' } },
    {
      pdf_page: 10,
      printed_page: '5',
      extraction_method: 'pdfjs_text_layer',
      lines: [
        { text: '概念介绍', bbox: lineBoxes[0] },
        { text: '完成目标能力任务', bbox: lineBoxes[1] },
        { text: '拓展练习', bbox: lineBoxes[2] }
      ]
    },
    8
  )
  assert.notDeepEqual(span.bbox, lineBoxes[1])

  const item = alignmentItem(span)
  const record = acceptedRecord(item, '目标能力')
  const result = materializeAlignmentRecords([record], new Set([record.input_hash]))
  assert.equal(result.alignments.length, 1)
  assert.deepEqual(result.alignments[0].generated_evidence_span.bbox, lineBoxes[1])
  assert.equal('source_lines' in result.alignments[0].generated_evidence_span, false)
})

test('materialization emits bbox null when quote-to-line mapping cannot be proven', () => {
  const [spanWithLines] = chunkPageLines(
    { edition_id: 'ed_bbox' },
    { content_alignment: { source_asset_sha256: 'asset_bbox' } },
    {
      pdf_page: 10,
      printed_page: '5',
      extraction_method: 'pdfjs_text_layer',
      lines: [{ text: '完成目标能力任务', bbox: bbox(20, 60, 80, 12) }]
    },
    8
  )
  const spanWithoutLines = { ...spanWithLines }
  delete spanWithoutLines.source_lines
  assert.ok(spanWithoutLines.bbox)

  const item = alignmentItem(spanWithoutLines, '_unreliable')
  const record = acceptedRecord(item, '目标能力', 'hash_bbox_unreliable')
  const result = materializeAlignmentRecords([record], new Set([record.input_hash]))
  assert.equal(result.alignments.length, 1)
  assert.equal(result.alignments[0].generated_evidence_span.bbox, null)
})
