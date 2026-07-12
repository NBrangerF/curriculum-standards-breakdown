import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import styles from './Header.module.css'

const NAV_ITEMS = [
    { path: '/', label: '首页' },
    { path: '/skills', label: '可迁移技能' },
    { path: '/search', label: '筛选搜索' },
    { path: '/collections', label: '我的清单' },
    { path: '/api', label: 'API' }
]

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

function Header() {
    const location = useLocation()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const menuButtonRef = useRef(null)

    useEffect(() => {
        setMobileMenuOpen(false)
    }, [location.pathname])

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

    const isActive = (path) => {
        if (path === '/') {
            return location.pathname === '/'
        }
        return location.pathname.startsWith(path)
    }

    return (
        <header className={styles.root} data-kb-shell="header">
            <div className={`container ${styles.container}`}>
                {/* Brand */}
                <Link to="/" className={styles.logo}>
                    <span className={styles.coordinate} aria-hidden="true">
                        <span className={styles.axis}></span>
                        <span className={styles.point}></span>
                    </span>
                    <span className={styles.logoText}>
                        <span className={styles.title}>kebiao</span>
                        <span className={styles.subtitle}>中国课程标准的结构化索引与智能引擎</span>
                    </span>
                </Link>

                {/* Desktop Nav */}
                <nav className={`${styles.nav} ${styles.desktopNav}`} aria-label="主导航">
                    {NAV_ITEMS.map(item => {
                        const active = isActive(item.path)
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
                                aria-current={active ? 'page' : undefined}
                            >
                                {item.label}
                            </Link>
                        )
                    })}
                </nav>

                {/* Mobile Menu Button */}
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

            {/* Mobile Nav */}
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
                            onClick={() => setMobileMenuOpen(false)}
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
                            {NAV_ITEMS.map(item => {
                                const active = isActive(item.path)
                                return (
                                    <m.div key={item.path} variants={mobileLinkVariants}>
                                        <Link
                                            to={item.path}
                                            className={`${styles.mobileLink} ${active ? styles.mobileLinkActive : ''}`}
                                            aria-current={active ? 'page' : undefined}
                                            onClick={() => setMobileMenuOpen(false)}
                                        >
                                            {item.label}
                                        </Link>
                                    </m.div>
                                )
                            })}
                        </m.nav>
                    </>
                )}
            </AnimatePresence>
        </header>
    )
}

export default Header
