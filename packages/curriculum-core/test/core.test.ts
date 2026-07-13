import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolve } from 'node:path'
import {
    buildMeilisearchFilter,
    createMeilisearchDocuments,
    FileCurriculumRepository,
    filterStandards,
    projectStandard
} from '../src/index.js'
import type { StandardRecord } from '../src/index.js'

const dataRoot = resolve(process.cwd(), '../../data/internal')

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

    const filter = buildMeilisearchFilter({
        subjects: ['science'],
        grade_bands: ['H2'],
        skills: ['TS1']
    })
    assert.equal(filter, '(subject_slug = "science") AND (grade_band = "H2") AND (ts_primary = "TS1" OR ts_secondary = "TS1")')
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
    assert.equal(progression?.status, 'not_available')
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

    const coverage = await repository.analyzePlanCoverage(parsed.plan, matching)
    assert.ok(coverage.covered_standard_codes.length > 0)

    const schedule = await repository.generateWeeklySchedule(parsed.plan, matching, { teaching_weeks: 2, lessons_per_week: 2 })
    assert.equal(schedule.length, 2)
    assert.ok(schedule[0].standard_codes.length > 0)
})
