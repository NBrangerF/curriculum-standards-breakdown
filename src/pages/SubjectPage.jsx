import { lazy, Suspense, useCallback, useState, useEffect, useMemo } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import {
    loadManifest,
    loadSubjectsMeta,
    loadSubjectStandards,
    getSubjectsFromManifest,
    getSubjectMetaBySlug,
    getSubjectStandards,
    filterStandards,
    groupByDomain,
    SUBJECT_COLORS,
    GRADE_BANDS
} from '../data/dataLoader'
import GradeBandTabs from '../components/GradeBandTabs'
import StandardCard from '../components/StandardCard'
import CompareView from '../components/CompareView'
import SubjectHeroBanner from '../components/SubjectHeroBanner'
import { LoadingState, ErrorState } from '../components/StateComponents'
import { useUiV2 } from '../components/RouteUiBoundary.jsx'
import { mergeGraphStateIntoURL, parseGraphStateFromURL } from '../data/query.js'
import { runViewTransition } from '../utils/viewTransition.js'
import styles from './SubjectPage.module.css'

const SkillsGraphWorkspace = lazy(() => import('../features/graph/SkillsGraphWorkspace.jsx'))
const GRAPH_RELATION_TYPES = Object.freeze(['contains', 'progression', 'skill_alignment'])

