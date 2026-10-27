import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSkyEngine } from './skyEngine.js'
import { loadStarmap } from './starmapData.js'
import styles from './Sky.module.css'

const SkyContext = createContext(null)
const CommandPalette = lazy(() => import('./CommandPalette.jsx'))

/**
 * One fixed night sky behind every route. Home and subject pages claim it with useSkyView;
 * every other page gets a still, dim sky.
 */
export function SkyProvider({ children }) {
    const canvasRef = useRef(null)
    const tipRef = useRef(null)
    const engineRef = useRef(null)
    const [data, setData] = useState(null)
    const navigate = useNavigate()
    const veilRef = useRef(null)
    const [palette, setPalette] = useState({ open: false, q: '' })
    const openPalette = useCallback((q = '') => setPalette({ open: true, q }), [])
    const closePalette = useCallback(() => setPalette(p => ({ ...p, open: false })), [])

    useEffect(() => {
        const onKey = event => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault()
                setPalette(p => ({ open: !p.open, q: '' }))
                return
            }
            if (event.key === '/' && !event.metaKey && !event.ctrlKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') && !document.activeElement?.isContentEditable) {
                event.preventDefault()
                setPalette({ open: true, q: '' })
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    const dataRef = useRef(null)
    useEffect(() => {
        const engine = createSkyEngine(canvasRef.current, tipRef.current)
        engineRef.current = engine
        if (dataRef.current) engine.setData(dataRef.current)
        return () => engine.destroy()
    }, [])

    const ensureData = useCallback(() => loadStarmap().then(K => {
        dataRef.current = K
        engineRef.current?.setData(K)
        setData(prev => prev || K)
        return K
    }), [])

    // Navigate with a circle of night opening from the point that was clicked.
    const revealTo = useCallback((to, x, y) => {
        const veil = veilRef.current
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (!veil || reduce) { navigate(to); return }
        veil.style.setProperty('--ox', `${x ?? window.innerWidth / 2}px`)
        veil.style.setProperty('--oy', `${y ?? window.innerHeight / 2}px`)
        veil.hidden = false
        veil.dataset.state = 'in'
        window.setTimeout(() => {
            navigate(to)
            window.scrollTo(0, 0)
            veil.dataset.state = 'out'
            window.setTimeout(() => { veil.hidden = true; veil.dataset.state = '' }, 520)
        }, 420)
    }, [navigate])

    const value = useMemo(() => ({ engineRef, data, ensureData, revealTo, openPalette }), [data, ensureData, revealTo, openPalette])

    return (
        <SkyContext.Provider value={value}>
            <canvas ref={canvasRef} className={styles.sky} aria-hidden="true" />
            <div ref={tipRef} className={styles.tip} hidden />
            <div ref={veilRef} className={styles.veil} aria-hidden="true" hidden />
            {children}
            {palette.open ? <Suspense fallback={null}><CommandPalette open initialQuery={palette.q} onClose={closePalette} /></Suspense> : null}
        </SkyContext.Provider>
    )
}

export function useSky() {
    const value = useContext(SkyContext)
    if (!value) throw new Error('useSky must be used inside SkyProvider')
    return value
}

/** Load the star-map data (once) and return it. */
export function useStarmap() {
    const { data, ensureData } = useSky()
    const [error, setError] = useState(null)
    useEffect(() => {
        if (!data) ensureData().catch(setError)
    }, [data, ensureData])
    return { K: data, error }
}

/**
 * Claim the sky for a view while the calling page is mounted.
 * `config` is read on every change of `key`; refs inside it are read live by the engine.
 */
export function useSkyView(name, config, key) {
    const { engineRef, data } = useSky()
    useEffect(() => {
        const engine = engineRef.current
        if (!engine || !data || !config) return undefined
        if (name === 'home') engine.setHome(config)
        else if (name === 'subject') engine.setSubject(config)
        return undefined
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, data, key])
    useEffect(() => () => engineRef.current?.release(name), [engineRef, name])
}
