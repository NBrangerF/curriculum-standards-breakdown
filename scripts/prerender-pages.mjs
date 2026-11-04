#!/usr/bin/env node
// Writes a static HTML page for every public route, so search engines, link previews and
// slow connections get the page's own title and content before the app's JavaScript runs.
// Runs after `vite build`. When the app starts it shows this content until its data is ready.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
    SITE_URL, SITE_NAME, cardVersion, getDisplayTitle, clip, V2_STANDARDS_DOC, v2StageLabel, v2StandardMeta,
    homeMeta, subjectMeta, skillsOverviewMeta, skillMeta, textbooksMeta, textbookMeta,
    textbookUnitMeta, textbookAlignmentMeta, learningResourcesMeta, learningResourceMeta, STATIC_PAGE_META,
    conceptsMeta, conceptMeta, subjectSkeletonMeta, knowledgeGraphMeta
} from '../src/seo/pageMeta.js'
import { logoSvg } from '../src/brand/logo.js'

const DIST = 'dist'
const DATA = 'public/data'
const readJson = path => JSON.parse(readFileSync(join(DATA, path), 'utf8'))

// dist/index.html becomes the home page, so keep the bare shell for every other route.
const SHELL_PATH = join(DIST, 'app-shell.html')
const builtIndex = readFileSync(join(DIST, 'index.html'), 'utf8')
const shell = builtIndex.includes('data-prerender=') ? readFileSync(SHELL_PATH, 'utf8') : builtIndex
writeFileSync(SHELL_PATH, shell)

const esc = value => String(value ?? '').replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
const scriptJson = value => JSON.stringify(value).replace(/</gu, '\\u003c')
const link = (href, text) => `<a href="${esc(encodeURI(href))}">${esc(text)}</a>`
const paras = text => String(text || '').split(/\n+/u).map(line => line.trim()).filter(Boolean)
    .map(line => `<p>${esc(line).replace(/【([^】]+)】/gu, '<strong>$1</strong> ')}</p>`).join('')
const section = (title, html) => (html ? `<section><h2>${esc(title)}</h2>${html}</section>` : '')
const list = items => (items.length ? `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>` : '')
const splitCodes = value => String(value || '').split(/[\n|]/u).map(code => code.trim()).filter(Boolean)

// ---------- data ----------
const manifest = readJson('manifest.json')
const subjectsMeta = new Map((readJson('subjects_meta.json').subjects_meta || []).map(item => [item.subject_slug, item]))
const skillsMeta = readJson('skills_meta.json').competencies || []
const skillNames = new Map()
for (const skill of skillsMeta) {
    skillNames.set(skill.code, skill.name_cn)
    for (const sub of skill.subskills || []) skillNames.set(sub.code, sub.name_cn)
}
const subjects = manifest.subjects
const standardsBySubject = new Map()
const standardsByCode = new Map()
for (const subject of subjects) {
    const standards = readJson(subject.file).standards
    standardsBySubject.set(subject.subject_slug, standards)
    for (const standard of standards) standardsByCode.set(standard.code, standard)
}
const textbooks = readJson('textbooks/index.json').items
const textbooksById = new Map(textbooks.map(book => [book.edition_id, book]))
const units = readJson('textbooks/units.json').items
const standardsToTextbooks = readJson('textbooks/standards-to-textbooks.json')
const learningResources = readJson('learning-resources/catalog/index.json').resources
const platforms = readJson('learning-resources/platforms.json').platforms
const glossary = readJson('glossary.json')
const concepts = readJson('concepts.json')
const interdisciplinary = readJson('interdisciplinary.json')
const experiments = readJson('experiments.json')
// 课堂诊断: one bank per subject, listed in checks/index.json
const checkBanks = existsSync(join(DATA, 'checks/index.json')) ? readJson('checks/index.json').subjects.map(entry => readJson(`checks/${entry.slug}.json`)) : []
// standard → the textbook units the AI (or the page alignment) tied it to, from build_national_lessons.mjs
const nationalUnits = new Map(existsSync(join(DATA, 'v2/national-lessons')) ? readdirSync(join(DATA, 'v2/national-lessons')).flatMap(file => Object.entries(readJson(`v2/national-lessons/${file}`).units || {})) : [])
// 要点 → the lessons that teach it, with the textbook's own words (教材与课标对应, align_textbook_lessons.mjs)
const nationalPoints = new Map(existsSync(join(DATA, 'v2/national-lessons')) ? readdirSync(join(DATA, 'v2/national-lessons')).flatMap(file => Object.entries(readJson(`v2/national-lessons/${file}`).points || {})) : [])
const SOURCE_LABEL = (source, page) => (source === 'book' ? (page ? `教材 PDF 第 ${page} 页` : '教材原文') : source === 'design' ? '国家平台教学设计' : source === 'task' ? '国家平台学习任务单' : source === 'slides' ? '国家平台课件' : source === 'summary' ? '国家平台课程简介' : '课题')
const RELATION_LABEL = { T: '主要在教', P: '也涉及' }
const CARD_VERSION = cardVersion(readJson('data_version.json').data_version)
const cardUrl = path => `${SITE_URL}/cards/${path}.png?v=${CARD_VERSION}`

// v2 standards (标准 → 要点): every old code now lives on one of these pages, usually at a 要点 anchor.
const v2Manifest = readJson('v2/manifest.json')
const v2Subjects = v2Manifest.subjects.map(entry => readJson(entry.file))
const v2ByCode = new Map(v2Subjects.flatMap(subject => subject.standards.map(standard => [standard.code, { standard, subject }])))
const legacyCodes = readJson('v2/legacy_codes.json')
const v2TextbookLinks = readJson('v2/textbook_links.json')
const NEW_SUBJECTS = new Set(['history', 'geography', 'physics', 'chemistry', 'biology'])
const subjectHeader = subject => ({ subject_slug: subject.subject_slug, subject: subject.subject, source_note: subject.source_note, stages: subject.stages })

const standardTitle = standard => getDisplayTitle(standard.standard, standard.standard_title)
// Links to an old code point where it lives now, named by the v2 standard (and 要点) it joined.
const standardLink = code => {
    const target = legacyCodes[code]
    const old = standardsByCode.get(code)
    if (!target) return old ? esc(standardTitle(old)) : esc(code)
    if (!target.startsWith('/standards/')) return `${link(target, old ? standardTitle(old) : code)} <span class="kbp-code">${esc(code)}</span>`
    const [path, anchor] = target.split('#')
    const found = v2ByCode.get(path.slice('/standards/'.length))
    if (!found) return esc(code)
    const { standard, subject } = found
    return `${link(target, `${standard.level2}（${subject.subject}${v2StageLabel(standard, subject)}）`)} <span class="kbp-code">${esc(anchor || standard.code)}</span>`
}
const breadcrumbs = items => ({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], index) => ({ '@type': 'ListItem', position: index + 1, name, item: SITE_URL + encodeURI(path) }))
})
const crumbNav = items => `<nav class="kbp-crumb" aria-label="面包屑">${items.map(([name, path], index) => (index === items.length - 1 ? `<span>${esc(name)}</span>` : link(path, name))).join(' / ')}</nav>`

