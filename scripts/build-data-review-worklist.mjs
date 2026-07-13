#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const DOMAIN_TOKENS = {
    arts: { '审美感知': 'AA', '艺术表现': 'AE', '创意实践': 'CP', '文化理解': 'CU' },
    chinese: { '识字与写字': 'LI', '阅读与鉴赏': 'RE', '表达与交流': 'CM', '梳理与探究': 'IN' },
    english: { '语言能力': 'LA', '文化意识': 'CA', '思维品质': 'TP', '学习能力': 'SA' },
    it: { '信息意识': 'IC', '信息社会责任': 'SR', '数字化学习与创新': 'DL', '计算思维': 'CS' },
    labor: { '日常生活劳动': 'DL', '生产劳动': 'PL', '服务性劳动': 'SL', '公益劳动与志愿服务': 'VL' },
    math: { '数与代数': 'AL', '图形与几何': 'GE', '统计与概率': 'ST', '综合与实践': 'PR' },
    morality_law: { '道德教育': 'MOR', '法治教育': 'LAW', '国情教育': 'NAT', '生命安全与健康教育': 'SAF', '中华优秀传统文化与革命传统教育': 'TCR', '入学教育': 'ENR' },
    pe: { '运动技能': 'LM', '健康教育': 'HB', '体育品德': 'SD', '体能': 'PF' },
    science: { '科学观念': 'SC', '科学思维': 'TH', '探究实践': 'PR', '态度责任': 'AR' }
}
const SUBJECT_PREFIXES = { arts: 'AR', chinese: 'CN', english: 'EN', it: 'IT', labor: 'LA', math: 'MA', morality_law: 'ML', pe: 'PE', science: 'SC' }

function argument(name, fallback) {
    const index = process.argv.indexOf(name)
    return index >= 0 ? process.argv[index + 1] : fallback
}

function references(value) {
    const values = Array.isArray(value) ? value : String(value || '').split(/[\n|]+/)
    return [...new Set(values.map(item => String(item).trim()).filter(Boolean))]
}

function sortByCode(items) {
    return items.sort((left, right) => left.subject_slug.localeCompare(right.subject_slug) || left.grade_band.localeCompare(right.grade_band) || left.code.localeCompare(right.code))
}

const dataRoot = resolve(argument('--data-root', 'data/internal'))
const outputPath = resolve(argument('--out', 'generated/data_quality/review-worklist.json'))
const records = readdirSync(join(dataRoot, 'by_subject'))
    .filter(file => file.endsWith('.json'))
    .flatMap(file => JSON.parse(readFileSync(join(dataRoot, 'by_subject', file), 'utf8')).standards || [])

const aliases = new Map()
for (const record of records) {
    for (const value of [record.id, record.legacy_code, ...(Array.isArray(record.legacy_codes) ? record.legacy_codes : [])]) {
        const key = String(value || '').trim()
        if (!key || key === record.code) continue
        const candidates = aliases.get(key) || new Set()
        candidates.add(record.code)
        aliases.set(key, candidates)
    }
}

const progressionGroups = new Map()
for (const record of records.filter(record => record.progression_group_id)) {
    const group = progressionGroups.get(record.progression_group_id) || []
    group.push(record)
    progressionGroups.set(record.progression_group_id, group)
}

const partialProgression = [...progressionGroups.entries()].flatMap(([progression_group_id, group]) => {
    const byBand = new Map(group.map(record => [record.grade_band, record]))
    const g7 = byBand.get('H4G7')
    const g8 = byBand.get('H4G8')
    const g9 = byBand.get('H4G9')
    const first = Boolean(g7 && g8 && (g7.progression_next_grade_band === 'H4G8' || g8.progression_previous_grade_band === 'H4G7'))
    const second = Boolean(g8 && g9 && (g8.progression_next_grade_band === 'H4G9' || g9.progression_previous_grade_band === 'H4G8'))
    return first && second ? [] : [{
        progression_group_id,
        subject_slug: group[0]?.subject_slug,
        codes: group.map(record => record.code).sort(),
        missing_edges: [!first ? 'H4G7->H4G8' : null, !second ? 'H4G8->H4G9' : null].filter(Boolean)
    }]
})

