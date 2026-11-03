#!/usr/bin/env node
// 课堂学习目标, batch: every lesson with a 主要在教 要点 in public/data/v2/lesson_alignment.json is sent, one unit at a
// time, to the production route /api/v1/lesson-plans/objectives. Results go to data/v2/lesson_objectives/<edition>.json
// as they arrive, so a stopped run resumes where it left off.
// Usage: node scripts/v2/write_lesson_objectives.mjs [--only ed_a,ed_b] [--limit N] [--pause 6500] [--base URL]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const args = process.argv.slice(2)
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const BASE = option('--base', 'https://www.kebiao.org')
const PAUSE = Number(option('--pause', 6500))
const LIMIT = Number(option('--limit', 0))
const ONLY = new Set(String(option('--only', '')).split(',').filter(Boolean))
const OUT = join(ROOT, 'data/v2/lesson_objectives')
mkdirSync(OUT, { recursive: true })

const alignment = JSON.parse(readFileSync(join(ROOT, 'public/data/v2/lesson_alignment.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/data/v2/manifest.json'), 'utf8'))
const slugOf = Object.fromEntries(manifest.subjects.map(item => [item.prefix, item.subject_slug]))
const gradeOf = title => Number((String(title).match(/([1-9])年级/u) || [])[1]) || null

// units in book order, each with its lessons in order
const units = new Map()
for (const [edition, textbook, unit, title, id, , matches] of alignment.lessons) {
    if (ONLY.size && !ONLY.has(edition)) continue
    const key = `${edition}\u0000${unit}`
    if (!units.has(key)) units.set(key, { edition, textbook, unit, lessons: [] })
    units.get(key).lessons.push({ id, title, matches })
}

const load = edition => {
    const file = join(OUT, `${edition}.json`)
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { edition_id: edition, lessons: {} }
}
const save = (edition, record) => writeFileSync(join(OUT, `${edition}.json`), `${JSON.stringify(record, null, 1)}\n`)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

let calls = 0
let written = 0
let failed = 0
for (const { edition, textbook, unit, lessons } of units.values()) {
    const record = load(edition)
    const todo = lessons
        .filter(lesson => !record.lessons[lesson.id] && lesson.matches.some(match => match[1] === 'T'))
        .map(lesson => ({
            id: lesson.id,
            title: lesson.title.slice(0, 80),
            points: [...lesson.matches.filter(match => match[1] === 'T'), ...lesson.matches.filter(match => match[1] === 'P').slice(0, 2)]
                .slice(0, 6).map(([code, relation, quote]) => ({ code, relation, quote: String(quote || '').slice(0, 200) }))
        }))
    if (!todo.length) continue
    const subject = slugOf[todo[0].points[0].code.slice(0, 2)]
    for (let index = 0; index < todo.length; index += 8) {
        if (LIMIT && calls >= LIMIT) break
        const batch = todo.slice(index, index + 8)
        const body = {
            lesson: { subject_slug: subject, grade: gradeOf(textbook), textbook_title: textbook.slice(0, 40), unit_title: unit.slice(0, 60) },
            unit_lessons: lessons.map(lesson => lesson.title.slice(0, 80)).slice(0, 60),
            lessons: batch
        }
        let data = null
        for (let attempt = 0; attempt < 3 && !data; attempt += 1) {
            calls += 1
            try {
                const response = await fetch(`${BASE}/api/v1/lesson-plans/objectives`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'kebiao-objectives-batch/1.0' }, body: JSON.stringify(body) })
                if (response.status === 429) { await sleep(30000); continue }
                if (response.ok) data = (await response.json()).data
                else if (response.status === 422) break
            } catch {}
            await sleep(PAUSE)
        }
        if (!data) { failed += batch.length; console.log(`fail ${edition} ${unit} (${batch.length})`); continue }
        for (const lesson of data.lessons) {
            record.lessons[lesson.id] = { take: lesson.take, later: lesson.later, objectives: lesson.objectives.map(item => [item.text, item.basis, item.from, item.show]) }
            written += 1
        }
        failed += batch.length - data.lessons.length
        save(edition, record)
        console.log(`ok ${edition} ${unit}: ${data.lessons.length}/${batch.length} (${data.latency_ms | 0} ms) total ${written}`)
    }
    if (LIMIT && calls >= LIMIT) break
}
console.log(`done: ${written} lessons written, ${failed} not, ${calls} calls`)
