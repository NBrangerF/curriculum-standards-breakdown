import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buildStandardGraphModel } from '../src/graph/adapters/standardGraphAdapter.js'
import { validateGraphModel } from '../src/graph/graphModel.js'

const dataDirectory = resolve('public/data/by_subject')
const subjectFiles = (await readdir(dataDirectory)).filter(file => file.endsWith('.json')).sort()

const totals = {
    standards: 0,
    nodes: 0,
    edges: 0,
    contains: 0,
    skillAlignment: 0,
    prerequisite: 0,
    invalidModels: 0,
    missingProvenance: 0
}

for (const filename of subjectFiles) {
    const raw = JSON.parse(await readFile(resolve(dataDirectory, filename), 'utf8'))
    for (const standard of raw.standards || []) {
        const model = buildStandardGraphModel(standard)
        const validation = validateGraphModel(model)

        totals.standards += 1
        totals.nodes += model.nodes.length
        totals.edges += model.edges.length
        totals.contains += model.edges.filter(edge => edge.type === 'contains').length
        totals.skillAlignment += model.edges.filter(edge => edge.type === 'skill_alignment').length
        totals.prerequisite += model.edges.filter(edge => edge.type === 'prerequisite').length
        totals.missingProvenance += model.edges.filter(edge => !edge.provenance?.field).length

        if (!validation.valid) {
            totals.invalidModels += 1
            throw new Error(`${standard.code}: ${validation.errors.join('; ')}`)
        }
    }
}

if (totals.prerequisite !== 0) {
    throw new Error(`Expected 0 inferred prerequisite edges, found ${totals.prerequisite}`)
}

if (totals.missingProvenance !== 0) {
    throw new Error(`Expected complete provenance, found ${totals.missingProvenance} missing edges`)
}

console.log('Standard GraphModel validation passed')
console.table(totals)