// ---------- page builders ----------
const pages = []
const add = (meta, main, extra = {}) => pages.push({ ...meta, main, ...extra })

const subjectList = () => list(v2Manifest.subjects.map(subject => `${link(`/subjects/${subject.subject_slug}`, `${subject.subject}课程标准`)} <span class="kbp-code">${subject.standard_count} 条标准 · ${subject.indicator_count} 条要点</span>`))
const totalsLine = `${v2Manifest.totals.standards.toLocaleString('en-US')} 条标准 · ${v2Manifest.totals.indicators.toLocaleString('en-US')} 条要点`

function homePage() {
    const meta = homeMeta({ standardCount: v2Manifest.totals.standards, indicatorCount: v2Manifest.totals.indicators, subjectCount: v2Manifest.totals.subjects })
    const main = `
<p class="kbp-kicker">义务教育课程标准 · 2022年版2025年修订 · ${totalsLine}</p>
<h1>从你手上的教材开始</h1>
<p class="kbp-lede">每一课教的是哪几条课标、教材原文在第几页，都已经逐课标好。</p>
${section('从教材开始', `<p>${link('/textbooks', `教材馆：${textbooks.length} 册教材`)}，选一本，看每一课教哪几条课标。</p>`)}
${section('按学科看课标', subjectList())}
${section('更多入口', list([
        `${link('/smart-search', '智能检索')}：用一句话描述教学内容，找到相关课标`,
        `${link('/skills', '可迁移技能')}：从能力出发反查课标`,
        `${link('/learning-resources', '开放学习资源')}：对应到课标的精选资源`,
        `${link('/teacher-exam', '教资')}：考前把课标读懂`,
        `${link('/open-data', '数据与接口')}：CSV、JSON 下载，API 和 MCP，CC BY 4.0`
    ]))}`
    add(meta, main, {
        jsonLd: [{
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: SITE_NAME,
            url: `${SITE_URL}/`,
            inLanguage: 'zh-CN',
            potentialAction: { '@type': 'SearchAction', target: `${SITE_URL}/smart-search?q={search_term_string}`, 'query-input': 'required name=search_term_string' }
        }]
    })
}

function standardsHubPage() {
    const crumbs = [['首页', '/'], ['按学科看课标', '/standards']]
    add(STATIC_PAGE_META['/standards'], `${crumbNav(crumbs)}
<p class="kbp-kicker">课标 · ${V2_STANDARDS_DOC}</p>
<h1>按学科看课标</h1>
<p class="kbp-lede">14 门课程，${totalsLine.replace(' · ', '、')}，每条附课标原文和页码。手上有教材的话，从${link('/textbooks', '教材')}进更快：每一课教哪几条已经标好。</p>
${section('学科', subjectList())}
${section('查和比', list([
        `${link('/smart-search', 'AI 检索')}：用一句话找课标，例如「三年级科学里讲植物生长的」`,
        `${link('/concepts', '概念词典')}：大概念、大单元、学习任务群，课标原文怎么说`,
        `${link('/skills', '可迁移技能')}：批判性思维、协作等七种能力落在哪些学科的哪几条`
    ]))}`, { jsonLd: [breadcrumbs(crumbs)] })
}

function subjectPage(subject) {
    const info = subjectsMeta.get(subject.subject_slug) || {}
    const indicatorCount = subject.standards.reduce((n, standard) => n + standard.indicators.length, 0)
    const meta = subjectMeta(subject, { standardCount: subject.standards.length, indicatorCount, shortDescription: info.short_description })
    const stages = subject.stages.map(stage => {
        const inStage = subject.standards.filter(standard => standard.stage_code === stage.stage_code)
        const domains = [...new Set(inStage.map(standard => standard.level1))]
        return `<section id="${esc(stage.stage_code)}"><h2>${esc(stage.label)}</h2>${domains.map(domain => `<h3>${esc(domain)}</h3>${list(inStage.filter(standard => standard.level1 === domain).map(standard => `${link(`/standards/${standard.code}`, standard.level2)} <span class="kbp-code">${esc(standard.code)} · ${standard.indicators.length} 条要点</span>`))}`).join('')}</section>`
    }).join('')
    // 学段目标 (体育: 水平目标), rebuilt from the 课标 by scripts/v2/stage_goals.mjs
    const goalWord = subject.subject_slug === 'pe' ? '水平目标' : '学段目标'
    const goals = subject.stages.map(stage => {
        const groups = (subject.stage_overview.stage_goals || []).filter(g => g.stage === stage.stage)
        return groups.length ? `<h3>${esc(stage.label)}</h3>${groups.map(g => `${g.group ? `<h4>${esc(g.group)}</h4>` : ''}${list(g.items.map(item => `${esc(item.text)} <span class="kbp-note">第 ${item.pages.join('、')} 页</span>`))}`).join('')}` : ''
    }).join('')
    const crumbs = [['首页', '/'], [`${subject.subject}课程标准`, `/subjects/${subject.subject_slug}`]]
    add(meta, `${crumbNav(crumbs)}
<p class="kbp-kicker">${V2_STANDARDS_DOC}</p>
<h1>${esc(subject.subject)}课程标准</h1>
<p class="kbp-lede">${esc(info.short_description || '')}</p>
<p class="kbp-note">共 ${subject.standards.length} 条标准、${indicatorCount} 条要点，按学段和领域排列。每条标准对应一个学段的一个内容单元；要点逐字取自课标原文。</p>
${stages}
${goals ? section(`${goalWord}（课标原文）`, goals + (subject.stage_overview.stage_notes || []).map(note => `<p class="kbp-note">${esc(note.text)}</p>`).join('')) : ''}
<p class="kbp-note">${esc(subject.source_note)}</p>`, { jsonLd: [breadcrumbs(crumbs)], image: cardUrl(`subject/${subject.subject_slug}`) })
}

