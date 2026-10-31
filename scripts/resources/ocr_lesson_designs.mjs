// The 国家中小学智慧教育平台 教学设计 of each 同步课 opens with the lesson's 教学目标 and 重点·难点. This reads the
// first page of its public preview image with Vision OCR into generated/smartedu/designs.jsonl
// ({ lesson_id, kind, text }), one of the evidence sources for 教材与课标对应 (build_lesson_evidence.mjs). A lesson
// with no 教学设计 gets its 学习任务单 (kind 'task') or a 课件 slide (kind 'slides').
// Images are read one at a time and deleted after OCR. Resumes where it stopped. Needs Swift.
//   node scripts/resources/ocr_lesson_designs.mjs
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const CACHE = path.join(ROOT, 'generated/smartedu')
const OUT = path.join(CACHE, 'designs.jsonl')
const BIN = path.join(CACHE, 'vision_ocr')
if (!existsSync(BIN)) execFileSync('swiftc', ['-O', path.join(ROOT, 'scripts/grade7_9/vision_ocr.swift'), '-o', BIN])

const ours = new Set()
// the library's books, and the editions it has no PDF of (fetch_platform_editions.mjs)
for (const dir of ['data/textbooks/smartedu', 'data/textbooks/smartedu/platform']) {
    if (!existsSync(path.join(ROOT, dir))) continue
    for (const name of readdirSync(path.join(ROOT, dir)).filter(item => /^(ed|pf)_/u.test(item))) {
        for (const lesson of JSON.parse(readFileSync(path.join(ROOT, dir, name), 'utf8')).lessons) ours.add(lesson.id)
    }
}
// lessons that have no page text of their own (scans not found in the book, editions with no PDF) also get a 学习任务单 or 课件
const needsMore = new Set()
const EVIDENCE = path.join(CACHE, 'evidence')
if (existsSync(EVIDENCE)) {
    for (const name of readdirSync(EVIDENCE).filter(item => item.endsWith('.json'))) {
        for (const lesson of JSON.parse(readFileSync(path.join(EVIDENCE, name), 'utf8')).lessons) if (!lesson.sources.textbook) needsMore.add(lesson.id)
    }
}
for (const name of existsSync(path.join(ROOT, 'data/textbooks/smartedu/platform')) ? readdirSync(path.join(ROOT, 'data/textbooks/smartedu/platform')).filter(item => item.startsWith('pf_')) : []) {
    for (const lesson of JSON.parse(readFileSync(path.join(ROOT, 'data/textbooks/smartedu/platform', name), 'utf8')).lessons) needsMore.add(lesson.id)
}
const wanted = new Map()
for (const name of readdirSync(CACHE).filter(item => item.startsWith('lessons-'))) {
    for (const lesson of JSON.parse(readFileSync(path.join(CACHE, name), 'utf8'))) {
        if (!ours.has(lesson.id) || wanted.has(lesson.id)) continue
        // the 教学设计's first page; without one, the 学习任务单's first page (it opens with 学习目标), else the 课件's
        // second slide (the first is the title)
        const resources = lesson.relations?.national_course_resource || []
        for (const [code, kind, slide] of [['lesson_plandesign', 'design', 0], ['learning_task', 'task', 0], ['coursewares', 'slides', 1]]) {
            const preview = resources.find(item => item.resource_type_code === code)?.custom_properties?.preview || {}
            const pages = Object.keys(preview).sort((a, b) => Number(a.replace(/\D/gu, '')) - Number(b.replace(/\D/gu, '')))
            const page = pages[Math.min(slide, pages.length - 1)]
            if (page && (kind === 'design' || needsMore.has(lesson.id))) { wanted.set(lesson.id, { url: preview[page], kind }); break }
        }
    }
}
const done = new Set(existsSync(OUT) ? readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line).lesson_id) : [])
console.log(`previews: ${wanted.size} (${[...wanted.values()].filter(item => item.kind === 'design').length} 教学设计), done ${done.size}`)
const dir = mkdtempSync(path.join(tmpdir(), 'kebiao-design-'))
const BATCH = 10
const queue = [...wanted].filter(([id]) => !done.has(id))
try {
    for (let index = 0; index < queue.length; index += BATCH) {
        const batch = queue.slice(index, index + BATCH)
        const files = []
        for (const [id, { url }] of batch) {
            const response = await fetch(url).catch(() => null)
            if (!response?.ok) continue
            const file = path.join(dir, `${id}.jpg`)
            writeFileSync(file, Buffer.from(await response.arrayBuffer()))
            files.push(file)
            await new Promise(resolve => setTimeout(resolve, 150))
        }
        if (!files.length) continue
        const rows = execFileSync(BIN, files, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line))
        for (const row of rows) {
            const id = path.basename(row.file, '.jpg')
            appendFileSync(OUT, `${JSON.stringify({ lesson_id: id, kind: wanted.get(id).kind, text: row.text || '' })}\n`)
        }
        for (const file of files) rmSync(file, { force: true })
        if ((index / BATCH) % 10 === 0) console.log(`${index + batch.length}/${queue.length}`)
    }
} finally {
    rmSync(dir, { recursive: true, force: true })
}
