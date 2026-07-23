import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { resolve } from 'node:path'
import {
    buildMeilisearchFilter,
    buildGroundedStandardContext,
    buildTopologicalLayers,
    configureMeilisearchIndex,
    createKnowledgeGraphIndex,
    createMeilisearchDocuments,
    FileCurriculumRepository,
    FileLearningResourceRepository,
    FileTextbookRepository,
    learningResourceHash,
    learningResourceIds,
    TextbookDetailRecordSchema,
    filterStandards,
    getLearningContext,
    getPrerequisites,
    getUnlocks,
    projectStandard,
    parseSmartSearchQuery,
    smartSearchStandards
} from '../src/index.js'
import type { KnowledgeGraphDataset, StandardRecord } from '../src/index.js'

const dataRoot = resolve(process.cwd(), '../../data/internal')
const publicDataRoot = resolve(process.cwd(), '../../public/data')

test('filterStandards matches skills across primary and secondary tags', () => {
    const standards: StandardRecord[] = [
        { code: 'A', subject_slug: 'science', grade_band: 'H2', domain: '生命科学', standard: '观察植物', ts_primary: ['TS1.2'] },
        { code: 'B', subject_slug: 'math', grade_band: 'H2', domain: '数与代数', standard: '计算', ts_secondary: ['TS5'] }
    ]
    assert.equal(filterStandards(standards, { skills: ['TS1'] }).length, 1)
    assert.equal(filterStandards(standards, { skills: ['TS5'] }).length, 1)
})

test('projectStandard hides admin fields by default', () => {
    const projected = projectStandard({
        code: 'X',
        subject: '科学',
        subject_slug: 'science',
        grade_band: 'H2',
        standard: '测试',
        review_status: 'internal_status',
        source_standard_original: 'source'
    })
    assert.equal(projected.code, 'X')
    assert.equal('review_status' in projected, false)
    assert.equal('source_standard_original' in projected, false)
    assert.equal('grade_assignment_type' in projected, false)
})

test('learning resource identities separate stable identity from content version', () => {
    const resourceId = learningResourceIds.resource('bookdash', 'a-beautiful-day')
    assert.equal(resourceId, learningResourceIds.resource('bookdash', 'a-beautiful-day'))
    assert.match(resourceId, /^lr_[a-f0-9]{24}$/)

    const firstVersion = learningResourceIds.resourceVersion(resourceId, { title: 'A Beautiful Day', revision: '1' })
    const secondVersion = learningResourceIds.resourceVersion(resourceId, { title: 'A Beautiful Day', revision: '2' })
    assert.notEqual(firstVersion, secondVersion)
    assert.match(learningResourceHash({ b: 2, a: '中文\r\n' }), /^[a-f0-9]{64}$/)
    assert.equal(
        learningResourceHash({ b: 2, a: '中文\r\n' }),
        learningResourceHash({ a: '中文\n', b: 2 })
    )
})

test('learning resource repository fails open to an empty catalog before first generation', async () => {
    const repository = new FileLearningResourceRepository(resolve(tmpdir(), `kebiao-missing-${randomUUID()}`))
    assert.deepEqual(await repository.search(), [])
    const standard = await repository.getForStandard('CN-D1-FAKE-001')
    assert.equal(standard.standard_code, 'CN-D1-FAKE-001')
    assert.deepEqual(standard.resources, [])
    assert.deepEqual(standard.alignments, [])
})

test('buildGroundedStandardContext separates sources and quarantines flagged content', () => {
    const context = buildGroundedStandardContext({
        code: 'SC-D2-SC-010',
        standard: '认识常见材料的某些性能。',
        context: '截断内容；',
        official_text: '课标原始章节摘录。',
        field_provenance: {
            standard: { provenance: 'extracted', rag_eligible: true, quality_flags: [], source_ref: { document: '科学课标' } },
            context: { provenance: 'extracted', rag_eligible: false, quality_flags: ['possible_truncation'], source_ref: { document: '科学课标' } }
        }
    }) as Record<string, unknown>
    assert.equal((context.official as unknown[]).length, 1)
    assert.equal((context.structured as unknown[]).length, 1)
    assert.deepEqual((context.excluded as Array<Record<string, unknown>>)[0].quality_flags, ['possible_truncation'])
})

