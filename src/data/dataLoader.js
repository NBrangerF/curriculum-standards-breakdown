/**
 * Data Loader for Curriculum Standards
 * Async data loading from public/data/ directory
 * Uses fetch() to avoid bundling large JSON files
 */

import {
    normalizeStandards,
    normalizeSkills,
    normalizeSubjectMeta,
    normalizeManifestSubject
} from './schema.js'

// Base path for data files
const DATA_BASE_PATH = '/data'

// ============================================
// CACHES - Prevents redundant network requests
// ============================================

const cache = {
    manifest: null,
    subjectsMeta: null,
    skillsMeta: null,
    skillsInfo: null,
    subjectStandards: new Map(), // keyed by subject_slug
    allStandards: null,
    // Index caches
    skillToSubjects: null,
    subjectStats: null,
    codeToSubjectMap: new Map() // built dynamically from loaded standards
}

// ============================================
// LOADING STATE
// ============================================

const loadingState = {
    manifest: null,
    subjectsMeta: null,
    skillsMeta: null,
    subjectStandards: new Map()
}

// ============================================
// FETCH UTILITIES
// ============================================

/**
 * Fetch JSON with error handling
 */
async function fetchJSON(path) {
    const response = await fetch(`${DATA_BASE_PATH}${path}`)
    if (!response.ok) {
        throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`)
    }
    return response.json()
}

// ============================================
// MANIFEST & METADATA LOADERS
// ============================================

/**
 * Load manifest data (lightweight index)
 */
export async function loadManifest() {
    if (cache.manifest) return cache.manifest
    if (loadingState.manifest) return loadingState.manifest

    loadingState.manifest = fetchJSON('/manifest.json').then(data => {
        cache.manifest = {
            ...data,
            subjects: (data.subjects || []).map(normalizeManifestSubject)
        }
        loadingState.manifest = null
        return cache.manifest
    })

    return loadingState.manifest
}

/**
 * Load subjects metadata
 */
export async function loadSubjectsMeta() {
    if (cache.subjectsMeta) return cache.subjectsMeta
    if (loadingState.subjectsMeta) return loadingState.subjectsMeta

    loadingState.subjectsMeta = fetchJSON('/subjects_meta.json').then(data => {
        cache.subjectsMeta = (data.subjects_meta || []).map(normalizeSubjectMeta)
        loadingState.subjectsMeta = null
        return cache.subjectsMeta
    })

    return loadingState.subjectsMeta
}

/**
 * Load transferable skills metadata
 */
export async function loadSkillsMeta() {
    if (cache.skillsMeta) return cache.skillsMeta
    if (cache.skillsInfo) return { competencies: cache.skillsMeta, meta: cache.skillsInfo }
    if (loadingState.skillsMeta) return loadingState.skillsMeta

    loadingState.skillsMeta = fetchJSON('/skills_meta.json').then(data => {
        cache.skillsMeta = normalizeSkills(data.competencies || [])
        cache.skillsInfo = data.meta || {}
        loadingState.skillsMeta = null
        return cache.skillsMeta
    })

    return loadingState.skillsMeta
}

/**
 * Get skills info (meta section)
 */
export async function loadSkillsInfo() {
    await loadSkillsMeta()
    return cache.skillsInfo || {}
}

// ============================================
// STANDARDS LOADERS (BY SUBJECT - KEY FOR PERF)
// ============================================

/**
 * Load standards for a specific subject
 * This is the primary loading method - avoids loading all 840 standards at once
 */
export async function loadSubjectStandards(subjectSlug) {
    if (cache.subjectStandards.has(subjectSlug)) {
        return cache.subjectStandards.get(subjectSlug)
    }

    if (loadingState.subjectStandards.has(subjectSlug)) {
        return loadingState.subjectStandards.get(subjectSlug)
    }

    const promise = fetchJSON(`/by_subject/${subjectSlug}.json`).then(data => {
        const standards = normalizeStandards(data.standards || [])
        cache.subjectStandards.set(subjectSlug, standards)
        loadingState.subjectStandards.delete(subjectSlug)
        return standards
    })

    loadingState.subjectStandards.set(subjectSlug, promise)
    return promise
}

/**
 * Load standards for multiple subjects
 * Used when filtering across subjects
 */
export async function loadMultipleSubjectStandards(subjectSlugs) {
    const promises = subjectSlugs.map(slug => loadSubjectStandards(slug))
    const results = await Promise.all(promises)
    return results.flat()
}

/**
 * Load all standards (use sparingly - prefer subject-specific loading)
 */
export async function loadAllStandards() {
    if (cache.allStandards) return cache.allStandards

    const manifest = await loadManifest()
    const allSlugs = manifest.subjects.map(s => s.subject_slug)
    cache.allStandards = await loadMultipleSubjectStandards(allSlugs)
    return cache.allStandards
}

// ============================================
// SYNCHRONOUS GETTERS (FROM CACHE)
// Must call load* functions first
// ============================================

export function getManifest() {
    return cache.manifest
}

export function getSubjectsFromManifest() {
    return cache.manifest?.subjects || []
}

export function getSubjectsMeta() {
    return cache.subjectsMeta || []
}

export function getSkillsMeta() {
    return cache.skillsMeta || []
}

export function getSkillsInfo() {
    return cache.skillsInfo || {}
}

export function getSubjectMetaBySlug(slug) {
    return getSubjectsMeta().find(s => s.subject_slug === slug)
}

export function getSkillByCode(code) {
    return getSkillsMeta().find(s => s.code === code)
}

export function getSubjectStandards(subjectSlug) {
    return cache.subjectStandards.get(subjectSlug) || []
}

// ============================================
// FILTERING UTILITIES
// ============================================

/**
 * Filter standards by criteria
 * @param {Array} standards - Standards to filter
 * @param {Object} filters - Filter criteria
 */
export function filterStandards(standards, filters = {}) {
    let results = [...standards]
    const { subjects, gradeBands, domains, skills, keyword } = filters

    // Filter by subjects
    if (subjects?.length) {
        results = results.filter(s => subjects.includes(s.subject_slug))
    }

    // Filter by grade bands
    if (gradeBands?.length) {
        results = results.filter(s => gradeBands.includes(s.grade_band))
    }

    // Filter by domains
    if (domains?.length) {
        results = results.filter(s => domains.includes(s.domain))
    }

    // Filter by skills (check both primary and secondary)
    if (skills?.length) {
        results = results.filter(s => {
            const primaryMatch = s.ts_primary.some(ts =>
                skills.some(skill => ts.startsWith(skill) || skill.startsWith(ts))
            )
            const secondaryMatch = s.ts_secondary.some(ts =>
                skills.some(skill => ts.startsWith(skill) || skill.startsWith(ts))
            )
            return primaryMatch || secondaryMatch
        })
    }

    // Filter by keyword
    if (keyword?.trim()) {
        const kw = keyword.toLowerCase().trim()
        results = results.filter(s =>
            s.standard.toLowerCase().includes(kw) ||
            s.context.toLowerCase().includes(kw) ||
            s.practice.toLowerCase().includes(kw) ||
            s.teaching_tip.toLowerCase().includes(kw)
        )
    }

    return results
}

/**
 * Group standards by domain
 */
export function groupByDomain(standards) {
    const grouped = {}
    standards.forEach(s => {
        const domain = s.domain || '其他'
        if (!grouped[domain]) {
            grouped[domain] = []
        }
        grouped[domain].push(s)
    })
    return grouped
}

/**
 * Get domains for a subject from manifest
 */
export function getDomainsForSubject(subjectSlug) {
    const subject = getSubjectsFromManifest().find(s => s.subject_slug === subjectSlug)
    return subject?.domains ? Object.keys(subject.domains) : []
}

// ============================================
// CONSTANTS
// ============================================

export const GRADE_BANDS = {
    H1: { label: '第一学段', range: '1-2年级', order: 1, color: 'var(--band-h1)', bgColor: 'var(--band-h1-bg)' },
    H2: { label: '第二学段', range: '3-6年级', order: 2, color: 'var(--band-h2)', bgColor: 'var(--band-h2-bg)' },
    H3: { label: '第三学段', range: '7-9年级', order: 3, color: 'var(--band-h3)', bgColor: 'var(--band-h3-bg)' }
}

export const SUBJECT_COLORS = {
    chinese: 'var(--subject-chinese)',
    math: 'var(--subject-math)',
    english: 'var(--subject-english)',
    science: 'var(--subject-science)',
    it: 'var(--subject-it)',
    morality_law: 'var(--subject-morality)',
    arts: 'var(--subject-arts)',
    labor: 'var(--subject-labor)',
    pe: 'var(--subject-pe)'
}

export const SKILL_COLORS = {
    TS1: 'var(--skill-ts1)',
    TS2: 'var(--skill-ts2)',
    TS3: 'var(--skill-ts3)',
    TS4: 'var(--skill-ts4)',
    TS5: 'var(--skill-ts5)',
    TS6: 'var(--skill-ts6)',
    TS7: 'var(--skill-ts7)'
}

// ============================================
// INITIALIZATION
// Preload essential data for fast UX
// ============================================

/**
 * Initialize essential data (manifest + meta)
 * Call this early (e.g., in App.jsx or main.jsx)
 */
export async function initializeData() {
    await Promise.all([
        loadManifest(),
        loadSubjectsMeta(),
        loadSkillsMeta()
    ])
}

/**
 * Check if essential data is loaded
 */
export function isDataReady() {
    return !!(cache.manifest && cache.subjectsMeta && cache.skillsMeta)
}

// ============================================
// INDEX LOADERS
// ============================================

/**
 * Load skill to subjects index
 * Returns mapping: { "TS1": ["math", "science", ...], ... }
 */
export async function loadSkillToSubjectsIndex() {
    if (cache.skillToSubjects) return cache.skillToSubjects
    cache.skillToSubjects = await fetchJSON('/indexes/skill_to_subjects.json')
    return cache.skillToSubjects
}

/**
 * Load subject stats index
 */
export async function loadSubjectStatsIndex() {
    if (cache.subjectStats) return cache.subjectStats
    cache.subjectStats = await fetchJSON('/indexes/subject_stats.json')
    return cache.subjectStats
}

/**
 * Get subjects for a skill (uses index)
 * Only loads subjects that actually contain the skill
 */
export async function getSubjectsForSkill(skillCode) {
    const index = await loadSkillToSubjectsIndex()
    const mainSkill = skillCode.split('.')[0] // TS1.2 -> TS1
    return index[mainSkill] || []
}

/**
 * Load standards for a skill using index
 * Only loads subjects that contain that skill - avoids loading all data
 */
export async function loadStandardsForSkill(skillCode, additionalFilters = {}) {
    const subjectsWithSkill = await getSubjectsForSkill(skillCode)
    if (subjectsWithSkill.length === 0) return []

    // Apply subject filter if provided
    const targetSubjects = additionalFilters.subjects?.length
        ? subjectsWithSkill.filter(s => additionalFilters.subjects.includes(s))
        : subjectsWithSkill

    const standards = await loadMultipleSubjectStandards(targetSubjects)
    return filterStandards(standards, { ...additionalFilters, skills: [skillCode] })
}

/**
 * Find a standard by code
 * First checks cache, then tries to determine subject from code prefix
 */
export async function loadStandardByCode(code) {
    // Check if already in cache
    for (const [slug, standards] of cache.subjectStandards.entries()) {
        const found = standards.find(s => s.code === code)
        if (found) return found
    }

    // Try to infer subject from code prefix
    const subjectSlug = inferSubjectFromCode(code)
    if (subjectSlug) {
        const standards = await loadSubjectStandards(subjectSlug)
        return standards.find(s => s.code === code) || null
    }

    // Fallback: search all (expensive)
    const manifest = await loadManifest()
    for (const subj of manifest.subjects) {
        const standards = await loadSubjectStandards(subj.subject_slug)
        const found = standards.find(s => s.code === code)
        if (found) return found
    }

    return null
}

/**
 * Infer subject slug from standard code prefix
 * e.g., "CNC-D1-LI01" -> "chinese", "ML-H2-DSJ-005" -> "math"
 */
function inferSubjectFromCode(code) {
    if (!code) return null
    const prefix = code.split('-')[0]?.toUpperCase()

    const prefixMap = {
        'CNC': 'chinese',
        'ML': 'math',
        'ENG': 'english',
        'SCI': 'science',
        'IT': 'it',
        'MLW': 'morality_law',
        'ART': 'arts',
        'LAB': 'labor',
        'PE': 'pe'
    }

    return prefixMap[prefix] || null
}

/**
 * Get subject stats from index
 */
export function getSubjectStats(slug) {
    return cache.subjectStats?.[slug] || null
}

/**
 * Get all subject stats
 */
export function getAllSubjectStats() {
    return cache.subjectStats || {}
}

