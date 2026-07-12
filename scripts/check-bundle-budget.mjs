import { gzipSync } from 'node:zlib'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const assetsDirectory = resolve('dist/assets')
const files = await readdir(assetsDirectory)

const budgets = [
    { label: 'main', pattern: /^index-.*\.js$/, maxGzipKB: 150 },
    { label: 'graph-canvas', pattern: /^GraphCanvas-.*\.js$/, maxGzipKB: 60 },
    { label: 'graph-workspace', pattern: /^SkillsGraphWorkspace-.*\.js$/, maxGzipKB: 30 },
    { label: 'home-narrative', pattern: /^HomeNarrativeSection-.*\.js$/, maxGzipKB: 60 }
]

const results = []
for (const budget of budgets) {
    const filename = files.find(file => budget.pattern.test(file))
    if (!filename) throw new Error(`Missing production chunk for ${budget.label}`)
    const contents = await readFile(resolve(assetsDirectory, filename))
    const gzipKB = Number((gzipSync(contents).byteLength / 1024).toFixed(2))
    results.push({ ...budget, pattern: String(budget.pattern), filename, gzipKB, passed: gzipKB <= budget.maxGzipKB })
}

const main = await readFile(resolve(assetsDirectory, results.find(result => result.label === 'main').filename), 'utf8')
// Dynamic import filenames are expected in the entry; implementation markers are not.
const lazyGraphLeak = ['graphology', 'Sigma WebGL renderer', 'allowInvalidContainer'].filter(marker => main.includes(marker))
const report = { results, lazyGraphLeak, passed: results.every(result => result.passed) && lazyGraphLeak.length === 0 }
console.log(JSON.stringify(report, null, 2))

if (!report.passed) process.exitCode = 1
