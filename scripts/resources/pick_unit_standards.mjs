// Asks kebiao's own AI pick route (POST /api/v1/lesson-plans/pick on production) which 课标 要点 each textbook unit
// of the 国家平台 同步课 teaches, so a standard page can list the 同步课 of every unit the AI tied to it, not only
// the units whose pages were aligned by machine. One request per unit, spaced under the 10-a-minute AI limit;
// results are saved after each unit, so a rerun resumes. Writes data/textbooks/smartedu/unit_picks.json.
//   node scripts/resources/pick_unit_standards.mjs [--base https://www.kebiao.org] [--limit N]
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SOURCE = path.join(ROOT, 'data/textbooks/smartedu')
const OUT = path.join(SOURCE, 'unit_picks.json')
const arg = name => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null }
const BASE = arg('--base') || 'https://www.kebiao.org'
const LIMIT = Number(arg('--limit')) || Infinity
const GAP_MS = Number(arg('--gap')) || 1500
const HOUR = /[（(]第[一二三四五六七八九十\d]+课时[）)]\s*$/u

const books = new Map(JSON.parse(readFileSync(path.join(ROOT, 'public/data/textbooks/index.json'), 'utf8')).items.map(item => [item.edition_id, item]))
const v2Slug = slug => (['art', 'music'].includes(slug) ? 'arts' : slug)
const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { source: `${BASE}/api/v1/lesson-plans/pick`, note: 'AI 按单元判断的课标要点（grade 2 = 直接对应，1 = 相关）。机器判断，可能有误。', editions: {} }
const save = () => writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function pick(body) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await fetch(`${BASE}/api/v1/lesson-plans/pick`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        if (response.status === 429) { await sleep(30000); continue }
        const payload = await response.json().catch(() => null)
        if (response.ok && ['ok', 'partial'].includes(payload?.data?.status)) return payload.data
        await sleep(10000)
    }
    return null
}

let done = 0
for (const file of readdirSync(SOURCE).filter(name => name.startsWith('ed_')).sort()) {
    const record = JSON.parse(readFileSync(path.join(SOURCE, file), 'utf8'))
    const book = books.get(record.edition_id)
    if (!book) continue
    const entry = (out.editions[record.edition_id] ??= { textbook_title: record.textbook_title, units: {} })
    const titles = new Map(record.tree.map(node => [node.id, node.title]))
    const units = new Map()
    for (const lesson of record.lessons) {
        const top = lesson.chapter_path[0]
        if (!top) continue
        if (!units.has(top)) units.set(top, [])
        const title = lesson.title.replace(HOUR, '').trim()
        if (!units.get(top).includes(title)) units.get(top).push(title)
    }
    for (const [nodeId, lessonTitles] of units) {
        if (entry.units[nodeId] || done >= LIMIT) continue
        const unitTitle = (titles.get(nodeId) || lessonTitles[0]).slice(0, 60)
        // a flat tree (美术, 音乐) has each lesson as its own top node
        const single = lessonTitles.length === 1 && lessonTitles[0] === unitTitle
        const data = await pick({
            lesson: { title: unitTitle, textbook_title: record.textbook_title.slice(0, 40), subject_slug: v2Slug(book.subject_slug), grade: book.grade || null },
            hint: '',
            lessons: single ? [] : lessonTitles.map(title => title.slice(0, 60)).slice(0, 20)
        })
        done += 1
        if (data) {
            entry.units[nodeId] = { title: unitTitle, ranked: Boolean(data.ranked), picks: data.picks.filter(item => item.grade > 0).map(item => [item.code, item.grade, item.point, item.reason]) }
            save()
        }
        console.log(`${done} ${record.textbook_title} ${unitTitle}: ${data ? data.picks.filter(item => item.grade === 2).map(item => item.point || item.code).join(' ') || '(none)' : 'FAILED'}`)
        await sleep(GAP_MS)
    }
}
save()
console.log(`done: ${done} units asked`)
