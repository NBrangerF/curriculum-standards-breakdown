#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_WORKLIST = 'generated/textbook_evidence/h4g_unit_evidence_worklist.json'
const DEFAULT_TEXTBOOK_INDEX = 'generated/textbook_evidence/china_textbook_index.json'
const DEFAULT_CACHE_DIR = 'generated/textbook_evidence/pdf_cache'
const DEFAULT_OUT = 'generated/textbook_evidence/h4g_pdf_prefetch_summary.json'
const DEFAULT_ATTEMPT_TIMEOUT_MS = 180000
const DEFAULT_HEAD_TIMEOUT_MS = 30000
const DEFAULT_MAX_ATTEMPTS_PER_FILE = 2
const DEFAULT_CONNECT_TIMEOUT_SECONDS = 20
const DEFAULT_RAW_IPS = ['185.199.108.133', '185.199.109.133', '185.199.110.133', '185.199.111.133']

function parseArgs(argv) {
  const args = {
    worklist: DEFAULT_WORKLIST,
    textbookIndex: DEFAULT_TEXTBOOK_INDEX,
    cacheDir: DEFAULT_CACHE_DIR,
    out: DEFAULT_OUT,
    workItem: '',
    subject: '',
    edition: '',
    evidenceIds: [],
    rawRef: '',
    rawIps: DEFAULT_RAW_IPS,
    attemptTimeoutMs: DEFAULT_ATTEMPT_TIMEOUT_MS,
    headTimeoutMs: DEFAULT_HEAD_TIMEOUT_MS,
    maxAttemptsPerFile: DEFAULT_MAX_ATTEMPTS_PER_FILE,
    connectTimeoutSeconds: DEFAULT_CONNECT_TIMEOUT_SECONDS,
    requireComplete: false,
    strict: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--worklist') args.worklist = argv[++i]
    else if (item === '--textbook-index') args.textbookIndex = argv[++i]
    else if (item === '--cache-dir') args.cacheDir = argv[++i]
    else if (item === '--out') args.out = argv[++i]
    else if (item === '--work-item') args.workItem = argv[++i]
    else if (item === '--subject') args.subject = argv[++i]
    else if (item === '--edition') args.edition = argv[++i]
    else if (item === '--evidence-ids') args.evidenceIds = splitArg(argv[++i])
    else if (item === '--raw-ref') args.rawRef = argv[++i] || ''
    else if (item === '--raw-ips') args.rawIps = splitArg(argv[++i])
    else if (item === '--attempt-timeout-ms') args.attemptTimeoutMs = Number(argv[++i]) || args.attemptTimeoutMs
    else if (item === '--head-timeout-ms') args.headTimeoutMs = Number(argv[++i]) || args.headTimeoutMs
    else if (item === '--max-attempts-per-file') args.maxAttemptsPerFile = Number(argv[++i]) || args.maxAttemptsPerFile
    else if (item === '--connect-timeout-seconds') args.connectTimeoutSeconds = Number(argv[++i]) || args.connectTimeoutSeconds
    else if (item === '--require-complete') args.requireComplete = true
    else if (item === '--strict') args.strict = true
    else if (item === '--help') args.help = true
  }
  return args
}

