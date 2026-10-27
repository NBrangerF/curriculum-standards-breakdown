// Compact star-map dataset shared by the sky, the subject chart and the command palette.
// Row layout: [code, subject, band, domain, skill|-1, title, text, hasOfficialText, prev[], next[], subdomain]
export const F = Object.freeze({ CODE: 0, SUBJ: 1, BAND: 2, DOMAIN: 3, SKILL: 4, TITLE: 5, TEXT: 6, OFFICIAL: 7, PREV: 8, NEXT: 9, SUB: 10 })

export const SUBJECT_SHORT = ['道法', '语文', '数学', '英语', '科学', '信息', '体育', '艺术', '劳动']
export const BAND_LABEL = ['1–2 年级', '3–4 年级', '5–6 年级', '七年级', '八年级', '九年级']
export const STAGE_RANGE = ['1–2 年级', '3–4 年级', '5–6 年级', '7–9 年级']
export const SKILL_SHORT = ['批判性思维', '创新创造', '自主学习', '协作', '沟通表达', '数字素养', '全球公民']
export const CN_DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

export function stageName(subject, stage) {
    const names = subject === 6 ? ['水平一', '水平二', '水平三', '水平四'] : ['第一学段', '第二学段', '第三学段', '第四学段']
    return names[stage]
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
    // 7–9 triplets: one 第四学段 requirement split into 七/八/九 and chained G7→G8→G9.
    const group = new Int32Array(N).fill(-1)
    const groups = []
    for (let i = 0; i < N; i++) {
        if (S[i][F.BAND] < 3 || group[i] >= 0 || S[i][F.PREV].some(j => S[j][F.SUBJ] === S[i][F.SUBJ] && S[j][F.BAND] >= 3)) continue
        const g = [-1, -1, -1]
        let x = i
        while (x != null && x >= 0 && g[S[x][F.BAND] - 3] < 0 && group[x] < 0) {
            g[S[x][F.BAND] - 3] = x
            group[x] = groups.length
            const from = x
            x = S[from][F.NEXT].find(j => S[j][F.SUBJ] === S[from][F.SUBJ] && S[j][F.BAND] === S[from][F.BAND] + 1)
        }
        groups.push(g)
    }
    for (let i = 0; i < N; i++) {
        if (S[i][F.BAND] >= 3 && group[i] < 0) {
            const g = [-1, -1, -1]
            g[S[i][F.BAND] - 3] = i
            group[i] = groups.length
            groups.push(g)
        }
    }
    const haystack = S.map(row => `${row[F.CODE]} ${row[F.TITLE]} ${row[F.TEXT]} ${raw.subjects[row[F.SUBJ]].name} ${raw.subjects[row[F.SUBJ]].domains[row[F.DOMAIN]]}`.toLowerCase())
    const slugIndex = new Map(raw.subjects.map((subject, k) => [subject.slug, k]))
    return { ...raw, S, N, bySubject, bySkill, codeIndex, group, groups, haystack, slugIndex }
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
