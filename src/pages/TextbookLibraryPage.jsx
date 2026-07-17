import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BookOpenTextIcon } from '@phosphor-icons/react/dist/csr/BookOpenText'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { LoadingState, ErrorState, EmptyState } from '../components/StateComponents'
import TextbookCover from '../features/textbooks/TextbookCover'
import TextbookStatus from '../features/textbooks/TextbookStatus'
import { filterTextbooks, loadTextbookCatalog } from '../features/textbooks/textbookApi'
import styles from './TextbookLibraryPage.module.css'

function filtersFromParams(params) {
    return {
        query: params.get('q') || '',
        stage: params.get('stage') || '',
        subject: params.get('subject') || '',
        grade: params.get('grade') || '',
        volume: params.get('volume') || ''
    }
}

export default function TextbookLibraryPage() {
    const [searchParams, setSearchParams] = useSearchParams()
    const [catalog, setCatalog] = useState(null)
    const [error, setError] = useState('')
    const [visibleCount, setVisibleCount] = useState(36)
    const filters = filtersFromParams(searchParams)

    useEffect(() => {
        loadTextbookCatalog().then(setCatalog).catch(errorValue => setError(errorValue.message))
    }, [])

    const filtered = useMemo(
        () => filterTextbooks(catalog?.items || [], filters),
        [catalog, filters.query, filters.stage, filters.subject, filters.grade, filters.volume]
    )

    useEffect(() => setVisibleCount(36), [filters.query, filters.stage, filters.subject, filters.grade, filters.volume])

    function updateFilter(key, value) {
        const next = new URLSearchParams(searchParams)
        if (value) next.set(key, value)
        else next.delete(key)
        setSearchParams(next, { replace: true })
    }

    if (error) return <ErrorState title="教材馆加载失败" message={error} />
    if (!catalog) return <LoadingState message="正在整理教材馆" />

    const manifest = catalog.manifest
    const primaryCount = manifest.filters.stages.find(item => item.value === 'primary')?.count || 0
    const juniorCount = manifest.filters.stages.find(item => item.value === 'junior')?.count || 0

    return (
        <div className={styles.page}>
            <section className={styles.hero}>
                <div className={`container ${styles.heroInner}`}>
                    <div>
                        <span className={styles.eyebrow}><BookOpenTextIcon size={16} aria-hidden="true" /> KEBIAO TEXTBOOK LIBRARY</span>
                        <h1>教材馆</h1>
                        <p>不只是 PDF 书架。从一本教材进入可定位的章节、印刷页码、课程标准和配套资源。</p>
                    </div>
                    <dl className={styles.stats}>
                        <div><dt>{manifest.count}</dt><dd>本学生教材</dd></div>
                        <div><dt>{primaryCount}</dt><dd>本小学教材</dd></div>
                        <div><dt>{juniorCount}</dt><dd>本初中教材</dd></div>
                        <div><dt>{manifest.filters.subjects.length}</dt><dd>个学科</dd></div>
                    </dl>
                </div>
            </section>

            <section className={styles.filters} aria-label="筛选教材">
                <div className={`container ${styles.filterGrid}`}>
                    <label className={styles.searchField}>
                        <span className="sr-only">搜索教材</span>
                        <MagnifyingGlassIcon size={18} aria-hidden="true" />
                        <input value={filters.query} onChange={event => updateFilter('q', event.target.value)} placeholder="搜索学科、年级或版本" />
                    </label>
                    <label><span>学段</span><select value={filters.stage} onChange={event => updateFilter('stage', event.target.value)}><option value="">全部学段</option>{manifest.filters.stages.map(item => <option key={item.value} value={item.value}>{item.label}（{item.count}）</option>)}</select></label>
                    <label><span>学科</span><select value={filters.subject} onChange={event => updateFilter('subject', event.target.value)}><option value="">全部学科</option>{manifest.filters.subjects.map(item => <option key={item.value} value={item.value}>{item.label}（{item.count}）</option>)}</select></label>
                    <label><span>年级</span><select value={filters.grade} onChange={event => updateFilter('grade', event.target.value)}><option value="">全部年级</option>{manifest.filters.grades.map(item => <option key={item.value} value={item.value}>{item.label}（{item.count}）</option>)}</select></label>
                    <label><span>册次</span><select value={filters.volume} onChange={event => updateFilter('volume', event.target.value)}><option value="">全部册次</option>{manifest.filters.volumes.map(item => <option key={item.value} value={item.value}>{item.label}（{item.count}）</option>)}</select></label>
                    {Object.values(filters).some(Boolean) && <button className={styles.reset} onClick={() => setSearchParams({})}>清除筛选</button>}
                </div>
            </section>

            <section className={`container ${styles.results}`}>
                <div className={styles.resultsHeader}>
                    <div><span>共 {filtered.length} 本</span><h2>{filters.subject || filters.stage ? '筛选结果' : '全部教材'}</h2></div>
                    <p>「已定位」表示已通过正文回查，可直接跳转到 PDF 页。</p>
                </div>

                {filtered.length === 0 ? <EmptyState title="没有找到匹配教材" description="试试清除部分筛选条件。" /> : (
                    <>
                        <div className={styles.grid}>
                            {filtered.slice(0, visibleCount).map(book => (
                                <article className={styles.card} key={book.edition_id}>
                                    <Link to={`/textbooks/${book.edition_id}`} className={styles.coverLink} aria-label={`查看${book.title}`}><TextbookCover book={book} /></Link>
                                    <div className={styles.cardBody}>
                                        <div className={styles.badges}><TextbookStatus value={book.toc_status} /> <TextbookStatus value={book.text_quality} /></div>
                                        <h3><Link to={`/textbooks/${book.edition_id}`}>{book.title}</Link></h3>
                                        <p>{book.edition_name} · {book.page_count} PDF 页</p>
                                        <div className={styles.cardMeta}><span>{book.toc_entry_count} 个可定位目录</span><span>{book.related_resource_count} 份配套资源</span></div>
                                        <Link className={styles.detailLink} to={`/textbooks/${book.edition_id}`}>进入教材 <ArrowRightIcon size={15} aria-hidden="true" /></Link>
                                    </div>
                                </article>
                            ))}
                        </div>
                        {visibleCount < filtered.length && <button className={styles.loadMore} onClick={() => setVisibleCount(count => count + 36)}>再显示 {Math.min(36, filtered.length - visibleCount)} 本</button>}
                    </>
                )}
            </section>
        </div>
    )
}
