import { createHash } from 'node:crypto'

export function canonicalize(value) {
  if (typeof value === 'string') return value.normalize('NFC').replace(/\r\n?/gu, '\n')
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]))
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value))
}

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex')
}

export function stableId(prefix, ...parts) {
  return `${prefix}_${sha256(parts).slice(0, 24)}`
}

export function cleanText(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

export function writeJsonLine(record) {
  return `${canonicalJson(record)}\n`
}

