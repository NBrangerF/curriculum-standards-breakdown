const STORAGE_PREFIX = 'kebiao:ui-v2:'

const ENV_DEFAULTS = {
    home: import.meta.env.VITE_UI_V2_HOME,
    subject: import.meta.env.VITE_UI_V2_SUBJECT,
    skills: import.meta.env.VITE_UI_V2_SKILLS,
    skillDetail: import.meta.env.VITE_UI_V2_SKILL_DETAIL,
    standard: import.meta.env.VITE_UI_V2_STANDARD,
    search: import.meta.env.VITE_UI_V2_SEARCH,
    glossary: import.meta.env.VITE_UI_V2_GLOSSARY,
    collections: import.meta.env.VITE_UI_V2_COLLECTIONS,
    collectionDetail: import.meta.env.VITE_UI_V2_COLLECTION_DETAIL,
    print: import.meta.env.VITE_UI_V2_PRINT,
    styleguide: import.meta.env.VITE_UI_V2_STYLEGUIDE,
    feedback: import.meta.env.VITE_UI_V2_FEEDBACK,
    h4gReview: import.meta.env.VITE_UI_V2_H4G_REVIEW
}

const FALSE_VALUES = new Set(['0', 'false', 'off', 'legacy'])
const TRUE_VALUES = new Set(['1', 'true', 'on', 'v2'])

function parseBoolean(value) {
    const normalized = String(value ?? '').trim().toLowerCase()
    if (FALSE_VALUES.has(normalized)) return false
    if (TRUE_VALUES.has(normalized)) return true
    return undefined
}

export function resolveUiV2Flag(routeKey, search = '') {
    const params = new URLSearchParams(search)
    const queryOverride = parseBoolean(params.get('ui-v2') ?? params.get('ui'))
    if (queryOverride !== undefined) return { enabled: queryOverride, source: 'query' }

    try {
        const storageOverride = parseBoolean(window.localStorage.getItem(`${STORAGE_PREFIX}${routeKey}`))
        if (storageOverride !== undefined) return { enabled: storageOverride, source: 'localStorage' }
    } catch {
        // Storage can be unavailable in privacy-restricted contexts.
    }

    const environmentOverride = parseBoolean(ENV_DEFAULTS[routeKey])
    if (environmentOverride !== undefined) return { enabled: environmentOverride, source: 'environment' }
    return { enabled: true, source: 'default' }
}

export function persistUiV2Flag(routeKey, enabled) {
    window.localStorage.setItem(`${STORAGE_PREFIX}${routeKey}`, enabled ? '1' : '0')
}

export function clearUiV2Flag(routeKey) {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${routeKey}`)
}
