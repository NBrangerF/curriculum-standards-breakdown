import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '../components/StateComponents'
import { useUiV2 } from '../components/RouteUiBoundary.jsx'
import { mergeGraphStateIntoURL, parseGraphStateFromURL } from '../data/query.js'
import { runViewTransition } from '../utils/viewTransition.js'
import { useSky, useSkyView, useStarmap } from '../features/starmap/SkyProvider.jsx'
import { BAND_LABEL, CN_DIGIT, F, SKILL_SHORT, STAGE_RANGE, stageName } from '../features/starmap/starmapData.js'
import Ignite from '../features/starmap/Ignite.jsx'
import { useCountUp } from '../features/starmap/motionHooks.js'
import { compareHref } from '../features/starmap/compareLinks.js'
import styles from './SubjectPage.module.css'

const SkillsGraphWorkspace = lazy(() => import('../features/graph/SkillsGraphWorkspace.jsx'))
const GRAPH_RELATION_TYPES = Object.freeze(['contains', 'progression', 'skill_alignment'])
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function Stat({ value, label }) {
    const n = useCountUp(value)
    return <div><b>{n}</b><span>{label}</span></div>
}

function RailButton({ color, name, count, onClick, onEnter, onLeave, disabled, title }) {
    return (
        <li>
            <button
                type="button"
                className={styles.sbtn}
                style={{ '--c': color }}
                title={title}
                disabled={disabled}
                onClick={onClick}
                onPointerEnter={onEnter}
                onPointerLeave={onLeave}
                onFocus={onEnter}
                onBlur={onLeave}
                onPointerMove={event => { const r = event.currentTarget.getBoundingClientRect(); event.currentTarget.style.setProperty('--mx', `${event.clientX - r.left}px`) }}
            >
                <span className={styles.nm}><i aria-hidden="true" /><span className={styles.tx}>{name}</span></span>
                <span className={styles.ct}>{count}</span>
            </button>
        </li>
    )
}

