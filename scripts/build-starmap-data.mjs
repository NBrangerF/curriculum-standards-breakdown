// Build public/data/starmap.json from the v2 standards: one star per 要点, and the 要点 of one standard
// chained into a constellation (prev/next run inside the standard only).
// Star row:          [code, subject, band, domain, skill|-1, title, text, official, prev[], next[], sub, constellation]
// Constellation row: [code, subject, band, domain, sub, name, statement, firstStar, starCount]
// band is the stage's place among the four 学段 (1–2, 3–4/3–5, 5–6/6–7, 7–9/8–9); each subject lists its own labels.
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] || '.'
const out = join(root, 'public/data/starmap.json')
// Subject hues are traditional pigments; the five junior subjects added with the 2025 revision get their own.
export const SUBJECTS = [
    ['morality_law', '道德与法治', '胭脂', '#EC6FA0'],
    ['chinese', '语文', '朱砂', '#F2603A'],
    ['math', '数学', '石青', '#3FA2E0'],
    ['english', '英语', '黛蓝', '#7D8AF8'],
    ['history', '历史', '赭石', '#D98C55'],
    ['geography', '地理', '葱绿', '#93CF5A'],
    ['science', '科学', '石绿', '#45C46F'],
    ['physics', '物理', '银朱', '#EF5A63'],
    ['chemistry', '化学', '品红', '#DC6CD2'],
    ['biology', '生物学', '竹青', '#5DBFA1'],
    ['it', '信息科技', '天青', '#4FD1C5'],
    ['pe', '体育与健康', '藤黄', '#F4B32F'],
    ['arts', '艺术', '丁香', '#C08CF0'],
    ['labor', '劳动', '柳黄', '#B6C94A']
]
const clean = text => String(text || '').replace(/\s+/g, ' ').trim()
// The four-stage frame: a stage sits by its first grade (英语 3–4 starts at band 1, 艺术 6–7 at band 2).
const bandOf = grades => (grades[0] <= 2 ? 0 : grades[0] <= 4 ? 1 : grades[0] <= 6 && grades.at(-1) <= 7 && grades.at(-1) !== 9 ? 2 : 3)
// A short line for tooltips and the home ticker: the 要点's first clause.
const firstClause = text => {
    const t = clean(text)
    const cut = t.split(/[，；。：]/u)[0]
    return cut.length >= 6 && cut.length <= 28 ? cut : t.length <= 28 ? t : `${t.slice(0, 26)}…`
}

const skills = JSON.parse(readFileSync(join(root, 'public/data/skills_meta.json'), 'utf8')).competencies.map(c => [c.code, c.name_cn])
// Transferable-skill candidates live on the old records; a 要点 takes the most common one among its old codes.
const oldSkill = new Map()
for (const [slug] of SUBJECTS) {
    const file = join(root, 'public/data/by_subject', `${slug}.json`)
    if (!existsSync(file)) continue
    for (const r of JSON.parse(readFileSync(file, 'utf8')).standards) if (r.ts_primary?.[0]) oldSkill.set(r.code, Number(r.ts_primary[0].slice(2)) - 1)
}
const skillOf = (...codeLists) => {
    for (const codes of codeLists) {
        const votes = new Map()
        for (const code of codes) { const k = oldSkill.get(code); if (k >= 0) votes.set(k, (votes.get(k) || 0) + 1) }
        if (votes.size) return [...votes].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
    }
    return -1
}

const stars = []
const constellations = []
const subjects = SUBJECTS.map(([slug, name, colorName, color], s) => {
    const data = JSON.parse(readFileSync(join(root, 'public/data/v2/by_subject', `${slug}.json`), 'utf8'))
    const domains = []
    const subs = []
    const first = stars.length
    for (const std of data.standards) {
        if (!domains.includes(std.level1)) domains.push(std.level1)
        if (!subs.includes(std.level2)) subs.push(std.level2)
        const band = bandOf(std.grades)
        const c = constellations.length
        constellations.push([std.code, s, band, domains.indexOf(std.level1), subs.indexOf(std.level2), std.level2, clean(std.statement), stars.length, std.indicators.length])
        std.indicators.forEach((ind, k) => {
            const i = stars.length
            stars.push([
                ind.code, s, band, domains.indexOf(std.level1), skillOf(ind.legacy_codes, std.legacy_codes),
                firstClause(ind.text), clean(ind.text), 1,
                k > 0 ? [i - 1] : [], k < std.indicators.length - 1 ? [i + 1] : [],
                subs.indexOf(std.level2), c
            ])
        })
    }
    const stages = data.stages.map(st => ({ band: bandOf(st.grades), code: st.stage_code, label: st.label, range: `${st.stage.replace('-', '–')} 年级` }))
    return { slug, name, colorName, color, count: stars.length - first, standards: data.standards.length, domains, subs, stages }
})
const version = JSON.parse(readFileSync(join(root, 'public/data/data_version.json'), 'utf8')).data_version

writeFileSync(out, JSON.stringify({ schema: 2, version, subjects, skills, standards: stars, constellations }))
console.log(JSON.stringify({ out, stars: stars.length, constellations: constellations.length, withSkill: stars.filter(r => r[4] >= 0).length, bytes: statSync(out).size }))
