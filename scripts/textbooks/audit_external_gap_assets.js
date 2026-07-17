#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs, readJson, readJsonLines, writeJson } from './library_common.js'
import { doctorLibrary } from './library_storage.js'
import { verifyPdf } from './verify_textbook_asset.js'

const args = parseArgs(process.argv.slice(2))
const sourceCatalog = readJson(args.sources || 'data/textbooks/catalog/external_gap_sources.json')
const expectedCatalog = readJsonLines(args.catalog || 'data/textbooks/catalog/expected_editions.jsonl')
const current = readJson(args.current || 'data/textbooks/library-state/CURRENT.json')
const registry = readJsonLines(join(args.stateRoot || 'data/textbooks/library-state/generations', current.generation_id, 'asset_registry.lock.jsonl'))
const doctor = doctorLibrary({ libraryRoot: args.libraryRoot, envFile: args.envFile })
const bySource = new Map(registry.map(row => [row.source_id, row]))
const bySlot = new Map(expectedCatalog.filter(row => row.resource_type === 'student_textbook').map(row => [`${row.stage}/${row.subject}/${row.grade}/${row.volume}`, row]))
const errors = []
const assets = []

for (const source of [...sourceCatalog.current_assets, ...sourceCatalog.future_candidates]) {
  const row = bySource.get(source.source_id)
  if (!row) {
    errors.push(`missing source ${source.source_id}`)
    continue
  }
  const expectedStatus = sourceCatalog.future_candidates.some(item => item.source_id === source.source_id) ? 'scheduled_release' : 'current_target'
  if (row.expected_status !== expectedStatus) errors.push(`${source.source_id}: expected_status ${row.expected_status} != ${expectedStatus}`)
  if (row.pages !== source.expected_pages) errors.push(`${source.source_id}: pages ${row.pages} != ${source.expected_pages}`)
  if (source.expected_bytes && row.bytes !== source.expected_bytes) errors.push(`${source.source_id}: bytes ${row.bytes} != ${source.expected_bytes}`)
  if (source.source_sha1 && row.source_sha1 !== source.source_sha1) errors.push(`${source.source_id}: source sha1 mismatch`)
  if (source.kind === 'smartedu_preview_pdf' && (row.source_binary_match !== false || row.source_derivation !== 'official_page_preview_reconstruction')) errors.push(`${source.source_id}: SmartEdu derivation metadata mismatch`)
  const objectPath = join(doctor.root, row.object_path)
  if (!existsSync(objectPath)) errors.push(`${source.source_id}: object missing`)
  else {
    const verification = verifyPdf(objectPath)
    if (!verification.valid || verification.sha256 !== row.sha256 || verification.pages !== row.pages) errors.push(`${source.source_id}: PDF verification failed`)
  }
  assets.push({
    source_id: source.source_id,
    material_status: source.material_status || (source.current_confirmed ? 'official_current' : 'candidate'),
    expected_status: row.expected_status,
    current_confirmed: row.current_confirmed,
    bibliographic_verified: row.bibliographic_verified,
    pages: row.pages,
    bytes: row.bytes,
    sha256: row.sha256,
    object_path: row.object_path,
    source_derivation: row.source_derivation
  })
}

for (const gap of sourceCatalog.unreleased_slots) {
  const key = `${gap.stage}/${gap.subject}/${gap.grade}/${gap.volume}`
  const target = bySlot.get(key)
  if (!target) errors.push(`unreleased slot missing from catalog: ${key}`)
  else if (target.expected_status !== 'scheduled_release') errors.push(`unreleased slot is active current target: ${key}`)
}

const currentTargets = expectedCatalog.filter(row => row.resource_type === 'student_textbook' && row.expected_status === 'current_target')
const registeredEditionIds = new Set(registry.map(row => row.edition_id))
const missingCurrentTargets = currentTargets.filter(row => !registeredEditionIds.has(row.edition_id)).map(row => `${row.stage}/${row.subject}/${row.grade}/${row.volume}`)
if (missingCurrentTargets.length) errors.push(`missing current targets: ${missingCurrentTargets.join(', ')}`)

const report = {
  schema_version: 1,
  valid: errors.length === 0,
  generation_id: current.generation_id,
  current_target_count: currentTargets.length,
  current_target_asset_count: currentTargets.filter(row => registeredEditionIds.has(row.edition_id)).length,
  requested_gap_asset_count: sourceCatalog.current_assets.length,
  acquired_current_gap_asset_count: assets.filter(row => row.expected_status === 'current_target').length,
  acquired_future_candidate_count: assets.filter(row => row.expected_status === 'scheduled_release').length,
  unreleased_slots: sourceCatalog.unreleased_slots,
  assets,
  errors
}
writeJson(args.out || 'generated/textbook_library/external_gap_audit.json', report)
console.log(JSON.stringify(report, null, 2))
if (!report.valid && args.strict) process.exit(1)
