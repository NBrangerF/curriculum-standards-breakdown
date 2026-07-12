import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const read = path => readFile(resolve(path), 'utf8')
const packageJson = JSON.parse(await read('package.json'))
const homePage = await read('src/pages/HomePage.jsx')
const narrative = await read('src/components/HomeNarrativeSection.jsx')
const graphCanvas = await read('src/features/graph/GraphCanvas.jsx')
const viewTransition = await read('src/utils/viewTransition.js')
const motionProvider = await read('src/components/KebiaoMotionProvider.jsx')

assert.equal(packageJson.dependencies.gsap, '3.15.0')
assert.equal(packageJson.dependencies['@gsap/react'], '2.1.2')
assert.match(homePage, /lazy\(\(\) => import\('\.\.\/components\/HomeNarrativeSection\.jsx'\)\)/)
assert.match(narrative, /prefers-reduced-motion: no-preference/)
assert.match(narrative, /import styles from '\.\/HomeNarrativeSection\.module\.css'/)
assert.ok(narrative.includes("pin: `.${styles['home-narrative-stage']}`"))
assert.ok(narrative.includes("gsap.utils.toArray(`.${styles['home-narrative-step']}`)"))
assert.match(narrative, /scope: rootRef/)
assert.match(graphCanvas, /duration = animate && !reducedMotion \? 620 : 0/)
assert.match(graphCanvas, /framedGraphToViewport/)
assert.match(viewTransition, /prefers-reduced-motion: reduce/)
assert.match(motionProvider, /reducedMotion="user"/)

const sourceEntries = await readdir(resolve('src'), { recursive: true })
const gsapImporters = []
for (const entry of sourceEntries.filter(file => /\.(js|jsx)$/.test(file))) {
    const contents = await read(`src/${entry}`)
    if (/from ['"](?:gsap|@gsap\/react)/.test(contents)) gsapImporters.push(entry)
}
assert.deepEqual(gsapImporters.sort(), ['components/HomeNarrativeSection.jsx'])

console.log(JSON.stringify({
    gsap: packageJson.dependencies.gsap,
    gsapReact: packageJson.dependencies['@gsap/react'],
    importer: gsapImporters[0],
    homeLazyLoaded: true,
    narrativeStylesIsolated: true,
    graphCameraDurationMs: 620,
    reducedMotionContract: true,
    status: 'passed'
}, null, 2))
