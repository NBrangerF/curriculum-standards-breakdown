#!/usr/bin/env node
// 知识图谱 (/knowledge-graph): one file per subject for the page, built from the v2 standards, the lesson-level
// textbook alignment and the 「要先会」 judgements. Runs at the end of build:public-data.
// Reads:  public/data/v2/by_subject/*.json, public/data/v2/lesson_alignment.json, public/data/textbooks/index.json,
//         public/data/concepts.json, data/v2/graph/threads.json, data/v2/graph/prereq/*.tsv
// Writes: public/data/v2/graph/<slug>.json   threads × grade columns, every 要点 with its lessons, the 要先会 lines
//         public/data/v2/graph/lessons/<slug>.json  each 要点's lessons with the textbook's words, loaded when one is opened
//         public/data/v2/graph/search.json   every 要点 with its standard and lesson titles, for the search box
//         public/data/v2/graph/manifest.json subjects, counts and how the 要先会 lines were checked
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = 'public/data/v2/graph'
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const SUBJECTS = ['chinese', 'math', 'english', 'morality_law', 'history', 'geography', 'science', 'physics', 'chemistry', 'biology', 'it', 'pe', 'arts', 'labor']
const GRADE_CN = { 7: '七', 8: '八', 9: '九' }
const PRIMARY = ['1-2', '3-4', '5-6']
const range = stage => stage.replace('-', '–')
const MAX_LESSONS = 8
const MAX_TAGS = 2
// textbook numbering in front of a lesson title: 「19.2.1 正比例函数」, 「3.一次函数的图象」 (not 「2、5、3的倍数」)
const LESSON_NUMBER = /^(?:\d+(?:\.\d+)+|\d+\.(?=\D)|\d+\s+)\s*/u
const MAX_BEFORE = 3

const threads = readJson('data/v2/graph/threads.json').subjects
const concepts = readJson('public/data/concepts.json')
const termName = Object.fromEntries(concepts.terms.map(term => [term.id, term.term]))
const subjectInfo = Object.fromEntries(concepts.subjects.map(subject => [subject.slug, subject]))
const subjects = Object.fromEntries(SUBJECTS.map(slug => [slug, readJson(`public/data/v2/by_subject/${slug}.json`)]))

// ---------- columns: 学段 for the primary grades; 七/八/九 when most junior 要点 name their textbook grade ----------
function columnsOf(subject) {
    const junior = subject.standards.filter(s => s.stage === '7-9').flatMap(s => s.indicators)
    const single = junior.filter(point => point.grades?.length === 1)
    const split = junior.length > 0 && single.length / junior.length >= 0.5
    const columns = []
    for (const { stage } of subject.stages) {
        if (stage === '7-9' && split) {
            for (const grade of [7, 8, 9]) {
                if (single.some(point => point.grades[0] === grade)) columns.push({ key: String(grade), label: `${GRADE_CN[grade]}年级`, start: grade })
            }
        } else columns.push({ key: stage, label: `${range(stage)} 年级`, start: Number(stage.split('-')[0]) })
    }
    return { columns, split }
}
const columnOf = (standard, point, split) => {
    if (standard.stage !== '7-9' || !split) return standard.stage
    return point.grades?.length === 1 ? String(point.grades[0]) : 'shared'
}

// ---------- every 要点 of every subject, with the column it sits in and where it starts (for the order check) ----------
const points = new Map()
const standards = new Map()
const layout = {}
for (const slug of SUBJECTS) {
    const subject = subjects[slug]
    layout[slug] = columnsOf(subject)
    for (const standard of subject.standards) {
        standards.set(standard.code, { slug, standard })
        for (const point of standard.indicators) {
            const column = columnOf(standard, point, layout[slug].split)
            const start = column === 'shared' ? 7 : Number(column.split('-')[0])
            points.set(point.code, { slug, standard, point, column, start })
        }
    }
}
const columnLabel = (slug, column) => (column === 'shared' ? '七至九年级共同' : layout[slug].columns.find(c => c.key === column)?.label || `${range(column)} 年级`)

