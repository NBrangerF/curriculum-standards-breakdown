import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadTextbooksForStandard } from './textbookApi'
import styles from './StandardTextbookLinks.module.css'

export default function StandardTextbookLinks({ standardCode }) {
    const [links, setLinks] = useState([])
    const [status, setStatus] = useState('loading')

    useEffect(() => {
        let cancelled = false
        setStatus('loading')
        loadTextbooksForStandard(standardCode)
            .then(items => {
                if (cancelled) return
                setLinks(items)
                setStatus('ready')
            })
            .catch(() => {
                if (!cancelled) setStatus('error')
            })
        return () => { cancelled = true }
    }, [standardCode])

    if (status === 'loading') {
        return <p className={styles.loading} role="status">正在核对关联教材…</p>
    }

    if (status === 'error' || links.length === 0) return null

    return (
        <section className={styles.panel} aria-labelledby="standard-textbook-links-title">
            <header className={styles.heading}>
                <div>
                    <span>TEXTBOOK EVIDENCE</span>
                    <h2 id="standard-textbook-links-title">这条课标关联哪些教材</h2>
                </div>
                <strong>{links.length} 本关联教材</strong>
            </header>
            <div className={styles.list}>
                {links.map(item => (
                    <article className={styles.item} key={item.alignment_id}>
                        <div className={styles.index} aria-hidden="true">{item.unit_id ? String(item.printed_page || item.pdf_page || '—').padStart(2, '0') : '范围'}</div>
                        <div className={styles.copy}>
                            <Link to={`/textbooks/${item.edition_id}`}>{item.textbook_title}</Link>
                            <p>{item.unit_id ? item.unit_title : '同学科、同年级带教材范围'}</p>
                            <small>{item.rationale}</small>
                        </div>
                        <div className={styles.location}>
                            {item.unit_id ? <><span>印刷页 {item.printed_page || '—'}</span><span>PDF {item.pdf_page || '—'}</span></> : <span>范围关系</span>}
                        </div>
                        <div className={styles.actions}>
                            {item.unit_id && <Link to={`/textbook-units/${item.unit_id}`}>查看单元</Link>}
                            {item.unit_id && item.pdf_page && <Link to={`/textbooks/${item.edition_id}/read?page=${item.pdf_page}`}>定位原文 →</Link>}
                            {!item.unit_id && <Link to={`/textbooks/${item.edition_id}`}>查看教材 →</Link>}
                        </div>
                    </article>
                ))}
            </div>
        </section>
    )
}
