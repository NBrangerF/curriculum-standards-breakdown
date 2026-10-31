// The 国家中小学智慧教育平台 教学设计 of each 同步课 opens with the lesson's 教学目标 and 重点·难点. This reads the
// first page of its public preview image with Vision OCR into generated/smartedu/designs.jsonl
// ({ lesson_id, text }), one of the evidence sources for 教材与课标对应 (build_lesson_evidence.mjs).
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
for (const name of readdirSync(path.join(ROOT, 'data/textbooks/smartedu')).filter(item => item.startsWith('ed_'))) {
    for (const lesson of JSON.parse(readFileSync(path.join(ROOT, 'data/textbooks/smartedu', name), 'utf8')).lessons) ours.add(lesson.id)
}
const wanted = new Map()
for (const name of readdirSync(CACHE).filter(item => item.startsWith('lessons-'))) {
    for (const lesson of JSON.parse(readFileSync(path.join(CACHE, name), 'utf8'))) {
        if (!ours.has(lesson.id) || wanted.has(lesson.id)) continue
        const design = (lesson.relations?.national_course_resource || []).find(item => item.resource_type_code === 'lesson_plandesign')
        const preview = design?.custom_properties?.preview || {}
        const first = Object.keys(preview).sort((a, b) => Number(a.replace(/\D/gu, '')) - Number(b.replace(/\D/gu, '')))[0]
        if (first) wanted.set(lesson.id, preview[first])
    }
}
const done = new Set(existsSync(OUT) ? readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line).lesson_id) : [])
console.log(`教学设计 previews: ${wanted.size}, done ${done.size}`)
const dir = mkdtempSync(path.join(tmpdir(), 'kebiao-design-'))
const BATCH = 10
const queue = [...wanted].filter(([id]) => !done.has(id))
try {
    for (let index = 0; index < queue.length; index += BATCH) {
        const batch = queue.slice(index, index + BATCH)
        const files = []
        for (const [id, url] of batch) {
            const response = await fetch(url).catch(() => null)
            if (!response?.ok) continue
            const file = path.join(dir, `${id}.jpg`)
            writeFileSync(file, Buffer.from(await response.arrayBuffer()))
            files.push(file)
            await new Promise(resolve => setTimeout(resolve, 150))
        }
        if (!files.length) continue
        const rows = execFileSync(BIN, files, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line))
        for (const row of rows) appendFileSync(OUT, `${JSON.stringify({ lesson_id: path.basename(row.file, '.jpg'), text: row.text || '' })}\n`)
        for (const file of files) rmSync(file, { force: true })
        if ((index / BATCH) % 10 === 0) console.log(`${index + batch.length}/${queue.length}`)
    }
} finally {
    rmSync(dir, { recursive: true, force: true })
}