const pagesNote = pages => (pages?.length ? `课标第 ${pages.join('、')} 页` : '')
function standardPage({ standard, subject }) {
    const meta = v2StandardMeta(standard, subject)
    const stage = v2StageLabel(standard, subject)
    const crumbs = [['首页', '/'], [`${subject.subject}课程标准`, `/subjects/${subject.subject_slug}`], [standard.level2, `/standards/${standard.code}`]]
    const indicators = standard.indicators.map(item => `<li id="${esc(item.code)}"><p><span class="kbp-code">${esc(item.code)}${item.grades?.length ? ` · ${item.grades.join('、')} 年级` : ''}</span><br>${esc(item.text)}</p>${item.official_examples ? `<p class="kbp-note">${esc(item.official_examples)}</p>` : ''}<p class="kbp-note">${esc(['课标原文', item.section, pagesNote(item.pages)].filter(Boolean).join(' · '))}${item.check?.status === 'revised' ? ` · 2025 修订，${esc(item.check.summary)}` : ''}</p>${item.examples.length ? `<p class="kbp-note">表现示例（kebiao 整理）：</p>${list(item.examples.map(example => esc(example.text)))}` : ''}</li>`).join('')
    const official = items => list(items.map(item => `${esc(item.text)} <span class="kbp-note">${esc(pagesNote(item.pages))}</span>`))
    const pageEvidence = new Map()
    for (const code of standard.legacy_codes) {
        for (const item of standardsToTextbooks.items[code] || []) {
            if (item.unit_id && !pageEvidence.has(item.unit_id)) {
                const page = item.printed_page ? `，第 ${item.printed_page} 页` : ''
                pageEvidence.set(item.unit_id, `${link(`/textbook-units/${item.unit_id}`, `${item.textbook_title} · ${item.unit_title || item.node_title || '相关页'}`)}<span class="kbp-note">${esc(page)}${item.review_status === 'approved' ? '' : ' · 机器对齐，待核验'}</span>`)
            }
        }
    }
    // the junior subjects added in 2025 link to their own textbooks (machine-made, 待核验)
    for (const l of v2TextbookLinks.standards[standard.code] || []) {
        const key = l.entry_id || l.edition_id
        if (pageEvidence.has(key)) continue
        const target = l.unit_id ? `/textbook-units/${l.unit_id}` : `/textbooks/${l.edition_id}`
        pageEvidence.set(key, `${link(target, `${l.textbook_title}${l.title ? ` · ${l.title}` : '（整册）'}`)}<span class="kbp-note">${l.printed_page ? `，第 ${l.printed_page} 页` : ''} · 机器对齐，待核验</span>`)
    }
    for (const [edition, textbook, unit, unitId, viaAi] of nationalUnits.get(standard.code) || []) {
        const key = unitId || `${edition}|${unit}`
        if (pageEvidence.has(key)) continue
        pageEvidence.set(key, `${link(unitId ? `/textbook-units/${unitId}` : `/textbooks/${edition}`, `${textbook} · ${unit}`)}<span class="kbp-note"> · ${viaAi === 2 ? 'AI 逐课判断' : viaAi ? 'AI 按单元判断' : '机器对齐'}，待核验</span>`)
    }
    const byLesson = standard.indicators.filter(item => nationalPoints.has(item.code)).map(item => `<li><span class="kbp-code">${esc(item.code)}</span> ${esc(item.text.length > 46 ? `${item.text.slice(0, 46)}…` : item.text)}${list(nationalPoints.get(item.code).map(([edition, textbook, unit, , lessonTitle, relation, quote, source, page]) => `${link(`/textbooks/${edition}/standards`, `${textbook} · ${lessonTitle || unit}`)}<span class="kbp-note"> · ${RELATION_LABEL[relation]} · “${esc(quote)}”（${esc(SOURCE_LABEL(source, page))}）</span>`))}</li>`)
    const siblings = subject.standards
        .filter(other => other.code !== standard.code && other.stage_code === standard.stage_code && other.level1 === standard.level1)
        .slice(0, 12).map(other => `${link(`/standards/${other.code}`, other.level2)} <span class="kbp-code">${esc(other.code)}</span>`)
    const statementNote = (standard.name_source === 'kebiao' ? '标准名为 kebiao 整理 · ' : '') + (standard.statement_source === 'official'
        ? ['标准句为课标原文', standard.statement_section, pagesNote(standard.statement_pages)].filter(Boolean).join(' · ')
        : '标准句为 kebiao 整理，用课标原词概括本单元；原文见下列要点。')
    const main = `${crumbNav(crumbs)}
<p class="kbp-kicker">${esc([subject.subject, stage, standard.level1, standard.theme].filter(Boolean).join(' · '))}</p>
<h1>${esc(standard.level2)}</h1>
<p class="kbp-code">标准编码 ${esc(standard.code)}</p>
<blockquote>${esc(standard.statement)}</blockquote>
<p class="kbp-note">${esc(statementNote)}</p>
${section(`要点（${standard.indicators.length} 条，课标原文）`, `<ol>${indicators}</ol>`)}
${section('学习任务群说明', official(standard.intro || []))}
${section('学业要求', official(standard.requirements))}
${section('教学提示', official(standard.guidance))}
${standard.examples.length ? section('表现示例（kebiao 整理）', list(standard.examples.map(example => esc(example.text)))) : ''}
${byLesson.length ? section('教材里在哪教（逐课）', `<ul>${byLesson.join('')}</ul><p class="kbp-note">AI 逐课读了教材原文后判断，引号里是这一课教材的原话；待核验。</p>`) : ''}
${section('对应教材', list([...pageEvidence.values()]))}
${section(`同学段同领域的其他标准（${standard.level1}）`, list(siblings))}
<p class="kbp-note">${esc(subject.source_note)}</p>`
    add(meta, main, {
        type: 'article',
        image: cardUrl(`s/${standard.code}`),
        jsonLd: [breadcrumbs(crumbs), {
            '@context': 'https://schema.org',
            '@type': 'DefinedTerm',
            '@id': `${SITE_URL}/standards/${standard.code}`,
            name: standard.level2,
            termCode: standard.code,
            description: clip(standard.statement, 300),
            url: `${SITE_URL}/standards/${standard.code}`,
            inDefinedTermSet: { '@type': 'DefinedTermSet', name: `义务教育${subject.subject}课程标准（2022年版2025年修订）`, url: `${SITE_URL}/subjects/${subject.subject_slug}` }
        }],
        preload: { standards: [{ ...standard, _subject: subjectHeader(subject) }] }
    })
}

function skillPages() {
    const subskillCount = skillsMeta.reduce((sum, skill) => sum + (skill.subskills || []).length, 0)
    const crumbs = [['首页', '/'], ['可迁移技能', '/skills']]
    add(skillsOverviewMeta({ competencyCount: skillsMeta.length, subskillCount }), `${crumbNav(crumbs)}
<p class="kbp-kicker">可迁移技能 · ${skillsMeta.length} 个领域 ${subskillCount} 项子技能</p>
<h1>可迁移技能</h1>
${skillsMeta.map(skill => `<section><h2>${link(`/skills/${skill.code}`, `${skill.code} ${skill.name_cn}`)}</h2><p>${esc(skill.tagline_cn)}</p>${list((skill.subskills || []).map(sub => `${esc(sub.code)} ${esc(sub.name_cn)}`))}</section>`).join('')}`, { jsonLd: [breadcrumbs(crumbs)] })

    for (const skill of skillsMeta) {
        const skillCrumbs = [...crumbs, [skill.name_cn, `/skills/${skill.code}`]]
        const tagged = subjects.map(subject => {
            const primary = standardsBySubject.get(subject.subject_slug).filter(standard => (standard.ts_primary || []).some(code => code.split('.')[0] === skill.code))
            return primary.length ? `<h3>${esc(subject.subject)}（${primary.length} 条）</h3>${list(primary.slice(0, 12).map(standard => standardLink(standard.code)))}` : ''
        }).join('')
        add(skillMeta(skill), `${crumbNav(skillCrumbs)}
<p class="kbp-kicker">可迁移技能 · ${esc(skill.code)}</p>
<h1>${esc(skill.name_cn)}</h1>
<p class="kbp-lede">${esc(skill.tagline_cn)}</p>
<p>${esc(skill.definition_cn)}</p>
${section('课堂上看得见的表现', list((skill.look_fors || []).map(esc)))}
${section('教师可以这样做', list((skill.teacher_moves || []).map(esc)))}
${section('子技能', (skill.subskills || []).map(sub => `<h3>${esc(sub.code)} ${esc(sub.name_cn)}</h3><p>${esc(sub.definition_cn)}</p>`).join(''))}
${section('以它为主要技能的课标', tagged)}`, { jsonLd: [breadcrumbs(skillCrumbs)] })
    }
}

