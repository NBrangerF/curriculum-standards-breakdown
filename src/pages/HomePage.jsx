import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
    loadManifest,
    loadSubjectsMeta,
    loadSkillsMeta,
    loadSkillToSubjectsIndex,
    getSubjectsFromManifest,
    getSkillsMeta,
    SUBJECT_COLORS,
    SKILL_COLORS,
    getSelectableGradeBands
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
import { useUiV2 } from '../components/RouteUiBoundary.jsx'
import { Toast, useTransientToast } from '../ui/primitives/Toast'
import { Disclosure, DisclosureIndicator } from '../ui/primitives/Disclosure'
import styles from './HomePage.module.css'

const HomeNarrativeSection = lazy(() => import('../components/HomeNarrativeSection.jsx'))

function HomeNarrativePlaceholder() {
    return (
        <div
            className={styles['home-narrative-placeholder']}
            data-kb-component="home-narrative-placeholder"
            aria-hidden="true"
        >
            <div className={`${styles['home-narrative-placeholder-stage']} container`}>
                <div className={styles['home-narrative-placeholder-copy']}>
                    <i></i>
                    <b></b>
                    <b></b>
                    <span></span>
                    <span></span>
                </div>
                <div className={styles['home-narrative-placeholder-index']}>
                    {Array.from({ length: 4 }, (_, index) => <i key={index}></i>)}
                </div>
                <div className={styles['home-narrative-placeholder-map']}>
                    {Array.from({ length: 4 }, (_, index) => (
                        <div key={index} style={{ '--placeholder-width': `${100 - index * 10}%` }}>
                            <i></i>
                            <span></span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

function HomeNarrativeGate(props) {
    const gateRef = useRef(null)
    const [enabled, setEnabled] = useState(false)

    useEffect(() => {
        if (!('IntersectionObserver' in window)) {
            setEnabled(true)
            return undefined
        }
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                setEnabled(true)
                observer.disconnect()
            }
        }, { rootMargin: '700px 0px' })
        if (gateRef.current) observer.observe(gateRef.current)
        return () => observer.disconnect()
    }, [])

    return (
        <div className={styles['home-narrative-gate']} ref={gateRef} data-kb-component="home-narrative-gate">
            {enabled ? (
                <Suspense fallback={<HomeNarrativePlaceholder />}>
                    <HomeNarrativeSection {...props} />
                </Suspense>
            ) : <HomeNarrativePlaceholder />}
        </div>
    )
}

function HomePage() {
    const { enabled: uiV2Enabled } = useUiV2()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [subjects, setSubjects] = useState([])
    const [skills, setSkills] = useState([])
    const [skillSubjects, setSkillSubjects] = useState({})

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

    const { toast, showToast, dismissToast } = useTransientToast()

    // Skills accordion state
    const [skillsExpanded, setSkillsExpanded] = useState(false)

    useEffect(() => {
        Promise.all([
            loadManifest(),
            loadSubjectsMeta(),
            loadSkillsMeta(),
            loadSkillToSubjectsIndex()
        ])
            .then(([, , , skillSubjectIndex]) => {
                setSubjects(getSubjectsFromManifest())
                setSkills(getSkillsMeta())
                setSkillSubjects(skillSubjectIndex || {})
                setLoading(false)
            })
            .catch(err => {
                setError(err.message)
                setLoading(false)
            })
    }, [])

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

    const gradeBands = getSelectableGradeBands()
    const standardCount = subjects.reduce((total, subject) => total + Number(subject.record_count || 0), 0)

    return (
        <div className={styles['home-page']} data-kb-route="home">
            <Toast message={toast?.message} tone={toast?.tone} onDismiss={dismissToast} />

            {/* Hero Banner - New TS-style component */}
            <HomeHeroBanner
                scrollTargetId="compare-filter"
            />

            {/* Compare Filter Section */}
            <section className={styles['filter-section']} id="compare-filter">
                <div className="container">
                    <div className={styles['section-header']}>
                        <h2>对比筛选</h2>
                        <p>选择学科和学段/年级进行对比，支持 1-3 学科对比同一单元，或同一学科跨 1-6 个学段/年级对比</p>
                    </div>
                    <div className={`${styles['filter-card']} card`}>
                        <div className={styles['card-body']}>
                            {/* Subjects - Most prominent */}
                            <div className={`${styles['filter-group']} ${styles['filter-group-primary']}`}>
                                <h3 className={styles['filter-label']}>学科</h3>
                                <p className={styles['filter-hint']}>选择 1-3 个学科进行对比</p>
                                <div className={`${styles['filter-options']} ${styles['filter-options-primary']}`}>
                                    {subjects.map(subj => (
                                        <label
                                            key={subj.subject_slug}
                                            className={`${styles['checkbox-item']} ${filters.subjects.includes(subj.subject_slug) ? styles.active : ''}`}
                                            style={{ '--subject-color': SUBJECT_COLORS[subj.subject_slug] }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={filters.subjects.includes(subj.subject_slug)}
                                                onChange={() => handleSubjectToggle(subj.subject_slug)}
                                            />
                                            <span>{subj.subject}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Grade Bands - Second prominent */}
                            <div className={`${styles['filter-group']} ${styles['filter-group-secondary']}`}>
                                <h3 className={styles['filter-label']}>学段</h3>
                                <p className={styles['filter-hint']}>
                                    {filters.subjects.length > 1
                                        ? '多学科对比时只能选择1个学段'
                                        : '选择 1-6 个学段/年级进行对比'}
                                </p>
                                <div className={`${styles['filter-options']} ${styles['filter-options-secondary']}`}>
                                    {gradeBands.map(([key, info]) => (
                                        <label
                                            key={key}
                                            className={`${styles['checkbox-item']} ${filters.gradeBands.includes(key) ? styles.active : ''}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={filters.gradeBands.includes(key)}
                                                onChange={() => handleBandToggle(key)}
                                            />
                                            <span>{info.label}</span>
                                            <span className={styles['filter-badge']}>{info.range}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Skills - Collapsible accordion */}
                            <div className={`${styles['filter-group']} ${styles['filter-group-tertiary']}`}>
                                <Disclosure
                                    isExpanded={skillsExpanded}
                                    onExpandedChange={setSkillsExpanded}
                                    triggerClassName={styles['skills-accordion-header']}
                                    panelClassName={`${styles['filter-options']} ${styles['filter-options-tertiary']}`}
                                    panelId="home-skill-filter-options"
                                    trigger={({ isExpanded }) => (
                                        <>
                                            <span className={styles['accordion-title']}>
                                                <DisclosureIndicator isExpanded={isExpanded} className={styles['accordion-icon']} />
                                                可迁移技能
                                                <span className={styles['optional-badge']}>可选</span>
                                            </span>
                                            {filters.skills.length > 0 ? <span className={styles['selected-count']}>{filters.skills.length} 个已选</span> : null}
                                        </>
                                    )}
                                >
                                    {skills.map(skill => (
                                        <label
                                            key={skill.code}
                                            className={`${styles['checkbox-item']} ${styles['skill-option']} ${filters.skills.includes(skill.code) ? styles.active : ''}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={filters.skills.includes(skill.code)}
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
                                        className={`btn btn-primary btn-lg ${!isValid ? styles.disabled : ''}`}
                                        onClick={handleCompare}
                                        disabled={!isValid}
                                    >
                                        查看对比结果
                                    </button>
                                    {!isValid && validationMessage && (
                                        <span className={styles['validation-hint']}>{validationMessage}</span>
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
            <section className={styles['subjects-section']} id="subjects-section">
                <div className="container">
                    <div className={styles['section-header']}>
                        <h2>学科入口</h2>
                        <p>点击学科卡片，浏览该学科的所有课程标准</p>
                    </div>
                    <div className={styles['subjects-grid']}>
                        {subjects.map(subject => (
                            <Link
                                key={subject.subject_slug}
                                to={`/subjects/${subject.subject_slug}`}
                                className={styles['subject-card']}
                                style={{ '--subject-color': SUBJECT_COLORS[subject.subject_slug] }}
                                aria-label={subject.subject}
                                aria-describedby={`subject-preview-${subject.subject_slug}`}
                            >
                                <div className={styles['subject-card-accent']}></div>
                                <div className={styles['subject-card-copy']}>
                                    <h3 className={styles['subject-name']}>{subject.subject}</h3>
                                    <span className={styles['subject-preview']} id={`subject-preview-${subject.subject_slug}`}>
                                        <span>{subject.record_count} 条标准 · {Object.keys(subject.domains || {}).length} 个领域</span>
                                        <small>{Object.keys(subject.domains || {}).slice(0, 3).join(' · ')}</small>
                                    </span>
                                </div>
                                <svg className={styles['subject-arrow']} viewBox="0 0 20 20" aria-hidden="true">
                                    <path d="M4 10h11M11 5l5 5-5 5" />
                                </svg>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {uiV2Enabled ? (
                <HomeNarrativeGate
                    subjectCount={subjects.length}
                    standardCount={standardCount}
                    skillCount={skills.length}
                />
            ) : null}

            {/* Developer API */}
            <section className={styles['api-section']} aria-labelledby="home-api-title">
                <div className={`container ${styles['api-layout']}`}>
                    <div className={styles['api-copy']}>
                        <span className={styles['api-eyebrow']}>KEBIAO API · V1</span>
                        <h2 id="home-api-title">课程标准，也可以成为你的产品能力</h2>
                        <p>通过 API 检索 {standardCount.toLocaleString('zh-CN')} 条结构化标准、读取进阶关系，并将教学计划匹配到真实课程要求。</p>
                        <div className={styles['api-actions']}>
                            <Link to="/api" className="btn btn-primary btn-lg">
                                查看 API
                                <svg className={styles['inline-arrow']} viewBox="0 0 20 20" aria-hidden="true">
                                    <path d="M4 10h11M11 5l5 5-5 5" />
                                </svg>
                            </Link>
                            <a href="/api/v1/docs" className={styles['api-docs-link']}>完整接口文档</a>
                        </div>
                    </div>
                    <div className={styles['api-console']} aria-label="API 能力示例">
                        <div className={styles['api-console-header']}>
                            <span>api.kebiao / v1</span>
                            <i aria-hidden="true"></i>
                        </div>
                        <div className={styles['api-endpoints']}>
                            <code><b>POST</b><span>/standards/search</span><small>检索标准</small></code>
                            <code><b>GET</b><span>/standards/&#123;code&#125;/progression</span><small>读取进阶</small></code>
                            <code><b>POST</b><span>/matching/plan-to-standards</span><small>匹配计划</small></code>
                        </div>
                        <div className={styles['api-console-meta']}>
                            <span>{subjects.length} subjects</span>
                            <span>{standardCount.toLocaleString('en-US')} standards</span>
                            <span>OpenAPI 3.1</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Skills Section */}
            <section className={styles['skills-section']}>
                <div className="container">
                    <div className={styles['section-header']}>
                        <h2>可迁移技能</h2>
                        <p>学生能跨学科、跨情境迁移运用的能力与素养</p>
                    </div>
                    <div className={styles['skills-grid']}>
                        {skills.map(skill => (
                            <Link
                                key={skill.code}
                                to={`/skills/${skill.code}`}
                                className={styles['skill-preview-card']}
                                style={{ '--skill-color': SKILL_COLORS[skill.code] }}
                                aria-label={skill.name_cn}
                                aria-describedby={`skill-preview-${skill.code}`}
                            >
                                <div className={styles['skill-card-header']}>
                                    <TSBadge tsId={skill.code} size="md" variant="solid" />
                                </div>
                                <h3 className={styles['skill-name']}>{skill.name_cn}</h3>
                                <p className={styles['skill-tagline']}>{skill.tagline_cn}</p>
                                <span className={styles['skill-relation-hint']} id={`skill-preview-${skill.code}`}>
                                    连接 {(skillSubjects[skill.code] || []).length} 个学科
                                    <i aria-hidden="true"></i>
                                    {skill.subskills?.length || 0} 项子技能
                                </span>
                            </Link>
                        ))}
                    </div>
                    <div className={styles['skills-cta']}>
                        <Link to="/skills" className="btn btn-secondary btn-lg">
                            查看全部可迁移技能
                            <svg className={styles['inline-arrow']} viewBox="0 0 20 20" aria-hidden="true">
                                <path d="M4 10h11M11 5l5 5-5 5" />
                            </svg>
                        </Link>
                    </div>
                </div>
            </section>

            {/* How to Use Section */}
            <section className={styles['howto-section']}>
                <div className="container">
                    <div className={styles['section-header']}>
                        <h2>如何使用</h2>
                    </div>
                    <div className={styles['howto-grid']}>
                        <div className={styles['howto-card']}>
                            <div className={styles['howto-icon']}>1</div>
                            <h3>选择学科与学段</h3>
                            <p>通过首页筛选或直接进入学科页面，选择你关注的学科和年级范围</p>
                        </div>
                        <div className={styles['howto-card']}>
                            <div className={styles['howto-icon']}>2</div>
                            <h3>对比课程标准</h3>
                            <p>选择多个学科或多个学段进行并列对比，快速发现跨学科/跨学段关联</p>
                        </div>
                        <div className={styles['howto-card']}>
                            <div className={styles['howto-icon']}>3</div>
                            <h3>关注可迁移技能</h3>
                            <p>查看每条标准关联的可迁移技能，设计跨学科整合的教学活动</p>
                        </div>
                        <div className={styles['howto-card']}>
                            <div className={styles['howto-icon']}>4</div>
                            <h3>分享对比结果</h3>
                            <p>对比状态保存在URL中，可直接分享链接给同事或学生</p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}

export default HomePage
