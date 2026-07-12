import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle'
import { InfoIcon } from '@phosphor-icons/react/dist/csr/Info'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import styles from './Toast.module.css'

const ICONS = {
    info: InfoIcon,
    success: CheckCircleIcon,
    warning: WarningCircleIcon,
    error: WarningCircleIcon
}

export function useTransientToast(duration = 3000) {
    const [toast, setToast] = useState(null)
    const timerRef = useRef(null)

    const dismissToast = useCallback(() => {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
        setToast(null)
    }, [])

    const showToast = useCallback((message, tone = 'warning') => {
        if (!message) return
        window.clearTimeout(timerRef.current)
        setToast({ message, tone })
        timerRef.current = window.setTimeout(() => setToast(null), duration)
    }, [duration])

    useEffect(() => () => window.clearTimeout(timerRef.current), [])

    return { toast, showToast, dismissToast }
}

export function Toast({ message, tone = 'info', actionLabel, onAction, onDismiss }) {
    if (!message) return null
    const Icon = ICONS[tone] || InfoIcon

    return (
        <div className={`${styles.root} ${styles[tone] || ''}`} data-kb-primitive="toast" role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'}>
            <Icon className={styles.icon} size={19} weight="fill" aria-hidden="true" />
            <p>{message}</p>
            {actionLabel && onAction ? <button type="button" className={styles.action} onClick={onAction}>{actionLabel}</button> : null}
            {onDismiss ? (
                <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="关闭通知">
                    <XIcon size={16} aria-hidden="true" />
                </button>
            ) : null}
        </div>
    )
}
