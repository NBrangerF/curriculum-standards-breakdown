import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  AUTHENTICATED_TOC_RECOVERY_VERSION,
  AUTOMATIC_REVIEW_POLICY,
  assertApprovedAlignmentReferences,
  findAuthenticatedUnitRangeRecovery,
  loadUnitRangeRecoveryCatalog,
  reconcileTextbookUnitRanges,
  UNIT_RANGE_RECONCILER_VERSION
} from '../scripts/textbooks/reconcile_textbook_unit_ranges.js'

const bbox = { x: 10, y: 700, width: 100, height: 20, unit: 'pdf_point', page_width: 520, page_height: 737 }

function page(pdfPage, lines) {
  return {
    pdf_page: pdfPage,
    printed_page: String(pdfPage - 11),
    extraction_method: 'pdfjs_text_layer',
    text: lines.join('\n'),
    lines: lines.map((text, index) => ({ text, bbox: { ...bbox, y: bbox.y - index * 22 } }))
  }
}

function unit(entryId, title, start, end) {
  return {
    entry_id: entryId,
    parent_id: null,
    level: 1,
    kind: 'unit',
    title,
    pdf_page: start,
    end_pdf_page: end,
    printed_page: String(start - 11),
    confidence: 0.98,
    review_status: 'approved'
  }
}

function musicRecovery() {
  return {
    edition_id: 'ed_music_fixture',
    source_asset_sha256: 'a'.repeat(64),
    sidecar_sha256: 'b'.repeat(64),
    printed_to_pdf_offset: 5,
    confidence: 0.99,
    units: [
      { ordinal: 1, title: '歌唱祖国', printed_page_start: 2, printed_page_end: 11, pdf_page_start: 7, pdf_page_end: 16, evidence_pdf_page: 3 },
      { ordinal: 2, title: '缤纷舞曲', printed_page_start: 12, printed_page_end: 21, pdf_page_start: 17, pdf_page_end: 26, evidence_pdf_page: 3 },
      { ordinal: 3, title: '草原牧歌', printed_page_start: 22, printed_page_end: 31, pdf_page_start: 27, pdf_page_end: 36, evidence_pdf_page: 4 },
      { ordinal: 4, title: '欧洲风情', printed_page_start: 32, printed_page_end: 41, pdf_page_start: 37, pdf_page_end: 46, evidence_pdf_page: 5 },
      { ordinal: 5, title: '劳动的歌', printed_page_start: 42, printed_page_end: 51, pdf_page_start: 47, pdf_page_end: 56, evidence_pdf_page: 5 }
    ],
    auxiliary_boundary: { evidence_type: 'authenticated_toc_auxiliary_section_anchor', title: '音乐小网站', printed_page: '52', pdf_page: 57, evidence_pdf_page: 6 }
  }
}

const unit2 = unit('unit_2', 'UNIT 2', 20, 28)
const unit3 = unit('unit_3', 'UNIT 3', 29, 83)
const unit10 = unit('unit_10', 'UNIT 10', 84, 158)

