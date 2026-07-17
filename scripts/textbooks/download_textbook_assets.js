#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { appendJournal, ingestPdf, writeRunResult } from './asset_ingestion.js'
import { nowIso, parseArgs, readJson, writeJson } from './library_common.js'
import { acquireWriterLease } from './library_storage.js'
import { verifyPdf } from './verify_textbook_asset.js'

const RAW_GITHUB_FALLBACK_IPS = [
  '185.199.108.133',
  '185.199.109.133',
  '185.199.110.133',
  '185.199.111.133'
]

function curlAttempt(url, path, resolveIp = null) {
  const maxTimeSeconds = resolveIp ? 75 : 240
  const curlArgs = [
    '--location', '--fail', '--silent', '--show-error', '--http1.1',
    '--connect-timeout', '10', '--max-time', String(maxTimeSeconds), '--speed-time', '45', '--speed-limit', '1024',
    '--retry', resolveIp ? '0' : '1', '--retry-delay', '2', '--retry-all-errors', '--continue-at', '-', '--output', path
  ]
  if (resolveIp) curlArgs.push('--resolve', `raw.githubusercontent.com:443:${resolveIp}`)
  curlArgs.push(url)
  return spawnSync('curl', curlArgs, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: (maxTimeSeconds + 20) * 1000 })
}

function download(url, path) {
  const attempts = []
  const candidates = [null, ...RAW_GITHUB_FALLBACK_IPS]
  for (const resolveIp of candidates) {
    const result = curlAttempt(url, path, resolveIp)
    const attempt = {
      route: resolveIp ? `raw-github-ip:${resolveIp}` : 'normal-dns',
      status: result.status,
      signal: result.signal || null,
      stderr: String(result.stderr || '').trim()
    }
    attempts.push(attempt)
    if (result.status === 0) return { ...attempt, attempts }
  }
  return { ...attempts.at(-1), attempts }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.plan) throw new Error('--plan is required')
  const plan = readJson(args.plan)
  const lease = acquireWriterLease({ libraryRoot: args.libraryRoot, envFile: args.envFile, runId: plan.run_id })
  const root = lease.doctor.root
  const runDir = join(root, 'state/runs', plan.run_id)
  const journalPath = join(runDir, 'events.worker-0.jsonl')
  const resultPath = join(runDir, 'run.result.json')
  const rows = []
  try {
    process.env.TMPDIR = lease.doctor.tmpdir
    writeJson(join(runDir, 'plan.json'), plan)
    for (const item of plan.items) {
      const stagingPath = join(root, 'staging/downloads', `${item.edition_id}.pdf.part`)
      let ready = false
      if (existsSync(stagingPath)) {
        try { ready = verifyPdf(stagingPath, { expectedGitObject: item.git_object }).valid } catch { ready = false }
      }
      let transfer = { status: 0, stderr: '', resumed_existing_complete: ready }
      if (!ready) {
        const downloaded = download(item.raw_url, stagingPath)
        transfer = { ...downloaded, resumed_existing_complete: false }
        appendJournal(journalPath, {
          event: downloaded.status === 0 ? 'transfer_completed' : 'transfer_failed',
          at: nowIso(),
          run_id: plan.run_id,
          edition_id: item.edition_id,
          expected_bytes: item.expected_bytes,
          transfer
        })
      }
      if (!ready && transfer.status !== 0) {
        rows.push({ edition_id: item.edition_id, ok: false, transfer, error: 'download failed; resumable staging fragment retained' })
        continue
      }
      try {
        const ingested = ingestPdf({ inputPath: stagingPath, stagingPath, root, lockRow: item, runId: plan.run_id, journalPath, copyInput: false })
        rows.push({ edition_id: item.edition_id, ok: ingested.ok, transfer, sha256: ingested.event?.sha256 || null, errors: ingested.verification?.errors || [] })
      } catch (error) {
        const failure = { event: 'ingest_exception', at: nowIso(), run_id: plan.run_id, edition_id: item.edition_id, message: error.message, transfer }
        appendJournal(journalPath, failure)
        rows.push({ edition_id: item.edition_id, ok: false, transfer, error: error.message })
      }
    }
    const result = { schema_version: 1, run_id: plan.run_id, completed_at: nowIso(), type: 'download', total: rows.length, succeeded: rows.filter(row => row.ok).length, failed: rows.filter(row => !row.ok).length, rows }
    writeRunResult(resultPath, result)
    console.log(JSON.stringify(result, null, 2))
    if (args.strict && result.failed) process.exitCode = 1
  } finally {
    lease.release()
  }
}

main()
