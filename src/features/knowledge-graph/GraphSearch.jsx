import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SPINE_COLORS } from '../mybook/myBook.js'
import { GRAPH_SUBJECTS, graphHref, loadGraphSearch, searchGraph } from './graphData'
import styles from './KnowledgeGraph.module.css'

const NAMES = Object.fromEntries(GRAPH_SUBJECTS)

function Mark({ text, query }) {
    const word = query.trim().split(/\s+/u)[0]
    const at = word ? text.toLowerCase().indexOf(word.toLowerCase()) : -1
    if (at < 0) return text
    return <>{text.slice(0, at)}<mark>{text.slice(at, at + word.length)}</mark>{text.slice(at + word.length)}</>
}

/** One box: lesson titles, 要点 wording and themes, the subject on screen first, then every other subject. */
export default function GraphSearch({ graph }) {
    const navigate = useNavigate()
    const [query, setQuery] = useState('')
    const [index, setIndex] = useState(null)
    const [open, setOpen] = useState(false)
    const [active, setActive] = useState(0)
    const closeTimer = useRef(null)
    const results = useMemo(() => searchGraph(graph, index, query), [graph, index, query])
    const showing = open && query.trim().length > 0

    const warm = () => {
        setOpen(true)
        if (!index) loadGraphSearch().then(setIndex).catch(() => {})
    }
    const go = result => {
        setOpen(false)
        setQuery('')
        navigate(graphHref(result.slug, result.code))
    }
    const onKeyDown = event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setActive(value => Math.min(value + 1, Math.max(results.length - 1, 0))) }
        else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(value => Math.max(value - 1, 0)) }
        else if (event.key === 'Enter' && results[active]) { event.preventDefault(); go(results[active]) }
        else if (event.key === 'Escape') setOpen(false)
    }

    return (
        <div
            className={styles.search}
            role="search"
            onFocus={() => clearTimeout(closeTimer.current)}
            onBlur={() => { closeTimer.current = setTimeout(() => setOpen(false), 160) }}
        >
            <label className={styles.searchBox}>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                <input
                    id="graph-search"
                    type="search"
                    value={query}
                    placeholder="搜课名、要点或主题：比例、浮力、光合作用"
                    aria-label="搜知识点：课名、要点或主题"
                    aria-controls={showing ? 'graph-search-results' : undefined}
                    autoComplete="off"
                    onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true) }}
                    onFocus={warm}
                    onKeyDown={onKeyDown}
                />
            </label>
            {showing ? (
                <ul id="graph-search-results" className={styles.results} aria-label="搜索结果">
                    {results.length ? results.map((result, k) => (
                        <li key={result.code}>
                            <Link to={graphHref(result.slug, result.code)} data-active={k === active} onClick={() => { setOpen(false); setQuery('') }}>
                                <span className={styles.resultMeta}>
                                    {result.slug !== graph?.slug ? <span className={styles.subjectChip} style={{ '--chip': SPINE_COLORS[result.slug] }}>{NAMES[result.slug]}</span> : null}
                                    <span>{result.col}</span>
                                    <span>{result.code}</span>
                                </span>
                                <span className={styles.resultText}><Mark text={result.text} query={query} /></span>
                                <span className={styles.resultLessons}><Mark text={[result.standard, result.lessons].filter(Boolean).join(' · ')} query={query} /></span>
                            </Link>
                        </li>
                    )) : <li className={styles.resultsNote}>{index ? '没有找到。换个说法，或者用课本里的课名试试。' : '正在载入全部学科…'}</li>}
                </ul>
            ) : null}
        </div>
    )
}
