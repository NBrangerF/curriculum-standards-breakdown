#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function parseArgs(argv) {
  const args = {
    ocrDir: 'generated/grade7_9/ocr_text',
    markers: 'generated/grade7_9/junior_markers.json',
    rangesFile: '',
    outDir: 'generated/grade7_9/review_packs',
    contextPages: 0,
    subjects: []
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--ocr-dir') args.ocrDir = argv[++i]
    else if (item === '--markers') args.markers = argv[++i]
    else if (item === '--ranges-file') args.rangesFile = argv[++i]
    else if (item === '--out-dir') args.outDir = argv[++i]
    else if (item === '--context-pages') args.contextPages = Number(argv[++i])
    else if (item === '--subjects') args.subjects = argv[++i].split(',').map(s => s.trim()).filter(Boolean)
  }
  return args
}

function pageWindow(page, totalPages, contextPages) {
  const pages = []
  for (let value = Math.max(1, page - contextPages); value <= Math.min(totalPages, page + contextPages); value += 1) {
    pages.push(value)
  }
  return pages
}

function markdownForPack(pack) {
  const lines = [
    `# ${pack.subject} 7-9 OCR 复核包`,
    '',
    `source_file: ${pack.source_file}`,
    `subject_slug: ${pack.subject_slug}`,
    `pages_in_pack: ${pack.pages.length}`,
    `marker_matches: ${pack.matches.length}`,
    `range_groups: ${pack.ranges.length}`,
    '',
    '## 标记命中',
    ''
  ]
  for (const match of pack.matches) {
    lines.push(`- p.${match.page} \`${match.pattern}\`: ${match.snippet}`)
  }
  if (pack.ranges.length) {
    lines.push('', '## 页码范围', '')
    for (const range of pack.ranges) {
      lines.push(`- ${range.label}: ${range.pages.join(', ')}`)
    }
  }
  lines.push('', '## 页面文本', '')
  for (const page of pack.pages) {
    lines.push(`### Page ${String(page.page).padStart(3, '0')}`, '')
    lines.push(page.text || '')
    lines.push('')
  }
  return `${lines.join('\n').trim()}\n`
}

function expandRange(range, totalPages) {
  if (Array.isArray(range.pages)) {
    return range.pages
      .map(Number)
      .filter(page => Number.isInteger(page) && page >= 1 && page <= totalPages)
  }
  const value = String(range.range || '').trim()
  const match = value.match(/^(\d+)\s*-\s*(\d+)$/)
  if (!match) return []
  const start = Number(match[1])
  const end = Number(match[2])
  const pages = []
  for (let page = Math.max(1, start); page <= Math.min(totalPages, end); page += 1) {
    pages.push(page)
  }
  return pages
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!existsSync(args.ocrDir)) throw new Error(`OCR dir not found: ${args.ocrDir}`)
  if (!existsSync(args.markers)) throw new Error(`Markers file not found: ${args.markers}`)
  const rangesBySubject = args.rangesFile && existsSync(args.rangesFile)
    ? JSON.parse(readFileSync(args.rangesFile, 'utf8'))
    : {}
  if (!existsSync(args.outDir)) mkdirSync(args.outDir, { recursive: true })
  const markers = JSON.parse(readFileSync(args.markers, 'utf8'))
  const wanted = args.subjects.length ? new Set(args.subjects) : null
  const rows = []
  for (const file of readdirSync(args.ocrDir).filter(name => name.endsWith('.ocr.json')).sort()) {
    const ocr = JSON.parse(readFileSync(join(args.ocrDir, file), 'utf8'))
    if (wanted && !wanted.has(ocr.subject_slug)) continue
    const matches = (markers.matches || []).filter(match => match.subject_slug === ocr.subject_slug)
    const configuredRanges = rangesBySubject[ocr.subject_slug] || []
    const pageSet = new Set()
    for (const match of matches) {
      pageWindow(match.page, ocr.total_pages, args.contextPages).forEach(page => pageSet.add(page))
    }
    const ranges = configuredRanges.map(range => ({
      label: range.label || range.range || 'range',
      pages: expandRange(range, ocr.total_pages)
    }))
    ranges.forEach(range => range.pages.forEach(page => pageSet.add(page)))
    const wantedPages = Array.from(pageSet).sort((a, b) => a - b)
    const pages = wantedPages
      .map(pageNumber => (ocr.pages || []).find(page => page.page === pageNumber))
      .filter(Boolean)
      .map(page => ({ page: page.page, chars: page.chars, text: page.text }))
    const pack = {
      generated_at: new Date().toISOString(),
      source_file: ocr.source_file,
      subject_slug: ocr.subject_slug,
      subject: ocr.subject,
      context_pages: args.contextPages,
      matches,
      ranges,
      pages
    }
    const base = join(args.outDir, `${ocr.subject_slug}.junior_review`)
    writeFileSync(`${base}.json`, `${JSON.stringify(pack, null, 2)}\n`)
    writeFileSync(`${base}.md`, markdownForPack(pack))
    rows.push({
      subject_slug: ocr.subject_slug,
      subject: ocr.subject,
      matches: matches.length,
      ranges: ranges.length,
      pages: pages.length,
      md: `${base}.md`,
      json: `${base}.json`
    })
  }
  console.log(JSON.stringify({ review_packs: rows }, null, 2))
}

main()
