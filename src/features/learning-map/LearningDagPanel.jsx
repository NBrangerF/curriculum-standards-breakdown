import { lazy, Suspense, useEffect, useState } from 'react'
import styles from './LearningDagPanel.module.css'

const SelectedDag = lazy(() => import('./learningDagRendererDecision.js').then(module => ({ default: module.SelectedLearningDag })))
const MAX_NODES = 60
const MAX_EDGES = 80

function useDesktopDag() {
    const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 761px)').matches)
    useEffect(() => {
        const query = window.matchMedia('(min-width: 761px)')
        const update = () => setIsDesktop(query.matches)
        update()
        query.addEventListener('change', update)
        return () => query.removeEventListener('change', update)
    }, [])
    return isDesktop
}

export default function LearningDagPanel({ snapshot, controller, onSelectionChange }) {
    const { topology } = snapshot
    const isDesktop = useDesktopDag()
    const nodeCount = topology.visibleNodeCount
    const useVisualDag = isDesktop && nodeCount <= MAX_NODES && topology.edges.length <= MAX_EDGES
    const selectNode = nodeId => {
        if (controller.selectNode(nodeId)) onSelectionChange?.(controller.getSnapshot(), { history: 'push' })
    }
    const selectRelationship = edgeId => {
        if (controller.selectRelationship(edgeId)) onSelectionChange?.(controller.getSnapshot(), { history: 'replace' })
    }
    return (
        <section className={styles.panel} aria-labelledby="learning-dag-title">
            <div className={styles.panelHeader}>
                <div>
                    <span>关系图辅助视图</span>
                    <h2 id="learning-dag-title">局部关系路径</h2>
                </div>
            </div>
            {useVisualDag ? (
                <Suspense fallback={<div className={styles.loading}>正在加载局部关系图…</div>}>
                    <SelectedDag snapshot={snapshot} onSelectNode={selectNode} onSelectRelationship={selectRelationship} />
                </Suspense>
            ) : (
                <div className={styles.limitNotice} role="status">当前范围超过 {MAX_NODES} 个节点或 {MAX_EDGES} 条边，已切换到关系列表。</div>
            )}
            {topology.hiddenNodeCount ? <p className={styles.hiddenNotice}>为保持定位清晰，另有 {topology.hiddenNodeCount} 项未展开。请从两侧分别继续展开。</p> : null}
            {!useVisualDag ? <p className={styles.visibleFallback}>关系已保留在上方的学习决策列表中。</p> : null}
        </section>
    )
}
