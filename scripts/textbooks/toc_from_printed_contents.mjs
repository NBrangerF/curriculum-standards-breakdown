#!/usr/bin/env node
// 目录 from the book's own printed contents pages. The 国家平台 同步课 list stops where the platform stopped publishing
// (语文5上 2025: only 第一单元) and the heading extractor misses units or reads decimals as sections, but the book
// prints its whole 目录 with a page number on every line. printed_toc.mjs reads those pages column by column; this
// script maps each printed page to its PDF page with the book's verified page map (or, without one, the offset most
// entries are found at), keeps an entry only where its title (or its 第X单元 / Unit N label) is near the top of that
// PDF page in the page-text sidecar (anywhere on it when the entry above starts on the same page), and writes the
// result as the book's toc when it is clearly better than the stored one: more units, or much more of the book.
// An entry the stored toc already had (same title on the same page) keeps its entry_id, so links, test fixtures and
// alignments pointing at it stay valid.
// Run after extract_textbook_structure.py / toc_from_platform_lessons.mjs, with the drive mounted, and before
// build_textbook_content_alignments.js for the books it changed.
// --transcripts: a book with docs/data/textbooks/toc-transcribed/<edition>.tsv (its 目录 written down from the page
// images, for scans and 目录 the reader can't parse) uses those entries instead of reading the PDF; they are checked
// against the page text the same way. Scanned books are checked against their Vision OCR (generated/smartedu/page-ocr).
//   node scripts/textbooks/toc_from_printed_contents.mjs --edition ed_… [--edition ed_…] | --all [--transcripts] [--dry-run] [--report out.json] [--verbose]
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { PRINTED_TOC_VERSION, TITLED_LABELS, classifyLine, contentsLines, findContentsPages, isGarbled, parseContents, positionedItems, squash, verificationKeys } from './printed_toc.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const LIBRARY = process.env.TEXTBOOK_LIBRARY_ROOT || '/Volumes/X9 Pro/kebiao-library'
const STRUCTURES = path.join(ROOT, 'data/textbooks/derived/by-edition')
const SIDECAR_VERSION = 'textbook-content-v2'
const TOC_SOURCE = 'printed_toc'
const FRONT_PAGES = 16
// a heading counts when it is among the first lines of its page or in the upper part of it
const TOP_LINES = 3
// OCR lines carry no position here; a page's running head and number can come first
const TOP_LINES_OCR = 6
const TRANSCRIPTS = path.join(ROOT, 'docs/data/textbooks/toc-transcribed')
const PAGE_OCR = path.join(ROOT, 'generated/smartedu/page-ocr')
const TOP_SHARE = 0.42
const UNIT_KINDS = new Set(['unit', 'chapter', 'part'])
// stored tocs that call a lesson a unit (heading_match's 「第一课 …」, 同步课's 「实验活动1 …」, 「2. 厨房一角」)
const LESSON_LIKE = /^(?:第\s*[一二三四五六七八九十百零〇两\d]+\s*(?:课|框|节)|课题\s*\d|实验活动\s*\d|跨学科实践活动\s*\d|\d{1,2}\s*[.．]\s*\D)/u

const argv = process.argv.slice(2)
const option = name => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null)
const editions = argv.flatMap((value, index) => (value === '--edition' ? [argv[index + 1]] : []))
const dryRun = argv.includes('--dry-run')
const verbose = argv.includes('--verbose')
const reportPath = option('--report')
const useTranscripts = argv.includes('--transcripts')
if (!editions.length && !argv.includes('--all')) throw new Error('usage: toc_from_printed_contents.mjs --edition ed_… | --all [--dry-run] [--report out.json] [--verbose]')

const current = JSON.parse(readFileSync(path.join(ROOT, 'data/textbooks/library-state/CURRENT.json'), 'utf8'))
const assets = readFileSync(path.join(ROOT, `data/textbooks/library-state/generations/${current.generation_id}/asset_registry.lock.jsonl`), 'utf8')
    .split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(row => row.resource_type === 'student_textbook')
const titles = new Map((existsSync(path.join(ROOT, 'public/data/textbooks/index.json')) ? JSON.parse(readFileSync(path.join(ROOT, 'public/data/textbooks/index.json'), 'utf8')).items : []).map(item => [item.edition_id, `${item.edition_name || ''} ${item.title}`.trim()]))

