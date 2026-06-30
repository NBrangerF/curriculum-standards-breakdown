#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { emptyStandard, getSubjectConfig, gradeLabel, GRADE_BAND, GRADE_RANGE, JUNIOR_GRADES, slugifyDomain } from './config.js'

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

function usage() {
  console.log(`Usage:
node scripts/grade7_9/normalize_schema.js --input raw/chinese.raw.json --out staging/chinese.normalized.json

Input can contain:
- raw_items: curated objects with domain/subdomain/standard/practice...
- sections[].candidate_items: auto-extracted text candidates`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function collectRawItems(raw) {
  if (Array.isArray(raw.raw_items)) return raw.raw_items
  const items = []
  for (const section of raw.sections || []) {
    for (const text of section.candidate_items || []) {
      items.push({
        source_section: section.title,
        domain: inferDomain(section.title, text),
        subdomain: section.title,
        standard: text,
        context: text,
        target_grades: JUNIOR_GRADES
      })
    }
  }
  return items
}

function inferDomain(sectionTitle, text) {
  if (sectionTitle === '学业质量') return '学业质量'
  if (sectionTitle === '教学建议') return '课程实施'
  if (sectionTitle === '评价建议') return '课程实施'
  const candidates = ['阅读与鉴赏', '表达与交流', '梳理与探究', '数与代数', '图形与几何', '统计与概率', '语言能力', '文化意识', '科学观念', '探究实践', '数据与编码', '法治教育', '健康教育', '艺术表现', '日常生活劳动']
  return candidates.find(name => text.includes(name)) || sectionTitle || '课程内容'
}

function gradesForItem(item) {
  const raw = item.target_grades || item.grades || item.grade || JUNIOR_GRADES
  const values = Array.isArray(raw) ? raw : String(raw).split(',')
  const grades = values
    .map(value => Number(String(value).replace(/[^\d]/g, '')))
    .filter(value => JUNIOR_GRADES.includes(value))
  return grades.length ? grades : JUNIOR_GRADES
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildStandard(raw, subjectSlug, grade, code) {
  const config = getSubjectConfig(subjectSlug)
  const standard = {
    ...emptyStandard(),
    subject: config.subject,
    subject_slug: subjectSlug,
    grade_band: GRADE_BAND,
    grade_range: GRADE_RANGE,
    grade: gradeLabel(grade),
    domain: cleanText(raw.domain || raw.source_section || '课程内容'),
    subdomain: cleanText(raw.subdomain || raw.module || raw.topic || raw.source_section || ''),
    standard: cleanText(raw.standard || raw.text || raw.original_text),
    context: cleanText(raw.context || raw.original_text || raw.standard || raw.text),
    practice: cleanText(raw.practice || raw.student_activity || ''),
    teaching_tip: cleanText(raw.teaching_tip || raw.teacher_action || ''),
    assessment_evidence_type: cleanText(raw.assessment_evidence_type || raw.assessment || ''),
    ts_primary: Array.isArray(raw.ts_primary) ? raw.ts_primary : [],
    ts_secondary: Array.isArray(raw.ts_secondary) ? raw.ts_secondary : [],
    ts_rationale: cleanText(raw.ts_rationale || '')
  }
  standard.code = code
  standard.id = code
  return standard
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.input || !args.out) {
    usage()
    process.exit(args.help ? 0 : 1)
  }
  const raw = readJson(args.input)
  const subjectSlug = args.subject || raw.subject_slug
  if (!subjectSlug) throw new Error('subject_slug missing; pass --subject')
  const config = getSubjectConfig(subjectSlug)
  const counters = new Map()
  const output = []
  for (const item of collectRawItems(raw)) {
    const domainCode = slugifyDomain(item.domain || item.source_section || 'GEN', subjectSlug)
    for (const grade of gradesForItem(item)) {
      const key = `${config.prefix}-H3-${domainCode}`
      const next = (counters.get(key) || 0) + 1
      counters.set(key, next)
      const code = `${key}-${String(next).padStart(3, '0')}`
      output.push(buildStandard(item, subjectSlug, grade, code))
    }
  }
  writeFileSync(args.out, `${JSON.stringify({
    subject: config.subject,
    subject_slug: subjectSlug,
    grade_band: GRADE_BAND,
    grade_range: GRADE_RANGE,
    standards: output
  }, null, 2)}\n`)
  console.log(`Wrote ${args.out} (${output.length} standards)`)
}

main()
