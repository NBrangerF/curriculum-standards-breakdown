#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  LLM_ALIGNMENT_PROMPT_VERSION,
  LLM_ALIGNMENT_SCHEMA_VERSION,
  alignmentInputHash,
  makeAlignmentResponseInput,
  validateAlignmentModelOutput
} from './llm_textbook_standard_alignment_contract.js'
import {
  requestAlignmentAdjudication,
  resolveAlignmentLlmConfig
} from './llm_textbook_standard_alignment_provider.js'

const ROOT = resolve(import.meta.dirname, '../..')
const DEFAULT_GOLDEN = join(ROOT, 'evals/textbook-standard-alignment/golden.jsonl')

function readJsonLines(path) {
  return readFileSync(path, 'utf8').split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line)
    } catch {
      throw new Error(`Invalid JSONL at ${path}:${index + 1}`)
    }
  })
}

function numeric(value, label, minimum, maximum = Number.POSITIVE_INFINITY) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new Error(`Invalid ${label}: ${value}`)
  return parsed
}

function parseArgs(argv) {
  const args = {
    golden: DEFAULT_GOLDEN,
    predictions: null,
    output: null,
    live: false,
    provider: null,
    strict: false,
    batchSize: 3,
    minPrecision: 0.95,
    minRecall: 0.8,
    minRelationAccuracy: 0.9,
    minComponentIdAccuracy: 1,
    maxAbstainRate: 0.25
  }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--golden') args.golden = resolve(argv[++index])
    else if (value === '--predictions') args.predictions = resolve(argv[++index])
    else if (value === '--output') args.output = resolve(argv[++index])
    else if (value === '--live') args.live = true
    else if (value === '--provider') args.provider = String(argv[++index] || '').trim()
    else if (value === '--strict') args.strict = true
    else if (value === '--batch-size') args.batchSize = numeric(argv[++index], 'batch-size', 1, 12)
    else if (value === '--min-precision') args.minPrecision = numeric(argv[++index], 'min-precision', 0, 1)
    else if (value === '--min-recall') args.minRecall = numeric(argv[++index], 'min-recall', 0, 1)
    else if (value === '--min-relation-accuracy') args.minRelationAccuracy = numeric(argv[++index], 'min-relation-accuracy', 0, 1)
    else if (value === '--min-component-id-accuracy') args.minComponentIdAccuracy = numeric(argv[++index], 'min-component-id-accuracy', 0, 1)
    else if (value === '--max-abstain-rate') args.maxAbstainRate = numeric(argv[++index], 'max-abstain-rate', 0, 1)
    else throw new Error(`Unknown argument: ${value}`)
  }
  if (args.live && args.predictions) throw new Error('Use either --live or --predictions, not both.')
  if (!args.live && !args.predictions) throw new Error('Provide --predictions or use --live.')
  if (args.provider && !['responses', 'openai_responses', 'codex_cli'].includes(args.provider)) {
    throw new Error(`Invalid provider: ${args.provider}. Use openai_responses or codex_cli.`)
  }
  return args
}

