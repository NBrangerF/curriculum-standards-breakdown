#!/usr/bin/env node
import { parseArgs, readJson } from './library_common.js'

const args = parseArgs(process.argv.slice(2))
const inventory = readJson(args.input || 'generated/textbook_library/source_inventory.json')
const lock = readJson(args.lock || 'data/textbooks/catalog/baseline_source_lock.json')
const errors = []
if (inventory.catalog_count !== 148) errors.push(`catalog_count ${inventory.catalog_count} != 148`)
if (lock.source_commit !== '5a80345f2043ba6f8db8d7be9cf3db82725ff1f7') errors.push(`unexpected source commit ${lock.source_commit}`)
if (inventory.rows.some(row => row.match_status === 'ambiguous_source')) errors.push('ambiguous source matches exist')
for (const row of lock.rows) {
  if (row.source_kind === 'direct_pdf' && (!row.repository_path || !row.git_object)) errors.push(`direct source lock incomplete: ${row.edition_id}`)
  if (row.source_kind === 'fragment_group' && (!row.fragments.length || row.fragments.some((item, index) => item.fragment_number !== index + 1))) errors.push(`fragment source lock incomplete: ${row.edition_id}`)
}
const report = { valid: errors.length === 0, catalog_count: inventory.catalog_count, locked_source_count: lock.locked_source_count, totals: inventory.totals, errors }
console.log(JSON.stringify(report, null, 2))
if (!report.valid || args.strict && errors.length) process.exit(1)
