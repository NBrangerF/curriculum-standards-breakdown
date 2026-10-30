#!/usr/bin/env node
// Contact sheets for checking 学段目标 items against the 2025 revision PDF by eye (like check_sheet.mjs for standards).
// Usage: node scripts/v2/check_goals_sheet.mjs <slug> [per-sheet=10]
// Crops the scan lines around every revised or doubtful item and every item with a suspicious character
// (Latin letters, stray marks, 白 before 信/觉/豪/理/尊…, a comma inside a list of terms), unless the text is listed
// as checked in docs/data/v2/goals/<slug>.tsv (`checked <text>`). Writes generated/v2/check/<slug>-goals-N.png.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { readTsv, strip } from './lib.mjs'

const [slug, perSheetArg] = process.argv.slice(2)
const perSheet = +(perSheetArg || 10)
const goals = JSON.parse(readFileSync(`generated/v2/goals/${slug}.json`, 'utf8'))
const ocr = JSON.parse(readFileSync(`generated/sources/ocr/2025r/${slug}.ocr.json`, 'utf8')).pages
const pdf = `raw/sources/2025r/${readdirSync('raw/sources/2025r').find(f => f.startsWith(`${slug}-`))}`
const checked = readTsv(`docs/data/v2/goals/${slug}.tsv`).filter(r => r[0] === 'checked').map(r => r[1])
const hunksById = new Map()
for (const h of JSON.parse(readFileSync(`generated/revision_diff/${slug}.json`, 'utf8')).hunks) for (const id of h.b?.entry_ids || []) { if (!hunksById.has(id)) hunksById.set(id, []); hunksById.get(id).push(h) }
// Table items have no line-by-line pairing with the 2022 edition; any stretch of their text that the independent
// 2022 scan does not contain is cropped for a look (a revision or an OCR slip).
const text2022 = strip(JSON.parse(readFileSync(`generated/source_catalog/2022/${slug}.json`, 'utf8')).entries.map(e => e.text).join(''))
const missing2022 = text => {
    const t = strip(text)
    const out = []
    let from = -1
    for (let i = 0; i + 4 <= t.length; i += 1) {
        const hit = text2022.includes(t.slice(i, i + 4))
        if (!hit && from < 0) from = i
        if (hit && from >= 0) { out.push(t.slice(Math.max(0, from - 2), i + 5)); from = -1 }
    }
    if (from >= 0) out.push(t.slice(Math.max(0, from - 2)))
    return out
}
const SUSPECT = /[A-Za-z%"［］�•|]|白(?=[信觉豪理尊己然])|[一-鿿]，[一-鿿]{1,3}等/u

const jobs = []
const notes = []
goals.groups.forEach(g => g.items.forEach((it, k) => {
    const code = `${g.stage} ${g.group || ''} ${k + 1}`.replace(/\s+/gu, ' ')
    if (checked.some(c => it.text.includes(c))) return
    const probes = []
    if (['revised', 'ocr_doubt'].includes(it.check.status)) {
        for (const id of it.source_ids) for (const h of hunksById.get(id) || []) probes.push({ text: h.b.text, why: `${it.check.status} ${h.changes.map(c => `${c.del || '∅'}→${c.ins || '∅'}`).join(' ')}` })
    }
    if (it.check.status === 'table') for (const gap of missing2022(it.text)) probes.push({ text: gap, why: '2022 年版扫描中没有这一段' })
    const odd = it.text.replace(/“[^”]*”/gu, '').match(SUSPECT)
    if (odd) { const at = it.text.indexOf(odd[0]); probes.push({ text: it.text.slice(Math.max(0, at - 8), at + 8), why: `可疑「${odd[0]}」` }) }
    const seen = new Set()
    for (const p of probes) {
        const key = strip(p.text)
        if (!key || seen.has(key)) continue
        seen.add(key)
        const windows = new Set()
        for (let i = 0; i + 5 <= key.length; i += 1) windows.add(key.slice(i, i + 5))
        let best = null
        for (const page of it.pages) {
            const lines = ocr.find(x => x.page === page)?.lines || []
            const hits = lines.filter(l => { const t = strip(l.t); for (let i = 0; i + 5 <= t.length; i += 1) if (windows.has(t.slice(i, i + 5))) return true; return false })
            if (hits.length && (!best || hits.length > best.hits.length)) best = { page, hits }
        }
        if (!best) { notes.push(`${code}: no scan line for 「${p.text.slice(0, 20)}」`); continue }
        const h = Math.max(...best.hits.map(l => l.h))
        const top = Math.min(...best.hits.map(l => l.y)) - h * 0.8
        const bottom = Math.min(Math.max(...best.hits.map(l => l.y + l.h)) + h * 0.8, top + 0.16)
        jobs.push({ line: `${pdf}\t${best.page}\t${top.toFixed(4)}\t${bottom.toFixed(4)}\t#${jobs.length + 1} ${code} p${best.page} ${p.why}`.slice(0, 400), n: jobs.length + 1, code, p, text: it.text })
    }
}))
mkdirSync('generated/v2/check', { recursive: true })
for (let i = 0; i * perSheet < jobs.length; i += 1) {
    const chunk = jobs.slice(i * perSheet, (i + 1) * perSheet)
    const out = `generated/v2/check/${slug}-goals-${i + 1}.png`
    execFileSync('generated/sources/.tools/render_sheet', [out], { input: chunk.map(j => j.line).join('\n') })
    console.log(`\n=== ${out}`)
    for (const j of chunk) console.log(`#${j.n} ${j.code} ${j.p.why}\n    OCR: ${j.p.text}`)
}
if (notes.length) console.log(`\n${notes.join('\n')}`)
console.log(`\n${jobs.length} crops`)
