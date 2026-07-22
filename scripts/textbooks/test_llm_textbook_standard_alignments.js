#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  LLM_ALIGNMENT_PROMPT_VERSION,
  LLM_ALIGNMENT_PROVIDER,
  LLM_ALIGNMENT_SCHEMA_VERSION,
  alignmentInputHash,
  validateAlignmentModelOutput
} from './llm_textbook_standard_alignment_contract.js'
import {
  requestAlignmentAdjudication,
  resolveAlignmentLlmConfig
} from './llm_textbook_standard_alignment_provider.js'
import {
  AlignmentBudget,
  buildDiscoveryItems,
  buildExistingAdjudicationItems,
  materializeAlignmentRecords
} from './run_llm_textbook_standard_alignments.js'
import { planAlignmentApplication } from './apply_llm_textbook_standard_alignments.js'

function fixtureItem() {
  return {
    item_id: 'fixture-item',
    logical_item_id: 'fixture-logical-item',
    source_mode: 'golden_eval',
    textbook: {
      edition_id: 'ed_fixture',
      title: '数学八年级上册',
      subject: '数学',
      subject_slug: 'math',
      grade: 8,
      volume: '上册'
    },
    unit: {
      unit_id: 'unit_fixture',
      title: '分式',
      pdf_page_start: 10,
      pdf_page_end: 10
    },
    evidence: [{
      evidence_span_id: 'span_fixture',
      node_id: 'node_fixture',
      node_kind: 'section',
      node_title: '分式的基本性质',
      pdf_page: 10,
      printed_page: '3',
      excerpt: '15.1.2 分式的基本性质',
      excerpt_hash: 'hash',
      bbox: null,
      evidence_role: 'heading',
      source: 'fixture',
      extraction_method: 'fixture',
      generated_by_pipeline: false
    }],
    candidates: [{
      candidate_id: 'candidate_fixture',
      standard_code: 'MA-H4G8-AL-011',
      standard_title: '代数关系推理与求解',
      standard_text: '理解分式及最简分式。',
      official_text: '理解分式及最简分式。',
      domain: '数与代数',
      learning_components: [{ component_id: 'lc_fixture', label: '理解分式及最简分式' }]
    }]
  }
}

function acceptedOutput() {
  return {
    schema_version: LLM_ALIGNMENT_SCHEMA_VERSION,
    items: [{
      item_id: 'fixture-item',
      overall_decision: 'evaluated',
      overall_rationale: '教材标题直接点明分式的基本性质。',
      decisions: [{
        candidate_id: 'candidate_fixture',
        standard_code: 'MA-H4G8-AL-011',
        decision: 'accept',
        relation_type: 'supports',
        evidence_level: 'L2',
        evidence_span_id: 'span_fixture',
        evidence_quote: '分式的基本性质',
        learning_component_ids: ['lc_fixture'],
        rationale: '标题直接对应候选课标中的分式概念，作为主题支持证据。'
      }]
    }]
  }
}

test('alignment provider reuses KEBIAO_LLM configuration names without a secret by default', () => {
  const disabled = resolveAlignmentLlmConfig({})
  assert.equal(disabled.enabled, false)
  assert.equal(disabled.model, 'gpt-5-mini')
  assert.equal(disabled.baseUrl, 'https://www.openai-labs.com/v1')
  const configured = resolveAlignmentLlmConfig({
    KEBIAO_LLM_API_KEY: 'test-only-secret',
    KEBIAO_LLM_BASE_URL: 'https://llm.example.test/v1',
    KEBIAO_ALIGNMENT_LLM_TIMEOUT_MS: '60000'
  })
  assert.equal(configured.enabled, true)
  assert.equal(configured.timeoutMs, 60_000)
})

test('provider calls Responses API with strict JSON Schema and no chat fallback', async () => {
  const item = fixtureItem()
  let calls = 0
  const result = await requestAlignmentAdjudication(JSON.stringify({ items: [item] }), {
    config: {
      enabled: true,
      valid: true,
      apiKey: 'test-only-secret',
      baseUrl: 'https://llm.example.test/v1',
      model: 'gpt-5-mini',
      timeoutMs: 10_000,
      maxRetries: 0
    },
    fetchImpl: async (url, init) => {
      calls += 1
      assert.equal(url, 'https://llm.example.test/v1/responses')
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer test-only-secret')
      const request = JSON.parse(init.body)
      assert.equal(request.text.format.type, 'json_schema')
      assert.equal(request.text.format.strict, true)
      assert.equal(request.store, false)
      assert.equal(request.metadata.prompt_version, LLM_ALIGNMENT_PROMPT_VERSION)
      return Response.json({
        id: 'resp_fixture',
        usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140 },
        output: [{ content: [{ type: 'output_text', text: JSON.stringify(acceptedOutput()) }] }]
      })
    }
  })
  assert.equal(calls, 1)
  assert.equal(result.ok, true)
  assert.deepEqual(result.usage, { input_tokens: 100, output_tokens: 40, total_tokens: 140 })
})

