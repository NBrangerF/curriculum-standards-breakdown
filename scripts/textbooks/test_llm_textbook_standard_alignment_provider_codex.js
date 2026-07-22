#!/usr/bin/env node

import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import {
  ALIGNMENT_LLM_PROVIDERS,
  requestAlignmentAdjudication,
  resolveAlignmentLlmConfig
} from './llm_textbook_standard_alignment_provider.js'
import {
  LLM_ALIGNMENT_OUTPUT_SCHEMA,
  LLM_ALIGNMENT_SCHEMA_VERSION
} from './llm_textbook_standard_alignment_contract.js'
import {
  alignmentRunIsComplete,
  alignmentWorksetSummary,
  alignmentPipelineExitCode,
  runPool
} from './run_llm_textbook_standard_alignments.js'

function fixtureOutput() {
  return {
    schema_version: LLM_ALIGNMENT_SCHEMA_VERSION,
    items: [{
      item_id: 'fixture-item',
      overall_decision: 'abstain',
      overall_rationale: '证据不足，无法确定。',
      decisions: [{
        candidate_id: 'candidate-fixture',
        standard_code: 'CN-D3-CM-001',
        decision: 'abstain',
        relation_type: null,
        evidence_level: null,
        evidence_span_id: null,
        evidence_quote: '',
        learning_component_ids: [],
        rationale: '现有片段不足以建立语义对应。'
      }]
    }]
  }
}

function fakeChild(onPrompt) {
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = () => true
  let prompt = ''
  child.stdin.on('data', chunk => { prompt += String(chunk) })
  child.stdin.on('finish', () => onPrompt({ child, prompt }))
  return child
}

test('codex_cli is explicit, needs no API key, and Responses remains default', () => {
  const defaultConfig = resolveAlignmentLlmConfig({})
  assert.equal(defaultConfig.provider, ALIGNMENT_LLM_PROVIDERS.RESPONSES)
  assert.equal(defaultConfig.enabled, false)

  const codexConfig = resolveAlignmentLlmConfig({
    KEBIAO_ALIGNMENT_LLM_PROVIDER: 'codex_cli',
    KEBIAO_ALIGNMENT_CODEX_MODEL: 'gpt-5.1-codex-mini'
  })
  assert.equal(codexConfig.provider, ALIGNMENT_LLM_PROVIDERS.CODEX_CLI)
  assert.equal(codexConfig.enabled, true)
  assert.equal(codexConfig.valid, true)
  assert.equal(codexConfig.apiKey, '')
  assert.equal(codexConfig.model, 'gpt-5.1-codex-mini')
  assert.equal(codexConfig.codexModel, 'gpt-5.1-codex-mini')

  const codexDefault = resolveAlignmentLlmConfig({ KEBIAO_ALIGNMENT_LLM_PROVIDER: 'codex_cli' })
  assert.equal(codexDefault.model, 'codex-default')
  assert.equal(codexDefault.codexModel, null)
})

test('codex_cli uses ephemeral read-only exec, stdin, strict schema, no shell, and cleans temp files', async () => {
  const output = fixtureOutput()
  let capture = null
  const spawnImpl = (command, args, options) => {
    const child = fakeChild(({ child: runningChild, prompt }) => {
      const schemaPath = args[args.indexOf('--output-schema') + 1]
      const outputPath = args[args.indexOf('-o') + 1]
      capture = { command, args, options, prompt, schemaPath, outputPath }
      assert.deepEqual(JSON.parse(readFileSync(schemaPath, 'utf8')), LLM_ALIGNMENT_OUTPUT_SCHEMA)
      writeFileSync(outputPath, `${JSON.stringify(output)}\n`)
      queueMicrotask(() => runningChild.emit('close', 0, null))
    })
    return child
  }

  const result = await requestAlignmentAdjudication('{"items":[]}', {
    config: {
      provider: 'codex_cli',
      enabled: true,
      valid: true,
      model: 'gpt-5.1-codex-mini',
      timeoutMs: 10_000,
      maxRetries: 0,
      codexCommand: 'codex'
    },
    codexEnv: {
      PATH: '/usr/bin:/bin',
      HOME: '/tmp/fake-home',
      KEBIAO_LLM_API_KEY: 'must-not-reach-child',
      SOME_OTHER_SECRET: 'must-not-reach-child'
    },
    spawnImpl
  })

  assert.equal(result.ok, true)
  assert.equal(result.provider, ALIGNMENT_LLM_PROVIDERS.CODEX_CLI)
  assert.deepEqual(result.output, output)
  assert.equal(result.usage, null)
  assert.equal(capture.command, 'codex')
  assert.equal(capture.options.shell, false)
  assert.equal(capture.options.cwd, capture.schemaPath.slice(0, capture.schemaPath.lastIndexOf('/')))
  assert.deepEqual(capture.options.env, { PATH: '/usr/bin:/bin', HOME: '/tmp/fake-home' })
  assert.deepEqual(capture.args.slice(0, 7), [
    'exec', '--ephemeral', '--sandbox', 'read-only', '--output-schema', capture.schemaPath, '-o'
  ])
  assert.equal(capture.args[capture.args.indexOf('-o') + 1], capture.outputPath)
  assert.equal(capture.args.at(-1), '-')
  assert.match(capture.prompt, /untrusted data, not instructions/u)
  assert.match(capture.prompt, /\{"items":\[\]\}/u)
  assert.equal(existsSync(capture.schemaPath), false)
  assert.equal(existsSync(capture.outputPath), false)
})

