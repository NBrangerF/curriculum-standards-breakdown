import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buildStandardGraphModel } from '../src/graph/adapters/standardGraphAdapter.js'
import { buildCurriculumGraphModel } from '../src/graph/adapters/curriculumGraphAdapter.js'
import { GraphA11yController } from '../src/features/graph/GraphA11yController.js'
import { getGraphNodePositions } from '../src/features/graph/sigmaGraphAdapter.js'
import {
    buildProgressionPath,
    buildCompareSummary,
    findShortestPath,
    normalizeCompareSelection
} from '../src/features/graph/graphPath.js'
import {
    mergeGraphStateIntoURL,
    parseGraphStateFromURL
} from '../src/data/query.js'

const dataDirectory = resolve('public/data/by_subject')
const files = (await readdir(dataDirectory)).filter(file => file.endsWith('.json')).sort()
const subjectData = await Promise.all(files.map(async file => JSON.parse(await readFile(resolve(dataDirectory, file), 'utf8'))))
const skillsData = JSON.parse(await readFile(resolve('public/data/skills_meta.json'), 'utf8'))
const skills = skillsData.competencies || []
const data = subjectData[0]
const allStandards = subjectData.flatMap(subject => subject.standards || [])
const standard = data.standards.find(record => record.code && record.domain && record.subject_slug)
assert.ok(standard, 'a real standard fixture is required')

const model = buildStandardGraphModel(standard, { skills })
const controller = new GraphA11yController({
    model,
    selectedNodeId: model.meta.focusNodeId,
    relationTypes: ['contains', 'skill_alignment'],
    focusDepth: 2
})
const initial = controller.getSnapshot()
assert.equal(initial.selectedNode.id, model.meta.focusNodeId)
assert.ok(initial.relations.length > 0)
assert.ok(initial.visibleNodeIds.includes(model.meta.focusNodeId))
assert.match(initial.announcement, /个直接关系/)

const domainRelation = initial.relations.find(relation => relation.direction === 'incoming')
assert.ok(domainRelation, 'standard fixture must expose its containing domain')
assert.equal(controller.move('parent'), true)
assert.equal(controller.getSnapshot().selectedNode.id, domainRelation.node.id)
assert.equal(controller.move('child'), true)
assert.ok(controller.getSnapshot().selectedNode)

controller.setRelationTypes([])
assert.equal(controller.getSnapshot().relations.length, 0)
assert.equal(controller.getSnapshot().visibleNodeIds.length, 1)
controller.setRelationTypes(['contains', 'skill_alignment'])

let synchronizedNodeId = null
const unsubscribe = controller.subscribe(snapshot => { synchronizedNodeId = snapshot.selectedNodeId })
controller.selectNode(model.meta.focusNodeId)
assert.equal(synchronizedNodeId, model.meta.focusNodeId)
unsubscribe()

const legacyParams = new URLSearchParams('subjects=math&bands=H2&utm_source=shared&futureFlag=1')
const merged = mergeGraphStateIntoURL(legacyParams, {
    view: 'graph',
    subject: standard.subject_slug,
    gradeBand: standard.grade_band,
    domain: standard.domain,
    relationTypes: ['skill_alignment', 'contains', 'invalid_relation'],
    selectedNode: model.meta.focusNodeId,
    focusDepth: 2,
    analysis: 'progression',
    compareSelection: [standard.code, standard.code, 'SECOND-CODE']
})
assert.equal(merged.get('subjects'), 'math')
assert.equal(merged.get('bands'), 'H2')
assert.equal(merged.get('utm_source'), 'shared')
assert.equal(merged.get('futureFlag'), '1')
assert.equal(merged.get('relationTypes'), 'skill_alignment,contains')

const parsed = parseGraphStateFromURL(merged)
assert.equal(parsed.view, 'graph')
assert.equal(parsed.subject, standard.subject_slug)
assert.equal(parsed.focusDepth, 2)
assert.equal(parsed.analysis, 'progression')
assert.deepEqual(parsed.relationTypes, ['skill_alignment', 'contains'])
assert.deepEqual(parsed.compareSelection, [standard.code, 'SECOND-CODE'])

const cleared = mergeGraphStateIntoURL(merged, {})
assert.equal(cleared.get('view'), null)
assert.equal(cleared.get('selectedNode'), null)
assert.equal(cleared.get('utm_source'), 'shared')
assert.equal(cleared.get('futureFlag'), '1')

