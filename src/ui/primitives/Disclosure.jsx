import { useId } from 'react'
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight'
import styles from './Disclosure.module.css'

export function Disclosure({
    isExpanded,
    onExpandedChange,
    trigger,
    children,
    triggerClassName = '',
    panelClassName = '',
    panelId
}) {
    const generatedId = useId()
    const contentId = panelId || `kb-disclosure-${generatedId.replaceAll(':', '')}`

    return (
        <div className={styles.root} data-kb-primitive="disclosure">
            <button
                type="button"
                className={triggerClassName}
                aria-expanded={isExpanded}
                aria-controls={contentId}
                onClick={() => onExpandedChange(!isExpanded)}
            >
                {typeof trigger === 'function' ? trigger({ isExpanded }) : trigger}
            </button>
            {isExpanded ? (
                <div id={contentId} className={panelClassName} role="region">
                    {children}
                </div>
            ) : null}
        </div>
    )
}

export function DisclosureIndicator({ isExpanded, className = '' }) {
    return <CaretRightIcon className={`${styles.indicator} ${isExpanded ? styles.expanded : ''} ${className}`} size={16} aria-hidden="true" />
}
