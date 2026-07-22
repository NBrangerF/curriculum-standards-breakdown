import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
    buildLearningComponents,
    reconcileAlignmentLearningComponents
} from '../scripts/capability-graph/capabilityGraph.mjs'

const STANDARD_CODE = 'AR-H4G7-AA-006'
const STANDARD_TEXT = '能听辨合唱声部和乐队主奏或伴奏乐器音色；能描述其特点和表现作用；能辨别常见音乐结构及主调、复调音乐；能描述艺术要素并完成基础表现或创作。'

function record(standard = STANDARD_TEXT) {
    return {
        code: STANDARD_CODE,
        standard,
        assessment_evidence_type: '听辨记录、结构图示、比较分析'
    }
}

test('AR-H4G7-AA-006 uses source-bound atomic timbre components with stable IDs', () => {
    const first = buildLearningComponents(record())
    const second = buildLearningComponents(record())

    assert.deepEqual(first, second)
    assert.deepEqual(first.map(component => [component.component_id, component.label]), [
        ['lc_3388a8895a3f2c79', '听辨合唱声部音色'],
        ['lc_a06c9c5621c8f24f', '听辨乐队主奏乐器音色'],
        ['lc_bd5ec23ac168116b', '听辨乐队伴奏乐器音色'],
        ['lc_b5b9d364d9e05ce6', '描述所听辨音色的特点'],
        ['lc_c5186ef12fe84d72', '描述所听辨音色的表现作用'],
        ['lc_ef3900efde99cc34', '辨别常见音乐结构及主调、复调音乐'],
        ['lc_7d743ad862f5f3f2', '描述艺术要素'],
        ['lc_05977e8e783e831c', '完成基础表现或创作']
    ])
    assert.ok(first.slice(0, 5).every(component => component.method === 'source_bound_atomic_decomposition_v1'))
    assert.ok(first.every(component => STANDARD_TEXT.includes(component.source_refs[0].excerpt)))
    assert.ok(!first.some(component => ['lc_fc3d3aa20e471aa3', 'lc_17eee6bd658349fc'].includes(component.component_id)))
})

test('canonical standard text remains unchanged and regenerated data carries atomic components', () => {
    const payload = JSON.parse(readFileSync(new URL('../data/internal/by_subject/arts.json', import.meta.url), 'utf8'))
    const canonical = payload.standards.find(item => item.code === STANDARD_CODE)

    assert.equal(canonical.standard, STANDARD_TEXT)
    assert.deepEqual(canonical.learning_components.slice(0, 5).map(component => component.component_id), [
        'lc_3388a8895a3f2c79',
        'lc_a06c9c5621c8f24f',
        'lc_bd5ec23ac168116b',
        'lc_b5b9d364d9e05ce6',
        'lc_c5186ef12fe84d72'
    ])
})

test('source-bound decomposition fails closed when authoritative standard text changes', () => {
    assert.throws(
        () => buildLearningComponents(record(`${STANDARD_TEXT} 新增要求。`)),
        /source-bound atomic component decomposition is stale/u
    )
})

test('superseded alignment component IDs are filtered without guessing a one-to-many migration', () => {
    const current = buildLearningComponents(record())
    const reconciled = reconcileAlignmentLearningComponents({
        learning_component_ids: ['lc_fc3d3aa20e471aa3', 'lc_17eee6bd658349fc', 'lc_7d743ad862f5f3f2'],
        learning_components: [
            { component_id: 'lc_fc3d3aa20e471aa3', label: '听辨合唱声部和乐队主奏或伴奏乐器音色' },
            { component_id: 'lc_17eee6bd658349fc', label: '描述其特点和表现作用' },
            { component_id: 'lc_7d743ad862f5f3f2', label: '描述艺术要素' }
        ]
    }, current)

    assert.deepEqual(reconciled.learning_component_ids, ['lc_7d743ad862f5f3f2'])
    assert.deepEqual(reconciled.learning_components, [
        { component_id: 'lc_7d743ad862f5f3f2', label: '描述艺术要素' }
    ])
    assert.equal(reconciled.component_migration_required, true)
    assert.equal(reconciled.component_migration_policy, 'fail_closed_no_one_to_many_guess')
    assert.deepEqual(reconciled.superseded_learning_component_ids, [
        'lc_fc3d3aa20e471aa3',
        'lc_17eee6bd658349fc'
    ])
    assert.ok(!reconciled.learning_component_ids.includes('lc_3388a8895a3f2c79'))
})
