import { lazy, Suspense, useCallback, useState, useEffect, useMemo } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import {
    loadSkillsMeta,
    loadManifest,
    loadMultipleSubjectStandards,
    getSkillByCode,
    getSubjectsFromManifest,
    filterStandards,
    SKILL_COLORS
} from '../data/dataLoader'
import GradeBandTabs from '../components/GradeBandTabs'
import StandardCard from '../components/StandardCard'
import TSHeroBanner from '../components/TSHeroBanner'
import { LoadingState, ErrorState, EmptyState, ResultStats, CopyLinkButton } from '../components/StateComponents'
import { useUiV2 } from '../components/RouteUiBoundary.jsx'
import { buildShareableURL, mergeGraphStateIntoURL, parseGraphStateFromURL } from '../data/query'
import { runViewTransition } from '../utils/viewTransition.js'
import styles from './SkillDetailPage.module.css'

const SkillsGraphWorkspace = lazy(() => import('../features/graph/SkillsGraphWorkspace.jsx'))
const GRAPH_RELATION_TYPES = Object.freeze(['contains', 'progression', 'skill_alignment'])

function SkillDetailPage() {
    const { enabled: uiV2Enabled } = useUiV2()
    const { code } = useParams()
    const [searchParams, setSearchParams] = useSearchParams()
    const [loading, setLoading] = useState(true)
    const [standardsLoading, setStandardsLoading] = useState(false)
    const [error, setError] = useState(null)
    const [selectedBands, setSelectedBands] = useState([])
    const [selectedSubjects, setSelectedSubjects] = useState([])

    const [skill, setSkill] = useState(null)
    const [subjects, setSubjects] = useState([])
    const [allStandards, setAllStandards] = useState([])
    const searchKey = searchParams.toString()
    const graphState = useMemo(() => parseGraphStateFromURL(new URLSearchParams(searchKey)), [searchKey])
    const graphActive = uiV2Enabled && graphState.view === 'graph'

    // Initial load - skill meta and manifest
    useEffect(() => {
        setLoading(true)
        Promise.all([loadSkillsMeta(), loadManifest()])
            .then(() => {
                const foundSkill = getSkillByCode(code)
                setSkill(foundSkill)
                setSubjects(getSubjectsFromManifest())
                setLoading(false)
            })
            .catch(err => {
                setError(err.message)
                setLoading(false)
            })
    }, [code])

    // Load standards when subjects change
    useEffect(() => {
        if (!subjects.length) return

        const slugsToLoad = selectedSubjects.length > 0
            ? selectedSubjects
            : subjects.map(s => s.subject_slug)

        setStandardsLoading(true)
        loadMultipleSubjectStandards(slugsToLoad)
            .then(standards => {
                setAllStandards(standards)
                setStandardsLoading(false)
            })
            .catch(err => {
                console.error('Failed to load standards:', err)
                setStandardsLoading(false)
            })
    }, [subjects, selectedSubjects])

    // Filter standards for this skill
    const filteredStandards = useMemo(() => {
        const filters = { skills: [code] }
        if (selectedBands.length > 0) filters.gradeBands = selectedBands
        return filterStandards(allStandards, filters)
    }, [allStandards, code, selectedBands])

    // Stats by subject
    const statsBySubject = useMemo(() => {
        const stats = {}
        filteredStandards.forEach(s => {
            const subj = s.subject || '其他'
            stats[subj] = (stats[subj] || 0) + 1
        })
        return stats
    }, [filteredStandards])

    const skillColor = SKILL_COLORS[code]

    const toggleSubject = (slug) => {
        setSelectedSubjects(prev =>
            prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
        )
    }

    const setViewMode = (mode) => {
        runViewTransition(() => setSearchParams(mergeGraphStateIntoURL(searchParams, mode === 'graph' ? {
            view: 'graph',
            selectedNode: `skill:${code.toLowerCase()}`,
            focusDepth: 1,
            relationTypes: [...GRAPH_RELATION_TYPES],
            compareSelection: []
        } : {}), { replace: false }))
    }

    const updateGraphState = useCallback((partial, options = {}) => {
        const current = parseGraphStateFromURL(new URLSearchParams(searchParams))
        const next = { ...current, ...partial, view: 'graph' }
        setSearchParams(mergeGraphStateIntoURL(searchParams, next), { replace: options.replace === true })
    }, [searchParams, setSearchParams])

    // Build shareable URL for current filters
    const shareableURL = useMemo(() => {
        return buildShareableURL({
            skills: [code],
            gradeBands: selectedBands,
            subjects: selectedSubjects
        }, '/search')
    }, [code, selectedBands, selectedSubjects])

    if (loading) {
        return (
            <div className="page-content container">
                <LoadingState message="加载技能信息..." />
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

    if (!skill) {
        return (
            <div className="page-content container">
                <ErrorState
                    title="技能未找到"
                    message={`找不到代码为 ${code} 的技能信息`}
                />
                <div className={styles['not-found-actions']}>
                    <Link to="/skills" className="btn btn-primary">返回技能列表</Link>
                </div>
            </div>
        )
    }

    return (
        <div className={styles['skill-detail-page']} style={{ '--skill-color': skillColor }} data-kb-route="skill-detail">
            {/* Skill Hero Banner - New Component */}
            <TSHeroBanner
                tsCode={skill.code}
                titleCN={skill.name_cn}
                titleEN={skill.name_en}
                definition={skill.tagline_cn}
                themeColor={skillColor}
                backLink="/skills"
                backLabel="← 返回技能列表"
            />

            <section className={styles['skill-definition-section']}>
                <div className="container">
                    <div className={styles['definition-content']}>
                        <span className={styles['skill-section-kicker']}>Definition</span>
                        <h2>技能定义</h2>
                        <p className={styles['definition-text']}>{skill.definition_cn}</p>
                    </div>

                    {skill.look_fors && skill.look_fors.length > 0 && (
                        <div className={styles['look-fors']}>
                            <span className={styles['skill-section-index']}>01</span>
                            <h3>学生表现证据 <small>Look-fors</small></h3>
                            <ul className={styles['look-fors-list']}>
                                {skill.look_fors.map((item, idx) => (
                                    <li key={idx}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {skill.teacher_moves && skill.teacher_moves.length > 0 && (
                        <div className={styles['teacher-moves']}>
                            <span className={styles['skill-section-index']}>02</span>
                            <h3>教师策略 <small>Teacher Moves</small></h3>
                            <ul className={styles['teacher-moves-list']}>
                                {skill.teacher_moves.map((item, idx) => (
                                    <li key={idx}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {skill.progression_notes && (
                        <div className={styles['progression-notes']}>
                            <span className={styles['skill-section-index']}>03</span>
                            <h3>进阶说明 <small>Progression</small></h3>
                            <p>{skill.progression_notes}</p>
                        </div>
                    )}
                </div>
            </section>

            {skill.subskills && skill.subskills.length > 0 && (
                <section className={styles['subskills-section']}>
                    <div className="container">
                        <div className={styles['skill-section-heading']}>
                            <div><span className={styles['skill-section-kicker']}>Taxonomy</span><h2>子技能</h2></div>
                            <p>{skill.subskills.length} 个可观察、可教学的能力分支</p>
                        </div>
                        <div className={styles['subskills-grid']}>
                            {skill.subskills.map(sub => (
                                <div key={sub.code} className={styles['subskill-card']} style={{ '--skill-color': skillColor }}>
                                    <div className={styles['subskill-header']}>
                                        <span className={styles['subskill-code']}>{sub.code}</span>
                                        <h4 className={styles['subskill-name']}>{sub.name_cn}</h4>
                                        <span className={styles['subskill-name-en']}>{sub.name_en}</span>
                                    </div>
                                    <p className={styles['subskill-tagline']}>{sub.tagline_cn}</p>
                                    <p className={styles['subskill-definition']}>{sub.definition_cn}</p>

                                    {sub.look_fors && sub.look_fors.length > 0 && (
                                        <div className={styles['subskill-lookfors']}>
                                            <strong>表现证据：</strong>
                                            <ul>
                                                {sub.look_fors.map((item, idx) => (
                                                    <li key={idx}>{item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            <section className={styles['related-standards-section']}>
                <div className="container">
                    <div className={styles['section-header-row']}>
                        <div>
                            <span className={styles['skill-section-kicker']}>Curriculum Index</span>
                            <h2>关联的课程标准</h2>
                            <p className={styles['section-desc']}>
                                以下标准的主标签或次标签包含 <strong>{skill.code}</strong> 或其子技能
                            </p>
                        </div>
                        <div className={styles['skill-standards-actions']}>
                            {!graphActive ? <CopyLinkButton url={shareableURL} /> : null}
                            <div className={styles['skill-view-switch']} aria-label="关联标准浏览视图">
                                <button type="button" className={!graphActive ? styles['is-active'] : ''} aria-pressed={!graphActive} onClick={() => setViewMode('list')}>列表</button>
                                {uiV2Enabled ? <button type="button" className={graphActive ? styles['is-active'] : ''} aria-pressed={graphActive} onClick={() => setViewMode('graph')}>关系图谱</button> : null}
                            </div>
                        </div>
                    </div>

                    <div style={{ viewTransitionName: 'kb-view-surface' }}>
                    {graphActive ? (
                        <div className={styles['skill-detail-graph-shell']}>
                            <Suspense fallback={(
                                <div className={styles['skill-detail-graph-loading']} aria-live="polite"><span></span><p>正在加载技能关系图谱</p></div>
                            )}>
                                <SkillsGraphWorkspace
                                    graphState={graphState}
                                    onGraphStateChange={updateGraphState}
                                    providedStandards={allStandards}
                                    lockedSkillCode={skill.code}
                                    lockedSkillLabel={`${skill.code} · ${skill.name_cn}`}
                                />
                            </Suspense>
                        </div>
                    ) : <>
                    <div className={styles['standards-filters']}>
                        <div className={styles['filter-group']}>
                            <h4>学段</h4>
                            <GradeBandTabs
                                selected={selectedBands}
                                onChange={setSelectedBands}
                            />
                        </div>

                        <div className={styles['filter-group']}>
                            <h4>学科</h4>
                            <div className={styles['subject-filters']}>
                                {subjects.map(subj => (
                                    <button
                                        key={subj.subject_slug}
                                        className={`${styles['subject-filter-btn']} ${selectedSubjects.includes(subj.subject_slug) ? styles.active : ''}`}
                                        onClick={() => toggleSubject(subj.subject_slug)}
                                    >
                                        {subj.subject}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Stats */}
                    <ResultStats
                        total={allStandards.length}
                        filtered={filteredStandards.length}
                        label="条相关标准"
                        breakdown={Object.keys(statsBySubject).length > 1 ? statsBySubject : null}
                    />

                    {/* Standards List */}
                    {standardsLoading ? (
                        <LoadingState message="加载标准数据..." size="small" />
                    ) : (
                        <div className={styles['standards-list']}>
                            {filteredStandards.slice(0, 50).map(std => (
                                <StandardCard key={std.code} standard={std} />
                            ))}
                            {filteredStandards.length > 50 && (
                                <div className={styles['load-more-hint']}>
                                    显示前 50 条结果，请使用筛选缩小范围
                                </div>
                            )}
                        </div>
                    )}

                    {!standardsLoading && filteredStandards.length === 0 && (
                        <EmptyState
                            title="没有找到相关标准"
                            message="尝试调整筛选条件或选择其他学科"
                            action={() => { setSelectedBands([]); setSelectedSubjects([]) }}
                            actionLabel="清除筛选"
                        />
                    )}
                    </>}
                    </div>
                </div>
            </section>
        </div>
    )
}

export default SkillDetailPage
