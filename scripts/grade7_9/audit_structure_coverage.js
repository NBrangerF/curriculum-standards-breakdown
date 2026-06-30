#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { SUBJECTS } from './config.js'

const DEFAULT_CURATED_DIR = 'scripts/grade7_9/curated'
const DEFAULT_REVIEW_RANGES = 'scripts/grade7_9/review_ranges.json'

const STRUCTURES = {
  course_goals: {
    label: '课程目标',
    patterns: [/课程目标/, /学段要求/, /核心素养学段特征/, /目标与分段设计/]
  },
  course_content: {
    label: '课程内容',
    patterns: [
      /课程内容/,
      /学习任务/,
      /内容要求/,
      /主题内容/,
      /语篇内容/,
      /语言知识/,
      /文化知识/,
      /学习策略/,
      /专项运动技能/,
      /体能/,
      /健康教育/,
      /跨学科/,
      /课程内容结构/
    ]
  },
  academic_quality: {
    label: '学业质量',
    patterns: [/学业质量/, /学业要求/, /劳动素养要求/]
  },
  teaching_suggestions: {
    label: '教学建议',
    patterns: [/教学/, /课程实施/]
  },
  evaluation_suggestions: {
    label: '评价建议',
    patterns: [/评价/, /学业质量/, /学业要求/]
  }
}

