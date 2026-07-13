import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { SUBJECT_TAXONOMY } from '../packages/curriculum-core/src/taxonomy.js'

const dataRoot = resolve(process.argv.includes('--data-root')
    ? process.argv[process.argv.indexOf('--data-root') + 1]
    : 'data/internal')
const apply = process.argv.includes('--apply')
const bySubject = join(dataRoot, 'by_subject')

type Standard = Record<string, unknown> & { code: string; subject_slug: string; domain: string; grade_band: string }

function codeParts(record: Standard) {
    const parts = String(record.code).split('-')
    const taxonomy = SUBJECT_TAXONOMY[record.subject_slug as keyof typeof SUBJECT_TAXONOMY]
    const domainToken = taxonomy?.domains[record.domain as never]
    if (!domainToken || !parts[2]) throw new Error(`${record.code}: 无法确定 ${record.subject_slug}/${record.domain} 的领域 token`)
    return {
        prefix: taxonomy.code,
        stageToken: parts[1],
        domainToken,
        preferredSequence: /^\d{3}$/.test(parts.at(-1) || '') ? parts.at(-1)! : null,
        canonical: parts.length === 4 && parts[0] === taxonomy.code && parts[2] === domainToken && /^\d{3}$/.test(parts[3])
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
const candidates = new Map(records.map(record => [record.code, codeParts(record)]))
const recordGroups = new Map<string, Standard[]>()
for (const record of records) {
    const candidate = candidates.get(record.code)!
    const key = `${record.subject_slug}|${candidate.stageToken}|${record.domain}`
    recordGroups.set(key, [...(recordGroups.get(key) || []), record])
}

const codeMap = new Map<string, string>()
for (const group of recordGroups.values()) {
    const used = new Set<number>()
    for (const record of group) {
        const candidate = candidates.get(record.code)!
        if (candidate.canonical) used.add(Number(candidate.preferredSequence))
    }
    let nextAvailable = 1
    for (const record of group) {
        const candidate = candidates.get(record.code)!
        if (candidate.canonical) {
            codeMap.set(record.code, record.code)
            continue
        }
        const preferred = candidate.preferredSequence ? Number(candidate.preferredSequence) : null
        let sequence = preferred && !used.has(preferred) ? preferred : null
        while (sequence === null && used.has(nextAvailable)) nextAvailable += 1
        if (sequence === null) sequence = nextAvailable
        used.add(sequence)
        codeMap.set(record.code, `${candidate.prefix}-${candidate.stageToken}-${candidate.domainToken}-${String(sequence).padStart(3, '0')}`)
    }
}
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
