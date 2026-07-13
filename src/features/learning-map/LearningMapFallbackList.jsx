import styles from './LearningMapWorkspace.module.css'

function RelationList({ heading, points, emptyMessage, onSelect, kind }) {
    return (
        <section className={`${styles.relationGroup} ${styles[kind]}`} aria-labelledby={`${kind}-heading`}>
            <div className={styles.relationGroupHeading}>
                <h3 id={`${kind}-heading`}>{heading}</h3>
                {points.total ? <span>{points.total}</span> : null}
            </div>
            {points.total ? (
                <ul>
                    {[...points.required, ...points.recommended].map(point => (
                        <li key={point.id}>
                            <button type="button" onClick={() => onSelect(point.id)}>
                                <span>{point.label}</span>
                                <small>{points.required.some(item => item.id === point.id) ? '必要' : '建议'}</small>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : <p>{emptyMessage}</p>}
            {points.hidden ? <p className={styles.hiddenCount}>还有 {points.hidden} 项未在画布展开</p> : null}
        </section>
    )
}

export default function LearningMapFallbackList({ snapshot, onSelect }) {
    const { context } = snapshot
    const prerequisiteEmpty = context.coverage.incoming === 'reviewed'
        ? '这是当前已审核学习范围内的起点。'
        : '当前尚无经证实的先修关系。'
    const unlockEmpty = context.coverage.outgoing === 'reviewed'
        ? '这是当前已审核学习范围内的终点。'
        : '当前尚无经证实的后续解锁。'
    return (
        <section className={styles.fallbackList} aria-label="学习脉络的可访问关系列表">
            <section className={styles.currentKnowledge} aria-labelledby="current-knowledge-heading">
                <span>当前知识点</span>
                <h2 id="current-knowledge-heading" aria-current="true">{context.focus.label}</h2>
                <code>{context.focus.standardCodes.join(' · ')}</code>
            </section>
            <RelationList kind="prerequisite" heading="需要先掌握" points={context.prerequisites} emptyMessage={prerequisiteEmpty} onSelect={onSelect} />
            <RelationList kind="unlock" heading="将会解锁" points={context.unlocks} emptyMessage={unlockEmpty} onSelect={onSelect} />
        </section>
    )
}
