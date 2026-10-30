#!/usr/bin/env node
// Link the v2 standards of the five junior subjects added in 2025 (历史、地理、物理、化学、生物学) to their textbooks.
// Usage: node scripts/v2/align_textbooks.mjs [slug…]   → data/v2/textbook_links/<slug>.json (and a summary to check)
//
// Two kinds of evidence, both machine-made and shown as 待核验:
//   grade_basis  the textbook volume and chapter each 要点 was placed in when its grade was set (docs/data/v2/grades)
//   toc_title    a chapter, section or lesson title from the textbook's table of contents that the standard's own text
//                contains (most of the title's character pairs appear in the 标准 or one of its 要点)
// A standard whose 要点 name a volume but no title matched still links to that volume as a whole (scope).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { grams, recall } from './lib.mjs'
import { pagesFor, readContents } from './textbook_contents.mjs'

const SUBJECTS = ['history', 'geography', 'physics', 'chemistry', 'biology']
const slugs = process.argv.slice(2).length ? process.argv.slice(2) : SUBJECTS
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const GRADE = { 七: 7, 八: 8, 九: 9 }
const units = new Set(readJson('public/data/textbooks/units.json').items.map(u => u.entry_id))
// The textbook drive holds each book's page text; its 目录 pages give the titles the stored TOC often lacks.
const GENERATIONS = 'data/textbooks/library-state/generations'
const REGISTRY = existsSync(GENERATIONS) ? `${GENERATIONS}/${readdirSync(GENERATIONS).sort().pop()}/asset_registry.lock.jsonl` : null
const contentsCache = existsSync('data/v2/textbook_links/contents.json') ? readJson('data/v2/textbook_links/contents.json') : {}
function contentsOf(editionId) {
    if (!contentsCache[editionId]) {
        const pages = REGISTRY ? pagesFor(REGISTRY, editionId) : null
        if (pages) contentsCache[editionId] = readContents(pages)
    }
    return contentsCache[editionId] || []
}
// Titles from the 目录, attached to the stored TOC entry with the same number (第一章 …) on about the same page.
function tocOf(editionId, stored) {
    const contents = contentsOf(editionId)
    if (!contents.length) return stored
    const filled = contents.map((c, k) => ({ ...c, pdf_page: c.pdf_page ?? contents.slice(k + 1).find(x => x.pdf_page != null)?.pdf_page ?? null }))
    return filled.filter(c => cjk(cleanTitle(c.title)) >= 2).map(c => {
        const twin = stored.find(e => String(e.title).replace(/\s+/gu, '').startsWith(c.label) && c.pdf_page != null && e.pdf_page != null && Math.abs(e.pdf_page - c.pdf_page) <= 3)
        return { entry_id: twin?.entry_id || `toc_${editionId}_${c.pdf_page ?? 'x'}_${c.label}`, title: `${c.label} ${c.title}`, level: c.level, printed_page: c.printed_page, pdf_page: c.pdf_page }
    })
}
const editions = readJson('public/data/textbooks/index.json').items

// "第三章 物态变化" → "物态变化"; "声 现 象" → "声现象"; "生物圈中的其他生物46" → "生物圈中的其他生物"
const cleanTitle = title => String(title || '').replace(/\s+/gu, '')
    .replace(/^(?:第[一二三四五六七八九十百零\d]+[章节课单元部分]|课题\d+|实验活动\d+)/u, '').replace(/^[:：、.]/u, '').replace(/\d+$/u, '')
const cjk = text => (text.match(/\p{Script=Han}/gu) || []).length

// "八年级上册 第五单元 生物圈中的其他生物、第六单元 生物的多样性及其保护" → grade 8, 上册, two chapter names
function parseBasis(basis) {
    const m = String(basis || '').match(/([七八九])年级((?:上册|下册|全一册)(?:、(?:上册|下册))?)?/u)
    if (!m) return null
    const volumes = m[2] ? m[2].split('、') : []
    const rest = String(basis).slice(m.index + m[0].length).replace(/[（(][^）)]*[）)]/gu, '').trim()
    const chapters = rest ? rest.split(/[、，,]/u).map(cleanTitle).filter(t => cjk(t) >= 2) : []
    return { grade: GRADE[m[1]], volumes, chapters }
}

