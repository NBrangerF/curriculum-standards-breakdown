const PRODUCTION_HOSTS = new Set(['kebiao.org', 'www.kebiao.org'])

const EVENT_PROPERTIES = Object.freeze({
    subject_open: ['subject_slug'],
    standard_open: ['standard_code'],
    learning_map_open: ['standard_code'],
    smart_search_open: [],
    smart_search_submit: ['query_length_bucket'],
    smart_search_results: ['result_count_bucket', 'interpreter_status'],
    smart_search_error: ['error_kind'],
    smart_search_result_open: ['rank_bucket', 'match_strength', 'subject'],
    collection_add: ['surface'],
    collection_batch_add: ['surface', 'count_bucket'],
    api_docs_open: [],
    ui_search_start: ['variant'],
    ui_search_results: ['variant'],
    ui_graph_open: ['variant'],
    ui_graph_ready: ['variant'],
    ui_graph_fallback: ['variant'],
    ui_favorite_toggle: ['variant'],
    ui_collection_create: ['variant']
})

export const UMAMI_EVENTS = Object.freeze(Object.keys(EVENT_PROPERTIES))

export function isKebiaoProductionHost(hostname = globalThis.location?.hostname) {
    return PRODUCTION_HOSTS.has(String(hostname || '').toLowerCase())
}

function cleanPropertyValue(value) {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value !== 'string') return undefined
    const normalized = value.trim()
    return normalized && normalized.length <= 80 ? normalized : undefined
}

export function sanitizeUmamiEvent(eventName, properties = {}) {
    const allowedProperties = EVENT_PROPERTIES[eventName]
    if (!allowedProperties) return undefined

    const sanitized = {}
    allowedProperties.forEach(key => {
        const value = cleanPropertyValue(properties[key])
        if (value !== undefined) sanitized[key] = value
    })
    return { eventName, properties: sanitized }
}

export function queryLengthBucket(query) {
    const length = String(query || '').trim().length
    if (length <= 40) return '2-40'
    if (length <= 120) return '41-120'
    if (length <= 250) return '121-250'
    return '251-500'
}

export function countBucket(value) {
    const count = Math.max(0, Number(value) || 0)
    if (count === 0) return '0'
    if (count <= 3) return '1-3'
    if (count <= 10) return '4-10'
    if (count <= 25) return '11-25'
    return '26+'
}

export function rankBucket(value) {
    const rank = Math.max(1, Number(value) || 1)
    if (rank <= 3) return '1-3'
    if (rank <= 6) return '4-6'
    return '7+'
}

const INTERPRETER_STATUSES = new Set([
    'ok',
    'disabled',
    'timeout',
    'invalid_config',
    'invalid_response',
    'provider_error'
])

export function normalizeInterpreterStatus(value) {
    return INTERPRETER_STATUSES.has(value) ? value : 'unknown'
}

export function classifySearchError(error) {
    if (error?.name === 'AbortError') return 'aborted'
    const status = Number(error?.status)
    if (status >= 500) return 'server'
    if (status >= 400) return 'client'
    if (/timeout/i.test(String(error?.message || ''))) return 'timeout'
    return 'network_or_unknown'
}

export function trackUmamiEvent(eventName, properties = {}) {
    if (!isKebiaoProductionHost()) return false
    const event = sanitizeUmamiEvent(eventName, properties)
    const track = globalThis.umami?.track
    if (!event || typeof track !== 'function') return false
    track(event.eventName, event.properties)
    return true
}
