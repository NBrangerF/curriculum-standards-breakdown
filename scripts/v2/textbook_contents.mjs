// Read a textbook's 目录 (contents) pages from its extracted page text and return the chapter / section / lesson
// titles with their printed and PDF pages. Used where the stored TOC has bare numbers ("第一章") without titles.
import { existsSync, readFileSync } from 'node:fs'

const LIBRARY = '/Volumes/X9 Pro/kebiao-library'
const HEAD = /^(第[一二三四五六七八九十百零\d]+(?:单元|章|节|课)|课题\s*\d+|实验活动\s*\d+|绪言|绪论|活动课|综合性学习|跨学科实践活动|跨学科实践)\s*[:：]?\s*(.*)$/u
const LEVEL = { 单元: 1, 章: 1, 节: 2, 课: 2, 课题: 2, 实验活动: 2 }
// Some text layers repeat each run three times ("生物和生物圈生物和生物圈生物和生物圈", "111"); OCR'd pages space
// out the characters ("第 八 章 运动 和 力").
const isTriple = token => token.length >= 3 && token.length % 3 === 0 && token === token.slice(0, token.length / 3).repeat(3)
let tripled = false
const once = token => (tripled && isTriple(token) ? token.slice(0, token.length / 3) : token)
const normal = text => text.replace(/[.…·]{2,}/gu, ' ').replace(/\s+/gu, ' ').trim()
    .split(' ').map(once).join(' ')
    .replace(/(\p{Script=Han})\s+(?=\p{Script=Han})/gu, '$1').replace(/第\s*(\d+)\s*(节|课)/gu, '第$1$2')

export function pagesFor(registryPath, editionId) {
    const line = readFileSync(registryPath, 'utf8').split('\n').find(l => l.includes(`"edition_id":"${editionId}"`) && l.includes('"student_textbook"'))
    if (!line) return null
    const sha = JSON.parse(line).object_path.split('/').pop().replace(/\.pdf$/u, '')
    const file = `${LIBRARY}/derived/textbook-content-v2/${sha}/pages.jsonl`
    return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : null
}

// The difference between PDF and printed page numbers, voted from the page numbers printed at page feet.
function pageOffset(pages) {
    const votes = new Map()
    for (const p of pages.slice(4)) {
        const lines = p.text.split('\n').map(t => t.trim()).filter(Boolean)
        for (const t of [lines[0], lines.at(-1)]) {
            const m = t?.match(/^(\d{1,3})(?:\s|$)|(?:\s|^)(\d{1,3})$/u)
            const n = m ? Number(m[1] || m[2]) : NaN
            if (n > 0 && n < p.pdf_page) votes.set(p.pdf_page - n, (votes.get(p.pdf_page - n) || 0) + 1)
        }
    }
    return [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

export function readContents(pages) {
    const start = pages.findIndex(p => p.pdf_page <= 14 && /目\s*录/u.test(p.text.slice(0, 40)))
    if (start < 0) return []
    const offset = pageOffset(pages)
    // a book whose text layer repeats every run three times: most longer words on the contents pages are triples
    const words = pages.slice(start, start + 3).flatMap(p => p.text.split(/\s+/u)).filter(w => w.length >= 6)
    tripled = words.length > 0 && words.filter(isTriple).length / words.length > 0.3
    const out = []
    let pending = null
    for (const p of pages.slice(start, start + 6)) {
        // the contents end where the body starts: a page with no heading and no dotted leader
        if (p.pdf_page > pages[start].pdf_page && !/\.{4,}|…{2,}/u.test(p.text) && !p.text.split('\n').some(t => HEAD.test(normal(t)))) break
        for (const raw of p.text.split('\n')) {
            const t = normal(raw)
            if (!t) continue
            const head = t.match(HEAD)
            const num = t.match(/\s(\d{1,3})$/u) || t.match(/^(\d{1,3})$/u)
            if (head) {
                const title = head[2].replace(/\s\d{1,3}$/u, '').trim()
                const unit = head[1].match(/单元|章|节|课题|实验活动|课/u)?.[0]
                pending = { label: head[1].replace(/\s+/gu, ''), title, level: LEVEL[unit] || 1, printed_page: num ? Number(num[1]) : null }
                out.push(pending)
            } else if (pending && !pending.title && !num) {
                pending.title = t
            } else if (pending && pending.printed_page == null && num) {
                pending.printed_page = Number(num[1])
            } else if (pending && num && !/^\d/u.test(t) && t.length < 30) {
                // a section line without its own marker ("活动 …… 24")
            }
        }
    }
    return out.filter(e => e.title || e.label).map(e => ({ ...e, pdf_page: e.printed_page != null && offset != null ? e.printed_page + offset : null }))
}
