import LearningDagPanel from './LearningDagPanel.jsx'
import LearningMapFallbackList from './LearningMapFallbackList.jsx'
import styles from './LearningDecisionPanel.module.css'

export default function LearningDecisionPanel({ snapshot, controller, onSelectionChange }) {
    const setDepth = field => controller.setDepths({ [field]: snapshot.options[field] === 1 ? 2 : 1 })
    const selectNode = nodeId => {
        if (controller.selectNode(nodeId)) onSelectionChange?.(controller.getSnapshot())
    }
    const selectRelationship = edgeId => {
        if (controller.selectRelationship(edgeId)) onSelectionChange?.(controller.getSnapshot())
    }

    return (
        <section className={styles.panel} aria-labelledby="learning-decision-title">
            <header className={styles.header}>
                <div>
                    <span>已验证的直接关系</span>
                    <h2 id="learning-decision-title">先掌握什么，接下来解锁什么</h2>
                    <p>先阅读关系，再按需查看局部图；课程分类位置与学段进阶不会被当作先修。</p>
                </div>
                <div className={styles.depthControls} aria-label="展开学习关系">
                    <button type="button" aria-pressed={snapshot.options.prerequisiteDepth === 2} onClick={() => setDepth('prerequisiteDepth')}>前置 {snapshot.options.prerequisiteDepth === 1 ? '展开一层' : '收起'}</button>
                    <button type="button" aria-pressed={snapshot.options.unlockDepth === 2} onClick={() => setDepth('unlockDepth')}>解锁 {snapshot.options.unlockDepth === 1 ? '展开一层' : '收起'}</button>
                </div>
            </header>
            <LearningMapFallbackList snapshot={snapshot} onSelect={selectNode} onSelectRelationship={selectRelationship} />
            <LearningDagPanel snapshot={snapshot} controller={controller} onSelectionChange={onSelectionChange} />
        </section>
    )
}
