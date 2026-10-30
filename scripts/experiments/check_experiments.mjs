// Checks data/experiments/experiments.json: every 科学 附录 4 item on its page of the revised scan (the table's
// stage column splits some lines, so the characters must appear in order), the numbering, and the v2 codes.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { normalise, pagesOf } from '../concepts/check_terms.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const inOrder = (needle, hay) => {
    let at = 0
    for (const char of needle) {
        at = hay.indexOf(char, at)
        if (at < 0) return false
        at += 1
    }
    return true
}

export function checkExperiments(data = JSON.parse(readFileSync(path.join(ROOT, 'data/experiments/experiments.json'), 'utf8'))) {
    const errors = []
    const warnings = []
    const scan = pagesOf('science')
    const page = number => normalise(scan?.get(number) || '')
    if (!scan) warnings.push('no scan text for science, items not checked')
    else if (!page(data.science.intro.pages[0]).includes(normalise(data.science.intro.text))) errors.push('science intro not found')
    for (const stage of data.science.stages) {
        stage.items.forEach((item, index) => {
            if (item.no !== index + 1) errors.push(`science ${stage.stage} #${item.no}: numbering`)
            if (!scan) return
            const text = page(item.page)
            const words = normalise(item.scan || item.text)
            if (!text.includes(words) && !inOrder(words, text)) errors.push(`science ${stage.stage} #${item.no}: 「${item.text}」 not on p${item.page}`)
        })
    }
    for (const group of data.standards) {
        const standards = JSON.parse(readFileSync(path.join(ROOT, `data/v2/by_subject/${group.subject}.json`), 'utf8')).standards
        for (const code of group.codes) if (!standards.some(item => item.code === code)) errors.push(`${group.subject}: unknown code ${code}`)
    }
    return { errors, warnings }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { errors, warnings } = checkExperiments()
    for (const warning of warnings) console.warn(`warning: ${warning}`)
    for (const error of errors) console.error(`error: ${error}`)
    console.log(`${errors.length} errors, ${warnings.length} warnings`)
    if (errors.length) process.exitCode = 1
}
