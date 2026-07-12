import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CaretUpIcon } from '@phosphor-icons/react/dist/csr/CaretUp'
import { ChartBarIcon } from '@phosphor-icons/react/dist/csr/ChartBar'
import { CopyIcon } from '@phosphor-icons/react/dist/csr/Copy'
import { FileTextIcon } from '@phosphor-icons/react/dist/csr/FileText'
import { LightbulbIcon } from '@phosphor-icons/react/dist/csr/Lightbulb'
import { MapPinLineIcon } from '@phosphor-icons/react/dist/csr/MapPinLine'
import { PencilLineIcon } from '@phosphor-icons/react/dist/csr/PencilLine'
import { DotsThreeIcon } from '@phosphor-icons/react/dist/csr/DotsThree'
import { GRADE_BANDS, SUBJECT_COLORS } from '../data/dataLoader'
import { getH4GDifferentiationState } from '../data/h4gDifferentiation'
import TSBadge from './TSBadge'
import FavoriteButton from './FavoriteButton'
import { Toast, useTransientToast } from '../ui/primitives/Toast'
import { Tooltip } from '../ui/primitives/Tooltip'
import { useFloatingLayer } from '../ui/primitives/useFloatingLayer'
import styles from './StandardCard.module.css'

/**
 * StandardCard - Refined visual hierarchy with hover-reveal actions
 * 
 * Features:
 * - 4px left accent line (color from subject_slug)
 * - Primary action is always visible
 * - Secondary actions (grade badge, expand) reveal on hover/focus
 * - Mobile: primary + menu always visible, others hidden
 */
