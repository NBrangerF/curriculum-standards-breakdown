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
        const lessons = sorted.map(lesson => ({
            id: lesson.id,
            title: lesson.title,
            chapters: lesson.chapter_path.map(id => titles.get(id)).filter(Boolean).filter(title => title !== lesson.title),
            pdf_page: lesson.pdf_page || null,
            unit_id: unitOf(lesson),
            materials: lesson.materials.filter(name => MATERIALS.includes(name)),
            hours: lesson.hours
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
        index.editions[record.edition_id] = { platform_title: record.platform_title, lessons: lessons.length, confidence, units_linked: lessons.filter(item => item.unit_id).length }
    }
    writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(index)}\n`)
    return { editions: Object.keys(index.editions).length, lessons: lessonTotal }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { editions, lessons } = buildNationalLessons()
    console.log(`national-lessons: ${editions} textbooks, ${lessons} lessons`)
}
