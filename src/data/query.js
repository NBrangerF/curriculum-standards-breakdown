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
 * Additive graph-view query contract. Existing filter parameters keep their
 * current meaning; graph updates are always merged into the current URL so
 * unknown parameters and campaign/share metadata survive round trips.
 */
export const GRAPH_QUERY_PARAMS = Object.freeze({
    VIEW: 'view',
    SUBJECT: 'subject',
    GRADE_BAND: 'gradeBand',
    DOMAIN: 'domain',
    RELATION_TYPES: 'relationTypes',
    SELECTED_NODE: 'selectedNode',
    FOCUS_DEPTH: 'focusDepth',
    COMPARE_SELECTION: 'compareSelection',
    ANALYSIS: 'analysis'
})

export const GRAPH_VIEW_VALUES = Object.freeze(['list', 'compare', 'matrix', 'graph'])
export const GRAPH_RELATION_VALUES = Object.freeze(['contains', 'progression', 'skill_alignment'])
export const GRAPH_ANALYSIS_VALUES = Object.freeze(['compare', 'path', 'progression'])

const splitUniqueValues = value => [...new Set(
    String(value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
)]

const cleanScalar = value => typeof value === 'string' && value.trim() ? value.trim() : undefined

/**
 * Parse only graph-owned state. Invalid values are ignored rather than
 * silently changing the meaning of an old or externally shared URL.
 */
export function parseGraphStateFromURL(searchParams) {
    const view = cleanScalar(searchParams.get(GRAPH_QUERY_PARAMS.VIEW))
    const focusDepthValue = Number(searchParams.get(GRAPH_QUERY_PARAMS.FOCUS_DEPTH))
    const relationTypes = splitUniqueValues(searchParams.get(GRAPH_QUERY_PARAMS.RELATION_TYPES))
        .filter(type => GRAPH_RELATION_VALUES.includes(type))
    const compareSelection = splitUniqueValues(searchParams.get(GRAPH_QUERY_PARAMS.COMPARE_SELECTION))

    return {
        ...(GRAPH_VIEW_VALUES.includes(view) ? { view } : {}),
        ...(cleanScalar(searchParams.get(GRAPH_QUERY_PARAMS.SUBJECT)) ? { subject: searchParams.get(GRAPH_QUERY_PARAMS.SUBJECT).trim() } : {}),
        ...(cleanScalar(searchParams.get(GRAPH_QUERY_PARAMS.GRADE_BAND)) ? { gradeBand: searchParams.get(GRAPH_QUERY_PARAMS.GRADE_BAND).trim().toUpperCase() } : {}),
        ...(cleanScalar(searchParams.get(GRAPH_QUERY_PARAMS.DOMAIN)) ? { domain: searchParams.get(GRAPH_QUERY_PARAMS.DOMAIN).trim() } : {}),
        ...(relationTypes.length ? { relationTypes } : {}),
        ...(cleanScalar(searchParams.get(GRAPH_QUERY_PARAMS.SELECTED_NODE)) ? { selectedNode: searchParams.get(GRAPH_QUERY_PARAMS.SELECTED_NODE).trim() } : {}),
        ...(Number.isInteger(focusDepthValue) && focusDepthValue >= 1 && focusDepthValue <= 3 ? { focusDepth: focusDepthValue } : {}),
        ...(compareSelection.length ? { compareSelection } : {}),
        ...(GRAPH_ANALYSIS_VALUES.includes(cleanScalar(searchParams.get(GRAPH_QUERY_PARAMS.ANALYSIS)))
            ? { analysis: searchParams.get(GRAPH_QUERY_PARAMS.ANALYSIS).trim() }
            : {})
    }
}

/**
 * Merge graph state into an existing URLSearchParams instance without
 * dropping unknown or legacy parameters. Passing null/empty removes only the
 * corresponding graph-owned parameter.
 */
export function mergeGraphStateIntoURL(searchParams, graphState = {}) {
    const params = new URLSearchParams(searchParams)
    const writeScalar = (key, value) => {
        const cleanValue = cleanScalar(value)
        if (cleanValue) params.set(key, cleanValue)
        else params.delete(key)
    }
    const writeList = (key, values) => {
        const cleanValues = splitUniqueValues(Array.isArray(values) ? values.join(',') : values)
        if (cleanValues.length) params.set(key, cleanValues.join(','))
        else params.delete(key)
    }

    writeScalar(GRAPH_QUERY_PARAMS.VIEW, GRAPH_VIEW_VALUES.includes(graphState.view) ? graphState.view : undefined)
    writeScalar(GRAPH_QUERY_PARAMS.SUBJECT, graphState.subject)
    writeScalar(GRAPH_QUERY_PARAMS.GRADE_BAND, graphState.gradeBand?.toUpperCase())
    writeScalar(GRAPH_QUERY_PARAMS.DOMAIN, graphState.domain)
    writeList(
        GRAPH_QUERY_PARAMS.RELATION_TYPES,
        (graphState.relationTypes || []).filter(type => GRAPH_RELATION_VALUES.includes(type))
    )
    writeScalar(GRAPH_QUERY_PARAMS.SELECTED_NODE, graphState.selectedNode)
    writeScalar(
        GRAPH_QUERY_PARAMS.FOCUS_DEPTH,
        Number.isInteger(graphState.focusDepth) && graphState.focusDepth >= 1 && graphState.focusDepth <= 3
            ? String(graphState.focusDepth)
            : undefined
    )
    writeList(GRAPH_QUERY_PARAMS.COMPARE_SELECTION, graphState.compareSelection)
    writeScalar(
        GRAPH_QUERY_PARAMS.ANALYSIS,
        GRAPH_ANALYSIS_VALUES.includes(graphState.analysis) ? graphState.analysis : undefined
    )

    return params
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
    if (navigator.clipboard) {
        try {
            await Promise.race([
                navigator.clipboard.writeText(text),
                new Promise((_, reject) => {
                    window.setTimeout(() => reject(new Error('clipboard_timeout')), 350)
                })
            ])
            return true
        } catch {
            // Continue to the selection-based fallback when permission is denied.
        }
    }

    try {
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.pointerEvents = 'none'
        textArea.style.opacity = '0'
        document.body.appendChild(textArea)
        textArea.select()
        const copied = document.execCommand('copy')
        document.body.removeChild(textArea)
        return copied
    } catch {
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
