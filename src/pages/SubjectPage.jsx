import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ErrorState, PageLoading } from '../components/StateComponents'
import { useUiV2 } from '../components/RouteUiBoundary.jsx'
import { mergeGraphStateIntoURL, parseGraphStateFromURL } from '../data/query.js'
import { runViewTransition } from '../utils/viewTransition.js'
import { useSky, useSkyView, useStarmap } from '../features/starmap/SkyProvider.jsx'
import { BAND_LABEL, C, CN_DIGIT, F, SKILL_SHORT, starHref, stageName } from '../features/starmap/starmapData.js'
import Ignite from '../features/starmap/Ignite.jsx'
import { useCountUp } from '../features/starmap/motionHooks.js'
import { compareHref } from '../features/starmap/compareLinks.js'
import { subjectMeta } from '../seo/pageMeta.js'
import { usePageMeta } from '../seo/usePageMeta.js'
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

/** Stage × domain table: the subject's stages side by side, one row per domain, one entry per standard (a constellation of 要点). */
function StageTable({ K, s, focus, setFocus, ts, query, tableRef, onMeasure }) {
    const { revealTo, engineRef } = useSky()
    const sub = K.subjects[s]
    const cons = K.consBySubject[s]
    const bands = sub.stages.map(st => st.band)
    const [active, setActive] = useState(-1)

    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const filtering = ts >= 0 || terms.length > 0
    const lit = useCallback(c => K.starsOf(c).some(i => (ts < 0 || K.S[i][F.SKILL] === ts) && terms.every(t => K.haystack[i].includes(t))), [K, ts, terms])

    // hovering a standard lights its constellation in the sky
    useEffect(() => {
        engineRef.current?.setChartHighlight(active >= 0 ? { list: K.starsOf(active) } : {})
    }, [active, K, engineRef])
    useEffect(() => () => engineRef.current?.setChartHighlight({}), [engineRef])
    useEffect(() => { setActive(-1) }, [s])
    useLayoutEffect(() => { onMeasure() })

    const status = active >= 0 ? `${K.cons[active][C.CODE]} · ${K.cons[active][C.NAME]} · ${K.cons[active][C.COUNT]} 条要点` : null
    const cols = bands.map(b => ({ b, stage: sub.stages.find(st => st.band === b), n: cons.filter(c => K.cons[c][C.BAND] === b).length }))
    const widths = cols.map(({ b }) => (focus < 0 ? '1fr' : focus === b ? '2.4fr' : '0.75fr'))

    return (
        <>
            <p className={styles.status} aria-live="polite">{status}</p>
            <div className={styles.mxScroll}>
                <div
                    ref={tableRef}
                    className={`${styles.mx} ${focus >= 0 ? styles.focusing : ''} ${active >= 0 ? styles.chain : ''} ${filtering ? styles.filtering : ''}`}
                    style={{ '--mx-cols': widths.join(' '), '--mx-n': cols.length }}
                    onPointerLeave={() => setActive(-1)}
                    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setActive(-1) }}
                    onTransitionEnd={event => { if (event.target === event.currentTarget) onMeasure() }}
                >
                    {cols.map(({ b, stage, n }) => (
                        <div key={`h${b}`} id={stage.code} className={`${styles.hd} ${focus === b ? styles.wide : ''}`} data-b={b}>
                            <button type="button" aria-pressed={focus === b} onClick={() => setFocus(focus === b ? -1 : b)}>
                                <small>{stageName(K, s, b)}</small>
                                <b>{stage.range}</b>
                            </button>
                            <span className={styles.n}>{n}</span>
                        </div>
                    ))}
                    {sub.domains.map((name, d) => {
                        const dl = cons.filter(c => K.cons[c][C.DOMAIN] === d)
                        return [
                            <div key={`d${d}`} id={`dom-${d}`} className={styles.dom}>
                                <div><b>{name}</b><span>{dl.length}</span></div>
                            </div>,
                            ...bands.map(b => {
                                const cell = dl.filter(c => K.cons[c][C.BAND] === b)
                                return (
                                    <div key={`c${d}-${b}`} className={`${styles.cell} ${focus === b ? styles.wide : ''}`}>
                                        {!cell.length ? <p className={styles.nil}>·</p> : (
                                            <ol>
                                                {cell.map(c => {
                                                    const row = K.cons[c]
                                                    const to = `/standards/${encodeURIComponent(row[C.CODE])}`
                                                    return (
                                                        <li key={row[C.CODE]}>
                                                            <Link
                                                                to={to}
                                                                data-star={row[C.FIRST]}
                                                                className={`${styles.mi} ${c === active ? styles.on : ''} ${filtering && lit(c) ? styles.lit : ''}`}
                                                                onPointerEnter={() => setActive(c)}
                                                                onFocus={() => setActive(c)}
                                                                onClick={event => { event.preventDefault(); const r = event.currentTarget.getBoundingClientRect(); revealTo(to, r.left + 12, r.top + 16) }}
                                                            >
                                                                <i className={styles.dot} data-dot aria-hidden="true" />
                                                                <code>{row[C.CODE]} · {row[C.COUNT]} 条要点</code>
                                                                <strong>{row[C.NAME]}</strong>
                                                                <span>{row[C.TEXT]}</span>
                                                            </Link>
                                                        </li>
                                                    )
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
    const [focus, setFocus] = useState(-1)
    const [ts, setTs] = useState(-1)
    const [query, setQuery] = useState('')
    const [peerBand, setPeerBand] = useState(1)

    const searchKey = searchParams.toString()
    const graphState = useMemo(() => parseGraphStateFromURL(new URLSearchParams(searchKey)), [searchKey])
    const graphView = uiV2Enabled && graphState.view === 'graph'
    const s = K ? K.slugIndex.get(slug) : undefined
    const subjectInfo = s == null ? null : K.subjects[s]
    usePageMeta(subjectInfo ? subjectMeta({ subject: subjectInfo.name, subject_slug: slug }, { standardCount: subjectInfo.standards, indicatorCount: subjectInfo.count }) : null)

    useEffect(() => { setFocus(-1); setTs(-1); setQuery('') }, [slug])

    const skyConfig = useMemo(() => (s == null ? null : {
        subject: s,
        get heroEl() { return heroRef.current },
        get copyEl() { return copyRef.current },
        get tableEl() { return tableRef.current },
        onStarClick: (i, x, y) => revealTo(starHref(K.S[i][F.CODE]), x, y),
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
            const hd = tableRef.current.querySelector(`[data-b="${b}"]`)
            if (hd) tableRef.current.parentElement.scrollTo({ left: hd.offsetLeft, behavior: reduceMotion() ? 'auto' : 'smooth' })
        }
    }

    if (error) return <div className="page-content container"><ErrorState title="数据加载失败" message={String(error.message || error)} onRetry={() => window.location.reload()} /></div>
    if (!K) return <PageLoading className="page-content container" message="正在展开学科星图" />
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
    const firstGrade = Number(sub.stages[0]?.range.match(/\d/u)?.[0] || 1)
    const years = 10 - firstGrade
    const stageCount = sub.stages.length
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
                            <Stat value={sub.standards} label="条标准" />
                            <Stat value={list.length} label="条要点" />
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
                            {sub.stages.map(stage => {
                                const b = stage.band
                                const bl = list.filter(i => K.S[i][F.BAND] === b)
                                return <RailButton key={stage.code} color={sub.color} name={stage.range} title={stage.label} count={bl.length} disabled={!bl.length} onClick={() => focusStage(b)} onEnter={hl({ ring: b, list: bl })} onLeave={hl({})} />
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
                            <p className={styles.kicker}>{sub.name} · 一科 × {CN_DIGIT[stageCount]}学段 · 一条标准 = 一个星座</p>
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
                                {ts >= 0 || terms ? `${ts >= 0 ? `${K.skills[ts][0]} ${K.skills[ts][1]} · ` : ''}${terms ? `「${terms}」 · ` : ''}${litCount} 条要点亮起` : `${sub.name} · ${sub.standards} 条标准 · ${list.length} 条要点（课标原文）`}
                                {ts >= 0 ? <Link className={styles.more} to={compareHref({ mode: 'C', skill: K.skills[ts][0] })}>{K.skills[ts][0]} · 跨学科看 →</Link> : null}
                            </p>
                            <StageTable K={K} s={s} focus={focus} setFocus={setFocus} ts={ts} query={query} tableRef={tableRef} onMeasure={measure} />
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
                            const cl = K.consBySubject[k].filter(c => K.cons[c][C.BAND] === peerBand)
                            const body = (
                                <>
                                    <span className={styles.pd} aria-hidden="true">{cl.map((c, j) => <i key={c} style={{ '--k': j }} />)}</span>
                                    <b>{cl.length}</b>
                                    <span>{other.name}</span>
                                </>
                            )
                            return (
                                <li key={other.slug}>
                                    {k === s
                                        ? <span className={styles.peer} style={{ '--c': other.color }} aria-current="true" aria-label={`${other.name} · ${BAND_LABEL[peerBand]} · ${cl.length} 条标准（本科）`}>{body}</span>
                                        : (
                                            <Link
                                                className={styles.peer}
                                                style={{ '--c': other.color }}
                                                to={compareHref({ mode: 'B', band: peerBand, subjects: [sub.slug, other.slug] })}
                                                aria-label={`${other.name} · ${BAND_LABEL[peerBand]} · ${cl.length} 条标准，与${sub.name}并排看`}
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
