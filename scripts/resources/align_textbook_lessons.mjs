// 教材与课标对应, lesson by lesson: sends each textbook unit's 国家平台 lessons, with their own material
// (generated/smartedu/evidence, from build_lesson_evidence.mjs), to kebiao's AI route POST /api/v1/lesson-plans/align
// on production, and keeps the 要点 each lesson teaches or touches with the quote that shows it and where the quote
// is (the book's PDF page, the 教学设计, the 课程简介 or the 课题). Spaced under the 10-a-minute AI limit; saved
// after each request, so a rerun resumes. Writes data/textbooks/smartedu/lesson_alignment.json.
//   node scripts/resources/align_textbook_lessons.mjs [--base https://www.kebiao.org] [--edition ed_…] [--limit N] [--out file]
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SOURCE = path.join(ROOT, 'data/textbooks/smartedu')
const EVIDENCE = path.join(ROOT, 'generated/smartedu/evidence')
const arg = name => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null }
const BASE = arg('--base') || 'https://www.kebiao.org'
const LIMIT = Number(arg('--limit')) || Infinity
const ONLY = arg('--edition')
const OUT = arg('--out') ? path.resolve(arg('--out')) : path.join(SOURCE, 'lesson_alignment.json')
const REVERSE = process.argv.includes('--reverse')
// --redo-dropped: ask again, once, for lessons with an answer turned down (its quote did not match: often the 人教
// font letters, 狓 for x, now read back in the evidence)
const REDO = process.argv.includes('--redo-dropped')
// --lessons id,id (or --lessons-file file, one id a line): only these lessons; with --force, asked again even if done
const LESSONS = arg('--lessons') ? new Set(arg('--lessons').split(',')) : arg('--lessons-file') ? new Set(readFileSync(path.resolve(arg('--lessons-file')), 'utf8').split('\n').filter(Boolean)) : null
const FORCE = process.argv.includes('--force')
const GAP_MS = Number(arg('--gap')) || 6800
const PER_REQUEST = 9

const books = new Map(JSON.parse(readFileSync(path.join(ROOT, 'public/data/textbooks/index.json'), 'utf8')).items.map(item => [item.edition_id, item]))
const v2Slug = slug => (['art', 'music'].includes(slug) ? 'arts' : slug)
// editions with no PDF in the library (fetch_platform_editions.mjs)
const platformIndex = path.join(SOURCE, 'platform/index.json')
const platformBooks = existsSync(platformIndex) ? JSON.parse(readFileSync(platformIndex, 'utf8')).books : {}
const squash = text => String(text || '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()
const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {
    source: `${BASE}/api/v1/lesson-plans/align`,
    note: 'AI 逐课判断的课标要点：T = 主要在教，P = 部分涉及。每条都摘了这一课材料里的原话，并标明出处（book = 教材 PDF 第几页，design = 国家平台教学设计，task = 国家平台学习任务单，slides = 国家平台课件，summary = 国家平台课程简介，title = 只有课题）。机器判断，待核验。',
    fields: ['point', 'relation', 'quote', 'source', 'pdf_page'],
    editions: {}
}
const save = () => writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const NOTE = { heading: '', text: '', platform: '', english: '（页码按单元推断）', fuzzy: '（页码按课题推断）', section: '（页码按所在小节推断）', between: '（页码按前后课推断）' }
function materialOf(lesson) {
    const blocks = []
    const book = lesson.sources.textbook
    if (book) blocks.push(`【教材原文 第${book.pages[0]}${book.pages[1] > book.pages[0] ? `–${book.pages[1]}` : ''}页${NOTE[book.located_by] || ''}】${book.parts.map(part => part.text).join(' ').slice(0, 1500)}`)
    const DESIGN_LABEL = { design: '教学设计·教学目标', task: '学习任务单', slides: '课件' }
    if (lesson.sources.design) blocks.push(`【${DESIGN_LABEL[lesson.sources.design.kind || 'design']}】${lesson.sources.design.text.slice(0, 450)}`)
    if (lesson.sources.summary) blocks.push(`【课程简介】${lesson.sources.summary.text.slice(0, 300)}`)
    return blocks.join('\n').slice(0, 2900)
}

// where the quote is: the PDF page it is on, else the 教学设计, the 课程简介, the 课题
function sourceOf(quote, lesson) {
    const key = squash(quote).slice(0, 12)
    for (const part of lesson.sources.textbook?.parts || []) if (squash(part.text).includes(key)) return ['book', part.page]
    if (squash(lesson.sources.design?.text).includes(key)) return [lesson.sources.design.kind || 'design', null]
    if (squash(lesson.sources.summary?.text).includes(key)) return ['summary', null]
    if (squash(lesson.title).includes(key)) return ['title', null]
    // a 'close' quote (OCR noise) that no single page holds: the lesson's first page
    return lesson.sources.textbook ? ['book', lesson.sources.textbook.pages[0]] : ['title', null]
}

async function align(body) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await fetch(`${BASE}/api/v1/lesson-plans/align`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
        if (response?.status === 429) { await sleep(30000); continue }
        const payload = await response?.json().catch(() => null)
        if (response?.ok && ['ok', 'partial'].includes(payload?.data?.status)) return payload.data
        await sleep(10000)
    }
    return null
}

