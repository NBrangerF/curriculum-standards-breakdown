#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  LLM_ALIGNMENT_PROMPT_VERSION,
  LLM_ALIGNMENT_PROVIDER,
  LLM_ALIGNMENT_SCHEMA_VERSION,
  alignmentInputHash,
  stableAlignmentId,
  stableDecisionId,
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
import {
  createRecoverySnapshot,
  planAlignmentApplication,
  prepareCurrentApplicationPlan,
  recoverApplicationFailure,
  resolveSafeReceiptPath,
  resolveSafeReportPath,
  restoreRecoverySnapshot,
  validateApplicationArtifacts
} from './apply_llm_textbook_standard_alignments.js'
import { evaluateAlignmentPredictions } from './evaluate_llm_textbook_standard_alignments.js'

const hash = value => createHash('sha256').update(String(value)).digest('hex')

test('strict eval treats relation-type accuracy as a first-class quality gate', () => {
  const golden = [{
    case_id: 'relation-gate',
    tags: ['positive'],
    expected: { decision: 'accept', allowed_relation_types: ['supports'] }
  }]
  const predictions = [{
    case_id: 'relation-gate',
    decision: 'accept',
    relation_type: 'mentions'
  }]
  const report = evaluateAlignmentPredictions(golden, predictions)
  assert.equal(report.metrics.precision, 1)
  assert.equal(report.metrics.recall, 1)
  assert.equal(report.metrics.accepted_relation_accuracy, 0)
  assert.equal(report.passed, false)
})

function fullProvenance(inputHash = 'a'.repeat(64)) {
  return {
    provider: LLM_ALIGNMENT_PROVIDER,
    model: 'gpt-5-mini',
    prompt_version: LLM_ALIGNMENT_PROMPT_VERSION,
    schema_version: LLM_ALIGNMENT_SCHEMA_VERSION,
    input_hash: inputHash,
    response_id: 'resp_fixture',
    generated_at: '2026-07-22T00:00:00.000Z',
    usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140 },
    provider_attempts: 1,
    validation_attempts: 1,
    latency_ms: 10
  }
}

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

function applicationAcceptance({
  logicalItemId = 'discover:ed_fixture:unit_fixture:pages-10-10',
  itemId = 'application-item',
  candidateId = 'application-candidate',
  spanId = 'application-span',
  nodeId = 'application-node',
  excerpt = '分式的基本性质练习',
  bbox = null,
  provenance = fullProvenance()
} = {}) {
  const decisionId = stableDecisionId(provenance.input_hash, itemId, candidateId)
  const decision = {
    decision_id: decisionId,
    edition_id: 'ed_fixture',
    item_id: itemId,
    logical_item_id: logicalItemId,
    source_mode: 'discover_scope_sidecar',
    prior_alignment_id: null,
    unit_id: 'unit_fixture',
    candidate_id: candidateId,
    standard_code: 'MA-H4G8-AL-011',
    decision: 'accept',
    provenance
  }
  const alignment = {
    decision_id: decisionId,
    alignment_id: stableAlignmentId('ed_fixture', logicalItemId, 'MA-H4G8-AL-011', spanId, LLM_ALIGNMENT_PROMPT_VERSION),
    edition_id: 'ed_fixture',
    unit_id: 'unit_fixture',
    unit_title: '分式',
    unit_assignment_status: 'assigned_toc_unit',
    source_mode: decision.source_mode,
    logical_item_id: logicalItemId,
    prior_alignment_id: null,
    candidate_id: candidateId,
    node_id: nodeId,
    standard_code: decision.standard_code,
    standard_text: '理解分式及最简分式。',
    subject_slug: 'math',
    grade_band: 'H4G8',
    relation_type: 'supports',
    evidence_level: 'L3',
    evidence_span_ids: [spanId],
    evidence_excerpt: excerpt,
    evidence_excerpt_hash: hash(excerpt),
    evidence_quote: '分式的基本性质',
    semantic_decision: 'accept',
    pdf_page: 10,
    provenance,
    generated_evidence_span: {
      evidence_span_id: spanId,
      node_id: nodeId,
      pdf_page: 10,
      printed_page: null,
      excerpt,
      excerpt_hash: hash(excerpt),
      bbox,
      source: 'external_textbook_sidecar'
    },
    generated_content_node: {
      node_id: nodeId,
      parent_id: 'unit_fixture',
      unit_id: 'unit_fixture',
      level: 1,
      kind: 'page_excerpt',
      title: excerpt,
      pdf_page: 10,
      end_pdf_page: 10,
      printed_page: null,
      end_printed_page: null,
      text_excerpt: excerpt,
      evidence_span_ids: [spanId],
      source: 'external_textbook_sidecar',
      extraction_method: 'fixture'
    }
  }
  return { decision, alignment }
}

