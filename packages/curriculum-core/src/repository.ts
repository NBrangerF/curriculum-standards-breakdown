import { readFile } from 'fs/promises'
import { join } from 'path'
import { normalizeFieldsets, projectStandard } from './fieldsets.js'
import { buildStandardEvidenceSummary, buildStandardNeighbors, compareStandardRecords } from './graph.js'
import { normalizeSkill, normalizeSubjectMeta } from './normalize.js'
import {
    analyzeCoverage,
    generateWeeklySchedule,
    matchPlanToStandards,
    normalizeParsedPlan,
    parsePlanInput,
    validateParsedPlan
} from './planning.js'
import { filterStandards, paginate, sortStandards } from './search.js'
import type {
    CoverageAnalysis,
    DataVersion,
    Fieldset,
    JsonObject,
    Manifest,
    ParsedPlan,
    ParsedPlanInput,
    PlanMatchingResult,
    StandardRecord,
    StandardComparison,
    StandardEvidenceSummary,
    StandardNeighbors,
    StandardSearchRequest,
    StandardSearchResult,
    WeeklySchedule
} from './types.js'

interface SubjectPayload {
    subject?: string
    subject_slug?: string
    standards?: StandardRecord[]
}

export class FileCurriculumRepository {
    private manifest?: Manifest
    private dataVersion?: DataVersion
    private subjectsMeta?: JsonObject[]
    private skillsMeta?: JsonObject
    private subjectStandards = new Map<string, StandardRecord[]>()
    private codeToSubject?: Record<string, string>
    private skillToSubjects?: Record<string, string[]>
    private subjectStats?: JsonObject

    constructor(private readonly dataRoot: string) {}

    private async readJson<T>(relativePath: string): Promise<T> {
        const text = await readFile(join(this.dataRoot, relativePath), 'utf8')
        return JSON.parse(text) as T
    }

    async loadManifest(): Promise<Manifest> {
        if (!this.manifest) this.manifest = await this.readJson<Manifest>('manifest.json')
        return this.manifest
    }

    async loadDataVersion(): Promise<DataVersion> {
        if (this.dataVersion) return this.dataVersion
        try {
            this.dataVersion = await this.readJson<DataVersion>('data_version.json')
            return this.dataVersion
        } catch {
            const manifest = await this.loadManifest()
            const standardCount = manifest.subjects.reduce((sum, subject) => sum + subject.record_count, 0)
            this.dataVersion = {
                data_version: `manifest:${manifest.generated_at || 'unknown'}`,
                schema_version: '0.0.0',
                generated_at: manifest.generated_at,
                data_source_generated_at: manifest.generated_at,
                data_scope: manifest.data_scope,
                validated: false,
                subjects_covered: manifest.subjects.length,
                standard_count: standardCount,
                grade_band_policy: manifest.target_policy
            }
            return this.dataVersion
        }
    }

    async loadSubjectsMeta(): Promise<JsonObject[]> {
        if (!this.subjectsMeta) {
            const payload = await this.readJson<{ subjects_meta?: JsonObject[] }>('subjects_meta.json')
            this.subjectsMeta = (payload.subjects_meta || []).map(normalizeSubjectMeta)
        }
        return this.subjectsMeta
    }

    async loadSkillsMeta(): Promise<JsonObject> {
        if (!this.skillsMeta) {
            const payload = await this.readJson<{ meta?: JsonObject; competencies?: JsonObject[] }>('skills_meta.json')
            this.skillsMeta = {
                meta: payload.meta || {},
                competencies: (payload.competencies || []).map(normalizeSkill)
            }
        }
        return this.skillsMeta
    }

    async loadSubjectStandards(subjectSlug: string): Promise<StandardRecord[]> {
        if (this.subjectStandards.has(subjectSlug)) return this.subjectStandards.get(subjectSlug) || []
        const payload = await this.readJson<SubjectPayload>(`by_subject/${subjectSlug}.json`)
        const standards = payload.standards || []
        this.subjectStandards.set(subjectSlug, standards)
        return standards
    }

    async loadAllStandards(subjects?: string[]): Promise<StandardRecord[]> {
        const manifest = await this.loadManifest()
        const targetSubjects = subjects?.length ? subjects : manifest.subjects.map(subject => subject.subject_slug)
        const groups = await Promise.all(targetSubjects.map(subject => this.loadSubjectStandards(subject)))
        return groups.flat()
    }

    async loadCodeToSubject(): Promise<Record<string, string>> {
        if (!this.codeToSubject) this.codeToSubject = await this.readJson<Record<string, string>>('indexes/code_to_subject.json')
        return this.codeToSubject
    }

    async loadSkillToSubjects(): Promise<Record<string, string[]>> {
        if (!this.skillToSubjects) this.skillToSubjects = await this.readJson<Record<string, string[]>>('indexes/skill_to_subjects.json')
        return this.skillToSubjects
    }

    async loadSubjectStats(): Promise<JsonObject> {
        if (!this.subjectStats) this.subjectStats = await this.readJson<JsonObject>('indexes/subject_stats.json')
        return this.subjectStats
    }

    async findStandardByCode(code: string): Promise<StandardRecord | null> {
        const index = await this.loadCodeToSubject()
        const subject = index[code]
        if (subject) {
            const standards = await this.loadSubjectStandards(subject)
            return standards.find(record => record.code === code) || null
        }
        const all = await this.loadAllStandards()
        return all.find(record => record.code === code) || null
    }

    async batchStandards(codes: string[], include?: Fieldset[]): Promise<{ items: JsonObject[]; missing: string[] }> {
        const fieldsets = normalizeFieldsets(include)
        const items: JsonObject[] = []
        const missing: string[] = []
        for (const code of codes) {
            const standard = await this.findStandardByCode(code)
            if (standard) items.push(projectStandard(standard, fieldsets))
            else missing.push(code)
        }
        return { items, missing }
    }

