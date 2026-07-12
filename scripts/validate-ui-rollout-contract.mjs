import assert from 'node:assert/strict'
import { isInRollout, parseRolloutPercentage, rolloutBucket } from '../src/config/uiV2Rollout.js'

assert.equal(parseRolloutPercentage('0'), 0)
assert.equal(parseRolloutPercentage('5%'), 5)
assert.equal(parseRolloutPercentage('20'), 20)
assert.equal(parseRolloutPercentage('100.0%'), 100)
assert.equal(parseRolloutPercentage('-1'), undefined)
assert.equal(parseRolloutPercentage('101'), undefined)
assert.equal(parseRolloutPercentage('true'), undefined)

const subjects = Array.from({ length: 10_000 }, (_, index) => `anonymous-${index}`)
const buckets = subjects.map(rolloutBucket)
assert.deepEqual(buckets, subjects.map(rolloutBucket), 'rollout buckets must be deterministic')
assert.equal(buckets.every(bucket => bucket >= 0 && bucket < 10_000), true)
assert.equal(subjects.every(subject => !isInRollout(subject, 0)), true)
assert.equal(subjects.every(subject => isInRollout(subject, 100)), true)

const observed = Object.fromEntries([5, 20, 50].map(percentage => {
    const enabled = subjects.filter(subject => isInRollout(subject, percentage)).length
    const tolerance = subjects.length * 0.02
    assert.equal(Math.abs(enabled - subjects.length * percentage / 100) <= tolerance, true)
    return [percentage, enabled]
}))

console.log(JSON.stringify({ subjects: subjects.length, observed, status: 'passed' }, null, 2))