const structure = {
  edition_id: 'ed_english_fixture',
  content_alignment: { source_asset_sha256: 'a'.repeat(64) },
  page_map: Array.from({ length: 139 }, (_, index) => {
    const pdfPage = index + 20
    return { pdf_page: pdfPage, printed_page: String(pdfPage - 11) }
  }),
  toc: [unit2, unit3, unit10],
  content_nodes: [
    {
      node_id: 'root_2', toc_entry_id: 'unit_2', kind: 'unit', title: 'UNIT 2',
      pdf_page: 20, pdf_page_start: 20, pdf_page_end: 28, end_pdf_page: 28,
      unit_id: 'unit_2', parent_id: null
    },
    {
      node_id: 'root_3', toc_entry_id: 'unit_3', kind: 'unit', title: 'UNIT 3',
      pdf_page: 29, pdf_page_start: 29, pdf_page_end: 83, end_pdf_page: 83,
      unit_id: 'unit_3', parent_id: null
    },
    {
      node_id: 'root_10', toc_entry_id: 'unit_10', kind: 'unit', title: 'UNIT 10',
      pdf_page: 84, pdf_page_start: 84, pdf_page_end: 158, end_pdf_page: 158,
      unit_id: 'unit_10', parent_id: null
    },
    {
      node_id: 'page_27', kind: 'page', title: 'PDF 27', pdf_page: 27,
      pdf_page_start: 27, pdf_page_end: 27, end_pdf_page: 27,
      unit_id: 'unit_2', parent_id: 'root_2'
    },
    {
      node_id: 'heading_3_page_28', kind: 'unit', title: 'UNIT 3', pdf_page: 28,
      pdf_page_start: 28, pdf_page_end: 28, end_pdf_page: 28,
      unit_id: 'unit_2', parent_id: 'root_2'
    },
    {
      node_id: 'page_28', kind: 'page', title: 'PDF 28', pdf_page: 28,
      pdf_page_start: 28, pdf_page_end: 28, end_pdf_page: 28,
      unit_id: 'unit_2', parent_id: 'root_2'
    },
    {
      node_id: 'self_check_10', kind: 'exercise', title: 'Self Check', pdf_page: 91,
      pdf_page_start: 91, pdf_page_end: 124, end_pdf_page: 124,
      unit_id: 'unit_10', parent_id: 'heading_10_page_91'
    },
    {
      node_id: 'heading_10_page_91', kind: 'unit', title: 'UNIT 10', pdf_page: 91,
      pdf_page_start: 91, pdf_page_end: 91, end_pdf_page: 91,
      unit_id: 'unit_10', parent_id: 'root_10'
    },
    {
      node_id: 'page_92', kind: 'page', title: 'PDF 92', pdf_page: 92,
      pdf_page_start: 92, pdf_page_end: 92, end_pdf_page: 92,
      unit_id: 'unit_10', parent_id: 'root_10'
    },
    {
      node_id: 'notes_93', kind: 'page_excerpt', title: 'Notes', pdf_page: 93,
      pdf_page_start: 93, pdf_page_end: 93, end_pdf_page: 93,
      unit_id: 'unit_10', parent_id: 'unit_10'
    }
  ]
}

const pages = [
  page(20, ['UNIT 2', 'Section A']),
  page(27, ['UNIT 2', 'Self Check']),
  page(28, ['UNIT 3', 'Section A', "I'm more outgoing than my sister."]),
  page(29, ['UNIT 3', 'Section A continued']),
  page(84, ['UNIT 10', 'Section A']),
  page(91, ['UNIT 10', 'Self Check']),
  page(92, ['Additional Material', 'Additional Material', 'Unit 3, Section A, activity 2c']),
  page(93, ['Notes on the Text', 'Notes on the Text', 'Unit 1 Where did you go on vacation?'])
]

test('exact top headings correct unit starts, ends and content-node ownership', () => {
  const result = reconcileTextbookUnitRanges(structure, pages, {
    sidecarSha256: 'b'.repeat(64)
  })
  const byTitle = new Map(result.structure.toc.map(entry => [entry.title, entry]))
  assert.deepEqual(
    [...byTitle.values()].map(entry => [entry.title, entry.pdf_page, entry.end_pdf_page]),
    [['UNIT 2', 20, 27], ['UNIT 3', 28, 83], ['UNIT 10', 84, 91]]
  )
  assert.equal(byTitle.get('UNIT 3').printed_page, '17')
  assert.equal(byTitle.get('UNIT 10').end_printed_page, '80')
  assert.equal(byTitle.get('UNIT 3').range_review_policy, AUTOMATIC_REVIEW_POLICY)
  assert.equal(byTitle.get('UNIT 3').range_provenance.start_evidence.verbatim_title, 'UNIT 3')
  assert.equal(byTitle.get('UNIT 10').range_provenance.end_evidence.verbatim_title, 'Additional Material')

  const nodes = new Map(result.structure.content_nodes.map(node => [node.node_id, node]))
  assert.deepEqual(
    [nodes.get('root_3').pdf_page_start, nodes.get('root_3').pdf_page_end],
    [28, 83]
  )
  assert.equal(nodes.get('page_28').unit_id, 'unit_3')
  assert.equal(nodes.get('page_28').parent_id, 'root_3')
  assert.equal(nodes.get('heading_3_page_28').unit_id, 'unit_3')
  assert.equal(nodes.get('heading_3_page_28').parent_id, 'root_3')
  assert.equal(nodes.get('self_check_10').pdf_page_end, 91)
  assert.equal(nodes.get('self_check_10').end_pdf_page, 91)
  assert.equal(nodes.get('page_92').unit_id, null)
  assert.equal(nodes.get('page_92').parent_id, null)
  assert.equal(nodes.get('notes_93').unit_id, null)
  assert.equal(nodes.get('notes_93').parent_id, null)

  assert.equal(result.report.algorithm_version, UNIT_RANGE_RECONCILER_VERSION)
  assert.equal(result.report.review_policy, AUTOMATIC_REVIEW_POLICY)
  assert.equal(result.report.publication_gate, false)
  assert.equal(result.report.exact_unit_heading_evidence_count, 3)
  assert.equal(result.report.auxiliary_boundary_evidence.pdf_page, 92)
  assert.equal(result.report.changed_unit_range_count, 3)
  assert.equal(result.report.reassigned_content_node_count, 2)
  assert.equal(result.report.detached_auxiliary_content_node_count, 2)
})

