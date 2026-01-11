/**
 * URL Query Utilities
 * Unified parsing and serialization for filter state in URLs
 * 
 * Standard query parameters:
 * - mode: compare mode (default 'compare')
 * - subjects: comma-separated subject slugs (e.g., "math,science")
 * - bands: comma-separated grade bands (e.g., "H1,H2")
 * - skills: comma-separated skill codes (e.g., "TS1,TS3")
 * - q: search keyword
 */

/**
 * Valid query parameter names (frozen contract)
 */
export const QUERY_PARAMS = {
    MODE: 'mode',
    SUBJECTS: 'subjects',
    BANDS: 'bands',
    SKILLS: 'skills',
    KEYWORD: 'q'
}

/**
 * Parse URL search params to filter object
 * @param {URLSearchParams} searchParams - URL search params
 * @returns {Object} Filter object
 */
export function parseFiltersFromURL(searchParams) {
    const filters = {}

    // Parse subjects
    const subjects = searchParams.get(QUERY_PARAMS.SUBJECTS)
    if (subjects) {
        filters.subjects = subjects.split(',').map(s => s.trim()).filter(Boolean)
    }

    // Parse grade bands (using 'bands' not 'gradeBands')
    const bands = searchParams.get(QUERY_PARAMS.BANDS)
    if (bands) {
        filters.gradeBands = bands.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    }

    // Parse skills
    const skills = searchParams.get(QUERY_PARAMS.SKILLS)
    if (skills) {
        filters.skills = skills.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    }

    // Parse keyword
    const keyword = searchParams.get(QUERY_PARAMS.KEYWORD)
    if (keyword) {
        filters.keyword = keyword.trim()
    }

    return filters
}

/**
 * Serialize filter object to URL search params string
 * @param {Object} filters - Filter object
 * @returns {string} URL query string (without leading '?')
 */
export function serializeFiltersToURL(filters) {
    const params = new URLSearchParams()

    if (filters.subjects?.length) {
        params.set(QUERY_PARAMS.SUBJECTS, filters.subjects.join(','))
    }

    if (filters.gradeBands?.length) {
        params.set(QUERY_PARAMS.BANDS, filters.gradeBands.join(','))
    }

    if (filters.skills?.length) {
        params.set(QUERY_PARAMS.SKILLS, filters.skills.join(','))
    }

    if (filters.keyword?.trim()) {
        params.set(QUERY_PARAMS.KEYWORD, filters.keyword.trim())
    }

    return params.toString()
}

/**
 * Build full shareable URL from current location and filters
 * @param {Object} filters - Filter object
 * @param {string} basePath - Base path (e.g., '/search')
 * @returns {string} Full URL
 */
export function buildShareableURL(filters, basePath = '/search') {
    const queryString = serializeFiltersToURL(filters)
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return queryString ? `${origin}${basePath}?${queryString}` : `${origin}${basePath}`
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
export async function copyToClipboard(text) {
    try {
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(text)
            return true
        }
        // Fallback for older browsers
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.opacity = '0'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
        return true
    } catch (err) {
        console.error('Failed to copy:', err)
        return false
    }
}

/**
 * Check if filters object has any active filters
 * @param {Object} filters - Filter object
 * @returns {boolean} Has active filters
 */
export function hasActiveFilters(filters) {
    return !!(
        filters.subjects?.length ||
        filters.gradeBands?.length ||
        filters.skills?.length ||
        filters.keyword?.trim()
    )
}

/**
 * Create empty filters object
 * @returns {Object} Empty filter object
 */
export function createEmptyFilters() {
    return {
        subjects: [],
        gradeBands: [],
        skills: [],
        keyword: ''
    }
}

/**
 * Merge two filter objects
 * @param {Object} base - Base filters
 * @param {Object} override - Override filters  
 * @returns {Object} Merged filters
 */
export function mergeFilters(base, override) {
    return {
        subjects: override.subjects?.length ? override.subjects : (base.subjects || []),
        gradeBands: override.gradeBands?.length ? override.gradeBands : (base.gradeBands || []),
        skills: override.skills?.length ? override.skills : (base.skills || []),
        keyword: override.keyword !== undefined ? override.keyword : (base.keyword || '')
    }
}

/**
 * Get human-readable filter summary
 * @param {Object} filters - Filter object
 * @param {Object} options - Options with subject/skill lookups
 * @returns {Array<string>} Summary parts
 */
export function getFilterSummary(filters, options = {}) {
    const { subjectMap = {}, skillMap = {}, gradeBandMap = {} } = options
    const parts = []

    if (filters.subjects?.length) {
        const names = filters.subjects.map(s => subjectMap[s] || s)
        parts.push(`学科: ${names.join(', ')}`)
    }

    if (filters.gradeBands?.length) {
        const names = filters.gradeBands.map(b => gradeBandMap[b] || b)
        parts.push(`学段: ${names.join(', ')}`)
    }

    if (filters.skills?.length) {
        const names = filters.skills.map(s => skillMap[s] || s)
        parts.push(`技能: ${names.join(', ')}`)
    }

    if (filters.keyword?.trim()) {
        parts.push(`关键词: "${filters.keyword}"`)
    }

    return parts
}
