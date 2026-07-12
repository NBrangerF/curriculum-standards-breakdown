const TYPE_LABELS = {
    subject: '学科',
    domain: '领域',
    standard: '标准',
    skill: '能力'
}

const RELATION_LABELS = {
    contains: '结构包含',
    progression: '学段进阶',
    skill_alignment: '能力关联'
}

function displayValue(value) {
    return value || '—'
}

export default function GraphCompareOverlay({ summary }) {
    if (!summary.items.length) {
        return (
            <section className={styles['graph-analysis-empty']} aria-labelledby="graph-compare-title">
                <h3 id="graph-compare-title">关系对比</h3>
                <p>在 Inspector 中将实体加入对比，最多可以保留四个节点。</p>
            </section>
        )
    }

    return (
        <section className={styles['graph-compare-panel']} aria-labelledby="graph-compare-title">
            <div className={styles['graph-analysis-heading']}>
                <div>
                    <h3 id="graph-compare-title">关系对比</h3>
                    <span>{summary.items.length} 个实体</span>
                </div>
            </div>

            <div className={styles['graph-compare-table-wrap']}>
                <table className={styles['graph-compare-table']}>
                    <thead>
                        <tr>
                            <th scope="col">字段</th>
                            {summary.items.map(item => <th scope="col" key={item.node.id}>{item.node.meta?.code || item.node.label}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        <tr><th scope="row">类型</th>{summary.items.map(item => <td key={item.node.id}>{TYPE_LABELS[item.node.type]}</td>)}</tr>
                        <tr><th scope="row">学段</th>{summary.items.map(item => <td key={item.node.id}>{displayValue(item.node.meta?.gradeBand)}</td>)}</tr>
                        <tr><th scope="row">领域</th>{summary.items.map(item => <td key={item.node.id}>{displayValue(item.node.meta?.domain || (item.node.type === 'domain' ? item.node.label : ''))}</td>)}</tr>
                        <tr><th scope="row">直接关系</th>{summary.items.map(item => <td key={item.node.id}>{item.directRelationCount}</td>)}</tr>
                        <tr><th scope="row">关系类型</th>{summary.items.map(item => <td key={item.node.id}>{item.relationTypes.map(type => RELATION_LABELS[type] || type).join('、') || '—'}</td>)}</tr>
                    </tbody>
                </table>
            </div>

            <dl className={styles['graph-compare-difference']}>
                <div>
                    <dt>共同关系</dt>
                    <dd>{summary.commonRelationTypes.map(type => RELATION_LABELS[type] || type).join('、') || '无'}</dd>
                </div>
                <div>
                    <dt>差异关系</dt>
                    <dd>{summary.differingRelationTypes.map(type => RELATION_LABELS[type] || type).join('、') || '无'}</dd>
                </div>
            </dl>
        </section>
    )
}
import styles from './SkillsGraphWorkspace.module.css'
