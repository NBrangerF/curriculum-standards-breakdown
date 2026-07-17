import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Context } from 'hono'
import type { ApiBindings } from './http.js'
import { apiError } from './http.js'

interface PrivateAssetRecord {
    asset_id: string
    edition_id: string
    object_path: string
    bytes: number
    transfer_verified: boolean
    pdf_structural_verified: boolean
}

interface AssetLocation {
    record: PrivateAssetRecord
    path: string
}

const REMOTE_RESPONSE_HEADERS = [
    'accept-ranges',
    'cache-control',
    'content-length',
    'content-range',
    'content-type',
    'etag',
    'last-modified'
] as const

function readJson(path: string): Record<string, unknown> {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

function readJsonLines(path: string): PrivateAssetRecord[] {
    return readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => JSON.parse(line) as PrivateAssetRecord)
}

function firstExisting(candidates: string[]): string | null {
    for (const path of candidates) if (existsSync(path)) return resolve(path)
    return null
}

export function resolveTextbookPrivateDataRoot(): string | null {
    if (process.env.TEXTBOOK_REGISTRY_ROOT) return resolve(process.env.TEXTBOOK_REGISTRY_ROOT)
    return firstExisting(['data/textbooks', '../../data/textbooks'])
}

export function resolveTextbookLibraryRoot(): string | null {
    const configured = process.env.TEXTBOOK_LIBRARY_ROOT
    if (configured) return isAbsolute(configured) ? resolve(configured) : null
    return firstExisting(['/Volumes/X9 Pro/kebiao-library'])
}

