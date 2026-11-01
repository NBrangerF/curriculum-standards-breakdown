// 课堂诊断题: loading the bank, finding questions for a book unit or a 要点, and turning questions into slides.
// The slide list is shared by the projector view and the PPT export, so both show the same thing.

let pendingBank = null
let pendingIndex = null

export function loadBank(slug = 'math') {
    pendingBank ??= fetch(`/data/checks/${slug}.json`).then(response => {
        if (!response.ok) throw new Error('诊断题加载失败，请刷新再试')
        return response.json()
    }).catch(error => {
        pendingBank = null
        throw error
    })
    return pendingBank
}

export function loadChecksIndex() {
    pendingIndex ??= fetch('/data/checks/index.json').then(response => (response.ok ? response.json() : null)).catch(() => {
        pendingIndex = null
        return null
    })
    return pendingIndex
}

// How a class of 40–60 answers at once, without devices.
export const TYPE_META = {
    choice: { label: '选择', how: '选几，就举几根手指', short: '手势 1–4' },
    judge: { label: '同意吗', how: '同意竖起大拇指，不同意拇指朝下', short: '拇指上下' },
    step: { label: '哪一步错', how: '从第几步开始错，就举几根手指', short: '手势 1–4' },
    write: { label: '写答案', how: '把答案写在草稿纸上，举起来', short: '草稿纸举起' }
}

export const TERMS = ['上', '下']
export const BOOKS = Array.from({ length: 9 }, (_, index) => index + 1).flatMap(grade => TERMS.map(term => ({ grade, term, key: `${grade}${term}` })))
export const GRADE_NAME = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']
export const bookLabel = ({ grade, term }) => `${GRADE_NAME[grade]}年级${term}册`

/** The answer choices a class can show for one question: [{ key, label, correct, misconceptions: [id] }]. */
export function choicesOf(item) {
    const wrongOf = key => [item.wrong?.[key]].flat().filter(Boolean)
    if (item.type === 'choice') return item.options.map((text, index) => ({ key: String(index), label: String(index + 1), text, correct: index === item.answer, misconceptions: wrongOf(String(index)) }))
    if (item.type === 'step') return item.work.map((text, index) => ({ key: String(index), label: String(index + 1), text, correct: index === item.answer, misconceptions: index === item.answer ? [] : [] }))
    if (item.type === 'judge') return [
        { key: 'agree', label: '同意', text: '同意', correct: item.answer === true, misconceptions: wrongOf('agree') },
        { key: 'disagree', label: '不同意', text: '不同意', correct: item.answer === false, misconceptions: wrongOf('disagree') }
    ]
    return [
        { key: 'right', label: '对', text: item.answer, correct: true, misconceptions: [] },
        ...Object.keys(item.wrong || {}).map(answer => ({ key: answer, label: answer, text: answer, correct: false, misconceptions: wrongOf(answer) })),
        { key: 'other', label: '其他', text: '其他答案', correct: false, misconceptions: [] }
    ]
}

/** Every misconception a question can reveal, in option order. */
export function misconceptionsOf(item) {
    if (item.type === 'step') return item.error ? [item.error] : []
    return [...new Set(Object.values(item.wrong || {}).flat())]
}

const squash = text => String(text || '').replace(/[\s、，,（）()·—\-－]/gu, '')

/** Questions for one book (grade + term), grouped by the unit titles of the 人教版 book when we know them. */
export function questionsForBook(bank, grade, term) {
    return bank.items.filter(item => item.grade === Number(grade) && item.term === term)
}

export function unitsOf(items) {
    const units = []
    for (const item of items) {
        let unit = units.find(entry => entry.unit === item.unit)
        if (!unit) units.push(unit = { unit: item.unit, items: [] })
        unit.items.push(item)
    }
    return units
}

export function questionsForPoint(bank, code) {
    return bank.items.filter(item => item.points.includes(code))
}

