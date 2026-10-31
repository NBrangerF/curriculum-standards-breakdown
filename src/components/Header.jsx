import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import { useSky } from '../features/starmap/SkyProvider.jsx'
import { useMyBook } from '../features/mybook/myBook.js'
import KebiaoLogo from './KebiaoLogo.jsx'
import { MINOR_LINKS, NAV_GROUPS, groupOf, isItemActive } from './navGroups.js'
import styles from './Header.module.css'

const mobileNavVariants = {
    closed: {
        opacity: 0,
        y: -12,
        transition: { duration: 0.18, ease: [0.32, 0.72, 0, 1], when: 'afterChildren', staggerChildren: 0.025, staggerDirection: -1 }
    },
    open: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1], when: 'beforeChildren', staggerChildren: 0.045 }
    }
}

const mobileLinkVariants = {
    closed: { opacity: 0, y: -8 },
    open: { opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] } }
}

// The group's pages; inside 教材 the remembered book gets its own item.
function groupItems(group, myBook) {
    if (group.key !== 'textbooks' || !myBook) return group.items
    const [first, ...rest] = group.items
    return [first, { to: myBook.href, label: '我的书', title: `${myBook.title}（${myBook.edition_name || ''}）`, book: myBook.edition }, ...rest]
}

function itemActive(item, pathname) {
    if (item.book) return pathname.startsWith(`/textbooks/${item.book}`)
    return isItemActive(item, pathname)
}

function Header() {
    const location = useLocation()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const menuButtonRef = useRef(null)
    const { openPalette } = useSky()
    const myBook = useMyBook()
    const current = groupOf(location.pathname)

    useEffect(() => {
        setMobileMenuOpen(false)
    }, [location.pathname, location.search, location.hash])

    useEffect(() => {
        if (!mobileMenuOpen) return undefined
        const handleKeyDown = event => {
            if (event.key !== 'Escape') return
            setMobileMenuOpen(false)
            requestAnimationFrame(() => menuButtonRef.current?.focus())
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [mobileMenuOpen])

    const groupCurrent = group => (current?.key !== group.key ? undefined : location.pathname === group.to ? 'page' : 'true')
    const close = () => setMobileMenuOpen(false)

    return (
        <>
            <header className={styles.root} data-kb-shell="header">
                <div className={`container ${styles.container}`}>
                    <Link to="/" className={styles.logo} aria-label="kebiao 首页">
                        <KebiaoLogo className={styles.mark} />
                    </Link>

                    <nav className={`${styles.nav} ${styles.desktopNav}`} aria-label="主导航">
                        {NAV_GROUPS.map(group => (
                            <Link
                                key={group.key}
                                to={group.to}
                                className={`${styles.navLink} ${current?.key === group.key ? styles.navLinkActive : ''}`}
                                aria-current={groupCurrent(group)}
                            >
                                {group.label}
                            </Link>
                        ))}
                    </nav>

                    <span className={styles.spacer} aria-hidden="true" />

                    {myBook ? (
                        <Link
                            to={myBook.href}
                            className={`${styles.book} ${location.pathname.startsWith(`/textbooks/${myBook.edition}`) ? styles.bookActive : ''}`}
                            style={{ '--c': myBook.color }}
                            aria-label={`我的书：${myBook.title}（${myBook.edition_name || ''}）`}
                            title={`我的书：${myBook.title}（${myBook.edition_name || ''}）`}
                        >
                            <i aria-hidden="true" />
                            <b>{myBook.short}</b>
                            {myBook.publisher ? <small>{myBook.publisher}</small> : null}
                        </Link>
                    ) : null}

                    <button type="button" className={styles.searchButton} onClick={() => openPalette('')} aria-label="搜索课程标准" aria-keyshortcuts="Meta+K Control+K">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                        <span className={styles.searchLabel}>搜索</span>
                        <kbd className={styles.kbd}>⌘K</kbd>
                    </button>

                    <button
                        ref={menuButtonRef}
                        className={styles.menuButton}
                        onClick={() => setMobileMenuOpen(open => !open)}
                        aria-label={mobileMenuOpen ? '关闭导航菜单' : '打开导航菜单'}
                        aria-expanded={mobileMenuOpen}
                        aria-controls="mobile-navigation"
                    >
                        <span className={`${styles.hamburger} ${mobileMenuOpen ? styles.hamburgerOpen : ''}`}>
                            <span></span>
                            <span></span>
                            <span></span>
                        </span>
                    </button>
                </div>

                <AnimatePresence initial={false}>
                    {mobileMenuOpen && (
                        <>
                            <m.div
                                key="mobile-navigation-scrim"
                                className={styles.mobileScrim}
                                aria-hidden="true"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                                onClick={close}
                            />
                            <m.nav
                                key="mobile-navigation"
                                className={styles.mobileNav}
                                id="mobile-navigation"
                                aria-label="移动端主导航"
                                variants={mobileNavVariants}
                                initial="closed"
                                animate="open"
                                exit="closed"
                            >
                                {myBook ? (
                                    <m.div variants={mobileLinkVariants}>
                                        <Link to={myBook.href} className={styles.mobileBook} style={{ '--c': myBook.color }} onClick={close}>
                                            <i aria-hidden="true" />
                                            <span>
                                                <b>我的书：{myBook.title}</b>
                                                <small>{[myBook.edition_name, myBook.lesson?.title ? `上次备到「${myBook.lesson.title}」` : ''].filter(Boolean).join(' · ')}</small>
                                            </span>
                                        </Link>
                                    </m.div>
                                ) : null}
                                {NAV_GROUPS.map(group => (
                                    <m.div key={group.key} variants={mobileLinkVariants} className={styles.mobileGroup}>
                                        <Link
                                            to={group.to}
                                            className={`${styles.mobileGroupLink} ${current?.key === group.key ? styles.mobileGroupActive : ''}`}
                                            aria-current={groupCurrent(group)}
                                            onClick={close}
                                        >
                                            {group.label}
                                        </Link>
                                        <div className={styles.mobileItems}>
                                            {group.items.map(item => {
                                                const active = current?.key === group.key && isItemActive(item, location.pathname)
                                                return (
                                                    <Link
                                                        key={item.to}
                                                        to={item.to}
                                                        className={`${styles.mobileLink} ${active ? styles.mobileLinkActive : ''}`}
                                                        aria-current={active ? 'page' : undefined}
                                                        onClick={close}
                                                    >
                                                        {item.label}
                                                    </Link>
                                                )
                                            })}
                                        </div>
                                    </m.div>
                                ))}
                                <m.div variants={mobileLinkVariants} className={styles.mobileMinor}>
                                    {MINOR_LINKS.map(item => <Link key={item.to} to={item.to} onClick={close}>{item.label}</Link>)}
                                </m.div>
                            </m.nav>
                        </>
                    )}
                </AnimatePresence>
            </header>

            {current ? (
                <nav className={styles.subnav} aria-label={`${current.label}栏目`} data-kb-shell="header">
                    <div className={`container ${styles.subnavInner}`}>
                        <span className={styles.subnavLabel} aria-hidden="true">{current.label}</span>
                        {groupItems(current, myBook).map(item => {
                            const active = itemActive(item, location.pathname)
                            return (
                                <Link
                                    key={item.to}
                                    to={item.to}
                                    className={`${styles.subnavLink} ${active ? styles.subnavLinkActive : ''}`}
                                    aria-current={active ? 'page' : undefined}
                                    title={item.title}
                                >
                                    {item.label}
                                </Link>
                            )
                        })}
                    </div>
                </nav>
            ) : null}
        </>
    )
}

export default Header
