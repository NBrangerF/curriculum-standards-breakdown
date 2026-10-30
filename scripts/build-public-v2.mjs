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

// Revision state shown on the page, from the character diff of the 2022 and 2025 scans. Only the 2025 side is checked
// against the PDF, so the page says what the revision newly wrote (2025 text) and never quotes 2022 wording.
// Not revisions: differences that are only item numbering or a 2022 page header, and same-length swaps of one or two
// characters (「捕」/「描」, 「博垸」/「情境」), which are almost always scan errors on the 2022 side.
const NOISE = text => !text || /^[\d.．、]+$/u.test(text) || /^[A-Za-z0-9°，,()（）.]+$/u.test(text)
const PAGE_JUNK = /\|\||课程[肉内]容|^[一二三四五六七八九十]、/u
// A revision is shown only where a newly written phrase is in the item's own 2025 text (a diff can also pick up a page
// footnote next to it); deletions alone are not shown, since they are mostly 2022 scan noise.
const PUNCT = /[\s，。；、：！？“”‘’（）()《》—…·]/u
const bare = text => [...String(text || '')].filter(ch => !PUNCT.test(ch)).join('')
// The phrase as written in the item, punctuation included ("工具书（如配图词典、简版语法书等）").
function locate(text, phrase) {
    const chars = [...String(text)]
    const keep = chars.map((ch, k) => (PUNCT.test(ch) ? -1 : k)).filter(k => k >= 0)
    const at = keep.map(k => chars[k]).join('').indexOf(bare(phrase))
    if (at < 0) return null
    const from = keep[at]
    let to = keep[at + [...bare(phrase)].length - 1] + 1
    while (to < chars.length && /[）)”’]/u.test(chars[to])) to += 1
    return chars.slice(from, to).join('')
}
function revision(check, text = '') {
    if (!check) return undefined
    if (check.status === 'ocr_doubt') return { status: 'ocr_doubt' }
    if (check.status === 'table') return { status: 'table' }
    if (check.status !== 'revised') return { status: 'verified' }
    const changes = (check.changes || [])
        .filter(c => !(NOISE(c.del) && NOISE(c.ins)) && !PAGE_JUNK.test(c.del || ''))
        .filter(c => !(c.del && c.ins && c.del.length === c.ins.length && c.del.length <= 2))
    if (!changes.length) return { status: 'verified' }
    const added = [...new Set(changes.map(c => c.ins).filter(t => t && t.length >= 2 && !NOISE(t)).map(t => locate(text, t)).filter(Boolean))].slice(0, 3)
    if (!added.length) return { status: 'verified' }
    return { status: 'revised', added, summary: `修订版新写入：${added.map(t => `「${t}」`).join('、')}` }
}
const example = e => ({ text: e.text, from: e.from })
const officialItem = item => ({ text: item.text, section: item.section || null, pages: item.pages || [], check: revision(item.check, item.text) })

// Curated learning resources are filed under old codes (public/data/learning-resources/by-standard/<old>.json).
const RESOURCES_DIR = 'public/data/learning-resources/by-standard'
const resourcesByOldCode = new Map(existsSync(RESOURCES_DIR)
    ? readdirSync(RESOURCES_DIR).filter(f => f.endsWith('.json')).map(f => [f.replace(/\.json$/u, ''), readJson(join(RESOURCES_DIR, f)).resources.map(r => r.id)])
    : [])

