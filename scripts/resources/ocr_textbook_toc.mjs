// For textbooks whose PDF has no text layer, reads pages 2–14 (cover matter and 目录) with Vision OCR into
// generated/smartedu/toc-ocr/<edition>.txt, so fetch_smartedu_lessons.mjs can tell which 国家平台 edition they are.
// Needs Ghostscript (gs), Swift and the textbook drive. Only books the last match left 'not_found' are read.
//   node scripts/resources/ocr_textbook_toc.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const LIBRARY = '/Volumes/X9 Pro/kebiao-library'
const OUT = path.join(ROOT, 'generated/smartedu/toc-ocr')
const GENERATIONS = path.join(ROOT, 'data/textbooks/library-state/generations')
const registry = path.join(GENERATIONS, readdirSync(GENERATIONS).sort().pop(), 'asset_registry.lock.jsonl')
const index = JSON.parse(readFileSync(path.join(ROOT, 'data/textbooks/smartedu/index.json'), 'utf8')).editions
const wanted = new Set(Object.entries(index).filter(([, item]) => item.status === 'not_found').map(([edition]) => edition))
const objects = new Map()
for (const line of readFileSync(registry, 'utf8').split('\n').filter(Boolean)) {
    const record = JSON.parse(line)
    if (wanted.has(record.edition_id) && !objects.has(record.edition_id)) objects.set(record.edition_id, record.object_path)
}
mkdirSync(OUT, { recursive: true })
for (const [edition, object] of objects) {
    const out = path.join(OUT, `${edition}.txt`)
    if (existsSync(out)) continue
    const dir = mkdtempSync(path.join(tmpdir(), 'kebiao-toc-'))
    try {
        execFileSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pnggray', '-r110', '-dFirstPage=2', '-dLastPage=14', `-sOutputFile=${dir}/page-%02d.png`, path.join(LIBRARY, object)])
        const images = readdirSync(dir).filter(name => name.endsWith('.png')).sort().map(name => path.join(dir, name))
        const rows = execFileSync('swift', [path.join(ROOT, 'scripts/grade7_9/vision_ocr.swift'), ...images], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
            .split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line).text || '')
        writeFileSync(out, rows.join('\n'))
        console.log(`${edition}: ${rows.length} pages, ${rows.join('').length} characters`)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
}
