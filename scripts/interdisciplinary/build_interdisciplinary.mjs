// Builds public/data/interdisciplinary.json for the 跨学科主题 page: the themes the 历史、地理、体育与健康 课标 give
// (data/interdisciplinary/themes.json, checked by check_themes.mjs) and the 跨学科 standards of the other subjects
// (from data/v2). Each theme knows which subjects it draws on, so a teacher can find themes that involve theirs.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = file => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'))
// 音乐 and 美术 are taught under 艺术
const SLUG_OF = { 语文: 'chinese', 数学: 'math', 英语: 'english', 道德与法治: 'morality_law', 科学: 'science', 物理: 'physics', 化学: 'chemistry', 生物学: 'biology', 历史: 'history', 地理: 'geography', 信息科技: 'it', 体育与健康: 'pe', 艺术: 'arts', 音乐: 'arts', 美术: 'arts', 劳动: 'labor' }

export function buildInterdisciplinary() {
    const data = read('data/interdisciplinary/themes.json')
    const manifest = read('public/data/v2/manifest.json')
    const starmap = read('public/data/starmap.json')
    const colors = Object.fromEntries(starmap.subjects.map(item => [item.slug, item.color]))
    const names = Object.fromEntries(manifest.subjects.map(item => [item.subject_slug, item.subject]))
    const groups = data.groups.map(group => ({
        subject_slug: group.subject,
        subject: names[group.subject],
        color: colors[group.subject] || null,
        title: group.title,
        where: group.where,
        intro: group.intro,
        themes: group.themes.map((theme, index) => ({
            id: `${group.subject}-${index + 1}`,
            ...theme,
            with_slugs: [...new Set(theme.with.map(name => SLUG_OF[name]).filter(Boolean))]
        }))
    }))
    const standards = data.standards.map(code => {
        const entry = manifest.subjects.find(item => code.startsWith(`${item.prefix}-`))
        const standard = read(`data/v2/by_subject/${entry.subject_slug}.json`).standards.find(item => item.code === code)
        const stage = entry.stages.find(item => item.stage === standard.stage)
        return {
            code,
            subject_slug: entry.subject_slug,
            subject: entry.subject,
            color: colors[entry.subject_slug] || null,
            stage_label: stage?.label || standard.stage,
            grades: standard.grades || stage?.grades || [],
            title: standard.level2 || standard.title,
            statement: standard.statement,
            indicators: (standard.indicators || []).map(item => ({ code: item.code, text: item.text, pages: item.source?.pages || item.pages || [] }))
        }
    })
    return {
        schema_version: 1,
        note: data.note,
        basis: data.basis,
        theme_count: groups.reduce((sum, group) => sum + group.themes.length, 0),
        groups,
        standards
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const out = buildInterdisciplinary()
    writeFileSync(path.join(ROOT, 'public/data/interdisciplinary.json'), `${JSON.stringify(out)}\n`)
    console.log(`interdisciplinary.json: ${out.theme_count} themes, ${out.standards.length} standards`)
}