    private async candidateSubjects(request: StandardSearchRequest): Promise<string[] | undefined> {
        if (request.subjects?.length) return request.subjects
        if (!request.skills?.length) return undefined
        const index = await this.loadSkillToSubjects()
        const subjects = new Set<string>()
        for (const skill of request.skills) {
            const main = skill.split('.')[0].toUpperCase()
            for (const subject of index[main] || []) subjects.add(subject)
        }
        return subjects.size ? [...subjects] : undefined
    }

    async searchStandards(request: StandardSearchRequest = {}): Promise<StandardSearchResult<JsonObject>> {
        const fieldsets = normalizeFieldsets(request.include)
        const subjects = await this.candidateSubjects(request)
        const all = await this.loadAllStandards(subjects)
        const filtered = sortStandards(filterStandards(all, request))
        const page = paginate(filtered, request.limit, request.cursor)
        return {
            ...page,
            items: page.items.map(record => projectStandard(record, fieldsets))
        }
    }

    async getProgressionForCode(code: string, include?: Fieldset[]): Promise<JsonObject | null> {
        const standard = await this.findStandardByCode(code)
        if (!standard) return null
        const groupId = String(standard.progression_group_id || '')
        if (!groupId) {
            return {
                progression_group_id: null,
                anchor_code: code,
                standards: [projectStandard(standard, include)]
            }
        }
        const all = await this.loadAllStandards([String(standard.subject_slug || '')])
        const group = sortStandards(all.filter(record => record.progression_group_id === groupId))
        return {
            progression_group_id: groupId,
            anchor_code: code,
            standards: group.map(record => projectStandard(record, include || ['public', 'evidence']))
        }
    }

    async getSubjectDomains(subjectSlug: string): Promise<JsonObject | null> {
        const manifest = await this.loadManifest()
        const subject = manifest.subjects.find(item => item.subject_slug === subjectSlug)
        if (!subject) return null
        const standards = await this.loadSubjectStandards(subjectSlug)
        const domains = Object.entries(subject.domains || {}).map(([domain, count]) => {
            const subdomains = new Map<string, number>()
            for (const record of standards) {
                if (record.domain !== domain) continue
                const key = String(record.subdomain || record.display_subcategory || '未分组')
                subdomains.set(key, (subdomains.get(key) || 0) + 1)
            }
            return {
                domain,
                count,
                subdomains: [...subdomains.entries()]
                    .map(([subdomain, subdomainCount]) => ({ subdomain, count: subdomainCount }))
                    .sort((a, b) => b.count - a.count || a.subdomain.localeCompare(b.subdomain))
            }
        })
        return {
            subject_slug: subjectSlug,
            subject: subject.subject,
            domains
        }
    }

    async getStandardNeighbors(code: string, include?: Fieldset[]): Promise<StandardNeighbors | null> {
        const standard = await this.findStandardByCode(code)
        if (!standard) return null
        const subjectSlug = String(standard.subject_slug || '')
        const subjectRecords = await this.loadSubjectStandards(subjectSlug)
        return buildStandardNeighbors(standard, subjectRecords, include)
    }

    async getEvidenceSummaryForCode(code: string): Promise<StandardEvidenceSummary | null> {
        const standard = await this.findStandardByCode(code)
        if (!standard) return null
        return buildStandardEvidenceSummary(standard)
    }

    async compareStandards(codes: string[], include?: Fieldset[]): Promise<StandardComparison & { missing: string[] }> {
        const records: StandardRecord[] = []
        const missing: string[] = []
        for (const code of codes) {
            const standard = await this.findStandardByCode(code)
            if (standard) records.push(standard)
            else missing.push(code)
        }
        return {
            ...compareStandardRecords(records, include || ['public']),
            missing
        }
    }

    parsePlan(input: { text?: string; plan?: ParsedPlanInput }) {
        return parsePlanInput(input)
    }

    async validatePlan(plan: ParsedPlanInput) {
        const manifest = await this.loadManifest()
        return validateParsedPlan(normalizeParsedPlan(plan), manifest)
    }

    async matchPlan(
        plan: ParsedPlanInput,
        options: { top_k_per_unit?: number; min_score?: number; review_threshold?: number; include?: Fieldset[] } = {}
    ): Promise<PlanMatchingResult> {
        const normalized = normalizeParsedPlan(plan)
        const subjects = normalized.subject_slug ? [normalized.subject_slug] : undefined
        const all = await this.loadAllStandards(subjects)
        return matchPlanToStandards(normalized, all, options)
    }

    async analyzePlanCoverage(
        plan: ParsedPlanInput,
        matching?: PlanMatchingResult,
        options: { top_k_per_unit?: number; min_score?: number; review_threshold?: number; include?: Fieldset[] } = {}
    ): Promise<CoverageAnalysis> {
        const normalized = normalizeParsedPlan(plan)
        const resolvedMatching = matching || await this.matchPlan(normalized, options)
        return analyzeCoverage(normalized, resolvedMatching)
    }

    async generateWeeklySchedule(
        plan: ParsedPlanInput,
        matching?: PlanMatchingResult,
        options: {
            teaching_weeks?: number
            lessons_per_week?: number
            review_weeks?: number[]
            exam_weeks?: number[]
            top_k_per_unit?: number
            min_score?: number
            review_threshold?: number
            include?: Fieldset[]
        } = {}
    ): Promise<WeeklySchedule[]> {
        const normalized = normalizeParsedPlan(plan)
        const resolvedMatching = matching || await this.matchPlan(normalized, options)
        return generateWeeklySchedule(normalized, resolvedMatching, options)
    }
}
