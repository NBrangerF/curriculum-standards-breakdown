#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_PATTERNS = [
  '第四学段',
  '7~9',
  '7～9',
  '7-9',
  '7—9',
  '七年级',
  '八年级',
  '九年级',
  '水平四',
  '三级',
  '8~9',
  '8～9',
  '6~7',
  '6～7'
]

function parseArgs(argv) {
  const args = {
    ocrDir: 'generated/grade7_9/ocr_text',
    out: 'generated/grade7_9/junior_markers.json',
    context: 45,
    patterns: DEFAULT_PATTERNS
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--ocr-dir') args.ocrDir = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--context') args.context = Number(argv[++i])
    else if (item === '--patterns') args.patterns = argv[++i].split(',').map(s => s.trim()).filter(Boolean)
  }
  return args
}

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function findMatches(text, patterns, context) {
  const compactText = compact(text)
  const matches = []
  for (const pattern of patterns) {
    let index = compactText.indexOf(pattern)
    while (index !== -1) {
      const start = Math.max(0, index - context)
      const end = Math.min(compactText.length, index + pattern.length + context)
      matches.push({
        pattern,
        snippet: compactText.slice(start, end)
      })
      index = compactText.indexOf(pattern, index + pattern.length)
    }
  }
  return matches
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!existsSync(args.ocrDir)) throw new Error(`OCR dir not found: ${args.ocrDir}`)
  const files = readdirSync(args.ocrDir)
    .filter(file => file.endsWith('.ocr.json'))
    .sort()
  const rows = []
  for (const file of files) {
    const payload = JSON.parse(readFileSync(join(args.ocrDir, file), 'utf8'))
    for (const page of payload.pages || []) {
      const matches = findMatches(page.text, args.patterns, args.context)
      for (const match of matches) {
        rows.push({
          subject_slug: payload.subject_slug,
          subject: payload.subject,
          page: page.page,
          pattern: match.pattern,
          snippet: match.snippet
        })
      }
    }
  }
  const bySubject = {}
  for (const row of rows) {
    bySubject[row.subject_slug] ||= { subject: row.subject, matches: 0, pages: new Set(), patterns: {} }
    bySubject[row.subject_slug].matches += 1
    bySubject[row.subject_slug].pages.add(row.page)
    bySubject[row.subject_slug].patterns[row.pattern] = (bySubject[row.subject_slug].patterns[row.pattern] || 0) + 1
  }
  const summary = Object.fromEntries(Object.entries(bySubject).map(([slug, value]) => [slug, {
    subject: value.subject,
    matches: value.matches,
    pages: Array.from(value.pages).sort((a, b) => a - b),
    patterns: value.patterns
  }]))
  const output = {
    generated_at: new Date().toISOString(),
    ocr_dir: args.ocrDir,
    patterns: args.patterns,
    summary,
    matches: rows
  }
  if (!existsSync(dirname(args.out))) mkdirSync(dirname(args.out), { recursive: true })
  writeFileSync(args.out, `${JSON.stringify(output, null, 2)}\n`)
  console.log(JSON.stringify({
    generated_at: output.generated_at,
    subjects: Object.keys(summary).length,
    matches: rows.length,
    summary
  }, null, 2))
}

main()
