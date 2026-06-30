#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'fs'
import { basename, join } from 'path'

const DEFAULT_DATA_ROOT = 'public/data'

function parseArgs(argv) {
    const args = { dataRoot: DEFAULT_DATA_ROOT }
    for (let i = 0; i < argv.length; i += 1) {
        const item = argv[i]
        if (item === '--data-root') args.dataRoot = argv[++i]
        else if (item === '--help') args.help = true
    }
    return args
}

function usage() {
    console.log(`Usage:
node scripts/validate-data-indexes.js [--data-root public/data]

Validates that manifest.json and indexes are derived from by_subject records.`)
}

function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'))
}

function subjectFiles(bySubjectDir) {
    if (!existsSync(bySubjectDir)) return []
    return readdirSync(bySubjectDir)
        .filter(file => file.endsWith('.json'))
        .sort((a, b) => a.localeCompare(b))
}

function stable(value) {
    if (Array.isArray(value)) return value.map(stable)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
        Object.keys(value)
            .sort((a, b) => a.localeCompare(b))
            .map(key => [key, stable(value[key])])
    )
}

function sameJson(a, b) {
    return JSON.stringify(stable(a)) === JSON.stringify(stable(b))
}

function countInto(target, value) {
    if (!value) return
    target[value] = (target[value] || 0) + 1
}

function gradeKey(record) {
    const grade = String(record.grade || '').trim()
    if (grade) return grade
    const gradeBand = String(record.grade_band || '').trim()
    const gradeRange = String(record.grade_range || '').trim()
    if (gradeBand && gradeRange) return `${gradeBand}:${gradeRange}`
    return gradeBand || gradeRange
}

function buildExpected(dataRoot) {
    const bySubjectDir = join(dataRoot, 'by_subject')
    const manifestSubjects = []
    const codeToSubject = {}
    const skillToSubjectSets = {}
    const subjectStats = {}
    const columns = new Set()
    let total = 0

    for (const file of subjectFiles(bySubjectDir)) {
        const subjectSlug = basename(file, '.json')
        const payload = readJson(join(bySubjectDir, file))
        const standards = payload.standards || []
        const domains = {}
        const gradeBands = {}
        const grades = {}
        const skillCoverage = {}

        total += standards.length
        for (const record of standards) {
            for (const key of Object.keys(record)) columns.add(key)
            countInto(domains, record.domain)
            countInto(gradeBands, record.grade_band)
            countInto(grades, gradeKey(record))
            if (record.code) codeToSubject[record.code] = subjectSlug
            for (const ts of [...(record.ts_primary || []), ...(record.ts_secondary || [])]) {
                const main = String(ts).split('.')[0]
                countInto(skillCoverage, main)
                if (!skillToSubjectSets[main]) skillToSubjectSets[main] = new Set()
                skillToSubjectSets[main].add(subjectSlug)
            }
        }

        manifestSubjects.push({
            subject: payload.subject,
            subject_slug: subjectSlug,
            record_count: standards.length,
            file: `by_subject/${file}`,
            domains,
            grade_bands: gradeBands,
            grades
        })
        subjectStats[subjectSlug] = {
            total: standards.length,
            domains: Object.keys(domains).length,
            grade_bands: gradeBands,
            grades,
            skill_coverage: skillCoverage
        }
    }

    const skillToSubjects = Object.fromEntries(
        Object.entries(skillToSubjectSets)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([skill, values]) => [skill, [...values].sort()])
    )

    return {
        total,
        subjects: manifestSubjects,
        columns: [...columns].sort((a, b) => a.localeCompare(b)),
        codeToSubject,
        skillToSubjects,
        subjectStats
    }
}

function main() {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) {
        usage()
        process.exit(0)
    }

    const manifestFile = join(args.dataRoot, 'manifest.json')
    const indexesDir = join(args.dataRoot, 'indexes')
    const errors = []
    const warnings = []

    for (const file of [
        manifestFile,
        join(indexesDir, 'code_to_subject.json'),
        join(indexesDir, 'skill_to_subjects.json'),
        join(indexesDir, 'subject_stats.json')
    ]) {
        if (!existsSync(file)) errors.push(`Missing required file: ${file}`)
    }

    if (!errors.length) {
        const expected = buildExpected(args.dataRoot)
        const manifest = readJson(manifestFile)
        const codeToSubject = readJson(join(indexesDir, 'code_to_subject.json'))
        const skillToSubjects = readJson(join(indexesDir, 'skill_to_subjects.json'))
        const subjectStats = readJson(join(indexesDir, 'subject_stats.json'))

        if (!sameJson(manifest.subjects || [], expected.subjects)) {
            errors.push('manifest subjects do not match by_subject records')
        }

        const manifestColumns = new Set(manifest.columns || [])
        const missingColumns = expected.columns.filter(column => !manifestColumns.has(column))
        if (missingColumns.length) {
            errors.push(`manifest columns missing by_subject fields: ${missingColumns.join(', ')}`)
        }

        const manifestTotal = (manifest.subjects || []).reduce((sum, subject) => sum + (Number(subject.record_count) || 0), 0)
        if (manifestTotal !== expected.total) {
            errors.push(`manifest total ${manifestTotal} does not match by_subject total ${expected.total}`)
        }

        if (!sameJson(codeToSubject, expected.codeToSubject)) {
            errors.push('code_to_subject index does not match by_subject records')
        }
        if (!sameJson(skillToSubjects, expected.skillToSubjects)) {
            errors.push('skill_to_subjects index does not match by_subject records')
        }
        if (!sameJson(subjectStats, expected.subjectStats)) {
            errors.push('subject_stats index does not match by_subject records')
        }
    }

    const result = {
        valid: errors.length === 0,
        data_root: args.dataRoot,
        errors,
        warnings
    }
    console.log(JSON.stringify(result, null, 2))
    if (errors.length) process.exit(1)
}

main()