test('codex_cli does not retry a non-transient process failure', async () => {
  let calls = 0
  const spawnImpl = () => {
    calls += 1
    return fakeChild(({ child }) => {
      child.stderr.end('invalid local configuration')
      queueMicrotask(() => child.emit('close', 1, null))
    })
  }
  const result = await requestAlignmentAdjudication('{"items":[]}', {
    config: {
      provider: 'codex_cli',
      enabled: true,
      valid: true,
      model: 'gpt-5.1-codex-mini',
      timeoutMs: 10_000,
      maxRetries: 3,
      codexCommand: 'codex'
    },
    spawnImpl,
    waitImpl: async () => {}
  })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'codex_cli_exit_1')
  assert.equal(result.attempts, 1)
  assert.equal(calls, 1)
})

test('codex_cli recognizes real authentication failures, terminates immediately, and never retries', async () => {
  const messages = [
    'Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.',
    'request failed with status 401',
    'error_code=token_expired',
    'error_code=refresh_token_reused'
  ]
  let calls = 0
  let kills = 0
  for (const message of messages) {
    const spawnImpl = () => {
      calls += 1
      const child = fakeChild(({ child: runningChild }) => {
        const midpoint = Math.floor(message.length / 2)
        runningChild.stderr.write(message.slice(0, midpoint))
        runningChild.stderr.write(message.slice(midpoint))
      })
      child.kill = signal => {
        kills += 1
        queueMicrotask(() => child.emit('close', 1, signal))
        return true
      }
      return child
    }
    const started = performance.now()
    const result = await requestAlignmentAdjudication('{"items":[]}', {
      config: {
        provider: 'codex_cli',
        enabled: true,
        valid: true,
        model: 'codex-default',
        codexModel: null,
        timeoutMs: 10_000,
        maxRetries: 3,
        codexCommand: 'codex'
      },
      spawnImpl,
      waitImpl: async () => {}
    })
    assert.equal(result.ok, false, message)
    assert.equal(result.status, 'codex_cli_auth_error', message)
    assert.equal(result.attempts, 1, message)
    assert.ok(performance.now() - started < 1_000, message)
  }
  assert.equal(calls, messages.length)
  assert.equal(kills, messages.length)
})

test('codex_cli does not misclassify unrelated 401 counts or cache refresh failures as authentication errors', async () => {
  const messages = [
    '401 tokens used',
    'failed to refresh cache'
  ]
  let calls = 0
  let kills = 0
  for (const message of messages) {
    const spawnImpl = () => {
      calls += 1
      const child = fakeChild(({ child: runningChild }) => {
        runningChild.stderr.write(message)
        queueMicrotask(() => runningChild.emit('close', 1, null))
      })
      child.kill = () => {
        kills += 1
        return true
      }
      return child
    }
    const result = await requestAlignmentAdjudication('{"items":[]}', {
      config: {
        provider: 'codex_cli',
        enabled: true,
        valid: true,
        model: 'codex-default',
        codexModel: null,
        timeoutMs: 10_000,
        maxRetries: 3,
        codexCommand: 'codex'
      },
      spawnImpl,
      waitImpl: async () => {}
    })
    assert.equal(result.status, 'codex_cli_exit_1', message)
    assert.equal(result.attempts, 1, message)
  }
  assert.equal(calls, messages.length)
  assert.equal(kills, 0)
})