test('Meilisearch adapter builds bounded public/evidence documents and filters', () => {
    const documents = createMeilisearchDocuments([
        {
            code: 'SC-D2-SC-010',
            subject: '科学',
            subject_slug: 'science',
            grade_band: 'H2',
            domain: '科学观念',
            subdomain: '物质的变化与化学反应',
            standard: '观察物质变化',
            review_status: 'internal',
            ts_primary: ['TS1']
        }
    ])
    assert.equal(documents.length, 1)
    assert.equal(documents[0].code, 'SC-D2-SC-010')
    assert.equal('review_status' in documents[0], false)
    assert.match(String(documents[0].searchable_text), /观察物质变化/)
    assert.match(String(documents[0].searchable_text_primary), /观察物质变化/)
    assert.equal(String(documents[0].searchable_text_supporting), '')

    const filter = buildMeilisearchFilter({
        subjects: ['science'],
        grade_bands: ['H2'],
        skills: ['TS1']
    })
    assert.equal(filter, '(subject_slug = "science") AND (grade_band = "H2") AND (ts_primary = "TS1" OR ts_secondary = "TS1")')
})

test('Meilisearch ranks official topic fields before editorial supporting fields', async () => {
    let settings: Record<string, unknown> = {}
    const fetch = async (_input: string | URL | Request, init?: RequestInit) => {
        settings = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
        return new Response(JSON.stringify({ taskUid: 1 }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        })
    }

    await configureMeilisearchIndex({ host: 'http://search.test', fetch })
    const attributes = settings.searchableAttributes as string[]
    assert.ok(attributes.indexOf('standard') < attributes.indexOf('context'))
    assert.ok(attributes.indexOf('domain') < attributes.indexOf('practice'))
    assert.ok(attributes.indexOf('searchable_text_primary') < attributes.indexOf('searchable_text_supporting'))
})

test('FileCurriculumRepository loads public data and searches standards', async () => {
    const repository = new FileCurriculumRepository(dataRoot)
    const version = await repository.loadDataVersion()
    assert.equal(version.standard_count, 2025)

    const result = await repository.searchStandards({
        subjects: ['science'],
        grade_bands: ['H2'],
        keyword: '观察',
        limit: 5
    })
    assert.ok(result.total > 0)
    assert.ok(result.items.length <= 5)
})

test('smart search parses constraints and never violates explicit hard filters', async () => {
    const parsed = parseSmartSearchQuery('三四年级科学中适合证据推理的活动')
    assert.deepEqual(parsed.subjects, ['science'])
    assert.deepEqual(parsed.grade_bands, ['H2'])
    assert.ok(parsed.skills.includes('TS1'))

    const repository = new FileCurriculumRepository(dataRoot)
    const result = await repository.smartSearchStandards({
        query: '观察材料并用证据解释变化',
        subjects: ['science'],
        grade_bands: ['H2'],
        limit: 8
    })
    assert.ok(result.results.length > 0)
    assert.ok(result.results.every(item => item.standard.subject_slug === 'science'))
    assert.ok(result.results.every(item => item.standard.grade_band === 'H2'))
    assert.ok(result.results.every(item => item.requires_human_review === true))
    assert.equal(result.semantic_provider, 'none')
})

