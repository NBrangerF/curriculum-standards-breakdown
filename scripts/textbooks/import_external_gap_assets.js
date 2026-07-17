#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ingestPdf, writeRunResult } from './asset_ingestion.js'
import { nowIso, parseArgs, readJson, readJsonLines, writeJson } from './library_common.js'
import { acquireWriterLease } from './library_storage.js'
import { verifyPdf } from './verify_textbook_asset.js'

const DEFAULT_SOURCE_CATALOG = 'data/textbooks/catalog/external_gap_sources.json'
const DEFAULT_EXPECTED_CATALOG = 'data/textbooks/catalog/expected_editions.jsonl'
const DEFAULT_REPORT = 'generated/textbook_library/external_gap_acquisition.json'
const HTTP_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138 Safari/537.36',
  accept: '*/*'
}

function hashFile(path, algorithm) {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm)
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

async function fetchRetry(url, options = {}, attempts = 4) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, headers: { ...HTTP_HEADERS, ...(options.headers || {}) } })
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
      return response
    } catch (error) {
      lastError = error
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 750))
    }
  }
  throw lastError
}

async function fetchJson(url, options = {}) {
  const response = await fetchRetry(url, options)
  const value = await response.json()
  if (typeof value?.status === 'number' && value.status !== 200) throw new Error(`${url}: ${value.message || value.status}`)
  return value
}

