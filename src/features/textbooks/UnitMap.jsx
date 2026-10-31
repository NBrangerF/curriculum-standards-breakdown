import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RELATION_LABELS, sourceLabel } from './alignmentModel'
import styles from './UnitMap.module.css'

const enc = encodeURIComponent
const standardHref = code => `/standards/${code.replace(/\.\d+$/u, '')}#${code}`
const unique = list => [...new Set(list)]

/**
 * One chapter as a map: its lessons on the left, the 要点 they teach on the right, a gold line for 主要在教
 * and a dashed one for 也涉及. Picking a lesson lights its lines and opens its quotes and 备课 links.
 * On phones the lines give way to each lesson's 要点 written under it.
 */
export default function UnitMap({ book, unit, points }) {
    const codes = useMemo(() => {
        const taught = unique(unit.lessons.flatMap(lesson => lesson.rows.filter(row => row[1] === 'T').map(row => row[0])))
        const touched = unique(unit.lessons.flatMap(lesson => lesson.rows.filter(row => row[1] === 'P').map(row => row[0]))).filter(code => !taught.includes(code))
        return [...taught, ...touched]
    }, [unit])
    const [selected, setSelected] = useState(null)
    const [hover, setHover] = useState(null)
    useEffect(() => { setSelected(null); setHover(null) }, [unit])
    const lit = hover || selected
    const litLesson = unit.lessons.find(lesson => lesson.id === lit) || null
    const active = unit.lessons.find(lesson => lesson.id === selected) || null
    const relationOf = code => litLesson?.rows.find(row => row[0] === code)?.[1] || null

    const figRef = useRef(null)
    const svgRef = useRef(null)
    const drawnFor = useRef(null)
    const litRef = useRef(lit)
    litRef.current = lit
    useLayoutEffect(() => {
        const fig = figRef.current
        const svg = svgRef.current
        if (!fig || !svg) return undefined
        const draw = () => {
            const width = fig.offsetWidth
            const height = fig.offsetHeight
            svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
            svg.setAttribute('width', width)
            svg.setAttribute('height', height)
            const pointRows = new Map([...fig.querySelectorAll('[data-point]')].map(el => [el.dataset.point, el]))
            let paths = ''
            for (const el of fig.querySelectorAll('[data-lesson]')) {
                const lesson = unit.lessons.find(item => item.id === el.dataset.lesson)
                const button = el.querySelector('button')
                if (!lesson || !button) continue
                // the figure is the offset parent of both lists' rows and buttons
                const x1 = button.offsetLeft + button.offsetWidth + 6
                const y1 = button.offsetTop + button.offsetHeight / 2
                for (const [code, relation] of lesson.rows) {
                    const target = pointRows.get(code)
                    if (!target) continue
                    const x2 = target.offsetLeft - 4
                    const y2 = target.offsetTop + 17
                    const mid = (x1 + x2) / 2
                    paths += `<path data-from="${lesson.id}" class="${relation}${litRef.current === lesson.id ? ` ${styles.hot}` : ''}" d="M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}"/>`
                }
            }
            svg.innerHTML = paths
            // the gold lines draw themselves once per chapter; reduced motion shows them at rest
            const animate = drawnFor.current !== unit && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
            drawnFor.current = unit
            if (!animate) return
            for (const path of svg.querySelectorAll('path.T')) {
                const length = path.getTotalLength()
                path.style.strokeDasharray = `${length}`
                path.style.strokeDashoffset = `${length}`
            }
            requestAnimationFrame(() => requestAnimationFrame(() => {
                for (const path of svg.querySelectorAll('path.T')) path.style.strokeDashoffset = '0'
            }))
        }
        draw()
        const observer = new ResizeObserver(() => draw())
        observer.observe(fig)
        return () => observer.disconnect()
    }, [unit, codes])

    // light the picked lesson's lines without redrawing them
    useEffect(() => {
        for (const path of svgRef.current?.querySelectorAll('path') || []) path.classList.toggle(styles.hot, path.dataset.from === lit)
    }, [lit, unit, codes])

    const pick = id => setSelected(current => (current === id ? null : id))

    return (
        <div className={styles.map}>
            <div className={`${styles.fig} ${lit ? styles.focused : ''}`} ref={figRef}>
                <svg className={styles.wires} ref={svgRef} aria-hidden="true" />
                <ol className={styles.lessons} aria-label={`${unit.name}的课`}>
                    {unit.lessons.map(lesson => {
                        const taught = lesson.rows.filter(row => row[1] === 'T')
                        return (
                            <li key={lesson.id} data-lesson={lesson.id} className={lesson.id === lit ? styles.lessonLit : ''}>
                                <button
                                    type="button"
                                    aria-pressed={selected === lesson.id}
                                    onClick={() => pick(lesson.id)}
                                    onMouseEnter={() => setHover(lesson.id)}
                                    onMouseLeave={() => setHover(null)}
                                >
                                    <span>{lesson.title}</span>
                                    {lesson.pdf_page ? <small>PDF {lesson.pdf_page}</small> : null}
                                </button>
                                {/* phones: the 要点 under the lesson, in place of the lines */}
                                {taught.length ? (
                                    <ul className={styles.inline}>
                                        {taught.map(row => <li key={row[0]}>{points.get(row[0])?.text || row[0]}</li>)}
                                    </ul>
                                ) : <p className={styles.inlineNone}>{lesson.judged ? '没有主要在教的要点' : '还没有逐课判断'}</p>}
                                {selected === lesson.id ? <div className={styles.inlineDetail}><LessonDetail book={book} unit={unit} lesson={lesson} points={points} /></div> : null}
                            </li>
                        )
                    })}
                </ol>
                <ul className={styles.points} aria-label={`${unit.name}教的要点`}>
                    {codes.map(code => {
                        const relation = relationOf(code)
                        return (
                            <li key={code} data-point={code} className={relation === 'T' ? styles.pointT : relation === 'P' ? styles.pointP : ''}>
                                <i aria-hidden="true" />
                                <span><Link to={standardHref(code)}>{points.get(code)?.text || code}</Link> <code>{code.split('-').pop()}</code></span>
                            </li>
                        )
                    })}
                </ul>
            </div>

            {active
                ? <section className={styles.detail} aria-label={`${active.title}：课标要点和教材原话`}><LessonDetail book={book} unit={unit} lesson={active} points={points} /></section>
                : <p className={`${styles.hint} ${styles.wideOnly}`}>点一课，看它对应的要点、教材原话和备课入口。</p>}
        </div>
    )
}

