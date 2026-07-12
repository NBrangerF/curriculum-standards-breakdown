export const PHASE9_STAGE_REQUIREMENTS = Object.freeze({
    '5': { minimumHours: 48, minimumStableCycles: 0 },
    '20': { minimumHours: 72, minimumStableCycles: 0 },
    '50': { minimumHours: 168, minimumStableCycles: 0 },
    '100': { minimumHours: 0, minimumStableCycles: 2 }
})

export const PHASE9_STAGE_ROUTES = Object.freeze({
    '5': ['home', 'search', 'collections'],
    '20': ['subject', 'standard', 'skillDetail'],
    '50': ['skillsGraph', 'subjectGraph', 'compare', 'path'],
    '100': ['all']
})

const METRIC_RULES = Object.freeze({
    routeErrorRateDeltaPp: { pass: value => value <= 0.1, rollback: value => value > 0.3 },
    taskCompletionDeltaPercent: { pass: value => value >= -2, rollback: value => value < -5 },
    p75LcpMs: { pass: value => value <= 2500, rollback: value => value > 3000 },
    p75InpMs: { pass: value => value <= 200, rollback: value => value > 300 },
    cls: { pass: value => value <= 0.1, rollback: value => value > 0.15 },
    graphFallbackRatePercent: { pass: value => value < 1, rollback: value => value >= 3 },
    frontendExceptionDeltaPercent: { pass: value => value <= 10, rollback: value => value > 25 }
})

function finiteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value)
}

export function observationHours(startedAt, endedAt) {
    const start = Date.parse(startedAt)
    const end = Date.parse(endedAt)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return undefined
    return (end - start) / 3_600_000
}

export function evaluatePhase9Observation(report) {
    const requirement = PHASE9_STAGE_REQUIREMENTS[String(report.stage)]
    if (!requirement) throw new Error(`Unsupported Phase 9 stage: ${report.stage}`)

    const hours = observationHours(report.startedAt, report.endedAt)
    const checks = []
    const accelerated = report.mode === 'accelerated'
    if (accelerated) {
        const evidence = report.acceleratedEvidence || {}
        checks.push({ key: 'cohortBuildMatrix', status: evidence.cohortBuildMatrixPassed === true ? 'pass' : 'hold', value: evidence.cohortBuildMatrixPassed })
        checks.push({ key: 'fullQualityGate', status: evidence.fullQualityGatePassed === true ? 'pass' : 'hold', value: evidence.fullQualityGatePassed })
        checks.push({ key: 'syntheticPerformanceGate', status: evidence.syntheticPerformanceGatePassed === true ? 'pass' : 'hold', value: evidence.syntheticPerformanceGatePassed })
        checks.push({ key: 'productionReady', status: evidence.productionReady === true ? 'pass' : 'hold', value: evidence.productionReady })
        checks.push({ key: 'rollbackProbe', status: evidence.rollbackProbePassed === true ? 'pass' : 'hold', value: evidence.rollbackProbePassed })
        checks.push({ key: 'runtimeErrors', status: evidence.runtimeErrorCount === 0 ? 'pass' : finiteNumber(evidence.runtimeErrorCount) ? 'rollback' : 'hold', value: evidence.runtimeErrorCount })
        if (String(report.stage) === '100') {
            checks.push({ key: 'acceleratedStableCycles', status: evidence.acceleratedStableCycles >= 2 ? 'pass' : 'hold', value: evidence.acceleratedStableCycles })
        }
    } else {
        checks.push({ key: 'observationDuration', status: finiteNumber(hours) && hours >= requirement.minimumHours ? 'pass' : 'hold', value: hours })
        checks.push({ key: 'sampleAdequate', status: report.sampleAdequate === true ? 'pass' : 'hold', value: report.sampleAdequate })
    }
    checks.push({ key: 'deploymentId', status: /^dpl_[A-Za-z0-9]+$/u.test(report.deploymentId || '') ? 'pass' : 'hold', value: report.deploymentId })
    checks.push({ key: 'gitSha', status: /^[a-f0-9]{7,40}$/u.test(report.gitSha || '') ? 'pass' : 'hold', value: report.gitSha })
    checks.push({ key: 'signedBy', status: typeof report.signedBy === 'string' && report.signedBy.trim() ? 'pass' : 'hold', value: report.signedBy })
    const expectedRoutes = PHASE9_STAGE_ROUTES[String(report.stage)]
    const actualRoutes = Array.isArray(report.routes) ? [...new Set(report.routes)].sort() : []
    checks.push({ key: 'routes', status: JSON.stringify(actualRoutes) === JSON.stringify([...expectedRoutes].sort()) ? 'pass' : 'hold', value: actualRoutes })
    checks.push({ key: 'p0', status: report.defects?.p0 === 0 ? 'pass' : finiteNumber(report.defects?.p0) ? 'rollback' : 'hold', value: report.defects?.p0 })
    checks.push({ key: 'p1', status: report.defects?.p1 === 0 ? 'pass' : finiteNumber(report.defects?.p1) ? 'rollback' : 'hold', value: report.defects?.p1 })
    if (!accelerated && requirement.minimumStableCycles) {
        checks.push({
            key: 'stableCycles',
            status: Number.isInteger(report.stableCycleCount) && report.stableCycleCount >= requirement.minimumStableCycles ? 'pass' : 'hold',
            value: report.stableCycleCount
        })
    }

    if (!accelerated) {
        for (const [key, rule] of Object.entries(METRIC_RULES)) {
            const value = report.metrics?.[key]
            const status = !finiteNumber(value) ? 'hold' : rule.rollback(value) ? 'rollback' : rule.pass(value) ? 'pass' : 'hold'
            checks.push({ key, status, value })
        }
    }

    const decision = checks.some(check => check.status === 'rollback')
        ? 'rollback'
        : checks.every(check => check.status === 'pass') ? 'advance' : 'hold'

    return { stage: String(report.stage), mode: accelerated ? 'accelerated' : 'live', decision, observationHours: hours, checks }
}