function emptyApplicationStructure(alignments = []) {
  return {
    edition_id: 'ed_fixture',
    toc: [{ entry_id: 'unit_fixture', title: '分式', pdf_page: 10, end_pdf_page: 20, review_status: 'approved' }],
    content_nodes: [],
    evidence_spans: [],
    alignments
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
  const provenance = fullProvenance()
  const decision = (candidateId, priorAlignmentId, outcome) => ({
    decision_id: stableDecisionId(provenance.input_hash, `item-${candidateId}`, candidateId),
    edition_id: 'ed_fixture',
    item_id: `item-${candidateId}`,
    logical_item_id: `existing:${priorAlignmentId}`,
    candidate_id: candidateId,
    unit_id: 'unit_fixture',
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
      decision_id: stableDecisionId(provenance.input_hash, 'item-accept', 'candidate-accept'),
      edition_id: 'ed_fixture',
      item_id: 'item-accept',
      logical_item_id: 'discover:ed_fixture:unit_fixture:pages-10-10',
      candidate_id: 'candidate-accept',
      unit_id: 'unit_fixture',
      standard_code: 'MA-H4G8-AL-011',
      decision: 'accept',
      source_mode: 'discover_scope_sidecar',
      prior_alignment_id: null,
      provenance
    }
  ]
  const acceptDecision = decisions.at(-1)
  const acceptedAlignments = [{
    decision_id: acceptDecision.decision_id,
    alignment_id: stableAlignmentId('ed_fixture', acceptDecision.logical_item_id, 'MA-H4G8-AL-011', 'new_span', LLM_ALIGNMENT_PROMPT_VERSION),
    edition_id: 'ed_fixture',
    unit_id: 'unit_fixture',
    unit_title: '分式',
    unit_assignment_status: 'assigned_toc_unit',
    source_mode: 'discover_scope_sidecar',
    logical_item_id: acceptDecision.logical_item_id,
    candidate_id: acceptDecision.candidate_id,
    prior_alignment_id: null,
    standard_code: 'MA-H4G8-AL-011',
    standard_text: '理解分式及最简分式。',
    subject_slug: 'math',
    grade_band: 'H4G8',
    semantic_decision: 'accept',
    relation_type: 'supports',
    evidence_level: 'L3',
    evidence_span_ids: ['new_span'],
    evidence_excerpt: '分式的基本性质练习',
    evidence_excerpt_hash: hash('分式的基本性质练习'),
    evidence_quote: '分式的基本性质',
    node_id: 'new_node',
    pdf_page: 10,
    provenance,
    generated_evidence_span: {
      evidence_span_id: 'new_span',
      node_id: 'new_node',
      pdf_page: 10,
      excerpt: '分式的基本性质练习',
      excerpt_hash: hash('分式的基本性质练习'),
      bbox: null,
      source: 'external_textbook_sidecar'
    },
    generated_content_node: {
      node_id: 'new_node',
      parent_id: 'unit_fixture',
      unit_id: 'unit_fixture',
      level: 1,
      kind: 'page_excerpt',
      title: '分式的基本性质练习',
      pdf_page: 10,
      end_pdf_page: 10,
      printed_page: null,
      end_printed_page: null,
      text_excerpt: '分式的基本性质练习',
      evidence_span_ids: ['new_span'],
      source: 'external_textbook_sidecar',
      extraction_method: 'fixture'
    }
  }]
  const structuresByEdition = new Map([['ed_fixture', {
    edition_id: 'ed_fixture',
    toc: [{ entry_id: 'unit_fixture', title: '分式', pdf_page: 10, end_pdf_page: 20, review_status: 'approved' }],
    content_nodes: [],
    evidence_spans: [],
    alignments: [
      { alignment_id: 'old_reject', edition_id: 'ed_fixture', unit_id: 'unit_fixture', standard_code: 'MA-H4G8-AL-011', review_status: 'machine_checked' },
      { alignment_id: 'old_abstain', edition_id: 'ed_fixture', unit_id: 'unit_fixture', standard_code: 'MA-H4G8-AL-011', review_status: 'machine_checked' },
      { alignment_id: 'old_approved', edition_id: 'ed_fixture', unit_id: 'unit_fixture', standard_code: 'MA-H4G8-AL-011', review_status: 'approved' }
    ]
  }]])
  const result = planAlignmentApplication({ structuresByEdition, decisions, acceptedAlignments })
  const structure = result.updates.get('ed_fixture')
  assert.deepEqual(structure.alignments.map(row => row.alignment_id), ['old_approved', acceptedAlignments[0].alignment_id])
  assert.equal(structure.content_nodes[0].node_id, 'new_node')
  assert.equal(structure.evidence_spans[0].evidence_span_id, 'new_span')
  assert.equal(structure.alignments[1].publication_status, 'published')
  assert.equal('confidence' in structure.alignments[1], false)
  assert.equal(result.report.summary.removed_machine_alignments, 2)
  assert.equal(result.report.summary.preserved_legacy_approved, 1)
})

