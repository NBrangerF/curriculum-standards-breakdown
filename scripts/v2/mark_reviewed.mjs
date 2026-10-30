#!/usr/bin/env node
// After looking at the check sheets: record every still-flagged sentence of a subject as checked against the PDF.
// Usage: node scripts/v2/mark_reviewed.mjs <slug> "<note>" [--except CODE ...]
// Appends "sentence \t note" lines to docs/data/v2/reviewed/<slug>.tsv. Fix wrong text in docs/data/v2/ocr-fixes/
// and rebuild first; only run this for what the sheets showed to be right.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { readTsv } from './lib.mjs'
const [slug, note, ...rest] = process.argv.slice(2)
const except = new Set(rest.filter(a => a !== '--except'))
const file = `docs/data/v2/reviewed/${slug}.tsv`
if (!existsSync(file)) writeFileSync(file, '# 修订改动和疑似识别差异，已对照修订版 PDF（check_sheet 截图）。句子原文\t结论\n')
const reviewed = readTsv(file).map(([t]) => t)
const units = JSON.parse(readFileSync(`generated/v2/units/${slug}.json`, 'utf8'))
const SUSPECT = /[A-Za-z%"”［］�•]/u
const FORMULA = /pH|DNA|\d+%|y=k\/x|y=kx\+b|y=kx|sinA|cosA|tanA|k[≠＞＜]0|“[^”]*”/gu
let n = 0
for (const s of units.standards) {
    const all = [
        ...(s.statement_source === 'official' ? [{ code: s.code, text: s.statement, check: s.statement_check }] : []),
        ...s.indicators.map(i => ({ code: i.code, text: i.text, check: i.check })),
        ...(s.requirements || []).map(q => ({ code: s.code, text: q.text, check: q.check }))
    ]
    for (const it of all) {
        if (except.has(it.code) || reviewed.some(r => it.text.includes(r))) continue
        if ((it.check && it.check.status !== 'verified') || SUSPECT.test(it.text.replace(FORMULA, ''))) { appendFileSync(file, `${it.text}\t${note}\n`); reviewed.push(it.text); n += 1 }
    }
}
console.log(`${slug}: ${n} sentences recorded as checked`)
