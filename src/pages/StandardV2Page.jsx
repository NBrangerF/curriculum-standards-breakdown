import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { loadV2Standard, loadV2Subject, statusLabel, gradesLabel, standardCodeOf, subjectOfCode } from '../data/v2Data.js'
import { loadLearningResourceCatalog, SUBJECT_COLORS } from '../data/dataLoader'
import { PageLoading, ErrorState, CopyLinkButton } from '../components/StateComponents'
import FavoriteButton from '../components/FavoriteButton'
import ShareStandardButton from '../features/share/ShareStandardButton'
import StandardTextbookLinks from '../features/textbooks/StandardTextbookLinks'
import { loadPlatforms, platformsFor } from '../features/learning-resources/platforms'
import ResourceBadges, { OpenOriginalLink } from '../features/learning-resources/ResourceBadges'
import { v2StandardMeta } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import styles from './StandardV2Page.module.css'

const pagesLabel = pages => (pages?.length ? `课标第 ${pages.join('、')} 页` : '')

function SourceLine({ section, pages, check }) {
    const parts = ['课标原文', section, pagesLabel(pages)].filter(Boolean)
    const status = statusLabel(check)
    return (
        <p className={styles.source}>
            {parts.join(' · ')}
            {status ? <span className={`${styles.flag} ${styles[check.status] || ''}`}>{status}</span> : null}
        </p>
    )
}

// The 要点 text with the words the 2025 revision newly wrote marked.
function withAdditions(text, added = []) {
    if (!added.length) return text
    const parts = []
    let rest = text
    for (const phrase of added) {
        const at = rest.indexOf(phrase)
        if (at < 0) continue
        parts.push(rest.slice(0, at), <mark key={phrase} className={styles.added}>{phrase}</mark>)
        rest = rest.slice(at + phrase.length)
    }
    return [...parts, rest]
}

// One 要点: the official sentence, its place in the 课标 and, folded away, the kebiao 表现示例.
function Indicator({ item, dimmed, targeted }) {
    const revised = item.check?.status === 'revised'
    return (
        <li id={item.code} className={`${styles.indicator} ${dimmed ? styles.dimmed : ''} ${targeted ? styles.targeted : ''}`}>
            <div className={styles.indicatorHead}>
                <a className={styles.indicatorCode} href={`#${item.code}`} aria-label={`要点 ${item.code} 的链接`}>{item.code.split('.').pop().padStart(2, '0')}</a>
                <div className={styles.indicatorTags}>
                    {item.label ? <span className={styles.tag}>{item.label}</span> : null}
                    {item.grades?.length ? <span className={styles.gradeTag} title={item.grade_basis || ''}>{gradesLabel(item.grades)}</span> : null}
                    {item.optional ? <span className={styles.tag}>选学</span> : null}
                    {revised ? <span className={styles.revTag} title={item.check.summary}>2025 修订</span> : null}
                </div>
            </div>
            <p className={styles.indicatorText}>{revised ? withAdditions(item.text, item.check.added) : item.text}</p>
            {item.official_examples ? <p className={styles.officialExample}>{item.official_examples}</p> : null}
            <SourceLine section={item.section} pages={item.pages} check={item.check} />
            {item.examples.length ? (
                <details className={styles.examples}>
                    <summary>表现示例 · {item.examples.length} 条 <span>kebiao 整理</span></summary>
                    <ul>{item.examples.map(example => <li key={example.from}>{example.text}<small>原 {example.from}</small></li>)}</ul>
                </details>
            ) : null}
            {item.legacy_codes.length ? (
                <p className={styles.legacy}>
                    原编码 {item.legacy_codes.map((old, k) => <span key={old}>{k ? ' · ' : ''}<Link to={`/standards/${old}/v1`} title="查看 2022 年版拆解时的旧条目">{old}</Link></span>)}
                </p>
            ) : null}
        </li>
    )
}

function OfficialList({ title, items, id }) {
    if (!items?.length) return null
    return (
        <section className={styles.block} id={id}>
            <h2>{title}</h2>
            <ul className={styles.officialList}>
                {items.map((item, k) => (
                    <li key={k}>
                        <p>{item.text}</p>
                        <SourceLine section={item.section} pages={item.pages} check={item.check} />
                    </li>
                ))}
            </ul>
        </section>
    )
}

