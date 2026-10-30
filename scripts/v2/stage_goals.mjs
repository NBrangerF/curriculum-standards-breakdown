#!/usr/bin/env node
// Rebuild each subject's 学段目标 (stage goals) from the 2025 revision for the subject overview.
// Usage: node scripts/v2/stage_goals.mjs <slug>   → generated/v2/goals/<slug>.json (and a summary)
//
// Prose subjects (数学、劳动、艺术) come from the source catalogue: lines are joined back into the official items
// (an item runs from one marker to the next, or for 数学 to the end of a sentence), with the subject's checked OCR
// fixes applied and the check status taken from the 2022/2025 comparison.
// Table subjects (信息科技、科学) are read from the OCR line boxes, because the catalogue reads their tables across
// columns; their items are marked status 'table' (以 PDF 为准).
// Spec: docs/data/v2/goals/<slug>.tsv — `drop <id>`, `note <id>` (an official note such as the 五四学制 rule),
// `fix <find> <replace>` (goal-only corrections checked against the PDF), `group <first words> <name>`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { applyFixes, loadCatalog, loadOcrFixes, readTsv, revisionIndex, tidy } from './lib.mjs'

const RANK = { verified: 0, ocr_doubt: 1, revised: 2 }
const STAGE_OF_LABEL = { '1~2': '1-2', '3~4': '3-4', '5~6': '5-6', '7~9': '7-9', '3~5': '3-5', '6~7': '6-7', '8~9': '8-9' }
const END = /[。！？]$/u

function spec(slug) {
    const rows = readTsv(`docs/data/v2/goals/${slug}.tsv`)
    const pick = kind => rows.filter(r => r[0] === kind)
    return {
        drop: new Set(pick('drop').map(r => r[1])),
        note: new Set(pick('note').map(r => r[1])),
        fixes: pick('fix').map(r => [r[1], r[2] ?? '', r[3]]),
        groups: pick('group').map(r => ({ starts: r[1], name: r[2] }))
    }
}

function checkOf(revision, ids) {
    let out = { status: 'verified' }
    for (const id of ids) {
        const h = revision.get(id)
        if (!h) continue
        const c = h.ocr_suspect ? { status: 'ocr_doubt', changes: h.changes } : { status: 'revised', type: h.type, text_2022: h.text_2022, page_2022: h.page_2022 }
        if (RANK[c.status] > RANK[out.status]) out = c
        else if (c.status === 'revised' && out.status === 'revised') out = { ...out, text_2022: `${out.text_2022}${c.text_2022}` }
    }
    return out
}

// The official note on how the 五四学制 stages relate to the 六三学制 ones, shown once under the goals.
const FOUR_FIVE = /^“五四”学制/u
function fourFiveNotes(slug, fixes) {
    const entries = loadCatalog('2025r', slug).filter(e => e.part === '课程目标')
    const notes = []
    let open = null
    for (const e of entries) {
        const text = applyFixes(tidy(e.text), fixes)
        if (FOUR_FIVE.test(text)) { open = { text, pages: [e.page], source_ids: [e.id] }; notes.push(open) } else if (open && !END.test(open.text)) {
            open.text += text
            open.source_ids.push(e.id)
            if (!open.pages.includes(e.page)) open.pages.push(e.page)
        } else open = null
    }
    return notes
}

// ---------- prose subjects: the source catalogue ----------
const MARKER = /^(?:（\d+）|\d+）|•)\s*/u
const CATALOGUE = {
    math: { split: 'sentence' },
    labor: { split: 'marker' },
    arts: { split: 'marker', heading: /^（\d）$/u }
}

