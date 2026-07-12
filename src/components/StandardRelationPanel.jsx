import { lazy, Suspense, useMemo, useState, useEffect } from 'react'
import { m } from 'motion/react'
import { GraphA11yController } from '../features/graph/GraphA11yController.js'
import GraphFallbackList from '../features/graph/GraphFallbackList.jsx'
import styles from './StandardRelationPanel.module.css'

const GraphCanvas = lazy(() => import('../features/graph/GraphCanvas.jsx'))

const TYPE_LABELS = {
    subject: '学科',
    domain: '领域',
    standard: '标准',
    skill: '能力'
}

function formatProvenance(provenance) {
    return [provenance?.source, provenance?.field].filter(Boolean).join(' · ') || '—'
}

function StandardRelationPanel({ model, focusRef, transitionCode, transitionTitle }) {
    if (!model) return null

    const relationTypes = useMemo(() => [...new Set(model.edges.map(edge => edge.type))], [model])
    const controller = useMemo(() => new GraphA11yController({
        model,
        selectedNodeId: model.meta.focusNodeId,
        relationTypes,
        focusDepth: 3
    }), [model, relationTypes])
    const [snapshot, setSnapshot] = useState(() => controller.getSnapshot())

    useEffect(() => controller.subscribe(setSnapshot), [controller])

    return (
        <m.section
            className={styles['standard-relation-panel']}
            id="standard-relations"
            data-reading-section="relations"
            aria-labelledby="standard-relations-title"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
            <div className="container">
                <div className={styles['relation-panel-heading']}>
                    <div>
                        <div className={styles['relation-focus-identity']}>
                            <span style={{ viewTransitionName: 'kb-standard-code' }}>{transitionCode}</span>
                            <strong style={{ viewTransitionName: 'kb-standard-title' }}>{transitionTitle}</strong>
                        </div>
                        <span className={styles['relation-kicker']}>真实关系局部图</span>
                        <h2 id="standard-relations-title" tabIndex="-1" ref={focusRef}>标准在课程结构中的位置</h2>
                    </div>
                    <p>
                        当前先提供与图谱画布等价的可访问关系视图；所有连线都来自标准记录字段，不推断先修关系。
                    </p>
                </div>

                <div className={styles['relation-graph-toolbar']} aria-label="图谱关系筛选">
                    <div>
                        <span className={styles['relation-toolbar-label']}>关系层</span>
                        {relationTypes.map(type => {
                            const active = snapshot.relationTypes.includes(type)
                            const edge = model.edges.find(item => item.type === type)
                            return (
                                <button
                                    type="button"
                                    key={type}
                                    className={active ? styles['is-active'] : ''}
                                    aria-pressed={active}
                                    onClick={() => controller.setRelationTypes(
                                        active
                                            ? snapshot.relationTypes.filter(item => item !== type)
                                            : [...snapshot.relationTypes, type]
                                    )}
                                >
                                    {edge?.label || type}
                                </button>
                            )
                        })}
                    </div>
                    <span>{model.nodes.length} 个实体 · {model.edges.length} 条可追溯关系</span>
                </div>

                <div className={styles['relation-graph-workspace']}>
                    <Suspense fallback={<div className={styles['relation-graph-loading']}>正在加载 WebGL 图谱…</div>}>
                        <GraphCanvas model={model} controller={controller} />
                    </Suspense>
                    <aside className={styles['relation-graph-inspector']} aria-label="当前图谱节点">
                        <span className={styles['relation-inspector-label']}>{TYPE_LABELS[snapshot.selectedNode.type]}</span>
                        <h3>{snapshot.selectedNode.label}</h3>
                        <p>
                            {snapshot.selectedNode.meta?.code ? <code>{snapshot.selectedNode.meta.code}</code> : null}
                            {snapshot.selectedNode.meta?.summary && snapshot.selectedNode.meta.summary !== snapshot.selectedNode.label
                                ? <span>{snapshot.selectedNode.meta.summary}</span>
                                : null}
                        </p>
                        <dl>
                            <div><dt>直接关系</dt><dd>{snapshot.relations.length}</dd></div>
                            <div><dt>当前范围</dt><dd>{snapshot.visibleNodeIds.length}</dd></div>
                            <div><dt>来源字段</dt><dd>{formatProvenance(snapshot.selectedNode.provenance)}</dd></div>
                        </dl>
                    </aside>
                </div>

                <div className={styles['relation-equivalent-list']}>
                    <GraphFallbackList controller={controller} />
                    <details>
                        <summary>查看全部关系与数据来源</summary>
                        <ul className={styles['relation-provenance-list']}>
                            {model.edges.map(edge => (
                                <li key={edge.id}>
                                    <span>{edge.label}</span>
                                    <code>{edge.provenance.field}</code>
                                </li>
                            ))}
                        </ul>
                    </details>
                </div>
            </div>
        </m.section>
    )
}

export default StandardRelationPanel
