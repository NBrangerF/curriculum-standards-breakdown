import { cloneElement, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFloatingLayer } from './useFloatingLayer'
import styles from './Tooltip.module.css'

const OPEN_DELAY_MS = 320
const CLOSE_DELAY_MS = 80

function callHandler(handler, event) {
    handler?.(event)
}

function assignRef(ref, value) {
    if (typeof ref === 'function') ref(value)
    else if (ref) ref.current = value
}

export function Tooltip({ content, children, placement = 'top' }) {
    const generatedId = useId()
    const tooltipId = `kb-tooltip-${generatedId.replaceAll(':', '')}`
    const arrowRef = useRef(null)
    const openTimer = useRef(null)
    const closeTimer = useRef(null)
    const [isOpen, setIsOpen] = useState(false)
    const {
        arrowStyle,
        floatingRef: tooltipRef,
        floatingStyle,
        isPositioned,
        referenceRef: triggerRef,
        resolvedPlacement
    } = useFloatingLayer({ isOpen, placement, offsetPx: 9, arrowRef })

    const clearTimers = () => {
        window.clearTimeout(openTimer.current)
        window.clearTimeout(closeTimer.current)
    }

    const open = ({ delayed = false } = {}) => {
        window.clearTimeout(closeTimer.current)
        window.clearTimeout(openTimer.current)
        if (delayed) {
            openTimer.current = window.setTimeout(() => setIsOpen(true), OPEN_DELAY_MS)
        } else {
            setIsOpen(true)
        }
    }

    const close = ({ delayed = false } = {}) => {
        window.clearTimeout(openTimer.current)
        window.clearTimeout(closeTimer.current)
        if (delayed) {
            closeTimer.current = window.setTimeout(() => setIsOpen(false), CLOSE_DELAY_MS)
        } else {
            setIsOpen(false)
        }
    }

    useEffect(() => () => clearTimers(), [])

    const describedBy = [children.props['aria-describedby'], isOpen ? tooltipId : null].filter(Boolean).join(' ') || undefined
    const trigger = cloneElement(children, {
        ref: node => {
            triggerRef.current = node
            assignRef(children.props.ref, node)
        },
        'aria-describedby': describedBy,
        onMouseEnter: event => {
            callHandler(children.props.onMouseEnter, event)
            if (!event.defaultPrevented) open({ delayed: true })
        },
        onMouseLeave: event => {
            callHandler(children.props.onMouseLeave, event)
            if (!event.defaultPrevented) close({ delayed: true })
        },
        onFocus: event => {
            callHandler(children.props.onFocus, event)
            if (!event.defaultPrevented && event.currentTarget.matches(':focus-visible')) open()
        },
        onBlur: event => {
            callHandler(children.props.onBlur, event)
            if (!event.defaultPrevented) close()
        },
        onKeyDown: event => {
            callHandler(children.props.onKeyDown, event)
            if (!event.defaultPrevented && event.key === 'Escape') close()
        }
    })

    return (
        <>
            {trigger}
            {isOpen && createPortal(
                <div
                    ref={tooltipRef}
                    id={tooltipId}
                    role="tooltip"
                    className={styles.tooltip}
                    style={floatingStyle}
                    data-ready={isPositioned || undefined}
                    data-placement={resolvedPlacement.split('-')[0]}
                    data-kb-primitive="tooltip"
                >
                    <span ref={arrowRef} className={styles.arrow} style={arrowStyle} aria-hidden="true">
                        <svg width="14" height="7" viewBox="0 0 14 7">
                            <path d="M0 0 7 7 14 0Z" />
                        </svg>
                    </span>
                    {content}
                </div>,
                document.body
            )}
        </>
    )
}
