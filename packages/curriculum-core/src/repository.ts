import { readFile } from 'fs/promises'
import { join } from 'path'
import { normalizeFieldsets, projectStandard } from './fieldsets.js'
import { buildStandardEvidenceSummary, buildStandardNeighbors, compareStandardRecords } from './graph.js'
import { normalizeSkill, normalizeSubjectMeta } from './normalize.js'
import { createStandardResolver, parseCodeReferences, type StandardResolution } from './references.js'
import {
    analyzeCoverage,
    generateWeeklySchedule,
    matchPlanToStandards,
    normalizeParsedPlan,
    parsePlanInput,
    validateParsedPlan
} from './planning.js'
import { filterStandards, paginate, sortStandards } from './search.js'
import { smartSearchStandards } from './smart-search.js'
import { isKnownDomain, isKnownGradeBand, isKnownSkillCode, isKnownSubjectSlug } from './taxonomy.js'
import type {
    CoverageAnalysis,
    CoverageReviewDecision,
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
    SmartSearchRequest,
    SmartSearchResponse,
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
    private allStandards?: StandardRecord[]
    private standardResolver?: ReturnType<typeof createStandardResolver>

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
        if (!isKnownSubjectSlug(subjectSlug)) return []
        if (this.subjectStandards.has(subjectSlug)) return this.subjectStandards.get(subjectSlug) || []
        const payload = await this.readJson<SubjectPayload>(`by_subject/${subjectSlug}.json`)
        const standards = payload.standards || []
        this.subjectStandards.set(subjectSlug, standards)
        return standards
    }

    async loadAllStandards(subjects?: string[]): Promise<StandardRecord[]> {
        const manifest = await this.loadManifest()
        const targetSubjects = subjects?.length ? subjects : manifest.subjects.map(subject => subject.subject_slug)
        if (!subjects?.length && this.allStandards) return this.allStandards
        const groups = await Promise.all(targetSubjects.map(subject => this.loadSubjectStandards(subject)))
        const records = groups.flat()
        if (!subjects?.length) this.allStandards = records
        return records
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

    async resolveStandard(code: string): Promise<StandardResolution> {
        const all = await this.loadAllStandards()
        if (!this.standardResolver) this.standardResolver = createStandardResolver(all)
        return this.standardResolver(code)
    }

    async findStandardByCode(code: string): Promise<StandardRecord | null> {
        const resolved = await this.resolveStandard(code)
        return resolved.status === 'found' ? resolved.record || null : null
    }

    async batchStandards(codes: string[], include?: Fieldset[]): Promise<{ items: JsonObject[]; missing: string[]; resolved: Record<string, string>; ambiguous: Record<string, string[]>; duplicates: string[] }> {
        const fieldsets = normalizeFieldsets(include)
        const items: JsonObject[] = []
        const missing: string[] = []
        const resolved: Record<string, string> = {}
        const ambiguous: Record<string, string[]> = {}
        const duplicates: string[] = []
        const seen = new Set<string>()
        for (const rawCode of codes) {
            const code = rawCode.trim()
            if (seen.has(code)) {
                duplicates.push(rawCode)
                continue
            }
            seen.add(code)
            const result = await this.resolveStandard(code)
            if (result.status === 'found' && result.record) {
                items.push(projectStandard(result.record, fieldsets))
                if (result.resolved_from) resolved[rawCode] = result.record.code
            } else if (result.status === 'ambiguous') {
                ambiguous[rawCode] = (result.candidates || []).map(candidate => String(candidate.code || ''))
            } else {
                missing.push(rawCode)
            }
        }
        return { items, missing, resolved, ambiguous, duplicates }
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

    async validateSearchFilters(request: StandardSearchRequest & { excluded_subjects?: string[] }): Promise<string[]> {
        const errors: string[] = []
        for (const subject of request.subjects || []) {
            if (!isKnownSubjectSlug(subject)) errors.push(`未知学科：${subject}`)
        }
        for (const subject of request.excluded_subjects || []) {
            if (!isKnownSubjectSlug(subject)) errors.push(`未知排除学科：${subject}`)
        }
        for (const gradeBand of request.grade_bands || []) {
            if (!isKnownGradeBand(gradeBand)) errors.push(`未知学段：${gradeBand}`)
        }
        for (const skill of request.skills || []) {
            if (!isKnownSkillCode(skill)) errors.push(`未知可迁移技能：${skill}`)
        }
        for (const domain of request.domains || []) {
            if (!isKnownDomain(domain, request.subjects?.length ? request.subjects : undefined)) {
                errors.push(`未知或不属于当前学科范围的领域：${domain}`)
            }
        }
        return errors
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

    async smartSearchStandards(request: SmartSearchRequest): Promise<SmartSearchResponse> {
        const subjects = request.subjects?.length ? request.subjects : undefined
        const all = await this.loadAllStandards(subjects)
        return smartSearchStandards(all, request)
    }

    async getProgressionForCode(code: string, include?: Fieldset[]): Promise<JsonObject | null> {
        const resolved = await this.resolveStandard(code)
        if (resolved.status !== 'found' || !resolved.record) return null
        const standard = resolved.record
        const all = await this.loadAllStandards([String(standard.subject_slug || '')])
        const resolve = createStandardResolver(all)
        const recordByCode = new Map(all.map(record => [record.code, record]))
        const edgeMap = new Map<string, JsonObject>()
        const addEdge = (from: string, to: string, edge: JsonObject) => {
            if (!from || !to || from === to) return
            edgeMap.set(`${from}->${to}`, { from, to, ...edge })
        }

        for (const record of all) {
            for (const reference of parseCodeReferences(record.next_code)) {
                const target = resolve(reference)
                if (target.status === 'found' && target.record) {
                    const relation = String(record.grade_band).startsWith('H4') && String(target.record.grade_band).startsWith('H4')
                        ? 'grade_progression'
                        : 'stage_progression'
                    addEdge(record.code, target.record.code, { relation, confidence: 'declared' })
                }
            }
            for (const reference of parseCodeReferences(record.previous_code)) {
                const source = resolve(reference)
                if (source.status === 'found' && source.record) {
                    const relation = String(source.record.grade_band).startsWith('H4') && String(record.grade_band).startsWith('H4')
                        ? 'grade_progression'
                        : 'stage_progression'
                    addEdge(source.record.code, record.code, { relation, confidence: 'declared' })
                }
            }
            const bridgeCandidates = Array.isArray(record.progression_bridge_candidates)
                ? record.progression_bridge_candidates as JsonObject[]
                : record.progression_bridge_h3_code
                    ? [{
                        h3_code: record.progression_bridge_h3_code,
                        confidence: record.progression_bridge_confidence,
                        score: record.progression_bridge_score,
                        margin: record.progression_bridge_margin
                    }]
                    : []
            if (record.grade_band === 'H4G7') {
                for (const bridge of bridgeCandidates) {
                    const source = resolve(bridge.h3_code)
                    if (source.status !== 'found' || !source.record) continue
                    addEdge(source.record.code, record.code, {
                        relation: 'inferred_stage_bridge',
                        confidence: bridge.confidence || 'low',
                        score: bridge.score || 0,
                        margin: bridge.margin || 0,
                        basis: record.progression_bridge_method || 'same_subject_domain_text_skill_overlap_v1',
                        reason: bridge.reason || 'h4_group_best'
                    })
                }
            }
        }

        const outgoing = new Map<string, string[]>()
        const incoming = new Map<string, string[]>()
        for (const edge of edgeMap.values()) {
            const from = String(edge.from)
            const to = String(edge.to)
            outgoing.set(from, [...(outgoing.get(from) || []), to])
            incoming.set(to, [...(incoming.get(to) || []), from])
        }
        const visited = new Set<string>([standard.code])
        const queue = [standard.code]
        while (queue.length) {
            const current = queue.shift()!
            for (const neighbor of [...(outgoing.get(current) || []), ...(incoming.get(current) || [])]) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor)
                    queue.push(neighbor)
                }
            }
        }

        const edges = [...edgeMap.values()].filter(edge => visited.has(String(edge.from)) && visited.has(String(edge.to)))
        const nodes = sortStandards(
            [...visited].map(item => recordByCode.get(item)).filter((item): item is StandardRecord => Boolean(item))
        )
        const gradeOrder = ['H1', 'H2', 'H3', 'H4G7', 'H4G8', 'H4G9']
        const coverage = Object.fromEntries(gradeOrder.map(band => [band, nodes.filter(record => record.grade_band === band).length]))
        const bridgeEdges = edges.filter(edge => edge.relation === 'inferred_stage_bridge')
        const confidence = bridgeEdges.reduce<Record<string, number>>((counts, edge) => {
            const key = String(edge.confidence || 'low')
            counts[key] = (counts[key] || 0) + 1
            return counts
        }, {})
        const warnings: string[] = []
        if (!edges.length) warnings.push('该标准尚未建立可遍历的进阶关系。')
        if ((confidence.low || 0) > 0) warnings.push(`当前连通分量包含 ${confidence.low} 条低置信度 H3→G7 推断桥，使用时应人工复核。`)
        else if (bridgeEdges.length) warnings.push('当前连通分量包含 H3→G7 推断桥，不应解释为官方声明的先修关系。')
        const hasH3 = nodes.some(record => record.grade_band === 'H3')
        const hasH4 = nodes.some(record => String(record.grade_band).startsWith('H4'))
        const subjectHasH4 = all.some(record => String(record.grade_band).startsWith('H4'))
        if (hasH3 && !hasH4 && subjectHasH4) {
            warnings.push('该进阶分支尚未找到同领域的 H3→G7 桥接关系。')
        }
        return {
            status: edges.length ? (bridgeEdges.length ? 'partial' : 'available') : 'not_available',
            semantic: 'curriculum_progression_graph',
            progression_group_id: standard.progression_group_id || null,
            anchor_code: standard.code,
            grade_bands: gradeOrder.filter(band => coverage[band] > 0),
            coverage,
            edges,
            bridge: {
                status: bridgeEdges.length ? 'inferred' : 'not_available',
                total: bridgeEdges.length,
                confidence
            },
            warnings,
            standards: nodes.map(record => projectStandard(record, include || ['public']))
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
        const resolved = await this.resolveStandard(code)
        if (resolved.status !== 'found' || !resolved.record) return null
        const standard = resolved.record
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
        options: { top_k_per_unit?: number; min_score?: number; include?: Fieldset[] } = {}
    ): Promise<PlanMatchingResult> {
        const normalized = normalizeParsedPlan(plan)
        const subjects = normalized.subject_slug ? [normalized.subject_slug] : undefined
        const all = await this.loadAllStandards(subjects)
        return matchPlanToStandards(normalized, all, options)
    }

    async analyzePlanCoverage(
        plan: ParsedPlanInput,
        matching?: PlanMatchingResult,
        options: { top_k_per_unit?: number; min_score?: number; include?: Fieldset[]; review_decisions?: CoverageReviewDecision[]; reference_scope_codes?: string[] } = {}
    ): Promise<CoverageAnalysis> {
        const normalized = normalizeParsedPlan(plan)
        const resolvedMatching = matching || await this.matchPlan(normalized, options)
        return analyzeCoverage(normalized, resolvedMatching, options.review_decisions, options.reference_scope_codes)
    }

    async generateWeeklySchedule(
        plan: ParsedPlanInput,
        matching?: PlanMatchingResult,
        options: {
            teaching_weeks?: number
            lessons_per_week?: number
            review_weeks?: number[]
            exam_weeks?: number[]
            review_confirmed?: boolean
            top_k_per_unit?: number
            min_score?: number
            include?: Fieldset[]
        } = {}
    ): Promise<WeeklySchedule[]> {
        const normalized = normalizeParsedPlan(plan)
        const resolvedMatching = matching || await this.matchPlan(normalized, options)
        return generateWeeklySchedule(normalized, resolvedMatching, options)
    }
}
