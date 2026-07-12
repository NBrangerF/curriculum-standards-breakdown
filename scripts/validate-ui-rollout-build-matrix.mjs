import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build, preview } from 'vite'
import { chromium } from '@playwright/test'
import { rolloutBucket } from '../src/config/uiV2Rollout.js'

const ROOT = resolve('.')
const OUTPUT_ROOT = resolve('tmp/phase9-rollout-build-matrix')
const ROLLOUT_SUBJECT_KEY = 'kebiao:ui-v2:rollout-subject'
const ROUTES = [
    { key: 'home', path: '/', env: 'VITE_UI_V2_HOME' },
    { key: 'subject', path: '/subjects/math', env: 'VITE_UI_V2_SUBJECT' },
    { key: 'skills', path: '/skills', env: 'VITE_UI_V2_SKILLS' },
    { key: 'skillDetail', path: '/skills/TS1', env: 'VITE_UI_V2_SKILL_DETAIL' },
    { key: 'search', path: '/search', env: 'VITE_UI_V2_SEARCH' },
    { key: 'glossary', path: '/glossary', env: 'VITE_UI_V2_GLOSSARY' },
    { key: 'standard', path: '/standards/MA-D2-GE-003', env: 'VITE_UI_V2_STANDARD' },
    { key: 'collections', path: '/collections', env: 'VITE_UI_V2_COLLECTIONS' },
    { key: 'collectionDetail', path: '/collections/default', env: 'VITE_UI_V2_COLLECTION_DETAIL' },
    { key: 'print', path: '/print?codes=MA-D2-GE-003', env: 'VITE_UI_V2_PRINT' },
    { key: 'styleguide', path: '/styleguide', env: 'VITE_UI_V2_STYLEGUIDE' },
    { key: 'feedback', path: '/feedback', env: 'VITE_UI_V2_FEEDBACK' }
]
const ROUTE_ENV_KEYS = ROUTES.map(route => route.env)
const MANAGED_ENV_KEYS = ['VITE_UI_V2_DEFAULT', 'VITE_ENABLE_ANALYTICS', 'VITE_ENABLE_SPEED_INSIGHTS', ...ROUTE_ENV_KEYS]

const stage = (name, globalDefault, percentageByRoute = {}) => ({ name, globalDefault, percentageByRoute })
const STAGES = [
    stage('default-off', 'false'),
    stage('5', 'false', { home: 5, search: 5, collections: 5 }),
    stage('20', 'false', { home: 20, search: 20, collections: 20, subject: 20, standard: 20, skillDetail: 20 }),
    stage('50', 'false', { home: 50, search: 50, collections: 50, subject: 50, standard: 50, skillDetail: 50, skills: 50 }),
    stage('100', 'true')
]

function cohortSubjects(percentage) {
    let inside
    let outside
    for (let index = 0; index < 100_000 && (!inside || !outside); index += 1) {
        const subject = `matrix-${percentage}-${index}`
        const bucket = rolloutBucket(subject)
        if (!inside && bucket < percentage * 100) inside = { subject, bucket }
        if (!outside && bucket >= percentage * 100) outside = { subject, bucket }
    }
    assert.ok(inside && outside)
    return { inside, outside }
}

function applyStageEnvironment(stageConfig) {
    MANAGED_ENV_KEYS.forEach(key => delete process.env[key])
    process.env.VITE_UI_V2_DEFAULT = stageConfig.globalDefault
    process.env.VITE_ENABLE_ANALYTICS = 'false'
    process.env.VITE_ENABLE_SPEED_INSIGHTS = 'false'
    for (const route of ROUTES) {
        const percentage = stageConfig.percentageByRoute[route.key]
        if (percentage !== undefined) process.env[route.env] = String(percentage)
    }
}

async function createContext(browser, subject) {
    const context = await browser.newContext()
    await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: ROLLOUT_SUBJECT_KEY, value: subject })
    return context
}

