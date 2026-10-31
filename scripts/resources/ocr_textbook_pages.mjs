// For textbooks whose PDF has no text layer, reads every page with Vision OCR into
// generated/smartedu/page-ocr/<edition>.jsonl ({ pdf_page, text } per line), so the lesson evidence for
// 教材与课标对应 (build_lesson_evidence.mjs) can quote the book. Needs Ghostscript (gs), Swift and the textbook drive.
// Resumes where it stopped. --shard i/n splits the books between parallel runs.
//   node scripts/resources/ocr_textbook_pages.mjs --shard 0/3
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pagesFor } from '../v2/textbook_contents.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const LIBRARY = '/Volumes/X9 Pro/kebiao-library'
const OUT = path.join(ROOT, 'generated/smartedu/page-ocr')
const GENERATIONS = path.join(ROOT, 'data/textbooks/library-state/generations')
const registry = path.join(GENERATIONS, readdirSync(GENERATIONS).sort().pop(), 'asset_registry.lock.jsonl')
const shardArg = process.argv[process.argv.indexOf('--shard') + 1]
const [shard, shards] = process.argv.includes('--shard') ? shardArg.split('/').map(Number) : [0, 1]
const CHUNK = 12

// a compiled copy runs far faster than `swift script.swift` for every chunk
const BIN = path.join(ROOT, 'generated/smartedu/vision_ocr')
if (!existsSync(BIN)) execFileSync('swiftc', ['-O', path.join(ROOT, 'scripts/grade7_9/vision_ocr.swift'), '-o', BIN])

const books = readdirSync(path.join(ROOT, 'data/textbooks/smartedu')).filter(name => name.startsWith('ed_')).sort()
    .map(name => JSON.parse(readFileSync(path.join(ROOT, 'data/textbooks/smartedu', name), 'utf8')))
const objects = new Map()
for (const line of readFileSync(registry, 'utf8').split('\n').filter(Boolean)) {
    const record = JSON.parse(line)
    if (line.includes('"student_textbook"') && !objects.has(record.edition_id)) objects.set(record.edition_id, { object: record.object_path, pages: record.pages })
}
const scanned = books.filter(book => {
    let pages = []
    try { pages = pagesFor(registry, book.edition_id) || [] } catch { pages = [] }
    const withText = pages.filter(page => String(page.text || '').replace(/\s/gu, '').length > 80).length
    return objects.has(book.edition_id) && (!pages.length || withText < pages.length * 0.5)
}).filter((_, index) => index % shards === shard)

mkdirSync(OUT, { recursive: true })
console.log(`scanned books in shard ${shard}/${shards}: ${scanned.length}`)
for (const book of scanned) {
    const out = path.join(OUT, `${book.edition_id}.jsonl`)
    const done = new Set(existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line).pdf_page) : [])
    const pdf = path.join(LIBRARY, objects.get(book.edition_id).object)
    const count = objects.get(book.edition_id).pages
    for (let first = 1; first <= count; first += CHUNK) {
        const last = Math.min(count, first + CHUNK - 1)
        const wanted = []
        for (let page = first; page <= last; page += 1) if (!done.has(page)) wanted.push(page)
        if (!wanted.length) continue
        const dir = mkdtempSync(path.join(tmpdir(), 'kebiao-ocr-'))
        try {
            execFileSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pnggray', '-r130', `-dFirstPage=${first}`, `-dLastPage=${last}`, `-sOutputFile=${dir}/page-%03d.png`, pdf])
            const images = readdirSync(dir).filter(name => name.endsWith('.png')).sort()
            const rows = execFileSync(BIN, images.map(name => path.join(dir, name)), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
                .split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line))
            for (const row of rows) {
                const page = first + Number(path.basename(row.file).match(/(\d+)/u)[1]) - 1
                if (done.has(page)) continue
                appendFileSync(out, `${JSON.stringify({ pdf_page: page, text: row.text || '' })}\n`)
                done.add(page)
            }
        } finally {
            rmSync(dir, { recursive: true, force: true })
        }
    }
    console.log(`${book.textbook_title} ${book.edition_id}: ${done.size}/${count} pages`)
}