test('smart search understands subject exclusions and lets explicit filters correct them', async () => {
    const query = '第一学段，除了语文学科之外，跟阅读相关的课标'
    const parsed = parseSmartSearchQuery(query)
    assert.deepEqual(parsed.subjects, [])
    assert.deepEqual(parsed.excluded_subjects, ['chinese'])
    assert.deepEqual(parsed.grade_bands, ['H1'])
    assert.deepEqual(parsed.core_terms, ['阅读'])
    assert.ok(!parsed.terms.some(term => ['语文', '相关', '课标', '段除'].includes(term)))

    const repository = new FileCurriculumRepository(dataRoot)
    const excluded = await repository.smartSearchStandards({
        query,
        inferred_core_terms: ['阅读'],
        query_expansion_terms: ['识字与阅读', '阅读理解', '课标阅读要求', '低年级阅读能力', '阅读教学目标', '信息获取', '读写结合'],
        min_score: 0,
        limit: 20
    })
    assert.deepEqual(excluded.applied_filters.excluded_subjects, ['chinese'])
    assert.deepEqual(excluded.results.map(item => item.code), ['IT-H1-DL-001'])
    assert.ok(excluded.results.every(item => item.standard.subject_slug !== 'chinese'))
    assert.ok(excluded.results.every(item => item.standard.grade_band === 'H1'))
    assert.equal(excluded.results[0].match_strength, 'direct')
    assert.ok(excluded.results[0].matched_concepts.includes('阅读'))
    assert.ok(!(excluded.parsed_query.effective_expansion_terms as string[]).includes('信息获取'))
    assert.ok(!(excluded.parsed_query.effective_expansion_terms as string[]).includes('读写'))
    assert.deepEqual(excluded.relevance_summary, { direct: 1, supporting: 0 })
    assert.equal(excluded.relevant_candidates, 1)
    assert.ok(excluded.omitted_low_relevance > 0)
    assert.match(excluded.coverage_note, /仅发现 1 条/)

    const conflictingInference = await repository.smartSearchStandards({
        query,
        inferred_subjects: ['chinese'],
        inferred_grade_bands: ['H1'],
        min_score: 0,
        limit: 6
    })
    assert.deepEqual(conflictingInference.applied_filters.subjects, [])
    assert.deepEqual(conflictingInference.applied_filters.excluded_subjects, ['chinese'])
    assert.deepEqual(conflictingInference.results.map(item => item.code), ['IT-H1-DL-001'])

    const explicitOverride = await repository.smartSearchStandards({
        query,
        subjects: ['chinese'],
        grade_bands: ['H1'],
        min_score: 0,
        limit: 3
    })
    assert.deepEqual(explicitOverride.applied_filters.excluded_subjects, [])
    assert.ok(explicitOverride.results.every(item => item.standard.subject_slug === 'chinese'))
})

test('natural-language query plan preserves explicit grade and exclusion constraints over model inference', async () => {
    const query = '第二学段 G3-4，和阅读相关的标准，但不是语文学科中的'
    const parsed = parseSmartSearchQuery(query)

    assert.deepEqual(parsed.grade_bands, ['H2'])
    assert.deepEqual(parsed.excluded_subjects, ['chinese'])
    assert.deepEqual(parsed.core_terms, ['阅读'])

    const repository = new FileCurriculumRepository(dataRoot)
    const result = await repository.smartSearchStandards({
        query,
        inferred_grade_bands: ['H4G7', 'H4G8', 'H4G9'],
        inferred_excluded_subjects: ['chinese'],
        inferred_core_terms: ['阅读'],
        limit: 12
    })

    assert.deepEqual(result.applied_filters.grade_bands, ['H2'])
    assert.deepEqual(result.applied_filters.excluded_subjects, ['chinese'])
    assert.deepEqual(result.parsed_query.core_terms, ['阅读'])
    assert.deepEqual(result.query_plan.resolved_constraints.grade_bands, ['H2'])
    assert.deepEqual(result.query_plan.resolved_constraints.excluded_subjects, ['chinese'])
    assert.equal(result.query_plan.needs_clarification, false)
    assert.ok(result.query_plan.conflicts.some(conflict => conflict.kind === 'grade_band'))
    assert.ok(result.results.every(item => item.standard.grade_band === 'H2'))
    assert.ok(result.results.every(item => item.standard.subject_slug !== 'chinese'))
})

