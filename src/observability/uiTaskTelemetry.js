import { trackUmamiEvent } from './umamiTelemetry.js'

export const UI_TASKS = Object.freeze([
    'search_start',
    'search_results',
    'graph_open',
    'graph_ready',
    'graph_fallback',
    'favorite_toggle',
    'collection_create'
])

const UI_TASK_SET = new Set(UI_TASKS)
const ANALYTICS_ENABLED = import.meta.env?.VITE_ENABLE_ANALYTICS === 'true'

export function normalizeUiTask(value) {
    return UI_TASK_SET.has(value) ? value : undefined
}

export function readUiVariant(element) {
    const boundary = element?.closest?.('[data-ui-route]')
    const version = boundary?.dataset?.uiVersion === 'v2' ? 'v2' : 'legacy'
    const percentage = boundary?.dataset?.uiRolloutPercentage
    return percentage ? `${version}:${percentage}%` : version
}

export function buildUiTaskProperties(task, element) {
    const normalizedTask = normalizeUiTask(task)
    if (!normalizedTask) return undefined
    return { task: normalizedTask, variant: readUiVariant(element) }
}

export async function trackUiTask(task, element) {
    const properties = buildUiTaskProperties(task, element)
    if (!properties) return false
    const umamiTracked = trackUmamiEvent(`ui_${properties.task}`, { variant: properties.variant })
    if (!ANALYTICS_ENABLED) return umamiTracked
    const { track } = await import('@vercel/analytics')
    track('kebiao_task', properties)
    return true
}
