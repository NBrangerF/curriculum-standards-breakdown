#!/usr/bin/env node
// Official-text catalogue: every sentence of a curriculum standard, with where it sits.
// Usage: node scripts/sources/build_source_catalog.mjs --version 2022|2025r [--subjects a,b]
// Reads generated/sources/ocr/<version>/<slug>.ocr.json (page lines with boxes, from ocr_sources.mjs),
// writes generated/source_catalog/<version>/<slug>.json.
//
// Each entry records the chapter (课程目标, 课程内容, 学业质量…), the stage (学段/水平/级 → grade range),
// the section (学段要求, 内容要求, 学业要求, 素养表现, 教学提示, 学业质量描述…), the topic path inside
// 课程内容 (领域/主题/任务群/学习任务/核心概念), the item marker, the sentence and its PDF page.
//
// Body text is read line by line, and headings move the context forward. Tables (道法 themes, 科学 concepts,
// 英语 levels…) are read by column: a header row such as 学段｜学习内容｜内容要求 names the columns, label
// columns (学段, 主题, 核心概念) tag the items, and text columns (内容要求, 教学提示) become the entries.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = { version: '', subjects: [] }
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--version') args.version = argv[++i]
    else if (argv[i] === '--subjects') args.subjects = argv[++i].split(',').filter(Boolean)
}
if (!['2022', '2025r'].includes(args.version)) throw new Error('--version must be 2022 or 2025r')
const ocrDir = join('generated/sources/ocr', args.version)
const outDir = join('generated/source_catalog', args.version)
mkdirSync(outDir, { recursive: true })

const SUBJECTS = {
    chinese: '语文', math: '数学', english: '英语', morality_law: '道德与法治', history: '历史', geography: '地理',
    science: '科学', physics: '物理', chemistry: '化学', biology: '生物学', it: '信息科技', pe: '体育与健康', arts: '艺术', labor: '劳动'
}
// Taught only in 7–9: entries without a stage heading belong to 第四学段.
const JUNIOR_ONLY = new Set(['history', 'geography', 'physics', 'chemistry', 'biology'])

const CN = { 一: 1, 二: 2, 三: 3, 四: 4 }
const DEFAULT_STAGE = { 1: '1-2', 2: '3-4', 3: '5-6', 4: '7-9' }
const ENGLISH_LEVEL = { 预备级: '1-2', 一级: '3-4', 二级: '5-6', 三级: '7-9' }
const SECTIONS = ['内容要求', '学业要求', '教学提示', '学习内容', '素养表现', '活动建议', '学段要求', '学段目标', '学业质量描述', '学业质量内涵', '核心素养内涵', '总目标', '识字与写字', '阅读与鉴赏', '表达与交流', '梳理与探究']
// Column headers of tables: text columns become entries, label columns tag them.
const TEXT_COLUMNS = ['内容要求', '教学提示', '学业要求', '素养表现', '活动建议', '学业质量描述', '学段目标', '学业质量']
const LABEL_COLUMNS = { 学段: 'stage', 水平: 'stage', 级别: 'stage', 学习主题: 'topic', 主题: 'topic', 学习内容: 'subtopic', 核心概念: 'topic', 内容: 'subtopic', 维度: 'topic', 学习任务: 'subtopic' }

const dash = text => text.replace(/[～~〜—–\-－]/gu, '-')
const gradesIn = text => {
    const m = dash(text).replace(/\s/gu, '').match(/(\d)-(\d)(?:年级)?/u)
    return m ? `${m[1]}-${m[2]}` : null
}
const squash = text => text.replace(/\s+/gu, '')

