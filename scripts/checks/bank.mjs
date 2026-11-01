#!/usr/bin/env node
// 课堂诊断题库: check every question file in data/checks/<subject>/ and build public/data/checks/.
//   node scripts/checks/bank.mjs                                   check, then write public/data/checks/{<subject>.json,index.json}
//   node scripts/checks/bank.mjs --check                           check only (exit 1 on any error)
//   node scripts/checks/bank.mjs --check --subject physics,english check some subjects, and list units without questions
// A question is a whole-class check for a projector: one stem, a way for 40–60 students to answer at once
// (fingers 1–4, thumbs up/down, or an answer held up on scrap paper), the misconception behind each wrong answer,
// the correct working, and a three-step 阶梯练习 for the next day. How to write one: data/checks/README.md.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { verifyLine } from './rational.mjs'
import { bracesBalanced, plainMath } from '../../src/features/checks/mathText.js'
import { CHECK_SUBJECTS, bookOf } from '../../src/features/checks/subjects.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const TYPES = ['choice', 'judge', 'step', 'write']
const TERM_OF_VOLUME = { 上册: '上', 下册: '下', 全一册: '全' }
const TERM_ORDER = { 上: 0, 下: 1, 全: 2 }
// Projector limits, in widths of a Chinese character (a Latin letter, digit or space counts about half).
// Longer lines stop fitting at the size a back row can read.
const LIMIT = { stem: 70, option: 26, work: 34, right: 44, ladderQ: 56, ladderA: 40 }

const readJson = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'))
const squash = text => String(text).replace(/[\s、，,（）()·—\-－]/gu, '')
export const widthOf = text => [...String(text)].reduce((sum, char) => sum + (/[\u0000-ɏ -⁯]/u.test(char) ? 0.55 : 1), 0)

function libraryBooks(subject) {
    // the subject's volumes of the bank's editions in the library: book key → { edition_id, edition, units, titles }
    const books = new Map()
    for (const book of readJson('public/data/textbooks/index.json').items) {
        if (book.subject_slug !== subject.slug || !(subject.editions || []).includes(book.edition_name)) continue
        const key = `${book.grade}${TERM_OF_VOLUME[book.volume] || ''}`
        const entry = { edition_id: book.edition_id, edition: book.edition_name, units: null, titles: [] }
        const file = path.join(ROOT, `public/data/textbooks/national-lessons/${book.edition_id}.json`)
        if (fs.existsSync(file)) {
            const lessons = JSON.parse(fs.readFileSync(file, 'utf8'))
            const walk = nodes => nodes.forEach(node => { entry.titles.push(node.title); walk(node.children || []) })
            walk(lessons.tree)
            entry.units = lessons.tree.map(node => node.title).filter(title => title !== '其他')
            entry.titles.push(...lessons.lessons.map(lesson => lesson.title))
        }
        books.set(key, entry)
    }
    return books
}

