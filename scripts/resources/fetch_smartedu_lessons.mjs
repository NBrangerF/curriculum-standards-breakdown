// Finds each kebiao textbook on 国家中小学智慧教育平台 (basic.smartedu.cn) and saves its 同步课 list:
// the chapter tree and, for every lesson, its title, chapter path and which materials it has
// (视频课程、课件、教学设计、学习任务单、课后练习…). Only titles and ids are kept; the platform hosts the content.
// Output: data/textbooks/smartedu/<edition_id>.json and data/textbooks/smartedu/index.json.
// Usage: node scripts/resources/fetch_smartedu_lessons.mjs [--only ed_xxx] [--refresh]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdirSync } from 'node:fs'
import { pagesFor } from '../v2/textbook_contents.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'data/textbooks/smartedu')
const CACHE = path.join(ROOT, 'generated/smartedu')
const BASE = 'https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/national_lesson'
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const refresh = args.includes('--refresh')
mkdirSync(OUT, { recursive: true })
mkdirSync(CACHE, { recursive: true })

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function getJson(url, cacheName) {
    const file = path.join(CACHE, cacheName)
    if (!refresh && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const response = await fetch(url, { headers: { 'user-agent': 'kebiao.org textbook index (+https://www.kebiao.org)' } })
            if (response.status === 403 || response.status === 404) return null
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const value = await response.json()
            writeFileSync(file, JSON.stringify(value))
            await sleep(250)
            return value
        } catch (error) {
            if (attempt === 3) throw new Error(`${url}: ${error.message}`)
            await sleep(1000 * attempt)
        }
    }
    return null
}

// 我们的版本名 → 平台标题里的版本写法
const EDITION_TOKENS = [
    [/人教版 PEP/u, ['人教版']],
    [/人美版/u, ['人美版']],
    [/人音版（简谱/u, ['人音版（简谱）', '人音版']],
    [/教科版/u, ['教科版']],
    [/统编版/u, ['统编版']],
    [/人教版/u, ['人教版']]
]
const SUBJECT_ALIASES = { 生物学: ['生物学', '生物'], 体育与健康: ['体育与健康', '体育'] }
const GRADE_CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']

