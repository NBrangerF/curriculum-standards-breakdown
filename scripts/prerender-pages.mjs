#!/usr/bin/env node
// Writes a static HTML page for every public route, so search engines, link previews and
// slow connections get the page's own title and content before the app's JavaScript runs.
// Runs after `vite build`. When the app starts it shows this content until its data is ready.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
    SITE_URL, SITE_NAME, cardVersion, getDisplayTitle, clip, V2_STANDARDS_DOC, v2StageLabel, v2StandardMeta,
    homeMeta, subjectMeta, skillsOverviewMeta, skillMeta, textbooksMeta, textbookMeta,
    textbookUnitMeta, learningResourcesMeta, learningResourceMeta, STATIC_PAGE_META,
    conceptsMeta, conceptMeta, subjectSkeletonMeta
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

function homePage() {
    const meta = homeMeta({ standardCount: v2Manifest.totals.standards, indicatorCount: v2Manifest.totals.indicators, subjectCount: v2Manifest.totals.subjects })
    const main = `
<p class="kbp-kicker">${V2_STANDARDS_DOC} · 结构化索引</p>
<h1>让每一句「符合课标」都有据可查</h1>
<p class="kbp-lede">${esc(meta.description)}</p>
${section('按学科浏览', list(v2Manifest.subjects.map(subject => `${link(`/subjects/${subject.subject_slug}`, `${subject.subject}课程标准`)} <span class="kbp-code">${subject.standard_count} 条标准 · ${subject.indicator_count} 条要点</span>`)))}
${section('从教材找课标', `<p>${link('/textbooks', `教材馆：${textbooks.length} 册教材`)}，按单元查看对应的课程标准。</p>`)}
${section('更多入口', list([
        `${link('/smart-search', '智能检索')}：用一句话描述教学内容，找到相关课标`,
        `${link('/skills', '可迁移技能')}：从能力出发反查课标`,
        `${link('/learning-resources', '开放学习资源')}：对应到课标的精选资源`,
        `${link('/api', '开放 API')}：把课标数据接入你的工具`
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
    const siblings = subject.standards
        .filter(other => other.code !== standard.code && other.stage_code === standard.stage_code && other.level1 === standard.level1)
        .slice(0, 12).map(other => `${link(`/standards/${other.code}`, other.level2)} <span class="kbp-code">${esc(other.code)}</span>`)
    const statementNote = standard.statement_source === 'official'
        ? ['标准句为课标原文', standard.statement_section, pagesNote(standard.statement_pages)].filter(Boolean).join(' · ')
        : '标准句为 kebiao 整理，用课标原词概括本单元；原文见下列要点。'
    const main = `${crumbNav(crumbs)}
<p class="kbp-kicker">${esc([subject.subject, stage, standard.level1, standard.theme].filter(Boolean).join(' · '))}</p>
<h1>${esc(standard.level2)}</h1>
<p class="kbp-code">标准编码 ${esc(standard.code)}</p>
<blockquote>${esc(standard.statement)}</blockquote>
<p class="kbp-note">${esc(statementNote)}</p>
${section(`要点（${standard.indicators.length} 条，课标原文）`, `<ol>${indicators}</ol>`)}
${section('学业要求', official(standard.requirements))}
${section('教学提示', official(standard.guidance))}
${standard.examples.length ? section('表现示例（kebiao 整理）', list(standard.examples.map(example => esc(example.text)))) : ''}
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
    add(textbooksMeta({ textbookCount: textbooks.length }), `${crumbNav(crumbs)}
<p class="kbp-kicker">教材馆 · ${textbooks.length} 册</p>
<h1>教材馆</h1>
<p class="kbp-lede">按学科和年级浏览教材目录，查看每个单元对应的课程标准。</p>
${bySubject.map(subject => section(subject, list(textbooks.filter(book => book.subject === subject).map(book => link(`/textbooks/${book.edition_id}`, `${book.edition_name}${book.title}`))))).join('')}`, { jsonLd: [breadcrumbs(crumbs)] })

    const edition = id => JSON.parse(readFileSync(join(DATA, 'textbooks/by-edition', `${id}.json`), 'utf8'))
    for (const book of textbooks) {
        const detail = edition(book.edition_id)
        const bookCrumbs = [...crumbs, [book.title, `/textbooks/${book.edition_id}`]]
        const toc = (detail.toc || []).map(entry => `${link(`/textbook-units/${entry.entry_id}`, entry.title)}${entry.printed_page ? ` <span class="kbp-note">第 ${esc(entry.printed_page)} 页</span>` : ''}`)
        const aligned = [...new Set((detail.alignments || []).map(item => item.standard_code))].filter(code => standardsByCode.has(code)).map(standardLink)
        add(textbookMeta(book), `${crumbNav(bookCrumbs)}
<p class="kbp-kicker">${esc([book.subject, book.stage_label, book.grade_label, book.volume].filter(Boolean).join(' · '))}</p>
<h1>${esc(book.title)}</h1>
<p class="kbp-lede">${esc(book.edition_name)} · 共 ${esc(book.page_count)} 页${book.revision_label ? ` · ${esc(book.revision_label)}` : ''}</p>
${section('目录', list(toc))}
${section('对应的课程标准', list(aligned))}`, {
            type: 'book',
            jsonLd: [breadcrumbs(bookCrumbs), { '@context': 'https://schema.org', '@type': 'Book', name: book.title, bookEdition: book.edition_name, inLanguage: 'zh-CN', educationalLevel: book.grade_label, about: book.subject, numberOfPages: book.page_count }]
        })
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
${section('备课时的抓手', paras(subject.unit_hint))}
${subject.groups.map(group => section(group.name, list(group.children.map(child => `${esc(child.name)}：${child.standards.map(([code, stage]) => link(`/standards/${code}`, `${stage.replace('-', '–')} 年级`)).join('、')}`)))).join('')}`, { jsonLd: [breadcrumbs(subjectCrumbs)] })
    }
}

function staticPages() {
    const terms = glossary.terms || []
    add(STATIC_PAGE_META['/glossary'], `<h1>术语表</h1>${terms.map(term => `<section><h2>${esc(term.term)}</h2><p>${esc(term.definition)}</p></section>`).join('')}`)
    add(STATIC_PAGE_META['/api'], `<h1>开放 API</h1><p class="kbp-lede">${esc(STATIC_PAGE_META['/api'].description)}</p><p>${link('/api/v1/docs', '查看 API 文档')}</p>`)
    add(STATIC_PAGE_META['/contact'], `<h1>联系我们</h1><p class="kbp-lede">${esc(STATIC_PAGE_META['/contact'].description)}</p>`)
    add(STATIC_PAGE_META['/lesson-plan'], `<h1>AI 备课：从教材的一课起草有课标依据的教案</h1><p class="kbp-lede">${esc(STATIC_PAGE_META['/lesson-plan'].description)}</p><p>AI 只按你勾选的课标要点写，每条目标标出依据编码；写完后逐条核验：有没有超出课标写明的限定，目标有没有对应的教学环节和评价任务。可复制、下载 Word、打印。</p><p>还可以贴入自己的教案逐条核验，或贴入单元测试卷、作业：AI 逐题读出考查的要点、素养、层次和难度，程序编成多维细目表，并查超出课标限定的题、没有考到的要点和分值比例。</p>`)
    add(STATIC_PAGE_META['/smart-search'], `<h1>智能检索</h1><p class="kbp-lede">${esc(STATIC_PAGE_META['/smart-search'].description)}</p>`)
}

homePage()
v2Subjects.forEach(subjectPage)
for (const entry of v2ByCode.values()) standardPage(entry)
skillPages()
textbookPages()
learningResourcePages()
conceptPages()
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

const NAV = [...v2Subjects.map(subject => link(`/subjects/${subject.subject_slug}`, subject.subject)), link('/textbooks', '教材馆'), link('/concepts', '概念词典'), link('/skills', '可迁移技能'), link('/smart-search', '智能检索')].join('')
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
    // /api is also the functions namespace, so its page is a file that vercel.json rewrites /api to.
    const file = page.path === '/' ? join(DIST, 'index.html')
        : page.path === '/api' ? join(DIST, 'api-page.html')
            : join(DIST, page.path, 'index.html')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, render(page))
}
console.log(`prerender: ${pages.length} pages`)
