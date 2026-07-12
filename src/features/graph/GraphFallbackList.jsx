import { useEffect, useState } from 'react'

const DIRECTION_LABELS = {
    incoming: '来自',
    outgoing: '指向',
    undirected: '关联'
}

const ENTITY_TYPE_LABELS = {
    subject: '学科',
    domain: '领域',
    standard: '标准',
    skill: '能力'
}

export default function GraphFallbackList({ controller, onNodeActivate }) {
    const [snapshot, setSnapshot] = useState(() => controller.getSnapshot())

    useEffect(() => controller.subscribe(setSnapshot), [controller])

    const handleKeyDown = event => {
        const commandByKey = {
            ArrowUp: 'previous',
            ArrowDown: 'next',
            ArrowLeft: 'parent',
            ArrowRight: 'child',
            Home: 'neighbor'
        }
        const command = commandByKey[event.key]
        if (!command) return
        event.preventDefault()
        controller.move(command)
    }

    return (
        <section className="graph-fallback-list" data-kb-component="graph-fallback-list" aria-labelledby="graph-fallback-title" onKeyDown={handleKeyDown}>
            <div className="sr-only" aria-live="polite" aria-atomic="true">
                {snapshot.announcement}
            </div>
            <h2 id="graph-fallback-title">图谱等价关系列表</h2>
            <p className="graph-fallback-current">
                当前节点：<strong>{snapshot.selectedNode.label}</strong>
                <span> · {snapshot.relations.length} 个直接关系</span>
            </p>
            <ul className="graph-fallback-relations" aria-label={`${snapshot.selectedNode.label} 的直接关系`}>
                {snapshot.relations.map(({ edge, node, direction }) => (
                    <li key={`${edge.id}:${node.id}`}>
                        <button
                            type="button"
                            onClick={() => {
                                controller.selectNode(node.id)
                                onNodeActivate?.(node.id)
                            }}
                        >
                            <span>{edge.label || edge.type}</span>
                            <span>{DIRECTION_LABELS[direction]}</span>
                            <strong>{node.label}</strong>
                            <span>{ENTITY_TYPE_LABELS[node.type] || node.type}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    )
}
