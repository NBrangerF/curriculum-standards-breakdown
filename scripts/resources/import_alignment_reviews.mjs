// 教研员审校: reads a filled-in 审校表 (the CSV a book's 课标对应表 page downloads, opened and saved in Excel or WPS)
// into data/textbooks/smartedu/alignment_reviews.json. build_national_lessons.mjs then drops what the reviewer marked
// 错, moves what they marked 改为 to the 要点 they named, adds what they wrote in 补充, and shows the rest as
// 「教研员已核验」.
//   node scripts/resources/import_alignment_reviews.mjs <审校表.csv> --reviewer 张老师 [--dry-run]
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'data/textbooks/smartedu/alignment_reviews.json')
const arg = name => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null }
const file = process.argv[2]
const reviewer = arg('--reviewer')
if (!file || !reviewer) {
    console.error('用法：node scripts/resources/import_alignment_reviews.mjs <审校表.csv> --reviewer 姓名')
    process.exit(1)
}

// RFC 4180 CSV, as Excel and WPS save it (UTF-8, with or without BOM)
function parseCsv(text) {
    const rows = []
    let row = []
    let field = ''
    let quoted = false
    const source = text.replace(/^﻿/u, '')
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index]
        if (quoted) {
            if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1 }
            else if (char === '"') quoted = false
            else field += char
        } else if (char === '"') quoted = true
        else if (char === ',') { row.push(field); field = '' }
        else if (char === '\n' || char === '\r') {
            if (char === '\r' && source[index + 1] === '\n') index += 1
            row.push(field)
            if (row.some(value => value.trim())) rows.push(row)
            row = []
            field = ''
        } else field += char
    }
    row.push(field)
    if (row.some(value => value.trim())) rows.push(row)
    return rows
}

const codes = new Set()
for (const name of readdirSync(path.join(ROOT, 'data/v2/by_subject')).filter(item => item.endsWith('.json'))) {
    for (const standard of JSON.parse(readFileSync(path.join(ROOT, 'data/v2/by_subject', name), 'utf8')).standards) {
        for (const item of standard.indicators || []) codes.add(item.code)
    }
}

const rows = parseCsv(readFileSync(path.resolve(file), 'utf8'))
const header = rows[0].map(value => value.trim())
const col = name => header.indexOf(name)
for (const name of ['教材编号', '课编号', '要点编码', '审校结论']) if (col(name) < 0) throw new Error(`审校表缺少「${name}」列。请用课标对应表页面下载的审校表。`)
const reviews = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { note: '教研员审校结论：ok = 对，wrong = 错（删去），change = 改为 to 所指的要点，add = 补充的要点。', editions: {} }
const date = new Date().toISOString().slice(0, 10)
const counts = { ok: 0, wrong: 0, change: 0, add: 0, skipped: 0 }
const problems = []
for (const [index, row] of rows.slice(1).entries()) {
    const value = name => String(row[col(name)] ?? '').trim()
    const edition = value('教材编号')
    const lesson = value('课编号')
    const point = value('要点编码').toUpperCase()
    const verdict = value('审校结论')
    const target = col('改为或补充的要点') >= 0 ? value('改为或补充的要点').toUpperCase() : ''
    const note = col('备注') >= 0 ? value('备注') : ''
    if (!verdict && !target) { counts.skipped += 1; continue }
    if (!/^(ed|pf)_[a-z0-9]+$/u.test(edition) || !lesson) { problems.push(`第 ${index + 2} 行：教材编号或课编号不对`); continue }
    const kind = /^(对|正确|√|✓|ok)$/iu.test(verdict) ? 'ok' : /^(错|错误|×|✗|删)/u.test(verdict) ? 'wrong' : /^改/u.test(verdict) ? 'change' : /^(补|漏|加)/u.test(verdict) || (!point && target) ? 'add' : null
    if (!kind) { problems.push(`第 ${index + 2} 行：看不懂审校结论「${verdict}」，请写 对、错、改为 或 补充`); continue }
    if ((kind === 'change' || kind === 'add') && !codes.has(target)) { problems.push(`第 ${index + 2} 行：「改为或补充的要点」${target || '（空）'} 不是要点编码`); continue }
    if ((kind === 'ok' || kind === 'wrong' || kind === 'change') && !codes.has(point)) { problems.push(`第 ${index + 2} 行：要点编码 ${point} 不对`); continue }
    const lessons = ((reviews.editions[edition] ??= { lessons: {} }).lessons[lesson] ??= {})
    lessons[kind === 'add' ? target : point] = { verdict: kind, ...(kind === 'change' ? { to: target } : {}), reviewer, date, ...(note ? { note } : {}) }
    counts[kind] += 1
}
console.log(`审校：对 ${counts.ok}，错 ${counts.wrong}，改 ${counts.change}，补充 ${counts.add}；未填 ${counts.skipped} 行`)
for (const problem of problems) console.log(`  ! ${problem}`)
if (!process.argv.includes('--dry-run')) writeFileSync(OUT, `${JSON.stringify(reviews, null, 1)}\n`)