function SubjectPage() {
    const { enabled: uiV2Enabled } = useUiV2()
    const { slug } = useParams()
    const [searchParams, setSearchParams] = useSearchParams()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [selectedBands, setSelectedBands] = useState([])
    const [expandedDomains, setExpandedDomains] = useState({})

    const searchKey = searchParams.toString()
    const graphState = useMemo(() => parseGraphStateFromURL(new URLSearchParams(searchKey)), [searchKey])
    const requestedViewMode = graphState.view || 'list'
    const viewMode = !uiV2Enabled && requestedViewMode === 'graph' ? 'list' : requestedViewMode

    // Data
    const [subjectMeta, setSubjectMeta] = useState(null)
    const [manifestSubject, setManifestSubject] = useState(null)
    const [standards, setStandards] = useState([])

    // Load data
    useEffect(() => {
        setLoading(true)
        setError(null)

        Promise.all([
            loadManifest(),
            loadSubjectsMeta(),
            loadSubjectStandards(slug)
        ])
            .then(() => {
                setManifestSubject(getSubjectsFromManifest().find(s => s.subject_slug === slug))
                setSubjectMeta(getSubjectMetaBySlug(slug))
                setStandards(getSubjectStandards(slug))
                setLoading(false)
            })
            .catch(err => {
                setError(err.message)
                setLoading(false)
            })
    }, [slug])

    // Get available grade bands for this subject
    const availableBands = useMemo(() => {
        if (!manifestSubject?.grade_bands) return ['H1', 'H2', 'H3', 'H4G7', 'H4G8', 'H4G9']
        return Object.keys(manifestSubject.grade_bands).sort((a, b) =>
            (GRADE_BANDS[a]?.order || 0) - (GRADE_BANDS[b]?.order || 0)
        )
    }, [manifestSubject])

    // Filter and group standards
    const filteredStandards = useMemo(() => {
        if (selectedBands.length === 0) return standards
        return filterStandards(standards, { gradeBands: selectedBands })
    }, [standards, selectedBands])

    const standardsByDomain = useMemo(() => {
        return groupByDomain(filteredStandards)
    }, [filteredStandards])

    const domains = Object.keys(standardsByDomain)

    const toggleDomain = (domain) => {
        setExpandedDomains(prev => ({
            ...prev,
            [domain]: prev[domain] === false ? true : false
        }))
    }

    const expandAll = () => {
        const allExpanded = {}
        domains.forEach(d => allExpanded[d] = true)
        setExpandedDomains(allExpanded)
    }

    const collapseAll = () => {
        const allCollapsed = {}
        domains.forEach(d => allCollapsed[d] = false)
        setExpandedDomains(allCollapsed)
    }

    const setViewMode = (mode) => {
        if (mode === 'graph') {
            runViewTransition(() => setSearchParams(mergeGraphStateIntoURL(searchParams, {
                view: 'graph',
                subject: slug,
                selectedNode: `subject:${encodeURIComponent(slug.toLowerCase())}`,
                focusDepth: 2,
                relationTypes: [...GRAPH_RELATION_TYPES],
                compareSelection: []
            }), { replace: false }))
            return
        }
        runViewTransition(() => setSearchParams(mergeGraphStateIntoURL(searchParams, mode === 'compare' ? { view: 'compare' } : {}), { replace: false }))
    }

    const updateGraphState = useCallback((partial, options = {}) => {
        const current = parseGraphStateFromURL(new URLSearchParams(searchParams))
        const next = { ...current, ...partial, view: 'graph', subject: slug }
        setSearchParams(mergeGraphStateIntoURL(searchParams, next), { replace: options.replace === true })
    }, [searchParams, setSearchParams, slug])

    // In compare mode, default to all bands if none selected
    useEffect(() => {
        if (viewMode === 'compare' && selectedBands.length === 0 && availableBands.length > 0) {
            setSelectedBands(availableBands)
        }
    }, [viewMode, availableBands])

    const subjectColor = SUBJECT_COLORS[slug]

    if (loading) {
        return (
            <div className="page-content container">
                <LoadingState message={`加载${slug}学科数据...`} />
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

    if (!subjectMeta && !manifestSubject) {
        return (
            <div className="page-content container">
                <ErrorState
                    title="学科未找到"
                    message="找不到该学科的信息"
                />
                <div className={styles['not-found-actions']}>
                    <Link to="/" className="btn btn-primary">返回首页</Link>
                </div>
            </div>
        )
    }

    return (
        <div className={styles['subject-page']} data-kb-route="subject">
            {/* Subject Hero Banner - New Component */}
            <SubjectHeroBanner
                title={manifestSubject?.subject || subjectMeta?.subject_cn || slug}
                subtitle={subjectMeta?.short_description}
                stats={{
                    standardsCount: filteredStandards.length,
                    domainsCount: domains.length
                }}
                themeColor={subjectColor}
                iconKey={slug}
                backLink="/"
                backLabel="← 返回首页"
            />

            {/* Subject Description */}
            {subjectMeta && viewMode !== 'graph' ? (
                <section className={styles['subject-description']}>
                    <div className="container">
                        <div className={styles['description-grid']}>
                            <div className={styles['description-card']}>
                                <span>课程定位</span>
                                <h3>课程说明</h3>
                                <p>{subjectMeta.long_description}</p>
                            </div>
                            <div className={styles['description-card']}>
                                <span>内容组织</span>
                                <h3>内容结构</h3>
                                <p>{subjectMeta.structure_notes}</p>
                            </div>
                        </div>
                    </div>
                </section>
            ) : null}

            {/* Grade Band Filter + View Toggle */}
            <section className={`${styles['grade-band-section']} ${viewMode === 'graph' ? styles['is-graph'] : ''}`}>
                <div className="container">
                    <div className={styles['grade-band-header']}>
                        <div>
                            <span className={styles['subject-view-kicker']}>Browse Mode</span>
                            <h3>{viewMode === 'graph' ? '课程关系工作台' : '选择学段'}</h3>
                            <p>{viewMode === 'graph' ? '图谱筛选、路径与节点对比均保存在当前链接中。' : `可多选学段${viewMode === 'compare' ? '进行并列对比' : '进行筛选'}`}</p>
                        </div>
                        <div className={styles['view-toggle']}>
                            <button
                                type="button"
                                className={`${styles['view-toggle-btn']} ${viewMode === 'list' ? styles.active : ''}`}
                                aria-pressed={viewMode === 'list'}
                                onClick={() => setViewMode('list')}
                            >
                                列表视图
                            </button>
                            <button
                                type="button"
                                className={`${styles['view-toggle-btn']} ${viewMode === 'compare' ? styles.active : ''}`}
                                aria-pressed={viewMode === 'compare'}
                                onClick={() => setViewMode('compare')}
                            >
                                学段对比
                            </button>
                            {uiV2Enabled ? <button
                                type="button"
                                className={`${styles['view-toggle-btn']} ${viewMode === 'graph' ? styles.active : ''}`}
                                aria-pressed={viewMode === 'graph'}
                                onClick={() => setViewMode('graph')}
                                data-kb-telemetry-task="graph_open"
                            >
                                关系图谱
                            </button> : null}
                        </div>
                    </div>
                    {viewMode !== 'graph' ? (
                        <GradeBandTabs
                            selected={selectedBands}
                            onChange={setSelectedBands}
                            availableBands={availableBands}
                        />
                    ) : null}
                </div>
            </section>

            {/* Standards Section */}
            <div style={{ viewTransitionName: 'kb-view-surface' }}>
            {viewMode === 'graph' ? (
                <section className={styles['subject-graph-section']}>
                    <Suspense fallback={(
                        <div className={styles['subject-graph-loading']} aria-live="polite">
                            <span></span>
                            <p>正在加载学科关系图谱</p>
                        </div>
                    )}>
                        <SkillsGraphWorkspace
                            graphState={graphState}
                            onGraphStateChange={updateGraphState}
                            providedStandards={standards}
                            lockedSubjectSlug={slug}
                            lockedSubjectLabel={manifestSubject?.subject || subjectMeta?.subject_cn || slug}
                        />
                    </Suspense>
                </section>
            ) : (
                <section className={styles['standards-section']}>
                    <div className="container">
                    {viewMode === 'compare' ? (
                        /* Compare View */
                        <CompareView
                            standards={standards}
                            selectedBands={selectedBands.length > 0 ? selectedBands : availableBands}
                            expandedDomains={expandedDomains}
                            onToggleDomain={toggleDomain}
                        />
                    ) : (
                        /* List View */
                        <>
                            <div className={styles['standards-header']}>
                                <h2>课程标准</h2>
                                <div className={styles['standards-actions']}>
                                    <button type="button" className="btn btn-ghost" onClick={expandAll}>展开全部</button>
                                    <button type="button" className="btn btn-ghost" onClick={collapseAll}>收起全部</button>
                                </div>
                            </div>

                            <div className={styles['domains-list']}>
                                {domains.map(domain => {
                                    const domainStandards = standardsByDomain[domain]
                                    const isExpanded = expandedDomains[domain] !== false // default to expanded

                                    return (
                                        <div key={domain} className={styles['domain-group']}>
                                            <button
                                                type="button"
                                                className={`${styles['domain-header']} ${isExpanded ? styles.expanded : ''}`}
                                                aria-expanded={isExpanded}
                                                onClick={() => toggleDomain(domain)}
                                                style={{ '--subject-color': subjectColor }}
                                            >
                                                <div className={styles['domain-info']}>
                                                    <span className={styles['domain-name']}>{domain}</span>
                                                    <span className={styles['domain-count']}>{domainStandards.length} 条</span>
                                                </div>
                                                <span className={`${styles['domain-toggle']} ${isExpanded ? styles.up : ''}`}>▼</span>
                                            </button>

                                            {isExpanded && (
                                                <div className={`${styles['standards-list']} animate-fade-in`}>
                                                    {domainStandards.map(std => (
                                                        <StandardCard key={std.id} standard={std} />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>

                            {domains.length === 0 && (
                                <div className={styles['empty-state']}>
                                    <p>没有找到符合条件的标准</p>
                                    <button type="button" className="btn btn-secondary" onClick={() => setSelectedBands([])}>
                                        清除筛选
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                    </div>
                </section>
            )}
            </div>
        </div>
    )
}

export default SubjectPage
