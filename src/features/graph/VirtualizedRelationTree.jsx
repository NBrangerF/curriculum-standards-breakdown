import { useDeferredValue, useMemo, useState } from 'react'
import styles from './SkillsGraphWorkspace.module.css'

const ROW_HEIGHT = 58
const VIEWPORT_HEIGHT = 348
const OVERSCAN = 5

const TYPE_LABELS = {
    subject: '学科',
    domain: '领域',
    standard: '标准',
    skill: '能力'
}

const DIRECTION_LABELS = {
    incoming: '来自',
    outgoing: '指向',
    undirected: '关联'
}

export default function VirtualizedRelationTree({ snapshot, controller }) {
    const [query, setQuery] = useState('')
    const deferredQuery = useDeferredValue(query.trim().toLowerCase())
    const [scrollTop, setScrollTop] = useState(0)

    const relations = useMemo(() => {
        if (!deferredQuery) return snapshot.relations
        return snapshot.relations.filter(({ node, edge }) => (
            node.label.toLowerCase().includes(deferredQuery) ||
            String(node.meta?.code || '').toLowerCase().includes(deferredQuery) ||
            edge.type.toLowerCase().includes(deferredQuery)
        ))
    }, [deferredQuery, snapshot.relations])

    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2
    const endIndex = Math.min(relations.length, startIndex + visibleCount)
    const visibleRelations = relations.slice(startIndex, endIndex)

    return (
        <section className={styles['virtual-relation-tree']} aria-labelledby="virtual-relation-title">
            <div className={styles['virtual-relation-heading']}>
                <div>
                    <h3 id="virtual-relation-title">邻接关系</h3>
                    <span>{relations.length} / {snapshot.relations.length}</span>
                </div>
                <label>
                    <span className="sr-only">筛选当前节点关系</span>
                    <input
                        type="search"
                        value={query}
                        onChange={event => {
                            setQuery(event.target.value)
                            setScrollTop(0)
                        }}
                        placeholder="筛选邻居"
                    />
                </label>
            </div>

            {relations.length ? (
                <div
                    className={styles['virtual-relation-viewport']}
                    style={{ height: VIEWPORT_HEIGHT }}
                    onScroll={event => setScrollTop(event.currentTarget.scrollTop)}
                    role="list"
                    aria-label={`${snapshot.selectedNode.label} 的邻接关系`}
                >
                    <div className={styles['virtual-relation-spacer']} style={{ height: relations.length * ROW_HEIGHT }}>
                        {visibleRelations.map((relation, offset) => {
                            const index = startIndex + offset
                            return (
                                <div
                                    role="listitem"
                                    aria-posinset={index + 1}
                                    aria-setsize={relations.length}
                                    key={`${relation.edge.id}:${relation.node.id}`}
                                    className={styles['virtual-relation-item']}
                                    style={{ transform: `translateY(${index * ROW_HEIGHT}px)` }}
                                >
                                    <button type="button" className={styles['virtual-relation-row']} onClick={() => controller.selectNode(relation.node.id)}>
                                        <span className={`${styles['relation-dot']} ${styles[`is-${relation.node.type}`] || ''}`}></span>
                                        <span className={styles['virtual-relation-copy']}>
                                            <strong>{relation.node.meta?.code || relation.node.label}</strong>
                                            <small>{relation.edge.label || relation.edge.type} · {DIRECTION_LABELS[relation.direction]} · {TYPE_LABELS[relation.node.type]}</small>
                                        </span>
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                </div>
            ) : (
                <p className={styles['virtual-relation-empty']}>当前关系层或搜索条件下没有邻接节点。</p>
            )}
        </section>
    )
}