function StandardCard({ standard, highlightKeyword = '', highlightTerm = '', quickPreview = false, contextLabel = '' }) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [showMenu, setShowMenu] = useState(false)
    const { toast, showToast, dismissToast } = useTransientToast(2200)
    const {
        floatingRef: menuRef,
        floatingStyle: menuStyle,
        isPositioned: menuPositioned,
        referenceRef: menuButtonRef,
        resolvedPlacement: menuPlacement
    } = useFloatingLayer({ isOpen: showMenu, placement: 'bottom-end', offsetPx: 6 })

    const {
        code,
        standard: standardText,
        domain,
        subdomain,
        display_subcategory,
        standard_title,
        grade_band,
        subject_slug,
        context,
        practice,
        teaching_tip,
        assessment_evidence_type,
        grade_assignment_type,
        grade_assignment_confidence,
        grade_assignment_rationale,
        textbook_evidence_ids,
        source_standard_scope,
        standard_variant_type,
        evidence_granularity,
        grade_specific_focus,
        progression_delta,
        progression_review_note,
        requires_unit_level_evidence,
        review_status,
        ts_primary,
        ts_secondary
    } = standard

    const h4gState = getH4GDifferentiationState(standard)
    const gradeBandInfo = GRADE_BANDS[grade_band] || {}
    const evidenceIds = Array.isArray(textbook_evidence_ids) ? textbook_evidence_ids : []
    const isLowConfidence = grade_assignment_type === 'auto_judged_low_confidence' || String(review_status || '').includes('low_confidence')
    const needsGradeDifferentiation = !h4gState.isFinalReady &&
        (h4gState.needsDifferentiation || String(review_status || '').includes('needs_grade_differentiation') || standard_variant_type === 'same_source_shared')
    const hasGradeAssignmentConfidence = grade_assignment_confidence !== null && grade_assignment_confidence !== undefined
    const hasGradeAssignmentDetails = grade_assignment_rationale ||
        hasGradeAssignmentConfidence ||
        evidenceIds.length > 0 ||
        source_standard_scope ||
        standard_variant_type ||
        evidence_granularity ||
        grade_specific_focus ||
        progression_delta ||
        progression_review_note ||
        requires_unit_level_evidence !== undefined ||
        h4gState.isH4G
    const hasDetails = context || practice || teaching_tip || assessment_evidence_type || hasGradeAssignmentDetails

    // Get accent color from subject
    const accentColor = SUBJECT_COLORS[subject_slug] || 'var(--color-primary)'

    // Use either highlightKeyword or highlightTerm
    const searchTerm = highlightKeyword || highlightTerm

    // Close menu on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (
                !menuRef.current?.contains(e.target) &&
                !menuButtonRef.current?.contains(e.target)
            ) {
                setShowMenu(false)
            }
        }
        if (showMenu) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [showMenu])

    useEffect(() => {
        if (!showMenu) return undefined
        const firstItem = menuRef.current?.querySelector('[role="menuitem"]')
        requestAnimationFrame(() => firstItem?.focus())
        const handleKeyDown = event => {
            if (event.key !== 'Escape') return
            setShowMenu(false)
            requestAnimationFrame(() => menuButtonRef.current?.focus())
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [showMenu])

    const handleMenuKeyDown = event => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])]
        if (!items.length) return
        const currentIndex = items.indexOf(document.activeElement)
        const nextIndex = event.key === 'Home'
            ? 0
            : event.key === 'End'
                ? items.length - 1
                : event.key === 'ArrowDown'
                    ? (currentIndex + 1) % items.length
                    : (currentIndex - 1 + items.length) % items.length
        items[nextIndex]?.focus()
    }

    // Highlight keyword in text
    const highlightText = (text) => {
        if (!searchTerm || !text) return text
        try {
            const regex = new RegExp(`(${escapeRegex(searchTerm)})`, 'gi')
            const parts = text.split(regex)
            return parts.map((part, i) =>
                regex.test(part) ? <mark key={i} className={styles['keyword-highlight']}>{part}</mark> : part
            )
        } catch {
            return text
        }
    }

    // Extract TS code (e.g., "TS2.1" → "TS2")
    const getTSCode = (ts) => {
        if (!ts) return null
        const tsCode = ts.split('.')[0]
        return tsCode.match(/^TS[1-7]$/) ? tsCode : null
    }

    // Get unique TS codes
    const allTSCodes = [
        ...(ts_primary || []).map(getTSCode),
        ...(ts_secondary || []).map(getTSCode)
    ].filter(Boolean)
    const uniqueTSCodes = [...new Set(allTSCodes)]

    // Copy code to clipboard
    const handleCopyCode = async () => {
        try {
            await navigator.clipboard.writeText(code)
            showToast(`已复制 ${code}`, 'success')
            setShowMenu(false)
        } catch {
            showToast('无法访问剪贴板，请手动复制标准编码', 'error')
        }
    }

    // Display public-facing subcategory, not the H4G standard title/topic.
    const primaryLabel = display_subcategory || subdomain || domain || ''
    const secondaryLabel = domain && primaryLabel !== domain ? domain : ''
    const quickPreviewText = context || teaching_tip || practice || assessment_evidence_type
    const standardTextLink = (
        <Link to={`/standards/${code}`} className={styles['standard-text-link']}>
            {h4gState.shouldLeadWithGradeFocus && (
                <span className={styles['source-standard-label']}>{h4gState.sourceTextLabel}</span>
            )}
            <p className={`${styles['standard-text']} ${h4gState.shouldLeadWithGradeFocus ? styles['source-standard-text'] : ''}`}>
                {highlightText(standardText)}
            </p>
        </Link>
    )

    return (
        <div
            className={`${styles['standard-card']} ${isExpanded ? styles.expanded : ''}`}
            style={{ '--card-accent': accentColor }}
            data-kb-component="standard-card"
        >
            <Toast message={toast?.message} tone={toast?.tone} onDismiss={dismissToast} />

            {/* Header Row */}
            <div className={styles['standard-card-header']}>
                <div className={styles['standard-card-labels']}>
                    <code className={styles['standard-code']}>{code}</code>
                    {contextLabel ? (
                        <span className={styles['comparison-context']} data-kb-comparison-context={contextLabel}>
                            {contextLabel}
                        </span>
                    ) : null}
                    {/* Public subcategory as primary identifier */}
                    {primaryLabel && (
                        <span className={styles['subdomain-label']}>{primaryLabel}</span>
                    )}
                    {/* Show domain as secondary when it adds information */}
                    {secondaryLabel && (
                        <span className={styles['domain-label']}>{secondaryLabel}</span>
                    )}
                    {isLowConfidence && (
                        <span className={styles['review-status-chip']}>低置信度</span>
                    )}
                    {needsGradeDifferentiation && (
                        <span className={`${styles['review-status-chip']} ${styles['needs-differentiation']}`}>待年级化细分</span>
                    )}
                    {h4gState.statusLabel && (
                        <span className={`${styles['review-status-chip']} ${styles[`h4g-status-${h4gState.isFinalReady ? 'ready' : h4gState.isCandidate ? 'candidate' : 'pending'}`]}`}>
                            {h4gState.statusLabel}
                        </span>
                    )}
                </div>

                <div className={styles['standard-card-actions']}>
                    {/* Grade band chip - secondary (hover reveal) */}
                    <span
                        className={`${styles['grade-band-chip']} ${styles['action-secondary']}`}
                        style={{
                            '--band-color': gradeBandInfo.color,
                            '--band-bg': gradeBandInfo.bgColor
                        }}
                    >
                        {gradeBandInfo.label || grade_band}
                    </span>

                    {/* Favorite - primary (always visible) */}
                    <div className={styles['action-primary']}>
                        <FavoriteButton code={code} size="small" />
                    </div>

                    <Tooltip content="复制标准 ID">
                        <button
                            className={`${styles['action-btn']} ${styles['action-secondary']}`}
                            onClick={handleCopyCode}
                            aria-label="复制标准 ID"
                        >
                            <CopyIcon size={16} aria-hidden="true" />
                        </button>
                    </Tooltip>

                    {/* More menu - always visible */}
                    <div className={styles['menu-container']}>
                        <button
                            ref={menuButtonRef}
                            className={styles['menu-btn']}
                            onClick={() => setShowMenu(!showMenu)}
                            aria-label="更多操作"
                            aria-expanded={showMenu}
                            aria-controls={`standard-actions-${code}`}
                        >
                            <DotsThreeIcon size={20} weight="bold" aria-hidden="true" />
                        </button>
                        {showMenu && createPortal(
                            <div
                                ref={menuRef}
                                className={styles['menu-dropdown']}
                                id={`standard-actions-${code}`}
                                role="menu"
                                aria-label={`${code} 操作`}
                                style={menuStyle}
                                data-ready={menuPositioned || undefined}
                                data-placement={menuPlacement.split('-')[0]}
                                onKeyDown={handleMenuKeyDown}
                            >
                                <button type="button" role="menuitem" onClick={handleCopyCode} className={styles['menu-item']}>
                                    <CopyIcon className={styles['menu-icon']} size={17} aria-hidden="true" />
                                    复制 ID
                                </button>
                                <Link
                                    to={`/standards/${code}`}
                                    className={styles['menu-item']}
                                    role="menuitem"
                                    onClick={() => setShowMenu(false)}
                                >
                                    <FileTextIcon className={styles['menu-icon']} size={17} aria-hidden="true" />
                                    查看详情
                                </Link>
                            </div>,
                            document.body
                        )}
                    </div>

                    {/* Expand button - secondary (hover reveal) */}
                    {hasDetails && (
                        <button
                            className={`${styles['expand-btn']} ${styles['action-secondary']}`}
                            aria-label={isExpanded ? '收起' : '展开'}
                            onClick={() => setIsExpanded(!isExpanded)}
                        >
                            {isExpanded
                                ? <CaretUpIcon className={styles['expand-icon']} size={16} aria-hidden="true" />
                                : <CaretDownIcon className={styles['expand-icon']} size={16} aria-hidden="true" />}
                        </button>
                    )}
                </div>
            </div>

            {/* Body - Standard Statement (Visual Focus) */}
            <div className={styles['standard-card-body']}>
                {h4gState.showGradeLens && (
                    <div className={`${styles['h4g-grade-lens']} ${h4gState.shouldLeadWithGradeFocus ? styles['has-focus'] : styles.pending}`}>
                        <span className={styles['h4g-grade-lens-label']}>{h4gState.focusLabel}</span>
                        <p>{highlightText(h4gState.shouldLeadWithGradeFocus ? h4gState.gradeFocus : h4gState.statusMessage)}</p>
                    </div>
                )}
                {quickPreview && quickPreviewText ? (
                    <Tooltip
                        placement="top-start"
                        content={(
                            <span className={styles['standard-quick-preview']} data-kb-standard-quick-preview={code}>
                                <span>教学线索 · {code}</span>
                                <strong>{quickPreviewText}</strong>
                                {uniqueTSCodes.length > 0 ? <small>关联能力 {uniqueTSCodes.join(' · ')}</small> : null}
                            </span>
                        )}
                    >
                        {standardTextLink}
                    </Tooltip>
                ) : standardTextLink}
            </div>

            {/* TS Badges Row */}
            {uniqueTSCodes.length > 0 && (
                <div className={styles['standard-ts-row']}>
                    {uniqueTSCodes.map(tsCode => (
                        <Link
                            key={tsCode}
                            to={`/skills/${tsCode}`}
                            className={styles['ts-badge-link']}
                        >
                            <TSBadge tsId={tsCode} size="sm" variant="soft" />
                        </Link>
                    ))}
                </div>
            )}

            {/* Expanded Details */}
            {isExpanded && hasDetails && (
                <div className={`${styles['standard-card-details']} animate-slide-up`}>
                    {context && (
                        <div className={styles['detail-section']}>
                            <h4 className={styles['detail-label']}><MapPinLineIcon size={17} aria-hidden="true" />情境说明</h4>
                            <p className={styles['detail-text']}>{highlightText(context)}</p>
                        </div>
                    )}

                    {practice && (
                        <div className={styles['detail-section']}>
                            <h4 className={styles['detail-label']}><PencilLineIcon size={17} aria-hidden="true" />实践建议</h4>
                            <p className={styles['detail-text']}>{highlightText(practice)}</p>
                        </div>
                    )}

                    {teaching_tip && (
                        <div className={styles['detail-section']}>
                            <h4 className={styles['detail-label']}><LightbulbIcon size={17} aria-hidden="true" />教学提示</h4>
                            <p className={styles['detail-text']}>{highlightText(teaching_tip)}</p>
                        </div>
                    )}

                    {assessment_evidence_type && (
                        <div className={styles['detail-section']}>
                            <h4 className={styles['detail-label']}><ChartBarIcon size={17} aria-hidden="true" />评价证据</h4>
                            <p className={styles['detail-text']}>{assessment_evidence_type}</p>
                        </div>
                    )}

                    {hasGradeAssignmentDetails && (
                        <div className={`${styles['detail-section']} ${styles['grade-assignment-section']}`}>
                            <h4 className={styles['detail-label']}>年级归属依据（非课标原文）</h4>
                            {grade_assignment_rationale && (
                                <p className={styles['detail-text']}>{grade_assignment_rationale}</p>
                            )}
                            {standard_title && (
                                <p className={styles['detail-text']}>标准名称：{standard_title}</p>
                            )}
                            {h4gState.isH4G && !h4gState.hasUsableGradeFocus && (
                                <p className={styles['detail-text']}>{h4gState.statusMessage}</p>
                            )}
                            {h4gState.hasUsableGradeFocus && (
                                <p className={styles['detail-text']}>{h4gState.gradeFocus}</p>
                            )}
                            {progression_review_note && (
                                <p className={styles['detail-text']}>{progression_review_note}</p>
                            )}
                            <div className={styles['grade-assignment-meta']}>
                                {grade_assignment_type && (
                                    <span>{grade_assignment_type}</span>
                                )}
                                {hasGradeAssignmentConfidence && (
                                    <span>置信度 {Math.round(Number(grade_assignment_confidence) * 100)}%</span>
                                )}
                                {evidenceIds.length > 0 && (
                                    <span>教材证据 {evidenceIds.length} 条</span>
                                )}
                                {source_standard_scope && (
                                    <span>{source_standard_scope}</span>
                                )}
                                {standard_variant_type && (
                                    <span>{standard_variant_type}</span>
                                )}
                                {evidence_granularity && (
                                    <span>{evidence_granularity}</span>
                                )}
                                {progression_delta && (
                                    <span>{progression_delta}</span>
                                )}
                                {requires_unit_level_evidence && (
                                    <span>需单元级证据</span>
                                )}
                            </div>
                        </div>
                    )}

                    <div className={styles['detail-actions']}>
                        <Link to={`/standards/${code}`} className={`btn btn-primary ${styles['btn-sm']}`}>
                            查看详情 →
                        </Link>
                    </div>
                </div>
            )}
        </div>
    )
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default StandardCard