function fromCatalogue(slug) {
    const cfg = CATALOGUE[slug]
    const s = spec(slug)
    const fixes = [...loadOcrFixes(slug), ...s.fixes]
    const revision = revisionIndex(slug)
    const entries = loadCatalog('2025r', slug).filter(e => e.part === '课程目标' && e.section === '学段目标' && e.stage)
    const groups = []
    const notes = []
    let group = null
    let item = null
    const open = (stage, name) => { group = { stage, group: name, items: [] }; groups.push(group); item = null }
    for (const e of entries) {
        const id = e.id.split(':').pop()
        if (s.drop.has(id)) continue
        let text = applyFixes(tidy(e.text), fixes)
        if (FOUR_FIVE.test(text)) continue
        if (s.note.has(id)) { notes.push({ text, pages: [e.page], source_ids: [e.id] }); continue }
        const marker = e.marker || text.match(MARKER)?.[0] || ''
        if (!e.marker && marker) text = text.slice(marker.length)
        if (!text) continue
        if (cfg.heading?.test(marker.trim()) && text.length <= 14 && !/[，。；]/u.test(text)) { open(e.stage, text.replace(/\s*•\s*/gu, '·')); continue }
        if (!group || group.stage !== e.stage) open(e.stage, null)
        const starts = cfg.split === 'marker' ? Boolean(marker) || !item : !item || END.test(item.text)
        if (starts) { item = { text, pages: [e.page], source_ids: [e.id] }; group.items.push(item) } else {
            item.text += text
            item.source_ids.push(e.id)
            if (!item.pages.includes(e.page)) item.pages.push(e.page)
        }
    }
    for (const g of groups) for (const it of g.items) it.check = checkOf(revision, it.source_ids)
    return { groups, notes: [...notes, ...fourFiveNotes(slug, fixes)] }
}

// ---------- table subjects: the OCR line boxes ----------
const pagesOf = (slug, from, to) => JSON.parse(readFileSync(`generated/sources/ocr/2025r/${slug}.ocr.json`, 'utf8')).pages.filter(p => p.page >= from && p.page <= to)
const sortY = lines => [...lines].sort((a, b) => a.y - b.y || a.x - b.x)

// 信息科技: four tables (表1–表4, one per 核心素养), rows 第一学段…第四学段, three numbered items per row.
function itGoals() {
    const STAGES = ['1-2', '3-4', '5-6', '7-9']
    const groups = []
    let literacy = null
    let n = -1
    let item = null
    for (const p of pagesOf('it', 11, 14)) {
        for (const l of sortY(p.lines)) {
            const t = l.t.trim()
            const title = t.match(/^表\s*\d\s*(\S+?)学段目标/u)
            if (title) { literacy = title[1]; n = -1; item = null; continue }
            if (/“五四”学制/u.test(t)) { literacy = null; continue }
            if (!literacy || l.x < 0.27 || l.y > 0.88 || /^(?:目标|学段)$/u.test(t)) continue
            const num = t.match(/^([1-9])\.\s*/u)
            if (num) {
                if (num[1] === '1') { n += 1; groups.push({ stage: STAGES[n], group: literacy, items: [] }) }
                item = { text: t.slice(num[0].length), pages: [p.page] }
                groups.at(-1).items.push(item)
            } else if (item) {
                item.text += t
                if (!item.pages.includes(p.page)) item.pages.push(p.page)
            }
        }
    }
    return groups
}

// 科学: one table, group rows 科学观念/科学思维/探究实践/态度责任, a 学段 label cell and indented paragraphs.
// A row runs between two 学段 labels; it is cut at the widest gap between paragraphs.
function scienceGoals() {
    const GROUPS = ['科学观念', '科学思维', '探究实践', '态度责任']
    const segments = []
    let current = null
    for (const p of pagesOf('science', 10, 18)) {
        const lines = sortY(p.lines).filter(l => l.y > 0.07 && l.y < 0.89)
        let inTable = p.page > 10
        for (const l of lines) {
            const t = l.t.trim()
            if (/^学段$/u.test(t)) { inTable = true; continue }
            if (!inTable || /^(?:目标|续表)$/u.test(t)) continue
            if (/“五四”学制|^四、课程内容/u.test(t)) { inTable = false; current = null; continue }
            if (GROUPS.includes(t)) { current = { group: t, pages: [] }; segments.push(current); continue }
            if (!current) continue
            const page = current.pages.find(x => x.page === p.page) || (current.pages.push({ page: p.page, labels: [], paras: [] }), current.pages.at(-1))
            if (l.x < 0.235) {
                const stage = STAGE_OF_LABEL[t.replace(/[～〜]/gu, '~').replace(/\s/gu, '')]
                if (stage) page.labels.push({ y: l.y, stage })
                continue
            }
            // a paragraph runs on from the previous page when the page opens with a continuation line
            const last = page.paras.at(-1) || current.pages.at(-2)?.paras.at(-1)
            if (l.x > 0.27 || !last) page.paras.push({ y: l.y, bottom: l.y, text: t })
            else { last.text += t; if (page.paras.includes(last)) last.bottom = l.y }
        }
    }
    const groups = []
    for (const seg of segments) {
        for (const { page, labels, paras } of seg.pages) {
            // the row of each paragraph: before the first label → that label; between labels → split at the widest gap
            const rowOf = paras.map(() => 0)
            for (let k = 0; k + 1 < labels.length; k += 1) {
                const between = paras.map((q, i) => i).filter(i => i > 0 && paras[i].y > labels[k].y && paras[i].y <= labels[k + 1].y + 0.03)
                const cut = between.sort((a, b) => (paras[b].y - paras[b - 1].bottom) - (paras[a].y - paras[a - 1].bottom))[0]
                if (cut !== undefined) for (let i = cut; i < paras.length; i += 1) rowOf[i] = k + 1
            }
            paras.forEach((q, i) => {
                const stage = labels[rowOf[i]]?.stage
                if (!stage) return
                let g = groups.find(x => x.group === seg.group && x.stage === stage)
                if (!g) { g = { stage, group: seg.group, items: [] }; groups.push(g) }
                g.items.push({ text: q.text, pages: [page] })
            })
        }
    }
    return groups
}

