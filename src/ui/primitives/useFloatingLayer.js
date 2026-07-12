import { autoUpdate, arrow, computePosition, flip, offset, shift } from '@floating-ui/dom'
import { useEffect, useRef, useState } from 'react'

export function useFloatingLayer({
    isOpen,
    placement = 'bottom-start',
    offsetPx = 8,
    padding = 12,
    arrowRef = null
}) {
    const referenceRef = useRef(null)
    const floatingRef = useRef(null)
    const [isPositioned, setIsPositioned] = useState(false)
    const [floatingStyle, setFloatingStyle] = useState({})
    const [arrowStyle, setArrowStyle] = useState({})
    const [resolvedPlacement, setResolvedPlacement] = useState(placement)

    useEffect(() => {
        if (!isOpen || !referenceRef.current || !floatingRef.current) {
            setIsPositioned(false)
            return undefined
        }

        let active = true
        let positionFrame = 0
        const middleware = [
            offset(offsetPx),
            flip({ padding }),
            shift({ padding })
        ]
        if (arrowRef?.current) middleware.push(arrow({ element: arrowRef.current, padding: 6 }))

        const stopAutoUpdate = autoUpdate(referenceRef.current, floatingRef.current, async () => {
            const result = await computePosition(referenceRef.current, floatingRef.current, {
                placement,
                strategy: 'fixed',
                middleware
            })
            if (!active) return

            setResolvedPlacement(result.placement)
            setFloatingStyle({ position: result.strategy, left: result.x, top: result.y })

            if (arrowRef?.current) {
                const side = result.placement.split('-')[0]
                const staticSide = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }[side]
                const arrowData = result.middlewareData.arrow || {}
                setArrowStyle({
                    left: arrowData.x == null ? undefined : arrowData.x,
                    top: arrowData.y == null ? undefined : arrowData.y,
                    [staticSide]: '-7px'
                })
            }

            cancelAnimationFrame(positionFrame)
            positionFrame = requestAnimationFrame(() => {
                if (active) setIsPositioned(true)
            })
        })

        return () => {
            active = false
            cancelAnimationFrame(positionFrame)
            stopAutoUpdate()
        }
    }, [arrowRef, isOpen, offsetPx, padding, placement])

    return {
        arrowStyle,
        floatingRef,
        floatingStyle,
        isPositioned,
        referenceRef,
        resolvedPlacement
    }
}