function chunks(values, size) {
  const result = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

function flattenPredictionRows(rows) {
  const predictions = []
  for (const row of rows) {
    if ((row.case_id || row.candidate_id) && row.decision) {
      const candidateId = row.candidate_id || row.case_id
      predictions.push({
        ...row,
        case_id: row.case_id || candidateId,
        candidate_id: candidateId,
        relation_type: row.relation_type ?? null,
        learning_component_ids: Array.isArray(row.learning_component_ids) ? row.learning_component_ids : []
      })
      continue
    }
    for (const item of row.model_output?.items || []) {
      for (const decision of item.decisions || []) {
        predictions.push({
          case_id: row.case_id || decision.candidate_id,
          candidate_id: decision.candidate_id,
          decision: decision.decision,
          relation_type: decision.relation_type ?? null,
          learning_component_ids: decision.learning_component_ids || [],
          provenance: row.provenance || null
        })
      }
    }
  }
  return predictions
}

function candidateIdsForGoldenRow(row) {
  const ids = (row.item?.candidates || []).map(candidate => candidate.candidate_id).filter(Boolean)
  return ids.length ? ids : [row.case_id]
}

async function runLive(golden, { env = process.env, batchSize = 3, provider = null } = {}) {
  const config = resolveAlignmentLlmConfig(provider
    ? { ...env, KEBIAO_ALIGNMENT_LLM_PROVIDER: provider }
    : env)
  if (!config.enabled) {
    throw new Error(config.provider === 'codex_cli'
      ? 'Live eval requires an installed and authenticated Codex CLI.'
      : 'Live eval requires KEBIAO_LLM_API_KEY or KEBIAO_ALIGNMENT_LLM_API_KEY, or explicit --provider codex_cli.')
  }
  if (!config.valid) throw new Error(config.provider === 'codex_cli' ? 'Codex CLI configuration is invalid.' : 'Live eval requires a valid HTTPS LLM base URL.')
  const predictions = []
  for (const cases of chunks(golden, batchSize)) {
    const items = cases.map(row => row.item)
    const caseIdByCandidate = new Map(cases.flatMap(row => candidateIdsForGoldenRow(row).map(candidateId => [candidateId, row.case_id])))
    const input = makeAlignmentResponseInput(items)
    const inputHash = alignmentInputHash({ provider: config.provider, model: config.model, items })
    const result = await requestAlignmentAdjudication(input, { config, maxOutputTokens: 3_500 })
    if (!result.ok) {
      for (const row of cases) {
        for (const candidateId of candidateIdsForGoldenRow(row)) predictions.push({
          case_id: row.case_id,
          candidate_id: candidateId,
          decision: 'missing',
          relation_type: null,
          learning_component_ids: [],
          error: result.status
        })
      }
      continue
    }
    const validation = validateAlignmentModelOutput(result.output, items)
    if (!validation.ok) {
      for (const row of cases) {
        for (const candidateId of candidateIdsForGoldenRow(row)) predictions.push({
          case_id: row.case_id,
          candidate_id: candidateId,
          decision: 'missing',
          relation_type: null,
          learning_component_ids: [],
          error: 'invalid_semantic_output',
          validation_errors: validation.errors
        })
      }
      continue
    }
    for (const item of validation.value.items) {
      for (const decision of item.decisions) {
        predictions.push({
          case_id: caseIdByCandidate.get(decision.candidate_id) || decision.candidate_id,
          candidate_id: decision.candidate_id,
          decision: decision.decision,
          relation_type: decision.relation_type,
          learning_component_ids: decision.learning_component_ids || [],
          rationale: decision.rationale,
          provenance: {
            provider: result.provider || config.provider,
            model: config.model,
            prompt_version: LLM_ALIGNMENT_PROMPT_VERSION,
            schema_version: LLM_ALIGNMENT_SCHEMA_VERSION,
            input_hash: inputHash,
            response_id: result.response_id,
            usage: result.usage
          }
        })
      }
    }
  }
  return predictions
}

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 0
}

function normalizedStringSet(values) {
  if (!Array.isArray(values)) return null
  return [...new Set(values.map(value => String(value)))].sort()
}

function sameStringSet(left, right) {
  const normalizedLeft = normalizedStringSet(left)
  const normalizedRight = normalizedStringSet(right)
  return normalizedLeft !== null
    && normalizedRight !== null
    && normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index])
}

function normalizeGoldenExpectation(row, expected, candidateId, multiCandidate) {
  if (!candidateId) throw new Error(`Golden case ${row.case_id || '<missing>'} has an expectation without candidate_id.`)
  if (!['accept', 'reject', 'abstain'].includes(expected?.decision)) {
    throw new Error(`Golden case ${row.case_id || '<missing>'} candidate ${candidateId} has an invalid expected decision.`)
  }
  return {
    case_id: row.case_id,
    candidate_id: candidateId,
    tags: [...new Set([...(row.tags || []), ...(expected.tags || [])])],
    expected_decision: expected.decision,
    allowed_relation_types: Array.isArray(expected.allowed_relation_types) ? expected.allowed_relation_types : [],
    learning_component_ids: Array.isArray(expected.learning_component_ids)
      ? normalizedStringSet(expected.learning_component_ids)
      : null,
    multi_candidate: multiCandidate
  }
}

