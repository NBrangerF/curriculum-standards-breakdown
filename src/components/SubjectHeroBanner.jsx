import { Link } from 'react-router-dom'
import HeroBackground from './HeroBackground'
import './SubjectHeroBanner.css'

/**
 * Subject Icon SVG paths (outline style)
 * Used as decorative overlay on the right side
 */
const SUBJECT_ICONS = {
    chinese: (
        <path d="M12 2v20M2 12h20M7 7l10 10M17 7L7 17" strokeWidth="1.5" />
    ),
    math: (
        <>
            <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
            <path d="M8 12h8M12 8v8" strokeWidth="1.5" />
        </>
    ),
    english: (
        <>
            <path d="M4 20h16M4 4l8 12 8-12" strokeWidth="1.5" />
        </>
    ),
    science: (
        <>
            <circle cx="12" cy="12" r="3" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="8" strokeWidth="1.5" />
            <path d="M12 4v16M4 12h16" strokeWidth="1.5" />
        </>
    ),
    it: (
        <>
            <rect x="3" y="4" width="18" height="12" rx="2" strokeWidth="1.5" />
            <path d="M7 20h10M12 16v4" strokeWidth="1.5" />
        </>
    ),
    morality_law: (
        <>
            <path d="M12 2L2 7v6c0 5.5 4.3 10.3 10 11.5 5.7-1.2 10-6 10-11.5V7l-10-5z" strokeWidth="1.5" />
        </>
    ),
    arts: (
        <>
            <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" strokeWidth="1.5" />
        </>
    ),
    labor: (
        <>
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" strokeWidth="1.5" />
        </>
    ),
    pe: (
        <>
            <circle cx="12" cy="5" r="3" strokeWidth="1.5" />
            <path d="M12 8v8M8 12h8M8 20l4-4 4 4" strokeWidth="1.5" />
        </>
    )
}

/**
 * SubjectHeroBanner - Configurable hero banner for subject pages
 * Uses shared HeroBackground for TS-style visual quality
 * Content remains left-aligned
 * 
 * @param {string} title - Subject name (e.g., "科学")
 * @param {string} subtitle - One-line description
 * @param {object} stats - { standardsCount, domainsCount }
 * @param {string} themeColor - Subject primary color (hex)
 * @param {string} iconKey - Subject icon key
 * @param {string} backLink - Optional back link path
 * @param {string} backLabel - Optional back link label
 */
function SubjectHeroBanner({
    title,
    subtitle,
    stats = {},
    themeColor = '#2563eb',
    iconKey = 'science',
    backLink = '/',
    backLabel = '← 返回首页'
}) {
    const { standardsCount = 0, domainsCount = 0 } = stats
    const iconPath = SUBJECT_ICONS[iconKey] || SUBJECT_ICONS.science

    return (
        <section
            className="subject-hero-banner"
            style={{ '--theme-color': themeColor }}
        >
            {/* Shared TS-style background */}
            <HeroBackground
                themeColor={themeColor}
                iconPath={iconPath}
                uniqueId={`subject-${iconKey}`}
            />

            {/* Content - Left Aligned */}
            <div className="hero-content container">
                {/* Back link */}
                <Link to={backLink} className="hero-back-link">
                    {backLabel}
                </Link>

                {/* Title */}
                <h1 className="hero-title">{title}</h1>

                {/* Subtitle */}
                {subtitle && (
                    <p className="hero-subtitle">{subtitle}</p>
                )}

                {/* Stats row - Glass cards */}
                <div className="hero-stats">
                    <div className="stat-glass-card">
                        <span className="stat-value">{standardsCount}</span>
                        <span className="stat-label">条标准</span>
                    </div>
                    <div className="stat-glass-card">
                        <span className="stat-value">{domainsCount}</span>
                        <span className="stat-label">个领域</span>
                    </div>
                </div>
            </div>
        </section>
    )
}

export default SubjectHeroBanner
