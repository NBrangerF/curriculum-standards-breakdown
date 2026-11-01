import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import styles from '../../pages/ConceptsPage.module.css'

// Beside a term or a subject skeleton (wide screens only): every term by category, then the subjects, so the next
// word is one click away. `current` is a term id, or `subject:<slug>`.
export default function ConceptsRail({ data, current }) {
    const railRef = useRef(null)
    const here = key => (key === current ? 'page' : undefined)
    // the list is taller than a screen: bring the current entry into it (the rail scrolls, the page does not)
    useEffect(() => {
        const rail = railRef.current
        const link = rail?.querySelector('[aria-current="page"]')
        if (link && rail.scrollHeight > rail.clientHeight) rail.scrollTop = link.offsetTop - rail.clientHeight / 2
    }, [current])
    return (
        <nav ref={railRef} className={styles.rail} aria-label="概念词典目录">
            <Link className={styles.railHome} to="/concepts">概念词典</Link>
            {data.categories.map(category => {
                const terms = data.terms.filter(term => term.category === category.id)
                return terms.length ? (
                    <div key={category.id} className={styles.railGroup}>
                        <p>{category.label}</p>
                        <ul>{terms.map(term => <li key={term.id}><Link to={`/concepts/${term.id}`} aria-current={here(term.id)}>{term.term}</Link></li>)}</ul>
                    </div>
                ) : null
            })}
            <div className={styles.railGroup}>
                <p>学科骨架</p>
                <ul className={styles.railSubjects}>
                    {data.subjects.map(subject => <li key={subject.slug}><Link to={`/concepts/subjects/${subject.slug}`} aria-current={here(`subject:${subject.slug}`)}>{subject.name}</Link></li>)}
                </ul>
            </div>
        </nav>
    )
}
