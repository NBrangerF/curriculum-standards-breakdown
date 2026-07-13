import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

type Standard = Record<string, unknown> & {
    code: string
    subject_slug: string
    domain: string
    grade_band: string
    standard?: string
    standard_title?: string
    subdomain?: string
    display_subcategory?: string
    progression_group_id?: string
    previous_code?: string
    next_code?: string
    ts_primary?: string[]
    ts_secondary?: string[]
}

const dataRoot = resolve(process.argv.includes('--data-root')
    ? process.argv[process.argv.indexOf('--data-root') + 1]
    : 'data/internal')
const apply = process.argv.includes('--apply')
const bySubject = join(dataRoot, 'by_subject')
const STOP = /学生|能够|能用|能在|能对|能从|能通过|理解|认识|掌握|学习|进行|形成|初步|相关|运用|知道|了解|说明|基本|要求|年级|学段/g

function bigrams(value: unknown): Set<string> {
    const text = String(value || '').replace(STOP, '').replace(/[^\p{L}\p{N}]/gu, '')
    const tokens = new Set<string>()
    for (let index = 0; index < text.length - 1; index += 1) tokens.add(text.slice(index, index + 2))
    return tokens
}

function overlap(left: Set<string>, right: Set<string>): number {
    if (!left.size || !right.size) return 0
    let matches = 0
    for (const token of left) if (right.has(token)) matches += 1
    return matches / Math.sqrt(left.size * right.size)
}

function skills(record: Standard): Set<string> {
    return new Set([...(record.ts_primary || []), ...(record.ts_secondary || [])].map(value => String(value).split('.')[0]))
}

function matchScore(h3: Standard, g7: Standard): number {
    const h3Text = [h3.subdomain, h3.display_subcategory, h3.standard_title, h3.standard].filter(Boolean).join(' ')
    const h4Text = [g7.source_anchor_subcategory, g7.source_standard_original, g7.standard_title, g7.standard].filter(Boolean).join(' ')
    const textScore = overlap(bigrams(h3Text), bigrams(h4Text))
    const h3Skills = skills(h3)
    const h4Skills = skills(g7)
    const skillMatches = [...h3Skills].filter(value => h4Skills.has(value)).length
    const skillScore = h3Skills.size && h4Skills.size ? skillMatches / Math.max(h3Skills.size, h4Skills.size) : 0
    const sameSubdomain = String(h3.subdomain || '') === String(g7.subdomain || '') ? 1 : 0
    return Number((textScore * 0.82 + skillScore * 0.13 + sameSubdomain * 0.05).toFixed(4))
}

const payloads = readdirSync(bySubject).filter(file => file.endsWith('.json')).sort().map(file => ({
    path: join(bySubject, file),
    payload: JSON.parse(readFileSync(join(bySubject, file), 'utf8')) as { standards?: Standard[] }
}))
const records = payloads.flatMap(item => item.payload.standards || [])
const h3BySubjectDomain = new Map<string, Standard[]>()
for (const record of records.filter(record => record.grade_band === 'H3')) {
    const key = `${record.subject_slug}|${record.domain}`
    h3BySubjectDomain.set(key, [...(h3BySubjectDomain.get(key) || []), record])
}
const groups = new Map<string, Standard[]>()
for (const record of records.filter(record => record.progression_group_id)) {
    groups.set(record.progression_group_id!, [...(groups.get(record.progression_group_id!) || []), record])
}

