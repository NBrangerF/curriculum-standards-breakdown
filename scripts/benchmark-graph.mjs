import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const port = 4176
const baseURL = `http://127.0.0.1:${port}`
const server = spawn('npm', ['--prefix', 'benchmarks/graph-engine', 'run', 'dev', '--', '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, BROWSER: 'none' }
})

let serverLog = ''
server.stdout.on('data', chunk => { serverLog += chunk })
server.stderr.on('data', chunk => { serverLog += chunk })

async function waitForServer() {
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
        try {
            const response = await fetch(baseURL)
            if (response.ok) return
        } catch {
            // Server is still starting.
        }
        await new Promise(resolve => setTimeout(resolve, 500))
    }
    throw new Error(`Graph benchmark server did not start.\n${serverLog}`)
}

async function stopServer() {
    if (server.exitCode !== null) return
    try {
        process.kill(-server.pid, 'SIGTERM')
    } catch {
        server.kill('SIGTERM')
    }
    await Promise.race([
        new Promise(resolve => server.once('exit', resolve)),
        new Promise(resolve => setTimeout(resolve, 5_000))
    ])
    server.stdout.destroy()
    server.stderr.destroy()
}

let browser
try {
    await waitForServer()
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-precise-memory-info'] })
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const results = []

    for (const size of [200, 500, 1000, 5000]) {
        await page.goto(`${baseURL}/?engine=sigma&size=${size}`, { waitUntil: 'networkidle' })
        await page.waitForFunction(() => ['complete', 'error'].includes(window.__KEBIAO_BENCHMARK__?.status), null, { timeout: 60_000 })
        const state = await page.evaluate(() => window.__KEBIAO_BENCHMARK__)
        if (state.status === 'error') throw new Error(`${size}-node benchmark failed: ${state.error}`)
        results.push(state.metrics)
    }

    const thousand = results.find(result => result.requestedSize === 1000)
    const stress = results.find(result => result.requestedSize === 5000)
    const gates = {
        thousandNodesPresent: thousand.actualNodeCount === 1000,
        thousandFirstInteractive: thousand.firstInteractiveMs <= 2500,
        thousandSelection: thousand.selectionLatencyMs <= 100,
        thousandMedianFps: thousand.medianFps >= 50,
        thousandHeap: !thousand.memory || thousand.memory.usedJSHeapMB <= 250,
        stressNodesPresent: stress.actualNodeCount === 5000,
        stressSelection: stress.selectionLatencyMs <= 150,
        stressMedianFps: stress.medianFps >= 45,
        stressHeap: !stress.memory || stress.memory.usedJSHeapMB <= 400
    }
    const report = { generatedAt: new Date().toISOString(), environment: 'local-headless-chromium', results, gates, passed: Object.values(gates).every(Boolean) }
    await mkdir('output/quality', { recursive: true })
    await writeFile('output/quality/graph-benchmark.json', `${JSON.stringify(report, null, 2)}\n`)
    console.log(JSON.stringify(report, null, 2))
    if (!report.passed) process.exitCode = 1
} finally {
    await browser?.close()
    await stopServer()
}
