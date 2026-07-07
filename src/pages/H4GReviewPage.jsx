import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GRADE_BANDS, SUBJECT_COLORS } from '../data/dataLoader'
import { ErrorState, LoadingState } from '../components/StateComponents'
import './H4GReviewPage.css'

const PACKET_URL = '/data/reviews/h4g_source_aligned_standard_review_packet_v2.json'
const REVIEW_STORAGE_KEY = 'h4g-source-aligned-standard-review-v2'

const STATUS_OPTIONS = [
    { value: 'pending', label: '未审核' },
    { value: 'approved', label: '通过候选' },
    { value: 'needs_fix', label: '需修改' },
    { value: 'rejected', label: '不采用' }
]

const ISSUE_OPTIONS = [
    { value: 'candidate_text_wrong', label: '候选文本不对' },
    { value: 'source_mismatch', label: 'source 对齐问题' },
    { value: 'grade_progression_weak', label: '年级差异弱' },
    { value: 'support_source_overused', label: 'supporting source 过重' },
    { value: 'textbook_evidence_thin', label: '教材证据不足' },
    { value: 'fluency_issue', label: '表述不顺' }
]

const QUALITY_OPTIONS = [
    { value: 'all', label: '全部变化' },
    { value: 'changed', label: 'standard 已变化' },
    { value: 'template_removed', label: '模板已移除' },
    { value: 'candidate_template_hits', label: '候选仍有模板痕迹' },
    { value: 'low_overlap', label: 'source overlap 低' }
]

function safeJsonParse(value, fallback) {
    try {
        return value ? JSON.parse(value) : fallback
    } catch {
        return fallback
    }
}

function shortText(value, max = 120) {
    const text = String(value || '').replace(/\s+/g, ' ').trim()
    return text.length > max ? `${text.slice(0, max)}...` : text
}

function displayValue(value) {
    if (Array.isArray(value)) return value.join(' / ')
    if (value && typeof value === 'object') return JSON.stringify(value)
    return String(value ?? '')
}

function formatScore(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a'
    return Number(value).toFixed(2)
}

function qualityMatches(group, selectedQuality) {
    if (selectedQuality === 'all') return true
    if (selectedQuality === 'changed') return group.changed_records > 0
    if (selectedQuality === 'template_removed') return group.template_removed_records > 0
    if (selectedQuality === 'candidate_template_hits') return group.candidate_template_hit_records > 0
    if (selectedQuality === 'low_overlap') return group.low_overlap_records > 0
    return true
}