test('smart search excludes fields quarantined from RAG evidence', () => {
    const response = smartSearchStandards([{
        code: 'SC-TEST-001',
        subject_slug: 'science',
        grade_band: 'H2',
        standard: '观察植物生长',
        context: '绝密候选词',
        field_provenance: {
            standard: { rag_eligible: true, provenance: 'extracted', confidence: 0.8 },
            context: { rag_eligible: false, provenance: 'ai_generated', confidence: 0.2, quality_flags: ['possible_truncation'] }
        }
    }], { query: '绝密候选词', subjects: ['science'], grade_bands: ['H2'], min_score: 0 })
    assert.equal(response.results.length, 0)
    assert.equal(response.relevant_candidates, 0)
    assert.match(response.coverage_note, /没有发现具备主题证据/)
})

test('FileCurriculumRepository exposes graph relationships and evidence summaries', async () => {
    const repository = new FileCurriculumRepository(dataRoot)
    const neighbors = await repository.getStandardNeighbors('SC-D2-SC-010')
    assert.equal(neighbors?.relationships.previous?.code, 'SC-D1-SC-014')
    assert.equal(neighbors?.relationships.next?.code, 'SC-D3-SC-010')

    const evidence = await repository.getEvidenceSummaryForCode('SC-H4G7-AR-001')
    assert.equal(evidence?.code, 'SC-H4G7-AR-001')
    assert.ok((evidence?.evidence_counts.textbook || 0) > 0)

    const comparison = await repository.compareStandards(['SC-D1-SC-014', 'SC-D2-SC-010'])
    assert.equal(comparison.missing.length, 0)
    assert.equal(comparison.standards.length, 2)
    assert.ok('grade_band' in comparison.different_fields)
})

test('FileCurriculumRepository resolves unique aliases exactly and exposes progression availability', async () => {
    const repository = new FileCurriculumRepository(dataRoot)
    const alias = await repository.resolveStandard('AR-H1-AA-MU-007')
    assert.equal(alias.status, 'found')
    assert.equal(alias.record?.code, 'AR-D1-AA-007')
    assert.equal((await repository.resolveStandard('ar-h1-aa-mu-007')).status, 'missing')
    assert.equal((await repository.resolveStandard('AR-H4-DA-001')).status, 'ambiguous')

    const progression = await repository.getProgressionForCode('SC-D2-SC-010')
    assert.equal(progression?.semantic, 'curriculum_progression_graph')
    assert.deepEqual(progression?.grade_bands, ['H1', 'H2', 'H3', 'H4G7', 'H4G8', 'H4G9'])
    assert.ok((progression?.edges as Record<string, unknown>[]).some(edge => edge.relation === 'inferred_stage_bridge'))
})

