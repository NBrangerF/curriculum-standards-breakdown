#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { getSubjectConfig } from './config.js'

const SECTION_TITLES = [
  '课程性质',
  '课程理念',
  '课程目标',
  '课程内容',
  '学业质量',
  '课程实施',
  '教学建议',
  '评价建议'
]

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    if (!key.startsWith('--')) continue
    const name = key.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      args[name] = true
    } else {
      args[name] = next
      i += 1
    }
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/extract_subject.js --subject chinese --input raw.pdf --out raw/chinese.raw.json
node scripts/grade7_9/extract_subject.js --subject math --input raw.md --out raw/math.raw.json

Notes:
- .md/.txt are read directly.
- .pdf uses local pdftotext if available.
- Output is raw section JSON; manual review is still required before normalization.`)
}

function readInput(input) {
  if (!input) throw new Error('--input is required')
  if (/^https?:\/\//.test(input)) {
    const tmp = mkdtempSync(join(tmpdir(), 'grade7-9-'))
    const file = join(tmp, basename(new URL(input).pathname) || 'source.pdf')
    execFileSync('curl', ['-L', '--fail', '--silent', '--show-error', '-o', file, input], { stdio: 'inherit' })
    try {
      return readLocalFileWithMeta(file, input)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }
  return readLocalFileWithMeta(input, resolve(input))
}

function readLocalFileWithMeta(input, sourceFile) {
  const { text, extractionStatus, extractionTool, extractionWarnings } = readLocalFile(input)
  return { text, sourceFile, extractionStatus, extractionTool, extractionWarnings }
}

function readLocalFile(input) {
  if (!existsSync(input)) throw new Error(`Input file not found: ${input}`)
  const ext = extname(input).toLowerCase()
  if (ext === '.md' || ext === '.txt') {
    return { text: readFileSync(input, 'utf8'), extractionStatus: 'ok', extractionTool: 'plain-text', extractionWarnings: [] }
  }
  if (ext === '.json') {
    return { text: JSON.stringify(JSON.parse(readFileSync(input, 'utf8')), null, 2), extractionStatus: 'ok', extractionTool: 'json-stringify', extractionWarnings: [] }
  }
  if (ext === '.pdf') {
    try {
      const text = execFileSync('pdftotext', ['-layout', input, '-'], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 })
      return pdfExtractionResult(text, 'pdftotext')
    } catch (error) {
      return extractPdfWithPython(input)
    }
  }
  throw new Error(`Unsupported input type: ${ext}`)
}

function pythonCandidates() {
  return [
    process.env.PYTHON,
    process.env.CODEX_PYTHON,
    '/Users/shawn.fsc/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',
    'python3'
  ].filter(Boolean)
}

function extractPdfWithPython(input) {
  const script = String.raw`
import sys
path = sys.argv[1]
try:
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text(layout=True) or page.extract_text() or ""
            print(text)
    raise SystemExit(0)
except Exception:
    pass
try:
    from pypdf import PdfReader
    reader = PdfReader(path)
    for page in reader.pages:
        print(page.extract_text() or "")
    raise SystemExit(0)
except Exception as exc:
    print(f"PDF extraction failed: {exc}", file=sys.stderr)
    raise SystemExit(2)
`
  for (const python of pythonCandidates()) {
    const result = spawnSync(python, ['-c', script, input], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 128
    })
    if (result.status === 0) return pdfExtractionResult(result.stdout, python)
  }
  return {
    text: '',
    extractionStatus: 'requires_ocr',
    extractionTool: 'none',
    extractionWarnings: ['PDF text layer could not be extracted. The file is likely scanned/image-based and requires OCR.']
  }
}

function pdfExtractionResult(text, tool) {
  const trimmed = (text || '').trim()
  if (trimmed.length < 100) {
    return {
      text: text || '',
      extractionStatus: 'requires_ocr',
      extractionTool: tool,
      extractionWarnings: ['Extracted text is too short; PDF likely has no usable text layer and requires OCR.']
    }
  }
  return { text, extractionStatus: 'ok', extractionTool: tool, extractionWarnings: [] }
}

function normalizeLineEntries(text) {
  let currentPage = null
  const entries = []
  text
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .forEach(line => {
      if (!line) return
      const pageMatch = line.match(/^\[\[PAGE\s+(\d+)\]\]$/)
      if (pageMatch) {
        currentPage = Number(pageMatch[1])
        return
      }
      entries.push({ text: line, page: currentPage })
    })
  return entries
}

function isSectionTitle(line) {
  const clean = line.replace(/\s/g, '')
  return SECTION_TITLES.find(title => clean.includes(title))
}

function splitSections(text) {
  const entries = normalizeLineEntries(text)
  const sections = []
  let current = { title: '未归类', entries: [] }
  for (const entry of entries) {
    const title = isSectionTitle(entry.text)
    if (title && current.entries.length) {
      sections.push(current)
      current = { title, entries: [entry] }
    } else if (title && current.title === '未归类' && current.entries.length === 0) {
      current = { title, entries: [entry] }
    } else {
      current.entries.push(entry)
    }
  }
  if (current.entries.length) sections.push(current)
  return sections.map(section => {
    const candidateRefs = extractCandidateItemRefs(section.title, section.entries)
    return {
      title: section.title,
      text: section.entries.map(entry => entry.text).join('\n'),
      source_pages: uniquePages(section.entries),
      candidate_items: candidateRefs.map(item => item.text),
      candidate_item_refs: candidateRefs
    }
  })
}

function uniquePages(entries) {
  return Array.from(new Set(entries.map(entry => entry.page).filter(page => Number.isInteger(page)))).sort((a, b) => a - b)
}

function extractCandidateItemRefs(title, entries) {
  if (!['课程目标', '课程内容', '学业质量', '课程实施', '教学建议', '评价建议'].includes(title)) return []
  const items = []
  let buffer = []
  const bullet = /^([（(]?\d+[）).、]|[一二三四五六七八九十]+[、.．]|[-•·])\s*/
  for (const entry of entries) {
    if (bullet.test(entry.text) && buffer.length) {
      items.push(buffer)
      buffer = [{ text: entry.text.replace(bullet, ''), page: entry.page }]
    } else {
      buffer.push({ text: entry.text.replace(bullet, ''), page: entry.page })
    }
  }
  if (buffer.length) items.push(buffer)
  return items
    .map(itemEntries => ({
      text: itemEntries.map(entry => entry.text).join('').trim(),
      source_pages: uniquePages(itemEntries)
    }))
    .filter(item => item.text.length >= 12)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    return
  }
  if (!args.subject || !args.input || !args.out) {
    usage()
    process.exit(1)
  }
  const subjectConfig = getSubjectConfig(args.subject)
  const { text, sourceFile, extractionStatus, extractionTool, extractionWarnings } = readInput(args.input)
  const output = {
    source_file: sourceFile,
    source_type: extname(sourceFile).replace('.', '') || 'url',
    source_standard: '义务教育课程标准（2022年版）',
    subject: subjectConfig.subject,
    subject_slug: args.subject,
    grade_scope: '7-9',
    extraction_status: extractionStatus,
    extraction_tool: extractionTool,
    extraction_notes: [
      '自动章节切分结果需要人工复核。',
      '7-9 年级合并表述需要在 normalize_schema 阶段进一步拆分为七/八/九年级。',
      ...extractionWarnings
    ],
    sections: splitSections(text)
  }
  if (!existsSync(dirname(args.out))) mkdirSync(dirname(args.out), { recursive: true })
  writeFileSync(args.out, `${JSON.stringify(output, null, 2)}\n`)
  console.log(`Wrote ${args.out}`)
}

main()
