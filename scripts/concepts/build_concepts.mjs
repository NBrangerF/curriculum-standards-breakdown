// Builds public/data/concepts.json for the 概念词典 pages: the terms, each subject's skeleton (its organising
// categories and standards, read from data/v2), and the real standards whose 课标 text uses each term.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = file => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'))
const MENTION_LIMIT = 8

// Words too common to show where they appear (情境 and 核心素养 appear in most standards).
const NO_MENTIONS = new Set(['core-literacy', 'real-context', 'content-academic-guidance', 'kebiao-structure', 'learning-objective', 'backward-design', 'structured-content'])

const textOf = standard => [
    standard.statement,
    ...(standard.indicators || []).map(item => item.text),
    ...(standard.requirements || []).map(item => item.text || item),
    ...(standard.guidance || []).map(item => item.text || item)
].filter(Boolean).join('\n')

export function buildConcepts() {
    const terms = read('data/concepts/terms.json')
    const subjectNotes = read('data/concepts/subjects.json')
    const manifest = read('public/data/v2/manifest.json')
    const starmap = read('public/data/starmap.json')
    const colors = Object.fromEntries(starmap.subjects.map(item => [item.slug, item.color]))
    const names = { plan: '课程方案' }
    const standards = new Map()
    const subjects = []
    for (const entry of manifest.subjects) {
        names[entry.subject_slug] = entry.subject
        const data = read(`data/v2/by_subject/${entry.subject_slug}.json`)
        const groups = []
        for (const standard of data.standards) {
            standards.set(standard.code, { standard, slug: entry.subject_slug })
            let group = groups.find(item => item.name === standard.level1)
            if (!group) groups.push(group = { name: standard.level1, children: [] })
            const childName = standard.level2 && standard.level2 !== standard.level1 ? standard.level2 : standard.level1
            let child = group.children.find(item => item.name === childName)
            if (!child) group.children.push(child = { name: childName, standards: [] })
            child.standards.push([standard.code, standard.stage, (standard.indicators || []).length])
        }
        const note = subjectNotes.subjects.find(item => item.slug === entry.subject_slug)
        subjects.push({
            slug: entry.subject_slug,
            name: entry.subject,
            color: colors[entry.subject_slug] || null,
            stages: entry.stages.map(stage => ({ stage: stage.stage, label: stage.label })),
            standard_count: data.standards.length,
            indicator_count: data.standards.reduce((sum, item) => sum + (item.indicators || []).length, 0),
            ...note,
            groups
        })
    }
    const out = terms.terms.map(term => {
        const examples = term.examples.map(example => {
            const hit = standards.get(example.code)
            return { ...example, title: hit?.standard.title || '', subject: hit?.slug || '' }
        })
        const mentions = []
        if (!NO_MENTIONS.has(term.id)) {
            const words = [term.term, ...term.aliases].filter(word => word.length >= 3 && !/[、—]/u.test(word))
            for (const [code, { standard, slug }] of standards) {
                if (mentions.length >= MENTION_LIMIT) break
                if (examples.some(item => item.code === code)) continue
                const text = textOf(standard)
                // 「学科实践」 inside 「跨学科实践」 is a different term
                const at = words.map(word => [word, text.search(new RegExp(`(?<!跨)${word}`, 'u'))]).find(([, index]) => index >= 0)
                if (!at) continue
                const [word, index] = at
                mentions.push({ code, subject: slug, title: standard.title, word, excerpt: text.slice(Math.max(0, index - 30), index + word.length + 40).replace(/\n/gu, ' ') })
            }
        }
        return { ...term, examples, mentions }
    })
    return {
        schema_version: 1,
        source_version: terms.source_version,
        note: terms.note,
        subject_names: names,
        categories: terms.categories,
        terms: out,
        subjects
    }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const data = buildConcepts()
    writeFileSync(path.join(ROOT, 'public/data/concepts.json'), `${JSON.stringify(data)}\n`)
    console.log(`concepts.json: ${data.terms.length} terms, ${data.subjects.length} subjects, ${data.terms.reduce((sum, term) => sum + term.mentions.length, 0)} mentions`)
}