const bridges: Array<Record<string, unknown> & { h3_code: string; h4g7_code: string; score: number; margin: number; confidence: string }> = []
const g7Records: Standard[] = []
for (const [groupId, group] of groups) {
    const byBand = new Map(group.map(record => [record.grade_band, record]))
    const g7 = byBand.get('H4G7')
    const g8 = byBand.get('H4G8')
    const g9 = byBand.get('H4G9')
    if (!g7 || !g8 || !g9) throw new Error(`${groupId}: 缺少 G7/G8/G9 记录`)
    const candidates = (h3BySubjectDomain.get(`${g7.subject_slug}|${g7.domain}`) || [])
        .map(record => ({ record, score: matchScore(record, g7) }))
        .sort((left, right) => right.score - left.score || left.record.code.localeCompare(right.record.code))
    if (!candidates.length) throw new Error(`${groupId}: 找不到同学科同领域的 H3 候选`)
    const best = candidates[0]
    const margin = Number((best.score - (candidates[1]?.score || 0)).toFixed(4))
    const confidence = best.score >= 0.24 && margin >= 0.04 ? 'high' : best.score >= 0.12 ? 'medium' : 'low'
    g7Records.push(g7)

    g7.previous_code = ''
    g7.next_code = g8.code
    g8.previous_code = g7.code
    g8.next_code = g9.code
    g9.previous_code = g8.code
    g9.next_code = ''
    for (const record of [g7, g8, g9]) {
        record.progression_previous_grade_band = record.grade_band === 'H4G7' ? '' : record.grade_band === 'H4G8' ? 'H4G7' : 'H4G8'
        record.progression_next_grade_band = record.grade_band === 'H4G7' ? 'H4G8' : record.grade_band === 'H4G8' ? 'H4G9' : ''
        record.progression_bridge_h3_code = best.record.code
        record.progression_bridge_method = 'same_subject_domain_text_skill_overlap_v1'
        record.progression_bridge_score = best.score
        record.progression_bridge_margin = margin
        record.progression_bridge_confidence = confidence
    }
    g7.progression_bridge_candidates = [{
        h3_code: best.record.code,
        score: best.score,
        margin,
        confidence,
        reason: 'h4_group_best'
    }]
    bridges.push({
        progression_group_id: groupId,
        subject_slug: g7.subject_slug,
        domain: g7.domain,
        h3_code: best.record.code,
        h4g7_code: g7.code,
        score: best.score,
        margin,
        confidence
    })
}

const selectedH3 = new Set(bridges.map(bridge => bridge.h3_code))
const unbridgedH3: Array<{ code: string; subject_slug: string; domain: string; reason: string }> = []
for (const h3 of records.filter(record => record.grade_band === 'H3' && !selectedH3.has(record.code))) {
    const candidates = g7Records
        .filter(record => record.subject_slug === h3.subject_slug && record.domain === h3.domain)
        .map(record => ({ record, score: matchScore(h3, record) }))
        .sort((left, right) => right.score - left.score || left.record.code.localeCompare(right.record.code))
    if (!candidates.length) {
        unbridgedH3.push({ code: h3.code, subject_slug: h3.subject_slug, domain: h3.domain, reason: 'no_same_domain_h4g7_successor' })
        continue
    }
    const best = candidates[0]
    const margin = Number((best.score - (candidates[1]?.score || 0)).toFixed(4))
    const confidence = best.score >= 0.24 && margin >= 0.04 ? 'high' : best.score >= 0.12 ? 'medium' : 'low'
    const candidate = { h3_code: h3.code, score: best.score, margin, confidence, reason: 'h3_coverage' }
    best.record.progression_bridge_candidates = [...(Array.isArray(best.record.progression_bridge_candidates) ? best.record.progression_bridge_candidates : []), candidate]
    bridges.push({
        progression_group_id: best.record.progression_group_id || null,
        subject_slug: best.record.subject_slug,
        domain: best.record.domain,
        h3_code: h3.code,
        h4g7_code: best.record.code,
        score: best.score,
        margin,
        confidence,
        reason: 'h3_coverage'
    })
}

if (apply) {
    for (const { path, payload } of payloads) writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`)
}

const confidence = bridges.reduce<Record<string, number>>((counts, bridge) => {
    counts[bridge.confidence] = (counts[bridge.confidence] || 0) + 1
    return counts
}, {})
console.log(JSON.stringify({
    apply,
    data_root: dataRoot,
    groups: groups.size,
    bridges: bridges.length,
    unbridged_h3: unbridgedH3.length,
    confidence,
    score: {
        min: Math.min(...bridges.map(item => item.score)),
        max: Math.max(...bridges.map(item => item.score)),
        average: Number((bridges.reduce((sum, item) => sum + item.score, 0) / bridges.length).toFixed(4))
    },
    sample: bridges.slice(0, 10),
    unbridged_sample: unbridgedH3.slice(0, 10)
}, null, 2))
