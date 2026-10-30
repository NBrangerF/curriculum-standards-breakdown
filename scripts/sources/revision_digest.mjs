#!/usr/bin/env node
// Readable digest of real revision changes in the chapters that hold requirements (课程目标, 课程内容, 学业质量).
// Usage: node scripts/sources/revision_digest.mjs <slug>
import { readFileSync } from 'node:fs'
const slug = process.argv[2]
const d = JSON.parse(readFileSync(`generated/revision_diff/${slug}.json`, 'utf8'))
const cut = (s, n) => (s || '').slice(0, n)
let n = 0
for (const h of d.hunks) {
    if (h.ocr_suspect) continue
    const loc = h.b || h.a
    if (!['课程目标', '课程内容', '学业质量', '课程性质', '课程理念', '核心素养'].includes(loc.part)) continue
    const changes = h.changes.filter(c => (c.del + c.ins).replace(/[0-9\-（）()、，。；：|]/gu, '').length >= 2)
    if (!changes.length) continue
    n += 1
    console.log(`${n}. p${h.a?.page ?? '-'}→${h.b?.page ?? '-'} ${loc.part}/${loc.stage ?? ''}/${loc.section ?? ''}/${(loc.topic || []).slice(-1)[0] ?? ''}: ${changes.slice(0, 4).map(c => `[${cut(c.del, 40)}→${cut(c.ins, 70)}]`).join(' ')}`)
}
