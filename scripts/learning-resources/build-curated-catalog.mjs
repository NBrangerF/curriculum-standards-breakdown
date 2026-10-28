#!/usr/bin/env node
// Builds the public learning-resource catalog from the hand-curated files in data/learning-resources/curated.
// Run with tsx (npm run learning-resources:build) because it imports the zod schema from curriculum-core.
//
//   --check   validate and compare with the committed output without writing anything
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    CuratedSubjectFileSchema,
    LEARNING_RESOURCE_STAGES,
    LEARNING_RESOURCE_SUBJECTS,
    LearningResourceCatalogSchema,
    StandardLearningResourcesSchema
} from '../../packages/curriculum-core/src/learning-resources/schemas.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const STAGE_BY_BAND = { H1: 'G1-2', H2: 'G3-4', H3: 'G5-6', H4G7: 'G7-9', H4G8: 'G7-9', H4G9: 'G7-9' }

function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'))
}

function json(value) {
    return `${JSON.stringify(value, null, 2)}\n`
}

/** code -> { subject, grade_band, stage, standard_title } for every published standard. */
export function loadStandardIndex(standardsRoot) {
    const index = new Map()
    for (const file of readdirSync(standardsRoot).filter(name => name.endsWith('.json')).sort()) {
        for (const standard of readJson(join(standardsRoot, file)).standards) {
            index.set(standard.code, {
                subject: standard.subject_slug,
                grade_band: standard.grade_band,
                stage: STAGE_BY_BAND[standard.grade_band],
                standard_title: String(standard.standard_title || standard.standard).trim()
            })
        }
    }
    return index
}

/** Reads and checks every curated file; throws with all problems listed when anything is wrong. */
export function loadCuratedResources(curatedRoot, standards) {
    const problems = []
    const resources = []
    const seen = new Set()
    const files = readdirSync(curatedRoot).filter(name => name.endsWith('.json')).sort()
    for (const file of files) {
        const parsed = CuratedSubjectFileSchema.safeParse(readJson(join(curatedRoot, file)))
        if (!parsed.success) {
            for (const issue of parsed.error.issues) problems.push(`${file} ${issue.path.join('.')}: ${issue.message}`)
            continue
        }
        if (file !== `${parsed.data.subject}.json`) problems.push(`${file}: subject is ${parsed.data.subject}`)
        for (const resource of parsed.data.resources) {
            const where = `${file} ${resource.id}`
            if (seen.has(resource.id)) problems.push(`${where}: duplicate id`)
            seen.add(resource.id)
            if (resource.subjects[0] !== parsed.data.subject) problems.push(`${where}: first subject must be ${parsed.data.subject}`)
            for (const alignment of resource.standards) {
                const standard = standards.get(alignment.code)
                if (!standard) {
                    problems.push(`${where}: standard ${alignment.code} does not exist`)
                    continue
                }
                if (!resource.subjects.includes(standard.subject)) problems.push(`${where}: ${alignment.code} is ${standard.subject}, not in subjects`)
                if (!resource.stages.includes(standard.stage)) problems.push(`${where}: ${alignment.code} is ${standard.stage}, not in stages`)
            }
            resources.push(resource)
        }
    }
    if (problems.length) throw new Error(`curated learning resources are invalid:\n  ${problems.join('\n  ')}`)
    return resources
}

function subjectOrder(resource) {
    return LEARNING_RESOURCE_SUBJECTS.indexOf(resource.subjects[0])
}

