import { flushSync } from 'react-dom'

export function runViewTransition(update) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion || typeof document.startViewTransition !== 'function') {
        update()
        return null
    }

    return document.startViewTransition(() => {
        flushSync(update)
    })
}
