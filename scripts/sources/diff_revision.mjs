#!/usr/bin/env node
// What changed between the 2022 standards and the 2025 revision (2022年版2025年修订).
// Usage: node scripts/sources/diff_revision.mjs [--subjects a,b]
// Reads generated/source_catalog/{2022,2025r}/<slug>.json, writes generated/revision_diff/<slug>.json.
//
// Both editions are cut into clauses (at ，。；：), so page breaks and different sentence splits do not
// matter, and the two clause sequences are aligned with a Myers diff. Each changed stretch becomes a
// hunk with page, chapter, stage and section on both sides, plus a character-level change list.
// One-character swaps (楷→槽, 自→白) are usually OCR misreadings and are marked ocr_suspect.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = { subjects: [] }
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 1) if (argv[i] === '--subjects') args.subjects = argv[++i].split(',').filter(Boolean)
const OUT = 'generated/revision_diff'
mkdirSync(OUT, { recursive: true })

const norm = text => text.replace(/[\s　]/gu, '').replace(/[“”"‘’'《》〈〉【】]/gu, '').replace(/[…⋯•·.]{2,}/gu, '').replace(/[（(]/gu, '（').replace(/[）)]/gu, '）').replace(/[～~〜—–-]/gu, '-')

// Clause units with a pointer back to their catalogue entry.
function units(entries) {
    const out = []
    for (const e of entries) {
        if (!e.part) continue // cover, contents and preface
        for (const piece of norm(e.text).split(/(?<=[，。；：！？])/u)) {
            const key = piece.replace(/[，。；：！？、]/gu, '')
            if (key.length >= 2) out.push({ key, text: piece, e })
        }
    }
    return out
}

// Myers O(ND) diff on two arrays of keys; returns ops [{op: '=', a, b} | {op: '-', a} | {op: '+', b}].
function myers(a, b) {
    const n = a.length, m = b.length, max = n + m
    const offset = max + 1
    let v = new Int32Array(2 * max + 3)
    const trace = []
    outer: for (let d = 0; d <= max; d += 1) {
        trace.push(v.slice())
        for (let k = -d; k <= d; k += 2) {
            let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1
            let y = x - k
            while (x < n && y < m && a[x] === b[y]) { x += 1; y += 1 }
            v[offset + k] = x
            if (x >= n && y >= m) { trace.push(v.slice()); break outer }
        }
    }
    const ops = []
    let x = n, y = m
    for (let d = trace.length - 2; d >= 0 && (x > 0 || y > 0); d -= 1) {
        const vv = trace[d]
        const k = x - y
        const prevK = k === -d || (k !== d && vv[offset + k - 1] < vv[offset + k + 1]) ? k + 1 : k - 1
        const prevX = vv[offset + prevK], prevY = prevX - prevK
        while (x > prevX && y > prevY) { ops.push({ op: '=', a: x - 1, b: y - 1 }); x -= 1; y -= 1 }
        if (d > 0) { if (x === prevX) ops.push({ op: '+', b: y - 1 }); else ops.push({ op: '-', a: x - 1 }) }
        x = prevX; y = prevY
    }
    while (x > 0 && y > 0) { ops.push({ op: '=', a: x - 1, b: y - 1 }); x -= 1; y -= 1 }
    return ops.reverse()
}

// Character-level change list between two short strings (LCS).
function changes(a, b) {
    const x = [...a], y = [...b]
    if (x.length * y.length > 4e6) return [{ del: a, ins: b }]
    const dp = Array.from({ length: x.length + 1 }, () => new Uint16Array(y.length + 1))
    for (let i = x.length - 1; i >= 0; i -= 1) for (let j = y.length - 1; j >= 0; j -= 1) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    const out = []
    let i = 0, j = 0, del = '', ins = ''
    const push = () => { if (del || ins) out.push({ del, ins }); del = ''; ins = '' }
    while (i < x.length && j < y.length) {
        if (x[i] === y[j]) { push(); i += 1; j += 1 } else if (dp[i + 1][j] >= dp[i][j + 1]) del += x[i++]; else ins += y[j++]
    }
    del += x.slice(i).join(''); ins += y.slice(j).join(''); push()
    return out
}

const place = list => {
    if (!list.length) return null
    const e = list[0].e
    return { page: e.page, pages: [...new Set(list.map(u => u.e.page))], part: e.part, stage: e.stage, section: e.section, topic: e.topic, entry_ids: [...new Set(list.map(u => u.e.id))], text: list.map(u => u.text).join('') }
}
const punct = s => s.replace(/[，。；：！？、]/gu, '')

const slugs = ['chinese', 'math', 'english', 'morality_law', 'history', 'geography', 'science', 'physics', 'chemistry', 'biology', 'it', 'pe', 'arts', 'labor']
    .filter(slug => !args.subjects.length || args.subjects.includes(slug))
const table = []
for (const slug of slugs) {
    const fa = `generated/source_catalog/2022/${slug}.json`, fb = `generated/source_catalog/2025r/${slug}.json`
    if (!existsSync(fa) || !existsSync(fb)) { console.log(`${slug}: catalogue missing`); continue }
    const A = units(JSON.parse(readFileSync(fa, 'utf8')).entries)
    const B = units(JSON.parse(readFileSync(fb, 'utf8')).entries)
    const ops = myers(A.map(u => u.key), B.map(u => u.key))
    // Group consecutive non-equal ops into hunks.
    const hunks = []
    let cur = null
    const close = () => {
        if (!cur) return
        const a = cur.a.map(i => A[i]), b = cur.b.map(j => B[j])
        const at = a.map(u => u.text).join(''), bt = b.map(u => u.text).join('')
        const list = changes(punct(at), punct(bt)).filter(c => c.del || c.ins)
        if (list.length) {
            const ocrSuspect = list.every(c => [...c.del].length <= 1 && [...c.ins].length <= 1)
            hunks.push({ type: !a.length ? 'insert' : !b.length ? 'delete' : 'replace', ocr_suspect: ocrSuspect, a: place(a), b: place(b), changes: list })
        }
        cur = null
    }
    for (const op of ops) {
        if (op.op === '=') { close(); continue }
        cur ||= { a: [], b: [] }
        if (op.op === '-') cur.a.push(op.a); else cur.b.push(op.b)
    }
    close()
    const real = hunks.filter(h => !h.ocr_suspect)
    const where = h => (h.b || h.a).part || '?'
    const byPart = {}
    for (const h of real) byPart[where(h)] = (byPart[where(h)] || 0) + 1
    writeFileSync(join(OUT, `${slug}.json`), JSON.stringify({ subject_slug: slug, units_2022: A.length, units_2025r: B.length, hunks_total: hunks.length, hunks_real: real.length, by_part: byPart, hunks }))
    table.push({ slug, units_2022: A.length, units_2025r: B.length, hunks: hunks.length, ocr_suspect: hunks.length - real.length, real: real.length, 课程内容: byPart['课程内容'] || 0, 课程目标: byPart['课程目标'] || 0, 学业质量: byPart['学业质量'] || 0, 课程实施: byPart['课程实施'] || 0, 其他: real.length - (byPart['课程内容'] || 0) - (byPart['课程目标'] || 0) - (byPart['学业质量'] || 0) - (byPart['课程实施'] || 0) })
}
console.table(table)
