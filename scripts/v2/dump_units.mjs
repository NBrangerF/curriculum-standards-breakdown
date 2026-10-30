#!/usr/bin/env node
// Print a subject's built units for review: node scripts/v2/dump_units.mjs <slug> [width]
import { readFileSync } from 'node:fs'
const [slug, width = 160] = process.argv.slice(2)
const u = JSON.parse(readFileSync(`generated/v2/units/${slug}.json`, 'utf8'))
for (const s of u.standards) {
    console.log(`\n## ${s.code} ${s.title} · ${s.level1}${s.theme ? ' · ' + s.theme : ''}  [${s.statement_source}] ${s.statement.slice(0, 90)}`)
    for (const i of s.indicators) console.log(`  ${i.code.split('.')[1]} ${i.check.status[0]}${i.grades ? ' g' + i.grades.join('') : ''} p${i.pages.join(',')} ${i.label ? '〔' + i.label + '〕' : ''}${i.text.slice(0, +width)}`)
    if (s.requirements) console.log(`  REQ ${s.requirements.length}: ${s.requirements.map(r => r.text.slice(0, 40)).join(' / ')}`)
}
