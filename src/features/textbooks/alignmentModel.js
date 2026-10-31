// 教材与课标对应, lesson by lesson: each 国家平台 lesson's `align` rows ([要点, 'T' | 'P', quote, source, PDF page],
// from scripts/resources/build_national_lessons.mjs) grouped by unit, and the 要点 of the book's grade it does
// and does not reach.
const HOUR = /[（(]?第[一二三四五六七八九十\d]+课时[）)]?/gu
// one lesson the platform lists several times: 「正数与负数（一）」「正数与负数（二）」, 「3.4.1实际问题…」, 「解一元一次方程（一）1」
export const lessonKey = title => String(title || '').replace(HOUR, '').trim()
    .replace(/^\d+(?:\.\d+)+\s*/u, '')
    .replace(/(?:[（(][一二三四五六七八九十\d][）)])?\d?$/u, '')
    .replace(/[\s·•、，,。．.：:！!？?“”"'（）()《》\-—–_]/gu, '') || String(title || '')

// 'T' 主要在教: this lesson's goal. 'P' 也涉及: used, mentioned or prepared for.
export const RELATION_LABELS = { T: '主要在教', P: '也涉及' }

export function sourceLabel(source, page) {
    if (source === 'book') return page ? `教材 PDF 第 ${page} 页` : '教材原文'
    if (source === 'design') return '国家平台教学设计'
    if (source === 'task') return '国家平台学习任务单'
    if (source === 'slides') return '国家平台课件'
    if (source === 'summary') return '国家平台课程简介'
    return '课题'
}

export const v2Slug = slug => (['art', 'music'].includes(slug) ? 'arts' : slug)
const HISTORY_SCOPE = { 历史7年级上册: ['中国古代史'], 历史7年级下册: ['中国古代史'], 历史8年级上册: ['中国近代史'], 历史8年级下册: ['中国现代史'], 历史9年级上册: ['世界古代史', '世界近代史'], 历史9年级下册: ['世界近代史', '世界现代史'] }

// a unit's lessons, repeats of one 课题 (several 课时) folded into one row with every 要点 any copy was given
export function alignmentUnits(record) {
    const units = []
    for (const lesson of record?.lessons || []) {
        const name = (lesson.chapters?.[0] || lesson.title).replace(/\s+/gu, ' ')
        let unit = units.find(item => item.name === name)
        if (!unit) units.push(unit = { name, chapter: lesson.chapters?.[0] || null, lessons: [] })
        const key = lessonKey(lesson.title)
        let row = unit.lessons.find(item => item.key === key)
        const title = lesson.title.replace(HOUR, '').trim()
        if (!row) unit.lessons.push(row = { key, id: lesson.id, title, pdf_page: lesson.pdf_page || null, judged: false, rows: [] })
        // the plainest title names the row: 「正数与负数」, not 「正数与负数（一）」
        else if (title.length < row.title.length) row.title = title
        if (!row.pdf_page && lesson.pdf_page) row.pdf_page = lesson.pdf_page
        if (Array.isArray(lesson.align)) row.judged = true
        for (const item of lesson.align || []) {
            const same = row.rows.find(existing => existing[0] === item[0])
            if (!same) row.rows.push(item)
            else if (item[1] === 'T' && same[1] === 'P') row.rows.splice(row.rows.indexOf(same), 1, item)
        }
    }
    for (const unit of units) for (const row of unit.lessons) row.rows.sort((a, b) => (a[1] === b[1] ? 0 : a[1] === 'T' ? -1 : 1))
    return units
}

export function pointIndex(subject) {
    const index = new Map()
    for (const standard of subject?.standards || []) {
        for (const item of standard.indicators || []) index.set(item.code, { text: item.text, standard: standard.code, title: standard.level2 || standard.title, level1: standard.level1, grades: standard.grades || [] })
    }
    return index
}

// the 要点 of the book's grade (a 历史 volume: its period only), with what this book's lessons do with each
export function bookCoverage(units, subject, book) {
    const scope = HISTORY_SCOPE[String(book?.title || '').replace(/\s+/gu, '')]
    const standards = (subject?.standards || [])
        .filter(item => !book?.grade || !item.grades?.length || item.grades.includes(book.grade))
        .filter(item => !scope || scope.includes(item.level1))
    const taught = new Set()
    const touched = new Set()
    for (const unit of units) {
        for (const lesson of unit.lessons) {
            for (const [point, relation] of lesson.rows) (relation === 'T' ? taught : touched).add(point)
        }
    }
    const groups = standards.map(standard => ({
        standard,
        points: (standard.indicators || []).map(item => ({ code: item.code, text: item.text, state: taught.has(item.code) ? 'T' : touched.has(item.code) ? 'P' : null }))
    }))
    const all = groups.flatMap(group => group.points)
    return {
        groups,
        total: all.length,
        taught: all.filter(item => item.state === 'T').length,
        touched: all.filter(item => item.state === 'P').length,
        lessons: units.reduce((sum, unit) => sum + unit.lessons.length, 0),
        judged: units.reduce((sum, unit) => sum + unit.lessons.filter(item => item.judged).length, 0)
    }
}
