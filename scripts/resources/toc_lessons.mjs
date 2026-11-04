// What a book's own 目录 adds to its 国家平台 同步课 list, so a book's lessons are all of its lessons (语文5上 2025: the
// platform lists only 第一单元's four). build_national_lessons.mjs writes them into the book's lesson file with
// `toc: true`; the 课标对应表, the unit map, AI 备课 and the MCP tools read them from there.
//   A unit no platform lesson falls in comes from the 目录 whole: its lessons, or the unit itself when the 目录 lists
//   none under it (not a bare 「第一单元」). A unit the platform has gets the 目录 lessons it misses, but only when every
//   platform lesson of that unit is linked to an entry of the 目录; otherwise the two name lessons too differently to tell
//   what is missing (人教 数学 「约分（第一课时）」 against the 目录's 「约分」). A 目录 with no units (美术 常锐伦) gives its
//   top-level lessons the platform does not have.

const NUMERALS = '一二三四五六七八九'
const digit = char => NUMERALS.indexOf(char) + 1
// 二十七 is 27, 十二 is 12
function numberOf(text) {
    if (/^\d+$/u.test(text)) return Number(text)
    const at = text.indexOf('十')
    if (at < 0) return digit(text)
    const ones = text.slice(at + 1)
    return (at === 0 ? 1 : digit(text.slice(0, at))) * 10 + (ones ? digit(ones) : 0)
}
const ORDINAL = /^(?:第\s*([一二三四五六七八九十\d]+)\s*(?:单元|章|部分|模块|主题)|([一二三四五六七八九十]+)\s*[、.．]|(\d+)[\s、.．]|unit\s*(\d+))/iu
const ordinalOf = title => {
    const match = title.trim().match(ORDINAL)
    const value = match?.[1] || match?.[2] || match?.[3] || match?.[4]
    return value ? numberOf(value) : null
}
// a 目录 unit named only by its number (美术 「第一单元」) says nothing to plan from
const BARE_UNIT = /^(?:第\s*[一二三四五六七八九十\d]+\s*(?:单元|章|部分|模块|主题)|unit\s*\d+)$/iu
const plain = title => String(title || '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()
const cleanTitle = title => String(title || '').replace(/^(?:第[一二三四五六七八九十百零\d]+(?:单元|章|节|课)|课题\s*\d+|\d+(?:\.\d+)*\*?)\s*/u, '').trim()
// a platform chapter and a 目录 unit are the same unit: same number (「第一单元 古代亚非文明」, 「第一单元 文明的产生和古代亚非文明」)
// or one name holds the other (「第一单元 坚持党的全面领导」, 「坚持党的全面领导」)
function sameUnit(chapter, unit) {
    const number = ordinalOf(chapter)
    if (number && number === ordinalOf(unit)) return true
    const [a, b] = [plain(chapter), plain(unit)]
    return a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a))
}

/**
 * @param platform the book's 国家平台 lessons ({ id, title, chapters, pdf_page, unit_id })
 * @param toc the book's approved 目录 entries ({ entry_id, kind, parent_id, title, pdf_page, end_pdf_page })
 * @returns lessons in the 国家平台 lesson shape, with `toc: true`, `unit_id` and `id` = the 目录 entry
 */
export function tocLessons(platform, toc) {
    const children = new Map()
    for (const entry of toc) if (entry.parent_id) children.set(entry.parent_id, [...(children.get(entry.parent_id) || []), entry])
    const below = entry => [entry.entry_id, ...(children.get(entry.entry_id) || []).flatMap(below)]
    const linked = new Set(platform.map(item => item.unit_id).filter(Boolean))
    const chapters = [...new Set(platform.map(item => item.chapters[0]).filter(Boolean))]
    const fromToc = (entry, chapter) => ({ id: entry.entry_id, title: entry.title, chapters: chapter ? [chapter] : [], pdf_page: entry.pdf_page ?? null, unit_id: entry.entry_id, materials: [], hours: 1, toc: true })
    const platformTitles = new Set(platform.map(item => plain(cleanTitle(item.title))))
    const out = []
    for (const top of toc.filter(entry => !entry.parent_id)) {
        if (!['unit', 'chapter'].includes(top.kind)) {
            // a lesson at the top of a 目录 that has no units
            if (top.kind === 'appendix' || toc.some(entry => !entry.parent_id && ['unit', 'chapter'].includes(entry.kind))) continue
            const onPage = platform.some(item => item.unit_id === top.entry_id || (top.pdf_page && item.pdf_page && item.pdf_page >= top.pdf_page && item.pdf_page <= (top.end_pdf_page || top.pdf_page)))
            if (!onPage && !platformTitles.has(plain(cleanTitle(top.title)))) out.push(fromToc(top, null))
            continue
        }
        const unit = top
        const ids = new Set(below(unit))
        const first = unit.pdf_page || 0
        const last = unit.end_pdf_page || first
        const parts = (children.get(unit.entry_id) || []).filter(entry => entry.kind !== 'appendix')
        const onPlatform = platform.some(item => (item.unit_id && ids.has(item.unit_id)) || (first && item.pdf_page && item.pdf_page >= first && item.pdf_page <= last))
        if (!onPlatform && !chapters.some(name => sameUnit(name, unit.title))) {
            // its lessons, or the unit itself when the 目录 lists none under it
            if (parts.length) out.push(...parts.map(entry => fromToc(entry, unit.title)))
            else if (!BARE_UNIT.test(unit.title.trim())) out.push(fromToc(unit, unit.title))
            continue
        }
        const chapter = platform.find(item => item.unit_id && ids.has(item.unit_id))?.chapters[0]
        const same = platform.filter(item => chapter && item.chapters[0] === chapter)
        if (!chapter || !same.every(item => item.unit_id && ids.has(item.unit_id))) continue
        const titles = new Set(same.map(item => plain(cleanTitle(item.title))))
        for (const entry of parts) {
            if (below(entry).some(id => linked.has(id)) || titles.has(plain(cleanTitle(entry.title)))) continue
            out.push(fromToc(entry, chapter))
        }
    }
    // one entry (美术8上 has only its theme page) is not a 目录 to pick lessons from
    return platform.length || out.length > 1 ? out : []
}