test('FileCurriculumRepository matches plans to real standards with explanations', async () => {
    const repository = new FileCurriculumRepository(dataRoot)
    const parsed = repository.parsePlan({
        plan: {
            title: '三年级科学植物观察单元',
            subject_slug: 'science',
            grade: '三年级',
            units: [
                {
                    title: '植物生命周期观察',
                    learning_goals: ['观察植物结构', '记录数据并交流发现'],
                    keywords: ['植物', '观察', '数据']
                }
            ]
        }
    })
    assert.equal(parsed.plan.grade_band, 'H2')

    const validation = await repository.validatePlan(parsed.plan)
    assert.equal(validation.valid, true)

    const matching = await repository.matchPlan(parsed.plan, { top_k_per_unit: 3, min_score: 0.2 })
    assert.equal(matching.units.length, 1)
    assert.ok(matching.units[0].matches.length > 0)
    assert.match(matching.units[0].matches[0].code, /^SC-/)
    assert.ok(matching.units[0].matches[0].matched_fields.length > 0)

    const firstMatch = matching.units[0].matches[0]
    const unreviewedCoverage = await repository.analyzePlanCoverage(parsed.plan, matching)
    assert.equal(unreviewedCoverage.covered_standard_codes.length, 0)
    assert.ok(unreviewedCoverage.unreviewed_standard_codes.length > 0)

    const coverage = await repository.analyzePlanCoverage(parsed.plan, matching, {
        review_decisions: [{ unit_id: matching.units[0].unit_id, code: firstMatch.code, decision: 'accepted' }]
    })
    assert.ok(coverage.covered_standard_codes.length > 0)

    const schedule = await repository.generateWeeklySchedule(parsed.plan, matching, { teaching_weeks: 2, lessons_per_week: 2 })
    assert.equal(schedule.length, 2)
    assert.ok(schedule[0].standard_codes.length > 0)
})

test('FileTextbookRepository exposes specific evidence and deduplicated curriculum scopes', async () => {
    const repository = new FileTextbookRepository(publicDataRoot)
    const catalog = await repository.loadCatalog()
    assert.equal(catalog.items.length, 141)

    const detail = await repository.get('ed_9d4028e2ab482520d0aa')
    assert.ok(detail)
    assert.ok(detail.standard_scopes.length > 0)
    assert.ok(detail.alignments.some(alignment => alignment.review_status === 'machine_checked'))

    const links = await repository.getTextbooksForStandard('MA-H4G7-AL-003')
    assert.ok(links.some(link => link.evidence_granularity === 'textbook_page_evidence'))
    assert.ok(links.some(link => typeof link.evidence_excerpt === 'string' && link.evidence_excerpt.length > 0))
    assert.ok(links.some(link => link.evidence_granularity === 'textbook_grade_band_scope'))
    const scopeEditions = new Set(links.filter(link => link.evidence_granularity === 'textbook_grade_band_scope').map(link => link.edition_id))
    assert.ok(links.filter(link => link.evidence_granularity === 'textbook_page_evidence').every(link => !scopeEditions.has(link.edition_id)))
})

test('FileTextbookRepository resolves page context without promoting curriculum scope', async () => {
    const repository = new FileTextbookRepository(publicDataRoot)
    const context = await repository.getPageContext('ed_006d5ed61c055eb63857', 121)
    assert.ok(context)
    assert.equal(context.pdf_page, 121)
    assert.equal(context.printed_page, '114')
    assert.ok(context.active_nodes.length > 0)
    assert.deepEqual(
        context.alignments.map(alignment => alignment.standard_code).sort(),
        ['MA-H4G7-GE-002', 'MA-H4G7-GE-037']
    )
    assert.ok(context.alignments.every(alignment => alignment.review_status === 'approved'))
    assert.ok(context.alignments.every(alignment => !['curriculum_scope', 'adjacent_curriculum_scope'].includes(alignment.relation_type)))
    assert.ok(context.standard_scopes.length > 0)

    const alignedDetail = await repository.get('ed_dda80e43104244896faa')
    assert.ok(alignedDetail)
    const concreteAlignment = alignedDetail.alignments.find(alignment => typeof alignment.pdf_page === 'number' && alignment.pdf_page > 0)
    assert.ok(concreteAlignment)
    const concretePage = concreteAlignment.pdf_page
    if (typeof concretePage !== 'number') {
        throw new Error('Expected a concrete textbook alignment PDF page')
    }
    const alignedContext = await repository.getPageContext(alignedDetail.edition_id, concretePage)
    assert.ok(alignedContext)
    assert.ok(alignedContext.alignments.some(alignment => alignment.alignment_id === concreteAlignment.alignment_id))
    assert.ok(alignedContext.alignments.every(alignment => !['curriculum_scope', 'adjacent_curriculum_scope'].includes(alignment.relation_type)))

    const reverse = await repository.getTextbooksForStandard(concreteAlignment.standard_code)
    assert.ok(reverse.some(link => link.alignment_id === concreteAlignment.alignment_id))

    const fineGrained = await repository.getPageContext('ed_9d4028e2ab482520d0aa', 70)
    assert.ok(fineGrained)
    const pageEvidence = fineGrained.alignments.find(alignment => alignment.evidence_level === 'L3')
    assert.ok(pageEvidence)
    assert.equal(pageEvidence.evidence_level_detail, 'L3_page_evidence')
    assert.ok(pageEvidence.node_id)
    assert.ok(pageEvidence.learning_components?.length)
    assert.ok(pageEvidence.evidence_span_ids?.length)
    assert.ok(fineGrained.evidence_spans.some(span => pageEvidence.evidence_span_ids?.includes(span.evidence_span_id)))
    assert.equal(await repository.getPageContext('ed_006d5ed61c055eb63857', 0), null)
})