function stageOf(text, slug) {
    const t = squash(text)
    let m = t.match(/第([一二三四])学段(?:（(.+?)）)?/u)
    if (m) return { value: gradesIn(m[2] || '') || DEFAULT_STAGE[CN[m[1]]], label: `第${m[1]}学段` }
    m = t.match(/^水平([一二三四])/u)
    if (m) return { value: DEFAULT_STAGE[CN[m[1]]], label: `水平${m[1]}` }
    if (slug === 'english') {
        m = t.match(/^(?:\d\.)?(预备级|一级|二级|三级)(\+|＋)?(?:（(.+?)）)?$/u)
        if (m) return { value: m[2] ? `${ENGLISH_LEVEL[m[1]]}+` : (gradesIn(m[3] || '') || ENGLISH_LEVEL[m[1]]), label: `${m[1]}${m[2] ? '+' : ''}` }
    }
    const g = gradesIn(t)
    if (g && /^\d-\d(年级)?$/u.test(dash(t))) return { value: g, label: `${g}年级` }
    return null
}

// Running heads, folios and figure/table captions carry no content.
function isNoise(line) {
    const t = squash(line.t)
    if (line.y < 0.085 && /(课程标准|课程内容|课程目标|课程实施|学业质量|课程理念|课程性质|附录)/u.test(t)) return true
    if (line.y > 0.88 && /^[\dIVXⅠⅡⅢⅣ]{1,4}$/u.test(t)) return true
    if (/^[|｜丨I1]{0,2}\d{0,3}$/u.test(t)) return true
    if (t === '续表') return true
    return false
}