function textbookPages() {
    const crumbs = [['首页', '/'], ['教材馆', '/textbooks']]
    const bySubject = [...new Set(textbooks.map(book => book.subject))]
    // the editions the library has no PDF of (fetch_platform_editions.mjs)
    const platformBooks = existsSync(join(DATA, 'textbooks/platform_books.json')) ? readJson('textbooks/platform_books.json').books : []
    add(textbooksMeta({ textbookCount: textbooks.length }), `${crumbNav(crumbs)}
<p class="kbp-kicker">教材馆 · ${textbooks.length} 册</p>
<h1>选你的教材</h1>
<p class="kbp-lede">${textbooks.length} 本有原书；${platformBooks.length ? `另有北师大、苏教、冀教、华东师大、青岛版等 ${platformBooks.length} 本只有国家平台的课目录。` : ''}每一课教哪几条课标、原话在第几页，都已逐课标好。</p>
${bySubject.map(subject => section(subject, list(textbooks.filter(book => book.subject === subject).map(book => link(`/textbooks/${book.edition_id}`, `${book.edition_name}${book.title}`))))).join('')}
${platformBooks.length ? section('只有课目录的版本', `<p>馆里没有这些书的原书；课目录来自国家中小学智慧教育平台，每一课教哪几条课标同样逐课标好。</p>${list(platformBooks.map(book => link(`/textbooks/${book.edition_id}/standards`, `${book.edition_name}${book.title}`)))}`) : ''}`, { jsonLd: [breadcrumbs(crumbs)] })

    const edition = id => JSON.parse(readFileSync(join(DATA, 'textbooks/by-edition', `${id}.json`), 'utf8'))
    const alignedBooks = new Set(existsSync(join(DATA, 'textbooks/national-lessons')) ? readdirSync(join(DATA, 'textbooks/national-lessons')).filter(file => file.startsWith('ed_')).filter(file => readJson(`textbooks/national-lessons/${file}`).lessons.some(lesson => lesson.align?.length)).map(file => file.replace(/\.json$/u, '')) : [])
    const hasAlignment = id => alignedBooks.has(id)
    for (const book of textbooks) {
        const detail = edition(book.edition_id)
        const bookCrumbs = [...crumbs, [book.title, `/textbooks/${book.edition_id}`]]
        const toc = (detail.toc || []).map(entry => `${link(`/textbook-units/${entry.entry_id}`, entry.title)}${entry.printed_page ? ` <span class="kbp-note">第 ${esc(entry.printed_page)} 页</span>` : ''}`)
        const aligned = [...new Set((detail.alignments || []).map(item => item.standard_code))].filter(code => standardsByCode.has(code)).map(standardLink)
        add(textbookMeta(book), `${crumbNav(bookCrumbs)}
<p class="kbp-kicker">${esc([book.subject, book.stage_label, book.grade_label, book.volume].filter(Boolean).join(' · '))}</p>
<h1>${esc(book.title)}</h1>
<p class="kbp-lede">${esc(book.edition_name)} · 共 ${esc(book.page_count)} 页${book.revision_label ? ` · ${esc(book.revision_label)}` : ''}</p>
${hasAlignment(book.edition_id) ? `<p>${link(`/textbooks/${book.edition_id}/standards`, '课标对应表：每一课教哪几条课标要点')}</p>` : ''}
${section('目录', list(toc))}
${section('对应的课程标准', list(aligned))}`, {
            type: 'book',
            jsonLd: [breadcrumbs(bookCrumbs), { '@context': 'https://schema.org', '@type': 'Book', name: book.title, bookEdition: book.edition_name, inLanguage: 'zh-CN', educationalLevel: book.grade_label, about: book.subject, numberOfPages: book.page_count }]
        })
    }

    // 课标对应表: every lesson with the 要点 it teaches and the textbook's own words
    const v2Points = new Map(v2Subjects.flatMap(subject => subject.standards.flatMap(standard => (standard.indicators || []).map(item => [item.code, item.text]))))
    // and the editions the library has no PDF of
    for (const book of [...textbooks, ...platformBooks]) {
        if (!book.edition_id.startsWith('pf_') && !hasAlignment(book.edition_id)) continue
        const record = readJson(`textbooks/national-lessons/${book.edition_id}.json`)
        const tableCrumbs = book.edition_id.startsWith('pf_')
            ? [...crumbs, [`${book.title}（${book.edition_name}）`, `/textbooks/${book.edition_id}/standards`]]
            : [...crumbs, [book.title, `/textbooks/${book.edition_id}`], ['课标对应表', `/textbooks/${book.edition_id}/standards`]]
        const byUnit = new Map()
        for (const lesson of record.lessons) {
            if (!lesson.align?.length) continue
            const unit = lesson.chapters[0] || lesson.title
            if (!byUnit.has(unit)) byUnit.set(unit, new Map())
            const title = lesson.title.replace(/[（(]?第[一二三四五六七八九十\d]+课时[）)]?/gu, '').trim()
            // one lesson the platform lists several times (「正数与负数（一）」) is shown once, by its plainest title
            const key = title.replace(/^\d+(?:\.\d+)+\s*/u, '').replace(/(?:[（(][一二三四五六七八九十\d][）)])?\d?$/u, '') || title
            const seen = [...byUnit.get(unit)].find(([, item]) => item.key === key)
            if (!seen) byUnit.get(unit).set(title, { key, align: lesson.align })
            else if (title.length < seen[0].length) { byUnit.get(unit).delete(seen[0]); byUnit.get(unit).set(title, seen[1]) }
        }
        const rows = align => align.map(([code, relation, quote, source, page]) => `<span class="kbp-code">${esc(code)}</span> ${esc(RELATION_LABEL[relation])}：${esc(v2Points.get(code) || '')}<span class="kbp-note">（“${esc(quote)}”，${esc(SOURCE_LABEL(source, page))}）</span>`).join('<br>')
        add(textbookAlignmentMeta(book), `${crumbNav(tableCrumbs)}
<p class="kbp-kicker">课标对应表 · ${esc(book.edition_name)} · ${esc(book.title)}</p>
<h1>这本书的每一课，教的是哪几条课标要点</h1>
<p class="kbp-lede">${book.edition_id.startsWith('pf_') ? 'AI 逐课读了国家平台上这一课的课题，以及能找到的教学设计、学习任务单或课件（这一版教材馆里没有原书）' : 'AI 逐课读了这一课的教材原文（或国家平台教学设计里的教学目标）'}，对照本年级课标的全部要点判断「主要在教」和「也涉及」，每条附这一课材料的原话。机器判断，待核验。</p>
${[...byUnit].map(([unit, lessons]) => section(unit, list([...lessons].map(([title, item]) => `<strong>${esc(title)}</strong><br>${rows(item.align)}`)))).join('')}`, { jsonLd: [breadcrumbs(tableCrumbs)] })
    }

    for (const unit of units) {
        const book = textbooksById.get(unit.edition_id)
        const unitCrumbs = [...crumbs, [book.title, `/textbooks/${book.edition_id}`], [unit.title, `/textbook-units/${unit.entry_id}`]]
        const aligned = []
        const seen = new Set()
        for (const item of v2TextbookLinks.units[unit.entry_id] || []) {
            const found = v2ByCode.get(item.code)
            if (!found || seen.has(item.code)) continue
            seen.add(item.code)
            aligned.push(`${link(`/standards/${item.code}${item.indicator ? `#${item.indicator}` : ''}`, `${found.standard.level2}（${found.subject.subject}${v2StageLabel(found.standard, found.subject)}）`)} <span class="kbp-note">${esc(item.indicator || item.code)} · 机器对齐，待核验</span>`)
        }
        for (const item of NEW_SUBJECTS.has(book.subject_slug) && aligned.length ? [] : unit.alignments || []) {
            if (seen.has(item.standard_code) || !standardsByCode.has(item.standard_code)) continue
            seen.add(item.standard_code)
            aligned.push(`${standardLink(item.standard_code)}${item.review_status === 'approved' ? '' : ' <span class="kbp-note">机器对齐，待核验</span>'}`)
        }
        add(textbookUnitMeta(unit, book), `${crumbNav(unitCrumbs)}
<p class="kbp-kicker">${esc([book.edition_name, book.title].join(' · '))}</p>
<h1>${esc(unit.title)}</h1>
<p class="kbp-lede">${unit.printed_page ? `教材第 ${esc(unit.printed_page)} 页起` : ''}</p>
${aligned.length ? section('对应的课程标准', list(aligned)) : `<p class="kbp-note">这个单元还没有逐条对应的课标，可以在${link(`/subjects/${book.subject_slug}`, `${book.subject}课程标准`)}里按年级查找。</p>`}`, { jsonLd: [breadcrumbs(unitCrumbs)] })
    }
}