const multiValueRelationships = records.flatMap(record => ['previous_code', 'next_code'].flatMap(field => {
    const values = references(record[field])
    return values.length > 1 ? [{ code: record.code, subject_slug: record.subject_slug, grade_band: record.grade_band, field, values }] : []
}))

const legacyDomainTokens = new Map()
for (const record of records) {
    const token = String(record.code || '').split('-')[2] || ''
    const key = `${record.subject_slug}|${record.domain}`
    const tokens = legacyDomainTokens.get(key) || new Set()
    tokens.add(token)
    legacyDomainTokens.set(key, tokens)
}

const codeHarmonization = [...legacyDomainTokens].map(([key, tokens]) => {
    const [subject_slug, domain] = key.split('|')
    return {
        subject_slug,
        domain,
        canonical_domain_token: DOMAIN_TOKENS[subject_slug]?.[domain] || null,
        current_code_tokens: [...tokens].sort()
    }
}).filter(item => item.current_code_tokens.some(token => token !== item.canonical_domain_token))
const codeFormatIssues = records.flatMap(record => {
    const parts = String(record.code || '').split('-')
    const reasons = []
    if (parts[0] !== SUBJECT_PREFIXES[record.subject_slug]) reasons.push(`学科前缀应为 ${SUBJECT_PREFIXES[record.subject_slug]}`)
    if (parts.length !== 4 || !/^\d{3}$/.test(parts[3] || '')) reasons.push('必须使用 SUBJECT-STAGE-DOMAIN-SEQ 四段格式')
    return reasons.length ? [{ code: record.code, subject_slug: record.subject_slug, grade_band: record.grade_band, domain: record.domain, reasons }] : []
})

const report = {
    generated_at: new Date().toISOString(),
    data_root: dataRoot,
    summary: {
        records: records.length,
        untagged_skills: records.filter(record => !record.ts_primary?.length && !record.ts_secondary?.length).length,
        multiple_primary_skills: records.filter(record => (record.ts_primary || []).length > 1).length,
        ambiguous_legacy_aliases: [...aliases.values()].filter(candidates => candidates.size > 1).length,
        multi_value_relationships: multiValueRelationships.length,
        partial_progression_groups: partialProgression.length,
        code_harmonization_groups: codeHarmonization.length,
        code_format_issues: codeFormatIssues.length
    },
    worklists: {
        missing_transferable_skills: sortByCode(records.filter(record => !record.ts_primary?.length && !record.ts_secondary?.length).map(record => ({ code: record.code, subject_slug: record.subject_slug, grade_band: record.grade_band, domain: record.domain, standard: record.standard }))),
        multiple_primary_skills: sortByCode(records.filter(record => (record.ts_primary || []).length > 1).map(record => ({ code: record.code, subject_slug: record.subject_slug, grade_band: record.grade_band, ts_primary: record.ts_primary, ts_secondary: record.ts_secondary }))),
        ambiguous_legacy_aliases: [...aliases.entries()].filter(([, candidates]) => candidates.size > 1).map(([alias, candidates]) => ({ alias, candidates: [...candidates].sort() })).sort((left, right) => left.alias.localeCompare(right.alias)),
        multi_value_relationships: sortByCode(multiValueRelationships),
        partial_progression_groups: partialProgression.sort((left, right) => left.progression_group_id.localeCompare(right.progression_group_id)),
        code_harmonization: codeHarmonization.sort((left, right) => left.subject_slug.localeCompare(right.subject_slug) || left.domain.localeCompare(right.domain)),
        code_format_issues: sortByCode(codeFormatIssues)
    },
    next_actions: [
        '先人工确认可迁移技能和多主技能的主次；不得用模型推断结果直接写入正式数据。',
        '对 partial_progression_groups 补充连续年级边或保留 partial 状态；不得把进阶组解释为严格先修图。',
        '为每个歧义旧编码决定保留、废弃或重定向策略；公开单条 API 将继续返回 409，直到其唯一化。',
        '审核 code_harmonization 后再执行 canonical code 迁移；迁移必须同时生成 alias 与关系映射。'
    ]
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ output: outputPath, summary: report.summary }, null, 2))
