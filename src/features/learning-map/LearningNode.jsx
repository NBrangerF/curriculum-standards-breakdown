import { Handle, Position } from '@xyflow/react'

export default function LearningNode({ data }) {
    const { point, isFocus, onSelect } = data
    return (
        <button
            type="button"
            tabIndex={-1}
            className={`learning-map-node ${isFocus ? 'is-focus' : ''}`}
            aria-current={isFocus ? 'true' : undefined}
            onClick={() => onSelect?.(point.id)}
        >
            <Handle type="target" position={Position.Left} aria-hidden="true" />
            <span>{isFocus ? '当前知识点' : '已验证关系'}</span>
            <strong>{point.label}</strong>
            <small>{point.standardCodes?.join(' · ')}</small>
            <Handle type="source" position={Position.Right} aria-hidden="true" />
        </button>
    )
}
