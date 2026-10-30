// Checks data/interdisciplinary/themes.json against the revised 课标 scan text: every quote word for word on its
// pages, every theme name on its pages (scans split table cells, so the name's characters must appear in order),
// subject names, grades, and the v2 standards it lists. The scan text is local only; without it quotes are skipped.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { normalise, pagesOf } from '../concepts/check_terms.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const SUBJECT_NAMES = ['语文', '数学', '英语', '道德与法治', '科学', '物理', '化学', '生物学', '历史', '地理', '信息科技', '体育与健康', '艺术', '音乐', '美术', '劳动']

const inOrder = (needle, hay) => {
    let at = 0
    for (const char of needle) {
        at = hay.indexOf(char, at)
        if (at < 0) return false
        at += 1
    }
    return true
}

export function checkThemes(data = JSON.parse(readFileSync(path.join(ROOT, 'data/interdisciplinary/themes.json'), 'utf8'))) {
    const errors = []
    const warnings = []
    const scans = new Map()
    const textOf = (subject, pages) => {
        if (!scans.has(subject)) scans.set(subject, pagesOf(subject))
        const scan = scans.get(subject)
        return scan ? normalise(pages.map(page => scan.get(page) || '').join('')) : null
    }
    const quote = (where, subject, item) => {
        const text = textOf(subject, item.pages)
        if (text === null) { warnings.push(`${where}: no scan text for ${subject}`); return }
        if (!text.includes(normalise(item.text ?? item.quote))) errors.push(`${where}: quote not found on ${subject} p${item.pages.join('、')}`)
        if (item.name && !inOrder(normalise(item.name), text)) errors.push(`${where}: name 「${item.name}」 not found on p${item.pages.join('、')}`)
    }
    quote('basis', data.basis.subject, data.basis)
    const names = new Set()
    for (const group of data.groups) {
        quote(`${group.subject}/intro`, group.subject, group.intro)
        for (const theme of group.themes) {
            const where = `${group.subject}/${theme.name}`
            if (names.has(where)) errors.push(`${where}: duplicate`)
            names.add(where)
            quote(where, group.subject, theme)
            for (const name of theme.with) if (!SUBJECT_NAMES.includes(name)) errors.push(`${where}: unknown subject ${name}`)
            if (!theme.grades.length || theme.grades.some(grade => grade < 1 || grade > 9)) errors.push(`${where}: bad grades`)
        }
    }
    const codes = new Set()
    for (const slug of ['chinese', 'math', 'it', 'arts', 'physics', 'chemistry', 'biology']) {
        for (const standard of JSON.parse(readFileSync(path.join(ROOT, `data/v2/by_subject/${slug}.json`), 'utf8')).standards) codes.add(standard.code)
    }
    for (const code of data.standards) if (!codes.has(code)) errors.push(`standards: unknown code ${code}`)
    return { errors, warnings }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { errors, warnings } = checkThemes()
    for (const warning of warnings) console.warn(`warning: ${warning}`)
    for (const error of errors) console.error(`error: ${error}`)
    console.log(`${errors.length} errors, ${warnings.length} warnings`)
    if (errors.length) process.exitCode = 1
}
