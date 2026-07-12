import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { ChartBarIcon } from '@phosphor-icons/react/dist/csr/ChartBar'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle'
import {
    loadManifest,
    loadMultipleSubjectStandards,
    loadSkillsMeta,
    getSubjectsFromManifest,
    getSkillsMeta,
    filterStandards,
    GRADE_BANDS,
    getSelectableGradeBands
} from '../data/dataLoader'
import { QUERY_PARAMS, buildShareableURL } from '../data/query'
import {
    toggleSkill,
    isValidCompareSelection,
    getValidationMessage,
    normalizeCompareSelection,
    ensureSafeFilters,
    filtersAreDifferent,
    sortGradeBands,
    DEFAULT_COMPARE_STATE
} from '../data/compareLogic'
import CompareView from '../components/CompareView'
import { LoadingState, ErrorState, EmptyState, CopyLinkButton } from '../components/StateComponents'
import { Toast, useTransientToast } from '../ui/primitives/Toast'
import { Disclosure, DisclosureIndicator } from '../ui/primitives/Disclosure'
import styles from './SearchResultsPage.module.css'

/**
 * Parse filters from URL with safe defaults
 */
function parseFiltersFromURL(searchParams) {
    const urlSubjects = searchParams.get(QUERY_PARAMS.SUBJECTS)
    const urlBands = searchParams.get(QUERY_PARAMS.BANDS)
    const urlSkills = searchParams.get(QUERY_PARAMS.SKILLS)

    return ensureSafeFilters({
        subjects: urlSubjects?.split(',').filter(Boolean) || [],
        gradeBands: sortGradeBands(urlBands?.split(',').map(b => b.toUpperCase()).filter(Boolean) || []),
        skills: urlSkills?.split(',').map(s => s.toUpperCase()).filter(Boolean) || []
    })
}

