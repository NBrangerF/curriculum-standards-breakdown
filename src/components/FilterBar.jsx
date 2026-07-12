import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChartBarIcon } from '@phosphor-icons/react/dist/csr/ChartBar'
import {
    getSubjectsFromManifest,
    getSelectableGradeBands,
    getSkillsMeta
} from '../data/dataLoader'
import { QUERY_PARAMS } from '../data/query'
import {
    addSubject,
    addGradeBand,
    toggleSkill,
    isValidCompareSelection,
    getValidationMessage,
    DEFAULT_COMPARE_STATE
} from '../data/compareLogic'
import { Toast, useTransientToast } from '../ui/primitives/Toast'
import { Disclosure, DisclosureIndicator } from '../ui/primitives/Disclosure'
import styles from './FilterBar.module.css'

function FilterBar({
    showSubjects = true,
    showGradeBands = true,
    showSkills = false,
    showKeyword = true,
    onFilterChange,
    initialFilters = {}
}) {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()

    // Initialize from URL or defaults
    const [filters, setFilters] = useState(() => {
        const urlSubjects = searchParams.get(QUERY_PARAMS.SUBJECTS)
        const urlBands = searchParams.get(QUERY_PARAMS.BANDS)
        const urlSkills = searchParams.get(QUERY_PARAMS.SKILLS)
        const urlKeyword = searchParams.get(QUERY_PARAMS.KEYWORD)

        return {
            subjects: urlSubjects?.split(',').filter(Boolean) || initialFilters.subjects || [],
            gradeBands: urlBands?.split(',').map(b => b.toUpperCase()).filter(Boolean) || initialFilters.gradeBands || [],
            skills: urlSkills?.split(',').map(s => s.toUpperCase()).filter(Boolean) || initialFilters.skills || [],
            keyword: urlKeyword || initialFilters.keyword || ''
        }
    })

    const subjects = getSubjectsFromManifest()
    const skills = getSkillsMeta()
    const gradeBands = getSelectableGradeBands()

    const [keyword, setKeyword] = useState(filters.keyword || '')
    const { toast, showToast, dismissToast } = useTransientToast()
    const [skillsExpanded, setSkillsExpanded] = useState(false)

    useEffect(() => {
        if (onFilterChange) {
            onFilterChange(filters)
        }
    }, [filters, onFilterChange])

    const handleSubjectToggle = (slug) => {
        const result = addSubject(
            { subjects: filters.subjects, gradeBands: filters.gradeBands },
            slug
        )
        setFilters(prev => ({
            ...prev,
            subjects: result.subjects,
            gradeBands: result.gradeBands
        }))
        if (result.message) {
            showToast(result.message)
        }
    }

    const handleGradeBandToggle = (band) => {
        const result = addGradeBand(
            { subjects: filters.subjects, gradeBands: filters.gradeBands },
            band
        )
        setFilters(prev => ({
            ...prev,
            subjects: result.subjects,
            gradeBands: result.gradeBands
        }))
        if (result.message) {
            showToast(result.message)
        }
    }

    const handleSkillToggle = (code) => {
        setFilters(prev => ({
            ...prev,
            skills: toggleSkill(prev.skills, code)
        }))
    }

    const handleKeywordChange = (e) => {
        setKeyword(e.target.value)
    }

    const handleKeywordSubmit = (e) => {
        e.preventDefault()
        setFilters(prev => ({ ...prev, keyword: keyword.trim() }))
    }

    const handleSearch = () => {
        if (!isValidCompareSelection(filters.subjects, filters.gradeBands)) {
            return
        }
        const params = new URLSearchParams()
        params.set(QUERY_PARAMS.MODE, 'compare')
        if (filters.subjects.length) {
            params.set(QUERY_PARAMS.SUBJECTS, filters.subjects.join(','))
        }
        if (filters.gradeBands.length) {
            params.set(QUERY_PARAMS.BANDS, filters.gradeBands.join(','))
        }
        if (filters.skills.length) {
            params.set(QUERY_PARAMS.SKILLS, filters.skills.join(','))
        }
        if (filters.keyword?.trim()) {
            params.set(QUERY_PARAMS.KEYWORD, filters.keyword.trim())
        }
        navigate(`/search?${params.toString()}`)
    }

    const handleClear = () => {
        setFilters({ ...DEFAULT_COMPARE_STATE, keyword: '' })
        setKeyword('')
    }

    const isValid = isValidCompareSelection(filters.subjects, filters.gradeBands)
    const validationMessage = getValidationMessage(filters.subjects, filters.gradeBands)
    const hasFilters = filters.subjects.length > 0 || filters.gradeBands.length > 0 || filters.skills.length > 0 || filters.keyword

    return (
        <div className={styles['filter-bar']} data-kb-component="filter-bar">
            <Toast message={toast?.message} tone={toast?.tone} onDismiss={dismissToast} />

            {showKeyword && (
                <form className={`${styles['filter-section']} ${styles['keyword-section']}`} onSubmit={handleKeywordSubmit}>
                    <input
                        type="text"
                        className={`input ${styles['keyword-input']}`}
                        aria-label="搜索课程标准关键词"
                        placeholder="输入关键词搜索标准..."
                        value={keyword}
                        onChange={handleKeywordChange}
                    />
                </form>
            )}

            {showSubjects && (
                <div className={`${styles['filter-section']} ${styles['filter-section-primary']}`}>
                    <h4 className={`${styles['filter-label']} ${styles['filter-label-lg']}`}>学科</h4>
                    <p className={styles['filter-hint']}>选择 1-3 个学科</p>
                    <div className={`${styles['filter-options']} ${styles['filter-options-primary']}`}>
                        {subjects.map(subj => (
                            <label
                                key={subj.subject_slug}
                                className={`checkbox-item ${styles['checkbox-item-lg']} ${filters.subjects?.includes(subj.subject_slug) ? styles.active : ''}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={filters.subjects?.includes(subj.subject_slug) || false}
                                    onChange={() => handleSubjectToggle(subj.subject_slug)}
                                />
                                <span>{subj.subject}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {showGradeBands && (
                <div className={`${styles['filter-section']} ${styles['filter-section-secondary']}`}>
                    <h4 className={`${styles['filter-label']} ${styles['filter-label-md']}`}>学段</h4>
                    <p className={styles['filter-hint']}>
                        {filters.subjects?.length > 1
                            ? '多学科时只能选1个学段'
                            : '选择 1-6 个学段/年级'}
                    </p>
                    <div className={`${styles['filter-options']} ${styles['filter-options-secondary']}`}>
                        {gradeBands.map(([key, info]) => (
                            <label
                                key={key}
                                className={`checkbox-item ${styles['checkbox-item-md']} ${filters.gradeBands?.includes(key) ? styles.active : ''}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={filters.gradeBands?.includes(key) || false}
                                    onChange={() => handleGradeBandToggle(key)}
                                />
                                <span>{info.label}</span>
                                <span className={styles['filter-badge']}>{info.range}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {showSkills && (
                <div className={`${styles['filter-section']} ${styles['filter-section-tertiary']}`}>
                    <Disclosure
                        isExpanded={skillsExpanded}
                        onExpandedChange={setSkillsExpanded}
                        triggerClassName={styles['skills-accordion-header']}
                        panelClassName={`${styles['filter-options']} ${styles['filter-options-tertiary']}`}
                        panelId="filter-transferable-skills"
                        trigger={({ isExpanded }) => (
                            <>
                                <span className={styles['accordion-title']}>
                                    <DisclosureIndicator isExpanded={isExpanded} className={styles['accordion-icon']} />
                                    可迁移技能
                                    <span className={styles['optional-badge']}>可选</span>
                                </span>
                                {filters.skills?.length > 0 ? <span className={styles['selected-count']}>{filters.skills.length} 个已选</span> : null}
                            </>
                        )}
                    >
                        {skills.map(skill => (
                            <label
                                key={skill.code}
                                className={`checkbox-item ${styles['checkbox-item-sm']} ${styles['skill-option']} ${filters.skills?.includes(skill.code) ? styles.active : ''}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={filters.skills?.includes(skill.code) || false}
                                    onChange={() => handleSkillToggle(skill.code)}
                                />
                                <span className={styles['skill-code-badge']}>{skill.code}</span>
                                <span>{skill.name_cn}</span>
                            </label>
                        ))}
                    </Disclosure>
                </div>
            )}

            <div className={styles['filter-actions']}>
                <div className={styles['action-group']}>
                    <button
                        className={`btn btn-primary btn-lg ${!isValid ? styles.disabled : ''}`}
                        onClick={handleSearch}
                        disabled={!isValid}
                        data-kb-telemetry-task="search_results"
                    >
                        <ChartBarIcon size={19} aria-hidden="true" />
                        查看对比结果
                    </button>
                    {!isValid && validationMessage && (
                        <span className={styles['validation-hint']} role="status">{validationMessage}</span>
                    )}
                </div>
                {hasFilters && (
                    <button className="btn btn-ghost" onClick={handleClear}>
                        重置
                    </button>
                )}
            </div>
        </div>
    )
}

export default FilterBar
