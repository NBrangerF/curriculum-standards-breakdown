// Reads the opening slides of each 信息科技 教学指南 lesson's 课件 (the platform's public preview images, listed by
// fetch_it_guides.mjs) with Vision OCR, as kind 'slides' evidence for 教材与课标对应. Slides 2–3 usually carry the
// lesson's 学习目标 or its first task; slide 1 is the title. Resumes where it stopped.
// Output: generated/smartedu/designs-it.jsonl ({ lesson_id, kind, text }), appended to designs.jsonl by the caller.
//   node scripts/resources/ocr_it_guides.mjs
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const CACHE = path.join(ROOT, 'generated/smartedu')
const BIN = path.join(CACHE, 'vision_ocr')
if (!existsSync(BIN)) execFileSync('swiftc', ['-O', path.join(ROOT, 'scripts/grade7_9/vision_ocr.swift'), '-o', BIN])
const OUT = path.join(CACHE, 'designs-it.jsonl')
const done = new Set(existsSync(OUT) ? readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line).lesson_id) : [])

const queue = []
for (const name of readdirSync(path.join(CACHE, 'it-guides')).filter(file => file.endsWith('.json'))) {
    const { previews } = JSON.parse(readFileSync(path.join(CACHE, 'it-guides', name), 'utf8'))
    for (const [id, slides] of Object.entries(previews)) if (!done.has(id) && slides.length > 1) queue.push([id, slides.slice(1, 3)])
}
console.log(`lessons to read: ${queue.length}, done ${done.size}`)
const dir = mkdtempSync(path.join(tmpdir(), 'kebiao-it-'))
try {
    for (const [index, [id, slides]] of queue.entries()) {
        const files = []
        for (const [n, url] of slides.entries()) {
            const response = await fetch(url).catch(() => null)
            if (!response?.ok) continue
            const file = path.join(dir, `${id}-${n}.jpg`)
            writeFileSync(file, Buffer.from(await response.arrayBuffer()))
            files.push(file)
            await new Promise(resolve => setTimeout(resolve, 150))
        }
        if (!files.length) continue
        const rows = execFileSync(BIN, files, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line))
        const text = rows.sort((a, b) => a.file.localeCompare(b.file)).map(row => row.text || '').join('\n').trim()
        appendFileSync(OUT, `${JSON.stringify({ lesson_id: id, kind: 'slides', text })}\n`)
        for (const file of files) rmSync(file, { force: true })
        if (index % 25 === 0) console.log(`${index + 1}/${queue.length}`)
    }
} finally {
    rmSync(dir, { recursive: true, force: true })
}
