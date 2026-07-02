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
import { getH4GDifferentiationState } from '../data/h4gDifferentiation'
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
        grade_assignment_type,
        grade_assignment_confidence,
        grade_assignment_rationale,
        textbook_evidence_ids,
        progression_basis,
        progression_role,
        source_standard_scope,
        standard_variant_type,
        evidence_granularity,
        grade_specific_focus,
        progression_delta,
        progression_review_note,
        requires_unit_level_evidence,
        review_status,
        ts_primary,
        ts_secondary,
        ts_rationale,
        previous_code,
        next_code,
        resources = []
    } = standard

    const h4gState = getH4GDifferentiationState(standard)
    const subjectColor = SUBJECT_COLORS[subject_slug]
    const gradeBandInfo = GRADE_BANDS[grade_band] || {}
    const subjectInfo = subjects.find(s => s.subject_slug === subject_slug)
    const shareURL = `${window.location.origin}/standards/${code}`
    const evidenceIds = Array.isArray(textbook_evidence_ids) ? textbook_evidence_ids : []
    const hasGradeAssignmentConfidence = grade_assignment_confidence !== null && grade_assignment_confidence !== undefined
    const hasGradeAssignmentDetails = grade_assignment_rationale ||
        hasGradeAssignmentConfidence ||
        evidenceIds.length > 0 ||
        progression_basis ||
        progression_role ||
        source_standard_scope ||
        standard_variant_type ||
        evidence_granularity ||
        grade_specific_focus ||
        progression_delta ||
        progression_review_note ||
        requires_unit_level_evidence !== undefined ||
        h4gState.isH4G
    const isLowConfidence = grade_assignment_type === 'auto_judged_low_confidence' || String(review_status || '').includes('low_confidence')
    const needsGradeDifferentiation = !h4gState.isFinalReady &&
        (h4gState.needsDifferentiation || String(review_status || '').includes('needs_grade_differentiation') || standard_variant_type === 'same_source_shared')
    const pageTitle = h4gState.shouldLeadWithGradeFocus ? h4gState.gradeFocus : standardText

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
                            {isLowConfidence && (
                                <span className="low-confidence-badge">低置信度</span>
                            )}
                            {needsGradeDifferentiation && (
                                <span className="grade-differentiation-badge">待年级化细分</span>
                            )}
                            {h4gState.statusLabel && (
                                <span className={`grade-differentiation-badge h4g-status-${h4gState.isFinalReady ? 'ready' : h4gState.isCandidate ? 'candidate' : 'pending'}`}>
                                    {h4gState.statusLabel}
                                </span>
                            )}
                        </div>
                        <h1 className="standard-title">{pageTitle}</h1>
                        {h4gState.isH4G && (
                            <div className={`h4g-detail-summary ${h4gState.shouldLeadWithGradeFocus ? 'has-focus' : 'pending'}`}>
                                <span>{h4gState.shouldLeadWithGradeFocus ? h4gState.sourceTextLabel : h4gState.focusLabel}</span>
                                <p>{h4gState.shouldLeadWithGradeFocus ? standardText : h4gState.statusMessage}</p>
                            </div>
                        )}
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

            {hasGradeAssignmentDetails && (
                <section className="grade-assignment-detail-section">
                    <div className="container">
                        <div className="grade-assignment-detail">
                            <div>
                                <h2>年级归属依据</h2>
                                <p className="grade-assignment-note">以下内容用于说明 H4G 年级拆分，不属于课程标准原文。</p>
                            </div>
                            {grade_assignment_rationale && (
                                <p className="grade-assignment-rationale">{grade_assignment_rationale}</p>
                            )}
                            {h4gState.isH4G && !h4gState.hasUsableGradeFocus && (
                                <p className="grade-assignment-rationale">{h4gState.statusMessage}</p>
                            )}
                            {h4gState.hasUsableGradeFocus && (
                                <p className="grade-assignment-rationale">{h4gState.gradeFocus}</p>
                            )}
                            {progression_review_note && (
                                <p className="grade-assignment-rationale">{progression_review_note}</p>
                            )}
                            <div className="grade-assignment-facts">
                                {grade_assignment_type && <span>{grade_assignment_type}</span>}
                                {hasGradeAssignmentConfidence && (
                                    <span>置信度 {Math.round(Number(grade_assignment_confidence) * 100)}%</span>
                                )}
                                {progression_basis && <span>{progression_basis}</span>}
                                {progression_role && <span>{progression_role}</span>}
                                {evidenceIds.length > 0 && <span>教材证据 {evidenceIds.length} 条</span>}
                                {source_standard_scope && <span>{source_standard_scope}</span>}
                                {standard_variant_type && <span>{standard_variant_type}</span>}
                                {evidence_granularity && <span>{evidence_granularity}</span>}
                                {progression_delta && <span>{progression_delta}</span>}
                                {requires_unit_level_evidence && <span>需单元级证据</span>}
                            </div>
                        </div>
                    </div>
                </section>
            )}

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
