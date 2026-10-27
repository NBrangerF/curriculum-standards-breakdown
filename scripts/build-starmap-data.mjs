// Build public/data/starmap.json: one compact row per standard for the home sky and subject charts.
// Row: [code, subject, band, domain, skill|-1, title, text, hasOfficialText, prev[], next[], subdomain]
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] || '.'
const out = join(root, 'public/data/starmap.json')
export const SUBJECTS = [
    ['morality_law', '道德与法治', '胭脂', '#EC6FA0'],
    ['chinese', '语文', '朱砂', '#F2603A'],
    ['math', '数学', '石青', '#3FA2E0'],
    ['english', '英语', '黛蓝', '#7D8AF8'],
    ['science', '科学', '石绿', '#45C46F'],
    ['it', '信息科技', '天青', '#4FD1C5'],
    ['pe', '体育与健康', '藤黄', '#F4B32F'],
    ['arts', '艺术', '丁香', '#C08CF0'],
    ['labor', '劳动', '柳黄', '#B6C94A']
]
const BANDS = ['H1', 'H2', 'H3', 'H4G7', 'H4G8', 'H4G9']
const clean = text => String(text || '').replace(/\s+/g, ' ').trim()

const records = []
const subjects = SUBJECTS.map(([slug, name, colorName, color], s) => {
    const data = JSON.parse(readFileSync(join(root, 'public/data/by_subject', `${slug}.json`), 'utf8'))
    const domains = []
    const subs = []
    for (const record of data.standards) {
        if (!domains.includes(record.domain)) domains.push(record.domain)
        const sub = clean(record.subdomain)
        if (!subs.includes(sub)) subs.push(sub)
        records.push({ s, record })
    }
    return { slug, name, colorName, color, count: data.standards.length, domains, subs }
})

const indexOf = new Map(records.map((entry, i) => [entry.record.code, i]))
const links = value => String(value || '').split('|').map(code => indexOf.get(code)).filter(i => i !== undefined)
const standards = records.map(({ s, record }) => {
    const skill = record.ts_primary?.[0] ? Number(record.ts_primary[0].slice(2)) - 1 : -1
    return [
        record.code,
        s,
        BANDS.indexOf(record.grade_band),
        subjects[s].domains.indexOf(record.domain),
        skill,
        clean(record.standard_title),
        clean(record.standard),
        record.official_text ? 1 : 0,
        links(record.previous_code),
        links(record.next_code),
        subjects[s].subs.indexOf(clean(record.subdomain))
    ]
})
const skills = JSON.parse(readFileSync(join(root, 'public/data/skills_meta.json'), 'utf8')).competencies.map(c => [c.code, c.name_cn])
const version = JSON.parse(readFileSync(join(root, 'public/data/data_version.json'), 'utf8')).data_version

writeFileSync(out, JSON.stringify({ version, subjects, skills, standards }))
console.log(JSON.stringify({ out, standards: standards.length, links: standards.reduce((n, row) => n + row[9].length, 0), bytes: statSync(out).size }))