test('request-dependent validation requires complete decisions, exact evidence and component IDs', () => {
  const item = fixtureItem()
  assert.equal(validateAlignmentModelOutput(acceptedOutput(), [item]).ok, true)

  const inventedQuote = structuredClone(acceptedOutput())
  inventedQuote.items[0].decisions[0].evidence_quote = '教材没有的句子'
  assert.equal(validateAlignmentModelOutput(inventedQuote, [item]).ok, false)

  const omitted = structuredClone(acceptedOutput())
  omitted.items[0].decisions = []
  assert.equal(validateAlignmentModelOutput(omitted, [item]).ok, false)

  const leakedSemanticFields = structuredClone(acceptedOutput())
  leakedSemanticFields.items[0].decisions[0].decision = 'reject'
  assert.equal(validateAlignmentModelOutput(leakedSemanticFields, [item]).ok, false)

  const uncalibrated = structuredClone(acceptedOutput())
  uncalibrated.items[0].decisions[0].confidence = 0.9
  assert.equal(validateAlignmentModelOutput(uncalibrated, [item]).ok, false)
})

test('input hash changes with model or prompt-relevant input and is stable for key order', () => {
  const item = fixtureItem()
  const first = alignmentInputHash({ model: 'gpt-5-mini', items: [item] })
  const reordered = alignmentInputHash({ model: 'gpt-5-mini', items: [{ ...item, item_id: item.item_id }] })
  const otherModel = alignmentInputHash({ model: 'gpt-5', items: [item] })
  const otherProvider = alignmentInputHash({ provider: 'codex_cli', model: 'gpt-5-mini', items: [item] })
  assert.equal(first, reordered)
  assert.notEqual(first, otherModel)
  assert.notEqual(first, otherProvider)
})

test('existing adjudication consumes every current pair as a candidate without local acceptance', () => {
  const catalog = fixtureItem().textbook
  const structure = {
    toc: [{ entry_id: 'unit_fixture', title: '分式', pdf_page: 10, end_pdf_page: 20 }],
    content_nodes: [{ node_id: 'node_fixture', unit_id: 'unit_fixture', kind: 'section', title: '分式的基本性质', evidence_span_ids: ['span_fixture'] }],
    evidence_spans: [{ span_id: 'span_fixture', node_id: 'node_fixture', pdf_page: 10, printed_page: '3', text: '15.1.2 分式的基本性质', text_hash: 'hash' }],
    alignments: [{ alignment_id: 'old_alignment', node_id: 'node_fixture', unit_id: 'unit_fixture', standard_code: 'MA-H4G8-AL-011', evidence_span_ids: ['span_fixture'] }]
  }
  const standards = new Map([['MA-H4G8-AL-011', {
    code: 'MA-H4G8-AL-011',
    standard_title: '代数关系推理与求解',
    standard: '理解分式及最简分式。',
    official_text: '理解分式及最简分式。',
    subject_slug: 'math',
    grade_band: 'H4G8'
  }]])
  const result = buildExistingAdjudicationItems(catalog, structure, standards)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].candidates[0].standard_code, 'MA-H4G8-AL-011')
  assert.equal('decision' in result.items[0].candidates[0], false)
  assert.equal('relation_type' in result.items[0].candidates[0], false)
})

