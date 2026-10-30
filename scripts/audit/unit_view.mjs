#!/usr/bin/env node
// Review by unit: for each stage × official topic, the official target-layer text next to the standards filed there.
// Usage: node scripts/audit/unit_view.mjs <slug> [stage-filter]
import { readFileSync } from 'node:fs'
const [slug, stageFilter] = process.argv.slice(2)
const audit = JSON.parse(readFileSync(`generated/audit/${slug}.json`, 'utf8'))
const cat = JSON.parse(readFileSync(`generated/source_catalog/2025r/${slug}.json`, 'utf8')).entries
const TARGET = { labor: ['内容要求', '素养表现'], morality_law: ['内容要求', '学业要求'], it: ['学业要求'], pe: ['学业要求'], arts: ['学业要求'], math: ['学业要求'], science: ['内容要求', '学业要求'], english: ['内容要求'], chinese: ['识字与写字', '阅读与鉴赏', '表达与交流', '梳理与探究'] }[slug]
const name = t => String(t || '').replace(/^(任务群|学习任务)\s*\d+[：:]/u, '').replace(/\s/gu, '')
const stageKey = r => (r.grade_band.startsWith('H4') ? '7-9' : r.grade_range)
const units = new Map()
for (const e of cat) {
    if (!TARGET.includes(e.section) || !e.stage) continue
    const topic = name((e.topic || []).slice(-1)[0] || e.section)
    const key = `${e.stage}｜${topic}`
    if (!units.has(key)) units.set(key, { official: [], standards: [] })
    units.get(key).official.push(`[${e.section}] ${e.text}`)
}
for (const r of audit.rows) {
    const anchorTopic = r.anchors[0] ? name((r.anchors[0].topic || []).slice(-1)[0] || r.anchors[0].section) : null
    const own = name(r.subdomain)
    const st = stageKey(r)
    let key = [...units.keys()].find(k => k === `${st}｜${own}`) || (anchorTopic && [...units.keys()].find(k => k === `${r.anchors[0].stage}｜${anchorTopic}`)) || `${st}｜(未归入官方单元) ${own}`
    if (!units.has(key)) units.set(key, { official: [], standards: [] })
    units.get(key).standards.push(r)
}
const verdicts = new Map(JSON.parse(readFileSync('generated/audit/verdicts_provisional.json', 'utf8'))[slug].map(v => [v.code, v]))
for (const [key, u] of [...units].sort()) {
    if (stageFilter && !key.startsWith(stageFilter)) continue
    console.log(`\n■ ${key}`)
    for (const o of u.official) console.log(`  官: ${o.replace(/\s/gu, '')}`)
    const seen = new Set()
    for (const r of u.standards) {
        const t = r.standard.replace(/\s/gu, '')
        const dup = seen.has(t.slice(0, 40)); seen.add(t.slice(0, 40))
        console.log(`  ${r.code} (${verdicts.get(r.code).primary})${dup ? ' ≈同上' : ': ' + t.slice(0, 150)}`)
    }
}
