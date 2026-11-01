#!/usr/bin/env node
// 目录 for a book whose PDF was replaced by a newer printing: the automatic extractor often finds only a running header
// on these (「我是小学生啦」 on every page) or nothing on a scan, while the 国家平台 同步课 list for the same printing names
// every 单元 and 课, and build_lesson_evidence.mjs has found where each 课 starts in our PDF. This writes those units and
// lessons as the book's toc (approved only where the 课题 was found as a heading on the page), unless the extractor's
// own toc is clearly richer. The extractor's toc, when kept, loses its unlocated entries, repeated running-header titles
// and crowded runs (a 目录 page or a word list read as headings).
// Run after extract_textbook_structure.py and build_lesson_evidence.mjs, before build_textbook_content_alignments.js.
//   node scripts/textbooks/toc_from_platform_lessons.mjs --edition ed_… [--edition ed_…] [--dry-run]
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const STRUCTURES = path.join(ROOT, 'data/textbooks/derived/by-edition')
const EVIDENCE = path.join(ROOT, 'generated/smartedu/evidence')
const PLATFORM = path.join(ROOT, 'data/textbooks/smartedu')
const TOC_SOURCE = 'smartedu_sync_lessons'
const TOC_VERSION = 'smartedu-sync-lessons-toc-v1'

const argv = process.argv.slice(2)
const editions = argv.flatMap((value, index) => (value === '--edition' ? [argv[index + 1]] : []))
const dryRun = argv.includes('--dry-run')
if (!editions.length) throw new Error('usage: toc_from_platform_lessons.mjs --edition ed_… [--dry-run]')

const current = JSON.parse(readFileSync(path.join(ROOT, 'data/textbooks/library-state/CURRENT.json'), 'utf8'))
const assets = new Map(readFileSync(path.join(ROOT, `data/textbooks/library-state/generations/${current.generation_id}/asset_registry.lock.jsonl`), 'utf8')
    .split('\n').filter(Boolean).map(line => JSON.parse(line)).map(row => [row.edition_id, row]))

