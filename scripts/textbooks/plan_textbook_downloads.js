#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { parseArgs, readJson, readJsonLines, writeJson } from './library_common.js'
import { doctorLibrary } from './library_storage.js'

function rawUrl(row) {
  return `https://raw.githubusercontent.com/TapXWorld/ChinaTextbook/${encodeURIComponent(row.source_commit)}/${row.repository_path.split('/').map(encodeURIComponent).join('/')}`
}

function discoverSizes(commit) {
  const url = `https://api.github.com/repos/TapXWorld/ChinaTextbook/git/trees/${encodeURIComponent(commit)}?recursive=1`
  const result = spawnSync('curl', ['--location', '--fail', '--silent', '--show-error', '--connect-timeout', '15', '--max-time', '60', '-H', 'Accept: application/vnd.github+json', url], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  if (result.status !== 0) return { ok: false, sizes: new Map(), status: result.status, error: String(result.stderr || '').trim() || null }
  try {
    const payload = JSON.parse(result.stdout)
    return { ok: true, sizes: new Map((payload.tree || []).filter(item => item.type === 'blob' && Number.isFinite(item.size)).map(item => [item.path, item.size])), status: 0, error: null, truncated: Boolean(payload.truncated) }
  } catch (error) {
    return { ok: false, sizes: new Map(), status: 0, error: `invalid GitHub tree response: ${error.message}` }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const lock = readJson(args.lock || 'data/textbooks/catalog/baseline_source_lock.json')
  const subjects = String(args.subjects || '').split(',').map(item => item.trim()).filter(Boolean)
  const scope = args.scope || 'all'
  const limit = Math.max(1, Number(args.limit || args.batchSize || 20))
  const offset = Math.max(0, Number(args.offset || 0))
  let rows = lock.rows.filter(row => row.source_kind === 'direct_pdf')
  if (scope !== 'all') rows = rows.filter(row => row.stage === scope)
  if (subjects.length) rows = rows.filter(row => subjects.includes(row.subject))
  if (args.selectionClass) rows = rows.filter(row => row.selection_class === args.selectionClass)
  let acquiredEditionIds = new Set()
  if (args.missingOnly) {
    const current = readJson(args.current || 'data/textbooks/library-state/CURRENT.json')
    const registryPath = args.registry || `data/textbooks/library-state/generations/${current.generation_id}/asset_registry.lock.jsonl`
    acquiredEditionIds = new Set(readJsonLines(registryPath).filter(row => row.transfer_verified && row.pdf_structural_verified).map(row => row.edition_id))
    rows = rows.filter(row => !acquiredEditionIds.has(row.edition_id))
  }
  rows = rows.slice(offset, offset + limit)
  const sizeDiscovery = args.skipHead ? { ok: false, sizes: new Map(), status: null, error: 'skipped' } : discoverSizes(lock.source_commit)
  let planned = rows.map(row => {
    const url = rawUrl(row)
    const expectedBytes = sizeDiscovery.sizes.get(row.repository_path) || null
    return { ...row, raw_url: url, raw_url_hash: createHash('sha256').update(url).digest('hex'), expected_bytes: expectedBytes, size_discovery: { ok: Boolean(expectedBytes), source: expectedBytes ? 'github_git_tree' : 'unknown', error: expectedBytes ? null : sizeDiscovery.error } }
  })
  const unknown = planned.filter(row => !row.expected_bytes)
  if (unknown.length > 1 && !args.allowUnknownBatch) {
    const firstUnknown = unknown[0]
    planned = planned.filter(row => row.expected_bytes || row.edition_id === firstUnknown.edition_id)
  }
  const expectedBytes = planned.reduce((sum, row) => sum + Number(row.expected_bytes || 0), 0)
  const doctor = doctorLibrary({ libraryRoot: args.libraryRoot, envFile: args.envFile, requiredBytes: expectedBytes })
  const runId = args.runId || `download-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}-${createHash('sha1').update(planned.map(row => row.edition_id).join('|')).digest('hex').slice(0, 8)}`
  const output = args.out || `generated/textbook_library/runs/${runId}/plan.json`
  const plan = { schema_version: 1, run_id: runId, created_at: new Date().toISOString(), source_commit: lock.source_commit, library_id: doctor.root.split('/').at(-1), expected_bytes: expectedBytes || null, item_count: planned.length, scope, subjects, missing_only: Boolean(args.missingOnly), acquired_edition_count: acquiredEditionIds.size, size_discovery: { ok: sizeDiscovery.ok, status: sizeDiscovery.status, error: sizeDiscovery.error, truncated: sizeDiscovery.truncated || false }, items: planned }
  writeJson(output, plan)
  console.log(JSON.stringify({ valid: true, run_id: runId, wrote: output, item_count: planned.length, expected_bytes: expectedBytes || null, unknown_size_items: planned.filter(row => !row.expected_bytes).length }, null, 2))
}

main()