function flattenGoldenExpectations(golden) {
  const expectations = []
  for (const row of golden) {
    if (!row.case_id) throw new Error('Golden case is missing case_id.')
    const itemCandidateIds = candidateIdsForGoldenRow(row)
    const candidateExpectations = row.expected?.candidates
    if (Array.isArray(candidateExpectations)) {
      if (!candidateExpectations.length) throw new Error(`Golden case ${row.case_id} has no candidate expectations.`)
      const expectedIds = candidateExpectations.map(expected => expected?.candidate_id)
      if (normalizedStringSet(expectedIds).length !== expectedIds.length) {
        throw new Error(`Golden case ${row.case_id} has duplicate candidate expectations.`)
      }
      if (!sameStringSet(expectedIds, itemCandidateIds)) {
        throw new Error(`Golden case ${row.case_id} candidate expectations do not exactly cover item.candidates.`)
      }
      for (const expected of candidateExpectations) {
        expectations.push(normalizeGoldenExpectation(row, expected, expected.candidate_id, candidateExpectations.length > 1))
      }
      continue
    }
    if (itemCandidateIds.length > 1) {
      throw new Error(`Golden case ${row.case_id} has multiple item candidates but uses the legacy single-candidate expectation format.`)
    }
    expectations.push(normalizeGoldenExpectation(row, row.expected, itemCandidateIds[0] || row.case_id, false))
  }
  return expectations
}

