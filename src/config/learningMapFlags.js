import { isInRollout, parseRolloutPercentage, rolloutBucket } from './uiV2Rollout.js'

const STORAGE_PREFIX = 'kebiao:learning-map:'
const ROLLOUT_SUBJECT_KEY = `${STORAGE_PREFIX}rollout-subject`
const env = import.meta.env || {}
const ENV_DEFAULTS = {
    skills: env.VITE_LEARNING_MAP_SKILLS,
    skillDetail: env.VITE_LEARNING_MAP_SKILL_DETAIL,
    subject: env.VITE_LEARNING_MAP_SUBJECT,
    standard: env.VITE_LEARNING_MAP_STANDARD
}
const FALSE_VALUES = new Set(['0', 'false', 'off', 'legacy'])
const TRUE_VALUES = new Set(['1', 'true', 'on', 'learning-map'])
let ephemeralRolloutSubject

const parseBoolean = value => {
    const normalized = String(value ?? '').trim().toLowerCase()
    if (FALSE_VALUES.has(normalized)) return false
    if (TRUE_VALUES.has(normalized)) return true
    return undefined
}

const createRolloutSubject = () => globalThis.crypto?.randomUUID?.() || `anonymous-${Date.now()}-${Math.random().toString(36).slice(2)}`

const getRolloutSubject = () => {
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

const resolveEnvironmentSetting = value => {
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

export function resolveLearningMapFlag(surface, search = '') {
    const params = new URLSearchParams(search)
    const queryOverride = parseBoolean(params.get('learning-map'))
    if (queryOverride !== undefined) return { enabled: queryOverride, source: 'query' }
    try {
        const stored = parseBoolean(window.localStorage.getItem(`${STORAGE_PREFIX}${surface}`))
        if (stored !== undefined) return { enabled: stored, source: 'localStorage' }
    } catch {
        // Storage can be unavailable in privacy-restricted contexts.
    }
    const surfaceSetting = resolveEnvironmentSetting(ENV_DEFAULTS[surface])
    if (surfaceSetting) return surfaceSetting
    const defaultSetting = resolveEnvironmentSetting(env.VITE_LEARNING_MAP_DEFAULT)
    if (defaultSetting) return defaultSetting
    return { enabled: Boolean(env.DEV), source: env.DEV ? 'development-default' : 'production-default' }
}

export function persistLearningMapFlag(surface, enabled) {
    window.localStorage.setItem(`${STORAGE_PREFIX}${surface}`, enabled ? '1' : '0')
}

export function clearLearningMapFlag(surface) {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${surface}`)
}