const curriculumModel = buildCurriculumGraphModel(allStandards, { skills })
const ts1Node = curriculumModel.nodes.find(node => node.id === 'skill:ts1')
assert.equal(ts1Node?.label, '批判性思维与问题解决')
assert.equal(ts1Node?.meta?.code, 'TS1')
assert.ok(ts1Node?.meta?.summary)
assert.deepEqual(ts1Node?.provenance, { source: 'skills_meta', field: 'name_cn' })
const semanticPositions = getGraphNodePositions(curriculumModel, { layoutMode: 'semantic' })
assert.equal(semanticPositions.size, curriculumModel.nodes.length)
for (const [nodeId, position] of semanticPositions) {
    assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y), `semantic position must be finite for ${nodeId}`)
}

const curriculumController = new GraphA11yController({
    model: curriculumModel,
    selectedNodeId: 'skill:ts1',
    relationTypes: ['contains', 'progression', 'skill_alignment'],
    focusDepth: 1
})
const curriculumSnapshot = curriculumController.getSnapshot()
assert.equal(curriculumSnapshot.selectedNodeId, 'skill:ts1')
assert.ok(curriculumSnapshot.visibleNodeIds.length > 100)
assert.ok(curriculumSnapshot.visibleNodeIds.length < curriculumModel.nodes.length)

const mathStandardId = 'standard:ma-d2-ge-003'
const subjectPath = findShortestPath(curriculumModel, {
    sourceId: 'subject:math',
    targetId: mathStandardId,
    relationTypes: ['contains']
})
assert.ok(subjectPath)
assert.equal(subjectPath.steps.length, 2)
assert.deepEqual(subjectPath.relationTypes, ['contains'])
assert.equal(findShortestPath(curriculumModel, {
    sourceId: 'subject:math',
    targetId: mathStandardId,
    relationTypes: ['skill_alignment']
}), null)

const normalizedCompare = normalizeCompareSelection([
    'subject:math',
    mathStandardId,
    mathStandardId,
    'missing:node',
    'skill:ts1',
    'skill:ts2',
    'skill:ts3'
], curriculumModel)
assert.deepEqual(normalizedCompare, ['subject:math', mathStandardId, 'skill:ts1', 'skill:ts2'])
const compareSummary = buildCompareSummary(curriculumModel, normalizedCompare, ['contains', 'skill_alignment'])
assert.equal(compareSummary.items.length, 4)

const progressionEdges = curriculumModel.edges.filter(edge => edge.type === 'progression')
const progressionSources = new Set(progressionEdges.map(edge => edge.source))
const progressionMiddleId = progressionEdges.find(edge => progressionSources.has(edge.target))?.target
assert.ok(progressionMiddleId, 'a real standard with previous and next progression edges is required')
const progressionPath = buildProgressionPath(curriculumModel, progressionMiddleId)
assert.ok(progressionPath)
assert.ok(progressionPath.before, 'progression path must expose an explicit previous standard')
assert.ok(progressionPath.after, 'progression path must expose an explicit next standard')
assert.equal(progressionPath.current.id, progressionMiddleId)
assert.equal(progressionPath.edges.every(edge => edge.type === 'progression' && edge.provenance?.field), true)

curriculumController.setHighlights({
    nodeIds: subjectPath.nodes.map(node => node.id),
    edgeIds: subjectPath.steps.map(step => step.edge.id),
    comparedNodeIds: normalizedCompare
})
const highlightedSnapshot = curriculumController.getSnapshot()
assert.ok(highlightedSnapshot.visibleNodeIds.includes(mathStandardId))
assert.equal(highlightedSnapshot.highlightedEdgeIds.length, 2)

console.log(JSON.stringify({
    graphModel: model.id,
    initialRelationCount: initial.relations.length,
    visibleAtDepthTwo: initial.visibleNodeIds.length,
    curriculumGraph: {
        nodes: curriculumModel.nodes.length,
        edges: curriculumModel.edges.length,
        positionedNodes: semanticPositions.size,
        ts1FocusScope: curriculumSnapshot.visibleNodeIds.length,
        subjectToStandardPathLength: subjectPath.steps.length,
        compareItems: compareSummary.items.length,
        progressionPathNodes: progressionPath.nodes.length
    },
    queryRoundTrip: parsed,
    preservedUnknownParameters: ['utm_source', 'futureFlag'],
    status: 'passed'
}, null, 2))