const normaliseTitle = title => String(title || '')
    .replace(/^[★*※\s]+/u, '')
    .replace(/^(第[一二三四五六七八九十百\d]+(?:单元|课|章|节|部分|讲)|课题\s*\d+|[\dＩⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+[\s.、．]*|Unit\s*\d+|Lesson\s*\d+)/iu, '')
    .replace(/[\s·•、，,。．.：:！!？?“”"'（）()《》\-—–]/gu, '')
    .toLowerCase()

function candidatesFor(book, materials) {
    const stage = book.stage === 'junior' ? '初中' : '小学'
    const subjects = SUBJECT_ALIASES[book.subject] || [book.subject]
    const tokens = EDITION_TOKENS.find(([pattern]) => pattern.test(book.edition_name))?.[1] || [book.edition_name.replace(/（.*$/u, '')]
    const grade = `${GRADE_CN[book.grade]}年级`
    const volume = book.volume === '全一册' ? '' : book.volume
    return materials.filter(item => {
        const title = item.title.replace(/^新教材-/u, '')
        if (!title.startsWith(stage) || /五•四学制|五四学制/u.test(title)) return false
        if (!subjects.some(subject => title.includes(subject))) return false
        if (!tokens.some(token => title.includes(token))) return false
        // 「三年级起点」 names where the English series starts, not the book's grade
        if (!title.replace(/[一三]年级起点/gu, '').includes(grade)) return false
        return volume ? title.includes(volume) : /全一册|年级$/u.test(title) || !/[上下]册/u.test(title)
    })
}

function flattenTree(nodes, parents = [], out = []) {
    for (const node of nodes || []) {
        const entry = { id: node.id, title: node.title, path: [...parents, node.id] }
        out.push(entry)
        flattenTree(node.child_nodes, entry.path, out)
    }
    return out
}

const slimTree = nodes => (nodes || []).filter(node => !node.custom_properties?.hidden).map(node => ({ id: node.id, title: node.title, children: slimTree(node.child_nodes) }))

const MATERIALS = ['视频课程', '课件', '教学设计', '学习任务单', '课后练习', '基础性作业', '拓展性作业']
function lessonMaterials(lesson) {
    const resources = Object.values(lesson.relations || {}).flat().filter(item => item && typeof item === 'object')
    const names = new Set(resources.map(item => item.custom_properties?.alias_name || item.resource_type_code_name).filter(Boolean))
    const hours = new Set(resources.flatMap(item => (item.tag_list || []).map(tag => tag.tag_name)).filter(name => /^第[一二三四五六七八九十]+课时$/u.test(name)))
    return { materials: MATERIALS.filter(name => names.has(name)), hours: hours.size || 1 }
}

const books = JSON.parse(readFileSync(path.join(ROOT, 'public/data/textbooks/index.json'), 'utf8')).items
const units = JSON.parse(readFileSync(path.join(ROOT, 'public/data/textbooks/units.json'), 'utf8')).items
const unitTitles = new Map()
const addTitle = (edition, title) => {
    const key = normaliseTitle(title)
    if (key.length < 2) return
    if (!unitTitles.has(edition)) unitTitles.set(edition, new Set())
    unitTitles.get(edition).add(key)
}
for (const unit of units) addTitle(unit.edition_id, unit.title)
// the 目录 pages re-read for v2 are cleaner than some stored tables of contents
for (const [edition, title] of JSON.parse(readFileSync(path.join(ROOT, 'public/data/v2/textbook_chapters.json'), 'utf8')).chapters) addTitle(edition, title)

// 「人音版（简谱，吴斌）」: the editor and notation must match too
function variantScore(book, title) {
    const detail = book.edition_name.match(/（(.+)）/u)?.[1] || ''
    let score = 0
    for (const token of detail.split(/[，、,\s]+/u).filter(item => item.length >= 2)) {
        if (title.includes(token)) score += 1
    }
    if (/简谱/u.test(detail) && /五线谱/u.test(title)) score -= 2
    if (/主编/u.test(title) && detail && !detail.split(/[，、,\s]+/u).some(token => token.length >= 2 && title.includes(token)) && !/PEP|三年级起点/u.test(detail)) score -= 1
    if (/浙人美/u.test(title) && !/浙/u.test(book.edition_name)) score -= 2
    return score
}

// The book's own page text (on the textbook drive) tells old and new editions apart: their lesson titles differ.
const GENERATIONS = path.join(ROOT, 'data/textbooks/library-state/generations')
const registry = `${GENERATIONS}/${readdirSync(GENERATIONS).sort().pop()}/asset_registry.lock.jsonl`
const squash = text => String(text || '').replace(/[\s·•、，,。．.：:！!？?“”"'（）()《》\-—–]/gu, '').toLowerCase()
// Scanned books with no text layer: their opening pages, read by Vision OCR into generated/smartedu/toc-ocr/<edition>.txt
// (scripts/grade7_9/vision_ocr.swift on pages 2–14), carry the 目录.
const TOC_OCR = path.join(CACHE, 'toc-ocr')
function bookPages(editionId) {
    let pages = []
    try { pages = (pagesFor(registry, editionId) || []).map(page => ({ pdf_page: page.pdf_page, text: squash(page.text) })) } catch { pages = [] }
    if (pages.some(page => page.text)) return pages
    const file = path.join(TOC_OCR, `${editionId}.txt`)
    return existsSync(file) ? [{ pdf_page: null, text: squash(readFileSync(file, 'utf8')), ocr: true }] : pages
}
const NUMBERED = /^第[一二三四五六七八九十百\d]+(?:单元|章|课)/u
// the first page after the 目录 whose opening lines carry the title: where that lesson starts in our PDF
function startPage(pages, title) {
    const key = normaliseTitle(title)
    if (key.length < 3) return null
    const hit = pages.find(page => page.pdf_page > 6 && page.text.slice(0, 160).includes(key))
    return hit ? hit.pdf_page : null
}

const version = await getJson(`${BASE}/teachingmaterials/version/data_version.json`, 'version.json')
const materials = []
for (const url of version.urls) materials.push(...(await getJson(url, `materials-${path.basename(url)}`)))
console.log(`national_lesson textbooks: ${materials.length}`)

const index = { fetched_at: new Date().toISOString().slice(0, 10), source: 'https://basic.smartedu.cn/syncClassroom', editions: {} }
let lessonTotal = 0
for (const book of books) {
    if (only && book.edition_id !== only) continue
    const candidates = candidatesFor(book, materials)
    const ours = unitTitles.get(book.edition_id) || new Set()
    const pages = bookPages(book.edition_id)
    const bookText = pages.map(page => page.text).join('')
    const fromOcr = pages.length === 1 && pages[0].ocr
    const trees = []
    for (const candidate of candidates) {
        const tree = await getJson(`${BASE}/trees/${candidate.id}.json`, `tree-${candidate.id}.json`)
        if (tree) trees.push({ candidate, tree, nodes: flattenTree(tree) })
    }
    let best = null
    let runnerUp = 0
    const scored = []
    for (const { candidate, tree, nodes } of trees) {
        const titled = nodes.map(node => normaliseTitle(node.title)).filter(key => key.length >= 3)
        const overlap = bookText
            ? titled.filter(key => bookText.includes(key)).length
            : nodes.filter(node => ours.has(normaliseTitle(node.title))).length
        const variant = variantScore(book, candidate.title)
        // from the OCR'd 目录: old and new editions share lesson names but not chapter numbers (「第五章中国的地理差异」)
        const numbered = fromOcr ? nodes.map(node => squash(node.title)).filter(key => NUMBERED.test(key) && key.length >= 5).filter(key => bookText.includes(key)).length : 0
        const score = fromOcr ? numbered * 10 + overlap : overlap / Math.max(1, bookText ? titled.length : Math.min(nodes.length, ours.size)) + variant * 0.2
        scored.push({ candidate, tree, nodes, titled: titled.length, overlap, score, variant, tie: false })
        if (!best || score > best.score) { runnerUp = best ? Math.max(runnerUp, best.score) : runnerUp; best = { candidate, tree, nodes, titled: titled.length, overlap, score, variant, tie: false } }
        else {
            runnerUp = Math.max(runnerUp, score)
            if (score === best.score) best.tie = true
        }
    }
    // a new edition the platform has only begun (one or two titled nodes) wins on ratio alone (语文4上: 1/1 against 54/56);
    // prefer a full tree that shares at least three titles with the book
    if (best && best.titled < 3) {
        const full = scored.filter(item => item.titled >= 3 && item.overlap >= 3).sort((a, b) => b.overlap - a.overlap)[0]
        if (full) best = full
    }
    // OCR'd books must win clearly: at least five titles (or numbered chapters) and twice the next edition's score
    if (fromOcr && best && !(best.score >= 5 && best.overlap >= 5 && best.score >= 2 * runnerUp)) best = null
    // one candidate with the same subject, edition, grade, volume and editor is the book even when our 目录 is too sparse to compare
    const sole = best && best.variant >= 0 && (candidates.length === 1 || (best.overlap === 0 && !best.tie && best.variant > 0))
    if (!best || best.variant < 0 || (best.overlap < 2 && !sole) || (bookText && best.tie && best.overlap < 3)) {
        index.editions[book.edition_id] = { status: 'not_found', candidates: candidates.map(item => item.title) }
        console.log(`  - ${book.title} (${book.edition_name}): no match among ${candidates.length}`)
        continue
    }
    const parts = await getJson(`${BASE}/teachingmaterials/${best.candidate.id}/resources/parts.json`, `parts-${best.candidate.id}.json`)
    const lessons = []
    for (const url of parts || []) {
        for (const lesson of (await getJson(url, `lessons-${best.candidate.id}-${path.basename(url)}`)) || []) {
            if (lesson.status !== 'ONLINE') continue
            const chapterPaths = String(lesson.chapter_paths || '').match(/[0-9a-f-]{36}(?:\/[0-9a-f-]{36})*/gu) || []
            lessons.push({ id: lesson.id, title: lesson.title, chapter_path: (chapterPaths[0] || '').split('/').filter(Boolean), pdf_page: startPage(pages, lesson.title), ...lessonMaterials(lesson) })
        }
    }
    lessonTotal += lessons.length
    const record = {
        edition_id: book.edition_id,
        textbook_title: book.title,
        platform_textbook_id: best.candidate.id,
        platform_title: best.candidate.title,
        match: { title_hits: best.overlap, method: fromOcr ? 'toc_ocr' : bookText ? 'book_text' : 'toc', score: Math.round(best.score * 100) / 100, candidates: candidates.length },
        tree: slimTree(best.tree),
        lessons
    }
    writeFileSync(path.join(OUT, `${book.edition_id}.json`), `${JSON.stringify(record, null, 1)}\n`)
    index.editions[book.edition_id] = { status: 'matched', platform_textbook_id: best.candidate.id, platform_title: best.candidate.title, lessons: lessons.length, title_hits: best.overlap, method: fromOcr ? 'toc_ocr' : bookText ? 'book_text' : 'toc', pages_found: lessons.filter(item => item.pdf_page).length }
    console.log(`  ✓ ${book.title} → ${best.candidate.title}: ${lessons.length} lessons, overlap ${best.overlap}`)
}
if (!only) writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 1)}\n`)
console.log(`done: ${Object.values(index.editions).filter(item => item.status === 'matched').length} matched, ${lessonTotal} lessons`)