async function downloadFile(url, outputPath, { expectedBytes, expectedSha1, referer } = {}) {
  mkdirSync(dirname(outputPath), { recursive: true })
  const response = await fetchRetry(url, { headers: referer ? { referer } : {} })
  await pipeline(Readable.fromWeb(response.body), createWriteStream(outputPath))
  const bytes = statSync(outputPath).size
  if (expectedBytes && bytes !== expectedBytes) throw new Error(`Downloaded size ${bytes} != ${expectedBytes}: ${outputPath}`)
  const sha1 = await hashFile(outputPath, 'sha1')
  if (expectedSha1 && sha1 !== expectedSha1) throw new Error(`Downloaded sha1 ${sha1} != ${expectedSha1}: ${outputPath}`)
  return { bytes, sha1 }
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await callback(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function smartEduTitle(detail) {
  return detail?.global_title?.['zh-CN'] || detail?.global_title?.zh_CN || ''
}

async function buildSmartEduPdf(source, outputPath, fragmentsRoot) {
  const payload = await fetchJson(source.detail_url)
  const detail = Array.isArray(payload) ? payload.find(item => item.id === source.resource_id) : payload
  if (!detail) throw new Error(`${source.source_id}: resource ${source.resource_id} missing from detail payload`)
  const listedPreviews = Object.entries(detail?.custom_properties?.preview || {})
    .map(([key, url]) => ({ page: Number((key.match(/(\d+)$/) || [])[1] || 0), url }))
    .filter(row => row.page > 0 && typeof row.url === 'string')
    .sort((a, b) => a.page - b.page)
  if (!listedPreviews.length) throw new Error(`${source.source_id}: no official preview images`)
  const listedByPage = new Map(listedPreviews.map(row => [row.page, row.url]))
  const template = new URL(listedPreviews[0].url)
  template.hostname = template.hostname.replace(/^r[123]-/, 'r1-')
  const previews = Array.from({ length: source.expected_pages }, (_, index) => {
    const page = index + 1
    if (listedByPage.has(page)) return { page, url: listedByPage.get(page), listed: true }
    const derived = new URL(template)
    derived.pathname = derived.pathname.replace(/\/\d+\.jpg$/, `/${page}.jpg`)
    return { page, url: derived.toString(), listed: false }
  })
  if (new Set(previews.map(row => row.page)).size !== source.expected_pages) throw new Error(`${source.source_id}: duplicate preview pages`)

  mkdirSync(fragmentsRoot, { recursive: true })
  const images = await mapLimit(previews, 6, async row => {
    const imagePath = join(fragmentsRoot, `${String(row.page).padStart(3, '0')}.jpg`)
    const response = await fetchRetry(row.url, { headers: { referer: 'https://basic.smartedu.cn/' } })
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) throw new Error(`${source.source_id} page ${row.page}: ${contentType}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length < 10000) throw new Error(`${source.source_id} page ${row.page}: image too small`)
    writeFileSync(imagePath, bytes)
    return { ...row, imagePath, bytes: bytes.length }
  })

  const pagePdfs = images.map(row => {
    const pagePdf = row.imagePath.replace(/\.jpg$/, '.pdf')
    execFileSync('sips', ['-s', 'format', 'pdf', row.imagePath, '--out', pagePdf], { stdio: 'ignore' })
    return pagePdf
  })
  execFileSync('qpdf', ['--empty', '--pages', ...pagePdfs, '--', outputPath], { stdio: 'pipe' })
  const verification = verifyPdf(outputPath)
  if (!verification.valid || verification.pages !== source.expected_pages) throw new Error(`${source.source_id}: assembled PDF verification failed`)
  return {
    source_title: smartEduTitle(detail),
    official_resource_id: detail.id || source.resource_id,
    preview_page_count: previews.length,
    preview_listed_page_count: listedPreviews.length,
    preview_derived_page_count: previews.filter(row => !row.listed).length,
    preview_bytes: images.reduce((sum, row) => sum + row.bytes, 0),
    source_binary_match: false,
    source_derivation: 'official_page_preview_reconstruction'
  }
}

async function resolveQuarkPdf(source) {
  const apiHeaders = { 'content-type': 'application/json', origin: 'https://pan.quark.cn', referer: 'https://pan.quark.cn/' }
  const token = await fetchJson('https://drive-pc.quark.cn/1/clouddrive/share/sharepage/token?pr=ucpro&fr=pc', {
    method: 'POST', headers: apiHeaders, body: JSON.stringify({ pwd_id: source.share_id, passcode: '' })
  })
  const stoken = token.data.stoken
  const detailUrl = new URL('https://drive-pc.quark.cn/1/clouddrive/share/sharepage/detail')
  for (const [key, value] of Object.entries({ pr: 'ucpro', fr: 'pc', pwd_id: source.share_id, stoken, pdir_fid: '0', force: '0', _page: '1', _size: '50' })) detailUrl.searchParams.set(key, value)
  const detail = await fetchJson(detailUrl, { headers: apiHeaders })
  const file = detail?.data?.list?.find(item => item.file_name === source.expected_file_name)
  if (!file) throw new Error(`${source.source_id}: expected shared file not found`)
  if (file.size !== source.expected_bytes) throw new Error(`${source.source_id}: shared size ${file.size} != ${source.expected_bytes}`)

  const previewUrl = new URL('https://drive-pc.quark.cn/1/clouddrive/share/sharepage/pdf_preview')
  for (const [key, value] of Object.entries({ pr: 'ucpro', fr: 'pc', pwd_id: source.share_id, stoken, fid: file.fid, fid_token: file.share_fid_token })) previewUrl.searchParams.set(key, value)
  const preview = await fetchJson(previewUrl, { headers: apiHeaders })
  if (preview.data.page_number !== source.expected_pages) throw new Error(`${source.source_id}: preview pages ${preview.data.page_number} != ${source.expected_pages}`)
  if (preview.data.size !== source.expected_bytes || preview.data.sha1 !== source.source_sha1) throw new Error(`${source.source_id}: preview integrity metadata changed`)
  return { download_url: preview.data.download_url, file, preview }
}

function findTarget(catalog, source) {
  const target = catalog.find(row => row.resource_type === 'student_textbook' && row.stage === source.stage && row.subject === source.subject && row.grade === source.grade && row.volume === source.volume)
  if (!target) throw new Error(`No target slot for ${source.stage}/${source.subject}/${source.grade}/${source.volume}`)
  return target
}

async function acquireSource({ source, catalog, root, runId, journalPath }) {
  const target = findTarget(catalog, source)
  const stagingPath = join(root, 'staging/downloads', runId, `${source.source_id}.pdf`)
  mkdirSync(dirname(stagingPath), { recursive: true })
  let acquisition
  if (source.kind === 'smartedu_preview_pdf') {
    acquisition = await buildSmartEduPdf(source, stagingPath, join(root, 'staging/fragments', runId, source.source_id))
  } else if (source.kind === 'quark_shared_pdf') {
    const resolved = await resolveQuarkPdf(source)
    acquisition = await downloadFile(resolved.download_url, stagingPath, { expectedBytes: source.expected_bytes, expectedSha1: source.source_sha1, referer: source.share_url })
    acquisition.source_binary_match = true
    acquisition.source_derivation = 'shared_pdf_exact_download'
    acquisition.source_title = resolved.file.file_name
  } else throw new Error(`Unsupported external source kind: ${source.kind}`)

  const lockRow = {
    ...target,
    source_id: source.source_id,
    evidence_id: `external_${source.source_id}`,
    source_repository: source.kind === 'smartedu_preview_pdf' ? '国家中小学智慧教育平台' : '公开网盘镜像',
    source_commit: null,
    source_url: source.share_url || `https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId=${source.official_catalog_id}`,
    source_detail_url: source.detail_url || source.share_url,
    source_kind: source.kind,
    source_sha1: source.source_sha1 || null,
    source_md5: source.source_md5 || null,
    source_original_bytes: source.source_original_bytes || source.expected_bytes || null,
    source_binary_match: acquisition.source_binary_match,
    source_derivation: acquisition.source_derivation,
    repository_path: source.repository_path,
    git_object: null,
    bibliographic_verified: source.bibliographic_verified,
    current_confirmed: source.current_confirmed,
    revision_status: source.revision_status,
    release_term: source.release_term || target.release_term || null
  }
  const ingested = ingestPdf({ inputPath: stagingPath, stagingPath, root, lockRow, runId, journalPath, copyInput: false })
  if (!ingested.ok) throw new Error(`${source.source_id}: ingestion failed: ${ingested.verification.errors.join(', ')}`)
  if (ingested.verification.pages !== source.expected_pages) throw new Error(`${source.source_id}: ingested pages ${ingested.verification.pages} != ${source.expected_pages}`)
  rmSync(join(root, 'staging/fragments', runId, source.source_id), { recursive: true, force: true })
  return {
    source_id: source.source_id,
    edition_id: target.edition_id,
    expected_status: target.expected_status,
    title: acquisition.source_title,
    sha256: ingested.verification.sha256,
    pages: ingested.verification.pages,
    bytes: ingested.verification.bytes,
    object_path: ingested.event.object_path,
    source_binary_match: acquisition.source_binary_match,
    source_derivation: acquisition.source_derivation,
    current_confirmed: source.current_confirmed
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const sourceCatalog = readJson(args.sources || DEFAULT_SOURCE_CATALOG)
  const catalog = readJsonLines(args.catalog || DEFAULT_EXPECTED_CATALOG)
  const runId = args.run || `external-gaps-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`
  const lease = acquireWriterLease({ libraryRoot: args.libraryRoot, envFile: args.envFile, runId })
  const root = lease.doctor.root
  const journalPath = join(root, 'state/runs', runId, 'events.worker-0.jsonl')
  const startedAt = nowIso()
  let sources = [...sourceCatalog.current_assets, ...(args.skipFuture ? [] : sourceCatalog.future_candidates)]
  const selectedIds = new Set(String(args.sourceIds || '').split(',').map(value => value.trim()).filter(Boolean))
  if (selectedIds.size) sources = sources.filter(source => selectedIds.has(source.source_id))
  const acquired = []
  const errors = []
  try {
    for (const source of sources) {
      try {
        acquired.push(await acquireSource({ source, catalog, root, runId, journalPath }))
      } catch (error) {
        errors.push({ source_id: source.source_id, message: error.message })
      }
    }
    const report = {
      schema_version: 1,
      valid: errors.length === 0 && acquired.length === sources.length,
      run_id: runId,
      started_at: startedAt,
      completed_at: nowIso(),
      checked_at: sourceCatalog.checked_at,
      requested_count: sources.length,
      acquired_count: acquired.length,
      current_acquired_count: acquired.filter(row => row.expected_status === 'current_target').length,
      future_candidate_count: acquired.filter(row => row.expected_status === 'scheduled_release').length,
      unreleased_slots: sourceCatalog.unreleased_slots,
      acquired,
      errors
    }
    writeRunResult(join(root, 'state/runs', runId, 'result.json'), report)
    writeJson(args.out || DEFAULT_REPORT, report)
    console.log(JSON.stringify(report, null, 2))
    if (!report.valid && args.strict) process.exitCode = 1
  } finally {
    lease.release()
  }
}

await main()
