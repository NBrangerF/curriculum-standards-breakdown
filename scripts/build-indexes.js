/**
 * Build Data Indexes Script
 * Generates manifest and index files from public/data/by_subject.
 * 
 * Run: node scripts/build-indexes.js
 * Or:  npm run build:indexes
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_DIR = join(ROOT, 'public', 'data')
const BY_SUBJECT_DIR = join(DATA_DIR, 'by_subject')
const INDEXES_DIR = join(DATA_DIR, 'indexes')
const MANIFEST_PATH = join(DATA_DIR, 'manifest.json')

console.log('📊 Building manifest and indexes...\n')

// Read all subject files
const subjectFiles = readdirSync(BY_SUBJECT_DIR)
    .filter(f => f.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
console.log(`Found ${subjectFiles.length} subject files`)

// Initialize indexes
const codeToSubject = {}
const skillToSubjects = {}
const subjectStats = {}
const manifestSubjects = []
const existingManifest = existsSync(MANIFEST_PATH)
    ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
    : {}
const columnSet = new Set(existingManifest.columns || [])

function gradeKey(std) {
    const grade = String(std.grade || '').trim()
    if (grade) return grade
    const gradeBand = String(std.grade_band || '').trim()
    const gradeRange = String(std.grade_range || '').trim()
    if (gradeBand && gradeRange) return `${gradeBand}:${gradeRange}`
    return gradeBand || gradeRange
}

function countInto(target, value) {
    if (!value) return
    target[value] = (target[value] || 0) + 1
}

// Process each subject
for (const file of subjectFiles) {
    const subjectSlug = file.replace('.json', '')
    const filePath = join(BY_SUBJECT_DIR, file)
    const data = JSON.parse(readFileSync(filePath, 'utf-8'))
    const standards = data.standards || []

    console.log(`  Processing ${subjectSlug}: ${standards.length} standards`)

    // Initialize stats for this subject
    const stats = {
        total: standards.length,
        domains: {},
        grade_bands: {},
        grades: {},
        skill_coverage: {}
    }

    // Process each standard
    for (const std of standards) {
        const code = std.code
        for (const key of Object.keys(std)) {
            columnSet.add(key)
        }
        if (!code) continue

        // Build code_to_subject index
        codeToSubject[code] = subjectSlug

        // Build skill_to_subjects index
        const allSkills = [
            ...(Array.isArray(std.ts_primary) ? std.ts_primary : []),
            ...(Array.isArray(std.ts_secondary) ? std.ts_secondary : [])
        ]

        for (const skill of allSkills) {
            // Extract main skill code (e.g., "TS1" from "TS1.2")
            const mainSkill = skill.split('.')[0]

            if (!skillToSubjects[mainSkill]) {
                skillToSubjects[mainSkill] = new Set()
            }
            skillToSubjects[mainSkill].add(subjectSlug)

            // Track skill coverage in stats
            stats.skill_coverage[mainSkill] = (stats.skill_coverage[mainSkill] || 0) + 1
        }

        // Track domains
        countInto(stats.domains, std.domain)

        // Track grade bands
        countInto(stats.grade_bands, std.grade_band)

        // Track concrete grade labels so 7-9 records can remain split after public integration.
        countInto(stats.grades, gradeKey(std))
    }

    manifestSubjects.push({
        subject: data.subject,
        subject_slug: subjectSlug,
        record_count: standards.length,
        file: `by_subject/${file}`,
        domains: stats.domains,
        grade_bands: stats.grade_bands,
        grades: stats.grades
    })

    // Persist compact derived stats for this subject.
    subjectStats[subjectSlug] = {
        total: stats.total,
        domains: Object.keys(stats.domains).length,
        grade_bands: stats.grade_bands,
        grades: stats.grades,
        skill_coverage: stats.skill_coverage
    }
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

function writeJson(path, value) {
    writeFileSync(path, `${JSON.stringify(stable(value), null, 2)}\n`)
}

// Convert Sets to Arrays for skill_to_subjects
const skillToSubjectsArray = {}
for (const [skill, subjects] of Object.entries(skillToSubjects).sort(([a], [b]) => a.localeCompare(b))) {
    skillToSubjectsArray[skill] = Array.from(subjects).sort()
}

// Write manifest and index files
console.log('\n📝 Writing manifest and index files...')

const manifest = {
    generated_at: existingManifest.generated_at || new Date().toISOString(),
    columns: [...columnSet].sort((a, b) => a.localeCompare(b)),
    subjects: manifestSubjects
}

if ('data_scope' in existingManifest) {
    manifest.data_scope = existingManifest.data_scope
}

writeJson(MANIFEST_PATH, manifest)
console.log(`  ✅ manifest.json (${manifestSubjects.length} subjects)`)

// 1. code_to_subject.json
const codeToSubjectPath = join(INDEXES_DIR, 'code_to_subject.json')
writeJson(codeToSubjectPath, codeToSubject)
console.log(`  ✅ code_to_subject.json (${Object.keys(codeToSubject).length} codes)`)

// 2. skill_to_subjects.json
const skillToSubjectsPath = join(INDEXES_DIR, 'skill_to_subjects.json')
writeJson(skillToSubjectsPath, skillToSubjectsArray)
console.log(`  ✅ skill_to_subjects.json (${Object.keys(skillToSubjectsArray).length} skills)`)

// 3. subject_stats.json
const subjectStatsPath = join(INDEXES_DIR, 'subject_stats.json')
writeJson(subjectStatsPath, subjectStats)
console.log(`  ✅ subject_stats.json (${Object.keys(subjectStats).length} subjects)`)

// Summary
console.log('\n📊 Index Summary:')
console.log(`  - Total standards indexed: ${Object.keys(codeToSubject).length}`)
console.log(`  - Manifest subjects: ${manifestSubjects.length}`)
console.log(`  - Skills with subject mappings: ${Object.keys(skillToSubjectsArray).length}`)
console.log(`  - Subjects with stats: ${Object.keys(subjectStats).length}`)

// File sizes
const manifestSize = readFileSync(MANIFEST_PATH).length
const codeToSubjectSize = readFileSync(codeToSubjectPath).length
const skillToSubjectsSize = readFileSync(skillToSubjectsPath).length
const subjectStatsSize = readFileSync(subjectStatsPath).length

console.log('\n📦 File sizes:')
console.log(`  - manifest.json: ${(manifestSize / 1024).toFixed(1)} KB`)
console.log(`  - code_to_subject.json: ${(codeToSubjectSize / 1024).toFixed(1)} KB`)
console.log(`  - skill_to_subjects.json: ${(skillToSubjectsSize / 1024).toFixed(1)} KB`)
console.log(`  - subject_stats.json: ${(subjectStatsSize / 1024).toFixed(1)} KB`)

console.log('\n✅ Done!')