function usage() {
  console.log(`Usage:
node scripts/textbooks/prefetch_h4g_work_item_pdfs.js \\
  --work-item h4g_unit_work_math_5c7ee1b3

Downloads or resumes the PDF cache for one H4G unit-evidence work item.
This script only writes generated/textbook_evidence/pdf_cache and a summary;
it never writes public/data.`)
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

function findWorkItem(worklist, args) {
  const items = worklist.recommended_work_items || []
  if (args.workItem) return items.find(item => item.work_item_id === args.workItem)
  if (args.subject && args.edition) return items.find(item => item.subject === args.subject && item.edition === args.edition)
  if (args.subject) return items.find(item => item.subject === args.subject)
  return null
}

function rawDownloadRef(index, args) {
  return args.rawRef || index.textbook_source_commit || index.source_commit || 'master'
}

function rawUrlFor(record, index, args) {
  const encodedPath = String(record.repository_path || '')
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/')
  return `https://raw.githubusercontent.com/TapXWorld/ChinaTextbook/${encodeURIComponent(rawDownloadRef(index, args))}/${encodedPath}`
}

function appendResolveArgs(target, rawIps, attemptIndex) {
  if (!rawIps.length) return target
  const ip = rawIps[attemptIndex % rawIps.length]
  return [...target, '--resolve', `raw.githubusercontent.com:443:${ip}`]
}

function cachePaths(record, args) {
  const pdf = join(args.cacheDir, `${record.evidence_id}.pdf`)
  return { pdf, part: `${pdf}.part` }
}

function fileSize(path) {
  return existsSync(path) ? statSync(path).size : 0
}

function looksLikeCompletePdf(path) {
  if (!existsSync(path) || fileSize(path) < 8) return false
  const content = readFileSync(path)
  const head = content.subarray(0, Math.min(8, content.length)).toString('latin1')
  const tail = content.subarray(Math.max(0, content.length - 4096)).toString('latin1')
  return head.includes('%PDF-') && tail.includes('%%EOF')
}

function parseHead(stdout) {
  const chunks = String(stdout || '').split(/\r?\n\r?\n/).filter(Boolean)
  const last = chunks[chunks.length - 1] || ''
  const statusLine = (last.match(/^HTTP\/\S+\s+(\d+)/mi) || [])[1] || ''
  const lengths = [...String(stdout || '').matchAll(/^content-length:\s*(\d+)/gmi)].map(match => Number(match[1]))
  return {
    status: statusLine ? Number(statusLine) : null,
    content_length: lengths.length ? lengths[lengths.length - 1] : null,
    accept_ranges: /^accept-ranges:\s*bytes/im.test(last)
  }
}

function headRaw(url, args) {
  const command = appendResolveArgs([
    '--location',
    '--head',
    '--silent',
    '--show-error',
    '--connect-timeout',
    String(args.connectTimeoutSeconds),
    '--max-time',
    String(Math.max(1, Math.ceil(args.headTimeoutMs / 1000))),
    url
  ], args.rawIps, 0)
  const result = spawnSync('curl', command, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 4,
    timeout: args.headTimeoutMs + 5000,
    killSignal: 'SIGTERM'
  })
  return {
    ok: result.status === 0,
    status: result.status,
    signal: result.signal || '',
    error: result.error?.message || '',
    stderr: result.stderr || '',
    headers: parseHead(result.stdout)
  }
}

function downloadAttempt(url, paths, args, attemptIndex) {
  mkdirSync(dirname(paths.pdf), { recursive: true })
  const command = appendResolveArgs([
    '--location',
    '--fail',
    '--silent',
    '--show-error',
    '--connect-timeout',
    String(args.connectTimeoutSeconds),
    '--max-time',
    String(Math.max(1, Math.ceil(args.attemptTimeoutMs / 1000))),
    '--retry',
    '0',
    '--continue-at',
    '-',
    '--output',
    paths.part,
    url
  ], args.rawIps, attemptIndex)
  const startedAt = Date.now()
  const before = fileSize(paths.part)
  const result = spawnSync('curl', command, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 4,
    timeout: args.attemptTimeoutMs + 5000,
    killSignal: 'SIGTERM'
  })
  return {
    ok: result.status === 0,
    status: result.status,
    signal: result.signal || '',
    error: result.error?.message || '',
    stderr: String(result.stderr || '').trim(),
    stdout: String(result.stdout || '').trim(),
    before_bytes: before,
    after_bytes: fileSize(paths.part),
    downloaded_bytes: Math.max(0, fileSize(paths.part) - before),
    duration_ms: Date.now() - startedAt,
    raw_ip: args.rawIps.length ? args.rawIps[attemptIndex % args.rawIps.length] : ''
  }
}

function isComplete(paths, expectedBytes) {
  const pdfBytes = fileSize(paths.pdf)
  if (!pdfBytes || !looksLikeCompletePdf(paths.pdf)) return false
  if (expectedBytes) return pdfBytes >= expectedBytes
  return true
}