test('textbook detail schema supplies empty fine-grained collections for legacy payloads', async () => {
    const repository = new FileTextbookRepository(publicDataRoot)
    const detail = await repository.get('ed_006d5ed61c055eb63857')
    assert.ok(detail)
    const legacy = structuredClone(detail) as unknown as Record<string, unknown>
    delete legacy.content_nodes
    delete legacy.evidence_spans
    const parsed = TextbookDetailRecordSchema.parse(legacy)
    assert.deepEqual(parsed.content_nodes, [])
    assert.deepEqual(parsed.evidence_spans, [])
})

test('textbook detail schema accepts split heading merge TOC provenance', async () => {
    const repository = new FileTextbookRepository(publicDataRoot)
    const detail = await repository.get('ed_ba25683b949d491afb3c')
    assert.ok(detail)
    assert.ok(detail.toc.some(entry => entry.source === 'heading_match+split_heading_merge'))
})

const learningFixture: KnowledgeGraphDataset = {
    knowledgePoints: [
        { id: 'kp:a', type: 'knowledge_point', label: 'A', subjectSlug: 'math', standardCodes: ['MA-A'], dependencyCoverage: { incoming: 'reviewed', outgoing: 'reviewed' }, reviewStatus: 'approved' },
        { id: 'kp:b', type: 'knowledge_point', label: 'B', subjectSlug: 'math', standardCodes: ['MA-B'], dependencyCoverage: { incoming: 'reviewed', outgoing: 'reviewed' }, reviewStatus: 'approved' },
        { id: 'kp:c', type: 'knowledge_point', label: 'C', subjectSlug: 'math', standardCodes: ['MA-C'], dependencyCoverage: { incoming: 'reviewed', outgoing: 'reviewed' }, reviewStatus: 'approved' },
        { id: 'kp:d', type: 'knowledge_point', label: 'D', subjectSlug: 'math', standardCodes: ['MA-D'], dependencyCoverage: { incoming: 'reviewed', outgoing: 'reviewed' }, reviewStatus: 'approved' }
    ],
    taxonomyNodes: [
        { id: 'topic:math', type: 'taxonomy_node', label: '数学', taxonomyId: 'fixture', subjectSlug: 'math', order: 1, reviewStatus: 'approved' },
        { id: 'topic:math:geometry', type: 'taxonomy_node', label: '图形与几何', taxonomyId: 'fixture', subjectSlug: 'math', order: 2, reviewStatus: 'approved' }
    ],
    prerequisites: [
        { id: 'pre:a:b', source: 'kp:a', target: 'kp:b', type: 'prerequisite', directed: true, necessity: 'required', rationale: 'A before B', evidenceRefs: ['ev:a-b'], confidence: 'high', reviewStatus: 'approved', reviewedByRole: 'fixture', reviewedAt: '2026-07-12', version: 'fixture' },
        { id: 'pre:a:c', source: 'kp:a', target: 'kp:c', type: 'prerequisite', directed: true, necessity: 'required', rationale: 'A before C', evidenceRefs: ['ev:a-c'], confidence: 'high', reviewStatus: 'approved', reviewedByRole: 'fixture', reviewedAt: '2026-07-12', version: 'fixture' },
        { id: 'pre:b:d', source: 'kp:b', target: 'kp:d', type: 'prerequisite', directed: true, necessity: 'required', rationale: 'B before D', evidenceRefs: ['ev:b-d'], confidence: 'high', reviewStatus: 'approved', reviewedByRole: 'fixture', reviewedAt: '2026-07-12', version: 'fixture' },
        { id: 'pre:c:d', source: 'kp:c', target: 'kp:d', type: 'prerequisite', directed: true, necessity: 'recommended', rationale: 'C helps D', evidenceRefs: ['ev:c-d'], confidence: 'medium', reviewStatus: 'approved', reviewedByRole: 'fixture', reviewedAt: '2026-07-12', version: 'fixture' }
    ],
    taxonomyEdges: [
        { id: 'tax:math:geometry', source: 'topic:math', target: 'topic:math:geometry', type: 'taxonomy_parent', taxonomyId: 'fixture', directed: true, order: 1, reviewStatus: 'approved' },
        { id: 'tax:geometry:d', source: 'topic:math:geometry', target: 'kp:d', type: 'taxonomy_parent', taxonomyId: 'fixture', directed: true, order: 2, reviewStatus: 'approved' },
        { id: 'tax:math:d', source: 'topic:math', target: 'kp:d', type: 'taxonomy_parent', taxonomyId: 'fixture', directed: true, order: 3, reviewStatus: 'approved' }
    ],
    evidence: [
        { id: 'ev:a-b', sourceType: 'fixture', sourceId: 'fixture', locator: 'a-b', statement: 'A before B' },
        { id: 'ev:a-c', sourceType: 'fixture', sourceId: 'fixture', locator: 'a-c', statement: 'A before C' },
        { id: 'ev:b-d', sourceType: 'fixture', sourceId: 'fixture', locator: 'b-d', statement: 'B before D' },
        { id: 'ev:c-d', sourceType: 'fixture', sourceId: 'fixture', locator: 'c-d', statement: 'C helps D' }
    ]
}

