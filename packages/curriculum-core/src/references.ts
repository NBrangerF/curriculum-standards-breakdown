import type { StandardRecord } from './types.js'

export type StandardResolution = {
    status: 'found' | 'missing' | 'ambiguous'
    record?: StandardRecord
    candidates?: StandardRecord[]
    resolved_from?: string
}

const REFERENCE_DELIMITER = /[\n|]+/

export function parseCodeReferences(value: unknown): string[] {
    if (Array.isArray(value)) {
        return [...new Set(value.flatMap(item => parseCodeReferences(item)))]
    }
    return [...new Set(
        String(value || '')
            .split(REFERENCE_DELIMITER)
            .map(item => item.trim())
            .filter(Boolean)
    )]
}

export function createStandardResolver(records: StandardRecord[]) {
    const canonical = new Map<string, StandardRecord>()
    const aliases = new Map<string, StandardRecord[]>()

    const addAlias = (value: unknown, record: StandardRecord) => {
        const key = String(value || '').trim()
        if (!key || canonical.has(key)) return
        const entries = aliases.get(key) || []
        if (!entries.some(item => item.code === record.code)) entries.push(record)
        aliases.set(key, entries)
    }

    for (const record of records) {
        const code = String(record.code || '').trim()
        if (code) canonical.set(code, record)
    }
    for (const record of records) {
        addAlias(record.id, record)
        addAlias(record.legacy_code, record)
        for (const legacyCode of Array.isArray(record.legacy_codes) ? record.legacy_codes : []) {
            addAlias(legacyCode, record)
        }
    }

    return (value: unknown): StandardResolution => {
        const requested = String(value || '').trim()
        const direct = canonical.get(requested)
        if (direct) {
            return {
                status: 'found',
                record: direct,
                resolved_from: requested === direct.code ? undefined : requested
            }
        }
        const candidates = aliases.get(requested) || []
        if (candidates.length === 1) {
            return { status: 'found', record: candidates[0], resolved_from: requested }
        }
        if (candidates.length > 1) return { status: 'ambiguous', candidates }
        return { status: 'missing' }
    }
}
