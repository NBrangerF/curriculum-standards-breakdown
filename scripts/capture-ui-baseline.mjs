import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readdir, readFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const ROOT = resolve('.')
const INVENTORY_PATH = resolve('docs/baselines/2026-07-11-content-inventory.machine.json')
const DEFAULT_OUTPUT = resolve('docs/baselines/2026-07-12-ui-v2-local-five-viewport')
const OUTPUT_DIRECTORY = resolve(process.env.BASELINE_OUTPUT_DIR || DEFAULT_OUTPUT)
const BASE_URL = (process.env.BASELINE_BASE_URL || 'http://127.0.0.1:4175').replace(/\/$/u, '')
const BASELINE_TYPE = BASE_URL.includes('127.0.0.1') || BASE_URL.includes('localhost')
    ? 'local-preproduction'
    : 'deployed-environment'
const FROZEN_TIME = '2026-07-12T00:00:00.000Z'

const VIEWPORTS = Object.freeze([
    { id: 'desktop-1440x900', width: 1440, height: 900 },
    { id: 'tablet-1024x768', width: 1024, height: 768 },
    { id: 'tablet-768x1024', width: 768, height: 1024 },
    { id: 'mobile-390x844', width: 390, height: 844 },
    { id: 'mobile-360x800', width: 360, height: 800 }
])

const SEEDED_COLLECTION = Object.freeze({
    version: 1,
    collections: {
        'qa-collection': {
            id: 'qa-collection',
            name: '几何单元研究',
            description: '用于验证清单详情交互',
            createdAt: FROZEN_TIME,
            standardCodes: ['MA-D2-GE-003']
        }
    }
})

const sha256 = value => createHash('sha256').update(value).digest('hex')

async function listFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    const nested = await Promise.all(entries
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(async entry => {
            const path = join(directory, entry.name)
            return entry.isDirectory() ? listFiles(path) : [path]
        }))
    return nested.flat()
}

async function buildSourceFingerprint() {
    const files = [
        ...(await listFiles(resolve('src'))),
        resolve('index.html'),
        resolve('package.json'),
        resolve('package-lock.json'),
        resolve('public/data/manifest.json')
    ]
    const digest = createHash('sha256')
    for (const file of files.sort()) {
        digest.update(relative(ROOT, file))
        digest.update('\0')
        digest.update(await readFile(file))
        digest.update('\0')
    }
    return digest.digest('hex')
}

async function getGitSha() {
    return new Promise((resolvePromise, reject) => {
        const child = spawn('git', ['rev-parse', 'HEAD'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
        let output = ''
        let error = ''
        child.stdout.on('data', chunk => { output += chunk })
        child.stderr.on('data', chunk => { error += chunk })
        child.on('error', reject)
        child.on('close', code => code === 0 ? resolvePromise(output.trim()) : reject(new Error(error.trim())))
    })
}

async function waitForServer(url, timeoutMs = 120_000) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await fetch(url)
            if (response.ok) return
        } catch {
            // The local server is still starting.
        }
        await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
    }
    throw new Error(`Timed out waiting for ${url}`)
}

function startLocalServer() {
    if (process.env.BASELINE_BASE_URL) return null
    return spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4175'], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe']
    })
}

