import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { PageLoading, ErrorState } from '../components/StateComponents'
import { conceptsMeta } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import { loadConcepts } from '../features/concepts/conceptsData'
import { READING_PATH } from '../features/concepts/readingPath'
import styles from './ConceptsPage.module.css'

const firstSentence = text => {
    const end = text.indexOf('。')
    return end > 0 ? text.slice(0, end + 1) : text
}

// a term is found by its name, the other names it goes by, or its plain explanation
const matches = (term, query) => [term.term, ...term.aliases, term.plain].some(text => text.toLowerCase().includes(query.toLowerCase()))

export default function ConceptsPage() {
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const [query, setQuery] = useState('')
    const { hash } = useLocation()
    usePageMeta(conceptsMeta({ termCount: data?.terms.length }))
    useEffect(() => {
        let active = true
        loadConcepts().then(value => active && setData(value)).catch(errorValue => active && setError(errorValue.message))
        return () => { active = false }
    }, [])
    // #concept-path (教资 「先读这六页」) and #skeletons exist only once the data is in
    useEffect(() => {
        if (data && hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView()
    }, [data, hash])
    if (error) return <ErrorState title="概念词典加载失败" message={error} />
    if (!data) return <PageLoading message="正在打开概念词典" />
    const q = query.trim()
    const shown = q ? data.terms.filter(term => matches(term, q)) : data.terms
    return (
        <div className={`container ${styles.page}`}>
            <header className={styles.indexHead}>
                <p className={styles.kicker}>概念词典 · {data.terms.length} 个概念 · {data.subjects.length} 门学科的骨架</p>
                <h1 className={styles.title}>这些词，课标原文是怎么说的</h1>
                <p className={styles.lede}>大概念、大单元、学习任务群……每个词都引修订版课标原文、标明页码，并写清各学科用法的不同。</p>
                <label className={styles.find}>
                    <MagnifyingGlassIcon size={18} aria-hidden="true" />
                    <span className="sr-only">找一个词</span>
                    <input type="search" autoComplete="off" placeholder="找一个词，如：大单元、双向细目表" value={query} onChange={event => setQuery(event.target.value)} />
                </label>
            </header>

            {data.categories.map(category => {
                const terms = shown.filter(term => term.category === category.id)
                if (!terms.length) return null
                return (
                    <section key={category.id} className={styles.group} aria-labelledby={`concept-category-${category.id}`}>
                        <h2 id={`concept-category-${category.id}`}>{category.label}</h2>
                        <ul className={styles.terms}>
                            {terms.map(term => (
                                <li key={term.id}>
                                    <Link to={`/concepts/${term.id}`}>
                                        <b>{term.term}</b>
                                        <span>{firstSentence(term.plain)}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                )
            })}
            {q && !shown.length ? (
                <p className={styles.none} role="status">词典里没有「{q}」。可以用 <Link to={`/smart-search?q=${encodeURIComponent(q)}`}>AI 检索</Link>在课标原文里找。</p>
            ) : null}

            <section id="skeletons" className={styles.group} aria-labelledby="concept-skeletons">
                <h2 id="concept-skeletons">每门学科的骨架</h2>
                <p className={styles.groupLede}>同样是「组织内容」，语文用学习任务群，科学用核心概念，化学用大概念。先看你教的学科。</p>
                <ul className={styles.subjects}>
                    {data.subjects.map(subject => (
                        <li key={subject.slug}>
                            <Link to={`/concepts/subjects/${subject.slug}`} style={{ '--c': subject.color || 'var(--kb-gold)' }}><i aria-hidden="true" />{subject.name}</Link>
                        </li>
                    ))}
                </ul>
            </section>

            <section id="concept-path" className={styles.group} aria-labelledby="concept-path-title">
                <h2 id="concept-path-title">师范生、新教师：先读这六页</h2>
                <p className={styles.groupLede}>按这个顺序读，能把一本课标的来龙去脉理清楚。备考时再看 <Link to="/teacher-exam">教资课标速记</Link>。</p>
                <ol className={styles.path}>
                    {READING_PATH.map(([id, why]) => {
                        const term = data.terms.find(item => item.id === id)
                        return term ? <li key={id}><Link to={`/concepts/${id}`}>{term.term}</Link><span>{why}</span></li> : null
                    })}
                </ol>
            </section>
            <p className={styles.footnote}>{data.note} 原来的 <Link to="/glossary">kebiao 术语表</Link>解释的是网站自己的数据字段。</p>
        </div>
    )
}
