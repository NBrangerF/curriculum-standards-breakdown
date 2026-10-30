#!/usr/bin/env node
// Publishes the v2 standards (标准 → 要点 → 表现示例) from data/v2 to public/data/v2 for the site, the API and the cards.
// Writes:
//   public/data/v2/manifest.json            subjects, stages and counts
//   public/data/v2/by_subject/<slug>.json   standards with their 要点, plus the stage overview
//   public/data/v2/legacy_codes.json        every old (v1) code → its new page, used for 301s and the client fallback
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = 'data/v2'
const OUT = 'public/data/v2'
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))

const SUBJECT_ORDER = ['chinese', 'math', 'english', 'morality_law', 'history', 'geography', 'science', 'physics', 'chemistry', 'biology', 'it', 'pe', 'arts', 'labor']
const STAGE_NAMES = { S1: '第一学段', S2: '第二学段', S3: '第三学段', S4: '第四学段' }
const ENGLISH_LEVELS = { S1: '一级', S2: '二级', S3: '三级' }
const PE_LEVELS = { S1: '水平一', S2: '水平二', S3: '水平三', S4: '水平四' }
const JUNIOR_ONLY = new Set(['history', 'geography', 'physics', 'chemistry', 'biology'])
const range = stage => stage.replace('-', '–')
const stageLabel = (slug, code, stage) => {
    if (slug === 'english') return `${ENGLISH_LEVELS[code]}（${range(stage)} 年级）`
    if (slug === 'pe') return `${PE_LEVELS[code]}（${range(stage)} 年级）`
    if (JUNIOR_ONLY.has(slug)) return `${range(stage)} 年级`
    return `${STAGE_NAMES[code]}（${range(stage)} 年级）`
}

// Revision state shown on the page: the 2022 wording only where the revision changed it.
const revision = check => {
    if (!check) return undefined
    if (check.status === 'revised') return { status: 'revised', type: check.type, text_2022: check.text_2022 || '', page_2022: check.page_2022 ?? null }
    if (check.status === 'ocr_doubt') return { status: 'ocr_doubt' }
    if (check.status === 'table') return { status: 'table' }
    return { status: 'verified' }
}
const example = e => ({ text: e.text, from: e.from })
const officialItem = item => ({ text: item.text, section: item.section || null, pages: item.pages || [], check: revision(item.check) })

// Curated learning resources are filed under old codes (public/data/learning-resources/by-standard/<old>.json).
const RESOURCES_DIR = 'public/data/learning-resources/by-standard'
const resourcesByOldCode = new Map(existsSync(RESOURCES_DIR)
    ? readdirSync(RESOURCES_DIR).filter(f => f.endsWith('.json')).map(f => [f.replace(/\.json$/u, ''), readJson(join(RESOURCES_DIR, f)).resources.map(r => r.id)])
    : [])

function publicStandard(s, oldCodes) {
    return {
        code: s.code,
        stage: s.stage,
        stage_code: s.stage_code,
        grades: s.grades,
        level1: s.level1,
        ...(s.theme ? { theme: s.theme } : {}),
        level2: s.level2,
        title: s.title,
        statement: s.statement,
        statement_source: s.statement_source,
        statement_section: s.statement_section || null,
        statement_pages: s.statement_pages || [],
        ...(s.statement_check ? { statement_check: revision(s.statement_check) } : {}),
        indicators: s.indicators.map(i => ({
            code: i.code,
            text: i.text,
            section: i.section || null,
            pages: i.pages || [],
            check: revision(i.check),
            ...(i.grades ? { grades: i.grades, grade_basis: i.grade_basis || null } : {}),
            ...(i.label ? { label: i.label } : {}),
            ...(i.official_examples ? { official_examples: i.official_examples } : {}),
            ...(i.optional ? { optional: true } : {}),
            legacy_codes: i.legacy_codes,
            examples: i.examples.map(example)
        })),
        requirements: (s.requirements || []).map(officialItem),
        guidance: (s.guidance || []).map(officialItem),
        examples: s.examples.map(example),
        // Every old code that now opens this standard (on a 要点 or on the standard itself).
        legacy_codes: oldCodes,
        learning_resource_ids: [...new Set(oldCodes.flatMap(code => resourcesByOldCode.get(code) || []))]
    }
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'by_subject'), { recursive: true })

