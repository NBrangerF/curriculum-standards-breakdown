import { lazy, Suspense } from 'react'
import LearningMapFallbackList from './LearningMapFallbackList.jsx'
import LearningDirectionSummary from './LearningDirectionSummary.jsx'
import styles from './LearningDagPanel.module.css'

const SelectedDag = lazy(() => import('./learningDagRendererDecision.js').then(module => ({ default: module.SelectedLearningDag })))
const MAX_NODES = 60
const MAX_EDGES = 80

export default function LearningDagPanel({ snapshot, controller, onSelectionChange }) {
    const { context, topology } = snapshot
    const nodeCount = topology.visibleNodeCount
    const useVisualDag = nodeCount <= MAX_NODES && topology.edges.length <= MAX_EDGES
    const selectNode = nodeId => {
        if (controller.selectNode(nodeId)) onSelectionChange?.(controller.getSnapshot())
    }
    const selectRelationship = edgeId => {
        if (controller.selectRelationship(edgeId)) onSelectionChange?.(controller.getSnapshot())
    }
    const setDepth = field => controller.setDepths({ [field]: snapshot.options[field] === 1 ? 2 : 1 })

    return (
        <section className={styles.panel} aria-labelledby="learning-dag-title">
            <div className={styles.panelHeader}>
                <div>
                    <span>局部关系图</span>
                    <h2 id="learning-dag-title">前置 · 当前 · 解锁</h2>
                </div>
                <div className={styles.depthControls} aria-label="展开学习关系">
                    <button type="button" aria-pressed={snapshot.options.prerequisiteDepth === 2} onClick={() => setDepth('prerequisiteDepth')}>前置 {snapshot.options.prerequisiteDepth === 1 ? '展开一层' : '收起'}</button>
                    <button type="button" aria-pressed={snapshot.options.unlockDepth === 2} onClick={() => setDepth('unlockDepth')}>解锁 {snapshot.options.unlockDepth === 1 ? '展开一层' : '收起'}</button>
                </div>
            </div>
            <div className={styles.summaries}>
                <LearningDirectionSummary label="需要先掌握" context={context.prerequisites} />
                <LearningDirectionSummary label="当前知识点" context={{ total: 1, required: [], recommended: [] }} />
                <LearningDirectionSummary label="将会解锁" context={context.unlocks} />
            </div>
            {useVisualDag ? (
                <Suspense fallback={<div className={styles.loading}>正在加载局部关系图…</div>}>
                    <SelectedDag snapshot={snapshot} onSelectNode={selectNode} onSelectRelationship={selectRelationship} />
                </Suspense>
            ) : (
                <div className={styles.limitNotice} role="status">当前范围超过 {MAX_NODES} 个节点或 {MAX_EDGES} 条边，已切换到关系列表。</div>
            )}
            {topology.hiddenNodeCount ? <p className={styles.hiddenNotice}>为保持定位清晰，另有 {topology.hiddenNodeCount} 项未展开。请从两侧分别继续展开。</p> : null}
            <div className={useVisualDag ? styles.semanticFallback : styles.visibleFallback}>
                <LearningMapFallbackList snapshot={snapshot} onSelect={selectNode} />
            </div>
        </section>
    )
}
