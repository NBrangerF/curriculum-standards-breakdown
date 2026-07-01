#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_TEXTBOOK_INDEX = 'generated/textbook_evidence/china_textbook_index.json'
const DEFAULT_REPO_DIR = 'generated/external/ChinaTextbook'
const DEFAULT_REF = 'HEAD'
const DEFAULT_CACHE_DIR = 'generated/textbook_evidence/pdf_cache'
const DEFAULT_OUT = 'generated/textbook_evidence/textbook_unit_index.json'
const DEFAULT_SUMMARY_OUT = 'generated/textbook_evidence/textbook_unit_index_summary.md'
const DEFAULT_MAX_FILES = 24
const DEFAULT_MAX_PAGES = 18
const DEFAULT_MATERIALIZE_TIMEOUT_MS = 60000

function parseArgs(argv) {
  const args = {
    textbookIndex: DEFAULT_TEXTBOOK_INDEX,
    repoDir: DEFAULT_REPO_DIR,
    ref: DEFAULT_REF,
    cacheDir: DEFAULT_CACHE_DIR,
    out: DEFAULT_OUT,
    summaryOut: DEFAULT_SUMMARY_OUT,
    subjects: [],
    grades: [],
    evidenceIds: [],
    maxFiles: DEFAULT_MAX_FILES,
    maxPages: DEFAULT_MAX_PAGES,
    materializeTimeoutMs: DEFAULT_MATERIALIZE_TIMEOUT_MS,
    debugTextDir: '',
    all: false,
    materialize: false,
    force: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--textbook-index') args.textbookIndex = argv[++i]
    else if (item === '--repo-dir') args.repoDir = argv[++i]
    else if (item === '--ref') args.ref = argv[++i]
    else if (item === '--cache-dir') args.cacheDir = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--summary-out') args.summaryOut = argv[++i]
    else if (item === '--subjects') args.subjects = splitArg(argv[++i])
    else if (item === '--grades') args.grades = splitArg(argv[++i])
    else if (item === '--evidence-ids') args.evidenceIds = splitArg(argv[++i])
    else if (item === '--max-files') args.maxFiles = Number(argv[++i]) || args.maxFiles
    else if (item === '--max-pages') args.maxPages = Number(argv[++i]) || args.maxPages
    else if (item === '--materialize-timeout-ms') args.materializeTimeoutMs = Number(argv[++i]) || args.materializeTimeoutMs
    else if (item === '--debug-text-dir') args.debugTextDir = argv[++i] || ''
    else if (item === '--all') args.all = true
    else if (item === '--materialize') args.materialize = true
    else if (item === '--force') args.force = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/build_textbook_unit_index.js \\
  --subjects math,science \\
  --max-files 8 \\
  --evidence-ids ctb_48072359f7df \\
  --materialize

Builds a first-pass textbook unit/chapter candidate index from the
ChinaTextbook evidence index. Without --materialize it only emits file-level
volume seeds. With --materialize it lazily extracts selected PDF blobs from the
local Git clone into generated/textbook_evidence/pdf_cache and attempts to parse
table-of-contents / chapter lines from the first pages.

Use --evidence-ids for deterministic small-batch exploration. Use
--materialize-timeout-ms to prevent Git LFS/blob fetches from hanging an audit
run. Use --debug-text-dir with --materialize to save extracted PDF text for
manual parser inspection.

This script never writes to public/data.`)
}

function splitArg(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

function hashText(value, length = 12) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)
}

function git(repoDir, args, options = {}) {
  return execFileSync('git', ['-C', repoDir, '-c', 'core.quotePath=false', ...args], {
    maxBuffer: 1024 * 1024 * 256,
    ...options
  })
}

function pythonCandidates() {
  return [
    process.env.PYTHON,
    process.env.CODEX_PYTHON,
    '/Users/shawn.fsc/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',
    'python3'
  ].filter(Boolean)
}

function selectedSubjectMappings(record, subjects) {
  const mappings = record.standard_subject_mappings || []
  if (!subjects.length) return mappings
  const allowed = new Set(subjects)
  return mappings.filter(mapping => allowed.has(mapping.subject_slug))
}

function gradeAllowed(record, grades) {
  if (!grades.length) return true
  const values = new Set(grades.map(String))
  return values.has(String(record.grade)) || values.has(String(record.grade_label))
}

function selectRecords(index, args) {
  const evidenceIds = new Set(args.evidenceIds)
  const records = (index.records || [])
    .map(record => ({
      ...record,
      selected_standard_subject_mappings: selectedSubjectMappings(record, args.subjects)
    }))
    .filter(record => record.selected_standard_subject_mappings.length)
    .filter(record => gradeAllowed(record, args.grades))
    .filter(record => !evidenceIds.size || evidenceIds.has(record.evidence_id))
    .filter(record => record.extension === 'pdf' && !record.is_fragment)
  if (evidenceIds.size) {
    const byId = new Map(records.map(record => [record.evidence_id, record]))
    return args.evidenceIds.map(id => byId.get(id)).filter(Boolean)
  }
  return records
    .sort((a, b) => {
      const subject = a.selected_standard_subject_mappings[0].subject_slug.localeCompare(b.selected_standard_subject_mappings[0].subject_slug)
      if (subject !== 0) return subject
      const grade = (a.grade || 0) - (b.grade || 0)
      if (grade !== 0) return grade
      const textbook = String(a.textbook_subject || '').localeCompare(String(b.textbook_subject || ''))
      if (textbook !== 0) return textbook
      const edition = String(a.edition || '').localeCompare(String(b.edition || ''))
      if (edition !== 0) return edition
      return String(a.file_name || '').localeCompare(String(b.file_name || ''))
    })
    .slice(0, args.all ? undefined : Math.max(0, args.maxFiles))
}

function cachePathFor(record, cacheDir) {
  return join(cacheDir, `${record.evidence_id}.pdf`)
}

function materializePdf(record, args) {
  const out = cachePathFor(record, args.cacheDir)
  if (existsSync(out) && !args.force) {
    return { status: 'cached', path: out }
  }
  mkdirSync(dirname(out), { recursive: true })
  try {
    const startedAt = Date.now()
    const buffer = git(args.repoDir, ['show', `${args.ref}:${record.repository_path}`], {
      timeout: args.materializeTimeoutMs
    })
    writeFileSync(out, buffer)
    return {
      status: 'materialized',
      path: out,
      bytes: buffer.length,
      duration_ms: Date.now() - startedAt
    }
  } catch (error) {
    return {
      status: error.signal === 'SIGTERM' ? 'materialize_timeout' : 'materialize_failed',
      path: out,
      error: formatExecError(error),
      timeout_ms: args.materializeTimeoutMs
    }
  }
}

function formatExecError(error) {
  const pieces = [
    error.message,
    error.stderr ? String(error.stderr) : '',
    error.stdout ? String(error.stdout) : ''
  ].filter(Boolean)
  return pieces.join('\n').trim()
}

function extractPdfText(pdfPath, maxPages) {
  const script = String.raw`
import json, sys
path = sys.argv[1]
max_pages = int(sys.argv[2])
result = {"pages_read": 0, "total_pages": 0, "chars": 0, "text": "", "error": None, "tool": "pypdf"}
try:
    from pypdf import PdfReader
    reader = PdfReader(path)
    result["total_pages"] = len(reader.pages)
    texts = []
    for index, page in enumerate(reader.pages[:max_pages]):
        text = page.extract_text() or ""
        texts.append(f"[[PDF_PAGE:{index + 1}]]\n{text}")
    result["pages_read"] = min(max_pages, len(reader.pages))
    result["text"] = "\n".join(texts)
    result["chars"] = len(result["text"].strip())
except Exception as exc:
    result["error"] = str(exc)
print(json.dumps(result, ensure_ascii=False))
`
  for (const python of pythonCandidates()) {
    const result = spawnSync(python, ['-c', script, pdfPath, String(maxPages)], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 64
    })
    if (result.status === 0 && result.stdout.trim()) return JSON.parse(result.stdout)
  }
  return { pages_read: 0, total_pages: 0, chars: 0, text: '', error: 'no usable python/pypdf runtime', tool: 'none' }
}

function stripPdfExtension(name) {
  return String(name || '')
    .replace(/\.pdf$/i, '')
    .replace(/^义务教育教科书[·:：]?/, '')
    .trim()
}

function normalizeLine(line) {
  return String(line || '')
    .replace(/\u0000/g, ' ')
    .replace(/[０-９]/g, char => String(char.charCodeAt(0) - 0xFF10))
    .replace(/[．。]/g, '.')
    .replace(/[－—–]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[•●]/g, '')
    .replace(/\s*\.\s*/g, '.')
    .replace(/[\.．·…]{2,}\s*\d+\s*$/u, '')
    .replace(/\s+\d+\s*$/u, '')
    .trim()
}

function normalizeLeadingSectionNumber(line) {
  return String(line || '').replace(
    /^((?:\d\s*){1,2})\.\s*((?:\d\s*){0,1}\d)(?=\s|\p{Script=Han})/u,
    (_, chapter, section) => `${chapter.replace(/\s+/g, '')}.${section.replace(/\s+/g, '')}`
  )
}

function hanCount(value) {
  return (String(value || '').match(/\p{Script=Han}/gu) || []).length
}

function stripTocPageTail(value) {
  return String(value || '')
    .replace(/\s+(?:\d+\s*){1,3}(阅读与思考|实验与探究|观察与猜想|信息技术应用|数学活动|小结|复习题|部分中英文词汇索引).*$/u, '')
    .replace(/\s+(?:\d+\s*){1,3}$/u, '')
    .replace(/(?<=\p{Script=Han})\d(?:\s*\d){0,2}$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function readableUnitTitle(value) {
  const title = String(value || '').trim()
  if (title.length < 2 || title.length > 70) return false
  if (/[\u0000-\u001F\u007F]/u.test(title)) return false
  if (hanCount(title) < 1) return false
  if (/^[\d.\s-]+$/u.test(title)) return false
  return true
}

function candidateFromLine(line, pdfPage) {
  const normalized = normalizeLeadingSectionNumber(normalizeLine(line))
  if (!normalized || normalized.length < 3 || normalized.length > 80) return null
  if (/^(目录|目 录|contents|CONTENTS)$/i.test(normalized)) return null
  if (/^(前言|编者的话|后记|附录|封面|版权|出版说明)$/u.test(normalized)) return null

  const strong = normalized.match(/^(第\s*[一二三四五六七八九十百\d]+\s*[章节单元课])\s*[：:、.\s-]*(.+)$/u)
  if (strong) {
    const title = `${strong[1].replace(/\s+/g, '')} ${stripTocPageTail(strong[2])}`
    if (!readableUnitTitle(title)) return null
    return {
      candidate_type: 'toc_unit_or_chapter',
      extraction_method: 'pdf_text_toc_line',
      unit_level: /章/u.test(strong[1]) ? 'chapter' : 'unit',
      unit_title: title,
      matched_line: normalized,
      pdf_page_hint: pdfPage,
      confidence: 0.72
    }
  }

  const section = normalized.match(/^(\d+(?:\.\d+)+)\s+(.+)$/u)
  if (section) {
    const title = `${section[1]} ${stripTocPageTail(section[2])}`
    if (!readableUnitTitle(title)) return null
    return {
      candidate_type: 'toc_unit_or_chapter',
      extraction_method: 'pdf_text_toc_section_line',
      unit_level: 'section',
      unit_title: title,
      matched_line: normalized,
      pdf_page_hint: pdfPage,
      confidence: 0.66
    }
  }

  const numbered = normalized.match(/^([一二三四五六七八九十]+)[、.]\s*(.{2,60})$/u)
  if (numbered) {
    const title = stripTocPageTail(numbered[2])
    if (!readableUnitTitle(title)) return null
    return {
      candidate_type: 'toc_unit_or_chapter',
      extraction_method: 'pdf_text_numbered_line',
      unit_level: 'numbered_item',
      unit_title: title,
      matched_line: normalized,
      pdf_page_hint: pdfPage,
      confidence: 0.58
    }
  }

  return null
}

function extractTocCandidates(text) {
  const pages = []
  let current = { pdfPage: null, candidates: [], hasTocHeading: false }
  let pdfPage = null
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const pageMatch = rawLine.match(/^\[\[PDF_PAGE:(\d+)]]$/)
    if (pageMatch) {
      if (current.pdfPage !== null || current.hasTocHeading || current.candidates.length) pages.push(current)
      pdfPage = Number(pageMatch[1])
      current = { pdfPage, candidates: [], hasTocHeading: false }
      continue
    }
    const normalized = normalizeLine(rawLine)
    if (/^(目录|目 录)$/u.test(normalized)) current.hasTocHeading = true
    const candidate = candidateFromLine(rawLine, pdfPage)
    if (candidate) current.candidates.push(candidate)
  }
  if (current.pdfPage !== null || current.hasTocHeading || current.candidates.length) pages.push(current)

  const out = selectTocWindowCandidates(pages)
  const seen = new Set()
  return out.filter(candidate => {
    const key = candidate.unit_title
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function selectTocWindowCandidates(pages) {
  const hasTocWindow = pages.some(page => page.hasTocHeading)
  if (!hasTocWindow) return pages.flatMap(page => page.candidates)

  const out = []
  let inTocWindow = false
  for (const page of pages) {
    if (page.hasTocHeading) inTocWindow = true
    if (!inTocWindow) continue

    const looksLikeTocPage = page.hasTocHeading || page.candidates.length >= 2
    if (!looksLikeTocPage) {
      if (out.length) break
      continue
    }
    out.push(...page.candidates)
  }
  return out
}

function writeDebugText(record, text, args) {
  if (!args.debugTextDir) return ''
  mkdirSync(args.debugTextDir, { recursive: true })
  const out = join(args.debugTextDir, `${record.evidence_id}.txt`)
  writeFileSync(out, text)
  return out
}

function volumeSeed(record) {
  return {
    candidate_type: 'volume_seed',
    extraction_method: 'textbook_file_name',
    unit_title: stripPdfExtension(record.file_name),
    matched_line: record.file_name,
    pdf_page_hint: null,
    confidence: 0.2
  }
}

function buildUnitCandidate(record, candidate, mapping) {
  const seed = [
    record.evidence_id,
    mapping.subject_slug,
    candidate.candidate_type,
    candidate.unit_title,
    candidate.pdf_page_hint
  ].join('|')
  return {
    unit_evidence_id: `ctu_${hashText(seed, 14)}`,
    textbook_evidence_id: record.evidence_id,
    subject_slug: mapping.subject_slug,
    evidence_role: mapping.evidence_role,
    stage: record.stage,
    textbook_subject: record.textbook_subject,
    edition: record.edition,
    grade: record.grade,
    grade_label: record.grade_label,
    volume: record.volume,
    file_name: record.file_name,
    repository_path: record.repository_path,
    evidence_url: record.evidence_url,
    ...candidate,
    evidence_granularity: candidate.candidate_type === 'toc_unit_or_chapter'
      ? 'textbook_unit_or_chapter_candidate'
      : 'textbook_file_grade_level',
    requires_review: true
  }
}

function countInto(target, key, amount = 1) {
  const normalized = key || 'missing'
  target[normalized] = (target[normalized] || 0) + amount
}

function summarize(records, unitCandidates) {
  const bySubject = {}
  const byCandidateType = {}
  const byUnitLevel = {}
  const byExtractionStatus = {}
  const byTextStatus = {}
  for (const record of records) {
    for (const mapping of record.selected_standard_subject_mappings) countInto(bySubject, mapping.subject_slug)
    countInto(byExtractionStatus, record.extraction_status)
    countInto(byTextStatus, record.text_status)
  }
  for (const candidate of unitCandidates) {
    countInto(byCandidateType, candidate.candidate_type)
    if (candidate.candidate_type === 'toc_unit_or_chapter') countInto(byUnitLevel, candidate.unit_level || 'missing')
  }
  return {
    textbook_files: records.length,
    unit_candidates: unitCandidates.length,
    real_unit_or_chapter_candidates: unitCandidates.filter(item => item.candidate_type === 'toc_unit_or_chapter').length,
    volume_seed_candidates: unitCandidates.filter(item => item.candidate_type === 'volume_seed').length,
    by_subject: Object.fromEntries(Object.entries(bySubject).sort(([a], [b]) => a.localeCompare(b))),
    by_candidate_type: Object.fromEntries(Object.entries(byCandidateType).sort(([a], [b]) => a.localeCompare(b))),
    by_unit_level: Object.fromEntries(Object.entries(byUnitLevel).sort(([a], [b]) => a.localeCompare(b))),
    by_extraction_status: Object.fromEntries(Object.entries(byExtractionStatus).sort(([a], [b]) => a.localeCompare(b))),
    by_text_status: Object.fromEntries(Object.entries(byTextStatus).sort(([a], [b]) => a.localeCompare(b)))
  }
}

function markdownSummary(payload) {
  const rows = Object.entries(payload.summary.by_subject)
    .map(([subject, count]) => `| ${subject} | ${count} |`)
    .join('\n')
  const levelRows = Object.entries(payload.summary.by_unit_level || {})
    .map(([level, count]) => `| ${level} | ${count} |`)
    .join('\n') || '| - | 0 |'
  const fileRows = payload.textbook_files
    .map(file => `| ${file.evidence_id} | ${file.grade_label || ''} | ${file.volume || ''} | ${file.extraction_status || ''} | ${file.text_status || ''} | ${file.toc_candidate_count || 0} |`)
    .join('\n')
  return `# Textbook Unit Candidate Index

生成时间：${payload.generated_at}

来源：${payload.source_repo}

commit：\`${payload.source_commit}\`

## 摘要

| 指标 | 数量 |
| --- | ---: |
| 教材文件 | ${payload.summary.textbook_files} |
| 候选证据 | ${payload.summary.unit_candidates} |
| 目录/章节候选 | ${payload.summary.real_unit_or_chapter_candidates} |
| 文件名卷册 seed | ${payload.summary.volume_seed_candidates} |
| PDF 物化超时 | ${payload.summary.by_extraction_status.materialize_timeout || 0} |

## 目录候选粒度

| unit_level | 数量 |
| --- | ---: |
${levelRows}

## 教材文件状态

| evidence_id | 年级 | 册次 | 物化状态 | 文本状态 | 目录候选 |
| --- | --- | --- | --- | --- | ---: |
${fileRows}

## 学科覆盖

| subject_slug | 教材文件 |
| --- | ---: |
${rows}

说明：\`toc_unit_or_chapter\` 才能作为后续标准-教材单元匹配的候选；\`volume_seed\` 只是文件/册次级占位，不能证明单元级对应关系。
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }
  if (!existsSync(args.textbookIndex)) throw new Error(`Missing textbook index: ${args.textbookIndex}`)
  if (args.materialize && !existsSync(args.repoDir)) throw new Error(`Missing ChinaTextbook repo: ${args.repoDir}`)

  const index = readJson(args.textbookIndex)
  const records = selectRecords(index, args)
  const textbookFiles = []
  const unitCandidates = []

  for (const record of records) {
    const file = {
      ...record,
      cache_path: cachePathFor(record, args.cacheDir),
      extraction_status: args.materialize ? 'pending' : 'not_materialized',
      text_status: args.materialize ? 'pending' : 'not_read',
      materialize_timeout_ms: args.materialize ? args.materializeTimeoutMs : null,
      toc_candidate_count: 0
    }
    let candidates = []

    if (args.materialize) {
      const materialized = materializePdf(record, args)
      file.extraction_status = materialized.status
      file.cache_path = materialized.path
      file.materialize_error = materialized.error || ''
      file.materialize_duration_ms = materialized.duration_ms || null
      if (materialized.status === 'materialized' || materialized.status === 'cached') {
        const extracted = extractPdfText(materialized.path, args.maxPages)
        file.text_status = extracted.error ? 'text_extract_failed' : extracted.chars > 0 ? 'text_extracted' : 'empty_text'
        file.text_error = extracted.error || ''
        file.pages_read = extracted.pages_read
        file.total_pages = extracted.total_pages
        file.text_chars = extracted.chars
        file.debug_text_path = extracted.error ? '' : writeDebugText(record, extracted.text, args)
        candidates = extracted.error ? [] : extractTocCandidates(extracted.text)
      }
    }

    if (!candidates.length) candidates = [volumeSeed(record)]
    file.toc_candidate_count = candidates.filter(candidate => candidate.candidate_type === 'toc_unit_or_chapter').length
    for (const mapping of record.selected_standard_subject_mappings) {
      for (const candidate of candidates) unitCandidates.push(buildUnitCandidate(record, candidate, mapping))
    }
    textbookFiles.push(file)
  }

  const payload = {
    source_repo: index.source_repo || 'https://github.com/TapXWorld/ChinaTextbook',
    source_commit: index.source_commit || null,
    generated_at: new Date().toISOString(),
    textbook_index: args.textbookIndex,
    extraction: {
      materialize: args.materialize,
      all: args.all,
      evidence_ids: args.evidenceIds,
      max_files: args.all ? null : args.maxFiles,
      max_pages: args.maxPages,
      materialize_timeout_ms: args.materializeTimeoutMs,
      debug_text_dir: args.debugTextDir || null,
      subjects: args.subjects,
      grades: args.grades
    },
    summary: summarize(textbookFiles, unitCandidates),
    textbook_files: textbookFiles,
    unit_candidates: unitCandidates
  }

  writeJson(args.out, payload)
  if (args.summaryOut) {
    mkdirSync(dirname(args.summaryOut), { recursive: true })
    writeFileSync(args.summaryOut, markdownSummary(payload))
  }
  console.log(JSON.stringify({
    wrote: args.out,
    summary_out: args.summaryOut || null,
    ...payload.summary
  }, null, 2))
}

main()
