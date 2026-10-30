#!/usr/bin/env node
// Check the v2 subject files against the source text and the old records.
// Usage: node scripts/v2/validate_v2.mjs [slug ...]   (default: every subject in data/v2/by_subject)
// Errors fail the run; warnings list what still needs a human look.
//   verbatim   — each 要点 matches its source lines in the 2025 revision (dice ≥ 0.95, after the checked OCR fixes) and has a page
//   coverage   — every official clause of the anchor layer is used by some standard, 要点 or 学业要求
//   structure  — every standard has a statement and ≥ 1 要点; codes are unique and well formed; stages are the subject's own
//   legacy     — every old code has a destination, and the destination exists
//   grades     — junior 要点 grades sit inside 7–9 and name their textbook basis
//   review     — revised / OCR-doubt sentences not yet listed in docs/data/v2/reviewed/<slug>.tsv (warning)
//   wording    — kebiao summaries use the subject's own words (bigram recall ≥ 0.9, warning)
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { RULES } from './subject_rules.mjs'
import { SUBJECT_PREFIX, STAGES, loadCatalog, loadOcrFixes, applyFixes, tidy, grams, recall, dice, readTsv, strip } from './lib.mjs'

// Which catalogue clauses each subject promises to cover (docs/STANDARDS_METHOD_V2.md §2).
// Subjects on the shared builder promise every line their rules give a 要点, 学业要求 or activity role.
const ruled = (slug, catalog) => {
    if (!RULES[slug]) return null
    const prepared = RULES[slug].prepare ? RULES[slug].prepare(catalog, { readTsv, strip }) : null
    return e => { const u = prepared ? prepared.get(e.id) : (e.part === '课程内容' ? RULES[slug].unitOf(e) : null); return Boolean(u && ['item', 'req', 'activity', 'example'].includes(u.role) && !(RULES[slug].activityNote && RULES[slug].activityNote.test(e.text))) }
}
const COVERAGE = {
    labor: e => e.part === '课程内容' && ['内容要求', '素养表现'].includes(e.section),
    math: e => e.part === '课程内容' && (e.section === '学业要求' || (e.stage === '7-9' && e.section === '内容要求'))
}
const SUSPECT = /[A-Za-z%"”［］�•]/u
const FORMULA = /pH|DNA|X射线|[HCNOPSKI]、|I等|Na|Al|Si|Cl|Ca|Fe|Cu|Ag|一二•九|\d+%|y=k\/x|y=kx\+b|y=kx|y\/x=k|y=a\(x−h\)²\+k|\(a[+±−]b\)[^，]*|sinA|cosA|tanA|k[≠＞＜]0|“[^”]*”/gu

const slugs = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync('data/v2/by_subject').map(f => f.replace(/\.json$/u, ''))
let errorCount = 0
for (const slug of slugs) {
    const errors = []
    const warnings = []
    const data = JSON.parse(readFileSync(`data/v2/by_subject/${slug}.json`, 'utf8'))
    const overview = existsSync(`data/v2/stage_overview/${slug}.json`) ? JSON.parse(readFileSync(`data/v2/stage_overview/${slug}.json`, 'utf8')) : {}
    const legacyMap = JSON.parse(readFileSync(`data/v2/legacy/${slug}.json`, 'utf8'))
    const oldRecords = existsSync(`data/internal/by_subject/${slug}.json`) ? JSON.parse(readFileSync(`data/internal/by_subject/${slug}.json`, 'utf8')).standards : []
    const catalog = loadCatalog('2025r', slug)
    const byId = new Map(catalog.map(e => [e.id, e]))
    const fixes = loadOcrFixes(slug)
    const reviewedTexts = readTsv(`docs/data/v2/reviewed/${slug}.tsv`).map(([text]) => text)
    const isReviewed = text => reviewedTexts.some(r => text.includes(r))
    const sourceText = ids => applyFixes(tidy(ids.map(id => byId.get(id)?.text || '').join('')), fixes)
    const subjectGrams = grams(catalog.map(e => e.text).join(''))

    // Structure and codes.
    const codes = new Set()
    const used = new Set()
    const stageCodes = STAGES[slug] || STAGES.default
    const claim = code => { if (codes.has(code)) errors.push(`duplicate code ${code}`); codes.add(code) }
    for (const s of data.standards) {
        claim(s.code)
        const m = s.code.match(/^([A-Z]{2})-(S\d)-([A-Z]{2})-(\d{2})$/u)
        if (!m || m[1] !== SUBJECT_PREFIX[slug]) errors.push(`${s.code}: malformed code`)
        if (stageCodes[s.stage] !== s.stage_code || (m && m[2] !== s.stage_code)) errors.push(`${s.code}: stage ${s.stage} does not match ${s.stage_code}`)
        if (!s.statement) errors.push(`${s.code}: no statement`)
        if (!s.indicators.length) errors.push(`${s.code}: no 要点`)
        if (s.statement_source === 'official') {
            if (!s.statement_pages.length) errors.push(`${s.code}: official statement without a page`)
            s.statement_source_ids.forEach(id => used.add(id))
        } else if (s.statement_source === 'kebiao_summary') {
            // Bigrams within each clause, so a join across punctuation ("度量，掌握" → 量掌) does not count as a new word.
            const clauseGrams = new Map()
            for (const c of s.statement.split(/[，、；：。（）]/u)) for (const [k, v] of grams(c)) clauseGrams.set(k, (clauseGrams.get(k) || 0) + v)
            const r = recall(clauseGrams, subjectGrams)
            if (r < 0.9) warnings.push(`${s.code}: summary uses words not found in the 课标 (recall ${r.toFixed(2)})`)
        } else errors.push(`${s.code}: statement source ${s.statement_source}`)
        s.indicators.forEach((ind, i) => {
            claim(ind.code)
            if (ind.code !== `${s.code}.${i + 1}`) errors.push(`${ind.code}: expected ${s.code}.${i + 1}`)
            if (!ind.pages?.length) errors.push(`${ind.code}: no page`)
            if (!ind.source_ids?.length) { errors.push(`${ind.code}: no source lines`); return }
            ind.source_ids.forEach(id => used.add(id));
            (ind.official_example_ids || []).forEach(id => used.add(id))
            const src = sourceText(ind.source_ids)
            const d = Math.max(dice(grams(ind.text), grams(src)), recall(grams(ind.text), grams(src)))
            if (d < 0.95) errors.push(`${ind.code}: text differs from its source lines (${d.toFixed(2)})`)
            if (SUSPECT.test(ind.text.replace(FORMULA, ''))) warnings.push(`${ind.code}: suspicious characters — ${ind.text.slice(0, 40)}`)
            const status = ind.check?.status
            if (status && status !== 'verified' && !isReviewed(ind.text)) warnings.push(`${ind.code}: ${status}, not yet checked against the PDF`)
            if (s.stage === '7-9' && slug !== 'labor' && ind.grades) {
                if (ind.grades.some(g => g < 7 || g > 9)) errors.push(`${ind.code}: grade outside 7–9`)
                if (ind.grades.length < 3 && !ind.grade_basis) errors.push(`${ind.code}: grade without textbook basis`)
            }
            for (const ex of ind.examples || []) if (!ex.from) errors.push(`${ind.code}: example without its old code`)
        })
        for (const q of s.requirements || []) q.source_ids.forEach(id => used.add(id))
        for (const ex of s.examples || []) if (!ex.from) errors.push(`${s.code}: example without its old code`)
    }
    for (const q of overview.theme_requirements || []) q.source_ids.forEach(id => used.add(id))
    // Lines the builder drops on purpose: grade headings, task introductions, text after a missed section heading.
    for (const x of data.skipped_source_ids || []) used.add(x.id)

    // Coverage of the official clauses.
    const promised = COVERAGE[slug] || ruled(slug, catalog)
    if (!promised) warnings.push('no coverage rule for this subject')
    else {
        const missing = catalog.filter(e => e.stage && promised(e) && !used.has(e.id))
            .filter(e => !/^［\d］/u.test(e.text) && !/^（\d+）?[^。；，]{0,12}$/u.test(`${e.marker || ''}${e.text}`))
        for (const e of missing) errors.push(`uncovered ${e.id} p${e.page} ${e.section}: ${e.text.slice(0, 40)}`)
    }

    // Old codes.
    const mapped = new Map(legacyMap.map(m => [m.code, m]))
    for (const r of oldRecords) {
        const m = mapped.get(r.code)
        if (!m) { errors.push(`old code ${r.code} has no destination`); continue }
        if (m.kind === 'indicator' && !codes.has(m.anchor)) errors.push(`old code ${r.code} → missing 要点 ${m.anchor}`)
        if (['indicator', 'standard'].includes(m.kind) && !codes.has(m.to)) errors.push(`old code ${r.code} → missing standard ${m.to}`)
        if (['merged', 'removed'].includes(m.kind) && !codes.has(m.to) && !m.to.startsWith('/subjects/')) errors.push(`old code ${r.code} → missing target ${m.to}`)
    }

    const indicators = data.standards.reduce((n, s) => n + s.indicators.length, 0)
    console.log(`${slug}: ${data.standards.length} standards, ${indicators} 要点, ${oldRecords.length} old codes — ${errors.length} errors, ${warnings.length} warnings`)
    errors.forEach(e => console.log(`  ERROR ${e}`))
    warnings.forEach(w => console.log(`  warn  ${w}`))
    errorCount += errors.length
}
process.exit(errorCount ? 1 : 0)
