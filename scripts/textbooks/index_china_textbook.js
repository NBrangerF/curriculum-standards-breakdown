#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_REPO_DIR = 'generated/external/ChinaTextbook'
const DEFAULT_REF = 'HEAD'
const DEFAULT_STAGE = '初中'
const DEFAULT_OUT = 'generated/textbook_evidence/china_textbook_index.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/china_textbook_index_summary.md'

const GRADE_LABELS = {
  七年级: 7,
  八年级: 8,
  九年级: 9
}

const TEXTBOOK_SUBJECT_MAP = {
  语文: [{ subject_slug: 'chinese', evidence_role: 'direct_textbook' }],
  数学: [{ subject_slug: 'math', evidence_role: 'direct_textbook' }],
  英语: [{ subject_slug: 'english', evidence_role: 'direct_textbook' }],
  体育与健康: [{ subject_slug: 'pe', evidence_role: 'direct_textbook' }],
  道德与法治: [{ subject_slug: 'morality_law', evidence_role: 'direct_textbook' }],
  科学: [{ subject_slug: 'science', evidence_role: 'direct_textbook' }],
  艺术: [{ subject_slug: 'arts', evidence_role: 'direct_textbook' }],
  音乐: [{ subject_slug: 'arts', evidence_role: 'discipline_textbook' }],
  美术: [{ subject_slug: 'arts', evidence_role: 'discipline_textbook' }],
  物理: [{ subject_slug: 'science', evidence_role: 'discipline_textbook' }],
  化学: [{ subject_slug: 'science', evidence_role: 'discipline_textbook' }],
  生物学: [{ subject_slug: 'science', evidence_role: 'discipline_textbook' }],
  地理: [{ subject_slug: 'science', evidence_role: 'adjacent_discipline_textbook' }],
  人文地理: [{ subject_slug: 'science', evidence_role: 'adjacent_discipline_textbook' }],
  历史: [{ subject_slug: 'morality_law', evidence_role: 'adjacent_discipline_textbook' }]
}

const TARGET_STANDARD_SUBJECTS = [
  'arts',
  'chinese',
  'english',
  'it',
  'labor',
  'math',
  'morality_law',
  'pe',
  'science'
]

function parseArgs(argv) {
  const args = {
    repoDir: DEFAULT_REPO_DIR,
    ref: DEFAULT_REF,
    stage: DEFAULT_STAGE,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    includeFragments: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--repo-dir') args.repoDir = argv[++i]
    else if (item === '--ref') args.ref = argv[++i]
    else if (item === '--stage') args.stage = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--include-fragments') args.includeFragments = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/index_china_textbook.js \\
  --repo-dir generated/external/ChinaTextbook \\
  --out generated/textbook_evidence/china_textbook_index.json

The repo directory should be a local clone of TapXWorld/ChinaTextbook. A blobless,
no-checkout clone is enough because this script reads only the Git tree.`)
}

function git(repoDir, args) {
  return execFileSync('git', ['-C', repoDir, '-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 32
  })
}

function listTree(repoDir, ref) {
  // Do not use `git ls-tree -l` with a partial clone: asking for blob sizes can
  // cause Git to lazily fetch large textbook PDFs. The path and object id are
  // enough for reproducible evidence indexing.
  const raw = git(repoDir, ['ls-tree', '-r', '-z', ref])
  return raw
    .split('\0')
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^(\d+)\s+(\w+)\s+([0-9a-f]+)\t(.+)$/s)
      if (!match) return null
      return {
        mode: match[1],
        type: match[2],
        object: match[3],
        size: null,
        path: match[4]
      }
    })
    .filter(Boolean)
}

function parseGrade(label, fileName) {
  const text = `${label || ''}/${fileName || ''}`
  for (const [gradeLabel, grade] of Object.entries(GRADE_LABELS)) {
    if (text.includes(gradeLabel)) return { grade, grade_label: gradeLabel }
  }
  return { grade: null, grade_label: label || null }
}

function parseVolume(fileName) {
  if (fileName.includes('上册')) return '上册'
  if (fileName.includes('下册')) return '下册'
  if (fileName.includes('全一册')) return '全一册'
  return null
}

function parseEntry(entry, stage) {
  const parts = entry.path.split('/')
  if (parts[0] !== stage || parts.length < 5) return null
  const [stageLabel, textbookSubject, edition, gradeDir, ...rest] = parts
  const fileName = rest.at(-1) || ''
  const isFragment = entry.path.includes('_merge_folder/') || /\.pdf\.\d+$/.test(fileName)
  const extensionMatch = fileName.match(/\.([A-Za-z0-9]+)(?:\.\d+)?$/)
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : ''
  const { grade, grade_label: gradeLabel } = parseGrade(gradeDir, fileName)
  const evidenceId = `ctb_${createHash('sha1').update(`${entry.object}:${entry.path}`).digest('hex').slice(0, 12)}`
  return {
    evidence_id: evidenceId,
    repository_path: entry.path,
    git_object: entry.object,
    byte_size: entry.size,
    stage: stageLabel,
    textbook_subject: textbookSubject,
    standard_subject_mappings: TEXTBOOK_SUBJECT_MAP[textbookSubject] || [],
    edition,
    grade,
    grade_label: gradeLabel,
    volume: parseVolume(fileName),
    file_name: fileName,
    extension,
    is_fragment: isFragment,
    evidence_url: `https://github.com/TapXWorld/ChinaTextbook/blob/master/${encodeURI(entry.path).replace(/#/g, '%23')}`
  }
}

