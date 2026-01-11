/**
 * Compare Mode Selection Logic
 * 
 * Enforces mutual exclusion rules for compare mode:
 * - A: 1-3 subjects + exactly 1 grade band
 * - B: exactly 1 subject + 1-3 grade bands
 * 
 * Never allow multiple subjects AND multiple grade bands simultaneously.
 */

/**
 * Maximum allowed selections
 */
export const MAX_SUBJECTS = 3
export const MAX_GRADE_BANDS = 3

/**
 * Default selections for compare mode
 */
export const DEFAULT_COMPARE_STATE = {
    subjects: ['it'],
    gradeBands: ['H2'],
    skills: []
}

/**
 * Check if current selection is valid for compare mode
 * @param {string[]} subjects - Selected subject slugs
 * @param {string[]} gradeBands - Selected grade bands
 * @returns {boolean} Whether selection is valid
 */
export function isValidCompareSelection(subjects, gradeBands) {
    const subjectCount = subjects?.length || 0
    const bandCount = gradeBands?.length || 0

    // Must have at least 1 subject and 1 grade band
    if (subjectCount === 0 || bandCount === 0) return false

    // A: 1-3 subjects + exactly 1 grade band
    if (subjectCount >= 1 && subjectCount <= MAX_SUBJECTS && bandCount === 1) {
        return true
    }

    // B: exactly 1 subject + 1-3 grade bands
    if (subjectCount === 1 && bandCount >= 1 && bandCount <= MAX_GRADE_BANDS) {
        return true
    }

    return false
}

/**
 * Get validation message for current selection
 * @param {string[]} subjects - Selected subject slugs
 * @param {string[]} gradeBands - Selected grade bands
 * @returns {string|null} Error message or null if valid
 */
export function getValidationMessage(subjects, gradeBands) {
    const subjectCount = subjects?.length || 0
    const bandCount = gradeBands?.length || 0

    if (subjectCount === 0 && bandCount === 0) {
        return '请选择学科和学段'
    }

    if (subjectCount === 0) {
        return '请选择至少1个学科'
    }

    if (bandCount === 0) {
        return '请选择1个学段'
    }

    if (subjectCount > MAX_SUBJECTS) {
        return `最多选择${MAX_SUBJECTS}个学科`
    }

    if (bandCount > MAX_GRADE_BANDS) {
        return `最多选择${MAX_GRADE_BANDS}个学段`
    }

    // Should not reach here if isValidCompareSelection catches all cases
    return null
}

/**
 * Attempt to add a subject, enforcing constraints
 * @param {Object} current - Current state { subjects, gradeBands }
 * @param {string} slug - Subject slug to add
 * @returns {Object} { subjects, gradeBands, message }
 */
export function addSubject(current, slug) {
    const { subjects = [], gradeBands = [] } = current
    let newSubjects = [...subjects]
    let newBands = [...gradeBands]
    let message = null

    // If already selected, remove it (toggle behavior)
    if (subjects.includes(slug)) {
        return {
            subjects: subjects.filter(s => s !== slug),
            gradeBands: newBands,
            message: null
        }
    }

    // Add the new subject
    newSubjects.push(slug)

    // Check if exceeds max
    if (newSubjects.length > MAX_SUBJECTS) {
        newSubjects = newSubjects.slice(-MAX_SUBJECTS)
        message = `最多选择${MAX_SUBJECTS}个学科`
    }

    // If we now have multiple subjects, enforce single grade band
    if (newSubjects.length > 1 && newBands.length > 1) {
        newBands = [newBands[0]] // Keep only first
        message = '对比多个学科时，学段只能选1个'
    }

    return {
        subjects: newSubjects,
        gradeBands: newBands,
        message
    }
}

/**
 * Attempt to add a grade band, enforcing constraints
 * @param {Object} current - Current state { subjects, gradeBands }
 * @param {string} band - Grade band to add (H1, H2, H3)
 * @returns {Object} { subjects, gradeBands, message }
 */
export function addGradeBand(current, band) {
    const { subjects = [], gradeBands = [] } = current
    let newSubjects = [...subjects]
    let newBands = [...gradeBands]
    let message = null

    // If already selected, remove it (toggle behavior)
    if (gradeBands.includes(band)) {
        return {
            subjects: newSubjects,
            gradeBands: gradeBands.filter(b => b !== band),
            message: null
        }
    }

    // Add the new band
    newBands.push(band)

    // Check if exceeds max
    if (newBands.length > MAX_GRADE_BANDS) {
        newBands = newBands.slice(-MAX_GRADE_BANDS)
        message = `最多选择${MAX_GRADE_BANDS}个学段`
    }

    // If we now have multiple bands, enforce single subject
    if (newBands.length > 1 && newSubjects.length > 1) {
        newSubjects = [newSubjects[0]] // Keep only first
        message = '对比多个学段时，学科只能选1个'
    }

    return {
        subjects: newSubjects,
        gradeBands: newBands,
        message
    }
}

