import { Link } from 'react-router-dom'
import styles from './MyBookCard.module.css'

const enc = encodeURIComponent

/** 「我的书」 with the three things a teacher does next: prepare a lesson, see its 课标对应表, plan the term. */
export default function MyBookCard({ book, onChange, className = '' }) {
    const lesson = book.lesson
    // pilot editions have no PDF and no AI 备课 lesson list; their 课标对应表 is the whole of what they offer
    const platform = book.edition.startsWith('pf_')
    const query = `subject=${enc(book.subject)}&edition=${enc(book.edition)}`
    const name = book.grade ? `${book.subject} ${book.grade} 年级${book.volume || ''}` : book.title

    return (
        <section className={`${styles.card} ${className}`} style={{ '--c': book.color }} aria-labelledby="my-book-title">
            <div className={styles.row}>
                <span className={styles.cover} aria-hidden="true">
                    <b>{book.subject}</b>
                    <small>{book.grade ? `${book.grade}${String(book.volume || '').slice(0, 1)}` : ''}</small>
                </span>
                <div className={styles.text}>
                    <p className={styles.label}>我的书</p>
                    <h2 className={styles.title} id="my-book-title"><Link to={book.href}>{name}</Link></h2>
                    <p className={styles.meta}>{[book.edition_name, lesson?.title ? `上次备到「${lesson.title}」` : ''].filter(Boolean).join(' · ')}</p>
                </div>
                {onChange ? <button type="button" className={styles.change} onClick={onChange}>换一本</button> : null}
            </div>
            <div className={styles.actions}>
                {platform ? (
                    <Link className="btn btn-primary" to={`/textbooks/${book.edition}/standards`}>每一课教哪几条课标 →</Link>
                ) : (
                    <>
                        <Link className="btn btn-primary" to={`/lesson-plan?${query}${lesson?.id ? `&lesson=${enc(lesson.id)}` : ''}`}>
                            {lesson?.title ? `接着备「${lesson.title}」` : '用这本书备课'} →
                        </Link>
                        <Link className="btn btn-secondary" to={`/textbooks/${book.edition}/standards`}>课标对应表</Link>
                        <Link className="btn btn-secondary" to={`/schedule?${query}`}>排学期进度</Link>
                    </>
                )}
            </div>
        </section>
    )
}
