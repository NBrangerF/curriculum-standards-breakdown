// 知识图谱 data: one file per subject (built by scripts/v2/build_knowledge_graph.mjs into public/data/v2/graph),
// the lessons of its 要点 (loaded when one is opened) and a search index over every subject.

const BASE = '/data/v2/graph'

export const GRAPH_SUBJECTS = [
    ['chinese', '语文'], ['math', '数学'], ['english', '英语'], ['morality_law', '道德与法治'], ['history', '历史'],
    ['geography', '地理'], ['science', '科学'], ['physics', '物理'], ['chemistry', '化学'], ['biology', '生物学'],
    ['it', '信息科技'], ['pe', '体育与健康'], ['arts', '艺术'], ['labor', '劳动']
]
export const isGraphSubject = slug => GRAPH_SUBJECTS.some(([value]) => value === slug)

const cache = new Map()
function load(path) {
    if (!cache.has(path)) {
        cache.set(path, fetch(`${BASE}${path}`).then(response => {
            if (!response.ok) throw new Error('知识图谱数据加载失败')
            return response.json()
        }).catch(error => {
            cache.delete(path)
            throw error
        }))
    }
    return cache.get(path)
}

export const loadGraph = slug => load(`/${slug}.json`)
export const loadGraphLessons = slug => load(`/lessons/${slug}.json`)
export const loadGraphSearch = () => load('/search.json')
export const loadGraphManifest = () => load('/manifest.json')

export const graphHref = (slug, code) => `/knowledge-graph/${slug}${code ? `?focus=${encodeURIComponent(code)}` : ''}`
export const standardHref = code => `/standards/${code.replace(/\.\d+$/u, '')}#${code}`
export const pointNumber = code => code.split('.').pop()
const PREFIX_SLUG = { CN: 'chinese', MA: 'math', EN: 'english', ML: 'morality_law', HI: 'history', GE: 'geography', SC: 'science', PH: 'physics', CH: 'chemistry', BI: 'biology', IT: 'it', PE: 'pe', AR: 'arts', LA: 'labor' }
export const slugOfCode = code => PREFIX_SLUG[String(code).slice(0, 2)] || null

/** A 要点 of this subject or one the file carries from another (a cross-subject line, 小学科学 in front of a junior 领域). */
export function nodeOf(graph, code) {
    const own = graph.points[code]
    if (own) {
        const standard = graph.standards[own.std]
        return { code, own: true, slug: graph.slug, subject: graph.subject, color: graph.color, text: own.t, col: own.col, colLabel: columnLabel(graph, own.col), std: own.std, title: standard?.title || '', tags: own.tags || [], n: own.n }
    }
    const external = graph.external[code]
    if (!external) return null
    return { code, own: false, slug: external.slug, subject: external.subject, color: external.color, text: external.t, col: external.col, colLabel: external.colLabel, std: external.std, title: external.title, tags: [], n: null }
}

export function columnLabel(graph, key) {
    if (key === 'shared') return '七至九年级共同'
    return graph.columns.find(column => column.key === key)?.label || key
}

/** The column 「我的书」 sits in, when it is a book of this subject. */
export function myColumn(graph, book) {
    if (!book || book.subject_slug !== graph.slug || !book.grade) return null
    const grade = Number(book.grade)
    const keys = graph.columns.filter(column => !column.root).map(column => column.key)
    if (keys.includes(String(grade))) return String(grade)
    return keys.find(key => {
        const [from, to] = key.split('-').map(Number)
        return to ? grade >= from && grade <= to : false
    }) || null
}

/** 要先会 lines into and out of a 要点: [[code, reason]] */
export function linesOf(graph, code) {
    const before = []
    const after = []
    for (const [source, target, reason] of graph.edges) {
        if (target === code) before.push([source, reason])
        if (source === code) after.push([target, reason])
    }
    return { before, after }
}

// 七/八/九 and 7–9 are junior columns; 学段 columns before them are primary (a branch row only borrows those)
export const isJuniorKey = key => /^\d$/u.test(key) || key === '7-9' || key === 'shared'

/**
 * 同一线索: the stations (standards) next to this 要点's own on its row — the one before it in the same column (they
 * stand in textbook order), else the nearest earlier column; likewise after. A branch row (函数 from 数量关系) takes
 * its parent's primary stations as its start, and 小学科学 stands in front of a junior 领域.
 * Returns [standard code, column key] pairs.
 */
