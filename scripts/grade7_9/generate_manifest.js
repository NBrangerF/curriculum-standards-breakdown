#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const COLUMNS = [
  'id',
  'code',
  'subject',
  'subject_slug',
  'grade_band',
  'grade_range',
  'grade',
  'domain',
  'subdomain',
  'standard',
  'context',
  'practice',
  'teaching_tip',
  'assessment_evidence_type',
  'ts_primary',
  'ts_secondary',
  'ts_rationale'
]

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const value = argv[i + 1]
    if (!value || value.startsWith('--')) args[key] = true
    else {
      args[key] = value
      i += 1
    }
  }
  return args
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function countBy(rows, field) {
  const out = {}
  for (const row of rows) {
    const key = row[field] || '未分类'
    out[key] = (out[key] || 0) + 1
  }
  return out
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args['by-subject-dir'] || !args['out-dir']) {
    console.log('Usage: node scripts/grade7_9/generate_manifest.js --by-subject-dir generated/grade7_9/by_subject --out-dir generated/grade7_9')
    process.exit(1)
  }
  if (!existsSync(args['out-dir'])) mkdirSync(args['out-dir'], { recursive: true })
  const indexesDir = join(args['out-dir'], 'indexes')
  if (!existsSync(indexesDir)) mkdirSync(indexesDir, { recursive: true })
  const subjects = []
  const codeToSubject = {}
  const skillToSubjects = {}
  const subjectStats = {}
  for (const file of readdirSync(args['by-subject-dir']).filter(name => name.endsWith('.json')).sort()) {
    const subjectSlug = file.replace('.json', '')
    const payload = readJson(join(args['by-subject-dir'], file))
    const standards = payload.standards || []
    subjects.push({
      subject: payload.subject,
      subject_slug: subjectSlug,
      record_count: standards.length,
      file: `by_subject/${file}`,
      domains: countBy(standards, 'domain'),
      grade_bands: countBy(standards, 'grade_band'),
      grades: countBy(standards, 'grade')
    })
    subjectStats[subjectSlug] = {
      total: standards.length,
      domains: Object.keys(countBy(standards, 'domain')).length,
      grade_bands: countBy(standards, 'grade_band'),
      grades: countBy(standards, 'grade'),
      skill_coverage: {}
    }
    for (const standard of standards) {
      codeToSubject[standard.code] = subjectSlug
      for (const ts of [...(standard.ts_primary || []), ...(standard.ts_secondary || [])]) {
        const main = String(ts).split('.')[0]
        subjectStats[subjectSlug].skill_coverage[main] = (subjectStats[subjectSlug].skill_coverage[main] || 0) + 1
        if (!skillToSubjects[main]) skillToSubjects[main] = new Set()
        skillToSubjects[main].add(subjectSlug)
      }
    }
  }
  const manifest = {
    generated_at: new Date().toISOString(),
    data_scope: 'junior_secondary_7_9_staging',
    columns: COLUMNS,
    subjects
  }
  const skillIndex = Object.fromEntries(Object.entries(skillToSubjects).map(([skill, values]) => [skill, [...values].sort()]))
  writeFileSync(join(args['out-dir'], 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(indexesDir, 'code_to_subject.json'), `${JSON.stringify(codeToSubject, null, 2)}\n`)
  writeFileSync(join(indexesDir, 'skill_to_subjects.json'), `${JSON.stringify(skillIndex, null, 2)}\n`)
  writeFileSync(join(indexesDir, 'subject_stats.json'), `${JSON.stringify(subjectStats, null, 2)}\n`)
  console.log(`Wrote manifest and indexes to ${args['out-dir']}`)
}

main()
