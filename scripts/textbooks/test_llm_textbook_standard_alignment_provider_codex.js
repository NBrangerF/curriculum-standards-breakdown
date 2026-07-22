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
