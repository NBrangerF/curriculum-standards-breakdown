import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const read = path => readFile(resolve(path), 'utf8')
const homePage = await read('src/pages/HomePage.jsx')
const subjectPage = await read('src/pages/SubjectPage.jsx')
const skyEngine = await read('src/features/starmap/skyEngine.js')
const ignite = await read('src/features/starmap/Ignite.module.css')
const graphCanvas = await read('src/features/graph/GraphCanvas.jsx')
const viewTransition = await read('src/utils/viewTransition.js')
const motionProvider = await read('src/components/KebiaoMotionProvider.jsx')

// One sky behind every route: home and subject pages claim it; reduced motion stills every star.
assert.match(homePage, /useSkyView\('home'/)
assert.match(subjectPage, /useSkyView\('subject'/)
assert.match(skyEngine, /prefers-reduced-motion: reduce/)
assert.match(ignite, /prefers-reduced-motion: reduce/)
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
assert.ok(!gsapImporters.includes('pages/HomePage.jsx'), 'the home page animates on the shared sky canvas, not gsap')

console.log(JSON.stringify({
    sharedSky: true,
    gsapImporters,
    graphCameraDurationMs: 620,
    reducedMotionContract: true,
    status: 'passed'
}, null, 2))
