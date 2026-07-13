#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const GRADE_RANGES = { H1: '1-2', H2: '3-4', H3: '5-6', H4G7: '7', H4G8: '8', H4G9: '9' }
const GRADE_LABELS = {
    H1: '第一学段（1-2年级）', H2: '第二学段（3-4年级）', H3: '第三学段（5-6年级）',
    H4G7: '七年级', H4G8: '八年级', H4G9: '九年级'
}
const REFERENCE_DELIMITER = /[\n|]+/

function parseArgs(argv) {
    const args = { dataRoot: 'data/internal', strictProgression: false }
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--data-root') args.dataRoot = argv[++index]
        if (argv[index] === '--strict-progression') args.strictProgression = true
    }
    return args
}

function references(value) {
    return String(value || '').split(REFERENCE_DELIMITER).map(item => item.trim()).filter(Boolean)
}

const args = parseArgs(process.argv.slice(2))
const dataRoot = resolve(args.dataRoot)
const bySubject = join(dataRoot, 'by_subject')
const records = []
const errors = []
const warnings = []

for (const file of readdirSync(bySubject).filter(name => name.endsWith('.json')).sort()) {
    const payload = JSON.parse(readFileSync(join(bySubject, file), 'utf8'))
    const expectedSubject = file.replace(/\.json$/, '')
    for (const record of payload.standards || []) {
        records.push(record)
        if (record.subject_slug !== expectedSubject) errors.push(`${record.code}: subject_slug 与文件名不一致`)
        if (!String(record.code || '').trim()) errors.push(`${file}: 存在空 code`)
        if (!String(record.domain || '').trim()) errors.push(`${record.code}: 缺少 domain`)
        if (!String(record.subdomain || '').trim()) errors.push(`${record.code}: 缺少 subdomain`)
        if (!String(record.standard || '').trim()) errors.push(`${record.code}: 缺少 standard`)
        if (GRADE_RANGES[record.grade_band] !== record.grade_range) errors.push(`${record.code}: grade_range 与 grade_band 不一致`)
        if (GRADE_LABELS[record.grade_band] !== record.grade) errors.push(`${record.code}: grade 展示标签未规范化`)
        if (!Array.isArray(record.ts_primary) || !Array.isArray(record.ts_secondary)) errors.push(`${record.code}: TS 字段必须是数组`)
    }
}

const byCode = new Map()
const byId = new Map()
const aliases = new Map()
for (const record of records) {
    if (byCode.has(record.code)) errors.push(`重复 code: ${record.code}`)
    byCode.set(record.code, record)
    if (record.id) {
        if (byId.has(record.id)) errors.push(`重复 id: ${record.id}`)
        byId.set(record.id, record)
    }
    for (const alias of [record.id, record.legacy_code]) {
        const key = String(alias || '').trim().toUpperCase()
        if (!key || key === String(record.code).toUpperCase()) continue
        const candidates = aliases.get(key) || new Set()
        candidates.add(record.code)
        aliases.set(key, candidates)
    }
}

let unresolvedReferences = 0
let multiValueRecords = 0
for (const record of records) {
    for (const field of ['previous_code', 'next_code']) {
        const values = references(record[field])
        if (values.length > 1) multiValueRecords += 1
        for (const value of values) {
            const alias = aliases.get(value.toUpperCase())
            if (!byCode.has(value) && !byId.has(value) && !(alias && alias.size === 1)) {
                unresolvedReferences += 1
                errors.push(`${record.code}: ${field} 无法解析 ${value}`)
            }
        }
    }
}

const progressionGroups = new Map()
for (const record of records.filter(item => item.progression_group_id)) {
    const group = progressionGroups.get(record.progression_group_id) || []
    group.push(record)
    progressionGroups.set(record.progression_group_id, group)
}
let partialProgressionGroups = 0
for (const [groupId, group] of progressionGroups) {
    const bands = new Set(group.map(record => record.grade_band))
    if (group.length !== 3 || !['H4G7', 'H4G8', 'H4G9'].every(band => bands.has(band))) {
        errors.push(`${groupId}: H4G progression group 必须恰好包含 G7/G8/G9`)
        continue
    }
    const g7 = group.find(record => record.grade_band === 'H4G7')
    const g8 = group.find(record => record.grade_band === 'H4G8')
    const g9 = group.find(record => record.grade_band === 'H4G9')
    const first = g7.progression_next_grade_band === 'H4G8' || g8.progression_previous_grade_band === 'H4G7'
    const second = g8.progression_next_grade_band === 'H4G9' || g9.progression_previous_grade_band === 'H4G8'
    if (!first || !second) partialProgressionGroups += 1
}

const untagged = records.filter(record => !record.ts_primary.length && !record.ts_secondary.length).length
const multiPrimary = records.filter(record => record.ts_primary.length > 1).length
const ambiguousAliases = [...aliases.values()].filter(candidates => candidates.size > 1).length
if (untagged) warnings.push(`${untagged} 条标准尚未标注可迁移技能。`)
if (multiPrimary) warnings.push(`${multiPrimary} 条标准有多个主可迁移技能，需人工决定主次。`)
if (multiValueRecords) warnings.push(`${multiValueRecords} 个 legacy 前后关系字段仍使用多值字符串；API 已兼容解析，数据迁移后应改为数组。`)
if (ambiguousAliases) warnings.push(`${ambiguousAliases} 个 legacy alias 映射多个标准，单标准查询会返回 409。`)
if (partialProgressionGroups) {
    const message = `${partialProgressionGroups} 个 progression group 缺少完整连续边。`
    if (args.strictProgression) errors.push(message)
    else warnings.push(message)
}

const result = {
    valid: errors.length === 0,
    data_root: dataRoot,
    records: records.length,
    progression_groups: progressionGroups.size,
    unresolved_references: unresolvedReferences,
    partial_progression_groups: partialProgressionGroups,
    ambiguous_aliases: ambiguousAliases,
    errors,
    warnings
}
console.log(JSON.stringify(result, null, 2))
if (errors.length) process.exit(1)
