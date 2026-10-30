#!/usr/bin/env node
// Machine checks for every published standard against the official text catalogue.
// Usage: node scripts/audit/audit_standards.mjs [--subjects a,b]
// Reads data/internal/by_subject/<slug>.json and generated/source_catalog/{2022,2025r}/<slug>.json
// (plus generated/revision_diff/<slug>.json when present), writes generated/audit/<slug>.json.
// The flags feed the manual review; they are evidence for a reviewer, not verdicts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = { subjects: [] }
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 1) if (argv[i] === '--subjects') args.subjects = argv[++i].split(',').filter(Boolean)
const OUT = 'generated/audit'
mkdirSync(OUT, { recursive: true })

// Layers that state what students can do (any of them is a legitimate anchor), and the one layer
// each subject should anchor to under docs/STANDARDS_METHOD_V2.md (the most specific outcome statements).
const OUTCOME_SECTIONS = ['学段要求', '学段目标', '识字与写字', '阅读与鉴赏', '表达与交流', '梳理与探究', '内容要求', '学业要求', '素养表现', '学业质量描述']
export const TARGET_LAYER = {
    chinese: ['识字与写字', '阅读与鉴赏', '表达与交流', '梳理与探究', '学段要求'],
    math: ['学业要求'],
    english: ['内容要求'],
    morality_law: ['内容要求', '学业要求'],
    science: ['内容要求', '学业要求'],
    it: ['学业要求'],
    pe: ['学业要求'],
    arts: ['学业要求'],
    labor: ['素养表现', '内容要求'],
    history: ['内容要求', '学业要求'], geography: ['内容要求', '学业要求'], physics: ['内容要求', '学业要求'], chemistry: ['内容要求', '学业要求'], biology: ['内容要求', '学业要求']
}
const OUTCOME = { default: e => OUTCOME_SECTIONS.includes(e.section) }
const isTarget = (slug, e) => (TARGET_LAYER[slug] || []).includes(e.section)
const isOutcome = (slug, e) => (OUTCOME[slug] || OUTCOME.default)(e)

const plain = text => String(text || '').replace(/[\s　]/gu, '').replace(/[（(]例\d+[^）)]*[）)]/gu, '')
const strip = text => plain(text).replace(/[，。；、：！？“”"'‘’（）()《》【】\[\]·•—\-～~]/gu, '')
function grams(text) {
    const s = strip(text)
    const m = new Map()
    for (let i = 0; i < s.length - 1; i += 1) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1) }
    return m
}
const size = m => { let n = 0; for (const v of m.values()) n += v; return n }
function overlap(a, b) { let n = 0; for (const [g, v] of a) n += Math.min(v, b.get(g) || 0); return n }
// Share of a's bigrams found in b.
const recall = (a, b) => { const n = size(a); return n ? overlap(a, b) / n : 0 }
const dice = (a, b) => { const n = size(a) + size(b); return n ? (2 * overlap(a, b)) / n : 0 }

const clauses = text => plain(text).split(/[；。]/u).map(s => s.replace(/^[，、]+|[，、]+$/gu, '')).filter(s => strip(s).length >= 4)

const VERBS = ['了解', '知道', '认识', '理解', '掌握', '运用', '应用', '说出', '描述', '解释', '说明', '阐释', '阐述', '分析', '比较', '评价', '判断', '设计', '体会', '感受', '感悟', '尝试', '独立', '熟练', '初步', '领悟', '归纳', '概括', '论证', '证明', '探究', '探索']
const QUANTITY = /([0-9０-９]+|[一二两三四五六七八九十百千]+)\s*(条|种|个|项|次|分钟|篇|首|处|类|步|组|件|本|部|句|字|米|秒|小时|周|天|册)/gu
const GARBLE = [/能包括/u, /能以及/u, /能每/u, /能能/u, /能在[^；。]{0,30}时；/u, /；能(?:和|与|及|或|等)/u, /能其中/u, /能如/u, /^能等/u]
const STRUCTURE = [/课程内容中/u, /专项运动技能包括/u, /等主题开展/u, /围绕.{0,40}等主题/u, /本学段/u, /学习任务群/u]

const stageOf = r => r.grade_range || ({ H1: '1-2', H2: '3-4', H3: '5-6' }[r.grade_band]) || '7-9'
const sourceStage = r => (r.grade_band || '').startsWith('H4') ? '7-9' : stageOf(r)
const gradesOf = range => { const m = String(range || '').match(/(\d)(?:-(\d))?/u); if (!m) return []; const out = []; for (let g = +m[1]; g <= +(m[2] || m[1]); g += 1) out.push(g); return out }

