const DEFAULT_MANIFEST_URL = '/data/knowledge_graph/manifest.json'
let cachedGraph
let loadingGraph

export function resolveKnowledgeGraphFileURL(manifestUrl, file) {
    if (!file) throw new Error('Knowledge graph manifest file path is required')
    if (/^https?:\/\//u.test(file) || file.startsWith('/')) return file
    const base = String(manifestUrl).slice(0, String(manifestUrl).lastIndexOf('/') + 1)
    return `${base}${file}`
}

async function fetchJson(url, signal) {
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error(`Failed to load Learning Map data: ${response.status} ${response.statusText}`)
    return response.json()
}

const toArray = (payload, key) => Array.isArray(payload) ? payload : (payload?.[key] || [])

const assertPublishableCollection = (records, label, publicationStatus) => {
    const allowed = publicationStatus === 'public_preview'
        ? new Set(['approved', 'candidate'])
        : new Set(['approved'])
    const unpublishable = records.find(record => !allowed.has(record?.reviewStatus))
    if (unpublishable) throw new Error(`Learning Map ${label} contains non-publishable record: ${unpublishable.id || 'unknown'}`)
}

export function findApprovedKnowledgePointsByStandard(knowledgePoints, standardCode) {
    const normalizedCode = String(standardCode || '').trim()
    if (!normalizedCode) return []
    return (knowledgePoints || []).filter(point => (
        point?.reviewStatus === 'approved' && Array.isArray(point.standardCodes) && point.standardCodes.includes(normalizedCode)
    ))
}

export function findPublishableKnowledgePointsByStandard(knowledgePoints, standardCode, publicationStatus = 'approved') {
    const normalizedCode = String(standardCode || '').trim()
    if (!normalizedCode) return []
    const allowed = publicationStatus === 'public_preview'
        ? new Set(['approved', 'candidate'])
        : new Set(['approved'])
    return (knowledgePoints || []).filter(point => (
        allowed.has(point?.reviewStatus) && Array.isArray(point.standardCodes) && point.standardCodes.includes(normalizedCode)
    ))
}

export async function loadKnowledgeGraph({ manifestUrl = DEFAULT_MANIFEST_URL, signal } = {}) {
    if (manifestUrl === DEFAULT_MANIFEST_URL && cachedGraph) return cachedGraph
    if (manifestUrl === DEFAULT_MANIFEST_URL && loadingGraph) return loadingGraph

    const request = (async () => {
        const manifest = await fetchJson(manifestUrl, signal)
        const files = manifest.files || {}
        const requiredFiles = ['knowledgePoints', 'taxonomyNodes', 'prerequisites', 'taxonomyEdges', 'evidence']
        const missing = requiredFiles.filter(key => !files[key])
        if (missing.length) throw new Error(`Learning Map manifest is missing: ${missing.join(', ')}`)
        const payloads = await Promise.all(requiredFiles.map(key => fetchJson(resolveKnowledgeGraphFileURL(manifestUrl, files[key]), signal)))
        const [knowledgePoints, taxonomyNodes, prerequisites, taxonomyEdges, evidence] = payloads
        const publicationStatus = manifest.publicationStatus === 'public_preview' ? 'public_preview' : 'approved'
        if (publicationStatus === 'public_preview' && manifest.relationshipSemantics !== 'curriculum_progression_candidate_not_verified_prerequisite') {
            throw new Error('Learning Map public preview manifest has invalid relationship semantics')
        }
        const dataset = {
            publicationStatus,
            knowledgePoints: toArray(knowledgePoints, 'knowledgePoints'),
            taxonomyNodes: toArray(taxonomyNodes, 'taxonomyNodes'),
            prerequisites: toArray(prerequisites, 'prerequisites'),
            taxonomyEdges: toArray(taxonomyEdges, 'taxonomyEdges'),
            evidence: toArray(evidence, 'evidence')
        }
        assertPublishableCollection(dataset.knowledgePoints, 'knowledge points', publicationStatus)
        assertPublishableCollection(dataset.taxonomyNodes, 'taxonomy nodes', publicationStatus)
        assertPublishableCollection(dataset.prerequisites, 'prerequisites', publicationStatus)
        assertPublishableCollection(dataset.taxonomyEdges, 'taxonomy edges', publicationStatus)
        return {
            version: manifest.version || manifest.dataVersion || 'unknown',
            dataset,
            manifest
        }
    })()

    if (manifestUrl === DEFAULT_MANIFEST_URL) {
        loadingGraph = request
        try {
            cachedGraph = await request
            return cachedGraph
        } finally {
            loadingGraph = undefined
        }
    }
    return request
}

export function resetKnowledgeGraphLoaderCache() {
    cachedGraph = undefined
    loadingGraph = undefined
}
