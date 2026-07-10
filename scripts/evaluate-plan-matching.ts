import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { FileCurriculumRepository } from '@curriculum/core'

interface UnitExpectation {
    unit_id: string
    acceptable_codes?: string[]
    forbidden_top_codes?: string[]
    min_top_score: number
    min_matched_fields: number
    expected_requires_human_review: boolean
}

interface Fixture {
    id: string
    source_note: string
    plan: Record<string, unknown>
    expectations: {
        expected_subject_slug: string
        expected_grade_band: string
        units: UnitExpectation[]
    }
}

interface QualityGates {
    minimum_metadata_accuracy: number
    minimum_top_1_accuracy: number
    minimum_recall_at_k: number
    minimum_mean_reciprocal_rank: number
    minimum_explainability_rate: number
    minimum_review_expectation_accuracy: number
    maximum_forbidden_top_match_count: number
}

interface FixtureSet {
    schema_version: string
    data_version: string
    description: string
    matching_options: {
        top_k_per_unit: number
        min_score: number
        review_threshold: number
    }
    quality_gates: QualityGates
    fixtures: Fixture[]
}

const fixturePath = resolve('packages/curriculum-core/test/fixtures/plan-matching-fixtures.json')
const fixtureSet = JSON.parse(await readFile(fixturePath, 'utf8')) as FixtureSet
const repository = new FileCurriculumRepository(resolve(process.env.CURRICULUM_DATA_ROOT || 'public/data'))
const dataVersion = await repository.loadDataVersion()
const failures: string[] = []
const results: Array<Record<string, unknown>> = []

if (dataVersion.data_version !== fixtureSet.data_version) {
    failures.push(`fixture data version ${fixtureSet.data_version} does not match repository data version ${dataVersion.data_version}`)
}

let metadataPassed = 0
let goldUnitCount = 0
let top1AcceptedCount = 0
let recallAtKCount = 0
let reciprocalRankSum = 0
let explainabilityPassed = 0
let explainabilityExpected = 0
let reviewExpectationPassed = 0
let reviewExpectationExpected = 0
let forbiddenTopMatchCount = 0

for (const fixture of fixtureSet.fixtures) {
    const matching = await repository.matchPlan(fixture.plan, fixtureSet.matching_options)
    const metadataMatches = (
        matching.plan.subject_slug === fixture.expectations.expected_subject_slug
        && matching.plan.grade_band === fixture.expectations.expected_grade_band
    )
    if (metadataMatches) {
        metadataPassed += 1
    } else {
        failures.push(
            `${fixture.id}: expected ${fixture.expectations.expected_subject_slug}/${fixture.expectations.expected_grade_band}, got ${matching.plan.subject_slug}/${matching.plan.grade_band}`
        )
    }

    const unitsById = new Map(matching.units.map(unit => [unit.unit_id, unit]))
    const unitResults: Array<Record<string, unknown>> = []

    for (const expectation of fixture.expectations.units) {
        const unit = unitsById.get(expectation.unit_id)
        const topMatch = unit?.matches[0]
        explainabilityExpected += 1
        reviewExpectationExpected += 1

        if (!topMatch) {
            failures.push(`${fixture.id}/${expectation.unit_id}: expected at least one match`)
            unitResults.push({ unit_id: expectation.unit_id, top_code: null, status: 'no_match' })
            continue
        }

        const topCode = topMatch.code
        const matchedFieldCount = topMatch.matched_fields.length
        const goldCodes = expectation.acceptable_codes || []
        const result: Record<string, unknown> = {
            unit_id: expectation.unit_id,
            top_code: topCode,
            top_score: topMatch.score,
            matched_fields: topMatch.matched_fields.map(field => field.field),
            requires_human_review: topMatch.requires_human_review,
            top_k_codes: unit.matches.map(match => match.code)
        }

        if (topMatch.score < expectation.min_top_score) {
            failures.push(`${fixture.id}/${expectation.unit_id}: expected score >= ${expectation.min_top_score}, got ${topMatch.score}`)
        }
        if (matchedFieldCount < expectation.min_matched_fields) {
            failures.push(`${fixture.id}/${expectation.unit_id}: expected at least ${expectation.min_matched_fields} matched fields, got ${matchedFieldCount}`)
        } else if (topMatch.rationale) {
            explainabilityPassed += 1
        } else {
            failures.push(`${fixture.id}/${expectation.unit_id}: match must include a rationale`)
        }

        if (topMatch.requires_human_review === expectation.expected_requires_human_review) {
            reviewExpectationPassed += 1
        } else {
            failures.push(`${fixture.id}/${expectation.unit_id}: expected requires_human_review=${expectation.expected_requires_human_review}, got ${topMatch.requires_human_review}`)
        }

        if (expectation.forbidden_top_codes?.includes(topCode)) {
            forbiddenTopMatchCount += 1
            failures.push(`${fixture.id}/${expectation.unit_id}: forbidden top match ${topCode}`)
        }

        if (goldCodes.length) {
            goldUnitCount += 1
            const acceptedRank = unit.matches.findIndex(match => goldCodes.includes(match.code))
            const hitAtK = acceptedRank >= 0
            result.acceptable_codes = goldCodes
            result.accepted_rank = hitAtK ? acceptedRank + 1 : null

            if (hitAtK) {
                recallAtKCount += 1
                reciprocalRankSum += 1 / (acceptedRank + 1)
                if (acceptedRank === 0) top1AcceptedCount += 1
            } else {
                failures.push(`${fixture.id}/${expectation.unit_id}: none of ${goldCodes.join(', ')} appeared in top ${fixtureSet.matching_options.top_k_per_unit}`)
            }
        }

        unitResults.push(result)
    }

    results.push({
        id: fixture.id,
        source_note: fixture.source_note,
        subject_slug: matching.plan.subject_slug,
        grade_band: matching.plan.grade_band,
        units: unitResults
    })
}

