import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fail, nowIso, readJson, writeJson } from './library_common.js'

const DEFAULT_CONFIG = 'data/textbooks/catalog/library_storage.json'
const SENTINEL_NAME = '.kebiao-library-root.json'
const DIRECTORY_LAYOUT = [
  'inbox',
  'staging/downloads',
  'staging/fragments',
  'staging/tmp',
  'objects/sha256',
  'derived',
  'quarantine',
  'exports',
  'state/generations',
  'state/runs',
  'state/audits',
  'logs'
]

function parseEnvLine(line) {
  const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/)
  if (!match) return null
  let value = match[2]
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
  return [match[1], value]
}

export function loadEnvFile(path = '.env.local') {
  if (!existsSync(path)) return false
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const parsed = parseEnvLine(line)
    if (parsed && process.env[parsed[0]] === undefined) process.env[parsed[0]] = parsed[1]
  }
  return true
}

export function loadStorageConfig(path = DEFAULT_CONFIG) {
  return readJson(path)
}

export function resolveLibraryRoot({ libraryRoot, envFile = '.env.local' } = {}) {
  if (!libraryRoot) loadEnvFile(envFile)
  const raw = libraryRoot || process.env.TEXTBOOK_LIBRARY_ROOT
  if (!raw) fail('TEXTBOOK_LIBRARY_ROOT is required; refusing to use an internal default cache')
  if (!isAbsolute(raw)) fail(`TEXTBOOK_LIBRARY_ROOT must be absolute: ${raw}`)
  return resolve(raw)
}

export function validateRootString(root, config) {
  const expectedMount = resolve(config.expected_mount_point)
  const normalized = resolve(root)
  const rel = relative(expectedMount, normalized)
  if (!rel || rel === '.') fail(`Library root must be a child of the external mount, not the mount itself: ${normalized}`)
  if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) fail(`Library root is outside expected external mount: ${normalized}`)
  if (normalized !== join(expectedMount, 'kebiao-library')) fail(`Unexpected library root: ${normalized}`)
  return normalized
}

function parseDiskutil(text) {
  const fields = {}
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:]+):\s*(.*?)\s*$/)
    if (match) fields[match[1].trim()] = match[2].trim()
  }
  return {
    device_node: fields['Device Node'] || null,
    volume_name: fields['Volume Name'] || null,
    filesystem: fields['File System Personality'] || null,
    volume_uuid: fields['Volume UUID'] || null,
    mount_point: fields['Mount Point'] || null,
    free_space_text: fields['Volume Free Space'] || null
  }
}

function diskFreeBytes(path) {
  const output = execFileSync('df', ['-Pk', path], { encoding: 'utf8' }).trim().split(/\r?\n/)
  const columns = output.at(-1).trim().split(/\s+/)
  return Number(columns[3]) * 1024
}

export function inspectVolume(config) {
  const mount = config.expected_mount_point
  if (!existsSync(mount)) fail(`Expected external volume is not mounted: ${mount}`)
  const actualMount = realpathSync.native(mount)
  if (actualMount !== mount) fail(`Unexpected mount realpath: ${actualMount}`)
  const info = parseDiskutil(execFileSync('diskutil', ['info', mount], { encoding: 'utf8' }))
  const errors = []
  if (info.volume_name !== config.expected_volume_name) errors.push(`volume name ${info.volume_name}`)
  if (info.volume_uuid !== config.expected_volume_uuid) errors.push(`volume UUID ${info.volume_uuid}`)
  if (info.filesystem !== config.expected_filesystem) errors.push(`filesystem ${info.filesystem}`)
  if (info.mount_point !== config.expected_mount_point) errors.push(`mount point ${info.mount_point}`)
  if (errors.length) fail(`External volume identity mismatch: ${errors.join(', ')}`)
  return { ...info, free_bytes: diskFreeBytes(mount) }
}

function validateSentinel(sentinel, config, volume) {
  const errors = []
  if (sentinel.library_id !== config.library_id) errors.push('library_id')
  if (sentinel.schema_version !== config.schema_version) errors.push('schema_version')
  if (sentinel.volume_uuid !== volume.volume_uuid) errors.push('volume_uuid')
  if (sentinel.volume_name !== volume.volume_name) errors.push('volume_name')
  if (errors.length) fail(`Library sentinel mismatch: ${errors.join(', ')}`)
}

