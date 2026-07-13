import LearningDagPanel from './LearningDagPanel.jsx'
import LearningMapFallbackList from './LearningMapFallbackList.jsx'
import styles from './LearningDecisionPanel.module.css'

export default function LearningDecisionPanel({ snapshot, controller, onSelectionChange }) {
    const setDepth = field => {
        controller.setDepths({ [field]: snapshot.options[field] === 1 ? 2 : 1 })
        onSelectionChange?.(controller.getSnapshot(), { history: 'replace' })
    }
    const selectNode = nodeId => {
        if (controller.selectNode(nodeId)) onSelectionChange?.(controller.getSnapshot(), { history: 'push' })
    }
    const selectRelationship = edgeId => {
        if (controller.selectRelationship(edgeId)) onSelectionChange?.(controller.getSnapshot(), { history: 'replace' })
    }

    return (
        <section className={styles.panel} aria-labelledby="learning-decision-title">
            <header className={styles.header}>
                <div>
                    <span>{snapshot.isPreview ? '待验证的直接关系' : '已验证的直接关系'}</span>
                    <h2 id="learning-decision-title">{snapshot.isPreview ? '可能需要先了解，可能继续通往' : '先掌握什么，接下来解锁什么'}</h2>
                    <p>{snapshot.isPreview
                        ? '先体验局部路径和持续定位；关系来自课程顺序字段，尚不能作为认知先修结论。'
                        : '先阅读关系，再按需查看局部图；课程分类位置与学段进阶不会被当作先修。'}</p>
                </div>
                <div className={styles.depthControls} aria-label="展开学习关系">
                    <button type="button" aria-pressed={snapshot.options.prerequisiteDepth === 2} onClick={() => setDepth('prerequisiteDepth')}>{snapshot.isPreview ? '向前' : '前置'} {snapshot.options.prerequisiteDepth === 1 ? '展开一层' : '收起'}</button>
                    <button type="button" aria-pressed={snapshot.options.unlockDepth === 2} onClick={() => setDepth('unlockDepth')}>{snapshot.isPreview ? '向后' : '解锁'} {snapshot.options.unlockDepth === 1 ? '展开一层' : '收起'}</button>
                </div>
            </header>
            <LearningMapFallbackList snapshot={snapshot} onSelect={selectNode} onSelectRelationship={selectRelationship} />
            <LearningDagPanel snapshot={snapshot} controller={controller} onSelectionChange={onSelectionChange} />
        </section>
    )
}
