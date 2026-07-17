import styles from './TextbookCover.module.css'

const SUBJECT_COLORS = {
    chinese: '#b91c1c',
    math: '#1d4ed8',
    english: '#6d28d9',
    science: '#047857',
    physics: '#0e7490',
    chemistry: '#c2410c',
    biology: '#15803d',
    history: '#92400e',
    geography: '#0369a1',
    morality_law: '#b45309',
    pe: '#a16207',
    art: '#be185d',
    music: '#7e22ce'
}

export default function TextbookCover({ book, size = 'card' }) {
    const color = SUBJECT_COLORS[book.subject_slug] || '#3e5bef'
    return (
        <div className={`${styles.cover} ${styles[size] || ''}`} style={{ '--book-color': color }} aria-label={`${book.title}封面占位`}>
            <span className={styles.edition}>{book.edition_name}</span>
            <span className={styles.type}>义务教育教科书</span>
            <strong>{book.subject}</strong>
            <span className={styles.grade}>{book.grade_label}</span>
            <span className={styles.volume}>{book.volume}</span>
            <span className={styles.mark}>kebiao 教材馆</span>
        </div>
    )
}
