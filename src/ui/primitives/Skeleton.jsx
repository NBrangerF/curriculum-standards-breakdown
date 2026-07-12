import styles from './Skeleton.module.css'

export function Skeleton({ variant = 'panel', lines = 3 }) {
    const lineCount = variant === 'inline' ? 2 : lines

    return (
        <div className={`${styles.root} ${variant === 'inline' ? styles.inline : ''}`} data-kb-primitive="skeleton" aria-hidden="true">
            <span className={styles.kicker} />
            {Array.from({ length: lineCount }, (_, index) => (
                <span key={index} className={styles.line} style={{ '--line-index': index }} />
            ))}
        </div>
    )
}