function H4GReviewPage() {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [packet, setPacket] = useState(null)
    const [decisions, setDecisions] = useState(() => safeJsonParse(localStorage.getItem(REVIEW_STORAGE_KEY), {}))
    const [selectedSubject, setSelectedSubject] = useState('all')
    const [selectedPriority, setSelectedPriority] = useState('all')
    const [selectedStatus, setSelectedStatus] = useState('all')
    const [selectedQuality, setSelectedQuality] = useState('all')
    const [query, setQuery] = useState('')
    const [selectedGroupId, setSelectedGroupId] = useState('')

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        fetch(PACKET_URL, { cache: 'no-store' })
            .then(response => {
                if (!response.ok) throw new Error(`无法加载 review packet: ${response.status}`)
                return response.json()
            })
            .then(payload => {
                if (cancelled) return
                setPacket(payload)
                setLoading(false)
            })
            .catch(err => {
                if (cancelled) return
                setError(err.message)
                setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(decisions))
    }, [decisions])

    const groups = packet?.groups || []
    const subjects = packet?.subjects || []

    const filteredGroups = useMemo(() => {
        const keyword = query.trim().toLowerCase()
        return groups.filter(group => {
            const decision = decisions[group.group_id]
            const status = decision?.status || 'pending'
            if (selectedSubject !== 'all' && group.subject_slug !== selectedSubject) return false
            if (selectedPriority !== 'all' && group.priority !== selectedPriority) return false
            if (selectedStatus !== 'all' && status !== selectedStatus) return false
            if (!qualityMatches(group, selectedQuality)) return false
            if (!keyword) return true
            const haystack = [
                group.group_id,
                group.subject,
                group.topic,
                group.category,
                group.source_anchor_subcategory,
                group.source_standard_original,
                group.supporting_source_standard_original,
                group.previous_source_standard_original,
                ...group.codes,
                ...group.records.flatMap(row => [
                    row.current_standard,
                    row.candidate_standard,
                    row.current_grade_specific_focus,
                    row.candidate_grade_specific_focus
                ])
            ].join(' ').toLowerCase()
            return haystack.includes(keyword)
        })
    }, [groups, decisions, selectedSubject, selectedPriority, selectedStatus, selectedQuality, query])

    useEffect(() => {
        if (!filteredGroups.length) {
            setSelectedGroupId('')
            return
        }
        if (!filteredGroups.some(group => group.group_id === selectedGroupId)) {
            setSelectedGroupId(filteredGroups[0].group_id)
        }
    }, [filteredGroups, selectedGroupId])

    const selectedGroup = useMemo(() => {
        return filteredGroups.find(group => group.group_id === selectedGroupId) || filteredGroups[0]
    }, [filteredGroups, selectedGroupId])

    const summary = useMemo(() => {
        const byStatus = Object.fromEntries(STATUS_OPTIONS.map(item => [item.value, 0]))
        for (const group of groups) {
            const status = decisions[group.group_id]?.status || 'pending'
            byStatus[status] = (byStatus[status] || 0) + 1
        }
        return {
            byStatus,
            changed: packet?.summary?.changed_records || 0,
            groups: groups.length,
            records: packet?.summary?.h4g_records || 0,
            reviewed: groups.length - (byStatus.pending || 0),
            templateRemoved: packet?.summary?.template_removed_records || 0
        }
    }, [groups, decisions, packet])

    const updateDecision = (groupId, patch) => {
        setDecisions(prev => ({
            ...prev,
            [groupId]: {
                issues: [],
                note: '',
                status: 'pending',
                ...(prev[groupId] || {}),
                ...patch,
                updatedAt: new Date().toISOString()
            }
        }))
    }

    const toggleIssue = (groupId, issue) => {
        const current = decisions[groupId]?.issues || []
        const nextIssues = current.includes(issue)
            ? current.filter(item => item !== issue)
            : [...current, issue]
        updateDecision(groupId, { issues: nextIssues })
    }

    const exportDecisions = () => {
        const payload = {
            decisions,
            exported_at: new Date().toISOString(),
            packet_contract_version: packet?.contract_version,
            packet_generated_at: packet?.generated_at,
            packet_inputs: packet?.inputs,
            review_surface: REVIEW_STORAGE_KEY,
            summary
        }
        const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `h4g-source-aligned-review-decisions-${new Date().toISOString().slice(0, 10)}.json`
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
    }

    const clearDecisions = () => {
        if (window.confirm('清空本地审核记录？')) setDecisions({})
    }

    if (loading) {
        return (
            <div className="page-content container">
                <LoadingState message="加载 H4G 对比审核数据..." />
            </div>
        )
    }

    if (error) {
        return (
            <div className="page-content container">
                <ErrorState title="审核数据加载失败" message={error} onRetry={() => window.location.reload()} />
            </div>
        )
    }

    return (
        <div className="h4g-review-page">
            <section className="h4g-review-hero">
                <div className="container h4g-review-hero-inner">
                    <div>
                        <h1>H4G Source-Aligned 审核</h1>
                        <p>Current public standard vs source-aligned candidate standard</p>
                    </div>
                    <div className="h4g-review-summary">
                        <SummaryTile label="总组数" value={summary.groups} />
                        <SummaryTile label="已审核" value={summary.reviewed} />
                        <SummaryTile label="已变化" value={summary.changed} tone="changed" />
                        <SummaryTile label="模板移除" value={summary.templateRemoved} tone="approved" />
                        <SummaryTile label="需修改" value={summary.byStatus.needs_fix || 0} tone="needs-fix" />
                    </div>
                </div>
            </section>

            <section className="h4g-review-toolbar">
                <div className="container h4g-review-toolbar-inner">
                    <label className="review-field">
                        <span>学科</span>
                        <select value={selectedSubject} onChange={event => setSelectedSubject(event.target.value)}>
                            <option value="all">全部学科</option>
                            {subjects.map(subject => (
                                <option key={subject.subject_slug} value={subject.subject_slug}>{subject.subject}</option>
                            ))}
                        </select>
                    </label>
                    <label className="review-field">
                        <span>优先级</span>
                        <select value={selectedPriority} onChange={event => setSelectedPriority(event.target.value)}>
                            <option value="all">全部优先级</option>
                            {['P0', 'P1', 'P2', 'P3'].map(priority => (
                                <option key={priority} value={priority}>{priority}</option>
                            ))}
                        </select>
                    </label>
                    <label className="review-field">
                        <span>状态</span>
                        <select value={selectedStatus} onChange={event => setSelectedStatus(event.target.value)}>
                            <option value="all">全部状态</option>
                            {STATUS_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className="review-field">
                        <span>变化</span>
                        <select value={selectedQuality} onChange={event => setSelectedQuality(event.target.value)}>
                            {QUALITY_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className="review-field review-search-field">
                        <span>搜索</span>
                        <input
                            type="search"
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="code、source、candidate..."
                        />
                    </label>
                    <div className="review-toolbar-actions">
                        <button type="button" className="btn btn-secondary" onClick={exportDecisions}>导出结果</button>
                        <button type="button" className="btn btn-ghost" onClick={clearDecisions}>清空本地</button>
                    </div>
                </div>
            </section>

            <section className="h4g-review-workspace container">
                <aside className="review-queue">
                    <div className="queue-header">
                        <h2>审核队列</h2>
                        <span>{filteredGroups.length} 组</span>
                    </div>
                    <div className="queue-list">
                        {filteredGroups.map(group => (
                            <button
                                key={group.group_id}
                                type="button"
                                className={`queue-item ${selectedGroup?.group_id === group.group_id ? 'active' : ''}`}
                                onClick={() => setSelectedGroupId(group.group_id)}
                                style={{ '--subject-color': SUBJECT_COLORS[group.subject_slug] || 'var(--color-primary)' }}
                            >
                                <div className="queue-item-topline">
                                    <span className={`priority-chip priority-${group.priority.toLowerCase()}`}>{group.priority}</span>
                                    <span className={`decision-dot decision-${decisions[group.group_id]?.status || 'pending'}`}>
                                        {STATUS_OPTIONS.find(item => item.value === (decisions[group.group_id]?.status || 'pending'))?.label}
                                    </span>
                                </div>
                                <strong>{group.topic}</strong>
                                <span>{group.subject} / {group.category}</span>
                                <span>{group.changed_records} changed / {group.template_removed_records} template removed</span>
                            </button>
                        ))}
                    </div>
                </aside>

                <main className="review-detail">
                    {selectedGroup ? (
                        <ReviewDetail
                            decision={decisions[selectedGroup.group_id] || { status: 'pending', issues: [], note: '' }}
                            group={selectedGroup}
                            packet={packet}
                            onSetStatus={(status) => updateDecision(selectedGroup.group_id, { status })}
                            onToggleIssue={(issue) => toggleIssue(selectedGroup.group_id, issue)}
                            onUpdateNote={(note) => updateDecision(selectedGroup.group_id, { note })}
                        />
                    ) : (
                        <div className="review-empty-state">没有符合条件的审核组</div>
                    )}
                </main>
            </section>
        </div>
    )
}

function SummaryTile({ label, value, tone = '' }) {
    return (
        <div className={`summary-tile ${tone ? `summary-${tone}` : ''}`}>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    )
}

function ReviewDetail({ decision, group, packet, onSetStatus, onToggleIssue, onUpdateNote }) {
    const candidateSplitOk = group.candidate_distinct_standard_count === group.records.length
    const templateRemovedOk = group.candidate_template_hit_records === 0
    const lowOverlap = group.low_overlap_records > 0

    return (
        <article className="review-detail-panel">
            <header className="detail-header" style={{ '--subject-color': SUBJECT_COLORS[group.subject_slug] || 'var(--color-primary)' }}>
                <div>
                    <div className="detail-kicker">
                        <span className={`priority-chip priority-${group.priority.toLowerCase()}`}>{group.priority}</span>
                        <span>{group.subject}</span>
                        <span>{group.group_id}</span>
                    </div>
                    <h2>{group.topic}</h2>
                    <p>{group.category} / {group.source_anchor_subcategory}</p>
                </div>
                <div className="detail-status-actions">
                    {STATUS_OPTIONS.map(option => (
                        <button
                            key={option.value}
                            type="button"
                            className={`status-button status-${option.value} ${decision.status === option.value ? 'active' : ''}`}
                            onClick={() => onSetStatus(option.value)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </header>

            <section className="review-check-grid">
                <CheckCard label="candidate audit" value={packet?.summary?.candidate_audit_valid ? 'valid' : 'invalid'} tone={packet?.summary?.candidate_audit_valid ? 'ok' : 'warn'} />
                <CheckCard label="candidate split" value={`${group.candidate_distinct_standard_count}/${group.records.length} distinct`} tone={candidateSplitOk ? 'ok' : 'warn'} />
                <CheckCard label="template trace" value={templateRemovedOk ? 'removed' : `${group.candidate_template_hit_records} hit`} tone={templateRemovedOk ? 'ok' : 'warn'} />
                <CheckCard label="min source overlap" value={formatScore(group.source_aligned_source_overlap_min)} tone={lowOverlap ? 'warn' : 'ok'} />
            </section>

            <section className="source-compare source-compare-three">
                <SourceBlock title="Corrected Source" text={group.source_standard_original} />
                <SourceBlock title="Supporting Source" text={group.supporting_source_standard_original || '无'} muted />
                <SourceBlock title="Previous Source" text={group.previous_source_standard_original || '无'} muted />
            </section>

            {(group.risk_reasons.length > 0 || Object.keys(group.source_anchor_tags).length > 0) && (
                <section className="review-meta-strip">
                    {group.risk_reasons.map(reason => (
                        <span key={reason} className="risk-chip">{reason}</span>
                    ))}
                    {Object.entries(group.source_anchor_tags).map(([key, value]) => (
                        <span key={key} className="tag-chip">{key}: {displayValue(value)}</span>
                    ))}
                </section>
            )}

            <section className="grade-triplet">
                {group.records.map(row => (
                    <div key={row.code} className={`grade-column ${row.standard_changed ? 'grade-column-changed' : ''} ${Number(row.source_aligned_source_overlap) < 0.12 ? 'grade-column-low-overlap' : ''}`}>
                        <div className="grade-column-header">
                            <span
                                className="grade-band-mini"
                                style={{
                                    '--band-color': GRADE_BANDS[row.grade_band]?.color,
                                    '--band-bg': GRADE_BANDS[row.grade_band]?.bgColor
                                }}
                            >
                                {GRADE_BANDS[row.grade_band]?.range || row.grade_band}
                            </span>
                            <Link to={row.current_standard_url}>{row.code}</Link>
                        </div>

                        <div className="standard-compare-stack">
                            <div className="standard-compare-card current-standard-block">
                                <h3>Current Public Standard</h3>
                                <p>{row.current_standard}</p>
                            </div>
                            <div className="standard-compare-card candidate-standard-block">
                                <h3>Source-Aligned Candidate</h3>
                                <p>{row.candidate_standard}</p>
                            </div>
                        </div>

                        <div className="focus-compare">
                            <div>
                                <h3>Current Focus</h3>
                                <p>{row.current_grade_specific_focus}</p>
                            </div>
                            <div>
                                <h3>Candidate Focus</h3>
                                <p>{row.candidate_grade_specific_focus}</p>
                            </div>
                        </div>

                        <dl>
                            <div>
                                <dt>overlap</dt>
                                <dd>{formatScore(row.source_aligned_source_overlap)}</dd>
                            </div>
                            <div>
                                <dt>template</dt>
                                <dd>{row.template_removed ? 'removed' : row.candidate_template_hits.length ? row.candidate_template_hits.join(' / ') : 'none'}</dd>
                            </div>
                            <div>
                                <dt>证据粒度</dt>
                                <dd>{row.evidence_granularity || 'none'}</dd>
                            </div>
                            <div>
                                <dt>candidate</dt>
                                <dd>{shortText(row.source_aligned_rewrite_status, 80)}</dd>
                            </div>
                            <div>
                                <dt>candidate topic</dt>
                                <dd>{row.candidate_topic || group.topic}</dd>
                            </div>
                            <div>
                                <dt>metadata leak</dt>
                                <dd>{row.candidate_metadata_leak_hits?.length ? row.candidate_metadata_leak_hits.join(' / ') : 'none'}</dd>
                            </div>
                        </dl>
                    </div>
                ))}
            </section>

            <section className="decision-panel">
                <div className="issue-options">
                    {ISSUE_OPTIONS.map(option => (
                        <label key={option.value} className={`issue-option ${decision.issues?.includes(option.value) ? 'active' : ''}`}>
                            <input
                                type="checkbox"
                                checked={decision.issues?.includes(option.value) || false}
                                onChange={() => onToggleIssue(option.value)}
                            />
                            <span>{option.label}</span>
                        </label>
                    ))}
                </div>
                <label className="review-note-field">
                    <span>审核备注</span>
                    <textarea
                        value={decision.note || ''}
                        onChange={event => onUpdateNote(event.target.value)}
                        placeholder="记录 candidate 是否可发布、需要如何修 source/年级差异/教材证据"
                        rows={4}
                    />
                </label>
            </section>
        </article>
    )
}

function SourceBlock({ title, text, muted = false }) {
    return (
        <div className={`source-block ${muted ? 'muted' : ''}`}>
            <h3>{title}</h3>
            <p>{text}</p>
        </div>
    )
}

function CheckCard({ label, value, tone = '' }) {
    return (
        <div className={`check-card ${tone ? `check-${tone}` : ''}`}>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    )
}

export default H4GReviewPage
