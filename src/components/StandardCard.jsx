import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { GRADE_BANDS, SUBJECT_COLORS } from '../data/dataLoader'
import TSBadge from './TSBadge'
import FavoriteButton from './FavoriteButton'
import './StandardCard.css'

/**
 * StandardCard - Refined visual hierarchy with hover-reveal actions
 * 
 * Features:
 * - 4px left accent line (color from subject_slug)
 * - Primary action (⭐) always visible
 * - Secondary actions (grade badge, expand) reveal on hover/focus
 * - Mobile: primary + menu always visible, others hidden
 */
function StandardCard({ standard, highlightKeyword = '', highlightTerm = '' }) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [showMenu, setShowMenu] = useState(false)
    const [copyToast, setCopyToast] = useState(false)
    const menuRef = useRef(null)

    const {
        code,
        standard: standardText,
        domain,
        subdomain,
        grade_band,
        subject_slug,
        context,
        practice,
        teaching_tip,
        assessment_evidence_type,
        ts_primary,
        ts_secondary
    } = standard

    const gradeBandInfo = GRADE_BANDS[grade_band] || {}
    const hasDetails = context || practice || teaching_tip || assessment_evidence_type

    // Get accent color from subject
    const accentColor = SUBJECT_COLORS[subject_slug] || 'var(--color-primary)'

    // Use either highlightKeyword or highlightTerm
    const searchTerm = highlightKeyword || highlightTerm

    // Close menu on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setShowMenu(false)
            }
        }
        if (showMenu) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [showMenu])

    // Highlight keyword in text
    const highlightText = (text) => {
        if (!searchTerm || !text) return text
        try {
            const regex = new RegExp(`(${escapeRegex(searchTerm)})`, 'gi')
            const parts = text.split(regex)
            return parts.map((part, i) =>
                regex.test(part) ? <mark key={i} className="keyword-highlight">{part}</mark> : part
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
            setCopyToast(true)
            setTimeout(() => setCopyToast(false), 2000)
            setShowMenu(false)
        } catch (err) {
            console.error('Failed to copy:', err)
        }
    }

    // Display subdomain or domain as primary label
    const primaryLabel = subdomain || domain || ''

    return (
        <div
            className={`standard-card ${isExpanded ? 'expanded' : ''}`}
            style={{ '--card-accent': accentColor }}
        >
            {/* Copy Toast */}
            {copyToast && (
                <div className="copy-toast">已复制 ID</div>
            )}

            {/* Header Row */}
            <div className="standard-card-header">
                <div className="standard-card-labels">
                    {/* Subdomain/Domain as primary identifier */}
                    {primaryLabel && (
                        <span className="subdomain-label">{primaryLabel}</span>
                    )}
                    {/* Show domain as secondary if subdomain exists */}
                    {subdomain && domain && (
                        <span className="domain-label">{domain}</span>
                    )}
                </div>

                <div className="standard-card-actions">
                    {/* Grade band chip - secondary (hover reveal) */}
                    <span
                        className="grade-band-chip action-secondary"
                        style={{
                            '--band-color': gradeBandInfo.color,
                            '--band-bg': gradeBandInfo.bgColor
                        }}
                    >
                        {gradeBandInfo.label || grade_band}
                    </span>

                    {/* Favorite - primary (always visible) */}
                    <div className="action-primary">
                        <FavoriteButton code={code} size="small" />
                    </div>

                    {/* More menu - always visible */}
                    <div className="menu-container" ref={menuRef}>
                        <button
                            className="menu-btn"
                            onClick={() => setShowMenu(!showMenu)}
                            aria-label="更多操作"
                        >
                            ⋯
                        </button>
                        {showMenu && (
                            <div className="menu-dropdown">
                                <button onClick={handleCopyCode} className="menu-item">
                                    <span className="menu-icon">📋</span>
                                    复制 ID
                                </button>
                                <Link
                                    to={`/standards/${code}`}
                                    className="menu-item"
                                    onClick={() => setShowMenu(false)}
                                >
                                    <span className="menu-icon">📄</span>
                                    查看详情
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* Expand button - secondary (hover reveal) */}
                    {hasDetails && (
                        <button
                            className="expand-btn action-secondary"
                            aria-label={isExpanded ? '收起' : '展开'}
                            onClick={() => setIsExpanded(!isExpanded)}
                        >
                            <span className={`expand-icon ${isExpanded ? 'up' : 'down'}`}>▼</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Body - Standard Statement (Visual Focus) */}
            <div className="standard-card-body">
                <Link to={`/standards/${code}`} className="standard-text-link">
                    <p className="standard-text">{highlightText(standardText)}</p>
                </Link>
            </div>

            {/* TS Badges Row */}
            {uniqueTSCodes.length > 0 && (
                <div className="standard-ts-row">
                    {uniqueTSCodes.map(tsCode => (
                        <Link
                            key={tsCode}
                            to={`/skills/${tsCode}`}
                            className="ts-badge-link"
                        >
                            <TSBadge tsId={tsCode} size="sm" variant="soft" />
                        </Link>
                    ))}
                </div>
            )}

            {/* Footer - ID (hover reveal on desktop, hidden on mobile) */}
            <div className="standard-card-footer-meta">
                <span className="standard-id">ID: {code}</span>
                <button
                    className="copy-btn"
                    onClick={handleCopyCode}
                    aria-label="复制标准 ID"
                    title="复制 ID"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                </button>
            </div>

            {/* Expanded Details */}
            {isExpanded && hasDetails && (
                <div className="standard-card-details animate-slide-up">
                    {context && (
                        <div className="detail-section">
                            <h4 className="detail-label">🎯 情境说明</h4>
                            <p className="detail-text">{highlightText(context)}</p>
                        </div>
                    )}

                    {practice && (
                        <div className="detail-section">
                            <h4 className="detail-label">📝 实践建议</h4>
                            <p className="detail-text">{highlightText(practice)}</p>
                        </div>
                    )}

                    {teaching_tip && (
                        <div className="detail-section">
                            <h4 className="detail-label">💡 教学提示</h4>
                            <p className="detail-text">{highlightText(teaching_tip)}</p>
                        </div>
                    )}

                    {assessment_evidence_type && (
                        <div className="detail-section">
                            <h4 className="detail-label">📊 评价证据</h4>
                            <p className="detail-text">{assessment_evidence_type}</p>
                        </div>
                    )}

                    <div className="detail-actions">
                        <Link to={`/standards/${code}`} className="btn btn-sm btn-primary">
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
