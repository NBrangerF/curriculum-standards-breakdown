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
    if (row.case_id && row.decision) {
      predictions.push(row)
      continue
    }
    if (row.candidate_id && row.decision) {
      predictions.push({ case_id: row.candidate_id, decision: row.decision, relation_type: row.relation_type ?? null })
      continue
    }
    for (const item of row.model_output?.items || []) {
      for (const decision of item.decisions || []) {
        predictions.push({
          case_id: decision.candidate_id,
          decision: decision.decision,
          relation_type: decision.relation_type ?? null,
          provenance: row.provenance || null
        })
      }
    }
  }
  return predictions
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
    const input = makeAlignmentResponseInput(items)
    const inputHash = alignmentInputHash({ provider: config.provider, model: config.model, items })
    const result = await requestAlignmentAdjudication(input, { config, maxOutputTokens: 3_500 })
    if (!result.ok) {
      for (const row of cases) predictions.push({
        case_id: row.case_id,
        decision: 'missing',
        relation_type: null,
        error: result.status
      })
      continue
    }
    const validation = validateAlignmentModelOutput(result.output, items)
    if (!validation.ok) {
      for (const row of cases) predictions.push({
        case_id: row.case_id,
        decision: 'missing',
        relation_type: null,
        error: 'invalid_semantic_output',
        validation_errors: validation.errors
      })
      continue
    }
    for (const item of validation.value.items) {
      for (const decision of item.decisions) {
        predictions.push({
          case_id: decision.candidate_id,
          decision: decision.decision,
          relation_type: decision.relation_type,
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

export function evaluateAlignmentPredictions(golden, predictionRows, thresholds = {}) {
  const predictions = new Map(flattenPredictionRows(predictionRows).map(row => [row.case_id, row]))
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
  const cases = []

  for (const row of golden) {
    const prediction = predictions.get(row.case_id) || { decision: 'missing', relation_type: null }
    const expected = row.expected.decision
    if (prediction.decision === 'abstain') abstained += 1
    if (expected === 'accept') {
      if (prediction.decision === 'accept') {
        truePositive += 1
        acceptedTruePositive += 1
        if (row.expected.allowed_relation_types.includes(prediction.relation_type)) correctRelation += 1
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
      || (prediction.decision === 'accept' && row.expected.allowed_relation_types.includes(prediction.relation_type))
    cases.push({
      case_id: row.case_id,
      tags: row.tags,
      expected_decision: expected,
      predicted_decision: prediction.decision,
      predicted_relation_type: prediction.relation_type ?? null,
      decision_correct: expected === prediction.decision,
      relation_correct: relationOk,
      rationale: prediction.rationale || null,
      error: prediction.error || null
    })
  }

  const precision = ratio(truePositive, truePositive + falsePositive)
  const recall = ratio(truePositive, truePositive + falseNegative)
  const abstainRate = ratio(abstained, golden.length)
  const requiredKnownNegatives = cases.filter(row => row.tags.includes('known_false_positive'))
  const requiredKnownNegativesPassed = requiredKnownNegatives.every(row => row.predicted_decision === 'reject')
  const metrics = {
    cases: golden.length,
    true_positive: truePositive,
    false_positive: falsePositive,
    false_negative: falseNegative,
    precision,
    recall,
    abstain_rate: abstainRate,
    negative_rejection_rate: ratio(correctlyRejected, expectedReject),
    expected_abstain_accuracy: ratio(correctlyAbstained, expectedAbstain),
    accepted_relation_accuracy: ratio(correctRelation, acceptedTruePositive),
    required_known_negative_cases: requiredKnownNegatives.length,
    required_known_negatives_passed: requiredKnownNegativesPassed
  }
  const appliedThresholds = {
    min_precision: thresholds.minPrecision ?? 0.95,
    min_recall: thresholds.minRecall ?? 0.8,
    max_abstain_rate: thresholds.maxAbstainRate ?? 0.25,
    require_all_known_false_positives_rejected: true
  }
  const passed = precision >= appliedThresholds.min_precision
    && recall >= appliedThresholds.min_recall
    && abstainRate <= appliedThresholds.max_abstain_rate
    && requiredKnownNegativesPassed
  return {
    eval: 'textbook_standard_llm_semantic_alignment',
    prompt_version: LLM_ALIGNMENT_PROMPT_VERSION,
    schema_version: LLM_ALIGNMENT_SCHEMA_VERSION,
    metrics,
    thresholds: appliedThresholds,
    passed,
    cases
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
