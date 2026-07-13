import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { SUBJECT_TAXONOMY } from '../packages/curriculum-core/src/taxonomy.js'

const dataRoot = resolve(process.argv.includes('--data-root')
    ? process.argv[process.argv.indexOf('--data-root') + 1]
    : 'data/internal')
const apply = process.argv.includes('--apply')
const bySubject = join(dataRoot, 'by_subject')

type Standard = Record<string, unknown> & { code: string; subject_slug: string; domain: string; grade_band: string }

function candidateParts(record: Standard) {
    const parts = String(record.code).split('-')
    const taxonomy = SUBJECT_TAXONOMY[record.subject_slug as keyof typeof SUBJECT_TAXONOMY]
    const domainToken = taxonomy?.domains[record.domain as never]
    if (!domainToken || !parts[2]) throw new Error(`${record.code}: 无法确定 ${record.subject_slug}/${record.domain} 的领域 token`)
    const isH4 = String(record.grade_band).startsWith('H4')
    if (!isH4) return { base: [parts[0], parts[1], domainToken, ...parts.slice(3)].join('-'), sourceToken: null }

    const legacyH4Code = [record.code, ...(Array.isArray(record.legacy_codes) ? record.legacy_codes : []), record.id, record.legacy_code]
        .map(value => String(value || '').trim())
        .find(value => {
            const legacyParts = value.split('-')
            return legacyParts[1] === parts[1] && legacyParts[2] && legacyParts[2] !== domainToken
        })
    const suffix = (legacyH4Code || record.code).split('-').slice(3)
    const sourceToken = (legacyH4Code || record.code).split('-')[2]
    return {
        base: [parts[0], parts[1], domainToken, ...suffix].join('-'),
        sourceToken: sourceToken === domainToken ? null : sourceToken
    }
}

function aliases(record: Standard, oldCode: string, nextCode: string): string[] {
    const values = [
        ...(Array.isArray(record.legacy_codes) ? record.legacy_codes : []),
        record.legacy_code,
        record.id,
        oldCode
    ]
    return [...new Set(values.map(value => String(value || '').trim()).filter(value => value && value !== nextCode))]
}

function replaceReferences(value: unknown, codeMap: Map<string, string>): unknown {
    if (Array.isArray(value)) return value.map(item => replaceReferences(item, codeMap))
    if (typeof value !== 'string') return value
    return value.replace(/[^\n|]+/g, token => {
        const trimmed = token.trim()
        return trimmed ? token.replace(trimmed, codeMap.get(trimmed) || trimmed) : token
    })
}

const payloads = readdirSync(bySubject).filter(file => file.endsWith('.json')).sort().map(file => ({
    file,
    path: join(bySubject, file),
    payload: JSON.parse(readFileSync(join(bySubject, file), 'utf8')) as { standards?: Standard[] }
}))
const records = payloads.flatMap(item => item.payload.standards || [])
const candidates = new Map(records.map(record => [record.code, candidateParts(record)]))
const baseGroups = new Map<string, string[]>()
for (const [oldCode, candidate] of candidates) baseGroups.set(candidate.base, [...(baseGroups.get(candidate.base) || []), oldCode])
const codeMap = new Map(records.map(record => {
    const candidate = candidates.get(record.code)!
    const requiresSubtype = (baseGroups.get(candidate.base) || []).length > 1
    const code = requiresSubtype && candidate.sourceToken
        ? [candidate.base.split('-').slice(0, 3).join('-'), candidate.sourceToken, ...candidate.base.split('-').slice(3)].join('-')
        : candidate.base
    return [record.code, code]
}))
const collisions = new Map<string, string[]>()
for (const [oldCode, newCode] of codeMap) collisions.set(newCode, [...(collisions.get(newCode) || []), oldCode])
const duplicates = [...collisions.entries()].filter(([, values]) => values.length > 1)
if (duplicates.length) throw new Error(`canonical code 冲突：${JSON.stringify(duplicates.slice(0, 5))}`)

let changed = 0
for (const { path, payload } of payloads) {
    for (const record of payload.standards || []) {
        const oldCode = record.code
        const nextCode = codeMap.get(oldCode)!
        if (oldCode !== nextCode) {
            record.legacy_codes = aliases(record, oldCode, nextCode)
            record.code = nextCode
            changed += 1
        }
        for (const field of ['previous_code', 'next_code']) record[field] = replaceReferences(record[field], codeMap)
    }
    if (apply) writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`)
}

console.log(JSON.stringify({
    apply,
    data_root: dataRoot,
    records: records.length,
    changed,
    unchanged: records.length - changed,
    sample: [...codeMap.entries()].filter(([from, to]) => from !== to).slice(0, 12).map(([legacy_code, code]) => ({ legacy_code, code }))
}, null, 2))
