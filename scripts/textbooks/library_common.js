import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export function parseArgs(argv) {
  const result = { _: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    if (!item.startsWith('--')) {
      result._.push(item)
      continue
    }
    const key = item.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      result[key] = next
      index += 1
    } else result[key] = true
  }
  return result
}

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => [key, stable(value[key])]))
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function readJsonLines(path) {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
}

export function resolveCurrentAssetRegistry({
  projectRoot,
  assets = null,
  current = 'data/textbooks/library-state/CURRENT.json'
}) {
  if (assets) {
    const explicitPath = resolve(projectRoot, assets)
    if (!existsSync(explicitPath)) throw new Error(`Explicit asset registry is missing: ${explicitPath}`)
    return explicitPath
  }

  const currentPath = resolve(projectRoot, current)
  if (!existsSync(currentPath)) throw new Error(`Textbook library CURRENT pointer is missing: ${currentPath}`)
  const pointer = readJson(currentPath)
  const generationId = String(pointer?.generation_id || '').trim()
  if (!/^gen-[A-Za-z0-9-]+$/.test(generationId)) {
    throw new Error(`Textbook library CURRENT pointer has an invalid generation_id: ${generationId || 'missing'}`)
  }
  const trackedRegistry = resolve(
    projectRoot,
    `data/textbooks/library-state/generations/${generationId}/asset_registry.lock.jsonl`
  )
  if (!existsSync(trackedRegistry)) {
    throw new Error(`CURRENT textbook asset registry is missing: ${trackedRegistry}`)
  }
  return trackedRegistry
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true })
}

export function writeFileDurable(path, content) {
  ensureDir(dirname(path))
  const fd = openSync(path, 'w')
  try {
    writeFileSync(fd, content)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

export function writeJson(path, value) {
  writeFileDurable(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

export function writeJsonLines(path, rows) {
  writeFileDurable(path, `${rows.map(row => JSON.stringify(stable(row))).join('\n')}\n`)
}

export function atomicWriteJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`
  writeJson(temporary, value)
  renameSync(temporary, path)
}

export function sha256Text(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function nowIso() {
  return new Date().toISOString()
}

export function fail(message, details = {}) {
  const error = new Error(message)
  error.details = details
  throw error
}
