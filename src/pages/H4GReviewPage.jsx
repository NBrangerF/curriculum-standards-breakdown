import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
    Button as AriaButton,
    Dialog,
    DialogTrigger,
    Heading,
    Modal,
    ModalOverlay
} from '../ui/primitives/dialog'
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import { GRADE_BANDS, SUBJECT_COLORS } from '../data/dataLoader'
import { ErrorState, LoadingState } from '../components/StateComponents'
import styles from './H4GReviewPage.module.css'

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
    const queueScrollRef = useRef(null)

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

    const getQueueItemKey = useCallback(
        index => filteredGroups[index]?.group_id || index,
        [filteredGroups]
    )
    const queueVirtualizer = useVirtualizer({
        count: filteredGroups.length,
        getScrollElement: () => queueScrollRef.current,
        estimateSize: () => 112,
        getItemKey: getQueueItemKey,
        overscan: 6,
        useFlushSync: false
    })

    useEffect(() => {
        const selectedIndex = filteredGroups.findIndex(group => group.group_id === selectedGroupId)
        if (selectedIndex >= 0) queueVirtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
    }, [filteredGroups, queueVirtualizer, selectedGroupId])

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

    const focusQueueItem = useCallback(function focusVirtualQueueItem(index, attempt = 0) {
        const target = document.querySelector(`[data-kb-h4g-queue-index="${index}"]`)
        if (target) {
            target.focus({ preventScroll: true })
            return
        }
        if (attempt < 12) requestAnimationFrame(() => focusVirtualQueueItem(index, attempt + 1))
    }, [])

    const handleQueueKeyDown = (event, currentIndex) => {
        const keyTargets = {
            ArrowDown: Math.min(currentIndex + 1, filteredGroups.length - 1),
            ArrowUp: Math.max(currentIndex - 1, 0),
            Home: 0,
            End: filteredGroups.length - 1
        }
        if (!(event.key in keyTargets) || keyTargets[event.key] < 0) return
        event.preventDefault()
        const targetIndex = keyTargets[event.key]
        const targetGroup = filteredGroups[targetIndex]
        setSelectedGroupId(targetGroup.group_id)
        queueVirtualizer.scrollToIndex(targetIndex, { align: 'auto' })
        requestAnimationFrame(() => focusQueueItem(targetIndex))
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
        <div className={styles['h4g-review-page']} data-kb-route="h4g-review">
            <section className={styles['h4g-review-hero']}>
                <div className={`container ${styles['h4g-review-hero-inner']}`}>
                    <div>
                        <span className={styles['h4g-review-coordinate']} aria-hidden="true">INTERNAL / REVIEW WORKBENCH</span>
                        <h1>H4G Source-Aligned 审核</h1>
                        <p>当前公开标准与 source-aligned 候选标准的逐组对照工作台。</p>
                    </div>
                    <div className={styles['h4g-review-summary']}>
                        <SummaryTile label="总组数" value={summary.groups} />
                        <SummaryTile label="已审核" value={summary.reviewed} />
                        <SummaryTile label="已变化" value={summary.changed} tone="changed" />
                        <SummaryTile label="模板移除" value={summary.templateRemoved} tone="approved" />
                        <SummaryTile label="需修改" value={summary.byStatus.needs_fix || 0} tone="needs-fix" />
                    </div>
                </div>
            </section>

            <section className={styles['h4g-review-toolbar']} aria-label="审核筛选与操作">
                <div className={`container ${styles['h4g-review-toolbar-inner']}`}>
                    <label className={styles['review-field']}>
                        <span>学科</span>
                        <select value={selectedSubject} onChange={event => setSelectedSubject(event.target.value)}>
                            <option value="all">全部学科</option>
                            {subjects.map(subject => (
                                <option key={subject.subject_slug} value={subject.subject_slug}>{subject.subject}</option>
                            ))}
                        </select>
                    </label>
                    <label className={styles['review-field']}>
                        <span>优先级</span>
                        <select value={selectedPriority} onChange={event => setSelectedPriority(event.target.value)}>
                            <option value="all">全部优先级</option>
                            {['P0', 'P1', 'P2', 'P3'].map(priority => (
                                <option key={priority} value={priority}>{priority}</option>
                            ))}
                        </select>
                    </label>
                    <label className={styles['review-field']}>
                        <span>状态</span>
                        <select value={selectedStatus} onChange={event => setSelectedStatus(event.target.value)}>
                            <option value="all">全部状态</option>
                            {STATUS_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className={styles['review-field']}>
                        <span>变化</span>
                        <select value={selectedQuality} onChange={event => setSelectedQuality(event.target.value)}>
                            {QUALITY_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className={`${styles['review-field']} ${styles['review-search-field']}`}>
                        <span>搜索</span>
                        <div className={styles['review-search-control']}>
                            <MagnifyingGlassIcon size={17} aria-hidden="true" />
                            <input
                                type="search"
                                value={query}
                                onChange={event => setQuery(event.target.value)}
                                placeholder="code、source、candidate"
                            />
                            {query ? (
                                <button type="button" onClick={() => setQuery('')} aria-label="清除审核搜索">
                                    <XIcon size={15} aria-hidden="true" />
                                </button>
                            ) : null}
                        </div>
                    </label>
                    <div className={styles['review-toolbar-actions']}>
                        <button type="button" className="btn btn-secondary" onClick={exportDecisions}>
                            <DownloadSimpleIcon size={17} aria-hidden="true" />导出结果
                        </button>
                        <DialogTrigger>
                            <AriaButton className="btn btn-ghost">
                                <TrashIcon size={17} aria-hidden="true" />清空本地
                            </AriaButton>
                            <ModalOverlay className={styles['h4g-modal-overlay']} isDismissable>
                                <Modal className={styles['h4g-modal']}>
                                    <Dialog className={styles['h4g-dialog']} aria-label="清空本地审核记录">
                                        {({ close }) => (
                                            <>
                                                <div className={styles['h4g-dialog-icon']} aria-hidden="true"><TrashIcon size={22} /></div>
                                                <Heading slot="title">清空本地审核记录</Heading>
                                                <p>所有审核状态、问题标签和备注都会从当前浏览器移除，且无法撤销。审核数据本身不会被修改。</p>
                                                <div>
                                                    <AriaButton className="btn btn-ghost" onPress={close}>取消</AriaButton>
                                                    <AriaButton className={`btn ${styles['h4g-danger-button']}`} onPress={() => { setDecisions({}); close() }}>确认清空</AriaButton>
                                                </div>
                                            </>
                                        )}
                                    </Dialog>
                                </Modal>
                            </ModalOverlay>
                        </DialogTrigger>
                    </div>
                </div>
            </section>

            <section className={`${styles['h4g-review-workspace']} container`} aria-label="审核工作台">
                <aside className={styles['review-queue']}>
                    <div className={styles['queue-header']}>
                        <h2 id="h4g-review-queue-title">审核队列</h2>
                        <span>{filteredGroups.length} 组</span>
                    </div>
                    <div
                        ref={queueScrollRef}
                        className={styles['queue-list']}
                        aria-labelledby="h4g-review-queue-title"
                        data-kb-component="h4g-virtual-queue"
                        data-kb-total-count={filteredGroups.length}
                    >
                        <div
                            className={styles['queue-virtualizer']}
                            style={{ height: `${queueVirtualizer.getTotalSize()}px` }}
                        >
                            {queueVirtualizer.getVirtualItems().map(virtualItem => {
                                const group = filteredGroups[virtualItem.index]
                                return (
                                    <div
                                        key={virtualItem.key}
                                        ref={queueVirtualizer.measureElement}
                                        className={styles['queue-virtual-row']}
                                        data-index={virtualItem.index}
                                        style={{ transform: `translateY(${virtualItem.start}px)` }}
                                    >
                                        <button
                                            type="button"
                                            className={`${styles['queue-item']} ${selectedGroup?.group_id === group.group_id ? styles.active : ''}`}
                                            onClick={() => setSelectedGroupId(group.group_id)}
                                            onKeyDown={event => handleQueueKeyDown(event, virtualItem.index)}
                                            aria-pressed={selectedGroup?.group_id === group.group_id}
                                            aria-label={`${group.topic}，${group.subject}，${group.category}，${group.priority}，${STATUS_OPTIONS.find(item => item.value === (decisions[group.group_id]?.status || 'pending'))?.label}`}
                                            tabIndex={selectedGroup?.group_id === group.group_id ? 0 : -1}
                                            data-kb-h4g-queue-index={virtualItem.index}
                                            style={{ '--subject-color': SUBJECT_COLORS[group.subject_slug] || 'var(--color-primary)' }}
                                        >
                                            <div className={styles['queue-item-topline']}>
                                                <span className={`${styles['priority-chip']} ${styles[`priority-${group.priority.toLowerCase()}`]}`}>{group.priority}</span>
                                                <span className={`${styles['decision-dot']} ${styles[`decision-${decisions[group.group_id]?.status || 'pending'}`]}`}>
                                                    {STATUS_OPTIONS.find(item => item.value === (decisions[group.group_id]?.status || 'pending'))?.label}
                                                </span>
                                            </div>
                                            <strong>{group.topic}</strong>
                                            <span>{group.subject} / {group.category}</span>
                                            <span>{group.changed_records} changed / {group.template_removed_records} template removed</span>
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </aside>

                <section className={styles['review-detail']} aria-label="审核详情">
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
                        <div className={styles['review-empty-state']}>没有符合条件的审核组</div>
                    )}
                </section>
            </section>
        </div>
    )
}

function SummaryTile({ label, value, tone = '' }) {
    return (
        <div className={`${styles['summary-tile']} ${tone ? styles[`summary-${tone}`] : ''}`}>
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
        <article className={styles['review-detail-panel']}>
            <header className={styles['detail-header']} style={{ '--subject-color': SUBJECT_COLORS[group.subject_slug] || 'var(--color-primary)' }}>
                <div>
                    <div className={styles['detail-kicker']}>
                        <span className={`${styles['priority-chip']} ${styles[`priority-${group.priority.toLowerCase()}`]}`}>{group.priority}</span>
                        <span>{group.subject}</span>
                        <span>{group.group_id}</span>
                    </div>
                    <h2>{group.topic}</h2>
                    <p>{group.category} / {group.source_anchor_subcategory}</p>
                </div>
                <div className={styles['detail-status-actions']} role="group" aria-label="设置审核状态">
                    {STATUS_OPTIONS.map(option => (
                        <button
                            key={option.value}
                            type="button"
                            className={`${styles['status-button']} ${styles[`status-${option.value}`]} ${decision.status === option.value ? styles.active : ''}`}
                            onClick={() => onSetStatus(option.value)}
                            aria-pressed={decision.status === option.value}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </header>

            <section className={styles['review-check-grid']}>
                <CheckCard label="candidate audit" value={packet?.summary?.candidate_audit_valid ? 'valid' : 'invalid'} tone={packet?.summary?.candidate_audit_valid ? 'ok' : 'warn'} />
                <CheckCard label="candidate split" value={`${group.candidate_distinct_standard_count}/${group.records.length} distinct`} tone={candidateSplitOk ? 'ok' : 'warn'} />
                <CheckCard label="template trace" value={templateRemovedOk ? 'removed' : `${group.candidate_template_hit_records} hit`} tone={templateRemovedOk ? 'ok' : 'warn'} />
                <CheckCard label="min source overlap" value={formatScore(group.source_aligned_source_overlap_min)} tone={lowOverlap ? 'warn' : 'ok'} />
            </section>

            <section className={`${styles['source-compare']} ${styles['source-compare-three']}`}>
                <SourceBlock title="Corrected Source" text={group.source_standard_original} />
                <SourceBlock title="Supporting Source" text={group.supporting_source_standard_original || '无'} muted />
                <SourceBlock title="Previous Source" text={group.previous_source_standard_original || '无'} muted />
            </section>

            {(group.risk_reasons.length > 0 || Object.keys(group.source_anchor_tags).length > 0) && (
                <section className={styles['review-meta-strip']}>
                    {group.risk_reasons.map(reason => (
                        <span key={reason} className={styles['risk-chip']}>{reason}</span>
                    ))}
                    {Object.entries(group.source_anchor_tags).map(([key, value]) => (
                        <span key={key} className={styles['tag-chip']}>{key}: {displayValue(value)}</span>
                    ))}
                </section>
            )}

            <section className={styles['grade-triplet']}>
                {group.records.map(row => (
                    <div key={row.code} className={`${styles['grade-column']} ${row.standard_changed ? styles['grade-column-changed'] : ''} ${Number(row.source_aligned_source_overlap) < 0.12 ? styles['grade-column-low-overlap'] : ''}`}>
                        <div className={styles['grade-column-header']}>
                            <span
                                className={styles['grade-band-mini']}
                                style={{
                                    '--band-color': GRADE_BANDS[row.grade_band]?.color,
                                    '--band-bg': GRADE_BANDS[row.grade_band]?.bgColor
                                }}
                            >
                                {GRADE_BANDS[row.grade_band]?.range || row.grade_band}
                            </span>
                            <Link to={row.current_standard_url}>{row.code}</Link>
                        </div>

                        <div className={styles['standard-compare-stack']}>
                            <div className={`${styles['standard-compare-card']} ${styles['current-standard-block']}`}>
                                <h3>Current Public Standard</h3>
                                <p>{row.current_standard}</p>
                            </div>
                            <div className={`${styles['standard-compare-card']} ${styles['candidate-standard-block']}`}>
                                <h3>Source-Aligned Candidate</h3>
                                <p>{row.candidate_standard}</p>
                            </div>
                        </div>

                        <div className={styles['focus-compare']}>
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

            <section className={styles['decision-panel']}>
                <div className={styles['issue-options']}>
                    {ISSUE_OPTIONS.map(option => (
                        <label key={option.value} className={`${styles['issue-option']} ${decision.issues?.includes(option.value) ? styles.active : ''}`}>
                            <input
                                type="checkbox"
                                checked={decision.issues?.includes(option.value) || false}
                                onChange={() => onToggleIssue(option.value)}
                            />
                            <span>{option.label}</span>
                        </label>
                    ))}
                </div>
                <label className={styles['review-note-field']}>
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
        <div className={`${styles['source-block']} ${muted ? styles.muted : ''}`}>
            <h3>{title}</h3>
            <p>{text}</p>
        </div>
    )
}

function CheckCard({ label, value, tone = '' }) {
    return (
        <div className={`${styles['check-card']} ${tone ? styles[`check-${tone}`] : ''}`}>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    )
}

export default H4GReviewPage
