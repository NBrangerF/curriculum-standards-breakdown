import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { columnLabel, linesOf, loadGraphLessons, lessonsFor, nodeOf, pointNumber, sourceLabel, standardHref, threadOf } from './graphData'
import styles from './KnowledgeGraph.module.css'

const enc = encodeURIComponent
// a basic 要点 can be built on by many: the first few show, the rest on request
const MAX_AFTER = 5

/**
 * 聚焦: one 要点 in the middle (its words, its lessons, the way to prepare it), what it builds on to the left and what
 * builds on it to the right. Gold lines are 要先会 (judged by AI, to be checked); dashed ones are the same thread
 * one stage before or after. Picking any card puts it in the middle.
 */
export default function GraphFocus({ graph, code, wide, book, onPick, onBack }) {
    const node = nodeOf(graph, code)
    const standard = graph.standards[node.std]
    const lane = graph.lanes.find(item => item.id === standard.lane)
    const lines = linesOf(graph, code)
    const thread = threadOf(graph, code)
    const reached = new Set([...lines.before, ...lines.after].map(([other]) => other.replace(/\.\d+$/u, '')))
    const threadBefore = thread.before.filter(([std]) => !reached.has(std))
    const threadAfter = thread.after.filter(([std]) => !reached.has(std))

    const [allAfter, setAllAfter] = useState(false)
    useEffect(() => { setAllAfter(false) }, [code])
    const [lessons, setLessons] = useState(null)
    useEffect(() => {
        let active = true
        setLessons(null)
        loadGraphLessons(graph.slug).then(data => { if (active) setLessons(data.points) }).catch(() => { if (active) setLessons({}) })
        return () => { active = false }
    }, [graph.slug])

    const figRef = useRef(null)
    const svgRef = useRef(null)
    const mainRef = useRef(null)
    useLayoutEffect(() => {
        const fig = figRef.current
        const svg = svgRef.current
        if (!wide || !fig || !svg || !mainRef.current) return undefined
        const draw = () => {
            const box = fig.getBoundingClientRect()
            const main = mainRef.current.getBoundingClientRect()
            svg.setAttribute('width', box.width)
            svg.setAttribute('height', box.height)
            svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`)
            let paths = ''
            for (const [side, into] of [['before', true], ['after', false]]) {
                ;[...fig.querySelectorAll(`[data-side="${side}"] [data-card]`)].forEach((card, index) => {
                    const r = card.getBoundingClientRect()
                    const y1 = r.top - box.top + Math.min(r.height / 2, 36)
                    const x1 = into ? r.right - box.left : r.left - box.left
                    const x2 = into ? main.left - box.left : main.right - box.left
                    const y2 = main.top - box.top + 34 + index * 14
                    const mid = (x1 + x2) / 2
                    paths += `<path class="${styles[card.dataset.card]}" d="M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}"/>`
                })
            }
            svg.innerHTML = paths
        }
        draw()
        const observer = new ResizeObserver(draw)
        observer.observe(fig)
        return () => observer.disconnect()
    }, [wide, code, lessons])

    const nodeCard = ([other, reason], side) => {
        const target = nodeOf(graph, other)
        if (!target) return null
        return (
            <li key={other}>
                <button type="button" className={styles.card} data-card="ai" onClick={() => onPick(other, target.slug)}>
                    <span className={styles.cardMeta}>
                        {target.own ? null : <span className={styles.subjectChip} style={{ '--chip': target.color }}>{target.subject}</span>}
                        <span>{target.colLabel}</span>
                        <span>{other}</span>
                    </span>
                    <span className={styles.cardText}>{target.text}</span>
                    {target.tags?.length ? <span className={styles.tags}>{target.tags.map(tag => <span key={tag}>{tag}</span>)}</span> : null}
                    <span className={styles.why}>{side === 'before' ? '要先会' : '会用到它'} · {reason}</span>
                </button>
            </li>
        )
    }

    const stationCard = ([std, column], side) => {
        const info = graph.standards[std]
        if (!info) return null
        const inColumn = info.points.filter(point => nodeOf(graph, point)?.col === column)
        const first = inColumn[0] || info.points[0]
        const target = nodeOf(graph, first)
        const columns = [target?.colLabel].filter(Boolean)
        return (
            <li key={`${std}-${column}`}>
                <button type="button" className={`${styles.card} ${styles.cardThread}`} data-card="thread" onClick={() => onPick(first, target?.slug || graph.slug)}>
                    <span className={styles.cardMeta}>
                        {info.subject ? <span className={styles.subjectChip} style={{ '--chip': target?.color }}>{info.subject}</span> : null}
                        <span>{columns.join('、')}</span>
                        <span>{std}</span>
                    </span>
                    <span className={styles.cardText}>{info.title}：{(inColumn.length || info.points.length)} 个要点，如「{target?.text}」</span>
                    <span className={styles.whyThread}>同一线索 · {side === 'before' ? '上一站' : '下一站'}</span>
                </button>
            </li>
        )
    }

    const grade = /^\d$/u.test(node.col) ? node.col : (standard.stage || '').split('-')[0]
    const subjectName = graph.slug === 'arts' ? '艺术（音乐、美术等）' : graph.subject
    const planHref = `/lesson-plan?mode=topic&subject=${enc(subjectName)}&grade=${grade}&topic=${enc(standard.title)}&codes=${code}`
    const reportHref = `/feedback?code=${code}&title=${enc('知识图谱有误')}&message=${enc(`知识图谱 ${code}：\n哪一条「要先会」或教材的课不对，应该是：`)}`
    const before = [...lines.before.map(line => nodeCard(line, 'before')), ...threadBefore.map(pair => stationCard(pair, 'before'))].filter(Boolean)
    const after = [...lines.after.map(line => nodeCard(line, 'after')), ...threadAfter.map(pair => stationCard(pair, 'after'))].filter(Boolean)
    const point = graph.points[code]

    return (
        <section className={styles.focus} aria-label={`聚焦 ${code}`}>
            <div className={styles.crumbs}>
                <button type="button" className={styles.back} onClick={onBack}>← {graph.subject}全景</button>
                <span>{[lane?.group, lane?.name, `${standard.title}（${columnLabel(graph, point.col)}）`, `要点 ${pointNumber(code)}`].filter(Boolean).join(' / ')}</span>
            </div>
            <div className={styles.fc} ref={figRef}>
                {wide ? <svg className={styles.fcWires} ref={svgRef} aria-hidden="true" /> : null}
                <div className={`${styles.side} ${styles.before}`} data-side="before">
                    <h2 className={styles.sideHead}>先学 · 它要用到的</h2>
                    {before.length ? <ul className={styles.cards}>{before}</ul> : <p className={styles.sideEmpty}>没有找到它要先会的要点。</p>}
                    <p className={styles.arrow} aria-hidden="true">↓</p>
                </div>
                <article className={styles.main} ref={mainRef}>
                    <p className={styles.mainMeta}>
                        <b>{columnLabel(graph, point.col)}</b>
                        <span>· {graph.subject}</span>
                        {lane ? <span>· {lane.name}</span> : null}
                        <span>· {standard.title}</span>
                        <span>· {code}</span>
                    </p>
                    <p className={styles.mainText}>{point.t}</p>
                    <p className={styles.mainSource}>
                        课标原文{point.sec ? ` · ${point.sec}` : ''}{point.pg?.length ? ` · 修订版第 ${point.pg.join('、')} 页` : ''}{point.gb ? ` · 年级依据：${point.gb}` : ''}
                    </p>
                    {standard.points.length > 1 ? (
                        <div className={styles.sibs} role="group" aria-label="这条课标的要点">
                            <span>这条课标的 {standard.points.length} 个要点：</span>
                            {standard.points.map(other => (
                                <button key={other} type="button" aria-pressed={other === code} aria-label={`要点 ${pointNumber(other)}`} onClick={() => onPick(other, graph.slug)}>{pointNumber(other)}</button>
                            ))}
                        </div>
                    ) : null}
                    <Lessons rows={lessons ? lessons[code] : null} counts={point.n} book={book} loading={!lessons} />
                    <div className={styles.actions}>
                        <Link className="btn btn-primary" to={planHref}>用它备课 →</Link>
                        <Link className="btn btn-secondary" to={standardHref(code)}>打开课标页</Link>
                        <Link className={styles.report} to={reportHref}>报错</Link>
                    </div>
                </article>
                <div className={`${styles.side} ${styles.after}`} data-side="after">
                    <p className={styles.arrow} aria-hidden="true">↓</p>
                    <h2 className={styles.sideHead}>后学 · 会用到它的</h2>
                    {after.length ? <ul className={styles.cards}>{allAfter ? after : after.slice(0, MAX_AFTER)}</ul> : null}
                    {after.length > MAX_AFTER ? <button type="button" className={styles.more} aria-expanded={allAfter} onClick={() => setAllAfter(value => !value)}>{allAfter ? '收起' : `另外 ${after.length - MAX_AFTER} 个 ▾`}</button> : null}
                    {after.length ? null : <p className={styles.sideEmpty}>{/^[789]$|7-9|shared/u.test(point.col) ? '后面的内容不在义务教育课标里。' : '没有找到用到它的要点。'}</p>}
                </div>
            </div>
            <p className={styles.fcNote}>只显示直接的前后。金色实线「要先会」：学生没掌握前一个要点，很可能学不好后一个，不表示必须先学完；由 AI 逐条判断，待核验。虚线：课标里同一线索的上一站或下一站。</p>
        </section>
    )
}

function Lessons({ rows, counts, book, loading }) {
    const [open, setOpen] = useState(false)
    useEffect(() => { setOpen(false) }, [rows])
    const [taught = 0, touched = 0, books = 0] = counts || []
    if (loading) return <div className={styles.lessons}><h3>教材里在哪教</h3><p className={styles.mainSource}>正在找教材里的课…</p></div>
    const list = lessonsFor(rows, book)
    if (!list.length) return <div className={styles.lessons}><h3>教材里在哪教</h3><p className={styles.mainSource}>教材里还没有找到教它的课。</p></div>
    const shown = open ? list : list.slice(0, 3)
    return (
        <div className={styles.lessons}>
            <h3>教材里在哪教<small>· {taught ? `${taught} 课主要在教` : `${touched} 课也涉及`}，{books} 本书 · AI 逐课判断，待核验</small></h3>
            <ul>
                {shown.map(row => (
                    <li key={`${row.edition}-${row.unit}-${row.lesson}`}>
                        <Link to={`/textbooks/${row.edition}/standards`}>{row.label} · {row.unit} · {row.lesson}</Link>
                        <span className={`${styles.rel} ${row.relation === 'T' ? '' : styles.relP}`}>{row.relation === 'T' ? '主要在教' : '也涉及'}</span>
                        {row.sameBook ? <span className={styles.mine}>你的书</span> : row.sameEdition ? <span className={styles.mine}>你的版本</span> : null}
                        {row.quote && row.source !== 'title' ? <span className={styles.slip}>“{row.quote}”<small>{sourceLabel(row.source, row.page)}{row.reviewed ? ' · 教研员已核验' : ''}</small></span> : null}
                    </li>
                ))}
            </ul>
            {list.length > 3 ? <button type="button" className={styles.more} aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? '收起' : `另外 ${list.length - 3} 课 ▾`}</button> : null}
        </div>
    )
}
