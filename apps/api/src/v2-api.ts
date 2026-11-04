// The public API's one dataset: 义务教育课程标准（2022年版2025年修订）. Keyword search, subject and domain lists, batch
// reads, compare, neighbours and progression all answer from the 2025 standards, in the same shape as
// GET /standards/:code. A 2022 code resolves to the standard it joined; the 2022 records stay under /legacy/.
import type { V2Standard, V2Store, V2Subject } from './v2-store.js'

export type V2Found = { standard: V2Standard, subject: V2Subject }
type Entry = V2Found & { order: number }

const SKILLS = ['TS1', 'TS2', 'TS3', 'TS4', 'TS5', 'TS6', 'TS7']
// what kebiao releases under CC BY 4.0, and what it does not (DATA_LICENSE.md)
export const DATA_LICENSE = {
    name: 'CC BY 4.0',
    url: 'https://creativecommons.org/licenses/by/4.0/',
    terms: 'https://github.com/NBrangerF/curriculum-standards-breakdown/blob/main/DATA_LICENSE.md',
    covers: 'kebiao 整理和编写的数据：编码与结构、kebiao 整理的文字、新旧编码对照、修订与核对标记、推断层（待核验）、kebiao 编写的课堂诊断题',
    excludes: '课标原文（教育部《义务教育课程标准（2022年版2025年修订）》）、教材内容与引用的教材原话、第三方平台内容、学习资源、源代码',
    attribution: 'kebiao 课标（https://www.kebiao.org），CC BY 4.0'
}
const STAGES = ['S1', 'S2', 'S3', 'S4']
// the 2022 grade bands, read as the grades they meant
const BAND_GRADES: Record<string, number[]> = { H1: [1, 2], H2: [3, 4], H3: [5, 6], H4: [7, 8, 9], H4G7: [7], H4G8: [8], H4G9: [9] }

export function publicStandard({ standard, subject }: V2Found) {
    return { ...standard, subject: subject.subject, subject_slug: subject.subject_slug, source_version: subject.source_version, source_note: subject.source_note }
}

// a brief line for lists of related standards
function brief({ standard, subject }: V2Found) {
    return { code: standard.code, title: standard.title, level1: standard.level1, level2: standard.level2, stage: standard.stage, stage_code: standard.stage_code, grades: standard.grades, subject_slug: subject.subject_slug }
}

async function entries(v2: V2Store, slugs?: string[]) {
    const manifest = await v2.manifest()
    const out: Entry[] = []
    for (const item of manifest?.subjects || []) {
        if (slugs?.length && !slugs.includes(item.subject_slug)) continue
        const subject = await v2.subject(item.subject_slug)
        for (const standard of subject?.standards || []) out.push({ standard, subject: subject!, order: out.length })
    }
    return out
}

