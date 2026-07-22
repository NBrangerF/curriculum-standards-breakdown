import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
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
    r2_bucket?: string | null
    r2_key?: string | null
}

interface AssetLocation {
    record: PrivateAssetRecord
    path: string
}

interface SupportResourceRecord {
    resource_id?: unknown
    edition_id?: unknown
    asset?: unknown
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

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readSupportResources(path: string): SupportResourceRecord[] {
    if (!existsSync(path)) return []
    const payload = readJson(path)
    return Array.isArray(payload.resources) ? payload.resources as SupportResourceRecord[] : []
}

function supportAssetRecord(resource: SupportResourceRecord, publicBucket: string): PrivateAssetRecord | null {
    if (typeof resource.resource_id !== 'string' || !/^res_[a-z0-9]+$/i.test(resource.resource_id)) return null
    if (!isObject(resource.asset) || resource.asset.availability !== 'available') return null

    const assetId = typeof resource.asset.asset_id === 'string' ? resource.asset.asset_id : ''
    const sha256 = typeof resource.asset.sha256 === 'string' ? resource.asset.sha256 : ''
    const objectPath = typeof resource.asset.object_path === 'string' ? resource.asset.object_path : ''
    const bytes = Number(resource.asset.bytes)
    const pages = Number(resource.asset.pages)
    const r2Bucket = typeof resource.asset.r2_bucket === 'string' && resource.asset.r2_bucket ? resource.asset.r2_bucket : null
    const r2Key = typeof resource.asset.r2_key === 'string' && resource.asset.r2_key ? resource.asset.r2_key : objectPath
    const expectedObjectPath = sha256
        ? `objects/sha256/${sha256.slice(0, 2)}/${sha256}.pdf`
        : ''
    if (
        !/^asset_[a-z0-9]+$/i.test(assetId)
        || !/^[a-f0-9]{64}$/.test(sha256)
        || objectPath !== expectedObjectPath
        || !Number.isInteger(bytes)
        || bytes <= 0
        || !Number.isInteger(pages)
        || pages <= 0
        || r2Key !== objectPath
        || Boolean(r2Bucket && r2Bucket !== publicBucket)
    ) return null

    return {
        asset_id: assetId,
        edition_id: typeof resource.edition_id === 'string' && resource.edition_id ? resource.edition_id : resource.resource_id,
        object_path: objectPath,
        bytes,
        transfer_verified: true,
        pdf_structural_verified: true,
        r2_bucket: r2Bucket,
        r2_key: r2Key
    }
}

function isSafeRemoteObjectKey(value: string): boolean {
    if (!value || value.startsWith('/') || value.includes('\\') || value.includes('\0')) return false
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false
    return value.split('/').every(segment => segment && segment !== '.' && segment !== '..')
}

function encodeObjectKey(value: string): string {
    return value.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

function sameAsset(left: PrivateAssetRecord, right: PrivateAssetRecord): boolean {
    return left.asset_id === right.asset_id
        && left.object_path === right.object_path
        && left.bytes === right.bytes
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
    private readonly byResourceId = new Map<string, PrivateAssetRecord>()
    private readonly knownResourceIds = new Set<string>()

    constructor(
        private readonly privateDataRoot = resolveTextbookPrivateDataRoot(),
        private readonly libraryRoot = resolveTextbookLibraryRoot(),
        private readonly publicBaseUrl = process.env.TEXTBOOK_ASSET_BASE_URL || null,
        private readonly fetchRemote: typeof fetch = fetch,
        private readonly publicBucket = process.env.TEXTBOOK_ASSET_BUCKET || 'kebiao-textbooks'
    ) {
        if (!privateDataRoot) return
        const currentPath = join(privateDataRoot, 'library-state/CURRENT.json')
        if (existsSync(currentPath)) {
            const current = readJson(currentPath)
            const generationId = String(current.generation_id || '')
            const registryPath = generationId
                ? join(privateDataRoot, `library-state/generations/${generationId}/asset_registry.lock.jsonl`)
                : ''
            if (registryPath && existsSync(registryPath)) {
                for (const record of readJsonLines(registryPath)) {
                    this.byAssetId.set(record.asset_id, record)
                    this.byEditionId.set(record.edition_id, record)
                }
            }
        }

        // The generated catalog includes legacy companions, while the
        // versioned registry is the source of truth for imported teacher
        // guides and explanations. Load the catalog first so a registry row
        // can explicitly replace stale availability for the same resource.
        this.loadSupportResources(join(privateDataRoot, 'catalog/support_resource_catalog.json'), false, true)
        this.loadSupportResources(join(privateDataRoot, 'catalog/support_resource_registry.json'), true, false)
    }

    private loadSupportResources(path: string, replace: boolean, allowNewResources: boolean) {
        for (const resource of readSupportResources(path)) {
            const resourceId = typeof resource.resource_id === 'string' ? resource.resource_id : ''
            if (!resourceId || !/^res_[a-z0-9]+$/i.test(resourceId)) continue
            if (!allowNewResources && !this.knownResourceIds.has(resourceId)) continue
            if (allowNewResources) this.knownResourceIds.add(resourceId)
            if (replace) this.byResourceId.delete(resourceId)
            const candidate = supportAssetRecord(resource, this.publicBucket)
            if (!candidate) continue
            const existing = this.byAssetId.get(candidate.asset_id)
            if (existing && !sameAsset(existing, candidate)) continue
            const record = existing || candidate
            if (!existing) this.byAssetId.set(record.asset_id, record)
            this.byResourceId.set(resourceId, record)
        }
    }

    private localLocation(record: PrivateAssetRecord): AssetLocation | null {
        if (!this.libraryRoot || !record.object_path || !record.transfer_verified || !record.pdf_structural_verified) return null
        try {
            const libraryPath = realpathSync(this.libraryRoot)
            const path = realpathSync(resolve(libraryPath, record.object_path))
            const rel = relative(libraryPath, path)
            if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) || !statSync(path).isFile()) return null
            return { record, path }
        } catch {
            return null
        }
    }

    private remoteUrl(record: PrivateAssetRecord): URL | null {
        if (!this.publicBaseUrl || !record.transfer_verified || !record.pdf_structural_verified) return null
        if (!/^objects\/sha256\/[0-9a-f]{2}\/[0-9a-f]{64}\.pdf$/.test(record.object_path)) return null
        if (record.r2_bucket && record.r2_bucket !== this.publicBucket) return null
        const objectKey = record.r2_key || record.object_path
        if (objectKey !== record.object_path || !isSafeRemoteObjectKey(objectKey)) return null
        const baseUrl = new URL(this.publicBaseUrl.endsWith('/') ? this.publicBaseUrl : `${this.publicBaseUrl}/`)
        return new URL(encodeObjectKey(objectKey), baseUrl)
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

    hasResource(resourceId: string): boolean {
        return this.knownResourceIds.has(resourceId)
    }

    createResourceViewerSession(resourceId: string) {
        const record = this.byResourceId.get(resourceId)
        if (!record) return null
        if (this.remoteUrl(record)) {
            return {
                resource_id: resourceId,
                asset_id: record.asset_id,
                url: `/api/v1/textbook-assets/${record.asset_id}`,
                expires_at: null,
                delivery: 'object_storage_proxy' as const,
                supports_range: true as const
            }
        }
        if (!this.localLocation(record)) return null
        return {
            resource_id: resourceId,
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