export function initLibrary({ libraryRoot, envFile, configPath = DEFAULT_CONFIG } = {}) {
  const config = loadStorageConfig(configPath)
  const root = validateRootString(resolveLibraryRoot({ libraryRoot, envFile }), config)
  const volume = inspectVolume(config)
  if (volume.free_bytes < config.minimum_free_bytes) fail(`Insufficient X9 free space: ${volume.free_bytes}`)
  mkdirSync(root, { recursive: true })
  for (const directory of DIRECTORY_LAYOUT) mkdirSync(join(root, directory), { recursive: true })
  const sentinelPath = join(root, SENTINEL_NAME)
  if (existsSync(sentinelPath)) validateSentinel(readJson(sentinelPath), config, volume)
  else writeJson(sentinelPath, {
    library_id: config.library_id,
    schema_version: config.schema_version,
    volume_name: volume.volume_name,
    volume_uuid: volume.volume_uuid,
    filesystem: volume.filesystem,
    created_at: nowIso()
  })
  return doctorLibrary({ libraryRoot: root, configPath, requireSentinel: true })
}

export function doctorLibrary({ libraryRoot, envFile, configPath = DEFAULT_CONFIG, requireSentinel = true, requiredBytes = 0 } = {}) {
  const config = loadStorageConfig(configPath)
  const root = validateRootString(resolveLibraryRoot({ libraryRoot, envFile }), config)
  const volume = inspectVolume(config)
  if (!existsSync(root)) fail(`Library root does not exist: ${root}`)
  const sentinelPath = join(root, SENTINEL_NAME)
  if (requireSentinel && !existsSync(sentinelPath)) fail(`Library sentinel is missing: ${sentinelPath}`)
  if (existsSync(sentinelPath)) validateSentinel(readJson(sentinelPath), config, volume)
  if (!statSync(root).isDirectory()) fail(`Library root is not a directory: ${root}`)
  const requiredFree = Math.max(config.minimum_free_bytes, Math.ceil(Number(requiredBytes || 0) * 1.2) + config.minimum_free_bytes)
  if (volume.free_bytes < requiredFree) fail(`Insufficient X9 free space: need ${requiredFree}, have ${volume.free_bytes}`)
  const internalFree = diskFreeBytes('/')
  if (internalFree < config.minimum_internal_free_bytes) fail(`Internal disk free space below safety floor: ${internalFree}`)
  return {
    valid: true,
    root,
    volume,
    internal_free_bytes: internalFree,
    required_free_bytes: requiredFree,
    tmpdir: join(root, 'staging/tmp'),
    sentinel_path: sentinelPath,
    writer_lease_path: join(root, 'state/writer.lease')
  }
}

export function acquireWriterLease({ libraryRoot, envFile, configPath = DEFAULT_CONFIG, runId = `run-${Date.now()}` } = {}) {
  const doctor = doctorLibrary({ libraryRoot, envFile, configPath })
  const leasePath = doctor.writer_lease_path
  const nonce = randomUUID()
  const lease = { schema_version: 1, host: process.env.HOSTNAME || 'localhost', pid: process.pid, nonce, run_id: runId, acquired_at: nowIso(), heartbeat_at: nowIso() }
  function processIsAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false
    try {
      process.kill(pid, 0)
      return true
    } catch (error) {
      return error.code === 'EPERM'
    }
  }

  function removeStaleLocalLease() {
    if (!existsSync(leasePath)) return false
    let current
    try { current = readJson(leasePath) } catch { return false }
    if (current.host !== lease.host || processIsAlive(current.pid)) return false
    const confirm = readJson(leasePath)
    if (confirm.nonce !== current.nonce) return false
    rmSync(leasePath)
    return true
  }

  let acquired = false
  for (let attempt = 0; attempt < 2 && !acquired; attempt += 1) {
    let fd
    try {
      fd = openSync(leasePath, 'wx')
      writeFileSync(fd, `${JSON.stringify(lease, null, 2)}\n`)
      closeSync(fd)
      fd = undefined
      acquired = true
    } catch (error) {
      if (fd !== undefined) closeSync(fd)
      if (error.code === 'EEXIST' && attempt === 0 && removeStaleLocalLease()) continue
      if (error.code === 'EEXIST') fail(`Writer lease already exists: ${leasePath}`)
      throw error
    }
  }
  if (!acquired) fail(`Could not acquire writer lease: ${leasePath}`)
  let released = false
  return {
    ...lease,
    path: leasePath,
    doctor,
    release() {
      if (released) return
      const current = readJson(leasePath)
      if (current.nonce !== nonce) fail('Writer lease nonce changed; refusing to remove another writer lease')
      rmSync(leasePath)
      released = true
    }
  }
}

export function withWriterLease(options, callback) {
  const lease = acquireWriterLease(options)
  try {
    process.env.TMPDIR = lease.doctor.tmpdir
    return callback(lease)
  } finally {
    lease.release()
  }
}
