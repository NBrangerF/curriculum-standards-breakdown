import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import {
    loadStandardByCode,
    loadManifest,
    loadSkillsMeta,
    getSkillsMeta,
    getSubjectsFromManifest,
    SUBJECT_COLORS,
    SKILL_COLORS,
    GRADE_BANDS
} from '../data/dataLoader'
import { LoadingState, ErrorState, CopyLinkButton } from '../components/StateComponents'
import FavoriteButton from '../components/FavoriteButton'
import StandardRelationPanel from '../components/StandardRelationPanel'
import { useUiV2 } from '../components/RouteUiBoundary.jsx'
import { Tooltip } from '../ui/primitives/Tooltip.jsx'
import { copyToClipboard } from '../data/query'
import { runViewTransition } from '../utils/viewTransition.js'
import { buildStandardGraphModel } from '../graph/adapters/standardGraphAdapter'
import styles from './StandardDetailPage.module.css'

function getDisplayTitle(sourceText, fallbackTitle = '') {
    const cleanFallback = String(fallbackTitle || '').replace(/[.…]+$/u, '').trim()
    if (cleanFallback && cleanFallback.length <= 32 && !String(fallbackTitle).includes('...')) {
        return cleanFallback
    }

    const cleanSource = String(sourceText || '').trim()
    if (cleanSource.length <= 32) return cleanSource

    const firstClause = cleanSource.split(/[，；。]/u).map(part => part.trim()).find(Boolean)
    return firstClause || cleanFallback || cleanSource
}

function StandardPreviewLink({ standardCode, direction }) {
    const normalizedCode = standardCode.trim()
    const [preview, setPreview] = useState(null)

    useEffect(() => {
        let cancelled = false
        loadStandardByCode(normalizedCode)
            .then(record => {
                if (!cancelled) setPreview(record)
            })
            .catch(() => {
                if (!cancelled) setPreview(null)
            })
        return () => { cancelled = true }
    }, [normalizedCode])

    const previewTitle = preview
        ? getDisplayTitle(preview.standard, preview.standard_title)
        : '正在读取标准摘要'

    return (
        <Tooltip
            placement={direction === 'prev' ? 'top-start' : 'top-end'}
            content={(
                <span className={styles['standard-nav-preview']} data-kb-standard-preview={normalizedCode}>
                    <span>{normalizedCode}</span>
                    <strong>{previewTitle}</strong>
                    {preview ? <small>{preview.subject} · {preview.domain} · {preview.grade_range}年级</small> : null}
                </span>
            )}
        >
            <Link
                to={`/standards/${normalizedCode}`}
                className={`${styles['nav-link']} ${styles[direction]}`}
            >
                {direction === 'prev' ? `← ${normalizedCode}` : `${normalizedCode} →`}
            </Link>
        </Tooltip>
    )
}

function ReadingNavLink({ sectionId, activeSection, children }) {
    const isActive = activeSection === sectionId

    return (
        <a
            className={isActive ? styles.active : ''}
            href={`#${sectionId}`}
            aria-current={isActive ? 'location' : undefined}
        >
            <span>{children}</span>
            {isActive ? (
                <m.span
                    layoutId="standard-reading-nav-indicator"
                    className={styles['reading-nav-indicator']}
                    data-kb-reading-indicator={sectionId}
                    transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.72 }}
                    aria-hidden="true"
                />
            ) : null}
        </a>
    )
}

