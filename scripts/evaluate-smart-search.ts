import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { FileCurriculumRepository } from '../packages/curriculum-core/src/index.js'

type EvalCase = {
    id: string
    query: string
    subjects: string[]
    grade_bands: string[]
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
let emptyCases = 0

for (const fixture of cases) {
    const response = await repository.smartSearchStandards({ ...fixture, limit: 5, min_score: 0 })
    if (!response.results.length) emptyCases += 1
    returned += response.results.length
    for (const result of response.results) {
        const standard = result.standard as Record<string, unknown>
        if (!fixture.subjects.includes(String(standard.subject_slug)) || !fixture.grade_bands.includes(String(standard.grade_band))) {
            hardFilterViolations += 1
        }
        if (!canonicalCodes.has(result.code)) hallucinatedCodes += 1
        if (result.requires_human_review !== true) missingReviewFlags += 1
    }
}

const report = {
    evaluation: 'smart-search-contract-v1',
    cases: cases.length,
    returned,
    empty_cases: emptyCases,
    hard_filter_violations: hardFilterViolations,
    hallucinated_codes: hallucinatedCodes,
    missing_review_flags: missingReviewFlags,
    note: 'This is a contract evaluation, not a relevance benchmark. Teacher-labelled Recall@K/MRR comes later.'
}

console.log(JSON.stringify(report, null, 2))
if (emptyCases || hardFilterViolations || hallucinatedCodes || missingReviewFlags) process.exitCode = 1
