import { useState, useEffect, useMemo } from 'react'
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
import './SubjectPage.css'

function SubjectPage() {
    const { slug } = useParams()
    const [searchParams, setSearchParams] = useSearchParams()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [selectedBands, setSelectedBands] = useState([])
    const [expandedDomains, setExpandedDomains] = useState({})

    // View mode: 'list' or 'compare'
    const viewMode = searchParams.get('view') || 'list'

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
        if (!manifestSubject?.grade_bands) return ['H1', 'H2', 'H3']
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
        const params = new URLSearchParams(searchParams)
        if (mode === 'list') {
            params.delete('view')
        } else {
            params.set('view', mode)
        }
        setSearchParams(params, { replace: true })
    }

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
                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                    <Link to="/" className="btn btn-primary">返回首页</Link>
                </div>
            </div>
        )
    }

    return (
        <div className="subject-page">
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
            {subjectMeta && (
                <section className="subject-description">
                    <div className="container">
                        <div className="description-grid">
                            <div className="description-card">
                                <h3>📖 课程说明</h3>
                                <p>{subjectMeta.long_description}</p>
                            </div>
                            <div className="description-card">
                                <h3>🏗️ 内容结构</h3>
                                <p>{subjectMeta.structure_notes}</p>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Grade Band Filter + View Toggle */}
            <section className="grade-band-section">
                <div className="container">
                    <div className="grade-band-header">
                        <div>
                            <h3>选择学段</h3>
                            <p>可多选学段{viewMode === 'compare' ? '进行并列对比' : '进行筛选'}</p>
                        </div>
                        <div className="view-toggle">
                            <button
                                className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                                onClick={() => setViewMode('list')}
                            >
                                📋 列表视图
                            </button>
                            <button
                                className={`view-toggle-btn ${viewMode === 'compare' ? 'active' : ''}`}
                                onClick={() => setViewMode('compare')}
                            >
                                🔄 对比视图
                            </button>
                        </div>
                    </div>
                    <GradeBandTabs
                        selected={selectedBands}
                        onChange={setSelectedBands}
                        availableBands={availableBands}
                    />
                </div>
            </section>

            {/* Standards Section */}
            <section className="standards-section">
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
                            <div className="standards-header">
                                <h2>课程标准</h2>
                                <div className="standards-actions">
                                    <button className="btn btn-ghost" onClick={expandAll}>展开全部</button>
                                    <button className="btn btn-ghost" onClick={collapseAll}>收起全部</button>
                                </div>
                            </div>

                            <div className="domains-list">
                                {domains.map(domain => {
                                    const domainStandards = standardsByDomain[domain]
                                    const isExpanded = expandedDomains[domain] !== false // default to expanded

                                    return (
                                        <div key={domain} className="domain-group">
                                            <button
                                                className={`domain-header ${isExpanded ? 'expanded' : ''}`}
                                                onClick={() => toggleDomain(domain)}
                                                style={{ '--subject-color': subjectColor }}
                                            >
                                                <div className="domain-info">
                                                    <span className="domain-name">{domain}</span>
                                                    <span className="domain-count">{domainStandards.length} 条</span>
                                                </div>
                                                <span className={`domain-toggle ${isExpanded ? 'up' : 'down'}`}>▼</span>
                                            </button>

                                            {isExpanded && (
                                                <div className="standards-list animate-fade-in">
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
                                <div className="empty-state">
                                    <p>没有找到符合条件的标准</p>
                                    <button className="btn btn-secondary" onClick={() => setSelectedBands([])}>
                                        清除筛选
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </section>
        </div>
    )
}

export default SubjectPage
