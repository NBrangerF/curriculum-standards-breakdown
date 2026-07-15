import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
    UMAMI_EVENTS,
    classifySearchError,
    countBucket,
    isKebiaoProductionHost,
    normalizeInterpreterStatus,
    queryLengthBucket,
    rankBucket,
    sanitizeUmamiEvent,
    trackUmamiEvent
} from '../src/observability/umamiTelemetry.js'

assert.deepEqual(UMAMI_EVENTS, [
    'subject_open',
    'standard_open',
    'learning_map_open',
    'smart_search_open',
    'smart_search_submit',
    'smart_search_results',
    'smart_search_error',
    'smart_search_result_open',
    'collection_add',
    'collection_batch_add',
    'api_docs_open',
    'ui_search_start',
    'ui_search_results',
    'ui_graph_open',
    'ui_graph_ready',
    'ui_graph_fallback',
    'ui_favorite_toggle',
    'ui_collection_create'
])

assert.equal(isKebiaoProductionHost('kebiao.org'), true)
assert.equal(isKebiaoProductionHost('www.kebiao.org'), true)
assert.equal(isKebiaoProductionHost('preview.vercel.app'), false)
assert.equal(isKebiaoProductionHost('localhost'), false)

assert.deepEqual(
    sanitizeUmamiEvent('smart_search_submit', {
        query: '不要发送这段原始查询',
        query_length_bucket: '41-120',
        prompt: '也不要发送这段提示词'
    }),
    { eventName: 'smart_search_submit', properties: { query_length_bucket: '41-120' } }
)
assert.deepEqual(
    sanitizeUmamiEvent('standard_open', { standard_code: 'MA-D2-GE-003', student_name: '不应出现' }),
    { eventName: 'standard_open', properties: { standard_code: 'MA-D2-GE-003' } }
)
assert.equal(sanitizeUmamiEvent('unknown_event', { query: 'private' }), undefined)

assert.equal(queryLengthBucket('短查询'), '2-40')
assert.equal(queryLengthBucket('课'.repeat(41)), '41-120')
assert.equal(queryLengthBucket('课'.repeat(121)), '121-250')
assert.equal(queryLengthBucket('课'.repeat(251)), '251-500')
assert.equal(countBucket(0), '0')
assert.equal(countBucket(8), '4-10')
assert.equal(countBucket(40), '26+')
assert.equal(rankBucket(2), '1-3')
assert.equal(rankBucket(5), '4-6')
assert.equal(rankBucket(10), '7+')
assert.equal(normalizeInterpreterStatus('ok'), 'ok')
assert.equal(normalizeInterpreterStatus('unexpected'), 'unknown')
assert.equal(classifySearchError({ status: 503 }), 'server')
assert.equal(classifySearchError({ status: 422 }), 'client')
assert.equal(classifySearchError({ message: 'request timeout' }), 'timeout')

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8')
assert.match(indexSource, /src="https:\/\/cloud\.umami\.is\/script\.js"/u)
assert.match(indexSource, /data-website-id="aa120ad0-ee99-4ab5-8e66-0e539bb25c0b"/u)
assert.match(indexSource, /data-domains="kebiao\.org,www\.kebiao\.org"/u)
assert.match(indexSource, /data-exclude-search="true"/u)
assert.match(indexSource, /data-do-not-track="true"/u)
assert.match(indexSource, /data-performance="true"/u)

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
assert.match(appSource, /<UmamiRouteTelemetry \/>/u)
assert.match(appSource, /analyticsEnabled \|\| umamiEnabled/u)

const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
const previousUmami = globalThis.umami
const calls = []
try {
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { hostname: 'www.kebiao.org' } })
    globalThis.umami = { track: (...args) => calls.push(args) }
    assert.equal(trackUmamiEvent('smart_search_submit', {
        query: 'private',
        query_length_bucket: '2-40'
    }), true)
    assert.deepEqual(calls, [['smart_search_submit', { query_length_bucket: '2-40' }]])

    Object.defineProperty(globalThis, 'location', { configurable: true, value: { hostname: 'localhost' } })
    assert.equal(trackUmamiEvent('smart_search_submit', { query_length_bucket: '2-40' }), false)
    assert.equal(calls.length, 1)
} finally {
    if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation)
    else delete globalThis.location
    if (previousUmami === undefined) delete globalThis.umami
    else globalThis.umami = previousUmami
}

console.log(JSON.stringify({
    provider: 'umami-cloud',
    website: 'kebiao.org',
    events: UMAMI_EVENTS.length,
    rawQueryCollection: false,
    productionDomainsOnly: true,
    status: 'passed'
}, null, 2))