const NATIONAL_URL = id => `https://basic.smartedu.cn/syncClassroom/classActivity?activityId=${id}`

// 国家中小学智慧教育平台 同步课 for the textbook chapters this standard is aligned to.
function NationalLessons({ code }) {
    const [data, setData] = useState(null)
    useEffect(() => {
        let cancelled = false
        setData(null)
        fetch(`/data/v2/national-lessons/${code.slice(0, 2)}.json`)
            .then(response => (response.ok ? response.json() : null))
            .then(value => { if (!cancelled) setData(value) })
            .catch(() => { if (!cancelled) setData(null) })
        return () => { cancelled = true }
    }, [code])
    const lessons = data?.standards?.[code] || []
    if (!lessons.length) return null
    const byAi = lessons.some(item => item[6] === 1)
    return (
        <section className={styles.block} id="standard-national-lessons">
            <h2>国家平台同步课</h2>
            <ul className={styles.resourceList}>
                {lessons.map(([, id, title, textbook, materials, , viaAi]) => (
                    <li key={id}>
                        <a href={NATIONAL_URL(id)} target="_blank" rel="noopener noreferrer">{title} ↗</a>
                        <span>{textbook}{materials.length ? ` · ${materials.map(index => data.materials[index]).join(' · ')}` : ''}{viaAi === 1 ? ' · AI 按单元判断' : ''}</span>
                    </li>
                ))}
            </ul>
            <p className={styles.blockNote}>{byAi ? '标「AI 按单元判断」的，是 AI 读了教材单元的课名和本学段全部课标后判断为直接对应的；其余按教材页码与课标的机器对应列出。都待核验。' : '按教材页码与课标的机器对应列出，待核验。'}国家中小学智慧教育平台免费提供，观看需登录平台账号。</p>
        </section>
    )
}

function Platforms({ subjectSlug, standard }) {
    const [platforms, setPlatforms] = useState([])
    useEffect(() => {
        let cancelled = false
        loadPlatforms().then(data => { if (!cancelled) setPlatforms(platformsFor(data.platforms, subjectSlug, standard).slice(0, 4)) })
        return () => { cancelled = true }
    }, [subjectSlug, standard])
    if (!platforms.length) return null
    return (
        <section className={styles.block} id="standard-platforms">
            <h2>国内官方平台</h2>
            <ul className={styles.resourceList}>
                {platforms.map(platform => (
                    <li key={platform.id}>
                        <a href={platform.url} target="_blank" rel="noopener noreferrer">{platform.title} ↗</a>
                        <span>{platform.provider} · {platform.cost}</span>
                        <p>{platform.how_to_use}</p>
                    </li>
                ))}
            </ul>
            <p className={styles.blockNote}>按学科和课标的内容分类对应，国内可以直接打开。课堂用法为 kebiao 整理。</p>
        </section>
    )
}

function LearningResources({ ids, legacyCodes }) {
    const [resources, setResources] = useState(null)
    useEffect(() => {
        let cancelled = false
        if (!ids.length) return undefined
        loadLearningResourceCatalog()
            .then(catalog => { if (!cancelled) setResources((catalog.resources || []).filter(r => ids.includes(r.id))) })
            .catch(() => { if (!cancelled) setResources([]) })
        return () => { cancelled = true }
    }, [ids])
    if (!ids.length || !resources?.length) return null
    return (
        <section className={styles.block} id="standard-resources">
            <h2>学习资源</h2>
            <ul className={styles.resourceList}>
                {resources.map(resource => {
                    // why it fits: the note written for the old record it was filed under
                    const rationale = (resource.standards || []).find(item => legacyCodes.includes(item.code))?.rationale_zh
                    return (
                        <li key={resource.id}>
                            <Link to={`/learning-resources/${resource.id}`}>{resource.title_zh}</Link>
                            <span>{resource.provider}</span>
                            {rationale ? <p>{rationale}</p> : null}
                            <div className={styles.resourceFoot}>
                                <ResourceBadges resource={resource} />
                                <OpenOriginalLink resource={resource} />
                            </div>
                        </li>
                    )
                })}
            </ul>
        </section>
    )
}