function headingOf(text, ctx, slug) {
    const clean = squash(text).replace(/[|｜』」]+$/u, '').replace('课程日标', '课程目标').replace('任多群', '任务群')
    const part = clean.match(/^(?:[一二三四五六七]、)(课程性质|课程理念|课程目标|课程内容|学业质量|课程实施|核心素养)$/u) || clean.match(/^(附录)$/u)
    if (part) return { kind: 'part', value: part[1] }
    const stage = /学段|水平|级/u.test(clean) && clean.length <= 20 ? stageOf(clean, slug) : null
    if (stage) return { kind: 'stage', ...stage }
    let m = clean.match(/^【(.{2,8})】$/u)
    if (m && SECTIONS.includes(m[1])) return { kind: 'section', value: m[1], scope: 'block' }
    m = clean.match(/^(?:\d\.)?(内容要求|学业要求|教学提示|素养表现|学习内容|活动建议)$/u)
    if (m) return { kind: 'section', value: m[1], scope: 'block' }
    m = clean.match(/^（[一二三四五]）(学段要求|学段目标|学业质量描述|学业质量内涵|核心素养内涵|总目标|内容要求|教学提示)$/u)
    if (m) return { kind: 'section', value: m[1], scope: 'chapter' }
    if (ctx.part === '课程内容') {
        m = clean.match(/^(?:学习)?任务群(\d+)[：:](.{2,16})$/u)
        if (m) return { kind: 'topic', level: 2, value: `任务群${m[1]}：${m[2]}` }
        m = clean.match(/^学习任务(\d+)[：:](.{2,20})$/u)
        if (m) return { kind: 'topic', level: 2, value: `学习任务${m[1]}：${m[2]}` }
        m = clean.match(/^（([一二三四五六七八九十]+)）(.{2,22})$/u)
        if (m && !/学段/u.test(m[2])) return { kind: 'topic', level: 1, value: m[2] }
        m = clean.match(/^(\d{1,2})\.([^\d（(，。；].{1,15})$/u)
        if (m && !/[。；，：]$/u.test(clean) && !SECTIONS.includes(m[2])) return { kind: 'topic', level: 2, value: m[2] }
    }
    return null
}

// Item markers that start a new paragraph.
const ITEM = /^((?:（\d{1,2}）)|(?:\(\d{1,2}\))|(?:\d{1,2}\.\d{1,2}(?:\.\d{1,2})?(?=\s*[^\d]))|(?:\d{1,2}\.(?!\d))|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|[•●·▪◆])\s*/u
// Inline section labels, as in 劳动: "内容要求：…" "素养表现：…".
const INLINE = /^(内容要求|素养表现|活动建议|学业要求|教学提示)[：:]\s*/u

const snapshot = ctx => ({ part: ctx.part, stage: ctx.stage, stage_label: ctx.stage_label, section: ctx.section, topic: [...ctx.topic] })

function applyHeading(ctx, heading, slug) {
    if (heading.kind === 'part') {
        if (heading.value === ctx.part) return
        Object.assign(ctx, { part: heading.value, stage: JUNIOR_ONLY.has(slug) ? '7-9' : null, stage_label: null, section: null, scope: null, topic: [], l1: null, l2: null })
    } else if (heading.kind === 'stage') {
        ctx.stage = heading.value
        ctx.stage_label = heading.label
        if (ctx.scope === 'block') { ctx.section = null; ctx.scope = null }
        if (ctx.part === '课程内容' && !ctx.l1) { ctx.l2 = null; ctx.topic = [] }
    } else if (heading.kind === 'section') {
        ctx.section = heading.value
        ctx.scope = heading.scope
        if (heading.scope === 'chapter') { ctx.stage = JUNIOR_ONLY.has(slug) ? '7-9' : null; ctx.stage_label = null }
    } else if (heading.kind === 'topic') {
        if (heading.level === 1) {
            ctx.l1 = heading.value
            ctx.l2 = null
            if (ctx.scope === 'block') { ctx.section = null; ctx.scope = null }
        } else {
            ctx.l2 = heading.value
        }
        ctx.topic = [ctx.l1, ctx.l2].filter(Boolean)
    }
}

// Header row of a table: two or more known column names side by side.
function tableHeader(lines, index) {
    const first = lines[index]
    const row = lines.filter(line => Math.abs(line.y - first.y) < 0.012)
    const names = row.map(line => squash(line.t))
    const known = names.filter(name => TEXT_COLUMNS.includes(name) || LABEL_COLUMNS[name])
    if (known.length < 2 || known.length !== names.length) return null
    if (!names.some(name => TEXT_COLUMNS.includes(name))) return null
    const columns = row.sort((a, b) => a.x - b.x).map(line => ({ name: squash(line.t), center: line.x + line.w / 2 }))
    return { y: first.y, columns }
}

// Text in a column starts left of the column's header centre, whether it is centred or left-aligned,
// so a line belongs to the first column (left to right) whose header centre lies to its right.
function columnOf(line, table) {
    return table.columns.find(column => column.center > line.x + 0.005) || table.columns[table.columns.length - 1]
}

function parse(slug, pages) {
    const ctx = { part: null, stage: JUNIOR_ONLY.has(slug) ? '7-9' : null, stage_label: null, section: null, scope: null, topic: [] }
    const out = []
    let table = null // active table across pages: { columns, labels: {stage, topic, subtopic} }
    let current = null
    const flush = () => { if (current && current.text.trim()) out.push(current); current = null }

    for (const { page, lines: raw } of pages) {
        const lines = (raw || []).filter(line => !isNoise(line))
        const width = Math.max(0.3, ...lines.map(line => line.w))
        let region = []
        const flushRegion = () => { if (region.length) readTable(region, page); region = [] }

        for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i]
            const header = tableHeader(lines, i)
            if (header) {
                flush()
                flushRegion()
                const carried = table && table.columns.map(c => c.name).join() === header.columns.map(c => c.name).join() ? table.labels : {}
                table = { columns: header.columns, labels: { ...carried } }
                i += lines.filter(l => Math.abs(l.y - line.y) < 0.012).length - 1
                continue
            }
            // A full-width line, or a heading, ends the table.
            if (table && (line.w > 0.55 && line.x < 0.22 || (headingOf(line.t, ctx, slug) && line.x < 0.25 && line.w < 0.5 && !LABEL_COLUMNS[squash(line.t)]))) {
                if (!(line.w > 0.55) && region.length && headingOf(line.t, ctx, slug)?.kind === 'stage') { region.push(line); continue }
                flushRegion()
                table = null
            }
            if (table) { region.push(line); continue }

            // Table captions name the level in 英语: 表5 主题内容要求（一级）.
            const caption = squash(line.t).match(/^表\d+.*?（([^）]*级[^）]*)）$/u)
            if (caption && slug === 'english') {
                flush()
                const level = caption[1].match(/(预备级|一级|二级|三级)(\+|＋)?/u)
                if (level) { ctx.stage = level[2] ? `${ENGLISH_LEVEL[level[1]]}+` : ENGLISH_LEVEL[level[1]]; ctx.stage_label = level[0] }
                continue
            }
            // Single characters stacked in a side column (人/与/自/我) are table labels, not text.
            if (line.x < 0.22 && squash(line.t).length <= 2 && !/[。，；]/u.test(line.t)) continue

            const heading = headingOf(line.t, ctx, slug)
            if (heading) {
                flush()
                applyHeading(ctx, heading, slug)
                continue
            }
            let text = line.t
            const inline = text.match(INLINE)
            if (inline) {
                flush()
                ctx.section = inline[1]
                ctx.scope = 'block'
                text = text.slice(inline[0].length)
            }
            const marker = text.match(ITEM)
            if (marker || !current) {
                flush()
                current = { text: '', marker: marker ? marker[1] : '', page, y: line.y, ...snapshot(ctx) }
            }
            current.text += marker ? text.slice(marker[0].length) : text
            if (/[。！？；：”」）)]$/u.test(text) && line.w < width - 0.03) flush()
        }
        flush()
        flushRegion()
    }
    flush()
    return out

    // Table region on one page: label columns tag the paragraphs of text columns by vertical position.
    function readTable(region, page) {
        const byColumn = new Map()
        for (const line of region) {
            const column = columnOf(line, table)
            if (!byColumn.has(column.name)) byColumn.set(column.name, [])
            byColumn.get(column.name).push(line)
        }
        // Label blocks: consecutive lines of a label column, merged.
        const blocks = {}
        for (const [name, lines] of byColumn) {
            const role = LABEL_COLUMNS[name]
            if (!role) continue
            const merged = []
            for (const line of lines.sort((a, b) => a.y - b.y)) {
                const last = merged[merged.length - 1]
                const startsNew = role !== 'stage' && /^\d{1,2}\.\d{1,2}/u.test(line.t)
                if (last && line.y - last.bottom < 0.03 && !startsNew) { last.text += line.t; last.bottom = line.y + line.h }
                else merged.push({ text: line.t, top: line.y, bottom: line.y + line.h })
            }
            blocks[role] = merged.map(block => ({ ...block, center: (block.top + block.bottom) / 2 }))
        }
        for (const [name, lines] of byColumn) {
            if (LABEL_COLUMNS[name]) continue
            const paragraphs = []
            let para = null
            const colWidth = Math.max(...lines.map(line => line.w))
            for (const line of lines.sort((a, b) => a.y - b.y)) {
                const marker = line.t.match(ITEM)
                if (marker || !para) {
                    if (para) paragraphs.push(para)
                    para = { text: '', marker: marker ? marker[1] : '', top: line.y, bottom: line.y + line.h }
                }
                para.text += marker ? line.t.slice(marker[0].length) : line.t
                para.bottom = line.y + line.h
                if (/[。！？；]$/u.test(line.t) && line.w < colWidth - 0.03) { paragraphs.push(para); para = null }
            }
            if (para) paragraphs.push(para)
            // Stage groups: numbering restarts at ① (or 1) for each stage; find each group's stage label.
            let groupStage = table.labels.stage
            const stageBlocks = blocks.stage || []
            paragraphs.forEach((p, index) => {
                const restart = marker => /^(①|1\.?|（1）|\(1\))$/u.test(marker)
                if (restart(p.marker) || index === 0) {
                    const next = paragraphs.slice(index + 1).find(q => restart(q.marker))
                    const end = next ? next.top : 1
                    const label = stageBlocks.find(b => b.center >= p.top - 0.02 && b.center < end)
                    if (label) groupStage = stageOf(label.text, slug)?.value || gradesIn(label.text) || groupStage
                    else if (index === 0 && stageBlocks.length && !table.labels.stage) groupStage = stageOf(stageBlocks[0].text, slug)?.value || groupStage
                }
                p.stage = groupStage
                for (const role of ['topic', 'subtopic']) {
                    const list = blocks[role] || []
                    if (list.length) {
                        const center = (p.top + Math.min(p.bottom, p.top + 0.06)) / 2
                        const near = list.reduce((a, b) => (Math.abs(b.center - center) < Math.abs(a.center - center) ? b : a))
                        // A label printed lower than the item may belong to the next row; prefer one above when close.
                        const above = list.filter(b => b.top <= p.top + 0.01).pop()
                        p[role] = (above && Math.abs(near.center - center) > 0.08 ? above : near).text
                    } else p[role] = table.labels[role]
                }
            })
            if (paragraphs.length) {
                const last = paragraphs[paragraphs.length - 1]
                table.labels.stage = last.stage
                table.labels.topic = last.topic
                table.labels.subtopic = last.subtopic
            }
            for (const p of paragraphs) {
                const topic = [...ctx.topic]
                if (p.topic) topic.push(squash(p.topic))
                if (p.subtopic) topic.push(squash(p.subtopic))
                out.push({ text: p.text, marker: p.marker, page, y: p.top, part: ctx.part, stage: p.stage || ctx.stage, stage_label: ctx.stage_label, section: name === '学业质量' ? '学业质量描述' : name, topic, table: true })
            }
        }
    }
}

