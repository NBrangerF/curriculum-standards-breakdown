#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { writeJsonLine } from './lib/canonical.mjs'

const args = { input: '', output: '', perSource: 6, source: '' }
for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index] === '--input') args.input = resolve(process.argv[++index])
  else if (process.argv[index] === '--output') args.output = resolve(process.argv[++index])
  else if (process.argv[index] === '--per-source') args.perSource = Math.max(1, Number(process.argv[++index]))
  else if (process.argv[index] === '--source') args.source = String(process.argv[++index] || '').trim()
}
if (!args.input || !args.output) throw new Error('--input and --output are required')
const rows = (await readFile(args.input, 'utf8')).split(/\r?\n/gu).filter(Boolean).map(line => JSON.parse(line))
const counts = new Map()
const selected = rows.filter(row => {
  if (args.source && row.source_id !== args.source) return false
  const count = counts.get(row.source_id) || 0
  if (count >= args.perSource) return false
  counts.set(row.source_id, count + 1)
  return true
})
await writeFile(args.output, selected.map(writeJsonLine).join(''), 'utf8')
console.log(JSON.stringify({ input_rows: rows.length, selected_rows: selected.length, by_source: Object.fromEntries(counts) }, null, 2))
