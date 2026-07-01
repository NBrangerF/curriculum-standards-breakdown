#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
const DEFAULT_DOWNLOAD_FALLBACK = true
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 180000
const DEFAULT_DOWNLOAD_RETRIES = 2
const VISION_OCR_SOURCE = 'scripts/grade7_9/vision_ocr.swift'
const VISION_OCR_BINARY = 'generated/textbook_evidence/.tools/vision_ocr'
const DEFAULT_OCR_DPI = 180
const DEFAULT_OCR_BATCH_SIZE = 4
const DEFAULT_OCR_LANGUAGES = 'zh-Hans,en-US'
const MATERIALIZED_STATUSES = new Set(['materialized', 'raw_materialized', 'cached'])

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
    downloadFallback: DEFAULT_DOWNLOAD_FALLBACK,
    downloadTimeoutMs: DEFAULT_DOWNLOAD_TIMEOUT_MS,
    downloadRetries: DEFAULT_DOWNLOAD_RETRIES,
    rawRef: '',
    debugTextDir: '',
    ocrFallback: false,
    ocrDpi: DEFAULT_OCR_DPI,
    ocrBatchSize: DEFAULT_OCR_BATCH_SIZE,
    ocrLanguages: DEFAULT_OCR_LANGUAGES,
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
    else if (item === '--no-download-fallback') args.downloadFallback = false
    else if (item === '--download-timeout-ms') args.downloadTimeoutMs = Number(argv[++i]) || args.downloadTimeoutMs
    else if (item === '--download-retries') args.downloadRetries = Number(argv[++i]) || args.downloadRetries
    else if (item === '--raw-ref') args.rawRef = argv[++i] || ''
    else if (item === '--debug-text-dir') args.debugTextDir = argv[++i] || ''
    else if (item === '--ocr-fallback') args.ocrFallback = true
    else if (item === '--ocr-dpi') args.ocrDpi = Number(argv[++i]) || args.ocrDpi
    else if (item === '--ocr-batch-size') args.ocrBatchSize = Number(argv[++i]) || args.ocrBatchSize
    else if (item === '--ocr-languages') args.ocrLanguages = argv[++i] || args.ocrLanguages
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

When the local blobless Git clone cannot materialize a PDF in time, the script
falls back to raw.githubusercontent.com by default. Use --no-download-fallback
to disable that path or --raw-ref to override the raw download ref. The raw
download path has its own timeout/retry controls because large PDFs can be slow
even when Git blob fetches are timing out.

Use --ocr-fallback on macOS to run Apple Vision OCR when PDF text extraction
does not produce TOC candidates. OCR is intentionally opt-in because it depends
on local rendering and Vision availability.

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

function toolCandidates(name, extra = []) {
  return [
    process.env[name.toUpperCase()],
    ...extra,
    name
  ].filter(Boolean)
}

