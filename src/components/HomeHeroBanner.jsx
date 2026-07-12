import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { m } from 'motion/react'
import CurriculumCoordinateMap from './CurriculumCoordinateMap'
import styles from './HomeHeroBanner.module.css'

const heroSequence = {
    hidden: {},
    visible: {
        transition: {
            delayChildren: 0.06,
            staggerChildren: 0.065
        }
    }
}

const heroItem = {
    hidden: { opacity: 0, y: 14 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.46, ease: [0.16, 1, 0.3, 1] }
    }
}

/**
 * HomeHeroBanner - Landing page hero with tool-focused copy
 * Uses shared HeroBackground for TS-style visual quality
 * 
 * @param {string} scrollTargetId - ID of the element to scroll to
 * @param {string} themeColor - Primary brand color
 */
function HomeHeroBanner({
    scrollTargetId = 'compare-filter'
}) {

    // Smooth scroll to compare filter and focus first control
    const handleStartFilter = useCallback(() => {
        const target = document.getElementById(scrollTargetId)
        if (target) {
            const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
            target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' })

            // Focus first interactive element after scroll completes
            requestAnimationFrame(() => {
                setTimeout(() => {
                    const firstControl = target.querySelector('input, button, [tabindex="0"]')
                    if (firstControl) {
                        firstControl.focus()
                    }
                }, reducedMotion ? 0 : 500)
            })
        }
    }, [scrollTargetId])

    // Smooth scroll to subjects section and focus first card
    const handleBrowseSubjects = useCallback(() => {
        const target = document.getElementById('subjects-section')
        if (target) {
            const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
            target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' })

            requestAnimationFrame(() => {
                setTimeout(() => {
                    const firstCard = target.querySelector('a, button, [tabindex="0"]')
                    if (firstCard) {
                        firstCard.focus()
                    }
                }, reducedMotion ? 0 : 500)
            })
        }
    }, [])

    return (
        <section
            className={styles['home-hero-banner']}
            data-kb-component="home-hero"
        >
            <div className={`${styles['hero-content']} container`}>
                <m.div
                    className={styles['hero-copy']}
                    variants={heroSequence}
                    initial="hidden"
                    animate="visible"
                >
                    <m.span className={styles['hero-context']} variants={heroItem}>义务教育 · 2022年版</m.span>

                    <m.h1 className={styles['hero-headline']} variants={heroItem}>
                        3 秒定位课程标准
                    </m.h1>

                    <m.p className={styles['hero-body']} variants={heroItem}>
                        按学科、学段与领域快速筛选标准；一键对比差异，并关联可迁移能力，快速获得教学线索。
                    </m.p>

                    <m.p className={styles['hero-hint']} variants={heroItem}>
                        从“开始筛选”进入对比模式，几秒钟出结果。
                    </m.p>

                    <m.div className={styles['hero-actions']} variants={heroItem}>
                        <button
                            className={`${styles['hero-btn']} ${styles['hero-btn-primary']}`}
                            onClick={handleStartFilter}
                            aria-label="开始筛选课程标准"
                        >
                            开始筛选
                        </button>
                        <button
                            className={`${styles['hero-btn']} ${styles['hero-btn-secondary']}`}
                            onClick={handleBrowseSubjects}
                            aria-label="按学科浏览"
                        >
                            按学科浏览
                        </button>
                        <Link
                            to="/skills"
                            className={`${styles['hero-btn']} ${styles['hero-btn-tertiary']}`}
                        >
                            按可迁移能力浏览
                        </Link>
                    </m.div>
                </m.div>

                <CurriculumCoordinateMap />
            </div>
        </section>
    )
}

export default HomeHeroBanner
