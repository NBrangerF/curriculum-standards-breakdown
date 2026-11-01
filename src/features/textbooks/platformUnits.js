// A textbook's 国家平台 units, for the book page's 「按单元备课」.
// The platform lists each lesson several times (re-uploads, 「（第2课时）」 parts, 「单元名-课名」 aliases), so lessons
// are merged by a normalised title, and a unit's hours are only an estimate.

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
