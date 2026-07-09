import { projectStandard } from './fieldsets.js'
import { normalizeStandard } from './normalize.js'
import type { JsonObject, StandardFilters, StandardRecord } from './types.js'

export interface MeilisearchConfig {
    host: string
    apiKey?: string
    indexUid?: string
    fetch?: typeof fetch
}

export interface MeilisearchIndexOptions {
    primaryKey?: string
    batchSize?: number
}

export interface MeilisearchSearchRequest extends StandardFilters {
    q?: string
    limit?: number
    offset?: number
}

const DEFAULT_INDEX_UID = 'curriculum_standards'

const FILTERABLE_ATTRIBUTES = [
    'code',
    'subject_slug',
    'subject',
    'grade_band',
    'domain',
    'subdomain',
    'ts_primary',
    'ts_secondary'
]

const SEARCHABLE_ATTRIBUTES = [
    'code',
    'standard_title',
    'standard',
    'context',
    'practice',
    'teaching_tip',
    'assessment_evidence_type',
    'domain',
    'subdomain'
]

function cleanHost(host: string): string {
    return host.replace(/\/+$/, '')
}

function meiliHeaders(apiKey?: string): HeadersInit {
    const headers: Record<string, string> = {
        'content-type': 'application/json'
    }
    if (apiKey) headers.authorization = `Bearer ${apiKey}`
    return headers
}

function quoteFilterValue(value: string): string {
    return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function arrayFilter(field: string, values?: string[]): string | null {
    if (!values?.length) return null
    return `(${values.map(value => `${field} = ${quoteFilterValue(value)}`).join(' OR ')})`
}

export function buildMeilisearchFilter(filters: StandardFilters = {}): string | undefined {
    const clauses = [
        arrayFilter('subject_slug', filters.subjects),
        arrayFilter('grade_band', filters.grade_bands),
        arrayFilter('domain', filters.domains),
        filters.skills?.length
            ? `(${filters.skills.flatMap(skill => [
                `ts_primary = ${quoteFilterValue(skill)}`,
                `ts_secondary = ${quoteFilterValue(skill)}`
            ]).join(' OR ')})`
            : null
    ].filter(Boolean)
    return clauses.length ? clauses.join(' AND ') : undefined
}

export function createMeilisearchDocuments(records: StandardRecord[]): JsonObject[] {
    return records.map(record => {
        const normalized = normalizeStandard(record)
        return {
            ...projectStandard(normalized, ['public', 'evidence']),
            searchable_text: [
                normalized.standard_title,
                normalized.standard,
                normalized.context,
                normalized.practice,
                normalized.teaching_tip,
                normalized.assessment_evidence_type,
                normalized.domain,
                normalized.subdomain
            ].filter(Boolean).join('\n')
        }
    })
}

async function meiliRequest<T>(
    config: MeilisearchConfig,
    path: string,
    init: RequestInit = {}
): Promise<T> {
    const fetchImpl = config.fetch || fetch
    const response = await fetchImpl(`${cleanHost(config.host)}${path}`, {
        ...init,
        headers: {
            ...meiliHeaders(config.apiKey),
            ...(init.headers || {})
        }
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
        throw new Error(`Meilisearch request failed (${response.status}): ${JSON.stringify(payload)}`)
    }
    return payload as T
}

export async function configureMeilisearchIndex(config: MeilisearchConfig) {
    const indexUid = config.indexUid || DEFAULT_INDEX_UID
    await meiliRequest(config, `/indexes/${encodeURIComponent(indexUid)}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
            filterableAttributes: FILTERABLE_ATTRIBUTES,
            sortableAttributes: ['code', 'subject_slug', 'grade_band'],
            searchableAttributes: SEARCHABLE_ATTRIBUTES,
            displayedAttributes: ['*']
        })
    })
}

export async function upsertMeilisearchDocuments(
    config: MeilisearchConfig,
    records: StandardRecord[],
    options: MeilisearchIndexOptions = {}
) {
    const indexUid = config.indexUid || DEFAULT_INDEX_UID
    const primaryKey = options.primaryKey || 'code'
    const batchSize = Math.max(1, options.batchSize || 500)
    const documents = createMeilisearchDocuments(records)
    const tasks = []
    for (let index = 0; index < documents.length; index += batchSize) {
        tasks.push(await meiliRequest(config, `/indexes/${encodeURIComponent(indexUid)}/documents?primaryKey=${primaryKey}`, {
            method: 'POST',
            body: JSON.stringify(documents.slice(index, index + batchSize))
        }))
    }
    return {
        index_uid: indexUid,
        document_count: documents.length,
        tasks
    }
}

export async function searchMeilisearchStandards(
    config: MeilisearchConfig,
    request: MeilisearchSearchRequest = {}
) {
    const indexUid = config.indexUid || DEFAULT_INDEX_UID
    return meiliRequest(config, `/indexes/${encodeURIComponent(indexUid)}/search`, {
        method: 'POST',
        body: JSON.stringify({
            q: request.q || request.keyword || '',
            filter: buildMeilisearchFilter(request),
            limit: request.limit || 20,
            offset: request.offset || 0
        })
    })
}