const ratio = (numerator: number, denominator: number) => denominator ? numerator / denominator : 1
const metrics = {
    metadata_accuracy: ratio(metadataPassed, fixtureSet.fixtures.length),
    top_1_accuracy: ratio(top1AcceptedCount, goldUnitCount),
    recall_at_k: ratio(recallAtKCount, goldUnitCount),
    mean_reciprocal_rank: ratio(reciprocalRankSum, goldUnitCount),
    explainability_rate: ratio(explainabilityPassed, explainabilityExpected),
    review_expectation_accuracy: ratio(reviewExpectationPassed, reviewExpectationExpected),
    forbidden_top_match_count: forbiddenTopMatchCount,
    fixture_count: fixtureSet.fixtures.length,
    evaluated_unit_count: explainabilityExpected,
    gold_unit_count: goldUnitCount
}

const gates = fixtureSet.quality_gates
const requiredMinimums: Array<[keyof typeof metrics, number, string]> = [
    ['metadata_accuracy', gates.minimum_metadata_accuracy, 'metadata accuracy'],
    ['top_1_accuracy', gates.minimum_top_1_accuracy, 'top-1 accuracy'],
    ['recall_at_k', gates.minimum_recall_at_k, `recall@${fixtureSet.matching_options.top_k_per_unit}`],
    ['mean_reciprocal_rank', gates.minimum_mean_reciprocal_rank, 'mean reciprocal rank'],
    ['explainability_rate', gates.minimum_explainability_rate, 'explainability rate'],
    ['review_expectation_accuracy', gates.minimum_review_expectation_accuracy, 'review expectation accuracy']
]

for (const [metric, minimum, label] of requiredMinimums) {
    if (typeof metrics[metric] === 'number' && metrics[metric] + Number.EPSILON < minimum) {
        failures.push(`quality gate failed: ${label} ${metrics[metric]} < ${minimum}`)
    }
}
if (metrics.forbidden_top_match_count > gates.maximum_forbidden_top_match_count) {
    failures.push(`quality gate failed: forbidden top matches ${metrics.forbidden_top_match_count} > ${gates.maximum_forbidden_top_match_count}`)
}

console.log(JSON.stringify({
    valid: failures.length === 0,
    fixture_schema_version: fixtureSet.schema_version,
    fixture_data_version: fixtureSet.data_version,
    repository_data_version: dataVersion.data_version,
    matching_options: fixtureSet.matching_options,
    quality_gates: fixtureSet.quality_gates,
    metrics,
    results,
    failures
}, null, 2))

if (failures.length) process.exit(1)