function parseArgs(argv) {
  const args = {
    curatedDir: DEFAULT_CURATED_DIR,
    reviewRanges: DEFAULT_REVIEW_RANGES,
    out: ''
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--curated-dir') args.curatedDir = argv[++i]
    else if (item === '--review-ranges') args.reviewRanges = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/grade7_9/audit_structure_coverage.js [--curated-dir scripts/grade7_9/curated] [--out generated/grade7_9_structure_coverage.json]

Audits whether curated 7-9 raw items preserve the 2022 standards structure:
课程目标, 课程内容, 学业质量, 教学建议, 评价建议.`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function sorted(value) {
  return [...value].sort((a, b) => a.localeCompare(b))
}

function countBy(rows, getKey) {
  const out = {}
  for (const row of rows) {
    const key = getKey(row) || 'missing'
    out[key] = (out[key] || 0) + 1
  }
  return out
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
}

function writeJson(path, value) {
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function structureMatches(text, key) {
  return STRUCTURES[key].patterns.some(pattern => pattern.test(text || ''))
}

function evidenceFromLabels(labels) {
  const evidence = {}
  for (const key of Object.keys(STRUCTURES)) {
    const matchingLabels = labels.filter(label => structureMatches(label, key))
    evidence[key] = {
      count: matchingLabels.length,
      labels: sorted([...new Set(matchingLabels)])
    }
  }
  return evidence
}

function missingCount(rows, field) {
  if (field === 'source_pages' || field === 'target_grades') {
    return rows.filter(row => !Array.isArray(row[field]) || row[field].length === 0).length
  }
  return rows.filter(row => !row[field]).length
}

function auditSubject(subjectSlug, curatedDir, reviewRanges) {
  const file = join(curatedDir, `${subjectSlug}_h3_raw.json`)
  if (!existsSync(file)) {
    return {
      subject_slug: subjectSlug,
      missing_file: true,
      errors: [`Missing curated raw file: ${file}`],
      warnings: []
    }
  }
  const payload = readJson(file)
  const rawItems = payload.raw_items || []
  const sourceSectionLabels = rawItems.map(item => item.source_section || '')
  const reviewRangeLabels = (reviewRanges[subjectSlug] || []).map(range => range.label || '')
  const sourceSectionEvidence = evidenceFromLabels(sourceSectionLabels)
  const reviewRangeEvidence = evidenceFromLabels(reviewRangeLabels)
  const fieldCoverage = {
    source_pages_missing: missingCount(rawItems, 'source_pages'),
    target_grades_missing: missingCount(rawItems, 'target_grades'),
    practice_missing: missingCount(rawItems, 'practice'),
    teaching_tip_missing: missingCount(rawItems, 'teaching_tip'),
    assessment_evidence_type_missing: missingCount(rawItems, 'assessment_evidence_type')
  }
  const errors = []
  const warnings = []

  if (!rawItems.length) errors.push(`${subjectSlug} has no raw_items`)
  for (const [field, count] of Object.entries(fieldCoverage)) {
    if (count > 0) errors.push(`${subjectSlug} ${field}: ${count}`)
  }

  for (const key of ['course_goals', 'course_content', 'academic_quality']) {
    const direct = sourceSectionEvidence[key].count
    const review = reviewRangeEvidence[key].count
    if (!direct && !review) {
      errors.push(`${subjectSlug} lacks ${STRUCTURES[key].label} source or review-range evidence`)
    } else if (!direct) {
      warnings.push(`${subjectSlug} has ${STRUCTURES[key].label} in review ranges but no direct curated source_section item`)
    }
  }

  for (const key of ['teaching_suggestions', 'evaluation_suggestions']) {
    const direct = sourceSectionEvidence[key].count
    const review = reviewRangeEvidence[key].count
    const fieldBackstop = key === 'teaching_suggestions'
      ? fieldCoverage.teaching_tip_missing === 0
      : fieldCoverage.assessment_evidence_type_missing === 0
    if (!direct && !review && !fieldBackstop) {
      errors.push(`${subjectSlug} lacks ${STRUCTURES[key].label} source/review evidence and mapped field coverage`)
    } else if (!direct && !review && fieldBackstop) {
      warnings.push(`${subjectSlug} maps ${STRUCTURES[key].label} through per-item fields, but has no direct source_section/review-range evidence`)
    } else if (!direct && review) {
      warnings.push(`${subjectSlug} has ${STRUCTURES[key].label} in review ranges but no direct curated source_section item`)
    }
  }

  return {
    subject_slug: subjectSlug,
    subject: payload.subject || SUBJECTS[subjectSlug]?.subject || subjectSlug,
    raw_items: rawItems.length,
    review_status: payload.review_status || '',
    source_sections: countBy(rawItems, item => item.source_section),
    source_section_evidence: sourceSectionEvidence,
    review_range_evidence: reviewRangeEvidence,
    field_coverage: fieldCoverage,
    errors,
    warnings
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  const errors = []
  const warnings = []
  if (!existsSync(args.curatedDir)) errors.push(`Curated dir missing: ${args.curatedDir}`)
  const reviewRanges = existsSync(args.reviewRanges) ? readJson(args.reviewRanges) : {}
  if (!existsSync(args.reviewRanges)) warnings.push(`Review ranges file missing: ${args.reviewRanges}`)

  const expectedSubjects = sorted(Object.keys(SUBJECTS))
  const curatedFiles = existsSync(args.curatedDir)
    ? readdirSync(args.curatedDir).filter(file => file.endsWith('_h3_raw.json')).sort()
    : []
  const foundSubjects = curatedFiles.map(file => file.replace('_h3_raw.json', ''))
  for (const subjectSlug of expectedSubjects) {
    if (!foundSubjects.includes(subjectSlug)) errors.push(`Missing curated subject file for ${subjectSlug}`)
  }

  const subjects = {}
  for (const subjectSlug of expectedSubjects) {
    const result = auditSubject(subjectSlug, args.curatedDir, reviewRanges)
    subjects[subjectSlug] = result
    errors.push(...(result.errors || []))
    warnings.push(...(result.warnings || []))
  }

  const result = {
    valid: errors.length === 0,
    curated_dir: args.curatedDir,
    review_ranges: args.reviewRanges,
    structures_checked: Object.fromEntries(
      Object.entries(STRUCTURES).map(([key, value]) => [key, value.label])
    ),
    subjects,
    errors,
    warnings
  }

  if (args.out) writeJson(args.out, result)
  console.log(JSON.stringify(stable(result), null, 2))
  if (errors.length) process.exit(1)
}

main()