function parseRange(value: string | undefined, size: number): { start: number; end: number } | null | 'invalid' {
    if (!value) return null
    const match = value.match(/^bytes=(\d*)-(\d*)$/)
    if (!match) return 'invalid'
    let start: number
    let end: number
    if (!match[1]) {
        const suffixLength = Number(match[2])
        if (!Number.isInteger(suffixLength) || suffixLength <= 0) return 'invalid'
        start = Math.max(0, size - suffixLength)
        end = size - 1
    } else {
        start = Number(match[1])
        end = match[2] ? Number(match[2]) : size - 1
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return 'invalid'
    return { start, end: Math.min(end, size - 1) }
}

export class TextbookAssetService {
    private readonly byAssetId = new Map<string, PrivateAssetRecord>()
    private readonly byEditionId = new Map<string, PrivateAssetRecord>()

    constructor(
        private readonly privateDataRoot = resolveTextbookPrivateDataRoot(),
        private readonly libraryRoot = resolveTextbookLibraryRoot(),
        private readonly publicBaseUrl = process.env.TEXTBOOK_ASSET_BASE_URL || null,
        private readonly fetchRemote: typeof fetch = fetch
    ) {
        if (!privateDataRoot) return
        const currentPath = join(privateDataRoot, 'library-state/CURRENT.json')
        if (!existsSync(currentPath)) return
        const current = readJson(currentPath)
        const generationId = String(current.generation_id || '')
        if (!generationId) return
        const registryPath = join(privateDataRoot, `library-state/generations/${generationId}/asset_registry.lock.jsonl`)
        if (!existsSync(registryPath)) return
        for (const record of readJsonLines(registryPath)) {
            this.byAssetId.set(record.asset_id, record)
            this.byEditionId.set(record.edition_id, record)
        }
    }

    private localLocation(record: PrivateAssetRecord): AssetLocation | null {
        if (!this.libraryRoot || !record.object_path || !record.transfer_verified || !record.pdf_structural_verified) return null
        const path = resolve(this.libraryRoot, record.object_path)
        const rel = relative(this.libraryRoot, path)
        if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) || !existsSync(path)) return null
        return { record, path }
    }

    private remoteUrl(record: PrivateAssetRecord): URL | null {
        if (!this.publicBaseUrl || !record.transfer_verified || !record.pdf_structural_verified) return null
        if (!/^objects\/sha256\/[0-9a-f]{2}\/[0-9a-f]{64}\.pdf$/.test(record.object_path)) return null
        const baseUrl = new URL(this.publicBaseUrl.endsWith('/') ? this.publicBaseUrl : `${this.publicBaseUrl}/`)
        return new URL(record.object_path, baseUrl)
    }

    createViewerSession(editionId: string) {
        const record = this.byEditionId.get(editionId)
        if (!record) return null
        if (this.remoteUrl(record)) {
            return {
                edition_id: editionId,
                asset_id: record.asset_id,
                url: `/api/v1/textbook-assets/${record.asset_id}`,
                expires_at: null,
                delivery: 'object_storage_proxy' as const,
                supports_range: true as const
            }
        }
        if (!this.localLocation(record)) return null
        return {
            edition_id: editionId,
            asset_id: record.asset_id,
            url: `/api/v1/textbook-assets/${record.asset_id}`,
            expires_at: null,
            delivery: 'local_range' as const,
            supports_range: true as const
        }
    }

    async respond(c: Context<ApiBindings>, assetId: string) {
        const record = this.byAssetId.get(assetId)
        const remoteUrl = record ? this.remoteUrl(record) : null
        if (record && remoteUrl) return this.respondFromRemote(c, record, remoteUrl)
        const location = record ? this.localLocation(record) : null
        if (!location) return apiError(c, 404, 'not_found', '未找到可读的教材文件。')
        const info = await stat(location.path)
        const selectedRange = parseRange(c.req.header('range'), info.size)
        if (selectedRange === 'invalid') {
            c.header('content-range', `bytes */${info.size}`)
            return c.body(null, 416)
        }

        const start = selectedRange?.start ?? 0
        const end = selectedRange?.end ?? info.size - 1
        const stream = createReadStream(location.path, { start, end })
        const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>
        c.header('accept-ranges', 'bytes')
        c.header('content-type', 'application/pdf')
        c.header('content-length', String(end - start + 1))
        c.header('cache-control', 'private, max-age=3600')
        c.header('content-disposition', `inline; filename="${location.record.edition_id}.pdf"`)
        if (selectedRange) {
            c.header('content-range', `bytes ${start}-${end}/${info.size}`)
            return c.body(body, 206)
        }
        return c.body(body, 200)
    }

    private async respondFromRemote(c: Context<ApiBindings>, record: PrivateAssetRecord, remoteUrl: URL) {
        const headers = new Headers()
        for (const name of ['range', 'if-range', 'if-none-match', 'if-modified-since']) {
            const value = c.req.header(name)
            if (value) headers.set(name, value)
        }

        let upstream: Response
        try {
            upstream = await this.fetchRemote(remoteUrl, { method: c.req.method === 'HEAD' ? 'HEAD' : 'GET', headers })
        } catch {
            return apiError(c, 503, 'asset_origin_unavailable', '教材文件源站暂时不可用，请稍后重试。')
        }

        for (const name of REMOTE_RESPONSE_HEADERS) {
            const value = upstream.headers.get(name)
            if (value) c.header(name, value)
        }
        c.header('content-disposition', `inline; filename="${record.edition_id}.pdf"`)
        c.header('x-content-type-options', 'nosniff')

        if (![200, 206, 304, 416].includes(upstream.status)) {
            upstream.body?.cancel().catch(() => undefined)
            return apiError(c, upstream.status === 404 ? 404 : 503, upstream.status === 404 ? 'not_found' : 'asset_origin_error', upstream.status === 404 ? '未找到可读的教材文件。' : '教材文件源站返回异常。')
        }
        if (upstream.status === 304) return c.body(null, 304)
        if (upstream.status === 416) return c.body(null, 416)
        if (c.req.method === 'HEAD' || !upstream.body) {
            return upstream.status === 206 ? c.body(null, 206) : c.body(null, 200)
        }
        return upstream.status === 206 ? c.body(upstream.body, 206) : c.body(upstream.body, 200)
    }
}