/** Stage × domain table: four stages side by side, one row per domain, hover a standard to see its chain. */
function StageTable({ K, s, jr, setJr, focus, setFocus, ts, query, tableRef, onMeasure }) {
    const { revealTo } = useSky()
    const sub = K.subjects[s]
    const list = K.bySubject[s]
    const S = K.S
    const items = useRef(new Map())
    const pathRef = useRef(null)
    const [active, setActive] = useState(-1)
    const inCol = useCallback((i, b) => (b < 3 ? S[i][F.BAND] === b : S[i][F.BAND] === jr), [S, jr])
    const shown = useMemo(() => new Set(list.filter(i => S[i][F.BAND] < 3 || S[i][F.BAND] === jr)), [list, S, jr])

    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const filtering = ts >= 0 || terms.length > 0
    const lit = useCallback(i => (ts < 0 || S[i][F.SKILL] === ts) && terms.every(t => K.haystack[i].includes(t)), [S, ts, terms, K])

    const relation = useMemo(() => {
        if (active < 0) return { rel: new Set(), edges: [] }
        const rel = new Set()
        const edges = []
        const walk = key => { const q = [active], seen = new Set([active]); while (q.length) { const x = q.shift(); for (const y of S[x][key]) { if (seen.has(y) || !shown.has(y)) continue; seen.add(y); rel.add(y); edges.push(key === F.NEXT ? [x, y] : [y, x]); q.push(y) } } }
        walk(F.PREV); walk(F.NEXT)
        return { rel, edges }
    }, [active, S, shown])

    const drawLines = useCallback(animate => {
        const path = pathRef.current
        const grid = tableRef.current
        if (!path || !grid) return
        if (!relation.edges.length) { path.setAttribute('d', ''); return }
        const gr = grid.getBoundingClientRect()
        const pt = i => {
            const b = items.current.get(i)
            if (!b) return null
            const r = b.getBoundingClientRect(), d = b.firstChild.getBoundingClientRect()
            return { l: d.left - gr.left - 4, r: r.right - gr.left - 6, y: d.top + d.height / 2 - gr.top }
        }
        let d = ''
        for (const [x, y] of relation.edges) {
            const A = pt(x), B = pt(y)
            if (!A || !B || Math.abs(A.l - B.l) < 4) continue
            const [p, q] = A.l < B.l ? [A, B] : [B, A]
            const x1 = p.r, x2 = q.l, dx = Math.max(20, (x2 - x1) * 0.5)
            d += `M${x1.toFixed(1)} ${p.y.toFixed(1)}C${(x1 + dx).toFixed(1)} ${p.y.toFixed(1)} ${(x2 - dx).toFixed(1)} ${q.y.toFixed(1)} ${x2.toFixed(1)} ${q.y.toFixed(1)}`
        }
        path.setAttribute('d', d)
        path.classList.remove(styles.draw)
        if (animate) void path.getBoundingClientRect()
        path.classList.add(styles.draw)
    }, [relation, tableRef])
    useLayoutEffect(() => { drawLines(true) }, [drawLines])
    useEffect(() => { setActive(-1) }, [s, jr])
    useLayoutEffect(() => { onMeasure() })

    const status = active >= 0
        ? (relation.rel.size ? [...relation.rel, active].sort((x, y) => S[x][F.BAND] - S[y][F.BAND] || x - y).map(x => S[x][F.CODE]).join(' → ') : `${S[active][F.CODE]} · 无前后条目`)
        : null

    const cols = [0, 1, 2, 3].map(b => ({ b, n: list.filter(i => inCol(i, b)).length }))
    const widths = cols.map(({ b }) => (focus < 0 ? '1fr' : focus === b ? '2.4fr' : '0.75fr'))
    items.current = new Map()

    return (
        <>
            <p className={styles.status} aria-live="polite">{status}</p>
            <div className={styles.mxScroll}>
                <div
                    ref={tableRef}
                    className={`${styles.mx} ${focus >= 0 ? styles.focusing : ''} ${active >= 0 ? styles.chain : ''} ${filtering ? styles.filtering : ''}`}
                    style={{ '--c0': widths[0], '--c1': widths[1], '--c2': widths[2], '--c3': widths[3] }}
                    onPointerLeave={() => setActive(-1)}
                    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setActive(-1) }}
                    onTransitionEnd={event => { if (event.target === event.currentTarget) { onMeasure(); drawLines(false) } }}
                >
                    <svg className={styles.lines} aria-hidden="true"><path ref={pathRef} pathLength="1" /></svg>
                    {cols.map(({ b, n }) => (
                        <div key={`h${b}`} className={`${styles.hd} ${focus === b ? styles.wide : ''}`} data-b={b}>
                            <button type="button" aria-pressed={focus === b} onClick={() => setFocus(focus === b ? -1 : b)}>
                                <small>{stageName(s, b)}</small>
                                <b>{STAGE_RANGE[b]}</b>
                                {b === 3 ? <span className={styles.gap}>与 5–6 年级未连线</span> : null}
                            </button>
                            {b === 3 ? (
                                <div className={styles.tabs}>
                                    {[3, 4, 5].map(g => <button key={g} type="button" aria-pressed={g === jr} aria-label={BAND_LABEL[g]} onClick={() => setJr(g)}>{'七八九'[g - 3]}</button>)}
                                </div>
                            ) : null}
                            <span className={styles.n}>{n}</span>
                        </div>
                    ))}
                    {sub.domains.map((name, d) => {
                        const dl = list.filter(i => S[i][F.DOMAIN] === d)
                        return [
                            <div key={`d${d}`} id={`dom-${d}`} className={styles.dom}>
                                <div><b>{name}</b><span>{dl.length}</span></div>
                            </div>,
                            ...[0, 1, 2, 3].map(b => {
                                const cell = dl.filter(i => inCol(i, b))
                                let lastSub = null
                                return (
                                    <div key={`c${d}-${b}`} className={`${styles.cell} ${b === 3 ? styles.b3 : ''} ${focus === b ? styles.wide : ''}`}>
                                        {!cell.length ? <p className={styles.nil}>·</p> : (
                                            <ol>
                                                {cell.flatMap(i => {
                                                    const out = []
                                                    const sd = sub.subs[S[i][F.SUB]]
                                                    if (sd && sd !== name && sd !== lastSub) out.push(<li key={`g-${i}`} className={styles.grp}>{sd}</li>)
                                                    lastSub = sd
                                                    const code = S[i][F.CODE]
                                                    const to = `/standards/${encodeURIComponent(code)}`
                                                    out.push(
                                                        <li key={code}>
                                                            <Link
                                                                ref={el => { if (el) items.current.set(i, el) }}
                                                                to={to}
                                                                data-star={i}
                                                                className={`${styles.mi} ${i === active ? styles.on : ''} ${relation.rel.has(i) ? styles.rel : ''} ${filtering && lit(i) ? styles.lit : ''}`}
                                                                onPointerEnter={() => setActive(i)}
                                                                onFocus={() => setActive(i)}
                                                                onClick={event => { event.preventDefault(); const r = event.currentTarget.getBoundingClientRect(); revealTo(to, r.left + 12, r.top + 16) }}
                                                            >
                                                                <i className={styles.dot} data-dot aria-hidden="true" />
                                                                <code>{code}</code>
                                                                <span>{S[i][F.TEXT]}</span>
                                                            </Link>
                                                        </li>
                                                    )
                                                    return out
                                                })}
                                            </ol>
                                        )}
                                    </div>
                                )
                            })
                        ]
                    })}
                </div>
            </div>
        </>
    )
}

