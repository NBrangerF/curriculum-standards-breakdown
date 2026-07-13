import styles from './LearningMapWorkspace.module.css'

function RelationList({ heading, points, emptyMessage, onSelect, onSelectRelationship, kind, focusId, edges, isPreview }) {
    return (
        <section className={`${styles.relationGroup} ${styles[kind]}`} aria-labelledby={`${kind}-heading`}>
            <div className={styles.relationGroupHeading}>
                <h3 id={`${kind}-heading`}>{heading}</h3>
                {points.total ? <span>{points.total}</span> : null}
            </div>
            {points.total ? (
                <ul>
                    {[...points.required, ...points.recommended, ...(points.undetermined || [])].map(point => {
                        const relationship = edges.find(edge => kind === 'prerequisite'
                            ? edge.source === point.id && edge.target === focusId
                            : edge.source === focusId && edge.target === point.id)
                        return (
                        <li key={point.id}>
                            <div className={styles.relationItem}>
                                <button type="button" onClick={() => onSelect(point.id)}>
                                    <span>{point.label}</span>
                                    <small>{isPreview ? '待验证' : points.required.some(item => item.id === point.id) ? '必要' : '建议'}</small>
                                </button>
                                {relationship ? <button type="button" className={styles.relationEvidenceButton} onClick={() => onSelectRelationship?.(relationship.id)} aria-label={`查看${point.label}与当前知识点的关系依据`}>依据</button> : null}
                            </div>
                        </li>
                        )
                    })}
                </ul>
            ) : <p>{emptyMessage}</p>}
            {points.hidden ? <p className={styles.hiddenCount}>还有 {points.hidden} 项未在画布展开</p> : null}
        </section>
    )
}

export default function LearningMapFallbackList({ snapshot, onSelect, onSelectRelationship }) {
    const { context, topology } = snapshot
    const prerequisiteEmpty = snapshot.isPreview
        ? '当前没有向前的课程顺序候选线索。'
        : context.coverage.incoming === 'reviewed'
        ? '这是当前已审核学习范围内的起点。'
        : '当前尚无经证实的先修关系。'
    const unlockEmpty = snapshot.isPreview
        ? '当前没有向后的课程顺序候选线索。'
        : context.coverage.outgoing === 'reviewed'
        ? '这是当前已审核学习范围内的终点。'
        : '当前尚无经证实的后续解锁。'
    return (
        <section className={styles.fallbackList} aria-label="学习脉络的可访问关系列表">
            <section className={styles.currentKnowledge} aria-labelledby="current-knowledge-heading">
                <span>当前知识点</span>
                <h2 id="current-knowledge-heading" aria-current="true">{context.focus.label}</h2>
                <code>{context.focus.standardCodes.join(' · ')}</code>
            </section>
            <RelationList kind="prerequisite" heading={snapshot.isPreview ? '可能需要先了解' : '需要先掌握'} points={context.prerequisites} emptyMessage={prerequisiteEmpty} onSelect={onSelect} onSelectRelationship={onSelectRelationship} focusId={context.focus.id} edges={topology.edges} isPreview={snapshot.isPreview} />
            <RelationList kind="unlock" heading={snapshot.isPreview ? '可能继续通往' : '将会解锁'} points={context.unlocks} emptyMessage={unlockEmpty} onSelect={onSelect} onSelectRelationship={onSelectRelationship} focusId={context.focus.id} edges={topology.edges} isPreview={snapshot.isPreview} />
        </section>
    )
}
