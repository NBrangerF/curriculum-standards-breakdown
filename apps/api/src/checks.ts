// 课堂诊断题 for the API and AI tools: the banks built by scripts/checks/bank.mjs (public/data/checks/<subject>.json,
// one per subject, and index.json). Every wrong answer comes with the misconception it points to, so an assistant can
// say what a class that chose it was probably thinking and what to do next.
import { readFile } from 'fs/promises'

export const SITE_URL = 'https://www.kebiao.org'

type Misconception = { name: string, why: string, move: string }
export type CheckItem = {
    id: string
    type: 'choice' | 'judge' | 'step' | 'write'
    book: string
    grade: number
    grades?: number[]
    term: string
    unit: string
    lessons?: string[]
    points: string[]
    topic: string
    stem: string
    work?: string[]
    options?: string[]
    answer: number | boolean | string
    wrong?: Record<string, string | string[]>
    error?: string
    right: string[]
    typical?: string[]
    typical_error?: string
    ladder: Array<{ q: string, a: string }>
}
type CheckBook = { key: string, label: string, short: string, edition: string }
export type CheckBank = {
    subject: string
    subject_slug: string
    code: string
    markup: 'math' | 'plain'
    note: string
    books: CheckBook[]
    misconceptions: Record<string, Misconception>
    items: CheckItem[]
}
type CheckIndex = { subjects: Array<{ slug: string, name: string, code: string, questions: number }> }

const HOW: Record<CheckItem['type'], string> = {
    choice: '手势 1–4：选几就举几根手指',
    judge: '拇指上下：同意竖起大拇指，不同意拇指朝下',
    step: '手势 1–4：从第几步开始错就举几根手指；觉得都对就握拳',
    write: '草稿纸：写好后一起举起来'
}

// 要点 code prefix → bank; 艺术 splits into 音乐 and 美术 by domain (舞蹈、戏剧 have no bank)
const POINT_PREFIX: Record<string, string> = { MA: 'math', CN: 'chinese', EN: 'english', ML: 'morality_law', HI: 'history', GE: 'geography', SC: 'science', PH: 'physics', CH: 'chemistry', BI: 'biology', IT: 'it', PE: 'pe', LA: 'labor' }
export function subjectOfCode(code: string) {
    const [prefix, , domain] = code.toUpperCase().split('-')
    if (prefix === 'AR') return domain === 'MU' ? 'music' : domain === 'VA' || domain === 'FM' ? 'art' : ''
    return POINT_PREFIX[prefix] || ''
}

const SUP: Record<string, string> = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', n: 'ⁿ' }
const SUB: Record<string, string> = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋' }
const script = (text: string, table: Record<string, string>, marker: string) => ([...text].every(char => table[char]) ? [...text].map(char => table[char]).join('') : `${marker}(${text})`)

/** One plain line from the bank's math markup ({5/6} → 5/6, x^2 → x², H_2O → H₂O, =[点燃]= → ═点燃═); text subjects as written. */
export function plain(text: string, markup: CheckBank['markup'] = 'math') {
    if (markup === 'plain') return String(text)
    return String(text)
        .replace(/=\[([^\]]*)\]=/gu, '═$1═')
        .replace(/-\[([^\]]*)\]->/gu, '─$1→')
        .replace(/\^\{([^{}]*)\}|\^([0-9]+|[a-zA-Z])/gu, (_, group, single) => script(group ?? single, SUP, '^'))
        .replace(/_\{([^{}]*)\}|_([0-9]+|[a-zA-Z])/gu, (_, group, single) => script(group ?? single, SUB, '_'))
        .replace(/\{([^{}]*)\}/gu, '$1')
}

