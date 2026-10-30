#!/usr/bin/env node
// OCR every curriculum-standard PDF of one edition with the PDFKit + Vision tool (pdf_ocr.swift).
// Usage: node scripts/sources/ocr_sources.mjs --version 2022|2025r [--subjects a,b] [--jobs 3]
// Reads raw/sources/<version>/<slug>-*.pdf, writes generated/sources/ocr/<version>/<slug>.ocr.{json,txt}.
// The .txt keeps the earlier OCR layout ([[PAGE 001]] markers) so the same parsing applies to both editions.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = { version: '', subjects: [], jobs: 3, force: false }
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--version') args.version = argv[++i]
    else if (argv[i] === '--subjects') args.subjects = argv[++i].split(',').filter(Boolean)
    else if (argv[i] === '--jobs') args.jobs = Number(argv[++i])
    else if (argv[i] === '--force') args.force = true
}
if (!['2022', '2025r'].includes(args.version)) throw new Error('--version must be 2022 or 2025r')

const TOOL = 'generated/sources/.tools/pdf_ocr'
const SOURCE = 'scripts/sources/pdf_ocr.swift'
mkdirSync('generated/sources/.tools', { recursive: true })
if (!existsSync(TOOL) || statSync(SOURCE).mtimeMs > statSync(TOOL).mtimeMs) execFileSync('swiftc', [SOURCE, '-O', '-o', TOOL], { stdio: 'inherit' })

const inDir = join('raw/sources', args.version)
const outDir = join('generated/sources/ocr', args.version)
mkdirSync(outDir, { recursive: true })
const files = readdirSync(inDir).filter(name => name.endsWith('.pdf'))
    .map(name => ({ slug: name.replace(/-[^-]+\.pdf$/u, ''), file: join(inDir, name) }))
    .filter(item => !args.subjects.length || args.subjects.includes(item.slug))
    .filter(item => args.force || !existsSync(join(outDir, `${item.slug}.ocr.json`)))

function ocr({ slug, file }) {
    return new Promise((resolve, reject) => {
        const pages = []
        let buffer = ''
        const child = spawn(TOOL, [file])
        child.stdout.on('data', chunk => {
            buffer += chunk
            let newline
            while ((newline = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, newline)
                buffer = buffer.slice(newline + 1)
                if (line.trim()) pages.push(JSON.parse(line))
            }
        })
        child.stderr.on('data', chunk => process.stderr.write(`${slug}: ${chunk}`))
        child.on('close', code => {
            if (code !== 0) return reject(new Error(`${slug}: pdf_ocr exited ${code}`))
            const meta = { source_file: file, subject_slug: slug, version: args.version, ocr_tool: 'pdfkit+apple_vision', generated_at: new Date().toISOString(), total_pages: pages.length }
            writeFileSync(join(outDir, `${slug}.ocr.json`), JSON.stringify({ ...meta, pages: pages.map(({ page, text, lines }) => ({ page, text, chars: text.length, lines })) }))
            const header = Object.entries(meta).map(([key, value]) => `${key}: ${value}`).join('\n')
            writeFileSync(join(outDir, `${slug}.ocr.txt`), `${header}\n${pages.map(({ page, text }) => `[[PAGE ${String(page).padStart(3, '0')}]]\n${text}`).join('\n\n')}\n`)
            console.log(`${slug}: ${pages.length} pages`)
            resolve()
        })
    })
}

const queue = [...files]
await Promise.all(Array.from({ length: Math.min(args.jobs, queue.length) }, async () => {
    while (queue.length) await ocr(queue.shift())
}))
console.log(`done: ${files.length} files → ${outDir}`)
