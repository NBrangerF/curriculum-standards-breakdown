import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CurriculumApiError, CurriculumClient } from '../src/index.js'

test('CurriculumClient sends API key and JSON request body', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const client = new CurriculumClient({
        baseUrl: 'https://api.example.com/',
        apiKey: 'test_key',
        fetch: async (url, init = {}) => {
            calls.push({ url: String(url), init })
            return new Response(JSON.stringify({
                data: [{ code: 'SC-D2-SC-010' }],
                meta: { request_id: 'req_1', data_version: '2026.07.09', schema_version: '1.0.0', warnings: [] }
            }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
    })

    const response = await client.searchStandards({ subjects: ['science'], keyword: '观察' })
    assert.equal(response.data[0].code, 'SC-D2-SC-010')
    assert.equal(calls[0].url, 'https://api.example.com/api/v1/standards/search')
    const headers = calls[0].init.headers as Headers
    assert.equal(headers.get('x-api-key'), 'test_key')
    assert.equal(headers.get('content-type'), 'application/json')
    assert.equal(calls[0].init.body, JSON.stringify({ subjects: ['science'], keyword: '观察' }))
})

test('CurriculumClient builds query strings and raises API errors', async () => {
    const calls: string[] = []
    const client = new CurriculumClient({
        baseUrl: 'https://api.example.com',
        fetch: async url => {
            calls.push(String(url))
            return new Response(JSON.stringify({
                error: { code: 'forbidden_fieldset', message: 'Forbidden', details: [] },
                meta: { request_id: 'req_2' }
            }), { status: 403, headers: { 'content-type': 'application/json' } })
        }
    })

    await assert.rejects(
        () => client.getStandard('SC-D2-SC-010', { include: ['admin'] }),
        (error: unknown) => {
            assert.ok(error instanceof CurriculumApiError)
            assert.equal(error.status, 403)
            assert.equal(error.code, 'forbidden_fieldset')
            assert.equal(error.requestId, 'req_2')
            return true
        }
    )
    assert.equal(calls[0], 'https://api.example.com/api/v1/standards/SC-D2-SC-010?include=admin')
})

test('CurriculumClient exposes trusted search and stable plan alignment routes', async () => {
    const calls: string[] = []
    const client = new CurriculumClient({
        baseUrl: 'https://api.example.com',
        fetch: async (url) => {
            calls.push(String(url))
            return new Response(JSON.stringify({ data: {}, meta: { request_id: 'req_plan' } }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            })
        }
    })

    await client.smartSearchStandards({ query: '三四年级科学观察' })
    await client.parsePlan({ text: '三年级科学计划' })
    await client.validatePlan({ plan: { title: '计划', units: [] } })
    await client.matchPlanStandards({ plan: { title: '计划', units: [] } })
    await client.analyzePlanCoverage({ plan: { title: '计划', units: [] }, review_decisions: [] })
    await client.generateWeeklySchedule({
        plan: { title: '计划', units: [] },
        review_decisions: [{ unit_id: 'U1', code: 'SC-D2-SC-010', decision: 'accepted' }]
    })

    assert.deepEqual(calls, [
        'https://api.example.com/api/v1/standards/semantic-search',
        'https://api.example.com/api/v1/plans/parse',
        'https://api.example.com/api/v1/plans/validate',
        'https://api.example.com/api/v1/plans/match-standards',
        'https://api.example.com/api/v1/plans/analyze-coverage',
        'https://api.example.com/api/v1/plans/generate-weekly-schedule'
    ])
})

test('CurriculumClient exposes learning-resource queries in both directions', async () => {
    const calls: string[] = []
    const client = new CurriculumClient({
        baseUrl: 'https://api.example.com',
        fetch: async input => {
            calls.push(String(input))
            return new Response(JSON.stringify({ data: [], meta: { request_id: 'req_lr' } }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            })
        }
    })
    await client.listLearningResources({ subject: 'science', stage: 'G7-9', format: 'interactive', openLevel: 'open', query: '密度' })
    await client.getLearningResource('phet-density')
    await client.getLearningResourceStandards('phet-density')
    await client.getStandardLearningResources('SC-H4G7-SC-030')
    assert.equal(
        calls[0],
        `https://api.example.com/api/v1/learning-resources?subject=science&stage=G7-9&format=interactive&open_level=open&q=${encodeURIComponent('密度')}`
    )
    assert.equal(calls[1], 'https://api.example.com/api/v1/learning-resources/phet-density')
    assert.equal(calls[2], 'https://api.example.com/api/v1/learning-resources/phet-density/standards')
    assert.equal(calls[3], 'https://api.example.com/api/v1/standards/SC-H4G7-SC-030/learning-resources')
})
