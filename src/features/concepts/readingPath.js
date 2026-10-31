// 师范生、新教师：先读这六页 — the reading order on the 概念词典 index and the first step of the 教资 route.
export const READING_PATH = [
    ['standard-document', '一本课标有哪六个部分，什么问题翻哪一部分'],
    ['core-literacy', '每门课要培养的是什么'],
    ['content-academic-guidance', '学什么、学到什么程度、可以怎么教'],
    ['learning-objective', '目标怎么写才看得见、评得了'],
    ['teach-learn-assess', '目标、活动、评价为什么要对齐'],
    ['unit-design', '从一课到一个单元：单元整体教学设计']
]

// which of the six a reader has opened on this device, for the 教资 route's 「读过 n/6」
const READ_KEY = 'kebiao.exam.read'

export function readPathProgress() {
    try {
        const read = JSON.parse(window.localStorage.getItem(READ_KEY) || '[]')
        return READING_PATH.filter(([id]) => read.includes(id)).length
    } catch {
        return 0
    }
}

export function markPathRead(termId) {
    if (!READING_PATH.some(([id]) => id === termId)) return
    try {
        const read = JSON.parse(window.localStorage.getItem(READ_KEY) || '[]')
        if (!read.includes(termId)) window.localStorage.setItem(READ_KEY, JSON.stringify([...read, termId]))
    } catch { /* private mode */ }
}
