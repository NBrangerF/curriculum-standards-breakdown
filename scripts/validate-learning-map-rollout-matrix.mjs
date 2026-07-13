import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build, preview } from 'vite'
import { chromium } from '@playwright/test'
import { parseLearningMapStateFromURL } from '../src/data/query.js'
import { rolloutBucket } from '../src/config/uiV2Rollout.js'

const ROOT = resolve('.')
const OUTPUT_ROOT = resolve('tmp/learning-map-rollout-matrix')
const STANDARD_CODE = 'MA-D2-GE-003'
const ROLLOUT_SUBJECT_KEY = 'kebiao:learning-map:rollout-subject'
const MANAGED_ENV_KEYS = [
    'VITE_UI_V2_STANDARD',
    'VITE_LEARNING_MAP_STANDARD',
    'VITE_LEARNING_MAP_DEFAULT',
    'VITE_ENABLE_ANALYTICS',
    'VITE_ENABLE_SPEED_INSIGHTS'
]

function findCohort(percentage, expectedInside) {
    for (let index = 0; index < 100_000; index += 1) {
        const subject = `learning-map-matrix-${percentage}-${index}`
        const bucket = rolloutBucket(subject)
        if ((bucket < percentage * 100) === expectedInside) return { subject, bucket }
    }
    throw new Error(`Unable to find a ${expectedInside ? 'selected' : 'held-back'} rollout cohort`)
}

async function createContext(browser, subject) {
    const context = await browser.newContext()
    await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
        key: ROLLOUT_SUBJECT_KEY,
        value: subject
    })
    return context
}

async function expectRenderedMetadata(page, baseUrl, query, expected) {
    await page.goto(`${baseUrl}/standards/${STANDARD_CODE}?${query}`, { waitUntil: 'domcontentloaded' })
    const boundary = page.locator('[data-kb-route="standard"]')
    await boundary.waitFor({ timeout: 20_000 })
    assert.equal(await boundary.getAttribute('data-learning-map-version'), expected.version, 'rendered Learning Map version')
    assert.equal(await boundary.getAttribute('data-learning-map-flag-source'), expected.source, 'rendered Learning Map source')
    if (expected.percentage === undefined) {
        assert.equal(await boundary.getAttribute('data-learning-map-rollout-percentage'), null, 'query override clears rollout percentage')
        assert.equal(await boundary.getAttribute('data-learning-map-rollout-bucket'), null, 'query override clears rollout bucket')
        return
    }
    assert.equal(await boundary.getAttribute('data-learning-map-rollout-percentage'), String(expected.percentage), 'rendered rollout percentage')
    assert.equal(await boundary.getAttribute('data-learning-map-rollout-bucket'), String(expected.bucket), 'rendered rollout bucket')
}

assert.deepEqual(parseLearningMapStateFromURL(new URLSearchParams('view=learning-map&selectedNode=kp%3Ad&prerequisiteDepth=2&unlockDepth=1')), {
    view: 'learning-map',
    selectedNode: 'kp:d',
    prerequisiteDepth: 2,
    unlockDepth: 1
})

// This is a local build-time verification only. The checked build starts
// production-default-off and models a 5% standard-route environment setting;
// it neither modifies deployment configuration nor claims a live rollout.
const originalEnvironment = Object.fromEntries(MANAGED_ENV_KEYS.map(key => [key, process.env[key]]))
const percentage = 5
const inside = findCohort(percentage, true)
const outside = findCohort(percentage, false)
let browser
let server

await rm(OUTPUT_ROOT, { recursive: true, force: true })
try {
    process.env.VITE_UI_V2_STANDARD = 'true'
    process.env.VITE_LEARNING_MAP_DEFAULT = 'false'
    process.env.VITE_LEARNING_MAP_STANDARD = String(percentage)
    process.env.VITE_ENABLE_ANALYTICS = 'false'
    process.env.VITE_ENABLE_SPEED_INSIGHTS = 'false'
    await build({ root: ROOT, logLevel: 'error', build: { outDir: OUTPUT_ROOT, emptyOutDir: true } })
    server = await preview({
        root: ROOT,
        logLevel: 'error',
        build: { outDir: OUTPUT_ROOT },
        preview: { host: '127.0.0.1', port: 4365, strictPort: true }
    })
    const baseUrl = server.resolvedUrls.local[0].replace(/\/$/u, '')
    browser = await chromium.launch({ channel: 'chrome' })

    const insideContext = await createContext(browser, inside.subject)
    const insidePage = await insideContext.newPage()
    await expectRenderedMetadata(insidePage, baseUrl, 'view=learning-map', {
        version: 'learning-map',
        source: 'environment-rollout',
        percentage,
        bucket: inside.bucket
    })
    await insideContext.close()

    const outsideContext = await createContext(browser, outside.subject)
    const outsidePage = await outsideContext.newPage()
    await expectRenderedMetadata(outsidePage, baseUrl, 'view=learning-map', {
        version: 'legacy',
        source: 'environment-rollout',
        percentage,
        bucket: outside.bucket
    })
    await expectRenderedMetadata(outsidePage, baseUrl, 'view=learning-map&learning-map=0', {
        version: 'legacy',
        source: 'query'
    })
    await expectRenderedMetadata(outsidePage, baseUrl, 'view=learning-map&learning-map=1', {
        version: 'learning-map',
        source: 'query'
    })
    await outsideContext.close()
} finally {
    await browser?.close()
    if (server) await new Promise(resolvePromise => server.httpServer.close(resolvePromise))
    await rm(OUTPUT_ROOT, { recursive: true, force: true })
    for (const [key, value] of Object.entries(originalEnvironment)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
    }
}

console.log(JSON.stringify({
    status: 'passed',
    scenario: 'local-production-build-5-percent-standard-route',
    productionDefault: 'off',
    cohorts: { inside: inside.bucket, outside: outside.bucket },
    queryRollback: true
}, null, 2))