// ---------- lessons: 主要在教 first, the library's books before the pilot editions, at most two a book ----------
const editionNames = Object.fromEntries(readJson('public/data/textbooks/index.json').items.map(item => [item.edition_id, item.edition_name]))
const shortEdition = name => String(name || '').replace(/（.*?）|\(.*?\)/gu, '').replace(/版/u, '').replace('国家教学指南', '教学指南').trim()
function bookOf(editionId, title) {
    const pilot = /（(.+?)）$/u.exec(title)
    const edition = shortEdition(pilot ? pilot[1] : editionNames[editionId] || '')
    const match = /(\d)年级(上|下|全一)册/u.exec(title)
    const grade = match ? Number(match[1]) : null
    const volume = match ? (match[2] === '全一' ? '' : match[2]) : ''
    return { edition, grade, label: [edition, grade ? `${grade}${volume}` : title.replace(/（.+?）$/u, '')].filter(Boolean).join(' ') }
}
const lessonRows = new Map()
for (const [editionId, title, unit, lessonTitle, lessonId, pdfPage, matches] of readJson('public/data/v2/lesson_alignment.json').lessons) {
    const book = bookOf(editionId, title)
    for (const [point, relation, quote, source, page, reviewed] of matches) {
        if (!points.has(point)) continue
        if (!lessonRows.has(point)) lessonRows.set(point, [])
        lessonRows.get(point).push({ editionId, title, unit, lessonTitle, lessonId, relation, quote, source, page: page ?? pdfPage ?? null, reviewed: reviewed === 1, book })
    }
}
const clip = (text, length) => {
    const chars = [...String(text || '').replace(/\s+/gu, ' ').trim()]
    return chars.length > length ? `${chars.slice(0, length).join('')}…` : chars.join('')
}
function lessonsOf(code) {
    const rows = lessonRows.get(code) || []
    const pilot = row => row.editionId.startsWith('pf_')
    rows.sort((a, b) => (a.relation === b.relation ? 0 : a.relation === 'T' ? -1 : 1) || pilot(a) - pilot(b) || (a.book.grade ?? 99) - (b.book.grade ?? 99) || a.title.localeCompare(b.title, 'zh-Hans-CN', { numeric: true }))
    const perBook = new Map()
    const kept = rows.filter(row => {
        perBook.set(row.editionId, (perBook.get(row.editionId) || 0) + 1)
        return perBook.get(row.editionId) <= 2
    }).slice(0, MAX_LESSONS)
    const taught = new Set(rows.filter(row => row.relation === 'T').map(row => `${row.editionId}|${row.lessonId}`))
    return {
        // [书, 单元, 课, T|P, 原话, 出处, 页, edition_id, 教研员已核验]
        les: kept.map(row => [row.book.label, clip(row.unit, 24), clip(row.lessonTitle, 30), row.relation, clip(row.quote, 40), row.source, row.page, row.editionId, row.reviewed ? 1 : 0]),
        // the first lessons that teach it, as tags on the cards: 「正比例函数 · 人教 8下」
        tags: [...new Set(kept.filter(row => row.relation === 'T').map(row => `${clip(row.lessonTitle.replace(LESSON_NUMBER, ''), 14)} · ${row.book.label}`))].slice(0, MAX_TAGS),
        n: [taught.size, rows.filter(row => row.relation === 'P').length, new Set(rows.map(row => row.editionId)).size]
    }
}

