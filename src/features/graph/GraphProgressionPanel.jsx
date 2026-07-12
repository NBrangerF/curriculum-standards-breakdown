import { useState } from 'react'
import { copyToClipboard } from '../../data/query.js'
import styles from './SkillsGraphWorkspace.module.css'

const POSITION_LABELS = ['之前', '当前', '之后']

function ProgressionCard({ node, position, active }) {
    if (!node) {
        return (
            <li className={styles['is-empty']}>
                <span>{POSITION_LABELS[position]}</span>
                <strong>暂无显式关系</strong>
                <small>源数据未提供这一方向的学段进阶</small>
            </li>
        )
    }

    return (
        <li className={active ? styles['is-current'] : ''}>
            <span>{POSITION_LABELS[position]}</span>
            <strong>{node.meta?.code || node.label}</strong>
            <small>{node.meta?.gradeBand || '未标注学段'} · {node.label}</small>
        </li>
    )
}

export default function GraphProgressionPanel({ progression }) {
    const [copyState, setCopyState] = useState('idle')

    const copyLink = async () => {
        const copied = await copyToClipboard(window.location.href)
        setCopyState(copied ? 'success' : 'error')
        window.setTimeout(() => setCopyState('idle'), 1800)
    }

    if (!progression) {
        return (
            <section className={styles['graph-analysis-empty']} aria-labelledby="graph-progression-title">
                <h3 id="graph-progression-title">学段进阶</h3>
                <p>选择一条带有显式学段进阶关系的课程标准，即可查看“之前—当前—之后”。系统不会根据相似文本推断先修关系。</p>
            </section>
        )
    }

    return (
        <section className={styles['graph-progression-panel']} aria-labelledby="graph-progression-title">
            <div className={styles['graph-analysis-heading']}>
                <div>
                    <h3 id="graph-progression-title">学段进阶路径</h3>
                    <span>{progression.nodes.length} 个标准 · {progression.edges.length} 条显式关系</span>
                </div>
                <button type="button" onClick={copyLink}>
                    {copyState === 'success' ? '已复制' : copyState === 'error' ? '复制失败' : '复制路径链接'}
                </button>
            </div>

            <ol className={styles['graph-progression-triptych']} aria-label="之前、当前、之后">
                <ProgressionCard node={progression.before} position={0} />
                <ProgressionCard node={progression.current} position={1} active />
                <ProgressionCard node={progression.after} position={2} />
            </ol>

            <ol className={styles['graph-progression-sequence']} aria-label="完整学段进阶序列">
                {progression.nodes.map((node, index) => (
                    <li key={node.id} className={index === progression.currentIndex ? styles['is-current'] : ''}>
                        <span>{node.meta?.gradeBand || '—'}</span>
                        <div>
                            <strong>{node.meta?.code || node.label}</strong>
                            <small>{node.label}</small>
                        </div>
                    </li>
                ))}
            </ol>

            <footer className={styles['graph-progression-evidence']}>
                <span>关系来源</span>
                <strong>{progression.provenanceFields.join(' + ')}</strong>
                {progression.branchCount ? <small>另有 {progression.branchCount} 条分支未合并为推断顺序</small> : null}
            </footer>
        </section>
    )
}