/**
 * Get compare mode type based on selection
 * @param {string[]} subjects - Selected subject slugs
 * @param {string[]} gradeBands - Selected grade bands
 * @returns {'subjects'|'gradeBands'|null} Compare mode type
 */
export function getCompareMode(subjects, gradeBands) {
    const subjectCount = subjects?.length || 0
    const bandCount = gradeBands?.length || 0

    if (!isValidCompareSelection(subjects, gradeBands)) {
        return null
    }

    // Multiple subjects, single band = comparing subjects
    if (subjectCount > 1 && bandCount === 1) {
        return 'subjects'
    }

    // Single subject, multiple/single bands = comparing grade bands
    return 'gradeBands'
}

/**
 * Toggle skill selection (skills don't affect compare validity)
 * @param {string[]} skills - Current skills
 * @param {string} code - Skill code to toggle
 * @returns {string[]} Updated skills
 */
export function toggleSkill(skills = [], code) {
    if (skills.includes(code)) {
        return skills.filter(s => s !== code)
    }
    return [...skills, code]
}

/**
 * Fixed grade band order for display
 */
export const GRADE_BAND_ORDER = { H1: 1, H2: 2, H3: 3 }

/**
 * Sort grade bands by fixed order (H1 → H2 → H3)
 * @param {string[]} bands - Grade bands to sort
 * @returns {string[]} Sorted grade bands
 */
export function sortGradeBands(bands) {
    if (!bands || !Array.isArray(bands)) return []
    return [...bands].sort((a, b) =>
        (GRADE_BAND_ORDER[a] || 99) - (GRADE_BAND_ORDER[b] || 99)
    )
}

/**
 * Normalize and auto-correct compare selection
 * Unified logic for both HomePage and SearchResultsPage
 * 
 * @param {Object} draft - Draft filter state
 * @param {string[]} draft.subjects - Selected subjects
 * @param {string[]} draft.gradeBands - Selected grade bands
 * @param {'subjects'|'bands'|null} lastChanged - Which dimension was last changed
 * @returns {Object} { subjects, gradeBands, message, changed }
 */
export function normalizeCompareSelection(draft, lastChanged = null) {
    let subjects = [...(draft?.subjects || [])]
    let gradeBands = [...(draft?.gradeBands || [])]
    let message = null
    let changed = false

    // Ensure arrays
    if (!Array.isArray(subjects)) subjects = []
    if (!Array.isArray(gradeBands)) gradeBands = []

    // Enforce max limits
    if (subjects.length > MAX_SUBJECTS) {
        subjects = subjects.slice(-MAX_SUBJECTS)
        message = `最多选择${MAX_SUBJECTS}个学科`
        changed = true
    }

    if (gradeBands.length > MAX_GRADE_BANDS) {
        gradeBands = gradeBands.slice(-MAX_GRADE_BANDS)
        message = `最多选择${MAX_GRADE_BANDS}个学段`
        changed = true
    }

    // Handle conflict: multiple subjects AND multiple bands
    if (subjects.length > 1 && gradeBands.length > 1) {
        changed = true

        if (lastChanged === 'subjects') {
            // User just added a subject → keep subjects, reduce bands to 1
            gradeBands = [gradeBands[0]]
            message = '对比多个学科时，学段只能选1个'
        } else if (lastChanged === 'bands') {
            // User just added a band → keep bands, reduce subjects to 1
            subjects = [subjects[0]]
            message = '对比多个学段时，学科只能选1个'
        } else {
            // No context → default to keeping subjects (arbitrary but consistent)
            gradeBands = [gradeBands[0]]
            message = '对比多个学科时，学段只能选1个'
        }
    }

    // Sort grade bands for consistent display
    gradeBands = sortGradeBands(gradeBands)

    return {
        subjects,
        gradeBands,
        message,
        changed
    }
}

/**
 * Create safe filters with guaranteed arrays
 * @param {Object} filters - Input filters
 * @returns {Object} Filters with guaranteed arrays
 */
export function ensureSafeFilters(filters) {
    return {
        subjects: Array.isArray(filters?.subjects) ? filters.subjects : [],
        gradeBands: Array.isArray(filters?.gradeBands) ? filters.gradeBands : [],
        skills: Array.isArray(filters?.skills) ? filters.skills : []
    }
}

/**
 * Check if two filter objects are different
 * @param {Object} a - First filter
 * @param {Object} b - Second filter
 * @returns {boolean} Whether filters are different
 */
export function filtersAreDifferent(a, b) {
    const safeA = ensureSafeFilters(a)
    const safeB = ensureSafeFilters(b)

    if (safeA.subjects.length !== safeB.subjects.length) return true
    if (safeA.gradeBands.length !== safeB.gradeBands.length) return true
    if (safeA.skills.length !== safeB.skills.length) return true

    if (!safeA.subjects.every(s => safeB.subjects.includes(s))) return true
    if (!safeA.gradeBands.every(b => safeB.gradeBands.includes(b))) return true
    if (!safeA.skills.every(s => safeB.skills.includes(s))) return true

    return false
}