test('application artifacts are cryptographically bound to one complete validated checkpoint', () => {
  const root = mkdtempSync(join(tmpdir(), 'kebiao-llm-apply-artifacts-'))
  try {
    const item = fixtureItem()
    const inputHash = alignmentInputHash({ provider: LLM_ALIGNMENT_PROVIDER, model: 'gpt-5-mini', items: [item] })
    const record = {
      record_type: 'batch_result',
      status: 'ok',
      input_hash: inputHash,
      request_items: [item],
      model_output: acceptedOutput(),
      provenance: fullProvenance(inputHash)
    }
    const materialized = materializeAlignmentRecords([record], new Set([inputHash]))
    const checkpointPath = join(root, 'run.checkpoint.jsonl')
    const decisionsPath = join(root, 'run.decisions.jsonl')
    const alignmentsPath = join(root, 'run.alignments.jsonl')
    const manifestPath = join(root, 'run.manifest.json')
    const checkpointText = `${JSON.stringify(record)}\n`
    const decisionsText = `${materialized.decisions.map(row => JSON.stringify(row)).join('\n')}\n`
    const alignmentsText = `${materialized.alignments.map(row => JSON.stringify(row)).join('\n')}\n`
    writeFileSync(checkpointPath, checkpointText)
    writeFileSync(decisionsPath, decisionsText)
    writeFileSync(alignmentsPath, alignmentsText)
    const manifest = {
      provider: LLM_ALIGNMENT_PROVIDER,
      model: 'gpt-5-mini',
      prompt_version: LLM_ALIGNMENT_PROMPT_VERSION,
      schema_version: LLM_ALIGNMENT_SCHEMA_VERSION,
      request_batches: 1,
      successful_batches: 1,
      work_items: 1,
      work_items_before_limit: 1,
      workset_complete: true,
      work_items_omitted: 0,
      selection: {
        complete: true,
        limited_by_max_items: false,
        max_items: 0,
        selected_items: 1,
        available_items: 1,
        omitted_items: 0
      },
      complete: true,
      incomplete_input_hashes: [],
      current_input_hashes: [inputHash],
      checkpoint_path: checkpointPath,
      decisions_path: decisionsPath,
      alignments_path: alignmentsPath,
      artifact_digests: {
        checkpoint_sha256: hash(checkpointText),
        decisions_sha256: hash(decisionsText),
        alignments_sha256: hash(alignmentsText)
      }
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`)
    const validated = validateApplicationArtifacts({ manifest, manifestPath, decisionsPath, alignmentsPath })
    assert.equal(validated.decisions.length, 1)
    assert.equal(validated.acceptedAlignments.length, 1)

    assert.throws(() => validateApplicationArtifacts({
      manifest: { ...manifest, complete: false }, manifestPath, decisionsPath, alignmentsPath
    }), /partial alignment manifest/u)

    assert.throws(() => validateApplicationArtifacts({
      manifest: {
        ...manifest,
        work_items: 1,
        work_items_before_limit: 2,
        workset_complete: false,
        work_items_omitted: 1,
        selection: {
          ...manifest.selection,
          complete: false,
          limited_by_max_items: true,
          selected_items: 1,
          available_items: 2,
          omitted_items: 1
        }
      },
      manifestPath,
      decisionsPath,
      alignmentsPath
    }), /truncated or legacy alignment manifest/u)

    const legacyManifest = { ...manifest }
    delete legacyManifest.workset_complete
    delete legacyManifest.work_items_omitted
    delete legacyManifest.selection
    assert.throws(() => validateApplicationArtifacts({
      manifest: legacyManifest, manifestPath, decisionsPath, alignmentsPath
    }), /truncated or legacy alignment manifest/u)

    writeFileSync(decisionsPath, `${decisionsText} `)
    assert.throws(() => validateApplicationArtifacts({ manifest, manifestPath, decisionsPath, alignmentsPath }), /digest mismatch/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('current application planning re-opens manifest, canonical sources, standards and catalog on every call', () => {
  let generation = 1
  const observedInputs = []
  const observedPlans = []
  const calls = { manifests: 0, inputs: 0, standards: 0, catalogs: 0, scopes: 0, plans: 0 }
  const args = {
    manifest: '/tmp/kebiao-plan-fixture/run.manifest.json',
    manifestPayload: { stale: true },
    decisions: '/tmp/kebiao-plan-fixture/stale.decisions.jsonl',
    alignments: '/tmp/kebiao-plan-fixture/stale.alignments.jsonl',
    decisionsExplicit: false,
    alignmentsExplicit: false,
    editions: [],
    apply: true,
    rebuild: false
  }
  const dependencies = {
    readManifest: () => {
      calls.manifests += 1
      return {
        generation,
        decisions_path: `fresh-${generation}.decisions.jsonl`,
        alignments_path: `fresh-${generation}.alignments.jsonl`
      }
    },
    loadInputs: currentArgs => {
      calls.inputs += 1
      observedInputs.push({
        generation: currentArgs.manifestPayload.generation,
        decisions: currentArgs.decisions,
        alignments: currentArgs.alignments
      })
      return {
        decisions: [],
        acceptedAlignments: [],
        structuresByEdition: new Map([['current', { generation }]]),
        authenticated: { records: [] }
      }
    },
    loadStandards: () => {
      calls.standards += 1
      return new Map([['standard', { generation }]])
    },
    loadCatalog: () => {
      calls.catalogs += 1
      return new Map([['catalog', { generation }]])
    },
    validateScope: () => {
      calls.scopes += 1
    },
    plan: ({ structuresByEdition, standardsByCode, catalogByEdition }) => {
      calls.plans += 1
      observedPlans.push([
        structuresByEdition.get('current').generation,
        standardsByCode.get('standard').generation,
        catalogByEdition.get('catalog').generation
      ])
      return { updates: new Map(), report: { summary: { generation } } }
    }
  }

  const first = prepareCurrentApplicationPlan(args, dependencies)
  generation = 2
  const second = prepareCurrentApplicationPlan(args, dependencies)

  assert.equal(first.report.summary.generation, 1)
  assert.equal(second.report.summary.generation, 2)
  assert.deepEqual(observedPlans, [[1, 1, 1], [2, 2, 2]])
  assert.match(observedInputs[0].decisions, /fresh-1\.decisions\.jsonl$/u)
  assert.match(observedInputs[1].alignments, /fresh-2\.alignments\.jsonl$/u)
  assert.deepEqual(calls, { manifests: 2, inputs: 2, standards: 2, catalogs: 2, scopes: 2, plans: 2 })
})

test('receipt path confinement rejects traversal, nested paths, symlink escapes and protected aliases', () => {
  const root = mkdtempSync(join(tmpdir(), 'kebiao-llm-receipt-safety-'))
  try {
    const projectRoot = join(root, 'project')
    const receiptRoot = join(projectRoot, 'receipts')
    mkdirSync(receiptRoot, { recursive: true })
    const safe = resolveSafeReceiptPath(join(receiptRoot, 'safe.json'), {
      runId: 'fixture', receiptRoot, trustedRoot: projectRoot
    })
    assert.equal(safe, join(realpathSync(receiptRoot), 'safe.json'))

    assert.throws(() => resolveSafeReceiptPath(join(receiptRoot, '..', 'escape.json'), {
      runId: 'fixture', receiptRoot, trustedRoot: projectRoot
    }), /direct \.json child/u)
    assert.throws(() => resolveSafeReceiptPath(join(receiptRoot, 'nested', 'receipt.json'), {
      runId: 'fixture', receiptRoot, trustedRoot: projectRoot
    }), /direct \.json child/u)

    const outside = join(root, 'outside.json')
    writeFileSync(outside, '{}\n')
    const symlinkReceipt = join(receiptRoot, 'symlink.json')
    symlinkSync(outside, symlinkReceipt)
    assert.throws(() => resolveSafeReceiptPath(symlinkReceipt, {
      runId: 'fixture', receiptRoot, trustedRoot: projectRoot
    }), /outside the dedicated receipt root/u)

    const protectedManifest = join(receiptRoot, 'manifest.json')
    writeFileSync(protectedManifest, '{}\n')
    assert.throws(() => resolveSafeReceiptPath(protectedManifest, {
      runId: 'fixture', receiptRoot, trustedRoot: projectRoot, protectedPaths: [protectedManifest]
    }), /overlaps protected apply data/u)

    const outsideReceiptRoot = join(root, 'outside-receipts')
    mkdirSync(outsideReceiptRoot)
    const receiptRootLink = join(projectRoot, 'receipt-root-link')
    symlinkSync(outsideReceiptRoot, receiptRootLink)
    assert.throws(() => resolveSafeReceiptPath(join(receiptRootLink, 'receipt.json'), {
      runId: 'fixture', receiptRoot: receiptRootLink, trustedRoot: projectRoot
    }), /escapes the trusted project root/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('report path confinement rejects canonical, artifact and snapshot overlap before writes', () => {
  const root = mkdtempSync(join(tmpdir(), 'kebiao-llm-report-safety-'))
  try {
    const projectRoot = join(root, 'project')
    const reportRoot = join(projectRoot, 'reports')
    mkdirSync(reportRoot, { recursive: true })
    const safe = resolveSafeReportPath(join(reportRoot, 'preview.json'), {
      runId: 'fixture', reportRoot, trustedRoot: projectRoot
    })
    assert.equal(safe, join(realpathSync(reportRoot), 'preview.json'))

    const protectedArtifact = join(reportRoot, 'artifact.json')
    writeFileSync(protectedArtifact, '{}\n')
    assert.throws(() => resolveSafeReportPath(protectedArtifact, {
      runId: 'fixture', reportRoot, trustedRoot: projectRoot, protectedPaths: [protectedArtifact]
    }), /Report path overlaps protected apply data/u)
    assert.throws(() => resolveSafeReportPath(join(projectRoot, 'canonical.json'), {
      runId: 'fixture', reportRoot, trustedRoot: projectRoot
    }), /direct \.json child/u)
    assert.throws(() => resolveSafeReportPath(join(reportRoot, 'snapshot', 'report.json'), {
      runId: 'fixture', reportRoot, trustedRoot: projectRoot
    }), /direct \.json child/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rollback bookkeeping treats restore or receipt-write failures as recovery failures', () => {
  const original = new Error('apply failed')
  const restoreAndReceiptFailure = recoverApplicationFailure({
    error: original,
    snapshot: { roots: [] },
    receipt: { status: 'prepared' },
    receiptPath: '/tmp/unused-receipt.json',
    restoreSnapshot: () => { throw new Error('restore failed') },
    writeReceipt: () => { throw new Error('receipt failed') }
  })
  assert.equal(restoreAndReceiptFailure.recoveryFailed, true)
  assert.match(restoreAndReceiptFailure.error.message, /restore failed; receipt failed/u)

  const receiptFailure = recoverApplicationFailure({
    error: original,
    snapshot: { roots: [] },
    receipt: { status: 'prepared' },
    receiptPath: '/tmp/unused-receipt.json',
    restoreSnapshot: () => {},
    writeReceipt: () => { throw new Error('receipt failed') }
  })
  assert.equal(receiptFailure.recoveryFailed, true)
  assert.equal(receiptFailure.restoreError, null)
  assert.match(receiptFailure.error.message, /receipt failed/u)
})

test('stale adjudication and canonical approved ID collisions fail closed', () => {
  const provenance = fullProvenance()
  const staleDecision = {
    decision_id: stableDecisionId(provenance.input_hash, 'stale-item', 'stale-candidate'),
    edition_id: 'ed_fixture',
    item_id: 'stale-item',
    logical_item_id: 'existing:missing',
    source_mode: 'adjudicate_existing',
    prior_alignment_id: 'missing',
    unit_id: 'unit_fixture',
    candidate_id: 'stale-candidate',
    standard_code: 'MA-H4G8-AL-011',
    decision: 'reject',
    provenance
  }
  assert.throws(() => planAlignmentApplication({
    structuresByEdition: new Map([['ed_fixture', emptyApplicationStructure()]]),
    decisions: [staleDecision],
    acceptedAlignments: []
  }), /missing prior alignment/u)

  const accepted = applicationAcceptance()
  const approved = {
    alignment_id: accepted.alignment.alignment_id,
    edition_id: 'ed_fixture',
    unit_id: 'unit_fixture',
    standard_code: 'OTHER',
    relation_type: 'supports',
    review_status: 'approved'
  }
  assert.throws(() => planAlignmentApplication({
    structuresByEdition: new Map([['ed_fixture', emptyApplicationStructure([approved])]]),
    decisions: [accepted.decision],
    acceptedAlignments: [accepted.alignment]
  }), /collides with canonical alignment/u)
})

test('logical duplicate accepts and invalid generated bbox are rejected before canonical writes', () => {
  const first = applicationAcceptance({ itemId: 'item-1', candidateId: 'candidate-1', logicalItemId: 'logical-1', spanId: 'span-1', nodeId: 'node-1' })
  const second = applicationAcceptance({ itemId: 'item-2', candidateId: 'candidate-2', logicalItemId: 'logical-2', spanId: 'span-2', nodeId: 'node-2' })
  assert.throws(() => planAlignmentApplication({
    structuresByEdition: new Map([['ed_fixture', emptyApplicationStructure()]]),
    decisions: [first.decision, second.decision],
    acceptedAlignments: [first.alignment, second.alignment]
  }), /Duplicate logical alignment/u)

  const invalidBox = applicationAcceptance({
    bbox: { x: -1, y: 0, width: 10, height: 10, unit: 'pixel', page_width: 100, page_height: 100 }
  })
  assert.throws(() => planAlignmentApplication({
    structuresByEdition: new Map([['ed_fixture', emptyApplicationStructure()]]),
    decisions: [invalidBox.decision],
    acceptedAlignments: [invalidBox.alignment]
  }), /invalid coordinates/u)
})

test('no-TOC page-only accepts remain explicit L3 containers with detached content nodes', () => {
  const accepted = applicationAcceptance({
    logicalItemId: 'discover:ed_fixture:tpu_fixture:pages-10-10',
    itemId: 'page-only-item',
    candidateId: 'page-only-candidate'
  })
  accepted.decision.unit_id = 'tpu_fixture'
  accepted.alignment.unit_id = 'tpu_fixture'
  accepted.alignment.unit_title = '未分配单元 · PDF 10'
  accepted.alignment.unit_assignment_status = 'unassigned_page_only'
  accepted.alignment.generated_content_node.parent_id = null
  accepted.alignment.generated_content_node.unit_id = null
  accepted.alignment.generated_content_node.level = 0
  const structure = emptyApplicationStructure()
  structure.toc = []
  const result = planAlignmentApplication({
    structuresByEdition: new Map([['ed_fixture', structure]]),
    decisions: [accepted.decision],
    acceptedAlignments: [accepted.alignment]
  })
  const updated = result.updates.get('ed_fixture')
  assert.equal(updated.alignments[0].unit_assignment_status, 'unassigned_page_only')
  assert.equal(updated.content_nodes[0].unit_id, null)
  assert.equal(updated.alignments[0].evidence_level, 'L3')
})

test('recovery snapshots restore canonical and projection roots after a simulated failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'kebiao-llm-rollback-'))
  try {
    const canonicalRoot = join(root, 'canonical')
    const projectionRoot = join(root, 'projection')
    const receiptRoot = join(root, 'receipts')
    mkdirSync(canonicalRoot, { recursive: true })
    mkdirSync(projectionRoot, { recursive: true })
    writeFileSync(join(canonicalRoot, 'state.json'), '{"before":true}\n')
    writeFileSync(join(projectionRoot, 'index.json'), '{"before":true}\n')
    const snapshot = createRecoverySnapshot('fixture-run', [
      ['canonical', canonicalRoot],
      ['projection', projectionRoot]
    ], receiptRoot)
    writeFileSync(join(canonicalRoot, 'state.json'), '{"after":true}\n')
    writeFileSync(join(projectionRoot, 'index.json'), '{"after":true}\n')
    restoreRecoverySnapshot(snapshot)
    assert.equal(readFileSync(join(canonicalRoot, 'state.json'), 'utf8'), '{"before":true}\n')
    assert.equal(readFileSync(join(projectionRoot, 'index.json'), 'utf8'), '{"before":true}\n')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('snapshot recovery attempts every root and reports any partial restore failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'kebiao-llm-partial-rollback-'))
  try {
    const blockingFile = join(root, 'blocking-file')
    const badBackup = join(root, 'bad-backup')
    const goodSource = join(root, 'good-source')
    const goodBackup = join(root, 'good-backup')
    writeFileSync(blockingFile, 'not-a-directory')
    mkdirSync(badBackup)
    mkdirSync(goodSource)
    mkdirSync(goodBackup)
    writeFileSync(join(goodSource, 'state.json'), '{"after":true}\n')
    writeFileSync(join(goodBackup, 'state.json'), '{"before":true}\n')
    const snapshot = {
      roots: [
        { name: 'broken', source: join(blockingFile, 'child'), destination: badBackup, existed: true },
        { name: 'good', source: goodSource, destination: goodBackup, existed: true }
      ]
    }
    assert.throws(() => restoreRecoverySnapshot(snapshot), AggregateError)
    assert.equal(readFileSync(join(goodSource, 'state.json'), 'utf8'), '{"before":true}\n')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
