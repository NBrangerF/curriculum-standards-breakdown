import { BaseEdge, getBezierPath } from '@xyflow/react'

export default function LearningEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }) {
    const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
    const recommended = data.relationship?.necessity === 'recommended'
    return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: recommended ? '#8e9bbc' : '#506bdd', strokeDasharray: recommended ? '5 4' : undefined, strokeWidth: recommended ? 1.25 : 1.5 }} />
}