// 道德与法治、体育与健康: one column per 学段 (水平), one row per 核心素养 / 课程总目标, items start with •.
// Columns are told apart by the centre of each OCR line (a line read across cells is split at its • marks, or by
// width); rows are told apart by the item counts per column in the spec (`rows <name> <n1> <n2> <n3> <n4>`),
// counted on the pages, because the rows' items do not line up across columns.
const COLUMN_TABLES = {
    morality_law: { pages: [13, 19], heads: [/^第一学段/u, /^第二学段/u, /^第三学段/u, /^第四学段/u], label: /^核心/u },
    pe: { pages: [10, 12], heads: [/^水平一/u, /^水平二/u, /^水平三/u, /^水平四/u], label: /^课程/u }
}
function columnGoals(slug) {
    const cfg = COLUMN_TABLES[slug]
    const STAGES = ['1-2', '3-4', '5-6', '7-9']
    const columns = [[], [], [], []]
    let centers = null
    let labelX = null
    for (const p of pagesOf(slug, ...cfg.pages)) {
        const lines = sortY(p.lines)
        const heads = cfg.heads.map(re => lines.find(l => re.test(l.t.trim())))
        if (heads.every(Boolean)) centers = heads.map(l => l.x + l.w / 2)
        const label = lines.find(l => cfg.label.test(l.t.trim()))
        if (label) labelX = label.x + label.w / 2
        if (!centers || !label) continue
        const top = Math.max(...heads.filter(Boolean).map(l => l.y), label.y) + 0.035
        const left = (labelX + centers[0]) / 2
        const bounds = centers.slice(1).map((c, k) => (centers[k] + c) / 2)
        for (const l of lines) {
            // a stray mark or character read just before a bullet (「：•」「了•」) is noise; a sentence end is not
            const t = l.t.trim().replace(/^[^•。；！？]{1,2}(?=•)/u, '')
            if (l.y < top || l.y > 0.88 || /^续表$/u.test(t)) continue
            if (/“五四”学制/u.test(t)) break
            if (l.x + l.w / 2 < left) continue
            // a line belongs to every column it covers by more than a couple of characters
            const spanned = [0, 1, 2, 3].filter(k => Math.min(l.x + l.w, bounds[k] ?? 1) - Math.max(l.x, k ? bounds[k - 1] : left) > 0.04)
            if (spanned.length > 1) {
                const parts = t.split(/(?=•)/u).map(x => x.trim()).filter(Boolean)
                if (parts.length === spanned.length) { spanned.forEach((k, i) => columns[k].push({ page: p.page, y: l.y, t: parts[i] })); continue }
                const text = t.replace(/\s+/gu, '')
                let from = 0
                spanned.forEach((k, i) => {
                    const right = i === spanned.length - 1 ? text.length : Math.round(((bounds[k] - l.x) / l.w) * text.length)
                    columns[k].push({ page: p.page, y: l.y, t: text.slice(from, right) })
                    from = right
                })
                continue
            }
            const k = bounds.filter(b => l.x + l.w / 2 > b).length
            columns[k].push({ page: p.page, y: l.y, t })
        }
    }
    const rows = readTsv(`docs/data/v2/goals/${slug}.tsv`).filter(r => r[0] === 'rows').map(r => ({ name: r[1], counts: r.slice(2, 6).map(Number) }))
    const groups = []
    const problems = []
    columns.forEach((raw, k) => {
        // a bullet read as a line of its own marks the text line beside it
        const pieces = raw.filter(q => !/^•\s*$/u.test(q.t)).map(q => ({ ...q, t: q.t.replace(/\d(?=•)/gu, '') }))
        for (const dot of raw.filter(q => /^•\s*$/u.test(q.t))) {
            const near = pieces.filter(q => q.page === dot.page && Math.abs(q.y - dot.y) < 0.02).sort((a, b) => Math.abs(a.y - dot.y) - Math.abs(b.y - dot.y))[0]
            if (near && !near.t.startsWith('•')) near.t = `•${near.t}`
        }
        pieces.sort((a, b) => a.page - b.page || a.y - b.y)
        const items = []
        for (const piece of pieces) {
            // a • inside a line starts the next item (the line ran on into it)
            piece.t.split(/(?=•)/u).forEach((seg, i) => {
                const bullet = seg.startsWith('•')
                const t = seg.replace(/^•\s*/u, '')
                if (!t && !bullet) return
                if (bullet || !items.length) items.push({ text: t, pages: [piece.page] })
                else { items.at(-1).text += t; if (!items.at(-1).pages.includes(piece.page)) items.at(-1).pages.push(piece.page) }
                if (i === 0 && !bullet && !t) return
            })
        }
        const want = rows.reduce((n, r) => n + r.counts[k], 0)
        if (items.length !== want) problems.push(`${STAGES[k]}: ${items.length} items read, spec counts ${want}`)
        let at = 0
        for (const r of rows) {
            groups.push({ stage: STAGES[k], group: r.name, items: items.slice(at, at + r.counts[k]) })
            at += r.counts[k]
        }
    })
    if (problems.length) console.log(`  ${slug} column table:\n    ${problems.join('\n    ')}`)
    const order = rows.map(r => r.name)
    return groups.sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || order.indexOf(a.group) - order.indexOf(b.group))
}

