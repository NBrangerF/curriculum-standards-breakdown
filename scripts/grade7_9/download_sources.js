#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

function parseArgs(argv) {
  const args = {
    manifest: 'scripts/grade7_9/source_manifest.json',
    outDir: 'raw/grade7_9/sources',
    subjects: []
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--manifest') args.manifest = argv[++i]
    else if (item === '--out-dir') args.outDir = argv[++i]
    else if (item === '--subjects') args.subjects = argv[++i].split(',').map(s => s.trim()).filter(Boolean)
    else if (item === '--force') args.force = true
  }
  return args
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const manifest = JSON.parse(readFileSync(args.manifest, 'utf8'))
  if (!existsSync(args.outDir)) mkdirSync(args.outDir, { recursive: true })
  const wanted = args.subjects.length ? new Set(args.subjects) : null
  const result = {
    source_page: manifest.source_page,
    downloaded_at: new Date().toISOString(),
    files: []
  }
  for (const [slug, info] of Object.entries(manifest.subjects)) {
    if (wanted && !wanted.has(slug)) continue
    const fileName = `${slug}-${basename(new URL(info.url).pathname)}`
    const output = join(args.outDir, fileName)
    if (!existsSync(output) || args.force) {
      execFileSync('curl', ['-L', '--fail', '--silent', '--show-error', '-o', output, info.url], { stdio: 'inherit' })
    }
    result.files.push({
      subject_slug: slug,
      subject: info.subject,
      url: info.url,
      file: output,
      bytes: statSync(output).size
    })
    console.log(`${slug}: ${output}`)
  }
  const summaryPath = join(args.outDir, 'download_summary.json')
  writeFileSync(summaryPath, `${JSON.stringify(result, null, 2)}\n`)
  console.log(`Wrote ${summaryPath}`)
}

main()