const slugs = readdirSync(join(SOURCE, 'by_subject')).map(f => f.replace(/\.json$/u, ''))
const ordered = [...SUBJECT_ORDER.filter(s => slugs.includes(s)), ...slugs.filter(s => !SUBJECT_ORDER.includes(s)).sort()]
const legacyCodes = {}
const subjects = []
for (const slug of ordered) {
    const data = readJson(join(SOURCE, 'by_subject', `${slug}.json`))
    const overview = readJson(join(SOURCE, 'stage_overview', `${slug}.json`))
    const legacy = readJson(join(SOURCE, 'legacy', `${slug}.json`))
    const oldCodesOf = code => legacy.filter(m => m.to === code).map(m => m.code)
    const standards = data.standards.map(s => publicStandard(s, oldCodesOf(s.code)))
    const stages = []
    for (const s of standards) {
        let stage = stages.find(x => x.stage_code === s.stage_code)
        if (!stage) stages.push(stage = { stage_code: s.stage_code, stage: s.stage, grades: s.grades, label: stageLabel(slug, s.stage_code, s.stage), standard_count: 0, indicator_count: 0 })
        stage.standard_count += 1
        stage.indicator_count += s.indicators.length
    }
    stages.sort((a, b) => a.stage_code.localeCompare(b.stage_code))
    for (const m of legacy) {
        // A record that only joined a 要点 opens that 要点; one that summarised the unit opens the standard.
        legacyCodes[m.code] = m.to.startsWith('/') ? m.to : `/standards/${m.to}${m.anchor ? `#${m.anchor}` : ''}`
    }
    writeFileSync(join(OUT, 'by_subject', `${slug}.json`), `${JSON.stringify({
        schema_version: '2.0.0',
        subject_slug: slug,
        subject: data.subject,
        source_version: data.source_version || '2022年版2025年修订',
        source_note: data.source_note,
        stages,
        stage_overview: {
            // 学段目标 rebuilt by scripts/v2/stage_goals.mjs: per stage, grouped by 核心素养 / 学科 where the 课标 groups them
            stage_goals: (overview.stage_goals || []).map(g => ({
                stage: g.stage,
                stage_code: stages.find(st => st.stage === g.stage)?.stage_code || null,
                group: g.group || null,
                items: g.items.map(it => ({ text: it.text, pages: it.pages, check: { status: it.check?.status || 'verified' } }))
            })),
            stage_notes: (overview.stage_notes || []).map(n => ({ text: n.text, pages: n.pages })),
            theme_requirements: overview.theme_requirements.map(t => ({ stage: t.stage, level1: t.level1 || null, theme: t.theme || null, text: t.text, pages: t.pages || [] })),
            kept_from_v1: overview.kept_from_v1.map(k => ({ legacy_code: k.legacy_code, stage: k.stage, text: k.text }))
        },
        standards
    })}\n`)
    subjects.push({
        subject_slug: slug,
        subject: data.subject,
        prefix: standards[0]?.code.slice(0, 2),
        file: `v2/by_subject/${slug}.json`,
        stages,
        standard_count: standards.length,
        indicator_count: standards.reduce((n, s) => n + s.indicators.length, 0),
        legacy_count: legacy.length
    })
}

writeFileSync(join(OUT, 'legacy_codes.json'), `${JSON.stringify(legacyCodes)}\n`)
const totals = {
    subjects: subjects.length,
    standards: subjects.reduce((n, s) => n + s.standard_count, 0),
    indicators: subjects.reduce((n, s) => n + s.indicator_count, 0),
    legacy_codes: Object.keys(legacyCodes).length
}
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify({
    schema_version: '2.0.0',
    source_version: '义务教育课程标准（2022年版2025年修订）',
    source_note: '修订版文本取自上海市青浦区凤溪中学网站转载的《义务教育课程标准 日常修订版（2022年版2025年修订）》；以官方出版物为准。',
    totals,
    subjects
}, null, 1)}\n`)
console.log(`public v2: ${totals.subjects} subjects, ${totals.standards} standards, ${totals.indicators} 要点, ${totals.legacy_codes} old codes`)
