import { lazy, Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import {
    loadStandardByCode,
    loadStandardCapabilityGraph,
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
import StandardTextbookLinks from '../features/textbooks/StandardTextbookLinks'
import { useUiV2 } from '../components/RouteUiBoundary.jsx'
import { Tooltip } from '../ui/primitives/Tooltip.jsx'
import { copyToClipboard, mergeLearningMapStateIntoURL, parseLearningMapStateFromURL } from '../data/query'
import { resolveLearningMapFlag } from '../config/learningMapFlags.js'
import { runViewTransition } from '../utils/viewTransition.js'
import { buildStandardGraphModel } from '../graph/adapters/standardGraphAdapter'
import styles from './StandardDetailPage.module.css'

const LearningMapRoute = lazy(() => import('../features/learning-map/LearningMapRoute.jsx'))

const PROVENANCE_LABELS = {
    official: '课标原文',
    extracted: '课标章节抽取',
    editorial: 'kebiao 结构化整理',
    rule_generated: '规则生成',
    ai_generated: 'AI 生成'
}

const VERIFIED_REVIEW_STATUSES = new Set(['approved', 'expert_reviewed', 'expert_verified', 'human_reviewed', 'human_verified', 'verified'])

const FORWARD_RELATION_LABELS = {
    curriculum_sequence_candidate: '课程顺序候选',
    curriculum_progression: '课程进阶',
    learning_progression: '学习进阶',
    navigation_sequence: '课标顺序',
    next_step: '后续学习',
    prepares_for: '为后续学习做准备'
}

const ALIGNMENT_LEVEL_LABELS = {
    scope: '适用范围',
    unit: '具体单元',
    page: '教材页面证据',
    unit_topic_candidate: '单元主题候选'
}

function buildCurriculumAlignmentReaderLink(item) {
    const params = new URLSearchParams()
    params.set('page', item.pdf_page)
    if (item.node_id) params.set('node', item.node_id)
    if (item.alignment_id) params.set('alignment', item.alignment_id)
    params.set('panel', 'standards')
    return `/textbooks/${item.edition_id}/read?${params.toString()}`
}

function normalizeDisplayValues(value) {
    const values = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value]
    return values
        .map(item => {
            if (typeof item === 'string' || typeof item === 'number') return String(item).trim()
            return String(item?.label || item?.description || item?.text || '').trim()
        })
        .filter(Boolean)
}

function getCapabilityReviewKind(item, assumeVerified = false) {
    if (assumeVerified) return 'verified'
    const reviewStatus = String(item?.review_status || '').toLowerCase()
    const publicationStatus = String(item?.publication_status || '').toLowerCase()
    const method = String(item?.method || item?.provenance || '').toLowerCase()
    if (VERIFIED_REVIEW_STATUSES.has(reviewStatus)) return 'verified'
    if (
        reviewStatus.includes('machine')
        || reviewStatus.includes('candidate')
        || reviewStatus.includes('pending')
        || publicationStatus.includes('candidate')
        || method.includes('rule')
        || method.includes('machine')
        || method.includes('ai')
    ) return 'machine'
    return 'pending'
}

function CapabilityStatus({ item, assumeVerified = false, kindOverride = '' }) {
    const kind = kindOverride || getCapabilityReviewKind(item, assumeVerified)
    const label = kind === 'verified' ? '已核验' : kind === 'machine' ? '机器候选' : '待复核'
    const detail = [item?.review_status, item?.publication_status].filter(Boolean).join(' · ')
    return <span className={`${styles['capability-status']} ${styles[kind]}`} title={detail || label}>{label}</span>
}

function CapabilityFact({ label, value }) {
    const values = normalizeDisplayValues(value)
    if (!values.length) return null
    return (
        <div className={styles['capability-fact']}>
            <dt>{label}</dt>
            <dd>
                {values.length === 1 ? values[0] : (
                    <ul>{values.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
                )}
            </dd>
        </div>
    )
}

function CapabilityGroup({ eyebrow, title, description, emptyMessage, isEmpty, children, className = '' }) {
    return (
        <section className={`${styles['capability-group']} ${className}`}>
            <header className={styles['capability-group-heading']}>
                <span>{eyebrow}</span>
                <h3>{title}</h3>
                <p>{description}</p>
            </header>
            {isEmpty ? <p className={styles['capability-empty']}>{emptyMessage}</p> : children}
        </section>
    )
}

function LearningComponentCard({ item, index }) {
    const component = typeof item === 'string' ? { label: item } : item
    return (
        <article className={styles['capability-card']}>
            <div className={styles['capability-card-heading']}>
                <span className={styles['capability-index']}>{String(index + 1).padStart(2, '0')}</span>
                <h4>{component.label || component.description || '待命名学习成分'}</h4>
                <CapabilityStatus item={component} />
            </div>
            {component.description && component.description !== component.label ? <p>{component.description}</p> : null}
            <dl>
                <CapabilityFact label="可观察证据" value={component.observable_evidence} />
                <CapabilityFact label="诊断提示" value={component.diagnostic_prompt} />
            </dl>
        </article>
    )
}

function PrerequisiteCard({ item, assumeVerified = false }) {
    const prerequisite = typeof item === 'string' ? { source_code: item } : item
    const sourceCode = prerequisite.source_code || prerequisite.standard_code
    return (
        <article className={styles['relation-card']}>
            <div className={styles['relation-card-heading']}>
                {sourceCode ? <Link to={`/standards/${encodeURIComponent(sourceCode)}`}>{sourceCode}</Link> : <strong>前置能力</strong>}
                <CapabilityStatus item={prerequisite} assumeVerified={assumeVerified} />
            </div>
            {prerequisite.source_label ? <h4>{prerequisite.source_label}</h4> : null}
            {prerequisite.rationale ? <p>{prerequisite.rationale}</p> : null}
        </article>
    )
}

function HardCaseCard({ item }) {
    const hardCase = typeof item === 'string' ? { title: item } : item
    return (
        <article className={styles['capability-card']}>
            <div className={styles['capability-card-heading']}>
                <h4>{hardCase.title || hardCase.structure || '高难结构'}</h4>
                <CapabilityStatus item={hardCase} />
            </div>
            <dl>
                <CapabilityFact label="高难结构" value={hardCase.structure} />
                <CapabilityFact label="难点原因" value={hardCase.why_hard} />
                <CapabilityFact label="诊断重点" value={hardCase.diagnostic_focus} />
                <CapabilityFact label="学生证据" value={hardCase.required_student_evidence} />
            </dl>
        </article>
    )
}

function DifficultyCard({ item }) {
    const difficulty = typeof item === 'string' ? { manifestation: item } : item
    return (
        <article className={styles['difficulty-card']}>
            <div className={styles['capability-card-heading']}>
                <h4>{difficulty.manifestation || '常见困难'}</h4>
                <CapabilityStatus item={difficulty} />
            </div>
            <dl>
                <CapabilityFact label="可能成因" value={difficulty.likely_cause} />
                <CapabilityFact label="教师动作" value={difficulty.teacher_action} />
                <CapabilityFact label="诊断追问" value={difficulty.diagnostic_probe} />
                <CapabilityFact label="成功信号" value={difficulty.success_signal} />
            </dl>
        </article>
    )
}

function CurriculumAlignmentCard({ item }) {
    const level = item.level || (item.evidence_level === 'L3_page_evidence' ? 'page' : item.unit_id || item.node_id ? 'unit' : 'scope')
    const textbookLabel = item.textbook_title || item.edition_name || item.edition_id || '相关教材'
    const isUnitTopicCandidate = level === 'unit_topic_candidate'
    const isPageEvidence = level === 'page' || item.evidence_level === 'L3_page_evidence'
    const canOpenReader = !isUnitTopicCandidate && ['unit', 'page'].includes(level) && item.edition_id && item.pdf_page
    const readerLink = isPageEvidence || item.node_id ? buildCurriculumAlignmentReaderLink(item) : `/textbooks/${item.edition_id}/read?page=${item.pdf_page}`
    const evidence = item.evidence_spans?.[0]
    const components = item.learning_component_labels || item.learning_components || item.learning_component_ids || []
    return (
        <article className={styles['alignment-card']}>
            <div className={styles['alignment-card-heading']}>
                <span className={styles['alignment-level']}>{ALIGNMENT_LEVEL_LABELS[level] || level}</span>
                {isPageEvidence ? <span className={`${styles['capability-status']} ${styles.machine}`}>机器生成</span> : <CapabilityStatus item={item} kindOverride={isUnitTopicCandidate ? 'machine' : ''} />}
            </div>
            <h4>{item.edition_id ? <Link to={`/textbooks/${item.edition_id}`}>{textbookLabel}</Link> : textbookLabel}</h4>
            {item.node_title || item.unit_title || item.unit_id ? (
                <p className={styles['alignment-unit']}>
                    {item.unit_id ? <Link to={`/textbook-units/${item.unit_id}`}>{item.node_title || item.unit_title || '查看关联单元'}</Link> : item.node_title || item.unit_title}
                </p>
            ) : null}
            <div className={styles['alignment-locators']}>
                {canOpenReader ? (
                    <Link to={readerLink}>PDF {item.pdf_page}{item.printed_page ? ` · 印刷页 ${item.printed_page}` : ''}</Link>
                ) : isUnitTopicCandidate ? <span>待补页码证据</span> : item.printed_page ? <span>印刷页 {item.printed_page}</span> : null}
                {item.evidence_role ? <span>{item.evidence_role === 'direct_textbook' ? '教材直接证据' : item.evidence_role}</span> : null}
                {item.evidence_level ? <span>{item.evidence_level}</span> : null}
            </div>
            {components.length ? <div className={styles['alignment-components']}>{components.map(component => <span key={typeof component === 'string' ? component : component.component_id}>{typeof component === 'string' ? component : component.label || component.component_id}</span>)}</div> : null}
            {evidence?.excerpt || item.evidence_excerpt ? <blockquote className={styles['alignment-evidence']}>“{evidence?.excerpt || item.evidence_excerpt}”</blockquote> : null}
            {item.rationale ? <p>{item.rationale}</p> : null}
        </article>
    )
}

function ForwardConnectionCard({ item }) {
    const connection = typeof item === 'string' ? { target_code: item } : item
    const targetCode = connection.target_code || connection.standard_code
    return (
        <article className={styles['relation-card']}>
            <div className={styles['relation-card-heading']}>
                <span className={styles['relation-type']}>{FORWARD_RELATION_LABELS[connection.relation_type] || connection.relation_type || '后续学习'}</span>
                <CapabilityStatus item={connection} />
            </div>
            <h4>{targetCode ? <Link to={`/standards/${encodeURIComponent(targetCode)}`}>{connection.target_label || targetCode}</Link> : connection.target_label || '后续能力'}</h4>
            {targetCode && connection.target_label ? <small>{targetCode}</small> : null}
            {connection.rationale ? <p>{connection.rationale}</p> : null}
        </article>
    )
}

function ProvenanceBadge({ metadata, compact = false }) {
    if (!metadata) return null
    const hasQualityRisk = metadata.quality_flags?.length > 0
    return (
        <span
            className={`${styles['provenance-badge']} ${styles[metadata.provenance] || ''} ${hasQualityRisk ? styles['quality-risk'] : ''}`}
            title={`${metadata.source_ref?.document || ''}${metadata.source_ref?.section ? ` · ${metadata.source_ref.section}` : ''}`}
        >
            {PROVENANCE_LABELS[metadata.provenance] || '来源待确认'}
            {!compact && metadata.review_status !== 'human_reviewed' ? ' · 未经人工复核' : ''}
        </span>
    )
}

function TrustedContentCard({ title, value, metadata }) {
    if (!value) return null
    const quarantined = metadata?.quality_flags?.length > 0
    return (
        <div className={`${styles['content-card']} ${quarantined ? styles.quarantined : ''}`}>
            <div className={styles['content-card-heading']}>
                <h3>{title}</h3>
                <ProvenanceBadge metadata={metadata} compact />
            </div>
            {quarantined ? (
                <div className={styles['quality-warning']} role="note">
                    <strong>内容暂缓展示</strong>
                    <span>检测到文本截断或残片，已排除出 AI 检索，等待人工复核。</span>
                </div>
            ) : <p>{value}</p>}
        </div>
    )
}

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
    const [searchParams, setSearchParams] = useSearchParams()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [standard, setStandard] = useState(null)
    const [capabilityGraphLoading, setCapabilityGraphLoading] = useState(false)
    const [subjects, setSubjects] = useState([])
    const [skills, setSkills] = useState([])
    const [resourcesExpanded, setResourcesExpanded] = useState(false)
    const [relationsExpanded, setRelationsExpanded] = useState(false)
    const [activeSection, setActiveSection] = useState('standard-skills')
    const [codeCopyStatus, setCodeCopyStatus] = useState('idle')
    const relationHeadingRef = useRef(null)
    const copyTimerRef = useRef(null)
    const searchKey = searchParams.toString()
    const learningMapState = useMemo(() => parseLearningMapStateFromURL(new URLSearchParams(searchKey)), [searchKey])
    const learningMapFlag = useMemo(() => resolveLearningMapFlag('standard', `?${searchKey}`), [searchKey])
    const learningMapActive = uiV2Enabled && learningMapFlag.enabled && learningMapState.view === 'learning-map'

    const graphModel = useMemo(
        () => (standard ? buildStandardGraphModel(standard, { skills }) : null),
        [standard, skills]
    )

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        setStandard(null)
        setCapabilityGraphLoading(false)

        Promise.all([
            loadStandardByCode(code),
            loadManifest(),
            loadSkillsMeta()
        ])
            .then(([std]) => {
                if (cancelled) return
                if (!std) {
                    setError(`找不到标准 ${code}`)
                } else {
                    setStandard(std)
                    setCapabilityGraphLoading(true)
                    loadStandardCapabilityGraph(std)
                        .then(graph => {
                            if (cancelled || !graph) return
                            setStandard(current => current?.code === std.code ? { ...current, ...graph } : current)
                        })
                        .catch(err => {
                            if (cancelled) return
                            setStandard(current => current?.code === std.code ? {
                                ...current,
                                capability_graph_load_error: err instanceof Error ? err.message : '能力图谱暂时无法加载'
                            } : current)
                        })
                        .finally(() => {
                            if (!cancelled) setCapabilityGraphLoading(false)
                        })
                }
                setSubjects(getSubjectsFromManifest())
                setSkills(getSkillsMeta())
                setLoading(false)
            })
            .catch(err => {
                if (cancelled) return
                setError(err.message)
                setLoading(false)
                setCapabilityGraphLoading(false)
            })

        return () => {
            cancelled = true
        }
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

    const openLearningMap = useCallback(() => {
        const current = parseLearningMapStateFromURL(new URLSearchParams(searchParams))
        setSearchParams(mergeLearningMapStateIntoURL(searchParams, { ...current, view: 'learning-map' }), { replace: false })
    }, [searchParams, setSearchParams])

    const handleLocateGraph = useCallback(() => {
        if (learningMapFlag.enabled) {
            openLearningMap()
            return
        }
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
    }, [learningMapFlag.enabled, openLearningMap, relationsExpanded])

    const updateLearningMapState = useCallback((partial, options = {}) => {
        const current = parseLearningMapStateFromURL(new URLSearchParams(searchParams))
        const next = { ...current, ...partial, view: 'learning-map' }
        setSearchParams(mergeLearningMapStateIntoURL(searchParams, next), { replace: options.history !== 'push' })
    }, [searchParams, setSearchParams])

    const closeLearningMap = useCallback(() => {
        setSearchParams(mergeLearningMapStateIntoURL(searchParams, {}), { replace: false })
    }, [searchParams, setSearchParams])

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
        provenance,
        official_text,
        field_provenance = {},
        skill_alignments = [],
        learning_components = [],
        verified_prerequisites = [],
        prerequisite_candidates = [],
        hardest_cases = [],
        common_difficulties = [],
        curriculum_alignments = [],
        forward_connections = [],
        capability_graph_load_error,
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
        <div
            className={styles['standard-detail-page']}
            data-kb-route="standard"
            data-learning-map-version={learningMapActive ? 'learning-map' : 'legacy'}
            data-learning-map-flag-source={learningMapFlag.source}
            data-learning-map-rollout-percentage={learningMapFlag.rolloutPercentage ?? undefined}
            data-learning-map-rollout-bucket={learningMapFlag.rolloutBucket ?? undefined}
        >
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
                        <div className={styles['header-provenance']}>
                            <ProvenanceBadge metadata={field_provenance.standard || provenance} />
                            <span>页面标题与摘要为结构化索引内容；原文可用时在正文单独列出。</span>
                        </div>
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

            {learningMapActive ? (
                <section className={styles['learning-map-section']} aria-label="学习脉络" data-kb-feature="learning-map">
                    <div className="container">
                        <Suspense fallback={<LoadingState message="正在加载学习脉络工作台…" />}>
                            <LearningMapRoute standardCode={code} subjectSlug={subject_slug} learningMapState={learningMapState} onStateChange={updateLearningMapState} />
                        </Suspense>
                        <div className={styles['learning-map-route-actions']}>
                            <span>学习脉络</span>
                            <button type="button" onClick={closeLearningMap}>返回课程标准正文</button>
                        </div>
                    </div>
                </section>
            ) : null}

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
                    <ReadingNavLink sectionId="standard-capability-graph" activeSection={activeSection}>能力图谱</ReadingNavLink>
                    <ReadingNavLink sectionId="standard-content" activeSection={activeSection}>教学线索</ReadingNavLink>
                    <ReadingNavLink sectionId="standard-resources" activeSection={activeSection}>教学资源</ReadingNavLink>
                    {uiV2Enabled ? <button type="button" onClick={handleLocateGraph} data-kb-telemetry-task="graph_open">关系图谱</button> : null}
                </div>
            </nav>

            {/* Skills */}
            <section className={styles['skills-section']} id="standard-skills" data-reading-section="standard-skills">
                <div className="container">
                    <div className={styles['section-title-row']}>
                        <h2>可迁移技能</h2>
                        <ProvenanceBadge metadata={field_provenance.ts_rationale} compact />
                        <p className={styles['candidate-notice']}>当前技能关系为候选映射，不会自动覆盖正式数据；请结合命中的标准原文证据判断。</p>
                    </div>
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
                                                {ts}<small>{skill_alignments.find(item => item.skill_code === ts)?.method === 'rule' ? '规则候选' : '候选'}</small>
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
                                                {ts}<small>{skill_alignments.find(item => item.skill_code === ts)?.method === 'rule' ? '规则候选' : '候选'}</small>
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

            <section className={styles['capability-section']} id="standard-capability-graph" data-reading-section="standard-capability-graph">
                <div className="container">
                    <header className={styles['capability-intro']}>
                        <div>
                            <span>TEACHABLE GRAPH</span>
                            <h2>可教学能力图谱</h2>
                        </div>
                        <p>把课标拆成可教、可诊断、可追溯的课堂线索。已核验关系与机器候选分开展示；候选内容用于备课判断，不等同于官方课标结论。</p>
                    </header>

                    {capabilityGraphLoading ? (
                        <p className={styles['capability-empty']} role="status">课标正文已就绪，正在加载能力图谱…</p>
                    ) : capability_graph_load_error ? (
                        <p className={styles['capability-empty']} role="status">能力图谱暂时无法加载；课标正文和既有教学支持内容仍可正常使用。</p>
                    ) : (
                        <>
                            <dl className={styles['capability-summary']} aria-label="能力图谱概览">
                        <div><dt>学习成分</dt><dd>{learning_components.length}</dd></div>
                        <div><dt>已核验前置</dt><dd>{verified_prerequisites.length}</dd></div>
                        <div><dt>教材关联</dt><dd>{curriculum_alignments.length}</dd></div>
                        <div><dt>后续连接</dt><dd>{forward_connections.length}</dd></div>
                            </dl>

                            <div className={styles['capability-layout']}>
                        <CapabilityGroup
                            eyebrow="DECOMPOSE"
                            title="可教学小能力"
                            description="将一条标准分解为课堂中能够教授和观察的学习成分。"
                            emptyMessage="尚未形成可公开的学习成分。"
                            isEmpty={learning_components.length === 0}
                            className={styles['capability-group-wide']}
                        >
                            <div className={styles['learning-component-list']}>
                                {learning_components.map((item, index) => <LearningComponentCard key={item?.component_id || `component-${index}`} item={item} index={index} />)}
                            </div>
                        </CapabilityGroup>

                        <CapabilityGroup
                            eyebrow="PREREQUISITES"
                            title="前置能力"
                            description="专家核验关系可作为正式学习路径；机器候选仍需教师或学科专家确认。"
                            emptyMessage="暂无已核验或候选前置能力。"
                            isEmpty={verified_prerequisites.length === 0 && prerequisite_candidates.length === 0}
                            className={styles['capability-group-wide']}
                        >
                            <div className={styles['prerequisite-columns']}>
                                <div>
                                    <h4>已核验</h4>
                                    {verified_prerequisites.length ? (
                                        <div className={styles['relation-list']}>
                                            {verified_prerequisites.map((item, index) => <PrerequisiteCard key={item?.edge_id || `verified-prerequisite-${index}`} item={item} assumeVerified />)}
                                        </div>
                                    ) : <p className={styles['capability-empty-compact']}>目前没有专家核验的前置关系。</p>}
                                </div>
                                <div>
                                    <h4>机器候选</h4>
                                    {prerequisite_candidates.length ? (
                                        <div className={styles['relation-list']}>
                                            {prerequisite_candidates.map((item, index) => <PrerequisiteCard key={item?.edge_id || `candidate-prerequisite-${index}`} item={item} />)}
                                        </div>
                                    ) : <p className={styles['capability-empty-compact']}>暂无机器候选。</p>}
                                </div>
                            </div>
                        </CapabilityGroup>

                        <CapabilityGroup
                            eyebrow="HARD CASES"
                            title="最难结构"
                            description="标准中容易被简化或遗漏、需要专门诊断的复杂要求。"
                            emptyMessage="尚未识别可公开的高难结构。"
                            isEmpty={hardest_cases.length === 0}
                            className={styles['capability-group-wide']}
                        >
                            <div className={`${styles['capability-card-list']} ${styles['capability-card-grid']}`}>
                                {hardest_cases.map((item, index) => <HardCaseCard key={item?.case_id || `hard-case-${index}`} item={item} />)}
                            </div>
                        </CapabilityGroup>

                        <CapabilityGroup
                            eyebrow="DIFFICULTIES"
                            title="可能困难与教师动作"
                            description="规则根据标准结构提出错误表现、可能成因和教学响应候选；尚无频率证据，需结合真实学生表现核验。"
                            emptyMessage="尚未形成可公开的常见困难分析。"
                            isEmpty={common_difficulties.length === 0}
                            className={styles['capability-group-wide']}
                        >
                            <div className={`${styles['capability-card-list']} ${styles['capability-card-grid']}`}>
                                {common_difficulties.map((item, index) => <DifficultyCard key={item?.difficulty_id || `difficulty-${index}`} item={item} />)}
                            </div>
                        </CapabilityGroup>

                        <CapabilityGroup
                            eyebrow="ALIGNMENTS"
                            title="教材证据"
                            description="区分同学科、同学段适用范围与可定位到单元、页码的具体证据。"
                            emptyMessage="暂无达到公开门槛的教材关联。"
                            isEmpty={curriculum_alignments.length === 0}
                            className={styles['capability-group-wide']}
                        >
                            <div className={styles['alignment-grid']}>
                                {curriculum_alignments.map((item, index) => <CurriculumAlignmentCard key={item?.alignment_id || `alignment-${index}`} item={item} />)}
                            </div>
                        </CapabilityGroup>

                        <CapabilityGroup
                            eyebrow="FORWARD"
                            title="后续学习去向"
                            description="说明这条标准将连接到哪些后续学习，并标明关系的证据状态。"
                            emptyMessage="暂无达到公开门槛的后续连接。"
                            isEmpty={forward_connections.length === 0}
                            className={styles['capability-group-wide']}
                        >
                            <div className={styles['forward-grid']}>
                                {forward_connections.map((item, index) => <ForwardConnectionCard key={item?.connection_id || `forward-${index}`} item={item} />)}
                            </div>
                        </CapabilityGroup>
                            </div>
                        </>
                    )}
                </div>
            </section>

            {/* Content Details */}
            <section className={styles['content-section']} id="standard-content" data-reading-section="standard-content">
                <div className="container">
                    {official_text ? (
                        <article className={styles['official-source-card']}>
                            <div className={styles['content-card-heading']}>
                                <h2>课标原文</h2>
                                <span className={`${styles['provenance-badge']} ${styles.official}`}>课标原文</span>
                            </div>
                            <p>{official_text}</p>
                            <small>{field_provenance.standard?.source_ref?.document} · {field_provenance.standard?.source_ref?.section}</small>
                        </article>
                    ) : null}
                    <div className={styles['content-grid']}>
                        <TrustedContentCard title="情境说明" value={context} metadata={field_provenance.context} />
                        <TrustedContentCard title="实践建议" value={practice} metadata={field_provenance.practice} />
                        <TrustedContentCard title="教学提示" value={teaching_tip} metadata={field_provenance.teaching_tip} />
                        <TrustedContentCard title="评价证据" value={assessment_evidence_type} metadata={field_provenance.assessment_evidence_type} />
                    </div>
                </div>
            </section>

            {/* P1: Resources Placeholder */}
            <section className={styles['resources-section']} id="standard-resources" data-reading-section="standard-resources">
                <div className="container">
                    <StandardTextbookLinks standardCode={code} />
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