function learningResourcePages() {
    const crumbs = [['首页', '/'], ['开放学习资源', '/learning-resources']]
    add(learningResourcesMeta({ resourceCount: learningResources.length }), `${crumbNav(crumbs)}
<p class="kbp-kicker">开放学习资源 · ${learningResources.length} 个</p>
<h1>开放学习资源</h1>
<p class="kbp-lede">精选的开放学习资源，标明许可与国内能否直接访问，点击跳转原站使用。</p>
${section('国内官方平台', list(platforms.map(platform => `<a href="${esc(platform.url)}" rel="noopener">${esc(platform.title)}</a> <span class="kbp-note">${esc(platform.provider)}</span><br><span class="kbp-note">${esc(platform.how_to_use)}</span>`)))}
${list(learningResources.map(resource => `${link(`/learning-resources/${resource.id}`, resource.title_zh)} <span class="kbp-note">${esc(resource.provider)}</span>`))}`, { jsonLd: [breadcrumbs(crumbs)] })

    for (const resource of learningResources) {
        const resourceCrumbs = [...crumbs, [resource.title_zh, `/learning-resources/${resource.id}`]]
        const aligned = (resource.standards || []).filter(item => standardsByCode.has(item.code)).map(item => `${standardLink(item.code)}${item.rationale_zh ? `<br><span class="kbp-note">${esc(item.rationale_zh)}</span>` : ''}`)
        add(learningResourceMeta(resource), `${crumbNav(resourceCrumbs)}
<p class="kbp-kicker">${esc(resource.provider)}</p>
<h1>${esc(resource.title_zh)}</h1>
${paras(resource.summary_zh)}
${section('怎么用', paras(resource.how_to_use_zh))}
${section('对应的课程标准', list(aligned))}
<p class="kbp-note">许可：${esc(resource.license)} · <a href="${esc(resource.url)}" rel="noopener">打开原站 ↗</a></p>`, { jsonLd: [breadcrumbs(resourceCrumbs)] })
    }
}

function conceptPages() {
    const crumbs = [['首页', '/'], ['概念词典', '/concepts']]
    const name = slug => concepts.subject_names[slug] || slug
    add(conceptsMeta({ termCount: concepts.terms.length }), `${crumbNav(crumbs)}
<p class="kbp-kicker">概念词典 · ${concepts.terms.length} 个概念</p>
<h1>这些词，课标原文是怎么说的</h1>
<p class="kbp-lede">大概念、大单元、学习任务群、教—学—评一致性……逐条引用修订版课标原文和页码，写清各学科用法的不同，附国外课程的对照、常见误解和真实条目。</p>
${concepts.categories.map(category => section(category.label, list(concepts.terms.filter(term => term.category === category.id).map(term => `${link(`/concepts/${term.id}`, term.term)} <span class="kbp-note">${esc(clip(term.plain, 60))}</span>`)))).join('')}
${section('每门学科的骨架', list(concepts.subjects.map(subject => `${link(`/concepts/subjects/${subject.slug}`, `${subject.name}课标的骨架`)} <span class="kbp-note">${esc(clip(subject.organized_by, 60))}</span>`)))}`, { jsonLd: [breadcrumbs(crumbs)] })

    for (const term of concepts.terms) {
        const termCrumbs = [...crumbs, [term.term, `/concepts/${term.id}`]]
        const quotes = term.quotes.map(quote => `<blockquote>${esc(quote.text)}</blockquote><p class="kbp-note">${esc(name(quote.subject))} · 修订版 PDF 第 ${quote.pages.join('–')} 页${quote.note ? `。${esc(quote.note)}` : ''}</p>`).join('')
        add(conceptMeta(term), `${crumbNav(termCrumbs)}
<p class="kbp-kicker">${esc(concepts.categories.find(item => item.id === term.category)?.label || '')}</p>
<h1>${esc(term.term)}</h1>
<p class="kbp-lede">${esc(term.plain)}</p>
${section('课标原文', quotes)}
${section('各学科怎么用', list(term.by_subject.map(item => `<strong>${esc(name(item.subject))}</strong>：${esc(item.text)}`)))}
${section('备课时怎么用', paras(term.how_to_use))}
${section('常见误解', list(term.misreadings.map(esc)))}
${section('国外怎么处理同一件事', list(term.abroad.map(item => `<strong>${esc(item.name)}</strong>：${esc(item.text)}`)))}
${section('在 kebiao 里看真实条目', list([...term.examples, ...term.mentions].map(item => `${link(`/standards/${item.code}`, item.title)} <span class="kbp-code">${esc(item.code)}</span>${item.why ? `<br><span class="kbp-note">${esc(item.why)}</span>` : ''}`)))}`, { jsonLd: [breadcrumbs(termCrumbs), { '@context': 'https://schema.org', '@type': 'DefinedTerm', name: term.term, description: term.plain, inDefinedTermSet: `${SITE_URL}/concepts` }] })
    }

    for (const subject of concepts.subjects) {
        const subjectCrumbs = [...crumbs, [`${subject.name}课标的骨架`, `/concepts/subjects/${subject.slug}`]]
        add(subjectSkeletonMeta(subject), `${crumbNav(subjectCrumbs)}
<p class="kbp-kicker">${subject.standard_count} 条标准 · ${subject.indicator_count} 条要点</p>
<h1>${esc(subject.name)}课标的骨架</h1>
<p class="kbp-lede">${esc(subject.organized_by)}</p>
<p>核心素养：${esc(subject.core_literacy.join('、'))}</p>
${section('课标原文', `<blockquote>${esc(subject.quote.text)}</blockquote><p class="kbp-note">修订版 PDF 第 ${subject.quote.pages.join('–')} 页</p>`)}
${subject.ideas ? section('课程理念', `<ol>${subject.ideas.items.map(item => `<li>${esc(item)}</li>`).join('')}</ol><p class="kbp-note">修订版 PDF 第 ${subject.ideas.pages[0]}–${subject.ideas.pages.at(-1)} 页</p>`) : ''}
${section('备课时的抓手', paras(subject.unit_hint))}
${subject.groups.map(group => section(group.name, list(group.children.map(child => `${esc(child.name)}：${child.standards.map(([code, stage]) => link(`/standards/${code}`, `${stage.replace('-', '–')} 年级`)).join('、')}`)))).join('')}`, { jsonLd: [breadcrumbs(subjectCrumbs)] })
    }
}

