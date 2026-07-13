import { gzipSync } from 'node:zlib'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const assetsDirectory = resolve('dist/assets')
const files = await readdir(assetsDirectory)

// The pre-Learning Map entry baseline was frozen at 140KB gzip. Keep the
// supplementary route from adding more than 5KB to the initial application
// payload; its renderer has a separate route-only budget below.
const LEARNING_MAP_MAIN_BASELINE_GZIP_KB = 140
const LEARNING_MAP_MAX_MAIN_GROWTH_GZIP_KB = 5

const budgets = [
    {
        label: 'main',
        pattern: /^index-.*\.js$/,
        baselineGzipKB: LEARNING_MAP_MAIN_BASELINE_GZIP_KB,
        maxGrowthGzipKB: LEARNING_MAP_MAX_MAIN_GROWTH_GZIP_KB,
        maxGzipKB: LEARNING_MAP_MAIN_BASELINE_GZIP_KB + LEARNING_MAP_MAX_MAIN_GROWTH_GZIP_KB
    },
    { label: 'graph-canvas', pattern: /^GraphCanvas-.*\.js$/, maxGzipKB: 60 },
    { label: 'graph-workspace', pattern: /^SkillsGraphWorkspace-.*\.js$/, maxGzipKB: 30 },
    { label: 'home-narrative', pattern: /^HomeNarrativeSection-.*\.js$/, maxGzipKB: 60 },
    { label: 'learning-map-renderer', pattern: /^learningDagRendererDecision-.*\.js$/, maxGzipKB: 90 }
]

const results = []
for (const budget of budgets) {
    const filename = files.find(file => budget.pattern.test(file))
    if (!filename) throw new Error(`Missing production chunk for ${budget.label}`)
    const contents = await readFile(resolve(assetsDirectory, filename))
    const gzipKB = Number((gzipSync(contents).byteLength / 1024).toFixed(2))
    const growthGzipKB = budget.baselineGzipKB === undefined
        ? undefined
        : Number((gzipKB - budget.baselineGzipKB).toFixed(2))
    results.push({
        ...budget,
        pattern: String(budget.pattern),
        filename,
        gzipKB,
        growthGzipKB,
        passed: gzipKB <= budget.maxGzipKB
    })
}

const main = await readFile(resolve(assetsDirectory, results.find(result => result.label === 'main').filename), 'utf8')
// Dynamic import filenames are expected in the entry; the visual renderer and
// layout implementation are not. This catches a regression that keeps the
// renderer under 90KB but accidentally ships it in the initial route.
const lazyGraphLeak = [
    'graphology',
    'Sigma WebGL renderer',
    'allowInvalidContainer',
    'ReactFlow',
    'xyflow',
    'dagre'
].filter(marker => main.includes(marker))
const report = {
    results,
    learningMap: {
        mainBaselineGzipKB: LEARNING_MAP_MAIN_BASELINE_GZIP_KB,
        maxMainGrowthGzipKB: LEARNING_MAP_MAX_MAIN_GROWTH_GZIP_KB,
        maxLazyRendererGzipKB: 90
    },
    lazyGraphLeak,
    passed: results.every(result => result.passed) && lazyGraphLeak.length === 0
}
console.log(JSON.stringify(report, null, 2))

if (!report.passed) process.exitCode = 1
