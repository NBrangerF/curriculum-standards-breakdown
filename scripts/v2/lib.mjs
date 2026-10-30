// Shared helpers for the v2 standards build (三层结构：标准 → 要点 → 表现示例).
import { existsSync, readFileSync } from 'node:fs'

export const SUBJECT_NAMES = {
    chinese: '语文', math: '数学', english: '英语', morality_law: '道德与法治', history: '历史', geography: '地理',
    science: '科学', physics: '物理', chemistry: '化学', biology: '生物学', it: '信息科技', pe: '体育与健康', arts: '艺术', labor: '劳动'
}
export const SUBJECT_PREFIX = {
    chinese: 'CN', math: 'MA', english: 'EN', morality_law: 'ML', history: 'HI', geography: 'GE',
    science: 'SC', physics: 'PH', chemistry: 'CH', biology: 'BI', it: 'IT', pe: 'PE', arts: 'AR', labor: 'LA'
}
// Official stages per subject (课标原学段) → stage code S0–S4.
export const STAGES = {
    default: { '1-2': 'S1', '3-4': 'S2', '5-6': 'S3', '7-9': 'S4' },
    arts: { '1-2': 'S1', '3-5': 'S2', '6-7': 'S3', '8-9': 'S4' },
    english: { '1-2': 'S0', '3-4': 'S1', '5-6': 'S2', '7-9': 'S3' }
}
export const stageCode = (slug, stage) => (STAGES[slug] || STAGES.default)[stage]
export const gradesOf = range => {
    const m = String(range || '').match(/(\d)(?:-(\d))?/u)
    if (!m) return []
    const out = []
    for (let g = +m[1]; g <= +(m[2] || m[1]); g += 1) out.push(g)
    return out
}

export const loadCatalog = (version, slug) => JSON.parse(readFileSync(`generated/source_catalog/${version}/${slug}.json`, 'utf8')).entries

// For each 2025r catalogue entry: is its text confirmed by the 2022 edition, changed by the revision, or in doubt (OCR)?
// Unchanged clauses are read from two different scans, so agreement is a cross-check of the OCR.
export function revisionIndex(slug) {
    const file = `generated/revision_diff/${slug}.json`
    const byB = new Map()
    if (!existsSync(file)) return byB
    for (const hunk of JSON.parse(readFileSync(file, 'utf8')).hunks) {
        if (!hunk.b) continue
        for (const id of hunk.b.entry_ids) {
            const prev = byB.get(id)
            // A real change wins over an OCR doubt for the same entry.
            if (prev && !prev.ocr_suspect) continue
            byB.set(id, { ocr_suspect: hunk.ocr_suspect, type: hunk.type, text_2022: hunk.a?.text || '', page_2022: hunk.a?.page ?? null, changes: hunk.changes })
        }
    }
    return byB
}

// Sentences broken at a page or column end ("……良" + "好劳动习惯。") are joined back.
export function joinBroken(entries) {
    const out = []
    for (const e of entries) {
        const last = out[out.length - 1]
        if (last && !/[。；！？]$/u.test(last.text.trim()) && last.section === e.section && last.stage === e.stage && last.topicKey === e.topicKey) {
            last.text += e.text
            last.ids.push(e.id)
            last.pages = [...new Set([...last.pages, e.page])]
        } else out.push({ ...e, ids: [e.id], pages: [e.page] })
    }
    return out
}

export const plain = text => String(text || '').replace(/[\s　]/gu, '')
export const strip = text => plain(text).replace(/[，。；、：！？“”"'‘’（）()《》【】\[\]·•—\-～~]/gu, '')
export function grams(text) {
    const s = strip(text)
    const m = new Map()
    for (let i = 0; i < s.length - 1; i += 1) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1) }
    return m
}
const total = m => { let n = 0; for (const v of m.values()) n += v; return n }
export function recall(a, b) { let n = 0; for (const [g, v] of a) n += Math.min(v, b.get(g) || 0); const t = total(a); return t ? n / t : 0 }
export const dice = (a, b) => { let n = 0; for (const [g, v] of a) n += Math.min(v, b.get(g) || 0); const t = total(a) + total(b); return t ? (2 * n) / t : 0 }

// Clean an official sentence for display: drop leading item markers left in the text and trailing spaces.
export const tidy = text => plain(text).replace(/^[①-⑳]/u, '')

// OCR corrections checked against the PDF: a global list of glyph confusions plus one list per subject.
export function loadOcrFixes(slug) {
    const read = file => existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('\t')).filter(p => p[0] && p[1] !== undefined && p[0] !== p[1]) : []
    const tag = (rows, file) => rows.map(([find, replace, note]) => [find, replace, note, file])
    return [...tag(read('docs/data/v2/ocr-fixes/_global.tsv'), '_global'), ...tag(read(`docs/data/v2/ocr-fixes/${slug}.tsv`), slug)]
}
export function applyFixes(text, fixes, used) {
    let out = text
    for (const [find, replace] of fixes) {
        if (out.includes(find)) { out = out.split(find).join(replace); used?.add(find) }
    }
    return out
}
// Split a joined passage back into sentences at 。；！？ (keeping the mark).
export const splitSentences = text => text.split(/(?<=[。；！？])/u).map(s => s.trim()).filter(s => s.replace(/[。；，、\s]/gu, '').length >= 2)

// Tab-separated spec files under docs/data/v2/ ('#' lines are comments).
export const readTsv = file => existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('\t')) : []

// Rebuild paragraphs from catalogue lines: lines of one paragraph are joined, and so are paragraphs
// broken at a page or column end (the previous one does not end a sentence and the next has no item marker).
// OCR reads ⑩⑪⑫ as "10" "1" "12" and "（3）" as "（3 ", so a leading number counts as a marker.
const MARKED = /^(?:1\d|20|[1-9])(?=[\u4e00-\u9fff*])|^（\d/u
export function paragraphs(entries, key) {
    const out = []
    for (const e of entries) {
        const last = out[out.length - 1]
        const marked = Boolean(e.marker) || MARKED.test(e.text)
        if (last && last.key === key(e) && (last.para === e.para || (!marked && !/[。！？]$/u.test(last.text)))) {
            last.text += e.text
            last.ids.push(e.id)
            if (!last.pages.includes(e.page)) last.pages.push(e.page)
            last.para = e.para
            continue
        }
        out.push({ key: key(e), para: e.para, marker: e.marker || '', stage: e.stage, section: e.section, topic: e.topic || [], text: e.text, ids: [e.id], pages: [e.page] })
    }
    return out
}