async function assertRoute(page, baseUrl, route, expected) {
    await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'domcontentloaded' })
    const boundary = page.locator(`[data-ui-route="${route.key}"]`)
    await boundary.waitFor({ timeout: 20_000 })
    assert.equal(await boundary.getAttribute('data-ui-version'), expected.enabled ? 'v2' : 'legacy', `${route.key} version`)
    assert.equal(await boundary.getAttribute('data-ui-flag-source'), expected.source, `${route.key} source`)
    if (expected.percentage !== undefined) {
        assert.equal(await boundary.getAttribute('data-ui-rollout-percentage'), String(expected.percentage), `${route.key} percentage`)
        assert.equal(await boundary.getAttribute('data-ui-rollout-bucket'), String(expected.bucket), `${route.key} bucket`)
    }
}

const originalEnvironment = Object.fromEntries(MANAGED_ENV_KEYS.map(key => [key, process.env[key]]))
const results = []
let browser

await rm(OUTPUT_ROOT, { recursive: true, force: true })
try {
    browser = await chromium.launch({ channel: 'chrome' })
    for (const [index, stageConfig] of STAGES.entries()) {
        applyStageEnvironment(stageConfig)
        const outDir = resolve(OUTPUT_ROOT, stageConfig.name)
        await build({ root: ROOT, logLevel: 'error', build: { outDir, emptyOutDir: true } })
        const server = await preview({
            root: ROOT,
            logLevel: 'error',
            build: { outDir },
            preview: { host: '127.0.0.1', port: 4320 + index, strictPort: true }
        })
        const baseUrl = server.resolvedUrls.local[0].replace(/\/$/u, '')
        try {
            const percentage = Number(stageConfig.name)
            const cohorts = Number.isFinite(percentage) && percentage > 0 && percentage < 100
                ? cohortSubjects(percentage)
                : { inside: { subject: `matrix-${stageConfig.name}`, bucket: rolloutBucket(`matrix-${stageConfig.name}`) } }
            const cohortEntries = cohorts.outside ? Object.entries(cohorts) : [['inside', cohorts.inside]]

            for (const [cohortName, cohort] of cohortEntries) {
                const context = await createContext(browser, cohort.subject)
                const page = await context.newPage()
                for (const route of ROUTES) {
                    const routePercentage = stageConfig.percentageByRoute[route.key]
                    const enabled = routePercentage === undefined
                        ? stageConfig.globalDefault === 'true'
                        : cohortName === 'inside'
                    await assertRoute(page, baseUrl, route, {
                        enabled,
                        source: routePercentage === undefined ? 'environment' : 'environment-rollout',
                        percentage: routePercentage,
                        bucket: cohort.bucket
                    })
                }
                await context.close()
            }

            const overrideContext = await createContext(browser, cohorts.inside.subject)
            const overridePage = await overrideContext.newPage()
            await assertRoute(overridePage, baseUrl, { key: 'home', path: '/?ui-v2=0' }, { enabled: false, source: 'query' })
            await assertRoute(overridePage, baseUrl, { key: 'home', path: '/?ui-v2=1' }, { enabled: true, source: 'query' })
            assert.equal(await overridePage.locator('script[src*="insights"], script[src*="speed-insights"]').count(), 0, 'telemetry must remain disabled in the build matrix')
            await overrideContext.close()

            results.push({
                stage: stageConfig.name,
                routes: ROUTES.length,
                cohorts: cohortEntries.map(([name, value]) => ({ name, bucket: value.bucket })),
                queryRollbackProbe: true
            })
        } finally {
            await new Promise(resolvePromise => server.httpServer.close(resolvePromise))
        }
    }
} finally {
    await browser?.close()
    await rm(OUTPUT_ROOT, { recursive: true, force: true })
    for (const [key, value] of Object.entries(originalEnvironment)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
    }
}

console.log(JSON.stringify({ stages: results, status: 'passed' }, null, 2))
