import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHero, SectionHead, Wrap, kb } from '../components/kb'
import { useStarmap } from '../features/starmap/SkyProvider.jsx'
import { COMPARE_DEFAULT, readCompareParams } from '../features/starmap/compareLinks.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import { STATIC_PAGE_META } from '../seo/pageMeta.js'
import styles from './StandardsHubPage.module.css'

const TOOLS = [
    { to: '/smart-search', name: 'AI 检索', text: '用一句话找课标，例如「三年级科学里讲植物生长的」' },
    { to: '/concepts', name: '概念词典', text: '大概念、大单元、学习任务群，课标原文怎么说' },
    { to: '/skills', name: '可迁移技能', text: '批判性思维、协作等七种能力落在哪些学科的哪几条' }
]

const CompareWindow = lazy(() => import('../features/starmap/CompareWindow.jsx'))

// 课标's own entry: the 14 subjects, 并排看 across subjects and 学段, and the tools for reading across them.
export default function StandardsHubPage() {
    usePageMeta(STATIC_PAGE_META['/standards'])
    const { K } = useStarmap()
    const [cmp, setCmp] = useState(COMPARE_DEFAULT)
    const [searchParams] = useSearchParams()
    const searchKey = searchParams.toString()

    // /standards?mode=B&bands=H2&subjects=math,science#compare opens 并排看 on that view
    useEffect(() => {
        if (!K) return
        const patch = readCompareParams(new URLSearchParams(searchKey), K)
        if (patch) setCmp(s => ({ ...s, ...patch }))
        if (patch || window.location.hash === '#compare') requestAnimationFrame(() => document.getElementById('compare')?.scrollIntoView({ behavior: 'auto', block: 'start' }))
    }, [K, searchKey])
    const points = K ? K.N : 2520
    const standards = K ? K.cons.length : 513

    return (
        <div data-kb-route="standards-hub">
            <PageHero
                kicker="课标 · 义务教育课程标准（2022年版2025年修订）"
                title="按学科看课标"
                lede={`14 门课程，${standards.toLocaleString('en-US')} 条标准、${points.toLocaleString('en-US')} 条要点，每条附课标原文和页码。手上有教材的话，从教材进更快：每一课教哪几条已经标好。`}
                actions={<Link className="btn btn-secondary" to="/textbooks">从教材进</Link>}
            />
            <Wrap as="section" className={styles.block} aria-labelledby="hub-subjects">
                <SectionHead kicker="14 门课程" title="学科" id="hub-subjects" size="sm" />
                {K ? (
                    <ul className={kb.rail}>
                        {K.subjects.map(subject => (
                            <li key={subject.slug}>
                                <Link className={kb.railBtn} to={`/subjects/${subject.slug}`} style={{ '--c': subject.color }}>
                                    <span className={kb.railName}><i aria-hidden="true" />{subject.name}</span>
                                    <span className={kb.railCount} aria-label={`${subject.count} 条要点`}>{subject.count}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                ) : <p className={styles.loading}>正在载入学科…</p>}
            </Wrap>
            <Wrap as="section" id="compare" className={`${styles.block} ${styles.compare}`} aria-labelledby="compare-title">
                {K ? (
                    <Suspense fallback={<p className={styles.loading}>正在载入并排看…</p>}>
                        <CompareWindow K={K} state={cmp} setState={setCmp} heading={<SectionHead kicker="一科多学段 · 多科一学段 · 一种能力跨学科" title="并排看" id="compare-title" size="sm" />} />
                    </Suspense>
                ) : <p className={styles.loading}>正在载入并排看…</p>}
            </Wrap>
            <Wrap as="section" className={styles.block} aria-labelledby="hub-tools">
                <SectionHead kicker="跨学科、跨学段" title="其他查法" id="hub-tools" size="sm" />
                <ul className={`${kb.list} ${styles.tools}`}>
                    {TOOLS.map(tool => (
                        <li key={tool.to}>
                            <Link to={tool.to}>
                                <b>{tool.name}</b>
                                <span>{tool.text}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </Wrap>
        </div>
    )
}