/** Pure: curated entries + standard index -> { catalog, byStandard }. */
export function buildCatalog(curated, standards) {
    const resources = [...curated]
        .sort((a, b) => subjectOrder(a) - subjectOrder(b) || a.id.localeCompare(b.id))
        .map(resource => {
            const aligned = resource.standards.map(item => ({ ...item, ...standards.get(item.code) }))
            return {
                ...resource,
                standards: aligned.map(item => ({
                    code: item.code,
                    rationale_zh: item.rationale_zh,
                    standard_title: item.standard_title,
                    subject: item.subject,
                    grade_band: item.grade_band,
                    stage: item.stage
                })),
                standard_codes: aligned.map(item => item.code),
                alignment_count: aligned.length
            }
        })

    const bySubject = Object.fromEntries(LEARNING_RESOURCE_SUBJECTS.map(subject => [
        subject, resources.filter(resource => resource.subjects.includes(subject)).length
    ]))
    const byStage = Object.fromEntries(LEARNING_RESOURCE_STAGES.map(stage => [
        stage, resources.filter(resource => resource.stages.includes(stage)).length
    ]))
    const byStandard = new Map()
    for (const resource of resources) {
        for (const alignment of resource.standards) {
            if (!byStandard.has(alignment.code)) byStandard.set(alignment.code, [])
            byStandard.get(alignment.code).push({ ...resource, rationale_zh: alignment.rationale_zh })
        }
    }

    const catalog = LearningResourceCatalogSchema.parse({
        schema_version: 2,
        // The newest check date, not the build time, so rebuilding unchanged data changes nothing.
        updated_at: resources.map(resource => resource.checked_at).sort().at(-1) || '1970-01-01',
        counts: {
            resources: resources.length,
            alignments: resources.reduce((sum, resource) => sum + resource.alignment_count, 0),
            standards: byStandard.size,
            by_subject: bySubject,
            by_stage: byStage
        },
        resources
    })
    const standardFiles = [...byStandard.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, items]) => [
        code,
        StandardLearningResourcesSchema.parse({ schema_version: 2, standard_code: code, resources: items })
    ])
    return { catalog, byStandard: new Map(standardFiles) }
}

/** The files the build writes, as { relativePath: content }. */
export function renderOutput({ catalog, byStandard }) {
    const files = { 'catalog/index.json': json(catalog) }
    for (const [code, payload] of byStandard) files[`by-standard/${code}.json`] = json(payload)
    return files
}

export function buildCuratedLearningResourceCatalog({
    curatedRoot = join(ROOT, 'data/learning-resources/curated'),
    standardsRoot = join(ROOT, 'public/data/by_subject'),
    outputRoot = join(ROOT, 'public/data/learning-resources'),
    write = true
} = {}) {
    const standards = loadStandardIndex(standardsRoot)
    const built = buildCatalog(loadCuratedResources(curatedRoot, standards), standards)
    const files = renderOutput(built)
    if (write) {
        // Replace the whole output so standards that lost all their resources lose their files too.
        rmSync(outputRoot, { recursive: true, force: true })
        for (const [path, content] of Object.entries(files)) {
            mkdirSync(dirname(join(outputRoot, path)), { recursive: true })
            writeFileSync(join(outputRoot, path), content)
        }
    }
    return { ...built.catalog.counts, files }
}

/** Paths whose committed content differs from a fresh build (missing, stale or extra). */
export function diffCommittedOutput(files, outputRoot) {
    const stale = Object.entries(files)
        .filter(([path, content]) => !existsSync(join(outputRoot, path)) || readFileSync(join(outputRoot, path), 'utf8') !== content)
        .map(([path]) => path)
    const standardDir = join(outputRoot, 'by-standard')
    const extra = existsSync(standardDir)
        ? readdirSync(standardDir).map(name => `by-standard/${name}`).filter(path => !(path in files))
        : []
    return [...stale, ...extra]
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const check = process.argv.includes('--check')
    const outputRoot = join(ROOT, 'public/data/learning-resources')
    const { files, ...counts } = buildCuratedLearningResourceCatalog({ write: !check })
    if (check) {
        const drift = diffCommittedOutput(files, outputRoot)
        if (drift.length) {
            console.error(`learning-resource output is out of date; run npm run learning-resources:build\n  ${drift.join('\n  ')}`)
            process.exit(1)
        }
    }
    console.log(JSON.stringify(counts, null, 2))
}
