import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowUpRightIcon } from '@phosphor-icons/react/dist/csr/ArrowUpRight'
import { PageLoading, ErrorState } from '../components/StateComponents'
import { conceptMeta } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import { loadConcepts, subjectName } from '../features/concepts/conceptsData'
import NotFoundPage from './NotFoundPage'
import styles from './ConceptsPage.module.css'

const pageLabel = pages => `修订版 PDF 第 ${pages.join('–')} 页`
const subjectLink = (data, slug) => (data.subjects.some(item => item.slug === slug)
    ? <Link to={`/concepts/subjects/${slug}`}>{subjectName(data, slug)}</Link>
    : <span>{subjectName(data, slug)}</span>)

export default function ConceptDetailPage() {
    const { termId } = useParams()
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const term = data?.terms.find(item => item.id === termId) || null
    usePageMeta(term ? conceptMeta(term) : null)
    useEffect(() => {
        let active = true
        loadConcepts().then(value => active && setData(value)).catch(errorValue => active && setError(errorValue.message))
        return () => { active = false }
    }, [])
    if (error) return <ErrorState title="概念加载失败" message={error} />
    if (!data) return <PageLoading message="正在打开概念" />
    if (!term) return <NotFoundPage />
    const category = data.categories.find(item => item.id === term.category)
    const related = term.related.map(id => data.terms.find(item => item.id === id)).filter(Boolean)
    return (
        <article className={`container ${styles.page}`}>
            <nav className={styles.crumb} aria-label="面包屑">
                <Link to="/">首页</Link><span>/</span><Link to="/concepts">概念词典</Link><span>/</span><span>{term.term}</span>
            </nav>
            <header className={styles.detailHead}>
                <p className={styles.kicker}>{category?.label}</p>
                <h1 className={styles.title}>{term.term}</h1>
                {term.aliases.length ? <p className={styles.aliases}>也说：{term.aliases.join('、')}</p> : null}
                <p className={styles.plain}>{term.plain}</p>
                <p className={styles.plainSource}>kebiao 整理的大白话解释。依据见下方课标原文。</p>
            </header>

            {term.not_in_standards ? (
                <p className={styles.callout}>修订版课标和课程方案里没有这个词。这里写的是它在教研中的通行用法，以及和课标的关系。</p>
            ) : null}

            {term.quotes.length ? (
                <section className={styles.section} aria-labelledby="concept-quotes">
                    <h2 id="concept-quotes">课标原文</h2>
                    <ul className={styles.quotes}>
                        {term.quotes.map(quote => (
                            <li key={`${quote.subject}-${quote.pages.join('-')}-${quote.text.slice(0, 8)}`}>
                                <blockquote>{quote.text}</blockquote>
                                <p className={styles.quoteSource}>{subjectLink(data, quote.subject)} · {pageLabel(quote.pages)}</p>
                                {quote.note ? <p className={styles.quoteNote}>{quote.note}</p> : null}
                            </li>
                        ))}
                    </ul>
                    <p className={styles.small}>原文由修订版扫描件识别整理，已逐字核对；请以官方出版物为准。</p>
                </section>
            ) : null}

            {term.by_subject.length ? (
                <section className={styles.section} aria-labelledby="concept-subjects">
                    <h2 id="concept-subjects">各学科怎么用</h2>
                    <dl className={styles.bySubject}>
                        {term.by_subject.map(item => (
                            <div key={item.subject}><dt>{subjectLink(data, item.subject)}</dt><dd>{item.text}</dd></div>
                        ))}
                    </dl>
                </section>
            ) : null}

            <section className={styles.section} aria-labelledby="concept-use">
                <h2 id="concept-use">备课时怎么用</h2>
                <p className={styles.prose}>{term.how_to_use}</p>
            </section>

            {term.misreadings.length ? (
                <section className={styles.section} aria-labelledby="concept-misreadings">
                    <h2 id="concept-misreadings">常见误解</h2>
                    <ul className={styles.misreadings}>{term.misreadings.map(item => <li key={item}>{item}</li>)}</ul>
                </section>
            ) : null}

            {term.abroad.length ? (
                <section className={styles.section} aria-labelledby="concept-abroad">
                    <h2 id="concept-abroad">国外怎么处理同一件事</h2>
                    <ul className={styles.abroad}>
                        {term.abroad.map(item => (
                            <li key={item.name}>
                                <strong>{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.name} <ArrowUpRightIcon size={13} aria-hidden="true" /></a> : item.name}</strong>
                                <span>{item.text}</span>
                            </li>
                        ))}
                    </ul>
                    <p className={styles.small}>对照只为帮助理解，不代表两边的要求相同。</p>
                </section>
            ) : null}

            {term.examples.length || term.mentions.length ? (
                <section className={styles.section} aria-labelledby="concept-entries">
                    <h2 id="concept-entries">在 kebiao 里看真实条目</h2>
                    <ul className={styles.entries}>
                        {term.examples.map(item => (
                            <li key={item.code}>
                                <Link to={`/standards/${item.code}`}><code>{item.code}</code>{item.title}</Link>
                                <span>{item.why}</span>
                            </li>
                        ))}
                        {term.mentions.map(item => (
                            <li key={item.code}>
                                <Link to={`/standards/${item.code}`}><code>{item.code}</code>{item.title}</Link>
                                <span>原文提到「{item.word}」：……{item.excerpt}……</span>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {related.length ? (
                <section className={styles.section} aria-labelledby="concept-related">
                    <h2 id="concept-related">相关概念</h2>
                    <ul className={styles.chips}>
                        {related.map(item => <li key={item.id}><Link to={`/concepts/${item.id}`}>{item.term}</Link></li>)}
                    </ul>
                </section>
            ) : null}
        </article>
    )
}