const slugs = ['chinese', 'math', 'english', 'morality_law', 'science', 'it', 'pe', 'arts', 'labor'].filter(s => !args.subjects.length || args.subjects.includes(s))
const summary = []
for (const slug of slugs) {
    const standards = JSON.parse(readFileSync(`data/internal/by_subject/${slug}.json`, 'utf8')).standards
    const load = version => {
        const file = `generated/source_catalog/${version}/${slug}.json`
        return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).entries : []
    }
    const cat = load('2022')
    // Paragraph text, so a clause split across two sentences still matches.
    const paras = new Map()
    for (const e of cat) { const k = e.para; if (!paras.has(k)) paras.set(k, []); paras.get(k).push(e) }
    const paraText = new Map([...paras].map(([k, list]) => [k, list.map(e => e.text).join('')]))
    const catGrams = cat.map(e => grams(e.text))
    const paraGrams = new Map([...paraText].map(([k, t]) => [k, grams(t)]))
    const diffFile = `generated/revision_diff/${slug}.json`
    const revision = new Map()
    // 2022 entry id → the real (non-OCR) revision hunk that touches it.
    if (existsSync(diffFile)) for (const hunk of JSON.parse(readFileSync(diffFile, 'utf8')).hunks) {
        if (hunk.ocr_suspect || !hunk.a) continue
        for (const id of hunk.a.entry_ids) revision.set(id, hunk)
    }

    // Official target-layer clauses (cut at ，；。), for the reverse check: does a standard contain an official clause,
    // even when it adds its own detail around it?
    const officialClauses = []
    for (const e of cat) {
        if (!isTarget(slug, e)) continue
        for (const piece of plain(e.text).split(/[，；。：]/u)) if (strip(piece).length >= 5) officialClauses.push({ text: piece, g: grams(piece), stage: e.stage, page: e.page, para: e.para })
    }
    const rows = standards.map(r => {
        const flags = []
        const parts = clauses(r.standard)
        const matched = parts.map(clause => {
            const g = grams(clause)
            let best = null
            cat.forEach((e, i) => {
                const s = Math.max(recall(g, catGrams[i]), recall(g, paraGrams.get(e.para)) - 0.02)
                // Prefer the outcome layer and the right stage when scores tie.
                const bonus = (isTarget(slug, e) ? 0.03 : isOutcome(slug, e) ? 0.02 : 0) + (e.stage === sourceStage(r) ? 0.02 : 0)
                if (!best || s + bonus > best.score + best.bonus) best = { score: s, bonus, e }
            })
            return { clause, score: +(best?.score || 0).toFixed(3), entry: best?.e }
        })
        const total = parts.reduce((n, c) => n + strip(c).length, 0) || 1
        const coverage = matched.filter(m => m.score >= 0.6).reduce((n, m) => n + strip(m.clause).length, 0) / total
        const anchors = matched.filter(m => m.score >= 0.6).map(m => m.entry)
        const anchorParas = [...new Set(anchors.map(e => e.para))]
        const anchorText = anchorParas.map(p => paraText.get(p)).join('')

        const standardGrams = grams(r.standard)
        const ownStage = gradesOf(stageOf(r))
        const elaborates = officialClauses.filter(c => (!c.stage || gradesOf(c.stage).some(g => ownStage.includes(g))) && recall(c.g, standardGrams) >= 0.7).map(c => ({ text: c.text, page: c.page }))
        if (coverage < 0.4) flags.push(elaborates.length ? 'elaborates_official_clause' : 'no_anchor')
        else if (coverage < 0.8) flags.push('partial_anchor')
        if (anchors.length && !anchors.some(e => isOutcome(slug, e))) flags.push('anchor_not_outcome_layer')
        else if (anchors.length && !anchors.some(e => isTarget(slug, e))) flags.push('anchor_layer_changes_under_method')
        // Stages differ by subject (艺术 groups grades 3–5, 6–7, 8–9), so compare grade sets, not labels.
        const anchorStages = [...new Set(anchors.map(e => e.stage).filter(Boolean))]
        const own = gradesOf(stageOf(r))
        if (anchorStages.length && !anchorStages.some(st => gradesOf(st).some(g => own.includes(g)))) flags.push('stage_mismatch')
        else if (anchorStages.length && !anchorStages.some(st => own.every(g => gradesOf(st).includes(g)))) flags.push('stage_partial_overlap')
        if (anchorParas.length >= 3) flags.push('bundles_many_source_items')
        // Quantities and examples that the anchored source does not contain.
        const quantities = [...plain(r.standard).matchAll(QUANTITY)].map(m => m[0]).filter(q => !plain(anchorText).includes(q))
        if (quantities.length) flags.push(anchors.length ? 'quantity_not_in_source' : 'quantity_unverifiable')
        const examples = [...plain(r.standard).matchAll(/[（(]如([^）)]+)[）)]|如([^，。；]{2,20})等/gu)].map(m => m[1] || m[2]).filter(x => x && recall(grams(x), grams(anchorText)) < 0.6)
        if (examples.length) flags.push(anchors.length ? 'example_not_in_source' : 'example_unverifiable')
        const verbShift = matched.filter(m => m.score >= 0.6).flatMap(m => VERBS.filter(v => m.clause.includes(v) && !paraText.get(m.entry.para).includes(v)))
        if (verbShift.length) flags.push('verb_not_in_source')
        if (GARBLE.some(re => re.test(plain(r.standard)))) flags.push('garbled_clause')
        if (STRUCTURE.some(re => re.test(plain(r.standard)))) flags.push('describes_course_not_outcome')
        if (parts.length >= 4) flags.push('many_clauses')
        // Revision status of the anchored source paragraphs.
        const anchorIds = anchorParas.flatMap(p => paras.get(p).map(e => e.id))
        const revised = anchorIds.map(id => revision.get(id)).filter(Boolean)
        const revisionStatus = !anchorIds.length ? 'unknown' : revised.some(h => h.type === 'delete') ? 'source_removed_in_2025' : revised.length ? 'source_reworded_in_2025' : 'source_unchanged'
        const revisionChanges = [...new Set(revised)].map(h => ({ type: h.type, page_2025: h.b?.page, changes: h.changes.slice(0, 4) }))
        if (revisionStatus === 'source_removed_in_2025' || revisionStatus === 'source_reworded_in_2025') flags.push(revisionStatus)

        return {
            code: r.code, grade_band: r.grade_band, grade_range: stageOf(r), domain: r.domain, subdomain: r.subdomain, title: r.standard_title, standard: r.standard,
            progression_group_id: r.progression_group_id || null,
            coverage: +coverage.toFixed(2), flags, elaborates: elaborates.slice(0, 4),
            quantities, examples, verb_shift: [...new Set(verbShift)],
            anchors: anchorParas.map(p => { const e = paras.get(p)[0]; return { para: p, page: e.page, part: e.part, stage: e.stage, section: e.section, topic: e.topic, outcome: isOutcome(slug, e), target: isTarget(slug, e), text: paraText.get(p) } }),
            clause_matches: matched.map(m => ({ clause: m.clause, score: m.score, page: m.entry?.page, section: m.entry?.section, stage: m.entry?.stage })),
            revision: revisionStatus,
            revision_changes: revisionChanges
        }
    })

    // Near-duplicates within a stage.
    const g = rows.map(x => grams(x.standard))
    for (let i = 0; i < rows.length; i += 1) for (let j = i + 1; j < rows.length; j += 1) {
        if (rows[i].grade_band !== rows[j].grade_band) continue
        if (dice(g[i], g[j]) >= 0.8) { rows[i].flags.push('near_duplicate'); rows[j].flags.push('near_duplicate'); (rows[i].duplicates ||= []).push(rows[j].code); (rows[j].duplicates ||= []).push(rows[i].code) }
    }
    // Junior triplets: how the 七/八/九 members of one group differ.
    const groups = new Map()
    rows.filter(x => x.progression_group_id && x.grade_band.startsWith('H4')).forEach(x => { if (!groups.has(x.progression_group_id)) groups.set(x.progression_group_id, []); groups.get(x.progression_group_id).push(x) })
    for (const members of groups.values()) {
        if (members.length < 2) continue
        const sets = members.map(m => new Set(clauses(m.standard).map(strip)))
        const union = new Set(sets.flatMap(s => [...s]))
        const shared = [...union].filter(c => sets.every(s => s.has(c))).length
        for (const m of members) {
            m.triplet = { members: members.map(x => x.code), clause_union: union.size, shared_by_all: shared }
            const pairwise = members.filter(x => x !== m).map(x => dice(grams(m.standard), grams(x.standard)))
            if (Math.max(...pairwise) >= 0.9) m.flags.push('triplet_near_identical')
        }
    }
    // Outcome-layer source sentences no standard covers (a sentence counts as covered at recall ≥ 0.5).
    const stdGrams = rows.map(x => grams(x.standard))
    const outcomeEntries = cat.filter(e => e.part === '课程内容' || e.part === '课程目标' ? isTarget(slug, e) && strip(e.text).length >= 6 : false)
    const gaps = []
    for (const e of outcomeEntries) {
        const eg = grams(e.text)
        let best = 0, by = null
        stdGrams.forEach((sg, k) => { const v = recall(eg, sg); if (v > best) { best = v; by = rows[k].code } })
        if (best < 0.5) gaps.push({ id: e.id, para: e.para, page: e.page, stage: e.stage, section: e.section, topic: e.topic, best: +best.toFixed(2), closest: by, text: e.text })
    }
    const outcomeParas = outcomeEntries
    const flagCounts = {}
    rows.forEach(x => x.flags.forEach(f => { flagCounts[f] = (flagCounts[f] || 0) + 1 }))
    writeFileSync(join(OUT, `${slug}.json`), JSON.stringify({ subject_slug: slug, standards: rows.length, outcome_sentences: outcomeEntries.length, uncovered_outcome_sentences: gaps.length, flag_counts: flagCounts, rows, gaps }, null, 1))
    summary.push({ slug, standards: rows.length, anchored: rows.filter(x => x.coverage >= 0.8).length, no_anchor: flagCounts.no_anchor || 0, outcome_sentences: outcomeEntries.length, uncovered: gaps.length, ...Object.fromEntries(['stage_mismatch', 'quantity_not_in_source', 'example_not_in_source', 'verb_not_in_source', 'garbled_clause', 'describes_course_not_outcome', 'near_duplicate', 'triplet_near_identical'].map(f => [f, flagCounts[f] || 0])) })
}
console.table(summary)
