// For 教材与课标对应: gathers each 国家平台 同步课's own material, the evidence a 课标 match has to quote.
//   教材原文: the pages the lesson spans in our PDF (text layer, or ocr_textbook_pages.mjs for scans). Lessons are
//            found in book order: each one's title (without 课时 and numbering) on the first page at or after the
//            previous lesson's, headings first; the table of contents is skipped.
//   教学设计: the 教学目标 and 重点·难点 from page 1 of the 国家平台 教学设计 (ocr_lesson_designs.mjs).
//   课程简介: the platform's summary of the lesson video.
// Writes generated/smartedu/evidence/<edition_id>.json (local only: it quotes the books).
//   node scripts/resources/build_lesson_evidence.mjs [--edition ed_…]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { pagesFor } from '../v2/textbook_contents.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SOURCE = path.join(ROOT, 'data/textbooks/smartedu')
const CACHE = path.join(ROOT, 'generated/smartedu')
const OUT = path.join(CACHE, 'evidence')
const GENERATIONS = path.join(ROOT, 'data/textbooks/library-state/generations')
const registry = path.join(GENERATIONS, readdirSync(GENERATIONS).sort().pop(), 'asset_registry.lock.jsonl')
const only = process.argv.includes('--edition') ? process.argv[process.argv.indexOf('--edition') + 1] : null

export const squash = text => String(text || '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()
// readable text: lines joined, spaces between Chinese characters dropped (text layers and OCR space them out)
const tidy = text => String(text || '').replace(/\s+/gu, ' ').replace(/(\p{Script=Han}) (?=\p{Script=Han})/gu, '$1').trim()
const HOUR = /[（(]?第[一二三四五六七八九十\d]+课时[）)]?/gu
const NUMBERING = /^(?:第[一二三四五六七八九十百零\d]+(?:单元|章|节|课|框|部分)|课题\s*\d+|实验活动\s*\d+|\d+(?:\.\d+)*\*?|unit\s*\d+|lesson\s*\d+|module\s*\d+)\s*/iu

// the strings a lesson's heading may carry: its title without 课时 and numbering, the part in brackets, each
// segment of a 「单元-章-课」 title, and the numbered title itself (「1 春」 → 「1春」); bare part names (「A」,
// 「Part B」) borrow the parent's title
export function keysOf(title, parent = '') {
    const plain = String(title || '').replace(HOUR, '').replace(/^[☆*★]+/u, '').trim()
    const keys = new Set()
    const add = value => {
        const key = squash(value)
        if (key.length >= (/^[a-z0-9]+$/u.test(key) ? 8 : 3)) keys.add(key)
    }
    for (const part of plain.split(/\s*[-_—]+\s*|——/u).filter(Boolean)) {
        const bare = part.replace(NUMBERING, '').replace(/^(?:聆听|演唱|欣赏|演奏|编创|知识与技能)\s*/u, '')
        const outer = bare.replace(/[（(][^）)]*[）)]/gu, '').replace(/例\d+(?:[、,]例?\d+)*$/u, '')
        add(outer)
        for (const match of bare.matchAll(/[（(]([^）)]+)[）)]/gu)) if (!/^例/u.test(match[1])) add(match[1])
        if (squash(outer).length < 3) add(part)
    }
    if (!keys.size && parent) add(parent.replace(NUMBERING, ''))
    return [...keys]
}

// 英语 lessons are named by unit and part: 「Unit 1 Part A」, 「Section B 2a—2e」
export function englishKey(title, parent = '') {
    const text = `${parent} ${title}`
    const unit = /starter/iu.test(text) ? null : text.match(/unit\s*(\d+)/iu)?.[1]
    const part = text.match(/(part\s*[abc]|section\s*[ab]|recycle\s*\d|self\s*check|writing|reading)/iu)?.[1]
    const words = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
    return { unit: unit ? `unit${unit}` : null, unitWord: unit && words[Number(unit)] ? `unit${words[Number(unit)]}` : null, part: part ? squash(part) : null }
}

