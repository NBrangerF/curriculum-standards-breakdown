#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteJson, nowIso, parseArgs, readJson, readJsonLines, sha256Text, writeJson, writeJsonLines } from './library_common.js'
import { acquireWriterLease } from './library_storage.js'
import { sha256FileChunked } from './verify_textbook_asset.js'

function readEvents(root) {
  const runsRoot = join(root, 'state/runs')
  const events = []
  for (const name of readdirSync(runsRoot, { withFileTypes: true }).filter(item => item.isDirectory() && !item.name.startsWith('.')).map(item => item.name).sort()) {
    const runDir = join(runsRoot, name)
    for (const file of readdirSync(runDir).filter(file => /^events\.worker-\d+\.jsonl$/.test(file)).sort()) {
      const lines = readFileSync(join(runDir, file), 'utf8').split(/\r?\n/).filter(Boolean)
      lines.forEach((line, index) => {
        try { events.push(JSON.parse(line)) } catch (error) { throw new Error(`Malformed journal ${name}/${file}:${index + 1}: ${error.message}`) }
      })
    }
  }
  return events
}

function coverageSnapshot(catalog, registry, profile, generationId) {
  const byEdition = new Map(registry.map(row => [row.edition_id, row]))
  const textbookEditions = catalog.filter(row => row.resource_type === 'student_textbook')
  const textbookTargets = textbookEditions.filter(row => row.expected_status === 'current_target')
  const scheduledTargets = textbookEditions.filter(row => row.expected_status === 'scheduled_release')
  const companionTargets = catalog.filter(row => row.resource_type === 'student_companion')
  const count = (targets, field) => targets.filter(row => byEdition.get(row.edition_id)?.[field]).length
  const byStageSubject = {}
  for (const target of textbookTargets) {
    const key = `${target.stage}/${target.subject}`
    byStageSubject[key] ||= { target: 0, transfer_verified: 0, pdf_structural_verified: 0, bibliographic_verified: 0, current_confirmed: 0 }
    byStageSubject[key].target += 1
    const asset = byEdition.get(target.edition_id)
    for (const field of ['transfer_verified', 'pdf_structural_verified', 'bibliographic_verified', 'current_confirmed']) if (asset?.[field]) byStageSubject[key][field] += 1
  }
  return {
    schema_version: 1,
    generation_id: generationId,
    generated_at: nowIso(),
    catalog_edition_count: textbookEditions.length,
    catalog_target_count: textbookTargets.length,
    scheduled_release_count: scheduledTargets.length,
    scheduled_asset_count: scheduledTargets.filter(row => byEdition.has(row.edition_id)).length,
    companion_target_count: companionTargets.length,
    asset_count: registry.length,
    transfer_verified_count: count(textbookTargets, 'transfer_verified'),
    pdf_structural_verified_count: count(textbookTargets, 'pdf_structural_verified'),
    bibliographic_verified_count: count(textbookTargets, 'bibliographic_verified'),
    current_confirmed_count: count(textbookTargets, 'current_confirmed'),
    companion_transfer_verified_count: count(companionTargets, 'transfer_verified'),
    scope_decision_coverage: Object.fromEntries((profile.scope_decisions || []).map(item => [item.scope_id, item.status])),
    by_stage_subject: byStageSubject
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const lease = acquireWriterLease({ libraryRoot: args.libraryRoot, envFile: args.envFile, runId: args.run || `reconcile-${Date.now()}` })
  const root = lease.doctor.root
  try {
    const events = readEvents(root).filter(event => event.event === 'asset_ingested')
    const latest = new Map()
    for (const event of events) latest.set(event.edition_id, event)
    const registry = [...latest.values()].sort((a, b) => a.edition_id.localeCompare(b.edition_id)).map(event => ({
      schema_version: 1,
      asset_id: `asset_${event.sha256.slice(0, 24)}`,
      edition_id: event.edition_id,
      work_id: event.work_id,
      resource_type: event.resource_type,
      stage: event.stage,
      subject: event.subject,
      subject_slug: event.subject_slug,
      grade: event.grade,
      volume: event.volume,
      edition_name: event.edition_name,
      selection_class: event.selection_class,
      source_id: event.source_id,
      source_repository: event.source_repository,
      source_commit: event.source_commit,
      source_url: event.source_url,
      source_detail_url: event.source_detail_url,
      source_kind: event.source_kind,
      source_sha1: event.source_sha1,
      source_md5: event.source_md5,
      source_original_bytes: event.source_original_bytes,
      source_binary_match: event.source_binary_match,
      source_derivation: event.source_derivation,
      repository_path: event.repository_path,
      evidence_id: event.evidence_id,
      git_object: event.git_object,
      sha256: event.sha256,
      object_path: event.object_path,
      bytes: event.bytes,
      pages: event.pages,
      transfer_verified: event.transfer_verified,
      pdf_structural_verified: event.pdf_structural_verified,
      bibliographic_verified: event.bibliographic_verified,
      current_confirmed: event.current_confirmed,
      revision_status: event.revision_status,
      expected_status: event.expected_status,
      availability_status: event.availability_status,
      release_term: event.release_term,
      last_run_id: event.run_id,
      ingested_at: event.at
    }))
    const catalog = readJsonLines(args.catalog || 'data/textbooks/catalog/expected_editions.jsonl')
    const profile = readJson(args.profile || 'data/textbooks/catalog/baseline_profile.json')
    const generationSeed = `${nowIso()}|${registry.map(row => `${row.edition_id}:${row.sha256}`).join('|')}`
    const generationId = `gen-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}-${createHash('sha1').update(generationSeed).digest('hex').slice(0, 10)}`
    const coverage = coverageSnapshot(catalog, registry, profile, generationId)
    const x9Dir = join(root, 'state/generations', generationId)
    const trackedDir = join(args.stateRoot || 'data/textbooks/library-state/generations', generationId)
    if (existsSync(x9Dir) || existsSync(trackedDir)) throw new Error(`Generation already exists: ${generationId}`)
    mkdirSync(x9Dir, { recursive: true })
    mkdirSync(trackedDir, { recursive: true })
    const x9Registry = join(x9Dir, 'asset_manifest.jsonl')
    const trackedRegistry = join(trackedDir, 'asset_registry.lock.jsonl')
    const x9Coverage = join(x9Dir, 'coverage.snapshot.json')
    const trackedCoverage = join(trackedDir, 'coverage.snapshot.json')
    writeJsonLines(x9Registry, registry)
    writeJsonLines(trackedRegistry, registry)
    writeJson(x9Coverage, coverage)
    writeJson(trackedCoverage, coverage)
    const commit = {
      schema_version: 1,
      generation_id: generationId,
      created_at: nowIso(),
      asset_count: registry.length,
      registry_sha256: sha256FileChunked(x9Registry),
      coverage_sha256: sha256FileChunked(x9Coverage),
      source_event_count: events.length
    }
    writeJson(join(x9Dir, 'COMMIT.json'), commit)
    writeJson(join(trackedDir, 'COMMIT.json'), commit)
    if (sha256FileChunked(trackedRegistry) !== commit.registry_sha256 || sha256FileChunked(trackedCoverage) !== commit.coverage_sha256) throw new Error('Cross-volume generation hash mismatch')
    const currentPath = args.current || 'data/textbooks/library-state/CURRENT.json'
    atomicWriteJson(currentPath, { schema_version: 1, generation_id: generationId, commit_sha256: sha256Text(JSON.stringify(commit)), updated_at: nowIso() })
    writeJsonLines('generated/textbook_library/asset_manifest.jsonl', registry)
    writeJson('generated/textbook_library/coverage.json', coverage)
    console.log(JSON.stringify({ valid: true, generation_id: generationId, asset_count: registry.length, source_event_count: events.length, current: currentPath, coverage }, null, 2))
  } finally {
    lease.release()
  }
}

main()
