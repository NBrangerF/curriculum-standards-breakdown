#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_CANDIDATE_ROOT = 'generated/grade7_9_release_candidate'
const DEFAULT_PUBLIC_DATA_ROOT = 'public/data'
const DEFAULT_FRONTEND_FILE = 'src/data/dataLoader.js'
const EXPECTED_SCOPE = 'grade7_9_release_candidate_restore_h3_add_h4'
const TARGET_H3_RANGE_LABEL = '5-6年级'
const TARGET_H4_LINE = "    H4: { label: '第四学段', range: '7-9年级', order: 4, color: 'var(--band-h4)', bgColor: 'var(--band-h4-bg)' }"

function parseArgs(argv) {
  const args = {
    candidateRoot: DEFAULT_CANDIDATE_ROOT,
    publicDataRoot: DEFAULT_PUBLIC_DATA_ROOT,
    frontendFile: DEFAULT_FRONTEND_FILE,
    write: false,
    confirmTargetPolicy: false,
    skipFrontend: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--candidate-root') args.candidateRoot = argv[++i]
    else if (item === '--public-data-root') args.publicDataRoot = argv[++i]
    else if (item === '--frontend-file') args.frontendFile = argv[++i]
    else if (item === '--write') args.write = true
    else if (item === '--confirm-target-policy') args.confirmTargetPolicy = true
    else if (item === '--skip-frontend') args.skipFrontend = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/apply_release_candidate.js [--candidate-root generated/grade7_9_release_candidate] [--public-data-root public/data]
node scripts/grade7_9/apply_release_candidate.js --write --confirm-target-policy

Dry-runs or applies the generated release candidate into public/data.
Default mode is dry-run and never writes public/data.
Write mode requires --write --confirm-target-policy.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function subjectFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
}

function copyFileEnsuringDir(from, to) {
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
}

function detectH3Range(frontendFile) {
  if (!existsSync(frontendFile)) return ''
  const source = readFileSync(frontendFile, 'utf8')
  return source.match(/H3:\s*\{[^}]*range:\s*'([^']*)'/m)?.[1] || ''
}

function updateFrontendGradeBand(frontendFile) {
  const source = readFileSync(frontendFile, 'utf8')
  let next = source.replace(
    /(H3:\s*\{[^}]*range:\s*)'[^']*'/m,
    `$1'${TARGET_H3_RANGE_LABEL}'`
  )
  if (!/H4:\s*\{/.test(next)) {
    next = next.replace(
      /(H3:\s*\{[^}]*\})(,?)/m,
      `$1,\n${TARGET_H4_LINE}`
    )
  } else {
    next = next.replace(
      /(H4:\s*\{[^}]*range:\s*)'[^']*'/m,
      "$1'7-9年级'"
    )
  }
  if (next === source) {
    throw new Error(`Could not update grade bands in ${frontendFile}`)
  }
  writeFileSync(frontendFile, next)
}

function collectPlan(args) {
  const candidateManifest = join(args.candidateRoot, 'manifest.json')
  const candidateSummary = join(args.candidateRoot, 'release_candidate_summary.json')
  const candidateBySubject = join(args.candidateRoot, 'by_subject')
  const candidateIndexes = join(args.candidateRoot, 'indexes')
  const required = [
    candidateManifest,
    candidateSummary,
    join(candidateIndexes, 'code_to_subject.json'),
    join(candidateIndexes, 'skill_to_subjects.json'),
    join(candidateIndexes, 'subject_stats.json')
  ]
  const errors = []
  for (const file of required) {
    if (!existsSync(file)) errors.push(`Missing candidate file: ${file}`)
  }
  if (!existsSync(candidateBySubject)) errors.push(`Missing candidate by_subject dir: ${candidateBySubject}`)
  if (!existsSync(args.publicDataRoot)) errors.push(`Missing public data root: ${args.publicDataRoot}`)
  if (!args.skipFrontend && !existsSync(args.frontendFile)) errors.push(`Missing frontend data loader: ${args.frontendFile}`)

  if (errors.length) {
    return { valid: false, errors }
  }

  const manifest = readJson(candidateManifest)
  const summary = readJson(candidateSummary)
  if (manifest.data_scope !== EXPECTED_SCOPE) {
    errors.push(`Candidate manifest data_scope must be ${EXPECTED_SCOPE}; got ${manifest.data_scope || 'missing'}`)
  }
  if (summary.valid !== true) errors.push('release_candidate_summary.json is not valid')
  if (!summary.totals?.candidate_records) errors.push('release_candidate_summary.json missing candidate_records total')

  const bySubjectCopies = subjectFiles(candidateBySubject).map(file => ({
    from: join(candidateBySubject, file),
    to: join(args.publicDataRoot, 'by_subject', file),
    kind: 'by_subject'
  }))
  const indexCopies = [
    'code_to_subject.json',
    'skill_to_subjects.json',
    'subject_stats.json'
  ].map(file => ({
    from: join(candidateIndexes, file),
    to: join(args.publicDataRoot, 'indexes', file),
    kind: 'index'
  }))
  const manifestCopy = {
    from: candidateManifest,
    to: join(args.publicDataRoot, 'manifest.json'),
    kind: 'manifest'
  }
  const copyPlan = [manifestCopy, ...bySubjectCopies, ...indexCopies]
  const frontendCurrentH3Range = args.skipFrontend ? '' : detectH3Range(args.frontendFile)

  return {
    valid: errors.length === 0,
    errors,
    candidate_root: args.candidateRoot,
    public_data_root: args.publicDataRoot,
    frontend_file: args.skipFrontend ? '' : args.frontendFile,
    mode: args.write ? 'write' : 'dry_run_no_writes',
    requires_confirmation: args.write && !args.confirmTargetPolicy,
    candidate_scope: manifest.data_scope,
    totals: summary.totals,
    copy_plan: copyPlan,
    frontend: args.skipFrontend
      ? { skipped: true }
      : {
          current_h3_range: frontendCurrentH3Range,
          target_h3_range: TARGET_H3_RANGE_LABEL,
          needs_update: frontendCurrentH3Range !== TARGET_H3_RANGE_LABEL
        }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const plan = collectPlan(args)
  if (!plan.valid) {
    console.log(JSON.stringify(plan, null, 2))
    process.exit(1)
  }
  if (plan.requires_confirmation) {
    plan.errors.push('Write mode requires --confirm-target-policy.')
    console.log(JSON.stringify(plan, null, 2))
    process.exit(1)
  }

  if (args.write) {
    for (const item of plan.copy_plan) copyFileEnsuringDir(item.from, item.to)
    if (!args.skipFrontend && plan.frontend.needs_update) updateFrontendGradeBand(args.frontendFile)
    plan.applied = true
  } else {
    plan.applied = false
  }

  plan.would_write_files = plan.copy_plan.map(item => item.to)
  if (!args.skipFrontend) plan.would_write_files.push(args.frontendFile)
  console.log(JSON.stringify(plan, null, 2))
}

main()