let done = 0
// --shard i/n: parallel workers each take every n-th book, into their own --out file; --merge folds them in
const [SHARD, SHARDS] = arg('--shard') ? arg('--shard').split('/').map(Number) : [0, 1]
if (arg('--merge')) {
    const main = existsSync(path.join(SOURCE, 'lesson_alignment.json')) ? JSON.parse(readFileSync(path.join(SOURCE, 'lesson_alignment.json'), 'utf8')) : out
    let added = 0
    for (const file of arg('--merge').split(',')) {
        for (const [edition, entry] of Object.entries(JSON.parse(readFileSync(path.resolve(file), 'utf8')).editions)) {
            const target = (main.editions[edition] ??= { textbook_title: entry.textbook_title, lessons: {} })
            for (const [id, row] of Object.entries(entry.lessons)) if (!target.lessons[id]) { target.lessons[id] = row; added += 1 }
        }
    }
    writeFileSync(path.join(SOURCE, 'lesson_alignment.json'), `${JSON.stringify(main, null, 1)}\n`)
    console.log(`merged ${added} lessons`)
    process.exit(0)
}
const files = readdirSync(EVIDENCE).filter(name => /^(ed|pf)_/u.test(name)).sort().filter((_, index) => index % SHARDS === SHARD)
for (const file of REVERSE ? files.reverse() : files) {
    const evidence = JSON.parse(readFileSync(path.join(EVIDENCE, file), 'utf8'))
    if (ONLY && evidence.edition_id !== ONLY) continue
    const book = books.get(evidence.edition_id) || platformBooks[evidence.edition_id]
    if (!book) continue
    const entry = (out.editions[evidence.edition_id] ??= { textbook_title: evidence.textbook_title, lessons: {} })
    // a unit's lessons in book order; repeats of one 课题 (several 课时 on the same pages) are asked once
    const units = new Map()
    for (const lesson of evidence.lessons) {
        const key = lesson.unit_node || lesson.id
        if (!units.has(key)) units.set(key, [])
        units.get(key).push(lesson)
    }
    for (const lessons of units.values()) {
        const unitTitle = (lessons[0].path[0] || lessons[0].title).slice(0, 60)
        const asked = new Map()
        for (const lesson of lessons) {
            const key = `${squash(lesson.title.replace(/[（(]?第[一二三四五六七八九十\d]+课时[）)]?/gu, ''))}|${lesson.sources.textbook?.pages.join('-') || ''}`
            if (!asked.has(key)) asked.set(key, { lesson, copies: [] })
            asked.get(key).copies.push(lesson.id)
        }
        const needs = id => !entry.lessons[id] || (REDO && entry.lessons[id].d > 0 && !entry.lessons[id].redo) || (FORCE && LESSONS?.has(id))
        const pending = [...asked.values()].filter(item => item.copies.some(needs) && (!LESSONS || item.copies.some(id => LESSONS.has(id))))
        for (let index = 0; index < pending.length && done < LIMIT; index += PER_REQUEST) {
            const chunk = pending.slice(index, index + PER_REQUEST)
            const started = Date.now()
            const data = await align({
                lesson: { unit_title: unitTitle, textbook_title: evidence.textbook_title.slice(0, 40), subject_slug: v2Slug(book.subject_slug), grade: book.grade || null },
                lessons: chunk.map(({ lesson }) => ({ id: lesson.id, title: lesson.title.slice(0, 80), material: materialOf(lesson) }))
            })
            done += 1
            if (data) {
                for (const result of data.lessons) {
                    const item = chunk.find(entryItem => entryItem.lesson.id === result.id)
                    if (!item) continue
                    const row = { m: result.matches.map(match => [match.point, match.relation === 'teaches' ? 'T' : 'P', match.quote, ...sourceOf(match.quote, item.lesson)]), d: result.dropped }
                    // what the route turned down, and why (a quote not in the material, or copied from the 要点)
                    if (result.rejected?.length) row.r = result.rejected.map(item => [item.point, item.reason, item.quote])
                    if (REDO) row.redo = 1
                    for (const id of item.copies) entry.lessons[id] = row
                }
                save()
            }
            const shown = data ? data.lessons.map(result => `${chunk.find(item => item.lesson.id === result.id)?.lesson.title}→${result.matches.filter(match => match.relation === 'teaches').map(match => match.point).join(',') || '∅'}`).join(' ') : 'FAILED'
            console.log(`${done} ${evidence.textbook_title} ${unitTitle}: ${shown}`)
            await sleep(Math.max(0, GAP_MS - (Date.now() - started)))
        }
    }
}
save()
console.log(`done: ${done} requests`)