async function capture() {
    const inventory = JSON.parse(await readFile(INVENTORY_PATH, 'utf8'))
    const dataManifest = JSON.parse(await readFile(resolve('public/data/manifest.json'), 'utf8'))
    const localServer = startLocalServer()
    let browser

    if (localServer) {
        localServer.stdout.on('data', chunk => process.stdout.write(chunk))
        localServer.stderr.on('data', chunk => process.stderr.write(chunk))
    }

    try {
        await waitForServer(BASE_URL)
        const deploymentResponse = await fetch(BASE_URL)
        const deploymentBody = await deploymentResponse.text()
        const deployment = {
            status: deploymentResponse.status,
            etag: deploymentResponse.headers.get('etag'),
            lastModified: deploymentResponse.headers.get('last-modified'),
            vercelId: deploymentResponse.headers.get('x-vercel-id'),
            bodySha256: sha256(deploymentBody)
        }
        try {
            browser = await chromium.launch({ channel: 'chrome', headless: true })
        } catch {
            browser = await chromium.launch({ headless: true })
        }

        const context = await browser.newContext({
            locale: 'zh-CN',
            timezoneId: 'Asia/Shanghai',
            colorScheme: 'light',
            reducedMotion: 'reduce',
            viewport: { width: VIEWPORTS[0].width, height: VIEWPORTS[0].height }
        })

        await context.addInitScript(({ collection, frozenTime }) => {
            if (location.pathname === '/collections/qa-collection') {
                localStorage.setItem('curriculum-collections', JSON.stringify(collection))
            } else {
                localStorage.removeItem('curriculum-collections')
            }
            const NativeDate = Date
            const fixed = new NativeDate(frozenTime).valueOf()
            class FrozenDate extends NativeDate {
                constructor(...args) {
                    super(...(args.length ? args : [fixed]))
                }
                static now() { return fixed }
            }
            FrozenDate.parse = NativeDate.parse
            FrozenDate.UTC = NativeDate.UTC
            window.Date = FrozenDate
        }, { collection: SEEDED_COLLECTION, frozenTime: FROZEN_TIME })

        const page = await context.newPage()
        const consoleErrors = []
        const pageErrors = []
        page.on('console', message => {
            if (message.type() === 'error') consoleErrors.push(message.text())
        })
        page.on('pageerror', error => pageErrors.push(error.message))

        const artifacts = []
        for (const viewport of VIEWPORTS) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height })
            const viewportDirectory = join(OUTPUT_DIRECTORY, viewport.id)
            await mkdir(viewportDirectory, { recursive: true })

            for (const route of inventory.routes) {
                const errorStart = consoleErrors.length
                const pageErrorStart = pageErrors.length
                await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'domcontentloaded' })
                const mainContentAnchor = page.locator('#main-content')
                const mainContentAnchorPresent = await mainContentAnchor.count() > 0
                if (BASELINE_TYPE === 'local-preproduction') {
                    await mainContentAnchor.waitFor({ state: 'visible', timeout: 30_000 })
                } else {
                    await page.locator('main').first().waitFor({ state: 'visible', timeout: 30_000 })
                }
                let readyHeadingFound = true
                if (route.headings?.[0]) {
                    try {
                        await page.getByRole('heading', { name: route.headings[0], exact: true }).first().waitFor({
                            timeout: BASELINE_TYPE === 'local-preproduction' ? 20_000 : 6_000
                        })
                    } catch (error) {
                        readyHeadingFound = false
                        if (BASELINE_TYPE === 'local-preproduction') throw error
                    }
                }
                await page.evaluate(async () => {
                    await document.fonts.ready
                    await new Promise(resolvePromise => requestAnimationFrame(() => requestAnimationFrame(resolvePromise)))
                })
                await page.addStyleTag({ content: `
                    *, *::before, *::after {
                        caret-color: transparent !important;
                        animation-delay: 0s !important;
                        animation-duration: 0s !important;
                        transition-delay: 0s !important;
                        transition-duration: 0s !important;
                    }
                ` })

                const layout = await page.evaluate(() => ({
                    innerWidth: window.innerWidth,
                    scrollWidth: document.documentElement.scrollWidth,
                    scrollHeight: document.documentElement.scrollHeight
                }))
                const touchTargetAudit = await page.evaluate(() => {
                    const selector = [
                        'a[href]',
                        'button:not([disabled])',
                        'input:not([type="hidden"]):not([disabled])',
                        'select:not([disabled])',
                        'textarea:not([disabled])',
                        '[role="button"]:not([aria-disabled="true"])',
                        '[role="tab"]:not([aria-disabled="true"])',
                        '[role="checkbox"]:not([aria-disabled="true"])',
                        'summary'
                    ].join(',')
                    const targets = [...new Set(document.querySelectorAll(selector))]
                        .map(element => {
                            const label = ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)
                                ? element.closest('label')
                                : null
                            const hitElement = label || element
                            const rect = hitElement.getBoundingClientRect()
                            const style = getComputedStyle(hitElement)
                            const inlineTextLink = hitElement.tagName === 'A' && style.display === 'inline'
                            const exemptionReason = hitElement.tagName === 'A' && hitElement.closest('nav[aria-label="面包屑"]')
                                ? 'breadcrumb-inline-link'
                                : null
                            return {
                                tag: hitElement.tagName.toLowerCase(),
                                role: hitElement.getAttribute('role') || element.getAttribute('role'),
                                name: (
                                    element.getAttribute('aria-label') ||
                                    hitElement.getAttribute('aria-label') ||
                                    hitElement.querySelector('[aria-label]')?.getAttribute('aria-label') ||
                                    element.getAttribute('title') ||
                                    element.getAttribute('placeholder') ||
                                    hitElement.textContent ||
                                    element.tagName
                                ).trim().replace(/\s+/gu, ' ').slice(0, 120),
                                className: typeof hitElement.className === 'string' ? hitElement.className : '',
                                width: Math.round(rect.width * 100) / 100,
                                height: Math.round(rect.height * 100) / 100,
                                inlineTextLink,
                                exemptionReason,
                                visible: (
                                    rect.width > 0 &&
                                    rect.height > 0 &&
                                    !(rect.width <= 1 && rect.height <= 1) &&
                                    style.display !== 'none' &&
                                    style.visibility !== 'hidden' &&
                                    !element.closest('[aria-hidden="true"]')
                                )
                            }
                        })
                        .filter(target => target.visible && !target.inlineTextLink)
                    const auditedTargets = targets.filter(target => !target.exemptionReason)
                    return {
                        candidateCount: auditedTargets.length,
                        exemptionCount: targets.length - auditedTargets.length,
                        exemptions: targets.filter(target => target.exemptionReason),
                        below44: auditedTargets.filter(target => target.width < 44 || target.height < 44)
                    }
                })
                const inventoryChecks = {
                    headings: await Promise.all((route.headings || []).map(async name => ({
                        name,
                        present: await page.getByRole('heading', { name, exact: true }).count() > 0
                    }))),
                    buttons: await Promise.all((route.buttons || []).map(async name => ({
                        name,
                        present: await page.getByRole('button', { name, exact: true }).count() > 0
                    }))),
                    links: await Promise.all((route.links || []).map(async name => ({
                        name,
                        present: await page.getByRole('link', { name }).count() > 0
                    }))),
                    texts: await Promise.all((route.texts || []).map(async name => ({
                        name,
                        present: await page.getByText(name, { exact: true }).count() > 0
                    }))),
                    landmarks: await Promise.all((route.landmarks || []).map(async landmark => ({
                        ...landmark,
                        present: await page.getByRole(landmark.role, { name: landmark.name, exact: true }).count() > 0
                    }))),
                    queryParams: (route.queryParams || []).map(name => ({
                        name,
                        present: new URL(page.url()).searchParams.has(name)
                    }))
                }
                const missingInventoryItems = Object.entries(inventoryChecks)
                    .flatMap(([kind, items]) => items.filter(item => !item.present).map(item => ({ kind, name: item.name })))
                const filename = `${route.id}.png`
                const absolutePath = join(viewportDirectory, filename)
                await page.screenshot({ path: absolutePath, fullPage: false, animations: 'disabled' })
                const bytes = await readFile(absolutePath)
                artifacts.push({
                    routeId: route.id,
                    routeKey: route.routeKey,
                    path: route.path,
                    viewport: viewport.id,
                    width: viewport.width,
                    height: viewport.height,
                    file: relative(ROOT, absolutePath),
                    byteSize: (await stat(absolutePath)).size,
                    sha256: sha256(bytes),
                    horizontalOverflowPx: Math.max(0, layout.scrollWidth - layout.innerWidth),
                    documentHeight: layout.scrollHeight,
                    mainContentAnchorPresent,
                    readyHeadingFound,
                    missingInventoryItems,
                    touchTargetAudit,
                    consoleErrors: consoleErrors.slice(errorStart),
                    pageErrors: pageErrors.slice(pageErrorStart)
                })
                process.stdout.write(`captured ${viewport.id}/${filename}\n`)
            }
        }

        const browserVersion = browser.version()
        const manifest = {
            schemaVersion: 1,
            baselineType: BASELINE_TYPE,
            generatedAt: new Date().toISOString(),
            frozenApplicationTime: FROZEN_TIME,
            baseURL: BASE_URL,
            gitSha: await getGitSha(),
            sourceFingerprintSha256: BASELINE_TYPE === 'local-preproduction' ? await buildSourceFingerprint() : null,
            comparisonSourceFingerprintSha256: await buildSourceFingerprint(),
            dataManifestGeneratedAt: dataManifest.generated_at || null,
            deployment,
            browser: { name: 'Chromium', version: browserVersion },
            routeCount: inventory.routeCount,
            viewportCount: VIEWPORTS.length,
            artifactCount: artifacts.length,
            expectedArtifactCount: inventory.routeCount * VIEWPORTS.length,
            allRoutesCaptured: artifacts.length === inventory.routeCount * VIEWPORTS.length,
            allRoutesWithoutHorizontalOverflow: artifacts.every(artifact => artifact.horizontalOverflowPx === 0),
            allInventoryPresent: artifacts.every(artifact => artifact.missingInventoryItems.length === 0),
            inventoryFailureCount: artifacts.reduce((sum, artifact) => sum + artifact.missingInventoryItems.length, 0),
            touchTargetCandidateCount: artifacts.reduce((sum, artifact) => sum + artifact.touchTargetAudit.candidateCount, 0),
            touchTargetExemptionCount: artifacts.reduce((sum, artifact) => sum + artifact.touchTargetAudit.exemptionCount, 0),
            touchTargetFailureCount: artifacts.reduce((sum, artifact) => sum + artifact.touchTargetAudit.below44.length, 0),
            mobileTouchTargetCandidateCount: artifacts.filter(artifact => artifact.width <= 390).reduce((sum, artifact) => sum + artifact.touchTargetAudit.candidateCount, 0),
            mobileTouchTargetFailureCount: artifacts.filter(artifact => artifact.width <= 390).reduce((sum, artifact) => sum + artifact.touchTargetAudit.below44.length, 0),
            consoleErrorCount: artifacts.reduce((sum, artifact) => sum + artifact.consoleErrors.length, 0),
            pageErrorCount: artifacts.reduce((sum, artifact) => sum + artifact.pageErrors.length, 0),
            viewports: VIEWPORTS,
            artifacts
        }
        await writeFile(join(OUTPUT_DIRECTORY, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
        process.stdout.write(`${JSON.stringify({
            baselineType: manifest.baselineType,
            routeCount: manifest.routeCount,
            viewportCount: manifest.viewportCount,
            artifactCount: manifest.artifactCount,
            allRoutesCaptured: manifest.allRoutesCaptured,
            allRoutesWithoutHorizontalOverflow: manifest.allRoutesWithoutHorizontalOverflow,
            allInventoryPresent: manifest.allInventoryPresent,
            inventoryFailureCount: manifest.inventoryFailureCount,
            touchTargetCandidateCount: manifest.touchTargetCandidateCount,
            touchTargetExemptionCount: manifest.touchTargetExemptionCount,
            touchTargetFailureCount: manifest.touchTargetFailureCount,
            mobileTouchTargetCandidateCount: manifest.mobileTouchTargetCandidateCount,
            mobileTouchTargetFailureCount: manifest.mobileTouchTargetFailureCount,
            consoleErrorCount: manifest.consoleErrorCount,
            pageErrorCount: manifest.pageErrorCount,
            outputDirectory: relative(ROOT, OUTPUT_DIRECTORY)
        }, null, 2)}\n`)

        if (
            !manifest.allRoutesCaptured ||
            !manifest.allRoutesWithoutHorizontalOverflow ||
            !manifest.allInventoryPresent ||
            manifest.consoleErrorCount ||
            manifest.pageErrorCount
        ) {
            process.exitCode = 1
        }
    } finally {
        await browser?.close()
        localServer?.kill('SIGTERM')
    }
}

await capture()
