import { useState } from 'react'
import styles from './SkillsGraphWorkspace.module.css'

const RELATION_LABELS = {
    contains: '结构包含',
    progression: '学段进阶',
    skill_alignment: '能力关联'
}

export default function GraphLayerPanel({
    graphState,
    subjects,
    gradeBands,
    domains,
    relationTypes,
    lockedSubjectLabel,
    lockedSkillLabel,
    onFilterChange,
    onRelationTypesChange,
    onReset
}) {
    const [expanded, setExpanded] = useState(false)

    return (
        <aside className={`${styles['graph-layer-panel']} ${expanded ? styles['is-expanded'] : ''}`} aria-label="图谱筛选与图层">
            <div className={styles['graph-panel-heading']}>
                <div>
                    <span>探索范围</span>
                    <h2>图层与筛选</h2>
                </div>
                <div className={styles['graph-panel-actions']}>
                    <button type="button" onClick={onReset}>重置</button>
                    <button
                        type="button"
                        className={styles['graph-panel-mobile-toggle']}
                        aria-expanded={expanded}
                        onClick={() => setExpanded(value => !value)}
                    >
                        {expanded ? '收起' : '展开'}
                    </button>
                </div>
            </div>

            <div className={styles['graph-layer-body']}>
            {lockedSkillLabel ? (
                <div className={styles['graph-filter-group']}>
                    <span className={styles['graph-filter-label']}>技能范围</span>
                    <div className={styles['graph-locked-filter']} data-kb-locked-filter="skill">{lockedSkillLabel}</div>
                </div>
            ) : null}
            <div className={styles['graph-filter-group']}>
                {lockedSubjectLabel ? <span className={styles['graph-filter-label']}>学科</span> : <label htmlFor="graph-subject-filter">学科</label>}
                {lockedSubjectLabel ? (
                    <div className={styles['graph-locked-filter']} id="graph-subject-filter" data-kb-locked-filter="subject">{lockedSubjectLabel}</div>
                ) : (
                    <select
                        id="graph-subject-filter"
                        value={graphState.subject || ''}
                        onChange={event => onFilterChange({ subject: event.target.value || undefined, domain: undefined })}
                    >
                        <option value="">全部学科</option>
                        {subjects.map(subject => <option key={subject.slug} value={subject.slug}>{subject.label}</option>)}
                    </select>
                )}
            </div>

            <div className={styles['graph-filter-group']}>
                <label htmlFor="graph-grade-filter">学段</label>
                <select
                    id="graph-grade-filter"
                    value={graphState.gradeBand || ''}
                    onChange={event => onFilterChange({ gradeBand: event.target.value || undefined })}
                >
                    <option value="">全部学段</option>
                    {gradeBands.map(band => <option key={band.value} value={band.value}>{band.label}</option>)}
                </select>
            </div>

            <div className={styles['graph-filter-group']}>
                <label htmlFor="graph-domain-filter">领域</label>
                <select
                    id="graph-domain-filter"
                    value={graphState.domain || ''}
                    onChange={event => onFilterChange({ domain: event.target.value || undefined })}
                >
                    <option value="">全部领域</option>
                    {domains.map(domain => <option key={domain} value={domain}>{domain}</option>)}
                </select>
            </div>

            <fieldset className={styles['graph-relation-fieldset']}>
                <legend>关系层</legend>
                {Object.entries(RELATION_LABELS).map(([type, label]) => {
                    const checked = relationTypes.includes(type)
                    const isLast = checked && relationTypes.length === 1
                    return (
                        <label key={type}>
                            <input
                                type="checkbox"
                                checked={checked}
                                disabled={isLast}
                                onChange={() => onRelationTypesChange(
                                    checked
                                        ? relationTypes.filter(item => item !== type)
                                        : [...relationTypes, type]
                                )}
                            />
                            <span className={`${styles['relation-swatch']} ${styles[`is-${type}`] || ''}`}></span>
                            <span>{label}</span>
                        </label>
                    )
                })}
            </fieldset>

            <fieldset className={styles['graph-depth-fieldset']}>
                <legend>焦点深度</legend>
                <div>
                    {[1, 2, 3].map(depth => (
                        <button
                            type="button"
                            key={depth}
                            className={graphState.focusDepth === depth ? styles['is-active'] : ''}
                            aria-pressed={graphState.focusDepth === depth}
                            onClick={() => onFilterChange({ focusDepth: depth })}
                        >
                            {depth}
                        </button>
                    ))}
                </div>
                <p>控制从当前节点向外展开的关系层级。</p>
            </fieldset>
            </div>
        </aside>
    )
}
