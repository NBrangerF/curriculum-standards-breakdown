import { Link } from 'react-router-dom'
import { m } from 'motion/react'
import GraphCompareOverlay from './GraphCompareOverlay.jsx'
import GraphPathPanel from './GraphPathPanel.jsx'
import GraphProgressionPanel from './GraphProgressionPanel.jsx'
import VirtualizedRelationTree from './VirtualizedRelationTree.jsx'
import styles from './SkillsGraphWorkspace.module.css'

const TYPE_LABELS = {
    subject: '学科',
    domain: '领域',
    standard: '标准',
    skill: '能力'
}

function nodeRoute(node) {
    if (node.type === 'standard' && node.meta?.code) return `/standards/${node.meta.code}`
    if (node.type === 'skill' && node.meta?.code) return `/skills/${node.meta.code}`
    if (node.type === 'subject' && node.meta?.slug) return `/subjects/${node.meta.slug}`
    if (node.type === 'domain' && node.meta?.subjectSlug) return `/subjects/${node.meta.subjectSlug}`
    return null
}

function formatProvenance(provenance) {
    return [provenance?.source, provenance?.field].filter(Boolean).join(' · ') || '—'
}

export default function GraphWorkspaceInspector({
    snapshot,
    controller,
    compareSelection = [],
    compareNodes = [],
    onToggleCompare,
    onClearCompare,
    activeTool = 'explore',
    onActiveToolChange,
    path,
    compareSummary,
    progression
}) {
    const { selectedNode } = snapshot
    const route = nodeRoute(selectedNode)
    const isCompared = compareSelection.includes(selectedNode.id)
    const compareLimitReached = compareSelection.length >= 4 && !isCompared

    return (
        <aside className={styles['global-graph-inspector']} aria-label="图谱节点详情">
            <m.div
                key={selectedNode.id}
                className={styles['global-inspector-summary']}
                initial={{ opacity: 0.45, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            >
                <span className={`${styles['global-node-type']} ${styles[`is-${selectedNode.type}`] || ''}`}>{TYPE_LABELS[selectedNode.type]}</span>
                <h2>{selectedNode.label}</h2>
                <p>
                    {selectedNode.meta?.code ? <code>{selectedNode.meta.code}</code> : null}
                    {selectedNode.meta?.summary && selectedNode.meta.summary !== selectedNode.label
                        ? <span>{selectedNode.meta.summary}</span>
                        : null}
                </p>
                <dl>
                    <div><dt>直接关系</dt><dd>{snapshot.relations.length}</dd></div>
                    <div><dt>焦点范围</dt><dd>{snapshot.visibleNodeIds.length}</dd></div>
                    <div><dt>来源</dt><dd>{formatProvenance(selectedNode.provenance)}</dd></div>
                </dl>
                <div className={styles['global-inspector-actions']}>
                    {route ? <Link className={styles['global-inspector-action']} to={route}>打开完整条目 <span aria-hidden="true">↗</span></Link> : null}
                    <button
                        type="button"
                        className={isCompared ? styles['is-active'] : ''}
                        disabled={compareLimitReached}
                        onClick={() => onToggleCompare?.(selectedNode.id)}
                    >
                        {isCompared ? '移出对比' : compareLimitReached ? '已达四项上限' : '加入对比'}
                    </button>
                </div>
            </m.div>

            {(compareSelection.length || progression) ? (
                <div className={styles['graph-analysis-controls']}>
                    {compareSelection.length ? <div className={styles['graph-compare-chips']} aria-label="已选对比实体">
                        {compareNodes.map(node => (
                            <button type="button" key={node.id} onClick={() => onToggleCompare?.(node.id)}>
                                <span>{node.meta?.code || node.label}</span>
                                <span aria-hidden="true">×</span>
                            </button>
                        ))}
                        <button type="button" className={styles.clear} onClick={onClearCompare}>清空</button>
                    </div> : null}
                    <div className={styles['graph-analysis-tabs']} role="tablist" aria-label="图谱分析模式">
                        <button type="button" role="tab" aria-selected={activeTool === 'explore'} onClick={() => onActiveToolChange('explore')}>邻接</button>
                        <button type="button" role="tab" aria-selected={activeTool === 'progression'} disabled={!progression} onClick={() => onActiveToolChange('progression')}>进阶</button>
                        <button type="button" role="tab" aria-selected={activeTool === 'compare'} disabled={!compareSelection.length} onClick={() => onActiveToolChange('compare')}>对比</button>
                        <button type="button" role="tab" aria-selected={activeTool === 'path'} disabled={compareSelection.length < 2} onClick={() => onActiveToolChange('path')}>路径</button>
                    </div>
                </div>
            ) : null}

            {activeTool === 'progression' ? (
                <GraphProgressionPanel progression={progression} />
            ) : activeTool === 'path' ? (
                <GraphPathPanel path={path} selectedNodes={compareNodes} />
            ) : activeTool === 'compare' ? (
                <GraphCompareOverlay summary={compareSummary} />
            ) : (
                <VirtualizedRelationTree snapshot={snapshot} controller={controller} />
            )}
        </aside>
    )
}
