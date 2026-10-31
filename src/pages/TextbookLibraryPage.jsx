import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BookOpenTextIcon } from '@phosphor-icons/react/dist/csr/BookOpenText'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { PageLoading, ErrorState, EmptyState } from '../components/StateComponents'
import { textbooksMeta } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
import TextbookCover from '../features/textbooks/TextbookCover'
import { filterTextbooks, loadTextbookCatalog } from '../features/textbooks/textbookApi'
import { useMyBook } from '../features/mybook/myBook.js'
import BookPicker, { loadAllBooks } from '../features/mybook/BookPicker.jsx'
import MyBookCard from '../features/mybook/MyBookCard.jsx'
import styles from './TextbookLibraryPage.module.css'

// teachers look for their own subject first: the shelf runs 语文, 数学, 英语… then by grade and volume
const SUBJECT_ORDER = ['语文', '数学', '英语', '道德与法治', '科学', '物理', '化学', '生物学', '历史', '地理', '信息科技', '体育与健康', '艺术', '美术', '音乐', '劳动']
const subjectRank = name => (SUBJECT_ORDER.includes(name) ? SUBJECT_ORDER.indexOf(name) : SUBJECT_ORDER.length)
const shelfOrder = (a, b) => subjectRank(a.subject) - subjectRank(b.subject) || a.grade - b.grade || String(a.volume).localeCompare(String(b.volume), 'zh-CN') || String(a.edition_name).localeCompare(String(b.edition_name), 'zh-CN')

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
    usePageMeta(catalog ? textbooksMeta({ textbookCount: catalog.items?.length }) : null)
    const [error, setError] = useState('')
    const [visibleCount, setVisibleCount] = useState(36)
    const filters = filtersFromParams(searchParams)
    const myBook = useMyBook()
    const [changing, setChanging] = useState(false)
    // books whose lessons are matched to 课标 one by one, and the pilot editions known only by their lesson list
    const [aligned, setAligned] = useState(() => new Set())
    const [pilots, setPilots] = useState([])

    useEffect(() => {
        loadTextbookCatalog().then(setCatalog).catch(errorValue => setError(errorValue.message))
        fetch('/data/textbooks/national-lessons/index.json').then(response => (response.ok ? response.json() : null)).then(data => setAligned(new Set(Object.keys(data?.editions || {})))).catch(() => {})
        loadAllBooks().then(books => setPilots(books.filter(book => book.platform_only))).catch(() => {})
    }, [])

    const filtered = useMemo(
        () => filterTextbooks(catalog?.items || [], filters).slice().sort(shelfOrder),
        [catalog, filters.query, filters.stage, filters.subject, filters.grade, filters.volume]
    )
    const pilotGroups = useMemo(() => {
        const groups = new Map()
        for (const book of pilots) {
            if (filters.subject && book.subject !== filters.subject) continue
            if (filters.grade && String(book.grade) !== String(filters.grade)) continue
            const key = `${book.edition_name} · ${book.subject}`
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key).push(book)
        }
        return [...groups.entries()].sort(([, a], [, b]) => shelfOrder(a[0], b[0]))
    }, [pilots, filters.subject, filters.grade])

    useEffect(() => setVisibleCount(36), [filters.query, filters.stage, filters.subject, filters.grade, filters.volume])

    function updateFilter(key, value) {
        const next = new URLSearchParams(searchParams)
        if (value) next.set(key, value)
        else next.delete(key)
        setSearchParams(next, { replace: true })
    }

    if (error) return <ErrorState title="教材馆加载失败" message={error} />
    if (!catalog) return <PageLoading message="正在整理教材馆" />

    const manifest = catalog.manifest

    return (
        <div className={styles.page}>
            <section className={styles.hero}>
                <div className={`container ${styles.heroInner}`}>
                    <div className={styles.intro}>
                        <span className={styles.eyebrow}><BookOpenTextIcon size={16} aria-hidden="true" /> 教材馆 · 义务教育教科书</span>
                        <h1>选你的教材</h1>
                        <p>{manifest.count} 本有原书；{pilots.length ? `另有北师大、苏教、冀教、华东师大、青岛版等 ${pilots.length} 本只有国家平台的课目录。` : ''}每一课教哪几条课标、原话在第几页，都已逐课标好。</p>
                    </div>
                    {myBook && !changing
                        ? <MyBookCard book={myBook} onChange={() => setChanging(true)} />
                        : <BookPicker />}
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
                    <p>点一本书：每一课教哪几条课标、原书页码、备课入口。</p>
                </div>

                {filtered.length === 0 ? <EmptyState title="没有找到匹配教材" description="试试清除部分筛选条件。" /> : (
                    <>
                        <div className={styles.grid}>
                            {filtered.slice(0, visibleCount).map(book => (
                                <article className={styles.card} key={book.edition_id}>
                                    <Link to={`/textbooks/${book.edition_id}`} className={styles.coverLink} aria-label={`查看${book.title}`}><TextbookCover book={book} /></Link>
                                    <div className={styles.cardBody}>
                                        <h3><Link to={`/textbooks/${book.edition_id}`}>{book.title}</Link></h3>
                                        <p>{book.edition_name} · {book.page_count} PDF 页</p>
                                        <div className={styles.cardMeta}>{aligned.has(book.edition_id) ? <span className={styles.aligned}>逐课对好课标</span> : <span>课标对应待补</span>}</div>
                                        <Link className={styles.detailLink} to={`/textbooks/${book.edition_id}`}>进入教材 <ArrowRightIcon size={15} aria-hidden="true" /></Link>
                                    </div>
                                </article>
                            ))}
                        </div>
                        {visibleCount < filtered.length && <button className={styles.loadMore} onClick={() => setVisibleCount(count => count + 36)}>再显示 {Math.min(36, filtered.length - visibleCount)} 本</button>}
                    </>
                )}

                {pilotGroups.length && !filters.query && !filters.volume ? (
                    <section className={styles.pilots} aria-labelledby="pilot-editions">
                        <h2 id="pilot-editions">只有课目录的版本</h2>
                        <p>馆里没有这些书的原书；课目录来自国家中小学智慧教育平台，每一课教哪几条课标同样逐课标好。</p>
                        <dl>
                            {pilotGroups.map(([group, books]) => (
                                <div key={group}>
                                    <dt>{group}</dt>
                                    <dd>{books.map(book => <Link key={book.edition_id} to={`/textbooks/${book.edition_id}/standards`}>{book.grade} 年级{book.volume}</Link>)}</dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                ) : null}
            </section>
        </div>
    )
}