export function evaluateAlignmentPredictions(golden, predictionRows, thresholds = {}) {
  const flattenedPredictions = flattenPredictionRows(predictionRows)
  const predictionsByCandidate = new Map(flattenedPredictions.map(row => [row.candidate_id, row]))
  const predictionsByCase = new Map(flattenedPredictions.map(row => [row.case_id, row]))
  const expectations = flattenGoldenExpectations(golden)
  let truePositive = 0
  let falsePositive = 0
  let falseNegative = 0
  let abstained = 0
  let expectedReject = 0
  let correctlyRejected = 0
  let expectedAbstain = 0
  let correctlyAbstained = 0
  let acceptedTruePositive = 0
  let correctRelation = 0
  let expectedAcceptedComponents = 0
  let correctAcceptedComponents = 0
  const cases = []

  for (const expectation of expectations) {
    const prediction = predictionsByCandidate.get(expectation.candidate_id)
      || (!expectation.multi_candidate ? predictionsByCase.get(expectation.case_id) : null)
      || { decision: 'missing', relation_type: null, learning_component_ids: [] }
    const expected = expectation.expected_decision
    if (prediction.decision === 'abstain') abstained += 1
    if (expected === 'accept') {
      if (prediction.decision === 'accept') {
        truePositive += 1
        acceptedTruePositive += 1
        if (expectation.allowed_relation_types.includes(prediction.relation_type)) correctRelation += 1
      } else falseNegative += 1
    } else if (prediction.decision === 'accept') falsePositive += 1
    if (expected === 'reject') {
      expectedReject += 1
      if (prediction.decision === 'reject') correctlyRejected += 1
    }
    if (expected === 'abstain') {
      expectedAbstain += 1
      if (prediction.decision === 'abstain') correctlyAbstained += 1
    }
    const relationOk = expected !== 'accept'
      || (prediction.decision === 'accept' && expectation.allowed_relation_types.includes(prediction.relation_type))
    let componentIdsOk = null
    if (expected === 'accept' && expectation.learning_component_ids !== null) {
      expectedAcceptedComponents += 1
      componentIdsOk = prediction.decision === 'accept'
        && sameStringSet(expectation.learning_component_ids, prediction.learning_component_ids || [])
      if (componentIdsOk) correctAcceptedComponents += 1
    }
    const decisionOk = expected === prediction.decision
    const candidateOk = decisionOk && relationOk && componentIdsOk !== false
    cases.push({
      case_id: expectation.case_id,
      candidate_id: expectation.candidate_id,
      tags: expectation.tags,
      multi_candidate: expectation.multi_candidate,
      expected_decision: expected,
      predicted_decision: prediction.decision,
      predicted_relation_type: prediction.relation_type ?? null,
      expected_learning_component_ids: expectation.learning_component_ids,
      predicted_learning_component_ids: normalizedStringSet(prediction.learning_component_ids || []),
      decision_correct: decisionOk,
      relation_correct: relationOk,
      component_ids_correct: componentIdsOk,
      candidate_correct: candidateOk,
      rationale: prediction.rationale || null,
      error: prediction.error || null
    })
  }

  const precision = ratio(truePositive, truePositive + falsePositive)
  const recall = ratio(truePositive, truePositive + falseNegative)
  const abstainRate = ratio(abstained, expectations.length)
  const acceptedComponentIdAccuracy = expectedAcceptedComponents
    ? ratio(correctAcceptedComponents, expectedAcceptedComponents)
    : 1
  const requiredKnownNegatives = cases.filter(row => row.expected_decision === 'reject' && row.tags.includes('known_false_positive'))
  const requiredKnownNegativesPassed = requiredKnownNegatives.every(row => row.predicted_decision === 'reject')
  const casesById = new Map()
  for (const candidate of cases) {
    const grouped = casesById.get(candidate.case_id) || []
    grouped.push(candidate)
    casesById.set(candidate.case_id, grouped)
  }
  const caseSummaries = golden.map(row => {
    const candidates = casesById.get(row.case_id) || []
    return {
      case_id: row.case_id,
      candidate_count: candidates.length,
      multi_candidate: candidates.length > 1,
      passed: candidates.length > 0 && candidates.every(candidate => candidate.candidate_correct)
    }
  })
  const multiCandidateCases = caseSummaries.filter(row => row.multi_candidate)
  const multiCandidateCasesPassed = multiCandidateCases.filter(row => row.passed).length
  const allMultiCandidateCasesPassed = multiCandidateCasesPassed === multiCandidateCases.length
  const metrics = {
    cases: golden.length,
    candidate_expectations: expectations.length,
    true_positive: truePositive,
    false_positive: falsePositive,
    false_negative: falseNegative,
    precision,
    recall,
    abstain_rate: abstainRate,
    negative_rejection_rate: ratio(correctlyRejected, expectedReject),
    expected_abstain_accuracy: ratio(correctlyAbstained, expectedAbstain),
    accepted_relation_accuracy: ratio(correctRelation, acceptedTruePositive),
    accepted_component_id_expectations: expectedAcceptedComponents,
    accepted_component_id_accuracy: acceptedComponentIdAccuracy,
    required_known_negative_cases: requiredKnownNegatives.length,
    required_known_negatives_passed: requiredKnownNegativesPassed,
    multi_candidate_cases: multiCandidateCases.length,
    multi_candidate_cases_passed: multiCandidateCasesPassed,
    all_multi_candidate_cases_passed: allMultiCandidateCasesPassed
  }
  const appliedThresholds = {
    min_precision: thresholds.minPrecision ?? 0.95,
    min_recall: thresholds.minRecall ?? 0.8,
    min_accepted_relation_accuracy: thresholds.minRelationAccuracy ?? 0.9,
    min_accepted_component_id_accuracy: thresholds.minComponentIdAccuracy ?? 1,
    max_abstain_rate: thresholds.maxAbstainRate ?? 0.25,
    require_all_known_false_positives_rejected: true,
    require_all_multi_candidate_cases_passed: true
  }
  const passed = precision >= appliedThresholds.min_precision
    && recall >= appliedThresholds.min_recall
    && metrics.accepted_relation_accuracy >= appliedThresholds.min_accepted_relation_accuracy
    && metrics.accepted_component_id_accuracy >= appliedThresholds.min_accepted_component_id_accuracy
    && abstainRate <= appliedThresholds.max_abstain_rate
    && requiredKnownNegativesPassed
    && allMultiCandidateCasesPassed
  return {
    eval: 'textbook_standard_llm_semantic_alignment',
    prompt_version: LLM_ALIGNMENT_PROMPT_VERSION,
    schema_version: LLM_ALIGNMENT_SCHEMA_VERSION,
    metrics,
    thresholds: appliedThresholds,
    passed,
    cases,
    case_summaries: caseSummaries
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!existsSync(args.golden)) throw new Error(`Golden file not found: ${args.golden}`)
  const golden = readJsonLines(args.golden)
  const predictions = args.live
    ? await runLive(golden, { batchSize: args.batchSize, provider: args.provider })
    : readJsonLines(args.predictions)
  const report = evaluateAlignmentPredictions(golden, predictions, args)
  if (args.output) {
    mkdirSync(dirname(args.output), { recursive: true })
    writeFileSync(args.output, `${JSON.stringify({ ...report, predictions }, null, 2)}\n`)
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (args.strict && !report.passed) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