export default function StandardV2Page() {
    const { code } = useParams()
    const { hash } = useLocation()
    const [searchParams] = useSearchParams()
    const standardCode = standardCodeOf(code)
    const [state, setState] = useState({ status: 'loading' })
    const [grade, setGrade] = useState(0)
    const from = searchParams.get('from')
    const target = decodeURIComponent(hash.replace(/^#/u, '')) || (code !== standardCode ? code : '')

    useEffect(() => {
        let cancelled = false
        setState({ status: 'loading' })
        setGrade(0)
        loadV2Standard(standardCode)
            .then(result => {
                if (cancelled) return
                setState(result?.subject ? { status: 'ready', ...result } : result ? { status: 'loading' } : { status: 'missing' })
                // Prerendered pages carry only this standard; fetch the subject for the neighbours.
                if (result && !result.subject?.standards) {
                    loadV2Subject(subjectOfCode(result.standard.code))
                        .then(subject => { if (!cancelled) setState({ status: 'ready', standard: result.standard, subject }) })
                        .catch(error => { if (!cancelled && !result.subject) setState({ status: 'error', message: error.message }) })
                }
            })
            .catch(error => { if (!cancelled) setState({ status: 'error', message: error.message }) })
        return () => { cancelled = true }
    }, [standardCode])

    const { standard, subject } = state
    usePageMeta(standard && subject ? v2StandardMeta(standard, subject) : null)

    // Open at the 要点 named in the hash (old links land here too).
    useEffect(() => {
        if (state.status !== 'ready' || !target) return undefined
        const frame = requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: 'center' }))
        return () => cancelAnimationFrame(frame)
    }, [state.status, target])

    const stage = useMemo(() => subject?.stages?.find(s => s.stage_code === standard?.stage_code), [subject, standard])
    const neighbours = useMemo(() => {
        const list = (subject?.standards || []).filter(s => s.stage_code === standard?.stage_code)
        const k = list.findIndex(s => s.code === standard?.code)
        return k < 0 ? {} : { prev: list[k - 1], next: list[k + 1], index: k + 1, total: list.length }
    }, [subject, standard])

    if (state.status === 'loading') return <PageLoading className="page-content container" message={`加载标准 ${standardCode}…`} />
    if (state.status !== 'ready') {
        return (
            <div className="page-content container">
                <ErrorState title="标准未找到" message={state.message || `找不到编码为 ${code} 的标准`} />
                <p className={styles.notFound}><Link to="/" className="btn btn-primary">返回首页</Link></p>
            </div>
        )
    }

    const slug = subject.subject_slug
    const gradeOptions = [...new Set(standard.indicators.flatMap(i => i.grades || []))].sort((a, b) => a - b)
    const hasRevised = standard.indicators.some(i => i.check?.status === 'revised')
    const fromIndicator = from && standard.indicators.find(i => i.legacy_codes.includes(from))
    const official = standard.statement_source === 'official'
    const shareURL = `${window.location.origin}/standards/${standard.code}`

    return (
        <article className={styles.page} data-kb-route="standard" data-kb-standard-version="v2" style={{ '--subject-color': SUBJECT_COLORS[slug] }}>
            <div className="container">
                <nav className={styles.crumb} aria-label="面包屑">
                    <Link to="/">首页</Link><span>/</span>
                    <Link to={`/subjects/${slug}`}>{subject.subject}</Link><span>/</span>
                    <Link to={`/subjects/${slug}#${standard.stage_code}`}>{stage?.label || standard.stage}</Link><span>/</span>
                    <span>{standard.level1}</span>
                </nav>

                {from ? (
                    <p className={styles.moved} role="note">
                        旧编码 <code>{from}</code> 已并入这条标准{fromIndicator ? <>的要点 <a href={`#${fromIndicator.code}`}>{fromIndicator.code}</a></> : null}。kebiao 已按《义务教育课程标准（2022年版2025年修订）》重新整理：一条标准对应一个学段的一个内容单元，下列要点是课标原文。
                    </p>
                ) : null}

                <header className={styles.header}>
                    <div className={styles.meta}>
                        <code className={styles.code}>{standard.code}</code>
                        <Link to={`/subjects/${slug}`} className={styles.badge}>{subject.subject}</Link>
                        <span className={styles.badge}>{stage?.label || `${standard.stage} 年级`}</span>
                        <Link to={`/concepts/subjects/${slug}`} className={styles.badge} title={`看${subject.subject}课标的骨架`}>{standard.theme ? `${standard.level1} · ${standard.theme}` : standard.level1}</Link>
                    </div>
                    <h1 className={styles.title}>{standard.level2}</h1>
                    <p className={styles.statement}>{standard.statement}</p>
                    <p className={styles.statementSource}>
                        {official
                            ? ['标准句为课标原文', standard.statement_section, pagesLabel(standard.statement_pages)].filter(Boolean).join(' · ')
                            : '标准句为 kebiao 整理：用课标原词概括本单元，原文见下列要点'}
                    </p>
                    <div className={styles.actions}>
                        <FavoriteButton code={standard.code} showLabel={true} size="large" />
                        <CopyLinkButton url={shareURL} />
                        <ShareStandardButton code={standard.code} title={standard.level2} />
                        <Link className={styles.badge} to={`/lesson-plan?mode=topic&subject=${encodeURIComponent(slug === 'arts' ? '艺术（音乐、美术等）' : subject.subject)}&grade=${(standard.grades || [])[0] || ''}&topic=${encodeURIComponent(standard.level2)}&codes=${standard.code}`}>用这条起草教案</Link>
                    </div>
                </header>

                <section className={styles.block} id="standard-indicators" aria-labelledby="indicators-title">
                    <div className={styles.blockHead}>
                        <h2 id="indicators-title">要点 · {standard.indicators.length} 条</h2>
                        <div className={styles.controls}>
                            {gradeOptions.length > 1 ? (
                                <div className={styles.segment} role="group" aria-label="按年级看要点">
                                    <button type="button" aria-pressed={grade === 0} onClick={() => setGrade(0)}>全部</button>
                                    {gradeOptions.map(g => <button key={g} type="button" aria-pressed={grade === g} onClick={() => setGrade(g)}>{g} 年级</button>)}
                                </div>
                            ) : null}
                        </div>
                    </div>
                    <p className={styles.note}>
                        要点逐字取自课标原文{standard.stage === '7-9' && gradeOptions.length ? '；年级标签依据教材章节，没有标签的是 7–9 年级共同要求' : ''}。
                        {hasRevised ? '标「2025 修订」的要点在修订版中有改动，高亮处是修订版新写入的文字。' : ''}
                    </p>
                    <ol className={styles.indicators}>
                        {standard.indicators.map(item => (
                            <Indicator
                                key={item.code}
                                item={item}
                                dimmed={grade > 0 && item.grades?.length > 0 && !item.grades.includes(grade)}
                                targeted={item.code === target}
                            />
                        ))}
                    </ol>
                </section>

                <OfficialList title="学业要求" items={standard.requirements} id="standard-requirements" />
                <OfficialList title="教学提示" items={standard.guidance} id="standard-guidance" />

                {standard.examples.length ? (
                    <section className={styles.block} id="standard-examples">
                        <h2>表现示例 <small>kebiao 整理</small></h2>
                        <p className={styles.note}>以下是 kebiao 早先整理的条目，概括了本单元的学习表现，不是课标原文。</p>
                        <ul className={styles.exampleList}>
                            {standard.examples.map(example => <li key={example.from}>{example.text}<small>原 {example.from}</small></li>)}
                        </ul>
                    </section>
                ) : null}

                <section className={styles.block} id="standard-textbooks">
                    <StandardTextbookLinks standardCode={standard.code} />
                </section>
                <NationalLessons code={standard.code} />
                <Platforms subjectSlug={slug} standard={standard} />
                <LearningResources ids={standard.learning_resource_ids || []} legacyCodes={standard.legacy_codes || []} />

                <nav className={styles.neighbours} aria-label="同学段的标准">
                    {neighbours.prev ? <Link to={`/standards/${neighbours.prev.code}`} rel="prev"><small>上一条</small>{neighbours.prev.level2}</Link> : <span />}
                    {neighbours.total ? <Link to={`/subjects/${slug}#${standard.stage_code}`} className={styles.neighbourIndex}>{stage?.label} · 第 {neighbours.index} / {neighbours.total} 条</Link> : null}
                    {neighbours.next ? <Link to={`/standards/${neighbours.next.code}`} rel="next"><small>下一条</small>{neighbours.next.level2}</Link> : <span />}
                </nav>

                <footer className={styles.footnote}>
                    <p>{subject.source_note}</p>
                    <p>页码为修订版扫描件页码。标「识别存疑」或「表格重建」的文字由扫描件识别整理，请以官方 PDF 为准。</p>
                </footer>
            </div>
        </article>
    )
}