for (const slug of slugs) {
    const data = readJson(`data/v2/by_subject/${slug}.json`)
    const books = editions.filter(b => b.subject_slug === slug).map(b => {
        const detail = readJson(`public/data/textbooks/by-edition/${b.edition_id}.json`)
        const toc = tocOf(b.edition_id, detail.toc || []).map(e => ({ ...e, clean: cleanTitle(e.title) })).filter(e => cjk(e.clean) >= 2)
        return { ...b, gradeNum: Number(String(b.grade).match(/\d/u)?.[0]), toc }
    })
    const out = {}
    const report = []
    for (const s of data.standards) {
        const texts = [s.level2, s.statement, ...s.indicators.map(i => i.text)]
        const all = grams(texts.join(''))
        const bases = s.indicators.map(i => parseBasis(i.grade_basis)).filter(Boolean)
        // Books named by the 要点's grade evidence; with none, every book of the subject is a candidate.
        const named = books.filter(b => bases.some(x => x.grade === b.gradeNum && (!x.volumes.length || x.volumes.includes(b.volume))))
        const candidates = named.length ? named : books
        const chapters = [...new Set(bases.flatMap(x => x.chapters))]
        const links = []
        for (const b of candidates) {
            for (const e of b.toc) {
                const byBasis = chapters.some(c => c === e.clean || (c.length >= 3 && (c.includes(e.clean) || e.clean.includes(c))))
                // a two-character title (化学「空气」「金属」) counts only when the standard's name contains it
                const byTitle = cjk(e.clean) >= 3 ? recall(grams(e.clean), all) : s.level2.includes(e.clean) ? 1 : 0
                const score = byBasis ? 1 : byTitle
                if (score < 0.75) continue
                // the 要点 whose text holds the title best, for the anchor
                const best = s.indicators.map(i => ({ code: i.code, r: recall(grams(e.clean), grams(i.text)) })).sort((x, y) => y.r - x.r)[0]
                links.push({
                    edition_id: b.edition_id,
                    textbook_title: `${b.edition_name}${b.title}`,
                    entry_id: e.entry_id,
                    unit_id: units.has(e.entry_id) ? e.entry_id : null,
                    // tidy OCR'd titles: no spaces inside words, none around 、, no stray letters at the end
                    title: String(e.title).replace(/\s+/gu, ' ').replace(/(\p{Script=Han}) (?=\p{Script=Han})/gu, '$1').replace(/\s*、\s*/gu, '、').replace(/\s+[A-Za-z0-9]{1,3}$/u, '').trim()
                        .replace(/^(第[一二三四五六七八九十百零\d]+[章节课]|第[一二三四五六七八九十百零\d]+单元|课题\d+|实验活动\d+)\s*(?=\S)/u, '$1 '),
                    level: e.level,
                    printed_page: e.printed_page ?? null,
                    pdf_page: e.pdf_page ?? null,
                    indicator: best && best.r >= 0.5 ? best.code : null,
                    method: byBasis ? 'grade_basis' : 'toc_title',
                    score: +score.toFixed(2)
                })
            }
        }
        // one link per TOC entry, best first; chapters before their sections at equal score
        const seen = new Set()
        const kept = links.sort((a, b) => b.score - a.score || a.level - b.level || (a.pdf_page ?? 0) - (b.pdf_page ?? 0))
            .filter(l => { const key = `${l.edition_id}|${cleanTitle(l.title)}`; return !seen.has(key) && seen.add(key) }).slice(0, 8)
            .sort((a, b) => a.edition_id.localeCompare(b.edition_id) || (a.pdf_page ?? 0) - (b.pdf_page ?? 0))
        // a book named by the grade evidence with no chapter link stays linked as a whole when its contents could not be
        // read, or when no book got a chapter link (otherwise the chapter links show which volume it is)
        for (const b of named.filter(x => x.toc.length < 3 || !kept.some(l => l.entry_id))) {
            if (!kept.some(l => l.edition_id === b.edition_id)) kept.push({ edition_id: b.edition_id, textbook_title: `${b.edition_name}${b.title}`, entry_id: null, unit_id: null, title: null, level: 0, printed_page: null, pdf_page: null, indicator: null, method: 'grade_basis_volume', score: 1 })
        }
        if (kept.length) out[s.code] = kept
        report.push(`${s.code} ${s.level2}\n    ${kept.length ? kept.map(l => `${l.textbook_title.replace(/^人教版|^统编版/u, '')} ${l.title || '（整册）'} p${l.printed_page ?? '-'} [${l.method} ${l.score}]`).join('\n    ') : '— no textbook link'}`)
    }
    mkdirSync('data/v2/textbook_links', { recursive: true })
    // keep the parsed contents, so later runs (and the deploy build) do not need the textbook drive
    writeFileSync('data/v2/textbook_links/contents.json', `${JSON.stringify(contentsCache)}\n`)
    writeFileSync(`data/v2/textbook_links/${slug}.json`, `${JSON.stringify({ subject_slug: slug, method: 'v2-textbook-links-1 (grade evidence + TOC titles; machine-made, 待核验)', links: out }, null, 1)}\n`)
    const linked = Object.keys(out).length
    const specific = Object.values(out).filter(ls => ls.some(l => l.entry_id)).length
    console.log(`${slug}: ${data.standards.length} standards, ${linked} linked (${specific} to a chapter/lesson), ${books.length} books`)
    if (process.env.REPORT) console.log(report.join('\n'))
}
