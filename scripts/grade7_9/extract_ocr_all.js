#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function parseArgs(argv) {
  const args = {
    manifest: 'scripts/grade7_9/source_manifest.json',
    ocrDir: 'generated/grade7_9/ocr_text',
    outDir: 'generated/grade7_9/raw_ocr',
    subjects: []
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--manifest') args.manifest = argv[++i]
    else if (item === '--ocr-dir') args.ocrDir = argv[++i]
    else if (item === '--out-dir') args.outDir = argv[++i]
    else if (item === '--subjects') args.subjects = argv[++i].split(',').map(s => s.trim()).filter(Boolean)
  }
  return args
}

function summarizeRaw(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  return {
    extraction_status: raw.extraction_status,
    sections: (raw.sections || []).length,
    candidate_items: (raw.sections || []).reduce((sum, section) => sum + (section.candidate_items || []).length, 0),
    section_titles: (raw.sections || []).map(section => section.title)
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const manifest = JSON.parse(readFileSync(args.manifest, 'utf8'))
  if (!existsSync(args.outDir)) mkdirSync(args.outDir, { recursive: true })
  const wanted = args.subjects.length ? new Set(args.subjects) : null
  const rows = []
  for (const [subjectSlug, info] of Object.entries(manifest.subjects)) {
    if (wanted && !wanted.has(subjectSlug)) continue
    const input = join(args.ocrDir, `${subjectSlug}.ocr.txt`)
    if (!existsSync(input)) throw new Error(`OCR text not found for ${subjectSlug}: ${input}`)
    const out = join(args.outDir, `${subjectSlug}.raw.json`)
    execFileSync(process.execPath, [
      'scripts/grade7_9/extract_subject.js',
      '--subject',
      subjectSlug,
      '--input',
      input,
      '--out',
      out
    ], { stdio: 'inherit' })
    rows.push({
      subject_slug: subjectSlug,
      subject: info.subject,
      input,
      out,
      ...summarizeRaw(out)
    })
  }
  console.log(JSON.stringify({ extracted: rows }, null, 2))
}

main()