/** Questions that fit a lesson of any edition: same 要点 first, then a title word match within the grade. */
export function questionsForLesson(bank, { grade, title = '', chapters = [], points = [] }) {
    const text = squash([title, ...chapters].join(' '))
    return bank.items
        .map(item => {
            let score = 0
            if (item.points.some(code => points.includes(code))) score += 2
            if (item.lessons.some(keyword => text.includes(squash(keyword)))) score += 3
            if (text.includes(squash(item.unit))) score += 1
            if (grade && Math.abs(item.grade - grade) > 1) score = 0
            return { item, score }
        })
        .filter(entry => entry.score >= 3)
        .sort((a, b) => b.score - a.score)
        .map(entry => entry.item)
}

/** The wrong working a 比一比 slide sets beside the right one, and the misconception it shows. */
export function workingToCompare(item) {
    if (item.type === 'judge') return item.answer ? {} : { typical: item.work, error: [item.wrong?.agree].flat()[0] }
    if (item.type === 'step') return { typical: item.work, error: item.error }
    return { typical: item.typical, error: item.typical_error }
}

/**
 * Slides for a set of questions. extras: 'contrast' (two workings side by side), 'ladder' (阶梯练习);
 * 'first' limits the extras to the first question (the 批完就用 plan: one full round, then a quick second check).
 */
export function buildDeck(items, { extras = [], title = '' } = {}) {
    const slides = []
    if (items.length > 1 || title) slides.push({ kind: 'cover', title: title || '课堂诊断', items })
    items.forEach((item, index) => {
        const n = index + 1
        const more = extras.includes('first') && index > 0 ? [] : extras
        slides.push({ kind: 'question', item, n, total: items.length })
        slides.push({ kind: 'reveal', item, n, total: items.length })
        const { typical, error } = workingToCompare(item)
        if (more.includes('contrast') && typical?.length) slides.push({ kind: 'contrast', item, n, total: items.length, typical, error })
        if (more.includes('ladder') && item.ladder?.length) slides.push({ kind: 'ladder', item, n, total: items.length })
    })
    return slides
}

export function presentHref(ids, { extras = [], title = '', back = '' } = {}) {
    const params = new URLSearchParams({ q: ids.join(',') })
    if (extras.length) params.set('with', extras.join(','))
    if (title) params.set('title', title)
    if (back) params.set('back', back)
    return `/checks/present?${params}`
}

// 批完就用: what a teacher saw while marking, kept on this device only.
const RECORDS = 'kebiao.checks.records'
export const LEVELS = [
    { value: 0, label: '没看到' },
    { value: 1, label: '几个人' },
    { value: 2, label: '不少人' },
    { value: 3, label: '一大半' }
]

export function readRecords() {
    try { return JSON.parse(window.localStorage.getItem(RECORDS) || '[]') } catch { return [] }
}

export function saveRecord(record) {
    const records = readRecords().filter(entry => entry.id !== record.id)
    records.unshift(record)
    try { window.localStorage.setItem(RECORDS, JSON.stringify(records.slice(0, 30))) } catch { /* private mode: the deck still works */ }
    return records
}

export function deleteRecord(id) {
    const records = readRecords().filter(entry => entry.id !== id)
    try { window.localStorage.setItem(RECORDS, JSON.stringify(records)) } catch { /* ignore */ }
    return records
}

/**
 * The next-day plan from what was seen: the misconceptions marked 不少人 or 一大半 first, at most two,
 * each answered by the question that targets it most directly (that misconception on an option), not used yet.
 */
export function planFromSeen(items, seen) {
    const ranked = Object.entries(seen).filter(([, level]) => level > 0).sort((a, b) => b[1] - a[1])
    const picked = []
    const focus = []
    for (const [id] of ranked) {
        if (focus.length >= 2) break
        const candidates = items.filter(item => !picked.includes(item) && misconceptionsOf(item).includes(id))
        const direct = candidates.find(item => item.type === 'choice') || candidates[0]
        if (!direct) continue
        picked.push(direct)
        focus.push(id)
    }
    return { items: picked, focus }
}
