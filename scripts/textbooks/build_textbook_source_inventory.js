#!/usr/bin/env node
import { parseArgs, readJson, readJsonLines, writeJson } from './library_common.js'

const STAGE_LABELS = { primary: '小学', junior: '初中' }

function exactSlotMatch(slot, source) {
  return source.stage === STAGE_LABELS[slot.stage] &&
    source.textbook_subject === slot.subject &&
    source.edition === slot.source_edition &&
    source.resource_type === slot.resource_type &&
    source.grade === slot.grade &&
    source.grade_start === slot.grade &&
    source.grade_end === slot.grade &&
    source.volume === slot.volume
}

function staleSpanMatch(slot, source) {
  return source.stage === STAGE_LABELS[slot.stage] &&
    source.textbook_subject === slot.subject &&
    source.edition === slot.source_edition &&
    source.resource_type === slot.resource_type &&
    source.grade === null &&
    source.grade_start <= slot.grade && source.grade_end >= slot.grade
}

function sourceLockRow(slot, source, sourceCommit) {
  const direct = source.direct_record
  return {
    edition_id: slot.edition_id,
    work_id: slot.work_id,
    resource_type: slot.resource_type,
    stage: slot.stage,
    subject: slot.subject,
    subject_slug: slot.subject_slug,
    grade: slot.grade,
    volume: slot.volume,
    edition_name: slot.edition_name,
    selection_class: slot.selection_class,
    source_id: source.source_id,
    source_commit: sourceCommit,
    source_kind: source.preferred_source_kind,
    evidence_id: direct?.evidence_id || null,
    logical_source_path: source.logical_source_path,
    repository_path: direct?.repository_path || null,
    git_object: direct?.git_object || null,
    fragments: source.fragments.map(item => ({ repository_path: item.repository_path, git_object: item.git_object, fragment_number: item.fragment_number })),
    revision_status: 'revision_unknown',
    transfer_status: 'not_acquired'
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const slots = readJsonLines(args.catalog || 'data/textbooks/catalog/expected_editions.jsonl')
  const index = readJson(args.index || 'generated/textbook_library/china_textbook_source_index.json')
  const rows = []
  const lock = []
  for (const slot of slots) {
    const exact = index.source_groups.filter(source => exactSlotMatch(slot, source))
    const stale = index.source_groups.filter(source => staleSpanMatch(slot, source))
    let status = 'missing_source'
    let selected = null
    const errors = []
    if (exact.length === 1) {
      selected = exact[0]
      status = selected.downloadable ? 'source_candidate_revision_unknown' : 'source_incomplete'
      if (selected.downloadable) lock.push(sourceLockRow(slot, selected, index.source_commit))
    } else if (exact.length > 1) {
      status = 'ambiguous_source'
      errors.push(`multiple exact source groups: ${exact.map(item => item.logical_source_path).join(', ')}`)
    } else if (stale.length) status = 'stale_fallback_only'
    rows.push({
      edition_id: slot.edition_id,
      work_id: slot.work_id,
      resource_type: slot.resource_type,
      stage: slot.stage,
      subject: slot.subject,
      grade: slot.grade,
      volume: slot.volume,
      edition_name: slot.edition_name,
      source_edition: slot.source_edition,
      match_status: status,
      selected_source_id: selected?.source_id || null,
      selected_source_path: selected?.logical_source_path || null,
      stale_candidate_paths: stale.map(item => item.logical_source_path),
      errors
    })
  }
  const totals = Object.fromEntries([...new Set(rows.map(row => row.match_status))].sort().map(status => [status, rows.filter(row => row.match_status === status).length]))
  const inventory = { schema_version: 1, source_commit: index.source_commit, generated_at: new Date().toISOString(), catalog_count: slots.length, rows, totals }
  const lockPayload = { schema_version: 1, profile_id: readJson(args.profile || 'data/textbooks/catalog/baseline_profile.json').profile_id, source_repo: index.source_repo, source_commit: index.source_commit, generated_at: new Date().toISOString(), locked_source_count: lock.length, rows: lock }
  writeJson(args.out || 'generated/textbook_library/source_inventory.json', inventory)
  writeJson(args.lockOut || 'data/textbooks/catalog/baseline_source_lock.json', lockPayload)
  console.log(JSON.stringify({ valid: !rows.some(row => row.match_status === 'ambiguous_source'), catalog_count: slots.length, locked_source_count: lock.length, totals }, null, 2))
  if (args.strict && rows.some(row => row.match_status === 'ambiguous_source')) process.exit(1)
}

main()
