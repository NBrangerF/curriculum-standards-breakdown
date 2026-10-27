import { useEffect, useRef, useState } from 'react'

const prefersReduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** Count from 0 up to `target` once; returns the number to show. */
export function useCountUp(target, duration = 1300, delay = 0) {
    const [value, setValue] = useState(prefersReduced() ? target : 0)
    useEffect(() => {
        if (prefersReduced()) { setValue(target); return undefined }
        let raf = 0
        const t0 = performance.now() + delay
        const tick = now => {
            const t = Math.min(1, Math.max(0, (now - t0) / duration))
            setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
            if (t < 1) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [target, duration, delay])
    return value
}

/** A code that decodes from random characters each time it changes. */
export function useScramble(text) {
    const ref = useRef(null)
    useEffect(() => {
        const node = ref.current
        if (!node) return undefined
        if (prefersReduced()) { node.textContent = text; return undefined }
        let frame = 0
        let timer = 0
        const total = 12
        const tick = () => {
            frame++
            node.textContent = [...text].map((ch, k) => (ch === '-' || k < (frame / total) * text.length ? ch : CH[Math.floor(Math.random() * CH.length)])).join('')
            if (frame < total) timer = setTimeout(tick, 40)
        }
        tick()
        return () => clearTimeout(timer)
    }, [text])
    return ref
}