const pairsOf = key => {
    const pairs = new Set()
    for (let index = 0; index + 1 < key.length; index += 1) pairs.add(key.slice(index, index + 2))
    return pairs
}

function bookPages(editionId) {
    let pages = []
    try { pages = pagesFor(registry, editionId) || [] } catch { pages = [] }
    const withText = pages.filter(page => String(page.text || '').replace(/\s/gu, '').length > 80).length
    if (pages.length && withText >= pages.length * 0.5) return { source: 'text_layer', pages: pages.map(page => ({ pdf_page: page.pdf_page, text: page.text || '' })) }
    const file = path.join(CACHE, 'page-ocr', `${editionId}.jsonl`)
    if (!existsSync(file)) return { source: null, pages: [] }
    const ocr = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).sort((a, b) => a.pdf_page - b.pdf_page)
    return { source: 'ocr', pages: ocr }
}

// 教学目标 … 重点 … 难点 from the 教学设计's first page; the 课例 header before it is only names and schools
export function objectivesOf(text) {
    const plain = tidy(text)
    const at = plain.search(/教学目标|学习目标|课标要求|课程标准/u)
    if (at < 0) return ''
    const end = plain.slice(at).search(/教学过程|教学环节|教学流程|课前准备|教学准备|学情分析|时间\s*教学/u)
    return plain.slice(at, at + (end > 40 ? Math.min(end, 600) : 600)).trim()
}

function loadDesigns() {
    const file = path.join(CACHE, 'designs.jsonl')
    const out = new Map()
    if (!existsSync(file)) return out
    for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
        const row = JSON.parse(line)
        const objectives = objectivesOf(row.text)
        if (objectives) out.set(row.lesson_id, objectives)
    }
    return out
}

function loadSummaries() {
    const out = new Map()
    for (const name of readdirSync(CACHE).filter(item => item.startsWith('lessons-'))) {
        for (const lesson of JSON.parse(readFileSync(path.join(CACHE, name), 'utf8'))) {
            const video = (lesson.relations?.national_course_resource || []).find(item => String(item.description || '').length > 30)
            if (video && !out.has(lesson.id)) out.set(lesson.id, tidy(video.description).replace(/\$[^$]*\$/gu, '').slice(0, 300))
        }
    }
    return out
}

