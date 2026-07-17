#!/usr/bin/env node
import { parseArgs, readJson, readJsonLines } from './library_common.js'

const EXPECTED = { primary: 83, junior: 57, current: 140, editions: 144, scheduled: 4, companions: 4 }

function main() {
  const args = parseArgs(process.argv.slice(2))
  const profile = readJson(args.profile || 'data/textbooks/catalog/baseline_profile.json')
  const rows = readJsonLines(args.input || 'data/textbooks/catalog/expected_editions.jsonl')
  const textbooks = rows.filter(row => row.resource_type === 'student_textbook')
  const currentTargets = textbooks.filter(row => row.expected_status === 'current_target')
  const scheduledTargets = textbooks.filter(row => row.expected_status === 'scheduled_release')
  const companions = rows.filter(row => row.resource_type === 'student_companion')
  const errors = []
  const warnings = []
  const primary = currentTargets.filter(row => row.stage === 'primary')
  const junior = currentTargets.filter(row => row.stage === 'junior')
  if (primary.length !== EXPECTED.primary) errors.push(`primary target count ${primary.length} != ${EXPECTED.primary}`)
  if (junior.length !== EXPECTED.junior) errors.push(`junior target count ${junior.length} != ${EXPECTED.junior}`)
  if (currentTargets.length !== EXPECTED.current) errors.push(`current target count ${currentTargets.length} != ${EXPECTED.current}`)
  if (textbooks.length !== EXPECTED.editions) errors.push(`edition count ${textbooks.length} != ${EXPECTED.editions}`)
  if (scheduledTargets.length !== EXPECTED.scheduled) errors.push(`scheduled target count ${scheduledTargets.length} != ${EXPECTED.scheduled}`)
  if (companions.length !== EXPECTED.companions) errors.push(`companion count ${companions.length} != ${EXPECTED.companions}`)

  const ids = new Set()
  const slots = new Set()
  for (const row of rows) {
    if (ids.has(row.edition_id)) errors.push(`duplicate edition_id ${row.edition_id}`)
    ids.add(row.edition_id)
    const slot = `${row.resource_type}|${row.stage}|${row.subject}|${row.grade}|${row.volume}`
    if (slots.has(slot)) errors.push(`duplicate active slot ${slot}`)
    slots.add(slot)
    if (row.selection_class === 'national_unified' && !['语文', '道德与法治', '历史'].includes(row.subject)) errors.push(`invalid national_unified subject ${row.subject}`)
    if (row.curriculum_revision !== '2022') errors.push(`unexpected curriculum revision for ${row.edition_id}`)
    if (!['current_target', 'scheduled_release'].includes(row.expected_status)) errors.push(`unexpected target status for ${row.edition_id}: ${row.expected_status}`)
  }

  const scheduledSlots = scheduledTargets.map(row => `${row.stage}/${row.subject}/${row.grade}/${row.volume}`).sort()
  const expectedScheduledSlots = ['junior/英语/9/下册', 'primary/体育与健康/4/全一册', 'primary/体育与健康/5/全一册', 'primary/体育与健康/6/全一册'].sort()
  if (JSON.stringify(scheduledSlots) !== JSON.stringify(expectedScheduledSlots)) errors.push(`unexpected scheduled slots: ${scheduledSlots.join(', ')}`)
  for (const row of scheduledTargets) {
    if (row.availability_status !== 'not_released_as_of_2026-07-17') errors.push(`scheduled slot missing release evidence status: ${row.edition_id}`)
  }

  const scopeById = new Map((profile.scope_decisions || []).map(item => [item.scope_id, item]))
  for (const id of ['information_technology', 'labor', 'comprehensive_practice']) {
    if (!scopeById.has(id)) errors.push(`missing scope decision ${id}`)
  }
  for (const item of profile.scope_decisions || []) {
    if (item.status === 'decision_required') warnings.push(`${item.subject}: decision_required`)
  }

  const report = {
    valid: errors.length === 0,
    counts: { primary: primary.length, junior: junior.length, current: currentTargets.length, editions: textbooks.length, scheduled: scheduledTargets.length, companions: companions.length },
    scope_decision_coverage: {
      total: 3,
      recorded: scopeById.size,
      resolved: [...scopeById.values()].filter(item => ['selected', 'deferred_with_reason', 'non_textbook_course'].includes(item.status)).length,
      statuses: Object.fromEntries([...scopeById].map(([id, item]) => [id, item.status]))
    },
    warnings,
    errors
  }
  console.log(JSON.stringify(report, null, 2))
  if (!report.valid || args.strict && errors.length) process.exit(1)
}

main()