export function checkSubject(subject) {
    const errors = []
    const warnings = []
    const notes = []
    const plain = subject.markup === 'math' ? plainMath : text => String(text)
    const v2 = readJson(`data/v2/by_subject/${subject.v2}.json`)
    const points = new Map()
    for (const standard of v2.standards) {
        for (const point of standard.indicators) points.set(point.code, { grades: standard.grades || [], domain: standard.code.split('-')[2] })
    }
    const library = subject.bands ? new Map() : libraryBooks(subject)
    // a 学段 file's units: the 课标's 学习任务/任务群/模块 of that 学段 (only this subject's domains for 艺术)
    const ownDomain = standard => !subject.pointDomains || subject.pointDomains.includes(standard.code.split('-')[2])
    const bandUnits = Object.fromEntries((subject.bands || []).map(band => [band, [...new Set(v2.standards.filter(standard => standard.stage === band && ownDomain(standard)).map(standard => standard.level2 || standard.level1))]]))
    const dir = path.join(ROOT, 'data/checks', subject.slug)
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort() : []
    const misconceptions = new Map()
    const items = []
    const books = []
    const seenItems = new Set()
    const seenStems = new Map()

    // first pass: every misconception of every book, so a question may use one defined in another grade's file
    const loaded = []
    for (const file of files) {
        const where = `data/checks/${subject.slug}/${file}`
        try {
            loaded.push({ file, where, data: JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) })
        } catch (error) {
            errors.push(`${where}: not valid JSON (${error.message})`)
        }
    }
    for (const { where, data } of loaded) {
        for (const entry of data.misconceptions || []) {
            const at = `${where} misconception ${entry.id}`
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.id || '')) errors.push(`${at}: id must be kebab-case`)
            if (misconceptions.has(entry.id)) errors.push(`${at}: duplicate id (first in ${misconceptions.get(entry.id).file})`)
            for (const field of ['name', 'why', 'move']) if (!entry[field]) errors.push(`${at}: missing ${field}`)
            if (String(entry.name).length > 18) warnings.push(`${at}: name is long (${entry.name.length}); teachers tick it while marking`)
            if (subject.markup === 'math') for (const field of ['why', 'move']) if (!bracesBalanced(entry[field])) errors.push(`${at}: unbalanced braces in ${field}`)
            misconceptions.set(entry.id, { ...entry, file: where })
        }
    }

    for (const { file, where, data } of loaded) {
        const meta = data.book || {}
        if (meta.subject !== subject.name) errors.push(`${where}: book.subject should be ${subject.name}`)
        if (subject.bands ? !subject.bands.includes(meta.band) : !(Number.isInteger(meta.grade) && meta.grade >= 1 && meta.grade <= 9 && TERM_ORDER[meta.term] !== undefined)) {
            errors.push(`${where}: book needs ${subject.bands ? `band (${subject.bands.join(' / ')})` : 'grade 1–9 and term 上/下/全'}`)
            continue
        }
        const book = bookOf(meta)
        if (file !== `${book.stem}.json`) errors.push(`${where}: file name should be ${book.stem}.json`)
        const volume = library.get(book.key)
        if (!subject.bands && !volume) warnings.push(`${where}: the library has no ${subject.editions.join('/')} ${book.key}`)
        else if (volume && !volume.units) warnings.push(`${where}: no lesson tree for ${volume.edition} ${book.key}, so units are not checked`)
        const units = subject.bands ? bandUnits[meta.band] : volume?.units
        const covered = new Set()
        let count = 0

        for (const item of data.items || []) {
            const at = `${where} ${item.id || '(no id)'}`
            const err = message => errors.push(`${at}: ${message}`)
            const warn = message => warnings.push(`${at}: ${message}`)
            const prefix = `${subject.code}-${book.stem}-`
            if (!String(item.id).startsWith(prefix) || !/^\d{2}$/u.test(String(item.id).slice(prefix.length))) err(`id must be ${prefix}NN`)
            if (seenItems.has(item.id)) err('duplicate id')
            seenItems.add(item.id)
            if (!TYPES.includes(item.type)) err(`type must be one of ${TYPES.join('/')}`)
            for (const field of ['unit', 'topic', 'stem']) if (!item[field]) err(`missing ${field}`)
            if (widthOf(item.topic || '') > 16) warn(`topic is long: ${item.topic}`)
            if (!subject.bands && (!Array.isArray(item.lessons) || !item.lessons.length)) err('lessons must list lesson-title keywords')
            if (!Array.isArray(item.points) || !item.points.length) err('points must list 要点 codes')
            for (const code of item.points || []) {
                const point = points.get(code)
                if (!point) { err(`unknown 要点 ${code}`); continue }
                if (subject.pointDomains && !subject.pointDomains.includes(point.domain)) err(`要点 ${code} is not a ${subject.name} 要点 (${subject.pointDomains.join('/')})`)
                // textbooks often teach a topic a year before or after the 学段 boundary
                const near = grade => point.grades.some(pointGrade => Math.abs(pointGrade - grade) <= 1)
                if (point.grades.length && !book.grades.some(near)) warn(`要点 ${code} is for grades ${point.grades[0]}–${point.grades.at(-1)}, not ${book.short}`)
            }

            // where it sits in the book (or the 学段's 任务群/模块)
            if (units) {
                const unit = units.find(title => squash(title).includes(squash(item.unit)))
                if (!unit) err(`unit "${item.unit}" is not one of: ${units.join(' / ')}`)
                else covered.add(unit)
            }
            if (volume?.units && Array.isArray(item.lessons) && item.lessons.length) {
                const hits = item.lessons.filter(keyword => volume.titles.some(title => squash(title).includes(squash(keyword))))
                if (!hits.length) warn(`no lesson title in ${volume.edition} ${book.key} contains any of ${item.lessons.join(' / ')}`)
            }

            // text that has to fit the projector
            const lines = [['stem', item.stem], ...(item.options || []).map(text => ['option', text]), ...(item.work || []).map(text => ['work', text]), ...(item.right || []).map(text => ['right', text]), ...(item.typical || []).map(text => ['work', text])]
            for (const [kind, text] of lines) {
                if (typeof text !== 'string' || !text.trim()) { err(`empty ${kind}`); continue }
                if (subject.markup === 'math' && !bracesBalanced(text)) err(`unbalanced braces in ${kind}: ${text}`)
                const width = widthOf(plain(text))
                if (width > LIMIT[kind]) warn(`${kind} is ${Math.round(width)} wide (limit ${LIMIT[kind]}): ${plain(text)}`)
            }
            const stemKey = squash(plain(item.stem || '')) + squash((item.options || []).join('|')) + squash((item.work || []).join('|'))
            if (seenStems.has(stemKey)) warn(`same question as ${seenStems.get(stemKey)}`)
            seenStems.set(stemKey, item.id)

            // the answer and what each wrong answer means
            const wrong = item.wrong || {}
            const misIds = Object.values(wrong).flat()
            for (const id of misIds) if (!misconceptions.has(id)) err(`unknown misconception ${id}`)
            if (item.type === 'choice') {
                const n = (item.options || []).length
                if (n < 3 || n > 4) err('choice needs 3 or 4 options (fingers 1–4)')
                if (new Set((item.options || []).map(option => squash(plain(option)))).size !== n) err('two options are the same')
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
                if (subject.markup === 'math' && (!bracesBalanced(step.q) || !bracesBalanced(step.a))) err(`ladder ${index + 1} has unbalanced braces`)
                if (widthOf(plain(step.q)) > LIMIT.ladderQ) warn(`ladder ${index + 1} question is long: ${plain(step.q)}`)
                if (widthOf(plain(step.a)) > LIMIT.ladderA) warn(`ladder ${index + 1} answer is long: ${plain(step.a)}`)
            }
            for (const line of item.verify || []) {
                const result = verifyLine(line)
                if (!result.ok) err(`verify "${line}": ${result.error}`)
            }
            if (subject.sums) {
                const sums = `${item.stem}${(item.options || []).join('')}${(item.right || []).join('')}`.replace(/\{[^{}]*\}/gu, '')
                if (!(item.verify || []).length && /\d\s*[+\-−×÷*/]\s*\d/u.test(sums)) warn('arithmetic but no verify line')
            }

            const extra = subject.bands ? { grades: book.grades } : {}
            items.push({ ...item, book: book.key, grade: book.grade, term: book.term, ...extra, edition_id: volume?.edition_id || null })
            count += 1
        }
        if (units) {
            const missing = units.filter(unit => !covered.has(unit))
            if (missing.length) notes.push(`${where}: no question yet for ${missing.join(' / ')}`)
        }
        books.push({ ...book, edition: subject.bands ? '课标' : volume?.edition || subject.editions[0], edition_id: volume?.edition_id || null, count })
    }
    // students learn patterns fast: the right answer should not keep sitting in one place, nor 同意吗 always be 不同意
    for (const n of [3, 4]) {
        const answers = items.filter(item => item.type === 'choice' && item.options.length === n).map(item => item.answer)
        const top = Math.max(0, ...Array.from({ length: n }, (_, k) => answers.filter(a => a === k).length))
        if (answers.length >= 8 && top / answers.length > 1.6 / n) warnings.push(`${n}-option questions: ${top} of ${answers.length} have the right answer in the same place`)
    }
    const judges = items.filter(item => item.type === 'judge')
    if (judges.length >= 8 && judges.filter(item => item.answer).length / judges.length < 0.2) warnings.push('同意吗 questions are almost all 不同意; make some statements correct')
    const used = new Set(items.flatMap(item => [...Object.values(item.wrong || {}).flat(), item.error].filter(Boolean)))
    for (const id of misconceptions.keys()) if (!used.has(id)) warnings.push(`misconception ${id} is not used by any question`)
    books.sort((a, b) => a.grade - b.grade || TERM_ORDER[a.term] - TERM_ORDER[b.term])
    return { subject, items, books, misconceptions, errors, warnings, notes, files }
}

