import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadTextbookCatalog } from '../textbooks/textbookApi'
import { SPINE_COLORS } from './myBook.js'
import styles from './BookPicker.module.css'

const SUBJECT_ORDER = ['语文', '数学', '英语', '道德与法治', '科学', '物理', '化学', '生物学', '历史', '地理', '信息科技', '体育与健康', '艺术', '美术', '音乐', '劳动']
const CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']
const order = name => (SUBJECT_ORDER.includes(name) ? SUBJECT_ORDER.indexOf(name) : SUBJECT_ORDER.length)

let pending = null
/** The library's books (with PDFs) and the pilot editions known only from the 国家平台 lesson list. */
export function loadAllBooks() {
    pending ||= Promise.all([
        loadTextbookCatalog().catch(() => ({ items: [] })),
        fetch('/data/textbooks/platform_books.json').then(response => (response.ok ? response.json() : { books: [] })).catch(() => ({ books: [] }))
    ]).then(([catalog, platform]) => [
        ...(catalog.items || []).filter(book => book.resource_type === 'student_textbook').map(book => ({ ...book, platform_only: false })),
        ...(platform.books || []).map(book => ({ ...book, platform_only: true }))
    ])
    return pending
}

/** A library book opens its own page; a pilot edition opens its 课标对应表, the only page it has. */
export function bookHref(book) {
    return book.platform_only ? `/textbooks/${book.edition_id}/standards` : `/textbooks/${book.edition_id}`
}

const slotOf = book => `${book.grade}${book.volume}`
const slotLabel = book => `${CN[book.grade] || book.grade}${String(book.volume).slice(0, 1)}`

/** Three steps to a textbook: subject, then grade and volume, then edition. */
export default function BookPicker({ className = '' }) {
    const [books, setBooks] = useState(null)
    const [subject, setSubject] = useState('')
    const [slot, setSlot] = useState('')
    const [edition, setEdition] = useState('')

    useEffect(() => {
        let active = true
        loadAllBooks().then(value => { if (active) setBooks(value) }).catch(() => { if (active) setBooks([]) })
        return () => { active = false }
    }, [])

    const subjects = useMemo(() => [...new Set((books || []).map(book => book.subject))].sort((a, b) => order(a) - order(b)), [books])
    const slots = useMemo(() => {
        const seen = new Map()
        for (const book of books || []) if (book.subject === subject && !seen.has(slotOf(book))) seen.set(slotOf(book), book)
        return [...seen.values()].sort((a, b) => a.grade - b.grade || a.volume.localeCompare(b.volume, 'zh-CN'))
    }, [books, subject])
    const versions = useMemo(() => (books || [])
        .filter(book => book.subject === subject && slotOf(book) === slot)
        .sort((a, b) => Number(a.platform_only) - Number(b.platform_only) || a.edition_name.localeCompare(b.edition_name, 'zh-CN')), [books, subject, slot])
    const chosen = versions.find(book => book.edition_id === edition) || (versions.length === 1 ? versions[0] : null)

    const pickSubject = name => { setSubject(name); setSlot(''); setEdition('') }
    const pickSlot = value => { setSlot(value); setEdition('') }

    return (
        <div className={`${styles.picker} ${className}`} role="group" aria-label="选一本教材">
            <fieldset className={styles.step}>
                <legend><span>1</span>学科</legend>
                {books ? (
                    <div className={styles.chips}>
                        {subjects.map(name => {
                            const slug = books.find(book => book.subject === name)?.subject_slug
                            return (
                                <button key={name} type="button" className={styles.chip} aria-pressed={subject === name} style={{ '--c': SPINE_COLORS[slug] || 'var(--kb-gold)' }} onClick={() => pickSubject(name)}>
                                    <i aria-hidden="true" />{name}
                                </button>
                            )
                        })}
                    </div>
                ) : <p className={styles.wait}>正在载入教材…</p>}
            </fieldset>
            <fieldset className={styles.step} disabled={!subject}>
                <legend><span>2</span>年级</legend>
                {subject ? (
                    <div className={styles.grades}>
                        {slots.map(book => (
                            <button key={slotOf(book)} type="button" aria-pressed={slot === slotOf(book)} aria-label={`${book.grade} 年级${book.volume}`} onClick={() => pickSlot(slotOf(book))}>
                                {slotLabel(book)}
                            </button>
                        ))}
                    </div>
                ) : <p className={styles.wait}>先选学科</p>}
            </fieldset>
            <fieldset className={styles.step} disabled={!slot}>
                <legend><span>3</span>版本</legend>
                {slot ? (
                    <div className={styles.versions}>
                        {versions.map(book => (
                            <button key={book.edition_id} type="button" aria-pressed={chosen?.edition_id === book.edition_id} onClick={() => setEdition(book.edition_id)}>
                                <span>{book.edition_name}</span>
                                <small>{book.platform_only ? '只有课目录' : '有原书'}</small>
                            </button>
                        ))}
                    </div>
                ) : <p className={styles.wait}>先选年级</p>}
            </fieldset>
            {chosen ? (
                <Link className={`btn btn-primary ${styles.go}`} to={bookHref(chosen)}>
                    打开 {chosen.subject}{slotLabel(chosen)} · {chosen.edition_name} →
                </Link>
            ) : (
                <span className={`btn btn-secondary ${styles.go}`} aria-disabled="true">选好后打开这本书</span>
            )}
        </div>
    )
}
