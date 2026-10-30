// v2 standards (标准 → 要点 → 表现示例), built by scripts/build-public-v2.mjs into public/data/v2.
// A code's first two letters name its subject, so one subject file answers any standard or 要点 code.
import { getPreloadedStandard } from '../seo/prerenderSnapshot.js'

const BASE = '/data/v2'

export const PREFIX_TO_SLUG = {
    CN: 'chinese', MA: 'math', EN: 'english', ML: 'morality_law', HI: 'history', GE: 'geography', SC: 'science',
    PH: 'physics', CH: 'chemistry', BI: 'biology', IT: 'it', PE: 'pe', AR: 'arts', LA: 'labor'
}
// Standard: MA-S1-NA-01; 要点: MA-S1-NA-01.3. Old (v1) codes end in three digits: MA-D1-NA-001.
const V2_CODE = /^([A-Z]{2})-S\d-[A-Z]{2,3}-\d{2}(?:\.\d+)?$/u
export const isV2Code = code => V2_CODE.test(String(code || ''))
export const standardCodeOf = code => String(code || '').replace(/\.\d+$/u, '')
export const subjectOfCode = code => PREFIX_TO_SLUG[String(code || '').slice(0, 2)] || null

const cache = { manifest: null, subjects: new Map(), legacy: null }

async function fetchJSON(path) {
    const response = await fetch(`${BASE}${path}`)
    if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`)
    return response.json()
}
const once = (map, key, load) => {
    if (!map.has(key)) map.set(key, load().catch(error => { map.delete(key); throw error }))
    return map.get(key)
}

export function loadV2Manifest() {
    if (!cache.manifest) cache.manifest = fetchJSON('/manifest.json').catch(error => { cache.manifest = null; throw error })
    return cache.manifest
}

export function loadV2Subject(slug) {
    return once(cache.subjects, slug, () => fetchJSON(`/by_subject/${encodeURIComponent(slug)}.json`))
}

// The standard (and its subject header) for a standard or 要点 code, or null when there is none.
export async function loadV2Standard(code) {
    const standardCode = standardCodeOf(code)
    const slug = subjectOfCode(standardCode)
    if (!slug || !isV2Code(standardCode)) return null
    const preloaded = getPreloadedStandard(standardCode)
    if (preloaded?.indicators && !cache.subjects.has(slug)) {
        // Prerendered pages inline the record and the subject header; the subject file loads later if needed.
        return { standard: preloaded, subject: preloaded._subject || null }
    }
    const subject = await loadV2Subject(slug)
    const standard = subject.standards.find(s => s.code === standardCode)
    return standard ? { standard, subject } : null
}

export function loadLegacyCodes() {
    if (!cache.legacy) cache.legacy = fetchJSON('/legacy_codes.json').catch(error => { cache.legacy = null; throw error })
    return cache.legacy
}

// Where an old (v1) code now lives: "/standards/<code>#<要点>" or a subject page, or null.
export async function resolveLegacyCode(code) {
    const map = await loadLegacyCodes()
    return map[String(code || '').trim().toUpperCase()] || map[String(code || '').trim()] || null
}

export const statusLabel = check => ({
    revised: '修订版有改动',
    ocr_doubt: '识别存疑，以 PDF 为准',
    table: '表格重建，以 PDF 为准'
}[check?.status] || '')

export const gradesLabel = grades => {
    if (!grades?.length) return ''
    const sorted = [...grades].sort((a, b) => a - b)
    return sorted.length > 1 && sorted.at(-1) - sorted[0] === sorted.length - 1
        ? `${sorted[0]}–${sorted.at(-1)} 年级`
        : `${sorted.join('、')} 年级`
}