test('reconciliation is idempotent for the same authenticated sidecar', () => {
  const first = reconcileTextbookUnitRanges(structure, pages, {
    sidecarSha256: 'b'.repeat(64)
  })
  const second = reconcileTextbookUnitRanges(first.structure, pages, {
    sidecarSha256: 'b'.repeat(64)
  })
  assert.deepEqual(second.structure, first.structure)
  assert.deepEqual(second.report, first.report)
})

test('body mentions and titles below the top-line evidence window do not move boundaries', () => {
  const untrustedPages = [
    page(20, ['UNIT 2']),
    page(28, ['Lesson task', 'Compare people', 'Read the note', 'Discuss it', 'UNIT 3']),
    page(29, ['A student mentions Unit 3 in a sentence.']),
    page(84, ['UNIT 10']),
    page(92, ['Practice', 'Read', 'Write', 'Discuss', 'Additional Material'])
  ]
  const result = reconcileTextbookUnitRanges(structure, untrustedPages)
  const byTitle = new Map(result.structure.toc.map(entry => [entry.title, entry]))
  assert.equal(byTitle.get('UNIT 3').pdf_page, 29)
  assert.equal(byTitle.get('UNIT 10').end_pdf_page, 158)
  assert.equal(result.report.auxiliary_boundary_evidence, null)
})

test('duplicate or invalid sidecar pages fail closed', () => {
  assert.throws(
    () => reconcileTextbookUnitRanges(structure, [page(28, ['UNIT 3']), page(28, ['UNIT 3'])]),
    /unique positive pdf_page/u
  )
})

test('zero exact boundary evidence fails closed without reassigning content nodes', () => {
  const ungrounded = {
    ...structure,
    content_nodes: structure.content_nodes.map(node => ({ ...node }))
  }
  const result = reconcileTextbookUnitRanges(ungrounded, [
    page(20, ['unrelated body text']),
    page(28, ['another lesson']),
    page(84, ['review page'])
  ])
  assert.equal(result.report.status, 'insufficient_boundary_evidence')
  assert.equal(result.report.exact_unit_heading_evidence_count, 0)
  assert.equal(result.report.reassigned_content_node_count, 0)
  assert.deepEqual(result.structure.content_nodes, ungrounded.content_nodes)
})

