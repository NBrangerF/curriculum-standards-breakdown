#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { parseArgs } from './library_common.js'

function hashFile(path, algorithm, prefix = null) {
  const hash = createHash(algorithm)
  if (prefix) hash.update(prefix)
  const fd = openSync(path, 'r')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  try {
    while (true) {
      const bytes = readSync(fd, buffer, 0, buffer.length, null)
      if (!bytes) break
      hash.update(buffer.subarray(0, bytes))
    }
  } finally {
    closeSync(fd)
  }
  return hash.digest('hex')
}

export function sha256FileChunked(path) {
  return hashFile(path, 'sha256')
}

export function gitBlobHash(path) {
  const fd = openSync(path, 'r')
  let size
  try { size = fstatSync(fd).size } finally { closeSync(fd) }
  return hashFile(path, 'sha1', Buffer.from(`blob ${size}\0`))
}

function headerAndEof(path) {
  const fd = openSync(path, 'r')
  try {
    const size = fstatSync(fd).size
    const head = Buffer.alloc(Math.min(8, size))
    const tail = Buffer.alloc(Math.min(8192, size))
    readSync(fd, head, 0, head.length, 0)
    readSync(fd, tail, 0, tail.length, Math.max(0, size - tail.length))
    return { bytes: size, pdf_header: head.toString('latin1').includes('%PDF-'), pdf_eof: tail.toString('latin1').includes('%%EOF') }
  } finally {
    closeSync(fd)
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  return { status: result.status, signal: result.signal || null, stdout: String(result.stdout || ''), stderr: String(result.stderr || ''), error: result.error?.message || null }
}

export function verifyPdf(path, { expectedGitObject = null } = {}) {
  const basic = headerAndEof(path)
  const sha256 = sha256FileChunked(path)
  const blobHash = gitBlobHash(path)
  const qpdf = run('qpdf', ['--check', path])
  const pdfinfo = run('pdfinfo', [path])
  const pages = Number((pdfinfo.stdout.match(/^Pages:\s+(\d+)/m) || [])[1] || 0)
  const encrypted = ((pdfinfo.stdout.match(/^Encrypted:\s+(.+)$/m) || [])[1] || 'unknown').trim()
  const qpdfPassed = qpdf.status === 0 || qpdf.status === 3
  const gitObjectPassed = !expectedGitObject || blobHash === expectedGitObject
  const errors = []
  if (basic.bytes < 1024) errors.push('file_too_small')
  if (!basic.pdf_header) errors.push('missing_pdf_header')
  if (!basic.pdf_eof) errors.push('missing_pdf_eof')
  if (!qpdfPassed) errors.push(`qpdf_exit_${qpdf.status}`)
  if (pdfinfo.status !== 0 || pages <= 0) errors.push('pdfinfo_failed')
  if (!gitObjectPassed) errors.push('git_object_mismatch')
  return {
    valid: errors.length === 0,
    path,
    bytes: basic.bytes,
    sha256,
    git_blob_hash: blobHash,
    expected_git_object: expectedGitObject,
    git_object_verified: gitObjectPassed,
    pdf_header: basic.pdf_header,
    pdf_eof: basic.pdf_eof,
    pages,
    encrypted,
    qpdf_status: qpdf.status,
    qpdf_warning: qpdf.status === 3 ? qpdf.stderr.trim() : null,
    pdfinfo_status: pdfinfo.status,
    errors
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2))
  if (!args.path) throw new Error('--path is required')
  const result = verifyPdf(args.path, { expectedGitObject: args.expectedGitObject || null })
  console.log(JSON.stringify(result, null, 2))
  if (!result.valid) process.exit(1)
}