const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16)
const entryId = (editionId, sha256, kind, ordinal, title) => `tcu_${hash([PRINTED_TOC_VERSION, editionId, sha256, kind, ordinal, squash(title)].join('\u001f'))}`
const LABEL_PREFIX = new RegExp(`^(?:${TITLED_LABELS.map(squash).join('|')})`, 'u')
// the words of a title without its number, 「*」 or kind label: 「3* 珍珠鸟」 = 「珍珠鸟」, 「口语交际：制定班级公约」 = 「制定班级公约」
const core = title => squash(title).replace(/^\d{1,2}(?!\d)/u, '').replace(LABEL_PREFIX, '') || squash(title)

async function frontPages(pdfPath) {
    const document = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)), disableWorker: true, isEvalSupported: false, useSystemFonts: true, verbosity: 0 }).promise
    try {
        const pages = []
        for (let pageNumber = 1; pageNumber <= Math.min(FRONT_PAGES, document.numPages); pageNumber += 1) {
            const page = await document.getPage(pageNumber)
            const content = await page.getTextContent({ includeMarkedContent: false, disableNormalization: false })
            pages.push({ pdf_page: pageNumber, items: positionedItems(content.items) })
            page.cleanup()
        }
        return { pages, pageCount: document.numPages }
    } finally {
        await document.destroy()
    }
}

function sidecarPages(asset) {
    const file = path.join(LIBRARY, 'derived', SIDECAR_VERSION, asset.sha256, 'pages.jsonl')
    if (!existsSync(file)) return null
    const pages = new Map(readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).map(page => [Number(page.pdf_page), page]))
    // a page with no text layer (or only Tesseract's reading) reads from its Vision OCR, when the book has one
    const ocr = path.join(PAGE_OCR, `${asset.edition_id}.jsonl`)
    if (existsSync(ocr)) {
        for (const row of readFileSync(ocr, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))) {
            const page = pages.get(Number(row.pdf_page))
            const had = String(page?.text || '').replace(/\s/gu, '').length
            // Vision reads stylised headings Tesseract misses
            const tesseract = /tesseract/u.test(String(page?.extraction_method || ''))
            if ((had >= 20 && !tesseract) || !String(row.text || '').trim()) continue
            pages.set(Number(row.pdf_page), { ...page, pdf_page: Number(row.pdf_page), text: row.text, ocr: true, lines: String(row.text).split('\n').filter(line => line.trim()).map(text => ({ text })) })
        }
    }
    return pages
}

