import { useMemo } from 'react'
import { Background, MarkerType, ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { layoutLearningDag } from './layoutLearningDag.js'
import LearningEdge from './LearningEdge.jsx'
import LearningNode from './LearningNode.jsx'

const nodeTypes = { knowledge: LearningNode, focus: LearningNode }
const edgeTypes = { learning: LearningEdge }

export default function ReactFlowLearningDag({ snapshot, onSelectNode, onSelectRelationship }) {
    const { context, topology } = snapshot
    const layout = useMemo(() => layoutLearningDag({ focus: context.focus, topology }), [context.focus, topology])
    const nodes = useMemo(() => layout.nodes.map(node => ({
        ...node,
        data: { ...node.data, isFocus: node.id === context.focus.id, isPreview: snapshot.isPreview, onSelect: onSelectNode }
    })), [context.focus.id, layout.nodes, onSelectNode, snapshot.isPreview])
    const edges = useMemo(() => layout.edges.map(edge => {
        const relation = edge.relationship
        const necessity = snapshot.isPreview ? '待验证顺序线索' : relation?.necessity === 'recommended' ? '建议先修' : '必要先修'
        const source = layout.nodes.find(node => node.id === edge.source)?.data.point.label || edge.source
        const target = layout.nodes.find(node => node.id === edge.target)?.data.point.label || edge.target
        return {
            ...edge,
            type: 'learning',
            data: { relationship: relation },
            markerEnd: { type: MarkerType.ArrowClosed, color: relation?.necessity === 'required' ? '#506bdd' : '#8e9bbc' },
            ariaLabel: `${necessity}：${source} → ${target}${snapshot.isPreview ? '，尚未经过课程专家先修审核' : '，已验证关系'}`,
            focusable: false
        }
    }), [layout.edges, layout.nodes, snapshot.isPreview])

    return (
        <div className="learning-map-react-flow" aria-hidden="true">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                nodesFocusable={false}
                edgesFocusable={false}
                panOnScroll={false}
                zoomOnDoubleClick={false}
                onNodeClick={(_event, node) => onSelectNode(node.id)}
                onEdgeClick={(_event, edge) => onSelectRelationship(edge.id)}
                fitView
                fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
                proOptions={{ hideAttribution: true }}
            >
                <Background gap={18} size={1} color="rgba(63, 82, 140, 0.12)" />
            </ReactFlow>
        </div>
    )
}
