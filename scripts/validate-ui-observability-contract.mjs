import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { UI_TASKS, buildUiTaskProperties, normalizeUiTask } from '../src/observability/uiTaskTelemetry.js'

assert.deepEqual(UI_TASKS, [
    'search_start',
    'search_results',
    'graph_open',
    'graph_ready',
    'graph_fallback',
    'favorite_toggle',
    'collection_create'
])
assert.equal(normalizeUiTask('unknown'), undefined)

const boundary = {
    dataset: { uiVersion: 'v2', uiRolloutPercentage: '5' }
}
const trigger = { closest: selector => selector === '[data-ui-route]' ? boundary : null }
const properties = buildUiTaskProperties('graph_open', trigger)
assert.deepEqual(properties, { task: 'graph_open', variant: 'v2:5%' })
assert.equal(Object.keys(properties).length, 2, 'Pro custom events may use at most two properties')
assert.equal(JSON.stringify(properties).includes('bucket'), false)
assert.equal(JSON.stringify(properties).includes('code'), false)
assert.equal(JSON.stringify(properties).includes('name'), false)

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
assert.match(appSource, /VITE_ENABLE_ANALYTICS === 'true'/)
assert.match(appSource, /VITE_ENABLE_SPEED_INSIGHTS === 'true'/)

async function sourceFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    const files = await Promise.all(entries.map(entry => {
        const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory)
        return entry.isDirectory() ? sourceFiles(url) : [url]
    }))
    return files.flat().filter(url => /\.(?:js|jsx)$/u.test(url.pathname))
}

const sources = await Promise.all((await sourceFiles(new URL('../src/', import.meta.url))).map(url => readFile(url, 'utf8')))
const source = sources.join('\n')
const declaredTasks = [...source.matchAll(/data-kb-telemetry-(?:task|state)="([a-z_]+)"/gu)].map(match => match[1])
assert.deepEqual([...new Set(declaredTasks)].sort(), [...UI_TASKS].filter(task => !['graph_ready'].includes(task)).sort())

console.log(JSON.stringify({ event: 'kebiao_task', tasks: UI_TASKS, properties: ['task', 'variant'], defaultEnabled: false, status: 'passed' }, null, 2))
