#!/usr/bin/env node
// Checks every curated link from this machine's own network and records china_access and checked_at.
// Run it without the shell proxy so the result reflects a mainland connection:
//
//   env -u HTTPS_PROXY -u HTTP_PROXY npm run learning-resources:check-links
//
// Options: --dry-run (report only), --only id1,id2
//
// china_access: direct   = answered within SLOW_MS on both tries
//               unstable = answered, but slowly or only on one try
//               blocked  = no answer on either try (DNS, connect or TLS failure, or timeout)
// Any HTTP answer counts as reachable, including a bot wall's 403 or 429. A 404 or 410 is a dead link.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CURATED = join(ROOT, 'data/learning-resources/curated')
const USER_AGENT = 'kebiao-link-check/1.0 (+https://www.kebiao.org)'
const TIMEOUT_MS = 20_000
const SLOW_MS = 8_000
const CONCURRENCY = 6

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const only = new Set((args[args.indexOf('--only') + 1] || '').split(',').filter(Boolean))
if (!args.includes('--only')) only.clear()

for (const name of ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy', 'ALL_PROXY', 'all_proxy']) {
    if (process.env[name]) console.warn(`warning: ${name} is set; unset it so the check uses the direct network`)
}

async function probe(url) {
    const started = Date.now()
    try {
        const response = await fetch(url, {
            redirect: 'follow',
            headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,*/*' },
            signal: AbortSignal.timeout(TIMEOUT_MS)
        })
        await response.body?.cancel()
        return { ok: true, status: response.status, ms: Date.now() - started }
    } catch (error) {
        return { ok: false, error: error?.cause?.code || error?.name || 'error', ms: Date.now() - started }
    }
}

// flk.npc.gov.cn detail pages are a JavaScript app that answers 200 for any id, so ask its search API
// whether the id is a law that is currently in force (sxx 3 = 有效).
async function verifyLawDatabaseLink(url) {
    const { searchParams } = new URL(url)
    const id = searchParams.get('id')
    const title = searchParams.get('title')
    if (!id || !title) return 'missing id or title'
    try {
        const response = await fetch('https://flk.npc.gov.cn/law-search/search/list', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
            body: JSON.stringify({
                searchRange: 1, sxrq: [], gbrq: [], searchType: 1, sxx: [], gbrqYear: [], flfgCodeId: [], zdjgCodeId: [],
                searchContent: title, pageNum: 1, pageSize: 20
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS)
        })
        const rows = (await response.json()).rows || []
        const row = rows.find(item => item.bbbs === id)
        if (!row) return `id not found for ${title}`
        return row.sxx === 3 ? '' : `law status is ${row.sxx}, not in force`
    } catch (error) {
        return `search API failed: ${error?.name || error}`
    }
}

async function checkResource(resource) {
    const first = await probe(resource.url)
    const second = await probe(resource.url)
    const answers = [first, second].filter(result => result.ok)
    const statuses = answers.map(result => result.status)
    let access = 'blocked'
    if (answers.length === 2) access = Math.max(first.ms, second.ms) > SLOW_MS ? 'unstable' : 'direct'
    else if (answers.length === 1) access = 'unstable'

    let problem = ''
    if (statuses.some(status => status === 404 || status === 410)) problem = `dead link (${statuses.join('/')})`
    else if (new URL(resource.url).hostname === 'flk.npc.gov.cn' && answers.length) problem = await verifyLawDatabaseLink(resource.url)
    return {
        id: resource.id,
        access,
        problem,
        detail: [first, second].map(result => (result.ok ? `${result.status} ${result.ms}ms` : `${result.error} ${result.ms}ms`)).join(', ')
    }
}

async function mapLimit(items, limit, task) {
    const results = new Array(items.length)
    let next = 0
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++
            results[index] = await task(items[index])
        }
    }))
    return results
}

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
const files = readdirSync(CURATED).filter(name => name.endsWith('.json')).sort()
const documents = files.map(file => ({ file, data: JSON.parse(readFileSync(join(CURATED, file), 'utf8')) }))
const targets = documents.flatMap(document => document.data.resources).filter(resource => !only.size || only.has(resource.id))

const results = await mapLimit(targets, CONCURRENCY, checkResource)
const byId = new Map(results.map(result => [result.id, result]))
for (const result of results) {
    const flag = result.problem ? `  ✗ ${result.problem}` : ''
    console.log(`${result.access.padEnd(8)} ${result.id.padEnd(44)} ${result.detail}${flag}`)
}

if (!dryRun) {
    for (const document of documents) {
        let changed = false
        for (const resource of document.data.resources) {
            const result = byId.get(resource.id)
            if (!result || result.problem) continue
            resource.china_access = result.access
            resource.checked_at = today
            changed = true
        }
        if (changed) writeFileSync(join(CURATED, document.file), `${JSON.stringify(document.data, null, 2)}\n`)
    }
}

const tally = results.reduce((counts, result) => ({ ...counts, [result.access]: (counts[result.access] || 0) + 1 }), {})
const failures = results.filter(result => result.problem)
console.log(`\n${results.length} links: ${JSON.stringify(tally)}${failures.length ? `, ${failures.length} failing` : ''}`)
if (failures.length) process.exit(1)
