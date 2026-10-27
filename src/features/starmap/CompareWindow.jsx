import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSky } from './SkyProvider.jsx'
import { BAND_LABEL, F, SKILL_SHORT } from './starmapData.js'
import styles from './CompareWindow.module.css'

const MODES = [['A', '一科 × 多学段'], ['B', '多科 × 一学段'], ['C', '一种能力 × 多学科']]

function Pill({ pressed, color, onClick, children, disabled }) {
    return (
        <button type="button" className={styles.pill} aria-pressed={pressed ? 'true' : 'false'} style={color ? { '--c': color } : undefined} onClick={onClick} disabled={disabled}>
            {color ? <i aria-hidden="true" /> : null}{children}
        </button>
    )
}

function Row({ label, children }) {
    return <div className={styles.ctrl}><span>{label}</span>{children}</div>
}

/**
 * Three side-by-side windows over the same 2,025 standards:
 * one subject across stages, several subjects in one stage, one transferable skill across subjects.
 */
export default function CompareWindow({ K, state, setState, heading }) {
    const { engineRef, revealTo } = useSky()
    const gridRef = useRef(null)
    const pathRef = useRef(null)
    const items = useRef(new Map())
    const [active, setActive] = useState(-1)
    const [narrow, setNarrow] = useState(() => window.innerWidth < 760)
    useEffect(() => { const on = () => setNarrow(window.innerWidth < 760); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on) }, [])
    const set = patch => setState(s => ({ ...s, ...patch }))

    const { cols, base } = useMemo(() => {
        const S = K.S
        if (state.mode === 'A') {
            const s = state.subj
            const list = [0, 1, 2, state.jr].map(b => ({ b, label: b >= 3 ? '7–9 年级' : BAND_LABEL[b], color: K.subjects[s].color, jr: b >= 3, list: K.bySubject[s].filter(i => S[i][F.BAND] === b && (state.dom < 0 || S[i][F.DOMAIN] === state.dom)) }))
            return { cols: list, base: `${K.subjects[s].name} · ${state.dom < 0 ? '全部领域' : K.subjects[s].domains[state.dom]} · ${list.reduce((n, c) => n + c.list.length, 0)} 条` }
        }
        if (state.mode === 'B') {
            const b = state.band
            const list = state.subs.map(s => ({ label: K.subjects[s].name, color: K.subjects[s].color, group: i => K.subjects[s].domains[S[i][F.DOMAIN]], list: K.bySubject[s].filter(i => S[i][F.BAND] === b).sort((x, y) => S[x][F.DOMAIN] - S[y][F.DOMAIN] || x - y) }))
            return { cols: list, base: `${BAND_LABEL[b]} · ${state.subs.map(s => K.subjects[s].name).join(' / ')} · ${list.reduce((n, c) => n + c.list.length, 0)} 条` }
        }
        const all = K.bySkill[state.ts].filter(i => state.tsBand < 0 || S[i][F.BAND] === state.tsBand)
        const list = K.subjects.map((s, k) => ({ label: s.name, color: s.color, group: state.tsBand < 0 ? i => BAND_LABEL[S[i][F.BAND]] : null, list: all.filter(i => S[i][F.SUBJ] === k).sort((x, y) => S[x][F.BAND] - S[y][F.BAND] || x - y) })).filter(c => c.list.length)
        return { cols: list, base: `${K.skills[state.ts][0]} ${K.skills[state.ts][1]} · ${list.length} 科 · ${all.length} 条` }
    }, [K, state])

    const shown = useMemo(() => new Set(cols.flatMap(c => c.list)), [cols])

    const relation = useMemo(() => {
        if (active < 0) return { rel: new Set(), edges: [], status: base }
        const S = K.S
        const rel = new Set()
        const edges = []
        let status
        if (state.mode === 'A') {
            const walk = key => { const q = [active], seen = new Set([active]); while (q.length) { const x = q.shift(); for (const y of S[x][key]) { if (seen.has(y) || !shown.has(y)) continue; seen.add(y); rel.add(y); edges.push(key === F.NEXT ? [x, y] : [y, x]); q.push(y) } } }
            walk(F.PREV); walk(F.NEXT)
            const chain = [...rel, active].sort((x, y) => S[x][F.BAND] - S[y][F.BAND] || x - y).map(x => S[x][F.CODE])
            status = rel.size ? chain.join(' → ') : `${S[active][F.CODE]} · 无前后条目`
        } else if (state.mode === 'B') {
            const ts = S[active][F.SKILL]
            if (ts >= 0) shown.forEach(j => { if (j !== active && S[j][F.SKILL] === ts) rel.add(j) })
            status = ts >= 0 ? `${K.skills[ts][0]} ${K.skills[ts][1]} · ${rel.size + 1} 条` : `${S[active][F.CODE]} · 未关联能力`
        } else {
            status = `${S[active][F.CODE]} · ${K.subjects[S[active][F.SUBJ]].name} · ${BAND_LABEL[S[active][F.BAND]]}`
        }
        return { rel, edges, status }
    }, [active, K, state.mode, shown, base])

    useEffect(() => { setActive(-1) }, [state])
    useEffect(() => {
        engineRef.current?.setChartHighlight(active >= 0 ? { list: [active, ...relation.rel] } : {})
    }, [active, relation, engineRef])
    useEffect(() => () => engineRef.current?.setChartHighlight({}), [engineRef])

    const drawLines = useCallback(animate => {
        const path = pathRef.current
        const grid = gridRef.current
        if (!path || !grid) return
        if (!relation.edges.length) { path.setAttribute('d', ''); return }
        const gr = grid.getBoundingClientRect()
        const pt = i => {
            const b = items.current.get(i)
            if (!b) return null
            const box = b.closest('ol').getBoundingClientRect(), r = b.getBoundingClientRect()
            return { l: r.left - gr.left, r: r.right - gr.left, y: Math.min(Math.max(r.top + r.height / 2, box.top + 8), box.bottom - 8) - gr.top }
        }
        let d = ''
        for (const [x, y] of relation.edges) {
            const A = pt(x), B = pt(y)
            if (!A || !B || Math.abs(A.l - B.l) < 4) continue
            const [p, q] = A.l < B.l ? [A, B] : [B, A]
            const x1 = p.r - 6, x2 = q.l + 6, dx = Math.max(20, (x2 - x1) * 0.5)
            d += `M${x1.toFixed(1)} ${p.y.toFixed(1)}C${(x1 + dx).toFixed(1)} ${p.y.toFixed(1)} ${(x2 - dx).toFixed(1)} ${q.y.toFixed(1)} ${x2.toFixed(1)} ${q.y.toFixed(1)}`
        }
        path.setAttribute('d', d)
        path.classList.remove(styles.draw)
        if (animate) void path.getBoundingClientRect()
        path.classList.add(styles.draw)
    }, [relation])
    useLayoutEffect(() => { drawLines(true) }, [drawLines])

    const toggleSub = k => {
        const a = [...state.subs]
        const at = a.indexOf(k)
        if (at >= 0) { if (a.length > 1) a.splice(at, 1) } else { a.push(k); if (a.length > 3) a.shift() }
        set({ subs: a.sort((x, y) => x - y) })
    }

    const S = K.S
    items.current = new Map()
    return (
        <div className={styles.window}>
            <div className={styles.head}>
                {heading}
                <div className={styles.seg} role="tablist" aria-label="对照方式">
                    {MODES.map(([m, label]) => (
                        <button key={m} type="button" role="tab" id={`cmp-mode-${m}`} aria-selected={state.mode === m} aria-controls="cmp-panel" onClick={() => set({ mode: m })}>{label}</button>
                    ))}
                </div>
            </div>
            <div className={styles.panel} id="cmp-panel" role="tabpanel" aria-labelledby={`cmp-mode-${state.mode}`} data-solid>
                {state.mode === 'A' ? (
                    <>
                        <Row label="学科">{K.subjects.map((s, k) => <Pill key={s.slug} pressed={k === state.subj} color={s.color} onClick={() => set({ subj: k, dom: -1 })}>{s.name}</Pill>)}</Row>
                        <Row label="领域">
                            <Pill pressed={state.dom < 0} onClick={() => set({ dom: -1 })}>全部</Pill>
                            {K.subjects[state.subj].domains.map((d, k) => <Pill key={d} pressed={k === state.dom} onClick={() => set({ dom: k })}>{d}</Pill>)}
                        </Row>
                    </>
                ) : state.mode === 'B' ? (
                    <>
                        <Row label="学段">{BAND_LABEL.map((b, k) => <Pill key={b} pressed={k === state.band} onClick={() => set({ band: k })}>{b}</Pill>)}</Row>
                        <Row label="学科">{K.subjects.map((s, k) => <Pill key={s.slug} pressed={state.subs.includes(k)} color={s.color} onClick={() => toggleSub(k)}>{s.name}</Pill>)}</Row>
                    </>
                ) : (
                    <>
                        <Row label="能力">{K.skills.map(([code, name], k) => <Pill key={code} pressed={k === state.ts} onClick={() => set({ ts: k })}>{code} {narrow ? SKILL_SHORT[k] : name}</Pill>)}</Row>
                        <Row label="学段">
                            <Pill pressed={state.tsBand < 0} onClick={() => set({ tsBand: -1 })}>全部</Pill>
                            {BAND_LABEL.map((b, k) => <Pill key={b} pressed={k === state.tsBand} onClick={() => set({ tsBand: k })}>{b}</Pill>)}
                        </Row>
                    </>
                )}
                <p className={styles.status} aria-live="polite">
                    {relation.status}
                    {state.mode === 'A' ? <Link className={styles.more} to={`/subjects/${K.subjects[state.subj].slug}`}>{K.subjects[state.subj].name}全表 →</Link> : null}
                    {state.mode === 'C' ? <Link className={styles.more} to={`/skills/${K.skills[state.ts][0]}`}>{K.skills[state.ts][0]} 详情 →</Link> : null}
                </p>
                <div className={styles.scroll}>
                    <div
                        ref={gridRef}
                        className={`${styles.grid} ${active >= 0 ? styles.focus : ''}`}
                        onPointerLeave={() => setActive(-1)}
                        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setActive(-1) }}
                    >
                        <svg className={styles.lines} aria-hidden="true"><path ref={pathRef} pathLength="1" /></svg>
                        {cols.map((c, k) => {
                            let lastGroup = null
                            return (
                                <div key={`${state.mode}-${c.label}-${k}`} className={styles.col} style={{ '--c': c.color, '--k': k }}>
                                    <header>
                                        <b>{c.label}</b>
                                        {c.jr ? (
                                            <div className={styles.tabs}>
                                                {[3, 4, 5].map(g => <button key={g} type="button" aria-pressed={g === state.jr} aria-label={BAND_LABEL[g]} onClick={() => set({ jr: g })}>{'七八九'[g - 3]}</button>)}
                                            </div>
                                        ) : null}
                                        <span className={styles.n}>{c.list.length}</span>
                                    </header>
                                    <div className={styles.dots} aria-hidden="true">{c.list.map(i => <i key={i} />)}</div>
                                    <ol className={styles.items} onScroll={() => drawLines(false)}>
                                        {!c.list.length ? <li className={styles.emptyCol}>这一格没有标准</li> : null}
                                        {c.list.flatMap(i => {
                                            const out = []
                                            if (c.group) { const g = c.group(i); if (g !== lastGroup) { lastGroup = g; out.push(<li key={`g-${g}`} className={styles.grp}>{g}</li>) } }
                                            const s = S[i]
                                            const cls = `${styles.it} ${i === active ? styles.on : ''} ${relation.rel.has(i) ? styles.rel : ''}`
                                            out.push(
                                                <li key={s[F.CODE]}>
                                                    <Link
                                                        ref={el => { if (el) items.current.set(i, el) }}
                                                        to={`/standards/${encodeURIComponent(s[F.CODE])}`}
                                                        className={cls}
                                                        style={{ '--c': K.subjects[s[F.SUBJ]].color }}
                                                        onPointerEnter={() => setActive(i)}
                                                        onFocus={() => setActive(i)}
                                                        onClick={event => { event.preventDefault(); const r = event.currentTarget.getBoundingClientRect(); revealTo(`/standards/${encodeURIComponent(s[F.CODE])}`, r.left + r.width / 2, r.top + r.height / 2) }}
                                                    >
                                                        <code>{s[F.CODE]}</code>
                                                        <span>{s[F.TEXT]}</span>
                                                    </Link>
                                                </li>
                                            )
                                            return out
                                        })}
                                    </ol>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}
