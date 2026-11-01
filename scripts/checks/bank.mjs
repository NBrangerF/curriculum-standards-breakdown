#!/usr/bin/env node
// 课堂诊断题库: check every question file in data/checks/<subject>/ and build public/data/checks/.
//   node scripts/checks/bank.mjs            check, then write public/data/checks/{<subject>.json,index.json}
//   node scripts/checks/bank.mjs --check    check only (exit 1 on any error)
// A question is a whole-class check for a projector: one stem, a way for 40–60 students to answer at once
// (fingers 1–4, thumbs up/down, or a number held up on scrap paper), the misconception behind each wrong answer,
// the correct working, and a three-step 阶梯练习 for the next day. See docs/research/2026-11-classroom-checks.md.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { verifyLine } from './rational.mjs'
import { bracesBalanced, plainMath } from '../../src/features/checks/mathText.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SUBJECTS = { math: { name: '数学', v2: 'data/v2/by_subject/math.json' } }
const TYPES = ['choice', 'judge', 'step', 'write']
const TERMS = { 上: 'a', 下: 'b' }
// Projector limits (characters of the plain text). Longer lines stop fitting at the size a back row can read.
const LIMIT = { stem: 70, option: 26, work: 34, right: 44, ladderQ: 56, ladderA: 40 }

const readJson = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'))

function bookTrees(subjectName) {
    // 人教版 books in the library: grade+term → { units: [top-level titles], lessons: [titles by unit] }
    const index = readJson('public/data/textbooks/index.json').items
    const trees = new Map()
    for (const book of index) {
        if (book.subject !== subjectName || book.edition_name !== '人教版') continue
        const term = String(book.volume || '').slice(0, 1)
        const file = path.join(ROOT, `public/data/textbooks/national-lessons/${book.edition_id}.json`)
        if (!fs.existsSync(file)) continue
        const lessons = JSON.parse(fs.readFileSync(file, 'utf8'))
        const titles = []
        const walk = nodes => nodes.forEach(node => { titles.push(node.title); walk(node.children || []) })
        walk(lessons.tree)
        trees.set(`${book.grade}${term}`, {
            edition: book.edition_id,
            units: lessons.tree.map(node => node.title),
            titles: [...titles, ...lessons.lessons.map(lesson => lesson.title)]
        })
    }
    return trees
}

const squash = text => String(text).replace(/[\s、，,（）()·—\-－]/gu, '')

