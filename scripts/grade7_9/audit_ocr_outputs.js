#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

function parseArgs(argv) {
  const args = {
    ocrDir: 'generated/grade7_9/ocr_text',
    out: 'generated/grade7_9/ocr_audit.json',
    emptyThreshold: 20
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--ocr-dir') args.ocrDir = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--empty-threshold') args.emptyThreshold = Number(argv[++i])
  }
  return args
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!existsSync(args.ocrDir)) throw new Error(`OCR dir not found: ${args.ocrDir}`)
  const files = readdirSync(args.ocrDir)
    .filter(file => file.endsWith('.ocr.json'))
    .sort()
  const rows = files.map(file => {
    const path = join(args.ocrDir, file)
    const payload = JSON.parse(readFileSync(path, 'utf8'))
    const pages = payload.pages || []
    return {
      subject_slug: payload.subject_slug,
      subject: payload.subject,
      source_file: payload.source_file,
      text_file: payload.text_file,
      pages: pages.length,
      total_pages: payload.total_pages,
      chars: pages.reduce((sum, page) => sum + (page.chars || 0), 0),
      error_pages: pages.filter(page => page.error).map(page => page.page),
      low_text_pages: pages.filter(page => (page.chars || 0) < args.emptyThreshold).map(page => page.page),
      complete: payload.complete === true && pages.length === payload.total_pages
    }
  })
  const summary = {
    generated_at: new Date().toISOString(),
    ocr_dir: args.ocrDir,
    subjects: rows.length,
    pages: rows.reduce((sum, row) => sum + row.pages, 0),
    chars: rows.reduce((sum, row) => sum + row.chars, 0),
    error_pages: rows.reduce((sum, row) => sum + row.error_pages.length, 0),
    low_text_pages: rows.reduce((sum, row) => sum + row.low_text_pages.length, 0)
  }
  const output = { summary, files: rows }
  if (!existsSync(dirname(args.out))) mkdirSync(dirname(args.out), { recursive: true })
  writeFileSync(args.out, `${JSON.stringify(output, null, 2)}\n`)
  console.log(JSON.stringify(output, null, 2))
}

main()
