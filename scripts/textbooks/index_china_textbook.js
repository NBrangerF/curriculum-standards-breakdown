#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { parseArgs, writeJson, writeFileDurable } from './library_common.js'

const DEFAULT_REPO_DIR = 'generated/external/ChinaTextbook'
const DEFAULT_REF = 'HEAD'
const DEFAULT_OUT = 'generated/textbook_library/china_textbook_source_index.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_library/china_textbook_source_index_summary.md'

const STAGE_MAP = { 小学: 'primary', 初中: 'junior' }
const CHINESE_GRADES = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
const SUBJECT_SLUGS = {
  语文: 'chinese', 数学: 'math', 英语: 'english', 体育与健康: 'pe', 道德与法治: 'morality_law',
  科学: 'science', 艺术: 'arts', 音乐: 'music', 美术: 'art', 物理: 'physics', 化学: 'chemistry',
  生物学: 'biology', 地理: 'geography', 地理图册: 'geography_atlas', 人文地理: 'human_geography', 历史: 'history'
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/index_china_textbook.js \\
  --stages 小学,初中 \\
  --repo-dir generated/external/ChinaTextbook \\
  --include-fragments

The clone may be blobless/no-checkout. This command reads Git tree metadata only.`)
}

function git(repoDir, args) {
  return execFileSync('git', ['-C', repoDir, '-c', 'core.quotePath=false', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function listTree(repoDir, ref) {
  return git(repoDir, ['ls-tree', '-r', '-z', ref]).split('\0').filter(Boolean).map(line => {
    const match = line.match(/^(\d+)\s+(\w+)\s+([0-9a-f]+)\t(.+)$/s)
    return match ? { mode: match[1], type: match[2], object: match[3], path: match[4], size: null } : null
  }).filter(Boolean)
}

function gradeNumber(token) {
  if (!token) return null
  if (/^[1-9]$/.test(token)) return Number(token)
  return CHINESE_GRADES[token] || null
}

function parseGrade(...parts) {
  const text = parts.filter(Boolean).join('/')
  const span = text.match(/([一二三四五六七八九1-9])\s*(?:至|到|－|—|-)\s*([一二三四五六七八九1-9])\s*年级/)
  if (span) {
    const gradeStart = gradeNumber(span[1])
    const gradeEnd = gradeNumber(span[2])
    return { grade: gradeStart === gradeEnd ? gradeStart : null, grade_start: gradeStart, grade_end: gradeEnd, grade_label: `${gradeStart}至${gradeEnd}年级` }
  }
  const exactMatches = [...text.matchAll(/([一二三四五六七八九1-9])\s*年级(?!\s*起点)/g)]
  const exact = exactMatches.at(-1)
  if (exact) {
    const grade = gradeNumber(exact[1])
    return { grade, grade_start: grade, grade_end: grade, grade_label: `${grade}年级` }
  }
  const level = text.match(/水平\s*([一二三1-3])/)
  if (level) {
    const number = gradeNumber(level[1])
    const gradeStart = number * 2 - 1
    return { grade: null, grade_start: gradeStart, grade_end: gradeStart + 1, grade_label: `水平${number}` }
  }
  return { grade: null, grade_start: null, grade_end: null, grade_label: null }
}

function parseVolume(fileName) {
  if (fileName.includes('上册')) return '上册'
  if (fileName.includes('下册')) return '下册'
  if (fileName.includes('全一册') || fileName.includes('全册')) return '全一册'
  return null
}

function resourceType(subject, fileName) {
  if (/教师(?:教学)?用书|教学参考|教师参考/.test(fileName)) return 'teacher_guide'
  if (subject === '地理图册' || /地图册|地理图册|填充图册/.test(fileName)) return 'student_companion'
  if (/活动手册|练习册|作业本|学习手册/.test(fileName)) return 'student_companion'
  if (/教科书/.test(fileName) && !/教师/.test(fileName)) return 'student_textbook'
  if (/\.pdf(?:\.\d+)?$/i.test(fileName)) return 'student_textbook'
  return 'unknown'
}

function logicalPath(path) {
  const mergeIndex = path.indexOf('.pdf_merge_folder/')
  if (mergeIndex >= 0) return path.slice(0, mergeIndex + 4)
  return path.replace(/\.pdf\.\d+$/i, '.pdf')
}

function fragmentNumber(fileName) {
  const match = fileName.match(/\.pdf\.(\d+)$/i)
  return match ? Number(match[1]) : null
}

function parseEntry(entry, allowedStages, commit) {
  const parts = entry.path.split('/')
  const stageLabel = parts[0]
  if (!allowedStages.includes(stageLabel) || !STAGE_MAP[stageLabel]) return null
  if (parts.length < 4) return null
  const subject = parts[1]
  const edition = parts[2]
  const fileName = parts.at(-1) || ''
  const gradeDir = parts.length >= 5 && !parts[3].includes('.pdf') ? parts[3] : ''
  const isFragment = entry.path.includes('_merge_folder/') || /\.pdf\.\d+$/i.test(fileName)
  const logicalSourcePath = logicalPath(entry.path)
  const extensionMatch = fileName.match(/\.([A-Za-z0-9]+)(?:\.\d+)?$/)
  const grade = parseGrade(gradeDir, fileName)
  const evidenceId = `ctb_${createHash('sha1').update(`${entry.object}:${entry.path}`).digest('hex').slice(0, 12)}`
  const sourceId = `ctbs_${createHash('sha1').update(`${commit}:${logicalSourcePath}`).digest('hex').slice(0, 16)}`
  return {
    evidence_id: evidenceId,
    source_id: sourceId,
    repository_path: entry.path,
    logical_source_path: logicalSourcePath,
    git_object: entry.object,
    byte_size: null,
    stage: stageLabel,
    stage_slug: STAGE_MAP[stageLabel],
    textbook_subject: subject,
    subject_slug: SUBJECT_SLUGS[subject] || 'unknown',
    edition,
    ...grade,
    volume: parseVolume(fileName),
    resource_type: resourceType(subject, fileName),
    file_name: fileName,
    extension: extensionMatch ? extensionMatch[1].toLowerCase() : '',
    is_fragment: isFragment,
    fragment_number: isFragment ? fragmentNumber(fileName) : null,
    evidence_url: `https://github.com/TapXWorld/ChinaTextbook/blob/${commit}/${entry.path.split('/').map(encodeURIComponent).join('/')}`
  }
}

