#!/usr/bin/env node
// Cut the 2025 revision text into standards (one content unit within one stage) and their indicators.
// Usage: node scripts/v2/build_units.mjs <slug>  →  generated/v2/units/<slug>.json
//
// Each subject says how to recognise a unit in the source catalogue, which official sentence states the
// standard, and which sections give its indicators (see docs/STANDARDS_METHOD_V2.md §2). Every sentence keeps
// its PDF page and a check status:
//   verified  — same text in the 2022 edition, read from a different scan, so the OCR is cross-checked
//   revised   — changed by the 2025 revision; the 2022 text is kept for comparison
//   ocr_doubt — the two scans disagree on single characters; needs a look at the PDF (docs/data/v2/ocr-fixes/)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { RULES } from './subject_rules.mjs'
import { SUBJECT_NAMES, SUBJECT_PREFIX, STAGES, stageCode, gradesOf, loadCatalog, revisionIndex, joinBroken, tidy, loadOcrFixes, applyFixes, splitSentences, readTsv, paragraphs, strip } from './lib.mjs'

const slug = process.argv[2]
if (!SUBJECT_NAMES[slug]) throw new Error('usage: build_units.mjs <slug>')

const taskName = t => String(t || '').replace(/^(?:学习)?任务群\s*\d+[：:]/u, '').replace(/\s/gu, '')
const LABOR_CATEGORY = {
    清洁与卫生: '日常生活劳动', 整理与收纳: '日常生活劳动', 烹饪与营养: '日常生活劳动', 家用器具使用与维护: '日常生活劳动',
    农业生产劳动: '生产劳动', 传统工艺制作: '生产劳动', 工业生产劳动: '生产劳动', 新技术体验与应用: '生产劳动',
    现代服务业劳动: '服务性劳动', 公益劳动与志愿服务: '服务性劳动'
}

export const CONFIG = {
    labor: {
        unit: e => (e.part === '课程内容' && e.stage && e.topic?.length && /任务群/u.test(e.topic[e.topic.length - 1]) ? taskName(e.topic[e.topic.length - 1]) : null),
        statementSection: '素养表现',
        indicatorSections: ['内容要求', '素养表现'],
        guidanceSections: ['活动建议'],
        level1: unit => LABOR_CATEGORY[unit],
        level2: unit => unit,
        abbr: { 日常生活劳动: 'DL', 生产劳动: 'PL', 服务性劳动: 'SL' }
    }
}

const revision = revisionIndex(slug)
const fixes = loadOcrFixes(slug)
const fixesUsed = new Set()
const check = ids => {
    const hits = ids.map(id => revision.get(id)).filter(Boolean)
    if (!hits.length) return { status: 'verified' }
    const real = hits.find(h => !h.ocr_suspect)
    if (real) return { status: 'revised', type: real.type, text_2022: real.text_2022, page_2022: real.page_2022, changes: real.changes }
    return { status: 'ocr_doubt', changes: hits.flatMap(h => h.changes) }
}

const RANK = { verified: 0, ocr_doubt: 1, revised: 2 }
const worse = (a, b) => (RANK[b.status] > RANK[a.status] ? b : a)

