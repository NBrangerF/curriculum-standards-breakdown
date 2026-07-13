const DEFAULT_MANIFEST_URL = '/data/knowledge_graph/manifest.json'
const cachedGraphs = new Map()
const loadingGraphs = new Map()

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

const normalizeSubjectSlug = value => String(value || '').trim()

function resolveSubjectBundle(manifest, subjectSlug) {
    if (!Array.isArray(manifest.subjects)) return undefined
    const normalizedSlug = normalizeSubjectSlug(subjectSlug)
    if (!normalizedSlug) throw new Error('Learning Map global manifest requires a subject slug')
    const subject = manifest.subjects.find(entry => (
        normalizeSubjectSlug(entry?.subjectSlug || entry?.subject_slug) === normalizedSlug
    ))
    if (!subject) throw new Error(`Learning Map manifest has no subject: ${normalizedSlug}`)
    return subject
}

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

export async function loadKnowledgeGraph({ manifestUrl = DEFAULT_MANIFEST_URL, subjectSlug, signal } = {}) {
    const normalizedSubjectSlug = normalizeSubjectSlug(subjectSlug)
    const cacheKey = `${manifestUrl}\u001f${normalizedSubjectSlug}`
    const shouldCache = manifestUrl === DEFAULT_MANIFEST_URL
    if (shouldCache && cachedGraphs.has(cacheKey)) return cachedGraphs.get(cacheKey)
    if (shouldCache && loadingGraphs.has(cacheKey)) return loadingGraphs.get(cacheKey)

    const request = (async () => {
        const manifest = await fetchJson(manifestUrl, signal)
        const subject = resolveSubjectBundle(manifest, normalizedSubjectSlug)
        const files = subject?.files || manifest.files || {}
        const isSubjectBundle = Boolean(subject)
        const requiredFiles = isSubjectBundle
            ? ['knowledgePoints', 'taxonomy', 'prerequisites', 'evidence']
            : ['knowledgePoints', 'taxonomyNodes', 'prerequisites', 'taxonomyEdges', 'evidence']
        const missing = requiredFiles.filter(key => !files[key])
        if (missing.length) throw new Error(`Learning Map manifest is missing: ${missing.join(', ')}`)
        const payloads = await Promise.all(requiredFiles.map(key => (
            fetchJson(resolveKnowledgeGraphFileURL(manifestUrl, files[key]), signal)
        )))
        const payloadByKey = Object.fromEntries(requiredFiles.map((key, index) => [key, payloads[index]]))
        const publicationStatus = manifest.publicationStatus === 'public_preview' ? 'public_preview' : 'approved'
        if (publicationStatus === 'public_preview' && manifest.relationshipSemantics !== 'curriculum_progression_candidate_not_verified_prerequisite') {
            throw new Error('Learning Map public preview manifest has invalid relationship semantics')
        }
        const dataset = {
            publicationStatus,
            knowledgePoints: toArray(payloadByKey.knowledgePoints, 'knowledgePoints'),
            taxonomyNodes: toArray(payloadByKey.taxonomy || payloadByKey.taxonomyNodes, 'taxonomyNodes'),
            prerequisites: toArray(payloadByKey.prerequisites, 'prerequisites'),
            taxonomyEdges: toArray(payloadByKey.taxonomy || payloadByKey.taxonomyEdges, 'taxonomyEdges'),
            evidence: toArray(payloadByKey.evidence, 'evidence')
        }
        assertPublishableCollection(dataset.knowledgePoints, 'knowledge points', publicationStatus)
        assertPublishableCollection(dataset.taxonomyNodes, 'taxonomy nodes', publicationStatus)
        assertPublishableCollection(dataset.prerequisites, 'prerequisites', publicationStatus)
        assertPublishableCollection(dataset.taxonomyEdges, 'taxonomy edges', publicationStatus)
        return {
            version: manifest.version || manifest.dataVersion || 'unknown',
            dataset,
            manifest,
            subject
        }
    })()

    if (shouldCache) {
        loadingGraphs.set(cacheKey, request)
        try {
            const graph = await request
            cachedGraphs.set(cacheKey, graph)
            return graph
        } finally {
            loadingGraphs.delete(cacheKey)
        }
    }
    return request
}

export function resetKnowledgeGraphLoaderCache() {
    cachedGraphs.clear()
    loadingGraphs.clear()
}
