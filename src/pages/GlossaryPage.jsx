import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { m } from 'motion/react'
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft'
import { BookOpenTextIcon } from '@phosphor-icons/react/dist/csr/BookOpenText'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import { LoadingState, ErrorState } from '../components/StateComponents'
import styles from './GlossaryPage.module.css'

const RELATED_TERM_ALIASES = Object.freeze({
    standard: 'standard',
    domain: 'domain',
    subdomain: 'subdomain',
    grade_band: 'grade-band',
    context: 'context',
    practice: 'practice',
    teaching_tip: 'teaching-tip',
    transferable_skills: 'transferable-skills',
    ts_primary: 'primary-tag',
    ts_secondary: 'secondary-tag',
    look_fors: 'look-fors',
    teacher_moves: 'teacher-moves'
})

function toTermKey(value = '') {
    return value
        .toLocaleLowerCase('en-US')
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
}

function getTermKey(term) {
    return toTermKey(term.term_en || term.term)
}

function getTermId(term) {
    return `glossary-term-${getTermKey(term)}`
}

function GlossaryPage() {
    const [searchParams, setSearchParams] = useSearchParams()
    const [glossary, setGlossary] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [activeTermKey, setActiveTermKey] = useState(searchParams.get('term') || '')

    useEffect(() => {
        fetch('/data/glossary.json')
            .then(response => {
                if (!response.ok) throw new Error('无法加载术语数据')
                return response.json()
            })
            .then(data => {
                setGlossary(data)
                setLoading(false)
            })
            .catch(fetchError => {
                setError(fetchError.message)
                setLoading(false)
            })
    }, [])

    const categories = glossary?.categories || []
    const terms = glossary?.terms || []
    const requestedCategory = searchParams.get('category') || 'all'
    const selectedCategory = requestedCategory === 'all' || categories.some(category => category.id === requestedCategory)
        ? requestedCategory
        : 'all'
    const searchTerm = searchParams.get('q') || ''
    const requestedTermKey = searchParams.get('term') || ''
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('zh-CN')
    const filteredTerms = useMemo(() => terms.filter(term => {
        const matchesCategory = selectedCategory === 'all' || term.category === selectedCategory
        const matchesSearch = !normalizedSearch || [term.term, term.term_en, term.definition]
            .some(value => value.toLocaleLowerCase('zh-CN').includes(normalizedSearch))
        return matchesCategory && matchesSearch
    }), [normalizedSearch, selectedCategory, terms])

    const termsByKey = useMemo(() => new Map(terms.map(term => [getTermKey(term), term])), [terms])

    const selectedCategoryMeta = categories.find(category => category.id === selectedCategory)

    useEffect(() => {
        if (!glossary || requestedCategory === 'all' || categories.some(category => category.id === requestedCategory)) return
        const next = new URLSearchParams(searchParams)
        next.delete('category')
        setSearchParams(next, { replace: true })
    }, [categories, glossary, requestedCategory, searchParams, setSearchParams])

    useEffect(() => {
        if (!filteredTerms.length) {
            setActiveTermKey('')
            return undefined
        }

        if (!requestedTermKey) setActiveTermKey(getTermKey(filteredTerms[0]))

        let observer
        const frame = requestAnimationFrame(() => {
            const elements = [...document.querySelectorAll('[data-kb-glossary-term]')]
            observer = new IntersectionObserver(() => {
                const activationLine = window.innerHeight * 0.3
                const current = elements.reduce((candidate, element) => (
                    element.getBoundingClientRect().top <= activationLine ? element : candidate
                ), elements[0])
                if (current?.dataset.kbGlossaryTerm) setActiveTermKey(current.dataset.kbGlossaryTerm)
            }, {
                rootMargin: '-15% 0px -58% 0px',
                threshold: [0.05, 0.2, 0.45]
            })
            elements.forEach(element => observer.observe(element))
        })

        return () => {
            cancelAnimationFrame(frame)
            observer?.disconnect()
        }
    }, [filteredTerms, requestedTermKey])

    useEffect(() => {
        if (!requestedTermKey || !filteredTerms.some(term => getTermKey(term) === requestedTermKey)) return undefined
        const frame = requestAnimationFrame(() => {
            const target = document.getElementById(`glossary-term-${requestedTermKey}`)
            if (!target) return
            const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
            setActiveTermKey(requestedTermKey)
            target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
            window.setTimeout(() => {
                target.querySelector('h3')?.focus({ preventScroll: true })
            }, reducedMotion ? 0 : 220)
        })
        return () => cancelAnimationFrame(frame)
    }, [filteredTerms, requestedTermKey])

    if (loading) {
        return <div className="page-content container"><LoadingState message="加载术语表" /></div>
    }

    if (error) {
        return (
            <div className="page-content container">
                <ErrorState title="术语表暂时不可用" message={error} onRetry={() => window.location.reload()} />
            </div>
        )
    }

    const clearFilters = () => {
        setSearchParams({}, { replace: false })
    }

    const updateSearch = value => {
        const next = new URLSearchParams(searchParams)
        if (value) next.set('q', value)
        else next.delete('q')
        next.delete('term')
        setSearchParams(next, { replace: true })
    }

    const updateCategory = category => {
        const next = new URLSearchParams(searchParams)
        if (category === 'all') next.delete('category')
        else next.set('category', category)
        next.delete('term')
        setSearchParams(next, { replace: false })
    }

    const getTermHref = (term, { clearSearch = false, useTermCategory = false } = {}) => {
        const next = new URLSearchParams(searchParams)
        next.set('term', getTermKey(term))
        if (useTermCategory && term.category) next.set('category', term.category)
        if (clearSearch) next.delete('q')
        const query = next.toString()
        return query ? `/glossary?${query}` : '/glossary'
    }

    return (
        <div className={styles.root} data-kb-route="glossary">
            <section className={styles.hero} aria-labelledby="glossary-title">
                <div className={`container ${styles.heroLayout}`}>
                    <div>
                        <Link to="/" className={styles.backLink}>
                            <ArrowLeftIcon size={17} aria-hidden="true" />
                            返回首页
                        </Link>
                        <span className={styles.coordinate} aria-hidden="true">REFERENCE / TERMS</span>
                        <h1 id="glossary-title">术语表</h1>
                        <p>课程标准、结构字段与可迁移技能系统的关键定义。</p>
                    </div>
                    <div className={styles.indexMark} aria-hidden="true">
                        <BookOpenTextIcon size={30} weight="light" />
                        <span>{String(terms.length).padStart(2, '0')}</span>
                        <small>TERMS</small>
                    </div>
                </div>
            </section>

            <section className={styles.filters} aria-label="术语筛选">
                <div className={`container ${styles.filterLayout}`}>
                    <label className={styles.searchField}>
                        <span className="sr-only">搜索术语</span>
                        <MagnifyingGlassIcon size={19} aria-hidden="true" />
                        <input
                            type="search"
                            placeholder="搜索中文、英文或定义"
                            value={searchTerm}
                            onChange={event => updateSearch(event.target.value)}
                        />
                        {searchTerm ? (
                            <button type="button" onClick={() => updateSearch('')} aria-label="清除术语搜索">
                                <XIcon size={17} aria-hidden="true" />
                            </button>
                        ) : null}
                    </label>
                    <div className={styles.categoryTabs} role="group" aria-label="按术语类别筛选">
                        <button
                            type="button"
                            aria-pressed={selectedCategory === 'all'}
                            onClick={() => updateCategory('all')}
                        >
                            <span>全部</span>
                            {selectedCategory === 'all' ? (
                                <m.span layoutId="glossary-category-indicator" className={styles.categoryIndicator} aria-hidden="true" />
                            ) : null}
                        </button>
                        {categories.map(category => (
                            <button
                                type="button"
                                key={category.id}
                                aria-pressed={selectedCategory === category.id}
                                onClick={() => updateCategory(category.id)}
                            >
                                <span>{category.id}</span>
                                {selectedCategory === category.id ? (
                                    <m.span layoutId="glossary-category-indicator" className={styles.categoryIndicator} aria-hidden="true" />
                                ) : null}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <section className={styles.content} aria-labelledby="glossary-results-title">
                <div className={`container ${styles.contentLayout}`}>
                    <aside className={styles.resultContext}>
                        <span>当前索引</span>
                        <h2 id="glossary-results-title">{selectedCategoryMeta?.id || '全部术语'}</h2>
                        <p>{selectedCategoryMeta?.description || '浏览课程标准体系中的全部定义。'}</p>
                        <strong data-kb-component="glossary-result-count" role="status" aria-live="polite">{filteredTerms.length} 个结果</strong>
                        {filteredTerms.length ? (
                            <nav className={styles.termIndexNav} aria-label="当前结果术语索引">
                                {filteredTerms.map((term, index) => {
                                    const termKey = getTermKey(term)
                                    const isActive = activeTermKey === termKey
                                    return (
                                        <Link
                                            key={termKey}
                                            to={getTermHref(term)}
                                            aria-current={isActive ? 'location' : undefined}
                                            data-kb-glossary-index={termKey}
                                        >
                                            <span>{String(index + 1).padStart(2, '0')}</span>
                                            <strong>{term.term}</strong>
                                            {isActive ? (
                                                <m.i
                                                    layoutId="glossary-term-indicator"
                                                    className={styles.termIndexIndicator}
                                                    transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.7 }}
                                                    aria-hidden="true"
                                                />
                                            ) : null}
                                        </Link>
                                    )
                                })}
                            </nav>
                        ) : null}
                    </aside>

                    <div className={styles.termsList}>
                        {filteredTerms.map((term, index) => {
                            const termKey = getTermKey(term)
                            const isActive = activeTermKey === termKey
                            return (
                                <article
                                    key={`${term.term}-${term.category}`}
                                    id={getTermId(term)}
                                    className={`${styles.term} ${isActive ? styles.activeTerm : ''}`}
                                    data-kb-glossary-term={termKey}
                                    data-active={isActive || undefined}
                                >
                                    <div className={styles.termIndex} aria-hidden="true">{String(index + 1).padStart(2, '0')}</div>
                                    <div>
                                        <div className={styles.termHeading}>
                                        <div>
                                            <h3 tabIndex="-1">{term.term}</h3>
                                            <p lang="en">{term.term_en}</p>
                                        </div>
                                        <span>{term.category}</span>
                                    </div>
                                    <p className={styles.termDefinition}>{term.definition}</p>

                                    {term.examples?.length ? (
                                        <div className={styles.termExamples}>
                                            <strong>示例</strong>
                                            <ul>
                                                {term.examples.map(example => <li key={example}>{example}</li>)}
                                            </ul>
                                        </div>
                                    ) : null}

                                    {term.related_terms?.length ? (
                                        <div className={styles.termRelated}>
                                            <strong>相关术语</strong>
                                            <div>
                                                {term.related_terms.map(relatedTerm => (
                                                    RELATED_TERM_ALIASES[relatedTerm] && termsByKey.get(RELATED_TERM_ALIASES[relatedTerm]) ? (
                                                        <Link
                                                            key={relatedTerm}
                                                            to={getTermHref(termsByKey.get(RELATED_TERM_ALIASES[relatedTerm]), { clearSearch: true, useTermCategory: true })}
                                                            aria-label={`跳转到相关术语 ${termsByKey.get(RELATED_TERM_ALIASES[relatedTerm]).term}`}
                                                        >
                                                            <code>{relatedTerm}</code>
                                                        </Link>
                                                    ) : <code key={relatedTerm}>{relatedTerm}</code>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                    </div>
                                </article>
                            )
                        })}

                        {!filteredTerms.length ? (
                            <div className={styles.emptyState}>
                                <MagnifyingGlassIcon size={30} aria-hidden="true" />
                                <h3>没有匹配的术语</h3>
                                <p>尝试更短的关键词，或返回全部类别。</p>
                                <button type="button" className="btn btn-secondary" onClick={clearFilters}>清除筛选</button>
                            </div>
                        ) : null}
                    </div>
                </div>
            </section>
        </div>
    )
}

export default GlossaryPage
