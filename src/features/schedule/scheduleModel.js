// 学期教学进度表: a textbook's 国家平台 units laid out over the weeks of a term.
// The platform lists each lesson several times (re-uploads, 「（第2课时）」 parts, 「单元名-课名」 aliases), so lessons
// are merged by a normalised title, and a unit's hours are only an estimate the teacher edits.

const HOUR = /[（(]第([一二三四五六七八九十\d]+)课时[）)]\s*$/u
const PREFIX = /^(?:第[一二三四五六七八九十]+单元|[^-—]{2,12})[-—]+/u
export const normalise = title => title
    .replace(HOUR, '')
    .replace(/^[^_]{2,20}_/u, '')
    .replace(PREFIX, '')
    .replace(PREFIX, '')
    .replace(/[《》“”"（）()·\s]/gu, '')
    .replace(/(?:例\d+(?:、例\d+)*|练习[一二三四五六七八九十\d]*)$/u, '')
    .replace(/^(?:\d+|一单元略读课文|略读课文)/u, '')

// typical periods a week, to start from; every school differs, so the teacher sets it
export const PERIODS = { chinese: 6, math: 4, english: 3, morality_law: 2, science: 2, physics: 3, chemistry: 3, biology: 2, history: 2, geography: 2, it: 1, pe: 3, music: 2, art: 2, labor: 1 }

export function unitsOf(record) {
    const units = []
    for (const lesson of record.lessons) {
        const name = lesson.chapters[0] || lesson.title
        let unit = units.find(item => item.name === name)
        // a flat tree (美术, 音乐) has no chapter: the 「unit」 is one lesson, opened in AI 备课 by its id
        if (!unit) units.push(unit = { name, chapter: lesson.chapters[0] || null, first: lesson.id, lessons: [], points: [], hours: 0 })
        const key = normalise(lesson.title)
        // the same lesson uploaded again, or one 课时 of a lesson already listed (「口语交际-春天去哪儿玩」 after 「口语交际」);
        // a shared start of at least four characters, so 「第二次鸦片战争」 stays apart from 「鸦片战争」
        const same = unit.lessons.find(item => item.key === key || (Math.min(key.length, item.key.length) >= 4 && (item.key.startsWith(key) || key.startsWith(item.key))))
        if (same) {
            same.hours = Math.max(same.hours, lesson.hours || 1)
        } else {
            unit.lessons.push({ key, title: lesson.title.replace(HOUR, '').replace(/^[^_]{2,20}_/u, '').replace(/^第[一二三四五六七八九十]+单元[-—]+/u, '').trim(), hours: Math.max(1, lesson.hours || 1) })
        }
        for (const point of lesson.ai_points || []) if (!unit.points.includes(point)) unit.points.push(point)
    }
    for (const unit of units) unit.hours = unit.lessons.reduce((sum, item) => sum + item.hours, 0)
    return units
}

// lay units over weeks: each unit starts where the previous one ended
export function layout(units, { perWeek, weeks, review }) {
    const teaching = Math.max(1, weeks - review)
    const available = teaching * perWeek
    let used = 0
    const rows = units.map(unit => {
        const start = Math.floor(used / perWeek) + 1
        used += unit.hours
        const end = Math.max(start, Math.ceil(used / perWeek))
        return { ...unit, start, end }
    })
    return { rows, used, available, teaching, over: used - available }
}

export const weekLabel = (start, end) => (start === end ? `第 ${start} 周` : `第 ${start}–${end} 周`)

export function dateOf(startDate, week) {
    if (!startDate) return ''
    const date = new Date(`${startDate}T00:00:00`)
    if (Number.isNaN(date.getTime())) return ''
    date.setDate(date.getDate() + (week - 1) * 7)
    return `${date.getMonth() + 1}/${date.getDate()}`
}
