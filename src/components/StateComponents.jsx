import './StateComponents.css'

/**
 * Loading state component
 */
export function LoadingState({ message = '加载中...', size = 'normal' }) {
    return (
        <div className={`state-container loading-state ${size}`}>
            <div className="loading-spinner">
                <div className="spinner"></div>
            </div>
            <p className="state-message">{message}</p>
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
        <div className="state-container error-state">
            <div className="state-icon">⚠️</div>
            <h3 className="state-title">{title}</h3>
            <p className="state-message">{message}</p>
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
    icon = '🔍',
    title = '没有找到结果',
    message = '尝试调整筛选条件或清除部分筛选',
    action,
    actionLabel = '清除筛选'
}) {
    return (
        <div className="state-container empty-state">
            <div className="state-icon">{icon}</div>
            <h3 className="state-title">{title}</h3>
            <p className="state-message">{message}</p>
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
        <div className="result-stats">
            <span className="stats-count">
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
                <div className="stats-breakdown">
                    {Object.entries(breakdown).map(([key, count]) => (
                        <span key={key} className="breakdown-chip">
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
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(url)
            // Could add toast notification here
            alert('链接已复制到剪贴板')
        } catch (err) {
            // Fallback
            const textArea = document.createElement('textarea')
            textArea.value = url
            document.body.appendChild(textArea)
            textArea.select()
            document.execCommand('copy')
            document.body.removeChild(textArea)
            alert('链接已复制到剪贴板')
        }
    }

    return (
        <button
            className={`btn btn-secondary copy-link-btn ${className}`}
            onClick={handleCopy}
            title="复制当前筛选链接"
        >
            📋 复制链接
        </button>
    )
}