// Sentences: split at 。；！？ but keep a trailing bracketed tag such as （唯物史观、时空观念） with its sentence.
function sentences(text) {
    const out = []
    let buffer = ''
    let depth = 0
    for (const char of text) {
        buffer += char
        if ('（(“'.includes(char)) depth += 1
        else if ('）)”'.includes(char)) depth = Math.max(0, depth - 1)
        else if ('。；！？'.includes(char) && depth === 0) { out.push(buffer); buffer = '' }
    }
    if (buffer.trim()) out.push(buffer)
    const merged = []
    for (const item of out.map(s => s.trim())) {
        if (merged.length && /^（[^）]{1,30}）[。；]?$/u.test(item)) merged[merged.length - 1] += item
        else merged.push(item)
    }
    return merged.filter(item => item.replace(/[\s。；，、]/gu, '').length >= 4)
}

const subjects = Object.keys(SUBJECTS).filter(slug => !args.subjects.length || args.subjects.includes(slug))
const summary = []
for (const slug of subjects) {
    const file = join(ocrDir, `${slug}.ocr.json`)
    if (!existsSync(file)) { console.log(`${slug}: no OCR`); continue }
    const ocr = JSON.parse(readFileSync(file, 'utf8'))
    const paragraphs = parse(slug, ocr.pages)
    const entries = []
    paragraphs.forEach((paragraph, paraIndex) => {
        sentences(paragraph.text).forEach((sentence, index) => {
            entries.push({
                id: `${slug}:${args.version}:${String(entries.length + 1).padStart(4, '0')}`,
                para: paraIndex + 1,
                index,
                marker: index === 0 ? paragraph.marker : '',
                part: paragraph.part,
                stage: paragraph.stage,
                section: paragraph.section,
                topic: paragraph.topic,
                page: paragraph.page,
                table: Boolean(paragraph.table),
                text: sentence
            })
        })
    })
    writeFileSync(join(outDir, `${slug}.json`), JSON.stringify({ subject_slug: slug, subject: SUBJECTS[slug], version: args.version, source: ocr.source_file, pages: ocr.total_pages, entry_count: entries.length, entries }))
    const count = key => entries.filter(entry => entry.section === key).length
    summary.push({
        slug, pages: ocr.total_pages, entries: entries.length,
        学段要求: entries.filter(e => e.part === '课程目标' && ['学段要求', '学段目标', '识字与写字', '阅读与鉴赏', '表达与交流', '梳理与探究'].includes(e.section)).length,
        内容要求: count('内容要求'), 学业要求: count('学业要求'), 素养表现: count('素养表现'), 教学提示: count('教学提示'), 学业质量: count('学业质量描述'),
        无学段: entries.filter(e => e.part === '课程内容' && !e.stage).length
    })
}
console.table(summary)
