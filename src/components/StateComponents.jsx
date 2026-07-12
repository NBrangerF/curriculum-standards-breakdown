import { useEffect, useRef, useState } from 'react'
import { CopyIcon } from '@phosphor-icons/react/dist/csr/Copy'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle'
import { Skeleton } from '../ui/primitives/Skeleton'
import styles from './StateComponents.module.css'

/**
 * Loading state component
 */
export function LoadingState({ message = '加载中...', size = 'normal' }) {
    return (
        <div className={`${styles.container} ${styles.loading} ${size === 'small' ? styles.small : ''}`} data-kb-state="loading" role="status" aria-live="polite">
            <Skeleton variant={size === 'small' ? 'inline' : 'panel'} />
            <p className={styles.message}>{message}</p>
        </div>
    )
}

/**
 * Error state component
 */
export function ErrorState({
    title = '加载失败',
    message = '数据加载时发生错误，请刷新页面重试',
    onRetry
}) {
    return (
        <div className={`${styles.container} ${styles.error}`} data-kb-state="error" role="alert">
            <div className={styles.icon} aria-hidden="true"><WarningCircleIcon weight="light" /></div>
            <h3 className={styles.title}>{title}</h3>
            <p className={styles.message}>{message}</p>
            {onRetry && (
                <button className="btn btn-primary" onClick={onRetry}>
                    重新加载
                </button>
            )}
        </div>
    )
}

/**
 * Empty state component
 */
export function EmptyState({
    icon = <MagnifyingGlassIcon weight="light" />,
    title = '没有找到结果',
    message = '尝试调整筛选条件或清除部分筛选',
    action,
    actionLabel = '清除筛选'
}) {
    return (
        <div className={`${styles.container} ${styles.empty}`} data-kb-state="empty">
            <div className={styles.icon} aria-hidden="true">{icon}</div>
            <h3 className={styles.title}>{title}</h3>
            <p className={styles.message}>{message}</p>
            {action && (
                <button className="btn btn-secondary" onClick={action}>
                    {actionLabel}
                </button>
            )}
        </div>
    )
}

/**
 * Result stats component
 */
export function ResultStats({
    total,
    filtered,
    label = '条标准',
    breakdown = null
}) {
    return (
        <div className={styles.resultStats} data-kb-state="result-stats">
            <span className={styles.statsCount}>
                {filtered !== undefined ? (
                    <>
                        <strong>{filtered}</strong> / {total} {label}
                    </>
                ) : (
                    <>
                        <strong>{total}</strong> {label}
                    </>
                )}
            </span>
            {breakdown && (
                <div className={styles.statsBreakdown}>
                    {Object.entries(breakdown).map(([key, count]) => (
                        <span key={key} className={styles.breakdownChip}>
                            {key}: {count}
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}

/**
 * Copy link button component
 */
export function CopyLinkButton({ url, className = '' }) {
    const [copyState, setCopyState] = useState('idle')
    const resetTimerRef = useRef(null)

    useEffect(() => () => window.clearTimeout(resetTimerRef.current), [])

    const handleCopy = async () => {
        try {
            let copied = false
            if (navigator.clipboard?.writeText) {
                try {
                    await navigator.clipboard.writeText(url)
                    copied = true
                } catch {
                    copied = false
                }
            }
            if (!copied) {
                const textArea = document.createElement('textarea')
                textArea.value = url
                textArea.setAttribute('readonly', '')
                textArea.style.position = 'fixed'
                textArea.style.opacity = '0'
                document.body.appendChild(textArea)
                textArea.select()
                copied = document.execCommand('copy')
                textArea.remove()
                if (!copied) throw new Error('copy command unavailable')
            }
            setCopyState('copied')
        } catch {
            setCopyState('error')
        }
        window.clearTimeout(resetTimerRef.current)
        resetTimerRef.current = window.setTimeout(() => setCopyState('idle'), 2200)
    }

    return (
        <span className={styles.copyControl} data-kb-component="copy-link-control">
            <button
                type="button"
                className={`btn btn-secondary ${styles.copyButton} ${className}`}
                onClick={handleCopy}
            >
                <CopyIcon size={17} aria-hidden="true" />
                {copyState === 'copied' ? '已复制' : copyState === 'error' ? '复制失败' : '复制链接'}
            </button>
            <span className="sr-only" role="status" aria-live="polite">
                {copyState === 'copied' ? '链接已复制到剪贴板' : copyState === 'error' ? '无法访问剪贴板，请手动复制地址栏链接' : ''}
            </span>
        </span>
    )
}
