import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import {
    loadManifest,
    loadMultipleSubjectStandards,
    loadSkillsMeta,
    getSubjectsFromManifest,
    getSkillsMeta,
    GRADE_BANDS
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
import './SearchResultsPage.css'

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
    const [toast, setToast] = useState(null)
    const [showFilterPanel, setShowFilterPanel] = useState(false)
    const [skillsExpanded, setSkillsExpanded] = useState(false)
    const [expandedDomains, setExpandedDomains] = useState({})

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
        let result = allStandards || []

        // Filter by grade bands
        if (safeApplied.gradeBands.length > 0) {
            result = result.filter(s => safeApplied.gradeBands.includes(s?.grade_band))
        }

        // Filter by skills
        if (safeApplied.skills.length > 0) {
            result = result.filter(s => {
                const stdSkills = s?.transferable_skills?.map(t => t.code) || []
                return safeApplied.skills.some(code => stdSkills.includes(code))
            })
        }

        return result
    }, [allStandards, appliedFilters])

    // ============================================
    // TOAST
    // ============================================
    const showToast = useCallback((message) => {
        if (!message) return
        setToast(message)
        setTimeout(() => setToast(null), 3000)
    }, [])

    // ============================================
    // DRAFT HANDLERS (Only update draft, not applied)
    // ============================================

    const handleSubjectToggle = useCallback((slug) => {
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
        setShowFilterPanel(false)
    }, [draftFilters, setSearchParams, showToast])

    const handleReset = useCallback(() => {
        // Reset draft to applied
        setDraftFilters({ ...appliedFilters })
    }, [appliedFilters])

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
    const gradeBandsList = Object.entries(GRADE_BANDS)

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
        <div className="search-results-page">
            {/* Toast */}
            {toast && (
                <div className="compare-toast">
                    <span>{toast}</span>
                </div>
            )}

            {/* Header */}
            <section className="search-header">
                <div className="container">
                    <Link to="/" className="back-link">← 返回首页</Link>
                    <h1>📊 对比视图</h1>
                    <div className="header-actions">
                        <button
                            className="btn btn-secondary"
                            onClick={() => {
                                // Open panel and reset draft to applied
                                setDraftFilters({ ...appliedFilters })
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
                <section className="filter-section">
                    <div className="container">
                        <div className="filter-card card">
                            <div className="card-body">
                                {/* Draft vs Applied indicator */}
                                {draftChanged && (
                                    <div className="draft-indicator">
                                        <span>⚠️ 有未应用的更改</span>
                                    </div>
                                )}

                                {/* Subjects - Primary */}
                                <div className="filter-group filter-group-primary">
                                    <h4 className="filter-label filter-label-lg">学科</h4>
                                    <p className="filter-hint">选择 1-3 个学科</p>
                                    <div className="filter-options filter-options-primary">
                                        {(subjects || []).map(subj => (
                                            <label
                                                key={subj.subject_slug}
                                                className={`checkbox-item checkbox-item-lg ${(draftFilters.subjects || []).includes(subj.subject_slug) ? 'active' : ''
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
                                <div className="filter-group filter-group-secondary">
                                    <h4 className="filter-label filter-label-md">学段</h4>
                                    <p className="filter-hint">
                                        {(draftFilters.subjects || []).length > 1
                                            ? '多学科时只能选1个学段'
                                            : '选择 1-3 个学段'}
                                    </p>
                                    <div className="filter-options filter-options-secondary">
                                        {gradeBandsList.map(([key, info]) => (
                                            <label
                                                key={key}
                                                className={`checkbox-item checkbox-item-md ${(draftFilters.gradeBands || []).includes(key) ? 'active' : ''
                                                    }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={(draftFilters.gradeBands || []).includes(key)}
                                                    onChange={() => handleBandToggle(key)}
                                                />
                                                <span>{info.label}</span>
                                                <span className="filter-badge">{info.range}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Skills - Tertiary accordion */}
                                <div className="filter-group filter-group-tertiary">
                                    <button
                                        className="skills-accordion-header"
                                        onClick={() => setSkillsExpanded(!skillsExpanded)}
                                        type="button"
                                    >
                                        <span className="accordion-title">
                                            <span className="accordion-icon">{skillsExpanded ? '▼' : '▶'}</span>
                                            可迁移技能
                                            <span className="optional-badge">可选</span>
                                        </span>
                                        {(draftFilters.skills || []).length > 0 && (
                                            <span className="selected-count">{draftFilters.skills.length} 个已选</span>
                                        )}
                                    </button>
                                    {skillsExpanded && (
                                        <div className="filter-options filter-options-tertiary">
                                            {(skills || []).map(skill => (
                                                <label
                                                    key={skill.code}
                                                    className={`checkbox-item checkbox-item-sm skill-option ${(draftFilters.skills || []).includes(skill.code) ? 'active' : ''
                                                        }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={(draftFilters.skills || []).includes(skill.code)}
                                                        onChange={() => handleSkillToggle(skill.code)}
                                                    />
                                                    <span className="skill-code-badge">{skill.code}</span>
                                                    <span>{skill.name_cn}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="filter-actions">
                                    <div className="action-group">
                                        <button
                                            className={`btn btn-primary ${!draftValid || !draftChanged ? 'disabled' : ''}`}
                                            onClick={handleApply}
                                            disabled={!draftValid || !draftChanged}
                                        >
                                            应用筛选
                                        </button>
                                        {!draftValid && draftValidationMessage && (
                                            <span className="validation-hint">{draftValidationMessage}</span>
                                        )}
                                        {draftValid && !draftChanged && (
                                            <span className="validation-hint">当前无更改</span>
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
            <section className="results-section">
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
