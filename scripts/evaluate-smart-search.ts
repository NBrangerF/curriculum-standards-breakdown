import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { FileCurriculumRepository } from '../packages/curriculum-core/src/index.js'

type EvalCase = {
    id: string
    query: string
    subjects?: string[]
    excluded_subjects?: string[]
    grade_bands?: string[]
    natural_only?: boolean
    expected_subjects?: string[]
    expected_excluded_subjects?: string[]
    expected_grade_bands?: string[]
    expected_core_terms?: string[]
    forbidden_core_terms?: string[]
    forbidden_grade_bands?: string[]
    forbidden_direct_codes?: string[]
    min_score?: number
    expect_empty?: boolean
    forbidden_codes?: string[]
    expected_codes?: string[]
    expected_only?: boolean
}

const root = process.cwd()
const fixturePath = resolve(root, 'packages/curriculum-core/test/fixtures/smart-search-contract-eval.json')
const cases = JSON.parse(await readFile(fixturePath, 'utf8')) as EvalCase[]
const repository = new FileCurriculumRepository(resolve(root, 'public/data'))
const all = await repository.loadAllStandards()
const canonicalCodes = new Set(all.map(record => record.code))
let returned = 0
let hardFilterViolations = 0
let hallucinatedCodes = 0
let missingReviewFlags = 0
let missingEvidenceMetadata = 0
let unexpectedEmptyCases = 0
let unexpectedNonemptyCases = 0
let forbiddenCodesReturned = 0
let nondeterministicCases = 0
let missingExpectedCodes = 0
let unexpectedExpectedOnlyCodes = 0
let resultsWithoutTopicEvidence = 0
let invalidMatchStrength = 0
let queryPlanViolations = 0
let coreTermContamination = 0
let forbiddenDirectCodesReturned = 0

for (const fixture of cases) {
    const request = {
        query: fixture.query,
        subjects: fixture.natural_only ? undefined : fixture.subjects,
        excluded_subjects: fixture.natural_only ? undefined : fixture.excluded_subjects,
        grade_bands: fixture.natural_only ? undefined : fixture.grade_bands,
        limit: 5,
        min_score: fixture.min_score ?? 0
    }
    const response = await repository.smartSearchStandards(request)
    const repeated = await repository.smartSearchStandards(request)
    if (response.results.map(result => result.code).join('|') !== repeated.results.map(result => result.code).join('|')) {
        nondeterministicCases += 1
    }
    if (fixture.expect_empty === true && response.results.length) unexpectedNonemptyCases += 1
    if (fixture.expect_empty !== true && !response.results.length) unexpectedEmptyCases += 1
    const resultCodes = response.results.map(result => result.code)
    const expectedCodes = fixture.expected_codes || []
    missingExpectedCodes += expectedCodes.filter(code => !resultCodes.includes(code)).length
    if (fixture.expected_only) unexpectedExpectedOnlyCodes += resultCodes.filter(code => !expectedCodes.includes(code)).length
    returned += response.results.length
    const expectedSubjects = fixture.expected_subjects || fixture.subjects || []
    const expectedExcludedSubjects = fixture.expected_excluded_subjects || fixture.excluded_subjects || []
    const expectedGradeBands = fixture.expected_grade_bands || fixture.grade_bands || []
    const resolved = response.query_plan.resolved_constraints
    if (expectedSubjects.join('|') !== resolved.subjects.join('|')
        || expectedExcludedSubjects.join('|') !== resolved.excluded_subjects.join('|')
        || expectedGradeBands.join('|') !== resolved.grade_bands.join('|')
        || (fixture.forbidden_grade_bands || []).some(value => resolved.grade_bands.includes(value))) {
        queryPlanViolations += 1
    }
    const coreTerms = response.parsed_query.core_terms as string[]
    if ((fixture.expected_core_terms && fixture.expected_core_terms.join('|') !== coreTerms.join('|'))
        || (fixture.forbidden_core_terms || []).some(value => coreTerms.includes(value))) {
        coreTermContamination += 1
    }
    forbiddenDirectCodesReturned += response.results.filter(result => (
        result.match_strength === 'direct' && (fixture.forbidden_direct_codes || []).includes(result.code)
    )).length
    for (const result of response.results) {
        const standard = result.standard as Record<string, unknown>
        if ((expectedSubjects.length && !expectedSubjects.includes(String(standard.subject_slug)))
            || expectedExcludedSubjects.includes(String(standard.subject_slug))
            || (expectedGradeBands.length && !expectedGradeBands.includes(String(standard.grade_band)))) {
            hardFilterViolations += 1
        }
        if (!canonicalCodes.has(result.code)) hallucinatedCodes += 1
        if (result.requires_human_review !== true) missingReviewFlags += 1
        if ((fixture.forbidden_codes || []).includes(result.code)) forbiddenCodesReturned += 1
        if (!result.matched_concepts.length || !result.matched_fields.length) resultsWithoutTopicEvidence += 1
        if (result.match_strength !== 'direct' && result.match_strength !== 'supporting') invalidMatchStrength += 1
        if (!result.matched_fields.every(field => (
            typeof field.provenance === 'string'
            && typeof field.review_status === 'string'
            && typeof field.confidence === 'number'
            && Array.isArray(field.quality_flags)
        ))) missingEvidenceMetadata += 1
    }
}

const report = {
    evaluation: 'smart-search-relevance-contract-v2',
    cases: cases.length,
    returned,
    unexpected_empty_cases: unexpectedEmptyCases,
    unexpected_nonempty_cases: unexpectedNonemptyCases,
    hard_filter_violations: hardFilterViolations,
    hallucinated_codes: hallucinatedCodes,
    missing_review_flags: missingReviewFlags,
    missing_evidence_metadata: missingEvidenceMetadata,
    forbidden_codes_returned: forbiddenCodesReturned,
    nondeterministic_cases: nondeterministicCases,
    missing_expected_codes: missingExpectedCodes,
    unexpected_expected_only_codes: unexpectedExpectedOnlyCodes,
    results_without_topic_evidence: resultsWithoutTopicEvidence,
    invalid_match_strength: invalidMatchStrength,
    query_plan_violations: queryPlanViolations,
    core_term_contamination: coreTermContamination,
    forbidden_direct_codes_returned: forbiddenDirectCodesReturned,
    note: 'Contract, safety, topic-evidence and labelled regression checks. Expand teacher-labelled Precision@K/NDCG coverage as review decisions accumulate.'
}

console.log(JSON.stringify(report, null, 2))
if (
    unexpectedEmptyCases
    || unexpectedNonemptyCases
    || hardFilterViolations
    || hallucinatedCodes
    || missingReviewFlags
    || missingEvidenceMetadata
    || forbiddenCodesReturned
    || nondeterministicCases
    || missingExpectedCodes
    || unexpectedExpectedOnlyCodes
    || resultsWithoutTopicEvidence
        || invalidMatchStrength
        || queryPlanViolations
        || coreTermContamination
        || forbiddenDirectCodesReturned
    ) process.exitCode = 1