// ---------- 要先会: judged per subject, checked here ----------
const report = { judged: 0, kept: 0, dropped: [] }
const edges = []
const PREREQ = 'data/v2/graph/prereq'
const auditFile = join(PREREQ, 'audit.tsv')
for (const file of existsSync(PREREQ) ? readdirSync(PREREQ).filter(name => name.endsWith('.tsv') && name !== 'audit.tsv').sort() : []) {
    const lines = readFileSync(join(PREREQ, file), 'utf8').split('\n').filter(Boolean)
    for (const line of lines.slice(1)) {
        const [target, source, reason] = line.split('\t').map(cell => (cell || '').trim())
        report.judged += 1
        const drop = why => report.dropped.push(`${file}: ${source} → ${target}（${why}）`)
        if (!points.has(target) || !points.has(source)) { drop('编码不存在'); continue }
        if (target === source) { drop('自己指向自己'); continue }
        // 七至九年级共同 has no fixed grade: such a 要点 may build on any junior 要点 (the cycle check still applies)
        const latest = points.get(target).column === 'shared' ? 9 : points.get(target).start
        if (points.get(source).start > latest) { drop('来源年级更晚'); continue }
        if (!reason) { drop('没有依据'); continue }
        edges.push([source, target, clip(reason, 24)])
    }
}
// at most three a 要点, no duplicates, and no cycles (a later line that would close one is dropped)
const seen = new Set()
const before = new Map()
const reaches = (from, to) => {
    const stack = [from]
    const visited = new Set()
    while (stack.length) {
        const node = stack.pop()
        if (node === to) return true
        if (visited.has(node)) continue
        visited.add(node)
        for (const next of before.get(node) || []) stack.push(next)
    }
    return false
}
const kept = []
for (const [source, target, reason] of edges) {
    const key = `${source}>${target}`
    if (seen.has(key)) continue
    seen.add(key)
    const list = before.get(target) || []
    if (list.length >= MAX_BEFORE) { report.dropped.push(`${source} → ${target}（超过 ${MAX_BEFORE} 条）`); continue }
    // source → target closes a cycle when target is already among source's 要先会 (directly or further back)
    if (reaches(source, target)) { report.dropped.push(`${source} → ${target}（会成环）`); continue }
    before.set(target, [...list, source])
    kept.push([source, target, reason])
}
report.kept = kept.length
// spot check of the lines, by hand: audit.tsv rows are source, target, verdict (对 / 部分对 / 不对), note
const audit = { checked: 0, right: 0, partly: 0, wrong: 0 }
if (existsSync(auditFile)) {
    for (const line of readFileSync(auditFile, 'utf8').split('\n').filter(Boolean).slice(1)) {
        const verdict = line.split('\t')[2]
        audit.checked += 1
        if (verdict === '对') audit.right += 1
        else if (verdict === '部分对') audit.partly += 1
        else if (verdict === '不对') audit.wrong += 1
    }
}

// ---------- lanes (每一行): by theme, by 领域, or as threads.json lists them ----------
const CN_DIGIT = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
const cnNumber = text => {
    if (/^\d+$/u.test(text)) return Number(text)
    const [tens, ones] = text.includes('十') ? text.split('十') : ['', text]
    return (text.includes('十') ? (CN_DIGIT[tens] || 1) * 10 : 0) + (CN_DIGIT[ones] || 0)
}
// 「八年级下册 第十九章 一次函数」 → a number that sorts by grade, volume and chapter (unknown last)
function bookPosition(basis) {
    const match = /([七八九])年级(上|下|全一)?册?(?:\s*第([一二三四五六七八九十\d]+)[章单])?/u.exec(String(basis || ''))
    if (!match) return 9999
    return CN_DIGIT[match[1]] * 1000 + (match[2] === '下' ? 500 : 0) + (match[3] ? cnNumber(match[3]) : 99)
}

