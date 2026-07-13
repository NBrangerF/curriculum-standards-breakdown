#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const PUBLIC_FIELDS = new Set([
    'code', 'subject', 'subject_slug', 'domain', 'subdomain', 'display_subcategory', 'standard_title',
    'grade_band', 'grade_range', 'grade', 'grade_level', 'stage_band', 'standard', 'context', 'practice',
    'teaching_tip', 'assessment_evidence_type', 'ts_primary', 'ts_secondary', 'ts_rationale',
    'materials_tools', 'safety_notes', 'previous_code', 'next_code'
])
const FORBIDDEN_FIELD_PATTERN = /^(id|legacy_code|grade_assignment_|review_status$|pre_publication_review_status$|standard_variant_type$|progression_basis$|progression_confidence$|progression_review_note$|source_|textbook_evidence|supplemental_evidence|candidate_)/

const root = resolve(process.argv.includes('--data-root')
    ? process.argv[process.argv.indexOf('--data-root') + 1]
    : 'public/data')
const bySubject = join(root, 'by_subject')
const errors = []

if (!existsSync(bySubject)) errors.push(`缺少公开数据目录：${bySubject}`)
else {
    for (const file of readdirSync(bySubject).filter(name => name.endsWith('.json'))) {
        const payload = JSON.parse(readFileSync(join(bySubject, file), 'utf8'))
        for (const [index, record] of (payload.standards || []).entries()) {
            for (const key of Object.keys(record)) {
                if (!PUBLIC_FIELDS.has(key) || FORBIDDEN_FIELD_PATTERN.test(key)) {
                    errors.push(`${file}#${index} 包含非公开字段：${key}`)
                }
            }
        }
    }
}

if (existsSync(join(root, 'junior_grade_level_summary.json'))) {
    errors.push('公开投影不应包含 junior_grade_level_summary.json（含内部年级归属与审核统计）。')
}

console.log(JSON.stringify({ valid: errors.length === 0, data_root: root, errors }, null, 2))
if (errors.length) process.exitCode = 1
