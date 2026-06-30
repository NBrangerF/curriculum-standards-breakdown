#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function parseArgs(argv) {
  const args = {
    sourcesDir: 'raw/grade7_9/sources',
    out: 'generated/grade7_9/pdf_text_audit.json'
  }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--sources-dir') args.sourcesDir = argv[++i]
    else if (argv[i] === '--out') args.out = argv[++i]
  }
  return args
}

function pythonCandidates() {
  return [
    process.env.PYTHON,
    process.env.CODEX_PYTHON,
    '/Users/shawn.fsc/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',
    'python3'
  ].filter(Boolean)
}

function auditOne(file) {
  const script = String.raw`
import json, sys
path = sys.argv[1]
result = {"file": path, "pages": 0, "chars": 0, "sample": "", "tool": None, "error": None}
try:
    from pypdf import PdfReader
    reader = PdfReader(path)
    result["pages"] = len(reader.pages)
    texts = []
    for page in reader.pages:
        texts.append(page.extract_text() or "")
    text = "\n".join(texts)
    result["chars"] = len(text.strip())
    result["sample"] = text.strip()[:300]
    result["tool"] = "pypdf"
except Exception as exc:
    result["error"] = str(exc)
print(json.dumps(result, ensure_ascii=False))
`
  for (const python of pythonCandidates()) {
    const result = spawnSync(python, ['-c', script, file], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 32 })
    if (result.status === 0 && result.stdout.trim()) {
      return JSON.parse(result.stdout)
    }
  }
  return { file, pages: 0, chars: 0, sample: '', tool: 'none', error: 'no python pdf reader available' }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!existsSync(args.sourcesDir)) throw new Error(`sources dir not found: ${args.sourcesDir}`)
  const files = readdirSync(args.sourcesDir)
    .filter(file => file.endsWith('.pdf'))
    .map(file => join(args.sourcesDir, file))
    .sort()
  const rows = files.map(file => {
    const row = auditOne(file)
    row.requires_ocr = row.chars < 1000
    return row
  })
  const payload = {
    generated_at: new Date().toISOString(),
    sources_dir: args.sourcesDir,
    files: rows
  }
  writeFileSync(args.out, `${JSON.stringify(payload, null, 2)}\n`)
  console.log(JSON.stringify(payload, null, 2))
}

main()