test('gap discovery reads sidecar lines when the edition has zero derived evidence spans', () => {
  const root = mkdtempSync(join(tmpdir(), 'kebiao-llm-sidecar-'))
  try {
    const relative = 'derived/textbook-content-v2/hash/pages.jsonl'
    const path = join(root, relative)
    mkdirSync(join(root, 'derived/textbook-content-v2/hash'), { recursive: true })
    writeFileSync(path, `${JSON.stringify({
      pdf_page: 10,
      printed_page: '3',
      extraction_method: 'pdftoppm_tesseract_chi_sim_eng',
      text: '分式的基本性质',
      lines: [{ text: '分式的基本性质', bbox: { x: 10, y: 20, width: 100, height: 20, unit: 'pixel' } }]
    })}\n`)
    const catalog = fixtureItem().textbook
    const structure = {
      content_alignment: { sidecar_path: relative, source_asset_sha256: 'hash' },
      toc: [{ entry_id: 'unit_fixture', title: '分式', pdf_page: 10, end_pdf_page: 10 }],
      content_nodes: [],
      evidence_spans: [],
      alignments: []
    }
    const standards = new Map([['MA-H4G8-AL-011', {
      code: 'MA-H4G8-AL-011',
      standard_title: '代数关系推理与求解',
      standard: '理解分式及最简分式。',
      official_text: '理解分式及最简分式。',
      subject_slug: 'math',
      grade_band: 'H4G8'
    }]])
    const result = buildDiscoveryItems(catalog, structure, standards, {
      libraryRoot: root,
      sidecarPagesPerItem: 1,
      evidenceSpansPerPage: 8,
      candidatesPerItem: 8,
      mode: 'discover'
    })
    assert.equal(result.sidecar_status, 'loaded')
    assert.equal(result.items.length, 1)
    const span = result.items[0].evidence[0]
    assert.equal(span.source, 'external_textbook_sidecar')
    assert.equal(span.generated_by_pipeline, true)
    assert.equal(span.excerpt, '分式的基本性质')
    assert.deepEqual(span.bbox, { x: 10, y: 20, width: 100, height: 20, unit: 'pixel' })
    assert.match(span.excerpt_hash, /^[a-f0-9]{64}$/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('no-TOC discovery uses stable page-only containers and never claims an official unit', () => {
  const root = mkdtempSync(join(tmpdir(), 'kebiao-llm-page-only-'))
  try {
    const relative = 'derived/textbook-content-v2/hash/pages.jsonl'
    const path = join(root, relative)
    mkdirSync(join(root, 'derived/textbook-content-v2/hash'), { recursive: true })
    writeFileSync(path, `${JSON.stringify({
      pdf_page: 7,
      printed_page: '1',
      extraction_method: 'pdftotext_native',
      text: '观察植物细胞的结构与功能',
      lines: [{ text: '观察植物细胞的结构与功能', bbox: null }]
    })}\n`)
    const catalog = { ...fixtureItem().textbook, subject: '科学', subject_slug: 'science', grade: 7 }
    const structure = {
      content_alignment: { sidecar_path: relative, source_asset_sha256: 'hash' },
      toc: [],
      content_nodes: [],
      evidence_spans: [],
      alignments: []
    }
    const standard = {
      code: 'SC-H4G7-LS-001',
      standard_title: '细胞结构与功能',
      standard: '观察细胞结构并说明其功能。',
      official_text: '观察细胞结构并说明其功能。',
      subject_slug: 'science',
      grade_band: 'H4G7'
    }
    const options = {
      libraryRoot: root,
      sidecarPagesPerItem: 1,
      evidenceSpansPerPage: 8,
      candidatesPerItem: 8,
      mode: 'discover'
    }
    const first = buildDiscoveryItems(catalog, structure, new Map([[standard.code, standard]]), options)
    const second = buildDiscoveryItems(catalog, structure, new Map([[standard.code, standard]]), options)
    assert.equal(first.items.length, 1)
    assert.equal(first.items[0].unit.assignment_status, 'unassigned_page_only')
    assert.match(first.items[0].unit.title, /^未分配单元/u)
    assert.match(first.items[0].unit.unit_id, /^tpu_/u)
    assert.equal(first.items[0].unit.unit_id, second.items[0].unit.unit_id)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('budget reserves worst-case concurrent retries and refuses overflow', () => {
  const budget = new AlignmentBudget({
    maxRequests: 3,
    maxInputTokens: 3_000,
    maxOutputTokensTotal: 3_000,
    maxUsd: 1,
    inputUsdPerMillion: 10,
    outputUsdPerMillion: 40
  })
  const reservation = budget.reserve(500, 500, 3)
  assert.ok(reservation)
  assert.equal(budget.reserve(1, 1, 1), null)
  budget.settle(reservation, { input_tokens: 400, output_tokens: 100 }, 1)
  assert.equal(budget.snapshot().used.requests, 1)
})

test('materialized accepted relation contains model provenance but no uncalibrated confidence', () => {
  const item = fixtureItem()
  const inputHash = alignmentInputHash({ model: 'gpt-5-mini', items: [item] })
  const records = [{
    status: 'ok',
    input_hash: inputHash,
    request_items: [item],
    model_output: acceptedOutput(),
    provenance: {
      provider: 'openai_responses',
      model: 'gpt-5-mini',
      prompt_version: LLM_ALIGNMENT_PROMPT_VERSION,
      schema_version: LLM_ALIGNMENT_SCHEMA_VERSION,
      input_hash: inputHash,
      response_id: 'resp_fixture'
    }
  }]
  const output = materializeAlignmentRecords(records, new Set([inputHash]))
  assert.equal(output.alignments.length, 1)
  assert.equal(output.alignments[0].decision_id, output.decisions[0].decision_id)
  assert.equal(output.alignments[0].rationale, acceptedOutput().items[0].decisions[0].rationale)
  assert.equal(output.alignments[0].relation_type, 'supports')
  assert.equal('confidence' in output.alignments[0], false)
  assert.equal('score' in output.alignments[0], false)
  assert.equal(output.alignments[0].provenance.prompt_version, LLM_ALIGNMENT_PROMPT_VERSION)
})

test('application preview removes rejected or abstained machine relations, preserves approved legacy, and adds accepted evidence', () => {
  const provenance = {
    provider: LLM_ALIGNMENT_PROVIDER,
    model: 'gpt-5-mini',
    prompt_version: LLM_ALIGNMENT_PROMPT_VERSION,
    schema_version: LLM_ALIGNMENT_SCHEMA_VERSION,
    input_hash: 'a'.repeat(64)
  }
  const decision = (decisionId, priorAlignmentId, outcome) => ({
    decision_id: decisionId,
    edition_id: 'ed_fixture',
    standard_code: 'MA-H4G8-AL-011',
    decision: outcome,
    source_mode: 'adjudicate_existing',
    prior_alignment_id: priorAlignmentId,
    provenance
  })
  const decisions = [
    decision('reject-machine', 'old_reject', 'reject'),
    decision('abstain-machine', 'old_abstain', 'abstain'),
    decision('reject-approved', 'old_approved', 'reject'),
    {
      decision_id: 'accept-discovery',
      edition_id: 'ed_fixture',
      standard_code: 'MA-H4G8-AL-011',
      decision: 'accept',
      source_mode: 'discover_gap',
      prior_alignment_id: null,
      provenance
    }
  ]
  const acceptedAlignments = [{
    decision_id: 'accept-discovery',
    alignment_id: 'llm_accept',
    edition_id: 'ed_fixture',
    unit_id: 'unit_fixture',
    unit_title: '分式',
    unit_assignment_status: 'assigned_toc_unit',
    source_mode: 'discover_gap',
    standard_code: 'MA-H4G8-AL-011',
    semantic_decision: 'accept',
    relation_type: 'supports',
    evidence_level: 'L3',
    evidence_span_ids: ['new_span'],
    evidence_excerpt: '分式的基本性质练习',
    evidence_quote: '分式的基本性质',
    node_id: 'new_node',
    pdf_page: 10,
    provenance,
    generated_evidence_span: {
      evidence_span_id: 'new_span',
      node_id: 'new_node',
      pdf_page: 10,
      excerpt: '分式的基本性质练习',
      excerpt_hash: 'b'.repeat(64),
      source: 'external_textbook_sidecar'
    },
    generated_content_node: {
      node_id: 'new_node',
      unit_id: 'unit_fixture',
      title: '分式的基本性质练习',
      pdf_page: 10,
      text_excerpt: '分式的基本性质练习',
      evidence_span_ids: ['new_span']
    }
  }]
  const structuresByEdition = new Map([['ed_fixture', {
    edition_id: 'ed_fixture',
    content_nodes: [],
    evidence_spans: [],
    alignments: [
      { alignment_id: 'old_reject', unit_id: 'unit_fixture', standard_code: 'A', review_status: 'machine_checked' },
      { alignment_id: 'old_abstain', unit_id: 'unit_fixture', standard_code: 'B', review_status: 'machine_checked' },
      { alignment_id: 'old_approved', unit_id: 'unit_fixture', standard_code: 'C', review_status: 'approved' }
    ]
  }]])
  const result = planAlignmentApplication({ structuresByEdition, decisions, acceptedAlignments })
  const structure = result.updates.get('ed_fixture')
  assert.deepEqual(structure.alignments.map(row => row.alignment_id), ['old_approved', 'llm_accept'])
  assert.equal(structure.content_nodes[0].node_id, 'new_node')
  assert.equal(structure.evidence_spans[0].evidence_span_id, 'new_span')
  assert.equal(structure.alignments[1].publication_status, 'published')
  assert.equal('confidence' in structure.alignments[1], false)
  assert.equal(result.report.summary.removed_machine_alignments, 2)
  assert.equal(result.report.summary.preserved_legacy_approved, 1)
})