function buildLabor() {
const cfg = CONFIG.labor
const entries = loadCatalog('2025r', slug)
    .map(e => ({ ...e, topicKey: cfg.unit(e) }))
    .filter(e => e.topicKey && [...cfg.indicatorSections, cfg.statementSection, ...cfg.guidanceSections].includes(e.section))

const units = new Map()
for (const e of entries) {
    const key = `${e.stage}|${e.topicKey}`
    if (!units.has(key)) units.set(key, { stage: e.stage, unit: e.topicKey, entries: [] })
    units.get(key).entries.push(e)
}

const counters = new Map()
const standards = []
for (const u of units.values()) {
    // Join broken lines, apply checked OCR fixes, re-split, then fold 「例如：……」 runs into the sentence they illustrate.
    const raw = joinBroken(u.entries).flatMap(s => splitSentences(applyFixes(tidy(s.text), fixes, fixesUsed)).map(text => ({ text, section: s.section, pages: s.pages, ids: s.ids, check: check(s.ids) })))
    const sentences = []
    let inExample = false
    for (const s of raw) {
        const prev = sentences[sentences.length - 1]
        if (/^(例如|比如|如)[：:]/u.test(s.text) && prev && prev.section === s.section) inExample = true
        if (inExample && prev && prev.section === s.section) {
            prev.official_examples = (prev.official_examples || '') + s.text
            prev.example_ids = [...new Set([...(prev.example_ids || []), ...s.ids])]
            if (/。$/u.test(s.text)) inExample = false
            continue
        }
        inExample = false
        sentences.push({ ...s })
    }
    const statementIndex = sentences.findIndex(s => s.section === cfg.statementSection)
    const statement = sentences[statementIndex]
    const l1 = cfg.level1(u.unit)
    const sc = stageCode(slug, u.stage)
    const counterKey = `${sc}|${l1}`
    counters.set(counterKey, (counters.get(counterKey) || 0) + 1)
    const code = `${SUBJECT_PREFIX[slug]}-${sc}-${cfg.abbr[l1]}-${String(counters.get(counterKey)).padStart(2, '0')}`
    const indicators = sentences
        .filter((s, i) => i !== statementIndex && cfg.indicatorSections.includes(s.section))
        .map((s, i) => ({ code: `${code}.${i + 1}`, text: s.text, section: s.section, pages: s.pages, source_ids: s.ids, check: s.check, ...(s.official_examples ? { official_examples: s.official_examples, official_example_ids: s.example_ids } : {}) }))
    standards.push({
        code, subject: SUBJECT_NAMES[slug], subject_slug: slug, stage: u.stage, stage_code: sc, grades: gradesOf(u.stage),
        level1: l1, level2: cfg.level2(u.unit), title: `${cfg.level2(u.unit)}（${u.stage.replace('-', '–')} 年级）`,
        statement: statement?.text || '', statement_source: statement ? 'official' : 'missing', statement_section: statement?.section || null,
        statement_pages: statement?.pages || [], statement_source_ids: statement?.ids || [], statement_check: statement?.check || null,
        indicators,
        guidance: sentences.filter(s => cfg.guidanceSections.includes(s.section)).map(s => ({ text: s.text, section: s.section, pages: s.pages, check: s.check }))
    })
}
return { standards }
}


