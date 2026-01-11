import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import StandardCard from './StandardCard'
import SubjectColumn from './SubjectColumn'
import { GRADE_BANDS, SUBJECT_COLORS, groupByDomain } from '../data/dataLoader'
import { getCompareMode } from '../data/compareLogic'
import './CompareView.css'

/**
 * CompareView - Multi-column comparison of standards
 * 
 * Two modes:
 * 1. Multi-subject (1-3 subjects, 1 grade band): 
 *    - Uses SubjectColumn with independent domain accordions
 *    - Each column scrolls independently
 *    - No cross-column domain alignment
 * 
 * 2. Multi-grade band (1 subject, 1-3 grade bands):
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

    // ============================================
    // MULTI-SUBJECT MODE (Independent Columns)
    // ============================================
    if (compareMode === 'subjects') {
        const band = selectedBands[0]
        const bandLabel = GRADE_BANDS[band]?.label || band

        return (
            <div className="compare-view compare-view-subjects">
                {/* Compare Condition Bar */}
                <div className="compare-condition-bar">
                    <div className="condition-info">
                        <span className="condition-label">当前对比:</span>
                        <span className="condition-value">{conditionSummary}</span>
                    </div>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={onAdjustFilters || (() => navigate(-1))}
                    >
                        调整对比条件
                    </button>
                </div>

                {/* Multi-Column Grid (Independent Scrolling) */}
                <div className={`compare-columns columns-${subjects.length}`}>
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

    // Fixed grade band order: H1 (left) → H2 (center) → H3 (right)
    const GRADE_BAND_ORDER = { H1: 1, H2: 2, H3: 3 }

    // Sort bands by fixed order
    const sortedBands = useMemo(() => {
        return [...selectedBands].sort((a, b) =>
            (GRADE_BAND_ORDER[a] || 99) - (GRADE_BAND_ORDER[b] || 99)
        )
    }, [selectedBands])

    // Group data by grade band (columns) - using sorted bands
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

    // Get all domains across all columns
    const allDomains = useMemo(() => {
        const domainSet = new Set()
        columnData.forEach(col => {
            Object.keys(col.byDomain).forEach(d => domainSet.add(d))
        })
        return Array.from(domainSet)
    }, [columnData])

    return (
        <div className="compare-view compare-view-bands">
            {/* Compare Condition Bar */}
            <div className="compare-condition-bar">
                <div className="condition-info">
                    <span className="condition-label">当前对比:</span>
                    <span className="condition-value">{conditionSummary}</span>
                </div>
                <button
                    className="btn btn-secondary btn-sm"
                    onClick={onAdjustFilters || (() => navigate(-1))}
                >
                    调整对比条件
                </button>
            </div>

            {/* Sticky Header */}
            <div className={`compare-header columns-${columnData.length}`}>
                {columnData.map(col => {
                    const bandInfo = GRADE_BANDS[col.key] || {}
                    return (
                        <div
                            key={col.key}
                            className="compare-column-header"
                            style={{
                                '--band-color': bandInfo.color,
                                '--band-bg': bandInfo.bgColor
                            }}
                        >
                            <h3 className="column-title">{col.title}</h3>
                            {col.subtitle && (
                                <span className="column-subtitle">{col.subtitle}</span>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Domains (Aligned Rows) */}
            <div className="compare-body">
                {allDomains.map(domain => {
                    const isExpanded = expandedDomains[domain] !== false

                    return (
                        <div key={domain} className="compare-domain-group">
                            {/* Domain Header - spans all columns */}
                            <button
                                className={`compare-domain-header ${isExpanded ? 'expanded' : ''}`}
                                onClick={() => onToggleDomain?.(domain)}
                            >
                                <span className="domain-name">{domain}</span>
                                <span className={`domain-toggle ${isExpanded ? 'up' : 'down'}`}>▼</span>
                            </button>

                            {/* Domain Content - columns */}
                            {isExpanded && (
                                <div className={`compare-domain-content columns-${columnData.length}`}>
                                    {columnData.map(col => {
                                        const domainStandards = col.byDomain[domain] || []
                                        return (
                                            <div key={col.key} className="compare-column">
                                                {domainStandards.length > 0 ? (
                                                    <div className="standards-column-list">
                                                        {domainStandards.map(std => (
                                                            <StandardCard key={std.id} standard={std} />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="column-empty">
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
                <div className="compare-empty">
                    <p>没有找到符合条件的标准</p>
                </div>
            )}
        </div>
    )
}

export default CompareView