function interdisciplinaryPage() {
    const crumbs = [['首页', '/'], ['跨学科主题库', '/interdisciplinary']]
    const grades = list => (list.length > 1 ? `${list[0]}–${list.at(-1)} 年级` : `${list[0]} 年级`)
    add(STATIC_PAGE_META['/interdisciplinary'], `${crumbNav(crumbs)}
<p class="kbp-kicker">跨学科主题库 · ${interdisciplinary.theme_count} 个主题</p>
<h1>跨学科主题学习，课标里给了哪些主题</h1>
<blockquote>${esc(interdisciplinary.basis.text)}</blockquote><p class="kbp-note">义务教育课程方案（2022年版2025年修订）第 ${interdisciplinary.basis.pages.join('、')} 页</p>
${interdisciplinary.groups.map(group => section(`${group.subject}：${group.title}`, list(group.themes.map(theme => `<strong>${esc(theme.name)}</strong>（${esc(theme.level ? `${theme.group} · ${theme.level}，` : '')}${grades(theme.grades)}${theme.with.length ? `；结合${esc(theme.with.join('、'))}` : ''}）<br><span class="kbp-note">${esc(theme.quote)}（修订版第 ${theme.pages.join('、')} 页）</span>`)))).join('')}
${section('写进内容要求的跨学科学习', list(interdisciplinary.standards.map(item => `${link(`/standards/${item.code}`, `${item.subject} · ${item.title}（${item.stage_label}）`)} <span class="kbp-code">${esc(item.code)}</span>`)))}`, { jsonLd: [breadcrumbs(crumbs)] })
}