function lanesOf(slug) {
    const subject = subjects[slug]
    const rule = threads[slug] || {}
    const lanes = []
    const laneOfStandard = new Map()
    if (Array.isArray(rule.lanes)) {
        for (const lane of rule.lanes) lanes.push({ id: lane.id, name: lane.name, group: lane.group || null, from: lane.from || null, theme: lane.theme || null, members: lane.members })
        for (const standard of subject.standards) {
            const lane = lanes.find(item => item.members.includes(standard.level2))
            if (!lane) throw new Error(`threads.json: ${slug} 的「${standard.level2}」（${standard.code}）不在任何一行`)
            laneOfStandard.set(standard.code, lane.id)
        }
    } else {
        const byLevel1 = rule.lanes === 'level1'
        const keyOf = standard => (byLevel1 ? standard.level1 : `${standard.level1}|${standard.level2}`)
        const order = []
        for (const standard of subject.standards) if (!order.includes(keyOf(standard))) order.push(keyOf(standard))
        // keep a 领域's themes together, and put 跨学科 rows last
        const groups = []
        for (const key of order) { const group = key.split('|')[0]; if (!groups.includes(group)) groups.push(group) }
        const cross = key => (/跨学科/u.test(key) ? 1 : 0)
        order.sort((a, b) => cross(a.split('|')[0]) - cross(b.split('|')[0]) || groups.indexOf(a.split('|')[0]) - groups.indexOf(b.split('|')[0]) || cross(a) - cross(b) || order.indexOf(a) - order.indexOf(b))
        for (const [index, key] of order.entries()) {
            const [level1, level2] = key.split('|')
            lanes.push({ id: `l${index + 1}`, name: byLevel1 ? level1 : level2, group: byLevel1 || level1 === level2 ? null : level1, from: null, theme: null, key })
        }
        for (const standard of subject.standards) laneOfStandard.set(standard.code, lanes.find(lane => lane.key === keyOf(standard)).id)
    }
    const requirements = subject.stage_overview?.theme_requirements || []
    for (const lane of lanes) {
        lane.cells = {}
        for (const standard of subject.standards.filter(s => laneOfStandard.get(s.code) === lane.id)) {
            for (const point of standard.indicators) {
                const column = points.get(point.code).column
                const cell = (lane.cells[column] ||= [])
                if (!cell.includes(standard.code)) cell.push(standard.code)
            }
        }
        // stations that share a junior column stand in textbook order (七年级上册 第一章 before 第二章, 上册 before 下册)
        for (const [column, cell] of Object.entries(lane.cells)) {
            const where = std => Math.min(...standards.get(std).standard.indicators.filter(point => points.get(point.code).column === column).map(point => bookPosition(point.grade_basis)))
            cell.sort((a, b) => where(a) - where(b))
        }
        lane.requirements = requirements
            .filter(item => (lane.theme ? item.theme === lane.theme : rule.lanes === 'level1' && item.level1 === lane.name))
            .map(item => ({ text: item.text, pages: item.pages || [] }))
        // 小学科学's core concepts in front of a junior 领域
        const roots = rule.roots?.[lane.name] || []
        if (roots.length) {
            lane.roots = {}
            for (const standard of subjects.science.standards.filter(s => PRIMARY.includes(s.stage) && roots.includes(s.level2))) {
                ;(lane.roots[standard.stage] ||= []).push(standard.code)
            }
        }
        delete lane.members
        delete lane.key
        if (!lane.theme) delete lane.theme
    }
    return { lanes: lanes.filter(lane => Object.keys(lane.cells).length), laneOfStandard }
}