const TABLES = { it: itGoals, science: scienceGoals, morality_law: () => columnGoals('morality_law'), pe: () => columnGoals('pe') }

export function stageGoals(slug) {
    if (CATALOGUE[slug]) return fromCatalogue(slug)
    if (TABLES[slug]) {
        const s = spec(slug)
        const fixes = [...loadOcrFixes(slug), ...s.fixes]
        const groups = TABLES[slug]()
        for (const g of groups) for (const it of g.items) { it.text = applyFixes(tidy(it.text), fixes); it.source_ids = []; it.check = { status: 'table' } }
        return { groups, notes: fourFiveNotes(slug, fixes) }
    }
    return null
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const slug = process.argv[2]
    const out = stageGoals(slug)
    if (!out) { console.log(`${slug}: no stage goals rebuilt`); process.exit(0) }
    mkdirSync('generated/v2/goals', { recursive: true })
    writeFileSync(`generated/v2/goals/${slug}.json`, `${JSON.stringify(out, null, 1)}\n`)
    const items = out.groups.flatMap(g => g.items)
    const count = k => items.filter(i => i.check.status === k).length
    const broken = items.filter(i => !/[。！？；]$/u.test(i.text))
    console.log(`${slug}: ${out.groups.length} groups, ${items.length} items (verified ${count('verified')}, revised ${count('revised')}, ocr_doubt ${count('ocr_doubt')}, table ${count('table')}), notes ${out.notes.length}`)
    for (const g of out.groups) console.log(`  ${g.stage} ${g.group || '—'}: ${g.items.length}`)
    if (broken.length) console.log(`  not ending a sentence:\n    ${broken.map(i => i.text.slice(-30)).join('\n    ')}`)
    if (!existsSync(`docs/data/v2/goals/${slug}.tsv`)) console.log('  (no spec file yet)')
}
