// Builds public/data/textbooks/national-lessons/<edition_id>.json from data/textbooks/smartedu: each textbook's
// 国家中小学智慧教育平台 同步课, in the platform's chapter order, with the kebiao units each lesson falls in
// (by the lesson's start page in our PDF, or by title). Run after fetch_smartedu_lessons.mjs.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SOURCE = path.join(ROOT, 'data/textbooks/smartedu')
const OUT = path.join(ROOT, 'public/data/textbooks/national-lessons')
export const LESSON_URL = id => `https://basic.smartedu.cn/syncClassroom/classActivity?activityId=${id}`
const MATERIALS = ['视频课程', '课件', '教学设计', '学习任务单', '课后练习', '基础性作业', '拓展性作业']

const squash = text => String(text || '').replace(/^(第[一二三四五六七八九十百\d]+(?:单元|课|章|节)|课题\s*\d+|\d+(?:\.\d+)*\*?)/u, '').replace(/[\s·•、，,。．.：:！!？?“”"'（）()《》\-—–★*]/gu, '')

export function buildNationalLessons() {
    if (!existsSync(SOURCE)) return { editions: 0, lessons: 0 }
    const units = JSON.parse(readFileSync(path.join(ROOT, 'public/data/textbooks/units.json'), 'utf8')).items
    const unitsByEdition = new Map()
    for (const unit of units) {
        if (!unitsByEdition.has(unit.edition_id)) unitsByEdition.set(unit.edition_id, [])
        unitsByEdition.get(unit.edition_id).push(unit)
    }
    rmSync(OUT, { recursive: true, force: true })
    mkdirSync(OUT, { recursive: true })
    const index = { source: 'https://basic.smartedu.cn/syncClassroom', note: '国家中小学智慧教育平台同步课，免费，观看需登录平台账号。kebiao 只保存课名和链接。', editions: {} }
    let lessonTotal = 0
    // standard → lessons, through the textbook chapter each lesson starts in (chapter rows carry the standards
    // aligned to their pages). Machine-made, so the page labels it.
    const chapters = JSON.parse(readFileSync(path.join(ROOT, 'public/data/v2/textbook_chapters.json'), 'utf8'))
    const v2Links = JSON.parse(readFileSync(path.join(ROOT, 'public/data/v2/textbook_links.json'), 'utf8'))
    const rowsByEdition = new Map()
    for (const row of chapters.chapters) {
        if (!rowsByEdition.has(row[0])) rowsByEdition.set(row[0], [])
        rowsByEdition.get(row[0]).push(row)
    }
    // AI 按单元判断 (pick_unit_standards.mjs): when the AI read a unit against the standards, its first four 直接对应
    // picks (ranked when there were more) replace the page alignment for that unit's lessons. 语文 units come back
    // with ten or more 直接对应; four keeps a standard's list to the units that teach it most.
    // 统编版 历史 covers one period per volume (same table as HISTORY_SCOPE in apps/api/src/lesson-plan-routes.ts)
    const HISTORY_SCOPE = { 历史7年级上册: ['中国古代史'], 历史7年级下册: ['中国古代史'], 历史8年级上册: ['中国近代史'], 历史8年级下册: ['中国现代史'], 历史9年级上册: ['世界古代史', '世界近代史'], 历史9年级下册: ['世界近代史', '世界现代史'] }
    const historyLevel = new Map(JSON.parse(readFileSync(path.join(ROOT, 'data/v2/by_subject/history.json'), 'utf8')).standards.map(item => [item.code, item.level1]))
    const inScope = (textbook, code) => !HISTORY_SCOPE[textbook] || HISTORY_SCOPE[textbook].includes(historyLevel.get(code))
    // 化学 repeats its 必做实验 under four standards (CH-S4-SI-06.5 and CH-S4-PR-08.5 read the same); one of each text is enough
    const pointText = new Map()
    for (const file of readdirSync(path.join(ROOT, 'data/v2/by_subject')).filter(name => name.endsWith('.json'))) {
        for (const standard of JSON.parse(readFileSync(path.join(ROOT, 'data/v2/by_subject', file), 'utf8')).standards) {
            for (const item of standard.indicators || []) pointText.set(item.code, item.text)
        }
    }
    const firstFour = points => {
        const seen = new Set()
        return points.filter(point => {
            const text = pointText.get(point) || point
            if (seen.has(text)) return false
            seen.add(text)
            return true
        }).slice(0, 4)
    }
    const picksFile = path.join(SOURCE, 'unit_picks.json')
    const unitPicks = existsSync(picksFile) ? JSON.parse(readFileSync(picksFile, 'utf8')).editions : {}
    const byStandard = new Map()
    // standard → the textbook units that teach it (「这条课标在教材哪里教」), one row per book and unit
    const unitsByStandard = new Map()
    const NOT_A_UNIT = /附录|总复习|期末复习|中考复习|复习与关联|整理与复习|整理和复习/u
    const UNIT_TITLE = /^(?:\d+|第[一二三四五六七八九十]+(?:单元|章)|Unit\s*\d+|Module)/u
    const linkUnit = (codes, lesson, record, viaAi) => {
        const unit = lesson.chapters[0] || lesson.title
        if (NOT_A_UNIT.test(unit)) return
        for (const code of new Set(codes.map(value => value.replace(/\.\d+$/u, '')))) {
            if (!unitsByStandard.has(code)) unitsByStandard.set(code, new Map())
            const rows = unitsByStandard.get(code)
            const key = `${record.edition_id}|${unit}`
            if (!rows.has(key)) rows.set(key, { edition: record.edition_id, textbook: record.textbook_title, unit, ids: [], viaAi })
            if (lesson.unit_id && !rows.get(key).ids.includes(lesson.unit_id)) rows.get(key).ids.push(lesson.unit_id)
        }
    }
    const linkLesson = (codes, entry) => {
        for (const code of new Set(codes.map(value => value.replace(/\.\d+$/u, '')))) {
            if (!byStandard.has(code)) byStandard.set(code, [])
            const list = byStandard.get(code)
            if (!list.some(item => item[1] === entry[1] || (item[0] === entry[0] && item[2] === entry[2]))) list.push(entry)
        }
    }
    for (const file of readdirSync(SOURCE).filter(name => name.startsWith('ed_'))) {
        const record = JSON.parse(readFileSync(path.join(SOURCE, file), 'utf8'))
        const titles = new Map()
        const order = new Map()
        const walk = (nodes, trail) => {
            for (const node of nodes || []) {
                titles.set(node.id, node.title)
                order.set(node.id, order.size)
                walk(node.children, [...trail, node.title])
            }
        }
        walk(record.tree, [])
        const ours = unitsByEdition.get(record.edition_id) || []
        const unitOf = lesson => {
            const key = squash(lesson.title)
            const byTitle = ours.find(unit => key.length >= 2 && squash(unit.title) === key)
            if (byTitle) return byTitle.entry_id
            if (!lesson.pdf_page) return null
            const containing = ours.filter(unit => Number.isInteger(unit.pdf_page) && unit.pdf_page <= lesson.pdf_page && (unit.end_pdf_page || unit.pdf_page) >= lesson.pdf_page)
            containing.sort((a, b) => ((a.end_pdf_page || a.pdf_page) - a.pdf_page) - ((b.end_pdf_page || b.pdf_page) - b.pdf_page))
            return containing[0]?.entry_id || null
        }
        const confidence = record.match.title_hits >= 3 ? 'text' : 'edition'
        // the platform lists lessons by upload; show them in the book's chapter order
        const position = lesson => order.get(lesson.chapter_path.at(-1)) ?? Number.MAX_SAFE_INTEGER
        const sorted = record.lessons.map((lesson, index) => ({ lesson, index })).sort((a, b) => position(a.lesson) - position(b.lesson) || a.index - b.index).map(item => item.lesson)
        const aiOf = new Map(sorted.map(lesson => [lesson.id, firstFour((unitPicks[record.edition_id]?.units[lesson.chapter_path[0]]?.picks || []).filter(([code, grade, point]) => grade === 2 && point && inScope(record.textbook_title, code)).map(([, , point]) => point))]))
        const lessons = sorted.map(lesson => ({
            id: lesson.id,
            title: lesson.title,
            chapters: lesson.chapter_path.map(id => titles.get(id)).filter(Boolean).filter(title => title !== lesson.title),
            pdf_page: lesson.pdf_page || null,
            unit_id: unitOf(lesson),
            materials: lesson.materials.filter(name => MATERIALS.includes(name)),
            hours: lesson.hours,
            ...(aiOf.get(lesson.id)?.length ? { ai_points: aiOf.get(lesson.id) } : {})
        }))
        lessonTotal += lessons.length
        const out = {
            edition_id: record.edition_id,
            textbook_title: record.textbook_title,
            platform_title: record.platform_title,
            platform_textbook_id: record.platform_textbook_id,
            confidence,
            tree: record.tree,
            lessons
        }
        writeFileSync(path.join(OUT, `${record.edition_id}.json`), `${JSON.stringify(out)}\n`)
        const rows = (rowsByEdition.get(record.edition_id) || []).filter(row => Number.isInteger(row[3])).sort((a, b) => a[3] - b[3])
        for (const lesson of lessons) {
            const ai = aiOf.get(lesson.id) || []
            if (ai.length) {
                linkLesson(ai, [record.edition_id, lesson.id, lesson.title, record.textbook_title, MATERIALS.filter(name => lesson.materials.includes(name)).map(name => MATERIALS.indexOf(name)), confidence === 'text' ? 1 : 0, 1])
                linkUnit(ai, lesson, record, 1)
                continue
            }
            const codes = []
            if (lesson.unit_id) {
                for (const item of v2Links.units[lesson.unit_id] || []) codes.push(item.code)
                for (const row of rows) if (row[4] === lesson.unit_id) codes.push(...row[5])
            }
            if (!codes.length && lesson.pdf_page) {
                const row = rows.filter(item => item[3] <= lesson.pdf_page && item[5].length).at(-1)
                // only the chapter the lesson starts in: it must begin before the next chapter does
                const next = rows.find(item => item[3] > (row?.[3] ?? Infinity))
                if (row && (!next || lesson.pdf_page < next[3])) codes.push(...row[5])
            }
            if (codes.length) {
                linkLesson(codes, [record.edition_id, lesson.id, lesson.title, record.textbook_title, MATERIALS.filter(name => lesson.materials.includes(name)).map(name => MATERIALS.indexOf(name)), confidence === 'text' ? 1 : 0, 0])
                linkUnit(codes, lesson, record, 0)
            }
        }
        index.editions[record.edition_id] = { platform_title: record.platform_title, lessons: lessons.length, confidence, units_linked: lessons.filter(item => item.unit_id).length }
    }
    writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(index)}\n`)
    // per subject, so a standard page loads only its own subject; lessons with a video and a 教学设计 first
    const bySubject = {}
    for (const [code, list] of byStandard) {
        const prefix = code.slice(0, 2)
        list.sort((a, b) => b[4].length - a[4].length)
        // at most 3 from one textbook, so a standard shows lessons from several grades and editions
        const perBook = new Map()
        const kept = list.filter(item => {
            perBook.set(item[3], (perBook.get(item[3]) || 0) + 1)
            return perBook.get(item[3]) <= 3
        })
        ;(bySubject[prefix] ??= {})[code] = kept.slice(0, 8)
    }
    const unitsBySubject = {}
    for (const [code, rows] of unitsByStandard) {
        const all = [...rows.values()]
        // a lesson the platform lists at the top of its tree (「小数乘小数」) folds into the unit sharing its pages
        const kept = all.filter(row => UNIT_TITLE.test(row.unit) || !all.some(other => other !== row && other.edition === row.edition && UNIT_TITLE.test(other.unit) && other.ids.some(id => row.ids.includes(id))))
        // in textbook order (grade, then 上 before 下), at most eight units
        const sorted = kept.sort((a, b) => a.textbook.localeCompare(b.textbook, 'zh-Hans-CN', { numeric: true }))
        ;(unitsBySubject[code.slice(0, 2)] ??= {})[code] = sorted.slice(0, 8).map(row => [row.edition, row.textbook, row.unit, row.ids[0] || null, row.viaAi])
    }
    const subjectOut = path.join(ROOT, 'public/data/v2/national-lessons')
    rmSync(subjectOut, { recursive: true, force: true })
    mkdirSync(subjectOut, { recursive: true })
    for (const [prefix, standards] of Object.entries(bySubject)) {
        writeFileSync(path.join(subjectOut, `${prefix}.json`), `${JSON.stringify({ materials: MATERIALS, fields: ['edition_id', 'lesson_id', 'title', 'textbook_title', 'materials', 'text_matched', 'via_ai'], standards, unit_fields: ['edition_id', 'textbook_title', 'unit', 'unit_id', 'via_ai'], units: unitsBySubject[prefix] || {} })}\n`)
    }
    return { editions: Object.keys(index.editions).length, lessons: lessonTotal, standards: byStandard.size }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { editions, lessons, standards } = buildNationalLessons()
    console.log(`national-lessons: ${editions} textbooks, ${lessons} lessons, ${standards} standards with lessons`)
}
