#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { appendJournal, ingestPdf, writeRunResult } from './asset_ingestion.js'
import { nowIso, parseArgs, readJson, writeJson } from './library_common.js'
import { acquireWriterLease } from './library_storage.js'

function main() {
  const args = parseArgs(process.argv.slice(2))
  const lock = readJson(args.lock || 'data/textbooks/catalog/baseline_source_lock.json')
  const cacheDir = args.cacheDir || 'generated/textbook_evidence/pdf_cache'
  const scope = args.scope || 'all'
  const limit = Math.max(1, Number(args.limit || 20))
  const offset = Math.max(0, Number(args.offset || 0))
  let candidates = lock.rows.filter(row => row.evidence_id && existsSync(join(cacheDir, `${row.evidence_id}.pdf`)))
  if (scope !== 'all') candidates = candidates.filter(row => row.stage === scope)
  const selected = candidates.slice(offset, offset + limit)
  const runId = args.runId || `import-cache-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}-${offset}`
  const lease = acquireWriterLease({ libraryRoot: args.libraryRoot, envFile: args.envFile, runId })
  const root = lease.doctor.root
  const runDir = join(root, 'state/runs', runId)
  const journalPath = join(runDir, 'events.worker-0.jsonl')
  const rows = []
  try {
    process.env.TMPDIR = lease.doctor.tmpdir
    writeJson(join(runDir, 'plan.json'), { schema_version: 1, run_id: runId, type: 'existing_cache_import', cache_dir: cacheDir, candidate_count: candidates.length, offset, limit, selected_edition_ids: selected.map(row => row.edition_id), created_at: nowIso() })
    for (const item of selected) {
      const inputPath = join(cacheDir, `${item.evidence_id}.pdf`)
      const stagingPath = join(root, 'staging/downloads', `${item.edition_id}.pdf.part`)
      try {
        const ingested = ingestPdf({ inputPath, stagingPath, root, lockRow: item, runId, journalPath, copyInput: true })
        rows.push({ edition_id: item.edition_id, evidence_id: item.evidence_id, ok: ingested.ok, sha256: ingested.event?.sha256 || null, errors: ingested.verification?.errors || [] })
      } catch (error) {
        appendJournal(journalPath, { event: 'ingest_exception', at: nowIso(), run_id: runId, edition_id: item.edition_id, evidence_id: item.evidence_id, message: error.message })
        rows.push({ edition_id: item.edition_id, evidence_id: item.evidence_id, ok: false, error: error.message })
      }
    }
    const result = { schema_version: 1, run_id: runId, completed_at: nowIso(), type: 'existing_cache_import', candidate_count: candidates.length, total: rows.length, succeeded: rows.filter(row => row.ok).length, failed: rows.filter(row => !row.ok).length, rows }
    writeRunResult(join(runDir, 'run.result.json'), result)
    console.log(JSON.stringify(result, null, 2))
    if (args.strict && result.failed) process.exitCode = 1
  } finally {
    lease.release()
  }
}

main()
