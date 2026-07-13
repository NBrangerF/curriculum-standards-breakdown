import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
    buildGlobalPreviewData,
    PUBLIC_PREVIEW_RELATIONSHIP_SEMANTICS
} from './knowledgeGraphPreviewBuilder.mjs'
import { validateKnowledgeGraph } from './knowledgeGraphValidation.mjs'

const DATA_ROOT = resolve('public/data')
const PUBLIC_ROOT = resolve(DATA_ROOT, 'knowledge_graph')
const stable = value => JSON.stringify(value, null, 2) + '\n'
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
const writeJson = async (path, value) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, stable(value))
}

const sourceManifest = await readJson(resolve(DATA_ROOT, 'manifest.json'))
const subjectEntries = await Promise.all(sourceManifest.subjects.map(async subject => {
    const payload = await readJson(resolve(DATA_ROOT, subject.file))
    return {
        subject: subject.subject,
        subjectSlug: subject.subject_slug,
        sourceFile: subject.file,
        records: payload.standards || payload
    }
}))
const preview = buildGlobalPreviewData(subjectEntries)

for (const subject of preview.subjects) {
    const validation = validateKnowledgeGraph(subject.dataset)
    if (!validation.valid) throw new Error(`Knowledge Graph preview build failed for ${subject.subjectSlug}: ${validation.errors.join('; ')}`)
}
if (preview.counts.crossSubjectReferences) {
    throw new Error(`Knowledge Graph preview build blocked: ${preview.counts.crossSubjectReferences} cross-subject sequence references require an explicit product policy`)
}

for (const directory of ['nodes_by_subject', 'taxonomy_by_subject', 'prerequisite_edges_by_subject', 'evidence_by_subject', 'indexes', 'quality']) {
    await rm(resolve(PUBLIC_ROOT, directory), { recursive: true, force: true })
}
for (const file of ['evidence.json', 'prerequisite_edges.json', 'taxonomy_edges.json', 'taxonomy_nodes.json']) {
    await rm(resolve(PUBLIC_ROOT, file), { force: true })
}

const byStandard = {}
const unresolvedReferences = []
for (const subject of preview.subjects) {
    const { files } = subject.manifestEntry
    await writeJson(resolve(PUBLIC_ROOT, files.knowledgePoints), { knowledgePoints: subject.dataset.knowledgePoints })
    await writeJson(resolve(PUBLIC_ROOT, files.taxonomy), { taxonomyNodes: subject.dataset.taxonomyNodes, taxonomyEdges: subject.dataset.taxonomyEdges })
    await writeJson(resolve(PUBLIC_ROOT, files.prerequisites), { prerequisites: subject.dataset.prerequisites })
    await writeJson(resolve(PUBLIC_ROOT, files.evidence), { evidence: subject.dataset.evidence })
    for (const point of subject.dataset.knowledgePoints) {
        for (const code of point.standardCodes) byStandard[code] = { subjectSlug: subject.subjectSlug, pointId: point.id }
    }
    unresolvedReferences.push(...subject.quality.unresolvedReferences)
}
await writeJson(resolve(PUBLIC_ROOT, 'indexes/by_standard.json'), byStandard)
await writeJson(resolve(PUBLIC_ROOT, 'quality/unresolved_references.json'), { unresolvedReferences })
await writeJson(resolve(PUBLIC_ROOT, 'manifest.json'), {
    version: preview.version,
    dataVersion: preview.version,
    publicationStatus: 'public_preview',
    relationshipSemantics: PUBLIC_PREVIEW_RELATIONSHIP_SEMANTICS,
    source: 'public/data/manifest.json',
    notice: '公开预览：关系来自课程标准前后条目字段，尚未经过课程专家先修审核。',
    subjects: preview.subjects.map(subject => subject.manifestEntry),
    files: {
        byStandard: 'indexes/by_standard.json',
        unresolvedReferences: 'quality/unresolved_references.json'
    },
    counts: preview.counts
})

console.log(JSON.stringify({
    status: 'global_public_preview_built',
    version: preview.version,
    subjects: preview.subjects.map(subject => ({
        subjectSlug: subject.subjectSlug,
        ...subject.manifestEntry.counts,
        ...subject.manifestEntry.quality
    })),
    counts: preview.counts,
    writesPublicData: true,
    expertSignoffClaimed: false
}, null, 2))
