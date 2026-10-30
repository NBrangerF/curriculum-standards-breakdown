// Compact star-map dataset shared by the sky, the subject chart and the command palette.
// One star per 要点; the 要点 of one standard form a constellation (prev/next run inside the standard).
// Star row:          [code, subject, band, domain, skill|-1, title, text, official, prev[], next[], sub, constellation]
// Constellation row: [code, subject, band, domain, sub, name, statement, firstStar, starCount]
export const F = Object.freeze({ CODE: 0, SUBJ: 1, BAND: 2, DOMAIN: 3, SKILL: 4, TITLE: 5, TEXT: 6, OFFICIAL: 7, PREV: 8, NEXT: 9, SUB: 10, CON: 11 })
export const C = Object.freeze({ CODE: 0, SUBJ: 1, BAND: 2, DOMAIN: 3, SUB: 4, NAME: 5, TEXT: 6, FIRST: 7, COUNT: 8 })

export const SUBJECT_SHORT = ['道法', '语文', '数学', '英语', '历史', '地理', '科学', '物理', '化学', '生物', '信息', '体育', '艺术', '劳动']
// The four-stage frame every subject sits in; a subject's own stage names come from K.subjects[s].stages.
export const BAND_LABEL = ['1–2 年级', '3–4 年级', '5–6 年级', '7–9 年级']
export const STAGE_RANGE = BAND_LABEL
export const SKILL_SHORT = ['批判性思维', '创新创造', '自主学习', '协作', '沟通表达', '数字素养', '全球公民']
export const CN_DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

const stageOf = (K, s, band) => K?.subjects[s]?.stages?.find(st => st.band === band)
// 第一学段 / 水平一 / 一级 … for a subject's band, or '' where the subject has no such stage.
export function stageName(K, s, band) {
    return stageOf(K, s, band)?.label.replace(/（.*$/u, '') || ''
}
// The grades a subject's band covers (艺术 band 1 is 3–5 年级).
export function stageRange(K, s, band) {
    return stageOf(K, s, band)?.range || BAND_LABEL[band]
}

// A star opens its standard at the 要点; a constellation opens the standard.
export function starHref(code) {
    const standard = String(code).replace(/\.\d+$/u, '')
    return standard === code ? `/standards/${encodeURIComponent(code)}` : `/standards/${encodeURIComponent(standard)}#${encodeURIComponent(code)}`
}

let pending = null

function derive(raw) {
    const S = raw.standards
    const N = S.length
    const bySubject = Array.from({ length: raw.subjects.length }, () => [])
    const bySkill = Array.from({ length: raw.skills.length }, () => [])
    const codeIndex = new Map()
    for (let i = 0; i < N; i++) {
        const row = S[i]
        codeIndex.set(row[F.CODE], i)
        bySubject[row[F.SUBJ]].push(i)
        if (row[F.SKILL] >= 0) bySkill[row[F.SKILL]].push(i)
    }
    const cons = raw.constellations || []
    const consBySubject = Array.from({ length: raw.subjects.length }, () => [])
    cons.forEach((row, c) => { consBySubject[row[C.SUBJ]].push(c); codeIndex.set(row[C.CODE], row[C.FIRST]) })
    // The stars of a constellation, in order.
    const starsOf = c => Array.from({ length: cons[c][C.COUNT] }, (_, k) => cons[c][C.FIRST] + k)
    const haystack = S.map(row => `${row[F.CODE]} ${cons[row[F.CON]]?.[C.NAME] || ''} ${row[F.TEXT]} ${raw.subjects[row[F.SUBJ]].name} ${raw.subjects[row[F.SUBJ]].domains[row[F.DOMAIN]]}`.toLowerCase())
    const slugIndex = new Map(raw.subjects.map((subject, k) => [subject.slug, k]))
    return { ...raw, S, N, cons, consBySubject, starsOf, bySubject, bySkill, codeIndex, haystack, slugIndex }
}

export function loadStarmap() {
    if (!pending) {
        pending = fetch('/data/starmap.json')
            .then(response => {
                if (!response.ok) throw new Error(`starmap ${response.status}`)
                return response.json()
            })
            .then(derive)
            .catch(error => {
                pending = null
                throw error
            })
    }
    return pending
}

export function searchStarmap(K, query) {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return null
    const terms = q.split(/\s+/)
    const out = []
    for (let i = 0; i < K.N; i++) if (terms.every(t => K.haystack[i].includes(t))) out.push(i)
    const code = i => K.S[i][F.CODE].toLowerCase()
    const score = i => (code(i) === q ? 0 : code(i).startsWith(q) ? 1 : terms.every(t => K.S[i][F.TITLE].toLowerCase().includes(t)) ? 2 : 3)
    return out.sort((x, y) => score(x) - score(y) || x - y)
}
