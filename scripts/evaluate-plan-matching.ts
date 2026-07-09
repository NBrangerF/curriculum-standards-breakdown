import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { FileCurriculumRepository } from '@curriculum/core'

interface Fixture {
    id: string
    plan: Record<string, unknown>
    expectations: {
        expected_subject_slug: string
        expected_grade_band: string
        min_top_score: number
        min_matched_fields: number
        top_code_prefix: string
    }
}

const fixturePath = resolve('packages/curriculum-core/test/fixtures/plan-matching-fixtures.json')
const fixtures = JSON.parse(await readFile(fixturePath, 'utf8')) as Fixture[]
const repository = new FileCurriculumRepository(resolve(process.env.CURRICULUM_DATA_ROOT || 'public/data'))
const failures: string[] = []
const results = []

for (const fixture of fixtures) {
    const matching = await repository.matchPlan(fixture.plan, {
        top_k_per_unit: 3,
        min_score: 0.2
    })
    const firstUnit = matching.units[0]
    const topMatch = firstUnit?.matches[0]

    if (matching.plan.subject_slug !== fixture.expectations.expected_subject_slug) {
        failures.push(`${fixture.id}: expected subject ${fixture.expectations.expected_subject_slug}, got ${matching.plan.subject_slug}`)
    }
    if (matching.plan.grade_band !== fixture.expectations.expected_grade_band) {
        failures.push(`${fixture.id}: expected grade band ${fixture.expectations.expected_grade_band}, got ${matching.plan.grade_band}`)
    }
    if (!topMatch) {
        failures.push(`${fixture.id}: expected at least one match`)
    } else {
        if (!topMatch.code.startsWith(fixture.expectations.top_code_prefix)) {
            failures.push(`${fixture.id}: expected top code prefix ${fixture.expectations.top_code_prefix}, got ${topMatch.code}`)
        }
        if (topMatch.score < fixture.expectations.min_top_score) {
            failures.push(`${fixture.id}: expected score >= ${fixture.expectations.min_top_score}, got ${topMatch.score}`)
        }
        if (topMatch.matched_fields.length < fixture.expectations.min_matched_fields) {
            failures.push(`${fixture.id}: expected at least ${fixture.expectations.min_matched_fields} matched fields, got ${topMatch.matched_fields.length}`)
        }
        if (!topMatch.rationale || typeof topMatch.requires_human_review !== 'boolean') {
            failures.push(`${fixture.id}: match must include rationale and requires_human_review`)
        }
    }

    results.push({
        id: fixture.id,
        grade_band: matching.plan.grade_band,
        top_code: topMatch?.code || null,
        top_score: topMatch?.score || null,
        matched_fields: topMatch?.matched_fields.map(field => field.field) || []
    })
}

console.log(JSON.stringify({
    valid: failures.length === 0,
    fixture_count: fixtures.length,
    results,
    failures
}, null, 2))

if (failures.length) process.exit(1)
