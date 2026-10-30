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

// A v2 standard in the record shape the list cards, collection stats and print page read.
const LIST_BAND = { 1: 'H1', 3: 'H2', 5: 'H3', 6: 'H3', 7: 'H4', 8: 'H4' }
export function asListRecord(standard, subject) {
    return {
        code: standard.code,
        subject: subject.subject,
        subject_slug: subject.subject_slug,
        domain: standard.level1,
        subdomain: standard.level2,
        display_subcategory: standard.level2,
        standard_title: standard.level2,
        standard: standard.statement,
        grade_band: LIST_BAND[standard.grades[0]] || 'H4',
        grade_range: standard.stage,
        stage_label: subject.stages?.find(st => st.stage_code === standard.stage_code)?.label || null,
        ts_primary: standard.ts_primary || [],
        ts_secondary: standard.ts_secondary || [],
        indicators: standard.indicators
    }
}

// The four 学段 the list pages filter by (a subject's own stage sits by its first grade: 艺术 3–5 年级 is H2).
export const V2_BANDS = ['H1', 'H2', 'H3', 'H4']
// Old links name 七/八/九年级 (H4G7–9); they now mean the 7–9 学段.
export const toV2Band = band => (String(band).toUpperCase().startsWith('H4') ? 'H4' : String(band).toUpperCase())

// Subjects in the shape the list pages read (subject_slug, subject, record_count).
export async function loadV2Subjects() {
    const manifest = await loadV2Manifest()
    return manifest.subjects.map(s => ({ subject: s.subject, subject_slug: s.subject_slug, record_count: s.standard_count, indicator_count: s.indicator_count, stages: s.stages }))
}

// Every standard of the given subjects as list records.
export async function loadV2ListStandards(slugs) {
    const subjects = await Promise.all(slugs.map(slug => loadV2Subject(slug).catch(() => null)))
    return subjects.filter(Boolean).flatMap(subject => subject.standards.map(standard => asListRecord(standard, subject)))
}

// Saved lists from before the move hold old codes: swap each for the standard it joined (once per browser).
const OLD_CODE = /-\d{3}$/u
export async function migrateSavedCodes({ getCollections, saveCollections }) {
    const data = getCollections()
    const lists = Object.values(data.collections || {})
    if (!lists.some(list => (list.standardCodes || []).some(code => OLD_CODE.test(code)))) return false
    const map = await loadLegacyCodes()
    let changed = false
    for (const list of lists) {
        const next = []
        for (const code of list.standardCodes || []) {
            const target = OLD_CODE.test(code) ? map[code] : null
            // codes that moved to a subject overview (no standard of their own) stay as they are
            const moved = target?.startsWith('/standards/') ? target.slice('/standards/'.length).split('#')[0] : code
            if (moved !== code) changed = true
            if (!next.includes(moved)) next.push(moved)
        }
        list.standardCodes = next
    }
    if (changed) saveCollections(data)
    return changed
}
