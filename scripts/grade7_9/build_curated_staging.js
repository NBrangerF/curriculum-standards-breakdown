#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const DEFAULT_CURATED_DIR = 'scripts/grade7_9/curated'
const DEFAULT_OUT_DIR = 'generated/grade7_9_all_curated'
const DEFAULT_EXISTING_DATA_ROOT = 'public/data'

function parseArgs(argv) {
  const args = {
    curatedDir: DEFAULT_CURATED_DIR,
    outDir: DEFAULT_OUT_DIR,
    existingDataRoot: DEFAULT_EXISTING_DATA_ROOT,
    clean: true,
    subjects: []
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--curated-dir') args.curatedDir = argv[++i]
    else if (item === '--out-dir') args.outDir = argv[++i]
    else if (item === '--existing-data-root') args.existingDataRoot = argv[++i]
    else if (item === '--subjects') args.subjects.push(...String(argv[++i] || '').split(',').filter(Boolean))
    else if (item === '--subject') args.subjects.push(argv[++i])
    else if (item === '--no-clean') args.clean = false
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/build_curated_staging.js [--out-dir generated/grade7_9_all_curated] [--subjects chinese,math]

Builds curated 7-9 staging data from scripts/grade7_9/curated/*_h3_raw.json:
1. normalize_schema
2. map_ts
3. build_by_subject
4. generate_manifest
5. validate_schema --staging-root
6. audit_grade_split`)
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(' ')}`)
  }
}

function curatedFiles(curatedDir, subjects) {
  const requested = new Set(subjects)
  const files = readdirSync(curatedDir)
    .filter(file => file.endsWith('_h3_raw.json'))
    .map(file => {
      const subjectSlug = basename(file, '_h3_raw.json')
      return { subjectSlug, file: join(curatedDir, file) }
    })
    .filter(item => !requested.size || requested.has(item.subjectSlug))
    .sort((a, b) => a.subjectSlug.localeCompare(b.subjectSlug))
  if (!files.length) {
    const scope = requested.size ? ` for subjects: ${[...requested].join(', ')}` : ''
    throw new Error(`No curated raw files found in ${curatedDir}${scope}`)
  }
  if (requested.size) {
    const found = new Set(files.map(file => file.subjectSlug))
    const missing = [...requested].filter(subject => !found.has(subject))
    if (missing.length) throw new Error(`Missing curated raw files for subjects: ${missing.join(', ')}`)
  }
  return files
}

function ensureDirs(paths) {
  for (const path of paths) mkdirSync(path, { recursive: true })
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  if (!existsSync(args.curatedDir)) throw new Error(`Curated dir not found: ${args.curatedDir}`)

  const normalizedDir = join(args.outDir, 'normalized')
  const mappedDir = join(args.outDir, 'mapped')
  const bySubjectDir = join(args.outDir, 'by_subject')
  if (args.clean) rmSync(args.outDir, { recursive: true, force: true })
  ensureDirs([normalizedDir, mappedDir, bySubjectDir])

  const files = curatedFiles(args.curatedDir, args.subjects)
  console.log(`Building curated 7-9 staging for ${files.length} subject(s) into ${args.outDir}`)
  for (const { subjectSlug, file } of files) {
    const normalizedFile = join(normalizedDir, `${subjectSlug}.json`)
    const mappedFile = join(mappedDir, `${subjectSlug}.json`)
    ensureDirs([dirname(normalizedFile), dirname(mappedFile)])
    run(process.execPath, ['scripts/grade7_9/normalize_schema.js', '--input', file, '--out', normalizedFile])
    run(process.execPath, ['scripts/grade7_9/map_ts.js', '--input', normalizedFile, '--out', mappedFile])
  }

  run(process.execPath, ['scripts/grade7_9/build_by_subject.js', '--input-dir', mappedDir, '--out-dir', bySubjectDir])
  run(process.execPath, ['scripts/grade7_9/generate_manifest.js', '--by-subject-dir', bySubjectDir, '--out-dir', args.outDir])
  run(process.execPath, ['scripts/grade7_9/validate_schema.js', '--staging-root', args.outDir, '--existing-data-root', args.existingDataRoot])
  run(process.execPath, ['scripts/grade7_9/audit_grade_split.js', '--curated-dir', args.curatedDir, '--staging-root', args.outDir])

  const manifest = JSON.parse(readFileSync(join(args.outDir, 'manifest.json'), 'utf8'))
  const total = (manifest.subjects || []).reduce((sum, subject) => sum + subject.record_count, 0)
  console.log(`Curated staging ready: ${manifest.subjects?.length || 0} subjects, ${total} standards`)
}

main()
