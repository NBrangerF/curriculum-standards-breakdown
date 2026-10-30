import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { ArrowUpRightIcon } from '@phosphor-icons/react/dist/csr/ArrowUpRight'
import { PageLoading, ErrorState } from '../components/StateComponents'
import { subjectSkeletonMeta } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import { loadConcepts } from '../features/concepts/conceptsData'
import IdeasList from '../features/concepts/IdeasList'
import NotFoundPage from './NotFoundPage'
import styles from './ConceptsPage.module.css'

const stageLabel = stage => `${stage.replace('-', '–')} 年级`

export default function SubjectSkeletonPage() {
    const { slug } = useParams()
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const subject = data?.subjects.find(item => item.slug === slug) || null
    usePageMeta(subject ? subjectSkeletonMeta(subject) : null)
    useEffect(() => {
        let active = true
        loadConcepts().then(value => active && setData(value)).catch(errorValue => active && setError(errorValue.message))
        return () => { active = false }
    }, [])
    if (error) return <ErrorState title="学科骨架加载失败" message={error} />
    if (!data) return <PageLoading message="正在整理学科骨架" />
    if (!subject) return <NotFoundPage />
    const terms = subject.terms.map(id => data.terms.find(item => item.id === id)).filter(Boolean)
    return (
        <article className={`container ${styles.page}`} style={{ '--subject-color': subject.color || 'var(--kb-gold)' }}>
            <nav className={styles.crumb} aria-label="面包屑">
                <Link to="/">首页</Link><span>/</span><Link to="/concepts">概念词典</Link><span>/</span><Link to="/concepts#skeletons">学科骨架</Link><span>/</span><span>{subject.name}</span>
            </nav>
            <header className={styles.detailHead}>
                <p className={styles.kicker}>{subject.standard_count} 条标准 · {subject.indicator_count} 条要点</p>
                <h1 className={styles.title}>{subject.name}课标的骨架</h1>
                <p className={styles.plain}>{subject.organized_by}</p>
                <ul className={styles.literacy} aria-label="核心素养">
                    {subject.core_literacy.map(name => <li key={name}>{name}</li>)}
                </ul>
            </header>

            <section className={styles.section} aria-labelledby="skeleton-quote">
                <h2 id="skeleton-quote">课标原文</h2>
                <blockquote className={styles.single}>{subject.quote.text}</blockquote>
                <p className={styles.quoteSource}>{subject.name} · 修订版 PDF 第 {subject.quote.pages.join('–')} 页</p>
            </section>

            {subject.ideas ? (
                <section className={styles.section} aria-labelledby="skeleton-ideas">
                    <h2 id="skeleton-ideas">课程理念</h2>
                    <IdeasList subject={subject} />
                    <p className={styles.small}>教资笔试和面试答辩常考。14 门课放在一页的速记版：<Link to="/teacher-exam">教资课标速记</Link>。</p>
                </section>
            ) : null}

            <section className={styles.section} aria-labelledby="skeleton-hint">
                <h2 id="skeleton-hint">备课时的抓手</h2>
                <p className={styles.prose}>{subject.unit_hint}</p>
                {terms.length ? (
                    <ul className={styles.chips} aria-label="相关概念">
                        {terms.map(term => <li key={term.id}><Link to={`/concepts/${term.id}`}>{term.term}</Link></li>)}
                    </ul>
                ) : null}
            </section>

            <section className={styles.section} aria-labelledby="skeleton-tree">
                <h2 id="skeleton-tree">全部条目，按课标的结构排</h2>
                <p className={styles.small}>每一行是课标里的一个内容单元，后面的学段可以直接打开那一条标准。</p>
                <div className={styles.tree}>
                    {subject.groups.map(group => (
                        <section key={group.name} className={styles.treeGroup} aria-label={group.name}>
                            <h3>{group.name}</h3>
                            <ul>
                                {group.children.map(child => (
                                    <li key={child.name} className={styles.treeRow}>
                                        <span className={styles.treeName}>{child.name}</span>
                                        <span className={styles.treeStages}>
                                            {child.standards.map(([code, stage, count]) => (
                                                <Link key={code} to={`/standards/${code}`} title={`${code} · ${count} 条要点`}>{stageLabel(stage)}</Link>
                                            ))}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
                <Link className={styles.more} to={`/subjects/${subject.slug}`}>在星图里看{subject.name} <ArrowRightIcon size={15} aria-hidden="true" /></Link>
            </section>

            {subject.abroad.length ? (
                <section className={styles.section} aria-labelledby="skeleton-abroad">
                    <h2 id="skeleton-abroad">国外同类课程</h2>
                    <ul className={styles.abroad}>
                        {subject.abroad.map(item => (
                            <li key={item.name}>
                                <strong>{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.name} <ArrowUpRightIcon size={13} aria-hidden="true" /></a> : item.name}</strong>
                                <span>{item.text}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </article>
    )
}