function publicSubject({ subject, items, books, misconceptions }) {
    const order = item => item.grade * 10 + TERM_ORDER[item.term]
    const sorted = [...items].sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id, 'en', { numeric: true }))
    const editions = [...new Set(books.map(book => book.edition))].join('、')
    return {
        schema: 2,
        subject: subject.name,
        subject_slug: subject.slug,
        code: subject.code,
        markup: subject.markup,
        note: `kebiao 编写的课堂诊断题。每个错误选项对应一种常见错法${subject.sums ? '；数值答案经程序验算' : ''}。题目对应课标要点与${subject.bands ? '课标的学段内容' : `${editions}教材单元`}。`,
        books: books.map(({ key, label, short, grade, grades, term, edition, edition_id, count }) => ({ key, label, short, grade, grades, term, edition, edition_id, count })),
        misconceptions: Object.fromEntries([...misconceptions].map(([id, { name, why, move }]) => [id, { name, why, move }])),
        items: sorted.map(({ verify, ...item }) => ({ ...item, verified: (verify || []).length }))
    }
}

function main() {
    const args = process.argv.slice(2)
    const checkOnly = args.includes('--check')
    const flag = args.find(arg => arg.startsWith('--subject'))
    const only = flag ? (flag.includes('=') ? flag.split('=')[1] : args[args.indexOf(flag) + 1] || '').split(',').filter(Boolean) : []
    for (const slug of only) if (!CHECK_SUBJECTS.some(subject => subject.slug === slug)) { console.error(`unknown subject ${slug}`); process.exit(1) }
    const subjects = CHECK_SUBJECTS.filter(subject => !only.length || only.includes(subject.slug))
    const results = subjects.map(checkSubject).filter(result => result.files.length || only.length)
    let failed = false
    for (const result of results) {
        for (const warning of result.warnings) console.warn(`warn  ${warning}`)
        for (const error of result.errors) console.error(`error ${error}`)
        if (only.length) for (const note of result.notes) console.log(`note  ${note}`)
        console.log(`${result.subject.name}: ${result.items.length} questions, ${result.misconceptions.size} misconceptions in ${result.files.length} files; ${result.errors.length} errors, ${result.warnings.length} warnings`)
        if (result.errors.length) failed = true
    }
    if (failed) process.exit(1)
    if (checkOnly) return
    if (only.length) { console.error('build all subjects at once: drop --subject'); process.exit(1) }
    const out = path.join(ROOT, 'public/data/checks')
    fs.mkdirSync(out, { recursive: true })
    const index = { schema: 2, subjects: [], by_point: {} }
    for (const result of results) {
        if (!result.items.length) continue
        const data = publicSubject(result)
        fs.writeFileSync(path.join(out, `${result.subject.slug}.json`), `${JSON.stringify(data)}\n`)
        index.subjects.push({
            slug: result.subject.slug,
            name: result.subject.name,
            code: result.subject.code,
            questions: data.items.length,
            misconceptions: Object.keys(data.misconceptions).length,
            books: data.books.map(({ key, short, label, count }) => ({ key, short, label, count }))
        })
        for (const item of data.items) for (const code of item.points) (index.by_point[code] ||= []).push(item.id)
    }
    fs.writeFileSync(path.join(out, 'index.json'), `${JSON.stringify(index)}\n`)
    console.log(`wrote public/data/checks (${index.subjects.map(entry => `${entry.name} ${entry.questions}`).join(', ')})`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
