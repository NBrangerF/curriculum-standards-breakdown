import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
    loadStandardByCode,
    loadManifest,
    getSubjectsFromManifest,
    SUBJECT_COLORS,
    SKILL_COLORS,
    GRADE_BANDS
} from '../data/dataLoader'
import { LoadingState, ErrorState, CopyLinkButton } from '../components/StateComponents'
import FavoriteButton from '../components/FavoriteButton'
import { buildShareableURL } from '../data/query'
import './StandardDetailPage.css'

function StandardDetailPage() {
    const { code } = useParams()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [standard, setStandard] = useState(null)
    const [subjects, setSubjects] = useState([])
    const [resourcesExpanded, setResourcesExpanded] = useState(false)

    useEffect(() => {
        setLoading(true)
        setError(null)

        Promise.all([
            loadStandardByCode(code),
            loadManifest()
        ])
            .then(([std, _]) => {
                if (!std) {
                    setError(`找不到标准 ${code}`)
                } else {
                    setStandard(std)
                }
                setSubjects(getSubjectsFromManifest())
                setLoading(false)
            })
            .catch(err => {
                setError(err.message)
                setLoading(false)
            })
    }, [code])

    if (loading) {
        return (
            <div className="page-content container">
                <LoadingState message={`加载标准 ${code}...`} />
            </div>
        )
    }

    if (error || !standard) {
        return (
            <div className="page-content container">
                <ErrorState
                    title="标准未找到"
                    message={error || `找不到代码为 ${code} 的标准`}
                />
                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                    <Link to="/" className="btn btn-primary">返回首页</Link>
                </div>
            </div>
        )
    }

    const {
        subject,
        subject_slug,
        domain,
        subdomain,
        grade_band,
        grade_range,
        standard: standardText,
        context,
        practice,
        teaching_tip,
        assessment_evidence_type,
        ts_primary,
        ts_secondary,
        ts_rationale,
        previous_code,
        next_code,
        resources = []
    } = standard

    const subjectColor = SUBJECT_COLORS[subject_slug]
    const gradeBandInfo = GRADE_BANDS[grade_band] || {}
    const subjectInfo = subjects.find(s => s.subject_slug === subject_slug)
    const shareURL = `${window.location.origin}/standards/${code}`

    // Parse navigation codes (may be multiple, separated by \n)
    const prevCodes = previous_code ? previous_code.split('\n').filter(Boolean) : []
    const nextCodes = next_code ? next_code.split('\n').filter(Boolean) : []

    return (
        <div className="standard-detail-page">
            {/* Breadcrumb */}
            <div className="breadcrumb-bar">
                <div className="container">
                    <nav className="breadcrumb">
                        <Link to="/">首页</Link>
                        <span className="separator">›</span>
                        <Link to={`/subjects/${subject_slug}`}>{subject}</Link>
                        <span className="separator">›</span>
                        <span className="current">{domain}</span>
                        <span className="separator">›</span>
                        <span className="current">{code}</span>
                    </nav>
                </div>
            </div>

            {/* Header */}
            <section className="standard-header" style={{ '--subject-color': subjectColor }}>
                <div className="container">
                    <div className="header-content">
                        <div className="header-meta">
                            <span className="standard-code">{code}</span>
                            <Link to={`/subjects/${subject_slug}`} className="subject-badge">
                                {subject}
                            </Link>
                            <span className="grade-band-badge">
                                {gradeBandInfo.label} ({grade_range})
                            </span>
                        </div>
                        <h1 className="standard-title">{standardText}</h1>
                        <div className="header-actions">
                            <FavoriteButton code={code} showLabel={true} size="large" />
                            <CopyLinkButton url={shareURL} />
                        </div>
                    </div>
                </div>
            </section>

            {/* Classification */}
            <section className="classification-section">
                <div className="container">
                    <div className="classification-grid">
                        <div className="classification-item">
                            <span className="label">学科</span>
                            <Link to={`/subjects/${subject_slug}`} className="value link">
                                {subject}
                            </Link>
                        </div>
                        <div className="classification-item">
                            <span className="label">领域</span>
                            <span className="value">{domain}</span>
                        </div>
                        {subdomain && (
                            <div className="classification-item">
                                <span className="label">子领域</span>
                                <span className="value">{subdomain}</span>
                            </div>
                        )}
                        <div className="classification-item">
                            <span className="label">学段</span>
                            <span className="value">{gradeBandInfo.label} ({grade_band})</span>
                        </div>
                        <div className="classification-item">
                            <span className="label">年级</span>
                            <span className="value">{grade_range}年级</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Skills */}
            <section className="skills-section">
                <div className="container">
                    <h2>可迁移技能</h2>
                    <div className="skills-container">
                        {ts_primary.length > 0 && (
                            <div className="skill-group">
                                <h3>主要技能</h3>
                                <div className="skill-tags">
                                    {ts_primary.map(ts => {
                                        const mainSkill = ts.split('.')[0]
                                        return (
                                            <Link
                                                key={ts}
                                                to={`/skills/${mainSkill}`}
                                                className="skill-tag primary"
                                                style={{ '--skill-color': SKILL_COLORS[mainSkill] }}
                                            >
                                                {ts}
                                            </Link>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                        {ts_secondary.length > 0 && (
                            <div className="skill-group">
                                <h3>次要技能</h3>
                                <div className="skill-tags">
                                    {ts_secondary.map(ts => {
                                        const mainSkill = ts.split('.')[0]
                                        return (
                                            <Link
                                                key={ts}
                                                to={`/skills/${mainSkill}`}
                                                className="skill-tag secondary"
                                                style={{ '--skill-color': SKILL_COLORS[mainSkill] }}
                                            >
                                                {ts}
                                            </Link>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                        {ts_primary.length === 0 && ts_secondary.length === 0 && (
                            <p className="no-skills">暂无技能标签</p>
                        )}
                        {ts_rationale && (
                            <div className="skill-rationale">
                                <strong>标注理由：</strong>
                                <p>{ts_rationale}</p>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* Content Details */}
            <section className="content-section">
                <div className="container">
                    <div className="content-grid">
                        {context && (
                            <div className="content-card">
                                <h3>🎯 情境说明</h3>
                                <p>{context}</p>
                            </div>
                        )}

                        {practice && (
                            <div className="content-card">
                                <h3>📝 实践建议</h3>
                                <p>{practice}</p>
                            </div>
                        )}

                        {teaching_tip && (
                            <div className="content-card">
                                <h3>💡 教学提示</h3>
                                <p>{teaching_tip}</p>
                            </div>
                        )}

                        {assessment_evidence_type && (
                            <div className="content-card">
                                <h3>📊 评价证据</h3>
                                <p>{assessment_evidence_type}</p>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* P1: Resources Placeholder */}
            <section className="resources-section">
                <div className="container">
                    <button
                        className={`resources-header-btn ${resourcesExpanded ? 'expanded' : ''}`}
                        onClick={() => setResourcesExpanded(!resourcesExpanded)}
                    >
                        <span>📦 教学资源</span>
                        <span className="coming-soon-badge">即将上线</span>
                        <span className={`toggle-icon ${resourcesExpanded ? 'up' : 'down'}`}>▼</span>
                    </button>
                    {resourcesExpanded && (
                        <div className="resources-placeholder">
                            <div className="placeholder-content">
                                <span className="placeholder-icon">🎓</span>
                                <h4>教学资源即将上线</h4>
                                <p>未来将支持绑定课例、活动设计、任务单等教学资源</p>
                                <ul>
                                    <li>典型课例与教学设计</li>
                                    <li>学生活动与评估工具</li>
                                    <li>教师参考资料</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Navigation */}
            <section className="navigation-section">
                <div className="container">
                    <div className="nav-grid">
                        <div className="nav-group">
                            <h4>上一条标准</h4>
                            {prevCodes.length > 0 ? (
                                <div className="nav-links">
                                    {prevCodes.map(c => (
                                        <Link key={c} to={`/standards/${c.trim()}`} className="nav-link prev">
                                            ← {c.trim()}
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <span className="nav-empty">无</span>
                            )}
                        </div>
                        <div className="nav-group center">
                            <Link to={`/subjects/${subject_slug}`} className="btn btn-secondary">
                                返回 {subject}
                            </Link>
                        </div>
                        <div className="nav-group right">
                            <h4>下一条标准</h4>
                            {nextCodes.length > 0 ? (
                                <div className="nav-links">
                                    {nextCodes.map(c => (
                                        <Link key={c} to={`/standards/${c.trim()}`} className="nav-link next">
                                            {c.trim()} →
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <span className="nav-empty">无</span>
                            )}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}

export default StandardDetailPage