const tidy = text => String(text || '').replace(/\s+/gu, ' ').trim()
const squash = text => String(text || '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()
const withoutPeriod = title => title.replace(/[（(]?第[一二三四五六七八九十\d]+课时[）)]?/gu, '')
const entryId = (editionId, sha256, kind, ordinal, title) => `tcu_${createHash('sha256').update([TOC_VERSION, editionId, sha256, kind, ordinal, squash(title)].join('\u001f')).digest('hex').slice(0, 16)}`

function lessonToc(editionId, asset, printedByPdf) {
    const file = path.join(EVIDENCE, `${editionId}.json`)
    if (!existsSync(file) || !existsSync(path.join(PLATFORM, `${editionId}.json`))) return []
    const units = []
    const byUnit = new Map()
    const titles = new Set()
    let lastStart = 0
    for (const lesson of JSON.parse(readFileSync(file, 'utf8')).lessons) {
        const book = lesson.sources?.textbook
        // only a 课题 found as a heading on its page; positions guessed from neighbours or unit openers stay out
        if (!book || book.located_by !== 'heading') continue
        const [start, end] = book.pages
        const title = tidy(withoutPeriod(tidy(lesson.path?.[lesson.path.length - 1] || lesson.title))) || tidy(lesson.title)
        // each 课 starts on a later page than the one before it (several 课题 found on one page are a summary page),
        // and the later 课时 of a 课 are the same entry
        if (!(start > 0) || start <= lastStart || titles.has(squash(title))) continue
        const unitKey = lesson.unit_node && lesson.unit_node !== lesson.id ? lesson.unit_node : null
        let unit = unitKey ? byUnit.get(unitKey) : null
        if (unitKey && !unit) {
            unit = { title: tidy(lesson.path?.[0] || ''), start, lessons: [] }
            byUnit.set(unitKey, unit)
            units.push(unit)
        }
        lastStart = start
        titles.add(squash(title))
        // a 课 named like its 单元 (a chapter's opening video, a one-lesson unit) is the unit entry itself
        if (unit && squash(title) === squash(unit.title)) continue
        const holder = unit || (units[units.length - 1]?.loose ? units[units.length - 1] : (units.push({ loose: true, lessons: [] }), units[units.length - 1]))
        holder.lessons.push({ title, start, end: Math.max(start, end || start) })
    }
    const entries = []
    let order = 0
    for (const [unitIndex, unit] of units.entries()) {
        let parentId = null
        if (!unit.loose && unit.title) {
            parentId = entryId(editionId, asset.sha256, 'unit', unitIndex + 1, unit.title)
            entries.push({ entry_id: parentId, parent_id: null, level: 1, kind: 'unit', title: unit.title, pdf_page: unit.start, end_pdf_page: null, printed_page: printedByPdf.get(unit.start) ?? null, confidence: 0.85, review_status: 'approved', source: TOC_SOURCE, source_order: (order += 1), toc_pdf_page: null })
        }
        for (const [lessonIndex, lesson] of unit.lessons.entries()) {
            entries.push({ entry_id: entryId(editionId, asset.sha256, 'lesson', `${unitIndex + 1}.${lessonIndex + 1}`, lesson.title), parent_id: parentId, level: parentId ? 2 : 1, kind: 'lesson', title: lesson.title, pdf_page: lesson.start, end_pdf_page: lesson.end, printed_page: printedByPdf.get(lesson.start) ?? null, confidence: 0.85, review_status: 'approved', source: TOC_SOURCE, source_order: (order += 1), toc_pdf_page: null })
        }
    }
    // a unit runs to the page before the next unit; the last one to the end of its last lesson
    const unitsOnly = entries.filter(entry => entry.kind === 'unit')
    for (const [index, entry] of unitsOnly.entries()) {
        const lessons = entries.filter(item => item.parent_id === entry.entry_id)
        entry.end_pdf_page = index + 1 < unitsOnly.length ? Math.max(entry.pdf_page, unitsOnly[index + 1].pdf_page - 1) : Math.max(entry.pdf_page, ...lessons.map(item => item.end_pdf_page))
    }
    return entries
}

const report = []
for (const editionId of editions) {
    const asset = assets.get(editionId)
    const structurePath = path.join(STRUCTURES, `${editionId}.json`)
    if (!asset || !existsSync(structurePath)) { report.push({ edition_id: editionId, choice: 'skipped' }); continue }
    const structure = JSON.parse(readFileSync(structurePath, 'utf8'))
    const printedByPdf = new Map((structure.page_map || []).filter(row => ['approved', 'machine_checked'].includes(row.review_status)).map(row => [Number(row.pdf_page), String(row.printed_page)]))
    // the extractor's own toc: located entries only, without the running header it can mistake for headings
    const seen = new Set()
    const located = (structure.toc || []).filter(entry => {
        const key = squash(entry.title)
        if (entry.source === TOC_SOURCE || entry.review_status !== 'approved' || !(Number(entry.pdf_page) > 0) || seen.has(key)) return false
        seen.add(key)
        return true
    })
    // three or more entries within two pages of each other are a 目录 page or a word list read as headings
    const byPage = [...located].sort((a, b) => a.pdf_page - b.pdf_page)
    const crowded = new Set()
    for (let start = 0; start < byPage.length;) {
        let end = start
        while (end + 1 < byPage.length && byPage[end + 1].pdf_page - byPage[end].pdf_page <= 2) end += 1
        if (end - start >= 2) for (let index = start; index <= end; index += 1) crowded.add(byPage[index])
        start = end + 1
    }
    const automatic = located.filter(entry => !crowded.has(entry))
    const fromLessons = lessonToc(editionId, asset, printedByPdf)
    const lessonCount = fromLessons.length
    const automaticApproved = automatic.length
    const useLessons = lessonCount >= 3 && lessonCount >= automaticApproved * 0.6
    const toc = useLessons ? fromLessons : automatic
    report.push({ edition_id: editionId, choice: useLessons ? 'lessons' : 'automatic', lesson_entries: lessonCount, automatic_approved: automaticApproved, dropped: (structure.toc || []).length - automatic.length })
    if (!dryRun) writeFileSync(structurePath, `${JSON.stringify({ ...structure, toc }, null, 2)}\n`)
}
console.log(JSON.stringify(report))
