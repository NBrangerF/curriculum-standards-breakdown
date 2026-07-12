import assert from 'node:assert/strict'
import { evaluatePhase9Observation } from './lib/phase9-observation.mjs'

const healthy = {
    stage: 5,
    startedAt: '2026-07-12T00:00:00.000Z',
    endedAt: '2026-07-14T00:00:00.000Z',
    deploymentId: 'dpl_abc123',
    gitSha: '7f40269',
    routes: ['home', 'search', 'collections'],
    signedBy: 'release-owner',
    sampleAdequate: true,
    defects: { p0: 0, p1: 0, p2: 2 },
    metrics: {
        routeErrorRateDeltaPp: 0.05,
        taskCompletionDeltaPercent: -1,
        p75LcpMs: 2100,
        p75InpMs: 170,
        cls: 0.08,
        graphFallbackRatePercent: 0.5,
        frontendExceptionDeltaPercent: 5
    }
}
assert.equal(evaluatePhase9Observation(healthy).decision, 'advance')
assert.equal(evaluatePhase9Observation({ ...healthy, endedAt: '2026-07-13T00:00:00.000Z' }).decision, 'hold')
assert.equal(evaluatePhase9Observation({ ...healthy, sampleAdequate: false }).decision, 'hold')
assert.equal(evaluatePhase9Observation({ ...healthy, defects: { p0: 0, p1: 1 } }).decision, 'rollback')
assert.equal(evaluatePhase9Observation({ ...healthy, metrics: { ...healthy.metrics, p75InpMs: 350 } }).decision, 'rollback')
assert.equal(evaluatePhase9Observation({ ...healthy, stage: 20, routes: ['subject', 'standard', 'skillDetail'], endedAt: '2026-07-15T00:00:00.000Z' }).decision, 'advance')
assert.equal(evaluatePhase9Observation({ ...healthy, stage: 50, routes: ['skillsGraph', 'subjectGraph', 'compare', 'path'], endedAt: '2026-07-18T23:00:00.000Z' }).decision, 'hold')
assert.equal(evaluatePhase9Observation({ ...healthy, stage: 50, routes: ['skillsGraph', 'subjectGraph', 'compare', 'path'], endedAt: '2026-07-19T00:00:00.000Z' }).decision, 'advance')
assert.equal(evaluatePhase9Observation({ ...healthy, stage: 100, routes: ['all'], stableCycleCount: 1 }).decision, 'hold')
assert.equal(evaluatePhase9Observation({ ...healthy, stage: 100, routes: ['all'], stableCycleCount: 2 }).decision, 'advance')

const accelerated = {
    ...healthy,
    mode: 'accelerated',
    startedAt: '2026-07-12T10:00:00.000Z',
    endedAt: '2026-07-12T10:30:00.000Z',
    acceleratedEvidence: {
        cohortBuildMatrixPassed: true,
        fullQualityGatePassed: true,
        syntheticPerformanceGatePassed: true,
        productionReady: true,
        rollbackProbePassed: true,
        runtimeErrorCount: 0,
        acceleratedStableCycles: 0
    }
}
assert.equal(evaluatePhase9Observation(accelerated).decision, 'advance')
assert.equal(evaluatePhase9Observation({ ...accelerated, acceleratedEvidence: { ...accelerated.acceleratedEvidence, runtimeErrorCount: 1 } }).decision, 'rollback')
assert.equal(evaluatePhase9Observation({ ...accelerated, stage: 100, routes: ['all'], acceleratedEvidence: { ...accelerated.acceleratedEvidence, acceleratedStableCycles: 1 } }).decision, 'hold')
assert.equal(evaluatePhase9Observation({ ...accelerated, stage: 100, routes: ['all'], acceleratedEvidence: { ...accelerated.acceleratedEvidence, acceleratedStableCycles: 2 } }).decision, 'advance')

console.log(JSON.stringify({ stages: [5, 20, 50, 100], decisions: ['advance', 'hold', 'rollback'], status: 'passed' }, null, 2))