test('Learning Map keeps prerequisite direction and all diamond branches', () => {
    const index = createKnowledgeGraphIndex(learningFixture)
    assert.deepEqual(getPrerequisites(index, 'kp:d').map(point => point.id), ['kp:b', 'kp:c'])
    assert.deepEqual(getUnlocks(index, 'kp:a').map(point => point.id), ['kp:b', 'kp:c'])
    const topology = buildTopologicalLayers(index, 'kp:d', { prerequisiteDepth: 2, unlockDepth: 1 })
    assert.deepEqual(topology.prerequisiteLayers.map(layer => layer.map(point => point.id)), [['kp:b', 'kp:c'], ['kp:a']])
    assert.deepEqual(topology.edges.map(edge => edge.id), ['pre:a:b', 'pre:a:c', 'pre:b:d', 'pre:c:d'])
})

test('Learning Map restores a deterministic taxonomy context and honest coverage', () => {
    const index = createKnowledgeGraphIndex(learningFixture)
    const context = getLearningContext(index, 'kp:d', {
        prerequisiteDepth: 1,
        unlockDepth: 1,
        contextPath: ['topic:math', 'topic:math:geometry', 'kp:d']
    })
    assert.deepEqual(context.taxonomy.activePath.map(node => node.id), ['topic:math', 'topic:math:geometry', 'kp:d'])
    assert.equal(context.taxonomy.alternativePaths.length, 1)
    assert.equal(context.coverage.incoming, 'reviewed')
    assert.equal(context.coverage.outgoing, 'reviewed')
})
