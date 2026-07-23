import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
    LearningResourceCatalogSchema,
    PublicLearningResourceAlignmentSchema,
    PublicLearningResourceProjectionSchema
} from './schemas.js'
import type {
    LearningResourceCatalog,
    PublicLearningResourceAlignment,
    PublicLearningResourceProjection
} from './types.js'

interface StandardResourceIndex {
    schema_version: string
    generation_id: string
    standard_code: string
    alignments: PublicLearningResourceAlignment[]
    resources: PublicLearningResourceProjection[]
}

export interface LearningResourceSearch {
    subject?: string
    stage?: 'primary' | 'junior'
    grade?: number
    role?: string
    type?: string
    source?: string
    query?: string
}

export class FileLearningResourceRepository {
    private catalog?: LearningResourceCatalog
    private readonly resourceCache = new Map<string, PublicLearningResourceProjection>()
    private readonly standardCache = new Map<string, StandardResourceIndex>()

    constructor(private readonly dataRoot: string) {}

    private async readJson<T>(relativePath: string): Promise<T | null> {
        try {
            return JSON.parse(await readFile(join(this.dataRoot, relativePath), 'utf8')) as T
        } catch {
            return null
        }
    }

    async loadCatalog(): Promise<LearningResourceCatalog> {
        if (this.catalog) return this.catalog
        const payload = await this.readJson<unknown>('learning-resources/catalog/index.json')
        if (!payload) return { schema_version: '1.0.0', generation_id: 'empty', resources: [] }
        this.catalog = LearningResourceCatalogSchema.parse(payload)
        for (const resource of this.catalog.resources) {
            this.resourceCache.set(`${resource.resource_id}:${resource.fragment_id}`, resource)
            if (!this.resourceCache.has(resource.resource_id)) this.resourceCache.set(resource.resource_id, resource)
        }
        return this.catalog
    }

    async search(query: LearningResourceSearch = {}): Promise<PublicLearningResourceProjection[]> {
        const catalog = await this.loadCatalog()
        const keyword = String(query.query || '').trim().toLocaleLowerCase('zh-CN')
        return catalog.resources.filter(resource => {
            if (query.subject && !resource.mapped_subject_slugs.includes(query.subject)) return false
            if (query.stage && resource.mapped_china_stage !== query.stage) return false
            if (query.grade && !resource.mapped_china_grade_scope.includes(query.grade)) return false
            if (query.role && !resource.pedagogical_roles.includes(query.role as never)) return false
            if (query.type && resource.resource_type !== query.type) return false
            if (query.source && resource.source_id !== query.source) return false
            if (!keyword) return true
            const text = [
                resource.title.text,
                resource.description.text,
                ...resource.blocks.map(block => block.text.text)
            ].join(' ').toLocaleLowerCase('zh-CN')
            return text.includes(keyword)
        })
    }

    async get(resourceId: string, fragmentId = ''): Promise<PublicLearningResourceProjection | null> {
        if (!this.resourceCache.size) await this.loadCatalog()
        const cacheKey = fragmentId ? `${resourceId}:${fragmentId}` : resourceId
        const cached = this.resourceCache.get(cacheKey)
        if (cached) return cached
        const suffix = fragmentId ? `${resourceId}.${fragmentId}` : resourceId
        const payload = await this.readJson<unknown>(`learning-resources/by-resource/${suffix}.json`)
        if (!payload) return null
        const resource = PublicLearningResourceProjectionSchema.parse(payload)
        this.resourceCache.set(cacheKey, resource)
        return resource
    }

    async getForStandard(
        standardCode: string,
        filters: { componentId?: string; role?: string } = {}
    ): Promise<StandardResourceIndex> {
        let payload = this.standardCache.get(standardCode)
        if (!payload) {
            const raw = await this.readJson<StandardResourceIndex>(`learning-resources/by-standard/${standardCode}.json`)
            payload = raw || {
                schema_version: '1.0.0',
                generation_id: (await this.loadCatalog()).generation_id,
                standard_code: standardCode,
                alignments: [],
                resources: []
            }
            payload.alignments = payload.alignments.map(value => PublicLearningResourceAlignmentSchema.parse(value))
            payload.resources = payload.resources.map(value => PublicLearningResourceProjectionSchema.parse(value))
            this.standardCache.set(standardCode, payload)
        }
        const alignments = payload.alignments.filter(alignment => {
            if (filters.componentId && !alignment.learning_component_ids.includes(filters.componentId)) return false
            if (filters.role && alignment.pedagogical_role !== filters.role) return false
            return true
        })
        const resourceFragments = new Set(
            alignments.map(alignment => `${alignment.resource_id}:${alignment.fragment_id}`)
        )
        return {
            ...payload,
            alignments,
            resources: payload.resources.filter(
                resource => resourceFragments.has(`${resource.resource_id}:${resource.fragment_id}`)
            )
        }
    }

    async getStandardsForResource(resourceId: string, fragmentId = ''): Promise<PublicLearningResourceAlignment[]> {
        const payload = await this.readJson<{ alignments?: unknown[] }>(
            `learning-resources/by-resource/${resourceId}.alignments.json`
        )
        return (payload?.alignments || [])
            .map(value => PublicLearningResourceAlignmentSchema.parse(value))
            .filter(alignment => !fragmentId || alignment.fragment_id === fragmentId)
    }
}
