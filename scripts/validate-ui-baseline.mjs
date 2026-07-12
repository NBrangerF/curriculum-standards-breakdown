import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve('.')
const BASELINE_DIRECTORY = resolve(
    process.env.BASELINE_OUTPUT_DIR || 'docs/baselines/2026-07-12-ui-v2-local-five-viewport'
)
const MANIFEST_PATH = join(BASELINE_DIRECTORY, 'manifest.json')

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

const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))
assert.equal(manifest.schemaVersion, 1)
assert.equal(manifest.routeCount, 12)
assert.equal(manifest.viewportCount, 5)
assert.equal(manifest.expectedArtifactCount, 60)
assert.equal(manifest.artifactCount, 60)
assert.equal(manifest.artifacts.length, 60)
assert.equal(manifest.allRoutesCaptured, true)
assert.equal(manifest.allRoutesWithoutHorizontalOverflow, true)
assert.equal(manifest.allInventoryPresent, true)
assert.equal(manifest.inventoryFailureCount, 0)
assert.equal(manifest.touchTargetFailureCount, 0)
assert.equal(manifest.mobileTouchTargetFailureCount, 0)
assert.equal(manifest.consoleErrorCount, 0)
assert.equal(manifest.pageErrorCount, 0)
assert.equal(manifest.sourceFingerprintSha256, await buildSourceFingerprint(), 'baseline source fingerprint is stale')

const keys = new Set()
for (const artifact of manifest.artifacts) {
    const key = `${artifact.viewport}\0${artifact.routeId}`
    assert.equal(keys.has(key), false, `duplicate baseline artifact ${key}`)
    keys.add(key)
    assert.equal(artifact.horizontalOverflowPx, 0, `${key} has horizontal overflow`)
    assert.deepEqual(artifact.missingInventoryItems, [], `${key} is missing inventory`)
    assert.deepEqual(artifact.consoleErrors, [], `${key} has console errors`)
    assert.deepEqual(artifact.pageErrors, [], `${key} has page errors`)
    assert.deepEqual(artifact.touchTargetAudit.below44, [], `${key} has touch targets below 44px`)

    const path = resolve(artifact.file)
    assert.equal(path.startsWith(`${BASELINE_DIRECTORY}/`), true, `${key} points outside the baseline directory`)
    const bytes = await readFile(path)
    assert.equal((await stat(path)).size, artifact.byteSize, `${key} byte size changed`)
    assert.equal(sha256(bytes), artifact.sha256, `${key} checksum changed`)
}

console.log(JSON.stringify({
    baselineType: manifest.baselineType,
    gitSha: manifest.gitSha,
    sourceFingerprintSha256: manifest.sourceFingerprintSha256,
    routes: manifest.routeCount,
    viewports: manifest.viewportCount,
    artifacts: manifest.artifactCount,
    inventoryFailures: manifest.inventoryFailureCount,
    horizontalOverflowFailures: manifest.artifacts.filter(artifact => artifact.horizontalOverflowPx).length,
    mobileTouchTargetCandidates: manifest.mobileTouchTargetCandidateCount,
    mobileTouchTargetFailures: manifest.mobileTouchTargetFailureCount,
    allViewportTouchTargetCandidates: manifest.touchTargetCandidateCount,
    allViewportTouchTargetFailures: manifest.touchTargetFailureCount,
    touchTargetExemptions: manifest.touchTargetExemptionCount,
    consoleErrors: manifest.consoleErrorCount,
    pageErrors: manifest.pageErrorCount,
    status: 'passed'
}, null, 2))
