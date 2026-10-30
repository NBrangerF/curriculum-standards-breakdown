#!/usr/bin/env node
// Focus sheet for manual review: every standard with a non-keep provisional verdict, plus ~10% of keeps.
// Usage: node scripts/audit/review_focus.mjs <slug> [from] [to]   (row range for reading in parts)
import { readFileSync } from 'node:fs'
const [slug, from = 0, to = 1e9] = process.argv.slice(2)
const audit = JSON.parse(readFileSync(`generated/audit/${slug}.json`, 'utf8'))
const verdicts = new Map(JSON.parse(readFileSync('generated/audit/verdicts_provisional.json', 'utf8'))[slug].map(v => [v.code, v]))
const cut = (s, n) => (s || '').replace(/\s+/gu, '').slice(0, n)
const sample = code => [...code].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 10 === 0
let i = 0
const seenText = new Map()
for (const r of audit.rows) {
    const v = verdicts.get(r.code)
    if (v.primary === 'keep' && !sample(r.code)) continue
    i += 1
    if (i < +from || i > +to) continue
    const sameAs = r.progression_group_id && seenText.get(r.progression_group_id + cut(r.standard, 60))
    seenText.set((r.progression_group_id || '') + cut(r.standard, 60), r.code)
    const anc = r.anchors[0]
    console.log(`${i}. ${r.code} ${r.grade_range} ${r.domain}/${cut(r.subdomain, 12)} → ${v.primary}${v.verdicts.length > 1 ? '+' + v.verdicts.filter(x => x !== v.primary).join('+') : ''} (m=${v.best_match})`)
    console.log(sameAs ? `   S: ≈${sameAs}` : `   S: ${cut(r.standard, 110)}`)
    if (anc && !sameAs) console.log(`   A: ${anc.stage}/${anc.section}/${cut((anc.topic || []).slice(-1)[0], 10)} p${anc.page}: ${cut(anc.text, 80)}`)
}