// 数学. Primary: one standard per 学段 × 主题, its 要点 are the 学业要求 paragraphs; 综合与实践 keeps the general
// paragraph as the statement and each 主题活动 as a 要点. Junior: one standard per 内容要求 sub-topic (有理数, 一次函数 …),
// found by the first item of each sub-topic (docs/data/v2/units/math.tsv); its 要点 are the 内容要求 items, with grades
// from the textbook (docs/data/v2/grades/math.tsv). Statements without an official summary sentence are kebiao
// summaries (docs/data/v2/summaries/math.tsv).
const MATH_AREAS = { 数与代数: 'NA', 图形与几何: 'GG', 统计与概率: 'SP', 综合与实践: 'IP' }
function buildMath() {
    const problems = []
    const summaries = new Map(readTsv('docs/data/v2/summaries/math.tsv').map(([stage, unit, text]) => [`${stage}|${unit}`, text]))
    const anchors = readTsv('docs/data/v2/units/math.tsv').map(([theme, unit, anchor]) => ({ theme, unit, anchor: strip(anchor) }))
    const gradeRules = readTsv('docs/data/v2/grades/math.tsv').map(([unit, pattern, grade, basis]) => ({ unit, any: pattern === '*', re: pattern === '*' ? null : new RegExp(pattern, 'u'), grade: +grade, basis }))
    const used = new Set()
    // Footnotes printed at the page bottom end up glued to a body line: "……确定一次［1］标有*的内容为选学内容……".
    const byId = new Map()
    const lines = loadCatalog('2025r', 'math')
        .filter(e => e.part === '课程内容' && e.stage && ['内容要求', '学业要求'].includes(e.section))
        .map(e => ({ ...e, text: e.text.replace(/［\d］[^［]*$/u, '').trim() }))
        .filter(e => e.text)
        // Sub-topic headings such as "（2）一次函数" (OCR: "（5圆") carry no text of their own.
        .filter(e => { const head = `${e.marker || ''}${e.text}`.match(/^（\d+）?\s*(.*)$/u); return !(head && /^（\d/u.test(`${e.marker || ''}${e.text}`) && !/[。；，]/u.test(head[1]) && head[1].length <= 12) })
    lines.forEach(e => byId.set(e.id, e))
    const clean = text => {
        const refs = []
        let t = applyFixes(tidy(text), fixes, fixesUsed)
            .replace(/（\s*例\s*(\d+)(?:\s*和\s*例\s*(\d+))?\s*）/gu, (m, a, b) => { refs.push(+a); if (b) refs.push(+b); return '' })
        return { text: t, example_refs: refs }
    }
    const paraKey = e => `${e.stage}|${e.section}|${e.topic.join('>')}`
    const make = (p, extra = {}) => {
        const { text, example_refs } = clean(p.text)
        return { text, pages: p.pages, source_ids: p.ids, check: check(p.ids), ...(example_refs.length ? { example_refs } : {}), ...extra }
    }
    const units = []
    // Primary.
    const primary = paragraphs(lines.filter(e => e.stage !== '7-9' && e.section === '学业要求'), paraKey)
    const byUnit = new Map()
    for (const p of primary) {
        const area = p.topic[0]
        const unit = p.topic[1] || area
        const key = `${p.stage}|${unit}`
        if (!byUnit.has(key)) byUnit.set(key, { stage: p.stage, area, unit, paras: [] })
        byUnit.get(key).paras.push(p)
    }
    for (const u of byUnit.values()) {
        if (u.area === '综合与实践') {
            const [general, ...themes] = u.paras
            const statement = make(general)
            // Each 主题活动 starts with its name ("年、月、日的秘密。"); a paragraph without a name continues the one before.
            const indicators = []
            for (const p of themes) {
                const ind = make(p)
                const m = ind.text.match(/^([^，。；：]{2,12})。(.+)$/u)
                const prev = indicators[indicators.length - 1]
                if (m) indicators.push({ ...ind, label: m[1], text: m[2] })
                else if (prev) Object.assign(prev, { text: prev.text + ind.text, pages: [...new Set([...prev.pages, ...ind.pages])], source_ids: [...prev.source_ids, ...ind.source_ids], check: worse(prev.check, ind.check) })
                else indicators.push(ind)
            }
            units.push({ ...u, statement: { ...statement, source: 'official', section: '学业要求' }, indicators })
        } else {
            // One 要点 per sentence of a 学业要求 paragraph; a closing clause on 素养 ("形成运算能力。") stays with the
            // sentence before it.
            const indicators = []
            for (const p of u.paras) {
                let group = null
                const groups = []
                for (const id of p.ids) {
                    const e = byId.get(id)
                    if (!group) { group = { text: '', ids: [], pages: [] }; groups.push(group) }
                    group.text += e.text
                    group.ids.push(id)
                    if (!group.pages.includes(e.page)) group.pages.push(e.page)
                    if (/。$/u.test(e.text)) group = null
                }
                for (const g of groups) {
                    const prev = indicators[indicators.length - 1]
                    if (prev && prev.para === p.para && /^(形成|发展|进一步发展|逐步|初步形成|提高)/u.test(g.text)) {
                        Object.assign(prev, { text: prev.text + g.text, ids: [...prev.ids, ...g.ids], pages: [...new Set([...prev.pages, ...g.pages])] })
                    } else indicators.push({ ...g, para: p.para })
                }
            }
            units.push({ ...u, indicators: indicators.map(g => make(g)) })
        }
    }
    // Junior.
    const junior = paragraphs(lines.filter(e => e.stage === '7-9' && e.section === '内容要求'), paraKey)
    let current = null
    for (const p of junior) {
        const area = p.topic[0]
        const theme = p.topic[1] || area
        // OCR reads circled numbers ⑩⑪⑫ as "10" "1" "12", and "（3）" as "（3 ".
        const body = p.text.replace(/^(?:1\d|20|[1-9])(?=[一-鿿*])/u, '').replace(/^（\d{1,2}\s*）?/u, '')
        const hit = anchors.find(a => a.theme === theme && (i => i >= 0 && i < 12)(strip(body).indexOf(a.anchor)))
        if (hit) {
            used.add(hit.unit)
            current = { stage: '7-9', area, theme, unit: hit.unit, paras: [], requirements: [] }
            units.push(current)
            // A heading glued to the first item ("图形的旋转通过具体实例……") is cut off.
            const at = body.indexOf(hit.anchor.slice(0, 4))
            p.text = at > 0 && body.slice(0, at).replace(/[（）\d]/gu, '') === hit.unit.replace(/[、，]/gu, '') ? body.slice(at) : body
        } else p.text = body
        if (!current || current.theme !== theme) { problems.push(`no unit for junior paragraph ${p.para}: ${p.text.slice(0, 30)}`); continue }
        current.paras.push(p)
    }
    for (const a of anchors) if (!used.has(a.unit)) problems.push(`anchor not found: ${a.unit} 「${a.anchor}」`)
    const gradesFor = (unit, text) => {
        const rules = gradeRules.filter(r => r.unit === unit)
        let hits = rules.filter(r => r.re && r.re.test(text))
        if (!hits.length) hits = rules.filter(r => r.any)
        if (!hits.length) return { grades: [7, 8, 9], grade_basis: null }
        return { grades: [...new Set(hits.map(r => r.grade))].sort(), grade_basis: [...new Set(hits.map(r => r.basis))].join('；') }
    }
    for (const u of units.filter(u => u.stage === '7-9')) {
        u.indicators = u.paras.map(p => {
            const ind = make(p)
            return { ...ind, ...gradesFor(u.unit, ind.text), ...(ind.text.startsWith('*') ? { optional: true } : {}) }
        })
    }
    // Junior 学业要求: 数与代数 has one paragraph per sub-topic, which starts with the sub-topic name; the other
    // 主题 have one passage for the whole 主题, kept with the 主题 unless it has a single unit.
    const themeRequirements = []
    const juniorReq = paragraphs(lines.filter(e => e.stage === '7-9' && e.section === '学业要求'), paraKey)
    let reqUnit = null
    for (const p of juniorReq) {
        const area = p.topic[0]
        const theme = p.topic[1] || area
        const inTheme = units.filter(u => u.stage === '7-9' && u.theme === theme)
        const named = inTheme.find(u => p.text.startsWith(u.unit) && /^(能|理解|了解|会|结合|知道|探索|掌握|通过|借助)/u.test(p.text.slice(u.unit.length)))
        if (named) { reqUnit = named; p.text = p.text.slice(named.unit.length) }
        else if (inTheme.length === 1) reqUnit = inTheme[0]
        else if (!reqUnit || reqUnit.theme !== theme) reqUnit = null
        const item = make(p)
        if (reqUnit) reqUnit.requirements.push(item)
        else themeRequirements.push({ stage: '7-9', level1: area, theme, ...item })
    }
    // Statements, codes, output.
    const order = Object.keys(MATH_AREAS)
    units.sort((a, b) => a.stage.localeCompare(b.stage) || order.indexOf(a.area) - order.indexOf(b.area))
    const counters = new Map()
    const standards = units.map(u => {
        const sc = stageCode('math', u.stage)
        const ck = `${sc}|${u.area}`
        counters.set(ck, (counters.get(ck) || 0) + 1)
        const code = `MA-${sc}-${MATH_AREAS[u.area]}-${String(counters.get(ck)).padStart(2, '0')}`
        const summary = summaries.get(`${u.stage}|${u.unit}`)
        if (!u.statement && !summary) problems.push(`no statement: ${u.stage} ${u.unit}`)
        const st = u.statement || { text: summary || '', source: summary ? 'kebiao_summary' : 'missing' }
        return {
            code, subject: '数学', subject_slug: 'math', stage: u.stage, stage_code: sc, grades: gradesOf(u.stage),
            level1: u.area, ...(u.theme && u.theme !== u.unit ? { theme: u.theme } : {}), level2: u.unit,
            title: `${u.unit}（${u.stage.replace('-', '–')} 年级）`,
            statement: st.text, statement_source: st.source, statement_section: st.section || null,
            statement_pages: st.pages || [], statement_source_ids: st.source_ids || [], statement_check: st.check || null,
            indicators: u.indicators.map((ind, i) => ({ code: `${code}.${i + 1}`, section: u.stage === '7-9' ? '内容要求' : '学业要求', ...ind })),
            ...(u.requirements?.length ? { requirements: u.requirements } : {}),
            guidance: []
        }
    })
    if (problems.length) console.log('problems:\n  ' + problems.join('\n  '))
    return { standards, theme_requirements: themeRequirements }
}


