#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function parseArgs(argv) {
  const args = {
    manifest: 'scripts/grade7_9/source_manifest.json',
    sourcesDir: 'raw/grade7_9/sources',
    outDir: 'generated/grade7_9/raw',
    subjects: []
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--manifest') args.manifest = argv[++i]
    else if (item === '--sources-dir') args.sourcesDir = argv[++i]
    else if (item === '--out-dir') args.outDir = argv[++i]
    else if (item === '--subjects') args.subjects = argv[++i].split(',').map(s => s.trim()).filter(Boolean)
  }
  return args
}

function findSourcePdf(sourcesDir, subjectSlug) {
  const candidates = readdirSync(sourcesDir)
    .filter(file => file.startsWith(`${subjectSlug}-`) && file.endsWith('.pdf'))
    .map(file => join(sourcesDir, file))
  if (!candidates.length) throw new Error(`No source PDF found for ${subjectSlug} in ${sourcesDir}`)
  return candidates[0]
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const manifest = JSON.parse(readFileSync(args.manifest, 'utf8'))
  if (!existsSync(args.outDir)) mkdirSync(args.outDir, { recursive: true })
  const wanted = args.subjects.length ? new Set(args.subjects) : null
  const rows = []
  for (const subjectSlug of Object.keys(manifest.subjects)) {
    if (wanted && !wanted.has(subjectSlug)) continue
    const input = findSourcePdf(args.sourcesDir, subjectSlug)
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
    rows.push({ subject_slug: subjectSlug, input, out })
  }
  console.log(JSON.stringify({ extracted: rows }, null, 2))
}

main()
