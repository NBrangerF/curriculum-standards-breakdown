import { isInRollout, parseRolloutPercentage, rolloutBucket } from './uiV2Rollout.js'

const STORAGE_PREFIX = 'kebiao:ui-v2:'
const ROLLOUT_SUBJECT_KEY = `${STORAGE_PREFIX}rollout-subject`

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
    api: import.meta.env.VITE_UI_V2_API,
    contact: import.meta.env.VITE_UI_V2_CONTACT
}

const FALSE_VALUES = new Set(['0', 'false', 'off', 'legacy'])
const TRUE_VALUES = new Set(['1', 'true', 'on', 'v2'])
let ephemeralRolloutSubject

function parseBoolean(value) {
    const normalized = String(value ?? '').trim().toLowerCase()
    if (FALSE_VALUES.has(normalized)) return false
    if (TRUE_VALUES.has(normalized)) return true
    return undefined
}

function createRolloutSubject() {
    return globalThis.crypto?.randomUUID?.() || `anonymous-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getRolloutSubject() {
    try {
        const existing = window.localStorage.getItem(ROLLOUT_SUBJECT_KEY)
        if (existing) return existing
        const created = createRolloutSubject()
        window.localStorage.setItem(ROLLOUT_SUBJECT_KEY, created)
        return created
    } catch {
        ephemeralRolloutSubject ||= createRolloutSubject()
        return ephemeralRolloutSubject
    }
}

function resolveEnvironmentSetting(value) {
    const boolean = parseBoolean(value)
    if (boolean !== undefined) return { enabled: boolean, source: 'environment' }

    const percentage = parseRolloutPercentage(value)
    if (percentage === undefined) return undefined
    const subject = getRolloutSubject()
    return {
        enabled: isInRollout(subject, percentage),
        source: 'environment-rollout',
        rolloutPercentage: percentage,
        rolloutBucket: rolloutBucket(subject)
    }
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

    const routeEnvironment = resolveEnvironmentSetting(ENV_DEFAULTS[routeKey])
    if (routeEnvironment) return routeEnvironment

    const globalEnvironment = resolveEnvironmentSetting(import.meta.env.VITE_UI_V2_DEFAULT)
    if (globalEnvironment) return globalEnvironment

    return {
        enabled: import.meta.env.DEV,
        source: import.meta.env.DEV ? 'development-default' : 'production-default'
    }
}

export function persistUiV2Flag(routeKey, enabled) {
    window.localStorage.setItem(`${STORAGE_PREFIX}${routeKey}`, enabled ? '1' : '0')
}

export function clearUiV2Flag(routeKey) {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${routeKey}`)
}