// start page of every lesson, in book order. Each lesson has candidate pages (its title as a heading, anywhere on
// the page, nearly all of its title's character pairs, or the platform's own start page); the chosen pages are the
// non-decreasing chain with the most weight, so one wrong early match cannot push every later lesson off its page.
export function locate(lessons, pages) {
    const squashed = pages.map(page => ({ pdf_page: page.pdf_page, text: squash(page.text) }))
    const allKeys = [...new Set(lessons.flatMap(lesson => lesson.keys))]
    // the 目录 lists every title: early pages that carry four or more of them are skipped
    // (英语 contents list 「Unit 1 … Unit 2 …」; front matter is 编者的话 or 致同学们)
    const contents = new Set(squashed.filter(page => page.pdf_page <= 16 && (allKeys.filter(key => page.text.includes(key)).length >= 4 || /目录|contents|编者的话|致同学们/u.test(page.text.slice(0, 200)) || (page.text.match(/unit\d+/gu) || []).length >= 3)).map(page => page.pdf_page))
    // back matter (附录, 词汇表 — 英语 lists every unit there) ends the body
    const lastPage = squashed.at(-1)?.pdf_page || 0
    const back = squashed.find(page => page.pdf_page > lastPage * 0.75 && /^(?:附录|appendix|词汇表|wordsineachunit|vocabulary|wordlist|后记)/u.test(page.text.slice(0, 40)))?.pdf_page || Infinity
    const body = squashed.filter(page => !contents.has(page.pdf_page) && page.pdf_page > 2 && page.pdf_page < back)
    const pagePairs = new Map(body.map(page => [page.pdf_page, pairsOf(page.text)]))
    // a unit opener lists its lessons (「课题1 … 课题2 … 课题3 …」): a title there is not where that lesson starts
    const listing = new Set(body.filter(page => allKeys.filter(key => page.text.includes(key)).length >= 3).map(page => page.pdf_page))
    const options = lessons.map(lesson => {
        const found = new Map()
        const put = (page, weight, how) => {
            if (!found.has(page) || found.get(page).weight < weight) found.set(page, { page, weight, how })
        }
        for (const key of lesson.keys) {
            for (const page of body) {
                if (listing.has(page.pdf_page)) { if (page.text.includes(key)) put(page.pdf_page, 0.3, 'text') }
                else if (page.text.slice(0, 120).includes(key)) put(page.pdf_page, 3, 'heading')
                else if (page.text.includes(key)) put(page.pdf_page, 1, 'text')
            }
        }
        if (lesson.english?.unit) {
            // 「Starter Unit 1」 is not 「Unit 1」
            const head = page => page.text.slice(0, 160).replace(/starterunit\d+/gu, '')
            const unitPages = body.filter(page => head(page).includes(lesson.english.unit) || (lesson.english.unitWord && head(page).includes(lesson.english.unitWord))).map(page => page.pdf_page)
            for (const first of unitPages.slice(0, 3)) {
                const part = lesson.english.part ? body.find(page => page.pdf_page >= first && page.pdf_page <= first + 12 && page.text.includes(lesson.english.part)) : null
                // PEP 小学 units are ten pages, Part A, B and C at about +0, +4 and +8; their pages print only 「A」
                const pep = !part && /^part[abc]$/u.test(lesson.english.part || '') ? { parta: 0, partb: 4, partc: 8 }[lesson.english.part] : 0
                put(part ? part.pdf_page : first + pep, part ? 2 : 1, 'english')
            }
        }
        if (!found.size) {
            for (const key of lesson.keys.filter(item => item.length >= 4)) {
                const wanted = [...pairsOf(key)]
                for (const page of body) {
                    const have = pagePairs.get(page.pdf_page)
                    if (wanted.filter(pair => have.has(pair)).length / wanted.length >= 0.75) put(page.pdf_page, 0.8, 'fuzzy')
                }
            }
        }
        if (lesson.pdf_page) put(lesson.pdf_page, 2, 'platform')
        // a title found on many pages (a running head) says little about where the lesson starts
        const list = [...found.values()].sort((a, b) => a.page - b.page)
        return list.length > 12 ? list.filter(item => item.how === 'heading' || item.how === 'platform').slice(0, 12) : list
    })
    // best[i][c]: the heaviest non-decreasing chain ending with lesson i on its candidate c
    const best = options.map(list => list.map(() => ({ score: 0, from: null })))
    for (let i = 0; i < options.length; i += 1) {
        for (let c = 0; c < options[i].length; c += 1) {
            let top = { score: options[i][c].weight, from: null }
            for (let j = 0; j < i; j += 1) {
                for (let d = 0; d < options[j].length; d += 1) {
                    if (options[j][d].page <= options[i][c].page && best[j][d].score + options[i][c].weight > top.score) top = { score: best[j][d].score + options[i][c].weight, from: [j, d] }
                }
            }
            best[i][c] = top
        }
    }
    let end = null
    for (let i = 0; i < options.length; i += 1) for (let c = 0; c < options[i].length; c += 1) if (!end || best[i][c].score > best[end[0]][end[1]].score) end = [i, c]
    const chosen = lessons.map(() => null)
    while (end) {
        chosen[end[0]] = options[end[0]][end[1]]
        end = best[end[0]][end[1]].from
    }
    return chosen.map(item => (item ? { page: item.page, how: item.how } : null))
}

