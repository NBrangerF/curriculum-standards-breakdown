import { useEffect, useMemo, useState } from 'react'
import { m } from 'motion/react'
import { ErrorState, LoadingState } from '../../components/StateComponents.jsx'
import { LearningMapController } from './LearningMapController.js'
import PersistentLocationBar from './PersistentLocationBar.jsx'
import KnowledgePointSearch from './KnowledgePointSearch.jsx'
import TaxonomyColumnNavigator from './TaxonomyColumnNavigator.jsx'
import TaxonomyContextSwitcher from './TaxonomyContextSwitcher.jsx'
import LearningDagPanel from './LearningDagPanel.jsx'
import styles from './LearningMapWorkspace.module.css'

const emptyState = (title, message) => (
    <section className={styles.emptyWorkspace} aria-live="polite">
        <h2>{title}</h2>
        <p>{message}</p>
    </section>
)

export default function LearningMapWorkspace({ dataset, selectedNodeId, status = 'ready', error, onRetry, onSelectionChange }) {
    const controller = useMemo(() => (
        dataset ? new LearningMapController({ dataset, selectedNodeId }) : null
    ), [dataset])
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
    if (!snapshot) return emptyState('暂无可展示的学习脉络', '当前范围内还没有经审核的知识点。')

    const selectNode = (nodeId, contextPath) => {
        if (controller.selectNode(nodeId, { contextPath })) onSelectionChange?.(controller.getSnapshot())
    }
    const switchContext = contextPath => {
        if (!controller.switchContextPath(contextPath)) return
        onSelectionChange?.(controller.getSnapshot())
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
            <PersistentLocationBar context={snapshot.context} contextSwitcher={<TaxonomyContextSwitcher context={snapshot.context} onSelectPath={switchContext} />} />
            <div className={styles.workspaceGrid}>
                <aside className={styles.taxonomyRail} aria-labelledby="learning-map-taxonomy-title">
                    <h2 id="learning-map-taxonomy-title" className="sr-only">分类导航</h2>
                    <KnowledgePointSearch controller={controller} onSelect={selectNode} />
                    <TaxonomyColumnNavigator controller={controller} snapshot={snapshot} onSelect={selectNode} />
                </aside>
                <main className={styles.mapStage}>
                    <div className={styles.stageHeader}>
                        <span>已验证的局部关系</span>
                        <p>只展示当前知识点的直接先修与直接解锁；不把学段进阶误作先修。</p>
                    </div>
                    <LearningDagPanel snapshot={snapshot} controller={controller} onSelectionChange={onSelectionChange} />
                </main>
                <aside className={styles.inspector} aria-labelledby="learning-map-inspector-title">
                    <span>关系范围</span>
                    <h2 id="learning-map-inspector-title">审核状态</h2>
                    <dl>
                        <div><dt>先修关系</dt><dd>{snapshot.context.coverage.incoming === 'reviewed' ? '已审核' : '待审核'}</dd></div>
                        <div><dt>解锁关系</dt><dd>{snapshot.context.coverage.outgoing === 'reviewed' ? '已审核' : '待审核'}</dd></div>
                        <div><dt>当前焦点</dt><dd>{snapshot.context.focus.label}</dd></div>
                    </dl>
                    <p>证据与关系详情将在选择连线后显示。当前不会从课程顺序自动推断先修关系。</p>
                </aside>
            </div>
            <p className="sr-only" aria-live="polite">{snapshot.announcement}</p>
        </m.section>
    )
}
