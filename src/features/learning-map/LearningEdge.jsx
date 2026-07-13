import { BaseEdge, getBezierPath } from '@xyflow/react'

export default function LearningEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }) {
    const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
    const secondary = data.relationship?.necessity !== 'required'
    return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: secondary ? '#8e9bbc' : '#506bdd', strokeDasharray: secondary ? '5 4' : undefined, strokeWidth: secondary ? 1.25 : 1.5 }} />
}
