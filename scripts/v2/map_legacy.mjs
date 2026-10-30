#!/usr/bin/env node
// Attach the old (v1) records of a subject to the new standards and indicators, and write the v2 subject file.
// Usage: node scripts/v2/map_legacy.mjs <slug>
// Reads generated/v2/units/<slug>.json, data/internal/by_subject/<slug>.json, the manual verdicts in
// docs/data/audit-2026-11/review/<slug>.tsv and restage targets in docs/data/v2/mapping/<slug>.tsv.
// Writes data/v2/by_subject/<slug>.json, data/v2/legacy/<slug>.json and data/v2/stage_overview/<slug>.json.
//
// What happens to an old record follows its verdict:
//   keep / edit                 → its code joins the closest indicator (the indicator text is the official one)
//   trim / example / restage    → also becomes a 表现示例 (kebiao 整理) on that indicator, keeping the user's wording
//   goal                        → listed in the stage overview; the old URL goes to the subject page
//   merge / remove              → no new home; the old URL goes to the closest standard (merge) or the subject page
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { SUBJECT_NAMES, STAGES, grams, recall, stageCode, gradesOf } from './lib.mjs'
import { stageGoals } from './stage_goals.mjs'

const slug = process.argv[2]
const units = JSON.parse(readFileSync(`generated/v2/units/${slug}.json`, 'utf8'))
// New subjects (历史、地理、物理、化学、生物学) have no old records.
const legacyFile = `data/internal/by_subject/${slug}.json`
const legacy = existsSync(legacyFile) ? JSON.parse(readFileSync(legacyFile, 'utf8')).standards : []
const tsv = file => existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('\t')) : []
const verdicts = new Map(tsv(`docs/data/audit-2026-11/review/${slug}.tsv`).filter(p => !p[0].startsWith('ADD-')).map(([code, verdict, reason]) => [code, { verdict, reason }]))
const targets = new Map(tsv(`docs/data/v2/mapping/${slug}.tsv`).map(([code, stage, unit, note]) => [code, { stage, unit, note }]))
// Old second-level names that differ from the v2 unit names; "@overview" sends the record to the stage overview.
const aliases = new Map(tsv(`docs/data/v2/mapping/${slug}-aliases.tsv`).map(([from, to]) => [from, to]))

const unitName = t => String(t || '').replace(/^(?:学习)?任务群\s*\d+[：:]/u, '').replace(/^学习任务\s*\d+\s*[：:]/u, '').replace(/\s/gu, '')
const stageOf = r => (r.grade_band || '').startsWith('H4') ? '7-9' : r.grade_range
const standards = units.standards.map(s => ({ ...s, examples: [], indicators: s.indicators.map(i => ({ ...i, legacy_codes: [], examples: [] })) }))
const findStandard = (stage, unit) => standards.find(s => s.stage === stage && s.level2 === unit)
// Old records use 1-2 / 3-4 / 5-6 and H4G7–9; a subject with other official stages (艺术 3-5, 6-7, 8-9) maps
// them by grade, so an old 5-6 record may land in 3-5 or 6-7.
const candidateStages = r => {
    const grades = (r.grade_band || '').startsWith('H4') ? [+r.grade_band.slice(3)] : gradesOf(r.grade_range)
    const hit = Object.keys(STAGES[slug] || STAGES.default).filter(st => gradesOf(st).some(g => grades.includes(g)))
    return hit.length ? hit : [stageOf(r)]
}