export function checkSubject(slug) {
    const subject = SUBJECTS[slug]
    const errors = []
    const warnings = []
    const v2 = readJson(subject.v2)
    const pointCodes = new Set(v2.standards.flatMap(standard => standard.indicators.map(point => point.code)))
    const trees = bookTrees(subject.name)
    const dir = path.join(ROOT, 'data/checks', slug)
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort() : []
    const misconceptions = new Map()
    const items = []
    const seenItems = new Set()

    for (const file of files) {
        const where = `data/checks/${slug}/${file}`
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
        const { grade, term } = data.book || {}
        const bookKey = `${grade}${term}`
        if (!Number.isInteger(grade) || !TERMS[term]) errors.push(`${where}: book needs grade 1–9 and term 上/下`)
        if (file !== `${grade}${TERMS[term]}.json`) errors.push(`${where}: file name should be ${grade}${TERMS[term]}.json`)
        const tree = trees.get(bookKey)
        if (!tree) warnings.push(`${where}: no 人教版 ${bookKey} lesson tree to check units against`)

        for (const entry of data.misconceptions || []) {
            const at = `${where} misconception ${entry.id}`
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.id || '')) errors.push(`${at}: id must be kebab-case`)
            if (misconceptions.has(entry.id)) errors.push(`${at}: duplicate id (first in ${misconceptions.get(entry.id).file})`)
            for (const field of ['name', 'why', 'move']) if (!entry[field]) errors.push(`${at}: missing ${field}`)
            if (String(entry.name).length > 18) warnings.push(`${at}: name is long (${entry.name.length}); teachers tick it while marking`)
            for (const field of ['why', 'move']) if (!bracesBalanced(entry[field])) errors.push(`${at}: unbalanced braces in ${field}`)
            misconceptions.set(entry.id, { ...entry, file: where })
        }

        for (const item of data.items || []) {
            const at = `${where} ${item.id || '(no id)'}`
            const err = message => errors.push(`${at}: ${message}`)
            const warn = message => warnings.push(`${at}: ${message}`)
            const expectedPrefix = `ma-${grade}${TERMS[term]}-`
            if (!String(item.id).startsWith(expectedPrefix)) err(`id must start with ${expectedPrefix}`)
            if (seenItems.has(item.id)) err('duplicate id')
            seenItems.add(item.id)
            if (!TYPES.includes(item.type)) err(`type must be one of ${TYPES.join('/')}`)
            for (const field of ['unit', 'topic', 'stem']) if (!item[field]) err(`missing ${field}`)
            if (!Array.isArray(item.lessons) || !item.lessons.length) err('lessons must list lesson-title keywords')
            if (!Array.isArray(item.points) || !item.points.length) err('points must list 要点 codes')
            for (const code of item.points || []) if (!pointCodes.has(code)) err(`unknown 要点 ${code}`)

            // where it sits in the 人教版 book
            if (tree) {
                if (!tree.units.some(unit => squash(unit).includes(squash(item.unit)))) err(`unit "${item.unit}" is not a unit of 人教版 ${bookKey}: ${tree.units.join(' / ')}`)
                const hits = (item.lessons || []).filter(keyword => tree.titles.some(title => squash(title).includes(squash(keyword))))
                if (!hits.length) warn(`no lesson title in 人教版 ${bookKey} contains any of ${item.lessons.join(' / ')}`)
            }

            // text that has to fit the projector
            const lines = [['stem', item.stem], ...(item.options || []).map(text => ['option', text]), ...(item.work || []).map(text => ['work', text]), ...(item.right || []).map(text => ['right', text]), ...(item.typical || []).map(text => ['work', text])]
            for (const [kind, text] of lines) {
                if (typeof text !== 'string' || !text.trim()) { err(`empty ${kind}`); continue }
                if (!bracesBalanced(text)) err(`unbalanced braces in ${kind}: ${text}`)
                if (plainMath(text).length > LIMIT[kind]) warn(`${kind} is ${plainMath(text).length} chars (limit ${LIMIT[kind]}): ${plainMath(text)}`)
            }

            // the answer and what each wrong answer means
            const wrong = item.wrong || {}
            const misIds = Object.values(wrong).flat()
            for (const id of misIds) if (!misconceptions.has(id)) err(`unknown misconception ${id} (define it before the items that use it)`)
            if (item.type === 'choice') {
                const n = (item.options || []).length
                if (n < 3 || n > 4) err('choice needs 3 or 4 options (fingers 1–4)')
                if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= n) err('answer must be an option index')
                for (let index = 0; index < n; index += 1) {
                    if (index === item.answer) { if (wrong[index]) err('the right option has a misconception'); continue }
                    if (!wrong[index] || (Array.isArray(wrong[index]) && !wrong[index].length)) err(`option ${index + 1} has no misconception`)
                }
                for (const key of Object.keys(wrong)) if (!/^\d$/u.test(key) || Number(key) >= n) err(`wrong key ${key} is not an option index`)
            } else if (item.type === 'judge') {
                if (typeof item.answer !== 'boolean') err('judge answer is true (同意) or false (不同意)')
                if (!Array.isArray(item.work) || !item.work.length) err('judge needs the work being judged')
                const key = item.answer ? 'disagree' : 'agree'
                if (!wrong[key]) err(`judge needs wrong.${key}`)
                for (const k of Object.keys(wrong)) if (k !== key) err(`judge wrong key must be ${key}`)
            } else if (item.type === 'step') {
                const n = (item.work || []).length
                if (n < 3 || n > 4) err('step needs 3 or 4 numbered steps in work')
                if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= n) err('answer must be the index of the first wrong step')
                if (!item.error || !misconceptions.has(item.error)) err('step needs error: the misconception in the wrong step')
                if (Object.keys(wrong).length) err('step uses error, not wrong')
            } else if (item.type === 'write') {
                if (typeof item.answer !== 'string' || !item.answer) err('write answer is the expected text')
                if (!Object.keys(wrong).length) err('write needs at least one common wrong answer')
                if (Object.keys(wrong).includes(item.answer)) err('a wrong answer equals the answer')
            }
            if (!Array.isArray(item.right) || !item.right.length) err('right must hold the correct working')
            if (item.type === 'choice' || item.type === 'write') {
                if (!Array.isArray(item.typical) || !item.typical.length) warn('no typical wrong working: the 比一比 slide will be skipped')
                else if (!misIds.includes(item.typical_error)) err('typical_error must name the misconception the typical working shows (one of the wrong answers)')
            } else if (item.typical || item.typical_error) err(`${item.type} uses work as the working to compare; drop typical`)
            if (!Array.isArray(item.ladder) || item.ladder.length !== 3) err('ladder needs exactly 3 steps')
            for (const [index, step] of (item.ladder || []).entries()) {
                if (!step?.q || !step?.a) { err(`ladder ${index + 1} needs q and a`); continue }
                if (!bracesBalanced(step.q) || !bracesBalanced(step.a)) err(`ladder ${index + 1} has unbalanced braces`)
                if (plainMath(step.q).length > LIMIT.ladderQ) warn(`ladder ${index + 1} question is ${plainMath(step.q).length} chars`)
                if (plainMath(step.a).length > LIMIT.ladderA) warn(`ladder ${index + 1} answer is ${plainMath(step.a).length} chars`)
            }
            for (const line of item.verify || []) {
                const result = verifyLine(line)
                if (!result.ok) err(`verify "${line}": ${result.error}`)
            }
            if (!(item.verify || []).length && /\d/u.test(`${item.stem}${(item.options || []).join('')}`)) warn('numbers but no verify line')

            items.push({ ...item, grade, term, book: tree?.edition || null })
        }
    }
    const used = new Set(items.flatMap(item => [...Object.values(item.wrong || {}).flat(), item.error].filter(Boolean)))
    for (const id of misconceptions.keys()) if (!used.has(id)) warnings.push(`misconception ${id} is not used by any question`)
    return { subject, slug, items, misconceptions, errors, warnings, files }
}