export function createCheckStore(dataRoot: string) {
    const banks = new Map<string, Promise<CheckBank | null>>()
    let index: Promise<CheckIndex | null> | null = null
    const store = {
        async index(): Promise<CheckIndex | null> {
            index ??= readFile(`${dataRoot}/checks/index.json`, 'utf8').then(text => JSON.parse(text) as CheckIndex).catch(() => null)
            return index
        },
        async bank(slug = 'math'): Promise<CheckBank | null> {
            if (!/^[a-z_]+$/u.test(slug)) return null
            if (!banks.has(slug)) banks.set(slug, readFile(`${dataRoot}/checks/${slug}.json`, 'utf8').then(text => JSON.parse(text) as CheckBank).catch(() => null))
            return banks.get(slug)!
        },
        /** A subject asked by slug (english) or name (英语) → its slug, or '' when it has no bank. */
        async resolve(subject: string) {
            const entry = (await store.index())?.subjects.find(item => item.slug === subject || item.name === subject)
            return entry?.slug || ''
        },
        /** The banks to search: one subject, the subject of a 要点 code, or all of them. */
        async banksFor({ subject = '', code = '' }: { subject?: string, code?: string }) {
            const slugs = subject ? [await store.resolve(subject)].filter(Boolean)
                : code ? [subjectOfCode(code)].filter(Boolean)
                    : ((await store.index())?.subjects || []).map(item => item.slug)
            return (await Promise.all(slugs.map(slug => store.bank(slug)))).filter((bank): bank is CheckBank => Boolean(bank))
        },
        async byId(id: string) {
            const entry = (await store.index())?.subjects.find(item => id.startsWith(`${item.code}-`))
            const bank = entry ? await store.bank(entry.slug) : null
            const item = bank?.items.find(candidate => candidate.id === id)
            return bank && item ? { bank, item } : null
        }
    }
    return store
}
export type CheckStore = ReturnType<typeof createCheckStore>

export const presentUrl = (ids: string[]) => `${SITE_URL}/checks/present?q=${ids.join(',')}`

/** A question as the API returns it: the answer spelled out, each wrong answer with its misconception. */
export function publicCheck(item: CheckItem, bank: CheckBank) {
    const p = (text: string) => plain(text, bank.markup)
    const mis = (id?: string) => (id && bank.misconceptions[id] ? { id, name: bank.misconceptions[id].name, why: p(bank.misconceptions[id].why), move: p(bank.misconceptions[id].move) } : null)
    // a 哪一步错 question has one misconception: the one in the wrong step (its answer)
    const wrongAnswers = item.type === 'step'
        ? []
        : Object.entries(item.wrong || {}).map(([key, ids]) => ({
            answer: item.type === 'choice' ? `${Number(key) + 1}. ${p(item.options?.[Number(key)] || '')}` : item.type === 'judge' ? (key === 'agree' ? '同意' : '不同意') : p(key),
            misconceptions: [ids].flat().map(id => mis(id)).filter(Boolean)
        }))
    const answer = item.type === 'choice' ? `${Number(item.answer) + 1}. ${p(item.options?.[Number(item.answer)] || '')}`
        : item.type === 'judge' ? (item.answer ? '同意' : '不同意')
            : item.type === 'step' ? `第 ${Number(item.answer) + 1} 步开始错`
                : p(String(item.answer))
    const book = bank.books?.find(entry => entry.key === item.book)
    return {
        id: item.id,
        type: item.type,
        how_to_answer: HOW[item.type],
        subject: bank.subject,
        subject_slug: bank.subject_slug,
        grade: item.grade,
        grades: item.grades,
        term: item.term,
        textbook_unit: book?.edition === '课标' ? `${book.label} · ${item.unit}` : `${book?.edition || ''} ${book?.short || item.book} ${item.unit}`.trim(),
        points: item.points,
        topic: item.topic,
        stem: p(item.stem),
        work: item.work?.map(p),
        options: item.options?.map(p),
        answer,
        wrong_answers: wrongAnswers,
        step_error: item.type === 'step' ? mis(item.error) : undefined,
        right: item.right.map(p),
        ladder: item.ladder.map(step => ({ q: p(step.q), a: p(step.a) })),
        present_url: presentUrl([item.id])
    }
}

/** Questions by 要点 or standard code, grade/term, or a word in the topic, unit or stem. */
export function findChecks(bank: CheckBank, { code = '', grade = 0, term = '', q = '' }: { code?: string, grade?: number, term?: string, q?: string }) {
    const upper = code.toUpperCase()
    const word = q.trim()
    return bank.items.filter(item => {
        if (upper && !item.points.some(point => point === upper || point.replace(/\.\d+$/u, '') === upper)) return false
        if (grade && !(item.grades || [item.grade]).includes(grade)) return false
        if (term && !item.grades && item.term !== term) return false
        if (word && ![item.topic, item.unit, item.stem, ...(item.lessons || [])].some(text => plain(text, bank.markup).includes(word))) return false
        return true
    })
}