test('authenticated TOC recovery replaces repeated worksheet pseudo-units and preserves page-only appendices', () => {
  const fakeUnits = Array.from({ length: 12 }, (_, index) => unit(
    `fake_${index + 1}`,
    ['歌唱祖国', '草原牧歌', '欧洲风情', '劳动的歌'][index % 4],
    70 + index,
    70 + index
  ))
  const recovery = musicRecovery()
  const musicStructure = {
    edition_id: 'ed_music_fixture',
    content_alignment: { source_asset_sha256: 'a'.repeat(64) },
    toc: fakeUnits,
    content_nodes: [
      { node_id: 'body_36', unit_id: 'fake_1', parent_id: 'fake_1', kind: 'exercise', title: '最佳歌手', pdf_page: 36, pdf_page_start: 36, pdf_page_end: 36 },
      { node_id: 'body_37', unit_id: 'fake_2', parent_id: 'fake_2', kind: 'page', title: '欧洲风情', pdf_page: 37, pdf_page_start: 37, pdf_page_end: 37 },
      { node_id: 'appendix_57', unit_id: 'fake_3', parent_id: 'fake_3', kind: 'appendix', title: '音乐小网站', pdf_page: 57, pdf_page_start: 57, pdf_page_end: 57 },
      { node_id: 'worksheet_71', unit_id: 'fake_2', parent_id: 'fake_2', kind: 'exercise', title: '活页习题', pdf_page: 71, pdf_page_start: 71, pdf_page_end: 71 }
    ]
  }
  const pages = Array.from({ length: 82 }, (_, index) => page(index + 1, [`PDF ${index + 1}`]))
  const result = reconcileTextbookUnitRanges(musicStructure, pages, {
    sourceAssetSha256: 'a'.repeat(64),
    sidecarSha256: 'b'.repeat(64),
    authenticatedRecovery: recovery
  })
  assert.equal(result.report.status, 'authenticated_toc_recovered')
  assert.equal(result.report.algorithm_version, AUTHENTICATED_TOC_RECOVERY_VERSION)
  assert.equal(result.report.replaced_top_level_unit_count, 12)
  assert.deepEqual(
    result.structure.toc.map(entry => [entry.title, entry.pdf_page, entry.end_pdf_page]),
    [
      ['歌唱祖国', 7, 16], ['缤纷舞曲', 17, 26], ['草原牧歌', 27, 36],
      ['欧洲风情', 37, 46], ['劳动的歌', 47, 56]
    ]
  )
  assert.ok(result.structure.toc.every(entry => (
    entry.source === 'body_inferred_unit'
      && entry.review_status === 'machine_checked'
      && entry.publication_status === 'published'
      && entry.range_review_policy === AUTOMATIC_REVIEW_POLICY
  )))
  assert.equal(result.structure.audit.approved_toc_entry_count, 0)
  assert.equal(result.structure.audit.machine_checked_toc_entry_count, 5)
  assert.equal(result.structure.audit.published_toc_entry_count, 5)
  const nodes = new Map(result.structure.content_nodes.map(node => [node.node_id, node]))
  assert.equal(nodes.get('body_36').unit_id, result.structure.toc[2].entry_id)
  assert.equal(nodes.get('body_37').unit_id, result.structure.toc[3].entry_id)
  assert.equal(nodes.get('appendix_57').unit_id, null)
  assert.equal(nodes.get('worksheet_71').unit_id, null)

  const second = reconcileTextbookUnitRanges(result.structure, pages, {
    sourceAssetSha256: 'a'.repeat(64),
    sidecarSha256: 'b'.repeat(64),
    authenticatedRecovery: recovery
  })
  assert.deepEqual(second.structure, result.structure)
})

test('authenticated recovery lookup fails closed when an edition points at another source asset', () => {
  const catalog = { items: [{ edition_id: 'ed_music_fixture', source_asset_sha256: 'a'.repeat(64) }] }
  assert.throws(
    () => findAuthenticatedUnitRangeRecovery(catalog, 'ed_music_fixture', 'b'.repeat(64)),
    /source hash mismatch/u
  )
})