function runFirstAvailable(candidates, args, options = {}) {
  let lastError = null
  for (const command of candidates) {
    try {
      if (command.includes('/') && !existsSync(command)) continue
      return execFileSync(command, args, options)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error(`No executable found for ${candidates.join(', ')}`)
}

function pdftoppmCandidates() {
  return toolCandidates('pdftoppm', [
    '/Users/shawn.fsc/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/pdftoppm'
  ])
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

function rawDownloadRef(args) {
  const ref = args.rawRef || args.ref || 'master'
  return ref === 'HEAD' ? 'master' : ref
}

function rawUrlFor(record, args) {
  const encodedPath = String(record.repository_path || '')
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/')
  return `https://raw.githubusercontent.com/TapXWorld/ChinaTextbook/${encodeURIComponent(rawDownloadRef(args))}/${encodedPath}`
}

function looksLikeCurlTimeout(result) {
  const text = `${result.stderr || ''}\n${result.stdout || ''}`.toLowerCase()
  return result.status === 28 || text.includes('timed out') || text.includes('timeout')
}

function downloadRawPdf(record, args, gitStatus, gitError) {
  const out = cachePathFor(record, args.cacheDir)
  const temp = `${out}.part`
  const rawUrl = rawUrlFor(record, args)
  const startedAt = Date.now()
  try {
    const result = spawnSync('curl', [
      '--location',
      '--fail',
      '--silent',
      '--show-error',
      '--connect-timeout',
      '20',
      '--max-time',
      String(Math.max(1, Math.ceil(args.downloadTimeoutMs / 1000))),
      '--retry',
      String(Math.max(0, args.downloadRetries)),
      '--retry-all-errors',
      '--retry-delay',
      '2',
      '--retry-max-time',
      String(Math.max(1, Math.ceil(args.downloadTimeoutMs / 1000))),
      '--continue-at',
      '-',
      '--output',
      temp,
      rawUrl
    ], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 16
    })
    if (result.error) throw result.error
    if (result.status !== 0) {
      const status = looksLikeCurlTimeout(result) ? 'raw_materialize_timeout' : 'raw_materialize_failed'
      const partialBytes = existsSync(temp) ? statSync(temp).size : 0
      if (!partialBytes && existsSync(temp)) unlinkSync(temp)
      return {
        status,
        path: out,
        raw_url: rawUrl,
        raw_partial_path: partialBytes ? temp : '',
        raw_partial_bytes: partialBytes,
        error: [
          `${gitStatus}: ${gitError}`,
          `raw_download_exit_${result.status}: ${result.stderr || result.stdout || ''}`.trim()
        ].filter(Boolean).join('\n'),
        timeout_ms: args.downloadTimeoutMs,
        duration_ms: Date.now() - startedAt
      }
    }
    const bytes = existsSync(temp) ? statSync(temp).size : 0
    if (!bytes) {
      if (existsSync(temp)) unlinkSync(temp)
      return {
        status: 'raw_materialize_failed',
        path: out,
        raw_url: rawUrl,
        raw_partial_path: '',
        raw_partial_bytes: 0,
        error: [
          `${gitStatus}: ${gitError}`,
          'raw_download_empty_file'
        ].join('\n'),
        timeout_ms: args.downloadTimeoutMs,
        duration_ms: Date.now() - startedAt
      }
    }
    renameSync(temp, out)
    return {
      status: 'raw_materialized',
      path: out,
      raw_url: rawUrl,
      bytes,
      duration_ms: Date.now() - startedAt,
      fallback_from: gitStatus,
      git_error: gitError
    }
  } catch (error) {
    const partialBytes = existsSync(temp) ? statSync(temp).size : 0
    return {
      status: 'raw_materialize_failed',
      path: out,
      raw_url: rawUrl,
      raw_partial_path: partialBytes ? temp : '',
      raw_partial_bytes: partialBytes,
      error: [
        `${gitStatus}: ${gitError}`,
        error.message
      ].filter(Boolean).join('\n'),
      timeout_ms: args.downloadTimeoutMs,
      duration_ms: Date.now() - startedAt
    }
  }
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
    const status = error.signal === 'SIGTERM' ? 'materialize_timeout' : 'materialize_failed'
    const formattedError = formatExecError(error)
    if (args.downloadFallback) return downloadRawPdf(record, args, status, formattedError)
    return {
      status,
      path: out,
      error: formattedError,
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

function compileVisionWorker() {
  if (!existsSync(VISION_OCR_SOURCE)) throw new Error(`Missing Vision OCR source: ${VISION_OCR_SOURCE}`)
  mkdirSync(dirname(VISION_OCR_BINARY), { recursive: true })
  const needsBuild = !existsSync(VISION_OCR_BINARY) || statSync(VISION_OCR_SOURCE).mtimeMs > statSync(VISION_OCR_BINARY).mtimeMs
  if (needsBuild) execFileSync('swiftc', [VISION_OCR_SOURCE, '-O', '-o', VISION_OCR_BINARY], { stdio: 'inherit' })
  return VISION_OCR_BINARY
}

function renderPageForOcr(pdfPath, page, tempDir, dpi) {
  const prefix = join(tempDir, `page_${String(page).padStart(4, '0')}`)
  runFirstAvailable(pdftoppmCandidates(), [
    '-f', String(page),
    '-l', String(page),
    '-singlefile',
    '-r', String(dpi),
    '-png',
    pdfPath,
    prefix
  ], { stdio: 'pipe' })
  const image = `${prefix}.png`
  if (!existsSync(image)) throw new Error(`Rendered image not found for page ${page}: ${image}`)
  return image
}

function runVisionBatch(worker, images, languages) {
  const result = spawnSync(worker, ['--languages', languages, ...images], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64
  })
  if (result.status !== 0) throw new Error(`Vision OCR failed: ${result.stderr || result.stdout}`)
  const rows = result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  const byFile = new Map(rows.map(row => [row.file, row]))
  return images.map(image => byFile.get(image) || { file: image, text: '', error: 'empty OCR output' })
}

function pageCountFromPdf(pdfPath, maxPages) {
  const extracted = extractPdfText(pdfPath, 0)
  if (extracted.total_pages) return extracted.total_pages
  return maxPages
}

function extractPdfOcrText(pdfPath, args) {
  const startedAt = Date.now()
  try {
    const worker = compileVisionWorker()
    const totalPages = pageCountFromPdf(pdfPath, args.maxPages)
    const pagesToRead = Math.min(totalPages || args.maxPages, args.maxPages)
    const tempDir = mkdtempSync(join(tmpdir(), 'textbook-ocr-'))
    const pages = []
    try {
      for (let batchStart = 1; batchStart <= pagesToRead; batchStart += args.ocrBatchSize) {
        const batchEnd = Math.min(pagesToRead, batchStart + args.ocrBatchSize - 1)
        const rendered = []
        for (let page = batchStart; page <= batchEnd; page += 1) {
          rendered.push({ page, image: renderPageForOcr(pdfPath, page, tempDir, args.ocrDpi) })
        }
        const rows = runVisionBatch(worker, rendered.map(row => row.image), args.ocrLanguages)
        rows.forEach((row, index) => {
          pages.push({
            page: rendered[index].page,
            text: row.text || '',
            chars: (row.text || '').trim().length,
            error: row.error || null
          })
        })
        rendered.forEach(row => unlinkSync(row.image))
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
    const text = pages
      .map(row => [`[[PDF_PAGE:${row.page}]]`, row.text].join('\n'))
      .join('\n')
    return {
      pages_read: pages.length,
      total_pages: totalPages,
      chars: text.trim().length,
      text,
      error: '',
      tool: 'apple_vision',
      duration_ms: Date.now() - startedAt,
      page_chars: pages.map(row => ({ page: row.page, chars: row.chars, error: row.error }))
    }
  } catch (error) {
    return {
      pages_read: 0,
      total_pages: 0,
      chars: 0,
      text: '',
      error: error.message,
      tool: 'apple_vision',
      duration_ms: Date.now() - startedAt,
      page_chars: []
    }
  }
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

function isPageNumberLine(value) {
  return /^\d{1,3}$/u.test(String(value || '').trim())
}

function pendingTocPrefix(line) {
  const normalized = normalizeLeadingSectionNumber(normalizeLine(line))
  if (/^第\s*[一二三四五六七八九十百\d]+\s*[章节单元课]$/u.test(normalized)) return normalized
  const section = normalized.match(/^(\*?\d+\.\d+)-?$/u)
  if (section) return section[1]
  return ''
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

  const section = normalized.match(/^\*?(\d+\.\d+)\s*(.+)$/u)
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
  let current = { pdfPage: null, candidates: [], hasTocHeading: false, pendingPrefix: '', pendingTocChar: '' }
  let pdfPage = null
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const pageMatch = rawLine.match(/^\[\[(?:PDF_PAGE:|PAGE\s+)(\d+)]]$/)
    if (pageMatch) {
      if (current.pdfPage !== null || current.hasTocHeading || current.candidates.length) pages.push(current)
      pdfPage = Number(pageMatch[1])
      current = { pdfPage, candidates: [], hasTocHeading: false, pendingPrefix: '', pendingTocChar: '' }
      continue
    }
    const normalized = normalizeLine(rawLine)
    if (!normalized) continue
    if (isPageNumberLine(normalized)) continue
    if (/^(目录|目 录)$/u.test(normalized)) {
      current.hasTocHeading = true
      current.pendingPrefix = ''
      current.pendingTocChar = ''
      continue
    }
    if (normalized === '目') {
      current.pendingTocChar = '目'
      continue
    }
    if (normalized === '录') {
      current.hasTocHeading = true
      current.pendingTocChar = ''
      continue
    }
    current.pendingTocChar = ''

    const prefix = pendingTocPrefix(normalized)
    if (prefix) {
      current.pendingPrefix = prefix
      continue
    }

    const logicalLine = current.pendingPrefix ? `${current.pendingPrefix} ${normalized}` : rawLine
    const candidate = candidateFromLine(logicalLine, pdfPage)
    if (candidate) current.candidates.push(candidate)
    current.pendingPrefix = ''
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

function writeDebugText(record, text, args, suffix = '') {
  if (!args.debugTextDir) return ''
  mkdirSync(args.debugTextDir, { recursive: true })
  const out = join(args.debugTextDir, `${record.evidence_id}${suffix}.txt`)
  writeFileSync(out, text)
  return out
}

function asOcrCandidates(candidates) {
  return candidates.map(candidate => ({
    ...candidate,
    extraction_method: String(candidate.extraction_method || '').replace(/^pdf_text/, 'ocr_text'),
    confidence: Math.min(candidate.confidence || 0.58, 0.62)
  }))
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
  const byOcrStatus = {}
  for (const record of records) {
    for (const mapping of record.selected_standard_subject_mappings) countInto(bySubject, mapping.subject_slug)
    countInto(byExtractionStatus, record.extraction_status)
    countInto(byTextStatus, record.text_status)
    countInto(byOcrStatus, record.ocr_status)
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
    by_text_status: Object.fromEntries(Object.entries(byTextStatus).sort(([a], [b]) => a.localeCompare(b))),
    by_ocr_status: Object.fromEntries(Object.entries(byOcrStatus).sort(([a], [b]) => a.localeCompare(b)))
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
    .map(file => `| ${file.evidence_id} | ${file.grade_label || ''} | ${file.volume || ''} | ${file.extraction_status || ''} | ${file.text_status || ''} | ${file.ocr_status || ''} | ${file.toc_candidate_count || 0} |`)
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
| raw URL 物化成功 | ${payload.summary.by_extraction_status.raw_materialized || 0} |
| raw URL 物化超时 | ${payload.summary.by_extraction_status.raw_materialize_timeout || 0} |
| OCR 抽取成功 | ${payload.summary.by_ocr_status.ocr_text_extracted || 0} |

## 目录候选粒度

| unit_level | 数量 |
| --- | ---: |
${levelRows}

## 教材文件状态

| evidence_id | 年级 | 册次 | 物化状态 | 文本状态 | OCR 状态 | 目录候选 |
| --- | --- | --- | --- | --- | --- | ---: |
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
  if (!args.rawRef) args.rawRef = index.source_commit || 'master'
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
      toc_candidate_count: 0,
      ocr_status: args.ocrFallback ? 'not_run' : 'disabled'
    }
    let candidates = []

    if (args.materialize) {
      const materialized = materializePdf(record, args)
      file.extraction_status = materialized.status
      file.cache_path = materialized.path
      file.materialize_error = materialized.error || ''
      file.materialize_raw_url = materialized.raw_url || ''
      file.materialize_raw_partial_path = materialized.raw_partial_path || ''
      file.materialize_raw_partial_bytes = materialized.raw_partial_bytes || 0
      file.materialize_fallback_from = materialized.fallback_from || ''
      file.materialize_git_error = materialized.git_error || ''
      file.materialize_duration_ms = materialized.duration_ms || null
      if (MATERIALIZED_STATUSES.has(materialized.status)) {
        const extracted = extractPdfText(materialized.path, args.maxPages)
        file.text_status = extracted.error ? 'text_extract_failed' : extracted.chars > 0 ? 'text_extracted' : 'empty_text'
        file.text_error = extracted.error || ''
        file.text_tool = extracted.tool || ''
        file.pages_read = extracted.pages_read
        file.total_pages = extracted.total_pages
        file.text_chars = extracted.chars
        file.debug_text_path = extracted.error ? '' : writeDebugText(record, extracted.text, args)
        candidates = extracted.error ? [] : extractTocCandidates(extracted.text)

        if (args.ocrFallback && !candidates.length) {
          const ocr = extractPdfOcrText(materialized.path, args)
          file.ocr_status = ocr.error ? 'ocr_failed' : ocr.chars > 0 ? 'ocr_text_extracted' : 'ocr_empty_text'
          file.ocr_error = ocr.error || ''
          file.ocr_tool = ocr.tool
          file.ocr_duration_ms = ocr.duration_ms
          file.ocr_pages_read = ocr.pages_read
          file.ocr_chars = ocr.chars
          file.ocr_page_chars = ocr.page_chars
          file.debug_ocr_text_path = ocr.error ? '' : writeDebugText(record, ocr.text, args, '.ocr')
          if (!ocr.error && ocr.chars > 0) {
            candidates = asOcrCandidates(extractTocCandidates(ocr.text))
            if (candidates.length) file.text_status = 'ocr_text_extracted'
          }
        }
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
      download_fallback: args.downloadFallback,
      download_timeout_ms: args.downloadTimeoutMs,
      download_retries: args.downloadRetries,
      raw_ref: rawDownloadRef(args),
      ocr_fallback: args.ocrFallback,
      ocr_dpi: args.ocrDpi,
      ocr_batch_size: args.ocrBatchSize,
      ocr_languages: args.ocrLanguages,
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
