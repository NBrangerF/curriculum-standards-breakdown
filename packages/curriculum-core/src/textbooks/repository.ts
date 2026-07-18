import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
    TextbookCatalogDatasetSchema,
    TextbookDetailRecordSchema
} from './schemas.js'
import type {
    TextbookCatalogDataset,
    TextbookCatalogRecord,
    TextbookDetailRecord,
    TextbookStage,
    TextbookVolume
} from './types.js'

export interface TextbookSearchFilters {
    stage?: TextbookStage
    subject?: string
    grade?: number
    volume?: TextbookVolume
    query?: string
    resource_type?: string
}

export class FileTextbookRepository {
    private catalogPromise: Promise<TextbookCatalogDataset> | null = null
    private detailPromises = new Map<string, Promise<TextbookDetailRecord>>()
    private unitsPromise: Promise<Array<Record<string, unknown>>> | null = null
    private reversePromise: Promise<{
        items: Record<string, Array<Record<string, unknown>>>
        scopes: Record<string, Array<Record<string, unknown>>>
    }> | null = null

    constructor(private readonly dataRoot: string) {}

    async loadCatalog(): Promise<TextbookCatalogDataset> {
        if (!this.catalogPromise) {
            this.catalogPromise = readFile(resolve(this.dataRoot, 'textbooks/index.json'), 'utf8')
                .then(source => TextbookCatalogDatasetSchema.parse(JSON.parse(source)))
                .catch(error => {
                    this.catalogPromise = null
                    throw error
                })
        }
        return this.catalogPromise
    }

    async search(filters: TextbookSearchFilters = {}): Promise<TextbookCatalogRecord[]> {
        const catalog = await this.loadCatalog()
        const query = filters.query?.trim().toLocaleLowerCase('zh-CN') || ''
        return catalog.items.filter(item => {
            if (filters.stage && item.stage !== filters.stage) return false
            if (filters.subject && item.subject_slug !== filters.subject && item.subject !== filters.subject) return false
            if (filters.grade && item.grade !== filters.grade) return false
            if (filters.volume && item.volume !== filters.volume) return false
            if (filters.resource_type && item.resource_type !== filters.resource_type) return false
            if (!query) return true
            return [item.title, item.subject, item.edition_name, item.grade_label, item.volume]
                .some(value => value.toLocaleLowerCase('zh-CN').includes(query))
        })
    }

    async get(editionId: string): Promise<TextbookDetailRecord | null> {
        if (!/^ed_[a-z0-9]+$/i.test(editionId)) return null
        let pending = this.detailPromises.get(editionId)
        if (!pending) {
            pending = readFile(resolve(this.dataRoot, `textbooks/by-edition/${editionId}.json`), 'utf8')
                // The runtime schema is the source of truth. Keep the explicit output
                // type because Vercel compiles each API entrypoint in isolation and can
                // otherwise widen nullable object fields to optional properties.
                .then(source => TextbookDetailRecordSchema.parse(JSON.parse(source)) as TextbookDetailRecord)
                .catch(error => {
                    this.detailPromises.delete(editionId)
                    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null as never
                    throw error
                })
            this.detailPromises.set(editionId, pending)
        }
        return pending
    }

    async getUnit(unitId: string): Promise<Record<string, unknown> | null> {
        if (!this.unitsPromise) {
            this.unitsPromise = readFile(resolve(this.dataRoot, 'textbooks/units.json'), 'utf8')
                .then(source => {
                    const payload = JSON.parse(source) as { items?: Array<Record<string, unknown>> }
                    return Array.isArray(payload.items) ? payload.items : []
                })
        }
        return (await this.unitsPromise).find(item => item.entry_id === unitId) || null
    }

    async getTextbooksForStandard(code: string): Promise<Array<Record<string, unknown>>> {
        if (!this.reversePromise) {
            this.reversePromise = readFile(resolve(this.dataRoot, 'textbooks/standards-to-textbooks.json'), 'utf8')
                .then(source => {
                    const payload = JSON.parse(source) as {
                        items?: Record<string, Array<Record<string, unknown>>>
                        scopes?: Record<string, Array<Record<string, unknown>>>
                    }
                    return { items: payload.items || {}, scopes: payload.scopes || {} }
                })
        }
        const reverse = await this.reversePromise
        const specific = reverse.items[code] || []
        const specificEditions = new Set(specific.map(item => item.edition_id))
        const scopes = (reverse.scopes[code] || []).filter(item => !specificEditions.has(item.edition_id))
        return [...specific, ...scopes]
    }
}
