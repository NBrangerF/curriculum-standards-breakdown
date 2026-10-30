// Checks data/concepts/terms.json: every quote must appear word for word on the cited pages of the
// revised 课标 scan text, every example code must exist in data/v2, and every related id must exist.
// The scan text is local only (generated/ is gitignored), so the quote check is skipped when it is missing.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OCR_DIR = path.join(ROOT, 'generated/sources/ocr/2025r')
export const SUBJECTS = ['plan', 'chinese', 'math', 'english', 'morality_law', 'history', 'geography', 'science', 'physics', 'chemistry', 'biology', 'it', 'pe', 'arts', 'labor']

// Scans read the em dashes in 「教—学—评」 as 一, and print the page number at the end of each page.
export const normalise = text => text
    .replace(/\s+/gu, '')
    .replace(/[一－‒–]/gu, ch => (ch === '一' ? '一' : '—'))
    .replace(/教[一—]学[一—]评/gu, '教—学—评')
    .replace(/[“”"]/gu, '"')

export function pagesOf(slug) {
    const file = path.join(OCR_DIR, `${slug}.ocr.txt`)
    if (!existsSync(file)) return null
    const parts = readFileSync(file, 'utf8').split(/\[\[PAGE (\d+)\]\]/u)
    const pages = new Map()
    for (let index = 1; index < parts.length; index += 2) pages.set(Number(parts[index]), parts[index + 1].replace(/\n/gu, '').replace(/\d+\s*$/u, ''))
    return pages
}

export function checkTerms(terms = JSON.parse(readFileSync(path.join(ROOT, 'data/concepts/terms.json'), 'utf8'))) {
    const errors = []
    const warnings = []
    const codes = new Set()
    for (const slug of SUBJECTS.filter(item => item !== 'plan')) {
        const subject = JSON.parse(readFileSync(path.join(ROOT, `data/v2/by_subject/${slug}.json`), 'utf8'))
        for (const standard of subject.standards) {
            codes.add(standard.code)
            for (const indicator of standard.indicators || []) codes.add(indicator.code)
        }
    }
    const ids = new Set(terms.terms.map(term => term.id))
    const categories = new Set(terms.categories.map(category => category.id))
    const scans = new Map()
    for (const term of terms.terms) {
        const where = `${term.id}`
        if (!categories.has(term.category)) errors.push(`${where}: unknown category ${term.category}`)
        if (!term.plain) errors.push(`${where}: missing plain`)
        if (!term.quotes.length && !term.not_in_standards) errors.push(`${where}: no quotes; mark not_in_standards if the 课标 never uses it`)
        for (const quote of term.quotes) {
            if (!SUBJECTS.includes(quote.subject)) { errors.push(`${where}: unknown subject ${quote.subject}`); continue }
            if (!scans.has(quote.subject)) scans.set(quote.subject, pagesOf(quote.subject))
            const pages = scans.get(quote.subject)
            if (!pages) { warnings.push(`${where}: no scan text for ${quote.subject}, quote not checked`); continue }
            const text = quote.pages.map(page => pages.get(page) || '').join('')
            if (!normalise(text).includes(normalise(quote.text))) errors.push(`${where}: quote not found on ${quote.subject} p${quote.pages.join('–')}: ${quote.text.slice(0, 40)}…`)
        }
        for (const example of term.examples) if (!codes.has(example.code)) errors.push(`${where}: unknown example code ${example.code}`)
        for (const related of term.related) if (!ids.has(related)) errors.push(`${where}: unknown related term ${related}`)
        for (const item of term.by_subject) if (!SUBJECTS.includes(item.subject)) errors.push(`${where}: unknown subject ${item.subject}`)
    }
    const subjects = JSON.parse(readFileSync(path.join(ROOT, 'data/concepts/subjects.json'), 'utf8'))
    for (const subject of subjects.subjects) {
        const where = `subjects/${subject.slug}`
        if (!SUBJECTS.includes(subject.slug)) errors.push(`${where}: unknown subject`)
        for (const id of subject.terms) if (!ids.has(id)) errors.push(`${where}: unknown term ${id}`)
        if (!scans.has(subject.slug)) scans.set(subject.slug, pagesOf(subject.slug))
        const pages = scans.get(subject.slug)
        if (!pages) { warnings.push(`${where}: no scan text, quote not checked`); continue }
        const text = subject.quote.pages.map(page => pages.get(page) || '').join('')
        if (!normalise(text).includes(normalise(subject.quote.text))) errors.push(`${where}: quote not found on p${subject.quote.pages.join('–')}`)
        // 课程理念: numbered headings, a long one wrapping onto the next line
        const ideasText = normalise((subject.ideas?.pages || []).map(page => pages.get(page) || '').join(''))
        for (const item of subject.ideas?.items || []) if (!ideasText.includes(normalise(item))) errors.push(`${where}: 课程理念 「${item}」 not on p${subject.ideas.pages.join('–')}`)
        if (!subject.ideas?.items?.length) errors.push(`${where}: no 课程理念`)
        const scan = normalise([...pages.values()].join(''))
        for (const name of subject.core_literacy) if (!subject.slug.startsWith('math') && !scan.includes(normalise(name))) errors.push(`${where}: core literacy ${name} not in the scan`)
    }
    const missing = SUBJECTS.filter(slug => slug !== 'plan' && !subjects.subjects.some(item => item.slug === slug))
    if (missing.length) errors.push(`subjects.json is missing ${missing.join(', ')}`)
    return { errors, warnings }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { errors, warnings } = checkTerms()
    for (const warning of warnings) console.warn(`warning: ${warning}`)
    for (const error of errors) console.error(`error: ${error}`)
    console.log(`${errors.length} errors, ${warnings.length} warnings`)
    process.exit(errors.length ? 1 : 0)
}
