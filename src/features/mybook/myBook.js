import { useMemo, useSyncExternalStore } from 'react'

// 「我的书」: the textbook a teacher last opened or prepared from, kept on this device only.
// It uses the key AI 备课 has written since 10-30 ({ subject, edition }) and adds what the header needs
// to name the book, plus the last lesson prepared from it.
const KEY = 'kebiao.lessonPlan.lastBook'
const EVENT = 'kebiao:mybook'

// The star-map's subject colours (public/data/starmap.json), for the book's spine.
export const SPINE_COLORS = {
    morality_law: '#EC6FA0', chinese: '#F2603A', math: '#3FA2E0', english: '#7D8AF8', history: '#D98C55',
    geography: '#93CF5A', science: '#45C46F', physics: '#EF5A63', chemistry: '#DC6CD2', biology: '#5DBFA1',
    it: '#4FD1C5', pe: '#F4B32F', arts: '#C08CF0', art: '#C08CF0', music: '#C08CF0', labor: '#B6C94A'
}

function readRaw() {
    try { return window.localStorage.getItem(KEY) || '' } catch { return '' }
}

export function readMyBook() {
    try { return JSON.parse(readRaw() || 'null') } catch { return null }
}

/** The fields worth keeping from a catalogue or platform book record. */
export function bookFields(book) {
    if (!book) return {}
    const { edition_id: edition, subject, title, edition_name, grade, volume, subject_slug } = book
    return { edition, subject, title, edition_name, grade, volume, subject_slug }
}

/** Remember a book; fields for the same book are merged, a different book replaces the old one. */
export function saveMyBook(patch) {
    if (!patch?.edition || !patch?.subject) return
    const prev = readMyBook()
    const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined && value !== null && value !== ''))
    const next = prev?.edition === patch.edition ? { ...prev, ...defined } : defined
    const raw = JSON.stringify(next)
    if (raw === readRaw()) return
    try { window.localStorage.setItem(KEY, raw) } catch { return }
    window.dispatchEvent(new Event(EVENT))
}

function subscribe(onChange) {
    window.addEventListener(EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
        window.removeEventListener(EVENT, onChange)
        window.removeEventListener('storage', onChange)
    }
}

/** "数学 7上", "人教", the book's page and its spine colour; null until a book with a title is remembered. */
export function describeBook(book) {
    if (!book?.edition || !book?.subject || !book?.title) return null
    const grade = book.grade ? `${book.grade}${String(book.volume || '').slice(0, 1)}` : ''
    return {
        ...book,
        short: [book.subject, grade].filter(Boolean).join(' '),
        publisher: String(book.edition_name || '').replace(/版$/u, ''),
        href: book.edition.startsWith('pf_') ? `/textbooks/${book.edition}/standards` : `/textbooks/${book.edition}`,
        color: SPINE_COLORS[book.subject_slug] || 'var(--kb-gold)'
    }
}

export function useMyBook() {
    const raw = useSyncExternalStore(subscribe, readRaw, () => '')
    return useMemo(() => {
        try { return describeBook(JSON.parse(raw || 'null')) } catch { return null }
    }, [raw])
}
