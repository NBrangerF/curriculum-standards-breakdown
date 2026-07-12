import { useMemo } from 'react'
import { getGraphNodePositions } from './sigmaGraphAdapter.js'
import styles from './SkillsGraphWorkspace.module.css'

const TYPE_CLASS = {
    subject: 'is-subject',
    domain: 'is-domain',
    skill: 'is-skill',
    standard: 'is-standard'
}

export default function GraphMiniMap({ model, selectedNodeId }) {
    const items = useMemo(() => {
        const positions = getGraphNodePositions(model, { layoutMode: 'semantic' })
        return model.nodes
            .filter(node => node.type !== 'standard' || node.id === selectedNodeId)
            .map(node => ({ node, position: positions.get(node.id) }))
            .filter(item => item.position)
    }, [model, selectedNodeId])

    return (
        <div className={styles['graph-minimap']} aria-hidden="true">
            <svg viewBox="-13 -13 26 26" preserveAspectRatio="xMidYMid meet">
                <circle className={styles['graph-minimap-orbit']} cx="0" cy="0" r="9.5" />
                {items.map(({ node, position }) => (
                    <circle
                        key={node.id}
                        className={`${styles[TYPE_CLASS[node.type]] || ''} ${node.id === selectedNodeId ? styles['is-selected'] : ''}`}
                        cx={position.x}
                        cy={position.y}
                        r={node.id === selectedNodeId ? 0.42 : node.type === 'subject' ? 0.28 : node.type === 'skill' ? 0.22 : 0.12}
                    />
                ))}
            </svg>
            <span>课程结构概览</span>
        </div>
    )
}