export function threadOf(graph, code) {
    const point = graph.points[code]
    if (!point) return { before: [], after: [] }
    const lane = graph.lanes.find(item => item.id === graph.standards[point.std]?.lane)
    if (!lane) return { before: [], after: [] }
    const keys = graph.columns.map(column => column.key)
    const own = point.col === 'shared' ? keys.find(isJuniorKey) : point.col
    const index = keys.indexOf(own)
    const parent = lane.from ? graph.lanes.find(item => item.id === lane.from) : null
    const stationsAt = (row, key) => [...(row?.roots?.[key] || []), ...(row?.cells?.[key] || [])]
    const notMine = std => std !== point.std
    const cell = point.col === 'shared' ? [] : stationsAt(lane, own)
    const at = cell.indexOf(point.std)
    const before = at > 0 ? [[cell[at - 1], own]] : []
    const after = at >= 0 && at < cell.length - 1 ? [[cell[at + 1], own]] : []
    for (let k = index - 1; k >= 0 && !before.length; k--) {
        const found = stationsAt(lane, keys[k]).filter(notMine)
        const borrowed = !found.length && parent && !isJuniorKey(keys[k]) ? stationsAt(parent, keys[k]) : []
        before.push(...[...found, ...borrowed].slice(-1).map(std => [std, keys[k]]))
    }
    for (let k = index + 1; k < keys.length && !after.length; k++) after.push(...stationsAt(lane, keys[k]).filter(notMine).slice(0, 2).map(std => [std, keys[k]]))
    // a row that branches off at this station: its first station follows too
    for (const child of graph.lanes.filter(item => item.from === lane.id)) {
        const first = keys.findIndex(key => child.cells[key]?.length)
        const fork = keys.slice(0, first).filter(key => !isJuniorKey(key) && stationsAt(lane, key).length).at(-1)
        if (first >= 0 && fork === own && stationsAt(lane, own).at(-1) === point.std) after.push([child.cells[keys[first]][0], keys[first]])
    }
    return { before, after }
}

/** The lessons of a 要点, 「我的书」's edition first; each row as an object. */
export function lessonsFor(rows, book) {
    const mine = String(book?.edition_name || '').replace(/（.*?）|\(.*?\)/gu, '').replace(/版/u, '').trim()
    const list = (rows || []).map(([label, unit, lesson, relation, quote, source, page, edition, reviewed]) => ({ label, unit, lesson, relation, quote, source, page, edition, reviewed: reviewed === 1, sameBook: edition === book?.edition, sameEdition: Boolean(mine) && label.startsWith(`${mine} `) }))
    return list.sort((a, b) => (a.relation === b.relation ? 0 : a.relation === 'T' ? -1 : 1) || Number(b.sameBook) - Number(a.sameBook) || Number(b.sameEdition) - Number(a.sameEdition))
}

export const sourceLabel = (source, page) => ({
    book: page ? `教材 PDF 第 ${page} 页` : '教材原文',
    design: '国家平台教学设计',
    summary: '国家平台课程简介',
    task: '国家平台学习任务单',
    title: '课题',
    review: '教研员补充'
}[source] || '')

/**
 * Search: the subject on screen first (from its own file, so the first results need no download), then the other
 * subjects from the shared index. Every word must appear in the 要点, its standard or the titles of its lessons.
 */
export function searchGraph(graph, index, query, limit = 12) {
    const words = String(query || '').trim().toLowerCase().split(/\s+/u).filter(Boolean)
    if (!words.length) return []
    const hit = text => words.every(word => text.includes(word))
    const rank = (code, text, standard, lessons) => (code.toLowerCase() === words[0] ? 0 : hit(lessons.toLowerCase()) || hit(standard.toLowerCase()) ? 1 : 2)
    const out = []
    if (graph) {
        for (const [code, point] of Object.entries(graph.points)) {
            const standard = graph.standards[point.std]?.title || ''
            const lessons = (point.tags || []).join('｜')
            const text = `${code} ${point.t} ${standard} ${lessons}`.toLowerCase()
            if (hit(text)) out.push({ code, slug: graph.slug, col: columnLabel(graph, point.col), text: point.t, standard, lessons, rank: rank(code, point.t, standard, lessons) })
        }
    }
    if (index) {
        for (const [code, col, text, standard, lessons] of index.rows) {
            const slug = slugOfCode(code)
            if (graph && slug === graph.slug) continue
            if (hit(`${code} ${text} ${standard} ${lessons}`.toLowerCase())) out.push({ code, slug, col: /^\d$/u.test(col) ? `${'一二三四五六七八九'[Number(col) - 1]}年级` : col === 'shared' ? '七至九年级' : `${col.replace('-', '–')} 年级`, text, standard, lessons, rank: rank(code, text, standard, lessons) + 3 })
        }
    }
    return out.sort((a, b) => a.rank - b.rank).slice(0, limit)
}