function buildGroups(records) {
  const bySource = new Map()
  for (const record of records) {
    if (!bySource.has(record.source_id)) bySource.set(record.source_id, [])
    bySource.get(record.source_id).push(record)
  }
  return [...bySource].map(([sourceId, members]) => {
    const direct = members.find(item => !item.is_fragment)
    const fragments = members.filter(item => item.is_fragment).sort((a, b) => (a.fragment_number || 0) - (b.fragment_number || 0))
    const base = direct || fragments[0]
    const fragmentNumbers = fragments.map(item => item.fragment_number)
    const continuous = fragmentNumbers.length === 0 || fragmentNumbers.every((number, index) => number === index + 1)
    return {
      source_id: sourceId,
      logical_source_path: base.logical_source_path,
      stage: base.stage,
      stage_slug: base.stage_slug,
      textbook_subject: base.textbook_subject,
      subject_slug: base.subject_slug,
      edition: base.edition,
      grade: base.grade,
      grade_start: base.grade_start,
      grade_end: base.grade_end,
      grade_label: base.grade_label,
      volume: base.volume,
      resource_type: base.resource_type,
      direct_record: direct || null,
      fragments,
      fragment_numbers_continuous: continuous,
      preferred_source_kind: direct ? 'direct_pdf' : 'fragment_group',
      downloadable: Boolean(direct || fragments.length && continuous)
    }
  }).sort((a, b) => a.logical_source_path.localeCompare(b.logical_source_path))
}

function buildSummary(records, groups, commit, stages) {
  const countBy = (rows, key) => Object.fromEntries([...new Set(rows.map(row => row[key] || '未识别'))].sort().map(value => [value, rows.filter(row => (row[key] || '未识别') === value).length]))
  return {
    source_repo: 'https://github.com/TapXWorld/ChinaTextbook',
    source_commit: commit,
    stages,
    tree_records: records.length,
    logical_source_groups: groups.length,
    direct_pdf_records: records.filter(row => !row.is_fragment && row.extension === 'pdf').length,
    fragment_records: records.filter(row => row.is_fragment).length,
    incomplete_fragment_groups: groups.filter(group => group.fragments.length && !group.fragment_numbers_continuous).length,
    by_stage: countBy(groups, 'stage'),
    by_resource_type: countBy(groups, 'resource_type'),
    by_subject: countBy(groups, 'textbook_subject')
  }
}

function markdownSummary(summary) {
  return `# ChinaTextbook 小学/初中来源索引摘要

固定 commit：\`${summary.source_commit}\`

学段：${summary.stages.join('、')}

| 指标 | 数量 |
| --- | ---: |
| Git tree records | ${summary.tree_records} |
| 逻辑来源组 | ${summary.logical_source_groups} |
| 直接 PDF | ${summary.direct_pdf_records} |
| 分片记录 | ${summary.fragment_records} |
| 缺片组 | ${summary.incomplete_fragment_groups} |

## 资源类型

${Object.entries(summary.by_resource_type).map(([key, value]) => `- ${key}: ${value}`).join('\n')}
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) return usage()
  const repoDir = args.repoDir || DEFAULT_REPO_DIR
  if (!existsSync(repoDir)) throw new Error(`ChinaTextbook repo not found: ${repoDir}`)
  const ref = args.ref || DEFAULT_REF
  const stages = String(args.stages || args.stage || '初中').split(',').map(item => item.trim()).filter(Boolean)
  for (const stage of stages) if (!STAGE_MAP[stage]) throw new Error(`Unsupported stage: ${stage}`)
  const commit = git(repoDir, ['rev-parse', ref]).trim()
  const allRecords = listTree(repoDir, ref).filter(entry => entry.type === 'blob').map(entry => parseEntry(entry, stages, commit)).filter(Boolean)
  const groups = buildGroups(allRecords)
  const includeFragments = Boolean(args.includeFragments)
  const records = includeFragments ? allRecords : allRecords.filter(record => !record.is_fragment)
  const summary = buildSummary(allRecords, groups, commit, stages)
  const out = args.out || DEFAULT_OUT
  const summaryOut = args.summaryOut === false ? null : args.summaryOut || DEFAULT_SUMMARY_OUT
  writeJson(out, { schema_version: 2, source_repo: summary.source_repo, source_commit: commit, generated_at: new Date().toISOString(), stages, include_fragments: includeFragments, records, source_groups: groups, summary })
  if (summaryOut) writeFileDurable(summaryOut, markdownSummary(summary))
  console.log(JSON.stringify({ valid: true, wrote: out, summary_out: summaryOut, ...summary }, null, 2))
}

main()
