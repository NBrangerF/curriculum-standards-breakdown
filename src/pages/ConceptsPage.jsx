import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { PageLoading, ErrorState } from '../components/StateComponents'
import { conceptsMeta } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import { loadConcepts, subjectName } from '../features/concepts/conceptsData'
import styles from './ConceptsPage.module.css'

const firstSentence = text => {
    const end = text.indexOf('。')
    return end > 0 ? text.slice(0, end + 1) : text
}

function sourceLine(data, term) {
    if (term.not_in_standards) return '课标外的方法或 kebiao 的用法'
    const names = [...new Set(term.quotes.map(quote => subjectName(data, quote.subject)))]
    return `原文出自：${names.join('、')}`
}

export default function ConceptsPage() {
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    usePageMeta(conceptsMeta({ termCount: data?.terms.length }))
    useEffect(() => {
        let active = true
        loadConcepts().then(value => active && setData(value)).catch(errorValue => active && setError(errorValue.message))
        return () => { active = false }
    }, [])
    if (error) return <ErrorState title="概念词典加载失败" message={error} />
    if (!data) return <PageLoading message="正在打开概念词典" />
    return (
        <div className={`container ${styles.page}`}>
            <header className={styles.hero}>
                <p className={styles.kicker}>概念词典 · {data.terms.length} 个概念 · {data.subjects.length} 门学科的骨架</p>
                <h1 className={styles.title}>这些词，课标原文是怎么说的</h1>
                <p className={styles.lede}>
                    大概念、大单元、学习任务群、教—学—评一致性……教研和培训里天天听到，可每门学科说的并不完全是一回事。
                    这里逐条引用修订版课标原文和页码，写清各学科用法的不同，再附上国外课程怎么处理同一件事、常见的误解，以及 kebiao 里能直接打开的真实条目。
                </p>
                <div className={styles.heroLinks}>
                    <a className="btn btn-primary" href="#skeletons">先看我教的学科 <ArrowRightIcon size={16} aria-hidden="true" /></a>
                    <Link className="btn btn-secondary" to="/concepts/big-ideas">从「大概念」开始</Link>
                </div>
            </header>

            {data.categories.map(category => {
                const terms = data.terms.filter(term => term.category === category.id)
                if (!terms.length) return null
                return (
                    <section key={category.id} className={styles.block} aria-labelledby={`concept-category-${category.id}`}>
                        <div className={styles.blockHead}>
                            <h2 id={`concept-category-${category.id}`}>{category.label}</h2>
                            <p>{category.lede}</p>
                        </div>
                        <ul className={styles.termGrid}>
                            {terms.map(term => (
                                <li key={term.id}>
                                    <Link className={styles.termCard} to={`/concepts/${term.id}`}>
                                        <span className={styles.termName}>{term.term}</span>
                                        <span className={styles.termPlain}>{firstSentence(term.plain)}</span>
                                        <span className={styles.termSource}>{sourceLine(data, term)}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                )
            })}

            <section id="skeletons" className={styles.block} aria-labelledby="concept-skeletons">
                <div className={styles.blockHead}>
                    <h2 id="concept-skeletons">每门学科的骨架</h2>
                    <p>同样是「组织内容」，语文用学习任务群，科学用核心概念，化学用大概念，劳动用任务群。先看清你教的学科用什么组织，再读具体条目。</p>
                </div>
                <ul className={styles.subjectGrid}>
                    {data.subjects.map(subject => (
                        <li key={subject.slug}>
                            <Link className={styles.subjectCard} to={`/concepts/subjects/${subject.slug}`} style={{ '--subject-color': subject.color || 'var(--kb-gold)' }}>
                                <span className={styles.subjectName}><i aria-hidden="true" />{subject.name}</span>
                                <span className={styles.subjectOrganized}>{firstSentence(subject.organized_by)}</span>
                                <span className={styles.termSource}>{subject.standard_count} 条标准 · {subject.indicator_count} 条要点</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </section>
            <p className={styles.footnote}>{data.note} 原来的 <Link to="/glossary">kebiao 术语表</Link>解释的是网站自己的数据字段。</p>
        </div>
    )
}