// docs/data/textbooks/toc-transcribed/<edition>.tsv: 「# contents_pdf_pages」 then level, kind, title, printed_page rows,
// or 「# none」 when the book prints no 目录
function readTranscript(editionId) {
    const file = path.join(TRANSCRIPTS, `${editionId}.tsv`)
    if (!existsSync(file)) return null
    const lines = readFileSync(file, 'utf8').split('\n')
    const none = lines.find(line => /^#\s*none\b/u.test(line))
    if (none) return { none: none.replace(/^#\s*none\s*/u, '').trim() || 'no printed 目录' }
    // 「# pdf_offset 7」: PDF page = printed page + 7, checked by hand, for a scan whose OCR can't vote one or a book whose
    // stored page map is off
    const offsetLine = lines.find(line => /^#\s*pdf_offset\s+\d+/u.test(line))
    const pdfOffset = offsetLine ? Number(offsetLine.match(/\d+/u)[0]) : null
    const contentsPages = (lines.find(line => /^#\s*contents_pdf_pages/u.test(line)) || '').replace(/^#\s*contents_pdf_pages\s*/u, '').split(/[,，\s]+/u).map(Number).filter(Boolean)
    const rows = lines.filter(line => line.trim() && !line.startsWith('#')).map(line => line.split('\t')).filter(([level]) => /^\d$/u.test(level))
    const entries = []
    const open = []
    const seen = new Set()
    for (const [level, kind, rawTitle, printed] of rows) {
        const depth = Number(level)
        const title = String(rawTitle || '').trim()
        // a song the 目录 lists under both 演唱 and 欣赏, on the same page, is one entry
        const key = `${depth > 1 ? open[depth - 1] : ''}|${squash(title)}|${String(printed || '').trim()}`
        if (seen.has(key)) continue
        seen.add(key)
        const parsed = classifyLine(title)
        const entry = {
            type: parsed.type, label: parsed.label || '', title: parsed.title || title, starred: Boolean(parsed.starred),
            kind: ['unit', 'chapter', 'lesson', 'section', 'appendix', 'intro'].includes(kind) ? (kind === 'intro' ? 'unit' : kind) : 'lesson',
            level: depth, parent: depth > 1 ? (open[depth - 1] ?? null) : null,
            printed_page: /^\d+$/u.test(String(printed || '').trim()) ? Number(printed) : null,
            toc_pdf_page: contentsPages[0] || null,
            display_title: title
        }
        entry.keys = [...new Set([...verificationKeys(entry), title])]
        open[depth] = entries.length
        open.length = depth + 1
        entries.push(entry)
    }
    return { entries, contentsPages, pdfOffset }
}

// the first lines of a page and the lines in its upper part (pdf.js boxes count y from the bottom, OCR boxes from the top)
function topLines(page) {
    const lines = (page?.lines || []).map((line, index) => ({ text: String(line.text || ''), bbox: line.bbox || null, index }))
    const height = Number(page?.page_height) || Number(lines.find(line => line.bbox?.page_height)?.bbox.page_height) || 0
    return lines.filter(line => {
        if (line.index < (page?.ocr ? TOP_LINES_OCR : TOP_LINES)) return true
        if (!height || !line.bbox) return false
        return line.bbox.unit === 'pixel' ? line.bbox.y <= height * TOP_SHARE : line.bbox.y + line.bbox.height >= height * (1 - TOP_SHARE)
    })
}

// the top line that carries the words; 「Unit 1」 is not 「Unit 10」, a one-character title (鲸) starts its line
function lineWith(lines, key) {
    const target = squash(key)
    if (!target) return null
    const fits = (text, at) => !(/\d$/u.test(target) && /\d/u.test(text[at + target.length] || '')) && !(target.length < 2 && at > 0)
    for (const line of lines) {
        const text = squash(line.text)
        for (let at = text.indexOf(target); at >= 0; at = text.indexOf(target, at + 1)) if (fits(text, at)) return line
    }
    // a long title the page wraps over two or three lines, past a footnote mark between them (「7 培养…的」 「a」 「社会主义…」)
    if (target.length >= 6) {
        const wrapped = lines.filter(line => !/^[a-z0-9*]{1,2}$/iu.test(squash(line.text)))
        const squashed = wrapped.map(line => squash(line.text))
        for (let index = 0; index + 1 < wrapped.length; index += 1) {
            const text = squashed.slice(index, index + 3).join('')
            const at = text.indexOf(target)
            if (at >= 0 && at < squashed[index].length && fits(text, at)) return wrapped[index]
        }
    }
    return null
}

function pageMapping(structure) {
    const rows = (structure.page_map || []).filter(row => row.review_status === 'approved' && /^\d+$/u.test(String(row.printed_page)))
    return {
        pdfOfPrinted: new Map(rows.map(row => [Number(row.printed_page), Number(row.pdf_page)])),
        printedOfPdf: new Map(rows.map(row => [Number(row.pdf_page), String(row.printed_page)]))
    }
}

// Without a verified page map: the offset most entries are found at, if at least three agree
function votedOffset(parsed, sidecar, firstBodyPage, pageCount, anywhere = false) {
    const votes = new Map()
    const linesOf = page => (anywhere ? (page?.lines || []).map((line, index) => ({ text: String(line.text || ''), index })) : topLines(page))
    let tried = 0
    for (const entry of parsed.filter(item => item.printed_page != null)) {
        tried += 1
        for (let offset = 0; offset <= 40; offset += 1) {
            const pdfPage = Number(entry.printed_page) + offset
            if (pdfPage < firstBodyPage || pdfPage > pageCount) continue
            if (entry.keys.some(key => lineWith(linesOf(sidecar.get(pdfPage)), key))) {
                votes.set(offset, (votes.get(offset) || 0) + 1)
                break
            }
        }
    }
    const [offset, count] = [...votes].sort((a, b) => b[1] - a[1])[0] || []
    return count >= 3 && count >= tried * (anywhere ? 0.3 : 0.5) ? { offset, count, tried } : null
}

async function readPrintedToc(asset, structure, sidecar) {
    const pdfPath = path.join(LIBRARY, asset.object_path)
    if (!existsSync(pdfPath)) return { status: 'pdf_missing' }
    let { pdfOfPrinted, printedOfPdf } = pageMapping(structure)
    const transcript = useTranscripts ? readTranscript(asset.edition_id) : null
    let pageCount
    let contents
    let parsed
    if (transcript?.none) return { status: 'no_printed_contents', pageCount: asset.pages, reason: transcript.none }
    if (transcript) {
        pageCount = Number(asset.pages) || Math.max(...sidecar.keys())
        contents = transcript.contentsPages.map(pdfPage => ({ pdf_page: pdfPage }))
        parsed = transcript.entries
        if (!parsed.length || !contents.length) return { status: 'transcript_empty', pageCount }
    } else {
        const front = await frontPages(pdfPath)
        pageCount = front.pageCount
        const frontText = front.pages.reduce((sum, page) => sum + page.items.reduce((count, item) => count + item.text.trim().length, 0), 0)
        contents = findContentsPages(front.pages)
        if (!contents.length) return { status: frontText < 200 ? 'no_text_layer' : 'no_contents_page', pageCount }
        const read = pages => parseContents(contentsLines(pages), { numberedUnits: asset.subject_slug === 'math' })
        parsed = read(contents)
        // the contents end before the page its first entry is printed on
        const firstPrinted = Math.min(...parsed.filter(entry => entry.printed_page != null).map(entry => Number(entry.printed_page)))
        const bodyStart = pdfOfPrinted.get(firstPrinted)
        if (bodyStart && contents.some(page => page.pdf_page >= bodyStart)) {
            contents = contents.filter(page => page.pdf_page < bodyStart)
            parsed = contents.length ? read(contents) : []
        }
        if (!parsed.length) return { status: 'no_entries_read', pageCount, contents_pdf_pages: contents.map(page => page.pdf_page) }
        if (parsed.filter(entry => isGarbled(entry.display_title)).length >= parsed.length * 0.3) return { status: 'garbled_text_layer', pageCount, contents_pdf_pages: contents.map(page => page.pdf_page), parsed: parsed.length }
    }
    const lastContentsPage = Math.max(...contents.map(page => page.pdf_page))
    let offsetSource = 'page_map'
    if (transcript?.pdfOffset != null) {
        offsetSource = `transcript_offset:${transcript.pdfOffset}`
        pdfOfPrinted = new Map(Array.from({ length: pageCount }, (_, index) => [index + 1, index + 1 + transcript.pdfOffset]).filter(([, pdf]) => pdf <= pageCount))
        printedOfPdf = new Map([...pdfOfPrinted].map(([printed, pdf]) => [pdf, String(printed)]))
    } else if (!pdfOfPrinted.size) {
        // a transcribed scan: its OCR puts the title anywhere among the page's lines
        const voted = votedOffset(parsed, sidecar, lastContentsPage + 1, pageCount) || (transcript ? votedOffset(parsed, sidecar, lastContentsPage + 1, pageCount, true) : null)
        if (!voted) return { status: 'no_page_map', pageCount, contents_pdf_pages: contents.map(page => page.pdf_page), parsed: parsed.length }
        offsetSource = `contents_votes:${voted.count}/${voted.tried}`
        pdfOfPrinted = new Map(Array.from({ length: pageCount }, (_, index) => [index + 1, index + 1 + voted.offset]).filter(([, pdf]) => pdf <= pageCount))
        printedOfPdf = new Map([...pdfOfPrinted].map(([printed, pdf]) => [pdf, String(printed)]))
    }

    // anywhere on the page when the entry starts on the page of the entry just found above it (a poem under its
    // lesson, a 第一节 on its chapter's first page); otherwise near the top
    const findOn = (entry, pdfPage, wholePage = false) => {
        if (!(pdfPage > lastContentsPage) || pdfPage > pageCount || isGarbled(entry.display_title)) return null
        const page = sidecar.get(pdfPage)
        const lines = wholePage ? (page?.lines || []).map((line, index) => ({ text: String(line.text || ''), bbox: line.bbox || null, index })) : topLines(page)
        for (const key of entry.keys) {
            const line = lineWith(lines, key)
            if (line) return { pdf_page: pdfPage, line_index: line.index, verbatim_title: line.text.trim() }
        }
        return null
    }
    // the PDF page of the first entry under a heading that prints no page of its own (美术, 体育, 音乐 units)
    const firstPaged = index => {
        for (let next = index + 1; next < parsed.length; next += 1) {
            let parent = parsed[next].parent
            while (parent != null && parent !== index) parent = parsed[parent].parent
            if (parent !== index) return null
            if (parsed[next].printed_page != null) return pdfOfPrinted.get(Number(parsed[next].printed_page)) ?? null
        }
        return null
    }
    let lastPage = lastContentsPage
    for (const [index, entry] of parsed.entries()) {
        let evidence = null
        if (entry.printed_page != null) {
            const pdfPage = pdfOfPrinted.get(Number(entry.printed_page))
            evidence = pdfPage ? findOn(entry, pdfPage) || (pdfPage === lastPage ? findOn(entry, pdfPage, true) : null) : null
            if (!pdfPage) entry.reason = 'printed_page_not_in_page_map'
        } else {
            // the heading on the page of its first entry, or on an opener page just before it
            const start = firstPaged(index)
            for (const pdfPage of start ? [start - 2, start - 1, start] : []) if (!evidence) evidence = findOn(entry, pdfPage)
        }
        if (evidence && evidence.pdf_page < lastPage) {
            entry.reason = 'out_of_order'
            evidence = null
        }
        if (!evidence) {
            entry.reason ||= 'title_not_at_top_of_page'
            continue
        }
        entry.evidence = evidence
        entry.pdf_page = evidence.pdf_page
        lastPage = evidence.pdf_page
    }

    // A transcribed 目录 is the book's own list, read by eye: an entry whose title the page text does not show (a picture
    // heading, OCR noise, songs listed by kind rather than by page) still goes on the page its printed number maps to,
    // and a heading printed without a page goes where its first entry starts. At least a quarter must be found on
    // their pages, which shows the page numbers map right.
    let verifiedShare = null
    if (transcript) {
        const paged = parsed.filter(entry => entry.printed_page != null)
        verifiedShare = paged.filter(entry => entry.evidence).length / Math.max(1, paged.length)
        if (verifiedShare < 0.25) return { status: 'transcript_not_verified', pageCount, contents_pdf_pages: contents.map(page => page.pdf_page), parsed: parsed.length, verified_share: Number(verifiedShare.toFixed(2)) }
        for (const entry of parsed) {
            if (entry.evidence || entry.printed_page == null) continue
            const pdfPage = pdfOfPrinted.get(Number(entry.printed_page))
            if (!pdfPage || pdfPage <= lastContentsPage || pdfPage > pageCount) continue
            entry.evidence = { evidence_type: 'printed_toc_transcribed_page', pdf_page: pdfPage, line_index: null, verbatim_title: null }
            entry.pdf_page = pdfPage
            entry.placed = true
        }
        const childrenOf = index => parsed.map((entry, at) => ({ entry, at })).filter(({ entry }) => entry.parent === index)
        const firstStart = index => Math.min(...childrenOf(index).flatMap(({ entry, at }) => [entry.evidence ? entry.pdf_page : Infinity, firstStart(at)]), Infinity)
        for (const [index, entry] of parsed.entries()) {
            if (entry.evidence) continue
            const start = firstStart(index)
            if (Number.isFinite(start)) {
                entry.evidence = { evidence_type: 'printed_toc_transcribed_heading', pdf_page: start, line_index: null, verbatim_title: null }
                entry.pdf_page = start
                entry.placed = true
            }
        }
    }

    // the kept entries hang from their nearest kept heading
    let kept = parsed.map((entry, index) => ({ ...entry, index })).filter(entry => entry.evidence)
    // a transcribed list in book order (songs are printed by kind); a heading before what it holds
    if (transcript) kept = kept.sort((a, b) => a.pdf_page - b.pdf_page || a.level - b.level || a.index - b.index)
    const keptByIndex = new Map(kept.map(entry => [entry.index, entry]))
    for (const entry of kept) {
        let parent = entry.parent
        while (parent != null && !keptByIndex.has(parent)) parent = parsed[parent].parent
        entry.keptParent = parent ?? null
        entry.finalLevel = parent == null ? 1 : keptByIndex.get(parent).finalLevel + 1
    }
    // an entry runs to the page before the next entry at its level or above; the last ones to the end of the book
    for (const [position, entry] of kept.entries()) {
        const next = kept.slice(position + 1).find(other => other.finalLevel <= entry.finalLevel)
        entry.end = next ? Math.max(entry.pdf_page, next.pdf_page - 1) : pageCount
    }
    const existing = (structure.toc || []).filter(entry => entry.review_status === 'approved' && Number(entry.pdf_page) > 0)
    const used = new Set()
    const ids = new Map()
    for (const entry of kept) {
        const twin = existing.find(old => !used.has(old.entry_id)
            && UNIT_KINDS.has(old.kind) === UNIT_KINDS.has(entry.kind)
            && Math.abs(Number(old.pdf_page) - entry.pdf_page) <= 1
            && core(old.title) === core(entry.display_title))
        if (twin) used.add(twin.entry_id)
        ids.set(entry.index, twin?.entry_id || entryId(asset.edition_id, asset.sha256, entry.kind, entry.index + 1, entry.display_title))
    }
    const toc = kept.map((entry, position) => ({
        entry_id: ids.get(entry.index),
        parent_id: entry.keptParent == null ? null : ids.get(entry.keptParent),
        level: entry.finalLevel,
        kind: entry.kind,
        title: entry.display_title,
        pdf_page: entry.pdf_page,
        end_pdf_page: entry.end,
        printed_page: printedOfPdf.get(entry.pdf_page) ?? null,
        confidence: entry.placed ? 0.85 : 0.95,
        review_status: 'approved',
        source: TOC_SOURCE,
        source_order: position + 1,
        toc_pdf_page: entry.toc_pdf_page,
        toc_printed_page: entry.printed_page ?? null,
        heading_evidence: { evidence_type: 'printed_toc_title_at_page_top', ...entry.evidence }
    }))
    const unverified = parsed.filter(entry => !entry.evidence).map(entry => ({ title: entry.display_title, kind: entry.kind, toc_printed_page: entry.printed_page ?? null, toc_pdf_page: entry.toc_pdf_page, reason: entry.reason }))
    return {
        status: 'read',
        ...(verifiedShare != null ? { verified_share: Number(verifiedShare.toFixed(2)) } : {}),
        pageCount,
        toc,
        parsed,
        unverified,
        reused_entry_ids: used.size,
        contents_pdf_pages: contents.map(page => page.pdf_page),
        page_offset_source: offsetSource
    }
}

const unitCount = toc => toc.filter(entry => UNIT_KINDS.has(entry.kind) && !LESSON_LIKE.test(String(entry.title || '').trim())).length
const lastStart = toc => Math.max(0, ...toc.map(entry => Number(entry.pdf_page) || 0))

// The printed toc replaces the stored one only when it is readable (most entries found on their pages, the units
// among them) and clearly better: more units without covering less, or much more of the book.
function decide(result, stored, pageCount) {
    const { toc, parsed } = result
    const parsedUnits = parsed.filter(entry => UNIT_KINDS.has(entry.kind)).length
    const share = toc.length / Math.max(1, parsed.length)
    const unitShare = parsedUnits ? unitCount(toc) / parsedUnits : 1
    // a transcribed 目录 passed its own check (a quarter of it found on its pages) in readPrintedToc
    if (toc.length < 3 || (result.verified_share == null && (share < 0.6 || unitShare < 0.75))) return { replace: false, reason: `not_confident (${toc.length}/${parsed.length} entries, ${unitCount(toc)}/${parsedUnits} units found)` }
    if (stored.length && stored.every(entry => entry.source === TOC_SOURCE)) return { replace: true, reason: 'refresh_printed_toc' }
    if (!stored.length) return { replace: true, reason: 'no_stored_toc' }
    // more units, as far into the book as the stored toc goes (or past 60% of it: a long last unit, 整理和复习)
    if (unitCount(toc) > unitCount(stored) && lastStart(toc) >= Math.min(lastStart(stored) - 3, 0.6 * pageCount)) return { replace: true, reason: 'more_units' }
    if (lastStart(toc) - lastStart(stored) >= 0.25 * pageCount && unitCount(toc) >= unitCount(stored)) return { replace: true, reason: 'covers_more' }
    // the lessons the stored toc lacks (语文 课文 and 语文园地, 道法 课 and 框, 理化 节), as far into the book. Fewer units
    // is fine here: stored tocs count openers and appendices as units (我上学了, 开启科学探索之旅, 附录)
    if (lastStart(toc) >= lastStart(stored) - 3 && toc.length >= stored.length + 2) return { replace: true, reason: 'more_lessons' }
    return { replace: false, reason: 'stored_toc_as_good' }
}

const selected = editions.length ? editions.map(id => assets.find(asset => asset.edition_id === id) || { edition_id: id, missing: true }) : assets
const report = []
for (const asset of selected) {
    const structurePath = path.join(STRUCTURES, `${asset.edition_id}.json`)
    const row = { edition_id: asset.edition_id, title: titles.get(asset.edition_id) || null }
    if (asset.missing || !existsSync(structurePath)) { report.push({ ...row, status: 'not_in_library' }); continue }
    const structure = JSON.parse(readFileSync(structurePath, 'utf8'))
    const sidecar = sidecarPages(asset)
    if (!sidecar) { report.push({ ...row, status: 'no_sidecar' }); continue }
    const stored = (structure.toc || []).filter(entry => entry.review_status === 'approved' && Number(entry.pdf_page) > 0)
    const before = { entries: stored.length, units: unitCount(stored), last_pdf_page: lastStart(stored), sources: [...new Set(stored.map(entry => entry.source))] }
    let result
    try {
        result = await readPrintedToc(asset, structure, sidecar)
    } catch (error) {
        report.push({ ...row, status: 'failed', error: error.message, before })
        continue
    }
    if (result.status !== 'read') { report.push({ ...row, ...result, before }); continue }
    const choice = decide(result, stored, result.pageCount)
    const after = { entries: result.toc.length, units: unitCount(result.toc), last_pdf_page: lastStart(result.toc) }
    report.push({
        ...row,
        status: choice.replace ? (dryRun ? 'would_replace' : 'replaced') : 'kept_stored',
        reason: choice.reason,
        page_count: result.pageCount,
        contents_pdf_pages: result.contents_pdf_pages,
        page_offset_source: result.page_offset_source,
        transcribed: Boolean(useTranscripts && readTranscript(asset.edition_id)),
        ...(result.verified_share != null ? { verified_share: result.verified_share } : {}),
        parsed: result.parsed.length,
        before,
        printed: after,
        reused_entry_ids: result.reused_entry_ids,
        unverified: result.unverified
    })
    if (verbose) {
        console.error(`== ${row.title} ${asset.edition_id} (${choice.reason}; 目录 PDF ${result.contents_pdf_pages.join(', ')}; ${result.page_offset_source})`)
        for (const entry of result.toc) console.error(`  ${'  '.repeat(entry.level - 1)}${entry.title} · 印刷页 ${entry.printed_page ?? '—'} · PDF ${entry.pdf_page}–${entry.end_pdf_page} · ${entry.heading_evidence.verbatim_title?.slice(0, 40) ?? `（按目录${entry.heading_evidence.evidence_type.endsWith("heading") ? "单元" : "页码"}放置）`}`)
        for (const entry of result.unverified) console.error(`  ✗ ${entry.title} (目录 p.${entry.toc_printed_page ?? '—'}): ${entry.reason}`)
    }
    if (choice.replace && !dryRun) {
        // a refresh keeps the record of why and what the printed toc first replaced
        const first = choice.reason === 'refresh_printed_toc' ? structure.printed_toc : null
        structure.toc = result.toc
        structure.printed_toc = {
            algorithm_version: PRINTED_TOC_VERSION,
            provenance: 'machine_generated',
            review_policy: 'automatic_no_human_gate',
            evidence_policy: 'printed_contents_page_number_and_title_at_page_top',
            ...(useTranscripts && readTranscript(asset.edition_id) ? { contents_read_from: `docs/data/textbooks/toc-transcribed/${asset.edition_id}.tsv`, verified_share: result.verified_share } : {}),
            contents_pdf_pages: result.contents_pdf_pages,
            page_offset_source: result.page_offset_source,
            decision: first?.decision ?? choice.reason,
            parsed_entry_count: result.parsed.length,
            approved_entry_count: result.toc.length,
            reused_entry_id_count: result.reused_entry_ids,
            unverified_entries: result.unverified,
            replaced_toc: first?.replaced_toc ?? before
        }
        writeFileSync(structurePath, `${JSON.stringify(structure, null, 2)}\n`)
    }
}
for (const row of report) {
    const counts = row.printed ? `${row.before.units}u/${row.before.entries}e/p${row.before.last_pdf_page} → ${row.printed.units}u/${row.printed.entries}e/p${row.printed.last_pdf_page} (${row.parsed} read, ${row.unverified.length} not found)` : `${row.before?.units ?? 0}u/${row.before?.entries ?? 0}e`
    console.log(`${row.status.padEnd(16)} ${row.edition_id} ${(row.title || '').padEnd(22)} ${counts} ${row.reason || row.error || ''}`)
}
if (reportPath) writeFileSync(path.resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`)
