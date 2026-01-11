import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
    loadManifest,
    loadSubjectsMeta,
    loadSkillsMeta,
    getSubjectsFromManifest,
    getSkillsMeta,
    SUBJECT_COLORS,
    SKILL_COLORS,
    GRADE_BANDS
} from '../data/dataLoader'
import {
    serializeFiltersToURL,
    QUERY_PARAMS
} from '../data/query'
import {
    addSubject,
    addGradeBand,
    toggleSkill,
    isValidCompareSelection,
    getValidationMessage,
    DEFAULT_COMPARE_STATE
} from '../data/compareLogic'
import { LoadingState, ErrorState } from '../components/StateComponents'
import TSBadge from '../components/TSBadge'
import HomeHeroBanner from '../components/HomeHeroBanner'
import './HomePage.css'

function HomePage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [subjects, setSubjects] = useState([])
    const [skills, setSkills] = useState([])

    // Compare mode state
    const [filters, setFilters] = useState(() => {
        // Try to restore from URL, otherwise use defaults
        const urlSubjects = searchParams.get(QUERY_PARAMS.SUBJECTS)
        const urlBands = searchParams.get(QUERY_PARAMS.BANDS)
        const urlSkills = searchParams.get(QUERY_PARAMS.SKILLS)

        if (urlSubjects || urlBands) {
            return {
                subjects: urlSubjects?.split(',').filter(Boolean) || [],
                gradeBands: urlBands?.split(',').map(b => b.toUpperCase()).filter(Boolean) || [],
                skills: urlSkills?.split(',').map(s => s.toUpperCase()).filter(Boolean) || []
            }
        }
        return { ...DEFAULT_COMPARE_STATE }
    })

    // Toast message for constraint violations
    const [toast, setToast] = useState(null)

    // Skills accordion state
    const [skillsExpanded, setSkillsExpanded] = useState(false)

    useEffect(() => {
        Promise.all([
            loadManifest(),
            loadSubjectsMeta(),
            loadSkillsMeta()
        ])
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

    // Show toast with auto-dismiss
    const showToast = (message) => {
        setToast(message)
        setTimeout(() => setToast(null), 3000)
    }

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

    const handleBandToggle = (band) => {
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

    const handleCompare = () => {
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
        navigate(`/search?${params.toString()}`)
    }

    const handleClear = () => {
        setFilters({ ...DEFAULT_COMPARE_STATE })
    }

    const isValid = isValidCompareSelection(filters.subjects, filters.gradeBands)
    const validationMessage = getValidationMessage(filters.subjects, filters.gradeBands)

    if (loading) {
        return (
            <div className="page-content container">
                <LoadingState message="加载课程标准数据..." />
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

    const gradeBands = Object.entries(GRADE_BANDS)

    return (
        <div className="home-page">
            {/* Toast notification */}
            {toast && (
                <div className="compare-toast">
                    <span>{toast}</span>
                </div>
            )}

            {/* Hero Banner - New TS-style component */}
            <HomeHeroBanner
                scrollTargetId="compare-filter"
                themeColor="#0891b2"
            />

            {/* Compare Filter Section */}
            <section className="filter-section" id="compare-filter">
                <div className="container">
                    <div className="section-header">
                        <h2>📊 对比筛选</h2>
                        <p>选择学科和学段进行对比，支持 1-3 学科对比同一学段，或同一学科跨 1-3 学段对比</p>
                    </div>
                    <div className="filter-card card">
                        <div className="card-body">
                            {/* Subjects - Most prominent */}
                            <div className="filter-group filter-group-primary">
                                <h4 className="filter-label filter-label-lg">学科</h4>
                                <p className="filter-hint">选择 1-3 个学科进行对比</p>
                                <div className="filter-options filter-options-primary">
                                    {subjects.map(subj => (
                                        <label
                                            key={subj.subject_slug}
                                            className={`checkbox-item checkbox-item-lg ${filters.subjects.includes(subj.subject_slug) ? 'active' : ''}`}
                                            style={{ '--subject-color': SUBJECT_COLORS[subj.subject_slug] }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={filters.subjects.includes(subj.subject_slug)}
                                                onChange={() => handleSubjectToggle(subj.subject_slug)}
                                            />
                                            <span className="checkbox-label">{subj.subject}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Grade Bands - Second prominent */}
                            <div className="filter-group filter-group-secondary">
                                <h4 className="filter-label filter-label-md">学段</h4>
                                <p className="filter-hint">
                                    {filters.subjects.length > 1
                                        ? '多学科对比时只能选择1个学段'
                                        : '选择 1-3 个学段进行对比'}
                                </p>
                                <div className="filter-options filter-options-secondary">
                                    {gradeBands.map(([key, info]) => (
                                        <label
                                            key={key}
                                            className={`checkbox-item checkbox-item-md ${filters.gradeBands.includes(key) ? 'active' : ''}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={filters.gradeBands.includes(key)}
                                                onChange={() => handleBandToggle(key)}
                                            />
                                            <span className="checkbox-label">{info.label}</span>
                                            <span className="filter-badge">{info.range}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Skills - Collapsible accordion */}
                            <div className="filter-group filter-group-tertiary">
                                <button
                                    className="skills-accordion-header"
                                    onClick={() => setSkillsExpanded(!skillsExpanded)}
                                >
                                    <span className="accordion-title">
                                        <span className="accordion-icon">{skillsExpanded ? '▼' : '▶'}</span>
                                        可迁移技能
                                        <span className="optional-badge">可选</span>
                                    </span>
                                    {filters.skills.length > 0 && (
                                        <span className="selected-count">{filters.skills.length} 个已选</span>
                                    )}
                                </button>
                                {skillsExpanded && (
                                    <div className="filter-options filter-options-tertiary">
                                        {skills.map(skill => (
                                            <label
                                                key={skill.code}
                                                className={`checkbox-item checkbox-item-sm skill-option ${filters.skills.includes(skill.code) ? 'active' : ''}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={filters.skills.includes(skill.code)}
                                                    onChange={() => handleSkillToggle(skill.code)}
                                                />
                                                <span className="skill-code-badge">{skill.code}</span>
                                                <span className="checkbox-label">{skill.name_cn}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="filter-actions">
                                <div className="action-group">
                                    <button
                                        className={`btn btn-primary btn-lg ${!isValid ? 'disabled' : ''}`}
                                        onClick={handleCompare}
                                        disabled={!isValid}
                                    >
                                        📊 查看对比结果
                                    </button>
                                    {!isValid && validationMessage && (
                                        <span className="validation-hint">{validationMessage}</span>
                                    )}
                                </div>
                                <button className="btn btn-ghost" onClick={handleClear}>
                                    重置
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Subjects Grid */}
            <section className="subjects-section" id="subjects-section">
                <div className="container">
                    <div className="section-header">
                        <h2>📚 学科入口</h2>
                        <p>点击学科卡片，浏览该学科的所有课程标准</p>
                    </div>
                    <div className="subjects-grid">
                        {subjects.map(subject => (
                            <Link
                                key={subject.subject_slug}
                                to={`/subjects/${subject.subject_slug}`}
                                className="subject-card"
                                style={{ '--subject-color': SUBJECT_COLORS[subject.subject_slug] }}
                            >
                                <div className="subject-card-accent"></div>
                                <div className="subject-card-content">
                                    <h3 className="subject-name">{subject.subject}</h3>
                                </div>
                                <div className="subject-arrow">→</div>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* Skills Section */}
            <section className="skills-section">
                <div className="container">
                    <div className="section-header">
                        <h2>🎯 可迁移技能</h2>
                        <p>学生能跨学科、跨情境迁移运用的能力与素养</p>
                    </div>
                    <div className="skills-grid">
                        {skills.map(skill => (
                            <Link
                                key={skill.code}
                                to={`/skills/${skill.code}`}
                                className="skill-preview-card"
                                style={{ '--skill-color': SKILL_COLORS[skill.code] }}
                            >
                                <div className="skill-card-header">
                                    <TSBadge tsId={skill.code} size="md" variant="solid" />
                                </div>
                                <h3 className="skill-name">{skill.name_cn}</h3>
                                <p className="skill-tagline">{skill.tagline_cn}</p>
                            </Link>
                        ))}
                    </div>
                    <div className="skills-cta">
                        <Link to="/skills" className="btn btn-secondary btn-lg">
                            查看全部可迁移技能 →
                        </Link>
                    </div>
                </div>
            </section>

            {/* How to Use Section */}
            <section className="howto-section">
                <div className="container">
                    <div className="section-header">
                        <h2>💡 如何使用</h2>
                    </div>
                    <div className="howto-grid">
                        <div className="howto-card">
                            <div className="howto-icon">1</div>
                            <h4>选择学科与学段</h4>
                            <p>通过首页筛选或直接进入学科页面，选择你关注的学科和年级范围</p>
                        </div>
                        <div className="howto-card">
                            <div className="howto-icon">2</div>
                            <h4>对比课程标准</h4>
                            <p>选择多个学科或多个学段进行并列对比，快速发现跨学科/跨学段关联</p>
                        </div>
                        <div className="howto-card">
                            <div className="howto-icon">3</div>
                            <h4>关注可迁移技能</h4>
                            <p>查看每条标准关联的可迁移技能，设计跨学科整合的教学活动</p>
                        </div>
                        <div className="howto-card">
                            <div className="howto-icon">4</div>
                            <h4>分享对比结果</h4>
                            <p>对比状态保存在URL中，可直接分享链接给同事或学生</p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}

export default HomePage