// A lesson's 要点 with the textbook's own words, and the way to prepare it
function LessonDetail({ book, unit, lesson, points }) {
    const query = `subject=${enc(book.subject || '')}&edition=${enc(book.edition_id)}`
    return (
        <>
            <div className={styles.detailHead}>
                <h4>{lesson.title}</h4>
                <p>{unit.name}{lesson.pdf_page ? ` · 教材 PDF 第 ${lesson.pdf_page} 页` : ''}</p>
            </div>
            {lesson.rows.length ? (
                <ul className={styles.rows}>
                    {lesson.rows.map(([code, relation, quote, source, page]) => (
                        <li key={code}>
                            <p className={styles.rowHead}>
                                <span className={relation === 'T' ? styles.tagT : styles.tagP}>{RELATION_LABELS[relation]}</span>
                                <Link className={styles.code} to={standardHref(code)}>{code}</Link>
                            </p>
                            <p className={styles.pointText}>{points.get(code)?.text || ''}</p>
                            {quote ? <p className={styles.paper}>“{quote}”<small>{sourceLabel(source, page)}</small></p> : null}
                        </li>
                    ))}
                </ul>
            ) : <p className={styles.hint}>{lesson.judged ? '没找到这一课主要在教的要点：可能是复习课、活动课，或课标没有写到的内容。' : '这一课还没有逐课判断。'}</p>}
            <div className={styles.actions}>
                {book.platform_only ? null : <Link className="btn btn-primary" to={`/lesson-plan?${query}&lesson=${enc(lesson.id)}`}>备这一课 →</Link>}
                {!book.platform_only && lesson.pdf_page ? <Link className="btn btn-secondary" to={`/textbooks/${book.edition_id}/read?page=${lesson.pdf_page}`}>看原书第 {lesson.pdf_page} 页</Link> : null}
                <Link className={styles.report} to={`/feedback?title=${enc('教材课标对应有误')}&message=${enc(`${book.title}（${book.edition_name || ''}）· ${unit.name} · ${lesson.title}\n\n哪一条不对，应该是：`)}`}>报错</Link>
            </div>
        </>
    )
}
