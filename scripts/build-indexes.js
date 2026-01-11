/**
 * Build Indexes Script
 * Generates index files for efficient data lookup
 * 
 * Run: node scripts/build-indexes.js
 * Or:  npm run build:indexes
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_DIR = join(ROOT, 'public', 'data')
const BY_SUBJECT_DIR = join(DATA_DIR, 'by_subject')
const INDEXES_DIR = join(DATA_DIR, 'indexes')

console.log('📊 Building indexes...\n')

// Read all subject files
const subjectFiles = readdirSync(BY_SUBJECT_DIR).filter(f => f.endsWith('.json'))
console.log(`Found ${subjectFiles.length} subject files`)

// Initialize indexes
const codeToSubject = {}
const skillToSubjects = {}
const subjectStats = {}

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
        domains: new Set(),
        grade_bands: {},
        skill_coverage: {}
    }

    // Process each standard
    for (const std of standards) {
        const code = std.code
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
        if (std.domain) {
            stats.domains.add(std.domain)
        }

        // Track grade bands
        if (std.grade_band) {
            stats.grade_bands[std.grade_band] = (stats.grade_bands[std.grade_band] || 0) + 1
        }
    }

    // Convert Set to count for domains
    subjectStats[subjectSlug] = {
        total: stats.total,
        domains: stats.domains.size,
        grade_bands: stats.grade_bands,
        skill_coverage: stats.skill_coverage
    }
}

// Convert Sets to Arrays for skill_to_subjects
const skillToSubjectsArray = {}
for (const [skill, subjects] of Object.entries(skillToSubjects)) {
    skillToSubjectsArray[skill] = Array.from(subjects).sort()
}

// Write index files
console.log('\n📝 Writing index files...')

// 1. code_to_subject.json
const codeToSubjectPath = join(INDEXES_DIR, 'code_to_subject.json')
writeFileSync(codeToSubjectPath, JSON.stringify(codeToSubject, null, 2))
console.log(`  ✅ code_to_subject.json (${Object.keys(codeToSubject).length} codes)`)

// 2. skill_to_subjects.json
const skillToSubjectsPath = join(INDEXES_DIR, 'skill_to_subjects.json')
writeFileSync(skillToSubjectsPath, JSON.stringify(skillToSubjectsArray, null, 2))
console.log(`  ✅ skill_to_subjects.json (${Object.keys(skillToSubjectsArray).length} skills)`)

// 3. subject_stats.json
const subjectStatsPath = join(INDEXES_DIR, 'subject_stats.json')
writeFileSync(subjectStatsPath, JSON.stringify(subjectStats, null, 2))
console.log(`  ✅ subject_stats.json (${Object.keys(subjectStats).length} subjects)`)

// Summary
console.log('\n📊 Index Summary:')
console.log(`  - Total standards indexed: ${Object.keys(codeToSubject).length}`)
console.log(`  - Skills with subject mappings: ${Object.keys(skillToSubjectsArray).length}`)
console.log(`  - Subjects with stats: ${Object.keys(subjectStats).length}`)

// File sizes
const codeToSubjectSize = readFileSync(codeToSubjectPath).length
const skillToSubjectsSize = readFileSync(skillToSubjectsPath).length
const subjectStatsSize = readFileSync(subjectStatsPath).length

console.log('\n📦 File sizes:')
console.log(`  - code_to_subject.json: ${(codeToSubjectSize / 1024).toFixed(1)} KB`)
console.log(`  - skill_to_subjects.json: ${(skillToSubjectsSize / 1024).toFixed(1)} KB`)
console.log(`  - subject_stats.json: ${(subjectStatsSize / 1024).toFixed(1)} KB`)

console.log('\n✅ Done!')
