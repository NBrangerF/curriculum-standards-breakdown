import { useEffect, useRef } from 'react'
import styles from './FlapCode.module.css'

const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** A standard code on split-flap tiles; plays once when it first scrolls into view. */
export default function FlapCode({ code, className = '', size }) {
    const ref = useRef(null)
    useEffect(() => {
        const box = ref.current
        if (!box) return undefined
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const spans = [...box.querySelectorAll('[data-ch]')]
        const timers = []
        let played = false
        const play = () => {
            if (played || reduce) return
            played = true
            spans.forEach((sp, k) => {
                const target = sp.dataset.ch
                let n = 5 + k + Math.floor(Math.random() * 4)
                const tick = () => {
                    sp.classList.remove(styles.tick)
                    void sp.offsetWidth
                    sp.classList.add(styles.tick)
                    if (n-- <= 0) { sp.textContent = target; return }
                    sp.textContent = CH[Math.floor(Math.random() * CH.length)]
                    timers.push(setTimeout(tick, 52))
                }
                timers.push(setTimeout(tick, k * 28))
            })
        }
        const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { play(); io.disconnect() } }), { threshold: 0.5 })
        io.observe(box)
        return () => { io.disconnect(); timers.forEach(clearTimeout) }
    }, [code])

    return (
        <div ref={ref} className={`${styles.flap} ${className}`} role="img" aria-label={code} style={size ? { fontSize: size } : undefined}>
            {[...code].map((ch, k) => (ch === '-'
                ? <span key={k} className={styles.dash} aria-hidden="true">-</span>
                : <span key={k} data-ch={ch} aria-hidden="true">{ch}</span>))}
        </div>
    )
}
