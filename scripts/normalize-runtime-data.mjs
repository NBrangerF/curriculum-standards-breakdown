#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const GRADE_LABELS = {
    H1: '第一学段（1-2年级）',
    H2: '第二学段（3-4年级）',
    H3: '第三学段（5-6年级）',
    H4G7: '七年级',
    H4G8: '八年级',
    H4G9: '九年级'
}

const GRADE_RANGES = { H1: '1-2', H2: '3-4', H3: '5-6', H4G7: '7', H4G8: '8', H4G9: '9' }

function parseArgs(argv) {
    const args = { dataRoot: 'data/internal' }
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--data-root') args.dataRoot = argv[++index]
    }
    return args
}

const args = parseArgs(process.argv.slice(2))
const dataRoot = resolve(args.dataRoot)
const bySubject = join(dataRoot, 'by_subject')
const summary = { files: 0, records: 0, grade_labels_normalized: 0, subdomains_filled: 0 }

for (const file of readdirSync(bySubject).filter(name => name.endsWith('.json')).sort()) {
    const path = join(bySubject, file)
    const payload = JSON.parse(readFileSync(path, 'utf8'))
    const standards = payload.standards || []
    for (const record of standards) {
        const gradeBand = String(record.grade_band || '')
        if (GRADE_LABELS[gradeBand] && record.grade !== GRADE_LABELS[gradeBand]) {
            record.grade = GRADE_LABELS[gradeBand]
            summary.grade_labels_normalized += 1
        }
        if (GRADE_RANGES[gradeBand] && record.grade_range !== GRADE_RANGES[gradeBand]) {
            record.grade_range = GRADE_RANGES[gradeBand]
        }
        if (!String(record.subdomain || '').trim() && String(record.display_subcategory || '').trim()) {
            record.subdomain = record.display_subcategory
            summary.subdomains_filled += 1
        }
        summary.records += 1
    }
    writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`)
    summary.files += 1
}

console.log(JSON.stringify(summary, null, 2))