/** A 2025 code (standard or 要点) or a 2022 code → the 2025 standard, with the 要点 it points at and where it came from. */
export async function resolveV2(v2: V2Store, code: string, canonicalLegacy?: (code: string) => Promise<string | null>) {
    const direct = await v2.find(code)
    if (direct) return { found: direct, indicator: code !== direct.standard.code ? code : null, moved_from: null as string | null }
    const legacy = (await canonicalLegacy?.(code)) || code
    const target = await v2.movedTo(legacy)
    if (!target) return null
    const [path, hash] = String(target).replace(/^\/standards\//u, '').split('#')
    const found = await v2.find(path)
    return found ? { found, indicator: hash || null, moved_from: legacy } : null
}

export type V2SearchRequest = {
    subjects?: string[], stages?: string[], grades?: number[], grade_bands?: string[], domains?: string[], skills?: string[], keyword?: string
}

export async function validateV2Filters(v2: V2Store, request: V2SearchRequest) {
    const manifest = await v2.manifest()
    const slugs = new Set((manifest?.subjects || []).map(item => item.subject_slug))
    const errors: string[] = []
    for (const slug of request.subjects || []) if (!slugs.has(slug)) errors.push(`未知学科：${slug}`)
    for (const stage of request.stages || []) if (!STAGES.includes(stage)) errors.push(`未知学段：${stage}（可用 S1–S4）`)
    for (const band of request.grade_bands || []) if (!BAND_GRADES[band]) errors.push(`未知年级段：${band}`)
    for (const skill of request.skills || []) if (!SKILLS.includes(skill.toUpperCase())) errors.push(`未知可迁移技能：${skill}`)
    if (request.domains?.length && !errors.length) {
        const known = new Set((await entries(v2, request.subjects)).map(entry => entry.standard.level1))
        for (const domain of request.domains) if (!known.has(domain)) errors.push(`未知或不属于当前学科范围的领域：${domain}`)
    }
    return errors
}

const squash = (value: unknown) => String(value || '').replace(/\s+/gu, '').toLowerCase()

/** Filter the 2025 standards; with a keyword, every term must appear, and standards whose name holds it come first. */
export async function searchV2(v2: V2Store, request: V2SearchRequest) {
    const grades = new Set([...(request.grades || []), ...(request.grade_bands || []).flatMap(band => BAND_GRADES[band] || [])])
    const skills = (request.skills || []).map(skill => skill.toUpperCase())
    const terms = String(request.keyword || '').split(/\s+/u).map(squash).filter(Boolean)
    const hits: Array<Entry & { named: boolean }> = []
    for (const entry of await entries(v2, request.subjects)) {
        const { standard } = entry
        if (request.stages?.length && !request.stages.includes(standard.stage_code)) continue
        if (grades.size && !standard.grades.some(grade => grades.has(grade))) continue
        if (request.domains?.length && !request.domains.includes(standard.level1)) continue
        if (skills.length && !skills.some(skill => [...(standard.ts_primary || []), ...(standard.ts_secondary || [])].includes(skill))) continue
        let named = false
        if (terms.length) {
            const name = squash(`${standard.code}${standard.title}${standard.level1}${standard.level2}${standard.theme || ''}`)
            const text = name + squash(`${standard.statement}${standard.indicators.map(item => item.text).join('')}${(standard.requirements || []).map(item => item.text).join('')}`)
            if (!terms.every(term => text.includes(term))) continue
            named = terms.every(term => name.includes(term))
        }
        hits.push({ ...entry, named })
    }
    hits.sort((a, b) => Number(b.named) - Number(a.named) || a.order - b.order)
    return hits.map(publicStandard)
}

export async function subjectsV2(v2: V2Store) {
    const manifest = await v2.manifest()
    const out = []
    for (const item of manifest?.subjects || []) {
        const domains = new Map<string, number>()
        for (const standard of (await v2.subject(item.subject_slug))?.standards || []) domains.set(standard.level1, (domains.get(standard.level1) || 0) + 1)
        out.push({
            subject_slug: item.subject_slug, subject: item.subject, prefix: item.prefix,
            standard_count: item.standard_count, indicator_count: item.indicator_count, stages: item.stages,
            domains: [...domains].map(([name, count]) => ({ name, standard_count: count })),
            url: `https://www.kebiao.org/subjects/${item.subject_slug}`
        })
    }
    return out
}

export async function domainsV2(v2: V2Store, slug: string) {
    const subject = await v2.subject(slug)
    if (!subject) return null
    const domains = new Map<string, { name: string, standard_count: number, indicator_count: number, stages: string[], standards: string[] }>()
    for (const standard of subject.standards) {
        const domain = domains.get(standard.level1) || { name: standard.level1, standard_count: 0, indicator_count: 0, stages: [], standards: [] }
        domain.standard_count += 1
        domain.indicator_count += standard.indicators.length
        if (!domain.stages.includes(standard.stage_code)) domain.stages.push(standard.stage_code)
        domain.standards.push(standard.code)
        domains.set(standard.level1, domain)
    }
    return { subject_slug: subject.subject_slug, subject: subject.subject, domains: [...domains.values()] }
}

export async function metaV2(v2: V2Store) {
    const [manifest, version, subjects] = await Promise.all([v2.manifest(), v2.version(), subjectsV2(v2)])
    return {
        data_version: version.data_version,
        source_version: manifest?.source_version || null,
        source_note: manifest?.source_note || null,
        totals: manifest?.totals || {},
        standard_count: manifest?.totals?.standards || 0,
        indicator_count: manifest?.totals?.indicators || 0,
        subjects_covered: subjects.length,
        code_format: '学科-学段-领域-序号，如 MA-S2-NA-02；要点再加 .序号，如 MA-S2-NA-02.1',
        license: DATA_LICENSE,
        legacy: { code_count: manifest?.totals?.legacy_codes || 0, note: '2022 年版的旧编码（如 MA-D2-AL-005）解析到它并入的新标准；旧记录在 /api/v1/legacy/standards/:code。' },
        filters: {
            subjects: subjects.map(item => item.subject_slug),
            stages: STAGES,
            grades: [1, 2, 3, 4, 5, 6, 7, 8, 9],
            skills: SKILLS,
            domains: Object.fromEntries(subjects.map(item => [item.subject_slug, item.domains.map(domain => domain.name)]))
        }
    }
}

/** Codes in, 2025 standards out (each once), with the codes that moved and the ones not found. */
export async function batchV2(v2: V2Store, codes: string[], canonicalLegacy: (code: string) => Promise<string | null>) {
    const items: ReturnType<typeof publicStandard>[] = []
    const seen = new Set<string>()
    const missing: string[] = []
    const resolved: Array<{ requested: string, code: string, indicator: string | null }> = []
    const duplicates: string[] = []
    for (const code of codes) {
        const hit = await resolveV2(v2, code, canonicalLegacy)
        if (!hit) { missing.push(code); continue }
        if (hit.moved_from || hit.indicator) resolved.push({ requested: code, code: hit.found.standard.code, indicator: hit.indicator })
        if (seen.has(hit.found.standard.code)) { duplicates.push(code); continue }
        seen.add(hit.found.standard.code)
        items.push(publicStandard(hit.found))
    }
    return { items, missing, resolved, duplicates }
}

const COMPARED = ['subject_slug', 'stage_code', 'level1', 'level2', 'theme'] as const

export async function compareV2(v2: V2Store, codes: string[], canonicalLegacy: (code: string) => Promise<string | null>) {
    const { items, missing } = await batchV2(v2, codes, canonicalLegacy)
    const common: Record<string, unknown> = {}
    const different: string[] = []
    for (const field of COMPARED) {
        const values = new Set(items.map(item => String((item as Record<string, unknown>)[field] ?? '')))
        if (values.size === 1) common[field] = (items[0] as Record<string, unknown>)?.[field] ?? null
        else different.push(field)
    }
    return { standards: items, common_fields: common, different_fields: different, missing }
}

/** The standards next to this one: the same subject, 学段 and 领域, in code order. */
export async function neighboursV2(v2: V2Store, found: V2Found) {
    const siblings = found.subject.standards.filter(item => item.stage_code === found.standard.stage_code && item.level1 === found.standard.level1)
    const at = siblings.findIndex(item => item.code === found.standard.code)
    const wrap = (standard?: V2Standard) => (standard ? brief({ standard, subject: found.subject }) : null)
    return {
        standard: brief(found),
        previous: wrap(siblings[at - 1]),
        next: wrap(siblings[at + 1]),
        same_stage_domain: siblings.filter(item => item.code !== found.standard.code).map(standard => brief({ standard, subject: found.subject }))
    }
}

/**
 * The same content across 学段: standards of this subject with the same 领域 and name, in stage order; when the
 * name appears in one 学段 only, the same 领域 in the other 学段. kebiao 整理 by name, not a judged prerequisite.
 */
export async function progressionV2(v2: V2Store, found: V2Found) {
    const { standard, subject } = found
    const byName = subject.standards.filter(item => item.level1 === standard.level1 && item.level2 === standard.level2)
    const chain = byName.length > 1 ? byName : subject.standards.filter(item => item.level1 === standard.level1 && (item.stage_code !== standard.stage_code || item.code === standard.code))
    chain.sort((a, b) => a.stage_code.localeCompare(b.stage_code) || a.code.localeCompare(b.code))
    return {
        standard: brief(found),
        method: byName.length > 1 ? 'same_name' : 'same_domain',
        note: byName.length > 1 ? '同一领域、同名的标准在各学段的写法。' : '这条标准的名称只在一个学段出现；列出同一领域在其他学段的标准。',
        chain: chain.map(item => ({ ...brief({ standard: item, subject }), current: item.code === standard.code })),
        prerequisites: { note: '「要先会」是 AI 判断的推断层，见知识图谱 https://www.kebiao.org/knowledge-graph' }
    }
}
