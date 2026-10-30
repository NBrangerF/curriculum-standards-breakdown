// Builds public/data/experiments.json for the 必做实验 page: 科学 附录 4 (data/experiments, checked by
// check_experiments.mjs), the 物理 and 化学 必做实验 standards from data/v2, and for each item the 国家平台 同步课
// whose title says the same thing (word pairs, after dropping words every experiment shares).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = file => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'))
// 「探究……与哪些因素有关」「……的性质」 are in every title; matching on them pairs 浮力 with 摩擦力
const GENERIC = /(哪些因素有关|因素|有关|大小|特点|规律|性质|化学|物理|变化|影响|观察|探究|实验|研究|利用|制作|简单|简易|现象|生活中|生产生活中|常见|使用|设计|学生|活动|测量|的|和|与|及|并|如|等|在|中|用)/gu
const pairsOf = text => {
    const plain = text.replace(/（[^）]*）|，如.*$/u, '').replace(GENERIC, '').replace(/[^\p{Script=Han}A-Za-z0-9]/gu, '')
    const pairs = new Set()
    for (let index = 0; index + 1 < plain.length; index += 1) pairs.add(plain.slice(index, index + 2))
    return pairs
}

export function buildExperiments() {
    const data = read('data/experiments/experiments.json')
    const books = new Map(read('public/data/textbooks/index.json').items.map(item => [item.edition_id, item]))
    const lessonDir = path.join(ROOT, 'public/data/textbooks/national-lessons')
    const lessons = []
    if (existsSync(lessonDir)) {
        for (const file of readdirSync(lessonDir).filter(name => name.startsWith('ed_'))) {
            const record = JSON.parse(readFileSync(path.join(lessonDir, file), 'utf8'))
            const book = books.get(record.edition_id)
            if (!book) continue
            for (const lesson of record.lessons) lessons.push({ edition_id: record.edition_id, id: lesson.id, title: lesson.title, subject: book.subject_slug, grade: book.grade, textbook: record.textbook_title, pairs: pairsOf(lesson.title) })
        }
    }
    const match = (text, subjects, grades) => {
        const want = pairsOf(text)
        if (want.size < 2) return []
        const found = []
        for (const lesson of lessons) {
            if (!subjects.includes(lesson.subject) || (grades && !grades.includes(lesson.grade))) continue
            const shared = [...want].filter(pair => lesson.pairs.has(pair)).length
            if (shared >= 2 && shared / want.size >= 0.6) found.push({ lesson, ratio: shared / want.size })
        }
        found.sort((a, b) => b.ratio - a.ratio)
        const titles = new Set()
        return found.filter(item => item.ratio === found[0].ratio).filter(item => !titles.has(item.lesson.title) && titles.add(item.lesson.title)).slice(0, 3)
            .map(({ lesson }) => [lesson.edition_id, lesson.id, lesson.title, lesson.textbook])
    }
    const science = {
        ...data.science,
        stages: data.science.stages.map(stage => ({
            ...stage,
            items: stage.items.map(item => ({
                no: item.no,
                text: item.text,
                page: item.page,
                // 7–9 年级 科学 is taught as 物理、化学、生物学 in most places
                lessons: match(item.text, stage.stage === '7-9' ? ['physics', 'chemistry', 'biology', 'science'] : ['science'], stage.stage === '7-9' ? null : stage.grades)
            }))
        }))
    }
    const groups = data.standards.map(group => {
        const standards = read(`data/v2/by_subject/${group.subject}.json`).standards
        return {
            subject_slug: group.subject,
            title: group.title,
            standards: group.codes.map(code => {
                const standard = standards.find(item => item.code === code)
                return {
                    code,
                    title: standard.level2 || standard.title,
                    grades: standard.grades || [],
                    items: (standard.indicators || []).filter(item => !(group.skip || []).includes(item.code)).map(item => ({
                        code: item.code,
                        text: item.text.replace(/[。.]$/u, ''),
                        pages: item.pages || [],
                        lessons: match(item.text, [group.subject], null)
                    }))
                }
            })
        }
    })
    return { schema_version: 1, note: data.note, science, groups }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const out = buildExperiments()
    writeFileSync(path.join(ROOT, 'public/data/experiments.json'), `${JSON.stringify(out)}\n`)
    const items = out.science.stages.reduce((sum, stage) => sum + stage.items.length, 0) + out.groups.reduce((sum, group) => sum + group.standards.reduce((n, standard) => n + standard.items.length, 0), 0)
    const linked = [...out.science.stages.flatMap(stage => stage.items), ...out.groups.flatMap(group => group.standards.flatMap(standard => standard.items))].filter(item => item.lessons.length).length
    console.log(`experiments.json: ${items} items, ${linked} with 同步课`)
}
