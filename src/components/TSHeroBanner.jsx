import { Link } from 'react-router-dom'
import { SKILL_COLORS } from '../data/dataLoader'
import HeroBackground from './HeroBackground'
import styles from './TSHeroBanner.module.css'

/**
 * Abstract symbol SVG paths for TS skills
 * Used as decorative overlay on the right side
 */
const TS_SYMBOLS = {
    TS1: (
        <>
            <circle cx="12" cy="12" r="2" strokeWidth="1.5" />
            <circle cx="4" cy="8" r="2" strokeWidth="1.5" />
            <circle cx="20" cy="8" r="2" strokeWidth="1.5" />
            <circle cx="4" cy="16" r="2" strokeWidth="1.5" />
            <circle cx="20" cy="16" r="2" strokeWidth="1.5" />
            <path d="M6 9l4 2M14 10l4-1M6 15l4-2M14 14l4 1" strokeWidth="1.5" />
        </>
    ),
    TS2: (
        <>
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="4" strokeWidth="1.5" />
        </>
    ),
    TS3: (
        <>
            <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" strokeWidth="1.5" />
        </>
    ),
    TS4: (
        <>
            <circle cx="8" cy="7" r="3" strokeWidth="1.5" />
            <circle cx="16" cy="7" r="3" strokeWidth="1.5" />
            <path d="M2 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M14 21v-2a4 4 0 0 1 4-4h0a4 4 0 0 1 4 4v2" strokeWidth="1.5" />
        </>
    ),
    TS5: (
        <>
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" strokeWidth="1.5" />
        </>
    ),
    TS6: (
        <>
            <rect x="2" y="3" width="20" height="14" rx="2" strokeWidth="1.5" />
            <path d="M8 21h8M12 17v4" strokeWidth="1.5" />
            <path d="M7 8v2M10 8v2M13 8v2M16 8v2" strokeWidth="1.5" />
        </>
    ),
    TS7: (
        <>
            <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" strokeWidth="1.5" />
        </>
    )
}

/**
 * TSHeroBanner - Configurable hero banner for transferable skill pages
 * Uses shared HeroBackground for consistent visual quality
 * 
 * @param {string} tsCode - TS code (e.g., "TS2")
 * @param {string} titleCN - Chinese name
 * @param {string} titleEN - English name
 * @param {string} definition - One-line definition
 * @param {string} themeColor - TS primary color (hex)
 * @param {string} backLink - Optional back link path
 * @param {string} backLabel - Optional back link label
 */
function TSHeroBanner({
    tsCode,
    titleCN,
    titleEN,
    definition,
    themeColor,
    backLink = '/skills',
    backLabel = '← 返回技能列表'
}) {
    // Get color from SKILL_COLORS if not provided
    const color = themeColor || SKILL_COLORS[tsCode] || '#3b82f6'
    const iconPath = TS_SYMBOLS[tsCode] || TS_SYMBOLS.TS1

    return (
        <section
            className={styles['ts-hero-banner']}
            style={{ '--theme-color': color }}
        >
            {/* Shared TS-style background */}
            <HeroBackground
                themeColor={color}
                iconPath={iconPath}
                uniqueId={`ts-${tsCode}`}
            />

            <div className={`${styles['hero-content']} container`}>
                <Link to={backLink} className={styles['hero-back-link']}>
                    {backLabel}
                </Link>
                <div className={styles['ts-hero-grid']}>
                    <div className={styles['ts-hero-copy']}>
                        <span className={styles['ts-badge']}>Transferable Skill · {tsCode}</span>
                        <h1 className={`${styles['hero-title']} ${styles['ts-title-cn']}`}>{titleCN}</h1>
                        {titleEN ? <h2 className={styles['hero-title-en']}>{titleEN}</h2> : null}
                        {definition ? <p className={styles['ts-definition']}>{definition}</p> : null}
                    </div>
                    <div className={styles['ts-hero-visual']} aria-hidden="true">
                        <span>{tsCode}</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">{iconPath}</svg>
                    </div>
                </div>
            </div>
        </section>
    )
}

export default TSHeroBanner
