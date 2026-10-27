import { useEffect, useRef } from 'react'
import styles from './Ignite.module.css'

const scrubbed = new Set()
let listening = false
let queued = false
const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function update() {
    queued = false
    const H = window.innerHeight
    scrubbed.forEach(node => {
        const top = node.getBoundingClientRect().top
        const p = reduce ? 1 : Math.round(Math.min(1, Math.max(0, (H * 0.92 - top) / (H * 0.42))) * 100) / 100
        if (node._p !== p) { node._p = p; node.style.setProperty('--p', p) }
    })
}
function schedule() { if (!queued) { queued = true; requestAnimationFrame(update) } }

/**
 * Text whose characters light up like stars: on load (mode="load"), as the reader scrolls to it (mode="scrub"),
 * or from a --p set by a parent (mode="caption").
 * Screen readers get the plain text; the per-character spans are presentation only.
 */
export default function Ignite({ as: Tag = 'span', text, mode = 'load', className = '', delay = 0, step, ...rest }) {
    const ref = useRef(null)
    useEffect(() => {
        if (mode !== 'scrub' || !ref.current) return undefined
        const node = ref.current
        scrubbed.add(node)
        if (!listening) {
            listening = true
            window.addEventListener('scroll', schedule, { passive: true })
            window.addEventListener('resize', schedule)
        }
        schedule()
        return () => { scrubbed.delete(node) }
    }, [mode])

    const lines = String(text ?? '').split('\n')
    let n = 0
    const parts = lines.map((line, li) => (
        <span key={li} className={styles.line}>
            {[...line].map((ch, k) => {
                if (/\s/.test(ch)) return ch
                const i = n++
                return <span key={k} className={styles.ch} style={{ '--i': i }}>{ch}</span>
            })}
        </span>
    ))
    const modeClass = mode === 'scrub' || mode === 'caption' ? styles.scrub : mode === 'load' ? styles.load : ''
    return (
        <Tag ref={ref} className={`${className} ${modeClass}`} style={{ '--n': n, '--d': `${delay}ms`, ...(step ? { '--step': `${step}ms` } : null) }} {...rest}>
            <span className="sr-only">{lines.join('')}</span>
            <span aria-hidden="true">{parts}</span>
        </Tag>
    )
}
