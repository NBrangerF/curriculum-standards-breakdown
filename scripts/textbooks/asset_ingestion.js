import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { nowIso, writeJson } from './library_common.js'
import { sha256FileChunked, verifyPdf } from './verify_textbook_asset.js'

export function appendJournal(path, event) {
  mkdirSync(dirname(path), { recursive: true })
  const fd = openSync(path, 'a')
  try {
    writeFileSync(fd, `${JSON.stringify(event)}\n`)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

export function flushFile(path) {
  const fd = openSync(path, 'r+')
  try { fsyncSync(fd) } finally { closeSync(fd) }
}

export function objectRelativePath(sha256) {
  return `objects/sha256/${sha256.slice(0, 2)}/${sha256}.pdf`
}

export function ingestPdf({ inputPath, stagingPath, root, lockRow, runId, journalPath, copyInput = true }) {
  mkdirSync(dirname(stagingPath), { recursive: true })
  if (copyInput) copyFileSync(inputPath, stagingPath)
  flushFile(stagingPath)
  const verification = verifyPdf(stagingPath, { expectedGitObject: lockRow.git_object })
  if (!verification.valid) {
    appendJournal(journalPath, { event: 'ingest_failed', at: nowIso(), run_id: runId, edition_id: lockRow.edition_id, source_id: lockRow.source_id, staging_path: stagingPath.replace(`${root}/`, ''), verification })
    return { ok: false, verification }
  }
  const relativePath = objectRelativePath(verification.sha256)
  const objectPath = join(root, relativePath)
  mkdirSync(dirname(objectPath), { recursive: true })
  let objectStatus = 'created'
  if (existsSync(objectPath)) {
    const existingHash = sha256FileChunked(objectPath)
    if (existingHash !== verification.sha256) throw new Error(`Object collision at ${objectPath}`)
    rmSync(stagingPath)
    objectStatus = 'reused'
  } else {
    renameSync(stagingPath, objectPath)
    flushFile(objectPath)
    if (sha256FileChunked(objectPath) !== verification.sha256) throw new Error(`Post-rename hash mismatch: ${objectPath}`)
  }
  const event = {
    event: 'asset_ingested',
    at: nowIso(),
    run_id: runId,
    edition_id: lockRow.edition_id,
    work_id: lockRow.work_id,
    resource_type: lockRow.resource_type,
    stage: lockRow.stage,
    subject: lockRow.subject,
    subject_slug: lockRow.subject_slug,
    grade: lockRow.grade,
    volume: lockRow.volume,
    edition_name: lockRow.edition_name,
    selection_class: lockRow.selection_class,
    source_id: lockRow.source_id,
    source_repository: lockRow.source_repository,
    source_commit: lockRow.source_commit,
    source_url: lockRow.source_url,
    source_detail_url: lockRow.source_detail_url,
    source_kind: lockRow.source_kind,
    source_sha1: lockRow.source_sha1,
    source_md5: lockRow.source_md5,
    source_original_bytes: lockRow.source_original_bytes,
    source_binary_match: lockRow.source_binary_match,
    source_derivation: lockRow.source_derivation,
    repository_path: lockRow.repository_path,
    evidence_id: lockRow.evidence_id,
    git_object: lockRow.git_object,
    sha256: verification.sha256,
    object_path: relativePath,
    bytes: verification.bytes,
    pages: verification.pages,
    object_status: objectStatus,
    transfer_verified: true,
    pdf_structural_verified: true,
    bibliographic_verified: lockRow.bibliographic_verified ?? false,
    current_confirmed: lockRow.current_confirmed ?? false,
    revision_status: lockRow.revision_status || 'revision_unknown',
    expected_status: lockRow.expected_status || 'current_target',
    availability_status: lockRow.availability_status || null,
    release_term: lockRow.release_term || null,
    qpdf_warning: verification.qpdf_warning
  }
  appendJournal(journalPath, event)
  return { ok: true, event, verification, objectPath }
}

export function writeRunResult(path, result) {
  writeJson(path, result)
  flushFile(path)
}
