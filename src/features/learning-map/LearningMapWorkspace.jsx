import { useEffect, useMemo, useState } from 'react'
import { m } from 'motion/react'
import { ErrorState, LoadingState } from '../../components/StateComponents.jsx'
import { LearningMapController } from './LearningMapController.js'
import PersistentLocationBar from './PersistentLocationBar.jsx'
import KnowledgePointSearch from './KnowledgePointSearch.jsx'
import TaxonomyColumnNavigator from './TaxonomyColumnNavigator.jsx'
import TaxonomyContextSwitcher from './TaxonomyContextSwitcher.jsx'
import LearningDecisionPanel from './LearningDecisionPanel.jsx'
import RelationshipInspector from './RelationshipInspector.jsx'
import styles from './LearningMapWorkspace.module.css'

const emptyState = (title, message) => (
    <section className={styles.emptyWorkspace} aria-live="polite">
        <h2>{title}</h2>
        <p>{message}</p>
    </section>
)

export default function LearningMapWorkspace({ dataset, selectedNodeId, options, status = 'ready', error, onRetry, onSelectionChange }) {
    const controller = useMemo(() => (
        dataset ? new LearningMapController({ dataset, selectedNodeId, options }) : null
    ), [dataset, options, selectedNodeId])
    const [snapshot, setSnapshot] = useState(() => controller?.getSnapshot())

    useEffect(() => {
        if (!controller) return undefined
        setSnapshot(controller.getSnapshot())
        return controller.subscribe(setSnapshot)
    }, [controller])

    useEffect(() => {
        if (controller && selectedNodeId && selectedNodeId !== controller.getSnapshot().selectedNodeId) controller.selectNode(selectedNodeId)
    }, [controller, selectedNodeId])

    if (status === 'loading') return <LoadingState message="正在建立学习脉络…" />
    if (status === 'error') return <ErrorState title="学习脉络暂时无法加载" message={error?.message || '请检查数据版本后重试。'} onRetry={onRetry} />
    if (!snapshot) return emptyState('暂无可展示的学习脉络', '当前范围内还没有可发布的知识点。')

    const selectNode = (nodeId, contextPath) => {
        if (controller.selectNode(nodeId, { contextPath })) onSelectionChange?.(controller.getSnapshot(), { history: 'push' })
    }
    const switchContext = contextPath => {
        if (!controller.switchContextPath(contextPath)) return
        onSelectionChange?.(controller.getSnapshot(), { history: 'push' })
    }

    return (
        <m.section
            className={styles.workspace}
            aria-labelledby="learning-map-workspace-title"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        >
            <h1 id="learning-map-workspace-title" className="sr-only">学习脉络</h1>
            {snapshot.isPreview ? (
                <div className={styles.previewNotice} role="note" data-kb-learning-map-publication="public_preview">
                    <strong>公开预览</strong>
                    <span>节点来自课程标准；连线来自前后条目字段，是待验证的课程顺序线索，不代表课程专家确认的认知先修关系。</span>
                </div>
            ) : null}
            <PersistentLocationBar context={snapshot.context} contextSwitcher={<TaxonomyContextSwitcher context={snapshot.context} onSelectPath={switchContext} />} />
            <div className={styles.workspaceGrid}>
                <aside className={styles.taxonomyRail} aria-labelledby="learning-map-taxonomy-title">
                    <h2 id="learning-map-taxonomy-title" className="sr-only">分类导航</h2>
                    <KnowledgePointSearch controller={controller} onSelect={selectNode} />
                    <TaxonomyColumnNavigator controller={controller} snapshot={snapshot} onSelect={selectNode} />
                </aside>
                <main className={styles.mapStage}>
                    <div className={styles.stageHeader}>
                        <span>{snapshot.isPreview ? '公开预览 · 待验证关系' : '已验证的局部关系'}</span>
                        <p>{snapshot.isPreview
                            ? '展示课程标准中的直接顺序线索；它们用于预览信息结构与交互，不作为学习决策结论。'
                            : '只展示当前知识点的直接先修与直接解锁；不把学段进阶误作先修。'}</p>
                    </div>
                    <LearningDecisionPanel snapshot={snapshot} controller={controller} onSelectionChange={onSelectionChange} />
                </main>
                <aside className={styles.inspector} aria-labelledby="learning-map-inspector-title">
                    <RelationshipInspector selection={snapshot.inspectorSelection} isPreview={snapshot.isPreview} />
                </aside>
            </div>
            <p className="sr-only" aria-live="polite">{snapshot.announcement}</p>
        </m.section>
    )
}
