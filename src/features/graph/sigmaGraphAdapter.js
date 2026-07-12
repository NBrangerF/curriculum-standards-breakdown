import Graph from 'graphology'

const LOCAL_TYPE_STYLE = Object.freeze({
    subject: { color: '#8ea2ff', size: 13, lane: 1.25 },
    domain: { color: '#79a7d8', size: 10, lane: 0.5 },
    standard: { color: '#f4f7ff', size: 8, lane: -0.25 },
    skill: { color: '#7bc49b', size: 9, lane: -1.05 }
})

const GLOBAL_TYPE_STYLE = Object.freeze({
    subject: { color: '#8ea2ff', size: 11 },
    domain: { color: '#79a7d8', size: 6 },
    standard: { color: '#d8e0ef', size: 2.2 },
    skill: { color: '#7bc49b', size: 8 }
})

const GRADE_ORDER = Object.freeze({ H1: 1, H2: 2, H3: 3, H4G7: 4, H4G8: 5, H4G9: 6 })
const TAU = Math.PI * 2

function lanePosition(node, index, count) {
    const style = LOCAL_TYPE_STYLE[node.type] || LOCAL_TYPE_STYLE.standard
    const centeredIndex = index - (count - 1) / 2
    const spread = count <= 1 ? 0 : Math.min(0.46, 1.55 / Math.max(count - 1, 1))
    return { x: centeredIndex * spread, y: style.lane }
}

function groupNodes(nodes) {
    return nodes.reduce((groups, node) => {
        const group = groups.get(node.type) || []
        group.push(node)
        groups.set(node.type, group)
        return groups
    }, new Map())
}

function sorted(nodes = []) {
    return [...nodes].sort((a, b) => a.label.localeCompare(b.label, 'zh-CN') || a.id.localeCompare(b.id))
}

function createSemanticPositions(model) {
    const positions = new Map()
    const groups = groupNodes(model.nodes)
    const subjects = sorted(groups.get('subject'))
    const skills = sorted(groups.get('skill'))
    const domains = sorted(groups.get('domain'))
    const standards = sorted(groups.get('standard'))
    const subjectCenters = new Map()
    const domainCenters = new Map()

    subjects.forEach((node, index) => {
        const angle = -Math.PI / 2 + (index / Math.max(subjects.length, 1)) * TAU
        const position = { x: Math.cos(angle) * 9.5, y: Math.sin(angle) * 9.5 }
        positions.set(node.id, position)
        subjectCenters.set(node.meta?.slug, position)
    })

    skills.forEach((node, index) => {
        const angle = -Math.PI / 2 + (index / Math.max(skills.length, 1)) * TAU
        positions.set(node.id, { x: Math.cos(angle) * 1.75, y: Math.sin(angle) * 1.75 })
    })

    const domainsBySubject = new Map()
    for (const domain of domains) {
        const subjectSlug = domain.meta?.subjectSlug || ''
        const group = domainsBySubject.get(subjectSlug) || []
        group.push(domain)
        domainsBySubject.set(subjectSlug, group)
    }

    for (const [subjectSlug, subjectDomains] of domainsBySubject) {
        const center = subjectCenters.get(subjectSlug) || { x: 0, y: 0 }
        sorted(subjectDomains).forEach((node, index) => {
            const angle = (index / Math.max(subjectDomains.length, 1)) * TAU
            const position = {
                x: center.x + Math.cos(angle) * 1.55,
                y: center.y + Math.sin(angle) * 1.55
            }
            positions.set(node.id, position)
            domainCenters.set(`${subjectSlug}\u0000${node.label}`, position)
        })
    }

    const standardsByDomain = new Map()
    for (const standard of standards) {
        const key = `${standard.meta?.subjectSlug || ''}\u0000${standard.meta?.domain || ''}`
        const group = standardsByDomain.get(key) || []
        group.push(standard)
        standardsByDomain.set(key, group)
    }

    for (const [key, domainStandards] of standardsByDomain) {
        const center = domainCenters.get(key) || { x: 0, y: 0 }
        sorted(domainStandards).forEach((node, index) => {
            const gradeOffset = (GRADE_ORDER[node.meta?.gradeBand] || 0) * 0.11
            const angle = index * 2.3999632297 + gradeOffset
            const radius = 0.28 + Math.sqrt(index) * 0.15
            positions.set(node.id, {
                x: center.x + Math.cos(angle) * radius,
                y: center.y + Math.sin(angle) * radius
            })
        })
    }

    return positions
}

export function getGraphNodePositions(model, { layoutMode = 'local' } = {}) {
    if (layoutMode === 'semantic') return createSemanticPositions(model)

    const positions = new Map()
    const groups = groupNodes(model.nodes)
    for (const [type, nodes] of groups) {
        sorted(nodes).forEach((node, index) => {
            positions.set(node.id, lanePosition(node, index, nodes.length))
        })
    }
    return positions
}

export function graphModelToGraphology(model, { layoutMode = 'local' } = {}) {
    const graph = new Graph({ type: 'mixed', multi: true, allowSelfLoops: false })
    const positions = getGraphNodePositions(model, { layoutMode })
    const styles = layoutMode === 'semantic' ? GLOBAL_TYPE_STYLE : LOCAL_TYPE_STYLE

    for (const node of model.nodes) {
        const position = positions.get(node.id) || { x: 0, y: 0 }
        const style = styles[node.type] || styles.standard
        graph.addNode(node.id, {
            ...position,
            size: style.size,
            color: style.color,
            label: node.meta?.code || node.label,
            nodeType: node.type
        })
    }

    for (const edge of model.edges) {
        const attributes = {
            color: edge.type === 'progression' ? '#7183ac' : edge.type === 'skill_alignment' ? '#456b5d' : '#3a4964',
            size: layoutMode === 'semantic' ? (edge.type === 'progression' ? 0.8 : 0.42) : (edge.type === 'progression' ? 1.5 : 1),
            relationType: edge.type
        }
        if (edge.directed) graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, attributes)
        else graph.addUndirectedEdgeWithKey(edge.id, edge.source, edge.target, attributes)
    }

    return graph
}
