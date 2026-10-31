// Scores 教材与课标对应 against the hand-labelled set (data/textbooks/smartedu/alignment_eval.json): for how many
// lessons the AI found a core 要点 (主要在教 or 也涉及), and how many of its 主要在教 are core or acceptable.
//   node scripts/resources/eval_lesson_alignment.mjs [alignment file]
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const gold = JSON.parse(readFileSync(path.join(ROOT, 'data/textbooks/smartedu/alignment_eval.json'), 'utf8')).lessons
const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'data/textbooks/smartedu/lesson_alignment.json')
const rows = Object.values(JSON.parse(readFileSync(file, 'utf8')).editions).reduce((all, entry) => Object.assign(all, entry.lessons), {})

let found = 0
let withCore = 0
let right = 0
let taught = 0
for (const item of gold) {
    const row = rows[item.lesson_id]
    if (!row) { console.log(`  ? ${item.label}: not judged`); continue }
    const T = row.m.filter(match => match[1] === 'T').map(match => match[0])
    const P = row.m.filter(match => match[1] === 'P').map(match => match[0])
    const good = new Set([...item.core, ...item.acceptable])
    if (item.core.length) {
        withCore += 1
        if ([...T, ...P].some(code => item.core.includes(code))) found += 1
    }
    taught += T.length
    right += T.filter(code => good.has(code)).length
    const wrong = T.filter(code => !good.has(code))
    console.log(`  ${item.label}: 主要在教 ${T.join(' ') || '—'}${P.length ? `；也涉及 ${P.join(' ')}` : ''}${wrong.length ? `  ✗ ${wrong.join(' ')}` : ''}`)
}
console.log(`core 要点 found for ${found}/${withCore} lessons; 主要在教 right ${right}/${taught}${taught ? ` (${Math.round((right / taught) * 100)}%)` : ''}`)