export function buildEvidence(record, { pages, source }, designs, summaries) {
    const order = new Map()
    const titles = new Map()
    const walk = nodes => {
        for (const node of nodes || []) {
            order.set(node.id, order.size)
            titles.set(node.id, node.title)
            walk(node.children)
        }
    }
    walk(record.tree)
    const position = lesson => order.get(lesson.chapter_path.at(-1)) ?? Number.MAX_SAFE_INTEGER
    const lessons = record.lessons.map((lesson, index) => ({ lesson, index })).sort((a, b) => position(a.lesson) - position(b.lesson) || a.index - b.index).map(({ lesson }) => {
        const path = lesson.chapter_path.map(id => titles.get(id)).filter(Boolean)
        const parent = path.filter(title => title !== lesson.title).at(-1) || ''
        const english = /^ed_/u.test(record.edition_id) && /英语/u.test(record.textbook_title) ? englishKey(lesson.title, parent) : null
        // 「化学与生活_有机合成材料」: the unit's own title is not where this lesson starts
        const ancestors = new Set(path.slice(0, -1).map(title => squash(title.replace(NUMBERING, ''))))
        const own = keysOf(lesson.title, parent)
        const keys = own.filter(key => !ancestors.has(key)).length ? own.filter(key => !ancestors.has(key)) : own
        return { ...lesson, path, keys, english }
    })
    const starts = pages.length ? locate(lessons, pages) : lessons.map(() => null)
    const byPage = new Map(pages.map(page => [page.pdf_page, page.text]))
    const lastPage = pages.at(-1)?.pdf_page || 0
    return lessons.map((lesson, index) => {
        let start = starts[index]
        const sources = {}
        // not found, but the lessons before and after it are close: it sits on the pages between them
        if (!start) {
            const before = starts.slice(0, index).filter(Boolean).at(-1)
            const after = starts.slice(index + 1).find(Boolean)
            if (before && after && after.page - before.page <= 6 && after.page > before.page) start = { page: before.page, how: 'between' }
        }
        if (start) {
            const next = starts.slice(index + 1).find(item => item && item.page > start.page)
            const end = Math.min(next ? Math.max(start.page, next.page - 1) : start.page + 3, start.page + 4, lastPage)
            // page by page, so a quote can be traced to its page; about 1,500 characters in all
            const parts = []
            let room = 1500
            for (let page = start.page; page <= end && room > 0; page += 1) {
                const text = tidy(byPage.get(page) || '').slice(0, room)
                if (text) parts.push({ page, text })
                room -= text.length
            }
            sources.textbook = { pages: [start.page, end], located_by: start.how, from: source, parts }
        }
        if (designs.has(lesson.id)) sources.design = { text: designs.get(lesson.id).slice(0, 450) }
        if (summaries.has(lesson.id)) sources.summary = { text: summaries.get(lesson.id) }
        return { id: lesson.id, title: lesson.title, path: lesson.path, unit_node: lesson.chapter_path[0] || null, sources }
    })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    mkdirSync(OUT, { recursive: true })
    const designs = loadDesigns()
    const summaries = loadSummaries()
    const totals = { lessons: 0, textbook: 0, design: 0, summary: 0, none: 0 }
    for (const file of readdirSync(SOURCE).filter(name => name.startsWith('ed_')).sort()) {
        const record = JSON.parse(readFileSync(path.join(SOURCE, file), 'utf8'))
        if (only && record.edition_id !== only) continue
        const lessons = buildEvidence(record, bookPages(record.edition_id), designs, summaries)
        for (const lesson of lessons) {
            totals.lessons += 1
            for (const key of ['textbook', 'design', 'summary']) if (lesson.sources[key]) totals[key] += 1
            if (!Object.keys(lesson.sources).length) totals.none += 1
        }
        writeFileSync(path.join(OUT, `${record.edition_id}.json`), `${JSON.stringify({ edition_id: record.edition_id, textbook_title: record.textbook_title, lessons }, null, 1)}\n`)
    }
    console.log(`lesson evidence: ${JSON.stringify(totals)}`)
}