test('authenticated recovery rebuilds false TOC and node ownership even when provenance still matches', () => {
  const recovery = musicRecovery()
  const pages = Array.from({ length: 82 }, (_, index) => page(index + 1, [`PDF ${index + 1}`]))
  const initial = reconcileTextbookUnitRanges({
    edition_id: 'ed_music_fixture',
    content_alignment: { source_asset_sha256: 'a'.repeat(64) },
    toc: [unit('old_unit', '旧伪单元', 70, 82)],
    content_nodes: [
      { node_id: 'page_37', toc_entry_id: 'old_unit', unit_id: 'old_unit', parent_id: 'old_unit', kind: 'page', pdf_page: 37, pdf_page_start: 37, pdf_page_end: 37 }
    ]
  }, pages, {
    sourceAssetSha256: 'a'.repeat(64),
    sidecarSha256: 'b'.repeat(64),
    authenticatedRecovery: recovery
  })

  const stale = {
    ...initial.structure,
    // Simulate the build pipeline having regenerated worksheet pseudo-units
    // while leaving the previous authenticated provenance untouched.
    toc: [unit('false_1', '歌唱祖国', 70, 75), unit('false_2', '劳动的歌', 76, 82)],
    content_nodes: [{
      node_id: 'page_37',
      toc_entry_id: 'false_1',
      unit_id: 'false_1',
      parent_id: 'false_1',
      kind: 'page',
      pdf_page: 37,
      pdf_page_start: 37,
      pdf_page_end: 37
    }],
    unit_range_reconciliation: initial.report
  }
  const repaired = reconcileTextbookUnitRanges(stale, pages, {
    sourceAssetSha256: 'a'.repeat(64),
    sidecarSha256: 'b'.repeat(64),
    authenticatedRecovery: recovery
  })

  assert.deepEqual(
    repaired.structure.toc.map(entry => [entry.title, entry.pdf_page, entry.end_pdf_page]),
    [
      ['歌唱祖国', 7, 16], ['缤纷舞曲', 17, 26], ['草原牧歌', 27, 36],
      ['欧洲风情', 37, 46], ['劳动的歌', 47, 56]
    ]
  )
  assert.equal(repaired.report.replaced_top_level_unit_count, 2)
  assert.equal(repaired.structure.content_nodes[0].unit_id, repaired.structure.toc[3].entry_id)
  assert.equal(repaired.structure.content_nodes[0].parent_id, null)
  assert.equal(repaired.structure.content_nodes[0].toc_entry_id, null)
})

test('catalog loader validates an optional sidecar SHA-256', t => {
  const directory = mkdtempSync(join(tmpdir(), 'kebiao-unit-recovery-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const path = join(directory, 'catalog.json')
  writeFileSync(path, `${JSON.stringify({
    schema_version: 1,
    items: [{ ...musicRecovery(), edition_id: 'ed_abc123', sidecar_sha256: 'not-a-sha256' }]
  })}\n`)
  assert.throws(() => loadUnitRangeRecoveryCatalog(path), /invalid sidecar_sha256/u)
})

test('a catalog-authenticated sidecar hash is required, not merely checked when supplied', () => {
  assert.throws(() => reconcileTextbookUnitRanges({
    edition_id: 'ed_music_fixture',
    content_alignment: { source_asset_sha256: 'a'.repeat(64) },
    toc: [],
    content_nodes: []
  }, [page(1, ['PDF 1'])], {
    sourceAssetSha256: 'a'.repeat(64),
    authenticatedRecovery: musicRecovery()
  }), /sidecar hash mismatch/u)
})

test('approved alignments are preserved only while unit, node, span and pages remain current', () => {
  const currentUnit = {
    ...unit('unit_current', '歌唱祖国', 7, 16),
    publication_status: 'published'
  }
  const node = {
    node_id: 'node_current',
    unit_id: currentUnit.entry_id,
    parent_id: null,
    kind: 'page_excerpt',
    pdf_page: 9,
    pdf_page_start: 9,
    pdf_page_end: 9,
    end_pdf_page: 9,
    evidence_span_ids: ['span_current']
  }
  const span = { span_id: 'span_current', node_id: node.node_id, pdf_page: 9 }
  const alignment = {
    alignment_id: 'alignment_approved',
    review_status: 'approved',
    unit_id: currentUnit.entry_id,
    node_id: node.node_id,
    evidence_span_ids: [span.span_id],
    pdf_page: 9,
    end_pdf_page: 9
  }
  const args = {
    structure: { toc: [currentUnit] },
    contentNodes: [node],
    evidenceSpans: [span],
    alignments: [alignment]
  }
  assert.deepEqual(assertApprovedAlignmentReferences(args), { approved_alignment_count: 1 })
  assert.throws(
    () => assertApprovedAlignmentReferences({
      ...args,
      structure: { toc: [{ ...currentUnit, review_status: 'machine_checked', publication_status: 'candidate' }] }
    }),
    /missing or unpublished unit/u
  )
  assert.throws(
    () => assertApprovedAlignmentReferences({ ...args, contentNodes: [] }),
    /missing node/u
  )
  assert.throws(
    () => assertApprovedAlignmentReferences({ ...args, evidenceSpans: [] }),
    /missing or out-of-range evidence span/u
  )
  assert.throws(
    () => assertApprovedAlignmentReferences({
      ...args,
      alignments: [{ ...alignment, pdf_page: 57, end_pdf_page: 57 }]
    }),
    /page outside published unit/u
  )
})
