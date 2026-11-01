// 课堂诊断题 for the API and AI tools: the bank built by scripts/checks/bank.mjs (public/data/checks/<subject>.json).
// Every wrong answer comes with the misconception it points to, so an assistant can say what a class that chose it
// was probably thinking and what to do next.
import { readFile } from 'fs/promises'

export const SITE_URL = 'https://www.kebiao.org'

type Misconception = { name: string, why: string, move: string }
export type CheckItem = {
    id: string
    type: 'choice' | 'judge' | 'step' | 'write'
    grade: number
    term: string
    unit: string
    lessons: string[]
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
export type CheckBank = { subject: string, subject_slug: string, note: string, misconceptions: Record<string, Misconception>, items: CheckItem[] }

const HOW: Record<CheckItem['type'], string> = {
    choice: '手势 1–4：选几就举几根手指',
    judge: '拇指上下：同意竖起大拇指，不同意拇指朝下',
    step: '手势 1–4：从第几步开始错就举几根手指',
    write: '草稿纸：写好后一起举起来'
}

// fractions in the bank's markup ({5/6}) become 5/6 for plain text
export const plain = (text: string) => String(text).replace(/\{([^{}]*)\}/gu, '$1')

export function createCheckStore(dataRoot: string) {
    const banks = new Map<string, Promise<CheckBank | null>>()
    return {
        async bank(slug = 'math'): Promise<CheckBank | null> {
            if (!/^[a-z_]+$/u.test(slug)) return null
            if (!banks.has(slug)) banks.set(slug, readFile(`${dataRoot}/checks/${slug}.json`, 'utf8').then(text => JSON.parse(text) as CheckBank).catch(() => null))
            return banks.get(slug)!
        }
    }
}
export type CheckStore = ReturnType<typeof createCheckStore>

export const presentUrl = (ids: string[]) => `${SITE_URL}/checks/present?q=${ids.join(',')}`

/** A question as the API returns it: the answer spelled out, each wrong answer with its misconception. */
export function publicCheck(item: CheckItem, bank: CheckBank) {
    const mis = (id?: string) => (id && bank.misconceptions[id] ? { id, ...bank.misconceptions[id] } : null)
    // a 哪一步错 question has one misconception: the one in the wrong step (its answer)
    const wrongAnswers = item.type === 'step'
        ? []
        : Object.entries(item.wrong || {}).map(([key, ids]) => ({
            answer: item.type === 'choice' ? `${Number(key) + 1}. ${plain(item.options?.[Number(key)] || '')}` : item.type === 'judge' ? (key === 'agree' ? '同意' : '不同意') : plain(key),
            misconceptions: [ids].flat().map(id => mis(id)).filter(Boolean)
        }))
    const answer = item.type === 'choice' ? `${Number(item.answer) + 1}. ${plain(item.options?.[Number(item.answer)] || '')}`
        : item.type === 'judge' ? (item.answer ? '同意' : '不同意')
            : item.type === 'step' ? `第 ${Number(item.answer) + 1} 步开始错`
                : plain(String(item.answer))
    return {
        id: item.id,
        type: item.type,
        how_to_answer: HOW[item.type],
        subject: bank.subject,
        grade: item.grade,
        term: item.term,
        textbook_unit: `人教版 ${item.grade}${item.term} ${item.unit}`,
        points: item.points,
        topic: item.topic,
        stem: plain(item.stem),
        work: item.work?.map(plain),
        options: item.options?.map(plain),
        answer,
        wrong_answers: wrongAnswers,
        step_error: item.type === 'step' ? mis(item.error) : undefined,
        right: item.right.map(plain),
        ladder: item.ladder.map(step => ({ q: plain(step.q), a: plain(step.a) })),
        present_url: presentUrl([item.id]),
        markup_note: '题干里的 {a/b} 是分数 a/b；present_url 打开可投影的放映页。'
    }
}

/** Questions by 要点 or standard code, grade/term, or a word in the topic, unit or stem. */
export function findChecks(bank: CheckBank, { code = '', grade = 0, term = '', q = '' }: { code?: string, grade?: number, term?: string, q?: string }) {
    const upper = code.toUpperCase()
    const word = q.trim()
    return bank.items.filter(item => {
        if (upper && !item.points.some(point => point === upper || point.replace(/\.\d+$/u, '') === upper)) return false
        if (grade && item.grade !== grade) return false
        if (term && item.term !== term) return false
        if (word && ![item.topic, item.unit, item.stem, ...item.lessons].some(text => plain(text).includes(word))) return false
        return true
    })
}
