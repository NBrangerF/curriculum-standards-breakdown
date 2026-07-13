import styles from './RelationshipInspector.module.css'

const necessityLabel = necessity => necessity === 'required' ? '必要前置' : '建议前置'

function KnowledgePointInspector({ point }) {
    return (
        <>
            <span>当前知识点</span>
            <h2 id="learning-map-inspector-title">掌握目标</h2>
            <h3>{point.label}</h3>
            {point.summary ? <p>{point.summary}</p> : <p>该知识点的掌握说明将随经审核数据一同提供。</p>}
            <dl>
                <div><dt>对齐课程标准</dt><dd>{point.standardCodes.join(' · ')}</dd></div>
                <div><dt>关系覆盖</dt><dd>前置：{point.dependencyCoverage.incoming === 'reviewed' ? '已审核' : '待审核'}；解锁：{point.dependencyCoverage.outgoing === 'reviewed' ? '已审核' : '待审核'}</dd></div>
            </dl>
        </>
    )
}

function RelationshipEvidenceInspector({ selection }) {
    const { edge, source, target, evidence } = selection
    return (
        <>
            <span>已验证关系</span>
            <h2 id="learning-map-inspector-title">{necessityLabel(edge.necessity)}</h2>
            <p className={styles.relationshipTitle}><strong>{source.label}</strong><b aria-hidden="true">→</b><strong>{target.label}</strong></p>
            <section aria-labelledby="relationship-rationale-title">
                <h3 id="relationship-rationale-title">为什么相关</h3>
                <p>{edge.rationale}</p>
            </section>
            <section aria-labelledby="relationship-evidence-title">
                <h3 id="relationship-evidence-title">证据来源</h3>
                <ul>
                    {evidence.map(item => <li key={item.id}><strong>{item.statement}</strong><small>{item.sourceType} · {item.locator}</small></li>)}
                </ul>
            </section>
            <dl>
                <div><dt>对齐课程标准</dt><dd>{[...new Set([...source.standardCodes, ...target.standardCodes])].join(' · ')}</dd></div>
                <div><dt>关系确定程度</dt><dd>{edge.confidence === 'high' ? '高' : edge.confidence === 'medium' ? '中' : '低'}</dd></div>
            </dl>
        </>
    )
}

export default function RelationshipInspector({ selection }) {
    return (
        <div className={styles.inspector}>
            {selection?.kind === 'relationship'
                ? <RelationshipEvidenceInspector selection={selection} />
                : selection?.kind === 'knowledge_point'
                    ? <KnowledgePointInspector point={selection.point} />
                    : <><span>关系依据</span><h2 id="learning-map-inspector-title">选择一条关系</h2><p>选择前置或解锁关系，即可查看它的理由、证据和课程标准对齐。</p></>}
        </div>
    )
}