// ---------- write ----------
rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'lessons'), { recursive: true })
const search = []
const manifest = []
const color = slug => subjectInfo[slug]?.color || '#c3cad6'
const brief = code => {
    const { slug, standard, point, column } = points.get(code)
    return { t: point.text, slug, subject: subjects[slug].subject, color: color(slug), col: column, colLabel: columnLabel(slug, column), std: standard.code, title: standard.level2 }
}
for (const slug of SUBJECTS) {
    const subject = subjects[slug]
    const { columns, split } = layout[slug]
    const { lanes, laneOfStandard } = lanesOf(slug)
    const hasRoots = lanes.some(lane => lane.roots)
    const allColumns = hasRoots ? [...PRIMARY.map(stage => ({ key: stage, label: `${range(stage)} 年级`, start: Number(stage[0]), root: '小学科学' })), ...columns] : columns
    const outPoints = {}
    const outLessons = {}
    const outStandards = {}
    for (const standard of subject.standards) {
        outStandards[standard.code] = { title: standard.level2, stage: standard.stage, lane: laneOfStandard.get(standard.code), points: standard.indicators.map(point => point.code) }
        for (const point of standard.indicators) {
            const { column } = points.get(point.code)
            const { les, tags, n } = lessonsOf(point.code)
            outPoints[point.code] = { t: point.text, std: standard.code, col: column, sec: point.section || null, pg: point.pages || [], gb: point.grade_basis || null, tags, n }
            if (les.length) outLessons[point.code] = les
            const taughtTitles = [...new Set(les.filter(row => row[3] === 'T').map(row => row[2].replace(LESSON_NUMBER, '')))].slice(0, 4)
            search.push([point.code, column, clip(point.text, 56), standard.level2, taughtTitles.join('｜')])
        }
    }
    const mine = new Set(Object.keys(outPoints))
    const outEdges = kept.filter(([source, target]) => mine.has(source) || mine.has(target))
    const external = {}
    for (const [source, target] of outEdges) for (const code of [source, target]) if (!mine.has(code)) external[code] = brief(code)
    for (const lane of lanes) for (const codes of Object.values(lane.roots || {})) for (const code of codes) for (const point of standards.get(code).standard.indicators) external[point.code] = brief(point.code)
    const rootStandards = {}
    for (const lane of lanes) for (const codes of Object.values(lane.roots || {})) for (const code of codes) {
        const { standard } = standards.get(code)
        rootStandards[code] = { title: standard.level2, stage: standard.stage, lane: lane.id, points: standard.indicators.map(point => point.code), subject: '科学', slug: 'science' }
    }
    const info = subjectInfo[slug] || {}
    const file = {
        slug,
        subject: subject.subject,
        prefix: subject.standards[0].code.slice(0, 2),
        color: color(slug),
        source_version: subject.source_version,
        about: { organized_by: info.organized_by || null, terms: (info.terms || []).map(id => [id, termName[id] || id]), threads: threads[slug]?.source || null },
        columns: allColumns,
        split,
        lanes,
        standards: { ...outStandards, ...rootStandards },
        points: outPoints,
        edges: outEdges,
        external
    }
    writeFileSync(join(OUT, `${slug}.json`), `${JSON.stringify(file)}\n`)
    writeFileSync(join(OUT, 'lessons', `${slug}.json`), `${JSON.stringify({ fields: ['book', 'unit', 'lesson', 'relation', 'quote', 'source', 'page', 'edition_id', 'reviewed'], points: outLessons })}\n`)
    const taught = Object.values(outPoints).filter(point => point.n[0] > 0).length
    manifest.push({ slug, subject: subject.subject, color: color(slug), points: Object.keys(outPoints).length, standards: subject.standards.length, lanes: lanes.length, taught, edges: kept.filter(([, target]) => mine.has(target)).length })
}
writeFileSync(join(OUT, 'search.json'), `${JSON.stringify({ fields: ['code', 'column', 'text', 'standard', 'lessons'], rows: search })}\n`)
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify({
    note: '知识图谱。要先会：学生没掌握来源要点，很可能学不好目标要点（不表示必须先学完）；由 AI 逐条判断，待核验。同一线索：课标里同一主题的上一学段或下一学段。',
    subjects: manifest,
    prerequisites: { judged: report.judged, kept: report.kept, dropped: report.dropped.length, audit }
}, null, 2)}\n`)
console.log(`knowledge graph: ${manifest.length} subjects, ${search.length} 要点, 要先会 ${report.kept}/${report.judged} kept${report.dropped.length ? `, ${report.dropped.length} dropped` : ''}${audit.checked ? `, audit ${audit.right}/${audit.checked} right` : ''}`)
for (const line of report.dropped.slice(0, 20)) console.log(`  dropped ${line}`)