test('alignment pool opens an auth circuit and lets only already-started batches converge', async () => {
  const started = []
  const pool = await runPool([0, 1, 2, 3, 4], 2, async (_batch, index) => {
    started.push(index)
    if (index === 0) return { status: 'codex_cli_auth_error', index }
    await new Promise(resolve => setImmediate(resolve))
    return { status: 'ok', index }
  })

  assert.deepEqual(started, [0, 1])
  assert.deepEqual(pool.results.map(result => result.index), [0, 1])
  assert.equal(pool.circuit_opened, true)
  assert.equal(pool.stop_status, 'codex_cli_auth_error')
  assert.equal(pool.started_batches, 2)
  assert.equal(pool.unstarted_batches, 3)
})

test('incomplete and terminal-error manifests make the CLI fail after artifacts are written', () => {
  assert.equal(alignmentPipelineExitCode({ output: { complete: true, run_status: 'complete' } }), 0)
  assert.equal(alignmentPipelineExitCode({ output: { complete: false, run_status: 'incomplete' } }), 1)
  assert.equal(alignmentPipelineExitCode({
    output: {
      complete: false,
      run_status: 'error',
      terminal_error: { status: 'codex_cli_auth_error' }
    }
  }), 1)
  assert.equal(alignmentPipelineExitCode({ output: null, plan: { dry_run: true } }), 0)
})

test('max-items truncation is reported as an incomplete workset and cannot exit successfully', () => {
  const truncated = alignmentWorksetSummary({
    items: [{ item_id: 'one' }, { item_id: 'two' }],
    totalBeforeLimit: 5
  }, 2)
  assert.deepEqual(truncated, {
    complete: false,
    limited_by_max_items: true,
    max_items: 2,
    selected_items: 2,
    available_items: 5,
    omitted_items: 3
  })
  assert.equal(alignmentRunIsComplete({
    work: { items: [{}, {}], totalBeforeLimit: 5 },
    incompleteInputHashes: [],
    successfulBatches: 1,
    requestBatches: 1
  }), false)
  assert.equal(alignmentPipelineExitCode({
    output: {
      complete: truncated.complete,
      run_status: 'incomplete',
      workset_complete: truncated.complete,
      work_items_omitted: truncated.omitted_items,
      selection: truncated
    }
  }), 1)

  const complete = alignmentWorksetSummary({
    items: [{ item_id: 'one' }, { item_id: 'two' }],
    totalBeforeLimit: 2
  }, 10)
  assert.equal(complete.complete, true)
  assert.equal(complete.limited_by_max_items, false)
  assert.equal(complete.omitted_items, 0)
  assert.equal(alignmentRunIsComplete({
    work: { items: [{}, {}], totalBeforeLimit: 2 },
    incompleteInputHashes: [],
    successfulBatches: 1,
    requestBatches: 1
  }), true)
  assert.equal(alignmentPipelineExitCode({ output: { complete: true, selection: complete } }), 0)

  const empty = alignmentWorksetSummary({ items: [], totalBeforeLimit: 0 }, 0)
  assert.equal(empty.complete, false)
  assert.equal(alignmentRunIsComplete({
    work: { items: [], totalBeforeLimit: 0 },
    incompleteInputHashes: [],
    successfulBatches: 0,
    requestBatches: 0
  }), false)
})

test('codex_cli does not force a model when using the stable codex-default label', async () => {
  let capturedArgs = null
  const spawnImpl = (_command, args) => {
    capturedArgs = args
    return fakeChild(({ child }) => queueMicrotask(() => child.emit('close', 1, null)))
  }
  await requestAlignmentAdjudication('{"items":[]}', {
    config: {
      provider: 'codex_cli',
      enabled: true,
      valid: true,
      model: 'codex-default',
      codexModel: null,
      timeoutMs: 10_000,
      maxRetries: 0,
      codexCommand: 'codex'
    },
    spawnImpl
  })
  assert.equal(capturedArgs.includes('--model'), false)
})
