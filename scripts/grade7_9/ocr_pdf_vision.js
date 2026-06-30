#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PDFTOPPM = '/Users/shawn.fsc/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/pdftoppm'
const PDFINFO = '/Users/shawn.fsc/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/pdfinfo'

function parseArgs(argv) {
  const args = {
    manifest: 'scripts/grade7_9/source_manifest.json',
    sourcesDir: 'raw/grade7_9/sources',
    outDir: 'generated/grade7_9/ocr_text',
    dpi: 200,
    batchSize: 12,
    languages: 'zh-Hans,en-US',
    subjects: [],
    input: '',
    out: '',
    fromPage: 1,
    toPage: null,
    maxPages: null,
    keepImages: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--manifest') args.manifest = argv[++i]
    else if (item === '--sources-dir') args.sourcesDir = argv[++i]
    else if (item === '--out-dir') args.outDir = argv[++i]
    else if (item === '--subjects') args.subjects = argv[++i].split(',').map(s => s.trim()).filter(Boolean)
    else if (item === '--input') args.input = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--from-page') args.fromPage = Number(argv[++i])
    else if (item === '--to-page') args.toPage = Number(argv[++i])
    else if (item === '--max-pages') args.maxPages = Number(argv[++i])
    else if (item === '--dpi') args.dpi = Number(argv[++i])
    else if (item === '--batch-size') args.batchSize = Number(argv[++i])
    else if (item === '--languages') args.languages = argv[++i]
    else if (item === '--keep-images') args.keepImages = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
npm run grade7_9:ocr -- --subjects chinese --max-pages 5
npm run grade7_9:ocr -- --input raw/grade7_9/sources/chinese.pdf --out generated/grade7_9/ocr_text/chinese.ocr.txt

Notes:
- macOS only: uses Apple Vision through Swift.
- Outputs a .ocr.txt file for extraction and a sibling .ocr.json page audit.
- Renders and recognizes pages in batches; tune with --batch-size.
- Keep outputs in generated/ until manual review is complete.`)
}

function pageCount(pdfFile) {
  const output = execFileSync(PDFINFO, [pdfFile], { encoding: 'utf8' })
  const match = output.match(/^Pages:\s+(\d+)/m)
  if (!match) throw new Error(`Unable to read page count from ${pdfFile}`)
  return Number(match[1])
}

function compileWorker() {
  const toolsDir = 'generated/grade7_9/.tools'
  if (!existsSync(toolsDir)) mkdirSync(toolsDir, { recursive: true })
  const source = join(SCRIPT_DIR, 'vision_ocr.swift')
  const binary = join(toolsDir, 'vision_ocr')
  const needsBuild = !existsSync(binary) || statSync(source).mtimeMs > statSync(binary).mtimeMs
  if (needsBuild) {
    execFileSync('swiftc', [source, '-O', '-o', binary], { stdio: 'inherit' })
  }
  return binary
}

function renderPage(pdfFile, page, tempDir, dpi) {
  const prefix = join(tempDir, `page_${String(page).padStart(4, '0')}`)
  execFileSync(PDFTOPPM, [
    '-f', String(page),
    '-l', String(page),
    '-singlefile',
    '-r', String(dpi),
    '-png',
    pdfFile,
    prefix
  ], { stdio: 'pipe' })
  const image = `${prefix}.png`
  if (!existsSync(image)) throw new Error(`Rendered image not found for page ${page}: ${image}`)
  return image
}

function runWorkerBatch(worker, images, languages) {
  const result = spawnSync(worker, ['--languages', languages, ...images], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64
  })
  if (result.status !== 0) {
    throw new Error(`Vision OCR failed: ${result.stderr || result.stdout}`)
  }
  const rows = result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  const byFile = new Map(rows.map(row => [row.file, row]))
  return images.map(image => byFile.get(image) || { file: image, text: '', error: 'empty OCR output' })
}

function writeOcrOutputs({ out, input, subjectSlug, subject, languages, totalPages, first, last, pages, partial }) {
  const header = [
    `source_file: ${input}`,
    subjectSlug ? `subject_slug: ${subjectSlug}` : null,
    subject ? `subject: ${subject}` : null,
    `ocr_tool: apple_vision`,
    `ocr_languages: ${languages}`,
    `page_range: ${first}-${last} of ${totalPages}`,
    ''
  ].filter(Boolean).join('\n')
  const body = pages
    .map(row => [`[[PAGE ${String(row.page).padStart(3, '0')}]]`, row.text].join('\n'))
    .join('\n\n')
  const textPath = partial ? `${out}.partial` : out
  const jsonPath = partial ? `${out.replace(/\.txt$/i, '.json')}.partial` : out.replace(/\.txt$/i, '.json')
  writeFileSync(textPath, `${header}\n${body}\n`)
  writeFileSync(jsonPath, `${JSON.stringify({
    source_file: input,
    subject_slug: subjectSlug || '',
    subject: subject || '',
    ocr_tool: 'apple_vision',
    ocr_languages: languages.split(','),
    generated_at: new Date().toISOString(),
    total_pages: totalPages,
    page_range: [first, last],
    text_file: out,
    complete: !partial && pages.length === last - first + 1,
    pages
  }, null, 2)}\n`)
}

function ocrPdf({ subjectSlug, subject, input, out, dpi, batchSize, languages, fromPage, toPage, maxPages, keepImages }) {
  if (!existsSync(input)) throw new Error(`Input PDF not found: ${input}`)
  if (!existsSync(dirname(out))) mkdirSync(dirname(out), { recursive: true })
  const worker = compileWorker()
  const totalPages = pageCount(input)
  const first = Math.max(1, fromPage || 1)
  const requestedLast = toPage || totalPages
  const last = Math.min(totalPages, maxPages ? first + maxPages - 1 : requestedLast)
  const tempDir = keepImages
    ? join('generated/grade7_9/ocr_pages', subjectSlug || basename(input, '.pdf'))
    : mkdtempSync(join(tmpdir(), 'grade7-9-ocr-'))
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })

  const pages = []
  try {
    for (let batchStart = first; batchStart <= last; batchStart += batchSize) {
      const batchEnd = Math.min(last, batchStart + batchSize - 1)
      const rendered = []
      for (let page = batchStart; page <= batchEnd; page += 1) {
        const image = renderPage(input, page, tempDir, dpi)
        rendered.push({ page, image })
      }
      const rows = runWorkerBatch(worker, rendered.map(row => row.image), languages)
      rows.forEach((row, index) => {
        pages.push({
          page: rendered[index].page,
          text: row.text || '',
          chars: (row.text || '').trim().length,
          error: row.error || null
        })
      })
      const batchChars = rows.reduce((sum, row) => sum + (row.text || '').trim().length, 0)
      console.log(`${subjectSlug || basename(input)} pages ${batchStart}-${batchEnd}/${last}: ${batchChars} chars`)
      writeOcrOutputs({ out, input, subjectSlug, subject, languages, totalPages, first, last, pages, partial: true })
      if (!keepImages) rendered.forEach(row => unlinkSync(row.image))
    }
  } finally {
    if (!keepImages) rmSync(tempDir, { recursive: true, force: true })
  }

  writeOcrOutputs({ out, input, subjectSlug, subject, languages, totalPages, first, last, pages, partial: false })
  const partialText = `${out}.partial`
  const partialJson = `${out.replace(/\.txt$/i, '.json')}.partial`
  if (existsSync(partialText)) unlinkSync(partialText)
  if (existsSync(partialJson)) unlinkSync(partialJson)
  return { out, pages: pages.length, chars: pages.reduce((sum, row) => sum + row.chars, 0) }
}

function findSourcePdf(sourcesDir, subjectSlug) {
  const candidates = readdirSync(sourcesDir)
    .filter(file => file.startsWith(`${subjectSlug}-`) && file.endsWith('.pdf'))
    .sort()
  if (!candidates.length) throw new Error(`No source PDF found for ${subjectSlug} in ${sourcesDir}`)
  return join(sourcesDir, candidates[0])
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    return
  }
  const rows = []
  if (args.input) {
      rows.push(ocrPdf({
        input: args.input,
        out: args.out || join(args.outDir, `${basename(args.input, '.pdf')}.ocr.txt`),
        dpi: args.dpi,
        batchSize: args.batchSize,
        languages: args.languages,
      fromPage: args.fromPage,
      toPage: args.toPage,
      maxPages: args.maxPages,
      keepImages: args.keepImages
    }))
  } else {
    const manifest = JSON.parse(readFileSync(args.manifest, 'utf8'))
    const wanted = args.subjects.length ? new Set(args.subjects) : null
    for (const [subjectSlug, info] of Object.entries(manifest.subjects)) {
      if (wanted && !wanted.has(subjectSlug)) continue
      const input = findSourcePdf(args.sourcesDir, subjectSlug)
      const out = join(args.outDir, `${subjectSlug}.ocr.txt`)
      rows.push(ocrPdf({
        subjectSlug,
        subject: info.subject,
        input,
        out,
        dpi: args.dpi,
        batchSize: args.batchSize,
        languages: args.languages,
        fromPage: args.fromPage,
        toPage: args.toPage,
        maxPages: args.maxPages,
        keepImages: args.keepImages
      }))
    }
  }
  console.log(JSON.stringify({ ocr: rows }, null, 2))
}

main()
