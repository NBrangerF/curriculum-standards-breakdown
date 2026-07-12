const PERCENTAGE_PATTERN = /^(?:100(?:\.0+)?|\d{1,2}(?:\.\d+)?)%?$/u

export function parseRolloutPercentage(value) {
    const normalized = String(value ?? '').trim()
    if (!PERCENTAGE_PATTERN.test(normalized)) return undefined
    const percentage = Number.parseFloat(normalized.replace('%', ''))
    return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100
        ? percentage
        : undefined
}

export function rolloutBucket(subject) {
    const input = `kebiao-v2:${String(subject)}`
    let hash = 2166136261
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0) % 10_000
}

export function isInRollout(subject, percentage) {
    return rolloutBucket(subject) < Math.round(percentage * 100)
}
