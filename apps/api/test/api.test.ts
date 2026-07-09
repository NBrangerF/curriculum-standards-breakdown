import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { rm } from 'node:fs/promises'
import { FileCurriculumRepository } from '@curriculum/core'
import { createApp } from '../src/app.js'

const dataRoot = resolve(process.cwd(), '../../public/data')
const app = createApp(new FileCurriculumRepository(dataRoot))

async function json(response: Response) {
    return response.json() as Promise<Record<string, any>>
}

test('GET /api/v1/meta returns data summary', async () => {
    const response = await app.request('/api/v1/meta')
    assert.equal(response.status, 200)
    assert.ok(response.headers.get('x-ratelimit-limit'))
    const body = await json(response)
    assert.equal(body.data.standard_count, 2025)
    assert.equal(body.meta.data_version, '2026.07.09')
    assert.ok(body.meta.request_id)
})

test('GET /api/v1/health returns service health', async () => {
    const response = await app.request('/api/v1/health')
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    const body = await json(response)
    assert.equal(body.data.status, 'ok')
    assert.equal(body.data.data_version, '2026.07.09')
})

test('OPTIONS preflight returns CORS headers', async () => {
    const response = await app.request('/api/v1/health', {
        method: 'OPTIONS',
        headers: { origin: 'https://example.com' }
    })
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
    assert.match(response.headers.get('access-control-allow-methods') || '', /POST/)
})

test('GET /api/v1/openapi.yaml and /api/v1/docs expose API documentation', async () => {
    const specResponse = await app.request('/api/v1/openapi.yaml')
    assert.equal(specResponse.status, 200)
    assert.match(await specResponse.text(), /Curriculum Intelligence API/)

    const docsResponse = await app.request('/api/v1/docs')
    assert.equal(docsResponse.status, 200)
    assert.match(await docsResponse.text(), /SwaggerUIBundle/)
})

test('GET /api/v1/metrics requires admin tier', async () => {
    const forbidden = await app.request('/api/v1/metrics')
    assert.equal(forbidden.status, 403)

    process.env.CURRICULUM_ADMIN_API_KEYS = 'metrics_test_key'
    const response = await app.request('/api/v1/metrics', {
        headers: { 'x-api-key': 'metrics_test_key' }
    })
    delete process.env.CURRICULUM_ADMIN_API_KEYS
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.ok(body.data.memory.total_requests >= 1)
})

test('metrics can persist sanitized request events to file', async () => {
    const metricsFile = '/tmp/curriculum-api-test-metrics.ndjson'
    await rm(metricsFile, { force: true })
    process.env.CURRICULUM_ADMIN_API_KEYS = 'metrics_file_test_key'
    process.env.CURRICULUM_METRICS_FILE = metricsFile
    await app.request('/api/v1/health')
    const response = await app.request('/api/v1/metrics', {
        headers: { 'x-api-key': 'metrics_file_test_key' }
    })
    delete process.env.CURRICULUM_ADMIN_API_KEYS
    delete process.env.CURRICULUM_METRICS_FILE
    await rm(metricsFile, { force: true })

    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.sink, 'file')
    assert.ok(body.data.persistent.total_requests >= 1)
    assert.equal('body' in body.data.persistent, false)
})

test('GET /api/v1/standards/:code returns public standard without admin fields', async () => {
    const response = await app.request('/api/v1/standards/AR-D1-AA-MU-007')
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.code, 'AR-D1-AA-MU-007')
    assert.equal('review_status' in body.data, false)
})

test('GET /api/v1/standards/:code returns 404 for missing code', async () => {
    const response = await app.request('/api/v1/standards/NOPE-404')
    assert.equal(response.status, 404)
    const body = await json(response)
    assert.equal(body.error.code, 'not_found')
})

test('POST /api/v1/standards/search filters by subject and keyword', async () => {
    const response = await app.request('/api/v1/standards/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            subjects: ['science'],
            keyword: '观察',
            limit: 3
        })
    })
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.ok(body.meta.total > 0)
    assert.ok(body.data.length <= 3)
    assert.equal(body.data[0].subject_slug, 'science')
})

test('POST /api/v1/standards/batch returns found items and missing codes', async () => {
    const response = await app.request('/api/v1/standards/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            codes: ['AR-D1-AA-MU-007', 'NOPE-404']
        })
    })
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.length, 1)
    assert.deepEqual(body.meta.missing, ['NOPE-404'])
})

test('GET /api/v1/subjects/:subject_slug/domains returns taxonomy', async () => {
    const response = await app.request('/api/v1/subjects/science/domains')
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.subject_slug, 'science')
    assert.ok(body.data.domains.length > 0)
})

test('GET /api/v1/standards/:code/neighbors returns adjacent standards', async () => {
    const response = await app.request('/api/v1/standards/SC-D2-SC-010/neighbors')
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.relationships.previous.code, 'SC-D1-SC-014')
    assert.equal(body.data.relationships.next.code, 'SC-D3-SC-010')
})

test('GET /api/v1/standards/:code/evidence returns bounded evidence summary', async () => {
    const response = await app.request('/api/v1/standards/SC-H4G7-AR-001/evidence')
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.code, 'SC-H4G7-AR-001')
    assert.ok(body.data.evidence_counts.textbook > 0)
})

test('POST /api/v1/standards/compare returns common and different fields', async () => {
    const response = await app.request('/api/v1/standards/compare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            codes: ['SC-D1-SC-014', 'SC-D2-SC-010']
        })
    })
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.standards.length, 2)
    assert.ok('grade_band' in body.data.different_fields)
})

test('fieldsets above public require API tier access', async () => {
    const response = await app.request('/api/v1/standards/AR-D1-AA-MU-007?include=admin')
    assert.equal(response.status, 403)
    const body = await json(response)
    assert.equal(body.error.code, 'forbidden_fieldset')
})

test('POST /api/v1/plans/parse parses plain text conservatively', async () => {
    const response = await app.request('/api/v1/plans/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            text: '三年级科学植物观察计划\n学科：科学\n年级：三年级\n单元一：植物生命周期观察'
        })
    })
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.plan.subject_slug, 'science')
    assert.equal(body.data.plan.grade_band, 'H2')
    assert.equal(body.data.source, 'text')
})

test('POST /api/v1/matching/plan-to-standards returns explainable real-code matches', async () => {
    const response = await app.request('/api/v1/matching/plan-to-standards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
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
            },
            top_k_per_unit: 3,
            min_score: 0.2
        })
    })
    assert.equal(response.status, 200)
    const body = await json(response)
    assert.equal(body.data.units.length, 1)
    assert.ok(body.data.units[0].matches.length > 0)
    assert.match(body.data.units[0].matches[0].code, /^SC-/)
    assert.ok(body.data.units[0].matches[0].matched_fields.length > 0)
})

test('POST /api/v1/coverage/analyze and /api/v1/schedules/weekly support planning workflows', async () => {
    const plan = {
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

    const coverageResponse = await app.request('/api/v1/coverage/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan, top_k_per_unit: 3, min_score: 0.2 })
    })
    assert.equal(coverageResponse.status, 200)
    const coverage = await json(coverageResponse)
    assert.ok(coverage.data.covered_standard_codes.length > 0)

    const scheduleResponse = await app.request('/api/v1/schedules/weekly', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan, teaching_weeks: 2, lessons_per_week: 2, top_k_per_unit: 3, min_score: 0.2 })
    })
    assert.equal(scheduleResponse.status, 200)
    const schedule = await json(scheduleResponse)
    assert.equal(schedule.data.length, 2)
    assert.ok(schedule.data[0].standard_codes.length > 0)
})
