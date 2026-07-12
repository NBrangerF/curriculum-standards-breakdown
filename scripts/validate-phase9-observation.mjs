import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { evaluatePhase9Observation } from './lib/phase9-observation.mjs'

const reportPath = process.argv[2]
if (!reportPath) throw new Error('Usage: npm run validate:phase9-observation -- <report.json>')

const report = JSON.parse(await readFile(resolve(reportPath), 'utf8'))
const result = evaluatePhase9Observation(report)
console.log(JSON.stringify(result, null, 2))
if (result.decision !== 'advance') process.exitCode = 1