// Shared builder for the subjects that follow one shape: a unit (学段 × 模块/主题) has numbered 内容要求 items and a
// 学业要求 passage. Each subject's rules live in scripts/v2/subject_rules.mjs:
//   unitOf(e)  → { area, unit, theme?, role } for a catalogue line, or null. role: item (要点), req (学业要求, shown
//                under the standard), intro (module introduction, may hold the statement), activity (one 要点 per
//                topic, e.g. 跨学科主题), statement (lines that state the standard)
//   split      → 'items' (one 要点 per numbered item) or 'sentences' (unnumbered prose, one 要点 per sentence)
//   statement  → { from: 'intro', start: /regex/ } | { from: 'statement' } | summary (docs/data/v2/summaries/<slug>.tsv)
function buildGeneric() {
    const cfg = RULES[slug]
    const problems = []
    const summaries = new Map(readTsv(`docs/data/v2/summaries/${slug}.tsv`).map(([stage, unit, text]) => [`${stage}|${unit}`, text]))
    const gradeRules = readTsv(`docs/data/v2/grades/${slug}.tsv`).map(([unit, pattern, grade, basis]) => ({ unit, any: pattern === '*', re: pattern === '*' ? null : new RegExp(pattern, 'u'), grades: grade.split(/[,，、]/u).map(Number), basis }))
    const byId = new Map()
    const rawLines = loadCatalog('2025r', slug)
        .filter(e => e.stage)
        .map(e => ({ ...e, text: e.text.replace(/［\d］[^［]*$/u, '').trim() }))
        .filter(e => e.text)
    const lines = rawLines
        .filter(e => { const head = `${e.marker || ''}${e.text}`.match(/^（\d+）?\s*(.*)$/u); return !(head && /^（\d/u.test(`${e.marker || ''}${e.text}`) && !/[。；，]/u.test(head[1]) && head[1].length <= 12) })
    lines.forEach(e => byId.set(e.id, e))
    const clean = text => {
        const refs = []
        const t = applyFixes(tidy(text), fixes, fixesUsed)
            .replace(/（\s*例\s*(\d+)(?:\s*[和至]\s*例\s*(\d+))?\s*）/gu, (m, a, b) => { refs.push(+a); if (b) refs.push(+b); return '' })
            .replace(/^(?:1\d|20|[0-9])(?=[一-鿿*])/u, '').replace(/^[@©D](?=[一-鿿])/u, '').replace(/^（\d{1,2}\s*）?/u, '').replace(/^\d{1,2}）/u, '')
        return { text: t, example_refs: refs }
    }
    const make = (p, extra = {}) => {
        const { text, example_refs } = clean(p.text)
        return { text, pages: p.pages, source_ids: p.ids, check: check(p.ids), ...(example_refs.length ? { example_refs } : {}), ...extra }
    }
    // Items the source catalogue filed under the wrong unit (docs/data/v2/units/<slug>-moves.tsv): every line of
    // the paragraph that starts with the given text goes to the named unit.
    const moved = new Map()
    for (const [stage, start, to] of readTsv(`docs/data/v2/units/${slug}-moves.tsv`)) {
        const first = lines.find(e => e.stage === stage && strip(e.text).startsWith(strip(start)))
        if (!first) { problems.push(`move: no line starts with 「${start}」 in ${stage}`); continue }
        lines.filter(e => e.stage === stage && e.para === first.para).forEach(e => moved.set(e.id, to))
    }
    // Units in source order.
    const units = new Map()
    const stopped = new Set()
    const skipped = []
    const headings = new Map()
    const intros = new Map()
    const reachedContent = new Set()
    // Outline rules see the heading lines too (rawLines), which the line filter above drops.
    const prepared = cfg.prepare ? cfg.prepare(rawLines, { readTsv, strip }) : null
    for (const e0 of lines) {
        let e = e0
        const base = prepared ? prepared.get(e.id) || null : cfg.unitOf(e)
        if (base?.text !== undefined || base?.para !== undefined) { e = { ...e, ...(base.text !== undefined ? { text: base.text } : {}), ...(base.para !== undefined ? { para: base.para } : {}) }; byId.set(e.id, e) }
        if (prepared && base && (base.role === 'heading' || base.role === 'other')) {
            const k = `${base.stage || e.stage}|${base.area}|${base.unit}`
            if (base.role === 'heading') { if (!headings.has(k)) headings.set(k, []); headings.get(k).push(e) }
            skipped.push({ id: e.id, why: base.role })
            continue
        }
        const u = base && moved.has(e.id) ? { ...base, area: moved.get(e.id), unit: moved.get(e.id) } : base
        if (!u) continue
        // Topic introductions: the lines of a topic before its first 内容要求 (the catalogue carries the previous
        // section's label onto them).
        const topicKey = `${u.area}|${u.unit}`
        if (cfg.topicIntro) {
            if (e.section === '内容要求') reachedContent.add(topicKey)
            if (!reachedContent.has(topicKey)) { if (!intros.has(topicKey)) intros.set(topicKey, []); intros.get(topicKey).push(e); skipped.push({ id: e.id, why: 'intro' }); continue }
        }
        if (u.role === 'other') continue
        const stage = u.stage || e.stage
        const key = `${stage}|${u.area}|${u.unit}`
        // A section heading the catalogue missed ("教学提示⋯", "教学策略建议……") ends the section for this unit;
        // text before it on the same line is kept.
        if (stopped.has(`${key}|${e.section}`)) { skipped.push({ id: e.id, why: 'other section' }); continue }
        const stopAt = cfg.stopAt ? e.text.search(cfg.stopAt) : -1
        if (stopAt >= 0) {
            stopped.add(`${key}|${e.section}`)
            if (stopAt === 0) { skipped.push({ id: e.id, why: 'other section' }); continue }
            e = { ...e, text: e.text.slice(0, stopAt) }
            byId.set(e.id, e)
        }
        if (!units.has(key)) units.set(key, { stage, area: u.area, unit: u.unit, theme: u.theme, grades: u.grades || null, lines: [] })
        units.get(key).lines.push({ ...e, stage, role: u.role, group: u.group || null, attachTo: u.attachTo || null })
    }
    // Grade headings inside a stage ("6年级" … "7年级") put the 要点 that follow in that grade.
    if (cfg.gradeMarker) for (const u of units.values()) {
        let grade = null
        u.lines = u.lines.filter(e => { const m = e.text.trim().match(cfg.gradeMarker); if (m && e.role === 'item') { grade = +m[1]; skipped.push({ id: e.id, why: 'grade heading' }); return false } e.grade = e.role === 'item' ? grade : null; return true })
    }
    const paraKey = e => `${e.stage}|${e.section}|${e.role}|${e.group || ''}`
    const sentenceUnits = (paras, end = /[。！？]$/u) => {
        const out = []
        for (const p of paras) {
            let group = null
            for (const id of p.ids) {
                const e = byId.get(id)
                if (!group) { group = { text: '', ids: [], pages: [], para: p.para, tail: false }; out.push(group) }
                group.text += e.text
                group.ids.push(id)
                if (!group.pages.includes(e.page)) group.pages.push(e.page)
                if (end.test(e.text)) group = null
            }
        }
        // A closing clause on 素养 ("形成……。") stays with the sentence before it.
        const merged = []
        for (const g of out) {
            const prev = merged[merged.length - 1]
            if (prev && prev.para === g.para && /^(形成|发展|进一步发展|逐步形成|初步形成|提高|提升|增强|培养)/u.test(g.text)) Object.assign(prev, { text: prev.text + g.text, ids: [...prev.ids, ...g.ids], pages: [...new Set([...prev.pages, ...g.pages])] })
            else merged.push(g)
        }
        return merged
    }
    // Grade rules name a unit, a level-1 area, or "*" (every unit).
    const gradesFor = ({ unit, area }, text) => {
        const own = r => r.unit === unit || r.unit === area
        const rules = gradeRules.filter(r => own(r) || r.unit === '*')
        let hits = rules.filter(r => r.re && r.re.test(text))
        if (!hits.length) hits = rules.filter(r => r.any && own(r))
        if (!hits.length) hits = rules.filter(r => r.any && r.unit === '*')
        if (!hits.length) return { grades: [7, 8, 9], grade_basis: null }
        return { grades: [...new Set(hits.flatMap(r => r.grades))].sort(), grade_basis: [...new Set(hits.map(r => r.basis))].join('；') }
    }
    const stageReq = cfg.stageRequirement ? lines.filter(cfg.stageRequirement) : []
    const built = []
    for (const u of units.values()) {
        const role = r => u.lines.filter(e => e.role === r)
        const itemParas = paragraphs(role('item'), e => `${paraKey(e)}|${e.grade ?? ''}`)
        let indicators = (cfg.split === 'sentences' ? sentenceUnits(itemParas) : cfg.split === 'clauses' ? sentenceUnits(itemParas, /[。；！？]$/u) : itemParas).map(p => {
            const grade = byId.get(p.ids[0]) && u.lines.find(e => e.id === p.ids[0])?.grade
            return make(p, grade ? { grades: [grade], grade_basis: '课标原文按年级列出' } : u.grades ? { grades: u.grades, grade_basis: '课标原文：7 年级学习任务' } : {})
        })
        // Activities: one 要点 per named topic (its name is the label).
        const acts = new Map()
        for (const e of role('activity')) { if (!acts.has(e.group)) acts.set(e.group, []); acts.get(e.group).push(e) }
        for (const [name, es] of acts) {
            const keep = es.filter(e => !(cfg.activityNote && cfg.activityNote.test(e.text)))
            if (!keep.length) continue
            indicators.push(make({ text: keep.map(e => e.text).join(''), ids: keep.map(e => e.id), pages: [...new Set(keep.map(e => e.page))] }, { label: name }))
        }
        // Official examples ("例1 ……") join the 要点 they illustrate.
        for (const e of role('example')) {
            const ind = indicators.find(i => i.source_ids.includes(e.attachTo))
            if (!ind) { problems.push(`example without 要点: ${e.text.slice(0, 20)}`); continue }
            ind.official_examples = (ind.official_examples || '') + clean(e.text).text
            ind.official_example_ids = [...(ind.official_example_ids || []), e.id]
        }
        if (cfg.dropIndicator) indicators = indicators.filter(i => { if (!cfg.dropIndicator.test(i.text)) return true; i.source_ids.forEach(id => skipped.push({ id, why: 'lead-in or note' })); return false })
        const requirements = paragraphs(role('req'), paraKey).map(p => make(p, { section: p.section }))
        // Statement.
        let statement = null
        const sc = (typeof cfg.statement === 'function' ? cfg.statement(u) : cfg.statement) || {}
        if (sc.from === 'intro') {
            const intro = role('intro')
            const start = intro.findIndex(e => sc.start.test(e.text))
            if (start >= 0) {
                const picked = []
                for (let i = start; i < intro.length; i += 1) { picked.push(intro[i]); if (/。$/u.test(intro[i].text)) break }
                statement = { ...make({ text: picked.map(e => e.text).join(''), ids: picked.map(e => e.id), pages: [...new Set(picked.map(e => e.page))] }), source: 'official', section: sc.section || '模块说明' }
            }
        } else if (sc.from === 'topicIntro') {
            const intro = intros.get(`${u.area}|${u.unit}`) || []
            if (intro.length) {
                const sentences = sentenceUnits(paragraphs(intro.map(e => ({ ...e, role: 'intro' })), e => 'intro'))
                const first = (sc.pick && sentences.find(x => sc.pick.test(x.text))) || sentences[0]
                statement = { ...make(first), source: 'official', section: sc.section || '学习任务说明' }
            }
        } else if (sc.from === 'heading') {
            const h = headings.get(`${u.stage}|${u.area}|${u.unit}`) || []
            // sc.cut drops a lead-in that follows the heading ("在这类……可供选择的项目如下。").
            const text = h.map(e => e.text).join('').replace(sc.cut || /$^/u, '')
            if (h.length) statement = { ...make({ text, ids: h.map(e => e.id), pages: [...new Set(h.map(e => e.page))] }), source: 'official', section: sc.section || '内容要求' }
        } else if (sc.from === 'statement') {
            const st = role('statement')
            if (st.length) {
                const first = sentenceUnits(paragraphs(st, paraKey))[0]
                statement = { ...make(first), source: 'official', section: sc.section || st[0].section }
            }
        }
        if (!statement) {
            const summary = summaries.get(`${u.stage}|${u.unit}`) || summaries.get(`${u.stage}|${u.area}·${u.unit}`)
            statement = summary ? { text: summary, source: 'kebiao_summary' } : { text: '', source: 'missing' }
            if (!summary) problems.push(`no statement: ${u.stage} ${u.unit}`)
        }
        if (u.stage === '7-9' && cfg.junior !== 'none') indicators = indicators.map(i => ({ ...i, ...(i.grades ? {} : gradesFor(u, i.text)), ...(i.text.startsWith('*') ? { optional: true } : {}) }))
        if (!indicators.length) problems.push(`no 要点: ${u.stage} ${u.unit}`)
        built.push({ ...u, statement, indicators, requirements })
    }
    const areaOrder = Object.keys(cfg.areas)
    const stageOrder = Object.keys(STAGES[slug] || STAGES.default)
    built.sort((a, b) => stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage) || areaOrder.indexOf(a.area) - areaOrder.indexOf(b.area))
    const counters = new Map()
    const standards = built.filter(u => u.indicators.length).map(u => {
        const sc = stageCode(slug, u.stage)
        if (!cfg.areas[u.area]) problems.push(`no code for area ${u.area}`)
        const ck = `${sc}|${u.area}`
        counters.set(ck, (counters.get(ck) || 0) + 1)
        const code = `${SUBJECT_PREFIX[slug]}-${sc}-${cfg.areas[u.area]}-${String(counters.get(ck)).padStart(2, '0')}`
        const st = u.statement
        return {
            code, subject: SUBJECT_NAMES[slug], subject_slug: slug, stage: u.stage, stage_code: sc, grades: gradesOf(u.stage),
            level1: u.area, ...(u.theme && u.theme !== u.unit ? { theme: u.theme } : {}), level2: u.unit,
            title: cfg.title ? cfg.title(u) : `${u.unit}（${u.stage.replace('-', '–')} 年级）`,
            statement: st.text, statement_source: st.source, statement_section: st.section || null,
            statement_pages: st.pages || [], statement_source_ids: st.source_ids || [], statement_check: st.check || null,
            indicators: u.indicators.map((ind, i) => ({ code: `${code}.${i + 1}`, section: cfg.itemSection || '内容要求', ...ind })),
            ...(u.requirements.length ? { requirements: u.requirements } : {}),
            guidance: []
        }
    })
    // Stage-wide 学业要求 go to the stage overview.
    const themeRequirements = paragraphs(stageReq.map(e => ({ ...e, role: 'stage' })), e => `${e.stage}|${(e.topic || [])[0] || ''}`).filter(p => !(cfg.dropStageRequirement && cfg.dropStageRequirement.test(p.text))).map(p => ({ stage: p.stage, level1: p.topic[0] || null, theme: p.topic[0] ? `${p.topic[0]} · 学业要求` : '本学段学业要求', ...make(p) }))
    if (problems.length) console.log('problems:\n  ' + problems.join('\n  '))
    return { standards, theme_requirements: themeRequirements, skipped_source_ids: skipped }
}

