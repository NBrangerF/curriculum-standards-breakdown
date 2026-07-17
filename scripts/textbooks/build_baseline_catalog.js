#!/usr/bin/env node
import { parseArgs, readJson, sha256Text, writeJson, writeJsonLines } from './library_common.js'

const DEFAULT_PROFILE = 'data/textbooks/catalog/baseline_profile.json'
const DEFAULT_OUT = 'data/textbooks/catalog/expected_editions.jsonl'
const DEFAULT_SUMMARY = 'generated/textbook_library/baseline_catalog_summary.json'

function expandVolumes(series) {
  if (series.custom_volumes) return series.custom_volumes
  const rows = []
  for (let grade = series.grade_start; grade <= series.grade_end; grade += 1) {
    if (series.volume_mode === 'semesters') {
      rows.push({ grade, volume: '上册' }, { grade, volume: '下册' })
    } else if (series.volume_mode === 'full_year') rows.push({ grade, volume: '全一册' })
    else throw new Error(`Unsupported volume_mode for ${series.stage}/${series.subject}: ${series.volume_mode}`)
  }
  return rows
}

function buildRows(profile, resourceType, seriesRows) {
  return seriesRows.flatMap(series => expandVolumes(series).map(slot => {
    const { grade, volume } = slot
    const identity = `${profile.profile_id}|${resourceType}|${series.stage}|${series.subject_slug}|${grade}|${volume}|${series.edition_name}`
    return {
      work_id: `work_${sha256Text(identity).slice(0, 16)}`,
      edition_id: `ed_${sha256Text(identity).slice(0, 20)}`,
      profile_id: profile.profile_id,
      resource_type: resourceType,
      stage: series.stage,
      subject: series.subject,
      subject_slug: series.subject_slug,
      grade,
      volume,
      title: `义务教育教科书·${series.subject}${grade}年级${volume}`,
      publisher: series.publisher,
      edition_name: series.edition_name,
      source_edition: series.source_edition,
      selection_class: series.selection_class,
      curriculum_revision: profile.target_curriculum_revision,
      revision_year: 2022,
      isbn: null,
      edition_statement: null,
      impression: null,
      publication_date: null,
      official_catalog_ref: profile.official_catalog_ref,
      start_grade: series.start_grade || series.grade_start || grade,
      expected_status: slot.expected_status || series.expected_status || 'current_target',
      availability_status: slot.availability_status || series.availability_status || 'available_or_verify',
      release_term: slot.release_term || null,
      not_released_checked_at: slot.not_released_checked_at || null,
      source_revision_expectation: slot.source_revision_expectation || series.source_revision_expectation || 'verify_current',
      source_repository: profile.source_repository,
      source_commit: profile.source_commit
    }
  }))
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const profilePath = args.profile || DEFAULT_PROFILE
  const outPath = args.out || DEFAULT_OUT
  const summaryPath = args.summaryOut || DEFAULT_SUMMARY
  const profile = readJson(profilePath)
  const textbookRows = buildRows(profile, 'student_textbook', profile.series)
  const companionRows = buildRows(profile, 'student_companion', profile.companions || [])
  const rows = [...textbookRows, ...companionRows].sort((a, b) => a.stage.localeCompare(b.stage) || a.subject.localeCompare(b.subject) || a.grade - b.grade || a.volume.localeCompare(b.volume))
  writeJsonLines(outPath, rows)

  const currentRows = textbookRows.filter(row => row.expected_status === 'current_target')
  const scheduledRows = textbookRows.filter(row => row.expected_status === 'scheduled_release')
  const count = filter => currentRows.filter(filter).length
  const summary = {
    schema_version: 1,
    profile_id: profile.profile_id,
    profile_path: profilePath,
    output_path: outPath,
    edition_count: textbookRows.length,
    current_target_count: currentRows.length,
    scheduled_release_count: scheduledRows.length,
    primary_target_count: count(row => row.stage === 'primary'),
    junior_target_count: count(row => row.stage === 'junior'),
    companion_count: companionRows.length,
    scope_decisions: profile.scope_decisions,
    by_stage_subject: Object.fromEntries([...new Set(currentRows.map(row => `${row.stage}/${row.subject}`))].sort().map(key => [key, currentRows.filter(row => `${row.stage}/${row.subject}` === key).length])),
    scheduled_by_stage_subject: Object.fromEntries([...new Set(scheduledRows.map(row => `${row.stage}/${row.subject}`))].sort().map(key => [key, scheduledRows.filter(row => `${row.stage}/${row.subject}` === key).length]))
  }
  writeJson(summaryPath, summary)
  console.log(JSON.stringify(summary, null, 2))
}

main()