const legacyMap = []
const overview = []
const problems = []
for (const r of legacy) {
    const v = verdicts.get(r.code)
    if (!v) { problems.push(`${r.code}: no verdict`); continue }
    const target = targets.get(r.code)
    const stages = target?.stage ? [target.stage] : candidateStages(r)
    let stage = stages[0]
    const unit = target?.unit || aliases.get(unitName(r.subdomain)) || unitName(r.subdomain)
    if (v.verdict === 'goal' || unit === '@overview') {
        overview.push({ legacy_code: r.code, stage, text: r.standard, reason: v.verdict === 'goal' ? v.reason : `${r.subdomain}：主题层面的综合描述，不挂到单个单元` })
        legacyMap.push({ code: r.code, kind: 'overview', to: `/subjects/${slug}`, stage_code: stageCode(slug, stage), reason: v.reason })
        continue
    }
    // Old records filed by 核心素养 or another dimension name no v2 unit: take the stage's standard whose
    // official text (statement, 要点, 学业要求) best covers the old text.
    let std = null
    for (const st of stages) if (!std) { std = findStandard(st, unit); if (std) stage = st }
    if (!std) {
        const og = grams(r.standard)
        const quotes0 = [...String(v.reason).matchAll(/「([^」]{3,})」/gu)].map(m => m[1])
        let top = null
        for (const cand of standards.filter(x => stages.includes(x.stage))) {
            const pieces = [cand.statement, ...cand.indicators.map(i => i.text + (i.official_examples || '')), ...(cand.requirements || []).map(q => q.text)]
            const quoted = quotes0.length ? Math.max(0, ...pieces.flatMap(t => quotes0.map(q => recall(grams(q), grams(t))))) : 0
            const clauseScore = Math.max(0, ...pieces.flatMap(t => t.split(/[，、；：。]/u).filter(c => c.length >= 3).map(c => recall(grams(c), og))))
            const score = Math.max(quoted >= 0.8 ? 1 + quoted : 0, recall(og, grams(pieces.join(''))), clauseScore * 0.9)
            if (!top || score > top.score) top = { cand, score }
        }
        if (top && top.score >= 0.3) { std = top.cand; stage = std.stage }
    }
    if (v.verdict === 'remove' || v.verdict === 'merge') {
        legacyMap.push({ code: r.code, kind: v.verdict === 'merge' ? 'merged' : 'removed', to: std ? std.code : `/subjects/${slug}`, reason: v.reason })
        continue
    }
    if (!std) { problems.push(`${r.code}: no standard for ${stage} / ${unit}`); continue }
    // Closest indicator. First choice: the official words quoted in the manual verdict (「……」).
    // Otherwise the official sentence that best overlaps the old text, judged clause by clause so a
    // paraphrase of one clause of a long sentence still finds it.
    const g = grams(r.standard)
    const quotes = [...String(v.reason).matchAll(/「([^」]{3,})」/gu)].map(m => m[1])
    let best = null
    for (const ind of std.indicators) {
        const full = ind.text + (ind.official_examples || '')
        const quoted = quotes.length ? Math.max(...quotes.map(q => recall(grams(q), grams(full)))) : 0
        const clauses = full.split(/[，、；：。]/u).filter(c => c.length >= 3)
        const clauseScore = Math.max(0, ...clauses.map(c => recall(grams(c), g)))
        const ig = grams(full)
        const score = quoted >= 0.8 ? 1 + quoted : Math.max(recall(ig, g), recall(g, ig), clauseScore * 0.9)
        if (!best || score > best.score) best = { ind, score }
    }
    const statementScore = Math.max(recall(grams(std.statement), g), recall(g, grams(std.statement)))
    // An old record whose clauses land on different indicators summarises the whole unit: link it to the standard.
    const landing = new Set(String(r.standard).split(/[；。]/u).filter(c => c.length >= 6).map(c => {
        const cg = grams(c)
        let top = null
        for (const ind of std.indicators) { const sc = recall(cg, grams(ind.text + (ind.official_examples || ''))); if (sc >= 0.5 && (!top || sc > top.sc)) top = { ind, sc } }
        return top?.ind.code
    }).filter(Boolean))
    const spans = landing.size >= 2 && !(best && best.score > 1)
    const home = !spans && best && best.score >= Math.max(0.35, statementScore) ? best.ind : null
    // The user's wording becomes a 表现示例 when it adds something to the official text; an old record that only
    // restates official clauses (e.g. a junior clause filed under the wrong grade) just joins the indicator.
    const official = grams([std.statement, ...std.indicators.map(i => i.text + (i.official_examples || '')), ...(std.requirements || []).map(q => q.text)].join(''))
    // A restage inside one v2 stage (junior records filed under the wrong grade) only moves the grade, which now
    // lives on the indicator, so it counts as keep.
    const movedStage = v.verdict === 'restage' && stage !== stageOf(r) || Boolean(target)
    const makeExample = v.verdict === 'example' || ((v.verdict === 'trim' || (v.verdict === 'restage' && movedStage)) && recall(g, official) < 0.85)
    if (home) home.legacy_codes.push(r.code)
    if (makeExample) {
        const list = home ? home.examples : std.examples
        list.push({ text: r.standard.trim(), from: r.code, note: v.reason })
    }
    legacyMap.push({ code: r.code, kind: home ? 'indicator' : 'standard', to: std.code, anchor: home ? home.code : null, match: +Math.min(1, home ? best.score : statementScore).toFixed(2), verdict: v.verdict })
}

// Stage goals (学段目标) rebuilt from the official text (scripts/v2/stage_goals.mjs), shown in the subject overview,
// not as standards. 语文 and 英语 have none here: their 学段要求 / 学段目标 are standards already; the five junior
// subjects have a single stage.
const rebuilt = stageGoals(slug) || { groups: [], notes: [] }
const goals = rebuilt.groups.map(g => ({ stage: g.stage, group: g.group, items: g.items.map(it => ({ text: it.text, pages: it.pages, source_ids: it.source_ids, check: it.check })) }))

mkdirSync('data/v2/by_subject', { recursive: true })
mkdirSync('data/v2/legacy', { recursive: true })
mkdirSync('data/v2/stage_overview', { recursive: true })
const out = { schema_version: '2.0.0', subject_slug: slug, subject: SUBJECT_NAMES[slug], source_version: units.source_version, ...(units.skipped_source_ids?.length ? { skipped_source_ids: units.skipped_source_ids } : {}), source_note: '修订版文本取自上海市青浦区凤溪中学网站转载的《义务教育课程标准 日常修订版（2022年版2025年修订）》；以官方出版物为准。', standards }
writeFileSync(`data/v2/by_subject/${slug}.json`, `${JSON.stringify(out, null, 1)}\n`)
writeFileSync(`data/v2/legacy/${slug}.json`, `${JSON.stringify(legacyMap, null, 1)}\n`)
writeFileSync(`data/v2/stage_overview/${slug}.json`, `${JSON.stringify({ subject_slug: slug, stage_goals: goals, stage_notes: rebuilt.notes, theme_requirements: units.theme_requirements || [], kept_from_v1: overview }, null, 1)}\n`)

const kinds = {}
legacyMap.forEach(m => { kinds[m.kind] = (kinds[m.kind] || 0) + 1 })
const examples = standards.reduce((n, s) => n + s.examples.length + s.indicators.reduce((k, i) => k + i.examples.length, 0), 0)
console.log(`${slug}: ${legacy.length} old records → ${JSON.stringify(kinds)}; ${examples} examples; weak matches ${legacyMap.filter(m => m.kind === 'indicator' && m.match < 0.4).length}`)
if (problems.length) console.log('problems:\n  ' + problems.join('\n  '))
