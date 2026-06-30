#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { getSubjectConfig, GRADE_BAND } from './config.js'

function parseArgs(argv) {
  const args = { inputs: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--input') {
      args.inputs.push(argv[++i])
    } else if (item === '--input-dir') {
      args.inputDir = argv[++i]
    } else if (item === '--out-dir') {
      args.outDir = argv[++i]
    }
  }
  return args
}

function collectInputs(args) {
  const files = [...args.inputs]
  if (args.inputDir) {
    for (const file of readdirSync(args.inputDir)) {
      if (file.endsWith('.json')) files.push(join(args.inputDir, file))
    }
  }
  return files
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.outDir || (!args.inputs.length && !args.inputDir)) {
    console.log('Usage: node scripts/grade7_9/build_by_subject.js --input-dir staging/mapped --out-dir generated/grade7_9/by_subject')
    process.exit(1)
  }
  if (!existsSync(args.outDir)) mkdirSync(args.outDir, { recursive: true })
  const grouped = new Map()
  for (const file of collectInputs(args)) {
    const payload = JSON.parse(readFileSync(file, 'utf8'))
    const standards = payload.standards || []
    const subjectSlug = payload.subject_slug || standards[0]?.subject_slug || basename(file, '.json')
    if (!grouped.has(subjectSlug)) grouped.set(subjectSlug, [])
    grouped.get(subjectSlug).push(...standards)
  }
  for (const [subjectSlug, standards] of grouped) {
    const config = getSubjectConfig(subjectSlug)
    const output = {
      subject: config.subject,
      subject_slug: subjectSlug,
      grade_band: GRADE_BAND,
      grade_range: '7-9',
      standards: standards.sort((a, b) => a.code.localeCompare(b.code))
    }
    const path = join(args.outDir, `${subjectSlug}.json`)
    writeFileSync(path, `${JSON.stringify(output, null, 2)}\n`)
    console.log(`Wrote ${path} (${standards.length} standards)`)
  }
}

main()
