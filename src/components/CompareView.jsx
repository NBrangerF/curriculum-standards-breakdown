import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CaretUpIcon } from '@phosphor-icons/react/dist/csr/CaretUp'
import { SlidersHorizontalIcon } from '@phosphor-icons/react/dist/csr/SlidersHorizontal'
import StandardCard from './StandardCard'
import SubjectColumn from './SubjectColumn'
import { GRADE_BANDS, groupByDomain } from '../data/dataLoader'
import { getCompareMode, sortGradeBands } from '../data/compareLogic'
import styles from './CompareView.module.css'

/**
 * CompareView - Multi-column comparison of standards
 * 
 * Two modes:
 * 1. Multi-subject (1-3 subjects, 1 grade band): 
 *    - Uses SubjectColumn with independent domain accordions
 *    - Each column scrolls independently
 *    - No cross-column domain alignment
 * 
 * 2. Multi-grade band (1 subject, 1-6 grade bands / grade-level bands):
 *    - Aligned domain rows across columns
 *    - Shared accordion state
 */
function CompareView({
    standards,
    subjects = [],           // Selected subject slugs
    selectedBands = [],      // Selected grade bands
    subjectMap = {},         // slug -> name mapping
    expandedDomains = {},    // For multi-band mode
    onToggleDomain,          // For multi-band mode
    onAdjustFilters
}) {
    const navigate = useNavigate()
    const compareMode = getCompareMode(subjects, selectedBands)
    const [differenceMode, setDifferenceMode] = useState(false)

    // Build current condition summary
    const conditionSummary = useMemo(() => {
        const parts = []
        if (subjects.length > 0) {
            const names = subjects.map(s => subjectMap[s] || s)
            parts.push(names.join(' + '))
        }
        if (selectedBands.length > 0) {
            const bandNames = selectedBands.map(b => GRADE_BANDS[b]?.label || b)
            parts.push(bandNames.join(' + '))
        }
        return parts.join(' · ')
    }, [subjects, selectedBands, subjectMap])

    // Keep all hooks above the conditional mode return so switching between
    // subject and grade-band comparisons never changes hook order.
    const sortedBands = useMemo(() => sortGradeBands(selectedBands), [selectedBands])
    const columnData = useMemo(() => {
        const subjectSlug = subjects[0]
        return sortedBands.map(band => {
            const bandStandards = standards.filter(
                s => s.grade_band === band && (subjects.length === 0 || s.subject_slug === subjectSlug)
            )
            return {
                key: band,
                title: GRADE_BANDS[band]?.label || band,
                subtitle: GRADE_BANDS[band]?.range,
                standards: bandStandards,
                byDomain: groupByDomain(bandStandards)
            }
        })
    }, [standards, subjects, sortedBands])
    const allDomains = useMemo(() => {
        const domainSet = new Set()
        columnData.forEach(col => {
            Object.keys(col.byDomain).forEach(domain => domainSet.add(domain))
        })
        return Array.from(domainSet)
    }, [columnData])
    const domainDifferenceCount = useMemo(() => allDomains.filter(domain => {
        const counts = columnData.map(col => (col.byDomain[domain] || []).length)
        return new Set(counts).size > 1
    }).length, [allDomains, columnData])
    const canCompareDifferences = compareMode === 'gradeBands' && columnData.length > 1

    useEffect(() => {
        if (!canCompareDifferences) setDifferenceMode(false)
    }, [canCompareDifferences])

    // ============================================
    // MULTI-SUBJECT MODE (Independent Columns)
    // ============================================
    if (compareMode === 'subjects') {
        const band = selectedBands[0]
        const bandLabel = GRADE_BANDS[band]?.label || band

        return (
            <div className={`${styles['compare-view']} ${styles['compare-view-subjects']}`} data-kb-feature="compare-view">
                {/* Compare Condition Bar */}
                <div className={styles['compare-condition-bar']}>
                    <div className={styles['condition-info']}>
                        <span className={styles['condition-label']}>当前对比</span>
                        <span className={styles['condition-value']}>{conditionSummary}</span>
                    </div>
                    <button
                        className={`btn btn-secondary ${styles['btn-sm']}`}
                        onClick={onAdjustFilters || (() => navigate(-1))}
                    >
                        <SlidersHorizontalIcon size={17} aria-hidden="true" />
                        调整对比条件
                    </button>
                </div>

                {/* Multi-Column Grid (Independent Scrolling) */}
                <div className={`${styles['compare-columns']} ${styles[`columns-${subjects.length}`]}`}>
                    {subjects.map(subjectSlug => {
                        // Filter standards for this subject and band
                        const columnStandards = standards.filter(
                            s => s.subject_slug === subjectSlug && s.grade_band === band
                        )

                        return (
                            <SubjectColumn
                                key={subjectSlug}
                                subjectSlug={subjectSlug}
                                subjectName={subjectMap[subjectSlug] || subjectSlug}
                                gradeBand={bandLabel}
                                standards={columnStandards}
                                defaultExpandFirst={true}
                                quickPreview={true}
                            />
                        )
                    })}
                </div>
            </div>
        )
    }

    // ============================================
    // MULTI-GRADE BAND MODE (Aligned Rows)
    // ============================================

    return (
        <div
            className={`${styles['compare-view']} ${styles['compare-view-bands']} ${differenceMode ? styles['is-difference-mode'] : ''}`}
            data-kb-feature="compare-view"
            data-kb-difference-mode={differenceMode || undefined}
        >
            {/* Compare Condition Bar */}
            <div className={styles['compare-condition-bar']}>
                <div className={styles['condition-info']}>
                    <span className={styles['condition-label']}>当前对比</span>
                    <span className={styles['condition-value']}>{conditionSummary}</span>
                </div>
                <div className={styles['compare-toolbar-actions']}>
                    {canCompareDifferences ? (
                        <button
                            type="button"
                            className={`${styles['difference-toggle']} ${differenceMode ? styles.active : ''}`}
                            aria-pressed={differenceMode}
                            onClick={() => setDifferenceMode(current => !current)}
                        >
                            <span aria-hidden="true"></span>
                            {differenceMode ? '退出差异模式' : '突出差异'}
                        </button>
                    ) : null}
                    <button
                        className={`btn btn-secondary ${styles['btn-sm']}`}
                        onClick={onAdjustFilters || (() => navigate(-1))}
                    >
                        <SlidersHorizontalIcon size={17} aria-hidden="true" />
                        调整对比条件
                    </button>
                </div>
            </div>

            <AnimatePresence initial={false}>
                {differenceMode ? (
                    <m.div
                        className={styles['difference-summary']}
                        role="status"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <span aria-hidden="true"></span>
                        {domainDifferenceCount} 个领域存在标准数量差异；行顺序保持不变
                    </m.div>
                ) : null}
            </AnimatePresence>

            {/* Sticky Header */}
            <div className={`${styles['compare-header']} ${styles[`columns-${columnData.length}`]}`}>
                {columnData.map(col => {
                    const bandInfo = GRADE_BANDS[col.key] || {}
                    return (
                        <div
                            key={col.key}
                            className={styles['compare-column-header']}
                            style={{
                                '--band-color': bandInfo.color,
                                '--band-bg': bandInfo.bgColor
                            }}
                        >
                            <h3 className={styles['column-title']}>{col.title}</h3>
                            {col.subtitle && (
                                <span className={styles['column-subtitle']}>{col.subtitle}</span>
                            )}
                            <span className={styles['column-count']}>{col.standards.length} 条标准</span>
                        </div>
                    )
                })}
            </div>

            {/* Domains (Aligned Rows) */}
            <div>
                {allDomains.map(domain => {
                    const isExpanded = expandedDomains[domain] !== false
                    const domainCounts = columnData.map(col => (col.byDomain[domain] || []).length)
                    const hasDifference = new Set(domainCounts).size > 1

                    return (
                        <div
                            key={domain}
                            className={`${styles['compare-domain-group']} ${differenceMode ? (hasDifference ? styles['has-difference'] : styles['is-shared']) : ''}`}
                            data-kb-domain-difference={differenceMode ? (hasDifference ? 'different' : 'shared') : undefined}
                        >
                            {/* Domain Header - spans all columns */}
                            <button
                                className={styles['compare-domain-header']}
                                onClick={() => onToggleDomain?.(domain)}
                                type="button"
                                aria-expanded={isExpanded}
                            >
                                <span className={styles['domain-name']}>{domain}</span>
                                <span className={styles['domain-header-end']}>
                                    <AnimatePresence initial={false}>
                                        {differenceMode ? (
                                            <m.span
                                                key="difference-marker"
                                                className={styles['domain-difference-marker']}
                                                initial={{ opacity: 0, x: 5 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: 4 }}
                                                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                                            >
                                                {hasDifference ? `数量差异 · ${domainCounts.join(' / ')}` : '结构一致'}
                                            </m.span>
                                        ) : null}
                                    </AnimatePresence>
                                    {isExpanded
                                        ? <CaretUpIcon className={styles['domain-toggle']} size={16} aria-hidden="true" />
                                        : <CaretDownIcon className={styles['domain-toggle']} size={16} aria-hidden="true" />}
                                </span>
                            </button>

                            {/* Domain Content - columns */}
                            {isExpanded && (
                                <div className={`${styles['compare-domain-content']} ${styles[`columns-${columnData.length}`]}`}>
                                    {columnData.map(col => {
                                        const domainStandards = col.byDomain[domain] || []
                                        return (
                                            <div key={col.key} className={styles['compare-column']}>
                                                {differenceMode ? (
                                                    <span className={styles['column-difference-label']}>
                                                        {col.title} · {domainStandards.length} 条
                                                    </span>
                                                ) : null}
                                                {domainStandards.length > 0 ? (
                                                    <div className={styles['standards-column-list']}>
                                                        {domainStandards.map(std => (
                                                            <StandardCard
                                                                key={std.code}
                                                                standard={std}
                                                                quickPreview={true}
                                                                contextLabel={`${col.title}${col.subtitle ? ` · ${col.subtitle}` : ''}`}
                                                            />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className={styles['column-empty']}>
                                                        <span>该学段无此领域标准</span>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {allDomains.length === 0 && (
                <div className={styles['compare-empty']}>
                    <p>没有找到符合条件的标准</p>
                </div>
            )}
        </div>
    )
}

export default CompareView