function prefetchRecord(record, index, args) {
  const paths = cachePaths(record, args)
  const url = rawUrlFor(record, index, args)
  const head = headRaw(url, args)
  const expectedBytes = head.headers.content_length || 0
  const row = {
    evidence_id: record.evidence_id,
    file_name: record.file_name,
    subject: record.textbook_subject,
    grade: record.grade,
    grade_label: record.grade_label,
    edition: record.edition,
    volume: record.volume,
    repository_path: record.repository_path,
    raw_url_hash: hashText(url),
    expected_bytes: expectedBytes || null,
    accept_ranges: head.headers.accept_ranges,
    head_status: head.headers.status,
    cache_path: paths.pdf,
    partial_path: paths.part,
    starting_cached_bytes: fileSize(paths.pdf),
    starting_partial_bytes: fileSize(paths.part),
    starting_cached_pdf_complete: looksLikeCompletePdf(paths.pdf),
    attempts: []
  }

  if (isComplete(paths, expectedBytes)) {
    row.status = 'cached'
    row.final_cached_bytes = fileSize(paths.pdf)
    row.final_partial_bytes = fileSize(paths.part)
    return row
  }

  for (let attempt = 0; attempt < args.maxAttemptsPerFile; attempt += 1) {
    const result = downloadAttempt(url, paths, args, attempt)
    row.attempts.push(result)
    const partComplete = expectedBytes
      ? fileSize(paths.part) >= expectedBytes && looksLikeCompletePdf(paths.part)
      : looksLikeCompletePdf(paths.part)
    if (partComplete) {
      renameSync(paths.part, paths.pdf)
      break
    }
  }

  row.final_cached_bytes = fileSize(paths.pdf)
  row.final_partial_bytes = fileSize(paths.part)
  row.final_cached_pdf_complete = looksLikeCompletePdf(paths.pdf)
  row.status = isComplete(paths, expectedBytes)
    ? 'cached'
    : row.final_partial_bytes > row.starting_partial_bytes
      ? 'partial_progress'
      : row.final_partial_bytes > 0
        ? 'partial_no_progress'
        : 'missing'
  return row
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    process.exit(0)
  }

  const errors = []
  if (!existsSync(args.textbookIndex)) errors.push(`Missing textbook index: ${args.textbookIndex}`)
  if (!args.evidenceIds.length && !existsSync(args.worklist)) errors.push(`Missing worklist: ${args.worklist}`)
  if (!args.evidenceIds.length && !args.workItem && !args.subject) errors.push('Use --work-item, --subject, or --evidence-ids.')
  if (errors.length) {
    console.log(JSON.stringify({ valid: false, errors }, null, 2))
    process.exit(1)
  }

  const index = readJson(args.textbookIndex)
  const recordsById = new Map((index.records || []).map(record => [record.evidence_id, record]))
  const worklist = args.evidenceIds.length ? null : readJson(args.worklist)
  const workItem = worklist ? findWorkItem(worklist, args) : null
  const evidenceIds = args.evidenceIds.length ? args.evidenceIds : (workItem?.evidence_ids || [])
  if (!evidenceIds.length) {
    console.log(JSON.stringify({ valid: false, errors: ['No evidence IDs selected.'] }, null, 2))
    process.exit(1)
  }

  const selectedRecords = []
  for (const id of evidenceIds) {
    const record = recordsById.get(id)
    if (record) selectedRecords.push(record)
    else errors.push(`Unknown evidence_id: ${id}`)
  }

  const summary = {
    valid: false,
    generated_at: new Date().toISOString(),
    textbook_index: args.textbookIndex,
    textbook_source_commit: rawDownloadRef(index, args),
    worklist: args.evidenceIds.length ? null : args.worklist,
    work_item: workItem ? {
      work_item_id: workItem.work_item_id,
      subject: workItem.subject,
      subject_label: workItem.subject_label,
      edition: workItem.edition,
      evidence_ids: workItem.evidence_ids
    } : null,
    options: {
      cache_dir: args.cacheDir,
      attempt_timeout_ms: args.attemptTimeoutMs,
      head_timeout_ms: args.headTimeoutMs,
      max_attempts_per_file: args.maxAttemptsPerFile,
      raw_ips: args.rawIps,
      require_complete: args.requireComplete
    },
    rows: [],
    totals: {},
    errors
  }

  for (const record of selectedRecords) {
    console.error(`[h4g-pdf-prefetch] ${record.evidence_id} ${record.edition || ''} ${record.grade_label || ''}${record.volume || ''}`)
    summary.rows.push(prefetchRecord(record, index, args))
  }

  const totals = {
    selected: summary.rows.length,
    cached: summary.rows.filter(row => row.status === 'cached').length,
    partial_progress: summary.rows.filter(row => row.status === 'partial_progress').length,
    partial_no_progress: summary.rows.filter(row => row.status === 'partial_no_progress').length,
    missing: summary.rows.filter(row => row.status === 'missing').length,
    total_cached_bytes: summary.rows.reduce((sum, row) => sum + (row.final_cached_bytes || 0), 0),
    total_partial_bytes: summary.rows.reduce((sum, row) => sum + (row.final_partial_bytes || 0), 0),
    total_attempt_downloaded_bytes: summary.rows.reduce((sum, row) => sum + row.attempts.reduce((inner, attempt) => inner + attempt.downloaded_bytes, 0), 0)
  }
  summary.totals = totals
  summary.valid = errors.length === 0 && (!args.requireComplete || totals.cached === totals.selected)
  writeJson(args.out, summary)
  console.log(JSON.stringify(stable(summary), null, 2))
  if (args.strict && !summary.valid) process.exit(1)
}

main()
