import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LearningResourceCatalogSchema, RESOURCE_ID_PATTERN } from './schemas.js'
import type {
    LearningResourceCatalog,
    LearningResourceFormat,
    LearningResourceOpenLevel,
    LearningResourceStage,
    PublicLearningResource,
    PublicLearningResourceAlignment,
    StandardLearningResources
} from './types.js'

export interface LearningResourceSearch {
    subject?: string
    stage?: LearningResourceStage
    format?: LearningResourceFormat
    openLevel?: LearningResourceOpenLevel
    query?: string
}

// Older links say 'information-technology' where standards say 'it'; accept both in filters.
const SUBJECT_ALIASES: Record<string, string> = { 'information-technology': 'it' }
const canonicalSubject = (slug: string) => SUBJECT_ALIASES[slug] || slug

const EMPTY_CATALOG: LearningResourceCatalog = {
    schema_version: 2,
    updated_at: '1970-01-01',
    counts: { resources: 0, alignments: 0, standards: 0, by_subject: {}, by_stage: {} },
    resources: []
}

export function isLearningResourceId(value: string): boolean {
    return value.length <= 80 && RESOURCE_ID_PATTERN.test(value)
}

export class FileLearningResourceRepository {
    private catalog?: LearningResourceCatalog
    private readonly byId = new Map<string, PublicLearningResource>()
    private readonly dataRoot: string

    constructor(dataRoot: string) {
        this.dataRoot = dataRoot
    }

    async loadCatalog(): Promise<LearningResourceCatalog> {
        if (this.catalog) return this.catalog
        let payload: unknown = null
        try {
            payload = JSON.parse(await readFile(join(this.dataRoot, 'learning-resources/catalog/index.json'), 'utf8'))
        } catch {
            payload = null
        }
        this.catalog = payload ? LearningResourceCatalogSchema.parse(payload) : EMPTY_CATALOG
        for (const resource of this.catalog.resources) this.byId.set(resource.id, resource)
        return this.catalog
    }

    async search(filters: LearningResourceSearch = {}): Promise<PublicLearningResource[]> {
        const catalog = await this.loadCatalog()
        const subject = filters.subject ? canonicalSubject(filters.subject) : ''
        const keyword = String(filters.query || '').trim().toLocaleLowerCase('zh-CN')
        return catalog.resources.filter(resource => {
            if (subject && !resource.subjects.includes(subject as never)) return false
            if (filters.stage && !resource.stages.includes(filters.stage)) return false
            if (filters.format && !resource.formats.includes(filters.format)) return false
            if (filters.openLevel && resource.open_level !== filters.openLevel) return false
            if (!keyword) return true
            return [
                resource.title_zh,
                resource.title_original,
                resource.provider,
                resource.summary_zh,
                ...resource.standards.flatMap(item => [item.code, item.standard_title])
            ].join(' ').toLocaleLowerCase('zh-CN').includes(keyword)
        })
    }

    async get(resourceId: string): Promise<PublicLearningResource | null> {
        if (!isLearningResourceId(resourceId)) return null
        await this.loadCatalog()
        return this.byId.get(resourceId) || null
    }

    async getStandardsForResource(resourceId: string): Promise<PublicLearningResourceAlignment[]> {
        return (await this.get(resourceId))?.standards || []
    }

    async getForStandard(standardCode: string): Promise<StandardLearningResources> {
        const catalog = await this.loadCatalog()
        const resources = catalog.resources.flatMap(resource => {
            const alignment = resource.standards.find(item => item.code === standardCode)
            return alignment ? [{ ...resource, rationale_zh: alignment.rationale_zh }] : []
        })
        return { schema_version: 2, standard_code: standardCode, resources }
    }
}