function SubjectPage() {
    const { slug } = useParams()
    const { K, error } = useStarmap()
    const { engineRef, revealTo } = useSky()
    const { enabled: uiV2Enabled } = useUiV2()
    const [searchParams, setSearchParams] = useSearchParams()
    const heroRef = useRef(null)
    const copyRef = useRef(null)
    const tableRef = useRef(null)
    const [jr, setJr] = useState(3)
    const [focus, setFocus] = useState(-1)
    const [ts, setTs] = useState(-1)
    const [query, setQuery] = useState('')
    const [peerBand, setPeerBand] = useState(1)

    const searchKey = searchParams.toString()
    const graphState = useMemo(() => parseGraphStateFromURL(new URLSearchParams(searchKey)), [searchKey])
    const graphView = uiV2Enabled && graphState.view === 'graph'
    const s = K ? K.slugIndex.get(slug) : undefined

    useEffect(() => { setJr(3); setFocus(-1); setTs(-1); setQuery('') }, [slug])

    const skyConfig = useMemo(() => (s == null ? null : {
        subject: s,
        get heroEl() { return heroRef.current },
        get copyEl() { return copyRef.current },
        get tableEl() { return tableRef.current },
        onStarClick: (i, x, y) => revealTo(`/standards/${encodeURIComponent(K.S[i][F.CODE])}`, x, y),
        onSector: d => jumpDomain(d)
    }), [s, K, revealTo])
    useSkyView('subject', skyConfig, `${slug}:${graphView ? 'graph' : 'table'}`)

    const measure = useCallback(() => { engineRef.current?.measureTable() }, [engineRef])
    useEffect(() => {
        const table = tableRef.current
        if (!table || !window.ResizeObserver) return undefined
        const ro = new ResizeObserver(() => engineRef.current?.measureTable())
        ro.observe(table)
        return () => ro.disconnect()
    }, [engineRef, s, graphView])

    // the skill filter and in-subject search also light the matching stars
    useEffect(() => {
        if (!K || s == null) return undefined
        const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
        const on = ts >= 0 || terms.length > 0
        engineRef.current?.setRestHighlight(on ? K.bySubject[s].filter(i => (ts < 0 || K.S[i][F.SKILL] === ts) && terms.every(t => K.haystack[i].includes(t))) : null)
        return () => engineRef.current?.setRestHighlight(null)
    }, [K, s, ts, query, engineRef])

    const setViewMode = mode => {
        if (mode === 'graph') {
            runViewTransition(() => setSearchParams(mergeGraphStateIntoURL(searchParams, {
                view: 'graph',
                subject: slug,
                selectedNode: `subject:${encodeURIComponent(slug.toLowerCase())}`,
                focusDepth: 2,
                relationTypes: [...GRAPH_RELATION_TYPES],
                compareSelection: []
            }), { replace: false }))
            return
        }
        runViewTransition(() => setSearchParams(mergeGraphStateIntoURL(searchParams, {}), { replace: false }))
    }
    const updateGraphState = useCallback((partial, options = {}) => {
        const current = parseGraphStateFromURL(new URLSearchParams(searchParams))
        const next = { ...current, ...partial, view: 'graph', subject: slug }
        setSearchParams(mergeGraphStateIntoURL(searchParams, next), { replace: options.replace === true })
    }, [searchParams, setSearchParams, slug])

    function jumpDomain(d) {
        const row = document.getElementById(`dom-${d}`)
        if (!row) return
        row.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' })
        row.classList.remove(styles.flash)
        void row.offsetWidth
        row.classList.add(styles.flash)
    }
    const focusStage = b => {
        setFocus(b)
        document.getElementById('s-table')?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' })
        if (window.innerWidth < 900 && tableRef.current) {
            const hd = tableRef.current.querySelectorAll('[data-b]')[b]
            if (hd) tableRef.current.parentElement.scrollTo({ left: hd.offsetLeft, behavior: reduceMotion() ? 'auto' : 'smooth' })
        }
    }

    if (error) return <div className="page-content container"><ErrorState title="数据加载失败" message={String(error.message || error)} onRetry={() => window.location.reload()} /></div>
    if (!K) return <div className="page-content container"><LoadingState message="正在展开学科星图" /></div>
    if (s == null) {
        return (
            <div className="page-content container">
                <ErrorState title="学科未找到" message="找不到该学科的信息" />
                <div className={styles.notFound}><Link to="/" className="btn btn-primary">返回首页</Link></div>
            </div>
        )
    }

    const sub = K.subjects[s]
    const list = K.bySubject[s]
    const firstBand = Math.min(...list.map(i => K.S[i][F.BAND]))
    const years = 9 - firstBand * 2
    const next = (s + 1) % K.subjects.length
    const hl = (opts = {}) => () => engineRef.current?.setChartHighlight(opts)
    const terms = query.trim()
    const litCount = (ts >= 0 || terms) ? list.filter(i => (ts < 0 || K.S[i][F.SKILL] === ts) && terms.toLowerCase().split(/\s+/).filter(Boolean).every(t => K.haystack[i].includes(t))).length : 0

    return (
        <div className={styles.page} style={{ '--c': sub.color }} data-kb-route="subject">
            <section ref={heroRef} className={styles.hero} aria-labelledby="s-title">
                <div className={styles.wrap}>
                    <div ref={copyRef} className={styles.copy}>
                        <p className={styles.crumbs}><Link to="/">课标星图</Link> <span>/ 学科</span></p>
                        <Ignite key={slug} as="h1" id="s-title" className={styles.title} text={sub.name} step={90} delay={380} style={{ '--len': [...sub.name].length, '--glow': sub.color }} />
                        <p className={styles.pig}><i aria-hidden="true" /><span>{sub.colorName}</span></p>
                        <div className={styles.stats}>
                            <Stat value={list.length} label="条" />
                            <Stat value={sub.domains.length} label="个领域" />
                            <Stat value={years} label="个年级" />
                        </div>
                        <p className={styles.entryLabel} id="s-dom-label">从领域进入</p>
                        <ul className={`${styles.srail} ${styles.two}`} aria-labelledby="s-dom-label">
                            {sub.domains.map((name, d) => {
                                const dl = list.filter(i => K.S[i][F.DOMAIN] === d)
                                return <RailButton key={name} color={sub.color} name={name} title={name} count={dl.length} onClick={() => jumpDomain(d)} onEnter={hl({ sect: d, list: dl })} onLeave={hl({})} />
                            })}
                        </ul>
                        <p className={styles.entryLabel} id="s-band-label">从学段进入</p>
                        <ul className={`${styles.srail} ${styles.four}`} aria-labelledby="s-band-label">
                            {STAGE_RANGE.map((label, b) => {
                                const bl = list.filter(i => Math.min(K.S[i][F.BAND], 3) === b)
                                return <RailButton key={label} color={sub.color} name={label} count={bl.length} disabled={!bl.length} onClick={() => focusStage(b)} onEnter={hl({ ring: b, list: bl })} onLeave={hl({})} />
                            })}
                        </ul>
                        <p className={styles.cue}><i aria-hidden="true" />向下 · 展开</p>
                    </div>
                </div>
            </section>

            <section id="s-table" className={styles.table} aria-labelledby="s-table-title">
                <div className={styles.wrap}>
                    <div className={styles.head}>
                        <div>
                            <p className={styles.kicker}>{sub.name} · 一科 × 四学段</p>
                            <Ignite key={`y${years}`} as="h2" mode="scrub" id="s-table-title" className={styles.h2} text={`${CN_DIGIT[years]}年`} />
                        </div>
                        <div className={styles.tools}>
                            {uiV2Enabled ? (
                                <div className={styles.seg} role="group" aria-label="视图">
                                    <button type="button" aria-pressed={!graphView} onClick={() => setViewMode('table')}>对照表</button>
                                    <button type="button" aria-pressed={graphView} onClick={() => setViewMode('graph')} data-kb-telemetry-task="graph_open">关系图谱</button>
                                </div>
                            ) : null}
                            {!graphView ? (
                                <form className={styles.mini} role="search" onSubmit={event => event.preventDefault()}>
                                    <label className="sr-only" htmlFor="s-q">在本学科里找</label>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                                    <input id="s-q" type="search" autoComplete="off" placeholder="在本科里找" value={query} onChange={event => setQuery(event.target.value)} />
                                </form>
                            ) : null}
                        </div>
                    </div>
                    {graphView ? (
                        <div className={styles.graph} data-solid>
                            <Suspense fallback={<div className={styles.graphLoading} aria-live="polite">正在加载学科关系图谱</div>}>
                                <SkillsGraphWorkspace
                                    graphState={graphState}
                                    onGraphStateChange={updateGraphState}
                                    lockedSubjectSlug={slug}
                                    lockedSubjectLabel={sub.name}
                                />
                            </Suspense>
                        </div>
                    ) : (
                        <>
                            <div className={styles.controls}>
                                <div className={styles.ctrl}>
                                    <span>领域</span>
                                    {sub.domains.map((d, k) => <button key={d} type="button" className={styles.pill} onClick={() => jumpDomain(k)}>{d}</button>)}
                                </div>
                                <div className={styles.ctrl}>
                                    <span>能力</span>
                                    <button type="button" className={styles.pill} aria-pressed={ts < 0} onClick={() => setTs(-1)}>全部</button>
                                    {K.skills.map(([code], k) => {
                                        const n = list.filter(i => K.S[i][F.SKILL] === k).length
                                        return <button key={code} type="button" className={styles.pill} aria-pressed={ts === k} disabled={!n} onClick={() => setTs(ts === k ? -1 : k)}>{code} {SKILL_SHORT[k]}</button>
                                    })}
                                </div>
                            </div>
                            <p className={styles.summary}>
                                {ts >= 0 || terms ? `${ts >= 0 ? `${K.skills[ts][0]} ${K.skills[ts][1]} · ` : ''}${terms ? `「${terms}」 · ` : ''}${litCount} 条亮起` : `${sub.name} · ${list.length} 条`}
                                {ts >= 0 ? <Link className={styles.more} to={compareHref({ mode: 'C', skill: K.skills[ts][0] })}>{K.skills[ts][0]} · 跨学科看 →</Link> : null}
                            </p>
                            <StageTable K={K} s={s} jr={jr} setJr={setJr} focus={focus} setFocus={setFocus} ts={ts} query={query} tableRef={tableRef} onMeasure={measure} />
                        </>
                    )}
                </div>
            </section>

            <section className={styles.peers} aria-labelledby="s-peers-title">
                <div className={styles.wrap}>
                    <p className={styles.kicker}>同一学段 · 跨学科</p>
                    <Ignite as="h2" mode="scrub" id="s-peers-title" className={styles.h2} text="别的课" />
                    <div className={`${styles.ctrl} ${styles.peerTabs}`}>
                        <span>学段</span>
                        {BAND_LABEL.map((b, k) => <button key={b} type="button" className={styles.pill} aria-pressed={k === peerBand} onClick={() => setPeerBand(k)}>{b}</button>)}
                    </div>
                    <ul className={styles.peerList}>
                        {K.subjects.map((other, k) => {
                            const bl = K.bySubject[k].filter(i => K.S[i][F.BAND] === peerBand)
                            const body = (
                                <>
                                    <span className={styles.pd} aria-hidden="true">{bl.map((i, j) => <i key={i} style={{ '--k': j }} />)}</span>
                                    <b>{bl.length}</b>
                                    <span>{other.name}</span>
                                </>
                            )
                            return (
                                <li key={other.slug}>
                                    {k === s
                                        ? <span className={styles.peer} style={{ '--c': other.color }} aria-current="true" aria-label={`${other.name} · ${BAND_LABEL[peerBand]} · ${bl.length} 条（本科）`}>{body}</span>
                                        : (
                                            <Link
                                                className={styles.peer}
                                                style={{ '--c': other.color }}
                                                to={compareHref({ mode: 'B', band: peerBand, subjects: [sub.slug, other.slug] })}
                                                aria-label={`${other.name} · ${BAND_LABEL[peerBand]} · ${bl.length} 条，与${sub.name}并排看`}
                                                onPointerEnter={hl({ list: bl })}
                                                onPointerLeave={hl({})}
                                            >{body}</Link>
                                        )}
                                </li>
                            )
                        })}
                    </ul>
                </div>
            </section>

            <section className={styles.next} aria-labelledby="s-next-label">
                <div className={styles.wrap}>
                    <p className={styles.kicker} id="s-next-label">下一门</p>
                    <Link className={styles.nextBig} style={{ '--c': K.subjects[next].color }} to={`/subjects/${K.subjects[next].slug}`} onPointerEnter={hl({ list: K.bySubject[next] })} onPointerLeave={hl({})}>
                        <Ignite key={next} as="span" mode="scrub" text={K.subjects[next].name} />
                        <span className={styles.arr} aria-hidden="true">→</span>
                    </Link>
                    <ul className={styles.allSub} aria-label="全部学科">
                        {K.subjects.map((other, k) => (
                            <li key={other.slug}>
                                <Link className={styles.chip} style={{ '--c': other.color }} to={`/subjects/${other.slug}`} aria-current={k === s ? 'page' : undefined} onPointerEnter={hl({ list: K.bySubject[k] })} onPointerLeave={hl({})}>
                                    <i aria-hidden="true" />{other.name}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>
        </div>
    )
}

export default SubjectPage
