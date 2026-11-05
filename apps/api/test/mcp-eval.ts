// How well the MCP tools answer the way teachers ask. Not part of `npm test`: run it before and after changing the tools.
//   npx tsx test/mcp-eval.ts            in-process, on this checkout's code and public/data
//   npx tsx test/mcp-eval.ts --live     against https://www.kebiao.org/mcp
// It samples real lessons (fixed seed), asks for each one in four ways, and checks the right lesson comes back;
// then searches the lesson's title and checks a standard it 主要在教 is in the top 5.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { FileCurriculumRepository } from '@curriculum/core'
import { createApp } from '../src/app.js'
import { normTitle } from '../src/ai-tools.js'

const live = process.argv.includes('--live')
const data = resolve(process.cwd(), '../../public/data')
const app = live ? null : createApp(new FileCurriculumRepository(data))
const CN = '一二三四五六七八九'
let id = 0

async function call(name: string, args: Record<string, unknown>) {
    const init = { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'user-agent': 'kebiao-mcp-eval/1.0', 'x-forwarded-for': '198.51.100.250' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } }) }
    const started = Date.now()
    const res = live ? await fetch('https://www.kebiao.org/mcp', init) : await app!.request('/mcp', init)
    const out = await res.json() as any
    return { data: out.result?.structuredContent || {}, ms: Date.now() - started }
}

// a small seeded generator, so every run asks the same lessons
let seed = 7
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
const pick = <T>(rows: T[], n: number) => {
    const copy = [...rows]
    const out: T[] = []
    while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0])
    return out
}

const alignment = JSON.parse(await readFile(resolve(data, 'v2/lesson_alignment.json'), 'utf8'))
const chapters = JSON.parse(await readFile(resolve(data, 'v2/textbook_chapters.json'), 'utf8'))
const books: Record<string, [string, string, number, string]> = { ...chapters.books, ...alignment.platform_books }
const publisher = (name: string) => name.match(/（([^）]*版)）/u)?.[1] || name.match(/^(\S+?版)/u)?.[1] || ''
const groups = new Map<string, any[]>()
for (const row of alignment.lessons) {
    const book = books[row[0]]
    if (!book || !row[6].length || normTitle(row[3]).length < 2 || row[3] === row[2]) continue
    const key = `${book[1]}|${row[0].slice(0, 3)}`
    groups.set(key, [...(groups.get(key) || []), row])
}
const sample = [...groups.keys()].sort().flatMap(key => pick(groups.get(key)!, key.endsWith('ed_') ? 3 : 1))

const tally: Record<string, number> = { full_top1: 0, full_in: 0, grade_top1: 0, bare_in: 0, raw_in: 0, search_hit: 0 }
const latency: number[] = []
const misses: string[] = []
for (const [edition, , unit, title, lessonId, , matches] of sample) {
    const book = books[edition]
    const volume = String(book[3]).split('·')[0]
    const plain = title.normalize('NFKC').replace(/^(?:第[一二三四五六七八九十百零\d]+\s*(?:单元|章|节|课)|课题\s*\d+|[一二三四五六七八九十]+\s*[、.．]|\d+(?:\.\d+)*(?:\s+|\s*[.、．]\s*)|[☆★*]+)\s*/u, '').trim()
    const asks = {
        full: `${publisher(book[0])} ${CN[book[2] - 1]}年级${volume} ${plain}`,
        grade: `${CN[book[2] - 1]}年级${volume} ${plain}`,
        bare: plain,
        raw: title
    }
    for (const [kind, query] of Object.entries(asks)) {
        const { data: out, ms } = await call('find_textbook_chapter', { query })
        latency.push(ms)
        const ids = (out.lessons || []).map((item: any) => String(item.url).split('#lesson-')[1])
        const top1 = ids[0] === lessonId
        const found = ids.includes(lessonId)
        if (kind === 'full') { tally.full_top1 += Number(top1); tally.full_in += Number(found) }
        if (kind === 'grade') tally.grade_top1 += Number(top1)
        if (kind === 'bare') tally.bare_in += Number(found)
        if (kind === 'raw') tally.raw_in += Number(found)
        if (kind === 'full' && !top1) misses.push(`${book[0]} · ${unit} · ${title}  ← 「${query}」`)
    }
    const want = new Set(matches.filter((m: any) => m[1] === 'T').map((m: any) => m[0].replace(/\.\d+$/u, '')))
    const { data: found, ms } = await call('search_standards', { query: plain, subject: ['art', 'music'].includes(book[1]) ? 'arts' : book[1], stage: `${book[2]}年级`, limit: 5 })
    latency.push(ms)
    tally.search_hit += Number((found.results || []).some((r: any) => want.has(r.code)))
}
const n = sample.length
const pct = (k: string) => `${tally[k]}/${n} (${Math.round(100 * tally[k] / n)}%)`
latency.sort((a, b) => a - b)
console.log(JSON.stringify({
    target: live ? 'https://www.kebiao.org/mcp' : 'this checkout',
    lessons: n,
    '版本+年级册次+课题 → 第一条就是这一课': pct('full_top1'),
    '版本+年级册次+课题 → 结果里有这一课': pct('full_in'),
    '年级册次+课题 → 第一条就是这一课': pct('grade_top1'),
    '只写课题 → 结果里有这一课': pct('bare_in'),
    '教材原标题（带编号）→ 结果里有这一课': pct('raw_in'),
    'search_standards 前 5 条含这一课主要在教的标准': pct('search_hit'),
    latency_ms: { p50: latency[Math.floor(latency.length / 2)], p95: latency[Math.floor(latency.length * 0.95)] }
}, null, 1))
if (misses.length) console.log(`\n第一条不是这一课（版本+年级册次+课题）：\n${misses.map(m => `- ${m}`).join('\n')}`)
