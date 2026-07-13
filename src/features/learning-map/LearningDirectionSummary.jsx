import styles from './LearningDagPanel.module.css'

export default function LearningDirectionSummary({ label, context }) {
    const required = context.required.length
    const recommended = context.recommended.length
    return (
        <div className={styles.directionSummary}>
            <span>{label}</span>
            <strong>{context.total}</strong>
            <small>{required ? `${required} 项必要` : ''}{required && recommended ? ' · ' : ''}{recommended ? `${recommended} 项建议` : ''}</small>
        </div>
    )
}