function SearchResultsPage() {
    const [searchParams, setSearchParams] = useSearchParams()
    const navigate = useNavigate()
    const [loading, setLoading] = useState(true)
    const [standardsLoading, setStandardsLoading] = useState(false)
    const [error, setError] = useState(null)

    const [subjects, setSubjects] = useState([])
    const [skills, setSkills] = useState([])
    const [allStandards, setAllStandards] = useState([])

    // ============================================
    // DRAFT-APPLY PATTERN (Core Fix)
    // ============================================

    // Applied filters: What's currently being displayed (from URL)
    const [appliedFilters, setAppliedFilters] = useState(() => {
        const parsed = parseFiltersFromURL(searchParams)
        // If URL has no filters, use defaults
        if (parsed.subjects.length === 0 && parsed.gradeBands.length === 0) {
            return ensureSafeFilters(DEFAULT_COMPARE_STATE)
        }
        return parsed
    })

    // Draft filters: What user is editing in the panel (not yet applied)
    const [draftFilters, setDraftFilters] = useState(() => ({ ...appliedFilters }))

    // UI state
    const { toast, showToast, dismissToast } = useTransientToast()
    const [showFilterPanel, setShowFilterPanel] = useState(false)
    const [skillsExpanded, setSkillsExpanded] = useState(false)
    const [expandedDomains, setExpandedDomains] = useState({})
    const [clearedDraft, setClearedDraft] = useState(null)

    // Has draft changed from applied?
    const draftChanged = useMemo(() =>
        filtersAreDifferent(draftFilters, appliedFilters),
        [draftFilters, appliedFilters]
    )

    // Is draft valid?
    const draftValid = useMemo(() =>
        isValidCompareSelection(draftFilters.subjects, draftFilters.gradeBands),
        [draftFilters.subjects, draftFilters.gradeBands]
    )

    // Validation message for draft
    const draftValidationMessage = useMemo(() =>
        getValidationMessage(draftFilters.subjects, draftFilters.gradeBands),
        [draftFilters.subjects, draftFilters.gradeBands]
    )

    // ============================================
    // DATA LOADING
    // ============================================

    useEffect(() => {
        Promise.all([loadManifest(), loadSkillsMeta()])
            .then(() => {
                setSubjects(getSubjectsFromManifest())
                setSkills(getSkillsMeta())
                setLoading(false)
            })
            .catch(err => {
                setError(err.message)
                setLoading(false)
            })
    }, [])

    // Load standards based on APPLIED subjects (not draft)
    useEffect(() => {
        if (!subjects.length) return
        const safeApplied = ensureSafeFilters(appliedFilters)
        if (safeApplied.subjects.length === 0) return

        setStandardsLoading(true)
        loadMultipleSubjectStandards(safeApplied.subjects)
            .then(standards => {
                setAllStandards(standards || [])
                setStandardsLoading(false)
            })
            .catch(err => {
                console.error('Failed to load standards:', err)
                setAllStandards([])
                setStandardsLoading(false)
            })
    }, [subjects, appliedFilters.subjects])

    // Filter standards by APPLIED filters (with guards)
    const filteredStandards = useMemo(() => {
        const safeApplied = ensureSafeFilters(appliedFilters)
        return filterStandards(allStandards || [], {
            gradeBands: safeApplied.gradeBands,
            skills: safeApplied.skills
        })
    }, [allStandards, appliedFilters])

    // ============================================
    // DRAFT HANDLERS (Only update draft, not applied)
    // ============================================

    const handleSubjectToggle = useCallback((slug) => {
        setClearedDraft(null)
        setDraftFilters(prev => {
            const safe = ensureSafeFilters(prev)
            const isSelected = safe.subjects.includes(slug)

            // Build new draft
            const newDraft = {
                ...safe,
                subjects: isSelected
                    ? safe.subjects.filter(s => s !== slug)
                    : [...safe.subjects, slug]
            }

            // Normalize with lastChanged = 'subjects'
            const normalized = normalizeCompareSelection(newDraft, 'subjects')

            // Show toast if auto-corrected
            if (normalized.message) {
                showToast(normalized.message)
            }

            return {
                subjects: normalized.subjects,
                gradeBands: normalized.gradeBands,
                skills: safe.skills
            }
        })
    }, [showToast])

    const handleBandToggle = useCallback((band) => {
        setClearedDraft(null)
        setDraftFilters(prev => {
            const safe = ensureSafeFilters(prev)
            const isSelected = safe.gradeBands.includes(band)

            // Build new draft
            const newDraft = {
                ...safe,
                gradeBands: isSelected
                    ? safe.gradeBands.filter(b => b !== band)
                    : [...safe.gradeBands, band]
            }

            // Normalize with lastChanged = 'bands'
            const normalized = normalizeCompareSelection(newDraft, 'bands')

            // Show toast if auto-corrected
            if (normalized.message) {
                showToast(normalized.message)
            }

            return {
                subjects: normalized.subjects,
                gradeBands: normalized.gradeBands,
                skills: safe.skills
            }
        })
    }, [showToast])

    const handleSkillToggle = useCallback((code) => {
        setClearedDraft(null)
        setDraftFilters(prev => {
            const safe = ensureSafeFilters(prev)
            return {
                ...safe,
                skills: toggleSkill(safe.skills, code)
            }
        })
    }, [])

    // ============================================
    // APPLY / RESET
    // ============================================

    const handleApply = useCallback(() => {
        // Final normalization before apply
        const normalized = normalizeCompareSelection(draftFilters)
        const safe = ensureSafeFilters({
            subjects: normalized.subjects,
            gradeBands: normalized.gradeBands,
            skills: draftFilters.skills
        })

        // Validate
        if (!isValidCompareSelection(safe.subjects, safe.gradeBands)) {
            showToast(getValidationMessage(safe.subjects, safe.gradeBands))
            return
        }

        // Update URL
        const params = new URLSearchParams()
        params.set(QUERY_PARAMS.MODE, 'compare')
        if (safe.subjects.length) {
            params.set(QUERY_PARAMS.SUBJECTS, safe.subjects.join(','))
        }
        if (safe.gradeBands.length) {
            params.set(QUERY_PARAMS.BANDS, safe.gradeBands.join(','))
        }
        if (safe.skills.length) {
            params.set(QUERY_PARAMS.SKILLS, safe.skills.join(','))
        }
        setSearchParams(params, { replace: true })

        // Apply to state
        setAppliedFilters(safe)
        setDraftFilters(safe)
        setClearedDraft(null)
        setShowFilterPanel(false)
    }, [draftFilters, setSearchParams, showToast])

    const handleReset = useCallback(() => {
        // Reset draft to applied
        setDraftFilters({ ...appliedFilters })
        setClearedDraft(null)
        showToast('已撤销未应用的筛选更改')
    }, [appliedFilters, showToast])

    const handleClearDraft = useCallback(() => {
        const safeDraft = ensureSafeFilters(draftFilters)
        if (!safeDraft.subjects.length && !safeDraft.gradeBands.length && !safeDraft.skills.length) return
        setClearedDraft(safeDraft)
        setDraftFilters({ subjects: [], gradeBands: [], skills: [] })
        showToast('已批量清除筛选条件，可使用撤销恢复')
    }, [draftFilters, showToast])

    const handleUndoClear = useCallback(() => {
        if (!clearedDraft) return
        setDraftFilters(clearedDraft)
        setClearedDraft(null)
        showToast('已恢复清除前的筛选条件')
    }, [clearedDraft, showToast])

    const handleRemoveDraftFilter = useCallback((type, value) => {
        setClearedDraft(null)
        setDraftFilters(prev => ({
            ...ensureSafeFilters(prev),
            [type]: ensureSafeFilters(prev)[type].filter(item => item !== value)
        }))
    }, [])

    const handleToggleDomain = useCallback((domain) => {
        setExpandedDomains(prev => ({
            ...prev,
            [domain]: prev[domain] === false ? true : false
        }))
    }, [])

    // ============================================
    // BUILD MAPS
    // ============================================

    const subjectMap = useMemo(() =>
        Object.fromEntries((subjects || []).map(s => [s.subject_slug, s.subject])),
        [subjects]
    )

    const safeApplied = ensureSafeFilters(appliedFilters)
    const shareableURL = buildShareableURL(appliedFilters, '/search')
    const gradeBandsList = getSelectableGradeBands()

    // ============================================
    // RENDER GUARDS
    // ============================================

    if (loading) {
        return (
            <div className="page-content container">
                <LoadingState message="加载筛选器数据..." />
            </div>
        )
    }

    if (error) {
        return (
            <div className="page-content container">
                <ErrorState
                    title="数据加载失败"
                    message={error}
                    onRetry={() => window.location.reload()}
                />
            </div>
        )
    }

    // Guard: Invalid applied state → show EmptyState (not crash)
    const appliedValid = isValidCompareSelection(safeApplied.subjects, safeApplied.gradeBands)

    return (
        <div className={styles['search-results-page']} data-kb-route="search">
            <Toast message={toast?.message} tone={toast?.tone} onDismiss={dismissToast} />

            {/* Header */}
            <section className={styles['search-header']}>
                <div className="container">
                    <Link to="/" className={styles.backLink}>← 返回首页</Link>
                    <h1><ChartBarIcon size="0.82em" weight="light" aria-hidden="true" />对比视图</h1>
                    <div className={styles['header-actions']}>
                        <button
                            className="btn btn-secondary"
                            onClick={() => {
                                // Open panel and reset draft to applied
                                setDraftFilters({ ...appliedFilters })
                                setClearedDraft(null)
                                setShowFilterPanel(!showFilterPanel)
                            }}
                        >
                            {showFilterPanel ? '收起筛选' : '调整对比条件'}
                        </button>
                        <CopyLinkButton url={shareableURL} />
                    </div>
                </div>
            </section>

            {/* Filter Panel (Draft Mode) */}
            {showFilterPanel && (
                <section className={styles['filter-section']} data-kb-component="search-filter-panel">
                    <div className="container">
                        <div className={`${styles['filter-card']} card`}>
                            <div className="card-body">
                                <div className={styles['selection-toolbar']} aria-label="已选筛选条件" data-kb-component="search-filter-selection-toolbar">
                                    <div className={styles['selection-summary']}>
                                        <span className={styles['selection-label']}>已选条件</span>
                                        <div className={styles['selection-chips']}>
                                            {draftFilters.subjects.map(slug => (
                                                <button
                                                    type="button"
                                                    key={`subject-${slug}`}
                                                    onClick={() => handleRemoveDraftFilter('subjects', slug)}
                                                    aria-label={`移除筛选条件 ${subjects.find(item => item.subject_slug === slug)?.subject || slug}`}
                                                >
                                                    {subjects.find(item => item.subject_slug === slug)?.subject || slug}<span aria-hidden="true">×</span>
                                                </button>
                                            ))}
                                            {draftFilters.gradeBands.map(band => (
                                                <button
                                                    type="button"
                                                    key={`band-${band}`}
                                                    onClick={() => handleRemoveDraftFilter('gradeBands', band)}
                                                    aria-label={`移除筛选条件 ${GRADE_BANDS[band]?.label || band}`}
                                                >
                                                    {GRADE_BANDS[band]?.label || band}<span aria-hidden="true">×</span>
                                                </button>
                                            ))}
                                            {draftFilters.skills.map(code => (
                                                <button
                                                    type="button"
                                                    key={`skill-${code}`}
                                                    onClick={() => handleRemoveDraftFilter('skills', code)}
                                                    aria-label={`移除筛选条件 ${code}`}
                                                >
                                                    {code}<span aria-hidden="true">×</span>
                                                </button>
                                            ))}
                                            {!draftFilters.subjects.length && !draftFilters.gradeBands.length && !draftFilters.skills.length ? (
                                                <span className={styles['selection-empty']}>尚未选择条件</span>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className={styles['selection-actions']}>
                                        {clearedDraft ? (
                                            <button type="button" className={styles['undo-clear-button']} onClick={handleUndoClear}>撤销清除</button>
                                        ) : null}
                                        <button
                                            type="button"
                                            className={styles['clear-all-button']}
                                            onClick={handleClearDraft}
                                            disabled={!draftFilters.subjects.length && !draftFilters.gradeBands.length && !draftFilters.skills.length}
                                        >
                                            批量清除
                                        </button>
                                    </div>
                                </div>

                                {/* Draft vs Applied indicator */}
                                {draftChanged && (
                                    <div className={styles['draft-indicator']}>
                                        <span><WarningCircleIcon size={17} aria-hidden="true" />有未应用的更改</span>
                                    </div>
                                )}

                                {/* Subjects - Primary */}
                                <div className={`${styles['filter-group']} ${styles['filter-group-primary']}`}>
                                    <h4 className={`${styles['filter-label']} ${styles['filter-label-lg']}`}>学科</h4>
                                    <p className={styles['filter-hint']}>选择 1-3 个学科</p>
                                    <div className={`${styles['filter-options']} ${styles['filter-options-primary']}`}>
                                        {(subjects || []).map(subj => (
                                            <label
                                                key={subj.subject_slug}
                                                className={`checkbox-item ${styles['checkbox-item-lg']} ${(draftFilters.subjects || []).includes(subj.subject_slug) ? styles.active : ''
                                                    }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={(draftFilters.subjects || []).includes(subj.subject_slug)}
                                                    onChange={() => handleSubjectToggle(subj.subject_slug)}
                                                />
                                                <span>{subj.subject}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Grade Bands - Secondary */}
                                <div className={`${styles['filter-group']} ${styles['filter-group-secondary']}`}>
                                    <h4 className={`${styles['filter-label']} ${styles['filter-label-md']}`}>学段</h4>
                                    <p className={styles['filter-hint']}>
                                        {(draftFilters.subjects || []).length > 1
                                            ? '多学科时只能选1个学段'
                                            : '选择 1-6 个学段/年级'}
                                    </p>
                                    <div className={`${styles['filter-options']} ${styles['filter-options-secondary']}`}>
                                        {gradeBandsList.map(([key, info]) => (
                                            <label
                                                key={key}
                                                className={`checkbox-item ${styles['checkbox-item-md']} ${(draftFilters.gradeBands || []).includes(key) ? styles.active : ''
                                                    }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={(draftFilters.gradeBands || []).includes(key)}
                                                    onChange={() => handleBandToggle(key)}
                                                />
                                                <span>{info.label}</span>
                                                <span className={styles['filter-badge']}>{info.range}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Skills - Tertiary accordion */}
                                <div className={`${styles['filter-group']} ${styles['filter-group-tertiary']}`}>
                                    <Disclosure
                                        isExpanded={skillsExpanded}
                                        onExpandedChange={setSkillsExpanded}
                                        triggerClassName={styles['skills-accordion-header']}
                                        panelClassName={`${styles['filter-options']} ${styles['filter-options-tertiary']}`}
                                        panelId="search-skill-filter-options"
                                        trigger={({ isExpanded }) => (
                                            <>
                                                <span className={styles['accordion-title']}>
                                                    <DisclosureIndicator isExpanded={isExpanded} className={styles['accordion-icon']} />
                                                    可迁移技能
                                                    <span className={styles['optional-badge']}>可选</span>
                                                </span>
                                                {(draftFilters.skills || []).length > 0 ? <span className={styles['selected-count']}>{draftFilters.skills.length} 个已选</span> : null}
                                            </>
                                        )}
                                    >
                                        {(skills || []).map(skill => (
                                            <label
                                                key={skill.code}
                                                className={`checkbox-item ${styles['checkbox-item-sm']} ${styles['skill-option']} ${(draftFilters.skills || []).includes(skill.code) ? styles.active : ''
                                                    }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={(draftFilters.skills || []).includes(skill.code)}
                                                    onChange={() => handleSkillToggle(skill.code)}
                                                />
                                                <span className={styles['skill-code-badge']}>{skill.code}</span>
                                                <span>{skill.name_cn}</span>
                                            </label>
                                        ))}
                                    </Disclosure>
                                </div>

                                {/* Actions */}
                                <div className={styles['filter-actions']}>
                                    <div className={styles['action-group']}>
                                        <button
                                            className={`btn btn-primary ${!draftValid || !draftChanged ? styles.disabled : ''}`}
                                            onClick={handleApply}
                                            disabled={!draftValid || !draftChanged}
                                        >
                                            应用筛选
                                        </button>
                                        {!draftValid && draftValidationMessage && (
                                            <span className={styles['validation-hint']}>{draftValidationMessage}</span>
                                        )}
                                        {draftValid && !draftChanged && (
                                            <span className={styles['validation-hint']}>当前无更改</span>
                                        )}
                                    </div>
                                    <button className="btn btn-ghost" onClick={handleReset}>
                                        重置
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Compare View (Uses APPLIED filters only) */}
            <section className={styles['results-section']}>
                <div className="container">
                    {standardsLoading ? (
                        <LoadingState message="加载标准数据..." />
                    ) : !appliedValid ? (
                        <EmptyState
                            title="请选择对比条件"
                            message="请选择至少1个学科和1个学段"
                        />
                    ) : (
                        <CompareView
                            standards={filteredStandards}
                            subjects={safeApplied.subjects}
                            selectedBands={safeApplied.gradeBands}
                            subjectMap={subjectMap}
                            expandedDomains={expandedDomains}
                            onToggleDomain={handleToggleDomain}
                            onAdjustFilters={() => {
                                setDraftFilters({ ...appliedFilters })
                                setClearedDraft(null)
                                setShowFilterPanel(true)
                            }}
                        />
                    )}
                </div>
            </section>
        </div>
    )
}

export default SearchResultsPage
