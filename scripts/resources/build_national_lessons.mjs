// Builds public/data/textbooks/national-lessons/<edition_id>.json from data/textbooks/smartedu: each textbook's
// 国家中小学智慧教育平台 同步课, in the platform's chapter order, with the kebiao units each lesson falls in
// (by the lesson's start page in our PDF, or by title). Run after fetch_smartedu_lessons.mjs.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { unscramble } from './textbook_text.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SOURCE = path.join(ROOT, 'data/textbooks/smartedu')
const OUT = path.join(ROOT, 'public/data/textbooks/national-lessons')
export const LESSON_URL = id => `https://basic.smartedu.cn/syncClassroom/classActivity?activityId=${id}`
const MATERIALS = ['视频课程', '课件', '教学设计', '学习任务单', '课后练习', '基础性作业', '拓展性作业']
// a 课题 that names no content (「练习一」「试一试」「整理与复习（二）」) is no evidence by itself: a match whose only
// quote is such a 课题 is left out
const GENERIC_TITLE = /^(?:练习[一二三四五六七八九十\d]*|练一练|试一试|做一做|想一想|(?:单元|期中|期末|总)?复习|整理(?:与|和)复习|回顾(?:与|和)整理|整理与评价|单元测试|测验)(?:[（(][一二三四五六七八九十\d]+[）)])?$/u
const evidenced = ([, , quote, source]) => !(source === 'title' && GENERIC_TITLE.test(String(quote).replace(/\s+/gu, '')))

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
    // one lesson the platform lists several times: 「正数与负数（一）」「正数与负数（二）」, 「3.4.1实际问题…」, 「解一元一次方程（一）1」
    const lessonKey = title => String(title || '').replace(/[（(]?第[一二三四五六七八九十\d]+课时[）)]?/gu, '').trim().replace(/^\d+(?:\.\d+)+\s*/u, '').replace(/(?:[（(][一二三四五六七八九十\d][）)])?\d?$/u, '').replace(/[\s·•、，,。．.：:！!？?“”"'（）()《》\-—–_]/gu, '') || title
    // 教材与课标对应, lesson by lesson (align_textbook_lessons.mjs): each lesson's 要点 with the quote from its own
    // material. Where a lesson has it, its 主要在教 要点 replace the unit picks.
    const alignFile = path.join(SOURCE, 'lesson_alignment.json')
    const lessonAlign = existsSync(alignFile) ? JSON.parse(readFileSync(alignFile, 'utf8')).editions : {}
    // 教研员审校 (import_alignment_reviews.mjs): 错 drops a match, 改为 moves it, 补充 adds one; each reviewed row
    // gets a sixth field, 1, and the page marks it 「教研员已核验」
    const reviewsFile = path.join(SOURCE, 'alignment_reviews.json')
    const reviews = existsSync(reviewsFile) ? JSON.parse(readFileSync(reviewsFile, 'utf8')).editions : {}
    // a review of one copy of a lesson (the 审校表 lists the first) covers the platform's other copies in its unit
    const reviewKeys = new Map()
    const reviewKey = (edition, lesson) => `${edition}|${lesson.chapter_path?.[0] || ''}|${lessonKey(lesson.title)}`
    const reviewed = (edition, lesson, rows) => {
        const verdicts = reviews[edition]?.lessons[lesson.id] || reviewKeys.get(reviewKey(edition, lesson))
        if (!verdicts) return rows
        const out = []
        for (const [point, relation, quote, source, page] of rows) {
            const verdict = verdicts[point]
            if (!verdict) out.push([point, relation, quote, source, page])
            else if (verdict.verdict === 'ok') out.push([point, relation, quote, source, page, 1])
            else if (verdict.verdict === 'change' && !out.some(row => row[0] === verdict.to)) out.push([verdict.to, relation, quote, source, page, 1])
        }
        for (const [point, verdict] of Object.entries(verdicts)) {
            if (verdict.verdict === 'add' && !out.some(row => row[0] === point)) out.push([point, 'T', '', 'review', null, 1])
        }
        return out
    }
    // 要点 → the lessons that teach it, with the quote: 「这条要点在教材哪里教」
    const byPoint = new Map()
    // edition → the 要点 its lessons teach (T) and touch (P), for the coverage report
    const bookPoints = new Map()
    // every judged lesson once, for the API and the MCP tools (public/data/v2/lesson_alignment.json)
    const indexRows = []
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
            // quotes taken before the 人教 font letters were read back (狓 → x) are shown as the book prints them
        for (const lesson of record.lessons) if (reviews[record.edition_id]?.lessons[lesson.id]) reviewKeys.set(reviewKey(record.edition_id, lesson), reviews[record.edition_id].lessons[lesson.id])
        const byId = new Map(record.lessons.map(lesson => [lesson.id, lesson]))
        const alignOf = id => reviewed(record.edition_id, byId.get(id), (lessonAlign[record.edition_id]?.lessons[id]?.m || []).filter(evidenced).filter(([point]) => inScope(record.textbook_title, point.replace(/\.\d+$/u, ''))).map(([point, relation, quote, ...rest]) => [point, relation, unscramble(quote), ...rest]))
        const aiOf = new Map(sorted.map(lesson => {
            const taught = alignOf(lesson.id).filter(row => row[1] === 'T').map(([point]) => point)
            if (lessonAlign[record.edition_id]?.lessons[lesson.id]) return [lesson.id, firstFour(taught)]
            return [lesson.id, firstFour((unitPicks[record.edition_id]?.units[lesson.chapter_path[0]]?.picks || []).filter(([code, grade, point]) => grade === 2 && point && inScope(record.textbook_title, code)).map(([, , point]) => point))]
        }))
        const lessons = sorted.map(lesson => ({
            id: lesson.id,
            title: lesson.title,
            chapters: lesson.chapter_path.map(id => titles.get(id)).filter(Boolean).filter(title => title !== lesson.title),
            pdf_page: lesson.pdf_page || null,
            unit_id: unitOf(lesson),
            materials: lesson.materials.filter(name => MATERIALS.includes(name)),
            hours: lesson.hours,
            ...(aiOf.get(lesson.id)?.length ? { ai_points: aiOf.get(lesson.id) } : {}),
            // [要点, 'T' 主要在教 | 'P' 也涉及, quote, 'book' | 'design' | 'summary' | 'title', PDF page]
            // present (perhaps empty) once the lesson was judged, so the page can tell 「没找到」 from 「还没判断」
            ...(lessonAlign[record.edition_id]?.lessons[lesson.id] ? { align: alignOf(lesson.id) } : {})
        }))
        if (lessonAlign[record.edition_id]) bookPoints.set(record.edition_id, { T: new Set(), P: new Set() })
        const listed = new Map()
        for (const lesson of lessons) {
            if (!lesson.align?.length) continue
            const unit = (lesson.chapters[0] || lesson.title).replace(/\s+/gu, ' ')
            const key = `${unit}|${lessonKey(lesson.title)}`
            const title = lesson.title.replace(/[（(]?第[一二三四五六七八九十\d]+课时[）)]?/gu, '').trim()
            const seen = listed.get(key)
            if (!seen) listed.set(key, [record.edition_id, record.textbook_title, unit, title, lesson.id, lesson.pdf_page, lesson.align])
            else if (title.length < seen[3].length) seen[3] = title
        }
        indexRows.push(...listed.values())
        for (const lesson of lessons) {
            for (const [point, relation, quote, source, page] of lesson.align || []) {
                bookPoints.get(record.edition_id)?.[relation].add(point)
                if (!byPoint.has(point)) byPoint.set(point, [])
                byPoint.get(point).push([record.edition_id, record.textbook_title, (lesson.chapters[0] || lesson.title).replace(/\s+/gu, ' '), lesson.id, lesson.title, relation, quote, source, page ?? null, lesson.unit_id])
            }
        }
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
            // 1 = AI 按单元判断 (课名), 2 = AI 逐课判断, with a quote from the lesson's own material
            const via = lesson.align?.length ? 2 : 1
            if (ai.length) {
                linkLesson(ai, [record.edition_id, lesson.id, lesson.title, record.textbook_title, MATERIALS.filter(name => lesson.materials.includes(name)).map(name => MATERIALS.indexOf(name)), confidence === 'text' ? 1 : 0, via])
                linkUnit(ai, lesson, record, via)
                continue
            }
            // judged lesson by lesson and nothing found: the page alignment is not used either
            if (lesson.align) continue
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
    // editions the library has no PDF of (fetch_platform_editions.mjs): their lessons and 要点, judged on the lesson
    // titles and the 教学设计 or 学习任务单; named with the edition, since the library's own book has the same name
    const platformDir = path.join(SOURCE, 'platform')
    const platformBooks = []
    for (const file of existsSync(platformDir) ? readdirSync(platformDir).filter(name => name.startsWith('pf_')).sort() : []) {
        const record = JSON.parse(readFileSync(path.join(platformDir, file), 'utf8'))
        const judged = lessonAlign[record.edition_id]
        if (!judged) continue
        const titles = new Map()
        const order = new Map()
        const walk = nodes => {
            for (const node of nodes || []) {
                titles.set(node.id, node.title)
                order.set(node.id, order.size)
                walk(node.children)
            }
        }
        walk(record.tree)
        const position = lesson => order.get(lesson.chapter_path.at(-1)) ?? Number.MAX_SAFE_INTEGER
        const name = `${record.textbook_title}（${record.edition_name}）`
        for (const lesson of record.lessons) if (reviews[record.edition_id]?.lessons[lesson.id]) reviewKeys.set(reviewKey(record.edition_id, lesson), reviews[record.edition_id].lessons[lesson.id])
        const lessons = record.lessons.map((lesson, index) => ({ lesson, index })).sort((a, b) => position(a.lesson) - position(b.lesson) || a.index - b.index).map(({ lesson }) => ({
            id: lesson.id,
            title: lesson.title,
            chapters: lesson.chapter_path.map(id => titles.get(id)).filter(Boolean).filter(title => title !== lesson.title),
            pdf_page: null,
            unit_id: null,
            materials: lesson.materials.filter(item => MATERIALS.includes(item)),
            hours: lesson.hours,
            ...(judged.lessons[lesson.id] ? { align: reviewed(record.edition_id, lesson, (judged.lessons[lesson.id].m || []).filter(evidenced).map(([point, relation, quote, ...rest]) => [point, relation, unscramble(quote), ...rest])) } : {})
        }))
        writeFileSync(path.join(OUT, `${record.edition_id}.json`), `${JSON.stringify({ edition_id: record.edition_id, textbook_title: record.textbook_title, platform_title: record.platform_title, platform_textbook_id: record.platform_textbook_id, platform_only: true, confidence: 'edition', tree: record.tree, lessons })}\n`)
        platformBooks.push({ edition_id: record.edition_id, title: record.textbook_title, edition_name: record.edition_name, subject: record.subject, subject_slug: record.subject_slug, grade: record.grade, volume: record.volume, platform_title: record.platform_title, lessons: lessons.length })
        const listed = new Map()
        for (const lesson of lessons) {
            const unit = (lesson.chapters[0] || lesson.title).replace(/\s+/gu, ' ')
            for (const [point, relation, quote, source, page] of lesson.align || []) {
                if (!byPoint.has(point)) byPoint.set(point, [])
                byPoint.get(point).push([record.edition_id, name, unit, lesson.id, lesson.title, relation, quote, source, page ?? null, null])
            }
            if (!lesson.align?.length) continue
            const key = `${unit}|${lessonKey(lesson.title)}`
            const title = lesson.title.replace(/[（(]?第[一二三四五六七八九十\d]+课时[）)]?/gu, '').trim()
            if (!listed.has(key)) listed.set(key, [record.edition_id, name, unit, title, lesson.id, null, lesson.align])
        }
        indexRows.push(...listed.values())
    }
    // in school order: subject, edition, then grade and volume
    const SUBJECT_ORDER = ['语文', '数学', '英语', '道德与法治', '科学', '物理', '化学', '生物学', '历史', '地理', '音乐', '美术', '体育与健康']
    const VOLUME_ORDER = ['上册', '下册', '全一册']
    platformBooks.sort((a, b) => SUBJECT_ORDER.indexOf(a.subject) - SUBJECT_ORDER.indexOf(b.subject) || a.edition_name.localeCompare(b.edition_name, 'zh-Hans-CN') || a.grade - b.grade || VOLUME_ORDER.indexOf(a.volume) - VOLUME_ORDER.indexOf(b.volume))
    writeFileSync(path.join(ROOT, 'public/data/textbooks/platform_books.json'), `${JSON.stringify({ note: '馆里没有原书 PDF 的版本：课目录来自国家中小学智慧教育平台，课标对应按课题、教学设计或学习任务单判断。', books: platformBooks })}\n`)
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
    // per 要点: 主要在教 first, in textbook order, at most two lessons a book and ten in all; one lesson the platform
    // lists several times (「正数与负数（一）」「正数与负数（二）」) counts once. The library's books come first (their
    // quotes are from the book itself), then up to six lessons of the editions judged on lesson titles (pf_)
    const pointsBySubject = {}
    const pilot = row => row[0].startsWith('pf_')
    for (const [point, rows] of byPoint) {
        rows.sort((a, b) => (a[5] === b[5] ? 0 : a[5] === 'T' ? -1 : 1) || a[1].localeCompare(b[1], 'zh-Hans-CN', { numeric: true }) || a[4].length - b[4].length)
        const perBook = new Map()
        const seenLesson = new Set()
        const pick = (list, limit) => list.filter(row => {
            const key = `${row[0]}|${lessonKey(row[4])}`
            if (seenLesson.has(key)) return false
            seenLesson.add(key)
            perBook.set(row[0], (perBook.get(row[0]) || 0) + 1)
            return perBook.get(row[0]) <= 2
        }).slice(0, limit)
        const kept = [...pick(rows.filter(row => !pilot(row)), 10), ...pick(rows.filter(pilot), 6)]
        kept.sort((a, b) => pilot(a) - pilot(b) || a[1].localeCompare(b[1], 'zh-Hans-CN', { numeric: true }) || (a[5] === b[5] ? 0 : a[5] === 'T' ? -1 : 1))
        ;(pointsBySubject[point.slice(0, 2)] ??= {})[point] = kept
    }
    writeFileSync(path.join(ROOT, 'public/data/v2/lesson_alignment.json'), `${JSON.stringify({
        note: 'AI 逐课判断的教材与课标对应：relation T = 主要在教，P = 也涉及；quote 是这一课材料里的原话，source 说明出处（book = 教材 PDF 第 pdf_page 页，design = 国家平台教学设计，summary = 国家平台课程简介，title = 课题）。机器判断，待核验。',
        fields: ['edition_id', 'textbook_title', 'unit', 'lesson_title', 'lesson_id', 'pdf_page', 'matches'],
        match_fields: ['point', 'relation', 'quote', 'source', 'pdf_page'],
        lessons: indexRows,
        // editions the library has no PDF of: edition_id → [textbook title, subject slug, grade, volume], as in textbook_chapters.json
        platform_books: Object.fromEntries(platformBooks.map(book => [book.edition_id, [`${book.title}（${book.edition_name}）`, book.subject_slug, book.grade, book.volume]]))
    })}\n`)
    const subjectOut = path.join(ROOT, 'public/data/v2/national-lessons')
    rmSync(subjectOut, { recursive: true, force: true })
    mkdirSync(subjectOut, { recursive: true })
    for (const [prefix, standards] of Object.entries(bySubject)) {
        writeFileSync(path.join(subjectOut, `${prefix}.json`), `${JSON.stringify({ materials: MATERIALS, fields: ['edition_id', 'lesson_id', 'title', 'textbook_title', 'materials', 'text_matched', 'via_ai'], standards, unit_fields: ['edition_id', 'textbook_title', 'unit', 'unit_id', 'via_ai'], units: unitsBySubject[prefix] || {}, point_fields: ['edition_id', 'textbook_title', 'unit', 'lesson_id', 'lesson_title', 'relation', 'quote', 'source', 'pdf_page', 'unit_id'], points: pointsBySubject[prefix] || {} })}\n`)
    }
    const coverage = buildCoverage(bookPoints)
    return { editions: Object.keys(index.editions).length, lessons: lessonTotal, standards: byStandard.size, coverage }
}

// 教材与课标对应 coverage: for each subject and 学段, the 要点 that some lesson in the library's textbooks teaches,
// only touches, or that no lesson was found for. Writes public/data/textbooks/alignment_coverage.json.
function buildCoverage(bookPoints) {
    const books = JSON.parse(readFileSync(path.join(ROOT, 'public/data/textbooks/index.json'), 'utf8')).items
    const v2Slug = slug => (['art', 'music'].includes(slug) ? 'arts' : slug)
    const subjects = []
    for (const file of readdirSync(path.join(ROOT, 'data/v2/by_subject')).filter(name => name.endsWith('.json')).sort()) {
        const data = JSON.parse(readFileSync(path.join(ROOT, 'data/v2/by_subject', file), 'utf8'))
        const slug = file.replace(/\.json$/u, '')
        const stages = []
        for (const stage of [...new Set(data.standards.map(item => item.stage))]) {
            const standards = data.standards.filter(item => item.stage === stage)
            const grades = [...new Set(standards.flatMap(item => item.grades || []))].sort((a, b) => a - b)
            const inStage = books.filter(book => v2Slug(book.subject_slug) === slug && grades.includes(book.grade) && bookPoints.has(book.edition_id))
                .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN', { numeric: true }))
            const taught = new Set()
            const touched = new Set()
            for (const book of inStage) {
                for (const point of bookPoints.get(book.edition_id).T) taught.add(point)
                for (const point of bookPoints.get(book.edition_id).P) touched.add(point)
            }
            const points = standards.flatMap(item => (item.indicators || []).map(point => point.code))
            stages.push({
                stage,
                label: standards[0]?.stage_label || `${grades[0]}–${grades.at(-1)} 年级`,
                grades,
                books: inStage.map(book => [book.edition_id, book.title, book.edition_name]),
                points: points.length,
                taught: points.filter(code => taught.has(code)),
                touched: points.filter(code => !taught.has(code) && touched.has(code)),
                // with the start of its text: the overview lists them without loading every subject
                missing: standards.flatMap(item => (item.indicators || []).filter(point => !taught.has(point.code) && !touched.has(point.code)).map(point => [point.code, point.text.length > 42 ? `${point.text.slice(0, 42)}…` : point.text]))
            })
        }
        subjects.push({ slug, name: data.standards[0]?.subject || slug, stages })
    }
    const out = { note: '按 AI 逐课判断（每条都摘了教材原文为证）统计：taught = 有一课主要在教，touched = 只是有课涉及，missing = 馆里的教材里没找到教它的课。机器判断，待核验。', subjects }
    writeFileSync(path.join(ROOT, 'public/data/textbooks/alignment_coverage.json'), `${JSON.stringify(out)}\n`)
    return subjects.reduce((sum, subject) => sum + subject.stages.reduce((n, stage) => n + stage.taught.length, 0), 0)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { editions, lessons, standards, coverage } = buildNationalLessons()
    console.log(`national-lessons: ${editions} textbooks, ${lessons} lessons, ${standards} standards with lessons, ${coverage} 要点 taught in the library`)
}
