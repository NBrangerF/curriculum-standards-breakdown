export type JsonObject = Record<string, unknown>

export interface ApiEnvelope<T> {
    data: T
    meta: {
        request_id: string
        data_version?: string
        schema_version?: string
        warnings?: string[]
        [key: string]: unknown
    }
}

export interface ApiErrorEnvelope {
    error: {
        code: string
        message: string
        details: unknown[]
    }
    meta: {
        request_id?: string
    }
}

export interface CurriculumClientOptions {
    baseUrl: string
    apiKey?: string
    fetch?: typeof fetch
}

export interface RequestOptions {
    include?: string[]
    limit?: number
    cursor?: string | null
}

export class CurriculumApiError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly code: string,
        public readonly details: unknown[],
        public readonly requestId?: string
    ) {
        super(message)
        this.name = 'CurriculumApiError'
    }
}

function cleanBaseUrl(value: string): string {
    return value.replace(/\/+$/, '')
}

function queryString(params: Record<string, string | number | null | undefined>): string {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue
        query.set(key, String(value))
    }
    const serialized = query.toString()
    return serialized ? `?${serialized}` : ''
}

function includeParam(include?: string[]): string | undefined {
    return include?.length ? include.join(',') : undefined
}

export class CurriculumClient {
    private readonly baseUrl: string
    private readonly apiKey?: string
    private readonly fetchImpl: typeof fetch

    constructor(options: CurriculumClientOptions) {
        this.baseUrl = cleanBaseUrl(options.baseUrl)
        this.apiKey = options.apiKey
        this.fetchImpl = options.fetch || fetch
    }

    private async request<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
        const headers = new Headers(init.headers)
        if (this.apiKey) headers.set('x-api-key', this.apiKey)
        if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers })
        const payload = await response.json().catch(() => null) as ApiEnvelope<T> | ApiErrorEnvelope | null

        if (!response.ok) {
            const errorPayload = payload && 'error' in payload ? payload : null
            throw new CurriculumApiError(
                errorPayload?.error.message || `Curriculum API request failed with status ${response.status}`,
                response.status,
                errorPayload?.error.code || 'request_failed',
                errorPayload?.error.details || [],
                errorPayload?.meta.request_id
            )
        }

        return payload as ApiEnvelope<T>
    }

    getHealth() {
        return this.request<JsonObject>('/api/v1/health')
    }

    getMeta() {
        return this.request<JsonObject>('/api/v1/meta')
    }

    getDataVersion() {
        return this.request<JsonObject>('/api/v1/data-version')
    }

    listSubjects() {
        return this.request<JsonObject[]>('/api/v1/subjects')
    }

    getSubject(subjectSlug: string) {
        return this.request<JsonObject>(`/api/v1/subjects/${encodeURIComponent(subjectSlug)}`)
    }

    getSubjectDomains(subjectSlug: string) {
        return this.request<JsonObject>(`/api/v1/subjects/${encodeURIComponent(subjectSlug)}/domains`)
    }

    listSkills() {
        return this.request<JsonObject>('/api/v1/skills')
    }

    getSkill(skillCode: string) {
        return this.request<JsonObject>(`/api/v1/skills/${encodeURIComponent(skillCode)}`)
    }

    getSkillStandards(skillCode: string, options: RequestOptions = {}) {
        const query = queryString({
            include: includeParam(options.include),
            limit: options.limit,
            cursor: options.cursor
        })
        return this.request<JsonObject[]>(`/api/v1/skills/${encodeURIComponent(skillCode)}/standards${query}`)
    }

    getStandard(code: string, options: Pick<RequestOptions, 'include'> = {}) {
        const query = queryString({ include: includeParam(options.include) })
        return this.request<JsonObject>(`/api/v1/standards/${encodeURIComponent(code)}${query}`)
    }

    getStandardProgression(code: string, options: Pick<RequestOptions, 'include'> = {}) {
        const query = queryString({ include: includeParam(options.include) })
        return this.request<JsonObject>(`/api/v1/standards/${encodeURIComponent(code)}/progression${query}`)
    }

    getStandardNeighbors(code: string, options: Pick<RequestOptions, 'include'> = {}) {
        const query = queryString({ include: includeParam(options.include) })
        return this.request<JsonObject>(`/api/v1/standards/${encodeURIComponent(code)}/neighbors${query}`)
    }

    searchStandards(body: JsonObject) {
        return this.request<JsonObject[]>('/api/v1/standards/search', {
            method: 'POST',
            body: JSON.stringify(body)
        })
    }

    batchStandards(body: JsonObject) {
        return this.request<JsonObject[]>('/api/v1/standards/batch', {
            method: 'POST',
            body: JSON.stringify(body)
        })
    }

    compareStandards(body: JsonObject) {
        return this.request<JsonObject>('/api/v1/standards/compare', {
            method: 'POST',
            body: JSON.stringify(body)
        })
    }

}
