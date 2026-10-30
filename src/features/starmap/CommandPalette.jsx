import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSky } from './SkyProvider.jsx'
import { C, F, searchStarmap, starHref, stageRange } from './starmapData.js'
import styles from './CommandPalette.module.css'

function Mark({ text, query }) {
    const t = query.trim().split(/\s+/)[0]
    const k = t ? text.toLowerCase().indexOf(t.toLowerCase()) : -1
    if (k < 0) return text
    return <>{text.slice(0, k)}<mark>{text.slice(k, k + t.length)}</mark>{text.slice(k + t.length)}</>
}

/** ⌘K: search every standard from anywhere; matches light up in the sky behind. */
export default function CommandPalette({ open, onClose, initialQuery = '' }) {
    const { data: K, ensureData, engineRef } = useSky()
    const navigate = useNavigate()
    const [q, setQ] = useState(initialQuery)
    const [sel, setSel] = useState(0)
    const inputRef = useRef(null)
    const listRef = useRef(null)

    useEffect(() => {
        if (!open) return undefined
        setQ(initialQuery)
        setSel(0)
        ensureData().catch(() => {})
        const back = document.activeElement
        requestAnimationFrame(() => inputRef.current?.focus())
        return () => {
            engineRef.current?.setPaletteHighlight(null)
            if (back && back.focus) back.focus({ preventScroll: true })
        }
    }, [open, initialQuery, ensureData, engineRef])

    const results = useMemo(() => (K ? searchStarmap(K, q) : null), [K, q])
    const shown = useMemo(() => (results || []).slice(0, 60), [results])

    useEffect(() => {
        if (open) engineRef.current?.setPaletteHighlight(results)
    }, [open, results, engineRef])

    const choose = useCallback(k => {
        const i = shown[k]
        if (i == null || !K) return
        onClose()
        navigate(starHref(K.S[i][F.CODE]))
    }, [shown, K, onClose, navigate])

    useEffect(() => {
        const li = listRef.current?.children[sel]
        li?.scrollIntoView?.({ block: 'nearest' })
    }, [sel])

    if (!open) return null
    const onKeyDown = event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setSel(s => (shown.length ? (s + 1) % shown.length : 0)) }
        else if (event.key === 'ArrowUp') { event.preventDefault(); setSel(s => (shown.length ? (s - 1 + shown.length) % shown.length : 0)) }
        else if (event.key === 'Enter') { event.preventDefault(); choose(sel) }
        else if (event.key === 'Escape') { event.preventDefault(); onClose() }
    }

    return (
        <div className={styles.scrim} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
            <div className={styles.palette} role="dialog" aria-modal="true" aria-label="搜索课程标准" data-solid>
                <div className={styles.input}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                    <label className="sr-only" htmlFor="kb-palette-q">搜索课程标准</label>
                    <input
                        ref={inputRef}
                        id="kb-palette-q"
                        type="search"
                        autoComplete="off"
                        placeholder="关键词、编码或学科"
                        role="combobox"
                        aria-expanded="true"
                        aria-controls="kb-palette-list"
                        aria-activedescendant={shown.length ? `kb-opt-${sel}` : undefined}
                        value={q}
                        onChange={event => { setQ(event.target.value); setSel(0) }}
                        onKeyDown={onKeyDown}
                    />
                    <span className={styles.count}>{!K ? '载入中' : results == null ? `${K.N.toLocaleString('en-US')} 条` : `${results.length} 条`}</span>
                </div>
                <ul ref={listRef} className={styles.results} id="kb-palette-list" role="listbox" aria-label="搜索结果">
                    {results == null ? <li className={styles.empty}>输入关键词</li> : null}
                    {results && !results.length ? <li className={styles.empty}>没有匹配，换个词</li> : null}
                    {K && shown.map((i, k) => {
                        const s = K.S[i]
                        return (
                            <li
                                key={s[F.CODE]}
                                id={`kb-opt-${k}`}
                                role="option"
                                aria-selected={k === sel}
                                className={styles.option}
                                style={{ '--c': K.subjects[s[F.SUBJ]].color }}
                                onClick={() => choose(k)}
                                onPointerMove={() => setSel(k)}
                            >
                                <i aria-hidden="true" />
                                <span className={styles.title}><Mark text={s[F.TITLE]} query={q} /></span>
                                <span className={styles.meta}>{s[F.CODE]} · {K.subjects[s[F.SUBJ]].name} · {stageRange(K, s[F.SUBJ], s[F.BAND])} · {K.cons[s[F.CON]][C.NAME]}</span>
                            </li>
                        )
                    })}
                </ul>
            </div>
        </div>
    )
}