// Transferable-skill candidates (TS…) were tagged on the old records; a standard carries those of the records that joined it.
const oldSkills = new Map()
for (const f of existsSync('public/data/by_subject') ? readdirSync('public/data/by_subject').filter(n => n.endsWith('.json')) : []) {
    for (const r of readJson(join('public/data/by_subject', f)).standards || []) oldSkills.set(r.code, { primary: r.ts_primary || [], secondary: r.ts_secondary || [] })
}
const skillsOf = (codes, key) => [...new Set(codes.flatMap(code => oldSkills.get(code)?.[key] || []))].sort()

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
        ...(s.statement_check ? { statement_check: revision(s.statement_check, s.statement) } : {}),
        indicators: s.indicators.map(i => ({
            code: i.code,
            text: i.text,
            section: i.section || null,
            pages: i.pages || [],
            check: revision(i.check, i.text),
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
        ts_primary: skillsOf(oldCodes, 'primary'),
        ts_secondary: skillsOf(oldCodes, 'secondary').filter(code => !skillsOf(oldCodes, 'primary').includes(code)),
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

// Textbook links for the five junior subjects added in 2025 (scripts/v2/align_textbooks.mjs; machine-made, 待核验):
// standard → chapters/lessons, and each TOC entry → the standards that link to it.
const LINKS = join(SOURCE, 'textbook_links')
const textbookLinks = { method: 'v2-textbook-links-1', standards: {}, units: {} }
if (existsSync(LINKS)) {
    const titleOf = new Map(subjects.flatMap(subj => readJson(join('public/data', subj.file)).standards.map(st => [st.code, st.level2])))
    for (const f of readdirSync(LINKS).filter(n => n.endsWith('.json') && n !== 'contents.json')) {
        for (const [code, links] of Object.entries(readJson(join(LINKS, f)).links)) {
            textbookLinks.standards[code] = links
            for (const l of links) if (l.entry_id) (textbookLinks.units[l.entry_id] ||= []).push({ code, indicator: l.indicator, title: titleOf.get(code) })
        }
    }
}
writeFileSync(join(OUT, 'textbook_links.json'), `${JSON.stringify(textbookLinks)}\n`)

// Chapter index for "which standards does this lesson serve" (the AI tools' find_textbook_chapter): each book's chapters
// and lessons from its 目录 (data/v2/textbook_contents.json, read from the textbook drive), its stored TOC and the lesson
// nodes of its page alignments, each with the 2025 standards aligned to pages inside it.
const BOOKS = 'public/data/textbooks/index.json'
const chapters = { books: {}, chapters: [] }
if (existsSync(BOOKS)) {
    const contentsCache = existsSync(join(SOURCE, 'textbook_contents.json')) ? readJson(join(SOURCE, 'textbook_contents.json')) : {}
    const unitList = readJson('public/data/textbooks/units.json').items
    const unitIds = new Set(unitList.map(u => u.entry_id))
    const unitAligned = new Map(unitList.map(u => [u.entry_id, (u.alignments || []).map(a => a.standard_code)]))
    const unitTitle = new Map(unitList.map(u => [u.entry_id, String(u.title || '').replace(/\s+/gu, '')]))
    const standardOf = old => legacyCodes[old]?.startsWith('/standards/') ? legacyCodes[old].slice('/standards/'.length).split('#')[0] : null
    const v2LinksByEdition = new Map()
    for (const [code, links] of Object.entries(textbookLinks.standards)) for (const l of links) if (l.pdf_page != null) (v2LinksByEdition.get(l.edition_id) || v2LinksByEdition.set(l.edition_id, []).get(l.edition_id)).push({ code, pdf_page: l.pdf_page })
    const tidyTitle = t => String(t || '').replace(/\s+/gu, ' ').replace(/(\p{Script=Han}) (?=\p{Script=Han})/gu, '$1').trim()
    for (const book of readJson(BOOKS).items) {
        const file = join('public/data/textbooks/by-edition', `${book.edition_id}.json`)
        if (!existsSync(file)) continue
        const detail = readJson(file)
        chapters.books[book.edition_id] = [`${book.edition_name}${book.title}`, book.subject_slug, book.grade, book.volume]
        const stored = (detail.toc || []).filter(e => e.pdf_page != null)
        const fromContents = (contentsCache[book.edition_id] || []).filter(e => e.pdf_page != null).map(e => {
            // the stored entry for the same chapter: same 第N单元 label, or (numbered lessons) the same title, on about the same page
            const twin = stored.find(x => { const t = String(x.title).replace(/\s+/gu, ''); return (/^\d/u.test(e.label) ? t.includes(e.title.replace(/\s+/gu, '')) : t.startsWith(e.label)) && Math.abs(x.pdf_page - e.pdf_page) <= 3 })
            return { title: `${/^\d/u.test(e.label) ? '' : `${e.label} `}${e.title}`, level: e.level || 1, pdf_page: e.pdf_page, printed_page: e.printed_page, unit_id: twin && unitIds.has(twin.entry_id) ? twin.entry_id : null }
        })
        const base = fromContents.length >= 3 ? fromContents : stored.map(e => ({ title: tidyTitle(e.title), level: e.level || 1, pdf_page: e.pdf_page, printed_page: e.printed_page ?? null, unit_id: unitIds.has(e.entry_id) ? e.entry_id : null }))
        const lessons = []
        for (const a of detail.alignments || []) {
            const title = tidyTitle(String(a.content_node_title || '').replace(/^\d+(?:\.\d+)*\s*/u, ''))
            if (!['lesson', 'section', 'unit'].includes(a.content_node_kind) || (title.match(/\p{Script=Han}/gu) || []).length < 2 || a.pdf_page == null) continue
            if (![...base, ...lessons].some(e => e.title.endsWith(title))) lessons.push({ title, level: 3, pdf_page: a.pdf_page, printed_page: a.printed_page ?? null, unit_id: unitTitle.get(a.unit_id)?.includes(title.replace(/\s+/gu, '')) ? a.unit_id : null })
        }
        // a title read twice (目录 and stored TOC, a few pages apart) is kept once
        const entries = [...base, ...lessons].filter(e => (e.title.match(/\p{Script=Han}/gu) || []).length >= 2).sort((a, b) => a.pdf_page - b.pdf_page || a.level - b.level)
            .filter((e, k, all) => !all.slice(0, k).some(x => x.title === e.title && e.pdf_page - x.pdf_page <= 3))
        const aligned = [...(detail.alignments || []).filter(a => a.pdf_page != null).map(a => ({ code: standardOf(a.standard_code), pdf_page: a.pdf_page })), ...(v2LinksByEdition.get(book.edition_id) || [])].filter(a => a.code)
        entries.forEach((e, k) => {
            const next = entries.slice(k + 1).find(x => x.level <= e.level && x.pdf_page > e.pdf_page)
            const end = next ? next.pdf_page - 1 : detail.page_count || e.pdf_page + 10
            const count = new Map()
            for (const a of aligned) if (a.pdf_page >= e.pdf_page && a.pdf_page <= end) count.set(a.code, (count.get(a.code) || 0) + 1)
            // the unit's own alignments in the textbook library count most
            for (const old of unitAligned.get(e.unit_id) || []) { const code = standardOf(old); if (code) count.set(code, (count.get(code) || 0) + 100) }
            // drop codes aligned to only a stray page or two of a long chapter
            const top = Math.max(0, ...count.values())
            const codes = [...count].filter(([, n]) => n * 4 >= top).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([code]) => code)
            chapters.chapters.push([book.edition_id, e.title, e.printed_page ?? null, e.pdf_page, e.unit_id, codes])
        })
    }
}
writeFileSync(join(OUT, 'textbook_chapters.json'), `${JSON.stringify(chapters)}\n`)
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
// /llms.txt: what the site is and how an AI should use and cite it (https://llmstxt.org)
const SITE = 'https://www.kebiao.org'
const n = value => value.toLocaleString('en-US')
writeFileSync('public/llms.txt', `# kebiao 课标

> kebiao.org 是《义务教育课程标准（2022年版2025年修订）》的结构化索引：${totals.subjects} 门学科、${n(totals.standards)} 条标准、${n(totals.indicators)} 条要点。每条标准对应一个学段的一个内容单元；要点逐字取自课标原文并标明页码。免费、只读、无需登录。

- 标准：编码如 MA-S2-NA-02（学科-学段-领域-序号），每条一页：${SITE}/standards/MA-S2-NA-02 。标准句是课标原句，或 kebiao 用课标原词写的概括（页面标明「kebiao 整理」）。
- 要点：编码如 MA-S2-NA-02.1，课标原文，在标准页里用锚点定位：${SITE}/standards/MA-S2-NA-02#MA-S2-NA-02.1 。标「2025 修订」的要点在修订版中有改动。
- 表现示例和教材对应是 kebiao 整理或机器对齐，待核验。
- 2022 年版的旧编码（如 MA-D2-AL-005）会跳转到它并入的新标准。
- 修订版文本取自凤溪中学网站转载的日常修订版，以官方出版物为准。

引用时请给出编码、要点原文和链接；不要编造编码，不要改写原文。

## 给 AI 用的接口

- [MCP 服务器](${SITE}/mcp): Streamable HTTP（POST JSON-RPC），无需登录；只读工具：检索课标、查看标准、列出标准、学段目标、标准对应的教材、从教材章节找课标、2025 修订对照
- [插件 OpenAPI](${SITE}/api/v1/plugin/openapi.yaml): 扣子、腾讯元器等平台可直接导入；每个接口都返回一段可直接引用的 answer
- [API 文档](${SITE}/api/v1/docs): 完整的课程智能 API

## 学科

${subjects.map(s => `- [${s.subject}](${SITE}/subjects/${s.subject_slug}): ${s.standard_count} 条标准、${s.indicator_count} 条要点；${s.stages.map(st => st.label).join('、')}`).join('\n')}

## 页面

- [检索](${SITE}/smart-search?q=%E5%88%86%E6%95%B0%E7%9A%84%E5%A4%A7%E5%B0%8F): 用一句话找课标
- [教材](${SITE}/textbooks): 统编版、人教版等教材的单元与课标对应
- [站点地图](${SITE}/sitemap.xml)

## Optional

- [联系](${SITE}/contact)
`)
console.log(`public v2: ${totals.subjects} subjects, ${totals.standards} standards, ${totals.indicators} 要点, ${totals.legacy_codes} old codes`)