function StandardDetailPage() {
    const { enabled: uiV2Enabled } = useUiV2()
    const { code } = useParams()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [standard, setStandard] = useState(null)
    const [subjects, setSubjects] = useState([])
    const [skills, setSkills] = useState([])
    const [resourcesExpanded, setResourcesExpanded] = useState(false)
    const [relationsExpanded, setRelationsExpanded] = useState(false)
    const [activeSection, setActiveSection] = useState('standard-skills')
    const [codeCopyStatus, setCodeCopyStatus] = useState('idle')
    const relationHeadingRef = useRef(null)
    const copyTimerRef = useRef(null)

    const graphModel = useMemo(
        () => (standard ? buildStandardGraphModel(standard, { skills }) : null),
        [standard, skills]
    )

    useEffect(() => {
        setLoading(true)
        setError(null)

        Promise.all([
            loadStandardByCode(code),
            loadManifest(),
            loadSkillsMeta()
        ])
            .then(([std]) => {
                if (!std) {
                    setError(`找不到标准 ${code}`)
                } else {
                    setStandard(std)
                }
                setSubjects(getSubjectsFromManifest())
                setSkills(getSkillsMeta())
                setLoading(false)
            })
            .catch(err => {
                setError(err.message)
                setLoading(false)
            })
    }, [code])

    useEffect(() => {
        if (!standard) return undefined

        let observer
        const frame = requestAnimationFrame(() => {
            const sections = document.querySelectorAll('[data-reading-section]')
            observer = new IntersectionObserver(entries => {
                const visible = entries
                    .filter(entry => entry.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
                if (visible?.target?.id) setActiveSection(visible.target.id)
            }, {
                rootMargin: '-24% 0px -62% 0px',
                threshold: [0.05, 0.2, 0.45]
            })
            sections.forEach(section => observer.observe(section))
        })

        return () => {
            cancelAnimationFrame(frame)
            observer?.disconnect()
        }
    }, [standard, relationsExpanded])

    useEffect(() => () => {
        if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    }, [])

    const handleCopyCode = useCallback(async () => {
        const copied = await copyToClipboard(code)
        setCodeCopyStatus(copied ? 'copied' : 'error')
        if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
        copyTimerRef.current = window.setTimeout(() => setCodeCopyStatus('idle'), 1800)
    }, [code])

    const handleLocateGraph = useCallback(() => {
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const scrollToGraph = () => requestAnimationFrame(() => {
            window.setTimeout(() => {
                relationHeadingRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
                relationHeadingRef.current?.focus({ preventScroll: true })
            }, reducedMotion ? 0 : 120)
        })

        if (relationsExpanded) {
            scrollToGraph()
            return
        }

        const transition = runViewTransition(() => setRelationsExpanded(true))
        if (transition?.finished) transition.finished.finally(scrollToGraph)
        else scrollToGraph()
    }, [relationsExpanded])

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
                <div className={styles['not-found-actions']}>
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
        display_subcategory,
        standard_title,
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
    const pageTitle = getDisplayTitle(standardText, standard_title)
    const standardLead = standardText !== pageTitle ? standardText : ''

    // Parse navigation codes (may be multiple, separated by \n)
    const prevCodes = previous_code ? previous_code.split(/[\n|]/).map(value => value.trim()).filter(Boolean) : []
    const nextCodes = next_code ? next_code.split(/[\n|]/).map(value => value.trim()).filter(Boolean) : []

    return (
        <div className={styles['standard-detail-page']} data-kb-route="standard">
            {/* Breadcrumb */}
            <div className={styles['breadcrumb-bar']}>
                <div className="container">
                    <nav className={styles.breadcrumb} aria-label="面包屑">
                        <Link to="/">首页</Link>
                        <span className={styles.separator}>›</span>
                        <Link to={`/subjects/${subject_slug}`}>{subject}</Link>
                        <span className={styles.separator}>›</span>
                        <span className={styles.current}>{domain}</span>
                        <span className={styles.separator}>›</span>
                        <span className={styles.current}>{code}</span>
                    </nav>
                </div>
            </div>

            {/* Header */}
            <section className={styles['standard-header']} style={{ '--subject-color': subjectColor }}>
                <div className="container">
                    <div className={styles['header-content']}>
                        <div className={styles['header-meta']}>
                            <button
                                type="button"
                                className={`${styles['standard-code']} ${styles[codeCopyStatus] || ''}`}
                                style={{ viewTransitionName: relationsExpanded ? 'none' : 'kb-standard-code' }}
                                onClick={handleCopyCode}
                                aria-label={`${code} 复制编码`}
                            >
                                <span>{code}</span>
                                <span className={styles['code-copy-feedback']} aria-live="polite">
                                    {codeCopyStatus === 'copied' ? '已复制' : codeCopyStatus === 'error' ? '复制失败' : '复制编码'}
                                </span>
                            </button>
                            <Link to={`/subjects/${subject_slug}`} className={styles['subject-badge']}>
                                {subject}
                            </Link>
                            <span className={styles['grade-band-badge']}>
                                {gradeBandInfo.label} ({grade_range})
                            </span>
                        </div>
                        <h1 className={styles['standard-title']} style={{ viewTransitionName: relationsExpanded ? 'none' : 'kb-standard-title' }}>{pageTitle}</h1>
                        {standardLead && (
                            <p className={styles['standard-lead']}>{standardLead}</p>
                        )}
                        <div className={styles['header-actions']}>
                            {uiV2Enabled ? <button
                                type="button"
                                className={styles['graph-locate-button']}
                                onClick={handleLocateGraph}
                                aria-expanded={relationsExpanded}
                                aria-controls="standard-relations"
                                data-kb-telemetry-task="graph_open"
                            >
                                <svg viewBox="0 0 20 20" aria-hidden="true">
                                    <circle cx="4" cy="10" r="2" />
                                    <circle cx="15" cy="4" r="2" />
                                    <circle cx="15" cy="16" r="2" />
                                    <path d="M6 9l7-4M6 11l7 4" />
                                </svg>
                                在图谱中定位
                            </button> : null}
                            <FavoriteButton code={code} showLabel={true} size="large" />
                            <CopyLinkButton url={shareURL} />
                        </div>
                    </div>
                </div>
            </section>

            {/* Classification */}
            <section className={styles['classification-section']}>
                <div className="container">
                    <div className={styles['classification-grid']}>
                        <div className={styles['classification-item']}>
                            <span className={styles.label}>学科</span>
                            <Link to={`/subjects/${subject_slug}`} className={`${styles.value} ${styles.link}`}>
                                {subject}
                            </Link>
                        </div>
                        <div className={styles['classification-item']}>
                            <span className={styles.label}>领域</span>
                            <span className={styles.value}>{domain}</span>
                        </div>
                        {(display_subcategory || subdomain) && (
                            <div className={styles['classification-item']}>
                                <span className={styles.label}>子类别</span>
                                <span className={styles.value}>{display_subcategory || subdomain}</span>
                            </div>
                        )}
                        {standard_title && standard_title !== (display_subcategory || subdomain) && (
                            <div className={styles['classification-item']}>
                                <span className={styles.label}>标准名称</span>
                                <span className={styles.value}>{standard_title}</span>
                            </div>
                        )}
                        <div className={styles['classification-item']}>
                            <span className={styles.label}>学段</span>
                            <span className={styles.value}>{gradeBandInfo.label} ({grade_band})</span>
                        </div>
                        <div className={styles['classification-item']}>
                            <span className={styles.label}>年级</span>
                            <span className={styles.value}>{grade_range}年级</span>
                        </div>
                    </div>
                </div>
            </section>

            <nav className={styles['standard-reading-nav']} aria-label="本页目录">
                <div className={`container ${styles['standard-reading-nav-inner']}`}>
                    <span className={styles['reading-nav-label']}>本页</span>
                    <ReadingNavLink sectionId="standard-skills" activeSection={activeSection}>相关能力</ReadingNavLink>
                    <ReadingNavLink sectionId="standard-content" activeSection={activeSection}>教学线索</ReadingNavLink>
                    <ReadingNavLink sectionId="standard-resources" activeSection={activeSection}>教学资源</ReadingNavLink>
                    {uiV2Enabled ? <button type="button" onClick={handleLocateGraph} data-kb-telemetry-task="graph_open">关系图谱</button> : null}
                </div>
            </nav>

            {/* Skills */}
            <section className={styles['skills-section']} id="standard-skills" data-reading-section="standard-skills">
                <div className="container">
                    <h2>可迁移技能</h2>
                    <div className={styles['skills-container']}>
                        {ts_primary.length > 0 && (
                            <div className={styles['skill-group']}>
                                <h3>主要技能</h3>
                                <div className={styles['skill-tags']}>
                                    {ts_primary.map(ts => {
                                        const mainSkill = ts.split('.')[0]
                                        return (
                                            <Link
                                                key={ts}
                                                to={`/skills/${mainSkill}`}
                                                className={`${styles['skill-tag']} ${styles.primary}`}
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
                            <div className={styles['skill-group']}>
                                <h3>次要技能</h3>
                                <div className={styles['skill-tags']}>
                                    {ts_secondary.map(ts => {
                                        const mainSkill = ts.split('.')[0]
                                        return (
                                            <Link
                                                key={ts}
                                                to={`/skills/${mainSkill}`}
                                                className={`${styles['skill-tag']} ${styles.secondary}`}
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
                            <p className={styles['no-skills']}>暂无技能标签</p>
                        )}
                        {ts_rationale && (
                            <div className={styles['skill-rationale']}>
                                <strong>标注理由：</strong>
                                <p>{ts_rationale}</p>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* Content Details */}
            <section className={styles['content-section']} id="standard-content" data-reading-section="standard-content">
                <div className="container">
                    <div className={styles['content-grid']}>
                        {context && (
                            <div className={styles['content-card']}>
                                <h3>情境说明</h3>
                                <p>{context}</p>
                            </div>
                        )}

                        {practice && (
                            <div className={styles['content-card']}>
                                <h3>实践建议</h3>
                                <p>{practice}</p>
                            </div>
                        )}

                        {teaching_tip && (
                            <div className={styles['content-card']}>
                                <h3>教学提示</h3>
                                <p>{teaching_tip}</p>
                            </div>
                        )}

                        {assessment_evidence_type && (
                            <div className={styles['content-card']}>
                                <h3>评价证据</h3>
                                <p>{assessment_evidence_type}</p>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* P1: Resources Placeholder */}
            <section className={styles['resources-section']} id="standard-resources" data-reading-section="standard-resources">
                <div className="container">
                    <button
                        className={`${styles['resources-header-btn']} ${resourcesExpanded ? styles.expanded : ''}`}
                        onClick={() => setResourcesExpanded(!resourcesExpanded)}
                        aria-expanded={resourcesExpanded}
                        aria-controls="standard-resource-content"
                    >
                        <span className={styles['resource-title']}><span className={styles['resource-symbol']} aria-hidden="true"></span>教学资源</span>
                        <span className={styles['coming-soon-badge']}>即将上线</span>
                        <span className={`${styles['toggle-icon']} ${resourcesExpanded ? styles.up : ''}`} aria-hidden="true"></span>
                    </button>
                    {resourcesExpanded && (
                        <div className={styles['resources-placeholder']} id="standard-resource-content">
                            <div className={styles['placeholder-content']}>
                                <span className={styles['placeholder-index']} aria-hidden="true">R</span>
                                <h3>教学资源即将上线</h3>
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

            <AnimatePresence initial={false}>
                {uiV2Enabled && relationsExpanded ? (
                    <StandardRelationPanel
                        key="standard-relations"
                        model={graphModel}
                        focusRef={relationHeadingRef}
                        transitionCode={code}
                        transitionTitle={pageTitle}
                    />
                ) : null}
            </AnimatePresence>

            {/* Navigation */}
            <section className={styles['navigation-section']}>
                <div className="container">
                    <div className={styles['nav-grid']}>
                        <div className={styles['nav-group']}>
                            <p className={styles['nav-group-label']}>上一条标准</p>
                            {prevCodes.length > 0 ? (
                                <div className={styles['nav-links']}>
                                    {prevCodes.map(c => <StandardPreviewLink key={c} standardCode={c} direction="prev" />)}
                                </div>
                            ) : (
                                <span className={styles['nav-empty']}>无</span>
                            )}
                        </div>
                        <div className={`${styles['nav-group']} ${styles.center}`}>
                            <Link to={`/subjects/${subject_slug}`} className="btn btn-secondary">
                                返回 {subject}
                            </Link>
                        </div>
                        <div className={`${styles['nav-group']} ${styles.right}`}>
                            <p className={styles['nav-group-label']}>下一条标准</p>
                            {nextCodes.length > 0 ? (
                                <div className={styles['nav-links']}>
                                    {nextCodes.map(c => <StandardPreviewLink key={c} standardCode={c} direction="next" />)}
                                </div>
                            ) : (
                                <span className={styles['nav-empty']}>无</span>
                            )}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}

export default StandardDetailPage
