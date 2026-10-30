#!/usr/bin/env node
// Contact sheets for checking doubtful sentences against the 2025 revision PDF by eye.
// Usage: node scripts/v2/check_sheet.mjs <slug> [per-sheet=10]
// Picks every statement, 要点 and 学业要求 whose text is revised or in OCR doubt (and not yet listed in
// docs/data/v2/reviewed/<slug>.tsv), or that has suspicious characters, crops the scan lines around the
// difference, and writes generated/v2/check/<slug>-sheet-N.png. Prints what each crop should be compared with.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { readTsv, strip } from './lib.mjs'

const [slug, perSheetArg] = process.argv.slice(2)
const perSheet = +(perSheetArg || 10)
const units = JSON.parse(readFileSync(`generated/v2/units/${slug}.json`, 'utf8'))
const ocr = JSON.parse(readFileSync(`generated/sources/ocr/2025r/${slug}.ocr.json`, 'utf8')).pages
const pdf = `raw/sources/2025r/${readdirSync('raw/sources/2025r').find(f => f.startsWith(`${slug}-`))}`
const reviewed = readTsv(`docs/data/v2/reviewed/${slug}.tsv`).map(([t]) => t)
const hunksById = new Map()
for (const h of JSON.parse(readFileSync(`generated/revision_diff/${slug}.json`, 'utf8')).hunks) for (const id of h.b?.entry_ids || []) { if (!hunksById.has(id)) hunksById.set(id, []); hunksById.get(id).push(h) }
const SUSPECT = /[A-Za-z%"”［］�•]/u
const FORMULA = /pH|DNA|X射线|[HCNOPSKI]、|I等|Na|Al|Si|Cl|Ca|Fe|Cu|Ag|一二•九|\d+%|y=k\/x|y=kx\+b|y=kx|sinA|cosA|tanA|k[≠＞＜]0|“[^”]*”/gu

const items = []
for (const s of units.standards) {
    const all = [
        ...(s.statement_source === 'official' ? [{ code: `${s.code} 标准句`, text: s.statement, pages: s.statement_pages, ids: s.statement_source_ids, check: s.statement_check }] : []),
        ...s.indicators.map(i => ({ code: i.code, text: i.text, pages: i.pages, ids: i.source_ids, check: i.check })),
        ...(s.requirements || []).map((q, n) => ({ code: `${s.code} 学业要求${n + 1}`, text: q.text, pages: q.pages, ids: q.source_ids, check: q.check }))
    ]
    for (const it of all) {
        if (reviewed.some(r => it.text.includes(r))) continue
        const doubtful = it.check && !['verified', 'table'].includes(it.check.status)
        const odd = SUSPECT.test(it.text.replace(FORMULA, ''))
        if (!doubtful && !odd) continue
        const probes = []
        for (const id of it.ids || []) for (const h of hunksById.get(id) || []) probes.push({ text: h.b.text, why: h.changes.map(c => `${c.del || '∅'}→${c.ins || '∅'}`).join(' ') })
        if (odd) { const m = it.text.replace(FORMULA, '').match(SUSPECT); const at = it.text.indexOf(m[0]); probes.push({ text: it.text.slice(Math.max(0, at - 6), at + 6), why: `可疑字符「${m[0]}」` }) }
        items.push({ ...it, probes })
    }
}
// Find the scan lines that hold each probe.
const jobs = []
const notes = []
for (const it of items) {
    const seen = new Set()
    for (const p of it.probes) {
        const key = strip(p.text)
        if (seen.has(key)) continue
        seen.add(key)
        const windows = new Set()
        for (let i = 0; i + 5 <= key.length; i += 1) windows.add(key.slice(i, i + 5))
        let best = null
        for (const page of it.pages) {
            const lines = (ocr.find(x => x.page === page)?.lines || [])
            const hits = lines.filter(l => { const t = strip(l.t); for (let i = 0; i + 5 <= t.length; i += 1) if (windows.has(t.slice(i, i + 5))) return true; return key.length < 5 && t.includes(key) })
            if (hits.length && (!best || hits.length > best.hits.length)) best = { page, hits }
        }
        if (!best) { notes.push(`${it.code}: no scan line found for 「${p.text.slice(0, 20)}」`); continue }
        const h = Math.max(...best.hits.map(l => l.h))
        const top = Math.min(...best.hits.map(l => l.y)) - h * 0.8
        const bottom = Math.min(Math.max(...best.hits.map(l => l.y + l.h)) + h * 0.8, top + 0.16)
        jobs.push({ line: `${pdf}\t${best.page}\t${top.toFixed(4)}\t${bottom.toFixed(4)}\t#${jobs.length + 1} ${it.code} p${best.page} ${p.why}`.slice(0, 400), n: jobs.length + 1, it, p })
    }
}
mkdirSync('generated/v2/check', { recursive: true })
for (let i = 0; i * perSheet < jobs.length; i += 1) {
    const chunk = jobs.slice(i * perSheet, (i + 1) * perSheet)
    const out = `generated/v2/check/${slug}-sheet-${i + 1}.png`
    execFileSync('generated/sources/.tools/render_sheet', [out], { input: chunk.map(j => j.line).join('\n') })
    console.log(`\n=== ${out}`)
    for (const j of chunk) console.log(`#${j.n} ${j.it.code} [${j.it.check?.status || 'pattern'}] ${j.p.why}\n    OCR: ${j.p.text}`)
}
if (notes.length) console.log('\n' + notes.join('\n'))
console.log(`\n${items.length} items, ${jobs.length} crops`)