const BUILDERS = { labor: buildLabor, math: buildMath, ...Object.fromEntries(Object.keys(RULES).map(k => [k, buildGeneric])) }
if (!BUILDERS[slug]) throw new Error(`no unit rules for ${slug} yet`)
const { standards, ...extra } = BUILDERS[slug]()
mkdirSync('generated/v2/units', { recursive: true })
writeFileSync(`generated/v2/units/${slug}.json`, JSON.stringify({ subject_slug: slug, subject: SUBJECT_NAMES[slug], source_version: '2022年版2025年修订', standards, ...extra }, null, 1))
const all = standards.flatMap(s => [s.statement_check, ...s.indicators.map(i => i.check)]).filter(Boolean)
const count = st => all.filter(c => c.status === st).length
const unusedFixes = fixes.filter(([find, , , file]) => file !== '_global' && !fixesUsed.has(find)).map(([find]) => find)
if (unusedFixes.length) console.log(`unused OCR fixes: ${unusedFixes.join(' | ')}`)
console.log(`${slug}: ${standards.length} standards, ${standards.reduce((n, s) => n + s.indicators.length, 0)} indicators; checks: verified ${count('verified')}, revised ${count('revised')}, ocr_doubt ${count('ocr_doubt')}; missing statement ${standards.filter(s => !s.statement).length}`)