function publicSubject({ subject, slug, items, misconceptions }) {
    const order = item => item.grade * 10 + (item.term === '下' ? 1 : 0)
    const sorted = [...items].sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id, 'en', { numeric: true }))
    return {
        schema: 1,
        subject: subject.name,
        subject_slug: slug,
        note: 'kebiao 编写的课堂诊断题。每个错误选项对应一种常见错法；数值答案经程序验算。题目对应课标要点与人教版教材单元。',
        misconceptions: Object.fromEntries([...misconceptions].map(([id, { name, why, move }]) => [id, { name, why, move }])),
        items: sorted.map(({ verify, ...item }) => ({ ...item, verified: (verify || []).length }))
    }
}

function main() {
    const checkOnly = process.argv.includes('--check')
    const results = Object.keys(SUBJECTS).map(checkSubject)
    let failed = false
    for (const result of results) {
        for (const warning of result.warnings) console.warn(`warn  ${warning}`)
        for (const error of result.errors) console.error(`error ${error}`)
        console.log(`${result.subject.name}: ${result.items.length} questions, ${result.misconceptions.size} misconceptions in ${result.files.length} files; ${result.errors.length} errors, ${result.warnings.length} warnings`)
        if (result.errors.length) failed = true
    }
    if (failed) process.exit(1)
    if (checkOnly) return
    const out = path.join(ROOT, 'public/data/checks')
    fs.mkdirSync(out, { recursive: true })
    const index = { schema: 1, subjects: [], by_point: {} }
    for (const result of results) {
        const data = publicSubject(result)
        fs.writeFileSync(path.join(out, `${result.slug}.json`), `${JSON.stringify(data)}\n`)
        index.subjects.push({ slug: result.slug, name: result.subject.name, questions: data.items.length, misconceptions: Object.keys(data.misconceptions).length, grades: [...new Set(data.items.map(item => item.grade))] })
        for (const item of data.items) for (const code of item.points) (index.by_point[code] ||= []).push(item.id)
    }
    fs.writeFileSync(path.join(out, 'index.json'), `${JSON.stringify(index)}\n`)
    console.log(`wrote public/data/checks (${index.subjects.map(entry => `${entry.name} ${entry.questions}`).join(', ')})`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