function experimentsPage() {
    const crumbs = [['首页', '/'], ['必做实验清单', '/experiments']]
    const stage = { '1-2': '1–2 年级', '3-4': '3–4 年级', '5-6': '5–6 年级', '7-9': '7–9 年级' }
    add(STATIC_PAGE_META['/experiments'], `${crumbNav(crumbs)}
<h1>课标规定的必做实验和探究实践</h1>
<p class="kbp-lede">${esc(STATIC_PAGE_META['/experiments'].description)}</p>
${experiments.science.stages.map(item => section(`科学 · ${stage[item.stage]}`, `<ol>${item.items.map(entry => `<li>${esc(entry.text)} <span class="kbp-note">修订版第 ${entry.page} 页</span></li>`).join('')}</ol>`)).join('')}
${experiments.groups.flatMap(group => group.standards.map(standard => section(`${group.subject_slug === 'physics' ? '物理' : '化学'} · ${standard.title}`, `<ol>${standard.items.map(entry => `<li>${esc(entry.text)} ${link(`/standards/${standard.code}#${entry.code}`, entry.code)}</li>`).join('')}</ol>`))).join('')}`, { jsonLd: [breadcrumbs(crumbs)] })
}

// 课堂诊断: every question as text, by book, with the misconceptions it can show (the page itself is for projecting)
function checksPages() {
    if (!checkBanks.length) return
    const crumbs = [['首页', '/'], ['课堂诊断', '/checks']]
    const total = checkBanks.reduce((sum, bank) => sum + bank.items.length, 0)
    // per subject and book: where the questions follow (edition and volume, or the 学段) and their topics
    const bookLine = (bank, book) => {
        const topics = bank.items.filter(item => item.book === book.key).map(item => item.topic)
        const name = book.edition === '课标' ? book.label : `${book.edition}${book.label}`
        return `${link(`/checks?subject=${bank.subject_slug}&book=${book.key}`, name)}（${topics.length} 题）：${esc(topics.join('、'))}`
    }
    add(STATIC_PAGE_META['/checks'], `${crumbNav(crumbs)}
<p class="kbp-kicker">课堂诊断 · ${checkBanks.length} 个学科 · ${total} 题</p>
<h1>上课先问一道题，看清全班怎么想</h1>
<p class="kbp-lede">${esc(STATIC_PAGE_META['/checks'].description)}</p>
<p>${link('/checks/after', '批完就用：批完作业，明天开课 5 分钟补上')}</p>
${checkBanks.map(bank => section(`${bank.subject} · ${bank.items.length} 题 · ${Object.keys(bank.misconceptions).length} 种常见错法`, list(bank.books.map(book => bookLine(bank, book))))).join('')}`, { jsonLd: [breadcrumbs(crumbs)] })
    add(STATIC_PAGE_META['/checks/after'], `${crumbNav([...crumbs, ['批完就用', '/checks/after']])}
<h1>批完作业，点一下看到的错法，明天开课用 5 分钟补上</h1>
<p class="kbp-lede">${esc(STATIC_PAGE_META['/checks/after'].description)}</p>`, { jsonLd: [breadcrumbs([...crumbs, ['批完就用', '/checks/after']])] })
}

function teacherExamPage() {
    const crumbs = [['首页', '/'], ['教资课标速记', '/teacher-exam']]
    const notes = concepts.subjects.filter(subject => subject.ideas)
    add(STATIC_PAGE_META['/teacher-exam'], `${crumbNav(crumbs)}
<p class="kbp-kicker">教资备考 · ${notes.length} 门课程 · 修订版课标原文，标明页码</p>
<h1>考前把课标读懂</h1>
<p class="kbp-lede">教师资格笔试的学科知识与教学能力、面试的试讲和答辩，都会问到所教学科课标的课程理念和核心素养。按下面四步走。</p>
${section('备考路线', `<ol>${[
        `${link('/concepts#concept-path', '先读这六页')}：一本课标怎么读、核心素养、目标怎么写`,
        `课标速记：下面 ${notes.length} 门课的课程理念和核心素养，遮住自测`,
        `${link('/lesson-plan?for=trial', '试讲稿与答辩')}：选一课起草教案，再生成 10 分钟试讲和 3 道答辩`,
        `${link('/concepts', '概念词典')}：大单元、任务群、教—学—评一致性`
    ].map(item => `<li>${item}</li>`).join('')}</ol>`)}
${notes.map(subject => section(subject.name, `<p>核心素养：${esc(subject.core_literacy.join('、'))}</p><p>课程理念（修订版 PDF 第 ${subject.ideas.pages[0]}–${subject.ideas.pages.at(-1)} 页）：</p><ol>${subject.ideas.items.map(item => `<li>${esc(item)}</li>`).join('')}</ol><p>${link(`/concepts/subjects/${subject.slug}`, `${subject.name}课标的骨架`)}</p>`)).join('')}`, { jsonLd: [breadcrumbs(crumbs)] })
}

// 知识图谱: a hub and one page per subject, every thread with its stations, 要点, lessons and 要先会 lines
function knowledgeGraphPages() {
    const graphManifest = readJson('v2/graph/manifest.json')
    const hubCrumbs = [['首页', '/'], ['知识图谱', '/knowledge-graph']]
    add(STATIC_PAGE_META['/knowledge-graph'], `${crumbNav(hubCrumbs)}
<p class="kbp-kicker">${V2_STANDARDS_DOC}</p>
<h1>知识图谱</h1>
<p class="kbp-lede">每个点是课标里的一句要点。点一个，看它要先会什么、后面用到哪里、在哪本教材哪一课教。</p>
${list(graphManifest.subjects.map(entry => `${link(`/knowledge-graph/${entry.slug}`, `${entry.subject}知识图谱`)} <span class="kbp-code">${entry.lanes} 条线索 · ${entry.points} 个要点 · ${entry.taught} 个找到了主要在教的课</span>`))}
<p class="kbp-note">「要先会」：学生没掌握前一个要点，很可能学不好后一个，不表示必须先学完；由 AI 逐条判断，待核验。「同一线索」：课标里同一主题的上一学段或下一学段。</p>`, { jsonLd: [breadcrumbs(hubCrumbs)] })
    for (const entry of graphManifest.subjects) {
        const graph = readJson(`v2/graph/${entry.slug}.json`)
        const textOf = code => graph.points[code]?.t || graph.external[code]?.t || ''
        const columnLabel = key => (key === 'shared' ? '七至九年级共同' : graph.columns.find(column => column.key === key)?.label || key)
        const before = new Map()
        for (const [source, target, reason] of graph.edges) if (graph.points[target]) before.set(target, [...(before.get(target) || []), [source, reason]])
        const keys = [...graph.columns.map(column => column.key), 'shared']
        const lanes = graph.lanes.map(lane => {
            const stations = keys.flatMap(key => (lane.cells[key] || []).map(std => [key, std])).map(([key, std]) => {
                const info = graph.standards[std]
                const codes = info.points.filter(code => graph.points[code]?.col === key)
                if (!codes.length) return ''
                return `<h3>${esc(columnLabel(key))} · ${link(`/standards/${std}`, info.title)}</h3>${list(codes.map(code => {
                    const point = graph.points[code]
                    const lines = (before.get(code) || []).map(([source, reason]) => `${esc(source)}「${esc(clip(textOf(source), 30))}」（${esc(reason)}）`)
                    return `<span class="kbp-code">${esc(code)}</span> ${esc(point.t)}${point.tags?.length ? `<br><span class="kbp-note">教材：${esc(point.tags.join('；'))}</span>` : ''}${lines.length ? `<br><span class="kbp-note">要先会：${lines.join('；')}</span>` : ''}`
                }))}`
            }).join('')
            const requirements = (lane.requirements || []).map(item => `<p class="kbp-note">学业要求（课标第 ${item.pages.join('、')} 页）：${esc(item.text)}</p>`).join('')
            return section(`${lane.group ? `${lane.group} · ` : ''}${lane.name}`, requirements + stations)
        }).join('')
        const crumbs = [...hubCrumbs, [`${entry.subject}`, `/knowledge-graph/${entry.slug}`]]
        add(knowledgeGraphMeta({ slug: entry.slug, subject: entry.subject }), `${crumbNav(crumbs)}
<p class="kbp-kicker">知识图谱 · ${esc(entry.subject)} · ${entry.points} 个要点</p>
<h1>${esc(entry.subject)}知识图谱</h1>
<p class="kbp-lede">${entry.lanes} 条线索，${entry.points} 个要点，按年级从左到右排开；${entry.taught} 个要点在教材里找到了主要在教的课。每个要点都可以看它要先会什么、后面用到哪里、在哪一课教。</p>
${graph.about.threads ? `<p class="kbp-note">${esc(graph.about.threads)}</p>` : ''}
${lanes}
<p class="kbp-note">要点逐字取自${V2_STANDARDS_DOC}。「要先会」和「教材里的课」由 AI 判断，待核验。</p>`, { jsonLd: [breadcrumbs(crumbs)], image: cardUrl(`subject/${entry.slug}`) })
    }
}

function staticPages() {
    const terms = glossary.terms || []
    add(STATIC_PAGE_META['/glossary'], `<h1>术语表</h1>${terms.map(term => `<section><h2>${esc(term.term)}</h2><p>${esc(term.definition)}</p></section>`).join('')}`)
    add(STATIC_PAGE_META['/open-data'], `<h1>课标数据，拿去用</h1><p class="kbp-lede">${esc(STATIC_PAGE_META['/open-data'].description)}</p><ul><li><a href="/data/v2/export/kebiao-indicators.csv">全部要点 CSV</a></li><li><a href="/data/v2/export/kebiao-standards.csv">全部标准 CSV</a></li><li><a href="/data/v2/legacy_codes.json">新旧编码对照 JSON</a></li></ul><p>署名：课标结构化数据：kebiao 课标（https://www.kebiao.org），CC BY 4.0。课标原文取自教育部《义务教育课程标准（2022年版2025年修订）》，不在许可内。</p><p>${link('/api/v1/docs', 'API 文档')} · ${link('/ai', '在 AI 里用 kebiao')}</p>`)
    add(STATIC_PAGE_META['/ai'], `<h1>让你常用的 AI 引用课标原文</h1><p class="kbp-lede">${esc(STATIC_PAGE_META['/ai'].description)}</p><p>MCP 服务器地址：https://www.kebiao.org/mcp（Streamable HTTP，无需 API Key）。在 WorkBuddy 的「连接器 → 自定义连接器」里粘贴配置即可；扣子、魔搭、Claude、Cursor 也能接。</p><p>${link('/lesson-plan', 'AI 备课')} · ${link('/open-data', '数据与接口')}</p>`)
    add(STATIC_PAGE_META['/contact'], `<h1>联系我们</h1><p class="kbp-lede">${esc(STATIC_PAGE_META['/contact'].description)}</p>`)
    add(STATIC_PAGE_META['/lesson-plan'], `<h1>AI 备课：从教材的一课起草有课标依据的教案</h1><p class="kbp-lede">${esc(STATIC_PAGE_META['/lesson-plan'].description)}</p><p>AI 只按你勾选的课标要点写，每条目标标出依据编码；写完后逐条核验：有没有超出课标写明的限定，目标有没有对应的教学环节和评价任务。可复制、下载 Word、打印。</p>`)
    add(STATIC_PAGE_META['/guide'], `<h1>五分钟学会用 kebiao 备课</h1><p class="kbp-lede">${esc(STATIC_PAGE_META['/guide'].description)}</p><p>${link('/lesson-plan', 'AI 备课')} · ${link('/knowledge-graph', '知识图谱')} · ${link('/concepts', '概念词典')} · ${link('/experiments', '必做实验清单')}</p>`)
    add(STATIC_PAGE_META['/smart-search'], `<h1>智能检索</h1><p class="kbp-lede">${esc(STATIC_PAGE_META['/smart-search'].description)}</p>`)
}

homePage()
standardsHubPage()
v2Subjects.forEach(subjectPage)
for (const entry of v2ByCode.values()) standardPage(entry)
skillPages()
textbookPages()
learningResourcePages()
conceptPages()
interdisciplinaryPage()
experimentsPage()
checksPages()
teacherExamPage()
knowledgeGraphPages()
staticPages()

// ---------- render ----------
const LOGO = logoSvg({ attrs: 'aria-hidden="true" focusable="false"' })
const STYLE = `<style id="kbp-style">
.kbp{color:var(--kb-ink,#eceff4);font-family:var(--font-body,system-ui,sans-serif);line-height:1.8}
.kbp a{color:inherit;text-decoration-color:rgba(233,200,135,.5);text-underline-offset:3px}
.kbp-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 20px;padding:16px max(16px,4vw);border-bottom:1px solid var(--kb-line,rgba(222,228,238,.14))}
.kbp-brand{display:block;align-self:center;line-height:0}
.kbp-brand svg{display:block;height:28px;width:auto;aspect-ratio:332.8/102}
.kbp-head nav{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:14px;color:var(--kb-mist,#aab2bf)}
.kbp-head nav a{text-decoration:none}
.kbp-wrap{max-width:860px;margin:0 auto;padding:32px max(16px,4vw) 48px}
.kbp-crumb{font-size:13px;color:var(--kb-mist,#aab2bf)}
.kbp-kicker{margin:20px 0 6px;font-family:var(--font-mono,monospace);font-size:12px;letter-spacing:.06em;color:var(--kb-gold,#e9c887)}
.kbp h1{margin:0 0 12px;font-family:var(--font-display,serif);font-size:clamp(28px,5vw,44px);font-weight:900;line-height:1.25}
.kbp h2{margin:36px 0 10px;font-family:var(--font-display,serif);font-size:20px}
.kbp h3{margin:20px 0 6px;font-size:16px}
.kbp-lede{font-size:17px}
.kbp blockquote{margin:0;padding:12px 16px;border-left:2px solid var(--kb-gold,#e9c887);background:rgba(255,255,255,.03)}
.kbp ul{padding-left:1.2em}.kbp li{margin:4px 0}
.kbp-code,.kbp-note{font-size:13px;color:var(--kb-mist,#aab2bf)}
.kbp-code{font-family:var(--font-mono,monospace)}
.kbp-foot{padding:0 0 24px;font-size:12px;color:var(--kb-dim,#858e9c)}
.kbp-foot .kbp-wrap{padding-top:16px;padding-bottom:0;border-top:1px solid var(--kb-line,rgba(222,228,238,.14))}
</style>`

const NAV = [...v2Subjects.map(subject => link(`/subjects/${subject.subject_slug}`, subject.subject)), link('/textbooks', '教材馆'), link('/knowledge-graph', '知识图谱'), link('/concepts', '概念词典'), link('/skills', '可迁移技能'), link('/smart-search', '智能检索')].join('')
const FOOTER = '<footer class="kbp-foot"><div class="kbp-wrap"><p>课标原文来自教育部《义务教育课程标准（2022年版）》及其 2025 年日常修订版。kebiao 是独立的开放索引，与教育部无隶属关系。</p></div></footer>'

function render(page) {
    const url = SITE_URL + encodeURI(page.path)
    const headTags = [
        `<link rel="canonical" href="${esc(url)}" />`,
        `<meta property="og:site_name" content="${SITE_NAME}" />`,
        `<meta property="og:type" content="${page.type || 'website'}" />`,
        `<meta property="og:title" content="${esc(page.title)}" />`,
        `<meta property="og:description" content="${esc(page.description)}" />`,
        `<meta property="og:url" content="${esc(url)}" />`,
        '<meta property="og:locale" content="zh_CN" />',
        '<meta name="twitter:card" content="summary_large_image" />',
        `<meta property="og:image" content="${esc(page.image || cardUrl('site'))}" />`,
        '<meta property="og:image:width" content="1200" />',
        '<meta property="og:image:height" content="630" />',
        `<meta name="twitter:image" content="${esc(page.image || cardUrl('site'))}" />`,
        ...(page.jsonLd || []).map(item => `<script type="application/ld+json">${scriptJson(item)}</script>`),
        STYLE
    ].join('\n  ')
    const body = `<div id="root"><div class="kbp" data-prerender="${esc(page.path)}"><header class="kbp-head"><a class="kbp-brand" href="/" aria-label="kebiao 课标 首页">${LOGO}</a><nav aria-label="主要栏目">${NAV}</nav></header><main data-prerender-main><div class="kbp-wrap">${page.main}</div></main>${FOOTER}</div></div>${page.preload ? `\n  <script type="application/json" id="kb-preload">${scriptJson(page.preload)}</script>` : ''}`
    return shell
        .replace(/<title>[^<]*<\/title>/u, () => `<title>${esc(page.title)}</title>`)
        .replace(/<meta name="description" content="[^"]*" \/>/u, () => `<meta name="description" content="${esc(page.description)}" />\n  ${headTags}`)
        .replace('<div id="root"></div>', () => body)
}

const seen = new Set()
for (const page of pages) {
    if (seen.has(page.path)) throw new Error(`Duplicate prerender path: ${page.path}`)
    seen.add(page.path)
    const file = page.path === '/' ? join(DIST, 'index.html') : join(DIST, page.path, 'index.html')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, render(page))
}
console.log(`prerender: ${pages.length} pages`)