function inc(object, key, amount = 1) {
  const normalized = key || '未识别'
  object[normalized] = (object[normalized] || 0) + amount
}

function addNestedCount(root, keys, amount = 1) {
  let cursor = root
  keys.forEach((key, index) => {
    const normalized = String(key || '未识别')
    if (index === keys.length - 1) cursor[normalized] = (cursor[normalized] || 0) + amount
    else {
      cursor[normalized] ||= {}
      cursor = cursor[normalized]
    }
  })
}

function buildSummary(records, commit) {
  const canonical = records.filter(record => !record.is_fragment)
  const byTextbookSubject = {}
  const byStandardSubject = {}
  const byGrade = {}
  const byStandardSubjectGrade = {}
  const roleCounts = {}
  const unknownTextbookSubjects = {}

  for (const record of canonical) {
    inc(byTextbookSubject, record.textbook_subject)
    inc(byGrade, record.grade_label)
    if (!record.standard_subject_mappings.length) inc(unknownTextbookSubjects, record.textbook_subject)
    for (const mapping of record.standard_subject_mappings) {
      inc(byStandardSubject, mapping.subject_slug)
      inc(roleCounts, mapping.evidence_role)
      addNestedCount(byStandardSubjectGrade, [mapping.subject_slug, record.grade_label])
    }
  }

  const missingTargetSubjects = TARGET_STANDARD_SUBJECTS.filter(subject => !byStandardSubject[subject])

  return {
    source_repo: 'https://github.com/TapXWorld/ChinaTextbook',
    source_commit: commit,
    stage: records[0]?.stage || DEFAULT_STAGE,
    total_tree_records: records.length,
    canonical_records: canonical.length,
    fragment_records: records.length - canonical.length,
    by_textbook_subject: Object.fromEntries(Object.entries(byTextbookSubject).sort(([a], [b]) => a.localeCompare(b))),
    by_standard_subject: Object.fromEntries(Object.entries(byStandardSubject).sort(([a], [b]) => a.localeCompare(b))),
    by_grade: Object.fromEntries(Object.entries(byGrade).sort(([a], [b]) => a.localeCompare(b))),
    by_standard_subject_grade: Object.fromEntries(Object.entries(byStandardSubjectGrade).sort(([a], [b]) => a.localeCompare(b))),
    evidence_role_counts: Object.fromEntries(Object.entries(roleCounts).sort(([a], [b]) => a.localeCompare(b))),
    unknown_textbook_subjects: Object.fromEntries(Object.entries(unknownTextbookSubjects).sort(([a], [b]) => a.localeCompare(b))),
    missing_target_standard_subjects: missingTargetSubjects
  }
}

function markdownSummary(summary) {
  const subjectRows = Object.entries(summary.by_textbook_subject)
    .map(([subject, count]) => `| ${subject} | ${count} |`)
    .join('\n')
  const standardRows = Object.entries(summary.by_standard_subject)
    .map(([subject, count]) => `| ${subject} | ${count} |`)
    .join('\n')
  const missing = summary.missing_target_standard_subjects.length
    ? summary.missing_target_standard_subjects.join(', ')
    : '无'
  return `# ChinaTextbook 初中教材索引摘要

来源仓库：TapXWorld/ChinaTextbook

固定 commit：\`${summary.source_commit}\`

## 规模

| 指标 | 数量 |
| --- | ---: |
| 初中 tree records | ${summary.total_tree_records} |
| 正常教材文件 | ${summary.canonical_records} |
| merge/pdf 分片文件 | ${summary.fragment_records} |

## 教材学科

| 教材目录学科 | 文件数 |
| --- | ---: |
${subjectRows}

## 映射到本站学科

| subject_slug | 文件数 |
| --- | ---: |
${standardRows}

未覆盖本站目标学科：${missing}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  if (!existsSync(args.repoDir)) {
    throw new Error(`ChinaTextbook repo not found: ${args.repoDir}. Clone it first, for example: git clone --filter=blob:none --no-checkout https://github.com/TapXWorld/ChinaTextbook.git ${args.repoDir}`)
  }

  const commit = git(args.repoDir, ['rev-parse', args.ref]).trim()
  const tree = listTree(args.repoDir, args.ref)
  const records = tree
    .filter(entry => entry.type === 'blob')
    .map(entry => parseEntry(entry, args.stage))
    .filter(Boolean)
    .filter(record => args.includeFragments || !record.is_fragment)
  const allRecords = tree
    .filter(entry => entry.type === 'blob')
    .map(entry => parseEntry(entry, args.stage))
    .filter(Boolean)
  const summary = buildSummary(allRecords, commit)

  const payload = {
    source_repo: 'https://github.com/TapXWorld/ChinaTextbook',
    source_commit: commit,
    generated_at: new Date().toISOString(),
    stage: args.stage,
    include_fragments: args.includeFragments,
    records,
    summary
  }

  mkdirSync(dirname(args.out), { recursive: true })
  writeFileSync(args.out, `${JSON.stringify(payload, null, 2)}\n`)
  if (args.summaryOut) {
    mkdirSync(dirname(args.summaryOut), { recursive: true })
    writeFileSync(args.summaryOut, markdownSummary(summary))
  }
  console.log(JSON.stringify({
    wrote: args.out,
    summary_out: args.summaryOut || null,
    source_commit: commit,
    records: records.length,
    canonical_records: summary.canonical_records,
    fragment_records: summary.fragment_records,
    missing_target_standard_subjects: summary.missing_target_standard_subjects
  }, null, 2))
}

main()
