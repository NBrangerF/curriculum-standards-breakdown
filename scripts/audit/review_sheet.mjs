#!/usr/bin/env node
// Compact per-subject sheet for reading every standard next to its best official anchor.
// Usage: node scripts/audit/review_sheet.mjs <slug>  →  generated/review/<slug>.txt
import { readFileSync, writeFileSync } from 'node:fs'
const slug = process.argv[2]
const a = JSON.parse(readFileSync(`generated/audit/${slug}.json`, 'utf8'))
const cut = (s, n) => (s || '').replace(/\s+/gu, '').slice(0, n)
const lines = []
let group = null
for (const r of a.rows) {
    if (r.progression_group_id && r.progression_group_id === group) lines.push('  ~')
    group = r.progression_group_id
    const anc = r.anchors[0]
    const flags = r.flags.filter(f => !['triplet_near_identical'].includes(f)).join(',')
    lines.push(`${r.code} ${r.grade_range} [${r.domain}/${r.subdomain}] cov=${r.coverage}${r.flags.includes('triplet_near_identical') ? ' ≈' : ''} ${flags ? '{' + flags + '}' : ''}`)
    lines.push(`  S: ${cut(r.standard, 200)}`)
    if (anc) lines.push(`  A: p${anc.page} ${anc.stage} ${anc.section}/${(anc.topic || []).slice(-1)[0] || ''}: ${cut(anc.text, 140)}${r.anchors.length > 1 ? ` (+${r.anchors.length - 1})` : ''}`)
    if (r.quantities?.length) lines.push(`  Q: ${r.quantities.join(' ')}`)
    if (r.revision_changes?.length) lines.push(`  R: ${r.revision_changes.map(h => h.changes.map(c => `[${cut(c.del, 20)}→${cut(c.ins, 30)}]`).join('')).join(' ')}`)
}
lines.push('', `GAPS (${a.gaps.length} official outcome sentences not covered at recall ≥0.5):`)
for (const g of a.gaps) lines.push(`  p${g.page} ${g.stage} ${(g.topic || []).join('/')} best=${g.best} [${g.closest}]: ${cut(g.text, 120)}`)
writeFileSync(`generated/review/${slug}.txt`, lines.join('\n') + '\n')
console.log(slug, lines.length, 'lines')
