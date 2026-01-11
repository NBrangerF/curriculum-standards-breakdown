import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import HeroBackground from './HeroBackground'
import './HomeHeroBanner.css'

/**
 * Landing page abstract symbol - Knowledge Graph / Network
 * Used as decorative overlay (very faint)
 */
const LANDING_SYMBOL = (
    <>
        {/* Central node */}
        <circle cx="12" cy="12" r="2.5" strokeWidth="1.5" />
        {/* Surrounding nodes */}
        <circle cx="4" cy="6" r="1.5" strokeWidth="1.5" />
        <circle cx="20" cy="6" r="1.5" strokeWidth="1.5" />
        <circle cx="4" cy="18" r="1.5" strokeWidth="1.5" />
        <circle cx="20" cy="18" r="1.5" strokeWidth="1.5" />
        <circle cx="12" cy="2" r="1.5" strokeWidth="1.5" />
        <circle cx="12" cy="22" r="1.5" strokeWidth="1.5" />
        {/* Connecting lines */}
        <path d="M5.5 7l4.5 3.5M14.5 9.5l4-2.5M5.5 17l4.5-3.5M14.5 14.5l4 2.5M12 4.5v5M12 14.5v5" strokeWidth="1" />
    </>
)

/**
 * HomeHeroBanner - Landing page hero with tool-focused copy
 * Uses shared HeroBackground for TS-style visual quality
 * 
 * @param {string} scrollTargetId - ID of the element to scroll to
 * @param {string} themeColor - Primary brand color
 */
function HomeHeroBanner({
    scrollTargetId = 'compare-filter',
    themeColor = '#0891b2'  // Cyan/Teal brand color
}) {

    // Smooth scroll to compare filter and focus first control
    const handleStartFilter = useCallback(() => {
        const target = document.getElementById(scrollTargetId)
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' })

            // Focus first interactive element after scroll completes
            requestAnimationFrame(() => {
                setTimeout(() => {
                    const firstControl = target.querySelector('input, button, [tabindex="0"]')
                    if (firstControl) {
                        firstControl.focus()
                    }
                }, 500)
            })
        }
    }, [scrollTargetId])

    // Smooth scroll to subjects section and focus first card
    const handleBrowseSubjects = useCallback(() => {
        const target = document.getElementById('subjects-section')
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' })

            requestAnimationFrame(() => {
                setTimeout(() => {
                    const firstCard = target.querySelector('a, button, [tabindex="0"]')
                    if (firstCard) {
                        firstCard.focus()
                    }
                }, 500)
            })
        }
    }, [])

    return (
        <section
            className="home-hero-banner"
            style={{ '--theme-color': themeColor }}
        >
            {/* Shared TS-style background */}
            <HeroBackground
                themeColor={themeColor}
                iconPath={LANDING_SYMBOL}
                uniqueId="home-landing"
            />

            {/* Content - Left Aligned */}
            <div className="hero-content container">
                {/* H2 - Version tag */}
                <span className="hero-version-tag">2022年版</span>

                {/* H1 - Main headline (tool-focused) */}
                <h1 className="hero-headline">
                    3 秒定位课程标准
                </h1>

                {/* Body - Feature description */}
                <p className="hero-body">
                    按学科、学段与领域快速筛选标准；一键对比差异，并关联可迁移能力，快速获得教学线索。
                </p>

                {/* Micro hint */}
                <p className="hero-hint">
                    从"开始筛选"进入对比模式，几秒钟出结果。
                </p>

                {/* Action buttons */}
                <div className="hero-actions">
                    <button
                        className="hero-btn hero-btn-primary"
                        onClick={handleStartFilter}
                        aria-label="开始筛选课程标准"
                    >
                        开始筛选
                    </button>
                    <button
                        className="hero-btn hero-btn-secondary"
                        onClick={handleBrowseSubjects}
                        aria-label="按学科浏览"
                    >
                        按学科浏览
                    </button>
                    <Link
                        to="/skills"
                        className="hero-btn hero-btn-secondary"
                    >
                        按可迁移能力浏览
                    </Link>
                </div>
            </div>
        </section>
    )
}

export default HomeHeroBanner
