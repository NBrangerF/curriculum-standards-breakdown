#!/usr/bin/env node
// Writes a static HTML page for every public route, so search engines, link previews and
// slow connections get the page's own title and content before the app's JavaScript runs.
// Runs after `vite build`. When the app starts it shows this content until its data is ready.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
    SITE_URL, SITE_NAME, cardVersion, getDisplayTitle, gradeLabel, clip,
    homeMeta, subjectMeta, standardMeta, skillsOverviewMeta, skillMeta, textbooksMeta, textbookMeta,
    textbookUnitMeta, learningResourcesMeta, learningResourceMeta, STATIC_PAGE_META
} from '../src/seo/pageMeta.js'

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
const glossary = readJson('glossary.json')
const GRADE_ORDER = ['H1', 'H2', 'H3', 'H4G7', 'H4G8', 'H4G9']
const CARD_VERSION = cardVersion(readJson('data_version.json').data_version)
const cardUrl = path => `${SITE_URL}/cards/${path}.png?v=${CARD_VERSION}`

const standardTitle = standard => getDisplayTitle(standard.standard, standard.standard_title)
const standardLink = code => {
    const standard = standardsByCode.get(code)
    return standard ? `${link(`/standards/${code}`, standardTitle(standard))} <span class="kbp-code">${esc(code)} · ${esc(standard.subject)}${esc(gradeLabel(standard))}</span>` : esc(code)
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
    const total = subjects.reduce((sum, subject) => sum + subject.record_count, 0)
    const meta = homeMeta({ standardCount: total, subjectCount: subjects.length })
    const main = `
<p class="kbp-kicker">义务教育课程标准（2022年版）· 结构化索引</p>
<h1>让每一句「符合课标」都有据可查</h1>
<p class="kbp-lede">${esc(meta.description)}</p>
${section('按学科浏览', list(subjects.map(subject => `${link(`/subjects/${subject.subject_slug}`, `${subject.subject}课程标准`)} <span class="kbp-code">${subject.record_count} 条</span>`)))}
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
    const standards = standardsBySubject.get(subject.subject_slug)
    const info = subjectsMeta.get(subject.subject_slug) || {}
    const meta = subjectMeta(subject, { standardCount: standards.length, shortDescription: info.short_description })
    const bands = GRADE_ORDER.filter(band => standards.some(standard => standard.grade_band === band)).map(band => {
        const inBand = standards.filter(standard => standard.grade_band === band)
        const domains = [...new Set(inBand.map(standard => standard.domain))]
        return `<section><h2>${esc(gradeLabel({ grade_band: band }))}</h2>${domains.map(domain => `<h3>${esc(domain)}</h3>${list(inBand.filter(standard => standard.domain === domain).map(standard => `${link(`/standards/${standard.code}`, standardTitle(standard))} <span class="kbp-code">${esc(standard.code)}</span>`))}`).join('')}</section>`
    }).join('')
    const crumbs = [['首页', '/'], [`${subject.subject}课程标准`, `/subjects/${subject.subject_slug}`]]
    add(meta, `${crumbNav(crumbs)}
<p class="kbp-kicker">义务教育课程标准（2022年版）</p>
<h1>${esc(subject.subject)}课程标准</h1>
<p class="kbp-lede">${esc(info.short_description || '')}</p>
${info.structure_notes ? `<p>${esc(info.structure_notes)}</p>` : ''}
<p class="kbp-note">共 ${standards.length} 条课标，按学段和领域排列。</p>
${bands}`, { jsonLd: [breadcrumbs(crumbs)], image: cardUrl(`subject/${subject.subject_slug}`) })
}

function standardPage(standard) {
    const meta = standardMeta(standard)
    const title = standardTitle(standard)
    const grade = gradeLabel(standard)
    const crumbs = [['首页', '/'], [`${standard.subject}课程标准`, `/subjects/${standard.subject_slug}`], [title, `/standards/${standard.code}`]]
    const skills = [...new Set([...(standard.ts_primary || []), ...(standard.ts_secondary || [])])]
        .filter(code => skillNames.has(code))
        .map(code => `${link(`/skills/${code.split('.')[0]}`, skillNames.get(code))} <span class="kbp-code">${esc(code)}</span>`)
    const pageEvidence = new Map()
    for (const item of standardsToTextbooks.items[standard.code] || []) {
        if (item.unit_id && !pageEvidence.has(item.unit_id)) {
            const page = item.printed_page ? `，第 ${item.printed_page} 页` : ''
            pageEvidence.set(item.unit_id, `${link(`/textbook-units/${item.unit_id}`, `${item.textbook_title} · ${item.unit_title || item.node_title || '相关页'}`)}<span class="kbp-note">${esc(page)}${item.review_status === 'approved' ? '' : ' · 机器对齐，待核验'}</span>`)
        }
    }
    const scopeBooks = [...new Set((standardsToTextbooks.scopes[standard.code] || []).map(scope => scope.edition_id))]
        .filter(id => textbooksById.has(id)).slice(0, 8)
        .map(id => link(`/textbooks/${id}`, `${textbooksById.get(id).edition_name}${textbooksById.get(id).title}`))
    const neighbours = [
        ...splitCodes(standard.previous_code).map(code => `前一阶段：${standardLink(code)}`),
        ...splitCodes(standard.next_code).map(code => `后一阶段：${standardLink(code)}`)
    ]
    const siblings = standardsBySubject.get(standard.subject_slug)
        .filter(other => other.code !== standard.code && other.grade_band === standard.grade_band && other.domain === standard.domain)
        .slice(0, 10).map(other => standardLink(other.code))
    const official = standard.official_text || standard.standard
    const main = `${crumbNav(crumbs)}
<p class="kbp-kicker">${esc([standard.subject, grade, standard.domain, standard.display_subcategory].filter(Boolean).join(' · '))}</p>
<h1>${esc(title)}</h1>
<p class="kbp-code">课标编码 ${esc(standard.code)}</p>
${section('课标原文', `<blockquote>${esc(official)}</blockquote><p class="kbp-note">出处：《义务教育${esc(standard.subject)}课程标准（2022年版）》</p>`)}
${standard.standard && standard.standard !== official ? section('拆解后的要求', `<p>${esc(standard.standard)}</p>`) : ''}
${section('情境与学习意义', paras(standard.context))}
${section('实践示例', paras(standard.practice))}
${section('教学提示', paras(standard.teaching_tip))}
${section('评价证据', paras(standard.assessment_evidence_type))}
${section('可迁移技能', list(skills))}
${section('对应教材', list([...pageEvidence.values()]) + (scopeBooks.length ? `<p class="kbp-note">同学段相关教材：</p>${list(scopeBooks)}` : ''))}
${section('前后衔接', list(neighbours))}
${section(`同领域的其他课标（${standard.domain}）`, list(siblings))}
<p class="kbp-note">拆解、情境、实践和教学提示由 kebiao 整理，部分为机器生成，引用时请以课标原文为准。</p>`
    const preloadCodes = [standard.code, ...splitCodes(standard.previous_code), ...splitCodes(standard.next_code)]
    add(meta, main, {
        type: 'article',
        image: cardUrl(`s/${standard.code}`),
        jsonLd: [breadcrumbs(crumbs), {
            '@context': 'https://schema.org',
            '@type': 'DefinedTerm',
            '@id': `${SITE_URL}/standards/${standard.code}`,
            name: title,
            termCode: standard.code,
            description: clip(official, 300),
            url: `${SITE_URL}/standards/${standard.code}`,
            inDefinedTermSet: { '@type': 'DefinedTermSet', name: `义务教育${standard.subject}课程标准（2022年版）`, url: `${SITE_URL}/subjects/${standard.subject_slug}` }
        }],
        preload: { standards: preloadCodes.map(code => standardsByCode.get(code)).filter(Boolean) }
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
        for (const item of unit.alignments || []) {
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

function staticPages() {
    const terms = glossary.terms || []
    add(STATIC_PAGE_META['/glossary'], `<h1>术语表</h1>${terms.map(term => `<section><h2>${esc(term.term)}</h2><p>${esc(term.definition)}</p></section>`).join('')}`)
    add(STATIC_PAGE_META['/api'], `<h1>开放 API</h1><p class="kbp-lede">${esc(STATIC_PAGE_META['/api'].description)}</p><p>${link('/api/v1/docs', '查看 API 文档')}</p>`)
    add(STATIC_PAGE_META['/contact'], `<h1>联系我们</h1><p class="kbp-lede">${esc(STATIC_PAGE_META['/contact'].description)}</p>`)
    add(STATIC_PAGE_META['/smart-search'], `<h1>智能检索</h1><p class="kbp-lede">${esc(STATIC_PAGE_META['/smart-search'].description)}</p>`)
}

homePage()
subjects.forEach(subjectPage)
for (const standards of standardsBySubject.values()) standards.forEach(standardPage)
skillPages()
textbookPages()
learningResourcePages()
staticPages()

// ---------- render ----------
const STYLE = `<style id="kbp-style">
.kbp{color:var(--kb-ink,#eceff4);font-family:var(--font-body,system-ui,sans-serif);line-height:1.8}
.kbp a{color:inherit;text-decoration-color:rgba(233,200,135,.5);text-underline-offset:3px}
.kbp-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 20px;padding:16px max(16px,4vw);border-bottom:1px solid var(--kb-line,rgba(222,228,238,.14))}
.kbp-brand{font-family:var(--font-display,serif);font-size:20px;font-weight:900;text-decoration:none}
.kbp-brand span{margin-left:6px;font-weight:400;color:var(--kb-mist,#aab2bf)}
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

const NAV = [...subjects.map(subject => link(`/subjects/${subject.subject_slug}`, subject.subject)), link('/textbooks', '教材馆'), link('/skills', '可迁移技能'), link('/smart-search', '智能检索')].join('')
const FOOTER = '<footer class="kbp-foot"><div class="kbp-wrap"><p>课标原文来自教育部《义务教育课程标准（2022年版）》。kebiao 是独立的开放索引，与教育部无隶属关系。</p></div></footer>'

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
    const body = `<div id="root"><div class="kbp" data-prerender="${esc(page.path)}"><header class="kbp-head"><a class="kbp-brand" href="/">kebiao<span>课标</span></a><nav aria-label="主要栏目">${NAV}</nav></header><main data-prerender-main><div class="kbp-wrap">${page.main}</div></main>${FOOTER}</div></div>${page.preload ? `\n  <script type="application/json" id="kb-preload">${scriptJson(page.preload)}</script>` : ''}`
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
