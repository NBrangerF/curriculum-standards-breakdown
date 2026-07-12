import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const REFERENCE_DIRECTORY = resolve(
    process.env.BASELINE_REFERENCE_DIR || 'docs/baselines/2026-07-12-ui-v2-local-five-viewport'
)
const CANDIDATE_DIRECTORY = resolve(
    process.env.BASELINE_CANDIDATE_DIR || 'docs/baselines/2026-07-12-production-five-viewport'
)
const OUTPUT_PATH = resolve(
    process.env.BASELINE_COMPARISON_OUTPUT || 'docs/baselines/2026-07-12-production-vs-local-comparison.machine.json'
)

const sha256 = value => createHash('sha256').update(value).digest('hex')
const keyFor = artifact => `${artifact.viewport}\0${artifact.routeId}`

async function loadVerifiedManifest(directory) {
    const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'))
    for (const artifact of manifest.artifacts) {
        const bytes = await readFile(resolve(artifact.file))
        assert.equal(sha256(bytes), artifact.sha256, `${artifact.file} checksum changed`)
    }
    return manifest
}

const reference = await loadVerifiedManifest(REFERENCE_DIRECTORY)
const candidate = await loadVerifiedManifest(CANDIDATE_DIRECTORY)
assert.equal(reference.viewportCount, candidate.viewportCount)

const candidateByKey = new Map(candidate.artifacts.map(artifact => [keyFor(artifact), artifact]))
const referenceRouteIds = new Set(reference.artifacts.map(artifact => artifact.routeId))
const extraCandidateRouteIds = [...new Set(candidate.artifacts
    .map(artifact => artifact.routeId)
    .filter(routeId => !referenceRouteIds.has(routeId)))]
const comparisons = reference.artifacts.map(referenceArtifact => {
    const key = keyFor(referenceArtifact)
    const candidateArtifact = candidateByKey.get(key)
    assert.ok(candidateArtifact, `candidate is missing ${key}`)
    return {
        routeId: referenceArtifact.routeId,
        routeKey: referenceArtifact.routeKey,
        viewport: referenceArtifact.viewport,
        width: referenceArtifact.width,
        height: referenceArtifact.height,
        path: referenceArtifact.path,
        referenceFile: referenceArtifact.file,
        candidateFile: candidateArtifact.file,
        screenshotShaEqual: referenceArtifact.sha256 === candidateArtifact.sha256,
        referenceByteSize: referenceArtifact.byteSize,
        candidateByteSize: candidateArtifact.byteSize,
        byteSizeDelta: candidateArtifact.byteSize - referenceArtifact.byteSize,
        documentHeightDelta: candidateArtifact.documentHeight - referenceArtifact.documentHeight,
        candidateMainContentAnchorPresent: candidateArtifact.mainContentAnchorPresent,
        candidateReadyHeadingFound: candidateArtifact.readyHeadingFound,
        candidateMissingInventoryItems: candidateArtifact.missingInventoryItems,
        candidateHorizontalOverflowPx: candidateArtifact.horizontalOverflowPx,
        candidateConsoleErrors: candidateArtifact.consoleErrors,
        candidatePageErrors: candidateArtifact.pageErrors
    }
})

const perRoute = [...new Set(comparisons.map(item => item.routeId))].map(routeId => {
    const items = comparisons.filter(item => item.routeId === routeId)
    return {
        routeId,
        viewportCount: items.length,
        changedScreenshotCount: items.filter(item => !item.screenshotShaEqual).length,
        missingMainContentAnchorCount: items.filter(item => !item.candidateMainContentAnchorPresent).length,
        missingReadyHeadingCount: items.filter(item => !item.candidateReadyHeadingFound).length,
        inventoryFailureCount: items.reduce((sum, item) => sum + item.candidateMissingInventoryItems.length, 0),
        consoleErrorCount: items.reduce((sum, item) => sum + item.candidateConsoleErrors.length, 0),
        pageErrorCount: items.reduce((sum, item) => sum + item.candidatePageErrors.length, 0),
        horizontalOverflowFailureCount: items.filter(item => item.candidateHorizontalOverflowPx > 0).length
    }
})

const candidateMeetsV2Contract = (
    candidate.allRoutesCaptured &&
    extraCandidateRouteIds.length === 0 &&
    candidate.allRoutesWithoutHorizontalOverflow &&
    candidate.allInventoryPresent &&
    candidate.inventoryFailureCount === 0 &&
    candidate.consoleErrorCount === 0 &&
    candidate.pageErrorCount === 0 &&
    comparisons.every(item => item.candidateMainContentAnchorPresent && item.candidateReadyHeadingFound)
)

const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    reference: {
        type: reference.baselineType,
        baseURL: reference.baseURL,
        gitSha: reference.gitSha,
        sourceFingerprintSha256: reference.sourceFingerprintSha256,
        generatedAt: reference.generatedAt
    },
    candidate: {
        type: candidate.baselineType,
        baseURL: candidate.baseURL,
        deployment: candidate.deployment,
        generatedAt: candidate.generatedAt,
        routeCount: candidate.routeCount,
        extraRouteIds: extraCandidateRouteIds
    },
    routeCount: reference.routeCount,
    viewportCount: reference.viewportCount,
    matchedArtifactCount: comparisons.length,
    identicalScreenshotCount: comparisons.filter(item => item.screenshotShaEqual).length,
    changedScreenshotCount: comparisons.filter(item => !item.screenshotShaEqual).length,
    missingMainContentAnchorCount: comparisons.filter(item => !item.candidateMainContentAnchorPresent).length,
    missingReadyHeadingCount: comparisons.filter(item => !item.candidateReadyHeadingFound).length,
    inventoryFailureCount: candidate.inventoryFailureCount,
    horizontalOverflowFailureCount: comparisons.filter(item => item.candidateHorizontalOverflowPx > 0).length,
    consoleErrorCount: candidate.consoleErrorCount,
    pageErrorCount: candidate.pageErrorCount,
    candidateMeetsV2Contract,
    comparisonStatus: candidateMeetsV2Contract ? 'contract-aligned' : 'contract-drift',
    perRoute,
    comparisons
}

await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({
    comparisonStatus: report.comparisonStatus,
    candidateMeetsV2Contract: report.candidateMeetsV2Contract,
    routes: report.routeCount,
    viewports: report.viewportCount,
    matchedArtifacts: report.matchedArtifactCount,
    changedScreenshots: report.changedScreenshotCount,
    missingMainContentAnchors: report.missingMainContentAnchorCount,
    missingReadyHeadings: report.missingReadyHeadingCount,
    inventoryFailures: report.inventoryFailureCount,
    horizontalOverflowFailures: report.horizontalOverflowFailureCount,
    consoleErrors: report.consoleErrorCount,
    pageErrors: report.pageErrorCount,
    extraCandidateRoutes: report.candidate.extraRouteIds
}, null, 2))
